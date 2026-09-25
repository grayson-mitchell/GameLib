/**
 * Structural gate: `useStoreEmbedHost` is the ONLY opener of the singleton
 * store embed (quick `260925-gnp`, REQ-43-24).
 *
 * WHY THIS EXISTS. `useStoreEmbedHost.ts:17-22` already declares itself the
 * single geometry oracle, in a comment, in writing, with the reasoning spelt
 * out — and a second opener shipped anyway. `HumbleKeyRow` called
 * `window.api.storeEmbedOpen()` from inside a row, with no host route and no
 * slot, so nothing sized or showed the native subview it created and the
 * button was completely dead (`43-UAT.md` item 8, `major`). A prose invariant
 * with nothing asserting it is a convention, not a contract. This file is the
 * assertion.
 *
 * SCOPE, and why it is `storeEmbedOpen` rather than `storeEmbedSetBounds`.
 * The hook's own comment names `storeEmbedSetBounds` as the thing it owns,
 * which is why the original defect was arguable on its literal terms: the row
 * called `storeEmbedOpen`, not `setBounds`. That ambiguity is precisely what
 * let it through review, so this gate covers OPENING — the operation that
 * needs a host lifecycle behind it — and not just bounds.
 *
 * COMMENTS ARE STRIPPED FIRST, and that is load-bearing, not tidiness. A bare
 * grep for `storeEmbedOpen` across `src/frontend` returns THREE files today
 * and exactly ONE is a call: the other two are the comments left behind at the
 * fix site explaining why the call is gone. A census that counts its own
 * explanatory prose reports a violation that does not exist, and the fix
 * someone reaches for is deleting the gate.
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const FRONTEND_ROOT = join(__dirname, '..', '..', '..')

/** The one file permitted to open the embed, relative to `src/frontend`. */
const SOLE_OPENER = 'screens/WebView/useStoreEmbedHost.ts'

const CALL = 'storeEmbedOpen'

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      // `__tests__` are excluded: a test may legitimately reference or mock
      // the call by name, and asserting over test sources would make this
      // gate fire on its own text.
      if (entry === '__tests__' || entry === '__mocks__') continue
      sourceFiles(full, out)
      continue
    }
    if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

function openersIn(files: string[]): string[] {
  return files
    .filter((file) =>
      stripSourceComments(readFileSync(file, 'utf8')).includes(CALL)
    )
    .map((file) => relative(FRONTEND_ROOT, file))
    .sort()
}

describe('the store embed has exactly one opener', () => {
  it(`only ${SOLE_OPENER} calls ${CALL}`, () => {
    expect(openersIn(sourceFiles(FRONTEND_ROOT))).toEqual([SOLE_OPENER])
  })

  it('a bare grep would report more — proving the comment strip is doing work', () => {
    // Direct evidence for the paragraph in this file's header. If this ever
    // drops to 1, the explanatory comments at the fix site were deleted and
    // the next person loses the reason the row stopped opening the embed.
    const raw = sourceFiles(FRONTEND_ROOT).filter((file) =>
      readFileSync(file, 'utf8').includes(CALL)
    )
    expect(raw.length).toBeGreaterThan(1)
  })

  it('non-vacuity: a second opener IS caught by the same predicate this gate relies on', () => {
    // The control. Without it, a `stripSourceComments` that returned '' for
    // everything would make the first test pass forever.
    const secondOpener = `
      function rogue() {
        void window.api.${CALL}('https://example.com', bounds, 'rogue')
      }
    `
    expect(stripSourceComments(secondOpener)).toContain(CALL)

    // And the inverse: a commented-out call must NOT count, or the gate
    // convicts the fix site's own explanation.
    const commentedOut = `// this used to call window.api.${CALL}() directly\n`
    expect(stripSourceComments(commentedOut)).not.toContain(CALL)
  })
})
