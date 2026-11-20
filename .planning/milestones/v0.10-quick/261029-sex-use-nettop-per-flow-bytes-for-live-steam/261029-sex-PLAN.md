---
phase: quick-261029-sex
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/steamDownloadProgress.ts
  - src/backend/storeManagers/steam/__tests__/steamDownloadProgress.test.ts
  - src/backend/storeManagers/steam/steamDownloadMonitor.ts
  - src/backend/storeManagers/steam/__tests__/steamDownloadMonitor.test.ts
  - src/backend/sidecar/stdinEofRelease.ts
  - src/backend/sidecar/__tests__/stdinEofRelease.test.ts
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/__tests__/library.test.ts
autonomous: true
requirements: [QUICK-261029-SEX]

must_haves:
  truths:
    - 'On macOS, while native Mac Steam performs a download GameLib handed to it, the Downloads hero percent advances during the download instead of sitting at 0 % until commit'
    - 'The hero shows a non-zero download speed during a Steam-performed download, from the nettop counter over a window of 3 s or less'
    - 'Percent never reaches 100 before ACF StateFlags 4. The live path caps it at 99, and 100 % comes only from the existing installed branch'
    - "An advancing live counter never produces the 'steam-paused' context"
    - 'If two apps have active updates in content_log, or nettop or the steam_osx PID is unavailable, the poller emits exactly what it emits today (ACF-derived)'
    - 'On Windows and Linux, and for bottle, bridge-bottle and native-handoff polls, no nettop child is ever spawned'
    - 'The nettop child is killed when the poll stops and at sidecar stdin EOF, and it never holds the event loop open'
  artifacts:
    - path: 'src/backend/storeManagers/steam/steamDownloadProgress.ts'
      provides: 'Pure content_log + nettop parsers, the flow accumulator, the update tracker, liveProgress and windowRate'
      exports:
        [
          'parseContentLogLine',
          'parseNettopRow',
          'createFlowAccumulator',
          'applyNettopRow',
          'createUpdateTracker',
          'applyContentLogEvent',
          'liveProgress',
          'windowRate'
        ]
    - path: 'src/backend/storeManagers/steam/steamDownloadMonitor.ts'
      provides: 'Thin process plumbing: one nettop child per appId plus an incremental content_log tail'
      exports:
        [
          'startSteamDownloadMonitor',
          'readSteamDownloadMonitor',
          'stopSteamDownloadMonitor',
          'stopAllSteamDownloadMonitors'
        ]
  key_links:
    - from: 'src/backend/storeManagers/steam/library.ts'
      to: 'steamDownloadMonitor.ts'
      via: 'startInstallPolling starts, pollInstallOnce reads, stopInstallPolling stops'
      pattern: '(start|read|stop)SteamDownloadMonitor'
    - from: 'src/backend/sidecar/stdinEofRelease.ts'
      to: 'steamDownloadMonitor.ts'
      via: 'release() calls stopAllSteamDownloadMonitors'
      pattern: 'stopAllSteamDownloadMonitors'
    - from: 'src/backend/storeManagers/steam/steamDownloadMonitor.ts'
      to: '/usr/bin/script -q /dev/null /usr/bin/nettop'
      via: 'child_process.spawn with no env option, child.unref() plus stdout unref'
      pattern: 'nettop'
---

<objective>
Give the Downloads hero a live percent and speed while native Mac Steam performs a download, by
counting the steam_osx process's per-flow nettop `bytes_in`. The method is the one spike 050
validated.

Purpose: Steam does not rewrite the ACF mid-download (spike 050: 0 writes in 109 s and in 356 s).
So today the hero reads 0 % and 0 speed for the whole download, then jumps to done. The existing
T-AOG stall logic also sees `BytesDownloaded` frozen at 0 below a non-zero `BytesToDownload`, so it
raises `steam-paused` about 9 s in and keeps it up for the entire download (see the risk note in
Task 3).

Output: a pure parser/accumulator module, a thin monitor that owns the nettop child and the
content_log tail, and a poller integration with an exact fallback to today's behaviour. Closes
todo `2026-10-29-spike-steam-download-progress-sources.md`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@.planning/spikes/050-steam-download-progress-sources/README.md
@.planning/spikes/050-steam-download-progress-sources/probe.mjs
@.planning/todos/pending/2026-10-29-spike-steam-download-progress-sources.md

Load `Skill("gamelib-conventions")` before Task 2. It covers the fake-HOME spawn rule, the sidecar
exit contract (both halves) and the prettier verify rule.

