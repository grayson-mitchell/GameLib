/**
 * Source-text structural gates for the fix to debug/login-logout-wipes-library.
 *
 * GlobalState.tsx cannot be imported directly under this project's
 * `node`-environment frontend jest project (see jest.config.js's docstring —
 * no jsdom/react-test-renderer installed, and the module reads
 * `window.localStorage` at MODULE SCOPE), so a bare `import` throws `window
 * is not defined` before a single test could run. This mirrors
 * `GlobalStateSteamLogout.test.ts` and `GlobalStateRefreshLibraryOrigin.test.ts`'s
 * own documented DOM-less constraint and follows the identical pattern: read
 * the real source, strip comments, and assert the exact method-body shape.
 *
 * What this proves, split into the three items the fix's verification bar
 * names:
 *
 *   (a) None of the five logout wrappers (epicLogout/gogLogout/amazonLogout/
 *       zoomLogout/steamLogout) call `window.location.reload()` any more —
 *       the mechanism that unmounted the ENTIRE React tree (wiping every
 *       OTHER platform's already-loaded games) whenever a SINGLE platform
 *       logged out. Each wrapper's own scoped `setState` clearing only its
 *       own runner's `{ library: [], username: null }` is asserted to still
 *       be present (the correct behavior was never the bug — the reload
 *       bolted on top of it was).
 *
 *   (b) `refreshLibrary()` no longer sets the two GLOBAL `refreshing`/
 *       `refreshingInTheBackground` flags for a single-runner (scoped) call
 *       — only for a genuine all-runners call (no `library` argument, or
 *       `library: 'all'`). A scoped call writes its OWN `refreshingByRunner`
 *       entry instead, so Library/index.tsx's merged-grid gate (which reads
 *       only the two global flags) is never triggered by one platform's
 *       login finishing.
 *
 *   (c) `.refresh()` honors its `library` parameter all the way through to
 *       its FINAL `setState` — a scoped call only ever writes that one
 *       runner's slice (and its own `refreshingByRunner` entry), never the
 *       other three runners' arrays or the two global flags.
 *
 * Self-tested against synthetic correct/regressed sources per this project's
 * own anti-vacuity requirement — a source-text gate without a self-test is a
 * vacuous gate (the exact lesson Phase 34.2's gap cycles paid for).
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
  const braceStart = source.indexOf('{', markerIdx + marker.length - 1)
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

// ---------------------------------------------------------------------------
// (a) Logout wrappers never reload the window; each still scopes its own
//     runner's state clear.
// ---------------------------------------------------------------------------

function logoutBlockNeverReloadsWindow(block: string): boolean {
  return !/window\.location\.reload\s*\(/.test(block)
}

function logoutClearsOwnRunnerState(block: string, runnerKey: string): boolean {
  const pattern = new RegExp(`${runnerKey}:\\s*{\\s*library:\\s*\\[\\]`, 'm')
  return pattern.test(block)
}

describe('GlobalState.tsx logout wrappers — never reload the window (debug/login-logout-wipes-library item a)', () => {
  const rawSource = readFileSync(globalStatePath, 'utf-8')
  const stripped = stripSourceComments(rawSource)

  it.each([
    ['epicLogout = async () => ', 'epic'],
    ['gogLogout = async () => ', 'gog'],
    ['amazonLogout = async () => ', 'amazon'],
    ['zoomLogout = async () => ', 'zoom'],
    ['steamLogout = async () => ', 'steam']
  ])(
    '%s never calls window.location.reload() and still clears its own (%s) state',
    (marker: string, runnerKey: string) => {
      const block = extractBlock(stripped, marker)
      expect(logoutBlockNeverReloadsWindow(block)).toBe(true)
      expect(logoutClearsOwnRunnerState(block, runnerKey)).toBe(true)
    }
  )

  it('self-test: the gate REJECTS a shape that reintroduces window.location.reload() (the hand RED-proof mutation)', () => {
    const regressedShape = [
      'epicLogout = async () => {',
      '  this.setState({ refreshing: true })',
      '  await window.api.logoutLegendary().finally(() => {',
      '    this.setState({',
      '      epic: {',
      '        library: [],',
      '        username: null',
      '      }',
      '    })',
      '  })',
      '  this.setState({ refreshing: false })',
      '  window.location.reload()',
      '}'
    ].join('\n')

    expect(logoutBlockNeverReloadsWindow(regressedShape)).toBe(false)
  })

  it('self-test: the gate ACCEPTS the exact shape the fix produces (positive control)', () => {
    const correctShape = [
      'gogLogout = async () => {',
      '  window.api.logoutGOG()',
      '  this.setState({',
      '    gog: {',
      '      library: [],',
      '      username: null',
      '    }',
      '  })',
      '}'
    ].join('\n')

    expect(logoutBlockNeverReloadsWindow(correctShape)).toBe(true)
    expect(logoutClearsOwnRunnerState(correctShape, 'gog')).toBe(true)
  })

  it('self-test: logoutClearsOwnRunnerState REJECTS a shape whose scoped clear was also (incorrectly) dropped', () => {
    const noClearShape = [
      'gogLogout = async () => {',
      '  window.api.logoutGOG()',
      '  console.log("Logging out from gog")',
      '}'
    ].join('\n')

    expect(logoutClearsOwnRunnerState(noClearShape, 'gog')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// (b) refreshLibrary() only sets the GLOBAL refreshing flags for an
//     unscoped ('all') call; a scoped call writes refreshingByRunner instead.
// ---------------------------------------------------------------------------

function refreshLibraryScopesGlobalFlagToUnscopedCallsOnly(
  block: string
): boolean {
  const derivesScopedRunner =
    /const\s+scopedRunner\s*=\s*library\s*&&\s*library\s*!==\s*'all'\s*\?\s*library\s*:\s*undefined/.test(
      block
    )

  const globalFlagIdx = block.indexOf('refreshing: true,')
  if (globalFlagIdx === -1) return false
  const windowBefore = block.slice(
    Math.max(0, globalFlagIdx - 300),
    globalFlagIdx
  )
  const globalFlagGuardedByElse =
    /if\s*\(scopedRunner\)\s*{/.test(windowBefore) &&
    /}\s*else\s*{/.test(windowBefore)

  const writesByRunnerTrueWhenScoped =
    /if\s*\(scopedRunner\)\s*{\s*this\.setState\(\s*\(prevState:\s*StateProps\)\s*=>\s*\(\{\s*refreshingByRunner:\s*{\s*\.\.\.prevState\.refreshingByRunner,\s*\[scopedRunner\]:\s*true\s*}\s*\}\)\s*\)/.test(
      block
    )

  return (
    derivesScopedRunner &&
    globalFlagGuardedByElse &&
    writesByRunnerTrueWhenScoped
  )
}

describe('GlobalState.tsx refreshLibrary — scopes the global refreshing flags to unscoped calls only (debug/login-logout-wipes-library item b)', () => {
  const rawSource = readFileSync(globalStatePath, 'utf-8')
  const stripped = stripSourceComments(rawSource)

  it('the real source only sets refreshing/refreshingInTheBackground globally when there is no scoped runner', () => {
    const block = extractBlock(
      stripped,
      '}: RefreshLibraryOptions): Promise<void> => '
    )
    expect(refreshLibraryScopesGlobalFlagToUnscopedCallsOnly(block)).toBe(true)
  })

  it('self-test: the gate ACCEPTS the exact shape the fix produces (positive control)', () => {
    const correctShape = [
      '{',
      '  if (this.state.refreshing) return',
      "  const runnerScope = library ?? 'all'",
      "  const scopedRunner = library && library !== 'all' ? library : undefined",
      '  if (scopedRunner && this.state.refreshingByRunner[scopedRunner]) return',
      '',
      '  if (scopedRunner) {',
      '    this.setState((prevState: StateProps) => ({',
      '      refreshingByRunner: {',
      '        ...prevState.refreshingByRunner,',
      '        [scopedRunner]: true',
      '      }',
      '    }))',
      '  } else {',
      '    this.setState({',
      '      refreshing: true,',
      '      refreshingInTheBackground: runInBackground',
      '    })',
      '  }',
      '}'
    ].join('\n')

    expect(
      refreshLibraryScopesGlobalFlagToUnscopedCallsOnly(correctShape)
    ).toBe(true)
  })

  it('self-test: the gate REJECTS the pre-fix shape that set the global flags unconditionally for every call, scoped or not', () => {
    const preFixShape = [
      '{',
      '  if (this.state.refreshing) return',
      '',
      '  this.setState({',
      '    refreshing: true,',
      '    refreshingInTheBackground: runInBackground',
      '  })',
      "  const runnerScope = library ?? 'all'",
      '}'
    ].join('\n')

    expect(refreshLibraryScopesGlobalFlagToUnscopedCallsOnly(preFixShape)).toBe(
      false
    )
  })

  it('self-test: the gate REJECTS a shape that derives scopedRunner but never actually branches on it before setting the global flags', () => {
    const unguardedShape = [
      '{',
      '  if (this.state.refreshing) return',
      "  const scopedRunner = library && library !== 'all' ? library : undefined",
      '  this.setState({',
      '    refreshing: true,',
      '    refreshingInTheBackground: runInBackground',
      '  })',
      '}'
    ].join('\n')

    expect(
      refreshLibraryScopesGlobalFlagToUnscopedCallsOnly(unguardedShape)
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// (c) .refresh() honors its `library` parameter through to the FINAL
//     setState — a scoped call only overwrites that one runner's slice.
// ---------------------------------------------------------------------------

function refreshScopesFetchAndFinalSetStatePerRunner(block: string): boolean {
  const derivesIncludes =
    /const\s+includesEpic\s*=\s*!scopedRunner\s*\|\|\s*scopedRunner\s*===\s*'legendary'/.test(
      block
    ) &&
    /const\s+includesGog\s*=\s*!scopedRunner\s*\|\|\s*scopedRunner\s*===\s*'gog'/.test(
      block
    ) &&
    /const\s+includesZoom\s*=\s*!scopedRunner\s*\|\|\s*scopedRunner\s*===\s*'zoom'/.test(
      block
    ) &&
    /const\s+includesAmazon\s*=\s*!scopedRunner\s*\|\|\s*scopedRunner\s*===\s*'nile'/.test(
      block
    )

  const finalWritesGuarded =
    /if\s*\(includesEpic\)\s*{\s*next\.epic\s*=/.test(block) &&
    /if\s*\(includesGog\)\s*{\s*next\.gog\s*=/.test(block) &&
    /if\s*\(includesZoom\)\s*{\s*next\.zoom\s*=/.test(block) &&
    /if\s*\(includesAmazon\)\s*{\s*next\.amazon\s*=/.test(block)

  const finalFlagIdx = block.indexOf('next.refreshing = false')
  if (finalFlagIdx === -1) return false
  const before = block.slice(Math.max(0, finalFlagIdx - 150), finalFlagIdx)
  const finalFlagGuardedByNoScope = /if\s*\(!scopedRunner\)\s*{/.test(before)

  const scopedFinalWrite =
    /next\.refreshingByRunner\s*=\s*{\s*\.\.\.prevState\.refreshingByRunner,\s*\[scopedRunner\]:\s*false\s*}/.test(
      block
    )

  return (
    derivesIncludes &&
    finalWritesGuarded &&
    finalFlagGuardedByNoScope &&
    scopedFinalWrite
  )
}

describe('GlobalState.tsx refresh() — a scoped library arg only overwrites that runner slice (debug/login-logout-wipes-library item c)', () => {
  const rawSource = readFileSync(globalStatePath, 'utf-8')
  const stripped = stripSourceComments(rawSource)

  it('the real source gates every fetch AND the final setState per includesX, including the global-flag write', () => {
    const block = extractBlock(stripped, 'refresh = async (')
    expect(refreshScopesFetchAndFinalSetStatePerRunner(block)).toBe(true)
  })

  it('self-test: the gate ACCEPTS the exact shape the fix produces (positive control)', () => {
    const correctShape = [
      '{',
      "  const scopedRunner = library && library !== 'all' ? library : undefined",
      "  const includesEpic = !scopedRunner || scopedRunner === 'legendary'",
      "  const includesGog = !scopedRunner || scopedRunner === 'gog'",
      "  const includesZoom = !scopedRunner || scopedRunner === 'zoom'",
      "  const includesAmazon = !scopedRunner || scopedRunner === 'nile'",
      '',
      '  this.setState((prevState: StateProps) => {',
      '    const next: Partial<StateProps> = {}',
      '    if (includesEpic) {',
      '      next.epic = { library: epicLibrary, username: epic.username }',
      '    }',
      '    if (includesGog) {',
      '      next.gog = { library: gogLibrary, username: gog.username }',
      '    }',
      '    if (includesZoom) {',
      '      next.zoom = { library: zoomLibrary, username: zoom.username, enabled: zoom.enabled }',
      '    }',
      '    if (includesAmazon) {',
      '      next.amazon = { library: amazonLibrary, user_id: amazon.user_id, username: amazon.username }',
      '    }',
      '    if (!scopedRunner) {',
      '      next.refreshing = false',
      '      next.refreshingInTheBackground = true',
      '    } else {',
      '      next.refreshingByRunner = {',
      '        ...prevState.refreshingByRunner,',
      '        [scopedRunner]: false',
      '      }',
      '    }',
      '    return next',
      '  })',
      '}'
    ].join('\n')

    expect(refreshScopesFetchAndFinalSetStatePerRunner(correctShape)).toBe(true)
  })

  it('self-test: the gate REJECTS the pre-fix shape that always overwrote all four slices and the global flags unconditionally', () => {
    const preFixShape = [
      '{',
      '  this.setState({',
      '    epic: { library: epicLibrary, username: epic.username },',
      '    gog: { library: gogLibrary, username: gog.username },',
      '    zoom: { library: zoomLibrary, username: zoom.username, enabled: zoom.enabled },',
      '    amazon: { library: amazonLibrary, user_id: amazon.user_id, username: amazon.username },',
      '    refreshing: false,',
      '    refreshingInTheBackground: true',
      '  })',
      '}'
    ].join('\n')

    expect(refreshScopesFetchAndFinalSetStatePerRunner(preFixShape)).toBe(false)
  })

  it('self-test: the gate REJECTS a shape that scopes the fetch branches but leaves the final setState unconditional (specialist-flagged no-op regression)', () => {
    const fetchOnlyScopedShape = [
      '{',
      "  const scopedRunner = library && library !== 'all' ? library : undefined",
      "  const includesEpic = !scopedRunner || scopedRunner === 'legendary'",
      "  const includesGog = !scopedRunner || scopedRunner === 'gog'",
      "  const includesZoom = !scopedRunner || scopedRunner === 'zoom'",
      "  const includesAmazon = !scopedRunner || scopedRunner === 'nile'",
      "  if (includesEpic) { epicLibrary = libraryStore.get('library', []) }",
      '  if (includesGog) { gogLibrary = this.loadGOGLibrary(overrides) }',
      '  if (includesZoom) { zoomLibrary = this.loadZoomLibrary(overrides) }',
      "  if (includesAmazon) { amazonLibrary = nileLibraryStore.get('library', []) }",
      '  this.setState({',
      '    epic: { library: epicLibrary, username: epic.username },',
      '    gog: { library: gogLibrary, username: gog.username },',
      '    zoom: { library: zoomLibrary, username: zoom.username, enabled: zoom.enabled },',
      '    amazon: { library: amazonLibrary, user_id: amazon.user_id, username: amazon.username },',
      '    refreshing: false,',
      '    refreshingInTheBackground: true',
      '  })',
      '}'
    ].join('\n')

    expect(
      refreshScopesFetchAndFinalSetStatePerRunner(fetchOnlyScopedShape)
    ).toBe(false)
  })
})
