import { useEffect, useState } from 'react'
import type { Runner } from 'common/types'
import { reportRowActionFailure } from './rowAction'
import { logShowInSteamActivation, type RowActivation } from './rowActivation'

/**
 * Phase 100 (D-01, D-12, D-18): the Show in Steam switch's state and handler,
 * moved here from the ⋮ menu, which Phase 100 removed.
 *
 * `addedToSteam` flips only from the backend's answer. A rejection, or an add
 * that answers false (which contradicts the request), marks the row failed so
 * it shows fixed text with Retry instead of an error dialog; the raw error
 * reaches only the log (T-100-19). `handleAddToSteam` never rethrows and
 * always clears `steamRefresh`.
 *
 * `enabled` gates the probe: Steam games are already in Steam and never ask.
 */
export function useSteamShortcut(
  appName: string,
  runner: Runner,
  enabled: boolean
) {
  const [addedToSteam, setAddedToSteam] = useState<boolean>(false)
  const [steamRefresh, setSteamRefresh] = useState<boolean>(false)
  const [steamFailed, setSteamFailed] = useState<boolean>(false)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    // Check for game shortcuts on Steam; this runs for a game that is not
    // installed too, since the shortcut can outlive the install.
    window.api
      .isAddedToSteam(appName, runner)
      .then((added) => {
        if (!cancelled) setAddedToSteam(added)
      })
      .catch((error) =>
        reportRowActionFailure({ action: 'isAddedToSteam', appName, error })
      )
    return () => {
      cancelled = true
    }
  }, [enabled, appName, runner])

  // RF3: `activation` says what pressed the row; the Retry link passes none.
  async function handleAddToSteam(activation?: RowActivation) {
    logShowInSteamActivation({
      appName,
      runner,
      action: addedToSteam ? 'remove' : 'add',
      activation
    })
    setSteamFailed(false)
    setSteamRefresh(true)
    try {
      if (addedToSteam) {
        await window.api
          .removeFromSteam(appName, runner)
          .then(() => setAddedToSteam(false))
      } else {
        await window.api.addToSteam(appName, runner).then((added) => {
          setAddedToSteam(added)
          if (!added) {
            // D-18: the add answered false, which contradicts the request.
            reportRowActionFailure({
              action: 'addToSteam',
              appName,
              error: new Error('addToSteam answered false')
            })
            setSteamFailed(true)
          }
        })
      }
    } catch (error) {
      // A rejection (an unset GAMELIB_SHELL_EXE, a corrupt shortcuts.vdf, the
      // invoke bound) used to leave steamRefresh true until remount.
      reportRowActionFailure({
        action: addedToSteam ? 'removeFromSteam' : 'addToSteam',
        appName,
        error
      })
      setSteamFailed(true)
    } finally {
      setSteamRefresh(false)
    }
  }

  return { addedToSteam, steamRefresh, steamFailed, handleAddToSteam }
}
