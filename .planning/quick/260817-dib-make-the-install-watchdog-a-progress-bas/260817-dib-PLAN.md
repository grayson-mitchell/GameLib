---
phase: quick-260817-dib
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: [QUICK-260817-dib]
files_modified:
  - src/backend/downloadmanager/installStallWatchdog.ts
  - src/backend/downloadmanager/__tests__/installStallWatchdog.test.ts
  - src/backend/downloadmanager/utils.ts
  - src/backend/downloadmanager/__tests__/utils.test.ts
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/__tests__/depot.test.ts
  - .planning/quick/260817-dib-make-the-install-watchdog-a-progress-bas/LIVE-GATE.md

must_haves:
  truths:
    - "A native Steam install that keeps making forward progress is NEVER terminated by the DownloadManager watchdog, regardless of total elapsed duration"
    - "An install that makes NO observable forward progress for 8 minutes is still terminated, and still aborts its in-flight download exactly as it does today"
    - "Steam's 1s progress HEARTBEAT (which fires whether or not bytes moved) does not re-arm the watchdog — only an actual advance in reported percent or bytes does"
    - "A runner that never reports progress at all (sideload) behaves identically to today: a hard 8-minute bound from install start"
    - "The terminal error copy describes what was observed (no progress for N minutes) and no longer asserts an unestablished connection fault"
    - "The 260816-vgc failure-path abort (callAbortController + steam-gated stop(false)) still fires on a stall trip, unchanged"
  artifacts:
    - path: "src/backend/downloadmanager/installStallWatchdog.ts"
      provides: "Runner-agnostic no-progress (stall) bound around a promise, re-armed by backendEvents progress advances"
      exports: ["withStallTimeout", "isStallError", "INSTALL_NO_PROGRESS_TIMEOUT_MS"]
      min_lines: 60
    - path: "src/backend/downloadmanager/__tests__/installStallWatchdog.test.ts"
      provides: "Fake-timer RED/GREEN coverage: advance re-arms, heartbeat does not, listener cleanup"
      min_lines: 80
    - path: ".planning/quick/260817-dib-make-the-install-watchdog-a-progress-bas/LIVE-GATE.md"
      provides: "Operator recipe proving the wall-clock property against a real multi-GB download"
      contains: "proof by absence"
  key_links:
    - from: "src/backend/storeManagers/steam/depot.ts emitProgress"
      to: "backendEvents progressUpdate-<appId>"
      via: "sendProgressUpdate (backend/utils) instead of raw sendFrontendMessage"
      pattern: "sendProgressUpdate"
    - from: "src/backend/downloadmanager/installStallWatchdog.ts"
      to: "backendEvents progressUpdate-<appName>"
      via: "backendEvents.on listener that re-arms the deadline only on an ADVANCE"
      pattern: "progressUpdate-"
    - from: "src/backend/downloadmanager/utils.ts installQueueElement"
      to: "callAbortController(appName) + steam-gated stop(false)"
      via: "catch sets status='error', finally runs the unchanged 260816-vgc abort"
      pattern: "callAbortController"
---

<objective>
`INSTALL_WATCHDOG_MS = 8 * 60 * 1000` wraps the ENTIRE `install()` await
(`src/backend/downloadmanager/utils.ts:36,153-170`). For Steam that await includes the whole
depot download (`games.ts:1498`), so the watchdog is not a stall detector — it is a hard
ceiling on total install duration. HUMANKIND (37 GB, ~7.4 MiB/s, zero CDN errors) was killed
at 480944ms while sitting at 14%. It can never complete on this path, which blocks phase 23
plan `23-10` Tasks 1 and 2 (both need a completed multi-GB install).

Convert the bound from **total duration** to a **no-progress window** (todo option 1), re-armed
by the progress the DownloadManager already emits. Keep the numeric value at 8 minutes; only
its SEMANTICS change.

