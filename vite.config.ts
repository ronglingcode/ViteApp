import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

export default defineConfig(({ command }) => ({
    plugins: [
        // Dev-only: inject secrets into localStorage before the app boots.
        // Reads scripts/injectSecrets.js which is gitignored and must exist locally.
        {
            name: 'inject-secrets',
            apply: 'serve',
            transformIndexHtml() {
                const secretsPath = path.resolve(__dirname, 'scripts/injectSecrets.js');
                if (!fs.existsSync(secretsPath)) {
                    console.warn('[inject-secrets] scripts/injectSecrets.js not found — skipping secret injection.');
                    return [];
                }
                const code = fs.readFileSync(secretsPath, 'utf-8');
                return [
                    {
                        tag: 'script',
                        attrs: { type: 'text/javascript' },
                        children: code,
                        injectTo: 'head-prepend',
                    },
                ];
            },
        },
    ],
}));