<interfaces>
Existing code the executor builds against. These were extracted already, so no exploration is needed.

src/backend/storeManagers/steam/steamClientProcess.ts:
  export async function listSteamClientPids(platform?: NodeJS.Platform): Promise<number[] | undefined>
  On darwin it runs `/usr/bin/pgrep -x steam_osx`. It returns [] when Steam is not running and
  undefined when the result is unknown, and it never rejects. Its spawn carries no `env` (the
  two-profile precedent to follow).

src/backend/storeManagers/steam/macSteamOffline.ts:150-162 holds the lazy content_log-dir
precedent. It calls require('backend/config') inside the function, then GlobalConfig.get()
.getSettings().defaultSteamPath.replaceAll("'", ''), joined with 'logs'. Use 'content_log.txt' in
place of 'connection_log.txt'.

src/backend/sidecar/stdinEofRelease.ts: releaseOnStdinEof(input) has a once-guarded release()
that runs best-effort try/catch steps (pauseCurrentDownload, callAllAbortControllers) and then
calls SteamUser.releaseForShutdown(). It never calls process.exit.

src/backend/storeManagers/steam/library.ts:
  - activePolls entry (about :2150-2263): source: AcfSource, isNativeHandoff: boolean,
    delegatedToSteamClient: boolean, lastBytesDownloaded?: number, lastTickMs?: number,
    stalledTicks: number
  - STALLED_TICKS_THRESHOLD = 3, BYTES_PER_MIB = 1024*1024, and rollingRateMiBs(deltaBytes,
    deltaMs, prev) live in the same file
  - pollInstallOnce(appId, source) 'downloading' branch (about :2977-3200), in this order:
    destructure bytesDownloaded/bytesToDownload/bytesStaged/bytesToStage; isWaitingForSteamRestart;
    T-AOG stall counter (realDownloadInFlight && bytesDownloaded <= poll.lastBytesDownloaded);
    gameStatusUpdate with its context; T-AOG speed from the ACF delta; eta; percent =
    Math.round(numerator/denominator*100), clamped 0..100; then progressUpdate
    { percent, bytes: getFileSize(numerator), eta, downSpeed? }
  - startInstallPolling(appId, intervalMsOrOptions) (about :3400-3630). The existing-entry
    upgrade path (about :3450) flips delegatedToSteamClient to true. A new entry is built at
    about :3480-3525. The timer is unref'd at the end.
  - stopInstallPolling(appId) (about :3700): clearInterval, then activePolls.delete
  - isMac is imported from 'backend/constants/environment', which library.test.ts mocks at :193

src/backend/storeManagers/steam/__tests__/library.test.ts: jest.mock('../steamClientProcess')
at :304 is the pattern to copy, where a bare jest.fn() returning undefined means fail open. The
T-AOG tests live at about :4460-4680.

src/frontend/screens/DownloadManager/components/DownloadHero/heroModel.ts has NO indeterminate
state. heroPercent clamps any finite percent to 0..100. So the fallback is today's behaviour,
per the locked decision, and the frontend is not touched.
</interfaces>

Spike 050 facts the executor must honour:

- content_log is CRLF, and `.` does not match `\r`, so strip `\r` before matching anything.
- Recorded line shapes for the fixtures (append `\r` to each):
  `[2026-10-29 20:12:03] AppID 43160 update started : download 0/8736151712, store 0/0, reuse 0/0, delta 0/0, stage 0/9614286648 `
  `[2026-10-29 20:12:03] AppID 43160 App update changed : Running Update,Downloading,Staging,`
  `[2026-10-29 20:18:02] AppID 43160 App update changed : Running Update,Committing,`
  `[2026-10-29 20:18:02] AppID 43160 scheduler finished : removed from schedule (result No Error, state 0xc) `
  `[2026-10-29 19:58:29] AppID 238320 update started : download 0/2813215248, store 0/0, reuse 0/0, delta 0/0, stage 0/3401037827 `
  `[2026-10-29 20:12:03] AppID 43160 preallocated 29 files (9168 MB) `
  These terminators were seen in this Mac's real log: `AppID N App update changed : None` and
  `AppID N finished update, 1 mounted depots (BuildID 4597280) : ...`.
