/**
 * Types and consts; no work at import.
 *
 * Mirrors the result shapes of the `gamelib-steampoll` crate (serde camelCase; `Option` fields
 * serialise as null) and the op list each rustInvoke steampoll channel is generated from.
 */

/** @public Equal to the crate's `OPS`, sorted; the TS mirror of the Rust op list. */
export const STEAMPOLL_OPS = [
  'steampoll_acf_enumerate_copies',
  'steampoll_acf_find_other_manifests',
  'steampoll_acf_read_state',
  'steampoll_acf_read_update',
  'steampoll_acf_read_update_from_dir',
  'steampoll_acf_remove_copy',
  'steampoll_acf_scan_downloading',
  'steampoll_adoption_watch',
  'steampoll_breadcrumb_installed_on_disk',
  'steampoll_bridge_finalized',
  'steampoll_install_cancel_delegated',
  'steampoll_install_start',
  'steampoll_install_stop',
  'steampoll_mac_arch_verdict',
  'steampoll_native_in_flight',
  'steampoll_next_notice_seq',
  'steampoll_read_running_app_id',
  'steampoll_running_hold',
  'steampoll_running_last_app_id',
  'steampoll_running_release',
  'steampoll_running_start',
  'steampoll_running_stop',
  'steampoll_status',
  'steampoll_uninstall_start',
  'steampoll_uninstall_stop'
] as const

type AcfSource = 'native' | 'bottle' | 'bridge'

export interface PollRoots {
  steamRoot: string
  bottleSteamappsRoot?: string | null
  bridgeSteamappsRoot?: string | null
}

/** `steampoll_acf_read_state` result, tagged by `state`. */
export type AcfState =
  | { state: 'absent' }
  | { state: 'unknown' }
  | {
      state: 'downloading'
      stateFlags: number | null
      bytesDownloaded: number
      bytesToDownload: number
      bytesStaged: number
      bytesToStage: number
    }
  | {
      state: 'installed'
      stateFlags: number
      installPath: string
      sizeOnDisk: string
      buildid: string | null
    }

/** `steampoll_acf_read_update` result (null when no manifest yields fields). */
export interface AcfUpdateFields {
  steamappsDir: string
  buildid: string
  targetBuildId: string | null
  stateFlags: number
  bytesToDownload: number
  bytesDownloaded: number
  scheduledAutoUpdate: number
  betaKey: string | null
}

/** `steampoll_acf_remove_copy` result, tagged by `status`. */
export type RemoveCopyResult =
  | {
      status: 'removed'
      source: AcfSource
      manifestOnly: boolean
      bridgeBottle: string | null
    }
  | { status: 'absent'; source: AcfSource }
  | { status: 'refused'; source: AcfSource; [field: string]: unknown }

/** `steampoll_status` result. */
export interface PollStatus {
  installs: Array<{
    appId: string
    delegatedToSteamClient: boolean
    awaitingUpdate: boolean
    steamHold: 'unprobed' | 'holding' | 'released'
  }>
  uninstalls: string[]
  holding: string[]
}
