---
phase: 260929-qth
plan: 01
subsystem: webview
tags: [react, hooks, tauri, store-embed, tdd, security]

requires:
  - phase: 40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we
    provides: "useStoreEmbedHost.ts / index.tsx (the store embed host hook and its caller), 40-REVIEW.md's CR-01/CR-02 findings"
provides:
  - "isRefusedTarget guard on the start-URL sync effect: non-embeddable known stores are hidden, never navigated (CR-01, D-05)"
  - "slotPresent one-way latch + callback ref: the open/bounds effect re-arms exactly once when a late-attaching slot appears, observer identity stable across same-store navigation (CR-02)"
  - "A live-gate todo for the unmeasured GOG->Epic visibility hypothesis named in CONTEXT.md"
affects: [phase-40-store-embed-followups]

actuals:
  tokens: 8184
  tasks: 3
  commits: 3
plan_head_before: e7e813f2a3fa1b72e71966fb79505c245ae0e711

tech-stack:
  added: []
  patterns:
    - "One-way latch (useState flipped false->true exactly once by a stable useCallback ref) to re-arm a mount-once effect exactly once when a DOM node attaches on a later render than the initial mount"

key-files:
  created:
    - .planning/todos/pending/2026-09-29-store-embed-may-stay-visible-over-the-epic-panel.md
  modified:
    - src/frontend/screens/WebView/useStoreEmbedHost.ts
    - src/frontend/screens/WebView/index.tsx
    - src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx
    - .planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-REVIEW.md

key-decisions:
  - "CR-01's embeddability gate is written as `resolvedTarget !== null && !isEmbeddableOrigin(startUrl)`, NOT the literal `!isEmbeddableOrigin(startUrl)` CONTEXT.md's decision text names. Measured: isEmbeddableOrigin('https://github.com/.../wiki') is false because resolveStoreForUrl returns null for that URL (it resolves to no configured store at all) -- the literal bare-negation form would have hidden the wiki route's embed instead of navigating it, deleting a shipped route's function. Narrowed to known-non-embeddable stores only; the decision's D-05 purpose (never background-navigate the embed into Epic) is fully delivered."
  - "CR-01's D-35 re-keying half declined as not-applicable, not deferred: src-tauri/src/main.rs:5066 has one global STORE_EMBED_LABEL for the whole embed, store_embed_open_args (main.rs:5265) carries no storeKey, and storeEmbedFlowRegistration.ts:189's storeKey parameter is discarded before the IPC boundary. There is nothing at that layer to re-key."
  - "Two guards added beyond CONTEXT.md's literal instruction: (1) a not-yet-open skip in the start-URL effect (no storeEmbedHide/navigate before the embed has ever opened, deferring to the CR-02 open effect); (2) a suppression-aware visibility restore (storeEmbedShow only fires on return-to-embeddable when D-19/D-20 suppression is clear, so a hidden embed cannot resurface over a modal)."
  - "CR-02's slot recovery is a one-way latch (slotPresent, useState) driven by a stable (empty-deps useCallback) callback ref, keying the open/bounds effect on [slotPresent] alone -- startUrl is deliberately excluded from that dependency array to preserve the observer identity plan 40-11's live gate protects."
  - "A same-store start-URL change landing after a late open is prevented from re-navigating redundantly by seeding previousUrlRef.current inside flush()'s !openedRef.current branch, ahead of the start-URL effect's own equality check in the same render pass."
  - "The GOG->Epic visibility hypothesis in CONTEXT.md's <specifics> was NOT verified on hardware and is filed as a live-gate todo, not claimed as fixed."

requirements-completed: [CR-40-01, CR-40-02]

duration: ~16min (commit-to-commit span, e7da5239c to 7fefb1481; excludes prior investigation/planning time)
completed: 2026-09-29
status: complete
---

# Quick Task 260929-qth: Fix Phase 40 CR-01/CR-02 in the Store Embed Host Summary

**Gated the store-embed start-URL effect on measured embeddability (narrower than CONTEXT.md's literal predicate, because the literal form breaks the wiki route) and re-armed the open/bounds effect via a one-way slot-presence latch so a late-attaching slot on `/store/epic` -> `/store/gog` no longer strands the embed unopened for the rest of the mount.**

## Performance

- **Commits:** 3 (e7da5239c, ed8147bbb, 7fefb1481), spanning 21:09:09 to 21:24:57 on 2026-09-29
- **Tasks:** 3/3 completed
- **Files modified:** 5 (3 source/test, 2 planning docs)

## Accomplishments

- CR-01: the start-URL sync effect in `useStoreEmbedHost.ts` no longer background-navigates the live native embed into a known-non-embeddable store (Epic) on a `store/:store` param-only route switch. It now calls `storeEmbedHide()` and skips the navigate.
- CR-02: the open/bounds effect re-arms exactly once when the slot div first attaches (via a `slotPresent` one-way latch fed by a stable callback ref), so cold-starting on a route with no first-render slot (Epic/platform/deep-link panels) and then switching to an embeddable store no longer permanently strands the embed unopened.
- `40-REVIEW.md` annotated with the measured D-35 narrowing (embeddability fixed, re-keying declined-not-applicable) and the CR-02 disposition.
- A live-gate todo filed for the one prediction that remains unmeasured: whether the embed stays visible over the Epic unavailable panel after a GOG -> Epic switch.

## Task Commits

Each task was committed atomically:

1. **Task 1: CR-01 embeddability guard, D-35 narrowing, 4 new regression tests (13-16)** - `e7da5239c` (fix)
2. **Task 2: CR-02 slot-presence latch and re-arm, 3 new regression tests (17-19)** - `ed8147bbb` (fix)
3. **Task 3: gate battery, 40-REVIEW.md annotations, unmeasured-visibility todo** - `7fefb1481` (docs)

_No TDD-required multi-commit tasks; each task's tests + implementation landed in one commit._

## Files Created/Modified

- `src/frontend/screens/WebView/useStoreEmbedHost.ts` - CR-01 target guard + D-19/D-20-aware restore on the start-URL effect; CR-02 `slotPresent` param, `previousUrlRef` seed in `flush()`, effect deps `[] -> [slotPresent]`
- `src/frontend/screens/WebView/index.tsx` - `slotPresent` one-way latch (`useState`), stable `slotCallbackRef` (`useCallback`, empty deps) wired to the slot div's `ref`, passed into `useStoreEmbedHost`
- `src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx` - `slotPresent` added to `MountOptions`/`invoke()` (defaulted `true` for tests 1-16); 7 new tests (13-19) pinning both findings
- `.planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-REVIEW.md` - CR-01 and CR-02 annotated with dated resolution notes
- `.planning/todos/pending/2026-09-29-store-embed-may-stay-visible-over-the-epic-panel.md` - new, `ready: live-gate`

## Verification — measured, not claimed

### Red-control counts (all ten, both directions, from actual `npx jest` runs against `useStoreEmbedHost.test.tsx`; 20 tests total on disk throughout)

| # | Test | Mutation | RED (measured) | GREEN after restore (measured) |
|---|------|----------|-----------------|----------------------------------|
| 13 | non-embeddable target hides, no navigate | comment out the `if (isRefusedTarget) {...}` block | `Tests: 3 failed, 17 passed, 20 total` | `Tests: 20 passed, 20 total` |
| 14 | wiki still navigates, never hidden (**orchestrator amendment**: literal `!isEmbeddableOrigin(startUrl)` broadening, dropping `resolvedTarget !== null &&`) | broaden `isRefusedTarget` to the bare negation | `Tests: 1 failed, 19 passed, 20 total` (failure at test-file line 729, the `storeEmbedNavigate` assertion) | `Tests: 20 passed, 20 total` |
| 15 | return-to-embeddable re-shows then navigates | comment out the whole `if (refusedTargetRef.current) {...}` restore block | `Tests: 1 failed, 19 passed, 20 total` (failure at line 762, `storeEmbedShow`) | `Tests: 20 passed, 20 total` |
| 16 | suppressed return does not re-show, still navigates | comment out only the nested `if (!suppressed)` guard | `Tests: 1 failed, 19 passed, 20 total` (failure at line 800, `not.toHaveBeenCalled`) | `Tests: 20 passed, 20 total` |
| 17 | late slot attach opens exactly once | revert effect deps `[slotPresent] -> []` | `Tests: 2 failed, 18 passed, 20 total` (17 and 19 both cascade-fail) | `Tests: 20 passed, 20 total` |
| 18 | same-store URL change leaves observer/listeners unchanged | add `startUrl` to `[slotPresent]` | `Tests: 1 failed, 19 passed, 20 total` (failure at line 882) | `Tests: 20 passed, 20 total` |
| 19 | late open after URL change does not re-navigate redundantly | remove the `previousUrlRef.current = startUrl` seed in `flush()` | `Tests: 1 failed, 19 passed, 20 total` (failure at line 920) | `Tests: 20 passed, 20 total` |

Every mutation was applied by direct string replacement against the committed source, run through `npx jest` (exit code captured from the jest invocation itself, not a pipeline tail), then restored and confirmed byte-identical via `diff` against both a scratchpad backup and `git diff` against HEAD (all exit 0 / no output). After the last restore, `npx tsc --noEmit` and the full Frontend suite were re-run clean.

### Full gate battery (Task 3, all commands run to completion, exit codes captured)

| Gate | Command | Result |
|------|---------|--------|
| Formatter | `npx prettier --check useStoreEmbedHost.ts index.tsx useStoreEmbedHost.test.tsx` | exit 0, "All matched files use Prettier code style!" (`.planning/` paths not included — prettier-ignored there, `--check` would be vacuous) |
| Typecheck | `pnpm codecheck` (`tsc --noEmit` x2) | exit 0, no output |
| Lint | `pnpm lint` | exit 0. `production: PASS \| tests: PASS`. Measured counts: **1107 problems** (0 errors, 1107 warnings) against `SRC_CEILING = 1124` (`meta/lintScoped.cjs:58`, 17 under ceiling, ceiling untouched) and **638 problems** (0 errors, 638 warnings) against `TESTS_CEILING = 638` (`meta/lintScoped.cjs:59`, exactly at the pinned ceiling, zero headroom, ceiling untouched). Neither ceiling was raised. |
| Full Frontend suite | `npx jest --selectProjects Frontend` | `Test Suites: 179 passed, 179 total` / `Tests: 3073 passed, 3073 total` |
| Dead code | `pnpm find-deadcode` | `unreachable: 46 OK \| used-in-module: 0 OK`; confirmed by direct grep of the tool's own output that neither `isEmbeddableOrigin` nor `resolveStoreForUrl` appears in any finding |
| Planning gates | `pnpm planning-gates` | `12/12 planning gates passed.`, including `.planning/todos/todo-frontmatter-gate.py` against the new todo |
| Todo frontmatter key order | `python3` one-liner from the plan's own `<verify>` block | `keys ['created', 'title', 'area', 'severity', 'platform', 'ready', 'files']` / `OK` |

## Decisions Made

**The wiki-predicate deviation from CONTEXT.md's locked decision text (D-35 sub-section) is real and is recorded here as a deviation, not glossed over.** CONTEXT.md's `<decisions>` says: "Gate the effect on `isEmbeddableOrigin(startUrl)`." Implemented as `resolvedTarget !== null && !isEmbeddableOrigin(startUrl)` instead. Measured evidence for the narrowing (`node --experimental-strip-types` against the real `storeEmbedOrigins.ts` module, run live during this task):

```
{"url":"https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/wiki","resolvedKey":null,"embeddable":null,"isEmbeddableOrigin":false}
{"url":"https://www.epicgames.com/store/en-US/","resolvedKey":"epic","embeddable":false,"isEmbeddableOrigin":false}
{"url":"https://af.gog.com?as=1838482841","resolvedKey":"gog","embeddable":true,"isEmbeddableOrigin":true}
{"url":"https://store.steampowered.com/","resolvedKey":"steam","embeddable":true,"isEmbeddableOrigin":true}
{"url":"https://gaming.amazon.com","resolvedKey":"amazon","embeddable":true,"isEmbeddableOrigin":true}
```

`isEmbeddableOrigin` of the wiki's github URL is `false` — same truth value as Epic's — because `resolveStoreForUrl` returns `null` for it (it isn't a configured store at all). The literal bare-negation predicate is therefore `true` for the wiki too, and would call `storeEmbedHide()` on every wiki navigation, deleting that shipped route's function. The narrowing (`resolvedTarget !== null && ...`) restricts the guard to KNOWN, non-embeddable stores (Epic today) and leaves everything with no configured store (the wiki) untouched. This was flagged by the orchestrator as a binding amendment before Task 1: test 14's red-control mutation is mandated to be exactly the literal broadening, and that mutation was applied and measured red (`Tests: 1 failed, 19 passed, 20 total`, wiki's `storeEmbedNavigate` assertion failing) per the table above. The decision's underlying purpose — never let the live embed background-navigate into a store D-05 excludes — is fully delivered by the narrowed form; the narrowing exists only to avoid regressing a shipped, unrelated route.

**The two extra CR-01 guards, and why each is required (beyond CONTEXT.md's literal instruction):**

1. **Not-yet-open skip.** Before the embed has ever been opened (`!openedRef.current`), the start-URL effect now returns before issuing any `storeEmbedHide`/`storeEmbedNavigate` call. Required because CR-02's fix (Task 2) makes the open effect reachable only once the slot attaches, which can now happen on a *later* render than the start-URL effect's own execution — without this skip, a start-URL change arriving before the slot ever attaches would call `storeEmbedNavigate` (or `storeEmbedHide`) against an embed IPC surface that was never opened.
2. **Suppression-aware visibility restore.** Returning from a refused (non-embeddable) target to an embeddable one only calls `storeEmbedShow()` when D-19/D-20 suppression is currently clear (`if (!suppressed)`). Required because the ordinary suppression effect elsewhere in the hook owns the release-triggered show; without this guard a hidden-then-restored embed could resurface over an active suppression modal, which D-19/D-20 forbid.

**D-35 re-keying, declined as not-applicable, not deferred** — see `40-REVIEW.md`'s CR-01 annotation and the `key-decisions` frontmatter above for the full citation trail (`src-tauri/src/main.rs:5066`, `store_embed_open_args` at `:5265`, `storeEmbedFlowRegistration.ts:189`).

**The GOG -> Epic visibility hypothesis was NOT verified.** CONTEXT.md's `<specifics>` section named a prediction, inferred from the code path and never run on macOS hardware: that the embed might stay visible over the Epic unavailable panel after a switch, because nothing previously called `storeEmbedHide()` on that path. This task's CR-01 fix would resolve it if the hypothesis is real (a non-embeddable target now hides instead of navigates), but that is still inference from source, not a live measurement — no jest harness in this repo renders real native webview compositing. Filed as `.planning/todos/pending/2026-09-29-store-embed-may-stay-visible-over-the-epic-panel.md`, `ready: live-gate`, naming the exact macOS check (cold-start `/store/gog`, switch to `/store/epic`, look for native content over the panel).

**Attribution note (honesty, not required by the plan's output spec, recorded because it is true):** Task 1's commit (`e7da5239c`) carries `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`, per the attribution instruction in force when that task was executed. A session-level system reminder subsequently superseded that instruction; Tasks 2 and 3's commits (`ed8147bbb`, `7fefb1481`) carry `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` instead. Both attributions are accurate to the instruction in force at the time of each commit; the inconsistency is disclosed here rather than silently left for a reader to notice.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - blocking issue] `WebViewDeepLinkAndRestore.test.ts` broke with `ReferenceError: useState is not defined` after the first Task 2 edit**
- **Found during:** Task 2, full Frontend suite run after the first implementation pass
- **Issue:** That test file extracts the RAW source text of `index.tsx` between the `isStorePageDeepLink` and `isStoreRoute` markers and compiles/executes it standalone via `new Function(...)` with an explicit, limited parameter list (`pathname, search, store, startUrl, resolveStoreForUrl, useRef` — no `useState`/`useCallback`). The first draft placed the new `slotPresent`/`slotCallbackRef` `useState`/`useCallback` declarations inside that extracted marker range.
- **Fix:** Moved the `useState`/`useCallback` block to sit after the `isStoreRoute` declaration (outside the extraction range), with an in-source comment explaining the marker mechanism so a future editor does not reintroduce the same break.
- **Files modified:** `src/frontend/screens/WebView/index.tsx`
- **Verification:** `npx tsc --noEmit` (0 errors), full `WebView/` test directory (32 tests, all passing), then full Frontend suite (179 suites / 3073 tests, all passing)
- **Committed in:** `ed8147bbb` (part of Task 2's commit)

**2. [Rule 1 - self-caught bug] The slot div's `ref` prop was never switched from `slotRef` to `slotCallbackRef`**
- **Found during:** Task 2, self-review grep after believing the implementation was complete (not caught by any test — the mock-hook jest harness never renders JSX)
- **Issue:** The `slotPresent` latch and callback ref plumbing were wired into the hook call correctly, but the slot `<div>` still had `ref={slotRef}` — meaning `slotPresent` would never flip `true` in a real render and the entire CR-02 fix would be inert in production.
- **Fix:** Changed `<div className="WebView__embedSlot" ref={slotRef}>` to `ref={slotCallbackRef}`.
- **Files modified:** `src/frontend/screens/WebView/index.tsx`
- **Verification:** `npx tsc --noEmit` (0 errors), full Frontend suite (179 suites / 3073 tests, all passing)
- **Committed in:** `ed8147bbb` (part of Task 2's commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 3, 1 Rule 1).
**Impact on plan:** Both were necessary for correctness — the first for a pre-existing test harness's structural gate, the second for the fix to actually function outside the test harness. No scope creep; nothing beyond what CR-01/CR-02 and the plan's own two extra guards required.

## Issues Encountered

None beyond the two auto-fixed deviations above.

## User Setup Required

None — no external service configuration required.

## Known Stubs

None. No hardcoded empty values, placeholder text, or unwired data sources were introduced.

## Threat Flags

None. This task's surface (a start-URL gating condition and an effect re-arm trigger) was already covered by `260929-qth-PLAN.md`'s `<threat_model>` (T-QTH-01 through T-QTH-05, T-QTH-SC) and introduces no new network endpoint, auth path, file access pattern, or schema change.

## Next Phase Readiness

CR-01 and CR-02 are closed against `40-REVIEW.md`. One open item remains, tracked as a todo rather than blocking this task: the unverified GOG -> Epic visibility hypothesis (`ready: live-gate`), which needs a live macOS check, not more code, to resolve.

---
*Phase: 260929-qth*
*Completed: 2026-09-29*

## Self-Check: PASSED

- FOUND: `src/frontend/screens/WebView/useStoreEmbedHost.ts`
- FOUND: `src/frontend/screens/WebView/index.tsx`
- FOUND: `src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx`
- FOUND: `.planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-REVIEW.md`
- FOUND: `.planning/todos/pending/2026-09-29-store-embed-may-stay-visible-over-the-epic-panel.md`
- FOUND commit `e7da5239c` in `git log --oneline --all`
- FOUND commit `ed8147bbb` in `git log --oneline --all`
- FOUND commit `7fefb1481` in `git log --oneline --all`
