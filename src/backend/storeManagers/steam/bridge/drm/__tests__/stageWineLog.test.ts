/** Phase 56 plan 32: stage wine log sink. Real fs in a tmp root. */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { logWarning } from 'backend/logger'

import { DRM_STAGE_LOG_KEEP_PER_APP, openStageWineLog } from '../stageWineLog'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'stagewinelog-'))
  jest.clearAllMocks()
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

describe('openStageWineLog', () => {
  it('A: creates a 0700 dir, a 0600 file and a header', () => {
    const root = join(tmp, 'traces')
    const log = openStageWineLog(
      root,
      '219990',
      1761084000123,
      'GameLibSteamBridge-219990'
    )
    expect(log).not.toBeNull()
    expect(log!.path).toBe(join(root, '219990-1761084000123.stage.wine.log'))
    expect(statSync(root).mode & 0o777).toBe(0o700)
    expect(statSync(log!.path).mode & 0o777).toBe(0o600)
    log!.close()
    expect(readFileSync(log!.path, 'utf8').split('\n')[0]).toMatch(
      /^\[gamelib\] stage session appId=219990 bottle=GameLibSteamBridge-219990 started=/
    )
  })

  it('B: write after close is a no-op and the cap adds one marker', () => {
    const log = openStageWineLog(tmp, '219990', 5, 'b', 64)!
    log.write('x'.repeat(200))
    log.write('more')
    log.close()
    log.write('late')
    const text = readFileSync(log.path, 'utf8')
    expect(text.match(/stage wine log truncated at 64 bytes/g)).toHaveLength(1)
    expect(text).not.toContain('more')
    expect(text).not.toContain('late')
  })

  it('C: retention keeps KEEP stage logs and spares other files', () => {
    for (let i = 1; i <= 10; i++) {
      writeFileSync(join(tmp, `219990-${i}.stage.wine.log`), 'x')
    }
    writeFileSync(join(tmp, '219990-1.log'), 'x')
    writeFileSync(join(tmp, '219990-1.wine.log'), 'x')
    writeFileSync(join(tmp, '648800-1.stage.wine.log'), 'x')
    const log = openStageWineLog(tmp, '219990', 1000)!
    log.close()
    const stage = readdirSync(tmp).filter((n) =>
      /^219990-\d+\.stage\.wine\.log$/.test(n)
    )
    expect(stage).toHaveLength(DRM_STAGE_LOG_KEEP_PER_APP)
    expect(stage).toContain('219990-1000.stage.wine.log')
    expect(stage).toContain('219990-10.stage.wine.log')
    expect(stage).not.toContain('219990-1.stage.wine.log')
    expect(existsSync(join(tmp, '219990-1.log'))).toBe(true)
    expect(existsSync(join(tmp, '219990-1.wine.log'))).toBe(true)
    expect(existsSync(join(tmp, '648800-1.stage.wine.log'))).toBe(true)
  })

  it('D: a symlink at the target name returns null', () => {
    const victim = join(tmp, 'victim')
    writeFileSync(victim, 'keep')
    symlinkSync(victim, join(tmp, '219990-7.stage.wine.log'))
    expect(openStageWineLog(tmp, '219990', 7)).toBeNull()
    expect(readFileSync(victim, 'utf8')).toBe('keep')
    expect(logWarning).toHaveBeenCalled()
  })

  it('E: invalid appId or symlinked root returns null, no file created', () => {
    expect(openStageWineLog(tmp, '../x')).toBeNull()
    const real = join(tmp, 'real')
    mkdirSync(real)
    const link = join(tmp, 'link')
    symlinkSync(real, link)
    expect(openStageWineLog(link, '219990', 9)).toBeNull()
    expect(readdirSync(real)).toHaveLength(0)
  })
})
