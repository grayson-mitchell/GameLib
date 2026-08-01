---
status: investigating
trigger: "Tauri Epic login form renders but is non-interactive (F-34.5-G6-01). Discriminator verdict E1 (2026-08-01): the identical EPIC_LOGIN_URL is interactive under Electron (npm start, real login completed, 15 games) and non-interactive under Tauri (pnpm tauri:dev, two full 300s timeouts, single nav host=www.epicgames.com, title bar \"https://www.epicgames.com\", NO visible error text under the stock UA). E2 (Epic-side change independent of the port) is FALSIFIED. R1 (user-agent) was falsified in an earlier contract; R2 (a Chromium-only web API throwing under WKWebView) survives but is UNCONFIRMED because no one has ever seen the login window's JS console. LEAD HYPOTHESIS: main.rs:2476-2487 calls open_devtools() only for the \"main\" webview; the login window (separate WebviewWindowBuilder at main.rs:1387, label loginwin-N-*) never gets it, so its console has been invisible for four cycles. First move: add window.open_devtools() to the login window under #[cfg(debug_assertions)] only, then open Epic under pnpm tauri:dev and read the real console/script error. Prior art: queryLocalFonts is a CONFIRMED instance of a Chromium-only API throwing under WKWebView in this project (.claude/skills/spike-findings-gamelib/references/tauri-chromium-only-web-apis.md). Constraint: do NOT change USER_AGENTS, EPIC_LOGIN_URL, or matchOAuthRedirect - the discriminator's Routing section authorizes instrumentation/diagnosis only, no fix. Plans 34.5-29/30/31 remain HALTED by BINDING DECISION: fix-first; do not create 34.5-LIVE-GATE-RERUN-2.md."
created: 2026-08-01
updated: 2026-08-02T03:30:00
phase: 34.5
finding: F-34.5-G6-01
---

# Epic login form non-interactive under Tauri

## Symptoms

- **Expected behavior:** Clicking Epic in Manage Accounts under `pnpm tauri:dev` opens a login
  window whose form accepts keyboard and mouse input, and the flow completes to a captured OAuth
  redirect.
