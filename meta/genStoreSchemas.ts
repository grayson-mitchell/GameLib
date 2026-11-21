/**
 * Store schema descriptor generator (Phase 85, FND-06, D-12).
 *
 * The TS migration chains strip a store file against zod schemas read at call time
 * (`storeMigrations/schemaStrip.ts`), so a hand-copied key list in Rust would drift the day a setting is
 * added. This walks the very schemas the chains read and writes them as a JSON descriptor the Rust
 * `gamelib-store` crate loads (`include_str!`): `src-tauri/crates/gamelib-store/src/schemas.json`.
 *
 * What it describes is exactly the grammar the strip and `safeParse` need and nothing else. Anything it
 * cannot describe (a `.refine`, a transform, a pipe, a lazy schema, a regex, a number check, a catchall of
 * another type, a non-string literal, a record with a constrained key) makes the generator exit 1 naming
 * the schema path, so a schema that grows such a construct fails here instead of silently being stripped
 * differently by Rust.
 *
 * Node kinds (`kind`):
 *   object      `mode` strict | loose, `members` { key: { optional, node } }. `optional` is zod's own verdict
 *               for `undefined` (`safeParse(undefined).success`), the question the strip asks of a member.
 *               loose is both `z.looseObject` and a plain `z.object`: unknown keys are accepted and the
 *               strip leaves the object alone.
 *   array       `element`, `min`, `max` (element count)
 *   record      `value` (the key type is always a plain string)
 *   union       `options` (a `z.discriminatedUnion` is described as the union it extends: the verdict of
 *               `safeParse` and the strip's behaviour are the same)
 *   literal     `value` (a string)
 *   enum        `values`
 *   string      `min`, `max` (UTF-16 code units, as zod counts)
 *   number, boolean, null
 *   optional, nullable, default   `inner`. A default value is never applied by the strip, so none is kept.
 * `.brand()` is type-only at run time and leaves no trace.
 *
 * Output: `{ generatedBy, settingsGlobal, settingsGame, gameInfo: { steam, gog, legendary, nile, sideload },
 * gameInfoInstalled: { gog, sideload } }`. The two settings nodes are the `.partial()` schemas the v1 -> v2
 * strips use; `gameInfoInstalled` are the `install` members the gog installed and sideload `installed`
 * lists are stripped against; the download-manager chain reuses `gameInfo` for `params.gameInfo`.
 *
 * Run `node meta/runTs.cjs --bundle --platform=node --target=node22 meta/genStoreSchemas.ts` to write the
 * file, add `--check` to fail on any difference (the jest drift test compares the same data).
 * Imports below are relative on purpose: `meta/runTs.cjs` bundling does not honour tsconfig baseUrl.
 */
import { readFileSync, writeFileSync } from 'fs'
import { createRequire } from 'module'
import { join } from 'path'
import { z } from 'zod'
import {
  gogGameInfoSchema,
  legendaryGameInfoSchema,
  nileGameInfoSchema,
  sideloadGameInfoSchema,
  steamGameInfoSchema
} from '../src/common/types/ipc/gameInfoSchema'
import {
  appSettingsSchema,
  gameSettingsSchema
} from '../src/common/types/ipc/settingsSchema'

export const SCHEMAS_REL = 'src-tauri/crates/gamelib-store/src/schemas.json'
const GENERATOR = 'meta/genStoreSchemas.ts'
const REGEN_CMD =
  'node meta/runTs.cjs --bundle --platform=node --target=node22 meta/genStoreSchemas.ts'

interface Member {
  optional: boolean
  node: Node
}

export type Node =
  | {
      kind: 'object'
      mode: 'strict' | 'loose'
      members: Record<string, Member>
    }
  | { kind: 'array'; element: Node; min?: number; max?: number }
  | { kind: 'record'; value: Node }
  | { kind: 'union'; options: Node[] }
  | { kind: 'literal'; value: string }
  | { kind: 'enum'; values: string[] }
  | { kind: 'string'; min?: number; max?: number }
  | { kind: 'number' | 'boolean' | 'null' }
  | { kind: 'optional' | 'nullable' | 'default'; inner: Node }

export interface StoreSchemas {
  generatedBy: string
  settingsGlobal: Node
  settingsGame: Node
  gameInfo: Record<'steam' | 'gog' | 'legendary' | 'nile' | 'sideload', Node>
  gameInfoInstalled: Record<'gog' | 'sideload', Node>
}

interface CheckLike {
  _zod: { def: { check: string; minimum?: number; maximum?: number } }
}

type DefLike = Record<string, unknown> & { type: string }

const defOf = (schema: z.ZodType): DefLike =>
  (schema as unknown as { _zod: { def: DefLike } })._zod.def

function unsupported(path: string, what: string): never {
  throw new Error(`genStoreSchemas: cannot describe ${what} at ${path}`)
}

/** Min and max from a `min_length` / `max_length` check list; any other check is refused. */
function lengthBounds(
  def: DefLike,
  path: string
): { min?: number; max?: number } {
  let min: number | undefined
  let max: number | undefined
  for (const check of (def.checks ?? []) as CheckLike[]) {
    const c = check._zod.def
    if (c.check === 'min_length' && typeof c.minimum === 'number')
      min = Math.max(min ?? 0, c.minimum)
    else if (c.check === 'max_length' && typeof c.maximum === 'number')
      max = Math.min(max ?? Infinity, c.maximum)
    else unsupported(path, `a ${def.type} check '${c.check}'`)
  }
  return {
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max })
  }
}

