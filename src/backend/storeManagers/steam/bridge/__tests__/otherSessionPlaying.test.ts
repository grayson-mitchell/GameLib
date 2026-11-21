import {
  createOtherSessionGuard,
  readOtherSessionPlaying,
  type OtherSessionVerdict
} from '../otherSessionPlaying'

import * as loggerModule from 'backend/logger'

// No jest.mock (the backend-di-ceilings jestMock ratchet): the helper-binary check is injected
// through deps.exists, and the logger is spied on the real module. resetMocks (Jest 29) wipes
// both before each test, so each describe's beforeEach re-arms them.
const mockedExists = jest.fn<boolean, [string]>()
let mockedLogInfo: jest.SpyInstance

function armMocks() {
  mockedExists.mockReturnValue(true)
  mockedLogInfo = jest
    .spyOn(loggerModule, 'logInfo')
    .mockImplementation(() => undefined)
  jest.spyOn(loggerModule, 'logWarning').mockImplementation(() => undefined)
  jest.spyOn(loggerModule, 'logError').mockImplementation(() => undefined)
}

const PATHS = { steamBridgeHelperPath: '/h/steam-bridge-helper' }

const line = (o: Record<string, unknown>) => `${JSON.stringify(o)}\n`
const OK_PLAYING = line({
  result: 'ok',
  loggedOn: 1,
  otherSessionPlaying: 1,
  otherAppId: 440
})
const OK_CLEAR = line({
  result: 'ok',
  loggedOn: 1,
  otherSessionPlaying: 0,
  otherAppId: 0
})
const OK_SIGNED_OUT = line({
  result: 'ok',
  loggedOn: 0,
  otherSessionPlaying: null,
  otherAppId: null
})

const runReturning = (stdout: string, code: number | null = 0, stderr = '') =>
  jest.fn().mockResolvedValue({ stdout, stderr, code })

const read = (
  run: jest.Mock,
  extra: { platform?: NodeJS.Platform } = {}
): Promise<OtherSessionVerdict> =>
  readOtherSessionPlaying({
    paths: PATHS,
    exists: mockedExists,
    platform: 'darwin',
    run,
    ...extra
  })

describe('readOtherSessionPlaying (the helper --steam-playing-session read)', () => {
  beforeEach(() => {
    armMocks()
  })

  it('asks the helper exactly one thing, with a bound', async () => {
    const run = runReturning(OK_CLEAR)
    await read(run)
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith(
      PATHS.steamBridgeHelperPath,
      ['--steam-playing-session'],
      expect.any(Number)
    )
    const timeoutMs = run.mock.calls[0][2] as number
    expect(timeoutMs).toBeGreaterThan(8_000) // past the helper's own 8 s alarm
    expect(timeoutMs).toBeLessThanOrEqual(15_000)
  })

  it('a signed-in Steam that says another session plays -> playing, with that app', async () => {
    await expect(read(runReturning(OK_PLAYING))).resolves.toEqual({
      kind: 'playing',
      otherAppId: 440
    })
  })

  it('playing with no usable app id keeps the answer and drops the id', async () => {
    const run = runReturning(
      line({ result: 'ok', loggedOn: 1, otherSessionPlaying: 1, otherAppId: 0 })
    )
    await expect(read(run)).resolves.toEqual({
      kind: 'playing',
      otherAppId: null
    })
  })

  it('a signed-in Steam that says nobody else plays -> clear', async () => {
    await expect(read(runReturning(OK_CLEAR))).resolves.toEqual({
      kind: 'clear'
    })
  })

  it('a signed-out Steam is unknown (signed-out), never clear: the state is pushed by the CM', async () => {
    await expect(read(runReturning(OK_SIGNED_OUT))).resolves.toEqual({
      kind: 'unknown',
      reason: 'signed-out'
    })
  })

  it('reads the LAST stdout line (anything Steam printed first is noise)', async () => {
    await expect(
      read(runReturning(`steam noise\n{not json\n${OK_PLAYING}`))
    ).resolves.toMatchObject({ kind: 'playing' })
  })

  it.each([
    ['steam-not-running', 2],
    ['steamclient-missing', 2],
    ['method-unverified:BIsOtherSessionPlaying', 2],
    ['unsupported-arch', 2]
  ])('an unavailable line (%s) is unknown with that reason', async (reason) => {
    await expect(
      read(runReturning(line({ result: 'unavailable', reason }), 2))
    ).resolves.toEqual({ kind: 'unknown', reason })
  })

  it.each([
    ['no output at all', '', 0],
    ['a usage line', line({ result: 'usage', error: 'unknown-argument' }), 64],
    ['garbage', 'not json at all\n', 0],
    ['a JSON scalar', '42\n', 0],
    [
      'an ok line with the session field missing',
      line({ result: 'ok', loggedOn: 1 }),
      0
    ],
    ['a timeout or truncation (code null)', OK_PLAYING, null]
  ])(
    '%s fails open as helper-failed, not as playing',
    async (_n, out, code) => {
      await expect(read(runReturning(out, code))).resolves.toEqual({
        kind: 'unknown',
        reason: 'helper-failed'
      })
    }
  )

  it('a runner that throws fails open', async () => {
    const run = jest.fn().mockRejectedValue(new Error('spawn EACCES'))
    await expect(read(run)).resolves.toEqual({
      kind: 'unknown',
      reason: 'helper-failed'
    })
  })

  it('GAMELIB_STEAM_OTHER_SESSION_CHECK=off turns the check off without spawning anything; any other value leaves it on', async () => {
    const off = runReturning(OK_PLAYING)
    await expect(
      readOtherSessionPlaying({
        paths: PATHS,
        exists: mockedExists,
        platform: 'darwin',
        run: off,
        env: { GAMELIB_STEAM_OTHER_SESSION_CHECK: 'off' }
      })
    ).resolves.toEqual({ kind: 'unknown', reason: 'disabled' })
    expect(off).not.toHaveBeenCalled()

    for (const value of ['on', '1', '', undefined]) {
      const run = runReturning(OK_PLAYING)
      await expect(
        readOtherSessionPlaying({
          paths: PATHS,
          exists: mockedExists,
          platform: 'darwin',
          run,
          env: { GAMELIB_STEAM_OTHER_SESSION_CHECK: value }
        })
      ).resolves.toMatchObject({ kind: 'playing' })
      expect(run).toHaveBeenCalledTimes(1)
    }
  })

  it('a missing helper binary fails open without spawning anything', async () => {
    mockedExists.mockReturnValue(false)
    const run = runReturning(OK_PLAYING)
    await expect(read(run)).resolves.toEqual({
      kind: 'unknown',
      reason: 'helper-missing'
    })
    expect(run).not.toHaveBeenCalled()
  })

  it.each(['linux', 'win32'] as const)(
    'off macOS (%s) fails open without spawning anything',
    async (platform) => {
      const run = runReturning(OK_PLAYING)
      await expect(read(run, { platform })).resolves.toEqual({
        kind: 'unknown',
        reason: 'unsupported-platform'
      })
      expect(run).not.toHaveBeenCalled()
    }
  )
})

