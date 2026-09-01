import { useCallback, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import ContextProvider from 'frontend/state/ContextProvider'

/**
 * Derived from the API signature rather than imported, so this wrapper's parameter type can
 * never drift from the channel it wraps. (The nominal type is `OpenDialogOptions` from
 * `backend/platform` — a renderer module must not reach into the backend barrel for it.)
 */
type OpenDialogOptions = Parameters<typeof window.api.openDialog>[0]

/**
 * Guarded wrapper around `window.api.openDialog` (quick task 260902-8wc, item 3 of the folded
 * todo `2026-08-24-opendialog-is-missing-from-long-running-channels-...`).
 *
 * Every one of the seven `window.api.openDialog(...)` call sites used to consume the promise
 * unguarded — four bare `await`s with no try/catch, three `.then()` chains with no `.catch()`.
 * A rejected picker therefore produced an unhandled rejection in the renderer, visible in the
 * devtools console and nowhere else, with no user-facing signal at all.
 *
 * The todo was filed when that rejection was routine: the shell bounded the outer `openDialog`
 * channel at 60s, so any picker the user lingered in rejected. Phase 35 plan 07 removed that
 * bound (`openDialog` is now on `LONG_RUNNING_CHANNELS`), which makes a rejection rare rather
 * than impossible — a dead sidecar, a closed transport or an unported channel all still reject.
 * Rare is the argument for handling it properly, not for leaving it unhandled: these are exactly
 * the cases where a silent no-op is least explicable to the person looking at the screen.
 *
 * Returns the picked path, or `false` when the user cancelled AND when the picker failed. The
 * two are deliberately indistinguishable to callers — every call site already branches on a
 * falsy result and must not act on a failure, and the failure has already been surfaced here as
 * both a logged error and a visible dialog. Callers stay a single `if (path)` check.
 */
export default function useOpenDialog() {
  const { showDialogModal } = useContext(ContextProvider)
  const { t } = useTranslation('gamelib')

  return useCallback(
    async (options: OpenDialogOptions): Promise<string | false> => {
      try {
        return await window.api.openDialog(options)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        window.api.logError(`openDialog failed: ${detail}`)
        showDialogModal({
          showDialog: true,
          type: 'ERROR',
          title: t(
            'gamelib:box.filePicker.error.title',
            'Could not open the file picker'
          ),
          message: t(
            'gamelib:box.filePicker.error.message',
            'GameLib could not open the system file picker, so nothing was selected and no changes were made. ({{error}})',
            { error: detail }
          )
        })
        return false
      }
    },
    [showDialogModal, t]
  )
}
