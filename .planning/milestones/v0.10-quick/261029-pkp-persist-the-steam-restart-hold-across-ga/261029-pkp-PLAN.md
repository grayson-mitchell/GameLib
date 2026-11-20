---
phase: quick-261029-pkp
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/steamClientProcess.ts
  - src/backend/storeManagers/steam/__tests__/steamClientProcess.test.ts
  - src/backend/storeManagers/steam/steamRestartHold.ts
  - src/backend/storeManagers/steam/__tests__/steamRestartHold.test.ts
  - src/backend/storeManagers/steam/electronStores.ts
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/__tests__/library.test.ts
  - .planning/todos/pending/2026-10-29-steam-restart-hold-not-persisted-across-gamelib-restart.md
autonomous: true
requirements: [D-UAT-13]

must_haves:
  truths:
    - "A native install finalized under a running Steam client still shows 'Restart Steam to finish' (not Play) after GameLib/the sidecar restarts, as long as that same Steam process is still running"
    - "After a GameLib restart, the re-armed hold releases (game shows Play) once the recorded Steam process exits, exactly like the single-session hold"
    - "A recorded PID now owned by a different process (different start time), a Steam that is no longer running, or a manifest that is no longer StateFlags 4 drops the record at boot and the game reconciles to installed normally"
    - "The persisted record is deleted whenever the hold ends: Steam exit, Steam rewriting the manifest, the 6 h cap, the manifest vanishing, or the poll being stopped (cancel/uninstall)"
    - "An inconclusive probe at boot never arms a hold (fail-open, as before D-UAT-13) and never deletes the record"
    - "No GameLib boot with zero records spawns any extra child process"
  artifacts:
    - path: "src/backend/storeManagers/steam/steamRestartHold.ts"
      provides: "Persisted hold record: type, safe-parse read, write, clear, list, pure re-arm decision"
      exports: ["SteamRestartHoldRecord", "recordSteamRestartHold", "readSteamRestartHold", "clearSteamRestartHold", "listSteamRestartHolds", "decideSteamRestartHoldRearm"]
    - path: "src/backend/storeManagers/steam/steamClientProcess.ts"
      provides: "Per-OS process start-time identity probe"
      exports: ["readSteamProcessStartTokens", "parsePidTokenLines"]
    - path: "src/backend/storeManagers/steam/electronStores.ts"
      provides: "steamRestartHoldStore CacheStore ('steam_restart_hold')"
      contains: "steam_restart_hold"
  key_links:
    - from: "library.ts shouldHoldForSteamRestart (unprobed -> holding)"
      to: "recordSteamRestartHold"
      via: "awaited start-token probe, then write guarded by activePolls identity + steamHold === 'holding'"
      pattern: "recordSteamRestartHold\\("
    - from: "library.ts every hold release + stopInstallPolling"
      to: "clearSteamRestartHold"
      via: "single releaseSteamHold() helper"
      pattern: "clearSteamRestartHold\\("
    - from: "SteamLibraryManager.init()"
      to: "rearmPersistedSteamRestartHolds -> startInstallPolling({ restoredSteamHold })"
      via: "awaited in init after the cache load, before the resume-surface scan"
      pattern: "rearmPersistedSteamRestartHolds"
    - from: "isHoldingForSteamRestart"
      to: "pendingSteamHoldRearm set"
      via: "fail-closed during the boot verification window so a concurrent focus reconcile cannot flip the game to Play"
      pattern: "pendingSteamHoldRearm"
---

<objective>
Make the D-UAT-13 "Restart Steam to finish" (`steam-waiting-for-restart`) hold survive a GameLib/sidecar restart. Today `steamHold` and `steamPidsAtHandoff` exist only on the in-memory `activePolls` entry, so after a restart `buildInstalledMap()` reads the StateFlags 4 manifest, the game shows Play, and Play opens Steam's install dialog because the running client never re-read the manifest. Fix: persist a hold record (app id, plus each Steam PID and that process's start-time identity) when the hold arms; at boot, re-arm the hold for an app whose recorded Steam process is still the live one; otherwise drop the record. Delete the record whenever the hold ends.

