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
#[cfg(target_os = "macos")]
mod pristine_epic;
#[cfg(target_os = "macos")]
pub(crate) use pristine_epic::*;
#[cfg(target_os = "macos")]
use objc2::rc::Retained;
#[cfg(target_os = "macos")]
use objc2::runtime::{AnyObject, NSObject};
#[cfg(target_os = "macos")]
use objc2::{define_class, msg_send, DeclaredClass, MainThreadOnly};
#[cfg(target_os = "macos")]
use objc2_foundation::{NSObjectProtocol, NSPoint, NSRect, NSSize, NSString};

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

/// Bound on how long `keyring_get` waits for its worker-thread Keychain read before classifying
/// the call as `keyring:timeout` (34.4.1 gap cycle 2 plan 26, F-9 observability half,
/// T-34.4.1-114/T-34.4.1-115; raised 8s -> 45s by Phase 34.5 gap cycle 4 plan 35, closing Routing
/// item 3). This is OBSERVABILITY, not a fix for F-9's underlying cause, which this plan does NOT
/// establish as a single clean answer (see
/// `keyring_read_timing_hypothesis_absent_vs_present_entry`'s own doc comment and
/// `34.4.1-26-SUMMARY.md` for the full timed verdict).
///
/// Chosen from that harness's own recorded timings on this machine: an absent-entry read
/// completed in 40-102ms across two runs (fast, `NoEntry`, no authorization needed). A
/// present-entry read against the real `steam-refresh-token` account took 48.9s on one run and
/// **291s** on another, both ultimately resolving `PlatformFailure(-60008, "Unable to obtain
/// authorization for this operation")` -- live, hardware-measured evidence for
/// `deferred-items.md`'s ad-hoc-signature/Keychain-ACL theory, reproduced from this same-machine,
/// non-interactive `cargo test` process (a different code identity than the built `gamelib-shell`
/// app, so these exact numbers are illustrative of the MECHANISM, not a promise about the app's
/// own timing).
///
/// **Why 8s was wrong and 45s is the replacement.** A 2026-08-01 live session recorded TWO
/// separate macOS Keychain approval prompts for the same `steam-refresh-token` slot, 19:22:57 and
/// 19:24:38 -- the exact outcome plan 34.5-25's own decision rule defines as FALSIFIED. 8 seconds
/// is shorter than the time a human plausibly takes to notice, read and approve a Keychain
/// authorization dialog, so a human-speed approval could never complete inside the old bound; the
/// read timed out, the worker thread that eventually got the real (human-approved) answer was
/// already abandoned, and the next caller had to prompt again. Two selecting constraints pick 45s:
/// it must exceed ordinary human Keychain-approval time (8s demonstrably does not), and it must
/// stay strictly under the sidecar's own `RUST_INVOKE_TIMEOUT_MS` (60_000ms,
/// `src/backend/sidecar/sidecarRpc.ts`) with enough round-trip headroom that a slow read is still
/// reported as the specific, named `keyring:timeout` rather than degrading into an opaque
/// transport timeout raised by that outer layer instead. 45s satisfies both: comfortably above
/// human approval time, and 15s of raw headroom under the 60s invoke bound -- of which this
/// file's own `#[cfg(test)]` assertion
/// (`keyring_read_timeout_stays_strictly_under_the_sidecar_invoke_bound_with_round_trip_headroom`)
/// enforces at least 10s as a minimum round-trip margin.
///
/// **45s does NOT cover the 291s worst case measured above, and that is deliberate.** That
/// worst-case number is attributed to `deferred-items.md`'s ad-hoc-code-signing /
/// Keychain-ACL-non-persistence theory -- a likely DEV-BUILD severity modifier (an ad-hoc dev
/// signature means the Keychain ACL never persists, so every run re-triggers a slow authorization
/// negotiation), not an established production cause, and this plan does not investigate or fix
/// it. A read that genuinely takes 291s will still time out under the new bound exactly as it did
/// under the old one; only the human-speed-approval case (the live-confirmed defect) is fixed
/// here.
///
/// A timed-out worker thread is ABANDONED, not cancelled: `SecItemCopyMatching` has no interrupt
/// API, so this bound protects the RPC round trip, not the underlying OS call -- the abandoned
/// thread keeps running (and, per this harness's own measurement, may keep running for minutes)
/// on its own.
pub(crate) const KEYRING_READ_TIMEOUT: Duration = Duration::from_secs(45);

/// The SINGLE dismissal entry point both the cancel-strip sentinel (below, in the
/// `.on_navigation(` closure) and the Esc monitor (Task 2, `main()`'s `.setup()`) call.
/// `#[cfg(target_os = "macos")]` -- dismissing a sheet is a macOS-only concept (Plan 07).
///
/// Order is load-bearing: `dismiss_login_window_sheet` (Plan 07, above) FIRST -- ends the
/// sheet, releasing the parent window -- THEN `app.get_webview_window(label)` and `.close()`
/// it so the existing `WindowEvent::Destroyed` hook fires, pushes the `closed` event, and lets
/// `oauthLoginCapture.ts` settle `{ status: 'cancelled' }` with reason `window-closed`. Closing
/// the window BEFORE ending the sheet risks leaving the parent in a sheet-blocked state with no
/// sheet -- do not reorder.
///
/// Never fatal, never logs URL/origin/title -- only the label and a fixed two-value `route`
/// string (`strip`/`esc`), matching `present_login_window_as_sheet`/
/// `dismiss_login_window_sheet`'s own logging discipline (T-34.4.2-11).
#[cfg(target_os = "macos")]
pub(crate) fn request_login_sheet_cancel(app: &AppHandle, label: &str, route: &str) {
    dismiss_login_window_sheet(app, label);
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.close();
    } else if let Some(window) = app.get_window(label) {
        // quick-261029-o1w: the GOG pristine window is a plain `tauri::Window`.
        let _ = window.close();
    }
    shell_eprintln!("[shell] login-sheet: cancel requested for '{label}' via {route}");
}

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

/// Height (points) of the native login-sheet bar, and the side of its x box (quick-261029-osq).
/// The webview is inset by exactly this much from the top so WebKit's `_effectiveCornerRadii`
/// (26pt at the sheet's rounded top corners) reads 0 at the webview's own top edge: the
/// scrollbar then starts at the webview's top and no light wedge is left to paint (wedge todo
/// `2026-10-03-login-sheet-title-bar-has-a-light-wedge-at-the-rounded-corner`). Public AppKit
/// only, no private `_effectiveCornerRadii` override (T-osq-05).
#[cfg(target_os = "macos")]
const NATIVE_LOGIN_BAR_HEIGHT: f64 = 32.0;

/// The domain-suffix targets `humble_login_clear_cookies`'s pristine-window fallback (below)
/// gates on -- MUST stay paired, entry for entry, with `legendary/user.ts`'s own
/// `EPIC_COOKIE_HOSTS` constant, whose `clearEpicCookies` step passes these values as `domain`
/// ONE AT A TIME, one `humble_login_clear_cookies` call per entry. The two lists are
/// hand-maintained mirrors of each other (this file has no build-time access to frontend or
/// backend TS source, so nothing can derive one from the other); each names the other in its
/// own comment so a reviewer editing one is told, in place, that the other exists.
///
/// APEX domains, deliberately, not hostnames: `cookie_domain_matches` (above) does the suffix
/// work, so `epicgames.com` covers `www.epicgames.com`, `.ecosec.on.epicgames.com` and every
/// other subdomain a session cookie may be scoped to. That is also why this is NOT derived from
/// `EPIC_LOGIN_HOST`, which is a full hostname (`www.epicgames.com`) rather than the
/// cookie-domain suffix Epic's session cookies are actually set against.
///
/// Why a LIST and not the single `epicgames.com` this used to be (Phase 35 plan 09, operator
/// decision D-09-CORRECTED, 2026-08-29): `35-AB-RETEST.md` Item 7 measured `EPIC_DEVICE`
/// surviving an Epic logout on `.fortnite.com`, `.twinmotion.com`, `.unrealengine.com` and
/// `.metahuman.com`. An `epicgames.com` suffix filter cannot match any of those BY
/// CONSTRUCTION, so the fix is to widen the filter -- NOT to change the mechanism. The blanket
/// browsing-data wipe this file prohibits in three separate places stays banned (REQ-34.4.1-06);
/// this doc comment deliberately does NOT spell that API's name, so a `grep -c` of it over this
/// file keeps returning exactly those three prohibitions and nothing else. The jar is app-wide,
/// and a blanket wipe would sign the user out of storefronts they never touched.
///
/// Accepted cost, chosen explicitly by the operator over a filter that cannot match: this list
/// is maintained BY HAND and can go stale if Epic adds a domain. It is scoped to Epic-owned
/// apexes only -- widening it to any non-Epic domain would recreate exactly the over-broad
/// clear `REQ-34.4.1-06` closed, which is why `epic_cookie_domain_matches` below is tested in
/// BOTH directions (every member matches; Humble/GOG/Amazon still do not).
#[cfg(target_os = "macos")]
pub(crate) const EPIC_COOKIE_DOMAINS: &[&str] = &[
    "epicgames.com",
    "fortnite.com",
    "unrealengine.com",
    "twinmotion.com",
    "metahuman.com",
];

/// True when `domain` is (or is a subdomain of) ANY Epic-owned apex in `EPIC_COOKIE_DOMAINS`.
///
/// Delegates every comparison to `cookie_domain_matches` (above) -- the ONE domain comparator in
/// this file, born from F-34.4.2-19 and weeks of silent Humble-login failure. A hand-rolled
/// suffix test here would be a SECOND comparator, which is exactly how Plan 22's Defect A
/// happened. Argument order matches the call site this replaces (`cookie_domain_matches(domain,
/// Some(...))` -- the value being cleared first, the fixed target second), deliberately
/// unchanged.
#[cfg(target_os = "macos")]
pub(crate) fn epic_cookie_domain_matches(domain: &str) -> bool {
    EPIC_COOKIE_DOMAINS
        .iter()
        .any(|epic| cookie_domain_matches(domain, Some(epic)))
}

