/** Domain execution uses epoch milliseconds; UI dates and broker JSON are adapters. */
export interface AccountFill {
    symbol: string; orderID: string; timestamp: number; quantity: number; price: number;
    isBuy: boolean; positionEffectIsOpen: boolean;
}
