---
status: root-caused-no-fix-applied
trigger: "D-TEB-01 (deferred from quick task 260806-teb): the Amazon (nile) login under Tauri takes 18-36s from click to sign-in window, but the nile binary itself costs only ~6.8s when run standalone from a shell. The ~11-29s difference is app-side latency of unknown origin."
created: 2026-08-06
updated: 2026-08-06T10:48Z
slug: nile-spawn-app-side-latency
---

## FALSIFICATION NOTICE (2026-08-06, post-fix live verification)

**The root-cause claim recorded below (candidate (a): Login-screen-forced version-probe
contention, "confirmed" via the `getOsPlatformInfo` fix) is REFUTED.** Live verification with the
fix rebuilt and live, single-instance-confirmed, dev-secret-vault mode:

- Version probes confirmed ZERO this session (`grep -c "Running command.*--version"` = 0) — the
  fix does what it was designed to do, Login screen no longer pulls the four-binary bundle.
- Amazon click 1 (fresh session, first-ever spawn): 22:24:29 spawn -> 22:24:43 register = **14s**
- Amazon click 2 (~13 min later, same session): 22:37:29 spawn -> 22:37:51 register = **22s**
- Shell baseline, same machine state, app still running: **9.26s**

With the contention source (candidate (a)) COMPLETELY REMOVED, the login is still 14-22s — WORSE
than the previously-recorded "clean" 7-8s clicks from the pre-fix session (21:58 session, probes
fired at 22:01:09, clicks at 22:02:32/22:04:01 measured 7s/7s). Candidate (a) is therefore **NOT**
the root cause of the user's complaint. Do not act on the prior `reasoning_checkpoint`'s
"confirmed root cause" claim below — it is superseded by this notice. It is retained verbatim
beneath for audit trail only.

**The `getOsPlatformInfo` fix (fix 1) remains architecturally correct on its own merits** (an
OS-platform read should not spawn four PyInstaller onefile binaries) but is NOT verified to fix,
and may have removed an accidental warm-up side-effect for, the user's actual complaint. See
`Current Focus` below for the re-investigation and the new candidates this falsification opens up.

# Debug: nile spawn app-side latency gap

## Symptoms

**Expected behavior**
Clicking Amazon on Manage Accounts should open the Amazon sign-in window in roughly the time the
`nile` binary needs to produce a login URL. Measured standalone on this machine that is **~6.8s**
(pure PyInstaller-onefile spawn tax — see `pyinstaller-onefile-spawn-tax` memory).

**Actual behavior**
Click-to-window-visible measured on the live Tauri debug build 2026-08-06:

| Attempt | Elapsed | Log window |
|---|---|---|
| 1 (cold, right after app startup) | **36s** | spawn 21:28:04 → register data 21:28:40 |
| 2 (warm, 90s later, isolated) | **18s** | spawn 21:29:38 → register data 21:29:56 |

So ~29s (attempt 1) and ~11s (attempt 2) are unaccounted for.

**Error messages**
None. There is no error, no warning, no timeout — the flow completes correctly and the window
eventually opens. This is a pure latency defect.

**Timeline**
Newly exposed (not newly introduced) on 2026-08-06 by quick task 260806-teb. That task removed a
genuinely duplicated `nile auth --login` spawn from the Tauri login path and, in measuring the
result, established for the first time that the residual wait is far larger than the binary's own
cost. The gap almost certainly predates the fix. There is **no known-good baseline** — nobody has
ever measured this path against a release build or against a shell-equivalent spawn.

**Reproduction**
1. Launch the Tauri build (`src-tauri/target/debug/gamelib-shell`). Confirm exactly ONE GameLib PID
   (`pgrep -fl GameLib`) — a second instance splits the `[shell]` log sink.
2. Manage Accounts → click Amazon. Time the click.
3. Stop timing when the native Amazon sign-in window appears.
4. Cross-check `~/Library/Logs/GameLib/gamelib.log` for the interval between
   `Running command: ... nile auth --login --non-interactive` and `Register data is:`.

Note: a *complete* Amazon sign-in is impossible until Phase 34.5 ports the `authAmazon` channel
(`[TauriLoginPanel] declared-blocked: runner=nile channel=authAmazon`). Cancel via window-close is
the only available exit, and it is sufficient — the measurement ends when the window appears.

## Measurements already taken (do not redo)

Standalone, from a shell, source binary warm in page cache:

```
public/bin/arm64/darwin/nile --version                      → 7.09s then 6.81s   (5% CPU)
public/bin/arm64/darwin/nile auth --login --non-interactive → 6.86s then 6.79s   (4% CPU)
```

**Key established fact:** `auth --login --non-interactive` costs the *same* as `--version`. It
generates the URL and PKCE material locally with no Amazon round-trip, so there is NO network
latency hiding inside the command. Both are I/O-bound at ~4-5% CPU, consistent with the
PyInstaller onefile extraction tax.

**Also established:** exactly one nile invocation now occurs per attempt (`gamelib.log:27`, `:43`).
The duplicate-spawn theory is closed — that was 260806-teb's fix and it is live-proven.

## Candidate causes

**(a) Concurrent PyInstaller extraction contention (narrow form).** The app fires
`legendary --version`, `gogdl --version` and `nile --version` concurrently at 21:28:01
(`gamelib.log:19-23`), and `runners/nile.log` shows the `--version` output landing *after* the
21:28:04 auth command was logged — so ≥4 onefile extractions were contending on disk when the
user clicked. **Explains part of attempt 1's 36s.** Its narrow form (another RUNNER binary
spawning concurrently) is ELIMINATED as the explanation for attempt 2 — see Eliminated and
candidate (d) below, which generalizes "contention" to a non-spawn source.

**(b) Sidecar `runRunnerCommand` spawn overhead — ELIMINATED.** See Eliminated section: three
discriminator rounds (bare Node spawn, isolated fresh sidecar, sidecar after 90s idle) all
matched the ~7s shell baseline. The sidecar's own plumbing is not the source.

**(c) Debug-build overhead.** `target/debug/gamelib-shell` is an unoptimized Rust build. Still
untested against a release build. Deprioritized below (d) since nothing measured so far points
at the Rust binary itself (the slow interval is entirely inside the child nile process's own
wall-clock span, not in IPC relay time), but not yet formally ruled out.

**(d) Native OAuth-capture window (WKWebView) resource contention from the SAME session — NEW,
untested live, most consistent with all evidence.** Re-reading the full captured log (not just
grepping for spawns) shows attempt 2 fired 3 seconds after attempt 1's login window — open,
navigating amazon.com, and polling every 500ms for ~53s — was destroyed. Discriminator rounds 3-5
prove a truly idle/no-window sidecar (fresh or 90s-aged) reproduces baseline, not the slowdown.
The one structural difference between the clean harness and real attempt 2 is the just-closed
native window. Untested: whether this is WebKit WebContent-process teardown lag, GPU/WindowServer
resource pressure, or something else — the mechanism inside candidate (d) is not yet pinned down,
only the correlation with "a login window existed and was just closed in this session."

