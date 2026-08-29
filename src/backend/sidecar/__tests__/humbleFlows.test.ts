/**
 * End-to-end wiring test for the sidecar's curated Humble channels (Phase
 * 34.4 Plan 04 — Task 2, REQ-34.4-07; extended by Plan 05, Task 3,
 * REQ-34.4-07/08/09).
 *
 * Mirrors `steamAuthFlows.test.ts`'s real-shim, over-the-wire pattern: the
 * REAL sidecar RPC server (`bootstrap.ts`'s `init()`) is driven in-process
 * against injected `stream.PassThrough` pairs, and assertions are made on
 * response frames — not on internal function calls alone. `../../humble/user`
 * and `../../humble/library` are automocked (their own logic is already
 * covered by `src/backend/humble/__tests__/`); this suite proves
 * *registration and transport*, not Humble logic.
 *
 * Two describe blocks near the end of this file deliberately BYPASS those
 * file-wide automocks via `jest.resetModules()` + a dynamic `require()`,
 * each documented in full at its own describe block: the D-05 ordering proof
 * (drives the REAL `HumbleUser.disconnect()`) and the `humbleRunValidation`
 * packaged-signal tests (drive a fresh, independent module instance per
 * `node:sea` scenario). Both are self-contained and do not affect any other
 * test in this file.
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
jest.mock('backend/store_backend', () => ({
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
import { readFileSync } from 'fs'
import { join } from 'path'

import { startSidecar, writeInvoke, writeSend } from './helpers/sidecarHarness'
import { getSteamLibraries } from 'backend/utils'
import { HumbleUser } from '../../humble/user'
import { HumbleLibrary } from '../../humble/library'
import {
  ipcMain as isolationIpcMain,
  handlerRegistry as isolationHandlerRegistry,
  listenerRegistry as isolationListenerRegistry
} from '../../platform'
import { UNPORTED_CHANNEL_MARKER } from 'common/types/sidecarTransport'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

/** Waits a couple of microtask/macrotask turns for async invoke handlers to
 * resolve (copied from steamAuthFlows.test.ts). */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

/** Local test-only shape for `HumbleLibrary.getKeys()`'s fake return values
 * (Plan 05's ownership-override / gift-link guard tests): every real
 * `HumbleKey` field, plus two non-`HumbleKey` fields (`__fakeKeyValue`,
 * `__fakeGiftUrl`) the real `ipc_handler.ts` guard bodies never read — seeded
 * only so the C4 no-leak assertions have a distinctive value to fail
 * against if a rejection warning is ever widened beyond the machineName. */
