/**
 * Phase 40 Plan 06 (D-18/D-20/T-40-06-01): the shared `Dialog` primitive
 * acquires store-embed suppression unconditionally in its component body.
 * `Dialog` only exists in the tree while it is open (there is no
 * closed-but-mounted state), so mounting IS the acquisition -- this single
 * wiring covers every one of the primitive's ~25 consumers (see
 * `dialogWindowChrome.test.ts`'s own census reference), including
 * `LoginWarning` and the adtraction dialog, with no per-call-site work.
 *
 * SOURCE GATE, NOT A RENDER TEST, following `dialogWindowChrome.test.ts`'s
 * established convention in this same directory: this jest project
 * (`src/frontend/jest.config.js`) is `testEnvironment: 'node'`, and
 * `Dialog.tsx` cannot actually be mounted (it renders MUI's `Dialog`,
 * `Paper`, `Slide` and reads `ContextProvider` via `useContext` -- none of
 * which this project's hooks-mocking convention can drive through a real
 * render). Every assertion below reads `Dialog.tsx` with `readFileSync`,
 * strips comments with `stripSourceComments`, and matches text -- proving
 * the call is wired into the source, not that suppression is visually
 * observable at runtime.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..')

const DIALOG_TSX = 'src/frontend/components/UI/Dialog/components/Dialog.tsx'

const readRaw = (relPath: string) =>
  readFileSync(join(REPO_ROOT, relPath), 'utf8')

const read = (relPath: string) => stripSourceComments(readRaw(relPath))

describe('Phase 40 Plan 06: Dialog acquires store-embed suppression unconditionally', () => {
  it('FILLED-SPECIMEN GUARD (raw, unstripped) -- Dialog.tsx actually contains the literal "useSuppressStoreEmbed" token, so a broken comment stripper turns the assertions below RED rather than vacuously green', () => {
    const raw = readRaw(DIALOG_TSX)
    expect(raw).toMatch(/useSuppressStoreEmbed/)
  })

  it('SOURCE GATE (PRESENCE) -- imports useSuppressStoreEmbed from the suppression context module', () => {
    const source = read(DIALOG_TSX)

    // Breaks if: the import is removed, or repointed at a different module.
    expect(source).toMatch(
      /import \{ useSuppressStoreEmbed \} from 'frontend\/components\/UI\/NavShell\/StoreEmbedSuppressionContext'/
    )
  })

  it('SOURCE GATE (PRESENCE) -- useSuppressStoreEmbed() is called at the top level of the component body, alongside its other hooks -- not nested inside a conditional', () => {
    const source = read(DIALOG_TSX)

    // Breaks if: the call is removed, or moved inside an `if`/callback
    // (which would indent it past this exact two-space top-level depth,
    // the same depth `useState`/`useContext` sit at immediately above it).
    expect(source).toMatch(
      /const \{ disableDialogBackdropClose \} = useContext\(ContextProvider\)\n\n {2}useSuppressStoreEmbed\(\)\n/
    )
  })

  it('SOURCE GATE (ABSENCE) -- the call is not gated behind the `open` state (would make suppression release before the closing animation/unmount, or never fire at all)', () => {
    const source = read(DIALOG_TSX)

    expect(source).not.toMatch(/if \(open\)[^{]*\{[^}]*useSuppressStoreEmbed/)
    expect(source).not.toMatch(/open && useSuppressStoreEmbed/)
  })
})
