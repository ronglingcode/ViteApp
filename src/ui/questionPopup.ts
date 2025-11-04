import * as Models from '../models/models';
import * as TraderFocus from '../controllers/traderFocus';
import * as Chart from '../ui/chart';
import * as AutoTrader from '../algorithms/autoTrader';
import * as Firestore from '../firestore';
import * as TradebooksManager from '../tradebooks/tradebooksManager';
import * as AboveWaterBreakout from '../tradebooks/singleKeyLevel/aboveWaterBreakout';
export const show = (symbol: string) => {
    let chartWidget = Models.getChartWidget(symbol);
    if (!chartWidget)
        return;
    let popupWindow = chartWidget.htmlContents.popupWindow;
    console.log(chartWidget.tradebooks);
    let tradebook = TraderFocus.getTradebookFromPosition(symbol);
    if (!tradebook)
        return;
    if (tradebook.getID() == AboveWaterBreakout.AboveWaterBreakout.aboveWaterBreakout) {
        return;
    }

    let tradebookName = tradebook.name;
    let questionHtml = popupWindow.getElementsByClassName("question")[0];
    questionHtml.textContent = `${tradebookName}: conditions to fail:`;
    let tradeManagement = tradebook.getTradeManagementInstructions();
    let conditionsToFail = tradeManagement.conditionsToFail;
    chartWidget.chartState.hiddenAnswer = conditionsToFail[0];
    popupWindow.style.display = 'block';

    let charts = Models.getChartsHtmlInAllTimeframes(symbol);
    charts.forEach(chart => {
        chart.style.display = 'none';
    });
};

export const checkAnswer = (symbol: string) => {
    let chartWidget = Models.getChartWidget(symbol);
    if (!chartWidget)
        return;

    let popupWindow = chartWidget.htmlContents.popupWindow;
    let answerHtml = popupWindow.getElementsByClassName("answer")[0] as HTMLInputElement;
    let actual = answerHtml.value;
    let expected = chartWidget.chartState.hiddenAnswer;
    if (actual == expected) {
        hide(chartWidget);
    } else {
        Firestore.logError(`${actual} != ${expected}`);
    }
    answerHtml.value = '';
};
export const hide = (chartWidget: Models.ChartWidget) => {
    let popupWindow = chartWidget.htmlContents.popupWindow;
    popupWindow.style.display = 'none';
    let timeframe = AutoTrader.getTimeFrameToUse();
    Chart.showChartForTimeframe(chartWidget.symbol, timeframe);
}