/**
 * Premise-asserting placement gate for gap G1 / UAT test 1 (34.1-09):
 * `WindowControls` renders BELOW the titlebar because
 * `WindowControls/index.scss` declared `grid-area: content`, an area name
 * whose POSITION Phase 34.10 moved (`content` used to be the sidebar grid's
 * top row; it is now row 2 of `.App`'s four-row shell grid).
 *
 * `appShellLayout.test.ts:171` ("the frameless navbar reserves trailing
 * space via var(--overlay-controls-width)") is non-vacuous, correctly
 * written, was green throughout the regression, and still guarded nothing:
 * its layout PREMISE -- that `.windowControls` and `.NavShell__navbar` share
 * a coordinate space -- had silently stopped being true. A gate that instead
 * asserts a CONSEQUENCE of co-location (e.g. "the reserve declaration
 * exists") cannot detect the premise itself moving out from under it.
 *
 * Gate 1 below is therefore built differently on purpose: it does not pin a
 * literal expected row index. It DERIVES both areas' row indices from
 * `.App`'s own live `grid-template-areas` in `App.css` and compares them.
 * Any future grid rewrite that separates the two areas into different rows
 * turns this gate RED, regardless of what the new row numbers are -- the
 * same silent displacement that shipped G1 cannot recur unnoticed.
 *
 * This is also why the "prove a grep assertion fails against a known-bad
 * input" rule ALONE would not have caught G1: a gate hand-written to expect
 * "row 0" (content's row under the retired sidebar grid) would have failed
 * loudly the moment 34.10 shipped its new grid shape -- but a gate
 * hand-written to expect "row 2" (content's NEW row, matching the shipped,
 * already-broken state) would have passed the known-bad-input check AND
 * still guarded nothing, because it would silently encode the bug as the
 * expected value. Deriving the comparison from the live grid instead of a
 * pinned literal is what closes that hole.
 *
 * There is no jsdom and no CSS engine in the `Frontend` jest project (see
 * `shellTokens.test.ts`'s own docstring) -- every gate below is a
 * source-text scan, run through `stripSourceComments` first so prose
 * mentions (e.g. this very docstring, or `NavShell/index.scss:132`'s D-05
 * comment naming `grid-area: content`) can neither satisfy nor break a
 * gate. `extractBlock` is copied from `appShellLayout.test.ts` rather than
 * reimplemented naively: `.App .content { ... &:not(...) { ... } }` and
 * `.frameless:not(.fullscreen) .NavShell__navbar { ... }` both contain
 * nested braces or a longer selector sharing a substring with the target,
 * either of which would truncate or mismatch a plain `/\.sel\s*\{[^}]*\}/`.
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const FRONTEND_ROOT = join(__dirname, '..', '..', '..', '..')

const APP_CSS = join(FRONTEND_ROOT, 'App.css')
const WINDOW_CONTROLS_SCSS = join(
  FRONTEND_ROOT,
  'components/UI/WindowControls/index.scss'
)
const NAVSHELL_SCSS = join(FRONTEND_ROOT, 'components/UI/NavShell/index.scss')

function readStripped(path: string): string {
  return stripSourceComments(readFileSync(path, 'utf8'))
}

/**
 * Extracts the body of the FIRST top-level rule whose selector+opening-brace
 * matches `openPattern` (anchored to the start of a line so it cannot match
 * a substring inside a longer, different selector), tracking brace depth so
 * nested rules inside the body do not truncate the match early. Copied from
 * `appShellLayout.test.ts` per this plan's `<interfaces>` instruction rather
 * than reimplemented.
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

/**
 * Parses `.App`'s `grid-template-areas` declaration in `App.css` into a
 * row-major matrix of area names. Throws (rather than returning an empty
 * matrix) if `.App`'s block or its `grid-template-areas` declaration is
 * absent, so a future grid rewrite that removes or renames the declaration
 * fails this file LOUDLY instead of every gate below silently passing
 * against an empty matrix.
 */
