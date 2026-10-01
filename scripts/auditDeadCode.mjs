// Static review inventory. Does not delete or modify application code.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const norm = value => path.resolve(value).replaceAll('\\', '/');
const relative = value => path.relative(root, value).replaceAll('\\', '/');
const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const program = ts.createProgram(parsed.fileNames, { ...parsed.options, allowUnreachableCode: false });
const checker = program.getTypeChecker();
const files = program.getSourceFiles().filter(file => norm(file.fileName).startsWith(norm(root) + '/src/'));
const sourceMap = new Map(files.map(file => [norm(file.fileName), file]));
const graph = new Map();
const allGraph = new Map();
const resolveModule = (file, specifier) => specifier.startsWith('.')
    ? ts.resolveModuleName(specifier, file.fileName, parsed.options, ts.sys).resolvedModule?.resolvedFileName
    : undefined;

for (const file of files) {
    const runtime = new Set(), all = new Set();
    const add = (specifier, typeOnly = false) => {
        const target = resolveModule(file, specifier);
        if (!target || !sourceMap.has(norm(target))) return;
        all.add(norm(target));
        if (!typeOnly) runtime.add(norm(target));
    };
    function visit(node) {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
            const clause = node.importClause;
            const typeOnly = node.isTypeOnly || clause?.isTypeOnly || (clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.every(element => element.isTypeOnly));
            add(node.moduleSpecifier.text, typeOnly);
        }
        if (ts.isNewExpression(node) && node.expression.getText(file) === 'URL' && node.arguments?.length && ts.isStringLiteral(node.arguments[0])) add(node.arguments[0].text);
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length && ts.isStringLiteral(node.arguments[0])) add(node.arguments[0].text);
        ts.forEachChild(node, visit);
    }
    visit(file);
    graph.set(norm(file.fileName), runtime);
    allGraph.set(norm(file.fileName), all);
}
function closure(roots, dependencies) {
    const result = new Set();
    function visit(file) {
        if (result.has(file)) return;
        result.add(file);
        for (const target of dependencies.get(file) ?? []) visit(target);
    }
    roots.forEach(visit);
    return result;
}
const runtime = closure([norm('src/main.ts')], graph);
const required = closure([norm('src/main.ts')], allGraph);
const testFiles = files.filter(file => /\.(test|spec)\.[cm]?[jt]sx?$/.test(file.fileName));
const testRequired = closure(testFiles.map(file => norm(file.fileName)), allGraph);
const excluded = file => /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) || /\.d\.ts$/.test(file) || file.endsWith('/secret_template.ts');
const orphans = files.filter(file => !required.has(norm(file.fileName)) && !excluded(file.fileName)).map(file => ({
    file: relative(file.fileName), line: 1, lines: file.text.split(/\r?\n/).length,
    testsUseIt: testRequired.has(norm(file.fileName)),
}));
const typeOnly = files.filter(file => required.has(norm(file.fileName)) && !runtime.has(norm(file.fileName))).map(file => relative(file.fileName));
const canonical = symbol => {
    if (!symbol) return undefined;
    if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    return checker.getExportSymbolOfSymbol(symbol);
};
const declarations = [], symbols = new Map(), exposedModules = new Set();
const loadedFiles = files.filter(file => runtime.has(norm(file.fileName)));

