---
status: investigating
trigger: "Tauri Epic login form renders but is non-interactive (F-34.5-G6-01). Discriminator verdict E1 (2026-08-01): the identical EPIC_LOGIN_URL is interactive under Electron (npm start, real login completed, 15 games) and non-interactive under Tauri (pnpm tauri:dev, two full 300s timeouts, single nav host=www.epicgames.com, title bar \"https://www.epicgames.com\", NO visible error text under the stock UA). E2 (Epic-side change independent of the port) is FALSIFIED. R1 (user-agent) was falsified in an earlier contract; R2 (a Chromium-only web API throwing under WKWebView) survives but is UNCONFIRMED because no one has ever seen the login window's JS console. LEAD HYPOTHESIS: main.rs:2476-2487 calls open_devtools() only for the \"main\" webview; the login window (separate WebviewWindowBuilder at main.rs:1387, label loginwin-N-*) never gets it, so its console has been invisible for four cycles. First move: add window.open_devtools() to the login window under #[cfg(debug_assertions)] only, then open Epic under pnpm tauri:dev and read the real console/script error. Prior art: queryLocalFonts is a CONFIRMED instance of a Chromium-only API throwing under WKWebView in this project (.claude/skills/spike-findings-gamelib/references/tauri-chromium-only-web-apis.md). Constraint: do NOT change USER_AGENTS, EPIC_LOGIN_URL, or matchOAuthRedirect - the discriminator's Routing section authorizes instrumentation/diagnosis only, no fix. Plans 34.5-29/30/31 remain HALTED by BINDING DECISION: fix-first; do not create 34.5-LIVE-GATE-RERUN-2.md."
created: 2026-08-01
updated: 2026-08-02T00:45:00
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

## Current Focus

hypothesis: |
  The Class A/B DOM-disabled-vs-event-delivery split from the prior cycle is FALSIFIED at the root
  (see Symptoms correction and Evidence 2026-08-02T00:20:00): there is no form in the DOM at all
  (`inputs:0 forms:0 iframes:[] text:""`), so neither "disabled inputs" (Class A) nor "healthy
  inputs not receiving events" (Class B) can be the mechanism — both presuppose a form that does
  not exist. The ITP/third-party-storage sub-hypothesis, which was pre-registered under Class A, is
  FALSIFIED on its own stated terms (`cookieLen: 85`, `localStorage OK` — see Eliminated). What is
  visually present is a CSS skeleton/placeholder, not real rendered content.

  TWO THREADS ARE NOW OPEN. They are not yet shown to be the same mechanism and must be evaluated
  independently — do not let a plausible connection between them substitute for evidence connecting
  them.

  THREAD 1 (reopened, not yet the active lead) — Tauri's CORE IPC bootstrap injection, distinct
  from R3: the console shows `[Warning] IPC custom protocol failed, Tauri will now use the
  postMessage interface instead – TypeError: Load failed (user-script:103, line 106)` followed by a
  bare `TypeError: Load failed`. `user-script:103` is Tauri's own framework-injected script, not
  Epic's bundle and not a plugin — a different injection mechanism than the notification plugin
  that R3 killed. This keeps the general "Tauri's injected user-scripts break Epic's page" claim
  alive as a family, even though R3 killed one specific member of that family. UNCONFIRMED: whether
  this IPC-transport failure has any causal relationship to the empty DOM, or is an independent,
  benign fallback (the warning itself says Tauri "will now use the postMessage interface instead" —
  phrasing that suggests a handled fallback, not a fatal failure, though this has not been verified
  against Tauri's source).

  THREAD 2 (PRE-REGISTERED as the active lead, stated before the confirming test per this project's
  F-10 discipline) — Sentry-swallowed-exception: Epic's actual application bundle demonstrably
  loaded and executed real logic (`[Warning] WARN – "[Statsig]" – ... (index-BMTfSvFa.js, line
  501)` — a Statsig feature-gate evaluation, which only runs from inside Epic's own running code,
  not framework boilerplate). Separately, Sentry's own error-ingest endpoint (`envelope`) returned
  a 429 (rate-limited) in the same session. Reading: Epic's bundle is throwing repeatedly during
  bootstrap, an error boundary is catching those throws internally (React error boundaries and
  similar patterns catch-and-report without re-throwing to the global scope), and shipping enough
  reports to Sentry fast enough to trip its rate limiter — while rendering nothing (hence the empty
  DOM) and leaving no trace in the console, because a caught exception is never an uncaught one.
  This is offered as the explanation for why four consecutive cycles found "no error" in the
  console: the errors most likely exist and are being caught, not that there truly are none.

  PREDICTION, stated now, before the test: IF Thread 2 is correct, THEN arming "Break on All
  Exceptions" in the Web Inspector Debugger panel (which stops at a `throw` regardless of whether
  something downstream catches it — unlike a normal breakpoint or the console, which only surface
  what's left uncaught) and reloading the login window WILL produce at least one concrete exception
  with a message and call stack pointing into Epic's own bundle or a specific browser API it calls.
  Falsification: if Break on All Exceptions is correctly armed and the page reloads through to the
  same empty-DOM state with ZERO exceptions breaking (not "none we noticed" — the debugger must
  actually pause at least once for the thread to survive), Thread 2 is wrong and the Sentry 429 has
  some other explanation (e.g. Epic's own client-side rate-limiting telemetry, or non-exception
  error reports such as network failures reported without a JS throw). In that case, fall back to
  reading the Sentry `envelope` request's payload directly in the Network tab (contains Epic's own
  serialized exception + stack), with the caveat that Safari's request-body viewer is known to be
  unreliable for this payload shape — if both approaches come up empty, Thread 2 should be
  downgraded the same way ITP and R2 were: not chased further without new evidence.
