# ViteApp dead-code and inactive-feature review

Reviewed October 4, 2026. Application source was left unchanged. This report supersedes the old audit inventory for the current checkout, while preserving its review decisions.

Inspected 173 TypeScript sources, with 134 potentially loaded modules from main.ts and its market-data worker. Found **9 disconnected source files with no local test/generator consumers**, **9 headless/test-only dependency files**, **153 callable candidates without a static app/test/generator call path** (29 private and 124 exported), **14 additional callables retained for tests/fixtures**, **181 exports whose application reachability depends on browser-global exposure**, **5 unreferenced class methods**, **36 constants/enum members without runtime symbol references**, and **1 compiler-confirmed unreachable block**. Counts overlap by feature; do not add them as independent features.

## Scope and interpretation

- Import graph follows local imports, type dependencies, re-exports, literal dynamic imports and the worker URL. Tests, setup templates, fixture JSON and build scripts are not discarded because they are absent from the SPA.
- Callable scan follows TypeScript-resolved symbol references through module initialization, callbacks and inherited class bodies. The repository audit script misses runtime heritage expressions; this review corrects that in its analysis, so Tradebook, MassiveApi, marketEntryWithoutRules and selectMarketEntryEstimate are retained.
- Unused imports can keep files inside the import graph even when every callable in the file is unused. Module load reachability alone does not establish a live feature.
- Browser globals are intentional public surfaces. An absent internal caller is a cleanup candidate, not proof that a console command or remote script cannot call it. Namespace exposure and reflected class methods remain conservative.
- Generator/test references were checked separately. The headless TradingRuntime is explicitly documented in src/trading/README.md as a mirrored parity implementation; it does not bootstrap the browser. Keep its tests/fixtures and shared Java parity contract in view.
- Static inspection cannot prove all dynamic behavior. Externally loaded recentData.js and ad hoc console commands were not fetched or executed. Class method/property reflection and runtime mutation of exposed configuration can re-enable dormant branches.
- Both TypeScript configurations pass their normal checks. Enabling noUnusedLocals/noUnusedParameters produces 192 diagnostics (listed below); many are intentionally unused callback/interface parameters and are not failed normal builds. No browser or live broker/Firestore action was executed; production build and runtime tests were not run for this review.

## Feature/path findings

| Feature/path | Evidence | Classification |
| --- | --- | --- |
| [Unreachable ORB/timing checks](C:/Users/lingr/code/ViteApp/src/utils/entryThresholdValidator.ts:35) | An unconditional return true makes lines 37–81 unreachable (TS7027). The entire file also has no app import path. | Dead path, unused code or inert implementation |
| [Test popup button](C:/Users/lingr/code/ViteApp/src/main.ts:127) | The visible button installs an empty click callback. index.html:254 contains the control; it never opens a popup. | Dead path, unused code or inert implementation |
| [Breakeven hotkey E](C:/Users/lingr/code/ViteApp/src/controllers/keyboardHandler.ts:72) | Only logs that movement is disabled; the call to moveToInitialEntry is commented. The implementation survives through the Handler browser global. | Dead path, unused code or inert implementation |
| [Hotkey U](C:/Users/lingr/code/ViteApp/src/controllers/keyboardHandler.ts:80) | Recognized and logged, but its action branch is empty. | Dead path, unused code or inert implementation |
| [Automatic 5m/15m chart switching](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:361) | showChartForTimeframe ignores _timeframe and always displays chartM1. AutoTrader.getTimeFrameToUse (line 119), updateChartTimeFrame and its minute timer therefore cannot switch displays. Models.getChartsInAllTimeframes/getChartsHtmlInAllTimeframes return only M1 (lines 1621/1627); no timeframebuttons markup exists. Higher-timeframe aggregation remains callable separately. | Dead path, unused code or inert implementation |
| [Legacy tradebook button builder](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:1525) | The sole concrete tradebook returns the nonempty default entry-method list (1 R / 0.1 R); createTradebookUI always returns createTradebookUINew. The fallback main button, 1st High/Low, Cur High/Low, market-with-tight-stop, stats/sizing container and associated listeners at lines 1531–1606 cannot be built by current strategies. The A/B sizing buttons are commented as well. | Dead path, unused code or inert implementation |
| [First-new-high/current-candle entry alternatives](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:489) | The old fallback buttons are unreachable. Active buttons and default parameters set both switches false; BookmapWallReversal.triggerEntry passes default parameters to getBreakoutEntryPrice (line 146). The helpers remain callable from Chart globals. | Dead path, unused code or inert implementation |
| [Tradebook live statistics](C:/Users/lingr/code/ViteApp/src/tradebooks/bookmapWallReversal.ts:67) | refreshLiveStats is empty for the only concrete strategy. The one-second refreshTradebooksStatus timer and generated stats divs do not produce statistics. allowLiveStats is also unread. | Dead path, unused code or inert implementation |
| [Tradebook tick/candle hooks](C:/Users/lingr/code/ViteApp/src/tradebooks/baseTradebook.ts:194) | BookmapWallReversal.onNewTimeSalesData is empty and onNewCandleClose inherits the empty base implementation. Manager iteration on ticks and candle closes reaches no strategy behavior. Entry submission and tradebook enable/disable are active. | Dead path, unused code or inert implementation |
| [Open-zone UI and market-open hook](C:/Users/lingr/code/ViteApp/src/algorithms/autoTrader.ts:279) | updateUIBasedOnOpenZoneForSymbol is empty, as is the effective body of onMarketOpen at line 294. Their startup/market-open calls do not update a UI or strategy. The separate pending-stop refresher remains active. | Dead path, unused code or inert implementation |
| [Pre-open and higher-timeframe refresh timers](C:/Users/lingr/code/ViteApp/src/algorithms/autoTrader.ts:194) | beforeMarketOpen is empty. scheduleRefresh (line 225) schedules an empty callback because reload is commented. scheduleEvents also starts an empty three-second callback (line 147). scheduleSecondMinuteCloseEvent has no caller. | Dead path, unused code or inert implementation |
| [Pending-condition and timing checks](C:/Users/lingr/code/ViteApp/src/algorithms/autoTrader.ts:510) | checkAlgoPendingCondition and checkTimingForEntry (line 555) only inspect elapsed time and return; neither applies a condition or timing rule. Other entry checks remain active. | Dead path, unused code or inert implementation |
| [Algorithm clearing/account-refresh wrapper](C:/Users/lingr/code/ViteApp/src/algorithms/autoTrader.ts:338) | clearExistingAlgos is empty. updateAllAlgo and onAccountDataRefresh have no internal entry path; Chart has commented out the latter (line 763). detectOverRisk is still called directly at Chart line 757 and must be retained. | Dead path, unused code or inert implementation |
| [Hovered candle/OHLC tooltip updates](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:144) | Crosshair handler has commented calls to updateHoveredCandle and updateToolTip (definitions at lines 263/245). The currentCandle OHLC DOM is hidden by public/mystyle.css. Crosshair-price tracking still runs. | Dead path, unused code or inert implementation |
| [Candle-close indicator hook](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:1409) | drawIndicatorsForNewlyClosedCandle only checks the minute range and does no work; DB still calls it. runPostCandleCloseIndicators is uncalled and its checkVwapBeforeOpen helper is empty. Active VWAP calculation and notifications are separate. | Dead path, unused code or inert implementation |
| [Trader-focus collapsible sections](C:/Users/lingr/code/ViteApp/src/main.ts:308) | DOMContentLoaded queries .clickableSectionTitle, but no checked-in HTML or runtime code creates these headers/sections. Related .collapsibleSection, .sectionContent and .collapseIcon CSS is dormant. | Dead path, unused code or inert implementation |
| [Hidden empty Bookmap panels](C:/Users/lingr/code/ViteApp/index.html:76) | bookmap0/2/1/3 at lines 76/122/173/221 are empty and display:none; no local TS code finds or populates them. Their .bookmapPanel style is unused in practice. Bookmap WebSocket integration is active. | Dead path, unused code or inert implementation |
| [Question/answer popup flow](C:/Users/lingr/code/ViteApp/src/ui/questionPopup.ts:6) | show has no internal caller; Test popup does nothing. Hidden popup markup and Submit listeners remain. show always sets hiddenAnswer to an empty string, so it is also only a shell when invoked manually. This module is exposed on window.HybridApp.UI. | No internal trigger / browser-global surface |
| [Network activity/state displays](C:/Users/lingr/code/ViteApp/src/ui/ui.ts:20) | addToNetwork immediately returns; displayState (line 68) only loops over a commented Chart call. Chart.displayState exists as a browser-global API but has no internal trigger. | Dead path, unused code or inert implementation |
| [Percentage quantity sizing and spare quantity input](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:508) | getMultiplier is uncalled and always returns 1; percentage calculation is commented. largeOrderInput is captured at line 314 and never read. Fixed quantity remains active: Models.getFixedQuantityFromInput parses the first input as an integer and OrderFlow consumes it; a string such as 50% would mean 50 shares, not a percentage. | Dead path, unused code or inert implementation |
| [Gap & Crap / Gap Down breakdown variants](C:/Users/lingr/code/ViteApp/src/tradebooks/bookmapWallReversal.ts:29) | GapAndCrapBreakdownBidSwingLow and GapDownAndGoDownBreakdownBidSwingLow have constructor/add-rule branches and enum IDs, but createTradebookDefinitions never emits either ID. No current factory constructs these variants. The offer step-down/reappear variants are active. | Dead path, unused code or inert implementation |
| [Legacy Gap-and-Go entry algorithm](C:/Users/lingr/code/ViteApp/src/algorithms/gapAndGoAlgo.ts:30) | validateEntry, hasAtLeastOneReasonSet and getAllowedReasonToAddPartial have no callers. The only module import in BookmapWallReversal is unused. Current entries go through triggerEntryCommon/global entry rules and current add handling. Reason validation is implemented by core/configuration/tradingConfig, not the four old hasAtLeastOneReasonSet functions. | Dead path, unused code or inert implementation |
| [Per-tradebook exit-adjustment restrictions](C:/Users/lingr/code/ViteApp/src/tradebooks/bookmapWallReversal.ts:218) | Four adjustment/market-out methods unconditionally return allowed:true with reason exit adjustment rules disabled. ExitRulesCheckerNew.isAllowedToAdjustBatchExitPairs (line 121) also always returns true. These are called pass-throughs; separate core-target and partial-stop checks must be distinguished. | Dead path, unused code or inert implementation |
| [Always-success legacy validation](C:/Users/lingr/code/ViteApp/src/algorithms/watchlist.ts:169) | checkStockSelection always returns OK; its error-alert/fallback branch at lines 82–86 cannot execute. TradingPlans.validateTradingPlansForOneDirection (line 137) always returns an empty string, making both caller rejection branches inert. The active validateTradingPlan core validator still checks plans. | Dead path, unused code or inert implementation |
| [Legacy two-way breakout](C:/Users/lingr/code/ViteApp/src/controllers/handler.ts:392) | Entire body is commented. It remains accessible through Handler globals but performs no action. raiseTargetsIfWasLess (line 313) only logs, without raising targets. | No internal trigger / browser-global surface |
| [Key-area chart overlays](C:/Users/lingr/code/ViteApp/src/models/tradingPlans/tradingPlans.ts:111) | getKeyAreasToDraw always returns an empty array; current chart creation supplies no filled key areas. drawKeyAreas survives as a browser-global-only helper. Key-level lines and Bookmap key zones remain active. | Dead path, unused code or inert implementation |
| [Tradebook native execution definition](C:/Users/lingr/code/ViteApp/src/tradebooks/bookmapWallReversal.ts:70) | getNativeExecutionDefinition has no local references; it is a leftover raw-plan exporter from the former browser/native bridge. Native parity/headless code is documented and tested separately. | Dead path, unused code or inert implementation |
| [Core-target exit protection/popup](C:/Users/lingr/code/ViteApp/src/config/globalSettings.ts:36) | enableCoreTargetExitFeature=false. CoreTargetExitRules returns allowed results before enforcement; Bookmap core-plan config reports no active trade, reminders are suppressed, and core-plan updates are rejected. This is deliberately disabled code with tests, not automatically removable. | Disabled/current configuration |
| [Automatic risk-level annotations](C:/Users/lingr/code/ViteApp/src/config/globalSettings.ts:38) | enableRiskLevel=false makes drawRiskLevels return before drawing automatic long/short risk levels. The R hotkey calls Handler.setRiskLevel -> Chart.drawRiskLevel independently and remains active. | Disabled/current configuration |
| [Unused feature switches](C:/Users/lingr/code/ViteApp/src/config/globalSettings.ts:15) | allowLiveStats, showBestPlans, showTradebooksForPosition and checkMaxEntryThreshold have no consumers. enableLeftPaneFeatures only feeds the two constants combined with && false, so changing it has no UI effect. m15ChartEnabledAfterSeconds is read but cannot change the displayed chart. | Dead path, unused code or inert implementation |
| [Unused profile knobs](C:/Users/lingr/code/ViteApp/src/config/profiles/profiles.ts:8) | entryRules.requireVwapSameDirection, entryRules.maxSizeOnEarlyEntry, exitRules.checkTimeSinceEntry, fixedRisk and uiSettings have no live reads. exitRules.allowTightenStop is read only by the uncalled rules.checkTightenStop. Both profiles have identical settings apart from name; their profile names still affect persisted/config state. | Dead path, unused code or inert implementation |
| [Legacy brokers/index/test-account branches](C:/Users/lingr/code/ViteApp/src/config/profiles/schwab.ts:3) | Both supported profiles set brokerName=Schwab, indexOnly=false, isEquity=true, isTestAccount=false and allowTighterStop=true. Alternate broker, index-only, test-account and disallowed-tight-stop branches are dormant under these profiles. TD Ameritrade is still loaded/exported globally; it has no normal trading caller. Profile objects are mutable through Config globals, so these are current-configuration findings. | Disabled/current configuration |
| [Non-worker market sockets/order-window reads](C:/Users/lingr/code/ViteApp/src/config/globalSettings.ts:12) | useMarketDataWorker=true selects worker streams; the main-thread Schwab/Massive socket creation in main.ts is an inactive fallback. Config.Settings.fetchOrdersByTimeWindows=false leaves the alternate paginated-order branch inactive. Both can be enabled by changing configuration; keep separate from dead functions. | Disabled/current configuration |
| [Unused starter assets and scratch test](C:/Users/lingr/code/ViteApp/src/style.css:1) | src/style.css, src/typescript.svg and public/vite.svg have no checked-in references. src/utils/helper.test.ts registers no tests and is absent from package scripts; it only calls a helper and contains a commented starter test. secret_template.ts remains a setup template. | Dead path, unused code or inert implementation |
| [New-position partial profitability check](C:/Users/lingr/code/ViteApp/src/controllers/entryRulesChecker.ts:139) | checkParitalEntryForNewPosition always returns true; the prior-profit requirement is commented. Existing-position risk checks still execute. | Dead path, unused code or inert implementation |
| [VWAP-correction completeness gate](C:/Users/lingr/code/ViteApp/src/algorithms/watchlist.ts:66) | The zero-volume/zero-trading-sum branch has both its error log and continue commented. It detects missing correction inputs but neither rejects nor reports them. VWAP correction math itself remains active. | Dead path, unused code or inert implementation |
| [Maximum-entry threshold/display](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:843) | drawMaxEntry/clearMaxEntry have no internal trigger, checkMaxEntryThreshold is unread, and validateEntryThreshold is disconnected. The surviving display API is only browser-global reachable. | Dead path, unused code or inert implementation |
| [Old broker account/order parsing and execution aggregation](C:/Users/lingr/code/ViteApp/src/api/schwab/orderFactory.ts:247) | Old order/execution extraction functions have no runtime call path; Schwab getAccountInfo now uses shared projectAccount and browserAccount mapping. Broker private ledger/P&L helpers are also uncalled after shared ledger/execution-export extraction. Active payload factories are retained. | Dead path, unused code or inert implementation |
| [Old streaming dispatch and rejection parser](C:/Users/lingr/code/ViteApp/src/controllers/streamingHandler.ts:39) | handleMessageData has no caller and its TIMESALE_EQUITY, QUOTE and ACCT_ACTIVITY branches are empty. handleTradeUpdates and the XML handleOrderRejection parser are also uncalled. Worker streaming/quote/account activity paths remain active. | Dead path, unused code or inert implementation |

