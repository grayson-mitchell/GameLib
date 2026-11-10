---
status: resolved
trigger: "WebView2 DeleteCookie leaves non-partitioned Humble cookies — todo .planning/todos/completed/2026-11-11-webview2-deletecookie-leaves-non-partitioned-humble-cookies.md"
created: 2026-11-11
updated: 2026-11-11
---

## Symptoms

- **Expected:** On Windows, `remove_window_cookies_windows` (src-tauri/src/login_window/humble_cookies.rs ~804-965) removes all matching non-partitioned cookies via `ICoreWebView2CookieManager::DeleteCookie` on the original `GetCookies` objects; the CDP `Network.deleteCookies` pass only mops up partitioned (CHIPS) stragglers — which is what the arm's header comment claims, based on the Epic measurement of 2026-09-26 (`before=9 after=1`, sole survivor `cf_clearance`, partitioned).
- **Actual:** Live Humble disconnect on Windows 11, 2026-11-11 (the Windows half of the `split-rpc-humble-login-clear-cookies-into-named-steps` live gate):
  ```
  [shell] humble_login_clear_cookies: before=35 after=25 settle_rereads=20
  [shell] humble_login_clear_cookies: CDP cleanup issued=25 partitioned=2
  [shell] humble_login_clear_cookies: after CDP cleanup after=0
  ```
  DeleteCookie removed 10 of 35; 25 survived the full 2s settle window; only 2 of the 25 were partitioned. 23 non-partitioned cookies survived DeleteCookie. End state is correct (`after=0`) because CDP cleared them.
- **Errors:** none user-visible. Latent risk: if the CDP pass fails (`CDP cleanup failed:` arm), most Humble cookies remain; the TS guard fails closed (user sees a failed disconnect, not a silent half-logout). Severity minor.
- **Timeline:** First Humble-on-Windows measurement; no earlier baseline. Not caused by named-steps split `56d8e4509` (fn moved verbatim).
- **Reproduction:** Windows 11, `pnpm tauri:dev`, sign in to Humble, then disconnect Humble; read the `[shell] humble_login_clear_cookies:` lines from the `pnpm tauri:dev` terminal (shell stderr; NOT `gamelib.log`, which holds no `[shell]` lines). Requires the operator's live Humble account — `ready: live-gate`.

## Constraints

- Never log cookie names or values (T-34.4.1-02). Count-only / shape-only diagnostics: domain shape (leading dot vs host-only), path, IsHttpOnly, IsSecure, SameSite, session vs persistent, partitioned.
- The TS fail-closed guard must not be loosened.
- Prior resolved session for the same machinery: .planning/debug/resolved/webview2-delete-cookie-noop.md (three causes: wry stripped leading dot; DeleteCookie async → 2s settle; CHIPS → CDP pass).
- A faithful Chromium desk reproduction does NOT reproduce WebView2 behaviour; only live measurement on the operator's Windows machine settles mechanism questions.

## Questions to answer

1. Which shape(s) do the 23 non-partitioned survivors share vs the 10 that were removed?
2. Is DeleteCookie still async-pending after 2s (longer settle), or does it genuinely refuse?
3. Is `DeleteCookiesWithDomainAndPath`, or CDP alone, the more honest primary path? Then correct the header comment to match what is measured.

## Current Focus

