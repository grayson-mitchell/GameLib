---
phase: quick-261023-vkv
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/Cargo.toml
  - src-tauri/Cargo.lock
  - src-tauri/src/main.rs
  - src-tauri/src/notification_backend.rs
  - src-tauri/src/macos_notifications.rs
  - src/common/types/sidecarTransport.ts
  - src/backend/platform/index.ts
  - src/backend/dialog/dialog.ts
  - src/backend/__tests__/notificationFailureLogging.test.ts
  - .planning/todos/pending/2026-10-17-packaged-macos-build-delivers-no-notifications.md
autonomous: false
requirements:
  - TODO-2026-10-17-packaged-macos-build-delivers-no-notifications

must_haves:
  truths:
    - "A packaged macOS GameLib.app asks for notification permission once, at first launch, with an Alert + Sound request"
    - "After the user allows it, notify() callers (e.g. Remove shortcuts) show a banner carrying the GameLib icon, even while GameLib is the frontmost app"
    - "System Settings → Notifications lists a GameLib entry"
    - "If authorization is denied or delivery fails, a warning appears in the sidecar's backend log (logWarning), not only on stderr. A denial is logged once per process; any other failure is logged every time it happens"
    - "`pnpm tauri:dev` keeps its current behaviour: it goes through tauri-plugin-notification and shows Terminal's icon, and it never touches UNUserNotificationCenter"
    - "Windows and Linux notification behaviour is unchanged"
  artifacts:
    - path: "src-tauri/src/notification_backend.rs"
      provides: "cfg-free pure logic (which backend to use, mapping an authorization status to the error contract, the timeout constant), unit-tested by `cargo test` on every OS"
      contains: "fn select_notification_backend"
    - path: "src-tauri/src/macos_notifications.rs"
      provides: "UNUserNotificationCenter FFI: startup init (delegate + authorization request) and bounded synchronous delivery"
      contains: "UNUserNotificationCenter"
    - path: "src-tauri/Cargo.toml"
      provides: "macOS-only objc2-user-notifications 0.3.2 direct dependency"
      contains: "objc2-user-notifications"
    - path: "src/backend/__tests__/notificationFailureLogging.test.ts"
      provides: "Proves a rejected notification_show reaches logWarning, and that a denial is logged only once"
  key_links:
    - from: "src-tauri/src/main.rs notification_show arm"
      to: "macos_notifications::deliver"
      via: "#[cfg(target_os = \"macos\")] early return when select_notification_backend says UserNotifications"
      pattern: "macos_notifications::deliver"
    - from: "src-tauri/src/main.rs .setup(move |app| ...)"
      to: "macos_notifications::init_at_startup"
      via: "non-blocking call inside setup"
      pattern: "macos_notifications::init_at_startup"
    - from: "src/backend/platform/index.ts Notification.show() rejection"
      to: "src/backend/dialog/dialog.ts notify() 'failed' listener -> logWarning"
      via: "Electron-shaped on('failed', (event, error: string)) emitted by the stub"
      pattern: "on\\('failed'"
---

<objective>
Get notifications to show up in a packaged (signed) macOS GameLib.app. Today they are sent
through `tauri-plugin-notification` → notify-rust → mac-notification-sys → the deprecated
`NSUserNotificationCenter`. On this macOS that path never prompts and never registers the app,
and the plugin throws the result away. The fix is to deliver through `UNUserNotificationCenter`
from Rust, ask for `.alert | .sound` authorization once at startup, keep the plugin as the
fallback for `tauri::is_dev()` and for builds with no bundle, and make every authorization and
delivery failure show up in the sidecar's real backend log.

Purpose: about 15 `notify()` callers are silently dropped in shipped builds (install, uninstall
and move finished; download paused, canceled and failed; shortcuts; wine manager; repair). The
todo `.planning/todos/pending/2026-10-17-packaged-macos-build-delivers-no-notifications.md`
(severity: major) records the mechanism.

Output: a new Rust module pair (pure + macOS FFI), a rewired `notification_show` arm and setup
hook, an Electron-shaped `'failed'` event on the sidecar Notification stub that `notify()` logs
through `logWarning`, jest and cargo tests, and a packaged-build human checkpoint.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/todos/pending/2026-10-17-packaged-macos-build-delivers-no-notifications.md
@.planning/quick/261017-cwf-fix-the-macos-game-uninstalled-notificat/261017-cwf-SUMMARY.md

