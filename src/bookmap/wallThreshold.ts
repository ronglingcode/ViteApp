export const BOOKMAP_WALL_THRESHOLD_FLOOR = 5_000;

export interface BookmapWallThresholdMetadata {
    wallThreshold?: number;
    absoluteWallThreshold?: number;
    percentileWallThreshold?: number;
    effectiveWallThreshold?: number;
}

const getValidThreshold = (value: number | undefined): number => {
    return typeof value === "number" && Number.isFinite(value) && value > 0
        ? value
        : 0;
};

export const getBookmapSizeThreshold = (
    metadata: BookmapWallThresholdMetadata | undefined,
): number => {
    return Math.max(
        BOOKMAP_WALL_THRESHOLD_FLOOR,
        getValidThreshold(metadata?.wallThreshold),
        getValidThreshold(metadata?.absoluteWallThreshold),
        getValidThreshold(metadata?.percentileWallThreshold),
        getValidThreshold(metadata?.effectiveWallThreshold),
    );
};

export const meetsBookmapSizeThreshold = (
    size: number,
    metadata: BookmapWallThresholdMetadata | undefined,
): boolean => {
    return Number.isFinite(size) && size >= getBookmapSizeThreshold(metadata);
};
