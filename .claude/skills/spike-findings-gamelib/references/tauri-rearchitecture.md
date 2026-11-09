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
- **Native addons in the SEA sidecar are allowed, but only via `sea.getRawAsset()` + temp file +
  `process.dlopen()`, and only on a triple proven to load.** It works from inside a
  `new Worker(source, { eval: true })` worker in a real compiled SEA binary (10/10). Unproven
  triples keep the pure-JS fallback. (023)
- **Never locate a bundled package's files via `__dirname` at runtime** — esbuild flattens every
  bundled file's `__dirname` to the output file's own directory (`"."` in an eval'd worker).
  Resolve at build time into a generated data module. (023)

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

### 2a. Native `.node` addons inside the SEA sidecar (023)

The sidecar ships as a Node Single Executable Application, and its decompress workers are spawned
as `new Worker(source, { eval: true })` (there is no worker file on disk). Spike 023 proved a native
addon (`lzma-native@8.0.6`) loads there, in a **real** compiled SEA binary on darwin-arm64:
`isSea: true`, `dlopenFromEvalWorker: true`, sha1 match on a real 1 MiB Steam VZ chunk, 10/10 runs.

> **Reversal note.** Spike 002 recorded "`lzma-native` is optional; the no-native-modules
> constraint holds". 023 does not reverse "optional" (pure-JS stays the correct fallback), but it
> does establish that a native module CAN be packaged into the SEA — the constraint is now "native
> only where a triple is proven", not "no native modules".

Recipe (mirrors `meta/buildSidecarSea.ts`; see `sources/023-sea-native-addon-dlopen/build-sea.mjs`):

1. **Build time:** resolve the package root and the real prebuild filename, write them into
   `resolved-paths.generated.cjs` (gitignored, plain string literals).
2. esbuild-bundle the worker with `--alias:node-gyp-build=./binding-shim.cjs` (same mechanism as
   the existing `--alias:electron=…/electronStub.ts`). The shim must be CJS and
   `module.exports = function (dir) {…}` — `lzma-native` calls the module as a function.
3. `sea-config.json` `assets`: `{ "worker.js": …, "lzma_native.node": <path to node.napi.node> }`.
   The asset KEY is an arbitrary string; it does not need to match the on-disk filename.
4. `--experimental-sea-config` → darwin `codesign --remove-signature` → `postject … NODE_SEA_BLOB
   --sentinel-fuse …` (+ `--macho-segment-name NODE_SEA` on darwin) → `codesign --sign -`.

Runtime shim (core of `binding-shim.cjs`):

```js
const { LZMA_NATIVE_PKG_ROOT, NATIVE_NODE_FILENAME } = require('./resolved-paths.generated.cjs')
module.exports = function resolveNativeBinding(_dirIgnored) {   // `dir` is "." post-bundle — never use it
  let sea; try { sea = require('node:sea') } catch { sea = null }
  const m = { exports: {} }
  if (sea && sea.isSea()) {
    const p = path.join(os.tmpdir(), `lzma-native-sea-${process.pid}-${Date.now()}.node`)
    fs.writeFileSync(p, Buffer.from(sea.getRawAsset('lzma_native.node')))  // COPY: raw asset is the backing buffer
    process.dlopen(m, p)
  } else {
    process.dlopen(m, path.join(LZMA_NATIVE_PKG_ROOT, 'prebuilds',
      `${process.platform}-${process.arch}`, NATIVE_NODE_FILENAME))
  }
  return m.exports
}
```

Gotchas:

- **The prebuild is `node.napi.node`, not `lzma_native.node`.** Every triple also ships an
  `electron.napi.node` beside it — resolve the plain-Node one; the sidecar is not Electron.
  `win32-*` also ships a companion `liblzma.dll` that must travel with the `.node`.
- **`dlopen` once per worker lifetime**, not per decode: the extract + temp write + `dlopen` is
  most of the SEA path's overhead (SEA ~25–30 ms vs non-SEA ~15 ms per chunk in the spike, which
  re-did it every spawn).
- **Real speedup is ~5.8–6.6×, not the 47× synthetic estimate** (pure-JS ~87–99 ms vs native
  ~14–15 ms per 1 MiB real-game chunk). Cite the real number.
- **Only darwin-arm64 is proven.** linux-x64 / win32-x64 stay on the pure-JS `lzma` path
  (`DecompressPool`'s inline fallback) until CI proves the native load there.
- Package-legitimacy gate before any native install (human-approved: npm listing, repo match, no
  `postinstall`), and keep the existing per-chunk sha1/size integrity gate as the memory-safety
  backstop.

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
- **Don't resolve a native addon through `node-gyp-build`'s `dir` argument or any `__dirname`
  inside the bundle.** Post-bundle it is the outfile's directory, or `"."` in an eval'd worker.
  (023)
- **Don't assume the prebuild filename** (`lzma_native.node` does not exist on disk) and don't pick
  up `electron.napi.node` for a plain-Node sidecar. List `prebuilds/<triple>/` and record it. (023)
- **Don't write into `sea.getRawAsset()`'s buffer** — it is the raw backing store, not a copy;
  `Buffer.from(raw)` before writing it out. (023)
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
- SEA native-addon loading: proven on darwin-arm64 only, Node v26.2.0, `lzma-native@8.0.6`
  exact-pinned. linux-x64 / win32-x64 unverified. (023)

## Origin

Synthesized from spikes: 009, 010, 011, 012 (run 2026-07-20); 023 (SEA native addon `dlopen`,
Phase 23.1).
Source files: `sources/009-node-backend-headless-sidecar/`, `sources/010-steam-user-rust-vs-sidecar/`,
`sources/011-electron-api-parity-in-tauri/`, `sources/012-react-frontend-under-tauri/`,
`sources/023-sea-native-addon-dlopen/` (`build-sea.mjs`, `binding-shim.cjs`, `sea-main.cjs`).
