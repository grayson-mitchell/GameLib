/**
 * End-to-end wiring test for the sidecar's curated settings-read channels
 * (Phase 30 Plan 06 — gap closure for Gap 2 / UAT Test 8).
 *
 * Drives the REAL sidecar RPC server in-process (`installFlows.test.ts`'s own
 * real-shim black-box pattern — the shims under test are the actual
 * electronStub.ts/fileStore.ts modules, unmocked) against injected
 * `stream.PassThrough` pairs.
 *
 * **GAP FIX precedent (2026-07-22, see skeletonFlows.test.ts's own header):**
 * this suite's config directory is NOT the real OS config directory. The
 * `jest.mock('os', ...)` below overrides `homedir()` to a disposable
 * per-process tmp directory so the real electronStub/fileStore CODE runs
 * (preserving this suite's fidelity), while the location it reads/writes can
 * never be the developer's real config directory.
 *
 * `jest.mock('electron', ...)` / `jest.mock('electron-store', ...)` below
 * point Jest's OWN module resolution at electronStub.ts/fileStore.ts
 * directly — see skeletonFlows.test.ts's header for why this is necessary.
 *
 * Mocked only at the boundaries `settingsFlowRegistration.ts`'s own module
 * docstring names:
 *   - `backend/config` (`GlobalConfig.get`) — mirrors
 *     `installFlows.test.ts`'s own strategy: a real `GlobalConfig.get()` call
 *     writes a fresh `config.json` to disk via `graceful-fs`, which needs its
 *     parent directory to already exist (real Electron creates it at
 *     app-start via `makeSureFoldersExist`). A plain
 *     `{ getSettings: () => settings }` stub avoids that disk dependency.
 *   - `backend/game_config` (`GameConfig.get`) — same rationale, a
 *     `{ getSettings: () => settings }` stub avoids GameConfigV0's own
 *     on-disk read/migration path.
 *   - `backend/storeManagers` (`libraryManagerMap`) — a minimal stub whose
 *     `steam.getGame` is a jest.fn(), so a steam-routed request never reaches
 *     the real SteamLibraryManager/SteamGame construction.
 *   - `backend/storeManagers/steam/state` (`library`) — the in-memory Steam
 *     library Map is swapped for a plain `Map` this suite controls directly,
 *     so `steamLibrary.has(appName)` is a deterministic per-test fixture, not
 *     whatever the real Steam library happens to contain.
 *
 * Every other module in the registration/transport/store path
 * (`settingsFlowRegistration.ts`, `handlers.ts`, `sidecarRpc.ts`,
 * `bootstrap.ts`, `electronStub.ts`, `fileStore.ts`) runs for real,
 * unmodified.
 */

import { PassThrough } from 'node:stream'

// ── os — GAP FIX precedent: redirect homedir() to a disposable per-process
// tmp directory so this suite can never touch a developer's real config
// directory ──────────────────────────────────────────────────────────────
jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(
        actual.tmpdir(),
        `gamelib-settingsflows-test-home-${process.pid}`
      )
  }
})

// ── electron / electron-store — route Jest's own module resolution at the
// REAL sidecar shims (see module docstring above) ───────────────────────────
jest.mock('electron', () => jest.requireActual('../electronStub'))
jest.mock('electron-store', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ── backend/constants/environment mock — pins a deterministic branch
// regardless of the host OS running this test (mirrors installFlows.test.ts) ─
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true
}))

// ── backend/config mock — avoid a real on-disk config.json write while
// still exercising the real requestAppSettings handler body ─────────────────
jest.mock('backend/config', () => ({
  GlobalConfig: {
    get: jest.fn()
  }
}))

// ── backend/game_config mock — avoid GameConfigV0's own on-disk
// read/migration path while still exercising the real requestGameSettings
// non-steam fallback branch ──────────────────────────────────────────────────
jest.mock('backend/game_config', () => ({
  GameConfig: {
    get: jest.fn()
  }
}))

// ── backend/storeManagers mock — the steam-routed branch must never
// construct a real SteamLibraryManager/SteamGame; a plain jest.fn() proves
// the routing decision without any depot/PICS/filesystem involvement ────────
jest.mock('backend/storeManagers', () => ({
  libraryManagerMap: {
    steam: {
      getGame: jest.fn()
    }
  }
}))

