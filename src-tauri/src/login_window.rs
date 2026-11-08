use super::*;

mod invite_picker;
pub(crate) use invite_picker::*;
mod humble_cookies;
pub(crate) use humble_cookies::*;
mod humble_open;
pub(crate) use humble_open::*;

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

/// Label of the dedicated Tauri window that hosts the Steam bridge invite picker (quick
/// 261101-llf). Never `main` or `about`, and never carries the `external-` prefix, so it matches
/// exactly one capability: `capabilities/bridge-invite-picker.json`.
pub(crate) const BRIDGE_INVITE_WINDOW_LABEL: &str = "bridge-invite";

/// Build the app-relative URL (query included) the invite picker window loads. Pure, so the
/// injection surface is unit-tested without an `AppHandle`. Both ids end up in a URL, so they are
/// re-validated here even though the sidecar already produced them: `app_id` must be 1-10 ASCII
/// digits and `ack_id` must be 1-64 characters of `[0-9A-Za-z-]`. `& # % /` and spaces are all
/// rejected. The frontend parser (`src/common/bridgeInvitePicker.ts`) validates the same shape.
pub(crate) fn bridge_invite_picker_path(app_id: &str, ack_id: &str) -> Result<String, String> {
    if app_id.is_empty() || app_id.len() > 10 || !app_id.bytes().all(|b| b.is_ascii_digit()) {
        return Err("bridge_invite_picker_open:bad-app-id".to_string());
    }
    if ack_id.is_empty()
        || ack_id.len() > 64
        || !ack_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return Err("bridge_invite_picker_open:bad-ack-id".to_string());
    }
    Ok(format!(
        "index.html?window={BRIDGE_INVITE_WINDOW_LABEL}&appId={app_id}&ackId={ack_id}"
    ))
}

/// Navigation allow-list for the invite picker window: GameLib's own bundle origin only
/// (`tauri://localhost`, `http(s)://tauri.localhost`) or the configured dev server's origin.
/// Anything else (remote pages, `file:`, `about:`) is refused, so remote content can never load
/// into a window that holds a capability.
pub(crate) fn bridge_invite_nav_allowed(url: &tauri::Url, dev_url: Option<&tauri::Url>) -> bool {
    let bundle = match (url.scheme(), url.host_str()) {
        ("tauri", Some("localhost")) => true,
        ("http" | "https", Some("tauri.localhost")) => true,
        _ => false,
    };
    bundle || dev_url.is_some_and(|dev| url.origin() == dev.origin())
}

/// macOS focus bookkeeping for the invite picker: remember which app was frontmost (the game) so
/// closing the picker hands focus back to it instead of promoting the GameLib main window.
#[cfg(target_os = "macos")]
pub(crate) mod macos_invite_focus {
    use objc2::rc::Retained;
    use objc2::runtime::{AnyObject, Bool};
    use objc2::{class, msg_send};
    use std::sync::Mutex;

    #[derive(Clone, Copy)]
    pub struct PickerRestore {
        pub prev_pid: i32,
        pub app_was_hidden: bool,
        pub main_hidden_by_picker: bool,
    }

    pub static RESTORE: Mutex<Option<PickerRestore>> = Mutex::new(None);

    pub fn lock() -> std::sync::MutexGuard<'static, Option<PickerRestore>> {
        RESTORE.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Pid of the frontmost application and whether GameLib is Cmd+H-hidden. Main thread only.
    pub fn snapshot() -> (Option<i32>, bool) {
        let ws: Retained<AnyObject> = unsafe { msg_send![class!(NSWorkspace), sharedWorkspace] };
        let front: Option<Retained<AnyObject>> = unsafe { msg_send![&*ws, frontmostApplication] };
        let pid = front.map(|f| {
            let pid: i32 = unsafe { msg_send![&*f, processIdentifier] };
            pid
        });
        let ns_app: Retained<AnyObject> =
            unsafe { msg_send![class!(NSApplication), sharedApplication] };
        let hidden: Bool = unsafe { msg_send![&*ns_app, isHidden] };
        (pid, hidden.as_bool())
    }

    /// Re-activate the application with `pid`. Main thread only.
    pub fn activate(pid: i32) {
        let running: Option<Retained<AnyObject>> = unsafe {
            msg_send![class!(NSRunningApplication), runningApplicationWithProcessIdentifier: pid]
        };
        if let Some(r) = running {
            // NSApplicationActivateIgnoringOtherApps (2): deprecated on macOS 14+ but still
            // honoured, and the only way to force the hand-back when the picker is key.
            let _: Bool = unsafe { msg_send![&*r, activateWithOptions: 2usize] };
        }
    }
}

/// Whether a DEBUG build should force the webview devtools open at startup on `target_os`
/// (a `std::env::consts::OS` value; taken as a `&str` so every OS arm is unit-testable on any
/// host). False only for `"linux"`.
///
/// WHY Linux is excluded: auto-opening the docked Web Inspector from `.setup()` races the page's
/// entry module (`src/frontend/index.tsx`). On WebKitGTK 2.50.4 the page's WebKitWebProcess
/// aborts -- SIGABRT, a JavaScriptCore internal assertion reached from JIT code -- which leaves
/// a white window with only the inspector's own process alive. Launches with the DMABUF renderer
/// enabled hit it 6/6; `WEBKIT_DISABLE_DMABUF_RENDERER=1` only moves the attach instant and
/// still crashed 2 of 8 with a 100-150 ms delay. See
/// `.planning/debug/resolved/linux-dev-app-blank-without-dmabuf-workaround.md`.
///
/// WHY macOS keeps it: the dev webview exposes no right-click inspect there (the original
/// reason for the auto-open). Windows keeps its current behaviour: out of scope, not measured.
///
/// On Linux the inspector stays reachable by hand: WebKitGTK offers "Inspect Element" in the
/// page context menu when developer extras are on, and wry enables them in debug builds.
///
/// The login window's auto-open is gated through the same predicate on mechanism, not on a
/// measurement of that window.
#[cfg(any(debug_assertions, test))]
pub(crate) fn should_auto_open_devtools(target_os: &str) -> bool {
    target_os != "linux"
}