## Disconnected application-source candidates

| File | Lines | Role |
| --- | ---: | --- |
| [src/algorithms/strategies.ts](C:/Users/lingr/code/ViteApp/src/algorithms/strategies.ts:1) | 10 | R2Target object; no export or consumer. |
| [src/models/atr.ts](C:/Users/lingr/code/ViteApp/src/models/atr.ts:1) | 8 | ATR percentage formatter. |
| [src/patterns/allTimeHigh.ts](C:/Users/lingr/code/ViteApp/src/patterns/allTimeHigh.ts:1) | 23 | All-time-high detector. |
| [src/patterns/camPivots.ts](C:/Users/lingr/code/ViteApp/src/patterns/camPivots.ts:1) | 115 | Old Camarilla pattern implementation; active indicators/camPivots.ts is separate. |
| [src/tradebooks/singleKeyLevel/commonRules.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/singleKeyLevel/commonRules.ts:1) | 36 | Legacy single-key-level rules. |
| [src/tradebooks/tradebookUtil.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/tradebookUtil.ts:1) | 7 | Button status helper; active/inactive/degraded strategy CSS has no current status writer. |
| [src/trading/adapters/browserSockets.ts](C:/Users/lingr/code/ViteApp/src/trading/adapters/browserSockets.ts:1) | 13 | Unused browser socket/scheduler adapter; production uses the worker or its existing socket implementations. |
| [src/ui/popup.ts](C:/Users/lingr/code/ViteApp/src/ui/popup.ts:1) | 91 | Old candlestick popup; questionPopup.ts is a separate module. |
| [src/utils/entryThresholdValidator.ts](C:/Users/lingr/code/ViteApp/src/utils/entryThresholdValidator.ts:1) | 87 | Disconnected threshold validator with an unreachable timing/ORB tail. |

## Headless/test-only dependency files: retain unless removing that supported use

| File | Use |
| --- | --- |
| [src/bookmap/wallThreshold.ts](C:/Users/lingr/code/ViteApp/src/bookmap/wallThreshold.ts:1) | Test compatibility re-export of the active core wallThreshold implementation. |
| [src/trading/core/controllers/executionInputs.ts](C:/Users/lingr/code/ViteApp/src/trading/core/controllers/executionInputs.ts:1) | Headless runtime, protocol or fixture/test dependency; no SPA import path. Generator consumers: [scripts/generateStateFixtures.mjs](C:/Users/lingr/code/ViteApp/scripts/generateStateFixtures.mjs:1). |
| [src/trading/core/controllers/nativeViews.ts](C:/Users/lingr/code/ViteApp/src/trading/core/controllers/nativeViews.ts:1) | Headless runtime, protocol or fixture/test dependency; no SPA import path. Generator consumers: [scripts/generateStateFixtures.mjs](C:/Users/lingr/code/ViteApp/scripts/generateStateFixtures.mjs:1). |
| [src/trading/core/marketdata/startupEligibility.ts](C:/Users/lingr/code/ViteApp/src/trading/core/marketdata/startupEligibility.ts:1) | Headless runtime, protocol or fixture/test dependency; no SPA import path. |
| [src/trading/libraries/massive/streamingProtocol.ts](C:/Users/lingr/code/ViteApp/src/trading/libraries/massive/streamingProtocol.ts:1) | Headless runtime, protocol or fixture/test dependency; no SPA import path. Generator consumers: [scripts/generateStreamFixtures.mjs](C:/Users/lingr/code/ViteApp/scripts/generateStreamFixtures.mjs:1). |
| [src/trading/ports/socket.ts](C:/Users/lingr/code/ViteApp/src/trading/ports/socket.ts:1) | Headless runtime, protocol or fixture/test dependency; no SPA import path. |
| [src/trading/runtime/managedSocket.ts](C:/Users/lingr/code/ViteApp/src/trading/runtime/managedSocket.ts:1) | Headless runtime, protocol or fixture/test dependency; no SPA import path. |
| [src/trading/runtime/marketStreams.ts](C:/Users/lingr/code/ViteApp/src/trading/runtime/marketStreams.ts:1) | Headless runtime, protocol or fixture/test dependency; no SPA import path. |
| [src/trading/runtime/tradingRuntime.ts](C:/Users/lingr/code/ViteApp/src/trading/runtime/tradingRuntime.ts:1) | Headless runtime, protocol or fixture/test dependency; no SPA import path. |

## Complete callable cleanup-candidate inventory

Each function below lacks a static main/worker entry path after preserving browser-global exports and inherited class implementations. Private functions can be uncalled themselves or belong to a dead helper chain. Keep active siblings in the same file. Exported functions still require consideration of dynamic consumers before deletion.

### src/algorithms/autoTrader.ts

- [scheduleSecondMinuteCloseEvent](C:/Users/lingr/code/ViteApp/src/algorithms/autoTrader.ts:244) — private helper.

### src/algorithms/gapAndCrapAlgo.ts

- [hasAtLeastOneReasonSet](C:/Users/lingr/code/ViteApp/src/algorithms/gapAndCrapAlgo.ts:5)

### src/algorithms/gapAndGoAlgo.ts

- [hasAtLeastOneReasonSet](C:/Users/lingr/code/ViteApp/src/algorithms/gapAndGoAlgo.ts:8)
- [validateEntry](C:/Users/lingr/code/ViteApp/src/algorithms/gapAndGoAlgo.ts:30)
- [getAllowedReasonToAddPartial](C:/Users/lingr/code/ViteApp/src/algorithms/gapAndGoAlgo.ts:93)

### src/algorithms/gapDownAndGoDownAlgo.ts

- [hasAtLeastOneReasonSet](C:/Users/lingr/code/ViteApp/src/algorithms/gapDownAndGoDownAlgo.ts:5)

### src/algorithms/gapDownAndGoUpAlgo.ts

- [hasAtLeastOneReasonSet](C:/Users/lingr/code/ViteApp/src/algorithms/gapDownAndGoUpAlgo.ts:5)

### src/algorithms/patterns.ts

- [hasBreakoutOccurredForNewCandle](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:17)
- [isFalseBreakoutForNewCandle](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:24)
- [hasGreenBarSinceOpen](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:33)
- [hasRedBarSinceOpen](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:46)
- [firstBarIsPinBar](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:57)
- [isPriceOutsideLevel](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:69)
- [isBarClosed](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:76)
- [isPriceInLowerRange](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:83)
- [isPriceInUpperRange](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:90)
- [hasLostVwapMomentum](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:97)
- [isFirstRetracement](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:121)
- [isBarSameDirection](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:155)
- [isConsecutiveBarsSameDirection](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:163)
- [analyzeBreakoutPatterns](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:180)
- [hasClosedBeyondPrice](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:213)
- [getFirstCandleClosedBeyondPrice](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:226)
- [hasConfirmationForBreakoutEntry](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:238)
- [hasFalseHighOfDayBreakout](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:265)
- [hasFalseBreakout](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:306)
- [hasConfirmationForMarketEntry](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:315)
- [getFirstNewHighLowPrice](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:341)
- [checkFirstNewHighPattern](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:367)
- [hasPremarketBreakout](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:423)
- [getOpenExtensionFromVwapInAtr](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:431)
- [hasRetracementFromPremarket](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:445)
- [getFirstPullbackStatus](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:465)
- [isPriceWorseThanVwap](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:538)
- [isPriceWorseThanKeyLevel](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:546)
- [hasLostKeyLevel](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:558)
- [hasLowerLow](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:657)
- [hasHigherHigh](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:669)
- [hasClosedOutsideVwap](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:682)
- [hasPullbackToVwapBeforeOpen](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:700)
- [isHigherLows](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:728)
- [isLowerHighs](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:743)
- [getMinimumDistanceToVwap](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:758)
- [getDirectionalDistanceToVwap](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:763)
- [getFirstBreakoutCandle](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:770)
- [hasLevelRetest](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:786)
- [hasApproachedTargetToAdd](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:795)

### src/algorithms/riskManager.ts

- [orOverride](C:/Users/lingr/code/ViteApp/src/algorithms/riskManager.ts:48) — private helper.
- [getRiskMultiplerForNextEntry2](C:/Users/lingr/code/ViteApp/src/algorithms/riskManager.ts:89) — private helper.
- [getRiskInDollarForNextEntry](C:/Users/lingr/code/ViteApp/src/algorithms/riskManager.ts:108) — private helper.

### src/algorithms/rules.ts

- [isTimingAndEntryAllowedForHigherTimeframe](C:/Users/lingr/code/ViteApp/src/algorithms/rules.ts:18)
- [entryJustHappened](C:/Users/lingr/code/ViteApp/src/algorithms/rules.ts:57)
- [checkForMidRangeBreakout](C:/Users/lingr/code/ViteApp/src/algorithms/rules.ts:67)
- [atMostHalfPositionForMarketOrder](C:/Users/lingr/code/ViteApp/src/algorithms/rules.ts:83)
- [checkForMinimumPositionSize](C:/Users/lingr/code/ViteApp/src/algorithms/rules.ts:95)
- [isShortAboveLastResistance](C:/Users/lingr/code/ViteApp/src/algorithms/rules.ts:120)
- [isLongBelowLastSupport](C:/Users/lingr/code/ViteApp/src/algorithms/rules.ts:137)
- [checkTightenStop](C:/Users/lingr/code/ViteApp/src/algorithms/rules.ts:157)
- [isIncreasingTarget](C:/Users/lingr/code/ViteApp/src/algorithms/rules.ts:178)
- [isBlockedByTiming](C:/Users/lingr/code/ViteApp/src/algorithms/rules.ts:189)
- [isBlockedByDeferTrading](C:/Users/lingr/code/ViteApp/src/algorithms/rules.ts:193)
- [isBlockedByAfterTrading](C:/Users/lingr/code/ViteApp/src/algorithms/rules.ts:199)
- [isAfterOpeningMomentum](C:/Users/lingr/code/ViteApp/src/algorithms/rules.ts:206)
- [isAllowedForAddedPosition](C:/Users/lingr/code/ViteApp/src/algorithms/rules.ts:216)
- [isEntryAfterTopPick](C:/Users/lingr/code/ViteApp/src/algorithms/rules.ts:238)
- [isEntryPriceInMomentum](C:/Users/lingr/code/ViteApp/src/algorithms/rules.ts:261)
- [isSpreadTooLarge](C:/Users/lingr/code/ViteApp/src/algorithms/rules.ts:290)
- [isGreaterThanMinimumDistance](C:/Users/lingr/code/ViteApp/src/algorithms/rules.ts:323)
- [allowedFirstMinuteByDailyChartGap](C:/Users/lingr/code/ViteApp/src/algorithms/rules.ts:331)
- [isReverseOfMomentumCandle](C:/Users/lingr/code/ViteApp/src/algorithms/rules.ts:350)
- [getDisallowedReasonBasedOnOpenPriceZone](C:/Users/lingr/code/ViteApp/src/algorithms/rules.ts:374)
- [isNewTradeAfterStopOut](C:/Users/lingr/code/ViteApp/src/algorithms/rules.ts:427)

