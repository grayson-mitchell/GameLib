# Phase 35: Electron cutover — remove the Electron build - Pattern Map

**Mapped:** 2026-08-28
**Files analyzed:** 3 genuinely-new files/modules (backend/platform, Rust tray/deep-link/wake-lock, vite.config.ts) + 6 mechanical/collision hotspots + 1 deleted UI surface. This phase is ~95% deletion/mechanical rewrite across 67+ files, not new construction — see `## The 67-File Mechanical Rewrite` for why those are NOT enumerated individually.
**Analogs found:** 10 / 10 named targets (every genuinely-new file has a same-repo analog; nothing needed an external/RESEARCH.md-only pattern)

**Read this alongside 35-RESEARCH.md.** This file gives concrete excerpts; RESEARCH.md gives the reasoning and the four discretion-decision resolutions. Two corrections RESEARCH.md already made are load-bearing here and repeated below so a planner reading only this file doesn't miss them: (1) the esbuild `--alias:electron=` literal exists in exactly **one** place, not three; (2) `electron-store` has **ten** real import/require sites, not two.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/backend/platform/index.ts` (NEW, replaces `electronStub.ts`) | service (facade module) | request-response (RPC forward to Rust) | `src/backend/sidecar/electronStub.ts` (itself — being renamed/reshaped, not rebuilt) | exact |
| `src-tauri/src/tray.rs` (NEW, or an extended in-`main.rs` block) | Rust shell module | event-driven (menu-click callbacks) | `main.rs:6069-6137` — the **existing** bounded tray implementation (Phase 34.1 Plan 06) | exact — this is an EXTENSION target, not a from-scratch build |
| `src-tauri/src/deep_link.rs` (NEW, or extended in-`main.rs`) | Rust shell module | event-driven (OS URL-open callback) | `main.rs:5347-5470` (`protocol_url_arg` + single-instance argv plumbing, Phase 34.5 gap cycle 6 plan 44) | exact — the argv-validation/routing half already exists; only OS-level registration (`tauri-plugin-deep-link`) is net-new |
| `src-tauri/src/wake_lock.rs` (NEW) | Rust shell module | request-response (IPC command, native syscall) | No existing Rust analog for a bare OS-syscall wrapper; closest shape is the `.invoke_handler(tauri::generate_handler![...])` command pattern at `main.rs:6317-6322` | role-match — the *command registration* pattern has an analog; the *native binding itself* does not (see `## No Analog Found`) |
| `vite.config.ts` (NEW) | config | build (bundler config) | `electron.vite.config.ts`'s `renderer:` block, lines 60-101 | exact — CONTEXT.md/RESEARCH.md's own characterization confirmed byte-for-byte in this pass |
| `src/backend/electron_store.ts` → `conf`-backed rewrite | service (store wrapper) | CRUD | itself, pre-rewrite (same file, same call shape) | exact |
| `src/backend/cache.ts` → `conf`-backed rewrite | service | CRUD | `src/backend/electron_store.ts` (sibling `electron-store` consumer, same construction shape) | exact |
| `src/preload/api/misc.ts` (SECRET_STORE_KEYS deletion + lazy-require collapse) | middleware (security boundary) + service | request-response | `src/common/types/storePolicy.ts` (the allow-list it must be fully subsumed by) | exact — this is a delete-into-existing-analog, not a build |
| `src/frontend/screens/Settings/components/TraySettings.tsx` (DELETE) | component | request-response (settings read/write) | `src/frontend/screens/Settings/components/index.ts` (barrel) + `GeneralSettings/index.tsx` (consumer) — these are the two OTHER places the deletion must also touch | exact |
| 67 files under `src/backend/` with `from 'electron'` | mixed (backend logic, unchanged) | mixed | `src/backend/protocol.ts:1` (representative: two named imports, no other change) | exact, mechanical |

---

## Pattern Assignments

### `src/backend/platform/index.ts` (service/facade — replaces `electronStub.ts`)

**Analog:** `src/backend/sidecar/electronStub.ts` itself (817 lines). D-02 is explicit: this is a rename/reshape of the existing file, not a rebuild — "no behavior moves." Read the whole file before starting; every excerpt below is a section that must survive the move.

**Header/provenance comment pattern** (lines 1-30) — **carry this comment forward, updated for the new module path**, not deleted. It documents *why* each API surface is real vs. stub, which is exactly the context a future maintainer needs and which D-02's "carry rationale forward" rule (RESEARCH.md's Established Patterns) requires:
```typescript
/**
 * Electron-module replacement for the headless sidecar (Phase 27 Plan 02 —
 * Task 1).
 * ...
 * Real window/tray/menu/protocol management is explicitly OUT of scope for
 * the skeleton (27-CONTEXT) — these are safe no-op stand-ins, not
 * reimplementations. Only `app.getPath` ..., `ipcMain` ...,
 * `shell.openExternal` ..., `BrowserWindow.getAllWindows()` ..., and
 * `dialog.showOpenDialog` ... have real behavior — everything else only
 * needs to not throw at import time.
 */
```