Purpose: make long native Steam installs possible while keeping a genuinely wedged install
bounded, and unblock `23-10`.
Output: a runner-agnostic stall watchdog, honest error copy, and a live-gate recipe.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<investigation_findings>

These were established before planning. Do not re-derive them; build on them.

### Q1 — Who else does this watchdog govern?

`libraryManagerMap` (`src/backend/storeManagers/index.ts:14-21`) has exactly six runners:
`sideload`, `gog`, `legendary`, `nile`, `zoom`, `steam`. (There is no separate `humble`
runner — Humble is a login/library surface, not an install runner.) Progress availability:

| Runner | Progress emitter | Reaches `backendEvents`? |
|--------|------------------|--------------------------|
| gog | `sendProgressUpdate` — `gog/games.ts:307` | YES |
| legendary | `sendProgressUpdate` — `legendary/games.ts:476` | YES |
| nile | `sendProgressUpdate` — `nile/games.ts:219` | YES |
| zoom | `sendProgressUpdate` — `zoom/games.ts:207` | YES |
| steam (native depot) | raw `sendFrontendMessage('progressUpdate', …)` — `steam/depot.ts:1912` | **NO — must be routed** |
| sideload | `onInstallOrUpdateOutput()` is a no-op stub — `sideload/games.ts:185-187` | NO (none exists) |

**No runner is left without a timeout.** A stall bound armed at call time and re-armed only on
progress degrades *exactly* to today's fixed ceiling for any runner that never reports progress.
So sideload is byte-for-byte unchanged, and the four child-process runners gain the same
duration relief Steam does. This is the decisive argument for option 1 over option 2.

### Q2 — What progress signal already exists?

`sendProgressUpdate` (`src/backend/utils.ts:1425-1428`) does two things: `sendFrontendMessage`
(renderer IPC) **and** `backendEvents.emit(\`progressUpdate-${payload.appName}\`, payload)`. The
typed event key already exists at `src/backend/backend_events.ts:20`. This is the seam — an
in-process, runner-agnostic, per-appName progress bus. Reuse it; invent nothing.

Payload shape is `GameStatus.progress: InstallProgress` (`src/common/types.ts:327-345`):
`percent?: number`, `bytes: string` (formatted via `getFileSize`, `utils.ts:151`), `eta`,
`downSpeed?`, `diskSpeed?`.

**TRAP — event arrival is NOT a progress signal.** `steam/depot.ts:1952-1958` runs a
`PROGRESS_HEARTBEAT_MS = 1000` (`depot.ts:833`) interval that calls `emitProgress(true)` every
second **regardless of chunk activity** — its own docstring says it exists to force an "honest
~0 MB/s progressUpdate when no chunk activity has occurred". A watchdog that re-arms on event
ARRIVAL would therefore never trip for Steam: non-vacuous, correctly computed, and guarding
nothing. The watchdog MUST re-arm only on an **advance**: `percent` increased, or the `bytes`
string changed.

Granularity bound, stated honestly: `getFileSize` is `filesize` with `base: 2` and default
2-decimal rounding, so `bytes` changes on roughly a 1%-of-current-magnitude step (~10 MB at GB
scale). Combined with `percent`, any run moving faster than ~20 KiB/s re-arms well inside the
window. Slower than that is not meaningfully alive, and is still strictly better than today.

### Q3 — What is the current `withTimeout` contract?

`src/backend/storeManagers/steam/withTimeout.ts:74-97`: `Promise.race([promise, timeoutPromise])`,
clears the timer in `finally`, rejects with an Error stamped `isTimeout: true`.

**It rejects the OUTER promise only — the inner work keeps running.** That is the exact mechanism
behind the orphaned-depot defect. `260816-vgc` compensated in `installQueueElement`'s `finally`
(`utils.ts:235-252`): on `status === 'error'` it calls `callAbortController(appName)` and, gated
to `runner === 'steam'`, `.stop(false)`. That routing is LOCKED. The new watchdog must reject the
same way through the same `catch` → `status = 'error'` → `finally` path so the abort is preserved
verbatim. Do not touch lines 235-252.