- nettop runs as `/usr/bin/script -q /dev/null /usr/bin/nettop -x -n -L 0 -s 1 -J bytes_in -p <pid>`,
  under a pty. The output is therefore also CRLF, so strip `\r`.
  - A block header starts with `,bytes_in`.
  - A flow row looks like `tcp4 10.0.0.5:50123<->23.45.6.7:443,123456,`. Key rows by the flow
    string and skip any flow containing `127.0.0.1` or `::1`.
  - Rows with an empty byte column are skipped, and so are process-summary rows
    (`steam_osx.48169,N,`), which do not start with tcp/udp.
  - The first block is a baseline only. After that, sum positive per-flow deltas.
  - Never use `-P`.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pure parsers, flow accumulator, update tracker and progress math</name>
  <files>src/backend/storeManagers/steam/steamDownloadProgress.ts, src/backend/storeManagers/steam/__tests__/steamDownloadProgress.test.ts</files>
  <behavior>
    - parseContentLogLine strips a trailing `\r`. The Metro `update started` line returns { kind:'started', appId:'43160', downloadDone:0, downloadTotal:8736151712 }, and a `download 1048576/2813215248` variant returns downloadDone 1048576.
    - `App update changed : Running Update,Downloading,Staging,\r` returns { kind:'phase', appId, phase:'Running Update,Downloading,Staging' }.
    - Each of `scheduler finished`, `finished update, ...`, `App update changed : None` and `update canceled` returns { kind:'ended', appId }. `preallocated ...` and unrelated lines return null.
    - Without stripping, the CRLF `(.*)$` patterns would fail. A test asserts the `\r`-terminated fixtures parse, which proves the strip.
    - parseNettopRow: `,bytes_in,\r` returns { kind:'header' }; a tcp4 row returns { kind:'flow', flow, bytesIn }; and loopback rows (127.0.0.1 and ::1), empty-byte rows, process-summary rows and garbage all return null.
    - Accumulator: rows in block 1 set the baseline and leave cum at 0. A later block adds only positive per-flow deltas. A flow first seen after the baseline counts from 0. A decreasing value (a reused 4-tuple) adds nothing and re-baselines the flow. Feeding rows with closed flows absent from later blocks never drops cum.
    - Update tracker: 'started' records { downloadDone, downloadTotal, cumAtStart } for the appId and adds it to the active set. 'ended' removes it. A second 'started' for the same appId re-baselines it, which covers a resume. activeCount reports the size of the active set.
    - liveProgress({ downloadDone, downloadTotal, cumAtStart, cumNow, acfBytesDownloaded, acfBytesToDownload }): bytesDone = max(acfBytesDownloaded, downloadDone + max(0, cumNow - cumAtStart)), and total = acfBytesToDownload > 0 ? acfBytesToDownload : downloadTotal. percent = min(99, bytesDone/total*100). The result is undefined when total <= 0, and the 100.4 % overshoot case (8770693182 of 8736151712) yields 99.
    - windowRate(samples [{ms, cum}], nowMs, windowMs = 3000) returns bytes/s over the samples inside the window. It returns undefined with fewer than 2 samples, or when the elapsed time is under 500 ms, and it never returns NaN, Infinity or a negative value.
  </behavior>
  <action>
Create `steamDownloadProgress.ts`. It is a leaf module: no imports from backend, fs or
child_process, and no state at module level. Every export is a pure function over plain objects,
which the locked decision requires. Mark exports that only tests import with
`// ts-prune-ignore-next`, as steamClientProcess.ts does.

