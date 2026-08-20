/**
 * Quick task 260820-kq0, round 3: the operator overrode the round-2 scope
 * lock ("fix the primitive properly for all of them") -- the Steam-dialog-
 * only fix (a `.MuiDialog-paper.steamLoginDialog` compound selector in
 * SteamLogin/index.scss) was removed, and the corner-radius +
 * entrance-transition fix now lives in the shared Dialog primitive itself,
 * so it applies to all 25 consumers (see 260820-kq0-SUMMARY.md for the
 * census), not just Steam's login window.
 *
 * SOURCE GATE, NOT A RENDER TEST. This jest project
 * (`src/frontend/jest.config.js`) is `testEnvironment: 'node'` -- there is
 * no browser DOM environment and no component-mounting harness available
 * here. Every assertion below reads `Dialog.tsx` with `readFileSync`,
 * strips comments with `stripSourceComments`, and matches text. These prove
 * the SOURCE SHAPE the primitive implements -- that a radius override and a
 * directional transition are WIRED into the JSX/style objects -- not
 * anything about a rendered document tree, computed style, cascade
 * resolution, or what a human actually sees on screen. Whether the radius
 * rule actually wins the cascade at runtime and whether the transition is
 * actually perceptible is exactly what the plan's human visual gate (now
 * covering the Steam login window plus at least two other dialogs from the
 * consumer census) exists to confirm; this file cannot see it.
 *
 * Every count and match operates on `stripSourceComments`'s output (except
 * the FILLED-specimen guard, which is deliberately raw -- see below). Each
 * test is labelled PRESENCE (a specific token must exist) or ABSENCE (a
 * token/shape must NOT exist).
 *
 * FALSIFIABILITY (recorded per assertion in 260820-kq0-SUMMARY.md): every
 * assertion below was confirmed, by a temporary local mutation of
 * `Dialog.tsx` and then a restore before commit, to actually fail against
 * the mutated shape. Mutation text and observed Jest failure output for
 * each is recorded in the SUMMARY, with the mutated file confirmed restored
 * (byte-for-byte, verified via `diff`) before the next mutation began.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..')

const DIALOG_TSX =
  'src/frontend/components/UI/Dialog/components/Dialog.tsx'

const readRaw = (relPath: string) =>
  readFileSync(join(REPO_ROOT, relPath), 'utf8')

const read = (relPath: string) => stripSourceComments(readRaw(relPath))

describe('quick-260820-kq0 round 3: the shared Dialog primitive carries a rounded paper and a perceptible entrance transition', () => {
  it('FILLED-SPECIMEN GUARD (raw, unstripped) -- Dialog.tsx actually contains the literal "Slide" token, so a broken comment stripper turns every other assertion in this file RED rather than vacuously green', () => {
    const raw = readRaw(DIALOG_TSX)
    expect(raw).toMatch(/Slide/)
  })

  it('SOURCE GATE (PRESENCE) -- MUI\'s Slide transition is imported from the shared @mui/material barrel', () => {
    const source = read(DIALOG_TSX)

    // Breaks if: the Slide import is removed or renamed away.
    expect(source).toMatch(
      /import \{[^}]*\bSlide\b[^}]*\} from '@mui\/material'/
    )
  })

  it('SOURCE GATE (PRESENCE) -- StyledPaper (the PaperComponent every Dialog consumer renders through) sets a 10px border radius, replacing the dead .Dialog__element rule at the primitive so every consumer inherits it, not just one caller', () => {
    const source = read(DIALOG_TSX)

    // Breaks if: the radius override is removed from StyledPaper, or its
    // value drifts from 10px (the value the dead .Dialog__element rule and
    // every other literal radius in this codebase already use).
    expect(source).toMatch(/const StyledPaper = styled\(Paper\)/)
    const styledPaperBlock = source.split('const StyledPaper')[1]?.split(')))')[0]
    expect(styledPaperBlock).toMatch(/borderRadius:\s*'10px'/)
  })

  it("SOURCE GATE (PRESENCE) -- MuiDialog is wired to a directional Slide transition (not the library default Fade) at a 500ms duration", () => {
    const source = read(DIALOG_TSX)

    // Breaks if: TransitionComponent stops pointing at the Slide-based
    // wrapper, the wrapper stops rendering <Slide direction="up">, or the
    // duration drifts away from the dead rule's 500ms.
    expect(source).toMatch(/TransitionComponent=\{SlideUpTransition\}/)
    expect(source).toMatch(/<Slide direction="up"/)
    expect(source).toMatch(/transitionDuration=\{500\}/)
  })

  it('SOURCE GATE (PRESENCE) -- the Slide wrapper forwards its ref, which MUI requires for a custom TransitionComponent to work at all', () => {
    const source = read(DIALOG_TSX)

    // Breaks if: SlideUpTransition stops being built with forwardRef, which
    // would make MUI's Dialog transition callbacks silently fail to attach.
    expect(source).toMatch(
      /const SlideUpTransition = forwardRef\(function SlideUpTransition/
    )
  })

  it('SOURCE GATE (ABSENCE) -- no second, competing backdrop is introduced alongside MUI\'s own .MuiBackdrop-root (BackdropComponent/BackdropProps stay unset on MuiDialog)', () => {
    const source = read(DIALOG_TSX)

    // Breaks if: a BackdropComponent or BackdropProps prop is added to
    // MuiDialog, which combined with the dead .Dialog__element::backdrop /
    // box-shadow hack (if ever revived) would double up the dimming layer.
    expect(source).not.toMatch(/BackdropComponent/)
    expect(source).not.toMatch(/BackdropProps/)
  })

  it('SOURCE GATE (ABSENCE) -- .Dialog__element is never applied as a literal className anywhere in this component (only referenced, dead, inside a comment)', () => {
    const source = read(DIALOG_TSX)

    // Breaks if: a future edit applies `.Dialog__element` directly to the
    // Paper/root (e.g. via `className="Dialog__element"` or
    // `PaperProps={{ className: 'Dialog__element' }}`) -- since that class's
    // visible state in index.css is gated on `:popover-open`/`[open]`,
    // pseudo-states a plain rendered element can never match, doing so
    // would make the dialog permanently invisible (opacity: 0 forever).
    expect(source).not.toMatch(/className[^}]*Dialog__element/)
  })
})
