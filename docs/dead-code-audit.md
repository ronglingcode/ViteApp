# Dead-code review after removing replay and Lite

Audit of the main app, [src/main.ts](C:/Users/lingr/trading/ViteApp/src/main.ts:1), and its worker. 128 TypeScript source files inspected; 106 modules have a potential runtime import path. No review candidates below have been deleted.

Findings: **9 disconnected source files**, **24 private functions without a static path**, **122 other exported functions without a static path**, **1 test-only exported function**, and **1 compiler-confirmed unreachable block**.

Enter yes or no in the **Remove? (yes/no)** column. Blank means undecided. Decisions are preserved when the audit is regenerated.

## Scope and evidence

- Import reachability follows local imports, re-exports, literal dynamic imports, and the worker created with new URL. Type-only dependencies are retained.
- Callable reachability follows TypeScript-resolved symbol references from module initialization and exported APIs exposed through window.HybridApp. Uncalled helper chains are included, even when helpers reference each other.
- Exports exposed as whole namespaces, registered callbacks, constructed classes, and dependencies in all branches are conservatively retained. Disabled settings alone do not classify code as dead.
- This is a static inventory of the checked-in main app. It cannot prove every possible dynamic call in remote scripts, browser-console commands, reflective class methods, or future configuration. Exported-function findings require that review before deletion. Classes are treated conservatively; individual virtual methods and local variables are not deletion recommendations.
- Tests, build tools, docs, public assets, secret_template.ts, and type-only modules are not classified as unused application modules. The old helper.test.ts scratch file is listed separately.
- Re-run with node scripts/auditDeadCode.mjs. Exact records: [docs/dead-code-audit.json](C:/Users/lingr/trading/ViteApp/docs/dead-code-audit.json:1).

## Disconnected files

These files have no dependency path from either application entry, including type-only paths. None is referenced by the checked-in TypeScript tests.

| File | Approximate lines | What it contains | Remove? (yes/no) |
| --- | ---: | --- | --- |
| [src/algorithms/strategies.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/strategies.ts:1) | 10 | Unused R2 target configuration. |  |
| [src/api/proxyServer.ts](C:/Users/lingr/trading/ViteApp/src/api/proxyServer.ts:1) | 20 | Unused agent-response persistence client. |  |
| [src/models/atr.ts](C:/Users/lingr/trading/ViteApp/src/models/atr.ts:1) | 8 | Unused ATR percentage formatting helper. |  |
| [src/patterns/allTimeHigh.ts](C:/Users/lingr/trading/ViteApp/src/patterns/allTimeHigh.ts:1) | 23 | Unused all-time-high detector. |  |
| [src/patterns/camPivots.ts](C:/Users/lingr/trading/ViteApp/src/patterns/camPivots.ts:1) | 115 | Unused Camarilla pattern logic; the active indicators/camPivots.ts is separate. |  |
| [src/tradebooks/singleKeyLevel/commonRules.ts](C:/Users/lingr/trading/ViteApp/src/tradebooks/singleKeyLevel/commonRules.ts:1) | 36 | Unused single-key-level rule helpers. |  |
| [src/tradebooks/tradebookUtil.ts](C:/Users/lingr/trading/ViteApp/src/tradebooks/tradebookUtil.ts:1) | 7 | Unused tradebook button status helper. |  |
| [src/ui/popup.ts](C:/Users/lingr/trading/ViteApp/src/ui/popup.ts:1) | 91 | Unused candlestick popup; the active questionPopup.ts is separate. |  |
| [src/utils/entryThresholdValidator.ts](C:/Users/lingr/trading/ViteApp/src/utils/entryThresholdValidator.ts:1) | 87 | Unused threshold validator; also contains code after an unconditional return. |  |

## Private functions with no static path

These functions are not exported, have no reachable call/reference chain, and are not registered callbacks. Some are called only by other functions in this inventory; remove a complete unused chain together.

