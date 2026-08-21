import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { InfoBox, TextInputField } from 'frontend/components/UI'
import {
  callOrDeclare,
  STEAMGRIDDB_FEATURE,
  STEAMGRIDDB_CHANNEL_BY_MEMBER,
  DEFERRAL_D03
} from 'frontend/helpers/declaredUnavailable'

export default function SteamGridDbApiKey() {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [hasKey, setHasKey] = useState(false)
  // True once either site below declines under Tauri -- the field then renders disabled with an
  // unavailable notice instead of staying editable with a Save that silently does nothing
  // (T-34.5-C7-14).
  const [unavailable, setUnavailable] = useState(false)
  const url = 'www.steamgriddb.com/profile/preferences/api'

  useEffect(() => {
    const checkKey = async () => {
      const result = await callOrDeclare({
        channel: STEAMGRIDDB_CHANNEL_BY_MEMBER.hasApiKey,
        feature: STEAMGRIDDB_FEATURE,
        deferral: DEFERRAL_D03,
        call: () => window.api.steamgriddb.hasApiKey()
      })
      if (!result.ok) {
        setUnavailable(true)
        return
      }
      setHasKey(result.value)
    }
    void checkKey()
  }, [])

  const onChange = (newValue: string) => {
    setValue(newValue)
    const persistKey = async () => {
      const result = await callOrDeclare({
        channel: STEAMGRIDDB_CHANNEL_BY_MEMBER.setApiKey,
        feature: STEAMGRIDDB_FEATURE,
        deferral: DEFERRAL_D03,
        call: () => window.api.steamgriddb.setApiKey(newValue)
      })
      if (!result.ok) {
        setUnavailable(true)
        return
      }
      setHasKey(!!newValue)
    }
    void persistKey()
  }

  const placeholder = unavailable
    ? t('settings.steamgriddb.apikey.unavailable', 'Unavailable on this build')
    : hasKey
      ? t(
          'settings.steamgriddb.apikey.placeholder_saved',
          'Key saved — type to replace, clear to remove'
        )
      : t(
          'settings.steamgriddb.apikey.placeholder',
          'Enter your SteamGridDB API Key here'
        )

  return (
    <TextInputField
      label={t('settings.steamgriddb.apikey.title', 'SteamGridDB API Key')}
      placeholder={placeholder}
      onChange={onChange}
      value={value}
      htmlId="steamgriddb-api-key"
      type="password"
      disabled={unavailable}
      afterInput={
        <InfoBox text={t('settings.advanced.details', 'Details')}>
          <span style={{ userSelect: 'text' }}>
            {unavailable
              ? t(
                  'settings.steamgriddb.help.unavailableDetail',
                  'SteamGridDB artwork support is deferred to a future release (D-03, Phase 34.6) and cannot be configured from this build.'
                )
              : t(
                  'settings.steamgriddb.help.description',
                  'Provide your own SteamGridDB API key to enable game cover search. The key is stored encrypted when your system supports it. You can get one at {{url}}',
                  { url }
                )}
          </span>
        </InfoBox>
      }
    />
  )
}
