import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import ContextProvider from 'frontend/state/ContextProvider'
import { ToggleSwitch } from 'frontend/components/UI'
import useSetting from 'frontend/hooks/useSetting'

const UseDarkTrayIcon = () => {
  const { t } = useTranslation()
  const { platform } = useContext(ContextProvider)
  const isMac = platform === 'darwin'

  const [darkTrayIcon, setDarkTrayIcon] = useSetting('darkTrayIcon', false)

  const toggleDarkTrayIcon = () => {
    setDarkTrayIcon(!darkTrayIcon)
    window.api.changeTrayColor()
  }

  // D-05 (Phase 35 Plan 06): nothing ships an affordance it cannot honour.
  //
  // This toggle is fully wired and genuinely works on Windows and Linux:
  // `changeTrayColor` -> appShellFlowRegistration's `changeTrayColor` listener ->
  // `requestRustInvoke(RUST_TRAY_SET_ICON, [{ dark }])` -> main.rs's `tray_set_icon`
  // arm -> `tray_image(dark)`, which selects TRAY_ICON_DARK vs TRAY_ICON_LIGHT.
  //
  // On macOS `tray_image()` returns the AppKit TEMPLATE silhouette regardless of
  // `dark` (main.rs:83-93 states this at length): the template's shape lives in
  // alpha and macOS inverts it against the menu-bar appearance automatically, so
  // there is nothing for the setting to select between. That is a deliberate
  // design decision, not a bug — but it means a macOS user could flip this switch
  // forever and see no change, which is exactly the lying affordance D-05 exists
  // to remove. A prose comment in a Rust file is not a defence: the person being
  // misled is looking at a settings panel.
  //
  // Hidden rather than deleted: the control does real work on two of three
  // platforms, and deleting it would remove working functionality to fix a
  // macOS-only problem. The `darkTrayIcon` config key is deliberately left in
  // place — a persisted key with no UI on one platform is harmless, and Windows
  // and Linux still read and write it through this same component.
  if (isMac) {
    return <></>
  }

  return (
    <ToggleSwitch
      htmlId="changeTrayColor"
      value={darkTrayIcon}
      handleChange={toggleDarkTrayIcon}
      title={t('setting.darktray', 'Use Dark Tray Icon (needs restart)')}
    />
  )
}

export default UseDarkTrayIcon
