/**
 * The per-slice delete gate shared by the Phase 86 `infoPortComplete.test.ts` and the Phase 87
 * `engineWinePortComplete.test.ts` (87-03). Extracted unchanged in behaviour from the 86 gate: a
 * `SliceSpec` says what a port deleted, and `runSlice` turns it into the checks that fail if a deleted
 * TS file returns, a deleted identifier is named in non-test code, a TS `ipc.handle` or `ipc.on`
 * registers one of the slice's native channels, a rollback flag string appears anywhere under src/ or
 * src-tauri/src (no flag helper is built), or a store row the Rust host still needs is dropped from
 * storeTable.json.
 *
 * Like `infoPortGate`, this file lives outside `__tests__` so jest never runs it, and it names no
 * slice, channel or flag of its own: every name arrives in a `SliceSpec`. It reads the jest globals
 * (`it`, `expect`) the calling test file provides, and walks the repo once per importing test file.
 *
 * Floors (82 D-05). Measured 2026-11-22 (86-05, after the images_cache deletion) over non-test
 * .ts/.tsx/.rs files under src/ and meta/: 1329 files. The floor sits well under that so the later
 * 87-99 deletions cannot trip it; it only has to prove the walk read a real tree. Never lower it to
 * make a red run green. src-tauri/src held 66 .rs files and src/backend 612 .ts/.tsx files.
 */
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import {
  assertDeleted,
  assertKept,
  findIdentifiers,
  findRollbackFlag,
  findTsRegistrations,
  REPO_ROOT,
  walkStripped
} from 'backend/testUtils/infoPortGate'
import type { StrippedFile } from 'backend/testUtils/infoPortGate'
import { readFileSync } from 'fs'
import { join } from 'path'

export const SCANNED_FILES_FLOOR = 800
export const RUST_FILES_FLOOR = 40
export const BACKEND_FILES_FLOOR = 400

export interface SliceSpec {
  /** Repo-relative TS files the port deleted. */
  deleted: readonly string[]
  /** Repo-relative paths that must survive the deletion (golden fixtures, kept modules). */
  kept?: readonly string[]
  /** Identifiers deleted with the slice; none may be named in non-test code under `identifierRoot`. */
  forbiddenIdentifiers: readonly string[]
  identifierRoot: string
  /** The rollback flag no fallback window was named for (D-13). */
  flag: string
  /** A manifest slice whose native channels must have no TS `ipc.handle` or `ipc.on`. */
  manifestSlice?: string
  /** The measured channel count of `manifestSlice`; the check fails below it. */
  channelsFloor?: number
  /** `storeTable.json` row keys that must outlive the TS store registration (D-29 row 5). */
  storeRowKeys?: readonly string[]
}

interface Manifest {
  channels: Record<string, { slice: string }>
}

const manifest = JSON.parse(
  readFileSync(
    join(REPO_ROOT, 'src', 'common', 'types', 'ipc', 'nativeChannels.json'),
    'utf8'
  )
) as Manifest

export const storeTable = JSON.parse(
  readFileSync(
    join(REPO_ROOT, 'src', 'common', 'types', 'ipc', 'storeTable.json'),
    'utf8'
  )
) as { rows: { key: string; kind: string; tsNames: string[] }[] }
export const storeTableKeys = storeTable.rows.map((r) => r.key)

export const tsWalk = walkStripped(['src', 'meta'])
export const flagWalk = walkStripped(['src', 'src-tauri/src'])
export const rustWalk = walkStripped(['src-tauri/src'], { ext: /\.rs$/ })

export const channelsOf = (slice: string): string[] =>
  Object.entries(manifest.channels)
    .filter(([, spec]) => spec.slice === slice)
    .map(([name]) => name)

/** Row keys in `wanted` that `table` does not list. */
export function missingStoreRows(
  table: readonly string[],
  wanted: readonly string[]
): string[] {
  return wanted.filter((k) => !table.includes(k))
}

export function runSlice(spec: SliceSpec): void {
  const underRoot: StrippedFile[] = tsWalk.files.filter((f) =>
    f.path.startsWith(`${spec.identifierRoot}/`)
  )

  // A sub-slice may delete no file (87-24: the wine core's TS reach is one shim and three scheduled
  // twins, none removed outright); jest refuses an empty `it.each` table, so the two lists that can be
  // empty are guarded, and that sub-slice's own describe states what it deleted by explicit assertion.
  if (spec.deleted.length > 0) {
    it.each(spec.deleted)('%s is deleted', (p) => {
      expect(() => assertDeleted([p])).not.toThrow()
    })
  }

  if (spec.kept && spec.kept.length > 0) {
    it.each(spec.kept)('%s is kept', (p) => {
      expect(() => assertKept([p])).not.toThrow()
    })
  }

  if (spec.forbiddenIdentifiers.length > 0) {
    it.each(spec.forbiddenIdentifiers)(
      `non-test code under ${spec.identifierRoot} never names %s`,
      (id) => {
        expect(findIdentifiers(underRoot, [id])).toEqual([])
      }
    )
  }

  if (spec.manifestSlice !== undefined) {
    const slice = spec.manifestSlice
    const channels = channelsOf(slice)
    it(`the ${slice} slice names at least ${spec.channelsFloor ?? 1} native channels`, () => {
      assertAtOrAboveFloor(
        `${slice} slice channels`,
        channels.length,
        spec.channelsFloor ?? 1
      )
    })
    it.each(channels)(
      `${slice}-slice channel %s has no sidecar ipc.on or ipc.handle`,
      (name) => {
        expect(findTsRegistrations(tsWalk.files, [name])).toEqual([])
      }
    )
  }

  if (spec.storeRowKeys && spec.storeRowKeys.length > 0) {
    it.each(spec.storeRowKeys)(
      'storeTable.json still lists the %s row',
      (key) => {
        expect(missingStoreRows(storeTableKeys, [key])).toEqual([])
      }
    )
  }

  it(`no ${spec.flag} rollback flag text survives in src/ or src-tauri/src`, () => {
    // The gate test files name the flag to forbid it, and live under __tests__ (not walked).
    expect(findRollbackFlag(flagWalk.files, spec.flag)).toEqual([])
  })
}
