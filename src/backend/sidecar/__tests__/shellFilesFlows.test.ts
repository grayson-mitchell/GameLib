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
 */

import { PassThrough } from 'node:stream'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
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

// ── i18next mock — mirrors appShellFlows.test.ts; not exercised by this
// plan's own channels, but required so the shared handlers.ts module graph
// (which also loads appShellFlowRegistration.ts) still loads cleanly ────────
jest.mock('i18next', () => ({
  __esModule: true,
  default: {
    changeLanguage: jest.fn().mockResolvedValue(undefined)
  }
}))

// ── legendary electronStores mock — avoids a real disk-backed CacheStore
// construction (this repo's own "tests clobbering real store" precedent) ────
jest.mock('../../storeManagers/legendary/electronStores', () => ({
  gameInfoStore: {
    clear: jest.fn()
  }
}))

// ── abort handler mock — mirrors appShellFlows.test.ts's boundary choice;
// not exercised by this plan's own channels ──────────────────────────────────
jest.mock('../../utils/aborthandler/aborthandler', () => ({
  callAbortController: jest.fn(),
  callAllAbortControllers: jest.fn()
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { init } from '../bootstrap'
import { GlobalConfig } from 'backend/config'
import { requestRustInvoke } from '../sidecarRpc'
import { listenerRegistry, handlerRegistry } from '../electronStub'
import {
  RUST_SHELL_OPEN_PATH,
  RUST_SHELL_SHOW_ITEM_IN_FOLDER,
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
    checkDiskSpace: 'invoke',
    getShellPath: 'invoke',
    pathExists: 'invoke'
  }

  it("REQ-34.3-01/REQ-34.3-02 send-vs-handle contract: every one of this plan's 18 channels is registered with the kind that matches main.ts", () => {
    startSidecar()

    expect(Object.keys(CHANNEL_KINDS)).toHaveLength(18)

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