/// GOG/Amazon cookie-domain allow-list for the D-15 fix (Phase 40 plan 04, T-40-04-07/-08).
/// GOG and Amazon logout leave stale session cookies in the shared default cookie jar -- the
/// embed this phase adds is what makes that leak user-visible for the first time, because it
/// now carries a visible, navigable GOG/Amazon tab whose cookies never get cleared on sign-out.
///
/// Mirrors `EPIC_COOKIE_DOMAINS` exactly, including the SAME apex-domain reasoning:
/// `cookie_domain_matches`'s suffix rule already covers every subdomain a session cookie may be
/// scoped to (`login.gog.com`, `www.amazon.com`, etc. all match their bare apex), so listing the
/// apex alone is sufficient -- no need to enumerate every observed subdomain by hand. Deliberately
/// a SEPARATE list from `EPIC_COOKIE_DOMAINS` rather than a widening of it: Epic's list stays
/// scoped to Epic-owned domains only, and this repository's convention (this const's own sibling
/// above) is that widening a storefront-scoped allow-list to a different storefront is exactly
/// the over-broad-clear shape REQ-34.4.1-06 forbids. Scoped to GOG and Amazon ONLY -- this list
/// must never be widened to any other storefront (Humble already has its own always-a-window
/// path and needs no fallback here; Steam has no browser-cookie session to clear at all).
///
/// PAIRED LIST -- keep this in lockstep with `GOG_COOKIE_HOSTS` (`gog/user.ts`) and
/// `AMAZON_COOKIE_HOSTS` (`nile/user.ts`), which name this constant back. A domain added on one
/// side and not the other is a silent half-fix, exactly the T-35-41 drift risk
/// `EPIC_COOKIE_DOMAINS`'s own doc comment describes for Epic's list.
#[cfg(target_os = "macos")]
const STORE_LOGOUT_COOKIE_DOMAINS: &[&str] = &["gog.com", "amazon.com"];

/// True when `domain` is (or is a subdomain of) ANY apex in `STORE_LOGOUT_COOKIE_DOMAINS`.
/// Delegates to `cookie_domain_matches`, exactly like `epic_cookie_domain_matches` above --
/// see that function's own doc comment for why a hand-rolled suffix test here would be a SECOND
/// comparator (the mistake Plan 22's Defect A already made once).
#[cfg(target_os = "macos")]
pub(crate) fn store_logout_cookie_domain_matches(domain: &str) -> bool {
    STORE_LOGOUT_COOKIE_DOMAINS
        .iter()
        .any(|store_domain| cookie_domain_matches(domain, Some(store_domain)))
}

/// Resolves the `NSWindow` handle for a Tauri-managed login window (Humble/GOG/Amazon --
/// REQ-34.4.2-10's locked scope; see this file's module-level scope note on
/// `open_pristine_epic_login_window`, above, for the full boundary). Returns the raw address as
/// `usize` rather than a live `Retained<NSWindow>` so the value is `Send` and so it can serve as
/// a bare IDENTITY that is compared but never dereferenced -- the Esc local monitor's
/// presented-sheet match in `main()`'s `.setup()` is exactly that use, and it is the reason this
/// `usize` contract stays. `None` when no Tauri-managed window carries `label` -- a missing
/// window is never an error in this file (the `humble_login_close` "already closed is healthy"
/// convention).
///
/// **Never dereference this address across a thread or a run-loop boundary** (quick task
/// 260930-q11, measured by direct read of the vendored crate): the pointer
/// `tauri::Window::ns_window()` hands back is AUTORELEASED --
/// `tauri-2.11.5/src/window/mod.rs:1642` is literally
/// `Ok(objc2::rc::Retained::autorelease_ptr(ns_window).cast())` -- so its guaranteed validity is
/// bounded by the autorelease pool of the thread that RESOLVED it, not by the login window's
/// lifetime. Carrying it into a later run-loop turn is therefore outside the API's contract
/// unconditionally, independent of whether the user closes the window mid-flight. A caller that
/// needs a live `&NSWindow` must go through `login_window_ns_window_retained`, below, from the
/// main thread; the `SendPtr`-across-the-hop shape both login-sheet paths used to carry has been
/// deleted for this reason.
///
/// Resolves through `app.get_webview_window(label)` first, then falls back to
/// `app.get_window(label)` (quick-261029-o1w). The pristine shell
/// (`open_pristine_epic_login_window`, above) is a plain `tauri::Window`, reachable only through
/// the fallback, and the `unstable` tauri feature that enables it is already on. The fallback
/// exists for the GOG and Epic sheets (quick-261029-o1w, quick-261029-utr; Epic's
/// REQ-34.4.2-10 descope is lifted, so its label is now presented like any other).
///
/// Side-effect free: never logs a label's URL or any page content.
///
/// Callers: `login_window_ns_window_retained` (immediately below -- the retaining wrapper both
/// login-sheet paths go through) and the Esc local monitor's presented-sheet address comparison
/// in `main()`'s `.setup()`, which compares the `usize` and never dereferences it.
#[cfg(target_os = "macos")]
pub(crate) fn login_window_ns_window(app: &AppHandle, label: &str) -> Option<usize> {
    app.get_webview_window(label)
        .and_then(|w| w.ns_window().ok())
        .or_else(|| app.get_window(label).and_then(|w| w.ns_window().ok()))
        .map(|ptr| ptr as usize)
}

/// Main-thread-only companion to `login_window_ns_window`, above: resolves the SAME handle and
/// immediately RETAINS it, so the caller holds an owned `Retained<NSWindow>` rather than a bare
/// address with a timing assumption attached to it. Delegates to `login_window_ns_window` for the
/// resolution itself so this file keeps exactly ONE resolver rather than gaining a second,
/// competing one -- the standing rule `store_logout_cookie_domain_matches`'s own doc comment
/// states for comparators, applied here to handle resolution.
///
/// **Every caller MUST already be on the main thread.** Two independent reasons, both read
/// directly out of `tauri-2.11.5/src/window/mod.rs` during quick task 260930-q11's planning and
/// neither of them recorded in the todo or in `34.4.2-REVIEW.md`'s WR-02:
///
/// 1. The address `ns_window()` returns is AUTORELEASED (`:1642`,
///    `Ok(objc2::rc::Retained::autorelease_ptr(ns_window).cast())`), so its guaranteed validity is
///    bounded by the autorelease pool of the thread that resolved it. Retaining in the same
///    expression as the resolution -- which is all this helper does -- is what converts that into
///    an owned handle valid for as long as it is held. That is the point of this function, not a
///    nicety.
/// 2. `ns_window()`'s own `.and_then` closure runs on the CALLING thread: only the inner
///    `window_handle()` getter crosses to the main thread (tauri-runtime-wry-2.11.4's
///    `window_getter!`). So `view.window()` -- a plain AppKit accessor -- and the autorelease
///    registration both execute wherever the caller is. Resolved from a worker thread, that is an
///    AppKit call off the main thread onto a pool that is not the main thread's.
///
/// Resolving from the main thread is safe on both counts: `send_user_message`
/// (tauri-runtime-wry-2.11.4/src/lib.rs:239-248) short-circuits to `handle_user_message` INLINE
/// when the caller is already on the main thread, so `getter!`'s unbounded `rx.recv()` is never
/// reached and this cannot self-deadlock; and `Message::Task(task) => task()` sits at the top
/// level of that match (`:3335`), outside any `windows.0.borrow()` scope, so a nested resolution
/// from inside a `run_on_main_thread` closure cannot panic on a `RefCell` double-borrow.
///
/// `None` when no Tauri-managed window carries `label` -- a missing window is never an error in
/// this file (the `humble_login_close` "already closed is healthy" convention).
#[cfg(target_os = "macos")]
fn login_window_ns_window_retained(
    app: &AppHandle,
    label: &str,
) -> Option<Retained<objc2_app_kit::NSWindow>> {
    let addr = login_window_ns_window(app, label)?;
    // SAFETY: `addr` is the address `login_window_ns_window` resolved for a live Tauri-managed
    // `NSWindow` on the line above -- nothing runs in between that could release it -- and the
    // caller is on the main thread (this function's doc comment makes that a precondition; every
    // call site is inside a `run_on_main_thread` or GCD-main-queue closure). `Retained::retain`
    // is plain `objc_retain` and is null-safe by contract (objc2-0.6.4 `src/rc/retained.rs:428`),
    // so no hand-rolled null check is added here. Deliberately NOT `retain_autoreleased`
    // (`:457`): its `objc_retainAutoreleasedReturnValue` optimization requires the call be
    // immediately adjacent to the returning message send, which it is not here. The returned
    // handle is RETAINED, so -- unlike `login_window_ns_window`'s bare address -- it is valid for
    // as long as it is held, with no "resolved moments ago" timing assumption of any kind.
    unsafe { Retained::retain(addr as *mut objc2_app_kit::NSWindow) }
}

/// Cap on `PRESENTED_LOGIN_SHEETS`, below -- mirrors `LOGIN_WINDOW_EVENTS_CAP`'s discipline
/// (T-34.4.2-08): an unbounded presented-sheet list would be a denial-of-service surface if a
/// caller somehow kept minting presented labels without ever dismissing them. In practice at
/// most one or two Tauri-managed login windows are ever open at once (Humble plus one OAuth
/// runner), so this bound is generous, not a realistic ceiling.
#[cfg(target_os = "macos")]
const PRESENTED_LOGIN_SHEETS_CAP: usize = LOGIN_WINDOW_EVENTS_CAP;

/// Labels of the Tauri-managed login windows currently presented as AppKit SHEETS on
/// `MAIN_WINDOW_LABEL` (`present_login_window_as_sheet`, below). Consulted by
/// `present_login_window_as_sheet`/`dismiss_login_window_sheet` themselves and by the Esc
/// local monitor's membership check (`main()`'s `.setup()`) to confirm a label is a live,
/// presented sheet before acting on it -- the same registry the prior child-window
/// mechanism used, re-homed onto sheet presentation by the operator's binding design
/// decision of 2026-08-04 (`34.4.2-LIVE-GATE.md`'s "Binding Design Decision" section).
/// Insertion-ordered, deduplicated on insert, capped at `PRESENTED_LOGIN_SHEETS_CAP`
/// (T-34.4.2-08) -- a label is ALWAYS removed on dismiss, even when the underlying AppKit call
/// could not run, so a destroyed window never lingers on this list (see
/// `dismiss_login_window_sheet`'s own doc comment, below).
#[cfg(target_os = "macos")]
pub(crate) static PRESENTED_LOGIN_SHEETS: Mutex<Option<Vec<String>>> = Mutex::new(None);

