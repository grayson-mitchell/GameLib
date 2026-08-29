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
const UPDATE_COMPONENT_TSX =
  'src/frontend/components/UI/UpdateComponent/index.tsx'

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

describe("F-10: no percentage height may resolve against .App's 1fr row", () => {
  it('REGRESSION GATE — .App .content declares no percentage min-height (this is the declaration that caused F-10; fails against the pre-fix stylesheet)', () => {
    const block = cssBlock(read(APP_CSS), '.App .content')

    // `min-height: 100%` here is the cycle. `min-height: 0` or an absolute
    // length would be fine, so gate the percentage specifically rather than
    // the property -- an over-broad gate would block a legitimate future fix.
    expect(block).not.toMatch(/min-height:\s*[\d.]+%/)
  })

  it('.App still guarantees a viewport-tall shell, so removing that min-height did not trade a runaway for a collapse', () => {
    // Updated by 34.10-18 (F-34.10-06): `.App` no longer uses
    // `min-height: 100vh` with an auto (unbounded) height -- that shape let
    // `.App` grow past the viewport for tall routes, which is precisely why
    // `document.body` had to be the page's scroll container, which in turn
    // is why the navbar could scroll away and why body's scrollbar drew over
    // it (F-34.10-06). `.App` is now FIXED at `height: 100vh` with
    // `overflow: hidden`, and `.App .content` (not `.App` itself) is the
    // scroll container -- see appShellLayout.test.ts for that half. `height`
    // is a strictly stronger viewport-tall guarantee than the old
    // `min-height` was (it can no longer grow past the viewport at all), so
    // this assertion still guards against the collapse this test's own name
    // describes; only the property changed, not the guarantee.
    expect(cssBlock(read(APP_CSS), '.App')).toMatch(/height:\s*100vh/)
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
  it("SOURCE GATE — Login's loading branch returns UpdateComponent rather than null (asserts the branch text, not a rendered tree)", () => {
    const source = read(LOGIN_TSX)
    expect(source).toMatch(
      /if\s*\(loading\)\s*\{\s*return\s*<UpdateComponent\s*\/>/
    )
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
 * Quick task 260822-r3g (2026-08-22) — REVERTS the F-34.5-G6-01 Epic tile pivot and
 * SUPERSEDES the 260805-d62 / 260808-f80 deletion-pending marker gates that used to live
 * here.
 *
 * History in one paragraph, because these gates only make sense against it: the pivot made
 * SIDLogin Epic's PRIMARY tile under Tauri (so "Epic Games Login" named the system-browser
 * device-auth path) and demoted the embedded WebKit login to "Alternative Login Method",
 * because the embedded login hit Talon's anti-bot 403. d62 then outlined one tile red as
 * deletion-pending for ROADMAP Phase 34.7 -- and pointed at the wrong action, corrected by
 * f80. The 403 was subsequently defeated by the pristine (zero-injection) WKWebView login
 * window and the embedded login now completes a fresh logged-out sign-in on macOS, so the
 * operator reverted the roles: the embedded login is the primary "Epic Games Login" tile in
 * both shells again, SIDLogin is the alternative, Phase 34.7 is ON HOLD, and no tile is
 * marked for deletion.
 *
 * These gates therefore assert the RESTORED shape plus the ABSENCE of every expression the
 * pivot introduced, so a silent re-pivot fails loudly. Same source-gate convention as above
 * -- this jest project has no jsdom, so they prove the wiring EXPRESSION, never a rendered
 * pixel; which tile a user actually sees first is a live-verification question (that is
 * exactly how f80's inversion was caught).
 */
describe('Epic login tiles: embedded login is PRIMARY, SIDLogin is the alternative (quick task 260822-r3g)', () => {
  // The Epic Runner's own props, sliced off at the next `<Runner` so no other
  // store's tile can satisfy -- or violate -- an assertion below.
  const epicRunnerBlock = () => {
    const source = read(LOGIN_TSX)
    const start = source.indexOf('class="epic"')
    expect(start).toBeGreaterThan(-1)
    const end = source.indexOf('<Runner', start)
    expect(end).toBeGreaterThan(start)
    return source.slice(start, end)
  }

  it('SOURCE GATE — the Epic PRIMARY tile is the embedded web login: labelled login.epic and navigating to epicLoginPath, with NO primaryLoginAction to divert it', () => {
    const block = epicRunnerBlock()
    expect(block).toMatch(
      /buttonText=\{t\('login\.epic', 'Epic Games Login'\)\}/
    )
    expect(block).toMatch(/loginUrl=\{epicLoginPath\}/)
    // Breaks the moment anything is wired to hijack the primary tile away from
    // `navigate(loginUrl)` -- which is precisely what the reverted pivot did.
    expect(block).not.toMatch(/primaryLoginAction/)
  })

  it('SOURCE GATE — SIDLogin is the ALTERNATIVE tile, unconditionally, in both shells', () => {
    const block = epicRunnerBlock()
    expect(block).toMatch(
      /alternativeLoginAction=\{\(\) => setShowSidLogin\(true\)\}/
    )
  })

  it('SOURCE GATE — the Epic tile carries NO shell branch: Login/index.tsx neither imports nor calls a Tauri-context check, so both shells get identical tile roles', () => {
    const source = read(LOGIN_TSX)
    // Phase 35 plan 17: generalized from a literal-named-predicate search (the same
    // predicate this repo-wide-deleted) to an import-site check — this is what lets the
    // gate keep catching ANY future shell-detection reference reintroduced here, not
    // just one spelled the same way the deleted predicate was.
    expect(source).not.toMatch(/tauriTransport/)
  })

  it('SOURCE GATE — neither superseded deprecatedTile ternary can return, and no runner on this screen is marked deletion-pending while Phase 34.7 is on hold', () => {
    const source = read(LOGIN_TSX)
    // Structural, not name-specific (Phase 35 plan 17): matches a `deprecatedTile`
    // ternary keyed off ANY condition, not only one literally named after the deleted
    // predicate — a regression reintroducing this shape under a different condition name
    // must still fail.
    expect(source).not.toMatch(
      /deprecatedTile=\{[^}]*\?\s*'alternative'\s*:\s*'primary'\}/
    )
    expect(source).not.toMatch(
      /deprecatedTile=\{[^}]*\?\s*'primary'\s*:\s*'alternative'\}/
    )
    const matches = source.match(/deprecatedTile/g) ?? []
    expect(matches.length).toBe(0)
  })

  it('login.deprecated_hint exists in the en translation bundle and matches the Runner t() default exactly (the marker prop is unused but retained -- 34.7 is on hold, not cancelled)', () => {
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
    expect(source).not.toContain('You can login to more than one platform')
  })

  it('POSITIVE CONTROL — the disabledMessage paragraph, runnerGroup container, and all six runner tiles survived the removal', () => {
    const source = read(LOGIN_TSX)
    expect(source).toMatch(/\{oldMac && <p className="disabledMessage">/)
    expect(source).toMatch(/<div className="runnerGroup">/)
    for (const runnerClass of [
      'epic',
      'gog',
      'nile',
      'zoom',
      'steam',
      'humble'
    ]) {
      expect(source).toMatch(new RegExp(`class="${runnerClass}"`))
    }
  })
})
