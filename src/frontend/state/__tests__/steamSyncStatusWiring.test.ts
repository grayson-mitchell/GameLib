/**
 * RED-proven source-shape gate for the `steamSyncStatus` channel (Phase
 * 34.15 Plan 02, D-06/D-07).
 *
 * WHY A SOURCE GATE. None of the five touchpoints this file proves can be
 * imported directly under this project's frontend jest project (no jsdom, no
 * CSS transform -- `GlobalState.tsx` reads `window.localStorage` at MODULE
 * SCOPE and dies at import with "window is not defined"; `Library/index.tsx`
 * / `InstallModal/index.tsx` open with a stylesheet import). This mirrors
 * `GlobalStateScopedRefresh.test.ts` and `filterChipRowPlacement.test.ts`'s
 * own documented DOM-less constraint: read the real source, strip comments,
 * and assert on the exact text shape.
 *
 * What this proves, one gate per obligation:
 *
 *   W1: `common/types/ipc/steam.ts` declares the `steamSyncStatus` channel.
 *   W2: `preload/api/steam.ts` exports the `handleSteamSyncStatus` listener
 *       slot -- THE HIGHEST-RISK OMISSION IN THE PHASE. For a
 *       backend->renderer push, the sidecar's `platform/index.ts`
 *       `pushFrontendMessage` forwarder is channel-agnostic (any string
 *       works, no allowlist on the emit side); if this export is missing,
 *       the backend emits fine, Rust forwards fine, and the renderer simply
 *       has nobody listening -- no compile error, no runtime error, nothing
 *       arrives. Ledgered: `sidecar-send-channels-fail-silently`.
 *   W3: BEHAVIOURAL (69-18). The boot listener `initStateSubscriptions`
 *       registers for `handleSteamSyncStatus` writes the pushed status into
 *       libraryState (not merely registered and dropped).
 *   W4: `frontend/types.ts` and `state/ContextProvider.tsx` both declare the
 *       lockstep `steamSyncStatus` pair -- a type without a default (or vice
 *       versa) drifts silently.
 *   W5 (D-06 negative gate): BEHAVIOURAL (69-18). Pushing a status leaves
 *       `refreshingInTheBackground` unchanged -- the new tri-state must
 *       not be derived from, or reset alongside, the flag it replaces (that
 *       flag defaults `true` and resets to `true` after every unscoped
 *       refresh, so it never actually meant "a refresh is running").
 *
 * Self-tested against synthetic specimens DERIVED from the real source text
 * by string manipulation (never hand-authored) per this project's own
 * anti-vacuity requirement -- a source-text gate without a self-test is a
 * vacuous gate (the exact lesson Phase 34.2's gap cycles paid for; see
 * `grep-assertion-must-fail-against-known-bad-input`).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { resetAllStores, type StoreHooks } from '../storeKit'
import type { LibraryState } from '../libraryState'
import type * as InitModule from '../initStateSubscriptions'
import {
  stripSourceComments,
  stripTrailingLineComment
} from 'backend/testUtils/stripSourceComments'

const IPC_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'common',
  'types',
  'ipc',
  'steam.ts'
)
const PRELOAD_STEAM_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'preload',
  'api',
  'steam.ts'
)
const CONTEXT_PROVIDER_PATH = join(__dirname, '..', 'ContextProvider.tsx')
const FRONTEND_TYPES_PATH = join(__dirname, '..', '..', 'types.ts')

function gateSource(source: string): string {
  return stripSourceComments(source)
    .split('\n')
    .map(stripTrailingLineComment)
    .join('\n')
}

function readGated(path: string): string {
  return gateSource(readFileSync(path, 'utf8'))
}

// ---------------------------------------------------------------------------
// The plain throwing helpers -- the SAME functions drive the real gate
// assertions below AND the RED-proof self-tests, so a specimen cannot be
// checked by a hand-rebuilt replica of the assertion.
// ---------------------------------------------------------------------------

function expectPresent(source: string, token: string, decisionNote: string) {
  if (!source.includes(token)) {
    throw new Error(
      `expectPresent: required token "${token}" is missing from stripped source (${decisionNote})`
    )
  }
}

function gateW1_ipcDeclaresChannel(source: string): void {
  expectPresent(
    source,
    'steamSyncStatus: z.tuple(',
    'W1: common/types/ipc/steam.ts must declare the steamSyncStatus FrontendMessages entry'
  )
}

function gateW2_preloadExportsListenerSlot(source: string): void {
  expectPresent(
    source,
    "frontendListenerSlot('steamSyncStatus')",
    'W2: the preload allowlist entry -- omitting it fails SILENTLY on the Tauri sidecar (sidecar-send-channels-fail-silently); this is the highest-risk omission in the phase'
  )
}

function gateW4_typesAndProviderDeclareLockstepPair(
  typesSource: string,
  contextProviderSource: string
): void {
  expectPresent(
    typesSource,
    'steamSyncStatus',
    'W4: frontend/types.ts must declare the steamSyncStatus field on ContextType'
  )
  expectPresent(
    contextProviderSource,
    'steamSyncStatus',
    'W4: ContextProvider.tsx must declare the steamSyncStatus default -- a type without a default (or vice versa) drifts'
  )
}

// ---------------------------------------------------------------------------
// Real-source assertions.
// ---------------------------------------------------------------------------

describe('steamSyncStatus wiring -- the five-touchpoint chain (34.15-02, D-06/D-07)', () => {
  const ipcSource = readGated(IPC_PATH)
  const preloadSteamSource = readGated(PRELOAD_STEAM_PATH)
  const frontendTypesSource = readGated(FRONTEND_TYPES_PATH)
  const contextProviderSource = readGated(CONTEXT_PROVIDER_PATH)

  it('W1: common/types/ipc/steam.ts declares the steamSyncStatus FrontendMessages channel', () => {
    expect(() => gateW1_ipcDeclaresChannel(ipcSource)).not.toThrow()
  })

  it('W2 (silent-failure risk): preload/api/steam.ts exports the handleSteamSyncStatus allowlist entry -- a missing entry fails SILENTLY on the Tauri sidecar with no compile or runtime error', () => {
    expect(() =>
      gateW2_preloadExportsListenerSlot(preloadSteamSource)
    ).not.toThrow()
  })

  // W4 stays source-text until 69-24 rewrites it with ContextProvider's removal.
  it('W4: frontend/types.ts and ContextProvider.tsx both declare the lockstep steamSyncStatus pair', () => {
    expect(() =>
      gateW4_typesAndProviderDeclareLockstepPair(
        frontendTypesSource,
        contextProviderSource
      )
    ).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// RED proofs -- every specimen below is DERIVED from the real source text by
// string manipulation (removal or insertion), never hand-authored, so it
// cannot drift out of sync with the file it targets.
// ---------------------------------------------------------------------------

describe('RED proofs -- each gate demonstrably trips against a source-derived known-bad specimen', () => {
  it("W2 trips when the frontendListenerSlot('steamSyncStatus') line is deleted from preload/api/steam.ts (derived by line-removal from the real source)", () => {
    const realSource = readGated(PRELOAD_STEAM_PATH)
    expect(realSource).toContain("frontendListenerSlot('steamSyncStatus')")

    const missingSlotSpecimen = realSource
      .split('\n')
      .filter(
        (line) => !line.includes("frontendListenerSlot('steamSyncStatus')")
      )
      .join('\n')

    expect(() =>
      gateW2_preloadExportsListenerSlot(missingSlotSpecimen)
    ).toThrow()
  })

  it('W1 trips against a specimen with the steamSyncStatus declaration deleted (derived by string-removal from the real source)', () => {
    const realSource = readGated(IPC_PATH)
    const declarationToken = 'steamSyncStatus: z.tuple('
    expect(realSource).toContain(declarationToken)

    const missingDeclarationSpecimen = realSource.replace(
      declarationToken,
      'REMOVED_DECLARATION'
    )

    expect(() =>
      gateW1_ipcDeclaresChannel(missingDeclarationSpecimen)
    ).toThrow()
  })

  it('W4 trips when steamSyncStatus is removed from ContextProvider.tsx while frontend/types.ts still declares it (derived by string-removal, proving the lockstep pair is checked, not just one side)', () => {
    const realTypesSource = readGated(FRONTEND_TYPES_PATH)
    const realContextProviderSource = readGated(CONTEXT_PROVIDER_PATH)
    const defaultLine = "steamSyncStatus: 'idle',"
    expect(realContextProviderSource).toContain(defaultLine)

    const missingDefaultSpecimen = realContextProviderSource.replace(
      defaultLine,
      ''
    )

    expect(() =>
      gateW4_typesAndProviderDeclareLockstepPair(
        realTypesSource,
        missingDefaultSpecimen
      )
    ).toThrow()
  })
})

type Handler = (...args: unknown[]) => unknown

/**
 * A fake `window.api`: every `handle*`/`on*` property records its handler in
 * call order; the awaited getters resolve from `values`.
 */
