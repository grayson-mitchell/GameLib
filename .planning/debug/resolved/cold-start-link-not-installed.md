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

## Live re-test 2026-11-08 (operator, UAT test 4: install folder renamed, cold-start Steam shortcut)

DATA_START
- Native "Game folder appears to be deleted…" alert appeared while GameLib was hidden. Buttons read Yes/No → hypothesis 2 fix CONFIRMED live.
- GameLib window did not come forward (a macOS keychain password prompt was also up — dev binary launched directly by Steam skips the dev-vault flag). The native alert itself was visible, so the user was not left blind.
- Operator answered No. Alert closed, nothing else happened. Steam's button stayed on [Stop]: the GameLib process Steam launched kept running hidden.
DATA_END

### New defect (hypothesis 3)

A `--no-gui` (shortcut) launch that ends WITHOUT the game running leaves GameLib alive, so Steam believes the "game" is still running. The normal path exits after the game closes (`launcher.ts:405` `if (isCLINoGui) app.exit()`), but early returns skip it: the missing-folder abort (`launcher.ts:~132-144`, returns `{status:'abort'}` after `askForceUninstall`), and any other abort/error return in `runLaunchEventCallback`, plus the Steam dispatch branch in `protocol.ts` handleLaunch. `app.quit()/exit()` DO forward to Rust (RUST_APP_EXIT, platform/index.ts:315-340) — verified real.

Wanted rule (orchestrator-approved direction): for an `isCLINoGui` link launch that finishes without a game session —
- if GameLib only showed native/awaited prompts (e.g. askForceUninstall, the not-installed prompt, the link-args confirmation) and the main window is still hidden-by-GameLib → exit after the prompt resolves, so Steam's button returns to Play;
- if an in-app error dialog raised the window (raiseMainWindowIfHiddenByGameLib fired during this launch) → stay open so the user can read it; closing GameLib then ends Steam's session.
Implement at the narrowest point covering ALL early returns (e.g. one wrapper around the link launch in protocol.ts handleLaunch, or a finally in runLaunchEventCallback), without double-exiting on the normal path. Regression tests: abort with --no-gui and window still hidden → exit called; error that raised the window → exit NOT called; normal completion unchanged.

## Current Focus

- hypothesis: 3 (1 and 2 confirmed; 2 confirmed live)
- next_action: fix hypothesis 3 per the rule above, then operator re-test (UAT 1 and 4)

## Evidence

## Eliminated

## Resolution

- root_cause: (1) A cold-start `gamelib://launch` ran `handleLaunch` before any library refresh had filled the runners' in-memory installed maps. `initStoreManagers()` is not called under Tauri; only the renderer-driven `refreshLibrary` RPC populates them (~80s after boot in this run). GOG `installedGames` was empty, so the title resolved from `libraryStore` with `is_installed` false. Legendary has the same gap; nile, steam and sideload needed no change. (2) `protocol.ts` and two `utils.ts` dialogs called `i18next.t('box.yes'/'box.no')` with no fallback while sidecar i18n is not loaded on cold start.
- fix: 146f608b1. `loadInstalledStateFromDisk(runner?)` in protocol.ts (gog `refreshInstalled()`; legendary `loadGamesInAccount()` + `refreshInstalled()`), awaited only when `isColdStartLink()` before `findGame`. Warm path and the 261108-kpc window-hide logic unchanged. `tOrFallback` moved to new `src/backend/i18nFallback.ts` and used at all three dialog sites.
- verification: protocol.test.ts 41/41 (3 new tests fail against the old protocol.ts); protocol + bootstrapWirings 59/59 re-run by orchestrator; codecheck clean; scoped prettier clean; eslint 0 errors. Live re-test pending.
- files_changed: src/backend/protocol.ts, src/backend/i18nFallback.ts, src/backend/utils.ts, src/backend/__tests__/protocol.test.ts
- not_covered: sideload links through `findGame` (sideload has no `getGameInfo`) — separate gap, left alone.

### Hypothesis 3 resolution

- root_cause: A `--no-gui` link launch that ended without a game session never reached launcher.ts's `if (isCLINoGui) app.exit()` (aborted missing-folder prompt, declined prompts, Steam dispatch, no appName/game-not-found, thrown error), so GameLib stayed alive hidden and Steam stayed on Stop.
- fix: 401e1efaf. `handleLaunchEndingNoGui` wraps handleLaunch in protocol.ts: for isCLINoGui, any result other than 'done' (launcher already exited) or 'installing' (user chose install) calls app.quit(), unless an in-app dialog re-showed the hidden window during the launch. That signal is new: `app.raiseMainWindowForInAppDialog()` / `app.inAppDialogRaiseCount()` in platform/index.ts, used by dialog.ts showDialogBoxModalAuto. Native awaited prompts (showMessageBox/showErrorBox) also raise the window but do not count. The two inline `if (isCLINoGui) app.quit()` calls were removed (wrapper covers them).
- tests: protocol.test.ts 46/46 (5 new: abort+hidden quits, thrown error quits, in-app dialog stays, done not double-exited, non-no-gui abort stays; 2 old expectations updated to the new exit behavior); mainWindowVisibility counter test; platform+protocol+dialog 75/75; tsc clean; eslint 0 errors; prettier clean.
- live re-test pending: restart pnpm tauri:dev, UAT 1 and 4.