## Current Focus

reasoning_checkpoint (SUPERSEDED — see FALSIFICATION NOTICE above and the new checkpoint further down):
  hypothesis: "(a, confirmed root cause) The Login screen (frontend/screens/Login/index.tsx:71, `NewLogin`) calls `useAwaited(window.api.systemInfo.get)` unconditionally on EVERY mount, purely to read `OS.platform`/`OS.version` for its 'unsupported old macOS' gate. `window.api.systemInfo.get` invokes the FULL `getSystemInfo()` bundle (backend/utils/systeminfo/index.ts), which internally does `Promise.all([getLegendaryVersion(), getGogdlVersion(), getCometVersion(), getNileVersion()])` -- four concurrent PyInstaller-onefile `--version` spawns -- even though none of those four values are used by the Login screen. Under the Tauri sidecar (the shipped/tested build), `initHeadless()` (backend/logger/index.ts:132) deliberately SKIPS the Electron path's boot-time system-info warm-up ('the one-time system-info dump ... via a fire-and-forget async chain that can outlive a short-lived caller', per that function's own doc comment, Phase 27 Plan 04 deviation Rule 3). So `getSystemInfo()`'s module-level cache (`cachedSystemInfo`) is NEVER pre-warmed at boot under Tauri -- the Login screen's own mount is the FIRST caller in a fresh session. Login/Manage Accounts is the natural first screen for a not-yet-logged-in user, so 'open the app, click a login button' -- the ordinary first user action -- lands the click's own runner spawn directly on top of 4 concurrent onefile extractions triggered by that SAME mount, inflating click-to-window latency by ~25-30s. This is a refined, call-site-confirmed version of candidate (a): not 'other runners happen to be spawning', but 'the Login screen itself forces them to spawn, on every fresh-session first mount, for data it never uses'."
  confirming_evidence:
    - "Live A/B test (this session, reported by user): three --version probes fired at 22:01:09, exactly when Manage Accounts (Login screen) opened, ~159s after app bootstrap at 21:58:30 -- NOT at boot. Waiting 83s past those probes before clicking (click 1) yielded a clean 7s spawn; a second click 78s later (click 2) also yielded 7s. Both match the standalone shell/harness baseline once the probes are no longer in flight."
    - "Direct code read: frontend/screens/Login/index.tsx:71 -- `const systemInfo = useAwaited(window.api.systemInfo.get)`, used ONLY at lines 75/76/82 for `systemInfo.OS.platform`/`systemInfo.OS.version` (the oldMac gate). No other field of the SystemInformation bundle is read by this screen."
    - "Direct code read: backend/utils/systeminfo/index.ts `fetchSystemInfo()` bundles `getLegendaryVersion()`/`getGogdlVersion()`/`getCometVersion()`/`getNileVersion()` (each a `--version` subprocess spawn) into the SAME Promise.all as the OS read -- there is no way to get OS.platform/OS.version from this function without also paying for all four spawns."
    - "Direct code read: backend/logger/index.ts:114-134 `initHeadless()`'s own doc comment states it deliberately skips 'the one-time system-info dump (shells out to hardware/binary-version probes...)' that the Electron-only `init()` performs at `app.whenReady()`. `backend/sidecar/bootstrap.ts:141` calls `initLogger()` which resolves to `initHeadless` under the sidecar (backend/sidecar/bootstrap.ts:84 aliases `initHeadless as initLogger`) -- confirming the boot-time warm-up genuinely does not run under the build being tested."
    - "`useAwaited` (frontend/hooks/useAwaited.ts) re-invokes its getter on every mount (empty-deps `useEffect`), so every Login-screen mount issues a fresh `window.api.systemInfo.get()` call -- gated only by `getSystemInfo()`'s own cache, which is empty on the FIRST call of a session under Tauri."
  falsification_test: "If the Login screen's `systemInfo` fetch were NOT the trigger, the three --version probes would appear in gamelib.log at a time uncorrelated with Login-screen mount (e.g. clustered right at process bootstrap, or at some other fixed screen). They instead appear exactly at 22:01:09 when Manage Accounts opened, 159s after a 21:58:30 bootstrap with zero prior nile spawns -- matching a lazy, mount-triggered fetch, not a boot-time one. This was also directly confirmed by reading the call graph rather than only correlating timestamps: Login/index.tsx is the ONLY frontend caller of `window.api.systemInfo.get` reachable before a user reaches Settings, and initHeadless() is proven (by its own doc comment and by bootstrap.ts's aliasing) to skip the alternative boot-time trigger."
  fix_rationale: "The four runner `--version` spawns exist to serve Settings > System Info and the Advanced-settings 'alternate binary' pickers (AltLegendaryBin/AltGOGdlBin/AltNileBin) -- none of which the Login screen needs. The root cause is a data-coupling defect (OS info bundled with unrelated, expensive runner-version data, all gated behind one fetch), not a caching gap -- `getSystemInfo()` already has module-lifetime value-cache + in-flight-promise memoization (debug/gog-spawn-reduction.md fix 3), so repeat visits are already free; the ONLY expensive case is the unavoidable first call of a session, and Login screen is what forces that first call to happen at the worst possible moment. The fix decouples the two: a new `getOsPlatformInfo()` reads only `process.platform`/`process.getSystemVersion()` (+ `getOsInfo()`'s cheap OS name lookup) with NO runner spawns, and the Login screen now calls that instead. `getSystemInfo()` itself, its cache, and every other consumer (Settings > System Info, the three AltXBin components, launcher.ts, utils.ts's isMacSonomaOrHigher, logger's Electron-path boot dump) are UNCHANGED -- this only removes an unnecessary dependency from the one call site that fires at the worst time, it does not remove or delay the version probes for screens that actually need them."
  blind_spots: "Not live-verified on this machine (no GUI access from this session) -- verification requires the user to relaunch and click a login button as the Login screen's first-ever mount in a fresh session, confirming both (1) latency now lands near the ~7-10s baseline and (2) the oldMac gate still correctly triggers on macOS < 12 (behavior-preserving refactor, but the field name change (`osPlatformInfo` vs `systemInfo`) touched a source-text regression-gate test that had to be updated -- see loginInFlightUiReachability.test.tsx). Does NOT address candidate (d) (OAuth-window-teardown contention) at all -- that remains a SEPARATE, still-open hypothesis (see below), and this fix alone will not fully explain away a slow SECOND click in the same session if (d) is real. Also does not change behavior for Settings > System Info / Advanced-settings screens, which still pay the full 4-spawn cost the first time a user opens them -- deliberately out of scope, since those screens are not on the critical path of a fresh-session login click."

