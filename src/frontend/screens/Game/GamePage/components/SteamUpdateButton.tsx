import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { CloudDownload } from '@mui/icons-material'
import { isStore } from 'common/storeCapabilities'
import type { GameInfo } from 'common/types'
import GameContext from '../../GameContext'

interface Props {
  gameInfo: GameInfo
  hasUpdate: boolean
  handleUpdate: () => void
}

/**
 * quick 261114-nxb / 74-UAT item 1: the explicit Update button beside Play for
 * an installed Steam game with a pending update. Routes through the page's
 * existing handleUpdate (confirmSteamUpdate dialog -> updateGame). Hidden while
 * any other operation owns the game; disabled while it is launching/playing.
 */
const SteamUpdateButton = ({ gameInfo, hasUpdate, handleUpdate }: Props) => {
  const { t } = useTranslation('gamepage')
  const { is } = useContext(GameContext)

  if (!isStore(gameInfo, 'steam') || !gameInfo.is_installed || !hasUpdate) {
    return null
  }
  if (
    is.updating ||
    is.queued ||
    is.installing ||
    is.uninstalling ||
    is.moving ||
    is.reparing
  ) {
    return null
  }

  return (
    <button
      type="button"
      className="button is-secondary steamUpdateButton"
      disabled={is.launching || is.playing}
      onClick={() => handleUpdate()}
    >
      <span className="buttonWithIcon">
        <CloudDownload />
        {t('button.update', 'Update')}
      </span>
    </button>
  )
}

export default SteamUpdateButton