### src/algorithms/vwap.ts

- [isAgainstPremarketVwapStrongTrend](C:/Users/lingr/code/ViteApp/src/algorithms/vwap.ts:3)
- [isAgainstCurrentVwap](C:/Users/lingr/code/ViteApp/src/algorithms/vwap.ts:8)
- [getPremarketTrendText](C:/Users/lingr/code/ViteApp/src/algorithms/vwap.ts:47)
- [isCrossed](C:/Users/lingr/code/ViteApp/src/algorithms/vwap.ts:59)

### src/api/broker.ts

- [positionEffectIsOpen](C:/Users/lingr/code/ViteApp/src/api/broker.ts:356) — private helper.
- [aggregateEntriesExecutions](C:/Users/lingr/code/ViteApp/src/api/broker.ts:370) — private helper.
- [getRealizedPnL](C:/Users/lingr/code/ViteApp/src/api/broker.ts:411) — private helper.
- [isTradeClosed](C:/Users/lingr/code/ViteApp/src/api/broker.ts:430) — private helper.

### src/api/massive/api.ts

- [getBars](C:/Users/lingr/code/ViteApp/src/api/massive/api.ts:12)

### src/api/schwab/api.ts

- [logErrorForObject](C:/Users/lingr/code/ViteApp/src/api/schwab/api.ts:528) — private helper.

### src/api/schwab/orderFactory.ts

- [getOrderSymbol](C:/Users/lingr/code/ViteApp/src/api/schwab/orderFactory.ts:75)
- [getPositionEffectIsOpen](C:/Users/lingr/code/ViteApp/src/api/schwab/orderFactory.ts:86)
- [copyOrder](C:/Users/lingr/code/ViteApp/src/api/schwab/orderFactory.ts:157)
- [copySingleOrder](C:/Users/lingr/code/ViteApp/src/api/schwab/orderFactory.ts:162) — private helper.
- [extractTopLevelCancelableOrdersIds](C:/Users/lingr/code/ViteApp/src/api/schwab/orderFactory.ts:247)
- [buildEntryOrderModelBySymbol](C:/Users/lingr/code/ViteApp/src/api/schwab/orderFactory.ts:260)
- [extractExitPrices](C:/Users/lingr/code/ViteApp/src/api/schwab/orderFactory.ts:284)
- [buildOrderModelBySymbol](C:/Users/lingr/code/ViteApp/src/api/schwab/orderFactory.ts:317)
- [filterToEquityOrders](C:/Users/lingr/code/ViteApp/src/api/schwab/orderFactory.ts:334)
- [isSingleOrderOpenStatus](C:/Users/lingr/code/ViteApp/src/api/schwab/orderFactory.ts:352)
- [extractEntryOrders](C:/Users/lingr/code/ViteApp/src/api/schwab/orderFactory.ts:355)
- [extractEntryOrdersIds](C:/Users/lingr/code/ViteApp/src/api/schwab/orderFactory.ts:372)
- [extractFilledOrders](C:/Users/lingr/code/ViteApp/src/api/schwab/orderFactory.ts:382)
- [extractWorkingExitPairs](C:/Users/lingr/code/ViteApp/src/api/schwab/orderFactory.ts:417)
- [extractWorkingExitPairsFromOTOChild](C:/Users/lingr/code/ViteApp/src/api/schwab/orderFactory.ts:477)
- [isFilledOTO](C:/Users/lingr/code/ViteApp/src/api/schwab/orderFactory.ts:508) — private helper.
- [extractWorkingChildOrdersFromOCO](C:/Users/lingr/code/ViteApp/src/api/schwab/orderFactory.ts:511) — private helper.
- [extractOrderPrice](C:/Users/lingr/code/ViteApp/src/api/schwab/orderFactory.ts:529)
- [isBuyOrder](C:/Users/lingr/code/ViteApp/src/api/schwab/orderFactory.ts:541)
- [isSellOrder](C:/Users/lingr/code/ViteApp/src/api/schwab/orderFactory.ts:544)
- [buildOrderModel](C:/Users/lingr/code/ViteApp/src/api/schwab/orderFactory.ts:547)
- [splitOrdersBySymbol](C:/Users/lingr/code/ViteApp/src/api/schwab/orderFactory.ts:571) — private helper.
- [extractOrderExecutionsFromAllSymbols](C:/Users/lingr/code/ViteApp/src/api/schwab/orderFactory.ts:585)
- [extractOrderExecutions](C:/Users/lingr/code/ViteApp/src/api/schwab/orderFactory.ts:597)
- [aggregateExecutionLegs](C:/Users/lingr/code/ViteApp/src/api/schwab/orderFactory.ts:641)
- [extractTradeExecutions](C:/Users/lingr/code/ViteApp/src/api/schwab/orderFactory.ts:667)
- [generateExecutionScript](C:/Users/lingr/code/ViteApp/src/api/schwab/orderFactory.ts:728)

### src/api/tdAmeritrade/api.ts

- [placeOrderBase](C:/Users/lingr/code/ViteApp/src/api/tdAmeritrade/api.ts:22) — private helper.
- [getOrdersForSymbol](C:/Users/lingr/code/ViteApp/src/api/tdAmeritrade/api.ts:52) — private helper.
- [filterOrdersForSymbol](C:/Users/lingr/code/ViteApp/src/api/tdAmeritrade/api.ts:60) — private helper.
- [getOrderSymbol](C:/Users/lingr/code/ViteApp/src/api/tdAmeritrade/api.ts:73) — private helper.

### src/api/tdAmeritrade/orderFactory.ts

- [getClosingOrderLegInstruction](C:/Users/lingr/code/ViteApp/src/api/tdAmeritrade/orderFactory.ts:63)
- [copyOrder](C:/Users/lingr/code/ViteApp/src/api/tdAmeritrade/orderFactory.ts:131)
- [copySingleOrder](C:/Users/lingr/code/ViteApp/src/api/tdAmeritrade/orderFactory.ts:136) — private helper.
- [createOcoOrder](C:/Users/lingr/code/ViteApp/src/api/tdAmeritrade/orderFactory.ts:169) — private helper.
- [createOcoOrderFromTwoLegs](C:/Users/lingr/code/ViteApp/src/api/tdAmeritrade/orderFactory.ts:174) — private helper.
- [createOneEntryWithTwoExits](C:/Users/lingr/code/ViteApp/src/api/tdAmeritrade/orderFactory.ts:180)
- [createOcoExitOrder](C:/Users/lingr/code/ViteApp/src/api/tdAmeritrade/orderFactory.ts:201)
- [extractTopLevelCancelableOrdersIds](C:/Users/lingr/code/ViteApp/src/api/tdAmeritrade/orderFactory.ts:214)
- [extractEntryOrdersIds](C:/Users/lingr/code/ViteApp/src/api/tdAmeritrade/orderFactory.ts:313)
- [isSellOrder](C:/Users/lingr/code/ViteApp/src/api/tdAmeritrade/orderFactory.ts:473)
- [extractTradeExecutions](C:/Users/lingr/code/ViteApp/src/api/tdAmeritrade/orderFactory.ts:572)
- [generateExecutionScript](C:/Users/lingr/code/ViteApp/src/api/tdAmeritrade/orderFactory.ts:633)

### src/controllers/adjustExitsHandler.ts

- [onAdjustExits](C:/Users/lingr/code/ViteApp/src/controllers/adjustExitsHandler.ts:10)
- [getSnapPriceForAdjustStops](C:/Users/lingr/code/ViteApp/src/controllers/adjustExitsHandler.ts:26)
- [adjustAllStopExitsWithoutRule](C:/Users/lingr/code/ViteApp/src/controllers/adjustExitsHandler.ts:65)

### src/controllers/entryHandler.ts

- [getLogTagsForEntryAction](C:/Users/lingr/code/ViteApp/src/controllers/entryHandler.ts:12)
- [getOrderType](C:/Users/lingr/code/ViteApp/src/controllers/entryHandler.ts:19) — private helper.

### src/controllers/exitRulesCheckerSimple.ts

- [isAllowedForSingle](C:/Users/lingr/code/ViteApp/src/controllers/exitRulesCheckerSimple.ts:27)
- [isLessTightThanClosedCandlesForAdjustStop](C:/Users/lingr/code/ViteApp/src/controllers/exitRulesCheckerSimple.ts:93)

### src/controllers/streamingHandler.ts

- [handleMessageData](C:/Users/lingr/code/ViteApp/src/controllers/streamingHandler.ts:39)
- [handleTradeUpdates](C:/Users/lingr/code/ViteApp/src/controllers/streamingHandler.ts:53)
- [handleOrderRejection](C:/Users/lingr/code/ViteApp/src/controllers/streamingHandler.ts:58) — private helper.

### src/data/db.ts

- [getPremarketTradingAmountInMillionDollars](C:/Users/lingr/code/ViteApp/src/data/db.ts:746)
- [getExtremePrice](C:/Users/lingr/code/ViteApp/src/data/db.ts:751)
- [addDataAndUpdateChart](C:/Users/lingr/code/ViteApp/src/data/db.ts:814)

### src/models/tradingState.ts

- [getDefaultAtr](C:/Users/lingr/code/ViteApp/src/models/tradingState.ts:15) — private helper.

### src/tradebooks/tradebooksManager.ts

- [isDirectionEnabled](C:/Users/lingr/code/ViteApp/src/tradebooks/tradebooksManager.ts:19) — private helper.
- [createTradebooksForGapAndGo](C:/Users/lingr/code/ViteApp/src/tradebooks/tradebooksManager.ts:23)
- [createTradebooksForGapAndCrap](C:/Users/lingr/code/ViteApp/src/tradebooks/tradebooksManager.ts:29)
- [createTradebooksForGapDownAndGoDown](C:/Users/lingr/code/ViteApp/src/tradebooks/tradebooksManager.ts:36)
- [createTradebooksForGapDownAndGoUp](C:/Users/lingr/code/ViteApp/src/tradebooks/tradebooksManager.ts:42)
- [createTradebooksForRangeBoundReversal](C:/Users/lingr/code/ViteApp/src/tradebooks/tradebooksManager.ts:48)

### src/ui/chart.ts

- [updateToolTip](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:245) — private helper.
- [updateHoveredCandle](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:263) — private helper.
- [runPostCandleCloseIndicators](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:1441) — private helper.
- [checkVwapBeforeOpen](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:1445) — private helper.
- [hideButtonAfterSeconds](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:1467) — private helper.

### src/ui/chartSettings.ts

- [getPopupChartSettings](C:/Users/lingr/code/ViteApp/src/ui/chartSettings.ts:76)

### src/utils/calculator.ts

- [getPercentageString](C:/Users/lingr/code/ViteApp/src/utils/calculator.ts:36)
- [median](C:/Users/lingr/code/ViteApp/src/utils/calculator.ts:57)

## App-unreachable callables retained for tests or fixture generators

