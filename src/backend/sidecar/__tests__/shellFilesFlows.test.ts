/**
 * End-to-end wiring test for the sidecar's curated shell/files/diagnostics
 * channels (Phase 34.3 Plan 01 — REQ-34.3-01/REQ-34.3-02/REQ-34.3-13).
 *
 * Drives the REAL sidecar RPC server in-process (`appShellFlows.test.ts`'s
 * own real-shim black-box pattern — the shims under test are the actual
 * electronStub.ts/fileStore.ts modules, unmocked) against injected
 * `stream.PassThrough` pairs. The harness below (mock preamble, `startSidecar`/
 * `writeSend`/`writeInvoke`/`flush`) is copied from `appShellFlows.test.ts`
 * rather than invented fresh, since that suite already proves this exact mock
 * stack lets the WHOLE `handlers.ts` module graph (which now also calls this
 * plan's own `registerShellFilesFlows()`) load and run safely.
 *
 * Every registration this plan owns delegates to `backend/utils.ts` /
 * `backend/utils/filesystem`, both already inside the sidecar's import graph
 * (Phase 34.1) — so the same `jest.mock('os', ...)` homedir redirection,
 * `jest.mock('electron', ...)`/`jest.mock('electron-store', ...)` shim
 * routing, and `jest.mock('../sidecarRpc', ...)` partial mock this suite's
 * analog uses are required here too, for the identical reason.
 *
 * Plan 02 extends this suite with `clearCache`/`clearAchievementCache`/
 * `resetHeroic` coverage. `clearCache`'s dialog reaches REAL i18next
 * translations — `jest.unmock('i18next')` below is load-bearing (see
 * `gameDetailsFlows.test.ts`'s own header for the documented incident this
 * pattern exists to avoid: a `jest.mock('i18next', ...)` block here would
 * make the resolved-title assertion pass whether or not `bootstrap.ts`'s
 * i18next init ever ran). `resetHeroic` ACTUALLY DELETES `configPath`/
 * `gamesConfigPath` — the `jest.mock('../pathShim', ...)` block below is the
 * CR-03 containment fix (34.2-10/gameDetailsFlows.test.ts precedent): on
 * darwin the `os` mock alone is sufficient (`pathShim`'s `resolveAppDataDir()`
 * calls `homedir()` directly for that branch), but on win32/linux it prefers
 * `env.APPDATA`/`env.XDG_CONFIG_HOME` over `homedir()` and would bypass the
 * `os` mock entirely — a real, destructive gap for a suite that deletes
 * files. Both mocks root at the SAME disposable tmp directory.
 */

// ── i18next -- DEFEAT Jest's project-wide automatic manual mock. Without
// this line `clearCache`'s dialog title would resolve to the automock's
// `t(key) => key` echo (the literal string 'box.cache-cleared.title'), which
// would make the "resolved English string" assertion below pass whether or
// not bootstrap.ts's real i18next init ever ran. `jest.unmock` restores
// default (real) module resolution — it does not substitute a replacement. ─
jest.unmock('i18next')

import { PassThrough } from 'node:stream'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { tmpdir } from 'os'

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
        `gamelib-shellfilesflows-test-home-${process.pid}`
      )
  }
})

// ── pathShim — CR-03 (34.2-10 precedent): the REAL choke point.
// `constants/paths.ts`'s module-scope `app.getPath('appData'|'userData')`
// calls resolve through `electronStub.ts` -> `pathShim.getPath()`, whose real
// `resolveAppDataDir()` prefers `env.APPDATA`/`env.XDG_CONFIG_HOME` over
// `homedir()` on win32/default — bypassing the `os` mock above on those
// platforms. `resetHeroic` deletes `configPath`/`gamesConfigPath` for real,
// so this suite must not rely on the darwin-only sufficiency of the `os`
// mock alone. Rooted at the SAME per-suite tmp directory. ──────────────────
jest.mock('../pathShim', () => {
  const actualOs = jest.requireActual('os')
  const actualPath = jest.requireActual('path')
  const tmpRoot = actualPath.join(
    actualOs.tmpdir(),
    `gamelib-shellfilesflows-test-home-${process.pid}`
  )
  return {
    getPath: (name: string) => {
      switch (name) {
        case 'appData':
          return tmpRoot
        case 'userData':
          return actualPath.join(tmpRoot, 'GameLib')
        case 'temp':
          return actualOs.tmpdir()
        case 'home':
          return tmpRoot
        default:
          throw new Error(
            `[pathShim mock] getPath('${name}') is not shimmed for this test`
          )
      }
    }
  }
})

