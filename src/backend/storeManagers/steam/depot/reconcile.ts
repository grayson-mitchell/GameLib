// Phase 23 (23-03, D-04): sha1-gated partial-state reconciliation for
// resume/interrupted-download recovery. There is NO resume of the byte
// download today — every retry re-downloads 100%. This module walks the
// install root, decides which manifest files can be trusted as-is, and
// returns a REDUCED job list containing only what's missing/mismatched.
//
// LOAD-BEARING INVARIANT (RESEARCH.md Pitfall 1): existence guarantees
// nothing, sha1 guarantees content. GameLib — not Steam — is asserting
// completeness on a reconciled resume, so a present file is NEVER skipped
// from the download job list on the strength of its existence + size alone.
// Every skip MUST pass sha1File(dest) === file.sha_content first. This is
// the single most important correctness rule in this file.
//
// Composes the two existing, already-correct primitives depot.ts exports
// (sha1File, resolveContainedPath/PathTraversalError) — this module does
// NOT reimplement either (Shared Patterns rule).

import { lstat, readlink, stat } from 'node:fs/promises'
import { sha1File, resolveContainedPath } from '../depot'
import type { DepotPlan, DepotPlanFile } from '../depot'

// EDepotFileFlag bit values, per steam-user's own authoritative enum
// (node_modules/steam-user/enums/EDepotFileFlag.js) — Directory = 64,
// Symlink = 512. Same values depot.ts's downloadSingleFile already checks;
// hardcoded here (matching depot.ts's own precedent) since they are not
// part of the exported surface the Shared Patterns rule requires reusing.
const DIRECTORY_FLAG = 64
const SYMLINK_FLAG = 512

/** Same shape downloadDepotFiles' own job-list builder produces. */
export interface ReconcileJob {
  depotId: string
  key: Buffer
  file: DepotPlanFile
  fileSeed: number
}

export interface ReconcileResult {
  /** Reduced job list — only files that are missing, wrong-sized, or failed
   *  a content sha1 check. A file the reconciler trusts as already-complete
   *  is EXCLUDED here, never re-downloaded (D-05: reconciliation fills
   *  first-install/resume gaps only, it never owns updates). */
  jobs: ReconcileJob[]
  /** True iff EVERY file in the plan ended verified this run — every
   *  present file that was skipped passed sha1File (or, for zero-size
   *  files/Directory/Symlink entries, passed their own non-content
   *  existence/target check); false the moment a single job was pushed. */
  allFilesVerified: boolean
  /** Summed `Number(file.size)` of every plan entry the reconciler verified as
   *  already present and therefore EXCLUDED from `jobs`. Uses the identical
   *  expression buildDepotPlan uses for `plan.totalBytes` (depot.ts:799), so
   *  `skippedBytes <= plan.totalBytes` holds by construction. 0 on a fresh
   *  install. */
  skippedBytes: number
}

function expectedSha(file: DepotPlanFile): string {
  return Buffer.isBuffer(file.sha_content)
    ? file.sha_content.toString('hex')
    : String(file.sha_content)
}

async function directoryVerified(dest: string): Promise<boolean> {
  try {
    const st = await lstat(dest)
    return st.isDirectory()
  } catch {
    return false
  }
}

async function symlinkVerified(
  dest: string,
  linktarget?: string
): Promise<boolean> {
  if (!linktarget) return false
  try {
    const st = await lstat(dest)
    if (!st.isSymbolicLink()) return false
    const target = await readlink(dest)
    return target === linktarget
  } catch {
    return false
  }
}

/** Mirrors downloadSingleFile's own zero-size fast path (open('w')+close,
 *  no chunks, no sha1 check) — an empty file's manifest sha_content does not
 *  necessarily represent a meaningful empty-content digest, so reconciling
 *  it the same way the download path treats it avoids a false mismatch. */
async function zeroSizeVerified(dest: string): Promise<boolean> {
  try {
    const st = await stat(dest)
    return st.isFile() && st.size === 0
  } catch {
    return false
  }
}

