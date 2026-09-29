/** Shared pure decision used by Handler.cancelKeyPressed and the Java parity fixtures. */
export const selectEntryOrdersToCancel = <T extends { orderType: string }>(
    entries: readonly T[], exitPairsCount: number, batchCount: number,
): T[] => entries.filter(order => exitPairsCount < batchCount * 0.4 || order.orderType === 'STOP');
