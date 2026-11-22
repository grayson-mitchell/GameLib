/**
 * The TS-mirror deletion schedule (Phase 85, D-19 / SC5).
 *
 * From Phase 85 the Rust `StoreHost` owns every persisted store, and the TS store classes are a
 * write-through mirror kept only for the TS consumers that still read them. Each mirror is deleted
 * in the slice that ports its last TS consumer: the "TS mirror deleted" column of
 * `.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md`
 * (Persisted stores). SCHEDULE below is that column, copied, plus the two settings documents, whose
 * cells live in the same file's "Persisted state outside the store registry" notes.
 *
 * Phase 85 executes only the deletions due in 85 (D-19): `migrationsStore`'s mirror, with the TS
 * migration system (D-06). This suite fails if:
 *   - a store due after 85 has lost its TS registration (registeredStores.json) or its documented
 *     TS class (a mirror deleted early strands its remaining consumers);
 *   - a store due at or before 85 still has one (`migrationsStore`, and `uploadedLogs` from 84);
 *   - the schedule and the ownership table disagree, or a registered store has no schedule row.
 *
 * A slice that deletes a mirror moves the store's row here and in 82-STATE-OWNERSHIP.md together.
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const ROOT = join(__dirname, '..', '..', '..')
const OWNERSHIP_DOC =
  '.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md'
const REGISTERED = 'src/backend/stores/__tests__/fixtures/registeredStores.json'

/** The phase this plan runs in: mirrors due here are gone, mirrors due later must still exist. */
const CURRENT_PHASE = 85

/** Store (TS name) -> the slice that deletes its TS mirror (82-STATE-OWNERSHIP.md). */
const SCHEDULE: Readonly<Record<string, number>> = {
  configStore: 98,
  timestampStore: 94,
  // R2: steamConfigStore and steamBottleConfigStore are one file; the file's mirror lives to 96.
  steamConfigStore: 90,
  steamBottleConfigStore: 96,
  gogConfigStore: 92,
  gogInstalledGamesStore: 92,
  gogSyncStore: 92,
  gogPrivateBranches: 92,
  nileConfigStore: 92,
  legendaryConfigStore: 91,
  sideloadedStore: 92,
  humbleConfigStore: 94,
  downloadManager: 93,
  gameOverridesStore: 86,
  migrationsStore: 85,
  wineDownloaderInfoStore: 87,
  macArchStore: 86,
  runsForMeStore: 86,
  uploadedLogs: 84,
  steam_library: 89,
  gog_library: 92,
  legendary_library: 91,
  nile_library: 92,
  steam_metadata: 89,
  steam_sync: 89,
  steam_pending_adoption: 90,
  steam_update_prompt_ack: 90,
  steam_known_fix_reports: 97,
  steam_direct_launch_verdict: 90,
  steam_engine_notices: 87,
  gog_api_info: 92,
  gog_achievements: 92,
  gog_install_info: 92,
  gog_playtime_sync_queue: 92,
  nile_install_info: 92,
  legendary_install_info: 91,
  legendary_games_override: 91,
  legendary_gameinfo: 91,
  humble_library: 94,
  humble_sync: 94,
  humble_revealed: 94,
  humble_ownership_override: 94,
  humble_gifted_at: 94,
  humble_audit: 94,
  humble_local_redeemed: 94,
  humble_notified_expiration: 94,
  humble_settle_declined: 94,
  humble_steam_appid: 94,
  crossover_index: 86,
  itad_prices: 86,
  itad_steam_gids: 86,
  pci_ids_device: 87,
  pci_ids_vendor: 87,
  wikigameinfo: 86,
  umu: 87
}

/**
 * The settings documents (`<appFolder>/config.json` and `GamesConfig/<app>.json`): not registry
 * stores, so their deletion cells are in the ownership table's notes. R3: their last TS readers (the
 * config.json-wins settings resync and the settingChanged bus) port at the shell cutover, 98.
 */