const calls: string[] = []
const errors: string[] = []
const handlers = new Map<string, Handler[]>()
const values: Record<string, unknown> = {}
const config: Record<string, unknown> = {}
const fakeApi = new Proxy(
  {},
  {
    get: (_t, name: string) => {
      if (name === 'isFullscreen' || name === 'isFrameless') {
        return () => {
          calls.push(`seed:${name}`)
          return Promise.resolve(values[name] ?? false)
        }
      }
      if (name === 'getDMQueueInformation') {
        return () =>
          Promise.resolve({ elements: [], finished: [], state: 'idle' })
      }
      if (name === 'getCrossoverIndex' || name === 'getRunsForMeMap') {
        const key =
          name === 'getCrossoverIndex' ? 'crossoverIndex' : 'runsForMe'
        return () => {
          if (values[`${key}Reject`]) return Promise.reject(new Error('boom'))
          return key in values
            ? Promise.resolve(values[key])
            : new Promise(() => undefined)
        }
      }
      if (name === 'logError') {
        return (message: string) => {
          errors.push(message)
        }
      }
      if (name === 'humbleGetKeys') {
        return () => Promise.resolve(values.humbleKeys ?? [])
      }
      if (name === 'humbleGetSyncState') {
        return () =>
          Promise.resolve(
            values.humbleSyncState ?? { syncedAt: null, syncError: 'none' }
          )
      }
      if (name === 'humbleSync') {
        return () => {
          calls.push('humbleSync')
          return Promise.resolve()
        }
      }
      if (name === 'getConnectivityStatus') {
        return () => new Promise(() => undefined)
      }
      if (name === 'setZoomFactor') {
        return (factor: string) => {
          calls.push(`zoom:${factor}`)
        }
      }
      if (name === 'storeGet') {
        return (_store: string, key: string, dflt?: unknown) =>
          key in config ? config[key] : dflt
      }
      if (name === 'requestAppSettings') {
        return () => {
          calls.push('requestAppSettings')
          return Promise.resolve(values.appSettings ?? {})
        }
      }
      if (name === 'setSetting') {
        return (payload: unknown) => {
          calls.push(`setSetting:${JSON.stringify(payload)}`)
        }
      }
      if (/^(handle|on)[A-Z]/.test(name)) {
        return (fn: Handler) => {
          calls.push(`register:${name}`)
          handlers.set(name, [...(handlers.get(name) ?? []), fn])
        }
      }
      return () => undefined
    }
  }
)

