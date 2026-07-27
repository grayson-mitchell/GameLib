# Tauri/Rust Rearchitecture — shell, sidecar, platform seam, frontend

Idea C: re-base GameLib from Electron+React+TS onto **Rust + Tauri v2**. This deliberately breaks
the locked "stay mergeable with Heroic upstream" constraint in CLAUDE.md — the user accepted the
divorce on 2026-07-20. Spikes 009–012 priced it; they did not find an idea-killer.

> **Status note (2026-07-27):** these four spikes ran 2026-07-20, *before* implementation started.
> Phases 27–34.x have since built much of this for real. Where a spike prediction has been
> superseded by shipped code, the shipped code wins — treat this file as the *why* behind the
> architecture, and the phase artifacts as the current state. The one spike claim that has been
> materially refined since is 011's `session` row → see `tauri-login-webview-cookies.md`.

## Requirements

- **Divorce accepted.** Loss of Heroic upstream merge is a chosen cost, not a blocker to design
  around.
- **Target shape = Tauri/Rust shell + Rust platform seam + bundled Node sidecar for business
  logic + the existing React UI.** NOT a Rust rewrite. (009)
- **Keep `steam-user` as a Node sidecar; do NOT rewrite the Steam CM/depot stack in Rust.** (010)
- **The platform seam is the real cost, and it is bounded and enumerated:** replace
  `electron-store` (20 files), re-plumb **220 IPC endpoints** (158 handlers + 62 listeners), port
  the 44-file lifecycle/dialog/tray/updater/protocol cluster. (009)

## How to Build It

### 1. Backend → Node sidecar (009)

80% of backend files (176/220) are Electron-free and port unchanged. The 20% seam clusters into
five groups: app lifecycle, IPC transport, persistence, UI shell, and `shell`/path calls sprinkled
into store managers.

**Import-time coupling is the sharp edge.** You cannot lazily shim your way in — two things run at
module-evaluation scope, before any `app.whenReady`:

```
electron.app.getPath(...)   // called at import scope by the constants modules
new Store(...)              // electron-store constructed at import scope
```

Under bare `node` the bundle faults on the first, and after shimming `app.getPath` it faults on the
second with *"You need to call `.initRenderer()` from the main process."* `electron-store` is
inseparable from Electron (it uses `app` + main↔renderer IPC internally) and must be **replaced
wholesale**, not shimmed.

**The probe technique** (reusable — see `sources/009-*/probe-electron-coupling.mjs`): hook
`Module._load` to return a **Proxy recorder** in place of `require('electron')`, then load the real
built bundle under bare `node`. The ordered touch-list plus the fault point is the evidence. Run two
variants — a *strict* recorder ("what breaks first") and a *tolerant* one that coerces to benign
values ("how deep does import-time coupling go"). The tolerant recorder reveals substantially more
surface.

> **Gotcha carried forward from live work:** Electron's `app.whenReady()` initialisers are **not**
> auto-run in the sidecar. Anything the Electron main process did at ready-time must be explicitly
> wired into sidecar bootstrap. This bit Phase 33 three times (notification capability crash,
> `initOnlineMonitor` never wired, `net.isOnline` stub missing).

### 2. Steam stays Node (010)

The differentiator already runs headless: `steam-user` 5.3.0 loads and instantiates in **341 ms**
under bare node, has **0 `require('electron')`**, and exposes `getOwnedApps` / `getProductInfo` /
`getRawManifest`. `@node-steam/vdf` works too. Verify with:

```bash
node -e "const S=require('steam-user');const u=new S();console.log(!!u.getRawManifest,!!u.getOwnedApps)"
grep -rl "require('electron')" node_modules/steam-user/   # -> (none)
```

So the only new cost for Steam is the sidecar plumbing the whole backend needs anyway. Spikes
001/002/003 (ACF adoption, byte-identical depot download, StateFlags=4) come along unchanged.

### 3. Platform seam → Tauri v2 plugins (011)

13 of 16 Electron main APIs have full Tauri v2 equivalents. The mapping, with use counts from 009:

