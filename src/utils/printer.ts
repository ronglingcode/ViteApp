import type * as TradingPlansModels from '../models/tradingPlans/tradingPlansModels';
import * as TradingPlan from '../models/tradingPlans/tradingPlans';
export const printStockPlan = (root: HTMLElement, plan: TradingPlansModels.TradingPlans) => {
    let symbol = plan.symbol;
    let title = `${symbol} - ATR: $${plan.atr.average}`;
    addBoldText(root, title);
    let analysis = plan.analysis;
    addTable(root, plan);
    addText(root, `Default setup quality: ${plan.defaultConfigs.setupQuality}`);
    addTargets(root, "Profit targets for long", plan.analysis.profitTargetsForLong);
    addTargets(root, "Profit targets for short", plan.analysis.profitTargetsForShort);
    addText(root, " ");
}
const addListItem = (list: HTMLElement, text: string) => {
    let ele = document.createElement("li");
    ele.textContent = text;
    list.appendChild(ele);
}
const addList = (root: HTMLElement, title: string, items: string[]) => {
    addText(root, title);
    let list = document.createElement("ul");
    items.forEach(item => {
        addListItem(list, item);
    });
    root.appendChild(list);
}
const addBoldText = (root: HTMLElement, text: string) => {
    let ele = document.createElement("div");
    ele.textContent = text;
    ele.style.fontWeight = "bold";
    root.appendChild(ele);
}
const addText = (root: HTMLElement, text: string) => {
    let ele = document.createElement("div");
    ele.textContent = text;
    root.appendChild(ele);
}
const addTableCell = (r: HTMLElement, cell: string) => {
    let c1 = document.createElement("td");
    c1.textContent = cell;
    r.appendChild(c1);
}
const addTableRow = (t: HTMLElement, cell1: string, cell2: string) => {
    let row = document.createElement("tr");
    addTableCell(row, cell1);
    addTableCell(row, cell2);
    t.appendChild(row);
}
const addTable = (root: HTMLElement, plan: TradingPlansModels.TradingPlans) => {
    let analysis = plan.analysis;
    let table = document.createElement("table");
    table.style.width = "100%";
    let keyLevelText = levelAreaToString(TradingPlan.getSingleMomentumLevel(plan));
    root.appendChild(table);
}
const levelAreaToString = (level: TradingPlansModels.LevelArea) => {
    if (level.low === level.high) {
        return `${level.low}`;
    } else {
        return `${level.low} - ${level.high}`;
    }
}
const addTargets = (root: HTMLElement, title: string, targets: TradingPlansModels.ProfitTargets) => {
    addText(root, title);
    let text = `Target levels: ${targets.targets}, will blow past those levels ${targets.willBlowPastThoseLevels}. `;
    text += targets.summary;
    addText(root, text);
}