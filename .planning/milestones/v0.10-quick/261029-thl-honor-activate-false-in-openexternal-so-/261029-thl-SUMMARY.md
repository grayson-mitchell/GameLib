---
phase: quick-261029-thl
plan: 01
status: complete
---

# Quick 261029-thl: Honor activate:false in shell.openExternal

On macOS, `shell.openExternal(steamUrl, { activate: false })` now spawns a detached `/usr/bin/open -g` from the sidecar (steam: scheme only, transport bound). Steam Refresh's go-offline passes `{ activate: false }`. Rust `open_external` and its allowlist are untouched.

Commit: see git log (`fix(quick-261029-thl)`). Tasks 1 and 2 were committed together because both touch macSteamOffline.ts and the same test file.

Files: src/backend/platform/openDetached.ts (new), platform/index.ts, platform/__tests__/openExternalBackground.test.ts (new), storeManagers/steam/macSteamOffline.ts.

Verification: 7 suites / 588 tests pass (incl. fakeHomeIsolation, bootstrap, games, macSteamOffline*); `tsc --noEmit` clean; prettier clean; single `/usr/bin/open` spawn site (openDetached.ts); `git diff --stat src-tauri` empty.

Deviations: none.

## Human live-test UAT (macOS)
1. `tauri dev` does NOT rebuild the sidecar: run `pnpm build:sidecar-sea` (or restart dev) and confirm sidecar.js mtime is newer than this change.
2. With Mac Steam open, visible, not minimised, sign in to Steam in GameLib and click Refresh. Expected: Steam goes offline and back online without being raised. Steam may still self-raise on `steam://open/gooffline`; that is Steam-side, not a regression.
3. Launch a Steam game from GameLib (rungameid) and confirm Steam's window is not activated.
