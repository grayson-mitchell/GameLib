import { useTranslation } from 'react-i18next'
import { GameInfo } from 'common/types'
import { isStore } from 'common/storeCapabilities'
import CachedImage from 'frontend/components/UI/CachedImage'
import type { GameSettingsModalType } from './index'

type Props = {
  gameInfo: GameInfo
  type: GameSettingsModalType
  justSaved: boolean
}

// quick-261121-dzl (sketch 009 #1, #9, #10): thumbnail, the title alone, and a
// "Game settings · App ID · Saved" subline. The close X lives beside this in
// the Dialog header row.
function SettingsModalHeader({ gameInfo, type, justSaved }: Props) {
  const { t } = useTranslation()
  const { title, app_name: appName, runner } = gameInfo

  const arts = [
    gameInfo.overrides?.art_square,
    gameInfo.art_square,
    gameInfo.overrides?.art_cover,
    gameInfo.art_cover
  ].filter((art): art is string => typeof art === 'string' && art !== '')
  const thumbSrc = arts[0]
  const thumbFallback = gameInfo.overrides?.art_cover || gameInfo.art_cover
  const fallback =
    thumbFallback && thumbFallback !== thumbSrc ? thumbFallback : undefined

  const typeLabel = {
    settings: t('gamelib:settings.modal.gameSettings', 'Game settings'),
    category: t('header.categories', 'Categories')
  }[type]

  const appIdLabel = isStore(runner, 'steam')
    ? t('gamelib:settings.modal.steamAppId', 'Steam App ID')
    : t('gamelib:settings.modal.appId', 'App ID')

  return (
    <div className="settingsModalHeader">
      {thumbSrc ? (
        <CachedImage
          className="settingsModalHeader__thumb"
          src={thumbSrc}
          fallback={fallback}
          alt=""
        />
      ) : (
        <span
          className="settingsModalHeader__thumb settingsModalHeader__thumb--placeholder"
          aria-hidden="true"
        />
      )}
      <div className="settingsModalHeader__text">
        <h2 className="settingsModalHeader__title" title={title}>
          {title}
        </h2>
        <div className="settingsModalHeader__subline">
          <span>{typeLabel}</span>
          <span aria-hidden="true">·</span>
          <span>
            {appIdLabel} <code>{appName}</code>
          </span>
          {type === 'settings' && (
            <>
              <span aria-hidden="true">·</span>
              <span
                className={`settingsModalHeader__saved${
                  justSaved ? ' is-flashing' : ''
                }`}
                aria-live="polite"
              >
                <span
                  className="settingsModalHeader__savedDot"
                  aria-hidden="true"
                />
                {justSaved
                  ? t('gamelib:settings.modal.saved', 'Saved')
                  : t(
                      'gamelib:settings.modal.savedAutomatically',
                      'Saved automatically'
                    )}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default SettingsModalHeader
