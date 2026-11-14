import { AppSettings, GameInfo, Runner } from 'common/types'
import { SettingsContextType } from 'frontend/types'
import { useTranslation } from 'react-i18next'
import { useState, useEffect, useRef } from 'react'

import useUiState from 'frontend/state/uiState'

type Props = {
  appName: string
  gameInfo?: GameInfo
  runner?: Runner
}

/**
 * Pure decision: should the render-gate withhold `contextValues` (return
 * null) because a config load hasn't produced anything to show yet?
 *
 * 30-06 (SEAM Invariant B): the original guard was
 * `Object.keys(config).length === 0` alone, which blocks forever if
 * requestAppSettings/requestGameSettings rejects (an unported channel or any
 * runtime failure) — the catch branch below sets `currentConfig` to `{}`
 * (still empty), so the original guard would still return null forever.
 * Adding `hasAttemptedLoad` is the smaller fix versus seeding a non-empty
 * fake default: once a load has been ATTEMPTED (success OR failure), an
 * empty config no longer withholds the context — it renders with whatever
 * real (possibly empty) settings resolved.
 */
export function shouldWithholdContext(
  config: Partial<AppSettings>,
  hasAttemptedLoad: boolean
): boolean {
  return Object.keys(config).length === 0 && !hasAttemptedLoad
}

/**
 * The single read the Settings controls go through (useSetting ->
 * SettingsContext.getSetting). `??` is deliberate so a stored `false` beats a
 * `true` fallback. Pinned by quick 261114-l1j after the 74 UAT drift: the
 * operator read store/config.json (the mirror); the authoritative value is
 * config.json defaultSettings, which requestAppSettings returns.
 */
export function readSetting<T extends keyof AppSettings>(
  config: Partial<AppSettings>,
  key: T,
  fallback: NonNullable<AppSettings[T]>
): NonNullable<AppSettings[T]> {
  return (config[key] ?? fallback) as NonNullable<AppSettings[T]>
}

/**
 * WR-04: should a `gameSettingWriteFailed` push make this hook re-read its
 * settings? Only for its own appName; anything malformed is ignored.
 */
export function shouldRefetchOnWriteFailure(
  appName: string,
  payload: unknown
): boolean {
  if (typeof payload !== 'object' || payload === null) return false
  const { appName: pushed, key } = payload as {
    appName?: unknown
    key?: unknown
  }
  return (
    typeof pushed === 'string' && pushed === appName && typeof key === 'string'
  )
}

type SetterDeps = {
  appName: string
  getConfig: () => Partial<AppSettings>
  setConfig: (config: Partial<AppSettings>) => void
  send: (payload: {
    appName: string
    key: keyof AppSettings
    value: unknown
  }) => unknown
}

/**
 * The setSetting decision as a pure function so it can be tested without
 * mounting React. Behaviour is unchanged from the inline original.
 */
export function createSettingSetter({
  appName,
  getConfig,
  setConfig,
  send
}: SetterDeps): SettingsContextType['setSetting'] {
  return (key, value) => {
    const currentConfig = getConfig()
    const currentValue = currentConfig[key]
    if (JSON.stringify(value) === JSON.stringify(currentValue)) return
    setConfig({ ...currentConfig, [key]: value })
    send({ appName, key, value })
  }
}

const useSettingsContext = ({ appName, gameInfo, runner }: Props) => {
  const [currentConfig, setCurrentConfig] = useState<Partial<AppSettings>>({})
  // Latest config, updated synchronously on every write. Two setSetting calls in one event
  // handler (the merged "When a game starts" select writes two keys) would otherwise both
  // spread the render's stale `currentConfig`, and the second would erase the first from the
  // local view until a reload (quick 261108-kpc).
  const configRef = useRef(currentConfig)
  configRef.current = currentConfig
  const [hasAttemptedLoad, setHasAttemptedLoad] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const { i18n } = useTranslation()
  const { platform, settingsModalProps } = useUiState.keys(
    'platform',
    'settingsModalProps'
  )

  const isDefault = appName === 'default'
  const isLinux = platform === 'linux'
  const isMac = platform === 'darwin'
  const isMacNative =
    isMac &&
    (['Mac', 'osx'].includes(gameInfo?.install.platform ?? '') || false)
  const isLinuxNative =
    isLinux && (gameInfo?.install.platform === 'linux' || false)

  // Load Heroic's or game's config, only if not loaded already
  useEffect(() => {
    const getSettings = async () => {
      try {
        const config = isDefault
          ? await window.api.requestAppSettings()
          : await window.api.requestGameSettings(appName)
        setCurrentConfig(config)
      } catch (error) {
        // SEAM Invariant B (30-06): degrade non-fatally on a rejected
        // config load (unported channel marker or any other runtime
        // failure) instead of leaving `currentConfig` at `{}` forever —
        // see `shouldWithholdContext` above. This catch branch never runs
        // under Electron, where the await never rejects.
        console.warn(
          `requestAppSettings/requestGameSettings failed for appName=${appName}:`,
          error
        )
        setCurrentConfig({})
      } finally {
        setHasAttemptedLoad(true)
      }
    }
    void getSettings()
  }, [
    appName,
    isDefault,
    i18n.language,
    settingsModalProps.isOpen,
    reloadToken
  ])

  // WR-04: a failed per-game write leaves the control showing a value that is
  // not on disk; re-read so it snaps back to the stored one.
  useEffect(() => {
    if (isDefault) return
    const unlisten = window.api.handleGameSettingWriteFailed(
      (_e: unknown, payload: unknown) => {
        if (shouldRefetchOnWriteFailure(appName, payload)) {
          setReloadToken((n) => n + 1)
        }
      }
    )
    return () => {
      if (typeof unlisten === 'function') unlisten()
    }
  }, [appName, isDefault])

  const contextValues: SettingsContextType = {
    getSetting: (key, fallback) => readSetting(currentConfig, key, fallback),
    setSetting: createSettingSetter({
      appName,
      getConfig: () => configRef.current,
      setConfig: (config) => {
        configRef.current = config
        setCurrentConfig(config)
      },
      send: (payload) => window.api.setSetting(payload)
    }),
    config: currentConfig,
    isDefault,
    appName,
    runner,
    gameInfo,
    isLinuxNative,
    isMacNative
  }

  if (shouldWithholdContext(contextValues.config, hasAttemptedLoad)) {
    return null
  }

  return contextValues
}

export default useSettingsContext
