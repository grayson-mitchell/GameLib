import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MenuItem, SelectChangeEvent } from '@mui/material'
import SelectField from 'frontend/components/UI/SelectField'
import InfoIcon from 'frontend/components/UI/InfoIcon'
import useSetting from 'frontend/hooks/useSetting'
import type { SteamEngineOption } from 'common/types/steam'

type T = (
  key: string,
  defaultValue: string,
  opts?: Record<string, unknown>
) => string

/**
 * D-14: the per-game engine override. Advanced, collapsed, defaults to
 * Automatic, and loudly unsupported when used. D-08: this select is the only
 * route to the previous pinned build -- there is no separate rollback toggle.
 * Only ids returned by listSteamEngineOptions are offered (T-59-52), and no
 * filesystem path is ever built or shown.
 */
export function optionLabel(o: SteamEngineOption, t: T): string {
  if (o.kind === 'automatic')
    return t(
      'steam.engine.override.automatic',
      'Automatic (CrossOver, then built-in)'
    )
  if (o.kind === 'crossover')
    return t('steam.engine.override.crossover', 'CrossOver')
  let label = o.label
  if (o.kind === 'pinned') {
    if (o.isPreviousPin)
      label = t(
        'steam.engine.override.previous',
        '{{label}} (previous build)',
        {
          label
        }
      )
    if (!o.installed)
      label = t(
        'steam.engine.override.notInstalled',
        '{{label}} (downloads on first launch)',
        { label }
      )
  }
  return label
}

/** A stored value not offered by the options is treated as Automatic. */
export function effectiveValue(
  stored: string | undefined,
  options: SteamEngineOption[]
): string {
  return stored && options.some((o) => o.id === stored) ? stored : 'automatic'
}

interface ViewProps {
  options: SteamEngineOption[]
  stored: string | undefined
  onOpen: () => void
  onChange: (id: string) => void
  t: T
}

export function SteamEngineOverrideView({
  options,
  stored,
  onOpen,
  onChange,
  t
}: ViewProps) {
  const value = effectiveValue(stored, options)
  return (
    <details
      className="steamEngineOverride"
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open) onOpen()
      }}
    >
      <summary>
        {t('steam.engine.override.summary', 'Engine (advanced)')}
      </summary>
      <SelectField
        htmlId="steamEngineOverride"
        value={value}
        label={t('steam.engine.override.label', 'Engine')}
        labelHelp={
          <InfoIcon
            text={t(
              'steam.engine.override.help',
              'Choose the Wine engine for this game. Automatic uses CrossOver when it works and the built-in engine otherwise.'
            )}
          />
        }
        onChange={(e: SelectChangeEvent) => onChange(e.target.value)}
        afterSelect={
          value !== 'automatic' ? (
            <span className="smallInputInfo danger">
              {t(
                'steam.engine.override.warning',
                "Unsupported — known fixes and compatibility ratings don't apply"
              )}
            </span>
          ) : undefined
        }
      >
        {options.map((o) => (
          <MenuItem key={o.id} value={o.id} disabled={!o.available}>
            {optionLabel(o, t)}
          </MenuItem>
        ))}
      </SelectField>
    </details>
  )
}

const SteamEngineOverride = () => {
  const { t } = useTranslation('gamelib')
  const [override, setOverride] = useSetting('steamEngineOverride', 'automatic')
  const [options, setOptions] = useState<SteamEngineOption[]>([])
  const [fetched, setFetched] = useState(false)

  const load = () => {
    if (fetched) return
    setFetched(true)
    void window.api
      .listSteamEngineOptions()
      .then(setOptions)
      .catch(() => setFetched(false))
  }

  return (
    <SteamEngineOverrideView
      options={options}
      stored={override}
      onOpen={load}
      onChange={setOverride}
      t={t as unknown as T}
    />
  )
}

export default SteamEngineOverride
