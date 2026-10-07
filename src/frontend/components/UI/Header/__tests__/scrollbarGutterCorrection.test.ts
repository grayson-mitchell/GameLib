/**
 * Source-text regression gate for the scrollbar-gutter correction added to
 * `Header` (debug/tier2-right-edge-shifts-with-scrollbar, 2026-10-03).
 *
 * Why a source gate and not a render/behaviour test: this project's
 * Frontend jest project runs `testEnvironment: 'node'` (see
 * `src/frontend/jest.config.js`) -- there is no jsdom, so there is no real
 * `clientWidth`/`offsetWidth`/`ResizeObserver` for any test here to
 * exercise. The fix was verified live, in the running dev app, against the
 * WKWebView engine itself (see the resolved debug session for the measured
 * numbers in both scrollbar states). This gate only protects against the
 * fix being silently dropped or structurally altered by a future edit --
 * it cannot prove the fix behaves correctly, only that it is still present.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..')
const HEADER_TSX = 'src/frontend/components/UI/Header/index.tsx'

const read = (relPath: string) =>
  stripSourceComments(readFileSync(join(REPO_ROOT, relPath), 'utf8'))

describe('Header scrollbar-gutter correction (debug/tier2-right-edge-shifts-with-scrollbar)', () => {
  const tsx = read(HEADER_TSX)

  it('imports useRef and useLayoutEffect from react', () => {
    expect(tsx).toMatch(/\buseRef\b/)
    expect(tsx).toMatch(/\buseLayoutEffect\b/)
  })

  it('attaches the ref to the root .Header element', () => {
    expect(tsx).toMatch(/<div className="Header" ref=\{headerRef\}>/)
  })

  it('reads the parent portal element off the ref rather than querying by class', () => {
    // Deliberately NOT a `querySelector('.NavShell__tier2Portal')` lookup --
    // Header is always portalled as a direct child of that element (see
    // tier2Portal.test.ts's portal-target assertions), so `parentElement`
    // is reliable and does not depend on a class name staying in sync here.
    expect(tsx).toMatch(/headerRef\.current/)
    expect(tsx).toMatch(/\.parentElement/)
  })

  it('skips correction entirely once the real scrollbar is present (overflowing)', () => {
    expect(tsx).toMatch(/scrollHeight\s*>\s*portal\.clientHeight/)
  })

  it('measures the TRUE native scrollbar width via a hidden off-screen probe', () => {
    expect(tsx).toMatch(/overflow:scroll/)
    expect(tsx).toMatch(/offsetWidth\s*-\s*probe\.clientWidth/)
  })

  it('applies the correction as a calc(100% + Npx) width, never a fixed pixel width', () => {
    expect(tsx).toMatch(/calc\(100% \+ \$\{correction\}px\)/)
  })

  it('observes the portal with a ResizeObserver and disconnects on cleanup', () => {
    expect(tsx).toMatch(/new ResizeObserver\(/)
    expect(tsx).toMatch(/observer\.disconnect\(\)/)
  })
})