// ── electron / electron-store — route Jest's own module resolution at the
// REAL sidecar shims (see module docstring above) ───────────────────────────
jest.mock('electron', () => jest.requireActual('../electronStub'))
jest.mock('electron-store', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ── sidecarRpc — PARTIAL mock: real startRpcServer/pushFrontendMessage/
// requestOpenExternal, scriptable requestRustInvoke only ────────────────────
jest.mock('../sidecarRpc', () => ({
  ...jest.requireActual('../sidecarRpc'),
  requestRustInvoke: jest.fn()
}))

// ── axios — bootstrap's init() wires the real initOnlineMonitor(), which
// immediately calls the real pingSites(), a live axios.head() against
// github/epic/gog/cloudflare. Mocked so this suite never makes a real
// network call (mirrors appShellFlows.test.ts) ──────────────────────────────
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

// ── backend/constants/environment mock — pins a deterministic branch
// regardless of the host OS running this test (mirrors appShellFlows.test.ts);
// isFlatpak: false makes isAccessibleWithinFlatpakSandbox's short-circuit
// return true unconditionally for checkDiskSpace's coverage below ──────────
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true,
  isIntelMac: false,
  isSteamDeckGameMode: false,
  isFlatpak: false
}))

// ── backend/config mock — avoid a real on-disk config.json write while
// still letting registerAppShellFlows()'s own module-scope syncTrayIcon()
// (scheduled via setImmediate at handlers.ts import time) resolve safely ────
jest.mock('backend/config', () => ({
  GlobalConfig: {
    get: jest.fn()
  }
}))

// ── legendary electronStores mock — avoids a real disk-backed CacheStore
// construction (this repo's own "tests clobbering real store" precedent).
// `installStore`/`libraryStore` added alongside `gameInfoStore` for Plan
// 02's `clearCache` coverage — utils.ts's real `clearCache()` body calls
// `.clear()` on all three; without a mock, the missing two throw
// synchronously (caught by clearCache's own try/catch, but BEFORE
// `pushFrontendMessage('refreshLibrary')` ever runs) ────────────────────────
jest.mock('../../storeManagers/legendary/electronStores', () => ({
  gameInfoStore: {
    clear: jest.fn()
  },
  installStore: {
    clear: jest.fn()
  },
  libraryStore: {
    clear: jest.fn()
  }
}))

// ── abort handler mock — mirrors appShellFlows.test.ts's boundary choice;
// not exercised by this plan's own channels ──────────────────────────────────
jest.mock('../../utils/aborthandler/aborthandler', () => ({
  callAbortController: jest.fn(),
  callAllAbortControllers: jest.fn()
}))

// ── backend/storeManagers mock — utils.ts's real `clearCache()` body ends
// with a fire-and-forget `import('./storeManagers').then(({ libraryManagerMap }) =>
// libraryManagerMap['legendary'].runRunnerCommand({ subcommand: 'cleanup' }, ...))`
// (Electron parity, unmodified). Without this mock that reaches the REAL
// legendary runner machinery (`launcher.ts`'s `callRunner`, an actual
// `child_process.spawn()`) — this narrow stub keeps clearCache's coverage
// focused on ITS OWN behavior (store clears + refreshLibrary + dialog),
// mirroring gameDetailsFlows.test.ts's/downloadQueueFlows.test.ts's own
// `backend/storeManagers` mock precedent ────────────────────────────────────
jest.mock('backend/storeManagers', () => ({
  libraryManagerMap: {
    legendary: { runRunnerCommand: jest.fn() }
  }
}))