const SETTINGS_SCHEDULE: Readonly<Record<string, number>> = {
  'settings/global': 98,
  'GamesConfig/*': 98
}

/** The ownership table's row name for each settings document. */
const SETTINGS_OWNERSHIP_ROW: Readonly<Record<string, string>> = {
  'settings/global': 'global-config',
  'GamesConfig/*': 'games-config'
}

/**
 * TS mirrors no registration in registeredStores.json reaches, named by the class or construction
 * that is the mirror. The two caches are CacheStores built through a helper the registration scan
 * does not see; the settings documents are the config classes.
 */
const DOCUMENTED_CLASSES: Readonly<
  Record<string, { file: string; code: string }>
> = {
  steam_update_prompt_ack: {
    file: 'src/backend/storeManagers/steam/stores.ts',
    code: "'steam_update_prompt_ack'"
  },
  steam_engine_notices: {
    file: 'src/backend/engine/engineNoticeStore.ts',
    code: "new CacheStore<unknown>('steam_engine_notices'"
  },
  'settings/global': {
    file: 'src/backend/config.ts',
    code: 'abstract class GlobalConfig'
  },
  'GamesConfig/*': {
    file: 'src/backend/game_config.ts',
    code: 'abstract class GameConfig'
  }
}

/** Measured 2026-11-22 (85-21): 55 registry rows plus 2 settings documents. Never lower it. */
const SCHEDULE_FLOOR = 50

interface Registration {
  registeredAs: string | null
  options: { name?: string }
}

/** The TS name a registration is known by (a CacheStore by its file name). */
function registeredNames(registrations: readonly Registration[]): Set<string> {
  return new Set(
    registrations.map((r) => r.registeredAs ?? r.options.name ?? 'config')
  )
}

/** Whether a documented TS class still exists: its code, comments stripped, in its file. */
function hasDocumentedClass(entry: { file: string; code: string }): boolean {
  const path = join(ROOT, entry.file)
  return (
    existsSync(path) &&
    stripSourceComments(readFileSync(path, 'utf8')).includes(entry.code)
  )
}

/** Whether `store`'s TS mirror still exists, by registration or by documented class. */
function mirrorExists(store: string, registered: ReadonlySet<string>): boolean {
  if (registered.has(store)) return true
  const doc = DOCUMENTED_CLASSES[store]
  return doc !== undefined && hasDocumentedClass(doc)
}

/** Mirrors on the wrong side of the current phase (empty when the schedule holds). */
function scheduleViolations(
  schedule: Readonly<Record<string, number>>,
  registered: ReadonlySet<string>,
  phase: number
): string[] {
  const out: string[] = []
  for (const [store, due] of Object.entries(schedule)) {
    const exists = mirrorExists(store, registered)
    if (due > phase && !exists) out.push(`${store}: due ${due}, mirror missing`)
    if (due <= phase && exists)
      out.push(`${store}: due ${due}, mirror still present`)
  }
  return out
}

/** Cells of a markdown table row, trimmed, with backticks dropped. */
function cells(line: string): string[] {
  return line
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim().replace(/`/g, ''))
}

/** The "Persisted stores" table of the ownership doc: store -> its "TS mirror deleted" phase. */
function ownershipDocSchedule(doc: string): Record<string, number> {
  const start = doc.indexOf('## Persisted stores')
  const end = doc.indexOf('### Persisted state outside the store registry')
  if (start < 0 || end < start) throw new Error('ownership doc sections moved')
  const lines = doc
    .slice(start, end)
    .split('\n')
    .filter((l) => l.startsWith('|'))
  const header = cells(lines[0] ?? '')
  const col = header.indexOf('TS mirror deleted')
  if (col < 0) throw new Error('no "TS mirror deleted" column')
  const out: Record<string, number> = {}
  for (const line of lines.slice(2)) {
    const row = cells(line)
    out[row[0] ?? ''] = Number(row[col])
  }
  return out
}

/** The notes cell of a row in "Persisted state outside the store registry". */
function outsideRegistryNotes(doc: string, rowName: string): string {
  const start = doc.indexOf('### Persisted state outside the store registry')
  const end = doc.indexOf('## In-memory owners')
  const line = doc
    .slice(start, end)
    .split('\n')
    .find((l) => l.startsWith(`| \`${rowName}\` |`))
  return line === undefined ? '' : (cells(line).at(-1) ?? '')
}

