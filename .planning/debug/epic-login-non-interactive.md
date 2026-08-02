---
status: root_cause_confirmed_post_auth_only
root_cause_scope: |
  SCOPED, READ THIS BEFORE TRUSTING `status` ABOVE. Root cause is CONFIRMED for the
  POST-AUTHENTICATION half of the Epic login flow ONLY: once Epic has already authorized
  the session, WKWebView silently refuses the client-side navigation to the localhost
  redirectUrl (full evidenced chain: Evidence 2026-08-02T05:05:00, Resolution.root_cause).
  The PRE-AUTHENTICATION half -- whether Epic's real login form (email/password fields,
  hCaptcha) renders and accepts input for a genuinely LOGGED-OUT user under WKWebView -- is
  UNVERIFIED. Every single observation in this entire multi-cycle investigation came from an
  ALREADY-AUTHENTICATED webview (cookies persisted from an earlier manual login); nobody has
  ever driven this shell through a fresh, logged-out Epic sign-in. Do not read
  `root_cause_confirmed_*` as "the whole login flow is understood" -- see Current Focus,
  `pending_question`, for the live test that resolves this before implementation proceeds.
trigger: "Tauri Epic login form renders but is non-interactive (F-34.5-G6-01). Discriminator verdict E1 (2026-08-01): the identical EPIC_LOGIN_URL is interactive under Electron (npm start, real login completed, 15 games) and non-interactive under Tauri (pnpm tauri:dev, two full 300s timeouts, single nav host=www.epicgames.com, title bar \"https://www.epicgames.com\", NO visible error text under the stock UA). E2 (Epic-side change independent of the port) is FALSIFIED. R1 (user-agent) was falsified in an earlier contract; R2 (a Chromium-only web API throwing under WKWebView) survives but is UNCONFIRMED because no one has ever seen the login window's JS console. LEAD HYPOTHESIS: main.rs:2476-2487 calls open_devtools() only for the \"main\" webview; the login window (separate WebviewWindowBuilder at main.rs:1387, label loginwin-N-*) never gets it, so its console has been invisible for four cycles. First move: add window.open_devtools() to the login window under #[cfg(debug_assertions)] only, then open Epic under pnpm tauri:dev and read the real console/script error. Prior art: queryLocalFonts is a CONFIRMED instance of a Chromium-only API throwing under WKWebView in this project (.claude/skills/spike-findings-gamelib/references/tauri-chromium-only-web-apis.md). Constraint: do NOT change USER_AGENTS, EPIC_LOGIN_URL, or matchOAuthRedirect - the discriminator's Routing section authorizes instrumentation/diagnosis only, no fix. Plans 34.5-29/30/31 remain HALTED by BINDING DECISION: fix-first; do not create 34.5-LIVE-GATE-RERUN-2.md."
created: 2026-08-01
updated: 2026-08-02T05:30:00
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

  **SECOND MATERIAL CORRECTION, 2026-08-02T04:30:00 (see Evidence 2026-08-02T04:25:00), recorded
  honestly as a second instance of the same process failure the first correction already named:**
  the "empty DOM / blurred skeleton" is not a failed login-form render at all. The correlated
  per-request instrumentation proved Epic's own `/id/api/redirect` request — the SAME request, id
  15, sent from inside the login window's own bootstrap, not a manual probe — returned HTTP 200
  with a full authorization payload in this run. A 200 carrying a valid `authorizationCode` means
  the user is **already authenticated** in that webview at the moment the skeleton is observed —
  Epic's page has no login form to render at that point because there is nothing left to log in;
  its only remaining job is to navigate the window out to the `redirectUrl` it just received. The
  CSS skeleton is a page **in transit**, mid-bootstrap, waiting to leave — not a broken render of a
  login form that should have appeared. Every earlier framing of this defect as "the login form
  does not render" (including the first correction above, which only fixed "no inputs" vs.
  "disabled inputs" but still implicitly assumed a login form was the thing that should have
  appeared) was describing the wrong artifact. This is the second time this file's own recorded
  symptom description has been materially wrong and has misdirected a prior stretch of
  investigation (first: assuming a form existed to be disabled/undelivered; second: assuming the
  skeleton was standing in for a login form at all, rather than a page waiting to exit). Recorded
  per this project's own F-10 discipline: get the symptom description right, do not let a
  plausible-sounding early framing calcify.
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

- timestamp: 2026-08-02T04:00:00
  source: developer checkpoint response, live hardware, `pnpm tauri:dev`, manual diagnostic
    fetch to `/id/api/redirect?flow=login&responseType=code` run directly in the login
    window's console, Console filter corrected to ALL (previous cycles' reads sat behind
    an Errors+Warnings-only filter)
  note: |
    BREAKTHROUGH. `/id/api/redirect?flow=login&responseType=code` returned HTTP 200 in
    ~1256ms with a full, valid authorization payload. JSON response body carried the keys
    `warning`, `redirectUrl`, `authorizationCode`, `exchangeCode`, `sid` (null).
    `redirectUrl` was of the shape `https://localhost/launcher/authorized?code=<REDACTED>`.

    MANDATORY REDACTION APPLIED: the actual `authorizationCode`/`exchangeCode`/`code`
    values are LIVE Epic OAuth credentials and are never recorded in this file, in any
    form, per this project's public-fork secret-handling requirement -- only key names,
    HTTP status, timing, and URL shape are recorded here. Structure is the evidence; the
    values are not needed to prove anything.

    LOAD-BEARING COMPARISON: the query string (`flow=login&responseType=code`, no
    `client_id`) is IDENTICAL to the query string that returned HTTP 400 in Evidence
    2026-08-02T03:00:00. The same literal request shape produced a 400 in one run and a
    200 in another. This weakens (does not falsify) the "missing `client_id` causes a
    deterministic rejection" reading of the earlier 400 that Current Focus had been
    carrying as a live candidate -- a parameter-validation error should not be
    intermittent across otherwise-identical requests, whereas an intermittent
    network-level failure would produce exactly this pattern (sometimes reaches Epic's
    validation and gets a real response, sometimes does not complete cleanly). Not yet
    proven either way; recorded as a comparison, not a conclusion.

    CONSEQUENCE: this retracts the standing "the request hangs forever / produces no
    result" reading that had been the working assumption across the cycles between
    `2666ef498` and now (see the next Evidence entry for the specific mechanism). Epic's
    `/id/api/redirect` endpoint is not rejecting this webview outright -- it can and does
    hand back a real authorization code. What fails is that Epic's page never NAVIGATES
    the window to the returned `redirectUrl` -- the `nav host=` sequence in every prior
    Evidence entry never leaves `www.epicgames.com`, and per the checkpoint, Epic's own
    bundle (`index-BMTfSvFa.js:426`) was separately observed logging
    `{"status":408,"response":{"data":{"message":"error.serviceUnavailable"}}}` via
    `console.error` (captured by this script's existing passthrough hook), alongside a
    browser-level `Failed to load resource: The network connection was lost. (analytics)`
    -- `NSURLErrorNetworkConnectionLost` (-1005), a WKWebView/CFNetwork-specific failure
    with no Chromium equivalent. This is now the strongest remaining lead (see Current
    Focus): Epic's OWN app-level request(s) intermittently fail under WKWebView, its code
    treats the failure as service-unavailable, and abandons the flow before navigating to
    the (successfully obtained) `redirectUrl` -- NOT YET CONFIRMED to be the same request
    as the one that returned 200 above; that is precisely this cycle's crux test (see
    Current Focus).

