---
phase: quick
plan: 260718-jmt
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/__tests__/depot.test.ts
autonomous: true
requirements: [QUICK-STEAM-PROGRESS-CADENCE]
must_haves:
  truths:
    - "During an active native Steam depot download, progressUpdate fires at least once per ~1s of wall-clock time even when no depot chunk completes"
    - "The heartbeat interval is cleared on normal completion AND on throw/abort — no dangling setInterval leaks after the download settles"
    - "The chunk-driven rolling-rate math is unchanged; a heartbeat with zero bytes in the window honestly reports ~0 MB/s (Steam-like)"
  artifacts:
    - path: "src/backend/storeManagers/steam/depot.ts"
      provides: "PROGRESS_HEARTBEAT_MS constant + setInterval/clearInterval heartbeat wrapping the worker Promise.all"
      contains: "PROGRESS_HEARTBEAT_MS"
    - path: "src/backend/storeManagers/steam/__tests__/depot.test.ts"
      provides: "Fake-timer test proving heartbeat emits with no chunk activity and clears the interval on settle"
      contains: "PROGRESS_HEARTBEAT_MS"
  key_links:
    - from: "downloadDepotFiles heartbeat interval"
      to: "emitProgress(true)"
      via: "setInterval callback"
      pattern: "setInterval\\("
---

<objective>
Fix the Steam native-install download progress graph so the DownloadManager
ProgressHeader chart advances on a ~1s wall-clock cadence (like Steam) instead of
only when a depot chunk completes.

Root cause (confirmed): in `src/backend/storeManagers/steam/depot.ts`,
`downloadDepotFiles` only calls its local `emitProgress(false)` from the per-chunk
`onBytes` callback (~L1128-1132), throttled by `PROGRESS_THROTTLE_MS = 500`. When
chunk completions bunch up (warm-up, large files, decode-pool under load) no
`progressUpdate` IPC fires for many seconds. The frontend `ProgressHeader` advances
exactly one chart sample per `progressUpdate` and has no independent timer, so the
graph freezes between emits (observed ~30s gaps).

Fix: add a ~1s wall-clock heartbeat inside `downloadDepotFiles` that forces a
`progressUpdate` at least once per second during the active download, independent of
chunk completion, and guarantees the interval is cleared on completion/throw/abort.

Purpose: make the download graph refresh smoothly (~1s samples) matching Steam.
Output: backend-only change in depot.ts + a fake-timer unit test. No frontend change.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

**CODE EXPLORATION RULE (MANDATORY — graphify):** `graphify-out/graph.json` exists.
Before reading raw source, orient with `graphify explain "downloadDepotFiles"` or
`graphify query "steam depot download progress emit"`. Only read raw files after
graphify orients you, or to reference/modify specific lines.

<interfaces>
Key existing code in src/backend/storeManagers/steam/depot.ts (do NOT re-derive):

- `const PROGRESS_THROTTLE_MS = 500` (L598), `PROGRESS_THROTTLE_PERCENT = 1` (L599)
- `const MIN_RATE_WINDOW_SEC = 0.05` (L604) — guards sub-window rate divisions.
- `export function rollingRateMiBs(bytesDelta, msDelta, previousMiBs): number` (L613)
  — returns `previousMiBs` when `secDelta < MIN_RATE_WINDOW_SEC`, else the rate (>=0).
- Inside `downloadDepotFiles` (worker section ~L1049-1160):
    - closure state: `doneBytes`, `netBytes`, `lastEmitBytes`, `lastEmitNetBytes`,
      `lastEmitTime`, `lastDownSpeed`, `lastDiskSpeed`, `tStart` (L1049-1056)
    - `const emitProgress = (force: boolean) => {...}` (L1058-1106): when `force`
      is true it bypasses the throttle, recomputes rolling rates via `rollingRateMiBs`,
      updates `lastEmit*`, and calls `sendFrontendMessage('progressUpdate', {...})`.
    - worker fan-out: `await Promise.all(Array.from({length: workerCount}, async () => {...}))`
      (L1111-1140); the `onBytes` callback does `doneBytes += disk; netBytes += net;
      emitProgress(false)` (L1128-1132).
    - forced flush already present: `emitProgress(true)` right after the Promise.all (L1142).
    - outer `finally { await pool.shutdown() }` (L1154-1159) wraps the whole body.

Test harness in __tests__/depot.test.ts:
- `jest.mock('../../../ipc', () => ({ sendFrontendMessage: jest.fn() }))` (L122-123)
  — comment: "captures progressUpdate emits". Import: `sendFrontendMessage` from '../../../ipc' (L56).
