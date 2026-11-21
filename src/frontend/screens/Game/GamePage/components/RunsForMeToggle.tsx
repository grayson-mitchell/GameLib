import { useTranslation } from 'react-i18next'
import useUiState from 'frontend/state/uiState'
import useLibraryState from 'frontend/state/libraryState'
import { runsForMeKey, isRunsForMeOn } from 'common/runsForMe'
import type { GameInfo } from 'common/types'
import { useRowAction } from '../actions/rowAction'
import { SwitchRow } from './InstallTab/SwitchRow'

interface Props {
  gameInfo: GameInfo
}

/**
 * Quick 261029-mkz (U-1): per-game "Runs for me" override. macOS only, and
 * only for games that are not Mac-native (those are already "Runs natively").
 * Persisted by the backend; the returned map is written straight into the
 * slice (the `runsForMeChanged` push also arrives, both idempotent).
 *
 * Phase 100 (D-01, D-12, D-18): a switch row in Library & integration. The
 * switch flips only from the map the backend returns; a failed write shows
 * fixed text with Retry and logs the raw error.
 */
const RunsForMeToggle = ({ gameInfo }: Props) => {
  const { t: tGamelib } = useTranslation('gamelib')
  const platform = useUiState((s) => s.platform)
  const { runsForMe } = useLibraryState.keys('runsForMe')
  const { app_name: appName, runner } = gameInfo
  const row = useRowAction('setRunsForMe', appName)

  if (platform !== 'darwin' || gameInfo.is_mac_native === true) {
    return null
  }

  const state = runsForMe[runsForMeKey(appName, runner)]
  const checked = isRunsForMeOn(state)

  const handleToggle = () =>
    row.run(async () => {
      const map = await window.api.setRunsForMe({
        appName,
        runner,
        on: !checked
      })
      useLibraryState.getState().setRunsForMe(map)
    })

  const description = tGamelib(
    'info.runsForMe.description',
    'Mark this game as working on this Mac, whatever its CrossOver rating says. GameLib turns this on by itself after the game has run for a minute, unless you have turned it off.'
  )
  const autoSet = tGamelib(
    'info.runsForMe.autoSet',
    'Turned on automatically after a play session of a minute or more'
  )

  return (
    <SwitchRow
      id="runsForMe"
      label={tGamelib('info.runsForMe.label', 'Runs for me')}
      description={state === 'auto' ? `${description} ${autoSet}` : description}
      checked={checked}
      busy={row.phase === 'busy'}
      failure={
        row.phase === 'failed'
          ? {
              message: tGamelib(
                'gamepage.installTab.runsForMe.failed',
                "Couldn't save Runs for me. Details are in the log."
              ),
              retryLabel: tGamelib('gamepage.installTab.retry', 'Retry'),
              onRetry: handleToggle
            }
          : undefined
      }
      onToggle={handleToggle}
    />
  )
}

export default RunsForMeToggle