- timestamp: 2026-08-02T04:05:00
  source: direct read this cycle of `src-tauri/src/main.rs` (grep for `console\.log`,
    `console\.warn`, `console\.error` across the whole file; direct read of
    `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`'s `record()` function), plus `git log -S` / `git
    show` archaeology on the same file's history
  note: |
    VERIFIED, not just transcribed from the checkpoint: every one of
    `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`'s six `record()`-sink kinds (`error`,
    `unhandledrejection`, `fetch`, `sendBeacon`, `xhr.send`, `console.error`) routes
    through the SAME single call, `console.warn('[GAMELIB-DIAG]', entry)`, inside
    `record()`; the two installation-boundary announcements (`instrumentation installed` /
    `instrumentation failed to install`) are also bare `console.warn` calls.
    `grep -n "console\.log"` across the ENTIRE file returns exactly one hit, and it is a
    comment (`// non-JSON diagnostic line (console.log etc.)`), not executable code. Zero
    literal `console.log(...)` calls exist anywhere in `main.rs`.

    CONCLUSION: the shipped GAMELIB-DIAG instrumentation's own visibility design was
    NEVER at risk from a console level filter -- confirmed at the source level. The
    console-level-filter artifact the checkpoint describes ("no output" wrongly read as
    "nothing happened") must therefore have affected DIFFERENT, ad-hoc probes the
    developer typed directly into the console during live debugging sessions (e.g. an
    `Image()` favicon-load test, and a manual `.then(...)`-style read of a control
    fetch's result) -- NOT the shipped Rust-injected script.

    GIT ARCHAEOLOGY -- this mechanism already operated ONCE in this investigation,
    unrecorded in this file until now:
      - `2666ef498` "chore(debug): capture non-2xx response status and body in login
        diagnostics" added a response-capture increment (fetch `res.clone()`, XHR
        `load` listener) to this same script, ~40 minutes before the next commit.
      - `6c8a779ef` "revert(debug): drop response-body capture — it hung every fetch"
        reverted it, reasoning (commit message, structure quoted, no secret content): a
        control fetch to `/id/api/location` "never resolved" while an `Image()` load of
        `favicon.ico` "returned 404 in milliseconds," concluding "Network healthy,
        wrapper broken."
      - That diagnosis depended on reading the control fetch's outcome via a
        `console.log`-shaped manual probe -- exactly the class of probe this checkpoint
        now identifies as invisible under an Errors+Warnings-only filter. The commit
        message's own tell was present and unrecognized at the time: it reports seeing
        the BROWSER's native 404 log line (visible regardless of filter, since Safari
        surfaces failed-resource loads at Errors level) but does not report seeing any
        of the probe's OWN printed confirmation lines -- silence exactly where a
        `console.log`-based probe would go missing.

    RETRACTED, per this cycle's checkpoint: neither the base request-only wrapper
    (`bf5394a20`) nor the reverted response-capture increment (`2666ef498`) was ever
    actually broken. Fetch promises resolved fine in both; the developer's own
    console.log-based read of that resolution was what went missing, not the resolution
    itself. The "wrapper broken" diagnosis in `6c8a779ef` is VOID and must not be carried
    forward.

    METHOD LESSON (generalizes beyond this one commit pair): ANY diagnostic console
    probe -- shipped Rust-injected instrumentation or a developer's own ad-hoc
    typed-in-console test -- MUST use `console.warn`/`console.error`, never
    `console.log`, for anything whose absence would be read as a finding. An observed
    "no output" must be checked against the console's active level filter before being
    trusted as evidence of anything. This investigation lost one full cycle
    (`2666ef498` → `6c8a779ef`) acting on a false negative produced by exactly this gap.

- timestamp: 2026-08-02T04:10:00
  source: direct read this cycle, `src/backend/sidecar/oauthLoginCapture.ts:101-119`
    (`matchOAuthRedirect`, `legendary` case)
  note: |
    VERIFIED against source, not assumed. For `runner === 'legendary'` (the runner used
    for Epic throughout this file's evidence -- every `nav host=`/`label=loginwin-`
    log line is `runner=legendary`), the matcher requires exactly:
    ```
    if (parsed.hostname !== 'localhost') return null
    const code = parsed.searchParams.get('code')
    if (!code) return null
    return { code, redirectUrl: url }
    ```
    i.e. STRICT equality on `hostname === 'localhost'` (not a substring/prefix match) AND
    a non-empty `code` query parameter.

    The redacted `redirectUrl` shape from the breakthrough entry above,
    `https://localhost/launcher/authorized?code=<REDACTED>`, parses to
    `hostname === 'localhost'` with a present, non-empty `code` param -- both conditions
    the matcher requires are satisfied by this shape.

    CONCLUSION, bounded to what source alone can show: IF the login window's webview
    ever issues a real browser-level navigation to this `redirectUrl`, the existing,
    UNMODIFIED `matchOAuthRedirect` logic is already written correctly to catch it. This
    is a source-level structural check only, not a live-fire confirmation -- no
    navigation to this URL has been observed happening in any run to date (every prior
    Evidence entry's `nav host=` sequence stays on `www.epicgames.com`). Nothing about
    the matcher itself is indicated as needing a change; `matchOAuthRedirect` was read,
    per the Constraints section, but not modified.

- timestamp: 2026-08-02T04:15:00
  source: this cycle's edit, `src-tauri/src/main.rs` (`DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`
    fetch + XHR wrappers), verified via `cargo check`, `cargo test`, and
    `npx jest src/backend/__tests__/tauriShellSource.test.ts`
  note: |
    Given the 2026-08-02T04:05:00 entry's finding -- the response-capture increment
    reverted in `6c8a779ef` was wrongly diagnosed as broken -- re-added the capability
    this cycle with a corrected design, aimed directly at this cycle's crux test (see
    Current Focus): whether Epic's OWN request to `/id/api/redirect` succeeds or fails in
    the SAME run a 200 is observed elsewhere.

    DESIGN CHANGES from the reverted `2666ef498` version:
      - STATUS is now recorded for EVERY response (2xx included), not only non-2xx --
        the prior design's silence-on-success meant a successful app-level request would
        leave no trace at all, an ambiguity this cycle's crux test cannot tolerate.
      - BODY text is STILL captured ONLY for non-2xx responses -- this boundary is now
        MORE important than before, not less: `/id/api/redirect`'s 200 body carries a
        real Epic OAuth `authorizationCode`/`exchangeCode` (confirmed this cycle, see
        2026-08-02T04:00:00 entry), and this instrumentation must never capture, print
        (even via `console.warn`), or store that value. Recording status-only for 2xx
        responses achieves the crux test's goal (did Epic's own request succeed?)
        without ever touching the credential-bearing body.
      - NEW: a rejected fetch promise (no HTTP response at all -- e.g. a WKWebView
        `NSURLErrorNetworkConnectionLost`) is now recorded as
        `{kind: 'fetch.response', status: 'rejected', message: <rejection message>}`;
        XHR's `error` event (the XHR-level analogue of a connection-level failure) is
        recorded as `{kind: 'xhr.response', status: 'network-error'}`. Neither existed in
        the reverted version. This targets the checkpoint's WKWebView network-failure
        lead directly -- a connection-level failure is now distinguishable in the
        capture from an HTTP-level 408/other status, rather than indistinguishable
        silence.
      - fetch's response observer remains a SEPARATE `.then/.catch` chain never chained
        onto the value returned to the caller (`fetchPromise` is returned unmodified),
        and still uses `res.clone()` -- same non-interference guarantee as the reverted
        version, unchanged.
      - XHR's response observer remains additive `addEventListener` calls (`load`, now
        also `error`), never overwriting `onload`/`onerror` -- same non-interference
        guarantee, unchanged.

    VERIFICATION: `cargo check` (src-tauri): 0 errors. `cargo test` (src-tauri): 92
    passed, 0 failed, 1 ignored (pre-existing, unrelated) -- identical counts to this
    file's most recent prior verification entry. `npx jest
    src/backend/__tests__/tauriShellSource.test.ts`: 46/46 passing, no test modification
    needed -- same reason as every prior cycle's edit to this constant: the JS payload
    lives entirely inside a module-level string constant this test file's arm-body/
    negative-bound assertions cannot see.

    GATING unchanged: `#[cfg(debug_assertions)]` AND `if visible`, identical to every
    other addition to this constant -- cannot reach a packaged build. No secrets, header
    values, or cookies captured anywhere in this edit; only status codes, structural URL/
    method facts, and non-2xx body text (existing boundary, unchanged).

