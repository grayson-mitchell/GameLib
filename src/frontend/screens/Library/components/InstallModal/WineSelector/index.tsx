import {
  SelectField,
  ToggleSwitch,
  TextInputField,
  PathSelectionBox
} from 'frontend/components/UI'
import React, { useContext, useEffect, useMemo, useState } from 'react'
import { Runner, WineInstallation } from 'common/types'
import { Trans, useTranslation } from 'react-i18next'
import { removeSpecialcharacters } from 'frontend/helpers'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faWarning } from '@fortawesome/free-solid-svg-icons'
import { WineVersionListItem } from 'frontend/screens/Settings/components/WineVersionSelector'
import { MenuItem } from '@mui/material'
import { useAwaited } from 'frontend/hooks/useAwaited'
import ContextProvider from 'frontend/state/ContextProvider'
import useGlobalState from 'frontend/state/GlobalStateV2'

type Props = {
  setWineVersion: (newVersion: WineInstallation) => void
  setWinePrefix: (newPrefix: string) => void
  setCrossoverBottle: React.Dispatch<React.SetStateAction<string>>
  winePrefix: string
  crossoverBottle: string
  wineVersionList: WineInstallation[]
  wineVersion: WineInstallation | undefined
  title?: string
  appName: string
  // D-18 (19-08): identifies the Steam CrossOver-bottle install path so the
  // knownnottowork advisory warning below only ever renders there, never for
  // the generic GOG/Epic/Amazon/sideload Wine installs that also render this
  // shared component. Optional/default-undefined so every existing caller is
  // byte-for-byte unchanged; only the Steam guided bottle setup passes it.
  runner?: Runner
  initiallyOpen?: boolean
  // Optional note prepended to the "Use shared Wine prefix" toggle's tooltip.
  // Used by the Steam guided setup (Phase 17) to warn that sharing the prefix/
  // bottle is not recommended for the dedicated Steam bottle.
  sharedPrefixNote?: string
  // Steam guided setup (Phase 17 CR-01): the shared prefix/bottle must NEVER be
  // selectable for the dedicated Steam bottle. When true, the "Use shared Wine
  // prefix" toggle and its warning infoBox are not rendered, so useSharedPrefix
  // stays false and the shared wineCrossoverBottle name can never reach the
  // parent's setCrossoverBottle. Optional/default-undefined so every existing
  // caller (GOG/Epic/Amazon/sideload install modals) is byte-for-byte unchanged.
  hideSharedPrefixToggle?: boolean
}

