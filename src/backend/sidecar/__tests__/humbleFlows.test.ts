/**
 * End-to-end wiring test for the sidecar's curated Humble library/sync +
 * key-state channels (Phase 34.4 Plan 04 — Task 2, REQ-34.4-07).
 *
 * Mirrors `steamAuthFlows.test.ts`'s real-shim, over-the-wire pattern: the
 * REAL sidecar RPC server (`bootstrap.ts`'s `init()`) is driven in-process
 * against injected `stream.PassThrough` pairs, and assertions are made on
 * response frames — not on internal function calls alone. `../../humble/user`
 * and `../../humble/library` are automocked (their own logic is already
 * covered by `src/backend/humble/__tests__/`); this suite proves
 * *registration and transport*, not Humble logic.
 *
 * Does NOT carry its own `jest.mock('os', ...)` block —
 * `src/backend/jest.setupContainment.ts` runs via `setupFiles` for every
 * backend test file and redirects HOME/APPDATA/XDG structurally (Phase 34.2
 * gap cycle 4). This suite is classified in `testContainment.test.ts`'s
 * `STRUCTURALLY_CONTAINED_SUITES` (identical os/electron/electron-store mock
 * kit already classified there for `steamAuthFlows.test.ts`).
 */

// ── electron / electron-store — route Jest's own module resolution at the
// REAL sidecar shims (mirrors steamAuthFlows.test.ts) ───────────────────────
jest.mock('electron', () => jest.requireActual('../electronStub'))
jest.mock('electron-store', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ── axios — the same reasoning as steamAuthFlows.test.ts: `init()` wires the
// REAL `initOnlineMonitor()`, which calls a live `axios.head()` against
// several external hosts. Mocked so this suite never makes a real network
// call; `.create` is also stubbed for `backend/utils.ts`'s module-scope
// `axiosClient` singleton. ───────────────────────────────────────────────────
jest.mock('axios', () => {
  const mockInstance = {
    get: jest.fn(() => Promise.resolve({ data: {} })),
    head: jest.fn(() => Promise.resolve({ status: 200 }))
  }
  return {
    __esModule: true,
    default: {
      head: jest.fn(() => Promise.resolve({ status: 200 })),
      create: jest.fn(() => mockInstance)
    }
  }
})

// ── backend/utils mock — no real on-disk Steam install to scan in CI
// (mirrors steamAuthFlows.test.ts; `registerSteamFlows()` also runs inside
// the same `init()` this suite drives) ───────────────────────────────────────
jest.mock('backend/utils', () => ({
  getSteamLibraries: jest.fn(),
  getFileSize: jest.fn()
}))

// ── backend/constants/environment mock — pins a deterministic branch
// regardless of the host OS running this test (mirrors steamAuthFlows.test.ts) ─
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true
}))

// ── HumbleUser / HumbleLibrary — automocked; the network/filesystem-touching
// surface this suite exists to WIRE, not re-test. Their own internal
// correctness is covered by src/backend/humble/__tests__/user.test.ts and
// library.test.ts. ───────────────────────────────────────────────────────────
jest.mock('../../humble/user')
jest.mock('../../humble/library')

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { PassThrough } from 'node:stream'
import { readFileSync } from 'fs'
import { join } from 'path'

import { init } from '../bootstrap'
import { getSteamLibraries } from 'backend/utils'
import { HumbleUser } from '../../humble/user'
import { HumbleLibrary } from '../../humble/library'
import { registerHumbleFlows } from '../humbleFlowRegistration'
import {
  ipcMain as isolationIpcMain,
  handlerRegistry as isolationHandlerRegistry,
  listenerRegistry as isolationListenerRegistry
} from '../electronStub'
import { UNPORTED_CHANNEL_MARKER } from 'common/types/sidecarTransport'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

type Frame = Record<string, unknown>

/** Buffers newline-delimited output from a PassThrough into parsed frames
 * (copied from steamAuthFlows.test.ts — this file has no prior copy). */
function collectFrames(stream: PassThrough): Frame[] {
  const frames: Frame[] = []
  let buffer = ''
  stream.on('data', (chunk: Buffer | string) => {
    buffer += chunk.toString()
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex)
      buffer = buffer.slice(newlineIndex + 1)
      if (line.trim().length > 0) {
        try {
          frames.push(JSON.parse(line))
        } catch {
          // Non-JSON diagnostic line (e.g. READY_SENTINEL) — ignore.
        }
      }
      newlineIndex = buffer.indexOf('\n')
    }
  })
  return frames
}