- timestamp: 2026-08-02T04:25:00
  source: this cycle's mechanism upgrade, applied ON TOP OF the response-capture design
    recorded in the 2026-08-02T04:15:00 entry above -- direct re-read of the ACTUAL
    current `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT` in `src-tauri/src/main.rs` (twice, before
    and during this cycle -- the file changed on disk BETWEEN those two reads, see
    correction below), then a further extension edit, verified via `cargo check`, `cargo test`,
    and `npx jest src/backend/__tests__/tauriShellSource.test.ts`. RECORDED AS A
    MECHANISM UPGRADE, NOT EVIDENCE -- no new observation of Epic's login flow has been
    made yet; nothing here narrows or supports any hypothesis about F-34.5-G6-01.
  note: |
    CORRECTION TO THE PRIOR CYCLE'S EVIDENCE ENTRY (2026-08-02T03:30:00 above), made by
    direct re-read rather than by trusting that entry's own narrative, per this cycle's
    explicit instruction to verify the actual file state independent of any cited commit
    hash: the FIRST read this cycle took of `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT` showed
    `record()` calls at send-time ONLY (`fetch`, `sendBeacon`, `xhr.send`) plus
    `error`/`unhandledrejection`/`console.error` hooks -- there was NO response capture
    of any kind (no `.then`/`.catch` chain on fetch, no XHR `load` listener) at that
    exact moment. This directly contradicts the 2026-08-02T03:30:00 entry's claim that
    response capture had already been added and verified. The file was THEN independently
    modified on disk before this agent's first edit attempt (the edit tool reported "File
    has been modified since read"), and a second read showed a DIFFERENT version already
    present: fetch response handling via a `.then/.catch` chain (status always recorded;
    body captured only for non-2xx responses, via `res.clone()`), and XHR `load` +
    `error` listeners (status always recorded on `load`; body captured only for non-2xx).
    This SECOND version is the one this cycle's edit actually started from and extended
    -- it is recorded here as the verified ACTUAL baseline, not the false-premise
    "0.100%-broken, needs full rebuild" framing from the checkpoint, and not the
    "already-complete" framing the immediately prior cycle's own entry claimed. Neither
    prior framing was independently confirmed against the file at the time it was
    written; this entry is. No conclusion is drawn about WHY the file changed between the
    two reads (out of scope, not investigated) -- only that it did, and this entry
    records the actual state that resulted, honestly, rather than assuming either cited
    commit hash's content applied.

    GAP FOUND AND CLOSED in that verified baseline, independent of the missing
    correlation/timeout/abort capabilities the checkpoint asked for: the baseline's
    non-2xx body capture (both fetch and XHR) had NO credential-shaped-URL guard at
    all -- a non-2xx response body from `/id/api/redirect` (or any OAuth code/token
    endpoint) would have been captured and mirrored via `console.warn` IN FULL, in
    violation of this session's mandatory secret-handling boundary. (2xx bodies were
    already never captured in that baseline, so the specific 200-body leak scenario
    was already closed by accident; the non-2xx gap was not.) This cycle added
    `isCredentialShapedUrl()` -- substring match on `/redirect`, `exchangecode`,
    `authorizationcode`, `/token`, `oauth`, fails CLOSED (treats a thrown check as
    credential-shaped) -- and a shared `captureResponseBody()` policy function used by
    BOTH fetch and XHR: for a credential-shaped URL, body content is NEVER captured at
    ANY status, only status/timing/top-level-JSON-key-names (via `Object.keys()`,
    never values); for any other URL, the pre-existing non-2xx-only body capture is
    preserved unchanged.

    ADDED this cycle, per the checkpoint's REQUIRED CAPABILITIES list, on top of the
    verified baseline above:
      1. Monotonic per-request `id` (`nextRequestId()`), assigned at send time and
         recorded on every `fetch.send`/`xhr.send` record AND every outcome record
         (`fetch.response`/`fetch.error`/`xhr.response`/`xhr.error`/`xhr.timeout`/
         `xhr.abort`), so a reader can pair a specific outcome to a specific send
         unambiguously even when the same URL is requested more than once.
      2. `elapsedMs` (milliseconds since send, `Date.now()` delta) on every outcome
         record, fetch and XHR alike.
      3. XHR `error`, `timeout`, and `abort` listeners added via `addEventListener`
         (additive only, `onload`/`onerror` and any handler Epic's own bundle attaches
         are untouched) -- the baseline had `load` and `error`, but NOT `timeout` or
         `abort`. `error` already existed in the baseline but did not carry `elapsedMs`
         or an `id`; both now added, and it is now named `xhr.error` (was
         `xhr.response` with `status: 'network-error'`) to make it visibly distinct
         from a real HTTP response with no ambiguity.
      4. fetch's `.catch()` path is now named `fetch.error` (was `fetch.response` with
         `status: 'rejected'`), carries `errorName` + `errorMessage` + `elapsedMs` +
         `id`, and is a structurally distinct outcome kind from `fetch.response`.
      5. Diffing method for in-flight/never-resolved requests, documented in the
         constant's own doc comment: every send is unconditionally recorded with its
         `id`; a reader diffs the set of `id`s on `*.send` records against the set of
         `id`s on ANY outcome record (`*.response`/`*.error`/`xhr.timeout`/`xhr.abort`)
         in the dumped `window.__GAMELIB_DIAG__` array -- an `id` present only on the
         send side never got an outcome (still in-flight, or the array hit its 200-cap,
         or the session ended first).
      6. `console.log` audit: grepped the ENTIRE script body (and the whole of
         `main.rs`) for `console.log` -- zero actual calls found (one unrelated code
         COMMENT elsewhere in the file mentions "console.log etc." as an example, not a
         real call). No conversion was needed; every mirrored record already routes
         through the script's single `record()` function's one `console.warn(...)`
         call, plus two standalone `console.warn(...)` install/failure messages. This
         is stated explicitly rather than assumed, since an unaudited claim of "already
         all console.warn" is exactly the kind of unverified claim this cycle exists to
         stop propagating.

    VERIFIED: `cargo check` (src-tauri) -- 0 errors. `cargo test` (src-tauri) -- 92
    passed, 0 failed, 1 ignored (same pre-existing ignore as every prior cycle this
    investigation, unchanged). `npx jest
    src/backend/__tests__/tauriShellSource.test.ts` -- 46/46 passing, NO test
    modification needed (confirmed directly: this test file has zero references to
    `DEV_LOGIN_DIAGNOSTIC`, `initialization_script`, `fetch`, `XMLHttpRequest`, or
    `GAMELIB-DIAG`, so none of its arm-body/negative-bound string-match assertions can
    see this constant's contents at all).

    STILL OWED, unchanged: the actual observation. This entry is instrumentation only.
    The crux question -- does Epic's OWN `/id/api/redirect` request return 200, error,
    or never resolve, in the SAME run where a manual diagnostic fetch to it already
    returned 200 -- is not answered by anything in this entry. That requires one more
    live run with this now-extended instrumentation.

- timestamp: 2026-08-02T04:25:00
  source: developer checkpoint response, live hardware, `pnpm tauri:dev`, correlated
    per-request `[GAMELIB-DIAG]` stream from the id/elapsedMs-extended instrumentation
    (Evidence 2026-08-02T04:15:00), single repro run, THE CRUX TEST pre-registered in the
    immediately prior cycle's Current Focus
  note: |
    DECISIVE RESULT. THE QUESTION IS ANSWERED. Recorded verbatim (structure/status only,
    per this session's mandatory secret-handling boundary -- no credential-shaped value is
    reproduced here):
    ```
    {kind: "xhr.send",     id: 15, url: "/id/api/redirect?flow=login&responseType=code", method: "GET"}
    {kind: "xhr.response", id: 15, url: "/id/api/redirect?flow=login&responseType=code", method: "GET", status: 200}
    ```
    Correlated by `id: 15` -- this is Epic's OWN request, issued from inside the login
    window's own bootstrap (an `xhr.send`/`xhr.response` pair, not a manual `fetch()` typed
    into the console), not a parallel manual probe. HTTP 200. Not a timeout, not a rejected
    promise, not a non-2xx status, not still pending at the time the array was read.

    EVERY OTHER REQUEST in the same run also succeeded, zero network failures anywhere in
    the run: id 6 `/id/api/location` 200, id 8 `/id/api/analytics` 200, id 13
    `/id/api/analytics` 200, id 14 `/id/api/authenticate` 200, ids 9/10/11/12/16 telemetry
    200/202. No `fetch.error`, no `xhr.error`, no `xhr.timeout`, no `xhr.abort` record
    appears anywhere in the dumped `window.__GAMELIB_DIAG__` array for this run.

    THIS IS A DISTINCT RUN/OBSERVATION FROM Evidence 2026-08-02T04:00:00's 408
    `error.serviceUnavailable` / `NSURLErrorNetworkConnectionLost` ("The network connection
    was lost") reading -- that reading came from an earlier, separate run, before this
    cycle's id-correlated instrumentation existed to pin outcomes to specific sends. The two
    entries are NOT the same observation and must not be conflated: one run showed an
    app-level 408/connection-loss signature; this run, with the SAME overall flow and the
    SAME endpoint, showed a completely clean 200 with zero network failures of any kind.

    CONSEQUENCES, all recorded here per this cycle's instruction:
    - This is branch 1 of the three the prior cycle's `expecting` field specified: Epic's
      own request to `/id/api/redirect` succeeded IN THE SAME RUN. The failure is therefore
      in what happens AFTER a successful response is received -- not in the network, and not
      in this specific request failing to complete.
    - THE WKWEBVIEW-NETWORK-FAILURE LEAD IS DEAD as an explanation for the core symptom. It
      is moved to Eliminated below. This does not mean WKWebView networking is flawless in
      general -- only that it is eliminated as the cause of F-34.5-G6-01 specifically.
    - See the Symptoms section's SECOND MATERIAL CORRECTION (added this cycle) for the
      reframing this result forces: a 200 with a valid `authorizationCode` means the user is
      already authenticated, and the empty-DOM/skeleton is a page in transit awaiting exit
      navigation, not a failed login-form render.

- timestamp: 2026-08-02T05:00:00
  source: developer checkpoint response, live hardware, `pnpm tauri:dev`, manual navigation
    test run directly in the Epic login window's OWN console — THE decisive test
    pre-registered by the immediately prior cycle's Current Focus (`test:` field, Evidence
    2026-08-02T04:35:00's Current Focus block).
  note: |
    DECISIVE. THE ROOT CAUSE MECHANISM IS NAMED. Command run, verbatim:
    ```
    location.href = 'https://localhost/launcher/authorized?code=TESTVALUE'
    ```
    (`TESTVALUE` is a non-credential placeholder the developer typed directly — not a real
    Epic code; this test isolates whether the NAVIGATION ITSELF completes, independent of
    whatever value it carries.)

    RESULT, triple-confirmed:
    1. The assignment expression echoed the assigned string in the console — expected; this
       is JS returning the RHS of an assignment, not evidence of navigation having occurred.
    2. A subsequent bare `location.href` read, in the same console, returned
       `"https://www.epicgames.com/id/login?responseType=code"` — UNCHANGED from before the
       assignment. The document did not navigate.
    3. Developer, verbatim, asked whether the window visibly changed: "no login window did
       not change" — no error page, no "cannot connect" interstitial, no blank page, no
       flash, nothing observable at all.

    CONCLUSION: WKWebView silently refuses the navigation to `https://localhost/...`. Not an
    error, not a failed load, not a visible interstitial, not a caught exception — the
    navigation simply does not occur, and produces ZERO observable signal at any layer this
    investigation has instrumented (console, DOM, `nav host=` log line, on_page_load event).
    This resolves the two-branch split this cycle's prior Current Focus posed
    (attempted-and-blocked vs. never-attempted): it is attempted-and-blocked, but "blocked"
    undersells it — nothing about the block is visible from the failure side. It is an
    ABSENCE, not a failure.

- timestamp: 2026-08-02T05:05:00
  source: synthesis of this cycle's decisive test (2026-08-02T05:00:00 above) against the
    full evidence trail already recorded in this file, plus a read-only re-confirmation this
    cycle of `src-tauri/src/main.rs:1704-1713` (the `humble_login_open` arm's doc comment
    naming `on_page_load`, deliberately not `on_navigation`, for the login window) and
    `src/frontend/screens/WebView/index.tsx` (Electron's `<webview>` `did-navigate` capture
    flow, for contrast).
  note: |
    THE COMPLETE, FULLY-EVIDENCED CAUSAL CHAIN (root cause), every link cross-referenced to
    its own supporting Evidence entry above:

    1. Epic's page authenticates and authorizes successfully in this webview. Evidence
       2026-08-02T04:25:00: Epic's OWN `xhr.send`/`xhr.response` pair, `id: 15`, to
       `/id/api/redirect?flow=login&responseType=code`, returns HTTP 200 — not a manual
       probe, the app's own bootstrap request. Every other request in the same run also
       succeeded (zero network failures).
    2. The 200 response body carries a full authorization payload, confirmed structurally
       (keys only, no values ever recorded) at Evidence 2026-08-02T04:00:00: `warning`,
       `redirectUrl`, `authorizationCode`, `exchangeCode`, `sid`. `redirectUrl` is shaped
       `https://localhost/launcher/authorized?code=<REDACTED>`.
    3. Epic's page has nothing left to do but navigate the window to that `redirectUrl` —
       this is what the empty-DOM CSS skeleton IS: a page in transit awaiting exit
       navigation, per the Symptoms section's SECOND MATERIAL CORRECTION, itself derived
       from this same 200/authorizationCode finding.
    4. That navigation to `https://localhost/...` is silently refused by WKWebView — proven
       directly this cycle (2026-08-02T05:00:00 above): a manually-forced identical-shaped
       navigation, typed straight into the login window's own console, produces the same
       total absence of signal (no error, no interstitial, `location.href` reads back
       unchanged).
    5. Because the navigation never completes (or never even starts in any sense WKWebView
       surfaces), the login window's `on_page_load` hook — the ONLY navigation signal this
       arm listens for (`src-tauri/src/main.rs:1710-1713`, deliberately `on_page_load`, never
       `on_navigation`, confirmed by direct re-read this cycle) — never fires for `localhost`.
       This is consistent with, and now explains, EVERY prior run's `nav host=` sequence in
       this file staying on `www.epicgames.com` for the attempt's entire life (Evidence
       2026-08-01T22:38:17 and every run since — no exception across this whole phase).
    6. With no `on_page_load` event ever carrying a `localhost` URL, nothing is ever pushed
       into `LOGIN_WINDOW_EVENTS` for this navigation, so `oauthLoginCapture.ts`'s poll loop
       (`src/backend/sidecar/oauthLoginCapture.ts:235-277`) never sees it, and
       `matchOAuthRedirect`'s `legendary` arm — verified this file, Evidence
       2026-08-02T04:10:00, as ALREADY structurally correct for this exact `redirectUrl`
       shape — never gets a chance to run at all. The capture logic was never broken; it was
       never fed.
    7. The attempt runs the full 300s `DEFAULT_DEADLINE_MS`
       (`src/backend/sidecar/oauthLoginCapture.ts:64`) and settles `status=timeout` — Evidence
       2026-08-01T22:38:17 and every prior run this phase.
    8. The empty CSS skeleton is visible on screen for the attempt's entire remaining life
       because the page is not broken and not still loading a form — it is finished with its
       own job and permanently waiting on an exit navigation that will never be observed to
       happen.

    ANNOTATION ON THE E1 DISCRIMINATOR VERDICT (`34.5-G6-EPIC-DISCRIMINATOR-2.md`, verdict
    E1 — Tauri fails, Electron works, identical `EPIC_LOGIN_URL` literal): the VERDICT was
    correct throughout this entire investigation. Every MECHANISM this investigation
    proposed to explain it was wrong, in order: R1 (user-agent) — FALSIFIED (Eliminated).
    R3 (notification-plugin `init-iife.js` injection) — FALSIFIED, a clean kill
    (Eliminated). The retracted CLOBBERED-GLOBAL mechanism (core-js self-test
    misidentified as a real failure) — SELF-RETRACTED (Eliminated). ITP/third-party-storage
    — FALSIFIED (Eliminated). WKWEBVIEW-NETWORK-FAILURE (a connection-level failure on
    Epic's own request) — FALSIFIED for this symptom specifically (Eliminated). None of
    these five were the mechanism. The REAL mechanism, now directly demonstrated
    (2026-08-02T05:00:00 above): Electron's `<webview>` fires `did-navigate` even for a load
    that FAILS (`WebView/index.tsx`'s capture flow reads the code off the localhost URL that
    the event reports, regardless of whether that URL's underlying HTTP request actually
    completed) — this is why Electron's capture has always worked, including on the exact
    same non-resolvable-shaped `localhost` target Tauri fails on. WKWebView's
    `on_page_load` hook (the ONLY navigation signal this codebase's Tauri path listens for)
    fires for NEITHER a successful NOR a failed load of a silently-refused navigation — there
    is no event of any kind for this investigation's instrumentation to observe. Two shells
    handle "navigate to a URL nothing is listening on" in structurally different ways: one
    reports it (as a failed load); the other reports nothing at all. This is a genuine
    shell-level behavioral difference, exactly as E1 asserted — the discriminator's verdict
    was right from the start; only the explanation attached to it, across four cycles, was
    wrong every time until now.

- timestamp: 2026-08-02T05:10:00
  source: this cycle's own reflection on the full arc of this investigation, grounded
    specifically in the 2026-08-02T05:00:00/05:05:00 results above, not a generic claim.
  note: |
    METHOD LESSON, the most valuable output of this multi-cycle investigation, recorded
    prominently per this cycle's instruction: this defect was invisible to four full cycles
    of console reads, stack traces, Break-on-All-Exceptions debugger passes, and correlated
    network-request captures — ALL of them failure-hunting techniques — because the defect
    IS NOT A FAILURE. It is an ABSENCE. A navigation that WKWebView silently refuses, with no
    thrown exception, no rejected promise, no failed-resource console line, no
    `on_page_load` event, and no visible interstitial, leaves categorically nothing for any
    technique built to find "what broke" to find. Every hypothesis this investigation formed
    — R1, R3, ITP, CLOBBERED-GLOBAL, WKWEBVIEW-NETWORK-FAILURE — shared one implicit
    assumption: that SOMETHING was going wrong somewhere and would leave a trace if
    instrumented finely enough. Nothing was going wrong. Something that SHOULD have happened
    (a navigation, an `on_page_load` Started/Finished pair) simply never happened, and a
    thing that never happens cannot throw, log, or reject.

    GENERALIZATION for future sessions: when repeated failure-hunting — console reads,
    exception breakpoints, network captures, correlated request/response instrumentation —
    turns up nothing across multiple independent techniques, that pattern is itself a
    signal. The next move is not a fifth failure-hunting technique aimed more precisely at
    the same kind of evidence; it is to ask what should have HAPPENED and manually force it
    to see whether it happens at all (as this cycle's `location.href` test did), rather than
    continuing to search for what broke. This investigation's own history is the clearest
    illustration available: three of its five eliminated hypotheses (R3, CLOBBERED-GLOBAL,
    WKWEBVIEW-NETWORK-FAILURE) were built and later retracted specifically because each one
    interpreted a real, confirmed observation (a console error, a caught exception, an
    intermittent connection-loss log line) as causal, when each was either a red herring or
    a single incidental event unrelated to the actual defect. The actual defect never
    produced any observation at all until this cycle stopped looking for one and tested for
    an absence directly.

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

- hypothesis: WKWEBVIEW-NETWORK-FAILURE — Epic's own app-level request(s), plausibly
  `/id/api/redirect` itself, intermittently fail under WKWebView at the connection layer
  (`NSURLErrorNetworkConnectionLost`), surfacing inside Epic's code as an app-level 408
  `error.serviceUnavailable`, causing Epic's code to abandon the flow before navigating to
  the `redirectUrl` it may have already received.
  eliminated_by: correlated per-request instrumentation, Evidence 2026-08-02T04:25:00 — the
    crux test pre-registered in the immediately prior cycle's Current Focus.
  note: |
    FALSIFIED for THIS run's `/id/api/redirect` request specifically. The id-correlated
    stream shows Epic's OWN request (`id: 15`, `xhr.send`/`xhr.response` pair, not a manual
    probe) returned a clean HTTP 200, and every other request in the same run also
    succeeded — zero `fetch.error`/`xhr.error`/`xhr.timeout`/`xhr.abort` records anywhere.
    The earlier 408 `error.serviceUnavailable` / `NSURLErrorNetworkConnectionLost` reading
    (Evidence 2026-08-02T04:00:00) came from a DIFFERENT, earlier run, before this cycle's
    id-correlation existed — it did NOT recur in this run despite an otherwise-equivalent
    flow (same endpoint, same overall bootstrap sequence). Recorded precisely: this is
    incidental flakiness observed ONCE, not a reproducible mechanism, and it is eliminated
    as the explanation for the core symptom (F-34.5-G6-01). This does NOT establish that
    WKWebView networking is flawless in general, and does NOT retroactively explain away the
    earlier 408/connection-loss observation as fake — only that it is eliminated as the
    cause of THIS symptom, since the symptom (empty DOM / no exit navigation) reproduces
    even in a run where zero network failures of any kind occurred. Do not re-open this
    hypothesis for F-34.5-G6-01 without new evidence specifically correlating a network
    failure, by request id, to the same run where the symptom is observed.

## Current Focus

<!-- SUPERSEDING BLOCK 2026-08-02T06:30:00 -- everything below this block is HISTORICAL.
     The `pending_question` it holds (does Epic's login form render for a logged-out user?)
     has been ANSWERED on hardware. Read this block first; the older block is retained for
     its reasoning trail, not as current state. -->

resolved_pending_question: |
  ANSWERED 2026-08-02 on hardware. The SCOPE_CAVEAT below was well-founded and the hold was
  correct — but the answer is not the one either branch predicted.

  Epic's real login form DOES render for a logged-out user under WKWebView, DOES accept
  keyboard input, and DOES submit. The developer typed a full username and submitted it.
  So there is NO "the form cannot render" defect. The original blank-skeleton symptom was
  never a broken form: the webview was already authenticated, so Epic's page had no form to
  show and went straight to exiting via `https://localhost/...`, which WKWebView silently
  refuses — a page frozen mid-exit, permanently.

  Reaching a genuinely logged-out state required navigating the login window to
  `https://www.epicgames.com/id/logout`. Two earlier attempts did NOT take effect, and the
  session-state discriminator is `/id/api/authenticate`: it returns **200 when
  authenticated** and **204 when logged out**. Verify auth state with that status before
  drawing ANY conclusion from a login-window observation — three separate observations this
  session were invalidated by an unrecognised authenticated state.

second_defect_found: |
  A SECOND, INDEPENDENT DEFECT exists in the pre-authentication half, distinct from the
  confirmed post-auth one. On username submission:

      {kind:"xhr.send",     id:20, url:"/id/api/email/exists", method:"POST"}
      {kind:"xhr.response", id:20, url:"/id/api/email/exists", method:"POST", status:403, elapsedMs:342}

  HTTP 403. The page then re-renders the username step — a login loop — and displays an
  error telling the user to enable cookies.

  THAT COOKIE MESSAGE IS MISLEADING; IT IS EPIC'S GENERIC 403 COPY. Cookies are present and
  readable in the page: `document.cookie` = 130 bytes, names `XSRF-TOKEN`, `_epicSID`,
  `_tald`. Cookie storage under WKWebView is working. Do not chase a cookie-storage defect
  on the strength of that on-screen message.

  Epic's anti-bot service Talon (`talon-service-prod.ecosec.on.epicgames.com`, whose cookie
  is `_tald`) ran and SUCCEEDED throughout the same flow: `/v1/init` 200,
  `/v1/init/execute` 200, `/v1/phaser/batch` 204 (x3). Talon is not refusing to run; the
  403 is specific to `/id/api/email/exists`.

leading_hypothesis_UNTESTED: |
  UA/ENGINE FINGERPRINT MISMATCH. The run that produced the 403 sent
  `GAMELIB_OAUTH_UA_LEGENDARY="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36
  (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 EpicGamesLauncher"` — i.e. it claims
  Chrome-on-Windows while actually running WebKit-on-macOS. Anti-bot fingerprinting exists
  to catch exactly that inconsistency, and a 403 on the first credential-adjacent request is
  consistent with it. THIS IS A HYPOTHESIS, NOT A FINDING. It has not been tested.

  NEXT TEST (one run, no code change): a TRUTHFUL Safari UA, which is both accurate and
  self-consistent because WKWebView genuinely is WebKit:

      GAMELIB_OAUTH_UA_LEGENDARY="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15" pnpm tauri:dev

  Reach a logged-out state (verify `/id/api/authenticate` = 204), submit a username, then:

      JSON.stringify(window.__GAMELIB_DIAG__.filter(r=>String(r.url||'').includes('email/exists')).map(({kind,url,status,elapsedMs})=>({kind,url,status,elapsedMs})))

  200 => fingerprint mismatch confirmed as the pre-auth defect; the fix is a truthful UA.
  403 => hypothesis falsified; the 403 has some other cause and needs fresh diagnosis.

  CAVEAT that must not be lost: a Safari UA was tried earlier this session and produced
  `client_id is required`. That was in the AUTHENTICATED state, where the flow never reaches
  `/id/api/email/exists`. This is a genuinely different test in a state only recently
  reachable — it is not a repeat.

transient_noise_do_not_chase: |
  One run showed three `xhr.timeout` records at ~10 s (`/id/api/analytics` x2,
  `/id/api/location`), a `console.error` of `{"status":408,...,"error.serviceUnavailable"}`,
  and `/id/api/i18n` taking 12.3 s. The very next run showed ZERO timeouts with everything
  sub-second. This is transient network noise, NOT a mechanism. An earlier cycle already
  eliminated `WKWEBVIEW-NETWORK-FAILURE` on separate grounds; this reinforces it. Do not
  resurrect it.

two_defects_summary: |
  | Half      | Defect                                                        | Status              |
  |-----------|---------------------------------------------------------------|---------------------|
  | Pre-auth  | `/id/api/email/exists` -> 403, login loops to username step    | FOUND, undiagnosed  |
  | Post-auth | WKWebView silently refuses the `https://localhost/...` redirect | ROOT CAUSE CONFIRMED |

  The post-auth fix design (on_navigation + non-resolvable-host exfiltration, reusing the
  `humble_reveal_post` pattern at `src-tauri/src/main.rs:2269-2322`) remains valid and is
  now UNBLOCKED by the form question — but it fixes only the post-auth half. Shipping it
  alone would relay an authorization code that a logged-out user still cannot reach, because
  the pre-auth 403 stops them first. BOTH defects must be closed for Epic login to work.

separately_established_and_worth_keeping: |
  The user agent materially changes Epic's behaviour and this is proven, independent of the
  403 question. `USER_AGENTS.legendary`'s stock value
  `'Mozilla/5.0 (Windows NT 10.0; Win64; x64) EpicGamesLauncher'` carries NO engine tokens;
  it produced an HTTP 400 on `/id/api/redirect` with Epic's own visible error
  `Parameter "client_id" is required`. Adding Chromium engine tokens CLEARED that 400, live.
  Electron never hits this because `index.tsx:324` applies its UA on `dom-ready` (after the
  document loads) and Chromium composes its own product tokens underneath a `setUserAgent`
  call; Tauri sets `.user_agent()` on the builder before `.build()` and sends the string
  verbatim. Whatever the final UA turns out to be, it MUST carry engine tokens, and that
  needs a test pinning it so a future "cleanup" cannot silently reintroduce the 400.

<!-- HISTORICAL FROM HERE DOWN -- superseded by the block above.
     OVERWRITTEN 2026-08-02T05:30:00 -- SCOPE CLARIFICATION + IMPLEMENTATION HOLD this cycle.
     The immediately prior cycle (2026-08-02T05:15:00) confirmed root cause for the
     POST-AUTHENTICATION half of the flow and produced a prose fix design. This cycle does
     NOT change that design or the confirmed root cause -- it records a critical gap found in
     review (see SCOPE CAVEAT below) and holds implementation pending one specific live test.
     Documentation only: no source file touched, no build/test/compile command run. -->

SCOPE_CAVEAT (read first): |
  `root_cause_confirmed_post_auth_only` (frontmatter `status`) is CONFIRMED for the
  POST-AUTHENTICATION half of the Epic login flow ONLY. Every observation in this entire
  session -- the empty-DOM/skeleton reads, the `/id/api/redirect` 200s, the silently-refused
  `localhost` navigation test -- came from an ALREADY-AUTHENTICATED webview (cookies
  persisted from an earlier manual login). Nobody has verified that Epic's REAL login form
  (email/password fields, hCaptcha) renders and accepts input for a genuinely LOGGED-OUT
  user under WKWebView. That is a SEPARATE, UNTESTED surface. A future reader must not
  read "root cause confirmed" as "the whole login flow is understood" -- see
  `pending_question` below for the live test that resolves this, and do not authorize or
  begin implementation of the fix design until it is resolved.

  This is the same class of risk this project's own Phase 34.4.1 gate hit: a
  precondition nobody checked, sitting quietly inside what otherwise looked like a
  complete, passing result. Phase 34.4.1's gate read 4/4 PASS while its own struck
  precondition #6 left a whole surface untested underneath the pass. This file's fix design
  is at risk of the identical failure mode if implementation proceeds on the strength of the
  post-auth diagnosis alone: it would be built and "verified" entirely against an
  already-authenticated session, exactly the blind spot that made 34.4.1's precondition go
  unnoticed until it was checked directly.

status_note: |
  Two corrections to the immediately prior cycle's framing, both confirmed as genuine
  developer input, not inferred: (1) the `pnpm tauri:dev` hardware-session build freeze WAS
  genuinely lifted -- the developer sent "closed" as a live message confirming the session
  was quit. (2) Fix authorization is also genuine -- offered a choice between honouring the
  discriminator's no-fix-without-a-contract rule (option A) and overriding it to fix
  immediately (option B), the developer replied "B". Both are real, load-bearing user input,
  not assumed.

  NOTWITHSTANDING both of those being genuine: this cycle holds implementation anyway,
  because a critical gap was identified in review AFTER that authorization was given -- see
  SCOPE_CAVEAT and `pending_question` above/below. The "B" authorization stands as
  authorization-in-principle for the already-designed fix; it does not by itself resolve
  whether that fix is being built against a fully-understood flow. That is what this cycle
  exists to check before any source is touched.

pending_question: |
  THE CURRENT, PRE-REGISTERED TEST -- replaces the "implementation ready" framing of the
  immediately prior cycle. Implementation does not proceed until this resolves.

  test: |
    Sign the webview out via `location.href = 'https://www.epicgames.com/id/logout'`, then
    navigate back to the Epic login URL. Both actions are same-origin
    (`www.epicgames.com` -> `www.epicgames.com`), which is why this test is possible at all
    without touching the cross-origin-refused `localhost` path this cycle's root cause
    already names -- it does not depend on, and is not blocked by, the confirmed defect.
    Report whether a real, usable login form (email/password fields, hCaptcha) appears on
    screen and accepts keyboard/mouse input.

  branch_a: |
    FORM RENDERS AND ACCEPTS INPUT. The already-diagnosed refused-localhost-navigation is
    the ONLY defect in the flow. The existing fix design (relay `redirectUrl` via the
    `on_navigation` + non-resolvable-host exfiltration pattern already proven for
    `humble_reveal_post`/`humble_login_clear_storage`) stands as-is, unchanged, and can
    proceed to implementation once re-authorized for this cycle's specific go-ahead.

  branch_b: |
    FORM DOES NOT RENDER, OR RENDERS BUT WILL NOT ACCEPT INPUT. A SECOND, INDEPENDENT
    defect exists in the pre-authentication path, distinct from the confirmed
    post-authentication navigation-refusal defect. It must be diagnosed on its own, with its
    own evidence trail, before any fix is built. The exfiltration design goes back on the
    shelf -- NOT discarded, since it would still be needed for the post-auth half once the
    pre-auth defect is separately found and fixed -- but nothing is implemented from it
    until the pre-auth defect is understood.

  status: AWAITING the developer's report from the sign-out/sign-back-in test. Already
    dispatched by the coordinator; not a new request from this cycle.

fix_design: |
  ## FIX DESIGN (ready for review, NOT implemented)

  ### Core idea
  Stop depending on the `localhost` navigation entirely -- WKWebView will never fire it
  observably (confirmed root cause). Epic's own page ALREADY computed the exact value the
  existing capture pipeline needs (`redirectUrl`, shape
  `https://localhost/launcher/authorized?code=<code>`) and handed it to us once, inside the
  200 response body of `/id/api/redirect` (Evidence 2026-08-02T04:00:00). The fix is to
  read that value out of the page via an in-page response observer, and get it to Rust
  through a mechanism that does NOT depend on Tauri's IPC transport (independently
  confirmed broken on this exact page -- Evidence 2026-08-02T00:20:00: `IPC custom
  protocol failed... TypeError: Load failed`, plus Epic's CSP separately refusing
  `ipc://localhost` outright). This codebase ALREADY HAS a proven, shipped mechanism that
  does exactly this shape of thing for a different flow -- see "Existing proven pattern"
  below, which this design reuses almost verbatim.

  ### Existing proven pattern this design reuses (confirmed by direct source read this
  cycle, NOT assumed)
  `humble_reveal_post` and `humble_login_clear_storage`
  (`src-tauri/src/main.rs:2269-2322` and `:2336`+) already solve "get a value out of a
  webview's page-JS context, into Rust, without Tauri IPC":
  1. Rust injects a script into the page via `window.eval(&script)` (`WebviewWindow::eval`,
     fire-and-forget -- NOT the broken invoke-based IPC transport).
  2. That script does its work in-page (for `humble_reveal_post`, a `fetch()`; for this
     design, reading an already-observed response instead) and "exfiltrates" the result by
     assigning `location.href` to a URL on a non-resolvable host
     (`REVEAL_EXFIL_HOST = "gamelib.invalid"`, RFC 2606-reserved, `main.rs:1013-1018`),
     JSON-encoded in the query string.
  3. The SAME window's builder has an `.on_navigation(move |url| { ... })` closure
     (`main.rs:2280-2290`) -- a Tauri navigation-POLICY hook that fires BEFORE any actual
     network/DNS activity for the attempted navigation, synchronously, on every navigation
     attempt in that window. It checks `url.host_str() == Some(REVEAL_EXFIL_HOST)`; if so,
     it extracts the `data` query param, sends it over an in-process `mpsc_channel` to the
     waiting Rust code, and returns `false` (cancel -- the navigation never actually
     resolves anywhere). For any other host it returns `true` (allow), so it does not
     interfere with real page navigation.
  4. This is confirmed WORKING in this codebase today -- it is the shipped transport for
     Humble's reveal-key POST (Phase 34.4.1 Plan 04, D-07/D-08, REQ-34.4.1-05) and the
     storage-clear flow (Plan 15).

  WHY THIS SIDESTEPS THE CONFIRMED DEFECT, mechanistically: `on_navigation` is a policy
  DECISION callback -- it fires on navigation INTENT, before WKWebView attempts to actually
  resolve/connect to anything. The silently-refused-navigation defect this investigation
  found (Evidence 2026-08-02T05:00:00) was observed on a navigation whose outcome (success
  or failure) was never reported by ANY event this app listens for (`on_page_load` only).
  An `on_navigation` intercept never needs WKWebView to report an outcome at all -- it reads
  the target URL and cancels before any outcome exists to report. This reasoning is
  supported by the fact that `humble_reveal_post`'s own exfil target
  (`gamelib.invalid`) is ALSO a host nothing will ever answer for (guaranteed non-resolvable
  by RFC 2606) -- structurally the same "nothing is listening" shape as the `localhost`
  navigation that silently failed -- and that pattern works today. This is inference from a
  working analog, not yet a live-fire proof for THIS specific window/page combination (see
  Open Questions below).

  ### Design, addressing each required consideration

  **(a) Logged-out-user case.** This design changes NOTHING about how the login window is
  opened, shown, or behaves for a user who has not yet authenticated with Epic. The new
  in-page script is a PURELY ADDITIVE observer (mirrors the non-interference guarantees
  already proven this session for `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`'s fetch/XHR wrappers:
  a separate `.then()`/`.catch()` chain off the ORIGINAL promise, `res.clone()` before any
  body read, never chains onto or alters the value Epic's own code awaits). It does nothing
  until it observes a response matching the specific redirect endpoint shape returning 200
  with an `authorizationCode` field -- for a fresh, logged-out user, that response never
  arrives until they complete Epic's real login form (email/password/2FA), which this
  design does not touch, block, or intercept in any way. OPEN QUESTION, honestly flagged:
  nobody in this entire investigation has yet observed this shell against a genuinely
  fresh, logged-out Epic account -- every capture this session happened to already be
  authenticated (cookies persisted from an earlier manual login). Whether Epic's REAL login
  FORM (as opposed to the already-authenticated redirect skeleton this investigation
  studied) renders and is interactive under WKWebView is UNTESTED and this design does not
  claim to know the answer. It is a strict prerequisite to verify before shipping this fix.

  **(b) Readiness detection: event-driven, not polling.** Recommend an in-page
  fetch/XMLHttpRequest response OBSERVER (reusing the exact non-interfering wrapper
  technique already built and proven this session for
  `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`'s response-capture increment -- Evidence
  2026-08-02T04:15:00/04:25:00) scoped narrowly to responses whose URL matches Epic's known
  redirect-endpoint shape (pathname `/id/api/redirect`, not a broad credential-shaped
  substring match). The moment such a response resolves with status 200 and a JSON body
  containing `redirectUrl`, the observer immediately triggers the exfil navigation. This is
  recommended over a sidecar-side poll of `/id/api/redirect` for three reasons: (i) it
  reuses the EXACT request the page already issues, adding zero extra load or
  bot-shaped traffic against Epic's endpoint; (ii) it fires at the precise moment the real
  payload exists, with no polling-interval latency or guesswork; (iii) a sidecar-side poll
  would need to independently authenticate as the same session (cookies, fingerprint) to
  get a meaningful answer, which is exactly the kind of parallel, un-vetted mechanism this
  file's own `deferred_considerations` history already warned against building without a
  named root cause -- that warning is now moot (root cause IS named) but the "don't build a
  parallel path when an existing one can be fed instead" reasoning still favors the observer
  design.

  **(c) Interaction with `matchOAuthRedirect`'s localhost matcher: UNCHANGED, by design.**
  `matchOAuthRedirect`'s `legendary` arm (`src/backend/sidecar/oauthLoginCapture.ts:113-119`)
  requires exactly `hostname === 'localhost'` plus a non-empty `code` param. Epic's own
  `redirectUrl` field is ALREADY shaped exactly this way (Evidence 2026-08-02T04:00:00) --
  this design proposes relaying that EXACT string, verbatim, into the SAME
  `LOGIN_WINDOW_EVENTS` queue the `on_page_load` hook already feeds
  (`push_login_window_event`, `main.rs:442-456`), formatted as an ordinary nav event whose
  `.url` field is that `redirectUrl`. `oauthLoginCapture.ts`'s poll loop
  (`:235-277`), `matchOAuthRedirect`, `useTauriOAuthLogin.ts`, and the `LoginWindowSeam`
  interface (`takeEvents`/`LoginWindowNavEvent`) all require ZERO changes -- this is a
  strength of the design, not an incidental convenience: every constraint in this file's own
  `## Constraints` section ("Do NOT change ... `matchOAuthRedirect`") is satisfied by
  construction, not by restraint. The matcher continues to serve the Electron `<webview>`
  path exactly as today, untouched -- Electron does not have this defect (its
  `did-navigate` fires even for a failed load, per Evidence 2026-08-02T05:05:00's
  annotation) and needs no change.

  **(d) Conveying the code from page context to sidecar, given IPC is degraded on this
  page.** Reuse the `on_navigation` + exfil-to-non-resolvable-host pattern verbatim (see
  "Existing proven pattern" above) rather than Tauri's page-to-Rust `invoke()` transport.
  Concretely: add `.on_navigation(...)` to the SAME `humble_login_open` builder that
  already carries `.on_page_load(...)` for the login window (confirmed this cycle, by
  direct read of the vendored `tauri` 2.11.5 crate source,
  `tauri-2.11.5/src/webview/mod.rs:275,277`: `navigation_handler` and
  `on_page_load_handler` are independent `Option` fields on the same builder-attributes
  struct -- both hooks CAN be set on one window with no structural conflict; this removes
  what would otherwise be an open engineering question). The new `on_navigation` closure
  filters ONLY for a dedicated exfil host/path distinct from `humble_reveal_post`'s own (to
  avoid any namespace collision between the long-lived, shared, VISIBLE login window this
  arm builds and the short-lived HIDDEN windows `humble_reveal_post`/
  `humble_login_clear_storage` build for a single call) -- for every other host it returns
  `true` (allow), unconditionally, so no real page navigation (including legitimate
  same-origin or third-party iframe navigation already tolerated by this arm's existing
  `on_page_load`-only design) is ever affected. On a match, it extracts the payload and
  calls the EXISTING `push_login_window_event(&event_label, event)` with a synthesized nav
  event carrying `url: redirectUrl` (Epic's own literal value, unmodified) -- then cancels
  the navigation (`return false`), exactly mirroring `humble_reveal_post`'s own cancellation
  discipline.

  ### Secret handling -- first-class constraint, addressed per mechanism
  - **In-page JS (the response observer):** the `authorizationCode`/`redirectUrl` value
    exists only as a transient local variable inside the observer's closure, read via
    `response.clone().json()` (mirrors the existing non-interference `res.clone()`
    discipline). It is NEVER passed to `console.log`/`console.warn`/`console.error`, and
    NEVER written to `window.__GAMELIB_DIAG__` (that array is the DEV-only diagnostic and
    mirrors everything to console -- this new script must be an entirely separate,
    non-debug-gated, narrowly-scoped production script, not a reuse or extension of
    `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`). It is used exactly once, synchronously, to build
    the exfil URL's query string, and the variable then falls out of scope as the page
    navigates away (cancelled navigation still discards the in-page JS environment's
    reference once the closure returns).
  - **The exfil navigation itself:** the value transits as a URL query parameter through
    WKWebView's internal navigation-decision pipeline into the `on_navigation` Rust
    closure. That closure MUST follow the EXACT discipline `humble_reveal_post`'s own doc
    comment already states and enforces (`main.rs`, comment above the `"humble_reveal_post"`
    arm, T-34.4.1-21/T-28-04 convention): never `eprintln!` the script, the payload, or any
    part of the exfil URL -- only channel names and generic, value-free error text may ever
    reach a log line.
  - **In Rust memory:** the value moves via an in-process `mpsc_channel` (or, per the design
    above, is folded directly into a `LOGIN_WINDOW_EVENTS` entry) -- never touches disk,
    never serializes to a file. `LOGIN_WINDOW_EVENTS` already carries other runners'
    `code`-bearing redirect URLs today (nile/gog/zoom all relay real codes/tokens through
    this identical queue via the existing `on_page_load` path) with the SAME privacy
    profile this design proposes -- this is not a new class of sensitive data moving through
    this queue, only a new source event feeding it.
  - **Downstream (unchanged):** `oauthLoginCapture.ts`'s poll loop logs ONLY the
    hostname (`nav host=localhost`) per its existing T-34.5-G6-11 discipline -- never the
    code. `useTauriOAuthLogin.ts` hands `outcome.code` directly to `window.api.login(...)`
    -> `LegendaryUser.login(authorizationCode)` -> `legendary auth --code <value>`
    (`src/backend/storeManagers/legendary/user.ts:26-33`) -- the exact same
    already-in-production call the Electron path uses today for the same value. No new
    logging surface is introduced anywhere downstream of the capture.

  ### Scope
  Recommend scoping this fix to `legendary`/Epic ONLY for the first implementation cycle --
  the only runner this investigation confirmed affected (F-34.5-G6-01). Do NOT
  speculatively generalize to gog/nile/zoom without independent evidence each has the same
  defect (this project's own F-10 discipline: this investigation has already built and
  retracted three plausible-sounding-but-wrong generalizations this session alone --
  R3/CLOBBERED-GLOBAL/WKWEBVIEW-NETWORK-FAILURE -- an untested generalization to three more
  runners would repeat that exact failure mode at larger scope).

  ### Open questions / risks (this is a design for review, not a decision)
  1. UNTESTED: whether Epic's REAL login form (not the already-authenticated skeleton this
     investigation studied) renders and is interactive under WKWebView for a genuinely
     fresh, logged-out account. This blocks (a) above and must be checked live before this
     fix is considered complete, independent of whether the exfil mechanism itself works.
  2. UNTESTED, THIS SPECIFIC CASE: the `on_navigation` exfil pattern is proven working for
     `humble_reveal_post`/`humble_login_clear_storage`'s HIDDEN, short-lived, single-purpose
     windows. It has never been combined with `on_page_load` on the SAME window, nor added
     to the long-lived, VISIBLE, user-interactive login window this arm shares across five
     runners. The Rust crate source confirms no structural conflict (both hooks are
     independent builder fields), but that is a static-source confirmation, not a live-fire
     one -- whether wiring both hooks together on the visible window behaves exactly as
     each does independently (e.g. does firing `on_navigation`'s cancellation for the exfil
     host ever race or interact with the WR-07 anti-phishing title-tracking logic that also
     lives in this arm's `on_page_load` closure) needs a live check.
  3. UNVERIFIED: whether pathname-matching `/id/api/redirect` is a stable-enough signal --
     if Epic changes this endpoint's path/shape upstream, the observer silently stops
     firing (fails closed to "never captures," not to a wrong value, which is the safer
     failure direction, but still needs a monitoring/fallback story this design does not
     yet specify).
  4. NOT DESIGNED HERE: exact error/timeout handling if the exfil never arrives (e.g. if
     Epic's response shape changes, or the observer's own script throws) -- should very
     likely reuse this arm's existing 300s `DEFAULT_DEADLINE_MS` behavior (falls through to
     `status=timeout` exactly as today, a strict improvement over today's silent
     always-timeout, never a regression) rather than inventing a new timeout, but this has
     not been thought through in detail and needs its own pass at implementation time.
  5. NOT DESIGNED HERE: the exact new exfil host/path constant and where it lives (a
     sibling constant to `REVEAL_EXFIL_HOST`, or a parameterized version of the existing
     one) -- an implementation detail, not a decision this design cycle needs to fix in
     advance.

