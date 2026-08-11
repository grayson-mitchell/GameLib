/**
 * Source-text structural gate for GlobalState.tsx's `refreshLibrary` method
 * and its call sites (Gap cycle 4, plan 34.5-33, Routing item 2).
 *
 * GlobalState.tsx cannot be imported directly under this project's
 * `node`-environment frontend jest project (see jest.config.js's docstring —
 * no jsdom/react-test-renderer installed): the module reads
 * `window.localStorage` at MODULE SCOPE (`const storage: Storage =
 * window.localStorage`), so a bare `import` throws `window is not defined`
 * before a single test could even run. This mirrors
 * `GlobalStateSteamLogout.test.ts`'s own documented DOM-less constraint and
 * follows the identical pattern: read the real source, strip comments (so
 * the fix's own prose can't fool a naive match), and assert the exact
 * method-body/call-site shape.
 *
 * What this proves: the `refreshLibrary` log line can never print the
 * literal word `undefined` (it coalesces an omitted `library` to `'all'`
 * BEFORE interpolation, matching the semantics `window.api.refreshLibrary
 * (undefined)` already carries at `main.ts:1051` and, after plan 34.5-33
 * Task 1, in the sidecar handler too), that it names an `origin` alongside
 * the runner, and that every internal call site threads a distinct `origin`
 * value naming its own trigger. It does NOT prove the runtime string a real
 * invocation would log — that requires either a jsdom-enabled test project
 * (not installed) or a real `pnpm tauri:dev` session with `gamelib.log`
 * grepped for the `origin=` field, which is the live observable plan
 * 34.5-33's own objective names as authoritative.
 *
 * Self-tested against synthetic merged/regressed sources per this project's
 * own anti-vacuity requirement — a source-text gate without a self-test is
 * a vacuous gate (the exact lesson Phase 34.2's gap cycles paid for).
 *
 * EXTENDED (plan 34.5-47, T-34.5-47-01): a third top-level describe below
 * pins the nine PRODUCTION `refreshLibrary` call sites living OUTSIDE this
 * file (Login, NavTabs, ActionIcons, ErrorComponent, RedeemSteamKeyDialog,
 * ClearCache, EgsSettings, ConsoleMode, SideloadDialog) plus a literal-only
 * security rule (`everyOriginIsAFixedStringLiteral`) applied to all nine of
 * those sources concatenated with GlobalState.tsx's own. None of the nine
 * host components can be imported under this project's `node`-environment
 * frontend jest project either — several read `window.api`/`window.location`
 * at module or render scope — so this is a source-text gate for the same
 * documented reason as the two blocks above, not a stylistic choice. It does
 * NOT prove the runtime `origin=` string a real session logs (that stays
 * `U-34.5-08`'s live-only remainder); it proves the nine call sites' SOURCE
 * TEXT cannot regress to an unattributed or forgeable form. RED-proven by
 * physically reverting the `ConsoleMode/index.tsx` edit and confirming the
 * `console-mode-mount` row fails naming that value, then restoring it and
 * confirming green again (verbatim output in `34.5-47-SUMMARY.md`).
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

/**
 * The gate under test: the `refreshLibrary` method body must (a) never
 * contain the old broken template `Refreshing ${library} Library` (which
 * printed the literal word `undefined` whenever `library` was omitted), (b)
 * coalesce an omitted `library` to `'all'` before interpolation, and (c)
 * emit a `[refreshLibrary] runner=... origin=...` shaped log line naming
 * both fields.
 */
function refreshLibraryLogLineNeverPrintsUndefined(
  strippedSource: string
): boolean {
  let block: string
  try {
    block = extractBlock(
      strippedSource,
      '}: RefreshLibraryOptions): Promise<void> => '
    )
  } catch {
    return false
  }

  const hasOldBrokenTemplate =
    /Refreshing\s*\$\{\s*library\s*\}\s*Library/.test(block)
  const coalescesRunnerScope = /library\s*\?\?\s*['"]all['"]/.test(block)
  const emitsRunnerOriginLine =
    /\[refreshLibrary\]\s*runner=\$\{[^}]+\}\s*origin=\$\{[^}]+\}/.test(block)

  return !hasOldBrokenTemplate && coalescesRunnerScope && emitsRunnerOriginLine
}

