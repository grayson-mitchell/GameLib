---
phase: quick-261029-utr
plan: 01
status: complete
commits: [d3dfcc0b6, bcb6f22cd]
---

# Quick 261029-utr: Epic login as macOS sheet Summary

Epic's launcher login now routes through the shared `open_pristine_login_sheet` helper (renamed from `open_gog_login_sheet`, new `store: &str` param) after the T-34.4.2-39 latch, same as GOG. Pristine body untouched.

## Commits
- Task 1: d3dfcc0b6 feat(quick-261029-utr): main.rs + tauriShellSource.test.ts
- Task 2: bcb6f22cd docs(quick-261029-utr): REQ-34.4.2-10 DESCOPE LIFTED note (pending live gate; footer left alone, recent notes did not touch it)
- Task 3: live gate PASSED (operator, 2026-10-29).

## Verify results
- PRISTINE-BODY-UNCHANGED printed (awk slice diff vs HEAD).
- cargo build: 0 warnings, 0 errors. cargo test: 371 passed, 0 failed, 2 ignored. rustfmt --check: clean.
- jest (tauriShellSource, loginChromeCssInjection, oauthLoginCapture): 3 suites, 308 tests passed. prettier --check on the .ts file: clean.
- REQ note: exactly 1 "DESCOPE LIFTED 2026-10-29 (quick-261029-utr" match; 1 line changed.
- `graphify update .` run.

## Deviations
- [Rule 1] Test 3b's `indexOf('if is_epic_login {')` also matched the new `let store = if is_epic_login { "epic" }`. Pin tightened to a line-anchored regex asserting no standalone `if is_epic_login {` survives. Code unchanged.
- Four pin updates done as planned (Plan 07 T1, Plan 07/08 T2, Plan 14 T1 and T3, Test 3b), each citing quick-261029-utr. PHASE_34_4_2_NEW_SYMBOLS guard and Guard 1/2 untouched and green.
- Stale comments updated (login_window_ns_window doc, arm present-block, latch comment, pristine-route comment, Esc monitor comment); none in the pristine body.

## Live gate
PASSED 2026-10-29: operator replied "approved" to the full step 0-6 checkpoint (Epic login end-to-end in the sheet with no 403/challenge, 464x592 fits, × / Esc / successful login dismiss to idle, latch, GOG regression, in-store Sign in unaffected). The operator gave no step-level detail, so whether step 4's second sign-in was refused outright or was unreachable by hand (modality + armed log line) is not recorded. Descope REQ-34.4.2-10 lift stands; no rollback.
