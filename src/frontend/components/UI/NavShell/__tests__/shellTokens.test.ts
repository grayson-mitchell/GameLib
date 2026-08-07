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
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const FRONTEND_ROOT = join(__dirname, '..', '..', '..', '..')

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

describe('NavShell shell tokens (REQ-34.10-10, REQ-34.10-03)', () => {
  it('--tier2-width: is declared exactly once across every stylesheet under src/frontend', () => {
    expect(countMatches(/--tier2-width:/g)).toBe(1)
  })

  it('--traffic-light-inset: is declared exactly once, and its value is 0px', () => {
    expect(countMatches(/--traffic-light-inset:/g)).toBe(1)
    expect(countMatches(/--traffic-light-inset:\s*0px\s*;/g)).toBe(1)
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
})
