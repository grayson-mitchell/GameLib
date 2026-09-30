/**
 * Source-text gate for the tri-state tray icon setting (quick task 260930-lyk).
 *
 * There is no jsdom in this jest project (see `src/frontend/jest.config.js`), so the selector
 * cannot be mounted. Every assertion scans `stripSourceComments`-stripped source text, following
 * the `framelessWindowCopy.test.ts` idiom, so an explanatory comment can neither satisfy nor
 * break a gate.
 *
 * What it pins:
 *   - the component makes no restart claim (the old fallback said "(needs restart)" for a
 *     control that applies live);
 *   - every `t()` fallback in the component equals its shipped `en/translation.json` string;
 *   - the component is driven by the new key and helpers, not the retired toggle;
 *   - `config.ts` wires the migration on the RAW on-disk object (the ordering trap documented in
 *     `src/common/trayIconVariant.ts`). The mapping itself is proven behaviourally in
 *     `src/common/__tests__/trayIconVariant.test.ts`.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..')
const COMPONENT_PATH = join(__dirname, '..', 'UseDarkTrayIcon.tsx')
const CONFIG_PATH = join(REPO_ROOT, 'src', 'backend', 'config.ts')
const CATALOG_PATH = join(REPO_ROOT, 'public/locales/en/translation.json')

const LEGACY_KEY = 'darkTrayIcon'

function readStripped(path: string): string {
  return stripSourceComments(readFileSync(path, 'utf8'))
}

function catalogValue(dotted: string): unknown {
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'))
  return dotted
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object'
          ? (node as Record<string, unknown>)[part]
          : undefined,
      catalog
    )
}

describe('tray icon variant setting (quick 260930-lyk)', () => {
  const component = readStripped(COMPONENT_PATH)

  it('the component makes no restart claim', () => {
    expect(component).not.toMatch(/restart/i)
  })

  it('every t() fallback equals its shipped en/translation.json string', () => {
    const pattern =
      /\bt\(\s*'(setting\.tray-icon-variant\.[a-z]+)'\s*,\s*'([^']*)'\s*\)/g
    const matches = [...component.matchAll(pattern)]

    // Non-vacuity: label + auto + light + dark.
    expect(matches).toHaveLength(4)
    for (const [, key, fallback] of matches) {
      expect({ key, shipped: catalogValue(key) }).toEqual({
        key,
        shipped: fallback
      })
    }
  })

  it('is driven by the new key and helpers, not the retired toggle', () => {
    expect(component).toMatch(/useSetting\(\s*'trayIconVariant'/)
    expect(component).toContain('trayIconVariantOptions(')
    expect(component).toContain('displayedTrayIconVariant(')
    expect(component).not.toContain(LEGACY_KEY)
    expect(component).not.toContain('ToggleSwitch')
  })

  it('config.ts migrates from the RAW on-disk object and carries the Auto factory default', () => {
    const config = readStripped(CONFIG_PATH)
    expect(config).toContain(
      'trayIconVariant: migrateTrayIconVariant(defaultSettings)'
    )
    expect(config).toContain("trayIconVariant: 'auto'")
    expect(config).not.toContain(LEGACY_KEY)
  })
})