Load `Skill("gamelib-conventions")` before writing any file (the `<verify>` formatter rule and
the sidecar exit contract apply). Load `Skill("spike-findings-gamelib")` for the Tauri/objc2
patterns.

<interfaces>
<!-- Extracted from the codebase during planning. Use these directly. -->

Already resolved in src-tauri/Cargo.lock (do NOT pick a different version):
  objc2 0.6.4, block2 0.6.2, objc2-foundation 0.3.2, dispatch2 0.3.1,
  objc2-user-notifications 0.3.2 (currently pulled only by objc2-ui-kit, i.e. iOS-target lock
  entry; its own deps are objc2 + objc2-foundation). It is ALREADY listed in
  `EXPECTED_LOCKFILE_CRATE_NAMES` in src/backend/__tests__/cargoFeatures.test.ts:226.
  objc2-user-notifications 0.3.2 features: default = NSString_UserNotifications, UNError,
  UNNotification, UNNotificationAction, UNNotificationActionIcon, UNNotificationAttachment,
  UNNotificationAttributedMessageContext, UNNotificationCategory, UNNotificationContent,
  UNNotificationRequest, UNNotificationResponse, UNNotificationServiceExtension,
  UNNotificationSettings, UNNotificationSound, UNNotificationTrigger, UNUserNotificationCenter,
  bitflags, block2, objc2-core-location, std.

src-tauri/Cargo.toml:122 — `[target.'cfg(target_os = "macos")'.dependencies]` table. Its
existing entries (objc2-app-kit, objc2-web-kit, objc2-core-foundation) each carry a comment
block that explains why the crate is there and says the lockfile was checked. Match that style.

src-tauri/src/main.rs:
  :56-70   external `mod` declarations (`#[cfg(target_os = "macos")] mod macos_epic_embed;`,
           then cfg-free `mod epic_embed_state;` marked with
           `#[cfg_attr(not(target_os = "macos"), allow(dead_code))]` so Linux `cargo test`
           covers it). Copy this pairing.
  :3894-3960 `define_class!` delegate pattern (EpicPristineNavDelegate) to copy for the UN
           delegate.
  :7463    `fn dispatch_rust_channel(channel: &str, args: &[Value], app: &AppHandle) -> Result<Value, String>`
           runs on a spawned worker thread (:12216), so a bounded blocking wait (mpsc
           recv_timeout) inside an arm is fine. `dialog_message` already blocks on rx.recv().
           The bounded-wait precedent is `KEYRING_READ_TIMEOUT` / `bounded_keyring_read`.
  :7843    the current `"notification_show" => { ... builder.show().map_err(...)?; Ok(Value::Null) }` arm
           (reads optional args[0].title / args[0].body).
  :12582   `.setup(move |app| { ... })`, which runs on the main thread.
  `eprintln!` is the shell's only logger. Packaged stderr is /dev/null, so it is NOT a
  visibility channel.

src/backend/platform/index.ts (sidecar Electron stub; it MUST NOT import 'backend/logger', see
its module-scope note and :538):
  export class Notification {
    static isSupported(): boolean            // true
    constructor(options?: NotificationOptions)
    on(_event?: string, _listener?: () => void): this   // currently a no-op
    show(): void   // requestRustInvoke(RUST_NOTIFICATION_SHOW, [{title, body}]).catch(console.warn)
    close(): void
  }
  requestRustInvoke rejects with `new Error(errorMessage)`, where errorMessage is the Rust arm's
  Err string (src/backend/sidecar/sidecarRpc.ts:268).

src/backend/dialog/dialog.ts:
  import { LogPrefix, logInfo, logWarning } from 'backend/logger'
  :85 function notify({ body, title }: NotifyType) — builds `new Notification({...})`,
      registers `.on('click', () => mainWindow?.show())`, then calls `.show()`.

