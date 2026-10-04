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
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC_ROOT = join(__dirname, '..', '..', 'src')

/**
 * NARROW, NAMED EXEMPTIONS -- and why this is a table rather than a widened regex.
 *
 * The un-anchored sweep above is deliberate and must stay un-anchored (see the
 * header). But it matches TEXT, so it also matches prose that merely NAMES the
 * token while referring to something else entirely. The alternative considered
 * and rejected was stripping `//` comment lines wholesale: that is a blanket
 * widening which would also admit a commented-out call site, and it buys nothing
 * this table does not already buy more precisely.
 *
 * An exemption is keyed on BOTH the file and a substring of the offending line,
 * so it licenses exactly one known match and nothing else -- a real `isTauri`
 * call site added to the SAME exempt file still turns this gate red. `anchors`
 * are re-read from the live file below, so if the comment is ever rewritten the
 * exemption dies loudly rather than silently licensing whatever replaced it.
 * Same construction as `src/backend/__tests__/fakeHomeIsolation.test.ts`.
 */
interface Exemption {
  readonly file: string
  readonly matchSubstring: string
  readonly reason: string
  readonly anchors: readonly string[]
}

const EXEMPTIONS: readonly Exemption[] = [
  {
    file: 'src/frontend/screens/WebView/index.tsx',
    matchSubstring: 'The injected globals (`isTauri`, `__TAURI__`',
    reason:
      'PROSE, not a reference. This names the globals Tauri injects into the ' +
      'REMOTE Epic page, read from inside that page by spike 024 to test -- and ' +
      'refute -- the Talon fingerprinting theory for the store Turnstile gate. ' +
      'It is a different thing that merely shares a name with the predicate ' +
      'Phase 35 Plan 17 deleted; it cannot reach dispatchInvoke(), which is the ' +
      'whole failure mode this gate exists to catch. Rewording it would cost the ' +
      'comment the literal global names the measurement actually observed.',
    anchors: [
      'the gate is a\n  // Cloudflare Turnstile challenge, not a bare 403.',
      'Spike 024 measured why'
    ]
  }
]

describe('D-01/D-00b: isTauri static zero-match completeness gate', () => {
  it('every declared exemption still describes the file it exempts', () => {
    // Without this, an exemption outlives the comment that justified it and
    // becomes a standing hole. Re-reading the anchors is what keeps the `reason`
    // above honest rather than merely historical.
    for (const exemption of EXEMPTIONS) {
      const body = readFileSync(
        join(__dirname, '..', '..', exemption.file),
        'utf8'
      )
      expect(body).toContain(exemption.matchSubstring)
      for (const anchor of exemption.anchors) {
        expect(body).toContain(anchor)
      }
    }
  })

  it('has zero remaining "isTauri" matches anywhere under src/ (.ts and .tsx)', () => {
    const result = spawnSync(
      'grep',
      ['-rn', 'isTauri', SRC_ROOT, '--include=*.ts', '--include=*.tsx'],
      { encoding: 'utf8' }
    )

    // grep's exit contract: 0 = matched, 1 = no match, >=2 = grep itself failed.
    // Status is asserted separately from content because status alone would also be
    // satisfied by grep failing to run at all (e.g. binary not found, status 127
    // truncated on some shells), and empty output alone is satisfied by a mis-typed
    // path that grep silently walks and finds nothing in for the WRONG reason. The
    // vacuity control below proves the invocation reaches a populated tree.
    //
    // With a declared exemption present, "no match" is no longer the passing shape --
    // grep legitimately exits 0. What must be empty is the set of matches left AFTER
    // removing the exempted ones, so the gate still measures absence of every match
    // nobody has justified in writing.
    if (result.status !== 0 && result.status !== 1) {
      throw new Error(
        `grep did not run (status ${result.status}) -- this gate measured nothing.`
      )
    }

    const matches = result.stdout.split('\n').filter((l) => l.trim() !== '')
    const isExempt = (line: string): boolean =>
      EXEMPTIONS.some(
        (e) => line.includes(e.file) && line.includes(e.matchSubstring)
      )
    const offending = matches.filter((line) => !isExempt(line))

    // On failure, name every offending file:line so a future editor sees exactly what
    // to fix, not just a count.
    if (offending.length > 0) {
      throw new Error(
        `isTauri survives in src/ -- expected zero unexempted matches, got:\n${offending.join('\n')}`
      )
    }
    expect(offending).toEqual([])

    // Non-vacuity for the table itself: an exemption whose line no longer matches is
    // dead weight that would quietly license nothing while looking load-bearing.
    for (const exemption of EXEMPTIONS) {
      expect(
        matches.some(
          (line) =>
            line.includes(exemption.file) &&
            line.includes(exemption.matchSubstring)
        )
      ).toBe(true)
    }
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
      [
        '-rn',
        'isWritableStoreField',
        SRC_ROOT,
        '--include=*.ts',
        '--include=*.tsx'
      ],
      { encoding: 'utf8' }
    )

    expect(result.status).toBe(0)
    expect(result.stdout.trim().length).toBeGreaterThan(0)
  })
})
