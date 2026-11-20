---
phase: 260929-qth
verified: 2026-09-29T00:00:00Z
status: passed
score: 6/6 must-haves verified
covered_files: [".planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-REVIEW.md", ".planning/quick/260929-qth-fix-phase-40-cr-01-cr-02-in-the-store-em/260929-qth-CONTEXT.md", ".planning/quick/260929-qth-fix-phase-40-cr-01-cr-02-in-the-store-em/260929-qth-PLAN.md", ".planning/quick/260929-qth-fix-phase-40-cr-01-cr-02-in-the-store-em/260929-qth-SUMMARY.md", ".planning/todos/pending/2026-09-29-store-embed-may-stay-visible-over-the-epic-panel.md", "src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx", "src/frontend/screens/WebView/index.tsx", "src/frontend/screens/WebView/useStoreEmbedHost.ts"]
covered_digest: "v1:sha256:95fbc3a393f4da1e9de25e379392db5dd487600d24e1653c32c1e02def3b56ba"
behavior_unverified: 0
overrides_applied: 0
---

# Quick Task 260929-qth: Fix Phase 40 CR-01/CR-02 in the Store Embed Host — Verification Report

**Task Goal:** Fix phase 40 CR-01/CR-02 in the store embed host: gate start-URL navigation on
embeddability and store identity, and recover from a null slot on first render.
**Verified:** 2026-09-29
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from PLAN frontmatter `must_haves.truths`)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A start-URL change to a KNOWN-but-NOT-embeddable store origin (Epic, D-05) calls `storeEmbedHide()` and issues no `storeEmbedNavigate` | ✓ VERIFIED | `useStoreEmbedHost.ts:374-384` (`isRefusedTarget` guard). Test 13 (`useStoreEmbedHost.test.tsx:684-703`) asserts this directly; suite green (20/20). Independently re-run — see spot-checks below. |
| 2 | A start-URL change to the `/wiki` route's github.com URL still navigates the embed and is not hidden | ✓ VERIFIED | `useStoreEmbedHost.ts:374-376` narrows the guard to `resolvedTarget !== null && !isEmbeddableOrigin(startUrl)` rather than the CONTEXT.md-literal bare negation, specifically to keep this true. Test 14 (`:711-733`). Orchestrator's amended red control (broadening to the literal predicate) was independently re-run and produced `1 failed, 19 passed, 20 total` with the wiki assertion failing, confirming the narrowing is load-bearing, not decorative. |
| 3 | Returning from a non-embeddable target to an embeddable one re-shows the embed, but never while suppression is active (D-19/D-20) | ✓ VERIFIED | `useStoreEmbedHost.ts:390-402` (`refusedTargetRef` clear + `if (!suppressed)` gate). Tests 15 (`:738-766`, re-show + navigate) and 16 (`:771-804`, suppressed → no show, still navigates) both read and green. |
| 4 | A slot that first appears on a LATER render (cold start on `/store/epic`, then `/store/gog`) opens the embed exactly once, with the URL current at that moment | ✓ VERIFIED | `index.tsx`'s one-way `slotPresent` latch + `useStoreEmbedHost.ts:342`'s `[slotPresent]`-keyed effect. Test 17 (`:818-851`) mounts with `slotPresent:false`/null slotRef, then reinvokes with a real slot, `slotPresent:true`, and a different `startUrl` (gog) — asserts `storeEmbedOpen` called exactly once with the gog URL. Green. |
| 5 | A same-store start-URL change creates no second ResizeObserver and re-registers no window listeners | ✓ VERIFIED | Test 18 (`:860-889`). Independently re-verified by this verifier: mutated the deps array from `[slotPresent]` to `[slotPresent, startUrl]`, re-ran — measured `Tests: 1 failed, 19 passed, 20 total` (test 18 failing at the instance-count assertion), matching the SUMMARY's claimed red-control count exactly. Reverted; file confirmed byte-identical via `git diff` (no output); re-ran green (20/20). |
| 6 | An open that lands after a start-URL change is not followed by a redundant `storeEmbedNavigate` to the URL just opened | ✓ VERIFIED | Test 19 (`:897-921`) exercises exactly this scenario (mount on Epic with no slot, reinvoke with gog URL + slot present) and asserts `storeEmbedOpen` called once, `storeEmbedNavigate` never called. Independently re-verified by this verifier: removed the `previousUrlRef.current = startUrl` seed line in `flush()`'s open branch, re-ran — measured `Tests: 1 failed, 19 passed, 20 total` (test 19 failing on the `not.toHaveBeenCalled()` assertion at line 920), matching the SUMMARY's claimed count exactly. Reverted; confirmed byte-identical; re-ran green (20/20). Traced the mechanism by hand: the bounds effect (declared before the start-URL effect) runs first in the same commit and seeds `previousUrlRef` synchronously in this mock harness before the start-URL effect's equality check runs; independently, even under a real-browser async `ResizeObserver` ordering, the start-URL effect's separate `!openedRef.current` early-return (`:388`) covers the case where it runs first — both paths are covered, not just the one the mock harness exercises. |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/frontend/screens/WebView/useStoreEmbedHost.ts` | CR-01 target guard + CR-02 slot-presence re-arm | ✓ VERIFIED | Both guards present, wired, and exercised by tests 13-19. |
| `src/frontend/screens/WebView/index.tsx` | Callback ref + one-way `slotPresent` latch | ✓ VERIFIED | `slotCallbackRef` (`:289-294`) wired to the slot div's `ref` (`:524`, confirmed by grep — not still `ref={slotRef}`, which was a self-caught bug during execution per the SUMMARY's Deviation #2, now fixed). |
| `src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx` | 7 new regression tests (13-19) | ✓ VERIFIED | All present, all green, two independently red-controlled by this verifier (see truths 5 and 6 above). |
| `.planning/todos/pending/2026-09-29-store-embed-may-stay-visible-over-the-epic-panel.md` | Live-gate todo for the unmeasured visibility hypothesis | ✓ VERIFIED | Exists, correctly framed as an unverified hypothesis (not a claimed fix), correct triage frontmatter order (`created, title, area, severity, platform, ready, files`), `severity: minor`/`platform: macos`/`ready: live-gate` all bare-lowercase. Confirmed by `pnpm planning-gates` (12/12, including the todo-frontmatter gate). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `index.tsx` callback ref | `useStoreEmbedHost({ slotPresent })` | `setSlotPresent(true)` on the callback ref → passed into the hook call | ✓ WIRED | Already verified by the orchestrator (one-way latch, zero `setSlotPresent(false)` occurrences, stable `useCallback([])`). Re-confirmed by direct read of `index.tsx:283-301`. |
| `useStoreEmbedHost` | `storeEmbedOrigins.ts` (`resolveStoreForUrl` + `isEmbeddableOrigin`) | Import at `useStoreEmbedHost.ts:5`, called at `:374-376` | ✓ WIRED | First production call site of `isEmbeddableOrigin` — confirmed by `pnpm find-deadcode` (`unreachable: 46 OK \| used-in-module: 0 OK`, no finding naming either symbol). |
| `flush()` open branch | start-URL effect's equality check | `previousUrlRef.current = startUrl` seed at `useStoreEmbedHost.ts:250`, consumed at `:360` | ✓ WIRED | Confirmed by direct red-control mutation (removed the seed line, test 19 failed as predicted, restored, green). |

### Anti-Patterns Found

None. Grepped all three modified `src/` files for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` — zero matches.

