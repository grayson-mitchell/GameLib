import { ToggleSwitch } from 'frontend/components/UI'
import useSetting from 'frontend/hooks/useSetting'
import { useTranslation } from 'react-i18next'
import useSettingsState from '../../../state/settingsState'

const HideChangelogOnStartup = () => {
  const { t } = useTranslation()
  const [hideChangelogsOnStartupSetting, setHideChangelogsOnStartupSetting] =
    useSetting('hideChangelogsOnStartup', false)
  const setHideChangelogsOnStartup = useSettingsState(
    (s) => s.setHideChangelogsOnStartup
  )

  const handleChange = () => {
    setHideChangelogsOnStartupSetting(!hideChangelogsOnStartupSetting)
    setHideChangelogsOnStartup(!hideChangelogsOnStartupSetting)
  }

  return (
    <ToggleSwitch
      htmlId="hideChangelogsOnStartup"
      value={hideChangelogsOnStartupSetting}
      handleChange={handleChange}
      title={t(
        'setting.hideChangelogsOnStartup',
        "Don't show changelogs on Startup"
      )}
    />
  )
}

export default HideChangelogOnStartup