**Direction chosen: the persisted record, not manifest mtime against the live Steam start time.** Why:
1. mtime cannot tell who wrote the manifest. A running Steam client rewrites `appmanifest_*.acf` for its own installs, updates and bookkeeping, so "manifest newer than Steam start" holds for every game Steam itself touched this session. Those games would wrongly show "Restart Steam to finish". The hold must apply only to GameLib's own native handoff (`isNativeHandoff` + `source === 'native'`), and only a record written at that moment carries that fact.
2. mtime still needs the live Steam start time. That is the same per-OS probe the record approach uses, so dropping the record saves no probe work. It only drops the provenance.
3. The record carries `macNativeRoute`/`skippedDepots`, so the re-armed poll behaves exactly like the original poll when it releases. Repo precedent for this pattern is `steamPendingAdoptionStore` + `macSteamAdoption.ts` (quick 261029-ji2).

Identity = (PID, opaque start-time token). The token is compared for string equality only and never parsed, so it does not depend on locale. A reused PID has a different start time and cannot pin the hold, which is what the todo asks for. A reboot also changes it.

Purpose: closes the open edge recorded in `.planning/debug/resolved/steam-waiting-for-restart-windows.md` and the pending todo.
Output: a start-time probe in `steamClientProcess.ts`, a new leaf `steamRestartHold.ts` + store, wiring in `library.ts`, and unit tests for each part.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/todos/pending/2026-10-29-steam-restart-hold-not-persisted-across-gamelib-restart.md
@.planning/debug/resolved/steam-waiting-for-restart-windows.md
@src/backend/storeManagers/steam/steamClientProcess.ts
@src/backend/storeManagers/steam/macSteamAdoption.ts (lines 1-120 only: the lazy-store + injectable-store + safe-parse precedent to copy)
@src/backend/storeManagers/steam/__tests__/steamClientProcess.test.ts (lines 1-60: execFile mock pattern)

Load `Skill("gamelib-conventions")` before starting. Two rules apply here:
- **Sidecar exit contract.** Probes run only at boot when at least one record exists (zero records means zero spawns). Each probe is a single child bounded by an execFile `timeout`. The restored poll reuses `startInstallPolling`'s existing `timer.unref?.()` (library.ts ~L3481). Add no new timers, watchers or sockets.
- **`<verify>` prettier rule.** Every `.ts` path below reports `"ignored": false`. The `.planning/` todo is prettier-ignored, so it gets no check.
- **Fake-HOME rule.** It does not apply to the new spawns. They read no user profile and pass no `env`, the same as the existing `tasklist`/`pgrep` probes. Pass no `env` option at all.

<interfaces>
Existing code the executor builds against (extracted, do not re-explore):

steamClientProcess.ts:
- `listSteamClientPids(platform = process.platform): Promise<number[] | undefined>`. `[]` means not running; `undefined` means unknown (fail open).
- private `run(file, args): Promise<{ code, stdout }>` uses execFile with `{ timeout: PROBE_TIMEOUT_MS (5000), windowsHide: true }` and never rejects. ps/pgrep: code 1 = nothing matched.
- Exported test-only helpers carry a `// ts-prune-ignore-next` line above them.

