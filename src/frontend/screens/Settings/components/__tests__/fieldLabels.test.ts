import { readFileSync } from 'fs'
import { join } from 'path'

const read = (name: string) =>
  readFileSync(join(__dirname, '..', `${name}.tsx`), 'utf8')

// [component, label key, has (i) help]
const fields: [string, string, boolean][] = [
  ['AlternativeExe', 'gamelib:settings.fields.alternativeExe.label', true],
  [
    'BeforeLaunchScriptPath',
    'gamelib:settings.fields.beforeLaunch.label',
    true
  ],
  ['AfterLaunchScriptPath', 'gamelib:settings.fields.afterExit.label', true],
  ['WrappersTable', 'gamelib:settings.fields.wrappers.label', true],
  ['EnvVariablesTable', 'gamelib:settings.fields.environment.label', true],
  ['VerboseLogs', 'gamelib:settings.fields.verboseLogs.label', true],
  ['OfflineMode', 'gamelib:settings.fields.offline.label', false],
  ['LauncherArgs', 'gamelib:settings.fields.launchArguments.label', true],
  ['PreferedLanguage', 'gamelib:settings.fields.language.label', true],
  ['ShowFPS', 'gamelib:settings.fields.showFps.label', true]
]

const oldLabels = [
  'Select an alternative EXE to run',
  'Select a script to run before the game is launched',
  'Select a script to run after the game exits',
  'Wrapper command:',
  'Game Arguments (appended to game launch command)',
  'Prefered Language (Language Code)',
  'Enable verbose logs'
]

describe('261121-dzl noun labels with (i) help (#6)', () => {
  test.each(fields)('%s carries its noun label key', (name, key) => {
    expect(read(name)).toContain(`'${key}'`)
  })

  test.each(fields.filter(([, , help]) => help))(
    '%s explains itself through an icon-only (i)',
    (name) => {
      const source = read(name)
      expect(source).toMatch(/<InfoIcon|<InfoBox[^>]*iconOnly/)
    }
  )

  test('the old sentence labels are gone as label defaults', () => {
    const all = fields.map(([name]) => read(name)).join('\n')
    for (const old of oldLabels) {
      expect(all).not.toContain(`'${old}'`)
    }
  })

  test('Stats overlay is the noun form on macOS', () => {
    expect(read('ShowFPS')).toContain(
      'gamelib:settings.fields.statsOverlay.label'
    )
  })
})
