/**
 * Enum defining all possible states for tradebooks
 */
export enum TradebookState {
    OBSERVING = 'OBSERVING',
    MOMENTUM = 'MOMENTUM',
    PULLBACK = 'PULLBACK',
    FAILED = 'FAILED',
    LOST_VWAP = 'LOST_VWAP',
    RECLAIMED_VWAP = 'RECLAIMED_VWAP',
    LEG_DOWN = 'LEG_DOWN',
    BOUNCE = 'BOUNCE',
}

/**
 * Helper functions for working with tradebook states
 */
export class TradebookStateHelper {
    /**
     * Get a human-readable description of a state
     */
    static getStateDescription(state: TradebookState): string {
        const descriptions: Record<TradebookState, string> = {
            [TradebookState.OBSERVING]: 'observing',
            [TradebookState.MOMENTUM]: 'momentum',
            [TradebookState.PULLBACK]: 'pullback',
            [TradebookState.FAILED]: 'failed',
            [TradebookState.LOST_VWAP]: 'lose vwap',
            [TradebookState.RECLAIMED_VWAP]: 'reclaimed vwap',
            [TradebookState.LEG_DOWN]: 'leg down',
            [TradebookState.BOUNCE]: 'bounce'
        };
        return descriptions[state] || 'Unknown State';
    }
} 