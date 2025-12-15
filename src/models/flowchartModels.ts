import * as TradingPlans from '../models/tradingPlans/tradingPlans';
import * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
/**
 * Flowchart State Machine Models
 * Manages state transitions for trading flowcharts per symbol
 */

export interface FlowchartState {
    id: string;
    name: string;
    description?: string;
    imageUrl?: string;
    data?: Record<string, any>; // User-defined data for this state
    nextStates: FlowchartState[]; // Child states in the tree structure (required, default empty list)
    parent: FlowchartState | null; // Parent state object (null for root)
}

export const getFlowChartForLevelNearAboveRange = (symbol: string): FlowchartState => {
    // open below the range
    const startState: FlowchartState = {
        id: 'LevelNearAboveRange',
        name: 'level near above range',
        imageUrl: '/flowchart/LevelNearAboveRange/image.png',
        nextStates: [],
        parent: null
    };

    const insideZoneTopEdge: FlowchartState = {
        id: 'InsideZoneTopEdge',
        name: 'inside zone top edge',
        imageUrl: '/flowchart/LevelNearAboveRange/InsideZoneTopEdge/image.png',
        nextStates: [],
        parent: startState
    };
    const openDriveLong: FlowchartState = {
        id: 'OpenDriveLong',
        name: 'open drive long',
        imageUrl: '/flowchart/LevelNearAboveRange/LongOpenDrive/image.png',
        nextStates: [],
        parent: startState
    };
    const aboveWaterBreakout: FlowchartState = {
        id: 'AboveWaterBreakout',
        name: 'above water breakout',
        imageUrl: '/flowchart/LevelNearAboveRange/LongAboveWaterBreakout/image.png',
        nextStates: [],
        parent: startState
    };

    // Set nextStates after creating the child state
    startState.nextStates = [insideZoneTopEdge, openDriveLong, aboveWaterBreakout];

    return startState;
}

/**
 * Creates a simple 3-level flowchart structure:
 * Level 1: 2 states
 * Level 2: Each goes to 2 states (4 total)
 * Level 3: Each goes to 2 states (8 total)
 */
export const createDefaultFlowchart = (symbol: string): FlowchartState => {
    let tradingPlan = TradingPlans.getTradingPlans(symbol);
    let analysis = tradingPlan.analysis;
    console.log(`daily setup: ${analysis.dailySetup}`);
    if (analysis.dailySetup == TradingPlansModels.DailySetup.LevelNearAboveRange) {
        return getFlowChartForLevelNearAboveRange(symbol);
    }


    return getFlowChartForLevelNearAboveRange(symbol);
};

