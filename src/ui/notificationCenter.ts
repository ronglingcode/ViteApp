import type { TradingNotification } from '../notifications/types';

const maximumVisibleNotifications = 5;

const formatPrice = (value: number | string | boolean | undefined) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return '';
    }
    return value.toFixed(2);
};

const buildDetailsText = (notification: TradingNotification) => {
    const approachPrice = formatPrice(notification.details?.approachPrice);
    const approachVwap = formatPrice(notification.details?.approachVwap);
    if (!approachPrice || !approachVwap) {
        return new Date(notification.occurredAt).toLocaleTimeString();
    }
    return `${new Date(notification.occurredAt).toLocaleTimeString()} · price ${approachPrice} · VWAP ${approachVwap}`;
};

export const showTradingNotification = (notification: TradingNotification) => {
    const center = document.getElementById('notificationCenter');
    if (!center) {
        return;
    }

    const existing = center.querySelector(`[data-notification-id="${notification.id}"]`);
    if (existing) {
        existing.remove();
    }

    const item = document.createElement('div');
    item.className = `tradingNotification ${notification.severity}`;
    item.dataset.notificationId = notification.id;

    const dismiss = document.createElement('button');
    dismiss.className = 'notificationDismiss';
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', `Dismiss ${notification.title}`);
    dismiss.textContent = '×';
    dismiss.addEventListener('click', () => item.remove());

    const title = document.createElement('div');
    title.className = 'notificationTitle';
    title.textContent = notification.title;

    const message = document.createElement('div');
    message.className = 'notificationMessage';
    message.textContent = notification.message;

    const details = document.createElement('div');
    details.className = 'notificationDetails';
    details.textContent = buildDetailsText(notification);

    item.append(dismiss, title, message, details);
    center.prepend(item);
    while (center.children.length > maximumVisibleNotifications) {
        center.lastElementChild?.remove();
    }
};
