---
phase: 50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv
plan: 02
subsystem: ui
tags: [tauri, rust, objc2, wkwebview, macos, epic-games, cloudflare]

# Dependency graph
requires:
  - phase: 50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv
    provides: "Plan 01's raw WKWebView construction (add_child-free, cold/warm open path, EpicEmbedSurface registry, surface_for_store_key routing)"
provides:
  - "A complete macOS WKNavigationDelegate/WKUIDelegate for the Epic subview: native back/forward/URL reporting off WKWebView's own history, a 45s load-timeout monitor, Cloudflare main-frame challenge detection, popup hand-off through the shared throttle, native JS alert/confirm/prompt, and a blocked-launcher-scheme counter"
  - "Three new optional StoreEmbedNavEvent wire fields (loadTimedOut, challenged, blockedLauncherSchemeCount), each REQUIRED-on-'epic'/FORBIDDEN-otherwise with strict non-coercing validation in coerceNavState"
affects: ["50-03", "50-04", "50-05"]

# Actuals (#2632)
actuals:
  tokens: 19709
  tasks: 3
  commits: 4
  plan_head_before: a6f855d4a14222761659bc6895cb79f7d6e31d17
  plan_head_after: c74f9e5fbacd425dbd3e28c715540be362155de1

tech-stack:
  added: []
  patterns:
    - "navigate_webview_on_main_thread(): a shared mpsc-channel + run_on_main_thread marshalling helper for back/forward/reload/navigate, mirroring open()/set_bounds()/set_hidden()'s established pattern"
    - "EpicEmbedSurface::enqueue_nav_event centralizes ALL flag-merging (loadTimedOut, challenged, blockedLauncherSchemeCount) so every call site carries current state automatically rather than each caller assembling its own JSON"
    - "Pure, AppHandle-free boundary/classifier helpers (epic_embed_load_timed_out, epic_embed_response_is_challenged) tested directly under cargo test, with the ObjC-calling delegate methods kept as thin wrappers around them"
    - "Double-checked-lock monitor thread: a cheap lock-only pre-check snapshots nav_generation, then a main-thread re-validation re-reads elapsed time AND re-compares nav_generation before raising a flag -- a navigation that supersedes a stale timeout is never flagged"

key-files:
  created: []
  modified:
    - src-tauri/src/macos_epic_embed.rs
    - src-tauri/src/main.rs
    - src/backend/store/storeEmbedSeam.ts
    - src/backend/sidecar/storeEmbedFlowRegistration.ts
    - src/backend/sidecar/__tests__/storeEmbedFlows.test.ts
    - src/frontend/screens/WebView/__tests__/epicEmbedSurfaceContract.test.ts

key-decisions:
  - "Task 1: renamed epic_nav_event_json -> nav_state_json and converted the free function enqueue_event(&mut EpicEmbedSurface, Value) into the method EpicEmbedSurface::enqueue_nav_event(&mut self, Value), so it is callable identically on a locked MutexGuard and on a bare struct in a unit test"
  - "Task 1: the two new TS coercion round-trip cases for surface: 'epic' were added to storeEmbedFlows.test.ts rather than the plan-named storeEmbedWireContract.test.ts, because the latter carries a regression-gate census requiring every createRustStoreEmbedSeam() call to be wrapped in fireWithNoRustPeer(...), incompatible with writing a real RPC response frame"
  - "Task 2: centralized the loadTimedOut/challenged/blockedLauncherSchemeCount flag merge inside enqueue_nav_event itself (rather than at each of the ~5 call sites) so a future field only needs one edit"
  - "Task 3: EpicEmbedNavDelegateIvars grew an owned AppHandle field (mirroring EpicPristineNavDelegateIvars's own event_label pattern) so the new WKUIDelegate popup hook can call crate::open_external -- threaded through EpicEmbedNavDelegate::new(mtm, app) and a new, separate app_for_delegate clone in open()'s cold path (app.clone() directly inside the move || closure would move the borrowed &AppHandle parameter itself, not an owned value, and run_on_main_thread requires 'static)"
  - "Task 3: added webview.setUIDelegate(...) alongside the existing setNavigationDelegate(...) call in open()'s cold path -- without it, none of the new WKUIDelegate methods would ever fire"
  - "Task 3: decidePolicyForNavigationResponse reads the response's URL (for the host/path fallback) BEFORE downcasting it to NSHTTPURLResponse, since Retained<T>::downcast(self) consumes the receiver"
  - "Task 3: create_web_view_for_navigation_action has no early return -- define_class!'s method_id expansion only converts the function body's TAIL expression to RetainedReturnValue, so an explicit `return None;` fails to type-check; both the admitted and throttled outcomes fall through to one trailing None"
  - "Task 3: navigation_policy parses the navigation URL exactly once (tauri::Url::parse) and reuses the same Result for both the store_embed_navigation_policy call and the launcher-scheme check, avoiding a redundant second parse"