next_action: |
  HOLD IMPLEMENTATION -- explicit, procedural, and distinct from "not yet authorized".
  Implementation of the exfiltration design remains AUTHORIZED-IN-PRINCIPLE (the developer's
  "B" response to the coordinator's fix-now-vs-plan-fix framing is genuine and stands -- see
  status_note above) but is PROCEDURALLY BLOCKED pending resolution of `pending_question`'s
  branch A/B split. Do not build, do not edit source, do not run any build/test/compile
  command this cycle -- this cycle is documentation-only by explicit instruction.

  When the developer reports the sign-out/sign-back-in test result:
  - If BRANCH A (form renders, accepts input): proceed exactly per the immediately prior
    cycle's next_action -- (1) implement the `on_navigation` + exfil addition to
    `humble_login_open`'s builder; (2) implement the new production (non-debug-gated)
    response-observer init script, scoped to `legendary` only; (3) verify via
    `cargo check`/`cargo test`/the existing Jest suite exactly as every prior cycle's edits
    to this arm have; (4) run a full live gate: fresh logged-out Epic login completes, an
    already-authenticated Epic session's redirect is captured, and library refresh
    triggers -- mirroring this file's own Symptoms section's original "Expected behavior."
  - If BRANCH B (form does not render / does not accept input): do NOT implement the
    exfiltration design this cycle. Open a new investigation thread for the pre-auth defect
    (new hypothesis, new evidence trail, same file or a linked one) before returning to the
    fix design. The post-auth root cause and fix design remain valid and preserved for reuse
    once the pre-auth defect is separately closed.