describe('createOtherSessionGuard (per-launch, remembers a signed-out reading)', () => {
  beforeEach(() => {
    armMocks()
  })

  const guardWith = (outputs: string[], settleMs = 0) => {
    const queue = [...outputs]
    const run = jest.fn(() =>
      Promise.resolve({
        stdout: (queue.length > 1 ? queue.shift() : queue[0]) ?? '',
        stderr: '',
        code: 0
      })
    )
    const guard = createOtherSessionGuard({
      appId: '3205720',
      paths: PATHS,
      exists: mockedExists,
      platform: 'darwin',
      run,
      settleMs
    })
    return { guard, run }
  }

  it('a launch that never saw Steam signed out answers at once, with no settle re-read', async () => {
    const { guard, run } = guardWith([OK_CLEAR])
    await expect(guard()).resolves.toEqual({ kind: 'clear' })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('playing is logged once, naming this game and the app the other session plays', async () => {
    const { guard } = guardWith([OK_PLAYING])
    await guard()
    const msgs = mockedLogInfo.mock.calls.map((c) => String(c[0]))
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toContain('appId 3205720')
    expect(msgs[0]).toContain('another session')
    expect(msgs[0]).toContain('app 440')
  })

  it('after a signed-out reading the first "clear" is not believed: it is read again and the second answer counts', async () => {
    // signed out -> (sign-in) clear -> the CM's playing-session state lands -> playing
    const { guard, run } = guardWith([OK_SIGNED_OUT, OK_CLEAR, OK_PLAYING])
    await expect(guard()).resolves.toMatchObject({ kind: 'unknown' })
    await expect(guard()).resolves.toEqual({
      kind: 'playing',
      otherAppId: 440
    })
    expect(run).toHaveBeenCalledTimes(3)
  })

  it('after a signed-out reading, a clear that stays clear is clear (one extra read, once)', async () => {
    const { guard, run } = guardWith([
      OK_SIGNED_OUT,
      OK_CLEAR,
      OK_CLEAR,
      OK_CLEAR
    ])
    await guard()
    await expect(guard()).resolves.toEqual({ kind: 'clear' })
    expect(run).toHaveBeenCalledTimes(3)
    // The settle is spent: the next clear answers at once.
    await expect(guard()).resolves.toEqual({ kind: 'clear' })
    expect(run).toHaveBeenCalledTimes(4)
  })

  it('a playing answer is never delayed by the settle', async () => {
    const { guard, run } = guardWith([OK_SIGNED_OUT, OK_PLAYING])
    await guard()
    await expect(guard()).resolves.toMatchObject({ kind: 'playing' })
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('says each no-answer reason once, not on every poll of the hold', async () => {
    const { guard } = guardWith([OK_SIGNED_OUT])
    await guard()
    await guard()
    await guard()
    const unknownLogs = mockedLogInfo.mock.calls.filter((c) =>
      String(c[0]).includes('gave no answer')
    )
    expect(unknownLogs).toHaveLength(1)
    expect(String(unknownLogs[0][0])).toContain('signed-out')
  })
})