src/common/types/sidecarTransport.ts:192
  export const RUST_NOTIFICATION_SHOW = 'notification_show' as const
  (this file is the contract mirror of main.rs's channel names)

Existing tests that must stay green:
  src/backend/sidecar/__tests__/appShellFlows.test.ts:466 (notify → notification_show args)
  src/backend/__tests__/tauriShellSource.test.ts:346 (dispatch arm-name allow-list; the arm
    name `notification_show` does not change, so add NO new arm)
  src/backend/__tests__/cargoFeatures.test.ts (lockfile crate-name pin)
</interfaces>

## Error-string contract (Rust Err → sidecar), fixed by this plan

The Rust arm returns these exact prefixes. The TS side matches on the prefix with `startsWith`.
- `notification:authorization-denied`: UNAuthorizationStatus is Denied
- `notification:authorization-not-determined`: the user has not answered the startup prompt yet.
  If the startup request finished with an NSError, append `: <localizedDescription>`.
- `notification:settings-timeout`: getNotificationSettings did not complete within the timeout
- `notification:delivery-failed: <localizedDescription>`: addNotificationRequest completed with an NSError
- `notification:delivery-timeout`: addNotificationRequest did not complete within the timeout

Authorized, Provisional and Ephemeral all count as deliverable. Any other raw status value maps
to `notification:authorization-denied` with ` (status <n>)` appended.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Rust — deliver through UNUserNotificationCenter in packaged macOS builds, plugin fallback for dev/no-bundle</name>
  <files>src-tauri/Cargo.toml, src-tauri/Cargo.lock, src-tauri/src/notification_backend.rs, src-tauri/src/macos_notifications.rs, src-tauri/src/main.rs</files>
  <behavior>
    - select_notification_backend(is_dev=true, any bundle) returns Plugin
    - select_notification_backend(is_dev=false, bundle_identifier=None, _) returns Plugin (a binary run outside a .app; UN* would throw "bundleProxyForCurrentProcess is nil")
    - select_notification_backend(is_dev=false, Some("com.gamelib.shell"), bundle_path_is_app=false) returns Plugin
    - select_notification_backend(is_dev=false, Some("com.gamelib.shell"), true) returns UserNotifications
    - authorization_gate(Authorized | Provisional | Ephemeral) returns Ok(()); Denied returns Err starting "notification:authorization-denied"; NotDetermined returns Err starting "notification:authorization-not-determined"; Unknown(7) returns Err "notification:authorization-denied (status 7)"
    - authorization_gate(NotDetermined) with a stored startup error "boom" returns "notification:authorization-not-determined: boom"
  </behavior>
  <action>
    1. Cargo.toml: in the existing `[target.'cfg(target_os = "macos")'.dependencies]` table, add
    `objc2-user-notifications = { version = "0.3.2", default-features = false, features = [...] }`.
    Request only what this code names: `std`, `bitflags`, `block2`,
    `UNUserNotificationCenter`, `UNNotificationRequest`, `UNNotificationContent`,
    `UNNotificationSound`, `UNNotificationTrigger`, `UNNotificationSettings`, `UNNotification`,
    `UNError`. After `cargo fetch`, read the generated bindings
    (`~/.cargo/registry/src/*/objc2-user-notifications-0.3.2/src/generated/UNUserNotificationCenter.rs`
    and siblings) for the exact `#[cfg(feature = ...)]` gates on the methods you call. Add a
    feature only when a gate requires it, and record each addition in the comment. Leave out
    `objc2-core-location`. Above the line, write a comment block in the house style: it fixes
    the 261017-cwf / todo 2026-10-17 defect; the crate is already resolved at 0.3.2 in
    Cargo.lock (via objc2-ui-kit) and already in `EXPECTED_LOCKFILE_CRATE_NAMES`, so no new
    crate enters the tree; it is macOS-only. Then run `cargo build` and
    `git diff -- src-tauri/Cargo.lock`. The only acceptable lockfile change is
    `objc2-user-notifications` added to the `gamelib-shell` package's `dependencies` list. A new
    or changed `[[package]]` block means stop and report.

    2. New file `src-tauri/src/notification_backend.rs`. It is cfg-free, pure, and has no objc2
    imports. Declare it in main.rs next to `mod epic_embed_state;` with
    `#[cfg_attr(not(target_os = "macos"), allow(dead_code))]`, the same pairing as main.rs:56-62,
    so Linux/Windows `cargo test --bin gamelib-shell` covers it. It holds:
    - `enum NotificationBackend { Plugin, UserNotifications }`
    - `fn select_notification_backend(is_dev: bool, bundle_identifier: Option<&str>, bundle_path_is_app: bool) -> NotificationBackend`
    - `enum AuthStatus { NotDetermined, Denied, Authorized, Provisional, Ephemeral, Unknown(isize) }`
      plus `fn auth_status_from_raw(isize) -> AuthStatus`. Raw values per Apple: 0 NotDetermined,
      1 Denied, 2 Authorized, 3 Provisional, 4 Ephemeral.
    - `fn authorization_gate(status: AuthStatus, startup_error: Option<&str>) -> Result<(), String>`,
      which emits exactly the error-string contract in `<context>`
    - `const NOTIFICATION_COMPLETION_TIMEOUT: Duration = Duration::from_secs(5)`. Doc comment:
      bounded well under the sidecar's 60s `RUST_INVOKE_TIMEOUT_MS`, same reasoning as
      `KEYRING_READ_TIMEOUT`.
    Write the `#[cfg(test)] mod tests` cases from `<behavior>` first (RED), then implement (GREEN).

    3. New file `src-tauri/src/macos_notifications.rs`, declared
    `#[cfg(target_os = "macos")] mod macos_notifications;` next to `mod macos_epic_embed;`.
    Module doc comment: the mechanism from the todo (NSUserNotificationCenter is deprecated and
    on macOS 26 never prompts or registers; the plugin discards the result) and why dev keeps
    the plugin (UN* needs a real bundle; `tauri dev` borrows Terminal's authorization, by the
    plugin's own design). It exposes:
    - `fn backend() -> NotificationBackend`: calls `select_notification_backend(tauri::is_dev(),
      NSBundle::mainBundle().bundleIdentifier(), mainBundle bundlePath ends with ".app")`.
      Compute it once and cache it in a `OnceLock`. This guard is what keeps
      `UNUserNotificationCenter::currentNotificationCenter()` from ever being called outside a
      real bundle. Every other function here returns early unless this is `UserNotifications`.
    - `fn init_at_startup()`: called from `.setup()` on the main thread, and it must not block.
      If the backend is UserNotifications:
      (a) Create a `define_class!` NSObject subclass `GameLibNotificationDelegate` (AnyThread,
      copied from the EpicPristineNavDelegate pattern at main.rs:3894-3960) that conforms to
      `UNUserNotificationCenterDelegate` and implements
      `userNotificationCenter:willPresentNotification:withCompletionHandler:`. The handler calls
      the completion block with `Banner | List | Sound`. Without this delegate, macOS hides the
      banner whenever GameLib is frontmost, and every in-app trigger (Remove shortcuts) fires
      while it is frontmost. Set it with `setDelegate`. The center holds its delegate weakly, so
      keep it alive for the process lifetime with a deliberate, commented leak
      (`Retained::into_raw`), not a local that drops.
      (b) Call `requestAuthorizationWithOptions_completionHandler(Alert | Sound, block)` and
      return immediately. The completion block runs on a background queue. If it gets an
      NSError, store `localizedDescription` in a `static STARTUP_AUTH_ERROR: OnceLock<String>`.
      If granted is false, store nothing: the live settings check in `deliver` reports Denied.
      `eprintln!` the outcome with a `[shell]` prefix for dev visibility only. Do not rely on
      that line; delivery-time errors are the visible channel.
    - `fn deliver(title: Option<&str>, body: Option<&str>) -> Result<(), String>`. It runs on the
      dispatch worker thread and may block for a bounded time:
      (1) `getNotificationSettingsWithCompletionHandler`. Send `authorizationStatus().0` through
      an `std::sync::mpsc` channel from the block, then
      `recv_timeout(NOTIFICATION_COMPLETION_TIMEOUT)`. On timeout return
      `notification:settings-timeout`. Otherwise
      `authorization_gate(auth_status_from_raw(raw), STARTUP_AUTH_ERROR.get())?`. A live check on
      every call means a later toggle in System Settings is honoured.
      (2) Build `UNMutableNotificationContent`: setTitle/setBody from the args (each only when
      present, mirroring the old arm) and setSound to `UNNotificationSound::defaultSound()`.
      Then `UNNotificationRequest::requestWithIdentifier_content_trigger` with identifier
      `gamelib-<unix-nanos>-<AtomicU64 counter>` and trigger None (deliver now).
      (3) `addNotificationRequest_withCompletionHandler`. The block sends
      `Option<String>` (the NSError's localizedDescription) on a channel. On timeout return
      `notification:delivery-timeout`; `Some(e)` returns `notification:delivery-failed: {e}`;
      `None` returns Ok.
      Wrap the channel Sender in whatever the block's `Fn + 'static` bound needs (Sender::send
      takes &self, so a move-captured Sender works). Check each method's exact signature and
      `unsafe` requirements against the generated bindings, and write a `// SAFETY:` comment on
      every unsafe block.

    4. main.rs wiring:
    (a) In the `"notification_show"` arm, before the plugin builder, add a
    `#[cfg(target_os = "macos")]` block. When `macos_notifications::backend()` is
    `UserNotifications`, return
    `macos_notifications::deliver(title, body).map(|()| Value::Null)`, so the Err string reaches
    the sidecar as a rejection. Read the args once, with the same `args.first().and_then(...)`
    idiom, and share them between both paths. The plugin path below stays byte-for-byte the same
    in behaviour; it is the dev and non-macOS route. Update the arm's comment: the old claim
    that "show() ... returns promptly" now applies only to the plugin path, and on macOS the
    packaged path waits at most two `NOTIFICATION_COMPLETION_TIMEOUT`s on the worker thread.
    (b) In `.setup(move |app| { ... })` (main.rs:12582), add
    `#[cfg(target_os = "macos")] macos_notifications::init_at_startup();` early, after the
    plugins are registered and before the window is shown, with a one-line comment pointing at
    the module doc. Add no new dispatch arm: tauriShellSource.test.ts pins the arm list.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib/src-tauri && cargo build && cargo test --bin gamelib-shell notification_backend && cargo test --bin gamelib-shell && cd .. && git diff --stat -- src-tauri/Cargo.lock && npx jest src/backend/__tests__/cargoFeatures.test.ts src/backend/__tests__/tauriShellSource.test.ts && rustfmt --edition 2021 --check src-tauri/src/notification_backend.rs src-tauri/src/macos_notifications.rs</automated>
    Formatter note per the gamelib-conventions verify rule: `npx prettier --file-info` reports
    `src-tauri/src/main.rs` and `src-tauri/Cargo.toml` as `"ignored": false` but with
    `"inferredParser": null`. Prettier has no parser for `.rs`/`.toml`, so a `--check` over them
    would prove nothing and is deliberately left out. The two NEW `.rs` files are gated with
    `rustfmt --check` instead. main.rs has no repo-wide rustfmt baseline, so it is not gated.
    Hand-match its surrounding style.
  </verify>
  <done>
    cargo build and every `cargo test --bin gamelib-shell` test pass on macOS, including the six
    new notification_backend cases. Cargo.lock's only change is one dependency-list line.
    cargoFeatures and tauriShellSource jest suites pass. A grep for `currentNotificationCenter`
    shows it is reached only through code that has already checked `backend() == UserNotifications`.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Sidecar — surface notification_show rejections through logWarning via an Electron-shaped 'failed' event</name>
  <files>src/common/types/sidecarTransport.ts, src/backend/platform/index.ts, src/backend/dialog/dialog.ts, src/backend/__tests__/notificationFailureLogging.test.ts</files>
  <behavior>
    - The stub Notification's on('failed', listener) stores the listener. When the notification_show rustInvoke rejects with Error("notification:delivery-failed: x"), show() calls the listener with (eventLike, "notification:delivery-failed: x"). It still never throws, and it still console.warns as before.
    - on('click', ...) and other events remain accepted no-ops (click delivery is not part of this fix). on() still returns this.
    - When the rejection is "notification:delivery-failed: x", notify() logs one logWarning containing the title and the error, with LogPrefix.Backend, every time.
    - When the rejection starts with "notification:authorization-denied", notify() logs it on the first occurrence only. A second notify() that is also denied adds no further logWarning.
    - A successful show() calls no 'failed' listener and logs no logWarning.
    - The existing appShellFlows REQ-34.1-05 notify test (exact notification_show args) still passes.
  </behavior>
  <action>
    1. sidecarTransport.ts: next to `RUST_NOTIFICATION_SHOW` (:192), export
    `RUST_NOTIFICATION_AUTH_DENIED_PREFIX = 'notification:authorization-denied' as const`. Its doc
    comment says it mirrors the Rust `authorization_gate` contract in
    `src-tauri/src/notification_backend.rs` and lists the other four prefixes in prose. Those
    four need no constant, because only the denied prefix drives TS behaviour.

    2. platform/index.ts `Notification`: store listeners per event name in a private
    `Map<string, Array<(...args: unknown[]) => void>>`. Widen `on`'s listener type to
    `(...args: any[]) => void` or an equivalent that still accepts dialog.ts's `() => void`
    click handler. In `show()`'s existing `.catch`, keep the console.warn, then call each
    `'failed'` listener with `({ sender: this }, message)`, matching Electron's
    `'failed'(event, error: string)` signature, where `message` is `error.message` or
    `String(error)`. Wrap each listener call in its own try/catch so the total-method,
    never-throw convention holds. Do NOT import `backend/logger` here (module-scope rule at
    :538); the logging happens in the consumer. Update the section comment block (~:576-587):
    `show()` now reports failures through `'failed'`, and the old line "zero-change consumer"
    no longer holds, because dialog.ts subscribes to `'failed'`.

    3. dialog.ts `notify()`: register
    `notify.on('failed', (_event, error: string) => { ... })` before `.show()`. If `error`
    starts with `RUST_NOTIFICATION_AUTH_DENIED_PREFIX` and a module-level
    `let loggedNotificationAuthDenied = false` is already set, return. Otherwise set the flag
    when it is a denial, and call
    `logWarning(\`notify(): "${title}" was not delivered (${error})\`, LogPrefix.Backend)`. For a
    denial, add the hint `— enable GameLib in System Settings → Notifications`. A one-line
    comment explains why the denial is logged once (it persists until the user changes it, so
    logging every notify() would flood the log) while other failures are logged each time
    (they are per-delivery). Export a test-only reset if the test needs one (house style: check
    for an existing `__resetForTests`-style precedent with grep and follow it). If there is no
    precedent, use `jest.isolateModules` in the test instead.

    4. New test `src/backend/__tests__/notificationFailureLogging.test.ts`. Mock the module
    `platform/index.ts` takes `requestRustInvoke` from (find the import path; follow
    appShellFlows.test.ts's `mockRequestRustInvoke` setup) and spy on `backend/logger`'s
    `logWarning`. Mock `isSteamDeckGameMode` false and `getMainWindow`. Cover every
    `<behavior>` bullet. Write it first and watch it fail (RED), then implement (GREEN).
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/__tests__/notificationFailureLogging.test.ts src/backend/sidecar/__tests__/appShellFlows.test.ts src/backend/sidecar/__tests__/gameDetailsFlows.test.ts && pnpm codecheck && npx prettier --check src/common/types/sidecarTransport.ts src/backend/platform/index.ts src/backend/dialog/dialog.ts src/backend/__tests__/notificationFailureLogging.test.ts</automated>
  </verify>
  <done>
    The new suite and both existing sidecar flow suites pass, `pnpm codecheck` exits 0, and
    prettier --check is clean over the four TS paths. A rejected notification_show now produces
    a logWarning line in the backend log. A denial produces exactly one.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Packaged-build live gate on the operator's Mac</name>
  <files>src-tauri/target/debug/bundle/macos/GameLib.app (build output only, not committed)</files>
  <action>Before pausing, Claude runs `pnpm tauri:dev:packaged` (that is, `tauri build --debug`), confirms the bundle exists, and prints `codesign -dv` for it. Then Claude stops and hands the steps in how-to-verify to the operator. No source edits happen in this task.</action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm tauri:dev:packaged && test -d src-tauri/target/debug/bundle/macos/GameLib.app && codesign -dv src-tauri/target/debug/bundle/macos/GameLib.app</automated>
    <human-check>Steps 1-7 in how-to-verify. Writes no prettier-visible files, so no formatter check applies.</human-check>
  </verify>
  <done>The operator types "approved" after steps 2-5 (and 7) behave as expected on the packaged bundle.</done>
  <what-built>
    Packaged macOS builds now deliver through UNUserNotificationCenter, with a startup
    authorization request and a foreground-presentation delegate. Failures appear in the backend
    log. The dev build is unchanged. Before stopping here, Claude has run
    `pnpm tauri:dev:packaged` (that is, `tauri build --debug`) and confirmed the bundle exists at
    `src-tauri/target/debug/bundle/macos/GameLib.app`. `tauri:dev` cannot reproduce the bug,
    because it borrows Terminal's authorization, so only a packaged bundle counts.
  </what-built>
  <how-to-verify>
    1. Quit any running GameLib or Heroic. Open System Settings → Notifications and confirm there
       is no `GameLib` entry yet. Record whether one is already there.
    2. Launch `open -n src-tauri/target/debug/bundle/macos/GameLib.app`. Expected: a macOS
       "GameLib would like to send you notifications" prompt appears at first launch. Click Allow.
    3. With GameLib frontmost, pick a Steam game → dots menu → Remove shortcuts (or any other
       notify() caller). Expected: a banner with the GameLib icon (not Terminal's), and the item
       stays in Notification Centre.
    4. System Settings → Notifications now lists `GameLib`, with Alerts/Sounds enabled.
    5. Denial path: in System Settings, turn GameLib's "Allow notifications" off, then trigger
       Remove shortcuts twice. Expected: no banner, and the backend log (in-app log viewer or the
       sidecar log file) has exactly ONE
       `notify(): "…" was not delivered (notification:authorization-denied…)` warning. Turn it
       back on afterwards.
    6. Optional but authoritative: repeat steps 2–4 on a Developer-ID-signed release bundle
       (`tauri build`, Team S7U223QWXJ) at `src-tauri/target/release/bundle/macos/GameLib.app`.
    7. Regression: `pnpm tauri:dev` → Remove shortcuts still shows a banner (Terminal's icon is
       expected and by design).
  </how-to-verify>
  <resume-signal>Type "approved", or describe which step failed and what you saw (prompt? banner? log line?)</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| sidecar → Rust shell (rustInvoke `notification_show`) | title/body strings come from in-app backend callers, never renderer free text |
| Rust shell → macOS UserNotifications | an OS API, reached through objc2 FFI |
| crates.io → build | a cargo dependency promoted to direct |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-vkv-01 | Denial of Service | `notification_show` arm blocking the dispatch worker | mitigate | both completion waits are `recv_timeout(NOTIFICATION_COMPLETION_TIMEOUT = 5s)`, bounded well under the 60s RUST_INVOKE_TIMEOUT_MS, and return the named errors `settings-timeout`/`delivery-timeout` |
| T-vkv-02 | Denial of Service | `currentNotificationCenter` raising an ObjC exception outside a bundle and crashing the shell | mitigate | `select_notification_backend` guard (is_dev, bundleIdentifier present, bundlePath ends .app), unit-tested; UN* is reachable only behind it |
| T-vkv-03 | Repudiation | silently dropped notifications (the defect itself) | mitigate | every failure prefix reaches `logWarning` through the `'failed'` event; covered by notificationFailureLogging.test.ts |
| T-vkv-04 | Information Disclosure | notification text in the log | accept | titles/bodies are game names and status text that the backend already logs; no secrets |
| T-vkv-05 | Tampering | spoofed content via title/body | accept | the strings are set as plain NSString title/body; no markup or URL is interpreted |
| T-vkv-SC | Tampering | `objc2-user-notifications` dependency | mitigate | already resolved at 0.3.2 with its checksum in Cargo.lock and pinned in `EXPECTED_LOCKFILE_CRATE_NAMES`; same objc2 project as the five objc2 crates already declared; the Task 1 verify fails on any new `[[package]]` entry. No npm/pip install, so no legitimacy checkpoint is needed |
</threat_model>

<verification>
- `cargo test --bin gamelib-shell` and `cargo build` green on macOS; `notification_backend` tests are cfg-free and also run in rust-test.yml CI on other OSes
- jest suites: notificationFailureLogging, appShellFlows, gameDetailsFlows, cargoFeatures, tauriShellSource
- `pnpm codecheck` exits 0; prettier --check is clean over the TS paths written
- `pnpm planning-gates` green after the todo move
- Task 3 human gate approved on a packaged bundle
</verification>

<success_criteria>
- The packaged GameLib.app shows the permission prompt, delivers banners (also while frontmost) with the GameLib icon, and appears in System Settings → Notifications
- A denied or failed delivery leaves a logWarning line in the backend log; a denial is logged once
- The dev build and the Windows/Linux paths are unchanged
- After "approved": `git mv .planning/todos/pending/2026-10-17-packaged-macos-build-delivers-no-notifications.md .planning/todos/completed/`
  and append a `## Closed` section (house style, see
  `.planning/todos/completed/2026-10-16-steam-uninstall-notification-shows-terminal-icon.md`).
  It names quick task 261023-vkv, the mechanism fixed, and the packaged-build results observed
  at each Task 3 step. Then `pnpm planning-gates` is green. This path is under `.planning`, which
  prettier ignores, so no formatter check applies to it.
</success_criteria>

<output>
Create `.planning/quick/261023-vkv-deliver-macos-notifications-via-unuserno/261023-vkv-SUMMARY.md` when done
</output>
