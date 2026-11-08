/**
 * Phase 68 (D-05/D-07): closed sets for the read-only stores notice. Shared by the
 * backend aggregate, the IPC schema and the renderer. Ids only, never store contents.
 */
export const READ_ONLY_AREAS = [
  'settings',
  'game-settings',
  'preferences',
  'steam-library',
  'gog-library',
  'epic-library',
  'amazon-library',
  'sideload-library',
  'steam-account',
  'gog-account',
  'epic-account',
  'amazon-account',
  'humble',
  'downloads',
  'play-history',
  'app-data'
] as const

export type ReadOnlyArea = (typeof READ_ONLY_AREAS)[number]

export const READ_ONLY_REASONS = ['newer', 'failed'] as const

type ReadOnlyReason = (typeof READ_ONLY_REASONS)[number]

export type ReadOnlyStoresNoticePayload = {
  entries: Array<{ area: ReadOnlyArea; reason: ReadOnlyReason }>
}