| Electron API (uses) | Tauri v2 equivalent | Parity |
|---|---|---|
| `app` getPath/lifecycle/single-instance (×26) | `AppHandle` + `PathResolver` + `tauri-plugin-single-instance` | Full |
| `safeStorage` (×4) | OS Keychain via `keyring` crate | **Full — proven live** |
| `shell.openExternal` (×5) | `tauri-plugin-opener` (shells `/usr/bin/open`) | **Full — proven live** |
| `dialog` (×9) | `tauri-plugin-dialog` | Full |
| `BrowserWindow` (×7) | `WebviewWindow` (core) | Full |
| `Notification` (×3) | `tauri-plugin-notification` | Full |
| `Menu` (×2) / `Tray` (×1) | core `Menu` / `TrayIcon` | Full |
| `clipboard` (×1) | `tauri-plugin-clipboard-manager` | Full |
| `screen` (×2) | `available_monitors` / `primary_monitor` | Full |
| `protocol` (×1) | `register_uri_scheme_protocol` + `tauri-plugin-deep-link` | Full |
| `nativeImage` (×4) | `tauri::image::Image` / `image` crate | Full |
| `net` (×2) | `axios` in the Node sidecar | Full (trivial) |
| `session` (×2) | **see `tauri-login-webview-cookies.md`** | Partial — thinner, and the differences bite |
| `powerSaveBlocker` (×1) | no plugin; wrap `caffeinate`/`IOPMAssertion` | Gap (minor, 1 call site) |
| `ipcMain` / 220 endpoints | `#[command]` + `Channel`/events, or sidecar stdio | Full mechanism, large port |

**safeStorage → Keychain is proven byte-identical:** a 41-byte fake Steam refresh token round-tripped
through the macOS Keychain via the `keyring` crate (feature `apple-native`), which is the same
Security.framework store Electron's `safeStorage` uses on macOS.

> **Gotcha from live work (Phase 28):** a Keychain **Deny** surfaces as `PlatformFailure(-128)`, not
> `NoStorageAccess`. Self-owned keychain items never prompt.

### 4. Frontend → three factory functions (012)

The cheapest leg, inverting the usual worry. The renderer reaches the backend through **379
`window.api.*` call sites** but only **1 direct `ipcRenderer`** call. `src/preload/index.ts` does a
single `contextBridge.exposeInMainWorld('api', api)`, and the whole `window.api` surface is
generated by **three factory functions** in `src/preload/ipc.ts`:

```
makeHandlerInvoker(channel)   → ipcRenderer.invoke   (request/response)  → Tauri invoke / sidecar RPC
makeListenerCaller(channel)   → ipcRenderer.send     (fire-and-forget)   → command/emit
frontendListenerSlot(event)   → ipcRenderer.on       (backend→frontend)  → Tauri listen
```

Eight `ipcRenderer` calls total in preload. Rewrite those three factories and 379 call sites are
untouched. Proven live on a mock-Tauri transport with `electron_symbols_used: 0` — see
`sources/012-*/bridge-shim-demo.html`.

Bounded cleanup: **5 renderer files import `electron` directly**, bypassing the clean seam. Route
them through `window.api` or a shim.

## What to Avoid

- **Don't try to shim `electron-store`.** It throws at construction outside Electron. Replace it
  (tauri-plugin-store or a Rust-side store + adapter) across all 20 dependent files.
- **Don't assume the backend can be imported unmodified.** The seam files need real edits before the
  bundle boots headless — import-time coupling defeats lazy shimming.
- **Don't rewrite the Steam stack in Rust.** `steam-vent` 0.5.0 is auth-only and self-described as
  "early development, apis might see large changes." It has **no** PICS, depot, CDN, manifest, chunk,
  or depot-key support — exactly the surface spike 002 had to reverse-engineer (and found even the
  mature `steam-user` got wrong: truncated filenames, broken `downloadChunk`). A Rust port re-opens
  the hardest already-solved problem, in a less mature ecosystem, and re-requires byte-identical
  revalidation. Revisit only if steam-vent grows a content layer.
- **Don't treat `ipcMain` as a parity problem.** The mechanism has full parity; the cost is *volume*
  (220 endpoints), which is scheduling, not feasibility.
- **Don't claim the frontend port is "done" from 012.** What 012 proves is that the renderer↔backend
  *contract* survives the shell swap. It does not prove the whole app boots — that needs the full
  Vite build under a real Tauri shell.

## Constraints

- **Toolchain:** cargo/rustc are installed locally (1.94.x). Feasibility probes do **not** need the
  Tauri CLI — a bare `cargo` binary exercising the underlying OS facility is sufficient and cheaper.
  The project now has a real `src-tauri/` (tauri 2.11.5, wry 0.55.1) and `@tauri-apps/cli` as a
  devDependency.
- **`electron-store` → 20 files. IPC → 220 endpoints (158 handlers + 62 listeners;
  `AsyncIPCFunctions` ≈335 typed entries). Platform seam → 44 files, 16 distinct Electron APIs.**
- `powerSaveBlocker` and `session` have no first-class plugin.
- Rust-native Steam (`steam-vent` 0.5.0, Apr 2026) is experimental and auth-only.

## Origin

Synthesized from spikes: 009, 010, 011, 012 (run 2026-07-20).
Source files: `sources/009-node-backend-headless-sidecar/`, `sources/010-steam-user-rust-vs-sidecar/`,
`sources/011-electron-api-parity-in-tauri/`, `sources/012-react-frontend-under-tauri/`.
