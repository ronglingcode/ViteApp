import * as Models from '../models/models';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as TradingState from '../models/tradingState';
import { TradebookID } from '../tradebooks/tradebookIds';
import * as GlobalSettings from '../config/globalSettings';
import {
    getFieldHint,
    getFieldWidth,
    getOptionsForSide,
    getSetupLabel,
    getTemplates,
} from './managementCardConfig';
import type {
    ManagementFieldWidth,
    ManagementSetupId,
    ManagementSide,
    ManagementTemplate,
} from './managementCardConfig';

interface ManagementDraft {
    symbol: string,
    side: ManagementSide,
    setupId?: ManagementSetupId,
    tradebookID?: string,
    wallPrice?: string,
    wallSize?: string,
    wall1Price?: string,
    wall1Size?: string,
    wall2Price?: string,
    wall2Size?: string,
    swingLow?: string,
    swingHigh?: string,
    originalOfferPrice?: string,
    originalSize?: string,
    originalOfferSize?: string,
    reappearedOfferSize?: string,
    runnerCount?: string,
    coreCount?: string,
    coreTarget?: string,
    runnerTarget?: string,
    runnerTriggerCondition?: string,
    activeTemplateId?: string,
    committed?: boolean,
    updatedAt: string,
}

interface ManagementSelection {
    symbol: string,
    side: ManagementSide,
    setupId: ManagementSetupId,
    updatedAt: string,
}

interface RequiredDraftField {
    fieldName: keyof ManagementDraft,
    label: string,
}

export interface ManagementPositionContext {
    symbol: string,
    position?: Models.Position,
    tradebookID?: string,
}

// Maps a broker position quantity to the management side.
const getSide = (position: Models.Position): ManagementSide => {
    return position.netQuantity > 0 ? 'long' : 'short';
};

// Checks whether the trading plan allows management for this side.
const isSideEnabled = (symbol: string, side: ManagementSide) => {
    try {
        let plan = TradingPlans.getTradingPlans(symbol);
        let sidePlan = side === 'long' ? plan.long : plan.short;
        return sidePlan.enabled !== false;
    } catch (e) {
        return true;
    }
};

// Builds the per-symbol, per-side, per-setup storage key for editable card fields.
const getDraftStorageKey = (symbol: string, side: ManagementSide, setupId: ManagementSetupId) => {
    return `trade-management:${symbol}:${side}:${setupId}`;
};

// Builds the storage key for the currently selected setup for a symbol.
const getSelectionStorageKey = (symbol: string) => {
    return `trade-management:${symbol}:selected`;
};

// Builds the storage key for a symbol card's collapsed state.
const getCollapseStorageKey = (symbol: string) => {
    return `trade-management:${symbol}:collapsed`;
};

// Infers the management setup from the submitted tradebook id.
const getSetupIdFromTradebookID = (tradebookID: string | undefined): ManagementSetupId | undefined => {
    if (!tradebookID) {
        return undefined;
    }
    if (tradebookID === TradebookID.GapAndGoBookmapOfferWallBreakout ||
        tradebookID === TradebookID.GapDownAndGoUpBookmapOfferWallBreakout) {
        return 'bookmap_offer_breakout';
    }
    if (tradebookID === TradebookID.GapGiveAndGoBookmapReversal ||
        tradebookID === TradebookID.GapDownAndGoUpBookmapReversal) {
        return 'bookmap_bid_reappear';
    }
    if (tradebookID === TradebookID.GapAndCrapBookmapBidWallBreakdown ||
        tradebookID === TradebookID.GapAndCrapBreakdownBidSwingLow ||
        tradebookID === TradebookID.GapDownAndGoDownBookmapBidWallBreakdown ||
        tradebookID === TradebookID.GapDownAndGoDownBreakdownBidSwingLow) {
        return 'bookmap_bid_breakdown';
    }
    if (tradebookID === TradebookID.GapAndCrapOfferStepDownReappear ||
        tradebookID === TradebookID.GapDownAndGoDownOfferStepDownReappear) {
        return 'bookmap_offer_reappear';
    }
    return undefined;
};

