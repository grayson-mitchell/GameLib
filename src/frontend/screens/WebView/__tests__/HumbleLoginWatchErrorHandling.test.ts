/**
 * Source-text structural gate for the humble login watch's error/timeout handling
 * (`WebView/components/HumbleLoginSurface.tsx`'s `runHumbleLoginWatch`, extracted
 * verbatim from `WebView/index.tsx` by quick task 260821-iri Task 1).
 *
 * THE BUG THIS PINS (F-34.4.2-19, `.planning/debug/humble-isloggedin-never-set.md`)
 *
 * `runHumbleLoginWatch()` only ever branched on `result.status === 'done'`. When the
 * backend watch (`HumbleUser.startLogin()`/`reconnect()`) instead settled with
 * `{ status: 'error' }` (e.g. the Rust-owned login window became unreachable) or
 * `{ status: 'waiting' }` (the WR-03 ten-minute deadline elapsed while still mounted), this
 * effect did nothing at all — no error, no retry, no navigation. Combined with
 * `TauriLoginPanel`'s own humble branch being fully static (unconditional on ANY watch
 * outcome), the user was left staring at "A sign-in window has opened…" indefinitely, long
 * after the backend had already given up. Neither a rendered login form nor a rendered
 * Logout control was ever reachable from that state.
 *
 * THE FIX: 'error'/'waiting' now route through a local `humbleLoginState` (the SAME
 * `TauriOAuthLoginState` shape the four OAuth runners already produce), rendered by
 * `TauriLoginPanel`'s existing generic error/timeout branches — heading, body, and a Retry
 * button, exactly like every other runner's failure surface.
 *
 * WHY A SOURCE-TEXT GATE
 *
 * Nothing in this tree imports `WebView/index.tsx` directly — no jsdom/react-test-renderer is
 * installed, and the module graph reaches `window` at import time. `WebViewOAuthNavigation.test.ts`
 * already gates this same file by source text; this follows that precedent.
 *
 * What it does NOT prove: that a live failed/timed-out humble login actually renders the
 * Retry surface end-to-end. That needs either a real login-window failure or a live session —
 * `TauriLoginPanel.test.tsx`'s own "Humble error/timeout surfaces" describe block covers the
 * render side of this contract in isolation.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const indexPath = join(__dirname, '..', 'components', 'HumbleLoginSurface.tsx')

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

describe('WebView humble login watch error/timeout handling (F-34.4.2-19)', () => {
  const source = stripSourceComments(readFileSync(indexPath, 'utf-8'))
  const watchFn = extractBlock(source, 'async function runHumbleLoginWatch()')

  it('still handles the done arm unchanged: logs in and calls onDone()', () => {
    expect(watchFn).toContain("result.status === 'done'")
    expect(watchFn).toContain('await humble.login(result)')
    expect(watchFn).toContain('onDone()')
  })

  // Quick task 260808-gl6. The F-34.4.2-19 fix above made the watch surface every
  // non-'done' outcome, which was right -- but the backend settled a DELIBERATE user close
  // of the sign-in window as { status: 'error' }, so backing out of signing in rendered
  // "Something went wrong while signing in: the Humble sign-in window closed or could not
  // be reached". The backend now settles { status: 'cancelled' } for that case (see
  // humble/user.ts) and this arm must return to Manage Accounts showing nothing at all.
  it('handles status === "cancelled" by calling onCancelled(), never by setting an error state', () => {
    expect(watchFn).toContain("result.status === 'cancelled'")
    // The branch body, up to the next `else if`, both calls onCancelled() and stays panel-free.
    const cancelledArm = watchFn.slice(
      watchFn.indexOf("result.status === 'cancelled'")
    )
    const armBody = cancelledArm.slice(0, cancelledArm.indexOf('} else if'))
    expect(armBody).toContain('onCancelled()')
    expect(armBody).not.toMatch(/setHumbleLoginState/)
  })

  it('orders the cancelled arm before the error arm, so a user close can never fall into the failure surface', () => {
    expect(watchFn.indexOf("result.status === 'cancelled'")).toBeLessThan(
      watchFn.indexOf("result.status === 'error'")
    )
  })

  it('handles status === "error" by setting a phase: "error" state, never silently returning', () => {
    expect(watchFn).toContain("result.status === 'error'")
    expect(watchFn).toMatch(
      /result\.status === 'error'[\s\S]{0,300}phase:\s*'error'/
    )
  })

  it('handles status === "waiting" by setting a phase: "timeout" state, never silently returning', () => {
    expect(watchFn).toContain("result.status === 'waiting'")
    expect(watchFn).toMatch(
      /result\.status === 'waiting'[\s\S]{0,300}phase:\s*'timeout'/
    )
  })

  it('logs both new terminal outcomes ("logged, never silent")', () => {
    expect(watchFn).toMatch(/logInfo[\s\S]{0,80}phase=error/)
    expect(watchFn).toMatch(/logInfo[\s\S]{0,80}phase=timeout/)
  })

  it('the humble watch state is threaded into TauriLoginPanel unconditionally -- this surface is Humble-only', () => {
    expect(source).toMatch(
      /<TauriLoginPanel runner="humble" state=\{humbleLoginState\} \/>/
    )
  })

  it('humbleLoginState defaults to { phase: "idle" } so the in-progress copy is the initial render', () => {
    expect(source).toMatch(
      /useState<TauriOAuthLoginState>\(\s*\{\s*phase:\s*'idle'\s*\}\s*\)/
    )
  })

  describe('self-test (anti-vacuity)', () => {
    it('detects a watch that swallows the error status entirely', () => {
      const regressed =
        "async function runHumbleLoginWatch() { if (result.status === 'done') { navigate('/login') } }"
      expect(regressed).not.toContain("result.status === 'error'")
    })

    it('detects a cancelled branch that renders an error panel instead of navigating', () => {
      const regressed =
        "if (result.status === 'cancelled') { setHumbleLoginState({ phase: 'error' }) } else if (x) {}"
      const armBody = regressed.slice(0, regressed.indexOf('} else if'))
      expect(armBody).not.toContain("navigate('/login')")
      expect(armBody).toMatch(/setHumbleLoginState/)
    })

    it('detects an error branch that never sets phase: "error"', () => {
      const regressed =
        "if (result.status === 'error') { console.error('oops') }"
      expect(regressed).not.toMatch(
        /result\.status === 'error'[\s\S]{0,300}phase:\s*'error'/
      )
    })

    it('detects a waiting branch that never sets phase: "timeout"', () => {
      const regressed = "if (result.status === 'waiting') { return }"
      expect(regressed).not.toMatch(
        /result\.status === 'waiting'[\s\S]{0,300}phase:\s*'timeout'/
      )
    })
  })
})
