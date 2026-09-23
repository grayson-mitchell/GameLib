/**
 * Phase 34.9 Plan 01: single source of truth for pinned runner/tool release
 * tags and the platform/binary vocabulary shared by:
 *
 *   - meta/downloadHelperBinaries.ts (vendors the shipped runtime binaries
 *     for win32/darwin/linux)
 *   - meta/buildRunnersOnedir.ts (Phase 34.9's macOS PyInstaller --onedir
 *     repackaging build)
 *
 * Both previously declared their own copy of `RELEASE_TAGS`; this file is now
 * the ONLY declaration site, so the two scripts structurally cannot disagree
 * about which version is being shipped (34.9-CONTEXT.md constraint 7).
 *
 * Phase 34.9 is a REPACKAGING change, not a runner upgrade -- none of these
 * values may change as part of that phase. A future version bump belongs to
 * its own dedicated upgrade plan, never silently alongside a packaging
 * change.
 */

// Genuinely used cross-module (meta/downloadHelperBinaries.ts,
// meta/pruneStaleHelperBinaries.ts) as a type-only import, plus (as of
// quick 260923-tip) referenced within THIS file by
// resolveRunnerTargetPlatform()'s own return type -- ts-prune has
// historically mis-classified this alias (see the now-removed
// meta/deadcode-baseline-unreachable.txt entry this comment replaces); the
// within-module reference introduced by resolveRunnerTargetPlatform() would
// otherwise flip that mis-classification to a NEW used-in-module finding
// rather than resolving it.
// ts-prune-ignore-next
export type SupportedPlatform = 'win32' | 'darwin' | 'linux'

// Parked (260922-vzw decision): imported by
// meta/downloadHelperBinaries.ts:15 (`import { ... type DownloadedBinary }
// from './releaseTags'`), a production meta/ script invisible to ts-prune.
// ts-prune-ignore-next
export type DownloadedBinary =
  | 'legendary'
  | 'gogdl'
  | 'nile'
  | 'comet'
  | 'epic-integration'

export const RELEASE_TAGS = {
  legendary: '0.21.0',
  gogdl: 'v1.3.0',
  nile: 'v1.2.0',
  comet: 'v0.2.0',
  'epic-integration': 'v0.4'
} as const satisfies Record<DownloadedBinary, string>

/**
 * Quick task 260923-tip, Layer 1: resolves which platform's runner assets
 * THIS build should fetch/vendor/demand. Shared by:
 *
 *   - meta/downloadHelperBinaries.ts (decides whether to fetch the darwin
 *     onedir archives at all)
 *   - meta/pruneStaleHelperBinaries.ts (decides which platform's population
 *     the prune guard demands before it will delete anything)
 *
 * Keying decision: this repo has NO existing target-platform signal for the
 * runner download. The one host-vs-target precedent is
 * `GAMELIB_SIDECAR_TARGET_TRIPLE` (meta/buildSidecarSea.ts's `resolveTriple`),
 * which covers the SEA sidecar only and says nothing about which runner
 * binaries to vendor. So this keys off the HOST (`process.platform`) by
 * default, with `GAMELIB_RUNNER_TARGET_PLATFORM` as an explicit override for
 * a future cross-platform leg. Host keying is correct for CI today:
 * `.github/actions/install-deps/action.yml` runs
 * `pnpm download-helper-binaries` on each matrix leg's own runner OS, so
 * host === target on every leg of `release-tauri.yml`.
 *
 * `''` is treated as unset (GitHub Actions renders an unset matrix field as
 * the empty string, mirroring `resolveTriple`'s documented rule). An
 * override that is not one of the three `SupportedPlatform` literals THROWS
 * naming the variable and the accepted values -- it never silently falls
 * back, which would turn a typo'd CI matrix field into a silently wrong
 * bundle.
 */
// Consumed by meta/downloadHelperBinaries.ts and
// meta/pruneStaleHelperBinaries.ts (production meta/ scripts invisible to
// ts-prune) plus meta/__tests__/runnerTargetPlatform.test.ts.
// ts-prune-ignore-next
export function resolveRunnerTargetPlatform(
  env: NodeJS.ProcessEnv = process.env,
  hostPlatform: NodeJS.Platform = process.platform
): SupportedPlatform {
  const override = env.GAMELIB_RUNNER_TARGET_PLATFORM
  if (typeof override === 'string' && override.length > 0) {
    if (override === 'win32' || override === 'darwin' || override === 'linux') {
      return override
    }
    throw new Error(
      `GAMELIB_RUNNER_TARGET_PLATFORM="${override}" is not a recognised ` +
        `SupportedPlatform -- accepted values are "win32", "darwin", "linux"`
    )
  }
  return hostPlatform as SupportedPlatform
}