| Location | Function | Remove? (yes/no) |
| --- | --- | --- |
| [src/algorithms/autoTrader.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/autoTrader.ts:271) | scheduleSecondMinuteCloseEvent |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:17) | getTotalRange |  |
| [src/algorithms/riskManager.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/riskManager.ts:54) | orOverride |  |
| [src/algorithms/riskManager.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/riskManager.ts:95) | getRiskMultiplerForNextEntry2 |  |
| [src/algorithms/riskManager.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/riskManager.ts:114) | getRiskInDollarForNextEntry |  |
| [src/api/schwab/api.ts](C:/Users/lingr/trading/ViteApp/src/api/schwab/api.ts:431) | filterOrdersNotOnSameDay |  |
| [src/api/schwab/api.ts](C:/Users/lingr/trading/ViteApp/src/api/schwab/api.ts:745) | logErrorForObject |  |
| [src/api/schwab/orderFactory.ts](C:/Users/lingr/trading/ViteApp/src/api/schwab/orderFactory.ts:162) | copySingleOrder |  |
| [src/api/tdAmeritrade/api.ts](C:/Users/lingr/trading/ViteApp/src/api/tdAmeritrade/api.ts:22) | placeOrderBase |  |
| [src/api/tdAmeritrade/api.ts](C:/Users/lingr/trading/ViteApp/src/api/tdAmeritrade/api.ts:52) | getOrdersForSymbol |  |
| [src/api/tdAmeritrade/api.ts](C:/Users/lingr/trading/ViteApp/src/api/tdAmeritrade/api.ts:60) | filterOrdersForSymbol |  |
| [src/api/tdAmeritrade/api.ts](C:/Users/lingr/trading/ViteApp/src/api/tdAmeritrade/api.ts:73) | getOrderSymbol |  |
| [src/api/tdAmeritrade/orderFactory.ts](C:/Users/lingr/trading/ViteApp/src/api/tdAmeritrade/orderFactory.ts:136) | copySingleOrder |  |
| [src/api/tdAmeritrade/orderFactory.ts](C:/Users/lingr/trading/ViteApp/src/api/tdAmeritrade/orderFactory.ts:169) | createOcoOrder |  |
| [src/api/tdAmeritrade/orderFactory.ts](C:/Users/lingr/trading/ViteApp/src/api/tdAmeritrade/orderFactory.ts:174) | createOcoOrderFromTwoLegs |  |
| [src/controllers/entryHandler.ts](C:/Users/lingr/trading/ViteApp/src/controllers/entryHandler.ts:19) | getOrderType |  |
| [src/controllers/streamingHandler.ts](C:/Users/lingr/trading/ViteApp/src/controllers/streamingHandler.ts:59) | handleOrderRejection |  |
| [src/models/tradingState.ts](C:/Users/lingr/trading/ViteApp/src/models/tradingState.ts:12) | getDefaultAtr |  |
| [src/tools/tradingview.ts](C:/Users/lingr/trading/ViteApp/src/tools/tradingview.ts:55) | generateForOneTrade |  |
| [src/ui/chart.ts](C:/Users/lingr/trading/ViteApp/src/ui/chart.ts:245) | updateToolTip |  |
| [src/ui/chart.ts](C:/Users/lingr/trading/ViteApp/src/ui/chart.ts:263) | updateHoveredCandle |  |
| [src/ui/chart.ts](C:/Users/lingr/trading/ViteApp/src/ui/chart.ts:1442) | runPostCandleCloseIndicators |  |
| [src/ui/chart.ts](C:/Users/lingr/trading/ViteApp/src/ui/chart.ts:1446) | checkVwapBeforeOpen |  |
| [src/ui/chart.ts](C:/Users/lingr/trading/ViteApp/src/ui/chart.ts:1468) | hideButtonAfterSeconds |  |

## Exported functions without a static path

These are absent from the reachable call graph and are not exposed as whole namespaces by the main app. Keep each containing module: other functions in the same file are still active. Confirm no external consumer calls a function before deleting it.

