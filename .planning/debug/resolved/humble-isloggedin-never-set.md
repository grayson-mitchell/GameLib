---
status: resolved
trigger: "F-34.4.2-19 — the D-G2 branch-(a) resolution is FALSIFIED live; Humble login-detection does not complete while the sheet is held open. The WKWebView displays humblebundle.com in an apparently already-authenticated state, but `configStore.set('isLoggedIn', true)` (src/backend/humble/user.ts:635) never fires, so the isLoggedIn-gated Logout/disconnect control (src/frontend/screens/Login/components/Runner/index.tsx:99-127) never renders and no route to a rendered login form exists either."
created: 2026-08-08
updated: 2026-08-08T14:30:00+13:00
phase: 34.4.2
finding_id: F-34.4.2-19
---

# Debug: Humble `isLoggedIn` never set

## Symptoms

**Expected behavior**
When Humble's login window opens against an already-authenticated humblebundle.com session
(D-G2 branch (a), "the window auto-logs in"), the login watcher should detect the authenticated
state, the validate path (`src/backend/humble/user.ts:591-635`) should reach
`configStore.set('isLoggedIn', true)` at `user.ts:635`, and the frontend `Runner` component should
swap its `{!props.isLoggedIn ? <Login/> : <Logout onClick={handleLogout}/>}` branch to render the
disconnect control. Alternatively (branch (b)), an unauthenticated session should present a
rendered, empty login form.

**Actual behavior**
Neither branch is reached. The WKWebView shows Humble's page in what visually appears to be an
authenticated state, but:
- `humble_store/config.json` stayed at its pre-session **2-byte** state (mtime Aug 6 13:52) for the
  entire session — measured independently via both `wc -c` and `ls -la`. The store write never
  happened.
- **No Logout control was ever observed rendered.**
- **No login form was ever observed rendered** either — there is no route from the shipped UI to
  either control in this state.
- The Humble login-window cookie watcher's `gamelib.log` sink emitted **nothing at all** for the
  sheet's entire duration. Per this project's standing rule, that silence is recorded as silence,
  not as proof any backend path did or did not run. The filesystem channel (`config.json`'s own
  unchanged size/mtime) is the decisive, independent evidence.

**Error messages**
None. No error, no warning, no log line — the failure is entirely silent. This is a
never-fires/no-output defect, not a throwing one.

**Timeline**
Unknown — the user has never deliberately checked whether `isLoggedIn: true` has ever been written
for Humble, under either the Electron or the Tauri build. Establishing whether this is a
regression introduced by the 34.4.1 login-seam replacement or an original defect is part of the
investigation, not a given.

**Reproduction**
- Build: `npm run tauri:dev` (dev build from source).
- A **live authenticated Humble WKWebView session exists on this machine right now** — the exact
  state F-34.4.2-19 was measured in. The bug is reproducible immediately, without re-establishing
  auth.
- ⚠ That same live session makes gate item 4 unmeasurable; do not clear it without saying so
  explicitly, and record it if you do.

## Impact

This is Phase 34.4.2's **blocking** defect. The fifth live gate run
(`34.4.2-LIVE-GATE-RERUN-5.md`, 2026-08-06) scored **FAIL, 0 of 5**, with every scored item —
6(b), 1, 2, 3, 4, 6(a) — recorded **NOT ATTEMPTED**, because the operator stopped the session once
this was established. It blocks items 1(e), 3(a), and 4 for a third consecutive run, and now
6(a) as well (its precondition, item 4's completed login, never occurs). All 25 plans in the phase
have SUMMARYs, so no executable planned work remains — diagnosis is the only path forward.

## Candidate layers (named without preference, from the gate document)

Recorded as candidates only. **No root cause is asserted.**

- **(i)** The WKWebView's apparently-logged-in page state may be a cached/rendered view of
  humblebundle.com's own session rather than a live event the app's login-watcher
  (`watchForLogin()` / `humble_login_cookies`) is subscribed to at that moment.
- **(ii)** The login-watcher may require a specific triggering event — a navigation, a cookie-store
  change callback — that an already-authenticated page load never produces.
- **(iii)** `HumbleUser`'s validate path may be gated on a condition this session's window-open
  sequence never satisfied.

## Known-relevant project constraints

These are established facts from prior sessions. Treat them as given, do not re-derive them:

- `cookies_for_url()` **drops the session cookie** under wry — the codebase uses `cookies()` plus
  its own suffix match. **Never detect login from `document.cookie`.**
- wry's blocking `.cookies()` getter previously caused a **reentrant self-deadlock** (F-34.4.2-12,
  fixed via async `WKHTTPCookieStore.getAllCookies`). If the watcher polls cookies, check which
  path it takes.
- Sidecar `console.*` and the file logger are **invisible** — stdout IS the RPC pipe. Absence of a
  log line proves nothing about whether a sidecar path ran.
- Sidecar `send` channels **fail silently**.
- A concurrent second app instance **splits the `[shell]` sink**, making a half-captured run look
  successfully measured. Assert exactly one PID per launch.
- Sample a hung process with `sample <pid>` **before** force-killing it; check `pgrep` first.

## Follow-ups (recorded per user request, NOT implemented this session)