library.ts (line numbers approximate):
- L107 `type PollOptions = { intervalMs?, source?, isNativeHandoff?, macNativeRoute?, skippedDepots?, delegatedToSteamClient? }`
- L2025-2127 `activePolls: Map<string, { timer, ticks, seenDownloading, source, notifiedWaiting, ..., isNativeHandoff, macNativeRoute, skippedDepots, ..., absentTicksSinceSeen, steamHold: 'unprobed'|'holding'|'released', steamPidsAtHandoff: number[], lastSteamProbeMs: number }>`
- L2132 `STEAM_HOLD_PROBE_MIN_INTERVAL_MS = 10_000`; L2134-2135 `GRACE_TICKS = 20`, `MAX_TICKS = 7200` (about 6 h at the 3000 ms default interval)
- L2680 `function isHoldingForSteamRestart(appId): boolean` returns `activePolls.get(appId)?.steamHold === 'holding'`. Its only consumer is `withoutSteamRestartHolds()` (L2692), which `refresh()` (L1170) and `refreshInstallState()` (L1506) call.
- L2725 `async function shouldHoldForSteamRestart(appId, poll, source)`. 'unprobed' -> probe -> sets 'holding' + `steamPidsAtHandoff` + `seenDownloading = true`, or 'released'. 'holding' -> re-probe every 10 s and set 'released' when no recorded PID is alive.
- Release sites that set `steamHold = 'released'` from 'holding': L2767 (PID exit, in shouldHoldForSteamRestart), L2806 ('downloading' branch of pollInstallOnce, where Steam rewrites the manifest), L3360 (MAX_TICKS cap in the startInstallPolling interval). The manifest-vanished site L3160-3173 calls `stopInstallPolling(appId)` while still 'holding'.
- L3208 `export function startInstallPolling(appId, intervalMsOrOptions: number | PollOptions = 3000)`. The entry literal is at ~L3326-3343 and `timer.unref?.()` at ~L3481.
- L3518 `export function stopInstallPolling(appId)`. Callers: library.ts internal, games.ts L2328/L2381 (bridge install aborts).
- L742 `SteamLibraryManager.init()`: loads `steamLibraryStore` cache into `library`, then the resume-surface scan (`scanDownloadingAppIds` + breadcrumbs), then `runOnceWhenOnline(refresh)`, then `startRunningPoll()`. `isNativeInstallInFlight(appId)` is already imported/used there.
- `readAcfState(appId, source)` returns `{ state: 'installed'|'downloading'|'absent', stateFlags?, ... }`.

electronStores.ts precedent (copy its shape):
```typescript
// ts-prune-ignore-next
export const steamPendingAdoptionStore = new CacheStore<unknown>('steam_pending_adoption', null)
```
CacheStore API: `get(key)`, `set(key, value)`, `delete(key)`, `entries(): Array<[key, value]>`.

library.test.ts mocks (must be extended, not replaced):
- L196 `jest.mock('../electronStores', () => ({ configStore, steamLibraryStore, steamMetadataStore, steamSyncStore }))`
- L291 `jest.mock('../steamClientProcess', () => ({ listSteamClientPids: jest.fn() }))`
- L5558-5640: the D-UAT-13 describe (fixtures `ACF_4`, `statusPayloads()`, `wasStopped()`, fake timers, `library.set('730', ...)`). Add the new tests next to it, in the same style.
- `manager.init()` is exercised around L1973/L2725.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Start-time identity probe + persisted hold record module</name>
  <files>src/backend/storeManagers/steam/steamClientProcess.ts, src/backend/storeManagers/steam/__tests__/steamClientProcess.test.ts, src/backend/storeManagers/steam/steamRestartHold.ts, src/backend/storeManagers/steam/__tests__/steamRestartHold.test.ts, src/backend/storeManagers/steam/electronStores.ts</files>
  <behavior>
    steamClientProcess.test.ts (execFile mocked, using the existing mockExec helper):
    - parsePidTokenLines: "  4410 Thu Oct 29 12:12:31 2026\n" gives Map{4410 => "Thu Oct 29 12:12:31 2026"}. "13712 638659123450000000\r\n" gives Map{13712 => "638659123450000000"}. Blank lines, headers and non-numeric PIDs are ignored. Internal whitespace in the token is collapsed to single spaces.
    - readSteamProcessStartTokens([], p) resolves an empty Map and spawns nothing.
    - It drops non-safe-integer or non-positive PIDs before building args. If none remain, it returns an empty Map with no spawn.
    - darwin: spawns '/bin/ps' with ['-o', 'pid=,lstart=', '-p', '4410,4411']. linux: spawns 'ps' with the same args. Code 1 resolves an empty Map (no such process). Any other non-zero code resolves undefined.
    - win32: spawns `${SystemRoot}\System32\WindowsPowerShell\v1.0\powershell.exe` with -NoProfile, -NonInteractive and -Command. The command string contains 'Get-Process -Id 13712,4410', '-ErrorAction SilentlyContinue', 'StartTime.ToUniversalTime().Ticks' and ends with 'exit 0'. Code 0 is parsed. Non-zero resolves undefined.
    - The returned Map contains only PIDs that were asked for (a stray row in stdout is ignored).
    - Unsupported platform resolves undefined.
    steamRestartHold.test.ts (injectable in-memory store, as in macSteamAdoption.test.ts):
    - record/read round-trip of { pids: [{ pid, startToken }], recordedAt, macNativeRoute, skippedDepots }.
    - readSteamRestartHold returns undefined (never throws) for a non-object, missing/empty pids, a non-integer pid, a non-string startToken, a non-finite recordedAt, or non-string skippedDepots entries.
    - listSteamRestartHolds returns only valid [appId, record] pairs and skips malformed entries. clearSteamRestartHold deletes.
    - decideSteamRestartHoldRearm({ record, livePids, startTokens, nowMs, maxAgeMs }):
      livePids undefined gives { kind: 'unknown' }.
      nowMs - recordedAt >= maxAgeMs gives { kind: 'drop', reason: 'expired' }.
      No recorded pid in livePids gives { kind: 'drop', reason: 'steam-exited' }.
      startTokens undefined while candidates exist gives { kind: 'unknown' }.
      A live recorded pid whose current token differs (PID reuse) gives { kind: 'drop', reason: 'pid-reused' }.
      Matching tokens give { kind: 'arm', pids: [only the matching pids] }.
  </behavior>
  <action>
