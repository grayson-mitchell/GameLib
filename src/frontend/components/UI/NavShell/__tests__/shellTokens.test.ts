/**
 * Source-text gates for the three shell tokens declared in
 * `NavShell/index.scss` (34.10-02 Task 2, REQ-34.10-10 / D-10, REQ-34.10-03
 * / D-01). These are SOURCE-TEXT gates, not render tests -- there is no
 * jsdom / CSS transform in this jest project (see
 * `src/frontend/jest.config.js` docstring), so a stylesheet cannot be
 * mounted or computed here. Every assertion below scans stripped-of-comments
 * source text under `src/frontend`, following the `cssBlock`/`readFileSync`
 * idiom in `screens/Login/__tests__/index.test.tsx`.
 *
 * `stripSourceComments` runs before every scan so a prose mention of
 * `--tier2-width:` or `204px` in an explanatory comment can neither satisfy
 * nor break these gates -- only real declarations count.
 *
 * `--traffic-light-inset`'s pinned value moved from `0px` to `78px` as part
 * of the D-06 reversal (plan 34.1-10 makes the macOS titlebar overlaid
 * whenever `settings.framelessWindow` is ON; plan 34.1-11 is this pinned
 * value's retune plus the state-scoping gates below) -- see gap G4,
 * `34.1-HUMAN-UAT.md` "## D-06 reversal". The retune tracks a real decision
 * reversal, not drift; the exactly-once-declaration discipline this file
 * exists to guard is unchanged.
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const FRONTEND_ROOT = join(__dirname, '..', '..', '..', '..')
const NAVSHELL_SCSS = join(FRONTEND_ROOT, 'components/UI/NavShell/index.scss')

function collectStylesheets(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      collectStylesheets(full, out)
    } else if (/\.(scss|css)$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

function readStripped(path: string): string {
  return stripSourceComments(readFileSync(path, 'utf8'))
}

const STYLESHEETS = collectStylesheets(FRONTEND_ROOT)

function countMatches(pattern: RegExp): number {
  let total = 0
  for (const file of STYLESHEETS) {
    const matches = readStripped(file).match(pattern)
    if (matches) total += matches.length
  }
  return total
}

/**
 * Extracts the body of the FIRST top-level rule whose selector+opening-brace
 * matches `openPattern` (anchored to the start of a line), tracking brace
 * depth so nested rules inside the body do not truncate the match early.
 * Mirrors `appShellLayout.test.ts`'s `extractBlock` -- duplicated locally
 * rather than imported, matching this file's existing pattern of a
 * self-contained source-text-gate module.
 */
function extractBlock(source: string, openPattern: RegExp): string | null {
  const match = openPattern.exec(source)
  if (!match) return null

  let idx = match.index + match[0].length
  let depth = 1
  let out = ''
  while (idx < source.length && depth > 0) {
    const ch = source[idx]
    if (ch === '{') depth++
    else if (ch === '}') depth--
    if (depth > 0) out += ch
    idx++
  }
  return out
}

describe('NavShell shell tokens (REQ-34.10-10, REQ-34.10-03)', () => {
  it('--tier2-width: is declared exactly once across every stylesheet under src/frontend', () => {
    expect(countMatches(/--tier2-width:/g)).toBe(1)
  })

  it('--traffic-light-inset: is declared exactly once, and its value is 78px (D-06 reversal)', () => {
    expect(countMatches(/--traffic-light-inset:/g)).toBe(1)
    expect(countMatches(/--traffic-light-inset:\s*78px\s*;/g)).toBe(1)
  })

  it('SANITY: the retuned --traffic-light-inset check above fails against the pre-reversal 0px value -- proves it is not vacuously true', () => {
    // The pre-reversal value is the correct known-bad input: it is the
    // literal declaration that was on disk before this plan.
    const preReversalFixture = '--traffic-light-inset: 0px;'
    expect(preReversalFixture).not.toMatch(/--traffic-light-inset:\s*78px\s*;/)
  })

  it('the literal 204px appears exactly once under src/frontend -- inside the single --tier2-width declaration, nowhere else', () => {
    // REQ-34.10-10's whole point: 34.11 must be able to retune this value
    // in one place. A second, unrelated `204px` anywhere would either be a
    // duplicate declaration or a hardcoded value that silently drifts from
    // the token.
    expect(countMatches(/204px/g)).toBe(1)
  })

  it('sanity: NavShell/index.scss itself is the file carrying the --tier2-width declaration', () => {
    const shellStylesheet = readStripped(
      join(FRONTEND_ROOT, 'components/UI/NavShell/index.scss')
    )
    expect(shellStylesheet).toMatch(/--tier2-width:\s*204px\s*;/)
  })

  it('the literal 78px appears exactly once under src/frontend -- inside the single --traffic-light-inset declaration, nowhere else', () => {
    // Same reasoning as the 204px gate above: a second occurrence is either
    // a duplicate declaration or a hardcoded value that silently drifts
    // from the token.
    expect(countMatches(/78px/g)).toBe(1)
  })

  it('the 78px reserve is SCOPED to .App.macOverlayTitlebar, not applied to the base .NavShell__navbar', () => {
    // Without this second half, a census/value gate alone would pass on an
    // unscoped 78px reserve applied to every platform -- a real, plausible
    // wrong implementation, not a hypothetical.
    const shellSource = readStripped(NAVSHELL_SCSS)

    const scopedBlock = extractBlock(
      shellSource,
      /^\.App\.macOverlayTitlebar\s+\.NavShell__navbar\s*\{/m
    )
    expect(scopedBlock).not.toBeNull()
    expect(scopedBlock).toMatch(
      /padding-inline-start:\s*var\(--traffic-light-inset\)\s*;/
    )

    const baseNavbarBlock = extractBlock(
      shellSource,
      /^\.NavShell__navbar\s*\{/m
    )
    expect(baseNavbarBlock).not.toBeNull()
    expect(baseNavbarBlock).not.toMatch(/padding-inline-start/)
  })

  it('SANITY: the scoping check above fails against a known-bad input (an unscoped reserve on the base navbar) -- proves it is not vacuously true', () => {
    const unscopedFixture = `
      .NavShell__navbar {
        padding-inline-start: var(--traffic-light-inset);
      }
    `
    const strippedFixture = stripSourceComments(unscopedFixture)
    const baseNavbarBlock = extractBlock(
      strippedFixture,
      /^\s*\.NavShell__navbar\s*\{/m
    )
    expect(baseNavbarBlock).not.toBeNull()
    // This is the exact wrong-implementation shape the real gate above must
    // reject: the base .NavShell__navbar block itself declares the reserve.
    expect(baseNavbarBlock).toMatch(/padding-inline-start/)
  })
})