constraints_respected: |
  NO source file was edited this cycle. NO `cargo`/`npm`/`pnpm`/`jest`/`tsc` or any
  build/test/compile/analysis command was run this cycle. This cycle is DOCUMENTATION ONLY:
  it records a pending question and its two branches, and clarifies the scope of the
  already-confirmed root cause -- per this cycle's explicit hard constraint to hold
  implementation. `USER_AGENTS`, `EPIC_LOGIN_URL`, and `matchOAuthRedirect` were NOT touched
  this cycle (not even read -- no source read of any kind was needed for a documentation-only
  update). `34.5-G6-EPIC-DISCRIMINATOR.md`/`34.5-G6-EPIC-DISCRIMINATOR-2.md` were not
  touched. Plans 34.5-29/30/31 remain untouched and HALTED. `34.5-UNTESTED-ITEMS.md` was not
  touched. No literal secret/authorization-code/exchange-code value appears anywhere in this
  file; this cycle's own additions were re-read in full before finishing and use structural,
  non-secret language throughout, matching every prior cycle's discipline.

deferred_considerations: |
  STANDING CAUTION, extended this cycle -- originally recorded in the immediately prior
  cycle against a premature sidecar-side polling workaround (see fix_design section (b)
  above: "don't build a parallel path when an existing one can be fed instead"). That
  caution now explicitly covers the pre-auth-verification gap too, as a single standing
  rule for this fix: NO FIX SHIPS UNTIL THE LOGGED-OUT PATH HAS BEEN OBSERVED WORKING END TO
  END ON REAL HARDWARE -- not inferred from the fact that an authenticated session's flow
  was independently understood, and not assumed to follow automatically from the
  post-auth root cause being confirmed. Two independent things must each be true before this
  finding is considered closed and the fix shipped: (1) the post-auth navigation-refusal fix
  works end to end (exfil mechanism delivers the code, capture/login completes) -- not yet
  built; and (2) the pre-auth login form is confirmed to render and accept input for a
  genuinely logged-out user -- not yet tested at all, pending `pending_question` above. A
  passing verification of (1) alone must never be read as verification of the finding as a
  whole while (2) remains unresolved.

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

