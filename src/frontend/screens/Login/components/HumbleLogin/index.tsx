import { useTranslation } from 'react-i18next'

import { Dialog, DialogHeader } from 'frontend/components/UI/Dialog'
import HumbleLoginSurface from '../../../WebView/components/HumbleLoginSurface'
import './index.scss'

interface Props {
  dismiss: () => void
}

/**
 * The Login screen's Humble sign-in overlay (quick task 260821-iri, Task 2).
 * Mirrors SteamLogin/index.tsx's final `Dialog` shape so the two overlays
 * share the same slide-up motion (Dialog.tsx's transitionDuration={500}).
 *
 * onDone/onCancelled both route straight to `dismiss` -- never `navigate` --
 * so the co-mounted overlay lifecycle in Login/index.tsx is the only thing
 * that ever closes this surface.
 */
export default function HumbleLogin({ dismiss }: Props) {
  const { t: tGamelib } = useTranslation('gamelib')

  return (
    <Dialog
      showCloseButton={true}
      onClose={dismiss}
      className="humbleLoginDialog"
    >
      <DialogHeader onClose={dismiss}>
        {tGamelib('login.humble_dialog_title', 'Sign in to Humble Bundle')}
      </DialogHeader>
      <div className="humbleLoginBody">
        <HumbleLoginSurface onDone={dismiss} onCancelled={dismiss} />
      </div>
    </Dialog>
  )
}