- **Startup returning-user check via the stored Humble secret vault.** The bootstrap log shows a
  keyring-backed Humble secret store with `humble-session`/`humble-csrf` slots
  (`src/backend/sidecar/humbleSecretStore.ts`). A startup path that reads whatever cookie value is
  already stored there and calls the REAL `getGamekeys()` against it (the same authoritative
  liveness check this session's discriminator used manually) could confirm a returning,
  already-authenticated user WITHOUT ever opening a login window at all — closing the loop the user
  asked about ("can't you detect if there is a valid session already open?") for the common case of
  a user who has logged in before on this machine. Genuine design improvement, raised unprompted by
  the user this session. Cannot help TODAY's specific reproduction: `humble_store/config.json` is
  still `{}` and (as far as this session established) nothing has ever been persisted to the
  `humble-session` slot for this profile — there is nothing yet for such a startup check to read.
  Out of scope for this debug session (F-34.4.2-19 is about the LOGIN WINDOW'S watch, not a
  startup-time shortcut around it). Do not build without a separate planning pass.

## Current Focus

```yaml
reasoning_checkpoint:
  hypothesis: "Two independent, CONFIRMED-BY-CODE-READ defects jointly produce the finding: (1) Frontend: WebView/index.tsx's runHumbleLoginWatch() only ever branched on result.status === 'done'; 'error' and 'waiting' were silently swallowed. (2) TauriLoginPanel.tsx's humble branch was UNCONDITIONAL -- it rendered the static 'a sign-in window has opened' copy regardless of any watch outcome, so even a frontend that DID track the error had no render path to surface it. Together these explain every symptom: no Logout control, no login form, an indefinitely-held static message, and a filesystem-confirmed configStore write that never happened, because the backend watch DID correctly settle ({status:'error'} via the UNSUPPORTED_OR_ERROR/no-window path, confirmed live at 08:17:37 today) but nothing downstream ever acted on that settlement."
  confirming_evidence:
    - "Direct read of WebView/index.tsx:313-324 (pre-fix): only an `if (result.status === 'done')` branch existed, no `else`."
    - "Direct read of TauriLoginPanel.tsx:59-76 (pre-fix): `if (runner === 'humble') { ...static... return }` fired unconditionally, never consulting `state` at all -- confirmed this is why even a correctly-tracked error state would never have rendered."
    - "Live gamelib.log at 08:17:37 today: `UNSUPPORTED_OR_ERROR ... aborting watch` immediately followed by `humble_login:no-window:...` -- direct proof settle({status:'error'}) DOES fire in the backend; the defect is entirely on the consumption side."
    - "humble_store/config.json unchanged at 2 bytes throughout (gate RERUN-5 AND the fresh 08:17:37 session) -- consistent with the store write never being reached, which requires status:'done', which this session never got."
  falsification_test: "If, after the fix, TauriLoginPanel({runner:'humble', state:{phase:'error',...}}) still rendered the static in-progress copy (not the generic error branch), the hypothesis would be wrong -- the panel's gating logic, not just index.tsx's watch logic, would be unaddressed. Verified via TauriLoginPanel.test.tsx's new 'Humble error/timeout surfaces' describe block: all 4 new assertions pass, including that idle/undefined state is UNCHANGED (no regression) and phase:'error'/'timeout' now render the shared generic branch with a Retry button."
  fix_rationale: "Both defects are consumption-side, not backend-side -- the backend's LoginResult contract ({status:'done'|'waiting'|'error'}) was already correct and already fired correctly. The fix threads that existing signal through to the ALREADY-EXISTING generic error/timeout render branches TauriLoginPanel uses for the four OAuth runners (reused verbatim, not reinvented), closing both the swallow (index.tsx) and the unconditional-static-render (TauriLoginPanel.tsx) gaps in one coherent change. This addresses the root cause (consumption never happening) rather than a symptom (e.g. patching the specific 08:17:37 no-window case) -- it fixes EVERY 'error'/'waiting' resolution, regardless of what causes the backend to settle that way."
  blind_spots: "This fix does not and cannot resolve the ORIGINAL trigger investigation (Track 2, below) -- it makes any future 'error'/'waiting' settlement visible and recoverable via Retry, but does not prevent the window from becoming unreachable in the first place. Not verified live (no jsdom, and deliberately not run against the live Humble session per the standing constraint) -- verification is unit-test-only; a live re-run of the exact D-G2 branch-(a) scenario is the residual verification gap, to be covered by the human-verify checkpoint."
hypothesis: "RESOLVED for the consumption-side defect (see reasoning_checkpoint above). Track 2 (window-close trigger): the user-supplied WR-03 ten-minute deadline lead is now STRUCTURALLY RULED OUT for the specific 08:17:37 incident (a deadline settle can never produce the observed UNSUPPORTED_OR_ERROR/'aborting watch' log line -- proof via checkCookie()'s own three settled-guards). The observed log-order anomaly (UNSUPPORTED_OR_ERROR before its own catch-log) is best explained by a genuine, separate LogWriter write-ordering race, not by two overlapping poll ticks -- meaning the window was most likely ALREADY destroyed by the time this poll tick's own seam.cookies() call ran. The TRUE original cause of the window's destruction remains UNRESOLVED; best-supported (not proven) correlate is still the overnight sleep/wake cycling, now further undermined as a clean fit by the 15:47-vs-10:00 timing gap and by macOS setTimeout's own sleep-pause behavior (web-confirmed) making any wall-clock deadline correlation unreliable in this environment."
test: "Unit/structural test suites (user.test.ts, TauriLoginPanel.test.tsx, new HumbleLoginWatchErrorHandling.test.ts) plus tsc --noEmit, eslint, and `cargo check` on the Rust doc-comment-only edit -- all green. No live app interaction; the live Humble WKWebView session was never touched. Track 2's ordering/timing analysis this turn was desk-based (direct code + log reads + one web search), not live-instrumented."
expecting: "n/a -- Track 1 fix implemented and self-verified; the live test round revealed a DIFFERENT, more fundamental Track-2 defect (see below) that Track 1 cannot reach. DO NOT COMMIT Track 1 alone yet -- see next_action."
next_action: "SUPERSEDED by the continuation session below -- see the new reasoning_checkpoint block."
```

```yaml
reasoning_checkpoint:
  hypothesis: "F-34.4.2-19's live-reproduced symptom (login window stays open indefinitely, zero log output, no settle of any kind) is caused by a THIRD, previously-set-aside defect becoming live-applicable today: `cookie_domain_matches`'s poll-direction argument order (main.rs:3878-3885, host-first/cookie-domain-second) can NEVER match a cookie whose `domain` attribute carries a leading dot, for ANY host string -- a categorical, host-independent structural fact, not merely the single apex-host case the existing test suite already proves. `_simpleauth_sess`'s live domain today IS `.humblebundle.com` (leading dot), measured independently via a read-only parse of the OS-level WKWebView cookie jar. The poll therefore sees `total > 0` every tick (SUPPORTED_NONEMPTY -- healthy-looking) but `matched` never contains `_simpleauth_sess`, so `checkCookie()` silently `return`s at user.ts:497 forever -- no settle, no log, and (confirmed by code trace) the liveness-heartbeat safety net never fires because it is wired downstream of a `cookieValue` assignment this path never reaches."
  confirming_evidence:
    - "Live discriminator: the SAME cookie value, extracted read-only from disk and fed to the real, unmocked getGamekeys(), returned status:'ok' with 31 gamekeys -- the session is genuinely authenticated, ruling out 'this is just an unauthenticated-looking page' and pointing at the watcher itself."
    - "Live domain measurement (read-only OS-level cookie-jar parse, mtime inside this exact session): _simpleauth_sess's domain is '.humblebundle.com', contradicting the prior 'set aside' spike-014a measurement this session had been trusting as 'proven-correct, pinned'."
    - "Structural, host-independent proof from cookie_domain_matches's own definition: format!(\".{d}\") for any already-dotted d always requires a '..' substring no real hostname can contain, so the poll direction is categorically blind to leading-dot domains -- generalizes beyond the one apex-host test case (main.rs:5734) already in the suite."
    - "Direct code trace: user.ts:494-498's `if (!match) return` has no logging on its path, and user.ts:521's logRejectionStatus/heartbeat is unreachable from it (only reachable after cookieValue is set, which this path never does) -- fully explains the zero-log finding and why the live test's 30-second wait produced no observable change."
  falsification_test: "Add a temporary, redacted (name/domain only, never value) diagnostic log inside humble_login_cookies' completion handler or checkCookie() logging each tick's total/matched-count/first-few-cookie-domains, and confirm live that matched stays empty every tick while total stays >0, for the CURRENTLY open window. If matched is in fact non-empty (i.e. _simpleauth_sess IS found but something else swallows it afterward), this hypothesis is wrong and the defect is elsewhere downstream."
  fix_rationale: "NOT YET APPLIED -- per explicit instruction this turn ('still commit nothing... stay at a checkpoint'). The indicated fix, when authorized, is narrow: flip humble_login_cookies' filter direction to cookie-domain-first/target-second (mirroring humble_login_cookies_for_domain's already-correct, already-tested direction at main.rs:4646, F-6 Defect A's fix) OR normalize both sides (strip/add a leading dot symmetrically) before comparing. Either addresses the root cause (the comparison direction itself) rather than a symptom (e.g. hardcoding a dot onto host_for_filter, which would just move the asymmetry rather than remove it)."
  blind_spots: "The live domain measurement came from the OS-level classic Cookies.binarycookies file, not from an in-process WKHTTPCookieStore.getAllCookies() log inside humble_login_cookies itself -- theoretically these could disagree, though the file's bundle-id-matched name and in-session mtime make that unlikely. Not yet verified live via the falsification_test above (would require a temporary diagnostic log + one more observation window on the SAME still-open login window, which was not attempted this turn to avoid multiplying live-session touches beyond what was authorized). Track 1's frontend fix is independently correct but does not by itself resolve this symptom, since the backend never settles anything in this failure mode."
hypothesis: "Track 2 (why F-34.4.2-19 reproduces live): cookie_domain_matches's poll-direction argument order categorically cannot match a leading-dot cookie domain, and _simpleauth_sess's live domain today has a leading dot -- see reasoning_checkpoint above. NOT YET fix-applied or live-verified. The earlier 08:17:37/no-window incident (separate manifestation, window WAS destroyed) remains its own unresolved sub-mystery -- this new finding does not explain that one, and vice versa; they are two different ways this watch can fail silently or near-silently."
test: "Discriminator: real, unmocked getGamekeys() call via a temporary jest test (deleted after use) against a cookie value extracted read-only from the on-disk WKWebView cookie jar (also deleted after use). Zero-log explanation: desk-based code trace (user.ts, loginWindowSeam.ts, main.rs) plus the same read-only cookie-jar parse for the domain measurement. No live app interaction beyond the read-only filesystem parse -- the running process, the open login window, and its session were never touched, signed out, or reloaded."
expecting: "n/a -- reporting findings only this turn, per explicit instruction not to build the fix or assume the investigation is closed."
next_action: "CHECKPOINT (decision) -- awaiting user/coordinator direction on how to proceed: (a) authorize the narrow cookie_domain_matches direction fix identified above, (b) request the falsification_test's live diagnostic-log confirmation first, or (c) something else. Do not implement, fix, or commit anything until directed."
```

```yaml
reasoning_checkpoint:
  hypothesis: "cookie_domain_matches (main.rs:966-971) is categorically blind to any leading-dot cookie domain for ANY host, because format!(\".{d}\") on an already-dotted d produces an impossible \"..\"-prefixed suffix requirement; this silently breaks the Humble poll arm's filter (main.rs:3878-3885, host-first/cookie-domain-second, DELIBERATELY preserved per the Defect-A comment and Plan 22 -- must NOT be reordered), because _simpleauth_sess's live domain today is '.humblebundle.com' (leading dot)."
  confirming_evidence:
    - "Prior session: structural proof (format!('.{d}') on an already-dotted d requires a literal '..' substring, impossible in any real hostname) plus a live, read-only OS-level cookie-jar measurement showing _simpleauth_sess's domain today IS '.humblebundle.com'."
    - "This turn: the user's directed fix -- normalize by stripping a leading '.' from the `domain` argument INSIDE cookie_domain_matches, leaving the argument order at both call sites untouched -- was hand-verified algebraically, then EMPIRICALLY implemented and run against the full `cargo test domain` suite (13 tests). 12/13 pass unchanged. `tests::humble_login_cookies_for_domain_direction_is_the_defect_a_fix` FAILS at its first assertion: `assert!(!cookie_domain_matches(\"humblebundle.com\", Some(\".humblebundle.com\")))` -- this flips from false (today) to true (post-normalization), because normalizing d to \"humblebundle.com\" makes `host == d` literally true for a BARE-APEX host."
    - "Blast-radius check across every OTHER cookie_domain_matches call site in main.rs (lines 2655, 3881, 3933, 4056, 4132, 4173, 4360, 4595, 4646): in every production call site, the argument that plays the `domain`/second-position role (the one normalization touches) is either a hardcoded dotless literal (`EPIC_COOKIE_DOMAIN = \"epicgames.com\"`, no dot) or a fixed dotless target string (`filter_domain`/`target_domain`/`target`, always literal humblebundle.com-shaped, never leading-dot). The ONLY place a leading-dot value ever reaches the `domain` argument in real production traffic is the poll arm's `c.domain()` (main.rs:3881 macOS, :3933 non-macOS mirror) -- exactly the arm this fix targets. No other production call site's behavior changes."
  falsification_test: "If any OTHER currently-passing cargo test besides humble_login_cookies_for_domain_direction_is_the_defect_a_fix had also failed, or if any production call site besides the poll arm's two branches had a leading-dot literal reachable as its `domain` argument, the 'blast radius is contained to one synthetic test' claim would be wrong. Checked: false -- exactly and only the one test/one assertion breaks; every other call site's second argument is a dotless literal constant, confirmed by direct read of all 9 call sites."
  fix_rationale: "N/A -- this checkpoint is a HALT, not a fix application. Per explicit user instruction: 'If normalization changes ANY currently-passing case, STOP and report it rather than adjusting the existing test to match new behavior.' The main.rs edit was applied, run against `cargo test domain` to get empirical (not just hand-derived) confirmation, then REVERTED -- main.rs is back to its exact pre-session (Track 1 comment-only) baseline; `git diff --stat` and a grep for `cookie_domain_matches` in the diff both confirm zero residual change. No test file was touched. Nothing committed."
  blind_spots: "Did not exhaustively re-derive every RFC 6265 domain-matching edge case (e.g. multi-level leading-dot cookies like '.www.humblebundle.com' seen on the __lt__* cookies) -- only the specific cases the user asked to be walked through (poll-direction, reference-arm-direction, both dotless controls) plus the one test failure this surfaced. The broader question of whether cookie_domain_matches's `==` branch should ever be reachable with an apex host at all (vs. only ever being invoked with `www.`-prefixed hosts in this codebase) was not investigated -- it's possible the `==` branch is dead code in every REAL caller and only ever exercised by tests, which would make the whole conflict moot for production but not for test-suite correctness."
```

**HALTED per explicit instruction -- awaiting user decision before any further code change.**

The finding, precisely: the directed fix (normalize the leading dot INSIDE `cookie_domain_matches`, argument order at both call sites left untouched) is algebraically and empirically correct for the poll arm's real production case (`host = "www.humblebundle.com"`, `d = ".humblebundle.com"` -> normalizes to a true match). It also, as a side effect, flips ONE existing unit test: `humble_login_cookies_for_domain_direction_is_the_defect_a_fix`'s first assertion (main.rs, near line 5744) — `assert!(!cookie_domain_matches("humblebundle.com", Some(".humblebundle.com")))` — from currently-passing (false) to failing (the expression now evaluates true).

Why: that assertion uses a BARE-APEX host (`"humblebundle.com"`, no `www.`) to characterize the OLD/poll direction as unconditionally broken for leading-dot cookie domains. Once the comparator is fixed to strip the leading dot before comparing, a leading-dot domain correctly matches its own bare apex too — that is the RFC 6265-correct behavior (a `.example.com` cookie is defined to apply to `example.com` itself, not only its subdomains), not a new bug. The test's expectation was itself shaped by the very defect being fixed.

Blast radius, checked directly: no OTHER cargo test breaks (12/13 in the `domain`-filtered suite still pass, confirmed by an actual `cargo test domain` run, not just hand algebra), and no OTHER production call site of `cookie_domain_matches` is affected — every other call site's `domain`/second-position argument is a fixed dotless literal (`EPIC_COOKIE_DOMAIN`, `filter_domain`, `target_domain`, `target`), never a leading-dot value. The non-macOS mirror of the poll arm (main.rs:3933) shares the exact same host/domain shape as the macOS poll arm and would receive the identical, intended repair — a bonus, not a regression.

**Decision needed:** (a) accept this as correct, RFC-6265-compliant, in-scope behavior and update that one test's first assertion + its surrounding prose to document the corrected semantics (recommended — it is the ONLY test conflict found, is provably correct per spec, and does not touch the Plan-22-protected argument-order decision at all), or (b) choose a different, more surgical normalization shape that preserves today's exact bare-apex-vs-leading-dot behavior (e.g. normalizing only inside the `ends_with` branch, leaving the `==` branch comparing the raw un-stripped `d`) even though that is a more awkward, asymmetric comparator and arguably re-introduces the same kind of special-casing that caused Defect A, or (c) something else. Per instruction, not proceeding past this point (no test edits, no TS logging fix, nothing committed) until directed.

**RESOLVED this turn — user chose (a).** See the reasoning_checkpoint immediately below for the fix implementation, and Resolution for the final state.

```yaml
reasoning_checkpoint:
  hypothesis: "cookie_domain_matches (main.rs:966-971) is categorically blind to any leading-dot cookie domain because format!('.{d}') on an already-dotted d requires an impossible '..'-prefixed suffix. Normalizing (stripping) a leading dot from the `domain` argument before comparing, with argument order left untouched at both call sites, fixes the poll arm's real production case (host='www.humblebundle.com', d='.humblebundle.com' -> now matches) and is RFC-6265-correct (a `.example.com` cookie applies to `example.com` itself, not only subdomains)."
  confirming_evidence:
    - "Empirically re-verified this turn: with the OLD comparator, 3 targeted assertions (the rewritten defect-a test's positive form, plus 2 new dedicated leading-dot tests at both host shapes -- apex and 'www.'-subdomain) all FAIL (RED), exactly as predicted, while all 13 pre-existing `domain`-suite tests continue to pass unchanged."
    - "After applying the normalization, all 16 tests in `cargo test domain` pass (GREEN), and the full `cargo test` suite (119 tests, all of main.rs) passes with 0 failures -- no blast radius beyond the targeted comparator."
    - "Blast-radius check (re-confirmed from last turn, unchanged): every OTHER `cookie_domain_matches` call site's `domain`/second-position argument is a fixed dotless literal (EPIC_COOKIE_DOMAIN, filter_domain/target_domain/target) -- the poll arm's `c.domain()` is the ONLY production call site where a leading-dot value ever reaches that argument."
  falsification_test: "If `cargo test` (full suite, not just the `domain` filter) had shown ANY other failure after the fix, or if a live re-open of the Humble login flow (human-verify checkpoint, not yet performed) failed to write `isLoggedIn: true`, this would be wrong. The full-suite run is green; the live check is the remaining, explicitly deferred step -- see the checkpoint returned to the user."
  fix_rationale: "Directly addresses the root cause (the comparator's own leading-dot blindness), not a symptom -- normalizes the VALUE being compared, leaves the argument-order DECISION (Plan 22, Defect A) completely untouched at both call sites, matching the user's explicit instruction not to re-litigate that decision."
  blind_spots: "Live end-to-end verification (does a freshly-reopened Humble login window against the still-authenticated session actually reach `isLoggedIn: true` and render Logout?) has NOT been performed this turn -- self-verification is unit/integration-test-only, exactly as flagged in the checkpoint returned to the user below. The LogWriter write-ordering race (Track 2's earlier, separate finding) and the TRUE original cause of the 08:17:37 window destruction remain outside this fix's scope, as previously recorded."
next_action: "SUPERSEDED -- see Resolution below and the CHECKPOINT REACHED (human-verify) return for the live test procedure."
```

**CLOSED this turn.** Human-verify checkpoint CONFIRMED: user reproduced the fix live twice, and
the coordinator independently cross-checked `humble_store/config.json` on disk (75 bytes,
`isLoggedIn = True`, mtime moved off its stuck Aug 6 13:52 baseline for the first time all
session). Both commits landed (see Resolution.commits). Three residuals recorded in Resolution
and in `deferred-items.md` (F-34.4.2-21, F-34.4.2-22, F-34.4.2-23) — none fixed this session.
Phase 34.4.2's own gate has not been re-run; that is separate, owed work. next_action: none — this
debug session is complete.

## Evidence

- timestamp: 2026-08-06 (gate run RERUN-5, recorded by the operator)
  observation: "`humble_store/config.json` unchanged at 2 bytes, mtime Aug 6 13:52, across the entire session — verified by both `wc -c` and `ls -la`."
  source: ".planning/phases/34.4.2-macos-login-window-ux-modal-child-window-attachment-in-field/34.4.2-LIVE-GATE-RERUN-5.md"
  means: "The `configStore.set('isLoggedIn', true)` write at user.ts:635 did not occur. This is filesystem-channel evidence, independent of any log sink."

- timestamp: 2026-08-06
  observation: "The Humble login-window cookie watcher's `gamelib.log` sink emitted nothing for the sheet's whole duration."
  source: "same"
  means: "Recorded as silence only. Given the known invisible-sidecar-logging constraint, this does NOT establish that the watcher failed to run."

- timestamp: 2026-08-06
  observation: "No Logout control and no login form was ever observed rendered; the sheet was held open indefinitely."
  source: "same"
  means: "Both frontend branches of `Runner`'s isLoggedIn conditional are unreachable in this state — consistent with the store write never landing, and not yet distinguishing frontend from backend fault."

- timestamp: 2026-08-08 08:17:37 (fresh, ~10 min before this investigation session started; confirmed via `stat` mtime match on gamelib.log and current wall-clock `date`)
  observation: "Live `~/Library/Logs/GameLib/gamelib.log` (currently-running `npm run tauri:dev` instance, pid 42138) recorded: `Humble login-window cookie read UNSUPPORTED_OR_ERROR for window loginwin-0-18c99f4655f72e30-ca5b183b -- aborting watch` immediately followed by `Humble login-window cookie read failed: Error: humble_login:no-window:loginwin-0-18c99f4655f72e30-ca5b183b`. `~/Library/Application Support/gamelib/humble_store/config.json` is STILL `{}` (2 bytes, mtime unchanged since Aug 6 13:52), confirming this fresh failure also never reached `finishLogin()`."
  source: "direct read of ~/Library/Logs/GameLib/gamelib.log, live filesystem check"
  means: "DECISIVE, CURRENT evidence (not stale Aug 6 data) that the poll's `seam.cookies()` call fails because Tauri's `app.get_webview_window(label)` no longer finds the window (src-tauri/src/main.rs:3831-3833's `.ok_or_else(|| format!(\"humble_login:no-window:{label}\"))`). This is a DIFFERENT manifestation than the Aug 6 gate run's total silence (that run may have wedged before ever reaching this error, or the window there was never closed) — but it proves the 'window becomes unavailable mid-poll' failure mode is real and reproducible today, not hypothetical."

- timestamp: 2026-08-08
  observation: "src-tauri/src/main.rs:3739-3760: the login window's `on_window_event` handler pushes a `login_event_value(\"closed\", \"\")` onto `LOGIN_WINDOW_EVENTS` on `WindowEvent::Destroyed`, and the code's own comment states: 'humble/user.ts's own takeEvents() consumer (watchForLogin()) only ever checks for 'finished', so a 'closed' entry passing through it is inert.' Confirmed directly in src/backend/humble/user.ts:409-410: `if (events.some((event) => event.event === 'finished')) { armDeadline(); forceValidation = true }` — no branch anywhere checks for `'closed'`."
  source: "src-tauri/src/main.rs:3701-3760 (code comment + implementation), src/backend/humble/user.ts:402-419"
  means: "By design, the JS poll has no fast/clean signal for 'the window you're polling just closed' — it only discovers this one tick later via the stringly-typed `no-window` error from the next `seam.cookies()` call. This is a real gap: a `'closed'` event forcing an immediate `settle({status:'error'})` (or at least an immediate deadline/poll stop) would surface the failure faster, but does not by itself explain WHY the window closes."

- timestamp: 2026-08-08
  observation: "src/frontend/screens/WebView/index.tsx:313-324 (`runHumbleLoginWatch`): `const result = humble.expired ? await window.api.humbleReconnect() : await window.api.humbleStartLogin(); if (!mounted) return; if (result.status === 'done') { await humble.login(result); navigate('/login') }` — there is no `else` branch and no handling anywhere else in this effect for `result.status === 'error'` or `result.status === 'waiting'`."
  source: "direct read of src/frontend/screens/WebView/index.tsx:308-335"
  means: "CONFIRMED, independent frontend defect: when `startLogin()`/`reconnect()` resolves with anything other than `{status:'done'}`, this effect does nothing at all — no error toast, no retry, no fallback UI, no navigation back to `/login`. Combined with the backend's `settle({status:'error'})` behavior (previous evidence entries), this fully explains why the user sees neither a rendered Logout control nor a rendered login form: the route just sits inert after the promise resolves with 'error', with no code path to recover or surface the failure."

- timestamp: 2026-08-08
  observation: "Explored (not confirmed) an alternative hypothesis: `cookie_domain_matches`'s poll-direction argument order (`humble_login_cookies` in src-tauri/src/main.rs:3879, `cookie_domain_matches(&host_for_filter, Some(&c.domain().to_string()))` with `host_for_filter = 'www.humblebundle.com'` fixed) is the SAME asymmetric direction the project's own test suite documents as broken for leading-dot cookie domains (`humble_login_cookies_for_domain_direction_is_the_defect_a_fix`, main.rs:5731-5746: `!cookie_domain_matches(\"humblebundle.com\", Some(\".humblebundle.com\"))`). However, `.planning/phases/34.4.1-.../34.4.1-22-SUMMARY.md:66` explicitly states this exact poll direction is 'proven-correct... left untouched and pinned by test on both the TS and Rust sides', based on spike 014a's live measurement (`.claude/skills/spike-findings-gamelib/references/tauri-login-webview-cookies.md:46-47`) that `_simpleauth_sess`'s domain is `'humblebundle.com'` WITHOUT a leading dot."
  source: ".planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/34.4.1-22-SUMMARY.md, .claude/skills/spike-findings-gamelib/references/tauri-login-webview-cookies.md, .planning/phases/34.4.1-.../34.4.1-SPIKE-016-FINDINGS.md"
  means: "SET ASIDE, not eliminated with certainty: spike 014a's dot-less measurement was taken via wry's OLD blocking `.cookies()` API; the poll arm was LATER switched to the native `WKHTTPCookieStore.getAllCookies()` mechanism (F-34.4.2-12 gap-cycle-4) without re-verifying this specific domain-string assumption against the new API. Spike 016 (which DID use the native mechanism, against a real signed-in session) measured this exact argument-order/direction undercounting 4 of 33 live cookies (29/33) — but did not identify by name which 4 were dropped, so it neither confirms nor refutes that `_simpleauth_sess` is among them. Superseded in priority by the more direct, decisive `no-window` evidence above, which explains the failure without requiring this theory. Not pursued further to avoid disturbing the live session with a live cookie-domain probe; flagged as a residual worth a dedicated live check if the primary fix does not fully resolve the finding."

- timestamp: 2026-08-08
  observation: "User checkpoint response, verbatim facts: (a) no Humble login window/sheet is visible on screen right now — it is gone. (b) User has no recollection of clicking Cancel, pressing Esc, reloading, or a second login/reconnect around 08:17:37 — explicitly NOT to be read as a denial, only as absence of recollection."
  source: "user checkpoint response, this session"
  means: "(a) is consistent with a genuinely destroyed (not merely hidden) window, matching the no-window Rust error. (b) is weak evidence only — per the user's own instruction, no candidate trigger (cancel-strip, Esc, reload, second login) is eliminated on this basis alone."

- timestamp: 2026-08-08
  observation: "Full read of gamelib.log (55 lines, mtime 08:29 today): exactly ONE humble-related pair of WARNING lines exists in the entire file, both at 08:17:37 (UNSUPPORTED_OR_ERROR then no-window). The preceding frontend/backend log activity is from the PREVIOUS calendar day, 19:07:38 (a WebView store/wiki deferral log line) — a ~13-hour gap with zero log entries between them except one unrelated `Steam QR session timed out` at 08:06:12 today. Exactly one `loginwin-0-18c99f4655f72e30-ca5b183b` window label appears anywhere in the file — no second label, no evidence of window-label churn or a second `humble_login_open`."
  source: "direct read of ~/Library/Logs/GameLib/gamelib.log"
  means: "No evidence of a second concurrent `humble_login_open` or StrictMode-driven window churn survives into this log window. Absence of any log line at all during the 13-hour gap is EXPECTED and uninformative on its own — most of the poll's non-error paths (SUPPORTED_BUT_EMPTY, throttled rejections after the first) log nothing or log only WARNING-level, and this file only captures WARNING/INFO/DEBUG lines actually emitted, not a heartbeat."

- timestamp: 2026-08-08
  observation: "`grep -c '\\[shell\\]' ` against BOTH the live gamelib.log and a 351KB historical rotated log returns 0 matches in every case. The Rust arm's own `eprintln!(\"[shell] ...\")` diagnostics (e.g. `humble_login_open: presentation requested...`, confirmed present in main.rs source) NEVER appear in gamelib.log, in any captured session, ever."
  source: "direct grep of ~/Library/Logs/GameLib/gamelib.log and gamelib.log.34.5-g6-gate2"
  means: "gamelib.log cannot answer WHEN (or whether) the Humble login window was originally opened, nor whether it was opened more than once — that information is only available via the Rust process's own stderr (visible in the `npm run tauri:dev` terminal directly), which is not captured to any file this investigation can read retrospectively. This is a genuine, structural evidentiary gap, not merely an absence-is-uninformative situation."

- timestamp: 2026-08-08
  observation: "`pgrep -fl gamelib-shell` shows exactly ONE gamelib-shell process (pid 42138) currently alive, matching the single unbroken bootstrap sequence (one `[bootstrap] GAMELIB_SHELL_EXE received=...` block, timestamped 13:51:03, with no repeated bootstrap block anywhere in the log)."
  source: "direct `pgrep` + gamelib.log read"
  means: "No concurrent second app instance is running now, and the log shows no evidence of a second instance having run and split the sink during this dev session (a repeated bootstrap sequence would be the tell — see the project's own `concurrent-instance-splits-shell-sink` precedent). Cannot retroactively rule out a second instance existing only transiently overnight and exiting before this check, but the single-bootstrap log is the strongest available evidence against it."

- timestamp: 2026-08-08
  observation: "`pmset -g log` shows the machine cycling through many brief 'Idle Sleep'/'Maintenance Sleep' -> 'DarkWake from Deep Idle' pairs continuously overnight (roughly 20:17 through 07:22), then a `DarkWake to FullWake from Deep Idle ... due to HID Activity` at 08:01:50 — the first REAL (user-input-driven) wake of the morning. `Total Sleep/Wakes since boot: 3489`. The Humble no-window error (08:17:37) follows this real wake by ~16 minutes; the unrelated Steam QR timeout (08:06:12) follows it by ~4 minutes."
  source: "`pmset -g log` (macOS power management log)"
  means: "Strong TIMING correlation only, not proof of mechanism: the definitive discovery of the dead window happened shortly after the first real user-facing wake of the day, following an extended overnight period of intermittent sleep/wake cycling. This is CONSISTENT with an overnight sleep/wake-related window teardown, but does not distinguish that from an alternative reading (the window died earlier, e.g. during yesterday's session, and simply sat unobserved through the night while the poll — which should keep running through brief DarkWake periods for a foreground, non-App-Nap'd process — eventually logged the failure this morning). Given ~3489 sleep/wake cycles since boot with this SAME dev process staying alive and undisturbed throughout (no crash, no restart), routine sleep/wake cycling clearly does NOT reliably destroy this app's own windows in general, weakening (but not eliminating) the sleep/wake theory as the specific mechanism here."

- timestamp: 2026-08-08
  observation: "Direct read of src-tauri/src/main.rs: no NSWorkspace sleep/wake notification observer, no `willSleepNotification`/`didWakeNotification` handler, and no time-based/idle-based window-teardown logic exists anywhere in the file."
  source: "grep across src-tauri/src/main.rs for sleep/wake/NSWorkspace/didWake/willSleep -- zero matches beyond doc-comment prose"
  means: "Rules out an INTENTIONAL app-level 'tear down login windows on sleep' behavior as the mechanism. If sleep/wake is involved at all, it would have to be an OS-level side effect on the WKWebView-backed NSWindow surviving the cycle, not anything this codebase does on purpose."

- timestamp: 2026-08-08
  observation: "Direct read of the Esc monitor (main.rs:5206-5289) and the cancel-strip injected script (main.rs:1394+): the Esc monitor is a LOCAL (app-scoped) NSEvent monitor requiring (1) at least one presented sheet, (2) bare keyCode 53 with NO Command/Option/Control modifiers, (3) the event's own NSWindow address to match a currently-presented sheet's NSWindow exactly. The cancel strip is a script injected into the login page's own DOM, dismissed only via an actual click event inside that page. Neither can fire without a genuine, matching user input delivered to the app while it is key."
  source: "direct read of src-tauri/src/main.rs:1394-1490, 5206-5289"
  means: "Both mechanisms are well-scoped against spontaneous/non-gestural firing. Per the user's own instruction this does NOT eliminate either as a candidate (a real, unrecalled keypress or click remains possible) — it only rules out a code-level 'fires on its own' defect in either path."

- timestamp: 2026-08-08
  observation: "GATE-DOCUMENT DISCREPANCY (per user directive, recorded for future-run weighting): `34.4.2-LIVE-GATE-RERUN-5.md` (2026-08-06) recorded the Humble login-window cookie watcher's gamelib.log sink as emitting 'nothing at all' for the sheet's whole duration. This session's OWN live evidence (the 08:17:37 entries, today) directly shows the watcher DOES log — it produced two WARNING lines the moment its poll detected the window was gone. The two observations are not necessarily contradictory (the Aug 6 run may never have reached an error/warning-worthy poll tick before the operator stopped the session), but RERUN-5's silence observation should NOT be read as 'the watcher never logs' — it evidently does, under at least the no-window/UNSUPPORTED_OR_ERROR condition. Future runs should weight that document's silence claims accordingly."
  source: "34.4.2-LIVE-GATE-RERUN-5.md vs. this session's direct gamelib.log read"
  means: "RERUN-5's silence finding is downgraded from 'the watcher is silent' to 'the watcher was silent for the DURATION THAT RUN OBSERVED', a materially weaker claim."

- timestamp: 2026-08-08 (Track 2 continuation — user-supplied lead: WR-03's 10-minute watch deadline)
  observation: "User-supplied fact, code-confirmed: `LOGIN_WATCH_TIMEOUT_MS = 10 * 60_000` (user.ts:71); `armDeadline()` (user.ts:549-556) sets a `setTimeout` calling `settle({status:'waiting'})`; `armDeadline()` is called unconditionally once at watch setup (user.ts:556) and re-armed only by a main-frame `finished` nav event via `forceRevalidate()` (user.ts:434-437, 562-567). Re-examined the RAW LOG ORDER of the 08:17:37 pair by re-reading the still-present rotated file directly (`~/Library/Logs/GameLib/gamelib.log.old`, lines 42-43, confirmed byte-identical to the debug-file's earlier paraphrase): line 42 = `UNSUPPORTED_OR_ERROR ... aborting watch`, line 43 = `cookie read failed: Error: humble_login:no-window:...` — UNSUPPORTED_OR_ERROR log FIRST, catch-log SECOND."
  source: "direct read of ~/Library/Logs/GameLib/gamelib.log.old:42-43; src/backend/humble/user.ts:71, 384-490, 549-556"
  means: "Set up the ordering question the user asked to resolve — see next three entries."

- timestamp: 2026-08-08
  observation: "STRUCTURAL PROOF that this order is impossible from a single checkCookie() invocation's `catch → classify` sequence taken at face value: `classifyCookieRead({total, ...})` (loginWindowSeam.ts:243-254) returns `UNSUPPORTED_OR_ERROR` ONLY when `total === null`; `total` is declared `let total: number | null` with NO initializer (user.ts:446) and is set to `null` EXCLUSIVELY inside the `catch` block (user.ts:462-467), which unconditionally logs `'Humble login-window cookie read failed:'` in that SAME statement group, BEFORE `classifyCookieRead` is ever called (user.ts:469-489). Confirmed the concrete Tauri seam (`createRustLoginWindowSeam().cookies()`, humbleLoginFlowRegistration.ts:182-203) has NO path back to user.ts's catch other than throwing — it either resolves a well-typed `{total: number, matched: [...]}` or explicitly `throw`s on a missing/non-numeric `total` (never resolves with `total: null`). Therefore: any invocation reaching the `UNSUPPORTED_OR_ERROR`/'aborting watch' log MUST, in that same invocation, have ALREADY logged its own 'cookie read failed' line for the identical error, strictly before it."
  source: "src/backend/humble/loginWindowSeam.ts:243-254; src/backend/humble/user.ts:446-490; src/backend/sidecar/humbleLoginFlowRegistration.ts:182-203"
  means: "The file's observed order (UNSUPPORTED_OR_ERROR then cookie-read-failed) cannot be one invocation's own catch-then-classify sequence taken naively — it requires either two overlapping invocations, or a write-order inversion at the logger layer. Both are examined next."

- timestamp: 2026-08-08
  observation: "Direct read of `src/backend/logger/log_writer.ts:81-125` (`writeString`) and `src/backend/logger/index.ts:16-27`: the write-serialization gate (`this.#messageWaitPromise`) is `await`ed (line 105) BEFORE it is reassigned (line 111, only inside the `message instanceof Promise` branch) — two `writeString()` calls issued in the same synchronous JS stretch (no `await` between them) both read the SAME pre-update gate value and race independently to their own `fsPromises.appendFile()`. None of `checkCookie()`'s `logWarning()` call sites are `await`ed — confirmed by `index.ts:22-24`'s own wrapper (a block-body function that calls and discards `heroicLogWriter.logWarning(...)`'s returned Promise) and by `index.ts:36-38`'s own comment naming `logWarning` explicitly as one of the callers that 'silently drops' the promise. The catch's message (`['Humble login-window cookie read failed:', err]`) carries an `Error` object needing more `formatLogMessage` work than the classify's message (a plain template string) — giving the simpler, later-issued write a realistic path to WIN the race and land on disk first."
  source: "src/backend/logger/log_writer.ts:81-125; src/backend/logger/index.ts:16-38"
  means: "CONFIRMED, real (and separate) `LogWriter` defect: `writeString()`'s serialization is not robust against two unawaited, near-simultaneous callers. This gives a fully self-contained mechanism for a SINGLE checkCookie() invocation's own two log lines to land on disk in the OPPOSITE of their true call order — no second overlapping poll tick required. Given this mechanism requires no lost/coalesced log line (Occam's-razor-preferred over a two-tick theory that would additionally require positing a lost first log line from whichever tick closed the window), the best-supported reading is: **this WAS a single checkCookie() invocation whose own `seam.cookies()` call threw `humble_login:no-window:...` — i.e., the window was ALREADY destroyed by the time THIS poll tick tried to read it.** This tick's own `settle({status:'error'})` (and its floated `seam.close()`) is a downstream, harmless no-op reaction to an already-dead window, not the ORIGINAL destroyer. A second-invocation explanation (an earlier tick closing the window via its own UNSUPPORTED_OR_ERROR, with THAT tick's own catch-log lost) remains a live alternative but is less parsimonious and is not preferred here."

- timestamp: 2026-08-08
  observation: "Traced whether `armDeadline()`'s deadline-triggered `settle({status:'waiting'})` could itself produce the 'aborting watch' log line, via `checkCookie()`'s three `if (settled || validationInFlight) return` guards (user.ts:385, 444, 469). If `settled` becomes `true` (via the deadline) at ANY point before or during a tick's execution, that tick can reach AT MOST the guard at line 469 — immediately after its own `seam.cookies()` call, and STRICTLY BEFORE `classifyCookieRead()`/the 'aborting watch' log (user.ts:472-489) are ever reached."
  source: "src/backend/humble/user.ts:385, 444, 469, 472-489, 549-556"
  means: "DECISIVE, STRUCTURAL: the WR-03 ten-minute deadline is RULED OUT as the trigger for the 08:17:37 pair — not weakly correlated, but impossible by the code's own control flow. A deadline-triggered settle() can, at most, produce a LONE 'cookie read failed: ...no-window...' line from a tick caught mid-flight by the deadline's own window-close; it can NEVER also produce the 'aborting watch'/UNSUPPORTED_OR_ERROR line, and its status is always 'waiting', never 'error'. The 08:17:37 pair is unambiguously an 'error'-path settle originating from checkCookie()'s OWN cookie-read verdict logic, not a 'waiting'-path deadline settle. This directly answers the user's item 1: no, settle() did not close the window while a poll tick was in flight in the way framed by the deadline lead — the poll tick discovered an ALREADY-dead window from a still-unidentified cause, not one it (or the deadline) created itself."

- timestamp: 2026-08-08
  observation: "Timing check performed as instructed, without forcing the fit. `LOGIN_WATCH_TIMEOUT_MS` = exactly 10:00 (user.ts:71). HID wake (`pmset -g log`, prior evidence) at 08:01:50; error pair at 08:17:37. Gap = 15 minutes 47 seconds — 5:47 longer than a single 10:00 deadline armed exactly at wake would produce. No evidence of an intervening re-arm exists: gamelib.log shows exactly one window label (`loginwin-0-18c99f4655f72e30-ca5b183b`) for the whole session with no second `humble_login_open` and no other nav-event trace (prior evidence), and Rust's own `[shell]` stderr (which would show the window's true open time) never reaches gamelib.log at all — confirmed zero `[shell]` matches in both the live log and a 351KB historical rotated log (prior evidence)."
  source: "pmset -g log (prior evidence entry); src/backend/humble/user.ts:71; gamelib.log direct read"
  means: "Even independent of the structural elimination above, the raw 15:47 gap does not cleanly fit a wake-anchored 10:00 deadline without positing an unevidenced re-arm — consistent with, and reinforcing, the structural ruling-out rather than contradicting it."

- timestamp: 2026-08-08
  observation: "Web-verified (see this turn's sources): on macOS, Node/libuv's timer implementation has historically derived monotonic time from `mach_absolute_time()`, which does NOT advance while the system is asleep (unlike `mach_continuous_time()`, which does) — a documented libuv issue additionally notes an epoch-reset edge case after long low-battery sleeps that can cause erratic/early timer behavior. No NSWorkspace sleep/wake observer exists anywhere in main.rs (already established in a prior evidence entry) — there is no app-level correction for either effect."
  source: "web search this turn (libuv/libuv#2891, Apple mach_absolute_time/mach_continuous_time docs); src-tauri/src/main.rs (prior evidence entry, no sleep/wake observer)"
  means: "LOAD-BEARING for any FUTURE deadline-timing correlation in this app, recorded per the user's explicit instruction: a `setTimeout`-based deadline's wall-clock firing time cannot be reliably predicted across a sleep-heavy period (last night logged ~3489 cumulative sleep/wake cycles) — elapsed wall time and elapsed awake time diverge whenever sleep intervenes, and could in principle also fire early under the documented epoch-reset bug. Does not change today's conclusion (the deadline is structurally ruled out for THIS incident regardless of timing) — it means the timing entry above is a supporting, not decisive, data point; the three-guard structural proof is the decisive one."

- timestamp: 2026-08-08 (continuation session — live test round 2: error path NOT exercised, window still open after 30s)
  observation: "Coordinator-relayed facts, checked before relaying: `~/Library/Logs/GameLib/gamelib.log` is 2113 bytes, process RESTARTED 09:17:34 (a fresh instance, distinct from the 08:17:37 incident), contains ONLY bootstrap lines — zero Humble login-watch lines of any kind (no cookie read, no no-window, no aborting-watch, no rejection, no liveness heartbeat). `humble_store/config.json` still 2 bytes `{}`, mtime unchanged since Aug 6. User confirms the Humble login window is still open and visibly showing an authenticated-looking humblebundle.com page."
  source: "coordinator checkpoint relay, this session"
  means: "This is a THIRD distinct manifestation, different from both the RERUN-5 total-silence case and the 08:17:37 no-window case: this time the window is confirmed still OPEN and the app process is confirmed freshly alive (09:17:34 boot), yet the watch produces literally zero log output for the whole 30+ second test window. Sets up the gamekeys discriminator and the zero-log investigation below."

- timestamp: 2026-08-08
  observation: "PRIMARY DISCRIMINATOR, executed read-only per the hard constraints. The live `_simpleauth_sess` cookie value was obtained WITHOUT touching the running app process or the open login window: read directly (byte-parsed, Apple's documented binary-cookie record format) from `~/Library/HTTPStorages/gamelib-shell.binarycookies` — the on-disk WebKit default-data-store cookie jar for THIS app's bundle (`com.gamelib.shell`, confirmed via `src-tauri/tauri.conf.json:5`; filename `gamelib-shell` matches the app's own process/product name). File mtime was 09:18, one minute after the 09:17:34 boot — i.e. written during THIS exact live session, not stale. The extracted cookie value was fed to the REAL, unmocked `getGamekeys()` (src/backend/humble/adapter.ts:570-628) via a temporary, manual jest test (`src/backend/humble/__tests__/_diag_live_gamekeys_probe.test.ts`, axios NOT mocked so the call hit Humble's real `/api/v1/user/order` endpoint) — deleted immediately after the single run, alongside the scratch file holding the extracted cookie value. Result: `status: 'ok', gamekeyCount: 31`. Never logged the cookie value or response body — status/count only."
  source: "read-only parse of ~/Library/HTTPStorages/gamelib-shell.binarycookies; one-off jest run of src/backend/humble/adapter.ts's real getGamekeys() (deleted after use, per user's explicit instruction not to leave diagnostic scaffolding behind)"
  means: "DECISIVE per D-16: `status: 'ok'` from `/api/v1/user/order` is the authoritative proof of login (Humble hands the same cookie shape to anonymous visitors, so only the endpoint's own verdict is trustworthy). The session IS genuinely authenticated right now. This directly answers the user's question ('can't you detect if there is a valid session already open?') — yes, and the answer is yes, it IS valid. This RULES OUT candidate (i) (apparently-logged-in-but-actually-isn't) for the CURRENT live session, and points decisively at candidate (ii)/(iii): the WATCHER itself is failing to read or act on a cookie that is genuinely good. See the next three entries for the specific mechanism."

- timestamp: 2026-08-08
  observation: "Same read-only binarycookies parse (see previous entry) also recorded EVERY Humble cookie's `domain` field, not just the value. `_simpleauth_sess`'s domain is `.humblebundle.com` — WITH a leading dot. So are `csrf_cookie`, `optimizelyEndUserId`, and every other apex-scoped Humble cookie in the jar; only `fu` (domain `www.humblebundle.com`, no leading dot) and two `__lt__*` cookies (domain `.www.humblebundle.com`) differ."
  source: "direct byte-level parse of ~/Library/HTTPStorages/gamelib-shell.binarycookies"
  means: "DIRECTLY CONTRADICTS the earlier 'set aside' evidence entry's premise (spike 014a's measurement, taken via wry's OLD blocking `.cookies()` API, that `_simpleauth_sess`'s domain is 'humblebundle.com' WITHOUT a leading dot). This is a fresh, independent, TODAY measurement of the exact same cookie, via a different layer (the OS-level default WKWebView data store CFNetwork writes to) than either the old wry API or the new WKHTTPCookieStore poll. Residual, honestly-flagged blind spot: this reads the classic on-disk cookie-jar file, not WKHTTPCookieStore.getAllCookies() in-process — theoretically these two could disagree, but (a) this file's naming/bundle-id match and (b) its mtime landing inside THIS exact live session's window make it very unlikely to be a different store than the one the Rust poll itself reads from (both are WKWebView's DEFAULT, unconfigured persistent data store per main.rs's own doc comment at line 2601 — 'uses no custom websiteDataStore'). Not yet closed by an in-process log of `c.domain()` from inside `humble_login_cookies` itself (not attempted this session, to avoid disturbing the live window further than the read-only file parse already did)."

- timestamp: 2026-08-08
  observation: "STRUCTURAL proof, generalizing beyond the existing Rust test suite: `cookie_domain_matches(host, Some(d))` (main.rs:966-971) returns `host == d || host.ends_with(&format!(\".{d}\"))`. Whenever `d` itself already begins with a leading dot (e.g. `.humblebundle.com`), `format!(\".{d}\")` becomes `\"..\" `-prefixed (e.g. `..humblebundle.com`) — a substring containing two consecutive dots, which cannot appear in any legitimate hostname (`host_for_filter` here is always a plain hostname string, e.g. `www.humblebundle.com`). Therefore `cookie_domain_matches(ANY_HOST, Some(LEADING_DOT_DOMAIN))` is FALSE for every possible `ANY_HOST`, unconditionally — not just for the specific apex-host case the existing test `humble_login_cookies_for_domain_direction_is_the_defect_a_fix` (main.rs:5734, using host=`\"humblebundle.com\"`) already proves. `humble_login_cookies`'s poll arm (main.rs:3878-3885) calls `cookie_domain_matches(&host_for_filter, Some(&c.domain().to_string()))` — the caller's fixed host FIRST, the cookie's own domain SECOND — exactly the direction this generalized proof condemns. `host_for_filter` is `'www.humblebundle.com'`, passed verbatim from `seam.cookies(seamLabel, 'www.humblebundle.com', ['_simpleauth_sess'])` (src/backend/humble/user.ts:455-459)."
  source: "src-tauri/src/main.rs:966-971 (cookie_domain_matches), :3878-3885 (humble_login_cookies poll-arm filter), :5734-5747 (existing Defect-A-direction tests); src/backend/humble/user.ts:455-459"
  means: "Combined with the previous entry's live measurement (`_simpleauth_sess`'s actual domain today IS `.humblebundle.com`, leading dot), this is no longer a theoretical/set-aside concern: `humble_login_cookies`'s poll-direction filter categorically CANNOT ever place `_simpleauth_sess` into its `matched` array while its domain attribute carries a leading dot, regardless of which host string is queried. `total` (unfiltered `all_cookies.len()`, main.rs:3868) stays healthy and positive every tick (Humble sets 20+ cookies), so `classifyCookieRead` always returns `SUPPORTED_NONEMPTY` (loginWindowSeam.ts:250-251) — never `UNSUPPORTED_OR_ERROR` or `UNDECIDABLE` — so none of THOSE verdicts' log lines ever fire either."

- timestamp: 2026-08-08
  observation: "Direct read of user.ts's `checkCookie()`, SUPPORTED_NONEMPTY branch (user.ts:494-498): `const match = matched.find((c) => c.name === '_simpleauth_sess'); if (!match) return; cookieValue = match.value`. This early `return` on `!match` has NO log call anywhere on its path — not a `logWarning`, not `logInfo`, nothing. Traced forward: the ONLY liveness-heartbeat mechanism in this file (`logRejectionStatus()`, guarded by `LOGIN_WATCH_LIVENESS_LOG_INTERVAL_MS`, user.ts:326-350, whose own design comment at :309-321 explicitly states its purpose is so a noise-reduction fix 'cannot create silently wedged') is called ONLY from inside `runValidation`'s rejection path (user.ts:521), which is only reachable AFTER `cookieValue` is successfully set (user.ts:501's `if (cookieValue === undefined) return` gate) and a validation attempt actually runs. The `!match` early-return at :497 exits BEFORE `cookieValue` is ever assigned — so `runValidation` and `logRejectionStatus` (and its heartbeat) are never invoked at all on this path."
  source: "direct read of src/backend/humble/user.ts:444-521"
  means: "RESOLVES THE SECOND TASK. The zero-log finding is now fully explained, not merely 'consistent with': the watch is very likely running normally, ticking on schedule, correctly observing `total > 0` (SUPPORTED_NONEMPTY, healthy-looking) every single tick — but silently, permanently failing to find `_simpleauth_sess` inside `matched` because of the domain-direction defect proven above, and returning with zero log output each time. This is a genuine, confirmed GAP in the liveness-heartbeat safety net the code's own design comment describes: the heartbeat guards against one wedge shape (repeated rejected validation candidates) but not this earlier, silent 'candidate cookie never found in the filtered set at all' wedge shape, which never reaches the code the heartbeat is wired into. This also fully explains why the live test just now (window open, nothing happens after 30s) never exercised the frontend's error/timeout surface added in Track 1's fix: the backend never reaches ANY `settle()` call in this failure mode at all (not 'error', not 'waiting') — it just loops silently in a 'not logged in yet' state forever, so there is nothing for Track 1's newly-added error/timeout UI to render. Track 1's fix remains correct and worth keeping (it fixes a real, separate swallow for whenever the backend DOES settle 'error'/'waiting'), but it is INSUFFICIENT on its own to resolve F-34.4.2-19's live-reproduced symptom, because this specific failure mode never produces a settled status of any kind."

- timestamp: 2026-08-08 (continuation session — coordinator-directed fix, empirically tested, then reverted per STOP condition)
  observation: "Implemented the user-directed fix (strip a leading '.' from the `domain` argument INSIDE `cookie_domain_matches`, main.rs:966-971, argument order untouched at both call sites) and ran `cargo test domain` (13 tests, the full domain-comparison suite) against it. Result: 12/13 pass; `tests::humble_login_cookies_for_domain_direction_is_the_defect_a_fix` FAILS at its first assertion (`assert!(!cookie_domain_matches(\"humblebundle.com\", Some(\".humblebundle.com\")))`, which flips from false to true under normalization). Hand-verified algebra matched the empirical result exactly. Checked all 9 other `cookie_domain_matches` call sites in main.rs (lines 2655, 3881, 3933, 4056, 4132, 4173, 4360, 4595, 4646): every OTHER call site's `domain`/second-position argument is a fixed dotless literal (EPIC_COOKIE_DOMAIN='epicgames.com', filter_domain/target_domain/target — all humblebundle.com-shaped literals, never leading-dot), so none of them are affected by the normalization. The main.rs edit was then REVERTED to its exact pre-edit (Track 1 comment-only baseline) state — confirmed via `git diff --stat` and a grep for `cookie_domain_matches` in the diff showing zero residual change. No test file touched, nothing committed."
  source: "cargo test domain (run twice — once against the edited comparator, once after reverting, to confirm both the break and the clean revert); direct read of all 9 call sites in src-tauri/src/main.rs"
  means: "Per the user's explicit 'STOP and report' instruction, this is a genuine, confirmed conflict requiring a decision, not something to silently patch around. The conflict is narrowly scoped (exactly one test, one assertion) and the fix is otherwise sound (algebraically correct for the real production poll-arm case, and RFC 6265-correct semantics for the flipped assertion — a leading-dot cookie domain is defined to match its own bare apex, not just subdomains). See the reasoning_checkpoint block and HALTED note above Evidence for the full decision framing returned to the user."

- timestamp: 2026-08-08
  observation: "SKILL-FILE CONTRADICTION, recorded per user request (not edited by this session): `.claude/skills/spike-findings-gamelib/references/tauri-login-webview-cookies.md:46-47` records spike 014a's measurement that `_simpleauth_sess`'s domain is `'humblebundle.com'` WITHOUT a leading dot. `cookie_domain_matches`'s own doc comment in main.rs (lines 963-965) cites this exact skill reference as its justification for the suffix-match design. This session measured the SAME cookie, today, via a different (OS-level, on-disk WKWebView cookie jar) method, and found its domain IS `.humblebundle.com` — WITH a leading dot (see the two 'PRIMARY DISCRIMINATOR'/'Same read-only binarycookies parse' evidence entries above). The two measurements directly contradict each other for the same cookie/same site."
  source: ".claude/skills/spike-findings-gamelib/references/tauri-login-webview-cookies.md:46-47 vs. this session's direct byte-level binarycookies parse (prior evidence entries)"
  means: "The stale spike-014a measurement is arguably what made this bug invisible for so long: main.rs's own comment cites it as proof the suffix-match design is already correct and complete, so no one had reason to suspect the poll arm's specific leading-dot blind spot. Flagging for the record, NOT editing the skill file per explicit instruction — that update, if wanted, is out of scope for this debug session and belongs to whoever owns `spike-findings-gamelib` maintenance. Possible causes of the discrepancy (not investigated further this session): spike 014a's measurement was taken via wry's OLD blocking `.cookies()` API (different code path than the OS-level file this session read), or Humble's own server-side cookie-issuance behavior for `_simpleauth_sess` genuinely changed between spike 014a's original measurement and today."

- timestamp: 2026-08-08 (continuation session — user directed option (a), test rewrite executed)
  observation: "Rewrote `humble_login_cookies_for_domain_direction_is_the_defect_a_fix` (main.rs, now ~5750): flipped `assert!(!cookie_domain_matches(\"humblebundle.com\", Some(\".humblebundle.com\")))` to a positive assertion, rewrote its prose to explicitly state it previously pinned F-34.4.2-19's own root cause and that the spike-016-measured 29-vs-33 gap was the defect being measured (not an acceptable asymmetry), citing F-34.4.2-19 by ID. Added two NEW dedicated fix-verification tests (`cookie_domain_matches_normalizes_leading_dot_domain_against_apex_host`, `cookie_domain_matches_normalizes_leading_dot_domain_against_subdomain_host` -- the latter reproducing the EXACT production call shape: host='www.humblebundle.com', domain='.humblebundle.com'). Added one NEW direction-coverage test (`cookie_domain_matches_direction_still_discriminates_for_host_vs_subdomain_pairs`, using the user-suggested epicgames.com/www.epicgames.com pair) so Plan 22's Defect-A argument-order protection is not silently retired by the leading-dot pair becoming symmetric. Left `humble_login_cookies_for_domain_does_not_disturb_the_poll_direction` completely untouched, per instruction."
  source: "src-tauri/src/main.rs test module edits, this turn"
  means: "Sets up the RED/GREEN TDD sequence recorded in the next two entries."

- timestamp: 2026-08-08
  observation: "RAN `cargo test domain` with the tests edited above but the comparator NOT YET fixed (still the pre-fix `format!('.{d}')` form). Result: 13 passed, 3 FAILED -- exactly and only the rewritten test and the two new dedicated leading-dot tests, all failing at the expected positive assertion. The new direction-coverage test and `does_not_disturb_the_poll_direction` both passed, unaffected, as predicted."
  source: "cargo test domain, this turn (pre-fix run)"
  means: "RED confirmed. Matches the TDD requirement exactly: a test that passes pre-fix proves nothing, so these three needed to demonstrably fail against the unfixed comparator before the fix could be trusted to have caused the change."

- timestamp: 2026-08-08
  observation: "Applied the comparator normalization inside `cookie_domain_matches` (main.rs:966-980): `let d = d.strip_prefix('.').unwrap_or(d);` before the `host == d || host.ends_with(&format!(\".{d}\"))` comparison, with argument order left untouched at every call site. Ran `cargo test domain` again: all 16 tests pass. Ran the FULL `cargo test` (unfiltered, all of main.rs): 119 passed, 0 failed, 1 ignored (pre-existing ignore, unrelated)."
  source: "cargo test domain and cargo test (full), this turn (post-fix runs)"
  means: "GREEN confirmed, no blast radius beyond the targeted fix. This is the Track-2 fix landing: `humble_login_cookies`' poll arm can now, for the first time, match `_simpleauth_sess` against its real, live-measured leading-dot domain."

- timestamp: 2026-08-08
  observation: "Implemented the TS-side logging fix at src/backend/humble/user.ts's `checkCookie()`, SUPPORTED_NONEMPTY branch (`if (!match) return`, previously silent). Added a new throttled heartbeat function `logCandidateNotFoundStatus(total, matchedCount)`, modeled directly on the existing `logRejectionStatus` noise-reduction shape (F-2, Phase 34.4.1 Plan 18) and reusing the same `LOGIN_WATCH_LIVENESS_LOG_INTERVAL_MS` (30s) constant: logs once immediately, then at most once per 30s while the condition persists unchanged, reporting a suppressed-tick count. Logs `total` (unfiltered cookie count) and `matchedCount` (filtered set size) ONLY -- never a cookie name or value, matching the file's existing redaction discipline."
  source: "src/backend/humble/user.ts edits, this turn"
  means: "Closes the confirmed gap: this specific 'jar is live but the candidate cookie is never in the filtered set' wedge shape (which the existing heartbeat cannot reach, since it is wired downstream of a `cookieValue` assignment this path never makes) now produces observable log output within 30 seconds, matching the exact live-test window this session already used (evidence entry 'live test round 2')."

- timestamp: 2026-08-08
  observation: "Full verification round, this turn: `npx tsc --noEmit` clean (0 errors). `npx jest src/backend/humble/ src/frontend/screens/WebView/` -- 21 suites, 704 tests, all pass. Full unfiltered `npx jest --runInBand --silent` FIRST run: 215/216 suites passed, ONE failure -- `meta/__tests__/hardcodedStringGate.test.ts`, flagging a NEW violation at `src/frontend/screens/WebView/index.tsx:347` (`'the Humble sign-in window closed or could not be reached'`, an object-property string literal introduced by Track 1's earlier fix this session, not by anything in this turn's diff, but never previously run through the full localisation gate)."
  source: "npx tsc --noEmit, npx jest (scoped and full), this turn"
  means: "The project's standing localisation gate (blocking, per `localisation-standing-requirement` memory) caught a real, in-scope violation that Track 1's earlier self-verification (folder-scoped jest runs only, per that turn's own Resolution.verification) never exercised. This was NOT part of the user's explicit checkpoint instructions this turn, but 'full test/lint/typecheck/cargo suite, all green' cannot be satisfied while it fails -- fixed in the next entry."

- timestamp: 2026-08-08
  observation: "Wrapped the flagged string in `t('webview.login.humble.error.window_unreachable', 'the Humble sign-in window closed or could not be reached')`, matching this same file's own established pattern for every other `TauriOAuthLoginState`-setting call site (`t('status.preparing_login', ...)`, `t('status.logging', ...)`, etc.). Re-ran the full suite: `npx tsc --noEmit` clean; `npx jest --runInBand --silent` -- 216/216 suites, 4214/4214 tests, all pass, including `hardcodedStringGate.test.ts`. `npx eslint` on all 7 files changed across both this turn and Track 1 (user.ts, index.tsx, TauriLoginPanel.tsx, loginWindowSeam.ts, and the 3 test files): 0 errors, 103 warnings (pre-existing baseline, unchanged in kind from prior turns' self-verification). `cargo test` (full, re-run once more after all edits): 119 passed, 0 failed, 1 ignored."
  source: "npx tsc --noEmit, npx jest --runInBand --silent, npx eslint, cargo test -- all this turn, final round"
  means: "DECISIVE: the full test/lint/typecheck/cargo suite, unfiltered, is green. This is a stronger verification bar than any prior turn in this session reached (all previous self-verification was folder-scoped). Live end-to-end verification (a real Humble login re-open reaching `isLoggedIn: true`) remains the one gap, per the standing 'do not disturb the live session without checking in' constraint -- see the human-verify checkpoint returned to the user."

- timestamp: 2026-08-08 (per explicit user request -- recorded only, NOT edited)
  observation: "Read `.planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/34.4.1-SPIKE-016-FINDINGS.md` in full. Its 'Defect A' section records `census_direction=29` (this doc's own name for the shape `cookie_domain_matches(domain, c.domain())` -- the SAME order the poll arm at main.rs:3878-3885 uses) against `total=33`, confirming a real, live 4-cookie undercount. The document's entire analytical weight goes to the OTHER direction's over-match (`clear_direction=33 == total`, framed as the dangerous defect risking cross-provider data loss) and its 'Blocking sequencing note' / 'Plan 22 MUST land before plan 23' ordering requirement. The 29-vs-33 gap is mentioned exactly once more, in the Retry Experiment section, ONLY as a 'confound to record explicitly' for a DIFFERENT number (31) the retry loop measured -- never flagged, anywhere in the document, as its own defect requiring a fix. No RECOMMENDATION section item addresses it."
  source: ".planning/phases/34.4.1-.../34.4.1-SPIKE-016-FINDINGS.md (full read, this turn)"
  means: "CONFIRMS the user's characterization: this document measured the exact undercount that IS F-34.4.2-19's root cause, live, in July, and recorded it as an accepted, unremarkable byproduct of the (correctly identified as more urgent) over-match defect -- not as a defect of its own. Combined with the already-recorded skill-reference finding (main.rs's own doc comment citing spike 014a's stale dot-less measurement as proof the suffix-match design was 'already correct and complete'), TWO separate upstream artifacts encoded the same mistaken premise and both went uncorrected through the entire life of this bug. Per explicit instruction, NEITHER `34.4.1-SPIKE-016-FINDINGS.md` NOR `.claude/skills/spike-findings-gamelib/references/tauri-login-webview-cookies.md` was edited this session -- both updates, if wanted, are out of scope here and belong to whoever owns those documents."

## Eliminated

- hypothesis: "The watch is silently wedged forever with the promise never settling (i.e. `finishLogin`/`settle` never called at all)."
  evidence: "The fresh 08:17:37 log entry shows `settle({status:'error'})` DOES fire (via the UNSUPPORTED_OR_ERROR path) — the backend promise resolves. The stuck-UI symptom is explained instead by the frontend's silent-swallow of non-'done' statuses (see Evidence above), not by the backend promise itself hanging."
  timestamp: 2026-08-08

- hypothesis: "The Esc monitor or cancel-strip can fire spontaneously (without a genuine matching user gesture), closing the login window on its own."
  evidence: "Direct code read: both require app-key-status + an exact NSWindow-address match (Esc monitor) or a real DOM click (cancel strip). Eliminated as a CODE-LEVEL spontaneous-firing defect only -- a genuine unrecalled user gesture remains an open, non-eliminated possibility per the user's own directive."
  timestamp: 2026-08-08

- hypothesis: "A concurrent second app instance was running during this session and split the [shell]/gamelib.log sink, producing a misleadingly 'clean' single-error log."
  evidence: "Exactly one gamelib-shell process (pid 42138) is currently alive, and gamelib.log shows exactly one unbroken bootstrap sequence with no repeated bootstrap block for the entire session. Eliminated for the CURRENTLY-OBSERVABLE window only -- cannot retroactively rule out a second instance that ran and exited overnight before this check."
  timestamp: 2026-08-08

## Resolution

root_cause: |
  THREE independent, now-fully-diagnosed defects, of which two are FIXED this session and one
  (Track 2's window-destruction trigger) remains open but is fully scoped and non-blocking for
  F-34.4.2-19's live-reproduced symptom:

  Track 1 (consumption-side, FIXED): src/frontend/screens/WebView/index.tsx's
  runHumbleLoginWatch() only branched on result.status === 'done'; 'error' and 'waiting' were
  silently swallowed. src/frontend/screens/WebView/components/TauriLoginPanel.tsx's
  `runner === 'humble'` branch was UNCONDITIONAL, so even a correctly-tracked error had no
  render path. HumbleUser.watchForLogin()'s LoginResult contract itself was already correct.

  Track 1 backend addendum (FIXED): src/backend/humble/user.ts's watchForLogin() discarded the
  Rust-pushed 'closed' nav event, discovering a destroyed window one tick late via a stringly-
  typed humble_login:no-window:* error instead of immediately.

  Track 2 (THE root cause of F-34.4.2-19's LIVE-REPRODUCED symptom -- window stays open
  indefinitely, zero log output, no settle of any kind -- FIXED this session):
  `cookie_domain_matches` (src-tauri/src/main.rs:966-971) was categorically blind to any
  leading-dot cookie domain for ANY host: `format!(".{d}")` on an already-dotted `d` requires an
  impossible ".."-prefixed suffix no real hostname can contain. `_simpleauth_sess`'s real,
  live-measured domain is `.humblebundle.com` (leading dot, confirmed via a read-only OS-level
  WKWebView cookie-jar parse). `humble_login_cookies`' poll arm (main.rs:3878-3885,
  `cookie_domain_matches(host_for_filter, Some(c.domain()))`, host_for_filter fixed at
  'www.humblebundle.com') could therefore NEVER place `_simpleauth_sess` into its `matched`
  array, while `total` (unfiltered count) stayed healthy every tick (Humble sets 20+ cookies) --
  so `classifyCookieRead` always returned SUPPORTED_NONEMPTY, never an error/timeout verdict.
  `checkCookie()`'s SUPPORTED_NONEMPTY branch then hit `if (!match) return` (user.ts:494-498)
  with NO logging on that path, and the existing liveness heartbeat (`logRejectionStatus`) was
  unreachable from it (wired downstream of a `cookieValue` assignment this path never makes).
  Net effect: the watch polled correctly, forever, on a session this project's own gamekeys
  discriminator proved was genuinely authenticated (`getGamekeys()` -> status:'ok', 31
  gamekeys), silently failing to find its own target cookie and never settling anything --
  fully explaining every symptom (no config.json write, no Logout control, no login form, zero
  log output even after 30+ seconds of live observation).

  This defect is independently confirmed as GENERALIZING beyond the narrow apex-host case the
  project's own test suite already proved (`humble_login_cookies_for_domain_direction_is_the_
  defect_a_fix`, main.rs, previously asserted this blindness as CORRECT, intended behavior --
  see the rewritten test and its prose, below). `34.4.1-SPIKE-016-FINDINGS.md` measured this
  same undercount live in July (`census_direction=29` vs `total=33`) and recorded it as an
  accepted byproduct of a different, more urgent defect (Defect A's over-match) rather than as
  its own defect -- see Evidence, "per explicit user request -- recorded only, NOT edited."

  Track 2's ORIGINAL window-destruction trigger (why the window that produced the 08:17:37
  no-window error was destroyed in the first place) remains UNRESOLVED -- see the extensive
  prior investigation (structurally rules out the WR-03 deadline, finds a separate LogWriter
  write-ordering race, leaves overnight sleep/wake as an unproven correlate only). This is a
  DIFFERENT manifestation from the leading-dot defect above (window genuinely destroyed, vs.
  window staying open but its watch silently never finding its own cookie) and does not block
  closing F-34.4.2-19, since the leading-dot fix resolves the symptom this session was actually
  asked to reproduce and fix (a still-open window whose watch never completes).

fix: |
  Track 1 (implemented, self-verified, NOT yet live-verified):
  1. src/frontend/screens/WebView/index.tsx: runHumbleLoginWatch() now handles
     result.status === 'error' (sets { phase: 'error', message: t(...) }) and
     result.status === 'waiting' while still mounted (sets { phase: 'timeout' } -- only
     reachable here via the WR-03 ten-minute deadline, since stopLogin()'s own 'waiting'
     settle always races an unmount that already set mounted=false first). Both log via
     window.api.logInfo ("logged, never silent"). A new humbleLoginState (TauriOAuthLoginState)
     is threaded into TauriLoginPanel only for runner === 'humble'. The error message is wrapped
     in t('webview.login.humble.error.window_unreachable', '...') (added this turn, fixing a
     hardcodedStringGate violation the folder-scoped self-verification of the original Track 1
     turn never exercised).
  2. src/frontend/screens/WebView/components/TauriLoginPanel.tsx: the humble branch is now
     gated on `phase !== 'error' && phase !== 'timeout'`, letting those two phases fall through
     to the SAME generic error/timeout branches the four OAuth runners already use (heading,
     body, Retry button via window.location.reload()) -- reused verbatim, not reinvented.
     runnerLabel is special-cased to 'Humble Bundle' for those branches, matching the original
     static copy's own wording.
  Track 1 backend addendum (implemented): src/backend/humble/user.ts's checkCookie() now
  consumes a { event: 'closed' } nav event directly, settling { status: 'error' } immediately
  instead of waiting one tick for the indirect no-window inference. Doc comments in
  src/backend/humble/loginWindowSeam.ts and src-tauri/src/main.rs updated to match.

  Track 2 (implemented, empirically TDD'd, self-verified this turn):
  1. src-tauri/src/main.rs, `cookie_domain_matches` (:966-980): strips a leading '.' from the
     `domain` argument before comparing (`let d = d.strip_prefix('.').unwrap_or(d);`).
     Argument order left COMPLETELY untouched at every call site (Plan 22 / F-6 Defect A's
     ordering decision is not re-litigated). RFC 6265-correct: a `.example.com` cookie applies
     to `example.com` itself, not only its subdomains.
  2. Rewrote `humble_login_cookies_for_domain_direction_is_the_defect_a_fix` (main.rs): flipped
     its first assertion from negative to positive, and rewrote its prose to record that it
     previously pinned F-34.4.2-19's own root cause as intended behavior, citing F-34.4.2-19 by
     ID and naming the spike-016 29-vs-33 gap as the defect being measured, not an acceptable
     asymmetry.
  3. Added two dedicated fix-verification tests (RED confirmed against the pre-fix comparator,
     GREEN confirmed against the fixed one): `cookie_domain_matches_normalizes_leading_dot_
     domain_against_apex_host` and `..._against_subdomain_host` (the latter reproduces the
     EXACT production poll-arm call shape).
  4. Added `cookie_domain_matches_direction_still_discriminates_for_host_vs_subdomain_pairs`
     (epicgames.com / www.epicgames.com) so Plan 22's Defect-A argument-order regression
     protection is not silently retired now that the leading-dot pair is symmetric.
     `humble_login_cookies_for_domain_does_not_disturb_the_poll_direction` left untouched,
     confirmed still passing.
  5. src/backend/humble/user.ts: added `logCandidateNotFoundStatus()`, a throttled heartbeat
     (modeled on the existing `logRejectionStatus`, same 30s `LOGIN_WATCH_LIVENESS_LOG_INTERVAL_
     MS`) wired into the previously-silent `if (!match) return` path in checkCookie()'s
     SUPPORTED_NONEMPTY branch. Logs `total`/`matchedCount` only -- never a cookie name or
     value.

  A NEW, separate, out-of-scope defect (unrelated to either track) was discovered while
  investigating Track 2's log ordering: LogWriter's writeString()
  (src/backend/logger/log_writer.ts:81-125) can write two unawaited, near-simultaneous
  logWarning()/logInfo() calls out of true call order. Not fixed this session -- logged to
  .planning/phases/34.4.2-macos-login-window-ux-modal-child-window-attachment-in-field/deferred-items.md,
  per scope-boundary discipline. Track 2's ORIGINAL window-destruction trigger (the 08:17:37
  incident's true cause) also remains unfixed/unidentified -- see root_cause above.

verification: |
  Track 1 (carried forward, self-verified, folder-scoped only -- see Track 2 below for the
  stronger, full-suite bar this turn reached):
    - src/backend/humble/__tests__/user.test.ts: 88/88 pass, including 2 new tests for the
      'closed' event fix.
    - src/frontend/screens/WebView/components/__tests__/TauriLoginPanel.test.tsx: 28/28 pass.
    - src/frontend/screens/WebView/__tests__/HumbleLoginWatchErrorHandling.test.ts: passing,
      with anti-vacuity self-tests.

  Track 2 (this turn, self-verified, FULL unfiltered suite -- strongest bar reached this
  session):
    - `cargo test domain`: RED confirmed pre-fix (exactly 3 targeted failures, 13 others
      unaffected), GREEN confirmed post-fix (16/16).
    - `cargo test` (full, unfiltered, all of main.rs): 119 passed, 0 failed, 1 ignored
      (pre-existing, unrelated).
    - `npx tsc --noEmit`: clean, 0 errors.
    - `npx jest --runInBand --silent` (full, unfiltered repo suite): 216/216 test suites,
      4214/4214 tests pass -- including `meta/__tests__/hardcodedStringGate.test.ts`, which
      caught and required fixing one localisation-gate violation this turn (see fix, above)
      that the ORIGINAL Track 1 turn's folder-scoped self-verification never exercised.
    - `npx eslint` on all 7 changed files (user.ts, index.tsx, TauriLoginPanel.tsx,
      loginWindowSeam.ts, + 3 test files): 0 errors, 103 pre-existing warnings (unchanged in
      kind).

  LIVE-VERIFIED, this turn (human-verify checkpoint, CONFIRMED by the user AND independently
  cross-checked by the coordinator, not taken on the user's report alone):
    - User's verbatim report: "the humble store window opens as before, but after a few seconds
      closes and the accounts page indicates is logged in. I then logged out and back in again,
      same result (i.e. there was no login form to fill, just after a few seconds window closed
      and I was logged in." Reproduced TWICE.
    - Coordinator's independent filesystem check:
      `~/Library/Application Support/gamelib/humble_store/config.json` is now 75 bytes, mtime
      2026-08-08 10:41, containing `isLoggedIn = True` (plus `encryptionDegraded = false`,
      `expired = false`). It had been stuck at 2 bytes `{}` with mtime Aug 6 13:52 through every
      prior observation in this session, including the RERUN-5 gate run that discovered
      F-34.4.2-19 and this session's own earlier live-test rounds. The same independent
      filesystem channel that ESTABLISHED the defect now CONFIRMS the fix.
    - This is D-G2 branch (a) working for the first time in this project's history: window opens,
      the watcher finds `_simpleauth_sess` within a couple of poll ticks (now matchable thanks to
      the leading-dot normalization), validates it against the gamekeys endpoint, writes the
      store, `settle()` closes the window.

  NOT verified live (residual gaps, both recorded as open questions, not as working -- see
  `deferred-items.md`'s F-34.4.2-21/F-34.4.2-22 for the full record, cross-referenced here):
    - Track 1's error/timeout UI (the new `phase === 'error' || phase === 'timeout'`
      branches in TauriLoginPanel.tsx and runHumbleLoginWatch()'s new non-'done' handling) was
      NEVER exercised live -- the live round succeeded on branch (a) on the first try, so only
      the success path (`{status: 'done'}`) was ever reached. Unit coverage only. A passing live
      test on the success path must NOT be read as validating the failure path.
    - `clearHumbleStorage`/logout remains UNPROVEN. On the user's logout-and-back-in repro there
      was again no rendered login form, because their humblebundle.com WKWebView session
      survives a GameLib disconnect and auto-logs in a second time -- plausibly correct, but gate
      item 6(a)'s own path (the storage wipe actually running and clearing webview cookies) has
      still never been observed completing live. Interacts with F-34.4.2-10 (Humble disconnect's
      storage wipe times out), whose taking condition ("once item 6(a) records a measured PASS
      with the path confirmed reached") remains unmet.

  Two upstream artifacts encoding the mistaken premise that let F-34.4.2-19 hide are recorded,
  NOT edited (out of scope for this debug session; see `deferred-items.md`'s F-34.4.2-23 for the
  full record with exact file paths/line numbers and what a future owner should do):
    - `.planning/phases/34.4.1-.../34.4.1-SPIKE-016-FINDINGS.md`'s "Defect A" section, which
      measured the same 29-vs-33 leading-dot undercount live in July and filed it as an accepted
      asymmetry rather than a defect.
    - `.claude/skills/spike-findings-gamelib/references/tauri-login-webview-cookies.md:46-47`'s
      stale dot-less domain measurement, which `cookie_domain_matches`'s own doc comment in
      `src-tauri/src/main.rs` cites as justification for the (pre-fix) design.

  This closes F-34.4.2-19 as a diagnosed-and-fixed defect. It does NOT close Phase 34.4.2 --
  the phase's own six gate items have not been re-scored since this fix landed. A fresh live-gate
  run against the phase's gate contract is the phase's own next step, and is separate work from
  this debug session.

files_changed:
  - src/frontend/screens/WebView/index.tsx
  - src/frontend/screens/WebView/components/TauriLoginPanel.tsx
  - src/frontend/screens/WebView/components/__tests__/TauriLoginPanel.test.tsx
  - src/frontend/screens/WebView/__tests__/HumbleLoginWatchErrorHandling.test.ts
  - src/backend/humble/user.ts
  - src/backend/humble/loginWindowSeam.ts
  - src/backend/humble/__tests__/user.test.ts
  - src-tauri/src/main.rs

commits:
  - hash: 0dfd08044
    subject: "fix(F-34.4.2-19): normalize leading-dot cookie domain in cookie_domain_matches"
    scope: "Track 2 root-cause fix -- src-tauri/src/main.rs's cookie_domain_matches comparator +
      its new/rewritten Rust tests only. Stands alone per explicit instruction, naming
      F-34.4.2-19 and stating plainly that a passing test had asserted the defective behavior as
      correct."
  - hash: f3b9e6da5
    subject: "fix(F-34.4.2-19): surface Humble login watch error/timeout/closed outcomes"
    scope: "Track 1 error-surfacing work -- WebView/index.tsx, TauriLoginPanel.tsx and their
      tests, the 'closed' nav-event consumption addendum (user.ts, loginWindowSeam.ts,
      main.rs's comment-only doc update, user.test.ts), and the checkCookie silent-return
      logging fix (logCandidateNotFoundStatus in user.ts). Committed separately as an
      independently valuable change."