/// Dev-only pre-page-script diagnostic (epic-login-non-interactive investigation,
/// 2026-08-02, F-34.5-G6-01): injected as a Tauri `initialization_script()` on the LOGIN
/// window ONLY (see the `humble_login_open` arm below), gated identically to that arm's
/// existing `open_devtools()` call -- `#[cfg(debug_assertions)]` AND `if visible` -- so
/// it can never reach a packaged build. Initialization scripts run BEFORE any page
/// script, including Epic's own bundle, which is the entire point: every technique tried
/// in this investigation so far (console reads, Break on All Exceptions) could only
/// observe AFTER the page's own bootstrap had already run and, per the evidence trail in
/// `.planning/debug/epic-login-non-interactive.md`, already failed silently into a
/// caught error boundary.
///
/// Deliberately does NOT relay via Tauri IPC in any form -- this page's IPC transport is
/// independently confirmed broken in the same debug file (`IPC custom protocol failed,
/// Tauri will now use the postMessage interface instead -- TypeError: Load failed`, and
/// Epic's CSP refuses `ipc://localhost` outright). A diagnostic that depended on the
/// broken transport would silently capture nothing -- the exact failure mode this
/// project already named in `sidecar-send-channels-fail-silently`. Instead this script
/// keeps everything in-page: it accumulates records into a plain array at
/// `window.__GAMELIB_DIAG__` (capped, see MAX_RECORDS below) and ALSO `console.warn`s
/// each record immediately with the literal `[GAMELIB-DIAG]` prefix so it is visible
/// live and greppable in the Web Inspector console the developer already has open --
/// zero dependency on IPC, the file logger, or Safari's Network request-body viewer (the
/// three routes this investigation has already exhausted).
///
/// Reusable as-is for GOG/Amazon/Nile's login windows: this call lives in the SAME
/// `humble_login_open` arm that (per this file's own prior-cycle comment above
/// `open_devtools()`) is not Humble-specific and is shared by all five runners.
///
/// Robustness, all load-bearing (a diagnostic that breaks the page it measures is worse
/// than none):
/// - The whole script is one outer try/catch; each individual hook (error listener,
///   unhandledrejection listener, fetch/sendBeacon/XHR.send wrappers, console.error
///   passthrough) is ALSO independently try/caught so one hook's failure cannot take
///   down the others or the page.
/// - Adds listeners only -- never removes or overwrites existing handlers -- and the
///   fetch/sendBeacon/XHR.send wrappers always call through to the TRUE original
///   implementation after recording, preserving page behavior exactly.
/// - `window.__GAMELIB_DIAG__` is capped at 200 records; once full, new records simply
///   stop being pushed (never evicted/grown) so a rejection loop cannot exhaust memory.
/// - Any captured body/text is truncated at 20,000 chars with an explicit truncation
///   marker appended.
/// - Captures NO cookie values, NO `Authorization`/header values, and NO token-shaped
///   data at any point -- it never reads request headers at all. REQUEST bodies are
///   captured ONLY when the destination URL substring-matches a Sentry-ingest shape
///   (`/envelope`, `ingest.sentry.io`, `sentry`). All other requests record structural
///   facts only (URL, method, body length), never request-body content. This debug file
///   may get pasted console output committed to a public fork, so this boundary is
///   deliberate, not incidental.
/// - Every mirrored record uses `console.warn`, NEVER `console.log` (audited across the
///   whole script, 2026-08-02 -- a developer's Web Inspector console can have an active
///   level filter that hides Log-level output while leaving Warn/Error visible, and this
///   exact ambiguity produced two false "the request hangs forever" conclusions in this
///   investigation before it was noticed; `console.log` must never be reintroduced here).
///
/// PER-REQUEST OUTCOME CORRELATION (2026-08-02 cycle, epic-login-non-interactive crux
/// test -- does Epic's OWN `/id/api/redirect` request succeed or fail in the same run
/// where a manual diagnostic fetch to it returned HTTP 200?): every intercepted `fetch`
/// and `XMLHttpRequest.send` call is assigned a monotonic integer `id`
/// (`nextRequestId()`) at send time, recorded on its `fetch.send`/`xhr.send` record.
/// EVERY response is now recorded, 2xx and non-2xx alike (previously the code path
/// existed for this already; this cycle added the missing `id`/`elapsedMs` correlation
/// and closed a credential-shaped-URL body gap -- see below), each outcome record
/// carrying the SAME `id` plus `elapsedMs` (milliseconds since send):
///   - `fetch.response` -- any status, 2xx or non-2xx.
///   - `fetch.error` -- the `.catch()` path: a rejection that never produced a
///     `Response` object at all (e.g. a dropped connection), with `errorName` +
///     `errorMessage`, distinct from `fetch.response`.
///   - `xhr.response` -- the `load` event, any status.
///   - `xhr.error` -- a network-level failure with NO response at all. This is
///     specifically the shape `NSURLErrorNetworkConnectionLost` (-1005) surfaces as --
///     a `load` listener alone would record NOTHING for exactly this failure mode.
///   - `xhr.timeout` / `xhr.abort` -- the two other XHR terminal events, each fires at
///     most once per request per the XHR spec, so there is no double-recording.
/// EVERY send is unconditionally recorded, so a reader can diff the `id`s present on
/// `fetch.send`/`xhr.send` records against the `id`s present on ANY outcome record in
/// the dumped `window.__GAMELIB_DIAG__` array: an `id` with a send but no matching
/// outcome record was still in flight when the page settled, the array filled (200-cap),
/// or the session ended.
///
/// fetch's response observer is a SEPARATE `.then()`/`.catch()` chain attached to the
/// promise `originalFetch()` returns -- never to the value returned to the caller -- so
/// attaching it cannot alter what or when Epic's own code awaits/resolves (multiple
/// `.then()` handlers on one promise are independent by spec). `res.clone()` is used
/// before any body read, so the response stream Epic's own code consumes is never
/// touched. XHR uses additive `load`/`error`/`timeout`/`abort` listeners, never
/// overwriting `onload`/`onerror`/etc., so any handler Epic's own bundle attaches keeps
/// firing unmodified.
///
/// RESPONSE BODY capture follows a policy STRICTER than request bodies and is the
/// mandatory secret-handling boundary for this public fork: for any URL that looks
/// credential-shaped (substring match on `/redirect`, `exchangecode`,
/// `authorizationcode`, `/token`, `oauth` -- covers Epic's `/id/api/redirect`, which
/// returns a real `authorizationCode`/`exchangeCode` in its response), body CONTENT is
/// NEVER captured, at ANY status code -- only status, elapsed time, and (if the body
/// parses as JSON) the top-level KEY NAMES via `Object.keys()`, never values. This check
/// fails CLOSED (a thrown/unexpected input is treated as credential-shaped). For all
/// other URLs, body text is captured (truncated, same convention as request bodies) only
/// for non-2xx responses -- 2xx responses to non-credential URLs record status/timing
/// only, since a successful response is not the diagnostic payload this instrument
/// exists to retrieve and capturing it unconditionally would be needless exposure.
#[cfg(debug_assertions)]
pub(crate) const DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT: &str = r#"
(function () {
  try {
    var MAX_RECORDS = 200;
    var MAX_BODY_LEN = 20000;
    var TRUNC_MARKER = '...[GAMELIB-DIAG TRUNCATED]';
    if (!window.__GAMELIB_DIAG__) { window.__GAMELIB_DIAG__ = []; }
    var diag = window.__GAMELIB_DIAG__;
    var REQUEST_ID_COUNTER = 0;

    function nextRequestId() {
      REQUEST_ID_COUNTER += 1;
      return REQUEST_ID_COUNTER;
    }

    function truncate(s) {
      try {
        if (typeof s !== 'string') return s;
        if (s.length > MAX_BODY_LEN) { return s.slice(0, MAX_BODY_LEN) + TRUNC_MARKER; }
        return s;
      } catch (e) { return '[GAMELIB-DIAG truncate error]'; }
    }

    function isSentryLike(url) {
      try {
        var u = String(url || '');
        return u.indexOf('/envelope') !== -1 || u.indexOf('ingest.sentry.io') !== -1 || u.indexOf('sentry') !== -1;
      } catch (e) { return false; }
    }

    // Credential-shaped: any URL that could plausibly return an OAuth code, token, or
    // exchange credential in its response body (e.g. Epic's `/id/api/redirect`, which
    // returns `authorizationCode`/`exchangeCode`). Mandatory secret-handling boundary:
    // response BODIES for these URLs are NEVER captured, at any status code -- only
    // status, timing, and (if the body parses as JSON) top-level KEY NAMES, never
    // values. Fails CLOSED: if the check itself throws, the URL is treated as
    // credential-shaped so a bug in this function cannot leak a body.
    function isCredentialShapedUrl(url) {
      try {
        var u = String(url || '').toLowerCase();
        return u.indexOf('/redirect') !== -1 ||
          u.indexOf('exchangecode') !== -1 ||
          u.indexOf('authorizationcode') !== -1 ||
          u.indexOf('/token') !== -1 ||
          u.indexOf('oauth') !== -1;
      } catch (e) { return true; }
    }

    // Shared response-body capture policy for both fetch and XHR outcome recording.
    // `status` is ALWAYS known to the caller separately -- this function only decides
    // what (if anything) of the BODY gets attached.
    function captureResponseBody(url, status, rawText) {
      try {
        if (isCredentialShapedUrl(url)) {
          try {
            var parsed = JSON.parse(rawText);
            if (parsed && typeof parsed === 'object') {
              return { bodyKeys: Object.keys(parsed), body: undefined, bodyRedacted: true };
            }
          } catch (eParse) {}
          return { bodyKeys: undefined, body: undefined, bodyRedacted: true };
        }
        if (typeof status === 'number' && status >= 200 && status < 300) {
          // Non-credential 2xx: status/timing is enough; body is not the diagnostic
          // payload this instrument exists to retrieve, so it is not captured.
          return { bodyKeys: undefined, body: undefined, bodyRedacted: false };
        }
        return { bodyKeys: undefined, body: truncate(String(rawText)), bodyRedacted: false };
      } catch (e) {
        return { bodyKeys: undefined, body: undefined, bodyRedacted: true };
      }
    }

    function record(entry) {
      try {
        entry.t = Date.now();
        if (diag.length < MAX_RECORDS) { diag.push(entry); }
        try { console.warn('[GAMELIB-DIAG]', entry); } catch (eWarn) {}
      } catch (e) {}
    }

    try {
      window.addEventListener('error', function (ev) {
        try {
          record({
            kind: 'error',
            message: ev && ev.message,
            filename: ev && ev.filename,
            lineno: ev && ev.lineno,
            colno: ev && ev.colno,
            stack: (ev && ev.error && ev.error.stack) ? truncate(String(ev.error.stack)) : undefined
          });
        } catch (eInner) {}
      });
    } catch (eListenError) {}

    try {
      window.addEventListener('unhandledrejection', function (ev) {
        try {
          var reason = ev && ev.reason;
          var reasonMessage;
          try { reasonMessage = (reason && reason.message) ? String(reason.message) : String(reason); }
          catch (eMsg) { reasonMessage = '[GAMELIB-DIAG unreadable reason]'; }
          var reasonStack;
          try { reasonStack = (reason && reason.stack) ? truncate(String(reason.stack)) : undefined; }
          catch (eStack) {}
          record({ kind: 'unhandledrejection', reason: truncate(reasonMessage), stack: reasonStack });
        } catch (eInner) {}
      });
    } catch (eListenRejection) {}

    // fetch: every send gets a monotonic `id` (also on its 'fetch.send' record) and a
    // `startTime`. A SEPARATE .then/.catch chain is attached to the promise
    // `originalFetch(...)` returns -- never to the value returned to the caller -- so
    // Epic's own await/resolution of that SAME promise is unaffected (independent
    // `.then()` handlers on one promise never disturb each other or the promise's own
    // resolution). `res.clone()` is used before any body read, so the response stream
    // Epic's own code consumes is never touched. Exactly one outcome record per
    // request: 'fetch.response' (any status, 2xx or non-2xx alike) or 'fetch.error'
    // (the .catch() path -- a rejection that never produced a Response object at all,
    // e.g. a dropped connection).
    try {
      if (window.fetch) {
        var originalFetch = window.fetch.bind(window);
        window.fetch = function (input, init) {
          var url = ''; var method = 'GET';
          var reqId = nextRequestId();
          var startTime = Date.now();
          try {
            url = (typeof input === 'string') ? input : ((input && input.url) || '');
            method = (init && init.method) || (input && input.method) || 'GET';
          } catch (eUrl) {}
          try {
            var bodyLen; var bodyPreview;
            try {
              var rawBody = (init && init.body) || undefined;
              if (typeof rawBody === 'string') {
                bodyLen = rawBody.length;
                if (isSentryLike(url)) { bodyPreview = truncate(rawBody); }
              }
            } catch (eBody) {}
            record({ kind: 'fetch.send', id: reqId, url: String(url), method: String(method), bodyLen: bodyLen, body: bodyPreview });
          } catch (eOuter) {}
          var fetchPromise = originalFetch(input, init);
          try {
            fetchPromise.then(function (res) {
              try {
                var elapsed = Date.now() - startTime;
                var status = (res && typeof res.status === 'number') ? res.status : undefined;
                try {
                  res.clone().text().then(function (text) {
                    try {
                      var capture = captureResponseBody(url, status, text);
                      record({
                        kind: 'fetch.response', id: reqId, url: String(url), method: String(method),
                        status: status, elapsedMs: elapsed,
                        bodyLen: (typeof text === 'string' ? text.length : undefined),
                        bodyKeys: capture.bodyKeys, body: capture.body, bodyRedacted: capture.bodyRedacted
                      });
                    } catch (eRec) {}
                  }).catch(function () {
                    try {
                      record({ kind: 'fetch.response', id: reqId, url: String(url), method: String(method), status: status, elapsedMs: elapsed, bodyReadError: true });
                    } catch (eRec2) {}
                  });
                } catch (eClone) {
                  try {
                    record({ kind: 'fetch.response', id: reqId, url: String(url), method: String(method), status: status, elapsedMs: elapsed, cloneError: true });
                  } catch (eRec3) {}
                }
              } catch (eResp) {}
            }).catch(function (fetchErr) {
              try {
                var elapsed = Date.now() - startTime;
                record({
                  kind: 'fetch.error', id: reqId, url: String(url), method: String(method), elapsedMs: elapsed,
                  errorName: (fetchErr && fetchErr.name) ? String(fetchErr.name) : undefined,
                  errorMessage: (fetchErr && fetchErr.message) ? truncate(String(fetchErr.message)) : String(fetchErr)
                });
              } catch (eRejRec) {}
            });
          } catch (eAttach) {}
          return fetchPromise;
        };
      }
    } catch (eFetch) {}

    try {
      if (navigator && navigator.sendBeacon) {
        var originalSendBeacon = navigator.sendBeacon.bind(navigator);
        navigator.sendBeacon = function (url, data) {
          try {
            var reqId = nextRequestId();
            var bodyLen; var bodyPreview;
            try {
              if (typeof data === 'string') {
                bodyLen = data.length;
                if (isSentryLike(url)) { bodyPreview = truncate(data); }
              }
            } catch (eBody) {}
            record({ kind: 'sendBeacon', id: reqId, url: String(url), bodyLen: bodyLen, body: bodyPreview });
          } catch (eOuter) {}
          return originalSendBeacon(url, data);
        };
      }
    } catch (eBeacon) {}

    // XHR: `open` still only tags the instance with the URL/method it will send
    // (unchanged). `send` now assigns a monotonic `id` and `startTime`, then registers
    // ADDITIVE `addEventListener` handlers (never overwrites `onload`/`onerror`/any
    // handler Epic's own bundle attaches) for FOUR distinct terminal events, not just
    // 'load':
    //   - 'load'    -> 'xhr.response' outcome (status + elapsedMs + body policy, any status)
    //   - 'error'   -> 'xhr.error' outcome (a network-level failure with NO response at
    //                  all -- this is the event NSURLErrorNetworkConnectionLost / -1005
    //                  surfaces as; a 'load'-only listener would record NOTHING for
    //                  exactly this failure)
    //   - 'timeout' -> 'xhr.timeout' outcome
    //   - 'abort'   -> 'xhr.abort' outcome
    // Each of these four is a distinct terminal event per the XHR spec -- at most one
    // ever fires per request, so there is no double-recording.
    try {
      if (window.XMLHttpRequest && XMLHttpRequest.prototype && XMLHttpRequest.prototype.send) {
        var originalOpen = XMLHttpRequest.prototype.open;
        var originalSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function (method, url) {
          try { this.__gamelibDiagUrl = url; this.__gamelibDiagMethod = method; } catch (eSet) {}
          return originalOpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function (body) {
          var url = this && this.__gamelibDiagUrl;
          var method = this && this.__gamelibDiagMethod;
          var reqId = nextRequestId();
          var startTime = Date.now();
          try {
            var bodyLen; var bodyPreview;
            try {
              if (typeof body === 'string') {
                bodyLen = body.length;
                if (isSentryLike(url)) { bodyPreview = truncate(body); }
              }
            } catch (eBody) {}
            // Read (never set) the page's OWN configured `.timeout` on this instance,
            // if any -- this is Epic's own client-side timeout budget for this specific
            // request, not this diagnostic's classification of the outcome. 0/undefined
            // means the page left the browser default (no explicit timeout) in place.
            // Purely observational: read-only, no assignment, cannot change request
            // behavior. Added to discriminate "Epic's own short timeout collided with
            // WKWebView connection latency" from "a general connection-level failure"
            // without needing a second live run.
            var configuredTimeoutMs;
            try {
              if (typeof this.timeout === 'number' && this.timeout > 0) {
                configuredTimeoutMs = this.timeout;
              }
            } catch (eTimeout) {}
            record({
              kind: 'xhr.send',
              id: reqId,
              url: url ? String(url) : undefined,
              method: method ? String(method) : undefined,
              bodyLen: bodyLen,
              body: bodyPreview,
              configuredTimeoutMs: configuredTimeoutMs
            });
          } catch (eOuter) {}
          try {
            var self = this;
            function recordXhrOutcome(eventType) {
              try {
                var elapsed = Date.now() - startTime;
                var status;
                try { status = self.status; } catch (eStatus) {}
                if (eventType === 'load') {
                  var text;
                  try { text = self.responseText; } catch (eRT) {}
                  var capture;
                  try { capture = captureResponseBody(url, status, text); }
                  catch (eCap) { capture = { bodyKeys: undefined, body: undefined, bodyRedacted: true }; }
                  record({
                    kind: 'xhr.response', id: reqId, url: url ? String(url) : undefined,
                    method: method ? String(method) : undefined, status: status, elapsedMs: elapsed,
                    bodyLen: (typeof text === 'string' ? text.length : undefined),
                    bodyKeys: capture.bodyKeys, body: capture.body, bodyRedacted: capture.bodyRedacted
                  });
                } else {
                  record({
                    kind: 'xhr.' + eventType, id: reqId, url: url ? String(url) : undefined,
                    method: method ? String(method) : undefined, status: status, elapsedMs: elapsed
                  });
                }
              } catch (eOutcome) {}
            }
            self.addEventListener('load', function () { recordXhrOutcome('load'); });
            self.addEventListener('error', function () { recordXhrOutcome('error'); });
            self.addEventListener('timeout', function () { recordXhrOutcome('timeout'); });
            self.addEventListener('abort', function () { recordXhrOutcome('abort'); });
          } catch (eAttachLoad) {}
          return originalSend.apply(this, arguments);
        };
      }
    } catch (eXhr) {}

    try {
      var originalConsoleError = console.error ? console.error.bind(console) : null;
      console.error = function () {
        try {
          var args = Array.prototype.slice.call(arguments);
          var joined;
          try {
            joined = args.map(function (a) {
              try {
                if (typeof a === 'string') return a;
                if (a && a.stack) return String(a.stack);
                return JSON.stringify(a);
              } catch (eJ) { return String(a); }
            }).join(' ');
          } catch (eJoin) { joined = '[GAMELIB-DIAG unjoinable console.error args]'; }
          record({ kind: 'console.error', message: truncate(joined) });
        } catch (eOuter) {}
        if (originalConsoleError) {
          try { return originalConsoleError.apply(console, arguments); } catch (eCall) {}
        }
      };
    } catch (eConsole) {}

    try { console.warn('[GAMELIB-DIAG] instrumentation installed'); } catch (eFinal) {}
  } catch (outerError) {
    try { console.warn('[GAMELIB-DIAG] instrumentation failed to install', outerError); } catch (eReport) {}
  }
})();
"#;

/// Generates a login-window label that can NEVER equal `main`/`about` and is NEVER
/// derived from any caller-supplied argument (T-34.1-27, REQ-34.4.1-09) -- the Rust-side
/// port of `tauriChildWindows.ts`'s `nextExternalWindowLabel()` discipline. The fixed
/// `loginwin-` prefix (neither reserved label starts with it) plus a process-lifetime
/// monotonic counter plus a nanosecond timestamp guarantee uniqueness; the trailing hex
/// entropy (sourced from `RandomState`'s OS-seeded random keys -- std, no new dependency)
/// means the label is not predictable from the counter/timestamp alone. Child labels
/// never join `capabilities/default.json`'s `windows: ["main"]` array, so a label that is
/// never `main`/`about` and never url-derived matches NO capability and gets zero Tauri
/// command access.
pub(crate) fn next_login_window_label() -> String {
    let n = LOGIN_WINDOW_LABEL_COUNTER.fetch_add(1, Ordering::SeqCst);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let mut hasher = std::collections::hash_map::RandomState::new().build_hasher();
    (n, nanos).hash(&mut hasher);
    let entropy = (hasher.finish() & 0xffff_ffff) as u32;
    format!("loginwin-{n:x}-{nanos:x}-{entropy:08x}")
}

/// The semantic half of `humble_login_open`'s ASVS V5 input validation (threat T-34.4.1-08):
/// the generated `HumbleLoginOpenArgs::from_args` has already proved `args[0]` is a string
/// (`humble_login_open:bad-args` otherwise); this proves it parses as an absolute URL whose
/// scheme is exactly `https`. `http://`, `file://` and `javascript:` are all rejected HERE,
/// before any real OS window is constructed -- this is the arm's only gate.
pub(crate) fn login_window_parse_url(raw: &str) -> Result<tauri::Url, String> {
    let url = tauri::Url::parse(raw).map_err(|_| "humble_login_open:bad-url".to_string())?;
    if url.scheme() != "https" {
        return Err("humble_login_open:bad-url".to_string());
    }
    Ok(url)
}

/// Composes the login window's OS title with the SHELL-RESOLVED origin FIRST, always
/// (Phase 34.5 Plan 27, F-34.5-G6-04, T-34.5-G6-22/T-34.5-G6-23). `AppHandle`-free and
/// `#[cfg(test)]`-covered, mirroring `clipboard_text_arg`/`login_window_parse_url`'s own
/// pure-helper convention.
///
/// `origin` MUST come from the URL the shell itself validated (`login_window_parse_url`'s
/// return value, via `tauri::Url::origin().ascii_serialization()`) -- NEVER from page
/// content. `document_title` is the page's own `document.title`, which is fully
/// attacker-controlled: the loaded page can set it to anything, including a string
/// crafted to look like a URL or an origin (T-34.5-G6-23). That is exactly why the
/// document title can never be trusted as an origin indicator on its own, and exactly why
/// this helper places `origin` first, unconditionally, with the document title (if any)
/// appended only AFTER it -- a truncated title bar still shows the trustworthy part first,
/// and the page's text can never precede or replace it.
pub(crate) fn login_window_title(origin: &str, document_title: Option<&str>) -> String {
    match document_title {
        Some(title) if !title.is_empty() => format!("{origin} — {title}"),
        _ => origin.to_string(),
    }
}

/// The ONLY domain comparison in this file -- the wry cookies-for-url API (the plausible
/// but WRONG shortcut this function replaces) MUST NOT appear anywhere in `main.rs` (see
/// the cookie arms below). Proper suffix match: `host ==
/// domain` OR `host` ends with `.{domain}`, never wry's `==`-only comparison, which
/// silently drops `_simpleauth_sess` for `www.humblebundle.com` because Humble stores it
/// against the apex domain `humblebundle.com` (spike 014a /
/// `.claude/skills/spike-findings-gamelib/references/tauri-login-webview-cookies.md`).
pub(crate) fn cookie_domain_matches(host: &str, domain: Option<&str>) -> bool {
    match domain {
        // Normalize a leading-dot `domain` (RFC 6265's wildcard-subdomain marker) before
        // comparing (F-34.4.2-19). Without this, `format!(".{d}")` on an already-dotted `d`
        // produces an impossible ".."-prefixed suffix requirement no real hostname can ever
        // satisfy, making this comparator categorically blind to any leading-dot cookie
        // domain regardless of `host` -- exactly the shape `_simpleauth_sess`'s real,
        // live-measured domain (".humblebundle.com") takes, which silently broke
        // `humble_login_cookies`' poll arm. RFC 6265 defines a `.example.com` cookie as
        // applying to `example.com` itself, not only to its subdomains, so stripping the
        // leading dot here is the spec-correct fix, not a special case. Argument order at
        // every call site is DELIBERATELY left untouched (Plan 22, F-6 Defect A) -- this
        // normalizes the value being compared, not which position it is compared from.
        Some(d) => {
            let d = d.strip_prefix('.').unwrap_or(d);
            host == d || host.ends_with(&format!(".{d}"))
        }
        None => false,
    }
}

/// Domain-suffix match for a `WKWebsiteDataRecord`'s `displayName()` (Phase 34.4.1 Plan 23,
/// F-6 Defect B, REQ-34.4.1-06). `displayName` and a cookie's `domain()` share the exact same
/// shape -- a bare host string, grouped by the public suffix list -- so this delegates to
/// `cookie_domain_matches` above (the ONLY domain comparison this file uses, per its own
/// comment) rather than reimplementing suffix discipline a second, subtly different way. A
/// second ad hoc comparator in this file is exactly how Defect A happened (Plan 22): do not
/// repeat that mistake here just because the input is a record instead of a cookie. The
/// `display_name.is_empty()` guard is explicit rather than left implicit in
/// `cookie_domain_matches`'s own logic, so an empty display name can never accidentally match
/// (`cookie_domain_matches("", Some(d))` is already `false` for any non-empty `d`, but this
/// states the guarantee in-source rather than relying on that as an unstated side effect).
pub(crate) fn website_data_record_matches_domain(display_name: &str, target: &str) -> bool {
    if display_name.is_empty() {
        return false;
    }
    cookie_domain_matches(display_name, Some(target))
}

/// The measured-delete-count contract this plan establishes (Phase 34.4.1 Plan 23, F-6
/// Defect B): `before - after`, saturating at zero rather than wrapping, so a jar that GREW
/// between the two reads (a concurrent login racing the clear) can never produce a negative
/// or wrapped count. This is deliberately NEVER the pre-removal size of the matched set,
/// computed before any removal ran -- that attempted-count shape is the exact bug this plan
/// closes. Both `before` and
/// `after` must be counted with the SAME filter (the clear direction), or the subtraction is
/// meaningless; callers are responsible for that symmetry.
pub(crate) fn verified_delete_count(before: usize, after: usize) -> usize {
    before.saturating_sub(after)
}

/// Shapes one `LOGIN_WINDOW_EVENTS` queue entry -- the exact `{"event", "url"}` shape
/// `humble_login_take_events`'s interface contract promises the sidecar.
pub(crate) fn login_event_value(kind: &str, url: &str) -> Value {
    serde_json::json!({ "event": kind, "url": url })
}

/// Pushes one navigation event onto `label`'s queue, capping it at
/// `LOGIN_WINDOW_EVENTS_CAP` with oldest-dropped (T-34.4.1-09). Called from the
/// `on_page_load` hook below, which may run off the calling thread -- hence the `Mutex`.
/// A poisoned lock (only reachable after a prior panic elsewhere) fails this single push
/// silently rather than panicking a webview navigation callback.
pub(crate) fn push_login_window_event(label: &str, event: Value) {
    let Ok(mut guard) = LOGIN_WINDOW_EVENTS.lock() else {
        return;
    };
    let map = guard.get_or_insert_with(HashMap::new);
    let queue = map.entry(label.to_string()).or_insert_with(Vec::new);
    queue.push(event);
    if queue.len() > LOGIN_WINDOW_EVENTS_CAP {
        queue.remove(0);
    }
}

// ---- humble_reveal_post support (Phase 34.4.1 Plan 04, D-07/D-08, REQ-34.4.1-05) ----
//
// `humblePostRequest` (`backend/humble/adapter.ts`) routes its ONE write-style Humble call
// (the reveal-key POST) through this arm under Tauri instead of Electron's `net.request`.
// Design: open a HIDDEN, on-demand child window on the real Humble origin, run the POST from
// the page's OWN JS `fetch()` (a genuine WKWebView network stack -- the one structurally-new
// transport with its own real browser TLS/HTTP fingerprint), and read the result back via a
// navigation-intercept exfil the arm itself cancels before it can resolve anywhere (Open
// Question 1, RESEARCH.md -- discharged below).

/// Non-resolvable exfil host for `humble_reveal_post`'s navigation-intercept return channel
/// (D-07, T-34.4.1-21, Open Question 1). RFC 2606 reserves the `.invalid` TLD as guaranteed
/// non-resolvable, so even a late `on_navigation` cancellation cannot leak the reveal payload
/// to a public DNS resolver -- the worst case is a brief local resolver miss, never
/// third-party disclosure.
pub(crate) const REVEAL_EXFIL_HOST: &str = "gamelib.invalid";

/// Bound on how long `humble_reveal_post` waits for the exfil channel to deliver a payload
/// before treating the reveal as a timeout (D-08: the hidden window must not linger
/// indefinitely). A backstop underneath the sidecar's own `RUST_INVOKE_TIMEOUT_MS` (60s,
/// `sidecarRpc.ts`) -- this fires first and lets the window close well before that outer bound.
pub(crate) const REVEAL_POST_TIMEOUT: Duration = Duration::from_secs(20);

/// Bound on how long `humble_login_clear_cookies` waits, on macOS, for
/// `removeDataOfTypes_forDataRecords_completionHandler`'s completion block to fire before
/// falling through to the post-removal re-read anyway (Phase 34.4.1 Plan 23, F-6 Defect B,
/// D-08: must not linger). Mirrors `REVEAL_POST_TIMEOUT`'s reasoning -- a backstop underneath
/// the sidecar's own 60s `RUST_INVOKE_TIMEOUT_MS`. A timeout here does NOT short-circuit to an
/// error: the verified count always comes from re-reading the jar, never from whether this
/// signal arrived, so a missed signal still yields an honest (possibly zero) count rather than
/// a false failure. Windows uses the same bound for `GetCookies`' completion handler
/// (debug webview2-delete-cookie-noop).
#[cfg(any(target_os = "macos", windows))]
pub(crate) const CLEAR_COOKIES_TIMEOUT: Duration = Duration::from_secs(10);

/// Windows only: how long `humble_login_clear_cookies` keeps re-reading the jar after issuing
/// `DeleteCookie`, which returns before the browser process applies the removal. Re-reads stop
/// as soon as the matched set is empty, so a working clear costs one re-read; only a clear that
/// genuinely leaves cookies behind waits the full bound. Small against the sidecar's 60s
/// `RUST_INVOKE_TIMEOUT_MS` even stacked on `CLEAR_COOKIES_TIMEOUT`.
#[cfg(windows)]
pub(crate) const CLEAR_COOKIES_SETTLE: Duration = Duration::from_secs(2);

/// Windows only: one Chrome DevTools Protocol call on `window`'s WebView2, returning the parsed
/// JSON result. Blocks the calling (worker) thread on a channel while the main thread's message
/// loop services the completion, the same shape as `humble_login_clear_cookies`' Windows arm.
#[cfg(windows)]
fn webview2_cdp_call(
    window: &tauri::WebviewWindow,
    method: &'static str,
    params: Value,
) -> Result<Value, String> {
    use windows::core::HSTRING;
    let (tx, rx) = mpsc_channel::<Result<String, String>>();
    let params_json = params.to_string();
    window
        .with_webview(move |webview| {
            let tx_done = tx.clone();
            let outcome = (|| -> windows::core::Result<()> {
                // SAFETY: `controller()` is tauri's live controller for this window, valid for
                // the closure's duration on the main thread.
                let core = unsafe { webview.controller().CoreWebView2()? };
                let handler = webview2_com::CallDevToolsProtocolMethodCompletedHandler::create(
                    Box::new(move |error_code, result_json| {
                        let _ = tx_done.send(
                            error_code
                                .map(|()| result_json)
                                .map_err(|e| format!("{method}:{e}")),
                        );
                        Ok(())
                    }),
                );
                unsafe {
                    core.CallDevToolsProtocolMethod(
                        &HSTRING::from(method),
                        &HSTRING::from(params_json.as_str()),
                        &handler,
                    )?
                };
                Ok(())
            })();
            if let Err(e) = outcome {
                let _ = tx.send(Err(format!("{method}:setup:{e}")));
            }
        })
        .map_err(|e| format!("{method}:dispatch:{e}"))?;
    let raw = rx
        .recv_timeout(CLEAR_COOKIES_TIMEOUT)
        .map_err(|_| format!("{method}:timeout"))??;
    serde_json::from_str(&raw).map_err(|e| format!("{method}:parse:{e}"))
}

/// Windows only: deletes every cookie matching `domain` through CDP `Network.deleteCookies`,
/// which -- unlike `ICoreWebView2CookieManager::DeleteCookie` -- accepts a `partitionKey`.
/// Measured live (debug webview2-delete-cookie-noop): Cloudflare's `cf_clearance` on
/// `.www.epicgames.com` survived `DeleteCookie` with `S_OK` and an unchanged value, while
/// `__cf_bm` with the identical domain/path/flags was removed. Returns how many deletes were
/// ISSUED -- an attempted count, used only for logging; the caller's verified count still comes
/// from a re-read.
#[cfg(windows)]
pub(crate) fn webview2_cdp_delete_matching_cookies(
    window: &tauri::WebviewWindow,
    domain: &str,
) -> Result<(usize, usize), String> {
    let listed = webview2_cdp_call(window, "Storage.getCookies", serde_json::json!({}))?;
    let cookies = listed
        .get("cookies")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let (mut issued, mut partitioned) = (0usize, 0usize);
    for cookie in cookies {
        let raw_domain = cookie.get("domain").and_then(Value::as_str).unwrap_or("");
        let host = raw_domain.strip_prefix('.').unwrap_or(raw_domain);
        if !cookie_domain_matches(host, Some(domain)) {
            continue;
        }
        let mut params = serde_json::json!({
            "name": cookie.get("name").cloned().unwrap_or(Value::Null),
            "domain": raw_domain,
            "path": cookie.get("path").cloned().unwrap_or(Value::Null),
        });
        if let Some(key) = cookie.get("partitionKey") {
            params["partitionKey"] = key.clone();
            partitioned += 1;
        }
        webview2_cdp_call(window, "Network.deleteCookies", params)?;
        issued += 1;
    }
    Ok((issued, partitioned))
}

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

/// The five parsed, validated args `humble_reveal_post` needs. Kept as a plain struct (rather
/// than returning a tuple) so the dispatch arm's body reads by field name, not position.
/// Deliberately does NOT derive the standard formatting trait this doc comment is avoiding
/// naming by its real identifier (REQ-34.1-07's file-wide tray out-of-scope-menu-depth text
/// gate scans the WHOLE stripped file for that capitalized word, not just the tray block) --
/// `#[cfg(test)]`'s rejection assertions below use a small manual-match helper instead of
/// `.unwrap_err()` specifically so this struct never needs that trait.
pub(crate) struct RevealPostArgs {
    pub(crate) origin_url: tauri::Url,
    pub(crate) path: String,
    pub(crate) body: String,
    pub(crate) csrf_token: Option<String>,
    pub(crate) user_agent: String,
}

/// This arm's entire ASVS V5 input validation (mirrors `login_window_parse_url`'s discipline for
/// `humble_login_open`, T-34.4.1-08): `args[0]` is re-validated https-only via
/// `login_window_parse_url` itself (never re-derived), so a missing/wrong-typed arg AND a
/// non-https origin both collapse to the single `humble_reveal_post:bad-args` error the
/// interface contract declares (no separate bad-url variant for this arm). `args[3]`
/// (csrf_token) is the only optional value -- a missing arg or `Value::Null` both map to
/// `None`, never the JS-string `"null"` (see `reveal_post_script` below).
pub(crate) fn reveal_post_args(args: &[Value]) -> Result<RevealPostArgs, String> {
    let a = HumbleRevealPostArgs::from_args(args)?;
    let origin_url = login_window_parse_url(&a.origin_url)
        .map_err(|_| "humble_reveal_post:bad-args".to_string())?;
    let (path, body, csrf_token, user_agent) = (a.path, a.body, a.csrf_token, a.user_agent);
    Ok(RevealPostArgs {
        origin_url,
        path,
        body,
        csrf_token,
        user_agent,
    })
}

/// Builds the script injected into the reveal window: runs the POST from the page's own JS
/// context and exfiltrates the JSON-encoded `{status, body}` result via a `location.href`
/// assignment to `exfil_host`, which the arm's `on_navigation` hook cancels before it can ever
/// resolve (T-34.4.1-20/21). Every interpolated value -- `path`, `body`, `csrf_token` -- is
/// embedded via `serde_json::to_string`, producing a properly escaped JS string/null literal;
/// this is the arm's ENTIRE defense against a tampered/attacker-influenceable value breaking
/// out of its string context in an authenticated remote page (ASVS V5). NEVER
/// `format!("'{}'", value)` -- a naive quoted interpolation is exactly the injection this
/// function exists to prevent.
///
/// Does NOT use `eval_with_callback`'s callback to deliver the fetch result (Pitfall 5,
/// 34.4.1-RESEARCH.md): `WKWebView.evaluateJavaScript(_:completionHandler:)` reports the
/// script's IMMEDIATE completion value, and a returned Promise is not auto-awaited. The script
/// runs fire-and-forget (`WebviewWindow::eval`); the real result arrives later via the
/// navigation-intercept exfil this function's own `location.href` assignment triggers.
///
/// The JS template below is built via `concat!` of single-line string pieces (each opening and
/// closing its own `"` delimiter on the SAME source line) rather than one multi-line raw
/// string -- `longRunningChannels.test.ts`'s WR-08 stripper-integrity guard asserts every
/// comment-stripped code line in this file has a BALANCED (even) `"`-count, which a multi-line
/// `r#"..."#` literal's opening/closing lines each structurally violate (one bare `"` per
/// line). Every JS string literal inside the template therefore uses single quotes, so no `"`
/// character appears anywhere except each piece's own two Rust delimiters.
pub(crate) fn reveal_post_script(
    path: &str,
    body: &str,
    csrf_token: Option<&str>,
    exfil_host: &str,
) -> String {
    let path_js = serde_json::to_string(path).unwrap_or_else(|_| "\"\"".to_string());
    let body_js = serde_json::to_string(body).unwrap_or_else(|_| "\"\"".to_string());
    let csrf_js = match csrf_token {
        Some(token) => serde_json::to_string(token).unwrap_or_else(|_| "null".to_string()),
        None => "null".to_string(),
    };
    let exfil_host_js =
        serde_json::to_string(exfil_host).unwrap_or_else(|_| "\"gamelib.invalid\"".to_string());
    format!(
        concat!(
            "(function() {{ ",
            "var headers = {{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'}}; ",
            "var csrf = {csrf_js}; ",
            "if (csrf !== null) {{ headers['csrf-prevention-token'] = csrf; }} ",
            "function exfil(result) {{ location.href = 'https://' + {exfil_host_js} + '/reveal?data=' + encodeURIComponent(JSON.stringify(result)); }} ",
            "fetch({path_js}, {{method:'POST',credentials:'include',headers:headers,body:{body_js}}})",
            ".then(function(response) {{ return response.text().then(function(text) {{ exfil({{status:response.status,body:text}}); }}); }})",
            ".catch(function(error) {{ exfil({{status:0,body:'ERR:'+String(error)}}); }}); ",
            "}})();"
        ),
        // Explicit named args required: `format!`'s implicit-capture-from-scope sugar cannot
        // resolve identifiers when its format string is itself produced by another macro
        // (`concat!`), to avoid ambiguity -- see rustc's own note on this exact error.
        path_js = path_js,
        body_js = body_js,
        csrf_js = csrf_js,
        exfil_host_js = exfil_host_js
    )
}

// ---- humble_login_clear_storage support (34.4.1 gap cycle plan 15, F-6 BLOCKING,
// REQ-34.4.1-06/REQ-34.4.1-GAP-03) ----
//
// New capability the Tauri seam has never had: `humble_login_clear_cookies` above only clears
// cookies. Electron's disconnect additionally runs `clearStorageData`/`clearCache`/
// `clearAuthCache`/`clearHostResolverCache`/`clearData` -- localStorage, sessionStorage,
// IndexedDB, Cache Storage and service workers all survived a Tauri disconnect (F-6, the
// blocking live-gate finding), so Humble's web app silently restored a session from what
// remained. This arm's design mirrors `humble_reveal_post` (D-07/D-08's hidden-window +
// navigation-intercept-exfil template), not `humble_login_clear_cookies` -- running the clear
// as JS INSIDE the target page's own origin makes it origin-scoped BY CONSTRUCTION (same-origin
// policy), satisfying both D-08/Pitfall 3's over-broad constraint (never touch another
// origin/storefront's storage) and F-6's under-broad one (never leave the CURRENT origin's
// storage untouched) at the same time. `clear_all_browsing_data()` MUST NOT appear anywhere in
// this file.

/// Bound on how long `humble_login_clear_storage` waits for the exfil channel to deliver a
/// payload before treating the clear as a timeout (mirrors `REVEAL_POST_TIMEOUT`'s D-08
/// discipline -- the hidden window must not linger indefinitely on any exit path).
pub(crate) const CLEAR_STORAGE_TIMEOUT: Duration = Duration::from_secs(20);

/// The two parsed, validated args `humble_login_clear_storage` needs. `origin_url` is
/// re-validated https-only via `login_window_parse_url` itself (never re-derived, mirrors
/// `reveal_post_args`'s own discipline) -- a missing/wrong-typed arg AND a non-https origin both
/// collapse to the single `humble_login_clear_storage:bad-args` error. Deliberately does NOT
/// derive the standard formatting trait (REQ-34.1-07's file-wide text gate, same reasoning as
/// `RevealPostArgs` above) -- `#[cfg(test)]`'s rejection assertions use a small manual-match
/// helper instead of `.unwrap_err()`.
pub(crate) struct ClearStorageArgs {
    pub(crate) origin_url: tauri::Url,
    pub(crate) user_agent: String,
}

/// This arm's entire ASVS V5 input validation (mirrors `reveal_post_args`/`login_window_parse_url`,
/// T-34.4.1-08).
pub(crate) fn clear_storage_args(args: &[Value]) -> Result<ClearStorageArgs, String> {
    let a = HumbleLoginClearStorageArgs::from_args(args)?;
    let origin_url = login_window_parse_url(&a.origin_url)
        .map_err(|_| "humble_login_clear_storage:bad-args".to_string())?;
    let user_agent = a.user_agent;
    Ok(ClearStorageArgs {
        origin_url,
        user_agent,
    })
}

/// Builds the script injected by `humble_login_clear_storage`. Clears, for the loaded page's OWN
/// origin only (same-origin policy makes any other origin structurally unreachable by this
/// script -- T-34.4.1-66): `localStorage`, `sessionStorage`, every IndexedDB database, every
/// Cache Storage entry, and every service-worker registration. Each category is wrapped in its
/// OWN try/catch (mirrors the TS-side guarded `wipeSteps` shape plan 16 will wire this into) so
/// one failing/absent category can never abort the rest, and every category reports either a
/// numeric count or the literal string `'unsupported'` -- NEVER silently coercing a missing API
/// (`indexedDB.databases()` in particular is not universally available) into a false "0
/// cleared" (T-34.4.1-67, the `navigator-clipboard-noops-under-tauri` mitigation applied to
/// storage). The async categories (IndexedDB deletion, `caches`, service-worker unregistration)
/// are all `await`ed before the single `exfil()` call at the very end, or this would report
/// success for work that has not actually happened yet.
///
/// The ONLY interpolated value is `exfil_host`, which goes through the SAME `serde_json::to_string`
/// discipline `reveal_post_script` uses for its own interpolated values (T-34.4.1-65) -- via a
/// placeholder-token `.replace()` rather than `format!`'s `{{`/`}}` brace-escaping, which this
/// script's heavy JS object/brace nesting would make unreadable and error-prone to keep correct.
/// Every JS string literal inside the template uses single quotes (mirrors `reveal_post_script`),
/// so every `concat!` piece below is exactly one Rust string literal with a BALANCED (2, even)
/// raw `"`-count per source line -- satisfying `longRunningChannels.test.ts`'s WR-08
/// stripper-integrity guard trivially, with no escaped-quote bookkeeping required.
pub(crate) fn clear_storage_script(exfil_host: &str) -> String {
    let exfil_host_js =
        serde_json::to_string(exfil_host).unwrap_or_else(|_| "\"gamelib.invalid\"".to_string());
    let template = concat!(
        "(function() { ",
        "function exfil(result) { location.href = 'https://' + @@EXFIL_HOST@@ + '/clear-storage?data=' + encodeURIComponent(JSON.stringify(result)); } ",
        "(async function() { ",
        "var report = {}; ",
        "try { if (typeof localStorage !== 'undefined' && localStorage !== null) { var n0 = localStorage.length; localStorage.clear(); report.localStorage = n0; } else { report.localStorage = 'unsupported'; } } catch (e0) { report.localStorage = 'unsupported'; } ",
        "try { if (typeof sessionStorage !== 'undefined' && sessionStorage !== null) { var n1 = sessionStorage.length; sessionStorage.clear(); report.sessionStorage = n1; } else { report.sessionStorage = 'unsupported'; } } catch (e1) { report.sessionStorage = 'unsupported'; } ",
        "try { if (typeof indexedDB !== 'undefined' && indexedDB !== null && typeof indexedDB.databases === 'function') { var dbs = await indexedDB.databases(); var n2 = 0; for (var i = 0; i < dbs.length; i++) { if (dbs[i] && dbs[i].name) { await new Promise(function(resolve) { try { var req = indexedDB.deleteDatabase(dbs[i].name); req.onsuccess = function() { resolve(); }; req.onerror = function() { resolve(); }; req.onblocked = function() { resolve(); }; } catch (e4) { resolve(); } }); n2++; } } report.indexedDB = n2; } else { report.indexedDB = 'unsupported'; } } catch (e2) { report.indexedDB = 'unsupported'; } ",
        "try { if (typeof caches !== 'undefined' && caches !== null && typeof caches.keys === 'function') { var keys = await caches.keys(); for (var j = 0; j < keys.length; j++) { await caches.delete(keys[j]); } report.caches = keys.length; } else { report.caches = 'unsupported'; } } catch (e3) { report.caches = 'unsupported'; } ",
        "try { if (typeof navigator !== 'undefined' && navigator.serviceWorker && typeof navigator.serviceWorker.getRegistrations === 'function') { var regs = await navigator.serviceWorker.getRegistrations(); for (var k = 0; k < regs.length; k++) { await regs[k].unregister(); } report.serviceWorkers = regs.length; } else { report.serviceWorkers = 'unsupported'; } } catch (e5) { report.serviceWorkers = 'unsupported'; } ",
        "exfil(report); ",
        "})(); ",
        "})();"
    );
    template.replace("@@EXFIL_HOST@@", &exfil_host_js)
}

/// Builds the JS injected as an `initialization_script()` into the Tauri-managed login
/// surface's VISIBLE builder ONLY (`humble_login_open`'s `if visible` block), deliberately
/// WITHOUT a `#[cfg(target_os = "macos")]` gate (D-2, quick task 260822-di1). (The macOS sheet
/// chrome -- cancel strip, origin banner, scrollbar inset -- was once injected alongside it;
/// quick-261029-osq replaced all three with the native bar, `install_native_login_bar`.) This
/// script substitutes for nothing platform-specific: Humble's
/// marketing footer and navbar are visual noise on the login page on Windows and Linux too, so
/// it is injected on every platform, unconditionally, inside the `if visible` block.
///
/// Purpose: CSS hiding is chosen over DOM surgery because it is fail-safe -- if Humble re-skins
/// and either selector stops matching, the page renders unchanged instead of breaking, and the
/// two rules fail independently of each other (260822-eib D-1: two separate declaration
/// blocks, not one comma-joined selector list, so a syntax error in one never drops the
/// other). Reversal is a one-line edit to a single shared constant
/// (`src/common/humble/loginChromeCss.ts`'s `HUMBLE_LOGIN_CHROME_CSS`, this function's
/// drift-pinned counterpart). The optional wrapper-padding tighten from the originating task
/// brief was declined (D-1, `loginChromeCss.ts`'s own doc comment) -- there is no measured
/// baseline for that padding, so any override would be an unverifiable guess. This now covers
/// two full-width page-chrome selectors (`footer.site-footer`, `.simple-navbar`), not one
/// (260822-eib).
///
/// Takes no arguments and interpolates nothing -- there is no `serde_json::to_string`
/// placeholder-token step here, because there is no untrusted or caller-supplied value
/// anywhere in this script's body.
///
/// Contract this script implements (T-di1-01..06, quick task 260822-di1's threat register):
/// - **Top-frame only.** The FIRST statement inside the try is `if (window.top !== window) {
///   return; }`, the house discipline (spike 013 measured 5 of 8
///   navigation events on Humble's real login page as third-party iframes).
/// - **Host gate runs BEFORE the idempotence flag (D-3).** This is a deliberate divergence
///   from the flag-then-work order the retired chrome scripts used: on `accounts.google.com` (or
///   any other host this runner-agnostic window opens -- `humble_login_open` takes no
///   `runner` argument) the script returns immediately after the host check and touches
///   NOTHING, not even a `window` property -- the same "a non-participating document leaves
///   no state behind" discipline the top-frame guard above already encodes for subframes.
///   Anchored via `host.slice(-SUFFIX.length) !== SUFFIX`, never `indexOf` -- a substring test
///   would also match the look-alike host `humblebundle.com.evil.example` (T-di1-02).
/// - Idempotent via `window.__GAMELIB_LOGIN_CHROME_CSS__`, set before any further DOM work.
/// - Sets exactly ONE `<style>` element's `.textContent` -- never an HTML-fragment-write API
///   of any kind. The CSS text below is byte-identical to `HUMBLE_LOGIN_CHROME_CSS`
///   (`src/common/humble/loginChromeCss.ts`); `loginChromeCssInjection.test.ts` pins this with
///   a byte-equality drift check, proven RED against a synthetic mismatched literal (T-di1-06).
/// - **Retry for document-start root absence (D-4), not for a hostile page.** An
///   `initialization_script` runs at document-start, when `document.head` may not exist yet,
///   so a bare `build()` would silently no-op and the CSS would never apply for that document.
///   The `document.readyState === 'loading'` -> `document.onreadystatechange` arm (a PROPERTY
///   ASSIGNMENT, never `addEventListener`) closes that gap the same way
///   the retired chrome scripts did, and the debounced `MutationObserver` closes the
///   re-append case for free.
/// - Registers NO listener of any kind, of ANY type -- `document.onreadystatechange` is a
///   property assignment, not a registration -- so REQ-34.4.2-06 (Cmd+V into the password
///   field must keep working) holds by construction here, not merely by omission of the
///   specific key names (T-di1-01).
/// - Never reads any input's `value`, transmits nothing anywhere, creates no iframe
///   (T-di1-01).
/// - Whole body in exactly ONE top-level `try { } catch (e) { }` (T-di1-03) -- a throwing
///   script must never break a live, credential-bearing login page.
/// - Pure: calling this twice yields byte-identical output.
///
/// Uses this file's `concat!`-of-single-line-pieces discipline (matching this file's other injected scripts'
/// own convention) -- every JS string literal below is single-quoted, so every piece keeps an
/// EVEN raw `"`-count on its own source line (`longRunningChannels.test.ts`'s WR-08
/// stripper-integrity guard).
pub(crate) fn login_chrome_css_script() -> String {
    concat!(
        "(function() { ",
        "try { ",
        "if (window.top !== window) { return; } ",
        "var SUFFIX = '.humblebundle.com'; ",
        "var host = location.hostname || ''; ",
        "if (host !== 'humblebundle.com' && host.slice(-SUFFIX.length) !== SUFFIX) { return; } ",
        "if (window.__GAMELIB_LOGIN_CHROME_CSS__) { return; } ",
        "window.__GAMELIB_LOGIN_CHROME_CSS__ = true; ",
        "var ID = '__gamelib_login_chrome_css__'; ",
        "function build() { ",
        "var buildRoot = document.head || document.documentElement; ",
        "if (!buildRoot) { return; } ",
        "var style = document.createElement('style'); ",
        "style.id = ID; ",
        "style.textContent = 'footer.site-footer { display: none !important; } .simple-navbar { display: none !important; }'; ",
        "buildRoot.appendChild(style); ",
        "} ",
        "function ensure() { ",
        "if (!document.getElementById(ID)) { build(); } ",
        "} ",
        "if (document.readyState === 'loading') { ",
        "document.onreadystatechange = function() { ensure(); }; ",
        "} ",
        "var debounceTimer = null; ",
        "function scheduleEnsure() { ",
        "if (debounceTimer) { return; } ",
        "debounceTimer = setTimeout(function() { debounceTimer = null; ensure(); }, 200); ",
        "} ",
        "var observer = new MutationObserver(function() { scheduleEnsure(); }); ",
        "observer.observe(document.documentElement, { childList: true, subtree: true }); ",
        "ensure(); ",
        "} catch (e) { } ",
        "})();"
    )
    .to_string()
}

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

// ---- Pristine Epic login webview (bounded "pristine-webview attempt", checkpoint response,
// 2026-08-03T18:00:00 superseding cycle, F-34.5-G6-01) ----
//
// User-directed bounded attempt: build Epic's login window as a raw WKWebView with ZERO Tauri
// initialization-script injection, so Talon (Epic's anti-bot) sees a Safari-like `window`
// surface instead of the CONFIRMED root cause (`window.isTauri`, `__TAURI_INTERNALS__`,
// `window.ipc`, 8 `__TAURI_PLUGIN_*`/`__TAURI_IIFE__` keys, notification-plugin `Notification`
// override -- proven non-configurable AND non-writable via 3-arm fingerprint elimination,
// debug file Evidence 2026-08-02). SIDLogin stays untouched as the working, live-verified
// primary path -- this is Epic's ALTERNATIVE tile only.
//
// MECHANISM: `tauri::WebviewWindowBuilder` (used by every other arm below, including THIS SAME
// arm for non-Epic runners) ALWAYS injects Tauri's core.js -- there is no public builder flag to
// suppress it, and the project's OWN `unstable` multiwebview spike confirmed even a
// Tauri-MANAGED CHILD webview still gets `window.__TAURI__`
// (`.claude/skills/spike-findings-gamelib/references/tauri-embedded-store-browser.md`,
// "window.__TAURI__ is injected into the remote store origin"). The only way to get a
// genuinely pristine WKWebView under this app is to bypass Tauri's webview construction
// entirely: build a WEBVIEW-LESS `tauri::WindowBuilder` window (native chrome only --
// title/size/center/close-detection are all `Window`-level, not `Webview`-level, APIs, so they
// still work) and construct a raw `WKWebView` ourselves via `objc2-web-kit` (already a project
// dependency -- see `humble_login_clear_cookies`'s own `with_webview()` +
// `objc2_web_kit::WKWebView` cast above for the established precedent of direct native WebKit
// access in this file), attached as the window's content view's only subview, with our OWN
// `WKNavigationDelegate` (via `objc2::define_class!`, pattern copied from wry's own
// `WryNavigationDelegate` -- `wry-0.55.1/src/wkwebview/class/wry_navigation_delegate.rs`, the
// exact same crate/version already vendored here) instead of Tauri's.
//
// CAPTURE MECHANISM SIMPLIFICATION: the Tauri-managed webview's only Rust-visible navigation
// signal was `on_page_load`, which never fires for the silently-refused localhost redirect --
// this investigation's own POST-AUTH root cause. This delegate uses
// `decidePolicyForNavigationAction`, which WebKit calls for EVERY
// navigation ATTEMPT, including ones it will go on to silently refuse -- so Epic's real
// `http://localhost:PORT/?code=...` redirect attempt is directly, natively observable, no
// in-page JS relay needed at all. Confirmed against `matchOAuthRedirect`
// (`backend/sidecar/oauthLoginCapture.ts`, `legendary` case): it requires ONLY
// `hostname === 'localhost'` + a non-empty `code` param, so pushing the FULL captured url as a
// `'finished'` `LoginWindowNavEvent` (the exact shape `push_login_window_event`/
// `login_event_value` already produce for every other runner's `on_page_load` hook) needs ZERO
// changes to `matchOAuthRedirect`, `oauthLoginCapture.ts`, `useTauriOAuthLogin.ts`, or
// `LoginWindowSeam` -- this delegate is a drop-in alternate PRODUCER for the same event queue,
// never a new consumer contract.
//
// SCOPE: Epic-only (`is_epic_login`, computed by the caller), macOS-only (`#[cfg(target_os =
// "macos")]`) -- GOG/Amazon/Humble and Epic-on-non-macOS keep the existing
// `WebviewWindowBuilder` path in this same arm, completely untouched.
//
// KNOWN, DELIBERATE SIMPLIFICATIONS for this bounded attempt (documented, not hidden):
//   - The navigation delegate is intentionally LEAKED (`std::mem::forget`) rather than tracked
//     in a label-keyed side table: `setNavigationDelegate` is a WEAK property (the vendored
//     `objc2-web-kit` binding's own doc comment), so an un-leaked delegate would be deallocated
//     the instant this function returns, silently breaking capture. A per-window delegate leak
//     is a small, bounded cost (one login window per attempt, closed by the user) -- acceptable
//     for a single bounded experiment, called out here rather than solved with a bigger
//     cross-thread-safe registry this cycle does not need.
//   - No `on_document_title_changed` equivalent -- the title is set once, from the opened
//     origin, and never updated. Cosmetic only, not needed to prove or disprove the 403
//     hypothesis.
//   - RESOLVED 2026-08-03 (live testing found the login hangs after the password step): the
//     delegate below now implements `WKUIDelegate` too, so JS `alert`/`confirm`/`prompt` present
//     real native `NSAlert` panels instead of silently hanging, and `window.open`/`target=_blank`
//     navigations (`targetFrame() == nil`, otherwise silently dropped by WebKit with no
//     UIDelegate) load into this SAME webview via `createWebViewWithConfiguration:` rather than
//     opening a second window -- `decidePolicyForNavigationAction` below does the identical
//     redirect as a belt-and-braces second layer.
#[cfg(target_os = "macos")]
use objc2::rc::Retained;
#[cfg(target_os = "macos")]
use objc2::runtime::{AnyObject, Bool, NSObject, ProtocolObject};
#[cfg(target_os = "macos")]
use objc2::{define_class, msg_send, DeclaredClass, MainThreadOnly};
#[cfg(target_os = "macos")]
use objc2_foundation::{NSObjectProtocol, NSPoint, NSRect, NSSize, NSString, NSURLRequest, NSURL};
#[cfg(target_os = "macos")]
use objc2_web_kit::{
    WKFrameInfo, WKNavigation, WKNavigationAction, WKNavigationActionPolicy, WKNavigationDelegate,
    WKUIDelegate, WKWebView, WKWebViewConfiguration, WKWindowFeatures,
};

#[cfg(target_os = "macos")]
struct EpicPristineNavDelegateIvars {
    event_label: String,
}

#[cfg(target_os = "macos")]
define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = EpicPristineNavDelegateIvars]
    struct EpicPristineNavDelegate;

    unsafe impl NSObjectProtocol for EpicPristineNavDelegate {}

    unsafe impl WKNavigationDelegate for EpicPristineNavDelegate {
        #[unsafe(method(webView:decidePolicyForNavigationAction:decisionHandler:))]
        fn navigation_policy(
            &self,
            webview: &WKWebView,
            action: &WKNavigationAction,
            handler: &block2::Block<dyn Fn(WKNavigationActionPolicy)>,
        ) {
            // Mirrors this file's OTHER `on_navigation` cancellation arms
            // (`humble_reveal_post`): never `eprintln!`s the captured url
            // (T-34.4.1-21/T-28-04) -- it is a live OAuth authorization code.
            let url_string = unsafe {
                action
                    .request()
                    .URL()
                    .and_then(|u| u.absoluteString())
                    .map(|s| s.to_string())
                    .unwrap_or_default()
            };
            let is_redirect_attempt = tauri::Url::parse(&url_string)
                .map(|parsed| parsed.host_str() == Some("localhost"))
                .unwrap_or(false);
            if is_redirect_attempt {
                push_login_window_event(
                    self.ivars().event_label.as_str(),
                    login_event_value("finished", &url_string),
                );
                (*handler).call((WKNavigationActionPolicy::Cancel,));
                return;
            }
            // New-window navigations (`targetFrame` nil: `window.open`/`target=_blank`) are NOT
            // redirected here. `WKUIDelegate::createWebViewWithConfiguration:` below is the
            // documented hook and handles them. A nil-`targetFrame` cancel-and-reload arm lived
            // here briefly (2026-08-03) and blanked the window: WebKit reports a nil `targetFrame`
            // for the FIRST main-frame load of a fresh `WKWebView` too -- the frame does not exist
            // yet -- so the initial `loadRequest` cancelled and re-issued itself forever and Epic's
            // page never rendered. Live-confirmed regression; do not reinstate.
            //
            // Observability parity with every OTHER runner's `on_page_load` hook, which pushes one
            // event per main-frame navigation. `oauthLoginCapture`'s poll loop logs the HOSTNAME
            // ONLY (T-34.5-G6-11) and de-duplicates consecutive same-host lines, so a live
            // authorization code can never reach the log through this path, and a non-matching
            // event is simply logged and dropped by `matchOAuthRedirect`. Without this the
            // pristine window was the ONLY login window in the app that logged no navigation at
            // all: the 2026-08-03T20:13 live timeout could not be diagnosed because nothing
            // recorded whether Epic ever attempted its post-password redirect. Main frame only --
            // this method also fires for every iframe (Epic's login embeds several), which would
            // swamp the log and defeat the de-duplication.
            let is_main_frame = unsafe {
                action
                    .targetFrame()
                    .map(|frame| frame.isMainFrame())
                    .unwrap_or(false)
            };
            if is_main_frame {
                push_login_window_event(
                    self.ivars().event_label.as_str(),
                    login_event_value("nav", &url_string),
                );
            }
            (*handler).call((WKNavigationActionPolicy::Allow,));
        }

        // quick-261029-osq: keeps the GOG sheet's native bar origin label current. Reads the
        // COMMITTED main-frame URL from the webview (a shell-side value, never page content or
        // the document title -- T-osq-01). WebKit calls this on the main thread, so the registry
        // is updated directly. A no-op for Epic, which has no bar registered.
        #[unsafe(method(webView:didCommitNavigation:))]
        fn did_commit_navigation(&self, webview: &WKWebView, _navigation: Option<&WKNavigation>) {
            let committed = unsafe {
                webview
                    .URL()
                    .and_then(|u| u.absoluteString())
                    .map(|s| s.to_string())
            };
            if let Some(parsed) = committed.and_then(|u| tauri::Url::parse(&u).ok()) {
                set_native_login_bar_origin_on_main(
                    self.ivars().event_label.as_str(),
                    &parsed.origin().ascii_serialization(),
                );
            }
        }
    }

    unsafe impl WKUIDelegate for EpicPristineNavDelegate {
        // `window.open`/`target=_blank` navigations otherwise silently refused by WebKit (see
        // `navigation_policy`'s own comment above) -- this is the DOCUMENTED hook
        // (`WKUIDelegate`'s own doc comment: "If you do not implement this method, the web view
        // will cancel the navigation"). Never creates a second window: loads the popup's request
        // into the SAME webview that asked for it and returns `None` so WebKit never allocates a
        // second `WKWebView`.
        #[unsafe(method_id(webView:createWebViewWithConfiguration:forNavigationAction:windowFeatures:))]
        fn create_web_view_for_navigation_action(
            &self,
            webview: &WKWebView,
            _configuration: &WKWebViewConfiguration,
            action: &WKNavigationAction,
            _window_features: &WKWindowFeatures,
        ) -> Option<Retained<WKWebView>> {
            unsafe {
                webview.loadRequest(&action.request());
            }
            None
        }

        // Without a `WKUIDelegate`, JS `alert()` is a silent no-op (the module doc comment's now-
        // resolved "KNOWN, DELIBERATE SIMPLIFICATION" above) -- live testing found this is why
        // Epic's login hangs after the password step. Presents a real modal `NSAlert` and always
        // calls the completion handler exactly once, on every path.
        #[unsafe(method(webView:runJavaScriptAlertPanelWithMessage:initiatedByFrame:completionHandler:))]
        fn run_js_alert(
            &self,
            _webview: &WKWebView,
            message: &NSString,
            _frame: &WKFrameInfo,
            completion_handler: &block2::Block<dyn Fn()>,
        ) {
            if let Some(mtm) = objc2::MainThreadMarker::new() {
                present_native_js_alert(mtm, &message.to_string());
            }
            (*completion_handler).call(());
        }

        /// Same rationale as `run_js_alert` above, for JS `confirm()`. Always calls the
        /// completion handler exactly once.
        #[unsafe(method(webView:runJavaScriptConfirmPanelWithMessage:initiatedByFrame:completionHandler:))]
        fn run_js_confirm(
            &self,
            _webview: &WKWebView,
            message: &NSString,
            _frame: &WKFrameInfo,
            completion_handler: &block2::Block<dyn Fn(Bool)>,
        ) {
            let confirmed = objc2::MainThreadMarker::new()
                .map(|mtm| present_native_js_confirm(mtm, &message.to_string()))
                .unwrap_or(false);
            (*completion_handler).call((Bool::from(confirmed),));
        }

        /// Same rationale as `run_js_alert` above, for JS `prompt()`. Always calls the completion
        /// handler exactly once: a live `NSTextField` accessory view collects the entered text on
        /// OK, `nil` on Cancel or if no main-thread marker is available (never dropped either
        /// way).
        #[unsafe(method(webView:runJavaScriptTextInputPanelWithPrompt:defaultText:initiatedByFrame:completionHandler:))]
        fn run_js_prompt(
            &self,
            _webview: &WKWebView,
            prompt: &NSString,
            default_text: Option<&NSString>,
            _frame: &WKFrameInfo,
            completion_handler: &block2::Block<dyn Fn(*mut NSString)>,
        ) {
            let default_text_owned = default_text.map(|s| s.to_string()).unwrap_or_default();
            let entered = objc2::MainThreadMarker::new().and_then(|mtm| {
                present_native_js_prompt(mtm, &prompt.to_string(), &default_text_owned)
            });
            match entered {
                Some(text) => {
                    let ns_text = NSString::from_str(&text);
                    (*completion_handler).call((Retained::as_ptr(&ns_text) as *mut NSString,));
                }
                None => (*completion_handler).call((std::ptr::null_mut(),)),
            }
        }
    }
);

