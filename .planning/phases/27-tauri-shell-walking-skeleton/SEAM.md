# Phase 27 Seam Map — Ported vs Stubbed vs Deferred

**Purpose:** Boundary map for the Tauri walking skeleton (27-01..05). Read this before starting
any later phase that ports more of the 220-endpoint Electron IPC surface onto the Tauri/sidecar
architecture. It records exactly what this phase wired for real, what it stubbed to the minimum
needed for those two flows, and what remains — keyed off spike 009's 16-API / 44-file coupling
map so the next slice can be picked without re-deriving the surface from scratch.

Source of truth for the underlying numbers: `.planning/spikes/009-node-backend-headless-sidecar/README.md`.

---

## 1. Ported (real, wired, hardware-provable)

### Transport contract
- `src/common/types/sidecarTransport.ts` — the stdio JSON-RPC frame shapes (`SidecarRpcRequest`/
  `SidecarRpcResponse`/`SidecarNotification`), the four Tauri command-name constants
  (`SIDECAR_INVOKE`, `SIDECAR_SEND`, `OPEN_EXTERNAL`, `SIDECAR_STORE_SNAPSHOT`), and
  `READY_SENTINEL`. Preserves the three preload factories' invoke/send/on shapes exactly.
- `src-tauri/src/main.rs` — Rust shell: spawns the Node sidecar over stdio, exposes the four
  `#[tauri::command]`s (`sidecar_invoke`, `sidecar_send`, `open_external`,
  `sidecar_store_snapshot`), relays `frontendMessage` notifications to the webview as the
  `frontend_message` event.

