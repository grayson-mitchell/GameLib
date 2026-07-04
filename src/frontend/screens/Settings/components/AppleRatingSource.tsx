import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { MenuItem, SelectChangeEvent } from '@mui/material'
import { SelectField } from 'frontend/components/UI'
import ContextProvider from 'frontend/state/ContextProvider'
import SettingsContext from '../SettingsContext'
import { AppleRatingSource as AppleRatingSourceType } from 'common/types'

/**
 * DETAIL-02: app-wide choice of which AppleGamingWiki rating drives the macOS
 * compatibility surfaces (art pill + game-details compat row). macOS-only, and
 * only shown in the global (default) settings — it is not a per-game setting.
 */
const AppleRatingSource = () => {
  const { t } = useTranslation()
  const { isDefault } = useContext(SettingsContext)
  const { platform, appleRatingSource, setAppleRatingSource } =
    useContext(ContextProvider)

  if (!isDefault || platform !== 'darwin') {
    return <></>
  }

  const handleChange = (event: SelectChangeEvent) => {
    setAppleRatingSource(event.target.value as AppleRatingSourceType)
  }

  return (
    <SelectField
      htmlId="apple-rating-source"
      value={appleRatingSource}
      onChange={handleChange}
      label={t(
        'setting.apple_rating_source',
        'Mac compatibility rating source'
      )}
    >
      <MenuItem value="crossover">
        {t('setting.apple_rating_source_crossover', 'CrossOver')}
      </MenuItem>
      <MenuItem value="wine">
        {t('setting.apple_rating_source_wine', 'Wine')}
      </MenuItem>
    </SelectField>
  )
}

export default AppleRatingSource