// Loads saved editable field values for one symbol/side/setup card.
const loadDraft = (symbol: string, side: ManagementSide, setupId: ManagementSetupId): ManagementDraft | undefined => {
    try {
        let raw = window.localStorage.getItem(getDraftStorageKey(symbol, side, setupId));
        if (!raw) {
            return undefined;
        }
        return JSON.parse(raw) as ManagementDraft;
    } catch (e) {
        return undefined;
    }
};

// Loads the last selected setup for a symbol.
const loadSelection = (symbol: string): ManagementSelection | undefined => {
    try {
        let raw = window.localStorage.getItem(getSelectionStorageKey(symbol));
        if (!raw) {
            return undefined;
        }
        return JSON.parse(raw) as ManagementSelection;
    } catch (e) {
        return undefined;
    }
};

// Persists the selected side/setup that should be visible for a symbol.
const saveSelection = (selection: ManagementSelection) => {
    try {
        window.localStorage.setItem(getSelectionStorageKey(selection.symbol), JSON.stringify(selection));
    } catch (e) {
    }
};

// Loads whether a symbol's management card is collapsed.
const loadCollapsed = (symbol: string) => {
    try {
        return window.localStorage.getItem(getCollapseStorageKey(symbol)) === 'true';
    } catch (e) {
        return false;
    }
};

// Persists whether a symbol's management card is collapsed.
const saveCollapsed = (symbol: string, isCollapsed: boolean) => {
    try {
        window.localStorage.setItem(getCollapseStorageKey(symbol), String(isCollapsed));
    } catch (e) {
    }
};

// Persists editable card values for one symbol/side/setup draft.
const saveDraft = (draft: ManagementDraft) => {
    if (!draft.setupId) {
        return;
    }
    try {
        window.localStorage.setItem(getDraftStorageKey(draft.symbol, draft.side, draft.setupId), JSON.stringify(draft));
    } catch (e) {
    }
};

// Creates a lightweight position object for rendering a specific side before a real position exists.
const getPositionForSide = (symbol: string, side: ManagementSide, averagePrice: number): Models.Position => {
    return {
        symbol: symbol,
        averagePrice: averagePrice,
        netQuantity: side === 'long' ? 1 : -1,
    };
};

// Returns the active submitted plan for a live trade, when one exists.
const getActiveTradeStatePlan = (symbol: string, isLong: boolean) => {
    let breakoutTradeState = TradingState.getBreakoutTradeState(symbol, isLong);
    if (!breakoutTradeState || !breakoutTradeState.hasValue) {
        return undefined;
    }
    return breakoutTradeState.plan;
};

// Picks the first available base plan from a prioritized plan list.
const getFirstPlan = (plans: (TradingPlansModels.BasePlan | undefined)[]) => {
    return plans.find(plan => plan !== undefined);
};

// Finds the best trading-plan default for a setup when there is no active trade state.
const getTradingPlanDefault = (symbol: string, setupId: ManagementSetupId | undefined) => {
    try {
        let plan = TradingPlans.getTradingPlans(symbol);
        if (!setupId || !plan) {
            return undefined;
        }
        if (setupId === 'bookmap_offer_breakout') {
            return getFirstPlan([plan.long.gapAndGoPlan, plan.long.gapDownAndGoUpPlan]);
        }
        if (setupId === 'bookmap_bid_step_up' || setupId === 'bookmap_bid_reappear') {
            return getFirstPlan([plan.long.gapGiveAndGoPlan, plan.long.gapDownAndGoUpPlan, plan.long.gapAndGoPlan]);
        }
        if (setupId === 'bookmap_bid_breakdown') {
            return getFirstPlan([plan.short.gapAndCrapPlan, plan.short.gapDownAndGoDownPlan]);
        }
        return getFirstPlan([plan.short.gapAndCrapPlan, plan.short.gapDownAndGoDownPlan]);
    } catch (e) {
        return undefined;
    }
};

