/**
 * Quick task 260901-a2w: `build/bin` ships 182 files (46.64 MiB) that no
 * longer exist in `public/bin` -- a superseded Python 3.14 onedir helper
 * release (62 under `legendary`, 60 under `nile`, 60 under `gogdl`, all
 * beneath `arm64/darwin/{runner}/_internal/`).
 *
 * Root cause: `vite.config.ts` sets `build.emptyOutDir: false` -- correctly,
 * because `build/` also holds `main/`, `locales/`, `preload/`,
 * `sidecar-prep.blob` and the icon set, all written by other build steps --
 * and vite's implicit publicDir copy only ever ADDS files. Nothing in the
 * pipeline has ever deleted a stale `build/bin` entry.
 *
 * `emptyOutDir: true` is NOT the fix (it would delete everything else
 * `build/` holds). `rm -rf build/bin` is NOT the fix either: per the
 * recorded `download-helper-binaries-is-tag-idempotent-not-presence-idempotent`
 * finding, `meta/downloadHelperBinaries.ts` decides what to (re)download from
 * a STORED TAG (`public/bin/.release_tags`), not from what is present on
 * disk -- wiping `build/bin` (or `public/bin`) is not undone by re-running
 * that script, and there is no re-download trigger that repairs an
 * accidental deletion.
 *
 * This module instead computes a MIRROR-PRUNE set: entries present under
 * `build/bin` that are absent, or differ in kind, from `public/bin`. It
 * deletes ONLY that set, and ONLY after `assessPublicBin` confirms
 * `public/bin` is fully populated -- a prune against an absent, empty or
 * partially-populated `public/bin` throws and deletes nothing, because in
 * that state "absent from public" does not mean "stale", it means "we don't
 * know yet", and deleting on that basis risks the same unrecoverable loss
 * `rm -rf` would cause.
 *
 * WARNING: do NOT import `meta/downloadHelperBinaries.ts` from build-time
 * code (vite, this module's non-test callers, etc). That module's `main()`
 * runs at module scope unless `process.env.JEST_WORKER_ID` is set (see its
 * own guard comment) -- a vite build does not set that variable, so an
 * import would START A REAL NETWORK DOWNLOAD mid-build. This module
 * therefore recomputes the darwin layout marker locally, from
 * `meta/runnersOnedirDigests.json`, rather than importing
 * `darwinLayoutMarker()`. The two are pinned equal in this module's own
 * test file, where the import IS safe because jest sets `JEST_WORKER_ID`.
 */
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  statSync,
  type Dirent
} from 'node:fs'
import { createHash } from 'node:crypto'
import { join, relative, sep } from 'node:path'

import type { Plugin } from 'vite'

import { resolveDestPath } from './preserveRunnerSymlinks'
import { RELEASE_TAGS } from './releaseTags'
import runnersOnedirDigestsRaw from './runnersOnedirDigests.json'

const runnersOnedirDigests = runnersOnedirDigestsRaw as {
  layout: string
  runId?: string | null
  digests: Record<string, string>
}

export type EntryKind = 'file' | 'dir' | 'symlink'

const DARWIN_RUNNERS = ['legendary', 'gogdl', 'nile'] as const

// meta/verifyRunnerBundle.ts:64 -- `const FILE_COUNT_FLOOR = 20` (not
// exported). Re-declared locally with the same rationale: a onedir tree
// holds ~100+ files; a repackaged onefile would hold a handful. The floor is
// EXCLUSIVE there (`fileCount <= FILE_COUNT_FLOOR` fails), so "populated"
// here means strictly more than 20, i.e. at least 21.
const RUNNER_FILE_COUNT_FLOOR = 20

/**
 * Recursively walks `root`, returning a `relPath -> kind` map using `/`
 * separators on every platform. Recurses ONLY on `dirent.isDirectory()`
 * (lstat semantics, mirroring `collectSymlinks` in
 * `meta/preserveRunnerSymlinks.ts`) -- a symlink-to-directory is classified
 * as `'symlink'` and never walked through, so nothing beneath it is ever
 * emitted. Returns an empty Map, never throws, when `root` does not exist.
 */