// Node-env frontend project (no jsdom): give the modules a window first.
;(globalThis as unknown as { window: object }).window = {
  platform: 'linux',
  api: fakeApi,
  localStorage: { getItem: () => null, setItem: () => undefined },
  __TAURI_INTERNALS__: {
    invoke: () => Promise.resolve(undefined),
    transformCallback: () => 0,
    unregisterCallback: () => undefined,
    metadata: {
      currentWindow: { label: 'main' },
      currentWebview: { label: 'main' }
    }
  }
}

// Node-env: settingsState reads/writes these when the boot module runs.
;(globalThis as unknown as Record<string, unknown>).document = {
  documentElement: {},
  body: { classList: { toggle: () => undefined } }
}
;(globalThis as unknown as Record<string, unknown>).getComputedStyle = () => ({
  getPropertyValue: () => ''
})

describe('steamSyncStatus boot listener -- behavioural W3/W5 (69-18)', () => {
  let init: typeof InitModule
  let useLibraryState: StoreHooks<LibraryState>
  type StatusHandler = (e: unknown, payload: { status: string }) => void

  beforeAll(async () => {
    init = await import('../initStateSubscriptions')
    useLibraryState = (await import('../libraryState')).default
  })

  beforeEach(() => {
    ;(window as unknown as { api: unknown }).api = fakeApi
    calls.length = 0
    errors.length = 0
    handlers.clear()
    for (const k of Object.keys(values)) delete values[k]
    for (const k of Object.keys(config)) delete config[k]
    init.__resetInitStateSubscriptionsGuardForTests()
  })

  afterEach(() => {
    resetAllStores()
  })

  /** Pushes `syncing` through a listener and reads back the two fields. */
  function push(listener: StatusHandler) {
    useLibraryState.setState({
      refreshingInTheBackground: false,
      steamSyncStatus: 'idle'
    })
    listener({}, { status: 'syncing' })
    const s = useLibraryState.getState()
    return {
      status: s.steamSyncStatus,
      background: s.refreshingInTheBackground
    }
  }

  const w3WritesPushedStatus = (listener: StatusHandler) =>
    push(listener).status === 'syncing'
  const w5LeavesBackgroundFlagAlone = (listener: StatusHandler) =>
    push(listener).background === false

  const bootListener = (): StatusHandler => {
    init.initStateSubscriptions()
    const registered = handlers.get('handleSteamSyncStatus')
    expect(registered).toHaveLength(1)
    return registered?.[0] as StatusHandler
  }

  /** Registered but drops the write. */
  const droppedWrite: StatusHandler = () => undefined
  /** Writes the status AND resets the flag it replaces. */
  const resetsFlag: StatusHandler = (_e, { status }) => {
    useLibraryState.setState({
      steamSyncStatus: status as never,
      refreshingInTheBackground: true
    })
  }

  it('W3: the boot listener writes the pushed status into libraryState', () => {
    expect(w3WritesPushedStatus(bootListener())).toBe(true)
  })

  it('W5 (D-06 negative gate): pushing a status leaves refreshingInTheBackground unchanged', () => {
    expect(w5LeavesBackgroundFlagAlone(bootListener())).toBe(true)
  })

  it('W3 trips against a listener that is registered but drops the write', () => {
    expect(w3WritesPushedStatus(droppedWrite)).toBe(false)
  })

  it('W5 trips against a listener that also resets refreshingInTheBackground (proves W5 discriminates)', () => {
    expect(w3WritesPushedStatus(resetsFlag)).toBe(true)
    expect(w5LeavesBackgroundFlagAlone(resetsFlag)).toBe(false)
  })
})
