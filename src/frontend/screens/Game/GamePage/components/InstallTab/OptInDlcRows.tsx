import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isStore } from 'common/storeCapabilities'
import type { GameInfo } from 'common/types'
import type { SteamOptInDlcEntry, SteamOptInDlcInfo } from 'common/types/steam'
import { size, updateGame } from 'frontend/helpers'
import GameContext from '../../../GameContext'
import { SwitchRow } from './SwitchRow'

interface Props {
  gameInfo: GameInfo
}

/** The one change in flight: which DLC, the state it should reach, and whether the game has shown busy. */
interface Pending {
  appId: string
  want: boolean
  seenBusy: boolean
}

/**
 * Quick 261122-rgi (D-01, D-02, D-03): the "Optional content" group of the Install tab, one switch
 * row per owned opt-in Steam DLC (a DLC whose depots carry `config.optionaldlc`).
 *
 * Switching a row on queues an update that downloads that DLC's depots into the existing install;
 * switching it off queues an update that deletes them (D-02). The switch shows the backend's
 * `installed` answer alone (D-03: installed depots are the record, there is no store or setting),
 * so it flips only once the game is idle again and a re-read agrees. Only a bridge install is
 * changed by GameLib (Phase 74: the delta updater is for bridge games); on a Steam-registered or
 * bottled-Steam copy the rows are read-only with a reason pointing at Steam (D-04). A row whose
 * ownership is unknown is still offered (D-05): the depot ownership gate refuses an unowned DLC
 * and the re-read then shows the failure inline.
 *
 * The group renders only when a row applies. The raw error reaches the log only.
 */
const OptInDlcRows = ({ gameInfo }: Props) => {
  const { t } = useTranslation('gamelib')
  const { app_name: appName, runner } = gameInfo
  const isInstalled = Boolean(gameInfo.is_installed)
  const { is } = useContext(GameContext)
  const gameBusy = Boolean(is.updating || is.queued || is.installing)

  const [info, setInfo] = useState<SteamOptInDlcInfo | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [failed, setFailed] = useState<{ appId: string; want: boolean } | null>(
    null
  )

  const applies = isStore(runner, 'steam') && isInstalled

  useEffect(() => {
    setInfo(null)
    setPending(null)
    setFailed(null)
    if (!applies) return
    let cancelled = false
    window.api
      .getSteamOptInDlc(appName)
      .then((answer) => {
        if (!cancelled) setInfo(answer)
      })
      .catch((error) => {
        window.api.logError(`getSteamOptInDlc failed for ${appName}: ${error}`)
      })
    return () => {
      cancelled = true
    }
  }, [appName, applies])

  // The change is done when the game has been seen busy and is idle again: re-read, and fail the
  // row if the answer does not show the wanted state.
  useEffect(() => {
    if (!pending) return
    if (gameBusy && !pending.seenBusy) {
      setPending({ ...pending, seenBusy: true })
      return
    }
    if (gameBusy || !pending.seenBusy) return
    const { appId, want } = pending
    let cancelled = false
    window.api
      .getSteamOptInDlc(appName)
      .then((answer) => {
        if (cancelled) return
        setInfo(answer)
        const row = answer?.entries.find((e) => e.appId === appId)
        if (row?.installed !== want) {
          window.api.logError(
            `Optional content change for ${appName}/${appId} did not reach installed=${want}`
          )
          setFailed({ appId, want })
        }
        setPending(null)
      })
      .catch((error) => {
        if (cancelled) return
        window.api.logError(`getSteamOptInDlc failed for ${appName}: ${error}`)
        setFailed({ appId, want })
        setPending(null)
      })
    return () => {
      cancelled = true
    }
  }, [pending, gameBusy, appName])

  if (!applies || !info) return null
  const shown = info.entries.filter((e) => e.owned !== false)
  if (shown.length === 0) return null

  const change = (entry: SteamOptInDlcEntry, want: boolean) => {
    // Defence in depth: the row is inert for a Steam-managed copy, and so is this.
    if (info.manage !== 'gamelib') return
    const desired = info.entries
      .filter((e) => e.installed && e.appId !== entry.appId)
      .map((e) => e.appId)
    if (want) desired.push(entry.appId)
    setFailed(null)
    setPending({ appId: entry.appId, want, seenBusy: false })
    updateGame({
      appName,
      runner,
      gameInfo,
      steamOptInDlc: desired
    }).catch((error: unknown) => {
      window.api.logError(
        `Optional content update for ${appName}/${entry.appId} was not queued: ${String(error)}`
      )
      setPending(null)
      setFailed({ appId: entry.appId, want })
    })
  }

  const steamManaged = info.manage !== 'gamelib'
  const otherBusy = pending !== null || gameBusy

  return (
    <section className="installGroup">
      <h3 className="installGroup__title">
        {t('gamepage.installTab.optInDlc.title', 'Optional content')}
      </h3>
      <p className="installNote">
        {t(
          'gamepage.installTab.optInDlc.note',
          'Turning one on downloads it. Turning it off removes its files.'
        )}
      </p>
      {shown.map((entry) => {
        const isPending = pending?.appId === entry.appId
        const rowFailed =
          failed?.appId === entry.appId && !isPending ? failed : null
        const disabled = steamManaged || (otherBusy && !isPending)
        return (
          <SwitchRow
            key={entry.appId}
            id={`installTabOptInDlc-${entry.appId}`}
            label={entry.name}
            description={entry.bytes > 0 ? size(entry.bytes) : undefined}
            checked={entry.installed}
            busy={isPending}
            busyLabel={
              pending?.want
                ? t('gamepage.installTab.switch.adding', 'Adding…')
                : t('gamepage.installTab.switch.removing', 'Removing…')
            }
            disabled={disabled}
            disabledReason={
              steamManaged
                ? t(
                    'gamepage.installTab.optInDlc.steamManaged',
                    "Steam manages this copy. Turn optional content on or off in Steam: the game's Properties → DLC."
                  )
                : t(
                    'gamepage.installTab.optInDlc.busy',
                    'Wait for the current download or update to finish.'
                  )
            }
            failure={
              rowFailed
                ? {
                    message: t(
                      'gamepage.installTab.optInDlc.failed',
                      "Couldn't change {{name}}. Details are in the log.",
                      { name: entry.name }
                    ),
                    retryLabel: t('gamepage.installTab.retry', 'Retry'),
                    retryDisabled: disabled,
                    retryDisabledReason: disabled
                      ? t(
                          'gamepage.installTab.optInDlc.busy',
                          'Wait for the current download or update to finish.'
                        )
                      : undefined,
                    onRetry: () => change(entry, rowFailed.want)
                  }
                : undefined
            }
            onToggle={() => change(entry, !entry.installed)}
          />
        )
      })}
    </section>
  )
}

export default OptInDlcRows
