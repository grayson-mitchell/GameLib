/**
 * Phase 34 Plan 01 (Wave-0 config-shape scaffold): asserts the TARGET shape
 * of src-tauri/Cargo.toml's `keyring` feature list and the two new Tauri
 * plugin dependencies. RED today (keyring only has `apple-native`,
 * tauri-plugin-updater/tauri-plugin-shell are not yet dependencies) --
 * turned GREEN by Plan 34-02.
 *
 * Text/regex assertions against the raw TOML (no TOML-parser dependency),
 * per the plan's stated approach.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const CARGO_TOML_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'src-tauri',
  'Cargo.toml'
)

function loadCargoToml(): string {
  return readFileSync(CARGO_TOML_PATH, 'utf-8')
}

function extractKeyringLine(source: string): string {
  const match = source.match(/^keyring\s*=\s*\{[^}]*\}/m)
  if (!match) {
    throw new Error('No `keyring = { ... }` dependency line found in Cargo.toml')
  }
  return match[0]
}

/**
 * Extracts the `tauri` dependency line's `features = [...]` list as a parsed array of
 * bare feature names (quotes stripped, whitespace trimmed) -- not a raw substring check,
 * so a stray comment mentioning "tray-icon" elsewhere in the file can't satisfy this gate.
 */
function extractTauriFeatures(source: string): string[] {
  const lineMatch = source.match(/^tauri\s*=\s*\{[^}]*\}/m)
  if (!lineMatch) {
    throw new Error('No `tauri = { ... }` dependency line found in Cargo.toml')
  }
  const featuresMatch = lineMatch[0].match(/features\s*=\s*\[([^\]]*)\]/)
  if (!featuresMatch) {
    throw new Error('No `features = [...]` list found on the tauri dependency line')
  }
  return featuresMatch[1]
    .split(',')
    .map((entry) => entry.trim().replace(/^"|"$/g, ''))
    .filter((entry) => entry.length > 0)
}

describe('Cargo.toml keyring feature list (Pitfall 5 -- cross-platform safeStorage)', () => {
  test('the keyring dependency line contains apple-native', () => {
    const keyringLine = extractKeyringLine(loadCargoToml())
    expect(keyringLine).toContain('apple-native')
  })

  test('the keyring dependency line contains windows-native', () => {
    const keyringLine = extractKeyringLine(loadCargoToml())
    expect(keyringLine).toContain('windows-native')
  })

  test('the keyring dependency line contains sync-secret-service', () => {
    const keyringLine = extractKeyringLine(loadCargoToml())
    expect(keyringLine).toContain('sync-secret-service')
  })

  test('the keyring dependency stays pinned at major version 3 (do not bump)', () => {
    const keyringLine = extractKeyringLine(loadCargoToml())
    expect(keyringLine).toMatch(/version\s*=\s*"3"/)
  })
})

describe('Cargo.toml Tauri updater/shell plugin dependencies (D-06 / D-07 / D-08)', () => {
  test('tauri-plugin-updater is a declared dependency', () => {
    const source = loadCargoToml()
    expect(source).toMatch(/^tauri-plugin-updater\s*=/m)
  })

  test('tauri-plugin-shell is a declared dependency', () => {
    const source = loadCargoToml()
    expect(source).toMatch(/^tauri-plugin-shell\s*=/m)
  })
})

describe('REQ-34.1-07 Cargo.toml tauri tray-icon feature (Phase 34.1 Plan 06, D-11)', () => {
  test('REQ-34.1-07 the tauri dependency line declares a features list containing tray-icon', () => {
    const features = extractTauriFeatures(loadCargoToml())
    expect(features).toContain('tray-icon')
  })

  test('REQ-34.1-07 the existing keyring feature assertions still pass alongside the tray-icon change', () => {
    const keyringLine = extractKeyringLine(loadCargoToml())
    expect(keyringLine).toContain('apple-native')
    expect(keyringLine).toContain('windows-native')
    expect(keyringLine).toContain('sync-secret-service')
  })
})
