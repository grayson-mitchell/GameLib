import { readFileSync } from 'fs'
import { join } from 'path'

// Phase 100 D-02: the Logs tab is a mock-free source gate -- GamesSettings and
// LogSettings are heavy to mount, and the wiring is what regresses.

function source(relative: string): string {
  return readFileSync(join(__dirname, relative), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const gamesSettings = source('../index.tsx')
const logSettings = source('../../LogSettings/index.tsx')

describe('Logs tab wiring (Phase 100 D-02)', () => {
  it('GamesSettings renders a TabPanel with index logs containing LogSettings', () => {
    expect(gamesSettings).toMatch(
      /<TabPanel value=\{value\} index=\{'logs'\}>\s*<LogSettings \/>\s*<\/TabPanel>/
    )
  })

  it('the Logs tab is per-game only, never on the Default page', () => {
    expect(gamesSettings).toContain('showLogsTab: !isDefault')
  })

  it('the Diagnostics link switches to the Logs tab through the tab-click path', () => {
    expect(gamesSettings).toMatch(
      /const openLogsTab = \(\) => \{\s*setValue\('logs'\)\s*rememberTab\(localStorage, gameInfo, 'logs'\)\s*\}/
    )
    expect(gamesSettings).toContain('onClick={openLogsTab}')
    expect(gamesSettings).toContain('gamelib:settings.fields.gameLog.open')
  })

  it('the initialTab prop reaches initialSettingsTab and never rememberTab', () => {
    expect(gamesSettings).toMatch(/initialTab\s*\}\)\s*\)/)
    expect(gamesSettings).not.toMatch(/rememberTab\([^)]*initialTab/)
  })
})

describe('LogSettings game controls (Phase 100 D-02)', () => {
  it('has the session picker with both options', () => {
    expect(logSettings).toContain('logSessionPicker')
    expect(logSettings).toContain('gamelib:settings.logs.lastSession')
    expect(logSettings).toContain('gamelib:settings.logs.gamelibLog')
  })

  it('has Copy through the app clipboard channel', () => {
    expect(logSettings).toContain('clipboardWriteText(')
    expect(logSettings).toContain('gamelib:settings.logs.copy')
  })

  it('keeps Open folder, Upload and the report-form link', () => {
    expect(logSettings).toContain('showLogFileInFolder')
    expect(logSettings).toContain('setUploadLogFileProps')
    expect(logSettings).toContain('openReportForm')
  })
})
