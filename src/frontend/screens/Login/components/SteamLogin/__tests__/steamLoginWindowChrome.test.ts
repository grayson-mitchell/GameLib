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

/**
 * Quick task 260820-u29: fixes two cosmetic defects recorded in
 * `36-03-SUMMARY.md`, both pre-existing in the Steam sign-in form and both
 * newly visible now that the form presents as a centred window:
 *
 * 1. The `Username & Password` tab label clips because `<Tabs>` uses
 *    `variant="scrollable" scrollButtons="auto"`, which reserves space for
 *    scroll buttons instead of letting the row size to fit two tabs.
 * 2. The window changes height at the instant the QR code renders, because
 *    nothing reserves the QR panel's space beforehand.
 *
 * SOURCE GATE, NOT A RENDER TEST -- see the file-header note above. This
 * jest project is `testEnvironment: 'node'`; nothing here can see clipping,
 * a resize, or any cascade outcome. Only the plan's Task 4 human gate can.
 */

describe('quick-260820-u29: SteamLogin tabs size to fit their labels, and the QR panel does not resize when the code lands', () => {
  it('FILLED-SPECIMEN GUARD (raw, unstripped) -- index.scss actually contains the literal "steamQrContainer" token, so a broken comment stripper turns every other scss assertion in this block RED rather than vacuously green', () => {
    const raw = readRaw(STEAM_LOGIN_SCSS)
    expect(raw).toMatch(/steamQrContainer/)
  })

  it('SOURCE GATE (PRESENCE) -- Tabs uses variant="fullWidth" so exactly two tabs size to fill the row instead of clipping', () => {
    const source = read(STEAM_LOGIN_TSX)

    // Breaks if: the Tabs element reverts to variant="scrollable" (or drops
    // fullWidth entirely), which is the exact prior shape that let the
    // longer "Username & Password" label clip.
    expect(source).toMatch(/variant="fullWidth"/)
  })

  it('SOURCE GATE (ABSENCE) -- the scrollable variant and its scroll-button prop are both gone, not just one of them', () => {
    const source = read(STEAM_LOGIN_TSX)

    // Breaks if: either token is reintroduced. scrollButtons is meaningless
    // outside the scrollable/auto variants, so leaving it behind inert would
    // be a silent half-revert.
    expect((source.match(/scrollButtons/g) ?? []).length).toBe(0)
    expect((source.match(/variant="scrollable"/g) ?? []).length).toBe(0)
  })

  it('SOURCE GATE (ABSENCE) -- the styleless .tabsWrapper div is deleted from both the component and its stylesheet, not given a new rule', () => {
    const tsxSource = read(STEAM_LOGIN_TSX)
    const scssSource = read(STEAM_LOGIN_SCSS)

    // Breaks if: .tabsWrapper is reintroduced anywhere in either file. This
    // class had no reachable rule for this screen -- its only definition is
    // nested under `.wineManager` in WineManager/index.css -- which is why
    // it was deleted rather than given a scoped rule of its own.
    expect((tsxSource.match(/tabsWrapper/g) ?? []).length).toBe(0)
    expect((scssSource.match(/tabsWrapper/g) ?? []).length).toBe(0)
  })

  it('SOURCE GATE (ABSENCE) -- the old computed min-height reservation (commit 4df8c4395) is gone, not left behind alongside the new fixed-size box', () => {
    const source = read(STEAM_LOGIN_SCSS)

    // Breaks if: the #tabpanel-qr > div min-height rule is reintroduced.
    // That rule's arithmetic assumed line-height: normal for the
    // surrounding <p> metrics, which the operator's re-run proved
    // imprecise (a smaller resize still occurred) -- it was replaced with a
    // structural fix below, not re-tuned, so it must not come back.
    expect(source).not.toContain('#tabpanel-qr > div')
    expect(source).not.toContain('min-height: 310px')
  })

  it('SOURCE GATE (PRESENCE) -- the QR box is a fixed-size element that holds either the spinner or the QR code, so swapping its child never changes its footprint', () => {
    const source = read(STEAM_LOGIN_SCSS)

    // Breaks if: `.steamQrBox`'s literal width/height changes or is
    // removed -- both the loading spinner and the QR code render inside
    // this exact class (index.tsx), so a footprint that depends on which
    // child is present would let the resize this whole task fixes return.
    expect(source).toMatch(/\.steamQrBox\s*\{[^}]*width:\s*216px/)
    expect(source).toMatch(/\.steamQrBox\s*\{[^}]*height:\s*216px/)
  })

  it('SOURCE GATE (PRESENCE) -- the QR svg is forced to display:block, removing the inline baseline gap that would otherwise make the QR-holding box taller than the spinner-holding one', () => {
    const source = read(STEAM_LOGIN_SCSS)

    // Breaks if: this rule is removed. react-qr-code emits a bare inline
    // <svg> with no display of its own, which otherwise adds an
    // unpredictable descender gap on top of the QR's own 200px height --
    // still load-bearing under the new fixed-size .steamQrBox, since that
    // gap would make the qr-active box taller than the loading box.
    expect(source).toMatch(/\.steamQrContainer svg\s*\{[^}]*display:\s*block/)
  })

  it('SOURCE GATE (PRESENCE) -- the loading and qr-active QR-tab states are one merged branch, not two separately-shaped ones', () => {
    const source = read(STEAM_LOGIN_TSX)

    // Breaks if: the merged `isQRLoading || (step === 'qr-active' &&
    // challengeUrl)` condition is split back into two branches with
    // different DOM shapes -- the exact prior structure whose differing
    // shape caused the resize this fix removes.
    expect(source).toMatch(/isQRLoading \|\| \(step === 'qr-active' && challengeUrl\)/)
    expect((source.match(/className="steamQrBox"/g) ?? []).length).toBe(1)
  })

  it('SOURCE GATE (PRESENCE) -- both QR-tab captions set an explicit lineHeight instead of relying on the browser default the removed arithmetic assumed', () => {
    const source = read(STEAM_LOGIN_TSX)

    // Breaks if: either `lineHeight: 1.4` is removed -- falling back to
    // `line-height: normal` reintroduces the exact font-metric guess the
    // operator's re-run proved was imprecise.
    expect((source.match(/lineHeight: 1\.4/g) ?? []).length).toBe(2)
  })

  it('SOURCE GATE (PRESENCE) -- all three existing QR-tab captions are reused verbatim, not replaced with new copy, keeping the i18n gate\'s expectedCount stable', () => {
    const source = read(STEAM_LOGIN_TSX)

    expect(source).toContain('Generating QR code...')
    expect(source).toContain('QR code refreshes automatically.')
    expect(source).toContain('Open Steam on your phone and scan this code.')
  })

  it('SOURCE GATE (PRESENCE) -- the unselected tab label uses a theme token, not the MUI light-mode default that is unreadable on dark themes', () => {
    const source = read(STEAM_LOGIN_SCSS)

    // Breaks if: `.steamLoginBody .MuiTab-root`'s color declaration is
    // removed or reverts to relying on MUI's own default (rgba(0,0,0,0.6)
    // in light mode, which App.tsx's paletteless createTheme() falls back
    // to) -- the exact defect the operator reported across midnightMirage,
    // gruvbox_dark, and dracula.
    expect(source).toMatch(/\.steamLoginBody \.MuiTab-root\s*\{[^}]*color:\s*var\(--text-secondary\)/)
  })

  it('SOURCE GATE (PRESENCE) -- the selected tab and its hover state use a REAL, defined theme token (--text-default), not the dead --text-primary token WineManager uses', () => {
    const source = read(STEAM_LOGIN_SCSS)

    // Breaks if: either rule is removed, or `--text-default` is swapped for
    // `--text-primary` -- verified (grep -rn -- "--text-primary:"
    // src/frontend) to be defined NOWHERE in this codebase, so using it here
    // would silently fall back to inherited color rather than fixing anything.
    expect(source).toMatch(/\.steamLoginBody \.MuiTab-root\.Mui-selected\s*\{[^}]*color:\s*var\(--text-default\)/)
    expect(source).toMatch(/\.steamLoginBody \.MuiTab-root:hover:not\(\.Mui-selected\)\s*\{[^}]*color:\s*var\(--text-default\)/)
  })

  it('SOURCE GATE (PRESENCE) -- the selected-tab indicator uses the theme accent token instead of MUI\'s hardcoded default primary colour', () => {
    const source = read(STEAM_LOGIN_SCSS)

    // Breaks if: this rule is removed, leaving the indicator to fall back to
    // MUI's own theme.palette.primary.main -- a hardcoded literal, not a
    // theme token, matching DownloadManager/index.css and
    // GamesSettings/index.scss's identical scoping of this same rule.
    expect(source).toMatch(/\.steamLoginBody \.MuiTabs-indicator\s*\{[^}]*background-color:\s*var\(--accent\)/)
  })

  it('SOURCE GATE (ABSENCE) -- none of the new tab-colour rules reference the dead --text-primary token', () => {
    const source = read(STEAM_LOGIN_SCSS)

    // Breaks if: --text-primary is reintroduced anywhere in this stylesheet
    // -- it is defined nowhere in the codebase (verified by repo-wide grep),
    // so any reliance on it silently no-ops rather than fixing readability.
    expect((source.match(/--text-primary/g) ?? []).length).toBe(0)
  })

  it('SOURCE GATE (PRESENCE) -- the fixed-width .steamLoginBody centres itself instead of relying on Paper to have zero slack', () => {
    const source = read(STEAM_LOGIN_SCSS)

    // Breaks if: margin-inline: auto is removed from .steamLoginBody -- this
    // is what self-corrects the QR-code-off-centre report ("too far to the
    // left") regardless of exactly what produces the slack space (leading
    // hypothesis: Paper's own scroll="paper" overflow-y:auto scrollbar,
    // unconfirmed by live measurement this session) -- a hardcoded offset
    // would have assumed a specific cause and specific px amount instead.
    expect(source).toMatch(/\.steamLoginBody\s*\{[^}]*margin-inline:\s*auto/)
  })
})