status_of_candidate_d: "NOT eliminated -- recorded as UNREPRODUCED-UNDER-WEAK-CONDITIONS per the user's own correct assessment, not disproved. The live A/B test's click 2 differed from the ORIGINAL slow attempt 2 in two confounded ways simultaneously: (i) this test's prior OAuth window lived only 3s vs. the original's ~53s open+polling, and (ii) this test's teardown-to-click gap was 78s vs. the original's 3s. A short-lived window closed 78s ago is not the same test as a long-lived window closed 3s ago -- the test that would actually discriminate (d) (long-lived window, closed seconds before the next click, with candidate (a)'s contention now removed by this fix) has not yet been run. Recommendation for a future session if slow clicks persist after this fix ships: repeat the original attempt-1/attempt-2 sequence (open a real OAuth window, let it sit ~50s, close it, click again within ~3s) now that the version-probe confound is gone, and see whether the ~18s figure still reproduces in isolation."

next_action: "SUPERSEDED — see 2026-08-06 falsification checkpoint below for the current next_action. (Original text retained for audit: 'BOTH fixes implemented and self-verified... Awaiting human live-click verification...' — that verification is what came back and falsified the hypothesis; this next_action must not be re-executed as if still pending.)"

---

## 2026-08-06 falsification checkpoint (CURRENT — supersedes everything above in this section)

falsification_record:
  what_was_claimed: "Candidate (a) — Login screen forces a 4-binary version-probe bundle via getSystemInfo(), which contends with the click's own nile spawn — was recorded as the CONFIRMED root cause, fixed by getOsPlatformInfo (fix 1)."
  what_the_live_test_showed: "With fix 1 live and probes confirmed at ZERO for the session, click-to-register latency was 14s and 22s — both WORSE than the 7s/7s measured in the pre-fix session when probes fired 83s+ before the click. Removing the alleged contention source did not recover the baseline; latency got worse."
  verdict: "Candidate (a) is REFUTED as an explanation for the user's actual complaint. It was real (the probes did fire, did spawn 4 binaries unnecessarily), but eliminating it changed nothing the user can feel, and correlates with things getting worse, not better. This is a textbook case of shipping a correlation as a cause (see project memory f10-diagnosis-process-lesson) — the coordinator (and this debugger) fell into exactly that pattern and it is being corrected here, not defended."

reasoning_about_the_new_evidence:
  candidate_warmup: "(new candidate, self-warm-up via a preceding nile spawn) The ONLY systematic difference between the fast pre-fix session (7s/7s, probes fired 83s before each click) and the slow post-fix session (14s/22s, zero probes) is: did a `nile --version` spawn happen shortly before the `nile auth --login` spawn. If PyInstaller-onefile extraction, or macOS code-signature/amfid validation of the nile binary, is keyed to something that a same-binary spawn primes (page cache of the executable's own pages, or an AMFID/syspolicyd validation-result cache scoped to that file's identity), a preceding `nile --version` call would make the following `nile auth --login` call cheaper. This is falsifiable and directly testable (see decisive_test below) and is NOT assumed true — it is one candidate among several."
  counter_evidence_against_pure_warmup: "Three facts do not fit a simple page-cache/warm-up story cleanly, and must not be waved away: (1) shell spawns are consistently ~6.8-9.3s regardless of whether the binary was 'just warmed' or not -- if simple page-cache locality explained the app-side gap, it should also produce a visible warm/cold split in shell timings, and it does not; (2) click 2 (22:37, ~13 min after click 1's own nile spawn at 22:24) was SLOWER than click 1 (22s vs 14s), not faster -- a page-cache-decay model predicts the opposite (staying warm or slowly cooling, not getting colder over 13 minutes on a machine with plenty of free RAM); (3) discriminator round 3 (this session's own prior work) drove the REAL sidecar.js directly via its own stdio protocol, invoked an auth-data fetch IMMEDIATELY (633ms after boot, genuinely the FIRST spawn that fresh process tree ever made) and got baseline (6915ms) -- not slow -- which is hard to reconcile with any 'first spawn from a fresh process pays a tax' story, UNLESS that harness's parent-process identity (a bare Node process launched from Terminal/bash) differs in some load-bearing way from the REAL app's parent chain (the actual compiled Rust `gamelib-shell` binary, launched as a real macOS app, spawning the sidecar, spawning nile) -- a difference no discriminator round has yet isolated, because every prior round either used a bare shell, a bare Node script, or a hand-driven sidecar.js OUTSIDE the real Rust host."
  candidate_window_contention_d_reexamined: "Candidate (d) (native OAuth-window teardown/polling contention) remains open and is NOT eliminated, but it can only explain click 2's slowdown, not click 1's -- click 1 fired before any OAuth window had ever been opened in this session (nile auth --login's own spawn interval is entirely BEFORE oauthCaptureLogin opens the window -- confirmed by reading useTauriOAuthLogin.ts: 'preparing' phase covers exactly the getAmazonLoginData() await, and the window only opens afterward, on the following 'awaiting' phase). So (d) is a candidate ONLY for explaining why click 2 (22s) was worse than click 1 (14s) if click 1's OAuth-capture window (which polls the WKWebView every 500ms via oauthLoginCapture.ts's poll()/rustInvoke round trips) was left open for the ~13 minutes between clicks and only closed shortly before click 2. This is UNCONFIRMED -- the falsifying evidence's report does not state whether/when click 1's window was closed."
  candidate_rebuild_or_bootstrap_tax: "(new candidate, not yet tested) The app was freshly REBUILT for this test. A rebuild changes the `gamelib-shell` binary's own identity (new inode/mtime/signature), which macOS treats as needing fresh code-signature/responsibility validation. If that validation is amortized over the FIRST several subprocess spawns the freshly-rebuilt parent makes (not literally 'first spawn only', but a tapering tax across the first few), click 1 (first-ever spawn, 2m41s post-bootstrap) would pay more of it than click 2 would if this taxed only the very first spawn -- but click 2 was WORSE, which cuts against a simple 'settles after first spawn' model and instead points either toward (d) reactivating, or toward something that grows rather than tapers over session time (contradicting the discriminator round 5 idle-aging elimination -- which used an isolated harness lacking the real Rust host/webview/devtools, so it does not necessarily generalize to the real app)."
  what_the_decisive_test_must_discriminate: "Whether nile-specific self-warm-up (spawn nile once, the very next nile spawn is cheap regardless of window state) is real, independent of window contention and independent of elapsed-time-since-bootstrap -- because none of the existing evidence isolates that one variable cleanly. Every existing 'fast' data point (pre-fix session's two clicks) also had zero window open before the click AND had probes fire close in elapsed-bootstrap-time; every existing 'slow' data point (this falsification's two clicks) has zero preceding same-or-different-binary spawn AND (for click 2 specifically) an unknown window state. The two variables (preceding-spawn / warm-up, and window-open-state) have never been independently controlled in the same session."