// ── backend/storeManagers/steam/state mock — a plain Map this suite controls
// directly, so `steamLibrary.has(appName)` is a deterministic per-test
// fixture ────────────────────────────────────────────────────────────────────
jest.mock('../../storeManagers/steam/state', () => ({
  library: new Map()
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { init } from '../bootstrap'
import { GlobalConfig } from 'backend/config'
import { GameConfig } from 'backend/game_config'
import { libraryManagerMap } from 'backend/storeManagers'
import { library as steamLibrary } from '../../storeManagers/steam/state'
import { UNPORTED_CHANNEL_MARKER } from 'common/types/sidecarTransport'
import type { AppSettings, GameSettings } from 'common/types'

const mockedGlobalConfigGet = GlobalConfig.get as jest.Mock
const mockedGameConfigGet = GameConfig.get as jest.Mock
const mockedSteamGetGame = libraryManagerMap.steam.getGame as jest.Mock

/** Points the mocked GlobalConfig.get() at a fresh settings object. */
function mockAppSettings(partial: Partial<AppSettings>) {
  mockedGlobalConfigGet.mockReturnValue({
    getSettings: () => partial as AppSettings
  })
}

type Frame = Record<string, unknown>

/** Buffers newline-delimited output from a PassThrough into parsed frames. */
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

/** Waits a couple of microtask/macrotask turns for async invoke handlers to resolve. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

/** Starts a fresh sidecar RPC loop bound to its own stream pair. */
function startSidecar(): { input: PassThrough; frames: Frame[] } {
  const input = new PassThrough()
  const output = new PassThrough()
  const frames = collectFrames(output)
  init(input, output)
  return { input, frames }
}

/** Writes a well-formed `invoke` request frame to the sidecar's stdin. */
function writeInvoke(
  input: PassThrough,
  id: string,
  channel: string,
  args: unknown[]
): void {
  input.write(`${JSON.stringify({ id, kind: 'invoke', channel, args })}\n`)
}

describe('sidecar settings-read flows (Phase 30 Plan 06)', () => {
  beforeEach(() => {
    steamLibrary.clear()
    mockAppSettings({ language: 'en', enableSteamNativeInstall: false })
    mockedGameConfigGet.mockReset().mockReturnValue({
      getSettings: async () =>
        ({ wineVersion: { name: 'fallback' } }) as unknown as GameSettings
    })
    mockedSteamGetGame.mockReset().mockReturnValue({
      getSettings: async () =>
        ({ wineVersion: { name: 'steam-routed' } }) as unknown as GameSettings
    })
  })

  // Must-have 1: requestAppSettings resolves real (stubbed) GlobalConfig
  // settings, NOT the UNPORTED_CHANNEL_MARKER.
  it('requestAppSettings resolves ok:true with the real GlobalConfig settings, not the unported marker', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'app-settings-1', 'requestAppSettings', [])
    await flush()

    const response = frames.find((frame) => frame.id === 'app-settings-1') as
      | { ok: boolean; result?: unknown; error?: string }
      | undefined
    expect(response?.ok).toBe(true)
    expect(response?.result).toMatchObject({
      language: 'en',
      enableSteamNativeInstall: false
    })
    expect(response?.error).toBeUndefined()
  })

  // Must-have 1b: requestGameSettings for a NON-steam appName reaches
  // GameConfig.get(appName).getSettings(), NOT the marker.
  it('requestGameSettings for a non-steam appName reaches GameConfig.get(appName).getSettings(), not the unported marker', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'game-settings-1', 'requestGameSettings', [
      'some-gog-app'
    ])
    await flush()

    const response = frames.find((frame) => frame.id === 'game-settings-1') as
      | { ok: boolean; result?: { wineVersion?: { name?: string } } }
      | undefined
    expect(response?.ok).toBe(true)
    expect(response?.result).toMatchObject({
      wineVersion: { name: 'fallback' }
    })
    expect(mockedGameConfigGet).toHaveBeenCalledWith('some-gog-app')
    expect(mockedSteamGetGame).not.toHaveBeenCalled()
  })

  // requestGameSettings for a steam-library appName routes through
  // libraryManagerMap['steam'].getGame(appName).getSettings() instead of
  // GameConfig (main.ts:1012-1015 parity).
  it('requestGameSettings for a steam-library appName routes through the steam manager, not GameConfig', async () => {
    steamLibrary.set('999001', { title: 'Steam Routed Game' } as never)

    const { input, frames } = startSidecar()
    writeInvoke(input, 'game-settings-2', 'requestGameSettings', ['999001'])
    await flush()

    const response = frames.find((frame) => frame.id === 'game-settings-2') as
      | { ok: boolean; result?: { wineVersion?: { name?: string } } }
      | undefined
    expect(response?.ok).toBe(true)
    expect(response?.result).toMatchObject({
      wineVersion: { name: 'steam-routed' }
    })
    expect(mockedSteamGetGame).toHaveBeenCalledWith('999001')
    expect(mockedGameConfigGet).not.toHaveBeenCalled()
  })

  // Invariant B guard: a still-unported DownloadDialog channel (e.g.
  // checkDiskSpace) STILL rejects carrying UNPORTED_CHANNEL_MARKER, and the
  // RPC loop keeps serving afterward (health resolves).
  it('Invariant B guard: checkDiskSpace (deliberately unported) still rejects non-fatally, and the RPC loop keeps serving', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'disk-space-1', 'checkDiskSpace', [])
    await flush()

    const diskSpaceResponse = frames.find(
      (frame) => frame.id === 'disk-space-1'
    ) as { ok: boolean; error?: string } | undefined
    expect(diskSpaceResponse?.ok).toBe(false)
    expect(diskSpaceResponse?.error).toContain(UNPORTED_CHANNEL_MARKER)

    writeInvoke(input, 'health-after-disk-space', 'health', [])
    await flush()
    const healthResponse = frames.find(
      (frame) => frame.id === 'health-after-disk-space'
    )
    expect(healthResponse).toMatchObject({
      id: 'health-after-disk-space',
      ok: true,
      result: 'ok'
    })
  })
})
