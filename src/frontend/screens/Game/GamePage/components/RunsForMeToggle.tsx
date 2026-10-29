import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import ContextProvider from 'frontend/state/ContextProvider'
import useGlobalState from 'frontend/state/GlobalStateV2'
import ToggleSwitch from 'frontend/components/UI/ToggleSwitch'
import { runsForMeKey, isRunsForMeOn } from 'common/runsForMe'
import type { GameInfo } from 'common/types'

interface Props {
  gameInfo: GameInfo
}

/**
 * Quick 261029-mkz (U-1): per-game "Runs for me" override. macOS only, and
 * only for games that are not Mac-native (those are already "Runs natively").
 * Persisted by the backend; the returned map is written straight into the
 * slice (the `runsForMeChanged` push also arrives, both idempotent).
 */
const RunsForMeToggle = ({ gameInfo }: Props) => {
  const { t: tGamelib } = useTranslation('gamelib')
  const { platform } = useContext(ContextProvider)
  const { runsForMe } = useGlobalState.keys('runsForMe')

  if (platform !== 'darwin' || gameInfo.is_mac_native === true) {
    return null
  }

  const state = runsForMe[runsForMeKey(gameInfo.app_name, gameInfo.runner)]

  return (
    <div className="runsForMeToggle">
      <ToggleSwitch
        htmlId="runsForMeToggle"
        value={isRunsForMeOn(state)}
        title={tGamelib('info.runsForMe.label', 'Runs for me')}
        description={tGamelib(
          'info.runsForMe.description',
          'Mark this game as working on this Mac, whatever its CrossOver rating says. GameLib turns this on by itself after the game has run for a minute, unless you have turned it off.'
        )}
        handleChange={(event) => {
          window.api
            .setRunsForMe({
              appName: gameInfo.app_name,
              runner: gameInfo.runner,
              on: event.target.checked
            })
            .then((map) => useGlobalState.getState().setRunsForMe(map))
            .catch((error) =>
              window.api.logError(`setRunsForMe failed: ${String(error)}`)
            )
        }}
      />
      {state === 'auto' && (
        <small>
          {tGamelib(
            'info.runsForMe.autoSet',
            'Turned on automatically after a play session of a minute or more'
          )}
        </small>
      )}
    </div>
  )
}

export default RunsForMeToggle