decisive_test:
  name: "Same-session, window-controlled, self-warm-up isolation test"
  steps:
    - "1. Relaunch the debug build fresh (GAMELIB_DEV_SECRET_VAULT=1). Confirm exactly ONE GameLib PID via `pgrep -fl GameLib`. Note the bootstrap timestamp from gamelib.log."
    - "2. Open Manage Accounts. Click Amazon immediately (this is CLICK 1 -- expected to reproduce the ~14-22s slow case, since zero prior spawns have occurred). Record the spawn-to-register interval from gamelib.log ('Running command: ... nile auth --login...' to 'Register data is:')."
    - "3. The instant the native Amazon sign-in window appears, CLOSE IT IMMEDIATELY (within 1-2 seconds -- before it can poll/navigate meaningfully). Record the window's open and close timestamps."
    - "4. Immediately after closing (within a few seconds), navigate to Settings > System Info (this triggers the FULL getSystemInfo() bundle including a real `nile --version` spawn, UNCHANGED by fix 1 -- confirmed by reading the fix's own scope notes). Wait for it to visibly finish (the version fields populate)."
    - "5. Immediately after Settings > System Info finishes, return to Manage Accounts and click Amazon again (CLICK 2). Record its spawn-to-register interval."
    - "6. Report all four timestamps/intervals: click 1 interval, window 1 open->close duration, click 2 interval, and total elapsed time between click 1 and click 2."
  why_this_is_decisive: "This test holds constant, for the FIRST time in this investigation, the two variables that were previously always confounded together: window lifetime (forced to near-zero for click 1's window, so it cannot contend with click 2) and elapsed-session-time (click 2 happens within roughly a minute of click 1, not 13 minutes later, controlling for any session-time-dependent drift). The ONLY deliberately introduced difference between click 1 and click 2 is: click 2 is immediately preceded by a real `nile --version` spawn (via Settings > System Info), click 1 is not."
  outcome_click2_fast: "If click 2 lands near baseline (~7-10s) while click 1 stays slow (~14-22s): self-warm-up (spawning nile once primes the next nile spawn) is CONFIRMED as real and load-bearing, independent of window state and independent of session-elapsed-time. This means fix 1 (removing the Login screen's forced probes) traded away a real, load-bearing accidental warm-up, and fix 2 (caching version-probe results) would make this warm-up increasingly UNRELIABLE over repeated sessions (only the very first-ever caller after each cache-miss would still spawn nile and provide warm-up; every subsequent session, once the identity-keyed cache is warm from a prior run, would serve a cached STRING with no spawn, and no warm-up would occur at all) -- a materially worse regression risk than fix 1 alone. Recommended action in this outcome: revert fix 1's behavioral change (or keep getOsPlatformInfo as an available function but make the Login screen deliberately trigger a real nile --version warm-up in the background, fire-and-forget, before/alongside its OS read) and revert fix 2 entirely (its entire premise -- that repeat version-probe spawns are pure waste -- would be shown false, since one specific case of a 'wasted' spawn is exactly what was keeping login fast)."
  outcome_click2_also_slow: "If click 2 is ALSO slow (roughly matching or exceeding click 1, e.g. still >12s) despite window 1 being closed within 1-2s and a real nile --version spawn having just completed immediately before: self-warm-up via a preceding spawn is REFUTED. This points investigation toward either (i) something in the REAL app process (Rust host + main WKWebView + devtools) that a bare-process/bare-shell harness structurally cannot reproduce (candidate (e)/(f) above), or (ii) window-teardown contention triggered even by the extremely short-lived window 1 (candidate (d) in an even more sensitive form than previously modeled), or (iii) the original 7s/7s pre-fix measurement was itself an artifact/lucky reading rather than a true baseline, and a fresh round of shell-vs-app A/B testing at matched elapsed-session-time is needed. In this outcome, fix 1 is NOT shown to be a regression (nothing was lost, because there was no real warm-up to lose) but ALSO not shown to fix anything -- the user's original complaint's root cause is still open. Recommended action: do not revert fix 1 (still architecturally correct, and shown neutral rather than harmful here); hold fix 2 (its performance premise is unaffected either way, but it should not ship as 'the fix' since it demonstrably is not); reopen investigation into candidate (d) with an even more controlled window-lifetime test (long-lived window, e.g. 60s+, closed 2-3s before a click, to directly retest the ORIGINAL bug's exact confound) and into whether the real app process has resource pressure a harness cannot reproduce."

decision_on_fixes_pending_test:
  fix_1_getOsPlatformInfo: "KEEP as an architectural improvement (an OS-platform read should never require spawning four PyInstaller onefile binaries) but its status as 'the fix for the user's complaint' is WITHDRAWN -- it is not verified to have fixed the complaint, and the live data raises a real possibility it removed a load-bearing accidental warm-up. Do not commit it as a performance fix; if committed at all pending the decisive test, it must be described only as the narrow, defensible refactor it is, with the login-latency question left explicitly open."
  fix_2_runner_version_caching: "HOLD / lean toward REVERT. Its entire justification was 'repeat version-probe spawns are pure waste across sessions' -- this is now directly in question, since the ONE piece of concrete live evidence available says removing a version-probe spawn correlates with WORSE login latency, not better. Fix 2 also compounds fix 1's risk: even if a future caller (e.g., Settings > System Info) organically re-warms nile before a login click in some sessions, fix 2's persistent identity-keyed cache means that only happens on a cache MISS -- the very first time ever after any given binary version last changed -- and produces zero spawn (hence zero warm-up) on every subsequent occasion, making any warm-up effect increasingly rare and unpredictable across a user's lifetime with the app, which is a worse user experience than 'always slow' (a consistently slow login is at least discoverable/reportable; an intermittently-fast one that quietly stops being fast after the cache warms is a much harder-to-diagnose regression). Recommendation: revert fix 2 outright unless/until the decisive test's outcome_click2_fast branch is confirmed AND a redesign that preserves the warm-up (e.g., caching the STRING result but still performing a real, cheap background spawn on a schedule, or explicitly keeping getNileVersion's spawn uncached while caching only legendary/gogdl/comet) is deliberately designed. Do not commit fix 2 in its current form."

next_action: "BLOCKED on live GUI access. Return CHECKPOINT REACHED requesting the user run the 'Same-session, window-controlled, self-warm-up isolation test' above (steps 1-6) and report all four measurements. Do NOT commit anything (fix 1, fix 2, or this debug file's resolution) until that result is in. Do NOT re-attempt the previously-recorded next_action (it described the now-falsified verification)."

