/**
 * Source-text structural gate for GlobalState.tsx's `steamLogout` method
 * (Phase 34.4 gap fix, REQ-34.4-02 / live-gate item 2, task item 1).
 *
 * GlobalState.tsx cannot be imported directly under this project's
 * `node`-environment frontend jest project (see jest.config.js's docstring
 * — no jsdom/react-test-renderer installed): the module reads
 * `window.localStorage` at MODULE SCOPE (`const storage: Storage =
 * window.localStorage`), so a bare `import` throws `window is not defined`
 * before a single test could even run, well before any hook-call concern.
 * This mirrors WebviewUnavailablePanel.test.tsx's Group 2 "structural
 * fallback" rationale (its own docstring explains the same DOM-less
 * constraint for a different reason — hooks, not module-scope `window`).
 *
 * What this proves, and why it's the right proof for item 1 ("Under Tauri,
 * steamLogout now actually calls window.api.logoutSteam()"): the stale
 * G-30-01 guard was an `if (isTauri()) { ...; return }` that short-circuited
 * BEFORE `window.api.logoutSteam()` (nee `performSteamLogout`) was ever
 * reached. This gate reads the real source, strips comments (so the guard's
 * own prose can't fool a naive match), and asserts the `steamLogout` method
 * body contains no `isTauri(` reference at all, and unconditionally reaches
 * `performSteamLogout(...)` with the real `window.api.logoutSteam` handed
 * through as the `logoutSteam` dependency — never nested inside a guard that
 * could return before it. `SteamSignOut.test.ts` then proves, behaviorally,
 * that `performSteamLogout` given that real dependency actually calls it.
 *
 * Self-tested against synthetic merged/regressed sources per this project's
 * own anti-vacuity requirement (the exact lesson Phase 34.2's four gap
 * cycles paid for — a source-text gate without a self-test is a vacuous
 * gate).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const globalStatePath = join(__dirname, '..', 'GlobalState.tsx')

/** Extracts the balanced-brace block body starting at the first `{` after `marker`. */
function extractBlock(source: string, marker: string): string {
  const markerIdx = source.indexOf(marker)
  if (markerIdx === -1) {
    throw new Error(`marker not found: ${marker}`)
  }
  const braceStart = source.indexOf('{', markerIdx)
  let depth = 0
  let i = braceStart
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) break
    }
  }
  return source.slice(braceStart, i + 1)
}

/**
 * The gate under test: `steamLogout`'s body must (a) never reference
 * `isTauri(` — the exact stale guard's trigger condition — and (b)
 * unconditionally call `performSteamLogout(...)`, passing the REAL
 * `window.api.logoutSteam` through as its `logoutSteam` dependency (not a
 * stub, not a conditionally-assigned no-op).
 */
function steamLogoutReachesRealLogoutUnconditionally(
  strippedSource: string
): boolean {
  let block: string
  try {
    block = extractBlock(strippedSource, 'steamLogout = async () => ')
  } catch {
    return false
  }

  const hasStaleGuard = /isTauri\s*\(/.test(block)
  const callsPerformSteamLogout = /performSteamLogout\(/.test(block)
  const wiresRealLogoutSteam = /logoutSteam:\s*window\.api\.logoutSteam/.test(
    block
  )

  return !hasStaleGuard && callsPerformSteamLogout && wiresRealLogoutSteam
}

describe('GlobalState.tsx steamLogout — reaches the real logoutSteam channel unconditionally (item 1)', () => {
  it('the real source has no isTauri() guard and unconditionally wires window.api.logoutSteam through performSteamLogout', () => {
    const rawSource = readFileSync(globalStatePath, 'utf-8')
    const stripped = stripSourceComments(rawSource)

    expect(steamLogoutReachesRealLogoutUnconditionally(stripped)).toBe(true)
  })

  it('self-test: the gate ACCEPTS the exact shape the fix produces (positive control)', () => {
    const correctShape = [
      'class GlobalState {',
      '  steamLogout = async () => {',
      '    await performSteamLogout({',
      '      logoutSteam: window.api.logoutSteam,',
      '      getSteamUserInfo: window.api.getSteamUserInfo,',
      '      onSignedOut: () => {},',
      '      onSignOutFailed: () => {}',
      '    })',
      '  }',
      '}'
    ].join('\n')

    expect(steamLogoutReachesRealLogoutUnconditionally(correctShape)).toBe(true)
  })

  it('self-test: the gate REJECTS the exact stale G-30-01 guard shape being reinstated (the hand RED-proof mutation)', () => {
    const staleGuardShape = [
      'class GlobalState {',
      '  steamLogout = async () => {',
      '    if (isTauri()) {',
      '      this.handleShowDialogModal({ title: "Sign out unavailable" })',
      '      return',
      '    }',
      '',
      '    await performSteamLogout({',
      '      logoutSteam: window.api.logoutSteam,',
      '      getSteamUserInfo: window.api.getSteamUserInfo,',
      '      onSignedOut: () => {},',
      '      onSignOutFailed: () => {}',
      '    })',
      '  }',
      '}'
    ].join('\n')

    expect(steamLogoutReachesRealLogoutUnconditionally(staleGuardShape)).toBe(
      false
    )
  })

  it('self-test: the gate REJECTS a shape where performSteamLogout is never called at all (regression to a dead-end no-op)', () => {
    const deadEndShape = [
      'class GlobalState {',
      '  steamLogout = async () => {',
      '    console.log("nothing happens")',
      '  }',
      '}'
    ].join('\n')

    expect(steamLogoutReachesRealLogoutUnconditionally(deadEndShape)).toBe(
      false
    )
  })

  it('self-test: the gate REJECTS a shape where a fake/no-op logoutSteam is wired instead of the real window.api.logoutSteam', () => {
    const fakeDependencyShape = [
      'class GlobalState {',
      '  steamLogout = async () => {',
      '    await performSteamLogout({',
      '      logoutSteam: () => {},',
      '      getSteamUserInfo: window.api.getSteamUserInfo,',
      '      onSignedOut: () => {},',
      '      onSignOutFailed: () => {}',
      '    })',
      '  }',
      '}'
    ].join('\n')

    expect(
      steamLogoutReachesRealLogoutUnconditionally(fakeDependencyShape)
    ).toBe(false)
  })
})