- **Actual behavior:** The page renders (title bar reads `https://www.epicgames.com`) but the form
  never becomes interactive. The full 300s sidecar deadline elapses and the attempt ends
  `status=timeout`. The `nav host=` sequence never leaves the single hostname
  `www.epicgames.com` — no second hostname is ever reached.

  **CORRECTED 2026-08-02, from a real DOM/Network read (see Evidence 2026-08-02T00:20:00):** every
  prior cycle's phrasing of this symptom — "form not interactive", "greyed out", "non-interactive
  form" — was imprecise and sent the investigation down the wrong path (the Class A/B disabled-vs-
  event-delivery framing from the immediately prior cycle). The actual, DOM-measured state is that
  there is **no form at all**: `document.querySelectorAll('input').length === 0`,
  `document.querySelectorAll('form').length === 0`, `document.querySelectorAll('iframe').length
  === 0`, and `document.body.innerText === ""`. Class A ("Epic's own code disabled its inputs") and
  Class B ("healthy inputs not receiving events") are both wrong on their face — there is nothing
  in the DOM to be disabled or to receive events. What is visually present on screen is a CSS
  skeleton/placeholder pattern (developer, verbatim: "a blank screen with a 'dummy pattern' that
  vaguely looks like a data form that is blurred") — i.e. loading-skeleton styling, not real
  rendered content. `localStorage` and cookies both work in this webview (`cookieLen: 85`,
  `localStorage OK` — see Evidence), so the empty DOM is not a storage-blocked rendering failure of
  the kind ITP would cause.
- **Error messages:** NONE visible in the page under the stock user agent (developer, verbatim:
  "no error text"). The backend log shows only `status=timeout`. The login page's own JavaScript
  console has never been read by anyone, in any cycle.
- **Timeline:** Present across all three of Phase 34.5's live gate runs. Has never worked under
  Tauri. **Works under Electron** — proven 2026-08-01, discriminator verdict `E1`.
- **Reproduction:** `pnpm tauri:dev` (with `GAMELIB_OAUTH_UA_LEGENDARY` unset) → Manage Accounts →
  click Epic → wait. Reproduced on 2/2 attempts on 2026-08-01 at 22:38:17 and 22:43:56.

## Evidence

- timestamp: 2026-08-01T22:38:17
  source: ~/Library/Logs/GameLib/gamelib.log lines 31-40 (Tauri session)
  note: |
    Two attempts, both sitting on a single hostname for their whole life. Attempt 0 reached the
    full 300s deadline exactly (22:38:17 open → 22:43:17 timeout).
    ```
    (22:38:17) [Backend]:  [oauthLoginCapture] runner=legendary label=loginwin-0-<REDACTED>
    (22:38:17) [Backend]:  [oauthLoginCapture] runner=legendary nav host=www.epicgames.com
    (22:43:17) [Backend]:  [oauthLoginCapture] runner=legendary status=timeout
    (22:43:17) [Frontend]: [useTauriOAuthLogin] runner=legendary phase=timeout
    (22:43:54) [Frontend]: [useTauriOAuthLogin] runner=legendary phase=teardown inflight=false
    (22:43:56) [Backend]:  [oauthLoginCapture] runner=legendary label=loginwin-1-<REDACTED>
    (22:43:56) [Backend]:  [oauthLoginCapture] runner=legendary nav host=www.epicgames.com
    ```

- timestamp: 2026-08-01T22:33:44
  source: ~/Library/Logs/GameLib/gamelib.log.old (Electron session, `npm start`)
  note: |
    The CONTROL arm. Same `EPIC_LOGIN_URL` literal, different shell, fully interactive — a real
    login completed and returned a populated library.
    ```
    (22:33:44) [Legendary]: Logging in: ... legendary auth --code <redacted>
    (22:33:51) [Frontend]:  [refreshLibrary] runner=legendary origin=login-success
    (22:34:04) [Legendary]: Game list updated, got 15 games & DLCs
    ```

- timestamp: 2026-08-01T23:00:00
  source: src-tauri/src/main.rs:2476-2487 (direct source read)
  note: |
    `open_devtools()` is called ONLY for the webview labelled "main", under
    `#[cfg(debug_assertions)]`. Its own comment says "the dev webview exposes no right-click
    inspect on macOS" — so an earlier cycle hit the no-inspector wall and solved it for the app's
    own UI only. The login window is a SEPARATE `WebviewWindowBuilder` at main.rs:1387 (label
    `loginwin-N-*`, `WebviewUrl::External`) and never has `open_devtools()` called on it. This is
    why three cycles have reasoned about a suspected JavaScript failure with the JavaScript
    console switched off.

- timestamp: 2026-08-01T22:37:43
  source: ~/Library/Logs/GameLib/gamelib.log lines 1-13 (arm configuration corroboration)
  note: |
    `[bootstrap] secret stores: keyring` — the dev-only secret vault was NOT in use. No
    `user-agent-override len=` line appears, consistent with `GAMELIB_OAUTH_UA_LEGENDARY` unset,
    i.e. the stock agent. This run is the stock-configuration arm.

- timestamp: 2026-08-01T23:15:00
  source: src-tauri/src/main.rs (edit, `humble_login_open` arm, ~line 1469-1484 post-edit) +
    graphify/direct-read confirmation that this arm is shared across all runners
  note: |
    Added `window.open_devtools()` immediately after the login window's `.build()` succeeds,
    gated on `#[cfg(debug_assertions)] if visible { ... }` — same double-gate discipline as
    main.rs:2476-2487's existing "main" webview devtools call. Also logs
    `[shell] humble_login_open: devtools opened for '{label}' (debug build)` so the log itself
    proves the call fired for a specific `loginwin-N-*` label.
    Before writing this, confirmed (not assumed) that `humble_login_open` is NOT Humble-specific
    despite its name: `src/frontend/screens/WebView/components/TauriLoginPanel.tsx:16-18` states
    outright "Nothing about these names is Humble-specific -- the Rust arms this panel's sibling
    seam drives (`humble_login_open` et al...) ... the SAME mechanism serves all five runners"
    (legendary/gog/nile/zoom/humble), and grep confirmed no separate `*_login_open` command
    exists for legendary. This is the exact arm the Evidence log line
    `runner=legendary label=loginwin-0-<REDACTED>` passed through.
    Verification: `cargo check` (src-tauri) compiles with 0 errors. `npx jest
    src/backend/__tests__/tauriShellSource.test.ts` — 46/46 passing, including tests that
    string-match this arm's exact body for absence of `.on_navigation(` and presence-only-inside-
    if-visible-block of the presentation calls; none of those assertions broke.
    STILL OWED: the actual console reading. This is instrumentation only — no root cause is
    confirmed by this entry alone.

- timestamp: 2026-08-01T23:40:00
  source: developer checkpoint response (real hardware, `pnpm tauri:dev`, devtools now wired to the
    login window) + direct read of `src-tauri/capabilities/default.json`
  note: |
    Devtools confirmed working for `loginwin-*` (terminal line
    `[shell] humble_login_open: devtools opened for '...' (debug build)`). Console read for the
    Epic login window contains exactly two errors (everything else is confirmed-benign noise: a
    WebKit viewport-key warning, 7x source-map 403s Epic doesn't serve, 1x 429 on Sentry's
    `envelope` ingest endpoint -- Epic's own error reporter being throttled, contents unknown):
    ```
    [Error] Refused to connect to ipc://localhost/plugin%3Anotification%7Cis_permission_granted
      because it appears in neither the connect-src directive nor the default-src directive of
      the Content Security Policy.
    [Error] Unhandled Promise Rejection: notification.is_permission_granted not allowed on window
      "loginwin-0-<REDACTED>", webview "loginwin-0-<REDACTED>",
      URL: https://www.epicgames.com/id/login?responseType=co...
    ```
    Verified directly against `capabilities/default.json` (not taken on faith): the file's own
    description field is accurate -- `notification:allow-is-permission-granted` is granted, scoped
    `"windows": ["main"]`, and the login window's label (`loginwin-N-*`) matches no capability.

- timestamp: 2026-08-01T23:50:00
  source: direct read of the vendored `tauri` crate (2.11.5, the exact pinned version) and
    `tauri-plugin-notification` crate (2.3.3) sources under
    `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/`
  note: |
    Confirms, from the framework's own source (not inference), that the developer's capability-
    file reading generalizes correctly but for a DIFFERENT mechanism than capabilities:
    `tauri-2.11.5/src/manager/webview.rs::prepare_pending_webview` (called for every
    `WebviewWindowBuilder::build()`, not just "main") collects `app_manager.plugins... .initialization_script()`
    (line 131-135) and unconditionally appends it (line 202: `all_initialization_scripts.extend(plugin_init_scripts)`)
    to `webview_attributes.initialization_scripts` for THAT window -- there is no capability check,
    no window-label check, no opt-out anywhere in this path. Capabilities gate `invoke()` reaching a
    Rust command; they do NOT gate which JS init scripts get injected into a webview. So
    `tauri_plugin_notification::init()`'s `.js_init_script(init-iife.js)` (confirmed in
    `tauri-plugin-notification-2.3.3/src/lib.rs`'s `init()` fn) runs in EVERY webview this app ever
    builds, including `loginwin-N-*`, regardless of `"windows": ["main"]`.
    Read `init-iife.js` (and its pre-build source, `guest-js/init.ts`) directly: it unconditionally
    (a) replaces `window.Notification` with a plugin-owned constructor function plus a
    getter/setter-defined `.permission` property, and (b) self-invokes
    `isPermissionGranted().then(...)` at the bottom of the IIFE with NO ARGUMENT COND ITIONAL ON
    HOST-PAGE BEHAVIOR -- this call fires on every single page load in the main frame of every
    webview, driven entirely by the plugin's own bootstrap, NOT by anything Epic's page does.
    IMPORTANT CORRECTION to the developer's framing: the observed `is_permission_granted`
    rejection is therefore NOT evidence that Epic's own script ever touches `window.Notification` --
    it would appear identically on every runner's login window (GOG, Amazon, Humble) and even on a
    blank page, since it is the plugin polling its own permission state, unprompted. Whether Epic's
    OWN bootstrap code separately touches the clobbered `window.Notification` (e.g. reads
    `.permission`, calls `requestPermission()`, or constructs `new Notification()`) is UNESTABLISHED --
    if it did call `requestPermission()` or construct a `Notification`, we would expect a SECOND,
    DIFFERENT invoke-rejection line (`request_permission` or `notify`) in the console; none appears.
    This weakens (does not confirm or falsify) the "Epic's script touches the clobbered API and
    throws" theory -- absence of a second invoke rejection is consistent with Epic's page never
    calling into Notification at all, which would make the whole notification-plugin mechanism a
    RED HERRING (real, but a latent bug in a different, currently-unobserved code path) rather than
    the cause of THIS symptom.

- timestamp: 2026-08-01T23:55:00
  source: direct read of `tauri-plugin-opener-2.5.4`, `tauri-plugin-dialog-2.7.2`,
    `tauri-plugin-shell-2.3.5`'s vendored `src/init-iife.js` (the other three plugins registered in
    `main.rs`'s `main()` that also call `.js_init_script(...)`, discovered by grepping every
    registered plugin's crate source for the same method -- `updater` and `clipboard-manager`
    register no init script)
  note: |
    Checked for rival hypotheses before trusting the notification theory alone (F-10 discipline).
    `opener`'s script only adds a passive `click` listener (invokes only if an `<a>` is actually
    clicked -- not fired at bootstrap). `shell`'s script does the same for external-link clicks.
    `dialog`'s script DOES clobber two more globals unconditionally: `window.alert` and
    `window.confirm`, both replaced with async, IPC-backed stand-ins -- structurally the same
    shape of bug as notification's clobber, and also ungated by the `"windows": ["main"]` scope
    (same injection mechanism, confirmed above). This is a REAL LATENT BUG for any login page that
    calls `alert()`/`confirm()` during bootstrap. But no `plugin:dialog|message` or
    `plugin:dialog|confirm` CSP-refusal/rejection line appears anywhere in the console read --
    meaning `dialog`'s clobber was never actually exercised in this specific repro. Ruled out as a
    contributor to THIS symptom (not ruled out as a latent bug for a different runner's login
    page in a future session).

