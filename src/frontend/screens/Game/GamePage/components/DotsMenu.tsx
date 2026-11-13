import {
  useContext,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from 'react'
import GameContext from '../../GameContext'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import GameSubMenu from '../../GameSubMenu'
import { faEllipsisV } from '@fortawesome/free-solid-svg-icons'
import { GameInfo } from 'common/types'
import {
  Dialog,
  DialogContent,
  DialogHeader
} from 'frontend/components/UI/Dialog'
import GameRequirements from '../../GameRequirements'
import { useTranslation } from 'react-i18next'
import GameChangeLog from '../../GameChangeLog'
import ModifyInstallModal from '../../ModifyInstallModal'

interface Props {
  gameInfo: GameInfo
  handleUpdate: () => void
}

const DotsMenu = ({ gameInfo, handleUpdate }: Props) => {
  const { t } = useTranslation('gamepage')
  const { t: tGamelib } = useTranslation('gamelib')
  const { appName, gameExtraInfo, gameInstallInfo, is } =
    useContext(GameContext)
  const [showRequirements, setShowRequirements] = useState(false)
  const [showChangelog, setShowChangelog] = useState(false)
  const [showModifyInstallModal, setShowModifyInstallModal] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  // Registered only while the menu is open. Document-level on purpose: WebKit
  // does not focus a clicked button, so a root-level onKeyDown would never see
  // Escape after a mouse open on macOS. `click` rather than pointerdown so a
  // gamepad's synthetic `.click()` outside the menu also dismisses it.
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setIsOpen(false)
      toggleRef.current?.focus()
    }
    const onDocumentClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('click', onDocumentClick)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('click', onDocumentClick)
    }
  }, [isOpen])

  // Item activation. React bubbles synthetic events from the portaled
  // UninstallModal (a React child of .gameTools) through this root, so the DOM
  // containment check is what tells a real menu-item click from a click inside
  // the confirm dialog. No onBlur / focus-out close: WebKit's
  // click-without-focus would race the item click.
  const handleRootClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!isOpen) return
    const target = e.target as Element
    if (!e.currentTarget.contains(target)) return
    if (target.closest('.gameTools') && target.closest('button, a')) {
      setIsOpen(false)
      toggleRef.current?.focus()
    }
  }

  const { is_installed, title } = gameInfo

  const hasRequirements = (gameExtraInfo?.reqs || []).length > 0

  return (
    <>
      <div
        ref={rootRef}
        className={isOpen ? 'game-actions is-open' : 'game-actions'}
        onClick={handleRootClick}
      >
        <button
          ref={toggleRef}
          type="button"
          className="toggle"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={tGamelib('gamelib:gamepage.moreActions', 'More actions')}
          onClick={() => setIsOpen(!isOpen)}
        >
          <FontAwesomeIcon icon={faEllipsisV} />
        </button>

        <GameSubMenu
          appName={appName}
          isInstalled={is_installed}
          title={title}
          storeUrl={
            gameExtraInfo?.storeUrl ||
            ('store_url' in gameInfo && gameInfo.store_url !== undefined
              ? gameInfo.store_url
              : '')
          }
          changelog={gameExtraInfo?.changelog}
          runner={gameInfo.runner}
          handleUpdate={handleUpdate}
          handleChangeLog={() => setShowChangelog(true)}
          disableUpdate={is.installing || is.updating}
          onShowRequirements={
            hasRequirements ? () => setShowRequirements(true) : undefined
          }
          onShowModifyInstall={() => setShowModifyInstallModal(true)}
          gameInfo={gameInfo}
        />
      </div>

      {showRequirements && (
        <Dialog showCloseButton onClose={() => setShowRequirements(false)}>
          <DialogHeader onClose={() => setShowRequirements(false)}>
            <div>{t('game.requirements', 'Requirements')}</div>
          </DialogHeader>
          <DialogContent>
            <GameRequirements reqs={gameExtraInfo?.reqs} />
          </DialogContent>
        </Dialog>
      )}

      {showModifyInstallModal && (
        <ModifyInstallModal
          gameInfo={gameInfo}
          gameInstallInfo={gameInstallInfo}
          onClose={() => setShowModifyInstallModal(false)}
        />
      )}

      {gameExtraInfo?.changelog && showChangelog && (
        <GameChangeLog
          title={gameInfo.overrides?.title || gameInfo.title}
          changelog={gameExtraInfo.changelog}
          backdropClick={() => {
            setShowChangelog(false)
          }}
        />
      )}
    </>
  )
}

export default DotsMenu
