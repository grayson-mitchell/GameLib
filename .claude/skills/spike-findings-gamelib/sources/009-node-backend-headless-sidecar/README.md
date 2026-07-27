---
spike: 009
name: node-backend-headless-sidecar
type: standard
validates: "Given a real slice of GameLib's backend, when run under plain node with electron absent (as a Tauri sidecar forces), then observe which Electron-main APIs it hard-depends on — bounding the port"
verdict: PARTIAL
related: [010, 011, 012]
tags: [tauri, rust, backend, electron, sidecar]
---

# Spike 009: Can the Node backend run headless as a Tauri sidecar?

> Part of **Idea C — Rust/Tauri rearchitecture** (divorce-from-Heroic feasibility). The
> idea-decider: if GameLib's 47k-LOC Node backend can run as a **Tauri sidecar** (bundle Node,
> drive it from Rust), the rearchitecture is "swap the shell, keep the guts." If it's welded to the
> Electron runtime, it's a ground-up rewrite. Run live 2026-07-20.

## What This Validates

**Given** the real built backend bundle (`build/main/main.js`), **when** it is loaded under plain
`node` with the `electron` module replaced by a recording stub (exactly what a Tauri sidecar or any
non-Electron host sees — Electron's main APIs do not exist outside the Electron runtime), **then**
we observe precisely which Electron-main APIs it touches, in what order, and where it faults.

## How to Run

```bash
node probe-electron-coupling.mjs   # strict stub — records first touches, faults fast
node probe-deep.mjs                # tolerant stub — coerces to benign values, evaluates further
```

Both hook `Module._load` to return an electron **Proxy** that records every property access /
call, then let the real bundle evaluate. Strict = "what breaks first"; tolerant = "how deep does
the import-time coupling go once app.getPath is satisfied."

## What to Expect

The backend faults at **module-evaluation time** (before any `app.whenReady`), because Heroic's
constants modules call `app.getPath(...)` at import scope and `electron-store` is constructed at
import scope. Concrete observable outputs: `probe.result.json`, `probe-deep.result.json`.

## Investigation Trail

1. **Static surface map.** 44 of 220 backend source files import from `electron` (16 distinct main
   APIs, ranked): `app` ×26, `dialog` ×9, `BrowserWindow` ×7, `shell` ×5, `safeStorage` ×4,
   `nativeImage` ×4, `Notification` ×3, `session`/`screen`/`net`/`Menu` ×2, then
   `protocol`/`powerSaveBlocker`/`clipboard`/`Tray`/`ipcMain` ×1. The renderer↔backend contract is
   **220 IPC endpoints** (158 `addHandler` + 62 `addListener`; `AsyncIPCFunctions` ≈335 typed
   entries).
2. **Strict headless probe.** Loading `build/main/main.js` under bare node faults immediately. First
   touches: `electron.app.getPath()` — called at **import scope** (constants). A bare Node/sidecar
   process has no `app`, so the backend cannot even be *imported* as-is.
3. **Tolerant headless probe.** After shimming `app.getPath` to return a temp path, evaluation gets
   further and hits the **next hard wall**: `electron-store` throws at construction —
   *"You need to call `.initRenderer()` from the main process."* `electron-store` is inseparable
   from Electron (it uses `app` + main↔renderer IPC internally). GameLib's persistence layer
   (`electron_store.ts`, depended on by **20 files**) therefore cannot run in a Node sidecar; it
   must be **replaced wholesale** (e.g. `tauri-plugin-store` or a Rust-side store), not shimmed.
4. **Coupling concentration.** 176/220 files (**80%**) are Electron-free and port to a Node sidecar
   unchanged. The 44 coupled files cluster at a well-defined **platform seam**: app lifecycle
   (`main.ts`, `main_window.ts`, `tray_icon`, `updater`, `protocol`, `online_monitor`), IPC
   transport (`ipc.ts`, `utils/ipc_handler.ts`), persistence (`electron-store`, `secureKey`), UI
   shell (`dialog`, `tray_icon`), and `shell`/path calls sprinkled into store managers.

## Results

**Verdict: PARTIAL — a Node sidecar is viable, but NOT untouched.** The backend is *not* a
monolithic Electron blob (good) and it is *not* trivially portable (the "keep the guts unchanged"
dream is false).

- ✓ **80% of backend files are Electron-free business logic** — the store managers' core
  (legendary/gogdl/nile subprocess drivers, `steam-user` depot work, download manager) is portable
  to a bundled-Node sidecar as-is.
- ✗ **The persistence layer must be rewritten.** `electron-store` is inseparable from Electron;
  20 files route through it. Swap for a Tauri/Rust store + adapter.
- ✗ **The entire IPC transport (220 endpoints) must be re-plumbed** from Electron `ipcMain`/
  `ipcRenderer` onto a sidecar protocol (stdio/localhost/Tauri command bridge). The *handlers* are
  reusable; the *transport* is not.
- ✗ **App lifecycle / paths / dialog / tray / updater / protocol** (the 44-file seam) need Tauri
  equivalents (→ spike 011).
- ⚠ **Import-time coupling is the sharp edge.** Because `app.getPath` and `electron-store` run at
  module load, you can't lazily shim your way in; the seam files need real edits before the bundle
  will even boot headless.

**Honest scope:** this is a **bounded platform-seam rewrite (~20% of files) + a full IPC-transport
re-plumb**, sitting on top of 80% reusable logic — materially cheaper than a ground-up rewrite of
47k LOC, but far more than "wrap it in Tauri." It does NOT by itself kill Idea C; it prices it.

**Impact on siblings:** confirms 011 (electron-api-parity) is mandatory, not optional — the seam is
real and enumerated here. Raises the stakes on 010: if `steam-user` *also* can't come along, the
"80% reusable" figure drops sharply, because Steam is GameLib's whole reason to exist.