**Transport-binding pattern** (lines 87-108) — the circular-import-avoidance seam; unchanged:
```typescript
export interface ElectronStubTransport {
  openExternal: (url: string) => void
  pushFrontendMessage: (channel: string, ...args: unknown[]) => void
}
let transport: ElectronStubTransport | null = null
export function bindTransport(next: ElectronStubTransport): void {
  transport = next
}
```

**`ipcMain` registry pattern** (lines 110-130) — the two Maps every handler-registration flow file (`*FlowRegistration.ts`, dozens of them) depends on:
```typescript
export type IpcHandler = (event: unknown, ...args: unknown[]) => unknown
export type IpcListener = (event: unknown, ...args: unknown[]) => void
export const handlerRegistry = new Map<string, IpcHandler>()
export const listenerRegistry = new Map<string, IpcListener[]>()
export const ipcMain = {
  handle(channel: string, handler: IpcHandler): void { handlerRegistry.set(channel, handler) },
  removeHandler(channel: string): void { handlerRegistry.delete(channel) },
  on(channel: string, listener: IpcListener): void { /* ... */ }
}
```

**`app.isPackaged`/`app.getAppPath` pattern** (lines 203-228) — **this is D-14's exact edit site.** Today:
```typescript
export const app = {
  getPath,
  getName: (): string => 'GameLib',
  setName: (): void => {},
  isPackaged: false,   // <-- D-14: replace with a delegating getter, see below
  getAppPath: (): string => process.env.GAMELIB_APP_ROOT || process.cwd(),
  getVersion: (): string => pkgJson.version ?? '0.0.0',
  ...
}
```
D-14's target shape (RESEARCH.md Pattern 3, confirmed compatible with this exact object-literal structure — `isPackaged` becomes a getter, everything else unchanged):
```typescript
import { isPackagedSidecar } from './isPackagedSidecar' // moved from humbleFlowRegistration.ts
export const app = {
  getPath,
  getName: (): string => 'GameLib',
  setName: (): void => {},
  get isPackaged(): boolean { return isPackagedSidecar() },
  getAppPath: (): string => process.env.GAMELIB_APP_ROOT || process.cwd(),
  ...
}
```

**`Menu`/`protocol`/`powerSaveBlocker`/`clipboard`/`Tray` block** (lines 757-817) — the five D-05/D-06/D-07/D-08 touch points, all in one contiguous region:
```typescript
export const Menu = {
  buildFromTemplate: () => ({}),
  setApplicationMenu: (): void => {}
}
export const protocol = {
  registerFileProtocol: (): void => {},
  registerHttpProtocol: (): void => {},
  handle: (): void => {}
}
// D-08: accepted no-op ... revisit at the Phase 35 cutover.
export const powerSaveBlocker = {
  start: (): number => {
    console.warn('[electronStub] powerSaveBlocker.start(): logged no-op (D-08, accepted gap) ...')
    return -1
  },
  stop: (): void => {},
  isStarted: (): boolean => false
}
export const clipboard = {
  writeText: (text: string): void => { requestRustInvoke(RUST_CLIPBOARD_WRITE_TEXT, [text]).catch(...) },
  readText: (): string => ''  // D-04: DELIBERATELY DEAD, see file's own comment
}
export class Tray {
  constructor(_icon?: unknown) {}
  setToolTip(): void {}
  setContextMenu(): void {}
  on(): this { return this }
}
```
`Menu`/`protocol`/`Tray` here are the **electron-compat shim shapes**, not the real Tauri implementations — D-06/D-07 build real Rust-side tray/deep-link (see below); these JS-side exports either become dead (nothing imports `Menu`/`Tray` once `tray_icon.ts` is deleted per D-06) or stay as thin IPC forwarders if any backend code still constructs a menu template for the Rust side to render. **Confirm at plan time whether `tray_icon.ts`'s `Menu.buildFromTemplate`/`Tray` calls survive as IPC-forwarding shims or are deleted outright** — RESEARCH.md's recommendation (route tray clicks via a direct sidecar IPC message, not through the deep-link plugin) suggests `Tray`/`Menu` here become dead exports once `tray_icon.ts` itself is deleted.

