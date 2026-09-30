import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { MenuItem, SelectChangeEvent } from '@mui/material'
import ContextProvider from 'frontend/state/ContextProvider'
import { SelectField } from 'frontend/components/UI'
import useSetting from 'frontend/hooks/useSetting'
import {
  TrayIconVariant,
  displayedTrayIconVariant,
  isTrayIconVariant,
  trayIconVariantOptions
} from 'common/trayIconVariant'

const UseDarkTrayIcon = () => {
  const { t } = useTranslation()
  const { platform } = useContext(ContextProvider)

  const [trayIconVariant, setTrayIconVariant] = useSetting(
    'trayIconVariant',
    'auto'
  )

  const options = trayIconVariantOptions(platform)

  // Literal `t()` calls only: the i18next parser extracts literal keys, so the key is never
  // templated. Each fallback equals its shipped `translation.json` string (gated by
  // `trayIconVariantSetting.test.ts`). The labels spell out the taskbar each glyph is for,
  // because "Dark" alone is ambiguous between the glyph and the taskbar.
  const labels: Record<TrayIconVariant, string> = {
    auto: t('setting.tray-icon-variant.auto', 'Auto (match the taskbar)'),
    dark: t('setting.tray-icon-variant.dark', 'Dark icon (for light taskbars)'),
    light: t(
      'setting.tray-icon-variant.light',
      'Light icon (for dark taskbars)'
    )
  }

  const onVariantChange = (event: SelectChangeEvent) => {
    const next = event.target.value
    if (!isTrayIconVariant(next)) {
      return
    }
    setTrayIconVariant(next)
    window.api.changeTrayColor()
  }

  // D-05 (Phase 35 Plan 06): nothing ships an affordance it cannot honour.
  //
  // The selector is fully wired and applies immediately, with no restart (live-confirmed on
  // 2026-09-26): `changeTrayColor` -> appShellFlowRegistration's `changeTrayColor` listener ->
  // `syncTrayIcon` -> `requestRustInvoke(RUST_TRAY_SET_ICON, [{ variant }])` -> main.rs's
  // `tray_set_icon` arm -> `resolve_tray_icon_dark` -> `tray_image(dark)`, which selects
  // TRAY_ICON_DARK vs TRAY_ICON_LIGHT.
  //
  // Windows: Auto / Light / Dark. Auto follows the TASKBAR theme (`SystemUsesLightTheme`),
  // never the app theme, and re-reads it when it changes.
  //
  // Linux: Light / Dark only. There is no reliable panel-colour signal (tray hosts vary and
  // the XDG colour-scheme is an app hint, not the panel colour), so Auto is not offered. A
  // stored Auto -- the migrated value for every Linux user who never touched the old toggle --
  // resolves to the white glyph and is DISPLAYED as "Light icon", which is what the tray shows.
  // Picking either option writes an explicit value.
  //
  // macOS: nothing rendered. `tray_image()` returns the AppKit TEMPLATE silhouette regardless
  // of the variant (main.rs states this at length): the template's shape lives in alpha and
  // macOS inverts it against the menu-bar appearance automatically, so there is nothing to
  // select between. A macOS user could otherwise flip this forever and see no change, which
  // is exactly the lying affordance D-05 exists to remove.
  if (options.length === 0) {
    return <></>
  }

  return (
    <SelectField
      label={t('setting.tray-icon-variant.label', 'Tray Icon')}
      htmlId="trayIconVariant"
      onChange={onVariantChange}
      value={displayedTrayIconVariant(trayIconVariant, platform)}
    >
      {options.map((variant) => (
        <MenuItem key={variant} value={variant}>
          {labels[variant]}
        </MenuItem>
      ))}
    </SelectField>
  )
}

export default UseDarkTrayIcon