### Q4 — What stall threshold is defensible?

Two lower bounds constrain the window, and the depot layer already answers the second:

1. **Pre-download phase emits zero progress.** `resolveSteamInstallTarget` (~50s) plus
   `buildDepotPlan` retries (`STEAM_PICS_BULK_TIMEOUT_MS` 90s × `PLAN_BUILD_MAX_ATTEMPTS` 3) =
   ~320s worst case with no `progressUpdate` at all — the original D-01b rationale at
   `utils.ts:23-35`. The window must clear ~320s or a healthy-but-slow plan build false-trips.
2. **The depot layer already has a validated stall threshold.**
   `steam/depot/stallTracker.ts:46` — `STALL_TIMEOUT_MS = 3 * 60 * 1000`, chosen against the
   cycle-3 hardware diagnosis where a slow-but-alive run kept trickling bytes throughout a ~7min
   near-zero-throughput window. A single chunk's worst case is `CHUNK_FETCH_ATTEMPTS` 8
   (`depot.ts:811`) × (`CHUNK_FETCH_TIMEOUT_MS` 15000 + backoff ≤ 3000) ≈ 144s
   (`depot/decompress.ts:299,596`). The OUTER bound must sit ABOVE the inner one, so the inner
   detector gets to give up honestly first rather than being pre-empted.

**Selected: keep 480_000 ms (8 minutes), re-semantified as a no-progress window.** It clears the
~320s pre-download sum with the same headroom D-01b picked, sits comfortably above the depot's
own 180s stall bound, and — decisively — because the number does not move, this change introduces
**zero new false-trip risk for any runner**. Only the clock's meaning changes. Rename the constant
to `INSTALL_NO_PROGRESS_TIMEOUT_MS` so the semantic change is greppable.

### Decision 5 — error copy

`isTimeoutError`'s branch (`utils.ts:187-189`) currently maps ALL timeouts to
`'install did not settle — connection may be stale'`. For an inner `withTimeout` trip that copy is
accurate — a stale-but-present CM socket is literally what `withTimeout.ts` was built to detect.
The misdirection was applying it to the watchdog trip. So: **add** an `isStallError` branch ahead
of it with new copy, and **keep** the `isTimeoutError` branch intact for genuine inner CM timeouts.

i18n: `box.error.install.failed` (`utils.ts:270`) is NOT present in
`public/locales/en/translation.json` (`box.error` has no `install` child) — this backend dialog
surface supplies its English through the `t()` default argument. The new key
`box.error.install.stalled` does not exist either, so the "renaming via the default is a silent
no-op" trap does not bite. Use `{{minutes}}` — never `{{count}}` (reserved by i18next).
</investigation_findings>

<context>
@.planning/todos/pending/2026-08-16-eight-minute-install-watchdog-makes-long-native-steam-instal.md
@src/backend/downloadmanager/utils.ts
@src/backend/backend_events.ts

<interfaces>
<!-- Contracts the executor implements/consumes. No codebase exploration needed. -->

New module `src/backend/downloadmanager/installStallWatchdog.ts`:

```typescript
/** 8 minutes of ZERO observed forward progress. */
export const INSTALL_NO_PROGRESS_TIMEOUT_MS: number

export interface StallError extends Error {
  isStall: true
  /** ms of no observed progress at the moment of the trip */
  msSinceProgress: number
}

export function isStallError(err: unknown): err is StallError

/**
 * Rejects with a StallError once `stallMs` elapses with no OBSERVED ADVANCE in
 * `backendEvents`'s `progressUpdate-${appName}` payloads. Any advance re-arms the
 * full window. Transparent pass-through otherwise. Always removes its listener
 * and clears its timer, on BOTH resolve and reject.
 */
export function withStallTimeout<T>(
  promise: Promise<T>,
  appName: string,
  stallMs: number,
  label: string
): Promise<T>
```

