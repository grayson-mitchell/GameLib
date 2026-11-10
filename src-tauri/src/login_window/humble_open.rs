//! Humble login window open/close/take_events handlers (Phase 71 D-07, D-12). Child of `login_window`; sees its private items.

use super::*;

// Open a fail-closed child login window on any https URL (Phase 34.4.1 Plan 01,
// D-01/D-02, REQ-34.4.1-01/REQ-34.4.1-09). Runner-agnostic by design: nothing
// here knows what Humble is. `.user_agent()` is MANDATORY, not reinforcement --
// Tauri's default macOS UA carries no browser product token at all (spike 013).
// Deliberately NO `.title()` call (WR-07 anti-phishing: the loaded document's
// own title must show, never a hard-coded "GameLib"). The relay is wired to
// `on_page_load` (main-frame Started/Finished only), NEVER `on_navigation` --
// spike 013 measured 5 of 8 `on_navigation` events as third-party iframes, and
// relaying those would let an ad frame re-arm the sidecar's login-watch deadline
// forever (Pitfall 2).
//
// F-4 fix (Phase 34.4.1 Plan 18, T-34.4.1-79/T-34.4.1-82): the live gate found
// the VISIBLE login window too small for Humble's login form plus a Humble
// Guard / OTP step, and lost behind other applications once the operator
// switched away to fetch a code. `.inner_size()`/`.center()`/`.focused(true)`
// below fix both, applied ONLY when `visible` is true -- the SAME arm also
// builds the hidden reveal/clear windows (disconnect's clear, reveal-POST),
// and sizing/centering/raising one of those would be wasted work at best and
// a visible flash at worst, on a path whose whole design is that nothing is
// shown (T-34.4.1-82). `.focused(true)` raises-and-focuses ONCE on creation,
// deliberately NOT `.always_on_top(true)`: a permanent flag would force the
// operator to fight past the login window to reach the very password-manager
// window or OS credential prompt they switched away to use, trading one
// findability problem for a worse one.
//
// WR-07 CORRECTION (Phase 34.4.1 Plan 24, research Pitfall 3 in the flesh): an
// earlier version of this comment claimed WR-07 was "enforced by the grep gate
// in this plan's own acceptance criteria, not by intent alone." That claim was
// FALSE and misdirected two live gate operators, both of whom reported the
// title bar read the framework default, "Tauri app" -- neither Humble's own
// title (what WR-07 requires) nor a hard-coded "GameLib" (what WR-07
// prohibits). A grep gate proving `.title(` is never hard-coded can only
// establish the ABSENCE of the prohibited value; it structurally cannot
// establish the PRESENCE of the required one. Omitting `.title()` does NOT by
// itself make the OS window title track the loaded document's title -- that
// assumption was never spiked. Tauri's documented mechanism for this (an
// in-source example at `tauri-2.11.5/src/webview/mod.rs:564-567`) is the
// title-tracking builder callback wired below, inside the same `if visible`
// block as the F-4 presentation calls -- a hidden reveal/clear window has no
// title bar for a title to matter on. That callback sets ONLY the OS window
// title; it grants no capability and does not touch the fail-closed label
// scheme (`next_login_window_label()`, REQ-34.4.1-09) in any way. WR-07's
// negative half (no hard-coded title) stays grep-provable, unchanged; WR-07's
// positive half (Humble's own title actually shows) is provable only LIVE --
// see plan 24's SUMMARY and plan 29 item 1, the only thing that closes it.
//
// ANTI-PHISHING ORIGIN (Phase 34.5 Plan 27, F-34.5-G6-04, T-34.5-G6-22/23/39): the
// title-tracking callback above shows the loaded DOCUMENT's title -- a value the
// remote page fully controls -- and nothing else. That is NOT an origin indicator:
// an attacker-influenced or redirected login page can title itself anything,
// including a string designed to look like a real address bar (T-34.5-G6-23), and
// this window has no address bar of its own for the operator to check instead.
// `login_window_title()` fixes this by prefixing the SHELL-RESOLVED origin --
// derived from the validated URL this arm already holds, never from page content
// -- ahead of the document title, unconditionally. The origin is seeded from the
// open URL immediately after `.build()` (visible from the moment the window
// appears, not only after the first title event) and kept current via the SAME
// `on_page_load` hook this arm already trusts for the login relay above --
// main-frame `Started`/`Finished` only, NEVER `on_navigation`: spike 013 measured
// 5 of 8 `on_navigation` events as third-party iframes, the callback carries no
// frame-type flag to filter them, and an iframe overwriting the title bar's origin
// would be the exact inverse of the guarantee this exists to provide
// (T-34.5-G6-39). This is the SAME rule the login relay above already follows, now
// also covering the title's origin source -- one convention, not two. The origin
// is shared between the `on_page_load` hook and the `on_document_title_changed`
// hook via `current_origin` (an `Arc<Mutex<String>>`) so a title change arriving
// between navigations is still composed against the page's CURRENT host, never a
// stale one.
//
// LIGHT INTERFACE STYLE (Phase 34.5 Plan 27, F-34.5-G6-05): the developer's live
// gate report was verbatim "the text was black on black so could not tell my cut
// and paste worked until i highlighted" on Amazon's verification-code field. The
// likely mechanism is a dark `prefers-color-scheme` the webview inherits from the
// host system, mismatched against a page stylesheet that only sets text colour.
// `.theme(Some(tauri::Theme::Light))` below (the builder method at
// `tauri-2.11.5/src/webview/webview_window.rs:882`, "Forces a theme or uses the
// system settings if None was provided") requests a light interface style on our
// OWN window -- it changes what the page is TOLD, not what it runs. No CSS or
// script is injected into the third-party credential page (that would trade a
// legibility defect for a materially worse security posture: running script in a
// live credential context). Applied ONLY inside `if visible`, matching every other
// presentation-only call in this arm -- the hidden reveal/clear windows have no
// user-visible rendering. FALSIFIABLE, not assumed closed: if plan 34.5-28's live
// check still shows unreadable text, `prefers-color-scheme` was not the mechanism
// and this fix must be recorded as NOT closing F-34.5-G6-05.
pub(crate) fn rpc_humble_login_open(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    let open_args = HumbleLoginOpenArgs::from_args(args)?;
    let url = login_window_parse_url(&open_args.url)?;
    let origin = url.origin().ascii_serialization();
    // Epic-only scoping for the pristine-webview route below -- computed BEFORE `url`
    // moves into the builder below, since this is the only signal this runner-agnostic
    // arm has (see `EPIC_LOGIN_HOST`'s own doc comment).
    #[cfg_attr(not(target_os = "macos"), allow(unused_variables))]
    let is_epic_login = matches!(url.host_str(), Some(EPIC_LOGIN_HOST));
    // quick-261029-o1w / quick-261029-utr: GOG and Epic are pristine, presented as a sheet
    // and take part in the single-flight latch below, so both route AFTER the latch
    // (host-keyed only).
    #[cfg_attr(not(target_os = "macos"), allow(unused_variables))]
    let is_gog_login = matches!(url.host_str(), Some(GOG_LOGIN_HOST));
    let visible = open_args.visible;
    let user_agent = open_args.user_agent.as_str();
    let label = next_login_window_label();
    let event_label = label.clone();
    // Pristine-webview route (F-34.5-G6-01): Epic's and GOG's login windows use a
    // Tauri-injection-free WKWebView on macOS instead of this arm's own
    // `WebviewWindowBuilder` path below. See `open_pristine_epic_login_window`'s own
    // doc comment (above) for the mechanism. Since quick-261029-utr the route is taken
    // AFTER the single-flight latch below, through `open_pristine_login_sheet`, for both
    // hosts. Every other runner (and Epic/GOG on non-macOS) falls through to the
    // existing, completely untouched code below. `url` is only moved into the pristine
    // branch when it is actually taken (`return` on the same expression), so the
    // unconditional uses of `url` further down this arm remain valid.
    // T-34.4.2-39 single-flight guard (Phase 34.4.2 Plan 14): refuse a second VISIBLE
    // login window while one is already pending (armed here, not yet resolved) or
    // presented (`PRESENTED_LOGIN_SHEETS` non-empty), so AppKit is never asked to queue
    // a second `beginSheet:` behind the first -- the concrete failure mode this closes
    // is typing one store's password into another store's just-arrived sheet. Sits
    // AFTER the pristine-route variables above and BEFORE the pristine route and the
    // builder below (quick-261029-utr: Epic's old pre-latch exemption, D-D, is lifted),
    // so a refused request never gets a window built. Scoped to `visible`
    // only -- hidden reveal/clear windows (e.g. the Humble health-check/disconnect
    // routes in `src/backend/humble/user.ts`, both `visible: false`) never arm or are
    // refused by this latch.
    //
    // HONEST BOUNDARY: this guard arms at `humble_login_open`, the earliest point this
    // shell can know a login is being opened. It does NOT cover the interval between
    // the user's click and this call -- on the Amazon path that interval is the ~7-8s
    // nile PyInstaller-onefile spawn (F-34.4.2-06), during which the shell has been
    // told nothing. Concretely: if the user clicks Amazon then Humble during that
    // window, Humble presents and Amazon is REFUSED -- the user's first click loses.
    // That is a deliberate trade (an explicit, logged refusal is strictly safer than an
    // unrequested sheet arriving over a dismissed one) and a residual, not full
    // coverage -- see `34.4.2-PLATFORM-SCOPE.md`'s Plan 14 entry.
    //
    // Deliberately `if visible == true {`, NOT the bare `if visible {` this arm uses
    // everywhere else: Plan 08 Test 1 (`tauriShellSource.test.ts`) locates the ORIGINAL
    // `if visible {` block (the builder-setup one containing
    // `login_chrome_css_script(`) via `code.indexOf('if visible {')`, the FIRST
    // occurrence. This guard is required to sit textually BEFORE that block (see the
    // ordering requirement above -- both must be before the same
    // `tauri::WebviewWindowBuilder::new(` call), so an identical bare condition here
    // would make `indexOf` resolve to THIS block instead and silently break that
    // pre-existing test. The comparison changes nothing about the runtime check
    // (`visible` is already a `bool`); `if (visible) {` was tried first and rejected --
    // it compiles but trips rustc's own `unused_parens` warning, violating this file's
    // zero-warnings bar.
    #[cfg(target_os = "macos")]
    if visible == true {
        let now = std::time::Instant::now();
        let mut pending_guard = PENDING_VISIBLE_LOGIN_WINDOW
            .lock()
            .map_err(|_| "humble_login_open:pending-lock-poisoned".to_string())?;
        // Expire a stale latch in passing (T-34.4.2-41): a flow that panicked, hung
        // upstream, or was killed mid-flight must not block every later sign-in for the
        // life of the process.
        if let Some((stale_label, armed_at)) = pending_guard.clone() {
            let age = now.duration_since(armed_at);
            if pending_login_entry_is_stale(age) {
                shell_eprintln!(
                    "[shell] humble_login_open: pending login window latch for '{stale_label}' expired after {age:?} (TTL {PENDING_VISIBLE_LOGIN_WINDOW_TTL:?}) -- treating as absent"
                );
                *pending_guard = None;
            }
        }
        let incumbent = pending_guard
            .as_ref()
            .map(|(pending_label, _)| pending_label.clone())
            .or_else(|| {
                PRESENTED_LOGIN_SHEETS
                    .lock()
                    .ok()
                    .and_then(|guard| guard.as_ref().and_then(|list| list.first().cloned()))
            });
        if let Some(incumbent_label) = incumbent {
            shell_eprintln!(
                "[shell] humble_login_open: REFUSED visible login window '{label}' -- '{incumbent_label}' is already pending or presented (T-34.4.2-39 single-flight)"
            );
            return Err("humble_login_open:login-already-in-progress".to_string());
        }
        *pending_guard = Some((label.clone(), now));
        shell_eprintln!(
            "[shell] humble_login_open: visible login window '{label}' armed as the single pending login flow (T-34.4.2-39)"
        );
    }
    // quick-261029-o1w (GOG) and quick-261029-utr (Epic): the pristine window, presented
    // as a sheet. Placed AFTER the latch so a refused second login never builds a window
    // and both stores arm the latch. `store` comes only from the validated URL host.
    #[cfg(target_os = "macos")]
    if is_epic_login || is_gog_login {
        let store = if is_epic_login { "epic" } else { "gog" };
        return open_pristine_login_sheet(app, &label, url, visible, user_agent, store);
    }
    // Shared last-known main-frame origin (Phase 34.5 Plan 27): seeded from the
    // validated open URL so it is never empty, updated only from `on_page_load`
    // (main-frame only, per this arm's own doc comment above), and read by
    // `on_document_title_changed` so a title change is always composed against
    // the CURRENT host, not the one the window opened on.
    let current_origin = Arc::new(Mutex::new(origin.clone()));
    // CR-01 fix (gap cycle following 34.4.2-LIVE-GATE-RERUN.md's FAIL 0/6): on macOS
    // this window is the sheet CANDIDATE `present_login_window_as_sheet` attempts to
    // attach further down this arm, after `.build()`. `beginSheet:completionHandler:`
    // expects to be the thing that orders the sheet window in and makes it key --
    // building it `.visible(true)`/`.focused(true)` here races that call (tao/wry
    // orders the window in and takes key status synchronously during `.build()`,
    // strictly BEFORE `beginSheet:` ever runs), so AppKit silently does not attach it
    // and the window is left as an ordinary titled window (F-34.4.2-03). So on macOS
    // the sheet candidate is ALWAYS built `.visible(false)` regardless of this arm's
    // own `visible` argument -- presentation happens exclusively through
    // `present_login_window_as_sheet`'s `beginSheet:` call below, with an explicit
    // visible-fallback (see the `sheet_presented` block further down this arm) so a
    // failed attach never leaves the user looking at nothing. Windows/Linux have no
    // sheet concept; they own the window by `main` and hold main modal instead
    // (`owned_modal.rs`, quick-261111-d7o), falling back to today's free-floating
    // window when no usable main exists.
    #[cfg(target_os = "macos")]
    let initial_visible = false;
    #[cfg(not(target_os = "macos"))]
    let initial_visible = visible;
    #[cfg(not(target_os = "macos"))]
    let mut login_owner: Option<tauri::WebviewWindow> = None;
    let mut builder =
        tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::External(url))
            .user_agent(user_agent)
            .visible(initial_visible);
    if visible {
        let title_origin = Arc::clone(&current_origin);
        // D-29-05 (Phase 34.4.1 gap cycle 3, plan 33): a PROVISIONAL title, so the
        // window never presents as the framework default "Tauri app". Root cause was
        // established from ordering evidence: `presentation requested` precedes the
        // first `title change applied len=22` in the same scrollback, and the interval
        // between them is a titleless window showing the application default.
        //
        // WR-07 IS NOT RE-OPENED, and the distinction is the whole point. WR-07
        // prohibits a hard-coded APPLICATION title -- "the loaded document's own title
        // must show, never a hard-coded 'GameLib'". It does not prohibit an
        // ORIGIN-DERIVED one. `origin` here is `url.origin().ascii_serialization()`
        // (line ~3718), the trustworthy value WR-07 wants shown first, NEVER page
        // content; `login_window_title(&origin, None)` is the same composer the OTHER
        // arms in this file already build with. A static string here -- "GameLib",
        // "Signing in..." -- would be the prohibited thing.
        //
        // This is deliberately the WEAKER of the two guarantees: it establishes only
        // that the bar is never the framework default. The document title still
        // arrives via `on_document_title_changed` below and is APPENDED after this
        // origin -- `origin — document title` (`login_window_title`, main.rs:2083,
        // T-34.5-G6-23) -- never a replacement of it, which is WR-07's actual
        // requirement. That composed title now SURVIVES `PageLoadEvent::Finished`: the
        // `on_page_load` `set_title` refresh below is guarded `Started`-only (quick
        // 260927-o3h); before that guard, the `Finished` pass overwrote it with the
        // bare origin again. The recorded asymmetry stands and is why this comment
        // exists: a grep gate proving `.title(` is never hard-coded can only establish
        // the ABSENCE of the prohibited value -- it structurally cannot establish the
        // PRESENCE of the required one. Only the live gate can.
        //
        // Scoped to `if visible` on purpose: the same arm builds the hidden
        // reveal/clear windows, which have no title bar for a title to matter on
        // (T-34.4.1-82).
        builder = builder.title(login_window_title(&origin, None));
        // Quick task 261003-nsk (D-3) narrowed this from 900 to 572; the operator
        // narrowed it again to 464x592 on 2026-10-03. Measured both times, never a
        // taste call -- `CGWindowListCopyWindowInfo([.optionOnScreenOnly])` against
        // the live `gamelib-shell` pid returned exactly one on-screen login window:
        // w=572 h=700 for the nsk reading, w=464 h=592 for this one (stable across
        // two samples 2s apart).
        //
        // Reading CGWindowList OUTER bounds back into `.inner_size` is sound here
        // and is calibrated, not assumed: the nsk default of 572x700 measured as
        // exactly 572x700, so this window carries no chrome between the two (it is
        // presented as a sheet, which renders no title bar at all -- F-34.5-G6-16).
        //
        // Shared by EVERY runner this arm opens a visible window for (GOG, Amazon,
        // Humble) -- `humble_login_open` takes no `runner` argument by design,
        // so there is no per-runner size and this value moves all of them together.
        // `open_pristine_epic_login_window`'s own `.inner_size(900.0, 700.0)` is a
        // DIFFERENT form layout and stays 900 (D-3) -- see that function's own call
        // site, untouched.
        // quick-261029-osq: stays 592. The old injected bar overlaid the page's top
        // 32px, so the visible page area was already 464x560; the native 32pt bar plus a
        // 560pt webview shows the same area, so the operator-approved size is unchanged.
        builder = builder.inner_size(464.0, 592.0);
        // CR-01 fix (continued): `.center()`/`.focused(true)` are AppKit-owned
        // concerns once this window becomes a sheet -- `beginSheet:` positions the
        // sheet under the parent's title bar and gives it key status itself, so
        // pre-setting them here on macOS would be immediately overridden (harmless)
        // when attachment succeeds, but WOULD be exactly the race described above
        // when it does not run first. The visible-fallback path (below) calls
        // `.center()`/`.set_focus()` itself if attachment is not confirmed, so macOS
        // loses nothing on the failure path either. Windows/Linux first try to make
        // `main` the window's owner (`attach_login_owner`, built hidden and shown owned,
        // centered over main, after `.build()`); with no usable main they keep the
        // original, unconditional immediate center+focus.
        #[cfg(not(target_os = "macos"))]
        {
            let (owned_builder, owner) = attach_login_owner(app, builder);
            builder = owned_builder;
            match owner {
                Some(main_window) => login_owner = Some(main_window),
                None => builder = builder.center().focused(true),
            }
        }
        builder = builder
            .theme(Some(tauri::Theme::Light))
            .on_document_title_changed(move |window, title| {
                // Never .unwrap() on a live user-facing path (T-34.4.1-108): a
                // stale title bar is a cosmetic defect, a panic here would kill
                // the login flow outright. Never logs the title string itself
                // (T-34.4.1-106, remote page content must never reach an
                // uploadable log) -- only the fact that a change was applied
                // and its LENGTH, the only machine evidence able to
                // distinguish "the hook never fired" from "the hook fired and
                // the OS ignored it" if plan 29's operator still sees the
                // framework default title. `origin_now` is read from the
                // shared `current_origin` (Phase 34.5 Plan 27) rather than
                // recomputed here, so this composed title always reflects the
                // most recent MAIN-FRAME origin, never this callback's own
                // page-content input.
                // D-29-04 (Phase 34.4.1 gap cycle 3, plan 33): an EMPTY document
                // title is now a no-op, not an applied change. WebKit reports a
                // transient empty title mid-navigation -- the live gate saw the
                // sequence 22 -> 0 -> 42 -- and applying it dropped the document
                // title from the bar and back again, because
                // `login_window_title(origin, Some(""))` falls through its
                // `!title.is_empty()` guard to the bare origin. The composer was
                // already correct; the defect was that this callback CALLED it
                // with a value it should have discarded.
                //
                // Explicitly NOT the cause of the `Tauri app` flash (D-29-05),
                // which is fixed separately below. That was proposed and REFUTED
                // by ordering: the flash is one-way and completes before the
                // FIRST title application (len=22), whereas len=0 fires only
                // after the bar already reads the document's own title. Filed on
                // its own merits as a latent smell, and fixed as one.
                //
                // The skip is still logged. "The hook fired and we ignored it"
                // and "the hook never fired" are different diagnoses, and the
                // length is the only machine evidence separating them -- the same
                // reason the applied branch logs a length and never the string
                // (T-34.4.1-106: remote page content must never reach an
                // uploadable log).
                if title.is_empty() {
                    shell_eprintln!(
                        "[shell] humble_login_open: title change SKIPPED len=0 (empty document title; previous title retained)"
                    );
                    return;
                }
                let origin_now = title_origin
                    .lock()
                    .map(|guard| guard.clone())
                    .unwrap_or_default();
                let composed = login_window_title(&origin_now, Some(&title));
                let _ = window.set_title(&composed);
                shell_eprintln!(
                    "[shell] humble_login_open: title change applied len={}",
                    title.len()
                );
            });
        // quick-261029-osq: the in-page cancel strip, origin banner and scrollbar inset
        // that used to be injected here are gone. On macOS the sheet's chrome (32pt dark
        // bar, origin label, native x) is a native AppKit bar installed after `.build()`
        // by `install_native_login_bar`, with the webview inset below it. Esc still
        // routes through `request_login_sheet_cancel`.
        //
        // Login-chrome CSS injection (quick task 260822-di1, D-2). Deliberately NOT
        // `#[cfg(target_os = "macos")]`: this substitutes for nothing platform-specific --
        // Humble's marketing footer is visual noise on Windows and Linux too, so it runs
        // unconditionally inside this `if visible` block on every platform.
        builder = builder.initialization_script(&login_chrome_css_script());
        shell_eprintln!(
            "[shell] humble_login_open: login chrome CSS injected for '{label}'"
        );
        // F-4 machine record (Phase 34.4.1 Plan 24): `.focused(true)` above is
        // a ONE-SHOT raise-on-creation with no persistent state to inspect
        // afterwards, so without this line there is no record of what
        // presentation the operator was actually looking at -- F-4's raised
        // half has now gone UNOBSERVED across two live gates
        // (34.4.1-LIVE-GATE-RERUN.md Item 3). This line records only that
        // sizing/centring/one-shot-focus were REQUESTED and that a persistent
        // pin was deliberately NOT requested (research confirms the platform
        // offers only one or the other, never both, and a persistent pin would
        // trap the operator behind this window when they switch to a password
        // manager -- exactly the switch F-4's observation asks them to
        // perform). It does NOT prove the window actually raised; that
        // observation belongs to plan 29 item 1 alone. `light_theme_requested`
        // records only that Plan 27's `.theme(Some(tauri::Theme::Light))` call
        // above was REQUESTED, mirroring this line's existing discipline --
        // whether the field actually rendered legibly is plan 34.5-28's live
        // check alone. MOVED to after `.build()` by Phase 34.4.2 Plan 02 (still
        // gated on this same `if visible` intent) so it can also record
        // `sheet_presented` -- see the print call after `window` exists, below.
    }
    // Dev-only diagnostic instrumentation (epic-login-non-interactive
    // investigation, 2026-08-02): injects `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`
    // (defined above, near `LOGIN_WINDOW_EVENTS_CAP`) as a Tauri
    // `initialization_script()` on this window BEFORE `.build()` runs --
    // initialization scripts execute before any page script, so this captures
    // Epic's own bootstrap failure instead of only what survives to a later
    // console read. Gated identically to this arm's `open_devtools()` call
    // below -- `#[cfg(debug_assertions)]` AND `if visible` -- so it can never
    // reach a packaged build.
    //
    // THIRD GATE ADDED 2026-08-02, and it DEFAULTS OFF: `GAMELIB_LOGIN_DIAG=1`.
    // This script is an `initialization_script`, so it runs BEFORE Epic's own
    // bundle and replaces `XMLHttpRequest.prototype.open/send` and
    // `window.fetch`. Epic's anti-bot service (Talon) fingerprints the page
    // environment and ships a 6-15 KB attestation payload; patched network
    // primitives on the prototype chain are a canonical automation signal.
    // `/id/api/email/exists` returns a deterministic HTTP 403 whose on-screen
    // copy is the stock anti-bot challenge ("enable javascript and cookies to
    // continue"), and EVERY 403 observation in
    // `.planning/debug/epic-login-non-interactive.md` postdates the commit that
    // added this script (`bf5394a20`) -- before it, symptoms were blank pages
    // and timeouts, never a 403. So the instrumentation is a live suspect for
    // CAUSING the defect it was added to observe, and it must be switchable
    // WITHOUT a rebuild so both arms can be compared in one sitting.
    // Off by default is the safer direction: a diagnostic that perturbs its own
    // measurement should be opt-in, not something a routine dev run inherits.
    #[cfg(debug_assertions)]
    if visible && std::env::var("GAMELIB_LOGIN_DIAG").as_deref() == Ok("1") {
        builder = builder.initialization_script(DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT);
        shell_eprintln!(
            "[shell] humble_login_open: GAMELIB-DIAG init script INJECTED for '{label}' (GAMELIB_LOGIN_DIAG=1)"
        );
    }
    let page_load_origin = Arc::clone(&current_origin);
    // Owned clones for the macOS native-bar origin refresh inside `on_page_load`
    // (quick-261029-osq): `update_native_login_bar_origin` needs an `AppHandle` and the
    // window label, and `on_page_load` takes a `move` closure.
    #[cfg(target_os = "macos")]
    let app_for_origin = app.clone();
    #[cfg(target_os = "macos")]
    let label_for_origin = label.clone();
    let window = builder
        .on_page_load(move |window, payload| {
            let (kind, is_started) = match payload.event() {
                tauri::webview::PageLoadEvent::Started => ("started", true),
                tauri::webview::PageLoadEvent::Finished => ("finished", false),
            };
            let event = login_event_value(kind, payload.url().as_str());
            push_login_window_event(&event_label, event);
            // Main-frame-only origin refresh (Phase 34.5 Plan 27): this hook is
            // ALREADY the arm's trusted main-frame-only signal (see the
            // ANTI-PHISHING ORIGIN comment above) -- never `on_navigation`,
            // which spike 013 measured as 5-of-8 third-party-iframe noise. Gated
            // on `visible` because this same closure also fires for the hidden
            // reveal/clear windows this arm builds, which have no title bar for
            // a title to matter on.
            if visible {
                let new_origin = payload.url().origin().ascii_serialization();
                if let Ok(mut guard) = page_load_origin.lock() {
                    *guard = new_origin.clone();
                }
                // `Started`-only guard (quick 260927-o3h; D-01, D-02, D-05). Before
                // this guard, the `Finished` pass through this closure called
                // `set_title(&login_window_title(&new_origin, None))` again with
                // `None` for the document title, overwriting the composed `origin —
                // document title` that `on_document_title_changed` had already set --
                // Windows and Linux showed the bare origin forever. Filed and accepted
                // as a deviation during the Phase 38 Windows sitting (`38-W03`) before
                // being fixed here by quick task 260927-o3h.
                //
                // The guard sits on this ONE line, not on the enclosing `if visible {`
                // block: the `page_load_origin` write above and the macOS
                // `update_native_login_bar_origin` call below both still need to
                // run on `Finished`, to keep the trusted main-frame origin and the
                // native bar's origin label current.
                if is_started {
                    let _ = window.set_title(&login_window_title(&new_origin, None));
                }
                // Native bar label re-text on main-frame origin change (quick-261029-osq;
                // supersedes the Phase 34.5 Plan 52 in-page banner eval). KEPT alongside,
                // never replacing, the `set_title` call above -- Windows/Linux still render
                // the OS title; the native bar is macOS's substitute for it. `new_origin`
                // is the shell-validated main-frame URL's origin, never page content
                // (T-osq-01). Never `.unwrap()` on a live user-facing path (T-34.4.1-108):
                // a stale label is cosmetic. Logs the LENGTH only, never the origin string
                // (T-34.4.1-106).
                #[cfg(target_os = "macos")]
                {
                    update_native_login_bar_origin(
                        &app_for_origin,
                        &label_for_origin,
                        &new_origin,
                    );
                    shell_eprintln!(
                        "[shell] humble_login_open: origin banner updated len={}",
                        new_origin.len()
                    );
                }
            }
        })
        .build()
        .map_err(|e| format!("humble_login_open:build-failed:{e}"))?;
    // AppKit SHEET presentation (Phase 34.4.2 Plan 07, REQ-34.4.2-01/02) -- macOS
    // only. Supersedes Plan 02's child-window attachment per the operator's binding
    // design decision of 2026-08-04 (`34.4.2-LIVE-GATE.md`'s "Binding Design
    // Decision" section): the child-window mechanism went live-CONFIRMED broken
    // (F-34.4.2-01/-02). Presents a VISIBLE login window as a sheet on `main`
    // immediately once it exists. Hidden reveal/clear windows this arm also builds
    // are never presented. The pristine Epic and GOG login windows are presented by
    // `open_pristine_login_sheet`, which returns before this point (quick-261029-utr
    // lifted the REQ-34.4.2-10 Epic descope). On Windows/Linux
    // the login window is owned by main and holds it modal instead
    // (`present_owned_login_window`, `owned_modal.rs`, quick-261111-d7o); with no usable
    // main it stays the free-floating window it always was.
    // quick-261029-osq: install the native bar (and inset the webview below it) BEFORE the
    // sheet is presented, and confirm it over mpsc. A sheet whose bar is unconfirmed would
    // have no visible exit (T-34.4.2-15 / T-osq-02), so it is never presented -- the
    // free-standing visible fallback below (with the OS close button) runs instead.
    // `Ok` from `with_webview` does not prove the closure ran (see
    // `humble_login_clear_cookies`' macOS branch), hence the mpsc round-trip.
    #[cfg(target_os = "macos")]
    let native_bar_installed = if visible {
        let (bar_tx, bar_rx) = mpsc_channel::<bool>();
        let bar_app = app.clone();
        let bar_label = label.clone();
        let bar_origin = origin.clone();
        match window.with_webview(move |pw| {
            let ok = (|| -> bool {
                let Some(mtm) = objc2::MainThreadMarker::new() else {
                    return false;
                };
                // SAFETY: `pw.inner()` is a live `WKWebView*` for the duration of a
                // `with_webview` closure running on the main thread (mtm proves it).
                let wk: &objc2_app_kit::NSView = unsafe { &*pw.inner().cast() };
                let Some(container) = (unsafe { wk.superview() }) else {
                    return false;
                };
                install_native_login_bar(
                    &container,
                    wk,
                    &bar_origin,
                    bar_app,
                    bar_label,
                    mtm,
                );
                true
            })();
            let _ = bar_tx.send(ok);
        }) {
            Ok(()) => bar_rx
                .recv_timeout(LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT)
                .unwrap_or(false),
            Err(_) => false,
        }
    } else {
        false
    };
    #[cfg(target_os = "macos")]
    if visible && !native_bar_installed {
        shell_eprintln!(
            "[shell] WARN: humble_login_open: '{label}' native login bar unconfirmed -- not presenting as a sheet (no visible exit)"
        );
    }
    #[cfg(target_os = "macos")]
    let sheet_presented = if visible && native_bar_installed {
        // F-34.4.2-04 fix (checkpoint response, 2026-08-04, post commit 751521663):
        // the first live hardware run of the CR-01/CR-02 fix reported a symptom
        // CHANGE -- no window at all (not even the pre-fix free-standing one) plus a
        // spinner that never cleared, i.e. worse than F-34.4.2-03, not better. That
        // shape is exactly what a stall ANYWHERE inside `present_login_window_as_sheet`
        // (including tauri's own unbounded internal `.ns_window()` getters --
        // `LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT`'s own doc comment, above) would look
        // like: if the call never returns, this arm's fallback below (which exists
        // SPECIFICALLY to guarantee visibility) never runs either, because it is
        // gated on `sheet_presented`, which would never get assigned.
        //
        // Racing the WHOLE attempt on its own thread against an independent, bounded
        // watchdog decouples "the fallback is guaranteed to run" from "whatever
        // `present_login_window_as_sheet` is doing eventually finishes" -- the
        // reasoning_checkpoint's own explicit constraint ("never block the main thread
        // waiting on a closure queued to the main thread") is satisfied doubly here:
        // this wait happens on a worker thread exactly like the pre-existing recv
        // calls in this file already do, and it can no longer be starved by a stall
        // this file does not control.
        let (watchdog_tx, watchdog_rx) = mpsc_channel::<bool>();
        let app_for_sheet = app.clone();
        let label_for_sheet = label.clone();
        thread::spawn(move || {
            let attached = present_login_window_as_sheet(&app_for_sheet, &label_for_sheet);
            let _ = watchdog_tx.send(attached);
        });
        match watchdog_rx.recv_timeout(LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT) {
            Ok(attached) => attached,
            Err(_) => {
                shell_eprintln!(
                    "[shell] WARN: humble_login_open: '{label}' sheet-attach watchdog exceeded {LOGIN_SHEET_PRESENT_WATCHDOG_TIMEOUT:?} -- present_login_window_as_sheet has not returned (see that function's own diagnostics for where it last logged); treating as unconfirmed and falling back now rather than waiting further"
                );
                false
            }
        }
    } else {
        false
    };
    #[cfg(not(target_os = "macos"))]
    let sheet_presented = false;
    #[cfg(not(target_os = "macos"))]
    if let Some(owner) = login_owner.as_ref() {
        present_owned_login_window(app, &window, owner, &label);
    }
    // T-34.4.2-39 resolution path 1 of 3 (Phase 34.4.2 Plan 14): sheet presentation
    // CONFIRMED -- clear the pending-login latch now that this request has resolved to
    // an on-screen sheet, membership in `PRESENTED_LOGIN_SHEETS` (set inside
    // `present_login_window_as_sheet`'s own `register_presented_login_sheet` call)
    // taking over as this label's "in progress" signal from here on.
    #[cfg(target_os = "macos")]
    if sheet_presented {
        clear_pending_visible_login_window(&label);
    }
    // CR-01 visible-fallback (gap cycle following 34.4.2-LIVE-GATE-RERUN.md's FAIL
    // 0/6): this window was built `.visible(false)` on macOS specifically so
    // `beginSheet:` could be the one to reveal it as a sheet (see the builder-setup
    // block above). If `present_login_window_as_sheet` did not confirm attachment
    // (CR-02's read-back), the window is otherwise ordered nowhere, offscreen, and
    // non-key -- the user would see nothing at all, strictly worse than the
    // free-standing-window symptom this fix was written for. `window.show()` +
    // `window.set_focus()` (post-`.build()` `WebviewWindow` methods, not the builder's
    // own `.center()`/`.inner_size()`/`.focused(true)`/`on_document_title_changed`
    // presentation calls Test 559 scopes to the `if visible {` block above -- this is
    // deliberately a DIFFERENT, later code path, not a second copy of those) restore
    // visibility and key status; none of these calls are fatal to the login flow
    // (T-34.1-22 discipline), so failures here are logged, not propagated. Position is
    // whatever AppKit's default placement is for a window shown without `.center()`
    // having run -- acceptable: an off-center but genuinely visible/focused window is
    // still strictly better than the invisible one this fallback exists to prevent.
    #[cfg(target_os = "macos")]
    if visible && !sheet_presented {
        shell_eprintln!(
            "[shell] WARN: humble_login_open: '{label}' sheet attachment unconfirmed -- falling back to a free-standing visible window"
        );
        let _ = window.show();
        let _ = window.set_focus();
        // T-34.4.2-39 resolution path 2 of 3 (Phase 34.4.2 Plan 14): the visible
        // fallback also resolves this request -- the window is genuinely on screen
        // (just not as a sheet), so the latch must clear here too, not only on the
        // sheet-confirmed path above.
        clear_pending_visible_login_window(&label);
    }
    if visible {
        // F-4 machine record (Phase 34.4.1 Plan 24) -- see this arm's
        // builder-setup block above for the full "why record this at all"
        // rationale. `sheet_presented` (Phase 34.4.2 Plan 07's sheet-presentation
        // switch, superseding Plan 02's differently-named field) is recorded here;
        // this print still runs AFTER `.build()`/presentation so it can be included.
        shell_eprintln!(
            "[shell] humble_login_open: presentation requested visible=true width=900 height=700 center=true focus_once=true persistent_pin=false light_theme_requested=true sheet_presented={sheet_presented}"
        );
    }
    // Close detection: see `install_login_window_close_hook`.
    install_login_window_close_hook(app, &window, label.clone());
    // Seed the title from the validated open URL's origin (Phase 34.5 Plan 27) so
    // it is visible from the moment the window appears, rather than only after the
    // first `on_page_load`/`on_document_title_changed` event.
    if visible {
        let _ = window.set_title(&login_window_title(&origin, None));
    }
    // Dev-only diagnostic (epic-login-non-interactive investigation, 2026-08-01,
    // F-34.5-G6-01): `open_devtools()` is already forced for the "main" webview
    // above (the main-window devtools block in `main()`'s `.setup()`, guarded by the
    // same #[cfg(debug_assertions)]), but
    // THIS arm builds the login window (`loginwin-N-*`) that all five runners share
    // -- and it has never had devtools wired up. That gap left the login page's own
    // JS console unread across four debug cycles despite it being the one webview
    // that renders third-party OAuth pages (Epic, GOG, Amazon, Humble). Gated on
    // `visible` to match every other presentation-only call in this arm (the hidden
    // reveal/clear windows built elsewhere in this file are unaffected) and on
    // `#[cfg(debug_assertions)]` so it can never reach a packaged build. Skipped on
    // Linux through `should_auto_open_devtools`: gated on mechanism (the docked-inspector
    // attach races page boot there), not measured on this window, and applied because
    // the race is not specific to our page.
    #[cfg(debug_assertions)]
    if visible && should_auto_open_devtools(std::env::consts::OS) {
        window.open_devtools();
        shell_eprintln!(
            "[shell] humble_login_open: devtools opened for '{label}' (debug build)"
        );
    } else if visible {
        shell_eprintln!(
            "[shell] humble_login_open: devtools NOT auto-opened for '{label}' on linux (debug build) -- the inspector attach races page boot; right-click > Inspect Element opens it"
        );
    }
    Ok(Value::String(label))
}

