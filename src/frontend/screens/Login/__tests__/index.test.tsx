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
 * `.App .content` carried `min-height: 100%` while sitting in `.App`'s `1fr`
 * grid row. The percentage resolves against that row's height, but the row is
 * `1fr`, so its height derives from what `.content` contributes — a circular
 * dependency. The spec says resolve it to `auto`; WebKit instead feeds the
 * result back and converges on garbage. Measured live under WKWebView,
 * `.App`'s used `grid-template-rows` came out `0px 23323.0625px 0px` on a
 * 768px viewport, with `.content`'s `min-height` still reporting the literal
 * unresolved string `100%`. The fractional `.0625` is the fingerprint of an
 * iterative solve rather than a content-derived height.
 *
 * Everything downstream then inherited 23323px, and `.loginContentWrapper`
 * (vertically centred) landed at y=11277 — roughly 11000px below the fold.
 * The window the live gate recorded as "blank" was the login screen rendering
 * perfectly, far off-screen. Because the failure depends on the order WebKit
 * happens to resolve the cycle in, it reproduced intermittently and defeated
 * several plausible-but-wrong theories (boot timing, viewport size,
 * navigation count) before being measured. See 34.4.1-F10-DIAGNOSIS.md.
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
const APP_CSS = 'src/frontend/App.css'
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

describe('F-10: no percentage height may resolve against .App\'s 1fr row', () => {
  it('REGRESSION GATE — .App .content declares no percentage min-height (this is the declaration that caused F-10; fails against the pre-fix stylesheet)', () => {
    const block = cssBlock(read(APP_CSS), '.App .content')

    // `min-height: 100%` here is the cycle. `min-height: 0` or an absolute
    // length would be fine, so gate the percentage specifically rather than
    // the property -- an over-broad gate would block a legitimate future fix.
    expect(block).not.toMatch(/min-height:\s*[\d.]+%/)
  })

  it('.App still guarantees at least a viewport-tall shell, so removing that min-height did not trade a runaway for a collapse', () => {
    // The deleted declaration was redundant, not load-bearing: `.content` is a
    // grid item and defaults to `align-self: stretch`, so it fills the `1fr`
    // row, and the row is at least viewport-tall because of this. If this
    // min-height ever goes away, the redundancy argument goes with it.
    expect(cssBlock(read(APP_CSS), '.App')).toMatch(/min-height:\s*100vh/)
  })

  it('SECONDARY HARDENING (not the F-10 fix) — .loginBackground stays out of flow so a decorative layer cannot contribute intrinsic height', () => {
    // Honest scope: this was committed as the F-10 fix and did NOT fix it --
    // the blank screen reproduced with this already in place. It is retained
    // because a purely decorative layer participating in intrinsic sizing is a
    // real fragility, not because it closed the bug.
    const block = cssBlock(read(LOGIN_SCSS), '.loginBackground')
    expect(block).toMatch(/position:\s*absolute/)
    expect(block).not.toMatch(/(^|[;{\s])height:/)
  })

  it('.loginPage stays position: relative, which is what makes the absolute background cover it exactly rather than the viewport', () => {
    // If .loginPage loses `position: relative`, `inset: 0` resolves against the
    // initial containing block instead and the background silently detaches
    // from the page it decorates.
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

/**
 * Quick task 260805-d62: colour the interactive legendary/SID login red as
 * deletion-pending (ROADMAP Phase 34.7). Same source-gate convention as above --
 * this jest project has no jsdom, so these prove the wiring EXPRESSION is present
 * and singular, not that a pixel actually renders red. Pixel/behavior verification
 * is the plan's checkpoint:human-verify task.
 */
describe('deprecatedTile marker follows the SIDLogin tile, not a fixed position (quick task 260805-d62)', () => {
  it('SOURCE GATE — the Epic Runner wires deprecatedTile to the isTauri() ternary that names the SIDLogin tile in both shells', () => {
    const source = read(LOGIN_TSX)
    expect(source).toMatch(
      /deprecatedTile=\{isTauri\(\) \? 'primary' : 'alternative'\}/
    )
  })

  it("SOURCE GATE — deprecatedTile occurs exactly once in comment-stripped Login/index.tsx -- no other runner is marked", () => {
    const source = read(LOGIN_TSX)
    const matches = source.match(/deprecatedTile/g) ?? []
    expect(matches.length).toBe(1)
  })

  it('SOURCE GATE — the Epic primaryLoginAction/alternativeLoginAction expressions from the F-34.5-G6-01 pivot are unchanged', () => {
    const source = read(LOGIN_TSX)
    expect(source).toMatch(
      /primaryLoginAction=\{\s*isTauri\(\) \? \(\) => setShowSidLogin\(true\) : undefined\s*\}/
    )
    expect(source).toMatch(
      /alternativeLoginAction=\{\s*isTauri\(\)\s*\?\s*\(\) => navigate\(epicLoginPath\)\s*:\s*\(\) => setShowSidLogin\(true\)\s*\}/
    )
  })

  it('login.deprecated_hint exists in the en translation bundle and matches the Runner t() default exactly', () => {
    const translations = JSON.parse(
      readFileSync(
        join(REPO_ROOT, 'public/locales/en/translation.json'),
        'utf8'
      )
    )
    expect(translations.login.deprecated_hint).toBe(
      'Deprecated — this sign-in method is scheduled for removal'
    )
  })
})

// Quick task 260805-rwy: remove the "Login with your platform..." paragraph
// from the Manage Accounts page. Same source-gate convention as above -- this
// jest project has no jsdom, so these prove the source text is gone (or
// present) rather than anything about a rendered tree.
describe('the login.message paragraph is gone from the Manage Accounts page (quick task 260805-rwy)', () => {
  it('SOURCE GATE — comment-stripped Login/index.tsx contains no loginMessage, login.message, runnerMessage, or the removed sentence', () => {
    const source = read(LOGIN_TSX)
    expect(source).not.toMatch(/loginMessage/)
    expect(source).not.toMatch(/login\.message/)
    expect(source).not.toMatch(/runnerMessage/)
    expect(source).not.toContain(
      'You can login to more than one platform'
    )
  })

  it('POSITIVE CONTROL — the disabledMessage paragraph, runnerGroup container, and all six runner tiles survived the removal', () => {
    const source = read(LOGIN_TSX)
    expect(source).toMatch(
      /\{oldMac && <p className="disabledMessage">/
    )
    expect(source).toMatch(/<div className="runnerGroup">/)
    for (const runnerClass of [
      'epic',
      'gog',
      'nile',
      'zoom',
      'steam',
      'humble'
    ]) {
      expect(source).toMatch(
        new RegExp(`class="${runnerClass}"`)
      )
    }
  })
})
