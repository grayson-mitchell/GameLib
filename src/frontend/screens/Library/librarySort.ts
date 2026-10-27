/**
 * Library sort / group model (quick 261027-jjz).
 *
 * Implements slice 1 of
 * `.planning/todos/pending/2026-10-03-library-sorting-is-title-only-add-a-sort-field-menu-playnite.md`.
 * Its `## Decisions (operator, 2026-10-27)` section is locked: three sort
 * fields (Name / Last played / Install size), direction, and a SEPARATE
 * group-by (None / Install status / Store).
 *
 * Last played has a different meaning per runner and the operator accepted
 * that knowingly: Steam reads Steam's own `extra.steamLastPlayed` ("played
 * anywhere", Unix seconds); every other runner reads GameLib's own timestamp
 * store (ISO, "last launched from GameLib"). Both are normalised to epoch ms.
 * The timestamp store is never read for Steam.
 *
 * Pure: no React, no window, no store imports, so a node jest test covers it.
 */

import type { GameInfo } from 'common/types'
import { RunnerToStore } from './facetLabels'

export type LibrarySortField = 'name' | 'lastPlayed' | 'installSize'
export type LibrarySortDirection = 'asc' | 'desc'
export type LibraryGroupBy = 'none' | 'installStatus' | 'store'

export const LIBRARY_SORT_FIELDS: readonly LibrarySortField[] = [
  'name',
  'lastPlayed',
  'installSize'
]
export const LIBRARY_GROUP_BYS: readonly LibraryGroupBy[] = [
  'none',
  'installStatus',
  'store'
]
const LIBRARY_SORT_DIRECTIONS: readonly LibrarySortDirection[] = ['asc', 'desc']

export const LIBRARY_SORT_FIELD_KEY = 'librarySortField'
export const LIBRARY_SORT_DIRECTION_KEY = 'librarySortDirection'
export const LIBRARY_GROUP_BY_KEY = 'libraryGroupBy'
export const LEGACY_SORT_DESCENDING_KEY = 'sortDescending'
export const LEGACY_SORT_INSTALLED_KEY = 'sortInstalled'

interface LibrarySortPrefs {
  field: LibrarySortField
  direction: LibrarySortDirection
  groupBy: LibraryGroupBy
}

export const DEFAULT_LIBRARY_SORT_PREFS: LibrarySortPrefs = {
  field: 'name',
  direction: 'asc',
  groupBy: 'installStatus'
}

/**
 * The direction a field starts in when the user switches to it: Name reads
 * A to Z, Last played shows the most recent first, Install size the largest
 * first. The direction button still flips it afterwards.
 */
export function defaultDirectionFor(
  field: LibrarySortField
): LibrarySortDirection {
  return field === 'name' ? 'asc' : 'desc'
}

function oneOf<T extends string>(
  list: readonly T[],
  raw: string
): T | undefined {
  return (list as readonly string[]).includes(raw) ? (raw as T) : undefined
}

export function readLibrarySortPrefs(
  storage: Pick<Storage, 'getItem'>
): LibrarySortPrefs {
  try {
    const rawField = storage.getItem(LIBRARY_SORT_FIELD_KEY)
    const rawDirection = storage.getItem(LIBRARY_SORT_DIRECTION_KEY)
    const rawGroupBy = storage.getItem(LIBRARY_GROUP_BY_KEY)
    const D = DEFAULT_LIBRARY_SORT_PREFS

    const field =
      rawField === null
        ? D.field
        : (oneOf(LIBRARY_SORT_FIELDS, rawField) ?? D.field)

    let direction: LibrarySortDirection
    if (rawDirection !== null) {
      direction = oneOf(LIBRARY_SORT_DIRECTIONS, rawDirection) ?? D.direction
    } else {
      const legacy = storage.getItem(LEGACY_SORT_DESCENDING_KEY)
      direction =
        legacy === 'true' ? 'desc' : legacy === 'false' ? 'asc' : D.direction
    }

    let groupBy: LibraryGroupBy
    if (rawGroupBy !== null) {
      groupBy = oneOf(LIBRARY_GROUP_BYS, rawGroupBy) ?? D.groupBy
    } else {
      const legacy = storage.getItem(LEGACY_SORT_INSTALLED_KEY)
      groupBy =
        legacy === 'false'
          ? 'none'
          : legacy === 'true'
            ? 'installStatus'
            : D.groupBy
    }
    return { field, direction, groupBy }
  } catch {
    return { ...DEFAULT_LIBRARY_SORT_PREFS }
  }
}

function safeWrite(
  storage: Pick<Storage, 'setItem'>,
  key: string,
  value: string
): void {
  try {
    storage.setItem(key, value)
  } catch {
    // A full or blocked storage must not break sorting; the choice just won't persist.
  }
}

export function writeLibrarySortField(
  storage: Pick<Storage, 'setItem'>,
  v: LibrarySortField
): void {
  safeWrite(storage, LIBRARY_SORT_FIELD_KEY, v)
}
export function writeLibrarySortDirection(
  storage: Pick<Storage, 'setItem'>,
  v: LibrarySortDirection
): void {
  safeWrite(storage, LIBRARY_SORT_DIRECTION_KEY, v)
}
export function writeLibraryGroupBy(
  storage: Pick<Storage, 'setItem'>,
  v: LibraryGroupBy
): void {
  safeWrite(storage, LIBRARY_GROUP_BY_KEY, v)
}

