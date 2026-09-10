# Automatic daily attendance

Both HTML entry points load `src/attendance/bootstrap.ts` as an async module
before remote watchlist and jQuery scripts. It initializes a separate named Firebase
app directly from `tradingscripts.firebaseConfig` in localStorage. It does not import
the trading configuration, watchlist, broker, chart, or main application modules.
The main modules also import the idempotent bootstrap as a fallback.

Opening full or Lite ViteApp automatically reads `tradingAttendance/DD` (`01`–`31`) in
the existing Firebase project's Firestore. Dates use America/Los_Angeles, independent
of the machine's timezone and the configured historical trading date. This is a
single-trader collection shared across profiles, tabs, and devices using that project;
there is no user ID because the current application has no Firebase sign-in flow.

Each slot stores the full `tradingDate` to distinguish months and years. A slot for
another date is treated as no attendance today. If today's record exists it is never
rewritten. If absent or from another date, creation/replacement is allowed from
5:00:00 AM inclusive to 5:45:00 AM exclusive Pacific. A Firestore transaction rereads
the document before creation, preserving the first timestamp across simultaneous
tabs. The window is rechecked on transaction retries. The document contains:

```
tradingDate: "2026-09-10"
clockedInAt: Firestore server timestamp
policyVersion: 1
```

For example, October 10 reuses `tradingAttendance/10` from September 10. Reuse happens
only inside the clock-in window; a stale slot cannot authorize late trading. This
version writes at most 31 documents. Legacy `YYYY-MM-DD` documents are not read or
deleted automatically; any previously deployed records need a one-time cleanup.

Only a server-confirmed timestamp within today's window grants entry permission.
A late commit is invalid even if the request began before the deadline. Failed reads,
missing Firebase settings, invalid records, and offline operation keep entries locked.
The application retries every 15 seconds and on reconnect/visibility changes. An app
left open before 5:00 AM clocks in automatically during the window, including when
left open overnight. Attendance proves app activity, not human wakefulness.

The banner does not depend on the app's watchlist UI. Eligibility expires when the
Pacific date changes, even if a browser timer is suspended. Replay neither clocks in
nor gains live broker permission.

An expanded, collapsible Attendance events panel below the banner displays startup,
the current timestamp read from Firestore (or a missing/invalid record), clock-in
signals, confirmed writes, eligibility changes, blocked entries, and errors. Events
include Pacific dates and times and also appear in the browser console with the
`[attendance]` prefix. The panel retains the latest 100 events for this page session;
unchanged polling results are suppressed. A confirmed write is distinguished from
eligibility, which requires validating the subsequently read server timestamp.

After 5:45 AM Pacific, unverified attendance displays a large red, sticky TRADING
LOCKED banner at the top of both UIs. EntryRulesChecker rejects both global entries
and partial entries before other trading checks, logging the attendance reason in
the normal trading logs as well as the attendance panel. Closing paths are unchanged.

## Entry enforcement and limits

The shared broker entry functions and global entry rules reject unverified entries.
Schwab and legacy TD submission/replacement functions also inspect nested orders,
and Lite's direct submissions/replacements are guarded. TradeStation gates entries
and entry replacements. Existing closing-order paths and cancellation remain available.

This is application-level discipline, not a tamper-proof broker restriction. Closing
classification uses the existing app's order conventions; it does not independently
validate closing quantity against broker positions. Existing working entry orders
are not automatically canceled. Direct proxy/broker requests and edited application
code are outside this gate. No proxy or Cloud Function changes are made.

## Firestore access

No Cloud Function, new Firebase project, or daily TradingData deployment is required.
The configured Firestore must allow this application's reads and transactional creates/updates
in `tradingAttendance`. Existing production security rules are not checked into either
repository, so this change does not replace or deploy them. A permission error is shown
as a locked verification failure, never treated as an absent document.

Before production rollout, review the deployed rules for this collection. Preserve
the first timestamp for the same trading date, allow slot reuse for a new date, and
require `clockedInAt == request.time` on writes; do not introduce a
public writable collection just to bypass a permission error. Strong server-enforced
Pacific-time authorization and authenticated ownership need a separate rules/access
design: the current app has no authenticated identity, and Firestore rules do not
provide IANA timezone conversion. The client window and validation of the returned
server timestamp implement this version's time gate.

## Validation

Run `npm run test:attendance` and `npm run build`. Tests cover summer/winter and DST
boundaries, first-read behavior, preserved attendance, early/late startup, delayed reads,
midnight rollover, failed reads, and nested entry/closing order classification.
Use an isolated Firebase test project for end-to-end transaction and access-rule checks;
do not generate attendance in the live trading project for testing.