Existing, unchanged (`src/backend/utils.ts:1425`):
```typescript
function sendProgressUpdate(payload: GameStatus): void
// -> sendFrontendMessage('progressUpdate', payload)
// -> backendEvents.emit(`progressUpdate-${payload.appName}`, payload)
```

Existing, unchanged (`src/common/types.ts:337`):
```typescript
export interface InstallProgress {
  bytes: string
  eta: string
  percent?: number
  downSpeed?: number
  diskSpeed?: number
}
```

`depot.test.ts`'s `jest.mock('backend/utils', …)` factory (line 92) must gain a
`sendProgressUpdate` that forwards to the ALREADY-mocked ipc module, so the three existing
`sendFrontendMessage('progressUpdate', …)` assertions (lines ~2663, ~3203, ~3489) stay green
without being rewritten. A `jest.mock` factory may not close over out-of-scope variables —
resolve the mock lazily inside the function body via `jest.requireMock('backend/ipc')`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Build the runner-agnostic stall watchdog</name>
  <files>src/backend/downloadmanager/installStallWatchdog.ts, src/backend/downloadmanager/__tests__/installStallWatchdog.test.ts</files>
  <behavior>
    Write these specs FIRST and confirm each fails against a not-yet-written module, then implement.

    - **RED vs the old ceiling (decisive):** a promise that never settles, with an ADVANCING
      progress payload emitted on `backendEvents` every 100s, is still pending after 20 minutes
      of fake time. This is the whole defect — it fails against any total-duration bound.
    - **Anti-vacuity vs the Steam heartbeat (decisive):** emitting the SAME payload
      (`percent: 14`, `bytes: '5.23 GB'`) every 1000ms — depot.ts's literal heartbeat behaviour —
      does NOT re-arm; the promise rejects at ~stallMs. Fails against any arrival-based
      implementation.
    - **`bytes` advance alone re-arms** even when `percent` is unchanged (large-title case: 1% can
      be hundreds of MB).
    - **`percent` advance alone re-arms** even when `bytes` is unchanged.
    - **No progress ever ⇒ rejects at exactly stallMs** — the sideload / never-reports case,
      identical to the pre-fix fixed ceiling.
    - **The rejection is a `StallError`:** `isStallError(err)` is true, `err.msSinceProgress`
      is >= stallMs, and the message names the observed no-progress window (not a connection).
    - **Transparent pass-through:** a promise resolving before stallMs resolves with its own value;
      a promise rejecting before stallMs rejects with its own error, not a StallError.
    - **Listener hygiene:** `backendEvents.listenerCount(\`progressUpdate-${appName}\`)` returns to
      its pre-call value on BOTH the resolve and the reject path. Assert this explicitly — a leak
      here accumulates one listener per install for the life of the process.
    - **Scoping:** a progress event for a DIFFERENT appName does not re-arm this watchdog.
  </behavior>
  <action>Create `src/backend/downloadmanager/installStallWatchdog.ts` exporting `INSTALL_NO_PROGRESS_TIMEOUT_MS` (480000), `StallError`, `isStallError`, and `withStallTimeout` per the `<interfaces>` block.

Implementation shape: race `promise` against a re-armable deadline. Subscribe to `backendEvents` on `progressUpdate-${appName}`. Track `lastPercent` (init -1) and `lastBytes` (init undefined); on each payload, treat it as an ADVANCE if `progress.percent !== undefined && progress.percent > lastPercent`, OR `progress.bytes !== undefined && progress.bytes !== lastBytes`. Update both trackers on an advance, and on an advance clear and re-arm the `setTimeout` for the full `stallMs`. Arm the initial timer at call time so a run that never reports progress behaves exactly as the old fixed ceiling.

Re-arm by clearing and re-creating the timer — do NOT add a polling `setInterval`; the depot layer already runs one and a second interval would be a new leak surface.

