import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ToggleSwitch } from 'frontend/components/UI'
import InfoIcon from 'frontend/components/UI/InfoIcon'
import useLibraryState from 'frontend/state/libraryState'
import useUiState from 'frontend/state/uiState'
import {
  callOrDeclare,
  DEFERRAL_D03,
  EOS_FEATURE
} from 'frontend/helpers/declaredUnavailable'
import type { GameStatus } from 'common/types'
import SettingsContext from '../SettingsContext'

// Phase 100 D-02: the EOS overlay switch moved from the game page's menu into
// Run -> Launch (Linux + installed Epic game; GamesSettings gates the render).
// handleEosOverlay and the probe are copied verbatim from GameSubMenu, so the
// "install now?" confirmation and the never-throws callOrDeclare flow are the
// same. EosOverlaySetting.callSiteGuard.test.ts pins the five call sites and
// six spinner releases.
const EosOverlaySetting = () => {
  const { t } = useTranslation()
  // The `setting.eosOverlay.*` install-confirmation strings live in the DEFAULT
  // ('translation') namespace.
  const { t: tDefault } = useTranslation()
  const { appName } = useContext(SettingsContext)
  const libraryStatus = useLibraryState((s) => s.libraryStatus)
  const showDialogModal = useUiState((s) => s.showDialogModal)

  const [eosOverlayEnabled, setEosOverlayEnabled] = useState<boolean>(false)
  const [eosOverlayRefresh, setEosOverlayRefresh] = useState<boolean>(false)
  const eosOverlayAppName = '98bc04bc842e4906993fd6d6644ffb8d'

  async function handleEosOverlay() {
    setEosOverlayRefresh(true)
    if (eosOverlayEnabled) {
      const disableResult = await callOrDeclare({
        channel: 'disableEosOverlay',
        feature: EOS_FEATURE,
        deferral: DEFERRAL_D03,
        call: () => window.api.disableEosOverlay(appName)
      })
      // Runs on BOTH branches (ok and not-ok) -- callOrDeclare never throws, so this
      // release is no longer reachable only on success the way a bare, unwrapped await
      // used to leave it stuck true forever on a rejection.
      setEosOverlayRefresh(false)
      if (!disableResult.ok) {
        return
      }
      setEosOverlayEnabled(false)
    } else {
      const initialEnableResult = await callOrDeclare({
        channel: 'enableEosOverlay',
        feature: EOS_FEATURE,
        deferral: DEFERRAL_D03,
        call: () => window.api.enableEosOverlay(appName)
      })
      if (!initialEnableResult.ok) {
        setEosOverlayRefresh(false)
        return
      }
      const { installNow, wasEnabled } = initialEnableResult.value

      // Phase 35 plan 26 (REQ-35-17): `enable()`'s not-installed branch used to ask
      // "install now?" itself via a native `dialog.showMessageBox` and fold the answer into
      // `installNow`. That native dialog is gone -- `installNow: true` now unconditionally
      // means "not installed, ask the renderer". Only the affirmative button installs and
      // re-enables; the negative button (no onClick, matching the house pattern) leaves
      // eosOverlayEnabled false and just releases the "refreshing" state.
      if (installNow) {
        showDialogModal({
          title: tDefault(
            'setting.eosOverlay.notInstalledTitle',
            'Overlay not installed'
          ),
          message: tDefault(
            'setting.eosOverlay.notInstalledMsg',
            'The EOS Overlay is not installed. Do you want to install it now?'
          ),
          buttons: [
            {
              text: tDefault('box.yes'),
              onClick: async () => {
                const installResult = await callOrDeclare({
                  channel: 'installEosOverlay',
                  feature: EOS_FEATURE,
                  deferral: DEFERRAL_D03,
                  call: () => window.api.installEosOverlay()
                })
                if (!installResult.ok) {
                  setEosOverlayRefresh(false)
                  return
                }
                const enableAfterInstallResult = await callOrDeclare({
                  channel: 'enableEosOverlay',
                  feature: EOS_FEATURE,
                  deferral: DEFERRAL_D03,
                  call: () => window.api.enableEosOverlay(appName)
                })
                // Runs on BOTH branches -- see the identical comment above.
                setEosOverlayRefresh(false)
                if (enableAfterInstallResult.ok) {
                  setEosOverlayEnabled(
                    enableAfterInstallResult.value.wasEnabled
                  )
                }
              }
            },
            {
              text: tDefault('box.no'),
              onClick: () => setEosOverlayRefresh(false)
            }
          ],
          type: 'MESSAGE'
        })
        return
      }

      setEosOverlayEnabled(wasEnabled)
      setEosOverlayRefresh(false)
    }
  }

  useEffect(() => {
    // check if eos overlay is enabled
    const { status } =
      libraryStatus.filter(
        (game: GameStatus) => game.appName === eosOverlayAppName
      )[0] || {}
    setEosOverlayRefresh(status === 'installing')

    // This probe owns no spinner state -- eosOverlayRefresh is driven by libraryStatus
    // immediately above, not by this call.
    callOrDeclare({
      channel: 'isEosOverlayEnabled',
      feature: EOS_FEATURE,
      deferral: DEFERRAL_D03,
      call: () => window.api.isEosOverlayEnabled(appName)
    }).then((result) => {
      if (result.ok) {
        setEosOverlayEnabled(result.value)
      }
    })
  }, [appName])

  return (
    <div className="toggleRow">
      <ToggleSwitch
        htmlId="eosOverlay"
        value={eosOverlayEnabled}
        handleChange={() => void handleEosOverlay()}
        disabled={eosOverlayRefresh}
        fading={eosOverlayRefresh}
        title={t('gamelib:settings.fields.eosOverlay.label', 'EOS overlay')}
      />
      <InfoIcon
        text={t(
          'gamelib:settings.fields.eosOverlay.help',
          "Epic's in-game overlay for friends and achievements. GameLib installs it the first time you turn it on."
        )}
      />
    </div>
  )
}

export default EosOverlaySetting
