/**
 * Gate for quick task 260816-hdg — `depotSignalCaptured`, the read-boundary
 * normalization that stops a pre-D-17 residue cache entry from asserting a
 * depot signal it never actually captured.
 *
 * The residue shape (`platformsCaptured: true` with NO `is_windows_native`)
 * is not hypothetical: 370 of the 380 entries in the real on-disk
 * `steam_metadata.json` surveyed 2026-08-16 have exactly that shape. It is
 * the worst possible input to the install form's platform row, because it
 * claims the depot question WAS answered (so Phase 34.14's D-04 fail-open
 * correctly declines to engage) while `hasSteamWindowsDepot()` reads the
 * absent field as `false` — 370 games concluding "no Windows build" with
 * full confidence.
 *
 * Structure, following `steamInstallFormContracts.test.ts` in this same
 * directory:
 *   1. the 9-cell truth table over `{platformsCaptured} x {is_windows_native}`
 *      plus `null` / `undefined`;
 *   2. the NON-VACUITY / saboteur block — `readsRawFlag` is the raw
 *      `?.platformsCaptured === true` read this helper replaces, and it must
 *      DISAGREE on the residue shape while AGREEING everywhere else, proving
 *      the helper is a discriminator rather than a rename;
 *   3. the SOURCE GATE over all five call sites (added in Task 2) — the three
 *      normalized reads, the two deliberate non-changes, the fourth-site pin,
 *      and the HARD PROHIBITION on `steamPlatformRow.ts`.
 *
 * ts-jest in this repo is TRANSPILE-ONLY (`isolatedModules: true`, see
 * `steamInstallFormContracts.test.ts`'s empirical note), so nothing here
 * leans on a type error surfacing as a jest failure. Every assertion is a
 * runtime assertion or a comment-stripped source-text match.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { depotSignalCaptured } from '../metadataCapture'

describe('depotSignalCaptured: the 9-cell truth table', () => {
  it('returns true for a legitimately-written entry with a positive Windows depot', () => {
    expect(
      depotSignalCaptured({ platformsCaptured: true, is_windows_native: true })
    ).toBe(true)
  })

  it('returns true for a legitimately-written entry with a NEGATIVE Windows depot (a captured "no" is still captured)', () => {
    expect(
      depotSignalCaptured({ platformsCaptured: true, is_windows_native: false })
    ).toBe(true)
  })

  it('THE 370-ENTRY RESIDUE SHAPE: returns false for platformsCaptured:true with no is_windows_native', () => {
    expect(depotSignalCaptured({ platformsCaptured: true })).toBe(false)
  })

  it('returns false when platformsCaptured is false even though is_windows_native is true', () => {
    expect(
      depotSignalCaptured({ platformsCaptured: false, is_windows_native: true })
    ).toBe(false)
  })

  it('returns false when platformsCaptured is false and is_windows_native is false', () => {
    expect(
      depotSignalCaptured({
        platformsCaptured: false,
        is_windows_native: false
      })
    ).toBe(false)
  })

  it('returns false for platformsCaptured:false with no is_windows_native', () => {
    expect(depotSignalCaptured({ platformsCaptured: false })).toBe(false)
  })

  it('returns false for is_windows_native:true with no platformsCaptured', () => {
    expect(depotSignalCaptured({ is_windows_native: true })).toBe(false)
  })

  it('returns false for is_windows_native:false with no platformsCaptured', () => {
    expect(depotSignalCaptured({ is_windows_native: false })).toBe(false)
  })

  it('returns false for an empty entry', () => {
    expect(depotSignalCaptured({})).toBe(false)
  })

  it('returns false for null', () => {
    expect(depotSignalCaptured(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(depotSignalCaptured(undefined)).toBe(false)
  })
})

describe('depotSignalCaptured: non-vacuity — it discriminates against the raw read it replaces', () => {
  const readsRawFlag = (
    e?: { platformsCaptured?: boolean; is_windows_native?: boolean } | null
  ): boolean => e?.platformsCaptured === true

  it('DISAGREES with the raw flag read on the residue shape (raw says captured, helper says not)', () => {
    const residue = { platformsCaptured: true }
    expect(readsRawFlag(residue)).toBe(true)
    expect(depotSignalCaptured(residue)).toBe(false)
    expect(depotSignalCaptured(residue)).not.toBe(readsRawFlag(residue))
  })

  it('AGREES with the raw flag read on every non-residue cell, so the disagreement is a discriminator and not a different function', () => {
    const nonResidueCells: Array<{
      platformsCaptured?: boolean
      is_windows_native?: boolean
    } | null> = [
      { platformsCaptured: true, is_windows_native: true },
      { platformsCaptured: true, is_windows_native: false },
      { platformsCaptured: false, is_windows_native: true },
      { platformsCaptured: false, is_windows_native: false },
      { platformsCaptured: false },
      { is_windows_native: true },
      { is_windows_native: false },
      {},
      null
    ]

    for (const cell of nonResidueCells) {
      expect([JSON.stringify(cell), depotSignalCaptured(cell)]).toEqual([
        JSON.stringify(cell),
        readsRawFlag(cell)
      ])
    }
    expect(depotSignalCaptured(undefined)).toBe(readsRawFlag(undefined))
  })
})

/**
 * Source gate over all five read sites plus the frontend prohibition.
 *
 * Every assertion below runs against COMMENT-STRIPPED source, which is
 * load-bearing twice over:
 *   - `steamPlatformRow.ts`'s own header quotes the forbidden inverted
 *     comparison verbatim while explaining why it is forbidden. Without
 *     stripping, the absence assertion would fail against a correct file.
 *   - The rationale comments added at each normalized site are WHOLE-LINE
 *     comments precisely so this stripper removes them; a trailing `// ...`
 *     appended to a code line survives `stripSourceComments` by design (see
 *     that util's own header), and a surviving comment that restated the raw
 *     expression would let this gate match its own explanatory prose.
 *
 * Matching is on the EXPRESSION with tolerant whitespace, never on a line
 * number — the plan's line references drift with every edit above them.
 */
