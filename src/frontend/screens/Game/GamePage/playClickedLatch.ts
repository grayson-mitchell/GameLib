import type { GameStatus, Status } from 'common/types'

/**
 * quick/261024-i23: whether a backend status ends GamePage's local Play-click
 * latch. `playing` must release it as well as `launching`: a status proving the
 * launch took over has to end the click latch, because the launch IPC is not
 * guaranteed to resolve (a cold bottled Steam keeps it pending for the whole
 * session). Pre-launch states such as `syncing-saves` must NOT release it.
 *
 * 87-73 (RF2): `done` and `error` end it too. They are how a launch that never
 * reached `playing` ends (a refused engine step, a failed Wine check), and
 * nothing else is promised to resolve the launch IPC in that case.
 */
export function releasesPlayClicked(status: Status | undefined): boolean {
  return (
    status === 'launching' ||
    status === 'playing' ||
    status === 'done' ||
    status === 'error'
  )
}

/**
 * The same rule applied to a backend frame, for this game only. GamePage's rendered
 * status goes through store state and effects, so `launching` and `done` sent back
 * to back can both pass between two renders and the status effect then sees neither.
 */
export function releasesPlayClickedForFrame(
  frame: Pick<GameStatus, 'appName' | 'runner' | 'status'>,
  appName: string,
  runner: string
): boolean {
  return (
    frame.appName === appName &&
    (frame.runner === undefined || frame.runner === runner) &&
    releasesPlayClicked(frame.status)
  )
}
