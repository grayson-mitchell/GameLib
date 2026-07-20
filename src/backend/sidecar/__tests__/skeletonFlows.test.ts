/**
 * End-to-end flow integration test for the sidecar's curated Steam channels
 * (Phase 27 Plan 04 — Task 2).
 *
 * Drives the REAL sidecar RPC server in-process (bootstrap.test.ts's
 * real-tmpdir black-box pattern — the shims under test read/write the real
 * OS config directory, same as production) against injected
 * `stream.PassThrough` pairs.
 *
 * `jest.mock('electron', ...)` / `jest.mock('electron-store', ...)` below
 * point Jest's OWN module resolution at electronStub.ts/fileStore.ts
 * directly. This is necessary, not incidental: `src/backend/__mocks__/
 * electron.ts` and `.../electron-store.ts` are Jest manual mocks for
 * node_modules packages, which Jest auto-applies to EVERY backend test —
 * BEFORE Node's `Module._load` (which bootstrap.ts's own hook patches) is
 * ever consulted, since Jest implements its own module registry for
 * `import ... from 'electron'`. Left unmocked, every real flow handler
 * would run against those generic fixtures instead of THIS plan's actual
 * sidecar transport (no `shell` export at all in the adjacent manual mock,
 * and a differently-rooted `app.getPath`), so neither the
 * `shell.openExternal` -> `openExternal` RPC frame bridge nor the
 * `BrowserWindow.webContents.send` -> `pushGameToLibrary` notification
 * bridge — the exact seams this test exists to prove — would ever be
 * exercised. `jest.requireActual` resolves the SAME singleton module
 * instance `bootstrap.ts`/`sidecarRpc.ts` bind their transport onto, so this
 * is the real electronStub/FileStore, wired through Jest's mock system
 * instead of the production `Module._load` hook (which only takes effect in
 * the real bundled `build/main/sidecar.js` process, outside Jest).
 *
 * Only steam-user's network surface (`SteamUser.ensureConnected`/
 * `getClient`, mirroring library.test.ts's own LIB-01 convention) and
 * `backend/utils`'s `getSteamLibraries` (no real on-disk Steam install in
 * CI) are stubbed; `backend/constants/environment` is pinned to
 * `isMac:false` so `SteamGame.launch()`'s bottle-eligibility/metadata-fetch
 * branches (mac-only) never fire, keeping this test on the native
 * steam:// action-flow branch without a real network call to the Steam
 * store API. Every other module in the read/action flow paths (library.ts,
 * games.ts, electronStores.ts, backend/ipc.ts, main_window.ts,
 * electronStub.ts, sidecarRpc.ts, bootstrap.ts, steamFlowRegistration.ts,
 * handlers.ts) runs for real, unmodified.
 *
 * Assertions are made only on the observable RPC frames (SidecarRpcResponse
 * / SidecarNotification / the openExternal SidecarRpcRequest) — never on
 * internals — per the plan's own acceptance criteria.
 */

import { PassThrough } from 'node:stream'

// ── electron / electron-store — route Jest's own module resolution at the
// REAL sidecar shims (see module docstring above) ───────────────────────────
jest.mock('electron', () => jest.requireActual('../electronStub'))
jest.mock('electron-store', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ── backend/utils mock — no real on-disk Steam install to scan in CI ────────
jest.mock('backend/utils', () => ({
  getSteamLibraries: jest.fn(),
  getFileSize: jest.fn()
}))

// ── backend/constants/environment mock — pins the native (non-bottle,
// non-mac-metadata-fetch) branch deterministically regardless of the host
// OS running this test ───────────────────────────────────────────────────────
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true
}))

// ── SteamUser mock — controls ensureConnected()/getClient() (mirrors
// library.test.ts's LIB-01 convention); automocked, no factory ──────────────
jest.mock('../../storeManagers/steam/user')

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { init } from '../bootstrap'
import { SteamUser } from '../../storeManagers/steam/user'
import { getSteamLibraries } from 'backend/utils'
import { configStore as steamConfigStore } from '../../storeManagers/steam/electronStores'

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

