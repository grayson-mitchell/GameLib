---
phase: quick-261029-sex
plan: 01
status: complete
subsystem: steam-install-polling
tags: [steam, macos, nettop, download-progress]
key-files:
  created:
    - src/backend/storeManagers/steam/steamDownloadProgress.ts
    - src/backend/storeManagers/steam/steamDownloadMonitor.ts
    - src/backend/storeManagers/steam/__tests__/steamDownloadProgress.test.ts
    - src/backend/storeManagers/steam/__tests__/steamDownloadMonitor.test.ts
  modified:
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
    - src/backend/sidecar/stdinEofRelease.ts
    - src/backend/sidecar/__tests__/stdinEofRelease.test.ts
completed: 2026-10-29
---

# Quick 261029-sex: live Steam download progress from nettop

On macOS, while native Steam performs a download GameLib handed to it, the Downloads hero now shows a live percent (capped at 99) and speed. The source is steam_osx's per-flow nettop `bytes_in`, anchored by the content_log `update started` line (spike 050 method).

## Commits

- 59547553c: pure parsers, flow accumulator, update tracker, liveProgress, windowRate (18 tests)
- 39cc750d2: monitor plumbing (nettop child via `/usr/bin/script`, bounded content_log tail) plus stdin EOF release
- 2550b2a15: library.test.ts coverage for the poller integration
- library.ts poller wiring: landed in 2cb1cdc48 (see Deviations)

## What was built

- `steamDownloadProgress.ts`: zero-import leaf. CRLF-safe content_log and nettop parsers, baseline-then-positive-delta flow accumulator, update tracker, `liveProgress` (floors at ACF bytes, caps at 99), `windowRate` (3 s window, undefined under 500 ms).
- `steamDownloadMonitor.ts`: one nettop child per appId. Absolute `/usr/bin/script` and `/usr/bin/nettop`, no `env`, child and stdout both unref'd. The log is tailed at start and once per nettop block (256 KB cap, rotation reset). Every guard failure returns undefined, so the poller falls back to ACF behaviour. `stopAllSteamDownloadMonitors` runs at stdin EOF.
- `library.ts`: monitor starts for `isMac && source==='native' && !isNativeHandoff` (new entry and delegated upgrade; an upgrade to handoff stops it). `pollInstallOnce` uses effective `dlBytes`/`dlTotal` for the T-AOG stall comparison, bookkeeping, ETA and percent, so an advancing live counter never raises `steam-paused`, while a frozen one still does. The installed branch is untouched, so 100 % still comes only from StateFlags 4.

## Verification

- `listSteamClientPids('darwin')` uses `pgrep -x steam_osx`. Checked live: `pgrep -x` returns 48169 only, while `pgrep -f steam_osx` also returns Steam Helper (48188). No change needed.
- Targeted jest (steam, sidecar, `src/backend/__tests__` incl. fakeHomeIsolation): 333 suites, 8409 passed, 3 skipped, 0 failed.
- `pnpm codecheck`: clean. `npx prettier --check` on library.ts, library.test.ts, both new modules: clean. `.unref()` count in the monitor (non-comment): 3.
- eslint on the new modules and stdinEofRelease.ts: 0 warnings.

## Deviations from Plan

**1. library.ts committed under another task's hash.** A concurrent quick task (261029-sbi) ran `git add` on library.ts while my edits were uncommitted, so they landed in 2cb1cdc48 ("capture Steam Metacritic score") instead of a sex-labelled commit. I did not rewrite history. My library.test.ts commit (2550b2a15) notes this.

**2. Test-case change.** The plan listed a "bridge-bottle" poll for the never-spawn test. `AcfSource` has no such value (bridge installs do not use `startInstallPolling` sources), so the test covers bottle and native-handoff only.

**3. start is async.** `startSteamDownloadMonitor` returns a Promise (the PID lookup is async); the poller calls it with `void`. A stop issued during the lookup prevents the spawn.

## Known limitations / out-of-scope findings

- `pnpm lint` fails: production ceiling is 1130 and the tree measures 1132 (tests scope passes). None of the new warnings are in files from this task (0 warnings in them). The count comes from concurrent work in the tree; not fixed here.
- `meta/__tests__/genI18nGateScope.test.ts` A-17 anti-rot fails: `src/frontend/helpers/steamInstallSignIn.ts` (from quick 261029-s5l) is missing from `meta/i18nForkTouchedFiles.json`. The tree also has an uncommitted, unrelated edit to that file (adds `useWikiMetacriticScores.ts`). Frontend-only; this task touches no frontend file, so not touched.
- If the monitor starts after a download is already well underway, the log's `update started` is found but the nettop counter only counts from monitor start, so the percent under-reads until it catches up (floored at ACF bytes). Safe direction.
- Human UAT (live Outlast download, one nettop child during, none after / after quitting GameLib, two concurrent downloads fall back) is per the plan's uat_note and was not run.
- Todo `2026-10-29-spike-steam-download-progress-sources.md` should move to completed in the docs commit.

## Known Stubs

None.

## Self-Check: PASSED

Files exist; commits 59547553c, 39cc750d2, 2550b2a15, 2cb1cdc48 present in git log.