#[cfg(target_os = "macos")]
impl EpicPristineNavDelegate {
    fn new(event_label: String, mtm: objc2::MainThreadMarker) -> Retained<Self> {
        let delegate = mtm
            .alloc::<EpicPristineNavDelegate>()
            .set_ivars(EpicPristineNavDelegateIvars { event_label });
        unsafe { msg_send![super(delegate), init] }
    }
}

/// Presents a native, modal `NSAlert` for JS `alert()` (single OK button). Runs synchronously
/// (`runModal`) -- WebKit always invokes `WKUIDelegate` methods on the main thread, so this never
/// competes with the `run_on_main_thread` dispatch `open_pristine_epic_login_window` uses for
/// setup, only with itself (and only one modal alert can be on-screen at a time regardless).
#[cfg(target_os = "macos")]
fn present_native_js_alert(mtm: objc2::MainThreadMarker, message: &str) {
    let alert = objc2_app_kit::NSAlert::new(mtm);
    alert.setMessageText(&NSString::from_str(message));
    alert.addButtonWithTitle(&NSString::from_str("OK"));
    alert.runModal();
}

/// Presents a native, modal `NSAlert` for JS `confirm()` (OK/Cancel). Returns `true` only when
/// the user picked the first ("OK") button.
#[cfg(target_os = "macos")]
fn present_native_js_confirm(mtm: objc2::MainThreadMarker, message: &str) -> bool {
    let alert = objc2_app_kit::NSAlert::new(mtm);
    alert.setMessageText(&NSString::from_str(message));
    alert.addButtonWithTitle(&NSString::from_str("OK"));
    alert.addButtonWithTitle(&NSString::from_str("Cancel"));
    alert.runModal() == objc2_app_kit::NSAlertFirstButtonReturn
}

