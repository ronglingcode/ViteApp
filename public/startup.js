console.log('startup.js loaded');
window.HybridApp = {
    UIState: {
        activeSymbol: '',
        activeTabIndex: -1
    },
    Secrets: {
        tdameritrade: {},
        tradeStation: {},
        schwab: {},
    },
    SymbolData: new Map(),
    Widgets: new Map(),
};
window.TradingApp = {};