/// F-34.4.2-04 (checkpoint response, 2026-08-04): the OUTER bound `humble_login_open` places
/// on the entire sheet-attach attempt, not just `present_login_window_as_sheet`'s own internal
/// 10s `rx.recv_timeout` around its main-thread dispatch.
///
/// **Justification rewritten by quick task 260930-q11 -- the original one is now false.** It
/// said `login_window_ns_window`'s two `.ns_window()` calls run at the top of
/// `present_login_window_as_sheet`, BEFORE its internal bound starts, on `getter!`'s UNBOUNDED
/// `rx.recv()`. Both halves stopped describing the code: those resolutions now happen inside the
/// deferred GCD closure, which sits INSIDE the inner `rx.recv_timeout(10s)` window, and they run
/// on the main thread, where `send_user_message` short-circuits to `handle_user_message` inline
/// (tauri-runtime-wry-2.11.4/src/lib.rs:239-248, confirmed by direct read) so the reply is already
/// delivered before `recv()` is ever reached. The inner 10s bound therefore now covers the whole
/// critical path: both resolutions, the 250ms `SHEET_PRESENT_WKWEBVIEW_WARMUP_DELAY` deferral,
/// `beginSheet:` itself, and the CR-02 read-back.
///
/// **Verdict: the constant still earns its keep and is KEPT.** What the inner bound still does
/// not cover, between function entry and `recv_timeout` being armed: the entry `eprintln!`, on a
/// stderr a stalled consumer can block; `app.run_on_main_thread`'s own cross-thread send into
/// tao's event proxy, which nothing in this file bounds; `register_presented_login_sheet`'s
/// `PRESENTED_LOGIN_SHEETS` mutex acquisition, which runs after the inner bound has returned; and
/// whatever a future edit inserts on either side of that bound. Set comfortably above the inner
/// 10s bound (not merely equal to it) so `present_login_window_as_sheet` is given every chance to
/// finish normally. Independently load-bearing: `PENDING_VISIBLE_LOGIN_WINDOW_TTL` below is
/// DERIVED from this constant, and the Rust test
/// `pending_login_window_ttl_is_derived_from_the_watchdog_timeout_with_a_margin` asserts that TTL
/// is strictly greater than it -- so deleting this constant would be a change to
/// `humble_login_open` and to that test, not a comment edit.
#[cfg(target_os = "macos")]
pub(crate) const LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT: Duration = Duration::from_secs(15);

/// F-34.4.2-05 (checkpoint response round 2, 2026-08-04, commit 56d4986f8's live run): the
/// operator captured `[shell]` diagnostics this time and they isolate the wedge precisely --
/// `main-thread closure entered` printed, then NOTHING further from inside that closure for
/// the full 10s bound (the WARN that follows is `present_login_window_as_sheet`'s OWN
/// `rx.recv_timeout` giving up, not a log line the closure itself produced). The only AppKit
/// call between those two log lines is `parent.beginSheet_completionHandler(child, None)`
/// itself -- so the main thread is wedged inside (or immediately around) that single call,
/// not in this file's own recv/dispatch plumbing (F-34.4.2-04 already traced every
/// `rx.recv`/`rx.recv_timeout` in this path to a spawned worker thread, main.rs:4901, which
/// directly falsified the checkpoint response's own leading "self-deadlock on the main
/// thread" theory -- see the Eliminated section of this bug's debug session).
///
/// Independent third-party reports of the same class of failure -- a `WKWebView`-backed
/// `NSWindow` that has never completed an on-screen display/layout pass wedging AppKit when
/// asked to participate in a sheet/modal transition immediately after creation -- exist for
/// unrelated Rust/Go webview stacks hitting the identical native layer (Apple Developer
/// Forums "WKWebView in a modal window" thread: "WKWebView needs a certain NSRunLoop to do
/// its work on... rearranging things to avoid [calling from inside a dispatch_async block]
/// solved the problem"; `wailsapp/wails#4226` "Deadlock in webview_window_darwin";
/// `r0x0r/pywebview#138` "Deadlock while closing the window with persistent threads
/// running"). The common thread: WebKit's content-process handshake needs real run-loop
/// turns to complete, and this file was calling `beginSheet:` synchronously, in the SAME
/// run-loop turn as `.build()`'s own window-creation work (both dispatched via
/// `run_on_main_thread`/`send_user_message`'s queued-message path, but processed back to
/// back once the main thread picks them up), giving WebKit none.
///
/// This is a REAL, bounded wall-clock deferral via `dispatch2::DispatchQueue::main().after()`
/// -- not a race against another thread (the standing constraint from the checkpoint
/// response: "the hang itself must be prevented, not bounded/raced" is about NOT trying to
/// out-run an unbounded stall from a second thread; this is the opposite shape -- a
/// deterministic, single-threaded delay that runs strictly BEFORE the AppKit call it
/// protects, on the same main thread, giving that thread's own run loop the turns it needs).
/// A second `run_on_main_thread` call from inside the first closure would NOT achieve this:
/// `send_user_message` (tauri-runtime-wry-2.11.4/src/lib.rs:239-248, confirmed by direct
/// read) executes synchronously inline, with zero run-loop yield, whenever the caller is
/// already on the main thread -- which this closure always is. GCD's main queue, serviced by
/// a dedicated run-loop source `NSApplication` registers automatically, is independent of
/// tao's own event-proxy pipeline and is guaranteed to run on a LATER iteration of the real
/// run loop.
///
/// 250ms is chosen conservatively: imperceptible against both this function's own 10s bound
/// and `LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT`'s 15s bound, and against the multi-second (in
/// the reported case, indefinite) hang this fix targets -- but long enough to span several
/// real run-loop turns, not just the single queue-drain a bare `exec_async` (zero delay)
/// would provide, matching the shape of the fix multiple third-party reports above converged
/// on independently.
#[cfg(target_os = "macos")]
const SHEET_PRESENT_WKWEBVIEW_WARMUP_DELAY: Duration = Duration::from_millis(250);

/// T-34.4.2-39 (Phase 34.4.2 Plan 14): the single pending VISIBLE Tauri-managed login window
/// currently between request (`humble_login_open`'s refuse-or-arm check, below) and resolution
/// (sheet-attach confirmed, visible-fallback shown, or the window's own `WindowEvent::Destroyed`).
/// A latch, not a list -- zero or one entry, label plus arm-time. Consulted alongside
/// `PRESENTED_LOGIN_SHEETS` (above) so a request is refused whether the incumbent is still
/// between request and presentation (the F-34.4.2-06/T-34.4.2-39 pre-presentation gap) OR
/// already on screen. Hidden reveal/clear windows never touch this latch (see
/// `humble_login_open`'s own `if visible` gating around the refuse-or-arm check). Deliberately
/// NOT routed through `register_presented_login_sheet`/`PRESENTED_LOGIN_SHEETS` itself -- that
/// registry's exactly-three-call-sites test (Plan 11) is load-bearing and this is a
/// structurally different concern (pre-presentation vs. already-presented).
#[cfg(target_os = "macos")]
pub(crate) static PENDING_VISIBLE_LOGIN_WINDOW: Mutex<Option<(String, std::time::Instant)>> = Mutex::new(None);

/// T-34.4.2-41 (NEW, Phase 34.4.2 Plan 14): bounds how long `PENDING_VISIBLE_LOGIN_WINDOW` may
/// stay armed before its entry is treated as absent. This is a safety requirement, not a
/// nicety -- a latch armed by a flow that then panics, hangs in the upstream CLI spawn
/// (F-34.4.2-06), or is killed mid-flight would otherwise block every future sign-in for the
/// life of the process, converting a spoofing mitigation (T-34.4.2-39) into a total denial of
/// service. This phase already learned once (T-34.4.2-15/-33, the cancel-strip kill-switch
/// case) that a mechanism added to make a login surface safer can itself become the lock-out;
/// this constant applies that lesson before a gate rather than after one.
///
/// Derived from `LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT` (the existing 15s OUTER bound on the
/// whole sheet-attach attempt) rather than invented independently, with a stated 10s margin, so
/// the two can never disagree: the watchdog's own fallback path always runs and clears this
/// latch (see the visible-fallback clear-call in `humble_login_open`) well before this TTL could
/// ever expire it out from under a flow that is still legitimately in flight.
#[cfg(target_os = "macos")]
pub(crate) const PENDING_VISIBLE_LOGIN_WINDOW_TTL: Duration =
    Duration::from_secs(LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT.as_secs() + 10);

/// Pure, AppKit-free staleness check for `PENDING_VISIBLE_LOGIN_WINDOW_TTL` -- extracted so it
/// is unit-testable without a live window (T-34.4.2-41). Boundary verdict: an age EQUAL to the
/// TTL is treated as stale (`>=`, not `>`) -- the TTL is the point past which the entry is no
/// longer trusted, not the last instant it is still trusted, matching this file's existing
/// `LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT`/`recv_timeout` convention of a bound that has been
/// EXCEEDED (not merely reached) before the caller-side fallback runs.
#[cfg(target_os = "macos")]
pub(crate) fn pending_login_entry_is_stale(age: Duration) -> bool {
    age >= PENDING_VISIBLE_LOGIN_WINDOW_TTL
}

/// Clears `PENDING_VISIBLE_LOGIN_WINDOW` only when the stored label MATCHES `label` -- a late
/// clear from an already-superseded (e.g. expired-and-replaced) flow must never unlatch a newer,
/// still-legitimate one. Called from `humble_login_open`'s three resolution paths: sheet
/// presentation confirmed, the visible-fallback (`window.show()`/`window.set_focus()`), and
/// `WindowEvent::Destroyed`. Deliberately a distinct function from `register_presented_login_sheet`
/// (T-34.4.2-08's registry) -- routing this through that helper would add a fourth call site and
/// fail Plan 11's exactly-three-call-sites test.
#[cfg(target_os = "macos")]
pub(crate) fn clear_pending_visible_login_window(label: &str) {
    if let Ok(mut guard) = PENDING_VISIBLE_LOGIN_WINDOW.lock() {
        let matches = guard
            .as_ref()
            .map(|(pending_label, _)| pending_label == label)
            .unwrap_or(false);
        if matches {
            *guard = None;
            shell_eprintln!(
                "[shell] humble_login_open: cleared pending login window latch for '{label}'"
            );
        }
    }
}

