/**
 * F-34.9-01 fix. vite's `copyDir` (`publicDir` -> `outDir`, used by the
 * `renderer` electron-vite config) has no symlink branch: it walks each
 * entry with `readdirSync`, `statSync`s the entry (which FOLLOWS symlinks),
 * and either recurses on `isDirectory()` or `copyFileSync`s. Every
 * `Python.framework` symlink inside each onedir runner (`legendary`, `gogdl`,
 * `nile`) is therefore dereferenced into a real file or real directory on
 * the way into `build/`. Apple's framework layout requires `Versions/Current`
 * to be a symlink; without it `codesign` cannot classify the bundle and
 * fails with "bundle format is ambiguous (could be app or framework)",
 * aborting `pnpm dist:mac`. See 34.9-LIVE-GATE.md item 4 for the full
 * causal proof (a `cp -R` vs `cp -RL` discriminator against the exact
 * codesign invocation electron-builder issues).
 *
 * This module re-creates every symlink present under the source tree
 * (`public/`) inside the build output (`build/`) after vite's own copy has
 * run, via a `closeBundle` vite plugin hook -- the last thing to execute in
 * an `electron-vite build` renderer pass, strictly after `copyDir`.
 */
import {
  existsSync,
  readdirSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  type Dirent
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

import type { Plugin } from 'vite'

export interface SymlinkRecord {
  relPath: string
  target: string
}

/**
 * Recursively walks `rootDir`, returning one record per symlink found.
 * Recurses ONLY on `dirent.isDirectory()` -- a symlink pointing at a
 * directory is NOT itself a directory under `lstat` (which is what
 * `readdirSync(dir, { withFileTypes: true })` uses), so a symlink is never
 * walked through, even when it points at a directory that itself contains
 * further symlinks. Returns `[]`, never throws, when `rootDir` does not
 * exist -- Linux/Windows checkouts have no darwin symlinks at all, and this
 * must be a silent no-op there.
 */
export function collectSymlinks(rootDir: string): SymlinkRecord[] {
  if (!existsSync(rootDir)) {
    return []
  }

  const records: SymlinkRecord[] = []

  function walk(dir: string): void {
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const full = join(dir, entry.name)

      // No `continue`/early-exit here: `isSymbolicLink()` and
      // `isDirectory()` are already mutually exclusive under `lstat`
      // semantics (a symlink-to-directory is never `isDirectory()`), so
      // both checks run independently against every entry. This matters
      // for the recursion guard's own correctness -- see doc comment above.
      if (entry.isSymbolicLink()) {
        const relPath = relative(rootDir, full).split(sep).join('/')
        records.push({ relPath, target: readlinkSync(full) })
      }

      if (entry.isDirectory()) {
        walk(full)
      }
    }
  }

  walk(rootDir)
  return records
}

/**
 * Resolves `relPath` against `destDir`, throwing unless the result is
 * strictly contained inside `destDir` (T-34.9G-01). A crafted `relPath`
 * (e.g. containing `..`) can never cause a write outside the build output
 * directory.
 */
export function resolveDestPath(destDir: string, relPath: string): string {
  const resolvedDestDir = resolve(destDir)
  const resolvedPath = resolve(resolvedDestDir, relPath)

  if (
    resolvedPath !== resolvedDestDir &&
    !resolvedPath.startsWith(resolvedDestDir + sep)
  ) {
    throw new Error(
      `resolveDestPath: relPath "${relPath}" escapes destDir "${destDir}"`
    )
  }

  return resolvedPath
}

/**
 * Returns `true` only when `target` -- a raw `readlinkSync` string sourced
 * from the untrusted vendored onedir tree (WR-01, T-34.9G-03) -- is safe to
 * recreate at `relPath` inside `destDir`. An absolute target is always
 * refused. A relative target is resolved from the LINK'S OWN directory
 * (matching real symlink resolution semantics) and accepted only when the
 * result is `resolve(destDir)` itself or strictly inside it.
 *
 * Deliberately lexical, not `realpathSync`: the check must not depend on
 * the destination existing yet (it usually doesn't -- this runs before the
 * link is created), and normalising both sides against the same `destDir`
 * string means a symlinked temp root cannot skew the comparison. This
 * mirrors `resolveDestPath`'s own containment idiom.
 */