- timestamp: 2026-08-02T00:10:00
  source: live hardware, `pnpm tauri:dev` rebuild with `.plugin(tauri_plugin_notification::init())`
    commented out, developer console read (verbatim, complete)
  note: |
    ```
    [Error] Viewport argument key "minimal-ui" not recognized and ignored. (login, line 6)
    [Error] Source Map loading errors (x7)
    [Error] Failed to load resource: the server responded with a status of 403 () (...js.map, x7)
    [Error] Failed to load resource: the server responded with a status of 429 () (envelope, line 0)
    ```
    Developer, verbatim: "did not have interactive login form, greyed out". Two load-bearing facts:
    (1) both previously-observed notification-injection error lines are confirmed gone — the
    removal mechanism worked as designed; (2) the form is STILL non-interactive with a console
    that is now clean of ALL page-script errors (only a benign viewport warning, 7 expected
    source-map 403s, and a 429 on Sentry's own ingest endpoint remain). NOTHING throws. This
    directly falsifies R3 (see Eliminated) and materially weakens R2 as originally framed (see
    below).

- timestamp: 2026-08-02T00:12:00
  source: DISTINCT FINDING — separate from and NOT blocking this investigation, recorded so it is
    not lost
  note: |
    The notification-plugin JS-injection defect is real. `capabilities/default.json`'s
    `notification:allow-is-permission-granted` description implying the grant is "required, not
    optional" for windows outside `"windows": ["main"]` is now known to be a misdiagnosis — the
    actual mechanism is `tauri-2.11.5`'s `prepare_pending_webview` appending every registered
    plugin's `initialization_script()` to EVERY webview unconditionally, bypassing the capability
    scope entirely (see the 2026-08-01T23:50:00 evidence entry above for the framework-source
    citation). This produces an unhandled promise rejection in every non-`main` webview this app
    builds (`loginwin-*` for all five runners: legendary/gog/nile/zoom/humble), independent of
    whatever page is loaded. The developer has authorized removing the JS surface entirely as
    separate, non-blocking cleanup — NOT as part of this investigation's fix.

    PANIC-RISK FLAG for whoever does that cleanup: the developer's own config has
    `notifyHumbleExpirations: true` (`src/backend/humble/expirationAlerts.ts:82`,
    `new Notification({ title, body })` → relayed through `main.rs:1120`'s `app.notification()`
    call). Any future experiment or permanent change that disables
    `.plugin(tauri_plugin_notification::init())` registration without also touching
    `expirationAlerts.ts` risks a startup/runtime panic the moment a Humble key digest fires. The
    diagnostic edit in `main.rs` has been reverted and `cargo check` is clean (0 errors) as of
    this update.

- timestamp: 2026-08-02T00:20:00
  source: live hardware, `pnpm tauri:dev`, developer console read against the pre-registered Class
    A/B + ITP prediction from the prior cycle's Current Focus, DOM one-liners run directly in the
    login window's console, Network/Console filter set to ALL (previous cycles were Errors-only)
  note: |
    DOM state (falsifies Class A/B framing itself, not just the ITP sub-hypothesis):
    ```
    {"inputs":0,"forms":0,"iframes":[],"text":"","cookieLen":85}
    localStorage OK
    ```
    Zero inputs, zero forms, zero iframes, empty `innerText`. There is no form in the DOM to be
    disabled (Class A) or to fail to receive events (Class B) — both branches of the pre-registered
    split presupposed a real form existed, and it does not. `cookieLen: 85` and `localStorage OK`
    prove storage/cookies are NOT blocked in this webview, directly falsifying the pre-registered
    ITP/third-party-storage sub-hypothesis (see Eliminated) on its own stated terms — the
    Falsification clause fires: no disabled-DOM evidence was even available to pair with cross-
    origin trouble, and the storage primitives the theory said would be silently blocked are
    demonstrably not blocked.

    Full console, filter=ALL (previous reads were Errors-only, which is why the two Warnings below
    were never seen in any earlier cycle):
    ```
    [Error] Refused to connect to ipc://localhost/plugin%3Anotification%7Cis_permission_granted
      because it appears in neither the connect-src directive nor the default-src directive of the
      Content Security Policy.
    [Error] Viewport argument key "minimal-ui" not recognized and ignored. (login, line 6)
    [Warning] IPC custom protocol failed, Tauri will now use the postMessage interface instead –
      TypeError: Load failed (user-script:103, line 106)
    TypeError: Load failed
    [Error] Unhandled Promise Rejection: notification.is_permission_granted not allowed on window
      "loginwin-4-18c7c66faa4316e0-a9905812", webview "loginwin-4-...",
      URL: https://www.epicgames.com/id/login?responseType=co...
    [Warning] Parsing application manifest
      https://static-assets-prod.unrealengine.com/account-portal/static/manifest.json: The
      start_url's origin of "https://static-assets-prod.unrealengine.com" is different from the
      document's origin of "https://www.epicgames.com".
    [Warning] WARN – "[Statsig]" – "The user does not have the required id_type \"tracking_uuid\"
      for Gate \"accountportal_-_fe_test\"" (index-BMTfSvFa.js, line 501)
    [Error] Source Map loading errors (x7)  [seven *.js.map 403s — Epic does not serve maps
      publicly; confirmed benign in a prior cycle]
    [Error] Failed to load resource: the server responded with a status of 429 () (envelope, line 0)
    [Warning] x4 font preload-but-unused warnings for Inter*.woff2 from
      static-assets-prod.unrealengine.com
    ```
    The two notification-plugin lines are expected to be present again in this read — the R3
    diagnostic (plugin registration commented out) was correctly reverted at the end of the prior
    cycle. Their presence here is not a regression.

    LOAD-BEARING NEW FACTS, not seen in any prior cycle because filter was Errors-only:
    (1) `[Warning] IPC custom protocol failed, Tauri will now use the postMessage interface instead
    – TypeError: Load failed` at `user-script:103, line 106`, followed by a bare `TypeError: Load
    failed`. `user-script:103` is Tauri's own injected bootstrap (not Epic's bundle, not a
    plugin) — this is the framework's CORE IPC transport initialization failing inside Epic's page,
    a distinct mechanism from the already-falsified R3 (which was the notification plugin's
    `init-iife.js` specifically). This reopens the general "Tauri's injected user-scripts break
    Epic's page" claim as UNRESOLVED — only its notification-specific instance was killed.
    (2) `index-BMTfSvFa.js, line 501` firing a Statsig gate-evaluation warning proves Epic's actual
    application bundle loaded and executed real application logic — the empty DOM is not caused by
    the bundle failing to load or parse.
    (3) `envelope` (Sentry's error-ingest endpoint) returned 429 — rate-limited, meaning enough
    error reports were sent in a short window to trip Sentry's own rate limiter. Read together with
    (2): the bundle ran, threw repeatedly, an error boundary likely caught those throws internally
    (which is why none of them ever appeared as an uncaught console error in four cycles of
    console-only reads), and shipped them to Sentry fast enough to get throttled.

    BENIGN, re-confirmed: viewport `minimal-ui` warning, the 7x source-map 403s, the manifest
    cross-origin warning, the 4x font preload warnings.

- timestamp: 2026-08-02T01:10:00
  source: live hardware, `pnpm tauri:dev`, Safari Web Inspector "Break on All Exceptions" armed in
    the Debugger panel, developer checkpoint response — the FIRST named exception + call stack this
    investigation has produced in any cycle
  note: |
    This is the direct test of THREAD 2's pre-registered prediction (see prior Current Focus). The
    debugger paused. Recorded verbatim, per this project's F-10 discipline (record the raw result
    before reasoning about it):

    PAUSE REASON (verbatim):
    ```
    TypeError: reflect.construct requires the third argument to be a constructor if present
    ```

    CALL STACK (verbatim, top to bottom):
    ```
    c (index-GFazdAUR.js:1442)
    (anonymous function) (index-GFazdAUR.js:1464)
    Pa (index-GFazdAUR.js:48)
    (anonymous function) (index-BMTfSvFa.js:64276)
    ```
    All four frames are inside Epic's own app bundles (`index-GFazdAUR.js`, `index-BMTfSvFa.js`) —
    NOT inside a blackboxed polyfill. Developer confirmed `stable-*`, `es.array.from-*`, `ie11-*`
    were blackboxed for this session and `polyfill-*` did not even load this run, so this is not a
    polyfill artifact being misattributed.

    LOCAL VARIABLES at frame `c`, for the argument at the `newTarget` (third-argument) position of
    the `Reflect.construct` call (verbatim):
    ```
    d: function()
      arguments: TypeError: 'arguments', 'callee', and 'caller' cannot be accessed in this context.
      caller:    TypeError: 'arguments', 'callee', and 'caller' cannot be accessed in this context.
      length: 1
      name: "call"
    ```

    IDENTIFICATION: `name: "call"`, `length: 1`, and the strict-mode-poisoned `arguments`/`caller`
    accessors together identify `d` as `Function.prototype.call` itself (or a bound/wrapped
    derivative of it) — this is the standard fingerprint of a native built-in function read back out
    of the engine, not authored/minified application code (authored code does not have poisoned
    `arguments`/`caller` accessors under normal circumstances the way an intrinsic does). Built-in
    methods have no `[[Construct]]` internal slot, so passing one as `Reflect.construct`'s third
    argument (`newTarget`) throws exactly this `TypeError` — this is engine-correct behavior once a
    non-constructible value reaches that argument position, not evidence of a WKWebView-specific
    behavior in itself.

    STILL OUTSTANDING (requested from developer, not yet received): source at
    `index-BMTfSvFa.js:64276` (~5 lines, minified acceptable) — this is the app-level call site that
    leads into frame `c`, and would name which class Epic's code intended to construct, which in
    turn would name the specific global whose value resolved to `Function.prototype.call` instead
    of a constructor.

    STILL OUTSTANDING (requested from developer, not yet received): whether this pause is caught or
    fatal — i.e., does Resuming through every subsequent paused exception eventually produce a
    rendered form, or does the session run out (300s deadline / manual stop) still on the empty-DOM
    skeleton with no form ever appearing.

    CORRECTION, 2026-08-02T02:00:00 (self-retraction — see Eliminated and Current Focus below): the
    "all four frames are inside Epic's own app bundles" framing above is WRONG in the sense that
    mattered. `index-GFazdAUR.js` LOOKED like an app chunk because of its `index-` filename prefix,
    but the developer-supplied source excerpt (see Eliminated entry below) proves it is a vendored
    core-js chunk, not application code — its three frames (`c`, the anonymous wrapper, `Pa`) are all
    inside core-js's `isConstructor` feature-detection routine. Only `(anonymous function)
    (index-BMTfSvFa.js:64276)` is genuine app code, and direct inspection of that frame (see
    Eliminated entry below) shows it is core-js's IMPORT/MODULE-LOAD site at startup — not a failure
    site, not a call site that "intended to construct" anything. The "STILL OUTSTANDING" asks above
    for `index-BMTfSvFa.js:64276` source and caught-vs-fatal status are SUPERSEDED — that source has
    now been supplied and read (see Eliminated entry below), and it answers a different question than
    originally asked: it shows core-js's self-test importing/running, not an app-level constructor
    call. This whole pause is the intended, caught outcome of core-js's own feature detection, not a
    signal about Epic's application logic at all.

- timestamp: 2026-08-02T03:00:00
  source: developer checkpoint response, `pnpm tauri:dev`, live hardware, the
    `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT` request-capture instrumentation's `[GAMELIB-DIAG]`
    console stream (the version shipped in the immediately prior cycle, before this cycle's
    response-capture extension below)
  note: |
    FIRST GENUINELY DECISIVE LEAD of this investigation. Verbatim `[GAMELIB-DIAG]` stream
    excerpt, in order:
    ```
    {kind: "xhr.send", url: "/id/api/authenticate", method: "GET"}
    {kind: "xhr.send", url: "/id/api/redirect?flow=login&responseType=code", method: "GET"}
    [Error] Failed to load resource: the server responded with a status of 400 () (redirect, line 0)
    ```
    `/id/api/redirect?flow=login&responseType=code` returns HTTP 400. No form ever renders
    after it. The already-recorded Sentry `envelope` 429 and the empty DOM (both Evidence
    2026-08-02T00:20:00) are plausibly downstream of this single rejected request -- Epic's
    bootstrap has nothing to render a login form into if the request that is supposed to
    hand it a redirect target/session context fails.

    LOAD-BEARING DETAIL: the query string is `flow=login&responseType=code` -- there is NO
    `client_id` parameter. This is a CORRELATION worth investigating, NOT yet a proven
    identical mechanism, with the already-Eliminated R1 entry's Arm B visible error, quoted
    verbatim in that entry below: `Something went wrong Parameter "client_id" is required`.
    Two different observation methods (a rendered error page under a Chrome-shaped UA vs. a
    silent 400 on this exact endpoint under the stock UA) both point at the same missing-
    parameter shape. This does not by itself prove the two are the same failure.

    OTHER NETWORK ACTIVITY CAPTURED, recorded as context (only `/id/api/redirect` failed):
    hCaptcha (`https://866d8f28082f.w.hcaptcha.com/logo.png`), Statsig/`featureassets.org`/
    `prodregistryv2.org` telemetry, `/id/api/authenticate`, `/id/api/analytics`,
    `/id/api/location`. Consistent with the already-recorded Evidence 2026-08-02T00:20:00
    finding that Epic's real application bundle loaded and executed (the Statsig
    gate-evaluation warning at `index-BMTfSvFa.js:501`) -- the bundle runs, most of its
    network calls succeed, and exactly one named endpoint fails.