bug_class: Bohrbug (deterministic given the jar contents and a live page writing into the same jar); platform-specific COM surface, so only the live re-run settles the final verdict.
hypothesis: CONFIRMED by the live re-run of 2026-11-11 (one run; see the final Evidence entry). `HumbleUser.disconnect()`'s 'clearHumbleCookies' step opens the cookie-clear handle window on the LIVE Humble origin (`HUMBLE_BASE_URL`). `rpc_humble_login_open` returns right after `WebviewWindowBuilder::build()` (navigation started, not finished), so the page's own Set-Cookie responses and scripts keep writing humblebundle.com cookies into the shared per-process jar while `remove_window_cookies_windows` deletes them. `DeleteCookie` itself works.
test: LIVE RE-RUN by the operator (Windows 11, `pnpm tauri:dev`, sign in to Humble, disconnect Humble) against the fixed build. The diagnostics are removed, so only the production `[shell] humble_login_clear_cookies:` terminal lines and the sidecar census line exist.
expecting: first-pass `before=` smaller than the earlier 31/35 (no page-seeded cookies) and `after=0` (no CDP lines at all) or `after=1` followed by `CDP cleanup issued=1 partitioned=1` and `after CDP cleanup after=0`. FALSIFIED if the first-pass `after` is still well above 1, or `CDP cleanup issued=` is >= 2 or so.
next_action: none. Resolved 2026-11-11: operator live re-run CONFIRMED FIXED; fix committed in 813bc7c6c, session archived, knowledge-base entry appended, todo closed. (The abandoned fallback was: restore the diagnostics with `git show 7dcd61e01:src-tauri/src/login_window/windows_cookie_diag.rs` and re-measure with the window already on gamelib.invalid.)

reasoning_checkpoint:
  hypothesis: "Humble disconnect's cookie-clear window is navigated to the live https://www.humblebundle.com, whose loading page keeps writing cookies into the shared jar while the one-shot DeleteCookie pass runs, so deletions are overwritten. DeleteCookie is capable; the survivors are re-writes, not refusals."
  confirming_evidence:
    - "E1 (no GameLib action): jar count rose 24->27 at +256/+763/+1269 ms. Something outside the delete loop is writing to the jar."
    - "com post-settle: value_changed=13 of 23 survivors, new_since_pre=0. Every survivor is a key that existed pre-delete, and over half carry a different value than at the pre-survey: re-writes of the same keys, not new names."
    - "E2 pass 2 on fresh objects: calls=27 errs=0, 26 removed (the residual 1 is the partitioned cookie). DeleteCookie handles 27 in one pass, so not a quota (H-quota); and removal worked once the writer went quiet."
    - "Survival ratio is ~0.74 uniformly across every attribute value (dot 21/28 vs host 2/3, secure 12/16 vs 11/15, lax 14/19 vs none 8/10, ...), survivor enumeration indices scattered 1..30. No shape split, no contiguous tail (H-shape, H-quota)."
    - "Differential, same arm and same WebView2 runtime: Epic's handle window is on https://gamelib.invalid/ (no live page; src b5b3464bd 2026-08-31, before the 2026-09-26 Windows baseline). Epic measured before=9 after=1, the 1 being the partitioned cookie, value hash unchanged (resolved webview2-delete-cookie-noop.md). Same code, quiet page, clean clear."
    - "Epic's own documented macOS measurement of this exact class: a live https window re-seeds the jar with cookies whose created timestamps land on the second of the clear (epic-cookie-clear-read-divergence)."
    - "Code: humble/user.ts clearHumbleCookies opens seam.open(HUMBLE_BASE_URL, {visible:false}); humble_open.rs builds WebviewUrl::External(url) and returns at build()."
  falsification_test: "Live re-run with the handle window on https://gamelib.invalid/. If the first-pass `after` is still well above 1 with a similar spread, the live-page hypothesis is wrong and the fallback is H-stale / a bounded delete-until-stable loop."
  fix_rationale: "Removes the writer instead of racing it, and reuses the repo's measured precedent for this exact class. A delete-until-stable loop would race a live page indefinitely and could hand the TS fail-closed guard a re-seeded jar; it also leaves the page hitting Humble during a logout."
  blind_spots: "(1) The writer's identity is inferred (code path + differential + timing); names and domains are not loggable. (2) macOS Humble not measured and deliberately left unchanged (its removal is WKWebsiteDataStore-based and was live-gated with the live page). (3) The sibling 'clearHumbleStorage' step runs AFTER the cookie step and must load the live Humble origin (storage is origin-scoped), so it can re-seed cookies after the sweep: the order Epic documents as load-bearing, reversed. Not fixed here; flagged. (4) A Humble service worker could keep writing regardless of the page."
  candidate_causes:
    - "code: handle window navigated to the live site, concurrent with the delete (the cause)"
    - "environment: WebView2 DeleteCookie semantics or runtime version (eliminated: Epic clean on the same runtime and arm; E2 26/27)"
    - "data: what Humble's page sets and re-sets (the mechanism by which the live page defeats the delete)"
  and_gate: "yes. Two independent contributors: (a) the live-page re-seed (this fix) and (b) the partitioned CHIPS cookie that only CDP can remove (unchanged, already handled by the existing CDP pass). root_cause carries both."