/// Presents a native, modal `NSAlert` for JS `prompt()` (OK/Cancel plus a single-line
/// `NSTextField` accessory view seeded with `default_text`). Returns the entered text on OK,
/// `None` on Cancel -- matching `WKUIDelegate`'s own documented completion-handler contract
/// ("Pass the entered text if the user chose OK, otherwise nil").
#[cfg(target_os = "macos")]
fn present_native_js_prompt(
    mtm: objc2::MainThreadMarker,
    prompt: &str,
    default_text: &str,
) -> Option<String> {
    let alert = objc2_app_kit::NSAlert::new(mtm);
    alert.setMessageText(&NSString::from_str(prompt));
    alert.addButtonWithTitle(&NSString::from_str("OK"));
    alert.addButtonWithTitle(&NSString::from_str("Cancel"));

    let field_frame = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(300.0, 24.0));
    let text_field = objc2_app_kit::NSTextField::initWithFrame(mtm.alloc(), field_frame);
    text_field.setStringValue(&NSString::from_str(default_text));
    alert.setAccessoryView(Some(&text_field));

    if alert.runModal() == objc2_app_kit::NSAlertFirstButtonReturn {
        Some(text_field.stringValue().to_string())
    } else {
        None
    }
}

/// Builds Epic's login window as a genuinely pristine WKWebView (no Tauri injection at all --
/// see the module-level doc comment above this function for the full mechanism and rationale).
/// Runs on whatever thread `dispatch_rust_channel` itself runs on (a spawned worker thread, per
/// this arm's own established convention -- see `humble_login_clear_cookies`'s threading doc
/// comment above) and internally hops to the OS main thread via `AppHandle::run_on_main_thread`
/// for every objc2/AppKit/WebKit call, exactly the "worker blocks on a channel, main thread does
/// the real work" shape `humble_login_clear_cookies` already established for this same
/// main-thread-confinement problem.
#[cfg(target_os = "macos")]
fn open_pristine_epic_login_window(
    app: &AppHandle,
    label: &str,
    url: tauri::Url,
    visible: bool,
    user_agent: &str,
    as_sheet: bool,
) -> Result<Value, String> {
    let origin = url.origin().ascii_serialization();
    let event_label = label.to_string();

    // quick-261029-o1w: `as_sheet` builds the window ordered-out (not visible, not focused,
    // not centred) so `beginSheet:` is the call that reveals it. `as_sheet == false` is
    // Epic's free-floating path and is unchanged.
    let mut window_builder = tauri::WindowBuilder::new(app, label).visible(visible && !as_sheet);
    if visible {
        // The GOG sheet uses the 464x592 size every other login sheet uses (the
        // `humble_login_open` arm's own `.inner_size(464.0, 592.0)`); Epic stays 900x700.
        window_builder = if as_sheet {
            window_builder.inner_size(464.0, 592.0)
        } else {
            window_builder.inner_size(900.0, 700.0)
        };
        window_builder = window_builder
            .theme(Some(tauri::Theme::Light))
            .title(login_window_title(&origin, None));
        if !as_sheet {
            window_builder = window_builder.center().focused(true);
        }
    }
    let window = window_builder
        .build()
        .map_err(|e| format!("humble_login_open:pristine:build-failed:{e}"))?;

    // SAFETY (Send across the `run_on_main_thread`/`on_window_event` boundaries in this
    // function): a raw pointer value is not normally `Send`, but this is a bare address,
    // reconstructed into a live reference only from within a main-thread closure. Reused for two
    // addresses: the webview's content-view pointer just below, and (further down) the `NSEvent`
    // local monitor token the Cmd+V/C/X/A/Z fix installs.
    struct SendPtr(*mut std::ffi::c_void);
    unsafe impl Send for SendPtr {}

    // Cmd+V (and Cmd+C/X/A/Z) key-equivalent fix: holds the `NSEvent` local monitor token once
    // it's installed (further below, after the webview exists) so the close hook just below can
    // remove it via `NSEvent::removeMonitor`. Unlike `EpicPristineNavDelegate` -- which this
    // section's own doc comment above deliberately `std::mem::forget`s for the app's whole
    // lifetime -- a leaked monitor would keep intercepting Cmd+V/C/X/A/Z key-down events
    // app-wide (scoped out by the key-window check below, but still running on every keystroke)
    // for as long as the process lives, so it MUST be torn down on close instead.
    let monitor_slot: Arc<Mutex<Option<SendPtr>>> = Arc::new(Mutex::new(None));

    // Close-detection: IDENTICAL mechanism/semantics to the existing arm's own
    // `WindowEvent::Destroyed` hook (Quick task 260803-eee Task 5) -- same queue, same helper,
    // same "closed" event shape, so `oauthLoginCapture.ts`'s cancel-on-close branch needs no
    // changes for this window either.
    let close_event_label = event_label.clone();
    let monitor_slot_for_close = Arc::clone(&monitor_slot);
    let app_for_close = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            push_login_window_event(&close_event_label, login_event_value("closed", ""));
            // Tear down the Cmd+V/C/X/A/Z local event monitor, if the main-thread setup below
            // ever installed one -- see `monitor_slot`'s doc comment above.
            if let Ok(mut guard) = monitor_slot_for_close.lock() {
                if let Some(monitor_ptr) = guard.take() {
                    let _ = app_for_close.run_on_main_thread(move || {
                        // Forces Rust 2021 disjoint closure capture to move in the WHOLE
                        // `SendPtr` wrapper (same reason as the `ns_view_addr` rebinding above),
                        // not just its inner `*mut c_void` field, which would bypass the
                        // wrapper's `Send` impl entirely and fail to compile.
                        let monitor_ptr = monitor_ptr;
                        // SAFETY: `monitor_ptr` is the address
                        // `addLocalMonitorForEventsMatchingMask:handler:` returned below;
                        // `removeMonitor:` is the documented way to release it, and this is the
                        // only call site that ever does so for this token.
                        let monitor: &AnyObject = unsafe { &*(monitor_ptr.0 as *const AnyObject) };
                        unsafe {
                            objc2_app_kit::NSEvent::removeMonitor(monitor);
                        }
                    });
                }
            }
        }
    });

    let ns_view_ptr = window
        .ns_view()
        .map_err(|e| format!("humble_login_open:pristine:ns_view-failed:{e}"))?;
    // SAFETY: see `SendPtr`'s doc comment above -- reconstructed into a live reference only
    // INSIDE the main-thread closure below, which is guaranteed to run before `window` (still
    // alive on THIS function's own stack via the blocking `rx.recv_timeout` below) could
    // possibly be dropped.
    let ns_view_addr = SendPtr(ns_view_ptr);
    let url_string = url.to_string();
    let user_agent_owned = user_agent.to_string();
    let main_thread_label = event_label.clone();
    let monitor_slot_for_main = Arc::clone(&monitor_slot);
    let app_for_native_cancel = app.clone();
    let origin_for_bar = origin.clone();

    let (tx, rx) = mpsc_channel::<Result<(), String>>();
    if let Err(e) = app.run_on_main_thread(move || {
        // Forces Rust 2021 disjoint closure capture to move in the WHOLE `SendPtr` wrapper
        // (which has an explicit `unsafe impl Send`), not just its inner `*mut c_void` field --
        // without this rebinding, precise capture analysis captures `ns_view_addr.0` directly
        // (since that's the only path ever referenced below), bypassing the wrapper's `Send`
        // impl entirely and failing to compile.
        let ns_view_addr = ns_view_addr;
        let result: Result<(), String> = (|| {
            let mtm = objc2::MainThreadMarker::new()
                .ok_or_else(|| "humble_login_open:pristine:no-main-thread-marker".to_string())?;
            // SAFETY: `ns_view_addr` was obtained from this SAME window's `ns_view()` just
            // before dispatch, on the same call this closure is part of -- the window (and
            // therefore its content view) is still alive, since the caller is blocked on
            // `rx.recv_timeout` below and cannot have dropped it yet.
            let ns_view: &objc2_app_kit::NSView =
                unsafe { &*(ns_view_addr.0 as *const objc2_app_kit::NSView) };
            let frame = ns_view.frame();

            let config = unsafe { WKWebViewConfiguration::new(mtm) };
            let webview: Retained<WKWebView> = unsafe {
                WKWebView::initWithFrame_configuration(mtm.alloc(), frame, &config)
            };
            webview.setAutoresizingMask(
                objc2_app_kit::NSAutoresizingMaskOptions::ViewWidthSizable
                    | objc2_app_kit::NSAutoresizingMaskOptions::ViewHeightSizable,
            );
            unsafe {
                webview.setCustomUserAgent(Some(&NSString::from_str(&user_agent_owned)));
            }
            // Dev-only Web Inspector, gated identically to this file's existing
            // `window.open_devtools()` gate for the main (Tauri-managed) webview above -- the key
            // diagnostic tool for the NEXT live run of this window. `setInspectable` is
            // WKWebView-macOS-13.3+; unavailable in release builds, matching the project's
            // existing debug-only devtools convention.
            #[cfg(debug_assertions)]
            unsafe {
                webview.setInspectable(true);
            }

            let delegate = EpicPristineNavDelegate::new(main_thread_label.clone(), mtm);
            unsafe {
                webview.setNavigationDelegate(Some(ProtocolObject::from_ref(&*delegate)));
            }
            // Intentional leak -- see this section's "KNOWN, DELIBERATE SIMPLIFICATIONS" doc
            // comment above.
            std::mem::forget(delegate);

            ns_view.addSubview(&webview);
            // quick-261029-osq: the sheet's native bar (shared with the injected sheets) insets
            // the webview below its 32pt band; Epic (`as_sheet == false`) gets none and its
            // webview keeps filling the window.
            if as_sheet {
                install_native_login_bar(
                    ns_view,
                    &webview,
                    &origin_for_bar,
                    app_for_native_cancel.clone(),
                    main_thread_label.clone(),
                    mtm,
                );
            }
            // Paste (Cmd+V) -- and every other Edit-menu key equivalent -- routes via
            // `[NSApp sendAction:to:from:]` to the KEY window's first responder; `addSubview`
            // alone does not promote the new subview into the responder chain. Without this, the
            // long password this window exists to let the user paste (rather than hand-type)
            // silently goes nowhere. `tauri-2.11.5/src/app.rs` (`Builder::build`,
            // `enable_macos_default_menu` defaults to `true`, `Menu::default`'s own "Edit" submenu
            // already includes `PredefinedMenuItem::paste`) confirms this app already gets a
            // standard macOS Edit menu for free -- `main()` never calls `.menu(...)` or
            // `.enable_macos_default_menu(false)`, so no new menu needs building here, only this
            // first-responder promotion.
            if let Some(ns_window) = ns_view.window() {
                if !ns_window.makeFirstResponder(Some(&webview)) {
                    shell_eprintln!(
                        "[shell] WARN: humble_login_open:pristine: makeFirstResponder declined for '{main_thread_label}' -- paste may not reach the login form"
                    );
                }

                // Key-equivalent delivery fix (live-confirmed 2026-08-03): choosing Edit > Paste
                // from the menu bar pastes into the login form correctly -- proving the webview
                // IS first responder and DOES handle `paste:` -- but pressing Cmd+V does nothing.
                // The gap is purely in *key-equivalent delivery*: tao's `NSWindow` subclass
                // consumes the raw Cmd+V `NSEvent` before AppKit's `performKeyEquivalent:`
                // main-menu traversal ever sees it (a known class of tao/wry issue). Rather than
                // patch tao, install a narrowly-scoped local event monitor that re-dispatches the
                // five standard Edit-menu actions through the EXACT SAME `sendAction:to:from:`
                // path the menu bar itself already uses successfully, and let every other event
                // -- including these same shortcuts in every OTHER window -- fall through
                // completely unchanged.
                let monitor_ns_window = ns_window.clone();
                let monitor_handler = block2::RcBlock::new(
                    move |event: std::ptr::NonNull<
                        objc2_app_kit::NSEvent,
                    >|
                          -> *mut objc2_app_kit::NSEvent {
                        // SAFETY: AppKit hands local monitor handlers a valid, live `NSEvent`
                        // for the duration of this call.
                        let event_ref = unsafe { event.as_ref() };
                        let flags = event_ref.modifierFlags();
                        // Command held, WITHOUT Control/Option, so this never steals any other
                        // chord (e.g. Cmd+Opt+I devtools).
                        let is_plain_command = flags
                            .contains(objc2_app_kit::NSEventModifierFlags::Command)
                            && !flags.intersects(
                                objc2_app_kit::NSEventModifierFlags::Control
                                    | objc2_app_kit::NSEventModifierFlags::Option,
                            );
                        let action = is_plain_command
                            .then(|| event_ref.charactersIgnoringModifiers())
                            .flatten()
                            .map(|s| s.to_string().to_lowercase())
                            .and_then(|s| match s.as_str() {
                                "v" => Some(objc2::sel!(paste:)),
                                "c" => Some(objc2::sel!(copy:)),
                                "x" => Some(objc2::sel!(cut:)),
                                "a" => Some(objc2::sel!(selectAll:)),
                                "z" => Some(objc2::sel!(undo:)),
                                _ => None,
                            });
                        if let Some(sel) = action {
                            if let Some(mtm) = objc2::MainThreadMarker::new() {
                                let ns_app = objc2_app_kit::NSApplication::sharedApplication(mtm);
                                // SAFETY: `mtm` proves this handler is running on the main
                                // thread, as AppKit guarantees for local monitor callbacks.
                                let is_this_window = ns_app.keyWindow().is_some_and(|key_window| {
                                    std::ptr::eq(&*key_window, &*monitor_ns_window)
                                });
                                if is_this_window {
                                    // SAFETY: `sel` is one of the five hardcoded, valid Cocoa
                                    // selectors above; nil target/sender lets AppKit walk the
                                    // normal responder chain, exactly like the Edit menu's own
                                    // items already do successfully.
                                    let _ = unsafe {
                                        ns_app.sendAction_to_from(sel, None, None)
                                    };
                                    // Consumed: every OTHER window (and every non-matching
                                    // event) falls through via the `event.as_ptr()` return below
                                    // instead.
                                    return std::ptr::null_mut();
                                }
                            }
                        }
                        event.as_ptr()
                    },
                );
                // SAFETY: `monitor_handler` is a valid block; AppKit copies it internally when
                // registering the monitor (the standard Cocoa block-parameter convention for
                // handlers a callee stores beyond the call), so it outliving this call is not
                // required.
                let monitor_token = unsafe {
                    objc2_app_kit::NSEvent::addLocalMonitorForEventsMatchingMask_handler(
                        objc2_app_kit::NSEventMask::KeyDown,
                        &monitor_handler,
                    )
                };
                match monitor_token {
                    Some(token) => {
                        // Transfers ownership of the +1 retain count
                        // `addLocalMonitorForEventsMatchingMask:handler:` returned into a bare
                        // address -- NOT a leak, unlike the navigation delegate's
                        // `std::mem::forget` above: `NSEvent::removeMonitor` in the close hook
                        // above is the release, called exactly once, when this window closes.
                        let ptr = Retained::into_raw(token) as *mut std::ffi::c_void;
                        if let Ok(mut guard) = monitor_slot_for_main.lock() {
                            *guard = Some(SendPtr(ptr));
                        }
                    }
                    None => {
                        shell_eprintln!(
                            "[shell] WARN: humble_login_open:pristine: addLocalMonitorForEventsMatchingMask failed for '{main_thread_label}' -- Cmd+V/C/X/A/Z may not reach the login form"
                        );
                    }
                }
            } else {
                shell_eprintln!(
                    "[shell] WARN: humble_login_open:pristine: no NSWindow for '{main_thread_label}' -- cannot promote webview to first responder"
                );
            }

            let nsurl = NSURL::URLWithString(&NSString::from_str(&url_string))
                .ok_or_else(|| "humble_login_open:pristine:bad-nsurl".to_string())?;
            let request = NSURLRequest::requestWithURL(&nsurl);
            unsafe {
                webview.loadRequest(&request);
            }
            Ok(())
        })();
        let _ = tx.send(result);
    }) {
        return Err(format!("humble_login_open:pristine:dispatch-failed:{e}"));
    }

    match rx.recv_timeout(Duration::from_secs(10)) {
        Ok(Ok(())) => {
            shell_eprintln!(
                "[shell] humble_login_open: pristine WKWebView built for '{label}' (zero Tauri injection, F-34.5-G6-01 bounded attempt)"
            );
            Ok(Value::String(label.to_string()))
        }
        Ok(Err(e)) => Err(e),
        Err(_) => Err("humble_login_open:pristine:main-thread-timeout".to_string()),
    }
}

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

