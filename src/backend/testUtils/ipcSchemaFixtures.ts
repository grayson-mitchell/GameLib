/**
 * Shared helpers for the per-domain IPC schema fixture tests (Phase 67, 67-05 recipe R5).
 *
 * A fixture is an args array copied from a real call site. It is JSON round-tripped before
 * parsing because that is what the sidecar actually receives (undefined becomes null, etc.).
 */
import type { ArgsMap } from 'common/types/ipc/schemaTypes'

export interface Fixtures {
  valid: unknown[][]
  invalid: unknown[][]
}

export type FixtureTable<A extends ArgsMap> = { [K in keyof A]: Fixtures }

export function roundTrip<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value))
}

/** Fails if any schema key has no fixture, or the table names a key with no schema. */
export function expectFixtureCoverage<A extends ArgsMap>(
  argsMap: A,
  table: FixtureTable<A>
): void {
  const keys = Object.keys(argsMap)
  const tableKeys = Object.keys(table)
  expect(keys.filter((k) => !tableKeys.includes(k))).toEqual([])
  expect(tableKeys.filter((k) => !keys.includes(k))).toEqual([])
  for (const key of keys) {
    const fixtures = (table as Record<string, Fixtures>)[key]
    expect(fixtures.valid.length).toBeGreaterThanOrEqual(1)
    expect(fixtures.invalid.length).toBeGreaterThanOrEqual(1)
  }
}

/** One jest `it` per valid and invalid fixture. */
export function runFixtureTable<A extends ArgsMap>(
  argsMap: A,
  table: FixtureTable<A>
): void {
  for (const key of Object.keys(argsMap)) {
    const fixtures = (table as Record<string, Fixtures>)[key]
    if (!fixtures) continue
    fixtures.valid.forEach((args, i) => {
      it(`${key}: valid fixture ${i} parses`, () => {
        const result = argsMap[key].safeParse(roundTrip(args))
        expect(result.success).toBe(true)
      })
    })
    fixtures.invalid.forEach((args, i) => {
      it(`${key}: invalid fixture ${i} is rejected`, () => {
        const result = argsMap[key].safeParse(roundTrip(args))
        expect(result.success).toBe(false)
      })
    })
  }
}