In steamClientProcess.ts, add `readSteamProcessStartTokens(pids: number[], platform = process.platform): Promise<Map<number, string> | undefined>` plus the exported, ts-prune-ignored helper `parsePidTokenLines(stdout): Map<number, string>` (line regex `^(\d+)\s+(.+)$` after trim; collapse internal whitespace in the token). The function never rejects.

Filter the PIDs with Number.isSafeInteger && > 0. This filter is the PowerShell-injection guard: only integers are ever interpolated into the command string. Empty after filtering returns an empty Map without spawning.

Per OS:
- darwin uses '/bin/ps' and linux uses 'ps' (the same absolute-vs-bare split as the existing pgrep probe), with args ['-o', 'pid=,lstart=', '-p', pids.join(',')]. Code 1 gives an empty Map. Any other non-zero code gives undefined.
- win32 uses the WindowsPowerShell v1.0 powershell.exe under `process.env.SystemRoot ?? 'C:\\Windows'`, args ['-NoProfile', '-NonInteractive', '-Command', script]. The script pipes `Get-Process -Id <csv> -ErrorAction SilentlyContinue` into ForEach-Object, emitting one "<Id> <StartTime.ToUniversalTime().Ticks>" line per process, and then `; exit 0` so missing PIDs do not turn into exit 1. Not wmic (removed from current Windows 11). Not the registry ActiveProcess value (it survives crashes; see the module docstring).

Keep only the requested PIDs from the parsed map. Give `run()` an optional timeout parameter. Use a new `START_TOKEN_TIMEOUT_MS = 15_000` for this probe, because a cold PowerShell start is much slower than tasklist. It is still a bounded single child, so the sidecar exit contract (half 2) holds. Extend the module docstring with one paragraph: why start-time identity exists (a persisted record must not be pinned by PID reuse across a GameLib restart; quick 261029-pkp), that the token is opaque and compared for equality only, and that it is never called at boot unless a hold record exists.

In electronStores.ts, add `export const steamRestartHoldStore = new CacheStore<unknown>('steam_restart_hold', null)` with a `// ts-prune-ignore-next` comment and a short block comment, mirroring steamPendingAdoptionStore (it is consumed through a lazy require).