/// Presents a VISIBLE Tauri-managed login window (Humble/GOG/Amazon -- REQ-34.4.2-10's
/// locked scope; see `open_pristine_epic_login_window`'s own module-level scope note, above,
/// for the full boundary) as an AppKit SHEET on the app's `main` window (REQ-34.4.2-01/02),
/// per the operator's binding design decision of 2026-08-04 (`34.4.2-LIVE-GATE.md`'s "Binding
/// Design Decision" section): the prior child-window attachment mechanism went
/// live-CONFIRMED broken (F-34.4.2-01/-02 -- unresponsive after minimize/restore, could not
/// be closed). Called from `humble_login_open`'s `if visible` branch ONLY, after `.build()`
/// succeeds: hidden reveal/clear windows this arm also builds have no user-visible
/// presentation and sheeting them onto `main` would be meaningless.
///
/// Never fatal (T-34.1-22 discipline, matching this file's existing tray/devtools
/// convention): a missing parent, a missing child, a failed main-thread dispatch, or an
/// UNCONFIRMED attachment logs one `[shell] WARN: login-window sheet: ...` line and returns
/// `false` -- a login flow must never fail because its window could not be presented. CR-02
/// fix: returns `true` only once `attachedSheet()`/`isSheet()` (read back on the main thread,
/// immediately after `beginSheet:completionHandler:` returns) CONFIRM the child is attached
/// as the parent's sheet -- not merely once the AppKit call ran without erroring, which CR-01
/// proved can silently no-op. `humble_login_open`'s own presentation-record `eprintln!` reports
/// the resulting `sheet_presented` boolean as real machine evidence, and its own fallback (see
/// that arm, below) shows the window normally when this returns `false` so a user is never left
/// looking at nothing.
///
/// Never logs the URL, origin, or title -- only the label and a fixed reason string
/// (T-34.4.1-21/-106 discipline).
///
/// Crosses the `run_on_main_thread` boundary carrying only `Send` values -- an `AppHandle`
/// clone and owned `String` labels. **Both `NSWindow` handles are resolved INSIDE the deferred
/// closure that dereferences them** (quick task 260930-q11, WR-02's option 1), via
/// `login_window_ns_window_retained`, so resolution and use are atomic with respect to the run
/// loop and no address is ever carried across a thread or run-loop boundary. This is not merely
/// closing a "window closes mid-flight" race: the pointer `ns_window()` returns is autoreleased
/// on the resolving thread's pool (`tauri-2.11.5/src/window/mod.rs:1642`), so the prior
/// resolve-early/dereference-250ms-later shape was outside the API's contract unconditionally.
/// See `login_window_ns_window_retained`'s own doc comment, above, for both substrate findings
/// and for why resolving from the main thread cannot deadlock. The `SendPtr` wrapper and the two
/// raw-address-to-`&NSWindow` casts this function used to carry are gone; the only remaining
/// `unsafe` on this path is the single retain inside that helper.
///
/// Blocks on the dispatch via `mpsc_channel` + `rx.recv_timeout`, the same
/// worker-blocks-on-a-channel shape `open_pristine_epic_login_window` and
/// `clear_default_data_store_cookies_for_domain` both already use for this exact
/// main-thread-confinement problem, so a failure is observable rather than fire-and-forget --
/// though a timeout is still only a WARN, never a propagated error.
///
/// `endSheet:` (in `dismiss_login_window_sheet`, below) HIDES rather than closes the sheet
/// window (spike 021, measured) -- presentation alone does not give the user a way out; the
/// mandated explicit close affordance is plan 34.4.2-08's deliverable (T-34.4.2-33).
#[cfg(target_os = "macos")]
pub(crate) fn present_login_window_as_sheet(app: &AppHandle, label: &str) -> bool {
    // Live-evidence gap (checkpoint response, 2026-08-04, F-34.4.2-04): the first live
    // hardware run of the CR-01/CR-02 fix (commit 751521663) reported a SYMPTOM CHANGE --
    // no window at all (not even the pre-fix free-standing one) plus a stuck spinner that
    // never cleared -- with no captured `[shell]` stdout to say WHERE time was spent. This
    // `Instant` and the `eprintln!`s below it (entry, the main-thread closure's own entry, the
    // deferred closure's entry, both handle resolutions, the AppKit call's return and the
    // read-back) exist so the NEXT live run's captured `tauri:dev` stdout can localize a stall
    // to a specific leg of this function instead of guessing again. Never fatal, never logs
    // URL/origin/title (T-34.4.1-21/-106 discipline unchanged) -- only elapsed durations and
    // the fixed label.
    let started = std::time::Instant::now();
    shell_eprintln!(
        "[shell] login-window sheet: present_login_window_as_sheet entered for '{label}'"
    );

    // CR-02 fix (gap cycle following 34.4.2-LIVE-GATE-RERUN.md's FAIL 0/6): the channel now
    // carries a `bool` -- whether AppKit itself confirms the attachment -- rather than `()`.
    // The prior shape treated "the main-thread dispatch didn't time out" as proof of success,
    // which is unfalsifiable: `beginSheet:completionHandler:` can run to completion and still
    // not attach anything (that was CR-01's silent-failure mode). Reading back
    // `attachedSheet()`/`isSheet()` immediately after the call, on the SAME main-thread hop,
    // turns "did the dispatch return" into "did AppKit actually attach the sheet".
    let (tx, rx) = mpsc_channel::<bool>();
    let closure_app = app.clone();
    let closure_label = label.to_string();
    if let Err(e) = app.run_on_main_thread(move || {
        // Live-evidence gap (see this function's own entry comment): proves the QUEUED
        // main-thread closure actually STARTED running, distinguishing "never got
        // scheduled" from "started and stalled inside the AppKit call below" -- the two
        // failure modes the checkpoint response could not tell apart from a beachball
        // alone.
        shell_eprintln!(
            "[shell] login-window sheet: main-thread closure entered for '{closure_label}'"
        );
        // F-34.4.2-05 fix (see `SHEET_PRESENT_WKWEBVIEW_WARMUP_DELAY`'s own doc comment for
        // the full live-evidence mechanism): both handle resolutions, the actual
        // `beginSheet:completionHandler:` call and its read-back are deferred onto GCD's main
        // queue, `WARMUP_DELAY` in the future, rather than invoked synchronously right here.
        // This is deliberately NOT a second `run_on_main_thread` call -- `send_user_message`
        // executes synchronously inline when already on the main thread (confirmed by direct
        // read of tauri-runtime-wry's vendored source), so it would not yield a single
        // run-loop turn and would reproduce exactly the wedge this fix targets.
        shell_eprintln!(
            "[shell] login-window sheet: deferring beginSheet dispatch by {SHEET_PRESENT_WKWEBVIEW_WARMUP_DELAY:?} via DispatchQueue::main().after() for '{closure_label}'"
        );
        let deferred_app = closure_app;
        let deferred_label = closure_label.clone();
        let deferred_started = std::time::Instant::now();
        let when = dispatch2::DispatchTime::NOW
            .time(SHEET_PRESENT_WKWEBVIEW_WARMUP_DELAY.as_nanos() as i64);
        let _ = dispatch2::DispatchQueue::main().after(when, move || {
            // Live-evidence gap: proves the deferred closure actually ran (as opposed to
            // GCD silently dropping/never scheduling it), and how much real wall-clock
            // time elapsed since it was scheduled -- should be >= WARMUP_DELAY, confirming
            // a genuine run-loop deferral took place rather than an inline no-op.
            shell_eprintln!(
                "[shell] login-window sheet: deferred beginSheet closure entered for '{deferred_label}' (deferred_elapsed={:?})",
                deferred_started.elapsed()
            );
            // Quick task 260930-q11 (WR-02 option 1): BOTH handles are resolved right here, in
            // the same run-loop turn that dereferences them, rather than on the calling worker
            // thread before the 250ms deferral was even armed. Nothing suspends between these
            // resolutions and the AppKit calls below, and each handle is RETAINED (see
            // `login_window_ns_window_retained`'s doc comment for the autoreleased-pointer and
            // worker-thread-AppKit findings that make this the only in-contract shape). GCD's
            // main queue always runs work on the OS main thread, which is that helper's own
            // precondition.
            //
            // A window that does not resolve HERE is healthy, not an error -- the login window
            // can legitimately be gone by now (user Cmd+W, `captureOAuthLogin` settling,
            // `humble_login_close`). Each arm therefore WARNs and then sends `false` down the
            // channel. The send is load-bearing, not tidiness: a bare `return` from inside this
            // closure would leave the worker blocked on its own `rx.recv_timeout` below for the
            // full 10s before `humble_login_open`'s `attached == false` visible-fallback arm
            // could run, so the user would stare at nothing for ten seconds instead of seeing
            // the window shown normally straight away.
            let Some(parent) =
                login_window_ns_window_retained(&deferred_app, MAIN_WINDOW_LABEL)
            else {
                shell_eprintln!(
                    "[shell] WARN: login-window sheet: no NSWindow for '{MAIN_WINDOW_LABEL}' -- skipping"
                );
                let _ = tx.send(false);
                return;
            };
            let Some(child) = login_window_ns_window_retained(&deferred_app, &deferred_label)
            else {
                shell_eprintln!(
                    "[shell] WARN: login-window sheet: no NSWindow for '{deferred_label}' -- skipping"
                );
                let _ = tx.send(false);
                return;
            };
            // Live-evidence gap: the successor to the old pre-dispatch "both NSWindow
            // addresses resolved" line, which no longer has a pre-dispatch leg to sit in.
            // Keeps a future live gate able to localize a stall to the resolution leg
            // specifically, now measured from inside the deferred closure.
            shell_eprintln!(
                "[shell] login-window sheet: both NSWindow handles resolved on the main thread for '{deferred_label}' (deferred_elapsed={:?})",
                deferred_started.elapsed()
            );
            // `beginSheet:completionHandler:` is a safe binding (no `unsafe fn` in the
            // generated bindings), and `parent`/`child` are now owned `Retained<NSWindow>`
            // handles rather than references reconstructed from raw addresses, so this call
            // needs no `unsafe` block and no pointer cast at all.
            parent.beginSheet_completionHandler(&child, None);
            // Live-evidence gap: proves the AppKit sheet-begin call itself RETURNED (as
            // opposed to blocking the main thread inside AppKit, which would mean this
            // line -- and every other main-thread message queued behind it, including the
            // visible-fallback `humble_login_open` queues further down -- never runs).
            shell_eprintln!(
                "[shell] login-window sheet: beginSheet dispatch call returned for '{deferred_label}'"
            );
            // CR-02 read-back: two independent AppKit-owned signals, both required.
            // `isSheet()` confirms the child itself now believes it is presented as a
            // sheet; `attachedSheet()` on the parent is compared by POINTER identity (not
            // `==`, which `NSWindow` does not implement) to confirm the parent's sheet is
            // specifically THIS child, not some other sheet already queued/presented on
            // it. Either alone could be a false positive (e.g. a stale `isSheet()` from a
            // previous presentation); both together are the strongest falsifiable signal
            // this binding exposes.
            let attached = child.isSheet()
                && parent.attachedSheet().is_some_and(|sheet| {
                    std::ptr::eq(&*sheet as *const _, &*child as *const _)
                });
            shell_eprintln!(
                "[shell] login-window sheet: read-back attached={attached} for '{deferred_label}'"
            );
            let _ = tx.send(attached);
        });
    }) {
        shell_eprintln!(
            "[shell] WARN: login-window sheet: main-thread dispatch failed for '{label}' ({e})"
        );
        return false;
    }
    let attached = match rx.recv_timeout(Duration::from_secs(10)) {
        Ok(attached) => attached,
        Err(_) => {
            shell_eprintln!(
                "[shell] WARN: login-window sheet: main-thread dispatch timed out for '{label}' (elapsed={:?} -- the main-thread closure above may still be running/queued; see LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT in humble_login_open for the caller-side bound that guarantees a fallback regardless)",
                started.elapsed()
            );
            return false;
        }
    };
    shell_eprintln!(
        "[shell] login-window sheet: present_login_window_as_sheet resolved attached={attached} for '{label}' (elapsed={:?})",
        started.elapsed()
    );
    if !attached {
        shell_eprintln!(
            "[shell] WARN: login-window sheet: beginSheet did not attach '{label}' to '{MAIN_WINDOW_LABEL}' (attachedSheet/isSheet read-back false -- CR-01/CR-02)"
        );
        return false;
    }

    register_presented_login_sheet(label);
    true
}

