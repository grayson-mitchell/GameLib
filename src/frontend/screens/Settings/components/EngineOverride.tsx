import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MenuItem, SelectChangeEvent } from '@mui/material'
import SelectField from 'frontend/components/UI/SelectField'
import InfoIcon from 'frontend/components/UI/InfoIcon'
import useSetting from 'frontend/hooks/useSetting'
import SettingsContext from 'frontend/screens/Settings/SettingsContext'
import ContextProvider from 'frontend/state/ContextProvider'
import { engineStateKey, useEngineState } from 'frontend/state/EngineState'
import type { EngineOption } from 'common/types/engine'
import {
  effectiveSelectValue,
  isUnsupportedEngineId,
  needsFreshBottleConfirm,
  visibleOptions
} from './engineOverrideLogic'

type T = (
  key: string,
  defaultValue: string,
  opts?: Record<string, unknown>
) => string

/**
 * Phase 61 D-10, D-11: the one Engine control for every store and the macOS
 * defaults page.
 * Originally D-14: the per-game engine override. On the Wine tab (quick 261104-tm6;
 * D-14 placed it under Advanced), collapsed, defaults to
 * Automatic, and loudly unsupported when used. D-08: this select is the only
 * route to the previous pinned build -- there is no separate rollback toggle.
 * Only ids returned by listEngineOptions are offered (T-59-52), and no
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
  if (o.kind === 'legacy') return idLabel(o.id, t)
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

function idLabel(id: string, t: T): string {
  if (id === 'crossover')
    return t('steam.engine.override.crossover', 'CrossOver')
  if (id.startsWith('wine-manager:'))
    return `Wine Manager: ${id.slice('wine-manager:'.length)}`
  if (id.startsWith('legacy:'))
    return t('engine.legacyLabel', 'Legacy: {{name}}', {
      name: id.slice('legacy:'.length)
    })
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
  value: string,
  options: EngineOption[],
  loaded: boolean,
  t: T
): { id: string; label: string } | null {
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
  if (value.startsWith('legacy:'))
    return { id: value, label: idLabel(value, t) }
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
  /** The value the select shows (stored pick, else the derived engine). */
  value: string
  loaded: boolean
  onChange: (id: string) => void
  t: T
}

export function EngineOverrideView({
  options,
  value,
  loaded,
  onChange,
  t
}: ViewProps) {
  const shown = visibleOptions(options, value)
  const extra = storedExtraOption(value, shown, loaded, t)
  const unsupported = isUnsupportedEngineId(value)
  const items = [
    ...(loaded
      ? shown.map((o) => (
          <MenuItem
            key={o.id}
            value={o.id}
            disabled={!o.available || o.kind === 'legacy'}
          >
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
    <details className="engineOverride">
      <summary>
        {t('steam.engine.override.summary', 'Engine (advanced)')}
      </summary>
      <SelectField
        htmlId="engineOverride"
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

const EngineOverride = () => {
  const { t } = useTranslation('gamelib')
  const {
    appName,
    runner: contextRunner,
    isDefault,
    gameInfo
  } = useContext(SettingsContext)
  const { showDialogModal } = useContext(ContextProvider)
  // The global-settings context carries no runner; the global variant never
  // reads it.
  const runner = contextRunner ?? 'steam'
  const [stored, setOverride] = useSetting('engineOverride', '')
  const [, setBottle] = useSetting('wineCrossoverBottle', '')
  const [options, setOptions] = useState<EngineOption[]>([])
  const [loaded, setLoaded] = useState(false)
  const [defaultEngine, setDefaultEngine] = useState<string | undefined>(
    undefined
  )
  const state = useEngineState((s) => s.byGame[engineStateKey(runner, appName)])
  const hasState = state !== undefined
  // WR-04: eligibility is computed by the backend; the renderer never derives
  // it. The global variant is always eligible.
  const eligible = isDefault === true || state?.overrideEligible === true

  useEffect(() => {
    if (isDefault || hasState) return
    let cancelled = false
    void window.api
      .getEngineState({ runner, appName })
      .then((result) => {
        if (!cancelled && result) useEngineState.getState().set(result)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [appName, runner, hasState, isDefault])

  useEffect(() => {
    if (!isDefault) return
    let cancelled = false
    void window.api
      .getDefaultEngine()
      .then((d) => {
        if (!cancelled) setDefaultEngine(d.effectiveEngineId)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [isDefault])

  useEffect(() => {
    if (!eligible) return
    let cancelled = false
    const args = isDefault
      ? ({ appName: 'default' } as const)
      : { runner, appName }
    void window.api
      .listEngineOptions(args)
      .then((o) => {
        if (cancelled) return
        setOptions(o)
        setLoaded(true)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [eligible, appName, runner, isDefault])

  if (!eligible) return null

  const tt = t as unknown as T
  const derived = isDefault ? defaultEngine : state?.effectiveEngineId
  const value = effectiveSelectValue(stored || undefined, derived)

  const onChange = (next: string) => {
    if (next === value) return
    // The Legacy item is disabled and the backend guard drops it; never send it.
    if (next.startsWith('legacy:')) return
    if (
      !isDefault &&
      needsFreshBottleConfirm(state?.prefixKind, next) &&
      typeof state?.perGameBottleName === 'string'
    ) {
      const bottle = state.perGameBottleName
      showDialogModal({
        title: tt(
          'engine.override.freshBottle.title',
          'Move this game to its own bottle?'
        ),
        message: tt(
          'engine.override.freshBottle.body',
          'GameLib will create a new bottle for {{title}}. Saves and settings in its current Wine prefix stay there and are not copied.',
          { title: gameInfo?.title ?? appName }
        ),
        buttons: [
          {
            text: tt('engine.override.freshBottle.confirm', 'Move'),
            onClick: () => {
              setOverride(next)
              setBottle(bottle)
            }
          },
          {
            text: tt('engine.override.freshBottle.cancel', 'Cancel')
          }
        ]
      })
      return
    }
    setOverride(next)
  }

  return (
    <EngineOverrideView
      options={options}
      value={value}
      loaded={loaded}
      onChange={onChange}
      t={tt}
    />
  )
}

export default EngineOverride
