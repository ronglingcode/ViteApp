import type * as LightweightCharts from 'sunrise-tv-lightweight-charts';

const cannotUpdateOldestDataMessage = 'Cannot update oldest data';

interface PriceLabeledItem {
    price: number;
    label: string;
}

export const isCannotUpdateOldestDataError = (error: unknown) => {
    return error instanceof Error && error.message.includes(cannotUpdateOldestDataMessage);
};

export const safeUpdateSeries = <T extends LightweightCharts.SeriesType>(
    series: LightweightCharts.ISeriesApi<T> | null | undefined,
    data: LightweightCharts.SeriesDataItemTypeMap[T] | null | undefined,
    context?: string,
) => {
    if (!series || !data) {
        return false;
    }

    try {
        series.update(data);
        return true;
    } catch (error) {
        if (isCannotUpdateOldestDataError(error)) {
            let suffix = context ? ` (${context})` : '';
            console.error(`[LightweightCharts] Ignored stale series update${suffix}: ${(error as Error).message}`);
            return false;
        }
        throw error;
    }
};

const formatNumberRanges = (numbers: number[]) => {
    let sortedNumbers = Array.from(new Set(numbers)).sort((a, b) => a - b);
    if (sortedNumbers.length === 0) {
        return '';
    }

    let ranges: string[] = [];
    let start = sortedNumbers[0];
    let end = sortedNumbers[0];

    for (let i = 1; i < sortedNumbers.length; i++) {
        let current = sortedNumbers[i];
        if (current === end + 1) {
            end = current;
        } else {
            ranges.push(start === end ? `${start}` : `${start}-${end}`);
            start = current;
            end = current;
        }
    }

    ranges.push(start === end ? `${start}` : `${start}-${end}`);
    return ranges.join(',');
};

const createAggregatedExitOrderLabel = (orders: PriceLabeledItem[]) => {
    let indexGroupsByOrderType = new Map<string, number[]>();
    for (let order of orders) {
        let labelMatch = order.label.match(/^(\d+):(.+)$/);
        if (!labelMatch) {
            return orders.map(o => o.label).join(',');
        }

        let orderIndex = Number(labelMatch[1]);
        let orderType = labelMatch[2];
        let indexGroup = indexGroupsByOrderType.get(orderType);
        if (indexGroup) {
            indexGroup.push(orderIndex);
        } else {
            indexGroupsByOrderType.set(orderType, [orderIndex]);
        }
    }

    let labelParts: string[] = [];
    indexGroupsByOrderType.forEach((indexes, orderType) => {
        labelParts.push(`${formatNumberRanges(indexes)}:${orderType}`);
    });
    return labelParts.join(',');
};

export const aggregateExitOrdersByPrice = <T extends PriceLabeledItem>(orders: T[]) => {
    let ordersByPrice = new Map<number, T[]>();
    for (let order of orders) {
        let priceOrders = ordersByPrice.get(order.price);
        if (priceOrders) {
            priceOrders.push(order);
        } else {
            ordersByPrice.set(order.price, [order]);
        }
    }

    let aggregatedOrders: T[] = [];
    ordersByPrice.forEach(priceOrders => {
        if (priceOrders.length === 1) {
            aggregatedOrders.push(priceOrders[0]);
        } else {
            aggregatedOrders.push({
                ...priceOrders[0],
                label: createAggregatedExitOrderLabel(priceOrders),
            });
        }
    });
    return aggregatedOrders;
};