export type ShapeFailure = 'missing' | 'not-a-file' | 'wrong-size'

export type ShapeResult =
  | { ok: true; size: number }
  | { ok: false; reason: ShapeFailure; foundSize?: number }

/** Non-content half of "is this a correct regular file on disk": present,
 *  a regular file (not a directory/symlink/etc.), and the exact expected
 *  size. Shared by `regularFileVerified` (sha1-gated, decides what may be
 *  SKIPPED from the download job list) and `verifyStructuralIntegrity`
 *  (POST-download, no-sha1) so "what a correct regular file looks like on
 *  disk" lives in exactly one place. */
async function regularFileShape(
  dest: string,
  file: DepotPlanFile
): Promise<ShapeResult> {
  let st
  try {
    st = await stat(dest)
  } catch {
    return { ok: false, reason: 'missing' }
  }
  if (!st.isFile()) return { ok: false, reason: 'not-a-file' }
  if (st.size !== Number(file.size)) {
    return { ok: false, reason: 'wrong-size', foundSize: st.size }
  }
  return { ok: true, size: st.size }
}

async function regularFileVerified(
  dest: string,
  file: DepotPlanFile
): Promise<boolean> {
  const shape = await regularFileShape(dest, file)
  if (!shape.ok) return false

  // Pitfall 1 / T-23-07: size-match alone is NEVER sufficient. Every
  // present-and-size-correct file MUST pass a real content sha1 before being
  // excluded from the download job list.
  const got = await sha1File(dest)
  return got === expectedSha(file)
}

/**
 * Walk `plan.depots[].files[]`, resolve each destination via
 * resolveContainedPath (never path.join — T-23-08, containment reused, not
 * reimplemented), and decide whether it can be skipped from the download job
 * list:
 *  - missing on disk -> job, not verified
 *  - present, wrong size -> job, not verified (decisive, no sha1 needed)
 *  - present, correct size, sha1File(dest) !== file.sha_content -> job, not verified
 *  - present, correct size, sha1File(dest) === file.sha_content -> SKIPPED, verified
 * Directory(64)/Symlink(512) manifest entries follow the same
 * resolve+containment discipline but are reconciled by existence/target
 * match instead of sha1 (never sha1 a directory) — so an already-complete
 * resume with empty directories or symlinks still correctly reduces to zero
 * jobs (D-05). A path-traversal filename throws PathTraversalError
 * immediately (propagated from resolveContainedPath) — it is never silently
 * skipped.
 */
export async function reconcilePartialState(
  plan: DepotPlan,
  installRoot: string
): Promise<ReconcileResult> {
  const jobs: ReconcileJob[] = []
  let allFilesVerified = true
  let skippedBytes = 0
  let seed = 0

  for (const depot of plan.depots) {
    for (const file of depot.files) {
      const fileSeed = seed++
      const dest = resolveContainedPath(installRoot, file.filename)

      let verified: boolean
      if (file.flags && file.flags & DIRECTORY_FLAG) {
        verified = await directoryVerified(dest)
      } else if (file.flags && file.flags & SYMLINK_FLAG) {
        verified = await symlinkVerified(dest, file.linktarget)
      } else if (!file.chunks.length || Number(file.size) === 0) {
        verified = await zeroSizeVerified(dest)
      } else {
        verified = await regularFileVerified(dest, file)
      }

      if (verified) {
        skippedBytes += Number(file.size)
        continue
      }

      allFilesVerified = false
      jobs.push({ depotId: depot.depotId, key: depot.key, file, fileSeed })
    }
  }

  return { jobs, allFilesVerified, skippedBytes }
}

// Matches depot.ts's FAILURE_LOG_CAP (= 10) precedent for bounding a
// per-run log payload while still counting the true total separately.
const MISMATCH_REPORT_CAP = 10

export type StructuralFailureReason =
  | 'missing'
  | 'not-a-file'
  | 'wrong-size'
  | 'not-a-directory'
  | 'bad-symlink'
  | 'error'