/** The descriptor of one zod schema. Throws on any construct outside the grammar above. */
export function describeSchema(schema: z.ZodType, path: string): Node {
  const def = defOf(schema)
  switch (def.type) {
    case 'object': {
      const catchall = def.catchall as z.ZodType | undefined
      let mode: 'strict' | 'loose'
      if (catchall === undefined) mode = 'loose'
      else if (catchall instanceof z.ZodNever) mode = 'strict'
      else if (catchall instanceof z.ZodUnknown) mode = 'loose'
      else return unsupported(path, 'an object catchall')
      const members: Record<string, Member> = {}
      for (const [key, member] of Object.entries(
        def.shape as Record<string, z.ZodType>
      )) {
        members[key] = {
          optional: member.safeParse(undefined).success,
          node: describeSchema(member, `${path}.${key}`)
        }
      }
      return { kind: 'object', mode, members }
    }
    case 'array':
      return {
        kind: 'array',
        element: describeSchema(def.element as z.ZodType, `${path}[]`),
        ...lengthBounds(def, path)
      }
    case 'record': {
      const key = def.keyType as z.ZodType
      const keyDef = defOf(key)
      if (
        keyDef.type !== 'string' ||
        ((keyDef.checks ?? []) as unknown[]).length > 0
      )
        unsupported(path, 'a record key that is not a plain string')
      return {
        kind: 'record',
        value: describeSchema(def.valueType as z.ZodType, `${path}{}`)
      }
    }
    case 'union':
      return {
        kind: 'union',
        options: (def.options as z.ZodType[]).map((o, i) =>
          describeSchema(o, `${path}|${i}`)
        )
      }
    case 'literal': {
      const values = def.values as unknown[]
      if (values.length !== 1 || typeof values[0] !== 'string')
        unsupported(path, 'a literal that is not a single string')
      return { kind: 'literal', value: values[0] }
    }
    case 'enum':
      return {
        kind: 'enum',
        values: Object.values(def.entries as Record<string, string>)
      }
    case 'string':
      return { kind: 'string', ...lengthBounds(def, path) }
    case 'number':
    case 'boolean':
    case 'null':
      if (((def.checks ?? []) as unknown[]).length > 0)
        unsupported(path, `a ${def.type} check`)
      return { kind: def.type }
    case 'optional':
    case 'nullable':
    case 'default':
      return {
        kind: def.type,
        inner: describeSchema(def.innerType as z.ZodType, path)
      }
    default:
      return unsupported(path, `a '${def.type}' schema`)
  }
}

/** The descriptor, in memory. Pure. */
export function buildStoreSchemas(): StoreSchemas {
  const d = (schema: z.ZodType, path: string): Node =>
    describeSchema(schema, path)
  return {
    generatedBy: GENERATOR,
    settingsGlobal: d(appSettingsSchema.partial(), 'appSettingsSchema'),
    settingsGame: d(gameSettingsSchema.partial(), 'gameSettingsSchema'),
    gameInfo: {
      steam: d(steamGameInfoSchema, 'steamGameInfoSchema'),
      gog: d(gogGameInfoSchema, 'gogGameInfoSchema'),
      legendary: d(legendaryGameInfoSchema, 'legendaryGameInfoSchema'),
      nile: d(nileGameInfoSchema, 'nileGameInfoSchema'),
      sideload: d(sideloadGameInfoSchema, 'sideloadGameInfoSchema')
    },
    gameInfoInstalled: {
      gog: d(gogGameInfoSchema.shape.install, 'gogGameInfoSchema.install'),
      sideload: d(
        sideloadGameInfoSchema.shape.install,
        'sideloadGameInfoSchema.install'
      )
    }
  }
}

/** The committed bytes: the descriptor through prettier's JSON parser, so `prettier --check` passes. */
async function renderStoreSchemas(schemas: StoreSchemas): Promise<string> {
  // Resolved from the repo at run time, not bundled: prettier 3 is an ES module package that does not
  // survive esbuild's CommonJS bundle, and jest never calls this (it compares `buildStoreSchemas()`).
  const prettier = createRequire(join(process.cwd(), 'package.json'))(
    'prettier'
  ) as typeof import('prettier')
  const options =
    (await prettier.resolveConfig(join(process.cwd(), SCHEMAS_REL))) ?? {}
  return prettier.format(JSON.stringify(schemas), {
    ...options,
    parser: 'json'
  })
}

async function main(): Promise<void> {
  const next = await renderStoreSchemas(buildStoreSchemas())
  const path = join(process.cwd(), SCHEMAS_REL)
  if (process.argv.slice(2).includes('--check')) {
    let current = ''
    try {
      current = readFileSync(path, 'utf8')
    } catch {
      // missing counts as stale
    }
    if (current !== next) {
      console.error(`::error::${SCHEMAS_REL} is stale; run ${REGEN_CMD}`)
      process.exit(1)
    }
    console.log(`${SCHEMAS_REL} is up to date`)
    return
  }
  writeFileSync(path, next)
  console.log(`wrote ${SCHEMAS_REL}`)
}

// Guarded so the jest suite can import the pure builder without running the CLI.
if (!process.env.JEST_WORKER_ID) {
  main().catch((e: unknown) => {
    console.error(e)
    process.exit(1)
  })
}
