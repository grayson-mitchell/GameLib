import { useTranslation } from 'react-i18next'
import type { SteamEngineState } from 'common/types/steam'
import { useSteamEngineState } from 'frontend/state/SteamEngineState'

interface Props {
  state: SteamEngineState | undefined
}

// T-59-50: a constant, never taken from the backend payload.
const CROSSOVER_URL = 'https://www.codeweavers.com/crossover'

/**
 * Phase 59 (D-13, D-04, D-15): inline, non-modal engine notices on the game
 * page -- CrossOver trial countdown (last 7 days), the dismissible
 * no-CrossOver recommendation, and the one-time untested-build note.
 */
const SteamEngineNotices = ({ state }: Props) => {
  const { t } = useTranslation('gamelib')

  if (!state) return null

  const openCrossover = () => {
    void window.api.openExternalUrl(CROSSOVER_URL)
  }
  const dismissLabel = t('steam.engine.notice.dismiss', 'Dismiss')

  return (
    <>
      {state.showTrialNotice && state.trialDaysRemaining !== null && (
        <div
          className="steamEngineNotice steamEngineNotice--trial"
          role="status"
        >
          <strong>
            {t(
              'steam.engine.trial.daysRemaining',
              'CrossOver trial: {{count}} days remaining',
              { count: state.trialDaysRemaining }
            )}
          </strong>
          <p>
            {t(
              'steam.engine.trial.body',
              'When the trial ends, GameLib will switch this game to its built-in engine (best-effort).'
            )}
          </p>
          <button
            type="button"
            className="button is-text"
            onClick={openCrossover}
          >
            {t('steam.engine.trial.buy', 'Buy CrossOver')}
          </button>
        </div>
      )}
      {state.showNoCrossoverNote && (
        <div
          className="steamEngineNotice steamEngineNotice--noCrossover"
          role="status"
        >
          <p>
            {t(
              'steam.engine.noCrossover.body',
              "CrossOver isn't installed. GameLib runs Windows games on its built-in engine; CrossOver gives better compatibility and performance."
            )}
          </p>
          <button
            type="button"
            className="button is-text"
            onClick={openCrossover}
          >
            {t('steam.engine.noCrossover.link', 'Get CrossOver')}
          </button>
          <button
            type="button"
            className="button is-text"
            onClick={async () => {
              await window.api.dismissSteamEngineNotice({
                kind: 'no-crossover'
              })
              useSteamEngineState
                .getState()
                .hideNotice(state.appId, 'no-crossover')
            }}
          >
            {dismissLabel}
          </button>
        </div>
      )}
      {state.untestedCrossoverBuild && (
        <div
          className="steamEngineNotice steamEngineNotice--untested"
          role="status"
        >
          <p>
            {t(
              'steam.engine.untested.body',
              'CrossOver {{build}} is untested with GameLib. Games should still work; please report issues.',
              { build: state.untestedCrossoverBuild }
            )}
          </p>
          <button
            type="button"
            className="button is-text"
            onClick={async () => {
              const build = state.untestedCrossoverBuild
              if (!build) return
              await window.api.dismissSteamEngineNotice({
                kind: 'untested-crossover',
                build
              })
              useSteamEngineState.getState().hideNotice(state.appId, 'untested')
            }}
          >
            {dismissLabel}
          </button>
        </div>
      )}
    </>
  )
}

export default SteamEngineNotices