// Chooses active trade-state defaults first, then static trading-plan defaults.
const getDefaultPlan = (symbol: string, isLong: boolean, setupId: ManagementSetupId | undefined) => {
    return getActiveTradeStatePlan(symbol, isLong) ?? getTradingPlanDefault(symbol, setupId);
};

// Converts optional numeric plan values into editable text-box values.
const numberToDraftValue = (value: number | undefined) => {
    if (value === undefined) {
        return '';
    }
    return String(value);
};

// Returns true for setup cards that need original/reappeared wall fields.
const hasReappearFields = (setupId: ManagementSetupId | undefined) => {
    return setupId === 'bookmap_offer_reappear' || setupId === 'bookmap_bid_reappear';
};

// Returns true for wall-break setups that need wall context fields.
const hasWallBreakFields = (setupId: ManagementSetupId | undefined) => {
    return setupId === 'bookmap_offer_breakout' || setupId === 'bookmap_bid_breakdown';
};

// Returns true for wall-step setups that need first/second wall fields.
const hasWallStepFields = (setupId: ManagementSetupId | undefined) => {
    return setupId === 'bookmap_bid_step_up' || setupId === 'bookmap_offer_step_down';
};

// Lists the fields that must be filled before the setup can be committed.
const getRequiredDraftFields = (setupId: ManagementSetupId | undefined): RequiredDraftField[] => {
    let fields: RequiredDraftField[] = [];
    if (hasWallBreakFields(setupId)) {
        fields.push(
            { fieldName: 'wallPrice', label: 'Wall price' },
            { fieldName: 'wallSize', label: 'Wall size' },
        );
        if (setupId === 'bookmap_offer_breakout') {
            fields.push({ fieldName: 'swingLow', label: 'Swing low' });
        }
        if (setupId === 'bookmap_bid_breakdown') {
            fields.push({ fieldName: 'swingHigh', label: 'Swing high' });
        }
    }
    if (hasWallStepFields(setupId)) {
        fields.push(
            { fieldName: 'wall1Price', label: 'Wall 1 price' },
            { fieldName: 'wall1Size', label: 'Wall 1 size' },
            { fieldName: 'wall2Price', label: 'Wall 2 price' },
            { fieldName: 'wall2Size', label: 'Wall 2 size' },
        );
    }
    if (hasReappearFields(setupId)) {
        fields.push(
            { fieldName: 'originalOfferPrice', label: 'Original price' },
            { fieldName: 'originalSize', label: 'Original size' },
            { fieldName: 'reappearedOfferSize', label: 'Reappeared size' },
        );
    }
    fields.push(
        { fieldName: 'coreCount', label: 'Core count' },
        { fieldName: 'coreTarget', label: 'Core target' },
        { fieldName: 'runnerCount', label: 'Runner count' },
        { fieldName: 'runnerTarget', label: 'Runner target' },
        { fieldName: 'runnerTriggerCondition', label: 'Runner trigger condition' },
    );
    return fields;
};

// Returns human-readable labels for fields that are blank.
const getMissingRequiredFieldLabels = (draft: ManagementDraft) => {
    return getRequiredDraftFields(draft.setupId)
        .filter(field => String(draft[field.fieldName] ?? '').trim() === '')
        .map(field => field.label);
};