| Location | Function | Remove? (yes/no) |
| --- | --- | --- |
| [src/algorithms/gapAndGoAlgo.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/gapAndGoAlgo.ts:30) | validateEntry |  |
| [src/algorithms/gapAndGoAlgo.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/gapAndGoAlgo.ts:93) | getAllowedReasonToAddPartial |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:20) | getBodyRatio |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:25) | isRedOpenBar |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:31) | isGreenOpenBar |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:38) | hasBreakoutOccurredForNewCandle |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:45) | isFalseBreakoutForNewCandle |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:54) | hasGreenBarSinceOpen |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:67) | hasRedBarSinceOpen |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:78) | firstBarIsPinBar |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:90) | isPriceOutsideLevel |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:97) | isBarClosed |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:104) | isPriceInLowerRange |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:111) | isPriceInUpperRange |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:118) | hasLostVwapMomentum |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:142) | isPriceAboveVwap |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:151) | isFirstRetracement |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:185) | isBarSameDirection |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:193) | isConsecutiveBarsSameDirection |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:210) | analyzeBreakoutPatterns |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:243) | hasClosedBeyondPrice |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:256) | getFirstCandleClosedBeyondPrice |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:268) | hasConfirmationForBreakoutEntry |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:295) | hasFalseHighOfDayBreakout |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:336) | hasFalseBreakout |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:345) | hasConfirmationForMarketEntry |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:371) | getFirstNewHighLowPrice |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:397) | checkFirstNewHighPattern |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:453) | hasPremarketBreakout |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:461) | getOpenExtensionFromVwapInAtr |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:475) | hasRetracementFromPremarket |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:495) | getFirstPullbackStatus |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:568) | isPriceWorseThanVwap |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:576) | isPriceWorseThanKeyLevel |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:588) | hasLostKeyLevel |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:712) | hasClosedOutsideVwap |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:730) | hasPullbackToVwapBeforeOpen |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:758) | isHigherLows |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:773) | isLowerHighs |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:788) | getMinimumDistanceToVwap |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:793) | getDirectionalDistanceToVwap |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:800) | getFirstBreakoutCandle |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:816) | hasLevelRetest |  |
| [src/algorithms/patterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/patterns.ts:825) | hasApproachedTargetToAdd |  |
| [src/algorithms/rules.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/rules.ts:21) | isTimingAndEntryAllowedForHigherTimeframe |  |
| [src/algorithms/rules.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/rules.ts:60) | checkVwap |  |
| [src/algorithms/rules.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/rules.ts:90) | checkOpenCandle |  |
| [src/algorithms/rules.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/rules.ts:133) | entryJustHappened |  |
| [src/algorithms/rules.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/rules.ts:143) | checkForMidRangeBreakout |  |
| [src/algorithms/rules.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/rules.ts:159) | atMostHalfPositionForMarketOrder |  |
| [src/algorithms/rules.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/rules.ts:171) | checkForMinimumPositionSize |  |
| [src/algorithms/rules.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/rules.ts:196) | isShortAboveLastResistance |  |
| [src/algorithms/rules.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/rules.ts:213) | isLongBelowLastSupport |  |
| [src/algorithms/rules.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/rules.ts:233) | checkTightenStop |  |
| [src/algorithms/rules.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/rules.ts:254) | isIncreasingTarget |  |
| [src/algorithms/rules.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/rules.ts:265) | isBlockedByTiming |  |
| [src/algorithms/rules.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/rules.ts:269) | isBlockedByDeferTrading |  |
| [src/algorithms/rules.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/rules.ts:275) | isBlockedByAfterTrading |  |
| [src/algorithms/rules.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/rules.ts:282) | isAfterOpeningMomentum |  |
| [src/algorithms/rules.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/rules.ts:299) | isLossWhenHoldingVwap |  |
| [src/algorithms/rules.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/rules.ts:307) | isAllowedForAddedPosition |  |
| [src/algorithms/rules.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/rules.ts:329) | isEntryAfterTopPick |  |
| [src/algorithms/rules.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/rules.ts:352) | isEntryPriceInMomentum |  |
| [src/algorithms/rules.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/rules.ts:384) | isSpreadTooLarge |  |
| [src/algorithms/rules.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/rules.ts:417) | isGreaterThanMinimumDistance |  |
| [src/algorithms/rules.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/rules.ts:425) | allowedFirstMinuteByDailyChartGap |  |
| [src/algorithms/rules.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/rules.ts:444) | isReverseOfMomentumCandle |  |
| [src/algorithms/rules.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/rules.ts:468) | getDisallowedReasonBasedOnOpenPriceZone |  |
| [src/algorithms/rules.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/rules.ts:502) | isAllowedByVwapContinuation |  |
| [src/algorithms/rules.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/rules.ts:554) | isNewTradeAfterStopOut |  |
| [src/algorithms/vwap.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/vwap.ts:3) | isAgainstPremarketVwapStrongTrend |  |
| [src/algorithms/vwap.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/vwap.ts:8) | isAgainstCurrentVwap |  |
| [src/algorithms/vwap.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/vwap.ts:47) | getPremarketTrendText |  |
| [src/algorithms/vwap.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/vwap.ts:59) | isCrossed |  |
| [src/algorithms/vwapPatterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/vwapPatterns.ts:5) | test |  |
| [src/algorithms/vwapPatterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/vwapPatterns.ts:121) | getStatusForVwapPushdownFail |  |
| [src/algorithms/vwapPatterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/vwapPatterns.ts:170) | getAboveWaterMomentumForPrice |  |
| [src/algorithms/vwapPatterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/vwapPatterns.ts:194) | getStatusForOpenDrive |  |
| [src/algorithms/vwapPatterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/vwapPatterns.ts:236) | hasTwoConsecutiveCandlesAgainstLevel |  |
| [src/algorithms/vwapPatterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/vwapPatterns.ts:253) | hasTwoConsecutiveCandlesAgainstLevelAfterCloseAbove |  |
| [src/algorithms/vwapPatterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/vwapPatterns.ts:286) | hasTwoConsecutiveCandlesAgainstVwap |  |
| [src/algorithms/vwapPatterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/vwapPatterns.ts:312) | hasMostRecentClosedCandleAgainstVwap |  |
| [src/algorithms/vwapPatterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/vwapPatterns.ts:328) | getNumberOfCandlesClosedAgainstVwap |  |
| [src/algorithms/vwapPatterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/vwapPatterns.ts:351) | isVwapContinuationEntry |  |
| [src/algorithms/vwapPatterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/vwapPatterns.ts:366) | isNearAgainstVwap |  |
| [src/algorithms/vwapPatterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/vwapPatterns.ts:377) | isNearAlignWithVwap |  |
| [src/algorithms/vwapPatterns.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/vwapPatterns.ts:389) | isNearAgainstLevel |  |
| [src/api/schwab/orderFactory.ts](C:/Users/lingr/trading/ViteApp/src/api/schwab/orderFactory.ts:157) | copyOrder |  |
| [src/api/schwab/orderFactory.ts](C:/Users/lingr/trading/ViteApp/src/api/schwab/orderFactory.ts:247) | extractTopLevelCancelableOrdersIds |  |
| [src/api/schwab/orderFactory.ts](C:/Users/lingr/trading/ViteApp/src/api/schwab/orderFactory.ts:334) | filterToEquityOrders |  |
| [src/api/schwab/orderFactory.ts](C:/Users/lingr/trading/ViteApp/src/api/schwab/orderFactory.ts:372) | extractEntryOrdersIds |  |
| [src/api/schwab/orderFactory.ts](C:/Users/lingr/trading/ViteApp/src/api/schwab/orderFactory.ts:544) | isSellOrder |  |
| [src/api/schwab/orderFactory.ts](C:/Users/lingr/trading/ViteApp/src/api/schwab/orderFactory.ts:667) | extractTradeExecutions |  |
| [src/api/schwab/orderFactory.ts](C:/Users/lingr/trading/ViteApp/src/api/schwab/orderFactory.ts:728) | generateExecutionScript |  |
| [src/api/tdAmeritrade/orderFactory.ts](C:/Users/lingr/trading/ViteApp/src/api/tdAmeritrade/orderFactory.ts:63) | getClosingOrderLegInstruction |  |
| [src/api/tdAmeritrade/orderFactory.ts](C:/Users/lingr/trading/ViteApp/src/api/tdAmeritrade/orderFactory.ts:131) | copyOrder |  |
| [src/api/tdAmeritrade/orderFactory.ts](C:/Users/lingr/trading/ViteApp/src/api/tdAmeritrade/orderFactory.ts:180) | createOneEntryWithTwoExits |  |
| [src/api/tdAmeritrade/orderFactory.ts](C:/Users/lingr/trading/ViteApp/src/api/tdAmeritrade/orderFactory.ts:201) | createOcoExitOrder |  |
| [src/api/tdAmeritrade/orderFactory.ts](C:/Users/lingr/trading/ViteApp/src/api/tdAmeritrade/orderFactory.ts:214) | extractTopLevelCancelableOrdersIds |  |
| [src/api/tdAmeritrade/orderFactory.ts](C:/Users/lingr/trading/ViteApp/src/api/tdAmeritrade/orderFactory.ts:313) | extractEntryOrdersIds |  |
| [src/api/tdAmeritrade/orderFactory.ts](C:/Users/lingr/trading/ViteApp/src/api/tdAmeritrade/orderFactory.ts:473) | isSellOrder |  |
| [src/api/tdAmeritrade/orderFactory.ts](C:/Users/lingr/trading/ViteApp/src/api/tdAmeritrade/orderFactory.ts:572) | extractTradeExecutions |  |
| [src/api/tdAmeritrade/orderFactory.ts](C:/Users/lingr/trading/ViteApp/src/api/tdAmeritrade/orderFactory.ts:633) | generateExecutionScript |  |
| [src/api/tradeStation/api.ts](C:/Users/lingr/trading/ViteApp/src/api/tradeStation/api.ts:41) | testOrder |  |
| [src/api/tradeStation/api.ts](C:/Users/lingr/trading/ViteApp/src/api/tradeStation/api.ts:57) | test1 |  |
| [src/api/tradeStation/api.ts](C:/Users/lingr/trading/ViteApp/src/api/tradeStation/api.ts:153) | renewRefreshToken |  |
| [src/api/tradeStation/api.ts](C:/Users/lingr/trading/ViteApp/src/api/tradeStation/api.ts:170) | buildUrlForGetRefreshToken |  |
| [src/bookmap/executionBridge.ts](C:/Users/lingr/trading/ViteApp/src/bookmap/executionBridge.ts:31) | registerExecutionAccountRefresh |  |
| [src/config/secret.ts](C:/Users/lingr/trading/ViteApp/src/config/secret.ts:1) | openai |  |
| [src/controllers/adjustExitsHandler.ts](C:/Users/lingr/trading/ViteApp/src/controllers/adjustExitsHandler.ts:10) | onAdjustExits |  |
| [src/controllers/adjustExitsHandler.ts](C:/Users/lingr/trading/ViteApp/src/controllers/adjustExitsHandler.ts:26) | getSnapPriceForAdjustStops |  |
| [src/controllers/adjustExitsHandler.ts](C:/Users/lingr/trading/ViteApp/src/controllers/adjustExitsHandler.ts:65) | adjustAllStopExitsWithoutRule |  |
| [src/controllers/entryHandler.ts](C:/Users/lingr/trading/ViteApp/src/controllers/entryHandler.ts:12) | getLogTagsForEntryAction |  |
| [src/controllers/exitRulesCheckerSimple.ts](C:/Users/lingr/trading/ViteApp/src/controllers/exitRulesCheckerSimple.ts:27) | isAllowedForSingle |  |
| [src/controllers/exitRulesCheckerSimple.ts](C:/Users/lingr/trading/ViteApp/src/controllers/exitRulesCheckerSimple.ts:111) | isLessTightThanClosedCandlesForAdjustStop |  |
| [src/controllers/streamingHandler.ts](C:/Users/lingr/trading/ViteApp/src/controllers/streamingHandler.ts:39) | handleMessageData |  |
| [src/controllers/streamingHandler.ts](C:/Users/lingr/trading/ViteApp/src/controllers/streamingHandler.ts:54) | handleTradeUpdates |  |
| [src/data/db.ts](C:/Users/lingr/trading/ViteApp/src/data/db.ts:773) | getPremarketTradingAmountInMillionDollars |  |
| [src/data/db.ts](C:/Users/lingr/trading/ViteApp/src/data/db.ts:778) | getExtremePrice |  |
| [src/data/db.ts](C:/Users/lingr/trading/ViteApp/src/data/db.ts:842) | addDataAndUpdateChart |  |
| [src/ui/chartSettings.ts](C:/Users/lingr/trading/ViteApp/src/ui/chartSettings.ts:76) | getPopupChartSettings |  |
| [src/utils/calculator.ts](C:/Users/lingr/trading/ViteApp/src/utils/calculator.ts:36) | getPercentageString |  |

