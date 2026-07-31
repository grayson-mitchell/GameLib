/**
 * F-10 regression + blank-screen guarantees for the `/login` path
 * (34.4.1 gap cycle 2, plan 25, Task 3).
 *
 * These are SOURCE-TEXT gates, not render tests, and the distinction is load
 * bearing: this jest project is `testEnvironment: 'node'` with no jsdom, no
 * react-test-renderer and no CSS transform (see src/frontend/jest.config.js),
 * so neither mounting a tree nor importing a component that does
 * `import './index.css'` is possible here. Every test below therefore states
 * in its own title what it does and does not prove.
 *
 * What F-10 actually was, since it determines what is worth gating:
 * `.loginBackground` — an empty, purely decorative div — was an in-flow grid
 * item with `height: 100%`, sharing cell 1/1 with `.loginContentWrapper`. The
 * percentage had no definite basis anywhere up the chain
 * (`.App` min-height:100vh + `1fr` row -> `.content` min-height:100% ->
 * `.loginPage` height:100% -> `.loginBackground` height:100%), so WebKit could
 * resolve it either way. One way, everything collapsed to the content height
 * (770px, correct). The other way, this div measured 23323px, became the grid
 * row height, and centred `.loginContentWrapper` at y=11277 — about 11000px
 * below a 768px viewport. The screen the live gate recorded as "blank" was
 * this background image at opacity 0.3 with the real content far below the
 * fold. Measured live; see 34.4.1-F10-DIAGNOSIS.md.
 *
 * The first test is the regression gate and fails against the pre-fix
 * stylesheet.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')

const read = (relPath: string) =>
  stripSourceComments(readFileSync(join(REPO_ROOT, relPath), 'utf8'))

const LOGIN_SCSS = 'src/frontend/screens/Login/index.scss'
const LOGIN_TSX = 'src/frontend/screens/Login/index.tsx'
const APP_TSX = 'src/frontend/App.tsx'
const INDEX_TSX = 'src/frontend/index.tsx'
const LOADING_TSX = 'src/frontend/screens/Loading/index.tsx'
const UPDATE_COMPONENT_TSX = 'src/frontend/components/UI/UpdateComponent/index.tsx'

/**
 * Returns the declaration body of the FIRST top-level rule whose selector
 * matches exactly, e.g. `.loginBackground`. Brace-counted rather than
 * regex-terminated so a nested block cannot end the match early.
 */
function cssBlock(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`)
  if (start === -1) {
    throw new Error(`selector ${selector} not found`)
  }
  let depth = 0
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}') {
      depth--
      if (depth === 0) {
        return source.slice(source.indexOf('{', start) + 1, i)
      }
    }
  }
  throw new Error(`unterminated block for ${selector}`)
}

describe('F-10: the decorative login background must not size the layout', () => {
  it('REGRESSION GATE — .loginBackground is out of flow, so it cannot drive .loginPage height (fails against the pre-fix stylesheet, which had height: 100%)', () => {
    const block = cssBlock(read(LOGIN_SCSS), '.loginBackground')

    expect(block).toMatch(/position:\s*absolute/)

    // The exact pre-fix declarations. Any of them returning puts this div back
    // into the grid's intrinsic sizing and reintroduces the 23323px runaway.
    expect(block).not.toMatch(/(^|[;{\s])height:/)
    expect(block).not.toMatch(/grid-row:/)
    expect(block).not.toMatch(/grid-column:/)
  })

  it('.loginPage stays position: relative, which is what makes the absolute background cover it exactly rather than the viewport', () => {
    // This pairing is the whole fix. If .loginPage loses `position: relative`,
    // `inset: 0` resolves against the initial containing block instead and the
    // background silently detaches from the page it decorates.
    expect(cssBlock(read(LOGIN_SCSS), '.loginPage')).toMatch(
      /position:\s*relative/
    )
  })
})

describe('no pending state on the /login path can present as an empty window', () => {
  it('SOURCE GATE — Login\'s loading branch returns UpdateComponent rather than null (asserts the branch text, not a rendered tree)', () => {
    const source = read(LOGIN_TSX)
    expect(source).toMatch(/if\s*\(loading\)\s*\{\s*return\s*<UpdateComponent\s*\/>/)
  })

  it('SOURCE GATE — UpdateComponent, the thing that loading branch renders, returns visible content and not a fragment or null', () => {
    // Verifying the already-present component this phase never checked: the
    // plan's own point was that if this rendered nothing, "blank screen" would
    // stop being a mystery. It renders an icon plus an optional message.
    const source = read(UPDATE_COMPONENT_TSX)
    expect(source).toMatch(/<div className="UpdateComponent">/)
    expect(source).toMatch(/<FontAwesomeIcon icon=\{faSyncAlt\} \/>/)
  })

  it('SOURCE GATE — the top-level Suspense fallback is Loading, which delegates to UpdateComponent with a message', () => {
    expect(read(INDEX_TSX)).toMatch(/<Suspense fallback=\{<Loading \/>\}>/)

    const loading = read(LOADING_TSX)
    expect(loading).toMatch(/<UpdateComponent message=\{/)
  })

  it('SOURCE GATE — no TEMPORARY F-10 DIAGNOSTIC breadcrumb survives anywhere on the instrumented path', () => {
    // Read raw (not comment-stripped): the breadcrumbs were half comments, and
    // a leftover banner comment means a leftover probe.
    for (const file of [APP_TSX, INDEX_TSX, LOGIN_TSX]) {
      const raw = readFileSync(join(REPO_ROOT, file), 'utf8')
      expect(raw).not.toContain('TEMPORARY F-10 DIAGNOSTIC')
    }
  })
})

describe('a failing route surfaces an error instead of an empty document', () => {
  it('SOURCE GATE — the root route registers an errorElement (there was none in the whole tree before this plan)', () => {
    const source = read(APP_TSX)
    expect(source).toMatch(/errorElement:\s*<RouteErrorSurface \/>/)
  })

  it('SOURCE GATE — RouteErrorSurface renders ErrorComponent, a visible surface, and reads the router error rather than discarding it', () => {
    const source = read(APP_TSX)
    expect(source).toMatch(/function RouteErrorSurface\(\)/)
    expect(source).toMatch(/useRouteError\(\)/)
    expect(source).toMatch(/<ErrorComponent message=/)
  })

  it('SOURCE GATE — makeLazyFunc no longer swallows or re-wraps a rejected chunk import, so the rejection can reach that errorElement', () => {
    const source = read(APP_TSX)
    const start = source.indexOf('function makeLazyFunc(')
    const body = source.slice(start, source.indexOf('const router', start))
    expect(body).not.toMatch(/\.catch\(/)
    expect(body).toMatch(/await importedFile/)
  })
})
