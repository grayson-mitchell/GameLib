---
status: awaiting_human_verify
trigger: "Cold-start gamelib:// launch reports an installed game as \"not installed\", plus untranslated dialog buttons."
created: 2026-11-08
updated: 2026-11-08
---

# Debug: cold-start gamelib:// link says installed game is not installed

## Symptoms

DATA_START
- **Expected:** With GameLib quit, launching an installed game from its 'Add games to Steam' shortcut starts the game (GameLib stays hidden — quick 261108-kpc default).
- **Actual:** Native dialog "Bloody Hell Is Not Installed, do you wish to Install it?" with buttons rendered as raw keys `box.yes` / `box.no`. Answering No → `--no-gui` path quits GameLib; the game never starts.
- **Errors / logs:**
  - Shell log `~/Library/Logs/GameLib/gamelib-shell.log` ~L9122: `forward_args=["--no-gui", "gamelib://launch?appName=1542190742&runner=gog"]` (cold start via argv, not on_open_url).
  - Sidecar log `~/Library/Logs/GameLib/gamelib.log.old`:
    - 15:36:06 `[bootstrap] startup protocol URL present`
    - 15:36:06 `[ProtocolHandler] Received gamelib://launch?appName=1542190742&runner=gog`
    - 15:36:06 `[ProtocolHandler] "Bloody Hell" not installed.`
    - 15:36:06 `[Gog] Running command: ... gogdl ... auth` (GOG library init only starting)
    - 15:37:26 `[ProtocolHandler] Not installing game` / `--no-gui flag detected, exiting app`
  - Game IS installed: `/Users/graysonmitchell/Games/GameLib/Bloody Hell`; launched fine from the library at 15:34 (`~/Library/Logs/GameLib/games/1542190742_gog/launch.log`).
  - Unrelated noise in the same run: keyring_get timed out after 45s (dev binary launched directly by Steam skips the dev-vault flag) — not the cause.
- **Timeline:** Found in UAT of quick 261108-kpc on 2026-11-08. Startup delivery (`deliverStartupProtocolUrl`) predates that task; likely broken since the Tauri rearchitecture (old Electron main.ts ordering is gone).
- **Reproduction:** macOS dev build. Quit GameLib. In Steam, play a non-Steam shortcut created by 'Add games to Steam' for an installed GOG game.
DATA_END

## Hypotheses (from orchestrator)

1. **(strong)** `src/backend/sidecar/bootstrap.ts` `deliverStartupProtocolUrl` (~L317-330) calls `handleProtocol(argv)` at boot before store libraries / installed state are initialised, so `findGame()` / `is_installed` in `src/backend/protocol.ts` `handleLaunch` reads empty/stale state. Fix: defer startup-link handling until installed state is loaded for the relevant runner — use an existing init/ready promise or signal, no fixed sleep. Warm path (on_open_url → handleProtocolUrl) must be unaffected. Check every runner (gog, legendary, nile, sideload, steam) for where `is_installed` comes from at boot.
2. `src/backend/protocol.ts:240` uses `i18next.t('box.yes')` / `('box.no')` with no default while sidecar i18n resources aren't loaded. Precedent: `utils.ts:293` uses `tOrFallback('box.no', 'No')`. Same gap at `utils.ts:363` and `utils.ts:1070` — fix all three.

## Constraints

- Do not regress quick 261108-kpc cold-start window-hide logic in protocol.ts (`markFrontendReady` / 15s rule).
- Another Claude session commits Phase 72 work to main concurrently: check `git status --short <file>` before editing shared files; stage only own paths by explicit path; verify `git show --stat HEAD` after each commit.
- CLAUDE.md conventions: fake-HOME isolation (`createFakeHomeProfile()`) for any child-process tests; scoped `npx prettier --check` over written paths (zsh: list paths literally).
- Regression tests required: startup link waits for installed state; dialog buttons fall back to English.
- Known pre-existing test failures on main (not yours): genI18nGateScope A-17, gamelibCatalogParity (sl), rustTestWorkflow clippy-ratchet, logSecretGate, x86CallbackWineHarness, tauriShellSource (STORE_EMBED title gate), macArchKnownFixRouting (Intel).

## Current Focus

- hypothesis: 1 (confirmed) and 2 (confirmed)
- next_action: operator live re-test — restart `pnpm tauri:dev` (check sidecar.js mtime), quit GameLib, play the Bloody Hell Steam shortcut; expect the game to launch, GameLib hidden, no dialog

## Evidence

## Eliminated

## Resolution

- root_cause: (1) A cold-start `gamelib://launch` ran `handleLaunch` before any library refresh had filled the runners' in-memory installed maps. `initStoreManagers()` is not called under Tauri; only the renderer-driven `refreshLibrary` RPC populates them (~80s after boot in this run). GOG `installedGames` was empty, so the title resolved from `libraryStore` with `is_installed` false. Legendary has the same gap; nile, steam and sideload needed no change. (2) `protocol.ts` and two `utils.ts` dialogs called `i18next.t('box.yes'/'box.no')` with no fallback while sidecar i18n is not loaded on cold start.
- fix: 146f608b1. `loadInstalledStateFromDisk(runner?)` in protocol.ts (gog `refreshInstalled()`; legendary `loadGamesInAccount()` + `refreshInstalled()`), awaited only when `isColdStartLink()` before `findGame`. Warm path and the 261108-kpc window-hide logic unchanged. `tOrFallback` moved to new `src/backend/i18nFallback.ts` and used at all three dialog sites.
- verification: protocol.test.ts 41/41 (3 new tests fail against the old protocol.ts); protocol + bootstrapWirings 59/59 re-run by orchestrator; codecheck clean; scoped prettier clean; eslint 0 errors. Live re-test pending.
- files_changed: src/backend/protocol.ts, src/backend/i18nFallback.ts, src/backend/utils.ts, src/backend/__tests__/protocol.test.ts
- not_covered: sideload links through `findGame` (sideload has no `getGameInfo`) — separate gap, left alone.
