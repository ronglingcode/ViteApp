export type AppRuntimeMode = 'live' | 'replay';

const replayPath = window.location.pathname === '/replay' || window.location.pathname === '/replay/';
const mode: AppRuntimeMode = replayPath ? 'replay' : 'live';

export const runtimeMode = mode;
export const isReplayMode = () => runtimeMode === 'replay';
export const getReplayRecordingId = () => new URLSearchParams(window.location.search).get('recording') ?? '';

export const capabilities = {
    liveMarketData: !isReplayMode(),
    liveBroker: !isReplayMode(),
    externalWrites: !isReplayMode(),
    bookmap: !isReplayMode(),
    replayControls: isReplayMode(),
};

export const proxyBaseUrl = import.meta.env.VITE_PROXY_SERVER_URL || 'http://localhost:3000';

export const toWebSocketUrl = (httpPath: string) => {
    const base = new URL(proxyBaseUrl);
    const protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${base.host}${httpPath}`;
};
