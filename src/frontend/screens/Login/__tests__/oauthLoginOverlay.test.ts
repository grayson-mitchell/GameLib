/**
 * Quick task 261003-s04: pins the shared `OAuthLogin` overlay (GOG, Epic
 * (legendary) and Amazon (nile) all mount the SAME component, parameterised
 * by `runner`) and its wiring into `Login/index.tsx`, mirroring the
 * already-shipped Steam/Humble overlay pattern instead of routing to the
 * loginweb path for its runner.
 *
 * SOURCE GATE, NOT A RENDER TEST. This jest project
 * (`src/frontend/jest.config.js`) is `testEnvironment: 'node'` -- there is no
 * browser DOM environment and no component-mounting harness available here.
 * Every assertion below reads a source file with `readFileSync`, strips
 * comments with `stripSourceComments`, and matches text against the result.
 * These prove the SOURCE SHAPE below has the wiring described -- not
 * anything about a rendered document tree, a real `useTauriOAuthLogin`
 * state transition, a real native sign-in window, or what an operator
 * actually sees. That is exactly what Task 2's eleven-question live gate
 * exists to confirm; this file cannot see any of it.
 *
 * FALSIFIABILITY (recorded per assertion in 261003-s04-SUMMARY.md): every
 * assertion below was confirmed, by a temporary local mutation of the file
 * it guards and then a revert, to actually fail against the mutated shape.
 * Restoration was verified via a SHA-256 checksum of the pristine file taken
 * before each mutation and compared after each revert -- NOT
 * `git diff --quiet`, which this repo has a documented false-negative trap
 * against.
 *
 * Each test is labelled PRESENCE (a specific token must exist) or ABSENCE (a
 * token/shape must NOT exist).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')

const OAUTH_LOGIN_TSX =
  'src/frontend/screens/Login/components/OAuthLogin/index.tsx'
const LOGIN_TSX = 'src/frontend/screens/Login/index.tsx'
const WEBVIEW_INDEX_TSX = 'src/frontend/screens/WebView/index.tsx'

const readRaw = (relPath: string) =>
  readFileSync(join(REPO_ROOT, relPath), 'utf8')

const read = (relPath: string) => stripSourceComments(readRaw(relPath))

// Mirrors Login/__tests__/index.test.tsx's `epicRunnerBlock()`: slice a
// runner's tile props from its `class="<name>"` marker to the next
// `<Runner`, so an assertion about one tile's props cannot pass by matching
// a sibling tile that happens to carry the same prop.
function runnerBlock(source: string, className: string): string {
  const startMarker = `class="${className}"`
  const start = source.indexOf(startMarker)
  expect(start).toBeGreaterThan(-1)
  const rest = source.slice(start)
  const nextRunner = rest.indexOf('<Runner', 1)
  return nextRunner === -1 ? rest : rest.slice(0, nextRunner)
}

describe('261003-s04 Task 1: OAuthLogin renders the Dialog only behind the phase gate', () => {
  it('FILLED-SPECIMEN GUARD (raw, unstripped) -- OAuthLogin/index.tsx actually contains the literal "useTauriOAuthLogin" token, so a broken comment stripper turns every other assertion in this file RED rather than vacuously green', () => {
    const raw = readRaw(OAUTH_LOGIN_TSX)
    expect(raw).toMatch(/useTauriOAuthLogin/)
  })

  it('SOURCE GATE (PRESENCE) -- useTauriOAuthLogin( is called in OAuthLogin/index.tsx', () => {
    const source = read(OAUTH_LOGIN_TSX)

    // Breaks if: the hook call is removed or renamed.
    expect(source).toMatch(/useTauriOAuthLogin\(/)
  })

  it("SOURCE GATE (PRESENCE) -- exactly one <Dialog, mounted ONLY behind all four Dialog-rendering phase literals ('preparing', 'blocked', 'error', 'timeout'), never hoisted above any of them", () => {
    const source = read(OAUTH_LOGIN_TSX)

    // Breaks if: a second <Dialog is added, or the phase-literal membership
    // set is declared (or referenced) AFTER the <Dialog JSX -- which would
    // mean the Dialog no longer sits strictly behind the phase gate.
    const dialogIndex = source.indexOf('<Dialog')
    expect(dialogIndex).toBeGreaterThan(-1)
    expect((source.match(/<Dialog[\s>]/g) ?? []).length).toBe(1)

    for (const phase of ['preparing', 'blocked', 'error', 'timeout']) {
      const phaseIndex = source.indexOf(`'${phase}'`)
      expect(phaseIndex).toBeGreaterThan(-1)
      expect(dialogIndex).toBeGreaterThan(phaseIndex)
    }
  })

  it('SOURCE GATE (PRESENCE, region) -- the DIALOG_PHASES set body holds exactly four quoted literals, and they are exactly the four expected -- without this, re-adding a fifth phase only reorders the index comparisons above and could stay green (quick task 261003-u48)', () => {
    const source = read(OAUTH_LOGIN_TSX)

    const setStart = source.indexOf('new Set([')
    expect(setStart).toBeGreaterThan(-1)
    const setEnd = source.indexOf('])', setStart)
    expect(setEnd).toBeGreaterThan(setStart)
    const setBody = source.slice(setStart, setEnd)

    const literals = setBody.match(/'[a-z]+'/g) ?? []
    expect(literals).toEqual([
      "'preparing'",
      "'blocked'",
      "'error'",
      "'timeout'"
    ])
  })

  it("SOURCE GATE (ABSENCE) -- zero occurrences of the 'awaiting' literal and zero occurrences of the 'finalizing' literal: a native sign-in window is on screen during 'awaiting', so a panel behind it is the bede817fd regression D-3 forbids; 'finalizing' was moved out of the Dialog set by quick task 261003-u48's amendment to D-3, on duration grounds ('idle' is deliberately not gated this way -- it is the hook's own initial/post-success value and may legitimately be named in a guard)", () => {
    const source = read(OAUTH_LOGIN_TSX)

    expect((source.match(/'awaiting'/g) ?? []).length).toBe(0)
    expect((source.match(/'finalizing'/g) ?? []).length).toBe(0)
  })

  it('SOURCE GATE (PRESENCE) -- useSuppressStoreEmbed() is called directly, because the Dialog (which acquires suppression by mounting) is absent for most of the overlay life', () => {
    const source = read(OAUTH_LOGIN_TSX)

    expect(source).toMatch(/useSuppressStoreEmbed\(\)/)
  })

  it('SOURCE GATE (PRESENCE) -- TauriLoginPanel is rendered with the live hook state', () => {
    const source = read(OAUTH_LOGIN_TSX)

    expect(source).toMatch(
      /<TauriLoginPanel runner=\{runner\} state=\{state\} \/>/
    )
  })

  it('SOURCE GATE (PRESENCE, D-2) -- the success and cancel handlers are built with useCallback closing on an EMPTY dependency array, reading the latest dismiss (and completion payload handling) from a ref -- a future "cleanup" that inlines either handler re-runs the capture effect mid-login and burns a single-use OAuth code', () => {
    const source = read(OAUTH_LOGIN_TSX)

    // Breaks if: EITHER useCallback gains a non-empty dependency array -- the
    // empty-array count is required to equal the total useCallback count (2),
    // not just "at least one", so mutating only the success handler's array
    // (leaving the cancel handler's alone) still goes red -- or the
    // dismissRef identifier is removed in favour of closing over `dismiss`
    // directly.
    const totalUseCallbacks = (source.match(/useCallback\(/g) ?? []).length
    expect(totalUseCallbacks).toBe(2)
    const emptyDepUseCallbacks = (
      source.match(
        /useCallback\(\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\},\s*\[\]\s*\)/g
      ) ?? []
    ).length
    expect(emptyDepUseCallbacks).toBe(totalUseCallbacks)
    expect(source).toMatch(/dismissRef/)
    expect(source).toMatch(/dismissRef\.current = dismiss/)
  })

  it('SOURCE GATE (ABSENCE, D-5) -- zero router-navigation calls and zero page-reload calls: dismiss is the only exit, and Retry stays single-sourced in TauriLoginPanel', () => {
    const source = read(OAUTH_LOGIN_TSX)

    expect((source.match(/useNavigate\(/g) ?? []).length).toBe(0)
    expect((source.match(/navigate\(/g) ?? []).length).toBe(0)
    expect((source.match(/location\.reload\(/g) ?? []).length).toBe(0)
  })

  it("SOURCE GATE (PRESENCE) -- OAUTH_OVERLAY_RUNNERS exists in Login/index.tsx and contains 'gog'", () => {
    const source = read(LOGIN_TSX)

    const tupleMatch = source.match(/OAUTH_OVERLAY_RUNNERS = \[([^\]]*)\]/)
    expect(tupleMatch).not.toBeNull()
    expect(tupleMatch?.[1]).toMatch(/'gog'/)
  })

  it("SOURCE GATE (PRESENCE, per-tile) -- the GOG tile carries BOTH primaryLoginAction={() => openLoginOverlay('gog')} and loginUrl={gogLoginPath} (the loginUrl half is load-bearing: LoginWarning and Humble/Keys still navigate to that route)", () => {
    const source = read(LOGIN_TSX)
    const gogBlock = runnerBlock(source, 'gog')

    expect(gogBlock).toMatch(
      /primaryLoginAction=\{\(\) => openLoginOverlay\('gog'\)\}/
    )
    expect(gogBlock).toMatch(/loginUrl=\{gogLoginPath\}/)
  })

  it('SOURCE GATE (PRESENCE, regression guard, read-only file) -- the login-pathname arm of WebView/index.tsx still returns TauriLoginPanel with runner and oauthLoginState, so a later edit cannot blank the loginweb routes', () => {
    const source = read(WEBVIEW_INDEX_TSX)

    expect(source).toMatch(/isLoginPathname\(pathname\)/)
    expect(source).toMatch(
      /<TauriLoginPanel runner=\{runner\} state=\{oauthLoginState\} \/>/
    )
  })
})

describe('261003-s04 Task 2: the Epic and Amazon tiles join GOG on the overlay, and Zoom stays excluded', () => {
  it("SOURCE GATE (PRESENCE + ABSENCE) -- OAUTH_OVERLAY_RUNNERS contains exactly the three OAuth overlay runner ids (legendary, gog, nile) and does NOT carry the Zoom, Steam or Humble ids -- D-7's Zoom exclusion is a decision, so a silent widening must go red", () => {
    const source = read(LOGIN_TSX)

    const tupleMatch = source.match(/OAUTH_OVERLAY_RUNNERS = \[([^\]]*)\]/)
    expect(tupleMatch).not.toBeNull()
    const tupleBody = tupleMatch?.[1] ?? ''

    expect(tupleBody).toMatch(/'legendary'/)
    expect(tupleBody).toMatch(/'gog'/)
    expect(tupleBody).toMatch(/'nile'/)
    expect(tupleBody).not.toMatch(/'zoom'/)
    expect(tupleBody).not.toMatch(/'steam'/)
    expect(tupleBody).not.toMatch(/'humble'/)
  })

  it("SOURCE GATE (PRESENCE, per-tile) -- the Epic tile carries BOTH primaryLoginAction={() => openLoginOverlay('legendary')} and loginUrl={epicLoginPath}", () => {
    const source = read(LOGIN_TSX)
    const epicBlock = runnerBlock(source, 'epic')

    expect(epicBlock).toMatch(
      /primaryLoginAction=\{\(\) => openLoginOverlay\('legendary'\)\}/
    )
    expect(epicBlock).toMatch(/loginUrl=\{epicLoginPath\}/)
  })

  it("SOURCE GATE (PRESENCE, per-tile) -- the Amazon tile carries BOTH primaryLoginAction={() => openLoginOverlay('nile')} and loginUrl={amazonLoginPath}", () => {
    const source = read(LOGIN_TSX)
    const amazonBlock = runnerBlock(source, 'nile')

    expect(amazonBlock).toMatch(
      /primaryLoginAction=\{\(\) => openLoginOverlay\('nile'\)\}/
    )
    expect(amazonBlock).toMatch(/loginUrl=\{amazonLoginPath\}/)
  })

  it('SOURCE GATE (PRESENCE, count) -- the comment-stripped Login/index.tsx contains exactly five primaryLoginAction= occurrences (epic, gog, nile, steam, humble), proving the Zoom exclusion without a region-scoped negative grep whose own subject appears throughout the file', () => {
    const source = read(LOGIN_TSX)

    expect((source.match(/primaryLoginAction=/g) ?? []).length).toBe(5)
  })

  it('SOURCE GATE (PRESENCE) -- the Zoom tile slice still carries loginUrl={zoomLoginPath} (D-7: Zoom stays on its route)', () => {
    const source = read(LOGIN_TSX)
    const zoomBlock = runnerBlock(source, 'zoom')

    expect(zoomBlock).toMatch(/loginUrl=\{zoomLoginPath\}/)
  })
})

describe('261003-u48 Task 2: five tiles carry the per-tile busy derivation, Zoom carries none', () => {
  it.each([
    ['epic', 'legendary'],
    ['gog', 'gog'],
    ['nile', 'nile'],
    ['steam', 'steam'],
    ['humble', 'humble']
  ])(
    "SOURCE GATE (PRESENCE, per-tile) -- the %s tile carries busy={openOverlay === '%s'}, derived per tile from the overlay identity -- never the screen-wide loginInFlight flag (D-3)",
    (className, overlayId) => {
      const source = read(LOGIN_TSX)
      const block = runnerBlock(source, className)

      expect(block).toContain(`busy={openOverlay === '${overlayId}'}`)
    }
  )

  it('SOURCE GATE (ABSENCE, per-tile, D-2) -- the Zoom tile slice carries NO occurrence of the busy prop at all: the comparison does not type-check against LoginOverlay, and would be permanently false regardless since Zoom navigates away and unmounts before anything could spin', () => {
    const source = read(LOGIN_TSX)
    const zoomBlock = runnerBlock(source, 'zoom')

    expect((zoomBlock.match(/\bbusy=/g) ?? []).length).toBe(0)
  })

  it('SOURCE GATE (PRESENCE, count) -- the comment-stripped Login/index.tsx contains exactly five busy= occurrences (epic, gog, nile, steam, humble), proving the Zoom exclusion without a region-scoped negative grep whose own subject appears throughout the file -- a sixth tile wired by mistake goes red wherever it is written', () => {
    const source = read(LOGIN_TSX)

    expect((source.match(/\bbusy=/g) ?? []).length).toBe(5)
  })

  it('SOURCE GATE (ABSENCE, D-3) -- zero occurrences of the busy prop assigned the screen-wide loginInFlight flag: busy must always compare openOverlay against a specific runner id, never read the screen-wide flag directly', () => {
    const source = read(LOGIN_TSX)

    expect((source.match(/\bbusy=\{loginInFlight\}/g) ?? []).length).toBe(0)
  })

  it('SOURCE GATE (PRESENCE, positive control re-stated locally) -- the file\'s disabled= expressions still number six and still reduce to one distinct string, so a future "simplification" that folds the visual busy flag into the concurrency guard fails in the suite that introduced the visual flag', () => {
    const source = read(LOGIN_TSX)
    const disabledExpressions = source.match(/disabled=\{[^}]*\}/g) ?? []

    expect(disabledExpressions.length).toBe(6)
    expect(new Set(disabledExpressions).size).toBe(1)
    expect(disabledExpressions[0]).toBe('disabled={oldMac || loginInFlight}')
  })
})
