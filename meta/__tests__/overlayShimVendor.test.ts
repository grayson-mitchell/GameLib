import { createHash } from 'crypto'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'

// Pins for the vendored NotProton overlay shim (D-14). Re-pin procedure is in
// native/steam-bridge/overlay-shim/PINS.md; change these, NOTICE and PINS.md together.
const OVERLAY_SHIM_COMMIT = '0c798e7148efe279627573f864210064788b427c'
const OVERLAY_SHIM_BLOB = '194b5fba7c0f145a9d7e227fc5ace2e2333e2299'
const OVERLAY_SHIM_SHA256 =
  'd6924aa4b330059dfa1212340a34f8081ea949cc8c82cfc2875ca6f0964687e5'

const VENDOR_DIR = join(
  __dirname,
  '..',
  '..',
  'native',
  'steam-bridge',
  'overlay-shim'
)
const sourceBytes = readFileSync(join(VENDOR_DIR, 'overlay_shim.m'))
const sourceText = sourceBytes.toString('utf8')

describe('vendored overlay_shim.m (D-14)', () => {
  it('matches the pinned sha256', () => {
    expect(createHash('sha256').update(sourceBytes).digest('hex')).toBe(
      OVERLAY_SHIM_SHA256
    )
  })

  it('matches the pinned git blob id', () => {
    const blob = createHash('sha1')
      .update(Buffer.from(`blob ${sourceBytes.byteLength}\0`))
      .update(sourceBytes)
      .digest('hex')
    expect(blob).toBe(OVERLAY_SHIM_BLOB)
  })

  it('ships the GPLv3 LICENSE', () => {
    const license = readFileSync(join(VENDOR_DIR, 'LICENSE'), 'utf8')
    expect(license).toContain('GNU GENERAL PUBLIC LICENSE')
    expect(license).toContain('Version 3')
  })

  it('ships a NOTICE naming repo, commit, blob and sha256', () => {
    const notice = readFileSync(join(VENDOR_DIR, 'NOTICE'), 'utf8')
    expect(notice).toContain('NotProtonNot/NotProton')
    expect(notice).toContain(OVERLAY_SHIM_COMMIT)
    expect(notice).toContain(OVERLAY_SHIM_BLOB)
    expect(notice).toContain(OVERLAY_SHIM_SHA256)
  })

  it('D-13: no GPU gate; every swizzle goes through a Nil-tolerant interpose()', () => {
    expect(sourceText).not.toContain('AGX')
    expect(sourceText).toContain('static int interpose(')
    expect(sourceText).toContain('if (target == Nil)')
  })

  it('D-14: no prebuilt binary is vendored', () => {
    expect(existsSync(VENDOR_DIR)).toBe(true)
    const bad = readdirSync(VENDOR_DIR).filter((f) => /\.(dylib|o|a)$/.test(f))
    expect(bad).toEqual([])
  })
})
