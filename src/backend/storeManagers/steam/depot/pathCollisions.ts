// debug/steam-depot-unclassified-generic-error: cross-depot path collisions.
//
// A DepotPlan unions the files of EVERY selected depot and writes them all into
// ONE `installRoot`. Nothing in the manifest format prevents two depots from
// claiming the SAME path with INCOMPATIBLE types, and Valve ships exactly that:
//
//   Fallout 2 (38410), verified against live PICS + manifests 2026-09-07
//     depot 38414 (common)  `master.dat`  size=0  chunks=0  flags=64 (Directory)
//     depot 38415 (english) `master.dat`  size=333,177,805  chunks=318  flags=0
//
// Both depots are CORRECTLY selected — `selectAllDepots` was verified against
// Steam's own rules and picks exactly what the real client installs for an
// English install (38411-38413 fail ownership, 38416/38417 fail the language
// filter, 228990/229002 are `sharedinstall` redistributables). So the union is
// right and the clash is real data, not a selection bug.
//
// Left unresolved, whichever entry the concurrent write loop reaches first
// wins: when the Directory entry won, `mkdir()` created `master.dat/`, the
// 333MB file's `open(dest, 'w')` then failed EISDIR, and — matching no
// signature in classifyDepotError's alternation — the install surfaced the
// UNCLASSIFIED "The Steam download failed." with a 56% install left on disk.
//
// Real Steam installs BOTH depots and ends up with `master.dat` as a FILE, so
// it resolves the clash in favour of the file. This module does the same, and
// deliberately does no more than that: only a size-0/chunks-0 Directory entry
// losing to a real file is auto-resolved. Any other collision is REPORTED and
// left alone rather than silently picking a winner.

