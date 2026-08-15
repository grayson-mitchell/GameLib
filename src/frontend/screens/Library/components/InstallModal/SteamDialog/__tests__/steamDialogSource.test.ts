import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

/**
 * Phase 34.13, Plan 10, Task 3 -- comment-stripped source gates locking
 * every negative decision `SteamDialog/index.tsx` encodes, each proven
 * against an executable known-bad specimen (below) so a passing gate is
 * evidence, not decoration.
 *
 * This file NEVER imports `../index` -- doing so would pull the shared UI
 * kit's transitive stylesheet imports into this project's jsdom-less Node
 * jest environment and fail before a single assertion runs
 * (`34.13-VALIDATION.md`). It reads the dialog as raw text instead.
 *
 * Stripping is mandatory and load-bearing here specifically: `index.tsx`'s
 * own header comment legitimately NAMES `getInstallInfo`, `writeConfig`,
 * `listSteamLibraryTargets`-shaped fetches and `--status-danger` while
 * explaining why each is forbidden or permitted -- an UNSTRIPPED gate would
 * fail on the dialog's own explanation of its own decisions (the
 * self-invalidating-header defect class this repo has already ledgered
 * against `steamSectionGating.ts`).
 *
 * TWO absence gates the retired D-12 model would have wanted here are
 * DELIBERATELY NOT present, and this is a locked decision, not an
 * oversight:
 *
 *  - `disabled` is NOT asserted absent. The retired truth was "the footer
 *    Install button carries no `disabled` attribute in any render state,"
 *    justified by the busy spinner living on the origin control. D-25
 *    INVERTS that: the dialog's own Install button IS disabled while
 *    eligibility pends, and 34.13-11 (wave 7) wires
 *    `disabled={eligibilityPending}` into this very file. A blanket
 *    absence gate here would make that locked, later decision fail CI.
 *    D-06's actual substance -- never gated on SIZE -- is what the
 *    "forbidden mechanisms" block gates instead.
 *  - `--status-danger` is NOT asserted absent. The retired rule reserved
 *    that shade for `WineSelector`'s `isKnownNotToWork` advisory alone.
 *    D-24 now ALSO claims it for the degrade notice (a genuine local
 *    failure, not a fact-stating aside). The gate below is a bounded,
 *    POSITIVE one instead: exactly one occurrence, located inside the
 *    `steamDegrade`-gated block.
 */

const DIALOG_PATH = join(__dirname, '..', 'index.tsx')

function readDialogStripped(): string {
  return stripSourceComments(readFileSync(DIALOG_PATH, 'utf8'))
}

// --- Shared, throwing assertion helpers -----------------------------------
//
// Plain functions (no jest matcher calls inside) so the SAME helper drives
// both the real gate (called directly -- a throw fails the enclosing test
// naturally) and the known-bad-specimen non-vacuity proofs below (wrapped
// in `expect(() => ...).toThrow()` / `.not.toThrow()`).

function expectAbsent(source: string, token: string, decisionNote: string) {
  if (source.includes(token)) {
    throw new Error(
      `expectAbsent: forbidden token "${token}" found in stripped source (${decisionNote})`
    )
  }
}

function expectPresent(source: string, token: string, decisionNote: string) {
  if (!source.includes(token)) {
    throw new Error(
      `expectPresent: required token "${token}" is missing from stripped source (${decisionNote})`
    )
  }
}

function assertOrderingPersistBeforeInstall(stripped: string) {
  const persistIndex = stripped.indexOf('persistBottleWineVersion')
  const installIndex = stripped.indexOf('installSteamGame(')
  if (persistIndex === -1 || installIndex === -1) {
    throw new Error(
      'assertOrderingPersistBeforeInstall: a required token is missing'
    )
  }
  if (!(persistIndex < installIndex)) {
    throw new Error(
      'assertOrderingPersistBeforeInstall: persistBottleWineVersion does not precede installSteamGame('
    )
  }
}

function assertForceWindowsViaBottlePrefixed(stripped: string) {
  const matches = stripped.match(/.{7}forceWindowsViaBottle/g) ?? []
  if (matches.length === 0) {
    throw new Error(
      'assertForceWindowsViaBottlePrefixed: forceWindowsViaBottle not found'
    )
  }
  for (const match of matches) {
    if (!match.endsWith('gating.forceWindowsViaBottle')) {
      throw new Error(
        `assertForceWindowsViaBottlePrefixed: an occurrence is not prefixed by "gating.": "${match}"`
      )
    }
  }
}