**getPath/pathShim carries over unchanged** — `src/backend/sidecar/pathShim.ts` (separate file, imported by `electronStub.ts` line 39) is NOT part of the 22-export rewrite; it's a dependency of `backend/platform` and needs no changes for D-01/D-02, only for D-04's `conf` `cwd` wiring (see below). Confirmed shape (resolves `'userData'` → `~/Library/Application Support/GameLib` on macOS, `%APPDATA%/GameLib` on Windows, `$XDG_CONFIG_HOME/GameLib` on Linux):
```typescript
const APP_NAME_SEGMENT = 'GameLib'
function resolveAppDataDir(): string {
  switch (platform) {
    case 'darwin': return join(homedir(), 'Library', 'Application Support')
    case 'win32': return env.APPDATA || join(homedir(), 'AppData', 'Roaming')
    default: return env.XDG_CONFIG_HOME || join(homedir(), '.config')
  }
}
export function getPath(name: string): string {
  switch (name) {
    case 'appData': return resolveAppDataDir()
    case 'userData': return join(resolveAppDataDir(), APP_NAME_SEGMENT)
    ...
  }
}
```
This **resolves RESEARCH.md's Open Question #2**: `getPath('userData')` already exists, already resolves per-OS, and already matches "the same OS conventions Electron itself uses" per its own docstring. D-04's `conf` constructor should pass `cwd: app.getPath('userData')` (or the module's raw `getPath('userData')` call) explicitly — no new path-derivation code needed, and no relocation risk for existing developer settings.

---

### `src-tauri/src/tray.rs` (or extended in-`main.rs` block) — Rust shell, tray icon (D-06)

**Analog:** `main.rs:6069-6137` — a real, already-shipped, bounded Tauri v2 tray implementation (Phase 34.1 Plan 06). **This is not a from-scratch build** — D-06's work is *extending* this exact block, not writing a `TrayIconBuilder` call for the first time. `src-tauri/src/` containing only `main.rs` (confirmed: `ls src-tauri/src/` → `main.rs` alone) means there is no *module-split* precedent, but there IS a working *tray* precedent to extend in place.

**Current bounded scope** (its own comment states this precisely — "tooltip, left-click show/focus, and a two-item Show GameLib / Quit menu. Deliberately excludes the recent-games submenu, About/Reload/Debug, the macOS dock menu, and language-driven rebuilds"):
```rust
match (
    MenuItemBuilder::with_id("show", "Show GameLib").build(app),
    MenuItemBuilder::with_id("quit", "Quit").build(app),
) {
    (Ok(show_item), Ok(quit_item)) => {
        match MenuBuilder::new(app).items(&[&show_item, &quit_item]).build() {
            Ok(menu) => {
                let tray = TrayIconBuilder::with_id(TRAY_ICON_ID)
                    .icon(tray_image(false))
                    .icon_as_template(tray_is_template())
                    .tooltip("GameLib")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app_handle, event| match event.id().as_ref() {
                        "show" => { /* show + focus main window */ }
                        "quit" => app_handle.exit(0),
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| { /* left-click -> show+focus */ })
                    .build(app);
                if let Err(e) = tray {
                    eprintln!("[shell] WARN: tray icon failed to build ({e}) -- continuing without a tray");
                }
            }
            Err(e) => eprintln!("[shell] WARN: tray menu failed to build ({e}) -- continuing without a tray"),
        }
    }
    _ => eprintln!("[shell] WARN: tray menu items failed to build -- continuing without a tray"),
}
```
**Non-fatal-by-design discipline (T-34.1-22)** is the load-bearing convention to preserve when extending this: every menu-item/menu/tray build failure is logged and swallowed, never `unwrap()`/`panic!` out of `.setup()` — "a tray that fails to build is strictly better than a shell that fails to start." Any recent-games submenu / About item added for D-06 must follow this same non-fatal pattern.

**The D-06/D-07 coupling, concretely:** `src/backend/tray_icon/tray_icon.ts:107` (Electron-side, being deleted) currently does:
```typescript
const recentsMenu = recentGames.map((game) => ({
  click: function () { handleProtocol([`gamelib://launch?appName=${game.appName}`]) },
  label: game.title
}))
```
RESEARCH.md's recommendation (adopt over routing through the OS-level deep-link plugin): the Rust tray's recent-games menu-click handler should send an IPC message directly to the sidecar (mirroring the existing `"show"`/`"quit"` arms' `app_handle`-scoped dispatch above), not synthesize a `gamelib://` URL and round-trip it through `tauri-plugin-deep-link`.

**Cargo.toml — no new dependency needed for the tray core itself:**
```toml
tauri = { version = "2", features = ["tray-icon", "image-png", "unstable"] }
```
(already present, confirmed) — only new Rust code, not a new crate.

---

### `src-tauri/src/deep_link.rs` (or extended in-`main.rs`) — Rust shell, `gamelib://` (D-07)

**Analog:** `main.rs:5347-5470` (`protocol_url_arg` and friends, Phase 34.5 gap cycle 6 plan 44) — **the URL-validation and single-instance-delivery half of D-07 already exists and is already tested** (a `#[cfg(test)]` module at `main.rs:8267+` covers `protocol_url_arg_finds_url_among_the_vdf_launch_options`, `..._returns_none_when_absent`, `..._rejects_foreign_schemes`, `..._rejects_control_characters`, `..._rejects_oversized_url`). D-07's actual net-new work is narrower than "build deep links" — it is specifically the **OS-level registration** (`tauri-plugin-deep-link`'s build-time `CFBundleURLTypes` on macOS / runtime registry on Windows / `xdg-mime` on Linux), wired to call the SAME `protocol_url_arg`-validated dispatch path this code already uses for argv and the single-instance socket.

