import * as Firestore from '../firestore';
import * as GlobalSettings from '../config/globalSettings';
import * as Helper from '../utils/helper';
import * as NotificationCenter from '../ui/notificationCenter';
import { AudioHelper } from '../utils/audioHelper';
import type { TradingNotification } from './types';

export const dispatchTradingNotification = (notification: TradingNotification) => {
    NotificationCenter.showTradingNotification(notification);

    if (GlobalSettings.notificationSettings.soundEnabled) {
        AudioHelper.playWarningTone();
    }
    if (GlobalSettings.notificationSettings.speechEnabled) {
        Helper.speak(notification.speechMessage, Number.POSITIVE_INFINITY);
    }

    Firestore.logInfo(
        `[notification:${notification.ruleId}] ${notification.message}`,
        { symbol: notification.symbol },
    );
};
