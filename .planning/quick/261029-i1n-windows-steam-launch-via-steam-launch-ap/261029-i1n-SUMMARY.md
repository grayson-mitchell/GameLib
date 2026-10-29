---
phase: quick-261029-i1n
plan: 01
quick_id: 261029-i1n
subsystem: steam
tags: [steam, windows, launch, protocol-url]
status: complete
requires: []
provides:
  - "Windows native Steam Play opens steam://launch/<appId>/Dialog"
affects:
  - src/backend/storeManagers/steam/games.ts
key-files:
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - .planning/todos/pending/2026-10-29-open-external-drops-activate-false.md
decisions:
  - "Host switch reads isWindows from backend/constants/environment (the module every launch test mocks), never process.platform"
  - "Single numeric guard stays in buildSteamProtocolUrl; /Dialog is a fixed literal"
metrics:
  tasks: 2
  commits: 2
  plan_head_before: 955e6802680d0e2ea653992c8f760a7096c58d2c
  plan_head_after: 6fa4b75f149150928a1d69d20cdd3c885a888a83
actuals:
  tasks: 2
  commits: 2
completed: 2026-10-29
---

# Phase quick-261029-i1n Plan 01: Windows Steam launch via steam://launch/<appId>/Dialog Summary

Windows native Play now opens `steam://launch/<appId>/Dialog` (Playnite's form) through the single guarded `buildSteamProtocolUrl`, so Steam stops drawing its "Starting game / LAUNCHING" window; macOS and Linux keep `rungameid` unchanged.

## Commits

- `00fc389ac` fix(steam): launch native Steam games via steam://launch/<appId>/Dialog on Windows (games.ts, games.test.ts)
- `6fa4b75f1` docs(quick-261029-i1n): correct activate:false todo (the todo, now tracked)

## What changed

- `buildSteamProtocolUrl` verb union gained `'launch'`; after the unchanged `/^\d+$/` guard it returns the literal `steam://launch/${appId}/Dialog`. Other verbs untouched.
- `SteamGame.launch()` non-bottle branch: `buildSteamProtocolUrl(isWindows ? 'launch' : 'rungameid', this.appId)`. `isWindows` imported from `backend/constants/environment`. Rejection branch, `logInfo`, `{ activate: false }` and `return true` unchanged.
- launch() JSDoc and the activate:false comment rewritten so neither claims rungameid on every host nor that activate:false governs the Windows window.
- Tests: builder unit tests (launch verb, unchanged verbs, 3 rejects), GAME-01 beforeEach pins the host to Linux, new Windows describe (valid id, no-rungameid negative, 3 bad ids with warning). Seen RED (3 failing) before implementation.
- Todo: wrong "Steam draws that itself" paragraph replaced; first bullet names both URLs and `games.ts:3312`; frontmatter (`severity: medium`, `platform: macos`, `ready: live-gate`) intact; `todo-frontmatter-gate.py` prints `OK:`.

## Audit record (R3 / R4)

R3: every native Steam launch reaches the URL only through `SteamGame.launch()`.
- `launchDispatch.ts:43-46` `dispatchSteamLaunch` -> `getGame(appName).launch(...)`.
- `sidecar/steamFlowRegistration.ts:361-362` `handleLaunch` -> `dispatchSteamLaunch` (Library Play and Console mode LaunchOverlay).
- `protocol.ts:214-217` `gamelib://launch` -> `dispatchSteamLaunch` (deep links and desktop shortcuts).
- `launcher.ts` builds no steam:// URL; none built under `src/frontend`, `src/common`, `src/preload`.
- Other steam:// builders (bottle.ts, helperProcess.ts `steam://open/main`, macSteamOffline.ts, install/uninstall verbs) do not launch natively with rungameid.
- Re-measured after Task 1: `grep -rln "rungameid'" src ... | grep -v __tests__` returns only `games.ts`.

R4: `open_external_scheme_check` (`src-tauri/src/main.rs:2247`) is scheme-only against `OPEN_EXTERNAL_ALLOWED_SCHEMES = ["https","http","mailto","tel","steam"]`, used by both the `open_external` command and the sidecar `openExternal` frame. The new URL passes with no Rust change. `git diff HEAD -- src-tauri` is empty; no cargo test needed.

## games.test.ts full-file `Tests:` line

- Before: `Tests: 12 failed, 431 passed, 443 total`
- After: `Tests: 12 failed, 441 passed, 453 total`

The set of 12 failing test names is identical before and after (diffed): Phase 56 DRM x8, D-UAT-24-03 cascade (b) x1, Phase 24 bridge launch 261024-tny / 261026-lif x3. All pre-existing Windows-box failures.

## Verification

- Scoped games.test.ts run (`GAME-01|261029-i1n|scope-fence|NOT-yet-captured|N[123]: `): 52 passed, 0 failed.
- Sidecar flow suites (steamFlows, skeletonFlows): 23/23 passed.
- `pnpm codecheck` clean; `prettier --check` clean on both source files; todo path is prettier-ignored (`--file-info` confirmed), check omitted per gamelib-conventions.
- `graphify update .` run.
- `pnpm lint` was not run separately (only codecheck, scoped jest, prettier); lint ceilings remain for the orchestrator/CI if wanted.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None. Threat register T-i1n-01 (mitigated by the guard-before-verb ordering and Windows rejection tests), T-i1n-04 (explicit-path staging; the three unrelated untracked files remain `??`) both hold.

## Pending live gate (post-merge, operator's Windows box)

With Steam running, Play WazHack (264160): log shows `via steam://launch/264160/Dialog`, game starts, no "Starting game / LAUNCHING" window. Repeat with Steam fully exited. On Mac, log still shows `steam://rungameid/<appId>`.

## Self-Check: PASSED

Commits `00fc389ac` and `6fa4b75f1` exist; modified files present; todo tracked in git.
