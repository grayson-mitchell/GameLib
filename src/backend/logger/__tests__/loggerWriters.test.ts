import fs from 'fs'
import fsPromises from 'fs/promises'

import { createGameLogWriter, getRunnerLogWriter, initHeadless } from '../index'

// A disabled LogWriter returns from writeString before touching the file system, so an
// appendFile call is the observable "this writer is enabled" signal.
describe('logger writers take their settings from the caller (66.3-06)', () => {
  let appendFile: jest.SpyInstance

  beforeEach(() => {
    initHeadless()
    jest.spyOn(fs, 'existsSync').mockReturnValue(false)
    jest.spyOn(fsPromises, 'mkdir').mockResolvedValue(undefined)
    appendFile = jest.spyOn(fsPromises, 'appendFile').mockResolvedValue()
  })
  afterEach(() => jest.restoreAllMocks())

  const isEnabled = async (writer: {
    logInfo: (m: string, p?: never) => Promise<void>
  }) => {
    appendFile.mockClear()
    await writer.logInfo('probe')
    return appendFile.mock.calls.length > 0
  }

  test('getRunnerLogWriter caches the first writer per runner', async () => {
    const first = getRunnerLogWriter('legendary', { disableLogs: true })
    const second = getRunnerLogWriter('legendary', { disableLogs: false })
    expect(second).toBe(first)
    expect(await isEnabled(second)).toBe(false)
  })

  test('getRunnerLogWriter honours disableLogs false on first use', async () => {
    expect(
      await isEnabled(getRunnerLogWriter('nile', { disableLogs: false }))
    ).toBe(true)
  })

  test('launch log is disabled when verboseLogs is off', async () => {
    const w = await createGameLogWriter('app', 'gog', 'launch', {
      disableLogs: false,
      verboseLogs: false
    })
    expect(await isEnabled(w)).toBe(false)
  })

  test('launch log is enabled with verboseLogs on and logs not disabled', async () => {
    const w = await createGameLogWriter('app', 'gog', 'launch', {
      disableLogs: false,
      verboseLogs: true
    })
    expect(await isEnabled(w)).toBe(true)
  })

  test('install log ignores verboseLogs but honours disableLogs', async () => {
    const on = await createGameLogWriter('app', 'gog', 'install', {
      disableLogs: false,
      verboseLogs: false
    })
    const off = await createGameLogWriter('app', 'gog', 'install', {
      disableLogs: true,
      verboseLogs: true
    })
    expect(await isEnabled(on)).toBe(true)
    expect(await isEnabled(off)).toBe(false)
  })
})
