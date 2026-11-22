/**
 * The generated schema descriptor (Phase 85, FND-06) cannot drift from the zod schemas.
 *
 * `src-tauri/crates/gamelib-store/src/schemas.json` is what the Rust strip reads in place of the zod
 * schemas `utils/schemaStrip.ts` reads at call time. This suite regenerates it in memory and
 * fails on any difference, and proves the walker refuses a construct it cannot describe instead of
 * describing it wrongly.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { z } from 'zod'
import {
  buildStoreSchemas,
  describeSchema,
  SCHEMAS_REL,
  type StoreSchemas
} from '../../../../meta/genStoreSchemas'

const root = join(__dirname, '..', '..', '..', '..')

const committed = (): StoreSchemas =>
  JSON.parse(readFileSync(join(root, SCHEMAS_REL), 'utf8')) as StoreSchemas

describe('schemas.json', () => {
  it('equals what the generator produces now', () => {
    expect(committed()).toEqual(buildStoreSchemas())
  })

  it('describes every schema the migration chains strip against', () => {
    const schemas = committed()
    expect(Object.keys(schemas.gameInfo).sort()).toEqual([
      'gog',
      'legendary',
      'nile',
      'sideload',
      'steam'
    ])
    expect(Object.keys(schemas.gameInfoInstalled).sort()).toEqual([
      'gog',
      'sideload'
    ])
    for (const node of [schemas.settingsGlobal, schemas.settingsGame]) {
      expect(node.kind).toBe('object')
      // `.partial()`: every member is optional, which is what the v1 -> v2 strips ask of it.
      if (node.kind === 'object') {
        expect(node.mode).toBe('strict')
        expect(
          Object.values(node.members).every((member) => member.optional)
        ).toBe(true)
      }
    }
  })
})

describe('describeSchema', () => {
  it('describes the supported grammar', () => {
    expect(
      describeSchema(
        z.strictObject({
          a: z.string().min(1).max(8),
          b: z.array(z.number()).max(3).optional(),
          c: z.enum(['x', 'y']).nullable(),
          d: z.record(z.string(), z.boolean()),
          e: z.union([z.literal('p'), z.null()]),
          f: z.string().default('z')
        }),
        'scratch'
      )
    ).toEqual({
      kind: 'object',
      mode: 'strict',
      members: {
        a: { optional: false, node: { kind: 'string', min: 1, max: 8 } },
        b: {
          optional: true,
          node: {
            kind: 'optional',
            inner: {
              kind: 'array',
              element: { kind: 'number' },
              max: 3
            }
          }
        },
        c: {
          optional: false,
          node: {
            kind: 'nullable',
            inner: { kind: 'enum', values: ['x', 'y'] }
          }
        },
        d: {
          optional: false,
          node: { kind: 'record', value: { kind: 'boolean' } }
        },
        e: {
          optional: false,
          node: {
            kind: 'union',
            options: [{ kind: 'literal', value: 'p' }, { kind: 'null' }]
          }
        },
        f: {
          optional: true,
          node: { kind: 'default', inner: { kind: 'string' } }
        }
      }
    })
  })

  it('refuses a refine, naming the schema path', () => {
    const scratch = z.strictObject({
      name: z.string().refine((s) => s !== 'x', 'not x')
    })
    expect(() => describeSchema(scratch, 'scratch')).toThrow(
      /cannot describe a string check 'custom' at scratch\.name/
    )
  })

  it('refuses a transform, a regex, a number check and a lazy schema', () => {
    expect(() =>
      describeSchema(
        z.string().transform((s) => s.length),
        'scratch'
      )
    ).toThrow(/cannot describe/)
    expect(() => describeSchema(z.string().regex(/^a/), 'scratch')).toThrow(
      /cannot describe a string check/
    )
    expect(() => describeSchema(z.number().int(), 'scratch')).toThrow(
      /cannot describe a number check/
    )
    expect(() =>
      describeSchema(
        z.lazy(() => z.string()),
        'scratch'
      )
    ).toThrow(/cannot describe a 'lazy' schema/)
  })
})