export default function WineSelector({
  setWinePrefix,
  setWineVersion,
  winePrefix,
  wineVersionList,
  wineVersion,
  title = 'sideload',
  crossoverBottle,
  setCrossoverBottle,
  initiallyOpen,
  appName,
  runner,
  sharedPrefixNote,
  hideSharedPrefixToggle
}: Props) {
  const { t, i18n } = useTranslation('gamepage')

  const [detailsOpen, setDetailsOpen] = useState(!!initiallyOpen)
  const [useSharedPrefix, setUseSharedPrefix] = useState(false)

  const { platform } = useContext(ContextProvider)
  const { crossoverRatings } = useGlobalState.keys('crossoverRatings')
  const crossoverRating = crossoverRatings[appName]

  const globalConfig = useAwaited(() => window.api.requestAppSettings())

  const sharedToggleDescription = useMemo(() => {
    const configDetails = globalConfig
      ? `${globalConfig.wineVersion.name}\n${globalConfig.defaultWinePrefix}`
      : ''
    if (sharedPrefixNote) {
      return configDetails
        ? `${sharedPrefixNote}\n\n${configDetails}`
        : sharedPrefixNote
    }
    return configDetails
  }, [globalConfig, sharedPrefixNote])

  useEffect(() => {
    if (!globalConfig) return

    if (useSharedPrefix) {
      setWinePrefix(globalConfig.winePrefix)
      setWineVersion(globalConfig.wineVersion)
      setCrossoverBottle(globalConfig.wineCrossoverBottle)
    } else {
      const suggestedPrefix = `${globalConfig.defaultWinePrefixDir}/${removeSpecialcharacters(title ?? appName)}`
      setWinePrefix(suggestedPrefix)
    }
  }, [
    globalConfig,
    useSharedPrefix,
    setWinePrefix,
    setWineVersion,
    setCrossoverBottle,
    title,
    appName
  ])

  useEffect(() => {
    if (wineVersion) return

    const firstAvailableVersion = wineVersionList.at(0)
    if (firstAvailableVersion) setWineVersion(firstAvailableVersion)
  }, [wineVersion, wineVersionList, setWineVersion])

  const showPrefix = wineVersion?.type !== 'crossover'
  const showBottle = wineVersion?.type === 'crossover'

  // D-18 (19-08): non-blocking knownnottowork advisory. Gated on the actual
  // CrossOver-bottle install path (showBottle) for a confirmed macOS Steam
  // rating <=2 -- an absent (never looked up) or null ("unrated") rating is
  // NOT evidence of a problem and must show no warning. This is a sibling
  // render only; it must NEVER be wired into the Install button's `disabled`
  // prop or otherwise gate/delay the install.
  const isKnownNotToWork =
    platform === 'darwin' &&
    runner === 'steam' &&
    showBottle &&
    typeof crossoverRating === 'number' &&
    crossoverRating <= 2

  return (
    <>
      <details open={detailsOpen} onChange={() => setDetailsOpen(detailsOpen)}>
        <summary>
          {t('setting.show-wine-settings', 'Show Wine settings')}
        </summary>
        <>
          {showPrefix && (
            <PathSelectionBox
              type="directory"
              onPathChange={setWinePrefix}
              path={winePrefix}
              pathDialogTitle={t('box.wineprefix', 'Select WinePrefix Folder')}
              label={t('install.wineprefix', 'WinePrefix')}
              htmlId="setinstallpath"
              noDeleteButton
              disabled={useSharedPrefix}
            />
          )}
          {showBottle && (
            <TextInputField
              label={t('setting.winecrossoverbottle', 'CrossOver Bottle')}
              htmlId="crossoverBottle"
              value={crossoverBottle}
              onChange={(newValue) => setCrossoverBottle(newValue)}
              disabled={useSharedPrefix}
            />
          )}

          <SelectField
            label={`${t('install.wineversion')}:`}
            htmlId="wineVersion"
            value={wineVersion?.name || ''}
            disabled={useSharedPrefix || wineVersionList.length === 0}
            onChange={(e) =>
              setWineVersion(
                wineVersionList.find(
                  (version) => version.name === e.target.value
                )!
              )
            }
          >
            {wineVersionList &&
              wineVersionList.map((version, i) => (
                <MenuItem key={i} value={version.name}>
                  <WineVersionListItem version={version} />
                </MenuItem>
              ))}
          </SelectField>
          {isKnownNotToWork && (
            <div className="infoBox">
              <FontAwesomeIcon
                icon={faWarning}
                style={{ color: 'var(--status-danger)' }}
              />
              <Trans
                i18n={i18n}
                i18nKey="install.warn-crossover-wont-run"
                ns="gamepage"
              >
                This game is known not to run well under CrossOver on macOS.
                Compatibility data is community-sourced and may be wrong for
                your setup — you can still install it and try for yourself.
              </Trans>
            </div>
          )}
          {/* CR-01 (Phase 17 17-17): the shared-prefix toggle is hidden on the
              Steam guided-setup path so the shared GOG/Epic bottle can never be
              selected for the dedicated Steam bottle. With the toggle absent,
              useSharedPrefix stays false and setCrossoverBottle is never fed the
              shared name. Rendered normally for all other callers. */}
          {!hideSharedPrefixToggle && (
            <>
              <ToggleSwitch
                htmlId="use-shared-wine-config"
                title={t(
                  'setting.use-shared-wine-config',
                  'Use shared Wine prefix'
                )}
                value={useSharedPrefix}
                handleChange={() => setUseSharedPrefix(!useSharedPrefix)}
                description={sharedToggleDescription}
              />
              {useSharedPrefix && (
                <div className="infoBox">
                  <FontAwesomeIcon icon={faWarning} />
                  <Trans
                    i18n={i18n}
                    i18nKey="setting.warn-use-shared-wine-config"
                    ns="gamepage"
                  >
                    Only use this option if you know what you are doing.
                    <br />
                    Sharing the same prefix for multiple games can create
                    problems if their dependencies are incompatible.
                  </Trans>
                </div>
              )}
            </>
          )}
        </>
      </details>
    </>
  )
}