The rejection Error carries `isStall: true` and `msSinceProgress`, and its message names the label and the observed no-progress window in seconds. Do NOT stamp `isTimeout` — that marker belongs to `steam/withTimeout.ts` and is consumed by `withPlanBuildRetry`; overloading it would blur two different failure classes.

Clean up in a `finally`: `clearTimeout` AND `backendEvents.off(...)` the exact listener reference. Both must run on the resolve path and the reject path.

Document at the top, in a comment: this bounds NO-PROGRESS time, not total duration, and it re-arms on an ADVANCE rather than on event arrival because `steam/depot.ts`'s 1s heartbeat emits whether or not bytes moved.

This module is runner-agnostic and must not import anything from `storeManagers/steam` — it governs all six runners.</action>
  <verify>
    <automated>pnpm jest src/backend/downloadmanager/__tests__/installStallWatchdog.test.ts</automated>
  </verify>
  <done>All specs above pass. The two decisive specs (advancing-progress survives 20 min; repeated identical heartbeat payloads still trip at stallMs) were each confirmed RED before implementation.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire it into installQueueElement and route Steam's depot progress onto the bus</name>
  <files>src/backend/downloadmanager/utils.ts, src/backend/downloadmanager/__tests__/utils.test.ts, src/backend/storeManagers/steam/depot.ts, src/backend/storeManagers/steam/__tests__/depot.test.ts</files>
  <behavior>
    New specs in `downloadmanager/__tests__/utils.test.ts`, added to the existing
    `describe('installQueueElement — D-01b: belt-and-suspenders install watchdog')` block
    (rename that describe to name the stall semantics):

    - **RED (the defect):** with `installMock` returning a never-settling promise while advancing
      `progressUpdate-1091500` payloads are emitted on `backendEvents` every 100s, the install is
      still running after 20 minutes of fake time — no `status:'error'`, no dialog. This fails
      against `HEAD`.
    - **Stall trip still aborts (locked decision 4):** never-settling install, NO progress events;
      after the window it returns `{status:'error'}` AND `callAbortController` was called with the
      appName AND (runner `steam`) `stop(false)` was called. This guards the `260816-vgc` fix.
    - **Honest copy:** on a stall trip, `showDialogBoxModalAuto` receives an interpolated message
      built from the `box.error.install.stalled` key, and the value passed for `{{error}}` does not
      contain `connection may be stale`. Assert on the `i18next.t` key argument, not on rendered
      English.
    - **Inner CM timeout copy is preserved:** an `install()` that REJECTS with an
      `isTimeout: true` error still produces the existing `connection may be stale` reason —
      that branch is accurate for a stale CM socket and must not be collateral damage.
    - The two pre-existing specs in that block must remain green unmodified: never-settling with no
      progress trips the bound; a fast resolve passes through.

    In `steam/__tests__/depot.test.ts`, one new spec: a depot download emits progress that reaches
    `backendEvents` as `progressUpdate-${appId}`. Fails against `HEAD` (raw `sendFrontendMessage`
    never touches the bus). The three existing `sendFrontendMessage('progressUpdate', …)`
    assertions must stay green and unrewritten.
  </behavior>
  <action>**`src/backend/downloadmanager/utils.ts`:**

Rename `INSTALL_WATCHDOG_MS` to `INSTALL_NO_PROGRESS_TIMEOUT_MS`, importing it from the new module rather than redeclaring it. Rewrite the doc comment at lines 23-35: it must now say this bounds NO-PROGRESS time; keep the ~320s pre-download arithmetic because that is still the binding lower bound on the window (the pre-download phase emits no progress, so the INITIAL window still bounds it exactly as D-01b intended); add that the value is deliberately unchanged so no runner gains new false-trip risk, and that it sits above `stallTracker.ts`'s 180s inner bound so the depot's own honest give-up is never pre-empted.

