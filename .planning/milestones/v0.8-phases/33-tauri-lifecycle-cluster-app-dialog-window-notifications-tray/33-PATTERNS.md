# Phase 33: Tauri lifecycle cluster — Pattern Map

**Mapped:** 2026-07-24
**Files analyzed:** 11 (5 modified existing, 2 new/extended Rust arms, 4 test files extended)
**Analogs found:** 11 / 11 (all files have a direct in-repo predecessor from Phase 28-32; this
phase is a continuation of an established seam, not new architecture)

**Load-bearing correction inherited from 33-RESEARCH.md:** CONTEXT.md's canonical_refs describe
`installFlowRegistration.ts` as the D-01b watchdog target. This is STALE — Phase 32 moved the
real `.install()` await to `src/backend/downloadmanager/utils.ts` (`installQueueElement()`,
~L105). Every pattern assignment below for the install-hang fix targets `downloadmanager/utils.ts`,
not `installFlowRegistration.ts`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/backend/downloadmanager/utils.ts` (D-01b watchdog + D-10 badge-clear, extends existing) | service | event-driven (queue processing) | itself (extend in place) — pattern source: `withTimeout.ts` usage in `depot.ts` | exact (same file, additive) |
| `src/backend/storeManagers/steam/user.ts` (`ensureConnected`, D-02 canary+relog) | service | request-response (CM RPC) | itself (extend in place) — pattern source: `withTimeout.ts` | exact |
| `src/backend/sidecar/electronStub.ts` (`dialog.showMessageBox` real, D-06/D-07) | utility/shim (transport forwarder) | request-response | `dialog.showOpenDialog` / `dialog.showSaveDialog` in the SAME file (L228-276) | exact |
| `src/backend/sidecar/electronStub.ts` (`Notification` real, D-05) | utility/shim | request-response (fire-and-forget confirm) | `dialog.showErrorBox` in the SAME file (L190-203) | role-match |
| `src/backend/sidecar/electronStub.ts` (`shell.showItemInFolder`/`trashItem`/`openPath` real, D-05) | utility/shim | request-response | `shell.openExternal` (L313-316) + `dialog.showOpenDialog` (L228-250) in the SAME file | exact |
| `src/backend/sidecar/electronStub.ts` (`app.quit`/`exit`/`relaunch` → new rustInvoke, D-05 app lifecycle) | utility/shim | request-response (fire-and-forget to Rust) | `shell.openExternal` → `transport.openExternal` (L313-316) forwarding shape | role-match |
| `src-tauri/src/main.rs` (`dialog_message` arm extended for multi-button, D-06) | route/dispatcher (Rust match arm) | request-response | the SAME `dialog_message` arm (L368-394) — data change, not new arm | exact |
| `src-tauri/src/main.rs` (new `notification_show` arm, D-05) | route/dispatcher | request-response | `dialog_message` arm (L368-394) | role-match |
| `src-tauri/Cargo.toml` / `package.json` (new notification plugin deps) | config | — | existing `tauri-plugin-dialog`/`tauri-plugin-opener` entries | exact |
| `src/common/types/sidecarTransport.ts` (new `RUST_NOTIFICATION_SHOW`/app-exit channel consts, extend `RUST_INVOKE_CHANNELS`) | config/types | — | `RUST_DIALOG_MESSAGE`/`RUST_DIALOG_OPEN` const block (L151-183) | exact |
| `src/backend/sidecar/__tests__/dialogStub.test.ts` (extend for D-06/D-07 real multi-button + fail-safe) | test | request-response | the file's OWN `showMessageBox` describe block (L134-181) | exact |
| `src/backend/downloadmanager/__tests__/utils.test.ts` (extend for D-12/WR-03 error-path test — **file already exists**, contradicting 33-RESEARCH's "Wave 0 gap ❌") | test | event-driven | the file's OWN existing `abort`-status regression test (debug/steam-cancel-abort-thread-a pattern) | exact |
| `src/backend/sidecar/__tests__/installFlows.test.ts` (extend for a never-settling-install watchdog assertion) | test | request-response | the file's own existing wiring-test structure | exact |

## Pattern Assignments

### `src/backend/downloadmanager/utils.ts` — `installQueueElement()` (service, event-driven)

**Analog:** itself (in-place extension) + `withTimeout.ts` usage pattern from `depot.ts`

**Current state to extend** (lines 100-146, already read in full):
```typescript
// L100-116: the real (unbounded) install await — D-01b's watchdog wraps THIS, not
// installFlowRegistration.ts's addToQueue() call (which only resolves once QUEUED).
try {
    downloadFixesFor(appName, runner)

    const installResult: InstallResult = await libraryManagerMap[runner]
      .getGame(appName)
      .install({
        path: path.replaceAll("'", ''),
        installDlcs,
        sdlList: sdlList.filter((el) => el !== ''),
        platformToInstall,
        installLanguage,
        build,
        branch
      })
    const { status, error } = installResult
    ...
```

**Finally-guard to extend (D-10/WR-01, the line CONTEXT.md and RESEARCH both name), L139-145:**
```typescript
// current — excludes plain status === 'error' for steam:
if (runner !== 'steam' || deferredToSetup || wasAborted) {
  sendGameStatusUpdate({ appName, runner, status: 'done' })
}
// D-10 extends the condition to also fire on status === 'error':
if (runner !== 'steam' || deferredToSetup || wasAborted || status === 'error') {
  sendGameStatusUpdate({ appName, runner, status: 'done' })
}
```
Per D-03, this must ALSO surface a failure dialog (reuse `showDialogBoxModalAuto` — already
imported at the top of this file, L10 — the same primitive `installQueueElement` already uses
for the legendary-offline-error branch at L50-58). Mirror that call shape for the Steam
terminal-error case.

**Watchdog pattern to add (D-01b)** — reuse `withTimeout.ts` exactly as `depot.ts` already does,
racing the WHOLE `.install()` call rather than a single PICS round-trip:
```typescript
// Source pattern to mirror: src/backend/storeManagers/steam/depot.ts:452-456
const { apps } = await withTimeout(
  client.getProductInfo([numericAppId], [], true),
  STEAM_PICS_TIMEOUT_MS,
  'fetchAppInfo getProductInfo'
)
```
Apply the same `withTimeout(promise, ms, label)` wrapper around the `libraryManagerMap[runner].getGame(appName).install(...)` call at L105-115, importing `withTimeout` from
`backend/storeManagers/steam/withTimeout.ts` (already exists, unit-tested, Phase 30 30-07).
Per 33-RESEARCH's "Watchdog Bound" section: the bound must sit comfortably ABOVE the sum of every
already-bounded pre-download step (50s `resolveSteamInstallTarget` + up to 90s×retries
`buildDepotPlan`) and must NEVER fire during the legitimate (unbounded-by-design) depot download
phase — recommend 5-10 minutes, catch via `isTimeoutError()` (already exported from
`withTimeout.ts`) to distinguish a genuine watchdog trip from a normal `install()` rejection, then
force `{status: 'error'}` down the SAME finally-guard path as D-10 above (one coherent error story,
per D-03).

**Test analog:** `src/backend/downloadmanager/__tests__/utils.test.ts` — this file ALREADY EXISTS
(contradicts 33-RESEARCH's "Wave 0 gap, not yet located" — it was found during this pattern-mapping
pass) and already contains a directly-analogous regression test for the sibling `wasAborted` gap
(debug/steam-cancel-abort-thread-a). Its mock strategy (`jest.mock('backend/storeManagers', ...)`
with a `installMock`/`getGameInfoMock` jest.fn() pair, `jest.mock('../../utils', ...)` preserving
only `sendGameStatusUpdate`) is the exact shape to copy for both the D-10 badge-clear-on-error test
and D-01b's never-settling-install watchdog test (make `installMock` return a never-resolving
Promise, advance fake timers past the watchdog bound, assert `sendGameStatusUpdateMock` was called
with `status: 'done'`).

---

### `src/backend/storeManagers/steam/user.ts` — `ensureConnected()` (service, request-response)

**Analog:** itself (in-place extension), reusing `withTimeout.ts`

**Current fast-path to replace (L70-81):**
```typescript
static async ensureConnected(): Promise<boolean> {
    if (this.client?.steamID) {
      logInfo(
        '[Timing] SteamUser.ensureConnected: already connected (fast path, 0ms)',
        LogPrefix.Steam
      )
      return true
    }
```

**D-02 replacement shape** (verified against installed steam-user v5.3.0 source per 33-RESEARCH;
`client.relog()` lives at `node_modules/steam-user/components/09-logon.js:604-624`):
```typescript
if (this.client?.steamID) {
  try {
    await withTimeout(
      this.client.getProductInfo([CANARY_APP_ID], [], true),
      CANARY_TIMEOUT_MS, // e.g. 5000 — much shorter than STEAM_PICS_TIMEOUT_MS
      'ensureConnected canary'
    )
    return true // genuinely alive
  } catch {
    this.client.relog()
    return await new Promise<boolean>((resolve) => {
      const grace = setTimeout(() => resolve(false), RELOG_GRACE_MS) // mirrors the EXISTING
        // 20000ms grace window already used a few lines below in this same function (L129)
      this.client!.once('loggedOn', () => { clearTimeout(grace); resolve(Boolean(this.client?.steamID)) })
      this.client!.once('error', () => { clearTimeout(grace); resolve(false) })
    })
  }
}
```
Note: this function ALREADY contains the exact `setTimeout(..., 20000)` + `once('loggedOn')` /
`once('error')` grace-window idiom at L125-138 for the cold-connect path — the D-02 canary-fallback
block should mirror that existing local pattern (same file) rather than inventing a new shape.

**Import to add:** `withTimeout` from `../withTimeout` (relative import; `user.ts` and
`withTimeout.ts` are siblings in `src/backend/storeManagers/steam/`).

---

### `src/backend/sidecar/electronStub.ts` — `dialog.showMessageBox` (utility/shim, request-response)

**Analog:** `dialog.showOpenDialog` / `dialog.showSaveDialog` in the SAME file (L228-276)

**Exact forward-to-transport shape to mirror** (from `showOpenDialog`, L228-250):
```typescript
showOpenDialog: async (
  _window?: unknown,
  options?: unknown
): Promise<{ canceled: boolean; filePaths: string[] }> => {
  try {
    const result = await requestRustInvoke(RUST_DIALOG_OPEN, [options])
    if (typeof result === 'string') {
      return { canceled: false, filePaths: [result] }
    }
    return { canceled: true, filePaths: [] }
  } catch (error) {
    console.warn(
      `[electronStub] dialog.showOpenDialog(): ${RUST_DIALOG_OPEN} failed:`,
      error instanceof Error ? error.message : String(error)
    )
    return { canceled: true, filePaths: [] }
  }
}
```

**D-06/D-07 real `showMessageBox` shape** — reuses the SAME `RUST_DIALOG_MESSAGE` channel (data
change per 33-RESEARCH, `dialog_message`'s Rust arm already 90% generalized) with an explicit
`cancelId` fail-safe (33-RESEARCH's recommended option (a) — NOT a positional "last index"
heuristic, which is confirmed WRONG for `askForceUninstall`):
```typescript
showMessageBox: async (
  _windowOrOptions?: unknown,
  maybeOptions?: unknown
): Promise<{ response: number; checkboxChecked: boolean }> => {
  const options = (maybeOptions ?? _windowOrOptions) as {
    buttons?: string[]
    cancelId?: number
    message?: string
    title?: string
    type?: string
  }
  const safeIndex = options?.cancelId ?? (options?.buttons?.length ?? 1) - 1
  try {
    const result = await requestRustInvoke(RUST_DIALOG_MESSAGE, [
      { message: options?.message, title: options?.title, kind: options?.type, buttons: options?.buttons }
    ])
    // result: true -> buttons[0] clicked (response 0), false -> buttons[1] clicked (response 1)
    return { response: result === false ? 1 : 0, checkboxChecked: false }
  } catch (error) {
    console.warn(
      `[electronStub] dialog.showMessageBox(): ${RUST_DIALOG_MESSAGE} failed, defaulting to safe index ${safeIndex}:`,
      error instanceof Error ? error.message : String(error)
    )
    return { response: safeIndex, checkboxChecked: false }
  }
}
```
**Retrofit both real callers with an explicit `cancelId`** (33-RESEARCH's Pitfall 4 / D-07):
- `src/backend/utils.ts` `askForceUninstall` (L292-308): `buttons: [no, yes]`, destructive =
  index 1 → add `cancelId: 0`.
- `src/backend/storeManagers/steam/library.ts` `promptI386Recovery` (L1265-1296): `buttons:
  [confirm, cancel]`, destructive = index 0 → add `cancelId: 1`.

**Error handling pattern:** total-method convention (never throw to caller) — identical to every
other `dialog.*` member in this file; the try/catch that resolves a safe value on ANY
`requestRustInvoke` rejection is the load-bearing D-07 guarantee.

---

### `src/backend/sidecar/electronStub.ts` — `Notification` (utility/shim, request-response)

**Analog:** `dialog.showErrorBox` in the SAME file (L190-203) — fire-and-forget confirm shape,
never-throw convention.

**Current dead stub to replace (L281-291):**
```typescript
export class Notification {
  static isSupported(): boolean {
    return false
  }
  constructor(_options?: unknown) {}
  on(): this { return this }
  show(): void {}
  close(): void {}
}
```
Mirror `showErrorBox`'s try/catch-around-`requestRustInvoke` shape for `show()`, forwarding to a
new `RUST_NOTIFICATION_SHOW` channel (new const in `sidecarTransport.ts`, added to
`RUST_INVOKE_CHANNELS`). `isSupported()` flips to `true`. No `nativeImage`/icon plumbing needed
(33-RESEARCH confirmed `@tauri-apps/plugin-notification`'s icon param is optional).

**Zero-change consumer:** `src/backend/dialog/dialog.ts`'s `notify()` (L61-79) already gates on
`Notification.isSupported()` with an established "logged no-op" fallback (`logInfo`, L74-77) — no
changes needed there beyond `isSupported()` returning `true` once wired.

---

### `src/backend/sidecar/electronStub.ts` — `shell` remaining methods (utility/shim, request-response)

**Analog:** `shell.openExternal` (L313-316, transport-bound) for `showItemInFolder`/`openPath`;
`dialog.showOpenDialog`'s try/catch shape for anything needing a real Rust round-trip result
(`trashItem` if it needs a success/failure signal).

**Current logged no-ops to upgrade (L313-327):**
```typescript
export const shell = {
  openExternal: async (url: string): Promise<void> => {
    transport?.openExternal(url)
  },
  showItemInFolder: (_fullPath: string): void => {
    console.warn('[electronStub] shell.showItemInFolder(): logged no-op (D-04, deferred to Phase 33) ...')
  },
  trashItem: async (): Promise<void> => {},
  openPath: async (): Promise<string> => ''
}
```
`showItemInFolder`/`openPath` back onto `tauri-plugin-opener` (already installed, per
33-RESEARCH). `trashItem` may need a NEW `tauri-plugin-fs` Cargo dependency (only new plugin
besides notification) — confirm plugin scope during planning per 33-RESEARCH's "Alternatives
Considered" table.

---

### `src/backend/sidecar/electronStub.ts` — `app.quit`/`exit`/`relaunch` (utility/shim, request-response)

**Analog:** `shell.openExternal`'s `transport?.openExternal(url)` forwarding shape (L313-316) — a
fire-and-forget push to the Rust/host side with no correlated response needed.

**Current no-ops (L137-152):**
```typescript
export const app = {
  ...
  quit: (): void => {},
  exit: (): void => {},
  relaunch: (): void => {},
  ...
}
```
Per 33-RESEARCH's "App Lifecycle Essentials" finding: `main.ts`/`main_window.ts` real Electron
lifecycle wiring is NOT in the sidecar's curated import graph at all — the only two real call
sites reachable from the sidecar are `resetHeroic()` (`utils.ts:420-429`, calls
`relaunch()`+`quit()`) and a `handleExit`-shaped function (`utils.ts:265-290`, calls `exit()`).
Wire these three to a new `rustInvoke` channel (e.g. `app_exit`/`app_relaunch`) so a real process
exit/relaunch request reaches Tauri's `AppHandle`, using the SAME `requestRustInvoke` pattern as
`dialog.showErrorBox` (fire class of call, no meaningful return value needed — a `void`-returning
best-effort forward is sufficient, matching `shell.openExternal`'s own fire-and-forget shape more
closely than a request/response dialog shape).

---

### `src-tauri/src/main.rs` — `dialog_message` arm extension (route/dispatcher, request-response)

**Analog:** the SAME arm, extended in place (L368-394, read in full above)

**Current single-button-only shape:**
```rust
"dialog_message" => {
    let message = args.first().and_then(|v| v.get("message")).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let kind = args.first().and_then(|v| v.get("kind")).and_then(|v| v.as_str())
      .map(|s| match s { "error" => MessageDialogKind::Error, "warning" => MessageDialogKind::Warning, _ => MessageDialogKind::Info })
      .unwrap_or(MessageDialogKind::Info);
    let mut builder = app.dialog().message(message).kind(kind);
    if let Some(title) = args.first().and_then(|v| v.get("title")).and_then(|v| v.as_str()) {
        builder = builder.title(title);
    }
    Ok(Value::Bool(builder.blocking_show()))
}
```
**Extension per 33-RESEARCH (verified `MessageDialogButtons::OkCancelCustom` is a real current
API):**
```rust
let buttons = args.first().and_then(|v| v.get("buttons")).and_then(|v| v.as_array());
if let Some(btns) = buttons.filter(|b| b.len() == 2) {
    let (label0, label1) = (btns[0].as_str().unwrap_or(""), btns[1].as_str().unwrap_or(""));
    builder = builder.buttons(MessageDialogButtons::OkCancelCustom(label0.into(), label1.into()));
}
Ok(Value::Bool(builder.blocking_show()))
// true -> buttons[0] clicked -> electronStub maps to response:0
// false -> buttons[1] clicked -> electronStub maps to response:1
```
Runs on the SAME spawned worker thread as `dialog_open` (comment at L367 already documents the
"modal-dialog-must-not-block-the-reader-thread" reasoning — no new threading concern, this is a
data-shape change only, confirming 33-RESEARCH's own conclusion).

---

### `src-tauri/src/main.rs` — new `notification_show` arm (route/dispatcher, request-response)

**Analog:** `dialog_message` arm's overall shape (parse args from `Value`, call plugin builder,
return `Ok(Value)`)

No excerpt exists yet in this codebase (net-new arm) — structurally mirror `dialog_message`'s
args-parsing idiom (`args.first().and_then(|v| v.get(...)).and_then(|v| v.as_str())`) against
`tauri-plugin-notification`'s builder API. Add the new Cargo dep (`tauri-plugin-notification =
"2"`, matching the existing `tauri-plugin-dialog = "2"` caret-major pinning convention in
`src-tauri/Cargo.toml`) and the new npm dep (`@tauri-apps/plugin-notification` ^2.3.3).

---

## Shared Patterns

### rustInvoke request/response forwarding (the dominant pattern this whole phase reuses)
**Source:** `src/backend/sidecar/sidecarRpc.ts` `requestRustInvoke()` (L282-317) +
`src-tauri/src/main.rs` `dispatch_rust_channel()` (L259+)
**Apply to:** every electronStub member gaining real behavior this phase (`showMessageBox`,
`Notification`, remaining `shell` methods, `app.quit`/`exit`/`relaunch`)
```typescript
// src/backend/sidecar/electronStub.ts's existing convention (mirror exactly):
const result = await requestRustInvoke(RUST_SOME_CHANNEL, [options])
```
New channel constants MUST be added to `RUST_INVOKE_CHANNELS` in
`src/common/types/sidecarTransport.ts` (L175-183) or `requestRustInvoke` pre-rejects
(`T-28-03` allowlist enforcement, L286-288 of `sidecarRpc.ts`) — this is a common forgotten step,
flag it explicitly in the plan.

### Total-method / never-throw convention
**Source:** every existing `dialog.*` member in `electronStub.ts` (L190-276) — `try { ... } catch
(error) { console.warn(...); return <safe default> }`
**Apply to:** `showMessageBox` (D-07's fail-safe-to-decline IS this pattern, with `cancelId` as
the safe default instead of a fixed sentinel), `Notification.show()`, `shell.*`, `app.*`. Never
reject/throw from an electronStub member — unguarded fire-and-forget callers exist (see
`sidecar-dialog-reject-crashes` memory entry: an unhandled rejection crashes the whole sidecar
process, there is no `process.on('unhandledRejection')` guard).

### Logged no-op discipline (D-08/D-09 and any re-deferred member)
**Source:** `electronStub.ts`'s `shell.showItemInFolder`/`clipboard.writeText` (L317-324,
L387-394) — the exact "upgraded from silent to logged" precedent from Phase 31 D-04
**Apply to:** `session`/`powerSaveBlocker` (stay no-ops per D-08/D-09, but must log per this
established convention), `showMessageBoxSync`/`showOpenDialogSync` (already logged, L222-227 and
L251-256 — no change needed, just confirm they stay this way), tray/protocol/`nativeImage`/updater
(re-deferred, must not silently regress from "logs" to "silent").

### `withTimeout` bound-an-await helper
**Source:** `src/backend/storeManagers/steam/withTimeout.ts` (full file read above, 97 lines)
**Apply to:** D-01b's watchdog around `installQueueElement`'s `.install()` call
(`downloadmanager/utils.ts`), D-02's canary probe (`user.ts`'s `ensureConnected`). Do NOT invent a
second timeout wrapper — `isTimeoutError()` (exported, L58-62) already exists to distinguish a
watchdog trip from any other rejection.

### Curated-import / no-electron-in-sidecar discipline
**Source:** `installFlowRegistration.ts`'s own header comment (L74-77): "Uses electronStub's own
`ipcMain` directly ... no file under `src/backend/sidecar/` may import the real `electron`
module."
**Apply to:** wherever the new lifecycle channels get registered (planner's call: extend an
existing `*FlowRegistration.ts` or a new curated module per CONTEXT.md's "Claude's Discretion").
Registration site itself is `src/backend/sidecar/handlers.ts` (L38-77) — mirrors
`registerInstallFlows()`/`registerSettingsFlows()`/`registerDownloadQueueFlows()`'s own
import-then-call-once shape at the bottom of that file.

## No Analog Found

None — every file this phase touches has a direct, exact-role in-repo predecessor from Phases
28-32 (the sidecar/rustInvoke seam is a mature, 3-phases-proven pattern by this point). The only
genuinely NEW code is the `notification_show` Rust arm and its Cargo/npm dependency additions,
which structurally mirror `dialog_message`'s existing arm closely enough to not need a separate
from-scratch design.

## Metadata

**Analog search scope:** `src/backend/sidecar/`, `src/backend/downloadmanager/`,
`src/backend/storeManagers/steam/`, `src/backend/dialog/`, `src/backend/utils.ts`,
`src-tauri/src/main.rs`, `src/common/types/sidecarTransport.ts`, corresponding `__tests__/`
directories.
**Files scanned (read in full or targeted range):** `electronStub.ts` (406 lines, full),
`downloadmanager/utils.ts` (L1-170), `withTimeout.ts` (full, 97 lines), `sidecarRpc.ts` (full, 318
lines), `sidecarTransport.ts` (full, 292 lines), `main.rs` (L255-414), `installFlowRegistration.ts`
(full, 193 lines), `user.ts` (L1-150), `dialog.ts` (full, 82 lines), `dialogStub.test.ts` (full,
359 lines), `library.ts` (L1240-1300), `utils.ts` (L250-310, `askForceUninstall`/`handleExit`
region), `handlers.ts` (registration-site grep), `downloadmanager/__tests__/utils.test.ts` (head).
**Correction surfaced during mapping:** the D-10/D-01b unit test target
(`src/backend/downloadmanager/__tests__/utils.test.ts`) ALREADY EXISTS with a directly-analogous
existing `wasAborted`-status regression test — 33-RESEARCH's "Wave 0 Gaps" section flagged this as
unlocated/possibly-missing; it is not missing, and its existing mock strategy is the exact
pattern to extend.
**Pattern extraction date:** 2026-07-24
