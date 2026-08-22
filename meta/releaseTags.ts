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

export type SupportedPlatform = 'win32' | 'darwin' | 'linux'

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
