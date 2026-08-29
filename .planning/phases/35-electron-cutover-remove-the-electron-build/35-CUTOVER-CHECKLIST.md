---
phase: 35-electron-cutover-remove-the-electron-build
plan: 14
task: 1
purpose: Every behaviour in `src/backend/main.ts` has a named, CONFIRMED successor before the file is deleted
date: 2026-08-29
commit: ee34b24b9
status: ZERO MISSING ROWS — cleared to tag
---

# Cutover Checklist — `src/backend/main.ts`

`src/backend/main.ts` is **1561 lines**. The plan's own interface list calls itself a summary and
warns it may be incomplete; it is. The file is not only an entry point — it registers **136 IPC
channels** and carries move/import business logic. This checklist was built by reading the file and
by census, not from that list.

**T-35-60 is the threat this document exists to mitigate:** a behaviour with no successor becomes
unrecoverable knowledge the moment the file is gone.

## A. Gate: `CENSUS-MAINTS-EDGES` — RE-RUN, not trusted from `35-PREFLIGHT.md`

Five plans landed since that census was taken, so it was re-run at this commit as the plan requires.

```
$ grep -rn "backend/main'\|backend/main\"\|from '\.\./main'\|from './main'" src/sidecar/ src/backend/sidecar/
(no output)
```

**EMPTY — required answer.** No sidecar module imports `src/backend/main.ts`, so deleting it cannot
break the Tauri path by a dangling import. T-35-59 precondition holds.

## B. The IPC channel census — and a retracted first answer

This is the part the plan's interface list does not cover at all, and it is where the real risk sat.

**A first census reported 42 channels dying with `main.ts`. That number was WRONG and is
retracted.** It used a single-line pattern (`addHandler\('[^']+'`), but sidecar registrations are
frequently **multi-line**:

```ts
addHandler(
  'checkDiskSpace',
  ...
)
```

so the sidecar's own registrations were undercounted at 18. The error was caught by spot-checking a
named channel (`checkDiskSpace`) against the file the comment pointed at, rather than trusting the
diff — the `grep-gate-is-blind-in-one-direction` shape this project has recorded before. Re-run
multi-line-aware:

| Measure | Count |
|---|---|
| Channels registered by `main.ts` | 136 |
| Channels registered elsewhere in `src/` | 209 |
| **Registered ONLY in `main.ts`** | **16** |

All 16 are accounted for. None is `MISSING`.

### B1. Ported renderer-side — 13 channels, CONFIRMED

`closeWindow`, `createNewWindow`, `gamepadAction`, `isFrameless`, `isFullscreen`, `isMaximized`,
`isMinimized`, `maximizeWindow`, `minimizeWindow`, `setFullscreen`, `setZoomFactor`,
`showAboutWindow`, `unmaximizeWindow`.

Each is exported from `src/preload/api/misc.ts` or `helpers.ts` as an `isTauri()` ternary:

```ts
export const isFrameless = () => (isTauri() ? tauriIsFrameless() : isFramelessIpc())
```

The `*Ipc` half is the Electron branch and is **unreachable under Tauri**, so `main.ts`'s handler
is already dead code on the Tauri path. `misc.ts:114` states this in-source: *"UNPORTED_CHANNEL_MARKER
path is never reached because this `isTauri()` short-circuit is the only caller path."*

**All 13 were checked individually, not sampled.** A first pass using a single-line `^export const X`
grep reported `gamepadAction` and `setZoomFactor` as unbranched; both are **multi-line exports** and
both DO carry the ternary (`misc.ts:91-92` and `:117-118`). Verified by reading them.

Successor: `src/preload/api/tauriWindowChrome.ts` (plan 34.1). **CONFIRMED.**

### B2. Dropped Zoom platform — 3 channels, CONFIRMED DEAD BY DECISION

`authZoom`, `getZoomUserInfo`, `logoutZoom`.

These have **no** `isTauri()` branch — `src/preload/api/zoom.ts:4` is a bare
`makeHandlerInvoker('authZoom')`. So under Tauri they already invoke a channel no sidecar module
registers: **they are non-functional today, before this plan.** Deleting `main.ts` removes an
Electron-only fallback, not working behaviour.

Successor: none, and none is wanted — the Zoom platform is a dropped product decision.
`oauthLoginFlowRegistration.ts:32` records them as deliberately unported. **CONFIRMED.**

## C. Named behaviours from the plan's interface list

