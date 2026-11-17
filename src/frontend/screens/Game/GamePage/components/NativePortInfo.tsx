import { useTranslation } from 'react-i18next'
import type { GameInfo } from 'common/types'
import { isStore } from 'common/storeCapabilities'
import {
  findNativePort,
  nativePortPlatformKeys
} from 'common/nativePortCatalogue'

interface Props {
  gameInfo: GameInfo
  platform: string
}

/**
 * Hint-only: tells the user a community native source port exists for this
 * Steam game and helps them set it up. GameLib never downloads, configures or
 * launches the port. Link URLs come only from the checked-in catalogue.
 */
const NativePortInfo = ({ gameInfo, platform }: Props) => {
  const { t } = useTranslation('gamelib')

  if (!isStore(gameInfo, 'steam')) return null
  const entry = findNativePort(gameInfo.app_name, platform)
  if (!entry) return null

  const installPath = gameInfo.install?.install_path
  const canShowPath =
    gameInfo.is_installed &&
    typeof installPath === 'string' &&
    installPath.length > 0

  const platforms = nativePortPlatformKeys(entry)
    .map((k) => t(`gamepage.nativePort.platform.${k}`))
    .join(', ')

  const step =
    entry.dataStyle === 'copy'
      ? t('gamepage.nativePort.steps.copy', {
          files: (entry.dataFiles ?? []).join(', ')
        })
      : entry.dataStyle === 'point'
        ? t('gamepage.nativePort.steps.point')
        : t('gamepage.nativePort.steps.import')

  return (
    <div className="steamEngineNotice nativePortInfo" role="note">
      <strong>{t('gamepage.nativePort.title')}</strong>
      <p>{t('gamepage.nativePort.intro', { name: entry.name })}</p>
      <p>{t('gamepage.nativePort.licence', { licence: entry.licence })}</p>
      <p>{t('gamepage.nativePort.platforms', { platforms })}</p>
      {entry.note && <p>{entry.note}</p>}
      <p>{t('gamepage.nativePort.notTracked')}</p>
      <strong>{t('gamepage.nativePort.setupHeading')}</strong>
      <ol>
        <li>{step}</li>
        <li>{t('gamepage.nativePort.steps.sideload')}</li>
      </ol>
      <div className="nativePortInfo__buttons">
        <button
          type="button"
          className="button is-text"
          onClick={() => {
            void window.api.openExternalUrl(entry.url)
          }}
        >
          {t('gamepage.nativePort.openLink', { name: entry.name })}
        </button>
        {canShowPath && (
          <>
            <button
              type="button"
              className="button is-text"
              onClick={() => {
                void window.api.openFolder(installPath)
              }}
            >
              {t('gamepage.nativePort.showFolder')}
            </button>
            <button
              type="button"
              className="button is-text"
              onClick={() => {
                void window.api.clipboardWriteText(installPath)
              }}
            >
              {t('gamepage.nativePort.copyPath')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default NativePortInfo