type HumbleKeyForTest = {
  gamekey: string
  machineName: string
  state: 'UNPICKED' | 'UNREVEALED' | 'REVEALED' | 'REDEEMED' | 'UNREDEEMABLE'
  title: string
  platform: string
  expiration: string | null
  origin: string
  ownedElsewhere: boolean
  matchConfidence: 'exact' | 'fuzzy' | 'none'
  __fakeKeyValue: string
  __fakeGiftUrl: string
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
  describe('negative-scope guard — the 6 channels Phase 34.4.1 owns are registered by a DIFFERENT module, never by registerHumbleFlows() itself', () => {
    // UPDATED by Phase 34.4.1 Plan 02: these 6 channels are no longer deferred — they
    // are now registered by `registerHumbleLoginFlows()`
    // (`humbleLoginFlowRegistration.ts`), a module this file never imports or calls.
    // Prior to Plan 02 this block asserted these channels stayed globally UNREGISTERED,
    // as a proxy for "registerHumbleFlows() itself does not own them" — that proxy only
    // held while nothing else in the sidecar's module graph registered them either. Now
    // that `handlers.ts` also calls `registerHumbleLoginFlows()` at module scope (reached
    // transitively through this file's own `import { init } from '../bootstrap'`), the
    // global registries legitimately contain all 6. The still-load-bearing claim this
    // block exists to prove — registerHumbleFlows() itself never touches these 6 channel
    // names — is unchanged and re-asserted below by kind, with both directions checked
    // per channel (a one-directional check cannot catch a send-vs-handle swap). Full
    // frame-shape + rustInvoke-argument-order coverage for these 6 channels lives in
    // `humbleLoginFlows.test.ts` (Plan 02 Task 3), which is this suite's positive
    // counterpart.
    const HANDLE_CHANNELS_34_4_1 = [
      'humbleStartLogin',
      'humbleReconnect',
      'humbleGetLoginUserAgent',
      'humbleRevealKey'
    ]
    const SEND_CHANNELS_34_4_1 = ['humbleStopLogin', 'humbleLoginNavigated']

    it('REQ-34.4.1-02/-03/-04/-05 registerHumbleLoginFlows() has registered all 6 channels it owns, with the correct kind, both directions', () => {
      for (const channel of HANDLE_CHANNELS_34_4_1) {
        expect(isolationHandlerRegistry.has(channel)).toBe(true)
        expect((isolationListenerRegistry.get(channel) ?? []).length).toBe(0)
      }
      for (const channel of SEND_CHANNELS_34_4_1) {
        expect((isolationListenerRegistry.get(channel) ?? []).length).toBe(1)
        expect(isolationHandlerRegistry.has(channel)).toBe(false)
      }
      // Sanity: isolationIpcMain is the same electronStub export
      // humbleFlowRegistration.ts itself imports — proves this guard is
      // inspecting the real registry the module under test writes to, not a
      // reimplementation.
      expect(typeof isolationIpcMain.handle).toBe('function')
    })

    it('REQ-34.4-07/08/09 registerHumbleFlows() has registered all 16 Humble channels this slice owns: 15 as ipcMain.handle (incl. humbleRunValidation, dev signal), 1 (humbleDisconnect) as ipcMain.on exactly once', () => {
      const HANDLE_CHANNELS = [
        'humbleGetUserInfo',
        'humbleCheckHealth',
        'humbleSync',
        'humbleGetKeys',
        'humbleGetSyncState',
        'humbleGetGiftedAt',
        'humbleMarkRedeemed',
        'humbleUndoRedeemed',
        'humbleGetRevealedKeyValue',
        'humbleGetClaimAnnotations',
        'humbleSetOwnershipOverride',
        'humbleClearOwnershipOverride',
        'humbleGetOwnershipOverrides',
        'humbleRecordGiftLinkOpened',
        // Under jest (plain node, never a packaged SEA build),
        // isPackagedSidecar() resolves false, so humbleRunValidation IS
        // registered — this is the dev-signal branch, pinned separately
        // below (REQ-34.4-08).
        'humbleRunValidation'
      ]
      expect(HANDLE_CHANNELS).toHaveLength(15)
      for (const channel of HANDLE_CHANNELS) {
        expect(isolationHandlerRegistry.has(channel)).toBe(true)
      }
      expect(
        (isolationListenerRegistry.get('humbleDisconnect') ?? []).length
      ).toBe(1)
    })

    it('REQ-34.4.1-04 SEAM.md Invariant B, UPDATED (Plan 02): humbleRevealKey is now a real registered channel — it resolves non-fatally (never rejects) even with malformed/missing args, and the RPC loop keeps serving', async () => {
      const { input, frames } = startSidecar()
      // Deliberately malformed (empty args, so `params.gamekey` would throw inside the
      // handler) — proves the D-07 fail-safe catch resolves a typed failure outcome
      // rather than ever rejecting the frame.
      writeInvoke(input, 'reveal-1', 'humbleRevealKey', [])
      await flush()

      const revealResponse = frames.find((frame) => frame.id === 'reveal-1') as
        | { ok: boolean; result?: unknown; error?: string }
        | undefined
      expect(revealResponse?.ok).toBe(true)
      expect(revealResponse?.result).toEqual({ status: 'failed' })
      expect(revealResponse?.error).toBeUndefined()

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

  // ── Ownership-override trio + humbleRecordGiftLinkOpened (Plan 05,
  // REQ-34.4-07) ─────────────────────────────────────────────────────────────
  describe('ownership-override trio + humbleRecordGiftLinkOpened — trust-boundary guards (T-34.4-20/21/25)', () => {
    // Distinctive fake key value / URL, seeded on every fake key below, so
    // the C4 no-leak assertions are meaningful (a negative assertion against
    // an empty/undefined value proves nothing).
    const FAKE_KEY_VALUE = 'HUMBLE-SECRET-KEY-NEVER-LOGGED'
    const FAKE_GIFT_URL = 'https://www.humblebundle.com/gift/NEVER-LOGGED-TOKEN'

    function fakeKey(overrides: Partial<HumbleKeyForTest>): HumbleKeyForTest {
      return {
        gamekey: 'gk-1',
        machineName: 'mn-1',
        state: 'UNREVEALED',
        title: 'Test Game',
        platform: 'steam',
        expiration: null,
        origin: 'Test Bundle',
        ownedElsewhere: false,
        matchConfidence: 'none',
        // Non-HumbleKey fields the real ipc_handler.ts body never reads, but
        // seeded so a leaked-value assertion has something distinctive to
        // fail against if the guard is ever weakened to log more than a
        // machineName.
        __fakeKeyValue: FAKE_KEY_VALUE,
        __fakeGiftUrl: FAKE_GIFT_URL,
        ...overrides
      }
    }

    describe('humbleSetOwnershipOverride (D-42/T-12-03)', () => {
      it('REQ-34.4-07 round-trips and calls HumbleLibrary.setOwnershipOverride exactly once for a fuzzy match', async () => {
        jest
          .mocked(HumbleLibrary.getKeys)
          .mockReturnValue([
            fakeKey({ machineName: 'fuzzy-mn', matchConfidence: 'fuzzy' })
          ] as ReturnType<typeof HumbleLibrary.getKeys>)
        jest
          .mocked(HumbleLibrary.setOwnershipOverride)
          .mockReturnValue(undefined)

        const { input, frames } = startSidecar()
        writeInvoke(input, 'set-override-1', 'humbleSetOwnershipOverride', [
          'fuzzy-mn'
        ])
        await flush()

        const response = frames.find((frame) => frame.id === 'set-override-1')
        expect(response).toMatchObject({ id: 'set-override-1', ok: true })
        expect(HumbleLibrary.setOwnershipOverride).toHaveBeenCalledTimes(1)
        expect(HumbleLibrary.setOwnershipOverride).toHaveBeenCalledWith(
          'fuzzy-mn'
        )
      })

      it('REQ-34.4-07 guard: rejects a non-fuzzy (exact) match — setOwnershipOverride is NEVER called, and the warning names only the machineName', async () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        jest
          .mocked(HumbleLibrary.getKeys)
          .mockReturnValue([
            fakeKey({ machineName: 'exact-mn', matchConfidence: 'exact' })
          ] as ReturnType<typeof HumbleLibrary.getKeys>)

        const { input, frames } = startSidecar()
        writeInvoke(input, 'set-override-2', 'humbleSetOwnershipOverride', [
          'exact-mn'
        ])
        await flush()

        const response = frames.find((frame) => frame.id === 'set-override-2')
        expect(response).toMatchObject({ id: 'set-override-2', ok: true })
        expect(HumbleLibrary.setOwnershipOverride).not.toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalledTimes(1)
        const [message, loggedMachineName] = warnSpy.mock.calls[0]
        expect(String(message)).toContain('humbleSetOwnershipOverride')
        expect(loggedMachineName).toBe('exact-mn')
        const wholeCall = warnSpy.mock.calls[0].join(' ')
        expect(wholeCall).not.toContain(FAKE_KEY_VALUE)
        expect(wholeCall).not.toContain(FAKE_GIFT_URL)
        warnSpy.mockRestore()
      })

      it('REQ-34.4-07 guard: rejects an unknown machineName — setOwnershipOverride is NEVER called', async () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        jest
          .mocked(HumbleLibrary.getKeys)
          .mockReturnValue([] as ReturnType<typeof HumbleLibrary.getKeys>)

        const { input, frames } = startSidecar()
        writeInvoke(input, 'set-override-3', 'humbleSetOwnershipOverride', [
          'unknown-mn'
        ])
        await flush()

        const response = frames.find((frame) => frame.id === 'set-override-3')
        expect(response).toMatchObject({ id: 'set-override-3', ok: true })
        expect(HumbleLibrary.setOwnershipOverride).not.toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalledTimes(1)
        warnSpy.mockRestore()
      })
    })

    describe('humbleClearOwnershipOverride / humbleGetOwnershipOverrides — plain delegates', () => {
      it('REQ-34.4-07 humbleClearOwnershipOverride delegates the machineName verbatim', async () => {
        jest
          .mocked(HumbleLibrary.clearOwnershipOverride)
          .mockReturnValue(undefined)

        const { input, frames } = startSidecar()
        writeInvoke(input, 'clear-override-1', 'humbleClearOwnershipOverride', [
          'mn-to-clear'
        ])
        await flush()

        const response = frames.find((frame) => frame.id === 'clear-override-1')
        expect(response).toMatchObject({ id: 'clear-override-1', ok: true })
        expect(HumbleLibrary.clearOwnershipOverride).toHaveBeenCalledWith(
          'mn-to-clear'
        )
      })

      it('REQ-34.4-07 humbleGetOwnershipOverrides round-trips a real map, not the unported marker', async () => {
        const fakeOverrides = { 'mn-1': 12345 }
        jest
          .mocked(HumbleLibrary.getAllOwnershipOverrides)
          .mockReturnValue(fakeOverrides)

        const { input, frames } = startSidecar()
        writeInvoke(input, 'get-overrides-1', 'humbleGetOwnershipOverrides', [])
        await flush()

        const response = frames.find((frame) => frame.id === 'get-overrides-1')
        expect(response).toMatchObject({
          id: 'get-overrides-1',
          ok: true,
          result: fakeOverrides
        })
        expect(response?.result).not.toBe(UNPORTED_CHANNEL_MARKER)
      })
    })

    describe('humbleRecordGiftLinkOpened (D-59/D-57) — CORRECTED kind (invoke, not send)', () => {
      it('REQ-34.4-07 resolves as an INVOKE (a response frame comes back for its own id) — the corrected classification', async () => {
        jest.mocked(HumbleLibrary.getKeys).mockReturnValue([
          fakeKey({
            machineName: 'eligible-mn',
            ownedElsewhere: true,
            state: 'UNREVEALED'
          })
        ] as ReturnType<typeof HumbleLibrary.getKeys>)
        jest
          .mocked(HumbleLibrary.recordGiftLinkOpened)
          .mockReturnValue(undefined)

        const { input, frames } = startSidecar()
        writeInvoke(input, 'gift-link-invoke-1', 'humbleRecordGiftLinkOpened', [
          'eligible-mn'
        ])
        await flush()

        const response = frames.find(
          (frame) => frame.id === 'gift-link-invoke-1'
        )
        expect(response).toMatchObject({ id: 'gift-link-invoke-1', ok: true })
        expect(HumbleLibrary.recordGiftLinkOpened).toHaveBeenCalledTimes(1)
        expect(HumbleLibrary.recordGiftLinkOpened).toHaveBeenCalledWith(
          'eligible-mn'
        )
      })

      it('REQ-34.4-07 is NOT reachable as a listener — driving it as a SEND never calls recordGiftLinkOpened', async () => {
        jest.mocked(HumbleLibrary.getKeys).mockReturnValue([
          fakeKey({
            machineName: 'eligible-mn-2',
            ownedElsewhere: true,
            state: 'UNREVEALED'
          })
        ] as ReturnType<typeof HumbleLibrary.getKeys>)

        const { input } = startSidecar()
        writeSend(input, 'gift-link-send-1', 'humbleRecordGiftLinkOpened', [
          'eligible-mn-2'
        ])
        await flush()

        expect(HumbleLibrary.recordGiftLinkOpened).not.toHaveBeenCalled()
      })

      it('REQ-34.4-07 guard: rejects an unknown machineName — recordGiftLinkOpened is NEVER called, warning names only the machineName', async () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        jest
          .mocked(HumbleLibrary.getKeys)
          .mockReturnValue([] as ReturnType<typeof HumbleLibrary.getKeys>)

        const { input, frames } = startSidecar()
        writeInvoke(input, 'gift-link-2', 'humbleRecordGiftLinkOpened', [
          'unknown-mn'
        ])
        await flush()

        const response = frames.find((frame) => frame.id === 'gift-link-2')
        expect(response).toMatchObject({ id: 'gift-link-2', ok: true })
        expect(HumbleLibrary.recordGiftLinkOpened).not.toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalledTimes(1)
        const [message, loggedMachineName] = warnSpy.mock.calls[0]
        expect(String(message)).toContain('humbleRecordGiftLinkOpened')
        expect(loggedMachineName).toBe('unknown-mn')
        warnSpy.mockRestore()
      })

      it('REQ-34.4-07 guard: rejects a key that is not ownedElsewhere — recordGiftLinkOpened is NEVER called', async () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        jest.mocked(HumbleLibrary.getKeys).mockReturnValue([
          fakeKey({
            machineName: 'not-owned-mn',
            ownedElsewhere: false,
            state: 'UNREVEALED'
          })
        ] as ReturnType<typeof HumbleLibrary.getKeys>)

        const { input, frames } = startSidecar()
        writeInvoke(input, 'gift-link-3', 'humbleRecordGiftLinkOpened', [
          'not-owned-mn'
        ])
        await flush()

        const response = frames.find((frame) => frame.id === 'gift-link-3')
        expect(response).toMatchObject({ id: 'gift-link-3', ok: true })
        expect(HumbleLibrary.recordGiftLinkOpened).not.toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalledTimes(1)
        warnSpy.mockRestore()
      })

      it('REQ-34.4-07 guard: rejects a key whose state is not UNREVEALED — recordGiftLinkOpened is NEVER called', async () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
        jest.mocked(HumbleLibrary.getKeys).mockReturnValue([
          fakeKey({
            machineName: 'already-revealed-mn',
            ownedElsewhere: true,
            state: 'REVEALED'
          })
        ] as ReturnType<typeof HumbleLibrary.getKeys>)

        const { input, frames } = startSidecar()
        writeInvoke(input, 'gift-link-4', 'humbleRecordGiftLinkOpened', [
          'already-revealed-mn'
        ])
        await flush()

        const response = frames.find((frame) => frame.id === 'gift-link-4')
        expect(response).toMatchObject({ id: 'gift-link-4', ok: true })
        expect(HumbleLibrary.recordGiftLinkOpened).not.toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalledTimes(1)
        warnSpy.mockRestore()
      })
    })
  })

  // ── humbleDisconnect — kind proofs + rejection guard (Plan 05, REQ-34.4-09,
  // T-34.4-23) ─────────────────────────────────────────────────────────────
  describe('humbleDisconnect — kind proofs + rejection guard', () => {
    it('REQ-34.4-09 kind proof, positive direction: a humbleDisconnect SEND frame causes HumbleUser.disconnect to be called exactly once, and produces no response frame', async () => {
      jest.mocked(HumbleUser.disconnect).mockResolvedValue(undefined)

      const { input, frames } = startSidecar()
      writeSend(input, 'disconnect-send-1', 'humbleDisconnect', [])
      await flush()

      expect(
        frames.find((frame) => frame.id === 'disconnect-send-1')
      ).toBeUndefined()
      expect(HumbleUser.disconnect).toHaveBeenCalledTimes(1)
    })

    it('REQ-34.4-09 kind proof, negative direction: humbleDisconnect must NOT be reachable as an invoke handler', async () => {
      jest.mocked(HumbleUser.disconnect).mockResolvedValue(undefined)

      const { input, frames } = startSidecar()
      writeInvoke(input, 'disconnect-invoke-1', 'humbleDisconnect', [])
      await flush()

      const response = frames.find(
        (frame) => frame.id === 'disconnect-invoke-1'
      ) as { ok?: boolean } | undefined
      expect(response?.ok).not.toBe(true)
      expect(HumbleUser.disconnect).not.toHaveBeenCalled()
    })

    it('REQ-34.4-09 rejection guard (WR-02): a rejecting HumbleUser.disconnect does not crash the sidecar, is never an unhandled rejection, and the RPC loop keeps serving', async () => {
      const unhandledRejections: unknown[] = []
      const onUnhandledRejection = (reason: unknown): void => {
        unhandledRejections.push(reason)
      }
      process.on('unhandledRejection', onUnhandledRejection)

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

      try {
        jest
          .mocked(HumbleUser.disconnect)
          .mockRejectedValue(new Error('humble disconnect transport failure'))

        const { input, frames } = startSidecar()
        writeSend(input, 'disconnect-reject-1', 'humbleDisconnect', [])
        await flush()

        expect(warnSpy).toHaveBeenCalledWith(
          '[humbleFlowRegistration] humbleDisconnect failed:',
          expect.any(Error)
        )

        writeInvoke(input, 'health-after-disconnect-reject', 'health', [])
        await flush()
        const healthResponse = frames.find(
          (frame) => frame.id === 'health-after-disconnect-reject'
        )
        expect(healthResponse).toMatchObject({
          id: 'health-after-disconnect-reject',
          ok: true,
          result: 'ok'
        })

        expect(unhandledRejections).toEqual([])
      } finally {
        process.off('unhandledRejection', onUnhandledRejection)
        warnSpy.mockRestore()
      }
    })
  })

  // ── humbleRunValidation — packaged-signal resolution (Plan 05, REQ-34.4-08,
  // T-34.4-26) ─────────────────────────────────────────────────────────────
  // These tests bypass this FILE's own top-level `jest.mock('../../humble/user')`
  // /`jest.mock('../../humble/library')` automocks by dynamically re-requiring
  // `../humbleFlowRegistration` and `../electronStub` after `jest.resetModules()`
  // -- Jest keeps applying the SAME automock factories on re-require (resetModules
  // only clears the instantiated-module cache, not the configured mock list), so
  // this stays safe/automocked; only `node:sea` is freshly (re-)mocked per test via
  // `jest.doMock`, which is NOT hoisted and therefore must be the LAST mock call
  // before each dynamic require below. Each test gets its own fresh module
  // instance (and therefore its own fresh, empty `handlerRegistry`), so these do
  // not interact with -- or get polluted by -- the shared sidecar this file's
  // other tests drive via `startSidecar()`.
  describe('humbleRunValidation — packaged-signal resolution', () => {
    afterEach(() => {
      jest.dontMock('node:sea')
    })

    it('REQ-34.4-08 registered when node:sea reports this is NOT a packaged SEA build (the dev signal)', () => {
      jest.resetModules()
      jest.doMock('node:sea', () => ({ isSea: () => false }))

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fresh = require('../humbleFlowRegistration') as {
        registerHumbleFlows: () => void
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const freshStub = require('../../platform') as {
        handlerRegistry: Map<string, unknown>
      }

      fresh.registerHumbleFlows()
      expect(freshStub.handlerRegistry.has('humbleRunValidation')).toBe(true)
    })

    it('REQ-34.4-08 NOT registered when node:sea reports this IS a packaged SEA build', () => {
      jest.resetModules()
      jest.doMock('node:sea', () => ({ isSea: () => true }))

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fresh = require('../humbleFlowRegistration') as {
        registerHumbleFlows: () => void
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const freshStub = require('../../platform') as {
        handlerRegistry: Map<string, unknown>
      }

      fresh.registerHumbleFlows()
      expect(freshStub.handlerRegistry.has('humbleRunValidation')).toBe(false)
    })

    it('REQ-34.4-08 safe default: NOT registered when node:sea is undeterminable (throws), and the fallback is logged once', () => {
      jest.resetModules()
      jest.doMock('node:sea', () => {
        throw new Error('node:sea unavailable on this runtime (simulated)')
      })
      const consoleWarnSpy = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => {})

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fresh = require('../humbleFlowRegistration') as {
        registerHumbleFlows: () => void
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const freshStub = require('../../platform') as {
        handlerRegistry: Map<string, unknown>
      }

      fresh.registerHumbleFlows()
      expect(freshStub.handlerRegistry.has('humbleRunValidation')).toBe(false)
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('node:sea unavailable'),
        expect.any(Error)
      )
      consoleWarnSpy.mockRestore()
    })
  })

  // ── humbleDisconnect — D-05 ordering proof (Plan 05, REQ-34.4-09, T-34.4-24)
  // ───────────────────────────────────────────────────────────────────────────
  // This suite automocks `../../humble/user` file-wide so every OTHER test in
  // this file proves registration/transport, not Humble logic. D-05's claim --
  // that the three store clears happen even when the session.fromPartition wipe
  // loop no-ops or rejects -- is a claim about the REAL disconnect() body
  // (user.ts:566-608), which an automocked HumbleUser.disconnect cannot prove.
  // This describe block bypasses the file-wide automock for ONE test via
  // `jest.resetModules()` + a dynamic, unmocked `require`, mirroring
  // `user.test.ts`'s own sanctioned mock boundary (electron -> session, but here
  // routed at the REAL electronStub per this file's own top-level
  // `jest.mock('electron', () => jest.requireActual('../../platform'))` --
  // deliberately NOT overridden, so `session.fromPartition()` below is the REAL,
  // accepted Phase 29 D-09 no-op, never a fabricated one; backend/logger ->
  // log* per user.test.ts's own boundary; ../electronStores is left REAL and
  // spied on directly, since `jest.setupContainment.ts` already redirects
  // HOME/XDG structurally for this whole file (Phase 34.2 gap cycle 4), so the
  // real store files this touches are disposable, never real developer data.
  // Placed as the LAST describe block in this file: `jest.resetModules()` only
  // affects FUTURE dynamic `require()` calls, never the already-bound
  // top-of-file `import` bindings every other test in this file uses -- but
  // keeping it last avoids any risk of ordering interaction regardless.
  describe('humbleDisconnect — D-05 ordering proof (real disconnect(), not automocked)', () => {
    it('REQ-34.4-09 the three Humble store clears happen, and independently of every session.fromPartition wipe step failing against the real electronStub D-09 no-op', async () => {
      jest.resetModules()

      const warnSpy = jest.fn()
      jest.doMock('backend/logger', () => ({
        logInfo: jest.fn(),
        logError: jest.fn(),
        logWarning: (...args: unknown[]) => warnSpy(...args),
        LogPrefix: { Backend: 'Backend' }
      }))

      // `jest.requireActual` (NOT plain `require`) is load-bearing here: this
      // file's own file-wide `jest.mock('../../humble/user')` (hoisted, top
      // of file) stays registered across `jest.resetModules()` -- resetModules
      // only clears the INSTANTIATED-module cache, not the configured mock
      // list -- so a plain `require('../../humble/user')` would still resolve
      // to a fresh instance of the SAME automock (confirmed by hand: the
      // first version of this test used plain `require` and failed with
      // "received value must be a promise", because the automocked
      // `disconnect()` returns `undefined`, not a Promise). `requireActual`
      // is the one call that genuinely bypasses the registered mock.
      const {
        HumbleUser: RealHumbleUser
      }: {
        HumbleUser: { disconnect: () => Promise<void> }
      } = jest.requireActual('../../humble/user')
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const realStores = require('../../humble/electronStores') as {
        configStore: {
          set: (key: string, value: unknown) => void
          get_nodefault: (key: string) => unknown
          clear: () => void
        }
        humbleLibraryStore: {
          set: (key: string, value: unknown) => void
          clear: () => void
        }
        humbleSyncStore: {
          set: (key: string, value: unknown) => void
          clear: () => void
        }
      }

      realStores.configStore.set('sessionCookie', 'FAKE-D05-COOKIE-VALUE')
      realStores.humbleLibraryStore.set('fake-order', { keys: [] })
      realStores.humbleSyncStore.set('state', { syncedAt: 111 })

      const clearConfigSpy = jest.spyOn(realStores.configStore, 'clear')
      const clearLibrarySpy = jest.spyOn(realStores.humbleLibraryStore, 'clear')
      const clearSyncSpy = jest.spyOn(realStores.humbleSyncStore, 'clear')

      // The real electronStub `session.fromPartition()` (D-09, accepted no-op)
      // returns `{}` -- calling ANY of the 5 best-effort wipe methods on it
      // throws "is not a function", which `disconnect()`'s own per-step
      // try/catch (user.ts:588) converts into a logged warning, never a thrown
      // exception -- so this exercises the real "every partition step fails"
      // case with zero fabrication.
      await expect(RealHumbleUser.disconnect()).resolves.toBeUndefined()

      // (a) all three store clears happened.
      expect(clearConfigSpy).toHaveBeenCalledTimes(1)
      expect(clearLibrarySpy).toHaveBeenCalledTimes(1)
      expect(clearSyncSpy).toHaveBeenCalledTimes(1)
      expect(
        realStores.configStore.get_nodefault('sessionCookie')
      ).toBeUndefined()

      // (b) they happened even though every one of the 5 partition wipe steps
      // failed against the real D-09 stub -- proving the credential wipe is
      // NOT contingent on the partition steps succeeding (user.ts:588).
      expect(warnSpy).toHaveBeenCalledTimes(5)
      for (const call of warnSpy.mock.calls) {
        const message = Array.isArray(call[0]) ? call[0].join(' ') : call[0]
        expect(String(message)).toMatch(/wipe step/i)
      }

      clearConfigSpy.mockRestore()
      clearLibrarySpy.mockRestore()
      clearSyncSpy.mockRestore()
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