patterns-established:
  - "Pattern: WKUIDelegate methods that must never create a second native surface return None/no-op unconditionally and route everything through the SAME shared throttle/allow-list the Tauri-managed embed already uses, never a second instance"

requirements-completed: []

coverage:
  - id: D1
    description: "Back, forward, and the current URL report the Epic subview's native WKWebView history (canGoBack/canGoForward/URL read live at nav-event-push time); no Rust-side URL stack"
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell epic_embed -- macos_epic_embed::epic_embed_enqueue_nav_event_tests, macos_epic_embed::epic_embed_take_nav_events_tests"
        status: pass
    human_judgment: false
  - id: D2
    description: "A main-frame navigation neither finished nor failed 45s after didStartProvisionalNavigation sets load_timed_out exactly once; cleared by the next finish; the bound is a named, independently-tested constant"
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell epic_embed -- macos_epic_embed::epic_embed_load_timed_out_tests (just_under_the_bound_is_not_timed_out, exactly_at_the_bound_is_timed_out, just_over_the_bound_is_timed_out)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A main-frame response carrying Cloudflare's cf-mitigated: challenge header (or the host/path fallback when absent) sets challenged and hides the subview; a subframe response never trips it"
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell epic_embed -- macos_epic_embed::epic_embed_response_is_challenged_tests (7 cases: header match, mixed-case header, unrelated header, host/path fallback match and non-match, dot-boundary host rejection)"
        status: pass
    human_judgment: false
  - id: D4
    description: "A page-triggered popup returns no second webview and hands the URL to the OS browser through the shared STORE_EMBED_POPUP_THROTTLE, never a second in-app window or a second throttle instance"
    verification: []
    human_judgment: true
    rationale: "create_web_view_for_navigation_action is a WKUIDelegate method invoked by live WebKit on a real window.open() -- no cargo test can drive this callback outside a running macOS app; requires a live gate against the real Epic store."
  - id: D5
    description: "alert/confirm/prompt from Epic's page present through the already-shipped present_native_js_alert/_confirm/_prompt helpers, modal to the main window"
    verification: []
    human_judgment: true
    rationale: "run_js_alert/run_js_confirm/run_js_prompt are WKUIDelegate methods invoked by live WebKit JS execution and present real NSAlert modals -- requires a live gate, not a unit test."
  - id: D6
    description: "A navigation to the Epic Games Launcher custom scheme is blocked by the existing allow-list and increments a monotonic blocked-scheme counter on the surface's nav state, logged once per attempt"
    verification: []
    human_judgment: true
    rationale: "The scheme-block counter bump lives inside decidePolicyForNavigationAction, a WKNavigationDelegate method invoked by live WebKit navigation -- the underlying allow-list decision (store_embed_navigation_policy) is covered elsewhere, but this plan's own counter-bump wiring has no direct cargo test and needs a live gate to confirm end to end."

