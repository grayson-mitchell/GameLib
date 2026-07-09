import { ToggleSwitch } from 'frontend/components/UI'
import useSetting from 'frontend/hooks/useSetting'
import { useTranslation } from 'react-i18next'
import InfoIcon from 'frontend/components/UI/InfoIcon'

const NotifyHumbleExpirations = () => {
  const { t } = useTranslation()
  const [notifyHumbleExpirations, setNotifyHumbleExpirations] = useSetting(
    'notifyHumbleExpirations',
    true
  )

  return (
    <div className="toggleRow">
      <ToggleSwitch
        htmlId="notifyHumbleExpirations"
        value={notifyHumbleExpirations}
        handleChange={() =>
          setNotifyHumbleExpirations(!notifyHumbleExpirations)
        }
        title={t(
          'setting.notifyHumbleExpirations',
          'Notify when Humble keys gain expiration dates'
        )}
      />
      <InfoIcon
        text={t(
          'help.notifyHumbleExpirations',
          "Get an OS notification when a Humble key you haven't claimed gains an expiration date."
        )}
      />
    </div>
  )
}

export default NotifyHumbleExpirations
