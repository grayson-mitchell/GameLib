---
status: resolved
trigger: "action todo: D-35-19-15 Epic sibling-apex"
created: 2026-09-26
updated: 2026-09-26
---

# Debug session: D-35-19-15 — is the todo's blocked status stale?

## Symptoms

**Expected behavior (per the todo):** `D-35-19-15`
(`.planning/todos/pending/2026-09-02-d-35-19-15-sibling-apex-seeding-unqueued-and-unreproducible-.md`)
says the four Epic sibling-apex cookies (`fortnite.com`, `unrealengine.com`, `twinmotion.com`,
`metahuman.com`) cannot be seeded on this build, so its discharge condition (seed one, observe it
present, then absent after Epic logout, via an independent jar read) cannot be attempted, and it
records `ready: blocked` / `trigger_phase: "40"` / `blocked_by: "no seeding vehicle exists on this
build ... Phase 40 is the trigger that unblocks it"`.

**Actual state, found before opening this session:** Phase 40 shipped 2026-09-05, but explicitly
scopes `/store/epic` OUT of the embedded browser on every platform
(`src/frontend/screens/WebView/index.tsx:468`, D-05/D-08) — confirmed still true at HEAD. The
follow-up to un-gate it (`.planning/todos/completed/2026-09-05-store-epic-blocked-by-cloudflare-turnstile-in-the-embed.md`)
was closed WONTFIX on 2026-09-15 (`quick-260915-hza`): even a human clicking the Cloudflare
Turnstile widget gets re-challenged, so Epic in the embed is permanently dead, not "not yet landed."
So Phase 40 was never actually going to be `D-35-19-15`'s trigger.

Separately, **Phase 34.5** (complete 2026-08-20, *before* `D-35-19-15` was even filed on 2026-09-02)
shipped a real Epic OAuth **login** window
(`src/frontend/screens/WebView/useTauriOAuthLogin.ts`, backend channel `login` for the `legendary`
runner) — a genuine Tauri-managed webview pointed at Epic's real login pages, sharing the single
process-wide cookie jar with the rest of the app (spike 018). The todo's `blocked_by` text never
considered this window; it only reasoned about the store-browsing embed.

**Error messages:** none — this is not a crash/exception bug. It's a stale-premise / mis-filed
`blocked_by` investigation.

**Timeline:** todo filed 2026-09-02 citing Phase 40 (then unplanned) as trigger. Phase 40 shipped
2026-09-05 without an Epic embed. The Cloudflare WONTFIX closed 2026-09-15. Phase 34.5 (the login
window) actually predates the todo, landing 2026-08-20.

**Reproduction / what to determine:** Does logging in to Epic through the real OAuth login window
cause cookies to land in GameLib's own jar for any of `fortnite.com`, `unrealengine.com`,
`twinmotion.com`, `metahuman.com`? Static analysis first (does Epic's login/SSO redirect chain ever
navigate through those hosts, e.g. `EPIC_DEVICE` cross-domain fraud-signal cookies referenced in
`src/backend/storeManagers/legendary/user.ts:90-96`); if inconclusive, determine whether a live,
independent-jar-read login test is actually executable in this environment (real Epic credentials
would be required — if that need is real, say so plainly rather than assuming a live run is
possible).

## Goal

Either:
(a) the login window IS a working seeding vehicle today → correct `D-35-19-15`'s `blocked_by` /
    `trigger_phase` fields to name it, and (if a live test is actually executable here) attempt the
    discharge condition; or
(b) it is NOT (Epic's login flow never touches those domains, or can't reach a state where it
    would) → rewrite `blocked_by` to state the real, current reason `D-35-19-15` is blocked (Phase
    40 is a dead trigger; name what, if anything, could still unblock it, or mark it permanently
    blocked with no known trigger).

Do not leave the stale "Phase 40 is the trigger" claim standing in the todo either way.

## Current Focus