| Callable | Consumers |
| --- | --- |
| [getBrokerObservation](C:/Users/lingr/code/ViteApp/src/trading/adapters/browserBrokerMetadata.ts:18) | [src/bookmap/directExecution.test.ts](C:/Users/lingr/code/ViteApp/src/bookmap/directExecution.test.ts:1) |
| [projectTradeLedger](C:/Users/lingr/code/ViteApp/src/trading/core/account/tradeLedger.ts:34) | [scripts/generateStateFixtures.mjs](C:/Users/lingr/code/ViteApp/scripts/generateStateFixtures.mjs:1) |
| [readTradingConfig](C:/Users/lingr/code/ViteApp/src/trading/core/configuration/tradingConfig.ts:72) | [scripts/generateStateFixtures.mjs](C:/Users/lingr/code/ViteApp/scripts/generateStateFixtures.mjs:1) |
| [pendingStopRefresh](C:/Users/lingr/code/ViteApp/src/trading/core/controllers/workflows.ts:25) | [scripts/generateStateFixtures.mjs](C:/Users/lingr/code/ViteApp/scripts/generateStateFixtures.mjs:1) |
| [firstVwapTouch](C:/Users/lingr/code/ViteApp/src/trading/core/controllers/workflows.ts:32) | [scripts/generateStateFixtures.mjs](C:/Users/lingr/code/ViteApp/scripts/generateStateFixtures.mjs:1) |
| [completedPartials](C:/Users/lingr/code/ViteApp/src/trading/core/controllers/workflows.ts:41) | [scripts/generateStateFixtures.mjs](C:/Users/lingr/code/ViteApp/scripts/generateStateFixtures.mjs:1) |
| [dateLabel](C:/Users/lingr/code/ViteApp/src/trading/core/state/tradeState.ts:3) | [scripts/generateStateFixtures.mjs](C:/Users/lingr/code/ViteApp/scripts/generateStateFixtures.mjs:1) |
| [defaultSymbolState](C:/Users/lingr/code/ViteApp/src/trading/core/state/tradeState.ts:14) | [scripts/generateStateFixtures.mjs](C:/Users/lingr/code/ViteApp/scripts/generateStateFixtures.mjs:1) |
| [TradeState](C:/Users/lingr/code/ViteApp/src/trading/core/state/tradeState.ts:25) | [scripts/generateStateFixtures.mjs](C:/Users/lingr/code/ViteApp/scripts/generateStateFixtures.mjs:1) |
| [request](C:/Users/lingr/code/ViteApp/src/trading/libraries/broker/schwab/streamingProtocol.ts:6) | [scripts/generateStreamFixtures.mjs](C:/Users/lingr/code/ViteApp/scripts/generateStreamFixtures.mjs:1) |
| [loginRequest](C:/Users/lingr/code/ViteApp/src/trading/libraries/broker/schwab/streamingProtocol.ts:9) | [scripts/generateStreamFixtures.mjs](C:/Users/lingr/code/ViteApp/scripts/generateStreamFixtures.mjs:1) |
| [quoteSubscribeRequest](C:/Users/lingr/code/ViteApp/src/trading/libraries/broker/schwab/streamingProtocol.ts:12) | [scripts/generateStreamFixtures.mjs](C:/Users/lingr/code/ViteApp/scripts/generateStreamFixtures.mjs:1) |
| [activitySubscribeRequest](C:/Users/lingr/code/ViteApp/src/trading/libraries/broker/schwab/streamingProtocol.ts:15) | [scripts/generateStreamFixtures.mjs](C:/Users/lingr/code/ViteApp/scripts/generateStreamFixtures.mjs:1) |
| [fetchBrokerResponse](C:/Users/lingr/code/ViteApp/src/utils/errorDetails.ts:27) | [src/bookmap/directExecution.test.ts](C:/Users/lingr/code/ViteApp/src/bookmap/directExecution.test.ts:1) |

## Browser-global-dependent exported APIs

These APIs or helper chains have no normal internal root; they survive through window.HybridApp namespace exposure. They are not included in the confirmed private-dead list. This also identifies legacy TD Ameritrade, options, chart-review, manual helper/debug APIs and Firestore maintenance operations. Removing them changes the console/remote-script API.

onNativeEntryAccepted is also explicitly exercised by scripts/nativeEntryState.test.mjs via dynamically loaded/transpiled source; retain for that test/parity contract unless it is removed deliberately. OAuth authorization helpers and Firestore cleanup functions may be intentionally manual.

### src/algorithms/autoTrader.ts

- [updateAllAlgo](C:/Users/lingr/code/ViteApp/src/algorithms/autoTrader.ts:338)
- [clearExistingAlgos](C:/Users/lingr/code/ViteApp/src/algorithms/autoTrader.ts:345)
- [onAccountDataRefresh](C:/Users/lingr/code/ViteApp/src/algorithms/autoTrader.ts:568)

### src/algorithms/riskManager.ts

- [isOverSized](C:/Users/lingr/code/ViteApp/src/algorithms/riskManager.ts:271)
- [hasEnoughBuyingPower](C:/Users/lingr/code/ViteApp/src/algorithms/riskManager.ts:288)
- [isRealizedProfitLossOverThreshold](C:/Users/lingr/code/ViteApp/src/algorithms/riskManager.ts:290)

### src/algorithms/takeProfit.ts

- [getTargetPriceByRiskReward](C:/Users/lingr/code/ViteApp/src/algorithms/takeProfit.ts:23)

### src/algorithms/watchlist.ts

- [isTopPick](C:/Users/lingr/code/ViteApp/src/algorithms/watchlist.ts:136)
- [isFocusedOnBestStock](C:/Users/lingr/code/ViteApp/src/algorithms/watchlist.ts:155)

### src/api/broker.ts

- [getBrokerApi](C:/Users/lingr/code/ViteApp/src/api/broker.ts:14)
- [test1](C:/Users/lingr/code/ViteApp/src/api/broker.ts:29)
- [test2](C:/Users/lingr/code/ViteApp/src/api/broker.ts:39)
- [submitPremarketOrder](C:/Users/lingr/code/ViteApp/src/api/broker.ts:184)
- [cancelOneSideEntryOrders](C:/Users/lingr/code/ViteApp/src/api/broker.ts:217)
- [replaceWithMarketOrder](C:/Users/lingr/code/ViteApp/src/api/broker.ts:241)
- [replaceSimpleOrderWithNewPrice](C:/Users/lingr/code/ViteApp/src/api/broker.ts:250)
- [generateExecutionScriptForOrderExecutions](C:/Users/lingr/code/ViteApp/src/api/broker.ts:353)
- [aggregateExecutionsPerMinutePerSidePerPrice](C:/Users/lingr/code/ViteApp/src/api/broker.ts:390)
- [aggregateExecutionsPerMinutePerSide](C:/Users/lingr/code/ViteApp/src/api/broker.ts:392)
- [aggregateExecutions](C:/Users/lingr/code/ViteApp/src/api/broker.ts:394)

### src/api/marketData.ts

- [getQuote](C:/Users/lingr/code/ViteApp/src/api/marketData.ts:18)
- [getFundamentals](C:/Users/lingr/code/ViteApp/src/api/marketData.ts:28)
- [getPriceHistory](C:/Users/lingr/code/ViteApp/src/api/marketData.ts:65)
- [hasWeeklyOptions](C:/Users/lingr/code/ViteApp/src/api/marketData.ts:70)
- [getPreviousTradingDate](C:/Users/lingr/code/ViteApp/src/api/marketData.ts:78)
- [get30MinuteChartFromLastNDays](C:/Users/lingr/code/ViteApp/src/api/marketData.ts:92)
- [getPremarketDollarFromDate](C:/Users/lingr/code/ViteApp/src/api/marketData.ts:99)
- [getPremarketDollarStats](C:/Users/lingr/code/ViteApp/src/api/marketData.ts:103)

### src/api/schwab/api.ts

- [test](C:/Users/lingr/code/ViteApp/src/api/schwab/api.ts:30)
- [testReplaceOrder](C:/Users/lingr/code/ViteApp/src/api/schwab/api.ts:35)
- [generateRefreshTokenUrl](C:/Users/lingr/code/ViteApp/src/api/schwab/api.ts:63)
- [generateRefreshToken](C:/Users/lingr/code/ViteApp/src/api/schwab/api.ts:76)
- [getOptionsChain](C:/Users/lingr/code/ViteApp/src/api/schwab/api.ts:120)
- [hasWeeklyOptions](C:/Users/lingr/code/ViteApp/src/api/schwab/api.ts:135)
- [getFundamentals](C:/Users/lingr/code/ViteApp/src/api/schwab/api.ts:174)
- [replaceSingleOrderWithMarketOrder](C:/Users/lingr/code/ViteApp/src/api/schwab/api.ts:289)
- [cancelAndReplaceExitPairWithNewPrice](C:/Users/lingr/code/ViteApp/src/api/schwab/api.ts:363)
- [cancelAndReplaceWithMarketOrder](C:/Users/lingr/code/ViteApp/src/api/schwab/api.ts:415)
- [submitPremarketOrder](C:/Users/lingr/code/ViteApp/src/api/schwab/api.ts:449)
- [testReplaceEntry2](C:/Users/lingr/code/ViteApp/src/api/schwab/api.ts:478)

### src/api/tdAmeritrade/api.ts

- [extractCodeFromUrl](C:/Users/lingr/code/ViteApp/src/api/tdAmeritrade/api.ts:12)
- [replaceWithNewPrice](C:/Users/lingr/code/ViteApp/src/api/tdAmeritrade/api.ts:43)
- [getQuote](C:/Users/lingr/code/ViteApp/src/api/tdAmeritrade/api.ts:87)
- [getPriceHistory](C:/Users/lingr/code/ViteApp/src/api/tdAmeritrade/api.ts:99)
- [getAccount](C:/Users/lingr/code/ViteApp/src/api/tdAmeritrade/api.ts:116)
- [getFundamentals](C:/Users/lingr/code/ViteApp/src/api/tdAmeritrade/api.ts:209)
- [getOptionsChain](C:/Users/lingr/code/ViteApp/src/api/tdAmeritrade/api.ts:243)
- [hasWeeklyOptions](C:/Users/lingr/code/ViteApp/src/api/tdAmeritrade/api.ts:256)

### src/config/config.ts

- [isEquity](C:/Users/lingr/code/ViteApp/src/config/config.ts:32)

### src/controllers/handler.ts

- [keyGPressed](C:/Users/lingr/code/ViteApp/src/controllers/handler.ts:204)
- [raiseTargetsIfWasLess](C:/Users/lingr/code/ViteApp/src/controllers/handler.ts:313)
- [twoWayBreakout](C:/Users/lingr/code/ViteApp/src/controllers/handler.ts:392)
- [moveToInitialEntry](C:/Users/lingr/code/ViteApp/src/controllers/handler.ts:532)
- [addPullbackPrice](C:/Users/lingr/code/ViteApp/src/controllers/handler.ts:636)
- [addPullbackPartials](C:/Users/lingr/code/ViteApp/src/controllers/handler.ts:640)

### src/controllers/orderFlow.ts

- [adjustSimpleOrdersWithNewPrice](C:/Users/lingr/code/ViteApp/src/controllers/orderFlow.ts:213)
- [adjustHalfExitOrdersWithNewPrice](C:/Users/lingr/code/ViteApp/src/controllers/orderFlow.ts:239)
- [moveAllStopExitsToNewPrice](C:/Users/lingr/code/ViteApp/src/controllers/orderFlow.ts:246)
- [raiseAllTargetsBelow](C:/Users/lingr/code/ViteApp/src/controllers/orderFlow.ts:253)
- [getHalfExitOrdersPairs](C:/Users/lingr/code/ViteApp/src/controllers/orderFlow.ts:272)
- [mytest](C:/Users/lingr/code/ViteApp/src/controllers/orderFlow.ts:396)

### src/controllers/orderFlowManager.ts

- [getSpreadDataPoints](C:/Users/lingr/code/ViteApp/src/controllers/orderFlowManager.ts:18)
- [isSingleSpreadTooLarge](C:/Users/lingr/code/ViteApp/src/controllers/orderFlowManager.ts:24)
- [isSingleSpreadInAtrPercentTooLarge](C:/Users/lingr/code/ViteApp/src/controllers/orderFlowManager.ts:29)

### src/firestore.ts

- [getStatePrefix](C:/Users/lingr/code/ViteApp/src/firestore.ts:21)
- [logCandles](C:/Users/lingr/code/ViteApp/src/firestore.ts:30)
- [deleteMonthlyLogs](C:/Users/lingr/code/ViteApp/src/firestore.ts:99)
- [deleteDailyLogs](C:/Users/lingr/code/ViteApp/src/firestore.ts:108)
- [deleteCollectionByName](C:/Users/lingr/code/ViteApp/src/firestore.ts:119)
- [deleteLogsAndOrders](C:/Users/lingr/code/ViteApp/src/firestore.ts:123)
- [logBreakoutTradeState](C:/Users/lingr/code/ViteApp/src/firestore.ts:157)

### src/models/models.ts

