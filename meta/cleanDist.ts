/**
 * Phase 34.9 gap cycle, plan 14: closes F-34.9-02.
 *
 * The trap: electron-builder only clears the target-specific subdirectory it
 * is about to populate (`dist/mac-arm64/` for `--mac`), never the top-level
 * `dist/` directory where the final `.dmg`/`.zip`/`.blockmap`/`latest-mac.yml`
 * artifacts land. So when a macOS build FAILS partway through -- exactly what
 * happened on 2026-08-11, where `codesign` rejected the bundle as "format is
 * ambiguous" (F-34.9-01) -- the previous run's artifacts are left untouched
 * in `dist/`, dated whenever that prior run last succeeded. The question
 * "did `pnpm dist:mac` produce a dmg?" then answers YES from a three-week-old
 * pre-34.9 artifact containing the OLD flat runner binaries, even though the
 * build that was just run produced nothing at all. This is a false-pass
 * generator for any gate that checks `dist/` for a `.dmg`, and it nearly
 * masked F-34.9-01 during the 2026-08-11 gate run. This module removes every
 * macOS-identifiable entry from `dist/` BEFORE electron-builder runs, so a
 * failed build is indistinguishable from a failed build.
 */
import { existsSync, readdirSync, rmSync, type Dirent } from 'node:fs'
import * as path from 'node:path'

// ---------------------------------------------------------------------------
// The naming contract that makes a macOS artifact identifiable. Driven by
// electron-builder.yml's `mac.artifactName: ${productName}-${version}-macOS-${arch}.${ext}`
// -- every macOS artifact (dmg/zip/blockmap) carries the literal `-macOS-`.
// `win.artifactName`/`linux.artifactName`/`portable.artifactName` use
// `-Setup-`/`-linux-`/`-Portable-` instead, never `-macOS-`.
// ---------------------------------------------------------------------------

export const MAC_ARTIFACT_TOKEN = '-macOS-'

// electron-builder's auto-update feed manifest for macOS is not
// `${productName}`-prefixed, so it never contains MAC_ARTIFACT_TOKEN and must
// be named explicitly.
export const MAC_STANDALONE_ENTRIES = ['latest-mac.yml']

// Matches `mac-arm64`, `mac-x64`, `mac-universal` -- the per-arch staging
// directory electron-builder builds the unpacked `.app` bundle into before
// packaging it. Also matches a bare `mac` directory, in case a future
// electron-builder version drops the arch suffix.
export const MAC_DIR_PATTERN = /^mac(-.+)?$/

/**
 * True when `name` (a direct child of `dist/`) is a macOS-produced artifact
 * or staging directory, by the positive allow-list above. `isDirectory`
 * reflects the directory ENTRY's own type (as `readdirSync(..., {
 * withFileTypes: true })` reports it, i.e. lstat-based), so the
 * `MAC_DIR_PATTERN` branch never fires for a symlink -- a symlink is
 * therefore matched only when its own NAME contains `MAC_ARTIFACT_TOKEN` or
 * is listed in `MAC_STANDALONE_ENTRIES`. A symlink whose name matches only
 * `MAC_DIR_PATTERN` -- the concrete example being a symlink literally named
 * `mac-arm64` -- matches no branch and is left in place. This shape is not
 * reachable today: electron-builder always creates the per-arch staging
 * directory as a real directory, never a symlink (IN-01).
 */
function isMacArtifact(name: string, isDirectory: boolean): boolean {
  if (name.includes(MAC_ARTIFACT_TOKEN)) return true
  if (MAC_STANDALONE_ENTRIES.includes(name)) return true
  if (isDirectory && MAC_DIR_PATTERN.test(name)) return true
  return false
}

function readDistEntries(distDir: string): Dirent[] {
  if (!existsSync(distDir)) return []
  return readdirSync(distDir, { withFileTypes: true })
}