// Creates a complete draft by merging saved values with available plan defaults.
const createDraft = (
    position: Models.Position,
    setupId: ManagementSetupId | undefined,
    existingDraft?: ManagementDraft,
    tradebookID?: string,
): ManagementDraft => {
    let side = getSide(position);
    let isLong = side === 'long';
    let defaultPlan = getDefaultPlan(position.symbol, isLong, setupId);
    return {
        symbol: position.symbol,
        side: side,
        setupId: setupId,
        tradebookID: tradebookID,
        wallPrice: existingDraft?.wallPrice ?? '',
        wallSize: existingDraft?.wallSize ?? '',
        wall1Price: existingDraft?.wall1Price ?? '',
        wall1Size: existingDraft?.wall1Size ?? '',
        wall2Price: existingDraft?.wall2Price ?? '',
        wall2Size: existingDraft?.wall2Size ?? '',
        swingLow: existingDraft?.swingLow ?? '',
        swingHigh: existingDraft?.swingHigh ?? '',
        originalOfferPrice: existingDraft?.originalOfferPrice ?? '',
        originalSize: existingDraft?.originalSize ?? existingDraft?.originalOfferSize ?? '',
        reappearedOfferSize: existingDraft?.reappearedOfferSize ?? '',
        runnerCount: existingDraft?.runnerCount ?? numberToDraftValue(defaultPlan?.runnerCount),
        coreCount: existingDraft?.coreCount ?? numberToDraftValue(defaultPlan?.coreCount),
        coreTarget: existingDraft?.coreTarget ?? numberToDraftValue(defaultPlan?.coreTarget),
        runnerTarget: existingDraft?.runnerTarget ?? '',
        runnerTriggerCondition: existingDraft?.runnerTriggerCondition ?? 'vwap bounce fail',
        activeTemplateId: existingDraft?.activeTemplateId,
        committed: existingDraft?.committed ?? false,
        updatedAt: new Date().toISOString(),
    };
};

// Appends a simple text div and returns it for follow-up customization.
const appendText = (root: HTMLElement, text: string, className?: string) => {
    let div = document.createElement('div');
    div.textContent = text;
    if (className) {
        div.className = className;
    }
    root.appendChild(div);
    return div;
};

// Renders setup selection buttons for one side and saves the user's chosen setup.
const renderSetupChooser = (
    position: Models.Position,
    side: ManagementSide,
    draft: ManagementDraft | undefined,
    tradebookID: string | undefined,
    root: HTMLElement,
    rerender: () => void,
) => {
    let chooser = document.createElement('div');
    chooser.className = 'managementSetupChooser';
    root.appendChild(chooser);

    getOptionsForSide(side).forEach(option => {
        let button = document.createElement('button');
        button.type = 'button';
        button.className = 'managementSetupButton';
        if (draft?.setupId === option.id) {
            button.classList.add('active');
        }
        button.textContent = option.label;
        button.addEventListener('click', () => {
            saveSelection({
                symbol: position.symbol,
                side: side,
                setupId: option.id,
                updatedAt: new Date().toISOString(),
            });
            let latestDraft = loadDraft(position.symbol, side, option.id);
            let nextDraft = createDraft(getPositionForSide(position.symbol, side, position.averagePrice), option.id, latestDraft, tradebookID);
            saveDraft(nextDraft);
            rerender();
        });
        chooser.appendChild(button);
    });
};

// Renders one editable text input with optional hint text and width behavior.
const renderInput = (
    root: HTMLElement,
    labelText: string,
    value: string,
    hintText: string | undefined,
    fieldWidth: ManagementFieldWidth,
    onValueChange: (value: string) => void,
) => {
    let label = document.createElement('label');
    label.className = fieldWidth === 'short' ? 'managementField short' : 'managementField long';
    root.appendChild(label);

    let span = document.createElement('span');
    span.textContent = labelText;
    label.appendChild(span);

    let fieldBody = document.createElement('div');
    fieldBody.className = 'managementFieldBody';
    label.appendChild(fieldBody);

    let input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.addEventListener('input', () => {
        onValueChange(input.value);
    });
    fieldBody.appendChild(input);

    if (hintText) {
        let hint = document.createElement('div');
        hint.className = 'managementFieldHint';
        hint.textContent = hintText;
        fieldBody.appendChild(hint);
    }
};

// Renders quick template buttons and applies the clicked template through a callback.
const renderTemplates = (
    root: HTMLElement,
    setupId: ManagementSetupId | undefined,
    activeTemplateId: string | undefined,
    onApplyTemplate: (template: ManagementTemplate) => void,
) => {
    let templates = getTemplates(setupId);
    if (templates.length === 0) {
        return;
    }

    let templateList = document.createElement('div');
    templateList.className = 'managementTemplateList';
    root.appendChild(templateList);

    templates.forEach(template => {
        let button = document.createElement('button');
        button.type = 'button';
        button.className = 'managementTemplateButton';
        if (template.id === activeTemplateId) {
            button.classList.add('active');
        }
        button.textContent = template.title;
        button.addEventListener('click', () => onApplyTemplate(template));
        templateList.appendChild(button);
    });
};