// A step of `rpc_humble_login_open`: relays the built window's destruction as a `closed` event.
fn install_login_window_close_hook(
    #[cfg_attr(not(target_os = "macos"), allow(unused_variables))] app: &AppHandle,
    window: &tauri::WebviewWindow,
    label: String,
) {
    // Quick task 260803-eee Task 5: close-detection, added AFTER `.build()` because
    // `on_window_event` is a method on the built `WebviewWindow` handle
    // (`tauri-2.11.5/src/webview/webview_window.rs:1524`), not on the builder --
    // confirmed by direct read of the vendored crate source, mirroring this arm's own
    // established discipline of checking the crate before adding a hook (see the WR-07
    // CORRECTION comment above).
    //
    // THE BUG THIS FIXES: closing this window (any way -- clicking its close button,
    // Cmd+W, the OS window-close gesture) produced NO signal at all on the JS side.
    // `oauthLoginCapture.ts`'s `captureOAuthLogin` kept polling forever until its
    // five-minute deadline, so cancelling a GOG/Epic/Amazon sign-in never resolved
    // `{ status: 'cancelled' }` -- the frontend hook stayed on `awaiting` and the
    // cancel-path navigation fix (Task 4, `onCancelled`/`handleTauriOAuthCancelled`)
    // could never fire, because the outcome it depends on never arrived.
    //
    // `WindowEvent::Destroyed`, not `CloseRequested`: `CloseRequested` fires BEFORE the
    // window is actually gone and exists so a handler can call `api.prevent_close()` --
    // this arm never wants to prevent closing, only observe that it happened, and
    // `Destroyed` is the point that is actually true. Pushed onto the SAME
    // `LOGIN_WINDOW_EVENTS` queue via the SAME `push_login_window_event` helper the
    // `on_page_load` hook above already uses -- one relay mechanism, not two. Fires for
    // ANY window this arm builds (hidden reveal/clear windows included, not gated on
    // `visible`) -- harmless for those, since nothing calls `takeEvents()` on a
    // reveal/clear window's label. F-34.4.2-19 fix: `humble/user.ts`'s own
    // `takeEvents()` consumer (`watchForLogin()`) now settles `{ status: 'error' }`
    // immediately on a `'closed'` entry, rather than discovering the window's absence
    // one poll tick later via a `no-window` cookie-read error (see `loginWindowSeam.ts`'s
    // `LoginWindowNavEvent` doc comment for the full cross-consumer safety argument). No
    // url to relay -- `""`, never a partial/stale navigation url that could be mistaken
    // for one.
    //
    // NOT a race with this arm's own `humble_login_close` (a few match arms below):
    // every caller that closes a window programmatically (`captureOAuthLogin`'s
    // `settle()`, `humble_login_close` itself) does so only AFTER it has already decided
    // the real outcome and stopped consuming events for that label -- so a `'closed'`
    // event produced by that SAME programmatic close is written to a queue nothing reads
    // again, never observed as a spurious cancel.
    let close_event_label = label.clone();
    #[cfg(target_os = "macos")]
    let app_for_dismiss = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            push_login_window_event(&close_event_label, login_event_value("closed", ""));
            // Mirror of the presentation call above (Phase 34.4.2 Plan 07,
            // REQ-34.4.2-01/02): unconditional (not gated on `visible`) because a
            // hidden reveal/clear window was never presented in the first place, so
            // dismissing it is a guaranteed no-op given the membership gate -- see
            // `dismiss_login_window_sheet`'s own doc comment.
            #[cfg(target_os = "macos")]
            dismiss_login_window_sheet(&app_for_dismiss, &close_event_label);
            #[cfg(target_os = "macos")]
            forget_native_login_bar(&app_for_dismiss, &close_event_label);
            // T-34.4.2-39 resolution path 3 of 3 (Phase 34.4.2 Plan 14): a destroyed
            // window resolves this request too, whichever way it got there (sheet
            // dismissed via the cancel strip/Esc, closed while still an unattached
            // free-standing fallback window, or closed programmatically before either
            // ran). Unconditional like `dismiss_login_window_sheet` above -- a hidden
            // reveal/clear window never armed the latch in the first place, so clearing
            // it here is a guaranteed no-op for those (label-matched, see this
            // function's own doc comment).
            #[cfg(target_os = "macos")]
            clear_pending_visible_login_window(&close_event_label);
        }
    });
}

