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
    level: number;
    data?: Record<string, any>; // User-defined data for this state
}

export interface FlowchartTransition {
    fromStateId: string;
    toStateId: string;
    condition?: string; // Optional condition description
    automatic?: boolean; // If true, transitions automatically
}

export interface FlowchartStateHistory {
    stateId: string;
    timestamp: number;
    transitionReason?: string;
}

export interface FlowchartStateMachine {
    states: Map<string, FlowchartState>;
    transitions: FlowchartTransition[];
    currentStateId: string | null;
    history: FlowchartStateHistory[]; // Stack for undo functionality
}

export const getFlowChartForLevelNearAboveRange = (symbol: string) => {

    const states = new Map<string, FlowchartState>();
    const transitions: FlowchartTransition[] = [];

    const startState: FlowchartState = {
        id: 'LevelNearAboveRange',
        name: 'level near above range',
        level: 0,
        imageUrl: '/flowchart/mock.png'
    };

    // open below the range
    const insideZoneTopEdge: FlowchartState = {
        id: 'InsideZoneTopEdge',
        name: 'inside zone top edge',
        level: 1,
        imageUrl: '/.png'
    };


    // Add all states
    [startState, insideZoneTopEdge].forEach(state => {
        states.set(state.id, state);
    });

    // Level 1 to Level 2 transitions
    transitions.push({ fromStateId: 'A1', toStateId: 'B1' });
    transitions.push({ fromStateId: 'A1', toStateId: 'B2' });
    transitions.push({ fromStateId: 'A2', toStateId: 'B3' });
    transitions.push({ fromStateId: 'A2', toStateId: 'B4' });

    // Level 2 to Level 3 transitions
    transitions.push({ fromStateId: 'B1', toStateId: 'C1' });
    transitions.push({ fromStateId: 'B1', toStateId: 'C2' });
    transitions.push({ fromStateId: 'B2', toStateId: 'C3' });
    transitions.push({ fromStateId: 'B2', toStateId: 'C4' });
    transitions.push({ fromStateId: 'B3', toStateId: 'C5' });
    transitions.push({ fromStateId: 'B3', toStateId: 'C6' });
    transitions.push({ fromStateId: 'B4', toStateId: 'C7' });
    transitions.push({ fromStateId: 'B4', toStateId: 'C8' });

    return {
        states,
        transitions,
        currentStateId: 'LevelNearAboveRange',
        history: []
    };
}

/**
 * Creates a simple 3-level flowchart structure:
 * Level 1: 2 states
 * Level 2: Each goes to 2 states (4 total)
 * Level 3: Each goes to 2 states (8 total)
 */