/// Extracted from `present_login_window_as_sheet`'s own registration block (WR-01,
/// `34.4.2-REVIEW.md`) so `dismiss_login_window_sheet`, below, can re-run the EXACT same
/// dedup-on-insert + `PRESENTED_LOGIN_SHEETS_CAP` eviction semantics (T-34.4.2-08's
/// bounded-growth guarantee, preserved verbatim) when a failed `endSheet:` hop must leave the
/// label re-authorized for a retry, not only when a sheet is first confirmed attached. Called
/// from exactly three sites: the present-path registration below (on confirmed attachment
/// only -- CR-02's invariant is not relaxed here) and the two dismiss-failure re-registration
/// arms in `dismiss_login_window_sheet`.
#[cfg(target_os = "macos")]
fn register_presented_login_sheet(label: &str) {
    if let Ok(mut guard) = PRESENTED_LOGIN_SHEETS.lock() {
        let list = guard.get_or_insert_with(Vec::new);
        if !list.iter().any(|existing| existing == label) {
            if list.len() >= PRESENTED_LOGIN_SHEETS_CAP {
                list.remove(0);
            }
            list.push(label.to_string());
        }
    }
}

/// Mirror of `present_login_window_as_sheet`, above: resolves both `NSWindow`s, hops to the
/// main thread, and calls `endSheet:`. Called from `humble_login_open`'s existing
/// `WindowEvent::Destroyed` hook (Quick task 260803-eee Task 5's close-detection arm, below)
/// for every window that arm builds, not gated on `visible` -- a hidden reveal/clear window
/// was never presented in the first place, so dismissing it is a guaranteed no-op given the
/// membership gate below.
///
/// `label` is ALWAYS removed from `PRESENTED_LOGIN_SHEETS` FIRST, unconditionally
/// (T-34.4.2-08), and whether it WAS present is captured before any AppKit call is made.
/// Unlike `removeChildWindow:` (the predecessor mechanism, which was a documented no-op on a
/// window that was never attached), `endSheet:` on a window that was never presented as THIS
/// window's sheet is not a defined no-op -- so this function is membership-gated: if `label`
/// was NOT present in the registry, it returns immediately without touching AppKit at all.
/// This covers both the hidden reveal/clear windows this arm also builds and a second
/// dismissal of an already-dismissed sheet.
///
/// **`endSheet:` HIDES the sheet window rather than closing it** (spike 021, measured) -- so
/// calling this alone is not a dismissal. Plan 34.4.2-08's cancel routes must call this and
/// THEN close the Tauri window so the existing `WindowEvent::Destroyed` hook fires and
/// `oauthLoginCapture.ts` settles `{ status: 'cancelled' }, 'window-closed'`.
///
/// A child `NSWindow` that no longer resolves by the time `Destroyed` fires is treated as
/// already healthy (this file's existing `humble_login_close` "already closed is healthy"
/// convention).
///
/// Quick task 260930-q11 (WR-02's option 1, applied to this path as well as the present path so
/// both have ONE shape rather than a shape with an exception): both `NSWindow` handles are
/// resolved INSIDE the `run_on_main_thread` closure that uses them, via
/// `login_window_ns_window_retained`, so no raw address crosses the dispatch boundary here
/// either. See that helper's doc comment for the autoreleased-pointer finding that makes the
/// prior shape out of contract unconditionally rather than only when a window closes mid-flight.
/// The `SendPtr` wrapper and the two raw-address casts this function used to carry are gone.
///
/// Never fatal, never logs URL/origin/title content -- same discipline as
/// `present_login_window_as_sheet`, above.
///
/// WR-01 fix (`34.4.2-REVIEW.md`): removal-first is unconditional, but it is REVERSIBLE on a
/// failed AppKit hop. If the main-thread dispatch fails, or its own 10s bound expires with no
/// confirmation the closure ran, the label is re-registered via `register_presented_login_sheet`
/// before this function returns -- otherwise both cancel routes (the strip, the Esc monitor)
/// and any retry would be permanently membership-gated shut against a sheet that may still be
/// presented, stranding the parent window for the process lifetime with no remaining dismissal
/// route. The healthy "child no longer resolves" path -- now inside the main-thread closure,
/// since that is where resolution happens (quick task 260930-q11) -- deliberately does NOT
/// re-register: that path means the window is genuinely gone ("already gone by the time
/// Destroyed fires"). Preserving that distinction is why the closure signals on `tx` from EVERY
/// arm, including the two that never touch AppKit: the channel answers "did the main-thread hop
/// run", and only a hop that did NOT run may re-register. A silent early `return` would drop the
/// sender, `recv_timeout` would report `Disconnected`, and the healthy path would wrongly
/// re-register a window that is already gone -- stranding its label in the registry for the
/// process lifetime, the exact failure WR-01's re-registration exists to prevent.
#[cfg(target_os = "macos")]
pub(crate) fn dismiss_login_window_sheet(app: &AppHandle, label: &str) {
    let was_presented = if let Ok(mut guard) = PRESENTED_LOGIN_SHEETS.lock() {
        if let Some(list) = guard.as_mut() {
            let before = list.len();
            list.retain(|existing| existing != label);
            before != list.len()
        } else {
            false
        }
    } else {
        false
    };
    if !was_presented {
        return;
    }

    let (tx, rx) = mpsc_channel::<()>();
    let closure_app = app.clone();
    let closure_label = label.to_string();
    if let Err(e) = app.run_on_main_thread(move || {
        // Quick task 260930-q11 (WR-02 option 1): both handles are resolved HERE, inside the
        // main-thread closure that uses them, and each is RETAINED -- no raw address crosses the
        // dispatch boundary. See `login_window_ns_window_retained`'s doc comment for why that is
        // the only in-contract shape (the address `ns_window()` returns is autoreleased on the
        // resolving thread's pool) and for why resolving from the main thread cannot deadlock.
        //
        // Every arm below signals on `tx` -- including the two that never touch AppKit -- so the
        // channel answers "did the hop run" rather than "did `endSheet:` run". That is what keeps
        // WR-01's re-registration scoped to a hop that genuinely did not run: see this function's
        // own doc comment for why re-registering on the healthy "window is already gone" path
        // would strand the label instead of rescuing it.
        let Some(parent) = login_window_ns_window_retained(&closure_app, MAIN_WINDOW_LABEL) else {
            shell_eprintln!(
                "[shell] WARN: login-window dismiss: no NSWindow for '{MAIN_WINDOW_LABEL}' -- skipping"
            );
            let _ = tx.send(());
            return;
        };
        let Some(child) = login_window_ns_window_retained(&closure_app, &closure_label) else {
            // Already gone by the time Destroyed fires -- healthy, not an error (see doc
            // comment above). No AppKit call, and deliberately no re-registration.
            let _ = tx.send(());
            return;
        };
        parent.endSheet(&child);
        let _ = tx.send(());
    }) {
        // WR-01: the dispatch never ran at all -- re-register so both cancel routes (strip,
        // Esc) and any retry stay reachable rather than permanently membership-gated shut.
        register_presented_login_sheet(label);
        shell_eprintln!(
            "[shell] WARN: login-window dismiss: '{label}' main-thread dispatch failed -- re-registered as still presented so the cancel routes stay reachable ({e})"
        );
        return;
    }
    if rx.recv_timeout(Duration::from_secs(10)).is_err() {
        // WR-01: the dispatch was queued but never confirmed within the bound -- treat as
        // unconfirmed, not successful, and re-register for the same reason as the dispatch-Err
        // arm above.
        register_presented_login_sheet(label);
        shell_eprintln!(
            "[shell] WARN: login-window dismiss: '{label}' main-thread hop unconfirmed within 10s -- re-registered as still presented so the cancel routes stay reachable"
        );
    }
}

#[cfg(target_os = "macos")]
struct LoginSheetCancelTargetIvars {
    app: AppHandle,
    label: String,
}

// AppKit target for the native x on every macOS login sheet's bar (quick-261029-o1w for GOG,
// generalised by quick-261029-osq). Cancel is a real NSButton outside the web content, so a page
// can neither remove nor spoof it. `cancelLogin:` runs the same dismiss-then-close order every
// other cancel route uses, so the Destroyed hook pushes "closed".
#[cfg(target_os = "macos")]
define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = LoginSheetCancelTargetIvars]
    struct LoginSheetCancelTarget;

    unsafe impl NSObjectProtocol for LoginSheetCancelTarget {}

    impl LoginSheetCancelTarget {
        #[unsafe(method(cancelLogin:))]
        fn cancel_login(&self, _sender: Option<&AnyObject>) {
            let ivars = self.ivars();
            request_login_sheet_cancel(&ivars.app, &ivars.label, "native");
        }
    }
);

#[cfg(target_os = "macos")]
impl LoginSheetCancelTarget {
    fn new(app: AppHandle, label: String, mtm: objc2::MainThreadMarker) -> Retained<Self> {
        let target = mtm
            .alloc::<LoginSheetCancelTarget>()
            .set_ivars(LoginSheetCancelTargetIvars { app, label });
        unsafe { msg_send![super(target), init] }
    }
}

/// Geometry of the top bar band inside a container of height `bounds_h` (quick-261029-osq).
/// Returns `(bar_y, webview_y, webview_h)`: the bar fills the TOP `NATIVE_LOGIN_BAR_HEIGHT`
/// points (so `bar_y = h - 32` unflipped, `0` flipped) and the webview takes the rest.
#[cfg(target_os = "macos")]
pub(crate) fn native_login_bar_band(bounds_h: f64, flipped: bool) -> (f64, f64, f64) {
    let bar = NATIVE_LOGIN_BAR_HEIGHT.min(bounds_h.max(0.0));
    let webview_h = (bounds_h - bar).max(0.0);
    if flipped {
        (0.0, bar, webview_h)
    } else {
        ((bounds_h - bar).max(0.0), 0.0, webview_h)
    }
}

#[cfg(target_os = "macos")]
thread_local! {
    /// Origin labels of the installed native bars, keyed by login-window label. Main-thread only
    /// (AppKit views are not `Send`), which is why every access hops through `run_on_main_thread`.
    static NATIVE_LOGIN_BAR_LABELS: std::cell::RefCell<
        std::collections::HashMap<String, Retained<objc2_app_kit::NSTextField>>,
    > = std::cell::RefCell::new(std::collections::HashMap::new());
}

/// Main-thread half of `update_native_login_bar_origin`; a no-op when `label` has no bar (Epic's
/// free-floating window, hidden reveal/clear windows).
#[cfg(target_os = "macos")]
fn set_native_login_bar_origin_on_main(label: &str, origin: &str) {
    NATIVE_LOGIN_BAR_LABELS.with(|reg| {
        if let Some(field) = reg.borrow().get(label) {
            field.setStringValue(&NSString::from_str(origin));
        }
    });
}

/// Re-texts the native bar's origin label (quick-261029-osq). `origin` MUST be the origin of a
/// shell-validated main-frame URL, never page content or the document title (T-osq-01).
/// Fire-and-forget; logs nothing about the origin (T-34.4.1-106).
#[cfg(target_os = "macos")]
pub(crate) fn update_native_login_bar_origin(app: &AppHandle, label: &str, origin: &str) {
    let label = label.to_string();
    let origin = origin.to_string();
    let _ = app.run_on_main_thread(move || set_native_login_bar_origin_on_main(&label, &origin));
}