// Drain (not merely read) `label`'s queued navigation events (Phase 34.4.1 Plan
// 01, REQ-34.4.1-03's navigation relay contract). An absent/never-navigated label
// resolves an empty array -- a healthy state, not an error.
pub(crate) fn rpc_humble_login_take_events(args: &[Value]) -> Result<Value, String> {
    let a = HumbleLoginTakeEventsArgs::from_args(args)?;
    let label = a.label.as_str();
    let mut guard = LOGIN_WINDOW_EVENTS
        .lock()
        .map_err(|_| "humble_login_take_events:lock-poisoned".to_string())?;
    let events = guard
        .as_mut()
        .and_then(|map| map.remove(label))
        .unwrap_or_default();
    Ok(Value::Array(events))
}

// Close the login window (Phase 34.4.1 Plan 01, D-01). A missing label is a
// healthy "already closed" state, not an error -- resolves `Bool(false)` rather
// than erroring, the same D-08 "no window is not a phase failure" shape as
// `tray_set_icon`'s missing-tray branch above.
pub(crate) fn rpc_humble_login_close(args: &[Value], app: &AppHandle) -> Result<Value, String> {
    let a = HumbleLoginCloseArgs::from_args(args)?;
    let label = a.label.as_str();
    // The pristine Epic login window (`open_pristine_epic_login_window`) is a PLAIN
    // `tauri::Window` with a raw `WKWebView` attached, never a Tauri-managed
    // `WebviewWindow` -- so `get_webview_window(label)` can never find it, for ANY
    // label. This arm used to fall straight through to `Ok(false)`, which the
    // TypeScript side treats as a NON-FATAL close failure (`oauthLoginCapture`'s
    // `settle()` swallows it deliberately, so a close failure cannot fail a login that
    // already succeeded). Net effect: after a fully SUCCESSFUL Epic login the window
    // just stayed on screen, with nothing logged anywhere. Third instance of this exact
    // structural bug -- `humble_login_clear_cookies` (cookies surviving logout) and this
    // one both came from resolving a pristine window through a webview-only lookup.
    // `get_window` finds both kinds, so every other runner's behaviour is unchanged and
    // the pristine window now closes through the same path.
    let closed = match app.get_webview_window(label) {
        Some(window) => {
            window.close().map_err(|e| e.to_string())?;
            true
        }
        // `get_window` requires the `unstable` Tauri feature, which D-03
        // (`src-tauri/Cargo.toml`) deliberately scopes to
        // `[target.'cfg(target_os = "macos")'.dependencies]` only -- so this fallback
        // must itself be target-gated, matching the convention already used by every
        // other `unstable`-gated call in this file (e.g. `dispatch_rust_channel`'s
        // "store_embed_open" arm above). The window this fallback exists to find
        // (`open_pristine_epic_login_window`'s raw-WKWebView `Window`, never a managed
        // `WebviewWindow`) is itself `#[cfg(target_os = "macos")]`-gated and can never
        // exist on Linux/Windows, so resolving `false` there changes no real behavior --
        // it is the same "missing label is a healthy already-closed state" contract this
        // arm documents above.
        None => {
            #[cfg(target_os = "macos")]
            {
                match app.get_window(label) {
                    Some(window) => {
                        window.close().map_err(|e| e.to_string())?;
                        true
                    }
                    None => false,
                }
            }
            #[cfg(not(target_os = "macos"))]
            {
                false
            }
        }
    };
    if closed {
        if let Ok(mut guard) = LOGIN_WINDOW_EVENTS.lock() {
            if let Some(map) = guard.as_mut() {
                map.remove(label);
            }
        }
    }
    Ok(Value::Bool(closed))
}