Create steamRestartHold.ts as a leaf module that never throws and does nothing at import. It contains:
- the `SteamRestartHoldRecord` interface: `pids: Array<{ pid: number; startToken: string }>`, `recordedAt: number`, `macNativeRoute: boolean`, `skippedDepots: string[]`
- a `SteamRestartHoldStore` structural interface (`get`/`set`/`delete`/`entries`)
- a lazy `defaultStore()` that requires './electronStores', copied from macSteamAdoption.ts's defaultStore, eslint-disable comments included
- `recordSteamRestartHold(appId, record, store?)`, `readSteamRestartHold(appId, store?)`, `clearSteamRestartHold(appId, store?)`, `listSteamRestartHolds(store?)`, where read/list safe-parse untrusted disk content and return undefined or skip malformed entries
- the pure `decideSteamRestartHoldRearm`, with the result union { kind: 'arm'; pids: number[] } | { kind: 'drop'; reason: 'expired' | 'steam-exited' | 'pid-reused' } | { kind: 'unknown' }, evaluated in the order given in <behavior>

Write the tests first (RED), then implement (GREEN). Copy steamClientProcess.test.ts's mockExec helper for the new cases. Pass an in-memory Map-backed store to the steamRestartHold functions; do not mock electronStores there.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --selectProjects Backend --runTestsByPath src/backend/storeManagers/steam/__tests__/steamClientProcess.test.ts src/backend/storeManagers/steam/__tests__/steamRestartHold.test.ts && pnpm codecheck && npx prettier --check src/backend/storeManagers/steam/steamClientProcess.ts src/backend/storeManagers/steam/__tests__/steamClientProcess.test.ts src/backend/storeManagers/steam/steamRestartHold.ts src/backend/storeManagers/steam/__tests__/steamRestartHold.test.ts src/backend/storeManagers/steam/electronStores.ts</automated>
  </verify>
  <done>Both suites pass, including every <behavior> case. Codecheck exits 0 and prettier --check is clean on the five paths. No child process is spawned for an empty or invalid PID list.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Persist on arm, clear on every release, re-arm at boot (library.ts)</name>
  <files>src/backend/storeManagers/steam/library.ts, src/backend/storeManagers/steam/__tests__/library.test.ts, .planning/todos/pending/2026-10-29-steam-restart-hold-not-persisted-across-gamelib-restart.md</files>
  <behavior>
    Extend library.test.ts. Add `readSteamProcessStartTokens: jest.fn()` to the '../steamClientProcess' mock, and add `steamRestartHoldStore` to the '../electronStores' mock as get/set/delete/entries jest.fns backed by a Map that is reset in beforeEach. New describe "D-UAT-13 hold persists across a GameLib restart (quick 261029-pkp)" next to the existing D-UAT-13 describe, reusing its fixtures:
    - Arming the hold (pids [111], tokens Map{111 => 'T1'}) writes a record for '730' with pids [{111, 'T1'}], macNativeRoute and skippedDepots taken from the poll, and a numeric recordedAt.
    - Arming when readSteamProcessStartTokens returns undefined, or has no token for the PID, still holds in memory but writes no record.
    - Each release clears the record: PID exit on re-probe (advance fake time by 10 s), a 'downloading' manifest rewrite, the MAX_TICKS cap, the manifest vanishing (MANIFEST_GONE_TICKS absent ticks), and stopInstallPolling('730') while holding. Unprobed -> released with no Steam running also deletes a stale record.
    - init() re-arm: seed a record for '730' (token 'T1', recordedAt = now). Probes return [111] and Map{111 => 'T1'}, and ACF_4 is in place. After `await manager.init()` the poll exists and is holding: `refreshInstallState()` leaves '730' is_installed false, the first tick sends `{status: 'installing', context: 'steam-waiting-for-restart'}`, and the restart toast is NOT re-sent (notifiedWaiting preset). The record stays. When the probe later returns [] after 10 s, the game is reported installed and the record is cleared.
    - init() drops the record and starts no poll when: the token differs ('T2', PID reuse), Steam is not running ([]), the record is older than MAX_TICKS * 3000 ms, the native ACF is 'downloading'/'absent', or a native install is already in flight for that app.
    - init() with listSteamClientPids -> undefined starts no poll and KEEPS the record.
    - init() with zero records calls neither listSteamClientPids nor readSteamProcessStartTokens.
    - Fail-closed window: while re-arm verification is pending (hold the listSteamClientPids promise open), a concurrent refreshInstallState() does not report '730' installed. When verification then resolves to drop, refreshInstallState runs once more and reports it installed.
    - Every existing D-UAT-13 and 261029-ji2 test still passes unchanged.
  </behavior>
  <action>
