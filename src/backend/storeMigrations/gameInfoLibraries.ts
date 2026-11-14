/**
 * GameInfo library migrations (Phase 70, D-12): one v1 -> v2 step per GameInfo-bearing store
 * that deletes keys no member of the strict per-runner schema declares, so an object written by
 * an older build loads clean and the strict IPC schema can treat an unknown key as a real bug.
 *
 * Pure, total and delete-only: it never drops an entry, never throws, and leaves unknown runners
 * and non-object items untouched. The key sets are derived from the strict zod schemas of
 * common/types/ipc/gameInfoSchema.ts (single source; nothing is copied by hand).
 */
import { z } from 'zod'
import {
  gogGameInfoSchema,
  legendaryGameInfoSchema,
  nileGameInfoSchema,
  sideloadGameInfoSchema,
  steamGameInfoSchema
} from 'common/types/ipc/gameInfoSchema'
import type { Migration } from '../storeVersioning/types'

type PlainObject = Record<string, unknown>

const isPlainObject = (v: unknown): v is PlainObject =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Declared keys at one level plus the declared nested-object levels beneath it. */
interface KeyTree {
  keys: ReadonlySet<string>
  children: ReadonlyMap<string, KeyTree>
}

const unwrapSchema = (schema: z.ZodType): z.ZodType => {
  let current = schema
  while (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
    current = current.unwrap() as z.ZodType
  }
  return current
}

/**
 * Recurses only into declared nested OBJECT schemas (install, extra, overrides, manifest,
 * cyberpunk, about). Arrays are never recursed: `dlcList` is a raw third-party Epic payload whose
 * persisted elements legitimately carry undeclared keys (orchestrator resolution 5), and the
 * other array members (reqs, gog_save_location) are leaf data.
 */
const treeOf = (schema: z.ZodObject): KeyTree => {
  const children = new Map<string, KeyTree>()
  const shape = schema.shape as Record<string, z.ZodType>
  for (const [key, member] of Object.entries(shape)) {
    const inner = unwrapSchema(member)
    if (inner instanceof z.ZodObject) children.set(key, treeOf(inner))
  }
  return { keys: new Set(Object.keys(shape)), children }
}

const TREE_BY_RUNNER: ReadonlyMap<string, KeyTree> = new Map([
  ['steam', treeOf(steamGameInfoSchema)],
  ['gog', treeOf(gogGameInfoSchema)],
  ['legendary', treeOf(legendaryGameInfoSchema)],
  ['nile', treeOf(nileGameInfoSchema)],
  ['sideload', treeOf(sideloadGameInfoSchema)]
])

// gog_store/installed and sideload `installed` items are installed-info objects, not GameInfo.
const GOG_INSTALLED_TREE = TREE_BY_RUNNER.get('gog')!.children.get('install')!
const SIDELOAD_INSTALLED_TREE =
  TREE_BY_RUNNER.get('sideload')!.children.get('install')!

function stripWithTree(item: PlainObject, tree: KeyTree): PlainObject {
  const out: PlainObject = {}
  for (const [key, value] of Object.entries(item)) {
    if (!tree.keys.has(key)) continue
    const child = tree.children.get(key)
    out[key] =
      child && isPlainObject(value) ? stripWithTree(value, child) : value
  }
  return out
}

/**
 * Removes every key the item's runner schema does not declare. The runner is the item's own
 * `runner`, falling back to the file's store; an unknown runner or non-object is returned as-is.
 */
function stripUndeclaredGameInfoKeys(
  item: unknown,
  fallbackRunner: string
): unknown {
  if (!isPlainObject(item)) return item
  const runner =
    typeof item['runner'] === 'string' ? item['runner'] : fallbackRunner
  const tree = TREE_BY_RUNNER.get(runner)
  return tree ? stripWithTree(item, tree) : item
}

function stripInstalled(item: unknown, tree: KeyTree): unknown {
  return isPlainObject(item) ? stripWithTree(item, tree) : item
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

const libraryChain = (
  id: string,
  keys: readonly string[],
  stripItem: (item: unknown) => unknown
): readonly Migration[] => [
  { id, to: 2, run: (file) => stripArrays(file, keys, stripItem) }
]

export const steamLibraryChain = libraryChain(
  'steam-library-v1-v2',
  ['games'],
  (i) => stripUndeclaredGameInfoKeys(i, 'steam')
)

export const gogLibraryChain = libraryChain(
  'gog-library-v1-v2',
  ['games'],
  (i) => stripUndeclaredGameInfoKeys(i, 'gog')
)

export const gogInstalledChain = libraryChain(
  'gog-installed-v1-v2',
  ['installed'],
  (i) => stripInstalled(i, GOG_INSTALLED_TREE)
)

export const legendaryLibraryChain = libraryChain(
  'legendary-library-v1-v2',
  ['library'],
  (i) => stripUndeclaredGameInfoKeys(i, 'legendary')
)

export const nileLibraryChain = libraryChain(
  'nile-library-v1-v2',
  ['library'],
  (i) => stripUndeclaredGameInfoKeys(i, 'nile')
)

// `sideload_apps/library` is unstamped on disk; the engine prepends the identity v0 -> v1 step.
export const sideloadLibraryChain: readonly Migration[] = [
  {
    id: 'sideload-library-v1-v2',
    to: 2,
    run: (file) => {
      const games = stripArrays(file, ['games'], (i) =>
        stripUndeclaredGameInfoKeys(i, 'sideload')
      )
      return stripArrays(games, ['installed'], (i) =>
        stripInstalled(i, SIDELOAD_INSTALLED_TREE)
      )
    }
  }
]

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
  'download-manager-v1-v2',
  ['queue', 'finished'],
  stripDownloadElement
)
