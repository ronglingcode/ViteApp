import * as Firestore from '../firestore';
import * as GlobalSettings from '../config/globalSettings';
import * as Helper from '../utils/helper';
import * as NotificationCenter from '../ui/notificationCenter';
import type { TradingNotification } from './types';

type AudioContextConstructor = typeof AudioContext;
type AudioWindow = Window & typeof globalThis & {
    webkitAudioContext?: AudioContextConstructor;
};

const playWarningTone = () => {
    try {
        const audioWindow = window as AudioWindow;
        const Context = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
        if (!Context) {
            return;
        }
        const context = new Context();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, context.currentTime);
        oscillator.frequency.linearRampToValueAtTime(660, context.currentTime + 0.2);
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.24);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.25);
        oscillator.addEventListener('ended', () => {
            void context.close();
        });
    } catch (error) {
        console.warn('notification sound unavailable', error);
    }
};

export const dispatchTradingNotification = (notification: TradingNotification) => {
    NotificationCenter.showTradingNotification(notification);

    if (GlobalSettings.notificationSettings.soundEnabled) {
        playWarningTone();
    }
    if (GlobalSettings.notificationSettings.speechEnabled) {
        Helper.speak(notification.speechMessage, Number.POSITIVE_INFINITY);
    }

    Firestore.logInfo(
        `[notification:${notification.ruleId}] ${notification.message}`,
        { symbol: notification.symbol },
    );
};
