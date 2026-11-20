import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { InfoBox, TextInputField } from 'frontend/components/UI'
import useSetting from 'frontend/hooks/useSetting'
import SettingsContext from '../SettingsContext'

const LauncherArgs = () => {
  const { t } = useTranslation()
  const { isDefault } = useContext(SettingsContext)
  const [launcherArgs, setLauncherArgs] = useSetting('launcherArgs', '')
  const [error, setError] = useState('')

  const handleLauncherArgs = (newValue: string) => setLauncherArgs(newValue)

  useEffect(() => {
    if (launcherArgs.match(/%command/)) {
      setError(
        t(
          'options.gameargs.error.command',
          'The %command% syntax from Steam is not valid as game arguments.'
        )
      )
    } else if (launcherArgs.match(/[A-Z_]+=\S/)) {
      setError(
        t(
          'options.gameargs.error.env',
          'Environment variables must be configured in the table below.'
        )
      )
    } else {
      setError('')
    }
  }, [launcherArgs])

  if (isDefault) {
    return <></>
  }

  const launcherArgsInfo = (
    <InfoBox text="infobox.help" iconOnly>
      {t(
        'gamelib:settings.fields.launchArguments.help',
        'Passed to the game executable after its own arguments, for example -nolauncher to skip the launcher in some games.'
      )}
    </InfoBox>
  )

  let errorDiv = <></>
  if (error) {
    errorDiv = <p className="error">{error}</p>
  }

  return (
    <TextInputField
      label={t(
        'gamelib:settings.fields.launchArguments.label',
        'Launch arguments'
      )}
      htmlId="launcherArgs"
      placeholder={t('options.gameargs.placeholder')}
      value={launcherArgs}
      onChange={handleLauncherArgs}
      afterInput={errorDiv}
      labelHelp={launcherArgsInfo}
    />
  )
}

export default LauncherArgs