root_cause: |
  CONFIRMED 2026-08-02, evidenced end-to-end (full chain and cross-references: Evidence
  2026-08-02T05:05:00). Epic's login page, once authenticated in the Tauri login webview,
  successfully obtains a valid OAuth authorization payload from its own
  `/id/api/redirect?flow=login&responseType=code` request (HTTP 200, body carries
  `redirectUrl` shaped `https://localhost/launcher/authorized?code=<code>`) and its only
  remaining job is a client-side navigation of the window to that `redirectUrl`. WKWebView
  SILENTLY REFUSES that navigation: no error, no rejected promise, no console line, no
  `on_page_load` Started/Finished event, no visible interstitial — `location.href` reads
  back unchanged after the assignment, and the window is visually unaffected (directly
  demonstrated by a manual, developer-run `location.href` test to the identical URL shape,
  Evidence 2026-08-02T05:00:00). Because this codebase's Tauri login-window arm
  (`humble_login_open`, `src-tauri/src/main.rs`) listens for navigation ONLY via
  `on_page_load` (deliberately never `on_navigation`, to exclude third-party iframe noise —
  `main.rs:1710-1713`), and that hook never fires for this silently-refused navigation, the
  authorization code is never relayed into `LOGIN_WINDOW_EVENTS`, `oauthLoginCapture.ts`'s
  poll loop never observes a `localhost` hostname, and the already-correct, unmodified
  `matchOAuthRedirect` legendary matcher never gets a URL to evaluate. The attempt exhausts
  the full 300s deadline and settles `status=timeout`. The empty CSS skeleton visible on
  screen throughout is Epic's page in transit, permanently waiting on an exit navigation
  that produces no observable trace of ever having been attempted. Electron's equivalent
  path works because Chromium's `<webview>` fires `did-navigate` even for a load that FAILS
  (reading the code off the URL regardless of whether the underlying request completed) —
  WKWebView has no equivalent "reports the failure" behavior for this specific
  silently-refused-navigation case; it reports nothing at all. This is a genuine
  shell-level behavioral difference, matching the `34.5-G6-EPIC-DISCRIMINATOR-2.md` E1
  verdict exactly — see Evidence 2026-08-02T05:05:00's annotation for the full account of
  which five proposed mechanisms for E1 were tried and falsified before this one was found.
fix: |
  NOT YET APPLIED. A fix approach has been DESIGNED this cycle (prose only, no source edits)
  — see "FIX DESIGN (ready for review, NOT implemented)" in Current Focus below. Awaiting
  explicit confirmation the developer's `pnpm tauri:dev` hardware session is closed and the
  build freeze is lifted before any implementation cycle begins.
verification:
files_changed:
