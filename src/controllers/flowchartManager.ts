import * as FlowchartModels from '../models/flowchartModels';
import * as Firestore from '../firestore';

/**
 * Manages flowchart state machines per symbol
 */
const flowchartStateMachines = new Map<string, FlowchartModels.FlowchartState>();

export const getFlowchartForSymbol = (symbol: string): FlowchartModels.FlowchartState => {
    if (!flowchartStateMachines.has(symbol)) {
        const flowchart = FlowchartModels.createDefaultFlowchart(symbol);
        flowchartStateMachines.set(symbol, flowchart);
    }
    return flowchartStateMachines.get(symbol)!;
};


export const setCurrentState = (symbol: string, targetState: FlowchartModels.FlowchartState): boolean => {
    if (flowchartStateMachines.has(symbol)) {
        flowchartStateMachines.set(symbol, targetState);
    }
    return true;
};


export const getCurrentState = (symbol: string): FlowchartModels.FlowchartState => {
    const flowchart = getFlowchartForSymbol(symbol);
    return flowchart;
};
