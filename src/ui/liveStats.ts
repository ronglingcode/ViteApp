export const getLiveStatsForReversalMove = (isLong: boolean, hasReversalMove: boolean) => {
    let prefix = isLong ? "red2green" : "green2red";
    let result = hasReversalMove ? "yes" : "no";
    return `${prefix}: ${result}`;
}