- [getCurrentRange](C:/Users/lingr/code/ViteApp/src/models/models.ts:364)
- [getTradebooks](C:/Users/lingr/code/ViteApp/src/models/models.ts:556)
- [getAllLimitExits](C:/Users/lingr/code/ViteApp/src/models/models.ts:570)
- [getBreakoutEntryOrders](C:/Users/lingr/code/ViteApp/src/models/models.ts:633)
- [getRealizedProfitLossPerDirection](C:/Users/lingr/code/ViteApp/src/models/models.ts:681)
- [getRealizedProfitLossForSymbol](C:/Users/lingr/code/ViteApp/src/models/models.ts:696)
- [getProfitLossFromClosedTrades](C:/Users/lingr/code/ViteApp/src/models/models.ts:710)
- [getNetWinningTradesCountPerDirection](C:/Users/lingr/code/ViteApp/src/models/models.ts:726)
- [hasPremarketTrades](C:/Users/lingr/code/ViteApp/src/models/models.ts:775)
- [getInitialFilledPrice](C:/Users/lingr/code/ViteApp/src/models/models.ts:833)
- [getLastEntryTimeFromNowInSeconds](C:/Users/lingr/code/ViteApp/src/models/models.ts:920)
- [getCandlesFromM5SinceOpen](C:/Users/lingr/code/ViteApp/src/models/models.ts:1124)
- [getCandlesFromM5SinceTime](C:/Users/lingr/code/ViteApp/src/models/models.ts:1129)
- [getCandlesFromM15SinceOpen](C:/Users/lingr/code/ViteApp/src/models/models.ts:1132)
- [getCandlesFromM15SinceTime](C:/Users/lingr/code/ViteApp/src/models/models.ts:1137)
- [getCandlesFromM30SinceOpen](C:/Users/lingr/code/ViteApp/src/models/models.ts:1140)
- [getCandlesFromM30SinceTime](C:/Users/lingr/code/ViteApp/src/models/models.ts:1146)
- [getUndefinedCandles](C:/Users/lingr/code/ViteApp/src/models/models.ts:1160)
- [getRiskLevelPrice](C:/Users/lingr/code/ViteApp/src/models/models.ts:1176)
- [getHighLowBreakoutEntryStopPrice](C:/Users/lingr/code/ViteApp/src/models/models.ts:1260)
- [getPreviousCandle](C:/Users/lingr/code/ViteApp/src/models/models.ts:1324)
- [getHigherTimeFrameCandles](C:/Users/lingr/code/ViteApp/src/models/models.ts:1346)
- [getHigherTimeFrameVolumes](C:/Users/lingr/code/ViteApp/src/models/models.ts:1353)
- [getHigherTimeFrameVwaps](C:/Users/lingr/code/ViteApp/src/models/models.ts:1361)
- [getCandlesLog](C:/Users/lingr/code/ViteApp/src/models/models.ts:1369)
- [aggregateCandles](C:/Users/lingr/code/ViteApp/src/models/models.ts:1384)
- [createGroupsByMinuteBucket](C:/Users/lingr/code/ViteApp/src/models/models.ts:1411)
- [aggregateVolumes](C:/Users/lingr/code/ViteApp/src/models/models.ts:1437)
- [aggregateVwaps](C:/Users/lingr/code/ViteApp/src/models/models.ts:1462)
- [getVwapsSinceOpen](C:/Users/lingr/code/ViteApp/src/models/models.ts:1506)
- [getVwapsForHigherTimeframe](C:/Users/lingr/code/ViteApp/src/models/models.ts:1519)
- [getVwapsSinceOpenForTimeframe](C:/Users/lingr/code/ViteApp/src/models/models.ts:1526)
- [openPriceIsAboveVwap](C:/Users/lingr/code/ViteApp/src/models/models.ts:1539)
- [getCandlesTimeDifferenceInMinutes](C:/Users/lingr/code/ViteApp/src/models/models.ts:1673)
- [toTdaOrderTypeString](C:/Users/lingr/code/ViteApp/src/models/models.ts:1693)
- [getDollarTradedAfterOpenInMillions](C:/Users/lingr/code/ViteApp/src/models/models.ts:1791)
- [getWatchlistIndex](C:/Users/lingr/code/ViteApp/src/models/models.ts:1801)
- [getQuantityDetails](C:/Users/lingr/code/ViteApp/src/models/models.ts:1830)
- [getAtrThreshold](C:/Users/lingr/code/ViteApp/src/models/models.ts:1877)
- [isSnapMode](C:/Users/lingr/code/ViteApp/src/models/models.ts:1887)
- [getTimeframeFromEntryMethod](C:/Users/lingr/code/ViteApp/src/models/models.ts:2053)
- [getCandlesSinceOpenForTimeframe](C:/Users/lingr/code/ViteApp/src/models/models.ts:2094)
- [getFirstNewLowsHigherTimeframeEntryMethods](C:/Users/lingr/code/ViteApp/src/models/models.ts:2107)

### src/models/tradingPlans/tradingPlans.ts

- [hasSingleMomentumLevel](C:/Users/lingr/code/ViteApp/src/models/tradingPlans/tradingPlans.ts:40)
- [getDualMomentumLevels](C:/Users/lingr/code/ViteApp/src/models/tradingPlans/tradingPlans.ts:45)
- [getAnalysisDefaultRiskLevels](C:/Users/lingr/code/ViteApp/src/models/tradingPlans/tradingPlans.ts:76)
- [getTradingSettings](C:/Users/lingr/code/ViteApp/src/models/tradingPlans/tradingPlans.ts:102)
- [noZero](C:/Users/lingr/code/ViteApp/src/models/tradingPlans/tradingPlans.ts:161)
- [hasFirst60PlanForOneSide](C:/Users/lingr/code/ViteApp/src/models/tradingPlans/tradingPlans.ts:170)
- [isInRange](C:/Users/lingr/code/ViteApp/src/models/tradingPlans/tradingPlans.ts:174)
- [getMinTarget](C:/Users/lingr/code/ViteApp/src/models/tradingPlans/tradingPlans.ts:190)
- [populateTargets](C:/Users/lingr/code/ViteApp/src/models/tradingPlans/tradingPlans.ts:230)

### src/models/tradingState.ts

- [set](C:/Users/lingr/code/ViteApp/src/models/tradingState.ts:104)
- [getInitialBalance](C:/Users/lingr/code/ViteApp/src/models/tradingState.ts:116)
- [setPendingOrderTimeoutID](C:/Users/lingr/code/ViteApp/src/models/tradingState.ts:120)
- [onNativeEntryAccepted](C:/Users/lingr/code/ViteApp/src/models/tradingState.ts:146) — dynamically exercised by nativeEntryState.test.mjs.
- [setExitDescription](C:/Users/lingr/code/ViteApp/src/models/tradingState.ts:252)

### src/ui/chart.ts

- [getHoveredCandle](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:257)
- [hasCustomEntryPrice](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:455)
- [getMultiplier](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:508)
- [drawMaxEntry](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:843)
- [clearMaxEntry](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:852)
- [showToolTips](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:896)
- [showChart](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:1084)
- [invisibleChart](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:1091)
- [visibleChart](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:1098)
- [maximizeChart](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:1105)
- [normalSizeChart](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:1108)
- [resizeChart](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:1111)
- [addMarker](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:1120)
- [blinkChart](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:1236)
- [drawKeyAreas](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:1284)
- [displayState](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:1450)
- [setWatermark](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:1634)

### src/ui/questionPopup.ts

- [show](C:/Users/lingr/code/ViteApp/src/ui/questionPopup.ts:6)

### src/ui/ui.ts

- [reviewChartStart](C:/Users/lingr/code/ViteApp/src/ui/ui.ts:37)
- [reviewNextChart](C:/Users/lingr/code/ViteApp/src/ui/ui.ts:48)
- [addOneLineDiv](C:/Users/lingr/code/ViteApp/src/ui/ui.ts:74)
- [addOneLineSpan](C:/Users/lingr/code/ViteApp/src/ui/ui.ts:82)

### src/utils/helper.ts

- [numberToString](C:/Users/lingr/code/ViteApp/src/utils/helper.ts:45)
- [getMarketCloseTime](C:/Users/lingr/code/ViteApp/src/utils/helper.ts:82)
- [getSecondsToNextMinute](C:/Users/lingr/code/ViteApp/src/utils/helper.ts:85)
- [getMillisecondsSinceMarketOpen](C:/Users/lingr/code/ViteApp/src/utils/helper.ts:95)
- [getSecondsToMarketOpen](C:/Users/lingr/code/ViteApp/src/utils/helper.ts:98)
- [isInActiveHoursOfMarket](C:/Users/lingr/code/ViteApp/src/utils/helper.ts:102)
- [isRegularMarketSessionTime](C:/Users/lingr/code/ViteApp/src/utils/helper.ts:106)
- [toUserTimeString](C:/Users/lingr/code/ViteApp/src/utils/helper.ts:135)
- [playOrderSubmissionSound](C:/Users/lingr/code/ViteApp/src/utils/helper.ts:144)
- [jsDateToTradingViewUTCForTimeframe](C:/Users/lingr/code/ViteApp/src/utils/helper.ts:166)
- [isIndex](C:/Users/lingr/code/ViteApp/src/utils/helper.ts:178)
- [getTargetPrice](C:/Users/lingr/code/ViteApp/src/utils/helper.ts:182)
- [isToday](C:/Users/lingr/code/ViteApp/src/utils/helper.ts:229)
- [isNewPriceMoreProfitableThanCurrentPrice](C:/Users/lingr/code/ViteApp/src/utils/helper.ts:257)
- [roundListToCents](C:/Users/lingr/code/ViteApp/src/utils/helper.ts:265)
- [printBar](C:/Users/lingr/code/ViteApp/src/utils/helper.ts:273)
- [generateUniqueString](C:/Users/lingr/code/ViteApp/src/utils/helper.ts:277)
- [getPullbackPrice](C:/Users/lingr/code/ViteApp/src/utils/helper.ts:285)
- [updateHtmlIfChanged](C:/Users/lingr/code/ViteApp/src/utils/helper.ts:323)
- [throttle](C:/Users/lingr/code/ViteApp/src/utils/helper.ts:364)

### src/utils/timeHelper.ts

- [formatDateToHHMMSS](C:/Users/lingr/code/ViteApp/src/utils/timeHelper.ts:21)
- [getPreciseTimeString](C:/Users/lingr/code/ViteApp/src/utils/timeHelper.ts:36)
- [localTimeToNewYorkTime](C:/Users/lingr/code/ViteApp/src/utils/timeHelper.ts:100)
- [isBeforeMarketOpenHours](C:/Users/lingr/code/ViteApp/src/utils/timeHelper.ts:112)
- [getTomorrowString](C:/Users/lingr/code/ViteApp/src/utils/timeHelper.ts:139)
- [getYesterdayString](C:/Users/lingr/code/ViteApp/src/utils/timeHelper.ts:145)

### src/utils/webRequest.ts

- [postForm](C:/Users/lingr/code/ViteApp/src/utils/webRequest.ts:26)
- [postForm2](C:/Users/lingr/code/ViteApp/src/utils/webRequest.ts:32)
- [asyncGet2](C:/Users/lingr/code/ViteApp/src/utils/webRequest.ts:41)
- [asyncGet](C:/Users/lingr/code/ViteApp/src/utils/webRequest.ts:53)
- [asyncGetWithoutToken](C:/Users/lingr/code/ViteApp/src/utils/webRequest.ts:65)

## Unreferenced class methods

No checked-in TS/generator identifier reference to these method names was found. Widget/tradebook objects can be inspected dynamically through browser globals, so this is a static candidate list.

| Method | Location |
| --- | --- |
| Tradebook.getCommonLiveStats | [src/tradebooks/baseTradebook.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/baseTradebook.ts:35) |
| Tradebook.getButtonForLabel | [src/tradebooks/baseTradebook.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/baseTradebook.ts:58) |
| Tradebook.includeFirstNewHighEntry | [src/tradebooks/baseTradebook.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/baseTradebook.ts:85) |
| Tradebook.hasPositionForTradebook | [src/tradebooks/baseTradebook.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/baseTradebook.ts:149) |
| BookmapWallReversal.getNativeExecutionDefinition | [src/tradebooks/bookmapWallReversal.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/bookmapWallReversal.ts:70) |

## Constants and enum members without runtime symbol reads

Type/schema uses may still require a declaration (for example BreakoutTradeStatus types). Model enums can also be used by external/global consumers or serialized strings. The four GlobalSettings toggles and stale streaming-condition constants have no application consumer; do not confuse them with the active numeric condition list in trading/libraries/massive/mapper.ts.

