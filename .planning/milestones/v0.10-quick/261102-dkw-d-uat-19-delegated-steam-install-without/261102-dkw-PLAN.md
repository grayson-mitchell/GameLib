---
quick_id: 261102-dkw
type: quick
todo: .planning/todos/pending/2026-11-02-d-uat-19-delegated-steam-install-without-client.md
---

# D-UAT-19: delegated steam:// install with no Steam client

With native install OFF and no Steam client, Install handed off to `steam://install/<id>`: Windows
showed a bare "application not found" error, every sidecar invoke stalled ~60 s behind it, and a
phantom "Finished Installation" left the game "installing" for ~30 min.

## Root causes

1. `SteamGame.install()`'s delegated branch never calls `ensureSteamClientReady`, so the D-10/D-11
   guided setup the native path shows is skipped, and a poller starts for a hand-off that can't run.
2. `src-tauri/src/main.rs` handles the sidecar's fire-and-forget `openExternal` frame by calling
   `app.opener().open_url` inline in the sidecar-stdout reader loop. On Windows that call blocks
   while the OS "no handler" dialog is up, so no invoke response is read until it is dismissed.
3. The setting's help text describes OFF in Mac-only terms.

## Task 1: gate the delegated branch on the client (backend)

- files: `src/backend/storeManagers/steam/games.ts`, `src/backend/storeManagers/steam/__tests__/games.test.ts`
- action: before building the URL, `await ensureSteamClientReady(this.appId)`. `needs-install` /
  `needs-launch` with no `error` → log + `{ status: 'done', deferredToSetup: true }` (no
  openExternal, no poller, no finished entry — same contract as the native path). A reported
  `error` → `{ status: 'error' }`. `ready` → unchanged steam:// path. Tests: GAME-02 defaults the
  mock to ready; new cases for needs-install, needs-launch and error.
- verify: targeted jest on games.test.ts (+ any suite that exercises the delegated path);
  `npx prettier --check` on both files.

## Task 2: open URLs off the reader loop (shell)

- files: `src-tauri/src/main.rs`
- action: run `open_url` for the `openExternal` frame on a spawned thread (as `rustInvoke`
  already does), so a blocking OS dialog never parks invoke responses.
- verify: `cargo check` in src-tauri; prettier n/a (Rust).

## Task 3: platform-correct help text

- files: `src/frontend/screens/Settings/components/EnableSteamNativeInstall.tsx`,
  `public/locales/en/translation.json`
- action: keep the Mac wording under `help.steam_native_install` on darwin; add
  `help.steam_native_install_other` for Windows/Linux: "... When off, installs are handed to the
  Steam client."
- verify: hardcodedStringGate test; `npx prettier --check` on both files.

## Live gate

Windows: native install OFF, empty Default Steam path, Install → D-10 consent dialog (no Windows
error, no stall, no stuck "installing").