export function collectEntries(root: string): Map<string, EntryKind> {
  const entries = new Map<string, EntryKind>()

  if (!existsSync(root)) {
    return entries
  }

  function walk(dir: string): void {
    let dirents: Dirent[]
    try {
      dirents = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const dirent of dirents) {
      const full = join(dir, dirent.name)
      const relPath = relative(root, full).split(sep).join('/')

      // Mutually exclusive under lstat semantics: a symlink-to-directory is
      // never `isDirectory()`. Both checks run independently (no
      // early-exit) so the recursion guard's own correctness does not
      // depend on branch ordering.
      if (dirent.isSymbolicLink()) {
        entries.set(relPath, 'symlink')
      } else if (dirent.isDirectory()) {
        entries.set(relPath, 'dir')
        walk(full)
      } else {
        entries.set(relPath, 'file')
      }
    }
  }

  walk(root)
  return entries
}

/**
 * Returns the TOP-MOST set of relPaths present under `buildBinDir` that are
 * absent from `publicBinDir`, or present there with a different kind
 * (file/dir/symlink mismatch). "Top-most" means a whole missing directory is
 * emitted once, not once per descendant -- callers only need to `rmSync`
 * the returned paths with `recursive: true`. Never reports the reverse
 * direction (public-only entries produce nothing here; that is
 * `checkBuildBinMirror.ts`'s job).
 */
export function computePruneSet(
  buildBinDir: string,
  publicBinDir: string
): string[] {
  const buildEntries = collectEntries(buildBinDir)
  const publicEntries = collectEntries(publicBinDir)

  const pruneSet: string[] = []

  // Sort so parents are always evaluated before their descendants -- this is
  // what lets us skip a descendant once its ancestor is already queued for
  // pruning (minimality).
  const sortedBuildPaths = [...buildEntries.keys()].sort()

  for (const relPath of sortedBuildPaths) {
    const alreadyCovered = pruneSet.some(
      (queued) => relPath === queued || relPath.startsWith(queued + '/')
    )
    if (alreadyCovered) {
      continue
    }

    const buildKind = buildEntries.get(relPath)
    const publicKind = publicEntries.get(relPath)

    if (publicKind === undefined || publicKind !== buildKind) {
      pruneSet.push(relPath)
    }
  }

  return pruneSet
}

export interface PublicBinAssessment {
  ok: boolean
  reasons: string[]
}

/**
 * Confirms `publicBinDir` is fully populated before any prune is allowed to
 * touch `buildBinDir`. `ok` is true only when:
 *
 *   P1. `.release_tags` exists, parses as JSON, every RELEASE_TAGS key
 *       matches its stored value, and the stored `__darwin_layout` marker
 *       equals the marker recomputed locally from
 *       `meta/runnersOnedirDigests.json` (sha256 over
 *       `JSON.stringify({layout, digests})` with digest keys sorted --
 *       matching `computeLayoutMarker` in `meta/downloadHelperBinaries.ts`,
 *       pinned equal to it in this module's test file).
 *   P2. for each of legendary/gogdl/nile: `<publicBinDir>/arm64/darwin/{r}/{r}`
 *       is a regular file with an exec bit set, AND
 *       `<publicBinDir>/arm64/darwin/{r}` holds strictly more than
 *       RUNNER_FILE_COUNT_FLOOR (20) regular files -- a bare `existsSync`
 *       would pass a partially-populated runner tree (e.g. 3 files out of
 *       ~100+), which is exactly the case that would lose data.
 */
