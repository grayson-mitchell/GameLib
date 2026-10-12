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
 *   3. `WebView/index.tsx`'s final JSX return wires plan 02's nav signals (surfaced through plan
 *      05's `useStoreEmbedHost` extension) into plan 03's three chrome components -- the slow-load
 *      banner and blocked-launcher notice as rows above the embed slot, the `'epic-challenged'`
 *      unavailable panel as the one sanctioned exception to the slot's "placeholder is its only
 *      child" rule (D-19), and the placeholder's own render condition widened to fire
 *      unconditionally on the Epic surface.
 *
 * WHY THIS RUNS THE REAL SOURCE, NOT A REIMPLEMENTATION
 *
 * `storeEmbedFlowRegistration.ts` cannot be imported here: it is a backend/sidecar module whose
 * import graph reaches platform shims (`heroicLogWriter`, `requestRustInvoke`) this frontend jest
 * project does not boot. `WebView/index.tsx` cannot be imported either -- no jsdom, and the module
 * graph touches `window` at import time (see `WebViewOAuthNavigation.test.ts`'s own docstring).
 * Rather than hand-copy either file's logic as a second, drifting implementation, this suite
 * extracts the EXACT statements/JSX from the real sources between markers -- the same
 * `extractRawBetween`/`compileToFunction` technique `WebViewDeepLinkAndRestore.test.ts` uses for
 * `WebView/index.tsx` -- and either (a) executes the extracted `coerceNavState` as a real function
 * against synthetic inputs, or (b) asserts structurally on the extracted raw text (the `open()`
 * method's wire-payload shape, or `index.tsx`'s final-return JSX), since neither can be executed
 * in isolation here (the former calls the live `requestRustInvoke` import; the latter is JSX with
 * no React runtime in scope).
 *
 * Self-tested against synthetic regressed sources per this project's anti-vacuity requirement:
 * each negative control below proves its structural assertion is not vacuously true.
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
    // `loadTimedOut`/`challenged`/`blockedLauncherSchemeCount` are each REQUIRED on every
    // `surface: 'epic'` event as of Phase 50 Plan 02 (Task 2 and Task 3 respectively) -- this
    // fixture predates both and would otherwise throw; updated here rather than left stale.
    expect(
      coerceNavState('ch', {
        url: 'https://x',
        host: 'x',
        canGoBack: false,
        canGoForward: false,
        surface: 'epic',
        loadTimedOut: false,
        challenged: false,
        blockedLauncherSchemeCount: 0
      })
    ).toEqual({
      url: 'https://x',
      host: 'x',
      canGoBack: false,
      canGoForward: false,
      surface: 'epic',
      loadTimedOut: false,
      challenged: false,
      blockedLauncherSchemeCount: 0
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
// No `s` (dotAll) flag: the pattern has no `.` metacharacter -- `[^}]*` already matches
// newlines on its own -- so `s` was a no-op that only cost ES2018-target compatibility. Plain
// `tsc --noEmit` (no `target` override) rejected it with TS1501 (Phase 50 Plan 02, Rule 3:
// blocking issue for this plan's own `pnpm codecheck` gate, pre-existing from Plan 01).
const WIRE_PAYLOAD_SHAPE =
  /requestRustInvoke\(RUST_STORE_EMBED_OPEN,\s*\[\s*\{[^}]*storeKey[^}]*\}/

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

// ── `WebView/index.tsx`'s Epic nav-signal chrome wiring (Phase 50 Plan 05, raw-source) ───────
// Not executed: this is JSX with no React runtime in scope. Asserted structurally on the
// extracted raw text instead, the same way the `open()` wire-payload shape above is -- and the
// same `extractRawBetween` technique `WebViewDeepLinkAndRestore.test.ts` uses for this same file.
const indexPath = join(__dirname, '..', 'index.tsx')
const indexSource = readFileSync(indexPath, 'utf-8')

// From the final return's own root element through end-of-file -- this is the LAST statement in
// the component, so there is no later marker to bound it with; slicing to EOF is exact.
const finalReturnSource = indexSource.slice(
  indexSource.indexOf('<div className="WebView WebView__embedContainer">')
)

describe('WebView index.tsx — Epic nav-signal chrome wiring (Phase 50 Plan 05, structural)', () => {
  it('derives isEpicSurface from storeKey and platform', () => {
    expect(indexSource).toMatch(
      /const isEpicSurface = storeKey === 'epic' && platform === 'darwin'/
    )
  })

  it('renders StoreEmbedTimeoutBanner and EpicLauncherBlockedNotice as notice rows between StoreEmbedControls and the embed slot', () => {
    const controlsIdx = finalReturnSource.indexOf('<StoreEmbedControls')
    const bannerIdx = finalReturnSource.indexOf('<StoreEmbedTimeoutBanner')
    const noticeIdx = finalReturnSource.indexOf('<EpicLauncherBlockedNotice')
    const slotIdx = finalReturnSource.indexOf('className="WebView__embedSlot"')
    expect(controlsIdx).toBeGreaterThanOrEqual(0)
    expect(bannerIdx).toBeGreaterThan(controlsIdx)
    expect(noticeIdx).toBeGreaterThan(bannerIdx)
    expect(slotIdx).toBeGreaterThan(noticeIdx)
  })

  it('wires StoreEmbedTimeoutBanner to embedHost.loadTimedOut/onReload and EpicLauncherBlockedNotice to the local notice state', () => {
    expect(finalReturnSource).toMatch(/timedOut=\{embedHost\.loadTimedOut\}/)
    expect(finalReturnSource).toMatch(/visible=\{launcherNoticeVisible\}/)
    // Review finding 15: the notice's auto-dismiss effect is keyed on the attempt identity.
    expect(finalReturnSource).toMatch(
      /attemptKey=\{embedHost\.launcherSchemeBlockedAt\}/
    )
    expect(finalReturnSource).toMatch(
      /onDismissed=\{\(\) => setLauncherNoticeVisible\(false\)\}/
    )
  })

  // Review finding 6 (D-06/D-10/D-11/D-19): the slot's children are ONE component that picks
  // exactly one of challenged panel / placeholder / nothing -- its choice is tested behaviourally
  // in `components/__tests__/StoreEmbedSlotContents.test.tsx`. This half pins the WIRING, since
  // the JSX here cannot be executed: every prop comes from the right source, `url` included (the
  // challenged panel's Open in browser button renders only with it), and nothing else -- no
  // placeholder or panel of its own -- is rendered inside the slot to stack against it.
  const SLOT_CONTENTS_WIRING =
    /<div className="WebView__embedSlot" ref=\{slotCallbackRef\}>\s*<StoreEmbedSlotContents\s+suppressed=\{embedSuppressed\}\s+isEpicSurface=\{isEpicSurface\}\s+challenged=\{embedHost\.challenged\}\s+url=\{embedHost\.currentUrl\}\s+onTryAgain=\{embedHost\.onTryAgain\}\s*\/>\s*<\/div>/

  it("renders StoreEmbedSlotContents as the embed slot's only child, wired to the host state including url", () => {
    expect(finalReturnSource).toMatch(SLOT_CONTENTS_WIRING)
  })

  it('renders no placeholder or unavailable panel of its own in the final return', () => {
    expect(finalReturnSource).not.toMatch(/<StoreEmbedPlaceholder\b/)
    expect(finalReturnSource).not.toMatch(/<WebviewUnavailablePanel\b/)
  })

  it('negative control: the pre-fix slot (placeholder, then a url-less ungated panel) fails both assertions', () => {
    const regressedSource = finalReturnSource.replace(
      SLOT_CONTENTS_WIRING,
      `<div className="WebView__embedSlot" ref={slotCallbackRef}>
        {(embedSuppressed || isEpicSurface) && <StoreEmbedPlaceholder />}
        {embedHost.challenged && (
          <WebviewUnavailablePanel
            reason="epic-challenged"
            onTryAgain={embedHost.onTryAgain}
          />
        )}
      </div>`
    )
    expect(regressedSource).not.toBe(finalReturnSource)
    expect(regressedSource).not.toMatch(SLOT_CONTENTS_WIRING)
    expect(regressedSource).toMatch(/<StoreEmbedPlaceholder\b/)
  })

  it('negative control: dropping url from the wiring fails the wiring assertion', () => {
    const regressedSource = finalReturnSource.replace(
      /(challenged=\{embedHost\.challenged\})\s+url=\{embedHost\.currentUrl\}/,
      '$1'
    )
    expect(regressedSource).not.toBe(finalReturnSource)
    expect(regressedSource).not.toMatch(SLOT_CONTENTS_WIRING)
  })
})