export const createDefaultFlowchart = (symbol: string): FlowchartStateMachine => {
    let tradingPlan = TradingPlans.getTradingPlans(symbol);
    let analysis = tradingPlan.analysis;
    console.log(`daily setup: ${analysis.dailySetup}`);
    if (analysis.dailySetup == TradingPlansModels.DailySetup.LevelNearAboveRange) {
        return getFlowChartForLevelNearAboveRange(symbol);
    }
    const states = new Map<string, FlowchartState>();
    const transitions: FlowchartTransition[] = [];

    // Level 1: Start states
    const stateA1: FlowchartState = {
        id: 'A1',
        name: 'Entry Setup',
        description: 'Initial state A1',
        level: 1,
        imageUrl: '/flowchart/mock.png'
    };
    const stateA2: FlowchartState = {
        id: 'A2',
        name: 'Breakout Watch',
        description: 'Initial state A2',
        level: 1,
        imageUrl: '/flowchart/mock.png'
    };

    // Level 2: Second level states
    const stateB1: FlowchartState = {
        id: 'B1',
        name: 'Long Entry',
        description: 'Second level state B1',
        level: 2,
        imageUrl: '/flowchart/mock.png'
    };
    const stateB2: FlowchartState = {
        id: 'B2',
        name: 'Short Entry',
        description: 'Second level state B2',
        level: 2,
        imageUrl: '/flowchart/mock.png'
    };
    const stateB3: FlowchartState = {
        id: 'B3',
        name: 'Momentum',
        description: 'Second level state B3',
        level: 2,
        imageUrl: '/flowchart/mock.png'
    };
    const stateB4: FlowchartState = {
        id: 'B4',
        name: 'Reversal',
        description: 'Second level state B4',
        level: 2,
        imageUrl: '/flowchart/mock.png'
    };

    // Level 3: Third level states
    const stateC1: FlowchartState = { id: 'C1', name: 'Target 1', description: 'Third level state C1', level: 3, imageUrl: '/flowchart/mock.png' };
    const stateC2: FlowchartState = { id: 'C2', name: 'Target 2', description: 'Third level state C2', level: 3, imageUrl: '/flowchart/mock.png' };
    const stateC3: FlowchartState = { id: 'C3', name: 'Stop Loss', description: 'Third level state C3', level: 3, imageUrl: '/flowchart/mock.png' };
    const stateC4: FlowchartState = { id: 'C4', name: 'Take Profit', description: 'Third level state C4', level: 3, imageUrl: '/flowchart/mock.png' };
    const stateC5: FlowchartState = { id: 'C5', name: 'Hold', description: 'Third level state C5', level: 3, imageUrl: '/flowchart/mock.png' };
    const stateC6: FlowchartState = { id: 'C6', name: 'Scale Out', description: 'Third level state C6', level: 3, imageUrl: '/flowchart/mock.png' };
    const stateC7: FlowchartState = { id: 'C7', name: 'Exit', description: 'Third level state C7', level: 3, imageUrl: '/flowchart/mock.png' };
    const stateC8: FlowchartState = { id: 'C8', name: 'Trail Stop', description: 'Third level state C8', level: 3, imageUrl: '/flowchart/mock.png' };

    // Add all states
    [stateA1, stateA2, stateB1, stateB2, stateB3, stateB4, stateC1, stateC2, stateC3, stateC4, stateC5, stateC6, stateC7, stateC8].forEach(state => {
        states.set(state.id, state);
    });

    // Level 1 to Level 2 transitions
    transitions.push({ fromStateId: 'A1', toStateId: 'B1' });
    transitions.push({ fromStateId: 'A1', toStateId: 'B2' });
    transitions.push({ fromStateId: 'A2', toStateId: 'B3' });
    transitions.push({ fromStateId: 'A2', toStateId: 'B4' });

    // Level 2 to Level 3 transitions
    transitions.push({ fromStateId: 'B1', toStateId: 'C1' });
    transitions.push({ fromStateId: 'B1', toStateId: 'C2' });
    transitions.push({ fromStateId: 'B2', toStateId: 'C3' });
    transitions.push({ fromStateId: 'B2', toStateId: 'C4' });
    transitions.push({ fromStateId: 'B3', toStateId: 'C5' });
    transitions.push({ fromStateId: 'B3', toStateId: 'C6' });
    transitions.push({ fromStateId: 'B4', toStateId: 'C7' });
    transitions.push({ fromStateId: 'B4', toStateId: 'C8' });

    return {
        states,
        transitions,
        currentStateId: null,
        history: []
    };
};

export const getInitialStates = (flowchart: FlowchartStateMachine): FlowchartState[] => {
    return Array.from(flowchart.states.values()).filter(state => state.level === 1);
};

export const getNextStates = (flowchart: FlowchartStateMachine, currentStateId: string): FlowchartState[] => {
    const nextStateIds = flowchart.transitions
        .filter(t => t.fromStateId === currentStateId)
        .map(t => t.toStateId);

    return nextStateIds
        .map(id => flowchart.states.get(id))
        .filter((state): state is FlowchartState => state !== undefined);
};

export const getPreviousState = (flowchart: FlowchartStateMachine): string | null => {
    if (flowchart.history.length > 0) {
        const lastEntry = flowchart.history[flowchart.history.length - 1];
        return lastEntry.stateId;
    }
    return null;
};