Replace the `withTimeout(...)` call at lines 153-170 with `withStallTimeout(..., appName, INSTALL_NO_PROGRESS_TIMEOUT_MS, 'installQueueElement install stall watchdog')`. Keep the install argument object literal byte-for-byte — it is the fixed field list from 34.13 review A-01 and dropping a field is invisible to `tsc`.

In the `catch` (lines 183-192), add an `isStallError(error)` branch AHEAD of the existing `isTimeoutError(error)` branch. Keep `isTimeoutError` and its `connection may be stale` copy for the inner-CM-timeout case (per the Decision 5 finding). Split the two surfaces:
  - The value passed to `errorMessage(...)` (i.e. the log line, which the live gate greps) is a STABLE English diagnostic naming the observed no-progress window in seconds. Do not i18n the log.
  - `installErrorReason` (the value interpolated into the dialog at line 272) is `i18next.t('box.error.install.stalled', 'No download progress for {{minutes}} minutes — the install was stopped', { minutes: <window in whole minutes> })`. Use `{{minutes}}` — `{{count}}` is reserved by i18next and fails at render.

Do NOT modify the `finally` block (lines 193-277). The `260816-vgc` abort routing must remain verbatim; a stall trip reaches it through the same `status = 'error'` assignment.

After editing, run `pnpm lint-translations`. Only add `box.error.install.stalled` to `public/locales/en/translation.json` if that gate demands it — its sibling `box.error.install.failed` is absent from the catalog today, and gratuitously adding one key would desync the pair and can trip the i18n churn guard.

**`src/backend/storeManagers/steam/depot.ts`:**

At line 1912, replace `sendFrontendMessage('progressUpdate', {...})` with `sendProgressUpdate({...})`, keeping the payload object identical. Add `sendProgressUpdate` to the existing `import { getFileSize } from 'backend/utils'` (line 29). The `sendFrontendMessage` import at line 30 becomes unused — remove it (verify with a grep for other uses in the file first; there is currently only the one). `sendProgressUpdate` performs the same `sendFrontendMessage('progressUpdate', payload)` plus the bus emit, so the renderer sees no change.

Do NOT touch `steam/library.ts`'s `pollInstallOnce` emitter (~line 2000). That is the ACF-poller path, which runs fire-and-forget OUTSIDE `install()`'s await and is therefore not governed by this watchdog. Leaving it alone keeps the blast radius to the one emitter that actually matters.

**`src/backend/storeManagers/steam/__tests__/depot.test.ts`:**

Add `sendProgressUpdate` to the `jest.mock('backend/utils', …)` factory at line 92. Implement it to forward to the already-mocked ipc module — resolve that lazily INSIDE the function body with `jest.requireMock('backend/ipc')`, because a `jest.mock` factory may not close over out-of-scope variables. Doing this keeps the three existing `sendFrontendMessage('progressUpdate', …)` assertions green without rewriting them.</action>
  <verify>
    <automated>pnpm jest src/backend/downloadmanager/__tests__/utils.test.ts src/backend/storeManagers/steam/__tests__/depot.test.ts && pnpm codecheck && pnpm lint</automated>
  </verify>
  <done>The RED spec (advancing progress survives 20 minutes) passes; the stall trip still calls `callAbortController` and steam-gated `stop(false)`; the stall dialog uses `box.error.install.stalled` and no longer says `connection may be stale`; the inner-CM-timeout branch still does; every pre-existing spec in both files is green unmodified.</done>
</task>

<task type="auto">
  <name>Task 3: Write the live-gate recipe for the wall-clock property</name>
  <files>.planning/quick/260817-dib-make-the-install-watchdog-a-progress-bas/LIVE-GATE.md</files>
  <action>Jest proves the stall LOGIC under fake timers; it cannot prove the real property, which is elapsed wall-clock against a real multi-GB download. Write the operator recipe that closes it. The operator runs this as part of phase 23 wave 10 — this plan is NOT blocking-human.