reasoning_checkpoint:
  hypothesis: "The todo's blocked_by/trigger_phase premise is stale, not current. A real seeding
    vehicle for the four Epic sibling-apex cookies already exists on this build — the Epic OAuth
    login window (Phase 34.5, `useTauriOAuthLogin.ts`, predating the todo's 2026-09-02 filing) —
    because it navigates to the exact same URL/host the old (now-removed) hidden clear-window used
    to navigate to, on macOS through a code path documented to share the SAME process-wide
    WKWebsiteDataStore::defaultDataStore() the cookie-clear/read machinery already operates on,
    and this exact mechanism was already measured live setting EPIC_DEVICE on all four sibling
    domains in 35-AB-RETEST.md Item 7 — predating the todo."
  confirming_evidence:
    - "useTauriOAuthLogin.ts:209 sets `url = EPIC_LOGIN_URL` for the `legendary` runner and hands
      it to `window.api.oauthCaptureLogin`, which is a real, human-driven Epic login navigation
      (not a hidden/synthetic request)."
    - "EPIC_LOGIN_URL (loginRoutes.ts:45-46) is byte-identical to EPIC_LOGIN_ORIGIN
      (legendary/user.ts:39) — 'https://www.epicgames.com/id/login?responseType=code' — the exact
      origin the old hidden clear-window (removed by b5b3464bd) used to navigate to, which the
      todo itself credits with seeding these cookies ('those cookies were set by the removed
      window itself')."
    - "src-tauri/src/main.rs:6252 computes `is_epic_login = url.host_str() == Some(EPIC_LOGIN_HOST)`
      (EPIC_LOGIN_HOST = 'www.epicgames.com', :2976) inside the SAME `humble_login_open` arm every
      OAuth login window (including the real user-facing Epic login) goes through — on macOS this
      is unconditional (:6275-6278), routing to `open_pristine_epic_login_window`."
    - "main.rs:4154-4167 states directly: the Epic login window is ALWAYS the pristine
      WindowBuilder window, and 'its cookies live in the SAME process-wide
      WKWebsiteDataStore::defaultDataStore()' that clearEpicCookies/cookiesForDomain read — i.e.
      GameLib's own jar, not an isolated one."
    - "35-AB-RETEST.md Item 7's own repro step 1 is 'Log into Epic Games through the embedded
      login webview' (the same login mechanism), and its measured Tauri-leg result shows
      EPIC_DEVICE PRESENT, value length 32, on all four of .fortnite.com, .twinmotion.com,
      .unrealengine.com and .metahuman.com after that login+logout sequence — i.e. this exact
      mechanism has ALREADY been observed seeding these cookies into GameLib's own jar, live,
      once."
  falsification_test: "If a live login through this window, independently jar-read, shows NO
    cookie set on any of the four sibling domains, the hypothesis is wrong and the todo's
    'no vehicle exists' claim would stand (though the Phase-40 trigger reasoning would still be
    provably stale and need correcting on its own)."
  fix_rationale: "The fix is not a source change — the seeding/clearing code (EPIC_COOKIE_HOSTS,
    the wipeSteps sweep) is already correct and unchanged by this session. The defect is in the
    TODO's own blocked_by/trigger_phase fields: they name a phase (40) that was never actually
    going to unblock this (Epic was scoped out of Phase 40's embed by design, D-05/D-08, and the
    Cloudflare-embed follow-up was WONTFIX'd 2026-09-15) and they never considered the OAuth login
    window that predates the todo and already has one live measurement supporting it. Editing the
    todo's frontmatter/body to reflect this is the root-cause-addressing fix; leaving 'Phase 40 is
    the trigger' standing would keep steering any future reader toward a dead phase."
  blind_spots: "No live, independent-jar-read test was re-run IN THIS SESSION — the confirming
    35-AB-RETEST.md measurement is from Phase 35 (2026-08-29ish), a different point in time, and a
    fresh run was not attempted here because it requires real Epic credentials/2FA not available
    in this sandboxed environment (per this session's explicit instructions not to fake/mock/skip
    that gate). It is also not verified whether the non-macOS (Windows/Linux) `humble_login_open`
    fallback path (the plain WebviewWindowBuilder branch main.rs falls through to when
    `is_epic_login` is true but the platform isn't macOS) shares the same default cookie store —
    only the macOS pristine-window path is documented and evidenced here. Neither blind spot
    changes the fix (correcting the todo), since the todo's own discharge condition already
    requires a live human-run test regardless of which platform performs it."
  candidate_causes:
    - "docs/process: the todo's blocked_by text was authored by reasoning only about the
      store-browsing embed and the just-removed hidden clear-window, never cross-checking the
      unrelated Phase 34.5 login window that had already landed 10 days earlier (category:
      process — a todo-authoring gap, not a code defect)."
    - "code (structural, not defective): EPIC_LOGIN_URL and EPIC_LOGIN_ORIGIN being independently
      defined constants with the identical literal value in two files is itself a minor
      maintainability hazard (category: code) — not the root cause of the stale todo, but adjacent
      and worth a note rather than a fix in this session (out of scope: no bug present, just
      duplication)."
  and_gate: "No — a single cause (a stale todo premise, authored without checking for the OAuth
    login window) fully explains the symptom. The code-duplication observation is a secondary,
    non-causal note, not a second contributing condition; removing it would not change whether the
    todo is stale."

hypothesis: "CONFIRMED — see reasoning_checkpoint above. The todo's premise ('no seeding vehicle
  exists on this build') is stale/false; a vehicle exists today and has one live measurement
  behind it from before the todo was filed."
next_action: "DONE (this session) — todo frontmatter/body corrected, all planning gates + prettier
  verified green. Awaiting human confirmation that the corrected todo reads accurately before
  archiving this debug session. The live login+logout jar re-test remains a SEPARATE, still-open
  action for whoever has real Epic credentials — that is unchanged by this session and is not
  blocking archival of this debug session, which was about the todo's accuracy, not about
  discharging the todo itself."

## Evidence

- timestamp: 2026-09-26
  checked: src/backend/storeManagers/legendary/user.ts (full file, EPIC_COOKIE_HOSTS,
    EPIC_LOGIN_ORIGIN, logout() wipeSteps)
  found: EPIC_LOGIN_ORIGIN's own comment states the ROOT CAUSE of a *different*, already-resolved
    debug session (`epic-cookie-clear-read-divergence`): opening a hidden window at Epic's real
    login page IS a navigation, and Epic+Cloudflare answer it by setting cookies
    (`__cf_bm`/`EPIC_DEVICE`/`EPIC_LOGIN_ID`/`_epicSID`/`_tald`), measured live. `logout()` no
    longer opens that window on macOS (EPIC_COOKIE_CLEAR_NO_WINDOW_LABEL resolves to `None`
    Rust-side, reaching the default-data-store path directly).
  implication: confirms the todo's own claim that "the removed window" (the hidden clear-window
    navigating to EPIC_LOGIN_ORIGIN) was A seeding mechanism for the sibling-apex cookies — but
    does not by itself prove it was the ONLY one, since the real OAuth login window navigates to
    the identical URL.

- timestamp: 2026-09-26
  checked: .planning/phases/35-electron-cutover-remove-the-electron-build/35-AB-RETEST.md, Item 7
    (lines 808-1000)
  found: The retest's own repro step 1 is "Log into Epic Games through the embedded login webview"
    (a real, credentialed login — the OAuth login window, not the hidden clear-window, which by
    definition of "log in" cannot be the clear-window). The measured Tauri-leg result: after that
    login + a subsequent logout, EPIC_DEVICE is PRESENT (value length 32) on
    `.fortnite.com`, `.twinmotion.com`, `.unrealengine.com` and `.metahuman.com` — an independent,
    structured binarycookies-jar read, not the app's self-report.
  implication: direct, live, prior evidence that logging in through the OAuth login window seeds
    all four sibling-apex domains in GameLib's own jar. This predates the todo (Phase 35, filed
    before 2026-09-02) and directly falsifies "no seeding vehicle exists on this build."