duration: ~1h15m (spans multiple session compactions; wall-clock between first and last commit)
completed: 2026-10-12
status: complete
---

# Phase 50 Plan 02: Epic WKWebView Delegate (Navigation, Timeout, Challenge, Popups, Dialogs) Summary

**Completed the Epic subview's native WKNavigationDelegate/WKUIDelegate: native back/forward/URL reporting, a 45s load-timeout monitor, Cloudflare main-frame challenge detection, popup hand-off through the shared throttle, native JS alert/confirm/prompt, and a blocked-launcher-scheme counter — all emitted as strict non-coercing StoreEmbedNavEvent wire state.**

## Performance

- **Duration:** ~1h15m (first commit 2026-10-12T19:32:22+13:00, last 2026-10-12T20:46:54+13:00; spans multiple compactions)
- **Tasks:** 3/3 completed
- **Files modified:** 6 (2 Rust, 4 TypeScript)

## Accomplishments

- Native back/forward/reload/navigate wired through `navigate_webview_on_main_thread()`, reading WKWebView's own `canGoBack()`/`canGoForward()`/`URL()` live — no Rust-side history stack.
- A named `EPIC_EMBED_LOAD_TIMEOUT` (45s) constant with a double-checked-lock monitor thread: a cheap lock-only pre-check, then a main-thread re-validation that re-compares `nav_generation` so a superseding navigation is never flagged stale.
- A pure, directly-tested `epic_embed_response_is_challenged` helper implementing D-09's header-primary/host-path-fallback-only-when-absent rule, wired into `decidePolicyForNavigationResponse` (main-frame only; always allows the response; hides the subview on a positive match).
- `navigate()` and `didStartProvisionalNavigation` both clear `challenged` (D-11: no stickiness across a fresh load).
- A new `WKUIDelegate` implementation: `create_web_view_for_navigation_action` always returns `None` and hands popups to the OS browser through the SAME `STORE_EMBED_POPUP_THROTTLE` the Tauri-managed embed shares (never a second window, never a second throttle instance); `run_js_alert`/`run_js_confirm`/`run_js_prompt` call the already-shipped `present_native_js_alert`/`_confirm`/`_prompt` helpers.
- `navigation_policy` blocks `com.epicgames.launcher://` navigations and bumps a monotonic `blocked_launcher_scheme_count`; every other blocked scheme keeps its existing single log line and cancel, unchanged.
- `StoreEmbedNavEvent`/`coerceNavState` extended with `challenged` and `blockedLauncherSchemeCount`, both REQUIRED-on-`'epic'`/FORBIDDEN-otherwise like `loadTimedOut`, with `blockedLauncherSchemeCount` additionally checked as a non-negative integer.

## Task Commits

Each task was committed atomically:

1. **Task 1: Native back/forward/URL reporting through the Epic surface's nav-event ring** - `6aadeeb98` (test, RED) + `307f8174e` (feat, GREEN)
2. **Task 2: The 45s load timeout, the bounded monitor thread, and the non-opaque background** - `94853ee4d` (feat)
3. **Task 3: Challenge detection, popup hand-off, native JS dialogs, and the blocked launcher scheme** - `c74f9e5fb` (feat)