The document must contain:

**Preconditions.** A build containing this change (`pnpm tauri:dev`, never bare `tauri dev` — that serves a stale static bundle). `enableSteamNativeInstall` opt-in ON. HUMANKIND appId 1124300 fully uninstalled first, including `~/Library/Application Support/Steam/steamapps/appmanifest_1124300.acf` and the `common/Humankind` directory — reusing residue produces a false result. Note that this run also satisfies `23-10` Task 1's fresh-install precondition, so the two should be run as one install.

**Gate A — the positive property (the defect closes).** Install HUMANKIND and let it run past 8 minutes. Assert:
  - `[Timing] runNativeDepotDownload: downloadSteamDepots … took <ms>` reports a duration well beyond 480000ms with `status` NOT `cancelled`.
  - Percent continues advancing past the 8-minute mark in the `[Timing] chunk-stream stats` lines.
  - **Proof by absence** — the load-bearing assertion. Neither of these appears at any point:
    `Installation of 1124300 failed with:` and
    `Aborting in-flight download for 1124300 after terminal install failure`.
    Record the grep and its empty result verbatim; an absence claimed without the command is not evidence.
  - The install reaches 100% and `appmanifest_1124300.acf` is written.

**Gate B — the negative property (the watchdog still guards).** Prove a genuine stall still trips, or the fix has removed the bound rather than rescoped it. Start an install, then blackhole the CDN so requests HANG rather than being refused: route `*.steamcontent.com` to the unroutable `203.0.113.1`, NOT to `127.0.0.1` — a loopback entry REFUSES in ~1ms, so the timeout path never runs (`curl` exit 28 = hang is what you want; exit 7 = refused means the setup is wrong). Assert that within ~8 minutes of the last byte landing: the new stall log line appears naming the no-progress window, `Aborting in-flight download for 1124300 after terminal install failure` appears, the dialog copy describes no-progress rather than a stale connection, and — by absence — no `[Timing] chunk-stream stats` line lands more than 20s after the failure line (the `260816-vgc` abort still works).

**Harness.** `monitor-abort-gate.sh` (in the session scratchpad `abort-gate/` directory) already parses exactly these lines: `FAIL_RE`, `ABORT_RE`, `STEAM_ABORT_RE`, `CHUNK_RE`, with `GRACE_SEC=20`. For Gate B it runs unmodified. For Gate A it must be INVERTED — the appearance of `FAIL_RE` becomes the FAILURE verdict and its absence across the full download becomes PASS; state that inversion explicitly, and note the harness's phase-0 wait loop must be extended past its 30-minute `DEADLINE` since a 37 GB title at ~7.4 MiB/s needs roughly an hour. Copy the script into this quick task's directory before editing it — do not mutate the sibling todo's evidence harness in place.

**Anti-false-pass note.** A grep assertion must fail against a known-bad input. Before trusting Gate A's absence check, run the same grep against the preserved
`RUN-20260817-humankind-watchdog.log` (which DOES contain both lines) and confirm it reports a hit. An absence check that has never produced a hit is not calibrated.

**Recording.** Results land in `23-UAT.md` alongside `23-10` Task 1, and this todo
(`.planning/todos/pending/2026-08-16-eight-minute-install-watchdog-makes-long-native-steam-instal.md`)
closes only on a Gate A pass. Do NOT touch the sibling todo
`2026-08-16-aborted-depot-residue-has-no-acf.md` — the on-disk residue gap is out of scope here.</action>
  <verify>
    <automated>test -f .planning/quick/260817-dib-make-the-install-watchdog-a-progress-bas/LIVE-GATE.md && for s in "Gate A" "Gate B" "203.0.113.1" "proof by absence" "monitor-abort-gate.sh" "RUN-20260817-humankind-watchdog.log"; do grep -qF "$s" .planning/quick/260817-dib-make-the-install-watchdog-a-progress-bas/LIVE-GATE.md || { echo "MISSING: $s"; exit 1; }; done; echo OK</automated>
  </verify>
  <done>LIVE-GATE.md exists with both gates, the blackhole-IP instruction, the inverted-harness note, the calibration step against the known-bad log, and explicit proof-by-absence greps.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Steam CDN → depot chunk stream → local disk | Untrusted remote content drives the progress signal that now controls a safety bound |
