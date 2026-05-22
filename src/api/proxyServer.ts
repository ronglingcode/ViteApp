import * as GlobalSettings from '../config/globalSettings';

export const saveAgentResponse = async (symbol: string, response: string) => {
    let data = {
        symbol: symbol,
        response: response,
    };
    try {
        const response = await fetch(`${GlobalSettings.localhostWithPort}/save/agentresponse`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
    } catch (error) {
        console.error('Error sending agent response:', error);
        throw error;
    }
}