**IMPORTANT correction to RESEARCH.md's Standard Stack recommendation:** RESEARCH.md recommends adding `tauri-plugin-single-instance` alongside `tauri-plugin-deep-link` because "deep links arrive as a CLI arg to a new process" on Windows/Linux. **This repo already has single-instance handling — but it is hand-rolled, Unix-only, and NOT the plugin.** Confirmed at `main.rs:5506`:
```rust
// Hand-rolled, std-only, Unix-only. No crate is added (`tauri-plugin-single-instance` is
```
and `main.rs:5571` confirms the non-unix (i.e. Windows) branch never calls the acquisition function at all. **This means Windows currently has NO single-instance guard and therefore no deep-link delivery path to an already-running instance** — a planner scoping D-07 should treat "does the existing hand-rolled single-instance mechanism need to become cross-platform, or does `tauri-plugin-single-instance` replace it outright" as an open scoping question, not assume the plugin bolts on cleanly next to the existing Unix socket mechanism.

**The argv-validation choke point to reuse, not reimplement** (`main.rs:5388`, referenced 8+ times below it):
```rust
fn protocol_url_arg(args: &[String]) -> Option<String> {
    // single input-validation choke point (ASVS V5) for every deep-link source:
    // process argv, single-instance socket payload, (and, post-D-07, the OS callback)
}
```
The single-instance accept loop already demonstrates the exact re-validation discipline any new OS-callback-driven path must repeat (`main.rs:6039`, "Defence in depth (T-34.5-G6-20): re-validate through the SAME allow-list used for argv, never trusting the socket because it is 'internal'"):
```rust
match protocol_url_arg(&[trimmed.to_string()]) {
    Some(url) => { accept_state.invoke("handleProtocolUrl".to_string(), vec![Value::String(url)]) ... }
    None => { /* log byte count only, never the payload (T-34.5-G6-25) */ }
}
```

**`protocol.ts` + `protocol.test.ts` survive unchanged** — confirmed: `handleProtocol(args: string[])` at `src/backend/protocol.ts:46` takes a plain `string[]`, agnostic to how the Rust side obtained it. Only its two `from 'electron'` imports (`dialog, app` — `protocol.ts:1`) get the mechanical D-02 rewrite; the parsing logic itself needs zero changes.

**Cargo.toml additions needed (net-new, confirmed absent):**
```toml
tauri-plugin-deep-link = "2"
# tauri-plugin-single-instance = "2"  -- see the Windows-gap note above before adding
```

---

### `src-tauri/src/wake_lock.rs` (D-08) — no in-repo Rust analog for the binding itself

**Analog for the *registration/dispatch* shape:** `main.rs:6317-6322`'s `invoke_handler(tauri::generate_handler![...])` list — any new wake-lock command joins this list the same way `sidecar_invoke`/`sidecar_send`/`open_external`/`sidecar_store_snapshot` already do:
```rust
.invoke_handler(tauri::generate_handler![
    sidecar_invoke,
    sidecar_send,
    open_external,
    sidecar_store_snapshot
])
```

**Analog for the JS-side call sites (unchanged shape, just re-pointed):** `src/backend/launcher.ts:190`:
```typescript
if (!powerDisplayId) {
  logInfo('Preventing display from sleep', LogPrefix.Backend)
  powerDisplayId = powerSaveBlocker.start('prevent-display-sleep')
}
```
This call shape is untouched by D-08 — `powerSaveBlocker` still comes from `backend/platform` (formerly `electronStub.ts`), and its `start`/`stop`/`isStarted` methods stop being no-ops and instead forward to the new Rust command, mirroring exactly how `clipboard.writeText` already forwards to `RUST_CLIPBOARD_WRITE_TEXT` via `requestRustInvoke` (see the `platform/index.ts` excerpt above). **No new JS-side pattern is needed — reuse the `requestRustInvoke`-forwarding shape `clipboard.writeText` already establishes.**

**No existing Rust analog for the native OS-syscall binding itself** — see `## No Analog Found` below.

---

### `vite.config.ts` (D-12) — migrated from `electron.vite.config.ts`'s `renderer:` block

