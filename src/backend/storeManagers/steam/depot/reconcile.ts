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

async function regularFileVerified(
  dest: string,
  file: DepotPlanFile
): Promise<boolean> {
  let st
  try {
    st = await stat(dest)
  } catch {
    return false
  }
  if (!st.isFile()) return false
  // Wrong size is decisive on its own — no sha1 needed to reject it.
  if (st.size !== Number(file.size)) return false

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
