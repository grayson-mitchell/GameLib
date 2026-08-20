/**
 * Quick task 260820-kq0: pins the single-Dialog-window-shell shape that gives
 * the Steam sign-in surface the same windowed presentation as Humble/GOG/
 * Amazon (a centred, backdropped, titled, dismissible modal) instead of the
 * old bare `.steamLoginPanel` box rendered flush in the content area.
 *
 * SOURCE GATE, NOT A RENDER TEST. This jest project
 * (`src/frontend/jest.config.js`) is `testEnvironment: 'node'` — there is no
 * browser DOM environment and no component-mounting harness available here.
 * Every assertion below reads `SteamLogin/index.tsx` (and, for one absence
 * check, `index.scss`) with `readFileSync`, strips comments with
 * `stripSourceComments`, and matches text. These prove the SOURCE SHAPE the
 * component implements, not anything about a rendered document tree or what
 * a human actually sees on screen — that is what the plan's Task 3 human
 * visual gate exists to confirm; this file cannot see it.
 *
 * No assertion in this file counts occurrences over unstripped source
 * (except the FILLED-specimen guard, which is deliberately raw — see below);
 * every count and match otherwise operates on `stripSourceComments`'s
 * output. Each test is labelled PRESENCE (a specific token must exist —
 * satisfied by fewer unrelated edits) or ABSENCE (a token/shape must NOT
 * exist — weaker, since many unrelated edits also satisfy an absence).
 *
 * FALSIFIABILITY (recorded per assertion in 260820-kq0-SUMMARY.md): every
 * assertion below was confirmed, by a temporary local mutation of
 * `SteamLogin/index.tsx` (or `index.scss`) and then a revert before commit,
 * to actually fail against the mutated shape. Full mutation text and the
 * observed Jest failure output for each is recorded in the SUMMARY, with the
 * mutated file confirmed restored via `git diff --quiet` before the next
 * mutation began.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..', '..')

const STEAM_LOGIN_TSX =
  'src/frontend/screens/Login/components/SteamLogin/index.tsx'
const STEAM_LOGIN_SCSS =
  'src/frontend/screens/Login/components/SteamLogin/index.scss'

const readRaw = (relPath: string) =>
  readFileSync(join(REPO_ROOT, relPath), 'utf8')

const read = (relPath: string) => stripSourceComments(readRaw(relPath))

describe('quick-260820-kq0: SteamLogin renders inside a single shared Dialog window shell', () => {
  it('FILLED-SPECIMEN GUARD (raw, unstripped) -- index.tsx actually contains the literal "Dialog" token, so a broken comment stripper turns every other assertion in this file RED rather than vacuously green', () => {
    const raw = readRaw(STEAM_LOGIN_TSX)
    expect(raw).toMatch(/Dialog/)
  })

  it('SOURCE GATE (PRESENCE) -- the component imports the shared window primitive Dialog/DialogHeader from the UI barrel', () => {
    const source = read(STEAM_LOGIN_TSX)

    // Breaks if: the import is removed, renamed, or the path changes away
    // from the shared UI Dialog barrel.
    expect(source).toMatch(
      /import \{[^}]*\bDialog\b[^}]*\} from 'frontend\/components\/UI\/Dialog'/
    )
    expect(source).toMatch(/\bDialogHeader\b/)
  })

  it('SOURCE GATE (PRESENCE + uniqueness) -- the window is mounted exactly once, so it cannot be re-created (and replay its entrance transition) as `step` changes', () => {
    const source = read(STEAM_LOGIN_TSX)
    const dialogElements = source.match(/<Dialog[\s>]/g) ?? []

    // Breaks if: a future edit re-splits the component back into per-`step`
    // early-return Dialogs, reintroducing the entrance-transition replay
    // finding 3 of the plan warns against.
    expect(dialogElements.length).toBe(1)
  })

  it('SOURCE GATE (PRESENCE) -- the dialog is dismissible via a single closeWindow handler wired to Dialog\'s own close control', () => {
    const source = read(STEAM_LOGIN_TSX)

    // Breaks if: the close button is hidden (showCloseButton stops being
    // literal `true`), or the dialog's onClose stops routing through the one
    // shared closeWindow handler.
    expect(source).toMatch(/showCloseButton=\{true\}/)
    expect(source).toMatch(/onClose=\{closeWindow\}/)
    // 36-01: closeWindow no longer navigates the router away from the
    // overlay -- it delegates to the `dismiss` callback prop supplied by
    // Login/index.tsx, which clears steamFlowOpen synchronously and defers
    // the actual unmount so the Dialog's own exit transition can play.
    expect(source).toContain('const closeWindow = () => dismiss()')
  })

  it('SOURCE GATE (PRESENCE) -- 36-01: SteamLogin is dismissed via a `dismiss` callback prop, not a router navigation', () => {
    const source = read(STEAM_LOGIN_TSX)

    // Breaks if: the component signature stops destructuring `dismiss` from
    // its Props (e.g. reverts to a bare `SteamLogin()` with no dismissal
    // callback, or renames the prop).
    expect(source).toMatch(/export default function SteamLogin\(\{\s*dismiss\s*\}: Props\)/)
  })

  it('SOURCE GATE (ABSENCE) -- 36-01: no react-router navigation remains anywhere in the overlay -- dismissal is entirely callback-driven', () => {
    const source = read(STEAM_LOGIN_TSX)

    // Breaks if: any call site (or the import that would make one possible)
    // reintroduces navigate('/login') as a dismissal path -- the exact
    // regression Login/index.tsx's new loginInFlight guard and deferred
    // unmount are built to replace.
    expect((source.match(/\bnavigate\(/g) ?? []).length).toBe(0)
    expect((source.match(/\buseNavigate\b/g) ?? []).length).toBe(0)
  })

  it('SOURCE GATE (PRESENCE, census) -- closeWindow has exactly one definition and exactly three non-calling consumers (Class C), matching the verified 8-site dismissal census', () => {
    const source = read(STEAM_LOGIN_TSX)

    // Class A: the one definition itself.
    expect((source.match(/const closeWindow = \(\) => dismiss\(\)/g) ?? []).length).toBe(1)

    // Class C: sites that reference (rather than call) closeWindow -- the
    // "Return to Login" click handler, the Dialog's own onClose, and
    // DialogHeader's onClose (the last of these is structurally inert dead
    // code -- DialogHeader destructures only `children` -- and must stay
    // that way, not be "fixed").
    const consumerSites =
      (source.match(/onClick=\{closeWindow\}/g) ?? []).length +
      (source.match(/onClose=\{closeWindow\}/g) ?? []).length
    expect(consumerSites).toBe(3)

    // Total identifier occurrences: 1 definition + 4 Class B calls + 3 Class
    // C consumers = 8, the plan's full verified dismissal census for this
    // file.
    expect((source.match(/closeWindow/g) ?? []).length).toBe(8)
  })

  it('SOURCE GATE (ABSENCE) -- the old bare, unadorned panel root is gone from both the component and its stylesheet', () => {
    const tsxSource = read(STEAM_LOGIN_TSX)
    const scssSource = read(STEAM_LOGIN_SCSS)

    // Breaks if: a `steamLoginPanel` class or rule is reintroduced anywhere
    // in either file -- which would double up chrome now supplied by the
    // dialog paper, or resurrect the bare top-left box the plan removes.
    expect((tsxSource.match(/steamLoginPanel/g) ?? []).length).toBe(0)
    expect((scssSource.match(/steamLoginPanel/g) ?? []).length).toBe(0)
  })

  it('SOURCE GATE (PRESENCE) -- all three top-level render branches (not-installed, checking, main tabs) funnel through exactly one renderWindowBody() declaration and exactly one call site', () => {
    const source = read(STEAM_LOGIN_TSX)

    // Breaks if: renderWindowBody is removed (the three branches would need
    // to go back to being separate early returns, each needing its own
    // Dialog mount), or a second call site is introduced (which would mean
    // the body is being rendered more than once).
    expect(source).toMatch(/function renderWindowBody\(\)/)
    expect((source.match(/renderWindowBody\(/g) ?? []).length).toBe(2)
  })

  // Round 2 (human gate FAIL on 2a, sharp corners) briefly fixed this HERE,
  // scoped to only the Steam dialog, via a `.MuiDialog-paper.steamLoginDialog`
  // compound selector in SteamLogin/index.scss. Round 3: the operator
  // overrode that scope decision ("fix the primitive properly for all of
  // them") -- the Steam-scoped rule was removed from index.scss, and the
  // radius + entrance-transition fix now lives in the shared primitive
  // itself (`frontend/components/UI/Dialog`), covered by
  // `Dialog/__tests__/dialogWindowChrome.test.ts`. This file keeps only the
  // SteamLogin-specific shape assertions (single mount, dismissal wiring,
  // dead-panel absence, render-branch funnel).
})