/**
 * D-25's `disabled` contract as a THROWING helper (34.13 review WR-09), so
 * the identical code path can be driven against known-bad specimens and
 * observed to fail. An assertion inlined into an `it` block can never be
 * proven RED -- which is exactly how the old "non-vacuity" spec below ended
 * up asserting that `String.prototype.split` works.
 *
 * Two independent obligations, both load-bearing:
 *  1. exactly ONE `disabled=` term (a second one is almost certainly a
 *     re-introduced SIZE gate, which D-06 forbids), and
 *  2. that term is `disabled={eligibilityPending}` specifically -- a pure
 *     count check is satisfied by `disabled={notEnoughDiskSpace}`, the very
 *     thing D-06 bans.
 */
function assertSingleEligibilityDisabledTerm(source: string) {
  const n = source.split('disabled=').length - 1
  if (n !== 1) {
    throw new Error(
      `assertSingleEligibilityDisabledTerm: expected exactly 1 disabled= term, found ${n}`
    )
  }
  // WIDENED by 34.13 review WR-13: the single term is now
  // `disabled={eligibilityPending || submitting}` -- `submitting` is a
  // submit-in-flight latch (a double-click used to fire `installSteamGame`
  // twice for the same appId across the `persistBottleWineVersion` await),
  // NOT a size gate. The assertion still pins `eligibilityPending` as
  // required, and the SIZE-token bans below are what actually enforce D-06.
  if (!source.includes('disabled={eligibilityPending')) {
    throw new Error(
      'assertSingleEligibilityDisabledTerm: the single disabled= term does not lead with eligibilityPending (D-06: never gated on SIZE)'
    )
  }
  for (const sizeToken of [
    'diskSize',
    'spaceLeftAfter',
    'notEnoughDiskSpace'
  ]) {
    if (source.includes(`disabled={${sizeToken}`)) {
      throw new Error(
        `assertSingleEligibilityDisabledTerm: the disabled= term references the SIZE token "${sizeToken}" (D-06)`
      )
    }
  }
}

/**
 * 34.13 review B-CR-01, as a THROWING helper so the identical code path can
 * be driven against known-bad inputs DERIVED FROM THE REAL SOURCE (never a
 * hand-written replica, which drifts silently).
 *
 * WR-13 added `setSubmitting(true)` with an explicit comment arguing the
 * latch never needs releasing "because the component unmounts". That is only
 * true on the success path: the handler's first `await` is an IPC round trip
 * that rejects on a dead channel, and on rejection `backdropClick()` never
 * runs, the component does NOT unmount, and the Install button is dead
 * forever with nothing surfaced. Two independent obligations:
 *
 *  1. the persist round trip carries a rejection handler, and
 *  2. `setSubmitting(false)` exists at all -- a latch with no release is a
 *     wedge.
 */
function assertSubmitLatchCanBeReleased(stripped: string) {
  const persistIndex = stripped.indexOf('persistBottleWineVersion(')
  if (persistIndex === -1) {
    throw new Error(
      'assertSubmitLatchCanBeReleased: persistBottleWineVersion( is missing'
    )
  }
  // The `.catch` must be attached to THIS call, not merely present somewhere
  // else in the file (effect B has one of its own).
  const windowAfterPersist = stripped.slice(persistIndex, persistIndex + 200)
  if (!windowAfterPersist.includes('.catch(')) {
    throw new Error(
      'assertSubmitLatchCanBeReleased: the persistBottleWineVersion round trip has no rejection handler -- a rejected persist skips installSteamGame and wedges the latch'
    )
  }
  if (!stripped.includes('setSubmitting(false)')) {
    throw new Error(
      'assertSubmitLatchCanBeReleased: setSubmitting(false) appears nowhere -- the submit latch has no release path at all'
    )
  }
  if (!stripped.includes('setSubmitting(true)')) {
    throw new Error(
      'assertSubmitLatchCanBeReleased: setSubmitting(true) is missing -- the WR-13 double-click guard was removed'
    )
  }
}