// ── backend/dialog/dialog mock — narrow override, real module spread
// (mirrors gameDetailsFlows.test.ts's own `notify` boundary choice).
// `showDialogBoxModalAuto` is a bare `jest.fn()` here — this project's jest
// config sets `resetMocks: true` (`src/backend/jest.config.js`), which wipes
// ANY implementation set inside a `jest.mock(...)` factory before EVERY
// test. Baking the real implementation in here would silently no-op after
// the very first test runs. The REAL default implementation is
// (re-)installed in the cache/reset describe block's own `beforeEach` below,
// AFTER jest's automatic reset — the only place it survives. A single test
// can still override it for one call via `mockImplementationOnce` to inject
// a synthetic dialog failure, without touching `backend/ipc.ts`'s own
// `sendFrontendMessage`, which structurally cannot throw (see `dialog.ts`'s
// own two-branch body) ──────────────────────────────────────────────────────
jest.mock('../../dialog/dialog', () => ({
  ...jest.requireActual('../../dialog/dialog'),
  showDialogBoxModalAuto: jest.fn()
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { init } from '../bootstrap'
import { GlobalConfig } from 'backend/config'
import { requestRustInvoke } from '../sidecarRpc'
import { listenerRegistry, handlerRegistry } from '../electronStub'
import { showDialogBoxModalAuto } from '../../dialog/dialog'
import { achievementStore } from '../../storeManagers/gog/electronStores'
import {
  RUST_SHELL_OPEN_PATH,
  RUST_SHELL_SHOW_ITEM_IN_FOLDER,
  RUST_APP_RELAUNCH,
  RUST_INVOKE_CHANNELS
} from 'common/types/sidecarTransport'
import { configPath, gamesConfigPath } from '../../constants/paths'
import {
  supportURL,
  weblateUrl,
  epicLoginUrl,
  discordLink,
  patreonPage,
  kofiPage,
  githubSponsorsPage,
  wineprefixFAQ,
  wikiLink,
  sidInfoUrl
} from '../../constants/urls'

const mockedGlobalConfigGet = GlobalConfig.get as jest.Mock
const mockRequestRustInvoke = requestRustInvoke as jest.Mock

/** Points the mocked GlobalConfig.get() at a fresh settings object. */
function mockAppSettings(partial: Record<string, unknown>) {
  const setSetting = jest.fn()
  mockedGlobalConfigGet.mockReturnValue({
    getSettings: () => partial,
    setSetting,
    set: jest.fn(),
    flush: jest.fn()
  })
  return { setSetting }
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

/**
 * Polls `frames` until a response with the given `id` appears, or `timeoutMs`
 * elapses. `flush()`'s fixed 3-tick wait is sufficient for handlers that only
 * chain Promise microtasks, but `checkDiskSpace`/`getShellPath` reach real
 * async I/O (a dynamic `import()` of `./unix`/`./windows`, and a real
 * `child_process.exec()` respectively) that can outlast 3 `setImmediate`
 * ticks — this uses real `setTimeout` polling regardless of whether the
 * calling test has fake timers active elsewhere in this file.
 */
async function waitForResponse(
  frames: Frame[],
  id: string,
  timeoutMs = 5000
): Promise<Frame | undefined> {
  const start = Date.now()
  for (;;) {
    const found = frames.find((f) => f.id === id)
    if (found || Date.now() - start >= timeoutMs) {
      return found
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
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

let warnSpy: jest.SpyInstance

describe('sidecar shell/files/diagnostics flows (Phase 34.3 Plan 01 — REQ-34.3-01/REQ-34.3-02)', () => {
  beforeEach(() => {
    mockAppSettings({})
    mockRequestRustInvoke.mockReset().mockResolvedValue(undefined)
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  // ── REQ-34.3-01: the 10 constant URL openers sharing openUrlOrFile's
  // shell.openExternal path (all pushed as an 'openExternal' frame, the
  // same parity path appShellFlows.test.ts's own openers assert against) ────

  const CONSTANT_OPENERS: Array<[channel: string, urlFragment: string]> = [
    ['openSupportPage', 'Support.md'],
    ['openWeblate', 'weblate.org'],
    ['openLoginPage', 'epiclogin'],
    ['openDiscordLink', 'discord.gg'],
    ['openPatreonPage', 'patreon.com'],
    ['openKofiPage', 'ko-fi.com'],
    ['openGithubSponsorsPage', 'sponsors'],
    ['openWinePrefixFAQ', 'winehq.org'],
    ['openWikiLink', 'wiki'],
    ['openSidInfoPage', 'Epic-Alternative-Login']
  ]

  for (const [channel, fragment] of CONSTANT_OPENERS) {
    it(`REQ-34.3-01 ${channel} (send) reaches shell.openExternal with its constant URL`, async () => {
      const { input, frames } = startSidecar()
      writeSend(input, `${channel}-1`, channel, [])
      await flush()

      const pushed = frames.find((f) => f.kind === 'openExternal') as
        | { args?: unknown[] }
        | undefined
      expect(pushed).toBeDefined()
      expect((pushed?.args as unknown[])?.[0]).toContain(fragment)
    })
  }

  // Sanity: the constant URLs themselves are the ones actually imported (not
  // a copy-pasted literal) — a self-test proving the fragment table above
  // isn't accidentally decoupled from the real constants module.
  it('REQ-34.3-01 sanity: the constant-opener fragment table matches the real constants/urls.ts values', () => {
    const REAL_VALUES: Record<string, string> = {
      openSupportPage: supportURL,
      openWeblate: weblateUrl,
      openLoginPage: epicLoginUrl,
      openDiscordLink: discordLink,
      openPatreonPage: patreonPage,
      openKofiPage: kofiPage,
      openGithubSponsorsPage: githubSponsorsPage,
      openWinePrefixFAQ: wineprefixFAQ,
      openWikiLink: wikiLink,
      openSidInfoPage: sidInfoUrl
    }
    for (const [channel, fragment] of CONSTANT_OPENERS) {
      expect(REAL_VALUES[channel]).toContain(fragment)
    }
  })

  // ── REQ-34.3-01: openExternalUrl / openFolder — forward args[0] verbatim ──

  it('REQ-34.3-01 openExternalUrl (send) forwards args[0] verbatim to shell.openExternal', async () => {
    const { input, frames } = startSidecar()
    const synthetic = 'https://example.com/synthetic-open-external-url-test'
    writeSend(input, 'open-external-url-1', 'openExternalUrl', [synthetic])
    await flush()

    const pushed = frames.find((f) => f.kind === 'openExternal') as
      | { args?: unknown[] }
      | undefined
    expect(pushed).toBeDefined()
    expect((pushed?.args as unknown[])?.[0]).toBe(synthetic)
  })

  it('REQ-34.3-01 openFolder (send) forwards args[0] verbatim to shell.openExternal', async () => {
    const { input, frames } = startSidecar()
    const synthetic = 'https://example.com/synthetic-open-folder-test'
    writeSend(input, 'open-folder-1', 'openFolder', [synthetic])
    await flush()

    const pushed = frames.find((f) => f.kind === 'openExternal') as
      | { args?: unknown[] }
      | undefined
    expect(pushed).toBeDefined()
    expect((pushed?.args as unknown[])?.[0]).toBe(synthetic)
  })

  // ── REQ-34.3-01: showConfigFileInFolder — the two-branch body, reaching
  // shell.openPath -> RUST_SHELL_OPEN_PATH (configPath/gamesConfigPath are
  // filesystem paths, not http URLs, so openUrlOrFile takes its openPath
  // branch, not openExternal) ───────────────────────────────────────────────

  it("REQ-34.3-01 showConfigFileInFolder('default') reaches shell.openPath with configPath", async () => {
    const { input } = startSidecar()
    writeSend(input, 'config-default-1', 'showConfigFileInFolder', ['default'])
    await flush()

    expect(mockRequestRustInvoke).toHaveBeenCalledWith(RUST_SHELL_OPEN_PATH, [
      configPath
    ])
  })

  it('REQ-34.3-01 showConfigFileInFolder(appName) reaches shell.openPath with GamesConfig/<appName>.json', async () => {
    const { input } = startSidecar()
    writeSend(input, 'config-app-1', 'showConfigFileInFolder', ['my-test-app'])
    await flush()

    const expectedPath = join(gamesConfigPath, 'my-test-app.json')
    expect(mockRequestRustInvoke).toHaveBeenCalledWith(RUST_SHELL_OPEN_PATH, [
      expectedPath
    ])
  })

  // ── REQ-34.3-01: showItemInFolder — SYNCHRONOUS body, guarded by
  // existsSync (utils.ts:478-489); reaches shell.showItemInFolder ->
  // RUST_SHELL_SHOW_ITEM_IN_FOLDER for a path that actually exists ──────────

  it('REQ-34.3-01 showItemInFolder (send) reaches shell.showItemInFolder -> RUST_SHELL_SHOW_ITEM_IN_FOLDER for an existing path', async () => {
    const tempFile = join(
      tmpdir(),
      `gamelib-shellfilesflows-test-item-${process.pid}.txt`
    )
    writeFileSync(tempFile, 'x')

    const { input } = startSidecar()
    writeSend(input, 'show-item-1', 'showItemInFolder', [tempFile])
    await flush()

    expect(mockRequestRustInvoke).toHaveBeenCalledWith(
      RUST_SHELL_SHOW_ITEM_IN_FOLDER,
      [tempFile]
    )

    rmSync(tempFile, { force: true })
  })

  // ── REQ-34.3-02: checkDiskSpace ────────────────────────────────────────────

  it('REQ-34.3-02 checkDiskSpace (invoke) resolves real disk info for a valid path', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'disk-1', 'checkDiskSpace', [tmpdir()])
    await waitForResponse(frames, 'disk-1')

    const response = frames.find((f) => f.id === 'disk-1') as
      | {
          ok: boolean
          result?: {
            free: number
            diskSize: number
            validPath: boolean
            validFlatpakPath: boolean
            message: string
          }
        }
      | undefined
    expect(response?.ok).toBe(true)
    expect(typeof response?.result?.free).toBe('number')
    expect(typeof response?.result?.diskSize).toBe('number')
    expect(typeof response?.result?.validPath).toBe('boolean')
    expect(typeof response?.result?.validFlatpakPath).toBe('boolean')
    expect(response?.result?.message).toMatch(/\d.*\/.*\d/)
  })

  it('REQ-34.3-02 checkDiskSpace (invoke) rejects an invalid path, proving Path.parse validation still runs', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'disk-invalid-1', 'checkDiskSpace', [''])
    await flush()

    const response = frames.find((f) => f.id === 'disk-invalid-1') as
      | { ok: boolean; error?: string }
      | undefined
    expect(response?.ok).toBe(false)
    expect(response?.error).toBeDefined()
  })

  // ── REQ-34.3-02: pathExists ────────────────────────────────────────────────

  it('REQ-34.3-02 pathExists (invoke) resolves true for an existing file', async () => {
    const tempFile = join(
      tmpdir(),
      `gamelib-shellfilesflows-test-exists-${process.pid}.txt`
    )
    writeFileSync(tempFile, 'x')

    const { input, frames } = startSidecar()
    writeInvoke(input, 'exists-1', 'pathExists', [tempFile])
    await flush()

    const response = frames.find((f) => f.id === 'exists-1') as
      | { ok: boolean; result?: unknown }
      | undefined
    expect(response?.ok).toBe(true)
    expect(response?.result).toBe(true)

    rmSync(tempFile, { force: true })
  })

  it('REQ-34.3-02 pathExists (invoke) resolves false for a non-existent path', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'exists-2', 'pathExists', [
      join(tmpdir(), `gamelib-shellfilesflows-does-not-exist-${process.pid}`)
    ])
    await flush()

    const response = frames.find((f) => f.id === 'exists-2') as
      | { ok: boolean; result?: unknown }
      | undefined
    expect(response?.ok).toBe(true)
    expect(response?.result).toBe(false)
  })

  // ── REQ-34.3-02: getShellPath ──────────────────────────────────────────────

  it('REQ-34.3-02 getShellPath (invoke) resolves a non-empty string', async () => {
    const { input, frames } = startSidecar()
    writeInvoke(input, 'shellpath-1', 'getShellPath', ['hello'])
    await waitForResponse(frames, 'shellpath-1')

    const response = frames.find((f) => f.id === 'shellpath-1') as
      | { ok: boolean; result?: unknown }
      | undefined
    expect(response?.ok).toBe(true)
    expect(typeof response?.result).toBe('string')
    expect((response?.result as string).length).toBeGreaterThan(0)
  })

  // ── REQ-34.3-02: removeFolder — the [path, folderName] ARRAY shape, and
  // the negative pin proving a mis-shaped (positional) call no-ops rather
  // than silently deleting an unintended path ───────────────────────────────

  describe('removeFolder (send) — real deletion behind a 2s setTimeout', () => {
    beforeEach(() => {
      jest.useFakeTimers({
        doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask']
      })
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('REQ-34.3-02 removeFolder deletes the folder from the [path, folderName] ARRAY shape', async () => {
      const parentDir = mkdtempSync(
        join(tmpdir(), 'gamelib-shellfilesflows-remove-')
      )
      const folderName = 'victim'
      mkdirSync(join(parentDir, folderName))
      expect(existsSync(join(parentDir, folderName))).toBe(true)

      const { input } = startSidecar()
      writeSend(input, 'remove-1', 'removeFolder', [[parentDir, folderName]])
      await flush()
      jest.advanceTimersByTime(2100)

      expect(existsSync(join(parentDir, folderName))).toBe(false)
      rmSync(parentDir, { recursive: true, force: true })
    })

    it('REQ-34.3-02 removeFolder with TWO POSITIONAL ARGS (not the array shape) deletes nothing', async () => {
      const parentDir = mkdtempSync(
        join(tmpdir(), 'gamelib-shellfilesflows-remove-negative-')
      )
      const folderName = 'victim2'
      mkdirSync(join(parentDir, folderName))
      expect(existsSync(join(parentDir, folderName))).toBe(true)

      const { input } = startSidecar()
      // Two POSITIONAL args instead of the required single-array element —
      // pins the contract that a mis-shaped call no-ops rather than silently
      // deleting an unintended path.
      writeSend(input, 'remove-2', 'removeFolder', [parentDir, folderName])
      await flush()
      jest.advanceTimersByTime(2100)

      expect(existsSync(join(parentDir, folderName))).toBe(true)
      rmSync(parentDir, { recursive: true, force: true })
    })
  })

  // ── REQ-34.3-05 / REQ-34.3-06 cache and reset channels (Phase 34.3 Plan 02) ─

  describe('REQ-34.3-05 / REQ-34.3-06 cache and reset channels', () => {
    // (Re-)install the REAL implementation after jest's own `resetMocks: true`
    // (`src/backend/jest.config.js`) wipes whatever the mock factory set at
    // module-load time, before EVERY test — see the mock's own docstring
    // above. Without this, `showDialogBoxModalAuto` silently no-ops
    // (returns `undefined`, never pushes a `showDialog` frame) in every test
    // in this block except the one that sets its own `mockImplementationOnce`.
    beforeEach(() => {
      jest
        .mocked(showDialogBoxModalAuto)
        .mockImplementation(
          jest.requireActual('../../dialog/dialog').showDialogBoxModalAuto
        )
    })

    it('REQ-34.3-05 clearCache(showDialog=false) pushes refreshLibrary but NOT showDialog', async () => {
      const { input, frames } = startSidecar()
      writeSend(input, 'clear-cache-false-1', 'clearCache', [false])
      await flush()

      const refreshFrame = frames.find(
        (f) => f.kind === 'frontendMessage' && f.channel === 'refreshLibrary'
      )
      expect(refreshFrame).toBeDefined()

      const dialogFrame = frames.find(
        (f) => f.kind === 'frontendMessage' && f.channel === 'showDialog'
      )
      expect(dialogFrame).toBeUndefined()
    })

    it('REQ-34.3-06 clearCache(showDialog=true) pushes BOTH refreshLibrary and showDialog, with a RESOLVED title (not the raw i18next key)', async () => {
      const { input, frames } = startSidecar()
      writeSend(input, 'clear-cache-true-1', 'clearCache', [true])
      await flush()

      const refreshFrame = frames.find(
        (f) => f.kind === 'frontendMessage' && f.channel === 'refreshLibrary'
      )
      expect(refreshFrame).toBeDefined()

      const dialogFrame = frames.find(
        (f) => f.kind === 'frontendMessage' && f.channel === 'showDialog'
      ) as { args?: unknown[] } | undefined
      expect(dialogFrame).toBeDefined()
      const [title] = dialogFrame?.args as unknown[]
      // The requirement is that the title is a RESOLVED human string, never
      // the raw i18next key. Which resolved string it is depends on whether
      // i18next found `public/locales/en/translation.json` in this run:
      //   - locales loaded    -> 'Cache cleared' (the real translation)
      //   - locales not found -> 'Cache Cleared' (t()'s inline fallback arg)
      // Under jest `app.getAppPath()` resolves to `process.cwd()` (this jest
      // project's root, `src/backend`) rather than the repo root that
      // `public/locales/en/` actually lives under, so which branch wins is
      // environment-dependent (publicdir-getapppath-chunking gotcha family —
      // the packaged-build half of this path is a named deferred-UAT item,
      // not provable here). Asserting either exact casing makes this test
      // flake, so assert the invariant instead.
      //
      // This still doubles as a live check that bootstrap.ts's real
      // i18next.init() ran (not the project-wide automock's literal
      // `t(key) => key` echo): with i18next mocked, `title` would resolve to
      // the raw key `box.cache-cleared.title` and both assertions below fail.
      expect(title).not.toBe('box.cache-cleared.title')
      expect(['Cache cleared', 'Cache Cleared']).toContain(title)
    })

    it('REQ-34.3-06 clearCache never crashes the sidecar when the dialog path throws — logs and completes the send dispatch', async () => {
      jest.mocked(showDialogBoxModalAuto).mockImplementationOnce(() => {
        throw new Error('synthetic dialog failure')
      })

      const { input, frames } = startSidecar()
      writeSend(input, 'clear-cache-throw-1', 'clearCache', [true])
      await flush()

      // The send dispatch completed (no uncaught exception escaped and
      // killed the process — if it had, this test itself would never reach
      // this assertion).
      const refreshFrame = frames.find(
        (f) => f.kind === 'frontendMessage' && f.channel === 'refreshLibrary'
      )
      expect(refreshFrame).toBeDefined()

      expect(warnSpy).toHaveBeenCalled()
      const warned = warnSpy.mock.calls.some(([first]) =>
        String(first).includes('clearCache')
      )
      expect(warned).toBe(true)
    })

    it('REQ-34.3-06 clearAchievementCache (send) removes the appName entry from gogAchievementStore', async () => {
      const appName = `gamelib-shellfilesflows-achv-test-${process.pid}`
      achievementStore.set(appName, [])
      expect(achievementStore.has(appName)).toBe(true)

      const { input } = startSidecar()
      writeSend(input, 'clear-achv-1', 'clearAchievementCache', [appName])
      await flush()

      expect(achievementStore.has(appName)).toBe(false)
    })

    describe('resetHeroic (send) — real deletion behind a 1s setTimeout', () => {
      beforeEach(() => {
        jest.useFakeTimers({
          doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask']
        })
      })

      afterEach(() => {
        jest.useRealTimers()
      })

      it('REQ-34.3-05 resetHeroic deletes configPath and gamesConfigPath, then requests a relaunch after 1s', async () => {
        // Containment safety: confirm these test-mocked paths resolve inside
        // the disposable per-process tmp home (the `os`/`pathShim` mocks
        // above) BEFORE creating or deleting anything — resetHeroic actually
        // deletes these paths for real.
        const realTmpDir = tmpdir()
        expect(configPath.startsWith(realTmpDir)).toBe(true)
        expect(gamesConfigPath.startsWith(realTmpDir)).toBe(true)

        mkdirSync(dirname(configPath), { recursive: true })
        writeFileSync(configPath, '{}')
        mkdirSync(gamesConfigPath, { recursive: true })
        expect(existsSync(configPath)).toBe(true)
        expect(existsSync(gamesConfigPath)).toBe(true)

        const { input } = startSidecar()
        writeSend(input, 'reset-heroic-1', 'resetHeroic', [])
        await flush()

        // Deletion happens synchronously, before the 1s relaunch/quit timer.
        expect(existsSync(configPath)).toBe(false)
        expect(existsSync(gamesConfigPath)).toBe(false)
        expect(mockRequestRustInvoke).not.toHaveBeenCalledWith(
          RUST_APP_RELAUNCH,
          []
        )

        jest.advanceTimersByTime(1000)
        await flush()

        // Note: this deliberately does NOT assert the absence of an
        // app_exit frame — that ordering guard is plan 34.3-05's
        // lifecycleStub.test.ts coverage.
        expect(mockRequestRustInvoke).toHaveBeenCalledWith(
          RUST_APP_RELAUNCH,
          []
        )
      })
    })
  })

  // ── Send-vs-handle registration-kind contract (Phase 31 Pitfall 2 /
  // T-34.3-04): the only automated defence against the silent-failure class
  // — derived from a literal table, not from the module under test ──────────

  const CHANNEL_KINDS: Record<string, 'send' | 'invoke'> = {
    openExternalUrl: 'send',
    openFolder: 'send',
    openSupportPage: 'send',
    openWeblate: 'send',
    openLoginPage: 'send',
    openDiscordLink: 'send',
    openPatreonPage: 'send',
    openKofiPage: 'send',
    openGithubSponsorsPage: 'send',
    openWinePrefixFAQ: 'send',
    openWikiLink: 'send',
    openSidInfoPage: 'send',
    showConfigFileInFolder: 'send',
    removeFolder: 'send',
    showItemInFolder: 'send',
    clearCache: 'send',
    clearAchievementCache: 'send',
    resetHeroic: 'send',
    checkDiskSpace: 'invoke',
    getShellPath: 'invoke',
    pathExists: 'invoke'
  }

  it("REQ-34.3-01/REQ-34.3-02/REQ-34.3-05/REQ-34.3-06 send-vs-handle contract: every one of this module's 21 channels is registered with the kind that matches main.ts", () => {
    startSidecar()

    expect(Object.keys(CHANNEL_KINDS)).toHaveLength(21)

    for (const [channel, kind] of Object.entries(CHANNEL_KINDS)) {
      if (kind === 'send') {
        expect(listenerRegistry.get(channel)?.length ?? 0).toBeGreaterThan(0)
        expect(handlerRegistry.has(channel)).toBe(false)
      } else {
        expect(handlerRegistry.has(channel)).toBe(true)
        expect(listenerRegistry.get(channel)?.length ?? 0).toBe(0)
      }
    }
  })

  // ── Zero-new-Rust-arms guard — every requestRustInvoke channel this
  // plan's flows use is a member of the existing RUST_INVOKE_CHANNELS set ────

  it("REQ-34.3-01 zero new Rust arms: showConfigFileInFolder's/showItemInFolder's requestRustInvoke channels are members of the existing RUST_INVOKE_CHANNELS set", async () => {
    const { input } = startSidecar()
    const tempFile = join(
      tmpdir(),
      `gamelib-shellfilesflows-test-zeronewarms-${process.pid}.txt`
    )
    writeFileSync(tempFile, 'x')

    writeSend(input, 'zero-arms-config', 'showConfigFileInFolder', ['default'])
    writeSend(input, 'zero-arms-item', 'showItemInFolder', [tempFile])
    await flush()

    expect(mockRequestRustInvoke.mock.calls.length).toBeGreaterThan(0)
    for (const [channel] of mockRequestRustInvoke.mock.calls) {
      expect(
        (RUST_INVOKE_CHANNELS as readonly string[]).includes(channel)
      ).toBe(true)
    }

    rmSync(tempFile, { force: true })
  })
})
