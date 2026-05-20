import * as Models from '../models/models';
import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as TradingState from '../models/tradingState';
import { TradebookID } from '../tradebooks/tradebookIds';

type ManagementSide = 'long' | 'short';

type ManagementSetupId =
    | 'bookmap_offer_breakout'
    | 'bookmap_bid_step_up'
    | 'bookmap_bid_reappear'
    | 'bookmap_bid_breakdown'
    | 'bookmap_offer_step_down'
    | 'bookmap_offer_reappear';

interface ManagementSetupOption {
    id: ManagementSetupId,
    label: string,
}

interface ManagementDraft {
    symbol: string,
    side: ManagementSide,
    setupId?: ManagementSetupId,
    runnerCount?: string,
    coreCount?: string,
    coreTarget?: string,
    runnerTriggerCondition?: string,
    updatedAt: string,
}

const longSetupOptions: ManagementSetupOption[] = [
    { id: 'bookmap_offer_breakout', label: 'Bookmap Offer Breakout' },
    { id: 'bookmap_bid_step_up', label: 'Bookmap Bid Step Up' },
    { id: 'bookmap_bid_reappear', label: 'Bookmap Bid Reappear' },
];

const shortSetupOptions: ManagementSetupOption[] = [
    { id: 'bookmap_bid_breakdown', label: 'Bookmap Bid Breakdown' },
    { id: 'bookmap_offer_step_down', label: 'Bookmap Offer Step Down' },
    { id: 'bookmap_offer_reappear', label: 'Bookmap Offer Reappear' },
];

const getSide = (position: Models.Position): ManagementSide => {
    return position.netQuantity > 0 ? 'long' : 'short';
};

const getOptionsForSide = (side: ManagementSide) => {
    return side === 'long' ? longSetupOptions : shortSetupOptions;
};

const getStorageKey = (symbol: string, side: ManagementSide) => {
    return `trade-management:${symbol}:${side}`;
};

const getSetupLabel = (setupId: ManagementSetupId) => {
    let options = [...longSetupOptions, ...shortSetupOptions];
    let option = options.find(option => option.id === setupId);
    return option ? option.label : setupId;
};

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

const loadDraft = (symbol: string, side: ManagementSide): ManagementDraft | undefined => {
    try {
        let raw = window.localStorage.getItem(getStorageKey(symbol, side));
        if (!raw) {
            return undefined;
        }
        return JSON.parse(raw) as ManagementDraft;
    } catch (e) {
        return undefined;
    }
};

const saveDraft = (draft: ManagementDraft) => {
    try {
        window.localStorage.setItem(getStorageKey(draft.symbol, draft.side), JSON.stringify(draft));
    } catch (e) {
    }
};

const getActiveTradeStatePlan = (symbol: string, isLong: boolean) => {
    let breakoutTradeState = TradingState.getBreakoutTradeState(symbol, isLong);
    if (!breakoutTradeState || !breakoutTradeState.hasValue) {
        return undefined;
    }
    return breakoutTradeState.plan;
};

const getFirstPlan = (plans: (TradingPlansModels.BasePlan | undefined)[]) => {
    return plans.find(plan => plan !== undefined);
};

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

const getDefaultPlan = (symbol: string, isLong: boolean, setupId: ManagementSetupId | undefined) => {
    return getActiveTradeStatePlan(symbol, isLong) ?? getTradingPlanDefault(symbol, setupId);
};

const numberToDraftValue = (value: number | undefined) => {
    if (value === undefined) {
        return '';
    }
    return String(value);
};

const createDraft = (
    position: Models.Position,
    setupId: ManagementSetupId | undefined,
    existingDraft?: ManagementDraft,
): ManagementDraft => {
    let side = getSide(position);
    let isLong = side === 'long';
    let defaultPlan = getDefaultPlan(position.symbol, isLong, setupId);
    return {
        symbol: position.symbol,
        side: side,
        setupId: setupId,
        runnerCount: existingDraft?.runnerCount ?? numberToDraftValue(defaultPlan?.runnerCount),
        coreCount: existingDraft?.coreCount ?? numberToDraftValue(defaultPlan?.coreCount),
        coreTarget: existingDraft?.coreTarget ?? numberToDraftValue(defaultPlan?.coreTarget),
        runnerTriggerCondition: existingDraft?.runnerTriggerCondition ?? 'vwap bounce fail',
        updatedAt: new Date().toISOString(),
    };
};

const appendText = (root: HTMLElement, text: string, className?: string) => {
    let div = document.createElement('div');
    div.textContent = text;
    if (className) {
        div.className = className;
    }
    root.appendChild(div);
    return div;
};

