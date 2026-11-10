/**
 * Gate over libraryState.refreshLibrary, the mount-time refresh gate and the
 * refreshLibrary call sites (Gap cycle 4, plan 34.5-33, Routing item 2).
 *
 * Phase 69-18 moved refreshLibrary out of the GlobalState class into
 * libraryState, so the first three describe blocks are BEHAVIOURAL: they run
 * the real store action (and `runMountLibraryRefresh`) against a fake
 * `window.api` and assert on what was logged, flagged and called. Each keeps
 * a positive control and a near-miss self-test: a regressed implementation
 * (the old `Refreshing ${library} Library` line, a global-flag write for a
 * scoped call, a mount gate without Steam, a missing failure reset) is run
 * through the SAME probe and assertion and must fail it.
 *
 * The last block stays source-text: it pins the nine external call sites'
 * fixed-literal origins (T-34.5-47-01), which gate code that did not move.
 * None of those host components can be imported under this project's
 * `node`-environment frontend jest project.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import '../../testUtils/tauriWindow'
import { resetAllStores } from '../storeKit'
import useLibraryState from '../libraryState'
import type { RefreshLibraryOptions } from '../libraryState'
import { runMountLibraryRefresh } from '../initStateSubscriptions'

const stateDir = join(__dirname, '..')

type RefreshImpl = (options: RefreshLibraryOptions) => Promise<void>

interface Probe {
  infos: string[]
  errors: string[]
  fetched: unknown[]
  /** global flags and the per-runner map as seen while the backend call ran */
  duringFetch: {
    refreshing: boolean
    refreshingInTheBackground: boolean
    byRunner: Partial<Record<string, boolean>>
  } | null
}

function installFakeApi(probe: Probe, backendFails = false): void {
  ;(window as unknown as { api: unknown }).api = {
    logInfo: (m: string) => probe.infos.push(m),
    logError: (m: string) => probe.errors.push(m),
    refreshLibrary: async (runner: unknown) => {
      probe.fetched.push(runner)
      const s = useLibraryState.getState()
      probe.duringFetch = {
        refreshing: s.refreshing,
        refreshingInTheBackground: s.refreshingInTheBackground,
        byRunner: { ...s.refreshingByRunner }
      }
      if (backendFails) throw new Error('boom')
    }
  }
}

function newProbe(): Probe {
  return { infos: [], errors: [], fetched: [], duringFetch: null }
}

/** Runs `impl` the way the app calls it, against a fresh probe. */
async function run(
  impl: RefreshImpl,
  options: RefreshLibraryOptions,
  backendFails = false
): Promise<Probe> {
  const probe = newProbe()
  installFakeApi(probe, backendFails)
  useLibraryState.setState({
    refresh: async () => undefined,
    refreshing: false,
    refreshingInTheBackground: true,
    refreshingByRunner: {}
  })
  await impl(options)
  return probe
}

const realImpl: RefreshImpl = (o) =>
  useLibraryState.getState().refreshLibrary(o)

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

// Files holding the internal `origin:` literals (69-19: handleGameStatus's two
// game-status call sites now live in libraryState.ts).
const INTERNAL_FILES = [
  'libraryState.ts',
  'initStateSubscriptions.ts',
  'authState.ts'
]

describe('refreshLibrary internal call sites thread their fixed origin literal', () => {
  const stripped = INTERNAL_FILES.map((f) =>
    stripSourceComments(readFileSync(join(stateDir, f), 'utf-8'))
  ).join('\n')

  it.each([
    ['handleSuccessfulLogin', 'login-success', 1],
    ['handleRefreshLibrary receiver (push)', 'push', 1],
    [
      'handleGameStatus (checkForUpdates + done/error branches)',
      'game-status',
      2
    ],
    ['mount-time refresh', 'mount', 1],
    ['steamLogin', 'steam-login', 1]
  ])(
    '%s call site threads origin=%s exactly %i time(s)',
    (_label: string, originValue: string, expectedCount: number) => {
      expect(countOriginLiteral(stripped, originValue)).toBe(expectedCount)
    }
  )

  it('self-test: a source without the literal counts zero', () => {
    expect(countOriginLiteral('void refreshLibrary({})', 'push')).toBe(0)
  })
})

function logLineIsAttributedAndNeverUndefined(probe: Probe): boolean {
  return (
    probe.infos.length === 1 &&
    /^\[refreshLibrary\] runner=[a-z]+ origin=[a-z-]+$/.test(
      probe.infos[0] ?? ''
    ) &&
    !(probe.infos[0] ?? '').includes('undefined')
  )
}

/** The pre-34.5-33 shape: prints the literal word undefined for no runner. */
const staleImpl: RefreshImpl = async ({ library }) => {
  window.api.logInfo(`Refreshing ${library} Library`)
}

