import { useTranslation } from 'react-i18next'

import { Dialog, DialogHeader } from 'frontend/components/UI/Dialog'
import { useSuppressStoreEmbed } from 'frontend/components/UI/NavShell/StoreEmbedSuppressionContext'
import HumbleLoginSurface from '../../../WebView/components/HumbleLoginSurface'
import TauriLoginPanel from '../../../WebView/components/TauriLoginPanel'
import './index.scss'

interface Props {
  dismiss: () => void
}

/**
 * The Login screen's Humble sign-in overlay (quick task 260821-iri, Task 2).
 *
 * 261003: this overlay no longer renders any chrome for the in-progress
 * phases. It used to mount a `Dialog` for the whole of the watch whose only
 * content was `TauriLoginPanel`'s static "A sign-in window has opened"
 * copy -- a surface with nothing on it to interact with, since the native
 * WKWebView sign-in window does all the work. Live, it read as a
 * superfluous panel: it opened *underneath* the native window, and then
 * flashed back on screen for `Dialog`'s own 500ms Slide exit while the
 * overlay tore down. Nothing was lost by deleting it, because nothing on it
 * was ever actionable.
 *
 * What survives is the part that is: F-34.4.2-19's failure surface. A watch
 * that settles 'error' or 'timeout' still gets the full Dialog, with the
 * heading, body and Retry button `TauriLoginPanel`'s shared OAuth branches
 * already render for the other runners. Those are the only two phases that
 * have anything to say.
 *
 * `renderState` (not a `phase` callback) is what makes this safe:
 * `HumbleLoginSurface` owns the login watch, so it stays mounted at a
 * stable position in the element tree while the Dialog mounts and unmounts
 * *inside* it. Hoisting the conditional out here would remount the surface
 * on every phase change and restart the watch with it.
 *
 * `useSuppressStoreEmbed()` is called here explicitly. It used to come for
 * free from `Dialog`, which acquires suppression by mounting (Phase 40 Plan
 * 06, D-18/D-20) -- with the Dialog now absent for most of this overlay's
 * life, this call is what keeps the suppression window exactly as wide as
 * it was before: the whole mounted lifetime of the overlay.
 *
 * onDone/onCancelled both route straight to `dismiss` -- never `navigate` --
 * so the co-mounted overlay lifecycle in Login/index.tsx is the only thing
 * that ever closes this surface.
 */
export default function HumbleLogin({ dismiss }: Props) {
  const { t: tGamelib } = useTranslation('gamelib')

  useSuppressStoreEmbed()

  return (
    <HumbleLoginSurface
      onDone={dismiss}
      onCancelled={dismiss}
      renderState={(state) =>
        state.phase === 'error' || state.phase === 'timeout' ? (
          <Dialog
            showCloseButton={true}
            onClose={dismiss}
            className="humbleLoginDialog"
          >
            <DialogHeader onClose={dismiss}>
              {tGamelib(
                'login.humble_dialog_title',
                'Sign in to Humble Bundle'
              )}
            </DialogHeader>
            <div className="humbleLoginBody">
              <TauriLoginPanel runner="humble" state={state} />
            </div>
          </Dialog>
        ) : null
      }
    />
  )
}
