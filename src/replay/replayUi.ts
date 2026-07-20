import type { ReplayManifest } from './replayApi';
import * as AppVersion from '../config/appVersion';

const createRoot = () => {
    let root = document.getElementById('replayToolbar');
    if (!root) {
        root = document.createElement('div');
        root.id = 'replayToolbar';
        document.body.insertBefore(root, document.body.firstChild);
    }
    return root;
};

export const showRecordingSelector = async (
    loadRecordings: () => Promise<ReplayManifest[]>,
) => {
    const root = createRoot();
    root.className = 'replayToolbar replaySelector';
    root.textContent = 'Loading local replay recordings...';
    try {
        const recordings = await loadRecordings();
        root.textContent = '';
        const title = document.createElement('strong');
        title.textContent = 'Replay: ';
        root.appendChild(title);
        if (recordings.length === 0) {
            root.append('No recordings found in ProxyServer.');
            return;
        }
        const select = document.createElement('select');
        recordings.forEach(recording => {
            const option = document.createElement('option');
            option.value = recording.recordingId;
            const replayStart = new Date(recording.cutoverEpochMs).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            });
            option.textContent = `${recording.marketDate} ${recording.symbol} from ${replayStart} - ` +
                `${recording.status} (${recording.tradeRecordCount} trade records)`;
            select.appendChild(option);
        });
        root.appendChild(select);
        const open = document.createElement('button');
        open.textContent = 'Open replay';
        open.addEventListener('click', () => {
            window.location.href = `/replay?recording=${encodeURIComponent(select.value)}`;
        });
        root.appendChild(open);
    } catch (error) {
        root.textContent = `Cannot load recordings from ProxyServer: ${error instanceof Error ? error.message : error}`;
    }
};

export const showPlaybackControls = (
    manifest: ReplayManifest,
    controls: { play: () => void; pause: () => void; setSpeed: (speed: number) => void },
) => {
    const root = createRoot();
    root.className = 'replayToolbar';
    root.textContent = '';

    const label = document.createElement('strong');
    label.textContent = `REPLAY - ORDERS DISABLED - BOOKMAP OFF | ${manifest.marketDate} ${manifest.symbol} ` +
        `| captured v${manifest.appVersion} / app v${AppVersion.appVersion} | `;
    label.title = `Recording ${manifest.recordingId}; market events ${new Date(manifest.firstMarketEventEpochMs).toISOString()} ` +
        `through ${new Date(manifest.lastMarketEventEpochMs).toISOString()}`;
    root.appendChild(label);
    const status = document.createElement('span');
    status.id = 'replayStatus';
    status.textContent = 'connecting';
    root.appendChild(status);

    const play = document.createElement('button');
    play.textContent = 'Play';
    play.addEventListener('click', controls.play);
    root.appendChild(play);
    const pause = document.createElement('button');
    pause.textContent = 'Pause';
    pause.addEventListener('click', controls.pause);
    root.appendChild(pause);

    const speed = document.createElement('select');
    [0.5, 1, 2, 5, 10].forEach(value => {
        const option = document.createElement('option');
        option.value = `${value}`;
        option.textContent = `${value}x`;
        if (value === 1) option.selected = true;
        speed.appendChild(option);
    });
    speed.addEventListener('change', () => controls.setSpeed(Number(speed.value)));
    root.appendChild(speed);

    const restart = document.createElement('button');
    restart.textContent = 'Restart';
    restart.addEventListener('click', () => window.location.reload());
    root.appendChild(restart);

    const quoteState = document.createElement('span');
    quoteState.textContent = manifest.quoteEventCount > 0 ? ' | quotes recorded' : ' | quotes unavailable';
    root.appendChild(quoteState);
    const metrics = document.createElement('span');
    metrics.id = 'replayMetrics';
    root.appendChild(metrics);

    window.addEventListener('tradingscripts:replay-state', ((event: CustomEvent) => {
        const detail = event.detail ?? {};
        status.textContent = detail.marketTimeEpochMs
            ? new Date(detail.marketTimeEpochMs).toLocaleTimeString()
            : `${detail.status ?? 'playing'}${detail.speed ? ` ${detail.speed}x` : ''}`;
    }) as EventListener);
};
