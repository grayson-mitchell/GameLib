/**
 * End-to-end flow integration test for the sidecar's curated Steam channels
 * (Phase 27 Plan 04 — Task 2).
 *
 * Drives the REAL sidecar RPC server in-process (bootstrap.test.ts's
 * real-shim black-box pattern — the shims under test are the actual
 * electronStub.ts/fileStore.ts modules, unmocked) against injected
 * `stream.PassThrough` pairs.
 *
 * **GAP FIX (2026-07-22):** this suite's config directory is NOT the real OS
 * config directory. Test 4 below writes fixture data (including a fake
 * refreshToken) through the real configStore/fileStore module instance, and a
 * previous incident (see `electronUntouched.test.ts`'s header) proved that
 * doing so against a developer's REAL
 * `~/Library/Application Support/GameLib/` is an active data-loss hazard. The
 * `jest.mock('os', ...)` below overrides `homedir()` to a disposable
 * per-process tmp directory so the real electronStub/fileStore CODE runs
 * (preserving this suite's fidelity), while the location it reads/writes can
 * never be the developer's real config directory.
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

// ── os — GAP FIX (2026-07-22): Test 4 below writes fixture data (including a
// fake refreshToken) through the real, unmocked configStore/fileStore module
// instance to prove the snapshot handler filters it out. That module resolves
// its on-disk path from `homedir()` (pathShim.ts -> resolveAppDataDir), and on
// darwin there is no HOME/XDG_CONFIG_HOME override — left unmocked, this would
// write directly into the developer's REAL
// `~/Library/Application Support/GameLib/steam_store/config.json`, the exact
// file a previous version of `electronUntouched.test.ts` destroyed (see that
// file's header). Overriding `homedir()` to a disposable per-process tmp
// directory keeps the real electronStub/fileStore code paths under test (the
// whole point of this suite) while making it structurally impossible for any
// test in this file to touch real user data.
jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(
        actual.tmpdir(),
        `gamelib-skeletonflows-test-home-${process.pid}`
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
import { configStore } from 'backend/constants/key_value_stores'

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

/** Writes a well-formed `send` (fire-and-forget) request frame to the sidecar's stdin. */
function writeSend(
  input: PassThrough,
  id: string,
  channel: string,
  args: unknown[]
): void {
  input.write(`${JSON.stringify({ id, kind: 'send', channel, args })}\n`)
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
    // fixture data through the SAME module instance the handler reads. Safe:
    // the `jest.mock('os', ...)` above redirects this module's on-disk
    // location to a disposable per-process tmp directory, never the
    // developer's real config directory.
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
      // Isolated per-process tmp config dir (see jest.mock('os', ...) above)
      // — clear() here only ever touches that disposable directory, never
      // real user data. Clean up so the fixture data doesn't leak into
      // another test in this same file.
      steamConfigStore.clear()
    }
  })

  // Phase 29 Plan 06 (D-05/D-06/D-08): the real storeSet/storeDelete/storeNew write
  // path. Every write in this describe block goes through the REAL RPC server against
  // the SAME real (unmocked) configStore/steamConfigStore instances Test 4 above uses —
  // safe for the identical reason: the `os` module override at the top of this file
  // (see this file's header docstring) redirects their on-disk location to a disposable
  // per-process tmp directory, never the developer's real config directory.
  describe('storeSet', () => {
    afterEach(() => {
      // Isolated per-process tmp config dir (see the `os` module override at the top of
      // this file) — clear() here only ever touches that disposable directory. Clears
      // both stores touched anywhere in this describe block so no fixture leaks between
      // tests.
      configStore.clear()
      steamConfigStore.clear()
    })

    // A renderer storeSet write persists through the registry and is visible in a
    // FRESH snapshot fetch — not merely the renderer's own optimistic local value,
    // which is exactly the gap this plan closes (29-RESEARCH Pitfall 1). The same write
    // also announces itself as a storeChanged frontendMessage frame (D-06).
    it('a storeSet write persists and is visible in a fresh snapshot fetch, and announces a storeChanged event', async () => {
      const { input, frames } = startSidecar()
      writeSend(input, 'set-1', 'storeSet', ['configStore', 'theme', 'gsd-probe'])
      await flush()

      // FRESH snapshot fetch — a new invoke round-trip, not a read of any local state.
      writeInvoke(input, 'snapshot-set-1', 'sidecar:store-snapshot', [])
      await flush()

      const response = frames.find((frame) => frame.id === 'snapshot-set-1') as
        | { ok: boolean; result: { configStore?: Record<string, unknown> } }
        | undefined
      expect(response?.ok).toBe(true)
      expect(response?.result.configStore?.theme).toBe('gsd-probe')

      const changed = frames.find(
        (frame) =>
          frame.kind === 'frontendMessage' && frame.channel === 'storeChanged'
      )
      expect(changed).toBeDefined()
      expect((changed?.args as unknown[])[0]).toEqual({
        store: 'configStore',
        key: 'theme',
        value: 'gsd-probe',
        deleted: false
      })
    })

    // A storeDelete for the same key removes it from a subsequent snapshot and emits a
    // storeChanged frame with deleted: true.
    it('a storeDelete removes the key from a subsequent snapshot and emits a change event with deleted: true', async () => {
      const { input, frames } = startSidecar()
      writeSend(input, 'set-2', 'storeSet', ['configStore', 'theme', 'gsd-probe-2'])
      await flush()
      writeSend(input, 'del-1', 'storeDelete', ['configStore', 'theme'])
      await flush()

      writeInvoke(input, 'snapshot-del-1', 'sidecar:store-snapshot', [])
      await flush()

      const response = frames.find((frame) => frame.id === 'snapshot-del-1') as
        | { ok: boolean; result: { configStore?: Record<string, unknown> } }
        | undefined
      expect(response?.ok).toBe(true)
      expect(response?.result.configStore).not.toHaveProperty('theme')

      const deleteEvent = frames.find(
        (frame) =>
          frame.kind === 'frontendMessage' &&
          frame.channel === 'storeChanged' &&
          ((frame.args as unknown[])[0] as { deleted?: boolean })?.deleted === true
      )
      expect(deleteEvent).toBeDefined()
      expect((deleteEvent?.args as unknown[])[0]).toEqual({
        store: 'configStore',
        key: 'theme',
        deleted: true
      })
    })

    // PHASE 28 D-04 REGRESSION: a storeSet targeting steamConfigStore.refreshToken must
    // be rejected — the real, on-disk token must stay byte-identical, and no
    // storeChanged frame may be emitted for it. A plaintext write here would be
    // Keychain-decrypt-failed by Electron and would silently sign the real user out.
    it('PHASE 28 D-04 regression: a storeSet into steamConfigStore.refreshToken is rejected and leaves the real token byte-identical', async () => {
      steamConfigStore.set('refreshToken', 'REAL-TOKEN-DO-NOT-OVERWRITE')
      const before = steamConfigStore.get_nodefault('refreshToken')

      const { input, frames } = startSidecar()
      writeSend(input, 'set-attacker-1', 'storeSet', [
        'steamConfigStore',
        'refreshToken',
        'ATTACKER'
      ])
      await flush()

      const after = steamConfigStore.get_nodefault('refreshToken')
      expect(after).toBe(before)
      expect(after).toBe('REAL-TOKEN-DO-NOT-OVERWRITE')

      const changed = frames.find(
        (frame) =>
          frame.kind === 'frontendMessage' &&
          frame.channel === 'storeChanged' &&
          ((frame.args as unknown[])[0] as { store?: string })?.store ===
            'steamConfigStore'
      )
      expect(changed).toBeUndefined()
    })

    // CR-01 REGRESSION (Phase 29 code review): the review verified this exact frame
    // end-to-end — `storeSet('timestampStore', '__proto__.polluted', 'PWNED')` passed
    // guards (a)/(b)/(c) (timestampStore's policy is '*') and reached
    // `FileStore.set()`, whose unguarded dot-notation walk landed the cursor on
    // Object.prototype. Two independent guards now stop it: guard (c′) in
    // `applyStoreWrite` and `isSafeKeyPath` in `fileStore.ts`'s path helpers.
    it('CR-01 regression: a `__proto__`/`constructor`/`prototype` key path is rejected and cannot pollute Object.prototype', async () => {
      const { input, frames } = startSidecar()
      writeSend(input, 'set-proto-1', 'storeSet', [
        'timestampStore',
        '__proto__.polluted',
        'PWNED'
      ])
      writeSend(input, 'set-proto-2', 'storeSet', [
        'configStore',
        'settings.__proto__.polluted',
        'PWNED'
      ])
      writeSend(input, 'set-proto-3', 'storeSet', [
        'legendary_library',
        'constructor.prototype.polluted',
        'PWNED'
      ])
      await flush()

      expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
      expect(Object.prototype).not.toHaveProperty('polluted')

      // No change event may be announced for a rejected write, otherwise the
      // renderer would treat the hostile key as persisted.
      const changed = frames.filter(
        (frame) =>
          frame.kind === 'frontendMessage' && frame.channel === 'storeChanged'
      )
      expect(changed.length).toBe(0)

      // The RPC loop keeps serving after the rejections.
      writeInvoke(input, 'health-after-proto', 'health', [])
      await flush()
      expect(frames.find((frame) => frame.id === 'health-after-proto')).toMatchObject(
        { ok: true, result: 'ok' }
      )
    })

    // Malformed store names (an unrecognized name and a traversal-shaped name) are
    // inert: no change event, no write outside the temp home (guard (a)/(c) reject
    // before any store resolution is ever attempted), and the RPC loop keeps serving —
    // a subsequent health invoke still responds ok: true.
    it('rejects an unknown store name and a traversal-shaped name — no change event, no crash, health still responds', async () => {
      const { input, frames } = startSidecar()
      writeSend(input, 'set-bad-1', 'storeSet', ['not_a_store', 'theme', 'x'])
      writeSend(input, 'set-bad-2', 'storeSet', ['../../evil', 'theme', 'x'])
      await flush()

      const changed = frames.filter(
        (frame) =>
          frame.kind === 'frontendMessage' && frame.channel === 'storeChanged'
      )
      expect(changed.length).toBe(0)

      writeInvoke(input, 'health-after-bad', 'health', [])
      await flush()
      const healthResponse = frames.find(
        (frame) => frame.id === 'health-after-bad'
      )
      expect(healthResponse).toMatchObject({
        id: 'health-after-bad',
        ok: true,
        result: 'ok'
      })
    })
  })
})
