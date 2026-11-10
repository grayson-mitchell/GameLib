use super::*;

mod invite_picker;
pub(crate) use invite_picker::*;
mod humble_cookies;
pub(crate) use humble_cookies::*;
mod humble_reveal;
pub(crate) use humble_reveal::*;
mod humble_open;
pub(crate) use humble_open::*;
mod devtools;
pub(crate) use devtools::*;
mod humble_helpers;
pub(crate) use humble_helpers::*;
mod windows_cdp;
#[cfg(any(target_os = "macos", windows))]
pub(crate) use windows_cdp::*;
// TEMP-DIAG(webview2-humble-deletecookie): debug-build live-gate diagnostics, see the file header for removal.
#[cfg(windows)]
mod windows_cookie_diag;
#[cfg(windows)]
pub(crate) use windows_cookie_diag::*;
#[cfg(target_os = "macos")]
mod pristine_epic;
#[cfg(target_os = "macos")]
pub(crate) use pristine_epic::*;
#[cfg(target_os = "macos")]
mod sheet;
#[cfg(target_os = "macos")]
pub(crate) use sheet::*;
#[cfg(target_os = "macos")]
mod macos_cookies;
#[cfg(target_os = "macos")]
pub(crate) use macos_cookies::*;

// ---- Login-window (child WebviewWindow) support (Phase 34.4.1 Plan 01, D-01/D-02) ----
//
// D-02's resolved shape: a runner-agnostic set of `dispatch_rust_channel` arms -- nothing
// below knows what Humble is -- reached only via `requestRustInvoke()` from the headless
// Node sidecar, the same pattern as the keyring/dialog_open/clipboard arms above and
// below. Pure logic (label generation, URL validation, the domain-suffix filter, event
// shaping) is extracted into `AppHandle`-free functions here, proven by
// `#[cfg(test)] mod tests`; the arms' actual `WebviewWindowBuilder`/`cookies()`/
// `delete_cookie()` calls are proven empirically instead, by this phase's REQ-34.4.1-12
// blocking live gate (`34.4.1-LIVE-GATE.md`), the same split Phase 34.3's clipboard arms
// use.

/// Monotonic counter feeding `next_login_window_label()`. Process-static, mirrors this
/// file's existing `SidecarState::next_id()` counter shape.
static LOGIN_WINDOW_LABEL_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Navigation events observed by the `on_page_load` hook (Pattern 4 below), queued per
/// window label and drained by `humble_login_take_events`. `Mutex<Option<HashMap<..>>>`
/// rather than `Mutex<HashMap<..>>` because `HashMap::new()` is not a `const fn` (its
/// default `RandomState` seed is not const-constructible) -- the map is created lazily on
/// first use instead.
pub(crate) static LOGIN_WINDOW_EVENTS: Mutex<Option<HashMap<String, Vec<Value>>>> = Mutex::new(None);

/// Per-label cap on `LOGIN_WINDOW_EVENTS`, oldest-dropped past this bound (threat
/// T-34.4.1-09): a page that navigates in a loop must not grow the queue without bound
/// between `humble_login_take_events` drains.
const LOGIN_WINDOW_EVENTS_CAP: usize = 50;

/// Canonical label for the app's single Tauri-managed main window (the only entry in
/// `tauri.conf.json`'s `app.windows` array). Used both by the always-compiled tray/devtools
/// call sites below (`main()`'s `.setup()` closure) and by the macOS-only login-window
/// attachment helpers this phase adds (Phase 34.4.2 Plan 02) -- kept as a single plain
/// `const`, not `#[cfg(target_os = "macos")]`-gated, so the label has exactly one definition
/// across the whole file regardless of which call sites end up using it on a given platform.
pub(crate) const MAIN_WINDOW_LABEL: &str = "main";

/// Host this arm uses to decide whether the window it is about to open is Epic's --
/// the ONLY signal available here, since `LoginWindowSeam.open()` (`loginWindowSeam.ts`)
/// takes no `runner` argument and `humble_login_open` is runner-agnostic by design. Mirrors
/// the literal host of `EPIC_LOGIN_URL` (`frontend/screens/WebView/loginRoutes.ts:45`,
/// READ ONLY, never imported -- this file has no access to frontend source at build time)
/// without changing that constant, per this cycle's hard constraint.
pub(crate) const EPIC_LOGIN_HOST: &str = "www.epicgames.com";

/// GOG's login entry host (`GOG_LOGIN_URL`, `loginRoutes.ts`). GOG added a Cloudflare Turnstile
/// check that fails inside the Tauri-injected login window, so on macOS it takes the same
/// pristine (injection-free) WKWebView route as Epic. Host-keyed like `EPIC_LOGIN_HOST`; never
/// caller-chosen. The function/delegate keep their Epic names (historical).
pub(crate) const GOG_LOGIN_HOST: &str = "auth.gog.com";