test: |
  Cannot be run by this agent — requires live Web Inspector Debugger-panel interaction on real
  Tauri/WKWebView hardware (arming "Break on All Exceptions", triggering a reload, and reading a
  live paused-debugger call stack), none of which this agent can do. Handed to the developer as a
  CHECKPOINT (see returned checkpoint). No code change or further instrumentation is needed —
  devtools are already wired to the `loginwin-*` window from two cycles ago.
expecting: |
  Exception message + top call-stack frames pointing at a specific Epic bundle function or browser
  API → CONFIRMS Thread 2 and names a concrete, fixable root cause (the specific API/call that
  throws). Debugger never pauses across a full reload → FALSIFIES Thread 2 as stated; fall back to
  reading the Sentry `envelope` payload in the Network tab; if that is also unproductive,
  reconsider Thread 2 entirely and re-open investigation into Thread 1 (the core IPC bootstrap
  failure) as an independent line, or return to open-ended DOM/timing investigation (e.g. does the
  skeleton ever get replaced, even after 300s, or is it eternally static — a hung-forever-on-a-
  promise signature distinct from a caught throw).
next_action: |
  BLOCKED on human hardware. See CHECKPOINT REACHED returned to the user for the exact Break-on-
  All-Exceptions steps and the Network-tab fallback. Do NOT apply any fix and do NOT touch Thread 1
  (the core IPC script) before that response — Thread 2 is the pre-registered active lead and must
  be tested on its own before Thread 1 is investigated further, to avoid conflating two untested
  mechanisms.
reasoning_checkpoint: |
  This project's own F-10 lesson keeps recurring and keeps being the right lesson: the prior
  cycle's Class A/B + ITP framing was itself a plausible, self-consistent story built on a symptom
  description ("greyed out", "non-interactive form") that nobody had actually verified against the
  DOM — and it was wrong, not because the reasoning was bad, but because the underlying observation
  it reasoned from was imprecise. The correction this cycle is the same shape as R3's: go back to
  the rawest available signal (DOM state, full-filter console) before trusting any inherited
  description of the symptom. Thread 2 is written as PRE-REGISTERED specifically so the next
  hardware read is evaluated against this stated prediction, not fitted to whatever is found. Blind
  spot, stated honestly: Thread 1 and Thread 2 could both be real and could even be related (a
  broken core IPC transport is exactly the kind of thing that could cause a framework-level promise
  to hang or throw inside application code) — but no evidence yet connects them, and reaching for
  that connection before testing Thread 2 directly would be exactly the kind of comfortable,
  unearned unification this project's history keeps punishing.

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
