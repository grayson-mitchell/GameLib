//! Devtools auto-open predicate and the dev-only login-window diagnostic init script (Phase 71 D-12). Child of `login_window`; sees its private items.

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
