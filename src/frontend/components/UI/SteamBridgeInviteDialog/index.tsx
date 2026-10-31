import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ackWhenVisible } from 'frontend/components/UI/DialogHandler/ackWhenVisible'
import {
  useSteamBridgeInvite,
  type SteamBridgeInviteRow
} from 'frontend/state/SteamBridgeInvite'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader
} from 'frontend/components/UI/Dialog'
import './index.scss'

// Phase 58 Plan 32 (M-01): the friend picker that replaces Steam's overlay
// invite dialog for bridged games. Opened only by the backend push via the
// global store; pressing Invite sends one Steam invite and the dialog stays
// open for more. Names are rendered, never logged.
const SteamBridgeInviteDialog = () => {
  const { t } = useTranslation('gamelib')
  const { isOpen, appId, ackId, title, load, friends, rows, close, invite } =
    useSteamBridgeInvite()

  // 58-36: tell the backend the picker is on screen (rendered and visible).
  // Keyed on isOpen/ackId only, so list or row updates never re-ack.
  useEffect(() => {
    if (!isOpen || !ackId) return undefined
    return ackWhenVisible(ackId, window.api.dialogDisplayed, document)
  }, [isOpen, ackId])

  if (!isOpen || !appId) return null

  const rowText = (row: SteamBridgeInviteRow | undefined): string | null => {
    switch (row) {
      case 'sent':
        return t('steam.bridge.invite.sent', 'Invite sent')
      case 'steam-refused':
        return t(
          'steam.bridge.invite.steamRefused',
          'Steam did not send the invite'
        )
      case 'expired':
        return t(
          'steam.bridge.invite.expired',
          "Press the game's invite button again, then retry"
        )
      case 'no-pending':
        return t(
          'steam.bridge.invite.noLobby',
          'The game has no session to invite to'
        )
      case 'bad-ordinal':
      case 'no-helper':
      case 'error':
        return t(
          'steam.bridge.invite.unavailable',
          'Inviting is not available right now'
        )
      default:
        return null
    }
  }

  return (
    <Dialog onClose={close} showCloseButton className="steamBridgeInviteDialog">
      <DialogHeader onClose={close}>
        {t('steam.bridge.invite.title', {
          defaultValue: 'Invite a friend to {{title}}',
          title: title ?? appId
        })}
      </DialogHeader>
      <DialogContent>
        <p>
          {t(
            'steam.bridge.invite.intro',
            "Steam's in-game invite window is not available for games run through GameLib. Pick a friend to send a Steam invite. They accept it in Steam while the game is running."
          )}
        </p>
        {load === 'unavailable' ? (
          <p className="steamBridgeSetupError">
            {t(
              'steam.bridge.invite.unavailable',
              'Inviting is not available right now'
            )}
          </p>
        ) : null}
        <ul className="steamBridgeInviteList">
          {friends.map((f) => {
            const row = rows[f.ordinal]
            const text = rowText(row)
            const done = row === 'sent'
            return (
              <li key={f.ordinal} className="steamBridgeInviteRow">
                <span className="steamBridgeInviteName">{f.name}</span>
                {!f.online ? (
                  <span className="steamBridgeInviteTag">
                    {t('steam.bridge.invite.offline', 'Offline')}
                  </span>
                ) : f.playingThisApp ? (
                  <span className="steamBridgeInviteTag">
                    {t('steam.bridge.invite.playing', 'Playing this game')}
                  </span>
                ) : null}
                {text ? (
                  <span
                    className={
                      done
                        ? 'steamBridgeInviteResult'
                        : 'steamBridgeInviteResult steamBridgeSetupError'
                    }
                  >
                    {text}
                  </span>
                ) : null}
                <button
                  className="button is-primary"
                  disabled={!f.online || done || row === 'pending'}
                  onClick={() => void invite(f.ordinal)}
                >
                  {t('steam.bridge.invite.invite', 'Invite')}
                </button>
              </li>
            )
          })}
        </ul>
      </DialogContent>
      <DialogFooter>
        <button onClick={close} className="button is-secondary outline">
          {t('steam.bridge.invite.close', 'Close')}
        </button>
      </DialogFooter>
    </Dialog>
  )
}

export default SteamBridgeInviteDialog
