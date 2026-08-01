---
status: investigating
trigger: "Tauri Epic login form renders but is non-interactive (F-34.5-G6-01). Discriminator verdict E1 (2026-08-01): the identical EPIC_LOGIN_URL is interactive under Electron (npm start, real login completed, 15 games) and non-interactive under Tauri (pnpm tauri:dev, two full 300s timeouts, single nav host=www.epicgames.com, title bar \"https://www.epicgames.com\", NO visible error text under the stock UA). E2 (Epic-side change independent of the port) is FALSIFIED. R1 (user-agent) was falsified in an earlier contract; R2 (a Chromium-only web API throwing under WKWebView) survives but is UNCONFIRMED because no one has ever seen the login window's JS console. LEAD HYPOTHESIS: main.rs:2476-2487 calls open_devtools() only for the \"main\" webview; the login window (separate WebviewWindowBuilder at main.rs:1387, label loginwin-N-*) never gets it, so its console has been invisible for four cycles. First move: add window.open_devtools() to the login window under #[cfg(debug_assertions)] only, then open Epic under pnpm tauri:dev and read the real console/script error. Prior art: queryLocalFonts is a CONFIRMED instance of a Chromium-only API throwing under WKWebView in this project (.claude/skills/spike-findings-gamelib/references/tauri-chromium-only-web-apis.md). Constraint: do NOT change USER_AGENTS, EPIC_LOGIN_URL, or matchOAuthRedirect - the discriminator's Routing section authorizes instrumentation/diagnosis only, no fix. Plans 34.5-29/30/31 remain HALTED by BINDING DECISION: fix-first; do not create 34.5-LIVE-GATE-RERUN-2.md."
created: 2026-08-01
updated: 2026-08-01T23:15:00
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

## Current Focus

hypothesis: |
  R2 (surviving from the first contract, still unconfirmed): a Chromium-only web API throws under
  WKWebView during Epic's login page bootstrap, leaving the form mounted but never wired up. The
  reason it stays unconfirmed is not that it is hard to test — it is that the login window's
  console has never been readable. Prior art in this project: `queryLocalFonts` THROWS under
  WKWebView (spike-findings-gamelib/references/tauri-chromium-only-web-apis.md), a confirmed
  instance of exactly this shape.
test: |
  Instrumentation landed (see Evidence below): `window.open_devtools()` now fires for the login
  window inside the `humble_login_open` arm, `#[cfg(debug_assertions)]`-gated and gated on
  `visible` to match the arm's existing presentation-only calls. Confirmed via `graphify`/direct
  read that `humble_login_open` (main.rs:1370-1387, despite its name) is the SHARED arm all five
  runners use — `src/frontend/screens/WebView/components/TauriLoginPanel.tsx:16-18` states this
  explicitly ("Nothing about these names is Humble-specific ... the SAME mechanism serves all
  five runners"), and `next_login_window_label()` produces the `loginwin-N-*` labels seen in the
  log evidence for `runner=legendary`. `cargo check` compiles clean; the existing
  `tauriShellSource.test.ts` suite (46 tests, string-matches this arm's structure including "no
  .on_navigation() in this arm" and "presentation calls only inside if-visible") still passes
  46/46 — the change added no new calls the suite negatively asserts against.
  REMAINING STEP (requires human hardware): run `pnpm tauri:dev`, open Manage Accounts → Epic,
  and read the login window's own Web Inspector console (now reachable — previously only "main"
  had devtools wired).
expecting: |
  A named JavaScript error at page bootstrap identifying a specific API or resource. If the
  console is clean, R2 is falsified and the failure is NOT a throwing web API — which would
  redirect the investigation toward input/event delivery to the WKWebView (hit-testing, focus,
  or an overlay) rather than page script.
next_action: |
  BLOCKED on human hardware observation. Developer must run `pnpm tauri:dev`, reproduce (Manage
  Accounts → Epic), open the LOGIN window's own Web Inspector (may appear as a separate
  window/tab now that devtools is wired to `loginwin-N-*`, not just "main"), and report back any
  named JS error at bootstrap — or that the console is clean.
reasoning_checkpoint: |
  This project's own F-10 lesson is binding here: when two readings of a measurement both fit,
  BUILD THE DISCRIMINATOR rather than shipping the nicer-sounding one. Do not ship a fix for R2
  on the strength of R1 and E2 having been eliminated — elimination is not confirmation. A named
  console error, or its documented absence, is the evidence that closes this. Instrumentation is
  NOT confirmation — the console reading itself is still owed.

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