/// Drops the registry entry for a destroyed login window (call from the `Destroyed` hooks).
#[cfg(target_os = "macos")]
pub(crate) fn forget_native_login_bar(app: &AppHandle, label: &str) {
    let label = label.to_string();
    let _ = app.run_on_main_thread(move || {
        NATIVE_LOGIN_BAR_LABELS.with(|reg| {
            reg.borrow_mut().remove(&label);
        });
    });
}

/// Installs the native login-sheet bar (quick-261029-osq) and insets `webview` below it. One
/// builder serves the injected Humble/Amazon sheets and the GOG pristine sheet.
///
/// `container` is the webview's superview. The webview frame becomes the container bounds minus
/// a `NATIVE_LOGIN_BAR_HEIGHT` band at the top, keeping `ViewWidthSizable|ViewHeightSizable` (both
/// margins fixed, so the inset survives any resize). Sibling views are pinned to the top: a
/// `#161c1e` fill, a 1pt `#272f31` bottom line, the centred origin label (`#caf3fd`, 12pt), and a
/// borderless 18pt x button with tooltip and accessibility label "Cancel sign-in". Pure AppKit:
/// no JS is evaluated or injected (Turnstile fails on any injection), no private API.
/// `origin` is shown verbatim; callers pass only a shell-validated origin (T-osq-01).
#[cfg(target_os = "macos")]
pub(crate) fn install_native_login_bar(
    container: &objc2_app_kit::NSView,
    webview: &objc2_app_kit::NSView,
    origin: &str,
    app: AppHandle,
    label: String,
    mtm: objc2::MainThreadMarker,
) {
    use objc2_app_kit::NSAutoresizingMaskOptions as Mask;

    let flipped = container.isFlipped();
    let bounds = container.bounds();
    let (bar_y, webview_y, webview_h) = native_login_bar_band(bounds.size.height, flipped);
    let bar_h = NATIVE_LOGIN_BAR_HEIGHT.min(bounds.size.height.max(0.0));
    let x = bounds.origin.x;
    let w = bounds.size.width;
    let top_pin = if flipped {
        Mask::ViewMaxYMargin
    } else {
        Mask::ViewMinYMargin
    };
    let srgb = |r: u8, g: u8, b: u8| {
        objc2_app_kit::NSColor::colorWithSRGBRed_green_blue_alpha(
            r as f64 / 255.0,
            g as f64 / 255.0,
            b as f64 / 255.0,
            1.0,
        )
    };

    webview.setFrame(NSRect::new(
        NSPoint::new(x, bounds.origin.y + webview_y),
        NSSize::new(w, webview_h),
    ));
    webview.setAutoresizingMask(Mask::ViewWidthSizable | Mask::ViewHeightSizable);

    let fill_box = |frame: NSRect, color: &objc2_app_kit::NSColor| {
        let b = objc2_app_kit::NSBox::initWithFrame(mtm.alloc(), frame);
        b.setBoxType(objc2_app_kit::NSBoxType::Custom);
        b.setTitlePosition(objc2_app_kit::NSTitlePosition::NoTitle);
        b.setBorderWidth(0.0);
        b.setContentViewMargins(NSSize::new(0.0, 0.0));
        b.setFillColor(color);
        b.setAutoresizingMask(Mask::ViewWidthSizable | top_pin);
        b
    };

    // 32pt fill.
    let fill = fill_box(
        NSRect::new(
            NSPoint::new(x, bounds.origin.y + bar_y),
            NSSize::new(w, bar_h),
        ),
        &srgb(0x16, 0x1c, 0x1e),
    );
    container.addSubview(&fill);

    // 1pt bottom line at the band's page-facing edge.
    let line_y = if flipped { bar_y + bar_h - 1.0 } else { bar_y };
    let line = fill_box(
        NSRect::new(
            NSPoint::new(x, bounds.origin.y + line_y),
            NSSize::new(w, 1.0),
        ),
        &srgb(0x27, 0x2f, 0x31),
    );
    container.addSubview(&line);

    // Centred origin label, inset so it never runs under the x.
    let text = objc2_app_kit::NSTextField::labelWithString(&NSString::from_str(origin), mtm);
    text.setAlignment(objc2_app_kit::NSTextAlignment::Center);
    text.setFont(Some(&objc2_app_kit::NSFont::systemFontOfSize(12.0)));
    text.setTextColor(Some(&srgb(0xca, 0xf3, 0xfd)));
    text.setSelectable(false);
    text.setEditable(false);
    text.setLineBreakMode(objc2_app_kit::NSLineBreakMode::ByTruncatingTail);
    let label_h = 16.0_f64.min(bar_h);
    let label_inset = NATIVE_LOGIN_BAR_HEIGHT + 4.0;
    text.setFrame(NSRect::new(
        NSPoint::new(
            x + label_inset,
            bounds.origin.y + bar_y + (bar_h - label_h) / 2.0,
        ),
        NSSize::new((w - 2.0 * label_inset).max(0.0), label_h),
    ));
    text.setAutoresizingMask(Mask::ViewWidthSizable | top_pin);
    container.addSubview(&text);

    // Native x at the right edge.
    let target = LoginSheetCancelTarget::new(app, label.clone(), mtm);
    let button = unsafe {
        objc2_app_kit::NSButton::buttonWithTitle_target_action(
            &NSString::from_str("\u{00D7}"),
            Some(&*target),
            Some(objc2::sel!(cancelLogin:)),
            mtm,
        )
    };
    button.setBordered(false);
    button.setFont(Some(&objc2_app_kit::NSFont::systemFontOfSize(18.0)));
    button.setContentTintColor(Some(&srgb(0xca, 0xf3, 0xfd)));
    button.setFrame(NSRect::new(
        NSPoint::new(
            x + (w - NATIVE_LOGIN_BAR_HEIGHT).max(0.0),
            bounds.origin.y + bar_y,
        ),
        NSSize::new(NATIVE_LOGIN_BAR_HEIGHT, bar_h),
    ));
    button.setAutoresizingMask(Mask::ViewMinXMargin | top_pin);
    button.setToolTip(Some(&NSString::from_str("Cancel sign-in")));
    objc2_app_kit::NSAccessibility::setAccessibilityLabel(
        &*button,
        Some(&NSString::from_str("Cancel sign-in")),
    );
    container.addSubview(&button);
    // NSButton's target is a weak reference, so the target must outlive the button. Intentional
    // leak (one tiny NSObject per sign-in), the same precedent as the nav delegate.
    std::mem::forget(target);

    NATIVE_LOGIN_BAR_LABELS.with(|reg| {
        reg.borrow_mut().insert(label.clone(), text);
    });
    // Frame numbers only, never the origin (T-34.4.1-106).
    shell_eprintln!(
        "[shell] login-bar: installed for '{label}' flipped={flipped} webview_y={webview_y} webview_h={webview_h} bar_h={bar_h}"
    );
}

/// GOG's and Epic's login as a macOS AppKit sheet. GOG (quick-261029-o1w) and Epic
/// (quick-261029-utr, lifting the REQ-34.4.2-10 Epic descope at the operator's request) both use
/// the pristine (injection-free) WKWebView path, which is a plain `tauri::Window` with no sheet
/// attachment. For visible requests this builds it ordered-out with a native cancel button, then
/// presents it via `present_login_window_as_sheet` raced against the same watchdog the other
/// store logins use, falling back to a visible free-standing window if the attach is unconfirmed.
/// Always resolves the single-flight latch armed by `humble_login_open`. Both stores are sized
/// 464x592 through `as_sheet = visible`. `store` (`"epic"` / `"gog"`) only labels the log lines
/// and is derived by the caller from the validated URL host. The `as_sheet == false` branch of
/// `open_pristine_epic_login_window` (900x700, centred, focused) now has no live caller and is
/// kept on purpose as the rollback path should the Epic live gate fail.
#[cfg(target_os = "macos")]
pub(crate) fn open_pristine_login_sheet(
    app: &AppHandle,
    label: &str,
    url: tauri::Url,
    visible: bool,
    user_agent: &str,
    store: &str,
) -> Result<Value, String> {
    let result =
        match open_pristine_epic_login_window(app, label, url, visible, user_agent, visible) {
            Ok(value) => value,
            Err(e) => {
                clear_pending_visible_login_window(label);
                return Err(e);
            }
        };
    if visible {
        let window = app.get_window(label);
        if let Some(window) = window.as_ref() {
            let hook_app = app.clone();
            let hook_label = label.to_string();
            window.on_window_event(move |event| {
                if matches!(event, tauri::WindowEvent::Destroyed) {
                    dismiss_login_window_sheet(&hook_app, &hook_label);
                    forget_native_login_bar(&hook_app, &hook_label);
                    clear_pending_visible_login_window(&hook_label);
                }
            });
            let (done_tx, done_rx) = mpsc_channel::<bool>();
            let app_for_sheet = app.clone();
            let label_for_sheet = label.to_string();
            thread::spawn(move || {
                let attached = present_login_window_as_sheet(&app_for_sheet, &label_for_sheet);
                let _ = done_tx.send(attached);
            });
            let attached = match done_rx.recv_timeout(LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT) {
                Ok(attached) => attached,
                Err(_) => {
                    shell_eprintln!(
                        "[shell] WARN: humble_login_open:{store}-sheet: '{label}' sheet-attach watchdog exceeded {LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT:?} -- treating as unconfirmed"
                    );
                    false
                }
            };
            if !attached {
                shell_eprintln!(
                    "[shell] WARN: humble_login_open:{store}-sheet: '{label}' sheet attachment unconfirmed -- falling back to a free-standing visible window"
                );
                let _ = window.show();
                let _ = window.set_focus();
            }
            shell_eprintln!("[shell] humble_login_open:{store}-sheet: sheet_presented={attached}");
        }
    }
    clear_pending_visible_login_window(label);
    Ok(result)
}