| `backendEvents` in-process bus → the watchdog | Any emitter on `progressUpdate-<appName>` can re-arm an install's deadline |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-dib-01 | Denial of Service | `installStallWatchdog` re-armed by a signal that fires unconditionally | mitigate | Re-arm on ADVANCE (`percent` up or `bytes` changed), never on event arrival. Task 1's anti-vacuity spec emits depot.ts's literal 1s heartbeat payload and requires the trip to still occur |
| T-dib-02 | Denial of Service | A runner with no progress emitter (sideload) losing its bound entirely | mitigate | The deadline is armed at call time and only re-armed by observed progress, so a never-reporting runner degrades exactly to today's fixed ceiling. Covered by an explicit spec in Task 1 and by the two pre-existing specs kept green in Task 2 |
| T-dib-03 | Tampering | A hostile/buggy emitter using the same `appName` could hold an install open indefinitely | accept | `backendEvents` is in-process and every emitter is first-party GameLib code; the pre-existing `progressUpdate-<appName>` bus already carries the same trust assumption for the renderer progress UI |
| T-dib-04 | Repudiation | Listener leak — one `progressUpdate-<appName>` listener retained per install | mitigate | `backendEvents.off` in a `finally` on both settle paths, asserted by a `listenerCount` spec in Task 1 |
| T-dib-05 | Elevation of Privilege | Weakening the `260816-vgc` abort would let an aborted depot run keep writing to disk unbounded | mitigate | The `finally` block (`utils.ts:193-277`) is explicitly not modified, and Task 2 adds a spec asserting `callAbortController` + steam-gated `stop(false)` still fire on a stall trip |
| T-dib-SC | Tampering | npm/pip/cargo installs | accept | No package installs in this plan — no dependency changes |
</threat_model>

<verification>
- `pnpm jest src/backend/downloadmanager src/backend/storeManagers/steam/__tests__/depot.test.ts` passes.
- `pnpm codecheck` and `pnpm lint` pass (watch for the now-unused `sendFrontendMessage` import in `depot.ts`).
- `pnpm lint-translations` passes.
- `git status` shows ONLY the seven files in `files_modified`. The staged deletion of
  `.planning/todos/pending/2026-08-16-orphaned-depot-download-outlives-failure.md` and the
  untracked `.planning/spikes/003-*/*.acf` snapshots are left exactly as found — do not stage,
  restore, or stash them.
- `src/backend/downloadmanager/utils.ts` no longer contains a total-duration bound: the only
  `INSTALL_NO_PROGRESS_TIMEOUT_MS` use is the `withStallTimeout` call.
</verification>

<success_criteria>
- A native Steam install making steady forward progress survives arbitrarily long — proven RED/GREEN in jest at 20 minutes of fake time, and scheduled for wall-clock proof by LIVE-GATE.md Gate A.
- A genuinely wedged install still fails at 8 minutes of zero progress and still aborts its in-flight download via the unmodified `260816-vgc` path.
- Steam's 1s progress heartbeat cannot keep a dead install alive.
- The terminal copy for a stall names the observed no-progress window; `connection may be stale` survives only on the inner-CM-timeout branch where it is accurate.
- `23-10` Tasks 1 and 2 are unblocked: a multi-GB install can now complete.
</success_criteria>

<output>
Create `.planning/quick/260817-dib-make-the-install-watchdog-a-progress-bas/260817-dib-SUMMARY.md` when done.
</output>
</content>
</invoke>
