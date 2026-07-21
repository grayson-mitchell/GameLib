**Requirements:** REQ-27-01 .. REQ-27-06 (minted 2026-07-20 from this goal + spike blueprint)
**Plans:** 5 plans (planned 2026-07-20)

**Wave 1** — scaffold + transport contract (interface-first):

- [x] `27-01-PLAN.md` — Tauri v2 Rust shell scaffold + `sidecarTransport.ts` contract + build/dev scripts (`tauri:dev`, `build:sidecar`) + tauri-plugin-opener; Electron build untouched. Package-legitimacy checkpoint for Tauri npm/crates. (REQ-27-01, REQ-27-06)

**Wave 2** — sidecar + renderer bridge (parallel, zero file overlap):

- [x] `27-02-PLAN.md` — Sidecar bootstrap: pathShim + minimal file-backed store + electron-module stub installed before backend import; stdio JSON-RPC server; READY signal; headless-boot test. (REQ-27-02)
- [x] `27-03-PLAN.md` — Renderer bridge: attach `window.api` + 6 globals to the Tauri webview (guard `preload/index.ts` under `isTauri()` since contextBridge is Electron-only); re-point the 3 preload factories + the synchronous store-snapshot bridge (the 4th primitive) onto Tauri; hydrate snapshot before React mounts; headless contract test (0 electron symbols, 379 call-sites untouched). (REQ-27-03)

**Wave 3** — the two E2E flows:

- [x] `27-04-PLAN.md` — Wire only the 2–4 flow channels through the sidecar against the REAL store-manager code: read flow (`refreshLibrary` → steam-user → `pushGameToLibrary`) + action flow (`launch` → `shell.openExternal(steam://rungameid)` → Rust opener); integration test. (REQ-27-04, REQ-27-05)

**Wave 4** — live run + seam doc (checkpoint):

- [x] `27-05-PLAN.md` — `SEAM.md` ported-vs-stubbed boundary + incremental-port checklist; human-verify the native macOS dev build (window renders real UI, sidecar-populated Steam library, steam:// launch fires, Electron `npm start` still works). (REQ-27-06)
