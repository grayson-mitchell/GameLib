import { readFileSync } from 'fs'
import { join } from 'path'
import { gameSettingsSchema } from 'common/types/ipc/settingsSchema'
import { settingsAsyncArgs } from 'common/types/ipc/settings'
import { settingsGameChain } from '../settingsGame'
import { createMigrations } from '..'

const fixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'))

const step = settingsGameChain[1]!
const migrate = (file: Record<string, unknown>) =>
  step.run(structuredClone(file))
const entry = (file: Record<string, unknown>, app: string) =>
  file[app] as Record<string, unknown>
const ipcOk = (app: string, config: unknown) =>
  settingsAsyncArgs.writeConfig.safeParse([{ appName: app, config }]).success

const fullGamescope = {
  enableUpscaling: true,
  enableLimiter: false,
  enableForceGrabCursor: false,
  windowType: 'fullscreen',
  gameWidth: '1920',
  gameHeight: '1080',
  upscaleWidth: '1920',
  upscaleHeight: '1080',
  upscaleMethod: 'fsr',
  fpsLimiter: '60',
  fpsLimiterNoFocus: '30',
  additionalOptions: ''
}

describe('settings/game v1 -> v2', () => {
  test('retired keys: removed, valid values and reserved keys kept', () => {
    const raw = fixture('settings-game-v1-retired-keys.json')
    const out = migrate(raw)
    const g = entry(out, 'Game1')
    expect('useSteamRuntime' in g).toBe(false)
    expect('lastUsedLaunchOption' in g).toBe(false)
    expect((g['enviromentOptions'] as Record<string, unknown>[])[0]).toEqual({
      key: 'A',
      value: '1'
    })
    expect(g['targetExe']).toBe('a.exe')
    expect(g['winePrefix']).toBe('/p')
    expect(g['wineVersion']).toEqual(entry(raw, 'Game1')['wineVersion'])
    expect(out['version']).toBe('v1')
    expect(out['explicit']).toBe(false)
  })

  test('invalid values: dropped, valid siblings kept', () => {
    const g = entry(
      migrate(fixture('settings-game-v1-invalid-values.json')),
      'Game2'
    )
    expect('gamescope' in g).toBe(false)
    expect('showFps' in g).toBe(false)
    expect('lastUsedLaunchOption' in g).toBe(false)
    expect(g['targetExe']).toBe('b.exe')
    expect(g['showMangohud']).toBe(true)
  })

  test.each([
    ['settings-game-v1-retired-keys.json', 'Game1'],
    ['settings-game-v1-invalid-values.json', 'Game2']
  ])('%s fails writeConfig raw and passes after the step', (name, app) => {
    const raw = fixture(name)
    expect(ipcOk(app, entry(raw, app))).toBe(false)
    const out = migrate(raw)
    expect(ipcOk(app, entry(out, app))).toBe(true)
    expect(
      gameSettingsSchema.partial().safeParse(entry(out, app)).success
    ).toBe(true)
  })

  test('schema-valid values come out deep-equal', () => {
    const file = {
      G: {
        gamescope: fullGamescope,
        lastUsedLaunchOption: { type: 'basic', name: 'x', parameters: '-a' },
        showFps: true
      },
      version: 'v1'
    }
    expect(migrate(file)).toEqual(file)
  })

  test('idempotent', () => {
    const once = migrate(fixture('settings-game-v1-invalid-values.json'))
    expect(migrate(once)).toEqual(once)
  })

  test('total on {} and non-object per-app values', () => {
    expect(migrate({})).toEqual({})
    const odd = { a: 1, b: null, c: [1], d: 'x', version: 'v1' }
    expect(migrate(odd)).toEqual(odd)
  })

  test('the v0 fixture is unchanged', () => {
    const raw = fixture('settings-game-v0.json')
    expect(migrate(raw)).toEqual(raw)
  })

  test('chain shape', () => {
    expect(settingsGameChain.map((s) => s.id)).toEqual([
      'settings-game-v0-v1',
      'settings-game-v1-v2'
    ])
    expect(settingsGameChain[0]!.identity).toBe(true)
    expect(settingsGameChain[settingsGameChain.length - 1]!.to).toBe(2)
    expect(createMigrations().currentVersionOf('settings/game')).toBe(2)
  })
})