const renderSetupChooser = (
    position: Models.Position,
    draft: ManagementDraft | undefined,
    root: HTMLElement,
    rerender: () => void,
) => {
    let side = getSide(position);
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
            let latestDraft = loadDraft(position.symbol, side) ?? draft;
            let nextDraft = createDraft(position, option.id, latestDraft);
            saveDraft(nextDraft);
            rerender();
        });
        chooser.appendChild(button);
    });
};

const renderInput = (
    root: HTMLElement,
    labelText: string,
    value: string,
    onValueChange: (value: string) => void,
) => {
    let label = document.createElement('label');
    label.className = 'managementField';
    root.appendChild(label);

    let span = document.createElement('span');
    span.textContent = labelText;
    label.appendChild(span);

    let input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.addEventListener('input', () => {
        onValueChange(input.value);
    });
    label.appendChild(input);
};

const renderBookmapOfferReappearCard = (draft: ManagementDraft, root: HTMLElement) => {
    let form = document.createElement('div');
    form.className = 'managementForm';
    root.appendChild(form);

    appendText(form, 'Bookmap Offer Reappear', 'managementCardTitle');

    let currentDraft = draft;
    const updateDraftField = (fieldName: keyof ManagementDraft, value: string) => {
        currentDraft = {
            ...currentDraft,
            [fieldName]: value,
            updatedAt: new Date().toISOString(),
        };
        saveDraft(currentDraft);
    };

    renderInput(form, 'Runner count', draft.runnerCount ?? '', value => updateDraftField('runnerCount', value));
    renderInput(form, 'Core count', draft.coreCount ?? '', value => updateDraftField('coreCount', value));
    renderInput(form, 'Core target', draft.coreTarget ?? '', value => updateDraftField('coreTarget', value));
    renderInput(form, 'Runner trigger condition', draft.runnerTriggerCondition ?? '', value => updateDraftField('runnerTriggerCondition', value));
};

const renderSelectedSetupPlaceholder = (root: HTMLElement, setupId: ManagementSetupId) => {
    let selected = document.createElement('div');
    selected.className = 'managementSelectedSetup';
    selected.textContent = `Selected: ${getSetupLabel(setupId)}`;
    root.appendChild(selected);
};

export const populateForPosition = (position: Models.Position, root: HTMLElement, tradebookID?: string) => {
    if (position.netQuantity === 0) {
        return;
    }

    let side = getSide(position);
    let inferredSetupId = getSetupIdFromTradebookID(tradebookID);
    let draft = loadDraft(position.symbol, side) ?? createDraft(position, inferredSetupId);
    let container = document.createElement('div');
    container.className = 'ticker managementCard';
    root.appendChild(container);

    let tickerTitle = document.createElement('div');
    tickerTitle.className = 'ticker-title';
    container.appendChild(tickerTitle);

    appendText(tickerTitle, position.symbol, '');

    let tag = document.createElement('span');
    tag.className = side === 'long' ? 'tag tag-long' : 'tag tag-short';
    tag.textContent = side;
    tickerTitle.appendChild(tag);

    let rerender = () => {
        container.innerHTML = '';
        let refreshedDraft = loadDraft(position.symbol, side) ?? createDraft(position, inferredSetupId);
        let refreshedTitle = document.createElement('div');
        refreshedTitle.className = 'ticker-title';
        container.appendChild(refreshedTitle);
        appendText(refreshedTitle, position.symbol, '');
        let refreshedTag = document.createElement('span');
        refreshedTag.className = side === 'long' ? 'tag tag-long' : 'tag tag-short';
        refreshedTag.textContent = side;
        refreshedTitle.appendChild(refreshedTag);
        renderSetupChooser(position, refreshedDraft, container, rerender);
        renderSelectedCard(position, refreshedDraft, container);
    };

    renderSetupChooser(position, draft, container, rerender);
    renderSelectedCard(position, draft, container);
};

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
        runnerCount: '3',
        coreCount: '2',
        coreTarget: '98.50',
        runnerTriggerCondition: 'vwap bounce fail',
        updatedAt: new Date().toISOString(),
    };
    saveDraft(mockDraft);
    populateForPosition(mockPosition, root);
};

const renderSelectedCard = (
    position: Models.Position,
    draft: ManagementDraft | undefined,
    root: HTMLElement,
) => {
    if (!draft?.setupId) {
        return;
    }
    let draftWithDefaults = createDraft(position, draft.setupId, draft);
    if (draft.setupId === 'bookmap_offer_reappear') {
        renderBookmapOfferReappearCard(draftWithDefaults, root);
        return;
    }
    renderSelectedSetupPlaceholder(root, draft.setupId);
};
