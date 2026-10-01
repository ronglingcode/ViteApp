interface QuantityExitPair {
    STOP?: { quantity: number };
    LIMIT?: { quantity: number };
}

const getExitPairQuantity = (pair: QuantityExitPair): number | undefined => {
    let quantities = [pair.LIMIT?.quantity, pair.STOP?.quantity];
    return quantities.find(quantity => quantity !== undefined && Number.isFinite(quantity) && quantity > 0);
};

/**
 * Returns the first pair with the smallest positive share quantity.
 * Ties intentionally preserve the existing display order.
 */
export const getFirstSmallestQuantityExitPairIndex = (pairs: QuantityExitPair[]) => {
    let selectedIndex = -1;
    let smallestQuantity = Number.POSITIVE_INFINITY;
    pairs.forEach((pair, index) => {
        let quantity = getExitPairQuantity(pair);
        if (quantity !== undefined && quantity < smallestQuantity) {
            selectedIndex = index;
            smallestQuantity = quantity;
        }
    });
    return selectedIndex;
};
