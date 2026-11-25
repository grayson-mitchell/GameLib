/**
 * Phase 82 (plan 82-03): the TS wire mirror in src/common/types/safety.ts must equal the serde
 * names of the gamelib-safety Rust crate. Static reads only, no spawn.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defined } from 'backend/testUtils/indexed'
import {
  BOTTLE_REMOVAL_REASONS,
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
const bottleOpRs = readFileSync(
  join(ROOT, 'src-tauri/crates/gamelib-engine/src/bottles/remove_per_game.rs'),
  'utf8'
)

/** Every `reason: "<word>"` literal of a Rust source, in order of appearance. */
const reasonLiterals = (source: string) =>
  [...source.matchAll(/\breason:\s*"([a-z][a-z-]*)"/g)].map((m) =>
    defined(m[1], 'reason literal')
  )

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

  it('REMOVAL_REASONS is the Rust reasons, the adapter reasons, then the bottle op reasons, with no overlap', () => {
    expect([...REMOVAL_REASONS]).toEqual([
      ...SAFETY_REASONS,
      ...SAFETY_ADAPTER_REASONS,
      ...BOTTLE_REMOVAL_REASONS
    ])
    expect(new Set(REMOVAL_REASONS).size).toBe(REMOVAL_REASONS.length)
    for (const r of [...SAFETY_ADAPTER_REASONS, ...BOTTLE_REMOVAL_REASONS]) {
      expect(kebabVariants(wireRs, 'Reason')).not.toContain(r)
    }
  })

  it('every reason literal the bottle op answers is in REMOVAL_REASONS (87-75, RF6)', () => {
    const words = reasonLiterals(bottleOpRs)
    // Anti-vacuity: the op's own two words and a guard word are among what the extractor found.
    expect(words).toEqual(
      expect.arrayContaining(['unsafe-name', 'in-use', 'delete-failed'])
    )
    for (const word of words) {
      expect(REMOVAL_REASONS as readonly string[]).toContain(word)
    }
  })

  it('a reason literal the vocabulary lacks is found by the same check (negative fixture)', () => {
    const mutated = `${bottleOpRs}\nRefused { reason: "brand-new-word", other_key: None }`
    const missing = reasonLiterals(mutated).filter(
      (w) => !(REMOVAL_REASONS as readonly string[]).includes(w)
    )
    expect(missing).toEqual(['brand-new-word'])
  })
})