function assertBoundedStatusDanger(stripped: string) {
  const occurrences = stripped.split('var(--status-danger)').length - 1
  if (occurrences !== 1) {
    throw new Error(
      `assertBoundedStatusDanger: expected exactly 1 occurrence of var(--status-danger), found ${occurrences}`
    )
  }
  const degradeIndex = stripped.indexOf('steamDegrade')
  const dangerIndex = stripped.indexOf('var(--status-danger)')
  const sharedBottleIndex = stripped.indexOf(
    'gamelib:steam.install.sharedBottleNotice'
  )
  const inBounds =
    degradeIndex > -1 &&
    dangerIndex > degradeIndex &&
    dangerIndex < sharedBottleIndex
  if (!inBounds) {
    throw new Error(
      'assertBoundedStatusDanger: the occurrence is not located inside the steamDegrade-gated block'
    )
  }
}

// ---------------------------------------------------------------------
// Block 1 -- forbidden mechanisms
// ---------------------------------------------------------------------

describe('forbidden mechanisms (D-01/D-06/D-07/D-08/D-14, the zero-stylesheet decision)', () => {
  const stripped = readDialogStripped()

  it('never calls getInstallInfo -- the size-info stub can never hang this modal (D-06/D-07)', () => {
    expectAbsent(stripped, 'getInstallInfo', 'D-06/D-07')
  })

  it('never calls writeConfig -- a bottle-eligible Steam game ignores per-game config (D-14)', () => {
    expectAbsent(stripped, 'writeConfig', 'D-14')
  })

  it('never imports from frontend/helpers -- blocks both the generic install() helper and writeConfig in one assertion (D-01/D-14)', () => {
    expectAbsent(stripped, 'frontend/helpers', 'D-01/D-14')
  })

  it('never fetches the Steam library list locally -- the field that gates its own dropdown cannot be computed from a fetch it itself gates', () => {
    expectAbsent(
      stripped,
      'listSteamLibraryTargets',
      'D-02 fetch-cycle prevention'
    )
  })

  it('never reads diskSize (D-06)', () => {
    expectAbsent(stripped, 'diskSize', 'D-06')
  })

  it('never reads notEnoughDiskSpace (D-08)', () => {
    expectAbsent(stripped, 'notEnoughDiskSpace', 'D-08')
  })

  it('never renders a space-after-install projection (D-08)', () => {
    expectAbsent(stripped, 'space-after-install', 'D-08')
  })

  it('never reads spaceLeftAfter (D-06/D-08)', () => {
    expectAbsent(stripped, 'spaceLeftAfter', 'D-06/D-08')
  })

  it('imports no colocated stylesheet -- index.scss (the zero-stylesheet decision)', () => {
    expectAbsent(stripped, 'index.scss', 'zero-stylesheet decision')
  })

  it('imports no colocated stylesheet -- index.css (the zero-stylesheet decision)', () => {
    expectAbsent(stripped, 'index.css', 'zero-stylesheet decision')
  })

  // ⚠ `disabled` is deliberately NOT asserted absent here -- see file
  // header. D-25 (34.13-11, wave 7) legitimately wires
  // `disabled={eligibilityPending}` into this same file; a blanket ban
  // would make that locked decision fail CI. D-06's actual substance --
  // never gated on SIZE -- is re-asserted together below instead.
  it('the Install button is never gated on SIZE (D-06) -- diskSize/spaceLeftAfter/notEnoughDiskSpace/getInstallInfo all absent', () => {
    for (const token of [
      'diskSize',
      'spaceLeftAfter',
      'notEnoughDiskSpace',
      'getInstallInfo'
    ]) {
      expectAbsent(stripped, token, 'D-06 SIZE-gate ban')
    }
  })

  // ⚠ `--status-danger` is deliberately NOT asserted absent here -- see
  // file header. D-24's degrade notice legitimately claims it. This bounded
  // POSITIVE gate replaces the old absence ban.
  it('"var(--status-danger)" occurs exactly once, and only inside the steamDegrade-gated block (D-24 claims it; D-14 must not)', () => {
    assertBoundedStatusDanger(stripped)
  })
})

