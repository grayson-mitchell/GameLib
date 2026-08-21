---
phase: quick-260822-eib
plan: 01
subsystem: ui
tags: [tauri, electron, webview, css, humble, login]

requires:
  - phase: quick-260822-di1
    provides: "HUMBLE_LOGIN_CHROME_CSS single-source-of-truth constant, drift-pinned Rust literal, and the forbidden/protected-selector gate scaffolding this task extends"
provides:
  - "HUMBLE_LOGIN_CHROME_CSS extended to two rules (footer.site-footer + .simple-navbar), still single-line/space-separated on both login surfaces"
  - "All simple-navbar gates inverted from 'must not touch' to 'must hide', with the four legally/functionally protected selectors and the two signup-affordance selectors still pinned absent"
  - "A new drift-pin RED proof covering the half-applied-update failure mode (TS constant updated, Rust concat! literal forgotten)"
affects: [humble-login, webview-login-chrome]

tech-stack:
  added: []
  patterns:
    - "Two-task split for a gate-flip change: land production code alone first and CAPTURE the real gate failures it causes, then flip the gates in a second commit -- proves the flipped assertions were non-vacuous against the real code path, not a synthetic reimplementation"

key-files:
  created: []
  modified:
    - src/common/humble/loginChromeCss.ts
    - src-tauri/src/main.rs
    - src/frontend/screens/WebView/components/humbleLoginChromeCss.ts
    - src/backend/humble/__tests__/loginChromeCss.test.ts
    - src/backend/__tests__/loginChromeCssInjection.test.ts

key-decisions:
  - "D-1: two SEPARATE CSS rules, not a comma-joined selector list -- a syntax error in one rule must not drop the other"
  - "D-2: the constant stays ONE line, two rules, one space between them -- a newline would force a \\n escape on the Rust side, breaking the drift pin's byte equality unfixably"
  - "D-3: forbidden lists shrink by exactly one entry each (Rust: 5->4, jest: 8->7); js-view-body/js-login-form stay forbidden as the signup-affordance guarantee"
  - "D-4: renamed the Rust test off its now-false 'and nothing else' claim; grep confirmed the old name was not referenced by any survival pin"
  - "D-5: the navbar-logo authenticity-cue rationale from di1 is superseded and recorded as such in source -- origin is already shown by login_origin_banner_script, and a page-rendered logo was never unforgeable"
  - "D-6: the ~124-char Rust literal line is NOT split -- no rustfmt.toml, main.rs already has 91 lines over 100 chars, and D-2 requires one line anyway"

requirements-completed: []

duration: ~35min
completed: 2026-08-22
---

# Quick Task 260822-eib: Strip the Humble login navbar so only the login form remains Summary

**Extends the shared Humble login-chrome CSS constant from one rule to two (`footer.site-footer` + `.simple-navbar`), inverting every gate that used to forbid the navbar selector into one that requires it -- split across two commits so the resulting RED-then-GREEN transition is real, observed evidence rather than a reasoned claim.**

## The CSS that shipped

```css
footer.site-footer { display: none !important; } .simple-navbar { display: none !important; }
```

Still one line, two independent rules, one space between them (D-1/D-2 -- both load-bearing, see decisions above). Measured live from Humble's CSS bundle on 2026-08-22: `.simple-navbar` is `background:#3b3e48; height:4.375em; width:100%` with flex centering, and its only content is the Humble logo link -- nothing else.

## Two-task split and the RED-direction proof it exists to produce

Task 1 changed **production CSS only** in `loginChromeCss.ts`, `main.rs`'s `login_chrome_css_script()`, and the Electron doc comment -- and deliberately left every test/gate file untouched. Running the existing (still-unflipped) gates against that change produced exactly the three required failures, captured verbatim:

**(a) cargo, `login_chrome_css_script_hides_the_marketing_footer_and_nothing_else`:**
```
thread 'tests::login_chrome_css_script_hides_the_marketing_footer_and_nothing_else' panicked at src/main.rs:7355:13:
assertion failed: !script.contains(forbidden)
test result: FAILED. 7 passed; 1 failed; 0 ignored; 0 measured; 148 filtered out; finished in 0.00s
```

**(b) jest, `HUMBLE_LOGIN_CHROME_CSS > is exactly the one footer-hiding rule`:**
```
expect(received).toBe(expected) // Object.is equality
Expected: "footer.site-footer { display: none !important; }"
Received: "footer.site-footer { display: none !important; } .simple-navbar { display: none !important; }"
```

**(c) jest, `HUMBLE_LOGIN_CHROME_CSS > does not name the protected selector simple-navbar`:**
```
expect(received).not.toContain(expected) // indexOf
Expected substring: not "simple-navbar"
Received string:        "footer.site-footer { display: none !important; } .simple-navbar { display: none !important; }"
```
Full run: `Test Suites: 1 failed, 1 passed, 2 total`, `Tests: 2 failed, 36 passed, 38 total`.