/// Fixes the live-observed Epic logout defect (`humble_login_clear_cookies` rejecting with
/// `humble_login:no-window:{label}` on EVERY Epic logout, `gamelib.log`, 2026-08-03): Epic's
/// login window is ALWAYS the pristine, webview-less `WindowBuilder` window
/// `open_pristine_epic_login_window` builds (`humble_login_open`'s `is_epic_login` branch,
/// unconditional on macOS -- there is no "Epic but not pristine" case to preserve), so
/// `app.get_webview_window(label)` structurally can never find it, for ANY label, fresh or
/// stale. The label was never a real lookup key for cookie data in the first place: the
/// pristine webview's `WKWebViewConfiguration::new(mtm)` uses no custom `websiteDataStore`
/// override, so its cookies live in the SAME process-wide `WKWebsiteDataStore::defaultDataStore()`
/// every Tauri-managed window already shares -- D-08's own "the jar is app-wide" comment on
/// `humble_login_clear_cookies` above. Clearing that store directly needs no window handle at
/// all, live or closed, Tauri-managed or raw -- so this function is deliberately
/// label-independent, taking only the domain to filter on.
///
/// Removal mechanism is the SAME one `humble_login_clear_cookies`'s existing per-window macOS
/// branch already proved correct (Plan 23, F-6 Defect B): `WKWebsiteDataStore
/// .removeDataOfTypes(forDataRecords:completionHandler:)`, scoped to
/// `WKWebsiteDataTypeCookies` + `WKWebsiteDataTypeDiskCache` + `WKWebsiteDataTypeMemoryCache`
/// (debug session `epic-cold-jar-login-timeout`, 2026-09-28 -- see the removal call site's own
/// doc comment for why the disk/memory cache had to be added) and to records whose
/// `displayName()` domain-suffix-matches `domain` -- never
/// `WKHTTPCookieStore.deleteCookie()` (the filed WebKit defect, bugs.webkit.org #184938, that
/// reports success while silently deleting nothing; see that branch's own doc comment). The
/// measured count comes from `WKHTTPCookieStore.getAllCookies()` -- a real per-cookie read,
/// genuinely INDEPENDENT of the data-record removal path above it -- taken both before and
/// after the removal and reduced through the same `verified_delete_count` (before-after,
/// saturating) contract every other clear path in this file uses. This function can never
/// report success while removing nothing: the count it returns is never the mutating call's
/// own report, always a fresh re-read (the discipline the file's D-08 comment establishes and
/// this function's own doc note repeats because F-6 already proved a mutating call's own
/// "it completed" signal is not proof of anything on this platform).
#[cfg(target_os = "macos")]
pub(crate) fn clear_default_data_store_cookies_for_domain(
    app: &AppHandle,
    domain: &str,
) -> Result<Value, String> {
    let count_matching_cookies = |domain: &str| -> Result<usize, String> {
        let (tx, rx) = mpsc_channel::<Result<usize, String>>();
        let domain_owned = domain.to_string();
        if let Err(e) = app.run_on_main_thread(move || {
            let outcome: Result<(), String> = (|| {
                let mtm = objc2::MainThreadMarker::new().ok_or_else(|| {
                    "humble_login_clear_cookies:default-store:no-main-thread-marker".to_string()
                })?;
                // SAFETY: `mtm` proves this closure is running on the main thread.
                let data_store =
                    unsafe { objc2_web_kit::WKWebsiteDataStore::defaultDataStore(mtm) };
                let cookie_store = unsafe { data_store.httpCookieStore() };
                let target_domain = domain_owned.clone();
                let tx_fetch = tx.clone();
                // SAFETY: `getAllCookies` hands the completion handler a valid, live array
                // pointer for the duration of this call; `tx_fetch` outlives it.
                let completion = block2::RcBlock::new(
                    move |cookies: std::ptr::NonNull<
                        objc2_foundation::NSArray<objc2_foundation::NSHTTPCookie>,
                    >| {
                        let cookies_ref = unsafe { cookies.as_ref() };
                        // Never logged (T-34.4.1-21/T-28-04/T-34.4.1-39/-75/-91) -- each
                        // cookie's domain is read only to feed the pure, count-only
                        // `cookie_domain_matches` filter, never printed.
                        let count = cookies_ref
                            .to_vec()
                            .iter()
                            .filter(|cookie| {
                                cookie_domain_matches(
                                    &cookie.domain().to_string(),
                                    Some(&target_domain),
                                )
                            })
                            .count();
                        let _ = tx_fetch.send(Ok(count));
                    },
                );
                unsafe {
                    cookie_store.getAllCookies(&completion);
                }
                Ok(())
            })();
            if let Err(e) = outcome {
                let _ = tx.send(Err(e));
            }
        }) {
            return Err(format!(
                "humble_login_clear_cookies:default-store:dispatch-failed:{e}"
            ));
        }
        match rx.recv_timeout(CLEAR_COOKIES_TIMEOUT) {
            Ok(inner) => inner,
            // Mirrors the per-window branch above: a timeout here means the SIGNAL was
            // missed, not that the read itself is meaningless -- there is nothing to fall
            // back to for a COUNT specifically (unlike the removal below, which always has
            // a re-read to fall through to), so this one case does surface as an error.
            Err(_) => Err("humble_login_clear_cookies:default-store:timeout".to_string()),
        }
    };

    let before_matching = count_matching_cookies(domain)?;
    if before_matching == 0 {
        return Ok(Value::Number(0.into()));
    }

    let (tx, rx) = mpsc_channel::<()>();
    let domain_for_removal = domain.to_string();
    if let Err(e) = app.run_on_main_thread(move || {
        let Some(mtm) = objc2::MainThreadMarker::new() else {
            // Structurally should not happen inside a run_on_main_thread closure; fail safe
            // by signalling "done, nothing removed" rather than hanging until the timeout.
            let _ = tx.send(());
            return;
        };
        // SAFETY: `mtm` proves this closure is running on the main thread.
        let data_store = unsafe { objc2_web_kit::WKWebsiteDataStore::defaultDataStore(mtm) };
        let data_store_for_removal = data_store.clone();
        let all_types = unsafe { objc2_web_kit::WKWebsiteDataStore::allWebsiteDataTypes(mtm) };
        let tx_fetch = tx.clone();
        let target_domain = domain_for_removal.clone();
        let fetch_completion = block2::RcBlock::new(
            move |records: std::ptr::NonNull<
                objc2_foundation::NSArray<objc2_web_kit::WKWebsiteDataRecord>,
            >| {
                // SAFETY: WebKit hands the completion handler a valid, live array pointer for
                // the duration of this call.
                let records_ref = unsafe { records.as_ref() };
                let all_records: Vec<objc2::rc::Retained<objc2_web_kit::WKWebsiteDataRecord>> =
                    records_ref.to_vec();
                let matching_records: Vec<&objc2_web_kit::WKWebsiteDataRecord> = all_records
                    .iter()
                    .filter(|record| {
                        // SAFETY: `displayName()` is a simple ObjC accessor; `record` is a
                        // live, retained object from `all_records`. Never logged -- passed
                        // only into the pure, count-only `website_data_record_matches_domain`
                        // filter.
                        let display_name = unsafe { record.displayName() }.to_string();
                        website_data_record_matches_domain(&display_name, &target_domain)
                    })
                    .map(|record| &**record)
                    .collect();
                if matching_records.is_empty() {
                    let _ = tx_fetch.send(());
                    return;
                }
                // Scoped to WKWebsiteDataTypeCookies PLUS the native HTTP disk/memory
                // cache -- a matched record may also carry localStorage/IndexedDB/
                // Cache-Storage(fetch) data for the same domain; `humble_login_clear_storage`
                // (a separate, already-shipped step) owns THOSE, via injected JS
                // (localStorage.clear()/indexedDB/`caches`/service-worker unregister).
                //
                // CORRECTION (debug session `epic-cold-jar-login-timeout`, 2026-09-28):
                // this comment previously read "cache data... `humble_login_clear_storage`
                // owns those", which conflated two distinct WebKit concepts. The JS-observable
                // `caches` Cache Storage API (`WKWebsiteDataTypeFetchCache`) IS covered by
                // `humble_login_clear_storage`'s injected script. WebKit's own native HTTP
                // resource cache (`WKWebsiteDataTypeDiskCache`/`WKWebsiteDataTypeMemoryCache`,
                // the one backing `NetworkResourceLoader::retrieveCacheEntry`) is NOT --
                // there is no JS API for it, only this native `removeDataOfTypes` call. Left
                // uncovered, a disk-cache entry written by an earlier authenticated session
                // (e.g. a real Epic login) survives this cookie-only clear indefinitely inside
                // the shared, process-wide `WKWebsiteDataStore::defaultDataStore()`, and gets
                // replayed verbatim (confirmed live: `retrieveCacheEntry: HTTP
                // (foundCachedEntry=1)`, zero network round-trips, first-ever load of the page
                // in the window) to the next cold-jar sign-in attempt -- serving
                // authenticated-shaped markup to a webview with no cookies, which then polls
                // session-dependent subresources that can never resolve for the full 300s
                // client timeout. Adding the two disk/memory-cache types here closes that gap,
                // still scoped to `matching_records` (this domain only) -- not a blanket wipe
                // (REQ-34.4.1-06).
                //
                // SAFETY: `WKWebsiteDataTypeCookies`/`WKWebsiteDataTypeDiskCache`/
                // `WKWebsiteDataTypeMemoryCache` are valid static `NSString`s this crate
                // exposes; reading an extern static is the only unsafe part of this line.
                let cookies_type: &objc2_foundation::NSString =
                    unsafe { objc2_web_kit::WKWebsiteDataTypeCookies };
                let disk_cache_type: &objc2_foundation::NSString =
                    unsafe { objc2_web_kit::WKWebsiteDataTypeDiskCache };
                let memory_cache_type: &objc2_foundation::NSString =
                    unsafe { objc2_web_kit::WKWebsiteDataTypeMemoryCache };
                let cookies_type_set = objc2_foundation::NSSet::from_slice(&[
                    cookies_type,
                    disk_cache_type,
                    memory_cache_type,
                ]);
                let matched_record_count = matching_records.len();
                let records_array = objc2_foundation::NSArray::from_slice(&matching_records);
                let tx_remove = tx_fetch.clone();
                let remove_completion = block2::RcBlock::new(move || {
                    let _ = tx_remove.send(());
                });
                shell_eprintln!(
                    "[shell] humble_login_clear_cookies: default-store evicting cookies + HTTP disk/memory cache for {matched_record_count} matching data record(s) (domain-scoped, count only)"
                );
                // SAFETY: `data_store_for_removal` is a live object obtained on the main
                // thread above; `cookies_type_set`/`records_array` are freshly built, live
                // objects; `remove_completion` outlives the call.
                unsafe {
                    data_store_for_removal.removeDataOfTypes_forDataRecords_completionHandler(
                        &cookies_type_set,
                        &records_array,
                        &remove_completion,
                    );
                }
            },
        );
        // SAFETY: `data_store`/`all_types` are live objects obtained above on the main
        // thread; `fetch_completion` outlives the call.
        unsafe {
            data_store.fetchDataRecordsOfTypes_completionHandler(&all_types, &fetch_completion);
        }
    }) {
        shell_eprintln!("[shell] humble_login_clear_cookies: default-store dispatch failed: {e}");
        return Err(format!(
            "humble_login_clear_cookies:default-store:dispatch:{e}"
        ));
    }

    if rx.recv_timeout(CLEAR_COOKIES_TIMEOUT).is_err() {
        shell_eprintln!(
            "[shell] humble_login_clear_cookies: default-store WKWebsiteDataStore removal timed out waiting for the completion signal"
        );
    }

    let after_matching = count_matching_cookies(domain)?;
    Ok(Value::Number(
        verified_delete_count(before_matching, after_matching).into(),
    ))
}