// Renders the selected setup's editable management fields and template controls.
const renderManagementSetupCard = (draft: ManagementDraft, root: HTMLElement, rerenderSection: () => void) => {
    let form = document.createElement('div');
    form.className = 'managementForm';
    root.appendChild(form);

    appendText(form, getSetupLabel(draft.setupId ?? 'bookmap_offer_reappear'), 'managementCardTitle');

    let currentDraft = draft;
    // Updates a single draft field while preserving the rest of the card state.
    const updateDraftField = (fieldName: keyof ManagementDraft, value: string) => {
        currentDraft = {
            ...currentDraft,
            [fieldName]: value,
            updatedAt: new Date().toISOString(),
        };
        saveDraft(currentDraft);
    };

    renderTemplates(form, draft.setupId, draft.activeTemplateId, template => {
        currentDraft = {
            ...currentDraft,
            ...template.values,
            activeTemplateId: template.id,
            updatedAt: new Date().toISOString(),
        };
        saveDraft(currentDraft);
        rerenderSection();
    });

    if (hasWallBreakFields(draft.setupId)) {
        renderInput(form, 'Wall price', draft.wallPrice ?? '',
            getFieldHint(draft.setupId, 'wallPrice'), getFieldWidth(draft.setupId, 'wallPrice'),
            value => updateDraftField('wallPrice', value));
        renderInput(form, 'Wall size', draft.wallSize ?? '',
            getFieldHint(draft.setupId, 'wallSize'), getFieldWidth(draft.setupId, 'wallSize'),
            value => updateDraftField('wallSize', value));
        if (draft.setupId === 'bookmap_offer_breakout') {
            renderInput(form, 'Swing low', draft.swingLow ?? '',
                getFieldHint(draft.setupId, 'swingLow'), getFieldWidth(draft.setupId, 'swingLow'),
                value => updateDraftField('swingLow', value));
        }
        if (draft.setupId === 'bookmap_bid_breakdown') {
            renderInput(form, 'Swing high', draft.swingHigh ?? '',
                getFieldHint(draft.setupId, 'swingHigh'), getFieldWidth(draft.setupId, 'swingHigh'),
                value => updateDraftField('swingHigh', value));
        }
    }
    if (hasWallStepFields(draft.setupId)) {
        renderInput(form, 'Wall 1 price', draft.wall1Price ?? '',
            getFieldHint(draft.setupId, 'wall1Price'), getFieldWidth(draft.setupId, 'wall1Price'),
            value => updateDraftField('wall1Price', value));
        renderInput(form, 'Wall 1 size', draft.wall1Size ?? '',
            getFieldHint(draft.setupId, 'wall1Size'), getFieldWidth(draft.setupId, 'wall1Size'),
            value => updateDraftField('wall1Size', value));
        renderInput(form, 'Wall 2 price', draft.wall2Price ?? '',
            getFieldHint(draft.setupId, 'wall2Price'), getFieldWidth(draft.setupId, 'wall2Price'),
            value => updateDraftField('wall2Price', value));
        renderInput(form, 'Wall 2 size', draft.wall2Size ?? '',
            getFieldHint(draft.setupId, 'wall2Size'), getFieldWidth(draft.setupId, 'wall2Size'),
            value => updateDraftField('wall2Size', value));
    }
    if (hasReappearFields(draft.setupId)) {
        renderInput(form, 'Original price', draft.originalOfferPrice ?? '',
            getFieldHint(draft.setupId, 'originalOfferPrice'), getFieldWidth(draft.setupId, 'originalOfferPrice'),
            value => updateDraftField('originalOfferPrice', value));
        renderInput(form, 'Original size', draft.originalSize ?? draft.originalOfferSize ?? '',
            getFieldHint(draft.setupId, 'originalSize'), getFieldWidth(draft.setupId, 'originalSize'),
            value => updateDraftField('originalSize', value));
        renderInput(form, 'Reappeared size', draft.reappearedOfferSize ?? '',
            getFieldHint(draft.setupId, 'reappearedOfferSize'), getFieldWidth(draft.setupId, 'reappearedOfferSize'),
            value => updateDraftField('reappearedOfferSize', value));
    }
    renderInput(form, 'Core count', draft.coreCount ?? '',
        getFieldHint(draft.setupId, 'coreCount'), getFieldWidth(draft.setupId, 'coreCount'),
        value => updateDraftField('coreCount', value));
    renderInput(form, 'Core target', draft.coreTarget ?? '',
        getFieldHint(draft.setupId, 'coreTarget'), getFieldWidth(draft.setupId, 'coreTarget'),
        value => updateDraftField('coreTarget', value));
    renderInput(form, 'Runner count', draft.runnerCount ?? '',
        getFieldHint(draft.setupId, 'runnerCount'), getFieldWidth(draft.setupId, 'runnerCount'),
        value => updateDraftField('runnerCount', value));
    renderInput(form, 'Runner target', draft.runnerTarget ?? '',
        getFieldHint(draft.setupId, 'runnerTarget'), getFieldWidth(draft.setupId, 'runnerTarget'),
        value => updateDraftField('runnerTarget', value));
    renderInput(form, 'Runner trigger condition', draft.runnerTriggerCondition ?? '',
        getFieldHint(draft.setupId, 'runnerTriggerCondition'), getFieldWidth(draft.setupId, 'runnerTriggerCondition'),
        value => updateDraftField('runnerTriggerCondition', value));

    let commitButton = document.createElement('button');
    commitButton.type = 'button';
    commitButton.className = 'managementCommitButton';
    form.appendChild(commitButton);

    let commitMessage = document.createElement('div');
    commitMessage.className = 'managementCommitMessage';
    form.appendChild(commitMessage);

    // Updates button copy and styling from the current draft commit state.
    const updateCommitButton = () => {
        let isCommitted = currentDraft.committed === true;
        commitButton.textContent = isCommitted ? 'Uncommit' : 'Commit';
        commitButton.classList.toggle('committed', isCommitted);
    };

    commitButton.addEventListener('click', () => {
        let nextCommitted = currentDraft.committed !== true;
        if (nextCommitted) {
            let missingFields = getMissingRequiredFieldLabels(currentDraft);
            if (missingFields.length > 0) {
                commitMessage.textContent = `Fill in before commit: ${missingFields.join(', ')}`;
                return;
            }
        }
        currentDraft = {
            ...currentDraft,
            committed: nextCommitted,
            updatedAt: new Date().toISOString(),
        };
        commitMessage.textContent = '';
        if (currentDraft.setupId) {
            saveSelection({
                symbol: currentDraft.symbol,
                side: currentDraft.side,
                setupId: currentDraft.setupId,
                updatedAt: currentDraft.updatedAt,
            });
        }
        saveDraft(currentDraft);
        updateCommitButton();
    });
    updateCommitButton();
};

