import * as StateLite from '../models/stateLite';
import * as ChartLite from './chartLite';

export interface SymbolElements {
    price: HTMLElement;
    volume: HTMLElement;
    bid: HTMLElement;
    ask: HTMLElement;
    spread: HTMLElement;
    currentCandle: {
        open: HTMLElement;
        high: HTMLElement;
        low: HTMLElement;
        close: HTMLElement;
    };
    position: HTMLElement;
    avg: HTMLElement;
    exitOrders: HTMLElement;
    quantity: HTMLInputElement;
}

interface RenderShellCallbacks {
    onActiveSymbolChange: (symbol: string) => void;
    onReconnect: () => void;
}

interface RenderShellOptions {
    showSimpleChart: boolean;
}

const renderChartContainer = (
    index: number,
    symbolsByIndex: Map<number, StateLite.LiteWatchlistItem>,
    showSimpleChart: boolean
) => {
    let item = symbolsByIndex.get(index);
    let symbol = item?.symbol ?? '';
    let simpleChartClass = showSimpleChart ? 'liteSimpleChartVisible' : 'liteNoSimpleChart';
    let chartHostStyle = showSimpleChart ? '' : ' style="display: none;"';
    return `
        <td>
          <div id="chartContainer${index}" class="chartContainer ${item ? 'liteVisible' : ''} ${simpleChartClass}">
            <div id="topbar${index}" class="topbar">
              <span id="symbol${index}">${symbol}</span>
              <span class="currentPrice" data-field="price">-</span>
              <span class="currentVolume" data-field="volume"></span>
              [<span class="bid" data-field="bid">-</span> x <span class="ask" data-field="ask">-</span>] =
              <span class="spread" data-field="spread">-</span>
              <span class="topBarRight2">State:</span>
              <span class="topBarRight"></span>
            </div>
            <div class="quantityBar">
              Qty: <input data-field="quantity" value="1" inputmode="numeric" /><button data-action="use-percent" type="button">%</button><button data-action="use-100" type="button">100</button> |
              <span class="currentCandle"><span class="ohlc_o">O:0</span><span class="ohlc_h">H:0</span><span
                  class="ohlc_l">L:0</span><span class="ohlc_c">C:0</span> |</span>
              <span class="positionCount" data-field="position">pos: 0</span> |
              <span class="avgPrice" data-field="avg">avg: -</span>
              <input value="" />
              <span class="add_count add_count_20">a20</span>
              <span class="add_count add_count_50">a50</span>
              <span class="add_count add_count_80">a80</span>
              <span class="tradingPlans">
                <span class="tradingPlansLong">
                  <span class="refresh">Refresh</span>
                </span>
              </span>
            </div>
            <div class="twoColumnsWithChart">
              <div class="left">
                <div class="lastBar">
                  <span class="exitButtons"></span>
                  <span class="exitOrders">Exits: </span>
                </div>
                <div id="chart${index}" class="tvchart liteChartHost"${chartHostStyle}></div>
                <div id="chart${index}popup" class="tvchart" style="display: none;">
                  <div class="question">question</div>
                  <textarea class="answer">answer</textarea>
                  <button class="submit">Submit</button>
                </div>
              </div>
              <div class="sideBar">
                <div class="tradebookButtons"></div>
              </div>
            </div>
            <div id="bookmap${index}" class="bookmapPanel" style="display: none;"></div>
          </div>
        </td>
    `;
};

const renderControls = () => {
    return `
        <div class="controls">
          <span style="display: none">
            <button type="button">B: Buy b/o</button>
            <button type="button">Shift + B: Buy MKT</button>
            <button type="button">S: Sell b/o</button>
            <button type="button">Shift + S: Sell MKT</button>
            <button type="button">F: Flatten</button>
            <button type="button">C: Cancel All</button>
            <button type="button">Q: Cancel Entry</button>
            <button type="button">T: Move All Stops</button>
            <button type="button">E: Move Half Stop to Breakeven</button>
            <button type="button">G: Set Price Target</button>
            <button type="button">Shit + G: Market Out Half</button>
            <button type="button">O: Trail stop 5</button>
            <button type="button">I: Trail stop 15</button>
            <button type="button">0-9: Adjust Order</button>
          </span>
          <a href="/index.html">Full App</a>
          <button id="update_account_ui" type="button">Update acct UI</button>
          <button id="check_quantity" type="button">Check quantity</button>
          <button id="show_execution" type="button">Show executions</button>
          <button id="show_execution_detail" type="button">Show exec more</button>
          <button id="export_trades" type="button">Export trades</button>
          <button id="test_popup" type="button">Test popup</button>
          <button id="toggle_management_card_exit_block" type="button"></button>
          <button id="reconnectButton" type="button">Reconnect</button>
          <span id="statusRow" class="statusRow"></span>
        </div>
    `;
};