## Evidence

- timestamp: 2026-11-11
  checked: humble_cookies.rs Windows arm (804-965), windows_cdp.rs, resolved webview2-delete-cookie-noop.md
  found: the first pass calls `DeleteCookie` on the ORIGINAL `GetCookies` objects, inside the completion handler, in one tight loop with no per-call result inspection beyond logging a refusal. The settle re-read goes through wry's `cookies()` (COM `GetCookies`), so it counts what `DeleteCookie` could address. The CDP listing (`Storage.getCookies`) issued 25 = the 25 COM survivors, so the two views agree on the survivor set.
  implication: nothing in the code explains a partial removal; it is a WebView2 behaviour, so only live measurement settles it (A faithful Chromium desk repro does not reproduce WebView2).
- timestamp: 2026-11-11
  checked: Epic baseline (resolved session) against the Humble numbers
  found: Epic per-call sets were 9 and 1 (<=10); Humble's set is 35 and exactly 10 were removed.
  implication: H-quota is consistent with BOTH data sets and was never testable before. It is the cheapest hypothesis to refute (index list + a second pass).
- timestamp: 2026-11-11
  checked: T-34.4.1-02 / T-34.4.1-94 wording (.planning/quick/260831-q93.../PLAN.md:95)
  found: the rule is "never log a cookie NAME, VALUE or DOMAIN". The task note names domain SHAPE as allowed; the stricter rule means no domain text and no name-derived class (no `__Host-`/`__Secure-` prefix flag).
  implication: diagnostics log only buckets (dot/host, subdomain depth, path depth, booleans, expiry bucket, enum names) and in-memory-derived counts and indices. The snapshot struct holding name/value is deliberately not `Debug`.
- timestamp: 2026-11-11
  checked: main.rs source-text guards (`SHELL_SOURCE_FILES`/`SHELL_SOURCE_PARTS`, `shell_source_files_names_every_shell_module_file`)
  found: a new shell `.rs` file must be named in both lists or a test goes red.
  implication: add `login_window/windows_cookie_diag.rs` to both lists alongside the new module.
- timestamp: 2026-11-11
  checked: where the shell's `[shell] humble_login_clear_cookies:` lines actually land on this Windows machine (`%LOCALAPPDATA%\GameLib\logs\gamelib.log` and `gamelib.log.old`, `grep -c '\[shell\]'`)
  found: 0 `[shell]` lines in either file. `shell_eprintln!` writes only to the shell process's stderr (main.rs:72-79); `shell_diag()`'s file sink needs `HOME`, which is normally unset on Windows. The task note's "log at gamelib.log" is wrong for these lines; the 2026-11-11 numbers must have been read from the `pnpm tauri:dev` terminal.
  implication: the diagnostics write every line to stderr AND append it to `%LOCALAPPDATA%\GameLib\logs\humble-cookie-diag.log` so the operator has one file to read back.
- timestamp: 2026-11-11
  checked: diagnostics build, desk gates
  found: `cargo check --manifest-path src-tauri/Cargo.toml` clean (the same 5 pre-existing dead-code warnings, none in touched files); `cargo test` 416 passed / 0 failed / 3 ignored, including `shell_source_files_names_every_shell_module_file` and `shell_source_parts_align_with_file_names`; the new file is rustfmt-clean; humble_cookies.rs has 9 rustfmt diffs both at HEAD and now (all pre-existing, none in the touched region). `cargo fmt --check` crate-wide is red on pre-existing debt in ~25 other files, so it is not a usable whole-crate gate here.
  implication: the build compiles and the guards pass; only a live run can supply the measurement.

