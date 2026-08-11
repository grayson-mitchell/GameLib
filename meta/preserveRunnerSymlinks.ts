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
  symlinkSync,
  type Dirent
} from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

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
 * Re-creates every symlink from `sourceDir` inside `destDir`, replacing
 * whatever vite's dereferencing copy left in its place (a real file or a
 * real directory). Idempotent: `rmSync(destPath, { recursive: true, force:
 * true })` unlinks a symlink destination without following it (Node stats
 * with `lstat`), so re-running over an already-restored tree is safe and
 * produces the same link targets. Targets are copied byte-identical from
 * the source record -- never rewritten or absolutised, since all twelve
 * real targets are relative and rely on staying that way.
 *
 * A record whose destination PARENT directory does not exist is skipped
 * (and reported), rather than creating a partial tree with `mkdirSync`.
 */
export function restoreSymlinks(
  sourceDir: string,
  destDir: string
): { restored: SymlinkRecord[]; skipped: SymlinkRecord[] } {
  const records = collectSymlinks(sourceDir)
  const restored: SymlinkRecord[] = []
  const skipped: SymlinkRecord[] = []

  for (const record of records) {
    const destPath = resolveDestPath(destDir, record.relPath)

    if (!existsSync(dirname(destPath))) {
      skipped.push(record)
      continue
    }

    rmSync(destPath, { recursive: true, force: true })
    symlinkSync(record.target, destPath)
    restored.push(record)
  }

  return { restored, skipped }
}

/**
 * `closeBundle` vite plugin factory. `apply: 'build'` matters: `electron-vite
 * dev` serves `public/` from disk with its symlinks intact, so there is
 * nothing to restore and nothing to touch there. Runs unconditionally
 * (unconditional platform/mode gating) because `restoreSymlinks` is a no-op
 * wherever the source tree has no symlinks (T-34.9G-04).
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
      const { restored, skipped } = restoreSymlinks(sourceDir, destDir)
      console.log(
        `[preserve-runner-symlinks] restored ${restored.length} symlink(s), skipped ${skipped.length}`
      )
    }
  }
}