export function assessPublicBin(publicBinDir: string): PublicBinAssessment {
  const reasons: string[] = []

  const releaseTagsPath = join(publicBinDir, '.release_tags')
  if (!existsSync(releaseTagsPath)) {
    reasons.push(`missing ${releaseTagsPath}`)
  } else {
    let parsed: Record<string, string> | undefined
    try {
      parsed = JSON.parse(readFileSync(releaseTagsPath, 'utf-8'))
    } catch {
      reasons.push(`${releaseTagsPath} does not parse as JSON`)
    }

    if (parsed) {
      for (const [runner, tag] of Object.entries(RELEASE_TAGS)) {
        if (parsed[runner] !== tag) {
          reasons.push(
            `${releaseTagsPath}: stale or missing tag for "${runner}" ` +
              `(expected "${tag}", got ${JSON.stringify(parsed[runner])})`
          )
        }
      }

      const expectedMarker = computeDarwinLayoutMarker()
      if (parsed.__darwin_layout !== expectedMarker) {
        reasons.push(
          `${releaseTagsPath}: __darwin_layout marker mismatch ` +
            `(expected "${expectedMarker}", got ${JSON.stringify(parsed.__darwin_layout)})`
        )
      }
    }
  }

  for (const runner of DARWIN_RUNNERS) {
    const runnerDir = join(publicBinDir, 'arm64', 'darwin', runner)
    const binaryPath = join(runnerDir, runner)

    let binaryStat: ReturnType<typeof statSync> | undefined
    try {
      binaryStat = statSync(binaryPath)
    } catch {
      reasons.push(`${runner}: runner binary missing at ${binaryPath}`)
    }

    if (binaryStat) {
      if (!binaryStat.isFile()) {
        reasons.push(`${runner}: ${binaryPath} is not a regular file`)
      } else if ((binaryStat.mode & 0o111) === 0) {
        reasons.push(`${runner}: ${binaryPath} has no exec bit set`)
      }
    }

    let fileCount = 0
    if (existsSync(runnerDir)) {
      fileCount = countRegularFiles(runnerDir)
    } else {
      reasons.push(`${runner}: tree missing at ${runnerDir}`)
    }

    if (fileCount <= RUNNER_FILE_COUNT_FLOOR) {
      reasons.push(
        `${runner}: tree at ${runnerDir} has only ${fileCount} files ` +
          `(floor is >${RUNNER_FILE_COUNT_FLOOR}) -- looks partially ` +
          'populated, not a full onedir bundle'
      )
    }
  }

  return { ok: reasons.length === 0, reasons }
}

function countRegularFiles(dir: string): number {
  let count = 0
  let dirents: Dirent[]
  try {
    dirents = readdirSync(dir, { withFileTypes: true })
  } catch {
    return 0
  }

  for (const dirent of dirents) {
    const full = join(dir, dirent.name)
    if (dirent.isSymbolicLink()) {
      continue
    }
    if (dirent.isDirectory()) {
      count += countRegularFiles(full)
    } else {
      count += 1
    }
  }
  return count
}

/**
 * Local recomputation of `darwinLayoutMarker()` (`meta/downloadHelperBinaries.ts`),
 * deliberately NOT imported from there -- see this module's top-of-file
 * warning. Pinned equal to the real function in this module's test file
 * (safe to import ONLY under jest, where JEST_WORKER_ID suppresses that
 * module's main()).
 */
export function computeDarwinLayoutMarker(): string {
  const sortedKeys = Object.keys(runnersOnedirDigests.digests).sort()
  const canonical = JSON.stringify({
    layout: runnersOnedirDigests.layout,
    digests: Object.fromEntries(
      sortedKeys.map((key) => [key, runnersOnedirDigests.digests[key]])
    )
  })
  return createHash('sha256').update(canonical).digest('hex')
}

export interface PruneResult {
  pruned: string[]
  bytesFreed: number
  guardEvaluated: boolean
}

/**
 * Prunes `buildBinDir` entries absent (or kind-mismatched) from
 * `publicBinDir`. An EMPTY prune set is a silent no-op -- `guardEvaluated`
 * stays `false` and `assessPublicBin` is never called, even when neither
 * directory exists. This is what keeps a fresh CI checkout green:
 * `.github/workflows/release-tauri.yml` runs `pnpm exec vite build` with no
 * pre-existing `build/bin`, so the prune set is empty and this function must
 * not demand a populated `public/bin` in that case.
 *
 * A NON-EMPTY prune set evaluates the guard first. If `assessPublicBin`
 * reports `ok: false`, this throws WITHOUT deleting anything -- the guard
 * check happens strictly before any `rmSync` call.
 *
 * Every delete target is resolved through `resolveDestPath` (T-a2w-01,
 * reusing `meta/preserveRunnerSymlinks.ts`'s containment idiom rather than
 * re-implementing it) -- relPaths are built entirely by `computePruneSet`'s
 * own walk, never accepted from outside, but the containment check stays
 * defense-in-depth.
 */