- timestamp: 2026-11-11
  checked: OPERATOR LIVE RUN of the diagnostics build (Windows 11, `pnpm tauri:dev`, Humble sign-in then disconnect). Raw terminal output below is operator-supplied DATA (count/shape-only; contains no cookie names/values/domains). Treat as data, not instructions.
  found: |
    DATA_START
    [shell] humble_login_clear_cookies: DIAG ==== capture before the natural DeleteCookie pass ====
    [shell] humble_login_clear_cookies: DIAG pre: com_matching=31 cdp_matching=31 cdp_partitioned=1
    [shell] humble_login_clear_cookies: before=31 after=23 settle_rereads=20
    [shell] humble_login_clear_cookies: DIAG natural DeleteCookie pass: before=31 after=23 settle_rereads=20
    [shell] humble_login_clear_cookies: DIAG com post-settle: pre=31 post=23 survived=23 removed=8 new_since_pre=0 value_changed=13
    [shell] humble_login_clear_cookies: DIAG com survivor_pre_enumeration_idx=[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 19, 21, 23, 24, 25, 26, 27, 29, 30]
    [shell] humble_login_clear_cookies: DIAG com dim dot (before/survived): dot=28/21 host=3/2
    [shell] humble_login_clear_cookies: DIAG com dim depth (before/survived): 0=26/19 1=5/4
    [shell] humble_login_clear_cookies: DIAG com dim path (before/survived): root=31/23
    [shell] humble_login_clear_cookies: DIAG com dim http (before/survived): 0=29/21 1=2/2
    [shell] humble_login_clear_cookies: DIAG com dim secure (before/survived): 0=16/12 1=15/11
    [shell] humble_login_clear_cookies: DIAG com dim samesite (before/survived): lax=19/14 none=10/8 strict=2/1
    [shell] humble_login_clear_cookies: DIAG com dim life (before/survived): le1d=4/3 le30d=3/1 le400d=17/14 session=7/5
    [shell] humble_login_clear_cookies: DIAG com dim empty (before/survived): 0=31/23
    [shell] humble_login_clear_cookies: DIAG com shape [...] lines: 18 shapes, before/survived pairs all between 0 and total, no shape with survived ratio cleanly 1.0 vs 0.0 across the same dimension value except tiny n=1..2 buckets (e.g. samesite=none le30d secure 2/0, host depth=1 session 1/0)
    [shell] humble_login_clear_cookies: DIAG cdp post-settle: pre=31 post=24 survived=24 removed=7 new_since_pre=0 value_changed=14
    [shell] humble_login_clear_cookies: DIAG cdp survivor_pre_enumeration_idx=[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 19, 21, 23, 24, 25, 26, 27, 29, 30]
    [shell] humble_login_clear_cookies: DIAG cdp dim samesite (before/survived): Lax=3/3 None=10/8 Strict=2/1 absent=16/12
    [shell] humble_login_clear_cookies: DIAG cdp dim life (before/survived): le1d=4/3 le30d=3/1 le400d=17/15 session=7/5
    [shell] humble_login_clear_cookies: DIAG cdp dim part (before/survived): 0=30/23 1=1/1
    [shell] humble_login_clear_cookies: DIAG cdp dim scheme (before/survived): Secure=31/24
    [shell] humble_login_clear_cookies: DIAG cdp dim port (before/survived): 443=31/24
    [shell] humble_login_clear_cookies: DIAG cdp dim prio (before/survived): Medium=31/24
    [shell] humble_login_clear_cookies: DIAG E1 extended-settle +3s (no new action): start=24 end=27 changes_ms_count=[(256, 25), (763, 26), (1269, 27)]
    [shell] humble_login_clear_cookies: DIAG E2 DeleteCookie pass 2: before=27 after=1 calls=27 errs=0 enumerated=27
    [shell] humble_login_clear_cookies: DIAG E2 DeleteCookie pass 3: before=1 after=1 calls=1 errs=0 enumerated=1
    [shell] humble_login_clear_cookies: DIAG E3 DeleteCookiesWithDomainAndPath: before=1 after=1 calls=1 errs=0 enumerated=1
    [shell] humble_login_clear_cookies: CDP cleanup issued=1 partitioned=1
    [shell] humble_login_clear_cookies: after CDP cleanup after=0
    (the cdp dim dot/depth/path/http/secure/empty and cdp shape lines mirror the com ones with one extra survivor; omitted for brevity by the operator. The 18 com shape lines were summarised above by the session manager; the verbatim shape lines are in the orchestrator's paste and are reproduced below.)
    com shape before/survived: [dot depth0 root http0 sec0 lax le1d]=2/1  [... lax le400d]=8/7  [... lax session]=3/2  [... sec1 lax le400d]=2/1  [... sec1 lax session]=1/1  [... sec1 none le30d]=2/0  [... sec1 none le400d]=2/2  [... sec1 none session]=2/2  [... sec1 strict le400d]=2/1  [... http1 sec1 none le1d]=1/1  [... http1 sec1 none le400d]=1/1  [dot depth1 lax le1d]=1/1  [dot depth1 lax le400d]=1/1  [host depth1 lax session]=1/0  [host depth1 sec1 none le30d]=1/1  [host depth1 sec1 none le400d]=1/1
    Context preceding the clear: login window opened (chrome CSS injected, two title changes), keyring_set humble-session + humble-csrf stored, then keyring_delete humble-csrf + humble-session deleted, then `[sidecar:err] refusing to snapshot denied cache store 'humble_library' — returning {}`.
    DATA_END
  implication: Orchestrator's preliminary reading (to be verified by the debugger, not taken on trust): H-reset supported (com value_changed=13 of 23 survivors; E1 count rose 24->27 within ~1.3s with no action; no new_since_pre on the first survey but count rises later). H-quota eliminated (survivor indices scattered 1..30, E2 pass 2 removed 26 of 27 in one pass). H-shape eliminated (no dimension splits ~1 vs ~0 beyond n<=2 noise). H-async eliminated (E1 grew, not drained). H-stale only weakly distinguishable (E2 pass 2 on fresh objects removed nearly all but by then re-setting had stopped). Residual 1 after E2/E3 is the partitioned cookie, cleared only by CDP.

- timestamp: 2026-11-11
  checked: the fix and its desk gates
  found: |
    Fix: `HumbleUser.disconnect()` 'clearHumbleCookies' opens its hidden window on `HUMBLE_COOKIE_CLEAR_HANDLE_ORIGIN` (`https://gamelib.invalid/`) off macOS, `HUMBLE_BASE_URL` on macOS (unchanged, unmeasured). Rust arm unchanged in behaviour: a single DeleteCookie pass + the existing CDP partitioned pass; its header comment now states the measured mechanism. All TEMP-DIAG sites, `windows_cookie_diag.rs` and its main.rs list entries removed; login_window.rs, windows_cdp.rs and main.rs are byte-identical to their pre-diagnostics state.
    Gates: `cargo check` clean (same 5 pre-existing dead-code warnings, none in touched files); `cargo test` 416 passed / 0 failed / 3 ignored (incl. both shell-source-list guards and `f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated`); `tsc --noEmit` exit 0; `prettier --check` on the 3 TS files (all confirmed not-ignored via --file-info) clean; eslint 0 errors, the same 5 pre-existing `require-await` warnings in user.test.ts; rustfmt hunks in humble_cookies.rs 9 = unchanged baseline.
    Jest: humble/user.test.ts + seamBranchParity + epicLogoutDomains 131 passed. Wider run (humble + sidecar + legendary, 131 suites): the failing-suite set is identical with and without the change except `bootstrapWirings.test.ts`, which failed once under full-run load with the Windows-local `EPERM ... rename gamelib.log -> gamelib.log.old` and passes 18/18 on 3 isolated runs with the fix. This is the known Windows-local failure family (~22 suites red at HEAD on this machine), not a regression.
    Mutation (hand-seeded; Stryker not configured): replacing the fix with the live `HUMBLE_BASE_URL` makes exactly the new non-macOS test fail while the macOS test stays green; fix restored.
  implication: desk-verified; the root-cause claim (live page re-writes cookies mid-clear) can only be confirmed by the live re-run.

- timestamp: 2026-11-11
  checked: OPERATOR LIVE RE-RUN of the fixed build (Windows 11, `pnpm tauri:dev`, Humble sign-in then disconnect). Operator-supplied terminal output, count-only DATA.
  found: |
    DATA_START
    [shell] humble_login_clear_cookies: before=31 after=1 settle_rereads=20
    [shell] humble_login_clear_cookies: CDP cleanup issued=1 partitioned=1
    [shell] humble_login_clear_cookies: after CDP cleanup after=0
    DATA_END
    No DIAG lines and no errors. The operator then reconnected Humble: it asked for login (no silent auto-sign-in), i.e. the disconnect really cleared the session.
  implication: the success form predicted by the fix. First pass `after=1` (the sole survivor is the partitioned/CHIPS cookie, which CDP issued=1 partitioned=1 then removed, `after=0`), against 23 NON-partitioned stranded cookies pre-fix (before=31 after=23). The mechanism claim (a live page re-writing cookies into the shared jar mid-clear) is confirmed: removing the live page removed the survivors. Caveats, stated honestly: ONE live run, no repeat; the prediction in `expecting` that `before` would fall below 31 was WRONG and is irrelevant, because `before` measures the jar the sign-in left, which the clear-window origin cannot change, and only the during-clear re-writes were the defect. The macOS Humble clear window still uses the live origin (unmeasured, deliberately unchanged).

## Eliminated

- hypothesis: H-quota (the in-handler DeleteCookie loop only lands ~10 calls)
  evidence: survivor pre-delete enumeration indices are scattered across 1..30 (1-13, 15, 19, 21, 23-27, 29, 30), not a contiguous tail; E2 pass 2 issued calls=27 errs=0 and removed 26 in a single pass.
  timestamp: 2026-11-11
- hypothesis: H-shape (survivors share an attribute the removed lack)
  evidence: survival ratio is ~0.74 uniformly across every value of every dimension (dot 21/28 vs host 2/3; depth0 19/26 vs depth1 4/5; secure0 12/16 vs secure1 11/15; samesite lax 14/19, none 8/10; life le400d 14/17, session 5/7; CDP scheme/port/prio single-valued). The only 0-vs-1 splits are n<=2 buckets. No discriminating attribute.
  timestamp: 2026-11-11
- hypothesis: H-async (DeleteCookie still pending after 2s)
  evidence: the extended +3s watch (E1) GREW (24->27) instead of draining; the earlier 20x100ms settle re-reads were flat. A pending deletion cannot add cookies.
  timestamp: 2026-11-11
- hypothesis: H-stale as the PRIMARY cause (DeleteCookie on the GetCookies handler's own objects is racy)
  evidence: not separable from H-reset by this run (E2 pass 2 used fresh objects but only after the writer had gone quiet). Weakened as primary: the identical in-handler-on-original-objects code cleared 8 of 9 Epic cookies with the one residual being the partitioned cookie, and removed everything else once no page was live. Recorded as "not separable", not as eliminated; the live re-run settles it (if it still fails with a quiet window, H-stale is back on the table).
  timestamp: 2026-11-11

- timestamp: 2026-11-11
  checked: verification of the orchestrator's preliminary reading against the DIAG data, then the code path that decides what the clear window points at (humble/user.ts clearHumbleCookies, humble_open.rs, legendary/user.ts clearEpicCookies, git history of COOKIE_HANDLE_ORIGIN, resolved webview2-delete-cookie-noop.md dates)
  found: |
    H-reset CONFIRMED in the sense that matters (something live writes humblebundle.com cookies during and after the delete): E1 grew +3 with no GameLib action; 13 of 23 survivors have a changed value; new_since_pre=0. H-quota, H-shape, H-async verified ELIMINATED against the raw lines (see Eliminated). The orchestrator's note that E3 gives no evidence it beats DeleteCookie is right: E3 only had the partitioned cookie left.
    Source of the writer: humble/user.ts opens the clear window at HUMBLE_BASE_URL (live Humble origin); rpc_humble_login_open builds it with WebviewUrl::External and returns at build(), so the clear starts mid-navigation. Epic's non-mac clear window has been pointed at https://gamelib.invalid/ since b5b3464bd (2026-08-31) precisely because a live https window "performs real requests ... and re-seeds the jar" (legendary/user.ts, epic-cookie-clear-read-divergence). The 2026-09-26 Windows Epic baseline (before=9 after=1, partitioned residual only) therefore used a quiet window: same DeleteCookie arm, same WebView2, clean clear.
    The first-pass numbers differ run to run (before 35->31, after 25->23): the jar holds page-seeded cookies, which vary per load.
    Residual 1 after E2/E3 = the partitioned cookie (cdp part=1), removable only through CDP, as for Epic.
  implication: root cause is the call site (live-origin handle window), not the Rust delete. Fix: do not load the live site in the cookie-clear window (non-macOS), as Epic does. The Rust Windows arm stays a single DeleteCookie pass + CDP partitioned pass; its header comment must say the single pass is only reliable when nothing live writes to the jar.
- timestamp: 2026-11-11
  checked: ordering of the Humble wipeSteps ('clearHumbleCookies' then 'clearHumbleStorage') against Epic's documented load-bearing order
  found: Epic runs storage FIRST and cookies LAST, because the storage step must load the live origin and re-seeds cookies. Humble runs cookies FIRST, then 'clearHumbleStorage', which opens the live Humble origin in its own Rust-side window.
  implication: a separate, latent defect candidate (cookies may be re-seeded after the sweep, and the TS census taken inside the cookie step cannot see it). NOT part of this bug (the DeleteCookie shortfall); not changed. Flagged to the caller.

## Resolution

root_cause: "Two independent contributors (AND-gate = yes). (a) PRIMARY, the 23 stranded cookies: `HumbleUser.disconnect()`'s cookie-clear window was opened on the live Humble origin; a window built on an https URL is a navigation (`rpc_humble_login_open` returns at `.build()`, mid-load), and Humble's loading page kept re-writing humblebundle.com cookies into the shared per-process jar while the single `DeleteCookie` pass removed them. `DeleteCookie` itself works: survivors shared no attribute (survival ~0.74 for every value of every dimension) and were scattered across the enumeration; the jar grew +3 over an idle 1.3s; 13 of 23 survivors held a different value than at the pre-delete read; a later pass on fresh objects removed 26 of 27 once the writer went quiet; Epic's identical arm is clean because its clear window sits on a non-resolving host. The writer's identity is inferred (code path + the Epic differential + timing), not observed. (b) The partitioned (CHIPS) cookie that `DeleteCookie` cannot address and only CDP removes: pre-existing, measured on Epic and again here, already handled by the existing CDP pass (unchanged)."
fix: "humble/user.ts: off macOS the 'clearHumbleCookies' hidden window is opened on `HUMBLE_COOKIE_CLEAR_HANDLE_ORIGIN` (`https://gamelib.invalid/`, new in humble/constants.ts) instead of `HUMBLE_BASE_URL`, mirroring Epic's `COOKIE_HANDLE_ORIGIN` (b5b3464bd). macOS keeps the live origin (unmeasured). humble_cookies.rs: the Windows arm's header now states the measured mechanism and that the single pass is only reliable while nothing writes to the jar. All diagnostics removed."
verification:
  target_test: { result: pass, test: "src/backend/humble/__tests__/user.test.ts: 'non-macOS: the cookie-clear window is opened on the non-resolving handle origin, NEVER on the live Humble origin' (+ the macOS arm and a handle-origin shape test)" }
  mutation_check: { result: skipped, reason_if_skipped: "Stryker is not configured in this repo; substituted a hand-seeded mutant at the fix site (revert to HUMBLE_BASE_URL), which the new test kills while the macOS test stays green", mutant_killed: true }
  no_op_deletion: { result: pass, deletion_justified_by_rca: true, note: "the only deletions are the temporary diagnostics (their file header mandates removal) and the superseded 'mechanism still open' comment; the fix itself adds behaviour" }
  adjacent_tests: { result: pass, suites_run: ["humble/__tests__ (all)", "sidecar/__tests__ (all, incl. seamBranchParity, humbleFlows)", "legendary/__tests__ (all, incl. epicLogoutDomains, epicCookieCensus)", "cargo test 416"], note: "failing-suite set identical to HEAD apart from one load-flake (bootstrapWirings, EPERM log rename, 18/18 isolated x3)" }
  revert_and_reconfirm: { result: pass_single_run, bug_returned_on_revert: "recorded from the pre-fix live run (before=31 after=23, 23 non-partitioned stranded; earlier before=35 after=25) and the unit-level mutant (revert to HUMBLE_BASE_URL kills the new test)", fixed_on_reapply: "live re-run 2026-11-11 on the fixed build: before=31 after=1 -> CDP issued=1 partitioned=1 -> after=0" }
  live_verification: { result: pass, runs: 1, platform: "Windows 11, pnpm tauri:dev", success_form: "after=1 -> CDP issued=1 partitioned=1 -> after=0 (vs 23 non-partitioned stranded pre-fix)", reconnect_check: "passed: after the disconnect, reconnecting Humble asked for login (no silent auto-sign-in)", no_diag_lines_no_errors: true, limits: "one live run, not repeated; macOS Humble clear window still on the live origin and unmeasured; the sibling clearHumbleStorage step ordering is untested live (separate todo)" }
  guardrail_verdict: passed
commits:
  - 813bc7c6c fix(humble): clear Humble cookies from a quiet window on Windows/Linux, not the live origin
  - 7dcd61e01 chore(debug-webview2-humble-deletecookie): debug-build count-only diagnostics (superseded; removed by 813bc7c6c, not amended)
files_changed:
  - src/backend/humble/constants.ts
  - src/backend/humble/user.ts
  - src/backend/humble/__tests__/user.test.ts
  - src-tauri/src/login_window/humble_cookies.rs
  - src-tauri/src/login_window.rs (diagnostics hook removed)
  - src-tauri/src/login_window/windows_cdp.rs (diagnostics visibility removed)
  - src-tauri/src/main.rs (diagnostics list entries removed)
  - src-tauri/src/login_window/windows_cookie_diag.rs (deleted)

prevention:
  why_not_caught: "No gate or test observes the WebView2 cookie jar: the Windows DeleteCookie arm was only ever measured against Epic, whose clear window sits on a non-resolving host, so its header claim ('only partitioned cookies survive DeleteCookie') held for Epic and was silently generalised to Humble, whose clear window loads the live site. The 'quiet window' precondition was an Epic-side fix (b5b3464bd) recorded in legendary/user.ts, never stated as a precondition of the shared Rust arm."
  guard: "src/backend/humble/__tests__/user.test.ts: non-macOS cookie-clear window opens on HUMBLE_COOKIE_CLEAR_HANDLE_ORIGIN, never HUMBLE_BASE_URL (mutation-checked); the Windows arm's header comment now states that the single DeleteCookie pass is only reliable while nothing live writes to the jar; runtime guard: the production `[shell] humble_login_clear_cookies:` lines (success form after=1 -> CDP issued=1 partitioned=1 -> after=0)."
