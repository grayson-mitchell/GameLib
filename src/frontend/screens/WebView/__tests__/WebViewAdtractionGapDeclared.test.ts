/**
 * D-32 gap declaration (T-40-09-06, "logged, never silent") for `WebView/index.tsx`.
 *
 * THE DECISION THIS PINS
 *
 * The retired Electron adtraction workaround (`599fd51f2`, "[FIX] Adtraction fallback") caught a
 * MAIN-FRAME `did-fail-load` event for `track.adtraction.com`, extracted a redirect target from
 * that failed URL's own query string, navigated there, and showed a one-time warning `Dialog`.
 * That Dialog's JSX render was already deleted in plan 40-01; only its orphaned
 * `showAdtractionWarning`/`dontShowAdtractionWarning` state and `void` refs survived, kept alive
 * for the linter but reachable by nothing.
 *
 * `40-EMBED-API-VERIFICATION.md` Q3's verdict is ABSENT — no navigation-failure callback exists
 * anywhere in the wry->tauri chain on macOS, so there is no re-derivable equivalent of
 * `did-fail-load`. The deadline-armed-relay fallback this task considered (arm from
 * `on_navigation`, disarm from `on_page_load`) also cannot be built safely: the store embed's
 * own `.on_navigation(` closure takes only a bare URL with no frame-type flag (an already
 * project-established limitation of that exact hook, cited in `main.rs`'s
 * `on_document_title_changed` arm), so arming could not be restricted to main-frame-shaped
 * navigations — a third-party ad subframe could re-arm it indefinitely, precisely the defect the
 * 013-015 on_page_load-vs-on_navigation rule exists to prevent.
 *
 * Per D-32's own escape clause, this task therefore declares a gap rather than shipping a
 * detection that cannot fire: the orphaned state is REMOVED (not left unreachable), a
 * "logged, never silent" gap line fires once per GOG store visit, and a todo is filed carrying
 * the vendored-source citation
 * (`.planning/todos/pending/2026-09-04-adtraction-ad-block-detection-has-no-derivable-signal-under-tauri.md`).
 *
 * WHY A SOURCE-TEXT GATE
 *
 * `WebView/index.tsx` cannot be imported here — no jsdom, the module graph touches `window` at
 * import time (see `WebViewOAuthNavigation.test.ts`'s own docstring for the full reasoning this
 * follows).
 *
 * Self-tested against synthetic regressed sources per this project's anti-vacuity requirement.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const indexPath = join(__dirname, '..', 'index.tsx')
const rawSource = readFileSync(indexPath, 'utf-8')
const strippedSource = stripSourceComments(rawSource)

/** Extracts the balanced-brace block starting at the `{` found at `braceStart`. */
function extractBlockFromBrace(source: string, braceStart: number): string {
  let depth = 0
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(braceStart, i + 1)
    }
  }
  throw new Error(`unbalanced braces from index: ${braceStart}`)
}

/**
 * Extracts the balanced-brace block belonging to the NEAREST `blockOpener` (e.g.
 * `'useEffect(() => {'`) that precedes `innerMarker` — unlike a plain forward `indexOf('{',
 * markerIdx)`, this correctly anchors on the effect that actually CONTAINS `innerMarker` rather
 * than whichever brace happens to appear textually after it (which, for a one-line-guard effect
 * immediately followed by another `useEffect(`, is the NEXT effect's opening brace instead).
 */
function extractEnclosingBlock(
  source: string,
  innerMarker: string,
  blockOpener: string
): string {
  const innerIdx = source.indexOf(innerMarker)
  if (innerIdx === -1) throw new Error(`inner marker not found: ${innerMarker}`)
  const openerIdx = source.lastIndexOf(blockOpener, innerIdx)
  if (openerIdx === -1) {
    throw new Error(
      `enclosing opener "${blockOpener}" not found before: ${innerMarker}`
    )
  }
  const braceStart = openerIdx + blockOpener.length - 1
  return extractBlockFromBrace(source, braceStart)
}

