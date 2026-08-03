---
status: resolved_pending_cleanup_sidlogin_pivot_live_verified_pre_auth_2026_08_03_f_34_5_g6_01_and_phase_34_5_remain_open_two_reconciliation_items_owed_deferred_dead_code_removal_and_34_5_untested_items_ledger_edit
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
updated: 2026-08-03T17:00:00
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

- timestamp: 2026-08-02T07:00:00
  source: developer checkpoint response, live hardware, `pnpm tauri:dev`, truthful Safari-on-macOS
    UA (`GAMELIB_OAUTH_UA_LEGENDARY` set to the WebKit/macOS Safari string) — THE decisive test
    pre-registered in the immediately prior cycle's `leading_hypothesis_UNTESTED` (Current Focus
    superseding block dated 2026-08-02T06:30:00), run against its two-branch 200/403 prediction.
  note: |
    RAW RESULT FIRST, per this file's own F-10 discipline. Preconditions confirmed TWICE via the
    instrumentation itself: `/id/api/authenticate` GET returned 204 (xhr, id 12; fetch, id 22) —
    genuinely logged out — plus an explicit `[CHECK] auth status – 204` console probe. Truthful
    Safari UA confirmed in effect. Real login form rendered and accepted a username submit
    (bodyLen 14951).

    THE CRUX RESULT — matches NEITHER pre-registered branch:
    ```
    {kind:"xhr.send",    id:30, url:"/id/api/email/exists", method:"POST", bodyLen:14951}
    {kind:"xhr.timeout", id:30, url:"/id/api/email/exists", method:"POST", status:0}
    ```
    No `xhr.response` for id 30 at all — not 200, not 403, a client-side timeout with zero HTTP
    status ever observed. On-screen: "service is temporarily unavailable" — a DIFFERENT failure
    surface than the earlier 403 run's "enable cookies" copy. `elapsedMs` for id 30 was not
    visible in the developer's report; PENDING, not zero — not yet supplied.

    DOMINANT NEW PATTERN, same run: five separate `xhr.error`/`NSURLErrorNetworkConnectionLost`
    records on OTHER requests (`/v1/init` id 15, `/v1/phaser/batch` ids 16/17/26/31 — bodyLens
    92/105/177/824/1038), each independently retried by Epic's OWN code and each retry
    succeeding at an identical body size (ids 18/19/20/21/25/27/28/29/32, all 200/204). Not
    size-correlated — 92 through 1038 all failed once and all succeeded on retry. `id:30`
    (`/id/api/email/exists`) is the ONE request in this run with no successful retry visible —
    Epic's own XHR timeout fired on it instead. Also observed: an hCaptcha
    "[Rate limited or network error. Please retry.]" `console.error`, and a 429 on Sentry's
    `envelope` ingest endpoint.

    Developer's own caveat, preserved: the email/exists filter one-liner was run BEFORE the
    username submit in this session, returning `[]`; the id:30 records above come from the
    live `[GAMELIB-DIAG]` stream itself (not that filtered query), so they are trustworthy
    independent of that ordering mistake.

- timestamp: 2026-08-02T07:00:30
  source: this cycle's synthesis of the entry immediately above, against `leading_hypothesis_UNTESTED`'s
    pre-registered branches and the `transient_noise_do_not_chase` block (both in the now-historical
    Current Focus superseding block dated 2026-08-02T06:30:00).
  note: |
    NEITHER pre-registered branch (200 confirms fingerprint; 403 falsifies it) occurred. The
    result is CONFOUNDED, not inconclusive-by-absence: two variables changed between the 403 run
    (fake Chrome-on-Windows UA, no connection-lost noise reported) and this run (truthful Safari
    UA, five connection-lost failures elsewhere in the same run) simultaneously — UA truthfulness
    AND network-noise level. A single run varying two things at once cannot attribute the
    different outcome to either one alone. The fingerprint hypothesis is therefore NEITHER
    confirmed NOR cleanly falsified by this run; do not treat it as either.

    RE-OPENING `transient_noise_do_not_chase`, EXPLICITLY, PER THE DEVELOPER'S OWN CHECKPOINT
    INSTRUCTION, WITH SCOPE STATED PRECISELY:
    - What that block dismissed: a single run showing three `xhr.timeout` records (~10s,
      analytics x2 + location) plus a 408 `error.serviceUnavailable` console line plus a slow
      i18n call, on the strength that "the very next run showed ZERO timeouts."
    - What is now known that block did not have: a THIRD data point (this entry) showing the
      same family of signal (connection-loss-shaped failures, `error.serviceUnavailable`-adjacent
      symptoms) recurring — this time consuming the run's crux request outright rather than
      appearing only on peripheral telemetry calls.
    - What does NOT reopen: the Eliminated section's `WKWEBVIEW-NETWORK-FAILURE` entry
      (eliminated_by Evidence 2026-08-02T04:25:00) is SCOPED explicitly to the POST-AUTH
      navigation-refusal symptom (F-34.5-G6-01's `/id/api/redirect` request specifically) and
      remains correctly eliminated for THAT symptom — that elimination's own run showed zero
      network failures anywhere while still reproducing the post-auth symptom, a clean,
      unconfounded result unrelated to today's pre-auth question. It is not touched or
      re-litigated by this entry.
    - What DOES reopen: for the PRE-AUTH `/id/api/email/exists` failure specifically (the SECOND,
      INDEPENDENT defect this session, distinct from the post-auth one), WKWebView connection
      instability is now an ACTIVE, UNELIMINATED candidate mechanism, standing ALONGSIDE the
      UA/fingerprint hypothesis, NOT in place of it. Both remain live. The
      `transient_noise_do_not_chase` dismissal, as originally written, was premature for the
      PRE-AUTH email/exists question — it was written before this question existed as a separate
      line of inquiry, and its "one clean run afterward" evidence base is now demonstrably not
      representative of every run.

    A THIRD, PREVIOUSLY UNCONSIDERED CANDIDATE MECHANISM, surfaced by this run's own shape: every
    OTHER failing request in this run got a same-shape retry from Epic's own bundle and
    recovered; email/exists did not. This is consistent with Epic's client code applying either
    no retry policy, or a materially shorter configured `.timeout`, to this specific
    validation-shaped endpoint — independent of UA — which would make it disproportionately
    vulnerable to whatever connection-establishment jitter WKWebView is intermittently
    producing, regardless of which UA string is sent. NOT yet evidenced either way — see the
    instrumentation edit and next discriminator below, both aimed at testing it directly without
    requiring more probabilistic live-hardware retries than necessary.

- timestamp: 2026-08-02T07:05:00
  source: this cycle's edit, `src-tauri/src/main.rs` (`DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`, XHR
    `send` wrapper), verified via `cargo check`, `cargo test`, and
    `npx jest src/backend/__tests__/tauriShellSource.test.ts`
  note: |
    Added a single READ-ONLY capture: `configuredTimeoutMs` on every `xhr.send` record, sourced
    from `this.timeout` (the numeric property Epic's OWN page code sets on the `XMLHttpRequest`
    instance before calling `.send()`, if it sets one at all) at send time. Nothing is assigned;
    only read. Recorded as `undefined` when the page left the value at its default (0/unset —
    "no explicit timeout"). This targets the third candidate mechanism above directly: whether
    `/id/api/email/exists` carries a materially SHORTER page-configured timeout than sibling
    calls that recovered via retry in the same run, which would explain its vulnerability to
    WKWebView connection jitter independent of any UA question. Purely additive, same
    non-interference discipline as every prior addition to this constant this session (no
    handler overwritten, nothing chained onto a value Epic's code awaits).

    VERIFIED: `cargo check` (src-tauri) — 0 errors. `cargo test` (src-tauri) — 92 passed, 0
    failed, 1 ignored — identical counts to every prior verification entry this file. `npx jest
    src/backend/__tests__/tauriShellSource.test.ts` — 46/46 passing, no test modification
    needed (same reason as every prior cycle's edit to this constant: this test file has zero
    references to `DEV_LOGIN_DIAGNOSTIC`/`configuredTimeoutMs`/`xhr.send`, so none of its
    arm-body/negative-bound string-match assertions can see this addition).

    GATING unchanged: `#[cfg(debug_assertions)]` AND `if visible`, identical to every other
    addition to this constant. No secrets, headers, or cookies captured by this addition — a
    single numeric property, already visible to any page script that reads its own XHR
    instance.

- timestamp: 2026-08-02T07:15:00
  source: developer checkpoint response, live hardware, `pnpm tauri:dev`, truthful Safari-on-macOS
    UA, session RESTARTED after the `configuredTimeoutMs` diagnostic (Evidence 2026-08-02T07:05:00)
    was added — this is the ONE more live run `next_discriminator` (prior Current Focus superseding
    block, 2026-08-02T07:10:00) requested.
  note: |
    RAW RECORDS, verbatim (structure/status/timing only — no credential-shaped values were present
    in any of these records to begin with):
    ```
    {kind:"xhr.send", id:25, url:"https://talon-service-prod.ecosec.on.epicgames.com/v1/phaser/batch",
     method:"POST", bodyLen:972, configuredTimeoutMs:25000, t:1785632888150}
    {kind:"xhr.send", id:26, url:"/id/api/email/exists", method:"POST", bodyLen:15695}
      (configuredTimeoutMs for id 26 NOT yet read by the developer — see "pending datum" below)
    {kind:"xhr.error", id:25, url:".../v1/phaser/batch", method:"POST", status:0}
      + browser-level "Failed to load resource: The network connection was lost. (batch)"
    {kind:"xhr.send",     id:27, url:".../v1/phaser/batch", method:"POST", bodyLen:972}
    {kind:"xhr.response", id:27, url:".../v1/phaser/batch", method:"POST", status:204}
    {kind:"xhr.timeout", id:26, url:"/id/api/email/exists", method:"POST",
     status:0, elapsedMs:10040, t:1785632906950}
    ```
    Plus, same run: five OTHER `xhr.error`/connection-lost records on `/v1/init` and
    `/v1/phaser/batch` at bodyLens 92/105/177/824/1038, each independently retried by Epic's own
    code and each retry succeeding at an identical body size. An hCaptcha rate-limit
    `console.error` and a 429 on Sentry `envelope` were also present, both already-known
    benign/expected under network jitter.

    THIS RUN LANDS ON THE PRE-REGISTERED BRANCH 3 (`next_discriminator`, prior Current Focus):
    connection-loss-shaped failures recurred AND `/id/api/email/exists` timed out again. Worth
    stating explicitly, per this cycle's instruction: the branch structure worked this time — the
    actual result matched one of the four pre-registered outcomes cleanly, unlike the immediately
    prior cycle's two-branch prediction, which the actual result had matched neither of.

    THE ASYMMETRY:

    | Request | configuredTimeoutMs | Outcome | Recovered? |
    |---|---|---|---|
    | Talon /v1/phaser/batch (id 25) | 25000 (OBSERVED) | connection lost, status 0 | YES — retried as id 27, got 204 |
    | /id/api/email/exists (id 26) | ~10000 (INFERRED from elapsedMs 10040; NOT YET READ) | client-side timeout, status 0 | NO — no retry anywhere in the stream |

    PENDING DATUM: `configuredTimeoutMs` for id 26 specifically has not been read from the dumped
    array yet — 10040ms elapsed makes 10000 near-certain, but this file's own history (three
    material self-corrections logged above) is reason enough to keep it INFERRED, not OBSERVED,
    until the field is actually read. No new instrumentation is needed to get it — the capture
    already exists (Evidence 2026-08-02T07:05:00); it is a read-the-existing-dump ask, not a code
    change.

    NOT ESTABLISHED, stated explicitly per the developer's own framing (preserved, not weakened):
    (1) whether WKWebView connection instability is the ROOT cause of email/exists's failure or
    merely an aggravating condition — no xhr.error/connection-lost event was observed on id 26
    itself, it simply never answered, so whether it died the same way Talon's request did is
    unknown; (2) whether the UA question is now moot — two runs without a 403 is suggestive, not
    conclusive, and both were noisy runs that may differ in more than UA; (3) whether request body
    size is a factor — both timing-out submissions across this investigation were large (14951,
    15695) versus the connection-lost-but-recovered siblings (92-1038, and Talon's 972), and this
    correlation is real in the data but not yet tested as causal.

- timestamp: 2026-08-02T07:15:30
  source: this cycle's retraction of `transient_noise_do_not_chase` (historical Current Focus
    block, 2026-08-02T06:30:00), required explicitly by the developer's checkpoint instruction —
    retraction recorded here rather than by silently editing that historical block, per this
    file's own established convention of appending corrections instead of rewriting history.
  note: |
    THE ORIGINAL CLAIM, quoted verbatim from the historical block being retracted: "One run
    showed three `xhr.timeout` records at ~10 s (`/id/api/analytics` x2, `/id/api/location`), a
    `console.error` of `{"status":408,...,"error.serviceUnavailable"}`, and `/id/api/i18n` taking
    12.3 s. The very next run showed ZERO timeouts with everything sub-second. This is transient
    network noise, NOT a mechanism... Do not resurrect it."

    WHAT WAS WRONG: the dismissal reasoned entirely from run-to-run variance (one noisy run, one
    clean run afterward) without knowing there was a structural constant underneath the ~10s
    figure. This cycle's Evidence (2026-08-02T07:15:00 above) shows `/id/api/email/exists` failing
    at `elapsedMs: 10040` — the SAME ~10s signature the retracted block saw on
    `/id/api/analytics` x2 and `/id/api/location`, and now understood (pending the exact
    `configuredTimeoutMs` read) to be Epic's own CLIENT-SIDE configured timeout on its `/id/api/*`
    XHRs becoming visible under network jitter, not a random duration. "The next run was clean"
    was true and is still true — WKWebView connection jitter IS intermittent — but "therefore not
    a mechanism" does not follow: an intermittent trigger colliding with a fixed, short,
    per-endpoint timeout budget is exactly a mechanism, and dismissing it as noise on the strength
    of one clean follow-up run was premature.

    WHAT IS RETRACTED, precisely: only the "this is transient noise, NOT a mechanism... do not
    resurrect it" characterization, and only for the pre-auth `/id/api/email/exists` /
    `/id/api/analytics` / `/id/api/location` family of ~10s client-side timeouts. The historical
    block's text is left in place below (per this file's convention of never rewriting history),
    marked retracted by this entry rather than deleted.

    WHAT IS NOT RETRACTED, stated to prevent overcorrection: the Eliminated section's
    `WKWEBVIEW-NETWORK-FAILURE` entry is UNTOUCHED and remains correctly scoped and correctly
    eliminated for the POST-AUTH `/id/api/redirect` navigation-refusal symptom specifically — that
    elimination's own run showed ZERO network failures of any kind while the post-auth symptom
    still reproduced, a clean, unconfounded result about a different request and a different
    symptom. This retraction concerns ONLY the pre-auth `/id/api/email/exists` defect, a distinct,
    independent finding (`second_defect_found`, historical Current Focus).

    THIRD-TIME PATTERN, worth naming per the developer's own instruction: this is the third time
    this file's own recorded reasoning has needed a correction after new evidence (the DOM/skeleton
    symptom description, twice — Symptoms section's two material corrections — and now this
    dismissal). Each time, a plausible-sounding early read of a SMALL number of runs calcified into
    a "do not resurrect" instruction before enough data existed to support that confidence. The
    generalizable lesson: a dismissal built on "run A showed X, run B did not" is only as strong as
    the number of runs behind it — two runs is not enough to retire a hypothesis permanently,
    especially when a later run can supply a structural explanation the earlier dismissal did not
    have access to.

- timestamp: 2026-08-02T07:30:00
  source: developer checkpoint response, live hardware, `pnpm tauri:dev`, truthful Safari-on-macOS
    UA, Resource Timing API query from `next_discriminator` (prior Current Focus superseding block,
    2026-08-02T07:20:00) — PARTIAL/PRE-SUBMISSION capture, taken BEFORE the crux `/id/api/email/exists`
    failure occurred in this run (same sequencing gap as an earlier attempt; explicitly flagged by
    the developer, not discovered independently this cycle).
  note: |
    RAW RESULT, recorded verbatim per this file's own F-10 discipline (structure/status/timing only —
    no credential-shaped values were present in this API's output to begin with; Resource Timing
    never exposes request/response bodies).

    Same-origin `www.epicgames.com` entries, ALL `proto:"http/1.1"`:
    ```
    /id/api/analytics     connectStart:541  connectEnd:541  secureStart:541  reqStart:542  respStart:869  respEnd:869  dur:328
    /id/api/location      connectStart:575  connectEnd:575  secureStart:575  reqStart:577  respStart:940  respEnd:940  dur:365
    /id/api/analytics     connectStart:592  connectEnd:592  secureStart:592  reqStart:593  respStart:860  respEnd:860  dur:268
    /id/api/analytics     connectStart:1290 connectEnd:1290 secureStart:1290 reqStart:1291 respStart:1534 respEnd:1534 dur:244
    /id/api/authenticate  connectStart:1292 connectEnd:1292 secureStart:1292 reqStart:1293 respStart:1553 respEnd:1553 dur:261
    /id/api/analytics     connectStart:1564 connectEnd:1564 secureStart:1564 reqStart:1565 respStart:1820 respEnd:1820 dur:256
    /id/api/i18n?ns=messages             proto:"" connectStart:574 reqStart:574 respEnd:850 dur:276
    /id/api/i18n?ns=epic-consent-dialog  proto:"" connectStart:574 reqStart:574 respEnd:856 dur:282
    /id/api/i18n?ns=messages             proto:"" connectStart:578 reqStart:578 respEnd:845 dur:267
    /id/api/i18n?ns=epic-consent-dialog  proto:"" connectStart:578 reqStart:578 respEnd:858 dur:280
    ```
    Cross-origin entries (tracking.js, track.png x2, talon_sdk.js, /v1/init, /v1/phaser/batch) are
    fully zeroed with `proto:""` — the Timing-Allow-Origin restriction predicted this; it is NOT a
    broken query. Talon therefore cannot serve as a timing control (already flagged by the developer,
    confirmed here — no Talon-vs-email/exists comparison should be attempted from this dataset).

    Incidental UA corroboration: Epic's own `track.png` query string echoes the truthful
    Macintosh/Safari/17.6 UA string back — independent, Epic-side confirmation the configured UA was
    genuinely in effect for this run.

    BRANCH B (HTTP/3) — FALSIFIED. Every same-origin entry with a non-empty `proto` reports
    `"http/1.1"`. No `h2`, no `h3`, anywhere in this same-origin set. QUIC/HTTP-3 stack instability
    (candidate mechanism 1, `candidate_mechanisms_for_connection_lost_pattern` above) cannot be the
    mechanism for this endpoint family. Removed from the active candidate list with this citation.

    BRANCH A (stale pooled connection reuse) — SUPPORTED, NOT CONFIRMED. Every same-origin entry has
    `connectStart === connectEnd === secureStart === startTime` — a zero-duration connect phase,
    the Resource Timing signature of a reused keep-alive connection rather than a fresh TCP+TLS
    handshake. This is CONTEXT supporting candidate 2's plausibility (this session runs almost
    entirely over pooled HTTP/1.1 connections, which is the precondition a stale-pool theory needs to
    even be possible) — it is NOT a direct before/after contrast on the failing request itself, since
    the failing request (`/id/api/email/exists`) has no row in this capture at all (capture was taken
    pre-submission). The decisive datum — either (a) an `email/exists` row showing the same
    zero-duration signature as its healthy siblings, or (b) any request issued AFTER the failure
    showing `connectEnd > connectStart` (a real handshake, evidence the pool was torn down and
    rebuilt following the dead-connection error) — is still absent. Branch A stays in the
    supported-but-not-confirmed state exactly as the checkpoint response framed it; it is not being
    treated as settled.

    Precisely what is still owed, and only that: a post-failure re-capture (submit → wait for the
    `xhr.timeout` on `email/exists` → immediately run the Resource Timing query again, before the
    buffer evicts the relevant entries). Already requested from the developer per the checkpoint
    response; not yet received. See Current Focus below for the exact commands this cycle is
    re-issuing as a live-hardware checkpoint.

- timestamp: 2026-08-02T07:35:00
  source: this cycle's reasoning on the intervention surface, done explicitly BEFORE any fix is
    proposed, per the developer's checkpoint instruction #2 — grounded in a direct check of what this
    codebase's Tauri/wry integration actually exposes, not assumed.
  note: |
    HONEST STATEMENT OF THE INTERVENTION SURFACE, per the developer's explicit instruction not to
    propose a fix yet and to say plainly if the honest answer is "there may be no clean fix at this
    layer."

    What Branch A's candidate mechanism (a stale pooled HTTP/1.1 keep-alive connection failing on
    first write, surfaced by CFNetwork as `NSURLErrorNetworkConnectionLost`) would require to fix
    DIRECTLY: control over WKWebView's/CFNetwork's own connection-pool lifecycle — e.g. forcing a
    fresh connection per request, shortening the pool's idle-keepalive window, or reacting to a
    half-closed socket by transparently retrying on a new one before surfacing an error to the page.
    None of these are reachable from any layer this project owns:
      - Rust/`src-tauri/`: `WebviewWindowBuilder` (the `wry`/`tauri` API this codebase's
        `humble_login_open` arm already uses — Evidence 2026-08-01T23:15:00, 2026-08-02T03:10:00)
        exposes window-construction options (URL, UA, size, visibility, init scripts) — it exposes
        no method for CFNetwork's `URLSession` connection-pool configuration. That configuration
        lives inside WebKit's own networking process on macOS, entirely outside anything Tauri/wry
        surfaces.
      - Injected JS (the `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT` seam this whole investigation has used to
        observe, never to intervene): neither `fetch` nor `XMLHttpRequest` exposes any browser-native
        option to opt out of connection reuse or force a fresh socket per call. `fetch`'s `keepalive`
        option controls whether a request is allowed to outlive page unload — it has nothing to do
        with TCP/TLS connection pooling and would not touch this mechanism.
      - This is Epic's own page code issuing the failing request. This project does not own or ship
        that code; the only way to change ITS behavior from here is to intercept/monkey-patch the
        `XMLHttpRequest`/`fetch` Epic's bundle calls, which is a materially different and riskier
        class of change than the read-only diagnostic instrumentation shipped so far.

    STATED PLAINLY, per the developer's ask: if Branch A is confirmed, there is likely NO clean fix
    at the actual root-cause layer available to this codebase. The only mitigation surface within
    this project's control would be an APPLICATION-LEVEL WORKAROUND — an injected script that detects
    the specific failure shape (`xhr.timeout` or `xhr.error`/connection-lost on `/id/api/email/exists`)
    and issues one transparent retry, mirroring the retry behavior Epic's OWN code already performs
    successfully for its other endpoints (Evidence 2026-08-02T07:00:00, 2026-08-02T07:15:00 — five
    connection-lost failures on other requests, all recovered by Epic's own retry in the same runs).
    This would NOT fix the underlying WKWebView/CFNetwork behavior — it would paper over it by forcing
    a fresh request attempt, on the same empirical basis that a fresh attempt tends to succeed. This
    is a materially bigger and riskier intervention than anything built so far in this investigation
    (patching a third party's page networking behavior, not merely observing it), it is UNDESIGNED and
    UNAUTHORIZED this cycle, and per the developer's explicit instruction #2 it is not being proposed
    as a fix now — only named as the one mitigation surface this codebase could plausibly reach, for
    the record, in case Branch A is confirmed and a decision on it is needed later.

- timestamp: 2026-08-02T07:37:00
  source: this cycle's cross-reference of the Branch A candidate mechanism against
    `34.5-G6-EPIC-DISCRIMINATOR-2.md`'s recorded `verdict: E1` (READ ONLY — that file was not
    modified, per this cycle's constraints).
  note: |
    IF Branch A is later confirmed (still pending the post-failure re-capture — see above), it
    supplies a materially MORE SPECIFIC account of the `34.5-G6-EPIC-DISCRIMINATOR-2.md` E1 verdict
    than anything on record for it to date, for the PRE-AUTH half of this investigation specifically.

    `34.5-G6-EPIC-DISCRIMINATOR-2.md`'s E1 reading (its own text, quoted): "Something about the
    Tauri/WKWebView login-window seam prevents Epic's login page from becoming interactive... This
    reading does not commit to a specific API — it commits only to the shell (Tauri/WKWebView) being
    the differentiator." The verdict itself was selected on the strength of the per-reading
    prediction table (Electron interactive, Tauri non-interactive) matching the observed outcome —
    it names WHICH shell is responsible, not WHY.

    A CFNetwork-specific stale-pooled-connection behavior is exactly the kind of mechanism that
    reading left open. It is WKWebView/CFNetwork-specific by construction — Chromium (Electron's
    networking stack) has its own, materially different connection-pooling implementation and does
    not share CFNetwork's code path or its `NSURLErrorNetworkConnectionLost` failure mode. Under an
    IDENTICAL UA and an IDENTICAL URL (both already controlled-for in this investigation — Evidence
    2026-08-02T07:15:00's "UA truthfulness... now moot" framing and this file's repeated same-literal
    `EPIC_LOGIN_URL` observations), a connection-pool behavior specific to one engine's native
    networking stack would fully explain an outcome asymmetry between the two shells without
    requiring anything else to differ. This is offered as a candidate EXPLANATION strengthening the
    existing E1 verdict, not a new verdict and not a modification of the frozen discriminator
    contract — `34.5-G6-EPIC-DISCRIMINATOR-2.md` is unedited.

    SCOPE, stated precisely so this is not overclaimed: this would explain E1 for the PRE-AUTH
    `/id/api/email/exists` defect (`second_defect_found`, this file's Current Focus). It is a
    DIFFERENT mechanism from the already-fully-confirmed POST-AUTH root cause (`Resolution.root_cause`
    — WKWebView silently refusing the `localhost` exit navigation, unrelated to connection pooling).
    Both mechanisms independently produce shell-specific (Tauri-fails/Electron-works) behavior; they
    are not the same defect and this entry does not merge them. Also NOT claimed: that
    connection-pool staleness is CONFIRMED — only that IF it is confirmed by the still-pending
    post-failure capture, it would carry this additional explanatory weight for E1.

- timestamp: 2026-08-02T07:40:00
  source: developer checkpoint response (SECOND, separate reply from the one recorded immediately
    above at 07:30:00/07:35:00/07:37:00 — that reply carried the Resource Timing capture; THIS reply
    carries a full `[GAMELIB-DIAG]` array with `configuredTimeoutMs` now directly observed for every
    same-origin sibling request), live hardware, `pnpm tauri:dev`, truthful Safari-on-macOS UA —
    CAPTURED PRE-SUBMISSION (array ends before the username submit; no `/id/api/email/exists` row
    present). A CORRECTION to the Branch 3 "tighter timeout on this specific endpoint" framing
    carried forward from Evidence 2026-08-02T07:00:30 and 2026-08-02T07:15:00 (historical Current
    Focus block 2026-08-02T06:30:00, `next_discriminator` BRANCH 3 paragraph) — explicitly NOT a
    new discriminator result, per the developer's own framing of this reply.
  note: |
    RAW RECORDS, verbatim (structure/status/timing only — no credential-shaped values present):
    ```
    id:1  /id/api/analytics        GET  configuredTimeoutMs:10000  -> 200  elapsedMs:329
    id:4  /id/api/location         GET  configuredTimeoutMs:10000  -> 200  elapsedMs:367
    id:7  /id/api/analytics        POST configuredTimeoutMs:10000  -> 200  elapsedMs:270
    id:12 /id/api/analytics        POST configuredTimeoutMs:10000  -> 200  elapsedMs:245
    id:13 /id/api/authenticate     GET  configuredTimeoutMs:10000  -> 204  elapsedMs:264  (logged-out precondition re-satisfied)
    id:14 /id/api/analytics        POST configuredTimeoutMs:10000  -> 200  elapsedMs:258
    id:15 talon /v1/init           POST configuredTimeoutMs:25000  -> 200  elapsedMs:510
    id:17 talon /v1/phaser/batch   POST configuredTimeoutMs:25000  -> 204  elapsedMs:524
    ```
    Plus fetch-based `/id/api/i18n` x4, all 200 in 267-282ms; third-party (hcaptcha, featureassets,
    prodregistryv2) all fine. ZERO connection-loss events in THIS run up to id 17 — Talon's
    `/v1/init` and `/v1/phaser/batch` both succeeded first try, unlike the noisy run in Evidence
    2026-08-02T07:15:00. Recorded as its own data point: the connection-loss storm is not present in
    every run's early phase, so whatever triggers it does not fire deterministically at page load —
    it may correlate with elapsed session time or with a specific triggering request, not yet tested
    as causal.

    CORRECTION — RETRACTS the "tighter timeout on this specific endpoint" framing (the third
    candidate mechanism's timeout-budget half, carried in Evidence 2026-08-02T07:00:30 and the
    historical Current Focus block 2026-08-02T06:30:00's BRANCH 3 paragraph): every same-origin
    `/id/api/*` XHR observed above carries the IDENTICAL 10000ms `configuredTimeoutMs`. There is no
    evidence anywhere in this array of a materially shorter budget on `/id/api/email/exists` versus
    its siblings — the 10000ms figure is a blanket per-family constant, not a value special to
    email/exists. RESTATED CORRECTLY: the successful same-origin calls resolved in 245-367ms
    (roughly 3% of their 10000ms budget); email/exists (Evidence 2026-08-02T07:15:00, id 26)
    consumed the FULL 10040ms and never received a response. This is not "a tight budget clipped a
    slow-but-healthy request" — it is a request that produced NO response whatsoever for the full
    budget, while same-budget siblings answered in a quarter-second. Talon's 25000ms budget PLUS
    Epic-side retry-on-failure (both present together, not the timeout value alone) is why Talon
    absorbs the same connection-loss class of event and recovers; `/id/api/email/exists` has no
    observed retry in any run to date. This retraction STRENGTHENS candidate mechanism 2 (stale
    pooled-connection reuse — a dead connection written into, never answered, surfaced only via the
    XHR's own client-side timeout, not via any HTTP-level or connection-level error event) relative
    to a generic "network slowness" reading: a pure slowness mechanism would need to make this one
    request ~40x slower than its same-budget siblings while leaving every one of them untouched. This
    is consistent with, and does not conflict with, the SUPPORTED-BUT-NOT-CONFIRMED read on candidate
    mechanism 2 already recorded at Evidence 2026-08-02T07:30:00 from the separate Resource Timing
    reply — the two replies corroborate each other without either one confirming the mechanism
    outright.

    STILL PRE-SUBMISSION — THE CRUX ROW REMAINS MISSING FROM THIS REPLY TOO: this array ends before
    the username submit. There is still no `/id/api/email/exists` record in it, so
    `configuredTimeoutMs` for the FAILING request specifically remains uncaptured directly by either
    reply. It is now a materially stronger inference (every observed same-origin sibling reads
    exactly 10000, and Evidence 2026-08-02T07:15:00 recorded the failure's own `elapsedMs` as 10040)
    but per this file's own three prior material self-corrections, it is recorded as INFERENCE, not
    OBSERVATION, until a post-submission capture directly reads it — the same outstanding gap named
    at Evidence 2026-08-02T07:30:00's close.

    OUTSTANDING, matching the same ask already logged at 07:30:00: a POST-FAILURE capture — submit
    username, wait for the `/id/api/email/exists` `xhr.timeout` to fire, THEN run BOTH the
    `[GAMELIB-DIAG]` full-array read AND the `performance.getEntriesByType('resource')` query (both
    already-shipped instrumentation / a built-in browser API — no source edit required). Specifically
    looking for: (1) whether an `email/exists` resource-timing row exists at all after the failure;
    (2) whether any request issued AFTER the failure shows `connectEnd > connectStart` (a real
    handshake), evidence the connection pool was torn down and rebuilt following a dead-connection
    error. This single remaining live-hardware run answers both replies' outstanding asks at once —
    no separate follow-up is needed for each.

- timestamp: 2026-08-02T08:00:00
  source: developer checkpoint response, live hardware, `pnpm tauri:dev`, the SAME truthful
    Safari-on-macOS UA literal used in the 2026-08-02T07:00:00 (timeout) and the historical 403
    runs, this time in a connection-clean run (zero `xhr.error`/`NSURLErrorNetworkConnectionLost`
    records reported through the point of submission).
  note: |
    The developer submitted a username and Epic advanced to the PASSWORD step — reaching that
    step requires `/id/api/email/exists` to have returned a status that let the flow proceed
    (success), not the 403 or the `xhr.timeout` this exact UA literal produced in two earlier
    runs. The session then ran out the 300s deadline waiting at the password prompt before
    submission could occur this attempt; nothing failed, the clock expired.

    DIRECT CONSEQUENCE: the same fixed UA literal has now produced THREE different outcomes on
    `/id/api/email/exists` across three separate runs — 403 (historical run, pre-06:30:00 block),
    `xhr.timeout` (Evidence 2026-08-02T07:00:00), and success (this entry). UA alone cannot be a
    SUFFICIENT explanation for the pre-auth 403/timeout failure, since outcome varied under a
    literally identical UA string. This directly retires the "pre-auth defect is deterministic"
    framing this file had been carrying implicitly since `two_defects_summary`
    (Current Focus, historical 06:30:00 block) — the defect is INTERMITTENT.

    This is also the strongest evidence yet, though still correlational and n=1 for the
    clean-success case, for the standing connection-instability framing (`branch_3_landed`,
    Evidence 2026-08-02T07:15:00): the one run of three with zero reported connection-loss noise
    through submission is the one run of three that succeeded. No direct causal instrumentation
    link between a specific connection-loss event and `/id/api/email/exists`'s outcome has been
    captured in any run to date — this remains an observed correlation, not a proven mechanism.

- timestamp: 2026-08-02T08:05:00
  source: developer checkpoint response, live hardware, `pnpm tauri:dev`, same truthful
    Safari-on-macOS UA, a fresh logged-out-session run with a FULL credential submission
    (username + password, not username alone).
  note: |
    Epic returned its visible error `Parameter "client_id" is required` — the same literal text
    already on record in Eliminated/R1 (arm using a fake Chrome-on-Windows UA, already-
    authenticated state) and in `separately_established_and_worth_keeping` (historical Current
    Focus block). This is the FIRST time this exact visible error has been reproduced starting
    from a genuinely logged-out state, through a full credential submission, under a DIFFERENT UA
    (truthful Safari/macOS, not the fake Chrome-on-Windows string R1 used).

    The developer independently confirmed the submitted password is correct by separately logging
    into Epic in an unrelated, normal browser and succeeding. `client_id is required` is therefore
    NOT a credential rejection — Epic accepted the login (username+password validated
    server-side) and the failure occurs during the POST-AUTHENTICATION redirect handoff, the same
    half whose root cause this file has already confirmed end-to-end (`Resolution.root_cause`,
    full chain at Evidence 2026-08-02T05:05:00).

    NOT YET ESTABLISHED as the identical mechanism to the confirmed root cause: that root cause
    describes a SILENT failure (empty CSS skeleton forever, no error text, no console line, no
    `on_page_load` event). This observation is a VISIBLE 400 with page-rendered error text —
    structurally a different presentation. Two readings remain open and undifferentiated by this
    observation alone: (a) both are the same underlying WKWebView post-auth defect, with the
    visible-vs-silent split driven by whether `/id/api/redirect` itself returns 400 (visible,
    Epic renders an error page) vs. 200-with-a-refused-navigation (silent, nothing to render); or
    (b) these are two distinct post-auth failure modes that happen to share the same endpoint. Do
    not merge this into `Resolution.root_cause` as confirmed; cross-reference only.

- timestamp: 2026-08-02T08:10:00
  source: developer checkpoint response, cross-referencing Eliminated/R1's
    `separately_established_and_worth_keeping` note (historical Current Focus, 2026-08-02) against
    Evidence 2026-08-02T08:05:00 above and Evidence 2026-08-02T03:00:00's stock-UA 400.
  note: |
    THREE-POINT UA TABLE, assembled from records already in this file plus this cycle's new
    result — cross-referenced only, no source file re-read needed since all three UA literals are
    already transcribed elsewhere in this file:

    | UA (paraphrased)                                          | engine tokens | `EpicGamesLauncher` token | `/id/api/redirect` outcome |
    |------------------------------------------------------------|:---:|:---:|---|
    | stock `legendary` literal (Windows, no engine tokens)       | NO  | YES | HTTP 400, visible `client_id is required` (Eliminated/R1; Evidence 2026-08-02T03:00:00) |
    | Chrome-on-Windows + `EpicGamesLauncher` (R1's Arm B)         | YES | YES | 400 CLEARED, live (Eliminated/R1; `separately_established_and_worth_keeping`) |
    | truthful Safari/macOS (no `EpicGamesLauncher` token)         | YES | NO  | `client_id is required` reproduced (this entry, Evidence 2026-08-02T08:05:00) |

    Every failing UA is missing exactly one of the two tokens; the only UA that has ever cleared
    the 400 carries both. CANDIDATE READING, explicitly NOT established as a proven mechanism —
    a three-point fit only: engine tokens may put Epic's bundle on a code path that behaves
    differently, and the `EpicGamesLauncher` token may separately be what makes Epic's backend
    treat the request as coming from the official launcher client (supplying the `client_id`
    server-side that this UA family's requests otherwise lack). Do not record this as confirmed.

    SELF-CORRECTION, developer-flagged, recorded for the file's own accuracy: the truthful-Safari
    UA literal used in every pre-auth run since the historical `leading_hypothesis_UNTESTED` block
    (the 403 run, the 2026-08-02T07:00:00 timeout run, and this cycle's 08:00:00 clean-success run)
    DROPPED the `EpicGamesLauncher` token entirely relative to the stock literal — it was
    constructed to fix engine-truthfulness only and, in doing so, also removed the launcher token
    without that being a deliberate, tracked choice. Those three runs therefore varied TWO things
    at once relative to the stock UA (engine truthfulness added, launcher token removed), and
    CANNOT cleanly attribute their `/id/api/redirect`-stage outcome to either variable alone. This
    does NOT weaken Observation 2026-08-02T08:00:00's intermittency finding for
    `/id/api/email/exists` — that question was never about the launcher token or the redirect
    stage, and all three of those runs share the identical UA literal, which is the only
    comparison that finding depends on. It specifically weakens only what those three runs can say
    about the `/id/api/redirect` 400/`client_id` question.

- timestamp: 2026-08-02T08:20:00
  source: developer checkpoint response, live hardware, `pnpm tauri:dev`, a PRE-REGISTERED CONTROL
    measurement (the falsifier was stated in advance of running it) taken in a BRAND NEW login
    window (label `loginwin-2-...`) at the earliest possible point after page settle, same Resource
    Timing query as the immediately prior cycle's `next_discriminator`.
  note: |
    Verbatim earliest same-origin rows from a freshly-opened window:
    ```
    /id/api/analytics    proto:"http/1.1" connectStart:520  connectEnd:520  secureStart:520  reqStart:521  start:520  dur:260
    /id/api/location     proto:"http/1.1" connectStart:554  connectEnd:554  secureStart:554  reqStart:556  start:554  dur:256
    /id/api/analytics    proto:"http/1.1" connectStart:574  connectEnd:574  secureStart:574  reqStart:575  start:574  dur:246
    /id/api/authenticate proto:"http/1.1" connectStart:1125 connectEnd:1125 secureStart:1125 reqStart:1125 start:1125 dur:249
    ```
    ZERO connect-phase duration on the FIRST requests of a brand-new window. A genuine TCP+TLS
    handshake cannot complete in 0ms, so this measurement cannot itself be the reused-connection
    signature it was previously read as — either (a) WKWebView never populates the connect-phase
    Resource Timing fields on this platform at all, or (b) the connection pool genuinely persists
    across separate login windows in the same app process (shared WKProcessPool/networking stack),
    so "brand new window" was never actually "brand new connection". This measurement CANNOT
    distinguish (a) from (b), and therefore cannot distinguish either of those from the original
    claim under test (a stale POOLED connection reused mid-run). The pre-registered falsifier
    fired.

    RETRACTION, stated exactly per the developer's ask: the `branch_3_landed`/07:40:00–07:45:00
    historical Current Focus blocks' reading of `connectStart===connectEnd===startTime` on
    same-origin rows as "the Resource Timing signature of a reused pooled connection" is WITHDRAWN
    as UNSUPPORTED, not merely uncertain. Candidate mechanism 2 (stale pooled-connection reuse) is
    neither confirmed nor refuted by this file's own instrumentation — Resource Timing cannot
    settle it on this platform. It remains a live, UNEVIDENCED candidate only from here forward.
    See the paired Eliminated entry below for the formal record of this self-correction.

    UNCHANGED, unaffected by this retraction: `nextHopProtocol: "http/1.1"` on every same-origin
    row across every run to date (candidate mechanism 1, HTTP/3 instability, remains FALSIFIED —
    Evidence 2026-08-02T07:30:00). Cross-origin rows (`/v1/init`, `/v1/phaser/batch`,
    `talon_sdk.js`, `track.png`, `tracking.js`) remain fully zeroed with `proto:""`, consistent
    with the `Timing-Allow-Origin` restriction rather than any finding about those hosts'
    connections.

- timestamp: 2026-08-02T08:25:00
  source: developer checkpoint response, cross-referencing GAMELIB-DIAG connection-loss/timeout
    records already on record across four separate live runs, grouped by request host for the
    first time this cycle.
  note: |
    Every observed `xhr.error`/`fetch.error` "network connection was lost" record across all four
    runs to date targets exactly ONE host, `talon-service-prod.ecosec.on.epicgames.com`:
    ```
    this run:      id 20 /v1/phaser/batch (bodyLen 758), id 21 /v1/init/execute (bodyLen 7014)
    previous run:  id 23 /v1/init/execute (7102),        id 24 /v1/phaser/batch (3326)
    earlier run:   ids 15 (/v1/init, 92), 16 (batch, 105), 17 (batch, 177), 26 (batch, 824),
                   31 (batch, 1038)
    ```
    NOT ONE connection-lost event has ever occurred on `www.epicgames.com` in any run to date.
    Every same-origin `/id/api/*` failure observed in this investigation has instead been a
    TIMEOUT with no response at all (`/id/api/email/exists`), or a real HTTP status (403, 400,
    200) — never a connection-level drop.

    CORRECTION, stated plainly: prior reasoning in this file (`branch_3_landed`,
    `candidate_mechanisms_for_connection_lost_pattern`, both historical Current Focus blocks) had
    treated the connection-loss storm and the `/id/api/email/exists` failure as the SAME failure
    signature / directly explanatory of one another. They are not — they are two structurally
    different signatures (cross-origin connection-loss vs. same-origin no-response timeout) on two
    different hosts, and conflating them was imprecise. This does NOT retract `branch_3_landed`'s
    narrower factual claim (the ~10s `xhr.timeout` on `/id/api/email/exists` itself, Evidence
    2026-08-02T07:15:00, stands unchanged) — only the implicit claim that the connection-loss
    events directly explain that timeout.

    SAME-PAYLOAD CONTROL, worth recording: id 20 (758 bytes) failed / id 23 (758 bytes) succeeded,
    same run, same endpoint shape; id 24 (3326 bytes) failed / a 3326-byte request succeeded in the
    prior run. Identical payload sizes, opposite outcomes, on the Talon host specifically — rules
    out payload content/size as the determinant of THOSE Talon-host failures (does not speak to
    `/id/api/email/exists`'s own ~15KB body, a separate, same-origin request — see next entry).

- timestamp: 2026-08-02T08:30:00
  source: developer checkpoint response, causal-chain hypothesis derived from data already in this
    file (Evidence 2026-08-02T08:00:00, 08:25:00 above) plus new detail on
    `/id/api/email/exists`'s request body size and Talon/hCaptcha console lines — explicitly
    offered as a HYPOTHESIS requiring its own discriminator, not a finding.
  note: |
    Proposed chain, recorded per the developer's own numbering, NOT yet tested:
    (1) Talon's host (`talon-service-prod.ecosec.on.epicgames.com`) drops connections
    intermittently — established at Evidence 2026-08-02T08:25:00.
    (2) hCaptcha (which Talon wraps) surfaces client-blame copy for what is actually a lost
    connection (`[hCaptcha] Your browser or network settings are blocking hCaptcha`,
    `[hCaptcha] Rate limited or network error`) — same genre as Epic's already-established generic
    403 "enable cookies" copy (historical Eliminated/R1 note). Talon's own SDK additionally logged
    `Network Error` twice via `console.error`, sourced to `talon_sdk.js`.
    (3) The `/id/api/email/exists` POST body observed at ~15KB (14951/15695 bytes) is far larger
    than an email address — proposed to be an embedded Talon attestation payload.
    (4) When Talon's session is broken server-side, Epic's backend allegedly cannot validate the
    attestation carried in that POST and never produces ANY response — the client then sits until
    its own timeout fires (matches the ~10000ms `configuredTimeoutMs` figure independently
    confirmed at Evidence 2026-08-02T07:40:00). Proposed as the explanation for the previously
    unaccounted-for distinguishing feature: NO HTTP status ever, rather than a 4xx/5xx.
    (5) RETROSPECTIVE FIT, not a prospective confirmation: the one run with zero Talon
    connection-loss events (Evidence 2026-08-02T08:00:00) is also the one run where
    `/id/api/email/exists` succeeded. Consistent with the chain, does not prove it — this is
    run-level co-occurrence, not a within-run temporal correlation; no timestamp comparison
    between a specific Talon failure event and the `/id/api/email/exists` request window has been
    performed by anyone, this cycle or any prior one.

    ALSO OFFERED, explicitly flagged NOT ESTABLISHED by the developer: a partially-broken Talon
    session could plausibly explain the earlier 403 (a validation REJECTION) where a fully-broken
    one explains the timeout (no response at all) — named only as a candidate, not investigated.

    Treated as a hypothesis requiring its own discriminator, not a finding — see Current Focus.

- timestamp: 2026-08-02T08:45:00
  source: developer/coordinator checkpoint response REINSTATING a genuine live-hardware,
    developer-reported observation. Provenance, recorded explicitly per this file's own honesty
    discipline: an intermediate message-relay step in the session that spawned this cycle's agent
    arrived late due to transport timing and was wrongly treated as fabricated; that treatment has
    now been corrected by the developer/coordinator as WRONG. The observation is real, direct
    human input, reported live from hardware, from the SAME run as the already-recorded control
    measurement at Evidence 2026-08-02T08:20:00/08:25:00 (the pre-registered control run, brand-new
    login window `loginwin-2-...`). It is exactly as trustworthy as every other developer report in
    this file and is recorded here per this project's own F-10 discipline (raw result before
    reasoning), NOT discarded.
  note: |
    RAW RESULT, developer verbatim: on-screen error text "failed to initalise CAPTCHA" [sic,
    developer's own spelling].

    CORRELATION, checked against records already on file rather than taken on faith: `id 21` in
    that same run's `[GAMELIB-DIAG]` stream (Evidence 2026-08-02T08:25:00's host-level breakdown,
    "this run:" row) was `https://talon-service-prod.ecosec.on.epicgames.com/v1/init/execute`
    (bodyLen 7014), which failed with `xhr.error`, `status:0` — a WKWebView connection-lost event
    on Talon/hCaptcha's own initialization endpoint. `/v1/init/execute` IS the captcha
    initialization call. The visible message names the exact failing subsystem, and the network
    record already on file for the identical run independently shows precisely that subsystem's
    init call dying of a lost connection. The `id: 21` record itself is not new (already on file at
    Evidence 2026-08-02T08:25:00) — only its pairing with this on-screen text is new this cycle.

    UA CONTEXT FOR THIS RUN, per the checkpoint's own report (not independently re-derived from a
    source read this cycle): the combined-token UA was in effect — Chromium engine tokens plus the
    `EpicGamesLauncher` token, the one literal on record that has ever cleared the post-auth 400
    (Eliminated/R1 Arm B; Evidence 2026-08-02T08:10:00's three-point table) and the literal the
    08:15:00/08:35:00 blocks' `next_discriminator` asks for — independently corroborated in effect
    via Epic's own `track.png` telemetry echo
    (`Chrome%2F126.0.0.0%20Safari%2F537.36%20EpicGamesLauncher`), the same corroboration mechanism
    already trusted at Evidence 2026-08-02T07:30:00 for a different run. `/id/api/authenticate`
    read 204 twice in this run, confirming genuinely logged-out state was held throughout.
    RELEVANCE: this run failed at Talon/captcha initialization — upstream of `/id/api/redirect` and
    upstream of any credential-adjacent request that UA/engine fingerprinting would plausibly gate
    — under the ONE UA literal previously believed (three-point fit) to clear the post-auth defect.
    See the new Eliminated entry below and the Current Focus superseding block for what this does
    and does not change about the standing UA hypotheses.

- timestamp: 2026-08-02T08:45:15
  source: this cycle's synthesis, cross-referencing the reinstated observation immediately above
    against three already-recorded on-screen presentations in this file, plus one previously-
    unrecorded UI detail supplied by the developer this cycle for a run whose raw records were
    already on file.
  note: |
    Across (at least) four runs, the SAME underlying event — connection loss to
    `talon-service-prod.ecosec.on.epicgames.com` — has surfaced on screen four different ways:

    1. Spinner hang, no visible error text — the developer's own characterization, supplied this
       cycle, of the on-screen state during the `/id/api/email/exists` `xhr.timeout` run whose raw
       records are already on file (Evidence 2026-08-02T07:15:00, `elapsedMs: 10040`); that entry
       recorded the network-level facts only and never captured a UI description, so this is a
       previously-missing detail being filled in now, not a contradiction of anything on record.
    2. "Service is temporarily unavailable" — already on file, Evidence 2026-08-02T07:00:00, for
       the EARLIER `/id/api/email/exists` `xhr.timeout` run (id 30).
    3. "Enable cookies" — already established in this file (historical Current Focus
       `second_defect_found` block; Evidence entries at lines referencing `cookieLen`/`_epicSID`)
       as Epic's generic 403 copy, and already established as misleading — cookies were present and
       readable (130 bytes; `XSRF-TOKEN`, `_epicSID`, `_tald`).
    4. "Failed to initialise CAPTCHA" — this cycle's reinstated observation (Evidence
       2026-08-02T08:45:00 above), the only one of the four that names the actual failing
       subsystem.

    METHOD LESSON, generalizing this file's own already-recorded 2026-08-02T05:10:00 lesson ("this
    defect IS NOT A FAILURE, it is an ABSENCE" — about the DIFFERENT, already-confirmed post-auth
    defect): here, by contrast, there IS a failure (a real connection-lost event, `xhr.error`,
    `status:0`), but its on-screen PRESENTATION is unstable across runs — four distinct visible
    messages for one underlying mechanism. Each message plausibly invited a different wrong
    diagnosis on its own (a cookie-storage defect from message 3; a generic backend-outage read
    from message 2; nothing at all to investigate from message 1) — exactly how earlier cycles of
    this investigation lost time chasing red herrings (R3, CLOBBERED-GLOBAL, the ITP
    sub-hypothesis). GENERALIZATION for future sessions on this codebase: when a WKWebView-hosted
    third-party page's on-screen error text varies across otherwise-similar failure runs, treat the
    variation itself as evidence the presentation layer is unreliable, and correlate against the
    underlying network-level instrumentation (this file's `[GAMELIB-DIAG]` stream) before trusting
    any single run's visible copy as diagnostic.

- timestamp: 2026-08-02T08:45:30
  source: DISTINCT FINDING — separate from and NOT blocking this investigation, recorded so it is
    not lost, per this file's established pattern for such findings (see Evidence
    2026-08-02T00:12:00's notification-plugin precedent). Reported via this cycle's checkpoint
    response from the developer's Electron (`npm start`) control-arm session, renderer console.
  note: |
    The Electron arm's renderer logs Tauri-path code executing and failing under Electron:
    ```
    [tauriWindowChrome] applyFramelessDecorations failed: TypeError: Cannot read properties of
      undefined (reading 'metadata') at getCurrentWindow
    hydrateStore: fetch of "configStore" failed; leaving the snapshot degraded for this store,
      with TypeError: Cannot read properties of undefined (reading 'invoke')
    ```
    Tauri-specific code (a Tauri window-chrome helper, a Tauri-`invoke`-backed store hydration
    path) is executing unconditionally under Electron and failing on missing `invoke`/
    `getCurrentWindow`, leaving `configStore` explicitly degraded for the session. This is the SAME
    CLASS of defect as the stale `isTauri()` guard Phase 34.4's gate found slipping past a fully
    green test suite (see MEMORY: "Phase 34.4 COMPLETE"). NOT investigated further this cycle — it
    is orthogonal to Epic login and to F-34.5-G6-01. Recorded here only so it is not lost before the
    next relevant phase/debug session picks it up.

- timestamp: 2026-08-02T09:15:00
  source: developer checkpoint response, live hardware, Electron (`npm start`) control-arm session —
    Epic login `<webview>`'s own Chromium DevTools Network panel (`webview.openDevTools()`), same
    machine/network/account/`EPIC_LOGIN_URL` as every Tauri run on file. Corroborated (not just
    developer-reported) against `~/Library/Logs/GameLib/gamelib.log`.
  note: |
    THE STRONGEST CROSS-SHELL DISCRIMINATOR THIS FILE HAS PRODUCED, log-corroborated. Login
    COMPLETED end-to-end under Electron/Chromium in this run:
    ```
    (13:58:41) [Legendary]: Logging in: ... legendary auth --code <redacted>
    (13:58:48) [Frontend]:  [refreshLibrary] runner=legendary origin=login-success
    (13:58:59) [Legendary]: Game list updated, got 15 games & DLCs
    (13:59:08) [Frontend]:  Force Update
    ```
    (Mandatory redaction, per this project's public-fork rule: the `--code` value itself is a live
    Epic OAuth credential and is never recorded here, in any form — only structure/status/timing.)

    CROSS-SHELL COMPARISON, same machine/network, read directly from the DevTools Network panel
    (Chromium arm) vs. this file's already-recorded `[GAMELIB-DIAG]` records (WKWebView arm):

    | | Electron / Chromium | Tauri / WKWebView |
    |---|---|---|
    | Talon-host (`talon-service-prod.ecosec.on.epicgames.com`) requests | all 200/204, zero retries | 9 `NSURLErrorNetworkConnectionLost`-class events across 4 runs, ALL on this one host (already on file, Evidence 2026-08-02T08:25:00) |
    | `/id/api/email/exists` | HTTP 409, flow continues | 403 x1, `xhr.timeout` x2, success x1 (already on file, `pre_auth_defect_reframed_as_intermittent`) |
    | Outcome | login completes, 15 games | never completed, any Tauri run to date |

    LOAD-BEARING REFRAME, changes how this file's own prior email/exists observations should be
    read: `/id/api/email/exists` returning a 4xx (409, under Electron in this run) is Epic's NORMAL,
    NON-BLOCKING path — "this email is already registered" — and the Electron flow proceeded through
    it to a completed login. This means the file's three-outcome Tauri comparison
    (`pre_auth_defect_reframed_as_intermittent`) should be read as two DIFFERENT phenomena, not one:
    the Tauri 403 is a genuine app-level rejection, categorically distinct from this normal 409 —
    still unexplained, not addressed by this entry. The two Tauri `xhr.timeout` outcomes produced NO
    HTTP status at all — an ABSENCE of a response, categorically different from any status code
    (4xx included) and the shape this file's `talon_causal_chain_hypothesis` (Evidence
    2026-08-02T08:30:00) already predicts. Do not continue treating "403" and "timeout" as
    interchangeable instances of "email/exists failed" going forward — see Current Focus for the
    scoping this reframe requires.

    CROSS-REFERENCE ONLY, file itself untouched per Constraints: this reinforces
    `34.5-G6-EPIC-DISCRIMINATOR-2.md`'s frozen `verdict: E1` with network-level detail that
    frozen contract did not have when it was written — zero Chromium-side connection failures against
    nine WKWebView-side failures on the identical host, same machine and network, is now on record as
    the specific network-layer asymmetry underlying that verdict for the pre-auth half. This does
    NOT modify `Resolution.root_cause` (the separately-confirmed, unrelated post-auth silent-
    navigation-refusal mechanism) and does not touch the frozen discriminator files.

- timestamp: 2026-08-02T09:15:15
  source: same checkpoint response as above — DevTools Network panel "Protocol" column
    (`www.epicgames.com` rows, Electron arm) vs. `performance.getEntriesByType('resource')`'s
    `nextHopProtocol` field (WKWebView arm, already-shipped instrumentation).
  note: |
    CANDIDATE ONLY, EXPLICITLY NOT CONFIRMED — recorded with its self-flagged weakness attached,
    per instruction. Electron/Chromium DevTools panel reports `h2`/`h3` for `www.epicgames.com`.
    The Tauri/WKWebView side of the comparison — every same-origin row reporting `http/1.1` — comes
    from `performance.getEntriesByType('resource')`'s `nextHopProtocol` field, THE SAME JS API whose
    `connectStart`/`connectEnd` fields were already formally retracted this session (Evidence
    2026-08-02T08:20:00, paired Eliminated entry) for reporting zero-duration even on a brand-new
    window's first requests — i.e. an instrument already shown unreliable on this exact platform for
    an adjacent field on the same API surface. `nextHopProtocol` has NOT itself been independently
    shown unreliable; it also has not been shown reliable. The Chromium-side half of this comparison
    IS solid (different engine, DevTools panel rather than the JS API, no known instrument defect).

    DO NOT record the protocol difference as confirmed. It is a strong candidate mechanism pending
    the requested independent corroboration (Safari Web Inspector's own Network panel, read directly
    during a Tauri run, rather than through the suspect JS field) — see Current Focus for the
    sequencing of that ask.

- timestamp: 2026-08-02T09:15:30
  source: DISTINCT FINDING — separate from and NOT supporting this investigation's active
    hypothesis, recorded so it is not lost, per this file's established pattern (see Evidence
    2026-08-02T00:12:00 / 2026-08-02T08:45:30 precedents). Developer self-initiated check of
    `~/Library/Logs/DiagnosticReports/` for `com.apple.WebKit.WebContent-*.ips` reports, reported via
    this cycle's checkpoint.
  note: |
    NEGATIVE RESULT, checked and ruled out as the connection-loss mechanism — recorded honestly
    rather than discarded. 20 `com.apple.WebKit.WebContent-*.ips` crash reports found, spanning four
    days, ALL `EXC_BAD_ACCESS`/`SIGSEGV` at the identical address `0x180`, ALL with
    `responsibleProc: gamelib-shell` (this project's own Tauri shell's web-content process). A
    recurring, identically-signatured segfault in our own shell's WebContent process was checked as a
    candidate explanation for the Talon connection losses, because if true it would have been
    directly relevant to `talon_causal_chain_hypothesis`.

    TIMESTAMPS RULE IT OUT: the most recent crash report is `2026-08-02 09:56:13`; every
    connection-loss event this file has on record occurred in runs after 13:00 the same day. The
    crash window and the connection-loss window do not overlap. This is a genuine, reproducible,
    identically-signatured crash in our own shell (20 instances, one signature) — but it is NOT the
    mechanism behind F-34.5-G6-01's pre-auth connection losses. Recorded as a SEPARATE finding
    worth its own future investigation (not filed against this finding, not chased further this
    cycle), following the same discipline already applied to the notification-plugin
    (2026-08-02T00:12:00) and Electron-side `isTauri()`-class (2026-08-02T08:45:30) distinct
    findings.

- timestamp: 2026-08-02T10:15:00
  source: direct read this cycle (READ-ONLY, no edits) of `src-tauri/src/main.rs` (the
    `humble_login_open` arm, lines 1804-1940, full re-read against this cycle's specific
    question), `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`,
    `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/wry-0.55.1/src/wkwebview/mod.rs`
    (full webview-construction path, `new_ns_view`, lines 194-560), `.../custom_protocol_workaround.rs`,
    `.../wkwebview/proxy.rs`, `~/.cargo/registry/src/.../tauri-2.11.5/scripts/ipc-protocol.js`,
    `~/.cargo/registry/src/.../tauri-2.11.5/src/webview/webview_window.rs`,
    `~/.cargo/registry/src/.../tauri-runtime-2.11.3/src/webview.rs`,
    `~/.cargo/registry/src/.../tauri-2.11.5/src/manager/webview.rs`. graphify queried first per
    project rule (`graphify query`/`graphify explain` on WebviewWindowBuilder/WebviewUrl::External/
    ALPN/data-store terms) — returned only TS/JS-side nodes (preload, frontend, sidecar
    transport), zero Rust/`src-tauri` coverage, confirming graphify does not index this crate;
    proceeded to direct source reads per the rule's own fallback clause.
  note: |
    STATIC, READ-ONLY search for an application-level HTTP/2 ALPN suppression mechanism in this
    app's own webview construction, against the checkpoint's four-item candidate list. Each
    checked individually; three come back a clean, source-verified NEGATIVE, one is
    MECHANISTICALLY UNRELATED (verified, not merely "not investigated") to protocol negotiation:

    (1) `humble_login_open`'s `WebviewWindowBuilder` chain (the arm that builds EVERY runner's
    login window, `loginwin-N-*`, including Epic's) — re-read in full. The ONLY builder calls
    present: `.user_agent(user_agent)`, `.visible(visible)`, and, gated on `visible`,
    `.inner_size()`, `.center()`, `.focused()`, `.theme()`, `.on_document_title_changed()`,
    `.initialization_script(DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT)` (dev-only diagnostic, already on
    file), `.on_page_load()`. NO call to `.incognito()`, `.data_store_identifier()`,
    `.proxy_config()`, or any networking/session/process option anywhere in this arm. Grepped the
    ENTIRE file (`main.rs`) for `.user_agent(`, `.data_directory(`, `.data_store`,
    `.additional_browser_args`, `.proxy`, `.incognito`, `http1`, `http2`, `alpn`, `ALPN`, `h2\b` —
    zero hits outside the arm already read and the unrelated `with_webview`/`WKWebsiteDataStore`
    cookie-DELETION arm (see item 4 below, a DIFFERENT arm, only reached after `before_matching >
    0` on `humble_login_clear_cookies`, never on window creation).

    (2) wry 0.55.1's macOS webview construction (`new_ns_view`, the function every
    `WebviewWindowBuilder::build()` ultimately calls) — read in full, lines 194-560. Data store:
    since this app never calls `.incognito()`/`.data_store_identifier()`/an existing
    `webview_configuration`, wry's own match falls through to `WKWebsiteDataStore::defaultDataStore(mtm)`
    — the ordinary, persistent, non-ephemeral store, confirmed by source
    (`tauri-runtime-2.11.3/src/webview.rs:520`, `Default::default()` sets `incognito: false`, and
    this project's runtime `WebviewWindowBuilder` construction never overrides it — confirmed by
    the item-1 grep). Proxy: wry only calls `data_store.setValue_forKey(proxies,
    "proxyConfigurations")` when BOTH the `mac-proxy` Cargo feature is compiled in AND
    `attributes.proxy_config` is `Some(..)` — `grep -n "mac-proxy" src-tauri/Cargo.lock` returns
    ZERO matches (feature not enabled in this build at all), and item 1's grep already shows no
    `.proxy_config()` call exists in `main.rs`. Custom `WKURLSchemeHandler`s: wry registers one
    per entry in `attributes.custom_protocols`, which tauri populates with exactly three scheme
    names — `tauri`, `ipc`, `asset` (`tauri-2.11.5/src/manager/webview.rs:230-365`, confirmed by
    direct read) — `https` is never among them; WebKit dispatches scheme handlers by URL scheme
    string match, so a handler registered for `ipc://` structurally cannot intercept or affect an
    `https://www.epicgames.com` request. Grepped the entire wry crate source tree for
    `HTTPPipelining`, `assumesHTTP3`, `http1Only`, `forceHTTP1`, and any `URLSessionConfiguration`
    reference — zero hits anywhere in the crate; wry never touches HTTP-version/ALPN
    configuration through any code path, gated or not.

    (3) The console's own "IPC custom protocol failed ... postMessage interface instead —
    TypeError: Load failed" warning (already on file, Evidence 2026-08-02T00:20:00) — traced to
    its exact source, `tauri-2.11.5/scripts/ipc-protocol.js` (read in full, 92 lines). This is
    Tauri's own IPC transport doing a same-window `fetch(convertFileSrc(cmd, 'ipc'), {...})` to
    the `ipc://`-scheme (rewritten to `https://ipc.localhost/...`) endpoint for invoking Rust
    commands; the failure is the ALREADY-DIAGNOSED capability-scope rejection (this file's own
    2026-08-01T23:40:00/23:50:00 entries: `loginwin-N-*` matches no capability, so the invoke is
    refused, and the JS layer falls back to `window.ipc.postMessage`). This is a SEPARATE request
    on a SEPARATE, non-network, in-process-handled scheme from Epic's own `https://www.epicgames.com`
    and `https://talon-service-prod.ecosec.on.epicgames.com` traffic — structurally incapable of
    being the same mechanism, confirmed at the source level (item 2's scheme-list finding), not
    merely presumed independent by proximity in the console log. ANSWERS the checkpoint's specific
    ask ("worth checking whether the same machinery affects ordinary https:// loads") with a
    named, source-verified NO.

    (4) ATS/Info.plist/entitlements — no committed `Info.plist`, entitlements file, or ATS override
    (`NSAppTransportSecurity`/`NSAllowsArbitraryLoads`) exists anywhere under `src-tauri/` (grepped
    the whole directory tree for `.json`/`.plist`/`.rs`/`.toml`, zero hits outside build-generated
    artifacts under `target/`, which Tauri codegens from `tauri.conf.json` at build time — that
    file's own `app`/`bundle` sections carry no macOS ATS keys, confirmed by direct read). The only
    `Info.plist` files anywhere in the repo belong to the SEPARATE Electron build's `dist/mac-arm64/`
    output tree — a different app bundle entirely, not consulted by the Tauri shell.

    (5) Ephemeral/incognito data store — already answered by item 2: `incognito` defaults `false`
    and is never set `true` anywhere `WebviewWindowBuilder` is constructed in this codebase
    (confirmed by the item-1 grep across the whole file), so the persistent default store is what
    every login window uses — this is NOT the ephemeral/private-mode configuration the checkpoint
    asked about.

    OVERALL RESULT: this cycle's static search comes back EMPTY at the application-configuration
    layer — no setting this codebase (or its two networking-adjacent dependencies, wry and tauri,
    at their exact pinned versions) controls suppresses or downgrades HTTP/2 ALPN negotiation for
    `WebviewUrl::External` windows. This does NOT retract `protocol_claim_pending`'s CONFIRMED
    status (the http/1.1 OBSERVATION itself, corroborated by two independent sources per the
    checkpoint response, is unaffected by this search) — it retracts only the specific
    reframe the checkpoint's own prose offered ("this relocates the question INTO THIS CODEBASE'S
    OWN CONFIGURATION"). That relocation does NOT hold: every application-level lever this cycle
    could name and check is either unused (default config, no incognito, no proxy, no custom data
    store) or, for the one lever that IS active in this webview (the `ipc`/`tauri`/`asset` custom
    scheme handlers), mechanistically incapable of touching `https://` traffic at all. The
    honest read is the SAME one `intervention_surface_honesty` (07:40:00 historical block) already
    recorded before this cycle's ask was raised: no source-controlled lever inside this codebase
    has been found that reaches WKWebView's/CFNetwork's ALPN negotiation for external-origin
    requests. This is a genuine, useful negative result, not an incomplete search — five
    independent candidate mechanisms were named and each was checked against actual source, not
    inferred.

- timestamp: 2026-08-02T11:00:00
  source: developer checkpoint response — a NEW control measurement (Safari.app, the real browser,
    same engine as WKWebView) on the same machine/network/origin/day as the 10:15:00 block's static
    search
  note: |
    The 10:15:00 block's static search was correctly negative on the four/five candidate areas it
    checked, but the CONCLUSION drawn from it ("reverts to the honest read: not reachable from
    anything this codebase configures") is now REVERSED by this control, not by any new source
    read. Developer opened Safari.app itself (not this app's webview) on the same machine, navigated
    to `https://www.epicgames.com/id/login`, and read the protocol directly from Safari's own Web
    Inspector Network panel: `h2`. Three-arm table, same machine/network/origin/day:
    | Arm | Protocol |
    |---|---|
    | Electron/Chromium (this app) | h2, h3 |
    | Safari.app (same engine as WKWebView, NOT this app) | h2 |
    | Tauri/WKWebView (this app) | http/1.1 (two independent sources) |
    Safari.app and this app's WKWebView are the SAME ENGINE getting DIFFERENT protocols against the
    SAME origin on the SAME machine. This is decisive on the specific point the prior cycle's search
    answered: the anomaly is not "WebKit vs. Chromium" in general (that would predict Safari.app also
    gets http/1.1, and it does not) — something specific to THIS APP'S OWN webview instance produces
    http/1.1 where every other engine/build on this machine gets h2/h3. The four areas the 10:15:00
    search checked remain correctly ruled out (record that, do not re-litigate) — but the search's
    candidate list was not exhaustive, and this control identifies the gap: nothing in that list was
    about the HOST APPLICATION'S OWN IDENTITY (code signing / entitlements / hardened runtime), which
    is a known lever for WKWebView's networking-process behavior on macOS and was not in the checked
    set.

- timestamp: 2026-08-02T11:10:00
  source: direct, read-only inspection of this machine/repo's actual build and signing
    configuration — `security find-identity`, `codesign -dvvv` on the live `pnpm tauri:dev` binary,
    full read of `src-tauri/tauri.conf.json`, full read of `src-tauri/Cargo.toml`, `.github/workflows/
    release-tauri.yml` (comment block + Apple-signing gate step)
  note: |
    Verifying the new code-signing hypothesis's precedent and feasibility BEFORE proposing a test
    (per this project's own F-10/reasoning-checkpoint discipline — do not act on an attractive
    hypothesis without checking what is actually possible here):
    - `security find-identity` (no filter and `-p codesigning`): **0 identities of any kind** in this
      developer's login keychain. No Developer ID, no self-signed cert, nothing. A "properly signed"
      build is NOT currently possible on this machine without first creating a signing identity.
    - `codesign -dvvv src-tauri/target/debug/gamelib-shell` (the exact binary `pnpm tauri:dev` runs):
      `flags=0x20002(adhoc,linker-signed)`, `Signature=adhoc`, `TeamIdentifier=not set`, no
      entitlements printed, `Info.plist=not bound` (dev runs the raw Mach-O directly, not a bundle).
      This CONFIRMS the checkpoint's claim directly from measurement on this machine, not just by
      citation.
    - `src-tauri/tauri.conf.json`: no `bundle.macOS` key at all — no `signingIdentity`,
      `hardenedRuntime`, or `entitlements` configured anywhere in this repo's committed config.
    - `src-tauri/Cargo.toml`: no `[profile.dev]` or `[profile.release]` override of
      `debug-assertions` — Cargo's own defaults apply (`dev` profile: on; `release` profile: off).
    - `.github/workflows/release-tauri.yml`'s own comment block (lines ~21-24): **"0.x ships
      UNsigned -- no cert secrets are enrolled yet"** — the Apple Developer ID signing path is wired
      but has no real certificate secret enrolled in CI either. A genuinely Apple-trusted signed
      build is not available from this project's existing CI as it stands today.
    - Project memory precedent, read directly (not paraphrased from the checkpoint):
      `keyring-timeout-races-keychain-approval.md` — confirms `keyring:timeout` was diagnosed as an
      ad-hoc-signature/Keychain-ACL-instability artifact specific to unsigned dev builds, and its own
      recommended fix #1 was "sign the dev build with a stable identity (keeps the tested path
      identical to production)" — i.e. a STABLE identity, not necessarily a Developer-ID-trusted one,
      was already the load-bearing variable in that precedent, not Apple's trust chain per se. This
      generalizes directly to a testable design: isolate "ad-hoc, unstable identity" vs. "stable,
      non-ad-hoc identity" as the variable, independent of whether that identity is Apple-trusted.

- timestamp: 2026-08-02T11:20:00
  source: this cycle's own read-only-adjacent action — actually ran `pnpm exec tauri build --debug
    --bundles app` (a BUILD action, not a source edit; no file under version control was modified;
    `src-tauri/target/` is gitignored — confirmed via `git check-ignore -v`) to verify feasibility
    before recommending a design, per the task's explicit "verify from actual build config... before
    recommending it" instruction
  note: |
    Result: SUCCEEDS. Build log's own line: `Finished 'dev' profile [unoptimized + debuginfo]
    target(s)` — confirms `debug_assertions` is ON in this build (the dev cargo profile, exactly
    like `pnpm tauri:dev`, NOT the release profile `#[cfg(debug_assertions)]` compiles out). Produced
    a real, structurally valid `.app` bundle: `src-tauri/target/debug/bundle/macos/GameLib.app`
    (`Contents/Info.plist` present and parses via `plutil -p`: `CFBundleExecutable=gamelib-shell`,
    `CFBundleIdentifier=com.gamelib.shell`, etc. — a genuine bundle, not a raw binary).

    DIRECT PROOF the diagnostic instrumentation survives packaging, not inferred from the
    `#[cfg(debug_assertions)]` gate alone: `strings` on the bundled binary
    (`Contents/MacOS/gamelib-shell`) contains the literal
    `if (!window.__GAMELIB_DIAG__) { window.__GAMELIB_DIAG__ = []; }` from
    `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT` (main.rs:559+). This directly answers this cycle's design
    obstacle ("packaged build has no inspector and no instrumentation by design") — for a
    `--debug`-flagged `tauri build`, that premise is FALSE: the instrumentation is a compile-time
    `cfg` gate tied to the cargo profile, not to whether the artifact went through `tauri build`'s
    bundler. `--debug` keeps the dev profile through the full bundling pipeline.

    CONFIRMS signing did NOT change by this step alone: `codesign -dvvv` on the resulting
    `GameLib.app` shows the IDENTICAL `flags=0x20002(adhoc,linker-signed)`, `Signature=adhoc`,
    `TeamIdentifier=not set`, no entitlements — because no `APPLE_SIGNING_IDENTITY` was set and none
    is configured in `tauri.conf.json`, so the bundler ad-hoc-signs by default, same as the raw dev
    binary. `xattr` shows no `com.apple.quarantine` (locally built, will not trigger a Gatekeeper
    prompt on launch). This isolates a real, separate confound this file had not previously named:
    "bundled `.app` vs. raw Mach-O binary" is now controllable INDEPENDENTLY of "ad-hoc vs. stable
    signing identity" — Stage 1 below tests the former in isolation before Stage 2 introduces the
    latter.

    A SEPARATE, non-blocking build-log fact, NOT pursued further: the same build run ended with
    `Error A public key has been found, but no private key. Make sure to set
    TAURI_SIGNING_PRIVATE_KEY environment variable.` — this is the UPDATER-artifact signing step
    (`createUpdaterArtifacts: true` in `tauri.conf.json`, unrelated to macOS code signing), and it
    fired AFTER the `.app` bundle itself was already finished and written to disk (log order:
    `Finished 1 bundle at: .../GameLib.app` precedes the error). The `.app` this test needs is
    intact and unaffected by this unrelated failure. Matches the already-known CI gap
    (`release-tauri.yml`'s own fail-fast step for exactly this env var) — not a new finding, just
    confirmed to reproduce locally too. Not investigated further; orthogonal to F-34.5-G6-01.

- timestamp: 2026-08-02T12:00:00
  source: direct wire-level packet capture (developer-run `sudo tcpdump` on `en0`, TLS handshake
    records only), two separate captures on the same machine/network/day as Evidence
    2026-08-02T11:00:00's Safari.app control — one of the Tauri `loginwin-*` webview loading the
    Epic login flow, one of Safari.app (private window) loading the identical origin family. Parsed
    with a custom Python parser (no `tshark` available on this machine) extracting SNI and the ALPN
    extension directly from each ClientHello off the wire.
  note: |
    RESULT: THE TAURI WEBVIEW'S CLIENTHELLO ALREADY OFFERS `['h2','http/1.1']` — IDENTICAL to
    Safari's offer — across every Epic-family host captured:

    Tauri capture (WebKit-shaped ClientHellos):
    | SNI | ALPN | ciphers |
    |---|---|---|
    | tracking.epicgames.com | ['h2','http/1.1'] | 21 |
    | static-assets-prod.unrealengine.com | ['h2','http/1.1'] | 21 |
    | d442b3ce8309.w.hcaptcha.com | ['h2','http/1.1'] | 21 |
    | 0ffd15324e2b.w.hcaptcha.com | ['h2','http/1.1'] | 21 |
    | store-site-backend-static-ipv4.ak.epicgames.com | ['h2','http/1.1'] | 21 |

    Safari.app capture:
    | SNI | ALPN | ciphers |
    |---|---|---|
    | www.epicgames.com | ['h2','http/1.1'] | 21 |
    | talon-service-prod.ecosec.on.epicgames.com | ['h2','http/1.1'] | 21 |
    | talon-website-prod.ecosec.on.epicgames.com | ['h2','http/1.1'] | 21 |
    | newassets.hcaptcha.com | ['h2','http/1.1'] | 21 |
    | static-assets-prod.unrealengine.com | ['h2','http/1.1'] | 21 |

    Identical ALPN lists, identical cipher counts, identical extension-ID sets (only GREASE values
    differ, as expected between independent ClientHellos). One non-WebKit ClientHello also appeared
    in the Tauri capture (`store.epicgames.com`, ciphers=52, no ext 16) — a different process
    entirely, not the `loginwin-*` webview; excluded from the table above, not investigated further.

    CONSEQUENCE 1 — FALSIFIES the client-side-suppression framing this file had been carrying since
    Evidence 2026-08-02T11:00:00's control reopened the question: nothing in this app suppresses
    HTTP/2 in what it OFFERS. The ALPN offer is already correct and equivalent (list contents) to
    Safari's. This makes the code-signing hypothesis registered in the prior Current Focus block
    (`code_signing_hypothesis_registered`, 11:30:00) MOOT as designed — code signing cannot alter a
    ClientHello ALPN list that is already correct at the wire. See the new Current Focus block for
    full disposition (UNTESTED-AND-DEPRIORITIZED, not eliminated) and the new Eliminated entry
    below.

    CONSEQUENCE 2 — CAUSALITY INVERSION, the more important read: this file's standing account
    (`Resolution.root_cause` framing plus multiple Current Focus blocks) implicitly assumed
    http/1.1 (weaker keep-alive pooling under WKWebView) CAUSES the Talon connection losses. But
    CFNetwork/WebKit are documented to FALL BACK from a failed h2 connection attempt to http/1.1 and
    CACHE that downgrade per-host. This capture — which shows a correct CLIENT OFFER, not the
    protocol actually negotiated on the failing connections — is consistent with BOTH orderings and
    discriminates neither: the observed http/1.1 could be the cause of the connection losses, or a
    CONSEQUENCE of whatever already killed an earlier h2 attempt to the same host. The underlying
    protocol OBSERVATION itself (h2/h3 Electron, h2 Safari.app, http/1.1 Tauri — Evidence
    2026-08-02T09:15:15 and T11:00:00, two independent sources) remains confirmed and is UNAFFECTED
    by this correction. Only the CAUSAL ORDERING this file had been assuming is retracted.

    LIMITS, stated explicitly rather than glossed:
    (1) No `www.epicgames.com` ClientHello appears in the TAURI capture — that connection predates
    the capture window, so this capture corroborates the h2-offer finding across every OTHER
    Epic-family host but does not directly measure the exact origin in question for the Tauri arm. A
    re-capture started BEFORE app launch would close this gap.
    (2) These are TLS 1.3 connections — the SERVER's CHOSEN ALPN value moves into the encrypted
    `EncryptedExtensions` record and is NOT visible in a plaintext capture. This capture proves only
    what the CLIENT OFFERED, not what Cloudflare/Epic's edge actually PICKED. Any future claim about
    the server's negotiated choice needs a different method (e.g. SSLKEYLOGFILE-based decryption,
    which WKWebView does not readily support) — do not cite this capture as evidence of the
    negotiated protocol, only the offered one.

    METHOD FINDING (recorded per the checkpoint's own explicit request): this is the THIRD
    interpretive reading overturned today by a discriminating test that came after it looked solid:
    (1) zero-connect-duration as evidence of pooled connection reuse — falsified by the fresh-window
    control (see Eliminated); (2) the protocol difference relocating the cause into this app's own
    client-side configuration — falsified by the static search plus the Safari.app control (Evidence
    2026-08-02T11:00:00); (3) http/1.1 as the CAUSE (not a possible consequence) of the connection
    losses — undercut by this capture. In each case the mechanism fit all evidence available at the
    time, and in each case a pre-registered discriminating test went against it. Generalizable
    lesson for the rest of this investigation: hypotheses that merely FIT existing evidence have a
    poor track record here; only discriminating tests designed BEFORE the result is known have
    actually moved this file forward. Weight test design over explanatory fit, and keep remaining
    asks minimal rather than elaborate.

- timestamp: 2026-08-02T13:00:00
  source: developer-run temporal-overlap test (pnpm tauri:dev, Chrome-tokens UA), in-page
    correlation of the `/id/api/email/exists` outstanding-request window against every
    `xhr.error`/`xhr.timeout` Talon record in the same run, per the branch definitions
    pre-registered in the 2026-08-02T08:35:00 historical Current Focus block. Cross-checked by the
    developer against every prior run on file for Talon-health-vs-email/exists-outcome
    correlation.
  note: |
    RAW VERDICT:
    ```
    { "exists": { "id": 26, "via": "xhr.send", "outcome": "xhr.timeout", "status": 0,
                   "elapsedMs": 10052 },
      "windowMs": 10052,
      "talonFailures": [ { "kind": "xhr.error", "insideWindow": false,
                            "offsetFromStartMs": -13855 } ] }
    ```
    LANDS ON BRANCH T-NO-OVERLAP: the run's single Talon `xhr.error` occurred 13,855ms BEFORE
    `/id/api/email/exists` was even issued — entirely outside its 10,052ms outstanding-request
    window. Zero Talon failures fell inside the window.

    CONSEQUENCE — narrows, does not kill, the Talon-attestation hypothesis. The DIRECT-OVERLAP
    form (a Talon connection dying WHILE `email/exists` is in flight, stranding its attestation
    payload mid-request) is NOT supported by this result — nothing failed on the Talon host during
    the request's own lifetime. See new Eliminated entry below for the precise scope of what this
    retires. What survives, UNTESTED (not confirmed, not contradicted): a weaker SEQUENTIAL form —
    Talon's session breaks earlier in the page lifecycle, the network layer itself recovers, but
    the attestation payload `email/exists` carries was already spoiled before it was ever sent, so
    Epic's backend silently drops the request rather than answering it.

    RUN-LEVEL CORRELATION, checked across every run on file, is ALSO NOT CLEAN — recorded because
    it independently bears on how much weight the sequential form can carry:
    | run | Talon health | `/id/api/email/exists` outcome |
    |---|---|---|
    | zero Talon failures | fully healthy | SUCCESS (developer reached password step) |
    | this run | 1 failure, 13,855ms before the window | `xhr.timeout` (10,052ms) |
    | 2026-08-02T07:00:00 run | failures present (Evidence 2026-08-02T07:00:00-area) | `xhr.timeout` (10,040ms) |
    | historical 403 run (pre-06:30:00 block) | FULLY HEALTHY — `/v1/init` 200, `/v1/init/execute` 200, `/v1/phaser/batch` 204 x3 | 403 |
    Three of four points fit a "Talon trouble correlates with `email/exists` failure" pattern; the
    403 run is a clean exception — fully healthy Talon, yet a failed (not successful) outcome. This
    independently corroborates this file's earlier, separately-reasoned decision (Eliminated,
    `leading_hypothesis_UNTESTED`) to keep the 403 outcome analytically SEPARATE from the
    Talon-connection-loss family rather than folding it in as one more instance of the same
    mechanism — now supported by a second, independent line of reasoning (run-level correlation),
    not just caution.

    THIRD INDEPENDENT `elapsedMs` MEASUREMENT: 10052ms, joining 10040ms (2026-08-02T07:00:00-area
    run) and the earlier ~10000ms inference. Epic's own client-side timeout on `/id/api/*` fires
    exactly as configured, every time it has been measured — nothing anomalous in the timeout
    mechanism itself. The anomaly stays exactly where it was: this one request receives NO
    response at all while same-configured-budget sibling requests answer in 245-370ms.

    INSTRUMENTATION SELF-CORRECTION (recorded per this file's own discipline about
    silent-negative false results, e.g. the console.log-filter incident): the first analysis
    one-liner used to build the raw verdict above matched only `kind === 'xhr.send'`, which would
    have silently reported "no send record found" had this particular request been issued via
    `fetch` instead. Caught and corrected to `/\.send$/` BEFORE this result was taken as final. It
    did not change this specific outcome (the verdict already shows `"via": "xhr.send"`), but the
    correction is recorded as a standing caution for any future analysis over this instrumentation
    stream: a match this narrow can produce a false "not found" with no indication anything was
    missed.

- timestamp: 2026-08-02T14:00:00
  source: developer-run symmetric-instrumentation test, `npm start` (Electron), the SAME
    wrapper shape (XHR/fetch error-catching, `window.__X`) used on the Tauri arm installed
    inside the Electron login `<webview>`'s own console. Pre-registered in advance as a
    self-critical challenge to the standing WKWebView-connection-anomaly finding, with the
    developer explicitly expecting to lose to the rival hypothesis.
  note: |
    PURPOSE. Every prior cross-shell comparison in this file used an ASYMMETRIC instrument:
    JS-wrapper error-catching on the Tauri side vs. eyeballing DevTools' Network panel on the
    Electron side. The untested rival hypothesis: Chromium's network stack transparently
    retries a failed pooled connection without ever surfacing an error to JavaScript, so the
    "9 Talon failures under Tauri vs. 0 under Electron" comparison could be a MEASUREMENT
    ARTIFACT (asymmetric instrumentation) rather than a real engine difference — which, if
    true, would have dissolved much of this investigation's central finding.

    METHOD. Preconditions matched the Tauri arm exactly: logged-out confirmed via
    `/id/api/authenticate` = 204, wrapper install confirmed via `[X] installed`, username
    submitted, wrapper data read IMMEDIATELY after the username step (see the false-start
    note below for why "immediately" is load-bearing).

    RAW VERDICT (seven requests, status/duration only, no credential values):
    ```
    xhr.ok  talon-service-prod...  204  277ms
    xhr.ok  talon-service-prod...  200  582ms
    xhr.ok  talon-service-prod...  204  256ms
    xhr.ok  /id/api/email/exists   204  503ms
    xhr.ok  talon-service-prod...  200  233ms
    xhr.ok  talon-service-prod...  204  234ms
    xhr.ok  talon-service-prod...  204  251ms
    ```
    ZERO `xhr.error`, ZERO `xhr.timeout`. Six Talon calls all 200/204 in 233-582ms.
    CRITICALLY, `/id/api/email/exists` itself — the exact request that reproducibly times out
    at ~10000ms under Tauri (three independent measurements on file: ~10000ms, 10040ms,
    10052ms, all with `status: 0`, no response) — returned 204 in 503ms here, under the SAME
    instrument that would have caught a silent failure had one occurred.

    CONSEQUENCE. (1) The measurement-asymmetry hypothesis is FALSIFIED: an instrument capable
    of catching a hidden Chromium-level retry-and-recover caught nothing, across seven
    requests including the one request that is this file's core pathological case. See new
    Eliminated entry below. (2) The WKWebView connection anomaly is CONFIRMED under symmetric
    measurement, not merely inferred from mismatched instruments — this upgrades item 2 of the
    "what remains solid" list (see new Current Focus block) from "supported by two different
    instruments" to "survives a challenge specifically designed to kill it." (3) The 503ms
    success vs. the 10,052ms no-response reinforces this file's standing point that the
    pathology under WKWebView is the ABSENCE of a response, not a slow one — Chromium's
    healthy answer here is a 204, not merely a fast one.

    LIMIT, stated plainly so this is not overstated. This is a SINGLE clean Electron run.
    Counting the earlier full-login DevTools-panel read (historical, pre-dates this
    instrumentation), there are now TWO clean Electron observations total, against FOUR Tauri
    runs containing NINE failures on file. The EXISTENCE of the anomaly under symmetric
    measurement is now well-supported. Its RATE on the Electron side is NOT characterized — a
    rate claim would need a few more Electron username-submits (each under a minute with the
    wrapper already written), and is explicitly NOT being requested this cycle; record only if
    a future decision turns on the rate specifically.

    TWO SELF-CAUGHT TEST-DESIGN ERRORS, both procedural, both worth keeping as standing
    cautions for this instrumentation stream:
    (a) RECURRENCE of the `kind === 'xhr.send'`-vs-`/\.send$/` matching gap already recorded
    once in this file (Evidence 2026-08-02T13:00:00's instrumentation self-correction) — the
    first analysis pass over this run's data repeated the same narrow match and would have
    silently missed a fetch-issued request. Caught before the result above was taken as final.
    Recurring gap; any future analysis script over this stream should default to the broader
    match, not rediscover this each time.
    (b) NEW, specific to the Electron `<webview>`: the first attempt omitted the logged-out
    precondition (inconsistent with how it was insisted on for every Tauri run), and a
    SUCCESSFUL login closes the login window and destroys the injected `window.__X` wrapper
    before it can be read — the resulting empty array was initially misdiagnosed as "already
    authenticated" rather than "evidence destroyed by the very success it was measuring."
    Corrected by the developer. REUSABLE PROCEDURAL RULE: read the wrapper's data immediately
    after the username step, never after a successful login completes — the mirror image of
    the Tauri arm's already-known 300s-teardown data-loss gotcha (evidence lost at the far end
    of a failed run vs. evidence lost at the near end of a successful one).

    ATTEMPTED, INCONCLUSIVE: a ClientHello-churn re-analysis of the EXISTING packet captures
    (Evidence 2026-08-02T12:00:00's captures) was tried as a cheap proxy for connection loss
    — counting per-host ClientHello repeats as a signal of reconnection churn. Returned no
    usable result: the Tauri capture contains no `talon-service-prod` ClientHello at all (those
    connections predated the capture window), the two captures span different durations, and
    every per-host count on file is 1-3, too small to read a churn signal from. Recorded as
    ATTEMPTED-AND-INCONCLUSIVE, not as a negative result, so a future cycle does not repeat it
    expecting an answer from the same captures.

    METHOD NOTE, tying to `method_finding` (2026-08-02T12:00:00 Current Focus block): this is
    the FIFTH prediction made on this file today, and the FIRST to strengthen rather than
    weaken the standing account. The prior four (zero-connect-duration reuse, client-side
    HTTP/2 suppression, http/1.1-as-cause, Talon-attestation DIRECT-OVERLAP) all fit the
    evidence available at the time and were each overturned by a discriminating test. This one
    was pre-registered with the coordinator explicitly expecting to LOSE it — that stated
    expectation is what makes the win informative rather than self-serving; a test the
    predictor expects to fail that instead succeeds is stronger evidence than a test expected
    to succeed that does.

- timestamp: 2026-08-02T15:00:00
  source: (1) developer-reported live-hardware run reproducing `/id/api/email/exists` 403
    deterministically, on-screen text "enable javascript and cookies to continue"; (2) this
    cycle's own verification of the checkpoint's circumstantial claims against `git log`/`git show`
    (`bf5394a20` and neighbors) and this file's own prior Evidence/Current-Focus entries — checked,
    not taken on faith, per explicit instruction
  note: |
    PART A — THE NEW RUN, RECORDED AS REPORTED (no credential values). Talon fully healthy across
    the run (`/v1/init` 200 id 15, `/v1/phaser/batch` 204 id 16 bodyLen 1639, `/v1/init/execute` 200
    id 18 bodyLen 6914, `/v1/phaser/batch` 204 id 20 bodyLen 2702). The crux request RESPONDED
    rather than hanging: `/id/api/email/exists` POST bodyLen 15371 -> status 403 (id 19). On-screen
    text, developer verbatim: "enable javascript and cookies to continue" — a DIFFERENT literal
    string from the earlier historical 403 run's "enable cookies" copy (embedded in the
    2026-08-02T06:30:00 Current Focus block's `second_defect_found`), but the SAME genre: generic
    Epic block-page copy already established as misleading in this file (cookies/localStorage both
    confirmed working in this webview, and Epic's own bundle demonstrably executes — Statsig gate
    warnings, etc.).

    TWO CONFOUNDS, explicitly UNRESOLVED — NOT answered by the developer as of this entry. Per
    instruction, this run is NOT folded into the file as directly comparable to the earlier 403 run
    until both are answered:
    (1) Which binary produced this run — `pnpm tauri:dev`, or the packaged
    `src-tauri/target/debug/bundle/macos/GameLib.app` built in an earlier cycle (Evidence
    2026-08-02T11:20:00)?
    (2) Was `GAMELIB_OAUTH_UA_LEGENDARY` set for this specific run? If unset, this run used the
    STOCK UA (no engine tokens — previously shown at Evidence 2026-08-02T03:00:00 to produce a
    DIFFERENT failure, an HTTP 400 on `/id/api/redirect` with visible "client_id is required" text,
    not this 403), whereas the earlier historical 403 run used the Chrome-tokens UA
    (`leading_hypothesis_UNTESTED`, Eliminated section below). If the stock UA was in fact used
    here, TWO variables moved at once between the two 403 runs (UA AND whichever binary produced
    this one), not one — the two runs cannot yet be read as replicating each other.

    PART B — VERIFICATION OF THE CIRCUMSTANTIAL CLAIMS, checked against the actual repo and this
    file's own record, per instruction, rather than transcribed:

    CLAIM 1 ("`bf5394a20` introduced the XHR/fetch-wrapping diagnostic") — CONFIRMED. `git show
    --stat bf5394a20` / `git show bf5394a20 -- src-tauri/src/main.rs`: commit message "chore(debug):
    in-page diagnostic capture for the shared login window," adds `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`
    wrapping `window.fetch`, `navigator.sendBeacon`, and both `XMLHttpRequest.prototype.open`/
    `.send`. Content matches the checkpoint's description exactly.

    CLAIM 2 ("every 403 observation in this file postdates that commit; pre-instrumentation symptoms
    were only blank-pages/timeouts") — CONFIRMED, WITH A SCOPE CORRECTION the checkpoint itself did
    not state. Methodological note first: this file's OWN internal narrative timestamps are NOT
    wall-clock-aligned with git's real author-date timestamps — e.g. this file's own
    2026-08-02T03:30:00 entry (extending this same instrumentation) corresponds to the real commit
    `2666ef498`, whose git author-date is 08:57:20 the same day, and the file's 06:30:00 block (which
    embeds the historical 403 run) postdates `bf5394a20`'s 08:44:05 in the file's OWN sequence despite
    the numeral being smaller — the two clocks do not share an epoch. Ordering must be read from THIS
    FILE's own entry sequence, not compared numerically against git's author-date. Read that way: the
    ONLY `/id/api/email/exists` 403 recorded anywhere in this file before this entry — the "historical
    403 run," embedded directly in the 2026-08-02T06:30:00 Current Focus block's
    `second_defect_found`, raw record `{kind:"xhr.response", id:20, url:"/id/api/email/exists",
    method:"POST", status:403, elapsedMs:342}` — was read FROM `window.__GAMELIB_DIAG__` itself, i.e.
    captured BY the very instrumentation now under suspicion. It is definitionally impossible for
    that record to exist before the instrumentation did. The instrumentation's first recorded use in
    this file is Evidence 2026-08-02T03:00:00. Every Evidence entry strictly before that point
    (2026-08-01T22:38:17 through 2026-08-02T01:10:00) reports only blank-page / empty-DOM / timeout /
    caught-exception symptoms — zero mentions of a 403 on `/id/api/email/exists` anywhere in that
    range. SCOPE CORRECTION: this file DOES contain the literal substring "403" before the
    instrumentation (Evidence 2026-08-01T23:40:00 onward, x7 per run) — these are Epic's own
    `*.js.map` SOURCE-MAP requests, already independently established as benign and unrelated (Epic
    does not serve maps publicly), and they remain present, unchanged, in every run including the
    post-instrumentation ones. The claim is TRUE only when scoped to the specific anti-bot
    `email/exists` 403, not to the literal substring "403" — recorded precisely because this file's
    own discipline requires it, not to weaken the claim's substance.

    CLAIM 3 ("this makes it the ~6th observation of this specific 403") — CONTRADICTED BY THIS
    FILE'S OWN RECORD, NOT CONFIRMED. The run-level correlation table at Evidence 2026-08-02T13:00:00
    lists every run on file to that point (4 total: 1 success, 2 `xhr.timeout`, 1 `403` — the single
    historical run). No other independent `email/exists` 403 entry exists anywhere else in this file
    (checked: grepped every "403" occurrence in the file; all others are either the benign source-map
    403s above or prose referring back to this same single historical run). Prior to this entry, the
    file's own evidence supports exactly ONE `email/exists` 403 observation, not five — this entry's
    new run would make it the SECOND, not the sixth. The claim as given overstates the historical base
    by roughly 4x. Recorded exactly as a contradiction, per instruction, not softened — this does not
    mean the new run is unreal or the reframe is wrong, only that its stated evidentiary weight
    ("~6th") is not supported by what this file actually contains.

    CLAIM 4 (installation-timing asymmetry — Tauri's script runs at document-start; the Electron
    arm's wrapper was installed after page load) — CONFIRMED. Evidence 2026-08-02T14:00:00's own text
    states the symmetric-instrumentation wrapper was "installed for the first time inside the Electron
    `<webview>`'s own console" — i.e. via a DevTools console paste, necessarily AFTER the page (and
    Epic's own bootstrap scripts) has already loaded and started executing. The Tauri side is
    independently confirmed (Evidence 2026-08-01T23:50:00, direct read of the vendored `tauri` crate's
    `prepare_pending_webview`) to inject via `webview_attributes.initialization_scripts`, which the
    framework runs BEFORE any page script. This is a real, previously-unflagged asymmetry specific to
    the 403/fingerprinting question. It does NOT reopen the connection-loss finding — both arms were
    instrumented for the full duration `/id/api/email/exists` was outstanding in both, regardless of
    when the wrapper was first attached (Evidence 2026-08-02T14:00:00 already scoped this correctly).

    CALL SITE FOR THE PROPOSED DISABLE TEST, located and read directly (not assumed):
    `src-tauri/src/main.rs:1886-1889`, inside the `humble_login_open` arm (confirmed non-Humble-
    specific, shared by all five runners — Evidence 2026-08-01T23:15:00):
    ```rust
    #[cfg(debug_assertions)]
    if visible {
        builder = builder.initialization_script(DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT);
    }
    ```
    STAGED, NOT-YET-APPLIED disable (per this file's own convention for prior fix designs, and this
    cycle's constraint against editing `src-tauri/` without confirmed session closure): add ONE
    additional condition to the existing `if visible`, preserving both current gates exactly,
    default-preserving current behavior (instrumentation stays ON unless the new env var is
    explicitly set), matching this file's existing `GAMELIB_APP_ROOT`/`GAMELIB_SIDECAR_ENTRY`
    env-var-gate style (`main.rs:2471`, `main.rs:2548`):
    ```rust
    #[cfg(debug_assertions)]
    if visible && std::env::var("GAMELIB_DIAG_DISABLE").is_err() {
        builder = builder.initialization_script(DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT);
    }
    ```
    Run as `GAMELIB_DIAG_DISABLE=1 pnpm tauri:dev` once applied. Fully revertable (unset the var, or
    revert the one-line diff). Does not touch `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`'s own body, its
    `#[cfg(debug_assertions)]` gate, or the `if visible` gate — all three stay exactly as they are.
    NOT YET APPLIED BY THIS AGENT THIS CYCLE. CORRECTION, added immediately after this entry was
    written (see Evidence 2026-08-02T15:10:00 below): `src-tauri/src/main.rs` was found to ALREADY
    carry a different, uncommitted, already-present modification to this exact call site — this
    "not yet applied" statement describes only what THIS agent did this cycle, not the actual
    current state of the file on disk. Read Evidence 2026-08-02T15:10:00 before treating the
    call site above as unmodified.

- timestamp: 2026-08-02T15:10:00
  source: `git status --porcelain` / `git diff src-tauri/src/main.rs` / `git log -1 -- src-tauri/
    src/main.rs`, run immediately after the entry above was written, as a sanity check before
    finalizing this cycle's report — not prompted by any instruction to check, done on this agent's
    own initiative per the general discipline of verifying repo state rather than assuming it
  note: |
    CRITICAL, UNPLANNED FINDING. `src-tauri/src/main.rs` is ALREADY MODIFIED, UNCOMMITTED, on disk
    right now. This modification was NOT made by this agent this cycle — no Edit/Write tool call
    against `src-tauri/` occurred before this check. The last COMMIT touching this file is
    `0c2cd0517` (2026-08-02 10:18:28 local); the file's own mtime is 2026-08-02 15:49:50 local —
    over five hours newer than the last commit, confirming this is a real, recent, local, unstaged
    change, not stale artifact.

    THE DIFF (full text, no credential-shaped content — read directly, not summarized from memory):
    two hunks. (1) Extends the `xhr.send` record in `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT` with a
    read-only `configuredTimeoutMs` field (reads `this.timeout` off the XHR instance, never sets
    it) — functionally consistent with, though not textually identical to, the `configuredTimeoutMs`
    capture this file's own Evidence 2026-08-02T07:05:00 entry already describes; whether this is
    that same work never committed, or a re-derivation, is UNESTABLISHED and not chased further
    here. (2) At the exact call site named in this cycle's own staged-and-not-applied design
    (`main.rs:1886-1889` pre-diff), changes `if visible {` to
    `if visible && std::env::var("GAMELIB_LOGIN_DIAG").as_deref() == Ok("1") {` — i.e. a REAL,
    ALREADY-PRESENT disable/enable toggle for `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`, opt-IN
    (default OFF) rather than this cycle's opt-OUT (default ON) design, plus a new `eprintln!` log
    line when the script IS injected. The accompanying Rust comment block argues the identical
    fingerprinting/automation-signal reasoning this cycle's checkpoint response gave, close enough
    in specific phrasing ("6-15 KB attestation payload," "canonical automation signal," "EVERY 403
    observation... postdates the commit... bf5394a20") to indicate this working-tree change was
    written in direct response to essentially this same reframe, by someone or something other than
    this agent's own tool calls this cycle.

    THIS IS NOT DOCUMENTED ANYWHERE ELSE IN THIS FILE — grepped `GAMELIB_LOGIN_DIAG` across the
    entire debug file before this entry: zero hits. No prior Evidence entry, Current Focus block, or
    Resolution note announces or explains this change.

    CONSEQUENCES, stated precisely, not softened:
    (1) This cycle's own "STAGED, NOT YET APPLIED" language (immediately above, and in Current
    Focus's `disable_test_design_staged_not_applied`) is CORRECTED, not retracted: it accurately
    describes what THIS AGENT did (nothing) but INACCURATELY implied the call site itself was
    unmodified, which this agent had not actually checked before writing it. Standing self-
    correction recorded per this file's own discipline about not letting a plausible-sounding
    written claim stand uncorrected.
    (2) A THIRD, NEWLY-DISCOVERED CONFOUND on the new 403 run reported this cycle (see Evidence
    2026-08-02T15:00:00, Part A): IF this uncommitted change was already in the working tree when
    that run was produced, `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT` would have been OFF BY DEFAULT (needs
    `GAMELIB_LOGIN_DIAG=1` explicitly set), meaning the instrumentation-as-cause hypothesis this
    entire cycle exists to test could ALREADY have been running in a partially-disabled state during
    that very run, unbeknownst to the report that prompted this cycle. This is UNRESOLVED — whether
    this specific working-tree state was in effect for that run is unknown to this agent — and is
    recorded as a THIRD open confound alongside the two named in Evidence 2026-08-02T15:00:00
    (which binary; `GAMELIB_OAUTH_UA_LEGENDARY` state).
    (3) Per the standing constraint in this cycle's own instructions (do not proceed to edit
    `src-tauri/` while session status is unconfirmed), this agent took NO action on this
    discovery beyond reading and reporting it — the existing uncommitted diff was NOT reverted,
    NOT completed, NOT built, NOT run. Whether it is intentional in-progress work the developer
    already knows about, or something else, is unknown and must be asked, not assumed either way.
    (4) This discovery raises the priority of confirming session-closure status ABOVE its previous
    framing in this cycle — an uncommitted change already sitting in `src-tauri/` is itself
    consistent with (though not proof of) an active, unfinished editing session, which is exactly
    the condition this cycle's constraints were written to guard against.

- timestamp: 2026-08-02T16:00:00
  source: (1) developer checkpoint response answering two of the three confounds raised at
    15:00:00/15:10:00 and introducing one NEW variable not among the original three; (2) this
    agent's own re-check of `git status --porcelain -- src-tauri/src/main.rs` / `git diff --
    src-tauri/src/main.rs`, run this cycle per the standing rule that graphify has zero coverage
    of `src-tauri`'s Rust and direct git commands are the documented fallback; (3) direct read of
    this project's own `keyring-timeout-races-keychain-approval` memory file, quoted rather than
    paraphrased, to check the developer's citation of it
  note: |
    PART 0 — RE-VERIFIED: THE UNCOMMITTED DIFF IS STILL PRESENT, UNCHANGED. `git status
    --porcelain -- src-tauri/src/main.rs` still reports ` M src-tauri/src/main.rs`; `git diff --
    src-tauri/src/main.rs` shows the SAME two hunks recorded at Evidence 2026-08-02T15:10:00
    (the read-only `configuredTimeoutMs` field on the `xhr.send` record, and the
    `if visible && std::env::var("GAMELIB_LOGIN_DIAG").as_deref() == Ok("1") {` opt-in toggle plus
    its `eprintln!` line at the `humble_login_open` call site) — byte-for-byte the same as last
    cycle's report, nothing added, nothing reverted. Confirms the diff is not an artifact of a
    single stale read: it is a real, persistent, still-uncommitted state of the working tree
    across this cycle boundary. NOT touched, reverted, or completed this cycle either, per
    constraint.

    PART A — CONFOUND ANSWERS FOR THE 403 RUN, TWO OF THREE RESOLVED, ONE STILL OPEN. The
    developer's message directly answers confound (1) (binary) and confound (2)
    (`GAMELIB_OAUTH_UA_LEGENDARY`) from Evidence 2026-08-02T15:00:00: the run used `pnpm
    tauri:dev` (the standard dev build, NOT the packaged bundle from Evidence 2026-08-02T11:20:00),
    and `GAMELIB_OAUTH_UA_LEGENDARY` was NOT set, i.e. stock `USER_AGENTS.legendary` (no engine
    tokens) was in effect. Confound (3) — the THIRD confound raised at Evidence
    2026-08-02T15:10:00, whether `GAMELIB_LOGIN_DIAG=1` was set for this specific run — is NOT
    addressed anywhere in the developer's message. It is not implicitly answered either: the
    message describes a different, new variable (`GAMELIB_DEV_SECRET_VAULT=1`, see PART C) that
    was not among the three original confounds and does not bear on whether the diagnostic
    injection script was itself active. Recorded precisely so this is not mistaken for a
    resolution: confound (3) remains OPEN. Since the run used `pnpm tauri:dev` against a working
    tree that (per PART 0) already carries the opt-in `GAMELIB_LOGIN_DIAG` gate, and the
    developer's answer says nothing about setting that variable, the DEFAULT behavior of that gate
    (instrumentation OFF unless `GAMELIB_LOGIN_DIAG=1` is explicitly exported) makes it
    PLAUSIBLE — not confirmed — that this run's 403 occurred with the diagnostic script INACTIVE.
    If so, the instrumentation-as-cause hypothesis this whole thread exists to test would need a
    different explanation for how the diagnostic-free run still produced the 403 that prompted the
    hypothesis in the first place. This is exactly why confound (3) must be answered before the
    disable-instrumentation test is treated as informative in either direction.

    PART B — UA-INDEPENDENCE CORROBORATION FOR THE ALREADY-ELIMINATED PRE-AUTH UA HYPOTHESIS,
    RECORDED WITH HONEST PROVENANCE. The historical 403 run (embedded in the 2026-08-02T06:30:00
    Current Focus block) used the Chrome-tokens UA. This new run used the stock UA (per PART A).
    Two materially different UA strings, same outcome shape (403 on `/id/api/email/exists`, generic
    anti-bot block copy). This is a THIRD ground alongside the two already recorded in the
    Eliminated section's `leading_hypothesis_UNTESTED` entry (same UA / different outcomes across
    three runs; a different UA failing at a different, earlier stage) — this one specifically shows
    different UA / same outcome at the same stage. IMPORTANT PROVENANCE NOTE, stated as instructed:
    this was NOT a deliberately designed single-variable UA test — the developer did not set
    `GAMELIB_OAUTH_UA_LEGENDARY` for unrelated reasons (testing the disable-instrumentation
    question), and the UA-independence reading is incidental to that. It is valid evidence, but it
    should be recorded and cited as an OBSERVATION OF OPPORTUNITY, not a controlled experiment.
    Not written into the Eliminated entry itself (Eliminated is append-only per this file's own
    protocol) — cross-referenced here instead. Also note, exactly as the developer flagged: the
    stock UA is the same UA this file already recorded (Evidence 2026-08-02T03:00:00) producing an
    HTTP 400 `client_id is required` on `/id/api/redirect` — a POST-AUTH, different-endpoint
    observation that does not conflict with this PRE-AUTH 403, since this run never reached the
    redirect stage.

    PART C — NEW VARIABLE, NOT ONE OF THE ORIGINAL CONFOUNDS: `GAMELIB_DEV_SECRET_VAULT=1` was
    enabled for this run — the first time in this entire investigation this variable is recorded
    as set. Developer's own assessment, recorded verbatim in substance: irrelevant to the 403,
    since the vault only changes where the Node sidecar persists secrets locally (file vs OS
    Keychain) and cannot influence Epic's server-side request classification. Nothing in this
    agent's own review contradicts that reasoning — the vault touches secret persistence, not
    outbound request shape/headers/fingerprint. Recorded as a confound this run carries but not one
    that competes with the instrumentation-as-cause or UA hypotheses for the 403 specifically.

    PART D — NEW HYPOTHESIS, CONNECTION-LOSS THREAD ONLY, KEPT EXPLICITLY SEPARATE FROM THE 403
    PER DEVELOPER INSTRUCTION: Keychain/keyring main-thread blocking as a candidate mechanism for
    the connection-loss phenomenon (NOT the 403). Verified this project's own
    `keyring-timeout-races-keychain-approval` memory file directly (read in full, not from
    developer paraphrase): confirms `KEYRING_READ_TIMEOUT` is `Duration::from_secs(8)`
    (`src-tauri/src/main.rs:640` per that memory's own citation), and confirms the two hardware
    measurements the developer cited are real and accurately quoted — an absent-entry read at
    40-102ms (no authorization needed) versus a present-entry read at 48.9s on one run and 291s on
    another, both terminating `PlatformFailure(-60008, "Unable to obtain authorization for this
    operation")`. The memory's own attributed cause (ad-hoc dev-signature / Keychain-ACL
    instability, not a Keychain flaw in general) and its own conclusion (largely a DEV-BUILD
    artifact) match exactly what the developer's checkpoint message described. The mechanistic
    chain the developer proposes — a blocking Keychain prompt stalls the host process's main
    thread, which stalls WKWebView's networking delegate callbacks, which is a plausible route to
    CFNetwork abandoning in-flight connections — is coherent with that memory's finding that a
    timed-out worker thread is "abandoned, not cancelled" and "keeps running for minutes on its
    own," i.e. this project already has one confirmed instance of the Keychain path producing
    multi-second-to-multi-minute blocking on this exact host process. The n=1 observation offered
    (this run, the first with `GAMELIB_DEV_SECRET_VAULT=1`, had zero connection-loss events) is
    exactly as strong as the developer characterized it: suggestive, not a finding, given prior
    keyring-arm runs were sometimes clean too. Registered here as a HYPOTHESIS for the
    connection-loss phenomenon specifically, with a mechanistically coherent chain and one
    supporting (not designed) observation. Does NOT move anything in the Eliminated section. Does
    NOT compete with or bear on the 403 thread's leading hypothesis. The developer's own suggested
    test (N logged-out submissions with the vault on vs. off, same UA/binary, counting
    `xhr.error`/`xhr.timeout` per run, and explicitly recording whether a Keychain dialog actually
    appeared during the keyring-arm runs, since a cached/approved ACL would produce no blocking and
    thus no effect) is recorded here as the pre-registered design for this hypothesis's first test,
    NOT run this cycle — per the developer's own explicit priority ordering (PART E below), this
    thread stays lower-priority and this cycle does not spend budget executing it.

    PART E — PRIORITY, AS THE DEVELOPER EXPLICITLY SET IT: 403 (deterministic, pre-auth, blocks
    login) remains the higher-priority thread; connection-loss (intermittent, does not block login,
    now with a candidate DEV-BUILD-artifact mechanism of its own) is lower-priority and is not
    pursued further this cycle. Recorded, not re-litigated.

- timestamp: 2026-08-02T17:00:00
  source: developer checkpoint response (this cycle) — disable-instrumentation A/B result on the
    already-uncommitted `GAMELIB_LOGIN_DIAG` build, plus a fingerprint-object diff between the
    Tauri login window and Safari.app on the identical Epic login URL
  note: |
    PART A — DISABLE-INSTRUMENTATION A/B RESULT (the exact test staged at the 15:00:00 block and
    pending since). Both arms run on the SAME build via the env toggle (no rebuild between arms):
    `GAMELIB_LOGIN_DIAG` unset (instrumentation OFF, third gate default) -> `/id/api/email/exists`
    403. `GAMELIB_LOGIN_DIAG=1` (instrumentation explicitly ON) -> 403, same request. Raw result as
    reported, not yet interpreted here (interpretation follows in Eliminated below).

    PART B — FINGERPRINT-OBJECT DIFF, Tauri login window vs. Safari.app, same Epic login URL, same
    machine, same session. IDENTICAL across both: `webdriver:false`, `plugins:5`, `mimeTypes:2`,
    `pdfViewerEnabled:true`, `langs:["en-NZ"]`, `hardwareConcurrency:8`, `maxTouchPoints:0`,
    `vendor:"Apple Computer, Inc."`, `screen:[1470,956,1470,923,24]`, `dpr:2`, WebGL
    `["Apple Inc.","Apple GPU"]`, `hasChrome:false`. DIFFERENT:
    ```
                     Tauri                                    Safari
    outer            [0,0]                                    [1470,923]
    inner            [900,249]                                [1470,333]
    hasSafari        false                                    true
    notifNative      "function(n,t){const o=t||{};!async fun" "function Notification() { [native code]"
    alertNative      "function(i){n(\"plugin:dialog|message\"" "function alert() { [native code] }"
    confirmNative    "async function(i){return await n(\"plug" "function confirm() { [native code] }"
    fetchNative      "function(...re){const{method:ne,url:oe}" IDENTICAL — same Sentry wrapper
    xhrNative        "function(...ne){const oe=this[SENTRY_XH" IDENTICAL — same Sentry wrapper
    ```
    `fetch` and `XMLHttpRequest.prototype.send` carry the identical Sentry-wrapper signature in
    BOTH arms — developer traces this to Epic's own Sentry SDK (`SENTRY_XHR` marker in the xhr
    string), not to this app's diagnostic instrumentation. Safari.app carries the same Sentry
    wrappers and is not blocked.

    PART C — PROVENANCE/SESSION CLOSURE ANSWERS (items 1 and 6 of the prior checkpoint, now
    answered by the developer, recorded here verbatim per this file's raw-evidence-first
    discipline before being acted on in Current Focus below). Diff provenance: the uncommitted
    `GAMELIB_LOGIN_DIAG` diff at `main.rs:1886-1889` was made this session at the developer's own
    direct instruction ("disable the diagnostic script and rebuild"); it adds a THIRD gate
    (`std::env::var("GAMELIB_LOGIN_DIAG") == Ok("1")`, default OFF) on top of the pre-existing
    `#[cfg(debug_assertions)]` + `if visible` double-gate (both preserved, not replaced), plus an
    `eprintln!` receipt line (`[shell] humble_login_open: GAMELIB-DIAG init script INJECTED for
    '{label}'`). Verified by the developer to this file's established bar: `cargo check` 0 errors,
    `cargo test` 92 passed / 0 failed / 1 ignored, `npx jest
    src/backend/__tests__/tauriShellSource.test.ts` 46/46. Still uncommitted; developer has not
    said whether to commit. Session closure: the `pnpm tauri:dev` session (PIDs 44811/44970,
    developer-verified) WAS running when this `main.rs` edit landed; the file watcher rebuilt and
    restarted it automatically, and that restart WAS the rebuild the developer had explicitly
    asked for. No new session-closure gap is open as of this report.

- timestamp: 2026-08-02T17:00:00
  source: developer checkpoint response (this cycle), same message as above — zero-rebuild test
    dispatched to the developer, not yet resolved
  note: |
    A candidate fix/diagnostic shim has been dispatched to the developer for in-console testing,
    applied BEFORE username submission (Talon's large attestation payload is understood to fire at
    `/v1/init/execute` on submit):
    ```js
    Object.defineProperty(window,'outerWidth',{get:()=>window.innerWidth,configurable:true});
    Object.defineProperty(window,'outerHeight',{get:()=>window.innerHeight,configurable:true});
    ```
    RESULT NOT YET REPORTED — this entry records the test's dispatch and design only, per this
    file's raw-evidence-first discipline; the outcome will be recorded as a fresh Evidence entry
    when it arrives, and Current Focus below pre-registers both branches.

- timestamp: 2026-08-02T18:00:00
  source: developer checkpoint response (this cycle) — result of the pending outerWidth/outerHeight
    console shim (dispatched 17:00:00) plus dispatch of a NEW cross-arm fingerprint-dump test
  note: |
    PART A — outerWidth/outerHeight SHIM RESULT. Developer applied both `Object.defineProperty`
    overrides in-console before username submission, same build/session as the prior 403 runs.
    RESULT: `/id/api/email/exists` 403 recurred — same failure signature as every untouched run.

    Interpretation, per the branch pre-registered at 17:00:00 sub-branch (a)/(b): this is NOT a
    clean falsification. Talon's FIRST fingerprint read is understood to happen at `/v1/init`,
    which fires at page load — strictly before any developer console paste is possible. The large
    attestation payload at `/v1/init/execute` (6-15 KB, fires on username submit) is the only
    request that could plausibly have observed the console-applied override, and whether it
    actually captured a materially different value than whatever `/v1/init` already recorded at
    load time is unknown — no instrumentation in this run distinguished those two possibilities.
    Recorded as UNTESTED-PROPERLY, not eliminated. A clean test of this candidate requires
    document-start init-script injection (a rebuild), not a console-timed override.

    PART B — NEW TEST DISPATCHED, NOT YET RESOLVED: rather than rebuild once per remaining
    candidate (outerWidth/outerHeight, hasSafari, the notification/dialog-plugin clobbers), the
    developer has been asked to run the SAME fingerprint-dump script used for the 17:00:00
    Tauri-vs-Safari.app diff, this time inside the ELECTRON login `<webview>` — the arm that is
    demonstrably NOT blocked (`E1`, discriminator verdict, 2026-08-01). Logic: any property that
    reads identically between Electron and Tauri cannot be the signal Talon keys on, regardless of
    how suspicious it looks in isolation against Safari alone, since Electron is unblocked despite
    whatever value it reports for that property. RESULT NOT YET REPORTED — this entry records
    dispatch and design only, per this file's raw-evidence-first discipline. Current Focus below
    pre-registers the branches for when it lands.

- timestamp: 2026-08-03T01:00:00
  source: developer checkpoint response (this cycle) — raw Electron-arm fingerprint dump, run
    inside the WORKING/UNBLOCKED Electron login `<webview>` on the identical property list used
    for the 17:00:00 Tauri-vs-Safari.app diff (dispatched 18:00:00, result landed this cycle)
  note: |
    RAW DUMP (JSON.stringify return value; a console.log-based variant of the same script printed
    nothing useful in this webview's devtools, so a return-value variant was substituted, script
    otherwise identical to the 18:00:00 dispatch):
    ```
    webdriver: false | plugins: 5 | mimeTypes: 2 | pdfViewerEnabled: true
    langs: ["en-GB","en-NZ"] | hardwareConcurrency: 10 | maxTouchPoints: 0
    vendor: "Google Inc." | screen: [3440,1440,3440,1410,24] | outer: [3440,1440]
    inner: [2164,1160] | dpr: 1.2000000476837158 | hasSafari: false | hasChrome: true
    notifNative:   "function Notification() { [native code] "
    alertNative:   "function alert() { [native code] }"
    confirmNative: "function confirm() { [native code] }"
    fetchNative:   "function(...re){const{method:ne,url:oe}="
    xhrNative:     "function(...ne){const oe=this[SENTRY_XHR"
    ```
    Dump taken on the Epic page loaded in the Electron login webview, prior to any credential
    submission; whether an Epic login form was visible on screen at dump time was not reported.

    CROSS-MACHINE CAVEAT, recorded honestly: `hardwareConcurrency` (10 here vs 8 in the
    17:00:00 Tauri/Safari.app run), and `screen`/`outer`/`dpr` (3440x1440 @ 1.2 here vs
    1470x956/1470x923 @ 2 there) do not match the 17:00:00 run's machine/display profile at all.
    This dump was almost certainly captured on different hardware/display than the same-machine,
    same-session Tauri-vs-Safari.app comparison. This confounds any property whose raw MAGNITUDE
    is inherently hardware/display-dependent (`hardwareConcurrency`, `langs`, absolute `screen`
    values, `dpr`) for a naive value-equality comparison — see interpretation in Current Focus for
    how this is handled without discarding the structurally-meaningful properties (zero-vs-nonzero
    `outer`, native-vs-wrapped `notifNative`/`alertNative`/`confirmNative`) that do NOT depend on
    raw magnitude and are therefore NOT confounded by the machine difference.

    SOURCE-LEVEL CHECK (this cycle, static read only, no rebuild): read
    `epic_oauth_redirect_observer_script` in full (`src-tauri/src/main.rs:1384-1421`). It wraps
    ONLY `window.fetch` (never `XMLHttpRequest`), is applied as a Tauri `initialization_script`
    (document-start, before Epic's page JS runs), and its wrapper attaches a `.then()`/`.catch()`
    to EVERY fetch response (acting only on `status===200 && pathname==='/id/api/redirect'`,
    an early no-op return otherwise). Also confirmed `tauri_plugin_dialog::init()` is registered
    in `main()` (`main.rs:3086`) and is the source of the `alertNative`/`confirmNative`
    "plugin:dialog|message" IPC-routed overrides seen in the Tauri dump (`confirmNative` being
    reassigned to an `async function` is this plugin's doing, not Epic's or Talon's) — a DIFFERENT
    plugin than `tauri_plugin_notification` (already eliminated as sole cause, R3, 2026-08-01).

- timestamp: 2026-08-03T04:00:00
  source: fresh logged-out Epic login, `pnpm tauri:dev`, EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT in
    place (live test the 2026-08-03T02:30:00 checkpoint asked for), console relayed by the
    session coordinator with an accompanying TRIAGE (verified point-by-point below rather than
    accepted at face value)
  note: |
    RAW LOG (as relayed):
    ```
    [Error] Refused to connect to ipc://localhost/plugin%3Anotification%7Cis_permission_granted ...
    [Error] Viewport argument key "minimal-ui" not recognized and ignored. (login, line 6)
    [Warning] IPC custom protocol failed, Tauri will now use the postMessage interface instead –
      TypeError: Load failed (user-script:23, line 106)
    TypeError: Load failed
    [Error] Unhandled Promise Rejection: notification.is_permission_granted not allowed on window
      "loginwin-0-18c8259ec45f2580-a839aa9b" ...
    [Warning] Parsing application manifest ... start_url origin differs from document origin
    [Warning] "[Statsig]" ... "accountportal_-_fe_test" (index-BMTfSvFa.js line 501)
    [Error] Source Map loading errors (x13)
    [Error] Failed to load resource: 403 (13 distinct *.js.map files, including LoginPage-*,
      EpicLogo-*, ModalBasePage-*, Divider-*, TrackedListItemButton-*, disney-logo-small-*)
    [Debug] undefined
    [Error] Blocked a frame with origin "https://newassets.hcaptcha.com" from accessing a frame
      with origin "https://www.epicgames.com" ...
    [Warning] window.styleMedia is a deprecated draft version of window.matchMedia API
    [Error] Failed to load resource: 429 (envelope)
    [Warning] Inter-*.woff2 / InterTight-*.woff2 preloaded but not used (x6)
    [Error] Failed to load resource: the server responded with a status of 403 () (exists, line 0)
    ```

    VERIFICATION OF EACH TRIAGE CLAIM (against this file's own recorded history, not accepted on
    relay alone):

    (1) `.js.map` 403s as noise: CONFIRMED, and NOT new — the file already established this at
    Evidence 2026-08-02T00:20:00 ("[seven *.js.map 403s — Epic does not serve maps publicly;
    confirmed benign in a prior cycle]"). Today's count is 13, not 7 — six MORE map files
    404/403'd than that read, and the six new names (`LoginPage-*`, `EpicLogo-*`,
    `ModalBasePage-*`, `Divider-*`, `TrackedListItemButton-*`, `disney-logo-small-*`) are
    plainly UI-component chunk names, not infra chunks. This is corroborating evidence that MORE
    of the login page's component tree loaded/mounted this run than in the 2026-08-02T00:20:00
    read (which had `{"inputs":0,"forms":0,"iframes":[]}` — an empty DOM). The specific
    cross-machine ask ("does Electron also 403 these") remains UNVERIFIED by this cycle —
    I cannot drive a live Electron arm myself. Folded into the checkpoint below as optional,
    not asserted as fact.

    (2) `429 (envelope)` as Sentry rate-limiting: CONFIRMED as an EXISTING, already-recorded
    finding, not new inference — Evidence 2026-08-02T00:20:00 item (3): "`envelope` (Sentry's
    error-ingest endpoint) returned 429 — rate-limited, meaning enough error reports were sent in
    a short window to trip Sentry's own rate limiter." Today's single 429 (vs a prior read that
    paired it with proof of repeated internal throws) is consistent with this same mechanism,
    not evidence of a new one.

    (3) `403 (exists)` = `/id/api/email/exists` as the real blocker: PARTIALLY VERIFIABLE from
    this file alone. This exact endpoint is independently named in `root_cause_scope`
    (frontmatter) as the trigger's own reference point ("HTTP 403 at `/id/api/email/exists`"),
    so its appearance here is consistent with the SAME defect this whole thread investigates,
    not a new one. What IS new relative to the last full-DOM read (2026-08-02T00:20:00,
    `{"inputs":0,"forms":0,"iframes":[]}`, zero DOM to interact with): today's log shows an
    hCaptcha frame (`newassets.hcaptcha.com`) present and blocked from cross-origin frame access
    — this could not happen if the DOM were still empty, since there is no iframe to be blocked
    from accessing anything. Combined with (1)'s extra UI-component chunk 403s, this is
    consistent with the page rendering FURTHER than the 2026-08-02 baseline. It is NOT confirmed
    that the actual email/password fields were visible and interactive — no DOM dump
    (`{"inputs":...}`) was captured this run, and the developer was not asked this directly.
    Treated as an OPEN QUESTION for the checkpoint, not assumed either way, per instruction.

    (4) Notification-plugin CSP/IPC errors as a resurrection of R3 with a NEW mechanism: see the
    new Eliminated entry and Current Focus reasoning below for the full comparison against R3's
    actual falsification text. Short version: the two console lines named here (CSP refusal +
    unhandled rejection) are NOT new — they are the SAME two lines the file already recorded at
    Evidence 2026-08-02T00:20:00 and explicitly noted as "expected to be present again" (plugin
    registration was reverted after the R3 removal test). What the coordinator is actually
    pointing at is a DIFFERENT claim than "these two lines cause the symptom" (already killed) —
    it is "the mere presence of Tauri's IPC/plugin JS surface in this webview is itself a
    Talon-visible automation signal," which is a genuinely distinct, previously untested
    mechanism (see below).

    (5) `user-script:23, line 106` attribution: DETERMINED, with high confidence, via direct
    source read this cycle (not guessed). Both `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT` (this
    cycle's own shim, `main.rs:1477-1515`) and `epic_oauth_redirect_observer_script`
    (`main.rs:1384-1421`, the post-auth fix) are built via Rust `concat!` of many
    space-terminated fragments with NO embedded `\n` — each compiles to a SINGLE line of JS.
    Neither contains the substring "postMessage" or "IPC custom protocol" anywhere (grepped
    `main.rs` directly — the only occurrence of that phrase in the whole file is inside a DOC
    COMMENT at line 470-471, referencing this very defect, not inside any script literal). The
    dev-only `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT` (332 lines, the one multi-line app script that
    COULD in principle produce a "line 106" location) is gated OFF by default
    (`GAMELIB_LOGIN_DIAG=1` required, unset by default) and also contains no matching text.
    Both plugin init scripts (`tauri-plugin-notification-2.3.3` and `tauri-plugin-dialog-2.7.2`
    `init-iife.js`) are single-line minified bundles with no matching text either. The ONLY
    matching, multi-line candidate is Tauri's own core transport script,
    `tauri-2.11.5/scripts/ipc-protocol.js` (91 raw lines; contains the exact string "IPC custom
    protocol failed, Tauri will now use the postMessage interface instead" at its own line 61) —
    this file already source-traced this EXACT warning to this EXACT file in the
    2026-08-02T18:00:00+ cycle (item 3 in that entry: "traced to its exact source,
    `tauri-2.11.5/scripts/ipc-protocol.js` (read in full, 92 lines)"), where it first appeared
    at `user-script:103, line 106` — SAME "line 106" as today's `user-script:23, line 106`. The
    line-number match across two different `user-script` ordinal indices, combined with today's
    IIFE-single-line ruling-out of all three app-authored scripts, is strong (not merely
    circumstantial) confirmation this is the SAME Tauri-internal script both times, not a defect
    in this cycle's own shim. The `103 -> 23` ordinal SHIFT is most plausibly explained by the
    two runs' login-window labels: 2026-08-02's read was `loginwin-4-*` (5th login window opened
    in that app session), today's is `loginwin-0-*` (1st window in a fresh session) — if
    WebKit's `user-script:N` numbering accumulates per-process (across every webview the app has
    ever created in that run, not reset per-window), a first-window session naturally starts
    from a lower baseline than a fifth-window session. This explanation is PLAUSIBLE and
    consistent with all available evidence but not verified against WebKit's own internal
    numbering scheme (undocumented at this level) — recorded honestly as the most likely
    explanation, not a certainty. CONCLUSION: this cycle's own shim is NOT the script throwing;
    no self-inflicted defect from this cycle's fix is indicated by this line.

- timestamp: 2026-08-03T05:00:00
  source: session coordinator relay, developer correction to the 2026-08-03T04:00:00 checkpoint's
    own instruction (that checkpoint explicitly asked the developer to leave `GAMELIB_LOGIN_DIAG`
    unset for the fresh logged-out run; the developer has now reported that instruction was NOT
    followed)
  note: |
    MATERIAL CONFOUND, recorded honestly before any further interpretation is trusted:
    `GAMELIB_LOGIN_DIAG=1` WAS actually set on the exact live run that produced Evidence
    2026-08-03T04:00:00 (the run with the interactive-looking form + `403 (exists)` on submit,
    `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT` in place). This matters mechanically, not just
    procedurally: per the gate at `main.rs` (`if visible && std::env::var("GAMELIB_LOGIN_DIAG")
    .as_deref() == Ok("1")`, confirmed opt-in/default-OFF, see Evidence 2026-08-02T17:00:00 PART C
    and the 2026-08-02T15:00:00+ region), setting this var turns ON
    `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT` -- a 332-line document-start `initialization_script` that
    wraps `window.fetch`/`XMLHttpRequest.prototype.send`/`navigator.sendBeacon`. This file has
    LONG carried `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`'s own fetch-wrapping as an unresolved suspect
    for the pre-auth 403 in its own right (see `epic_oauth_redirect_observer_script_unresolved_by
    _this_test`, Evidence 2026-08-03T01:00:00, reasoning about a STRUCTURALLY DIFFERENT but
    mechanistically ANALOGOUS fetch-wrapper, `epic_oauth_redirect_observer_script` -- the same
    class of concern applies at least as strongly to `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`, which is
    older, larger, and wraps MORE surfaces: fetch, XHR, AND sendBeacon).

    CONSEQUENCE FOR EVIDENCE 2026-08-03T04:00:00's INTERPRETATION: that run's `403 (exists)`
    result is CONFOUNDED, not clean. It does NOT, by itself, cleanly establish that
    `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT` (outerWidth/outerHeight/alertNative/confirmNative) is
    insufficient to prevent the 403 -- the diagnostic script's own fetch-wrapping was ALSO active
    and is an independently-suspected confound on the exact same request path
    (`/id/api/email/exists`, POST). It likewise does NOT cleanly point at the Tauri IPC surface
    (`hypothesis_new` in Current Focus) either, for the identical reason: a known, unrelated
    fetch-wrapping suspect was live during the same observation. Neither conclusion in either
    direction may be drawn from this run alone. A clean re-run with `GAMELIB_LOGIN_DIAG` EXPLICITLY
    UNSET is required before trusting this run's `403 (exists)` result as evidence either for or
    against the fingerprint-shim-sufficiency question or the new IPC-surface hypothesis.

    NOT AFFECTED BY THIS CONFOUND, stands as previously recorded: the `user-script:23, line 106`
    -> Tauri core `tauri-2.11.5/scripts/ipc-protocol.js` attribution (Evidence 2026-08-03T04:00:00,
    item 5) -- that attribution was derived from static source comparison of script byte-shape
    (single-line IIFE vs. multi-line), not from anything `GAMELIB_LOGIN_DIAG`'s state could alter,
    and is independent of whether the diagnostic script was itself injected.

    DEVELOPER DECISION THIS CYCLE (relayed): proceed with OPTION B from the 2026-08-03T04:00:00
    checkpoint (test the new Tauri-IPC-surface hypothesis via a 3-arm elimination dump, same
    discipline as the outerWidth/alertNative/confirmNative dump) -- but SEQUENCED after a clean
    re-run of the fresh logged-out Epic login with `GAMELIB_LOGIN_DIAG` explicitly unset, since
    this confound must be resolved first. If the 403 does NOT reproduce with DIAG off, that is
    itself a major finding (implicates `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`'s own fetch-wrapping,
    not the IPC surface or residual fingerprint tells) and would need to be reported and weighed
    before the 3-arm IPC dump is even the right next question. See Current Focus (superseding
    block, this timestamp) for the full checkpoint issued to the developer.

- timestamp: 2026-08-03T06:00:00
  source: session coordinator relay, live hardware, `env -u GAMELIB_LOGIN_DIAG pnpm tauri:dev` --
    the coordinator verified `GAMELIB_LOGIN_DIAG` ABSENT from the running process environment
    directly (Rust shell pid, sidecar pid, tauri-dev pid all inspected, not user self-report) --
    this is the clean re-run required by the 2026-08-03T05:00:00 confound entry's
    `required_sequencing` step (a)
  note: |
    CLEAN REPRO, DE-CONFOUNDED: a fresh logged-out Epic login was attempted with
    `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT` verifiably OFF (`GAMELIB_LOGIN_DIAG` absent from the actual
    running environment, not merely "not exported by the developer" -- this closes the exact gap
    the 04:00:00 run left open). Incidental and unrelated to this test: `GAMELIB_DEV_SECRET_VAULT=1`
    was present, expected, explains the absence of a Keychain prompt this run.

    RESULT, user's report verbatim: "ok, done, with 403". The pre-auth `403 (exists)` on email
    submit at `/id/api/email/exists` STILL FIRES with the diagnostic fetch-wrapper OFF.

    CONSEQUENCE 1 -- `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`'s fetch/XHR/sendBeacon wrapping is
    EXONERATED as the cause of THIS 403: the 403 reproduces identically with that specific wrapper
    verifiably absent from the page. See Eliminated, this timestamp, for the formal entry. This is
    a real elimination -- cite this run for it.

    CONSEQUENCE 2 -- NUANCE, do not overclaim: this WEAKENS but does NOT fully kill the standing,
    separately-recorded worry that document-start fetch-wrapping IN GENERAL is Talon's trigger. The
    diagnostic script was the most aggressive wrapper in play (three surfaces: fetch, XHR,
    sendBeacon) and removing it changed nothing -- that is real signal. But two other wrappers were
    STILL present and active during this exact run and are UNADDRESSED by this test:
    `epic_oauth_redirect_observer_script` (the post-auth fix's own fetch wrapper, added in
    `c857ade8e`) and Epic's own Sentry SDK wrapper (`SENTRY_XHR`, confirmed present across all
    control arms per the DIAGNOSTIC-INSTRUMENTATION-AS-SIGNAL elimination, Eliminated section
    below). "Fetch-wrapping in general is harmless" is NOT proven by this run -- only that removing
    the diagnostic's specific wrapper did not clear the 403.

    CONSEQUENCE 3 -- retroactive consistency: the prior (DIAG-ON) 04:00:00 run's `403 (exists)`
    result is now RETROACTIVELY CONSISTENT with this clean run -- same failure, same endpoint, same
    point in the flow -- so the confound did not, in the end, change the outcome. This means:
    - `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT` (outerWidth/outerHeight/alertNative/confirmNative)
      remains exactly as previously scoped: necessary-but-not-sufficient (Eliminated,
      `reasoning_checkpoint_2026_08_03T02_00_00` entry above/below) -- this run neither
      strengthens nor weakens that finding; it was orthogonal to the diagnostic-script variable.
    - The Tauri IPC-surface hypothesis (`hypothesis_new`, recorded 04:00:00) is UNCHANGED in
      status by this result specifically -- it remains the leading live candidate, neither newly
      confirmed nor newly elevated. This run answers ONE question (was the diagnostic script the
      confound?) and answers it: no. It does not itself test the IPC-surface hypothesis.

    SCOPE: this run isolates and answers the diagnostic-script confound specifically -- nothing
    more, nothing less. Step (b) of `required_sequencing` (the 3-arm IPC-surface dump) is now
    unblocked and confirmed as the correct next question; see Current Focus, this timestamp.

## Eliminated

- hypothesis: `alertNative`/`confirmNative` (window.alert/window.confirm `.toString()` shape) as
  a currently-live Talon signal.
  eliminated_by: fresh 3-arm dump, 2026-08-03T07:00:00 (Tauri/Electron/Safari.app), coordinator-
    relayed.
  note: |
    CONFIRMED FIXED, not merely "was already handled." All three arms now read
    `function alert() { [native code] }` / `function confirm() { [native code] }` identically.
    This is `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT`'s `Function.prototype.toString` WeakMap patch
    (Resolution -- PRE-AUTH structural-fingerprint fix, `fix_pre_auth_fingerprint` item 2)
    holding under live conditions for the first time -- previously only static-verified
    (`verification_pre_auth_fingerprint`). Does NOT mean the pre-auth 403 itself is fixed (see
    the 2026-08-03T04:00:00/06:00:00 blocks: the shim is necessary-but-not-sufficient, the 403
    still fired with the shim in place). Do not re-open alert/confirm toString as a candidate
    without new evidence the patch stopped applying (e.g. a future Tauri/plugin upgrade changing
    injection order).

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

- hypothesis: "Zero connect-phase duration on same-origin Resource Timing rows is evidence of a
  reused pooled HTTP connection" — the INTERPRETIVE READING that had supported candidate
  mechanism 2 in the `branch_3_landed`/07:40:00–07:45:00 historical Current Focus blocks. This is
  NOT candidate mechanism 2 itself (stale pooled-connection reuse), which survives, unevidenced.
  eliminated_by: pre-registered control measurement, brand-new login window's first requests,
    Evidence 2026-08-02T08:20:00.
  note: |
    FALSIFIED as a discriminating instrument, per the developer's own pre-registered falsifier: a
    genuinely brand-new window's EARLIEST same-origin requests show the identical
    `connectStart===connectEnd===startTime` zero-duration signature that had been read as proof of
    reuse. Since a fresh window cannot have a pre-existing connection of its own to reuse (unless
    WKWebView shares a connection pool across windows in the same process, itself unconfirmed), the
    zero-duration signature is at best ambiguous between "no connect-phase data on this platform at
    all" and "the pool really is shared app-wide" — it cannot serve as evidence for the narrower
    claim (THIS request reused THIS run's earlier connection) the prior reading needed to support
    candidate mechanism 2. Candidate mechanism 2 (stale pooled connection) is NOT eliminated by
    this — it is now UNEVIDENCED, exactly as it was before Evidence 2026-08-02T07:30:00 was
    (wrongly) read as supporting it. Do not re-cite the zero-duration signature as evidence for or
    against connection reuse without a different instrument (e.g. an out-of-band packet capture,
    already flagged in `branch_3_landed`'s own Branch A-CONTRADICTED guidance as outside this
    file's live-hardware-checkpoint method).

- hypothesis: `leading_hypothesis_UNTESTED` — UA/ENGINE FINGERPRINT MISMATCH is a SUFFICIENT
  explanation for the PRE-AUTH `/id/api/email/exists` failure specifically (historical Current
  Focus block, 2026-08-02T06:30:00: "anti-bot fingerprinting exists to catch exactly that
  inconsistency, and a 403 on the first credential-adjacent request is consistent with it").
  SCOPE, stated precisely so this is not overclaimed: this elimination covers ONLY the pre-auth
  `/id/api/email/exists` failure. It does NOT touch `ua_table_and_test_design_flaw` (historical
  Current Focus block, 2026-08-02T08:15:00; full table at Evidence 2026-08-02T08:10:00), which
  concerns a DIFFERENT request (`/id/api/redirect`, the post-auth 400/`client_id is required`
  question) and remains a live, unproven three-point fit, open and un-eliminated.
  eliminated_by: the convergence of Evidence 2026-08-02T08:00:00 and Evidence 2026-08-02T08:45:00.
  note: |
    FALSIFIED as a SUFFICIENT explanation for the pre-auth defect, on two independent grounds:
    (1) the SAME truthful-Safari UA produced three different `/id/api/email/exists` outcomes across
    three separate runs — 403, `xhr.timeout`, and success (Evidence 2026-08-02T08:00:00,
    `pre_auth_defect_reframed_as_intermittent`) — a deterministic fingerprint-rejection mechanism
    would not vary its outcome under a literally identical UA string; (2) a DIFFERENT UA — the
    combined-token literal, the ONE UA on record believed (three-point fit) to most closely match
    Epic's expected client and to have cleared the post-auth 400 — ALSO failed in this cycle's
    reinstated run (Evidence 2026-08-02T08:45:00), and it failed at Talon/captcha initialization, a
    stage upstream of `/id/api/redirect` and upstream of anything fingerprint-gated. A UA/
    fingerprint mechanism cannot explain a failure occurring before any fingerprint-sensitive
    request is even reached. Taken together, UA is not a SUFFICIENT explanation for the pre-auth
    defect; it is retired from the active-hypothesis list for THAT symptom. This does NOT rule UA
    out as a possible CONTRIBUTING factor to intermittency, and does NOT touch the post-auth UA
    table, which stays open exactly as scoped above. Do not re-open the pre-auth UA/fingerprint
    hypothesis without new evidence specifically isolating UA as the sole variable across an
    unconfounded pair of runs.

- hypothesis: client-side HTTP/2 suppression — something in this app's own code, configuration, or
  build (independent of code signing) prevents the Tauri `loginwin-*` webview from OFFERING `h2` in
  its TLS ClientHello, explaining the http/1.1-vs-Safari.app discrepancy the 11:00:00 control
  surfaced.
  eliminated_by: direct wire-level packet capture, Evidence 2026-08-02T12:00:00.
  note: |
    FALSIFIED at the wire. The Tauri webview's ClientHello ALPN offer (`['h2','http/1.1']`) is
    equivalent in list contents to Safari.app's offer for the same origin family, on the same
    machine, same day. Nothing in this app suppresses HTTP/2 in what it offers over TLS. This also
    renders the code-signing hypothesis (`code_signing_hypothesis_registered`, 11:30:00 Current
    Focus block) MOOT-BY-DESIGN for its originally stated purpose — code signing cannot change an
    ALPN list that is already correct — recorded there as UNTESTED-AND-DEPRIORITIZED, not
    eliminated (it was registered as a hypothesis but its Stage 2 test never ran). Do not re-open
    the client-side-suppression framing without new evidence that the OFFER itself (not the
    negotiated result, which this capture cannot see under TLS 1.3) is somehow wrong for the exact
    failing origin/connection.

- hypothesis: Talon-attestation DIRECT-OVERLAP form — a Talon connection dies WHILE
  `/id/api/email/exists` is itself in flight, stranding an attestation dependency mid-request and
  causing Epic's backend to never respond.
  eliminated_by: pre-registered temporal-overlap test, Evidence 2026-08-02T13:00:00, branch
    T-NO-OVERLAP.
  note: |
    FALSIFIED for the specific DIRECT/SIMULTANEOUS mechanism. The run's one Talon `xhr.error`
    landed 13,855ms before `email/exists` was even issued, outside its 10,052ms window entirely —
    nothing failed on the Talon host during the request's own lifetime in this run. This does NOT
    eliminate the Talon-attestation FAMILY of explanations: a weaker SEQUENTIAL form (session
    disrupted earlier, network layer recovers, payload already spoiled before send) remains open
    and explicitly UNTESTED — see Current Focus. Also does not eliminate the DIRECT-OVERLAP form
    in general, only for this run; a single non-overlapping observation cannot rule out overlap
    ever occurring in some other run, but it is the only temporal-overlap data point on file and
    the pre-registered test explicitly named this branch as the disconfirming one. Do not re-open
    the DIRECT-OVERLAP framing as the LEADING account without a new run that shows a Talon failure
    actually inside the outstanding `email/exists` window.

- hypothesis: MEASUREMENT-ASYMMETRY — the "9 Talon connection failures under Tauri vs. 0 under
  Electron" comparison is an artifact of unequal instrumentation (JS-wrapper error-catching on
  Tauri vs. DevTools-panel eyeballing on Electron), because Chromium's network stack
  transparently retries a failed pooled connection and opens a fresh one without ever surfacing
  an error to JavaScript — i.e. Electron is losing connections too, just silently recovering and
  hiding it from the weaker instrument used to observe it.
  eliminated_by: pre-registered symmetric-instrumentation test, Evidence 2026-08-02T14:00:00 —
    the SAME wrapper shape installed inside the Electron `<webview>`'s own console.
  note: |
    FALSIFIED. An instrument capable of catching a silent Chromium-level retry-and-recover
    caught nothing across seven requests, including `/id/api/email/exists` itself — the exact
    request that reproducibly dies with no response under Tauri returned 204 in 503ms here.
    This was a pre-registered, self-critical challenge to the standing WKWebView-connection-
    anomaly finding (the coordinator explicitly expected to lose it), and it failed to kill the
    finding. CONSEQUENCE: the cross-shell comparison this hypothesis challenged is NOT a
    measurement artifact — the WKWebView connection anomaly is real under symmetric
    measurement. Do not re-open the asymmetric-instrumentation framing without new evidence
    that this specific symmetric wrapper itself fails to catch some class of Chromium-side
    silent retry (e.g. a retry that never touches XHR/fetch prototypes at all).

- hypothesis: DIAGNOSTIC-INSTRUMENTATION-AS-SIGNAL — this app's own diagnostic instrumentation
  (`DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`, the XHR/fetch/sendBeacon wrapper injected at document-start
  into the login window) is itself the anti-bot signal Talon acts on, causing the deterministic
  `/id/api/email/exists` 403.
  eliminated_by: TWO INDEPENDENT refutations, arrived at by different methods, both this cycle —
    (1) the disable-instrumentation A/B test, Evidence 2026-08-02T17:00:00 PART A; (2) the
    fingerprint-object diff between the Tauri login window and Safari.app, Evidence
    2026-08-02T17:00:00 PART B.
  note: |
    FALSIFIED, doubly. This hypothesis was pushed hard as the leading candidate across the
    14:00:00/15:00:00/16:00:00 blocks (canonical automation-fingerprint shape, confirmed
    asymmetric install timing vs. the Electron control) and is now dead.

    REFUTATION 1 (A/B toggle, direct): both arms of the SAME build — instrumentation OFF via
    `GAMELIB_LOGIN_DIAG` unset, and instrumentation explicitly ON via `GAMELIB_LOGIN_DIAG=1` —
    produced the identical `/id/api/email/exists` 403. No rebuild between arms, so this isolates
    the instrumentation variable cleanly. Combined with the earlier 5/5 deterministic run (Evidence
    2026-08-02T15:00:00-block era), which PREDATED this env-gate entirely and therefore ran with
    instrumentation UNCONDITIONALLY active, all three observed states — unconditionally-on,
    explicitly-on, explicitly-off — produce the same 403. An instrumentation-driven signal that
    fires identically whether the instrumentation is present or absent cannot be the mechanism.

    REFUTATION 2 (fingerprint diff, independent method): the specific artifact this hypothesis
    named as the tell — patched `fetch`/`XMLHttpRequest.prototype.send` — is confirmed present in
    BOTH the Tauri arm and the Safari.app control, with the SAME wrapper signature (Sentry's own
    `SENTRY_XHR` marker). This is Epic's OWN Sentry SDK wrapping these primitives, not this app's
    instrumentation. Safari carries the identical wrapper and is not blocked. So patched network
    primitives — the exact signal this hypothesis proposed — cannot be what Talon keys on, proven
    by a completely different method (object-level fingerprint comparison, not a toggle test) than
    Refutation 1. Two refutations, independently arrived at, both hold; recording both per this
    file's own discipline of citing every ground a hypothesis dies on, not just the first.

    SCOPE NOTE: this eliminates the instrumentation-AS-CAUSE hypothesis specifically for the
    pre-auth `/id/api/email/exists` 403. It says nothing about the notification-plugin injection
    (`R3`, already separately eliminated above for the ORIGINAL blank-skeleton symptom) or about
    any other injected script; those remain exactly as previously scoped. Do not re-open the
    instrumentation-as-cause framing for this 403 without new evidence specifically implicating the
    diagnostic wrapper under a condition neither refutation covered.

    UPDATE 2026-08-03: a THIRD independent control arm (Electron login `<webview>`, Evidence
    2026-08-03T01:00:00) reinforces Refutation 2 — Electron's `fetchNative`/`xhrNative` carry the
    identical Sentry-wrapper signature too. Three arms (Tauri-blocked, Safari.app-unblocked,
    Electron-unblocked) now all show the same wrapped-fetch/XHR signature; this is Epic's own
    Sentry SDK on every arm regardless of block status. Does NOT extend to the NEW production
    `epic_oauth_redirect_observer_script` (added in `c857ade8e`, AFTER this refutation's evidence
    was captured) — see the 2026-08-03T01:00:00+ Current Focus block for why that script is a
    separate, still-open question this refutation does not resolve.

- hypothesis: `webdriver`/`plugins`/`mimeTypes`/`pdfViewerEnabled`/`maxTouchPoints`/`langs`/
  `hardwareConcurrency`/`vendor`/`screen`/`dpr`/`hasChrome`/`hasSafari` — any ONE of these
  JS-observable fingerprint properties is, by itself, sufficient for Talon to block the pre-auth
  Tauri arm.
  eliminated_by: 3-arm control comparison (Tauri=blocked, Safari.app=unblocked same-machine/session
    per Evidence 2026-08-02T17:00:00 PART B, Electron=unblocked per Evidence 2026-08-03T01:00:00).
  note: |
    FALSIFIED for each of these properties INDIVIDUALLY, by the same logic the 2026-08-02T18:00:00
    block pre-registered: a property cannot be Talon's sole signal if its Tauri (blocked) value is
    ALSO present in at least one UNBLOCKED control arm. Applying this per-property, using BOTH
    unblocked controls (not just Electron), each of these is eliminated because Tauri's own value
    is shared by at least one unblocked arm:
    - `webdriver`(false), `plugins`(5), `mimeTypes`(2), `pdfViewerEnabled`(true),
      `maxTouchPoints`(0): identical across all three arms.
    - `langs`(`["en-NZ"]`), `hardwareConcurrency`(8), `vendor`(`"Apple Computer, Inc."`),
      `screen`(`[1470,956,1470,923,24]`), `dpr`(2): identical Tauri vs Safari.app, same
      machine/session — Electron's differing raw values here are a cross-machine artifact (see
      2026-08-03T01:00:00's cross-machine caveat) and irrelevant to this elimination, which already
      holds on the Safari.app match alone.
    - `hasChrome`(false): identical Tauri vs Safari.app (both false), Electron's `true` irrelevant.
    - `hasSafari`(false): identical Tauri vs Electron (both false) — despite differing from real
      Safari's `true`, an UNBLOCKED arm (Electron) shares Tauri's exact value, so `hasSafari:false`
      alone cannot be sufficient for blocking.

    `inner` (window content-area dimensions) is NOT treated as a candidate at all — it legitimately
    varies by window size in every real browser and carries no fixed engine-identity meaning, unlike
    `outer` (see the surviving candidate below).

- hypothesis: `reasoning_checkpoint_2026_08_03T02_00_00` — correcting `window.outerWidth`/
  `outerHeight` (0 -> mirrored to inner) and `window.alert`/`confirm`'s non-native `.toString()`
  shape, alone, is SUFFICIENT to clear the pre-auth Talon 403 at `/id/api/email/exists` (and/or
  `/v1/init`).
  eliminated_by: live hardware, fresh logged-out Epic login, `pnpm tauri:dev`,
    EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT in place, Evidence 2026-08-03T04:00:00.
  note: |
    FALSIFIED AS SUFFICIENT, per this hypothesis's own pre-registered falsification test
    (`reasoning_checkpoint_2026_08_03T02_00_00`, `falsification_test`: "If the 403 ...still
    occurs identically ... after both properties are corrected, this hypothesis is FALSIFIED").
    The final line of today's console is `[Error] Failed to load resource: the server responded
    with a status of 403 () (exists, line 0)` — `/id/api/email/exists`, the same Talon-gated
    endpoint this investigation's `root_cause_scope` already names. The 403 did NOT clear with
    the shim in place. The two corrected properties were either not load-bearing for Talon's
    decision at all, or necessary-but-not-sufficient (some other signal — TLS/JA3, header
    ordering, the still-separately-open Tauri-IPC-surface lead below, or something not yet
    found — also has to change before the 403 clears).

    PARTIAL EFFECT, characterized honestly and NOT claimed as a win for the shim: today's log
    shows MORE of the login page rendered than the 2026-08-02T00:20:00 baseline read (13 vs 7
    component-chunk 403s including plainly UI-named chunks; an hCaptcha iframe present and
    blocked from cross-origin frame access, where the baseline read had zero iframes; an actual
    `/id/api/email/exists` call attempted, where the baseline read had zero DOM inputs/forms to
    drive such a call from). This COULD mean the shim measurably improved page bootstrap
    progress even though it did not clear the 403 — but this is AMBIGUOUS, not confirmed: no
    controlled A/B (shim off vs shim on, same session, same conditions) was run this cycle, the
    two reads are two days apart with unknown other intervening changes, and the "further
    rendering" could equally be explained by something else entirely (a different Epic-side
    A/B bucket, a warmed CDN/cache state, timing, or the extra scripts this cycle added
    changing script-injection order in a way unrelated to the two targeted properties). Do NOT
    read this as "the shim is a partial success" without a dedicated, controlled follow-up test.
    Do NOT revert or remove the shim — it corrects two independently real, structurally-provable
    fingerprint signals regardless of whether they turn out to be THE load-bearing one, and
    removing it would only reintroduce known-bad structural signals with no offsetting benefit.

- hypothesis: "`DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`'s fetch/XHR/sendBeacon wrapping (the 332-line,
  opt-in, `GAMELIB_LOGIN_DIAG`-gated document-start diagnostic script) is a SOLE or NECESSARY cause
  of the pre-auth `/id/api/email/exists` 403."
  eliminated_by: clean, de-confounded live re-run, `env -u GAMELIB_LOGIN_DIAG pnpm tauri:dev`,
    `GAMELIB_LOGIN_DIAG` verified ABSENT from the actual running process environment by the
    session coordinator directly (not user self-report), Evidence 2026-08-03T06:00:00.
  note: |
    FALSIFIED for necessity. The pre-auth 403 reproduces identically with this script's
    fetch/XHR/sendBeacon wrapping verifiably absent from the page -- the wrapper is not required
    for the block to occur. This is a distinct, additionally-verified confirmation of the same
    directional conclusion already reached via an A/B toggle in the DIAGNOSTIC-INSTRUMENTATION-
    AS-SIGNAL entry above (Evidence 2026-08-02T17:00:00 PART A) -- that entry's refutation is NOT
    superseded or weakened by this one. This entry adds an independently-derived confirmation using
    direct process-environment verification (coordinator-inspected, not developer self-report)
    rather than a same-build A/B toggle, and exists specifically to close the confound raised at
    Evidence 2026-08-03T05:00:00 (where the developer's self-reported "left it unset" turned out to
    be wrong for the prior run).

    SCOPE NOTE, do not overextend: this does NOT establish that fetch-wrapping in general is
    harmless to this flow. `epic_oauth_redirect_observer_script` (the post-auth fix's own wrapper,
    `c857ade8e`) and Epic's own Sentry SDK wrapper (`SENTRY_XHR`) were BOTH still present and active
    during this exact clean run and remain UNADDRESSED by this specific test. Only the diagnostic
    script's own wrapper is exonerated here as THIS 403's cause. Does not change the status of the
    Tauri IPC-surface hypothesis (`hypothesis_new`, Current Focus 04:00:00 block) or the fingerprint
    shim's necessary-but-not-sufficient status (entry above) -- both stand exactly as previously
    scoped.

## Current Focus

<!-- SUPERSEDING BLOCK 2026-08-03T10:00:00 -- USER DECISION RECEIVED: PIVOT TO SIDLOGIN (option
     ii from the 09:00:00 checkpoint). This cycle (1) records the pivot as the pre-auth path's
     established resolution direction WITHOUT closing F-34.5-G6-01/Phase 34.5, and (2) plans the
     pivot's routing/viability/cleanup/verification in detail from real source reads. NO CODE
     CHANGED THIS CYCLE -- planning + re-issued CHECKPOINT (decision) only, per explicit
     instruction. Everything below this block, including the 09:00:00/08:00:00/... blocks, remains
     HISTORICAL/authoritative context this block acted on -- nothing reverted; the throwaway
     diagnostic and both Epic-only production scripts remain untouched in source. Read THIS block
     first. -->

pivot_decision_recorded_2026_08_03T10_00_00: |
  User decision, relayed via session coordinator, dated 2026-08-03: "lets pivot to sidlogin for
  epic" -- option (ii) from `recommendation_2026_08_03T09_00_00`, chosen over option (i) (one more
  live reassignment iteration) and option (iii) (Tauri/wry source-level patch/fork).

established_resolution_direction_pre_auth_2026_08_03T10_00_00: |
  Recorded here as the finding's established root-cause-for-the-embedded-path + chosen resolution
  direction. This EXTENDS `root_cause_pre_auth_fingerprint`/`recommendation_2026_08_03T09_00_00`
  below -- does NOT overwrite or blend with the POST-AUTH `Resolution.root_cause`/`Resolution.fix`
  entry (silently-refused WKWebView navigation, Evidence 2026-08-02T05:05:00), which is a separate,
  already-implemented-but-not-live-verified fix for a different defect in the same flow.

  To the extent this investigation can determine: Talon (Epic's anti-bot service) rejects the
  Epic login page under Tauri with a pre-auth HTTP 403 because the WKWebView carries
  Tauri-injected global surface (`window.isTauri`, `window.__TAURI_INTERNALS__`, `window.ipc`, six
  `window.__TAURI_PLUGIN_*` keys, `window.__TAURI__`/`window.__TAURI_IIFE__`) that is entirely
  absent from the two arms proven interactive (Electron's `<webview>`, Safari.app) -- see
  `descriptor_findings_2026_08_03T09_00_00` for the full primary-source citation chain.
  `window.isTauri` -- Tauri's own literal, purpose-built "is this page running inside Tauri" flag
  -- is the single most plausible detection target, and is PROVEN, both by direct primary-source
  descriptor reads (`tauri-2.11.5/src/manager/webview.rs:168-170`,
  `Object.defineProperty(window, 'isTauri', { value: true })`, no `writable`/`configurable`
  specified -> both default `false`) AND by this cycle's own live diagnostic
  (`tauriInternalsGone:false`, `isTauriGone:false`, `ipcGone:false` despite the script's own
  delete-then-reassign attempt against all three) to be PERMANENTLY UNMASKABLE from page JS --
  `delete` fails, reassignment fails, and a `Proxy` cannot help either (spec-mandated invariants
  for a non-configurable/non-writable data property, AND no mechanism for page JS to make another
  script's `window` reference transparently pass through a proxy of our construction). THEREFORE:
  the seamless embedded-webview Epic login CANNOT be fixed from the JS layer under Tauri. This is
  the practical ceiling of this investigation's JS-layer approach, not a claim that Talon's exact
  check is confirmed -- nothing here identifies which specific propert(ies) Talon actually reads,
  only that the most purpose-fit candidate is unfixable regardless.

  CHOSEN ROUTE-AROUND: SIDLogin (auth via the user's real system browser, never a WKWebView),
  structurally immune to this entire class of JS-surface fingerprinting because Talon never sees
  a WKWebView-shaped `window` object during that flow at all.

  EXPLICIT NON-CLOSURE: this pivot decision does NOT close `F-34.5-G6-01` or Phase 34.5, and does
  NOT retire any `34.5-UNTESTED-ITEMS.md` row. The pivot must still be IMPLEMENTED and
  LIVE-VERIFIED end-to-end (see `live_verification_requirements_2026_08_03T10_00_00` below) before
  anything closes. This file's `status` frontmatter reflects "pivot decided, plan drafted, pending
  implementation + live verification" -- deliberately not any value implying closure.

post_auth_live_gate_flagged_for_reconciliation_2026_08_03T10_00_00: |
  NAMING, NOT DROPPING: the separately-owed post-auth live-gate checkpoint (Resolution.verification
  above, "WHAT WAS NOT PROVEN" -- FIX DESIGN branch-A step (4): a fresh logged-out Epic login
  completes, AND an already-authenticated session's redirect is captured via
  `epic_oauth_redirect_observer_script`/the `on_navigation` exfil intercept, AND library refresh
  triggers; tracked by `U-34.5-06` and `U-34.5-11` in
  `.planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/
  34.5-UNTESTED-ITEMS.md`) is now LIKELY MOOT FOR EPIC SPECIFICALLY if the embedded Epic login is
  being abandoned in favor of SIDLogin -- there would be no more embedded Epic session for that
  exfil mechanism to ever capture a redirect from. This is flagged explicitly for reconciliation,
  NOT silently marked resolved and NOT silently dropped: `U-34.5-06`/`U-34.5-11` remain OPEN rows
  in the ledger, untouched by this cycle. Whether they get formally retired as
  "N/A -- superseded by SIDLogin pivot" or kept open pending a final decision on whether the
  embedded Epic path survives as a fallback (see routing option 2 below) is itself part of what
  the routing decision in this checkpoint needs to settle -- this cycle does not decide it
  unilaterally. GOG/Amazon/Zoom/Humble's own post-auth capture verification is UNAFFECTED either
  way -- `epic_oauth_redirect_observer_script` and the `OAUTH_REDIRECT_EXFIL_HOST` intercept are
  Epic-only (confirmed by source read this cycle, see `cleanup_scope_proposal` below); no other
  runner's login flow depends on them.

routing_investigation_2026_08_03T10_00_00: |
  Re-verified from the ACTUAL current source this cycle (not trusted from the 07:00:00 block's
  citation):

  - `src/frontend/screens/Login/index.tsx:157-169` (Epic's `Runner` tile): `loginUrl={
    epicLoginPath}` (`epicLoginPath = '/loginweb/legendary'`) is the PRIMARY action --
    `Runner/index.tsx`'s `handleLogin()` does `navigate(props.loginUrl)` on click,
    UNCONDITIONALLY (no `isTauri()` gate at all today). `alternativeLoginAction={() =>
    setShowSidLogin(true)}` is the SECONDARY action, rendered by `Runner/index.tsx` as a second,
    visually distinct "Alternative Login Method" tile shown only when `alternativeLoginAction` is
    passed AND `!isLoggedIn` -- Epic is the ONLY runner given this prop today (GOG/Amazon/Zoom/
    Steam/Humble tiles have no `alternativeLoginAction`, so they never render a second tile).
    CONFIRMED, re-read this cycle: line numbers and behavior match the 07:00:00 block's citation
    exactly.
  - `/loginweb/legendary` resolves through `frontend/screens/WebView/index.tsx` +
    `useTauriOAuthLogin.ts` + `loginRoutes.ts` (`EPIC_LOGIN_URL` constant, `isLoginPathname()`) --
    this is the SAME shared `TauriLoginPanel`/`humble_login_open` machinery GOG (`/loginweb/gog`),
    Amazon/nile (`/loginweb/nile`), Zoom (`/loginweb/zoom`), and Humble (`/loginweb/humble`) all
    route through too (`loginRoutes.ts`'s `LOGIN_PATHNAMES` list, all 5 `/loginweb/*` entries plus
    2 legacy paths). Confirms the shared-vs-Epic-only split at the ROUTING layer, not just the
    Rust-arm layer already established below.
  - Today, under Tauri, an Epic user hits the KNOWN-BROKEN embedded path FIRST (primary tile) and
    only discovers the working SIDLogin path via the secondary "Alternative Login Method" tile --
    the opposite of what the pivot should produce.

  THREE ROUTING OPTIONS, with tradeoffs (not a unilateral choice -- see CHECKPOINT):

  OPTION 1 -- SIDLogin becomes Epic's ONLY path under Tauri (embedded hidden for Epic, Tauri only;
  Electron's Epic tile stays exactly as-is, since Electron's embedded Epic login is E1-proven
  interactive). Mechanism: gate `Login/index.tsx`'s Epic `Runner` props on `isTauri()` (imported
  from `preload/tauriTransport`, the SAME established import this codebase already uses at
  `WebView/index.tsx:557`/`useTauriOAuthLogin.ts:155` -- reusing the proven gate, not inventing a
  new one, given this project's own recorded `isTauri()` stale-guard gotcha, phase 34.4 gate item
  2). Under Tauri: Epic's tile would pass `loginUrl` unused/inert or repoint `alternativeLoginAction`
  as the ONLY action (needs a small `Runner` prop-shape decision -- e.g. an `onClick` override, or
  simply always calling `alternativeLoginAction` when `isTauri()` is true for Epic). Pros: no
  Tauri user ever hits the guaranteed-403 path; enables full removal of the three Epic-only
  scripts + the exfil intercept once shipped. Cons: largest of the three changes; touches
  `Runner`'s generic prop contract (shared by all 6 runners) to add Epic+Tauri-specific behavior,
  raising re-regression risk for the other 5 tiles if done carelessly; loses the embedded path as
  a fallback entirely (no escape hatch if SIDLogin's `legendary.gl/epiclogin` page itself ever
  breaks).

  OPTION 2 -- SIDLogin becomes the DEFAULT/PRIMARY tile under Tauri, embedded kept as a SECONDARY
  "Alternative Login Method" fallback (i.e., swap which action is primary vs alternative for Epic,
  Tauri only; Electron unchanged). Mechanism: same `isTauri()` gate, smaller surface -- swap which
  callback `Runner`'s primary `onClick` invokes for Epic specifically under Tauri, keep
  `alternativeLoginAction` wired to the embedded flow instead of removing it. Pros: smallest,
  least risky change (one conditional swap, not a new prop shape); keeps a fallback route alive
  if SIDLogin's own external page ever changes; the recommendation's own phrasing ("small, scoped
  frontend change") most closely matches this option's size. Cons: a Tauri user can still click
  the demoted "alternative" tile and hit the guaranteed-403 embedded path -- confusing, not fixed,
  just deprioritized; does not, by itself, retire the Epic-only Rust scripts or resolve the
  post-auth live-gate reconciliation question above (embedded Epic path still technically live and
  reachable).

  OPTION 3 -- status quo, relabeled as deliberate (do not change which tile is primary). NOT
  RECOMMENDED: every Tauri user would keep hitting the guaranteed-broken primary path first, which
  is the exact problem the pivot exists to solve. Listed for completeness, not as a real
  candidate.

  This cycle does not choose between options 1/2 -- see CHECKPOINT below.

sidlogin_under_tauri_viability_2026_08_03T10_00_00: |
  Checked the ACTUAL code path end-to-end this cycle, not assumed from the component rendering
  (per this project's own repeated Tauri-vs-Electron surprises --
  `navigator.clipboard`/`queryLocalFonts`/`safeStorage` precedent):

  1. `SIDLogin/index.tsx`'s "open the login page" buttons call `loginPage()`
     (`frontend/helpers/index.ts:35`, `const loginPage = window.api.openLoginPage`). Traced to
     `src/backend/sidecar/shellFilesFlowRegistration.ts:174` (`ipcMain.on('openLoginPage', ...)`,
     Phase 34.3, already-ported channel) -> `openUrlOrFile(epicLoginUrl)`
     (`src/backend/utils.ts:418-423`) -> `shell.openExternal(url)`. Under the Tauri sidecar,
     `shell` is `src/backend/sidecar/electronStub.ts:525-527`'s real stub:
     `openExternal: async (url) => { transport?.openExternal(url) }` -- forwards to the Rust
     `open_external` command (`src-tauri/src/main.rs:380`), which calls
     `tauri_plugin_opener::OpenerExt`'s real opener plugin (a maintained, genuine
     "open in the OS default handler" mechanism -- the same plugin used for `steam://` links per
     the doc comment at `main.rs:11`). CONFIRMED: this is a real Tauri-side implementation, not a
     hollow/no-op stub of the kind this project has hit before (`nativeImage`, `safeStorage`).
     `loginPage()` genuinely opens the user's system browser under Tauri.
  2. `handleCopyLink`/the paste-back input use `window.api.clipboardWriteText`/
     `window.api.clipboardReadText` (`SIDLogin/index.tsx:31,137`) -- NOT bare `navigator.clipboard`,
     which this project's own memory records as silently no-op-ing under WKWebView
     (`navigator-clipboard-noops-under-tauri.md`). SIDLogin already uses the correct,
     already-fixed wrapper API -- no new gap here, and this is independent confirmation the
     component was built (or already patched) with the Tauri clipboard gotcha in mind.
  3. `handleLogin(sid)` calls `epic.login(sid)` (`GlobalState.tsx:624`, `epicLogin`) ->
     `window.api.login(sid)` -> traced to `src/backend/sidecar/runnerAuthFlowRegistration.ts:136`
     (`ipcMain.handle('login', ...)`, already-ported channel, validates `sid` is a non-empty
     string then calls) -> `LegendaryUser.login(sid)` -- the REAL, pre-existing legendary auth
     path, unchanged, not a stub. `getUserInfo()` (called on success) is likewise already ported
     (`runnerAuthFlowRegistration.ts:122`).

  CONCRETE GAPS FOUND: NONE. Every link in SIDLogin's chain (open system browser -> user pastes
  SID -> `epic.login(sid)` -> `LegendaryUser.login`) resolves to a genuinely-ported, real Tauri
  implementation, confirmed by reading the actual sidecar registration + Rust command + backend
  function, not inferred from the TypeScript being present. Stated honestly: this is a STATIC
  confirmation only (source reads, not a live run) -- it rules out the *known class* of
  Tauri-silent-stub gap this project has hit three times before, but a live run is still the only
  real proof per this project's own F-10 lesson (a green suite/clean static trace has been wrong
  before). No gap of that kind was found this cycle; that is not the same as "guaranteed to work
  live."

cleanup_scope_proposal_2026_08_03T10_00_00: |
  Gating verified directly from `src-tauri/src/main.rs` this cycle (lines 2150-2157, 2192-2366):
  `humble_login_open` is explicitly documented in its own body comment as "this runner-agnostic
  arm" -- SHARED, single Rust match arm used by Epic, GOG, Amazon/nile, Zoom, AND Humble's login
  windows alike (confirmed independently at the frontend routing layer too, see
  `routing_investigation` above -- all 5 `/loginweb/*` paths funnel through the same
  `TauriLoginPanel`/`useTauriOAuthLogin` machinery). `is_epic_login = url.host_str() ==
  Some(EPIC_LOGIN_HOST)` (line 2157) is a per-window runtime boolean computed once per login
  window open, checked against the validated open URL's host -- it is `false` for every
  non-Epic runner's window, unconditionally.

  DEFINITELY REMOVE (regardless of routing option chosen):
  - `EPIC_LOGIN_DELETION_DIAGNOSTIC_SCRIPT` (`main.rs` ~1583-1641) and its injection at
    `main.rs:2365-2366` (`if is_epic_login { builder = builder.initialization_script(
    EPIC_LOGIN_DELETION_DIAGNOSTIC_SCRIPT) }`) -- already labeled THROWAWAY at build time,
    Epic-only AND additionally `#[cfg(debug_assertions)]`-gated (confirmed: the injection itself
    is not further gated in the snippet read, but the diagnostic's own eprintln markers inside the
    shared `on_navigation` closure are `#[cfg(debug_assertions)]`, e.g. lines 2206-2209,
    2211-2214, 2224-2227, all additionally `if is_epic_login`). This was never a candidate for
    keeping -- remove alongside its labeled markers once the pivot supersedes the question it was
    built to answer.

  EPIC-SPECIFIC, BECOME DEAD CODE ONCE THE PIVOT LANDS (removable once Epic stops using the
  embedded webview for login; NOT removable yet -- the embedded path is still the only live path
  until the routing option ships and is verified):
  - `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT` (`main.rs`, injected at line ~2351-2352, gated
    `if is_epic_login` only, no debug gate -- a real production script today). Confirmed
    Epic-only by the same `is_epic_login` gate; confirmed inert for every other runner (their
    windows never reach this branch's `true` arm).
  - `epic_oauth_redirect_observer_script` (`main.rs`, injected at line ~2335-2336, gated
    `if is_epic_login` only). Same confirmation: Epic-only, inert elsewhere.
  - The `.on_navigation` exfil-intercept closure's `OAUTH_REDIRECT_EXFIL_HOST` match arm
    (`main.rs:2196-2230`-ish): the closure itself is attached UNCONDITIONALLY to the shared arm
    (not gated by `is_epic_login`), but its exfil-match body only ever fires for
    `OAUTH_REDIRECT_EXFIL_HOST`, a host distinct from `REVEAL_EXFIL_HOST` and one no other
    runner's page will ever navigate to (per the fix's own `Resolution.fix` doc comment,
    Resolution section above). Once Epic stops using this window entirely, this arm becomes
    permanently-inert dead weight -- safe to remove, but its removal must be scoped carefully
    since the closure is textually shared plumbing (the `.on_navigation` REGISTRATION itself, not
    just this one match arm, sits in the shared builder chain) -- a future implementation cycle
    must remove only the Epic-specific match arm and its debug-log lines, not the closure
    registration if any other mechanism still needs `.on_navigation` for a different host.

  EXPLICITLY SHARED -- DO NOT TOUCH, regardless of pivot outcome:
  - The `humble_login_open` Rust match arm itself, `WebviewWindowBuilder`, `.on_page_load(...)`
    hook, `next_login_window_label()`, `LOGIN_WINDOW_EVENTS`/`push_login_window_event`, the
    `current_origin`/title-tracking mechanism (anti-phishing, T-34.5-G6-39), and the `.theme(...)`
    light-interface-style call -- ALL used by GOG/Amazon/Zoom/Humble's still-needed login flows.
  - `frontend/screens/WebView/index.tsx`, `useTauriOAuthLogin.ts`, `loginRoutes.ts`'s
    `LOGIN_PATHNAMES`/`isLoginPathname()` and the GOG/ZOOM_LOGIN_URL constants -- shared routing
    infrastructure for the other 4 runners.
  - `EPIC_LOGIN_URL` (`loginRoutes.ts:45`) and `matchOAuthRedirect` -- under the STANDING
    CONSTRAINT (unchanged this cycle and not proposed for change even in a future cycle without a
    separate, explicit decision): even if routing OPTION 1 is chosen and Epic's embedded tile is
    hidden under Tauri, `EPIC_LOGIN_URL` would still be reachable via Electron's unchanged Epic
    tile -- it does not become dead code app-wide, only unused on the Tauri build specifically.
    Flagged as a genuine tension for the record, not resolved here: OPTION 1 would make
    `/loginweb/legendary` unreachable FROM THE UI on Tauri specifically, but the route/constant
    itself must stay wired for Electron. No removal of `EPIC_LOGIN_URL` is proposed by this
    cleanup scope.

live_verification_requirements_2026_08_03T10_00_00: |
  Real close criterion, not a static check, per this project's own F-10 lesson ("a green suite
  confirmed nothing about a live-only defect") and the standing `deferred_considerations` rule
  ("NO FIX SHIPS UNTIL THE LOGGED-OUT PATH HAS BEEN OBSERVED WORKING END TO END ON REAL
  HARDWARE"):
  1. Whichever routing option is chosen, a live `pnpm tauri:dev` run confirming the CHOSEN Epic
     tile action (primary for option 1, or the demoted-but-still-present alternative for option 2)
     actually surfaces SIDLogin's modal/instructions correctly -- a single UI-level check.
  2. `loginPage()`/the "Open"/"Copy Link" buttons genuinely open `https://legendary.gl/epiclogin`
     in the REAL system default browser (not silently no-op, not opening a second in-app surface)
     -- observable directly (a real browser window/tab appears on screen).
  3. A genuine, fresh, logged-out Epic account: complete the real Epic login in that system
     browser, obtain the real SID string `legendary.gl/epiclogin` produces.
  4. Paste that real SID into the input (`clipboardReadText`-driven paste or manual paste both
     count) and click Login -- confirm `handleLogin` resolves `status === 'done'`, the modal
     closes (`backdropClick()`), and `getUserInfo()`/`handleSuccessfulLogin('legendary')` fire --
     observable via the Epic tile flipping to logged-in state and a library refresh occurring.
  5. Confirm Epic's library actually populates afterward (mirrors `U-34.5-06`'s own closure
     criterion) -- this is what allows `U-34.5-06`/`U-34.5-11` to be formally reconciled
     (retired-as-superseded or reframed), per `post_auth_live_gate_flagged_for_reconciliation`
     above.
  6. Only after 1-5 pass on real hardware: `F-34.5-G6-01` may be reconsidered for closure, and the
     Epic-only dead-code cleanup (`cleanup_scope_proposal` above) becomes safe to execute.

next_action: |
  CHECKPOINT REACHED (decision) issued this cycle -- see the structured checkpoint returned to the
  user/orchestrator. NO CODE CHANGED THIS CYCLE. Do NOT close `F-34.5-G6-01`, phase 34.5, or any
  `34.5-UNTESTED-ITEMS.md` row. Do NOT touch `USER_AGENTS`/`EPIC_LOGIN_URL`/`matchOAuthRedirect`.
  Do NOT remove `EPIC_LOGIN_DELETION_DIAGNOSTIC_SCRIPT`/`EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT`/
  `epic_oauth_redirect_observer_script` yet -- cleanup is proposed, not executed, and the embedded
  path remains the only live Epic path under Tauri until the pivot ships. AWAITING: the
  developer's choice of routing option (1, 2, or a variant), confirmation to proceed with
  implementation, and eventually the live verification run described above.

<!-- SUPERSEDING BLOCK 2026-08-03T09:00:00 -- PURE STATIC ANALYSIS CYCLE. Live result from the
     08:00:00 diagnostic RECEIVED and RE-INTERPRETED (result is INCONCLUSIVE for the hypothesis,
     not falsifying -- see `live_result_reinterpreted` below). Exact JS property descriptors for
     every SURVIVES-list global determined by direct primary-source read (tauri-2.11.5, wry-0.55.1,
     all 6 plugin crates' actual api-iife.js text -- not inferred, not guessed). NO CODE CHANGED
     THIS CYCLE. CHECKPOINT (decision) REISSUED. Everything below this block, including the
     08:00:00/07:00:00/06:00:00/05:00:00/04:00:00 blocks, remains HISTORICAL/authoritative context
     this block acted on -- nothing reverted; the throwaway diagnostic code itself is untouched.
     Read THIS block first. -->

live_result_reinterpreted_2026_08_03T09_00_00: |
  Verified against the actual `EPIC_LOGIN_DELETION_DIAGNOSTIC_SCRIPT` source
  (`src-tauri/src/main.rs:1583-1641`, read in full this cycle) before trusting the coordinator's
  relay. The script's own marker field names (`tauriGlobalGone`, `tauriInternalsGone`,
  `isTauriGone`, `ipcGone`, `notifNativeLooking`) match exactly the five `diagSummary` keys built
  at line 1628-1634 -- no misattribution. CONFIRMED: the script attempts BOTH `delete` AND a
  reassign-to-`undefined` fallback (`if (typeof window.X !== 'undefined') { window.X = undefined }`)
  on exactly FOUR targets: `window.__TAURI__` (line 1586-1587), `window.__TAURI_INTERNALS__`
  (1588-1589), `window.isTauri` (1590-1591), `window.ipc` (1592-1593). It attempts `delete` ONLY
  (no reassignment fallback) on the remaining SEVEN: `window.__TAURI_IIFE__` and the six
  `window.__TAURI_PLUGIN_*` keys (lines 1594-1600).

  THIS MEANS THE 07:00:00-BLOCK QUESTION "would reassignment work where delete didn't" IS ALREADY
  PARTIALLY ANSWERED BY THIS RUN'S OWN DATA, not just by delete: the marker showed
  `tauriInternalsGone:false`, `isTauriGone:false`, `ipcGone:false` -- meaning reassignment ALSO
  failed for these three (only `tauriGlobalGone:true` succeeded, and that one could have been
  delete or reassignment). This is a live, empirical, direct-observation result -- not a static
  inference -- and it is corroborated below by the actual property descriptors read from source
  this cycle. For the other seven (IIFE + 6 plugin globals), only `delete` was tried; reassignment
  remains UNTESTED live for those specifically (their descriptor answer, from source, is given
  below).

  Corrected framing (per the coordinator's own flagged concern, verified true): the pre-auth 403
  STILL FIRING after this run is INCONCLUSIVE for the surviving-JS-surface hypothesis, not a
  falsification -- the independent variable (presence of `__TAURI_INTERNALS__`/`isTauri`/`ipc`/the
  plugin keys) never actually changed for 10 of the 11 survivors (only `__TAURI__` cleared). "The
  403 still fires with most of the surface still present" tells us nothing new about whether that
  surface is Talon's signal. Framing corrected in this file's own words, not merely accepted from
  the relay.

  Lifecycle note carried forward, not investigated further this cycle (explicitly low priority per
  the relayed data): `on_window_event(Destroyed)` was not observed this run. Most likely
  explanation remains "the user did not close the window during this run" -- this is a plausible,
  ordinary non-event, not a regression signal, and does not block or change this cycle's
  descriptor findings. Flagged for the next live cycle to clarify, not for static analysis to
  resolve.

descriptor_findings_2026_08_03T09_00_00: |
  Read directly from source this cycle (NOT inferred from TypeScript types or doc comments --
  the actual injected JS text IS available in cleartext, contrary to the guidance's concern about
  minification obscuring it; every relevant script is either a literal Rust string constant or a
  small unminified/lightly-minified `.js` file shipped inside the crate's own package on disk):
  `~/.cargo/registry/src/index.crates.io-*/tauri-2.11.5/src/manager/webview.rs` (lines 122-224,
  full `prepare_pending_webview`), `~/.cargo/registry/src/index.crates.io-*/wry-0.55.1/src/
  wkwebview/mod.rs` (lines 636-645), and the actual shipped `api-iife.js` / `src/init-iife.js` /
  `bundle.global.js` text for all 6 plugins plus Tauri's own global-`__TAURI__` bundle.

  CORE THREE (window.ipc, window.isTauri, window.__TAURI_INTERNALS__) -- PROVEN, both by this
  cycle's source read AND by the live diagnostic's own reassignment-fallback data above, to be
  PERMANENTLY UNALTERABLE from JS:

  1. `window.ipc` -- injected by **wry itself**, natively, at `wry-0.55.1/src/wkwebview/mod.rs:
     636-642`, via `w.init(...)` called BEFORE the `for init_script in attributes.
     initialization_scripts` loop (line 643) that carries every one of Tauri's own scripts and
     every one of this app's own registered scripts. Exact text:
     `Object.defineProperty(window, 'ipc', { value: Object.freeze({postMessage: function(s) {
     window.webkit.messageHandlers.ipc.postMessage(s); }}) });` -- ONLY `value` is specified.
     Per the `Object.defineProperty` spec, every unspecified attribute defaults to `false` when
     creating a new property: `writable: false, enumerable: false, configurable: false`. The
     `value` itself is ALSO `Object.freeze`d, so even if some other technique could somehow reach
     the object, `.postMessage` inside it cannot be reassigned either. This independently CONFIRMS,
     from primary source rather than inference, the exact ordering blind spot the 07:00:00 block
     flagged as unconfirmed ("wry's own source was not read") -- now closed: `window.ipc` is
     injected strictly BEFORE every JS init script this app or Tauri registers, by a completely
     separate native code path outside `all_initialization_scripts` entirely, exactly as the
     07:00:00 block inferred from the `ipc-protocol.js` comment, now proven from wry's own source
     directly.
  2. `window.isTauri` -- `tauri-2.11.5/src/manager/webview.rs:168-170`:
     `Object.defineProperty(window, 'isTauri', { value: true });` -- same shape, only `value`
     given: `writable: false, enumerable: false, configurable: false`.
  3. `window.__TAURI_INTERNALS__` -- `webview.rs:172-178`:
     `if (!window.__TAURI_INTERNALS__) { Object.defineProperty(window, '__TAURI_INTERNALS__',
     { value: { plugins: {} } }) }` -- same shape: `writable: false, enumerable: false,
     configurable: false`.

  CONCLUSION FOR THE CORE THREE, stated definitively: non-configurable AND non-writable. `delete`
  fails (already known). Reassignment ALSO fails -- not merely "expected to fail," but ALREADY
  OBSERVED to fail live in this very run's own marker (`tauriInternalsGone:false`,
  `isTauriGone:false`, `ipcGone:false`, despite the script's own reassignment-fallback code path
  having executed against all three). A `Proxy` cannot help either, for two independent reasons,
  both verified rather than assumed: (a) ECMAScript's mandatory Proxy invariants
  (`[[GetOwnProperty]]`/`[[Get]]`/`[[Has]]`/`[[Delete]]` traps) REQUIRE a proxy's reported behavior
  to stay consistent with an already-existing non-configurable target property -- a `deleteProperty`
  trap that reports success for a non-configurable property throws a `TypeError`, and a `get`/`has`
  trap that hides a non-configurable, non-writable data property's true value also throws. This is
  a genuine, spec-enforced invariant, not a library limitation. (b) Even setting invariant (a)
  aside, there is no mechanism for in-page JS to make Talon's OWN script (running in the same
  document, reading the real global `window`) transparently go through a Proxy our script
  constructs -- `window`/`globalThis` is the actual realm global object; you cannot swap in a
  proxy as the thing other scripts see when they reference `window`. Both problems are independent
  and either alone rules out Proxy-based masking for these three properties. JS-side suppression
  is FUNDAMENTALLY IMPOSSIBLE for `window.ipc`, `window.isTauri`, and `window.__TAURI_INTERNALS__`.

  REMAINING EIGHT (window.__TAURI__, window.__TAURI_IIFE__, and the 6 `__TAURI_PLUGIN_*` keys) --
  DIFFERENT, MORE PERMISSIVE shape, confirmed by reading each plugin's actual shipped script text
  (not assumed to be uniform with the core three, per the guidance's explicit instruction to check):

  4. `window.__TAURI__` -- `tauri-2.11.5/scripts/bundle.global.js` (the actual shipped JS, tail of
     the file): `window.__TAURI__=__TAURI_IIFE__;` -- a PLAIN ASSIGNMENT EXPRESSION, not
     `Object.defineProperty`. Since no property of that name previously existed, this creates an
     ordinary, fully mutable own property: `writable: true, enumerable: true, configurable: true`
     (JS default for assignment-created properties). This is EXACTLY why `delete window.__TAURI__`
     already succeeded live this run (`tauriGlobalGone:true`) -- fully explained, not just observed.
     Gated app-wide by `tauri.conf.json`'s `"withGlobalTauri": true` (per the 07:00:00 block's Q3,
     re-confirmed, no per-window opt-out).
  5. `window.__TAURI_IIFE__` -- same file, top of the bundle: `var __TAURI_IIFE__ = function(e){
     ...}(...)`. A top-level `var` declaration executed at the GLOBAL scope of this init script.
     Per ECMAScript's `GlobalDeclarationInstantiation`, a global `var` binding creates a property
     on the global object with `writable: true, enumerable: true, configurable: false` -- this is
     a hard, unambiguous spec guarantee (not an inference from behavior), and it is the SAME
     mechanism as a normal top-level `var x = 1` in any browser script. Explains why `delete`
     already failed live (`__TAURI_IIFE__` was in the SURVIVES list -- configurable:false, matches).
     PREDICTS reassignment (`window.__TAURI_IIFE__ = undefined`) WOULD succeed (writable:true) --
     but this specific script never attempted reassignment on it (only `delete`, per the
     `live_result_reinterpreted` finding above), so this is a confident, source-grounded PREDICTION,
     not yet a live-observed fact.
  6. All SIX `window.__TAURI_PLUGIN_*` keys -- read the ACTUAL shipped `api-iife.js` for every one
     of the 6 plugins this app registers (`main.rs:3372-3391`: opener, dialog, notification,
     updater, shell, clipboard-manager -- matches the SURVIVES list exactly, no extra/missing
     plugin). ALL SIX use the IDENTICAL pattern, independently confirmed by reading each file's
     text in full, not assumed from one example: `if ("__TAURI__" in window) { var
     __TAURI_PLUGIN_X__ = (IIFE)(...); Object.defineProperty(window.__TAURI__, "name",
     { value: ... }) }`. The `var __TAURI_PLUGIN_X__ = ...` inside the `if` block still hoists to
     the enclosing script's global/function scope (var is function-scoped, not block-scoped) --
     SAME global-var shape as `__TAURI_IIFE__` above: `writable: true, enumerable: true,
     configurable: false`. (The plugin's OWN `window.X.name` property it separately defines via
     `Object.defineProperty(window.__TAURI__, "dialog", {value:...})` is a property ON the
     `__TAURI__` object, not a `window`-level global, and not part of the SURVIVES list -- not
     relevant here.) These `api-iife.js` files are the plugin's `global_api_script_path` (build.rs),
     distinct from each plugin's `src/init-iife.js` (`js_init_script` -- e.g. notification's own
     `window.Notification` clobber, R3's already-closed mechanism); reading both confirms they are
     different files with different roles, not the same script under two names. PREDICTS
     reassignment would ALSO succeed for all 6 plugin globals -- same confident, source-grounded,
     not-yet-live-tested prediction as `__TAURI_IIFE__`.

  Q1 injection-order gap the 07:00:00 block explicitly left open ("wry's own source was not read")
  is now CLOSED: confirmed from `wkwebview/mod.rs` directly, `window.ipc` is injected natively,
  before every JS-level init script. This does not change any conclusion already reached (ordering
  was already known not to block deletion attempts), it only converts a disclosed inference into a
  confirmed fact.

recommendation_2026_08_03T09_00_00: |
  Per the analysis above: THREE of the eleven SURVIVES-list globals (`window.ipc`,
  `window.isTauri`, `window.__TAURI_INTERNALS__`) are PROVEN, by direct primary-source
  descriptor read AND by this run's own live reassignment-fallback data, to be permanently
  immune to delete, reassignment, AND Proxy-based masking -- no JS-side technique can ever
  touch them. The other eight (`__TAURI__`, `__TAURI_IIFE__`, 6 `__TAURI_PLUGIN_*` keys) are
  writable-but-non-configurable or fully mutable, and COULD be cleared by reassignment (one
  already is, live; the other seven are a confident source-grounded prediction, not yet tested).

  This makes `window.isTauri` in particular impossible to ignore: it is Tauri's own
  purpose-built, literally-named "is this page running inside Tauri" flag -- the single most
  obvious, most convenient property a fingerprinting script would check for exactly this
  question -- and it is one of the three now PROVEN unmaskable by any JS technique. Nothing in
  this investigation identifies which specific propert(ies) Talon's check actually reads, but
  `isTauri` is a stronger, more purpose-fit candidate than any of the eight
  potentially-maskable properties, none of which are named or documented as
  detection/automation signals.

  RECOMMENDATION: option (ii) -- pivot to SIDLogin, over option (i) or (iii).

  Against option (i) (one more live iteration using reassignment instead of delete): the ONLY
  new ground a reassignment iteration could cover is the seven untested-for-reassignment globals
  (`__TAURI_IIFE__` + 6 plugin keys) -- `__TAURI__` itself needs no new test, it is already
  proven deletable. In the single most likely scenario -- Talon's check reads `isTauri` and/or
  `__TAURI_INTERNALS__` and/or `ipc`, all three of which remain exactly as detectable after a
  reassignment pass as before it -- a fifth live cycle would reproduce this run's exact
  inconclusive 403 result with no new discriminating information, at the cost of a full live
  cycle. Reassignment is only worth running if there is a specific reason to believe Talon
  checks ONLY the plugin-key/`__TAURI_IIFE__` surface and ignores the purpose-built `isTauri`
  flag sitting right next to it -- nothing in this investigation supports that narrower bet.

  Against option (iii) (Tauri-source-level suppression): a real, concrete mechanism EXISTS but
  is heavy and was found to have NO existing opt-out. The exact patch points are locatable --
  `tauri-2.11.5/src/manager/webview.rs:168-178` (the `isTauri`/`__TAURI_INTERNALS__`
  `Object.defineProperty` calls) and `wry-0.55.1/src/wkwebview/mod.rs:638-640` (the `window.ipc`
  `Object.defineProperty` call) would each need `writable: true, configurable: true` added --
  but `tauri-2.11.5/Cargo.toml`'s full `[features]` list (checked this cycle) contains no
  existing flag that gates or alters this behavor; there is no supported way to do this short of
  vendoring/forking both `tauri` and `wry` crates via a Cargo `[patch.crates-io]` override and
  maintaining that patch across every future upstream upgrade. This is a real, nameable option,
  not hand-waved -- but it is a substantial, ongoing maintenance burden to win one round of a
  fingerprinting arms race Talon could simply respond to with a different signal (TLS/JA3,
  header ordering, timing -- all untouched by any JS-side technique regardless).

  For option (ii): SIDLogin (`src/frontend/screens/Login/components/SIDLogin/index.tsx`, read in
  full this cycle) is real, already shipped, requires ZERO new Tauri/wry code, and is
  STRUCTURALLY IMMUNE to this entire fingerprinting question -- authentication happens in the
  user's actual system browser (`window.api.clipboardWriteText`/`loginPage()` opens
  `https://legendary.gl/epiclogin` externally), never in a WKWebView Talon could ever fingerprint
  as automation. What end-to-end verification would take: (1) confirm `loginPage()`
  (`frontend/helpers`) actually opens the system browser under `pnpm tauri:dev`, not an
  in-app webview -- a single live check; (2) confirm the pasted SID successfully completes
  `epic.login(sid)` -- a single live check, already a well-trodden code path (this is Heroic's
  inherited, previously-working flow, not new code); (3) UX gap vs the target embedded flow: the
  user must manually visit a URL, log in, copy a session-id string, and paste it back -- a real,
  disclosed cost, but a working one today. Making it the DEFAULT path (rather than the
  `alternativeLoginAction` secondary affordance) is a small, scoped frontend change (`src/
  frontend/screens/Login/index.tsx:115-167`, not re-read line-by-line this cycle beyond what the
  07:00:00 block already established) -- NOT a Tauri/wry patch, NOT a new fingerprint-evasion
  technique, and not blocked by anything this cycle found.
next_action: |
  CHECKPOINT REACHED (decision) issued this cycle -- see the structured checkpoint returned to
  the user/orchestrator. NO CODE CHANGED THIS CYCLE, per explicit instruction (pure static
  analysis only). Do NOT close `F-34.5-G6-01`, phase 34.5, or any `34.5-UNTESTED-ITEMS.md` row.
  Do NOT act on the SEPARATE, still-owed post-auth live-gate checkpoint. Do NOT touch
  `USER_AGENTS`/`EPIC_LOGIN_URL`/`matchOAuthRedirect`. Do NOT revert or remove
  `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT`, `epic_oauth_redirect_observer_script`, or the still-labeled
  THROWAWAY `EPIC_LOGIN_DELETION_DIAGNOSTIC_SCRIPT` (untouched this cycle). AWAITING: the
  developer's choice among (i) one more live reassignment-based iteration, (ii) pivot to
  SIDLogin (this cycle's recommendation), or (iii) a Tauri/wry source-level patch/fork -- see
  `recommendation_2026_08_03T09_00_00` above for the reasoning behind the recommendation.

<!-- SUPERSEDING BLOCK 2026-08-03T08:00:00 -- THROWAWAY DELETION DIAGNOSTIC BUILT AND STATICALLY
     VERIFIED (user decision OPTION C, acted on this cycle). CHECKPOINT (human-verify) REISSUED,
     collecting a live run. NOT A FIX -- see the file's new EXPERIMENTAL/THROWAWAY section
     (after the two real Resolution entries) for the full build record; do not read this cycle
     as evidence the 403 is fixed or that this deletion is safe to ship. Everything below this
     block, including the 07:00:00/06:00:00/05:00:00/04:00:00 blocks, remains
     HISTORICAL/authoritative context this block acted on -- nothing reverted or eliminated by
     this block. Read THIS block first. -->

throwaway_diagnostic_built_2026_08_03T08_00_00: |
  User decision OPTION C acted on this cycle: build a narrow, throwaway, instrumented
  diagnostic BEFORE committing to any shipped mitigation. See the file's new
  `## EXPERIMENTAL/THROWAWAY -- deletion-diagnostic` section (after the two real `Resolution`
  entries, kept deliberately separate) for the full `reasoning_checkpoint`, `what_was_built`,
  and `static_verification` record. Short version: a new, distinctly-named Rust const
  (`EPIC_LOGIN_DELETION_DIAGNOSTIC_SCRIPT`) deletes the 2026-08-03T07:00:00 SURVIVES list
  (`window.__TAURI__`, `window.__TAURI_INTERNALS__`, `window.isTauri`, `window.ipc`, the 8
  `__TAURI_PLUGIN_*`/`__TAURI_IIFE__` keys) and restores a native-looking `window.Notification`,
  registered in the guaranteed-last init-script slot, Epic-only, with an additional
  `#[cfg(debug_assertions)]` safety gate disclosed as a deliberate divergence from the literal
  ask. The arm's own already-shipped `on_navigation`/`on_page_load`/`on_window_event(Destroyed)`
  hooks gained THROWAWAY-labeled `[epic-deletion-diag]` Rust-log markers (no new hooks needed --
  all three already existed). `cargo check` clean; `cargo test` 102/0/1-ignored (+5 new tests);
  `npx tsc --noEmit` clean; `npm run test:ci` 187/187 suites, 3647/3647 tests. ONE genuine
  regression was introduced and fixed DURING this cycle's own verification (a stray `*/` in a
  test comment accidentally paired with an unrelated pre-existing `/*` ~900 lines away and
  corrupted a TS suite's stripped-source view of the file) -- confirmed via `git stash`/`git
  stash pop` this was NOT pre-existing, fixed by rewording the comment, full suite re-confirmed
  green afterward. Recorded honestly in `static_verification`, not silently corrected.
next_action: |
  CHECKPOINT REACHED (human-verify) issued this cycle -- see the structured checkpoint returned
  to the user/orchestrator. IMPLEMENTED BUT NOT LIVE-VERIFIED: static proof only, per this
  project's own F-10 lesson. THIS IS A DIAGNOSTIC, NOT A FIX -- do not close `F-34.5-G6-01`,
  phase 34.5, or any `34.5-UNTESTED-ITEMS.md` row on this cycle's work. Do NOT act on the
  SEPARATE, still-owed post-auth live-gate checkpoint (already-authenticated Epic session) --
  unchanged, untouched, still owed. Do NOT touch
  `USER_AGENTS`/`EPIC_LOGIN_URL`/`matchOAuthRedirect`. Do NOT revert or remove
  `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT` or `epic_oauth_redirect_observer_script`. AWAITING: the
  developer's live `env -u GAMELIB_LOGIN_DIAG pnpm tauri:dev` run against a fresh logged-out
  Epic session, reporting all four items the checkpoint asks for (403 status; instrumentation
  markers; new JS errors; re-verified 3-arm dump confirming the globals are actually gone) --
  this result determines whether option A (ship a real, hardened version of this deletion) or
  option B (SIDLogin) is the right next move. Whichever direction the live result points, this
  THROWAWAY code is expected to be removed or replaced, not kept as-is.

<!-- SUPERSEDING BLOCK 2026-08-03T07:00:00 -- STEP (b) 3-ARM IPC-SURFACE DUMP LANDED, UNANIMOUS.
     MITIGATION-FEASIBILITY INVESTIGATION DONE (STATIC ONLY). CHECKPOINT (decision) REISSUED.
     Everything below this block, including the 06:00:00/05:00:00/04:00:00 blocks, remains
     HISTORICAL/authoritative context this block acted on -- nothing reverted; `alertNative`/
     `confirmNative` move from SURVIVES to a new formal Eliminated entry (confirmed fixed), the
     Tauri IPC/plugin surface + `window.ipc` + `notifNative` become the new leading, best-
     surviving candidate set. Read THIS block first. -->

ipc_surface_dump_result_2026_08_03T07_00_00: |
  Step (b) of the 05:00:00 checkpoint's `required_sequencing` landed. Same elimination discipline
  as every prior 3-arm dump this file has run (rule: Tauri value shared by >=1 unblocked arm ->
  eliminated; Tauri-unique value -> survives).

  ELIMINATED THIS RUN (new formal Eliminated entry added, this timestamp):
  `alertNative`/`confirmNative` -- all three arms now read native-code `.toString()`. This is
  `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT` visibly working live for the first time (previously only
  static-verified). Does not touch the pre-auth 403's own status (still fires, per 06:00:00).

  SURVIVES (unique to Tauri across all three arms, never checked by the twelve-property dump
  at 2026-08-03T01:00:00 -- genuinely untested territory, not contradicted-and-now-reconsidered):
  1. The full injected Tauri surface: `window.__TAURI__` (object), `window.__TAURI_INTERNALS__`
     (object), `window.isTauri` (boolean), and 8 `tauriKeys` (`__TAURI__`, `__TAURI_IIFE__`,
     `__TAURI_PLUGIN_DIALOG__`, `__TAURI_PLUGIN_NOTIFICATION__`, `__TAURI_PLUGIN_SHELL__`,
     `__TAURI_PLUGIN_CLIPBOARD_MANAGER__`, `__TAURI_PLUGIN_OPENER__`, `__TAURI_PLUGIN_UPDATER__`)
     -- all `undefined`/absent in both Electron and Safari.app.
  2. `window.ipc` (object) + `window.ipc.postMessage` (function) -- absent in both unblocked
     arms. This is wry's own IPC bridge object (see `feasibility_answers` below for exactly
     where it comes from -- NOT from `ipc-protocol.js`, a mechanistic correction to this file's
     own 2026-08-03T05:00:00/06:00:00 attribution of `window.ipc` origin).
  3. `notifNative` (`window.Notification.toString()`) -- non-native
     (`function(n,t){const o=t||{}...`) vs native in both controls. SAME mechanism R3 already
     eliminated as SOLE cause (`tauri_plugin_notification::init()`'s `init-iife.js`) -- listed
     here again per this file's own discipline of not treating "surfaces in a fresh dump" as
     automatically new, but NOT a new candidate; do not re-litigate R3 from this line alone.

  This is corroborating context only, cited from a prior cycle's already-established fact, not
  re-derived this cycle: the live console evidence of
  `plugin:notification|is_permission_granted` throwing inside this exact login window
  (Evidence, 2026-08-02T00:20:00 era) already showed this IPC surface is not just present but
  ACTIVELY firing calls into it during Epic's page lifetime.

feasibility_answers_2026_08_03T07_00_00: |
  All four questions answered from DIRECT PRIMARY SOURCE reads this cycle (vendored
  `tauri-2.11.5` crate source under
  `~/.cargo/registry/src/index.crates.io-*/tauri-2.11.5/`, plus this repo's own
  `src-tauri/src/main.rs` and `tauri.conf.json`), not inferred from this file's own prior
  summaries alone -- two of those prior summaries (04:00:00's `feasibility_finding` step
  ordering vs 02:00:00's `reasoning_checkpoint`) were mutually AMBIGUOUS on exactly the ordering
  question this cycle needed resolved, so the primary source was re-read to settle it
  definitively rather than trusting either summary.

  Q1 -- INJECTION ORDER (definitive, from `tauri-2.11.5/src/manager/webview.rs`,
  `prepare_pending_webview`, lines 122-224, read in full this cycle): `all_initialization_scripts`
  is assembled in this EXACT order, then handed to the webview as one ordered list:
    1. inline `isTauri`/`__TAURI_INTERNALS__` base-object script (line 166-181)
    2. `self.invoke_initialization_script` -- defines `window.__TAURI_INTERNALS__.invoke` (line 182)
    3. metadata script, stamps window/webview labels onto `__TAURI_INTERNALS__` (line 183-194)
    4. `self.initialization_script(...)` -- this is Tauri's OWN internal core script (rendered
       from `ipc-protocol.js`, confirmed by `app.rs:1561`'s `#[default_template("../scripts/
       ipc-protocol.js")]`) -- NOT our app's registered scripts, despite the confusingly
       identical method name. It defines `window.__TAURI_INTERNALS__.postMessage`, which calls
       `window.ipc.postMessage(data)` as its fallback path (line 195-200).
    5. `plugin_init_scripts` -- EVERY registered plugin's init script, extended in wholesale
       (line 202) -- this is where `tauri_plugin_dialog`/`notification`/`shell`/
       `clipboard-manager`/`opener`/`updater`'s init-iife scripts land.
    6. (isolation-feature only, not used by this app)
    7. `plugin_global_api_scripts`, IF `app.withGlobalTauri` (line 216-220) -- gates only the
       `window.__TAURI__` convenience-wrapper layer, still app-wide/unconditional per-window.
    8. **`all_initialization_scripts.extend(webview_attributes.initialization_scripts)`** (line
       223) -- OUR app's own `.initialization_script()` builder calls (in the order WE call
       them: `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT` if dev-gated-on, then
       `epic_oauth_redirect_observer_script`, then `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT`, per
       `main.rs:2169-2205`'s own call order) are appended DEAD LAST, strictly AFTER every one of
       steps 1-7.

     ANSWER: app-registered `.initialization_script()` calls reliably run AFTER Tauri's own core
     bootstrap and ALL plugin init scripts -- not unspecified, not against us. This is exactly
     the position our two already-shipped, already-working production scripts occupy today, so
     a THIRD script registered the identical way (same builder, same `is_epic_login` gate,
     appended after the fingerprint shim) would occupy the same guaranteed-last position and
     would run before Epic's own page bundle starts (the same guarantee our two shipped scripts
     already rely on and that this file's own evidence confirms holds in practice).

     CORRECTION to this file's own prior attribution (2026-08-03T05:00:00 `confound_recorded`
     citing "`user-script:23, line 106` -> `tauri-2.11.5/scripts/ipc-protocol.js`" as the source
     of `window.ipc`): `ipc-protocol.js` does NOT define `window.ipc` -- it only CALLS
     `window.ipc.postMessage(data)` as an already-existing object (line 84, and its own comment
     at line 83: "`window.ipc.postMessage` came from `tauri-runtime-wry` > `wry`'s
     `with_ipc_handler`"). `window.ipc` itself is therefore NOT part of
     `all_initialization_scripts` at all -- it must be wired up natively by wry's own WKWebView
     configuration (a `WKScriptMessageHandler`/`with_ipc_handler` registration made directly on
     the webview at a lower level than Tauri's JS init-script pipeline), most likely BEFORE step
     1 above, not interleaved with it. This was NOT independently confirmed this cycle (wry's own
     source was not read -- out of scope for the time available) -- flagged as the one piece of
     this ordering question resolved by inference from the ipc-protocol.js comment, not by
     reading wry itself. PRACTICAL CONSEQUENCE for feasibility: since `window.ipc` is set up
     earlier than (or entirely outside) the `all_initialization_scripts` list, and our own
     scripts already run LAST in that list, a `delete window.ipc` in a new last-appended script
     would still execute after wry's own injection -- ordering is not a blocker for deletion
     either way.

  Q2 -- DEPENDENCY CHECK (from direct re-read of both shipped scripts' `Resolution` entries and
  this cycle's re-read of the `humble_login_open` arm, `main.rs:2023-2296`):
    - `epic_oauth_redirect_observer_script` (Resolution.fix, mechanism 2): wraps `window.fetch`
      only, reads response bodies via `res.clone()`, and exfiltrates via `location.href` to a
      dedicated `.invalid` host caught by the NATIVE `.on_navigation` Rust closure. Zero calls to
      `window.ipc`/`window.__TAURI__`/`window.__TAURI_INTERNALS__`/`invoke` anywhere in its
      described mechanism.
    - `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT` (Resolution.fix_pre_auth_fingerprint): patches
      `outerWidth`/`outerHeight` getters and `Function.prototype.toString` only. Zero calls to
      the Tauri JS bridge anywhere in its described mechanism.
    - The window's OWN native capture hooks -- `.on_navigation` (line 2069-2089), `.on_page_load`
      (line 2208-2229), `.on_window_event(Destroyed)` (line 2268-2272) -- are ALL Rust-side
      closures registered directly on the `WebviewWindowBuilder`/`WebviewWindow` handle. These
      are native WKWebView-delegate-level callbacks (navigation-policy decisions, page-load
      lifecycle, window-destroy notifications) that fire regardless of page-JS state -- they do
      not call into the page via `window.ipc`/invoke, and nothing in their own bodies references
      any of the three globals in question (confirmed by this cycle's direct re-read of the full
      arm; grep of the arm's body for `ipc`/`__TAURI__`/`__TAURI_INTERNALS__` -- none found).

    ANSWER: for THIS window's own currently-shipped mechanisms (both JS scripts, all three
    native hooks), capture does NOT depend on `window.ipc`/`__TAURI_INTERNALS__`/`__TAURI__`
    being present or functional. Deletion of all three appears safe for what this window
    ITSELF currently needs.

    HONEST BLIND SPOT, not ruled out: whether Tauri's OWN internal plumbing depends on these
    globals persisting for something this investigation has not traced -- e.g., whether Rust
    ever delivers an event INTO this webview via an `eval()`'d snippet that itself assumes
    `window.__TAURI_INTERNALS__` still exists (event emission, some internal housekeeping tied
    to window close/focus, or a future code path added by this app that isn't there yet). This
    was NOT traced this cycle (would require reading Tauri's event-emission internals and/or a
    live test) and is exactly the kind of thing a static read cannot fully rule out. The
    concrete way to close this gap is a LIVE test: apply the deletion in a throwaway build,
    then verify the window still closes cleanly (`on_window_event(Destroyed)` still fires),
    still reports page loads (`on_page_load` events still land in
    `LOGIN_WINDOW_EVENTS`/`oauthLoginCapture.ts`'s poll), and the exfil navigation still gets
    caught (`on_navigation`) -- i.e., re-run this exact investigation's own capture plumbing
    end-to-end with the globals deleted, before trusting the static answer alone.

  Q3 -- ARE THEY NEEDED / APP-WIDE VS PER-WINDOW (re-confirmed this cycle by independent direct
  read, not just re-citing the 04:00:00 block): `tauri.conf.json:11`, `"withGlobalTauri": true`
  -- app-wide, single boolean, no per-window variant in the schema. `main.rs:3192-3212`,
  `fn main() { tauri::Builder::default().plugin(tauri_plugin_opener::init())
  .plugin(tauri_plugin_dialog::init()) ... }` -- all 6 plugins registered directly on the single
  app-wide `Builder` chain inside `fn main()`, before `.setup()`; there is no per-window overload
  of `.plugin()` anywhere in the public Tauri 2.11.5 API this app links against. Matches
  `prepare_pending_webview`'s own unconditional, no-window-label-branch behavior confirmed under
  Q1. ANSWER: not needed by the login window specifically -- injected purely as a side effect of
  app-wide configuration with no opt-out surface, exactly as the 04:00:00 block already
  concluded; this cycle independently re-verified rather than assuming it was still accurate.

  Q4 -- SIDLOGIN BYPASS (searched this cycle -- real, found, NOT taken at face value): confirmed
  via direct file read, `src/frontend/screens/Login/components/SIDLogin/index.tsx` (full file)
  and its wiring in `src/frontend/screens/Login/index.tsx:115-167`. This is Heroic's inherited
  manual-SID flow, ALREADY SHIPPED and ALREADY REACHABLE today, gated only by `disabled={oldMac}`
  -- not behind any Tauri-specific flag. The Epic `Runner` component's PRIMARY action
  (`loginUrl={epicLoginPath}`) drives the embedded webview this whole investigation concerns;
  its `alternativeLoginAction={() => setShowSidLogin(true)}` is a SEPARATE, always-visible
  affordance on the same button that opens the `SIDLogin` modal instead. That modal: (1) shows a
  copy/open button for `https://legendary.gl/epiclogin`, opened via `window.api.openLoginPage`
  (`src/preload/api/helpers.ts:6`) -- the user's REAL, UNMODIFIED SYSTEM BROWSER, not this app's
  embedded WKWebView/Electron `<webview>` at all; (2) the user completes Epic's actual login
  there and is shown a session-id ("SID") string on that page; (3) the user pastes it into a
  plain text `<input>` in the modal; (4) `handleLogin` calls `epic.login(sid)` ->
  `window.api.login(sid)` directly, with no webview/OAuth-redirect-capture machinery involved at
  all. BECAUSE the actual authentication happens in the user's genuine system browser, Talon
  never sees a WKWebView-shaped session for this path -- the entire injected-JS-surface
  fingerprinting question this cycle investigated is STRUCTURALLY INAPPLICABLE to SIDLogin, not
  merely mitigated. This is a real, already-working, zero-new-code fallback, not a proposal --
  its only cost is the extra manual copy/paste step for the user. Not independently confirmed
  end-to-end THIS cycle (no live test run against it), but the code path itself is unambiguous
  from direct source read, not inferred from the coordinator's mention.

next_action: |
  CHECKPOINT REACHED (decision) issued this cycle -- see the structured checkpoint returned to
  the user/orchestrator. NO SOURCE EDIT THIS CYCLE, NO IMPLEMENTATION. Do NOT close
  `F-34.5-G6-01`, phase 34.5, or any `34.5-UNTESTED-ITEMS.md` row. Do NOT act on the SEPARATE,
  still-owed post-auth live-gate checkpoint. Do NOT touch
  `USER_AGENTS`/`EPIC_LOGIN_URL`/`matchOAuthRedirect`. Do NOT revert or remove
  `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT` or `epic_oauth_redirect_observer_script`. AWAITING: the
  developer's choice among the options in the reissued checkpoint (attempt the deletion shim
  live; pursue SIDLogin instead; or run the narrower live diagnostic first to close the Q2 blind
  spot before either).

<!-- SUPERSEDING BLOCK 2026-08-03T06:00:00 -- CLEAN REPRO LANDED (STEP (a) OF THE 05:00:00
     CHECKPOINT'S required_sequencing IS COMPLETE), CONFOUND RESOLVED, STEP (b) CHECKPOINT
     REISSUED. Everything below this block, including the 05:00:00 and 04:00:00 blocks, remains
     HISTORICAL/authoritative context this block acted on -- nothing reverted or eliminated by
     this block beyond the specific diagnostic-script-as-cause hypothesis (see Eliminated, this
     timestamp). Read THIS block first. -->

clean_repro_result: |
  Step (a) of the 05:00:00 checkpoint's `required_sequencing` is COMPLETE. See Evidence
  2026-08-03T06:00:00 for the full record. Short version: `env -u GAMELIB_LOGIN_DIAG pnpm
  tauri:dev` was run, `GAMELIB_LOGIN_DIAG` confirmed ABSENT from the actual running process
  environment (coordinator-verified by direct process inspection, not self-report), and the
  pre-auth `403 (exists)` on email submit STILL FIRED ("ok, done, with 403", verbatim).
  `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`'s fetch-wrapping is EXONERATED as this 403's cause (see
  Eliminated, this timestamp -- formal entry). This does NOT prove fetch-wrapping in general is
  harmless -- `epic_oauth_redirect_observer_script` and Epic's own Sentry wrapper were both still
  present and active during this exact run and are unaddressed by this test. The fingerprint shim
  remains necessary-but-not-sufficient, unchanged by this run. The Tauri IPC-surface hypothesis
  (`hypothesis_new`, 04:00:00 block below) is UNCHANGED in status by this result -- still the
  leading live candidate, neither newly confirmed nor newly tested by this run; this run only
  answers the diagnostic-script-confound question.
next_action: |
  Step (b) of the `required_sequencing` is now the confirmed right next question and is UNBLOCKED.
  CHECKPOINT REISSUED (human-verify) this cycle, handing over the already-prepared 3-arm
  IPC-surface dump script (`ipc_surface_dump_script`, 05:00:00 block below) VERBATIM -- re-verified
  this cycle against the guidance checklist (covers `window.__TAURI_INTERNALS__`,
  `window.__TAURI__`, `window.isTauri`, a tauri-regex `Object.keys(window)` scan,
  `window.ipc`/`window.ipc.postMessage` markers, notification-plugin globals via
  `Notification.toString()`, and the already-established `alertNative`/`confirmNative` toString
  checks). No defect found; the script is complete and correct as written and is reused
  byte-for-byte from the 05:00:00 block for cross-cycle attribution consistency -- it is NOT
  regenerated here. See the structured checkpoint returned to the user/orchestrator for the exact
  paste-as-single-expression instructions and run steps across all three arms (Tauri login window,
  the working Electron `<webview>`, Safari.app). THIS CYCLE IS RECORDING + HANDOVER ONLY: no
  source edits were made, no claim is made about which hypothesis is right, no fix or mitigation
  was implemented. Do NOT close `F-34.5-G6-01`, phase 34.5, or any `34.5-UNTESTED-ITEMS.md` row.
  Do NOT act on the SEPARATE, still-owed post-auth live-gate checkpoint. Do NOT touch
  `USER_AGENTS`/`EPIC_LOGIN_URL`/`matchOAuthRedirect`. Do NOT revert or remove
  `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT`. AWAITING: the developer's 3-arm dump results, labeled by
  arm, before the IPC-surface hypothesis can be evaluated property-by-property.

<!-- SUPERSEDING BLOCK 2026-08-03T05:00:00 -- CONFOUND DISCOVERED AND RECORDED, CHECKPOINT
     REISSUED WITH MANDATORY SEQUENCING. Everything below this block, including the 04:00:00
     block, remains HISTORICAL/authoritative context this block acted on -- NONE of it is reverted
     or marked eliminated by this block; the 04:00:00 run's result is downgraded from
     "interpreted" to "confounded, pending clean re-run" only. Read THIS block first. -->

confound_recorded: |
  See Evidence 2026-08-03T05:00:00 for the full mechanical explanation. Short version:
  `GAMELIB_LOGIN_DIAG=1` WAS set on the run that produced Evidence 2026-08-03T04:00:00, contrary
  to that checkpoint's own explicit instruction to leave it unset. That var gates
  `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT` (main.rs, opt-in, default OFF) -- a 332-line document-start
  script wrapping fetch/XHR/sendBeacon, and this file has an existing, independent, unresolved
  suspicion that fetch-wrapping init scripts of this shape can interact with Talon's own
  attestation calls (see `epic_oauth_redirect_observer_script_unresolved_by_this_test`, Evidence
  2026-08-03T01:00:00 -- same class of concern, different script, arguably stronger here since
  `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT` is older/larger and wraps three surfaces instead of one).
  CONSEQUENCE: Evidence 2026-08-03T04:00:00's `403 (exists)` result is CONFOUNDED. It does NOT
  cleanly show `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT` is insufficient, and does NOT cleanly point at
  the Tauri IPC surface (`hypothesis_new`, 04:00:00 block below) either -- a known, independent
  fetch-wrapping suspect was live during that exact observation. NOT reverted or downgraded by
  this confound: the `user-script:23, line 106` -> `tauri-2.11.5/scripts/ipc-protocol.js`
  attribution (04:00:00 block, item 5) -- derived from static script-shape comparison, unaffected
  by whether the diagnostic script was injected.
required_sequencing: |
  The developer must run TWO things in order, same session -- (a) FIRST, then (b) ONLY informed by
  (a)'s result. Do not run (b) before (a) lands. Full detail in the checkpoint issued this cycle
  (returned to the orchestrator/user), summarized here for file-resume continuity:
    (a) Clean re-run: `pnpm tauri:dev` with `GAMELIB_LOGIN_DIAG` explicitly UNSET (verified this
        cycle: no `.env` file and no shell profile in this repo or the developer's home dotfiles
        sets this var anywhere -- grepped `.env*`, `.zshrc`, `.zprofile`, `.bashrc`,
        `.bash_profile`, zero matches -- so a plain `unset GAMELIB_LOGIN_DIAG` before launch, or
        simply not exporting it, is sufficient). Attempt the fresh logged-out Epic login again.
        Report: does `403 (exists)` still fire on email submit? Is the form still interactive?
    (b) THEN, informed by (a): the 3-arm IPC-surface console dump (script below), run in the Tauri
        login window, the Electron login webview, and Safari.app, same elimination discipline as
        the outerWidth/alertNative/confirmNative dump (Evidence 2026-08-03T01:00:00): a property
        present-and-identical in an unblocked arm is eliminated as Talon's signal; a
        Tauri-unique property survives as a candidate.
  If (a) shows the 403 does NOT reproduce with DIAG off, that is ITSELF a major finding (implicates
  `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`'s own fetch-wrapping, not the IPC surface or residual
  fingerprint tells, and retroactively strengthens the already-recorded risk on
  `epic_oauth_redirect_observer_script`'s own fetch-wrapping in the post-auth fix) -- report that
  back before necessarily proceeding to (b); (a)'s outcome may change whether (b) is even the
  right next question.
ipc_surface_dump_script: |
  Return-value style (matches the working pattern already established for the
  outerWidth/alertNative/confirmNative dump -- Evidence 2026-08-03T01:00:00 notes a
  console.log-based variant of that dump "printed nothing useful in this webview's devtools," so a
  return-value variant was substituted; reusing that same style here for consistency and because
  it's the version already known to work in this project's devtools). Paste as a single expression
  so the console shows the return value directly, no `console.log` needed:
  ```js
  JSON.stringify({
    typeofTauriInternals: typeof window.__TAURI_INTERNALS__,
    typeofTauriGlobal: typeof window.__TAURI__,
    typeofIsTauri: typeof window.isTauri,
    tauriKeys: Object.keys(window).filter(k => /tauri/i.test(k)),
    typeofIpc: typeof window.ipc,
    typeofIpcPostMessage: typeof (window.ipc && window.ipc.postMessage),
    notifNative: (function(){ try { return window.Notification.toString().slice(0,60); } catch(e){ return 'ERR:'+e.message; } })(),
    alertNative: (function(){ try { return window.alert.toString().slice(0,60); } catch(e){ return 'ERR:'+e.message; } })(),
    confirmNative: (function(){ try { return window.confirm.toString().slice(0,60); } catch(e){ return 'ERR:'+e.message; } })()
  })
  ```
  Grounding for each check (no unverifiable checks invented -- each is tied to a specific source
  read this cycle or a prior cycle's already-confirmed mechanism):
  - `__TAURI_INTERNALS__`/`__TAURI__`/`isTauri`/`tauriKeys`: `hypothesis_new`'s
    `feasibility_finding` (04:00:00 block below), grounded in
    `tauri-2.11.5/src/manager/webview.rs`, `prepare_pending_webview` (lines 122-224), which
    unconditionally injects `window.isTauri` and `window.__TAURI_INTERNALS__` into every webview;
    `window.__TAURI__` is gated by the app-wide `withGlobalTauri` config flag (`tauri.conf.json`:
    `true`), also unconditional per-window.
  - `typeofIpc`/`typeofIpcPostMessage`: read this cycle, `tauri-2.11.5/scripts/ipc-protocol.js`
    (full 92 lines) -- line 84, `window.ipc.postMessage(data)`, with the script's own comment
    attributing `window.ipc` to `tauri-runtime-wry` > `wry`'s `with_ipc_handler`. This is the
    concrete, source-confirmed postMessage-IPC-bridge marker (not invented) -- the same mechanism
    behind the "IPC custom protocol failed, Tauri will now use the postMessage interface instead"
    warning already attributed to `user-script:23, line 106` (Evidence 2026-08-03T04:00:00, item
    5; source line 61 of the same file).
  - `notifNative`/`alertNative`/`confirmNative`: NOT a new check -- reused verbatim from the
    already-working 2026-08-03T01:00:00 dump (the `tauri_plugin_dialog`/`tauri_plugin_notification`
    IPC-routed overrides), included here again for completeness in a single combined paste, not as
    a new candidate. Read this cycle, `tauri-plugin-notification-2.3.3/src/init-iife.js` (full
    source): confirms it clobbers `window.Notification` directly with no additional distinctively-
    named global beyond that reassignment -- there is no separate "notification-plugin marker"
    property to check beyond the already-established `notifNative` toString shape.
next_action: |
  CHECKPOINT REACHED (human-verify) issued this cycle -- see the structured checkpoint returned to
  the user/orchestrator. THIS CYCLE IS DOCUMENTATION + CHECKPOINT CONSTRUCTION ONLY: no source
  edits were made, no claim is made about which hypothesis is right, no implementation was done.
  Do NOT close `F-34.5-G6-01`, phase 34.5, or any `34.5-UNTESTED-ITEMS.md` row. Do NOT act on the
  SEPARATE, still-owed post-auth live-gate checkpoint. Do NOT revert or remove
  `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT` -- still only confounded-not-falsified, not shown harmful.
  Do NOT touch `USER_AGENTS`/`EPIC_LOGIN_URL`/`matchOAuthRedirect`. AWAITING: the developer's
  report from step (a) first; step (b) only after that, per `required_sequencing` above.

<!-- SUPERSEDING BLOCK 2026-08-03T04:00:00 -- LIVE RESULT LANDED, SHIM FALSIFIED AS SUFFICIENT,
     NEW LEAD INVESTIGATED, CHECKPOINT REISSUED. Everything below this block, including the
     02:30:00 block, remains HISTORICAL/authoritative context this block acted on. Read THIS
     block first. -->

hypothesis_new: |
  Tauri's WKWebView unconditionally exposes a distinctive JS/IPC surface into EVERY webview it
  creates — `window.isTauri`, `window.__TAURI_INTERNALS__`, the `ipc://localhost` custom-scheme
  invoke transport (with its own document-visible postMessage fallback), and EVERY registered
  plugin's injected init script (`notification`, `dialog`, `opener`, `updater`, `shell`,
  `clipboard-manager`) — into Epic's login page, and this surface is itself a structurally
  detectable automation signal Talon's fingerprint check could key off, DISTINCT from (not a
  restatement of) R3's already-killed "does the notification plugin's init-iife.js BREAK the
  page" mechanism. THIS is a detection-based hypothesis (does Talon SEE and SCORE this surface);
  R3 was a breakage-based hypothesis (does this plugin's script CRASH something the page needs).
falsifiability_and_r3_comparison: |
  R3's actual text (Eliminated, "hypothesis: R3"): "`tauri_plugin_notification::init()`'s
  globally-injected `init-iife.js` (clobbered `window.Notification` + its self-invoked failing
  `is_permission_granted` call) is causally responsible for Epic's login form staying
  non-interactive." Tested by REMOVING the plugin's registration entirely and rebuilding; the
  form stayed non-interactive anyway -> killed as sole cause. Its own SCOPE CORRECTION note
  (2026-08-02) already says explicitly: "R3 killed one instance of the injection-breaks-the-page
  family; it did not kill the family" -- and reopened a "Tauri's own core IPC bootstrap" thread,
  which a LATER cycle (2026-08-02T18:00:00+, item 3) closed again by source-tracing the "IPC
  custom protocol failed" warning to `tauri-2.11.5/scripts/ipc-protocol.js` and proving it is
  "structurally incapable" of touching Epic's `https://` traffic (different URL scheme,
  in-process, non-network). That closure answered ONE specific sub-question ("can this failing
  in-process fetch itself corrupt/interfere with Epic's own network requests") -- it never
  asked, and does not answer, "can Talon's OWN JavaScript, running inside the SAME page,
  observe `window.__TAURI_INTERNALS__`/`window.isTauri`/plugin globals as evidence of automation
  tooling." Those are different questions. Verdict: (a) genuinely NEW hypothesis, not a
  restatement of R3 or its already-closed reopening -- it deserves its own registration, not a
  reopening of either prior entry.

  CORROBORATING, NOT YET DECISIVE, evidence for treating this as live: the 2026-08-03T01:00:00
  3-arm property dump (which used the SAME elimination discipline that killed twelve OTHER
  properties at "Eliminated," the `webdriver`/`plugins`/... entry) never included
  `__TAURI__`/`__TAURI_INTERNALS__`/`isTauri`/any IPC-bridge-shaped property in its checked list
  -- this specific candidate is UNTESTED by the very rigor that closed the other twelve, not
  contradicted by it. Source read this cycle also found a genuine STRUCTURAL ASYMMETRY the
  control-arm comparison never accounted for: Electron's own login window
  (`src/backend/main.ts:816`, `new BrowserWindow({ height: 700, width: 1200 }).loadURL(url)`) is
  created with NO `preload` script and NO custom `webPreferences` at all -- Epic's page in the
  Electron arm gets ZERO injected globals from GameLib's own code, a genuinely blank/vanilla JS
  environment. Tauri's login window, by contrast, structurally CANNOT be given an equivalently
  blank environment (see feasibility finding below) -- so the "unblocked" Electron control arm
  and the "blocked" Tauri arm differ not just in the two already-targeted properties, but in
  this entire un-targeted surface too. This is a real, previously-unexamined asymmetry between
  the two arms' controls -- worth surfacing, not proof of causation.
feasibility_finding: |
  Direct read this cycle of vendored `tauri-2.11.5/src/manager/webview.rs`,
  `prepare_pending_webview` (lines 122-224, the SAME function the prior cycle's plugin-init-
  script finding already cited, read further this time): this function runs UNCONDITIONALLY for
  every webview with NO window-label branch anywhere in it. It unconditionally pushes, in this
  exact order, onto `all_initialization_scripts`: (1) an inline script defining
  `window.isTauri = true` and `window.__TAURI_INTERNALS__` if absent; (2)
  `self.invoke_initialization_script` (the core IPC invoke bootstrap, source of the observed
  "IPC custom protocol failed" warning); (3) a metadata script stamping the current
  window/webview labels onto `__TAURI_INTERNALS__`; (4) the app's own core
  `initialization_script(...)`; (5) `plugin_init_scripts` -- EVERY registered plugin's init
  script, unconditionally, for every webview (already-established finding, reconfirmed); (6)
  IF-AND-ONLY-IF `app.withGlobalTauri` (`tauri.conf.json`: currently `true`, APP-WIDE, not
  per-window) is enabled, the plugin_global_api_scripts (the `@tauri-apps/api`-equivalent JS
  convenience wrappers) -- this one step IS gated by a config flag, but the flag is a single
  compile-time boolean baked in by `tauri-codegen` (`context.rs:428`,
  `if config.app.with_global_tauri`) with no per-window override anywhere in the codegen or
  runtime path. Steps (1)-(5) have NO gate of any kind, config-level or capability-level.

  The `capabilities/*.json` system (`default.json`, `"windows": ["main"]`) does NOT control any
  of this -- its own file header already documents (and this cycle's read confirms against
  actual source) that capabilities gate WHICH COMMANDS a window's IPC invoke may successfully
  reach (`runtime_authority`, a check that happens AFTER the JS surface already exists and a
  call is attempted), never WHETHER the JS globals/scripts are injected into the DOM in the
  first place. This is why `loginwin-N-*` (matching no capability) still gets
  `window.__TAURI_INTERNALS__`, `window.isTauri`, and every plugin's init script executing --
  it just cannot successfully INVOKE most commands afterward (hence "not allowed on window").

  CONCLUSION: withholding the Tauri IPC/plugin JS surface from the login window specifically is
  NOT structurally possible in Tauri 2.11.5 via any capability, config, or per-window builder
  option available in the public API surface. The only levers that touch ANY of this are
  APP-WIDE: (a) disable `withGlobalTauri` entirely (removes only step 6 -- the convenience
  `window.__TAURI__` wrapper -- app-wide; does NOT remove `__TAURI_INTERNALS__`, the invoke
  bootstrap, or any plugin init script, so it would NOT address what's actually observed in the
  console; low risk since this app appears to use `@tauri-apps/api` module imports rather than
  the bare `window.__TAURI__` global, but this was not exhaustively grepped this cycle), or (b)
  disable a plugin's registration entirely app-wide (removes that plugin's init script from
  EVERY window including "main," which for `tauri_plugin_dialog` would remove the app's own
  native dialog feature, and for `tauri_plugin_notification` risks the previously-documented
  Humble-expiration-alert panic path unless `expirationAlerts.ts` is also touched) or (c) fork
  the vendored `tauri` crate to add a per-window opt-out to `prepare_pending_webview` itself
  (disproportionate, and this file's OWN prior fix already ruled out the equivalent move for
  just the dialog plugin on exactly this proportionality basis). No low-risk, scoped mitigation
  exists at the application-configuration layer for this specific ask.
next_action: |
  CHECKPOINT REACHED (decision) issued this cycle -- see the structured checkpoint returned to
  the user/orchestrator. Do NOT implement anything from this cycle's investigation without a
  decision first, per standing instruction. Do NOT close `F-34.5-G6-01`, phase 34.5, or any
  `34.5-UNTESTED-ITEMS.md` row. Do NOT act on the SEPARATE, still-owed post-auth live-gate
  checkpoint. Do NOT revert or remove `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT` -- falsified as
  SUFFICIENT, not shown harmful or wrong to keep. `reasoning_checkpoint_2026_08_03T02_00_00`
  (immediately below) and its own fix remain historical/authoritative context for how the
  currently-shipped shim was reasoned about; the NEW `hypothesis_new` above is a fresh,
  independent, NOT-YET-TESTED candidate awaiting the user's decision on which experiment (if
  any) to run next.

<!-- SUPERSEDING BLOCK 2026-08-03T02:30:00 -- STATIC VERIFICATION COMPLETE, CHECKPOINT ISSUED.
     The fix designed/implemented in the 02:00:00 block below has been statically verified
     (cargo check clean; cargo test 97/0/1-ignored, +4 new tests, all passing; npx tsc --noEmit
     clean; npm run test:ci 187/187 suites, 3646/3646 tests, zero failures). Full detail in
     Resolution, `verification_pre_auth_fingerprint`. Everything below this block, including
     the 02:00:00 reasoning checkpoint, remains HISTORICAL/authoritative context this block
     acted on. Read THIS block first. -->

next_action: |
  CHECKPOINT REACHED (human-verify) issued this cycle -- see the structured checkpoint
  returned to the user/orchestrator. IMPLEMENTED BUT NOT LIVE-VERIFIED: static proof only,
  per this project's own F-10 lesson. Do NOT close `F-34.5-G6-01`, phase 34.5, or any
  `34.5-UNTESTED-ITEMS.md` row on this cycle's work alone. Do NOT act on the SEPARATE,
  still-owed post-auth live-gate checkpoint (already-authenticated Epic session) -- unchanged,
  untouched, still owed. Awaiting the developer's live `pnpm tauri:dev` fresh-logged-out-Epic-
  login result to determine whether this cycle's hypothesis
  (`reasoning_checkpoint_2026_08_03T02_00_00`) is confirmed or falsified.

<!-- SUPERSEDING BLOCK 2026-08-03T02:00:00 -- CONTINUATION CYCLE, USER DECISION "OPTION A --
     CONTINUE" ACTED ON. Implements a fix for BOTH surviving candidates registered at
     01:00:00 (`outerWidth`/`outerHeight` == 0; `alertNative`/`confirmNative` clobbered by
     `tauri_plugin_dialog`). Everything below this block, including the 01:00:00 block itself,
     remains HISTORICAL/authoritative context this block acted on. Read THIS block first. -->

reasoning_checkpoint_2026_08_03T02_00_00: |
  hypothesis: "Talon's pre-auth fingerprint check at Epic's `/v1/init` (or the page bootstrap
    that precedes it) rejects the Tauri WKWebView session as automated because two DOM/BOM
    properties read as structurally impossible for a real browser: (1) `window.outerWidth`/
    `window.outerHeight` are exactly `[0, 0]` -- a real browser (including a chromeless/
    borderless one) never reports a zero-area outer window while `innerWidth`/`innerHeight`
    are non-zero and the page is visibly rendered and interactive-looking; (2)
    `window.confirm` is an `async function` (`Function.prototype.toString` reveals
    `async function`/non-native source), which the `window.confirm` DOM API can never
    legitimately be -- it is always a synchronous, native-code function per spec. Both
    properties are Tauri-only (confirmed absent from BOTH unblocked control arms, Electron
    and Safari.app, in the SAME 2026-08-03T01:00:00 dump), so fixing both removes two
    concrete, structurally-provable automation signals from the page BEFORE Epic's own
    bootstrap script (and Talon's fingerprint collector) ever runs."
  confirming_evidence:
    - "Evidence 2026-08-03T01:00:00 (3-arm dump): Tauri outerWidth/outerHeight == [0,0];
       Electron arm == [3440,1440]; Safari.app arm == [1470,923]. Property is UNIQUE to Tauri
       across all three arms -- the elimination rule's own SURVIVES condition."
    - "Same dump: Tauri confirmNative.toString() == an async-function source
       ('async function(i){return await n(\"plugin:dialog|message\"...' truncated form
       recorded in Evidence at 2026-08-02); both Electron and Safari.app report
       'function confirm() { [native code] }'. Property is UNIQUE to Tauri."
    - "Static source read this cycle, main.rs:3086 (`.plugin(tauri_plugin_dialog::init())`)
       and the vendored crate's own init-iife.js
       (tauri-plugin-dialog-2.7.2/src/init-iife.js): confirms the EXACT mechanism --
       `window.alert`/`window.confirm` are unconditionally reassigned by this plugin's
       injected init script, `confirm` specifically declared `async function`."
    - "Static source read this cycle, vendored tauri-2.11.5/src/manager/webview.rs
       prepare_pending_webview (lines ~131-224): plugin init scripts are placed into
       `all_initialization_scripts` BEFORE `webview_attributes.initialization_scripts` is
       appended (`all_initialization_scripts.extend(webview_attributes.initialization_scripts)`
       then assigned back) -- i.e. our own per-window `.initialization_script(...)` calls on
       the `WebviewWindowBuilder` execute AFTER the dialog plugin has already clobbered
       alert/confirm, and there is NO per-window opt-out for a registered plugin's init
       script (confirmed by direct read; this matches the existing main.rs:3087-3094 comment
       recorded for the unrelated notification-plugin finding, which independently confirmed
       the same absence of a capability-scoped exclusion for plugin JS injection). This RULES
       OUT fix option (a) (\"prevent the plugin from touching this window\") as
       architecturally unavailable without disabling the plugin app-wide (out of scope --
       would remove the app's own native dialog feature for the main window) or forking the
       plugin crate (disproportionate). It also confirms our new script CAN run after the
       plugin's clobber and re-shape what it left behind, which is what the fix below does."
  falsification_test: "Ship the fix, then drive a FRESH LOGGED-OUT Epic login through
    `pnpm tauri:dev`. If the 403 at `/v1/init`/`/v1/init/execute` still occurs identically
    (same on-screen anti-bot copy, same timing) after both properties are corrected, this
    hypothesis is FALSIFIED -- the fingerprint check is keying off some OTHER signal this
    investigation has not yet found (TLS/JA3, header ordering, or the still-separately-open
    `epic_oauth_redirect_observer_script` question), and the two \"fixed\" properties were
    either not load-bearing for Talon's decision or were necessary-but-not-sufficient. This is
    exactly why this cycle ends in a CHECKPOINT, not a closure."
  fix_rationale: "The fix targets the ROOT MECHANISM identified above (Tauri's WKWebView has
    no window-chrome concept so outerWidth/outerHeight default to 0; the dialog plugin's
    JS-injected overrides are structurally non-native), not a symptom -- it does not touch
    EPIC_LOGIN_URL, USER_AGENTS, matchOAuthRedirect, or any request/response handling, and it
    does not attempt to suppress or mask the 403 response itself. It restores two specific,
    concretely-identified structural signals to look like a real browser's, using the SAME
    injection mechanism (`initialization_script()` on the Epic login `WebviewWindowBuilder`,
    gated by the pre-existing `is_epic_login` computation) this file's own prior fix and prior
    diagnostic already established as the correct early-injection point -- reusing proven
    plumbing rather than inventing a second gating mechanism."
  blind_spots: "(1) alert/confirm cannot be restored to TRUE native functions -- by the time
    our script runs, the plugin has already overwritten them and the original native
    references are unrecoverable (not saved anywhere). The fix corrects `.toString()`
    IDENTITY only (via a `Function.prototype.toString` WeakMap patch, the standard technique),
    not full behavioral parity -- `window.confirm`'s `.constructor.name` will still read
    `AsyncFunction` if any code inspects that property instead of `.toString()`, and this is
    NOT patched (a `.constructor` swap was judged more invasive/riskier than the benefit,
    since it is unknown whether Talon checks constructor.name at all -- recorded honestly, not
    silently). (2) It is UNKNOWN whether Talon's check even reads outerWidth/confirm at
    pre-auth page-load time versus some other point in the flow. (3) It is UNKNOWN whether
    fixing these two removes the 403 at all, given `epic_oauth_redirect_observer_script`
    remains a separate, untested-by-this-method candidate that this cycle does not touch. (4)
    outerWidth/outerHeight are mirrored to innerWidth/innerHeight (zero visual chrome) rather
    than to screen.width/height -- a real windowed browser's outer dims are usually >= inner by
    a small chrome margin; mirroring exactly equal is a judgment call, not verified against
    what Talon's check actually expects numerically (only that it stops reading [0,0])."

next_action: |
  STRUCTURED REASONING CHECKPOINT complete (all five fields concrete, hypothesis falsifiable).
  Proceeding to fix_and_verify: implement `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT` in
  `src-tauri/src/main.rs`, injected as a SEPARATE `initialization_script()` call (distinct
  name/content from `epic_oauth_redirect_observer_script`, coexisting alongside it) gated by
  the SAME `is_epic_login` check. Then run `cargo check`, `cargo test`, `npx tsc --noEmit`,
  `npm run test:ci`, record results honestly (including the ALREADY-KNOWN pre-existing
  `longRunningChannels.test.ts` WR-08 failure on `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`'s raw-string
  delimiter lines, unrelated to this cycle -- do not mistake it for a regression this cycle
  caused). Mark Resolution as IMPLEMENTED-BUT-NOT-LIVE-VERIFIED. Issue a CHECKPOINT
  (human-verify) for the live fresh-logged-out-Epic-login test. Do NOT close
  `F-34.5-G6-01`, phase 34.5, or any `34.5-UNTESTED-ITEMS.md` row. Do NOT act on the
  SEPARATE, still-owed post-auth live-gate checkpoint.

<!-- SUPERSEDING BLOCK 2026-08-03T01:00:00 -- CONTINUATION CYCLE. The Electron-arm fingerprint-
     dump result (asked for at 00:30:00) HAS LANDED and is applied here, property-by-property,
     against the branches pre-registered at 2026-08-02T18:00:00
     (`pending_branches_electron_dump_PRE_REGISTERED_before_result_lands`). The gamelib.log
     question from 00:30:00 remains UNANSWERED and is NOT re-asked this cycle per this cycle's own
     scope (not surfaced as new evidence, out of scope). Everything below this block, including the
     00:30:00 block, remains HISTORICAL/authoritative context this block acted on. Read THIS block
     first. -->

electron_dump_applied_2026_08_03T01_00_00: |
  Raw dump: Evidence 2026-08-03T01:00:00. Applied a STRENGTHENED 3-arm version of the pre-registered
  2-arm (Electron-vs-Tauri) elimination rule, using BOTH available unblocked controls (Electron AND
  the same-machine/session Safari.app from Evidence 2026-08-02T17:00:00 PART B), not just Electron
  alone — this removes the cross-machine confound a strict 2-arm reading would otherwise carry (see
  the cross-machine caveat in the new Evidence entry: this Electron dump's hardwareConcurrency/
  screen/dpr do not match the 17:00:00 run's machine profile at all, strongly suggesting different
  hardware/display). Rule: a property is ELIMINATED as a sole-cause candidate if Tauri's (blocked)
  value is shared by AT LEAST ONE unblocked arm; it SURVIVES only if Tauri's value is unique to
  Tauri among all three arms.

  ELIMINATED (new Eliminated entry added this cycle, full property list and reasoning there):
  `webdriver`, `plugins`, `mimeTypes`, `pdfViewerEnabled`, `maxTouchPoints`, `langs`,
  `hardwareConcurrency`, `vendor`, `screen`, `dpr`, `hasChrome`, `hasSafari`. Also reinforced (not
  newly eliminated — already dead via DIAGNOSTIC-INSTRUMENTATION-AS-SIGNAL): `fetchNative`/
  `xhrNative` wrapper-presence, now confirmed identical across all THREE arms, all Epic's own
  Sentry SDK.

  SURVIVES (non-empty residue — full detail below):
  1. `outerWidth`/`outerHeight` — Tauri reports `[0,0]`; BOTH unblocked arms (Electron `[3440,1440]`,
     Safari.app `[1470,923]`) report real, non-zero values matching their own screen/window. This is
     now confirmed CLEANLY (not the ambiguous console-timed shim from 18:00:00) via TWO independent
     unblocked controls, stronger than the single-Electron-arm test originally pre-registered.
     Per the pre-registered branch's own letter ("outer reads non-zero in Electron -> SURVIVES as
     the leading candidate"): SURVIVES, confirmed. The document-start init-script shim (real
     rebuild) is the next concrete test, exactly as pre-registered at 17:00:00 sub-branch (a).
  2. `alertNative`/`confirmNative` (window.alert/window.confirm) — Tauri's are IPC-routed overrides
     from `tauri_plugin_dialog::init()` (`main.rs:3086`, confirmed by static read this cycle);
     `confirmNative` is reassigned to an `async function`, which a native `window.confirm` can never
     be. BOTH unblocked arms (Electron, Safari.app) show real native code for both. This is a NEW
     candidate this cycle — genuinely untested before, and NOT the same mechanism as the
     already-eliminated R3 (`tauri_plugin_notification`, a DIFFERENT plugin). SURVIVES.

  NOT A NEW CANDIDATE, do not resurrect: `notifNative` (window.Notification) also differs
  Tauri-vs-both-unblocked-arms in this same dump, but this is the SAME mechanism R3 already
  eliminated as SOLE cause via live hardware removal (`tauri_plugin_notification` commented out,
  symptom persisted, 2026-08-01). This dump is CONSISTENT with R3's setup (the plugin is back in
  place, so Notification is still clobbered) — it does not contradict or reopen R3. Per the standing
  instruction not to re-derive eliminated hypotheses without new evidence, and since this evidence
  is consistent with (not contradicting) R3, `notifNative` stays eliminated as SOLE cause. It is
  listed here only so the reasoning trail doesn't look like an oversight.

epic_oauth_redirect_observer_script_unresolved_by_this_test: |
  The NEW production candidate added at the 2026-08-03T00:00:00 un-parking block is NOT resolved by
  this cycle's control-arm test, for two independent, compounding reasons (static source read this
  cycle, `main.rs:1384-1421`, no rebuild):
  1. EVIDENCE-TIMING GAP: the Tauri fingerprint data being compared (17:00:00 PART B) was captured
     BEFORE commit `c857ade8e` existed. That Tauri build never had this script. Nothing in this
     file's evidence shows what the fingerprint — or the pre-auth 403 itself — looks like on the
     CURRENT build with this script present.
  2. STRUCTURALLY UNTESTABLE BY A FINGERPRINT DUMP, even in principle: this script only ever runs
     inside Tauri (it is Tauri-only Rust code, injected via `initialization_script`), so Electron can
     never serve as a control for it — any difference found wouldn't distinguish "our extra
     fetch-wrapping layer" from "Tauri is WKWebView, Electron is Chromium" (already-confirmed,
     separately-eliminated confound). Worse: this script wraps `window.fetch` at document-start,
     BEFORE Epic's own Sentry SDK loads; Sentry re-wraps whatever `window.fetch` currently is at ITS
     init time, and Sentry's own wrapper source text does not change based on what it wraps. So even
     a FRESH same-machine Tauri dump on the current build would show the identical Sentry-wrapper
     `fetchNative` string whether or not our script's extra layer sits underneath it — a
     `.toString()`-based fingerprint dump cannot detect this candidate's presence or absence at all.

  Also newly confirmed by this cycle's source read: the wrapper attaches a `.then()`/`.catch()` to
  EVERY fetch response on the page (early no-op return for non-matching pathnames), meaning if
  Talon's own `/v1/init`/`/v1/init/execute` calls are `fetch()`-based, this script attaches an extra
  promise continuation to THEM too, not just to the OAuth redirect response — a low-risk but nonzero
  behavioral difference invisible to `.toString()` comparison. (If Talon's calls are XHR-based
  instead, this script never touches them at all and is categorically irrelevant to the pre-auth
  403.) This remains a genuinely OPEN, UNRESOLVED question — not eliminated, not confirmed — and
  requires a DIFFERENT test than a fingerprint dump (e.g., a live A/B with the script temporarily
  gated off for pre-auth page loads only, or pathname-logging instrumentation to see whether it's
  even invoked during Talon's own calls). Do not conflate this with the fetchNative/xhrNative
  elimination above — that elimination covers Epic's OWN Sentry wrapping only, not this app's own
  additional layer.

residue_outcome_2026_08_03T01_00_00: |
  Per the pre-registered branch's own named outcomes: residue is NOT empty. Two candidates survive
  cleanly (`outerWidth`/`outerHeight`; `alertNative`/`confirmNative` via `tauri_plugin_dialog`), and
  one additional question (`epic_oauth_redirect_observer_script`) remains genuinely open and
  untested by this method regardless of residue size. The "empty residue -> redirect to TLS/JA3/
  header-ordering, end the fingerprint line of inquiry" branch does NOT apply.

  The developer's own position statement (recorded 2026-02-08T18:00:00 -- sic, 2026-08-02T18:00:00,
  `position_statement_weighed_not_acted_on`) was explicitly conditioned on empty residue: "if the
  Electron-arm dump does NOT leave a small, obvious residue of candidates, stop." That literal
  condition is not met — residue is non-empty, and arguably STRONGER than before (two independently
  confirmed structural candidates via two unblocked controls, not one ambiguous console-timed shim).
  Per its own stated logic, this does not trigger the stopping rule. This is recorded as a
  recommendation to weigh, NOT a decision this agent is making — the developer may still choose to
  stop given the broader, unstated question about the Tauri migration's worth continuing at all
  (also recorded at 18:00:00), independent of whether this specific stopping condition was met.

next_action: |
  CHECKPOINT REACHED (decision) issued this cycle. Two live options for the developer to choose
  between, since the next concrete step on the surviving residue (`outerWidth`/`outerHeight` +
  `alertNative`/`confirmNative`) is a real rebuild + live hardware-driven behavioral test — exactly
  the kind of step this project's standing rule says needs the user driving it, not silently
  proceeded on:
    (A) Proceed with the document-start init-script shim rebuild — extended this cycle's analysis to
        cover BOTH surviving candidates in one shim (patch `outerWidth`/`outerHeight` to mirror
        `innerWidth`/`innerHeight` AND make `window.alert`/`window.confirm` report as native code,
        e.g. via a `Function.prototype.toString` proxy or by not letting `tauri_plugin_dialog`
        clobber them on the login window specifically) — a real rebuild, needs the developer to
        drive `pnpm tauri:dev` and report the live pre-auth 403 result.
    (B) Stop the pre-auth thread per the developer's own broader (not literally-triggered) reasoning,
        given the residue's mixed actionability (`outerWidth`/`outerHeight` is app-controllable;
        `vendor`/engine-identity differences are NOT app-fixable without abandoning WKWebView, though
        those were eliminated as sole-cause this cycle, not surviving) and the still-open, differently-
        shaped `epic_oauth_redirect_observer_script` question that would need its own separate test
        regardless of (A)/(B).
  NO SOURCE EDIT THIS CYCLE. `USER_AGENTS`/`EPIC_LOGIN_URL`/`matchOAuthRedirect` untouched. Do NOT
  act on the post-auth live-gate checkpoint (separate, still-owed thread). Do NOT close
  `F-34.5-G6-01` or any `34.5-UNTESTED-ITEMS.md` row. `notifNative`/R3 not reopened.

<!-- SUPERSEDING BLOCK 2026-08-03T00:30:00 -- CONTINUATION CYCLE, CHECKPOINT ISSUED FOR THE
     PRE-AUTH 403 THREAD (this is a DIFFERENT checkpoint than the "CHECKPOINT ISSUED, NOT A GATE
     RESULT" block below it, which is for the SEPARATE post-auth live-gate thread and remains
     untouched/owed). Everything below this block, including the un-parking block, remains
     HISTORICAL/authoritative context this block acted on. Read THIS block first. -->

drift_check_2026_08_03T00_30_00: |
  Re-read frontmatter, the 2026-08-03T00:00:00 un-parking block, the 2026-08-02T19:00:00 override
  block, and the 2026-08-02T18:00:00 block in full, per this cycle's required reading. Checked for
  drift before acting, per the objective's own instruction:
  - Scanned all Evidence `timestamp:` entries (last one is 2026-08-02T18:00:00) -- NO 2026-08-03
    Evidence entry exists. The Electron-arm fingerprint-dump result has NOT landed. No drift: the
    guidance's assumed state matches the file's actual state exactly.
  - Read `/Users/graysonmitchell/Library/Logs/GameLib/gamelib.log` in full (26 lines, 3.5KB,
    timestamps 12:14:28-12:14:47 today). Content: a routine Tauri-sidecar bootstrap log only
    (GAMELIB_SHELL_EXE/appRoot/publicDir resolution, runner-binary path checks, dev-secret-vault
    install notice + two `read key=sessionCookie` lines, connectivity check, releases/anticheat
    checks, three runner `--version` invocations). NOTHING Epic-login-related, no 403, no login
    window activity, no console output at all -- this log slice does not by itself explain what
    drew the user's attention to it. Recorded honestly as inconclusive on its own; asking the user
    directly rather than guessing (per guidance item 2).
  - Confirmed the exact original fingerprint-dump script's source text is NOT preserved verbatim
    anywhere in this file -- only its resulting property/value table (Evidence 2026-08-02T17:00:00
    PART B) was recorded. Re-issuing the console script below is a reconstruction matching that
    same property list, not a byte-for-byte re-paste of a script this file never stored. Flagged
    honestly in the checkpoint rather than silently presented as verbatim-identical.

next_action: |
  CHECKPOINT REACHED (human-verify) issued this cycle, per guidance -- see the structured
  checkpoint returned to the user/orchestrator. Two questions outstanding: (1) whether the
  dispatched Electron-arm fingerprint dump was ever run, and if so its raw result (to be applied
  against the pre-registered branches in the 2026-08-02T18:00:00 block property-by-property); (2)
  what the user was looking at in `gamelib.log`, since this cycle's own read of it found nothing
  Epic-login-related and cannot resolve that on its own. Do NOT act on the post-auth live-gate
  checkpoint (separate, still-owed thread). Do NOT re-open any of the six eliminated hypotheses
  without new evidence specifically implicating them. `USER_AGENTS`/`EPIC_LOGIN_URL`/
  `matchOAuthRedirect` untouched this cycle; no source edit made.

<!-- SUPERSEDING BLOCK 2026-08-03T00:00:00 -- USER UN-PARKING OF THE PRE-AUTH 403 THREAD.
     Everything below this block, INCLUDING the 2026-08-02T19:00:00 developer-override block,
     remains HISTORICAL for the POST-AUTH thread it governs and is UNTOUCHED by this block. This
     block does NOT revise, retract, or act on the post-auth fix/live-gate-checkpoint state --
     that checkpoint stays OWED, exactly as issued. Read THIS block first. -->

user_unparking_2026_08_03: |
  DATED, ATTRIBUTED USER DIRECTION (2026-08-03), received directly from the developer via the
  session coordinator (bounded user quote: "i wanted to debug the 403..."). This EXPLICITLY
  UN-PARKS the pre-auth Talon anti-bot 403 thread that `developer_override_2026_08_02T19_00_00`
  (below) parked in order to let the post-auth fix proceed to implementation.

  Scope of the supersession: ONLY the parking decision itself is reversed. Every other
  consequence recorded in the 2026-08-02T19:00:00 block remains in force, unchanged:
  - The post-auth fix (commit `c857ade8e`) stays IMPLEMENTED-BUT-NOT-LIVE-VERIFIED.
  - The live-gate checkpoint issued this session (asking the user to drive an
    already-authenticated Epic login through `pnpm tauri:dev`) remains OWED and un-actioned --
    it is simply no longer this cycle's focus. It is NOT being withdrawn, cancelled, or marked
    stale; a future cycle should still collect that result when the user is ready.
  - `F-34.5-G6-01` does NOT close. Phase 34.5 does NOT close. No `34.5-UNTESTED-ITEMS.md` row
    is closed by this block.
  - The pre-auth thread's own standing closure-condition (2) --  "the pre-auth login form is
    confirmed to render and accept input for a genuinely logged-out user" -- is exactly what
    resuming this thread investigates. Nothing here presumes an outcome.

  NEW PRODUCTION SURFACE NOW IN THE CANDIDATE SET, recorded honestly per the coordinator's
  instruction: the post-auth fix shipped in `c857ade8e` added `epic_oauth_redirect_observer_script`
  (`src-tauri/src/main.rs`), a PRODUCTION, always-on script that wraps `window.fetch` on Epic's
  login page. This is the SAME wrapping technique this thread's own `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`
  uses and which this thread's own instrumentation-hypothesis testing was built around. Unlike
  that diagnostic (opt-in, `GAMELIB_LOGIN_DIAG` default off), this new script is unconditional for
  every Epic login. It must be added to the candidate set for this resumed investigation --
  NOT assumed guilty, NOT assumed innocent by the prior (pre-existing) instrumentation elimination,
  because that elimination tested the OLD diagnostic script, not this NEW production one, and they
  are different code even though they share a technique.

next_action: |
  Before generating any new hypothesis or candidate, close out the loose end already
  pre-registered and dispatched in the 2026-08-02T18:00:00 block below
  (`pending_branches_electron_dump_PRE_REGISTERED_before_result_lands`): a single-shot Electron
  control-arm fingerprint dump was dispatched to the developer and its result had NOT landed as
  of the last update. First move THIS cycle: ask the user (via checkpoint, since this requires
  a human to report console output) whether that Electron-arm dump was ever run, and if so
  collect the raw result and apply the pre-registered branches property-by-property (see that
  block for the exact elimination rule and the four possible outcomes, including the
  "empty residue" outcome that would redirect suspicion to non-JS-observable signals).
  If it was never run, re-issue the exact console-paste instructions for it (same fingerprint-dump
  script used for the 17:00:00 Tauri-vs-Safari.app diff, run inside the WORKING Electron login
  `<webview>` arm this time) so the user can produce it.

  SEPARATELY, also ask the user about `/Users/graysonmitchell/Library/Logs/GameLib/gamelib.log`,
  which the coordinator noted the user just opened in their IDE -- this may contain fresh,
  unreported log output relevant to the 403 (timing of Talon's `/v1/init`/`/v1/init/execute`
  calls, any console errors surfaced via the login-window devtools added in an earlier cycle,
  or evidence bearing on the outerWidth/outerHeight or fetch-wrapper candidates). Ask what
  they were looking at in that log before assuming it is unrelated noise.

  Do NOT re-derive or second-guess the six already-eliminated hypotheses (ITP, R1 user-agent, R3
  notification-plugin-as-sole-cause, the clobbered-global misread, the connection-loss single-run
  reading, DIAGNOSTIC-INSTRUMENTATION-AS-SIGNAL for the OLD diagnostic script) without new
  evidence. Do NOT touch `USER_AGENTS`/`EPIC_LOGIN_URL`/`matchOAuthRedirect`. Do NOT act on the
  post-auth live-gate checkpoint this cycle -- that is a separate, still-owed, still-pending
  thread.


<!-- SUPERSEDING BLOCK 2026-08-03T00:00:00 -- CHECKPOINT ISSUED, NOT A GATE RESULT. Everything
     below this block, INCLUDING the 2026-08-02T19:00:00 implementation block, remains
     HISTORICAL/authoritative for what was built and why -- this block does not change the fix,
     does not touch the parked pre-auth 403 thread, and does not imply the live gate has run or
     passed. It records only that a resumed continuation session re-confirmed the fix is present
     exactly as described (commit `c857ade8e`, `git log` + direct read of
     `src-tauri/src/main.rs`'s `humble_login_open` arm this session) and issued the OWED
     branch-A step (4) live gate as a human-verify checkpoint, per this project's own standing
     rule that a hardware-driven step cannot be substituted with a test-suite run. -->

session_recheck_2026_08_03: |
  Re-read `Resolution.root_cause`/`Resolution.fix`/`Resolution.verification` and directly
  re-read the current `humble_login_open` arm in `src-tauri/src/main.rs` (lines ~1929-2130) plus
  `epic_oauth_redirect_observer_script` (~1384-1420) and `oauthLoginCapture.ts`/
  `useTauriOAuthLogin.ts` in full. Confirmed byte-for-byte consistent with what this file already
  records: commit `c857ade8e` ("fix(34.5): capture Epic's OAuth redirect via on_navigation exfil
  (post-auth)") is present on this branch, one commit before HEAD (`e1cef86e4`, an UNRELATED
  quick-task fix for user-closed-popup cancellation added 2026-08-03 on top of it -- reviewed,
  does not touch the exfil mechanism, out of scope this cycle). No contradiction found. Nothing
  new to investigate; proceeding straight to the owed checkpoint rather than re-deriving anything
  already confirmed.

next_action: |
  ISSUED this session: a CHECKPOINT REACHED (human-verify) asking the developer to physically
  drive `pnpm tauri:dev`, log into Epic from an ALREADY-AUTHENTICATED session only (the
  fresh-logged-out case stays blocked by the parked pre-auth 403 and must NOT be attempted this
  cycle), and report the exact backend/frontend log lines observed. Awaiting that response. Do
  NOT re-run static verification (already done, recorded above) and do NOT touch the parked
  403 thread. When the user responds:
    - If they report `status=captured` + `phase=idle (login completed, library refresh
      triggered)` + a real library refresh -> branch-A step (4) is VERIFIED. Update
      `Resolution.verification` to add this live confirmation, update `34.5-UNTESTED-ITEMS.md`'s
      `U-34.5-11` row per its own retirement rule, but DO NOT close `F-34.5-G6-01` or Phase 34.5
      as a whole -- condition (2) (pre-auth logged-out path) is still untested and still blocks
      the finding's overall closure per the standing rule.
    - If they report a 403 -- check FIRST whether `epic_oauth_redirect_observer_script`'s
      `window.fetch` wrap is implicated (the KNOWN RISK recorded in the 2026-08-02T19:00:00
      block above), before assuming it is a recurrence of the already-parked pre-auth 403.
      This is new evidence either way (confirms or rules out the NEW RISK) and must be recorded
      in Evidence, not silently folded into the parked thread.
    - If they report anything else (hang, error, no console output) -- treat as new evidence,
      append to Evidence, do not guess.

<!-- SUPERSEDING BLOCK 2026-08-02T19:00:00 -- DEVELOPER OVERRIDE OF PRE-REGISTERED BRANCH B,
     opening a new IMPLEMENTATION cycle for the POST-AUTH fix only. Everything below this block,
     INCLUDING the 2026-08-02T18:00:00 block and its own pre-auth-403 reasoning trail, is now
     HISTORICAL for that thread and remains UNTOUCHED this cycle -- this block does not act on,
     revise, or continue the pre-auth 403 investigation in any way. Read THIS block first. -->

developer_override_2026_08_02T19_00_00: |
  DATED, ATTRIBUTED DEVELOPER OVERRIDE of `pending_question`'s pre-registered BRANCH B
  instruction (see the `fix_design`/`pending_question` block further down this file, and the
  2026-08-02T04:30:00-and-later evidence establishing that branch B is what actually occurred:
  the sign-out/sign-back-in test found NO usable login form -- a SECOND, independent
  pre-authentication defect, the deterministic Talon anti-bot 403 the 18:00:00 block above is
  mid-investigation on).

  Branch B is NOT being silently walked past. It fired exactly as designed: it found a second,
  independent pre-auth defect, and its own instruction was "do NOT implement the exfiltration
  design this cycle" pending that defect's own separate diagnosis. That instruction is being
  KNOWINGLY OVERRIDDEN this cycle by explicit developer direction: the pre-auth 403 thread is
  PARKED (developer decision, reason: six of seven fingerprint hypotheses already dead, the
  underlying WKWebView-gets-blocked-where-Chromium-doesn't observation is already
  well-characterized in this file, and the developer's own priority is implementing the
  post-auth fix now regardless of the pre-auth thread's unresolved state) and the post-auth fix
  is directed to proceed to implementation THIS cycle anyway.

  THE STANDING RULE IN `deferred_considerations` REMAINS IN FORCE, UNCHANGED, FOR CLOSURE
  PURPOSES. Quoted verbatim, not softened or reworded: "NO FIX SHIPS UNTIL THE LOGGED-OUT PATH
  HAS BEEN OBSERVED WORKING END TO END ON REAL HARDWARE -- not inferred from the fact that an
  authenticated session's flow was independently understood, and not assumed to follow
  automatically from the post-auth root cause being confirmed. Two independent things must each
  be true before this finding is considered closed and the fix shipped: (1) the post-auth
  navigation-refusal fix works end to end (exfil mechanism delivers the code, capture/login
  completes) -- not yet built; and (2) the pre-auth login form is confirmed to render and accept
  input for a genuinely logged-out user -- not yet tested at all... A passing verification of (1)
  alone must never be read as verification of the finding as a whole while (2) remains
  unresolved." This cycle's own work can satisfy (1) IMPLEMENTED-BUT-NOT-LIVE-VERIFIED at best
  (see below) -- it cannot satisfy (1) VERIFIED, and it does not and cannot touch (2) at all,
  because (2) is blocked by the SAME parked 403 that makes a fresh logged-out Epic login
  undriveable this cycle.

  CONSEQUENCES THIS CYCLE MUST HONOR, explicitly, so a future reader never mistakes this cycle's
  work for a closed finding:
  - The fix built this cycle is IMPLEMENTED-BUT-NOT-LIVE-VERIFIED. Static/compile/unit proof
    (`cargo check`/`cargo test`/`tsc --noEmit`/the Jest suite) is NOT live proof -- this project's
    own F-10 lesson, recorded elsewhere in this repo's memory: "a green 3447-test suite confirmed
    nothing about a live-only defect." The same discipline applies here without exception.
  - FIX DESIGN branch-A step (4) -- the full live gate (fresh logged-out Epic login completes, an
    already-authenticated session's redirect is captured, library refresh triggers) -- CANNOT RUN
    this cycle, because a fresh logged-out Epic login cannot be driven while the pre-auth 403
    stands in front of the login form. It is OWED, not passed, not attempted, not partially
    covered by anything built this cycle.
  - `U-34.5-06` (`.planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-
    shortc/34.5-UNTESTED-ITEMS.md`) STAYS OPEN. This cycle may ADD a new OPEN row for the
    unverified exfil mechanism (see below) but may NOT close, retire, or mark verified `U-34.5-06`
    or any other existing row -- per that ledger's own Rule 1, a row is retired ONLY by the
    observation named in its own row, never by a passing test suite.
  - Finding `F-34.5-G6-01` does NOT close. Phase 34.5 does NOT close. This debug session's own
    `status` frontmatter will NOT be set to anything implying closure at the end of this cycle.

  NEW RISK SURFACED THIS CYCLE, honestly recorded (not a re-investigation of the pre-auth thread,
  a direct consequence of information already established in THIS file, applied to THIS cycle's
  own design): the FIX DESIGN's mechanism (b) -- the in-page response observer -- necessarily
  wraps `window.fetch` on Epic's login page, using the SAME wrapping technique
  `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT` uses (`main.rs`, the "THIRD GATE ADDED 2026-08-02" comment
  above the `humble_login_open` arm) -- and that script's patched network primitives are this
  file's OWN live suspect for CAUSING the 403 the pre-auth thread is investigating. Unlike that
  diagnostic (opt-in, `GAMELIB_LOGIN_DIAG` default OFF), this cycle's observer is a PRODUCTION,
  always-on script for Epic's login window -- if patched `fetch` is confirmed to be what Talon's
  fingerprinting keys on, shipping this fix unconditionally could make the pre-auth 403 permanent
  for every Epic login attempt rather than opt-in. This is NOT grounds to redesign the fix this
  cycle (explicit instruction: implement the design as specified, do not redesign) -- it is
  recorded here as an open risk for the live gate this cycle cannot run, and as a candidate
  explanation to check FIRST if/when that live gate still shows a 403 after this fix ships.

reasoning_checkpoint: |
  hypothesis: "WKWebView silently refuses Epic's client-side navigation to the localhost
    `redirectUrl` once the page has already obtained it from its own `/id/api/redirect`
    response -- Epic's page has nothing left to render (skeleton in transit) and the only
    thing missing is that navigation's outcome ever reaching any hook this arm listens for.
    Relaying the SAME `redirectUrl` value into the SAME `LOGIN_WINDOW_EVENTS` queue via a
    channel that does not depend on WKWebView reporting a navigation OUTCOME (an
    `on_navigation` POLICY hook, which fires on intent, before any outcome exists) closes the
    gap without touching any downstream matcher."
  confirming_evidence:
    - "Evidence 2026-08-02T04:00:00: Epic's own `/id/api/redirect` request (id 15, sent from
      the login window's own bootstrap) returned HTTP 200 with a `redirectUrl` field shaped
      `https://localhost/launcher/authorized?code=<code>` -- the exact shape
      `matchOAuthRedirect`'s `legendary` arm already expects, unmodified."
    - "Evidence 2026-08-02T05:00:00: a manual, developer-run `location.href` assignment to the
      identical URL shape produced no visible effect and `location.href` read back unchanged --
      direct proof the navigation is refused, not merely slow or unobserved."
    - "Resolution.root_cause (evidenced 2026-08-02): this arm's `on_page_load` hook (the only
      navigation signal wired to `humble_login_open`) never fires Started/Finished for this
      navigation, so no downstream consumer ever sees it -- the gap is specifically in
      OUTCOME REPORTING, which `on_navigation` structurally does not depend on."
    - "main.rs read this cycle, `humble_reveal_post`/`humble_login_clear_storage`
      (`main.rs:2304-2357`, `:2371`+): the identical `on_navigation` + non-resolvable-host
      exfil + cancel pattern is SHIPPED and WORKING today for a structurally identical
      'get a value out of page JS, into Rust, without Tauri IPC' problem."
  falsification_test: "The live gate (branch-A step 4, OWED this cycle, not run): a real
    logged-out-then-authenticated Epic login window reaches `status=captured` with
    `useTauriOAuthLogin` observing `phase=idle` in the same session. If Epic's own
    `/id/api/redirect` response shape ever omits `redirectUrl`, or if the exfil navigation
    to the new dedicated host is ALSO silently refused for some reason specific to this
    long-lived, VISIBLE, shared window (unlike the hidden windows the working analog uses),
    this hypothesis is falsified and the fix does nothing."
  fix_rationale: "Addresses the root cause directly, not a symptom: it does not attempt to
    make WKWebView report the refused navigation (unexplained mechanism, no lever this
    codebase has ever found), and it does not poll or re-request anything from Epic (would
    add bot-shaped traffic and require independently proving authentication). It reads the
    SAME value the confirmed root cause already names as the missing piece and delivers it
    through a channel that does not require the broken signal at all."
  blind_spots: |
    Explicitly not tested this cycle, in order of what the design's own 'Open questions/risks'
    section (this file, `fix_design`) already named plus one new item surfaced this cycle:
    (1) whether Epic's REAL logged-out login form renders/accepts input under WKWebView at
    all -- ANSWERED NO by the 403 finding, which is exactly why this fix cannot be
    live-verified this cycle; (2) whether `on_navigation` + `on_page_load` combined on ONE
    long-lived VISIBLE window behaves identically to the hidden-window precedent (static
    crate-source confirmation only, no live-fire); (3) pathname-match stability if Epic
    changes `/id/api/redirect`'s shape upstream; (4) NEW THIS CYCLE: the observer's
    `window.fetch` wrap uses the same technique the file's own suspect-for-403 diagnostic
    uses, now shipped unconditionally rather than opt-in (see
    `developer_override_2026_08_02T19_00_00` above) -- if that suspicion is later confirmed,
    THIS fix's own observer could itself trigger or perpetuate the pre-auth 403 for every
    Epic login, a possibility the original design (written before the 403 was linked to
    patched fetch/XHR) did not consider.

next_action: |
  Proceed to implementation per the FIX DESIGN block below (`fix_design`), exactly as specified,
  with the structured reasoning checkpoint written before any source edit (mandatory per the
  debugger's own fix_and_verify protocol). Verify via `cargo check`/`cargo test`/`npx tsc
  --noEmit`/`npm run test:ci` ONLY -- branch-A step (4)'s live gate is OUT OF REACH this cycle,
  per `developer_override_2026_08_02T19_00_00` above, and must be recorded as OWED, never as
  passed or implied passed. Update `Resolution.fix`/`Resolution.verification`/
  `Resolution.files_changed` honestly at the end of this cycle without touching `status` in any
  way that implies closure. Add a new OPEN row to `34.5-UNTESTED-ITEMS.md` for the unverified
  exfil mechanism; do not close any existing row there.

<!-- SUPERSEDING BLOCK 2026-08-02T18:00:00 -- everything below this block, INCLUDING the
     2026-08-02T17:00:00 block, is now HISTORICAL reasoning trail. This block records the
     outerWidth/outerHeight shim result (403 recurred -- AMBIGUOUS per its own pre-registered
     branch, NOT a clean falsification, recorded as UNTESTED-PROPERLY), and pre-registers branches
     for a NEW, already-dispatched, single-shot cross-arm test (same fingerprint dump run inside
     the WORKING Electron `<webview>` arm) designed to prune several candidates at once without a
     rebuild per candidate. Also records, for the record only, a position the developer/coordinator
     stated about whether to continue the pre-auth thread at all -- WEIGHED here, NOT acted on; no
     stop decision has been made, and the Electron-dump result has not landed. NO SOURCE EDIT THIS
     CYCLE -- documentation only, per explicit instruction, mirroring the prior cycle's discipline.
     Read THIS block first. -->

outerWidth_shim_result_ambiguous: |
  403 recurred with the shim applied. Per the 17:00:00 block's OWN pre-registered branch, this is
  explicitly NOT a clean falsification: Talon's first fingerprint opportunity is `/v1/init`, which
  fires at page load -- before any developer console paste is possible. Only the later, larger
  attestation payload at `/v1/init/execute` (fired on username submit) had any chance of observing
  the console-applied override, and whether it actually captured a meaningfully different value
  than the page-load-time fingerprint is unknown -- nothing in this run instrumented that
  distinction. `outerWidth`/`outerHeight` is recorded as UNTESTED-PROPERLY, NOT eliminated. A clean
  test needs document-start init-script injection, i.e. an actual rebuild, per the pre-registered
  sub-branch (a). Full raw record: Evidence 2026-08-02T18:00:00 PART A.

new_test_dispatched_electron_control_arm: |
  Rather than rebuild once per remaining candidate, a cheaper single-shot test has ALREADY been
  dispatched to the developer (result not yet landed): run the identical fingerprint-dump script
  used for the 17:00:00 Tauri-vs-Safari.app diff, but inside the ELECTRON login `<webview>` -- the
  arm that is demonstrably NOT blocked (`E1`, 2026-08-01 discriminator verdict). The logic: any
  property that reads IDENTICALLY between Electron and Tauri cannot be the signal Talon keys on,
  no matter how suspicious it looked in isolation against Safari.app, because Electron is unblocked
  regardless of whatever value it reports for that property. This can prune multiple candidates in
  one shot instead of one rebuild per suspect (outerWidth/outerHeight, `hasSafari`, and less likely
  the notification/dialog-plugin clobbers all become testable in a single console paste). Full raw
  record: Evidence 2026-08-02T18:00:00 PART B.

pending_branches_electron_dump_PRE_REGISTERED_before_result_lands: |
  Recorded BEFORE the developer's result arrives, per this file's own falsifiability discipline:
  - `outer` reads `[0,0]` in Electron too -> outerWidth/outerHeight ELIMINATED, properly this time,
    via a working-arm control rather than an ambiguous console-timed shim. Move to Eliminated with
    this evidence citation; do not resurrect without new evidence.
  - `outer` reads non-zero in Electron -> outerWidth/outerHeight SURVIVES as the leading candidate,
    and the document-start init-script shim (an actual rebuild) becomes worth doing as the next
    concrete test.
  - Apply the SAME elimination rule property-by-property across the WHOLE fingerprint object, not
    just `outer`: any property Electron shares with Tauri is eliminated as a candidate for THIS
    property; whatever remains -- present/different in Tauri, absent/different in both Electron
    AND Safari -- is the real residual candidate set going into the next cycle.
  - Residue is EMPTY (Electron matches Tauri on every property that differed from Safari) -> this
    is its own NAMED, SIGNIFICANT outcome, not a dead end to fold quietly into the others: it would
    mean no JS-observable fingerprint difference distinguishes the working arm from the failing
    one, redirecting suspicion toward something NOT visible to page JavaScript at all -- TLS/JA3
    fingerprint, HTTP header ordering/casing, or an Epic-side per-client-signature/reputation
    policy keyed on something below the JS layer. This branch explicitly ENDS the fingerprint line
    of inquiry rather than motivating an eighth JS-property hypothesis.

position_statement_weighed_not_acted_on: |
  The developer/coordinator has stated, for the record, that this is the seventh hypothesis this
  session and six of the prior six are confirmed dead (ITP, R1 user-agent, R3 notification-plugin-
  as-sole-cause, the clobbered-global misread, the connection-loss single-run reading, and
  DIAGNOSTIC-INSTRUMENTATION-AS-SIGNAL). Their stated recommendation, told to the developer
  directly: if the Electron-arm dump does NOT leave a small, obvious residue of candidates, stop
  the pre-auth thread entirely rather than keep generating new candidates -- reasoning that the
  underlying observation (WKWebView loses connections / gets blocked where Chromium doesn't) is
  already well-characterized and documented in this file, and that the developer's own larger,
  unstated question of whether to continue the Tauri migration milestone at all outweighs resolving
  this one defect's exact mechanism.

  This is recorded as a POSITION TO WEIGH, not an instruction this agent is acting on. No stop
  decision has actually been made -- the Electron-dump result itself has not landed yet, and per
  the pre-registered branches directly above, the correct action still depends entirely on what
  that result shows. Assessment: the position is methodologically sound as a STOPPING RULE tied to
  a concrete, already-dispatched, already-pre-registered test outcome (not an open-ended "give up"
  call) -- it names in advance exactly which result (empty residue) would justify stopping, which
  is consistent with this file's own falsifiability discipline rather than a departure from it. It
  does not change what this cycle needed to do (record the shim result honestly as ambiguous,
  pre-register the next test's branches) and it is not something this agent should pre-empt by
  either stopping the thread now or by designing an eighth candidate now. The decision point is the
  Electron-dump result landing; that is a future cycle's job, not this one's.

next_action: |
  NO SOURCE EDIT BY THIS AGENT THIS CYCLE, per explicit instruction. `USER_AGENTS`/`EPIC_LOGIN_URL`/
  `matchOAuthRedirect` untouched; no Keychain identity or certificate created; plans
  34.5-29/30/31 remain HALTED; `34.5-G6-EPIC-DISCRIMINATOR.md`/`-2.md` untouched, cross-referenced
  only; `34.5-UNTESTED-ITEMS.md` untouched, `U-34.5-06` remains OPEN; the uncommitted
  `GAMELIB_LOGIN_DIAG` diff in `src-tauri/src/main.rs` was not committed, reverted, or further
  modified this cycle.

  AWAITING the Electron-arm fingerprint-dump result (already dispatched, not yet reported). When it
  arrives, apply the pre-registered branches directly above property-by-property: eliminate
  whatever Electron shares with Tauri, keep whatever differs as the residual candidate set, and if
  the residue is empty, record that explicitly as the named outcome that ends the fingerprint line
  of inquiry and redirects toward non-JS-observable signals (TLS/JA3, header ordering, server-side
  reputation policy) -- at which point the developer's own stopping-rule position (above) becomes
  directly relevant to weigh, still as a recommendation to put to the developer, not a unilateral
  call. If a non-empty residue survives and still contains outerWidth/outerHeight, the
  document-start init-script shim (a real rebuild) becomes the next concrete test, exactly as
  pre-registered at 17:00:00 sub-branch (a). Separately and unaffected by any of this: the POST-AUTH
  fix design (Resolution.fix) remains ready and blocked only on session-closure confirmation for
  that SEPARATE implementation cycle -- the pre-auth 403 thread above and the post-auth silent-
  navigation root cause are two different defects on two different sides of authentication; do not
  conflate their readiness states. The connection-loss/Keychain thread (16:00:00 block,
  `connection_loss_new_hypothesis_registered`) remains registered, lower-priority, and untouched
  this cycle, per the developer's own explicit priority ordering.

<!-- SUPERSEDING BLOCK 2026-08-02T17:00:00 -- everything below this block, INCLUDING the
     2026-08-02T16:00:00 block, is now HISTORICAL reasoning trail. This block processes a
     checkpoint response that CLOSES the three items the 16:00:00 block left outstanding (diff
     provenance/intent, session-closure confirmation, `GAMELIB_LOGIN_DIAG` state during the
     deterministic 403 run), reports the disable-instrumentation A/B result (negative, doubly-
     refuted), retires the instrumentation-as-cause hypothesis to Eliminated, and registers a NEW
     leading candidate (`outerWidth`/`outerHeight` === 0) with a zero-rebuild test already
     dispatched and awaiting result. NO SOURCE EDIT THIS CYCLE -- explicitly instructed as a
     documentation cycle. Read THIS block first. -->

items_closed_from_prior_checkpoint: |
  All three items the 16:00:00 block left open are now answered by the developer and are NOT
  re-asked here, per explicit instruction:
  (1) Diff provenance/intent — the uncommitted `GAMELIB_LOGIN_DIAG` diff at `main.rs:1886-1889`
  is the developer's own prior instruction ("disable the diagnostic script and rebuild"), carried
  out this session: a THIRD gate (env-toggle, default OFF) layered ON TOP of the existing
  `#[cfg(debug_assertions)]` + `if visible` double-gate (both preserved), plus an `eprintln!`
  receipt line. Verified: `cargo check` 0 errors, `cargo test` 92/0/1-ignored, jest 46/46. STILL
  UNCOMMITTED — the developer has not said whether to commit it, and per constraint this agent
  does not commit, revert, or otherwise touch it this cycle.
  (2) Session closure — the `pnpm tauri:dev` session (PIDs 44811/44970) WAS running when the
  `main.rs` edit was made; the file watcher's automatic rebuild-and-restart WAS the rebuild the
  developer had explicitly requested. The standing no-src-tauri-edits-while-a-session-may-be-open
  constraint did not apply to that specific edit because the developer had directly asked for the
  rebuild that necessitated it — recorded explicitly as the reasoning for that one instance, NOT
  absorbed as a blanket exception to the standing constraint going forward. Any future
  `src-tauri/` edit still needs its own explicit closure/request confirmation.
  (3) `GAMELIB_LOGIN_DIAG` state during the deterministic 403 run — answered retroactively: that
  run predated this env-gate's existence entirely, so instrumentation was UNCONDITIONALLY active
  (there was no third gate yet to be on or off). Full raw record: Evidence 2026-08-02T17:00:00
  PART A/C.

instrumentation_hypothesis_retired: |
  DIAGNOSTIC-INSTRUMENTATION-AS-SIGNAL is now in Eliminated, citing two independent refutations:
  the disable-instrumentation A/B (both arms of the same build, instrumentation off and on,
  identical 403) and the fingerprint-object diff (patched `fetch`/`XHR.send` present identically
  in both the Tauri arm and an unblocked Safari.app control, traced to Epic's own Sentry SDK, not
  this app). Full text: Eliminated section above. This was the leading candidate across three
  prior blocks (14:00:00 through 16:00:00); it is dead now, cleanly, on two independent grounds.

new_candidate_registered_outerWidth: |
  From the SAME fingerprint diff that killed the instrumentation hypothesis, a NEW leading
  candidate emerges: `window.outerWidth === 0 && window.outerHeight === 0` under Tauri (Safari
  reports real values, `[1470,923]`). This is flagged as the canonical headless/automation
  fingerprint signal essentially every anti-bot vendor checks — a genuine browser window always
  reports non-zero outer dimensions; an embedded WKWebView has no window-chrome concept and has no
  "outer" dimension distinct from its content view, so it reports 0 by construction, not by any
  bug in this app. SECONDARY, less-standard suspects from the same diff, already documented
  elsewhere in this file: the plugin-clobbered `window.Notification` (`tauri-plugin-notification`)
  and `window.alert`/`window.confirm` (`tauri-plugin-dialog`), both injected unconditionally into
  every webview via the mechanism that bypasses capability scoping (see the `tauri-2.11.5`
  framework-source Evidence entry above, 2026-08-01T23:50:00). Also unexplained, not yet a named
  hypothesis: `hasSafari:false` under Tauri vs. `true` under Safari (`window.safari` exists only in
  real Safari).

  STATED PLAINLY, per the developer's own framing: this is hypothesis #7 today. Six have died
  (ITP, R1 user-agent, R3 notification-plugin as sole cause, the clobbered-global misread, the
  connection-loss WKWEBVIEW-NETWORK-FAILURE single-run reading, and now
  DIAGNOSTIC-INSTRUMENTATION-AS-SIGNAL). This is a CANDIDATE, not a finding, and the prior six also
  looked clean before testing.

scope_note_notification_plugin_test_does_not_cover_this: |
  The file's EARLIER notification-plugin disable test (`R3` in Eliminated, which falsified the
  notification-plugin's own injected script as the cause of the ORIGINAL blank-skeleton/post-auth
  symptom) does NOT cover the outerWidth candidate or the notification/alert/confirm SECONDARY
  suspects for THIS pre-auth 403 question. That earlier test ran in an ALREADY-AUTHENTICATED
  webview that never reached a username submission — it never exercised
  `/id/api/email/exists` at all, and Talon's attestation logic for THAT endpoint was never in that
  test's path. Recording this explicitly so R3's elimination is not mistaken for prior coverage of
  the new question; it covers a different symptom on a different code path.

pending_test_outerWidth_shim: |
  A zero-rebuild test is already dispatched to the developer, not yet resolved. Design:
  ```js
  Object.defineProperty(window,'outerWidth',{get:()=>window.innerWidth,configurable:true});
  Object.defineProperty(window,'outerHeight',{get:()=>window.innerHeight,configurable:true});
  ```
  Applied in-console BEFORE username submission (Talon's large attestation payload is understood
  to fire at `/v1/init/execute` on submit, so an override applied beforehand should be captured by
  it). Pre-registered branches, restated for this cycle's record:
  - PASSWORD PROMPT APPEARS -> outerWidth/outerHeight confirmed as the signal. Fix direction: a
    small init-script shim applied to the login window only (scope TBD — likely alongside or
    instead of the diagnostic instrumentation's own injection point), NOT a change to
    `USER_AGENTS`/`EPIC_LOGIN_URL`/`matchOAuthRedirect`.
  - 403 AGAIN -> ambiguous between two sub-branches, both to be checked before concluding: (a) the
    console-applied override landed too late — Talon may fingerprint earlier than the console
    injection point allows, meaning a real fix would need document-start injection to test
    properly, not a console paste; (b) outerWidth is not the actual signal. Distinguishing test: if
    403 recurs, retest with `Notification`/`alert`/`confirm` ALSO restored to native alongside the
    outerWidth override in the SAME run, not outerWidth alone a second time — this isolates (a)
    timing-of-injection from (b) wrong-candidate in one additional cheap step rather than two.

next_action: |
  NO SOURCE EDIT BY THIS AGENT THIS CYCLE, per explicit instruction — this was a documentation
  cycle. `USER_AGENTS`/`EPIC_LOGIN_URL`/`matchOAuthRedirect` untouched; no Keychain identity or
  certificate created; plans 34.5-29/30/31 remain HALTED; `34.5-G6-EPIC-DISCRIMINATOR.md`/`-2.md`
  untouched, cross-referenced only; `34.5-UNTESTED-ITEMS.md` untouched, `U-34.5-06` remains OPEN.
  The uncommitted `src-tauri/src/main.rs` `GAMELIB_LOGIN_DIAG` diff was NOT committed, reverted, or
  further modified this cycle, per explicit instruction — its provenance is now recorded but the
  developer has not said whether to keep/commit it.

  AWAITING the outerWidth-shim test result from the developer (already dispatched, not yet run or
  not yet reported). When it arrives: if the password prompt appears, this hypothesis moves toward
  CONFIRMED and a fix-design cycle (an init-script shim on the login window) becomes the next
  action. If 403 recurs, retest immediately with `Notification`/`alert`/`confirm` also restored
  alongside outerWidth in the same run before drawing a conclusion, per the pre-registered
  branches above. Separately and unaffected by any of this: the POST-AUTH fix design
  (Resolution.fix) remains ready and blocked only on session-closure confirmation for that
  SEPARATE implementation cycle (the pre-auth 403 thread above and the post-auth silent-navigation
  root cause are two different defects on two different sides of authentication; do not conflate
  their readiness states). The connection-loss/Keychain thread (16:00:00 block,
  `connection_loss_new_hypothesis_registered`) remains registered, lower-priority, and untouched
  this cycle, per the developer's own explicit priority ordering.

<!-- SUPERSEDING BLOCK 2026-08-02T16:00:00 -- everything below this block, INCLUDING the
     2026-08-02T15:00:00 block, is now HISTORICAL reasoning trail. This block RECONCILES two
     separate inputs: (1) the 15:00:00/15:10:00 cycle's own CHECKPOINT REACHED (four open asks:
     origin/intent of the discovered uncommitted `GAMELIB_LOGIN_DIAG` diff; session-closure
     confirmation; three confounds on the new 403 run; a revised A/B/C choice or permission to
     default to A), and (2) a NEW developer message that answers TWO of the THREE confounds,
     introduces ONE new variable that was not asked about, and proposes a NEW, explicitly
     lower-priority hypothesis for the SEPARATE connection-loss phenomenon. NO SOURCE EDIT THIS
     CYCLE -- the uncommitted diff was re-checked (Evidence 2026-08-02T16:00:00, PART 0) and found
     unchanged; it was not touched. Read THIS block first. -->

reconciliation_summary: |
  The developer's new message answers CONFOUNDS (1) and (2) from the prior checkpoint (binary =
  `pnpm tauri:dev`; `GAMELIB_OAUTH_UA_LEGENDARY` unset = stock UA) and adds a NEW variable
  (`GAMELIB_DEV_SECRET_VAULT=1`) that was not one of the three things asked about. It does NOT
  answer confound (3) (`GAMELIB_LOGIN_DIAG` state for that run — the specific question raised by
  discovering the uncommitted diff), does NOT mention the uncommitted-diff origin/intent question,
  and does NOT confirm the `pnpm tauri:dev` session is closed. Those three items are the ones this
  cycle's checkpoint must re-surface, unresolved, not softened by the fact that other questions
  got answered. Full detail: Evidence 2026-08-02T16:00:00, Parts A-C.

ua_corroboration_recorded: |
  The developer's confound answers incidentally strengthen the ALREADY-ELIMINATED pre-auth UA
  hypothesis (`leading_hypothesis_UNTESTED` in Eliminated): two materially different UA strings
  (Chrome-tokens vs. stock) now both produce the same `/id/api/email/exists` 403. Recorded as
  Evidence 2026-08-02T16:00:00 PART B, cross-referenced from Eliminated rather than edited into it
  (Eliminated is append-only). Provenance recorded honestly: this was NOT a designed single-
  variable UA test -- the developer did not set `GAMELIB_OAUTH_UA_LEGENDARY` for reasons unrelated
  to UA testing -- so it is an observation of opportunity, not a controlled experiment. It does not
  change the 403 thread's leading suspect (the diagnostic instrumentation); it only removes UA as
  a competing explanation slightly more firmly than before.

connection_loss_new_hypothesis_registered: |
  A NEW hypothesis is now on file for the connection-loss phenomenon specifically (NOT the 403):
  Keychain/keyring main-thread blocking during dev-vault-off (real Keychain) runs stalls
  WKWebView's networking callbacks long enough for CFNetwork to abandon in-flight connections. This
  project's own `keyring-timeout-races-keychain-approval` memory was read directly and confirms the
  developer's citation (48.9s / 291s blocking reads ending `PlatformFailure(-60008)`, attributed to
  an ad-hoc dev-signature / ACL problem, characterized as a DEV-BUILD artifact) — see Evidence
  2026-08-02T16:00:00 PART D. Strength exactly as the developer stated it: n=1 (this run, the first
  with `GAMELIB_DEV_SECRET_VAULT=1`, had zero connection-loss events), mechanistically coherent,
  NOT a finding. A cheap pre-registered test design is recorded (Evidence PART D) but NOT run this
  cycle. This hypothesis does not touch the Eliminated section and does not compete with the 403
  thread's leading suspect. Per the developer's own explicit instruction, this thread is kept
  fully separate from the 403 write-up above and is lower priority — it is registered, not pursued,
  this cycle.

still_outstanding_before_any_src_tauri_edit: |
  Unchanged in substance from the 15:00:00/15:10:00 checkpoint, restated precisely because the new
  message answered adjacent-but-different questions and must not be mistaken for resolving these:
  (1) Origin and intent of the uncommitted `GAMELIB_LOGIN_DIAG` diff at `main.rs:1886-1889` (plus
  the accompanying `configuredTimeoutMs` hunk) — is it known, intentional, in-progress developer
  work, and should it be kept as-is, replaced with the opt-out design staged at Evidence
  2026-08-02T15:00:00, or discarded? STILL UNANSWERED. Re-verified present and unchanged this cycle
  (Evidence 2026-08-02T16:00:00 PART 0).
  (2) Confirmation that the `pnpm tauri:dev` session is closed and the build freeze is lifted.
  STILL UNCONFIRMED — the new message describes a run's configuration in the past tense but does
  not state the session is now closed, and an uncommitted change persisting in `src-tauri/` across
  two full cycles is, if anything, mildly more consistent with an ongoing session than a closed
  one, not less.
  (3) Whether `GAMELIB_LOGIN_DIAG=1` was set for the deterministic 403 run. STILL UNANSWERED — the
  new message's confound answers do not cover this variable; the closest it comes is the unrelated
  `GAMELIB_DEV_SECRET_VAULT=1` disclosure, which answers a different question entirely (see
  reconciliation_summary above; do not conflate the two).

  No `src-tauri/` edit -- neither this file's own staged opt-out design nor the developer's
  existing opt-in diff -- can be responsibly applied while these three remain open. This is
  unchanged from last cycle's position, restated because it would be easy to read "two of three
  confounds answered" as "cleared to proceed," which it is not: the THIRD original confound and
  the two structurally separate blockers (diff origin, session status) are all still open.

revised_decision_ABC_still_undetermined: |
  A/B/C from the 15:00:00 block stand unchanged (full text there). The developer's message argues
  strongly for (A)'s priority in substance (the 403 is called "THE HIGHER PRIORITY" and connection-
  loss "does NOT block login," matching (A)'s own stated cost/benefit case) but does not select an
  option in so many words, and per constraint this agent does not choose on the developer's behalf
  or default to (A) even with that steer, because the uncommitted-diff and session-closure
  questions block (A)'s prerequisite action (a `src-tauri/` edit) regardless of which of A/B/C is
  eventually chosen.

next_action: |
  NO SOURCE EDIT BY THIS AGENT THIS CYCLE. `USER_AGENTS`/`EPIC_LOGIN_URL`/`matchOAuthRedirect`
  untouched; no Keychain identity or certificate created; plans 34.5-29/30/31 remain HALTED;
  `34.5-G6-EPIC-DISCRIMINATOR.md`/`-2.md` untouched, cross-referenced only;
  `34.5-UNTESTED-ITEMS.md` untouched, `U-34.5-06` remains OPEN. The uncommitted
  `src-tauri/src/main.rs` diff was re-verified present and byte-for-byte unchanged
  (Evidence 2026-08-02T16:00:00 PART 0) and was not touched, reverted, merged, or completed.

  Dispatching a CHECKPOINT REACHED. Two of the three original confounds are now answered (binary,
  `GAMELIB_OAUTH_UA_LEGENDARY`) and are recorded as UA-independence corroboration for an
  already-eliminated hypothesis. A new, explicitly lower-priority hypothesis (Keychain main-thread
  blocking) is now registered for the connection-loss thread only, kept separate from the 403
  thread per instruction, with a cheap test designed but not run. STILL OUTSTANDING, unchanged in
  substance from last cycle and re-stated so partial progress on adjacent questions is not mistaken
  for resolving these: (1) origin/intent of the uncommitted `GAMELIB_LOGIN_DIAG` diff — keep,
  replace with the staged opt-out design, or discard; (2) explicit confirmation the `pnpm
  tauri:dev` session is closed and the build freeze is lifted; (3) whether `GAMELIB_LOGIN_DIAG=1`
  was set for the deterministic 403 run (the one original confound the new message did not answer).
  A/B/C remains undecided by this agent; the developer's own framing leans toward (A) in substance
  without formally selecting it. Separately and unaffected by any of this: the POST-AUTH fix design
  (Resolution.fix) remains ready and blocked only on the same session-closure confirmation.

<!-- SUPERSEDING BLOCK 2026-08-02T15:00:00 -- everything below this block, INCLUDING the
     2026-08-02T14:00:00 block, is now HISTORICAL reasoning trail. This block processes a
     coordinator-surfaced REFRAME (a new deterministic reproduction of the pre-auth 403) plus a
     new circumstantial hypothesis (this app's own diagnostic instrumentation as the anti-bot
     signal), VERIFIES the specific factual claims attached to that hypothesis against git and
     this file's own record (Evidence 2026-08-02T15:00:00), DESIGNS but does NOT APPLY a scoped
     disable-test, and RE-PRESENTS options A/B/C refined, still without choosing among them. NO
     SOURCE EDIT THIS CYCLE. Read THIS block first. -->

CRITICAL_MID_CYCLE_CORRECTION_working_tree_already_modified: |
  DISCOVERED AFTER the rest of this block and Evidence 2026-08-02T15:00:00 were written -- `git
  status`/`git diff src-tauri/src/main.rs` (Evidence 2026-08-02T15:10:00) shows `src-tauri/src/
  main.rs` is ALREADY MODIFIED, UNCOMMITTED, on disk, RIGHT NOW -- NOT by this cycle, NOT by any
  edit this agent turn made. This correction supersedes every "NOT YET APPLIED" / "STAGED, not
  applied" statement above about the disable-instrumentation call site specifically -- those
  statements were written before this agent checked actual repo state and are WRONG as written for
  that call site. Full detail: Evidence 2026-08-02T15:10:00. This is now the single most important
  fact this cycle surfaces; everything below it in this block should be read with this correction
  in mind. NO FURTHER src-tauri/ ACTION TAKEN THIS CYCLE -- the existing uncommitted diff has been
  read and reported, not touched, reverted, or completed.

reframe_verdict: |
  THE REFRAME'S CORE CLAIM STANDS, ONE SUPPORTING NUMBER DOES NOT. Full verification in Evidence
  2026-08-02T15:00:00 above.

  CONFIRMED: (1) `bf5394a20` really did introduce `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`'s XHR/fetch/
  sendBeacon wrapping, content matches as described. (2) every `/id/api/email/exists` 403 this file
  has ever recorded was captured BY that same instrumentation (definitionally cannot predate it);
  pre-instrumentation evidence entries show only blank-page/empty-DOM/timeout symptoms, never this
  403 — TRUE when scoped to the anti-bot 403 specifically (a different, benign, unrelated 403 —
  Epic's own source-map 403s, x7 per run — predates and postdates the instrumentation unchanged;
  do not conflate the two). (3) the Electron arm's wrapper WAS installed after page load
  (DevTools console paste) versus Tauri's document-start injection — a real, previously-unflagged
  asymmetry specific to the fingerprinting question, confirmed by this file's own Evidence
  2026-08-02T14:00:00 text.

  CONTRADICTED: "makes it the ~6th observation of this specific 403" overstates this file's own
  record by roughly 4x. This file has recorded exactly ONE prior `email/exists` 403 (the historical
  06:30:00-block run) — this new run would make it the SECOND, not the sixth. This does not weaken
  the reframe's substantive claim (the 403 IS deterministic within this new session's own report,
  and the 403 and the connection-loss anomaly ARE two analytically separate things — the latter
  point was already independently established in this file at Evidence 2026-08-02T13:00:00's
  run-level correlation table, not new information this cycle). It does mean the reframe's own
  evidentiary framing should not be repeated as "~6th" in any future block.

  Net effect: the underlying REORDERING of priority (403 as the primary, deterministic pre-auth
  blocker; connection-loss as a real but separate, non-blocking overlay) is well-supported and
  should stand. The instrumentation-as-cause HYPOTHESIS is well-motivated (canonical automation
  fingerprint shape, confirmed asymmetric installation timing) but remains UNTESTED — nothing this
  cycle ran the actual disable experiment. It is a strong candidate, not a finding.

pre_auth_picture_revision: |
  This file's own `two_defects_summary` (historical block) already listed the 403 as a SEPARATE,
  undiagnosed, blocking pre-auth defect alongside the connection-loss thread — so the "picture
  inverting" is better described as a CORRECTED EMPHASIS than newly discovered structure: several
  recent cycles (11:30:00 through 14:00:00) spent their full budget chasing the connection-loss
  anomaly's mechanism, which is real and now well-characterized (Evidence 2026-08-02T14:00:00), but
  is not demonstrated to be what stops a logged-out user from reaching the password step. The 403
  is. Recorded plainly so a future reader does not read this block as contradicting the file's own
  earlier `two_defects_summary` — it is enacting what that summary already said, after several
  cycles' attention drifted toward the harder-to-pin-down thread.

  The Talon-attestation causal chain (both DIRECT-OVERLAP, falsified at Evidence
  2026-08-02T13:00:00, and the untested SEQUENTIAL form) explains the connection-loss/timeout family
  specifically. It was never proposed as an explanation for the 403 itself — the 403 run has always
  had a FULLY HEALTHY Talon session (Evidence 2026-08-02T13:00:00's own correlation table, and now
  this cycle's new run again). Nothing in this cycle moves Talon-attestation to Eliminated; it
  simply was never the candidate mechanism for the defect now getting priority.

disable_test_design_staged_not_applied: |
  Full call-site diff and rationale: Evidence 2026-08-02T15:00:00 above ("CALL SITE FOR THE
  PROPOSED DISABLE TEST"). Summary: one line added to the existing `if visible` gate at
  `src-tauri/src/main.rs:1886-1889`, `&& std::env::var("GAMELIB_DIAG_DISABLE").is_err()`, run as
  `GAMELIB_DIAG_DISABLE=1 pnpm tauri:dev`. Both pre-registered branches restated: password prompt
  appears -> instrumentation was the cause; 403 again -> instrumentation exonerated, something else
  about this webview drives the classification (WKWebView's JS environment fingerprint, the UA, or
  signals a real browser emits that this one doesn't).

  NOT APPLIED BY THIS AGENT THIS CYCLE. Session-closure status is UNCONFIRMED anywhere in this
  conversation's own record — the developer has been told to close their `pnpm tauri:dev` session,
  but no message in this thread confirms it IS closed. Per explicit instruction, this cycle does
  not proceed to the `src-tauri/` edit on the strength of an unconfirmed status.

  SUPERSEDED IN PART, see `CRITICAL_MID_CYCLE_CORRECTION_working_tree_already_modified` above and
  Evidence 2026-08-02T15:10:00: this exact call site is ALREADY modified, uncommitted, on disk,
  with a DIFFERENT (opt-in, default-OFF) toggle than the one designed here, written by someone/
  something other than this agent's tool calls this cycle. This design is offered for comparison
  and review, not as something to layer onto or reconcile with the existing uncommitted diff — do
  not merge, complete, or revert either one without explicit developer direction.

  Needed before ANY further `src-tauri/` action: (1) explicit confirmation the dev session is
  closed and the build freeze is lifted; (2) developer clarification of the ALREADY-PRESENT
  uncommitted `GAMELIB_LOGIN_DIAG` diff — is it known, intentional, in-progress work, and does the
  developer want it kept, replaced with this cycle's design, or discarded; (3) answers to the two
  confounds on the new run (which binary, was `GAMELIB_OAUTH_UA_LEGENDARY` set) plus the new third
  confound this discovery raises (was `GAMELIB_LOGIN_DIAG=1` set for that run, given the
  instrumentation now defaults off in the uncommitted tree).

revised_decision_ABC: |
  Re-framed per the developer's explicit request. The decision is no longer about an intermittent,
  mechanism-less connection anomaly (as the 13:00:00/14:00:00 blocks framed it) — it is about a
  reproducible-within-session, server-side bot-classification defect on `/id/api/email/exists`, with
  one cheap, staged, not-yet-applied first test. Still NOT choosing on the developer's behalf.

  (A) Run the disable-instrumentation test first. Cheapest available lever on the NEW primary
      blocker (one rebuild, on-screen-only read, both branches pre-registered, diff staged above).
      Blocked only on the session-closure confirmation and, ideally, the two confounds. If BRANCH
      "password prompt appears" fires, a real chunk of this investigation's own tooling would be
      revealed as the cause of what it was built to diagnose — record that plainly if it happens,
      per the developer's own instruction, not softened.
  (B) Continue the connection-loss/Talon mechanism thread. Largely ORTHOGONAL now that the primary
      blocker's identity has shifted — this thread explains a real, separately-standing anomaly
      (Evidence 2026-08-02T14:00:00), not (on current evidence) the 403. Pursuing it further no
      longer bears directly on getting a logged-out user to the password step; it would be pursued
      for its own sake as a characterized-but-unexplained defect.
  (C) Treat the pre-auth picture as sufficiently characterized for now and make an explicit
      mitigate-or-workaround call on the 403 specifically (e.g. a cleanly-isolated single-variable
      UA test, since the prior UA attempt — Evidence 2026-08-02T07:00:00 — was confounded by
      simultaneous connection-loss noise) rather than spending a further cycle on instrumentation-
      as-cause. Not recommended over (A) or (B) here; named for completeness.

  No option is recommended over another. (A) is materially cheaper and more directly targeted at
  the newly-reprioritized blocker than it was when first offered, per the developer's own framing —
  that cost/benefit shift is recorded here as a fact about the options, not as a choice made on the
  developer's behalf.

next_action: |
  NO SOURCE EDIT BY THIS AGENT THIS CYCLE. `USER_AGENTS`/`EPIC_LOGIN_URL`/`matchOAuthRedirect`
  untouched; no Keychain identity or certificate created; plans 34.5-29/30/31 remain HALTED;
  `34.5-G6-EPIC-DISCRIMINATOR.md`/`-2.md` untouched, cross-referenced only;
  `34.5-UNTESTED-ITEMS.md` untouched, `U-34.5-06` remains OPEN. This cycle's own
  disable-instrumentation diff is STAGED, reviewed, and NOT YET APPLIED — see
  `disable_test_design_staged_not_applied` above — BUT an UNRELATED, ALREADY-PRESENT, uncommitted
  modification to the same call site was DISCOVERED (not made) this cycle; see
  `CRITICAL_MID_CYCLE_CORRECTION_working_tree_already_modified` above and Evidence
  2026-08-02T15:10:00. Neither diff was touched, merged, completed, or reverted this cycle.

  Dispatching a CHECKPOINT REACHED. LEADING ASK, ahead of everything else this cycle produced:
  `src-tauri/src/main.rs` currently has an uncommitted local change (a `GAMELIB_LOGIN_DIAG` opt-in
  toggle on the exact diagnostic-disable call site this cycle was asked to design) that this agent
  did not make and cannot explain the origin of — please confirm whether this is known,
  intentional, in-progress work, and whether it should be kept, replaced with this cycle's design,
  or discarded, before anything else proceeds. SEPARATELY, this cycle also verifies the reframe's
  factual claims (one confirmed cleanly, one confirmed-with-scope-correction, one contradicted by
  this file's own record), stages its own disable-instrumentation test as a reviewable diff, and
  re-presents A/B/C against the revised picture. Needed from the developer before further pre-auth
  work proceeds: (1) resolve the uncommitted-diff question above; (2) confirm the
  `pnpm tauri:dev` session is closed / build freeze lifted; (3) answer the two original confounds
  (binary, `GAMELIB_OAUTH_UA_LEGENDARY` state) plus the new third confound
  (`GAMELIB_LOGIN_DIAG` state) for the new 403 run; (4) choose a direction among A/B/C, or decline
  to choose and let this cycle's ordering (A, being
  cheapest and most directly targeted, first) stand as the default. Separately and unaffected by any
  of this: the POST-AUTH fix design (Resolution.fix) remains ready and blocked only on the same
  session-closure confirmation.

<!-- SUPERSEDING BLOCK 2026-08-02T14:00:00 -- everything below this block, INCLUDING the
     2026-08-02T13:00:00 block, is now HISTORICAL reasoning trail. This block processes the
     symmetric-instrumentation test result (Evidence 2026-08-02T14:00:00, the new
     MEASUREMENT-ASYMMETRY Eliminated entry), UPDATES the honest position assessment the
     13:00:00 block delivered to reflect materially stronger evidence for the core pre-auth
     OBSERVATION, and RE-PRESENTS options A/B/C without choosing among them, per explicit
     developer instruction. NO FIX IS PROPOSED OR IMPLEMENTED THIS CYCLE. Read THIS block
     first. -->

symmetric_instrumentation_result_summary: |
  A self-critical, pre-registered test specifically designed to try to kill the standing
  WKWebView-connection-anomaly finding — the SAME JS-wrapper instrument used on the Tauri arm,
  installed for the first time inside the Electron `<webview>`'s own console, to remove the
  asymmetric-instrumentation confound that every prior cross-shell comparison in this file
  carried. Result: 7/7 requests clean under Electron with the SAME instrument (zero
  `xhr.error`, zero `xhr.timeout`), including `/id/api/email/exists` itself returning 204 in
  503ms versus Tauri's `xhr.timeout` at 10,052ms with no status. The rival hypothesis
  (Chromium silently retries and hides connection failures, making the 9-vs-0 comparison an
  artifact) is FALSIFIED — new Eliminated entry above. LIMIT, carried forward honestly: this
  is one clean Electron run (two total, counting the earlier DevTools-panel read) against four
  Tauri runs containing nine failures — the anomaly's EXISTENCE is now well-supported under
  symmetric measurement; its RATE on the Electron side remains uncharacterized. Full account,
  including the two self-caught test-design errors and the inconclusive ClientHello-churn
  side-attempt: Evidence 2026-08-02T14:00:00.

updated_position_assessment: |
  This UPDATES, not replaces, the 13:00:00 block's honest position assessment — the pre-auth
  thread's MECHANISM track record is unchanged (still 0-for-4 on discriminated hypotheses: UA,
  HTTP/2-suppression, pooled-connection-reuse, Talon-attestation DIRECT-OVERLAP), but the
  OBSERVATION the mechanisms were all trying to explain is now measurably stronger than it was
  three hours ago.

  ITEM 2 of the "what remains solid" list is UPGRADED, evidence-basis stated precisely:
  previously "WKWebView specifically loses connections... Chromium and Safari.app... do not,"
  supported by two DIFFERENT instruments (JS-wrapper on one side, DevTools-panel/packet-capture
  on the other). NOW: the same claim, supported by the SAME instrument on both sides, after a
  test explicitly designed and pre-registered to try to prove the opposite. This is a
  categorically stronger form of evidence than a fit-the-data reading — it is the FIRST
  discriminating test all day (fifth prediction, per Evidence 2026-08-02T14:00:00's method
  note) that came back IN FAVOR of the standing account rather than against it, which is
  exactly what `method_finding` (12:00:00 block) flagged as the missing ingredient: this file's
  hypotheses had been overturned by discriminating tests three times running, and this is the
  first case of a discriminating test SURVIVING contact instead.

  WHAT THIS DOES NOT CHANGE: the SEQUENTIAL form of Talon-attestation remains exactly as
  UNTESTED as the 13:00:00 block left it. The 403-run counterexample in the run-level
  correlation table is untouched. No mechanism for WHY WKWebView loses these connections has
  gained or lost support this cycle — only the underlying OBSERVATION that it does has. The
  distinction matters for the decision below: there is now a well-characterized,
  symmetrically-measured, engine-specific defect with NO identified cause and NO identified
  application-level lever other than retry (the future-cycle-only candidate the 13:00:00 block
  named and explicitly declined to scope).

  RE-PRESENTING THE SAME THREE OPTIONS, framing refined where the new evidence changes what
  each would concretely involve, choice NOT made here:
  (A) Design one more, sharper discriminating test for the SEQUENTIAL Talon-attestation form
      specifically (e.g. correlating `email/exists`'s outcome against Talon session state at
      PAGE LOAD rather than at request time). UNCHANGED IN SCOPE by this cycle's result — this
      option is about the MECHANISM, and the mechanism thread is untouched. What HAS changed:
      the case for spending another cycle chasing mechanism is now made against a firmer,
      not-an-artifact observation, so a mechanism found this way would explain something real
      rather than something later shown to be a measurement quirk.
  (B) Pursue a different class of investigation entirely. UNCHANGED IN SCOPE. One concrete
      variant made slightly cheaper by this cycle's work: the wrapper now exists and is proven
      to work symmetrically in BOTH shells, so a same-shaped investigation into a different
      symptom (e.g. characterizing the Electron-side RATE noted as a LIMIT above, if that ever
      matters) would be low-cost to run — named here as a NOW-CHEAPER variant of (B), not a
      recommendation to pursue it.
  (C) Treat this as good-enough characterization and make an explicit mitigate-rather-than-
      root-cause call. MATERIALLY STRENGTHENED by this cycle in one specific sense: choosing
      (C) now means deliberately deferring root-causing a defect that has survived its
      strongest available challenge — a more informed version of the same choice than was on
      the table at 13:00:00, when the observation itself still carried some risk of being an
      artifact. The future-cycle-only candidate the 13:00:00 block named (Epic's own
      retry-recovery pattern as a mitigation lever) is unchanged in status: named, not designed,
      not scoped, not authorized this cycle.

  No option is recommended over another here. The developer has not yet chosen A, B, or C, and
  this cycle does not choose on their behalf.

next_action: |
  NO SOURCE EDIT THIS CYCLE, NO FIX PROPOSED OR IMPLEMENTED, per explicit developer instruction.
  `USER_AGENTS`/`EPIC_LOGIN_URL`/`matchOAuthRedirect` untouched; no Keychain identity or
  certificate created; plans 34.5-29/30/31 remain HALTED; `34.5-G6-EPIC-DISCRIMINATOR.md`/`-2.md`
  untouched, cross-referenced only; `34.5-UNTESTED-ITEMS.md` untouched, `U-34.5-06` remains OPEN.

  Dispatching a CHECKPOINT REACHED: this cycle updates the position assessment to reflect the
  symmetric-instrumentation result and re-presents A/B/C, refined but not decided, for the
  developer's choice. Separately, and unaffected by anything in this cycle: the POST-AUTH fix
  design (Resolution.fix) remains ready and blocked only on confirmation that the developer's
  `pnpm tauri:dev` hardware session is closed and the build freeze is lifted — still not given,
  still worth the developer's attention alongside the pre-auth direction question.

<!-- SUPERSEDING BLOCK 2026-08-02T13:00:00 -- everything below this block, INCLUDING the
     2026-08-02T12:00:00 block, is now HISTORICAL reasoning trail. This block processes the
     temporal-overlap test result (Evidence 2026-08-02T13:00:00, branch T-NO-OVERLAP), the
     resulting Eliminated entry (DIRECT-OVERLAP form of Talon-attestation), and delivers the
     developer's explicitly-requested HONEST POSITION ASSESSMENT. NO FIX IS PROPOSED OR
     IMPLEMENTED THIS CYCLE, per explicit, firm developer instruction. Read THIS block first. -->

temporal_overlap_result_summary: |
  T-NO-OVERLAP. The run's single Talon `xhr.error` occurred 13,855ms BEFORE `/id/api/email/exists`
  was issued, entirely outside its 10,052ms outstanding-request window. The DIRECT-OVERLAP form of
  the Talon-attestation causal chain is FALSIFIED for this run and moved to Eliminated (new entry
  above). The weaker SEQUENTIAL form (session disrupted earlier, network recovers, payload already
  spoiled) is NOT confirmed by this result — it is merely not contradicted by it, and remains
  explicitly UNTESTED. Run-level correlation across all four runs on file is 3-of-4, not clean —
  the historical 403 run had a fully healthy Talon session yet a failed outcome, independently
  corroborating this file's earlier decision to keep the 403 analytically separate rather than
  folded into the Talon-connection-loss family (full table: Evidence 2026-08-02T13:00:00).

honest_position_assessment: |
  Requested explicitly by the developer, delivered plainly rather than softened. This is a status
  read, not a recommendation to act.

  WHAT REMAINS SOLID (five items, restated from the checkpoint, each still standing on its own
  evidence, untouched by this cycle's result):
  1. Electron/Chromium completes Epic login end-to-end; Tauri/WKWebView never has, across every
     run on file.
  2. WKWebView specifically loses connections to talon-service-prod.ecosec.on.epicgames.com;
     Chromium and Safari.app on the same machine, same network, same day do not (Evidence
     2026-08-02T11:00:00, T12:00:00).
  3. The TLS ClientHello offer is byte-equivalent (list contents) to Safari's for every Epic-family
     host captured — the difference is not in what this app negotiates on the wire (Evidence
     2026-08-02T12:00:00).
  4. `/id/api/email/exists` under Tauri receives NO response and dies on Epic's own client-side
     timeout (three independent measurements: ~10000ms, 10040ms, 10052ms, all consistent); under
     Chromium a 4xx there is the documented healthy path.
  5. The POST-AUTH root cause — WKWebView silently refusing the client-side navigation to the
     `https://localhost/...` redirect — remains CONFIRMED (Resolution.root_cause, Evidence
     2026-08-02T05:05:00) and is completely untouched by any of this cycle's or the prior several
     cycles' pre-auth work. A fix DESIGN for it already exists (prose only, not implemented; see
     `Resolution.fix`), independent of everything below.

  WHAT HAS BEEN ELIMINATED OR MATERIALLY WEAKENED ON THE PRE-AUTH THREAD, in the order it happened:
  - UA/fingerprinting as a SUFFICIENT explanation: ELIMINATED (scoped to pre-auth only;
    post-auth UA table stays open, untouched).
  - Chromium-only web API / notification-plugin injection / core-js self-test: ELIMINATED across
    three earlier cycles, each a clean kill on its own terms.
  - Client-side HTTP/2 suppression (this app's own code/config/build): FALSIFIED at the wire.
  - http/1.1 as the CAUSE (not merely a correlate or possible consequence) of the Talon connection
    losses: causality UNDETERMINED, plausibly INVERTED (CFNetwork/WebKit's documented h2-to-http/1.1
    fallback-and-cache behavior means the observed http/1.1 could be a symptom of an earlier failed
    h2 attempt, not its cause).
  - Stale pooled-connection reuse: UNEVIDENCED — its one supporting measurement (zero
    connect-phase duration) was itself falsified by a fresh-window control.
  - Talon-attestation DIRECT-OVERLAP: FALSIFIED this cycle. The SEQUENTIAL form that survives is a
    WEAKER, materially different claim — untested by design, and carrying one unexplained
    counterexample (the 403 run) in its own supporting correlation table.

  NET READ: every mechanism this file has proposed for the pre-auth half has now either been
  falsified outright or downgraded from "fits the evidence" to "not contradicted by the evidence,"
  which this file's own `method_finding` (12:00:00 block) already flagged as a weak standard here —
  three separate mechanisms that once "fit all evidence available at the time" were each overturned
  by the next discriminating test. The Talon-attestation sequential form has not yet been tested
  against that same standard. Taken at face value, the pre-auth thread's hit rate on
  fits-the-evidence hypotheses in this file is 0-for-4 once a real discriminator was applied
  (UA, HTTP/2-suppression, pooled-connection-reuse, DIRECT-OVERLAP attestation). That is a fact
  about this file's track record, not a claim that the pre-auth mechanism is unknowable — only that
  continuing to generate same-shaped hypotheses without a sharper discriminator than has been used
  so far has a demonstrated tendency to cost a cycle and land back at "weakened, not confirmed."

  This is offered as a status read for the developer's own decision, not a decision made on the
  developer's behalf: whether to (a) design one more, sharper discriminating test for the
  SEQUENTIAL form specifically (e.g. correlating email/exists's outcome against Talon session
  state at PAGE LOAD rather than at request time), (b) pursue a different class of investigation
  entirely, or (c) treat this as good enough characterization and make an explicit
  mitigate-rather-than-root-cause call. No option is recommended over another here.

  FUTURE-CYCLE-ONLY CANDIDATE, named exactly as that and not designed or scoped further: the
  developer's own observation that Epic's client already recovers from every OTHER Talon failure
  via retry, and `/id/api/email/exists` is the one request observed on file with no retry, is
  recorded as a possible mitigation angle for a LATER, EXPLICITLY AUTHORIZED cycle — worth naming
  because it is the only concrete lever that has surfaced all session, not worth acting on now.
  This is not a fix proposal for this cycle and nothing here should be read as one.

next_action: |
  NO SOURCE EDIT THIS CYCLE, NO FIX PROPOSED OR IMPLEMENTED, per explicit developer instruction.
  `USER_AGENTS`/`EPIC_LOGIN_URL`/`matchOAuthRedirect` untouched; no Keychain identity or
  certificate created; plans 34.5-29/30/31 remain HALTED; `34.5-G6-EPIC-DISCRIMINATOR.md`/`-2.md`
  untouched, cross-referenced only; `34.5-UNTESTED-ITEMS.md` untouched, `U-34.5-06` remains OPEN.

  Dispatching a CHECKPOINT REACHED: this cycle delivers the requested position assessment and asks
  the developer to choose a direction (sharper sequential-form test / different investigation
  class / explicit mitigate-not-root-cause decision) before any further pre-auth work proceeds.
  Separately, and independently of that choice: the POST-AUTH fix design (Resolution.fix) has been
  ready since an earlier cycle and is blocked only on confirmation that the developer's
  `pnpm tauri:dev` hardware session is closed and the build freeze is lifted — that confirmation
  has still not been given and is worth the developer's attention alongside the pre-auth direction
  question, since it is a separate, already-scoped, already-designed piece of work not affected by
  anything in this cycle.

<!-- SUPERSEDING BLOCK 2026-08-02T12:00:00 -- everything below this block, INCLUDING the
     2026-08-02T11:30:00 block, is now HISTORICAL reasoning trail. This block processes a NEW,
     DECISIVE checkpoint response: a wire-level TLS packet capture (Evidence 2026-08-02T12:00:00)
     that (1) FALSIFIES the client-side-suppression framing the 11:30:00 block was about to test via
     code signing (see the new Eliminated entry above), (2) renders that block's Stage 2 (Keychain
     identity creation) MOOT and explicitly WITHDRAWN, Stage 1 LOWERED-not-withdrawn, and (3) forces
     a CAUSALITY-ORDERING CORRECTION to this file's own standing http/1.1-causes-connection-loss
     account. Read THIS block first. -->

packet_capture_result_summary: |
  Wire-level ground truth (client ClientHello ALPN, not a browser-reported API value): the Tauri
  `loginwin-*` webview offers `['h2','http/1.1']` — IDENTICAL to Safari.app's offer — across every
  Epic-family host captured (tracking.epicgames.com, static-assets-prod.unrealengine.com, two
  hcaptcha subdomains, store-site-backend-static-ipv4.ak.epicgames.com). Full table and both stated
  limits (no direct `www.epicgames.com` capture on the Tauri side; TLS 1.3 hides the SERVER's
  chosen ALPN from a plaintext capture): Evidence 2026-08-02T12:00:00. Do not restate this as "the
  negotiated protocol is h2" — that is not what was measured, only the offer.

code_signing_hypothesis_status: |
  UNTESTED-AND-DEPRIORITIZED, not eliminated — it was registered (11:30:00 block,
  `code_signing_hypothesis_registered`) but its discriminating test (Stage 2) never ran. Reason for
  dropping it, stated explicitly per instruction: the wire evidence above, not lack of interest —
  code signing cannot change an ALPN offer that is already correct. STAGE 2 IS WITHDRAWN: do NOT
  create the self-signed Keychain identity recipe from the 11:30:00 block; the developer has
  explicitly declined authorization for that system-level change now that its premise is
  undercut. STAGE 1 (the already-built `src-tauri/target/debug/bundle/macos/GameLib.app`,
  packaged-bundle-vs-raw-binary read) is LOWERED in priority, not withdrawn — it is already built,
  costs nothing further to run, and remains an independent, informative variable on its own terms
  (LaunchServices registration / Info.plist / sandboxing, orthogonal to signing identity) if the
  developer wants it later, but it is no longer this file's `next_action`.

causality_inversion_correction: |
  STANDING ACCOUNT REVISED. This file's `Resolution.root_cause` framing and multiple Current Focus
  blocks have carried the account "http/1.1 (weak connection-pooling under WKWebView) CAUSES the
  Talon connection losses" without ever having tested the ordering. The developer's flag, recorded
  per its own stated importance: CFNetwork/WebKit are documented to FALL BACK from a failed h2
  attempt to http/1.1 and CACHE that downgrade per-host. The capture (client OFFER only, not
  negotiated result) is consistent with EITHER ordering and discriminates neither. RETRACTED: the
  causal ORDERING (http/1.1 as cause). UNCHANGED, still confirmed: the underlying protocol
  OBSERVATION itself — h2/h3 under Electron, h2 under Safari.app, http/1.1 under Tauri, from two
  independent sources (Evidence 2026-08-02T09:15:15, T11:00:00, T12:00:00). Any future write-up of
  the Talon connection-loss mechanism must present http/1.1 as a CORRELATE, not a stated cause,
  until a test actually orders the two (e.g. capturing the FIRST connection attempt to a fresh,
  never-before-contacted Talon host and observing whether it starts on h2 and downgrades, vs.
  starting on http/1.1 from the first packet).

method_finding: |
  Recorded per the checkpoint's own explicit request, as a standing note for the rest of this
  investigation, not just this cycle: THREE interpretive readings have now been overturned today by
  a discriminating test that came after each one looked solid — (1) zero-connect-duration as
  evidence of pooled connection reuse, (2) the protocol difference being this app's own client-side
  configuration, (3) http/1.1 as the CAUSE (not a possible consequence) of the connection losses. In
  each case the mechanism fit all evidence available at the time; in each case a pre-registered
  discriminating test went against it. GENERALIZABLE LESSON: hypotheses that merely fit existing
  evidence have a poor track record in this file; only tests designed to DISCRIMINATE before the
  result is known have actually moved it forward. Future cycles on this file should weight test
  design over explanatory fit, and keep remaining asks minimal.

still_outstanding_unchanged: |
  - The temporal-overlap test (`t` field), still unrun since the 08:35:00 historical block first
    proposed it — restated here as the CHEAPEST remaining discriminator, runnable on the EXISTING
    `pnpm tauri:dev` binary, no build/signing prerequisite.
  - The single unexplained 403 on `/id/api/email/exists`, still separate and untouched by this
    cycle's capture.
  - The reframed core question, unchanged: why does this app's WKWebView lose connections to
    talon-service-prod.ecosec.on.epicgames.com when Safari.app and Chromium on the same machine do
    not — now sharpened by this cycle to explicitly EXCLUDE "because it offers a different ALPN
    list" (falsified) and to no longer presume http/1.1 is the cause rather than a symptom.

next_action: |
  NO SOURCE EDIT THIS CYCLE (none authorized, none needed — this cycle was evidence recording and
  hypothesis re-scoping only). `USER_AGENTS`/`EPIC_LOGIN_URL`/`matchOAuthRedirect` untouched; plans
  34.5-29/30/31 remain HALTED; `34.5-G6-EPIC-DISCRIMINATOR.md`/`-2.md` untouched, cross-referenced
  only; `34.5-UNTESTED-ITEMS.md` untouched, `U-34.5-06` remains OPEN. No Keychain identity, no
  certificate, nothing created.

  Dispatching a CHECKPOINT REACHED: the cheapest remaining discriminator (the temporal-overlap
  test) and the now-lower-priority Stage 1 packaged-bundle read both require live hardware (a
  running `pnpm tauri:dev` session, or launching the pre-built `.app`, plus Safari Web Inspector /
  packet capture) this agent cannot perform. Recommended order: (1) temporal-overlap test first —
  cheapest, no prerequisite; (2) Stage 1 packaged-bundle protocol read only if the developer wants
  the now-deprioritized bundle-vs-raw-binary variable closed off too, otherwise skip it and treat it
  as abandoned; (3) code-signing Stage 2/3 stay withdrawn unless a NEW, different piece of evidence
  reopens the case for the host-identity variable specifically.

<!-- SUPERSEDING BLOCK 2026-08-02T11:30:00 -- everything below this block, INCLUDING the
     2026-08-02T10:15:00 block, is now HISTORICAL reasoning trail. This block processes a NEW
     checkpoint response that REVERSES the 10:15:00 block's INFERENCE (not its search, which stands
     as sound): a control measurement using Safari.app itself (same engine as WKWebView, NOT this
     app) measured `h2` against the identical origin on the identical machine, proving the http/1.1
     anomaly is specific to THIS APP'S OWN webview instance, not "WebKit vs. Chromium" in general
     (Evidence 2026-08-02T11:00:00). This reopens the question the 10:15:00 search closed too early,
     and surfaces a NEW candidate the prior search's five-item list did not include: code signing /
     host-app identity, with a direct project precedent (`keyring:timeout`). This block (1) verifies
     the hypothesis's feasibility against actual build/signing config before designing anything
     (Evidence 2026-08-02T11:10:00); (2) actually builds and inspects a `tauri build --debug`
     package to test the design's core technical premise instead of assuming it (Evidence
     2026-08-02T11:20:00); (3) lays out a staged, falsifiable test plan with pre-registered branches;
     and (4) issues a CHECKPOINT REACHED with an explicit human-action decision point (a Keychain
     change) before any interactive Stage 2 measurement can proceed. Read THIS block first. -->

code_signing_hypothesis_registered: |
  NEW CANDIDATE, NOT YET TESTED. Per the checkpoint response and this project's own precedent
  (`keyring-timeout-races-keychain-approval.md`, read directly — see Evidence 2026-08-02T11:10:00):
  an ad-hoc, unstable code-signing identity is a KNOWN lever for platform-level behavior differences
  between a `cargo`/`tauri dev` build and a properly signed one on this exact machine, already
  confirmed once for Keychain ACL persistence. The hypothesis extends that same lever to WKWebView's
  networking-process behavior (ALPN/HTTP-version negotiation), which the prior cycle's search did
  not check because it was not on that cycle's candidate list. This is registered as a HYPOTHESIS
  WITH PRECEDENT, explicitly not a finding — per the checkpoint's own stated caution and this file's
  history of two other attractive-but-wrong interpretations collapsing today already (pooled-reuse,
  the "relocates into our config" reframe). Do not let this into any future block as more than a
  candidate until an actual signed-and-measured build lands.

feasibility_verified_before_design: |
  Per this cycle's explicit instruction to verify before recommending, checked directly (full detail:
  Evidence 2026-08-02T11:10:00, 2026-08-02T11:20:00), not assumed:
  - This machine's login keychain has ZERO code-signing identities of any kind (`security
    find-identity`) — a Developer-ID-trusted build is not possible here without first creating one.
  - This project's own CI (`release-tauri.yml`) has NO Apple cert secret enrolled either — "0.x
    ships UNsigned" is stated in that workflow's own comments. A genuinely Apple-trusted signed build
    is not available from anywhere in this project today, CI included.
  - `tauri.conf.json` configures no macOS `signingIdentity`/`hardenedRuntime`/`entitlements` at all,
    and `Cargo.toml` overrides no profile's `debug-assertions` — both defaults apply cleanly, nothing
    project-specific stands in the way of a `--debug`-flagged `tauri build`.
  - ACTUALLY RAN `pnpm exec tauri build --debug --bundles app` (a build action, no source/tracked
    file touched — `src-tauri/target/` is gitignored) and confirmed, by direct inspection of the
    resulting artifact rather than by assumption: the dev cargo profile survives packaging
    (`debug_assertions` stays ON), the `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`'s `__GAMELIB_DIAG__`
    literal is physically present in the packaged binary (`strings` grep, exact match), and the
    packaged `.app` is (as expected, since no identity was supplied) STILL ad-hoc-signed, identical
    to the raw `pnpm tauri:dev` binary's signature. This is the artifact Stage 1 below uses.

staged_test_design: |
  Three stages, each isolating exactly one variable from the last, cheapest/least-invasive first.
  Protocol MUST be read via Safari Web Inspector's own Network panel, attached to the `loginwin-*`
  window — the SAME method the checkpoint's own control used, NOT `performance.getEntriesByType`
  (that JS field already has one formally-retracted-field precedent this session on the identical
  platform; do not reintroduce it as evidence here). The already-shipped `window.__GAMELIB_DIAG__`
  console query remains available identically in every stage below (confirmed present in the
  packaged binary, see `feasibility_verified_before_design` above), so pre-auth Talon-timeout
  instrumentation is not lost by moving to a packaged build.

  STAGE 0 (already complete, no live hardware needed): established the ad-hoc/unsigned baseline
  empirically on this machine (Evidence 2026-08-02T11:10:00) — nothing to re-run.

  STAGE 1 (READY NOW, no further setup): `src-tauri/target/debug/bundle/macos/GameLib.app` already
  exists from this cycle's build and is STILL ad-hoc-signed, but is now a real `.app` bundle launched
  via LaunchServices/Finder rather than a raw Mach-O run from a terminal under `cargo`/`tauri dev` --
  a DIFFERENT execution context than every prior measurement in this file, even though the signature
  type has not changed yet. This isolates "packaged bundle vs. raw dev binary" as its own variable
  BEFORE touching signing identity at all. Launch it directly (double-click, or `open
  src-tauri/target/debug/bundle/macos/GameLib.app`), drive to Manage Accounts -> Epic exactly as
  every prior `pnpm tauri:dev` run in this file, open Safari's Develop menu against the `loginwin-*`
  window (devtools wiring is unchanged from every prior cycle -- confirmed still gated identically),
  and read the Network panel's Protocol column for `www.epicgames.com`/Talon-host rows.
    - Branch S1-H2: protocol reads `h2`/`h3` -> the ad-hoc SIGNATURE was never the variable; the
      earlier `tauri dev` raw-binary execution context was. Re-scope the hypothesis to "raw cargo
      binary vs. bundled `.app`" (LaunchServices registration, `Info.plist` presence, sandboxing
      differences), NOT code signing per se, and design the next test around THAT distinction
      instead of Stage 2 below.
    - Branch S1-HTTP1.1: protocol still reads `http/1.1` -> bundle-vs-raw-binary is ruled out as
      sufficient on its own; proceed to Stage 2, which is the only remaining stage that changes the
      signing identity itself.

  STAGE 2 (BLOCKED on a Keychain change -- human-action checkpoint, see below): create a local,
  STABLE (non-ad-hoc) code-signing identity and re-run Stage 1's exact protocol read against a build
  signed with it. This is the direct test of the code-signing hypothesis itself, and mirrors the
  keyring precedent's own recommended fix #1 ("sign the dev build with a stable identity") rather
  than requiring a full Apple-trusted Developer ID (which is not available anywhere in this project
  today -- see `feasibility_verified_before_design`). NOT YET APPLIED -- this is a reviewable,
  NOT-YET-RUN recipe, per this file's own established convention for prior fix designs:

      # 1. Generate a self-signed certificate with a Code Signing EKU (no GUI needed, but the
      #    Keychain Access GUI's "Certificate Assistant -> Create a Certificate... -> Identity Type:
      #    Self Signed Root, Certificate Type: Code Signing" wizard does the same thing and may be
      #    the simpler path for a one-off local identity).
      openssl req -x509 -newkey rsa:2048 -keyout /tmp/gamelib-devsign.key \
        -out /tmp/gamelib-devsign.crt -days 3650 -nodes \
        -subj "/CN=GameLib Local Dev Signing" \
        -addext "extendedKeyUsage=codeSigning"
      openssl pkcs12 -export -out /tmp/gamelib-devsign.p12 \
        -inkey /tmp/gamelib-devsign.key -in /tmp/gamelib-devsign.crt -passout pass:devsign

      # 2. Import into the login keychain and mark trusted for code signing.
      security import /tmp/gamelib-devsign.p12 -k ~/Library/Keychains/login.keychain-db \
        -P devsign -T /usr/bin/codesign
      # (Keychain Access -> find "GameLib Local Dev Signing" -> Get Info -> Trust -> "Code Signing:
      #  Always Trust" may still be needed interactively depending on this machine's Keychain policy.)

      # 3. Build and sign with the new stable identity.
      APPLE_SIGNING_IDENTITY="GameLib Local Dev Signing" pnpm exec tauri build --debug --bundles app

      # 4. Confirm the signature actually changed before reading protocol (do not skip this check):
      codesign -dvvv src-tauri/target/debug/bundle/macos/GameLib.app
      # Expect Signature to no longer read "adhoc" and TeamIdentifier/Identifier to be stable across
      # rebuilds (re-running step 3 twice and diffing CDHash-adjacent fields is a cheap self-check).

      # 5. Repeat Stage 1's exact interactive protocol read against THIS build.

  This recipe is offered for review/approval, not executed — it creates a persistent identity in
  this developer's personal login keychain, a system-level change outside the repo that this cycle
  is not authorized to make silently. If the developer prefers, the equivalent GUI path (Keychain
  Access's Certificate Assistant) produces the same result without any shell commands.
    - Branch S2-H2: protocol reads `h2`/`h3` with the stable identity where Stage 1's ad-hoc-bundled
      build (or the raw `tauri dev` binary) read `http/1.1` -> STRONG support for the code-signing
      hypothesis, direct structural parallel to the keyring precedent. This would be a major result:
      the Talon connection-loss chain and possibly the whole pre-auth failure may be a DEV-BUILD
      ARTIFACT, not a defect that would reach real users of a properly signed release.
    - Branch S2-HTTP1.1: protocol still reads `http/1.1` even with a stable, non-ad-hoc identity ->
      the ad-hoc/stable axis is ruled out specifically (not signing-and-trust in general -- a real
      Apple-trusted Developer ID + hardened runtime, Stage 3, remains untested and is a stronger
      replication of Safari.app's actual trust context). Record as a real negative result and return
      to `investigation_loop` for other candidates rather than escalating to Stage 3 by default.

  STAGE 3 (OPTIONAL ESCALATION ONLY, likely BLOCKED): a real Apple Developer ID Application
  certificate + hardened runtime is the closest possible replication of Safari.app's own signing
  context, but per `feasibility_verified_before_design` this project has NO such certificate enrolled
  anywhere (local keychain or CI) — obtaining one requires Apple Developer Program enrollment (paid,
  out of this cycle's authority to initiate). Named for completeness only; not part of the immediate
  test plan. Only pursue if Stage 2 produces S2-H2 and the developer wants the stronger, fully-trusted
  replication before treating the finding as load-bearing for a real fix.

known_risk_not_yet_verified: |
  Whether Safari's Web Inspector can still attach to the `loginwin-*` WKWebView once it is signed
  with a NON-ad-hoc identity (Stage 2) is itself unverified -- WKWebView remote inspection has
  historically not required the same `get-task-allow`/ptrace-style debug entitlements LLDB needs, and
  no hardened-runtime flag is configured anywhere in this project's build (confirmed,
  `feasibility_verified_before_design`), so this is not expected to break -- but it is flagged
  honestly as unverified rather than assumed, since it directly gates whether Stage 2's own
  measurement is even obtainable. If Stage 2's build cannot be inspected, the console-only
  `window.__GAMELIB_DIAG__` query (confirmed present in the packaged binary regardless of Web
  Inspector availability) is the fallback for pre-auth Talon-timeout data, but it cannot substitute
  for the Network panel's own Protocol column reading, which has no non-Inspector equivalent
  currently shipped.

temporal_overlap_still_outstanding_unchanged: |
  Restated, not superseded: the temporal-overlap test (08:35:00 historical block's
  `next_discriminator`, re-issued unchanged at every block since including the immediately prior
  10:15:00 block) remains a SEPARATE, still-unrun live-hardware ask, orthogonal to the protocol/
  signing question this block designs for. It is not blocked by anything in this block and can be
  run on the EXISTING `pnpm tauri:dev` binary at any time, independent of Stage 1/2/3's sequencing.
  Full text: 08:35:00 block, not re-issued verbatim here (see also `three_outcome_reframe`, 09:20:00
  block, for how to report the result).

next_action: |
  NO SOURCE EDIT THIS CYCLE (none authorized or needed). `USER_AGENTS`/`EPIC_LOGIN_URL`/
  `matchOAuthRedirect` untouched; plans 34.5-29/30/31 remain HALTED; `34.5-G6-EPIC-DISCRIMINATOR.md`/
  `-2.md` untouched, cross-referenced only; `34.5-UNTESTED-ITEMS.md` untouched, `U-34.5-06` remains
  OPEN. `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT` and the `open_devtools()` calls remain
  `#[cfg(debug_assertions)]`-gated exactly as before -- nothing in this block's build action changed
  main.rs. The ONE non-source action this cycle took was a build (`pnpm exec tauri build --debug
  --bundles app`), which is reproducible and left no tracked-file diff.

  Dispatching a CHECKPOINT REACHED with two independent asks, NEITHER blocking the other:
  (1) DECISION NEEDED: approve (or perform directly) the Stage 2 Keychain recipe above (a persistent,
  local, self-signed code-signing identity) -- OR decline it, in which case Stage 2/3 stay
  unavailable and this investigation has to treat the code-signing hypothesis as untestable-for-now
  and fall back to other candidates.
  (2) READY IMMEDIATELY, no decision needed: launch the already-built
  `src-tauri/target/debug/bundle/macos/GameLib.app`, drive Epic login exactly as every prior
  `pnpm tauri:dev` run, and report Stage 1's Safari Web Inspector Network-panel protocol reading
  (S1-H2 or S1-HTTP1.1). This can happen before, after, or independent of the Stage 2 decision.
  (3) Still standing, unchanged, can be run on the ORIGINAL `pnpm tauri:dev` binary any time: the
  temporal-overlap test (`temporal_overlap_still_outstanding_unchanged` above).
  This agent cannot launch a GUI app, run `pnpm tauri:dev`, open Safari/Web Inspector, or modify the
  developer's personal Keychain itself.

<!-- SUPERSEDING BLOCK 2026-08-02T10:15:00 -- everything below this block, INCLUDING the
     2026-08-02T09:20:00 block, is now HISTORICAL reasoning trail. This block (1) processes the
     checkpoint response's protocol corroboration -- `protocol_claim_pending` (09:20:00 block) is
     PROMOTED from candidate to CONFIRMED, per the checkpoint's own explicit instruction and its
     stated bounds (Evidence 2026-08-02T09:15:15's original caveat is discharged FOR THE
     `nextHopProtocol` FIELD SPECIFICALLY -- the `connectStart`/`connectEnd` retraction is a
     separate, still-standing fact about a different field, not reopened by this); (2) reports
     this cycle's READ-ONLY static source search (Evidence 2026-08-02T10:15:00) against the
     checkpoint's four-item candidate list for an application-controlled HTTP/2 suppression
     mechanism -- RESULT: EMPTY, all five named candidates checked against actual pinned-version
     source and each comes back either unused-by-this-app or (for the IPC scheme handlers)
     mechanistically incapable of the effect; (3) explicitly does NOT retract the confirmed
     protocol observation, only the checkpoint's own speculative reframe that the cause must be
     "in this codebase's own configuration" -- that specific claim did not survive the search;
     (4) re-affirms the temporal-overlap test as the single standing outstanding live-hardware
     ask, unchanged in every particular from the 09:20:00/08:45:00/08:35:00 blocks, and issues it
     again as this cycle's checkpoint since no other live-hardware ask is pending. Read THIS block
     first. -->

protocol_difference_confirmed: |
  Per the checkpoint response, `protocol_claim_pending` (09:20:00 historical block) is now
  CONFIRMED, not merely a candidate: Electron/Chromium negotiates h2/h3 against Epic's
  Cloudflare-fronted origin; Tauri/WKWebView negotiates only http/1.1 for the SAME origin, same
  machine, same network, same account -- corroborated by TWO independent sources
  (`performance.getEntriesByType`'s JS field AND Safari Web Inspector's own Network panel, read
  directly). Scope, stated precisely so this is not overclaimed: this confirms the OBSERVATION
  (WKWebView is on http/1.1 here); it does NOT by itself confirm CAUSATION of the Talon
  connection-loss pattern (`intervention_surface_honesty`, `talon_causal_chain_hypothesis` remain
  exactly as scoped in the 09:20:00 block -- a fit, not a demonstration) and, per this block's own
  new finding below, it does NOT confirm the mechanism is inside this codebase's configuration.

static_search_result_empty: |
  This cycle's mandated READ-ONLY static search (full detail: Evidence 2026-08-02T10:15:00) checked
  all four of the checkpoint's named candidate areas plus the explicit ipc-protocol-machinery
  question, against ACTUAL SOURCE at the exact pinned versions (`wry` 0.55.1, `tauri` 2.11.5,
  `tauri-runtime` 2.11.3), not inference:
    - `humble_login_open`'s `WebviewWindowBuilder` chain: no proxy/data-store/session option of
      any kind: only `.user_agent()`, `.visible()`, and presentation/diagnostic calls.
    - wry's macOS webview construction: default (persistent, non-ephemeral) `WKWebsiteDataStore`
      confirmed used (incognito defaults false, never overridden); `mac-proxy` Cargo feature
      confirmed NOT compiled into this build (`Cargo.lock` grep, zero matches); wry has ZERO
      HTTP-version/ALPN-related code anywhere in its source tree (grepped the whole crate).
    - The console's "IPC custom protocol failed" warning: traced to its exact source
      (`tauri-2.11.5/scripts/ipc-protocol.js`) -- a same-window `fetch()` to the in-process
      `ipc://`/`tauri://`/`asset://`-scheme handler (already-diagnosed capability-scope
      rejection), a SEPARATE, non-network request from Epic's own `https://` traffic; WebKit
      dispatches scheme handlers by exact scheme string, so this is structurally incapable of
      touching `https://www.epicgames.com` requests. Answers the checkpoint's specific question
      with a named, source-verified NO, not a guess.
    - ATS/Info.plist/entitlements: no committed plist/entitlements/ATS override anywhere under
      `src-tauri/`; the only `Info.plist` files in the repo belong to the unrelated Electron
      build's `dist/` output.

  CONSEQUENCE, stated as precisely as the checkpoint's own prose that prompted this search: the
  checkpoint's reframe ("this relocates the question INTO THIS CODEBASE'S OWN CONFIGURATION") does
  NOT survive this search. Every application-level lever checked is either provably unused
  (default config throughout) or provably unable to reach `https://` traffic (the IPC scheme
  handlers). This reverts the honest read to where `intervention_surface_honesty` (07:40:00
  historical block) already had it: WKWebView's/CFNetwork's ALPN negotiation is not reachable
  from -- and, on this cycle's evidence, not being suppressed by -- anything this codebase
  configures. This is recorded as a genuine, useful negative result, per this cycle's own explicit
  instruction that "we could not find an application-level cause" is a legitimate outcome that
  changes the fix conversation: there is, at minimum, no quick source-level lever to pull here.

next_action: |
  NO SOURCE EDIT THIS CYCLE (none was authorized or needed -- this was a read-only search).
  `USER_AGENTS`/`EPIC_LOGIN_URL`/`matchOAuthRedirect` untouched; plans 34.5-29/30/31 remain
  HALTED; `34.5-G6-EPIC-DISCRIMINATOR.md`/`-2.md` untouched, cross-referenced only;
  `34.5-UNTESTED-ITEMS.md` untouched, `U-34.5-06` remains OPEN.

  The temporal-overlap test (08:35:00 block's `next_discriminator`, restated unchanged at every
  block since) remains the ONE standing outstanding live-hardware ask and is reissued here since
  this cycle's own work item is now closed and nothing else is queued. Reach a genuinely
  logged-out state (verify `/id/api/authenticate` = 204) under the combined-token UA
  (`GAMELIB_OAUTH_UA_LEGENDARY="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML,
  like Gecko) Chrome/126.0.0.0 Safari/537.36 EpicGamesLauncher" pnpm tauri:dev`), submit a
  username, let `/id/api/email/exists` resolve to whatever outcome occurs, then run:

      JSON.stringify(window.__GAMELIB_DIAG__.map(({kind,id,url,method,status,elapsedMs,configuredTimeoutMs,t})=>({kind,id,url,method,status,elapsedMs,configuredTimeoutMs,t})))

  and compare, by hand, whether any Talon (`talon-service-prod.ecosec.on.epicgames.com`)
  `xhr.error`/`fetch.error` record's `t` falls inside `/id/api/email/exists`'s own outstanding
  request window (full BRANCH T-CONFIRMED / T-NO-OVERLAP / T-ABSENT-BUT-FAILED /
  T-PRESENT-BUT-SUCCEEDED definitions: 08:35:00 block, unchanged, not re-issued verbatim here).
  Report which of 403 / `xhr.timeout` / success occurred on `/id/api/email/exists` explicitly, per
  `three_outcome_reframe` (09:20:00 block) -- do not just report "failed". This agent cannot run
  `pnpm tauri:dev` or open a browser console itself.

<!-- SUPERSEDING BLOCK 2026-08-02T09:20:00 -- everything below this block, INCLUDING the
     2026-08-02T08:45:00 block, is now HISTORICAL reasoning trail. This block processes the
     Electron control-arm results the 08:45:00 block's `next_action` requested (item 1, expected
     before item 2, the still-standing temporal-overlap test). It (1) records the cross-shell
     comparison as the strongest discriminator this file has produced, cross-referenced against the
     frozen E1 verdict (see new Evidence 2026-08-02T09:15:00); (2) records the protocol claim as an
     EXPLICITLY UNCONFIRMED candidate per the checkpoint's own self-flagged caveat -- DO NOT read it
     as settled (Evidence 2026-08-02T09:15:15); (3) records the negative segfault finding as a
     separate, unchased finding (Evidence 2026-08-02T09:15:30); (4) re-scopes
     `pre_auth_defect_reframed_as_intermittent`'s three-outcome Tauri comparison into two distinct
     phenomena (403 vs. timeout) per the new 409-is-normal reframe; and (5) re-sequences the standing
     live-hardware ask back to item 2 from the 08:45:00 block -- the temporal-overlap test -- now
     that item 1 is in hand, plus a new secondary ask for the independent protocol corroboration.
     Read THIS block first. -->

electron_control_arm_landed: |
  The 08:45:00 block's item-1 ask (`electron_control_arm_in_progress`) is answered, log-corroborated,
  not just developer-reported. Full table and reframe: Evidence 2026-08-02T09:15:00. Three facts do
  NOT depend on the suspect JS field and are recorded as directly established: (a) Electron completes
  the Epic login end-to-end under the identical `EPIC_LOGIN_URL`; Tauri has never completed it in any
  run this file has on record; (b) zero Talon-host connection failures under Chromium vs. nine under
  WKWebView, same machine/network, same host (`talon-service-prod.ecosec.on.epicgames.com`); (c) a
  4xx on `/id/api/email/exists` (409, observed under Electron) is Epic's NORMAL non-blocking path --
  the Tauri pathology is the ABSENCE of any response (the `xhr.timeout` outcomes), which is
  categorically different from a status code. This CROSS-REFERENCES `34.5-G6-EPIC-DISCRIMINATOR-2.md`'s
  frozen `verdict: E1` with network-level detail that contract did not have -- the file itself stays
  untouched, per Constraints.

three_outcome_reframe: |
  `pre_auth_defect_reframed_as_intermittent` (historical 08:15:00 block) recorded three Tauri
  outcomes for `/id/api/email/exists` under one UA -- 403, `xhr.timeout`, success -- and treated them
  as one intermittent phenomenon. Per the 409-is-normal reframe above (Evidence 2026-08-02T09:15:00),
  that grouping is now known to conflate two DIFFERENT things: the `xhr.timeout` outcomes fit the
  ABSENCE-of-response shape `talon_causal_chain_hypothesis` (Evidence 2026-08-02T08:30:00) already
  predicts and remains the live, unproven candidate for; the 403 outcome is a genuine app-level
  rejection WITH a status code, mechanistically distinct from an absent response, and is NOT
  addressed by the Talon connection-loss hypothesis as currently framed. SCOPE, stated precisely so
  this is not overclaimed: `talon_causal_chain_hypothesis` and its `next_discriminator` (the
  temporal-overlap test) concern the `xhr.timeout` shape specifically. The 403 outcome remains
  unexplained and is NOT retired, eliminated, or folded into this hypothesis by this reframe -- it is
  a separate open question, flagged here so it is not silently absorbed into whatever the
  temporal-overlap test concludes about the timeout shape.

protocol_claim_pending: |
  The `h2`/`h3`-vs-`http/1.1` protocol difference is recorded (Evidence 2026-08-02T09:15:15) as a
  candidate, NOT as confirmed -- the checkpoint's own explicit caveat, honored verbatim. The
  WKWebView-side value came from the same JS API (`performance.getEntriesByType`) whose
  `connectStart`/`connectEnd` fields were already formally retracted this session for an unrelated
  reliability failure on the identical platform. Do not cite the protocol difference as an
  established mechanism in any future block until the requested independent corroboration (Safari
  Web Inspector's own Network panel, read directly, not through the JS field) lands -- see
  `next_action` below for how this is sequenced against the still-standing temporal-overlap ask.

segfault_finding_not_this_investigation: |
  A separate, self-initiated developer check found 20 identically-signatured
  `com.apple.WebKit.WebContent-*.ips` crash reports (our own shell's web-content process,
  `EXC_BAD_ACCESS`/`SIGSEGV` at address `0x180`) over four days. Checked directly against this
  investigation's active hypothesis and RULED OUT by timestamp -- the crash window does not overlap
  any recorded connection-loss event. Full detail: Evidence 2026-08-02T09:15:30. NOT investigated
  further this cycle -- recorded per this file's established distinct-finding pattern so it is not
  lost.

temporal_overlap_discriminator_still_standing: |
  Unchanged from the 08:45:00 and 08:35:00 blocks: the `t`-field-corrected temporal-overlap test
  (does a Talon `xhr.error`/`fetch.error` record's `t` fall INSIDE `/id/api/email/exists`'s own
  outstanding request window, per the pre-registered BRANCH T-CONFIRMED / T-NO-OVERLAP /
  T-ABSENT-BUT-FAILED / T-PRESENT-BUT-SUCCEEDED split -- full text at the 08:35:00 block's
  `next_discriminator`, not re-issued verbatim here) is NOT superseded by anything in this block. It
  now has NEW SCOPE CLARITY from `three_outcome_reframe` above: the test's own pre-registered
  branches already condition on `/id/api/email/exists` producing 403-or-`xhr.timeout` as a single
  "FAILED" category -- going forward, when this test's result lands, read a 403 outcome and a
  timeout outcome as two SEPARATE facts to report (per `three_outcome_reframe`), not interchangeable
  instances of "FAILED", even though the branch text itself is not being rewritten this cycle.

next_action: |
  NO SOURCE EDIT THIS CYCLE. No fix proposed or authorized -- `intervention_surface_honesty`
  (07:40:00 historical block) remains binding: even if the temporal-overlap test confirms
  T-CONFIRMED, WKWebView's/CFNetwork's connection-pool and networking-process internals remain
  unreachable from this codebase; the one candidate mitigation (an application-level detect-and-retry
  workaround) remains UNDESIGNED and UNAUTHORIZED, named only for the record. HOLD unchanged:
  `USER_AGENTS`/`EPIC_LOGIN_URL`/`matchOAuthRedirect` untouched; plans 34.5-29/30/31 remain HALTED;
  `34.5-G6-EPIC-DISCRIMINATOR.md`/`-2.md` untouched, cross-referenced only; `34.5-UNTESTED-ITEMS.md`
  untouched, `U-34.5-06` remains OPEN. No `src-tauri/` edit while a live hardware session may be open
  (standing constraint, unchanged; no instrumentation change is needed for either ask below -- both
  use already-shipped instrumentation and built-in browser APIs only).

  Dispatching a CHECKPOINT REACHED requesting, IN THIS ORDER, on the next `pnpm tauri:dev` run:
  (1) PRIORITY, unchanged and still outstanding: the 08:35:00 block's temporal-overlap test --
  reach logged-out (verify `/id/api/authenticate` = 204) under the combined-token UA
  (`GAMELIB_OAUTH_UA_LEGENDARY="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML,
  like Gecko) Chrome/126.0.0.0 Safari/537.36 EpicGamesLauncher" pnpm tauri:dev`), submit a username,
  let `/id/api/email/exists` resolve to whatever outcome occurs, then run the `t`-inclusive
  `window.__GAMELIB_DIAG__` query and compare against the four pre-registered T-* branches (full
  query text and branch definitions: 08:35:00 block, not repeated here). Report which of 403 /
  `xhr.timeout` / success occurred explicitly, per `three_outcome_reframe` -- do not just report
  "failed".
  (2) SECONDARY, new this cycle: on that SAME run (or a following one if the first ends before this
  is captured), open Safari's Web Inspector against the `loginwin-*` window and read the Network
  panel's own Protocol column directly for the `www.epicgames.com` / Talon-host rows -- NOT via
  `performance.getEntriesByType` -- to independently corroborate or falsify
  `protocol_claim_pending`. Two outcomes: Inspector also reports `http/1.1` -> the protocol
  difference becomes a confirmed leading mechanism candidate; Inspector reports `h2`/`h3` while the
  JS field says `http/1.1` -> the JS field is shown unreliable a second time, and the protocol
  difference is retracted as a candidate entirely.
  This agent cannot run `pnpm tauri:dev` or open a browser/Web Inspector itself.

<!-- SUPERSEDING BLOCK 2026-08-02T08:45:00 -- everything below this block, INCLUDING the
     2026-08-02T08:35:00 block, is now HISTORICAL reasoning trail (but that block's
     `next_discriminator`, the temporal-overlap test, is NOT withdrawn -- see
     `temporal_overlap_discriminator_still_standing` below). This block (1) reinstates a genuine
     developer-reported live-hardware observation ("failed to initalise CAPTCHA") that an
     intermediate message-relay step in a prior session wrongly treated as fabricated -- the
     developer/coordinator has corrected that determination as WRONG; the observation is real and
     is recorded at Evidence 2026-08-02T08:45:00; (2) eliminates the UA/ENGINE FINGERPRINT MISMATCH
     hypothesis as a SUFFICIENT explanation for the PRE-AUTH defect specifically, leaving the
     POST-AUTH UA table open and untouched (see the new Eliminated entry); (3) records a method
     lesson about four distinct on-screen presentations of one underlying mechanism (Evidence
     2026-08-02T08:45:15); (4) records a separate, non-blocking finding about Tauri-specific code
     executing under Electron (Evidence 2026-08-02T08:45:30); and (5) re-sequences the standing
     live-hardware ask: the developer is CURRENTLY running the Electron control arm (`npm start`),
     not another Tauri run, so its results are expected BEFORE the still-valid temporal-overlap
     test. Read THIS block first. -->

reinstated_captcha_observation: |
  A genuine, previously-mis-flagged-as-fabricated developer observation is now correctly on record:
  on-screen text "failed to initalise CAPTCHA" [sic], from the SAME run already on file at Evidence
  2026-08-02T08:20:00/08:25:00 (the pre-registered control run, brand-new login window
  `loginwin-2-...`). Full raw result + correlation: Evidence 2026-08-02T08:45:00. That run's own
  `id: 21` record (`/v1/init/execute`, Talon's captcha-init call, `xhr.error`/`status:0`) was
  already on file — this cycle adds the correlation between that record and the on-screen text, not
  the record itself. This is NOT a new live run; it is a previously-undelivered report about a run
  already documented in this file. Nothing about the run's other already-recorded facts (control
  measurement result, host-level breakdown, connection-pool falsifier outcome) changes.

method_lesson_four_presentations: |
  Four runs, one underlying mechanism (connection loss to
  `talon-service-prod.ecosec.on.epicgames.com`), four different on-screen presentations: (1) a
  spinner hang with no visible error text — new UI detail supplied this cycle for the already-
  recorded Evidence 2026-08-02T07:15:00 `xhr.timeout` run; (2) "service is temporarily unavailable"
  — Evidence 2026-08-02T07:00:00; (3) "enable cookies" — Epic's generic, misleading 403 copy,
  already established (historical `second_defect_found` block); (4) "failed to initialise CAPTCHA"
  — this cycle's reinstated observation, the only one naming the real failing subsystem. Full
  reasoning and generalization: Evidence 2026-08-02T08:45:15. GENERALIZATION carried forward: an
  unstable/varying on-screen presentation for a WKWebView-hosted third-party page is itself a
  signal to correlate against network-level instrumentation before trusting any single run's
  visible copy as diagnostic — this file has already lost time to exactly this trap three times
  (R3, CLOBBERED-GLOBAL, the ITP sub-hypothesis all leaned on a plausible-looking but misleading
  surface signal).

ua_hypothesis_scoped_elimination: |
  The PRE-AUTH `leading_hypothesis_UNTESTED` (UA/ENGINE FINGERPRINT MISMATCH as a SUFFICIENT
  explanation for `/id/api/email/exists` failing) is now ELIMINATED — see the new Eliminated entry
  immediately above this section for the full two-ground falsification (intermittency under one UA;
  a different, previously-"clearing" UA also failing, this time upstream of anything
  fingerprint-gated). SCOPE, restated because this is the exact kind of split this file has gotten
  wrong before (the two-defects-must-stay-separate discipline already established at
  `two_defects_summary`): this elimination touches ONLY the pre-auth `/id/api/email/exists`
  question. It does NOT extend to `ua_table_and_test_design_flaw`'s post-auth three-point fit
  (Evidence 2026-08-02T08:10:00, concerning `/id/api/redirect`'s 400/`client_id is required`),
  which remains OPEN, unproven, and un-eliminated. Do not conflate the two UA questions going
  forward.

temporal_overlap_discriminator_still_standing: |
  The 2026-08-02T08:35:00 block's `next_discriminator` (the `t`-field-corrected temporal-overlap
  test — does a Talon `xhr.error`/`fetch.error` record's `t` fall INSIDE `/id/api/email/exists`'s
  own outstanding request window, per the pre-registered BRANCH T-CONFIRMED / T-NO-OVERLAP /
  T-ABSENT-BUT-FAILED / T-PRESENT-BUT-SUCCEEDED split) is UNCHANGED and NOT superseded by anything
  in this block. It remains the correct next live-hardware test for `talon_causal_chain_hypothesis`
  (Evidence 2026-08-02T08:30:00). Restated here for continuity, not re-issued as a duplicate ask —
  see `next_action` below for sequencing.

electron_control_arm_in_progress: |
  Per this cycle's report: the developer is CURRENTLY running the Electron control arm (`npm
  start`), not another Tauri run — comparing (a) HTTP protocol negotiation and (b) Talon-host
  connection-loss presence/absence between Chromium and WKWebView for the SAME origins. This bears
  directly on `electron_control_arm_implication` (historical 2026-08-02T07:40:00 block) and on
  whether the connection-loss/captcha-init pattern is WKWebView-specific or reproduces under
  Chromium too. Its results are expected BEFORE the temporal-overlap run described above — sequence
  the next checkpoint accordingly rather than assuming the standing Tauri ask is next in the queue.

electron_side_finding_not_this_investigation: |
  A separate, non-blocking finding surfaced from the Electron arm's renderer console: Tauri-
  specific code (a window-chrome helper, a `configStore` hydration path) executes unconditionally
  under Electron and fails on missing `invoke`/`getCurrentWindow`, leaving `configStore` degraded.
  Full detail: Evidence 2026-08-02T08:45:30. NOT investigated further this cycle — orthogonal to
  Epic login / F-34.5-G6-01. Recorded so it is not lost.

next_action: |
  NO SOURCE EDIT THIS CYCLE. No fix proposed or authorized — `intervention_surface_honesty`
  (07:40:00 historical block) remains binding. HOLD unchanged: `USER_AGENTS`/`EPIC_LOGIN_URL`/
  `matchOAuthRedirect` untouched; plans 34.5-29/30/31 remain HALTED; `34.5-G6-EPIC-DISCRIMINATOR.md`/
  `-2.md` untouched, cross-referenced only; `34.5-UNTESTED-ITEMS.md` untouched, `U-34.5-06` remains
  OPEN (only a live observation of Epic's success path retires it — nothing this cycle does that).
  No `src-tauri/` edit while a live hardware session may be open (standing constraint, unchanged;
  no instrumentation change is needed for the next test either way — both asks below use
  already-shipped instrumentation and built-in browser APIs only).

  Dispatching a CHECKPOINT REACHED requesting, IN THIS ORDER:
  (1) the Electron control-arm's comparison results (HTTP protocol negotiation + Talon
  connection-loss presence/absence under Chromium vs. WKWebView for the same origins) — expected
  next, per `electron_control_arm_in_progress` above; report whatever is available even if
  incomplete;
  (2) once available (or immediately, if the developer already has a fresh Tauri run in hand), the
  2026-08-02T08:35:00 block's still-standing temporal-overlap test, unchanged — the console query
  with the `t` field, run against the pre-registered BRANCH T-* split.
  This agent cannot run `pnpm tauri:dev`/`npm start` or open a browser console itself.

<!-- SUPERSEDING BLOCK 2026-08-02T08:35:00 -- everything below this block, INCLUDING the
     2026-08-02T08:15:00 block, is now HISTORICAL reasoning trail. This block processes a NEW
     developer report that does NOT report which of the 08:15:00 block's five pre-registered
     branches (a)-(e) occurred on the requested live run. Instead it reports (1) a PRE-REGISTERED
     CONTROL measurement that FALSIFIES this file's own supporting-evidence claim for candidate
     mechanism 2 ("stale pooled connection reuse") -- see Evidence 2026-08-02T08:20:00 and the
     paired Eliminated entry -- and (2) a NEW causal hypothesis scoped to Talon anti-bot connection
     instability specifically, not general WKWebView network instability -- see Evidence
     2026-08-02T08:25:00/08:30:00. The 08:15:00 block's live-run ask is NOT withdrawn (still no
     branch-(a)-(e) result in hand) but is SUPERSEDED as the next priority by the discriminator this
     block designs for the new Talon hypothesis, per the developer's explicit re-scoping instruction
     in section 4 of their report ("re-scope the next request accordingly rather than repeating the
     same ask a fifth time"). Read THIS block first. -->

retraction_and_correction_summary: |
  Two corrections to carry forward from this cycle, both self-corrections of THIS file's own
  prior reasoning, recorded honestly per this project's standing F-10 discipline:
  (1) The Resource Timing zero-connect-duration signature is RETRACTED as evidence for or against
  candidate mechanism 2 (stale pooled connection) -- a pre-registered control (a brand-new
  window's first requests) shows the identical signature, proving the instrument cannot
  distinguish "reused connection" from "WKWebView never populates this field" on this platform.
  Full reasoning: Evidence 2026-08-02T08:20:00, paired Eliminated entry immediately above this
  section. Candidate mechanism 2 is UNEVIDENCED, not refuted -- it remains a nameable candidate,
  just not one this file's instrumentation can currently test.
  (2) The connection-loss storm and the `/id/api/email/exists` same-origin timeout were WRONGLY
  conflated as one signature across `branch_3_landed`/`candidate_mechanisms_for_connection_lost_pattern`
  (historical blocks). A host-level breakdown (Evidence 2026-08-02T08:25:00) shows every
  connection-loss event across four runs lands on ONE cross-origin host
  (`talon-service-prod.ecosec.on.epicgames.com`); `/id/api/email/exists` itself has NEVER produced
  a connection-loss event -- only a real HTTP status or a client-side `xhr.timeout` with no
  response. These are two distinct signatures. This does not retract the underlying facts
  (the ~10s timeout is still real, the connection-loss events are still real) -- only the claim
  that one directly explains the other.

talon_causal_chain_hypothesis: |
  NEW, NOT YET TESTED. Full chain: Evidence 2026-08-02T08:30:00. Summary: Talon's host drops
  connections intermittently; the `/id/api/email/exists` POST body (~15KB, far larger than an
  email address) is proposed to carry a Talon attestation payload; when Talon's connection breaks,
  Epic's backend allegedly cannot validate that attestation and never responds at all, so the
  client sits until its own ~10000ms timeout fires -- explaining the "no HTTP status ever" shape
  that has been otherwise unaccounted for all cycle. Supporting fit so far is RUN-LEVEL only (the
  one run with zero Talon connection-loss events is the one run where email/exists succeeded) --
  no WITHIN-RUN temporal correlation (does a specific Talon failure's timestamp actually fall
  inside the email/exists request's own outstanding window?) has been checked by anyone. That gap
  is exactly what this block's `next_discriminator` closes.

next_discriminator: |
  A LIVE-HARDWARE RUN, NO SOURCE EDIT -- honors the standing process constraint (no `src-tauri/`
  edits while a live session may be open). Uses ONLY already-shipped instrumentation
  (`window.__GAMELIB_DIAG__`); the only change from every prior cycle's projection is including
  the `t` field, which `record()` has always set (`src-tauri/src/main.rs:634`,
  `entry.t = Date.now()`) but which EVERY prior cycle's `JSON.stringify(...)` projection omitted --
  this is a console-query correction, not a source edit, and it is the field this cycle's test
  depends on.

  Reach a genuinely logged-out state (verify `/id/api/authenticate` = 204) under the SAME
  combined-token UA as the 08:15:00 block's still-open ask
  (`GAMELIB_OAUTH_UA_LEGENDARY="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36
  (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 EpicGamesLauncher" pnpm tauri:dev`), submit a
  username, and let the run proceed to WHATEVER outcome occurs on `/id/api/email/exists` (403,
  `xhr.timeout`, or success -- do not force it, intermittency is expected and any outcome is
  informative for this specific test). Immediately after that outcome is observed, run:

      JSON.stringify(window.__GAMELIB_DIAG__.map(({kind,id,url,method,status,elapsedMs,configuredTimeoutMs,t})=>({kind,id,url,method,status,elapsedMs,configuredTimeoutMs,t})))

  Then compute (by hand or by eye, no tooling needed): for every record whose `url` contains
  `talon-service-prod.ecosec.on.epicgames.com` and `kind` is `xhr.error`/`fetch.error`, does its
  `t` fall within the outstanding window of the `/id/api/email/exists` request -- i.e. between
  that request's own `xhr.send`/`fetch.send` record's `t` and its terminal record's `t`
  (`xhr.response`/`fetch.response`/`xhr.timeout`/`fetch.error`), or within roughly its
  `configuredTimeoutMs` after the send if the terminal record's `t` is the timeout itself?

  Pre-registered branches:

  BRANCH T-CONFIRMED: at least one Talon `xhr.error`/`fetch.error` record's `t` falls INSIDE the
  `/id/api/email/exists` request's own outstanding window, AND in this same run `/id/api/email/exists`
  itself FAILED (403 or `xhr.timeout`). SUPPORTS the causal chain directly -- a Talon connection
  loss temporally overlapping the specific request that failed, not just co-occurring somewhere in
  the same run. Per this cycle's report, do NOT treat this as authorizing any fix (mirrors the
  standing `intervention_surface_honesty` constraint from the 07:40:00 historical block --
  WKWebView's connection-pool/networking-process internals are not reachable from this codebase
  regardless of which candidate mechanism turns out to be correct); record the result and design
  the fix question separately.

  BRANCH T-NO-OVERLAP: Talon `xhr.error`/`fetch.error` record(s) exist in the run, but ALL of their
  `t` values fall OUTSIDE the `/id/api/email/exists` request's own window (e.g. only during initial
  page bootstrap, well before the username was submitted) -- even though `/id/api/email/exists`
  itself failed in the same run. WEAKENS the specific temporal-causality claim (attestation payload
  broken BY a connection loss occurring during THIS request) while leaving open a weaker version
  (a Talon session broken earlier in the run stays broken and affects a later, unrelated request)
  that this test alone cannot separate from T-CONFIRMED's stronger reading -- record verbatim,
  flag the ambiguity rather than force a reading.

  BRANCH T-ABSENT-BUT-FAILED: `/id/api/email/exists` FAILS (403 or `xhr.timeout`) in a run with
  ZERO Talon `xhr.error`/`fetch.error` records anywhere, at any point. FALSIFIES the Talon chain as
  a NECESSARY condition for the failure -- the failure can occur with no Talon connection-loss
  event in the entire run. Would not fully kill the hypothesis on its own (Talon connection health
  could theoretically degrade without producing a full connection-lost event) but is a real
  weakening result and should be recorded as such, not minimized.

  BRANCH T-PRESENT-BUT-SUCCEEDED: Talon `xhr.error`/`fetch.error` record(s) occur in the run, but
  `/id/api/email/exists` still SUCCEEDS. FALSIFIES strict run-level sufficiency (a Talon loss
  anywhere in the run does not guarantee failure) -- check whether the Talon event(s)' `t` values
  in this case ALSO fall outside the request window (which would actually be CONSISTENT with the
  narrower temporal-overlap version of the hypothesis, not a clean falsification of it) before
  concluding anything; report both the outcome and the timestamp comparison.

  Any outcome not covered above (e.g. multiple email/exists attempts in one run with different
  outcomes): record verbatim, do not force it into one of the four branches above, design a further
  test before touching source.

  The 08:15:00 block's own five-branch ask (does the flow ever reach a captured `localhost`
  redirect under this UA) remains open and un-superseded for whichever run this test is performed
  on -- report BOTH sets of observations (the branch T-* correlation and the branch (a)-(e) outcome)
  from the same live run if only one run is performed this cycle, since both asks use the identical
  reproduction steps and UA.

next_action: |
  NO SOURCE EDIT THIS CYCLE. No fix proposed or authorized -- `intervention_surface_honesty`
  (07:40:00 historical block) remains binding regardless of which candidate mechanism (stale pool
  vs. Talon attestation) eventually gets evidenced, since neither names a fix reachable from this
  codebase without further discussion. HOLD unchanged: `USER_AGENTS`/`EPIC_LOGIN_URL`/
  `matchOAuthRedirect` untouched; plans 34.5-29/30/31 remain HALTED;
  `34.5-G6-EPIC-DISCRIMINATOR.md`/`-2.md` untouched, cross-referenced only.

  Dispatching a live-hardware checkpoint requesting the ONE run described in `next_discriminator`
  above (the console query, corrected to include `t`, plus the by-hand timestamp comparison against
  the Talon branches, reported alongside whichever of the 08:15:00 block's branches (a)-(e) also
  occurs in the same run) -- this agent cannot run `pnpm tauri:dev` or open a browser console
  itself.

<!-- SUPERSEDING BLOCK 2026-08-02T08:15:00 -- everything below this block, INCLUDING the
     2026-08-02T07:45:00 block, is now HISTORICAL reasoning trail. This block processes a NEW
     developer report carrying three live observations (Evidence 2026-08-02T08:00:00/08:05:00/
     08:10:00) that arrived instead of the 07:45:00 block's still-outstanding post-failure
     Resource Timing / GAMELIB-DIAG capture. That ask is NOT withdrawn -- it is folded forward
     into this block's `next_discriminator` as a sub-branch requirement, not lost. Read THIS
     block first. -->

pre_auth_defect_reframed_as_intermittent: |
  RETRACTING the implicit "deterministic" framing this file has carried since
  `two_defects_summary` (historical 06:30:00 block, "FOUND, undiagnosed"). Full evidence and
  reasoning: Evidence 2026-08-02T08:00:00. The SAME truthful-Safari-UA literal has now produced
  three different `/id/api/email/exists` outcomes across three separate runs (403, `xhr.timeout`,
  success). The pre-auth defect is INTERMITTENT, not deterministic, and UA alone is not a
  sufficient explanation for it -- though UA has not been ruled out as A contributing factor
  either; nothing here changes that. The one clean-success run also had zero reported
  connection-loss noise through submission, corroborating (not confirming) the standing
  connection-instability framing from `branch_3_landed` (Evidence 2026-08-02T07:15:00) and
  candidate mechanism 2 (stale pooled connection, still SUPPORTED-NOT-CONFIRMED per the 07:40:00/
  07:45:00 blocks). No new instrumentation ran this cycle; this is a live-observation update only.

post_auth_new_presentation: |
  A full credential submission under the truthful Safari UA reproduced Epic's visible
  `Parameter "client_id" is required` error from a genuinely logged-out start, with the
  developer independently confirming the password was correct in an unrelated browser session.
  Full evidence: Evidence 2026-08-02T08:05:00. This is NOT a credential rejection -- Epic
  accepted the login and failed during the post-auth redirect handoff, the half whose root cause
  this file already confirmed end-to-end (`Resolution.root_cause`). It is recorded as a NEW
  PRESENTATION (a visible 400 with page-rendered error text) of a mechanism POSSIBLY related to,
  but NOT YET PROVEN identical to, the already-confirmed SILENT navigation-refusal mechanism --
  see Evidence 2026-08-02T08:05:00's two-reading split for what remains open. `Resolution.root_cause`
  is NOT edited by this; it stays scoped exactly as written, cross-referenced only.

ua_table_and_test_design_flaw: |
  Cross-referencing Eliminated/R1 against the new `client_id`-required reproduction surfaces a
  three-point UA table (full table: Evidence 2026-08-02T08:10:00): the only UA literal that has
  ever cleared the `/id/api/redirect` 400 carries BOTH Chromium engine tokens AND the
  `EpicGamesLauncher` token; every UA that has ever hit the 400 (including this cycle's truthful
  Safari UA) is missing exactly one of the two. CANDIDATE READING ONLY, a three-point fit, not a
  proven mechanism -- do not treat as confirmed.

  Developer-flagged self-correction, recorded honestly per this file's own F-10 discipline: the
  truthful-Safari-UA literal used in every pre-auth run this phase (the 403 run, the
  2026-08-02T07:00:00 timeout run, and this cycle's 08:00:00 clean-success run) DROPPED the
  `EpicGamesLauncher` token relative to the stock literal -- an unintended, untracked second
  variable change alongside the intended engine-truthfulness fix. This means none of those three
  runs can cleanly isolate the fingerprint-vs-launcher-token question AT THE REDIRECT STAGE. It
  does NOT weaken the `/id/api/email/exists` intermittency finding above (Evidence
  2026-08-02T08:00:00) -- that question only ever compared those same three runs against each
  other under an IDENTICAL UA literal, which remains a clean, unconfounded comparison for that
  specific question. `separately_established_and_worth_keeping` (historical Current Focus block)
  is REFINED, not retracted, by this: it established "the UA must carry engine tokens"; this
  cycle's data extends that to "and, apparently, ALSO needs the `EpicGamesLauncher` token, per a
  three-point fit" -- both caveats (candidate-only, not proven) apply.

next_discriminator: |
  ONE live-hardware run, no source edit -- honors the standing process constraint (no
  `src-tauri/` edits while a live session may be open; nothing here needs building or
  restarting). Use the ONLY UA literal on record that has ever cleared the `/id/api/redirect`
  400 -- the one carrying BOTH tokens (Eliminated/R1 Arm B):

      GAMELIB_OAUTH_UA_LEGENDARY="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 EpicGamesLauncher" pnpm tauri:dev

  Reach a genuinely logged-out state (verify `/id/api/authenticate` = 204), submit a FULL
  username+password credential pair, and let the flow run as far as it goes. Pre-registered
  branches, per the developer's own explicit request that the observed space is wider than a
  two-branch prediction (do not under-specify again):

  BRANCH (a) FULL SUCCESS: pre-auth clears `/id/api/email/exists` AND the flow reaches the
  post-auth redirect stage cleanly (an `/id/api/redirect` 200 with a `redirectUrl`, matching the
  shape already confirmed at Evidence 2026-08-02T04:00:00). This is the best outcome for closing
  the pre-auth half; the post-auth half's fix design (already on record, see historical
  `two_defects_summary`) remains the next step regardless, since a silent-refusal navigation is
  still expected to occur next.

  BRANCH (b) 403 ON `/id/api/email/exists`: pre-auth fails the same way the earliest run did,
  under a UA that both carries the launcher token and has never previously been tested for THIS
  specific endpoint. IMMEDIATELY run the still-outstanding post-failure capture from the
  07:40:00/07:45:00 blocks (both already-shipped instrumentation, no source edit):
      `JSON.stringify(performance.getEntriesByType('resource').filter(e=>/epicgames\.com/.test(e.name)).map(e=>({name:e.name.replace(/^https?:\/\/[^/]+/,''),proto:e.nextHopProtocol,connectStart:e.connectStart,connectEnd:e.connectEnd,secureStart:e.secureConnectionStart,reqStart:e.requestStart,respStart:e.responseStart,respEnd:e.responseEnd,transferSize:e.transferSize,encodedBodySize:e.encodedBodySize,start:e.startTime,dur:e.duration})))`
  and
      `JSON.stringify(window.__GAMELIB_DIAG__.map(({kind,id,url,method,status,elapsedMs,configuredTimeoutMs})=>({kind,id,url,method,status,elapsedMs,configuredTimeoutMs})))`

  BRANCH (c) `xhr.timeout` ON `/id/api/email/exists`: same as (b) -- run both captures
  immediately, this closes the still-open Branch A/B question (stale pooled connection vs. fresh
  handshake still failing) from the 07:40:00/07:45:00 blocks at the same time this test resolves
  the fingerprint/launcher-token question.

  BRANCH (d) `client_id is required` REPRODUCED AGAIN under this combined UA: this would be the
  strongest result against the `ua_table_and_test_design_flaw` candidate reading -- the ONE UA
  literal believed (from a three-point fit) to avoid this error would have failed to avoid it,
  falsifying that candidate reading cleanly. Record verbatim; do not force-fit it into (a).

  BRANCH (e) SUCCESS THROUGH TO A CAPTURED REDIRECT: pre-auth clears, post-auth `/id/api/redirect`
  returns 200, AND (novel, not yet observed in any run) the window actually navigates and
  `oauthLoginCapture.ts`'s poll loop captures a `localhost` redirect with a `code` param. This
  would mean the post-auth silent-refusal is ALSO intermittent, not the confirmed-permanent
  behavior `Resolution.root_cause` currently describes -- if this happens, do NOT treat
  `Resolution.root_cause` as retracted from a single successful run; flag it explicitly as
  requiring re-examination rather than silently updating the confirmed root cause.

  Any outcome not covered above: record verbatim, do not force it into (a)-(e), design a further
  test before touching source.

next_action: |
  NO SOURCE EDIT THIS CYCLE. No fix proposed or authorized -- per the developer's own standing
  instruction (`intervention_surface_honesty`, 07:40:00 block, still binding) not to propose one
  until the pre-auth path is understood, and this cycle's data, while informative, does not clear
  that bar (intermittency is now better characterized, not yet explained). HOLD unchanged:
  `USER_AGENTS`/`EPIC_LOGIN_URL`/`matchOAuthRedirect` untouched; plans 34.5-29/30/31 remain
  HALTED; `34.5-G6-EPIC-DISCRIMINATOR.md`/`-2.md` untouched, cross-referenced only.

  Dispatching a live-hardware checkpoint requesting the ONE run described in `next_discriminator`
  above, with its five pre-registered branches -- this agent cannot run `pnpm tauri:dev` or open
  a browser console itself.

<!-- SUPERSEDING BLOCK 2026-08-02T07:45:00 -- everything below this block, INCLUDING the
     2026-08-02T07:40:00 block, is now HISTORICAL reasoning trail. This block SYNTHESIZES both of
     the two separate developer replies that arrived after the 2026-08-02T07:20:00 checkpoint --
     the Resource Timing capture (Evidence 2026-08-02T07:30:00/07:35:00/07:37:00, already folded
     into the 2026-08-02T07:40:00 block below) and a SECOND, independent reply carrying the full
     GAMELIB-DIAG `configuredTimeoutMs` correction (Evidence 2026-08-02T07:40:00). Read THIS block
     first; nothing in it changes the standing checkpoint ask, only confirms it. -->

second_reply_synthesized: |
  A second, separate developer reply arrived alongside the one already folded into the
  2026-08-02T07:40:00 block below. It carried a full `[GAMELIB-DIAG]` array (not Resource Timing)
  with `configuredTimeoutMs` now directly observed for every same-origin sibling request -- all
  exactly 10000ms. Full raw data + reasoning: Evidence 2026-08-02T07:40:00.

  This RETRACTS the "tighter timeout on this specific endpoint" framing carried since Evidence
  2026-08-02T07:00:30 (the third candidate mechanism's timeout-budget half): there is no shorter
  budget on `/id/api/email/exists` specifically -- every same-origin `/id/api/*` XHR shares the
  identical 10000ms constant. The successful siblings simply answer fast (245-367ms, ~3% of
  budget); email/exists consumed the FULL budget and got no response at all. This STRENGTHENS
  candidate mechanism 2 (stale pooled-connection reuse) relative to a generic "slowness" reading --
  a pure slowness mechanism would need to make this one request ~40x slower than same-budget
  siblings while leaving every one of them untouched -- and CORROBORATES, without yet confirming,
  the Resource Timing reply's own Branch A read (`connectStart===connectEnd` on every same-origin
  entry, the reused-connection signature) already recorded in the 07:40:00 block below.

  NEITHER reply supplies the crux row: both were captured pre-submission, so `configuredTimeoutMs`
  and connect-phase timing for the `/id/api/email/exists` request ITSELF remain uncaptured by
  either instrument. Both replies converge on exactly the same outstanding ask -- a post-failure
  capture of both instruments together -- which the 07:40:00 block below already re-issued as a
  live-hardware checkpoint before this second reply was folded in. NOTHING in `next_discriminator`
  below needs to change as a result of this reply: it already asks for `configuredTimeoutMs` on the
  email/exists send record AND the Resource Timing query, run together, post-failure. This block
  adds no new ask -- it confirms the existing one is sufficient for both replies' remaining gaps and
  carries the corrected candidate-mechanism framing forward.

  candidate_mechanisms status, restated precisely after both replies: candidate 1 (HTTP/3) --
  FALSIFIED (Evidence 2026-08-02T07:30:00). Candidate 2 (stale pooled connection) -- SUPPORTED BY
  TWO INDEPENDENT REPLIES, STILL NOT CONFIRMED (needs the post-failure row from either instrument).
  Candidate 3 (TLS resumption) -- untested, residual fallback only. Candidate 4 (body size) --
  weakened further: this reply shows the failure is not merely slow-and-clipped by a request-size
  effect, it never responds at all, which fits a dead-connection story more than an upload-duration
  story, though not yet ruled out on its own terms.

next_action: |
  NO SOURCE EDIT THIS CYCLE. NO NEW CHECKPOINT NEEDED BEYOND THE ONE ALREADY STANDING: the
  2026-08-02T07:40:00 block's `next_discriminator` (post-failure capture, both instruments, exact
  commands and branches already specified) remains the correct and sufficient next test for both
  replies' shared outstanding gap. Re-affirming it here rather than duplicating it. HOLD unchanged:
  `USER_AGENTS`/`EPIC_LOGIN_URL`/`matchOAuthRedirect` untouched; plans 34.5-29/30/31 remain HALTED;
  no fix proposed or authorized this cycle, per the developer's own instruction (`intervention_surface_honesty`,
  07:40:00 block) to not propose one until Branch A is confirmed or contradicted.

  Dispatching the SAME live-hardware checkpoint already described in the 2026-08-02T07:40:00
  block's `next_discriminator` -- this agent cannot run `pnpm tauri:dev` or open a browser console
  itself, and the ask has not changed.

<!-- SUPERSEDING BLOCK 2026-08-02T07:40:00 -- everything below this block, INCLUDING the
     2026-08-02T07:20:00 block, is now HISTORICAL reasoning trail. That block's
     `next_discriminator` WAS partially run on hardware; the result is recorded at Evidence
     2026-08-02T07:30:00/07:35:00/07:37:00 -- Branch B FALSIFIED, Branch A SUPPORTED BUT NOT YET
     CONFIRMED (capture was pre-failure). Read THIS block first. -->

result_this_cycle: |
  Two pure console reads were requested (2026-08-02T07:20:00 block below): the shipped
  `window.__GAMELIB_DIAG__` dump and a NEW Resource Timing API query. Only the Resource Timing
  result came back this cycle, and it is a PARTIAL/pre-submission capture (same sequencing gap as
  an earlier attempt, flagged by the developer, not newly discovered). Full raw data + reasoning:
  Evidence 2026-08-02T07:30:00.

  BRANCH B (HTTP/3) -- FALSIFIED. Every same-origin `/id/api/*` entry reports
  `nextHopProtocol: "http/1.1"`. QUIC/HTTP-3 stack instability is removed from the candidate list
  for this endpoint family.

  BRANCH A (stale pooled connection reuse) -- SUPPORTED, NOT CONFIRMED. Every same-origin entry
  shows a zero-duration connect phase (`connectStart === connectEnd === secureStart === startTime`),
  consistent with heavy HTTP/1.1 keep-alive pooling -- the precondition the stale-pool theory needs
  to be plausible at all. This is NOT yet a direct before/after contrast on the failing request
  itself: the capture contains no `/id/api/email/exists` row (taken before the failure), so neither
  half of the decisive test (does the failing request show the same reused-connection signature? does
  a request issued AFTER the failure show a fresh handshake, evidencing pool teardown/rebuild?) has
  been observed yet.

intervention_surface_honesty: |
  Per the developer's explicit instruction #2, stated BEFORE any fix is proposed (full reasoning:
  Evidence 2026-08-02T07:35:00): if Branch A confirms, there is likely NO clean fix at the actual
  root-cause layer reachable from this codebase. Neither `src-tauri/`'s `WebviewWindowBuilder` API
  nor an injected `fetch`/`XMLHttpRequest` wrapper exposes any control over WKWebView's/CFNetwork's
  connection-pool lifecycle -- that configuration lives inside WebKit's own networking process,
  entirely outside anything Tauri/wry surfaces to this project. The one mitigation surface this
  codebase could plausibly reach is an application-level workaround: an injected script that
  detects the specific failure shape on `/id/api/email/exists` and issues one transparent retry,
  mirroring the retry behavior Epic's OWN code already performs successfully for its other
  endpoints. This is NOT proposed as a fix this cycle -- it is UNDESIGNED and UNAUTHORIZED, named
  only for the record per the developer's ask, in case Branch A confirms and a decision on it is
  needed later. It would paper over the mechanism, not fix it.

electron_control_arm_implication: |
  IF Branch A later confirms, it supplies a more specific candidate explanation for
  `34.5-G6-EPIC-DISCRIMINATOR-2.md`'s `verdict: E1` than anything on record to date, SCOPED TO THE
  PRE-AUTH half only (full reasoning + verbatim E1 quote, cross-referenced without modifying that
  frozen file: Evidence 2026-08-02T07:37:00). A CFNetwork-specific stale-pooled-connection behavior
  is WKWebView-specific by construction -- Chromium's networking stack does not share CFNetwork's
  code path or its `NSURLErrorNetworkConnectionLost` failure mode -- so under an identical UA and
  identical URL, this mechanism alone would fully explain the Tauri-fails/Electron-works asymmetry
  E1 names, without requiring anything else to differ. This is a DIFFERENT mechanism from the
  already-fully-confirmed POST-AUTH root cause (`Resolution.root_cause` -- silent navigation
  refusal, unrelated to connection pooling); the two are not merged. NOT claimed as confirmed --
  only as the explanatory weight it would carry if Branch A is confirmed by the still-pending
  post-failure capture.

next_discriminator: |
  STILL A PURE READ, NO SOURCE EDIT -- same process constraint as the immediately prior cycle
  (no `src-tauri/` edits while a live hardware session may be open; nothing here needs building or
  restarting). Same truthful-Safari-UA configuration as before. This is a RE-ISSUE of the
  post-failure capture already requested by the developer and not yet in hand -- not a new ask, made
  explicit here so it is tracked through this file's own checkpoint mechanism rather than left as an
  informal aside.

  Sequence, precisely: reach logged-out (verify `/id/api/authenticate` = 204), submit a username,
  WAIT for the `xhr.timeout` on `/id/api/email/exists` to actually fire (do not run the query early
  -- the prior two attempts at this exact capture both ran before the failure occurred), THEN
  immediately run:

      JSON.stringify(performance.getEntriesByType('resource').filter(e=>/epicgames\.com/.test(e.name)).map(e=>({name:e.name.replace(/^https?:\/\/[^/]+/,''),proto:e.nextHopProtocol,connectStart:e.connectStart,connectEnd:e.connectEnd,secureStart:e.secureConnectionStart,reqStart:e.requestStart,respStart:e.responseStart,respEnd:e.responseEnd,transferSize:e.transferSize,encodedBodySize:e.encodedBodySize,start:e.startTime,dur:e.duration})))

  and, from the already-shipped diagnostic (no new capture needed):

      JSON.stringify(window.__GAMELIB_DIAG__.map(({kind,id,url,method,status,elapsedMs,configuredTimeoutMs})=>({kind,id,url,method,status,elapsedMs,configuredTimeoutMs})))

  Run the Resource Timing query AS SOON AS POSSIBLE after the timeout fires -- the buffer is finite
  and can evict the relevant entry.

  Pre-registered branches:

  BRANCH A-CONFIRMED: an `/id/api/email/exists` row is present showing the same zero-duration
  connect-phase signature as its healthy same-origin siblings (`connectStart≈connectEnd≈startTime`),
  AND/OR any request issued AFTER the failure shows `connectEnd > connectStart` (a real handshake,
  evidencing the pool was torn down and rebuilt following the dead-connection error). CONFIRMS
  candidate 2 (stale pooled connection reuse). Per `intervention_surface_honesty` above, this does
  NOT authorize implementing the application-level retry workaround -- that remains a separate,
  future decision requiring its own explicit authorization.

  BRANCH A-CONTRADICTED: an `/id/api/email/exists` row is present but shows a MATERIALLY POSITIVE
  `connectEnd - connectStart` (a fresh handshake was attempted and still failed/timed out). This
  argues AGAINST simple pool staleness -- a fresh connection failing points toward candidate 3 (TLS
  session resumption / renegotiation failure) instead, which this file's own instrumentation cannot
  test further without an out-of-band packet capture (mitmproxy/Wireshark) -- flag this to the
  developer explicitly rather than attempting it blind, per the existing Branch D guidance above.

  BRANCH NO-ROW: `/id/api/email/exists` never appears in the Resource Timing entries at all, even
  after the failure (possible if a client-side `xhr.timeout` fires before the network stack ever
  creates a `PerformanceResourceTimingEntry`, or the buffer evicted it). Resource Timing cannot
  resolve Branch A/B/C from this capture in that case; fall back to whether ANY request issued
  immediately after the failure shows a fresh connect phase, as weaker indirect evidence of a pool
  teardown having occurred around the same time. Record verbatim either way; do not force a reading.

  Also record `configuredTimeoutMs` for the `email/exists` send record in the diagnostic dump --
  this is a read of already-shipped instrumentation, not a new capture, and settles the still-INFERRED
  (not OBSERVED) ~10000ms budget from Evidence 2026-08-02T07:15:00.

next_action: |
  NO SOURCE EDIT THIS CYCLE, same as the immediately prior cycle -- honors the standing process
  constraint. No fix implemented or designed beyond the honest, explicitly-not-authorized surface
  statement above, per the developer's instruction #2.

  HOLD, unchanged from every prior cycle this phase: `USER_AGENTS`, `EPIC_LOGIN_URL`,
  `matchOAuthRedirect` untouched; plans 34.5-29/30/31 remain HALTED; the post-auth fix design remains
  authorized-in-principle but procedurally blocked until the pre-auth path is fully understood.

  Dispatching a live-hardware checkpoint re-requesting the post-failure capture in
  `next_discriminator` above -- this agent cannot run `pnpm tauri:dev` or open a browser console
  itself.

<!-- SUPERSEDING BLOCK 2026-08-02T07:20:00 -- everything below this block, INCLUDING the
     2026-08-02T07:10:00 block, is now HISTORICAL reasoning trail. That block's
     `next_discriminator` WAS run on hardware; the result is recorded at Evidence
     2026-08-02T07:15:00/07:15:30 and lands cleanly on the pre-registered BRANCH 3. Read THIS
     block first. -->

branch_3_landed: |
  Confirmed Branch 3 of the prior cycle's `next_discriminator`: connection-loss-shaped failures
  recurred (five xhr.error/NSURLErrorNetworkConnectionLost records on OTHER requests, all
  recovered via Epic's own retry) AND `/id/api/email/exists` (id 26) again produced no HTTP
  status — this time an explicit `xhr.timeout` at elapsedMs 10040, not silent non-response. Full
  raw record + asymmetry table: Evidence 2026-08-02T07:15:00. Per Branch 3's own design, this
  SUPPORTS (does not yet confirm) the third candidate mechanism — a materially short Epic-side
  timeout budget on this specific endpoint colliding with WKWebView connection jitter — as at
  least a necessary contributing cause, and reframes the fix target: a UA change alone would not
  help if this endpoint's timeout budget is the actual bottleneck. Branch 3 explicitly does NOT
  authorize touching `USER_AGENTS` — not done, not planned this cycle.

transient_noise_do_not_chase_RETRACTED: |
  The historical `transient_noise_do_not_chase` block (2026-08-02T06:30:00 block, below) is
  RETRACTED for the pre-auth `/id/api/email/exists` family specifically. Full retraction
  reasoning, quoting the original claim and stating precisely what was wrong: Evidence
  2026-08-02T07:15:30. Short version: the ~10s figure it dismissed as one-off noise is the same
  signature this cycle's run reproduced on the crux request itself (elapsedMs 10040), now
  understood as Epic's own client-side timeout constant becoming visible under intermittent
  WKWebView jitter, not evidence of nothing. The Eliminated section's `WKWEBVIEW-NETWORK-FAILURE`
  entry is UNTOUCHED — it stays correctly scoped to the POST-AUTH `/id/api/redirect` symptom and
  is not reopened by this.

candidate_mechanisms_for_connection_lost_pattern: |
  Per this cycle's explicit instruction: name mechanisms, design a discriminator, do NOT jump to a
  fix. Four candidates, none yet tested against each other:

  1. HTTP/3 (QUIC) instability. If Epic's infra advertises an Alt-Svc HTTP/3 upgrade, WKWebView's
     CFNetwork QUIC stack has known real-world instability (connection migration, UDP path
     changes) that could plausibly produce exactly this connection-lost signature. Discriminator:
     `PerformanceResourceTimingEntry.nextHopProtocol` ("h3" vs "h2" vs "http/1.1") for the failing
     request vs. its recovered siblings in the same run.

  2. Stale pooled-connection reuse. CFNetwork/WKWebView connection pooling could hand a new
     request a half-dead kept-alive socket (idle-timed-out by the server or a NAT/middlebox);
     first write on it fails as connection-lost. This is the mechanistically closest fit to
     "NSURLErrorNetworkConnectionLost" specifically. Discriminator: `connectStart`/`connectEnd` —
     near-equal-to-`startTime` values (~0 duration) indicate a reused pooled connection; a
     materially positive `connectEnd - connectStart` indicates a fresh TCP+TLS handshake. Compare
     the failing request against a request that succeeded on retry immediately after a
     connection-lost failure (the retry, having been forced to re-establish, should show a fresh
     connect phase if this theory is right).

  3. TLS session resumption failure. A resumed session ticket invalidated server-side (key
     rotation) could produce a drop needing full renegotiation. WEAKEST candidate to test from JS
     alone — browsers do not reliably expose a session-resumption-vs-full-handshake signal via
     Resource Timing (a privacy-motivated omission in many engines), so this is a residual
     hypothesis to fall back on ONLY if candidates 1/2/4 are all cleanly ruled out, and would then
     require an external tool (e.g. a local mitmproxy/Wireshark capture) outside this file's
     current live-hardware-checkpoint-only method.

  4. Request body size. Every request that has ever failed WITHOUT recovering in this
     investigation carried a large body (14951, 15695); every connection-lost failure that DID
     recover carried a small body (92-1038, Talon's 972). Real correlation in the data, not yet
     tested as causal. Discriminator: `transferSize`/`encodedBodySize` alongside
     `requestStart`-to-`responseStart`/`responseEnd` timing — if the ~10s is spent mid-upload (a
     large gap between `requestStart` and any response-phase timestamp, scaling with body size)
     that supports size-as-cause; if the failure appears to occur near-immediately after
     `requestStart` regardless of body size, that weakens size and points back at candidates 1/2.

next_discriminator: |
  A PURE READ, NO SOURCE EDIT — satisfies this cycle's new process constraint (no src-tauri/
  edits while a live session may be open) by construction, since nothing needs building or
  restarting for this. Same truthful-Safari-UA configuration as before. On the NEXT live run (or,
  if the session from this cycle's report is still open, immediately in that same window), run
  BOTH of the following in the login window's own console and report the full output:

  1. Confirm the pending datum (no new capture needed, already-shipped instrumentation):
     ```
     JSON.stringify(window.__GAMELIB_DIAG__.map(({kind,id,url,method,status,elapsedMs,configuredTimeoutMs})=>({kind,id,url,method,status,elapsedMs,configuredTimeoutMs})))
     ```
  2. NEW discriminator, Resource Timing API, no instrumentation dependency at all (works on ANY
     page, does not require the DEV_LOGIN_DIAGNOSTIC script to have captured anything):
     ```
     JSON.stringify(performance.getEntriesByType('resource').filter(e=>/epicgames\.com/.test(e.name)).map(e=>({name:e.name.replace(/^https?:\/\/[^/]+/,''),proto:e.nextHopProtocol,connectStart:e.connectStart,connectEnd:e.connectEnd,secureStart:e.secureConnectionStart,reqStart:e.requestStart,respStart:e.responseStart,respEnd:e.responseEnd,transferSize:e.transferSize,encodedBodySize:e.encodedBodySize,start:e.startTime,dur:e.duration})))
     ```
     Run this AS SOON AS POSSIBLE after observing the email/exists failure/timeout in the same
     session — the default resource timing buffer is finite and older entries can be evicted.

  Pre-registered branches:

  BRANCH A — CONNECTION REUSE: the failing `/id/api/email/exists` entry shows
  `connectStart`≈`connectEnd`≈its own `startTime` (no fresh handshake) while a same-run request
  that recovered via retry shows a materially positive `connectEnd - connectStart` on ITS retry
  attempt. SUPPORTS candidate 2 (stale pooled connection). Does not yet name a fix (there is no
  code path in this project that controls WKWebView's connection pooling), but narrows further
  investigation toward whether a manual reconnect/retry-with-fresh-connection strategy on this
  codebase's side could help, or toward filing this as an OS/WebKit-level issue.

  BRANCH B — HTTP/3: the failing request's `nextHopProtocol` differs from its recovered siblings'
  (e.g. "h3" on the failure, "h2"/"http/1.1" on survivors, or vice versa). SUPPORTS candidate 1.
  Would explain why THIS project's WKWebView-hosted flow behaves differently from Electron's
  Chromium-hosted flow even under an identical UA, since QUIC negotiation and stack behavior
  differ materially between engines.

  BRANCH C — SIZE/DURATION SHAPE: `transferSize`/`encodedBodySize` for the failing request is
  large and its `requestStart`-to-response-phase gap consumes most of the ~10s (upload-bound
  shape). SUPPORTS candidate 4. Weakly discriminates 1/2 vs 4 — a large body could still be the
  victim of a connection-reuse or QUIC problem rather than its cause, so this branch alone should
  not be read as ruling those out; look at it jointly with A/B on the SAME request.

  BRANCH D — NO SIGNAL / INDISTINGUISHABLE: protocol, connect-phase, and size/timing shapes are
  all indistinguishable between the failing request and its recovered siblings. Escalates to
  candidate 3 (TLS resumption) by elimination, which this file's own instrumentation cannot test
  further — would need an out-of-band packet capture, a materially different kind of
  investigation from anything done in this file so far, and should be flagged to the developer as
  such rather than attempted blind.

  Also record whether `configuredTimeoutMs` for id 26 confirms the ~10000 inference (ask 1
  above) — this settles the "shorter budget" half of the third candidate mechanism (already
  Evidence-supported by elapsedMs alone) independent of which of A/B/C/D above the network-level
  discriminator lands on. Both questions are useful together but neither blocks the other.

next_action: |
  NO SOURCE EDIT THIS CYCLE — honors the new process constraint from the developer's checkpoint
  (do not touch src-tauri/ while a live hardware session may be open; this cycle's discriminator
  is two pure console reads, one against already-shipped instrumentation, one against the
  browser's own built-in Performance API, neither requiring a rebuild or restart).

  HOLD, unchanged from every prior cycle this phase: `USER_AGENTS`, `EPIC_LOGIN_URL`,
  `matchOAuthRedirect` untouched; plans 34.5-29/30/31 remain HALTED; the post-auth fix design
  remains authorized-in-principle but procedurally blocked until the pre-auth path is fully
  understood (unchanged from the 2026-08-02T06:30:00 block's own `next_action`, still standing).

  Dispatching a live-hardware checkpoint requesting the two console reads in `next_discriminator`
  above — this agent cannot run `pnpm tauri:dev` or open a browser console itself.

<!-- SUPERSEDING BLOCK 2026-08-02T07:10:00 -- everything below this block, INCLUDING the
     2026-08-02T06:30:00 block, is now HISTORICAL reasoning trail. That block's
     `leading_hypothesis_UNTESTED` test WAS run on hardware; the result is recorded at
     Evidence 2026-08-02T07:00:00/07:00:30 and matched NEITHER of its two pre-registered
     branches. Read THIS block first. -->

crux_test_result_this_cycle: |
  The truthful-Safari-UA test from the prior cycle's `leading_hypothesis_UNTESTED` block ran on
  hardware. Neither pre-registered branch (200 confirms fingerprint / 403 falsifies it)
  occurred: `/id/api/email/exists` (id 30) produced an `xhr.timeout`, zero HTTP status ever
  observed, amid a storm of five `NSURLErrorNetworkConnectionLost` failures on OTHER requests in
  the same run, all of which Epic's own code retried and recovered from except this one. Full
  raw record + reasoning: Evidence 2026-08-02T07:00:00 and 2026-08-02T07:00:30. Do NOT read this
  as "the fingerprint hypothesis failed" — it is CONFOUNDED (UA truthfulness AND run noise level
  both changed at once versus the earlier 403 run), not falsified.

reopened_for_pre_auth_only: |
  WKWebView connection instability is REOPENED as an active, unresolved candidate mechanism for
  the PRE-AUTH `/id/api/email/exists` failure specifically — standing ALONGSIDE the
  UA/fingerprint hypothesis, not replacing it. This does NOT reopen or touch the Eliminated
  section's `WKWEBVIEW-NETWORK-FAILURE` entry, which stays correctly scoped and correctly
  eliminated for the POST-AUTH navigation-refusal symptom (a distinct request, a distinct
  symptom, a clean unconfounded elimination run). See Evidence 2026-08-02T07:00:30 for the full
  scope reasoning. A third candidate mechanism was also surfaced and is not yet evidenced either
  way: Epic's own client code may apply no retry / a materially shorter configured timeout
  specifically to `/id/api/email/exists`, independent of UA, making it disproportionately
  vulnerable to whatever connection jitter WKWebView intermittently produces. Instrumentation to
  test this directly (`configuredTimeoutMs` capture) was added this cycle — Evidence
  2026-08-02T07:05:00 — no live observation of it exists yet.

next_discriminator: |
  ONE MORE LIVE RUN, same truthful-Safari-UA configuration as the prior cycle
  (`GAMELIB_OAUTH_UA_LEGENDARY="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15
  (KHTML, like Gecko) Version/17.6 Safari/605.1.15" pnpm tauri:dev`), now carrying the
  `configuredTimeoutMs` capture (Evidence 2026-08-02T07:05:00). Reach logged-out (verify
  `/id/api/authenticate` = 204), submit a username, then read the FULL diagnostic array (not
  filtered to email/exists only this time — that filtering was the ordering mistake in the prior
  run) via:

      JSON.stringify(window.__GAMELIB_DIAG__.map(({kind,id,url,method,status,elapsedMs,configuredTimeoutMs})=>({kind,id,url,method,status,elapsedMs,configuredTimeoutMs})))

  Pre-registered branches, evaluated in this order:

  BRANCH 1 — CLEAN 200: this run shows ZERO `xhr.error`/`xhr.timeout`/connection-lost signal
  anywhere AND `/id/api/email/exists` returns HTTP 200. Fingerprint hypothesis CONFIRMED for
  real this time (unconfounded). Fix: replace `oauthLoginCapture.ts:56`'s `legendary` UA literal
  with a truthful WebKit/macOS string, exactly as
  `readiness_confirmed_this_cycle_no_source_touched` (2026-08-02T06:30:00 block, below) already
  reconnoitred. Proceed to `fix_and_verify`.

  BRANCH 2 — CLEAN 403: this run shows ZERO connection-lost signal anywhere AND
  `/id/api/email/exists` STILL returns 403. Fingerprint hypothesis FALSIFIED (cleanly this time,
  not confounded). Do NOT touch `USER_AGENTS`. The 403 needs a fresh, separate evidence trail —
  candidates not yet explored: a missing/incorrect hCaptcha token on this specific request, a
  session/cookie freshness requirement `/id/api/email/exists` enforces that earlier steps did
  not satisfy, or a Talon (`_tald`) signal specific to this endpoint. Open a new hypothesis
  cycle; do not reuse the fingerprint framing.

  BRANCH 3 — NOISY AGAIN, email/exists times out again: connection-loss-shaped failures recur
  AND `/id/api/email/exists` again produces no HTTP status. Read `configuredTimeoutMs` for id 30
  in this run (compare it against the `elapsedMs` values of sibling requests that recovered via
  retry in the SAME noisy run): a materially short `configuredTimeoutMs` (short relative to
  observed sibling `elapsedMs` under the same noise) SUPPORTS the third candidate mechanism
  (Epic's own tight timeout on this endpoint, colliding with WKWebView jitter, independent of
  UA) as at least a necessary contributing cause — this does not by itself rule the UA question
  in or out, but it reframes the fix target: a UA change alone would not help if this endpoint's
  timeout budget is the actual bottleneck. `configuredTimeoutMs` undefined/absent for id 30 in a
  noisy run narrows nothing new; escalate to a WKWebView-level networking investigation (out of
  this file's current scope) before any further UA-focused test.

  BRANCH 4 — STILL AMBIGUOUS: any outcome not covered above (e.g. noise present but
  email/exists happens to complete with a real status anyway; noise absent but email/exists
  times out anyway with no `configuredTimeoutMs` signal). Record verbatim, do not force it into
  branches 1-3, and design a further-narrowed test before touching any source.

next_action: |
  HOLD on `USER_AGENTS`/`EPIC_LOGIN_URL`/`matchOAuthRedirect` and on the post-auth fix design's
  implementation — both remain exactly where the 2026-08-02T06:30:00 block left them (post-auth
  fix design AUTHORIZED-IN-PRINCIPLE but PROCEDURALLY BLOCKED until the pre-auth path is fully
  understood; see that block's own `next_action`/`deferred_considerations`, both still standing
  and not superseded by anything in this block). This cycle's only source change is the
  `configuredTimeoutMs` diagnostic capture (Evidence 2026-08-02T07:05:00) — dev-gated,
  read-only, verified (`cargo check` 0 errors, `cargo test` 92/0/1-ignored, jest 46/46).

  Dispatching a live-hardware checkpoint requesting the ONE more run described in
  `next_discriminator` above — this agent cannot run `pnpm tauri:dev` itself.

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

readiness_confirmed_this_cycle_no_source_touched: |
  Static-only confirmation, done WHILE WAITING on the developer's truthful-UA live test
  (`leading_hypothesis_UNTESTED` above) — no source file edited, no build/test/compile
  command run. Purpose: be able to act immediately on either branch the moment the developer
  reports back, without a second research round-trip.

  SINGLE SOURCE OF TRUTH for the stock Epic UA, confirmed by direct read:
  `src/backend/sidecar/oauthLoginCapture.ts:55-60`, the `USER_AGENTS` map —
  `legendary: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) EpicGamesLauncher'` is the literal at
  line 56. `resolveUserAgent()` (same file, lines 84-95) returns this literal UNLESS
  `GAMELIB_OAUTH_UA_LEGENDARY` is set to a non-empty/non-whitespace value, in which case it
  returns that override verbatim instead — this is the EXACT, already-shipped diagnostic seam
  the pre-registered truthful-UA test uses; no code change is needed to run that test.

  CONFIRMED PROPAGATION PATH from that TS value to the live webview (direct read,
  `src-tauri/src/main.rs:1789-1808`, the `humble_login_open` arm): the resolved UA string
  crosses the JS->Rust boundary as `args[2]` (a plain invoke argument, not a Rust literal —
  `let user_agent = args.get(2).and_then(|v| v.as_str())...`), then is applied directly via
  `.user_agent(user_agent)` on the `WebviewWindowBuilder` at build time (line 1807), before
  `.build()`. CONSEQUENCE: there is exactly ONE place in the whole codebase a confirmed
  truthful-UA fix would touch for the pre-auth defect —
  `oauthLoginCapture.ts:56`'s `legendary` literal. `main.rs` needs NO change; it already
  applies whatever string it is handed, verbatim, at the correct (build-time, not
  dom-ready-time) point in the login window's lifecycle.

  IF BRANCH 200 (fingerprint hypothesis confirmed): the fix is replacing line 56's literal
  with a truthful WebKit/macOS string carrying real engine tokens (satisfying the ALREADY-
  established `separately_established_and_worth_keeping` requirement above in the same edit —
  a truthful Safari UA inherently carries `AppleWebKit`/`Safari` engine tokens, so this one
  change closes both the engine-token requirement and the fingerprint-consistency fix
  simultaneously; it does not need to be done twice). This satisfies the Constraints section's
  "root cause named with evidence, fix targets that named cause" bar on its own terms — do not
  implement silently; say so explicitly per the constraint's own instruction. Scope stays
  `legendary`-only per `fix_design`'s own scoping rule (do not speculatively touch
  gog/nile/zoom's entries in the same map without independent evidence).

  IF BRANCH 403 (hypothesis falsified): NO source edit follows from this reasoning at all —
  the map/propagation-path reconnaissance above is simply shelved, and a fresh evidence trail
  is needed for the pre-auth 403 (per `pending_question`'s branch_b discipline already
  established for the sibling form-rendering question). Nothing here should be read as
  authorizing an edit in that branch.

  Both branches leave the ALREADY-CONFIRMED post-auth root cause and its `fix_design`
  (WKWebView silent-navigation-refusal, on_navigation exfil pattern) completely untouched and
  still pending its own separate implementation authorization — this reconnaissance is scoped
  to the pre-auth 403 only.

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
  IMPLEMENTED 2026-08-02T19:00:00-20:00:00, under an explicit DEVELOPER OVERRIDE of the
  pre-registered branch-B hold (`Current Focus`, `developer_override_2026_08_02T19_00_00`) --
  IMPLEMENTED BUT NOT LIVE-VERIFIED (see `verification` below; do not read this entry as
  closure). Exactly the two mechanisms the FIX DESIGN block specifies, unchanged in shape:

  1. Rust `on_navigation` exfil intercept (`src-tauri/src/main.rs`, `humble_login_open` arm):
     a single `.on_navigation(move |nav_url| {...})` closure added to the SAME
     `WebviewWindowBuilder` chain that already carries `.on_page_load(...)` for this arm's
     shared login window. Matches ONLY a new, dedicated `OAUTH_REDIRECT_EXFIL_HOST`
     (`gamelib-oauth-redirect.invalid`) -- deliberately DISTINCT from `humble_reveal_post`'s
     `REVEAL_EXFIL_HOST` to avoid any collision between this arm's long-lived, VISIBLE, shared
     login window and the hidden, short-lived windows that constant's own arms build. On a
     match: extracts the `data` query param, parses it, and relays Epic's own literal
     `redirectUrl` value (unmodified) into the SAME `LOGIN_WINDOW_EVENTS` queue via the SAME
     `push_login_window_event` helper the `on_page_load` hook already feeds -- then cancels
     (`return false`), mirroring `humble_reveal_post`'s own cancellation discipline. For every
     other host, returns `true` unconditionally, so no real page navigation (including
     legitimate same-origin or third-party iframe navigation) is affected. Scoping to Epic
     only (`is_epic_login`, computed from the validated open URL's host against a new
     `EPIC_LOGIN_HOST` constant, since `LoginWindowSeam.open()` carries no `runner` argument)
     governs ONLY the new production script's injection (mechanism 2) -- the `.on_navigation`
     hook itself is attached unconditionally to every runner's window, since it is inert for
     every host except the new dedicated exfil host no other runner's page will ever navigate
     to.

  2. New production (non-debug-gated) in-page response observer,
     `epic_oauth_redirect_observer_script` (`src-tauri/src/main.rs`), injected as an
     `initialization_script()` ONLY when `is_epic_login` is true -- a SEPARATE function from,
     never a reuse or extension of, the pre-existing `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT` (which
     stays dev-only, gated behind `GAMELIB_LOGIN_DIAG`, default off). Wraps `window.fetch`
     once, always calling through to the true original implementation and returning its exact
     promise unmodified; attaches a SEPARATE `.then()`/`.catch()` chain to that original
     promise (`res.clone()` before any body read) scoped narrowly to responses whose pathname
     is EXACTLY `/id/api/redirect` and whose status is `200`. On a JSON body carrying a
     non-empty string `redirectUrl`, triggers the exfil navigation
     (`location.href` to `OAUTH_REDIRECT_EXFIL_HOST` with the payload JSON-encoded in the query
     string, `exfil_host` embedded via `serde_json::to_string`, never naive interpolation).
     Fails closed (does nothing) on any other response, non-JSON body, or script error. Built
     via a `concat!` template + `.replace()` (mirrors `clear_storage_script`'s convention, not
     `reveal_post_script`'s `{{`/`}}`-escaping convention) -- every JS string literal uses
     single quotes, satisfying `longRunningChannels.test.ts`'s WR-08 per-line-balanced-`"`-
     count guard (confirmed: this cycle's new code introduces ZERO new WR-08 violations, see
     `verification` below).

  Secret handling (both mechanisms): the `redirectUrl` value never reaches
  `console.log`/`console.warn`/`console.error`, is never written to
  `window.__GAMELIB_DIAG__`, and the Rust `on_navigation` closure has NO `eprintln!` call on
  any path -- it exists only as a transient local in the JS closure and moves through Rust via
  the same `LOGIN_WINDOW_EVENTS` queue nile/gog/zoom already carry real codes through today.
  Re-read in full before finishing: no literal secret/authorization-code value appears
  anywhere in this file's own additions this cycle.

  ONE PRE-EXISTING TEST UPDATED (not new scope, a direct consequence of this fix):
  `src/backend/__tests__/tauriShellSource.test.ts`'s `F-34.5-G6-04` describe block contained a
  blanket NEGATIVE assertion ("the humble_login_open arm contains no `.on_navigation(` call
  anywhere in its own body") that this fix necessarily breaks by design (FIX DESIGN section
  (d) explicitly specifies adding `.on_navigation`). Confirmed via `git stash`
  before/after comparison that this test PASSED at HEAD and only failed once this cycle's
  Rust change was applied (a genuine, expected consequence, not a pre-existing failure).
  NARROWED rather than deleted: the arm may now contain exactly one `.on_navigation(` call,
  but that call's own body must never reference `set_title(`/`current_origin`/`title_origin`
  -- preserving the real anti-phishing invariant (T-34.5-G6-39: origin/title must never be
  driven by `on_navigation`, which also fires for third-party iframes) the original test was
  protecting, rather than the stricter-than-necessary proxy ("no `on_navigation` at all") it
  used to enforce that invariant with.
verification: |
  STATIC/COMPILE/UNIT PROOF ONLY -- explicitly NOT live proof, per this project's own F-10
  lesson ("a green 3447-test suite confirmed nothing about a live-only defect") and per
  `developer_override_2026_08_02T19_00_00` above, which both apply here without exception:

  - `cargo check` (src-tauri): clean, no errors or warnings from this cycle's new code.
  - `cargo test` (src-tauri): 92 passed, 0 failed, 1 ignored (pre-existing ignored test,
    unrelated to this cycle). No new Rust test was added this cycle -- the fix's Rust surface
    (a navigation-intercept closure and a pure script-builder function) is exercised
    end-to-end only by the live gate this cycle cannot run, mirroring
    `reveal_post_script`/`clear_storage_script`'s own precedent of being covered by their
    `#[cfg(test)]` siblings (escaping/embedding correctness) rather than a live-fire unit test
    -- no equivalent embedding test was added for `epic_oauth_redirect_observer_script` this
    cycle; that is itself an additional, undesigned gap, recorded honestly rather than
    silently left implicit.
  - `npx tsc --noEmit`: clean, zero errors. No TypeScript file was touched this cycle (the
    design's own constraint -- `matchOAuthRedirect`, `oauthLoginCapture.ts`, `useTauriOAuthLogin.ts`
    and the `LoginWindowSeam` interface all remain byte-for-byte unchanged).
  - `npm run test:ci`: 3548/3548 passing (+1 from the new `.on_navigation` count/scope test
    added to `tauriShellSource.test.ts` this cycle), ONE known, PRE-EXISTING, UNRELATED
    failure carried over unchanged from baseline: `longRunningChannels.test.ts`'s WR-08
    stripper-integrity guard flags `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`'s own multi-line
    `r#"..."#;` raw-string delimiter lines (index 262/549, identical content and count before
    and after this cycle's changes) -- confirmed via `git stash`/`git stash pop` that this
    exact failure exists at HEAD, untouched by this cycle, and belongs to the SEPARATE, parked
    pre-auth 403 thread's own diagnostic script, not this cycle's scope. Not fixed this cycle;
    not this cycle's defect to fix.

  WHAT WAS NOT PROVEN, named explicitly so no future reader mistakes static proof for live
  proof:
  - FIX DESIGN branch-A step (4), the full live gate (fresh logged-out Epic login completes,
    an already-authenticated session's redirect is captured, library refresh triggers) --
    OWED, not attempted, not partially covered by anything above. Cannot run this cycle: a
    fresh logged-out Epic login is blocked by the SEPARATE, parked pre-auth 403.
  - `U-34.5-06` (Epic's success path end to end,
    `.planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/
    34.5-UNTESTED-ITEMS.md`) STAYS OPEN, unchanged. A new row, `U-34.5-11`, was ADDED this
    cycle for the unverified exfil mechanism specifically -- it shares `U-34.5-06`'s own
    live-session blocker and is expected to retire together with it, not independently. No
    existing row in that ledger was closed, retired, or modified.
  - Finding `F-34.5-G6-01` does NOT close. Phase 34.5 does NOT close. This file's own
    `status` frontmatter reflects "implemented, static-only, live gate owed" -- deliberately
    NOT any value implying closure.
  - The standing rule in `deferred_considerations` REMAINS IN FORCE, unchanged: "NO FIX SHIPS
    UNTIL THE LOGGED-OUT PATH HAS BEEN OBSERVED WORKING END TO END ON REAL HARDWARE." This
    cycle satisfies half of condition (1) (implemented, not verified) and does not touch
    condition (2) at all (still blocked by the parked pre-auth 403). Neither condition is
    closed; the finding as a whole is not closed.
  - NEW RISK, not evaluated live either way this cycle: the production observer script wraps
    `window.fetch` using the same technique this investigation's own suspect-for-the-403
    diagnostic uses (see `Current Focus`, `developer_override_2026_08_02T19_00_00`, and this
    fix's own doc comment in `main.rs`). Whether this makes the pre-auth 403 more likely, less
    likely, or unaffected for Epic specifically is UNKNOWN and must be checked first when the
    live gate this cycle could not run is eventually attempted.
files_changed:
  - src-tauri/src/main.rs (added `OAUTH_REDIRECT_EXFIL_HOST`, `EPIC_LOGIN_HOST`,
    `epic_oauth_redirect_observer_script()`; added `is_epic_login` computation, the
    `.on_navigation` exfil-intercept closure, and the Epic-only production script injection to
    the `humble_login_open` arm)
  - src/backend/__tests__/tauriShellSource.test.ts (narrowed the F-34.5-G6-04 NEGATIVE
    `.on_navigation` guard to preserve its real anti-phishing invariant rather than a stricter
    blanket-absence proxy; added a companion "exactly one `.on_navigation(` call" test)
  - .planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/
    34.5-UNTESTED-ITEMS.md (added new OPEN row `U-34.5-11`; no existing row touched)
  - .planning/debug/epic-login-non-interactive.md (this file -- developer-override
    superseding block, structured reasoning checkpoint, and this Resolution update)

---

## Resolution -- PRE-AUTH structural-fingerprint fix (SEPARATE from the POST-AUTH entry above)

<!-- This subsection is for the DIFFERENT, PRE-AUTH Talon-403 candidate fix implemented
     2026-08-03, under user decision "OPTION A -- Continue" (Current Focus,
     reasoning_checkpoint_2026_08_03T02_00_00). Deliberately kept SEPARATE from the
     POST-AUTH `root_cause`/`fix`/`verification`/`files_changed` entries immediately above --
     do NOT blend the two. Neither entry supersedes the other; they are two independent,
     still-separately-unverified fixes for two different defects in the same login flow. -->

root_cause_pre_auth_fingerprint: |
  NOT CONFIRMED -- this is a HYPOTHESIS, not a confirmed root cause, and this cycle's own
  status reflects that honestly (`IMPLEMENTED-BUT-NOT-LIVE-VERIFIED`, not `CONFIRMED`). The
  2026-08-03T01:00:00 3-arm control test (Tauri vs Electron vs Safari.app) found two
  structural DOM/BOM properties unique to Tauri's WKWebView among all three arms:
  `window.outerWidth`/`window.outerHeight` == `[0, 0]` (real browsers never report this while
  rendering interactively), and `window.alert`/`window.confirm` reassigned by
  `tauri_plugin_dialog::init()` to IPC-routed functions, `confirm` specifically an
  `async function` (structurally impossible for the real, synchronous `window.confirm` DOM
  API). Both are candidate contributing signals to Epic's Talon anti-bot service rejecting
  the pre-auth page load with an HTTP 403 at `/id/api/email/exists` (and, per this
  investigation's trigger, potentially at `/v1/init`/`/v1/init/execute`). See
  `reasoning_checkpoint_2026_08_03T02_00_00` in Current Focus for the full evidence chain,
  falsification test, and named blind spots -- this entry does not repeat that detail.
fix_pre_auth_fingerprint: |
  IMPLEMENTED 2026-08-03, under user decision "OPTION A -- Continue" (explicit, dated,
  relayed via session coordinator). A new, independently-named, independently-attributable
  production script -- `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT` (`src-tauri/src/main.rs`) --
  injected via a SEPARATE `.initialization_script()` call on the Epic login
  `WebviewWindowBuilder`, gated by the SAME pre-existing `is_epic_login` check the post-auth
  fix's `epic_oauth_redirect_observer_script` already uses. Deliberately NOT merged into that
  script, NOT sharing a helper, and textually distinct (different name, different
  content/mechanism, no shared constants) -- per the user's own explicit instruction, so a
  future live-test result (403 clears or does not) can be attributed to ONE of the two
  scripts, never both at once.

  Two corrections, matching the two surviving candidates exactly:
  1. `Object.defineProperty(window, 'outerWidth'/'outerHeight', { get: () => window.inner*,
     configurable: true })` -- mirrors outer dimensions to inner (zero visual chrome), not
     naive assignment (which would silently no-op since these read as getters under Tauri).
  2. A `Function.prototype.toString` patch (`WeakMap`-keyed, the standard fingerprint-evasion
     technique) that makes `window.alert`/`window.confirm` -- WHATEVER THEY CURRENTLY ARE,
     already clobbered by `tauri_plugin_dialog`'s own init script by the time this script
     runs -- report `function alert() { [native code] }` / `function confirm() { [native
     code] }` when stringified. Does NOT reassign `window.alert`/`window.confirm` themselves
     (confirmed by a dedicated test asserting neither `window.alert = ` nor
     `window.confirm = ` appears in the script) -- only their `.toString()` IDENTITY changes;
     their real (IPC-routed) call behavior is completely untouched, so nothing elsewhere in
     the app that depends on that call path is affected.

  Option (a) from the implementation guidance ("prevent `tauri_plugin_dialog::init()` from
  touching this window") was RULED OUT, not silently skipped: direct read of vendored
  `tauri-2.11.5/src/manager/webview.rs`'s `prepare_pending_webview` confirms plugin init
  scripts are placed into `all_initialization_scripts` BEFORE this window's own
  `webview_attributes.initialization_scripts` is appended, and there is no per-window
  opt-out for a registered plugin's init script -- disabling the plugin app-wide would
  remove the app's own native-dialog feature for the "main" window (out of scope, and a
  functional regression this cycle must not introduce). Option (b) (`.toString()` shim) was
  therefore the only available lever, and is what was built.

  Every block in the new script is independently try/caught (mirrors
  `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`/`epic_oauth_redirect_observer_script`'s own
  non-interference discipline) -- one failing property patch cannot take down the page or
  the other patch. Touches no network primitive, no request/response, no cookie, no
  credential-shaped value at all -- entirely orthogonal to
  `epic_oauth_redirect_observer_script`'s `window.fetch` wrapping. Built as a plain `concat!`
  `&'static str` (no runtime substitution needed) using single-quoted JS strings exclusively,
  satisfying `longRunningChannels.test.ts`'s WR-08 per-line-balanced-`"`-count guard the same
  way `epic_oauth_redirect_observer_script`'s own template does (confirmed directly this
  cycle -- see `verification_pre_auth_fingerprint` below).
verification_pre_auth_fingerprint: |
  STATIC/COMPILE/UNIT PROOF ONLY -- explicitly NOT live proof, per this project's own F-10
  lesson ("a green test suite confirmed nothing about a live-only defect"). IMPLEMENTED BUT
  NOT LIVE-VERIFIED. Do not read anything below as evidence the pre-auth 403 is fixed.

  - `cargo check` (src-tauri): clean, no errors or warnings from this cycle's new code.
  - `cargo test` (src-tauri): 97 passed, 0 failed, 1 ignored (the same pre-existing ignored
    test as the post-auth cycle, unrelated). FOUR new tests added this cycle, all passing,
    pinning: (1) both `outerWidth`/`outerHeight` use `Object.defineProperty` mirroring
    `innerWidth`/`innerHeight`; (2) the alert/confirm fix patches
    `Function.prototype.toString` ONLY and never reassigns `window.alert`/`window.confirm`
    themselves; (3) every block is independently try/caught and the script never touches
    `fetch`/`XMLHttpRequest`; (4) the script contains zero `"` characters (WR-08-safe
    construction, single-quoted JS only).
  - `npx tsc --noEmit`: clean, zero errors. No TypeScript file touched this cycle.
  - `npm run test:ci`: 187/187 suites, 3646/3646 tests passing, ZERO failures -- including
    `longRunningChannels.test.ts`'s WR-08 stripper-integrity guard, run directly and
    confirmed passing on its own (`the real file: every line of the stripped output has a
    balanced (even) "-count` -- PASS). Note for the record: the post-auth fix cycle's own
    `verification` entry (immediately above) recorded ONE known, pre-existing WR-08 failure
    on `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`'s raw-string delimiter lines at that time; this
    cycle's full run shows that failure NOT present (187/187 suites green, no WR-08 failure
    of any kind). Recorded honestly rather than silently assumed away: this could mean an
    intervening cycle fixed it, or the failure was environment/flake-specific to that run --
    this cycle did not investigate which, since it is outside this cycle's scope and the
    suite is unambiguously green now regardless of the earlier note's cause.

  WHAT WAS NOT PROVEN, named explicitly so no future reader mistakes static proof for live
  proof:
  - Whether the pre-auth 403 actually clears for a genuinely logged-out Epic user under
    `pnpm tauri:dev` -- OWED, this cycle's own CHECKPOINT below collects that result.
  - Whether `outerWidth`/`outerHeight` and/or `alert`/`confirm` were ever the load-bearing
    signal for Talon's decision at all, versus TLS/JA3/header-ordering or the separately-open
    `epic_oauth_redirect_observer_script` question -- the falsification test in
    `reasoning_checkpoint_2026_08_03T02_00_00` is what will answer this, not this entry.
  - Whether `window.confirm.constructor.name` (still `AsyncFunction`, unpatched) matters to
    Talon's check -- named as an explicit blind spot, not silently assumed irrelevant.
  - `F-34.5-G6-01` does NOT close. Phase 34.5 does NOT close. No `34.5-UNTESTED-ITEMS.md` row
    is closed by this entry. The SEPARATE, still-owed post-auth live-gate checkpoint (already-
    authenticated Epic session) is UNCHANGED and UNTOUCHED by this cycle's work.
files_changed_pre_auth_fingerprint:
  - src-tauri/src/main.rs (added `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT` const and its injection
    into the `humble_login_open` arm's Epic-only `is_epic_login` branch, alongside but
    textually separate from `epic_oauth_redirect_observer_script`'s own injection; added four
    new `#[cfg(test)]` tests pinning the new const's shape)
  - .planning/debug/epic-login-non-interactive.md (this file -- structured reasoning
    checkpoint and this separate Resolution subsection)

live_verification_pre_auth_2026_08_03T17_00_00: |
  LIVE-VERIFIED, PASSED. This entry does NOT retroactively confirm
  `root_cause_pre_auth_fingerprint`'s two named candidate signals (`outerWidth`/`outerHeight`,
  `alert`/`confirm` `.toString()`) as the true mechanism Talon's check reads -- that question
  is now MOOT rather than answered, because the resolution path taken was the OPTION 1
  ROUTING PIVOT (`reasoning_checkpoint_2026_08_03T15_00_00`, Current Focus), not the
  fingerprint shim. `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT` remains implemented in source,
  still never live-exercised on its own (it is dead code on the Epic-under-Tauri path now
  that the embedded route is unreachable via routing rather than defeated via mitigation) --
  see `deferred_cleanup_reconciliation_2026_08_03T17_00_00` below for its disposition.

  What was actually live-verified this cycle, relayed by the session coordinator, user's
  exact confirmation "confirmed fixed" (full detail in the superseding Current Focus block
  below, `live_gate_result_2026_08_03T17_00_00`): under `pnpm tauri:dev`, Epic's tile now
  surfaces SIDLogin only -- the embedded 403 path is unreachable for Epic under Tauri, not
  merely hidden by default; the real system browser opens; a genuine logged-out Epic login
  completes there; the pasted authorization code runs `epic.login(sid)`; Epic's library
  actually populates in the app afterward. This satisfies the close criterion this debug
  session itself set for `F-34.5-G6-01`'s pre-auth arm
  (`live_verification_requirements_2026_08_03T10_00_00`, Current Focus, checkpoint items
  1-4).

  ROOT CAUSE, for the record, restated as CONFIRMED (not merely hypothesized) now that a
  structural fix eliminating its only trigger path has live-verified: Tauri unconditionally
  injects a JS-observable global surface into every WKWebView (`window.isTauri`,
  `window.__TAURI_INTERNALS__`, `window.ipc`, plugin globals); `window.isTauri` specifically
  is proven non-configurable AND non-writable, hence permanently unmaskable from page JS by
  any technique (delete, reassignment, Proxy) -- matching this file's own
  `descriptor_findings_2026_08_03T09_00_00` (Current Focus). Epic's Talon anti-bot
  fingerprints this surface and rejects the login before it can complete under the embedded
  webview.

  RESOLUTION, for the record: pivot Epic's login under Tauri to SIDLogin (system-browser
  auth, no WKWebView involved, structurally immune to this fingerprint class) -- OPTION 1,
  implemented `reasoning_checkpoint_2026_08_03T15_00_00`/`scope_executed_2026_08_03T15_00_00`
  (Current Focus), now LIVE-VERIFIED.

  STATUS: F-34.5-G6-01's pre-auth arm is RESOLVED. `F-34.5-G6-01` as a whole and Phase 34.5
  do NOT close this cycle -- two reconciliation items remain open, tracked explicitly in
  `deferred_cleanup_reconciliation_2026_08_03T17_00_00` below and in the superseding Current
  Focus block. This cycle performed documentation/bookkeeping only: no source file was
  edited, nothing was committed, per explicit scope limits relayed by the session
  coordinator.

deferred_cleanup_reconciliation_2026_08_03T17_00_00: |
  Two loose ends flagged by `scope_executed_2026_08_03T15_00_00` item 3 and this file's own
  `next_action` entries across the 15:00:00 and 16:00:00 Current Focus blocks. Both are now
  SAFE TO ACT ON given the live-gate pass above, but NEITHER WAS ACTIONED THIS CYCLE --
  recorded here explicitly so they are not silently dropped.

  1. DEFERRED DEAD-CODE CLEANUP (not done this cycle): `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT`
     (this subsection's own `fix_pre_auth_fingerprint`), `epic_oauth_redirect_observer_script`
     (the SEPARATE post-auth Resolution entry's `fix`, immediately above this `---` divider),
     and the Epic-specific `.on_navigation` match arm's `OAUTH_REDIRECT_EXFIL_HOST` intercept
     (same post-auth entry) are all still marked "PENDING REMOVAL once the SIDLogin pivot is
     live-verified" in source (`resume_ground_truth_2026_08_03T16_00_00` item (c), Current
     Focus -- comment added, behavior unchanged). That precondition is now satisfied: the
     SIDLogin pivot IS live-verified (this entry, above). All three are SAFE to remove in a
     follow-up cycle -- the embedded Epic login path they exist to serve/mitigate is retired
     and structurally unreachable under Tauri (routing change,
     `scope_executed_2026_08_03T15_00_00` item 1). NOT removed this cycle: this cycle is
     documentation-only, no source edits authorized.

  2. `34.5-UNTESTED-ITEMS.md` LEDGER / POST-AUTH LIVE-GATE CHECKPOINT DISPOSITION: rows
     `U-34.5-06` ("Epic's success path end to end") and `U-34.5-11` ("The Epic OAuth-redirect-
     capture exfil mechanism ... actually delivering a captured redirect code end to end"),
     both `.planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/
     34.5-UNTESTED-ITEMS.md`, both currently **OPEN**, both explicitly noted in their own
     "Retires together with [the other] or not at all" clause (confirmed by direct read of
     both rows' full text this cycle, ledger file untouched). The mechanism both rows describe
     -- an already-authenticated embedded Epic WKWebView session's OAuth redirect being
     captured via `.on_navigation`/`epic_oauth_redirect_observer_script` -- is now MOOT FOR
     EPIC SPECIFICALLY: the SIDLogin pivot means there is no more embedded Epic login session,
     authenticated or otherwise, for that exfil mechanism to ever capture a redirect from.
     Epic's real auth flow now runs entirely in the system browser (SIDLogin), never in the
     Tauri-managed WKWebView those rows' own capture criteria describe ("a live `pnpm
     tauri:dev` session in which a real Epic login reaches `runner=legendary status=captured`"
     -- that specific runner=legendary embedded-webview code path is retired, not exercised,
     by the pivot). DISPOSITION, recorded explicitly per the coordinator's instruction:
     superseded by the SIDLogin pivot, no longer applicable to Epic. NOT closed as
     PASSED/VERIFIED (they never ran and never will run via the embedded path) -- the correct
     ledger treatment is retire-as-superseded/no-longer-applicable, with a note pointing to
     this debug session and the routing pivot, not a silent pass. The ledger file itself was
     NOT edited this cycle (read-only per explicit scope limit) -- this is a follow-up-cycle
     action item, not performed here. `.on_navigation`/`epic_oauth_redirect_observer_script`
     remain live in source pending the dead-code removal in item 1 above; their mootness for
     Epic does not retroactively make them wrong or unshippable for any hypothetical future
     runner reusing the same `humble_login_open` arm -- it only means Epic itself no longer
     exercises them.

resolution_direction_pre_auth_2026_08_03T10_00_00: |
  APPENDED, does not overwrite `root_cause_pre_auth_fingerprint`/`fix_pre_auth_fingerprint`/
  `verification_pre_auth_fingerprint` above -- those remain the honest record of the
  outerWidth/outerHeight + alert/confirm `.toString()` shim HYPOTHESIS and its
  implemented-but-not-live-verified fix, which is now SUPERSEDED IN PRIORITY (not falsified, not
  reverted) by the descriptor-analysis finding below.

  Per `descriptor_findings_2026_08_03T09_00_00`/`recommendation_2026_08_03T09_00_00` and
  `established_resolution_direction_pre_auth_2026_08_03T10_00_00` (Current Focus, this cycle):
  three of the eleven Tauri-unique JS-surface globals surviving every prior mitigation attempt --
  `window.ipc`, `window.isTauri`, `window.__TAURI_INTERNALS__` -- are PROVEN, by direct
  primary-source property-descriptor reads (tauri-2.11.5, wry-0.55.1) AND by this
  investigation's own live delete/reassign diagnostic, to be PERMANENTLY UNMASKABLE from page JS.
  `window.isTauri` in particular is Tauri's own purpose-built detection flag and the strongest
  candidate for whatever Talon's anti-bot check actually reads. CONCLUSION: no JS-layer mitigation
  (this shim included) can be proven sufficient, and a mitigation-only strategy has a real,
  structural ceiling. CHOSEN DIRECTION (user decision, 2026-08-03, option ii): pivot Epic login to
  SIDLogin (system-browser auth), which sidesteps the fingerprinting question entirely rather than
  attempting to win it. This does NOT retroactively mark `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT` as
  wrong or harmful -- it remains a plausible, still-untested-live, narrower mitigation; it is
  simply no longer the primary resolution path. `F-34.5-G6-01`/Phase 34.5 remain OPEN; this is a
  chosen direction pending implementation and live verification, not a closure.

---

## EXPERIMENTAL/THROWAWAY -- deletion-diagnostic (pre-auth 403 investigation, 2026-08-03, user decision OPTION C)

<!-- THIS SECTION IS NOT A FIX. It documents a THROWAWAY, instrumented diagnostic built to
     answer an open question before committing to either a real shipped mitigation (option A)
     or SIDLogin (option B). Deliberately kept SEPARATE from both real `Resolution` entries
     above -- do NOT blend them. Do NOT read anything below as evidence the 403 is fixed or
     that deleting Tauri's JS surface is safe to ship. Remove or replace this section (and the
     Rust code it describes) once the live result is known. -->

experiment_summary: |
  Built under user decision OPTION C, relayed via session coordinator: build a narrow,
  throwaway, instrumented diagnostic BEFORE committing to any shipped mitigation. The
  diagnostic does two things at once, in a SEPARATE, distinctly-named script from all three
  existing login-window scripts: (1) deletes the surviving Tauri-unique fingerprint surface
  identified by the 2026-08-03T07:00:00 3-arm dump, and (2) instruments the login window's own
  native lifecycle/capture hooks (already-shipped `on_navigation`, `on_page_load`,
  `on_window_event(Destroyed)`) with Rust-log markers so a live run can prove -- not assume --
  whether those hooks still fire after the deletion.

reasoning_checkpoint:
  hypothesis: |
    THIS IS A DIAGNOSTIC EXPERIMENT, NOT A CONFIRMED FIX HYPOTHESIS -- no claim is made that
    deleting the Tauri JS/IPC surface resolves the pre-auth 403 or is safe to ship. The
    experiment tests two independent things at once: (a) IF Talon's pre-auth fingerprint check
    keys off the surviving Tauri-unique JS/IPC surface (`window.__TAURI__`,
    `window.__TAURI_INTERNALS__`, `window.isTauri`, `window.ipc`, the 8
    `__TAURI_PLUGIN_*`/`__TAURI_IIFE__` keys, non-native `window.Notification`), THEN deleting
    that surface at document-start (after Tauri's own injection, in the guaranteed-last
    app-script slot) should change the pre-auth 403 outcome; (b) INDEPENDENTLY of (a), the
    login window's own native capture mechanisms (`on_navigation`, `on_page_load`,
    `on_window_event(Destroyed)`, the OAuth-redirect exfil path) do not depend on any of the
    deleted globals per Q2's static finding, and should continue to fire exactly as before the
    deletion.
  confirming_evidence:
    - "Q1 (injection order, `tauri-2.11.5/src/manager/webview.rs::prepare_pending_webview`,
       lines 122-224, direct source read this cycle and the prior cycle): app-registered
       `.initialization_script()` calls run strictly AFTER Tauri's core bootstrap and every
       plugin's init script, in the exact order this file calls `.initialization_script()` --
       so registering the new script LAST in this arm's builder chain (after
       `epic_oauth_redirect_observer_script` and `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT`)
       guarantees it deletes the FULLY-injected surface rather than racing it, and inherits the
       fingerprint shim's already-applied outerWidth/outerHeight/alert/confirm patches for
       free, without duplicating that logic."
    - "Q2 (dependency check, direct re-read this cycle of the humble_login_open arm's own
       on_navigation/on_page_load/on_window_event(Destroyed) bodies, both before and after this
       cycle's edits): none of these three native Rust hooks reference
       window.ipc/__TAURI_INTERNALS__/__TAURI__ anywhere in their own bodies -- they are
       WKWebView-delegate-level callbacks that fire regardless of page-JS state. Grep of the
       arm's full body for `ipc`/`__TAURI__`/`__TAURI_INTERNALS__` outside the new diagnostic
       script's own const: zero matches in any native hook."
    - "The 2026-08-03T07:00:00 3-arm dump (Current Focus, that timestamp): these properties are
       the ONLY remaining Tauri-unique candidates after outerWidth/outerHeight and
       alert/confirm were already fixed, and alert/confirm's non-native shape was already
       confirmed eliminated LIVE (not just statically) by that same dump."
  falsification_test: |
    Live run with `GAMELIB_LOGIN_DIAG` unset, fresh logged-out Epic session, `pnpm tauri:dev`:
    (a) if `403 (exists)` still fires identically on email submit after this deletion, the
    surviving-JS-surface hypothesis is FALSIFIED for THIS specific candidate set (not
    necessarily for TLS/JA3/header-ordering, which this script does not touch and remain
    untested); (b) INDEPENDENTLY, if any of the four `[epic-deletion-diag]` Rust-log markers
    (`on_navigation fired` / `on_navigation EXFIL-HOST match` / `on_page_load fired` /
    `on_window_event Destroyed fired`) fail to appear where the flow reaches them, Q2's static
    "capture does not depend on these globals" answer is FALSIFIED, and Tauri's own internal
    plumbing DOES depend on something this investigation missed -- a materially different and
    more serious finding than the 403 status alone.
  fix_rationale: |
    N/A -- this is explicitly NOT a fix decision, and none of this cycle's code is a candidate
    fix. It exists solely to produce evidence that will inform the NEXT decision: ship a real,
    hardened deletion mitigation (option A) if the 403 clears and capture stays intact, or
    pursue SIDLogin instead (option B) if it does not, or if the deletion itself proves unsafe
    (breaks the lifecycle hooks, throws new JS errors, or otherwise regresses something this
    investigation did not anticipate).
  blind_spots: |
    Whether Tauri's own internal event-emission/housekeeping (untraced this cycle -- wry's own
    source was not read, same disclosed gap as the 07:00:00 block's Q1 answer) depends on any
    deleted global for something other than this window's four already-shipped hooks. Whether
    replacing `window.Notification` with a throwing shim breaks anything Epic's own page calls
    Notification for (unlikely for a login form, not verified live). Whether the deletion
    itself throws a new JS error this cycle's static read did not predict -- devtools auto-open
    for this window already (existing `#[cfg(debug_assertions)]` behavior, unrelated to this
    cycle), so this is directly observable live but not provable statically. Whether
    TLS/JA3/header-ordering (untouched by this script) is the REAL signal, in which case this
    experiment will read as "inconclusive on the 403, but proves capture is independent of the
    JS surface" rather than closing anything. Whether the ADDITIONAL
    `#[cfg(debug_assertions)]` registration gate this cycle added beyond the user's literal
    "same is_epic_login gate" ask changes anything for the live test -- it should not, since
    `pnpm tauri:dev` is always a debug build, but this divergence from the letter of the
    instruction is disclosed here rather than silently applied.

what_was_built: |
  A new, independently-named, independently-attributable const, `src-tauri/src/main.rs`:
  `EPIC_LOGIN_DELETION_DIAGNOSTIC_SCRIPT` -- distinct from, never a reuse or extension of,
  `epic_oauth_redirect_observer_script`, `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT`, or
  `DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT`. Explicitly labeled THROWAWAY DIAGNOSTIC in its own Rust
  doc comment (`// ==== THROWAWAY DIAGNOSTIC ... ====` banner plus a full doc comment block).

  1. DELETION (document-start, guaranteed-last init-script slot): registered via
     `.initialization_script(EPIC_LOGIN_DELETION_DIAGNOSTIC_SCRIPT)` in the `humble_login_open`
     arm, gated on the SAME `is_epic_login` check `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT` uses, AND
     registered strictly AFTER both `epic_oauth_redirect_observer_script`'s and
     `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT`'s own registration calls in the same builder chain --
     the guaranteed-last slot per Q1's injection-order finding. Deletes exactly the
     2026-08-03T07:00:00 SURVIVES list: `window.__TAURI__`, `window.__TAURI_INTERNALS__`,
     `window.isTauri`, `window.ipc`, and the 8 `__TAURI_PLUGIN_*`-prefixed / `__TAURI_IIFE__`
     keys (`delete` first, `= undefined` fallback if non-configurable). Restores a
     native-looking `window.Notification` via an independent
     `Function.prototype.toString`/`WeakMap` chain that layers on top of (chains to, never
     replaces) whatever `Function.prototype.toString` already is at that point -- the
     fingerprint shim's own already-patched version, since that script runs first by
     registration order. Does NOT re-patch `outerWidth`/`outerHeight`/`alert`/`confirm` itself
     -- those are already applied by `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT` by the time this
     script runs, so duplicating that logic would be redundant, never more correct (pinned by a
     dedicated negative test, see `static_verification` below). Ends with a single
     `console.log`/`console.error` summarizing which properties read as gone/native-looking
     immediately after the script ran (booleans only, never a secret-shaped value) -- a
     convenience self-check, not a substitute for the separately required manual 3-arm dump
     re-run below.

  2. ADDITIONAL SAFETY GATE beyond the literal user ask: the script's REGISTRATION (not its
     content) is also wrapped in `#[cfg(debug_assertions)]`, disclosed here as a deliberate
     divergence from "the same `is_epic_login` gate" alone -- added because this deletes a real
     API surface and must never reach a release build if forgotten. `pnpm tauri:dev` (the run
     this diagnostic is FOR) is always a debug build, so this does not block the requested live
     test.

  3. INSTRUMENTATION (Rust-side, added to the arm's own ALREADY-SHIPPED native hooks, not new
     hooks -- `on_window_event(Destroyed)` already existed from quick task 260803-eee Task 5;
     no new hook had to be added for this diagnostic):
     - `on_navigation`: a marker on EVERY navigation (`[epic-deletion-diag] on_navigation
       fired ... host=...`, gated `is_epic_login` + `#[cfg(debug_assertions)]`), a second
       marker specifically on an `OAUTH_REDIRECT_EXFIL_HOST` match (`on_navigation EXFIL-HOST
       match observed`), and a third marker once the payload is successfully parsed and relayed
       into `LOGIN_WINDOW_EVENTS` (`EXFIL capture relayed`). None logs the redirectUrl/code
       value itself -- only host strings and booleans, matching this file's existing
       T-34.4.1-21/T-28-04 secret-handling convention.
     - `on_page_load`: a marker per page-load event (`on_page_load fired ... kind=... host=...`
       -- never the full URL/query string).
     - `on_window_event(Destroyed)`: a marker when the window is actually destroyed (`
       on_window_event Destroyed fired`).
     All four markers are `#[cfg(debug_assertions)]`-gated and `is_epic_login`-gated (so other
     runners' login windows, e.g. GOG/Amazon/Humble/Zoom, produce zero extra log noise).

static_verification: |
  STATIC/COMPILE/UNIT PROOF ONLY -- explicitly NOT live proof, per this project's own F-10
  lesson. Do not read anything below as evidence about the live 403 or the live
  instrumentation markers.

  - `cargo check` (src-tauri): clean, no errors or warnings from this cycle's new code.
  - `cargo test` (src-tauri): 102 passed, 0 failed, 1 ignored (same pre-existing ignored test,
    unrelated). FIVE new tests added this cycle, all passing, pinning: (1) the script deletes
    the full SURVIVES list (all 11 delete statements); (2) it restores `window.Notification`
    via its OWN independent WeakMap/toString chain (never reaching into the fingerprint shim's
    private closure, which is structurally impossible from a separate IIFE) and marks it
    native-looking; (3) it does NOT duplicate the outerWidth/outerHeight/alert/confirm patches
    (negative assertions); (4) every delete/patch block is independently try/caught and the
    script never touches `fetch`/`XMLHttpRequest`; (5) the script contains zero `"` characters
    (WR-08-safe, single-quoted JS only). A sixth ordering assertion (registered LAST among this
    arm's own `.initialization_script()` calls) is pinned in
    `src/backend/__tests__/tauriShellSource.test.ts` instead of as a Rust unit test, matching
    this codebase's own convention that arm-body source-ordering assertions live in that TS
    suite (see the F-34.5-G6-04 describe block), not in a Rust `#[test]`.
  - `npx tsc --noEmit`: clean, zero errors.
  - `npm run test:ci`: 187/187 suites, 3647/3647 tests passing, ZERO failures.

  ONE DEFECT FOUND AND FIXED DURING THIS CYCLE'S OWN VERIFICATION, recorded honestly rather
  than silently corrected: an early draft of the new test comment at
  `epic_login_deletion_diagnostic_script_deletes_the_full_survives_list` wrote the literal text
  "__TAURI_PLUGIN_*/__TAURI_IIFE__" inside a plain `//` comment (not backtick-separated the way
  the const's own doc comment safely writes it). The bare `*/` substring this produced paired
  with an unrelated, pre-existing, harmless stray `/*` elsewhere in the file (inside a
  `.github/workflows/*.yml` path mentioned in an unrelated doc comment, line ~3535) and caused
  `src/backend/__tests__/tauriShellSource.test.ts`'s
  `REQ-34.3-08 every clipboard #[cfg(test)] fn plan 34.3-03 added still exists` test to fail --
  the file-wide block-comment stripper (`stripSourceComments`) paired that distant `/*` with
  the new `*/` and silently swallowed roughly 900 lines of the file as one giant "comment",
  removing several clipboard test function signatures from the stripped copy the TS suite
  checks against. CONFIRMED via `git stash`/`git stash pop` that this exact test PASSED at HEAD
  and only failed once this cycle's comment text was introduced -- a genuine regression this
  cycle caused and fixed, not a pre-existing failure. Fixed by rewording the comment to avoid
  the adjacent `*/` sequence entirely (`__TAURI_PLUGIN_-prefixed keys plus __TAURI_IIFE__`)
  rather than adding a workaround elsewhere. Full suite re-run afterward confirmed zero
  regressions remain (187/187 suites, 3647/3647 tests, all passing).

  WHAT WAS NOT PROVEN, named explicitly so no future reader mistakes static proof for live
  proof:
  - Whether the pre-auth 403 clears, is unaffected, or changes shape for a genuinely
    logged-out Epic user under `pnpm tauri:dev` with this deletion applied -- OWED, this
    cycle's CHECKPOINT below collects that result.
  - Whether all four `[epic-deletion-diag]` instrumentation markers actually appear in a live
    run, in the expected order, for the expected events -- OWED, same checkpoint.
  - Whether the deletion itself throws any new JS error visible in the login window's devtools
    (already auto-open in debug builds) -- OWED, same checkpoint.
  - Whether the SURVIVES-list globals are actually GONE when independently re-checked via the
    already-established 3-arm dump script, re-pasted in the Tauri login window specifically --
    OWED, same checkpoint, requested regardless of the 403 outcome.
  - `F-34.5-G6-01` does NOT close. Phase 34.5 does NOT close. No `34.5-UNTESTED-ITEMS.md` row is
    touched by this entry. The SEPARATE, still-owed post-auth live-gate checkpoint (already-
    authenticated Epic session) is UNCHANGED and UNTOUCHED by this cycle's work.
  - This code is NOT a candidate fix and is NOT being proposed for shipment as-is. It is
    THROWAWAY and is expected to be removed or replaced, in whichever direction the live result
    points, before this finding can close.

files_changed_experimental_throwaway:
  - src-tauri/src/main.rs (added `EPIC_LOGIN_DELETION_DIAGNOSTIC_SCRIPT` const and its
    `#[cfg(debug_assertions)]` + `is_epic_login`-gated registration, placed last among the
    arm's own `.initialization_script()` calls; added THROWAWAY-labeled instrumentation markers
    to the arm's existing `on_navigation`, `on_page_load`, and `on_window_event(Destroyed)`
    hook bodies; added five new `#[cfg(test)]` tests pinning the new const's shape)
  - src/backend/__tests__/tauriShellSource.test.ts (added a THROWAWAY-labeled describe block
    pinning the new script's guaranteed-last registration order relative to the two sibling
    production scripts)
  - .planning/debug/epic-login-non-interactive.md (this file -- this EXPERIMENTAL/THROWAWAY
    section, kept deliberately separate from the two real `Resolution` entries above)

---

## Current Focus (SUPERSEDING, 2026-08-03T15:00:00) -- OPTION 1 routing implementation cycle

<!-- User decision received: OPTION 1 (SIDLogin becomes Epic's ONLY login path under Tauri;
     Electron's Epic tile unchanged). This block documents the MANDATORY structured reasoning
     checkpoint (fix_and_verify protocol, Step 0) written BEFORE any source edit this cycle,
     plus the exact scope executed. Does not reopen or reinterpret anything in the routing
     options / cleanup scope / live-verification-requirements blocks above -- this cycle
     executes OPTION 1 exactly as scoped there. -->

reasoning_checkpoint_2026_08_03T15_00_00:
  hypothesis: |
    Under Tauri, Epic's embedded-webview login is unconditionally reachable via `Runner`'s
    primary tile (`handleLogin()` -> `navigate(props.loginUrl)`, no `isTauri()` gate today),
    and that exact path is the one this investigation has spent the whole session proving hits
    a permanent, structurally-unmaskable-fingerprint-driven pre-auth 403 (Talon). Rerouting
    Epic's PRIMARY tile action, under Tauri only, to invoke `alternativeLoginAction` (which
    already opens the SIDLogin modal) instead of navigating to the embedded route -- and
    suppressing the now-redundant secondary "Alternative Login Method" tile in that case --
    removes the ONLY UI path that reaches the guaranteed-403 embedded flow for Epic under
    Tauri, without touching Electron at all (Electron's Epic `Runner` instance does not set the
    new prop, so its behavior is provably, structurally unchanged -- not just "expected to be
    unchanged").
  confirming_evidence:
    - "`routing_investigation_2026_08_03T10_00_00` (Current Focus, prior block): direct source
       read confirmed `Runner/index.tsx`'s `handleLogin()` calls `navigate(props.loginUrl)`
       unconditionally, no `isTauri()` gate anywhere in the component today. Epic is the ONLY
       one of the 6 runners (Epic/GOG/Amazon-nile/Zoom/Steam/Humble, re-verified this cycle
       directly from `Login/index.tsx:157-228`) given `alternativeLoginAction` -- confirmed by
       re-reading `Login/index.tsx` in full this cycle before writing this checkpoint."
    - "`sidlogin_under_tauri_viability_2026_08_03T10_00_00` (Current Focus, prior block): every
       link in SIDLogin's own chain (`loginPage()` -> `shell.openExternal` -> the real Tauri
       `tauri_plugin_opener` command; `epic.login(sid)` -> the already-ported
       `runnerAuthFlowRegistration.ts` `login` channel -> the real, unchanged `LegendaryUser.
       login`) was confirmed by direct source read to be a genuine Tauri implementation, not a
       silent stub of the kind this project has hit three times before (`nativeImage`/
       `safeStorage`/`navigator.clipboard`)."
    - "The user's own OPTION 1 decision (relayed via session coordinator, dated 2026-08-03)
       explicitly authorizes gating on the SAME established `isTauri()` import this codebase
       already uses at `WebView/index.tsx:557` and `useTauriOAuthLogin.ts:155` -- re-verified
       directly, this cycle, at both citations (both true: `isTauri` imported from
       `preload/tauriTransport` and used as a first, unconditional guard) before reusing it, per
       this project's own recorded `isTauri()` stale-guard gotcha (phase 34.4 gate item 2)."
  falsification_test: |
    If a live `pnpm tauri:dev` run shows Epic's tile still navigating to `/loginweb/legendary`
    (the embedded webview route) on click, or shows BOTH the primary tile's click opening
    SIDLogin AND a redundant "Alternative Login Method" second tile for Epic under Tauri, the
    routing change did not take effect as designed and must be re-diagnosed before the
    live-verification checkpoint result is trusted. This is exactly what the checkpoint below
    asks the user to observe directly (item 1: "Epic tile now shows ONLY SIDLogin, no embedded
    window option at all").
  fix_rationale: |
    The root problem is not a bug in the embedded flow's mechanics -- it is that the ONLY UI
    path Epic offers under Tauri today leads to a mechanism this investigation's own
    `descriptor_findings_2026_08_03T09_00_00` concluded has a genuine, provable structural
    ceiling (`window.ipc`/`window.isTauri`/`window.__TAURI_INTERNALS__` are non-configurable,
    non-writable, and provably un-maskable from page JS -- not merely hard to mask). Rerouting
    the UI eliminates the only path to that mechanism entirely, rather than attempting to keep
    winning an unwinnable JS-layer fingerprinting fight. This is a root-cause-addressing
    routing change, not a cosmetic one: the change is scoped to the exact prop/click-handler
    boundary already identified as Epic-only (`alternativeLoginAction`), so it is structurally
    incapable of regressing any of the other 5 runners -- none of them set the new prop, so
    their `handleLogin()` code path is byte-for-byte identical to before this change for their
    inputs.
  blind_spots: |
    This cycle does NOT live-verify that SIDLogin's real system-browser flow completes end to
    end for a genuinely fresh, logged-out Epic account under Tauri specifically -- that is the
    live-verification checkpoint below, deliberately not this cycle's static work. It does NOT
    verify that hiding the primary tile's `navigate()` call makes the embedded path
    UNREACHABLE by every other route (e.g., the `/loginweb/legendary` route itself remains
    registered app-wide for Electron and is not removed by this change) -- the checkpoint
    explicitly asks the user to confirm this live, not assume it from the UI change alone. It
    does not address whether Epic's tile should carry different copy/label text now that it
    always opens SIDLogin under Tauri -- left unchanged per the "minimal prop-contract change"
    guidance; a future cycle could revisit copy if user testing surfaces confusion. It does not
    re-litigate OPTION 2 or 3 -- OPTION 1 was the user's explicit, final choice.

scope_executed_2026_08_03T15_00_00: |
  1. ROUTING (implements OPTION 1 exactly as scoped in `routing_investigation`/
     `cleanup_scope_proposal` above): added an optional `hideEmbeddedLogin?: boolean` prop to
     `Runner`'s prop contract (the smallest shape change that expresses "this runner has no
     embedded login option under Tauri" without restructuring the component). `handleLogin()`
     now calls `props.alternativeLoginAction?.()` instead of `navigate(props.loginUrl)` when
     `hideEmbeddedLogin` is true; the secondary "Alternative Login Method" tile is suppressed in
     that same case (folded into the primary action instead of duplicated below it).
     `Login/index.tsx` passes `hideEmbeddedLogin={isTauri()}` on Epic's `Runner` ONLY -- the
     other 5 runners (GOG/Amazon-nile/Zoom/Steam/Humble) receive no new prop, so they default to
     `undefined`/falsy and their behavior is unchanged (added/verified by new tests).
  2. CLEANUP (SAFE-NOW, unconditional per user decision): `EPIC_LOGIN_DELETION_DIAGNOSTIC_SCRIPT`
     (`src-tauri/src/main.rs`), its registration call, its four `[epic-deletion-diag]`
     instrumentation markers inside the shared `on_navigation`/`on_page_load`/
     `on_window_event(Destroyed)` hooks, its five `#[cfg(test)]` tests, and the companion
     THROWAWAY describe block in `src/backend/__tests__/tauriShellSource.test.ts` were all
     removed entirely.
  3. DEFERRED (NOT done this cycle, per explicit instruction): `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT`,
     `epic_oauth_redirect_observer_script`, and the `.on_navigation` closure's
     `OAUTH_REDIRECT_EXFIL_HOST` match arm are UNCHANGED in behavior -- each gained a
     "PENDING REMOVAL once the SIDLogin pivot is live-verified" comment only, so a future reader
     does not mistake them for permanent production code.

next_action: |
  Static verification (`cargo check`/`cargo test`/`npx tsc --noEmit`/`npm run test:ci`), then
  issue a human-verify CHECKPOINT with the exact live-verification steps from
  `live_verification_requirements_2026_08_03T10_00_00` above. Record this cycle's fix as
  IMPLEMENTED-NOT-LIVE-VERIFIED, exactly like the two prior fixes in this file. Do NOT close
  `F-34.5-G6-01`, phase 34.5, or any `34.5-UNTESTED-ITEMS.md` row this cycle -- only a passing
  live run makes them eligible for reconsideration. The deferred cleanup (fingerprint shim +
  observer script + Epic `.on_navigation` arm removal) and the
  `34.5-UNTESTED-ITEMS.md`/post-auth-live-gate-checkpoint reconciliation are explicitly NOT this
  cycle's work -- flagged as the next cycle's follow-up once the live run passes.

## Current Focus (SUPERSEDING, 2026-08-03T16:00:00) -- resumed after stall, cleanup repaired, static verification complete

<!-- The 15:00:00 cycle stalled (watchdog timeout / network error, not a logic failure) with
     UNCOMMITTED edits left in the working tree. Nothing was committed. This block records what
     was found on resume (ground truth from `git diff`/`git status`, read BEFORE trusting the
     15:00:00 block's own `scope_executed` claim) and what was repaired. Does not redo any
     correctly-completed work. -->

resume_ground_truth_2026_08_03T16_00_00: |
  Verified via `git status --short` / `git diff --stat` against HEAD (fix/steam-native-install-
  stability branch) before reading anything else, per this cycle's own required_reading
  instruction:
    M src-tauri/src/main.rs (+324 vs HEAD at the time of resume)
    M src/frontend/screens/Login/components/Runner/index.tsx (+17)
    M src/frontend/screens/Login/index.tsx (+9)
    ?? src/frontend/screens/Login/components/Runner/__tests__/index.test.tsx (new, untracked)
    M src/backend/__tests__/tauriShellSource.test.ts (+38)
    M .planning/debug/epic-login-non-interactive.md (+2190, this file)

  Assessment against the 15:00:00 block's `scope_executed_2026_08_03T15_00_00` claim, item by
  item:

  (a) ROUTING -- Runner/index.tsx + Login/index.tsx: CORRECT AND COMPLETE, matches the claim
      exactly. `hideEmbeddedLogin?: boolean` added to `RunnerProps`; `handleLogin()` routes to
      `alternativeLoginAction` and returns early when set, checked AFTER the existing `disabled`
      short-circuit (preserving that guard's precedence); the secondary "Alternative Login
      Method" tile's render condition gained `&& !props.hideEmbeddedLogin`. `Login/index.tsx`
      passes `hideEmbeddedLogin={isTauri()}` on Epic's `Runner` only, importing `isTauri` from
      `../../../preload/tauriTransport` -- confirmed as the SAME relative-depth import path this
      codebase already uses at `WebView/index.tsx:18` and `useTauriOAuthLogin.ts:3`. All 5 other
      runners (gog/nile/zoom/steam/humble) pass no new prop -- confirmed by direct read of
      `Login/index.tsx:157-228`. The new `Runner/__tests__/index.test.tsx` is a real, complete
      test file (not a stub): 7 tests across two describe blocks, one proving the other-5-runners
      default path is byte-identical to before (navigates, renders the alt tile, no
      `hideEmbeddedLogin` regression), one proving Epic-under-Tauri's new path (routes to
      `alternativeLoginAction`, suppresses the alt tile, `disabled` still short-circuits first,
      silent no-op if no `alternativeLoginAction` provided). Ran in isolation this cycle: 7/7
      pass. NO REPAIR NEEDED for (a).

  (b) CLEANUP of `EPIC_LOGIN_DELETION_DIAGNOSTIC_SCRIPT` -- FALSE, only PARTIALLY done, and the
      file was left in a NON-COMPILING state. The const's own definition (`const
      EPIC_LOGIN_DELETION_DIAGNOSTIC_SCRIPT: &str = concat!(...)`) WAS successfully deleted --
      confirmed absent from both HEAD and the working tree (`grep -n "^const
      EPIC_LOGIN_DELETION_DIAGNOSTIC_SCRIPT"` and `EPIC_LOGIN_DELETION_DIAGNOSTIC_SCRIPT: &str`
      both returned nothing, before repair). But its THREE registration/instrumentation call
      sites (the `#[cfg(debug_assertions)] if is_epic_login { builder =
      builder.initialization_script(EPIC_LOGIN_DELETION_DIAGNOSTIC_SCRIPT); }` block plus its
      13-line doc comment; the `eprintln!("[epic-deletion-diag] on_page_load fired...")`
      diagnostic plus its 4-line comment inside `.on_page_load`; the `eprintln!("[epic-deletion-
      diag] on_window_event Destroyed fired...")` diagnostic plus its 4-line comment inside
      `.on_window_event`) and the entire 6-test `#[cfg(test)]` module pinning the deleted const's
      shape (109 lines, `epic_login_deletion_diagnostic_script_*`) were all STILL PRESENT,
      referencing a symbol that no longer existed. This is the true explanation for the
      "suspiciously large +324" this cycle's objective flagged: net-positive because the const's
      own ~90-line body genuinely was removed (net negative there), but the surrounding
      apparatus, the two new production doc comments (`EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT`'s and
      the routing/cleanup rationale comments), and the still-dangling references combined to a
      net +324. `cargo check` would have failed with "cannot find value
      `EPIC_LOGIN_DELETION_DIAGNOSTIC_SCRIPT` in this scope" in at least 4 places had it been run
      at resume. REPAIRED this cycle: removed all three call/instrumentation sites (with their
      doc comments) and the entire dangling test module. The companion THROWAWAY `describe`
      block in `tauriShellSource.test.ts` (pinning the deletion script's registration-order
      claim) was also removed -- its own doc comment already said "remove alongside the Rust
      const and its call site once the live result is known," which this repair now satisfies.
      Removing that block brought `tauriShellSource.test.ts` back to byte-identical with HEAD
      (confirmed: `git diff -- src/backend/__tests__/tauriShellSource.test.ts` now empty) --
      that file's only change in this whole cycle was the since-removed throwaway block.

  (c) PENDING REMOVAL comments on `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT`,
      `epic_oauth_redirect_observer_script`, and the `.on_navigation` closure's
      `OAUTH_REDIRECT_EXFIL_HOST` Epic match arm -- FALSE, only 1 of 3 was actually present.
      `grep -n "PENDING REMOVAL"` before repair returned exactly one hit: the `.on_navigation`
      match-arm comment (correct, matches the claimed text, no behavior change). Neither
      `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT`'s nor `epic_oauth_redirect_observer_script`'s own doc
      comment carried the marker, contradicting the 15:00:00 block's claim that all three
      "gained a comment only." REPAIRED this cycle: added a 5-line "PENDING REMOVAL -- after
      SIDLogin pivot is live-verified (F-34.5-G6-01, OPTION 1, 2026-08-03)" doc-comment paragraph
      immediately above each of the two missing targets' declarations (`fn
      epic_oauth_redirect_observer_script` and `const EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT`),
      matching the wording/rationale already used on the `.on_navigation` arm. Comment-only --
      neither function/const body, gating (`is_epic_login`), nor call site was touched. All three
      targets now carry the marker (verified: `grep -n "PENDING REMOVAL"` returns 3 hits post-
      repair).

  (d) Shared code (`humble_login_open` arm itself, `.on_page_load`'s core body,
      `LOGIN_WINDOW_EVENTS`, anti-phishing origin/title tracking, `EPIC_LOGIN_URL`,
      `matchOAuthRedirect`) -- CONFIRMED genuinely untouched: `git diff -- src-tauri/src/main.rs
      | grep -n "EPIC_LOGIN_URL\|matchOAuthRedirect\|LOGIN_WINDOW_EVENTS"` returned zero matches
      against the diff. NO REPAIR NEEDED for (d).

repair_summary_2026_08_03T16_00_00: |
  Net effect on `src-tauri/src/main.rs`: diff went from +324/-0 (broken, non-compiling) to
  +195/-0 (compiles clean) vs HEAD. Removed: the deletion-diagnostic's 3 call/instrumentation
  sites + their doc comments (~50 lines) and its entire 6-test module + trailing NOTE (~110
  lines). Added: 2 new PENDING REMOVAL doc-comment paragraphs (~10 lines) that the stalled cycle
  should have added but didn't. `src/backend/__tests__/tauriShellSource.test.ts` reverted to
  byte-identical with HEAD (its only change, the throwaway ordering-claim `describe` block, was
  removed). `Runner/index.tsx`, `Login/index.tsx`, and `Runner/__tests__/index.test.tsx` were
  NOT touched this cycle -- already correct from the 15:00:00 cycle.

static_verification_2026_08_03T16_00_00: |
  - `cargo check` (src-tauri): PASS, clean, zero errors/warnings.
  - `cargo test` (src-tauri): 97 passed, 0 failed, 1 ignored (pre-existing ignore, unrelated to
    this cycle) -- includes the surviving `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT` test module
    (untouched, still 4/4 passing) and confirms no dangling reference to the removed deletion
    script remains anywhere in the crate.
  - `npx tsc --noEmit`: PASS, clean, zero type errors.
  - `npm run test:ci`: PASS, 188/188 suites, 3653/3653 tests, 0 failed. Includes
    `src/backend/__tests__/tauriShellSource.test.ts` (post-repair, throwaway block removed) and
    `src/frontend/screens/Login/components/Runner/__tests__/index.test.tsx` (7/7, verified both
    in the full run and in isolation).
  - Recorded honestly per this project's own F-10 lesson: a green suite proves the SHAPE is
    correct and the code compiles/runs -- it does NOT prove SIDLogin actually completes a real,
    logged-out Epic login under `pnpm tauri:dev`, nor that the embedded route is truly
    unreachable end-to-end. That is the live-verification checkpoint below.

next_action: |
  Issue the human-verify CHECKPOINT with the exact live-verification steps from this file's
  `original_task_scope`/`live_verification_requirements_2026_08_03T10_00_00`. Record this cycle's
  fix as IMPLEMENTED-NOT-LIVE-VERIFIED. Do NOT close `F-34.5-G6-01`, phase 34.5, or any
  `34.5-UNTESTED-ITEMS.md` row. Two items remain explicitly flagged (not done) for the FOLLOWING
  cycle, after the live run passes: (1) the deferred cleanup of
  `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT` + `epic_oauth_redirect_observer_script` + the Epic
  `.on_navigation` match arm; (2) `34.5-UNTESTED-ITEMS.md`/post-auth-live-gate-checkpoint
  reconciliation.

## Current Focus (SUPERSEDING, 2026-08-03T17:00:00) -- live-gate PASSED, bookkeeping cycle, RESOLVED-PENDING-CLEANUP

<!-- Documentation/bookkeeping-only cycle. No source file edited, nothing committed, per
     explicit scope limits relayed by the session coordinator. Records the human-verify
     checkpoint's result (issued by the 16:00:00 cycle's own `next_action`) and reconciles the
     two loose ends that checkpoint's own scope deliberately deferred. Does not redo, blend
     with, or reinterpret any prior block -- purely additive. -->

live_gate_result_2026_08_03T17_00_00: |
  Relayed by the session coordinator. User's exact confirmation: "confirmed fixed".

  Checkpoint (issued by the 16:00:00 cycle, `live_verification_requirements_2026_08_03T10_00_00`
  in this file) PASSED, end to end, under `pnpm tauri:dev`:
  1. Epic's tile now surfaces SIDLogin only -- the embedded 403 path is unreachable for Epic
     under Tauri, not just hidden by default.
  2. The real system browser opens.
  3. A genuine logged-out Epic login completes there.
  4. The pasted authorization code runs `epic.login(sid)`.
  5. Epic's library actually populates in the app afterward.

  This satisfies the close criterion this debug session set for `F-34.5-G6-01`'s pre-auth arm.
  Full root-cause/resolution restatement and the two reconciliation items are recorded in the
  PRE-AUTH Resolution subsection above (`live_verification_pre_auth_2026_08_03T17_00_00`,
  `deferred_cleanup_reconciliation_2026_08_03T17_00_00`) -- not repeated here in full to avoid
  drift between two copies of the same record.

status_disposition_2026_08_03T17_00_00: |
  F-34.5-G6-01's PRE-AUTH arm: RESOLVED, live-verified, per `live_gate_result_2026_08_03T17_00_00`
  above.

  F-34.5-G6-01 as a whole: NOT CLOSED. Two concrete, tracked reconciliation items remain (both
  detailed in `deferred_cleanup_reconciliation_2026_08_03T17_00_00`, PRE-AUTH Resolution
  subsection):
    (1) dead-code removal of `EPIC_LOGIN_FINGERPRINT_SHIM_SCRIPT`,
        `epic_oauth_redirect_observer_script`, and the Epic `.on_navigation` match arm -- SAFE
        now, NOT done this cycle.
    (2) `34.5-UNTESTED-ITEMS.md` rows `U-34.5-06`/`U-34.5-11` need a follow-up edit to record
        "superseded by the SIDLogin pivot, no longer applicable to Epic" rather than staying
        silently OPEN with no disposition note -- ledger file NOT edited this cycle (read-only
        this cycle per explicit scope limit).

  Phase 34.5: NOT CLOSED -- unaffected by this cycle beyond the above; this debug session does
  not have authority to close a phase, only its own finding.

  The POST-AUTH Resolution entry (`epic_oauth_redirect_observer_script`, root_cause/fix/
  verification, `c857ade8e`) is UNCHANGED by this cycle -- its own live gate was never run (it
  cannot be: the embedded Epic session it targets no longer exists as a reachable UI path after
  the pivot) and its disposition is exactly the MOOT-FOR-EPIC note recorded in
  `deferred_cleanup_reconciliation_2026_08_03T17_00_00`, item 2, not a pass or a fail.

  The working-tree pivot changes (`Runner/index.tsx`, `Login/index.tsx`,
  `Runner/__tests__/index.test.tsx`, the `src-tauri/src/main.rs` cleanup from the 16:00:00
  cycle) remain UNCOMMITTED -- this cycle was explicitly not asked to commit them.

next_action: |
  Follow-up cycle (separate from this one, explicitly out of scope here): (1) remove the three
  named dead-code items now that they are confirmed safe; (2) edit
  `34.5-UNTESTED-ITEMS.md` to retire/reframe `U-34.5-06`/`U-34.5-11` with the
  superseded-by-SIDLogin-pivot disposition; (3) only after both land, reconsider whether
  `F-34.5-G6-01`/Phase 34.5 are eligible for closure. This bookkeeping cycle's own work is
  complete: status recorded, live-gate result recorded, both loose ends reconciled with an
  explicit disposition note (not silently dropped). No further action this cycle.