- timestamp: 2026-08-02T03:10:00
  source: direct read this cycle, `src/frontend/screens/WebView/index.tsx:245-259,324` and
    `src-tauri/src/main.rs:1601-1604,1695-1696`
  note: |
    VERIFIED at the source level (not transcribed from the checkpoint data without
    checking). Recorded as a confirmed SOURCE-LEVEL DIFFERENCE only -- NOT yet established
    to be the cause of the 400.

    Electron (`WebView/index.tsx`): the UA-setting call sits inside `loadstop` (line 245),
    registered as the handler for `webview.addEventListener('dom-ready', loadstop)` at
    line 324. Confirmed exact conditional (lines 252-259):
    ```
    if (runner !== 'humble') {
      const userAgent =
        startUrl === epicLoginUrl
          ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) EpicGamesLauncher'
          : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/200.0'
      if (webview.getUserAgent() != userAgent) {
        webview.setUserAgent(userAgent)
      }
    }
    ```
    `dom-ready` fires once the current document has finished loading, so this handler --
    and therefore `setUserAgent` -- cannot run until AFTER the initial HTML document for
    `epicLoginUrl` has already been fetched and parsed under whatever UA the webview
    already had (Electron's real Chromium UA on a fresh `<webview>`'s first navigation).
    Whether Epic's own bootstrap script's first `/id/api/*` calls (synchronous
    module-script execution close to DOMContentLoaded) race ahead of or behind this
    handler is NOT established by this read alone -- `webContents.setUserAgent()` affects
    subsequent requests from the SAME already-loaded page too, not only future
    navigations, so this is a genuine timing race, not a guaranteed miss.

    Tauri (`main.rs`): the `humble_login_open` arm's `WebviewWindowBuilder` chain (shared
    by all five runners -- Evidence 2026-08-01T23:15:00) sets `.user_agent(user_agent)`
    directly on the builder at line 1603, before `.build()` at lines 1695-1696. This is a
    build-time construction option, not a post-load reaction to any event -- it applies
    from the moment the OS-level webview is constructed, so the very first HTTP request the
    window ever issues carries `EpicGamesLauncher`. No race: the UA is fixed before the
    window exists.

    NET: the source confirms a real, mechanically plausible asymmetry -- Tauri's login
    window guarantees the overridden UA from the first byte; Electron's guarantees it only
    from `dom-ready` onward, with earlier requests' outcome depending on an unresolved
    timing race. This alone does not explain why the SAME literal `EpicGamesLauncher`
    string, applied at two different lifecycle points, would produce two different
    HTTP-level outcomes for `/id/api/redirect` unless Epic's own logic is itself sensitive
    to WHEN the header first appears (e.g. session/fingerprint continuity across the first
    vs. a later request) -- that additional claim is NOT established here and must not be
    treated as settled. CANDIDATE MECHANISM ONLY.

- timestamp: 2026-08-02T03:20:00
  source: direct read this cycle, `src-tauri/src/main.rs:2431-2458` (`spawn_sidecar_dev`,
    grepped for `env_clear` -- zero matches in the whole file) and
    `src/backend/sidecar/oauthLoginCapture.ts:84-95` (`resolveUserAgent`, and its sole call
    site at line 284)
  note: |
    Investigating the tension the checkpoint flagged: R1 was eliminated using a run where
    `GAMELIB_OAUTH_UA_LEGENDARY` was set to a realistic UA and the form still did not
    render. That elimination is only sound if the env var actually reached the sidecar's
    `process.env` AND `resolveUserAgent` recognized it as non-empty.

    PROPAGATION PATH, confirmed from source: `spawn_sidecar_dev` builds its child with
    `Command::new("node").arg(&entry).env("GAMELIB_SHELL_EXE", shell_exe).env(
    "GAMELIB_APP_ROOT", &app_root)...` -- only these two vars are set explicitly, and there
    is no `.env_clear()` anywhere in `main.rs`. `std::process::Command` inherits the
    spawning process's FULL environment by default unless `.env_clear()` is called;
    explicit `.env()` calls only add/override the named keys on top of that inherited set.
    So there is no code path in this file that would strip `GAMELIB_OAUTH_UA_LEGENDARY`
    between the Rust host process and the spawned Node sidecar -- IF the Rust host process
    itself had that variable in its environment when it started.

    WHAT THIS READ CANNOT ESTABLISH, stated explicitly rather than assumed: whether
    `pnpm tauri:dev`'s own spawn chain (pnpm -> tauri CLI -> the compiled Rust binary)
    preserves an exported shell variable through to the Rust process was not traced this
    cycle (outside this file); and whether the ACTUAL prior R1 run had the variable
    exported in the same shell/session before that specific invocation (vs. e.g. set in a
    different terminal, or set after the process was already running) cannot be
    reconstructed from source -- only the developer's memory or that run's saved
    `gamelib.log` can settle it, and this agent has not re-inspected that specific prior
    log this cycle.

    THE INDEPENDENT-CONFIRMATION SIGNAL EXISTS, confirmed in source:
    `resolveUserAgent` (`oauthLoginCapture.ts:84-95`) logs
    `[oauthLoginCapture] runner=${runner} user-agent-override len=${override.length}` via
    `logInfo(..., LogPrefix.Backend)`, but ONLY inside the branch guarded by
    `override !== undefined && override.trim() !== ''` (lines 86-92). This line's PRESENCE
    in the R1 run's `gamelib.log` would prove the env var reached the sidecar and was
    accepted as non-empty; its ABSENCE would prove it did not. NOT YET CHECKED against that
    specific prior log this cycle -- see Current Focus / checkpoint below for the request to
    the developer.

