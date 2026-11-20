/**
 * Phase 82 (plan 82-03): the TS wire mirror in src/common/types/safety.ts must equal the serde
 * names of the gamelib-safety Rust crate. Static reads only, no spawn.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defined } from 'backend/testUtils/indexed'
import {
  REMOVAL_REASONS,
  SAFETY_ADAPTER_REASONS,
  SAFETY_OUTCOMES,
  SAFETY_REASONS,
  SAFETY_TARGET_KINDS,
  SAFETY_VERDICTS
} from '../../common/types/safety'

const ROOT = join(__dirname, '..', '..', '..')
const CRATE_SRC = join(ROOT, 'src-tauri/crates/gamelib-safety/src')
const wireRs = readFileSync(join(CRATE_SRC, 'wire.rs'), 'utf8')
const triRs = readFileSync(join(CRATE_SRC, 'tri.rs'), 'utf8')

/** The variant names of `pub enum <name> { ... }`, in declaration order. */
function extractVariants(source: string, enumName: string): string[] {
  const m = new RegExp(`pub enum ${enumName}\\s*\\{([^}]*)\\}`).exec(source)
  if (!m) throw new Error(`enum ${enumName} not found`)
  return defined(m[1], `${enumName} body`)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('//'))
    .map((line) => defined(/^([A-Z][A-Za-z0-9]*),?$/.exec(line)?.[1], line))
}

/** serde `rename_all = "kebab-case"`: `NotAPrefix` -> `not-a-prefix`. */
function pascalToKebab(name: string): string {
  return name.replace(/(?<!^)([A-Z])/g, '-$1').toLowerCase()
}

const kebabVariants = (source: string, enumName: string) =>
  extractVariants(source, enumName).map(pascalToKebab)

describe('gamelib-safety wire parity (plan 82-03)', () => {
  it('anti-vacuity: the extractor found the variants and rejects a missing enum', () => {
    expect(kebabVariants(wireRs, 'Reason')).toHaveLength(15)
    expect(kebabVariants(wireRs, 'TargetKind')).toHaveLength(6)
    expect(kebabVariants(wireRs, 'Outcome')).toHaveLength(3)
    expect(kebabVariants(triRs, 'Tri')).toHaveLength(3)
    expect(() => extractVariants('nothing here', 'Reason')).toThrow(
      'enum Reason not found'
    )
    expect(pascalToKebab('NotAPrefix')).toBe('not-a-prefix')
  })

  it('SAFETY_REASONS equals the Rust Reason names', () => {
    expect([...SAFETY_REASONS]).toEqual(kebabVariants(wireRs, 'Reason'))
  })

  it('SAFETY_TARGET_KINDS equals the Rust TargetKind names', () => {
    expect([...SAFETY_TARGET_KINDS]).toEqual(
      kebabVariants(wireRs, 'TargetKind')
    )
  })

  it('SAFETY_OUTCOMES equals the Rust Outcome names', () => {
    expect([...SAFETY_OUTCOMES]).toEqual(kebabVariants(wireRs, 'Outcome'))
  })

  it('SAFETY_VERDICTS equals the Rust Tri names', () => {
    expect([...SAFETY_VERDICTS]).toEqual(kebabVariants(triRs, 'Tri'))
  })

  it('REMOVAL_REASONS is the Rust reasons then the TS-only adapter reasons, with no overlap', () => {
    expect([...REMOVAL_REASONS]).toEqual([
      ...SAFETY_REASONS,
      ...SAFETY_ADAPTER_REASONS
    ])
    for (const r of SAFETY_ADAPTER_REASONS) {
      expect(kebabVariants(wireRs, 'Reason')).not.toContain(r)
    }
  })
})
