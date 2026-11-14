import { z } from 'zod'

import { launchOptionSchema } from '../../../common/types/ipc/settingsSchema'
import { wineInstallationArg } from '../../../common/types/ipc/schemaTypes'
import { stripToSchema } from '../schemaStrip'

const KEEP = { dropInvalidOptional: false } as const
const DROP = { dropInvalidOptional: true } as const

describe('stripToSchema: structural rules', () => {
  const schema = z.strictObject({
    a: z.string(),
    nested: z.strictObject({ x: z.number(), y: z.string().optional() }),
    list: z.array(z.strictObject({ k: z.string() })),
    rec: z.record(z.string(), z.strictObject({ n: z.number() })),
    opt: z.string().optional(),
    nullOpt: z.string().nullable().optional(),
    reqNullable: z.strictObject({ v: z.string() }).nullable(),
    reqStr: z.string()
  })

  it('removes undeclared keys on a strict object, keeps declared, does not mutate', () => {
    const input = { a: 'one', stray: 1, nested: { x: 1, extra: true } }
    const before = structuredClone(input)
    const out = stripToSchema(input, schema, KEEP) as Record<string, unknown>
    expect(out).toEqual({ a: 'one', nested: { x: 1 } })
    expect(input).toEqual(before)
    expect(out).not.toBe(input)
  })

  it('removes undeclared keys inside array elements and keeps element count', () => {
    const out = stripToSchema(
      { list: [{ k: 'a', s: 1 }, null, 7, { k: 'b' }] },
      schema,
      KEEP
    ) as { list: unknown[] }
    expect(out.list).toEqual([{ k: 'a' }, null, 7, { k: 'b' }])
  })

  it('removes undeclared keys inside record values', () => {
    const out = stripToSchema(
      { rec: { en: { n: 1, s: 2 }, de: { n: 3 } } },
      schema,
      KEEP
    )
    expect(out).toEqual({ rec: { en: { n: 1 }, de: { n: 3 } } })
  })

  it('removes null on an optional-but-not-nullable member', () => {
    expect(stripToSchema({ opt: null }, schema, KEEP)).toEqual({})
  })

  it('keeps null on nullable-optional, required-nullable and required members', () => {
    expect(stripToSchema({ nullOpt: null }, schema, KEEP)).toEqual({
      nullOpt: null
    })
    expect(stripToSchema({ reqNullable: null }, schema, KEEP)).toEqual({
      reqNullable: null
    })
    expect(stripToSchema({ reqStr: null }, schema, KEEP)).toEqual({
      reqStr: null
    })
  })

  it('dropInvalidOptional removes an invalid optional, inner-first', () => {
    const s = z.strictObject({
      extra: z
        .strictObject({
          about: z.strictObject({ description: z.string() }).optional(),
          reqs: z.array(z.string())
        })
        .optional(),
      when: z.string().optional()
    })
    const input = { extra: { about: {}, reqs: [] }, when: 123 }
    expect(stripToSchema(input, s, DROP)).toEqual({ extra: { reqs: [] } })
    expect(stripToSchema(input, s, KEEP)).toEqual(input)
  })

  it('never removes an invalid required member nor an array element', () => {
    const s = z.strictObject({
      req: z.string(),
      arr: z.array(z.string())
    })
    const input = { req: 5, arr: ['a', 1] }
    expect(stripToSchema(input, s, DROP)).toEqual(input)
  })

  it('passes loose objects through byte-for-byte', () => {
    const s = z.strictObject({ dlc: z.array(z.looseObject({})).optional() })
    const input = { dlc: [{ mainGameItemList: [1], longDescription: 'x' }] }
    expect(stripToSchema(input, s, DROP)).toEqual(input)
    const wine = { bin: '/w', name: 'W', type: 'wine', legacy: 1 }
    expect(stripToSchema(wine, wineInstallationArg(), DROP)).toEqual(wine)
  })

  it('union: valid unchanged, stray key cleaned against the satisfied arm, unmatched unchanged', () => {
    const valid = { name: 'n', parameters: 'p' }
    expect(stripToSchema(valid, launchOptionSchema, DROP)).toBe(valid)
    expect(
      stripToSchema({ ...valid, stray: 1 }, launchOptionSchema, DROP)
    ).toEqual(valid)
    const bad = { type: 'dlc', stray: 1 }
    expect(stripToSchema(bad, launchOptionSchema, DROP)).toBe(bad)
  })

  it('is total on hostile input and never pollutes via __proto__', () => {
    for (const v of [null, 1, 'x', [], [1], undefined, { list: {} }, { a: [] }])
      expect(() => stripToSchema(v, schema, DROP)).not.toThrow()
    const hostile = JSON.parse('{"a":"x","__proto__":{"polluted":true}}')
    const out = stripToSchema(hostile, schema, DROP) as object
    expect(Object.hasOwn(out, '__proto__')).toBe(false)
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})
