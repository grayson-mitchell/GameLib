/**
 * Phase 34.9 gap cycle, plan 14: closes F-34.9-02. Generalized to win/linux
 * by quick task 260822-hrf, item 11 (IN-03).
 *
 * The trap: electron-builder only clears the target-specific subdirectory it
 * is about to populate (`dist/mac-arm64/` for `--mac`), never the top-level
 * `dist/` directory where the final packaged artifacts land. So when a build
 * FAILS partway through -- exactly what happened on 2026-08-11, where
 * `codesign` rejected the macOS bundle as "format is ambiguous" (F-34.9-01)
 * -- the previous run's artifacts are left untouched in `dist/`, dated
 * whenever that prior run last succeeded. The question "did the build
 * produce an installer?" then answers YES from a stale pre-existing
 * artifact, even though the build that was just run produced nothing at
 * all. This is a false-pass generator for any gate that checks `dist/` for
 * a packaged artifact.
 *
 * This mechanism -- electron-builder clearing only its own target
 * subdirectory, never the shared top-level `dist/` -- is platform-general
 * by construction (it is how electron-builder itself works, not a
 * macOS-specific quirk). It is CONFIRMED, live, on macOS as F-34.9-02. The
 * win/linux consequence below is an UNCONFIRMED generalization from that
 * confirmed mechanism, not an observed defect -- this work was done on
 * macOS arm64 (Darwin 25.5.0) with no win/linux build available to run
 * live. The win/linux behaviour in this module is proven only against
 * synthetic `dist/` fixtures (meta/__tests__/cleanDist.test.ts); nothing
 * here should be read as live win/linux coverage.
 *
 * This module removes every entry identifiable to a given platform from
 * `dist/` BEFORE electron-builder runs for that platform, so a failed
 * build is indistinguishable from a failed build.
 */
import { existsSync, readdirSync, rmSync, type Dirent } from 'node:fs'
import * as path from 'node:path'

export type Platform = 'mac' | 'win' | 'linux'

export const PLATFORMS: readonly Platform[] = ['mac', 'win', 'linux']

interface PlatformArtifactSpec {
  // Substrings that, appearing anywhere in a `dist/`-child's name, identify
  // it as this platform's artifact. Driven by electron-builder.yml's
  // `<platform>.artifactName` (and, for win, `portable.artifactName` too --
  // `release:win` builds the `portable` target while `dist:win` uses
  // electron-builder.yml's default win targets, so a single win token
  // misses half the artifacts a real win build produces).
  tokens: string[]
  // Auto-update feed manifests are not `${productName}`-prefixed, so they
  // never contain a token above and must be named explicitly.
  standalone: string[]
  // Matches the per-arch staging directory electron-builder builds the
  // unpacked app into before packaging (e.g. `mac-arm64`, `win-ia32`,
  // `linux-unpacked`). Also matches the bare platform name, in case a
  // future electron-builder version drops the arch/variant suffix.
  dirPattern: RegExp
}

const PLATFORM_ARTIFACTS: Record<Platform, PlatformArtifactSpec> = {
  mac: {
    tokens: ['-macOS-'],
    standalone: ['latest-mac.yml'],
    dirPattern: /^mac(-.+)?$/
  },
  win: {
    tokens: ['-Setup-', '-Portable-'],
    standalone: ['latest.yml'],
    dirPattern: /^win(-.+)?$/
  },
  linux: {
    tokens: ['-linux-'],
    standalone: ['latest-linux.yml'],
    dirPattern: /^linux(-.+)?$/
  }
}

// Back-compat aliases into the mac entry. Grepped 2026-08-22 (quick task
// 260822-hrf): no importer outside this module and its own test file
// references these three names, but they are kept -- rather than deleted --
// because this module's own history and its doc comments (IN-01/IN-02
// below) refer to "the macOS token"/"the macOS dir pattern" by these names.
export const MAC_ARTIFACT_TOKEN = PLATFORM_ARTIFACTS.mac.tokens[0]
export const MAC_STANDALONE_ENTRIES = PLATFORM_ARTIFACTS.mac.standalone
export const MAC_DIR_PATTERN = PLATFORM_ARTIFACTS.mac.dirPattern