/** Waits a couple of microtask/macrotask turns for async invoke handlers to
 * resolve (copied from steamAuthFlows.test.ts). */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

/** Starts a fresh sidecar RPC loop bound to its own stream pair (copied from
 * steamAuthFlows.test.ts). */
function startSidecar(): { input: PassThrough; frames: Frame[] } {
  const input = new PassThrough()
  const output = new PassThrough()
  const frames = collectFrames(output)
  init(input, output)
  return { input, frames }
}

/** Writes a well-formed `invoke` request frame to the sidecar's stdin
 * (copied from steamAuthFlows.test.ts). */
function writeInvoke(
  input: PassThrough,
  id: string,
  channel: string,
  args: unknown[]
): void {
  input.write(`${JSON.stringify({ id, kind: 'invoke', channel, args })}\n`)
}

describe('sidecar Humble library/sync + key-state flows (Phase 34.4 Plan 04, REQ-34.4-07)', () => {
  beforeEach(() => {
    // resetMocks:true (shared root config) wipes automock implementations
    // before every test — re-establish the defaults every test relies on.
    jest.mocked(getSteamLibraries).mockResolvedValue([])
  })

  // ── Per-channel round-trip, all 10 (requirement 1) ────────────────────────
  describe('per-channel round-trip', () => {
    it('REQ-34.4-07 humbleGetUserInfo invoke round-trips a real value, not the unported marker', async () => {
      jest.mocked(HumbleUser.getUserDetails).mockReturnValue({
        username: 'gsd-tester',
        userId: 'humble-uid-1'
      } as ReturnType<typeof HumbleUser.getUserDetails>)

      const { input, frames } = startSidecar()
      writeInvoke(input, 'user-info-1', 'humbleGetUserInfo', [])
      await flush()

      const response = frames.find((frame) => frame.id === 'user-info-1')
      expect(response).toMatchObject({
        id: 'user-info-1',
        ok: true,
        result: { username: 'gsd-tester', userId: 'humble-uid-1' }
      })
      expect(response?.result).not.toBe(UNPORTED_CHANNEL_MARKER)
      expect(HumbleUser.getUserDetails).toHaveBeenCalledTimes(1)
    })

    it('REQ-34.4-07 humbleCheckHealth invoke round-trips and delegates exactly once', async () => {
      jest.mocked(HumbleUser.checkHealthAndFlagExpiry).mockResolvedValue()

      const { input, frames } = startSidecar()
      writeInvoke(input, 'check-health-1', 'humbleCheckHealth', [])
      await flush()

      const response = frames.find((frame) => frame.id === 'check-health-1')
      expect(response).toMatchObject({ id: 'check-health-1', ok: true })
      expect(response?.result).not.toBe(UNPORTED_CHANNEL_MARKER)
      expect(HumbleUser.checkHealthAndFlagExpiry).toHaveBeenCalledTimes(1)
    })

    it('REQ-34.4-07 humbleSync invoke round-trips a real sync outcome, not the unported marker', async () => {
      jest.mocked(HumbleLibrary.sync).mockResolvedValue({
        status: 'ok'
      } as Awaited<ReturnType<typeof HumbleLibrary.sync>>)

      const { input, frames } = startSidecar()
      writeInvoke(input, 'sync-1', 'humbleSync', [])
      await flush()

      const response = frames.find((frame) => frame.id === 'sync-1')
      expect(response).toMatchObject({
        id: 'sync-1',
        ok: true,
        result: { status: 'ok' }
      })
      expect(response?.result).not.toBe(UNPORTED_CHANNEL_MARKER)
      expect(HumbleLibrary.sync).toHaveBeenCalledTimes(1)
    })

    it('REQ-34.4-07 humbleGetKeys invoke round-trips a real key list, not the unported marker', async () => {
      const fakeKeys = [{ gamekey: 'gk-1', machineName: 'mn-1' }]
      jest
        .mocked(HumbleLibrary.getKeys)
        .mockReturnValue(fakeKeys as ReturnType<typeof HumbleLibrary.getKeys>)

      const { input, frames } = startSidecar()
      writeInvoke(input, 'get-keys-1', 'humbleGetKeys', [])
      await flush()

      const response = frames.find((frame) => frame.id === 'get-keys-1')
      expect(response).toMatchObject({
        id: 'get-keys-1',
        ok: true,
        result: fakeKeys
      })
      expect(response?.result).not.toBe(UNPORTED_CHANNEL_MARKER)
      expect(HumbleLibrary.getKeys).toHaveBeenCalledTimes(1)
    })

    it('REQ-34.4-07 humbleGetSyncState invoke round-trips a real sync state, not the unported marker', async () => {
      const fakeSyncState: ReturnType<typeof HumbleLibrary.getSyncState> = {
        syncedAt: 12345,
        syncError: 'none'
      }
      jest.mocked(HumbleLibrary.getSyncState).mockReturnValue(fakeSyncState)

      const { input, frames } = startSidecar()
      writeInvoke(input, 'sync-state-1', 'humbleGetSyncState', [])
      await flush()

      const response = frames.find((frame) => frame.id === 'sync-state-1')
      expect(response).toMatchObject({
        id: 'sync-state-1',
        ok: true,
        result: fakeSyncState
      })
      expect(response?.result).not.toBe(UNPORTED_CHANNEL_MARKER)
      expect(HumbleLibrary.getSyncState).toHaveBeenCalledTimes(1)
    })

    it('REQ-34.4-07 humbleGetGiftedAt invoke round-trips a real map, not the unported marker', async () => {
      const fakeGiftedAt = { 'mn-1': 999 }
      jest
        .mocked(HumbleLibrary.getAllGiftedAt)
        .mockReturnValue(
          fakeGiftedAt as ReturnType<typeof HumbleLibrary.getAllGiftedAt>
        )

      const { input, frames } = startSidecar()
      writeInvoke(input, 'gifted-at-1', 'humbleGetGiftedAt', [])
      await flush()

      const response = frames.find((frame) => frame.id === 'gifted-at-1')
      expect(response).toMatchObject({
        id: 'gifted-at-1',
        ok: true,
        result: fakeGiftedAt
      })
      expect(response?.result).not.toBe(UNPORTED_CHANNEL_MARKER)
      expect(HumbleLibrary.getAllGiftedAt).toHaveBeenCalledTimes(1)
    })

    it('REQ-34.4-07 humbleGetClaimAnnotations invoke round-trips a real map, not the unported marker', async () => {
      const fakeAnnotations: ReturnType<
        typeof HumbleLibrary.getClaimAnnotations
      > = { 'gk-1:mn-1': { keyindexResolved: true, revealedAt: 999 } }
      jest
        .mocked(HumbleLibrary.getClaimAnnotations)
        .mockReturnValue(fakeAnnotations)

      const { input, frames } = startSidecar()
      writeInvoke(input, 'claim-annotations-1', 'humbleGetClaimAnnotations', [])
      await flush()

      const response = frames.find(
        (frame) => frame.id === 'claim-annotations-1'
      )
      expect(response).toMatchObject({
        id: 'claim-annotations-1',
        ok: true,
        result: fakeAnnotations
      })
      expect(response?.result).not.toBe(UNPORTED_CHANNEL_MARKER)
      expect(HumbleLibrary.getClaimAnnotations).toHaveBeenCalledTimes(1)
    })
  })

  // ── Argument fidelity for the three `params` channels (requirement 2) ─────
  describe('argument fidelity — gamekey/machineName must not transpose', () => {
    it('REQ-34.4-07 humbleMarkRedeemed passes gamekey first, machineName second, as separate positional arguments', async () => {
      jest
        .mocked(HumbleLibrary.markRedeemed)
        .mockResolvedValue({ status: 'ok' })

      const { input, frames } = startSidecar()
      writeInvoke(input, 'mark-redeemed-1', 'humbleMarkRedeemed', [
        { gamekey: 'GAMEKEY-DISTINCT', machineName: 'MACHINENAME-DISTINCT' }
      ])
      await flush()

      const response = frames.find((frame) => frame.id === 'mark-redeemed-1')
      expect(response).toMatchObject({
        id: 'mark-redeemed-1',
        ok: true,
        result: { status: 'ok' }
      })
      expect(HumbleLibrary.markRedeemed).toHaveBeenCalledTimes(1)
      expect(HumbleLibrary.markRedeemed).toHaveBeenCalledWith(
        'GAMEKEY-DISTINCT',
        'MACHINENAME-DISTINCT'
      )
    })

    it('REQ-34.4-07 humbleUndoRedeemed passes gamekey first, machineName second, as separate positional arguments', async () => {
      jest.mocked(HumbleLibrary.undoRedeemed).mockResolvedValue(undefined)

      const { input, frames } = startSidecar()
      writeInvoke(input, 'undo-redeemed-1', 'humbleUndoRedeemed', [
        { gamekey: 'GAMEKEY-DISTINCT-2', machineName: 'MACHINENAME-DISTINCT-2' }
      ])
      await flush()

      const response = frames.find((frame) => frame.id === 'undo-redeemed-1')
      expect(response).toMatchObject({ id: 'undo-redeemed-1', ok: true })
      expect(HumbleLibrary.undoRedeemed).toHaveBeenCalledTimes(1)
      expect(HumbleLibrary.undoRedeemed).toHaveBeenCalledWith(
        'GAMEKEY-DISTINCT-2',
        'MACHINENAME-DISTINCT-2'
      )
    })

    it('REQ-34.4-07 humbleGetRevealedKeyValue passes gamekey first, machineName second, as separate positional arguments, and adds no logging', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
      jest
        .mocked(HumbleLibrary.getRevealedKeyValue)
        .mockReturnValue('SECRET-KEY-VALUE-NEVER-LOGGED')

      const { input, frames } = startSidecar()
      writeInvoke(input, 'get-revealed-1', 'humbleGetRevealedKeyValue', [
        {
          gamekey: 'GAMEKEY-DISTINCT-3',
          machineName: 'MACHINENAME-DISTINCT-3'
        }
      ])
      await flush()

      const response = frames.find((frame) => frame.id === 'get-revealed-1')
      expect(response).toMatchObject({
        id: 'get-revealed-1',
        ok: true,
        result: 'SECRET-KEY-VALUE-NEVER-LOGGED'
      })
      expect(HumbleLibrary.getRevealedKeyValue).toHaveBeenCalledTimes(1)
      expect(HumbleLibrary.getRevealedKeyValue).toHaveBeenCalledWith(
        'GAMEKEY-DISTINCT-3',
        'MACHINENAME-DISTINCT-3'
      )
      // C4 narrow-exposure channel: the registration itself must never log
      // anything — not even indirectly (this handler has no console.* call).
      expect(warnSpy).not.toHaveBeenCalled()
      expect(logSpy).not.toHaveBeenCalled()
      warnSpy.mockRestore()
      logSpy.mockRestore()
    })
  })

  // ── Kind assertion, per channel (requirement 3) ────────────────────────────
  describe('kind assertion — all 10 channels are reachable only as an invoke', () => {
    it('REQ-34.4-07 every one of the 10 channels resolves a response frame for its own id when driven as an invoke', async () => {
      jest.mocked(HumbleUser.getUserDetails).mockReturnValue(undefined)
      jest.mocked(HumbleUser.checkHealthAndFlagExpiry).mockResolvedValue()
      jest.mocked(HumbleLibrary.sync).mockResolvedValue({
        status: 'ok'
      } as Awaited<ReturnType<typeof HumbleLibrary.sync>>)
      jest
        .mocked(HumbleLibrary.getKeys)
        .mockReturnValue([] as ReturnType<typeof HumbleLibrary.getKeys>)
      jest
        .mocked(HumbleLibrary.getSyncState)
        .mockReturnValue({} as ReturnType<typeof HumbleLibrary.getSyncState>)
      jest
        .mocked(HumbleLibrary.getAllGiftedAt)
        .mockReturnValue({} as ReturnType<typeof HumbleLibrary.getAllGiftedAt>)
      jest
        .mocked(HumbleLibrary.markRedeemed)
        .mockResolvedValue({ status: 'ok' })
      jest.mocked(HumbleLibrary.undoRedeemed).mockResolvedValue(undefined)
      jest.mocked(HumbleLibrary.getRevealedKeyValue).mockReturnValue(null)
      jest
        .mocked(HumbleLibrary.getClaimAnnotations)
        .mockReturnValue(
          {} as ReturnType<typeof HumbleLibrary.getClaimAnnotations>
        )

      const { input, frames } = startSidecar()
      const channelInvocations: Array<{ id: string; args: unknown[] }> = [
        { id: 'kind-1', args: [] }, // humbleGetUserInfo
        { id: 'kind-2', args: [] }, // humbleCheckHealth
        { id: 'kind-3', args: [] }, // humbleSync
        { id: 'kind-4', args: [] }, // humbleGetKeys
        { id: 'kind-5', args: [] }, // humbleGetSyncState
        { id: 'kind-6', args: [] }, // humbleGetGiftedAt
        {
          id: 'kind-7',
          args: [{ gamekey: 'gk', machineName: 'mn' }]
        }, // humbleMarkRedeemed
        {
          id: 'kind-8',
          args: [{ gamekey: 'gk', machineName: 'mn' }]
        }, // humbleUndoRedeemed
        {
          id: 'kind-9',
          args: [{ gamekey: 'gk', machineName: 'mn' }]
        }, // humbleGetRevealedKeyValue
        { id: 'kind-10', args: [] } // humbleGetClaimAnnotations
      ]
      const channels = [
        'humbleGetUserInfo',
        'humbleCheckHealth',
        'humbleSync',
        'humbleGetKeys',
        'humbleGetSyncState',
        'humbleGetGiftedAt',
        'humbleMarkRedeemed',
        'humbleUndoRedeemed',
        'humbleGetRevealedKeyValue',
        'humbleGetClaimAnnotations'
      ]

      channelInvocations.forEach(({ id, args }, index) => {
        writeInvoke(input, id, channels[index], args)
      })
      await flush()

      channelInvocations.forEach(({ id }) => {
        const response = frames.find((frame) => frame.id === id) as
          | { ok?: boolean }
          | undefined
        expect(response).toBeDefined()
        expect(response?.ok).toBe(true)
      })
    })
  })

  // ── Negative-scope guard (requirement 4, the load-bearing one) ────────────
  describe('negative-scope guard — the 6 channels Phase 34.4.1 owns stay unregistered', () => {
    const DEFERRED_CHANNELS = [
      'humbleStartLogin',
      'humbleReconnect',
      'humbleGetLoginUserAgent',
      'humbleRevealKey',
      'humbleStopLogin',
      'humbleLoginNavigated'
    ]

    it('REQ-34.4-07 registerHumbleFlows() does not register any of the 6 channels Phase 34.4.1 owns, as either a handler or a listener', () => {
      const before: Record<string, { handler: boolean; listeners: number }> = {}
      for (const channel of DEFERRED_CHANNELS) {
        before[channel] = {
          handler: isolationHandlerRegistry.has(channel),
          listeners: (isolationListenerRegistry.get(channel) ?? []).length
        }
      }

      // Calling registerHumbleFlows() a second time here (it is already
      // called once at module scope by handlers.ts, reached via this file's
      // own `import { init } from '../bootstrap'` above) is safe: every one
      // of this module's 10 registrations is `ipcMain.handle`, which simply
      // overwrites the same map entry — none is a listener, so there is no
      // risk of stacking a duplicate `ipcMain.on` callback onto a shared
      // channel array (the hazard clipboardFlows.test.ts's own module
      // docstring names for a module that DOES register listeners).
      registerHumbleFlows()

      for (const channel of DEFERRED_CHANNELS) {
        expect(before[channel]).toEqual({ handler: false, listeners: 0 })
        expect(isolationHandlerRegistry.has(channel)).toBe(false)
        expect((isolationListenerRegistry.get(channel) ?? []).length).toBe(0)
      }
      // Sanity: isolationIpcMain is the same electronStub export
      // humbleFlowRegistration.ts itself imports — proves this guard is
      // inspecting the real registry the module under test writes to, not a
      // reimplementation.
      expect(typeof isolationIpcMain.handle).toBe('function')
    })

    it('REQ-34.4-07 SEAM.md Invariant B: humbleRevealKey (deferred to Phase 34.4.1) still rejects non-fatally over the wire, and the RPC loop keeps serving', async () => {
      const { input, frames } = startSidecar()
      writeInvoke(input, 'reveal-1', 'humbleRevealKey', [])
      await flush()

      const revealResponse = frames.find((frame) => frame.id === 'reveal-1') as
        | { ok: boolean; error?: string }
        | undefined
      expect(revealResponse?.ok).toBe(false)
      expect(revealResponse?.error).toContain(UNPORTED_CHANNEL_MARKER)

      writeInvoke(input, 'health-after-reveal', 'health', [])
      await flush()
      const healthResponse = frames.find(
        (frame) => frame.id === 'health-after-reveal'
      )
      expect(healthResponse).toMatchObject({
        id: 'health-after-reveal',
        ok: true,
        result: 'ok'
      })
    })
  })

  // ── Curated-import source gate (requirement 5) ─────────────────────────────
  describe('curated-import guard — humbleFlowRegistration.ts never imports humble/ipc_handler', () => {
    /** True iff comment-stripped `source` contains an import statement
     * referencing `humble/ipc_handler` (a bare side-effect import, a
     * named/default import via `from`, or a CommonJS `require(...)`).
     * Applies `stripSourceComments` FIRST so a docstring merely NAMING
     * `humble/ipc_handler.ts` (which this module's own header legitimately
     * does, repeatedly) cannot make this gate vacuous — the exact defect
     * class that took Phase 34.2 four gap cycles to close (line-prefix-only
     * comment stripping letting a non-`*`-prefixed block comment satisfy a
     * gate built on it). The bare-import branch matters: this codebase's own
     * curated-import idiom (`import '../storeManagers'`,
     * `steamAuthFlowRegistration.ts:66`) is exactly the side-effect-only
     * shape a `from`-only regex would silently miss. */
    function importsIpcHandler(source: string): boolean {
      const stripped = stripSourceComments(source)
      return (
        /import\s+['"](?:\.\.\/)*humble\/ipc_handler['"]/.test(stripped) ||
        /from\s+['"](?:\.\.\/)*humble\/ipc_handler['"]/.test(stripped) ||
        /require\(\s*['"](?:\.\.\/)*humble\/ipc_handler['"]\s*\)/.test(stripped)
      )
    }

    it('REQ-34.4-07 humbleFlowRegistration.ts contains no import statement referencing humble/ipc_handler', () => {
      const source = readFileSync(
        join(__dirname, '..', 'humbleFlowRegistration.ts'),
        'utf-8'
      )
      expect(importsIpcHandler(source)).toBe(false)
    })

    // Self-test (mirrors testContainment.test.ts's own gate-self-test
    // convention): proves importsIpcHandler (the SAME function the gate
    // above calls) can actually detect a real violation, not just pass
    // against the real file.
    it('gate self-test: a synthetic source with a named import of humble/ipc_handler is detected', () => {
      const synthetic = [
        "import { registerHumbleIpcHandlers } from '../humble/ipc_handler'",
        'export function registerHumbleFlows(): void {}'
      ].join('\n')
      expect(importsIpcHandler(synthetic)).toBe(true)
    })

    // This is the shape that actually matters most: this codebase's own
    // curated-import idiom for a load-bearing side effect
    // (`import '../storeManagers'`) is a BARE import with no `from` clause.
    // A regex that only matched `from ...` would silently miss the exact
    // shape a real accidental side-effect import of humble/ipc_handler would
    // take.
    it('gate self-test: a synthetic source with a bare side-effect import of humble/ipc_handler is detected', () => {
      const synthetic = [
        "import '../humble/ipc_handler'",
        'export function registerHumbleFlows(): void {}'
      ].join('\n')
      expect(importsIpcHandler(synthetic)).toBe(true)
    })

    // Anti-vacuity self-test: a docstring-only mention of humble/ipc_handler
    // (exactly the shape this module's own header legitimately contains)
    // must NOT trip the gate.
    it('gate self-test (anti-vacuity): a docblock-only mention of humble/ipc_handler.ts is NOT detected as an import', () => {
      const synthetic = [
        '/**',
        ' * Never side-effect-import humble/ipc_handler.ts — it registers',
        ' * channels this module must not own.',
        ' */',
        'export function registerHumbleFlows(): void {}'
      ].join('\n')
      expect(importsIpcHandler(synthetic)).toBe(false)
    })
  })
})

// RED PROOF (hand-verified, see 34.4-04-SUMMARY.md for verbatim output):
// `humble/ipc_handler.ts` has NO top-level registration side effect —
// `registerHumbleIpcHandlers()` is only a function DEFINITION; a bare
// `import '../humble/ipc_handler'` alone registers nothing at runtime. So
// the real hazard this guard exists to catch is a curated module that
// imports AND CALLS that forbidden registrar. The hand RED proof therefore
// added `import { registerHumbleIpcHandlers } from '../humble/ipc_handler'`
// plus a `registerHumbleIpcHandlers()` call at the top of
// `registerHumbleFlows()`. Both guards failed: the curated-import guard (the
// added `from` import was detected) AND the negative-scope guard (the 6
// deferred channels became registered — humbleStartLogin/humbleReconnect/
// humbleGetLoginUserAgent as handlers, humbleStopLogin/humbleLoginNavigated
// as listeners). The change was then reverted via `git checkout`, and
// `git diff --stat` on the module confirmed byte-identical to the Task 1
// commit.