- timestamp: 2026-09-26
  checked: src/frontend/screens/WebView/useTauriOAuthLogin.ts (full file) and
    src/frontend/screens/WebView/loginRoutes.ts:45-50
  found: the `legendary` runner branch sets `url = EPIC_LOGIN_URL` ('https://www.epicgames.com/id/
    login?responseType=code') and passes it to `window.api.oauthCaptureLogin`, which opens a real,
    human-interactive login window (F-34.5-G6-02 marks this channel as one that "drives a HUMAN
    interaction"). EPIC_LOGIN_URL is byte-identical to EPIC_LOGIN_ORIGIN in user.ts.
  implication: the live, user-facing Epic login path and the old (removed) hidden clear-window
    navigated to the exact same origin. Whatever cookie-setting behavior that origin triggers
    (measured in the Item 7 evidence above) fires on every real Epic login today, not just on the
    since-removed clear-window.

- timestamp: 2026-09-26
  checked: src-tauri/src/main.rs — `humble_login_open` arm (~6245-6278), `EPIC_LOGIN_HOST`
    (:2976), `open_pristine_epic_login_window` (:3286+) and its own doc comment at :4154-4167
  found: on macOS, `is_epic_login` (url.host_str() == "www.epicgames.com") is checked
    unconditionally inside `humble_login_open` — the SAME arm oauthCaptureLogin's Rust side
    dispatches to — and routes to `open_pristine_epic_login_window`. That function's own doc
    comment states plainly: "the pristine webview's WKWebViewConfiguration::new(mtm) uses no
    custom websiteDataStore override, so its cookies live in the SAME process-wide
    WKWebsiteDataStore::defaultDataStore()" that clearEpicCookies/cookiesForDomain already read.
  implication: the real Epic login window's cookies land in GameLib's own shared jar (not an
    isolated/ephemeral store) — the exact jar the todo's discharge condition requires the seeded
    cookie to be observed in.

- timestamp: 2026-09-26
  checked: .planning/todos/completed/2026-09-05-store-epic-blocked-by-cloudflare-turnstile-in-the-embed.md
  found: RESOLUTION — WONTFIX, 2026-09-15, quick 260915-hza. A human clicking the Cloudflare
    Turnstile widget in the store-browsing embed gets re-challenged, not cleared, across two
    interactive runs. `/store/epic` stays permanently gated out of the embed.
  implication: confirms Phase 40 was never going to become D-35-19-15's trigger — the only
    Epic-touching surface Phase 40 could plausibly have unblocked (the embedded store browser) is
    permanently closed by design, independent of anything this debug session does.

## Eliminated

- hypothesis: "Phase 40 is (or ever was) a viable trigger for D-35-19-15."
  evidence: WebView/index.tsx:468 scopes `/store/epic` out of the embed on every platform (D-05,
    still true at HEAD), and the Cloudflare-embed follow-up todo was closed WONTFIX 2026-09-15 —
    a human clicking Turnstile gets re-challenged, not cleared. Phase 40 shipped 2026-09-05 with
    no Epic embed and no route to ever gain one.
  timestamp: 2026-09-26

## Resolution

root_cause: "D-35-19-15's blocked_by/trigger_phase fields were authored against an incomplete
  picture: they reasoned only about the store-browsing embed (absent, and permanently WONTFIX'd
  for Epic specifically) and the just-removed hidden clear-window, and never checked for the
  pre-existing Epic OAuth login window (Phase 34.5, landed 2026-08-20, 13 days before the todo was
  filed). That login window navigates to the byte-identical URL/host the removed clear-window used
  to, shares the same process-wide default cookie jar on macOS (documented in main.rs), and this
  exact login-then-seed mechanism was already measured live in 35-AB-RETEST.md Item 7 (Phase 35,
  predating the todo) setting EPIC_DEVICE on all four sibling-apex domains. Phase 40 was never
  actually going to be the trigger (D-05/D-08 scope Epic out permanently; the Cloudflare follow-up
  was closed WONTFIX 2026-09-15) — this is a stale-premise/mis-filed-blocker documentation defect,
  not a source-code bug. No source code is defective; EPIC_COOKIE_HOSTS and the logout wipeSteps
  sweep are unchanged by this session."
fix: "Rewrote D-35-19-15's frontmatter (blocked_by, trigger_phase, owner, ready: blocked ->
  live-gate) and added a '## CORRECTION 2026-09-26' body section naming the OAuth login window as
  the real, already-existing seeding vehicle, with the specific file/line evidence, and stating
  plainly that Phase 40 was never going to be the trigger. The two stale body sections ('Why it is
  blocked', 'Phase 40 is the TRIGGER, not the owner') were marked STALE with a pointer to the
  correction rather than deleted, preserving the historical reasoning record. Added a Sources
  entry pointing back to this debug session. Explicitly did NOT attempt the live login+logout jar
  test itself: it requires real Epic credentials/2FA unavailable in this sandboxed environment, so
  `ready` is now `live-gate` (a live app run is what remains) rather than resolved outright — this
  is recorded plainly in the todo rather than faked."
verification: "Ran the enforced gates: `python3 .planning/todos/todo-frontmatter-gate.py` ->
  'OK: 18 pending todo(s) all carry in-vocabulary severity, platform, ready triage keys.'
  `pnpm planning-gates` -> 12/12 passed (includes the frontmatter/envelope-tag/state-anchor gates).
  `npx prettier --check` over both edited files -> 'All matched files use Prettier code style!'
  Manually re-confirmed every cited evidence claim by reading the source files directly (not
  trusting the prior turn's debug-file prose): loginRoutes.ts:45-46, useTauriOAuthLogin.ts:208-209,
  main.rs:2976/6252/6275-6278/4154-4167, 35-AB-RETEST.md:808-991, and the completed WONTFIX todo.
  No fix-acceptance guardrail applies in the code sense (no source diff, no tests to run/mutate) —
  this is a documentation-correctness fix; the applicable checks are the ones above, all passing.
  The live login+logout jar re-test (the todo's own discharge condition) was NOT performed here —
  confirmed non-executable-here dependency, not a gap in this fix."
files_changed:
  - ".planning/todos/pending/2026-09-02-d-35-19-15-sibling-apex-seeding-unqueued-and-unreproducible-.md"