Port the regexes from probe.mjs `parseLine` and `startNettop`, but strip `\r` first, both for
content_log and for the pty's nettop output. Add the terminators the probe lacked: `finished
update`, `App update changed : None` and `update canceled`.

The update tracker is a plain object `{ active: Map<appId, {downloadDone, downloadTotal,
cumAtStart}> }`. applyContentLogEvent(tracker, event, cumNow) mutates it and returns it.
liveProgress and windowRate implement the locked recipe: percent = min(0.99, (Σ deltas since
`update started` + X) / BytesToDownload), expressed in percent units capped at 99, and speed is
the counter's delta over a window of 3 s or less. Floor bytesDone at the ACF `BytesDownloaded` so
the number can never run below what Steam itself reports.

Write the test file first, using the CRLF fixtures quoted in <context>. Watch it fail, then
implement. Do not round the percent here; library.ts owns presentation.
  </action>
  <verify>
    <automated>npx jest --selectProjects Backend src/backend/storeManagers/steam/__tests__/steamDownloadProgress.test.ts && npx prettier --check src/backend/storeManagers/steam/steamDownloadProgress.ts src/backend/storeManagers/steam/__tests__/steamDownloadProgress.test.ts</automated>
  </verify>
  <done>All behaviours pass, the module has zero imports, and prettier is clean on both paths.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: steamDownloadMonitor plumbing (nettop child, content_log tail, exit contract)</name>
  <files>src/backend/storeManagers/steam/steamDownloadMonitor.ts, src/backend/storeManagers/steam/__tests__/steamDownloadMonitor.test.ts, src/backend/sidecar/stdinEofRelease.ts, src/backend/sidecar/__tests__/stdinEofRelease.test.ts</files>
  <behavior>
    - With injected deps (platform, listPids, spawn, contentLogPath, readTail, now), startSteamDownloadMonitor('43160') spawns `/usr/bin/script` with args ['-q','/dev/null','/usr/bin/nettop','-x','-n','-L','0','-s','1','-J','bytes_in','-p', String(lowest pid)] and options containing no `env` key. It calls child.unref() and stdout.unref().
    - platform !== 'darwin' leads to no spawn and read returning undefined. listPids returning [] or undefined also leads to no spawn and undefined.
    - When fake stdout data emits two blocks (CRLF) and the tail holds the Metro `update started` line, read('43160') returns { bytesDone, bytesTotal, speedBytesPerSec } with bytesDone equal to the second block's positive deltas.
    - read returns undefined in each of these cases: fewer than 2 nettop blocks; no active update for that appId; an active update for a second appId (activeCount > 1); and after the child emits 'error' or 'exit'.
    - When start is called after `update started` was already written, the initial tail scan still finds the update, and cumAtStart is 0.
    - stop kills the child with SIGTERM and deletes the entry. stopAll kills every entry. start is idempotent per appId.
    - stdinEofRelease: when stdin ends, release() calls stopAllSteamDownloadMonitors exactly once, and if it throws, SteamUser.releaseForShutdown() still runs.
  </behavior>
  <action>
Create `steamDownloadMonitor.ts` as thin plumbing over Task 1's pure functions. It keeps a
module-level `Map<appId, Monitor>`. A Monitor holds the child, the accumulator, the tracker, the
log offset, a ring of `{ms, cum}` samples covering the last 5 s, and a `failed` flag.

Production deps are resolved lazily:
- listSteamClientPids('darwin'), taking the lowest PID.
- child_process.spawn.
- The content_log path, using the lazy `require('backend/config')` precedent from
  macSteamOffline.ts.
- A sync bounded tail reader: fs open/fstat/read from the stored offset, capped at 256 KB per
  read. On the first read it starts at max(0, size - 256 KB) and drops the first partial line. If
  the size has shrunk below the offset (the log rotated), it resets the offset to 0.

The content_log tail is read once at start, then once per nettop block header, inside the stdout
'data' handler. That gives a lag of 1 s or less with no extra timer or watcher. Each block pushes
a sample. read() combines the tracker entry, windowRate and the raw counter. Leave the percent
math to library.ts through liveProgress, so read returns the bytes, the total and the speed. It
returns undefined on any guard failure, per the locked fallback.

Spawn conventions:
- Spawn absolute `/usr/bin/script` and `/usr/bin/nettop`, with stdio ['ignore','pipe','ignore'].
- Pass NO `env` option. nettop reads no user profile, which matches the steamClientProcess.ts
  two-profile precedent. Say so in a comment, as that file does.
- Sidecar exit contract, half 1: call child.unref() and `(child.stdout as Socket | null)?.unref?.()`.
  A piped stdout socket holds the loop even after child.unref().
- Half 2: start does no network work and no unbounded in-flight work. The pgrep probe is already
  bounded by its own 5 s timeout.
- Wire 'error' and 'exit' to set failed, so the monitor falls back. Wrap every callback in
  try/catch and log with logWarning(LogPrefix.Steam). It must never throw into the poller.
- The child is non-detached. It therefore stays in the sidecar's process group, so the Rust
  shutdown_child process-group SIGTERM is the backstop.

Export start/read/stop/stopAll, and expose a deps-injection seam the way listSteamClientPids takes
its `platform` parameter. Use an optional deps argument, or a `__setDepsForTest` with
`// ts-prune-ignore-next`.

In stdinEofRelease.ts, import stopAllSteamDownloadMonitors and add it as one more best-effort
try/catch step before `SteamUser.releaseForShutdown()`. Update the log line. The process is
killable but cannot be unref'd away, which is exactly what the amendment in that file's convention
is for. Extend stdinEofRelease.test.ts with a jest.mock of the new module.