describe('TS-mirror deletion schedule (D-19)', () => {
  const registrations = JSON.parse(
    readFileSync(join(ROOT, REGISTERED), 'utf8')
  ) as Registration[]
  const registered = registeredNames(registrations)
  const doc = readFileSync(join(ROOT, OWNERSHIP_DOC), 'utf8')

  it('pins a row for every persisted store and both settings documents', () => {
    assertAtOrAboveFloor(
      'storeMirrorSchedule rows',
      Object.keys(SCHEDULE).length + Object.keys(SETTINGS_SCHEDULE).length,
      SCHEDULE_FLOOR
    )
  })

  it('equals the "TS mirror deleted" column of 82-STATE-OWNERSHIP.md', () => {
    expect(ownershipDocSchedule(doc)).toEqual(SCHEDULE)
  })

  it.each(Object.entries(SETTINGS_SCHEDULE))(
    '%s is due at %d in the ownership notes (R3)',
    (docKey, due) => {
      const row = SETTINGS_OWNERSHIP_ROW[docKey] ?? ''
      const notes = outsideRegistryNotes(doc, row)
      expect(notes).toContain(`TS mirror deleted: ${due}`)
      expect(notes).toContain('R3')
    }
  )

  it('every registered store has a schedule row', () => {
    const unscheduled = [...registered].filter((n) => !(n in SCHEDULE))
    expect(unscheduled).toEqual([])
  })

  it(`every mirror due after ${CURRENT_PHASE} still exists and none due by ${CURRENT_PHASE} does`, () => {
    expect(
      scheduleViolations(
        { ...SCHEDULE, ...SETTINGS_SCHEDULE },
        registered,
        CURRENT_PHASE
      )
    ).toEqual([])
  })

  it('the migrations store has no registration and no TS class (D-06)', () => {
    expect(registered.has('migrationsStore')).toBe(false)
    expect(registrations.some((r) => r.options.name === 'migrations')).toBe(
      false
    )
    expect(DOCUMENTED_CLASSES['migrationsStore']).toBeUndefined()
  })

  it('every documented TS class names a real construction today', () => {
    for (const [store, entry] of Object.entries(DOCUMENTED_CLASSES)) {
      expect([store, hasDocumentedClass(entry)]).toEqual([store, true])
    }
  })

  it('self-test: a store due later with no mirror, and a store due now with one, both fail', () => {
    const fake = new Set(['configStore', 'migrationsStore'])
    expect(
      scheduleViolations(
        { configStore: 98, gogConfigStore: 92, migrationsStore: 85 },
        fake,
        CURRENT_PHASE
      )
    ).toEqual([
      'gogConfigStore: due 92, mirror missing',
      'migrationsStore: due 85, mirror still present'
    ])
  })

  it('self-test: the doc parser reads a store row and its phase', () => {
    const fixture = [
      '## Persisted stores',
      '',
      '| store | kind | TS mirror deleted | notes |',
      '| --- | --- | --- | --- |',
      '| `configStore` | user-state | 98 | x |',
      '',
      '### Persisted state outside the store registry',
      '',
      '| state | notes |',
      '| --- | --- |',
      '| `global-config` | TS mirror deleted: 98 (R3) |',
      '',
      '## In-memory owners'
    ].join('\n')
    expect(ownershipDocSchedule(fixture)).toEqual({ configStore: 98 })
    expect(outsideRegistryNotes(fixture, 'global-config')).toBe(
      'TS mirror deleted: 98 (R3)'
    )
  })
})
