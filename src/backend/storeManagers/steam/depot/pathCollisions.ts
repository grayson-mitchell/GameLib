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

import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { DepotPlan, DepotPlanFile } from '../depot'

/** EDepotFileFlag.Directory — same value depot.ts and reconcile.ts use. */
const DIRECTORY_FLAG = 64

export interface PathCollisionReport {
  /** Paths where a size-0/chunks-0 Directory entry was dropped in favour of a
   *  real file entry. One entry per PATH, not per dropped record. */
  resolved: string[]
  /** Paths claimed by more than one depot that this module refused to decide —
   *  e.g. two chunked file entries, or a Symlink against a file. Left in the
   *  plan EXACTLY as they were: reporting an ambiguous case is honest, and
   *  guessing a winner here would be the same class of silent corruption this
   *  module exists to remove. */
  unresolved: string[]
}

/**
 * The path two manifest entries would land on, compared the same way the write
 * path derives it: `resolveContainedPath` normalises `\` to `/` before
 * resolving, so `sound\music\x.acm` and `sound/music/x.acm` are ONE path.
 *
 * Deliberately CASE-SENSITIVE. macOS/Windows filesystems are usually
 * case-insensitive and would additionally collide `Master.dat` with
 * `master.dat`, but Linux is case-sensitive and two differently-cased files can
 * legitimately coexist there — folding case would invent collisions on the one
 * platform where they are not collisions. The observed defect is exact-case.
 */
function normalizePath(filename: string): string {
  return filename.replace(/\\/g, '/')
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
 * solely owned by `buildDepotPlan` at the single call site, and because every
 * dropped entry is size 0 — so `plan.totalBytes`, already summed by the caller,
 * stays correct with no compensating arithmetic (the same reasoning the
 * skipped-depot accounting above it relies on).
 *
 * Returns what it did so the caller can log it and tests can assert on it.
 */
export function resolveDepotPathCollisions(
  plan: Pick<DepotPlan, 'appId' | 'depots'>
): PathCollisionReport {
  // path -> every (depot, file) claiming it
  const byPath = new Map<string, { depotId: string; file: DepotPlanFile }[]>()

  for (const depot of plan.depots) {
    for (const file of depot.files) {
      const key = normalizePath(file.filename)
      const bucket = byPath.get(key)
      if (bucket) bucket.push({ depotId: depot.depotId, file })
      else byPath.set(key, [{ depotId: depot.depotId, file }])
    }
  }

  const resolved: string[] = []
  const unresolved: string[] = []
  const drop = new Set<DepotPlanFile>()

  for (const [path, claims] of byPath) {
    if (claims.length < 2) continue

    const emptyDirs = claims.filter((c) => isEmptyDirectoryEntry(c.file))
    const content = claims.filter((c) => hasContent(c.file))

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
          `the directory can win the write race and the file fails EISDIR.`,
        LogPrefix.Steam
      )
      continue
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
          .join(' | ')}] — left in the plan unchanged, no winner guessed.`,
      LogPrefix.Steam
    )
  }

  if (drop.size) {
    for (const depot of plan.depots) {
      depot.files = depot.files.filter((f) => !drop.has(f))
    }
    logInfo(
      `buildDepotPlan: appId=${plan.appId} resolved ${resolved.length} ` +
        `cross-depot path collision(s), dropped ${drop.size} directory marker(s)`,
      LogPrefix.Steam
    )
  }

  return { resolved, unresolved }
}