// ---------------------------------------------------------------------
// Block 1b -- D-25 (34.13-11, wave 7): the dialog's OWN footer Install
// button is the disabled one, and ONLY by that flag
// ---------------------------------------------------------------------
//
// 34.13-10's own file header predicted this narrowing in advance: "D-25
// adds exactly one legitimate `disabled` term (`disabled={eligibilityPending}`)
// and 34.13-11 (wave 7) wires it into this same file... Do not read a
// future `disabled` attribute here as a regression." This block is that
// wire-up landing. Under the retired D-12 model the eligibility check ran
// BEFORE the dialog opened, so the busy spinner belonged on the ORIGIN
// control (34.13-10's own <objective> text: "the spinner belongs on the
// origin control (34.13-11), never on this footer button"). D-25
// (`34.13-CONTEXT.md` lines 277-286) INVERTS that premise: the dialog opens
// INSTANTLY and its OWN footer Install button stays disabled until
// eligibility resolves. D-06's substance -- never gated on SIZE -- is
// preserved and re-asserted below alongside the new positive gate.
describe("D-25: the dialog's own footer Install button is disabled while eligibility pends, and ONLY by that flag", () => {
  const stripped = readDialogStripped()

  it('disabled= appears exactly once, and it is disabled={eligibilityPending}', () => {
    assertSingleEligibilityDisabledTerm(stripped)
  })

  // REWRITTEN by 34.13 review WR-09. The previous "non-vacuity" spec read:
  //
  //   const specimen = 'disabled={eligibilityPending} ... disabled={notEnoughDiskSpace}'
  //   expect(specimen.split('disabled=').length - 1).toBe(2)
  //
  // ...which asserts that `String.prototype.split` works. It never invoked
  // the real gate (that assertion was inlined into the `it` above, not
  // extracted into anything callable), so it proved nothing about the
  // gate's ability to DETECT a second `disabled=`. Every other non-vacuity
  // proof in this file correctly drives the real helper through
  // `expect(() => assertX(specimen)).toThrow()`; this one was the odd one
  // out, in a repo that has already ledgered "a gate can be non-vacuous,
  // correctly computed, RED-proven -- and still guard NOTHING". The gate is
  // now a throwing helper (above) and BOTH the real source and the
  // known-bad specimens go through it.
  it('WR-09: the real gate THROWS against a specimen carrying a second disabled= term', () => {
    const specimen =
      'disabled={eligibilityPending} ... disabled={notEnoughDiskSpace}'
    expect(() => assertSingleEligibilityDisabledTerm(specimen)).toThrow(
      /found 2/
    )
  })

  it('WR-09: the real gate THROWS when the single term is the WRONG one -- a count check alone would pass this', () => {
    const specimen = 'disabled={notEnoughDiskSpace}'
    // Exactly one `disabled=`, so a pure count gate is satisfied -- but it
    // is a SIZE gate, which D-06 forbids outright.
    expect(specimen.split('disabled=').length - 1).toBe(1)
    expect(() => assertSingleEligibilityDisabledTerm(specimen)).toThrow(
      /eligibilityPending/
    )
  })

  it('WR-09: the real gate THROWS when no disabled term is present at all', () => {
    expect(() => assertSingleEligibilityDisabledTerm('<button />')).toThrow(
      /found 0/
    )
  })

  it('D-06 still holds alongside the new disabled term -- diskSize/spaceLeftAfter/notEnoughDiskSpace/getInstallInfo remain absent', () => {
    for (const token of [
      'diskSize',
      'spaceLeftAfter',
      'notEnoughDiskSpace',
      'getInstallInfo'
    ]) {
      expectAbsent(
        stripped,
        token,
        'D-06 SIZE-gate ban, re-asserted after D-25'
      )
    }
  })
})

// ---------------------------------------------------------------------
// Block 2 -- no locally re-derived section condition
// (34.13-05's explicit review obligation against this plan)
// ---------------------------------------------------------------------

describe('no locally re-derived section condition (34.13-05 review obligation)', () => {
  const stripped = readDialogStripped()

  it('never re-derives platform availability locally (availablePlatforms.length)', () => {
    expectAbsent(
      stripped,
      'availablePlatforms.length',
      '34.13-05 review obligation'
    )
  })

  it('never re-derives a second library count (libraryCount)', () => {
    expectAbsent(stripped, 'libraryCount', '34.13-05 review obligation')
  })

  it('never re-derives a platform-selection section condition (platformToInstall ===)', () => {
    expectAbsent(
      stripped,
      'platformToInstall ===',
      '34.13-05 review obligation'
    )
  })
})

// ---------------------------------------------------------------------
// Block 3 -- required wiring
// ---------------------------------------------------------------------

