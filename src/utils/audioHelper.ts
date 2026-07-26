type AudioContextConstructor = typeof AudioContext;
type AudioWindow = Window & typeof globalThis & {
    webkitAudioContext?: AudioContextConstructor;
};

export class AudioHelper {
    /**
     * Plays a short descending warning tone without requiring an audio file.
     * This can be reused anywhere the app needs an audible caution signal.
     */
    static playWarningTone() {
        try {
            // Use the standard Web Audio API, with the prefixed constructor as
            // a fallback for older Safari versions.
            const audioWindow = window as AudioWindow;
            const Context =
                audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
            if (!Context) {
                return;
            }

            const context = new Context();
            const oscillator = context.createOscillator();
            const gain = context.createGain();

            // Sweep a sine wave downward from 880 Hz to 660 Hz so the sound is
            // noticeable without being a long or harsh alarm.
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, context.currentTime);
            oscillator.frequency.linearRampToValueAtTime(
                660,
                context.currentTime + 0.2,
            );

            // Fade in and out to avoid clicks at the beginning and end. Web
            // Audio exponential ramps require a small non-zero endpoint.
            gain.gain.setValueAtTime(0.0001, context.currentTime);
            gain.gain.exponentialRampToValueAtTime(
                0.18,
                context.currentTime + 0.015,
            );
            gain.gain.exponentialRampToValueAtTime(
                0.0001,
                context.currentTime + 0.24,
            );

            // Route the generated tone through the volume envelope and then to
            // the browser's audio output.
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start();
            oscillator.stop(context.currentTime + 0.25);

            // Release the short-lived audio context after playback completes.
            oscillator.addEventListener('ended', () => {
                void context.close();
            });
        } catch (error) {
            // Audio can be blocked by browser autoplay rules. It should never
            // interrupt the trading workflow when unavailable.
            console.warn('warning tone unavailable', error);
        }
    }
}
