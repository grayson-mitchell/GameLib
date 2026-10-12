/**
 * Renderer-side half of the Epic-embed surface contract (Phase 50 Plan 01) that has no natural
 * home in an existing suite:
 *
 *   1. `storeEmbedFlowRegistration.ts`'s `open()` sends `storeKey` as part of `store_embed_open`'s
 *      wire payload -- `store_embed_open_args` (main.rs) requires it to route macOS's Epic key to
 *      `macos_epic_embed::open()` (D-02) before the existing Tauri-managed embed body runs.
 *   2. `coerceNavState()` REJECTS rather than defaults a malformed `surface` value -- a silently
 *      coerced default would make a dead or mis-shaped Rust arm indistinguishable from a healthy
 *      one, the same F-34.4.2-19 defect class this project has already shipped once.
 *
 * WHY THIS RUNS THE REAL SOURCE, NOT A REIMPLEMENTATION
 *
 * `storeEmbedFlowRegistration.ts` cannot be imported here: it is a backend/sidecar module whose
 * import graph reaches platform shims (`heroicLogWriter`, `requestRustInvoke`) this frontend jest
 * project does not boot. Rather than hand-copy its logic as a second, drifting implementation,
 * this suite extracts the EXACT statements from the real source between markers -- the same
 * `extractRawBetween`/`compileToFunction` technique `WebViewDeepLinkAndRestore.test.ts` uses for
 * `WebView/index.tsx` -- and either (a) executes the extracted `coerceNavState` as a real function
 * against synthetic inputs, or (b) asserts structurally on the extracted `open()` method's raw
 * text for the wire-payload shape, since that method's body calls the live `requestRustInvoke`
 * import and must not be executed.
 *
 * Self-tested against a synthetic regressed source (storyKey stripped from the payload literal)
 * per this project's anti-vacuity requirement: the negative control below proves the structural
 * assertion is not vacuously true.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import * as ts from 'typescript'

const sidecarPath = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'backend',
  'sidecar',
  'storeEmbedFlowRegistration.ts'
)
const rawSource = readFileSync(sidecarPath, 'utf-8')

/** Extracts raw source between two markers, exclusive of the end marker. */
function extractRawBetween(
  source: string,
  startMarker: string,
  endMarker: string
): string {
  const startIdx = source.indexOf(startMarker)
  if (startIdx === -1) throw new Error(`start marker not found: ${startMarker}`)
  const endIdx = source.indexOf(endMarker, startIdx)
  if (endIdx === -1) throw new Error(`end marker not found: ${endMarker}`)
  return source.slice(startIdx, endIdx)
}

/** Transpiles an extracted named-function declaration and returns it as a callable `Function`. */
function compileNamedFunction(
  rawDeclaration: string,
  fnName: string,
  params: string[]
): (...args: unknown[]) => unknown {
  const { outputText } = ts.transpileModule(rawDeclaration, {
    compilerOptions: { target: ts.ScriptTarget.ES2019 }
  })
  const body = `${outputText}\nreturn ${fnName}(${params.join(', ')});`
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- deliberate: see file docstring.
  return new Function(...params, body) as (...args: unknown[]) => unknown
}

// ── `coerceNavState` extraction (surface-field validation) ───────────────────────────────────
const coerceNavStateSource = extractRawBetween(
  rawSource,
  'function coerceNavState(channel: string, result: unknown): StoreEmbedNavEvent {',
  'function coerceNavEvents('
)
const coerceNavState = compileNamedFunction(
  coerceNavStateSource,
  'coerceNavState',
  ['channel', 'result']
)

describe('coerceNavState — surface field validation (Phase 50 Plan 01, raw-source)', () => {
  it('rejects a malformed surface value rather than defaulting it', () => {
    expect(() =>
      coerceNavState('ch', {
        url: 'https://x',
        host: 'x',
        canGoBack: false,
        canGoForward: false,
        surface: 'bogus'
      })
    ).toThrow(/surface must be 'tauri' or 'epic'/)
  })

  it('accepts a valid "epic" surface value and passes it through', () => {
    expect(
      coerceNavState('ch', {
        url: 'https://x',
        host: 'x',
        canGoBack: false,
        canGoForward: false,
        surface: 'epic'
      })
    ).toEqual({
      url: 'https://x',
      host: 'x',
      canGoBack: false,
      canGoForward: false,
      surface: 'epic'
    })
  })

  it('accepts an event with no surface field at all (the Tauri-managed embed predates the field)', () => {
    expect(
      coerceNavState('ch', {
        url: 'https://x',
        host: 'x',
        canGoBack: false,
        canGoForward: false
      })
    ).toEqual({
      url: 'https://x',
      host: 'x',
      canGoBack: false,
      canGoForward: false
    })
  })
})

// ── `open()`'s wire-payload shape (storeKey field, structural) ───────────────────────────────
// Not executed: the real body calls the live `requestRustInvoke` import. Asserted structurally
// on the extracted raw text instead, matching main.rs's own raw-source structural-assertion
// pattern for functions that cannot be constructed/run in isolation.
const openMethodSource = extractRawBetween(
  rawSource,
  'async open(url, bounds, storeKey) {',
  'setBounds(bounds) {'
)
const WIRE_PAYLOAD_SHAPE =
  /requestRustInvoke\(RUST_STORE_EMBED_OPEN,\s*\[\s*\{[^}]*storeKey[^}]*\}/s

describe('storeEmbedFlowRegistration — storeKey wire contract (Phase 50 Plan 01, structural)', () => {
  it("sends storeKey as part of store_embed_open's wire payload", () => {
    expect(openMethodSource).toMatch(WIRE_PAYLOAD_SHAPE)
  })

  it('negative control: a synthetic source with storeKey stripped from the payload fails the same assertion', () => {
    const regressedSource = openMethodSource.replace(', storeKey }', ' }')
    // Prove the strip actually removed the field, so a failed `.replace()` (e.g. after an
    // unrelated reformat of the real file) cannot make this control vacuously pass.
    expect(regressedSource).not.toBe(openMethodSource)
    expect(regressedSource).not.toMatch(WIRE_PAYLOAD_SHAPE)
  })
})
