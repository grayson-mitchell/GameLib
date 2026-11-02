import {
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

import { createShimLineForwarder, openOverlayWineLog } from '../overlayWineLog'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'overlaywinelog-'))
  jest.clearAllMocks()
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

describe('openOverlayWineLog', () => {
  it('creates a 0700 dir and a 0600 file', () => {
    const root = join(tmp, 'traces')
    const log = openOverlayWineLog(root, '620', 1234)
    expect(log).not.toBeNull()
    expect(log!.path).toBe(join(root, '620-1234.overlay.wine.log'))
    expect(statSync(root).mode & 0o777).toBe(0o700)
    expect(statSync(log!.path).mode & 0o777).toBe(0o600)
    log!.close()
  })

  it('returns null for a symlinked trace root', () => {
    const real = join(tmp, 'real')
    mkdirSync(real)
    const link = join(tmp, 'link')
    symlinkSync(real, link)
    expect(openOverlayWineLog(link, '620')).toBeNull()
    expect(logWarning).toHaveBeenCalled()
  })

  it('returns null for a relative root and a bad appId', () => {
    expect(openOverlayWineLog('relative/dir', '620')).toBeNull()
    expect(openOverlayWineLog(tmp, '../x')).toBeNull()
    expect(logWarning).toHaveBeenCalledTimes(2)
  })

  it('prunes old overlay logs to 8 and leaves others alone', () => {
    for (let i = 1; i <= 9; i++) {
      writeFileSync(join(tmp, `620-${i}.overlay.wine.log`), 'x')
    }
    writeFileSync(join(tmp, '620-1.stage.wine.log'), 'x')
    writeFileSync(join(tmp, '730-1.overlay.wine.log'), 'x')
    const log = openOverlayWineLog(tmp, '620', 100)
    log!.close()
    const names = readdirSync(tmp)
    expect(
      names.filter((n) => /^620-.*\.overlay\.wine\.log$/.test(n))
    ).toHaveLength(8)
    expect(names).not.toContain('620-1.overlay.wine.log')
    expect(names).toContain('620-1.stage.wine.log')
    expect(names).toContain('730-1.overlay.wine.log')
  })

  it('truncates past maxBytes with one marker line', () => {
    const log = openOverlayWineLog(tmp, '620', 5, 20)!
    log.write('a'.repeat(50))
    log.write('more')
    log.close()
    const text = readFileSync(log.path, 'utf8')
    expect(text).toContain('[gamelib] wine log truncated at 20 bytes')
    expect(text.match(/truncated/g)).toHaveLength(1)
  })
})

describe('createShimLineForwarder', () => {
  it('joins lines split across chunks and drops non-shim lines', () => {
    const onLine = jest.fn()
    const fwd = createShimLineForwarder(onLine)
    fwd('overlay_shim hook_set_pix')
    fwd('el_format: layer=X\nother\n')
    expect(onLine).toHaveBeenCalledTimes(1)
    expect(onLine).toHaveBeenCalledWith(
      'overlay_shim hook_set_pixel_format: layer=X'
    )
  })

  it('suppresses after maxLines with one notice', () => {
    const onLine = jest.fn()
    const fwd = createShimLineForwarder(onLine, 50)
    for (let i = 0; i < 60; i++) fwd(`overlay_shim line ${i}\n`)
    expect(onLine).toHaveBeenCalledTimes(51)
    expect(onLine).toHaveBeenLastCalledWith(
      'overlay_shim: further lines suppressed'
    )
  })

  it('drops an over-long partial line', () => {
    const onLine = jest.fn()
    const fwd = createShimLineForwarder(onLine)
    fwd('overlay_shim ' + 'a'.repeat(5000))
    fwd('\n')
    expect(onLine).not.toHaveBeenCalled()
  })
})
