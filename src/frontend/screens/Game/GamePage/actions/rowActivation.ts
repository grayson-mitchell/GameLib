import {
  STALE_CLICK_WINDOW_MS,
  msSinceDialogClose
} from 'frontend/components/UI/Dialog/dialogCloseClock'

/**
 * RF3 (debug session rf3-cancel-removes-shortcut): where an Install-tab switch
 * activation came from.
 *
 * Cancel in the uninstall dialog was seen once to remove a game's Steam shortcut,
 * the live probe could not reproduce it, and the log of that run only said that
 * the Show in Steam switch was toggled, not by what. A switch row therefore hands
 * its handler this record, and the Show in Steam handler logs it on every add and
 * remove, so the next sighting names the event (a click or a key, trusted or
 * synthetic, a double click, a key repeat) and how long after a dialog closed it
 * landed.
 */
export interface RowActivation {
  type: 'click' | 'keydown'
  isTrusted: boolean
  /** A click's click count (1 for a mouse press, 0 for a synthetic click such as the gamepad's); 0 for a key. */
  detail: number
  /** The key of a keydown; '' for a click. */
  key: string
  repeat: boolean
  /** Whole ms since a dialog last closed, null when none has this session. */
  sinceDialogCloseMs: number | null
}

/** The slice of a React click or keydown event this reads, all of it optional. */
interface ActivationEventLike {
  isTrusted?: boolean
  detail?: number
  key?: string
  repeat?: boolean
}

/**
 * Builds the record from a click or keydown. Every field tolerates a missing
 * value, because the row's own unit tests call its handlers with no event or a
 * bare `{ key }` object.
 */
export function activationOf(
  type: RowActivation['type'],
  event?: ActivationEventLike
): RowActivation {
  return {
    type,
    isTrusted: Boolean(event?.isTrusted),
    detail: event?.detail ?? 0,
    key: type === 'keydown' ? (event?.key ?? '') : '',
    repeat: Boolean(event?.repeat),
    sinceDialogCloseMs: msSinceDialogClose()
  }
}

/**
 * True for a pointer click that landed within `STALE_CLICK_WINDOW_MS` of a dialog
 * closing. A pointer click carries `detail >= 1` (the click count: the probe saw
 * detail=1 on every real press in the WebView); the gamepad's main action
 * dispatches `new MouseEvent('click', ...)` with no `detail`
 * (`tauriGamepadInput.ts` `dispatchPointerSequence`), so it carries 0 and is
 * never ignored.
 */
export function isStalePointerClick(activation: RowActivation): boolean {
  return (
    activation.type === 'click' &&
    activation.detail > 0 &&
    activation.sinceDialogCloseMs !== null &&
    activation.sinceDialogCloseMs < STALE_CLICK_WINDOW_MS
  )
}

/** `event=click trusted=true detail=1 key=- repeat=false sinceDialogCloseMs=312` */
export function describeActivation(activation: RowActivation): string {
  const since =
    activation.sinceDialogCloseMs === null
      ? 'none'
      : String(activation.sinceDialogCloseMs)
  return (
    `event=${activation.type} trusted=${activation.isTrusted} ` +
    `detail=${activation.detail} key=${activation.key || '-'} ` +
    `repeat=${activation.repeat} sinceDialogCloseMs=${since}`
  )
}

function logInfoQuietly(line: string): void {
  try {
    window.api.logInfo(line)
  } catch {
    // A missing log signal must never turn a switch press into a failure.
  }
}

/**
 * One line per add or remove from the Show in Steam row, in the `[Shortcuts]`
 * style the backend's own lines use (the renderer log adds `[Frontend]`).
 * `activation` is absent for the failure row's Retry button, which is a click on
 * a different control.
 */
export function logShowInSteamActivation({
  appName,
  runner,
  action,
  activation
}: {
  appName: string
  runner: string
  action: 'add' | 'remove'
  activation?: RowActivation
}): void {
  logInfoQuietly(
    `[Shortcuts] Show in Steam activation: action=${action} ` +
      `${activation ? describeActivation(activation) : 'event=retry'} ` +
      `appName=${appName} runner=${runner}`
  )
}

/** The line for a click a switch row ignored as a stale second click. */
export function logIgnoredStaleClick(
  rowId: string,
  activation: RowActivation
): void {
  logInfoQuietly(
    `[SwitchRow] ignored a pointer click on ${rowId}: ` +
      `${describeActivation(activation)} (a dialog closed under ` +
      `${STALE_CLICK_WINDOW_MS} ms before; a stale second click, not a toggle)`
  )
}