Tests use a fake EventEmitter child. They never spawn a real process.
  </action>
  <verify>
    <automated>npx jest --selectProjects Backend src/backend/storeManagers/steam/__tests__/steamDownloadMonitor.test.ts src/backend/sidecar/__tests__/stdinEofRelease.test.ts src/backend/__tests__/fakeHomeIsolation.test.ts && npx prettier --check src/backend/storeManagers/steam/steamDownloadMonitor.ts src/backend/storeManagers/steam/__tests__/steamDownloadMonitor.test.ts src/backend/sidecar/stdinEofRelease.ts src/backend/sidecar/__tests__/stdinEofRelease.test.ts</automated>
  </verify>
  <done>The monitor passes its tests, with no spawn on non-darwin and a fallback on every guard. The fakeHomeIsolation gate stays green, stdin EOF stops all monitors, and prettier is clean on all 4 paths.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Wire the live signal into the install poller and fix the T-AOG interaction</name>
  <files>src/backend/storeManagers/steam/library.ts, src/backend/storeManagers/steam/__tests__/library.test.ts</files>
  <behavior>
    - Monitor lifecycle: startInstallPolling on isMac with source 'native' and isNativeHandoff false calls startSteamDownloadMonitor(appId). That covers delegated steam://install polls and bare native resume polls. Upgrading an existing entry to delegated also calls it, idempotently. Bottle, bridge-bottle, isNativeHandoff and !isMac polls never call it. stopInstallPolling calls stopSteamDownloadMonitor(appId) on every path.
    - When readSteamDownloadMonitor returns { bytesDone: 4_368_075_856, bytesTotal: 8_736_151_712, speedBytesPerSec: 25e6 } and the ACF reads StateFlags 1026 with BytesDownloaded 0 and BytesToDownload 8736151712, progressUpdate has percent 50, downSpeed ≈ 25e6/BYTES_PER_MIB and a non-empty eta.
    - A live overshoot (bytesDone > total) emits percent 99, never 100.
    - With live bytes advancing every tick for 5 ticks there is no 'steam-paused' context. With live bytes frozen for STALLED_TICKS_THRESHOLD ticks, 'steam-paused' does appear (a real pause still surfaces).
    - When readSteamDownloadMonitor returns undefined, every existing T-AOG and GAP-17 test passes unchanged, and the output is byte-identical to today's.
    - A bare jest.mock of '../steamDownloadMonitor' (jest.fn returning undefined) keeps the whole existing library.test.ts suite green.
  </behavior>
  <action>
In library.ts, import start/read/stop from './steamDownloadMonitor' and liveProgress from
'./steamDownloadProgress'.

Eligibility is `isMac && source === 'native' && !isNativeHandoff`, per the locked rule that the
path is macOS only. Spike 050 found that only Mac-native games are downloaded by Steam; bottle
polls are a Wine Steam process, and handoff polls are GameLib's own depot downloader. Call
startSteamDownloadMonitor in startInstallPolling's new-entry path and in the delegated-upgrade
path. Call stopSteamDownloadMonitor in stopInstallPolling before activePolls.delete.

In pollInstallOnce's 'downloading' branch:
1. Right after the destructure, when poll exists and is eligible, compute
   `live = readSteamDownloadMonitor(appId)`.
2. If live is defined, compute liveProgress from it together with the ACF bytesDownloaded and
   bytesToDownload. Call the result `liveP`.
3. Define an effective `dlBytes` (liveP.bytesDone, else bytesDownloaded) and `dlTotal` (liveP's
   total, else bytesToDownload). Use them in place of bytesDownloaded/bytesToDownload in four
   places:
   (a) the T-AOG realDownloadInFlight and stall comparison;
   (b) the poll.lastBytesDownloaded bookkeeping;
   (c) the eta remaining bytes;
   (d) the percent numerator and denominator. When live is used, `useStaged` is false, and the
       percent is Math.min(99, Math.round(liveP.percent)) rather than the 0..100 clamp.
4. For downSpeed, when live is defined use live.speedBytesPerSec / BYTES_PER_MIB, provided it is
   finite and > 0. Otherwise keep the existing ACF-delta rollingRateMiBs path unchanged.
5. `bytes` in progressUpdate becomes getFileSize(dlBytes) on the live path.

Keep the fallback (live undefined) arithmetically identical to today. Do not touch the 'installed'
branch: 100 % still comes only from StateFlags 4, per the locked decision. Add a short comment
block citing quick 261029-sex and spike 050 next to the T-AOG one.