/**
 * The `refreshing` guard and its failure-path reset must be byte-identical
 * to their pre-task form — out of scope for this plan (their own defect
 * history, `debug/steam-relogin-no-autorefresh`, is unrelated).
 */
function refreshingGuardAndResetUnchanged(strippedSource: string): boolean {
  const hasGuard = strippedSource.includes('if (this.state.refreshing) return')
  const hasReset = strippedSource.includes(
    'this.setState({ refreshing: false })'
  )
  return hasGuard && hasReset
}

/**
 * Counts how many times an exact `origin: '<value>'` literal appears.
 * Deliberately generic over ANY stripped source string, not only
 * GlobalState.tsx's — plan 34.5-47 reuses it unchanged against the nine
 * external call-site files' stripped sources below.
 */
function countOriginLiteral(strippedSource: string, value: string): number {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matches = strippedSource.match(
    new RegExp(`origin:\\s*'${escaped}'`, 'g')
  )
  return matches?.length ?? 0
}

/**
 * The T-34.5-47-01 mitigation as an executable gate. Scans every `origin:`
 * KEY occurrence (object-literal property syntax — deliberately does NOT
 * match the `origin = 'unknown'` DESTRUCTURING DEFAULT in GlobalState.tsx's
 * own signature, which uses `=` not `:` and is intentionally left alone by
 * this plan) and requires the value immediately following the colon to be a
 * single-quoted string literal containing no backslash (which also rejects
 * any `\n`-style escape), no `${` interpolation marker, and nothing else —
 * no template literal, no double-quoted string, no bare identifier, no
 * function call. Returns `false` on the FIRST `origin:` occurrence that
 * fails this shape; `true` only if every occurrence in the given source
 * passes.
 */
function everyOriginIsAFixedStringLiteral(source: string): boolean {
  const originKeyRegex = /origin\s*:\s*/g
  let match: RegExpExecArray | null
  while ((match = originKeyRegex.exec(source)) !== null) {
    const rest = source.slice(match.index + match[0].length)
    if (rest[0] !== "'") return false
    const closingIdx = rest.indexOf("'", 1)
    if (closingIdx === -1) return false
    const inner = rest.slice(1, closingIdx)
    if (inner.includes('\\')) return false
    if (inner.includes('${')) return false
    if (inner.includes('\n')) return false
  }
  return true
}

/**
 * debug/steam-refresh-hung-on-startup: the mount-time "refresh everything"
 * call (the sole `origin: 'mount'` call site) MUST include a Steam-login
 * check in its gating condition. A Steam-only session (no Epic/GOG/Amazon/
 * Zoom account) was previously excluded from this gate entirely, so
 * SteamLibraryManager.refresh() never ran on startup and the "Syncing your
 * Steam library…" spinner (true by default) never cleared. Asserts both
 * that a `steamUser` variable is derived from `steamConfigStore.has(...)`
 * (mirroring the existing gogUser/amazonUser/zoomUser pattern) and that it
 * appears in the `if (...)` condition immediately gating the `origin:
 * 'mount'` refreshLibrary call.
 */
