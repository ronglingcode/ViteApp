import type * as Models from '../models/models';
import * as LightweightCharts from 'sunrise-tv-lightweight-charts';
import * as ChartSettings from './chartSettings';
export interface PopupOptions {
    symbol: string;
    isLong: boolean;
    candles: Models.CandlePlus[];
    timeFrame: number;
    keyLevels: number[];
    message: string;
}
export class Popup {
    private popupElement: HTMLDivElement;
    private onYesCallback: () => void;

    constructor(options: PopupOptions, onYes: () => void) {
        this.onYesCallback = onYes;
        this.popupElement = this.createPopup(options);
        document.body.appendChild(this.popupElement);
    }

    private createPopup(options: PopupOptions): HTMLDivElement {
        const popupContainer = document.createElement('div');
        popupContainer.style.position = 'fixed';
        popupContainer.style.top = '50%';
        popupContainer.style.left = '50%';
        popupContainer.style.transform = 'translate(-50%, -50%)';
        popupContainer.style.backgroundColor = '#fff';
        popupContainer.style.border = '1px solid #ccc';
        popupContainer.style.padding = '20px';
        popupContainer.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
        popupContainer.style.zIndex = '1000';
        const placeHolder1 = document.createElement('div');
        placeHolder1.style.height = '100px';
        placeHolder1.style.width = '100px';
        popupContainer.appendChild(placeHolder1);

        const messageElement = document.createElement('p');
        let direction = options.isLong ? 'Long' : 'Short';
        messageElement.textContent = `${options.symbol} ${direction} ${options.message}`;

        popupContainer.appendChild(messageElement);

        const buttonContainer = document.createElement('div');
        buttonContainer.style.marginTop = '10px';
        buttonContainer.style.textAlign = 'right';

        const yesButton = document.createElement('button');
        yesButton.textContent = 'Yes';
        yesButton.style.marginRight = '10px';
        yesButton.onclick = () => this.handleYesClick();

        const noButton = document.createElement('button');
        noButton.textContent = 'No';
        noButton.onclick = () => this.close();

        buttonContainer.appendChild(yesButton);
        buttonContainer.appendChild(noButton);
        popupContainer.appendChild(buttonContainer);

        const placeHolder2 = document.createElement('div');
        let lwChart = LightweightCharts.createChart(placeHolder2, {
            ...ChartSettings.getPopupChartSettings(),
        });
        let candleSeries = lwChart.addCandlestickSeries(ChartSettings.candlestickSeriesSettings);
        candleSeries.setData(options.candles);
        options.keyLevels.forEach(keyLevel => {
            candleSeries.createPriceLine({
                price: keyLevel,
                color: 'blue',
                title: "key level",
                axisLabelVisible: true
            });
        });

        popupContainer.appendChild(placeHolder2);
        return popupContainer;
    }

    private handleYesClick(): void {
        this.onYesCallback();
        this.close();
    }

    private close(): void {
        if (this.popupElement.parentElement) {
            this.popupElement.parentElement.removeChild(this.popupElement);
        }
    }
}
