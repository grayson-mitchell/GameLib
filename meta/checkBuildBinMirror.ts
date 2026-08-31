/**
 * Quick task 260901-a2w: standalone mirror gate for `build/bin` vs
 * `public/bin`. Run with `pnpm check:build-bin-mirror`.
 *
 * `meta/pruneStaleHelperBinaries.ts`'s vite plugin prunes stale `build/bin`
 * entries at build time; this script re-checks the result independently
 * (and can be run any time, not just right after a build), exiting
 * non-zero unless ALL of:
 *
 *   a. zero regular files present in build/bin but absent-or-kind-mismatched
 *      in public/bin
 *   b. zero regular files present in public/bin but absent-or-kind-mismatched
 *      in build/bin
 *   c. symlink maps equal in BOTH directions -- relPath AND `readlinkSync`
 *      target. A plain `find -type f` diff (F6) is blind to symlinks by
 *      construction, so this is a separate, dedicated assertion; it is the
 *      only thing in this gate that can catch a symlink silently replaced
 *      by a real file (or vice versa).
 *   d. summed apparent bytes (`statSync().size` over regular files, via an
 *      `lstat`-guarded walk -- NEVER `du`, see `meta/pruneStaleHelperBinaries.ts`'s
 *      module docblock and this task's MEASUREMENTS.md for why `du` is a
 *      trap here) are equal on both sides
 *   e. ANTI-VACUITY: `public/bin` holds at least 1 regular file. Without
 *      this, a wiped or never-populated checkout (both sides empty) would
 *      report a trivially passing mirror -- 0 files matches 0 files, 0
 *      bytes matches 0 bytes -- and "the mirror is correct" would be a
 *      meaningless claim over nothing. Exits non-zero with a message naming
 *      this explicitly rather than silently passing.
 *
 * On success, prints one line with both file counts, both symlink counts,
 * both byte totals and the delta. On failure, prints every offending
 * relPath (capped at 40 with an `...and N more` suffix) and exits 1.
 *
 * CLI-only, imported by nothing -- there is no `JEST_WORKER_ID`-style
 * main() guard needed here (unlike `meta/pruneStaleHelperBinaries.ts` and
 * `meta/downloadHelperBinaries.ts`, which ARE imported by other code).
 */
import { lstatSync, readdirSync, readlinkSync } from 'node:fs'
import { join } from 'node:path'

import { collectEntries } from './pruneStaleHelperBinaries'

const MAX_LISTED = 40

function sumApparentBytes(root: string, relPaths: Iterable<string>): number {
  let total = 0
  for (const relPath of relPaths) {
    const st = lstatSync(join(root, relPath))
    if (st.isFile()) {
      total += st.size
    }
  }
  return total
}

function capped(paths: string[]): string[] {
  if (paths.length <= MAX_LISTED) {
    return paths
  }
  return [
    ...paths.slice(0, MAX_LISTED),
    `...and ${paths.length - MAX_LISTED} more`
  ]
}

interface MirrorCheckResult {
  ok: boolean
  failures: string[]
  buildFileCount: number
  publicFileCount: number
  buildSymlinkCount: number
  publicSymlinkCount: number
  buildBytes: number
  publicBytes: number
}

