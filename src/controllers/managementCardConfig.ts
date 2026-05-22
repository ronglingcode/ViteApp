export type ManagementSide = 'long' | 'short';

export type ManagementSetupId =
    | 'bookmap_offer_breakout'
    | 'bookmap_bid_step_up'
    | 'bookmap_bid_reappear'
    | 'bookmap_bid_breakdown'
    | 'bookmap_offer_step_down'
    | 'bookmap_offer_reappear';

export interface ManagementSetupOption {
    id: ManagementSetupId,
    label: string,
}

export type ManagementFieldName =
    | 'wallPrice'
    | 'wallSize'
    | 'wall1Price'
    | 'wall1Size'
    | 'wall2Price'
    | 'wall2Size'
    | 'swingLow'
    | 'swingHigh'
    | 'originalOfferPrice'
    | 'originalSize'
    | 'reappearedOfferSize'
    | 'runnerCount'
    | 'coreCount'
    | 'coreTarget'
    | 'runnerTarget'
    | 'runnerTriggerCondition';

export type ManagementFieldWidth = 'long' | 'short';

export interface ManagementTemplate {
    id: string,
    title: string,
    values: Partial<Record<ManagementFieldName, string>>,
}

export interface ManagementSetupConfig {
    fieldHints?: Partial<Record<ManagementFieldName, string>>,
    fieldWidths?: Partial<Record<ManagementFieldName, ManagementFieldWidth>>,
    templates?: ManagementTemplate[],
}

const defaultFieldWidths: Partial<Record<ManagementFieldName, ManagementFieldWidth>> = {
    coreCount: 'short',
};

export const longSetupOptions: ManagementSetupOption[] = [
    { id: 'bookmap_offer_breakout', label: 'Offer Breakout' },
    { id: 'bookmap_bid_step_up', label: 'Bid Step Up' },
    { id: 'bookmap_bid_reappear', label: 'Bid Reappear' },
];

export const shortSetupOptions: ManagementSetupOption[] = [
    { id: 'bookmap_bid_breakdown', label: 'Bid Breakdown' },
    { id: 'bookmap_offer_step_down', label: 'Offer Step Down' },
    { id: 'bookmap_offer_reappear', label: 'Offer Reappear' },
];

const reappearSetupConfig: ManagementSetupConfig = {
    fieldHints: {
        coreTarget: 'vwap, premarket high',
        runnerTriggerCondition: 'vwap bounce fail, premarket low breakdown',
    },
    fieldWidths: {
        originalOfferPrice: 'short',
        originalSize: 'short',
        reappearedOfferSize: 'short',
    },
    templates: [
        {
            id: 'scalp_to_vwap',
            title: 'Scalp to vwap',
            values: {
                runnerCount: '0',
                coreCount: '5',
                coreTarget: 'vwap',
            },
        },
        {
            id: 'observe_at_vwap',
            title: 'Major at vwap',
            values: {
                coreCount: '4',
                coreTarget: 'vwap',
                runnerCount: '3',
                runnerTarget: 'below vwap',
            },
        },
        {
            id: 'confident_to_lose_vwap',
            title: 'Confident to lose vwap',
            values: {
                coreCount: '4',
                coreTarget: 'vwap',
                runnerCount: '6',
                runnerTarget: 'below vwap',
            },
        },
    ],
};

export const setupConfigs: Partial<Record<ManagementSetupId, ManagementSetupConfig>> = {
    bookmap_offer_breakout: {
        fieldWidths: {
            wallPrice: 'short',
            wallSize: 'short',
            swingLow: 'short',
        },
    },
    bookmap_bid_breakdown: {
        fieldWidths: {
            wallPrice: 'short',
            wallSize: 'short',
            swingHigh: 'short',
        },
    },
    bookmap_bid_step_up: {
        fieldWidths: {
            wall1Price: 'short',
            wall1Size: 'short',
            wall2Price: 'short',
            wall2Size: 'short',
        },
    },
    bookmap_offer_step_down: {
        fieldWidths: {
            wall1Price: 'short',
            wall1Size: 'short',
            wall2Price: 'short',
            wall2Size: 'short',
        },
    },
    bookmap_bid_reappear: {
        ...reappearSetupConfig,
        fieldHints: {
            ...reappearSetupConfig.fieldHints,
            runnerTriggerCondition: 'vwap reclaim, premarket high breakout',
        },
    },
    bookmap_offer_reappear: reappearSetupConfig,
};

export const getOptionsForSide = (side: ManagementSide) => {
    return side === 'long' ? longSetupOptions : shortSetupOptions;
};

export const getSetupLabel = (setupId: ManagementSetupId) => {
    let options = [...longSetupOptions, ...shortSetupOptions];
    let option = options.find(option => option.id === setupId);
    return option ? option.label : setupId;
};

export const getFieldHint = (setupId: ManagementSetupId | undefined, fieldName: ManagementFieldName) => {
    if (!setupId) {
        return undefined;
    }
    return setupConfigs[setupId]?.fieldHints?.[fieldName];
};

export const getFieldWidth = (setupId: ManagementSetupId | undefined, fieldName: ManagementFieldName): ManagementFieldWidth => {
    if (!setupId) {
        return defaultFieldWidths[fieldName] ?? 'long';
    }
    return setupConfigs[setupId]?.fieldWidths?.[fieldName] ?? defaultFieldWidths[fieldName] ?? 'long';
};

export const getTemplates = (setupId: ManagementSetupId | undefined) => {
    if (!setupId) {
        return [];
    }
    return setupConfigs[setupId]?.templates ?? [];
};
