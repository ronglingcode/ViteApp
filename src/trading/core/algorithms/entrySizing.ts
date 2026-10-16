export const FIXED_SHARE_PARTIALS = 10;

export function fixedShareOptions(values: number[] | undefined): number[] {
    return [...new Set((values ?? []).filter(value => Number.isSafeInteger(value) && value >= FIXED_SHARE_PARTIALS))];
}

export function fixedSharesFromMethod(method: string | undefined): number | undefined {
    const match = method?.trim().match(/^(\d+) sh$/);
    const quantity = match ? Number(match[1]) : NaN;
    return Number.isSafeInteger(quantity) && quantity >= FIXED_SHARE_PARTIALS ? quantity : undefined;
}

export function entryMethods(fixedShares?: number[]): string[] {
    return ['1 R', '0.5 R', '0.3 R', '0.2 R', '0.1 R', ...fixedShareOptions(fixedShares).map(quantity => `${quantity} sh`)];
}