const readStripped = (relPath: string): string =>
  stripSourceComments(readFileSync(join(__dirname, relPath), 'utf8'))

const gamesSource = readStripped('../games.ts')
const librarySource = readStripped('../library.ts')
const installFormIpcSource = readStripped('../installFormIpc.ts')
const steamPlatformRowSource = readStripped(
  '../../../../frontend/screens/Library/components/InstallModal/steamPlatformRow.ts'
)

const IMPORTS_HELPER =
  /import\s*\{\s*depotSignalCaptured\s*\}\s*from\s*'\.\/metadataCapture'/

describe('source gate: the three depot-signal reads are normalized', () => {
  it('library.ts seeds GameInfo.steamPlatformsCaptured through the helper', () => {
    expect(librarySource).toMatch(
      /steamPlatformsCaptured:\s*depotSignalCaptured\(cachedMeta\)/
    )
  })

  it('library.ts imports depotSignalCaptured from ./metadataCapture', () => {
    expect(librarySource).toMatch(IMPORTS_HELPER)
  })

  it('installFormIpc.ts builds SteamBottleEligibilityVerdict.platformsCaptured through the helper', () => {
    expect(installFormIpcSource).toMatch(
      /platformsCaptured\s*=\s*depotSignalCaptured\(cached\)/
    )
  })

  it('installFormIpc.ts imports depotSignalCaptured from ./metadataCapture', () => {
    expect(installFormIpcSource).toMatch(IMPORTS_HELPER)
  })

  it("games.ts gates getGameInfo's self-heal refetch on the helper", () => {
    expect(gamesSource).toMatch(/!\s*depotSignalCaptured\(cached\)/)
  })

  it('games.ts imports depotSignalCaptured from ./metadataCapture', () => {
    expect(gamesSource).toMatch(IMPORTS_HELPER)
  })
})

describe('source gate: the deliberate non-changes stay raw', () => {
  const MAC_GATE =
    /platformsCaptured === true && meta\?\.is_mac_native === false/

  it('games.ts isBottleEligibleFromPlatforms still reads the raw flag for the MAC question', () => {
    expect(gamesSource).toMatch(MAC_GATE)
  })

  it('library.ts isBridgeAuthoritativeForInstallState still reads the raw flag for the MAC question', () => {
    expect(librarySource).toMatch(MAC_GATE)
  })

  it("games.ts ensurePlatformsCaptured's alreadyCaptured (the fourth site) still reads the raw flag", () => {
    expect(gamesSource).toMatch(
      /steamMetadataStore\.get\(this\.appId\)\?\.platformsCaptured === true/
    )
  })
})

describe('source gate: the HARD PROHIBITION on steamPlatformRow.ts', () => {
  it('hasSteamWindowsDepot keeps its strict equality against the depot field', () => {
    expect(steamPlatformRowSource).toMatch(/is_windows_native === true/)
  })

  it('does NOT contain the treatsAbsentAsAvailable inverted comparison', () => {
    expect(steamPlatformRowSource).not.toMatch(/is_windows_native !== false/)
  })
})
