import type * as LightweightCharts from 'sunrise-tv-lightweight-charts';

const cannotUpdateOldestDataMessage = 'Cannot update oldest data';

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
