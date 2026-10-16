---
phase: 40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we
plan: 01
subsystem: ui
tags: [react, typescript, tauri, jest, i18n, testing]
requires:
  - phase: 34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi
provides:
  - "Model A (renderer-owned Electron <webview>) fully removed from src/frontend/ render paths"
  - "Predicate-derived Model A census, reproducible against the live tree"
  - "Disposition precedent (RE-POINT/RE-DERIVE/INVERT/RETIRE) for test pins invalidated by a deletion"
affects: [40-02, 40-03, WebView, HumbleLoginSurface]
tech-stack:
  added: []
  patterns:
    - "Predicate-derived census (literal-token grep against live tree) instead of trusting a stale ROADMAP list"
    - "Brace-depth structural gate: proves a deleted guard cannot reappear under ANY new name, not just its old name"
    - "Surgical hand-edit of a generator-owned artifact (meta/i18nForkTouchedFiles.json), generatedAt held constant, verified against a real regeneration run rather than trusted blind"
key-files:
  created:
    - .planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-MODEL-A-CENSUS.md
  modified:
    - src/frontend/screens/WebView/index.tsx
    - src/frontend/screens/WebView/components/HumbleLoginSurface.tsx
    - src/frontend/screens/WebView/components/__tests__/WebviewUnavailablePanel.test.tsx
    - src/frontend/screens/WebView/__tests__/humbleLoginChromeCss.test.ts
    - src/frontend/screens/WebView/__tests__/WebViewAmazonLoginDataSpawn.test.ts
    - meta/i18nForkTouchedFiles.json
    - meta/__tests__/genI18nGateScope.test.ts
key-decisions:
  - "Census taken by predicate grep against the live tree, not the ROADMAP's list — falsified the ROADMAP's Sidebar/index.tsx:92,103 line (file does not exist, retired by Phase 34.10's NavShell)"
  - "meta/i18nForkTouchedFiles.json hand-edited surgically (generatedAt frozen) rather than regenerated in place, per repo precedent that a live gen-i18n-gate-scope run here cascades into unrelated pin breakage"
  - "WebviewUnavailablePanel.test.tsx Group 3 gate rewritten to a brace-depth structural check so a reintroduced guard is caught even under a brand-new name, not just its old literal string"
  - "WebViewAmazonLoginDataSpawn.test.ts kept functionally unchanged (RE-POINT) after measuring its markers still hold against the rewritten index.tsx — a verdict comment was still added per the every-pin-gets-a-verdict rule"
requirements-completed: [REQ-40-10]
metrics:
  duration: 3h10m
  completed: 2026-09-04
---

# Phase 40 Plan 01: Retire Model A Summary

**Deleted every renderer-owned `<webview>` render site (WebView/index.tsx, HumbleLoginSurface.tsx, WebviewControls, humbleLoginChromeCss.ts) and dispositioned all three invalidated test files plus the i18n fork-touched artifact with labelled RE-POINT/INVERT/RETIRE verdicts, none silently deleted.**

## Performance

- **Duration:** ~3h10m
- **Started:** 2026-09-04T04:22:35Z (approx, from first commit timestamp)
- **Completed:** 2026-09-04
- **Tasks:** 3/3
- **Files modified:** 9 (2 deleted whole, 5 edited, 1 hand-edited generated artifact, 1 census doc created)

## Accomplishments

- Census Model A by four literal-token predicates (`<webview`, `WebviewTag`, `DidFailLoadEvent`, `webviewPreloadPath`/`getWebviewPreloadPath`) against the live tree, falsifying the ROADMAP's stale `Sidebar/index.tsx:92,103` reference (file does not exist — replaced by Phase 34.10's NavShell).
- Deleted the live `<webview>` render and its supporting state/effects from `WebView/index.tsx` and `HumbleLoginSurface.tsx`; deleted `humbleLoginChromeCss.ts` and the `WebviewControls` component directory outright.
- Every test/meta pin invalidated by the deletion carries a labelled verdict (RE-POINT, INVERT, RETIRE) with the measurement or synthetic-source proof recorded in the file itself, per D-35-14-02 — none silently deleted or weakened.
- Mutation-proved the INVERTed `WebviewUnavailablePanel.test.tsx` gate against the real `index.tsx` source, confirming it fails when a guard is reintroduced under a brand-new name.

## Task Commits

Each task committed atomically:

1. **Task 1: Census Model A by predicate against the live tree** - `bf7731647` (docs)
2. **Task 2: Delete the three Model A render sites and WebviewControls component** - `157409206` (refactor)
3. **Task 3: Disposition every invalidated test/meta pin with a labelled verdict** - `b7513ee48` (test)

**Plan metadata:** (this commit, see final_commit below)

## Files Created/Modified

- `.planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-MODEL-A-CENSUS.md` - Predicate-derived census, four tables (one per predicate), bucket legend, reproducing command
- `src/frontend/screens/WebView/index.tsx` - Deleted the `<webview>` render, `WebviewTag`/`DidFailLoadEvent` usage, `webviewPreloadPath` state/effect/guard; store/wiki arm now reached unconditionally via `WebviewUnavailablePanel`
- `src/frontend/screens/WebView/components/HumbleLoginSurface.tsx` - Rewritten to render `TauriLoginPanel` unconditionally; deleted its own `<webview>` render, `webviewPreloadPath`/UA fetch state, D-17 navigation relay, CSS-attach effect
- `src/frontend/screens/WebView/components/humbleLoginChromeCss.ts` - Deleted (only consumer was the deleted `<webview>`)
- `src/frontend/components/UI/WebviewControls/index.tsx`, `index.css` - Deleted, directory removed
- `src/frontend/screens/WebView/components/__tests__/WebviewUnavailablePanel.test.tsx` - INVERT: Group 3 gate rewritten to a brace-depth structural check, mutation-proved against the real source
- `src/frontend/screens/WebView/__tests__/humbleLoginChromeCss.test.ts` - RETIRE: behavioural suite for the deleted helper removed; replaced with a structural regression gate on `HumbleLoginSurface.tsx`
- `src/frontend/screens/WebView/__tests__/WebViewAmazonLoginDataSpawn.test.ts` - RE-POINT: verdict comment added, no functional change (markers unaffected by this plan's deletions)
- `meta/i18nForkTouchedFiles.json` - 210 → 208 entries (removed the 2 deleted files), `generatedAt` held constant
- `meta/__tests__/genI18nGateScope.test.ts` - 8 hardcoded `210` count pins updated to `208`; `DECLARED_UNSCANNED_DEBT` array updated

## Census: Predicate Counts Before/After

Measured via `git grep -n <pattern> <ref> -- src/` at the pre-Task-2 commit (`bf7731647`) vs. the live tree after Task 3's commit (`b7513ee48`). Each predicate matches both code and prose (comments/doc strings), so counts are not purely a "live sites deleted" tally — deleting code sites also **added** explanatory retirement comments that themselves match the same literal token, which is why `<webview` rose rather than fell:

| Predicate | Before (`bf7731647`) | After (`b7513ee48`) | Note |
|---|---|---|---|
| `<webview` | 19 | 23 | Rose: 4 live render/effect sites deleted, but ~8 new retirement-rationale comments were added across `index.tsx`, `HumbleLoginSurface.tsx`, and the 3 dispositioned test files, each naming `<webview>` in prose to explain what was removed and why |
| `WebviewTag` | 24 | 21 | Fell by 3: the 2 live `useRef<WebviewTag>` sites and the `WebviewControls` prop type were deleted; the shim declaration itself (`src/backend/platform/types.ts`) and its D-12 pin (`types.usage.test.ts`) are untouched (owned by plan `40-03`), and the new `humbleLoginChromeCss.test.ts` gate names `WebviewTag` once in a `not.toContain` assertion, offsetting some of the drop |
| `DidFailLoadEvent` | 14 | 12 | Fell by 2: the one live `onerror` destructure in `index.tsx` was deleted along with its import; the shim and its D-12 pin are untouched (owned by plan `40-03`) |
| `webviewPreloadPath` / `getWebviewPreloadPath` | 32 | 20 | Fell by 12: both frontend state/fetch/guard sites (index.tsx, HumbleLoginSurface.tsx) deleted in full; the backend declared-empty IPC handler, its channel type, its preload invoker, and its own test (`appShellFlows.test.ts`) are all untouched — that is D-12's fact, not Model A itself, and stays live |

**Interpretation:** a raw predicate count is not a reliable "is Model A gone" signal on its own — it must be read against the bucket classification (LIVE RENDER vs. TYPE SHIM vs. BACKEND DECLARED-EMPTY RETURN vs. COMMENT-ONLY) recorded in `40-MODEL-A-CENSUS.md`. The determinative truths are the `must_haves` in the plan frontmatter, confirmed directly: zero `<webview` JSX elements render anywhere under `src/frontend/` (confirmed by reading every remaining `<webview` hit above — all are prose), the `!webviewPreloadPath` guard string no longer exists in either file (confirmed: `index.tsx`/`HumbleLoginSurface.tsx` hits above are all comments naming the guard historically, not the guard itself), and `WebviewControls/` no longer exists as a directory.

## Mutation-Proof for the INVERTed Gate (`WebviewUnavailablePanel.test.tsx`)

To prove the rewritten `hasTwoDistinctArms()` brace-depth check genuinely defends against a guard reappearing under any name (not just its literal old string), the real `src/frontend/screens/WebView/index.tsx` was temporarily mutated and restored:

1. Backed up the real file to `/tmp/index.tsx.bak`.
2. Wrapped the span from the `isLoginPathname(pathname)` arm through the final `return <WebviewUnavailablePanel url={startUrl} />` (not including the function's own closing brace) in a freshly-named guard, reproducing this shape:
   ```ts
   if (someMutationGuard()) {
     if (isLoginPathname(pathname)) {
       return <TauriLoginPanel runner={runner} state={oauthLoginState} />
     }

     window.api.logInfo(...)
     return <WebviewUnavailablePanel url={startUrl} />
   }
   ```
3. Ran `pnpm exec jest src/frontend/screens/WebView/components/__tests__/WebviewUnavailablePanel.test.tsx -t "the real source has two distinct arms"` against the mutated file.
4. **Result: the gate correctly failed** — `Expected: true`, `Received: false` — because `braceDepthBefore(functionBody, loginArmStart)` measured `2`, not the required `1`, once the synthetic `someMutationGuard()` wrapper reintroduced an enclosing brace.
5. Restored the original file via `cp /tmp/index.tsx.bak src/frontend/screens/WebView/index.tsx`; `diff` confirmed byte-for-byte identical to the pre-mutation, Task-2-committed state.
6. Re-ran the full `WebviewUnavailablePanel.test.tsx` suite: 13/13 green.

## i18n Gate Exit Codes (Pre/Post Task 3)

| Command | Pre-edit (210-entry state) | Post-edit (208-entry state) |
|---|---|---|
| `pnpm lint-translations` | exit 0 | exit 0 (re-confirmed after final commit) |
| `pnpm gen-i18n-gate-scope` | exit 0 (auto-writes `meta/i18nForkTouchedFiles.json`; content matched the surgical 208-entry edit except `generatedAt`) | exit 0 (re-run after the commit as a positive control: reproduced the identical 208-file content, confirming the hand-edit matches what regeneration would produce; the fresh-timestamp diff was then discarded and the frozen-`generatedAt` version restored, matching this repo's `260901-w9e`/`260902-qs4`/`260903-w73` precedent) |
| `meta/__tests__/genI18nGateScope.test.ts` (jest) | 5 failing (8 hardcoded `210` pins + 2 stale `DECLARED_UNSCANNED_DEBT` entries) | 26 passed, 1 skipped |

## Model A Sites Found by the Census That This Plan Did NOT Delete

| Site | Reason not deleted here | Owning plan |
|---|---|---|
| `src/backend/platform/types.ts` (`WebviewTag`/`DidFailLoadEvent` shim, its "Consumed by" doc comment) | D-09/D-12: the shim's reason to exist dies with this plan's deletions, but removing the shim itself is explicitly deferred | `40-03` |
| `src/backend/platform/index.ts:1127-1128` (barrel re-export of both types) | Same as above | `40-03` |
| `src/backend/platform/__tests__/types.usage.test.ts` (D-12's pin, 10+ line references) | Same as above | `40-03` |
| `src/backend/constants/paths.ts:121` (`webviewPreloadPath` constant, distinct from the frontend state var of the same name; builds a `file://…/webviewPreload.js` path) | Confirmed zero importers anywhere in `src/` — already dead code, orphaned by an earlier phase; never named by this plan's `files_modified` or D-09's frontend-scoped census | Not yet owned — flagged for a future cleanup pass |
| `humbleLoginNavigated` IPC channel (backend registration, distinct from the now-deleted renderer call site) | D-11: a native Humble login path may still need to drive the same cookie-revalidation behaviour from Rust; only the renderer-side call site was in this plan's scope | `40-03` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Kept orphaned-but-plan-protected state alive via a documented `void`-marker block in `WebView/index.tsx`**
- **Found during:** Task 2
- **Issue:** Deleting the `<webview>` render and its JSX readers left several pieces of state (`showLoginWarningFor`/effect, `showAdtractionWarning`/`dontShowAdtractionWarning`, `handleSuccessfulLogin`, `onLoginWarningClosed`) with no remaining JSX consumer, which `@typescript-eslint/no-unused-vars: 'error'` (a hard lint error in this repo, per `eslint.config.mjs`) would flag — but the plan's `must_haves`/`files_modified` did not authorize deleting this state itself, only the render sites.
- **Fix:** Kept the state/effects intact and added a documented `void`-marker block referencing each identifier, with a comment explaining why they are deliberately retained pending a later plan's disposition.
- **Files modified:** `src/frontend/screens/WebView/index.tsx`
- **Verification:** `pnpm codecheck` (tsc --noEmit) and `pnpm lint` both exit 0, no new warnings
- **Committed in:** `157409206` (Task 2 commit)

**2. [Rule 3 - Blocking] Edited `meta/__tests__/genI18nGateScope.test.ts` even though it was not in the plan's `files_modified` frontmatter**
- **Found during:** Task 3
- **Issue:** Removing 2 entries from `meta/i18nForkTouchedFiles.json` (210 → 208) broke 8 hardcoded `210` count assertions and 2 stale `DECLARED_UNSCANNED_DEBT` entries in this test file — a hard test failure blocking Task 3's completion.
- **Fix:** Task 3's own action text explicitly authorized this: "if `meta/__tests__/genI18nGateScope.test.ts` goes red, fix the pin, do not regenerate blindly with `--rewrite-scope`." Updated the 8 count pins and the `DECLARED_UNSCANNED_DEBT` array, added a dated docstring entry recording the RE-DERIVE rationale and the exact 210→208 delta.
- **Files modified:** `meta/__tests__/genI18nGateScope.test.ts`
- **Verification:** `pnpm exec jest meta/__tests__/genI18nGateScope.test.ts` → 26 passed, 1 skipped
- **Committed in:** `b7513ee48` (Task 3 commit)

None of these deviations changed architecture — both are within Rules 1-3 (auto-fix blocking issues / add missing critical functionality) and were explicitly anticipated or authorized by the plan's own task text.

## Known Stubs

None. No hardcoded empty render values, placeholder text, or unwired mock data were introduced by this plan — every deletion either removed a dead render path outright or left the store/wiki arm rendering `WebviewUnavailablePanel` (the existing, functioning fallback component), unchanged from before this plan.

## Threat Flags

None. This plan is a pure deletion of a renderer-owned `<webview>` embed and its supporting IPC-adjacent state; it does not introduce any new network endpoint, auth path, file access pattern, or schema change at a trust boundary. The IPC channel (`getWebviewPreloadPath`) whose declared-empty return made the deletion provably safe is itself untouched.

## Issues Encountered

Self-corrected during execution, no user intervention required: an incidental `pnpm gen-i18n-gate-scope` re-run mid-session, followed by a `git checkout -- meta/i18nForkTouchedFiles.json` intended only to discard its fresh timestamp, instead reverted the entire file back to the original 210-entry committed state (undoing the surgical 2-entry removal). Detected immediately via a `grep -c` re-check, re-applied the same surgical `sed` removal, and re-verified via `python3 -c "json.load(...)"` that the file matched the intended 208-entry / frozen-`generatedAt` state before proceeding. No commit was made with the reverted content.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The store/wiki `<webview>` render is fully retired; `40-02` and `40-03` build the Tauri child-webview embed (Model B) against a codebase with zero Model A render sites remaining under `src/frontend/`.
- `40-03` inherits three explicitly-flagged, unowned-by-this-plan items: the `WebviewTag`/`DidFailLoadEvent` type shim and its barrel re-export/test pin (owned per D-12), and the `humbleLoginNavigated` channel-level re-census (D-11).
- The orphaned `webviewPreloadPath` constant in `src/backend/constants/paths.ts:121` (zero importers, unrelated to the frontend state of the same name) remains unowned — flagged here for whichever future plan does general dead-code sweeps.
- No blockers for `40-02`/`40-03`.

---

*Phase: 40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we*
*Completed: 2026-09-04*

## Self-Check: PASSED

- FOUND: `.planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-01-SUMMARY.md`
- FOUND: `.planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-MODEL-A-CENSUS.md`
- CONFIRMED DELETED: `src/frontend/components/UI/WebviewControls/`
- CONFIRMED DELETED: `src/frontend/screens/WebView/components/humbleLoginChromeCss.ts`
- FOUND commit: `bf7731647` (Task 1)
- FOUND commit: `157409206` (Task 2)
- FOUND commit: `b7513ee48` (Task 3)
- FOUND commit: `b36139233` (SUMMARY.md commit)
