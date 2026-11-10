import { readFileSync } from 'fs'
import { join } from 'path'

import { buildGameScopeCommand, probeGamescopeHelp } from '../gamescopeCommand'
import { stripSourceComments } from '../testUtils/stripSourceComments'

import type { GameSettings } from 'common/types'

type Settings = NonNullable<GameSettings['gamescope']>

const NEW_HELP = 'usage ... -F, --filter ...'
const OLD_HELP = 'usage ... -U, --fsr-upscaling'

const base: Settings = {
  enableUpscaling: false,
  enableLimiter: false,
  enableForceGrabCursor: false,
  windowType: '',
  gameWidth: '',
  gameHeight: '',
  upscaleWidth: '',
  upscaleHeight: '',
  upscaleMethod: '',
  fpsLimiter: '',
  fpsLimiterNoFocus: '',
  additionalOptions: ''
}

const build = (
  settings: Partial<Settings>,
  helpStderr: string,
  showMangohud?: boolean
) =>
  buildGameScopeCommand({
    bin: '/usr/bin/gamescope',
    settings: { ...base, ...settings },
    helpStderr,
    showMangohud
  })

describe('buildGameScopeCommand', () => {
  test.each([
    ['fsr', OLD_HELP, ['-U']],
    ['fsr', NEW_HELP, ['-F', 'fsr']],
    ['nis', OLD_HELP, ['-Y']],
    ['nis', NEW_HELP, ['-F', 'nis']],
    ['integer', OLD_HELP, ['-i']],
    ['integer', NEW_HELP, ['-S', 'integer']],
    ['stretch', OLD_HELP, []],
    ['stretch', NEW_HELP, ['-S', 'stretch']],
    ['fsr', '', ['-U']]
  ])('upscale method %s with help %j', (upscaleMethod, help, flags) => {
    expect(build({ enableUpscaling: true, upscaleMethod }, help)).toEqual([
      '/usr/bin/gamescope',
      ...flags,
      '--'
    ])
  })

  test('upscaling emits resolutions and window type in order', () => {
    expect(
      build(
        {
          enableUpscaling: true,
          gameWidth: '1280',
          gameHeight: '720',
          upscaleWidth: '1920',
          upscaleHeight: '1080',
          windowType: 'fullscreen'
        },
        NEW_HELP
      )
    ).toEqual([
      '/usr/bin/gamescope',
      '-w',
      '1280',
      '-h',
      '720',
      '-W',
      '1920',
      '-H',
      '1080',
      '-f',
      '--'
    ])
    expect(
      build({ enableUpscaling: true, windowType: 'borderless' }, OLD_HELP)
    ).toEqual(['/usr/bin/gamescope', '-b', '--'])
  })

  test('limiter only emits limiter flags, ignoring upscaling fields', () => {
    expect(
      build(
        {
          enableLimiter: true,
          fpsLimiter: '60',
          fpsLimiterNoFocus: '15',
          gameWidth: '1280',
          windowType: 'fullscreen'
        },
        NEW_HELP
      )
    ).toEqual(['/usr/bin/gamescope', '-r', '60', '-o', '15', '--'])
  })

  test('cursor grab, mangoapp and additionalOptions keep today position', () => {
    expect(
      build(
        {
          enableLimiter: true,
          fpsLimiter: '30',
          enableForceGrabCursor: true,
          additionalOptions: '--foo "bar baz"'
        },
        OLD_HELP,
        true
      )
    ).toEqual([
      '/usr/bin/gamescope',
      '-r',
      '30',
      '--force-grab-cursor',
      '--mangoapp',
      '--foo',
      'bar baz',
      '--'
    ])
  })

  test('returned array starts with bin and ends with the separator', () => {
    const out = build({ enableLimiter: true }, '')
    expect(out[0]).toBe('/usr/bin/gamescope')
    expect(out[out.length - 1]).toBe('--')
  })
})

describe('launcher.ts gamescope wiring', () => {
  const launcher = stripSourceComments(
    readFileSync(join(__dirname, '..', 'launcher.ts'), 'utf-8')
  )
  test('calls buildGameScopeCommand and holds no flag mapping itself', () => {
    expect(launcher).toContain('buildGameScopeCommand(')
    expect(launcher).not.toContain("'-F, --filter'")
  })
  test('probes through the runner with a 5 s timeout and spawns nothing itself', () => {
    expect(launcher).toContain('probeGamescopeHelp(')
    expect(launcher).not.toContain('spawnSync')
    expect(launcher).not.toContain('child_process')
  })
})

describe('probeGamescopeHelp (scripted runner)', () => {
  const result = (over: object) => ({
    code: 0,
    signal: null,
    stdout: '',
    stderr: '',
    timedOut: false,
    aborted: false,
    truncated: false,
    pid: 1,
    ...over
  })

  test('runs `--help` with a 5 s timeout and returns its stderr', async () => {
    const run = jest.fn().mockResolvedValue(result({ stderr: NEW_HELP }))
    await expect(
      probeGamescopeHelp({ run }, '/usr/bin/gamescope')
    ).resolves.toBe(NEW_HELP)
    expect(run).toHaveBeenCalledWith('/usr/bin/gamescope', ['--help'], {
      timeoutMs: 5_000
    })
  })

  test('the new-CLI help text builds the new-CLI command', async () => {
    const run = jest.fn().mockResolvedValue(result({ stderr: NEW_HELP }))
    const helpStderr = await probeGamescopeHelp({ run }, '/usr/bin/gamescope')
    expect(
      buildGameScopeCommand({
        bin: '/usr/bin/gamescope',
        settings: { ...base, enableUpscaling: true, upscaleMethod: 'fsr' },
        helpStderr
      })
    ).toEqual(
      buildGameScopeCommand({
        bin: '/usr/bin/gamescope',
        settings: { ...base, enableUpscaling: true, upscaleMethod: 'fsr' },
        helpStderr: NEW_HELP
      })
    )
  })

  test('a timeout degrades to the old-CLI help (empty stderr)', async () => {
    const run = jest
      .fn()
      .mockResolvedValue(result({ timedOut: true, stderr: NEW_HELP }))
    await expect(
      probeGamescopeHelp({ run }, '/usr/bin/gamescope')
    ).resolves.toBe('')
  })

  test('a spawn error degrades to the old-CLI help instead of throwing', async () => {
    const run = jest.fn().mockRejectedValue(new Error('spawn ENOENT'))
    await expect(
      probeGamescopeHelp({ run }, '/usr/bin/gamescope')
    ).resolves.toBe('')
  })
})
