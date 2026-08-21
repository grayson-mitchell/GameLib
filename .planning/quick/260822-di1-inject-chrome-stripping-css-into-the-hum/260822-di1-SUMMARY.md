---
phase: quick-260822-di1
plan: 01
subsystem: ui
tags: [tauri, electron, webview, css, humble, login]

requires: []
provides:
  - "Humble login-chrome CSS: single source of truth (src/common/humble/loginChromeCss.ts)"
  - "Tauri login_chrome_css_script() injection, ungated, in humble_login_open's if-visible block"
  - "Electron attachHumbleLoginChromeCss dom-ready -> insertCSS wiring in HumbleLoginSurface.tsx"
affects: [humble-login, webview-login-chrome]

tech-stack:
  added: []
  patterns:
    - "Shared CSS/host-predicate constant in common/, drift-pinned against a Rust concat! literal via a byte-equality jest gate"

key-files:
  created:
    - src/common/humble/loginChromeCss.ts
    - src/backend/humble/__tests__/loginChromeCss.test.ts
    - src/backend/__tests__/loginChromeCssInjection.test.ts
    - src/frontend/screens/WebView/components/humbleLoginChromeCss.ts
    - src/frontend/screens/WebView/__tests__/humbleLoginChromeCss.test.ts
  modified:
    - src-tauri/src/main.rs
    - src/frontend/screens/WebView/components/HumbleLoginSurface.tsx

key-decisions:
  - "D-1: the CSS is exactly one rule (footer.site-footer { display: none !important; }); the optional wrapper-padding tighten was declined as an unverifiable guess with layout-shift risk"
  - "D-2: the Tauri injection is deliberately NOT #[cfg(target_os = \"macos\")]-gated, unlike its two neighbours -- the footer is noise on every platform, not just macOS sheets"
  - "D-3: the hostname gate runs BEFORE the idempotence flag on both sides, so a non-Humble document is left with zero trace"
  - "D-5: a byte-equality drift pin (loginChromeCssInjection.test.ts) keeps the Rust literal and the TS constant honest"

requirements-completed: [QT-260822-di1-01, QT-260822-di1-02, QT-260822-di1-03]

duration: ~70min
completed: 2026-08-21
---

# Quick Task 260822-di1: Inject chrome-stripping CSS into the Humble login surfaces Summary

**Hides Humble's marketing footer (`footer.site-footer`) on both login surfaces via a single shared CSS constant — an ungated Rust `initialization_script` on the Tauri side and a `dom-ready -> insertCSS` Electron wiring — with a byte-equality drift pin keeping the two in sync.**

## The CSS that shipped

```css
footer.site-footer { display: none !important; }
```

Exactly one rule (D-1). The optional `.base-main-wrapper` / `.inner-main-wrapper` spacing tighten from the originating task brief was **declined**: there is no measured baseline for those wrappers' current padding, so any `!important` override would be an unverifiable guess, and it is exactly the class of change that could shift the React-rendered login form's layout unpredictably. Hiding the footer alone already achieves the de-clutter goal; a second rule is a one-line append to `HUMBLE_LOGIN_CHROME_CSS` later, with the drift pin already in place.

## D-2: the Tauri injection is deliberately NOT macOS-gated

`login_cancel_strip_script` and `login_origin_banner_script` (its two neighbours in `main.rs`) are both `#[cfg(target_os = "macos")]` because they substitute for macOS *sheet* chrome — a sheet renders no title bar and no close button. `login_chrome_css_script` substitutes for nothing platform-specific: the marketing footer is visual noise on the login page on Windows and Linux too, so it is injected unconditionally inside `humble_login_open`'s `if visible` block, on every platform. This is verified structurally (`loginChromeCssInjection.test.ts`'s D-2 gate), not just asserted in a comment.

## No live visual observation

Every gate in this task is structural (jest source-text/regex assertions + cargo unit tests over pure string-building functions). **No human has looked at the rendered result yet.** A human still owes:

1. `pnpm tauri:dev` (a freshly built one — `tauri dev` serves a stale bundle, per this repo's own recorded gotcha) — confirm the footer is gone on the Tauri login child window, on whichever platform is available, and that nothing else on the page shifted.
2. The Electron `<webview>` humble login surface — confirm the footer is gone there too, that `#flash`, the navbar, the form, and any cookie-consent UI are untouched, and that Cmd+V into the password field still works.

## Performance

- **Duration:** ~70 min
- **Tasks:** 3/3 completed
- **Files modified:** 7 (2 modified, 5 created)

## Task Commits

1. **Task 1: Single source of truth — the CSS constant and the hostname suffix predicate** - `64f06cdc6` (feat)
2. **Task 2: Tauri side — login_chrome_css_script(), its ungated injection, and the drift pin** - `de0c7c1a7` (feat)
3. **Task 3: Electron side — dom-ready -> insertCSS, re-applied per navigation** - `dfceb5454` (feat)

_Note: a concurrent session's commits (`7d1d4f738`, `175458920`) landed interleaved with these three — confirmed via `git log` that no file from this task's commits overlaps with that session's `src/backend/storeManagers/steam/library.ts` / `library.test.ts` changes._

## Files Created/Modified

- `src/common/humble/loginChromeCss.ts` — `HUMBLE_LOGIN_CHROME_CSS`, `HUMBLE_LOGIN_CHROME_HOST`, `HUMBLE_LOGIN_CHROME_HOST_SUFFIX`, `isHumbleLoginChromeHost`, `humbleLoginChromeCssForUrl` — the single source of truth both consumers read/drift-pin against.
- `src/backend/humble/__tests__/loginChromeCss.test.ts` — unit tests for the above, including a RED-direction proof that a naive substring predicate WOULD match the `humblebundle.com.evil.example` look-alike host.
- `src-tauri/src/main.rs` — adds `fn login_chrome_css_script()` (immediately after `login_origin_banner_update_script`), its ungated call site in `humble_login_open`'s `if visible` block, and 8 `#[cfg(test)]` cargo tests.
- `src/backend/__tests__/loginChromeCssInjection.test.ts` — jest structural gates: exactly-once definition/call-site, the D-2 ungated-cfg proof, the byte-equality drift pin against `HUMBLE_LOGIN_CHROME_CSS`, a WR-08 even-quote-count guard, and a cargo-test survival pin — all three RED-direction requirements proven against synthetic bad input driving the same extractor code path (not a reimplementation).
- `src/frontend/screens/WebView/components/humbleLoginChromeCss.ts` — `attachHumbleLoginChromeCss(webview)`: `dom-ready -> insertCSS`, re-applied on every navigation (Electron drops inserted CSS on navigation, so idempotence here would be a bug).
- `src/frontend/screens/WebView/components/HumbleLoginSurface.tsx` — a second `useLayoutEffect` mirroring the existing D-17 navigation-relay effect's shape, delegating to the helper. The D-17 effect itself is unchanged.
- `src/frontend/screens/WebView/__tests__/humbleLoginChromeCss.test.ts` — behavioural tests against a hand-rolled fake webview (no jsdom) plus a source-text gate on `HumbleLoginSurface.tsx`'s wiring.

## Verification (actual output)

### The three new/changed test files
```
pnpm exec jest src/backend/humble/__tests__/loginChromeCss.test.ts src/backend/__tests__/loginChromeCssInjection.test.ts src/frontend/screens/WebView/__tests__/humbleLoginChromeCss.test.ts --no-coverage

PASS Backend src/backend/humble/__tests__/loginChromeCss.test.ts
PASS Frontend src/frontend/screens/WebView/__tests__/humbleLoginChromeCss.test.ts
PASS Backend src/backend/__tests__/loginChromeCssInjection.test.ts

Test Suites: 3 passed, 3 total
Tests:       53 passed, 53 total
```

### WR-08 guard
```
npx jest src/backend/__tests__/longRunningChannels.test.ts --no-coverage

Test Suites: 1 passed, 1 total
Tests:       40 passed, 40 total
```

### Existing main.rs structural gates
```
npx jest src/backend/__tests__/tauriShellSource.test.ts --no-coverage

Test Suites: 1 passed, 1 total
Tests:       105 passed, 105 total
```

### cargo test (Rust toolchain WAS available)
```
cd src-tauri && cargo test login_chrome_css 2>&1 | tail -20

running 8 tests
test tests::login_chrome_css_script_binds_no_keyboard_listener ... ok
test tests::login_chrome_css_script_is_pure_same_output_every_call ... ok
test tests::login_chrome_css_script_hides_the_marketing_footer_and_nothing_else ... ok
test tests::login_chrome_css_script_is_scoped_to_humblebundle_by_suffix_not_substring ... ok
test tests::login_chrome_css_script_never_reads_field_value ... ok
test tests::login_chrome_css_script_is_wrapped_in_a_single_top_level_try_catch ... ok
test tests::login_chrome_css_script_top_frame_guard_precedes_the_host_gate_and_the_idempotence_flag ... ok
test tests::login_chrome_css_script_never_uses_innerhtml ... ok

test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 148 filtered out
```

Also re-ran the two neighbouring cargo test blocks (`login_cancel_strip`, `login_origin_banner`) — 12/12 and 13/13 passed, no regression. `cargo build` finished with zero warnings (this repo's zero-warnings bar holds).

### RED-direction proofs (repo trap #1: must drive the SAME extractor code path, not a reimplementation)

Both required RED proofs are real tests in `loginChromeCssInjection.test.ts`, run against the same `productionCode()`/`extractBracedBlock()`/`extractHumbleLoginOpenArmBody()` helpers the real assertions use:

- **D-2 gate:** two synthetic sources — one with the CSS call nested *inside* the still-open macOS `#[cfg(...)]` block (fails the "closes the block" half: no `}` appears between the two calls), one with the CSS call wrapped in its *own* new `#[cfg(...)]` block (fails the "opens no new cfg" half: `#[cfg(` appears in the slice). Both observed failing the real assertion's condition when run through the identical extractor.
- **Drift pin:** a synthetic `fn login_chrome_css_script` body carrying a different CSS literal (`footer.wrong-selector { display: none; }`) extracted via the same `/style\.textContent = '([^']*)';/` regex and confirmed `not.toBe(HUMBLE_LOGIN_CHROME_CSS)`.

Also: `isHumbleLoginChromeHost`'s own RED proof (Task 1) — a naive `indexOf`-based predicate is shown to incorrectly return `true` for `humblebundle.com.evil.example`, proving the real predicate's `false` on that input is not vacuous.

### Codecheck / lint
```
pnpm codecheck   # tsc --noEmit — clean
pnpm exec eslint -f json <7 changed files> | filtered on severity === 2   # 0 errors
pnpm exec prettier --write <touched files only>   # no sweep; HumbleLoginSurface.tsx and humbleLoginChromeCss.ts were already formatted
```

### Full jest suite (for regression visibility only — not part of this task's required gate list)
```
pnpm exec jest --no-coverage

Test Suites: 1 failed, 309 passed, 310 total
Tests:       1 failed, 3 skipped, 6390 passed, 6394 total
```

The one failure (`meta/__tests__/genI18nGateScope.test.ts`'s `A-17 ANTI-ROT` test) is a **known artifact-staleness class**, not a defect in this task's code: adding a new file under `src/frontend/` (`humbleLoginChromeCss.ts`) makes the committed `meta/i18nForkTouchedFiles.json` snapshot stale relative to a live git diff against the upstream merge-base. Regenerating that snapshot is out of this plan's `files_modified` scope and risks racing the concurrent session's own file additions. See `deferred-items.md` in this directory for the full writeup and recommended follow-up (`pnpm gen-i18n-scope:rewrite` in a dedicated commit once concurrent work has landed).

## Deviations from Plan

None in code. One process deviation: `meta/i18nForkTouchedFiles.json` staleness (see above and `deferred-items.md`) was discovered during the full-suite regression check and deliberately NOT fixed inline — out of this plan's declared file scope, and unsafe to fix while a concurrent session is landing its own new files.

## Known Stubs

None.

## Threat Flags

None — this task's threat model (T-di1-01..06) is fully covered by the implementation; no new network endpoints, auth paths, or trust-boundary changes were introduced beyond what the plan's threat register already names.

## Self-Check: PASSED

- `src/common/humble/loginChromeCss.ts` — FOUND
- `src/backend/humble/__tests__/loginChromeCss.test.ts` — FOUND
- `src/backend/__tests__/loginChromeCssInjection.test.ts` — FOUND
- `src/frontend/screens/WebView/components/humbleLoginChromeCss.ts` — FOUND
- `src/frontend/screens/WebView/__tests__/humbleLoginChromeCss.test.ts` — FOUND
- Commit `64f06cdc6` — FOUND (git log)
- Commit `de0c7c1a7` — FOUND (git log)
- Commit `dfceb5454` — FOUND (git log)
