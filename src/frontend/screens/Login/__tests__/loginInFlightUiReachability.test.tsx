/**
 * F-34.4.2-17 / D-G1 layer (b), REWRITTEN by plan 36-01 Task 4, updated
 * again by quick task 260821-iri Task 3: this file used to pin the OLD
 * mechanism -- unmount-via-navigation -- that made a second store's sign-in
 * control unreachable while one login was in flight. Plan 36-01 replaced
 * that incidental mitigation with an EXPLICIT `loginInFlight` guard
 * (Login/index.tsx) for the Steam flow; quick task 260821-iri extended the
 * SAME guard to Humble. This file now pins BOTH mechanisms as they
 * currently coexist:
 *
 *   - Amazon/GOG/Zoom (no `primaryLoginAction`) still navigate away via
 *     `Runner.handleLogin()` -> `navigate(props.loginUrl)`, still unmounting
 *     the whole `runnerGroup` (assertions 1, 3, 4).
 *   - Steam AND Humble (and Epic-under-Tauri via SIDLogin, out of scope here
 *     per F-36-01) use `primaryLoginAction`, which returns BEFORE the
 *     navigate call -- no navigation, no unmount. Their tiles' disable comes
 *     from the shared `oldMac || loginInFlight` expression now fed to ALL
 *     SIX tiles uniformly (assertion 2), not from unmounting.
 *
 * F-36-01 (accept, DEFERRED): Epic-under-Tauri's SIDLogin path also uses
 * `primaryLoginAction` but is NOT wired into `loginInFlight` -- every
 * universal assertion below is scoped to what the Steam/Humble flows
 * actually changed, not to Epic.
 *
 * SOURCE GATES, NOT RENDER TESTS. This jest project
 * (`src/frontend/jest.config.js`) is `testEnvironment: 'node'` -- there is
 * no browser DOM environment and no component-mounting harness available
 * here. Every assertion below reads a source file with `readFileSync`,
 * strips comments with `stripSourceComments`, and matches text. These prove
 * the SOURCE SHAPE the six-tile Login screen implements, not anything about
 * a rendered document tree or a real live click (T-34.4.2-26 -- a green test
 * suite has never once caught one of this phase's blocking live defects).
 * Human visual verification of the actual overlay/crossfade is 36-03's job,
 * not this file's.
 *
 * DISCHARGE BASIS, STATED HONESTLY: this file does NOT live-discharge
 * T-34.4.2-39/-41, T-36-01, or T-36-02. All stay `mitigate`/`accept` with
 * basis UNIT-PROVEN plus UI-PINNED (this file). A green run proves the
 * source text below has this shape; it proves nothing about what actually
 * renders at runtime.
 *
 * FALSIFIABILITY (recorded per assertion in 36-01-SUMMARY.md): every
 * assertion below was confirmed, by a temporary local mutation of the file
 * it guards and then a revert before commit, to actually fail against the
 * mutated shape. Per the executing task's explicit instruction, restoration
 * was verified via a SHA-256 checksum of the pristine file taken before each
 * mutation and compared after each revert -- NOT `git diff --quiet`, which
 * this repo has an open, documented false-negative trap against. Full
 * mutation text and observed Jest failure output for each assertion is
 * recorded in 36-01-SUMMARY.md.
 *
 * Each test below is individually labelled PRESENCE (a specific token must
 * exist -- the stronger kind, satisfied by fewer unrelated edits) or ABSENCE
 * (a token or shape must NOT exist -- the weaker kind, since many unrelated
 * edits also satisfy an absence). No assertion in this file counts
 * occurrences over unstripped source; every count and match below operates
 * on `stripSourceComments`'s output.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')

const read = (relPath: string) =>
  stripSourceComments(readFileSync(join(REPO_ROOT, relPath), 'utf8'))

const RUNNER_TSX = 'src/frontend/screens/Login/components/Runner/index.tsx'
const LOGIN_TSX = 'src/frontend/screens/Login/index.tsx'
const LOGIN_SCSS = 'src/frontend/screens/Login/index.scss'
const APP_TSX = 'src/frontend/App.tsx'

describe('F-34.4.2-17 / D-G1, 36-01: what makes a second login tile unreachable while one login is in flight', () => {
  it('SOURCE GATE (PRESENCE, strong) -- Runner.handleLogin() guards on props.disabled FIRST, then the primaryLoginAction branch returns BEFORE the no-primaryLoginAction navigate(props.loginUrl) fallback', () => {
    const source = read(RUNNER_TSX)
    const start = source.indexOf('function handleLogin()')
    const end = source.indexOf('function handleAltLogin()')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const body = source.slice(start, end)

    // Breaks if: the disabled guard is removed or moved after the
    // primaryLoginAction check (a disabled tile could still fire its
    // action), or the primaryLoginAction branch's early return is removed
    // (Steam's overlay-open call would fall through into a navigate as
    // well), or the no-primaryLoginAction path stops calling
    // navigate(props.loginUrl).
    const disabledGuardIndex = body.indexOf('if (props.disabled) {\n      return\n    }')
    const primaryActionIndex = body.indexOf('if (props.primaryLoginAction) {')
    const navigateIndex = body.indexOf('navigate(props.loginUrl)')

    expect(disabledGuardIndex).toBeGreaterThan(-1)
    expect(primaryActionIndex).toBeGreaterThan(disabledGuardIndex)
    expect(navigateIndex).toBeGreaterThan(primaryActionIndex)
    expect(body).toMatch(
      /if\s*\(props\.primaryLoginAction\)\s*\{\s*props\.primaryLoginAction\(\)\s*return\s*\}/
    )
  })

  it('SOURCE GATE (PRESENCE, inverted by 36-01) -- disabled={oldMac || loginInFlight} is the exact and ONLY expression fed to every one of the six Runner tiles on the Login screen; this is the explicit ROADMAP-required guard replacing the old incidental unmount-only mitigation. It fails the moment any tile stops carrying the shared guard, or carries a differently-derived one.', () => {
    const source = read(LOGIN_TSX)
    const disabledExpressions = source.match(/disabled=\{[^}]*\}/g) ?? []

    // Breaks if: a Runner tile is added/removed (count moves off 6), or any
    // tile's disabled= expression stops being the literal token
    // `oldMac || loginInFlight` (uniqueness or literal-value check fails).
    expect(disabledExpressions.length).toBe(6)
    expect(new Set(disabledExpressions).size).toBe(1)
    expect(disabledExpressions[0]).toBe('disabled={oldMac || loginInFlight}')
  })

  it('SOURCE GATE (PRESENCE + ABSENCE) -- oldMac itself is still derived solely from a macOS-version check; loginInFlight is a SEPARATE, explicitly named identifier, never folded into oldMac\'s own derivation', () => {
    const source = read(LOGIN_TSX)
    const start = source.indexOf('let oldMac = false')
    const end = source.indexOf('useEffect(')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const body = source.slice(start, end)

    // Breaks if: the macOS-version-check expression is removed or renamed
    // (presence half), or loginInFlight/pending/isLoggingIn-shaped
    // identifiers are folded directly into oldMac's own derivation instead
    // of staying a separately named, separately combined guard (absence
    // half) -- collapsing the two would make the "explicit, separately
    // named guard" claim in Login/index.tsx's own comment false.
    expect(body).toMatch(/systemInfo\?\.OS\.platform === 'darwin'/)
    expect(body).not.toMatch(/loginInFlight|pending|inFlight|isLoggingIn|loginInProgress/i)
  })

  it('SOURCE GATE (PRESENCE) -- exactly one runnerGroup container holds all six tiles, so a non-primaryLoginAction tile\'s navigation still unmounts every tile at once, not just the one clicked', () => {
    const source = read(LOGIN_TSX)
    const matches = source.match(/runnerGroup/g) ?? []

    // Breaks if: a second runnerGroup-named container is introduced (the
    // "one shared container" claim would no longer hold), the container is
    // renamed, or any of the six tile class markers goes missing. Note this
    // no longer covers Steam's own unreachability -- Steam's tile stays
    // in-tree and reachable-in-principle after being clicked, protected only
    // by the explicit loginInFlight guard pinned above, not by unmount.
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

  it('SOURCE GATE (PRESENCE + ABSENCE, 36-01) -- loginweb/:runner remains a SIBLING route of login (still true for Amazon/GOG/Zoom/Humble), while loginweb/steam is gone from the router entirely -- Steam no longer has a route at all, only the co-mounted overlay', () => {
    const source = read(APP_TSX)
    const routesStart = source.indexOf('const router = createHashRouter([')
    const routesEnd = source.indexOf('export default function App()')
    expect(routesStart).toBeGreaterThan(-1)
    expect(routesEnd).toBeGreaterThan(routesStart)
    const routesBody = source.slice(routesStart, routesEnd)

    // Breaks if: either remaining route is removed or renamed (presence
    // half), a second createHashRouter/route-tree root is introduced (the
    // "same single router tree" claim would no longer hold), the ordering
    // moves login/loginweb:runner outside the root path's own children
    // array, or the loginweb/steam route is reintroduced anywhere in the
    // file (absence half -- this is the literal regression Task 2 removes).
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

    expect((source.match(/loginweb\/steam/g) ?? []).length).toBe(0)
  })

  it('SOURCE GATE (ABSENCE, load-bearing for the inert argument) -- Runner\'s tiles carry zero tabIndex, zero <button, zero <a -- they are bare untabbable divs, which is WHY a container-level inert (pinned below) protects the two genuinely-focusable controls it wraps without needing to also fight a tabIndex lock', () => {
    const source = read(RUNNER_TSX)

    // Breaks if: any tile becomes a real focusable element (a <button>, an
    // <a>, or a div with an explicit tabIndex) -- at that point the
    // "disabled prop is the primary JS layer, inert is near-zero-impact for
    // tiles specifically" analysis in 36-01-PLAN.md's
    // verified_guard_layer_analysis would no longer hold, and the retired
    // tabIndex lock would need to be reconsidered, not left dropped.
    expect((source.match(/\btabIndex\b/g) ?? []).length).toBe(0)
    expect((source.match(/<button/g) ?? []).length).toBe(0)
    expect((source.match(/<a\s/g) ?? []).length).toBe(0)
  })

  it('SOURCE GATE (PRESENCE, paired ABSENCE, 36-01, selector renamed by 260821-iri) -- .loginContentWrapper carries the React-18 string-form inert literal and the scss carries pointer-events: none for the same loginFlowOpen state, while Login/index.tsx carries neither tabIndex nor aria-hidden anywhere', () => {
    const tsxSource = read(LOGIN_TSX)
    const scssSource = read(LOGIN_SCSS)

    // Presence half: the exact React-18 string-form literal (boolean
    // `inert={true}` is React-19-only and this project pins react@^18.3.1 --
    // a boolean form here would silently no-op), and the CSS layer that
    // backs it up for the pointer-events case specifically. The selector was
    // renamed steamFlowOpen -> loginFlowOpen by quick task 260821-iri Task 3
    // (Login/index.scss) when the overlay lifecycle generalised beyond
    // Steam-only; this assertion follows that rename so it does not go RED
    // against the current source shape.
    expect(tsxSource).toContain("inert={loginInFlight ? '' : undefined}")
    expect(scssSource).toMatch(
      /\.loginPage\.loginFlowOpen \.loginContentWrapper\s*\{[^}]*pointer-events:\s*none/
    )

    // Absence half: tabIndex was an operator-dropped lock (36-01-PLAN.md
    // locked_decisions) and must not be reinstated; aria-hidden was
    // explicitly rejected because .loginContentWrapper wraps two genuinely
    // focusable descendants (LanguageSelector, goToLibrary) and aria-hidden
    // over focusable descendants is an ARIA violation. Both reappearing here
    // would silently reintroduce a rejected design.
    expect((tsxSource.match(/\btabIndex\b/g) ?? []).length).toBe(0)
    expect((tsxSource.match(/aria-hidden/g) ?? []).length).toBe(0)
  })
})
