---
status: investigating
trigger: "Tauri Epic login form renders but is non-interactive (F-34.5-G6-01). Discriminator verdict E1 (2026-08-01): the identical EPIC_LOGIN_URL is interactive under Electron (npm start, real login completed, 15 games) and non-interactive under Tauri (pnpm tauri:dev, two full 300s timeouts, single nav host=www.epicgames.com, title bar \"https://www.epicgames.com\", NO visible error text under the stock UA). E2 (Epic-side change independent of the port) is FALSIFIED. R1 (user-agent) was falsified in an earlier contract; R2 (a Chromium-only web API throwing under WKWebView) survives but is UNCONFIRMED because no one has ever seen the login window's JS console. LEAD HYPOTHESIS: main.rs:2476-2487 calls open_devtools() only for the \"main\" webview; the login window (separate WebviewWindowBuilder at main.rs:1387, label loginwin-N-*) never gets it, so its console has been invisible for four cycles. First move: add window.open_devtools() to the login window under #[cfg(debug_assertions)] only, then open Epic under pnpm tauri:dev and read the real console/script error. Prior art: queryLocalFonts is a CONFIRMED instance of a Chromium-only API throwing under WKWebView in this project (.claude/skills/spike-findings-gamelib/references/tauri-chromium-only-web-apis.md). Constraint: do NOT change USER_AGENTS, EPIC_LOGIN_URL, or matchOAuthRedirect - the discriminator's Routing section authorizes instrumentation/diagnosis only, no fix. Plans 34.5-29/30/31 remain HALTED by BINDING DECISION: fix-first; do not create 34.5-LIVE-GATE-RERUN-2.md."
created: 2026-08-01
updated: 2026-08-02T00:15:00
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

## Eliminated

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

## Current Focus

