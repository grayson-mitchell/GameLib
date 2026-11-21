import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { asStoreGame } from 'common/gameInfoNarrowing'
import { hasCapability } from 'common/storeCapabilities'
import type { GameInfo } from 'common/types'
import { timestampStore } from 'frontend/helpers/stores'
import { hasStatus } from 'frontend/hooks/hasStatus'
import {
  playTimeFacts,
  relativeTimeParts,
  splitDuration
} from './playTimeSummary'

/**
 * D-17: the data logic TimeContainer used to own, as a hook. Returns the text
 * for the footer status line and the tooltip carrying the first and last
 * played dates. The line is null when the game cannot be installed
 * (TimeContainer was hidden then).
 */
export function usePlayTime(
  gameInfo: GameInfo,
  notInstallable: boolean
): { line: string | null; title: string | undefined } {
  const { app_name: game, runner } = gameInfo
  const { t, i18n } = useTranslation('gamelib')
  const [tsInfo, setTsInfo] = useState(timestampStore.get_nodefault(game))
  const { status } = hasStatus(gameInfo)

  useEffect(() => {
    // update local stored time after playing
    setTsInfo(timestampStore.get_nodefault(game))
    async function fetchPlaytime() {
      const playTime = await window.api.fetchPlaytimeFromServer(runner, game)
      if (!playTime) {
        return
      }
      if (tsInfo?.totalPlayed) {
        if (tsInfo.totalPlayed < playTime) {
          const newObject = { ...tsInfo, totalPlayed: playTime }
          timestampStore.set(game, newObject)
          setTsInfo(newObject)
        }
      } else {
        const newObject = {
          firstPlayed: '',
          lastPlayed: '',
          totalPlayed: playTime
        }
        timestampStore.set(game, newObject)
        setTsInfo(newObject)
      }
    }

    fetchPlaytime()
  }, [status])

  if (notInstallable) return { line: null, title: undefined }

  // Steam launches games itself, so GameLib never records local timestamps for
  // Steam titles: use the Steam-reported total and last-played from the synced
  // library data (extra.steamPlaytimeMinutes / extra.steamLastPlayed).
  const steamExtra = hasCapability(runner, 'playtimeFromStoreMetadata')
    ? asStoreGame(gameInfo, 'steam')?.extra
    : undefined
  const facts = hasCapability(runner, 'playtimeFromStoreMetadata')
    ? playTimeFacts({
        steam: {
          minutes: steamExtra?.steamPlaytimeMinutes,
          lastPlayedSec: steamExtra?.steamLastPlayed
        }
      })
    : playTimeFacts({ local: tsInfo })

  const parts: string[] = []
  if (facts.totalMinutes !== null) {
    const { hours, minutes } = splitDuration(facts.totalMinutes)
    const duration =
      hours > 0
        ? t(
            'gamelib:gamepage.playTime.hoursMinutes',
            '{{hours}} h {{minutes}} m',
            {
              hours,
              minutes
            }
          )
        : t('gamelib:gamepage.playTime.minutesOnly', '{{minutes}} m', {
            minutes
          })
    parts.push(
      t('gamelib:gamepage.playTime.played', 'Played {{duration}}', { duration })
    )
  }
  if (facts.lastPlayedMs !== null) {
    const { value, unit } = relativeTimeParts(facts.lastPlayedMs, Date.now())
    const when = new Intl.RelativeTimeFormat(i18n.language, {
      numeric: 'auto'
    }).format(value, unit)
    const lastPlayed = t(
      'gamelib:gamepage.playTime.lastPlayed',
      'last played {{when}}',
      { when }
    )
    parts.push(
      parts.length === 0
        ? lastPlayed.charAt(0).toLocaleUpperCase(i18n.language) +
            lastPlayed.slice(1)
        : lastPlayed
    )
  }
  const line =
    parts.length > 0
      ? parts.join(' · ')
      : t('gamelib:gamepage.playTime.never', 'Never played')

  const dateFormat = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium'
  })
  const titleLines: string[] = []
  if (facts.firstPlayedMs !== null) {
    titleLines.push(
      t('gamelib:gamepage.playTime.firstPlayedTitle', 'First played {{date}}', {
        date: dateFormat.format(facts.firstPlayedMs)
      })
    )
  }
  if (facts.lastPlayedMs !== null) {
    titleLines.push(
      t('gamelib:gamepage.playTime.lastPlayedTitle', 'Last played {{date}}', {
        date: dateFormat.format(facts.lastPlayedMs)
      })
    )
  }

  return {
    line,
    title: titleLines.length > 0 ? titleLines.join('\n') : undefined
  }
}
