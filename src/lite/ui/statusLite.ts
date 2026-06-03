import * as StateLite from '../models/stateLite';

const hiddenStatusSources = new Set(['auth', 'lite', 'massive']);

export const setStatus = (source: string, status: string) => {
    if (hiddenStatusSources.has(source)) {
        return;
    }
    let statusRow = document.getElementById('statusRow');
    if (!statusRow) {
        return;
    }
    let id = `status-${source}`;
    let chip = document.getElementById(id);
    if (!chip) {
        chip = document.createElement('div');
        chip.id = id;
        chip.className = 'statusChip';
        statusRow.appendChild(chip);
    }
    chip.textContent = `${source}: ${status}`;
};

export const setOrderStatus = (message: string, isError = false) => {
    let orderStatus = document.getElementById('orderStatus');
    if (!orderStatus) {
        return;
    }
    orderStatus.textContent = message;
    orderStatus.classList.toggle('errorText', isError);
};

export const logEvent = (message: string, isError = false) => {
    let eventLog = document.getElementById('eventLog');
    if (!eventLog) {
        return;
    }
    let line = document.createElement('p');
    line.className = isError ? 'eventLine errorText' : 'eventLine';
    line.textContent = `${StateLite.formatClock()} ${message}`;
    eventLog.prepend(line);
    while (eventLog.children.length > 80) {
        eventLog.removeChild(eventLog.lastChild as Node);
    }
};

export const updateClock = () => {
    let clock = document.getElementById('clock');
    if (clock) {
        clock.textContent = `clock: ${StateLite.formatClock()}`;
    }
};

export const showRootError = (root: HTMLElement, source: string, message: string) => {
    root.innerHTML = `
        <div class="liteRoot">
          <div id="logs">
            <div class="Error">${source}: ${message}</div>
          </div>
        </div>
    `;
};