describe('required wiring', () => {
  const stripped = readDialogStripped()

  it.each([
    'window.api.persistBottleWineVersion(',
    'window.api.checkDiskSpace(',
    'installSteamGame(',
    'resolveSteamInstallPath(',
    'steamLibraries',
    'steamDegrade',
    'gating.forceWindowsViaBottle',
    'gating.wineSection',
    'gating.libraryDropdown',
    'gating.freeSpaceLine',
    'gating.contentLightNotice',
    'smallInputInfo',
    'infoBox',
    'faWarning',
    'gamelib:steam.install.sharedBottleNotice',
    'gamelib:steam.install.libraryMissingNotice',
    'gamelib:steam.install.libraryFullNotice',
    'gamelib:steam.install.contentLightNotice',
    // 34.13 review B-WR-05: WR-11 and WR-04 each landed a real new BRANCH
    // into this file and neither extended this list. None of the four tokens
    // below is a substring of any token above, so reverting either fix left
    // every gate here green -- the copy bugs WR-11 and WR-04 fixed could
    // silently return. This file exists precisely to lock every decision the
    // dialog encodes.
    //
    // WR-11: the <=1-library corner, where the failing library IS the user's
    // only one, so "choose another below" is a false promise.
    'gamelib:steam.install.libraryMissingOnlyNotice',
    'gamelib:steam.install.libraryFullOnlyNotice',
    // ...and the field that selects between them, so it is provably READ and
    // not merely present in the destructure.
    'steamDegrade.onlyLibrary',
    // WR-04: the "turn it on in Settings" sentence is only true when the
    // setting is actually OFF.
    'gamelib:steam.install.contentLightSingleLibraryNotice',
    'nativeInstallOn'
  ])('requires "%s" in the stripped source', (token) => {
    expectPresent(stripped, token, 'required wiring')
  })

  it('B-WR-05 RED: each newly-required token is genuinely absent from a copy DERIVED FROM THE REAL SOURCE with that branch reverted, so the gate can actually trip', () => {
    // Reverting WR-11 means collapsing the onlyLibrary ternaries back to the
    // two original notices; reverting WR-04 means collapsing the
    // nativeInstallOn ternary back to the single content-light notice.
    const wr11Reverted = stripped
      .replaceAll('gamelib:steam.install.libraryMissingOnlyNotice', 'X')
      .replaceAll('gamelib:steam.install.libraryFullOnlyNotice', 'X')
      .replaceAll('steamDegrade.onlyLibrary', 'X')
    const wr04Reverted = stripped
      .replaceAll('gamelib:steam.install.contentLightSingleLibraryNotice', 'X')
      .replaceAll('nativeInstallOn', 'X')

    for (const token of [
      'gamelib:steam.install.libraryMissingOnlyNotice',
      'gamelib:steam.install.libraryFullOnlyNotice',
      'steamDegrade.onlyLibrary'
    ]) {
      expect(() => expectPresent(wr11Reverted, token, 'RED')).toThrow(
        /is missing/
      )
    }
    for (const token of [
      'gamelib:steam.install.contentLightSingleLibraryNotice',
      'nativeInstallOn'
    ]) {
      expect(() => expectPresent(wr04Reverted, token, 'RED')).toThrow(
        /is missing/
      )
    }
  })

  it('every occurrence of forceWindowsViaBottle is immediately preceded by "gating." -- the verdict field is passed through, never reconstructed', () => {
    assertForceWindowsViaBottlePrefixed(stripped)
  })
})

// ---------------------------------------------------------------------
// Block 3b -- region ordering (layout contract)
// ---------------------------------------------------------------------

describe('region ordering (layout contract) -- regions 2/3/4 are mutually exclusive at runtime, so only the D-24 ordering is user-observable; the other two are pinned to keep the source readable in the order the layout contract fixes', () => {
  const stripped = readDialogStripped()

  it('the D-24 degrade notice (libraryMissingNotice) occurs BEFORE {children} -- the first thing in DialogContent', () => {
    const degradeIndex = stripped.indexOf(
      'gamelib:steam.install.libraryMissingNotice'
    )
    const childrenIndex = stripped.indexOf('{children}')
    expect(degradeIndex).toBeGreaterThan(-1)
    expect(childrenIndex).toBeGreaterThan(-1)
    expect(degradeIndex).toBeLessThan(childrenIndex)
  })

  it('the D-14 shared-bottle notice occurs AFTER {children}', () => {
    const childrenIndex = stripped.indexOf('{children}')
    const sharedBottleIndex = stripped.indexOf(
      'gamelib:steam.install.sharedBottleNotice'
    )
    expect(childrenIndex).toBeGreaterThan(-1)
    expect(sharedBottleIndex).toBeGreaterThan(childrenIndex)
  })

  it('the Q6 content-light notice occurs AFTER the D-14 shared-bottle notice', () => {
    const sharedBottleIndex = stripped.indexOf(
      'gamelib:steam.install.sharedBottleNotice'
    )
    const contentLightIndex = stripped.indexOf(
      'gamelib:steam.install.contentLightNotice'
    )
    expect(sharedBottleIndex).toBeGreaterThan(-1)
    expect(contentLightIndex).toBeGreaterThan(sharedBottleIndex)
  })
})

