import * as StateLite from '../models/stateLite';
import * as StreamManager from './streamManager';

const worker = self as unknown as {
    postMessage: (message: StateLite.WorkerToMainMessage) => void;
    addEventListener: (
        type: 'message',
        listener: (event: MessageEvent<StateLite.MainToWorkerMessage>) => void
    ) => void;
};
const post = (message: StateLite.WorkerToMainMessage) => {
    worker.postMessage(message);
};

const streams = new StreamManager.LiteWorkerStreamManager(post);

worker.addEventListener('message', (event: MessageEvent<StateLite.MainToWorkerMessage>) => {
    let message = event.data;
    if (message.type === 'stop') {
        streams.stop();
        post({ type: 'status', source: 'lite', status: 'stopped' });
        return;
    }
    if (message.type === 'start') {
        streams.start(message.payload).catch(error => {
            post({
                type: 'error',
                source: 'lite',
                message: error instanceof Error ? error.message : String(error),
            });
        });
    }
});
