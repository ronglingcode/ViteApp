/** STOP-entry cancellation selection checked against the Java parity fixtures. */
export const selectEntryOrdersToCancel = <T extends { orderType: string }>(
    entries: readonly T[],
): T[] => entries.filter(order => order.orderType === 'STOP');
