/**
 * Plan 36-01 Task 5: pins the CSS-only crossfade motion between
 * `.loginContentWrapper` and the co-mounted Steam Dialog overlay (Task 3),
 * and the three-way duration agreement between `Dialog.tsx`'s own
 * `transitionDuration={500}`, `Login/index.tsx`'s `STEAM_DIALOG_EXIT_MS`
 * (the deferred-unmount timer), and `Login/index.scss`'s transition
 * duration -- all three MUST stay in lockstep, or the overlay either
 * unmounts before its own exit animation finishes playing, or the login
 * panel's crossfade drifts out of sync with it.
 *
 * SOURCE GATE, NOT A RENDER TEST. This jest project
 * (`src/frontend/jest.config.js`) is `testEnvironment: 'node'` -- there is
 * no browser DOM environment and no component-mounting harness available
 * here. Every assertion below reads a source file with `readFileSync`,
 * strips comments with `stripSourceComments`, and matches text. These prove
 * the SOURCE SHAPE below has the motion WIRED into it -- not anything about
 * a rendered document tree, computed style, cascade resolution, or what a
 * human actually perceives on screen. That is exactly what 36-03's human
 * visual gate exists to confirm; this file cannot see it.
 *
 * FALSIFIABILITY (recorded per assertion in 36-01-SUMMARY.md): every
 * assertion below was confirmed, by a temporary local mutation of the file
 * it guards and then a revert, to actually fail against the mutated shape.
 * Per the executing task's explicit instruction, restoration was verified
 * via a SHA-256 checksum of the pristine file taken before each mutation and
 * compared after each revert -- NOT `git diff --quiet`, which this repo has
 * an open, documented false-negative trap against.
 *
 * Each test is labelled PRESENCE (a specific token must exist) or ABSENCE (a
 * token/shape must NOT exist). No assertion counts occurrences over
 * unstripped source (except the FILLED-specimen guard, deliberately raw).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')

const LOGIN_TSX = 'src/frontend/screens/Login/index.tsx'
const LOGIN_SCSS = 'src/frontend/screens/Login/index.scss'
const DIALOG_TSX = 'src/frontend/components/UI/Dialog/components/Dialog.tsx'

const readRaw = (relPath: string) =>
  readFileSync(join(REPO_ROOT, relPath), 'utf8')

const read = (relPath: string) => stripSourceComments(readRaw(relPath))

describe('36-01 Task 5: the login panel crossfades against the co-mounted Steam overlay', () => {
  it('FILLED-SPECIMEN GUARD (raw, unstripped) -- index.scss actually contains the literal "steamFlowOpen" token, so a broken comment stripper turns every other assertion in this file RED rather than vacuously green', () => {
    const raw = readRaw(LOGIN_SCSS)
    expect(raw).toMatch(/steamFlowOpen/)
  })

  it('SOURCE GATE (PRESENCE) -- .loginPage.steamFlowOpen .loginContentWrapper declares transform, opacity, AND pointer-events by NAME, not just via a landmark selector matching', () => {
    const source = read(LOGIN_SCSS)
    const ruleMatch = source.match(
      /\.loginPage\.steamFlowOpen \.loginContentWrapper\s*\{([^}]*)\}/
    )

    // Breaks if: the rule is removed entirely, or any of the three named
    // properties is dropped from inside it -- checking the properties BY
    // NAME (not just that the selector exists) so a rule that keeps the
    // selector but empties or partially empties its body still fails this.
    expect(ruleMatch).not.toBeNull()
    const ruleBody = ruleMatch?.[1] ?? ''
    expect(ruleBody).toMatch(/transform:\s*translateY\(-100%\)/)
    expect(ruleBody).toMatch(/opacity:\s*0/)
    expect(ruleBody).toMatch(/pointer-events:\s*none/)
  })

  it("SOURCE GATE (PRESENCE) -- .loginContentWrapper itself declares a transition property (a plain, non-!important one, so the app-wide body:has(.disableAnimations) universal-selector override in App.css can always win the cascade and switch the crossfade off)", () => {
    const source = read(LOGIN_SCSS)
    const ruleMatch = source.match(/\.loginContentWrapper\s*\{([^}]*)\}/)

    // Breaks if: the transition property is removed from the base rule
    // (the crossfade would become an instant cut), or it is marked
    // `!important` (which would fight, rather than defer to, the
    // disableAnimations override instead of always losing to it).
    expect(ruleMatch).not.toBeNull()
    const ruleBody = ruleMatch?.[1] ?? ''
    expect(ruleBody).toMatch(/transition:/)
    expect(ruleBody).not.toMatch(/transition:[^;]*!important/)
  })

  it('SOURCE GATE (PRESENCE, three-way agreement) -- Dialog.tsx\'s transitionDuration, Login/index.tsx\'s STEAM_DIALOG_EXIT_MS, and Login/index.scss\'s transition duration are all the SAME extracted numeric value, not three independently-typed literals that happen to currently agree', () => {
    const dialogSource = read(DIALOG_TSX)
    const loginSource = read(LOGIN_TSX)
    const scssSource = read(LOGIN_SCSS)

    const dialogMatch = dialogSource.match(/transitionDuration=\{(\d+)\}/)
    const loginMatch = loginSource.match(/STEAM_DIALOG_EXIT_MS = (\d+)/)
    const scssMatch = scssSource.match(
      /\.loginContentWrapper\s*\{[^}]*transition:\s*transform (\d+)ms/
    )

    // Breaks if: any one of the three sources changes its numeric literal
    // independently of the other two -- this compares the EXTRACTED values
    // against each other (not three separate `.toBe(500)` checks), so a
    // future edit that moves all three to a new but still-agreeing value
    // (e.g. 400) stays green, while any drift that breaks the three-way
    // agreement goes red regardless of which literal moved.
    expect(dialogMatch).not.toBeNull()
    expect(loginMatch).not.toBeNull()
    expect(scssMatch).not.toBeNull()

    const dialogMs = dialogMatch?.[1]
    const loginMs = loginMatch?.[1]
    const scssMs = scssMatch?.[1]

    expect(dialogMs).toBe(loginMs)
    expect(loginMs).toBe(scssMs)
  })

  it('SOURCE GATE (ABSENCE) -- the crossfade is plain CSS: zero startViewTransition, zero prefers-reduced-motion, anywhere in Login/index.tsx or index.scss (locked_decisions: View Transitions API is out of scope; this project has no other prefers-reduced-motion media query and does not introduce one here)', () => {
    const loginSource = read(LOGIN_TSX)
    const scssSource = read(LOGIN_SCSS)

    // Breaks if: a future edit reaches for the View Transitions API or a
    // prefers-reduced-motion media query for this crossfade specifically --
    // both were explicitly rejected in 36-01-PLAN.md's locked_decisions
    // (motion MUST be a plain CSS transition; no prefers-reduced-motion
    // query -- the app-wide disableAnimations toggle in App.css is the
    // single motion-reduction mechanism, and this crossfade must defer to
    // it, not add a second, independent one).
    expect((loginSource.match(/startViewTransition/g) ?? []).length).toBe(0)
    expect((scssSource.match(/startViewTransition/g) ?? []).length).toBe(0)
    expect(
      (loginSource.match(/prefers-reduced-motion/g) ?? []).length
    ).toBe(0)
    expect(
      (scssSource.match(/prefers-reduced-motion/g) ?? []).length
    ).toBe(0)
  })

  it('SOURCE GATE (PRESENCE, F-10 regression guard) -- .loginBackground still declares position: absolute and inset: 0, byte-shape unchanged by the crossfade work (Task 3 was explicitly instructed not to touch it -- F-10 was a live-gate-caught regression the last time this rule moved)', () => {
    const source = read(LOGIN_SCSS)
    const ruleMatch = source.match(/\.loginBackground\s*\{([^}]*)\}/)

    // Breaks if: .loginBackground stops being absolutely positioned or
    // loses its full-bleed inset -- reintroducing F-10 (a percentage-height
    // decorative layer that took part in the grid's intrinsic sizing and
    // rendered the login screen ~11000px below the viewport).
    expect(ruleMatch).not.toBeNull()
    const ruleBody = ruleMatch?.[1] ?? ''
    expect(ruleBody).toMatch(/position:\s*absolute/)
    expect(ruleBody).toMatch(/inset:\s*0/)
  })
})