| `main.ts` | Behaviour | Successor | Status |
|---|---|---|---|
| :501 | `protocol.handle('gamelib')` | plan 35-07, Rust deep-link registration | **CONFIRMED** |
| :507 | `app.setAsDefaultProtocolClient('gamelib')` | plan 35-07, Rust | **CONFIRMED** |
| :650/:655 | `powerSaveBlocker.start` (both kinds) | plan 35-08 — `wake_lock_start`/`wake_lock_stop`, **observed live holding real IOKit assertions** (`35-08-LIVE-GATE.md`) | **CONFIRMED** |
| :309 | `Menu.setApplicationMenu(null)` | Tauri builds no application menu; nothing to suppress | **CONFIRMED** |
| :386 | `screen.getPrimaryDisplay().workAreaSize.width` | Tauri owns window sizing (`tauri.conf.json`); `main_window.ts:33`'s sizing is Electron-only and dies with plan 35-15 | **CONFIRMED** |
| :321/:329 | `isPackaged` CSP branches | plan 35-03's `devUrl` | **CONFIRMED** |
| :315, :25 | `electron-updater` / `autoUpdater.checkForUpdates()` | D-13 clean break — Tauri updater plugin configured with pubkey, endpoint, `installMode: passive`; `gh release list` shows zero GameLib-branded releases (D-00e), so no migration path exists to design | **CONFIRMED** |
| :1039 | `watch(legendaryInstalled, ...)` | plan 35-10 | **CONFIRMED** |
| :613 | `initQueue(true)` | plan 35-11 | **CONFIRMED** |
| :618 | `process.on('uncaughtException')` | **D-35-10-01, closed at `b26e3a61a`** — `installUncaughtExceptionGuard()` live in `processGuards.ts`, installed at module scope from `installRejectionGuard.ts`, +13 tests | **CONFIRMED** |
| :481/:483 | i18n `addPath`/`loadPath` under `publicDir/locales` | plan 35-04 bundled locales for `publicDir`; the sidecar reads from the same `publicDir` resolution | **CONFIRMED** |

### C1. Record correction found while confirming row `:618`

`deferred-items.md`'s `D-35-10-01` still reads **"Status: open, unowned, deadline wave 8"**, but the
guard is present in source and the item has its own `D-35-10-01-SUMMARY.md` marked `CLOSED`. The
**record is stale, the code is done** — verified against `src/backend/sidecar/processGuards.ts`, not
against the summary that claimed it. A verifier reading only `deferred-items.md` would wrongly block
this plan. Corrected as part of plan 35-14.

## D. Both shells build at this commit — the property the tag exists to preserve

Verified live, at `ee34b24b9`, **not inferred**:

| Shell | Command | Result |
|---|---|---|
| **Electron** | `pnpm start` (`electron-vite dev --watch`) | **Window reached.** Main process pid 55578; `System Events` reported a visible `Electron` process; log shows backend init through GOG presence, GPTK wine detection and Rosetta check |
| **Tauri** | `pnpm tauri:dev` | **Window reached.** Shell pid 55971 at 19:09:49; log shows tray seeding and `devtools opened for 'main' webview` |

They were run **sequentially, not concurrently** — both contend for
`gamelib-single-instance.sock`, so a parallel run would have produced a false failure for whichever
lost the race.

The Electron log carries a pre-existing `[Gog] Error getting login information … 404`. That is an
auth-state condition, not a build failure, and it does not bear on whether the shell builds.

**This is the last commit at which both of these are true.** That is exactly what
`pre-electron-cutover` marks.

## E. Correction to the plan: the tag remote

Plan 35-14 Task 1 says to push the tag to **`origin`** and verify with
`git ls-remote --tags origin`, with the constraint *"If the tag push fails, STOP."*

`origin` is **upstream Heroic** (`github.com/Heroic-Games-Launcher/HeroicGamesLauncher`) and is
**read-only for this project — push returns 403**. The fork, and the correct push target, is the
**`gamelib`** remote (`github.com/grayson-mitchell/GameLib`).

Followed literally, the plan's first task would fail its own stop condition at the point of no
return, having deleted nothing. The acceptance criterion is therefore read as **`gamelib`**
wherever it says `origin`. Confirmed with the developer before pushing.

## F. Verdict

**ZERO rows are `MISSING`.** The sidecar has no import edge into `main.ts`, all 136 registered
channels either survive elsewhere or are confirmed dead on the Tauri path, every named behaviour has
a successor verified against the successor itself, and both shells were observed reaching a window
at this commit. Cleared to tag and to proceed to Task 3.
