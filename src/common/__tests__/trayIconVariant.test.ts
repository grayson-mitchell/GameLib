import { readFileSync } from 'fs'
import { join } from 'path'
import {
  TRAY_ICON_VARIANTS,
  displayedTrayIconVariant,
  isTrayIconVariant,
  migrateTrayIconVariant,
  trayIconVariantOptions,
  trayIconWireArgs
} from '../trayIconVariant'

describe('quick 260930-lyk: migrateTrayIconVariant', () => {
  it('maps the legacy boolean: true -> dark, false -> light', () => {
    expect(migrateTrayIconVariant({ darkTrayIcon: true })).toBe('dark')
    expect(migrateTrayIconVariant({ darkTrayIcon: false })).toBe('light')
  })

  it('maps absent / null / undefined to auto', () => {
    expect(migrateTrayIconVariant({})).toBe('auto')
    expect(migrateTrayIconVariant(null)).toBe('auto')
    expect(migrateTrayIconVariant(undefined)).toBe('auto')
  })

  it('an explicit trayIconVariant always wins over the legacy boolean', () => {
    expect(
      migrateTrayIconVariant({ trayIconVariant: 'light', darkTrayIcon: true })
    ).toBe('light')
    expect(
      migrateTrayIconVariant({ trayIconVariant: 'auto', darkTrayIcon: true })
    ).toBe('auto')
  })

  it('an invalid new value falls through to the legacy boolean, then to auto', () => {
    expect(
      migrateTrayIconVariant({ trayIconVariant: 'purple', darkTrayIcon: true })
    ).toBe('dark')
    expect(migrateTrayIconVariant({ trayIconVariant: 'purple' })).toBe('auto')
  })

  it('non-boolean legacy values are not booleans', () => {
    expect(migrateTrayIconVariant({ darkTrayIcon: 'true' })).toBe('auto')
    expect(migrateTrayIconVariant({ darkTrayIcon: 1 })).toBe('auto')
  })

  it('DEC-2 trap (documentation): a factory-default-merged object masks the legacy boolean, so config.ts must pass the RAW object', () => {
    const merged = { ...{ trayIconVariant: 'auto' }, ...{ darkTrayIcon: true } }
    expect(migrateTrayIconVariant(merged)).toBe('auto')
  })
})

describe('quick 260930-lyk: isTrayIconVariant', () => {
  it('accepts the three exact values', () => {
    for (const v of ['auto', 'light', 'dark']) {
      expect(isTrayIconVariant(v)).toBe(true)
    }
  })

  it('rejects wrong case, empty, and non-strings', () => {
    expect(isTrayIconVariant('Auto')).toBe(false)
    expect(isTrayIconVariant('')).toBe(false)
    expect(isTrayIconVariant(true)).toBe(false)
    expect(isTrayIconVariant(undefined)).toBe(false)
  })
})

describe('quick 260930-lyk: trayIconVariantOptions / displayedTrayIconVariant', () => {
  it('offers three options on win32, two (no auto) on linux, none on darwin', () => {
    expect(trayIconVariantOptions('win32')).toEqual(['auto', 'light', 'dark'])
    expect(trayIconVariantOptions('linux')).toEqual(['light', 'dark'])
    expect(trayIconVariantOptions('darwin')).toEqual([])
  })

  it('displays a stored auto as light where Auto is not offered', () => {
    expect(displayedTrayIconVariant('auto', 'linux')).toBe('light')
    expect(displayedTrayIconVariant('dark', 'linux')).toBe('dark')
    expect(displayedTrayIconVariant('auto', 'win32')).toBe('auto')
  })
})

describe('quick 260930-lyk: tray_set_icon wire contract (emit side)', () => {
  const fixture = JSON.parse(
    readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        'meta',
        'fixtures',
        'tray-set-icon-wire-args.json'
      ),
      'utf8'
    )
  ) as { tray_set_icon: Record<string, unknown> }

  it('the fixture covers exactly TRAY_ICON_VARIANTS', () => {
    expect(Object.keys(fixture.tray_set_icon).sort()).toEqual(
      [...TRAY_ICON_VARIANTS].sort()
    )
  })

  it.each([...TRAY_ICON_VARIANTS])(
    'trayIconWireArgs(%s) equals the fixture entry',
    (variant) => {
      expect(trayIconWireArgs(variant)).toEqual(fixture.tray_set_icon[variant])
    }
  )
})