hypothesis: |
  R3 is FALSIFIED (see Eliminated) — clean kill, both named console lines gone, form still
  non-interactive. R2's original framing ("a Chromium-only web API THROWS in Epic's own script
  during bootstrap") is now WEAK-TO-DEAD: with the notification injection removed, the console is
  clean of every page-script error (only a benign viewport warning, 7 expected source-map 403s,
  and Epic's own Sentry 429 remain) — nothing throws, anywhere, in this repro. R2 is not formally
  falsified (a throw could theoretically be swallowed before reaching the console, or occur in a
  code path devtools doesn't surface), but treating it as a live lead any longer would be
  comfortable, not evidenced. It is downgraded to "unlikely, not re-examined unless everything
  below is exhausted."

  PRE-REGISTERED (per this project's F-10 discipline — predictions stated BEFORE the test is run,
  not fitted afterward) NEW HYPOTHESIS, replacing R2/R3 as the active lead:

  The "renders, greyed out, clean console" symptom splits into two mutually exclusive, DOM-
  observable classes that have never been distinguished because nobody has opened the Elements or
  Network tab (only the console has been read, in every cycle so far):

  - CLASS A — Epic's own page code disabled its own inputs. The email/password `<input>` elements
    (or a wrapping form/container) carry `disabled`, `aria-disabled`, a `pointer-events: none`
    style, or a loading/disabled CSS class in the live DOM, and the page is deliberately holding
    the form inert while awaiting something that never arrives.
  - CLASS B — the inputs are structurally normal (not disabled, no blocking overlay) but never
    receive click/keyboard events. This would be a WKWebView input/event-delivery problem (hit-
    testing, focus, first-responder, or a transparent overlay element), unrelated to Epic's page
    logic at all — "greyed out" would then just be normal unfocused/placeholder styling
    misinterpreted as disabled.

  STRUCTURAL SUB-HYPOTHESIS for Class A specifically, pre-registered with its own falsifiable
  prediction before any DOM evidence is collected: WKWebView enforces Intelligent Tracking
  Prevention and blocks third-party/cross-site cookies BY DEFAULT, unlike Chromium/Electron. If
  Epic's login flow depends on a cross-origin resource — a captcha/bot-check widget (Arkose Labs
  and hCaptcha are both known to be used by Epic's login), a fingerprinting script, or a storage-
  access-requiring iframe — ITP would silently block or alter that resource's request/cookie
  access with NO JavaScript throw (a blocked network response or an altered result is not an
  exception), leaving Epic's own bootstrap code waiting forever on a signal that never resolves and
  holding the form disabled as a result. This fits every fact on the table: renders fine, console
  clean, single `nav host=` (no redirect to a challenge domain), full 300s timeout, and it works
  under Electron/Chromium where third-party cookies are not blocked by default.

  PREDICTION, stated now, before the test: IF Class A evidence is found (disabled/aria-disabled
  inputs or a disabling wrapper), THEN expect ALSO to find, in the same DOM snapshot or the Network
  tab: a captcha/challenge widget (Arkose/FunCaptcha/hCaptcha-shaped markup, e.g. an iframe or div
  with those vendor names) present but blank/unloaded, AND/OR a pending-forever or blocked/failed
  cross-origin request tied to such a widget. Confirmation requires BOTH the DOM disabled-state
  signal AND a related cross-origin resource in trouble — either alone is suggestive, not decisive.
  Falsification: if Class A evidence is found but the Network tab shows no cross-origin
  captcha/challenge activity at all (nothing pending, nothing blocked, nothing related), the ITP
  sub-hypothesis is wrong even though the Class A/B split itself would still be correctly resolved
  — the two are separable and must not be conflated when reporting back.
  If Class B evidence is found instead (inputs look normal, not disabled), the ITP sub-hypothesis
  is moot regardless of Network tab contents, and investigation pivots entirely to WKWebView
  input/event delivery (hit-testing, focus, window-level first-responder behavior) — a completely
  different code area than anything examined in this session so far.
test: |
  Cannot be run by this agent — requires live DOM/Network inspection on real Tauri/WKWebView
  hardware, which this agent has no access to. Handed to the developer as a CHECKPOINT (see
  returned checkpoint). Devtools are already wired to the `loginwin-*` window from the prior
  cycle's instrumentation (main.rs `humble_login_open` arm, `#[cfg(debug_assertions)]`-gated,
  confirmed working) — no further code change is needed to run this test, only manual DOM/Network
  inspection during the existing repro.
expecting: |
  See the hypothesis block's PREDICTION paragraph above for the full decision table (Class A vs
  Class B, and within Class A, ITP-confirmed vs ITP-falsified). Summary: Class A + captcha/cross-
  origin trouble → proceed to design an ITP/storage-access-scoped fix candidate. Class A + no
  cross-origin trouble → Class A is real but the ITP theory specifically is wrong; need a fresh
  hypothesis for WHY Epic's own code is holding the form disabled. Class B → pivot entirely to
  WKWebView event-delivery investigation, unrelated to anything examined so far.
next_action: |
  BLOCKED on human hardware. See CHECKPOINT REACHED returned to the user for exact DOM/Network
  inspection steps. Do NOT run any new code diagnostic before that response — the next action is
  observation, not an experiment requiring a code change.
reasoning_checkpoint: |
  This project's own F-10 lesson (a green suite / a plausible story is not confirmation) is binding
  again: the prior cycle's "capability gap -> injected script -> unhandled rejection -> non-
  interactive form" story was self-consistent and comfortable, and it was WRONG — the removal
  experiment cleanly falsified it. The lesson generalizes: three console-only investigation cycles
  in a row have all reasoned from the console alone. The console is not the only signal available;
  the DOM and Network tabs have never been looked at, and "greyed out" is itself an unverified
  visual description that could mean CSS opacity, a disabled attribute, or nothing structural at
  all. This pre-registration is written BEFORE the DOM/Network evidence is collected, specifically
  so that whatever is found next gets evaluated against a stated prediction rather than a post-hoc
  story built to fit the observation — the exact trap the prior R3 cycle should have (and mostly
  did) guard against, but which the confidence of a "complete" story nearly obscured.

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