// Returns true only when the selected management draft for the active side is committed.
export const isExitAdjustmentCommitted = (symbol: string, isLong: boolean) => {
    let side: ManagementSide = isLong ? 'long' : 'short';
    let selection = loadSelection(symbol);
    if (!selection || selection.side !== side) {
        return false;
    }
    let draft = loadDraft(symbol, side, selection.setupId);
    return draft?.committed === true;
};

// Returns a blocking rule result when committed management is required but missing.
export const getDisallowedReasonToAdjustExitOrders = (symbol: string, isLong: boolean): Models.CheckRulesResult | null => {
    if (!GlobalSettings.blockExitAdjustmentsWithoutCommittedTradeManagementCard) {
        return null;
    }
    if (isExitAdjustmentCommitted(symbol, isLong)) {
        return null;
    }
    return {
        allowed: false,
        reason: "trade management card is not committed",
    };
};

// Creates each stable watchlist card once, then updates position-driven visibility.
export const render = (root: HTMLElement, contexts: ManagementPositionContext[]) => {
    let shell = getOrCreateShell(root);
    contexts.forEach(context => {
        let container = getOrCreateCardContainer(shell, context.symbol);
        if (!container.dataset.rendered) {
            renderCardContents(container, context);
            container.dataset.rendered = 'true';
        }
        updateCardPositionState(container, context);
    });
};

