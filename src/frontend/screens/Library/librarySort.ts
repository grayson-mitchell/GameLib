/**
 * Library sort model (quick 261027-jjz; group-by removed by operator request
 * in quick 261029-quw).
 *
 * Implements slice 1 of
 * `.planning/todos/pending/2026-10-03-library-sorting-is-title-only-add-a-sort-field-menu-playnite.md`.
 * Its `## Decisions (operator, 2026-10-27)` section is locked: three sort
 * fields (Name / Last played / Install size) and direction. The SEPARATE
 * group-by it also locked has since been removed: persisted `libraryGroupBy`
 * and legacy `sortInstalled` keys are now ignored, so nobody is stranded in a
 * grouping the UI can no longer change.
 *
 * Last played has a different meaning per runner and the operator accepted
 * that knowingly: Steam reads Steam's own `extra.steamLastPlayed` ("played
 * anywhere", Unix seconds); every other runner reads GameLib's own timestamp
 * store (ISO, "last launched from GameLib"). Both are normalised to epoch ms.
 * The timestamp store is never read for Steam.
 *
 * A fourth field, Metacritic, was added by operator request in quick
 * 261029-sbi. Its sources are Steam's own score on `GameInfo.metacritic_score`
 * first, then a PCGamingWiki score already in the wiki cache. It is never
 * fetched for a sort; an unknown score sorts last.
 *
 * Pure: no React, no window, no store imports, so a node jest test covers it.
 * (`common/metacriticScore` is a pure common module.)
 */

import type { GameInfo } from 'common/types'
import { parseMetacriticScore } from 'common/metacriticScore'

export type LibrarySortField =
  | 'name'
  | 'lastPlayed'
  | 'installSize'
  | 'metacritic'
export type LibrarySortDirection = 'asc' | 'desc'

export const LIBRARY_SORT_FIELDS: readonly LibrarySortField[] = [
  'name',
  'lastPlayed',
  'installSize',
  'metacritic'
]
const LIBRARY_SORT_DIRECTIONS: readonly LibrarySortDirection[] = ['asc', 'desc']

export const LIBRARY_SORT_FIELD_KEY = 'librarySortField'
export const LIBRARY_SORT_DIRECTION_KEY = 'librarySortDirection'
export const LEGACY_SORT_DESCENDING_KEY = 'sortDescending'

interface LibrarySortPrefs {
  field: LibrarySortField
  direction: LibrarySortDirection
}

export const DEFAULT_LIBRARY_SORT_PREFS: LibrarySortPrefs = {
  field: 'name',
  direction: 'asc'
}

/**
 * The direction a field starts in when the user switches to it: Name reads
 * A to Z, Last played shows the most recent first, Install size the largest
 * first, Metacritic the highest score first. The direction button still flips
 * it afterwards.
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

    return { field, direction }
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

/**
 * Score for a game: Steam's own (re-validated, so a corrupt cached number
 * cannot rank), else a PCGamingWiki score already in the wiki cache by title.
 */
export function metacriticScoreOf(
  game: GameInfo,
  wikiMetacriticByTitle: Readonly<Record<string, number | undefined>>
): number | undefined {
  return (
    parseMetacriticScore(game.metacritic_score) ??
    wikiMetacriticByTitle[game.title]
  )
}

/**
 * title -> score from cached wiki entries. `readEntry` returns the raw cached
 * WikiInfo (untrusted shape), so it is narrowed defensively here. Keyed by the
 * raw `game.title`.
 */
export function buildWikiMetacriticByTitle(
  games: readonly GameInfo[],
  readEntry: (title: string) => unknown
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const g of games) {
    const entry = readEntry(g.title)
    if (typeof entry !== 'object' || entry === null) continue
    const wiki = (entry as { pcgamingwiki?: unknown }).pcgamingwiki
    if (typeof wiki !== 'object' || wiki === null) continue
    const meta = (wiki as { metacritic?: unknown }).metacritic
    if (typeof meta !== 'object' || meta === null) continue
    const score = parseMetacriticScore((meta as { score?: unknown }).score)
    if (score !== undefined) out[g.title] = score
  }
  return out
}

interface SortOptions {
  field: LibrarySortField
  direction: LibrarySortDirection
  nonSteamLastPlayedIso: Readonly<Record<string, string | undefined>>
  wikiMetacriticByTitle?: Readonly<Record<string, number | undefined>>
}

export function sortLibrary(
  games: readonly GameInfo[],
  opts: SortOptions
): GameInfo[] {
  const { field, direction, nonSteamLastPlayedIso, wikiMetacriticByTitle } =
    opts
  const sign = direction === 'desc' ? -1 : 1

  const titleKey = new Map<GameInfo, string>()
  const numKey = new Map<GameInfo, number | undefined>()
  for (const g of games) {
    titleKey.set(g, librarySortTitle(g))
    if (field === 'lastPlayed')
      numKey.set(g, lastPlayedMs(g, nonSteamLastPlayedIso))
    else if (field === 'installSize') numKey.set(g, installSizeBytes(g))
    else if (field === 'metacritic')
      numKey.set(g, metacriticScoreOf(g, wikiMetacriticByTitle ?? {}))
  }
  const byTitle = (a: GameInfo, b: GameInfo) =>
    (titleKey.get(a) as string).localeCompare(titleKey.get(b) as string)
  // Identical title keys (e.g. one game owned on Steam and GOG) fall back to a
  // fixed, always-ascending identity order instead of library merge order.
  const byIdentity = (a: GameInfo, b: GameInfo) =>
    a.runner.localeCompare(b.runner) || a.app_name.localeCompare(b.app_name)

  const sorted = [...games].sort((a, b) => {
    if (field === 'name') return sign * byTitle(a, b) || byIdentity(a, b)
    const av = numKey.get(a)
    const bv = numKey.get(b)
    if (av === undefined && bv === undefined)
      return byTitle(a, b) || byIdentity(a, b)
    if (av === undefined) return 1
    if (bv === undefined) return -1
    if (av !== bv) return sign * (av - bv)
    return byTitle(a, b) || byIdentity(a, b)
  })

  return sorted
}
