---
phase: 35-electron-cutover-remove-the-electron-build
reviewed: 2026-08-30T03:54:11Z
depth: standard
files_reviewed: 87
files_reviewed_list:
  - .github/workflows/release-tauri.yml
  - meta/__tests__/artifactTargets.test.ts
  - meta/__tests__/buildSidecarSea.test.ts
  - meta/__tests__/electronAbsence.test.ts
  - meta/__tests__/isTauriRemoved.test.ts
  - meta/__tests__/viteRendererConfig.test.ts
  - meta/esbuildWorkerBundleShared.ts
  - meta/probeSeaInWorker.ts
  - src-tauri/capabilities/default.json
  - src-tauri/Cargo.toml
  - src-tauri/src/main.rs
  - src-tauri/tauri.conf.json
  - src/backend/__tests__/cache.test.ts
  - src/backend/__tests__/cargoFeatures.test.ts
  - src/backend/__tests__/packagingConfig.test.ts
  - src/backend/__tests__/releaseWorkflow.test.ts
  - src/backend/__tests__/tauriShellSource.test.ts
  - src/backend/cache.ts
  - src/backend/electron_store.ts
  - src/backend/main_window.ts
  - src/backend/platform/__mocks__/index.ts
  - src/backend/platform/__tests__/types.usage.test.ts
  - src/backend/platform/index.ts
  - src/backend/platform/types.ts
  - src/backend/sidecar/__tests__/appRootResolution.test.ts
  - src/backend/sidecar/__tests__/appShellFlows.test.ts
  - src/backend/sidecar/__tests__/bootstrap.test.ts
  - src/backend/sidecar/__tests__/devSecretVault.test.ts
  - src/backend/sidecar/__tests__/electronReachLedger.test.ts
  - src/backend/sidecar/__tests__/electronUntouched.test.ts
  - src/backend/sidecar/__tests__/installedJsonWatcher.test.ts
  - src/backend/sidecar/__tests__/isPackagedSidecar.test.ts
  - src/backend/sidecar/__tests__/lifecycleStub.test.ts
  - src/backend/sidecar/__tests__/testContainment.test.ts
  - src/backend/sidecar/__tests__/wakeLock.test.ts
  - src/backend/sidecar/__tests__/wineToolsFlows.test.ts
  - src/backend/sidecar/appShellFlowRegistration.ts
  - src/backend/sidecar/bootstrap.ts
  - src/backend/sidecar/devSecretVault.ts
  - src/backend/sidecar/downloadQueueFlowRegistration.ts
  - src/backend/sidecar/handlers.ts
  - src/backend/sidecar/humbleFlowRegistration.ts
  - src/backend/sidecar/installedJsonWatcher.ts
  - src/backend/sidecar/installElectronHook.ts
  - src/backend/sidecar/isPackagedSidecar.ts
  - src/backend/sidecar/oauthLoginFlowRegistration.ts
  - src/backend/sidecar/storeWriteHandlers.ts
  - src/backend/store_backend.ts
  - src/backend/storeManagers/legendary/__tests__/epicLogoutDomains.test.ts
  - src/backend/storeManagers/legendary/__tests__/user.test.ts
  - src/backend/storeManagers/legendary/user.ts
  - src/common/typedefs/extra-mock-function.ts
  - src/common/types/__tests__/storePolicy.test.ts
  - src/common/types/electron_store.ts
  - src/common/types/sidecarTransport.ts
  - src/common/types/storePolicy.ts
  - src/frontend/components/UI/CachedImage/__tests__/index.test.tsx
  - src/frontend/components/UI/DialogHandler/components/MessageBoxModal/index.css
  - src/frontend/index.tsx
  - src/frontend/screens/Accessibility/queryLocalFontsSafe.ts
  - src/frontend/screens/Login/__tests__/index.test.tsx
  - src/frontend/screens/Settings/components/UseDarkTrayIcon.tsx
  - src/frontend/screens/WebView/__tests__/useTauriOAuthLogin.test.tsx
  - src/frontend/screens/WebView/__tests__/WebViewAmazonLoginDataSpawn.test.ts
  - src/frontend/screens/WebView/components/__tests__/WebviewUnavailablePanel.test.tsx
  - src/frontend/screens/WebView/index.tsx
  - src/frontend/screens/WebView/useTauriOAuthLogin.ts
  - src/frontend/state/__tests__/GlobalStateSteamLogout.test.ts
  - src/frontend/state/GlobalState.tsx
  - src/preload/__tests__/childWindows.test.ts
  - src/preload/__tests__/framelessRuntime.test.ts
  - src/preload/__tests__/gamepadActionRouting.test.ts
  - src/preload/__tests__/steamInstallFormApi.test.ts
  - src/preload/__tests__/storeApi.test.ts
  - src/preload/__tests__/tauriAttach.test.ts
  - src/preload/__tests__/tauriTransport.test.ts
  - src/preload/__tests__/windowChrome.test.ts
  - src/preload/api/helpers.ts
  - src/preload/api/misc.ts
  - src/preload/api/settings.ts
  - src/preload/api/tauriGamepadInput.ts
  - src/preload/api/tauriWindowChrome.ts
  - src/preload/index.ts
  - src/preload/ipc.ts
  - src/preload/tauriAttach.ts
  - src/preload/tauriTransport.ts