function mountGateIncludesSteamUser(strippedSource: string): boolean {
  const definesSteamUser =
    /const\s+steamUser\s*=\s*steamConfigStore\.has\(\s*['"]userData['"]\s*\)/.test(
      strippedSource
    )

  const mountIdx = strippedSource.indexOf("origin: 'mount'")
  if (mountIdx === -1) return false

  const windowStart = Math.max(0, mountIdx - 800)
  const before = strippedSource.slice(windowStart, mountIdx)
  const ifIdx = before.lastIndexOf('if (')
  if (ifIdx === -1) return false
  const condition = before.slice(ifIdx)

  return definesSteamUser && /steamUser/.test(condition)
}

describe('GlobalState.tsx refreshLibrary — origin-tagged, never prints undefined (gap cycle 4, item 2)', () => {
  const rawSource = readFileSync(globalStatePath, 'utf-8')
  const stripped = stripSourceComments(rawSource)

  it('the real source coalesces an omitted runner to "all" and emits a runner=/origin= log line, never the literal word undefined', () => {
    expect(refreshLibraryLogLineNeverPrintsUndefined(stripped)).toBe(true)
  })

  it('the real source contains no trace of the old broken `Refreshing ${library} Library` template', () => {
    expect(/Refreshing\s*\$\{\s*library\s*\}\s*Library/.test(stripped)).toBe(
      false
    )
  })

  it('the refreshing guard and its catch-block reset are unchanged', () => {
    expect(refreshingGuardAndResetUnchanged(stripped)).toBe(true)
  })

  // Candidate emitters for the three undefined-runner lines observed at
  // 19:23:09, 19:24:30 and 19:25:30 (per this plan's own <interfaces>
  // block) are backend/sidecar-side pushes with no runner argument
  // (main.ts:789, shellFilesFlowRegistration.ts:274) — NOT any of these six
  // frontend call sites, which is exactly why each one below can be
  // statically proven to carry an explicit origin already.
  it.each([
    ['handleSuccessfulLogin', 'login-success', 1],
    ['handleRefreshLibrary receiver (push)', 'push', 1],
    ['libraryStatus (checkForUpdates + done/error branches)', 'game-status', 2],
    ['componentDidMount', 'mount', 1],
    ['steamLogin', 'steam-login', 1]
  ])(
    '%s call site threads origin=%s exactly %i time(s)',
    (_label: string, originValue: string, expectedCount: number) => {
      expect(countOriginLiteral(stripped, originValue)).toBe(expectedCount)
    }
  )

  it('self-test: the gate ACCEPTS the exact shape the fix produces (positive control)', () => {
    const correctShape = [
      'class GlobalState {',
      '  refreshLibrary = async ({',
      '    checkForUpdates,',
      '    runInBackground = true,',
      '    library = undefined,',
      "    origin = 'unknown'",
      '  }: RefreshLibraryOptions): Promise<void> => {',
      '    if (this.state.refreshing) return',
      '',
      "    const runnerScope = library ?? 'all'",
      '    window.api.logInfo(`[refreshLibrary] runner=${runnerScope} origin=${origin}`)',
      '    try {',
      '      await window.api.refreshLibrary(library)',
      '      return await this.refresh(library, checkForUpdates)',
      '    } catch (error) {',
      '      window.api.logError(`Library refresh failed: ${String(error)}`)',
      '      this.setState({ refreshing: false })',
      '    }',
      '  }',
      '}'
    ].join('\n')

    expect(refreshLibraryLogLineNeverPrintsUndefined(correctShape)).toBe(true)
    expect(refreshingGuardAndResetUnchanged(correctShape)).toBe(true)
  })

  it('self-test: the gate REJECTS the exact stale broken-template shape being reinstated (the hand RED-proof mutation)', () => {
    const staleShape = [
      'class GlobalState {',
      '  refreshLibrary = async ({',
      '    checkForUpdates,',
      '    runInBackground = true,',
      '    library = undefined,',
      "    origin = 'unknown'",
      '  }: RefreshLibraryOptions): Promise<void> => {',
      '    if (this.state.refreshing) return',
      '',
      '    window.api.logInfo(`Refreshing ${library} Library`)',
      '    try {',
      '      await window.api.refreshLibrary(library)',
      '      return await this.refresh(library, checkForUpdates)',
      '    } catch (error) {',
      '      window.api.logError(`Library refresh failed: ${String(error)}`)',
      '      this.setState({ refreshing: false })',
      '    }',
      '  }',
      '}'
    ].join('\n')

    expect(refreshLibraryLogLineNeverPrintsUndefined(staleShape)).toBe(false)
  })

  it('self-test: the gate REJECTS a shape that coalesces to "all" but drops the origin field entirely (a regression back to the un-attributed line)', () => {
    const noOriginShape = [
      'class GlobalState {',
      '  refreshLibrary = async ({',
      '    checkForUpdates,',
      '    runInBackground = true,',
      '    library = undefined',
      '  }: RefreshLibraryOptions): Promise<void> => {',
      '    if (this.state.refreshing) return',
      '',
      "    const runnerScope = library ?? 'all'",
      '    window.api.logInfo(`[refreshLibrary] runner=${runnerScope}`)',
      '    try {',
      '      await window.api.refreshLibrary(library)',
      '      return await this.refresh(library, checkForUpdates)',
      '    } catch (error) {',
      '      window.api.logError(`Library refresh failed: ${String(error)}`)',
      '      this.setState({ refreshing: false })',
      '    }',
      '  }',
      '}'
    ].join('\n')

    expect(refreshLibraryLogLineNeverPrintsUndefined(noOriginShape)).toBe(false)
  })

  it('self-test: refreshingGuardAndResetUnchanged REJECTS a shape missing the catch-block reset', () => {
    const missingResetShape = [
      'refreshLibrary = async () => {',
      '  if (this.state.refreshing) return',
      '  try {',
      '    await window.api.refreshLibrary(library)',
      '  } catch (error) {',
      '    window.api.logError(String(error))',
      '  }',
      '}'
    ].join('\n')

    expect(refreshingGuardAndResetUnchanged(missingResetShape)).toBe(false)
  })
})

describe('GlobalState.tsx componentDidMount — mount-time refresh gate includes Steam (debug/steam-refresh-hung-on-startup)', () => {
  const rawSource = readFileSync(globalStatePath, 'utf-8')
  const stripped = stripSourceComments(rawSource)

  it('the real source derives steamUser from steamConfigStore and includes it in the origin:"mount" gate', () => {
    expect(mountGateIncludesSteamUser(stripped)).toBe(true)
  })

  it('self-test: the gate ACCEPTS the exact shape the fix produces (positive control)', () => {
    const correctShape = [
      'async componentDidMount() {',
      "    const legendaryUser = configStore.has('userInfo')",
      "    const gogUser = gogConfigStore.has('userData')",
      "    const amazonUser = nileConfigStore.has('userData')",
      "    const zoomUser = zoomConfigStore.has('isLoggedIn')",
      "    const steamUser = steamConfigStore.has('userData')",
      '    if (legendaryUser || gogUser || amazonUser || steamUser || (zoom.enabled && zoomUser)) {',
      '      this.refreshLibrary({',
      '        checkForUpdates: true,',
      '        runInBackground: false,',
      "        origin: 'mount'",
      '      })',
      '    }',
      '}'
    ].join('\n')

    expect(mountGateIncludesSteamUser(correctShape)).toBe(true)
  })

  it('self-test: the gate REJECTS the pre-fix shape that omits steamUser entirely (the exact regression this test guards against)', () => {
    const preFixShape = [
      'async componentDidMount() {',
      "    const legendaryUser = configStore.has('userInfo')",
      "    const gogUser = gogConfigStore.has('userData')",
      "    const amazonUser = nileConfigStore.has('userData')",
      "    const zoomUser = zoomConfigStore.has('isLoggedIn')",
      '    if (legendaryUser || gogUser || amazonUser || (zoom.enabled && zoomUser)) {',
      '      this.refreshLibrary({',
      '        checkForUpdates: true,',
      '        runInBackground: false,',
      "        origin: 'mount'",
      '      })',
      '    }',
      '}'
    ].join('\n')

    expect(mountGateIncludesSteamUser(preFixShape)).toBe(false)
  })

  it('self-test: the gate REJECTS a shape that defines steamUser but forgets to add it to the if-condition', () => {
    const definedButUnusedShape = [
      'async componentDidMount() {',
      "    const legendaryUser = configStore.has('userInfo')",
      "    const gogUser = gogConfigStore.has('userData')",
      "    const amazonUser = nileConfigStore.has('userData')",
      "    const zoomUser = zoomConfigStore.has('isLoggedIn')",
      "    const steamUser = steamConfigStore.has('userData')",
      '    if (legendaryUser || gogUser || amazonUser || (zoom.enabled && zoomUser)) {',
      '      this.refreshLibrary({',
      '        checkForUpdates: true,',
      '        runInBackground: false,',
      "        origin: 'mount'",
      '      })',
      '    }',
      '}'
    ].join('\n')

    expect(mountGateIncludesSteamUser(definedButUnusedShape)).toBe(false)
  })
})

/**
 * Plan 34.5-47 (T-34.5-47-01, Task 2): the nine PRODUCTION `refreshLibrary`
 * call sites living OUTSIDE GlobalState.tsx, plus the literal-only origin
 * rule applied to all fifteen call sites (six internal + nine external)
 * combined. Reads the REAL production source of each of the nine files with
 * `readFileSync` + `stripSourceComments` — never a reconstruction of the
 * call site — per this project's own `test-must-exercise-production-call-
 * shape` standing rule.
 */
describe('GlobalState.tsx refreshLibrary — nine EXTERNAL call sites thread a unique fixed-literal origin (plan 34.5-47)', () => {
  const EXTERNAL_CALL_SITES: Array<[string, string]> = [
    ['../../screens/Login/index.tsx', 'login-screen'],
    [
      '../../components/UI/NavShell/components/NavTabs/index.tsx',
      'nav-tabs-games-tab'
    ],
    [
      '../../components/UI/ActionIcons/index.tsx',
      'action-icons-refresh-button'
    ],
    ['../../components/UI/ErrorComponent/index.tsx', 'error-component-retry'],
    ['../../components/UI/RedeemSteamKeyDialog/index.tsx', 'redeem-steam-key'],
    ['../../screens/Settings/components/ClearCache.tsx', 'clear-cache'],
    ['../../screens/Settings/components/EgsSettings.tsx', 'egs-sync'],
    ['../../screens/ConsoleMode/index.tsx', 'console-mode-mount'],
    [
      '../../screens/Library/components/InstallModal/SideloadDialog/index.tsx',
      'sideload-add-app'
    ]
  ]

  const externalSources = EXTERNAL_CALL_SITES.map(([relPath, originValue]) => ({
    relPath,
    originValue,
    stripped: stripSourceComments(
      readFileSync(join(__dirname, relPath), 'utf-8')
    )
  }))

  const globalStateSourceStripped = stripSourceComments(
    readFileSync(globalStatePath, 'utf-8')
  )

  it.each(EXTERNAL_CALL_SITES)(
    '%s threads origin: %s exactly once (exact-count, not >= 1)',
    (relPath: string, originValue: string) => {
      const entry = externalSources.find((s) => s.relPath === relPath)
      expect(entry).toBeDefined()
      expect(countOriginLiteral(entry!.stripped, originValue)).toBe(1)
    }
  )

  it('every origin: key across all nine external call sites AND GlobalState.tsx is a fixed single-quoted string literal — never a template literal, double-quoted string, or bare identifier', () => {
    const concatenated =
      externalSources.map((s) => s.stripped).join('\n') +
      '\n' +
      globalStateSourceStripped
    expect(everyOriginIsAFixedStringLiteral(concatenated)).toBe(true)
  })

  describe('self-test (anti-vacuity)', () => {
    it('ACCEPTS the exact shape Task 1 produces (positive control)', () => {
      const correctShape =
        "void refreshLibrary({\n  runInBackground: true,\n  origin: 'console-mode-mount'\n})"
      expect(everyOriginIsAFixedStringLiteral(correctShape)).toBe(true)
      expect(countOriginLiteral(correctShape, 'console-mode-mount')).toBe(1)
    })

    it('detects the origin key deleted from a call site (the pre-Task-1 regression) — count drops to zero, never treated as satisfied', () => {
      const regressedToPreTask1 =
        'void refreshLibrary({ runInBackground: true })'
      expect(
        countOriginLiteral(regressedToPreTask1, 'console-mode-mount')
      ).toBe(0)
    })

    it('REJECTS a template literal reintroducing interpolation', () => {
      const regressed =
        'refreshLibrary({ origin: `refresh-${runner}`, runInBackground: true })'
      expect(everyOriginIsAFixedStringLiteral(regressed)).toBe(false)
    })

    it('REJECTS a bare caller-supplied identifier', () => {
      const regressed =
        'refreshLibrary({ origin: originFromProps, runInBackground: true })'
      expect(everyOriginIsAFixedStringLiteral(regressed)).toBe(false)
    })

    it('REJECTS a double-quoted string standing in for the required single-quoted literal', () => {
      const regressed =
        'refreshLibrary({ origin: "console-mode-mount", runInBackground: true })'
      expect(everyOriginIsAFixedStringLiteral(regressed)).toBe(false)
    })

    it('REJECTS a single-quoted value carrying an embedded newline plus a forged [refreshLibrary] prefix — the log-injection/forged-attribution case T-34.5-47-01 names', () => {
      const regressed =
        "refreshLibrary({ origin: '\\n[refreshLibrary] runner=all origin=forged', runInBackground: true })"
      expect(everyOriginIsAFixedStringLiteral(regressed)).toBe(false)
    })

    it('does not false-positive on the origin = \'unknown\' destructuring DEFAULT (uses "=", not ":", and is deliberately untouched by this plan)', () => {
      const defaultOnly =
        "refreshLibrary = async ({ origin = 'unknown' }: RefreshLibraryOptions) => {}"
      expect(everyOriginIsAFixedStringLiteral(defaultOnly)).toBe(true)
    })
  })
})