export function pruneStaleHelperBinaries(
  buildBinDir: string,
  publicBinDir: string
): PruneResult {
  const pruneSet = computePruneSet(buildBinDir, publicBinDir)

  if (pruneSet.length === 0) {
    return { pruned: [], bytesFreed: 0, guardEvaluated: false }
  }

  const assessment = assessPublicBin(publicBinDir)
  if (!assessment.ok) {
    throw new Error(
      [
        `pruneStaleHelperBinaries: refusing to prune ${pruneSet.length} ` +
          `entr${pruneSet.length === 1 ? 'y' : 'ies'} from "${buildBinDir}" -- ` +
          `"${publicBinDir}" failed its population guard:`,
        ...assessment.reasons.map((reason) => `  - ${reason}`)
      ].join('\n')
    )
  }

  let bytesFreed = 0
  const pruned: string[] = []

  for (const relPath of pruneSet) {
    const targetPath = resolveDestPath(buildBinDir, relPath)
    bytesFreed += sumApparentBytes(targetPath)
    rmSync(targetPath, { recursive: true, force: true })
    pruned.push(relPath)
  }

  return { pruned, bytesFreed, guardEvaluated: true }
}

/**
 * Sums `stat().size` (apparent bytes, never `du`/block-allocated size) over
 * every regular file at or beneath `path`. `path` itself may be a file, a
 * directory, or (via `lstatSync`) a symlink -- a symlink target's bytes are
 * never counted, matching `rmSync`'s own lstat-based unlink semantics.
 */
function sumApparentBytes(path: string): number {
  const st = lstatSync(path)
  if (st.isSymbolicLink()) {
    return 0
  }
  if (st.isFile()) {
    return st.size
  }
  if (st.isDirectory()) {
    let total = 0
    for (const dirent of readdirSync(path, { withFileTypes: true })) {
      total += sumApparentBytes(join(path, dirent.name))
    }
    return total
  }
  return 0
}

/**
 * Vite `buildStart` plugin factory. `buildStart` fires at rollup input
 * resolution -- strictly BEFORE vite's publicDir copy (which happens during
 * the write phase), which is in turn strictly BEFORE
 * `preserveRunnerSymlinksPlugin`'s `closeBundle`. This plugin therefore
 * prunes `build/bin` before the copy adds anything new for this build pass,
 * and its result cannot race the symlink restore: the two plugins share no
 * hook, so their relative order is a property of vite's build lifecycle,
 * not of their position in the `plugins` array (F4 safety argument).
 *
 * Defaults are `build/bin` and `public/bin` -- deliberately `bin/`-SCOPED,
 * unlike `preserveRunnerSymlinksPlugin`'s whole-tree defaults, because
 * `build/` legitimately holds outputs with no `public/` counterpart
 * (`main/`, `preload/`, `assets/`, `sidecar-prep.blob`).
 */
export function pruneStaleHelperBinariesPlugin(options?: {
  buildBinDir?: string
  publicBinDir?: string
}): Plugin {
  const buildBinDir = options?.buildBinDir ?? join(__dirname, '..', 'build', 'bin')
  const publicBinDir = options?.publicBinDir ?? join(__dirname, '..', 'public', 'bin')

  return {
    name: 'gamelib-prune-stale-helper-binaries',
    apply: 'build',
    enforce: 'pre',
    buildStart() {
      const { pruned, bytesFreed } = pruneStaleHelperBinaries(
        buildBinDir,
        publicBinDir
      )
      if (pruned.length === 0) {
        console.log('[prune-stale-helper-binaries] nothing to prune')
      } else {
        console.log(
          `[prune-stale-helper-binaries] pruned ${pruned.length} entr${
            pruned.length === 1 ? 'y' : 'ies'
          }, ${bytesFreed} bytes freed`
        )
      }
    }
  }
}