**Plan metadata:** (pending — this SUMMARY's own commit)

_Note: Task 1 split into a RED test commit and a GREEN implementation commit; Tasks 2 and 3 combined RED+GREEN into a single commit each._

## Files Created/Modified

- `src-tauri/src/macos_epic_embed.rs` - The Epic subview's full `WKNavigationDelegate`/`WKUIDelegate`: native nav reporting, load-timeout monitor, challenge detection, popup hand-off, JS dialogs, blocked-scheme counter
- `src-tauri/src/main.rs` - `#[cfg(target_os = "macos")]` routing guards added to `store_embed_take_nav_events`/`_back`/`_forward`/`_reload`/`_navigate` for `macos_epic_embed::is_selected()`, matching the existing hide/show/close pattern
- `src/backend/store/storeEmbedSeam.ts` - `StoreEmbedNavEvent` gained `loadTimedOut`, `challenged`, `blockedLauncherSchemeCount` optional fields
- `src/backend/sidecar/storeEmbedFlowRegistration.ts` - `coerceNavState` validates all three new fields with the same REQUIRED-on-`'epic'`/FORBIDDEN-otherwise, non-coercing discipline
- `src/backend/sidecar/__tests__/storeEmbedFlows.test.ts` - Epic-surface round-trip fixture updated to carry all three fields; new throw-path tests for each
- `src/frontend/screens/WebView/__tests__/epicEmbedSurfaceContract.test.ts` - Pre-existing (Plan 01) fixture updated to carry the now-required `loadTimedOut`/`challenged`/`blockedLauncherSchemeCount` fields

## Decisions Made

See `key-decisions` in frontmatter above for the full list. Highlights: the `nav_state_json` rename and `enqueue_nav_event` method conversion (Task 1); centralizing all three flag-merges inside `enqueue_nav_event` itself rather than at each call site (Task 2); threading an owned `AppHandle` through `EpicEmbedNavDelegateIvars` for the popup hook, and registering `setUIDelegate` alongside the existing `setNavigationDelegate` (Task 3).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed an unnecessary `/s` (dotAll) regex flag in `epicEmbedSurfaceContract.test.ts`**
- **Found during:** Task 1
- **Issue:** The flag was failing `pnpm codecheck` with TS1501 ("this flag requires es2018+") under plain `tsc --noEmit`. Pre-existing from Plan 01, but blocked this plan's own required codecheck gate.
- **Fix:** Removed the flag — it was a no-op, since the pattern has no `.` metacharacter and `[^}]*` already matches newlines on its own. Verified behaviorally identical: all 5 tests in the file passed unchanged before and after.
- **Files modified:** `src/frontend/screens/WebView/__tests__/epicEmbedSurfaceContract.test.ts`
- **Committed in:** `307f8174e` (Task 1 commit)

**2. [File-choice correction] Placed Task 1's new Epic coercion round-trip tests in `storeEmbedFlows.test.ts` rather than the plan-named `storeEmbedWireContract.test.ts`**
- **Found during:** Task 1
- **Issue:** `storeEmbedWireContract.test.ts` carries a regression-gate source census requiring every `createRustStoreEmbedSeam()` call to be wrapped in `fireWithNoRustPeer(...)`, incompatible with writing a real RPC response frame for a round-trip test.
- **Fix:** Used `storeEmbedFlows.test.ts`'s existing `input.write()`-based round-trip pattern instead, which carries no such census gate.
- **Files modified:** `src/backend/sidecar/__tests__/storeEmbedFlows.test.ts`
- **Committed in:** `307f8174e` (Task 1 commit)

**3. [Rule 1 - Bug] Updated the pre-existing `epicEmbedSurfaceContract.test.ts` "accepts a valid 'epic' surface value" fixture to carry all three now-required Epic-only fields**
- **Found during:** Task 3 (post-commit full jest run)
- **Issue:** This test (predating Phase 50 Plan 01) asserted that `coerceNavState` passes through a `surface: 'epic'` event carrying none of `loadTimedOut`/`challenged`/`blockedLauncherSchemeCount`. Those fields became REQUIRED-on-`'epic'` across Tasks 2 and 3 of this same plan, and the test was never updated — a regression introduced by this plan's own earlier tasks, not caught until the full suite ran after Task 3.
- **Fix:** Added `loadTimedOut: false, challenged: false, blockedLauncherSchemeCount: 0` to both the input fixture and the expected output in both of the test's assertions.
- **Files modified:** `src/frontend/screens/WebView/__tests__/epicEmbedSurfaceContract.test.ts`
- **Verification:** Full jest run confirmed only the 3 known-inherited failures (`genI18nGateScope.test.ts` 1, `lintTranslations.test.ts` 2) remain; a 4th failure seen on one run (`runTsSignals.test.ts` T8) was confirmed flaky — reproduced green in isolation twice.
- **Committed in:** `c74f9e5fb` (Task 3 commit)

**4. [Rule 3 - Blocking] Several compile-time fixes while implementing Task 3's `WKUIDelegate`/`WKNavigationDelegate` additions**
- **Found during:** Task 3 (`cargo check`)
- **Issues and fixes:**
  - `self.ivars()` not found: added `use objc2::DefinedClass;` (the trait providing `ivars()`).
  - `app.clone()` moved the borrowed `&AppHandle` function parameter directly into a `move ||` closure passed to `run_on_main_thread` (which requires `'static`): introduced a separate `app_for_delegate = app.clone()` owned binding before the closure, mirroring the existing `app_for_monitor` pattern.
  - `return None;` inside `create_web_view_for_navigation_action` mismatched `RetainedReturnValue`: `define_class!`'s `method_id` expansion only converts the function body's tail expression, not an explicit early `return`; restructured to a single trailing `None` with an if/else instead.
  - `response` moved by `.downcast::<NSHTTPURLResponse>()` before a later `.URL()` read: reordered to read the URL-derived host/path first, then downcast.
  - Two unnecessary `unsafe` blocks around `absoluteString()`/`valueForHTTPHeaderField()`: both are safe (`pub fn`, not `pub unsafe fn`) in objc2-foundation 0.3.2 — removed the redundant wrapping (verified directly against the vendored crate source, correcting an earlier-session assumption that `absoluteString()` was unsafe).
- **Files modified:** `src-tauri/src/macos_epic_embed.rs`
- **Verification:** `cargo check` and `cargo test --bin gamelib-shell epic_embed` both clean/green after the fixes.
- **Committed in:** `c74f9e5fb` (Task 3 commit)

---

**Total deviations:** 4 auto-fixed (2 Rule 3 blocking, 1 Rule 1 bug, 1 file-choice correction)
**Impact on plan:** All auto-fixes necessary for the plan's own verification gates to pass or for correctness. No scope creep — every fix was either a blocking compile/test error introduced by this plan's own code, or a stale fixture made incorrect by this plan's own earlier tasks.

## Issues Encountered

None beyond the deviations documented above.

## Known Stubs

None. `create_web_view_for_navigation_action`/`run_js_alert`/`_confirm`/`_prompt` all call real, already-shipped helpers (`open_external`, `present_native_js_alert`/`_confirm`/`_prompt`) — no hardcoded empty values or placeholder text.

## Threat Flags

None. Every new surface (challenge detection, popup hand-off, blocked scheme) was named in this plan's own `<threat_model>` and routes through existing, shared allow-list/throttle infrastructure rather than introducing a new one.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The Epic subview now emits every non-happy-path signal (timeout, challenge, blocked scheme) as `StoreEmbedNavEvent` state under strict wire validation — ready for Plans 03-05 to build the renderer chrome (`WebviewUnavailablePanel`'s `'epic-challenged'` reason, the blocked-scheme toast, `StoreEmbedControls`) that reads it.
- D4/D5/D6 (popup hand-off, native JS dialogs, blocked-scheme counter) have no direct automated test — they are `WKUIDelegate`/`WKNavigationDelegate` callbacks only a live WebKit run can invoke. Flagged in `coverage` above as needing a live gate; appropriate for whichever later plan first drives the Epic surface end to end.

---
*Phase: 50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv*
*Completed: 2026-10-12*

## Self-Check: PASSED

- FOUND: `.planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-02-SUMMARY.md`
- FOUND: `6aadeeb98` (git log --oneline --all)
- FOUND: `307f8174e` (git log --oneline --all)
- FOUND: `94853ee4d` (git log --oneline --all)
- FOUND: `c74f9e5fb` (git log --oneline --all)