function gridAreaMatrix(): string[][] {
  const appBlock = extractBlock(readStripped(APP_CSS), /^\.App\s*\{/m)
  if (appBlock === null) {
    throw new Error(
      "App.css: expected top-level '.App { ... }' block not found -- " +
        'App.css structure has changed; update windowControlsPlacement.test.ts'
    )
  }

  const declaration = appBlock.match(
    /grid-template-areas:\s*((?:'[^']*'\s*)+);/
  )
  if (!declaration) {
    throw new Error(
      '.App has no grid-template-areas declaration in App.css -- the grid ' +
        'shape this gate depends on has changed; update windowControlsPlacement.test.ts'
    )
  }

  const rows = declaration[1].match(/'([^']*)'/g)
  if (!rows || rows.length === 0) {
    throw new Error(
      '.App grid-template-areas value could not be parsed into rows -- ' +
        'update windowControlsPlacement.test.ts'
    )
  }

  return rows.map((row) => row.slice(1, -1).trim().split(/\s+/))
}

/** The index of the first row in `matrix` containing `areaName`. Throws if absent. */
function rowOf(matrix: string[][], areaName: string): number {
  const idx = matrix.findIndex((row) => row.includes(areaName))
  if (idx === -1) {
    throw new Error(
      `grid-template-areas: area "${areaName}" not found in any row of ` +
        `${JSON.stringify(matrix)}`
    )
  }
  return idx
}

/** Extracts `path`'s block matching `selectorPattern` and returns its declared `grid-area` value. Throws if either is absent. */
function declaredGridArea(path: string, selectorPattern: RegExp): string {
  const block = extractBlock(readStripped(path), selectorPattern)
  if (block === null) {
    throw new Error(
      `${path}: no block matching ${selectorPattern} found -- update windowControlsPlacement.test.ts`
    )
  }
  const match = block.match(/grid-area:\s*([a-zA-Z0-9_-]+)\s*;/)
  if (!match) {
    throw new Error(
      `${path}: block matching ${selectorPattern} has no grid-area declaration`
    )
  }
  return match[1]
}

/** Every real (non-prose) `grid-area: content;` consumer under src/frontend, as a repo-relative path. */
function gridAreaContentConsumers(): string[] {
  const offenders: string[] = []
  for (const file of collectStylesheets(FRONTEND_ROOT)) {
    const text = readStripped(file)
    if (/grid-area:\s*content\s*;/.test(text)) {
      offenders.push(relative(FRONTEND_ROOT, file))
    }
  }
  return offenders
}

describe('WindowControls placement (gap G1 / UAT test 1, 34.1-09)', () => {
  it('gate 1 -- PREMISE: .windowControls and .NavShell__navbar resolve to the SAME row of .App grid-template-areas', () => {
    const matrix = gridAreaMatrix()
    const windowControlsArea = declaredGridArea(
      WINDOW_CONTROLS_SCSS,
      /^\.windowControls\s*\{/m
    )
    const navbarArea = declaredGridArea(
      NAVSHELL_SCSS,
      /^\.NavShell__navbar\s*\{/m
    )
    const windowControlsRow = rowOf(matrix, windowControlsArea)
    const navbarRow = rowOf(matrix, navbarArea)

    if (windowControlsRow !== navbarRow) {
      throw new Error(
        `gap G1 / UAT test 1: .windowControls (grid-area: "${windowControlsArea}", ` +
          `row ${windowControlsRow}) and .NavShell__navbar (grid-area: "${navbarArea}", ` +
          `row ${navbarRow}) resolve to DIFFERENT rows of .App's grid-template-areas -- ` +
          'WindowControls has been displaced from the navbar row again.'
      )
    }
    expect(windowControlsRow).toBe(navbarRow)
  })

  it('SANITY for gate 1: the live matrix genuinely distinguishes "content" and "navbar" rows -- the G1 regression pairing (content vs navbar) would fail gate 1', () => {
    // This is the known-bad input: the actual pre-fix declaration was
    // `grid-area: content` while `.NavShell__navbar` has always been
    // `grid-area: navbar`. If content and navbar ever resolved to the SAME
    // row, gate 1 could not have caught the real regression -- it would
    // have passed by coincidence both before and after the fix.
    const matrix = gridAreaMatrix()
    expect(rowOf(matrix, 'content')).not.toBe(rowOf(matrix, 'navbar'))
  })

  it('gate 3 -- CENSUS: grid-area: content has exactly one live consumer under src/frontend (App.css)', () => {
    // Enumerate-then-set-difference, not a two-file allowlist: the recorded
    // project lesson (`threat-register-ranges-hide-uncovered-ids`) is that
    // an audit scoped narrower than the defect's own unit cannot find it.
    expect(gridAreaContentConsumers()).toEqual(['App.css'])
  })

  it('SANITY for gate 3: the grid-area:content scanner is not vacuously unmatchable -- it DOES match the known-good App.css declaration', () => {
    // Negative control per the project rule that a grep-based assertion
    // must be proven to fail against a known-bad input -- the mirror image
    // here is proving the pattern is capable of matching at all, since an
    // unmatchable pattern would make gate 3 pass on an empty result for the
    // wrong reason (F-34.10-08's exact failure mode: an anchored pattern
    // that could never match vite's single-line minified CSS returned 0
    // even for the file that DID contain the rule).
    const appCssMatches = readStripped(APP_CSS).match(
      /grid-area:\s*content\s*;/g
    )
    expect(appCssMatches?.length ?? 0).toBeGreaterThanOrEqual(1)
  })

  it('.windowControls does not declare position: sticky', () => {
    // A sticky-positioned grid item is constrained to its OWN grid area.
    // `navbar` is a single min-content row exactly as tall as the navbar
    // itself -- zero sticky travel distance -- so `position: sticky; top:
    // 0px` here would be wrong-but-plausible, exactly the class
    // `appShellLayout.test.ts:332` guards against for `.NavShell__navbar`
    // itself.
    const block = extractBlock(
      readStripped(WINDOW_CONTROLS_SCSS),
      /^\.windowControls\s*\{/m
    )
    expect(block).not.toBeNull()
    expect(block).not.toMatch(/position:\s*sticky/)
  })

  it('.windowControls still declares justify-self: right and z-index: 100', () => {
    // These two properties are what make the intentional overlap with
    // `.NavShell__navbar` (both now sharing the `navbar` grid area) land the
    // buttons on the correct side, above the navbar's own content.
    const block = extractBlock(
      readStripped(WINDOW_CONTROLS_SCSS),
      /^\.windowControls\s*\{/m
    )
    expect(block).not.toBeNull()
    expect(block).toMatch(/justify-self:\s*right\s*;/)
    expect(block).toMatch(/z-index:\s*100\s*;/)
  })
})