findings:
  critical: 4
  warning: 10
  info: 3
  total: 17
status: issues_found
---

# Phase 35: Code Review Report

**Reviewed:** 2026-08-30T03:54:11Z
**Depth:** standard
**Files Reviewed:** 87
**Status:** issues_found

## Summary

Phase 35 removes the Electron build and leaves a Rust/Tauri shell plus a Node sidecar. The
mechanical parts of the cutover are in good shape: `tsc --noEmit` is clean across the whole
tree, the `isTauri` removal is genuinely complete (verified independently of its own gate —
zero matches under `src/`, `meta/` and `scripts/`), `store_backend.ts`'s `conf` shim faithfully
reproduces `electron-store`'s `name`→`configName` and `cwd` translation plus a real containment
check, and `storePolicy.ts` is a correctly fail-closed single source of truth for the store
read/write allow-list.

The defects are concentrated in three places the cutover touched but did not finish:

1. **The Tauri command surface.** `open_external` is registered in `generate_handler!` and
   accepts an arbitrary renderer-supplied URL, which is a complete bypass of the very
   `opener:default` scope (`http`/`https`/`mailto`/`tel`) that `capabilities/default.json`
   deliberately relies on. Its own doc comment asserts a safety property that is false.

2. **Ports that changed semantics while claiming byte-equivalence.** `frontendReady` was ported
   from Electron's `addOneTimeListener` to `ipcMain.on`, and plan 35-11 then put the boot-time
   `initQueue(true)` auto-resume inside it. `initQueue` has no re-entrancy guard, so a second
   `frontendReady` can start a second concurrent install of the same queue head.

3. **A second family of Electron/Tauri dual-build branches that the sweep never looked at.**
   The `isTauri` completeness gate is well built, but it keys on one token. The other runtime
   discriminator this codebase uses — `getLoginWindowSeam() === null` — was never swept, so
   seven dead Electron branches (six in `humble/user.ts`, one in `legendary/user.ts`) survive
   into the Tauri-only build, all of them calling `session.fromPartition()` against a stub whose
   methods reject.

Also of note: `window.platform` cannot produce `'win32'`, and 72 frontend platform branches
depend on it; and `LegendaryUser.logout()`'s new fatal-cookie-clear signal is routed only into
`console.error`, which does not reach `gamelib.log` under Tauri.

The four live-gate FAILs (criteria 6, 10, 14, 16) and deferred items D-35-19-01..15 are not
re-reported here. All findings below are additional.

---

## Critical Issues

### CR-01: `open_external` accepts any renderer-supplied URL, bypassing the `opener` plugin scope

**File:** `src-tauri/src/main.rs:1198-1207`, registered at `src-tauri/src/main.rs:8190-8195`
**Related:** `src-tauri/capabilities/default.json:6-8`, `src-tauri/tauri.conf.json:12-27`

**Issue:** `capabilities/default.json` grants `opener:default`, whose permission set is
`allow-open-url` + `allow-reveal-item-in-dir` + `allow-default-urls`. `allow-default-urls`
is the scope that restricts `plugin:opener|open_url` to `mailto:`, `tel:`, `https://` and
`http://` — the plugin's own defence against a renderer opening arbitrary local targets.

`open_external` is an app-defined command listed in `tauri::generate_handler!`. As the capability
file's own description states, app-defined relay commands "do not require capability permissions",
and "Rust-side plugin API calls bypass capabilities". So this command is (a) reachable from any
script in the `main` window (`withGlobalTauri: true` publishes `window.__TAURI__.core.invoke`,
and `security.csp` is `null`), and (b) calls `app.opener().open_url(url, None)` from Rust, where
the plugin scope is not consulted at all:

```rust
#[tauri::command]
fn open_external(url: String, app: AppHandle) -> Result<(), String> {
    app.opener()
        .open_url(url, None::<&str>)          // <- no scheme validation, scope not applied
        .map_err(|e| e.to_string())
}
```

The doc comment directly above it asserts "this command does not construct URLs from renderer
free-text" — true and irrelevant: it does not need to construct one, it accepts the whole URL
verbatim. On macOS this reaches `/usr/bin/open`, so
`invoke('open_external', { url: 'file:///Applications/Some.app' })` launches an application, and
`file:///` / `smb://` / any other registered handler scheme is equally reachable. The relevant
attacker position is exactly the one `storePolicy.ts`'s own header names: "any renderer script
(e.g. XSS via themes/custom CSS)". GameLib ships user-supplied theme CSS (`getThemeCSS`,
`window.setCustomCSS`) and renders remote-sourced game metadata.