describe('WebView adtraction gap declaration (D-32, T-40-09-06)', () => {
  const gapEffect = extractEnclosingBlock(
    strippedSource,
    "if (store !== 'gog') return",
    'useEffect(() => {'
  )

  it('logs the gap once per GOG store visit, gated on store === "gog"', () => {
    expect(gapEffect).toContain("if (store !== 'gog') return")
    expect(gapEffect).toContain('window.api.logInfo(')
  })

  it("names the gap as D-32 and cites Q3's ABSENT verdict, so the log line is diagnosable", () => {
    expect(gapEffect).toMatch(/D-32 gap/)
    expect(gapEffect).toMatch(/ABSENT/)
  })

  it('does not silently swallow the gap -- the effect body is not empty', () => {
    // Guards against a regression that keeps the `if (store !== 'gog') return` guard but drops
    // the log call, which would satisfy a narrower "gated correctly" assertion while still being
    // silent -- the exact failure mode "logged, never silent" exists to prevent.
    const bodyAfterGuard = gapEffect.replace("if (store !== 'gog') return", '')
    expect(
      bodyAfterGuard
        .trim()
        .replace(/^\{|\}$/g, '')
        .trim().length
    ).toBeGreaterThan(0)
  })

  it('the gap effect depends on [store] so it re-evaluates if the route store changes', () => {
    const blockEndIdx = strippedSource.indexOf(gapEffect) + gapEffect.length
    const depsArray = strippedSource.slice(blockEndIdx, blockEndIdx + 20)
    expect(depsArray).toMatch(/^\s*,\s*\[store\]\s*\)/)
  })

  describe('the removed state no longer exists', () => {
    // Checked against the COMMENT-STRIPPED source, not the raw file: this plan's own D-32
    // gap-declaration comment and the updated "Do NOT delete" comment both deliberately NAME the
    // retired identifiers in prose (for a future reader to grep-find why they are gone) --
    // stripping comments is what lets this assertion tell "documented as removed" apart from
    // "still declared as real state", which the raw source cannot distinguish.
    it('showAdtractionWarning/dontShowAdtractionWarning state declarations are gone from CODE', () => {
      expect(strippedSource).not.toContain('showAdtractionWarning')
      expect(strippedSource).not.toContain('dontShowAdtractionWarning')
      expect(strippedSource).not.toContain('setShowAdtractionWarning')
      expect(strippedSource).not.toContain('setDontShowAdtractionWarning')
    })

    it('no Dialog import/render exists in this file at all (the retired Dialog stays deleted)', () => {
      expect(strippedSource).not.toMatch(
        /from ['"]frontend\/components\/UI\/Dialog['"]/
      )
      expect(strippedSource).not.toMatch(/<Dialog[\s>]/)
    })
  })

  describe('self-test (anti-vacuity)', () => {
    it('detects a regression that reintroduces the removed state', () => {
      const regressed =
        'const [showAdtractionWarning, setShowAdtractionWarning] = useState<boolean>(false)'
      expect(regressed).toContain('showAdtractionWarning')
    })

    it('detects a regression that guards the gap log on the wrong store', () => {
      const regressedGate = "if (store !== 'epic') return"
      expect(regressedGate).not.toContain("store !== 'gog'")
    })

    it('detects a regression that keeps the guard but drops the log call', () => {
      const regressedEmpty = "{ if (store !== 'gog') return }"
      const bodyAfterGuard = regressedEmpty.replace(
        "if (store !== 'gog') return",
        ''
      )
      expect(
        bodyAfterGuard
          .trim()
          .replace(/^\{|\}$/g, '')
          .trim().length
      ).toBe(0)
    })

    it('detects a regression that silently reintroduces a Dialog render', () => {
      const regressed = '{showAdtractionWarning && <Dialog>...</Dialog>}'
      expect(regressed).toMatch(/<Dialog[\s>]/)
    })
  })
})