| Name | Location | Exposure |
| --- | --- | --- |
| allowLiveStats | [src/config/globalSettings.ts](C:/Users/lingr/code/ViteApp/src/config/globalSettings.ts:15) | No runtime symbol reads. |
| showBestPlans | [src/config/globalSettings.ts](C:/Users/lingr/code/ViteApp/src/config/globalSettings.ts:17) | No runtime symbol reads. |
| showTradebooksForPosition | [src/config/globalSettings.ts](C:/Users/lingr/code/ViteApp/src/config/globalSettings.ts:18) | No runtime symbol reads. |
| checkMaxEntryThreshold | [src/config/globalSettings.ts](C:/Users/lingr/code/ViteApp/src/config/globalSettings.ts:19) | No runtime symbol reads. |
| cloudAreaCandleSettings | [src/ui/chartSettings.ts](C:/Users/lingr/code/ViteApp/src/ui/chartSettings.ts:214) | No runtime symbol reads. |
| cloudLineSettings | [src/ui/chartSettings.ts](C:/Users/lingr/code/ViteApp/src/ui/chartSettings.ts:235) | No runtime symbol reads. |
| openRangeLineSettings | [src/ui/chartSettings.ts](C:/Users/lingr/code/ViteApp/src/ui/chartSettings.ts:254) | No runtime symbol reads. |
| BOOKMAP_WIRE_PRICE_UNIT_FIELD | [src/bookmap/priceNormalization.ts](C:/Users/lingr/code/ViteApp/src/bookmap/priceNormalization.ts:9) | No runtime symbol reads. |
| TwoCandlesPattern.UpTrend | [src/models/models.ts](C:/Users/lingr/code/ViteApp/src/models/models.ts:141) | Browser-global namespace; review external/schema uses. |
| TwoCandlesPattern.StrongUpTrend | [src/models/models.ts](C:/Users/lingr/code/ViteApp/src/models/models.ts:142) | Browser-global namespace; review external/schema uses. |
| TwoCandlesPattern.DownTrend | [src/models/models.ts](C:/Users/lingr/code/ViteApp/src/models/models.ts:143) | Browser-global namespace; review external/schema uses. |
| TwoCandlesPattern.StrongDownTrend | [src/models/models.ts](C:/Users/lingr/code/ViteApp/src/models/models.ts:144) | Browser-global namespace; review external/schema uses. |
| TwoCandlesPattern.InsideBar | [src/models/models.ts](C:/Users/lingr/code/ViteApp/src/models/models.ts:145) | Browser-global namespace; review external/schema uses. |
| TwoCandlesPattern.LongEngulfing | [src/models/models.ts](C:/Users/lingr/code/ViteApp/src/models/models.ts:146) | Browser-global namespace; review external/schema uses. |
| TwoCandlesPattern.ShortEngulfing | [src/models/models.ts](C:/Users/lingr/code/ViteApp/src/models/models.ts:147) | Browser-global namespace; review external/schema uses. |
| BreakoutTradeStatus.None | [src/models/models.ts](C:/Users/lingr/code/ViteApp/src/models/models.ts:150) | Browser-global namespace; review external/schema uses. |
| BreakoutTradeStatus.Pending | [src/models/models.ts](C:/Users/lingr/code/ViteApp/src/models/models.ts:151) | Browser-global namespace; review external/schema uses. |
| BreakoutTradeStatus.Triggered | [src/models/models.ts](C:/Users/lingr/code/ViteApp/src/models/models.ts:152) | Browser-global namespace; review external/schema uses. |
| BreakoutTradeStatus.FirstLeg | [src/models/models.ts](C:/Users/lingr/code/ViteApp/src/models/models.ts:153) | Browser-global namespace; review external/schema uses. |
| BreakoutTradeStatus.FirstRetracement | [src/models/models.ts](C:/Users/lingr/code/ViteApp/src/models/models.ts:154) | Browser-global namespace; review external/schema uses. |
| BreakoutTradeStatus.SecondLeg | [src/models/models.ts](C:/Users/lingr/code/ViteApp/src/models/models.ts:155) | Browser-global namespace; review external/schema uses. |
| BreakoutTradeStatus.SecondRetracement | [src/models/models.ts](C:/Users/lingr/code/ViteApp/src/models/models.ts:156) | Browser-global namespace; review external/schema uses. |
| CommonEntryMethods.FalsePremarketHighBreakout | [src/models/models.ts](C:/Users/lingr/code/ViteApp/src/models/models.ts:2041) | Browser-global namespace; review external/schema uses. |
| CommonEntryMethods.LowOfDay | [src/models/models.ts](C:/Users/lingr/code/ViteApp/src/models/models.ts:2042) | Browser-global namespace; review external/schema uses. |
| CommonEntryMethods.HighOfDay | [src/models/models.ts](C:/Users/lingr/code/ViteApp/src/models/models.ts:2043) | Browser-global namespace; review external/schema uses. |
| TimeFrameEntryMethod.M1 | [src/models/models.ts](C:/Users/lingr/code/ViteApp/src/models/models.ts:2047) | Browser-global namespace; review external/schema uses. |
| TradebookFamilyName.GapAndCrap | [src/models/models.ts](C:/Users/lingr/code/ViteApp/src/models/models.ts:2136) | Browser-global namespace; review external/schema uses. |
| TradebookFamilyName.GapAndGo | [src/models/models.ts](C:/Users/lingr/code/ViteApp/src/models/models.ts:2137) | Browser-global namespace; review external/schema uses. |
| TradebookFamilyName.GapGiveAndGo | [src/models/models.ts](C:/Users/lingr/code/ViteApp/src/models/models.ts:2138) | Browser-global namespace; review external/schema uses. |
| TradebookFamilyName.GapDownAndGoDown | [src/models/models.ts](C:/Users/lingr/code/ViteApp/src/models/models.ts:2139) | Browser-global namespace; review external/schema uses. |
| TradebookFamilyName.GapDownAndGoUp | [src/models/models.ts](C:/Users/lingr/code/ViteApp/src/models/models.ts:2140) | Browser-global namespace; review external/schema uses. |
| conditionsNotUpdateLastPrice | [src/streaming/timeSaleParse.ts](C:/Users/lingr/code/ViteApp/src/streaming/timeSaleParse.ts:4) | No runtime symbol reads. |
| conditionsNotUpdateHighLow | [src/controllers/streamingHandler.ts](C:/Users/lingr/code/ViteApp/src/controllers/streamingHandler.ts:6) | No runtime symbol reads. |
| conditionsNotUpdateLastPrice | [src/controllers/streamingHandler.ts](C:/Users/lingr/code/ViteApp/src/controllers/streamingHandler.ts:9) | No runtime symbol reads. |
| conditionsNotUpdateLastPriceNumbers | [src/controllers/streamingHandler.ts](C:/Users/lingr/code/ViteApp/src/controllers/streamingHandler.ts:12) | No runtime symbol reads. |
| conditionsNotUpdateVolume | [src/controllers/streamingHandler.ts](C:/Users/lingr/code/ViteApp/src/controllers/streamingHandler.ts:15) | No runtime symbol reads. |

## Unused bindings and parameters

Full TypeScript diagnostic inventory with noUnusedLocals/noUnusedParameters enabled. This is supporting evidence, not 192 dead features. Some unused bindings initialize by calling active functions: preserve side effects when removing the binding. Unused parameters may be required by callback/override contracts.