// ---------------------------------------------------------------------
// Block 4 -- persist happens before install
// ---------------------------------------------------------------------

describe('persist happens before install', () => {
  const stripped = readDialogStripped()

  it('persistBottleWineVersion precedes installSteamGame( -- the D-14 -> D-15 ordering guarantee (the guided setup can only read a store that is already written)', () => {
    // `installSteamGame(` deliberately carries the parenthesis -- the bare
    // name also matches this file's own import statement, which would make
    // the ordering assertion vacuously true regardless of the real call
    // site's position (proven below).
    assertOrderingPersistBeforeInstall(stripped)
  })
})

// ---------------------------------------------------------------------
// Block 4b -- 34.13 review B-CR-01: the submit latch is a guard, not a wedge
// ---------------------------------------------------------------------

describe('B-CR-01: the WR-13 submit latch can always be released', () => {
  const stripped = readDialogStripped()

  it('the real source satisfies both obligations (persist has a rejection handler; the latch has a release path)', () => {
    expect(() => assertSubmitLatchCanBeReleased(stripped)).not.toThrow()
  })

  it('RED: a known-bad input DERIVED FROM THE REAL SOURCE by deleting the persist .catch is rejected', () => {
    // Derived, not replicated: the pre-fix shape is exactly today's source
    // with the `.catch(...)` continuation removed from the persist await.
    const knownBad = stripped.replace(
      /\.catch\(\(\) => \(\{\s*status: 'error' as const\s*\}\)\)/,
      ''
    )
    expect(knownBad).not.toBe(stripped)
    expect(() => assertSubmitLatchCanBeReleased(knownBad)).toThrow(
      /no rejection handler/
    )
  })

  it('RED: a known-bad input DERIVED FROM THE REAL SOURCE by deleting every setSubmitting(false) is rejected -- this is verbatim the pre-fix WR-13 shape', () => {
    const knownBad = stripped.replaceAll('setSubmitting(false)', '')
    expect(knownBad).not.toBe(stripped)
    expect(() => assertSubmitLatchCanBeReleased(knownBad)).toThrow(
      /no release path/
    )
  })

  it('RED: deleting the latch itself is also rejected -- the gate cannot be satisfied by simply removing WR-13', () => {
    const knownBad = stripped.replaceAll('setSubmitting(true)', '')
    expect(() => assertSubmitLatchCanBeReleased(knownBad)).toThrow(
      /double-click guard was removed/
    )
  })
})

// ---------------------------------------------------------------------
// Block 5 -- the source gates reject a known-bad specimen (non-vacuity)
// ---------------------------------------------------------------------
//
// The repo carries multiple ledgered instances of a correctly-written,
// passing assertion that guarded nothing, and an unmatchable pattern passes
// vacuously by construction. This block is the difference between a gate
// and a decoration: every absence gate above is demonstrated to FAIL
// against an executable specimen carrying the banned token in real code
// position.

