import * as TimeHelper from '../utils/timeHelper';

const minimumSetupLength = 30;
const reminderLeadTimeMs = 60 * 1000;

let automaticReminderHandled = false;
let reminderTimer: ReturnType<typeof setTimeout> | null = null;
let activeOverlay: HTMLDivElement | null = null;
let previousBodyOverflow = '';

const getSetupLength = (value: string) => value.trim().length;

const closeReminder = () => {
    activeOverlay?.remove();
    activeOverlay = null;
    document.body.style.overflow = previousBodyOverflow;
};

const showReminder = () => {
    if (activeOverlay) {
        activeOverlay.querySelector('textarea')?.focus();
        return;
    }

    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const overlay = document.createElement('div');
    overlay.className = 'premarketSetupReminder';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'premarketSetupReminderTitle');

    const form = document.createElement('form');
    form.className = 'premarketSetupReminderCard';

    const eyebrow = document.createElement('div');
    eyebrow.className = 'premarketSetupReminderEyebrow';
    eyebrow.textContent = 'Market opens in 1 minute';

    const title = document.createElement('h1');
    title.id = 'premarketSetupReminderTitle';
    title.textContent = 'What are today’s best setups?';

    const description = document.createElement('p');
    description.textContent = 'Write down the clearest opportunities before trading begins.';

    const label = document.createElement('label');
    label.htmlFor = 'premarketSetupReminderAnswer';
    label.textContent = 'Best setups';

    const textarea = document.createElement('textarea');
    textarea.id = 'premarketSetupReminderAnswer';
    textarea.name = 'bestSetups';
    textarea.rows = 8;
    textarea.placeholder = 'Describe the symbols, key levels, and conditions that would make each setup valid…';
    textarea.minLength = minimumSetupLength;
    textarea.required = true;

    const validationRow = document.createElement('div');
    validationRow.className = 'premarketSetupReminderValidation';

    const errorMessage = document.createElement('span');
    errorMessage.className = 'premarketSetupReminderError';
    errorMessage.setAttribute('role', 'alert');

    const characterCount = document.createElement('span');
    characterCount.className = 'premarketSetupReminderCount';

    const updateCharacterCount = () => {
        const length = getSetupLength(textarea.value);
        characterCount.textContent = `${length} / ${minimumSetupLength} characters minimum`;
        if (length >= minimumSetupLength) {
            errorMessage.textContent = '';
            textarea.removeAttribute('aria-invalid');
        }
    };

    textarea.addEventListener('input', updateCharacterCount);
    validationRow.append(errorMessage, characterCount);

    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'premarketSetupReminderSubmit';
    submitButton.textContent = 'Submit setups';

    form.addEventListener('submit', event => {
        event.preventDefault();
        if (getSetupLength(textarea.value) < minimumSetupLength) {
            errorMessage.textContent = `Enter at least ${minimumSetupLength} characters before continuing.`;
            textarea.setAttribute('aria-invalid', 'true');
            textarea.focus();
            return;
        }
        closeReminder();
    });

    form.append(eyebrow, title, description, label, textarea, validationRow, submitButton);
    overlay.appendChild(form);

    // Keep trading hotkeys and focus from reaching the covered app.
    overlay.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key !== 'Tab') {
            return;
        }
        if (event.shiftKey && document.activeElement === textarea) {
            event.preventDefault();
            submitButton.focus();
        } else if (!event.shiftKey && document.activeElement === submitButton) {
            event.preventDefault();
            textarea.focus();
        }
    });

    activeOverlay = overlay;
    document.body.appendChild(overlay);
    updateCharacterCount();
    textarea.focus();
};

const handleAutomaticReminder = () => {
    reminderTimer = null;
    if (automaticReminderHandled) {
        return;
    }

    const now = new Date();
    const marketOpen = TimeHelper.getMarketOpenTimeInLocal();
    const dayOfWeek = marketOpen.getDay();

    // The time helper does not include an exchange-holiday calendar, but weekends
    // can be excluded without risking a false reminder.
    if (dayOfWeek === 0 || dayOfWeek === 6 || now >= marketOpen) {
        automaticReminderHandled = true;
        return;
    }

    const reminderTime = marketOpen.getTime() - reminderLeadTimeMs;
    const delayMs = reminderTime - now.getTime();
    if (delayMs > 0) {
        reminderTimer = setTimeout(handleAutomaticReminder, delayMs);
        return;
    }

    automaticReminderHandled = true;
    showReminder();
};

export const schedulePremarketSetupReminder = () => {
    if (automaticReminderHandled || reminderTimer) {
        return;
    }
    handleAutomaticReminder();
};

export const showPremarketSetupReminderForTest = () => {
    showReminder();
};
