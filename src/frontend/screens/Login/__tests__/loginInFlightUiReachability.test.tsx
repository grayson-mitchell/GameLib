/**
 * F-34.4.2-17 / D-G1 layer (b): pins the frontend behaviour that actually
 * prevents a second store's sign-in control from being clicked while
 * another login is in flight, so withdrawing gate item 5 (RERUN-4) does not
 * leave T-34.4.2-39/-41 with a silent regression path.
 *
 * SOURCE GATES, NOT RENDER TESTS. This jest project
 * (`src/frontend/jest.config.js`) is `testEnvironment: 'node'` -- there is
 * no browser DOM environment and no component-mounting harness available
 * here. Every assertion below reads a source file with `readFileSync`,
 * strips comments with `stripSourceComments`, and matches text. These prove
 * the SOURCE SHAPE the six-tile Login screen implements, not anything about
 * a rendered document tree or a real live click.
 *
 * MECHANISM, AS DERIVED FROM SOURCE (not assumed) -- this CORRECTS the
 * "the frontend disables/clears the other login buttons while one login is
 * in flight" characterisation recorded in `deferred-items.md` and
 * `ROADMAP.md`. That characterisation is WRONG. What the source actually
 * does, confirmed by direct inspection at plan 34.4.2-22 execution time:
 *
 *   1. Every one of the six Runner tiles on the Login screen
 *      (`Login/index.tsx`) passes `disabled={oldMac}` and NOTHING else --
 *      `oldMac` derives solely from a macOS-major-version check
 *      (`systemInfo?.OS.platform === 'darwin'` and version < 12). No
 *      login-in-flight, pending-login, or is-logging-in state feeds
 *      `disabled` anywhere in this file. Clicking Amazon does not disable
 *      or grey out the Humble tile -- it stays exactly as clickable as it
 *      was a moment before.
 *   2. `Runner.handleLogin()` (`Runner/index.tsx`), for every tile with no
 *      `primaryLoginAction` (the GOG/Amazon/Steam/Zoom/Humble shape --
 *      Epic under Tauri is the sole exception via `primaryLoginAction`, out
 *      of scope here per this phase's own Epic-deferred boundary), calls
 *      `navigate(props.loginUrl)` -- a full React Router navigation.
 *   3. `loginweb/:runner` is registered as a SIBLING route of `login`
 *      itself, inside the same top-level `children` array of the same
 *      `createHashRouter` tree (`App.tsx`) -- not a nested or overlay
 *      route. React Router therefore UNMOUNTS the whole `NewLogin`
 *      component -- and with it the single `runnerGroup` container holding
 *      all six tiles -- and mounts the WebView screen in its place.
 *
 * So the reason a second store's sign-in control is unreachable during
 * Amazon's ~7-8s nile spawn delay is not that Humble's button became
 * disabled -- it is that clicking Amazon's tile NAVIGATES AWAY from the
 * screen the Humble tile lives on, taking every tile with it at once. A
 * future document citing this mechanism should say "clicking a login tile
 * navigates away from the Login screen, unmounting every tile including the
 * one the user would otherwise click next" -- not "disables/clears the
 * other login buttons."
 *
 * DISCHARGE BASIS, STATED HONESTLY: this file does NOT live-discharge
 * T-34.4.2-39 (spoofing -- an unrequested second login sheet) or
 * T-34.4.2-41 (denial of service -- a single-flight latch that never
 * clears). Both stay `mitigate` with basis UNIT-PROVEN (plan 14's
 * mutation-proven guard-ordering test,
 * `src/backend/__tests__/tauriShellSource.test.ts`, untouched by this file)
 * PLUS UI-PINNED (this file). Neither threat is, or will be after D-G1
 * withdraws gate item 5, LIVE-DISCHARGED by this phase's gate. A green run
 * of this file proves the source text below has this shape; it proves
 * nothing about what actually renders or what a real click actually does at
 * runtime (T-34.4.2-26 -- a green test suite has never once caught one of
 * this phase's blocking live defects).
 *
 * FALSIFIABILITY (recorded per pin, per this phase's own regression-gate
 * register): every assertion below was confirmed, by a temporary local
 * mutation of the file it guards and then reverted before commit, to
 * actually fail against the mutated shape -- see 34.4.2-22-SUMMARY.md for
 * each mutation performed and the observed failure message. What NO
 * source-text gate in this file can ever catch: a behaviour change made in
 * a file this suite does not read, or a runtime state change that leaves
 * the source text of these three files byte-identical (for example, a new
 * state variable that happens to always evaluate to `false` at the moment
 * it is read). Each test below is individually labelled PRESENCE (a
 * specific token must exist -- the stronger kind, satisfied by fewer
 * unrelated edits) or ABSENCE (a token or shape must NOT exist -- the
 * weaker kind, since many unrelated edits also satisfy an absence). No
 * assertion in this file counts occurrences over unstripped source; every
 * count and match below operates on `stripSourceComments`'s output.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')

const read = (relPath: string) =>
  stripSourceComments(readFileSync(join(REPO_ROOT, relPath), 'utf8'))

const RUNNER_TSX = 'src/frontend/screens/Login/components/Runner/index.tsx'
const LOGIN_TSX = 'src/frontend/screens/Login/index.tsx'
const APP_TSX = 'src/frontend/App.tsx'

describe('F-34.4.2-17 / D-G1: what actually makes a second login tile unreachable while one login is in flight', () => {
  it('SOURCE GATE (PRESENCE, strong) -- Runner.handleLogin(), for the no-primaryLoginAction shape (Amazon/GOG/Steam/Zoom/Humble), terminates by calling navigate(props.loginUrl). This proves the literal call sequence is in the function body, not that a real click occurred or that a screen actually changed.', () => {
    const source = read(RUNNER_TSX)
    const start = source.indexOf('function handleLogin()')
    const end = source.indexOf('function handleAltLogin()')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const body = source.slice(start, end)

    // Breaks if: the primaryLoginAction branch's early return is removed, or
    // the no-primaryLoginAction path stops calling navigate(props.loginUrl)
    // -- either would change what actually happens when the Humble/Amazon/
    // GOG/Steam/Zoom tile is clicked.
    expect(body).toMatch(
      /if\s*\(props\.primaryLoginAction\)\s*\{\s*props\.primaryLoginAction\(\)\s*return\s*\}\s*navigate\(props\.loginUrl\)/
    )
  })

  it('SOURCE GATE (ABSENCE, weak -- stated explicitly) -- disabled={oldMac} is the exact and ONLY expression fed to every one of the six Runner tiles on the Login screen; no other identifier or expression is ever passed as disabled=. This is the pin that matters most: it fails the moment anyone introduces a login-in-flight disable, which is precisely the change that would alter whether a UI-driven single-flight scenario becomes performable again -- forcing a deliberate re-derivation of this file rather than a silent drift. An absence assertion is weaker than a presence one (many unrelated edits also leave a set at size 1), which is why the presence-style count/uniqueness check below is paired with it.', () => {
    const source = read(LOGIN_TSX)
    const disabledExpressions = source.match(/disabled=\{[^}]*\}/g) ?? []

    // Breaks if: a Runner tile is added/removed (count moves off 6), or any
    // tile's disabled= expression stops being the literal token `oldMac`
    // (uniqueness or literal-value check fails) -- e.g. a login-in-flight
    // state variable feeding even one tile's disabled prop.
    expect(disabledExpressions.length).toBe(6)
    expect(new Set(disabledExpressions).size).toBe(1)
    expect(disabledExpressions[0]).toBe('disabled={oldMac}')
  })

  it('SOURCE GATE (PRESENCE + ABSENCE) -- oldMac itself is derived solely from a macOS-version check, never from a login/pending/in-flight state variable', () => {
    const source = read(LOGIN_TSX)
    const start = source.indexOf('let oldMac = false')
    const end = source.indexOf('useEffect(')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const body = source.slice(start, end)

    // Breaks if: the macOS-version-check expression is removed or renamed
    // (presence half), or a login/pending/in-flight-shaped identifier is
    // introduced into oldMac's own derivation (absence half).
    expect(body).toMatch(/systemInfo\?\.OS\.platform === 'darwin'/)
    expect(body).not.toMatch(/pending|inFlight|isLoggingIn|loginInProgress/i)
  })

  it('SOURCE GATE (PRESENCE) -- exactly one runnerGroup container holds all six tiles, so unmounting it (via the navigation pinned above) takes every tile at once, not just the one that was clicked', () => {
    const source = read(LOGIN_TSX)
    const matches = source.match(/runnerGroup/g) ?? []

    // Breaks if: a second runnerGroup-named container is introduced (the
    // "one shared container" claim would no longer hold), the container is
    // renamed, or any of the six tile class markers goes missing.
    expect(matches.length).toBe(1)
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

  it('SOURCE GATE (PRESENCE) -- loginweb/:runner is registered as a SIBLING route of login itself, inside the same top-level children array of the same single router tree -- confirming navigate(loginUrl) replaces the Login screen rather than overlaying it', () => {
    const source = read(APP_TSX)
    const routesStart = source.indexOf('const router = createHashRouter([')
    const routesEnd = source.indexOf('export default function App()')
    expect(routesStart).toBeGreaterThan(-1)
    expect(routesEnd).toBeGreaterThan(routesStart)
    const routesBody = source.slice(routesStart, routesEnd)

    // Breaks if: either route is removed or renamed (presence half), a
    // second createHashRouter/route-tree root is introduced (the "same
    // single router tree" claim would no longer hold), or the ordering
    // moves login/loginweb:runner outside the root path's own children
    // array (they would no longer be siblings).
    expect((source.match(/createHashRouter\(/g) ?? []).length).toBe(1)
    expect((routesBody.match(/errorElement:/g) ?? []).length).toBe(1)

    const rootPathIndex = routesBody.indexOf("path: '/'")
    const catchAllIndex = routesBody.indexOf("path: '*'")
    const loginIndex = routesBody.indexOf("path: 'login'")
    const loginwebRunnerIndex = routesBody.indexOf(
      "path: 'loginweb/:runner'"
    )

    expect(rootPathIndex).toBeGreaterThan(-1)
    expect(loginIndex).toBeGreaterThan(rootPathIndex)
    expect(loginwebRunnerIndex).toBeGreaterThan(loginIndex)
    expect(catchAllIndex).toBeGreaterThan(loginwebRunnerIndex)
  })
})
