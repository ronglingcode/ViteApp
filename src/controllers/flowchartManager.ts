import * as FlowchartModels from '../models/flowchartModels';
import * as Firestore from '../firestore';

/**
 * Manages flowchart state machines per symbol
 */
const flowchartStateMachines = new Map<string, FlowchartModels.FlowchartStateMachine>();

export const getFlowchartForSymbol = (symbol: string): FlowchartModels.FlowchartStateMachine => {
    if (!flowchartStateMachines.has(symbol)) {
        const flowchart = FlowchartModels.createDefaultFlowchart();
        flowchartStateMachines.set(symbol, flowchart);
    }
    return flowchartStateMachines.get(symbol)!;
};


export const setCurrentState = (symbol: string, stateId: string, transitionReason?: string): boolean => {
    const flowchart = getFlowchartForSymbol(symbol);
    const targetState = flowchart.states.get(stateId);
    
    if (!targetState) {
        Firestore.logError(`State ${stateId} not found for ${symbol}`);
        return false;
    }

    // Validate transition if there's a current state
    if (flowchart.currentStateId) {
        const validNextStates = FlowchartModels.getNextStates(flowchart, flowchart.currentStateId);
        const isValid = validNextStates.some(s => s.id === stateId);
        
        if (!isValid) {
            Firestore.logError(`Invalid transition from ${flowchart.currentStateId} to ${stateId} for ${symbol}`);
            return false;
        }
    } else {
        // Starting state - must be level 1
        if (targetState.level !== 1) {
            Firestore.logError(`Starting state must be level 1, got level ${targetState.level} for ${symbol}`);
            return false;
        }
    }

    // Save current state to history if exists
    if (flowchart.currentStateId) {
        flowchart.history.push({
            stateId: flowchart.currentStateId,
            timestamp: Date.now(),
            transitionReason
        });
    }

    flowchart.currentStateId = stateId;
    Firestore.logInfo(`Flowchart transition for ${symbol}: ${flowchart.currentStateId} -> ${stateId}`);
    return true;
};

export const goBackToPreviousState = (symbol: string): boolean => {
    const flowchart = getFlowchartForSymbol(symbol);
    
    if (flowchart.history.length === 0) {
        Firestore.logError(`No previous state to go back to for ${symbol}`);
        return false;
    }

    const previousEntry = flowchart.history.pop()!;
    flowchart.currentStateId = previousEntry.stateId;
    Firestore.logInfo(`Flowchart reverted for ${symbol} to state ${previousEntry.stateId}`);
    return true;
};

export const updateStateData = (symbol: string, stateId: string, data: Record<string, any>): boolean => {
    const flowchart = getFlowchartForSymbol(symbol);
    const state = flowchart.states.get(stateId);
    
    if (!state) {
        Firestore.logError(`State ${stateId} not found for ${symbol}`);
        return false;
    }

    state.data = { ...state.data, ...data };
    return true;
};

export const getCurrentState = (symbol: string): FlowchartModels.FlowchartState | null => {
    const flowchart = getFlowchartForSymbol(symbol);
    if (!flowchart.currentStateId) {
        return null;
    }
    return flowchart.states.get(flowchart.currentStateId) || null;
};

export const getAvailableNextStates = (symbol: string): FlowchartModels.FlowchartState[] => {
    const flowchart = getFlowchartForSymbol(symbol);
    if (!flowchart.currentStateId) {
        return FlowchartModels.getInitialStates(flowchart);
    }
    return FlowchartModels.getNextStates(flowchart, flowchart.currentStateId);
};
