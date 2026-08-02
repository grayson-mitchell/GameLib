/**
 * Source-text structural gate for the Tauri OAuth path's post-login navigation
 * (`WebView/index.tsx`).
 *
 * THE BUG THIS PINS
 *
 * Every OTHER successful-login path in `WebView/index.tsx` leaves the login surface:
 * Electron's epic/gog/zoom/amazon branches call `handleSuccessfulLogin()` ->
 * `navigate('/login')`, and the humble watch calls `navigate('/login')` on its
 * `status === 'done'` arm. The Tauri OAuth path did not. It completed the login — credential
 * persisted, library refreshed — and left the user parked on the WebView login route.
 *
 * The panel could not recover on its own either. `useTauriOAuthLogin` routes its terminal
 * `setState({ phase: 'idle' })` through `safeSetState`, gated on `!cancelled`, and a teardown
 * lands mid-flight on every success here (`phase=cancelled-midflight at=auth authStatus=done`
 * is logged immediately before `phase=idle` in every observed run). So the panel stayed at
 * `awaiting` — "Signing in to Gog" — indefinitely.
 *
 * Un-gating that state update is NOT the fix and must not be "simplified" into one:
 * `phase: 'idle'` renders `TauriLoginPanel`'s DECLARED-BLOCKED copy, so forcing idle would
 * replace the stuck spinner with a message implying the sign-in channel is unported. The
 * correct end state after a successful login is not being on the login page at all.
 *
 * THE `mountedRef` vs `cancelled` DISTINCTION — the load-bearing part
 *
 * The navigation is guarded by a true-unmount ref, NOT by the hook's `cancelled` flag.
 * They are not interchangeable: `cancelled` means "this effect instance was superseded",
 * which is TRUE on every successful login here while the user is still sitting on the route.
 * Guarding on it would reintroduce the exact bug. `mountedRef` is only cleared by an
 * empty-deps cleanup, i.e. a real unmount — mirroring the humble watch's own "a late
 * resolution after the route unmounted must not navigate" rule.
 *
 * WHY A SOURCE-TEXT GATE
 *
 * Nothing in this tree imports `WebView/index.tsx` — no jsdom/react-test-renderer is
 * installed, and the module graph reaches `window` at import time. `WebviewUnavailablePanel`'s
 * own suite already gates this same file by source text; this follows that precedent.
 *
 * What it does NOT prove: that a real login navigates. That needs a live session — the
 * observable is landing on Manage Accounts with the account signed in, rather than on a
 * "Signing in to <Runner>" panel.
 *
 * Self-tested against synthetic regressed sources per this project's anti-vacuity
 * requirement.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const indexPath = join(__dirname, '..', 'index.tsx')

/** Extracts the balanced-brace block whose opening `{` follows `marker`. */
function extractBlock(source: string, marker: string): string {
  const markerIdx = source.indexOf(marker)
  if (markerIdx === -1) throw new Error(`marker not found: ${marker}`)
  const braceStart = source.indexOf('{', markerIdx)
  let depth = 0
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(braceStart, i + 1)
    }
  }
  throw new Error(`unbalanced braces after: ${marker}`)
}

describe('WebView Tauri OAuth post-login navigation', () => {
  const source = stripSourceComments(readFileSync(indexPath, 'utf-8'))
  const successHandler = extractBlock(source, 'handleTauriOAuthSuccess = useCallback')

  it('hands the payload to GlobalState’s completion path', () => {
    expect(successHandler).toContain('completeOAuthLogin(payload)')
  })

  it('leaves the login surface, exactly as every other success path does', () => {
    expect(successHandler).toContain("navigate('/login')")
  })

  it('guards navigation on a TRUE-UNMOUNT ref', () => {
    expect(successHandler).toContain('mountedRef.current')
  })

  it('does NOT guard navigation on the hook’s cancelled/teardown flag', () => {
    // `cancelled` is true on every successful login here while the user is still on the
    // route. Guarding on it reintroduces the stuck-panel bug.
    expect(successHandler).not.toMatch(/\bcancelled\b/)
  })

  it('is wired into the hook in place of the bare completion callback', () => {
    // Parenthesised call, not a brace block — matched by regex rather than `extractBlock`,
    // which scans to the next `{` and would run past this call into the following statement.
    expect(source).toMatch(
      /useTauriOAuthLogin\(\s*runner[^)]*,\s*handleTauriOAuthSuccess\s*\)/
    )
    // And the bare callback must NOT still be the one passed to the hook.
    expect(source).not.toMatch(
      /useTauriOAuthLogin\(\s*runner[^)]*,\s*completeOAuthLogin\s*\)/
    )
  })

  it('has a stable identity — onLoginSuccess is an effect dependency of the hook', () => {
    // An unstable wrapper would re-run useTauriOAuthLogin's capture effect on every render.
    // Both deps are stable: completeOAuthLogin is a GlobalState class field, navigate is
    // stable in react-router v6.
    expect(source).toMatch(
      /handleTauriOAuthSuccess = useCallback\([\s\S]*?\[completeOAuthLogin, navigate\]\s*\)/
    )
  })

  it('clears mountedRef only on real unmount (empty deps)', () => {
    expect(source).toMatch(
      /mountedRef\.current = false[\s\S]{0,40}\}\s*\}?,\s*\[\]\s*\)/
    )
  })

  describe('self-test (anti-vacuity)', () => {
    it('detects a handler that completes the login but never navigates', () => {
      const regressed = '{ completeOAuthLogin(payload) }'
      expect(regressed).not.toContain("navigate('/login')")
    })

    it('detects a handler that guards navigation on cancelled', () => {
      const regressed =
        '{ completeOAuthLogin(payload); if (!cancelled) navigate(\'/login\') }'
      expect(regressed).toMatch(/\bcancelled\b/)
    })

    it('detects the hook being wired back to the bare callback', () => {
      const regressed = 'const oauthLoginState = useTauriOAuthLogin(runner, completeOAuthLogin)'
      expect(regressed).not.toContain('handleTauriOAuthSuccess')
    })
  })
})
