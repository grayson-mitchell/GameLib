// Phase 84 plan 02: the Rust log prefixes and levels equal the TS ones. The Rust crate keeps its own
// closed sets (prefix.rs), the TS side keeps constants.ts; this guard fails when either drifts.

import { readFileSync } from 'fs'
import { join } from 'path'

import { LogLevel, LogPrefix } from '../constants'

const RUST_PREFIX_RS = join(
  __dirname,
  '../../../../src-tauri/crates/gamelib-log/src/prefix.rs'
)

/** The string literals on the match arms of `as_str` inside `impl <typeName>`. */
function rustAsStrLiterals(source: string, typeName: string): string[] {
  const impl = source.indexOf(`impl ${typeName} {`)
  if (impl === -1) throw new Error(`no impl ${typeName} in prefix.rs`)
  const fn = source.indexOf('pub fn as_str', impl)
  const end = source.indexOf('\n    }\n', fn)
  const body = source.slice(fn, end)
  return [...body.matchAll(new RegExp(`${typeName}::\\w+ => "([^"]*)"`, 'g'))]
    .map((m) => m[1])
    .filter((v): v is string => v !== undefined)
}

function missingFrom(expected: string[], actual: string[]): string[] {
  return expected.filter((v) => !actual.includes(v))
}

const source = readFileSync(RUST_PREFIX_RS, 'utf-8')

describe('gamelib-log prefix.rs matches constants.ts', () => {
  const rustPrefixes = rustAsStrLiterals(source, 'Prefix')
  const rustLevels = rustAsStrLiterals(source, 'Level')

  it('has every TS LogPrefix value, plus Shell and nothing else', () => {
    const tsValues = Object.values(LogPrefix)
    expect(missingFrom(tsValues, rustPrefixes)).toEqual([])
    expect([...rustPrefixes].sort()).toEqual([...tsValues, 'Shell'].sort())
  })

  it('has exactly the TS LogLevel values', () => {
    expect([...rustLevels].sort()).toEqual([...LogLevel].sort())
  })

  it('the extraction reads real arms (a missing value would fail)', () => {
    expect(rustPrefixes.length).toBe(Object.values(LogPrefix).length + 1)
    expect(rustLevels).toHaveLength(LogLevel.length)
    // Self-test: dropping one Rust arm is reported as a missing value.
    const mutated = rustPrefixes.filter((v) => v !== 'Backend')
    expect(missingFrom(Object.values(LogPrefix), mutated)).toEqual(['Backend'])
    const mutatedSource = source.replace('Prefix::Backend => "Backend",', '')
    expect(mutatedSource).not.toBe(source)
    expect(rustAsStrLiterals(mutatedSource, 'Prefix')).not.toContain('Backend')
  })
})
