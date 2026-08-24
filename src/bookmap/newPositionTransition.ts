export const isNewPositionTransition = (
    previousQuantity: number | undefined,
    currentQuantity: number,
) => previousQuantity === 0 && currentQuantity !== 0;
