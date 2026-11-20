/**
 * The three app-version sources agree (Phase 83 plan 05): package.json, src-tauri/Cargo.toml
 * `[package]` and src-tauri/tauri.conf.json.
 *
 * `getHeroicVersion` is answered by Rust from `CARGO_PKG_VERSION` (plan 83-03). The sidecar used to
 * answer it from package.json, so a Cargo version that drifts from package.json would change a
 * renderer-visible answer with no diff in any TypeScript test. This is that gate.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..', '..')

/** The `version = "x"` line of the `[package]` table, stopping at the next table header. */
function cargoPackageVersion(toml: string): string | undefined {
  let inPackage = false
  for (const line of toml.split(/\r?\n/)) {
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(line)
    if (header) {
      inPackage = header[1] === 'package'
      continue
    }
    if (!inPackage) continue
    const v = /^\s*version\s*=\s*"([^"]*)"\s*(#.*)?$/.exec(line)
    if (v) return v[1]
  }
  return undefined
}

const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8')

describe('app version parity (83-05)', () => {
  const pkg = (JSON.parse(read('package.json')) as { version?: string }).version
  const tauri = (
    JSON.parse(read('src-tauri/tauri.conf.json')) as { version?: string }
  ).version
  const cargo = cargoPackageVersion(read('src-tauri/Cargo.toml'))

  it('every source carries a non-empty version', () => {
    expect(pkg).toBeTruthy()
    expect(tauri).toBeTruthy()
    expect(cargo).toBeTruthy()
  })

  it('package.json, src-tauri/Cargo.toml [package] and src-tauri/tauri.conf.json agree', () => {
    expect({ cargo, tauri }).toEqual({ cargo: pkg, tauri: pkg })
  })

  it('the parser reads [package] even when [dependencies] holds a different version line', () => {
    const toml = [
      '[package]',
      'name = "x"',
      'version = "1.2.3" # the app',
      '',
      '[dependencies]',
      'serde = { version = "1" }',
      'version = "9.9.9"'
    ].join('\n')
    expect(cargoPackageVersion(toml)).toBe('1.2.3')
  })

  it('the parser ignores a version line that only appears after [package] ends', () => {
    expect(
      cargoPackageVersion('[package]\nname = "x"\n[deps]\nversion = "2"')
    ).toBe(undefined)
  })
})