**Analog:** `electron.vite.config.ts` (full file read, 101 lines — CONTEXT.md's characterization confirmed byte-for-byte, resolving RESEARCH.md's Open Question #5). The `renderer:` block to lift:
```typescript
renderer: {
  root: '.',
  build: {
    rollupOptions: { input: path.resolve('index.html') },
    target: 'esnext',
    outDir: 'build',
    emptyOutDir: false,
    minify: true,
    sourcemap: mode === 'development' ? 'inline' : false
  },
  resolve: { alias: srcAliases },
  plugins: [
    react(),
    svgr(),
    mode !== 'production' && vite_plugin_react_dev_tools,
    // F-34.9-01: vite's copyDir (publicDir -> outDir) dereferences
    // symlinks -- every Python.framework symlink inside the onedir
    // runners becomes a real file/directory in build/, which codesign
    // then rejects ("bundle format is ambiguous"). This restores every
    // source symlink after the copy runs. Unconditional -- a no-op
    // wherever the source tree has no symlinks (Linux/Windows checkouts).
    preserveRunnerSymlinksPlugin()
  ]
}
```
**`preserveRunnerSymlinksPlugin` MUST survive the move** (F-34.9-01) — import unchanged: `import { preserveRunnerSymlinksPlugin } from './meta/preserveRunnerSymlinks'`. Also carry forward `srcAliases` (used by both `resolve.alias` here and, previously, by `main`/`preload` blocks which are being deleted):
```typescript
const srcAliases = ['backend', 'frontend', 'common'].map((aliasName) => ({
  find: aliasName,
  replacement: path.join(__dirname, 'src', aliasName)
}))
```
Note `vite.config.ts` will use plain `defineConfig` from `'vite'`, not `electron-vite`'s `defineConfig`/`externalizeDepsPlugin` (those were only needed for the `main:`/`preload:` Electron-target blocks, both deleted). The `main:`/`preload:` blocks (lines 34-59 of the current file) are NOT part of this migration — they die with `src/backend/main.ts`/`src/preload/index.ts` per D-17's ordering.

**D-15's `devUrl`/`beforeDevCommand` addition** (net-new to `tauri.conf.json`, no in-repo analog — `tauri.conf.json`'s `build.frontendDist` is currently unconditional `"../build"` with no `devUrl` key present, confirmed) has no existing pattern to copy; RESEARCH.md's own text is the only guidance (add `devUrl: "http://localhost:5173"` + `beforeDevCommand: "vite"`, and preserve a separate build-then-serve script pointed at the same `CI=e2e` harness that already reaches the `'build'` branch cheaply).

---

## Shared Patterns

### The mechanical import-path rewrite (D-01/D-02) — the 67-file wave

**Source of truth for "does this file change more than one line":** none needed beyond `git diff --stat` per file — a mechanical wave should show exactly one changed line per file (RESEARCH.md Pattern 1). **Do not enumerate all 67 files as separate plan items; enumerate the import-form taxonomy instead**, since the taxonomy — not the count — is what makes a naive `sed` unsafe:

**Form 1 — named value imports (the overwhelming majority shape):**
```typescript
// src/backend/protocol.ts:1
import { dialog, app } from 'electron'
// src/backend/online_monitor.ts:2
import { net } from 'electron'
// src/backend/updater.ts:1
import { dialog, shell, nativeImage } from 'electron'
// src/backend/ipc.ts:2 -- mixes a value import with an inline `type` specifier
import { ipcMain, type IpcMainEvent } from 'electron'
```
→ mechanically becomes `from 'backend/platform'`. The `IpcMainEvent` sub-case needs the type declared in `backend/platform/types.ts` (D-03).

**Form 2 — `import type ... from 'electron'` (12 confirmed sites, frontend + preload + one backend test):**
```typescript
// src/frontend/state/SteamBridgeSetup.ts:1
import type { IpcRendererEvent } from 'electron'
// src/backend/sidecar/__tests__/electronReachLedger.test.ts (one of the 12)
```
→ needs a first-party declaration in the platform module's types file, not a bare string swap — `from 'electron'` becomes `from 'backend/platform'` (or `backend/platform/types`) but the TYPE itself must exist there first.