second_fix_reasoning_checkpoint:
  hypothesis: "Even after fix 1 (getOsPlatformInfo) removes the Login screen's OWN forced spawn of all four runner `--version` probes, those four functions (getLegendaryVersion/getGogdlVersion/getCometVersion/getNileVersion, backend/utils/helperBinaries/index.ts) are still called with ZERO caching across process lifetimes: every fresh-session first call to getSystemInfo() (Settings > System Info, the three AltXBin pickers, or any other future caller) re-pays the full ~7s PyInstaller-onefile extraction tax for legendary/gogdl/nile, every single time the app starts, because there was no persistence layer at all -- only getSystemInfo()'s own in-memory value-cache/in-flight-promise, which is empty at the start of every process by construction (that emptiness is the root mechanism fix 1 diagnosed). Caching the probe RESULT itself (not just the current-process fetch) removes this cost for the whole class of caller, not just the Login screen's one call site."
  confirming_evidence:
    - "Direct code read (this session): helperBinaries/index.ts had NO caching whatsoever before this fix -- getLegendaryVersion/getGogdlVersion/getNileVersion called runRunnerCommand (a real spawn) unconditionally on every invocation; getCometVersion called spawnSync unconditionally."
    - "Direct code read: three independent frontend call sites (AltLegendaryBin.tsx, AltGOGdlBin.tsx, AltNileBin.tsx) each call their respective window.api.getXVersion() directly over IPC, entirely independent of getSystemInfo()'s own cache -- so even with fix 1 landed, opening a Settings picker is its own uncached ~7s spawn every time, and two of those pickers (or a picker + a getSystemInfo() call) mounting concurrently would double-spawn the same binary."
    - "New test suite (helperBinaries/__tests__/index.test.ts, 12 tests, all green): confirms a second call against an unchanged binary performs zero spawns; a changed binary (different size or mtimeMs) re-spawns; an 'invalid' result is never persisted; concurrent callers of the same runner share one spawn; and a SECOND, independently constructed CacheStore('runner_versions', null) instance -- what a fresh process boot would construct -- reads the entry the first instance persisted, with no spawn of its own."
  falsification_test: "If this hypothesis were wrong, caching the version-probe RESULT would make no observable difference to click-to-window latency after fix 1 -- e.g. if fix 1 alone already fully explained the ~29s gap and no other caller ever raced a fresh-session first fetch. That is not falsified by this session (no live GUI access), but IS falsified in principle if a live re-run after both fixes still shows any residual multi-second gap uncorrelated with a real nile spawn -- that would point back to candidate (d) (OAuth-window-teardown contention), still open and NOT addressed by either fix."
  fix_rationale: "Persistent, identity-keyed caching (fs.stat().size + .mtimeMs of the actual resolved binary path, not a time TTL) makes the fix correct AND self-invalidating: a version string only changes when the binary itself changes (an app update), so keying on the binary's own identity means the cache entry for the OLD binary is simply never looked up again after an update, with no risk of ever serving a stale version past a TTL window. In-flight-promise memoization (mirroring the existing inFlightSystemInfoFetch/inFlightLoginData pattern in this codebase) closes the remaining concurrent-caller gap fix 1 does not touch. Never caching 'invalid' avoids permanently poisoning the cache from one transient failure. This is complementary to, not a replacement for, fix 1: fix 1 stops the Login screen from being the one call site that forces a fresh-session cold spawn at the worst possible moment; fix 2 makes every OTHER caller (present or future) durably cheap once any one of them has paid the cost once, in this OR a prior session."
  blind_spots: "Not live-verified (no GUI access this session) -- in particular, whether the persisted cache surviving a REAL app restart (not just a second CacheStore instance in the same test process) behaves identically is asserted by design (CacheStore is file-backed via electron-store/fileStore.ts, same mechanism every other persistent cache in this codebase relies on) but not observed live. Does not address candidate (d) (OAuth-window-teardown contention) at all -- still open, same as fix 1's blind spot."

## Evidence

- timestamp: 2026-08-06 21:28:04-21:28:41
  observation: "Attempt 1 — one nile auth spawn, 36s to register data, overlapping three startup --version spawns."
  source: gamelib.log:24-35, runners/nile.log

- timestamp: 2026-08-06 21:29:38-21:29:57
  observation: "Attempt 2 — one nile auth spawn, 18s to register data, NO concurrent spawns anywhere in the log."
  source: gamelib.log:41-52

- timestamp: 2026-08-06 (post-hoc, shell)
  observation: "nile auth --login standalone = 6.79-6.86s, identical to --version's 6.81-7.09s. Command does no network work."
  source: direct timing, this session

- timestamp: 2026-08-06 (this session, discriminator round 1)
  observation: "Re-verified shell baseline directly (not redoing the recorded measurement, a fresh confirmatory check): 3x `auth --login --non-interactive` = 6.94s/6.89s/6.85s; 3x `--version` = 6.98s/6.96s/6.89s. One earlier outlier run (17.19s) did not repeat across 3 immediate re-runs -- treated as machine noise (e.g. Spotlight/mds or a cold first-invocation-of-session blip), not a signal."
  source: /usr/bin/time -p, this session, public/bin/arm64/darwin/nile

- timestamp: 2026-08-06 (discriminator round 2 -- candidate (b) test)
  observation: "Wrote a plain Node script that spawns nile via child_process.spawn with the EXACT same args/env/cwd callRunner uses (NILE_CONFIG_PATH set, cwd=runner dir), no sidecar/Tauri involved. 3 runs: 7936.8ms, 6950.2ms, 6927.4ms -- matches the shell baseline almost exactly. Node's child_process.spawn itself adds no meaningful overhead over a shell invocation of the identical binary."
  source: this session, scratchpad/spawn_test.js

- timestamp: 2026-08-06 (discriminator round 3 -- candidate (b) test, full sidecar plumbing)
  observation: "Drove the REAL build/main/sidecar.js directly via its stdio JSON-RPC protocol (no Tauri/Rust shell, no frontend, no clicks) -- spawned it fresh, waited for READY_SENTINEL, sent a single getAmazonLoginData invoke frame IMMEDIATELY (633ms after spawn). Response arrived in 6915.1ms -- matches baseline. The full runRunnerCommand -> callRunner -> child_process.spawn code path, run through the sidecar's own bootstrap (i18next, logger, token store, online monitor, etc. all genuinely initialized), reproduces the baseline exactly when isolated and freshly booted."
  source: this session, scratchpad/sidecar_discriminator.js

