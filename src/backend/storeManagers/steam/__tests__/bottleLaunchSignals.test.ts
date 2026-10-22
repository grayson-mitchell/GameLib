/**
 * Unit tests for bottleLaunchSignals.ts (D-51-16, folded todo) — the pure
 * bottled-Steam block classifier plus the bounded log-tail reader it
 * consumes.
 *
 * `classifyBottledSteamBlock` is pure (string in, enum out) and tested with
 * plain fixtures shaped like the real GameLibSteam bottle logs (measured
 * 2026-10-17, see 51-08-PLAN.md's objective). `readBoundedTail` touches a
 * real filesystem, so it is tested against a real temp file — mirrors
 * depot/manifest.test.ts's `mkdtempSync` pattern rather than mocking
 * `node:fs/promises`.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  classifyBottledSteamBlock,
  readBoundedTail,
  bottledSteamLogPaths,
  WAITING_FOR_STEAM_GRACE_MS,
  WAITING_RECHECK_MS
} from '../bottleLaunchSignals'

describe('classifyBottledSteamBlock', () => {
  // Local time 2026-10-16 20:12:50 -- launch started just before the
  // measured KickingOtherSession line's timestamp (20:13:00).
  const launchStartedAt = new Date(2026, 9, 16, 20, 12, 50).getTime()

  test('a KickingOtherSession line for the launching appId classifies as other-session', () => {
    const consoleTail =
      '[2026-10-16 20:13:00] GameAction [AppID 38410, ActionID 1] : LaunchApp waiting for user response to KickingOtherSession "Xenonauts 2"'

    expect(
      classifyBottledSteamBlock({
        bootstrapTail: '',
        consoleTail,
        appId: '38410',
        launchStartedAt
      })
    ).toBe('other-session')
  })

  test('the same KickingOtherSession line for a DIFFERENT appId does not classify as other-session', () => {
    const consoleTail =
      '[2026-10-16 20:13:00] GameAction [AppID 38410, ActionID 1] : LaunchApp waiting for user response to KickingOtherSession "Xenonauts 2"'

    expect(
      classifyBottledSteamBlock({
        bootstrapTail: '',
        consoleTail,
        appId: '40700',
        launchStartedAt
      })
    ).toBeNull()
  })

  test('"Installing update..." at/after launch classifies as self-update', () => {
    const bootstrapTail = '[2026-10-16 20:12:56] Installing update...'

    expect(
      classifyBottledSteamBlock({
        bootstrapTail,
        consoleTail: '',
        appId: '38410',
        launchStartedAt
      })
    ).toBe('self-update')
  })

  test('"Installing update..." an hour BEFORE launch does not classify as self-update', () => {
    const anHourBefore = new Date(2026, 9, 16, 19, 12, 56).getTime()
    const bootstrapTail = `[${formatTimestamp(anHourBefore)}] Installing update...`

    expect(
      classifyBottledSteamBlock({
        bootstrapTail,
        consoleTail: '',
        appId: '38410',
        launchStartedAt
      })
    ).toBeNull()
  })

  test('"LogonFailure Access Denied" after launch classifies as login', () => {
    const consoleTail = '[2026-10-16 20:13:10] LogonFailure Access Denied'

    expect(
      classifyBottledSteamBlock({
        bootstrapTail: '',
        consoleTail,
        appId: '38410',
        launchStartedAt
      })
    ).toBe('login')
  })

  test('"LogonFailure No Connection" does not classify as login', () => {
    const consoleTail = '[2026-10-16 20:13:10] LogonFailure No Connection'

    expect(
      classifyBottledSteamBlock({
        bootstrapTail: '',
        consoleTail,
        appId: '38410',
        launchStartedAt
      })
    ).toBeNull()
  })

  test('precedence: other-session beats self-update beats login when several match', () => {
    const consoleTail = [
      '[2026-10-16 20:13:00] GameAction [AppID 38410, ActionID 1] : LaunchApp waiting for user response to KickingOtherSession "Xenonauts 2"',
      '[2026-10-16 20:13:10] LogonFailure Access Denied'
    ].join('\n')
    const bootstrapTail = '[2026-10-16 20:12:56] Installing update...'

    expect(
      classifyBottledSteamBlock({
        bootstrapTail,
        consoleTail,
        appId: '38410',
        launchStartedAt
      })
    ).toBe('other-session')

    // self-update beats login once other-session is removed from the mix.
    const consoleTailLoginOnly =
      '[2026-10-16 20:13:10] LogonFailure Access Denied'
    expect(
      classifyBottledSteamBlock({
        bootstrapTail,
        consoleTail: consoleTailLoginOnly,
        appId: '38410',
        launchStartedAt
      })
    ).toBe('self-update')
  })

  test('lines without a parseable [YYYY-MM-DD HH:MM:SS] prefix are ignored', () => {
    const consoleTail =
      'GameAction [AppID 38410, ActionID 1] : LaunchApp waiting for user response to KickingOtherSession "Xenonauts 2"'

    expect(
      classifyBottledSteamBlock({
        bootstrapTail: '',
        consoleTail,
        appId: '38410',
        launchStartedAt
      })
    ).toBeNull()
  })

  test('no signal in either tail classifies as null', () => {
    expect(
      classifyBottledSteamBlock({
        bootstrapTail: '[2026-10-16 20:12:56] Some unrelated bootstrap line',
        consoleTail: '[2026-10-16 20:13:00] Some unrelated console line',
        appId: '38410',
        launchStartedAt
      })
    ).toBeNull()
  })
})

describe('classifyBottledSteamBlock -- 2026-10-22 measured GameLibSteam lines', () => {
  const crlf = (lines: string[]) => lines.join('\r\n') + '\r\n'

  const signedOutLogin = crlf([
    '[2026-10-22 22:21:30] [ None ] SetLoginState: WaitingForCredentials - OK',
    '[2026-10-22 22:21:30] [ WaitingForCredentials ] UI Request: connect'
  ])
  const preExistingSignIn = crlf([
    '[2026-10-22 22:20:50] [ None ] SetLoginState: WaitingForCredentials - OK'
  ])
  const signedIn = crlf([
    '[2026-10-22 22:21:30] [ None ] SetLoginState: WaitingForCredentials - OK',
    '[2026-10-22 22:21:49] [ WaitingForCredentials ] SetLoginState: WaitingForServerResponse - OK',
    '[2026-10-22 22:22:01] [ WaitingForLibraryReady ] SetLoginState: Success - OK'
  ])
  const downloadBootstrap = crlf([
    '[2026-10-22 22:13:40] Verifying installation...',
    '[2026-10-22 22:13:40] Downloading update...',
    '[2026-10-22 22:13:42] Downloading update (5,597 of 336,229 KB)...'
  ])
  const normalBootstrap = crlf([
    '[2026-10-22 22:21:25] Verifying installation...',
    '[2026-10-22 22:21:25] Verifying file sizes only',
    '[2026-10-22 22:21:25] Verification complete'
  ])
  const otherSessionConsole =
    '[2026-10-22 22:21:40] GameAction [AppID 38410, ActionID 1] : LaunchApp waiting for user response to KickingOtherSession "Xenonauts 2"'

  const loginLaunch = new Date(2026, 9, 22, 22, 21, 23).getTime()
  const updateLaunch = new Date(2026, 9, 22, 22, 13, 39).getTime()

  const classify = (
    args: Partial<{
      bootstrapTail: string
      consoleTail: string
      loginTail: string
      launchStartedAt: number
    }>
  ) =>
    classifyBottledSteamBlock({
      bootstrapTail: '',
      consoleTail: '',
      loginTail: '',
      appId: '38410',
      launchStartedAt: loginLaunch,
      ...args
    })

  test('WaitingForCredentials after Play classifies as login', () => {
    expect(classify({ loginTail: signedOutLogin })).toBe('login')
  })

  test('WaitingForCredentials from before Play (already at sign-in) still classifies as login', () => {
    expect(classify({ loginTail: preExistingSignIn })).toBe('login')
  })

  test('a tail whose latest SetLoginState is Success does not classify as login', () => {
    expect(classify({ loginTail: signedIn })).toBeNull()
  })

  test('the self-update download phase classifies as self-update', () => {
    expect(
      classify({
        bootstrapTail: downloadBootstrap,
        launchStartedAt: updateLaunch
      })
    ).toBe('self-update')
  })

  test('a normal start (verification lines only) is not classified', () => {
    expect(classify({ bootstrapTail: normalBootstrap })).toBeNull()
  })

  test('Downloading update lines older than the cutoff do not count', () => {
    expect(classify({ bootstrapTail: downloadBootstrap })).toBeNull()
  })

  test('precedence: other-session > self-update > login', () => {
    const all = {
      bootstrapTail: downloadBootstrap,
      consoleTail: otherSessionConsole,
      loginTail: signedOutLogin,
      launchStartedAt: updateLaunch
    }
    expect(classify(all)).toBe('other-session')
    expect(classify({ ...all, consoleTail: '' })).toBe('self-update')
  })

  test('LogonFailure still classifies as login, No Connection still does not', () => {
    expect(
      classify({
        consoleTail: '[2026-10-22 22:21:30] LogonFailure Access Denied'
      })
    ).toBe('login')
    expect(
      classify({
        consoleTail: '[2026-10-22 22:21:30] LogonFailure No Connection'
      })
    ).toBeNull()
  })
})

describe('readBoundedTail', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gamelib-bottle-launch-signals-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test('returns at most 65536 bytes -- the LAST ones -- from a 1 MiB file', async () => {
    const path = join(dir, 'console_log.txt')
    // Build a 1 MiB file out of distinguishable 1-byte-per-offset content so
    // "the last 64 KiB" is provable rather than merely plausible.
    const totalSize = 1024 * 1024
    const buffer = Buffer.alloc(totalSize)
    for (let i = 0; i < totalSize; i++) {
      buffer[i] = 32 + (i % 94) // printable ASCII range
    }
    writeFileSync(path, buffer)

    const tail = await readBoundedTail(path)

    expect(Buffer.byteLength(tail, 'utf8')).toBeLessThanOrEqual(65536)
    const expectedTail = buffer
      .subarray(totalSize - 65536, totalSize)
      .toString('utf8')
    expect(tail).toBe(expectedTail)
  })

  test('a missing file returns "" without throwing', async () => {
    const path = join(dir, 'does-not-exist.txt')

    await expect(readBoundedTail(path)).resolves.toBe('')
  })

  test('a file smaller than maxBytes returns its full content', async () => {
    const path = join(dir, 'small.txt')
    writeFileSync(path, 'hello world')

    await expect(readBoundedTail(path)).resolves.toBe('hello world')
  })

  test('a custom maxBytes is honored', async () => {
    const path = join(dir, 'custom.txt')
    writeFileSync(path, '0123456789')

    await expect(readBoundedTail(path, 4)).resolves.toBe('6789')
  })
})

describe('bottledSteamLogPaths', () => {
  test('joins the bottle dir to the Steam logs directory for both files', () => {
    const paths = bottledSteamLogPaths('/fake/bottle')

    expect(paths.bootstrap).toBe(
      join(
        '/fake/bottle',
        'drive_c',
        'Program Files (x86)',
        'Steam',
        'logs',
        'bootstrap_log.txt'
      )
    )
    expect(paths.login).toBe(
      join(
        '/fake/bottle',
        'drive_c',
        'Program Files (x86)',
        'Steam',
        'logs',
        'steamui_login.txt'
      )
    )
    expect(paths.console).toBe(
      join(
        '/fake/bottle',
        'drive_c',
        'Program Files (x86)',
        'Steam',
        'logs',
        'console_log.txt'
      )
    )
  })
})

describe('constants', () => {
  test('WAITING_FOR_STEAM_GRACE_MS is 20000', () => {
    expect(WAITING_FOR_STEAM_GRACE_MS).toBe(20000)
  })

  test('WAITING_RECHECK_MS is 15000', () => {
    expect(WAITING_RECHECK_MS).toBe(15000)
  })
})

function formatTimestamp(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