export function checkBuildBinMirror(
  buildBinDir: string,
  publicBinDir: string
): MirrorCheckResult {
  const buildEntries = collectEntries(buildBinDir)
  const publicEntries = collectEntries(publicBinDir)

  const buildFiles = [...buildEntries.entries()]
    .filter(([, kind]) => kind === 'file')
    .map(([relPath]) => relPath)
  const publicFiles = [...publicEntries.entries()]
    .filter(([, kind]) => kind === 'file')
    .map(([relPath]) => relPath)

  const failures: string[] = []

  // e. ANTI-VACUITY, checked first: an empty public/bin makes every other
  // check trivially and meaninglessly true.
  if (publicFiles.length === 0) {
    return {
      ok: false,
      failures: [
        'refusing to certify a mirror over an empty public/bin -- ' +
          `${publicBinDir} holds 0 regular files`
      ],
      buildFileCount: buildFiles.length,
      publicFileCount: 0,
      buildSymlinkCount: 0,
      publicSymlinkCount: 0,
      buildBytes: 0,
      publicBytes: 0
    }
  }

  // a. only-in-build regular files (absent, or present as a non-file kind,
  // in public).
  const onlyInBuild = buildFiles.filter(
    (relPath) => publicEntries.get(relPath) !== 'file'
  )
  for (const relPath of capped(onlyInBuild.sort())) {
    failures.push(`only in build/bin (regular file): ${relPath}`)
  }

  // b. only-in-public regular files (absent, or present as a non-file kind,
  // in build).
  const onlyInPublic = publicFiles.filter(
    (relPath) => buildEntries.get(relPath) !== 'file'
  )
  for (const relPath of capped(onlyInPublic.sort())) {
    failures.push(`only in public/bin (regular file): ${relPath}`)
  }

  // c. symlink maps, both directions, relPath AND target.
  const buildSymlinkPaths = [...buildEntries.entries()]
    .filter(([, kind]) => kind === 'symlink')
    .map(([relPath]) => relPath)
  const publicSymlinkPaths = [...publicEntries.entries()]
    .filter(([, kind]) => kind === 'symlink')
    .map(([relPath]) => relPath)

  const buildSymlinkTargets = new Map(
    buildSymlinkPaths.map((relPath) => [
      relPath,
      readlinkSync(join(buildBinDir, relPath))
    ])
  )
  const publicSymlinkTargets = new Map(
    publicSymlinkPaths.map((relPath) => [
      relPath,
      readlinkSync(join(publicBinDir, relPath))
    ])
  )

  const symlinkMismatches: string[] = []
  for (const [relPath, target] of buildSymlinkTargets) {
    const publicTarget = publicSymlinkTargets.get(relPath)
    if (publicTarget === undefined) {
      symlinkMismatches.push(
        `symlink only in build/bin: ${relPath} -> ${target}`
      )
    } else if (publicTarget !== target) {
      symlinkMismatches.push(
        `symlink target mismatch at ${relPath}: build -> ${target}, public -> ${publicTarget}`
      )
    }
  }
  for (const [relPath, target] of publicSymlinkTargets) {
    if (!buildSymlinkTargets.has(relPath)) {
      symlinkMismatches.push(
        `symlink only in public/bin: ${relPath} -> ${target}`
      )
    }
  }
  for (const line of capped(symlinkMismatches.sort())) {
    failures.push(line)
  }

  // d. summed apparent bytes, both sides.
  const buildBytes = sumApparentBytes(buildBinDir, buildFiles)
  const publicBytes = sumApparentBytes(publicBinDir, publicFiles)
  if (buildBytes !== publicBytes) {
    failures.push(
      `apparent-byte total mismatch: build/bin=${buildBytes}, ` +
        `public/bin=${publicBytes}, delta=${buildBytes - publicBytes}`
    )
  }

  return {
    ok: failures.length === 0,
    failures,
    buildFileCount: buildFiles.length,
    publicFileCount: publicFiles.length,
    buildSymlinkCount: buildSymlinkPaths.length,
    publicSymlinkCount: publicSymlinkPaths.length,
    buildBytes,
    publicBytes
  }
}

function main(): void {
  // process.cwd(), not __dirname -- this file is compiled and run from a
  // throwaway temp directory by meta/runTs.cjs (each invocation gets its
  // own private bundle target), so __dirname would resolve to that temp
  // directory rather than to meta/ in the checkout. pnpm/npm scripts always
  // run with the repo root as cwd.
  const buildBinDir = join(process.cwd(), 'build', 'bin')
  const publicBinDir = join(process.cwd(), 'public', 'bin')

  const result = checkBuildBinMirror(buildBinDir, publicBinDir)

  if (result.ok) {
    console.log(
      `[check-build-bin-mirror] OK -- files: build=${result.buildFileCount} ` +
        `public=${result.publicFileCount}, symlinks: build=${result.buildSymlinkCount} ` +
        `public=${result.publicSymlinkCount}, apparent bytes: build=${result.buildBytes} ` +
        `public=${result.publicBytes} delta=${result.buildBytes - result.publicBytes}`
    )
    return
  }

  console.error(
    `[check-build-bin-mirror] FAILED -- ${result.failures.length} issue(s):`
  )
  for (const failure of result.failures) {
    console.error(`  - ${failure}`)
  }
  process.exitCode = 1
}

// CLI-only entry point -- see the "CLI-only, imported by nothing" note in
// this file's module docblock. Still guarded so this module can be
// `require`d elsewhere (e.g. a future test) without side effects.
if (!process.env.JEST_WORKER_ID) {
  main()
}