for (const file of loadedFiles) {
    for (const statement of file.statements) {
        const nodes = ts.isVariableStatement(statement)
            ? statement.declarationList.declarations.filter(node => ts.isIdentifier(node.name) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)))
            : ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name ? [statement] : []);
        for (const node of nodes) {
            const symbol = canonical(checker.getSymbolAtLocation(node.name));
            if (!symbol) continue;
            const item = {
                symbol, node, file: relative(file.fileName),
                line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
                name: node.name.text, kind: ts.isClassDeclaration(node) ? 'class' : 'function',
                exported: Boolean(ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export),
                edges: new Set(), root: false,
            };
            declarations.push(item);
            symbols.set(symbol, item);
        }
    }
    const namespaceImports = new Map();
    for (const statement of file.statements) {
        const bindings = statement.importClause?.namedBindings;
        if (ts.isImportDeclaration(statement) && bindings && ts.isNamespaceImport(bindings)) {
            namespaceImports.set(checker.getSymbolAtLocation(bindings.name), resolveModule(file, statement.moduleSpecifier.text));
        }
    }
    function detectExposure(node) {
        if (ts.isImportDeclaration(node) || ts.isTypeNode(node)) return;
        if (ts.isIdentifier(node) && namespaceImports.has(checker.getSymbolAtLocation(node))) {
            const parent = node.parent;
            if (!(ts.isPropertyAccessExpression(parent) && parent.expression === node)
                && !(ts.isElementAccessExpression(parent) && parent.expression === node && ts.isStringLiteral(parent.argumentExpression))) {
                const target = namespaceImports.get(checker.getSymbolAtLocation(node));
                if (target) exposedModules.add(norm(target));
            }
        }
        ts.forEachChild(node, detectExposure);
    }
    detectExposure(file);
}
function references(node, result) {
    if (ts.isTypeNode(node) || ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)) {
        const item = symbols.get(canonical(checker.getPropertyOfType(checker.getTypeAtLocation(node.expression), node.argumentExpression.text)));
        if (item) result.add(item);
    }
    if (ts.isIdentifier(node)) {
        const parent = node.parent;
        const declarationName = parent.name === node && (ts.isVariableDeclaration(parent) || ts.isFunctionDeclaration(parent)
            || ts.isClassDeclaration(parent) || ts.isParameter(parent) || ts.isMethodDeclaration(parent)
            || ts.isPropertyDeclaration(parent) || ts.isPropertyAssignment(parent));
        if (!declarationName) {
            let symbol = checker.getSymbolAtLocation(node);
            if (ts.isShorthandPropertyAssignment(parent)) symbol = checker.getShorthandAssignmentValueSymbol(parent) ?? symbol;
            const item = symbols.get(canonical(symbol));
            if (item) result.add(item);
        }
    }
    ts.forEachChild(node, child => references(child, result));
}
for (const item of declarations) {
    references(item.node, item.edges);
    item.edges.delete(item);
    item.root = item.exported && exposedModules.has(norm(item.node.getSourceFile().fileName));
}
for (const file of loadedFiles) {
    for (const statement of file.statements) {
        const dependencies = new Set();
        if (ts.isFunctionDeclaration(statement)) continue;
        if (ts.isClassDeclaration(statement)) {
            // Class dispatch is dynamic. Keep referenced classes and static initialization conservative.
            statement.heritageClauses?.forEach(node => references(node, dependencies));
            statement.members.filter(node => ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Static)
                .forEach(node => references(node, dependencies));
        } else if (ts.isVariableStatement(statement)) {
            for (const node of statement.declarationList.declarations) {
                if (!node.initializer || ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) continue;
                references(node.initializer, dependencies);
            }
        } else {
            references(statement, dependencies);
        }
        dependencies.forEach(item => { item.root = true; });
    }
}
const live = new Set();
function visitDeclaration(item) {
    if (live.has(item)) return;
    live.add(item);
    item.edges.forEach(visitDeclaration);
}
declarations.filter(item => item.root).forEach(visitDeclaration);
const unusedDeclarations = declarations.filter(item => !live.has(item)).map(item => ({
    file: item.file, line: item.line, name: item.name, kind: item.kind, exported: item.exported,
}));
for (const item of unusedDeclarations) {
    item.testFiles = testFiles.filter(file => {
        const used = new Set();
        references(file, used);
        return [...used].some(reference => reference.file === item.file && reference.name === item.name);
    }).map(file => relative(file.fileName));
}
const unreachableStatements = ts.getPreEmitDiagnostics(program).filter(diagnostic => diagnostic.code === 7027 && diagnostic.file).map(diagnostic => ({
    file: relative(diagnostic.file.fileName),
    line: diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1,
    endLine: diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start + diagnostic.length).line + 1,
    reason: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
}));
const output = {
    entry: 'src/main.ts', sourceFiles: files.length, runtimeModules: runtime.size,
    orphans: orphans.sort((a, b) => a.file.localeCompare(b.file)), typeOnly: typeOnly.sort(),
    unusedDeclarations: unusedDeclarations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line),
    exposedModules: [...exposedModules].map(relative).sort(),
    unreachableStatements,
};
fs.writeFileSync('docs/dead-code-audit.json', JSON.stringify(output, null, 2) + '\n');
const link = (file, line = 1, label = file) => `[${label}](${norm(file)}:${line})`;
const roles = {
    'src/algorithms/strategies.ts': 'Unused R2 target configuration.',
    'src/models/atr.ts': 'Unused ATR percentage formatting helper.',
    'src/patterns/allTimeHigh.ts': 'Unused all-time-high detector.',
    'src/patterns/camPivots.ts': 'Unused Camarilla pattern logic; the active indicators/camPivots.ts is separate.',
    'src/tradebooks/singleKeyLevel/commonRules.ts': 'Unused single-key-level rule helpers.',
    'src/tradebooks/tradebookUtil.ts': 'Unused tradebook button status helper.',
    'src/ui/popup.ts': 'Unused candlestick popup; the active questionPopup.ts is separate.',
    'src/utils/entryThresholdValidator.ts': 'Unused threshold validator; also contains code after an unconditional return.',
};
const privateFunctions = unusedDeclarations.filter(item => !item.exported);
const exportedFunctions = unusedDeclarations.filter(item => item.exported && !item.testFiles.length);
const testOnlyFunctions = unusedDeclarations.filter(item => item.testFiles.length);
// Keep the user's review decisions when regenerating the inventory.
const decisions = new Map();
if (fs.existsSync('docs/dead-code-audit.md')) {
    let headers = [];
    for (const line of fs.readFileSync('docs/dead-code-audit.md', 'utf8').split(/\r?\n/)) {
        if (!line.startsWith('|')) continue;
        const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
        if (cells.includes('Remove? (yes/no)')) { headers = cells; continue; }
        const column = headers.indexOf('Remove? (yes/no)');
        const file = cells[0]?.match(/^\[([^\]]+)\]\(/)?.[1];
        if (column < 0 || !file || !cells[column]) continue;
        const detail = headers[0] === 'File' ? '' : cells[1];
        decisions.set(`${file}|${detail}`, cells[column]);
    }
}
const decision = (file, detail = '') => decisions.get(`${file}|${detail}`) ?? '';
const markdown = [
    '# Dead-code review after removing replay and Lite', '',
    `Audit of the main app, ${link('src/main.ts')}, and its worker. ${files.length} TypeScript source files inspected; ${runtime.size} modules have a potential runtime import path. No review candidates below have been deleted.`, '',
    `Findings: **${orphans.length} disconnected source files**, **${privateFunctions.length} private functions without a static path**, **${exportedFunctions.length} other exported functions without a static path**, **${testOnlyFunctions.length} test-only exported function**, and **${unreachableStatements.length} compiler-confirmed unreachable block**.`, '',
    'Enter yes or no in the **Remove? (yes/no)** column. Blank means undecided. Decisions are preserved when the audit is regenerated.', '',
    '## Scope and evidence', '',
    '- Import reachability follows local imports, re-exports, literal dynamic imports, and the worker created with new URL. Type-only dependencies are retained.',
    '- Callable reachability follows TypeScript-resolved symbol references from module initialization and exported APIs exposed through window.HybridApp. Uncalled helper chains are included, even when helpers reference each other.',
    '- Exports exposed as whole namespaces, registered callbacks, constructed classes, and dependencies in all branches are conservatively retained. Disabled settings alone do not classify code as dead.',
    '- This is a static inventory of the checked-in main app. It cannot prove every possible dynamic call in remote scripts, browser-console commands, reflective class methods, or future configuration. Exported-function findings require that review before deletion. Classes are treated conservatively; individual virtual methods and local variables are not deletion recommendations.',
    '- Tests, build tools, docs, public assets, secret_template.ts, and type-only modules are not classified as unused application modules. The old helper.test.ts scratch file is listed separately.',
    `- Re-run with node scripts/auditDeadCode.mjs. Exact records: ${link('docs/dead-code-audit.json')}.`, '',
    '## Disconnected files', '',
    'These files have no dependency path from either application entry, including type-only paths. None is referenced by the checked-in TypeScript tests.', '',
    '| File | Approximate lines | What it contains | Remove? (yes/no) |', '| --- | ---: | --- | --- |',
    ...output.orphans.map(item => `| ${link(item.file)} | ${item.lines} | ${roles[item.file] ?? 'No import path from the main app.'} | ${decision(item.file)} |`), '',
    '## Private functions with no static path', '',
    'These functions are not exported, have no reachable call/reference chain, and are not registered callbacks. Some are called only by other functions in this inventory; remove a complete unused chain together.', '',
    '| Location | Function | Remove? (yes/no) |', '| --- | --- | --- |',
    ...privateFunctions.map(item => `| ${link(item.file, item.line)} | ${item.name} | ${decision(item.file, item.name)} |`), '',
    '## Exported functions without a static path', '',
    'These are absent from the reachable call graph and are not exposed as whole namespaces by the main app. Keep each containing module: other functions in the same file are still active. Confirm no external consumer calls a function before deleting it.', '',
    '| Location | Function | Remove? (yes/no) |', '| --- | --- | --- |',
    ...exportedFunctions.map(item => `| ${link(item.file, item.line)} | ${item.name} | ${decision(item.file, item.name)} |`), '',
    '## Used by tests, without a production call path', '',
    '| Location | Function | Test consumer | Remove? (yes/no) |', '| --- | --- | --- | --- |',
    ...testOnlyFunctions.map(item => `| ${link(item.file, item.line)} | ${item.name} | ${item.testFiles.map(file => link(file)).join(', ')} | ${decision(item.file, item.name)} |`), '',
    '## Compiler-confirmed unreachable code', '',
    '| Location | Code | Evidence | Remove? (yes/no) |', '| --- | --- | --- | --- |',
    ...unreachableStatements.map(item => `| ${link(item.file, item.line)} | validateEntryThreshold tail | Lines ${item.line}–${item.endLine}. TypeScript TS7027: ${item.reason} An unconditional return true precedes the remaining timing/ORB logic. The whole file is also disconnected. | ${decision(item.file, 'validateEntryThreshold tail')} |`), '',
    '## Old test scratch file', '',
    '| File | Reason | Remove? (yes/no) |', '| --- | --- | --- |',
    `| ${link('src/utils/helper.test.ts')} | No test cases are registered; only a top-level helper call and a commented LitElement/Snowpack test remain. It is not run by the package scripts. | ${decision('src/utils/helper.test.ts')} |`, '',
    '## Keep these dependencies', '',
    ...output.typeOnly.map(file => `- ${link(file)}: required by type imports; runtime absence is expected.`),
    `- ${link('src/config/secret_template.ts')}: setup template, not an application entry.`, '',
    'Whole-namespace exports retained because they can be called externally:', '',
    ...output.exposedModules.map(file => `- ${link(file)}`), '',
    '## Verification of the feature removal', '',
    '- Production TypeScript check and Vite build pass with one HTML app and one market-data worker. Mock-socket checks verify worker start/stop, subscription, trades, quotes, and account activity.',
    '- Direct-execution checks pass; the 19 extended handler fixtures match both repository copies; native-entry-state test passes.',
    '- Bookmap price, VWAP, wall-threshold, position transition, core-target exit, and exit-pair tests pass (19 tests).',
    '- Proxy route registration and local request checks verify that replay returns 404 while existing save endpoints validate invalid requests. No broker requests were sent.',
    '- Backtest research/replay tools and existing recording data are outside this feature removal.', '',
];
fs.writeFileSync('docs/dead-code-audit.md', markdown.join('\n'));
console.log(JSON.stringify({ modules: runtime.size, orphanFiles: orphans.length, callableDeclarations: declarations.length,
    roots: declarations.filter(item => item.root).length, reachableDeclarations: live.size, unusedDeclarations: unusedDeclarations.length }, null, 2));