## Used by tests, without a production call path

| Location | Function | Test consumer | Remove? (yes/no) |
| --- | --- | --- | --- |
| [src/bookmap/executionMetadata.ts](C:/Users/lingr/trading/ViteApp/src/bookmap/executionMetadata.ts:20) | getBrokerObservation | [src/bookmap/directExecution.test.ts](C:/Users/lingr/trading/ViteApp/src/bookmap/directExecution.test.ts:1) |  |

## Compiler-confirmed unreachable code

| Location | Code | Evidence | Remove? (yes/no) |
| --- | --- | --- | --- |
| [src/utils/entryThresholdValidator.ts](C:/Users/lingr/trading/ViteApp/src/utils/entryThresholdValidator.ts:37) | validateEntryThreshold tail | Lines 37–81. TypeScript TS7027: Unreachable code detected. An unconditional return true precedes the remaining timing/ORB logic. The whole file is also disconnected. |  |

## Old test scratch file

| File | Reason | Remove? (yes/no) |
| --- | --- | --- |
| [src/utils/helper.test.ts](C:/Users/lingr/trading/ViteApp/src/utils/helper.test.ts:1) | No test cases are registered; only a top-level helper call and a commented LitElement/Snowpack test remain. It is not run by the package scripts. |  |

## Keep these dependencies

