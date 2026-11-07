import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MenuItem, SelectChangeEvent } from '@mui/material'
import SelectField from 'frontend/components/UI/SelectField'
import InfoIcon from 'frontend/components/UI/InfoIcon'
import useSetting from 'frontend/hooks/useSetting'
import SettingsContext from 'frontend/screens/Settings/SettingsContext'
import { useSteamEngineState } from 'frontend/state/SteamEngineState'
import type { EngineOption } from 'common/types/engine'

type T = (
  key: string,
  defaultValue: string,
  opts?: Record<string, unknown>
) => string

/**
 * D-14: the per-game engine override. On the Wine tab (quick 261104-tm6;
 * D-14 placed it under Advanced), collapsed, defaults to
 * Automatic, and loudly unsupported when used. D-08: this select is the only
 * route to the previous pinned build -- there is no separate rollback toggle.
 * Only ids returned by listSteamEngineOptions are offered (T-59-52), and no
 * filesystem path is ever built or shown.
 */
export function optionLabel(o: EngineOption, t: T): string {
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

/** The select always shows what is stored (59-UAT WR-05, G12b). */
export function selectValue(stored: string | undefined): string {
  return stored || 'automatic'
}

function idLabel(id: string, t: T): string {
  if (id === 'crossover')
    return t('steam.engine.override.crossover', 'CrossOver')
  if (id.startsWith('wine-manager:'))
    return `Wine Manager: ${id.slice('wine-manager:'.length)}`
  if (id.startsWith('pinned:')) return id.slice('pinned:'.length)
  return id
}

/**
 * WR-05: a stored id the loaded options do not offer is still shown, as a
 * disabled "<label> (not installed)" entry, so choosing Automatic is a real
 * change. Before the options load, a single disabled entry stands in for the
 * stored value so the select never shows Automatic for something else. The
 * label is derived from the id only -- never a filesystem path (T-59-70).
 */
export function storedExtraOption(
  stored: string | undefined,
  options: EngineOption[],
  loaded: boolean,
  t: T
): { id: string; label: string } | null {
  const value = selectValue(stored)
  if (!loaded) {
    return {
      id: value,
      label:
        value === 'automatic'
          ? t(
              'steam.engine.override.automatic',
              'Automatic (CrossOver, then built-in)'
            )
          : idLabel(value, t)
    }
  }
  if (value === 'automatic' || options.some((o) => o.id === value)) return null
  return {
    id: value,
    label: t(
      'steam.engine.override.storedUnavailable',
      '{{label}} (not installed)',
      { label: idLabel(value, t) }
    )
  }
}

interface ViewProps {
  options: EngineOption[]
  stored: string | undefined
  loaded: boolean
  onChange: (id: string) => void
  t: T
}

export function SteamEngineOverrideView({
  options,
  stored,
  loaded,
  onChange,
  t
}: ViewProps) {
  const value = selectValue(stored)
  const extra = storedExtraOption(stored, options, loaded, t)
  // G9: CrossOver is the supported engine; only built-in and Wine Manager
  // choices are flagged.
  const unsupported =
    value.startsWith('pinned:') || value.startsWith('wine-manager:')
  const items = [
    ...(loaded
      ? options.map((o) => (
          <MenuItem key={o.id} value={o.id} disabled={!o.available}>
            {optionLabel(o, t)}
          </MenuItem>
        ))
      : []),
    ...(extra
      ? [
          <MenuItem key={`stored:${extra.id}`} value={extra.id} disabled>
            {extra.label}
          </MenuItem>
        ]
      : [])
  ]
  return (
    <details className="steamEngineOverride">
      <summary>
        {t('steam.engine.override.summary', 'Engine (advanced)')}
      </summary>
      <SelectField
        htmlId="steamEngineOverride"
        value={value}
        disabled={!loaded}
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
          unsupported ? (
            <span className="smallInputInfo danger">
              {t(
                'steam.engine.override.warning',
                "Unsupported — known fixes and compatibility ratings don't apply"
              )}
            </span>
          ) : undefined
        }
      >
        {items}
      </SelectField>
    </details>
  )
}

const SteamEngineOverride = () => {
  const { t } = useTranslation('gamelib')
  const { appName } = useContext(SettingsContext)
  const [override, setOverride] = useSetting('steamEngineOverride', 'automatic')
  const [options, setOptions] = useState<EngineOption[]>([])
  const [loaded, setLoaded] = useState(false)
  const state = useSteamEngineState((s) => s.byAppId[appName])
  const hasState = state !== undefined
  // WR-04: eligibility is computed by the backend from the title's own
  // per-game bridge install and DRM mode; the renderer never derives it.
  const eligible = state?.overrideEligible === true

  useEffect(() => {
    if (hasState) return
    let cancelled = false
    void window.api
      .getSteamEngineState(appName)
      .then((result) => {
        if (!cancelled && result) useSteamEngineState.getState().set(result)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [appName, hasState])

  useEffect(() => {
    if (!eligible) return
    let cancelled = false
    void window.api
      .listSteamEngineOptions()
      .then((o) => {
        if (cancelled) return
        setOptions(o)
        setLoaded(true)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [eligible])

  if (!eligible) return null

  return (
    <SteamEngineOverrideView
      options={options}
      stored={override}
      loaded={loaded}
      onChange={setOverride}
      t={t as unknown as T}
    />
  )
}

export default SteamEngineOverride
