import type { Status } from 'common/types'

/**
 * quick/261024-i23: whether a backend status ends GamePage's local Play-click
 * latch. `playing` must release it as well as `launching`: a status proving the
 * launch took over has to end the click latch, because the launch IPC is not
 * guaranteed to resolve (a cold bottled Steam keeps it pending for the whole
 * session). Pre-launch states such as `syncing-saves` must NOT release it.
 */
export function releasesPlayClicked(status: Status | undefined): boolean {
  return status === 'launching' || status === 'playing'
}