export function isContainedSymlinkTarget(
  destDir: string,
  relPath: string,
  target: string
): boolean {
  if (isAbsolute(target)) {
    return false
  }

  const resolvedDestDir = resolve(destDir)
  const linkPath = resolve(resolvedDestDir, relPath)
  const resolvedTarget = resolve(dirname(linkPath), target)

  return (
    resolvedTarget === resolvedDestDir ||
    resolvedTarget.startsWith(resolvedDestDir + sep)
  )
}

/**
 * Quick task 260923-tip, Layer 2 (defense in depth). Decides which type
 * argument `symlinkSync` needs to recreate `record` correctly ON WINDOWS.
 *
 * Windows symlinks are TYPED. Node defaults to `'file'` unless the target
 * already resolves at creation time. A file symlink pointing at a directory
 * does not resolve as a directory, so vite's `copyDir` `statSync`s it,
 * fails, and aborts the `publicDir` copy partway through -- the exact Layer
 * 2 cascade in the source todo, where the previous build's output poisoned
 * the next build's copy (see
 * .planning/todos/pending/2026-09-22-windows-packaged-build-breaks-on-
 * darwin-runner-symlinks.md).
 *
 * The type is computed against the SOURCE tree, never the destination: at
 * the moment the link is created, the destination sibling may not exist yet
 * (the common case -- this runs before the link is created) or may hold
 * vite's dereferenced WRONG-KIND copy from a prior pass. The source tree is
 * the only place the truth is available.
 *
 * `'junction'` is deliberately NOT used. Node resolves a junction target
 * against `process.cwd()`, and junctions require an absolute path; every
 * target here is relative by design (`isContainedSymlinkTarget` refuses
 * absolute targets outright), so `'dir'` is the only correct value for a
 * directory-shaped target.
 *
 * The type argument is IGNORED on POSIX (Node accepts and discards it), so
 * this function -- and the `symlinkSync` call it feeds -- is a no-op change
 * for the macOS -> macOS build that exercises this code today. Keep it even
 * though quick 260923-tip's Layer 1 fix (meta/downloadHelperBinaries.ts /
 * meta/pruneStaleHelperBinaries.ts) stops darwin sources reaching a Windows
 * build in the FIRST place: macOS builds still run this path on every
 * build, and a future cross-platform or `GAMELIB_RUNNER_TARGET_PLATFORM`
 * leg could reintroduce the trees -- this is not dead code to delete later.
 *
 * Resolves `record.target` from the LINK'S OWN directory inside
 * `sourceDir` (matching real symlink resolution semantics, and mirroring
 * `isContainedSymlinkTarget`'s own resolution idiom), then `statSync`s it --
 * which FOLLOWS links, so a target that is itself a directory-symlink (the
 * real `Resources -> Versions/Current/Resources` shape, where `Current` is
 * itself a link) still resolves through the chain to `'dir'`. A target that
 * does not resolve at all (a dangling source link) falls back to `'file'`.
 */
export function symlinkTypeFor(
  sourceDir: string,
  record: SymlinkRecord
): 'dir' | 'file' {
  const linkPath = resolve(sourceDir, record.relPath)
  const targetPath = resolve(dirname(linkPath), record.target)

  try {
    return statSync(targetPath).isDirectory() ? 'dir' : 'file'
  } catch {
    return 'file'
  }
}