// Compatibility wrapper for rendering a single positioned symbol.
export const populateForPosition = (position: Models.Position, root: HTMLElement, tradebookID?: string) => {
    render(root, [{ symbol: position.symbol, position: position, tradebookID: tradebookID }]);
};

// Seeds a mock short position so the Test popup button can exercise the card UI.
export const populateMockForTest = (root: HTMLElement) => {
    let mockPosition: Models.Position = {
        symbol: 'TEST',
        averagePrice: 100,
        netQuantity: -100,
    };
    let mockDraft: ManagementDraft = {
        symbol: mockPosition.symbol,
        side: 'short',
        setupId: 'bookmap_offer_reappear',
        tradebookID: TradebookID.GapAndCrapOfferStepDownReappear,
        originalOfferPrice: '',
        originalSize: '',
        reappearedOfferSize: '',
        runnerCount: '3',
        coreCount: '2',
        coreTarget: '98.50',
        runnerTarget: '',
        runnerTriggerCondition: 'vwap bounce fail',
        committed: false,
        updatedAt: new Date().toISOString(),
    };
    saveDraft(mockDraft);
    saveSelection({
        symbol: mockPosition.symbol,
        side: 'short',
        setupId: 'bookmap_offer_reappear',
        updatedAt: new Date().toISOString(),
    });
    render(root, [{ symbol: mockPosition.symbol, position: mockPosition, tradebookID: TradebookID.GapAndCrapOfferStepDownReappear }]);
};

// Returns the persistent card shell, creating it when the section is first rendered.
const getOrCreateShell = (root: HTMLElement) => {
    let shell = root.querySelector('#tradeManagementCards') as HTMLElement | null;
    if (shell) {
        return shell;
    }
    shell = document.createElement('div');
    shell.id = 'tradeManagementCards';
    root.appendChild(shell);
    return shell;
};

// Finds an existing symbol card or creates it on the first render.
const getOrCreateCardContainer = (root: HTMLElement, symbol: string) => {
    let existingCard = Array.from(root.querySelectorAll<HTMLElement>('.managementCard'))
        .find(card => card.dataset.symbol === symbol);
    if (existingCard) {
        return existingCard;
    }
    let container = document.createElement('div');
    container.className = 'ticker managementCard';
    container.dataset.symbol = symbol;
    root.appendChild(container);
    return container;
};

// Creates a neutral position for pre-trade management planning.
const createNoPosition = (symbol: string): Models.Position => {
    return {
        symbol: symbol,
        averagePrice: 0,
        netQuantity: 0,
    };
};

// Renders a card header, collapse toggle, and both side sections once.
const renderCardContents = (container: HTMLElement, context: ManagementPositionContext) => {
    let initialPosition = context.position ?? createNoPosition(context.symbol);
    let tickerTitle = document.createElement('div');
    tickerTitle.className = 'ticker-title';
    container.appendChild(tickerTitle);
    appendText(tickerTitle, context.symbol, '');

    let tag = document.createElement('span');
    tag.className = 'tag managementStatusTag';
    tickerTitle.appendChild(tag);

    let toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'managementCardToggle';
    toggleButton.addEventListener('click', () => {
        saveCollapsed(context.symbol, !loadCollapsed(context.symbol));
        updateCollapsedState(container, context.symbol);
    });
    tickerTitle.appendChild(toggleButton);

    let cardBody = document.createElement('div');
    cardBody.className = 'managementCardBody';
    container.appendChild(cardBody);

    renderSideSection(initialPosition, 'long', context.tradebookID, cardBody);
    renderSideSection(initialPosition, 'short', context.tradebookID, cardBody);
};