- [src/config/profiles/profiles.ts](C:/Users/lingr/trading/ViteApp/src/config/profiles/profiles.ts:1): required by type imports; runtime absence is expected.
- [src/notifications/types.ts](C:/Users/lingr/trading/ViteApp/src/notifications/types.ts:1): required by type imports; runtime absence is expected.
- [src/workers/marketDataMessages.ts](C:/Users/lingr/trading/ViteApp/src/workers/marketDataMessages.ts:1): required by type imports; runtime absence is expected.
- [src/config/secret_template.ts](C:/Users/lingr/trading/ViteApp/src/config/secret_template.ts:1): setup template, not an application entry.

Whole-namespace exports retained because they can be called externally:

- [src/algorithms/autoTrader.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/autoTrader.ts:1)
- [src/algorithms/riskManager.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/riskManager.ts:1)
- [src/algorithms/takeProfit.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/takeProfit.ts:1)
- [src/algorithms/watchlist.ts](C:/Users/lingr/trading/ViteApp/src/algorithms/watchlist.ts:1)
- [src/api/broker.ts](C:/Users/lingr/trading/ViteApp/src/api/broker.ts:1)
- [src/api/marketData.ts](C:/Users/lingr/trading/ViteApp/src/api/marketData.ts:1)
- [src/api/schwab/api.ts](C:/Users/lingr/trading/ViteApp/src/api/schwab/api.ts:1)
- [src/api/tdAmeritrade/api.ts](C:/Users/lingr/trading/ViteApp/src/api/tdAmeritrade/api.ts:1)
- [src/config/config.ts](C:/Users/lingr/trading/ViteApp/src/config/config.ts:1)
- [src/controllers/handler.ts](C:/Users/lingr/trading/ViteApp/src/controllers/handler.ts:1)
- [src/controllers/orderFlow.ts](C:/Users/lingr/trading/ViteApp/src/controllers/orderFlow.ts:1)
- [src/controllers/orderFlowManager.ts](C:/Users/lingr/trading/ViteApp/src/controllers/orderFlowManager.ts:1)
- [src/controllers/traderFocus.ts](C:/Users/lingr/trading/ViteApp/src/controllers/traderFocus.ts:1)
- [src/firestore.ts](C:/Users/lingr/trading/ViteApp/src/firestore.ts:1)
- [src/models/models.ts](C:/Users/lingr/trading/ViteApp/src/models/models.ts:1)
- [src/models/tradingPlans/tradingPlans.ts](C:/Users/lingr/trading/ViteApp/src/models/tradingPlans/tradingPlans.ts:1)
- [src/models/tradingState.ts](C:/Users/lingr/trading/ViteApp/src/models/tradingState.ts:1)
- [src/notifications/notificationEngine.ts](C:/Users/lingr/trading/ViteApp/src/notifications/notificationEngine.ts:1)
- [src/ui/chart.ts](C:/Users/lingr/trading/ViteApp/src/ui/chart.ts:1)
- [src/ui/questionPopup.ts](C:/Users/lingr/trading/ViteApp/src/ui/questionPopup.ts:1)
- [src/ui/ui.ts](C:/Users/lingr/trading/ViteApp/src/ui/ui.ts:1)
- [src/utils/helper.ts](C:/Users/lingr/trading/ViteApp/src/utils/helper.ts:1)
- [src/utils/timeHelper.ts](C:/Users/lingr/trading/ViteApp/src/utils/timeHelper.ts:1)
- [src/utils/webRequest.ts](C:/Users/lingr/trading/ViteApp/src/utils/webRequest.ts:1)

## Verification of the feature removal

- Production TypeScript check and Vite build pass with one HTML app and one market-data worker. Mock-socket checks verify worker start/stop, subscription, trades, quotes, and account activity.
- Direct-execution checks pass; the 19 extended handler fixtures match both repository copies; native-entry-state test passes.
- Bookmap price, VWAP, wall-threshold, position transition, core-target exit, and exit-pair tests pass (19 tests).
- Proxy route registration and local request checks verify that replay returns 404 while existing save endpoints validate invalid requests. No broker requests were sent.
- Backtest research/replay tools and existing recording data are outside this feature removal.