/** Coalesces to "all" but drops the origin field. */
const noOriginImpl: RefreshImpl = async ({ library }) => {
  window.api.logInfo(`[refreshLibrary] runner=${library ?? 'all'}`)
}

function failureResetsFlags(
  probe: Probe,
  flagsAfter: {
    refreshing: boolean
    byRunner: Partial<Record<string, boolean>>
  }
): boolean {
  return (
    probe.errors.length === 1 &&
    probe.errors[0] === 'Library refresh failed: Error: boom' &&
    flagsAfter.refreshing === false &&
    flagsAfter.byRunner.gog === false
  )
}

/** Same as the real action but never resets after a failed backend call. */
const noResetImpl: RefreshImpl = async ({ library }) => {
  useLibraryState.setState({
    refreshing: true,
    refreshingByRunner: { [library as string]: true }
  })
  try {
    await window.api.refreshLibrary(library)
  } catch (error) {
    window.api.logError(`Library refresh failed: ${String(error)}`)
  }
}

describe('libraryState.refreshLibrary — origin-tagged, never prints undefined (gap cycle 4, item 2)', () => {
  afterEach(() => {
    resetAllStores()
  })

  it('coalesces an omitted runner to "all" and emits one runner=/origin= line, never the word undefined', async () => {
    const probe = await run(realImpl, {
      checkForUpdates: false,
      origin: 'mount'
    })
    expect(probe.infos).toEqual(['[refreshLibrary] runner=all origin=mount'])
    expect(logLineIsAttributedAndNeverUndefined(probe)).toBe(true)
  })

  it('names the runner and defaults the origin to unknown', async () => {
    const probe = await run(realImpl, {
      checkForUpdates: false,
      library: 'gog'
    })
    expect(probe.infos).toEqual(['[refreshLibrary] runner=gog origin=unknown'])
  })

  it('returns early when a global refresh is already running', async () => {
    const probe = newProbe()
    installFakeApi(probe)
    useLibraryState.setState({ refreshing: true })
    await realImpl({ checkForUpdates: false })
    expect(probe.infos).toEqual([])
    expect(probe.fetched).toEqual([])
  })

  it('returns early for a runner already refreshing, not for a different runner', async () => {
    const probe = newProbe()
    installFakeApi(probe)
    useLibraryState.setState({
      refreshingByRunner: { gog: true },
      refresh: async () => undefined
    })
    await realImpl({ checkForUpdates: false, library: 'gog' })
    expect(probe.fetched).toEqual([])
    await realImpl({ checkForUpdates: false, library: 'nile' })
    expect(probe.fetched).toEqual(['nile'])
  })

  it('on a backend failure logs once and resets the global and the per-runner flag', async () => {
    const probe = await run(
      realImpl,
      { checkForUpdates: false, library: 'gog' },
      true
    )
    const s = useLibraryState.getState()
    expect(
      failureResetsFlags(probe, {
        refreshing: s.refreshing,
        byRunner: s.refreshingByRunner
      })
    ).toBe(true)
  })

  it('self-test: the probe ACCEPTS the real action (positive control)', async () => {
    const probe = await run(realImpl, {
      checkForUpdates: false,
      library: 'gog'
    })
    expect(logLineIsAttributedAndNeverUndefined(probe)).toBe(true)
  })

  it('self-test: the probe REJECTS the stale `Refreshing ${library} Library` shape', async () => {
    const probe = await run(staleImpl, { checkForUpdates: false })
    expect(probe.infos).toEqual(['Refreshing undefined Library'])
    expect(logLineIsAttributedAndNeverUndefined(probe)).toBe(false)
  })

  it('self-test: the probe REJECTS a shape that coalesces to "all" but drops origin', async () => {
    const probe = await run(noOriginImpl, { checkForUpdates: false })
    expect(logLineIsAttributedAndNeverUndefined(probe)).toBe(false)
  })

  it('self-test: the failure check REJECTS an implementation that never resets after a failed call', async () => {
    const probe = await run(
      noResetImpl,
      { checkForUpdates: false, library: 'gog' },
      true
    )
    const s = useLibraryState.getState()
    expect(
      failureResetsFlags(probe, {
        refreshing: s.refreshing,
        byRunner: s.refreshingByRunner
      })
    ).toBe(false)
  })
})

