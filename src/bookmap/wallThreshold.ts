export interface BookmapWallThresholdMetadata {
    effectiveWallThreshold?: number;
}

export const getBookmapSizeThreshold = (
    metadata: BookmapWallThresholdMetadata | undefined,
): number | undefined => {
    const threshold = metadata?.effectiveWallThreshold;
    return typeof threshold === "number" && Number.isFinite(threshold) && threshold > 0
        ? threshold
        : undefined;
};

export const meetsBookmapSizeThreshold = (
    size: number,
    threshold: number | undefined,
): boolean => {
    return threshold !== undefined && Number.isFinite(size) && size >= threshold;
};