- timestamp: 2026-08-02T03:30:00
  source: this cycle's edit, `src-tauri/src/main.rs` (`DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`
    fetch + XHR wrappers), verified via `cargo check`, `cargo test`, and
    `npx jest src/backend/__tests__/tauriShellSource.test.ts`
  note: |
    Extended the dev-only diagnostic to capture RESPONSE status + body for any non-2xx
    response on both wrappers, gated identically to the whole script
    (`#[cfg(debug_assertions)]` + `if visible`, unchanged):
      - fetch: attaches a SEPARATE `.then/.catch` chain off the promise returned by the
        real `originalFetch(input, init)` call (never chained onto the value returned to
        the caller), so Epic's own code's await/resolution is never altered. Uses
        `res.clone()` before reading `.text()` so the original response stream Epic's code
        consumes is never touched.
      - XHR: adds a `load` listener via `addEventListener` (never overwrites `onload` or
        any handler Epic's own bundle attaches) that reads `.status`/`.responseText` once
        the request completes; `.responseText` access is wrapped in try/catch since it
        throws for a non-text `responseType`.
      - Both record only when `status < 200 || status >= 300`; both reuse the existing
        `truncate()` helper (20,000-char cap, same marker convention). Deliberately NOT
        gated by `isSentryLike` -- unlike request bodies (redacted to Sentry-shaped URLs
        only, to avoid capturing credential-shaped outgoing data), a FAILED response body
        is exactly the diagnostic payload this instrumentation exists to retrieve, and
        same-origin 4xx/5xx bodies are not expected to echo credentials back.
      - No cookies, Authorization headers, or token-shaped data captured anywhere in either
        addition -- neither wrapper reads request or response headers at all.
    `cargo check` (src-tauri): 0 errors. `cargo test` (src-tauri): 92 passed, 0 failed, 1
    ignored (pre-existing, unrelated -- unchanged from the prior cycle's count). `npx jest
    src/backend/__tests__/tauriShellSource.test.ts`: 46/46 passing, NO test modification
    needed -- confirmed by direct grep of the test file for `DEV_LOGIN_DIAGNOSTIC`,
    `initialization_script`, `fetch`, `XMLHttpRequest`, `GAMELIB-DIAG`: zero hits, so none
    of this file's arm-body/negative-bound assertions can see this change (matches the
    prior cycle's own finding for the same reason).

    `bodyLen` populated / `body: undefined` ANOMALY -- investigated, NOT a bug. Read the
    prior cycle's own capture code (fetch and XHR `send` wrappers, unchanged by this edit):
    `bodyLen` is set unconditionally whenever the outgoing body is a string; `bodyPreview`
    (the `body` field) is set ONLY `if (isSentryLike(url))`. This is synchronous code with
    no promise/await gap between setting `bodyLen` and the `record()` call, ruling out a
    "read before populated" timing bug. The observed pattern (bodyLen 24/134/116/564, body
    undefined) is the INTENDED behavior of the privacy boundary already documented in this
    constant's own doc comment ("Request bodies are captured ONLY when the destination URL
    substring-matches a Sentry-ingest shape") -- those four POSTs were simply to
    non-Sentry-shaped URLs (Epic's own API/telemetry endpoints), so redacting their body
    content is correct, not broken. No fix applied; none needed. For the developer: a
    future capture that needs a specific non-Sentry body's content would require
    deliberately widening the `isSentryLike` gate (a scoped, reviewable change) -- not
    something this cycle did, since it would weaken the request-body privacy boundary and
    was not asked for; this cycle's new RESPONSE capture is intentionally NOT gated the
    same way, per the entry above, since failing-response bodies are the stated target.

## Eliminated

- hypothesis: ITP/third-party-storage sub-hypothesis — WKWebView's default third-party-cookie
  blocking (Intelligent Tracking Prevention) silently stalls a cross-origin captcha/fingerprint/
  storage-access dependency in Epic's bootstrap, holding the form disabled with no JS throw.
  eliminated_by: live hardware DOM/console read, 2026-08-02T00:20:00 entry above, run against the
    prior cycle's own pre-registered prediction and falsification clause.
  note: |
    FALSIFIED on its own stated terms, recorded honestly rather than reworded to survive. This
    sub-hypothesis was pre-registered before the test, per this project's F-10 discipline, with an
    explicit falsification clause: "if Class A evidence is found but the Network tab shows no
    cross-origin captcha/challenge activity ... the ITP sub-hypothesis is wrong." The actual result
    is more direct than that clause even anticipated — there is no Class A evidence to pair with
    anything, because the DOM has no form to disable in the first place — and the storage
    primitives the theory predicted would be silently blocked are directly proven NOT blocked:
    `cookieLen: 85`, `localStorage OK`. ITP is not the mechanism here. Do not re-open this
    sub-hypothesis without new evidence specifically implicating cross-origin storage/cookie access.

- hypothesis: R1 — the user agent string is what breaks Epic's login form.
  eliminated_by: 34.5-G6-EPIC-DISCRIMINATOR.md, verdict R1-FALSIFIED.
  note: |
    Both arms non-interactive. A Chrome-shaped agent did not fix the symptom — it CHANGED it,
    producing a visible `Something went wrong Parameter "client_id" is required` error page
    instead of a silent non-interactive render. Do not re-try UA overrides without new evidence.

- hypothesis: E2 — Epic's login page is broken independently of this project (e.g. the inherited
  URL literal now needs a `client_id`), so any shell would fail.
  eliminated_by: 34.5-G6-EPIC-DISCRIMINATOR-2.md, verdict E1 (2026-08-01, real hardware).
  note: |
    FALSIFIED by the Electron control arm: the identical `EPIC_LOGIN_URL` literal is fully
    interactive under Electron and completed a real login. The shell is the differentiator.

- hypothesis: R3 — `tauri_plugin_notification::init()`'s globally-injected `init-iife.js`
  (clobbered `window.Notification` + its self-invoked failing `is_permission_granted` call) is
  causally responsible for Epic's login form staying non-interactive.
  eliminated_by: live hardware removal experiment, `.plugin(tauri_plugin_notification::init())`
  commented out in `main.rs` `main()`, `pnpm tauri:dev` rebuild + repro, 2026-08-01.
  note: |
    FALSIFIED, not weak-to-dead — this is a clean kill. Both named console error lines
    (`Refused to connect to ipc://localhost/plugin%3Anotification%7Cis_permission_granted` and its
    Unhandled Promise Rejection) are CONFIRMED GONE with the plugin's injection mechanism fully
    removed from every webview. The form remained non-interactive anyway
    ("did not have interactive login form, greyed out" — developer, verbatim). Removing the one
    named, confirmed mechanism did not change the symptom. The notification-plugin injection is a
    REAL, separately-fixable defect (see the new Current Focus entry below), but it is not the
    cause of F-34.5-G6-01. Diagnostic line reverted in `main.rs`; `cargo check` clean, 0 errors.

    SCOPE CORRECTION, 2026-08-02: this verdict falsifies ONLY the notification plugin's specific
    injected script (`tauri-plugin-notification`'s `init-iife.js`) as a cause. It must NOT be read
    as falsifying the broader claim "Tauri's injected user-scripts break Epic's page" — that
    broader claim is now separately, actively open again, driven by a DIFFERENT injected script
    (Tauri's own core IPC bootstrap, `user-script:103`) observed failing in the same console read
    that reconfirmed R3's kill (see Evidence 2026-08-02T00:20:00 and the new Current Focus entry).
    R3 killed one instance of the injection-breaks-the-page family; it did not kill the family.

- hypothesis: "CLOBBERED GLOBAL" mechanism — something in the Tauri environment substitutes/clobbers
  a global that Epic's bundle expects to resolve to a constructor with `Function.prototype.call`,
  causing the `Reflect.construct` `TypeError` observed at 2026-08-02T01:10:00, and this substitution
  is the (or a) cause of the empty DOM.
  eliminated_by: developer-supplied source excerpt of `index-GFazdAUR.js` at the breaking frame,
    2026-08-02.
  note: |
    SELF-RETRACTION. This was the PRIOR CYCLE'S OWN INTERPRETIVE INFERENCE, not a developer
    observation — the developer only ever supplied raw debugger pause data (pause reason, call
    stack, local variables at frame `c`). The "something in Tauri substitutes
    `Function.prototype.call` for a constructor" narrative was this investigation's own reasoning
    layered on top of that raw data, and it is now shown false.

    The developer-supplied source is core-js's own `isConstructor` feature-detection routine:
    ```js
    c = function(d) {
        if (!t(d)) return !1;
        try { return s(o, [], d), !0 }
        catch (y) { return !1 }
    },
    ...
    return l.sham = !0, ni = !s || e(function() {
        var h;
        return c(c.call) || !c(Object) || !c(function() { h = !0 }) || h
    }) ? l : c, ni
    ```
    where `s = n("Reflect", "construct")`. This proves `c(c.call)` deliberately passes
    `Function.prototype.call` into the detector `c` to verify the detector correctly REJECTS a
    known non-constructor, as one leg of a self-test (`c(c.call) || !c(Object) || !c(function(){...})
    || h`). The `Reflect.construct(o, [], d)` call sits inside a `try` whose `catch` returns `false`
    — the `TypeError` observed at 2026-08-02T01:10:00 is the INTENDED, CAUGHT outcome of this
    self-test, not an uncaught failure reaching Epic's application logic.

    This falsifies the specific mechanism (Tauri clobbers a constructor-holding global) as the
    explanation for THIS exception. It does not by itself prove anything about the empty-DOM
    symptom's actual cause — it only removes this one story. Any downstream reasoning that leaned on
    it (including "Epic's code must be receiving a real constructor at this position under Electron,
    and something under Tauri substitutes it") is VOID and must not be carried forward.

    Also corrects a second, related error from the same prior cycle: `index-GFazdAUR.js` was
    described as being "inside Epic's own app bundles" alongside `index-BMTfSvFa.js`. It is not —
    despite its `index-` filename prefix (which resembles the app bundle's own `index-BMTfSvFa.js`
    naming and is why it was misread), `index-GFazdAUR.js` is a vendored core-js/polyfill chunk, not
    application code. Of the four call-stack frames recorded at 2026-08-02T01:10:00, only
    `(anonymous function) (index-BMTfSvFa.js:64276)` is genuine app code — and it is core-js's
    IMPORT/MODULE-LOAD site at startup (where the app bundle pulls in and runs the core-js polyfill
    module containing the self-test above), not a failure site and not a constructor call site. The
    "index-BMTfSvFa.js:64276 names which class Epic intended to construct" framing from the prior
    cycle's Current Focus is also therefore wrong and is retracted along with the mechanism.

    METHOD LESSON: Break on All Exceptions is a poor instrument against this specific page. core-js
    performs feature detection via deliberate try/caught throws (this is standard core-js practice,
    not unique to this bundle), so the technique yields a stream of false positives, each costing a
    developer round trip to resolve. Two vendor chunks have now trapped this technique this way
    (`stable-*`/`es.array.from-*`/`ie11-*` blackboxed in an earlier run; `index-GFazdAUR.js` caught
    this one because it was NOT blackboxed, its `index-` prefix having disguised it as app code). Any
    FURTHER use of break-on-exceptions on this page MUST blackbox all vendor chunks first, including
    `index-GFazdAUR.js`. `index-BMTfSvFa.js` must NEVER be blackboxed — it is the genuine app bundle
    and the only place a real, informative application-level exception would live.

## Current Focus

hypothesis: |
  2026-08-02, EVIDENCE-RECORDING CYCLE (the first cycle with a concrete rejected HTTP
  request in hand, not just console noise). `/id/api/redirect?flow=login&responseType=code`
  returns HTTP 400 and no form ever renders afterward (Evidence 2026-08-02T03:00:00). The
  query string carries no `client_id`, which CORRELATES with (but is not yet proven
  identical to) the already-Eliminated R1 entry's Arm B visible error, `Something went
  wrong Parameter "client_id" is required`.

  A candidate contributing mechanism is now CONFIRMED AT THE SOURCE LEVEL (Evidence
  2026-08-02T03:10:00), not just asserted: Tauri's `humble_login_open` arm sets
  `.user_agent()` on the `WebviewWindowBuilder` before `.build()`, so `EpicGamesLauncher`
  applies from the very first request the login window ever issues. Electron's
  `WebView/index.tsx` only calls `webview.setUserAgent()` from inside a `dom-ready`
  handler, which cannot fire until the initial document has already loaded under whatever
  UA the webview already had -- a genuine, unresolved timing race for whether Epic's own
  earliest `/id/api/*` calls see the overridden UA or Electron's real Chromium UA. This is
  recorded as a CANDIDATE MECHANISM ONLY -- it does not by itself explain why the same UA
  string applied at two different lifecycle points would change an HTTP-level outcome,
  unless Epic's own logic is itself sensitive to timing/session continuity, which is
  unestablished.

  The tension the checkpoint flagged (R1 already eliminated using a run where
  `GAMELIB_OAUTH_UA_LEGENDARY` was set and the form still failed) has been investigated as
  far as source alone permits (Evidence 2026-08-02T03:20:00): nothing in `main.rs`'s
  sidecar-spawn path would strip that env var before it reaches the sidecar (no
  `.env_clear()`, `Command` inherits the parent's environment by default), and
  `resolveUserAgent` logs a `user-agent-override len=` line specifically diagnostic of
  whether it was received. Whether that line actually appeared in the R1 run's
  `gamelib.log` is UNCHECKED this cycle -- requires the developer (see next_action).

  E2 (Epic-side change independent of the port) REMAINS FALSIFIED by the Electron control
  arm -- that verdict is not disturbed by anything this cycle found. But IF the
  400/missing-`client_id` theory holds, something about Electron's request to the same
  endpoint must make Epic tolerate the missing parameter there while rejecting Tauri's --
  UA-timing is one candidate (see above), prior-session cookies persisting across Electron
  runs is another, unexamined this cycle. This needs evidence before being treated as
  settled; it is not being built into a fix.

  The instrumentation has been extended this cycle (Evidence 2026-08-02T03:30:00) to
  capture RESPONSE status + body for any non-2xx response on both the fetch and XHR
  wrappers, ungated by the Sentry-URL-shape restriction that still governs REQUEST bodies.
  Epic's own 400 body for `/id/api/redirect` is the next piece of direct evidence that
  could settle the missing-`client_id` question outright.

  Root cause is NOT YET NAMED. Do not act on the UA-timing mechanism as if it were
  confirmed -- it is a candidate explaining an asymmetry that exists in source, not yet
  shown to cause the specific 400.
test: |
  Re-run the reproduction with the now-extended instrumentation and read
  `window.__GAMELIB_DIAG__`'s `fetch.response`/`xhr.response` records for
  `/id/api/redirect`'s actual status + body. Separately, for the UA-propagation tension:
  set `GAMELIB_OAUTH_UA_LEGENDARY` to a realistic UA for one run and read
  `navigator.userAgent` directly from the live login window's console, and check whether
  that run's `gamelib.log` contains a `user-agent-override len=` line.
expecting: |
  If `/id/api/redirect`'s response body names `client_id` (or another parameter) as
  missing, the correlation with the R1 Arm B error strengthens from "worth investigating"
  toward "same underlying failure," and attention shifts to WHAT differs between
  Electron's and Tauri's actual requests to that endpoint (UA timing, cookies, or
  something not yet considered) as the next thing to test -- not yet a fix target.
  If `navigator.userAgent` reads `EpicGamesLauncher` despite the override being set, the
  override did not propagate for that run -- R1 was UNTESTED, not falsified, and its
  original elimination needs re-examination; the presence/absence of `user-agent-override
  len=` in that run's log independently corroborates which. If `navigator.userAgent` reads
  the overridden value and the form still fails, the UA-timing mechanism is seriously
  weakened and the missing-`client_id` explanation (independent of UA) moves to the front.
next_action: |
  BLOCKED on human hardware. Run `pnpm tauri:dev` -> Manage Accounts -> Epic with the
  now-extended instrumentation live, and after the page settles or times out, run
  `JSON.stringify(window.__GAMELIB_DIAG__, null, 2)` in the console and paste the full
  output -- specifically look for `fetch.response`/`xhr.response` records naming
  `/id/api/redirect`'s status + body. In a SEPARATE run, set `GAMELIB_OAUTH_UA_LEGENDARY`
  to a realistic Chrome-shaped UA, repeat the repro, report `navigator.userAgent` from the
  console, and report whether `gamelib.log` for that run contains a line matching
  `user-agent-override len=`. Do NOT apply any fix -- root cause is not yet named. Do NOT
  treat the UA-timing asymmetry as confirmed causal without the response-body evidence
  above.
constraints_respected: |
  `USER_AGENTS`, `EPIC_LOGIN_URL`, and `matchOAuthRedirect` were read (to verify the
  UA-timing claim) but NOT modified. `34.5-G6-EPIC-DISCRIMINATOR.md` and
  `34.5-G6-EPIC-DISCRIMINATOR-2.md` were not touched. Plans 34.5-29/30/31 remain untouched
  and HALTED. No fix was applied this cycle -- this was evidence-recording,
  source-verification, and instrumentation-extension only, per instruction.

instrumentation_added: |
  2026-08-02, INSTRUMENTATION CYCLE (not evidence yet -- no observation has been made). Added a
  dev-only `.initialization_script(DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT)` call to the `humble_login_open`
  arm's `WebviewWindowBuilder` chain in `src-tauri/src/main.rs`, gated identically to that same arm's
  pre-existing `open_devtools()` call: `#[cfg(debug_assertions)]` AND `if visible`, so it can never
  reach a packaged build. The script constant `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT` is declared at
  module level near `LOGIN_WINDOW_EVENTS_CAP` (also `#[cfg(debug_assertions)]`-gated), and the builder
  call site sits between the arm's existing `if visible { ... }` presentation block and
  `let page_load_origin = ...`, i.e. before `.build()`.

  WHY THIS MECHANISM: initialization scripts run BEFORE any page script (including Epic's own
  bundle) -- every technique tried in this investigation so far (console-only reads across four
  cycles, Break on All Exceptions) could only observe AFTER Epic's bootstrap had already run and
  (per the evidence trail above) already failed silently into a caught error boundary. This is the
  first instrument in this investigation capable of observing PRE-bootstrap and DURING-bootstrap
  behavior directly.

  ZERO DEPENDENCY on the three routes already exhausted this investigation:
    - Tauri IPC: NOT used at all. The console already proves IPC is degraded on this exact page
      (`IPC custom protocol failed, Tauri will now use the postMessage interface instead --
      TypeError: Load failed`, Evidence 2026-08-02T00:20:00; Epic's CSP separately refuses
      `ipc://localhost`). A diagnostic depending on that transport would silently capture nothing
      (`sidecar-send-channels-fail-silently` is exactly this failure mode). Instead the script
      accumulates records into a plain in-page array, `window.__GAMELIB_DIAG__`, and separately
      `console.warn`s each record immediately with a literal `[GAMELIB-DIAG]` prefix.
    - The file logger: NOT used. Nothing in this script touches Rust-side logging; it is pure
      in-page JS state, read out manually via the console.
    - Safari's Network request-body viewer: NOT used. The Sentry `envelope` 429's request body
      (unreadable in Web Inspector per this cycle's checkpoint) is instead captured DIRECTLY at the
      JS call site -- the script wraps `window.fetch`, `navigator.sendBeacon`, and
      `XMLHttpRequest.prototype.send`, and when the destination URL substring-matches a
      Sentry-ingest shape (`/envelope`, `ingest.sentry.io`, `sentry`), records the outgoing request
      body verbatim (truncated at 20,000 chars). All other requests record structural facts only
      (URL, method, body length) -- no header values, no cookies, no `Authorization`, no
      token-shaped data are ever read or recorded.

  WHAT IT CAPTURES: `window.onerror`-equivalent (`addEventListener('error', ...)` -- message,
  filename, lineno, colno, `error.stack`), `unhandledrejection` (reason + stack), fetch/sendBeacon/
  XHR.send URL+method+body-when-Sentry-shaped, and a `console.error` passthrough (records then calls
  through to the real `console.error`, never silences it).

  ROBUSTNESS: one outer try/catch around the whole IIFE, plus each hook independently try/caught, so
  no single hook's failure can break another hook or Epic's page. Adds listeners only, never removes
  or overwrites existing ones. `window.__GAMELIB_DIAG__` capped at 200 records (stops pushing past
  that, never evicts/grows unbounded). Captured text truncated at 20,000 chars with an explicit
  `...[GAMELIB-DIAG TRUNCATED]` marker when truncated.

  REUSABLE: this call lives in the same `humble_login_open` arm already established (Evidence
  2026-08-01T23:15:00) as shared, non-Humble-specific, across all five runners -- so this
  instrumentation is live for GOG, Amazon, Nile, and Zoom's login windows too, not just Epic's,
  without any further code change.

  VERIFIED: `cargo check` (src-tauri) clean, 0 errors. `cargo test` (src-tauri): 92 passed, 0
  failed, 1 ignored (pre-existing ignore, unrelated). `npx jest
  src/backend/__tests__/tauriShellSource.test.ts`: 46/46 passing WITH NO TEST MODIFICATION NEEDED --
  the JS payload lives entirely inside the module-level `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT` constant
  (declared outside the `humble_login_open` match arm), so none of this file's arm-body string-match
  assertions (the `.title(` negative-bound scan across every `WebviewWindowBuilder::new(...)
  .build()` chain, the if-visible presentation-token scan, the `on_navigation` negative bound) ever
  see the injected JS text at all; the arm body itself gained only a two-line conditional
  `builder = builder.initialization_script(...)` call, which does not collide with any existing
  assertion.

  STILL OWED: the actual observation. This is instrumentation only -- no root cause is confirmed or
  advanced by this entry. The causal mechanism for F-34.5-G6-01 remains UNKNOWN (see prior Current
  Focus below, retained for continuity).

hypothesis: |
  RETRACTION CYCLE, 2026-08-02. The prior cycle's "CLOBBERED GLOBAL" mechanism — that something in
  the Tauri environment substitutes `Function.prototype.call` for a constructor at Epic's
  `Reflect.construct` call site, and that this substitution is the (or a) cause of the empty DOM —
  is FALSIFIED and moved to Eliminated (see above). The developer-supplied source of
  `index-GFazdAUR.js` at the breaking frame proves the observed `TypeError` is core-js's
  `isConstructor` feature-detection routine deliberately passing `Function.prototype.call` into a
  `Reflect.construct` probe, inside a `try` whose `catch` returns `false` — an intentional, caught
  self-test, not an uncaught failure reaching application logic. This was this investigation's OWN
  interpretive error layered onto raw pause data the developer supplied (pause reason, call stack,
  local variables) — not a developer observation that turned out wrong. No part of the retracted
  mechanism — including "Epic's code must receive a real constructor under Electron and Tauri
  substitutes it" — may be carried forward as live reasoning.

  Correspondingly, `index-GFazdAUR.js` is now known to be a vendored core-js chunk, not application
  code, despite its `index-` prefix. Of the four 2026-08-02T01:10:00 call-stack frames, only
  `(anonymous function) (index-BMTfSvFa.js:64276)` is genuine app code, and it is core-js's
  import/module-load site at startup — not a failure site, not a constructor call site. The prior
  cycle's outstanding ask for that source (to "name the constructor Epic intended to build") is
  superseded and answered differently than expected: there is no such constructor call to name at
  that frame.

  THREAD 1 (Tauri's core injected user-script, `user-script:103`, "IPC custom protocol failed ...
  TypeError: Load failed") REVERTS to open and unconfirmed. It loses the specific mechanism proposed
  for it in the prior cycle and must not retain credibility borrowed from that now-void mechanism.
  It is supported ONLY by the already-recorded Evidence 2026-08-02T00:20:00 line showing Tauri's own
  core IPC bootstrap script failing in this same page load — a real, distinct observation, but with
  NO currently-proposed mechanism connecting it to the empty DOM.

  The causal mechanism for the empty-DOM symptom (F-34.5-G6-01) remains UNKNOWN. Four hypotheses are
  now eliminated (ITP, R1, E2, R3) plus this retracted clobbered-global mechanism. Do not let
  hypothesis-count pressure produce a premature fix — no root cause has been named by evidence yet.

  METHOD LESSON recorded (see Eliminated entry for full text): Break on All Exceptions is a poor
  instrument against Epic's login page specifically because core-js performs feature detection via
  deliberate try/caught throws, producing a stream of false positives. If break-on-exceptions is
  used again, ALL vendor chunks must be blackboxed first — the polyfills already blackboxed
  (`stable-*`, `es.array.from-*`, `ie11-*`), PLUS now `index-GFazdAUR.js`. `index-BMTfSvFa.js` (the
  genuine app bundle) must NEVER be blackboxed, since it is the only place a real, informative
  application-level exception would live.
test: |
  Not yet designed — this cycle is a record-correction/retraction cycle only, per instruction. Two
  candidate next tests are being offered to the developer as a choice (see CHECKPOINT REACHED
  returned to the user), not pre-selected by this agent:
    (a) read the Sentry `envelope` request's payload in the Network tab — the already-observed 429
        on that endpoint (Evidence 2026-08-02T00:20:00) proves Epic's app is already assembling and
        transmitting its real exception; the payload should contain the exception + stack with zero
        vendor-chunk noise, and is cheaper than another debugger round trip;
    (b) re-arm Break on All Exceptions, this time with `index-GFazdAUR.js` blackboxed alongside the
        already-blackboxed polyfill chunks, leaving `index-BMTfSvFa.js` un-blackboxed, so any future
        pause is a genuine app-level exception instead of a core-js self-test false positive.
expecting: |
  Whichever option the developer picks: (a) a readable Sentry envelope payload names Epic's real
  uncaught/caught exception directly, with a stack pointing at genuine app logic — this would likely
  let the investigation skip straight to a call-site read without another debugger round trip. If
  the payload is unreadable or unhelpful (Safari's request-body viewer was previously flagged as
  unreliable for this kind of payload — see checkpoint), fall back to (b). (b) a properly-blackboxed
  Break on All Exceptions pause, if it occurs, is now credible as an app-level exception rather than
  a vendor self-test, and its call stack + local variables become the next evidence entry.
next_action: |
  SUPERSEDED, 2026-08-02, by the `instrumentation_added` entry above. The (a)/(b) choice this field
  previously offered (manual Sentry envelope payload read in the Network tab / re-armed Break on All
  Exceptions with `index-GFazdAUR.js` blackboxed) is no longer the next step -- both manual routes
  are recorded EXHAUSTED in this cycle's checkpoint response (429 with an empty response body in
  Safari's Network viewer; each debugger round trip costing a full human hardware cycle). The new
  instrumentation captures the Sentry envelope's REQUEST body directly at the JS call site (no
  Network-tab dependency) and captures runtime errors/rejections directly (no debugger-breakpoint
  dependency), so it supersedes rather than complements options (a)/(b).

  BLOCKED on human hardware only (not human choice this time): run `pnpm tauri:dev`, open Manage
  Accounts -> Epic, wait for the page to settle or the 300s timeout, then in the console run
  `JSON.stringify(window.__GAMELIB_DIAG__, null, 2)` and paste the full output. Also, if already
  available from the separately-requested `JSON.stringify(Object.keys(window.__SENTRY__ || {}))`
  probe, include that too. Do NOT apply any fix -- no root cause is named. Do NOT re-propose the
  retracted clobbered-global mechanism in any form without new evidence that specifically identifies
  a real (non-core-js-self-test) global substitution.
reasoning_checkpoint: |
  This retraction is itself an instance of the F-10 discipline this file has invoked repeatedly: a
  compelling story (named exception, concrete mechanism, corroborating evidence from a different
  injected script) is exactly the kind of evidence previously mistaken for confirmation in this
  investigation, and it happened again here — the very discipline this file preaches did not
  prevent this investigation from constructing an unearned narrative on top of correctly-recorded
  raw data. The lesson generalizes beyond this one exception: raw pause data (pause reason, stack,
  locals) is reliable; the narrative layered on top of it is not, until independently corroborated
  by reading the actual source at the call site — which is exactly the "STILL OUTSTANDING" ask the
  prior cycle itself flagged as unmet before treating the mechanism as load-bearing enough to
  elevate Thread 1. The lesson here: even a hypothesis that names its own outstanding proof
  requirements can still leak into Current Focus's framing (e.g., "THIS ELEVATES THREAD 1 to the
  prime suspect") before those requirements are met. Future cycles should hold elevation language
  until requirement 1 (identify the specific global) is actually satisfied by a source read, not
  merely requested. Blind spot, stated honestly: this retraction does not itself advance the
  investigation toward the real cause — it only removes a wrong turn. The empty-DOM mechanism is
  exactly as unknown now as it was before the Reflect.construct pause was ever recorded, apart from
  the now-firm fact that this particular exception is not it.

## Constraints

- Do NOT change `USER_AGENTS`, `EPIC_LOGIN_URL`, or `matchOAuthRedirect`. The discriminator's
  Routing section authorizes instrumentation and diagnosis; a fix is authorized ONLY after the
  root cause is named with evidence, and must target that named cause.
- Plans 34.5-29 / 34.5-30 / 34.5-31 remain HALTED by `BINDING DECISION: fix-first`. Do not touch
  them, and do NOT create `34.5-LIVE-GATE-RERUN-2.md`.
- Do NOT modify `34.5-G6-EPIC-DISCRIMINATOR.md` or `34.5-G6-EPIC-DISCRIMINATOR-2.md`. Both are
  closed, pre-registered contracts with recorded verdicts.
- `34.5-UNTESTED-ITEMS.md` rule: a passing test suite NEVER retires a row. `U-34.5-06` (Epic's
  success path) is OPEN and only a live observation retires it.
- Any `open_devtools()` addition must be `#[cfg(debug_assertions)]`-gated so it cannot reach a
  packaged build.

## Resolution

root_cause:
fix:
verification:
files_changed:
