/**
 * Static zero-match completeness gate for the `isTauri` removal (Phase 35 Plan 17,
 * D-01/D-00b, REQ-35-19).
 *
 * WHY THIS GATE IS LOAD-BEARING, AND WHY A RUNTIME CHECK WOULD NOT BE:
 * `isTauri()` used to be threaded through 28 files and 140 references across
 * `src/preload/`, `src/frontend/`, `src/backend/sidecar/` and `src/common/` (measured
 * at HEAD `9870cf05c`, un-anchored form). A PARTIAL removal fails SILENTLY, exactly the
 * way Phase 34.18's `isIntelMac` removal did: a leftover call site that still imports
 * the (now-deleted) symbol fails to compile -- loud, and caught by `pnpm codecheck` --
 * but a leftover call site that survives only because ITS OWN import line survived
 * unnoticed reaches `dispatchInvoke()`, gets the `UNPORTED_CHANNEL_MARKER` rejection,
 * and `bootErrorSurface.ts`'s global `unhandledrejection` handler downgrades it to a
 * `console.warn`. The app boots looking healthy. Absence of a runtime error proves
 * nothing about completeness -- only a static, whole-tree textual sweep can.
 *
 * WHY THE UN-ANCHORED FORM:
 * `grep "isTauri("` (anchored to the call parenthesis) undercounts by 39 references --
 * it misses every destructured (`const { isTauri } = ...`) and prop-name (passed as a
 * bare identifier, or referenced only in a type position) usage. A gate written with
 * the anchored form would be permanently satisfiable while a third of the references
 * to the deleted symbol still existed in the tree. This gate deliberately uses the
 * un-anchored form for the same reason plan 35-17's own removal work did.
 *
 * HEAD BASELINE THIS WAS RED-PROVEN AGAINST (2026-08-29, before this plan's removal):
 * `grep -rln "isTauri" src --include="*.ts" --include="*.tsx" | wc -l` -> 28 files
 * `grep -rno "isTauri" src --include="*.ts" --include="*.tsx" | wc -l` -> 140 references
 * Recorded in the plan 17 SUMMARY alongside this file's own RED run and the per-form
 * tally of every collapsed site.
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const SRC_ROOT = join(__dirname, '..', '..', 'src')

describe('D-01/D-00b: isTauri static zero-match completeness gate', () => {
  it('has zero remaining "isTauri" matches anywhere under src/ (.ts and .tsx)', () => {
    const result = spawnSync(
      'grep',
      ['-rn', 'isTauri', SRC_ROOT, '--include=*.ts', '--include=*.tsx'],
      { encoding: 'utf8' }
    )

    // grep's own "no matches found" contract is exit status 1 with empty stdout.
    // Assert BOTH independently: status alone would also be satisfied by grep failing
    // to run at all (e.g. binary not found, status 127 truncated on some shells), and
    // empty stdout alone is satisfied by a mis-typed path that grep silently walks and
    // finds nothing in for the WRONG reason. Only the conjunction proves the intended
    // thing: grep ran, walked the real src/ tree, and found none. On failure, the
    // message names every offending file:line so a future editor sees exactly what to
    // fix, not just a count.
    if (result.status !== 1 || result.stdout.trim() !== '') {
      throw new Error(
        `isTauri survives in src/ -- expected zero matches, got:\n${result.stdout}`
      )
    }
    expect(result.status).toBe(1)
    expect(result.stdout.trim()).toBe('')
  })

  it('vacuity control: "isWritableStoreField" (a token that MUST survive) is still found under the same src/ root', () => {
    // Without this control, a broken SRC_ROOT path (typo, wrong join depth, CI
    // working-directory drift) would make grep walk an empty or nonexistent directory
    // and report "no matches" for EVERY token, including isTauri -- a permanently
    // green gate that has stopped measuring anything. This proves the grep invocation
    // reaches a populated tree, so the isTauri zero-match result above means "absent",
    // not "looked nowhere". `isWritableStoreField` is chosen because it lives in the
    // same file (`src/preload/tauriTransport.ts`) the deleted predicate used to.
    const result = spawnSync(
      'grep',
      ['-rn', 'isWritableStoreField', SRC_ROOT, '--include=*.ts', '--include=*.tsx'],
      { encoding: 'utf8' }
    )

    expect(result.status).toBe(0)
    expect(result.stdout.trim().length).toBeGreaterThan(0)
  })
})