- timestamp: 2026-08-06 (discriminator round 4 -- CONFOUNDED, later corrected)
  observation: "Same fresh-boot sidecar, but invoked getAmazonLoginData after 90s of pure idle instead of immediately: response took 20054.7ms -- appeared to reproduce the bug via elapsed time alone. BUT this test's fake env had no real Rust counterpart answering the sidecar's own outbound rustInvoke frames (e.g. a one-shot boot-time `tray_set_icon` call), so that pending invoke sat for the full RUST_INVOKE_TIMEOUT_MS (60_000ms) before rejecting -- a confound in the test harness itself, not a property of the real app (the real Rust shell always answers). Flagged explicitly so this false lead is not mistaken for a finding."
  source: this session, scratchpad/sidecar_discriminator_delayed.js

- timestamp: 2026-08-06 (discriminator round 5 -- corrected, confound removed)
  observation: "Rebuilt the harness to auto-acknowledge every outbound rustInvoke frame instantly (removing round 4's confound), then ran an immediate invoke AND a delayed invoke (after a genuine 90s idle) against the SAME long-lived sidecar process. Immediate: 7042.0ms. Delayed (+90s idle): 7144.2ms. Both match baseline. This rules out 'sidecar/idle-time aging' (GC pressure, heap growth, background timers) as a cause on its own -- elapsed process age alone does not reproduce the slowdown."
  source: this session, scratchpad/sidecar_harness.js

