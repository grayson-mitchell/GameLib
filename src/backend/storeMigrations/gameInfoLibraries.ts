/**
 * GameInfo library migrations (Phase 70, D-12; gap G2): per GameInfo-bearing store, a v1 -> v2
 * step and a v2 -> v3 step that both run the schema-derived `stripToSchema` against the item's
 * runner member schema. It removes undeclared keys at every depth (including inside arrays and
 * records), removes null where the member is optional, and removes optional members the schema
 * still rejects (these are regenerable caches). Loose boundaries (dlcList) are preserved.
 * v3 re-strips profiles the original 70-15 strip already stamped v2 (WR-04).
 *
 * Pure, total and never drops an entry: unknown runners and non-object items are untouched. The
 * schemas come from common/types/ipc/gameInfoSchema.ts (single source; nothing copied by hand).
 */
import type { z } from 'zod'
import {
  gogGameInfoSchema,
  legendaryGameInfoSchema,
  nileGameInfoSchema,
  sideloadGameInfoSchema,
  steamGameInfoSchema
} from 'common/types/ipc/gameInfoSchema'
import type { Migration } from '../storeVersioning/types'
import { invalidPaths, stripToSchema } from './schemaStrip'

type PlainObject = Record<string, unknown>

const isPlainObject = (v: unknown): v is PlainObject =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const SCHEMA_BY_RUNNER: Readonly<Record<string, z.ZodType>> = Object.freeze({
  steam: steamGameInfoSchema,
  gog: gogGameInfoSchema,
  legendary: legendaryGameInfoSchema,
  nile: nileGameInfoSchema,
  sideload: sideloadGameInfoSchema
})

// gog_store/installed and sideload `installed` items are installed-info objects, not GameInfo.
const GOG_INSTALLED_SCHEMA: z.ZodType = gogGameInfoSchema.shape.install
const SIDELOAD_INSTALLED_SCHEMA: z.ZodType =
  sideloadGameInfoSchema.shape.install

/**
 * The strip never repairs a required member, so an entry can still be invalid afterwards. Report
 * it by app name and issue paths only (no values; no `backend/logger`: module-init cycle, see
 * storeVersioning/backup.ts) so a later IPC_INVALID_ARGS can be traced (70-REVIEW WR-03).
 */
const strip = (item: unknown, schema: z.ZodType): unknown => {
  const out = stripToSchema(item, schema, { dropInvalidOptional: true })
  const paths = invalidPaths(out, schema)
  if (paths.length > 0) {
    const name =
      isPlainObject(out) && typeof out['app_name'] === 'string'
        ? out['app_name']
        : '(unnamed)'
    process.stderr.write(
      `[storeVersion] GameInfo entry ${name} is still schema-invalid after the strip at: ${paths.join(', ')}\n`
    )
  }
  return out
}

/**
 * Cleans an item against its runner schema. The runner is the item's own `runner`, falling back
 * to the file's store; an unknown runner or non-object is returned as-is.
 */
function stripUndeclaredGameInfoKeys(
  item: unknown,
  fallbackRunner: string
): unknown {
  if (!isPlainObject(item)) return item
  const runner =
    typeof item['runner'] === 'string' ? item['runner'] : fallbackRunner
  const schema = Object.hasOwn(SCHEMA_BY_RUNNER, runner)
    ? SCHEMA_BY_RUNNER[runner]
    : undefined
  return schema ? strip(item, schema) : item
}

function stripInstalled(item: unknown, schema: z.ZodType): unknown {
  return isPlainObject(item) ? strip(item, schema) : item
}

function stripArrays(
  file: PlainObject,
  keys: readonly string[],
  stripItem: (item: unknown) => unknown
): PlainObject {
  let next = file
  for (const key of keys) {
    const list = file[key]
    if (!Array.isArray(list)) continue
    next = { ...next, [key]: list.map(stripItem) }
  }
  return next
}

const twoStep = (
  prefix: string,
  run: Migration['run']
): readonly Migration[] => [
  { id: `${prefix}-v1-v2`, to: 2, run },
  { id: `${prefix}-v2-v3`, to: 3, run }
]

const libraryChain = (
  prefix: string,
  keys: readonly string[],
  stripItem: (item: unknown) => unknown
): readonly Migration[] =>
  twoStep(prefix, (file) => stripArrays(file, keys, stripItem))

export const steamLibraryChain = libraryChain('steam-library', ['games'], (i) =>
  stripUndeclaredGameInfoKeys(i, 'steam')
)

export const gogLibraryChain = libraryChain('gog-library', ['games'], (i) =>
  stripUndeclaredGameInfoKeys(i, 'gog')
)

export const gogInstalledChain = libraryChain(
  'gog-installed',
  ['installed'],
  (i) => stripInstalled(i, GOG_INSTALLED_SCHEMA)
)

export const legendaryLibraryChain = libraryChain(
  'legendary-library',
  ['library'],
  (i) => stripUndeclaredGameInfoKeys(i, 'legendary')
)

export const nileLibraryChain = libraryChain('nile-library', ['library'], (i) =>
  stripUndeclaredGameInfoKeys(i, 'nile')
)

// `sideload_apps/library` is unstamped on disk; the engine prepends the identity v0 -> v1 step.
export const sideloadLibraryChain: readonly Migration[] = twoStep(
  'sideload-library',
  (file) => {
    const games = stripArrays(file, ['games'], (i) =>
      stripUndeclaredGameInfoKeys(i, 'sideload')
    )
    return stripArrays(games, ['installed'], (i) =>
      stripInstalled(i, SIDELOAD_INSTALLED_SCHEMA)
    )
  }
)

// Orchestrator resolution 4: a retried or resumed queue/finished element re-sends its params
// through the strict install schema, so params.gameInfo must be clean too.
const stripDownloadElement = (element: unknown): unknown => {
  if (!isPlainObject(element)) return element
  const params = element['params']
  if (!isPlainObject(params) || !('gameInfo' in params)) return element
  const fallback = typeof params['runner'] === 'string' ? params['runner'] : ''
  return {
    ...element,
    params: {
      ...params,
      gameInfo: stripUndeclaredGameInfoKeys(params['gameInfo'], fallback)
    }
  }
}

export const downloadManagerChain = libraryChain(
  'download-manager',
  ['queue', 'finished'],
  stripDownloadElement
)