Import the steamRestartHold functions and `readSteamProcessStartTokens` into library.ts. Changes, all tagged "quick 261029-pkp (D-UAT-13 follow-up)" in comments:

(1) Add a helper `releaseSteamHold(appId, poll)` that sets `poll.steamHold = 'released'` and calls `clearSteamRestartHold(appId)`. Use it at all three release sites (PID exit ~L2767, Steam rewriting the manifest ~L2806, MAX_TICKS cap ~L3360). In shouldHoldForSteamRestart, the unprobed path also calls clearSteamRestartHold when it releases because no Steam is running, so a stale record from an earlier hold of the same app is removed. In stopInstallPolling, if the stopped entry's steamHold is 'holding', call clearSteamRestartHold before deleting it. That covers the manifest-vanished stop and the games.ts cancel paths. The Rust shell's process-group kill never calls stopInstallPolling, so a shutdown leaves the record in place, which is what we want.

(2) Persist on arm. In shouldHoldForSteamRestart's unprobed -> holding branch, after setting 'holding', await `readSteamProcessStartTokens(pids)`. Then, only if `activePolls.get(appId) === poll && poll.steamHold === 'holding'`, build the pids array from the PIDs that have a token. If that array is non-empty, call recordSteamRestartHold(appId, { pids, recordedAt: Date.now(), macNativeRoute: poll.macNativeRoute, skippedDepots: poll.skippedDepots }). Otherwise log a warning that the hold will not survive a restart, and keep holding in memory. The return value is still true. Wrap the persist step in try/catch so it can never change the hold decision.

(3) Restore support in startInstallPolling. Add an optional PollOptions field `restoredSteamHold?: { pids: number[]; startTicks: number }`, documented as boot re-arm only. When it is present on a fresh entry, set: steamHold 'holding', steamPidsAtHandoff = pids, lastSteamProbeMs = Date.now() (just verified), seenDownloading true (so neither the GRACE_TICKS stop nor the manifest-gone counting misfires), notifiedWaiting true (do not re-toast on every boot), and ticks = startTicks. Starting from the elapsed ticks keeps the about-6 h MAX_TICKS cap measured from the original finalize, not reset by every restart. Ignore the field on the existingEntry upgrade branch.

(4) Boot re-arm. Add a module-level `pendingSteamHoldRearm = new Set<string>()`. `isHoldingForSteamRestart` returns true when the app is in the set, so the window is fail-closed. When withoutSteamRestartHolds removes an app only because of the pending set, set the module flag `reconcileRanDuringRearm = true`.

Add `async function rearmPersistedSteamRestartHolds(): Promise<{ dropped: number }>`. It never throws (outer and per-app try/catch, logWarning). Steps:
- List the records. If there are none, return immediately with no probe.
- Add every appId to pendingSteamHoldRearm synchronously, before any await.
- Probe listSteamClientPids() once.
- Collect the union of recorded PIDs that are live, and call readSteamProcessStartTokens once for that union. Skip the call if the union is empty.
- For each record, skip and clear it if isNativeInstallInFlight(appId) or activePolls.has(appId). Otherwise call decideSteamRestartHoldRearm with nowMs = Date.now() and maxAgeMs = MAX_TICKS * 3000.
  - 'unknown': keep the record, no poll. Log it as fail-open, the same as the original undefined-probe rule.
  - 'drop': clearSteamRestartHold and log the reason.
  - 'arm': additionally require readAcfState(appId, 'native') to be 'installed', otherwise drop. If it is installed, call startInstallPolling(appId, { isNativeHandoff: true, source: 'native', macNativeRoute: record.macNativeRoute, skippedDepots: record.skippedDepots, restoredSteamHold: { pids, startTicks: Math.floor((now - record.recordedAt) / 3000) } }) and logInfo the re-arm with the PIDs.
- In a finally block, remove each appId from the pending set.

In SteamLibraryManager.init(), right after the cached-library load and before the resume-surface scan: `const { dropped } = await rearmPersistedSteamRestartHolds()`. If dropped > 0 and reconcileRanDuringRearm is set, reset the flag and `void this.refreshInstallState()`.