- timestamp: 2026-08-06 (re-reading the already-captured gamelib.log.old in full, not a new timing measurement)
  observation: "Attempt 2 (logged 'isolated' only in the narrow sense of 'no other Running command line') was NOT idle-since-boot: it followed attempt 1's ENTIRE cycle -- nile spawn (21:28:04-21:28:40), a real native OAuth-capture window opened via the Rust LoginWindowSeam at 21:28:41, navigated to amazon.com, polled every 500ms for ~53s, then closed by the user at 21:29:35 (`status=cancelled reason=window-closed`, which per oauthLoginCapture.ts's settle() only logs AFTER `await activeSeam.close()` resolves). The user re-clicked Amazon only 3 seconds later, at 21:29:38 -- the exact moment attempt 2's slow nile spawn began. Discriminator rounds 3-5 (a truly idle/no-window sidecar, both freshly booted and 90s aged) do NOT reproduce the slowdown -- so the one structural difference between my clean harness and the real attempt 2 is that a real native OAuth window had just been opened, used for ~53s, and destroyed 3s earlier in the SAME session."
  source: ~/Library/Logs/GameLib/gamelib.log.old (already-captured, this session's re-read only)

- timestamp: 2026-08-06 (live checkpoint response -- controlled two-click A/B, fresh app instance, GAMELIB_DEV_SECRET_VAULT=1, single verified PID)
  observation: "Bootstrap 21:58:30, zero prior nile spawns. 22:01:09 -- three startup --version probes (legendary/gogdl/nile) fire; log-correlated with Manage Accounts opening, NOT with process bootstrap (159s after bootstrap). Click 1 at 22:02:32 (83s after the probes, well past their completion): 7s spawn, 8s click-to-window -- matches the 6.79-6.86s standalone baseline. A login window opened, navigated amazon.com, closed after 3s. Click 2 at 22:04:01 (78s after that window closed): also 7s spawn, 8s click-to-window. Note: the debugger's own scratch harness OVERWROTE the live gamelib.log at 21:51 mid-session (GAMELIB_SHELL_EXE received=/fake/shell/exe); that overwritten log was archived to scratchpad/harness-run-2151.log, and the original 21:27 evidence above (Attempt 1/Attempt 2 timestamps) now survives only in the prior SUMMARY / this debug file, not in the live gamelib.log."
  source: user-reported live test, this session, checkpoint response

- timestamp: 2026-08-06 (call-site confirmation, this session -- code read, not a new timing measurement)
  observation: "Confirmed the exact trigger for the three --version probes correlated with Manage Accounts opening above: frontend/screens/Login/index.tsx:71 `useAwaited(window.api.systemInfo.get)`, fired on every Login-screen mount (empty-deps useEffect in useAwaited), gated only by getSystemInfo()'s own session-lifetime cache -- which is empty on the first call of a Tauri session because backend/logger/index.ts's initHeadless() (used by the sidecar per backend/sidecar/bootstrap.ts:84,141) deliberately skips the Electron-only boot-time system-info warm-up. Login screen reads ONLY systemInfo.OS.platform/OS.version (oldMac gate) -- none of the four runner-version fields getSystemInfo() also fetches via Promise.all. This fully explains the observed correlation (probes firing exactly at Manage-Accounts-open time, not at boot) as causation, not coincidence."
  source: this session, direct reads of frontend/screens/Login/index.tsx, backend/utils/systeminfo/index.ts, backend/logger/index.ts, backend/sidecar/bootstrap.ts, frontend/hooks/useAwaited.ts

- timestamp: 2026-08-06 22:21-22:40 (FALSIFICATION -- live checkpoint response, app rebuilt with fix 1 + fix 2, GAMELIB_DEV_SECRET_VAULT=1, single verified PID)
  observation: "Bootstrap 22:21:48. `grep -c \"Running command.*--version\"` = 0 for the whole session -- fix 1 confirmed working as designed, zero version probes fired. Click 1 (first-ever spawn this session) at 22:24:29: 14s spawn-to-register. Click 2 at 22:37:29 (~13 min later): 22s spawn-to-register -- SLOWER than click 1, not faster. Shell baseline re-checked same machine state, app still running, 22:40: 9.26s. Both app clicks are WORSE than the pre-fix session's 7s/7s, despite the alleged contention source (candidate a) being completely removed. This directly falsifies candidate (a) as a fix for the user-facing complaint -- eliminating the contention did not recover, and in fact moved further from, the previously observed fast baseline."
  source: user-reported live test, this session, checkpoint response (falsifying)

## Eliminated

- hypothesis: "A slow Amazon round-trip inside `nile auth --login --non-interactive`"
  reason: "The command costs the same as `--version` (6.86s vs 7.09s) and runs at 4% CPU. It builds the URL and PKCE material locally. No network call is on this path."
  timestamp: 2026-08-06

- hypothesis: "A duplicate/second nile spawn is still racing the first"
  reason: "Live-proven closed by quick task 260806-teb — gamelib.log shows exactly one `nile auth --login --non-interactive` per attempt (lines 27 and 43), nothing between the spawn and the register-data line."
  timestamp: 2026-08-06

- hypothesis: "(b) Sidecar `runRunnerCommand`/child_process.spawn plumbing is inherently slower than a shell spawn (different parent process, env, or cwd resolution)"
  reason: "Three separate discriminator rounds refute this at increasing fidelity: (1) a plain Node child_process.spawn with the exact same args/env/cwd matched the shell baseline (~7s, not 18-36s); (2) the REAL build/main/sidecar.js, driven directly via its stdio JSON-RPC protocol with its real bootstrap (i18next, logger, token store, online monitor) fully initialized, matched baseline (6915.1ms) when invoked immediately after boot; (3) the same sidecar invoked again after a genuine, confound-free 90s idle period also matched baseline (7144.2ms). The sidecar's spawn mechanism itself is not the source of the excess latency, under any tested condition."
  timestamp: 2026-08-06

- hypothesis: "Sidecar/idle-time aging (GC pressure, heap growth, accumulated background-timer state) causes later invocations to slow down regardless of what else happened"
  reason: "Discriminator round 4 appeared to show this (20054.7ms after 90s idle) but was CONFOUNDED by the test harness's own incomplete Rust stub (a one-shot `tray_set_icon` rustInvoke call sat unanswered for the full 60s timeout bound). Round 5 corrected this by auto-acknowledging every rustInvoke frame and re-ran both an immediate and a delayed (+90s) invoke against the same process: both matched baseline (7042.0ms / 7144.2ms). Pure elapsed time in an otherwise-idle sidecar does not reproduce the slowdown."
  timestamp: 2026-08-06

- hypothesis: "(a) Concurrent PyInstaller extraction contention (Login-screen-forced version-probe bundle via getSystemInfo()) is the root cause of the user's click-to-window latency complaint -- REFUTED as a fix, not merely 'unexplained variance'"
  reason: "FALSIFIED live, 2026-08-06 22:21-22:40 session: fix 1 (getOsPlatformInfo) verified to fully remove the version-probe contention (0 probes fired all session), yet click-to-register latency was 14s and 22s -- both worse than the 7s/7s measured pre-fix when probes fired 83s+ before the click. Removing the alleged contention source did not recover the baseline and correlates with things getting WORSE, not better. This was previously recorded as a 'confirmed root cause' with a reasoning_checkpoint and two complementary fixes shipped against it -- that confirmation is now retracted. See the 2026-08-06 falsification checkpoint in Current Focus for the re-investigation and new candidates (self-warm-up via a preceding same-binary spawn; candidate (d) window-teardown contention reconsidered for click 2 only; a possible post-rebuild/first-parent-spawn tax, none yet confirmed)."
  timestamp: 2026-08-06 (falsification)

## 2026-08-06 FINAL — mechanism CONFIRMED, both fixes REVERTED by user decision

**status: root cause identified; no in-repo fix applied; both candidate fixes reverted.**

### The decisive measurement (shell only — no app, no window, no UI; one variable)

Run against `public/bin/arm64/darwin/nile`, app idle, same binary, same command throughout:

```
6 back-to-back runs : 6.52  6.56  6.55  6.52  6.57  7.45   (mean 6.75s, stdev 0.37s)
WARM  (immediately after those)                    :  6.50s
COLD  (after 360s idle)                            : 21.27s
                                                      ratio 3.27x
```

**Root cause: the PyInstaller-onefile extraction cost is dominated by TIME SINCE THE PREVIOUS
SPAWN OF THE SAME BINARY, not by anything in GameLib.** A nile spawn seconds after another costs
~6.5s; one six minutes later costs ~21s. Nothing about the app, the sidecar, the Rust host, the
OAuth window, or the debug build is required to reproduce it — a bare shell does.

### This retro-explains essentially every reading in this investigation

| Click / run | Gap since previous nile spawn | Measured |
|---|---|---|
| 22:02 click (probe fired 22:01:09) | ~76s | **7s** (warm) |
| 6 back-to-back shell runs | seconds | **6.5-7.5s** (warm) |
| 22:45 shell run | ~5 min | **13.8s** |
| 22:37 click | ~13 min | **22s** (cold) |
| 22:24 click | ~20 min | **14s** (cold) |
| 21:28 click | probes still RUNNING | **36s** (cold + contention) |

### Why BOTH fixes were wrong — and were reverted

The three `--version` probes were **accidentally acting as a warm-up** for the login spawn that
followed. Both candidate fixes removed that warm-up:

- **Fix 1 (`getOsPlatformInfo`)** stopped the Login screen triggering the probes -> login went
  from 7s/7s to **14s/22s**. Measured, not theorised. Net HARMFUL to login latency despite being
  a defensible refactor in isolation.
- **Fix 2 (runner-version identity cache)** would remove the spawn entirely. Worse, it would have
  supplied the warm-up on the very first run after install and then silently stopped forever —
  an intermittent regression strictly harder to diagnose than the original always-slow behaviour.
  (This argument was the debugger's, and it is correct.)

### Caveat — do NOT over-fit the decay curve

Gap-since-last-spawn is clearly dominant but is **not** a clean monotonic function of time. The
21:29:38 click came ~58s after the previous spawn finished and still took 18s, whereas the 22:02
click at a ~76s gap took 7s. An OAuth window was open and polling between those two, which may
evict page cache. Treat **"warm-up is the dominant mechanism" as ESTABLISHED** and **"the exact
decay curve" as UNKNOWN**. Candidate (d) (OAuth-window teardown) therefore remains OPEN as a
possible secondary term; it was never cleanly tested.

### Why the obvious fix does not work

"Prewarm on Manage Accounts mount" is *literally what the reverted code already did*, and it
produced the 36s reading: a user who clicks immediately contends with the in-flight extraction,
and only a user who waits ~80s gets 7s. Prewarming relocates the cost rather than removing it
unless the warm-up is guaranteed to COMPLETE before the click, which cannot be guaranteed.

The genuine fix is upstream: `--onedir` packaging for the vendored runners, which eliminates
per-spawn extraction altogether. See [[pyinstaller-onefile-spawn-tax]] — note its recorded
rejection of a stable-extraction-path hack (stale-code risk across version bumps) predates this
3.27x cold/warm measurement and may deserve revisiting, but must not be silently overturned.

What GameLib already ships as mitigation is the honest `preparing` spinner from quick task
260806-teb, which makes the wait truthful rather than shorter.

### Revert record

Reverted 2026-08-06 on user instruction ("revert both fixes"), via `git checkout -- src/`.
- Fix 1's 10 files reverted to HEAD; `git diff -- src/` is empty.
- Fix 2's files (`helperBinaries/index.ts` + tests) were NOT present in the working tree at revert
  time — either already reverted by the debugger or never written to disk. Its description is
  retained below for audit only.
- `.vscode/settings.json` was deliberately NOT touched: it is a pre-existing user modification
  from before this session.
- The reverted work is preserved and recoverable at
  `.planning/debug/evidence/reverted-getOsPlatformInfo-fix.patch` (366 lines, all 10 files).
- Supporting logs: `.planning/debug/evidence/nile-latency-controlled-run-2026-08-06-2158.log`
  (the 7s/7s controlled run) and `harness-run-2026-08-06-2151.log`.

## Resolution

root_cause: "OPEN — WITHDRAWN as of 2026-08-06 falsification. The previously recorded 'two complementary root causes' (Login-screen-forced version-probe contention, and helperBinaries's lack of cross-session caching) are NOT confirmed to explain the user's complaint. Live verification with the contention source (candidate a) completely removed still showed 14-22s click-to-register latency -- WORSE than the pre-fix 7s/7s baseline -- directly falsifying candidate (a) as the fix. See the 2026-08-06 falsification checkpoint in Current Focus for the live candidates now under test: (i) self-warm-up via a preceding same-binary spawn (untested, decisive test designed and pending live execution), (ii) candidate (d) OAuth-window-teardown contention reconsidered for click-2-only (still open, unconfirmed), (iii) a possible rebuild/first-parent-spawn tax specific to the real Rust-hosted process tree (untested, no discriminator round has isolated a real click through the actual compiled Rust host from a bare-process/bare-shell harness). None of these three is preferred over another -- the decisive test is designed specifically to discriminate (i) from (ii)/(iii) without assuming the answer."

fix: "NEITHER fix below is confirmed to address the user's complaint. Both remain uncommitted working-tree changes, pending the decisive test's outcome (see decision_on_fixes_pending_test in Current Focus). Fix 1 (getOsPlatformInfo): kept as a narrow, independently-justifiable refactor (an OS-platform read should not spawn four PyInstaller onefile binaries), NOT as a performance fix -- its performance-fix framing is retracted. Fix 2 (runner-version-caching): its entire premise (repeat version-probe spawns are pure waste) is now in question, since the one piece of live evidence available says removing a version-probe spawn correlates with WORSE latency; leaning toward revert, see reasoning in Current Focus. Original fix descriptions retained below for audit trail:

Fix 1 (as implemented): Added `getOsPlatformInfo()` (backend/utils/systeminfo/index.ts) -- an OS-only read (`process.platform` + `process.getSystemVersion()` + `getOsInfo()`'s cheap name lookup) that never touches the runner binaries. Wired it through both IPC surfaces the existing `getSystemInfo` channel uses (Electron `ipc_handler.ts` and the Tauri sidecar's `settingsFlowRegistration.ts`), added it to the shared `AsyncIPCFunctions` type (common/types/ipc.ts) and preload (`preload/api/settings.ts`), and changed the Login screen to call `window.api.getOsPlatformInfo` instead of `window.api.systemInfo.get`. `getSystemInfo()` itself, its cache/in-flight-memo, and every other consumer (Settings > System Info, the three AltXBin components, launcher.ts, utils.ts's `isMacSonomaOrHigher`, the Electron-path boot dump) are unchanged.

Fix 2 (as implemented): Added a persistent, identity-keyed cache (`runnerVersionCache`, a `CacheStore('runner_versions', null)` constructed directly backend-side in helperBinaries/index.ts -- deliberately NOT added to `RECOGNIZED_CACHE_STORE_NAMES`, since that allow-list gates only renderer-initiated `storeNew` calls) around all four version-probe functions. The cache key is derived from the ACTUAL resolved binary's `fs.stat().size` + `.mtimeMs` (via each runner's real `getXBin()` path resolver, so altXBin overrides are respected) rather than a time TTL -- an app update that swaps the binary produces a new identity key, self-invalidating the old entry, with no risk of ever serving a stale version past a TTL window. An `'invalid'` result (spawn error/abort) is never persisted. Legendary/gogdl/nile additionally get in-flight-promise memoization per runner (mirroring the existing `inFlightSystemInfoFetch`/`inFlightLoginData` pattern), deduping truly concurrent callers of the same runner. `getCometVersion` (a ~0.01s Rust static binary, not the latency source) is identity-cached for consistency but deliberately NOT wrapped in the in-flight pattern, since `spawnSync`'s synchronicity makes that dedup unnecessary complexity for a sub-millisecond race."

verification: "FALSIFIED live, 2026-08-06 22:21-22:40 session. Self-verification (typecheck/tests) from the prior session remains valid as far as it goes (both fixes are internally correct and behavior-preserving for what they explicitly change), but the live click-latency verification that was awaited came back NEGATIVE: fix 1 confirmed to eliminate all version probes for the session (0 fired), yet click-to-register latency was 14s and 22s -- both worse than the pre-fix 7s/7s. This does not mean the fixes are broken or incorrect in what they do; it means they do not explain or fix the user's complaint. Old verification text retained for audit: 'Self-verified (no live GUI access this session): npx tsc --noEmit clean; full test suites green across all four Jest projects (backend 140/140 suites, 3055 tests; frontend 42/42 suites, 477 tests; preload 7/7 suites, 117 tests; common 1/1 suite, 41 tests)... NOT YET verified live: awaiting human checkpoint...' -- that checkpoint has now returned, and falsified the hypothesis it was meant to confirm. Nothing is committed. A new decisive test is designed (see Current Focus) and a CHECKPOINT REACHED is being returned to request it."

files_changed:
  - "src/backend/utils/systeminfo/index.ts (fix 1: added getOsPlatformInfo(), exported it)"
  - "src/backend/utils/ipc_handler.ts (fix 1: registered getOsPlatformInfo, Electron path)"
  - "src/backend/sidecar/settingsFlowRegistration.ts (fix 1: registered getOsPlatformInfo, Tauri sidecar path; updated module docstring)"
  - "src/common/types/ipc.ts (fix 1: added getOsPlatformInfo to AsyncIPCFunctions)"
  - "src/preload/api/settings.ts (fix 1: added getOsPlatformInfo invoker)"
  - "src/frontend/screens/Login/index.tsx (fix 1: switched oldMac gate from window.api.systemInfo.get to window.api.getOsPlatformInfo)"
  - "src/backend/utils/systeminfo/__tests__/index.test.ts (fix 1: new test coverage for getOsPlatformInfo)"
  - "src/backend/sidecar/__tests__/settingsFlows.test.ts (fix 1: new test coverage + mock for getOsPlatformInfo)"
  - "src/frontend/screens/Login/__tests__/loginInFlightUiReachability.test.tsx (fix 1: updated stale source-text pin for the renamed variable)"
  - "src/backend/sidecar/__tests__/gameDetailsImportGate.test.ts (fix 1: deliberately updated sha256 digest + channel list for settingsFlowRegistration.ts's intentional new channel)"
  - "src/backend/utils/helperBinaries/index.ts (fix 2: added identity-keyed CacheStore('runner_versions') + per-runner in-flight-promise memoization around getLegendaryVersion/getGogdlVersion/getNileVersion/getCometVersion)"
  - "src/backend/utils/helperBinaries/__tests__/index.test.ts (fix 2: new test coverage, 12 tests)"
