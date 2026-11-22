import { z } from 'zod'

import {
  gogGameInfoSchema,
  legendaryGameInfoSchema,
  nileGameInfoSchema,
  sideloadGameInfoSchema,
  steamGameInfoSchema
} from '../../../common/types/ipc/gameInfoSchema'
import {
  appSettingsSchema,
  gameSettingsSchema,
  launchOptionSchema
} from '../../../common/types/ipc/settingsSchema'
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

  it('union: never rewrites a dlc or altExe launch option into the basic arm (WR-01)', () => {
    const dlc = {
      type: 'dlc',
      dlcAppName: 'a',
      dlcTitle: 'b',
      name: 'N',
      parameters: ''
    }
    expect(stripToSchema(dlc, launchOptionSchema, DROP)).toEqual({
      type: 'dlc',
      dlcAppName: 'a',
      dlcTitle: 'b'
    })
    const altExe = {
      type: 'altExe',
      executable: '/game/alt.exe',
      name: 'N',
      parameters: ''
    }
    expect(stripToSchema(altExe, launchOptionSchema, DROP)).toEqual({
      type: 'altExe',
      executable: '/game/alt.exe'
    })
    // An unknown discriminant matches no arm's literal, so no lossy pass rewrites it.
    const unknown = { type: 'weird', name: 'N', parameters: '' }
    expect(stripToSchema(unknown, launchOptionSchema, DROP)).toBe(unknown)
  })

  it('union: the lossy pass still runs on an arm whose literal members the value matches', () => {
    const s = z.union([
      z.strictObject({ type: z.literal('a').optional(), n: z.string() }),
      z.strictObject({
        type: z.literal('b'),
        m: z.string(),
        extra: z.number().optional()
      })
    ])
    const input = { type: 'b', m: 'x', extra: 'bad' }
    expect(stripToSchema(input, s, DROP)).toEqual({ type: 'b', m: 'x' })
    expect(stripToSchema(input, s, KEEP)).toBe(input)
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

describe('stripToSchema: real project schemas', () => {
  const base = {
    app_name: 'a',
    art_cover: 'c',
    art_square: 's',
    install: {},
    is_installed: false,
    title: 'T',
    canRunOffline: true
  }
  const valid = {
    steam: { ...base, runner: 'steam' },
    gog: { ...base, runner: 'gog' },
    legendary: { ...base, runner: 'legendary' },
    nile: { ...base, runner: 'nile' },
    sideload: { ...base, runner: 'sideload' }
  }
  const schemas = {
    steam: steamGameInfoSchema,
    gog: gogGameInfoSchema,
    legendary: legendaryGameInfoSchema,
    nile: nileGameInfoSchema,
    sideload: sideloadGameInfoSchema
  }

  it.each(Object.keys(valid) as (keyof typeof valid)[])(
    'is idempotent on clean %s data',
    (runner) => {
      expect(schemas[runner].safeParse(valid[runner]).success).toBe(true)
      expect(stripToSchema(valid[runner], schemas[runner], DROP)).toEqual(
        valid[runner]
      )
    }
  )

  const cases: [string, keyof typeof valid, Record<string, unknown>][] = [
    ['stray top-level key', 'nile', { ...valid.nile, stray: 1 }],
    ['art_logo null', 'sideload', { ...valid.sideload, art_logo: null }],
    [
      'stray key inside extra.reqs[0]',
      'steam',
      {
        ...valid.steam,
        extra: {
          reqs: [{ minimum: 'a', recommended: 'b', title: 'c', stray: 1 }]
        }
      }
    ],
    [
      'stray key inside gog_save_location[0]',
      'gog',
      {
        ...valid.gog,
        gog_save_location: [{ name: 'n', location: 'l', stray: 1 }]
      }
    ],
    [
      'stray key inside perLangSize.en',
      'gog',
      {
        ...valid.gog,
        install: {
          manifest: {
            disk_size: 1,
            download_size: 1,
            app_name: 'a',
            languages: [],
            versionEtag: 'e',
            dependencies: [],
            perLangSize: { en: { download_size: 1, disk_size: 1, stray: 1 } }
          }
        }
      }
    ]
  ]
  it.each(cases)('cleans defect: %s', (_name, runner, input) => {
    expect(schemas[runner].safeParse(input).success).toBe(false)
    const out = stripToSchema(input, schemas[runner], DROP)
    expect(schemas[runner].safeParse(out).success).toBe(true)
  })

  it('drops invalid extra.about but keeps extra.reqs (legendary)', () => {
    const input = {
      ...valid.legendary,
      extra: { about: { shortDescription: 's' }, reqs: [] }
    }
    expect(legendaryGameInfoSchema.safeParse(input).success).toBe(false)
    const out = stripToSchema(input, legendaryGameInfoSchema, DROP)
    expect(legendaryGameInfoSchema.safeParse(out).success).toBe(true)
    expect(out).toEqual({ ...valid.legendary, extra: { reqs: [] } })
  })

  it('keeps legendary save_path null and loose dlcList elements', () => {
    const input = {
      ...valid.legendary,
      save_path: null,
      dlcList: [{ mainGameItemList: [], longDescription: 'x' }]
    }
    expect(stripToSchema(input, legendaryGameInfoSchema, DROP)).toEqual(input)
  })

  it('cleans partial gameSettingsSchema and documents both modes', () => {
    const partial = gameSettingsSchema.partial()
    const wineVersion = {
      bin: '/usr/bin/wine',
      name: 'Wine',
      type: 'wine',
      legacy: 1
    }
    const input = {
      useSteamRuntime: true,
      lastUsedLaunchOption: null,
      enviromentOptions: [{ key: 'A', value: '1', stray: 1 }],
      wineVersion
    }
    const out = stripToSchema(input, partial, DROP) as Record<string, unknown>
    expect(out.useSteamRuntime).toBeUndefined()
    expect('lastUsedLaunchOption' in out).toBe(false)
    expect(out.enviromentOptions).toEqual([{ key: 'A', value: '1' }])
    expect(out.wineVersion).toEqual(wineVersion)
    expect(partial.safeParse(out).success).toBe(true)

    const gamescope = {
      enableUpscaling: true,
      enableLimiter: true,
      enableForceGrabCursor: true,
      windowType: '',
      gameWidth: '',
      gameHeight: '',
      upscaleWidth: '',
      upscaleHeight: '',
      upscaleMethod: '',
      fpsLimiter: '',
      fpsLimiterNoFocus: ''
    }
    const bad = { gamescope, showFps: 'yes' }
    const dropped = stripToSchema(bad, partial, DROP)
    expect(dropped).toEqual({})
    expect(partial.safeParse(dropped).success).toBe(true)
    const kept = stripToSchema(bad, partial, KEEP)
    expect(kept).toEqual(bad)
    expect(partial.safeParse(kept).success).toBe(false)
  })

  it('cleans partial appSettingsSchema', () => {
    const partial = appSettingsSchema.partial()
    expect(stripToSchema({ focusRow: null }, partial, DROP)).toEqual({
      focusRow: null
    })
    expect(
      stripToSchema(
        { experimentalFeatures: { cometSupport: true, retired: true } },
        partial,
        DROP
      )
    ).toEqual({ experimentalFeatures: { cometSupport: true } })
  })
})