Tests:
- In library.test.ts, add `jest.mock('../steamDownloadMonitor', ...)` with bare jest.fn()s next
  to the steamClientProcess mock. Do not mock steamDownloadProgress; it is pure.
- Add a `describe('quick 261029-sex live Steam download progress')` covering the behaviours above,
  following the existing T-AOG test style around :4603. Toggle isMac through the existing
  environment mock.
  </action>
  <verify>
    <automated>npx jest --selectProjects Backend src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/storeManagers/steam/__tests__/steamDownloadProgress.test.ts src/backend/storeManagers/steam/__tests__/steamDownloadMonitor.test.ts && pnpm codecheck && npx prettier --check src/backend/storeManagers/steam/library.ts src/backend/storeManagers/steam/__tests__/library.test.ts</automated>
  </verify>
  <done>Live percent and speed flow through progressUpdate on eligible macOS polls, capped at 99. An advancing live counter never yields steam-paused. The fallback is byte-identical, with all pre-existing library tests green. codecheck and prettier are clean.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| sidecar → nettop/script child | GameLib spawns an OS tool and parses its stdout |
| content_log.txt → sidecar | Steam-written, local, user-owned file parsed by regex |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-sex-01 | Tampering | spawn of script/nettop | mitigate | Absolute `/usr/bin/script` and `/usr/bin/nettop`, so PATH lookup is never used. The argv is a fixed array, and the PID is a numeric from parsePgrepPids passed through String(). No shell. |
| T-sex-02 | Denial of Service | sidecar exit / event loop | mitigate | child.unref() plus stdout unref. The child is killed in stopInstallPolling and stopAllSteamDownloadMonitors (stdin EOF), and the process-group SIGTERM in shutdown_child is the backstop. There is no extra timer. |
| T-sex-03 | Denial of Service | content_log tail | mitigate | Each read is capped at 256 KB. The offset resets when the file shrinks. Every callback is wrapped in try/catch and never throws into the poller. |
| T-sex-04 | Information Disclosure | nettop output | accept | Only byte counts and the remote 4-tuple are read. Nothing is logged per flow and nothing leaves the process. |
| T-sex-05 | Spoofing (wrong percent) | concurrent Steam traffic / two downloads | mitigate | activeCount > 1 means fallback. The percent is capped at 99, and 100 % comes only from ACF StateFlags 4. |
</threat_model>

<verification>
- `npx jest --selectProjects Backend src/backend/storeManagers/steam/__tests__/ src/backend/sidecar/__tests__/stdinEofRelease.test.ts src/backend/__tests__/fakeHomeIsolation.test.ts`
- `pnpm codecheck` and `pnpm lint` (ceilings PASS)
- `npx prettier --check` over the 8 files in files_modified
- `graphify update .` after code changes
- Exit-contract sanity check: `grep -v '^\s*//' src/backend/storeManagers/steam/steamDownloadMonitor.ts | grep -cE '\.unref(\?\.)?\(\)'` must return at least 2 (the child and stdout)
</verification>

<success_criteria>
- The three tasks pass their automated verify blocks
- No spawn on non-darwin, or for bottle, bridge-bottle or handoff polls
- The fallback emits exactly what it emits today
- Todo `2026-10-29-spike-steam-download-progress-sources.md` moves to completed in the SUMMARY commit
</success_criteria>

<uat_note>
Live verification is a human step after execution. It is not an executor task.

1. On macOS, quit and restart `tauri dev` so the sidecar is rebuilt; check the sidecar.js mtime.
   With native Steam running and the native-install setting OFF, install an owned Mac-native game
   of a few GB (for example Outlast 238320) from GameLib, then click Install in Steam's dialog.
   - expected: within about 5 s of `update started`, the Downloads hero percent rises in steps of
     roughly 1 % at the 3 s tick, the speed reads about the link rate (around 24 MB/s on this Mac)
     and the speed graph fills, there is no "paused" context, the percent tops out at 99 until
     commit, and it then completes normally.
2. While it downloads, check that `pgrep -fl nettop` shows one nettop child. After completion, and
   after quitting GameLib, it must show none.
3. Optionally, start two Steam downloads at once. Expected: the hero falls back to today's ACF
   behaviour for both, with no wrong combined percent.
</uat_note>

<output>
Create `.planning/quick/261029-sex-use-nettop-per-flow-bytes-for-live-steam/261029-sex-SUMMARY.md` when done
</output>