**Form 3 — `Electron.` bare namespace references (32 refs / 22 files, NO import statement at all — these are missed by any `from 'electron'` grep):**
```typescript
// src/frontend/screens/DownloadManager/index.tsx:41
e: Electron.IpcRendererEvent,
// src/frontend/screens/WebView/index.tsx:71
const webviewRef = useRef<Electron.WebviewTag>(null)
// src/frontend/screens/WebView/index.tsx:346
const onerror = ({ validatedURL }: Electron.DidFailLoadEvent) => { ... }
```
These rely on the ambient `Electron` namespace that comes from `@types/electron` (or the package's own bundled `.d.ts`) being globally available — removing `electron` from `package.json` (D-03) makes these references dangle with no import to rewrite. **Each site needs an explicit named-type import added** (there is no bare-string swap available for a namespace reference), e.g. `import type { IpcRendererEvent } from 'backend/platform'` sourcing the same type the platform module's `types.ts` declares.

**Form 4 — lazy/guarded `require('electron')` (real runtime calls, not comments — 4 confirmed sites, all in `src/preload/ipc.ts`):**
```typescript
// src/preload/ipc.ts:27, 39, 54, 59 (all four identical shape)
const { ipcRenderer } = require('electron') as typeof import('electron')
```
This is the SAME shape class as `preload/api/misc.ts`'s lazy `electron-store` require (see below) — guarded, runtime, `!isTauri()`-gated. Needs its own collapse, not a bare string swap, since `require()` calls don't get touched by an import-rewrite pass.

**No bare default-import (`import electron from 'electron'`) or namespace-import (`import * as Electron from 'electron'`) sites were found** — confirmed via direct grep, zero matches. The taxonomy is exactly the four forms above.

### Path alias resolution — `backend/...` must work in all three build paths (verified this session, not merely asserted)

A new `from 'backend/platform'` specifier must resolve correctly everywhere the OLD `from 'electron'` specifier did (esbuild's alias) plus everywhere the pre-existing bare `backend/...`/`frontend/...`/`common/...` imports already resolve, since `backend/platform` is just one more member of that same alias family:

1. **TypeScript (`tsconfig.json`):** `"baseUrl": "./src/"` — the only mechanism; no `"paths"` map is present. Bare `backend/platform` resolves to `src/backend/platform` for `tsc`/type-checking.
2. **Jest (per-project configs, e.g. `src/backend/jest.config.js`):** `moduleDirectories: ['node_modules', '<rootDir>']` with `rootDir: '../..'` (repo root) — combined with `modulePaths: [compilerOptions.baseUrl]` (reused directly from `tsconfig.json`, confirmed via `require('../../tsconfig')`). Same mechanism, jest-flavored.
3. **esbuild (`build:sidecar` / `buildSidecarSea.ts` / `buildDecompressWorkerDev.ts`):** **no explicit alias or `NODE_PATH` config exists anywhere in this repo for `backend/...`** (confirmed — grepped scripts, `.envrc`, CI workflows, `meta/*.ts`: zero matches). This works today because **esbuild has built-in `tsconfig.json` `baseUrl` support** — it auto-discovers the project's `tsconfig.json` and resolves non-relative, non-`node_modules` bare specifiers against `baseUrl` natively, no plugin or flag required. `backend/platform` needs no NEW esbuild configuration — it inherits the same resolution every existing `backend/...` bare import already relies on.

**The `--alias:electron=` mechanism is separate from this and is single-sourced** (RESEARCH.md's refinement, confirmed): the literal string `'--alias:electron=./src/backend/sidecar/electronStub.ts'` exists in exactly ONE place, `meta/esbuildWorkerBundleShared.ts:290` inside `seaEsbuildFlags()`, called from three sites (`buildSidecarSea.ts` ×2, `buildDecompressWorkerDev.ts` ×1). One edit removes it everywhere. **Do not budget three edits.** `meta/__tests__/buildSidecarSea.test.ts` asserts the flag's presence and needs updating in the same commit or it goes red immediately.

### The `electron-store` → `conf` swap — ten real sites, not two (D-04)

**Source of truth for the corrected scope** (RESEARCH.md's own correction to CONTEXT.md):

| File | Import shape | Nature |
|---|---|---|
| `src/backend/cache.ts:1` | `import Store from 'electron-store'` | real, direct construction |
| `src/backend/electron_store.ts:1` | `import Store from 'electron-store'` | real, the central `TypeCheckedStoreImpl` wrapper every app store goes through |
| `src/backend/sidecar/handlers.ts:73` | `import Store from 'electron-store'` | real, `new Store({...})` at line ~297 |
| `src/backend/sidecar/storeWriteHandlers.ts:23` | `import Store from 'electron-store'` | real, `new Store({...})` at line ~92 |
| `src/common/types/electron_store.ts` | `import Store from 'electron-store'` (value-level, used only for `Store.Options<T>` typing) | counts toward D-03's grep unless converted to `import type` |
| `src/preload/api/misc.ts:141,176` | `import type Store from 'electron-store'` **+** lazy runtime `require('electron-store')` | type-only (erased) PLUS a real guarded runtime require — see excerpt below |
| `src/backend/sidecar/installElectronHook.ts` | intercepts `require('electron-store')` via `Module._load` hook | becomes dead code once nothing asks for it by name |
| `src/backend/sidecar/bootstrap.ts` | comment-only reference to hook install order | stale comment to remove |
| `src/backend/__tests__/cache.test.ts`, `storeChangeNotifier.test.ts` | test-only imports/mocks | update alongside source |

**The `preload/api/misc.ts` lazy-require pattern to collapse** (confirmed, lines 167-178):
```typescript
export const storeNew = function (storeName: string, options: Store.Options<Record<string, unknown>>) {
  if (isTauri()) {
    registerStore(storeName, options)
    return
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ElectronStore = require('electron-store') as typeof Store
  stores[storeName] = new ElectronStore(options)
}
```
Every one of `storeSet`/`storeHas`/`storeGet`/`storeDelete` repeats this exact `if (isTauri()) { ... } else { stores[storeName].<method>(...) }` shape — this IS one of D-01's 140 `isTauri()` branches (RESEARCH.md's Pitfall 2). **The whole `if (isTauri()) {...} else {...}` pair collapses to just the `isTauri()` body** once the Electron branch is deleted, not merely a `require` swap.

### `preload/api/misc.ts` as a three-way collision surface — sequence, don't split

**This is the single highest-risk file in the phase for a silent merge conflict.** Three independent Phase 35 concerns physically overlap in one file:
1. D-01's `isTauri()` branch collapse (every `storeSet`/`storeGet`/etc. pair above)
2. D-04's lazy `electron-store` require (same functions, same lines)
3. Phase 29 D-08's `SECRET_STORE_KEYS` deny-list → `storePolicy.ts` allow-list unification (lines 195-263, confirmed)

**The deny-list to delete, and its own documentation of why it was never unified early:**
```typescript
// D-08 (Phase 29 Plan 05): this DENY-list governs the ELECTRON path ONLY, and is
// intentionally NOT the Tauri path's policy. ... the two builds deliberately carry
// divergent secret policies until the Electron cutover (Phase 35) ... Do not "fix"
// this by unifying the two policies early; that is Phase 35's job.
const SECRET_STORE_KEYS: Record<string, readonly string[]> = {
  humbleConfigStore: ['sessionCookie', 'csrfToken'],
  steamConfigStore: ['refreshToken'],
  gogConfigStore: ['credentials'],
  zoomConfigStore: ['credentials']
}
const isSecretStoreKey = (storeName: string, key: string) => {
  const secrets = Object.prototype.hasOwnProperty.call(SECRET_STORE_KEYS, storeName) ? SECRET_STORE_KEYS[storeName] : []
  return secrets.some((secret) => key === secret || key.startsWith(`${secret}.`))
}
export const storeGet = (storeName: string, key: string, defaultValue?: unknown) => {
  if (isSecretStoreKey(storeName, key)) {
    console.warn(`storeGet: blocked read of credential key "${key}" from "${storeName}"`)
    return undefined
  }
  if (isTauri()) { return snapshotGet(storeName, key, defaultValue) }
  return stores[storeName].get(key, defaultValue)
}
```
**The allow-list it must be fully subsumed by before deletion** — `src/common/types/storePolicy.ts` (its own header explicitly names this file and this exact convergence): five fields are deliberately omitted from `STORE_ALLOWLIST` (`steamConfigStore.refreshToken`, `humbleConfigStore.sessionCookie`, `humbleConfigStore.csrfToken`, plus two more per its own comment) — **verify all four of `SECRET_STORE_KEYS`'s fields are among those five before deleting the deny-list**, per RESEARCH.md's security-domain flag (V4 Access Control). `common/types/__tests__/storePolicy.test.ts` is the extension point.

**How to avoid the collision:** either sequence all three edits into one task/plan touching this file once, or have whichever lands first leave an explicit `// Phase 35 follow-up:` marker naming the other two.

### `electronReachLedger.test.ts` — the natural D-03 enforcement point

**Source:** `src/backend/sidecar/__tests__/electronReachLedger.test.ts` (766 lines) — already exists, already walks the sidecar's import graph from real entry points, and its own header already calls its baseline array "the Phase 35 cutover work-list." **Apply to:** every plan that removes an `electron` import from the sidecar's reach graph.

**The baseline array shape to shrink, one committed entry at a time, each with a removal-justifying comment when cleared** (representative excerpt):
```typescript
const BASELINE_ELECTRON_REACHING_MODULES: string[] = [
  'src/backend/constants/paths.ts',
  'src/backend/dialog/dialog.ts',
  // Phase 34.4.1 Plan 12 (D-10 standing rule): humbleFlowRegistration.ts ->
  // humble/user.ts (direct) -> humble/user.ts's
  // `import { getHumbleSecretStore, ... } from './secretStore'` ->
  // secretStore.ts:1 `import { safeStorage } from 'electron'`.
  'src/backend/humble/secretStore.ts',
  'src/backend/humble/adapter.ts',
  // ...
]
```
**The growth tripwire this array feeds** (never edit the test's assertion logic — only the array):
```typescript
it('growth tripwire: every electron-importing module measured today is present in the committed baseline', () => {
  const measured = [...reachResult.electronImportingFiles].sort()
  const newModules = measured.filter((mod) => !BASELINE_ELECTRON_REACHING_MODULES.includes(mod))
  if (newModules.length > 0) {
    throw new Error(`A NEW electron-importing module has entered the sidecar's reach graph and is NOT in the committed baseline: ${newModules.join(', ')}. ...`)
  }
  expect(newModules).toEqual([])
}, 30000)
```
**D-03's success test is this array reaching `[]`** (or an explicitly justified non-empty remainder per D-05's accepted-gap list), enforced by this file, not a fresh grep script written from scratch.

### `isPackagedSidecar()` — the single-source-of-truth pattern (D-14)

**Source:** `src/backend/sidecar/humbleFlowRegistration.ts:159` (confirmed via read — guarded `require('node:sea')`, fails closed):
```typescript
export function isPackagedSidecar(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeSea = require('node:sea') as { isSea: () => boolean }
    // ... returns nodeSea.isSea(), catch -> true (fail closed)
  }
}
```
**Apply to:** `backend/platform/index.ts`'s `app.isPackaged` getter (shown above) AND confirm no other module re-derives this independently — `src/backend/sidecar/devSecretVault.ts:55,282` already imports and calls it directly ("guardrail (c)", its own comment: "`isPackagedSidecar()` (imported, never re-derived — guardrail (c))"). Making `app.isPackaged` a third caller of the SAME function, not a second independent derivation, is exactly what closes D-19 half (b) safely.

---

## No Analog Found

Files/subsystems with no close in-repo match — the planner should treat RESEARCH.md's own findings (WebSearch-sourced, MEDIUM confidence) as the primary source for these, not an in-repo pattern:

| File/Subsystem | Role | Data Flow | Reason |
|---|---|---|---|
| Native wake-lock syscall binding (`IOPMAssertionCreateWithName`/`SetThreadExecutionState`/`systemd-inhibit`) | Rust shell, native OS binding | request-response | No existing Rust code in this repo calls any platform power-management API; the closest thing (AppKit `NSEvent` monitor at `main.rs:6194+`) is a UI-event binding, not a power-management one — different OS API family entirely. RESEARCH.md's Standard Stack / Individual Item #4 is the authority here. |
| `tauri-plugin-deep-link`'s OS-registration mechanics (Info.plist generation, Windows registry writes, `xdg-mime`) | Rust shell, plugin config | event-driven | Net-new plugin, zero prior usage in this repo (confirmed: `grep -n "deep-link" Cargo.toml` → no match before this phase). The plugin itself is the "analog" — there's no in-repo precedent for wiring a Tauri plugin's build-time platform config, since every OTHER plugin already in `Cargo.toml` (`opener`, `dialog`, `notification`, `updater`, `shell`, `clipboard-manager`) needed no equivalent per-platform build-time generation step. |
| `webview.clear_all_browsing_data()` call site (D-09) | Rust shell, webview lifecycle | request-response | No existing Rust code calls any webview data-clearing API — `humble/user.ts`'s current `session.fromPartition` calls are Electron-side (JS), being deleted, not a Rust pattern to extend. The nearest RELATED pattern (not a direct analog) is `cookie_domain_matches` at `main.rs:975-994`, useful for anyone tempted to hand-roll cookie filtering instead of using the official clear-all API — reuse it if any cookie-domain comparison is still needed anywhere in this phase, per RESEARCH.md's "Don't Hand-Roll" table. |

---

## Deleted UI Surface — `TraySettings.tsx` (D-05/D-06)

**Not a "find an analog to build from" case — a "find every place a removal must touch" case.** Three sites, all confirmed by direct grep:

1. **The component itself:** `src/frontend/screens/Settings/components/TraySettings.tsx` (42 lines) — toggles `exitToTray`/`startInTray`/`noTrayIcon`, none of which the current Rust tray implementation (`main.rs:6069-6137`) honors. All three are affordances that currently lie under Tauri (D-05's rule).
2. **The barrel export:** `src/frontend/screens/Settings/components/index.ts:54` — `export { default as TraySettings } from './TraySettings'`
3. **The consumer:** `src/frontend/screens/Settings/sections/GeneralSettings/index.tsx` — both the named import (in the destructured import list from `'../../components'`, alongside ~20 sibling settings components) AND the render call `<TraySettings />` (line ~58) must be removed together.

**This is the general "how a settings panel is registered/unregistered in this codebase" pattern** — every settings component here follows barrel-export (`components/index.ts`) → named-import-into-section (`GeneralSettings/index.tsx` or a sibling section) → JSX render call. Any future settings-panel addition or removal in this codebase should follow/reverse this exact three-site chain.

**Scoping note for D-06:** if D-06's tray implementation grows to actually honor `exitToTray`/`startInTray`/`noTrayIcon` (not scoped in the current bounded tray per its own comment), the panel should be RESTORED rather than left deleted — D-05's rule cuts both ways ("nothing ships an affordance it cannot honor" implies a later-honored affordance may ship again). Note also `UseDarkTrayIcon` is a separate settings toggle (not in `TraySettings.tsx` — confirmed a sibling in the same import list) that may have the same lying-affordance problem; the planner should re-check it against D-06's actual final scope before deciding its fate.

---

## Metadata

**Analog search scope:** `src/backend/` (electronStub.ts, protocol.ts, tray_icon.ts, cache.ts, electron_store.ts, sidecar/handlers.ts, sidecar/storeWriteHandlers.ts, sidecar/humbleFlowRegistration.ts, sidecar/devSecretVault.ts, sidecar/pathShim.ts, launcher.ts, sidecar/__tests__/electronReachLedger.test.ts), `src/preload/` (index.ts, api/misc.ts, ipc.ts), `src/common/types/storePolicy.ts`, `src/frontend/screens/Settings/` (TraySettings.tsx + its two registration sites), `src-tauri/src/main.rs` (tray block, deep-link/single-instance block, builder chain, invoke_handler), `src-tauri/Cargo.toml`, `electron.vite.config.ts`, `tsconfig.json`, `jest.config.js` + per-project configs, `meta/esbuildWorkerBundleShared.ts`, `meta/buildSidecarSea.ts`, `package.json`.
**Files scanned:** ~35 direct reads/greps against commit `9870cf05c` (branch `fix/steam-native-install-stability`), plus full reads of CONTEXT.md and RESEARCH.md (1225 lines).
**Pattern extraction date:** 2026-08-28
**Graphify note:** `graphify query`/`graphify explain` were run first per this environment's tooling requirement; the symbol-level graph index did not surface useful cross-file architecture signal for this phase's file-level/prose-heavy artifacts (it matched on generic identifier names like "electronStub" against unrelated `meta/gen_vtables.ts` symbols rather than the actual `src/backend/sidecar/electronStub.ts` module). Direct `grep`/`Read` against the live tree was used as the primary method for all findings above; every code excerpt in this document was independently re-verified by direct file read in this session, not carried forward from RESEARCH.md unverified.