export const renderShell = (
    root: HTMLElement,
    watchlist: StateLite.LiteWatchlistItem[],
    callbacks: RenderShellCallbacks,
    options: RenderShellOptions = { showSimpleChart: true }
) => {
    let totalChartCount = Math.min(watchlist.length, 4);
    let showSimpleChart = options.showSimpleChart;
    let symbolsByIndex = new Map<number, StateLite.LiteWatchlistItem>();
    watchlist.slice(0, 4).forEach((item, index) => {
        symbolsByIndex.set(index, item);
    });

    callbacks.onActiveSymbolChange(watchlist[0]?.symbol ?? '');
    root.innerHTML = `
        <div class="liteRoot">
          <table>
            <tr>
              <td id="traderFocus">
                <div id="traderFocusColumn">
                  <div id="traderFocusInstructions" class="collapsibleSection">
                    <div class="sectionTitle">
                      Trade Management
                    </div>
                    <div class="sectionContent" id="traderFocusInstructionsContent"></div>
                  </div>
                </div>
              </td>
              <td class="liteChartsCell">
                <table>
                  <tr>
                    ${renderChartContainer(0, symbolsByIndex, showSimpleChart)}
                    ${renderChartContainer(2, symbolsByIndex, showSimpleChart)}
                  </tr>
                </table>
                <table>
                  <tr>
                    ${renderChartContainer(1, symbolsByIndex, showSimpleChart)}
                    ${renderChartContainer(3, symbolsByIndex, showSimpleChart)}
                  </tr>
                </table>
              </td>
              <td style="vertical-align: top;">
                <div id="logs">
                  <div id="orderStatus" class="Info">Ready</div>
                  <div id="eventLog"></div>
                </div>
              </td>
            </tr>
          </table>
          ${renderControls()}
          <div id="network">network: </div>
          <div id="clock">clock: </div>
        </div>
    `;

    let symbolElements = new Map<string, SymbolElements>();
    watchlist.slice(0, 4).forEach((item, index) => {
        let panel = document.getElementById(`chartContainer${index}`) as HTMLElement | null;
        if (!panel) {
            return;
        }
        let chartHost = document.getElementById(`chart${index}`) as HTMLElement;
        if (showSimpleChart) {
            ChartLite.createLiteChart(item.symbol, chartHost, index, totalChartCount);
        }

        let elements: SymbolElements = {
            price: panel.querySelector('[data-field="price"]') as HTMLElement,
            volume: panel.querySelector('[data-field="volume"]') as HTMLElement,
            bid: panel.querySelector('[data-field="bid"]') as HTMLElement,
            ask: panel.querySelector('[data-field="ask"]') as HTMLElement,
            spread: panel.querySelector('[data-field="spread"]') as HTMLElement,
            currentCandle: {
                open: panel.querySelector('.ohlc_o') as HTMLElement,
                high: panel.querySelector('.ohlc_h') as HTMLElement,
                low: panel.querySelector('.ohlc_l') as HTMLElement,
                close: panel.querySelector('.ohlc_c') as HTMLElement,
            },
            position: panel.querySelector('[data-field="position"]') as HTMLElement,
            avg: panel.querySelector('[data-field="avg"]') as HTMLElement,
            exitOrders: panel.querySelector('.exitOrders') as HTMLElement,
            quantity: panel.querySelector('[data-field="quantity"]') as HTMLInputElement,
        };
        symbolElements.set(item.symbol, elements);
        panel.querySelector('[data-action="use-percent"]')?.addEventListener('click', () => {
            elements.quantity.value = '%';
        });
        panel.querySelector('[data-action="use-100"]')?.addEventListener('click', () => {
            elements.quantity.value = '100';
        });
        panel.addEventListener('click', () => callbacks.onActiveSymbolChange(item.symbol));
        panel.addEventListener('mouseover', () => {
            callbacks.onActiveSymbolChange(item.symbol);
            panel.classList.add('active');
        });
        panel.addEventListener('mouseleave', () => panel.classList.remove('active'));
    });

    document.getElementById('reconnectButton')?.addEventListener('click', callbacks.onReconnect);
    return symbolElements;
};