// Applies the current collapsed state to an already-rendered card.
const updateCollapsedState = (container: HTMLElement, symbol: string) => {
    let isCollapsed = loadCollapsed(symbol);
    let cardBody = container.querySelector<HTMLElement>('.managementCardBody');
    let toggleButton = container.querySelector<HTMLButtonElement>('.managementCardToggle');
    if (cardBody) {
        cardBody.classList.toggle('hidden', isCollapsed);
    }
    if (toggleButton) {
        toggleButton.textContent = isCollapsed ? '+' : '-';
        toggleButton.setAttribute('aria-label', isCollapsed ? `Expand ${symbol} management card` : `Collapse ${symbol} management card`);
    }
};

// Updates only the position-dependent status label and side visibility.
const updateCardPositionState = (container: HTMLElement, context: ManagementPositionContext) => {
    let activeSide = context.position ? getSide(context.position) : undefined;
    let statusText = activeSide ?? 'No open position';
    let tag = container.querySelector<HTMLElement>('.managementStatusTag');
    if (tag) {
        tag.className = statusText === 'long' ? 'tag tag-long managementStatusTag' : statusText === 'short' ? 'tag tag-short managementStatusTag' : 'tag managementStatusTag';
        tag.textContent = statusText;
    }

    updateCollapsedState(container, context.symbol);
    setSideSectionVisibility(container, 'long', isSideEnabled(context.symbol, 'long') && (!activeSide || activeSide === 'long'));
    setSideSectionVisibility(container, 'short', isSideEnabled(context.symbol, 'short') && (!activeSide || activeSide === 'short'));
};

// Shows or hides one side section without rebuilding its form state.
const setSideSectionVisibility = (container: HTMLElement, side: ManagementSide, isVisible: boolean) => {
    let section = container.querySelector<HTMLElement>(`.managementSide[data-side="${side}"]`);
    if (!section) {
        return;
    }
    section.classList.toggle('hidden', !isVisible);
};

// Renders one long or short side section once.
const renderSideSection = (
    position: Models.Position,
    side: ManagementSide,
    tradebookID: string | undefined,
    root: HTMLElement,
) => {
    let section = document.createElement('div');
    section.className = 'managementSide active';
    section.dataset.side = side;
    root.appendChild(section);

    // Rebuilds this side after setup selection or template application.
    let renderCurrentSide = () => {
        section.innerHTML = '';
        let sidePosition = getPositionForSide(position.symbol, side, position.averagePrice);
        let sideTradebookID = position.netQuantity !== 0 && getSide(position) === side ? tradebookID : undefined;
        let selectedSetupId = getSelectedSetupId(position.symbol, side, sideTradebookID);
        let draft = selectedSetupId ? loadDraft(position.symbol, side, selectedSetupId) ?? createDraft(sidePosition, selectedSetupId, undefined, sideTradebookID) : undefined;

        let title = document.createElement('div');
        title.className = 'managementSideTitle';
        title.textContent = side === 'long' ? 'Long' : 'Short';
        section.appendChild(title);

        renderSetupChooser(sidePosition, side, draft, sideTradebookID, section, renderCurrentSide);
        renderSelectedCard(sidePosition, draft, sideTradebookID, section, renderCurrentSide);
    };

    renderCurrentSide();
};

// Chooses the currently active setup from saved selection or tradebook inference.
const getSelectedSetupId = (
    symbol: string,
    side: ManagementSide,
    tradebookID: string | undefined,
) => {
    let selection = loadSelection(symbol);
    if (selection && selection.side === side) {
        return selection.setupId;
    }
    if (tradebookID) {
        return getSetupIdFromTradebookID(tradebookID);
    }
    return undefined;
};

// Renders the editable card for the selected setup when one is selected.
const renderSelectedCard = (
    position: Models.Position,
    draft: ManagementDraft | undefined,
    tradebookID: string | undefined,
    root: HTMLElement,
    rerenderSection: () => void,
) => {
    if (!draft?.setupId) {
        return;
    }
    let draftWithDefaults = createDraft(position, draft.setupId, draft, tradebookID);
    renderManagementSetupCard(draftWithDefaults, root, rerenderSection);
};