describe('sidecar Steam skeleton flows (read + action, end to end)', () => {
  beforeEach(() => {
    // resetMocks:true (shared root config) wipes automock/factory
    // implementations before every test — re-establish the defaults every
    // test relies on.
    jest.mocked(getSteamLibraries).mockResolvedValue([])
  })

  // Test 1 (read flow): dispatching a `refreshLibrary` invoke frame through
  // the RPC server, with steam-user's owned-apps path stubbed to return >=1
  // app, produces >=1 `pushGameToLibrary` SidecarNotification carrying a
  // steam GameInfo.
  it('Test 1 (read flow): refreshLibrary invoke produces a pushGameToLibrary notification carrying a steam GameInfo', async () => {
    jest.mocked(SteamUser.ensureConnected).mockResolvedValue(true)
    const fakeClient = {
      steamID: 'STEAMID_TEST',
      getUserOwnedApps: jest.fn().mockResolvedValue({
        app_count: 1,
        apps: [{ appid: 999001, name: 'Skeleton Test Game', playtime_forever: 0 }]
      })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)

    const { input, frames } = startSidecar()
    writeInvoke(input, 'read-1', 'refreshLibrary', [])
    await flush()

    const pushes = frames.filter(
      (frame) =>
        frame.kind === 'frontendMessage' && frame.channel === 'pushGameToLibrary'
    )
    expect(pushes.length).toBeGreaterThanOrEqual(1)

    const pushedGame = (pushes[0].args as unknown[])[0] as {
      app_name: string
      runner: string
    }
    expect(pushedGame.runner).toBe('steam')
    expect(pushedGame.app_name).toBe('999001')

    const response = frames.find((frame) => frame.id === 'read-1')
    expect(response).toMatchObject({ id: 'read-1', ok: true })
  })

  // Test 2 (action flow): dispatching a `launch` invoke frame for a
  // numeric-appId steam game produces an `openExternal` RPC frame whose URL
  // matches ^steam://rungameid/\d+$.
  it('Test 2 (action flow): launch invoke for a numeric appId emits a validated steam://rungameid/<id> openExternal frame', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'launch-1', 'launch', [
      { appName: '999002', runner: 'steam' }
    ])
    await flush()

    const openExternal = frames.find((frame) => frame.kind === 'openExternal')
    expect(openExternal).toBeDefined()
    const url = (openExternal?.args as unknown[])[0] as string
    expect(url).toMatch(/^steam:\/\/rungameid\/\d+$/)
    expect(url).toBe('steam://rungameid/999002')

    const response = frames.find((frame) => frame.id === 'launch-1')
    expect(response).toMatchObject({
      id: 'launch-1',
      ok: true,
      result: { status: 'done' }
    })
  })

  // Test 3 (guard): a non-numeric appId does NOT emit an openExternal frame
  // (buildSteamProtocolUrl T-03-01 guard holds through the sidecar).
  it('Test 3 (guard): launch invoke for a non-numeric appId does not emit an openExternal frame', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'launch-2', 'launch', [
      { appName: '../../etc/passwd', runner: 'steam' }
    ])
    await flush()

    const openExternal = frames.find((frame) => frame.kind === 'openExternal')
    expect(openExternal).toBeUndefined()

    const response = frames.find((frame) => frame.id === 'launch-2')
    expect(response).toMatchObject({
      id: 'launch-2',
      ok: true,
      result: { status: 'error' }
    })
  })

  // Test 4 (snapshot): the SIDECAR_STORE_SNAPSHOT response includes
  // steamConfigStore.userData but never refreshToken.
  it('Test 4 (snapshot): sidecar:store-snapshot includes steamConfigStore.userData but never refreshToken', async () => {
    // Real (unmocked) electron-store-backed steamConfigStore — write test
    // fixture data through the SAME module instance the handler reads.
    steamConfigStore.set('userData', {
      username: 'skeleton-tester',
      steamId: 'STEAMID_TEST'
    })
    steamConfigStore.set(
      'refreshToken',
      'super-secret-should-never-leave-the-sidecar'
    )

    try {
      const { input, frames } = startSidecar()
      writeInvoke(input, 'snapshot-1', 'sidecar:store-snapshot', [])
      await flush()

      const response = frames.find((frame) => frame.id === 'snapshot-1') as
        | {
            ok: boolean
            result: { steamConfigStore?: Record<string, unknown> }
          }
        | undefined

      expect(response?.ok).toBe(true)
      expect(response?.result.steamConfigStore?.userData).toEqual({
        username: 'skeleton-tester',
        steamId: 'STEAMID_TEST'
      })
      expect(response?.result.steamConfigStore).not.toHaveProperty(
        'refreshToken'
      )
    } finally {
      // Real-tmpdir pattern touches the actual OS config dir — clean up the
      // fixture data this test wrote so it never leaks into another run.
      steamConfigStore.clear()
    }
  })
})