describe('runMountLibraryRefresh — the mount-time refresh gate includes Steam (debug/steam-refresh-hung-on-startup)', () => {
  type Users = Parameters<typeof runMountLibraryRefresh>[0]
  const noUsers: Users = {
    legendaryUser: false,
    gogUser: false,
    amazonUser: false,
    steamUser: false
  }

  /** Runs a gate against the store and returns the refreshLibrary calls. */
  function mountCalls(gate: (users: Users) => void, users: Users) {
    const seen: RefreshLibraryOptions[] = []
    useLibraryState.setState({
      refreshLibrary: async (o) => {
        seen.push(o)
      }
    })
    gate(users)
    return seen
  }

  /** The pre-fix gate: no steamUser in the condition. */
  const preFixGate = (users: Users) => {
    if (users.legendaryUser || users.gogUser || users.amazonUser) {
      void useLibraryState.getState().refreshLibrary({
        checkForUpdates: true,
        runInBackground: false,
        origin: 'mount'
      })
    }
  }

  const gateRefreshesForSteamOnly = (gate: (users: Users) => void): boolean => {
    const seen = mountCalls(gate, { ...noUsers, steamUser: true })
    return seen.length === 1 && seen[0]?.origin === 'mount'
  }

  afterEach(() => {
    resetAllStores()
  })

  it('a Steam-only user triggers the mount refresh with origin mount and checkForUpdates true', () => {
    const seen = mountCalls(runMountLibraryRefresh, {
      ...noUsers,
      steamUser: true
    })
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ checkForUpdates: true, origin: 'mount' })
  })

  it.each(['legendaryUser', 'gogUser', 'amazonUser'] as const)(
    'a %s alone triggers it',
    (key) => {
      expect(
        mountCalls(runMountLibraryRefresh, { ...noUsers, [key]: true })
      ).toHaveLength(1)
    }
  )

  it('no user triggers nothing', () => {
    expect(mountCalls(runMountLibraryRefresh, noUsers)).toEqual([])
  })

  it('self-test: the check ACCEPTS the real gate (positive control)', () => {
    expect(gateRefreshesForSteamOnly(runMountLibraryRefresh)).toBe(true)
  })

  it('self-test: the check REJECTS the pre-fix gate that omits steamUser', () => {
    expect(gateRefreshesForSteamOnly(preFixGate)).toBe(false)
  })
})

describe('libraryState.refreshLibrary — scopes the global refreshing flags to unscoped calls only (debug/login-logout-wipes-library item b)', () => {
  const scopesGlobalFlagsToUnscopedCallsOnly = async (
    impl: RefreshImpl
  ): Promise<boolean> => {
    const scoped = await run(impl, {
      checkForUpdates: false,
      runInBackground: false,
      library: 'gog'
    })
    const unscoped = await run(impl, {
      checkForUpdates: false,
      runInBackground: false
    })
    return (
      scoped.duringFetch?.refreshing === false &&
      scoped.duringFetch.byRunner.gog === true &&
      unscoped.duringFetch?.refreshing === true &&
      unscoped.duringFetch.refreshingInTheBackground === false &&
      unscoped.duringFetch.byRunner.gog === undefined
    )
  }

  /** The pre-fix shape: sets the global flags for every call, scoped or not. */
  const unconditionalImpl: RefreshImpl = async ({
    library,
    runInBackground = true
  }) => {
    useLibraryState.setState({
      refreshing: true,
      refreshingInTheBackground: runInBackground
    })
    await window.api.refreshLibrary(library)
  }

  afterEach(() => {
    resetAllStores()
  })

  it('the real action sets global flags only for an unscoped call and refreshingByRunner only for a scoped one', async () => {
    expect(await scopesGlobalFlagsToUnscopedCallsOnly(realImpl)).toBe(true)
  })

  it('self-test: the probe REJECTS the pre-fix unconditional global-flag shape', async () => {
    expect(await scopesGlobalFlagsToUnscopedCallsOnly(unconditionalImpl)).toBe(
      false
    )
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
describe('refreshLibrary — nine EXTERNAL call sites thread a unique fixed-literal origin (plan 34.5-47)', () => {
  const EXTERNAL_CALL_SITES: Array<[string, string]> = [
    ['../../screens/Login/index.tsx', 'login-screen'],
    [
      '../../components/UI/NavShell/components/NavTabs/index.tsx',
      'nav-tabs-games-tab'
    ],
    ['../../components/UI/Header/index.tsx', 'action-icons-refresh-button'],
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

  const internalSourceStripped = INTERNAL_FILES.map((f) =>
    stripSourceComments(readFileSync(join(stateDir, f), 'utf-8'))
  ).join('\n')

  it.each(EXTERNAL_CALL_SITES)(
    '%s threads origin: %s exactly once (exact-count, not >= 1)',
    (relPath: string, originValue: string) => {
      const entry = externalSources.find((s) => s.relPath === relPath)
      expect(entry).toBeDefined()
      expect(countOriginLiteral(entry!.stripped, originValue)).toBe(1)
    }
  )

  it('every origin: key across all nine external call sites AND the internal call sites is a fixed single-quoted string literal — never a template literal, double-quoted string, or bare identifier', () => {
    const concatenated =
      externalSources.map((s) => s.stripped).join('\n') +
      '\n' +
      internalSourceStripped
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
