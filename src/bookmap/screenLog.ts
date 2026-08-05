export type BookmapScreenLogLevel = 'Info' | 'Success' | 'Error';

export const BOOKMAP_SCREEN_LOG_EVENT = 'tradingscripts:bookmap-screen-log';

export interface BookmapScreenLogDetail {
    message: string;
    level: BookmapScreenLogLevel;
    symbol?: string;
}

export const emitBookmapScreenLog = (
    message: string,
    level: BookmapScreenLogLevel,
    symbol?: string,
) => {
    window.dispatchEvent(new CustomEvent<BookmapScreenLogDetail>(BOOKMAP_SCREEN_LOG_EVENT, {
        detail: { message, level, symbol },
    }));
};