| Location | Diagnostic |
| --- | --- |
| [src/algorithms/autoTrader.ts](C:/Users/lingr/code/ViteApp/src/algorithms/autoTrader.ts:5) | TS6133: 'TradingPlans' is declared but its value is never read. |
| [src/algorithms/autoTrader.ts](C:/Users/lingr/code/ViteApp/src/algorithms/autoTrader.ts:244) | TS6133: 'scheduleSecondMinuteCloseEvent' is declared but its value is never read. |
| [src/algorithms/autoTrader.ts](C:/Users/lingr/code/ViteApp/src/algorithms/autoTrader.ts:279) | TS6133: 'symbol' is declared but its value is never read. |
| [src/algorithms/autoTrader.ts](C:/Users/lingr/code/ViteApp/src/algorithms/autoTrader.ts:279) | TS6133: 'openPrice' is declared but its value is never read. |
| [src/algorithms/autoTrader.ts](C:/Users/lingr/code/ViteApp/src/algorithms/autoTrader.ts:303) | TS6133: 'symbolData' is declared but its value is never read. |
| [src/algorithms/autoTrader.ts](C:/Users/lingr/code/ViteApp/src/algorithms/autoTrader.ts:345) | TS6133: 'symbol' is declared but its value is never read. |
| [src/algorithms/autoTrader.ts](C:/Users/lingr/code/ViteApp/src/algorithms/autoTrader.ts:510) | TS6133: 'symbol' is declared but its value is never read. |
| [src/algorithms/autoTrader.ts](C:/Users/lingr/code/ViteApp/src/algorithms/autoTrader.ts:544) | TS6133: 'isNewCandleData' is declared but its value is never read. |
| [src/algorithms/autoTrader.ts](C:/Users/lingr/code/ViteApp/src/algorithms/autoTrader.ts:555) | TS6133: 'symbol' is declared but its value is never read. |
| [src/algorithms/patterns.ts](C:/Users/lingr/code/ViteApp/src/algorithms/patterns.ts:546) | TS6133: 'symbol' is declared but its value is never read. |
| [src/algorithms/riskManager.ts](C:/Users/lingr/code/ViteApp/src/algorithms/riskManager.ts:37) | TS6133: 'setupQuality' is declared but its value is never read. |
| [src/algorithms/riskManager.ts](C:/Users/lingr/code/ViteApp/src/algorithms/riskManager.ts:48) | TS6133: 'orOverride' is declared but its value is never read. |
| [src/algorithms/riskManager.ts](C:/Users/lingr/code/ViteApp/src/algorithms/riskManager.ts:65) | TS6133: 'basePlan' is declared but its value is never read. |
| [src/algorithms/riskManager.ts](C:/Users/lingr/code/ViteApp/src/algorithms/riskManager.ts:89) | TS6133: 'getRiskMultiplerForNextEntry2' is declared but its value is never read. |
| [src/algorithms/riskManager.ts](C:/Users/lingr/code/ViteApp/src/algorithms/riskManager.ts:108) | TS6133: 'getRiskInDollarForNextEntry' is declared but its value is never read. |
| [src/algorithms/riskManager.ts](C:/Users/lingr/code/ViteApp/src/algorithms/riskManager.ts:121) | TS6133: 'logTags' is declared but its value is never read. |
| [src/algorithms/riskManager.ts](C:/Users/lingr/code/ViteApp/src/algorithms/riskManager.ts:125) | TS6133: 'p' is declared but its value is never read. |
| [src/algorithms/riskManager.ts](C:/Users/lingr/code/ViteApp/src/algorithms/riskManager.ts:126) | TS6133: 'e' is declared but its value is never read. |
| [src/algorithms/riskManager.ts](C:/Users/lingr/code/ViteApp/src/algorithms/riskManager.ts:127) | TS6133: 'r' is declared but its value is never read. |
| [src/algorithms/riskManager.ts](C:/Users/lingr/code/ViteApp/src/algorithms/riskManager.ts:223) | TS6133: 'isLong' is declared but its value is never read. |
| [src/algorithms/rules.ts](C:/Users/lingr/code/ViteApp/src/algorithms/rules.ts:83) | TS6133: 'symbol' is declared but its value is never read. |
| [src/algorithms/rules.ts](C:/Users/lingr/code/ViteApp/src/algorithms/rules.ts:83) | TS6133: 'secondsSinceMarketOpen' is declared but its value is never read. |
| [src/algorithms/rules.ts](C:/Users/lingr/code/ViteApp/src/algorithms/rules.ts:83) | TS6133: 'stopOutPrice' is declared but its value is never read. |
| [src/algorithms/rules.ts](C:/Users/lingr/code/ViteApp/src/algorithms/rules.ts:169) | TS6133: 'riskMultiples' is declared but its value is never read. |
| [src/algorithms/rules.ts](C:/Users/lingr/code/ViteApp/src/algorithms/rules.ts:206) | TS6133: 'symbol' is declared but its value is never read. |
| [src/algorithms/rules.ts](C:/Users/lingr/code/ViteApp/src/algorithms/rules.ts:375) | TS6133: 'symbol' is declared but its value is never read. |
| [src/algorithms/strategies.ts](C:/Users/lingr/code/ViteApp/src/algorithms/strategies.ts:3) | TS6133: 'R2Target' is declared but its value is never read. |
| [src/algorithms/watchlist.ts](C:/Users/lingr/code/ViteApp/src/algorithms/watchlist.ts:169) | TS6133: 'watchlist' is declared but its value is never read. |
| [src/api/broker.ts](C:/Users/lingr/code/ViteApp/src/api/broker.ts:356) | TS6133: 'positionEffectIsOpen' is declared but its value is never read. |
| [src/api/broker.ts](C:/Users/lingr/code/ViteApp/src/api/broker.ts:370) | TS6133: 'aggregateEntriesExecutions' is declared but its value is never read. |
| [src/api/broker.ts](C:/Users/lingr/code/ViteApp/src/api/broker.ts:384) | TS6133: 'key' is declared but its value is never read. |
| [src/api/broker.ts](C:/Users/lingr/code/ViteApp/src/api/broker.ts:411) | TS6133: 'getRealizedPnL' is declared but its value is never read. |
| [src/api/broker.ts](C:/Users/lingr/code/ViteApp/src/api/broker.ts:430) | TS6133: 'isTradeClosed' is declared but its value is never read. |
| [src/api/marketData.ts](C:/Users/lingr/code/ViteApp/src/api/marketData.ts:103) | TS6133: 'symbol' is declared but its value is never read. |
| [src/api/schwab/api.ts](C:/Users/lingr/code/ViteApp/src/api/schwab/api.ts:23) | TS6133: 'fetchBrokerResponse' is declared but its value is never read. |
| [src/api/schwab/api.ts](C:/Users/lingr/code/ViteApp/src/api/schwab/api.ts:27) | TS6133: 'TRADER_API_HOST' is declared but its value is never read. |
| [src/api/schwab/api.ts](C:/Users/lingr/code/ViteApp/src/api/schwab/api.ts:182) | TS6133: 'summary' is declared but its value is never read. |
| [src/api/schwab/api.ts](C:/Users/lingr/code/ViteApp/src/api/schwab/api.ts:345) | TS6133: 'positionIsLong' is declared but its value is never read. |
| [src/api/schwab/api.ts](C:/Users/lingr/code/ViteApp/src/api/schwab/api.ts:389) | TS6133: 'positionIsLong' is declared but its value is never read. |
| [src/api/schwab/api.ts](C:/Users/lingr/code/ViteApp/src/api/schwab/api.ts:528) | TS6133: 'logErrorForObject' is declared but its value is never read. |
| [src/api/schwab/orderFactory.ts](C:/Users/lingr/code/ViteApp/src/api/schwab/orderFactory.ts:641) | TS6133: 'orderType' is declared but its value is never read. |
| [src/api/schwab/orderFactory.ts](C:/Users/lingr/code/ViteApp/src/api/schwab/orderFactory.ts:641) | TS6133: 'submitTime' is declared but its value is never read. |
| [src/api/schwab/streaming.ts](C:/Users/lingr/code/ViteApp/src/api/schwab/streaming.ts:79) | TS6133: 'receivedTime' is declared but its value is never read. |
| [src/api/tdAmeritrade/api.ts](C:/Users/lingr/code/ViteApp/src/api/tdAmeritrade/api.ts:22) | TS6133: 'placeOrderBase' is declared but its value is never read. |
| [src/api/tdAmeritrade/api.ts](C:/Users/lingr/code/ViteApp/src/api/tdAmeritrade/api.ts:52) | TS6133: 'getOrdersForSymbol' is declared but its value is never read. |
| [src/api/tdAmeritrade/api.ts](C:/Users/lingr/code/ViteApp/src/api/tdAmeritrade/api.ts:217) | TS6133: 'summary' is declared but its value is never read. |
| [src/api/tdAmeritrade/orderFactory.ts](C:/Users/lingr/code/ViteApp/src/api/tdAmeritrade/orderFactory.ts:546) | TS6133: 'orderType' is declared but its value is never read. |
| [src/api/tdAmeritrade/orderFactory.ts](C:/Users/lingr/code/ViteApp/src/api/tdAmeritrade/orderFactory.ts:546) | TS6133: 'submitTime' is declared but its value is never read. |
| [src/bookmap/bookmapSocket.ts](C:/Users/lingr/code/ViteApp/src/bookmap/bookmapSocket.ts:24) | TS6133: 'DEFAULT_PARTIALS_COUNT' is declared but its value is never read. |
| [src/controllers/adjustExitsHandler.ts](C:/Users/lingr/code/ViteApp/src/controllers/adjustExitsHandler.ts:15) | TS6133: 'totalCount' is declared but its value is never read. |
| [src/controllers/adjustExitsHandler.ts](C:/Users/lingr/code/ViteApp/src/controllers/adjustExitsHandler.ts:106) | TS6133: 'symbol' is declared but its value is never read. |
| [src/controllers/entryHandler.ts](C:/Users/lingr/code/ViteApp/src/controllers/entryHandler.ts:19) | TS6133: 'getOrderType' is declared but its value is never read. |
| [src/controllers/entryHandler.ts](C:/Users/lingr/code/ViteApp/src/controllers/entryHandler.ts:33) | TS6133: 'secondsSinceMarketOpen' is declared but its value is never read. |
| [src/controllers/entryHandler.ts](C:/Users/lingr/code/ViteApp/src/controllers/entryHandler.ts:34) | TS6133: 'plan' is declared but its value is never read. |
| [src/controllers/entryRulesChecker.ts](C:/Users/lingr/code/ViteApp/src/controllers/entryRulesChecker.ts:31) | TS6133: 'stopOutPrice' is declared but its value is never read. |
| [src/controllers/entryRulesChecker.ts](C:/Users/lingr/code/ViteApp/src/controllers/entryRulesChecker.ts:31) | TS6133: 'useMarketOrder' is declared but its value is never read. |
| [src/controllers/entryRulesChecker.ts](C:/Users/lingr/code/ViteApp/src/controllers/entryRulesChecker.ts:140) | TS6133: 'symbol' is declared but its value is never read. |
| [src/controllers/entryRulesChecker.ts](C:/Users/lingr/code/ViteApp/src/controllers/entryRulesChecker.ts:140) | TS6133: 'isLong' is declared but its value is never read. |
| [src/controllers/entryRulesChecker.ts](C:/Users/lingr/code/ViteApp/src/controllers/entryRulesChecker.ts:140) | TS6133: 'entryPrice' is declared but its value is never read. |
| [src/controllers/entryRulesChecker.ts](C:/Users/lingr/code/ViteApp/src/controllers/entryRulesChecker.ts:141) | TS6133: 'logTags' is declared but its value is never read. |
| [src/controllers/entryRulesChecker.ts](C:/Users/lingr/code/ViteApp/src/controllers/entryRulesChecker.ts:149) | TS6133: 'isLong' is declared but its value is never read. |
| [src/controllers/entryRulesChecker.ts](C:/Users/lingr/code/ViteApp/src/controllers/entryRulesChecker.ts:165) | TS6133: 'isLong' is declared but its value is never read. |
| [src/controllers/exitRulesChecker.ts](C:/Users/lingr/code/ViteApp/src/controllers/exitRulesChecker.ts:3) | TS6133: 'TradingPlansModels' is declared but its value is never read. |
| [src/controllers/exitRulesChecker.ts](C:/Users/lingr/code/ViteApp/src/controllers/exitRulesChecker.ts:6) | TS6133: 'Patterns' is declared but its value is never read. |
| [src/controllers/exitRulesChecker.ts](C:/Users/lingr/code/ViteApp/src/controllers/exitRulesChecker.ts:7) | TS6133: 'Firestore' is declared but its value is never read. |
| [src/controllers/exitRulesCheckerNew.ts](C:/Users/lingr/code/ViteApp/src/controllers/exitRulesCheckerNew.ts:35) | TS6133: 'isLong' is declared but its value is never read. |
| [src/controllers/exitRulesCheckerNew.ts](C:/Users/lingr/code/ViteApp/src/controllers/exitRulesCheckerNew.ts:56) | TS6133: 'isLong' is declared but its value is never read. |
| [src/controllers/exitRulesCheckerNew.ts](C:/Users/lingr/code/ViteApp/src/controllers/exitRulesCheckerNew.ts:76) | TS6133: 'isLong' is declared but its value is never read. |
| [src/controllers/exitRulesCheckerNew.ts](C:/Users/lingr/code/ViteApp/src/controllers/exitRulesCheckerNew.ts:101) | TS6133: 'isLong' is declared but its value is never read. |
| [src/controllers/exitRulesCheckerNew.ts](C:/Users/lingr/code/ViteApp/src/controllers/exitRulesCheckerNew.ts:121) | TS6133: 'symbol' is declared but its value is never read. |
| [src/controllers/exitRulesCheckerNew.ts](C:/Users/lingr/code/ViteApp/src/controllers/exitRulesCheckerNew.ts:121) | TS6133: 'logTags' is declared but its value is never read. |
| [src/controllers/exitRulesCheckerSimple.ts](C:/Users/lingr/code/ViteApp/src/controllers/exitRulesCheckerSimple.ts:10) | TS6133: 'symbol' is declared but its value is never read. |
| [src/controllers/exitRulesCheckerSimple.ts](C:/Users/lingr/code/ViteApp/src/controllers/exitRulesCheckerSimple.ts:77) | TS6133: 'exitPairsCount' is declared but its value is never read. |
| [src/controllers/exitRulesCheckerSimple.ts](C:/Users/lingr/code/ViteApp/src/controllers/exitRulesCheckerSimple.ts:77) | TS6133: 'isLong' is declared but its value is never read. |
| [src/controllers/exitRulesCheckerSimple.ts](C:/Users/lingr/code/ViteApp/src/controllers/exitRulesCheckerSimple.ts:77) | TS6133: 'isHigherTimeFrame' is declared but its value is never read. |
| [src/controllers/handler.ts](C:/Users/lingr/code/ViteApp/src/controllers/handler.ts:10) | TS6133: 'Patterns' is declared but its value is never read. |
| [src/controllers/handler.ts](C:/Users/lingr/code/ViteApp/src/controllers/handler.ts:62) | TS6133: 'totalCount' is declared but its value is never read. |
| [src/controllers/handler.ts](C:/Users/lingr/code/ViteApp/src/controllers/handler.ts:235) | TS6133: 'usageKey' is declared but its value is never read. |
| [src/controllers/handler.ts](C:/Users/lingr/code/ViteApp/src/controllers/handler.ts:240) | TS6133: 'keyIndex' is declared but its value is never read. |
| [src/controllers/handler.ts](C:/Users/lingr/code/ViteApp/src/controllers/handler.ts:392) | TS6133: 'symbol' is declared but its value is never read. |
| [src/controllers/keyboardHandler.ts](C:/Users/lingr/code/ViteApp/src/controllers/keyboardHandler.ts:30) | TS6133: 'symbolState' is declared but its value is never read. |
| [src/controllers/keyboardHandler.ts](C:/Users/lingr/code/ViteApp/src/controllers/keyboardHandler.ts:31) | TS6133: 'netQuantity' is declared but its value is never read. |
| [src/controllers/orderFlow.ts](C:/Users/lingr/code/ViteApp/src/controllers/orderFlow.ts:5) | TS6133: 'TradingState' is declared but its value is never read. |
| [src/controllers/orderFlow.ts](C:/Users/lingr/code/ViteApp/src/controllers/orderFlow.ts:167) | TS6133: 'symbol' is declared but its value is never read. |
| [src/controllers/orderFlowManager.ts](C:/Users/lingr/code/ViteApp/src/controllers/orderFlowManager.ts:14) | TS6133: 'bidSize' is declared but its value is never read. |
| [src/controllers/orderFlowManager.ts](C:/Users/lingr/code/ViteApp/src/controllers/orderFlowManager.ts:14) | TS6133: 'askSize' is declared but its value is never read. |
| [src/controllers/orderFlowManager.ts](C:/Users/lingr/code/ViteApp/src/controllers/orderFlowManager.ts:14) | TS6133: 'bidPrice' is declared but its value is never read. |
| [src/controllers/orderFlowManager.ts](C:/Users/lingr/code/ViteApp/src/controllers/orderFlowManager.ts:14) | TS6133: 'askPrice' is declared but its value is never read. |
| [src/controllers/orderFlowManager.ts](C:/Users/lingr/code/ViteApp/src/controllers/orderFlowManager.ts:34) | TS6133: 'atr' is declared but its value is never read. |
| [src/controllers/streamingHandler.ts](C:/Users/lingr/code/ViteApp/src/controllers/streamingHandler.ts:53) | TS6133: 'symbol' is declared but its value is never read. |
| [src/controllers/streamingHandler.ts](C:/Users/lingr/code/ViteApp/src/controllers/streamingHandler.ts:53) | TS6133: 'data' is declared but its value is never read. |
| [src/controllers/streamingHandler.ts](C:/Users/lingr/code/ViteApp/src/controllers/streamingHandler.ts:58) | TS6133: 'handleOrderRejection' is declared but its value is never read. |
| [src/data/db.ts](C:/Users/lingr/code/ViteApp/src/data/db.ts:8) | TS6133: 'Firestore' is declared but its value is never read. |
| [src/data/db.ts](C:/Users/lingr/code/ViteApp/src/data/db.ts:234) | TS6133: 'tradeTime' is declared but its value is never read. |
| [src/data/db.ts](C:/Users/lingr/code/ViteApp/src/data/db.ts:284) | TS6133: 'vwapCorrectionStartTimeMs' is declared but its value is never read. |
| [src/data/db.ts](C:/Users/lingr/code/ViteApp/src/data/db.ts:285) | TS6133: 'hasVwapCorrection' is declared but its value is never read. |
| [src/firestore.ts](C:/Users/lingr/code/ViteApp/src/firestore.ts:7) | TS6133: 'Helper' is declared but its value is never read. |
| [src/firestore.ts](C:/Users/lingr/code/ViteApp/src/firestore.ts:119) | TS6133: 'accountName' is declared but its value is never read. |
| [src/models/models.ts](C:/Users/lingr/code/ViteApp/src/models/models.ts:607) | TS6133: 'accountCache' is declared but its value is never read. |
| [src/models/models.ts](C:/Users/lingr/code/ViteApp/src/models/models.ts:757) | TS6133: 'key' is declared but its value is never read. |
| [src/models/models.ts](C:/Users/lingr/code/ViteApp/src/models/models.ts:878) | TS6133: 'candleTime' is declared but its value is never read. |
| [src/models/models.ts](C:/Users/lingr/code/ViteApp/src/models/models.ts:952) | TS6133: 'symbol' is declared but its value is never read. |
| [src/models/models.ts](C:/Users/lingr/code/ViteApp/src/models/models.ts:968) | TS6133: 'value' is declared but its value is never read. |
| [src/models/models.ts](C:/Users/lingr/code/ViteApp/src/models/models.ts:1396) | TS6133: 'minuteBucketNumber' is declared but its value is never read. |
| [src/models/models.ts](C:/Users/lingr/code/ViteApp/src/models/models.ts:1448) | TS6133: 'minuteBucketNumber' is declared but its value is never read. |
| [src/models/tradingPlans/tradingPlans.ts](C:/Users/lingr/code/ViteApp/src/models/tradingPlans/tradingPlans.ts:3) | TS6133: 'TimeHelper' is declared but its value is never read. |
| [src/models/tradingPlans/tradingPlans.ts](C:/Users/lingr/code/ViteApp/src/models/tradingPlans/tradingPlans.ts:111) | TS6133: 'symbol' is declared but its value is never read. |
| [src/models/tradingPlans/tradingPlans.ts](C:/Users/lingr/code/ViteApp/src/models/tradingPlans/tradingPlans.ts:119) | TS6133: 'symbol' is declared but its value is never read. |
| [src/models/tradingPlans/tradingPlans.ts](C:/Users/lingr/code/ViteApp/src/models/tradingPlans/tradingPlans.ts:138) | TS6133: 'plan' is declared but its value is never read. |
| [src/models/tradingPlans/tradingPlans.ts](C:/Users/lingr/code/ViteApp/src/models/tradingPlans/tradingPlans.ts:138) | TS6133: 'isLong' is declared but its value is never read. |
| [src/models/tradingPlans/tradingPlans.ts](C:/Users/lingr/code/ViteApp/src/models/tradingPlans/tradingPlans.ts:170) | TS6133: 'plan' is declared but its value is never read. |
| [src/models/tradingPlans/tradingPlans.ts](C:/Users/lingr/code/ViteApp/src/models/tradingPlans/tradingPlans.ts:230) | TS6133: 'isLong' is declared but its value is never read. |
| [src/models/tradingState.ts](C:/Users/lingr/code/ViteApp/src/models/tradingState.ts:15) | TS6133: 'getDefaultAtr' is declared but its value is never read. |
| [src/tosClient.ts](C:/Users/lingr/code/ViteApp/src/tosClient.ts:27) | TS6133: 'r2' is declared but its value is never read. |
| [src/tosClient.ts](C:/Users/lingr/code/ViteApp/src/tosClient.ts:28) | TS6133: 'r3' is declared but its value is never read. |
| [src/tosClient.ts](C:/Users/lingr/code/ViteApp/src/tosClient.ts:29) | TS6133: 'r4' is declared but its value is never read. |
| [src/tradebooks/baseTradebook.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/baseTradebook.ts:93) | TS6133: 'symbol' is declared but its value is never read. |
| [src/tradebooks/baseTradebook.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/baseTradebook.ts:93) | TS6133: 'keyIndex' is declared but its value is never read. |
| [src/tradebooks/baseTradebook.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/baseTradebook.ts:93) | TS6133: 'order' is declared but its value is never read. |
| [src/tradebooks/baseTradebook.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/baseTradebook.ts:93) | TS6133: 'pair' is declared but its value is never read. |
| [src/tradebooks/baseTradebook.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/baseTradebook.ts:93) | TS6133: 'newPrice' is declared but its value is never read. |
| [src/tradebooks/baseTradebook.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/baseTradebook.ts:102) | TS6133: 'symbol' is declared but its value is never read. |
| [src/tradebooks/baseTradebook.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/baseTradebook.ts:102) | TS6133: 'keyIndex' is declared but its value is never read. |
| [src/tradebooks/baseTradebook.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/baseTradebook.ts:102) | TS6133: 'order' is declared but its value is never read. |
| [src/tradebooks/baseTradebook.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/baseTradebook.ts:102) | TS6133: 'pair' is declared but its value is never read. |
| [src/tradebooks/baseTradebook.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/baseTradebook.ts:102) | TS6133: 'newPrice' is declared but its value is never read. |
| [src/tradebooks/baseTradebook.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/baseTradebook.ts:111) | TS6133: 'symbol' is declared but its value is never read. |
| [src/tradebooks/baseTradebook.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/baseTradebook.ts:111) | TS6133: 'keyIndex' is declared but its value is never read. |
| [src/tradebooks/baseTradebook.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/baseTradebook.ts:119) | TS6133: 'symbol' is declared but its value is never read. |
| [src/tradebooks/baseTradebook.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/baseTradebook.ts:119) | TS6133: 'exitPrice' is declared but its value is never read. |
| [src/tradebooks/baseTradebook.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/baseTradebook.ts:127) | TS6133: 'symbol' is declared but its value is never read. |
| [src/tradebooks/baseTradebook.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/baseTradebook.ts:127) | TS6133: 'newPrice' is declared but its value is never read. |
| [src/tradebooks/baseTradebook.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/baseTradebook.ts:135) | TS6133: 'entryPrice' is declared but its value is never read. |
| [src/tradebooks/baseTradebook.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/baseTradebook.ts:141) | TS6133: 'symbol' is declared but its value is never read. |
| [src/tradebooks/baseTradebook.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/baseTradebook.ts:141) | TS6133: 'entryPrice' is declared but its value is never read. |
| [src/tradebooks/baseTradebook.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/baseTradebook.ts:194) | TS6133: 'newPrice' is declared but its value is never read. |
| [src/tradebooks/bookmapWallReversal.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/bookmapWallReversal.ts:7) | TS6133: 'GlobalSettings' is declared but its value is never read. |
| [src/tradebooks/bookmapWallReversal.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/bookmapWallReversal.ts:10) | TS6133: 'GapAndGoAlgo' is declared but its value is never read. |
| [src/tradebooks/bookmapWallReversal.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/bookmapWallReversal.ts:175) | TS6133: 'logTags' is declared but its value is never read. |
| [src/tradebooks/bookmapWallReversal.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/bookmapWallReversal.ts:219) | TS6133: 'symbol' is declared but its value is never read. |
| [src/tradebooks/bookmapWallReversal.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/bookmapWallReversal.ts:219) | TS6133: 'keyIndex' is declared but its value is never read. |
| [src/tradebooks/bookmapWallReversal.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/bookmapWallReversal.ts:219) | TS6133: 'order' is declared but its value is never read. |
| [src/tradebooks/bookmapWallReversal.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/bookmapWallReversal.ts:220) | TS6133: 'pair' is declared but its value is never read. |
| [src/tradebooks/bookmapWallReversal.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/bookmapWallReversal.ts:220) | TS6133: 'newPrice' is declared but its value is never read. |
| [src/tradebooks/bookmapWallReversal.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/bookmapWallReversal.ts:220) | TS6133: 'logTags' is declared but its value is never read. |
| [src/tradebooks/bookmapWallReversal.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/bookmapWallReversal.ts:225) | TS6133: 'symbol' is declared but its value is never read. |
| [src/tradebooks/bookmapWallReversal.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/bookmapWallReversal.ts:225) | TS6133: 'keyIndex' is declared but its value is never read. |
| [src/tradebooks/bookmapWallReversal.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/bookmapWallReversal.ts:225) | TS6133: 'order' is declared but its value is never read. |
| [src/tradebooks/bookmapWallReversal.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/bookmapWallReversal.ts:226) | TS6133: 'pair' is declared but its value is never read. |
| [src/tradebooks/bookmapWallReversal.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/bookmapWallReversal.ts:226) | TS6133: 'newPrice' is declared but its value is never read. |
| [src/tradebooks/bookmapWallReversal.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/bookmapWallReversal.ts:226) | TS6133: 'logTags' is declared but its value is never read. |
| [src/tradebooks/bookmapWallReversal.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/bookmapWallReversal.ts:231) | TS6133: 'symbol' is declared but its value is never read. |
| [src/tradebooks/bookmapWallReversal.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/bookmapWallReversal.ts:231) | TS6133: 'keyIndex' is declared but its value is never read. |
| [src/tradebooks/bookmapWallReversal.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/bookmapWallReversal.ts:231) | TS6133: 'logTags' is declared but its value is never read. |
| [src/tradebooks/bookmapWallReversal.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/bookmapWallReversal.ts:236) | TS6133: 'symbol' is declared but its value is never read. |
| [src/tradebooks/bookmapWallReversal.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/bookmapWallReversal.ts:236) | TS6133: 'logTags' is declared but its value is never read. |
| [src/tradebooks/bookmapWallReversal.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/bookmapWallReversal.ts:236) | TS6133: 'newPrice' is declared but its value is never read. |
| [src/tradebooks/bookmapWallReversal.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/bookmapWallReversal.ts:241) | TS6133: 'newPrice' is declared but its value is never read. |
| [src/tradebooks/tradebooksManager.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/tradebooksManager.ts:19) | TS6133: 'isDirectionEnabled' is declared but its value is never read. |
| [src/tradebooks/tradebooksManager.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/tradebooksManager.ts:109) | TS6133: 'symbol' is declared but its value is never read. |
| [src/tradebooks/tradebooksManager.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/tradebooksManager.ts:109) | TS6133: 'openPrice' is declared but its value is never read. |
| [src/tradebooks/tradebooksManager.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/tradebooksManager.ts:109) | TS6133: 'lastVwapBeforeOpen' is declared but its value is never read. |
| [src/trading/runtime/tradingRuntime.test.ts](C:/Users/lingr/code/ViteApp/src/trading/runtime/tradingRuntime.test.ts:16) | TS6133: 'headers' is declared but its value is never read. |
| [src/ui/chart.ts](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:92) | TS6133: 'chartDims' is declared but its value is never read. |
| [src/ui/chart.ts](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:215) | TS6133: 'mouseEvent' is declared but its value is never read. |
| [src/ui/chart.ts](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:245) | TS6133: 'updateToolTip' is declared but its value is never read. |
| [src/ui/chart.ts](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:263) | TS6133: 'updateHoveredCandle' is declared but its value is never read. |
| [src/ui/chart.ts](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:332) | TS6133: 'pointerEvent' is declared but its value is never read. |
| [src/ui/chart.ts](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:448) | TS6133: 'symbol' is declared but its value is never read. |
| [src/ui/chart.ts](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:508) | TS6133: 'symbol' is declared but its value is never read. |
| [src/ui/chart.ts](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:518) | TS6133: 'widget' is declared but its value is never read. |
| [src/ui/chart.ts](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:765) | TS6133: 'widget' is declared but its value is never read. |
| [src/ui/chart.ts](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:808) | TS6133: 'atr' is declared but its value is never read. |
| [src/ui/chart.ts](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:810) | TS6133: 'hod' is declared but its value is never read. |
| [src/ui/chart.ts](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:811) | TS6133: 'lod' is declared but its value is never read. |
| [src/ui/chart.ts](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:1257) | TS6133: 'redColor' is declared but its value is never read. |
| [src/ui/chart.ts](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:1258) | TS6133: 'greenColor' is declared but its value is never read. |
| [src/ui/chart.ts](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:1259) | TS6133: 'blueColor' is declared but its value is never read. |
| [src/ui/chart.ts](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:1409) | TS6133: 'widget' is declared but its value is never read. |
| [src/ui/chart.ts](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:1441) | TS6133: 'runPostCandleCloseIndicators' is declared but its value is never read. |
| [src/ui/chart.ts](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:1445) | TS6133: 'newlyClosedCandle' is declared but its value is never read. |
| [src/ui/chart.ts](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:1445) | TS6133: 'localTime' is declared but its value is never read. |
| [src/ui/chart.ts](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:1467) | TS6133: 'hideButtonAfterSeconds' is declared but its value is never read. |
| [src/ui/chart.ts](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:1473) | TS6133: 'longContainer' is declared but its value is never read. |
| [src/ui/chart.ts](C:/Users/lingr/code/ViteApp/src/ui/chart.ts:1473) | TS6133: 'shortContainer' is declared but its value is never read. |
| [src/ui/chartSettings.ts](C:/Users/lingr/code/ViteApp/src/ui/chartSettings.ts:5) | TS6133: 'redColor' is declared but its value is never read. |
| [src/ui/chartSettings.ts](C:/Users/lingr/code/ViteApp/src/ui/chartSettings.ts:6) | TS6133: 'greenColor' is declared but its value is never read. |
| [src/ui/chartSettings.ts](C:/Users/lingr/code/ViteApp/src/ui/chartSettings.ts:87) | TS6133: 'tabIndex' is declared but its value is never read. |
| [src/ui/ui.ts](C:/Users/lingr/code/ViteApp/src/ui/ui.ts:20) | TS6133: 'source' is declared but its value is never read. |
| [src/ui/ui.ts](C:/Users/lingr/code/ViteApp/src/ui/ui.ts:69) | TS6133: 'symbolState' is declared but its value is never read. |
| [src/ui/ui.ts](C:/Users/lingr/code/ViteApp/src/ui/ui.ts:69) | TS6133: 'symbol' is declared but its value is never read. |
| [src/workers/marketDataWorker.ts](C:/Users/lingr/code/ViteApp/src/workers/marketDataWorker.ts:15) | TS6133: 'symbols' is declared but its value is never read. |