const SIZE_UNITS: Record<string, number> = {
  B: 1,
  BYTES: 1,
  KIB: 1024,
  KB: 1024,
  MIB: 1024 ** 2,
  MB: 1024 ** 2,
  GIB: 1024 ** 3,
  GB: 1024 ** 3,
  TIB: 1024 ** 4,
  TB: 1024 ** 4,
  PIB: 1024 ** 5,
  PB: 1024 ** 5
}
const SIZE_RE = /^(\d+(?:\.\d+)?)\s*([a-z]+)?$/i

/**
 * Bytes from the backend's `getFileSize` output ('4.66 GiB'). Zero and
 * anything unparseable are unknown (undefined): a 0-byte install is a missing
 * measurement and must not sort as the smallest real size.
 */
export function parseInstallSize(raw: unknown): number | undefined {
  if (typeof raw !== 'string') return undefined
  const match = SIZE_RE.exec(raw.trim())
  if (!match) return undefined
  const unit = match[2] === undefined ? 1 : SIZE_UNITS[match[2].toUpperCase()]
  if (unit === undefined) return undefined
  const bytes = Number(match[1]) * unit
  return Number.isFinite(bytes) && bytes > 0 ? bytes : undefined
}

/**
 * Exactly the grid's historical title key (unanchored first `THE `, which the
 * todo calls a "leading THE"; the code has always been unanchored and
 * behaviour-preservation wins). The ONE definition: `focusRowTitleComparator`
 * calls this too, so the focus row and the grid cannot drift apart.
 */
export function librarySortTitle(game: GameInfo): string {
  return game.title.toUpperCase().replace('THE ', '')
}

export function lastPlayedMs(
  game: GameInfo,
  nonSteamLastPlayedIso: Readonly<Record<string, string | undefined>>
): number | undefined {
  if (game.runner === 'steam') {
    const seconds = game.extra?.steamLastPlayed
    return typeof seconds === 'number' &&
      Number.isFinite(seconds) &&
      seconds > 0
      ? seconds * 1000
      : undefined
  }
  const iso = nonSteamLastPlayedIso[game.app_name]
  if (!iso) return undefined
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : undefined
}

function installSizeBytes(game: GameInfo): number | undefined {
  if (!game.is_installed) return undefined
  return parseInstallSize(game.install?.install_size)
}

interface SortAndGroupOptions {
  field: LibrarySortField
  direction: LibrarySortDirection
  groupBy: LibraryGroupBy
  installing: readonly string[]
  nonSteamLastPlayedIso: Readonly<Record<string, string | undefined>>
}

export function sortAndGroupLibrary(
  games: readonly GameInfo[],
  opts: SortAndGroupOptions
): GameInfo[] {
  const { field, direction, groupBy, installing, nonSteamLastPlayedIso } = opts
  const sign = direction === 'desc' ? -1 : 1

  const titleKey = new Map<GameInfo, string>()
  const numKey = new Map<GameInfo, number | undefined>()
  for (const g of games) {
    titleKey.set(g, librarySortTitle(g))
    if (field === 'lastPlayed')
      numKey.set(g, lastPlayedMs(g, nonSteamLastPlayedIso))
    else if (field === 'installSize') numKey.set(g, installSizeBytes(g))
  }
  const byTitle = (a: GameInfo, b: GameInfo) =>
    (titleKey.get(a) as string).localeCompare(titleKey.get(b) as string)

  const sorted = [...games].sort((a, b) => {
    if (field === 'name') return sign * byTitle(a, b)
    const av = numKey.get(a)
    const bv = numKey.get(b)
    if (av === undefined && bv === undefined) return byTitle(a, b)
    if (av === undefined) return 1
    if (bv === undefined) return -1
    if (av !== bv) return sign * (av - bv)
    return byTitle(a, b)
  })

  if (groupBy === 'none') return sorted

  if (groupBy === 'installStatus') {
    const installed: GameInfo[] = []
    const installingGames: GameInfo[] = []
    const notInstalled: GameInfo[] = []
    for (const g of sorted) {
      if (g.is_installed) installed.push(g)
      else if (installing.includes(g.app_name)) installingGames.push(g)
      else notInstalled.push(g)
    }
    return [...installed, ...installingGames, ...notInstalled]
  }

  // store: named stores by display name, then unnamed runners by runner id.
  const groups = new Map<string, GameInfo[]>()
  for (const g of sorted) {
    const list = groups.get(g.runner)
    if (list) list.push(g)
    else groups.set(g.runner, [g])
  }
  const runners = [...groups.keys()].sort((a, b) => {
    const an = RunnerToStore[a]
    const bn = RunnerToStore[b]
    if (an && bn) return an.localeCompare(bn)
    if (an) return -1
    if (bn) return 1
    return a.localeCompare(b)
  })
  return runners.flatMap((r) => groups.get(r) as GameInfo[])
}