This is the same class of exposure the capability file explicitly refused for
`dialog:allow-open` ("would have exposed `plugin:dialog|open` directly to renderer JavaScript …
for zero benefit"), reopened by a wrapper on the Rust side.

**Fix:** validate the scheme against the exact set this command exists to serve.

```rust
/// The only schemes the renderer may ask the shell to hand to the OS. `steam:` is the reason
/// this command exists at all (the opener plugin's own `allow-default-urls` scope excludes it);
/// everything else here mirrors that scope so the app-defined arm is never WIDER than the
/// plugin arm the capability already restricts.
const OPEN_EXTERNAL_ALLOWED_SCHEMES: &[&str] = &["https", "http", "mailto", "tel", "steam"];

#[tauri::command]
fn open_external(url: String, app: AppHandle) -> Result<(), String> {
    let scheme = url
        .split_once(':')
        .map(|(s, _)| s.to_ascii_lowercase())
        .ok_or_else(|| "open_external: rejected a URL with no scheme".to_string())?;
    if !OPEN_EXTERNAL_ALLOWED_SCHEMES.contains(&scheme.as_str()) {
        // Scheme name only, never the URL (T-28-04 convention).
        eprintln!("[shell] open_external: rejected scheme '{scheme}'");
        return Err("open_external: scheme not allowed".to_string());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}
```

Add a `#[cfg(test)] mod tests` case per rejected scheme (`file`, `smb`, `javascript`) plus a
`steam://rungameid/440` accept case, alongside the existing pure-helper tests in that file.

---

### CR-02: `frontendReady` is a repeating listener, so the ported `initQueue(true)` can run concurrently with itself

**File:** `src/backend/sidecar/appShellFlowRegistration.ts:350` (registration) and `:421-424`
(the ported `setTimeout(... initQueue(true) ..., 5000)`)
**Related:** `src/backend/downloadmanager/downloadqueue.ts:116-174`

**Issue:** The Electron original registered this channel with `addOneTimeListener('frontendReady', …)`
(`src/backend/ipc.ts:22-30` → `ipcMain.once`), so the whole body — including the 5-second
`initQueue(true)` auto-resume — ran **exactly once per process**. The sidecar port uses
`ipcMain.on`, which the `electronStub` `ipcMain` implements as an accumulating listener array with
no once-semantics (`src/backend/platform/index.ts:166-196`, which *does* provide a `once`).

Until plan 35-11 this did not matter, because the handler body was logging plus the Snap dialog.
Plan 35-11 moved the boot-time download-queue auto-resume inside it. `initQueue` has **no
re-entrancy guard** — no `isRunning()` check, no in-flight flag:

```ts
async function initQueue(isStartup = false) {
  let element = getFirstQueueElement()
  while (element) {
    ...
    const { status } = element.type === 'install'
      ? await installQueueElement(element.params)   // <- two concurrent calls, same element
```

`frontendReady` fires from `GlobalState.componentDidMount` (`GlobalState.tsx:1613`). The sidecar
outlives the renderer, so any renderer reload (devtools reload, a webview crash-recovery reload,
a future in-app reload path) fires it again into the same sidecar process and schedules a second
`initQueue(true)`. Both calls read the same queue head, both set `queueState = 'running'`, and
both call `installQueueElement` for the same appName — two downloaders writing the same install
directory. The Snap warning dialog and `logInfo('Frontend Ready')` repeat for the same reason.

The module docstring claims this handler is "a deliberate SUBSET of main.ts:560-601 … byte-equivalently";
the one-shot semantics were dropped without being named.

**Fix:** restore once-semantics. `electronStub`'s `ipcMain` already has the primitive:

```ts
// main.ts registered this with addOneTimeListener (ipcMain.once) -- the body is boot work,
// not a per-event handler. `initQueue` has no re-entrancy guard, so a second delivery starts
// a second concurrent install of the same queue head.
ipcMain.once('frontendReady', () => {
  ...
})
```

If a repeating registration is required for another reason, gate the boot half instead:

```ts
let frontendReadyBootWorkDone = false
...
if (!frontendReadyBootWorkDone) {
  frontendReadyBootWorkDone = true
  setTimeout(() => { logInfo('Starting the Download Queue', LogPrefix.Backend); void initQueue(true) }, 5000).unref()
}
```

`appShellFlows.test.ts` currently asserts `initQueue` was "called exactly once with `true` under
fake timers" for a single `frontendReady` delivery — extend it to deliver the channel twice and
assert `initQueue` is still called once.

---

### CR-03: `window.platform` can never be `'win32'`, so every Windows-only frontend branch is wrong on the shipped NSIS build

**File:** `src/preload/tauriAttach.ts:73`
**Related:** `src/preload/index.ts:25-38` (the Windows shim that no longer runs),
`src/frontend/state/GlobalState.tsx:312`

**Issue:**

```ts
window.platform = (isMacWebview() ? 'darwin' : 'linux') as NodeJS.Platform
```

There is no `win32` arm. `nsis` is a declared bundle target (`tauri.conf.json:31`) and
`release-tauri.yml` builds and uploads a Windows leg, so this ships.

The Windows `navigator.platform` shim that used to compensate lives in `src/preload/index.ts:25-38`,
but that module is never loaded — its own header states "This bundle (`build/preload/index.js`)
was never loaded by the Tauri webview at runtime". The renderer imports `../preload/tauriAttach`
directly (`src/frontend/index.tsx:19`), bypassing it entirely. So the shim is dead code and the
fallback is a hard `'linux'`.

`GlobalState.tsx:312` feeds this straight into `ContextProvider.platform`, and 72 call sites under
`src/frontend` branch on it. On Windows the app will therefore render the Linux-only surface and
hide the Windows-only surface, e.g.:

- `Settings/components/EnableFsync.tsx:13` — `const isLinux = platform === 'linux'`; Fsync toggle shown on Windows
- `Settings/components/EnableFSR.tsx`, `EnableEsync`, `NvidiaPrime`, `DisableUMU`, `WinePrefix`, `WinePrefixesBasePath`, `CustomWineProton` — same shape
- `Settings/sections/AdvancedSettings/index.tsx:66` — `const isWindows = platform === 'win32'`; never true
- `Settings/sections/SyncSaves/{index,legendary,gog}.tsx:15/50/50` — `const isWin = platform === 'win32'`; save-path resolution takes the wrong branch
- `Settings/sections/SystemInfo/os.tsx:18` — Windows OS block unreachable

**Fix:** derive all three, in `platformDetect.ts` so both consumers stay single-sourced:

```ts
// src/preload/platformDetect.ts
export const isWindowsWebview = (): boolean => {
  try {
    return /win/i.test(navigator.platform) || navigator.userAgent.includes('Windows')
  } catch {
    return false
  }
}

// src/preload/tauriAttach.ts
window.platform = (
  isMacWebview() ? 'darwin' : isWindowsWebview() ? 'win32' : 'linux'
) as NodeJS.Platform
```

`navigator.platform` is `Win32` under WebView2 and `navigator.userAgent` carries `Windows NT`,
so either signal alone is sufficient; both are used because `navigator.platform` is deprecated
and may be frozen. Delete `src/preload/index.ts`'s now-doubly-dead shim in the same change, or
state in its header that it is unreachable rather than describing it as something the file
"still does".

---

### CR-04: a failed Epic cookie clear is reported only to `console.error`, which does not reach `gamelib.log`

**File:** `src/backend/storeManagers/legendary/user.ts:238-243, 315-349`
**Related:** `src/frontend/state/GlobalState.tsx:671-694`,
`src/frontend/screens/Login/components/Runner/index.tsx:47-55`

**Issue:** Plan 35-09 made `clearEpicCookies` the one fatal wipe step: a zero total, or any throw,
is captured and rethrown after the credential cleanup so "logout reports failure instead of
silently reporting success (T-35-39)". That signal has no reachable consumer.

The full chain:

- `LegendaryUser.logout()` rethrows `fatalWipeFailure` (`user.ts:347-349`), **after**
  `configStore.delete('userInfo')` + `clearCache('legendary')` have already run.
- `GlobalState.epicLogout` wraps it so `refreshing: false` always lands, and deliberately does not
  swallow: "`finally` rethrows, and that Runner guard is what surfaces and logs it".
- `Runner/index.tsx:54` is that guard, and its entire body is
  `console.error('[GameLib] logoutAction failed:', error)`.

Under Tauri, renderer `console.error` reaches neither `gamelib.log` nor `gamelib-shell.log` — this
is a standing finding in this project (`sidecar-console-and-logger-are-invisible`, and the same
reasoning `tauriTransport.send`'s own recursion-guard comment states: "Renderer `console.error`
does not reach `gamelib.log`"). The UI state has already been reset to signed-out by the
`finally`, so the user sees a successful logout.

Net effect: the exact condition the throw exists to make visible — *the Epic session cookies
survived logout* — produces no user-visible signal and no log line anywhere a support request
could recover. This is the "lying self-report" failure the plan's own comment says it is fixing,
moved one layer out.

There is a second, independent problem in the same code: `total === 0` across all five hosts is
treated as fatal, but a user who authenticated Epic through a path that sets no cookies in the
default `WKWebsiteDataStore` (a legendary CLI `auth`, or a profile migrated from another
launcher) legitimately has nothing to clear. Their logout will always report failure.

**Fix (two parts):**

1. Route the failure into the backend log and a user-visible dialog rather than `console.error`:

```tsx
// Runner/index.tsx
} catch (error) {
  // Renderer console.* does not reach gamelib.log under Tauri -- route through the
  // sidecar logger, and tell the user, because a failed logout is a SECURITY outcome.
  window.api.logError(`[GameLib] logoutAction failed for ${props.runner}: ${String(error)}`)
  showDialogModal({
    showDialog: true,
    type: 'ERROR',
    title: t('box.error.logout.title', 'Sign-out incomplete'),
    message: t(
      'box.error.logout.message',
      'Your account was signed out locally, but the browser session could not be cleared. Sign out again, or clear the browser data manually.'
    )
  })
}
```

2. Distinguish "cleared nothing because there was nothing" from "cleared nothing because the
   clear is broken". The seam already returns a liveness signal for exactly this
   (`LoginWindowCookieRead.total`, `classifyCookieRead` in `humble/loginWindowSeam.ts`) — use the
   unfiltered jar size to decide, instead of the matched-delta sum, so an empty jar is `ok` and a
   populated jar with a zero delta is `fatal`.

---

## Warnings

### WR-01: seven dead Electron branches survive the cutover, keyed on a discriminator the completeness gate does not measure

> **ROUTED TO PHASE 39 on 2026-08-30** (operator decision at the Phase 35 gap-closure planning cycle). Not deferred and not Phase 35's — see `deferred-items.md` `D-35-ROUTE-01` and ROADMAP Phase 39's "Routed in from Phase 35" block. The count of seven is unverified; re-derive the census at Phase 39 plan time, keyed on the seam predicate rather than on any single token.

**Files:** `src/backend/humble/user.ts:274-284, 445, 740, 873-874, 1034-1036`,
`src/backend/storeManagers/legendary/user.ts:167-177`,
`src/backend/humble/loginWindowSeam.ts:17-20`

**Issue:** `meta/__tests__/isTauriRemoved.test.ts` is a well-built zero-match gate with a real
vacuity control, and it passes — I verified independently that `isTauri` appears nowhere under
`src/`, `meta/` or `scripts/`. But `isTauri` was not this codebase's only Electron/Tauri runtime
discriminator. The second one is `getLoginWindowSeam() === null`, documented in
`loginWindowSeam.ts:17-20` as exactly that:

> "The Electron build never calls `setLoginWindowSeam()` at all, so `getLoginWindowSeam()` always
> returns `null` there and `user.ts`'s existing `session.fromPartition` path is exercised exactly
> as before."

`registerHumbleLoginFlows()` calls `setLoginWindowSeam(createRustLoginWindowSeam())`
unconditionally (`humbleLoginFlowRegistration.ts:340`), and `handlers.ts:197` calls that at module
scope. So in the only shell that exists, the seam is **always** installed and every `seam === null`
arm is unreachable. Those arms call `session.fromPartition(...)` followed by `.setUserAgent(...)` /
`.clearStorageData()` etc. against `backend/platform`'s stub, whose members are
`sessionUnavailable(...)` rejectors (`platform/index.ts:801-830`) — so if one ever *were* reached
it would fail, not degrade.

This is the same "collapse each branch pair to its Tauri body" work plan 35-16/35-17 did for
`isTauri`, left undone for a second idiom. It also leaves `loginWindowSeam.ts`'s header stating a
now-false fact about a build that no longer exists.

**Fix:** collapse each `seam === null` arm the same way plan 35-17 collapsed the `isTauri` pairs
(`const seam = getLoginWindowSeam()!` or a non-null-asserting accessor that throws loudly), delete
the `session.fromPartition` bodies, and extend `isTauriRemoved.test.ts` (or add a sibling) with a
second zero-match assertion for `seam === null` under `src/backend/humble` and
`src/backend/storeManagers`, with its own vacuity control. Then the `session` export in
`backend/platform/index.ts:748-830` has no remaining consumer and can go too.

---

### WR-02: `ensureChangeListenerAttached` latches its guard before the subscription resolves, and never catches

**File:** `src/preload/tauriTransport.ts:181-216` (guard), `:122-142` (`listen`)

**Issue:**

```ts
function ensureChangeListenerAttached(): void {
  if (changeListenerAttached) return
  changeListenerAttached = true      // <- set before listen() has resolved
  listen(STORE_CHANGED_CHANNEL, ...)
}
```

and `listen` itself floats the subscription with no rejection handler:

```ts
void tauriListen<...>(FRONTEND_MESSAGE_EVENT, ...).then((fn) => { ... })
//                                                   ^ no .catch()
```

If `tauriListen` rejects (a denied `core:event:allow-listen`, a transport hiccup during boot,
the plugin not yet initialised), two things happen: an unhandled promise rejection is raised in
the renderer, and `changeListenerAttached` stays `true` forever, so the `STORE_CHANGED_CHANNEL`
subscription is never retried. The renderer's snapshot then silently diverges from disk for the
whole session — precisely the `gog-login-ui-never-updates` failure this listener exists to
prevent, restored by a different route.

**Fix:**

```ts
export function listen(channel: string, callback: (...args: unknown[]) => void): () => void {
  let unlisten: UnlistenFn | undefined
  let cancelled = false

  tauriListen<{ channel: string; args: unknown[] }>(FRONTEND_MESSAGE_EVENT, (event) => {
    if (event.payload.channel === channel) callback(...event.payload.args)
  })
    .then((fn) => { if (cancelled) fn(); else unlisten = fn })
    .catch((error: unknown) => {
      // Never an unhandled rejection: a preload throw/rejection at boot blanks the window
      // (SEAM Invariant A), and a silently-dropped subscription desyncs the store snapshot.
      console.error(`[tauriTransport.listen] subscription failed for channel=${channel}:`, error)
      onListenFailed?.(channel)
    })

  return () => { cancelled = true; unlisten?.() }
}
```

and set `changeListenerAttached = true` only inside the resolved path (or reset it in the
`catch`) so a later `registerStore()` re-attempts the subscription.

---

### WR-03: `devSecretVault` follows symlinks and never checks ownership on a predictable `os.tmpdir()` path

**File:** `src/backend/sidecar/devSecretVault.ts:80, 102-152`

**Issue:** The vault writes the Steam refresh token, the Humble session cookie/CSRF token and the
SteamGridDB API key in plaintext to `join(getPath('temp'), 'gamelib-dev-secret-vault.json')` — a
fully predictable filename. On Linux `os.tmpdir()` is the shared, world-writable `/tmp`.

`ensureVaultFileCreated` → `assertOwnerOnlyMode` uses `chmodSync` + `statSync`, both of which
**follow symlinks**, and neither checks `uid`:

```ts
function assertOwnerOnlyMode(path: string): void {
  chmodSync(path, 0o600)                    // follows a symlink to an arbitrary target
  const mode = statSync(path).mode & 0o777  // stats the target, not the link
  ...
}
```

A local attacker who pre-creates `/tmp/gamelib-dev-secret-vault.json` as a symlink to a file the
developer owns gets that file chmod'd to `0600` and then overwritten with the vault JSON — and
subsequent `writeSlot` calls write the developer's real secrets through the link. The module's own
header sets a bar ("a vault that silently degrades to world-readable is the same class of defect
as the `safeStorage` stub") that this check does not meet.

`readVaultFile`'s bare `catch { return {} }` also swallows `EACCES`/`EPERM` and reports "nothing
stored yet", so a hijacked-file condition presents as an empty vault.

**Fix:** open with `O_EXCL|O_NOFOLLOW` and verify ownership by `lstat`, not `stat`:

```ts
import { constants, openSync, closeSync, lstatSync, chmodSync } from 'graceful-fs'

function ensureVaultFileCreated(path: string): void {
  try {
    // O_EXCL|O_CREAT|O_NOFOLLOW: refuses to follow a pre-planted symlink and refuses to
    // adopt a file someone else created first. /tmp is shared on Linux.
    closeSync(openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  const st = lstatSync(path)               // lstat, never stat -- a symlink must FAIL here
  if (st.isSymbolicLink()) throw new Error('vault path is a symlink; refusing')
  if (st.uid !== process.getuid?.()) throw new Error('vault file is not owned by this user; refusing')
  chmodSync(path, 0o600)
  if ((lstatSync(path).mode & 0o777) !== 0o600) throw new Error('vault file mode is not 0600 after chmod')
}
```

Alternatively move the vault under `getPath('userData')` (already per-user) rather than `temp`;
the header's "disposable gate-run scratch" rationale is satisfied by the filename, not the
directory.

---

### WR-04: the phase leaves six `no-unused-vars` lint errors, none of which `pnpm codecheck` can see

**Files:**
- `meta/__tests__/cleanDist.test.ts:21` — `loadYaml` (its only consumer, `parseElectronBuilder`, was deleted)
- `src/backend/__tests__/packagingConfig.test.ts:62-72` — `loadElectronBuilderRaw` / `parseElectronBuilder` / `loadStrippedElectronBuilder`, all reading `ELECTRON_BUILDER_PATH`, a file this phase deleted
- `src/backend/utils.ts:22` — `BrowserWindow`, imported from `backend/platform` and unused
- `src/frontend/screens/WebView/index.tsx:67` — `setAmazonLoginData`, orphaned when the Electron amazon-login effect body was deleted
- `src/backend/sidecar/__tests__/steamAuthFlows.test.ts:152` — `MAIN_TS_PATH`, pointing at the deleted `main.ts`

**Issue:** Measured directly (`pnpm exec eslint` over the phase's 232 changed TS/TSX files):
6 errors, 0 other errors. `tsc --noEmit` is clean, so the project's own `pnpm codecheck` gate
cannot see any of these — this is the recorded `verifier-tsc-gate-cannot-see-lint-errors`
situation. Three of the five are dead code that still names `electron-builder.yml`, i.e. residue
of the cutover rather than incidental untidiness.

**Fix:** delete the unused symbols. In `packagingConfig.test.ts` also delete
`ELECTRON_BUILDER_PATH` and the `ElectronBuilderConfig` interface, and drop the now-unused
`stripHashComments` import if nothing else in that file uses it. Confirm with
`pnpm exec eslint <changed files>` before closing.

---

### WR-05: `release-tauri.yml`'s header describes two workflows this phase deleted

**File:** `.github/workflows/release-tauri.yml:11-19`

**Issue:** The header states:

> "NOTE (Pitfall 7): `draft-release-mac.yml` and `draft-release-linux.yml` also trigger on `v*` and
> will co-run alongside this workflow on every tag push. This is intentional … both pipelines are
> additive per the Phase 27+ Electron/Tauri parity invariant and are ASSUMED to publish to the SAME
> GitHub Release without collision, pending the 34-07 live gate".

Neither file exists in `.github/workflows/` any more. A maintainer reading this header is told to
expect a co-running electron-builder pipeline and an unresolved artifact-name collision risk that
cannot occur. Line 137-141 similarly still explains this step's ordering by reference to
"the Electron `release:mac` script", which `artifactTargets.test.ts` now asserts is gone.

**Fix:** rewrite lines 11-19 to record that this is the sole publishing path as of Phase 35
(which `artifactTargets.test.ts`'s "the TAURI release path is not collateral damage" case already
pins), and reword the steam-bridge step's ordering rationale without referencing a deleted script.

---

### WR-06: `meta/probeSeaInWorker.ts` is throwaway debris its own header says plan 35-18 would delete

**File:** `meta/probeSeaInWorker.ts:32-34`

**Issue:** The file states outright:

> "Handoff: deleted by plan 35-18, which owns the final `electron`-absence / dead-file sweep for
> this phase (recorded so this probe does not become permanent debris — see 35-01-PLAN.md's
> constraints)."

Plan 35-18 ran (it removed the `--alias:electron` flag, the `electron` devDependency, and added
`electronAbsence.test.ts`), and this file survived. It is a one-shot empirical probe wired into no
build path, and it is now the only place in `meta/` that carries a `require('node:sea')` call with
its own inline `new Worker(source, { eval: true })` string. Its docstring also still points at
`src/backend/sidecar/humbleFlowRegistration.ts:159` for `isPackagedSidecar()`, which plan 35-04
moved to `src/backend/sidecar/isPackagedSidecar.ts`.

**Fix:** delete the file (the measurement it produced is recorded in `35-PREFLIGHT.md` OQ-1). If it
is being kept deliberately, replace the "deleted by plan 35-18" handoff line with the actual reason
it is retained and correct the stale `humbleFlowRegistration.ts:159` reference.

---

### WR-07: `tauri.conf.json` disables CSP entirely while the renderer executes user-supplied CSS and exposes `window.__TAURI__`

**File:** `src-tauri/tauri.conf.json:12, 25-27`

**Issue:**

```json
"withGlobalTauri": true,
"security": { "csp": null }
```

`csp: null` means Tauri injects no `Content-Security-Policy` at all. `withGlobalTauri: true` means
every command in `generate_handler!` — including `open_external` (CR-01), `sidecar_invoke` and
`sidecar_store_snapshot` — is callable as `window.__TAURI__.core.invoke(...)` from any script the
page ends up executing. The renderer's own attack surface is not hypothetical: `index.tsx:130-134`
and `:223-238` inject caller-supplied CSS text, and `storePolicy.ts`'s header names "XSS via
themes/custom CSS" as the modelled threat for the store allow-list.

`capabilities/default.json`'s description reasons carefully about which *Tauri plugin* commands the
renderer may reach, but says nothing about the app-defined commands `withGlobalTauri` publishes
alongside them, or about the absence of a CSP.

**Fix:** set a real CSP for the app shell (`default-src 'self'; script-src 'self'; style-src 'self'
'unsafe-inline'; img-src 'self' https: data: asset: http://asset.localhost; connect-src 'self'
ipc: http://ipc.localhost https:`) and verify the theme/custom-CSS path still works (it needs
`style-src 'unsafe-inline'`, not `script-src`). If `withGlobalTauri` is not actually required —
the renderer imports `@tauri-apps/api` directly everywhere I checked — set it to `false`, which
removes the ambient `window.__TAURI__` surface without changing any call site.

---

### WR-08: `installedJsonWatcher` arms only if `installed.json` already exists at boot and never retries

**File:** `src/backend/sidecar/installedJsonWatcher.ts:87-102`

**Issue:**

```ts
if (!existsSync(target)) {
  return false
}
activeWatcher = watch(target, () => { ... })
```

`startInstalledJsonWatcher()` is called exactly once, from `bootstrap.ts:678-687`, and returns
`false` for a profile that has no `installed.json` yet. Nothing ever calls it again. So on a fresh
profile — the case the module's own docstring calls out ("a fresh profile has no `installed.json`
until legendary first writes one") — the `legendary sync-saves` stale-`installedGames` defect this
module exists to fix persists for the entire session, and only self-heals on the next app start.

Separately, `fs.watch` binds to the inode. legendary writes `installed.json` via a temp-file +
rename in some paths; after such a replace the watcher holds a handle on the unlinked old inode and
fires no further events, silently, for the life of the process.

**Fix:** watch the *directory* rather than the file, and filter on the filename — this covers both
the not-yet-created case and the rename-replace case with one handle:

```ts
const dir = dirname(target)
if (!existsSync(dir)) return false
activeWatcher = watch(dir, (_eventType, filename) => {
  if (filename !== basename(target)) return
  if (refreshTimeout) clearTimeout(refreshTimeout)
  refreshTimeout = setTimeout(refresh, INSTALLED_JSON_REFRESH_DEBOUNCE_MS)
  refreshTimeout.unref?.()
})
activeWatcher.unref()
```

Keep the `.unref()` — the `pnpm smoke:sidecar` finding recorded in the current comment still
applies to a directory handle.

---

### WR-09: `sidecar:store-fetch` accepts any syntactically valid store name; the write path does not

**File:** `src/backend/sidecar/handlers.ts:340-355`
**Related:** `src/backend/sidecar/storeWriteHandlers.ts:125-132`

**Issue:** The read handler admits a name that is *either* a universe member *or* merely
pattern-shaped:

```ts
const isUniverseMember = STORE_UNIVERSE.includes(storeName)
const isSyntacticallyValidName = CACHE_STORE_NAME_PATTERN.test(storeName)
if (!isUniverseMember && !isSyntacticallyValidName) { ...reject... }
```

Since `CACHE_STORE_NAME_PATTERN` is `/^[A-Za-z0-9_-]{1,64}$/`, every plausible name passes, so this
guard can only ever fire for a name containing `.`, `/`, a space, or >64 chars. That is *exactly*
the defect WR-01 of the Phase 29 review called out on the write side — and `storeWriteHandlers.ts`
was corrected to require `STORE_UNIVERSE || RECOGNIZED_CACHE_STORE_NAMES` while the read side was
left as-is. Today the outcome is still `{}` because `filterStoreSnapshot` fails closed for an
unknown store name, so the guard "reads as live while being unreachable" — the identical shape the
`DENIED_CACHE_STORES` WR-09 comment in `storePolicy.ts:166-185` warns about, in the file directly
above it.

**Fix:** make the read guard say what it means, mirroring the write path exactly:

```ts
const isUniverseMember = STORE_UNIVERSE.includes(storeName)
const isRecognizedCacheName = RECOGNIZED_CACHE_STORE_NAMES.includes(storeName)
if (!isUniverseMember && !isRecognizedCacheName) {
  process.stderr.write(
    `[sidecar/handlers] sidecar:store-fetch rejected an unrecognized store name: '${storeName}'\n`
  )
  return {}
}
```

---

### WR-10: `storeGet`'s blocked-read warning mislabels every non-allow-listed field as a credential

**File:** `src/preload/api/misc.ts` (`storeGet`), `src/preload/tauriTransport.ts:385-391`

**Issue:** Plan 35-16 converged `misc.ts`'s `storeGet` from a five-key deny-list onto
`isAllowedStoreField`, but kept the deny-list-era message:

```ts
if (!isAllowedStoreField(storeName, key)) {
  console.warn(`storeGet: blocked read of credential key "${key}" from "${storeName}"`)
  return undefined
}
```

Under the allow-list, this branch fires for **any** field not enumerated in `STORE_ALLOWLIST` —
overwhelmingly a new `StoreStructure` field someone forgot to add, not a credential. A maintainer
debugging a missing store value gets told the field is a credential, which is the opposite of the
diagnosis they need. `snapshotGet` (`tauriTransport.ts:387-390`) then logs a *second*, correctly
worded warning for the same read, so every blocked read produces two contradictory console lines.

**Fix:** reword and drop the duplicate. `snapshotGet` already gates and warns correctly, so either
delete the `misc.ts` gate entirely (the comment claims it exists so "the warning names WHICH store
and key were blocked" — `snapshotGet`'s already does), or reword it:

```ts
console.warn(
  `storeGet: blocked read of "${key}" from "${storeName}" -- not in the store-field allow-list ` +
    '(a secret is excluded on purpose; a non-secret is a missing STORE_ALLOWLIST entry)'
)
```

---

## Info

### IN-01: `Promise.race` hydration timeout leaks its timer

**File:** `src/frontend/index.tsx:66-79`
**Issue:** The 8000 ms rejection timer is never cleared when `hydrateStoreSnapshot()` wins the
race, so an 8-second timer stays armed after a successful boot and its rejection is discarded by
the already-settled race. Harmless (one-shot, at boot), but it means a successful hydrate still
holds a pending timer for 8 s, and any future move of this block into a retry loop would leak one
per attempt.
**Fix:** capture the handle and `clearTimeout` it in a `finally`.

### IN-02: `trayResolveRunner`'s "called by the Rust shell, not the renderer" claim is not enforced

**File:** `src/backend/sidecar/appShellFlowRegistration.ts:412-448`
**Issue:** The channel is registered on the same `ipcMain.handle` registry every renderer-facing
channel uses, so `window.api`-adjacent code (and anything reaching `sidecar_invoke`) can call it
identically. The consequence today is benign — it is a read-only library lookup that returns a
runner name or `null` — but the comment states a restriction that does not exist, and the same
comment shape is what made `handleProtocolUrl`'s direction auditable.
**Fix:** either drop the "not by the renderer" claim, or state that the channel is
renderer-reachable and harmless, so a future reader does not rely on a boundary that is not there.

### IN-03: `seaEsbuildFlags()`'s docstring count is stale

**File:** `meta/esbuildWorkerBundleShared.ts:246-248`
**Issue:** "The nine esbuild flags … extended to ten by Phase 23.1 Plan 03" — the returned array is
now 7 flags plus `--outfile` and the entry path, after Plan 18 removed `--alias:electron`. Counts in
docstrings are exactly what `handlers.ts`'s own IN-01 (34.2 review round 1) resolved by moving each
count to one place and gating it; this one drifted again.
**Fix:** drop the count, or state it as "the flags returned below" without a number.

---

_Reviewed: 2026-08-30T03:54:11Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
