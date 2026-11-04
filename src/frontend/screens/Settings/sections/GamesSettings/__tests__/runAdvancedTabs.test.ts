import { readFileSync } from 'fs'
import { join } from 'path'

const source = readFileSync(join(__dirname, '..', 'index.tsx'), 'utf8')
const locale = JSON.parse(
  readFileSync(
    join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      '..',
      '..',
      '..',
      'public/locales/en/gamelib.json'
    ),
    'utf8'
  )
)

function slice(startMarker: string): string {
  const start = source.indexOf(startMarker)
  expect(start).toBeGreaterThan(-1)
  const end = source.indexOf('</TabPanel>', start)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

const runTags = [
  '<LaunchOptionSelector />',
  '<LauncherArgs />',
  '<PreferedLanguage />',
  '<OfflineMode />',
  '<ShowFPS />',
  '<Mangohud />',
  '<GameMode />',
  '<NvidiaPrime />',
  '<SteamOverlayOverride />'
]

const advancedTags = [
  '<AlternativeExe />',
  '<BeforeLaunchScriptPath />',
  '<AfterLaunchScriptPath />',
  '<WrappersTable />',
  '<EnvVariablesTable />',
  '<VerboseLogs />',
  '<IgnoreGameUpdates />',
  '<PreferSystemLibs />',
  '<BattlEyeRuntime />',
  '<EacRuntime />'
]

describe('Run + Advanced settings tabs (quick 261104-unp)', () => {
  test('no Other tab remains', () => {
    for (const gone of [
      "index={'other'}",
      'value="other"',
      'settings.navbar.other',
      'showOtherTab',
      'isMacNativeStatsOverlayTitle'
    ]) {
      expect(source).not.toContain(gone)
    }
  })

  test('Run tab and panel are unconditional', () => {
    expect(source).toContain('value="run"')
    expect(source).toContain("t('gamelib:settings.navbar.run', 'Run')")
    const tabAt = source.indexOf("<Tab\n          label={t('gamelib:settings")
    const tabAlt = source.indexOf("<Tab label={t('gamelib:settings.navbar.run'")
    const tab = tabAt > -1 ? tabAt : tabAlt
    expect(tab).toBeGreaterThan(-1)
    const beforeTab = source.slice(
      Math.max(
        source.lastIndexOf('/>', tab - 1),
        source.lastIndexOf('>', tab - 1)
      ) + 1,
      tab
    )
    expect(beforeTab).not.toContain('&&')

    const panel = source.indexOf("<TabPanel value={value} index={'run'}>")
    expect(panel).toBeGreaterThan(-1)
    const beforePanel = source.slice(
      Math.max(
        source.lastIndexOf('/>', panel - 1),
        source.lastIndexOf('>', panel - 1)
      ) + 1,
      panel
    )
    expect(beforePanel).not.toContain('&&')
  })

  test('Run panel order is strict', () => {
    const run = slice("index={'run'}>")
    let last = -1
    for (const tag of runTags) {
      const at = run.indexOf(tag)
      expect(at).toBeGreaterThan(last)
      last = at
    }
  })

  test('Run panel keeps its gates', () => {
    const run = slice("index={'run'}>")
    expect(run).toContain('isMacSteamTitle && <SteamOverlayOverride />')
    expect(run).toContain('showStatsOverlay && <ShowFPS />')
    for (const tag of ['<PreferedLanguage />', '<OfflineMode />']) {
      const guard = run.indexOf('!isSideloaded')
      expect(guard).toBeGreaterThan(-1)
      const before = run.slice(0, run.indexOf(tag))
      expect(before).toContain('!isSideloaded')
    }
  })

  test('Advanced panel holds the plumbing and none of the Run components', () => {
    const advanced = slice("index={'advanced'}>")
    for (const tag of advancedTags) {
      if (tag === '<PreferSystemLibs />') {
        expect(advanced).toContain('isLinux && <PreferSystemLibs />')
      } else {
        expect(advanced).toContain(tag)
      }
    }
    expect(
      advanced.slice(0, advanced.indexOf('<IgnoreGameUpdates />'))
    ).toContain('!isSideloaded')
    expect(advanced).toMatch(/\{!isNative &&\s*\(/)
    for (const tag of runTags) {
      expect(advanced).not.toContain(tag)
    }
  })

  test('each moved component tag appears exactly once', () => {
    for (const tag of [...runTags, ...advancedTags]) {
      expect(count(source, tag)).toBe(1)
    }
  })

  test('stats overlay gate keeps the 261104-uas allow-list and excludes steam', () => {
    const start = source.indexOf('const showStatsOverlay =')
    expect(start).toBeGreaterThan(-1)
    const expr = source.slice(start, source.indexOf('\n\n', start))
    for (const part of [
      '!isWin',
      '!isNative',
      'isMac',
      '!isBrowserGame',
      "'legendary'",
      "'gog'",
      "'nile'",
      "'sideload'"
    ]) {
      expect(expr).toContain(part)
    }
    expect(expr).not.toContain('steam')
  })

  test('starting tab is Wine or Run only', () => {
    const start = source.indexOf('function getStartingTab')
    const end = source.indexOf('export default function GamesSettings')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const fn = source.slice(start, end)
    expect(fn).toContain("'run'")
    expect(fn).toContain("'wine'")
    expect(fn).not.toContain("'advanced'")
    expect(fn).not.toContain("'other'")
  })

  test('a saved other tab falls back to run', () => {
    expect(source).toMatch(/latestTabIndex === 'other'[\s\S]{0,120}'run'/)
  })

  test('catalogue carries the Run label', () => {
    expect(locale.settings.navbar.run).toBe('Run')
  })
})