/**
 * Re-creates every symlink from `sourceDir` inside `destDir`, replacing
 * whatever vite's dereferencing copy left in its place (a real file or a
 * real directory). Idempotent: `rmSync(destPath, { recursive: true, force:
 * true })` unlinks a symlink destination without following it (Node stats
 * with `lstat`), so re-running over an already-restored tree is safe and
 * produces the same link targets. Targets are still never rewritten or
 * absolutised -- but they are now VALIDATED and REFUSED when unsafe (WR-01,
 * T-34.9G-03 upgraded from accept to mitigate): the vendored onedir tree is
 * externally-sourced, untrusted input, and an absolute or `..`-escaping
 * target would otherwise be recreated byte-identically inside the shipped
 * `.app`.
 *
 * A record whose target fails `isContainedSymlinkTarget` is pushed to
 * `rejected` and skipped -- checked BEFORE the destination-parent check and
 * BEFORE `rmSync`, so a rejected record's destination is left exactly as
 * vite's copy left it (T-34.9-18-02: the naive placement, after `rmSync`,
 * would delete the real dereferenced file/directory and then refuse to
 * replace it, turning a rejected link into a destructive partial build).
 *
 * A record whose destination PARENT directory does not exist is skipped
 * and pushed to `skipped` -- no longer merely reported: `closeBundle` now
 * fails the build on either non-empty bucket. This function itself does
 * not log or warn; reporting is the plugin's job.
 */
export function restoreSymlinks(
  sourceDir: string,
  destDir: string
): {
  restored: SymlinkRecord[]
  skipped: SymlinkRecord[]
  rejected: SymlinkRecord[]
} {
  const records = collectSymlinks(sourceDir)
  const restored: SymlinkRecord[] = []
  const skipped: SymlinkRecord[] = []
  const rejected: SymlinkRecord[] = []

  for (const record of records) {
    const destPath = resolveDestPath(destDir, record.relPath)

    if (!isContainedSymlinkTarget(destDir, record.relPath, record.target)) {
      rejected.push(record)
      continue
    }

    if (!existsSync(dirname(destPath))) {
      skipped.push(record)
      continue
    }

    rmSync(destPath, { recursive: true, force: true })
    symlinkSync(record.target, destPath, symlinkTypeFor(sourceDir, record))
    restored.push(record)
  }

  return { restored, skipped, rejected }
}

/**
 * `closeBundle` vite plugin factory. `apply: 'build'` matters: `electron-vite
 * dev` serves `public/` from disk with its symlinks intact, so there is
 * nothing to restore and nothing to touch there. Runs unconditionally
 * (unconditional platform/mode gating) because `restoreSymlinks` is a no-op
 * wherever the source tree has no symlinks (T-34.9G-04).
 *
 * CR-01: `closeBundle` THROWS when either `skipped` or `rejected` is
 * non-empty, so `electron-vite build` exits non-zero and `electron-builder`
 * never runs over a partially-restored tree -- a build that used to merely
 * `console.log` its own integrity signal and proceed. This throw is
 * defense-in-depth and is NOT reachable from a real build today: the
 * vendored darwin onedir trees are git-ignored and untracked, so every
 * fresh checkout has no darwin symlinks at all and both buckets stay empty.
 * Its failing direction is proven at UNIT level only (see the module's
 * test file); no comment here claims a live or build-level observation of
 * this throw firing.
 */
export function preserveRunnerSymlinksPlugin(options?: {
  sourceDir?: string
  destDir?: string
}): Plugin {
  const sourceDir = options?.sourceDir ?? join(__dirname, '..', 'public')
  const destDir = options?.destDir ?? join(__dirname, '..', 'build')

  return {
    name: 'gamelib-preserve-runner-symlinks',
    apply: 'build',
    enforce: 'post',
    closeBundle() {
      const { restored, skipped, rejected } = restoreSymlinks(
        sourceDir,
        destDir
      )
      console.log(
        `[preserve-runner-symlinks] restored ${restored.length} symlink(s), skipped ${skipped.length}, rejected ${rejected.length}`
      )

      if (skipped.length > 0 || rejected.length > 0) {
        const skippedLines = skipped.map((record) => `  - ${record.relPath}`)
        const rejectedLines = rejected.map(
          (record) => `  - ${record.relPath} -> ${record.target}`
        )
        throw new Error(
          [
            'preserve-runner-symlinks: refusing to emit a bundle with unrestored symlink(s).',
            `skipped (destination parent missing): ${skipped.length}`,
            ...skippedLines,
            `rejected (unsafe target): ${rejected.length}`,
            ...rejectedLines
          ].join('\n')
        )
      }
    }
  }
}
