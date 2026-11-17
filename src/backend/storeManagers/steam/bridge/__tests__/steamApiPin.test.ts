/**
 * Quick 261117-ubb: the sidecar half of the pinned libsteam_api.dylib hand-off. The resolver takes
 * its rustInvoke transport as a dep, so nothing here needs a jest.mock.
 */
import { createSteamApiPinResolver } from '../steamApiPin'
import { RUST_STEAM_API_PIN_RESOLVE } from 'common/types/sidecarTransport'

const PINNED_PATH =
  '/Users/x/Library/Application Support/GameLib/steam-api/4162eb40/libsteam_api.dylib'

type Invoke = Parameters<
  typeof createSteamApiPinResolver
>[0]['requestRustInvoke']

const reply = (over: Record<string, unknown> = {}) => ({
  source: 'cached',
  path: PINNED_PATH,
  pinSha256: '4162eb40',
  steamUser: 'SteamUser_v023',
  detail: null,
  ...over
})

const log = { info: jest.fn(), warn: jest.fn() }

function resolverWith(
  invoke: jest.Mock,
  over: { isMac?: boolean; waitMs?: number } = {}
) {
  return createSteamApiPinResolver({
    requestRustInvoke: invoke as unknown as Invoke,
    isMac: over.isMac ?? true,
    log,
    ...(over.waitMs === undefined ? {} : { waitMs: over.waitMs })
  })
}

describe('createSteamApiPinResolver', () => {
  beforeEach(() => {
    log.info.mockClear()
    log.warn.mockClear()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('creating the resolver issues nothing (exit contract: no work at boot)', () => {
    const invoke = jest.fn()
    resolverWith(invoke)
    expect(invoke).not.toHaveBeenCalled()
  })

  test('non-macOS resolves null without calling rustInvoke', async () => {
    const invoke = jest.fn()
    await expect(resolverWith(invoke, { isMac: false })()).resolves.toBeNull()
    expect(invoke).not.toHaveBeenCalled()
  })

  test.each(['cached', 'snapshot', 'fetched'])(
    'a %s reply resolves its absolute libsteam_api.dylib path',
    async (source) => {
      const invoke = jest.fn().mockResolvedValue(reply({ source }))
      await expect(resolverWith(invoke)()).resolves.toBe(PINNED_PATH)
      expect(invoke).toHaveBeenCalledWith(RUST_STEAM_API_PIN_RESOLVE, [])
    }
  )

  test.each([
    [
      'unpinned',
      reply({ source: 'unpinned', path: null, detail: 'cache=miss' })
    ],
    ['unsupported', reply({ source: 'unsupported', path: null })],
    ['a relative path', reply({ path: 'steam-api/libsteam_api.dylib' })],
    ['a wrong basename', reply({ path: '/abs/steam-api/libother.dylib' })],
    ['a NUL in the path', reply({ path: '/abs/a\0b/libsteam_api.dylib' })],
    ['a newline in the path', reply({ path: '/abs/a\nb/libsteam_api.dylib' })],
    ['a missing path', reply({ path: null })],
    ['an unknown source', reply({ source: 'cdn' })],
    ['a string', 'cached'],
    ['null', null]
  ])('%s resolves null', async (_name, body) => {
    const invoke = jest.fn().mockResolvedValue(body)
    await expect(resolverWith(invoke)()).resolves.toBeNull()
  })

  test('logs the pinned source and path at info, never a warning', async () => {
    const invoke = jest.fn().mockResolvedValue(reply({ source: 'fetched' }))
    await resolverWith(invoke)()
    expect(log.info).toHaveBeenCalledWith(
      expect.stringContaining(
        `steam api pin: source=fetched path=${PINNED_PATH}`
      )
    )
    expect(log.warn).not.toHaveBeenCalled()
  })

  test('logs UNPINNED with the Rust detail at warn', async () => {
    const invoke = jest
      .fn()
      .mockResolvedValue(
        reply({ source: 'unpinned', path: null, detail: 'cache=miss;cdn=down' })
      )
    await resolverWith(invoke)()
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('steam api pin: UNPINNED (cache=miss;cdn=down)')
    )
  })

  test('a rejected rustInvoke resolves null', async () => {
    const invoke = jest.fn().mockRejectedValue(new Error('rustInvoke: boom'))
    await expect(resolverWith(invoke)()).resolves.toBeNull()
  })

  test('a reply slower than waitMs resolves null, and a late rejection is not unhandled', async () => {
    jest.useFakeTimers()
    let rejectLate: (e: Error) => void = () => {}
    const invoke = jest.fn(
      () =>
        new Promise((_resolve, reject) => {
          rejectLate = reject
        })
    )
    const unhandled = jest.fn()
    process.on('unhandledRejection', unhandled)
    try {
      const pending = resolverWith(invoke, { waitMs: 10_000 })()
      await jest.advanceTimersByTimeAsync(10_000)
      await expect(pending).resolves.toBeNull()
      expect(log.warn).toHaveBeenCalledWith(
        expect.stringContaining('UNPINNED (still resolving after 10000ms)')
      )

      rejectLate(new Error('late failure'))
      await jest.advanceTimersByTimeAsync(0)
      await Promise.resolve()
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  test('a call during the same in-flight request reuses it', async () => {
    jest.useFakeTimers()
    let resolveReply: (v: unknown) => void = () => {}
    const invoke = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveReply = resolve
        })
    )
    const resolve = resolverWith(invoke, { waitMs: 10_000 })
    const first = resolve()
    const second = resolve()
    expect(invoke).toHaveBeenCalledTimes(1)

    resolveReply(reply({ source: 'fetched' }))
    await expect(first).resolves.toBe(PINNED_PATH)
    await expect(second).resolves.toBe(PINNED_PATH)
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  test('after a slow launch the late result is kept for the next call (no second request while in flight)', async () => {
    jest.useFakeTimers()
    let resolveReply: (v: unknown) => void = () => {}
    const invoke = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveReply = resolve
        })
    )
    const resolve = resolverWith(invoke, { waitMs: 50 })
    const slow = resolve()
    await jest.advanceTimersByTimeAsync(50)
    await expect(slow).resolves.toBeNull()

    // The shell is still fetching: the next launch joins it rather than starting another.
    const next = resolve()
    expect(invoke).toHaveBeenCalledTimes(1)
    resolveReply(reply({ source: 'fetched' }))
    await expect(next).resolves.toBe(PINNED_PATH)

    // Settled: the following call asks again (a cheap cache re-verify in Rust).
    invoke.mockResolvedValueOnce(reply({ source: 'cached' }) as never)
    await expect(resolve()).resolves.toBe(PINNED_PATH)
    expect(invoke).toHaveBeenCalledTimes(2)
  })
})