### Sidecar bootstrap shims (headless walls from spike 009, closed)
- `pathShim.ts` — `app.getPath()` equivalent (import-time wall #1).
- `fileStore.ts` — minimal sync file-backed `electron-store` replacement (import-time wall #2).
- `electronStub.ts` — full 16-API Electron-module replacement (`Module._load` hook target),
  because `storeManagers/index.ts` eagerly constructs every store manager at import time so the
  whole 16-API surface must not throw at import, even though only a handful have real behavior.
- `bootstrap.ts` — installs the `Module._load` hook before any backend import, calls
  `backend/logger`'s new `initHeadless()`, starts the RPC server, prints `READY_SENTINEL`.

### The renderer bridge (three factories + store snapshot, byte-identical Electron path preserved)
- `src/preload/tauriTransport.ts` — invoke/send/listen over `@tauri-apps/api` + synchronous
  in-memory store-snapshot bridge (`hydrateStoreSnapshot`/`snapshotGet`/`snapshotHas`/
  `snapshotSet`/`snapshotDelete`), `SECRET_STORE_KEYS` deny-list preserved (T-27-06).
- `src/preload/ipc.ts` + `src/preload/api/misc.ts` — the three factories re-pointed behind
  `isTauri()`; Electron access lazily/guarded `require()`'d only in the non-Tauri branch. Zero
  changes to the 379 `window.api.*` call-sites.
- `src/preload/tauriAttach.ts` — attaches `window.api` + the 6 preload globals directly to the
  Tauri webview (no `contextBridge` there); imported first in `src/frontend/index.tsx`.

### The four wired channels (exactly these — nothing else)
1. **`refreshLibrary`** — sidecar invoke handler (`steamFlowRegistration.ts`) calls the real,
   unmodified `SteamLibraryManager.refresh()`.
2. **`pushGameToLibrary`** — the frontend-push notification `refresh()` already emits per
   resolved game via `sendFrontendMessage` → `electronStub`'s fake `BrowserWindow.webContents.send`
   → `frontend_message` Tauri event → renderer's `on()` listener. Not a separate handler; it is
   `refreshLibrary`'s own push side-channel.
3. **`launch`** — sidecar invoke handler calls the real, unmodified `SteamGame.launch()`'s native
   branch (`buildSteamProtocolUrl` T-27-08 numeric-appId guard + `shell.openExternal`), bridged
   through `electronStub`'s `shell.openExternal` forwarder → `open_external` Tauri command →
   `tauri-plugin-opener` → `/usr/bin/open steam://rungameid/{id}`.
4. **`sidecar:store-snapshot`** — sidecar-side handler serving `configStore` +
   `steamConfigStore.raw_store` (refreshToken excluded at the source, T-27-09) — the store the
   renderer's synchronous `window.api.storeGet(...)` bridge needs on first paint
   (`GlobalState.tsx`'s Steam login-gate read).

`grep -c "refreshLibrary\|pushGameToLibrary\|launch"` over this document ≥ 3 (see the list above
plus references throughout §3).

---

## 2. Stubbed / Minimal (intentionally cut down to what these two flows need)

- **`safeStorage`** — plain passthrough (`Buffer.from(plainText, 'utf-8')` / `toString('utf-8')`),
  NOT the real OS Keychain. Spike 011 already proved the real path (`keyring` crate,
  `apple-native` feature, byte-identical round-trip) — wiring it is deferred, tracked as T-27-05
  accepted-passthrough.

  > **Live-verified consequence (27-05 hardware run): this stub blocks Steam sign-in entirely.**
  > The original claim that "no token persistence is exercised by this skeleton's two flows" is
  > **wrong in the read direction**. An existing refresh token — written by real Electron
  > `safeStorage` and tagged with `TOKEN_PREFIX` — is read back by `steam/user.ts`'s
  > `decryptToken()` at connect time. The stub's `isEncryptionAvailable()` returns `true`
  > (untrue), so `decryptToken` trusts it, base64-decodes real Keychain ciphertext, and yields
  > garbage. Result: the sidecar cannot authenticate, and the Tauri window shows an empty,
  > signed-out library even when the Electron build is signed in. UAT steps 2 and 3 are BLOCKED
  > on this.
  >
  > **⚠️ Write-direction trap for whoever ports the login channels.** The sidecar and Electron
  > share one store (`pathShim` resolves `userData` to the same folder — by design). Under this
  > stub, `encryptToken()` writes `TOKEN_PREFIX` + **plaintext**. Electron will then attempt a
  > Keychain decrypt of plaintext, fail, and silently sign the user out of the real app —
  > corrupting a working session. This cannot fire today (no login channel is registered), but
  > **port the keyring BEFORE wiring any channel that writes a token.** Making the stub honest
  > (`isEncryptionAvailable: () => false`) is a one-line stopgap that converts both failures into
  > a clean signed-out state; it was deliberately NOT applied in 27-05 (the keyring port is the
  > real fix and this file is the record).
- **`fileStore.ts`** — covers only the store shape the flows actually touch (`configStore`,
  `steamConfigStore`); it is not a general `electron-store` replacement and does not implement
  every method real `electron-store` exposes project-wide.
- **`shell`** — only `openExternal` has real behavior (forwarded to the Rust opener);
  `showItemInFolder`/`trashItem`/`openPath` are no-ops.
- **`BrowserWindow`** — only `getAllWindows()[0].webContents.send` has real behavior (the push
  path); no real window management exists in the sidecar process.
- **Tauri-path preload globals** (`isSteamDeck`, `isFlatpak`, `platform`, etc., 27-03) — hardcoded/
  navigator-derived fallbacks, not the real Node-based detection (`os.cpus()`, `graceful-fs`);
  neither Steam Deck nor Flatpak detection is load-bearing for either flow.
- **`pathShim.ts`'s `userData`** — resolves to `join(appData, 'GameLib')` by convention (matches
  the `'GameLib'` literal already used in `paths.ts`), not observed from a real
  `app.getName()`-derived Electron value — flagged in 27-02 for later verification against a real
  packaged build.

---

## 3. Deferred (out of scope this phase, the incremental-port backlog)

Ranked by spike 009's own 16-API touch-count (`app` ×26, `dialog` ×9, `BrowserWindow` ×7,
`shell` ×5, `safeStorage` ×4, `nativeImage` ×4, `Notification` ×3, `session`/`screen`/`net`/
`Menu` ×2, `protocol`/`powerSaveBlocker`/`clipboard`/`Tray`/`ipcMain` ×1):

| Priority | API / cluster | Files touched | What's needed to port |
|---|---|---|---|
| 1 | `app` (lifecycle beyond getPath/getName) | 26 | Real Tauri lifecycle equivalents (`tauri::App`, window events) for `main.ts`/`main_window.ts`/updater/tray/protocol registration |
| 2 | `dialog` | 9 | Tauri `dialog` plugin (open/save/message boxes) |
| 3 | `BrowserWindow` (full window management) | 7 | Real multi-window support if GameLib ever needs more than the single webview this skeleton hosts |
| 4 | `shell` (remaining methods) | 5 | `showItemInFolder`/`trashItem`/`openPath` via Tauri `opener`/`fs` plugins |
| 5 | `safeStorage` (real keyring) | 4 | Swap the passthrough stub for spike 011's proven `keyring` crate path — the single highest-value near-term port given it gates real token persistence |
| 6 | `nativeImage` | 4 | Tauri `image`/icon APIs, only needed once tray/notifications are ported |
| 7 | `Notification` | 3 | Tauri `notification` plugin |
| 8 | `session`/`screen`/`net`/`Menu` | 2 each | `session`/`powerSaveBlocker` are the two "soft spots" spike 011 flagged with no full Tauri v2 parity yet — explicitly out of scope until Tauri closes that gap |
| 9 | `protocol`/`powerSaveBlocker`/`clipboard`/`Tray`/`ipcMain` (remaining) | 1 each | Case-by-case Tauri equivalents; low volume, low urgency |

**The IPC re-plumb (the headline cost):** ~217 of the 220 total IPC endpoints (158 `addHandler` +
62 `addListener`, `AsyncIPCFunctions` ≈335 typed entries per spike 009) remain on the Electron
`ipcMain`/`ipcRenderer` transport, unported. This skeleton wired exactly 4 (`refreshLibrary`,
`pushGameToLibrary` push, `launch`, `sidecar:store-snapshot`). Porting the rest is mechanical per
endpoint (curate a sidecar invoke handler like `steamFlowRegistration.ts` did) but large in
volume — pick the next slice by user-facing value, not API-touch-count alone.

**The `electron-store` project-wide swap:** only the two stores this skeleton's read path needs
(`configStore`, `steamConfigStore`) have a sidecar-side snapshot handler; the other ~18 files that
route through `electron_store.ts` (spike 009's count) are untouched. Full swap to a Tauri/Rust
store (or a fuller `fileStore.ts`) is a later phase, not a shim.

**The 44-file lifecycle/dialog/tray/updater/protocol cluster:** beyond `app.getPath`/`getName` and
the opener path, none of this cluster has real Tauri-side behavior yet — see the ranked table
above.

**Also deferred (per 27-CONTEXT, unchanged this phase):**
- Windows/Linux Tauri packaging, auto-update, code signing, notarization.
- Electron removal from the repo — the Electron build (`npm start`) stays intact and byte-identical.
- `session`/`powerSaveBlocker` parity shims, multi-account flows, the macOS Steam bridge (Idea B,
  Phase 24 — an unrelated arc).
- `launcher.ts`'s full Wine/GameConfig/DownloadManager pipeline and the other 5 store managers
  (GOG/Legendary/Nile/Zoom/Sideload) — `steamFlowRegistration.ts` deliberately imports only
  `SteamLibraryManager`/`SteamGame`, not `storeManagers/index.ts`'s `libraryManagerMap`.

---

## Incremental-Port Checklist (for the next phase that extends this seam)

1. Pick the next channel(s) from spike 009's ranked table above (prefer high-value user-facing
   flows: install, uninstall, update-check are natural next E2E slices reusing this skeleton's own
   pattern).
2. Add a curated `ipcMain.handle(...)` registration in a new `<domain>FlowRegistration.ts`
   (mirrors `steamFlowRegistration.ts`) importing only the real backend code the new flow needs —
   do not eagerly pull in `storeManagers/index.ts`'s full `libraryManagerMap` unless the flow
   genuinely spans multiple store managers.
3. If the new flow needs a new Electron API behavior beyond what `electronStub.ts` already
   stubs (real `dialog`, real `safeStorage`, etc.), give that API real behavior in `electronStub.ts`
   bound to a real Tauri command in `src-tauri/src/main.rs` (mirrors `openExternal`'s
   forward-to-transport pattern) rather than leaving it a silent no-op.
4. If the new flow needs additional persisted config, extend `sidecar:store-snapshot` (or add a
   new sidecar-store handler) rather than swapping `electron-store` project-wide in one shot —
   that full swap is its own phase-sized unit of work per spike 009.
5. Re-run this document's own acceptance shape: list the newly wired channel(s) under §1, move
   them out of the deferred table in §3, and re-verify `npm run tauri:dev` + `npm start` both work
   (the additive/reversible invariant, REQ-27-06 pattern) before calling the slice done.

---

## Load-Bearing Invariants (learned the hard way in the 27-05 live run)

Two non-obvious rules the skeleton depends on. Both were discovered only by running the real
build — every automated test passed while the window rendered blank.

### A. `window.api` attachment order is a DEPENDENCY, not a convention

The renderer has no Electron preload under Tauri, so `preload/tauriAttach.ts` must assign
`window.api` before any module that reads it at module scope (`frontend/helpers/index.ts` captures
`window.api.readConfig`; `frontend/helpers/electronStores.ts` calls `window.api.storeNew` from
constructors at module scope).

Declaring the attach as the entry's first import in `index.tsx` is **not sufficient in a built
bundle.** Source order governs modules; Rollup's *chunking* governs what actually executes first.
In the failing build, Rollup inlined `tauriAttach` into the entry chunk while `helpers/index.ts`
landed in a shared chunk the entry chunk imports — and an imported chunk is evaluated in full
before any of the importing chunk's own module bodies. The attach ran second, `window.api` was
undefined, and the module-scope read threw *inside the module graph*, producing a silent blank
window (it surfaced as a rejected dynamic import, which the on-page error surface cannot catch).

**Rule:** any module that touches `window.api` at module scope must `import '../../preload/tauriAttach'`
itself. Evaluation order between a module and its dependency is fixed by the spec regardless of
chunk boundaries. Do not rely on entry-file import order. Symptom of a violation: blank window,
`undefined is not an object (evaluating 'window.api.<anything>')`, and NO `[GameLib] tauriAttach
evaluating` line in the console.

### B. Unported channels must stay non-fatal

Much of the frontend invokes IPC at module scope with an uncaught `.then()` (e.g.
`frontend/state/UploadedLogFiles.ts` → `getUploadedLogFiles()`). Under Electron those can never
reject — every handler exists. Against this sidecar, which registers only a curated handful of
channels, each one rejects as an unhandled rejection during boot. Treating those as fatal makes the
skeleton unusable until all ~217 endpoints are ported, i.e. it defeats the point of a walking
skeleton.

**Contract:** `sidecarRpc.ts` tags handler-missing rejections with `UNPORTED_CHANNEL_MARKER`
(`common/types/sidecarTransport.ts`). The response is still `ok: false` — the promise rejects
honestly, only the *reason* is classified. `frontend/bootErrorSurface.ts` matches that marker and
logs a warning instead of painting over the page, and additionally never clobbers an
already-mounted app. As channels are ported, these warnings disappear on their own.

Note `bootErrorSurface.ts` duplicates the marker as a literal rather than importing it: that
module's zero-import property is what guarantees its handlers register before anything they need to
catch — precisely the invariant rule A shows is fragile. Keep the two in sync by hand.