describe('the source gates reject a known-bad specimen', () => {
  const FORBIDDEN_TOKENS: Array<[string, string]> = [
    ['getInstallInfo', 'D-06/D-07'],
    ['writeConfig', 'D-14'],
    ['frontend/helpers', 'D-01/D-14'],
    ['listSteamLibraryTargets', 'D-02 fetch-cycle prevention'],
    ['diskSize', 'D-06'],
    ['notEnoughDiskSpace', 'D-08'],
    ['space-after-install', 'D-08'],
    ['spaceLeftAfter', 'D-06/D-08'],
    ['availablePlatforms.length', '34.13-05 review obligation'],
    ['libraryCount', '34.13-05 review obligation']
  ]

  it.each(FORBIDDEN_TOKENS)(
    'expectAbsent throws when "%s" appears in executable position',
    (token, decisionNote) => {
      const specimen = `const x = '${token}'`
      const stripped = stripSourceComments(specimen)
      expect(() => expectAbsent(stripped, token, decisionNote)).toThrow()
    }
  )

  it('expectAbsent throws when platformToInstall === appears in executable position', () => {
    const specimen = "if (platformToInstall === 'Windows') {}"
    const stripped = stripSourceComments(specimen)
    expect(() =>
      expectAbsent(
        stripped,
        'platformToInstall ===',
        '34.13-05 review obligation'
      )
    ).toThrow()
  })

  // Stripper-integrity proof: for at least three of the tokens above, a
  // specimen carrying the token ONLY inside a comment -- both the `//` form
  // and the `/* */` form -- PASSES the gate. This is the direct evidence
  // that `index.tsx`'s own header comment (which legitimately NAMES these
  // tokens while explaining they are forbidden) cannot self-invalidate the
  // gates that quote it.
  const STRIPPER_PROOF_TOKENS = [
    'getInstallInfo',
    'writeConfig',
    'listSteamLibraryTargets'
  ]

  it.each(STRIPPER_PROOF_TOKENS)(
    'expectAbsent passes when "%s" appears only inside a // comment',
    (token) => {
      const specimen = `// mentions ${token} only to explain it is forbidden`
      const stripped = stripSourceComments(specimen)
      expect(() =>
        expectAbsent(stripped, token, 'specimen proof')
      ).not.toThrow()
    }
  )

  it.each(STRIPPER_PROOF_TOKENS)(
    'expectAbsent passes when "%s" appears only inside a /* */ block comment',
    (token) => {
      const specimen = `/* mentions ${token} only to explain it is forbidden */`
      const stripped = stripSourceComments(specimen)
      expect(() =>
        expectAbsent(stripped, token, 'specimen proof')
      ).not.toThrow()
    }
  )

  it('assertForceWindowsViaBottlePrefixed throws on a specimen missing the "gating." prefix', () => {
    const specimen = 'installSteamGame(a, b, c, forceWindowsViaBottle)'
    const stripped = stripSourceComments(specimen)
    expect(() => assertForceWindowsViaBottlePrefixed(stripped)).toThrow()
  })

  it('assertOrderingPersistBeforeInstall throws on a specimen with the two calls swapped', () => {
    const specimen = [
      'installSteamGame(appName, gameInfo, path, gating.forceWindowsViaBottle)',
      'await window.api.persistBottleWineVersion(wineVersion)'
    ].join('\n')
    const stripped = stripSourceComments(specimen)
    expect(() => assertOrderingPersistBeforeInstall(stripped)).toThrow()
  })

  it('the ordering check would be vacuous with a bare "installSteamGame" (no parenthesis) -- proven against a specimen where only the import line matches', () => {
    const specimen = [
      "import { installSteamGame } from 'frontend/state/InstallGameModal'",
      'await window.api.persistBottleWineVersion(wineVersion)'
    ].join('\n')
    const stripped = stripSourceComments(specimen)
    // The bare name (no parenthesis) matches the import line, which sits
    // BEFORE the persist call -- a naive ordering check using the bare name
    // would report "persist after install" as satisfied (WRONG) even
    // though this specimen contains no real call site at all. Requiring
    // the parenthesis avoids this vacuous match entirely.
    const bareNameIndex = stripped.indexOf('installSteamGame')
    const persistIndex = stripped.indexOf('persistBottleWineVersion')
    expect(bareNameIndex).toBeGreaterThan(-1)
    expect(bareNameIndex).toBeLessThan(persistIndex)
    expect(stripped.indexOf('installSteamGame(')).toBe(-1)
    // With the parenthesis required, `assertOrderingPersistBeforeInstall`
    // correctly reports this specimen as missing a required token, rather
    // than vacuously passing.
    expect(() => assertOrderingPersistBeforeInstall(stripped)).toThrow()
  })

  it('assertBoundedStatusDanger throws when the token occurs TWICE', () => {
    const specimen = [
      'steamDegrade && <FontAwesomeIcon style={{ color: "var(--status-danger)" }} />',
      '<FontAwesomeIcon style={{ color: "var(--status-danger)" }} />'
    ].join('\n')
    const stripped = stripSourceComments(specimen)
    expect(() => assertBoundedStatusDanger(stripped)).toThrow()
  })
})

// Finish with a full-suite run in Task 3's own <verify> command
// (`pnpm test:ci`) -- this plan adds files only, so any suite that flips
// red is a real regression, not an expected update.