/**
 * True when `name` (a direct child of `dist/`) is a `platform`-produced
 * artifact or staging directory, by the positive allow-list above.
 * `isDirectory` reflects the directory ENTRY's own type (as
 * `readdirSync(..., { withFileTypes: true })` reports it, i.e. lstat-based),
 * so the `dirPattern` branch never fires for a symlink -- a symlink is
 * therefore matched only when its own NAME contains one of `tokens` or is
 * listed in `standalone`. A symlink whose name matches only `dirPattern` --
 * the concrete example being a symlink literally named `mac-arm64` -- matches
 * no branch and is left in place. This shape is not reachable today:
 * electron-builder always creates the per-arch staging directory as a real
 * directory, never a symlink (IN-01).
 */
function isPlatformArtifact(
  name: string,
  isDirectory: boolean,
  platform: Platform
): boolean {
  const spec = PLATFORM_ARTIFACTS[platform]
  if (spec.tokens.some((token) => name.includes(token))) return true
  if (spec.standalone.includes(name)) return true
  if (isDirectory && spec.dirPattern.test(name)) return true
  return false
}

function readDistEntries(distDir: string): Dirent[] {
  if (!existsSync(distDir)) return []
  return readdirSync(distDir, { withFileTypes: true })
}

/**
 * Returns the names (never absolute paths -- the caller joins) of every
 * direct child of `distDir` that is a `platform`-produced artifact or
 * staging directory, sorted. Returns `[]` if `distDir` does not exist -- a
 * first-ever build has no `dist/` yet, which is a normal state, not an
 * error.
 */
export function distArtifactEntries(
  distDir: string,
  platform: Platform
): string[] {
  return readDistEntries(distDir)
    .filter((entry) =>
      isPlatformArtifact(entry.name, entry.isDirectory(), platform)
    )
    .map((entry) => entry.name)
    .sort()
}

/**
 * Removes every `platform`-identifiable entry directly under `distDir` and
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
 * meta/__tests__/cleanDist.test.ts.
 *
 * On a `distDir` that does not exist, returns `{ removed: [], kept: [] }`
 * without throwing.
 */
export function cleanDist(
  distDir: string,
  platform: Platform
): {
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
    if (!isPlatformArtifact(entry.name, entry.isDirectory(), platform)) {
      kept.push(entry.name)
      continue
    }

    const full = path.resolve(distDir, entry.name)
    if (full !== resolvedDist && !full.startsWith(boundary)) {
      throw new Error(
        `cleanDist: refusing to remove "${full}" -- it resolves outside ` +
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

function parsePlatform(argv: string[]): Platform {
  const flag = argv.find((a) => a.startsWith('--platform='))
  const value = flag?.slice('--platform='.length)
  if (!value || !(PLATFORMS as readonly string[]).includes(value)) {
    // No default on purpose: a silent default is how a win build would
    // end up running the mac cleaner and reporting success having cleaned
    // nothing relevant.
    throw new Error(
      `meta/cleanDist.ts: --platform is required and must be one of ` +
        `${PLATFORMS.join(', ')} (got ${value === undefined ? 'nothing' : JSON.stringify(value)})`
    )
  }
  return value as Platform
}

export function main(argv: string[] = process.argv.slice(2)): number {
  const platform = parsePlatform(argv)
  const positional = argv.find((a) => !a.startsWith('--'))
  // NOT __dirname -- this script is bundled by meta/runTs.cjs into a
  // private fs.mkdtempSync tmpdir and run from there, so __dirname in that
  // mode resolves under os.tmpdir(), nowhere near the repo root (a
  // `__dirname`-based default would silently point at a path with no
  // dist/ directory of its own, clean nothing, and report success --
  // meta/genI18nGateScope.ts documents the same trap). `pnpm
  // clean:dist-<platform>` always runs from the repo root, so a
  // cwd-relative path is correct here.
  const distDir = positional ?? path.join('dist')

  const { removed, kept } = cleanDist(distDir, platform)

  for (const name of removed) {
    console.log(`[clean:dist-${platform}] removed ${name}`)
  }
  console.log(
    `[clean:dist-${platform}] kept ${kept.length} non-${platform} entr${
      kept.length === 1 ? 'y' : 'ies'
    }`
  )

  return 0
}

// Guard idiom shared with meta/verifyRunnerBundle.ts / meta/buildSteamBridgeShims.ts:
// this script is bundled by esbuild and run as a CLI from inside a private
// tmpdir (which DOES set `require.main`) -- but this module is also
// imported directly by its jest suite, so `JEST_WORKER_ID` still reliably
// distinguishes "imported under test" from "run as a CLI".
if (!process.env.JEST_WORKER_ID) {
  try {
    process.exit(main())
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }
}