### Structural Regression Gates (Step 7 focus items)

| Gate | Result |
|------|--------|
| `storeEmbedSingleOpener.test.ts` (asserts `useStoreEmbedHost.ts` is the sole open-channel caller) | PASS — re-run directly, part of a 5-suite/50-test green batch alongside `WebViewDeepLinkAndRestore`, `WebViewAdtractionGapDeclared`, `WebViewAmazonLoginDataSpawn`, `WebViewOAuthNavigation`. |
| `WebviewUnavailablePanel.test.tsx` (anchors on the FIRST literal occurrence of `isLoginPathname(pathname)`, after `stripSourceComments`) | PASS — re-run directly (28/28). Confirmed the gate strips comments before searching, so the two comment-only mentions of the literal string at `index.tsx:251,254` (added by this task) do not shadow the real occurrence at `:439`. |
| D-18 single geometry oracle (`slot.getBoundingClientRect()` is the sole bounds input, no fallback rect) | PASS — grepped `useStoreEmbedHost.ts` for `getBoundingClientRect\|innerWidth\|innerHeight`: exactly one call site (`:240`), no fallback. |
| D-21 (`storeEmbedClose()` reserved for app teardown, never on route change) | PASS — grepped for `storeEmbedClose`: single call site, inside the `tearingDownRef.current` branch of the unmount cleanup (`:451`). |

### Behavioral Spot-Checks (independently re-run by this verifier, not just re-stated from SUMMARY)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `useStoreEmbedHost` suite green at baseline | `npx jest --selectProjects Frontend --testPathPattern 'useStoreEmbedHost'` | `Tests: 20 passed, 20 total` | ✓ PASS |
| Test 18 red control (add `startUrl` to deps array) | mutate + re-run | `Tests: 1 failed, 19 passed, 20 total` (test 18) | ✓ PASS — matches SUMMARY's claimed count |
| Test 18 restored | `git diff --stat` shows no diff; re-run | `Tests: 20 passed, 20 total` | ✓ PASS |
| Test 19 red control (remove `previousUrlRef` seed in `flush()`) | mutate + re-run | `Tests: 1 failed, 19 passed, 20 total` (test 19, line 920) | ✓ PASS — matches SUMMARY's claimed count |
| Test 19 restored | `git diff --stat` shows no diff; re-run | `Tests: 20 passed, 20 total` | ✓ PASS |
| `tsc --noEmit` after final restore | `npx tsc --noEmit` | 0 errors | ✓ PASS |
| Full Frontend suite | `npx jest --selectProjects Frontend` | `Test Suites: 179 passed, 179 total` / `Tests: 3073 passed, 3073 total` | ✓ PASS — matches SUMMARY exactly |
| Dead code | `pnpm find-deadcode` | `unreachable: 46 OK \| used-in-module: 0 OK` | ✓ PASS — matches SUMMARY exactly |
| Planning gates | `pnpm planning-gates` | `12/12 planning gates passed.` | ✓ PASS — matches SUMMARY exactly |
| Prettier (three source paths) | `npx prettier --check ...` | `All matched files use Prettier code style!` | ✓ PASS |

Note: `pnpm lint` (ceiling check) and `pnpm codecheck` were already independently re-run and confirmed by the orchestrator per the pre-verified list; not re-run a second time here to avoid a redundant full-suite pass.

### Requirements Coverage

| Requirement | Source | Description | Status | Evidence |
|-------------|--------|-------------|--------|----------|
| CR-40-01 | PLAN frontmatter `requirements` | Gate start-URL navigation on embeddability/store identity (CR-01) | ✓ SATISFIED | Truths 1-3, 5-6 above. |
| CR-40-02 | PLAN frontmatter `requirements` | Recover from a null slot on first render (CR-02) | ✓ SATISFIED | Truth 4 above. |

Both requirement IDs are quick-task-local (`260929-qth-PLAN.md` frontmatter), not tracked in
`.planning/REQUIREMENTS.md` — this is a quick task, not a planned phase, so REQUIREMENTS.md
cross-referencing (Step 6b) does not apply; no orphaned requirements exist for this task.

### Honesty Audit of SUMMARY.md

- **The GOG→Epic visibility hypothesis is correctly framed as unverified.** Both `260929-qth-SUMMARY.md`
  ("Decisions Made" section, final bullet) and the filed todo explicitly state this was never run on
  macOS hardware and is not claimed as fixed. No sentence in the SUMMARY asserts the visual defect
  was observed or resolved.
- **The narrowed-predicate deviation from CONTEXT.md's literal wording is recorded, not glossed.**
  SUMMARY's "Decisions Made" section quotes the measured `node --experimental-strip-types` output
  showing `isEmbeddableOrigin` is `false` for both Epic and the wiki, and explains why the literal
  form would have broken the wiki route. This verifier independently confirmed the mechanism (test 14's
  red control was already re-run by the orchestrator per the pre-verified list: `1 failed, 19 passed,
  20 total`).
  A minor discrepancy noted for the record, not a blocker: the SUMMARY table (row 14) shows the
  RED count for this test as `1 failed, 19 passed, 20 total` under the label "RED (measured)" but the
  row's own text also calls this "orchestrator amendment" — correctly distinguishing it from the other
  nine counts, which the executor measured directly. This is transparent, not an overclaim.
- **No sentence found asserting an un-run gate as green.** Every gate result in the SUMMARY's Task 3
  table was independently re-run by either the orchestrator (per the pre-verified list) or this
  verifier and matched exactly.
- **The two extra guards beyond CONTEXT.md's literal instruction are disclosed with rationale**, not
  silently added — matches the actual code (the not-yet-open skip at `:386-388`, the suppression-aware
  restore at `:390-402`).

### Human Verification Required

None. All six must-haves are either directly testable via the jest harness (and were), or — for the
one item that cannot be (native webview compositing over the panel, the GOG→Epic visibility
hypothesis) — the task correctly declines to claim it as verified and instead files a `ready:
live-gate` todo, which is itself the honest disposition rather than a gap in this task's own
deliverable. There is no PLAN must-have asserting the visibility hypothesis is fixed, so there is
nothing outstanding to route to human verification for this task's own goal.

### Gaps Summary

None. All six must-have truths verified with direct evidence (existing tests re-run green, two of
the seven new tests independently red/green mutated by this verifier and matching the SUMMARY's
claimed counts exactly, structural regression gates re-run and green, full Frontend suite and
planning-gates re-run and matching SUMMARY's claimed counts exactly). The task's own explicit
non-claim (the visibility hypothesis) is correctly filed as a todo rather than glossed over or
falsely claimed fixed.

---

_Verified: 2026-09-29_
_Verifier: Claude (gsd-verifier)_
