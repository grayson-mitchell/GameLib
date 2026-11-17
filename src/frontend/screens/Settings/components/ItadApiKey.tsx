import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { InfoBox, TextInputField } from 'frontend/components/UI'

/**
 * Optional user IsThereAnyDeal key (Phase 47, D-05/D-06). The stored value is
 * never read back: the field always starts empty and only the booleans from
 * `getKeyStatus` drive the placeholder and the rejected warning (T-47-46).
 */
export default function ItadApiKey() {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [hasKey, setHasKey] = useState(false)
  // Session-only: flips after a real search/deals call got 401/403 with the user key.
  const [rejected, setRejected] = useState(false)
  // IPC failed: render disabled instead of a field whose saves silently do nothing (T-47-48).
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    const readStatus = async () => {
      try {
        const status = await window.api.itad.getKeyStatus()
        setHasKey(status.hasKey)
        setRejected(status.rejected)
      } catch {
        setUnavailable(true)
      }
    }
    void readStatus()
  }, [])

  const onChange = (newValue: string) => {
    setValue(newValue)
    // Editing or clearing the key resolves the warning (the backend resets it too).
    setRejected(false)
    const persistKey = async () => {
      try {
        await window.api.itad.setApiKey(newValue)
        setHasKey(!!newValue)
      } catch {
        setUnavailable(true)
      }
    }
    void persistKey()
  }

  const placeholder = unavailable
    ? t('settings.itad.apikey.unavailable', 'Unavailable on this build')
    : hasKey
      ? t(
          'settings.itad.apikey.placeholder_saved',
          'Key saved — type to replace, clear to remove'
        )
      : t(
          'settings.itad.apikey.placeholder',
          'Enter your IsThereAnyDeal API key (optional)'
        )

  return (
    <>
      <TextInputField
        label={t('settings.itad.apikey.title', 'IsThereAnyDeal API Key')}
        placeholder={placeholder}
        onChange={onChange}
        value={value}
        htmlId="itad-api-key"
        type="password"
        disabled={unavailable}
        labelHelp={
          <InfoBox text={t('settings.advanced.details', 'Details')} iconOnly>
            <span style={{ userSelect: 'text' }}>
              {t(
                'settings.itad.help.description',
                'Optional. Store Search uses a built-in IsThereAnyDeal key. If you have your own key from isthereanydeal.com/apps/my, enter it here and it is used instead. The key is stored encrypted when your system supports it.'
              )}
            </span>
          </InfoBox>
        }
      />
      {rejected && (
        <p
          role="status"
          className="itadApiKey__rejected"
          style={{ color: 'var(--status-danger)' }}
        >
          {t(
            'settings.itad.apikey.rejected',
            'ITAD rejected this key, so Store Search is using the built-in key.'
          )}
        </p>
      )}
    </>
  )
}