/**
 * Returns the names (never absolute paths -- the caller joins) of every
 * direct child of `distDir` that is a macOS-produced artifact or staging
 * directory, sorted. Returns `[]` if `distDir` does not exist -- a first-ever
 * build has no `dist/` yet, which is a normal state, not an error.
 */
export function macArtifactEntries(distDir: string): string[] {
  return readDistEntries(distDir)
    .filter((entry) => isMacArtifact(entry.name, entry.isDirectory()))
    .map((entry) => entry.name)
    .sort()
}

/**
 * Removes every macOS-identifiable entry directly under `distDir` and
 * reports what was removed and what survived. Every `entry.name` reaching
 * the containment check (T-34.9G-09) comes from `readdirSync(distDir, {
 * withFileTypes: true })`, and real directory entries can never contain a
 * path separator, so `path.resolve(distDir, entry.name)` cannot escape
 * `resolve(distDir)` through this call path -- the throw is
 * defense-in-depth against a currently-unreachable input, not an enforced,
 * tested contract, and no test exercises it (IN-02). If this module ever
 * accepts externally-supplied names (e.g. a `--only` filter), the throw
 * becomes reachable and MUST gain a test. `rmSync(..., { recursive: true,
 * force: true })` unlinks a symlinked entry itself -- it never follows the
 * link and deletes its target (T-34.9G-11), and that claim IS tested, at
 * meta/__tests__/cleanDistMac.test.ts:162.
 *
 * On a `distDir` that does not exist, returns `{ removed: [], kept: [] }`
 * without throwing.
 */
export function cleanDistMac(distDir: string): {
  removed: string[]
  kept: string[]
} {
  const entries = readDistEntries(distDir)
  if (entries.length === 0) return { removed: [], kept: [] }

  const resolvedDist = path.resolve(distDir)
  const boundary = resolvedDist + path.sep

  const removed: string[] = []
  const kept: string[] = []

  for (const entry of entries) {
    if (!isMacArtifact(entry.name, entry.isDirectory())) {
      kept.push(entry.name)
      continue
    }

    const full = path.resolve(distDir, entry.name)
    if (full !== resolvedDist && !full.startsWith(boundary)) {
      throw new Error(
        `cleanDistMac: refusing to remove "${full}" -- it resolves outside ` +
          `distDir "${resolvedDist}" (name="${entry.name}")`
      )
    }

    rmSync(full, { recursive: true, force: true })
    removed.push(entry.name)
  }

  removed.sort()
  return { removed, kept }
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

export function main(argv: string[] = process.argv.slice(2)): number {
  const positional = argv.find((a) => !a.startsWith('--'))
  // NOT __dirname -- this script is bundled by esbuild to
  // node_modules/.cache/clean-dist-mac.cjs and run as
  // `node node_modules/.cache/clean-dist-mac.cjs`, so __dirname in that mode
  // resolves to node_modules/.cache, not meta/ (a `__dirname`-based default
  // would silently point at a path under node_modules/, nowhere near the repo
  // root, and clean nothing while reporting success -- meta/genI18nGateScope.ts
  // documents the same trap). `pnpm clean:dist-mac` always runs from the repo
  // root, so a cwd-relative path is correct here.
  const distDir = positional ?? path.join('dist')

  const { removed, kept } = cleanDistMac(distDir)

  for (const name of removed) {
    console.log(`[clean:dist-mac] removed ${name}`)
  }
  console.log(
    `[clean:dist-mac] kept ${kept.length} non-macOS entr${
      kept.length === 1 ? 'y' : 'ies'
    }`
  )

  return 0
}

// Guard idiom shared with meta/verifyRunnerBundle.ts / meta/buildSteamBridgeShims.ts:
// this script is bundled by esbuild and run as
// `node node_modules/.cache/clean-dist-mac.cjs`, which DOES set `require.main`
// -- but this module is also imported directly by its jest suite, so
// `JEST_WORKER_ID` still reliably distinguishes "imported under test" from
// "run as a CLI".
if (!process.env.JEST_WORKER_ID) {
  process.exit(main())
}
