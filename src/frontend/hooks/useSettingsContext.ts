import { AppSettings, GameInfo, Runner } from 'common/types'
import { SettingsContextType } from 'frontend/types'
import { useTranslation } from 'react-i18next'
import { useState, useEffect, useContext } from 'react'
import ContextProvider from 'frontend/state/ContextProvider'

import useGlobalState from 'frontend/state/GlobalStateV2'

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

const useSettingsContext = ({ appName, gameInfo, runner }: Props) => {
  const [currentConfig, setCurrentConfig] = useState<Partial<AppSettings>>({})
  const [hasAttemptedLoad, setHasAttemptedLoad] = useState(false)
  const { i18n } = useTranslation()
  const { platform } = useContext(ContextProvider)
  const { settingsModalProps } = useGlobalState.keys('settingsModalProps')

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
  }, [appName, isDefault, i18n.language, settingsModalProps.isOpen])

  const contextValues: SettingsContextType = {
    getSetting: (key, fallback) => currentConfig[key] ?? fallback,
    setSetting: (key, value) => {
      const currentValue = currentConfig[key]
      if (currentValue !== undefined || currentValue !== null) {
        const noChange = JSON.stringify(value) === JSON.stringify(currentValue)
        if (noChange) return
      }
      setCurrentConfig({ ...currentConfig, [key]: value })
      window.api.setSetting({ appName, key, value })
    },
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