export interface StructuralMismatch {
  filename: string
  reason: StructuralFailureReason
  expectedSize?: number
  foundSize?: number
}

export interface StructuralVerifyResult {
  ok: boolean
  checked: number
  /** TOTAL mismatch count — never truncated, even though `mismatches` is
   *  capped for logging. A caller must never infer the true damage extent
   *  from `mismatches.length`. */
  mismatchCount: number
  /** Bounded to MISMATCH_REPORT_CAP entries. */
  mismatches: StructuralMismatch[]
}

/**
 * POST-download damage detector — NOT a content check, and NEVER a
 * substitute for `reconcilePartialState`'s sha1 gate above. That function
 * decides what may be SKIPPED from the download job list, a decision that
 * requires sha1 per this file's header invariant. This function runs AFTER
 * every planned file has already been written and whole-file-sha1-verified
 * by `downloadSingleFile` (depot.ts:1629-1637), and asks a different
 * question: is what we wrote still there, and still the right shape?
 *
 * Why no sha1: content was already proven correct at write time; the
 * residual risk this function exists to catch is POST-write damage — a
 * later job in the same run clobbering an earlier file's destination, a
 * truncation, a regular file replaced by a directory. Type+size catches all
 * of those at ~1 stat() per planned entry. Re-hashing a multi-GB install
 * end-to-end on every single completion is not affordable.
 *
 * What it therefore CANNOT catch: content silently corrupted in place, at
 * the identical size, by something outside this process. Documented here so
 * nobody mistakes this for a full verify.
 *
 * An `unresolved` path collision (two chunked entries claiming one
 * destination path — see depot/pathCollisions.ts) means at least one of
 * those entries structurally cannot be satisfied on disk simultaneously, so
 * it will legitimately mismatch here and force the safe 1026 fallback. That
 * is the correct, honest answer for a plan `pathCollisions.ts` deliberately
 * declined to resolve, but it IS a behaviour change from before this
 * function existed: such a title could previously still earn a 4.
 *
 * Fails CLOSED like every other function in this file: a thrown
 * PathTraversalError from resolveContainedPath is NOT caught here — it
 * propagates so the caller (depot.ts) can fail the whole check closed,
 * exactly as an unmatched shape does. There is no branch here that resolves
 * to a pass on incomplete information.
 */
export async function verifyStructuralIntegrity(
  plan: DepotPlan,
  installRoot: string
): Promise<StructuralVerifyResult> {
  const mismatches: StructuralMismatch[] = []
  let checked = 0
  let mismatchCount = 0

  const record = (
    filename: string,
    m: Omit<StructuralMismatch, 'filename'>
  ) => {
    mismatchCount++
    if (mismatches.length < MISMATCH_REPORT_CAP) {
      mismatches.push({ filename, ...m })
    }
  }

  for (const depot of plan.depots) {
    for (const file of depot.files) {
      checked++
      const dest = resolveContainedPath(installRoot, file.filename)

      if (file.flags && file.flags & DIRECTORY_FLAG) {
        if (!(await directoryVerified(dest))) {
          record(file.filename, { reason: 'not-a-directory' })
        }
        continue
      }

      if (file.flags && file.flags & SYMLINK_FLAG) {
        if (!(await symlinkVerified(dest, file.linktarget))) {
          record(file.filename, { reason: 'bad-symlink' })
        }
        continue
      }

      if (!file.chunks.length || Number(file.size) === 0) {
        if (!(await zeroSizeVerified(dest))) {
          record(file.filename, { reason: 'wrong-size', expectedSize: 0 })
        }
        continue
      }

      const shape = await regularFileShape(dest, file)
      if (!shape.ok) {
        record(file.filename, {
          reason: shape.reason,
          expectedSize: Number(file.size),
          foundSize: shape.foundSize
        })
      }
    }
  }

  return { ok: mismatchCount === 0, checked, mismatchCount, mismatches }
}