## Dependencies deliberately retained

- [src/config/profiles/profiles.ts](C:/Users/lingr/code/ViteApp/src/config/profiles/profiles.ts:1) — type dependency; absence from emitted runtime imports is expected.
- [src/notifications/types.ts](C:/Users/lingr/code/ViteApp/src/notifications/types.ts:1) — type dependency; absence from emitted runtime imports is expected.
- [src/trading/models/account.ts](C:/Users/lingr/code/ViteApp/src/trading/models/account.ts:1) — type dependency; absence from emitted runtime imports is expected.
- [src/trading/models/market.ts](C:/Users/lingr/code/ViteApp/src/trading/models/market.ts:1) — type dependency; absence from emitted runtime imports is expected.
- [src/trading/ports/credentials.ts](C:/Users/lingr/code/ViteApp/src/trading/ports/credentials.ts:1) — type dependency; absence from emitted runtime imports is expected.
- [src/trading/ports/http.ts](C:/Users/lingr/code/ViteApp/src/trading/ports/http.ts:1) — type dependency; absence from emitted runtime imports is expected.
- [src/workers/marketDataMessages.ts](C:/Users/lingr/code/ViteApp/src/workers/marketDataMessages.ts:1) — type dependency; absence from emitted runtime imports is expected.
- [src/config/secret_template.ts](C:/Users/lingr/code/ViteApp/src/config/secret_template.ts:1) — setup template.
- [src/indicators/camPivots.ts](C:/Users/lingr/code/ViteApp/src/indicators/camPivots.ts:1) — active indicator; separate from disconnected patterns/camPivots.ts.
- [src/api/schwab/entryOrderFactory.ts](C:/Users/lingr/code/ViteApp/src/api/schwab/entryOrderFactory.ts:1) and [src/api/schwab/closingOrderFactory.ts](C:/Users/lingr/code/ViteApp/src/api/schwab/closingOrderFactory.ts:1) — active order construction; only the old parsing/aggregation functions in orderFactory.ts are candidates.
- [src/tradebooks/baseTradebook.ts](C:/Users/lingr/code/ViteApp/src/tradebooks/baseTradebook.ts:1) and [src/trading/libraries/massive/api.ts](C:/Users/lingr/code/ViteApp/src/trading/libraries/massive/api.ts:1) — active inherited implementations.

## Verification

- Normal browser TypeScript check: passed (`node node_modules/typescript/bin/tsc --noEmit --pretty false`).
- DOM-free trading TypeScript check: passed (`node node_modules/typescript/bin/tsc -p tsconfig.trading.json --pretty false`).
- Git was clean at review start. Changes from this review are this Markdown report and its JSON inventory only.
- Exact inventory: [docs/dead-code-review-2026-10-04.json](C:/Users/lingr/code/ViteApp/docs/dead-code-review-2026-10-04.json:1).