/// Label-independent per-domain cookie CENSUS read against the process-wide default data
/// store (closes D-35-29-01, the sole remaining blocker on Phase 35's re-verification).
///
/// The census arm resolved its window with `app.get_webview_window(label)` and rejected with a
/// `no-window:{label}` error whenever that returned `None`. For Epic that was EVERY call --
/// see `clear_default_data_store_cookies_for_domain`'s own doc comment directly above for why
/// the label was never a real lookup key for cookie data, and why the pristine login window's
/// cookies live in the SAME `WKWebsiteDataStore::defaultDataStore()` this function reads. That
/// is not restated here; it is the same defect, on the read side.
///
/// The consequence was measured live (packaged 0.7.0, 2026-08-31): all five Epic-owned hosts
/// logged `before(total=unavailable, matched=unavailable, verdict=UNSUPPORTED_OR_ERROR)`, so
/// the census had never once produced a reading -- and BOTH consuming branches in
/// `legendary/user.ts` (`brokenHosts`, which needs `SUPPORTED_NONEMPTY`, and the non-fatal
/// already-empty branch, which needs `SUPPORTED_BUT_EMPTY`) were structurally unreachable.
/// The broken-per-host detector was dead code on the only path it serves. This function is
/// the read-side mirror of the clear-side fallback above, deliberately identical in shape so
/// the two label-independent paths sit together and diverge only in what they do with the
/// cookies they find.
///
/// F-34.4.2-12 round-trip accounting, which this function is required to preserve, recorded
/// here as numbers so a future edit has to argue with a measurement rather than a feeling:
///
/// | | wry `.cookies()` per host (macOS) | native `getAllCookies` per host |
/// | --- | --- | --- |
/// | before this fix | 0 | 2 (the clear path's before/after, default store) |
/// | after this fix  | 0 -- UNCHANGED | 4 (adds this census's before/after, default store) |
///
/// The macOS wry `.cookies()` count stays at ZERO. The two added reads reuse the exact shape
/// `clear_default_data_store_cookies_for_domain`'s `count_matching_cookies` closure already
/// runs twice per host, live, without deadlock: `run_on_main_thread` a closure that only
/// REGISTERS a `block2::RcBlock` completion on `getAllCookies` and returns immediately, with
/// the `mpsc` wait done on the CALLING (worker) thread, never nested inside the main-thread
/// closure. Nothing here is bound to a window, so `with_webview` reentrancy -- the other half
/// of the reproduced deadlock -- is not in play either.
#[cfg(target_os = "macos")]
pub(crate) fn default_data_store_cookies_for_domain(
    app: &AppHandle,
    domain: &str,
    names: &[&str],
) -> Result<Value, String> {
    let (tx, rx) = mpsc_channel::<Result<(usize, Vec<Value>), String>>();
    let target_domain = domain.to_string();
    let target_names: Vec<String> = names.iter().map(|n| n.to_string()).collect();
    if let Err(e) = app.run_on_main_thread(move || {
        let outcome: Result<(), String> = (|| {
            let mtm = objc2::MainThreadMarker::new().ok_or_else(|| {
                "humble_login_cookies_for_domain:default-store:no-main-thread-marker".to_string()
            })?;
            // SAFETY: `mtm` proves this closure is running on the main thread.
            let data_store = unsafe { objc2_web_kit::WKWebsiteDataStore::defaultDataStore(mtm) };
            let cookie_store = unsafe { data_store.httpCookieStore() };
            let filter_domain = target_domain.clone();
            let filter_names = target_names.clone();
            let tx_fetch = tx.clone();
            // SAFETY: `getAllCookies` hands the completion handler a valid, live array
            // pointer for the duration of this call; `tx_fetch` outlives it.
            let completion = block2::RcBlock::new(
                move |cookies: std::ptr::NonNull<
                    objc2_foundation::NSArray<objc2_foundation::NSHTTPCookie>,
                >| {
                    let cookies_ref = unsafe { cookies.as_ref() };
                    let all_cookies = cookies_ref.to_vec();
                    // The UNFILTERED jar size. This is `legendary/user.ts`'s liveness proof
                    // (`everProvedLive`) -- the property that makes a later zero mean
                    // "genuinely empty" rather than "the read channel silently did nothing".
                    let total = all_cookies.len();
                    // Never logs a cookie name, value or domain (T-34.4.1-02, T-34.4.1-94):
                    // domains and names are read only to feed the pure filters below, values
                    // go solely into the returned payload the caller already explicitly
                    // requested over the already-allowlisted rustInvoke channel.
                    //
                    // Census direction, matching the arm this backs and
                    // `humble_login_clear_cookies`'s own filter: the cookie's OWN domain
                    // first, the caller's FIXED target second (spike 016 measured the other
                    // direction undercounting 29/33 against a fixed apex).
                    let matched: Vec<Value> = all_cookies
                        .into_iter()
                        .filter(|c| {
                            cookie_domain_matches(&c.domain().to_string(), Some(&filter_domain))
                        })
                        .filter(|c| {
                            filter_names.is_empty()
                                || filter_names
                                    .iter()
                                    .any(|n| n.as_str() == c.name().to_string())
                        })
                        .map(|c| {
                            serde_json::json!({
                                "name": c.name().to_string(),
                                "domain": c.domain().to_string(),
                                "value": c.value().to_string()
                            })
                        })
                        .collect();
                    let _ = tx_fetch.send(Ok((total, matched)));
                },
            );
            unsafe {
                cookie_store.getAllCookies(&completion);
            }
            Ok(())
        })();
        if let Err(e) = outcome {
            let _ = tx.send(Err(e));
        }
    }) {
        return Err(format!(
            "humble_login_cookies_for_domain:default-store:dispatch:{e}"
        ));
    }
    match rx.recv_timeout(CLEAR_COOKIES_TIMEOUT) {
        Ok(Ok((total, matched))) => Ok(serde_json::json!({ "total": total, "matched": matched })),
        Ok(Err(e)) => Err(e),
        Err(_) => Err("humble_login_cookies_for_domain:default-store:timeout".to_string()),
    }
}

/// Classifies a raw `keyring` crate outcome (`Entry::new(...).and_then(|e| e.get_password())`)
/// into the arm's `Value`/`String` contract (34.4.1 gap cycle 2 plan 26, F-9 observability
/// half). Extracted as its own pure function so this classification is directly testable
/// without a live Keychain (mirrors `keyring_account`'s own "pure function, directly testable"
/// precedent) -- Task 2's acceptance criteria requires the `NoEntry`-still-null path proven,
/// and this is the seam that proves it. `NoEntry` is the healthy first-run state (Pitfall 1 /
/// D-06) and resolves `Value::Null`, never an error; every other variant collapses into the
/// file's existing flat `keyring:unavailable:{e}` string convention.
pub(crate) fn keyring_get_result(result: Result<String, keyring::Error>) -> Result<Value, String> {
    match result {
        Ok(secret) => Ok(Value::String(secret)),
        Err(keyring::Error::NoEntry) => Ok(Value::Null),
        Err(e) => Err(format!("keyring:unavailable:{e}")),
    }
}

/// The closed set of successful keyring-operation outcomes a `shell_diag()` line may report
/// (quick 261001-p0s, closing the "keyring RPC arms are success-silent" todo). A closed enum
/// rather than a free `&str` parameter: a free string would make it possible to pass a secret
/// as the token, which this type cannot do by construction -- mirrors `afb0fe744`'s
/// `WriteDirection` reasoning in `devSecretVault.ts`, ported to Rust.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum KeyringOutcome {
    Found,
    Absent,
    Stored,
    Deleted,
}

impl KeyringOutcome {
    pub(crate) fn token(self) -> &'static str {
        match self {
            KeyringOutcome::Found => "found",
            KeyringOutcome::Absent => "absent",
            KeyringOutcome::Stored => "stored",
            KeyringOutcome::Deleted => "deleted",
        }
    }
}

/// Renders one keyring success line. Pure and side-effect-free -- same split as
/// `format_panic_record` above, so a test can assert what the line carries without writing to
/// the operator's real log file. No `[shell] ` prefix: `shell_diag` prepends that itself, and a
/// second copy here would double it.
///
/// `account: &'static str` is load-bearing, not a style choice: any secret value is a
/// runtime-derived `String`, which does not coerce to `&'static str`, so the compiler -- not a
/// reviewer -- forbids passing one here. Only `keyring_account()`'s allowlisted return satisfies
/// this parameter; the raw, caller-supplied `keyring_slot_arg()` text never does.
pub(crate) fn keyring_outcome_message(
    channel: &str,
    account: &'static str,
    outcome: KeyringOutcome,
) -> String {
    format!(
        "keyring {channel} account={account} outcome={}",
        outcome.token()
    )
}

/// Classifies a `keyring_get` result into `Found`/`Absent` by reading the `Value`
/// DISCRIMINANT only -- never the payload. That is the whole reason this takes `&Value` and
/// returns an enum rather than formatting anything itself: even the fact of which secret was
/// read must never carry any part of the secret.
pub(crate) fn keyring_get_outcome(value: &Value) -> KeyringOutcome {
    if value.is_null() {
        KeyringOutcome::Absent
    } else {
        KeyringOutcome::Found
    }
}

/// Runs `read` on a worker thread and bounds the wait for its result at `bound`, returning
/// `Err("keyring:timeout")` if `read` has not completed in time (34.4.1 gap cycle 2 plan 26,
/// T-34.4.1-114/T-34.4.1-115). Follows `humble_reveal_post`'s existing `mpsc_channel` +
/// `rx.recv_timeout()` shape rather than inventing a second one. Generic over the read
/// operation specifically so the timeout path is provable in a unit test with an injected
/// slow/never-returning closure, never by waiting on a real Keychain (this plan's own
/// acceptance criteria) -- see `bounded_keyring_read_times_out_as_keyring_timeout_on_a_never_
/// returning_operation` below.
///
/// A timed-out worker thread is ABANDONED, not cancelled -- there is no API to interrupt a
/// blocked platform call, so this function protects the caller's wait, not the underlying
/// operation. If `read` eventually completes after the bound has already elapsed, its result is
/// sent into a channel whose receiver has already been dropped; `Sender::send` on a
/// disconnected channel simply returns an `Err` this function discards, so the abandoned
/// thread's late result is silently dropped rather than causing a panic.
pub(crate) fn bounded_keyring_read<F>(bound: Duration, read: F) -> Result<Value, String>
where
    F: FnOnce() -> Result<Value, String> + Send + 'static,
{
    let (tx, rx) = mpsc_channel::<Result<Value, String>>();
    thread::spawn(move || {
        let _ = tx.send(read());
    });
    match rx.recv_timeout(bound) {
        Ok(result) => result,
        Err(_) => Err("keyring:timeout".to_string()),
    }
}

