/**
 * Phase 40 Plan 01 (D-09/D-10, REQ-40-10). Verdict: RETIRE.
 *
 * This file used to hold two things: (1) behavioural tests for the renderer-side
 * `attachHumbleLoginChromeCss` helper (`../components/humbleLoginChromeCss.ts`), and (2) a
 * source-text structural gate on `HumbleLoginSurface.tsx`'s Model A wiring -- the
 * `useLayoutEffect` that called it, and the D-17 navigation relay `useLayoutEffect` that called
 * `window.api.humbleLoginNavigated()` on every `did-navigate`/`did-navigate-in-page` event.
 *
 * Both are gone. `humbleLoginChromeCss.ts` was deleted outright in this plan's Task 2 (its only
 * consumer was the deleted `<webview>` render); `HumbleLoginSurface.tsx` no longer has a
 * `useLayoutEffect` calling it, nor a D-17 navigation relay. RETIRING (not weakening) every
 * assertion below that referenced either: the `attachHumbleLoginChromeCss` behavioural suite in
 * full (its subject no longer exists -- importing it would be a compile error, per the
 * planning_findings note this plan measured), and the source-text gate's
 * `attachHumbleLoginChromeCss` import check, `useLayoutEffect`/`[webviewRef.current]` dependency
 * check, the "no bare insertCSS/dom-ready" checks (their whole premise was the now-deleted
 * wiring), and the `window.api.humbleLoginNavigated()` toContain pin that plan-time measurement
 * (`40-01-PLAN.md` planning_findings #3) named directly.
 *
 * `humbleLoginNavigated` the CHANNEL (its backend registration, not this renderer call site) is
 * explicitly OUT OF SCOPE for this plan -- it is re-censused in plan `40-03` alongside D-11,
 * since a native Humble login path may still need to drive the same cookie-revalidation
 * behaviour from Rust. Nothing here asserts on the channel's backend registration; only the
 * renderer-side call site (deleted along with the relay effect it lived in) is retired.
 *
 * `common/humble/loginChromeCss.ts` itself SURVIVES this plan untouched -- it has three other
 * importers (`src/backend/humble/__tests__/loginChromeCss.test.ts`,
 * `src/backend/__tests__/loginChromeCssInjection.test.ts`, and the backend CSS-injection path)
 * and is exercised by ITS OWN test files, not this one. Nothing in this file touched it in
 * isolation from the deleted renderer helper, so there is no assertion here that "only touches
 * `common/humble/loginChromeCss`" to carry forward unedited.
 *
 * What replaces the retired suite: a structural regression gate proving the deletion holds --
 * `HumbleLoginSurface.tsx` renders `TauriLoginPanel` unconditionally and imports neither
 * `attachHumbleLoginChromeCss` nor the retired `<webview>`-element method-surface shim, and no
 * longer calls `window.api.humbleLoginNavigated()`. This is the same "prove a guard cannot
 * quietly reappear" discipline the sibling `WebviewUnavailablePanel.test.tsx` INVERT applies to
 * the store/wiki arm.
 *
 * Phase 40 Plan 03 (D-12, REQ-40-10) deleted that shim's type declaration outright from
 * `backend/platform/types.ts` -- there is no longer anywhere in the codebase it could be imported
 * from, so re-importing it is now a compile error `pnpm codecheck` catches directly, and plan
 * 40-03's own mechanical gate (D-13) sweeps `src/frontend/` for the same reintroduced token. The
 * runtime string-matching test that used to guard this here is retired as redundant coverage of a
 * regression two independent, stronger mechanisms already cover; keeping a test whose subject is
 * categorically impossible to violate is dead weight, not a guard.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

describe('HumbleLoginSurface.tsx -- Model A wiring retired (RETIRE, REQ-40-10, plan 40-03 owns the channel-level re-census)', () => {
  const surfacePath = join(
    __dirname,
    '..',
    'components',
    'HumbleLoginSurface.tsx'
  )
  const source = stripSourceComments(readFileSync(surfacePath, 'utf-8'))

  test('no longer imports the deleted attachHumbleLoginChromeCss helper', () => {
    expect(source).not.toContain('attachHumbleLoginChromeCss')
  })

  test('no longer calls window.api.humbleLoginNavigated (D-17 relay retired with the <webview> it navigated)', () => {
    expect(source).not.toContain('humbleLoginNavigated')
  })

  test('renders TauriLoginPanel unconditionally as its final statement', () => {
    const returnIdx = source.lastIndexOf('return <TauriLoginPanel')
    expect(returnIdx).toBeGreaterThan(-1)

    const functionMarker = 'export default function HumbleLoginSurface'
    const functionStart = source.indexOf(functionMarker)
    expect(functionStart).toBeGreaterThan(-1)

    // Skip past the parameter list by paren-depth (not the first `{` after the marker, which
    // would land on the destructured `{ onDone, onCancelled }` parameter's own brace).
    const parenStart = source.indexOf('(', functionStart)
    let parenDepth = 0
    let i = parenStart
    for (; i < source.length; i++) {
      if (source[i] === '(') parenDepth++
      else if (source[i] === ')') {
        parenDepth--
        if (parenDepth === 0) {
          i++
          break
        }
      }
    }
    const bodyBraceStart = source.indexOf('{', i)

    // Nothing between the function's own opening brace and the `TauriLoginPanel` return may
    // leave a brace unclosed -- an `if (` reintroduced around the return would open a brace
    // that is still unclosed at `returnIdx`, so the net depth across that span would exceed 1.
    // Effects inside the body (the login watch's own internal `if (` branches) are fine: they
    // close before the return, so they contribute net zero to this count.
    let depth = 0
    for (let k = bodyBraceStart; k < returnIdx; k++) {
      if (source[k] === '{') depth++
      else if (source[k] === '}') depth--
    }
    expect(depth).toBe(1)
  })

  test('self-test: the depth check REJECTS a synthetic source where the return was re-guarded', () => {
    const guarded = [
      'export default function HumbleLoginSurface({ onDone, onCancelled }) {',
      '  if (someGuard()) {',
      '    return <TauriLoginPanel runner="humble" state={humbleLoginState} />',
      '  }',
      '}'
    ].join('\n')

    const functionStart = guarded.indexOf(
      'export default function HumbleLoginSurface'
    )
    const parenStart = guarded.indexOf('(', functionStart)
    let parenDepth = 0
    let i = parenStart
    for (; i < guarded.length; i++) {
      if (guarded[i] === '(') parenDepth++
      else if (guarded[i] === ')') {
        parenDepth--
        if (parenDepth === 0) {
          i++
          break
        }
      }
    }
    const bodyBraceStart = guarded.indexOf('{', i)
    const returnIdx = guarded.lastIndexOf('return <TauriLoginPanel')

    let depth = 0
    for (let k = bodyBraceStart; k < returnIdx; k++) {
      if (guarded[k] === '{') depth++
      else if (guarded[k] === '}') depth--
    }
    expect(depth).not.toBe(1)
  })
})