- `downloadDepotFiles` and `rollingRateMiBs` are imported and exercised (L41, L45).
- Existing describe blocks mock SteamUser, selectAllDepots, getRawManifest,
  contentManifest.parse, decryptFilename, and `../depot/decompress` to drive
  `downloadDepotFiles` without real network. Reuse that setup for the heartbeat test.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add a 1s wall-clock progress heartbeat to downloadDepotFiles</name>
  <files>src/backend/storeManagers/steam/depot.ts, src/backend/storeManagers/steam/__tests__/depot.test.ts</files>
  <read_first>
    - MANDATORY graphify first: `graphify explain "downloadDepotFiles"` then, only if
      needed, read src/backend/storeManagers/steam/depot.ts around L598-622 and L1049-1160.
    - src/backend/storeManagers/steam/__tests__/depot.test.ts — reuse the existing
      `sendFrontendMessage` mock (L122) and the SteamUser/manifest/decompress mock setup
      from an existing `downloadDepotFiles` describe block.
    - For frontend context only (do NOT edit): src/frontend/screens/DownloadManager/components/ProgressHeader/index.tsx
      — confirms ProgressHeader advances one chart sample per `progressUpdate` with no
      independent timer, which is why the backend heartbeat is the fix.
  </read_first>
  <behavior>
    - With jest fake timers, when `downloadDepotFiles` is mid-download and NO chunk
      `onBytes` fires, advancing the clock ~3s produces multiple `sendFrontendMessage('progressUpdate', ...)` calls (heartbeat fired ~once/sec).
    - After the download settles (Promise.all resolves) or throws/aborts, no further
      `progressUpdate` calls occur once timers advance — the interval was cleared
      (assert via `jest.getTimerCount()` === 0 or no new emits after settle).
    - A heartbeat emit with zero bytes in its window reports ~0 MB/s (does not spike),
      and does not corrupt the chunk-driven rolling-rate window (chunk-path emits after
      a heartbeat still compute sane rates via the existing MIN_RATE_WINDOW_SEC guard).
  </behavior>
  <action>
    In src/backend/storeManagers/steam/depot.ts:
    1. Add a named constant near PROGRESS_THROTTLE_MS (L598):
       `const PROGRESS_HEARTBEAT_MS = 1000` with a short comment explaining it forces a
       ~1s wall-clock progressUpdate cadence so the ProgressHeader graph advances even
       when chunk completions bunch up.
    2. In `downloadDepotFiles`, just before the worker `await Promise.all(...)` (~L1111),
       start `const heartbeat = setInterval(() => emitProgress(true), PROGRESS_HEARTBEAT_MS)`.
    3. Wrap ONLY the `await Promise.all(...)` fan-out in a `try { ... } finally { clearInterval(heartbeat) }`
       so the interval is cleared on normal completion AND on throw/abort. Keep the
       existing `emitProgress(true)` forced flush after the Promise.all (L1142) — it now
       lives after the try/finally (or at the end of the try, before the finally clears).
       Do NOT remove or alter the outer `finally { await pool.shutdown() }` at L1154.
    4. Do not change `emitProgress`, `rollingRateMiBs`, MIN_RATE_WINDOW_SEC, the throttle
       constants, the per-chunk `onBytes` logic, or the progressUpdate payload shape.
       The heartbeat simply calls the existing `emitProgress(true)`.

    In __tests__/depot.test.ts, add a describe/it that:
    - uses `jest.useFakeTimers()` and reuses the existing SteamUser/manifest/decompress
      mock setup so `downloadDepotFiles` runs without real network;
    - drives a download whose file download stalls (no `onBytes`) long enough for the
      heartbeat to fire; advance timers ~3000ms and assert
      `jest.mocked(sendFrontendMessage)` was called multiple times with 'progressUpdate';
    - after the download settles, advance timers again and assert no additional
      progressUpdate emits AND `jest.getTimerCount() === 0` (interval cleared, no leak);
    - restores real timers in afterEach (`jest.useRealTimers()`).
    Reference PROGRESS_HEARTBEAT_MS by import if exported, or by the literal 1000 window.
    If wiring a full stalled-download proves infeasible with the existing mocks, assert
    the smallest testable seam (e.g. spy that `setInterval` is registered with
    PROGRESS_HEARTBEAT_MS and cleared on settle) and add a one-line manual-verify note.

    SCOPE FENCE — do NOT touch: the Phase-23 single-flight guard in games.ts, the
    StateFlags 4-vs-1026 decision, buildid threading, file-mode logic, or the MB/s units
    in ProgressHeader (units stay MB/s — user explicitly declined a Mbps change).
  </action>
  <verify>
    <automated>pnpm jest src/backend/storeManagers/steam</automated>
  </verify>
  <done>
    PROGRESS_HEARTBEAT_MS constant exists; downloadDepotFiles starts a 1s setInterval
    calling emitProgress(true) before the worker Promise.all and clears it in a finally
    wrapping that Promise.all; the new fake-timer test proves heartbeat emits with no
    chunk activity and the interval is cleared on settle/abort; the full steam suite is
    green (was 562/562).
  </done>
</task>

</tasks>

<verification>
- `pnpm jest src/backend/storeManagers/steam` passes (existing 562 tests + new heartbeat test).
- Manual (optional, hardware): start a native Steam depot install and watch the
  DownloadManager ProgressHeader graph advance smoothly (~1s samples) even during
  warm-up / large-file stalls, instead of freezing for many seconds.
</verification>

<success_criteria>
- Backend emits a `progressUpdate` at least once per ~1s during an active depot download
  regardless of chunk-completion timing.
- No dangling setInterval after the download completes, throws, or aborts.
- Rolling-rate/ETA math and progressUpdate payload shape are unchanged; MB/s units intact.
- Scope fence respected: no changes to games.ts single-flight guard, StateFlags logic,
  buildid, file-mode logic, or frontend units.
</success_criteria>

<output>
Create `.planning/quick/260718-jmt-fix-steam-download-progress-graph-cadenc/260718-jmt-SUMMARY.md` when done.
</output>
