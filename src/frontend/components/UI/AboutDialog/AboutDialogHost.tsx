import { useEffect, useState } from 'react'

import { SHOW_ABOUT_DIALOG_EVENT } from 'common/aboutDialogEvent'
import AboutDialog from './index'

/**
 * Mounts `AboutDialog` in response to `SHOW_ABOUT_DIALOG_EVENT` (quick
 * `260905-d33`). Mounted once, at app level (`App.tsx`), beside the other
 * app-wide dialogs.
 *
 * App level rather than inside `SettingsPanel` because About has two entry
 * points and only one of them is React: the Settings row calls
 * `window.api.showAboutWindow()`, and the macOS tray's "About GameLib" item
 * reaches that same name by `eval` from Rust. A dialog owned by the Settings
 * panel would exist only while that tier-2 panel is mounted, so the tray item
 * would do nothing whenever the user was anywhere else in the app.
 *
 * Renders nothing until asked -- the dialog is unmounted, not hidden, so it
 * costs no `getHeroicVersion()` round-trip until someone opens it.
 */
export default function AboutDialogHost() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener(SHOW_ABOUT_DIALOG_EVENT, show)
    return () => window.removeEventListener(SHOW_ABOUT_DIALOG_EVENT, show)
  }, [])

  if (!open) return null

  return <AboutDialog onClose={() => setOpen(false)} />
}
