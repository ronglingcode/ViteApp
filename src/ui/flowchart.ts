import * as FlowchartManager from '../controllers/flowchartManager';
import * as FlowchartModels from '../models/flowchartModels';
import * as Models from '../models/models';
import * as Firestore from '../firestore';

declare let window: Models.MyWindow;

/**
 * Flowchart UI Component
 * Displays and manages interactive flowchart state machine
 */

export const setup = () => {
    // HTML structure is now in index.html, just verify elements exist
    const displayDiv = document.getElementById('flowchartDisplay');
    const controlsDiv = document.getElementById('flowchartControls');
    
    if (!displayDiv || !controlsDiv) {
        console.error('Flowchart HTML elements not found in index.html');
        return;
    }

    // Initial update if symbol is already set
    if (window.HybridApp.UIState) {
        const activeSymbol = window.HybridApp.UIState.activeSymbol;
        if (activeSymbol) {
            updateFlowchartDisplay(activeSymbol);
        }
    }
};

export const updateFlowchartDisplay = (symbol: string) => {
    const displayDiv = document.getElementById('flowchartDisplay');
    const controlsDiv = document.getElementById('flowchartControls');
    
    if (!displayDiv || !controlsDiv) {
        return;
    }

    const currentState = FlowchartManager.getCurrentState(symbol);
    const nextStates = FlowchartManager.getAvailableNextStates(symbol);

    // Display current state with image and title
    if (currentState) {
        displayDiv.innerHTML = `
            <div style="margin-bottom: 15px;">
                <strong>Symbol: ${symbol}</strong>
            </div>
            <div style="text-align: center; margin-bottom: 15px;">
                <div style="font-weight: bold; margin-bottom: 8px; font-size: 16px;">${currentState.name}</div>
                <img src="${currentState.imageUrl || '/flowchart/mock.png'}" 
                     alt="${currentState.name}" 
                     style="max-width: 200px; max-height: 150px; border: 2px solid #ddd; border-radius: 4px; display: block; margin: 0 auto;" 
                     onerror="this.style.display='none'">
            </div>
        `;
    } else {
        displayDiv.innerHTML = `
            <div style="margin-bottom: 15px;">
                <strong>Symbol: ${symbol}</strong>
            </div>
            <div style="text-align: center; color: #666; padding: 20px;">
                Select an initial state below
            </div>
        `;
    }

    // Display available next states with images and titles
    if (nextStates.length > 0) {
        controlsDiv.innerHTML = `
            <div style="margin-bottom: 15px;"><strong>Next States:</strong></div>
            <div id="nextStatesContainer" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 15px;"></div>
            ${currentState ? `
                <div style="text-align: center; margin-top: 15px;">
                    <button id="flowchartBackBtn" style="padding: 8px 16px; cursor: pointer; background-color: #666; color: white; border: none; border-radius: 4px;">← Go Back</button>
                </div>
            ` : ''}
        `;

        const statesContainer = document.getElementById('nextStatesContainer');
        if (statesContainer) {
            nextStates.forEach(state => {
                const stateCard = document.createElement('div');
                stateCard.style.cssText = 'text-align: center; cursor: pointer; padding: 10px; border: 2px solid #ddd; border-radius: 8px; transition: all 0.2s; background-color: white;';
                stateCard.style.borderColor = '#ddd';
                stateCard.onmouseover = () => {
                    stateCard.style.borderColor = '#4CAF50';
                    stateCard.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                    stateCard.style.transform = 'translateY(-2px)';
                };
                stateCard.onmouseout = () => {
                    stateCard.style.borderColor = '#ddd';
                    stateCard.style.boxShadow = 'none';
                    stateCard.style.transform = 'translateY(0)';
                };
                
                stateCard.innerHTML = `
                    <div style="font-weight: bold; margin-bottom: 8px; font-size: 14px;">${state.name}</div>
                    <img src="${state.imageUrl || '/flowchart/mock.png'}" 
                         alt="${state.name}" 
                         style="width: 100%; max-width: 150px; height: 100px; object-fit: contain; border-radius: 4px; display: block; margin: 0 auto 8px;" 
                         onerror="this.style.display='none'">
                `;
                
                stateCard.addEventListener('click', () => {
                    transitionToState(symbol, state.id);
                });
                
                statesContainer.appendChild(stateCard);
            });
        }

        // Back button handler
        const backBtn = document.getElementById('flowchartBackBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                goBack(symbol);
            });
        }
    } else {
        controlsDiv.innerHTML = `
            <div style="color: #666; text-align: center; padding: 20px;">No more states available. This is a terminal state.</div>
            ${currentState ? `
                <div style="text-align: center; margin-top: 15px;">
                    <button id="flowchartBackBtn" style="padding: 8px 16px; cursor: pointer; background-color: #666; color: white; border: none; border-radius: 4px;">← Go Back</button>
                </div>
            ` : ''}
        `;
        const backBtn = document.getElementById('flowchartBackBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                goBack(symbol);
            });
        }
    }
};

const transitionToState = (symbol: string, stateId: string) => {
    const success = FlowchartManager.setCurrentState(symbol, stateId, 'User selected');
    if (success) {
        updateFlowchartDisplay(symbol);
        Firestore.logInfo(`Transitioned ${symbol} to state ${stateId}`);
    } else {
        Firestore.logError(`Failed to transition ${symbol} to state ${stateId}`);
    }
};

const goBack = (symbol: string) => {
    const success = FlowchartManager.goBackToPreviousState(symbol);
    if (success) {
        updateFlowchartDisplay(symbol);
        Firestore.logInfo(`Went back in flowchart for ${symbol}`);
    } else {
        Firestore.logError(`Failed to go back in flowchart for ${symbol}`);
    }
};
