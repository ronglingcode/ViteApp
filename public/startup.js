console.log('startup.js loaded');
window.HybridApp = {
    UIState: {
        activeSymbol: '',
        activeTabIndex: -1,
    },
    Secrets: {
        tdameritrade: {},
        schwab: {},
    },
    SymbolData: new Map(),
    Widgets: new Map(),
};
window.TradingApp = {};