The drift pin (`loginChromeCssInjection.test.ts`'s `DRIFT PIN (T-di1-06)` describe, "the real login_chrome_css_script fn body embeds exactly HUMBLE_LOGIN_CHROME_CSS") was **GREEN** at this point, as required -- both literals changed together in the same commit, so byte equality held even while the forbidden-selector gates broke.

None of (a)/(b)/(c) passed unexpectedly, so no vacuous-gate finding to report.

Task 2 then flipped every gate:
- Rust `forbidden` array: removed `simple-navbar`, leaving the four D-3 survivors (`#flash`, `page-top-messages`, `grayout`, `zdconsent`). Added a positive `.simple-navbar` assertion alongside the existing footer one. Renamed the test to `login_chrome_css_script_hides_the_footer_and_navbar_leaving_the_four_protected_selectors_untouched`.
- jest `test.each` forbidden list: removed `'simple-navbar'`, leaving the seven D-3 survivors (`js-view-body`/`js-login-form` explicitly retained as the signup-affordance guarantee). Added a standalone positive `toContain` test. Renamed the exact-string gate to describe two rules, not one.
- `loginChromeCssInjection.test.ts`: added one new drift-pin RED proof feeding di1's old one-rule literal through the SAME `extractCssLiteral` helper the real gate uses, asserting it extracts non-null but not-equal -- the specific half-applied-update failure mode (TS side updated, Rust `concat!` literal forgotten, or vice versa) that this change introduces and that the pre-existing generic mismatched-literal RED proof did not exercise.

## Post-flip verification (all commands run for real, output below is actual, not assumed)

```
$ npx jest src/backend/humble/__tests__/loginChromeCss.test.ts src/backend/__tests__/loginChromeCssInjection.test.ts src/frontend/screens/WebView/__tests__/humbleLoginChromeCss.test.ts --no-coverage
PASS Backend src/backend/humble/__tests__/loginChromeCss.test.ts
PASS Backend src/backend/__tests__/loginChromeCssInjection.test.ts
PASS Frontend src/frontend/screens/WebView/__tests__/humbleLoginChromeCss.test.ts
Test Suites: 3 passed, 3 total
Tests:       54 passed, 54 total

$ npx jest src/backend/__tests__/longRunningChannels.test.ts src/backend/__tests__/tauriShellSource.test.ts --no-coverage
PASS Backend src/backend/__tests__/tauriShellSource.test.ts
PASS Backend src/backend/__tests__/longRunningChannels.test.ts
Test Suites: 2 passed, 2 total
Tests:       145 passed, 145 total

$ cargo test --manifest-path src-tauri/Cargo.toml login_chrome_css
running 8 tests
test tests::login_chrome_css_script_binds_no_keyboard_listener ... ok
test tests::login_chrome_css_script_is_scoped_to_humblebundle_by_suffix_not_substring ... ok
test tests::login_chrome_css_script_never_reads_field_value ... ok
test tests::login_chrome_css_script_is_pure_same_output_every_call ... ok
test tests::login_chrome_css_script_never_uses_innerhtml ... ok
test tests::login_chrome_css_script_hides_the_footer_and_navbar_leaving_the_four_protected_selectors_untouched ... ok
test tests::login_chrome_css_script_is_wrapped_in_a_single_top_level_try_catch ... ok
test tests::login_chrome_css_script_top_frame_guard_precedes_the_host_gate_and_the_idempotence_flag ... ok
test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 148 filtered out; finished in 0.00s

$ npx tsc --noEmit
(clean, no output)

$ npx jest meta/__tests__/genI18nGateScope.test.ts --no-coverage
✕ A-17 ANTI-ROT: the committed meta/i18nForkTouchedFiles.json equals the LIVE git derivation (2 ms)
Tests: 1 failed, 1 skipped, 25 passed, 27 total
```

`genI18nGateScope.test.ts` is confirmed at **exactly 1 failure** (A-17, the pre-existing stale `meta/i18nForkTouchedFiles.json` from di1) -- unchanged from before this task, exactly as expected: this task added no new frontend file, only edited existing ones. Not touched, not regenerated.

`prettier --check` initially flagged `src/backend/humble/__tests__/loginChromeCss.test.ts` (whole-file line-wrap reflow after the edit, unrelated to the substantive change); ran `prettier --write` on that one touched file and re-verified `--check` clean, jest still 26/26 green, eslint still clean. Repo-wide `prettier --check` was not run and stays RED by default (not this task's problem).

`eslint` on the four touched source/test files: 0 errors, 0 warnings.

## Gate sweep: zero stale negative simple-navbar assertions

```
$ grep -rn "simple-navbar" --include="*.ts" --include="*.rs" src src-tauri
src/frontend/screens/WebView/components/humbleLoginChromeCss.ts:17: (doc comment, both selectors)
src/backend/humble/__tests__/loginChromeCss.test.ts:18,22,24: (positive toBe/toContain)
src/common/humble/loginChromeCss.ts:18,19,58: (doc comment + the constant itself)
src-tauri/src/main.rs:1692,1755,7356: (doc comment + the literal + positive contains)
```
Every remaining occurrence is either the CSS text itself, a positive assertion, or prose. Zero negative (`forbidden`/`not.toContain`/`!script.contains`) references anywhere in `src/` or `src-tauri/`.

## What did NOT change

`js-view-body` and `js-login-form` stay forbidden in the jest array -- the signup-affordance guarantee is untouched. The colour/theme absence gate, `isHumbleLoginChromeHost`'s entire describe block (including its own RED proof), the top-frame guard, host-gate-before-idempotence-flag ordering, single try/catch, zero-listener contract, and the WR-08 even-quote-per-line discipline are all unmodified and all still pass.

## Live visual verification remains OWED

Every gate here is **structural** -- jest source-text/regex assertions and cargo unit tests over pure string-building functions. No human has looked at the rendered result of this change. di1's owed live check is now larger, not discharged: a human still owes a freshly-built `pnpm tauri:dev` Humble login (footer AND navbar gone, login form still centred and usable, Cmd+V into the password field still works, error `#flash` still renders on a bad password) plus the equivalent Electron `<webview>` check.

## Deviations from Plan

None -- plan executed exactly as written, including the load-bearing two-task split and the verbatim RED-failure capture.

## Self-Check: PASSED

All 5 modified files confirmed present on disk; both task commits (`2c706aaa9` feat, `8fdf52d8c` test) confirmed in `git log`.