Do NOT change the hold's scope. It stays `isNativeHandoff && source === 'native'` on every OS, so macOS (including the ji2 macNativeRoute poll) and Linux behave exactly as the in-session hold already does. Bottle and bridge roots never hold.

Write the tests first. Once they pass, mutation-check three pieces by hand, as 128148bf3 did: remove the stopInstallPolling clear, remove the token comparison (always arm), and remove the pending-set check. Each removal must turn at least one new test red; revert it afterwards.

Finally, move the todo to `.planning/todos/completed/` with git mv. Append a "Resolution (quick 261029-pkp)" section naming the persisted-record approach, why mtime was rejected (provenance), and the honest limit: unit-tested on all three platforms' probe shapes; the live cross-restart case on Windows has not been exercised. Then run `graphify update .`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --selectProjects Backend --runTestsByPath src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/storeManagers/steam/__tests__/steamRestartHold.test.ts src/backend/storeManagers/steam/__tests__/steamClientProcess.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/storeManagers/steam/__tests__/macSteamAdoption.test.ts && pnpm codecheck && pnpm lint && npx prettier --check src/backend/storeManagers/steam/library.ts src/backend/storeManagers/steam/__tests__/library.test.ts && grep -v '^\s*//' src/backend/storeManagers/steam/library.ts | grep -c 'clearSteamRestartHold(' && test -f .planning/todos/completed/2026-10-29-steam-restart-hold-not-persisted-across-gamelib-restart.md</automated>
    The todo path is under prettier-ignored `.planning/`, so it gets no formatter check.
  </verify>
  <done>All listed suites pass, including every new <behavior> case and all pre-existing D-UAT-13 and ji2 tests. Codecheck and lint are green, prettier is clean on both paths, and the three mutation checks were each observed red and then reverted. The todo is in completed/ with a resolution note, and the graph is updated.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| disk -> sidecar | `steam_restart_hold` store content is untrusted at boot (it could be tampered with or truncated) |
| sidecar -> OS process | ps / PowerShell children whose arguments are built from PIDs |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-pkp-01 | Tampering | steamRestartHold.readSteamRestartHold/listSteamRestartHolds | mitigate | Safe-parse every field (safe-integer PIDs, string tokens, finite recordedAt, string[] skippedDepots); malformed entries return undefined and are skipped, never thrown |
| T-pkp-02 | Elevation/Tampering | readSteamProcessStartTokens win32 -Command string | mitigate | Only `Number.isSafeInteger(pid) && pid > 0` values are interpolated, filtered before any args are built; execFile is used, not a shell |
| T-pkp-03 | Denial of service | boot re-arm pinning "Restart Steam" forever | mitigate | Identity = PID + start token (PID reuse drops it); age cap MAX_TICKS*3000 ms; restored ticks continue the original cap; manifest must still be StateFlags 4 |
| T-pkp-04 | Denial of service | sidecar exit at stdin EOF | mitigate | Probes are execFile with a timeout (5 s / 15 s), only when records exist; no new timer (the restored poll uses the existing unref'd interval) |
| T-pkp-05 | Information disclosure | persisted record | accept | It holds only an app id, PIDs, process start times and a timestamp; no credentials or profile data |
</threat_model>

<verification>
- All five Backend suites listed in Task 2 pass. `pnpm codecheck` and `pnpm lint` are green.
- prettier --check is clean on every `.ts` path in files_modified.
- With zero records, init() spawns no probe (asserted by test).
</verification>

<success_criteria>
- A native install held in `steam-waiting-for-restart` stays held across a sidecar restart while the same Steam process runs, and releases when that process exits.
- PID reuse, an exited Steam, a stale record, or a manifest that is not StateFlags 4 never re-arms a hold. An inconclusive probe never arms one and never deletes the record.
- The record is removed on every hold-ending path.
- The behaviour is the same on Windows, macOS and Linux; the hold scope is unchanged.
</success_criteria>

<output>
Create `.planning/quick/261029-pkp-persist-the-steam-restart-hold-across-ga/261029-pkp-SUMMARY.md` when done.
</output>