import { stat as fsStat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { DepotPlan, DepotPlanFile } from '../depot'

/** EDepotFileFlag.Directory — same value depot.ts and reconcile.ts use. */
const DIRECTORY_FLAG = 64

// Not exported: verified to have no importer anywhere -- not in any tracked .ts/.tsx
// file (`pnpm find-deadcode` / ts-prune flagged the previously-exported form as an
// over-broad `export` keyword).
interface PathCollisionReport {
  /** Paths where a size-0/chunks-0 Directory entry was dropped in favour of a
   *  real file entry. One entry per PATH, not per dropped record. */
  resolved: string[]
  /** Paths claimed by more than one depot that this module refused to decide —
   *  e.g. two chunked file entries, or a Symlink against a file. Left in the
   *  plan EXACTLY as they were: reporting an ambiguous case is honest, and
   *  guessing a winner here would be the same class of silent corruption this
   *  module exists to remove. */
  unresolved: string[]
  /** Bytes of real-file entries dropped by the appinfo-order rule; the caller
   *  must subtract this from its already-summed totalBytes. Directory markers
   *  are size 0 and contribute nothing. */
  droppedBytes: number
}

/**
 * The path two manifest entries would land on, compared the same way the write
 * path derives it: `resolveContainedPath` normalises `\` to `/` before
 * resolving, so `sound\music\x.acm` and `sound/music/x.acm` are ONE path.
 *
 * Case is folded ONLY when the destination volume is case-insensitive
 * (APFS/NTFS defaults, and Wine bottles on them): there two differently-cased
 * claims write ONE file, so they are a real collision. On a case-sensitive
 * volume (typical Linux) they legitimately coexist, so folding there would
 * invent collisions. Observed by the 2026-10-25 scan: Wasteland 3 (198),
 * Californium (53), Civ V (4).
 */
export function pathCollisionKey(
  filename: string,
  caseInsensitive: boolean
): string {
  const n = filename.replace(/\\/g, '/')
  return caseInsensitive ? n.toLowerCase() : n
}

const swapCase = (s: string): string =>
  [...s]
    .map((c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()))
    .join('')

/**
 * Is the volume holding `dir` case-insensitive? Read-only: two stat calls on
 * the directory's own name and its case-swapped spelling, never a file
 * creation (the directory may be a user's real library). Equal dev+ino means
 * the swapped spelling reached the same entry. Anything inconclusive (no
 * letters in the name, the directory missing, EACCES) falls back to the
 * platform default: linux is case-sensitive, macOS/Windows default to
 * case-insensitive.
 */
export async function probeCaseInsensitiveVolume(
  dir: string,
  deps: { stat?: typeof fsStat; platform?: NodeJS.Platform } = {}
): Promise<boolean> {
  const doStat = deps.stat ?? fsStat
  const fallback = (deps.platform ?? process.platform) !== 'linux'
  const name = basename(dir)
  const swapped = swapCase(name)
  if (swapped === name) return fallback
  try {
    const orig = await doStat(dir)
    try {
      const alt = await doStat(join(dirname(dir), swapped))
      return alt.dev === orig.dev && alt.ino === orig.ino
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return false
      return fallback
    }
  } catch {
    return fallback
  }
}

/** A clean directory marker: the Directory bit AND no content whatsoever.
 *  A Directory-flagged entry that somehow carries bytes or chunks is NOT
 *  treated as droppable — it is not a marker, and discarding it could throw
 *  real content away. */
function isEmptyDirectoryEntry(f: DepotPlanFile): boolean {
  return (
    !!f.flags &&
    (f.flags & DIRECTORY_FLAG) !== 0 &&
    Number(f.size) === 0 &&
    f.chunks.length === 0
  )
}

/** Real content: something the download loop would actually write bytes for. */
function hasContent(f: DepotPlanFile): boolean {
  return f.chunks.length > 0 || Number(f.size) > 0
}

/**
 * Resolve cross-depot path collisions IN PLACE on `plan.depots[].files`.
 *
 * Mutates rather than rebuilding because the plan is freshly constructed and
 * solely owned by `buildDepotPlan` at the single call site. Directory markers
 * are size 0, but a losing REAL file is not -- the caller subtracts the
 * returned `droppedBytes` from its already-summed totalBytes.
 *
 * Returns what it did so the caller can log it and tests can assert on it.
 */
export function resolveDepotPathCollisions(
  plan: Pick<DepotPlan, 'appId' | 'depots'>,
  opts: { caseInsensitive?: boolean } = {}
): PathCollisionReport {
  const caseInsensitive = !!opts.caseInsensitive
  const depotById = new Map(plan.depots.map((d) => [d.depotId, d]))
  // path -> every (depot, file) claiming it
  const byPath = new Map<string, { depotId: string; file: DepotPlanFile }[]>()

  for (const depot of plan.depots) {
    for (const file of depot.files) {
      const key = pathCollisionKey(file.filename, caseInsensitive)
      const bucket = byPath.get(key)
      if (bucket) bucket.push({ depotId: depot.depotId, file })
      else byPath.set(key, [{ depotId: depot.depotId, file }])
    }
  }

  const resolved: string[] = []
  const unresolved: string[] = []
  const drop = new Set<DepotPlanFile>()

  for (const [, claims] of byPath) {
    if (claims.length < 2) continue

    // Report/log with the first claim's un-folded spelling so case-sensitive
    // output is byte-identical to before.
    const path = pathCollisionKey(claims[0].file.filename, false)
    const spellings = new Map<string, string[]>()
    for (const c of claims) {
      const sp = pathCollisionKey(c.file.filename, false)
      spellings.set(sp, [...(spellings.get(sp) ?? []), c.depotId])
    }
    const caseNote =
      spellings.size > 1
        ? ` [case-only collision on a case-insensitive volume: ${[...spellings]
            .map(([sp, ids]) => `"${sp}" (depot ${ids.join(',')})`)
            .join(' vs ')}]`
        : ''

    const emptyDirs = claims.filter((c) => isEmptyDirectoryEntry(c.file))
    const content = claims.filter((c) => hasContent(c.file))

    // Bare directory markers only: one mkdir satisfies all of them on either
    // volume type, so this is not a collision. Silent.
    if (emptyDirs.length === claims.length) continue

    // The Fallout 2 shape: one or more bare directory markers against exactly
    // one real file. The file wins, matching the real Steam client's result.
    if (emptyDirs.length > 0 && content.length === 1) {
      for (const d of emptyDirs) drop.add(d.file)
      resolved.push(path)
      logWarning(
        `buildDepotPlan: appId=${plan.appId} cross-depot path collision on ` +
          `"${path}" — depot(s) ${emptyDirs
            .map((d) => d.depotId)
            .join(',')} declare it a Directory while depot ` +
          `${content[0].depotId} declares a file of ` +
          `${Number(content[0].file.size)} bytes (${content[0].file.chunks.length} chunks). ` +
          `Keeping the FILE and dropping the directory marker(s) — without this ` +
          `the directory can win the write race and the file fails EISDIR.` +
          caseNote,
        LogPrefix.Steam
      )
      continue
    }

    // debug/cross-depot-collision-1026: two or more REAL files. Observed rule
    // (XCOM 200510, depots 225341 vs 200522, repaired by the real Steam
    // client): the depot LATER in the app's raw appinfo `depots` order wins
    // and the earlier depot's file is not kept. Applied only when every
    // claimant has a recovered rank in the SAME app's appinfo; otherwise the
    // collision stays UNRESOLVED (the verifier's content-actually-written
    // fallback then applies). The rule rests on a single observed pair.
    if (emptyDirs.length === 0 && content.length === claims.length) {
      const ranked = claims.map((c) => ({
        c,
        entry: depotById.get(c.depotId)
      }))
      const owner = ranked[0].entry?.ownerAppId
      const orderKnown =
        owner !== undefined &&
        ranked.every(
          (r) =>
            r.entry?.ownerAppId === owner && r.entry.appinfoRank !== undefined
        ) &&
        new Set(ranked.map((r) => r.entry?.appinfoRank)).size === ranked.length
      if (orderKnown) {
        const winner = ranked.reduce((a, b) =>
          (b.entry?.appinfoRank ?? -1) > (a.entry?.appinfoRank ?? -1) ? b : a
        )
        const losers = ranked.filter((r) => r !== winner)
        for (const l of losers) drop.add(l.c.file)
        resolved.push(path)
        logWarning(
          `buildDepotPlan: appId=${plan.appId} RESOLVED cross-depot file ` +
            `collision on "${path}" — winner depot ${winner.c.depotId} ` +
            `(size=${Number(winner.c.file.size)}, appinfo rank ` +
            `${winner.entry?.appinfoRank}), dropped depot(s) ` +
            `${losers.map((l) => `${l.c.depotId} (size=${Number(l.c.file.size)}, rank ${l.entry?.appinfoRank})`).join(', ')} ` +
            `by rule "later in the app's appinfo depot order wins".` +
            caseNote,
          LogPrefix.Steam
        )
        continue
      }
    }

    // Anything else — two real files, a symlink against a file, several
    // content entries — is NOT decided here. Report it and change nothing.
    unresolved.push(path)
    logWarning(
      `buildDepotPlan: appId=${plan.appId} UNRESOLVED cross-depot path ` +
        `collision on "${path}" claimed by depot(s) ` +
        `${claims.map((c) => c.depotId).join(',')} ` +
        `[${claims
          .map(
            (c) =>
              `size=${Number(c.file.size)} chunks=${c.file.chunks.length} flags=${c.file.flags ?? 0}`
          )
          .join(' | ')}] — left in the plan unchanged, no winner guessed.` +
        caseNote,
      LogPrefix.Steam
    )
  }

  if (drop.size) {
    for (const depot of plan.depots) {
      depot.files = depot.files.filter((f) => !drop.has(f))
    }
    logInfo(
      `buildDepotPlan: appId=${plan.appId} resolved ${resolved.length} ` +
        `cross-depot path collision(s), dropped ${drop.size} losing entr(ies)`,
      LogPrefix.Steam
    )
  }

  let droppedBytes = 0
  for (const f of drop) droppedBytes += Number(f.size)
  return { resolved, unresolved, droppedBytes }
}
