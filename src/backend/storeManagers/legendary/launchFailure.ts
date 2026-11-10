import { t as i18nextT } from 'i18next'
import {
  EPIC_AUTH_FAILURE_MARKER,
  EPIC_NETWORK_FAILURE_MARKER
} from 'backend/signInProbe/classify'

/**
 * Quick 261111-8b5. Classifies a failed `legendary launch` from its captured
 * output so LegendaryGame.launch() can say why it could not sign in instead of
 * failing silently (Phase 62 smoke 2).
 *
 * The captured output can carry tokens, so this module imports no logging
 * module and never echoes the text; it only pattern-matches it.
 */

/**
 * legendary prints its login lines before the game starts, so a small head
 * capture is enough, and memory stays bounded for the whole play session.
 */
export const LEGENDARY_LAUNCH_OUTPUT_CAP = 16_000

/** legendary's `launch` failure line, without the trailing '!'. */
export const LEGENDARY_LAUNCH_LOGIN_FAILED_MARKER =
  'Login failed, cannot continue'

export type LegendaryLaunchFailure = 'credentials' | 'network' | 'login'

export function classifyLegendaryLaunchFailure(input: {
  output: string
  errored: boolean
  aborted: boolean
}): LegendaryLaunchFailure | null {
  if (!input.errored || input.aborted) return null
  if (input.output.includes(EPIC_AUTH_FAILURE_MARKER)) return 'credentials'
  if (input.output.includes(EPIC_NETWORK_FAILURE_MARKER)) return 'network'
  if (input.output.includes(LEGENDARY_LAUNCH_LOGIN_FAILED_MARKER))
    return 'login'
  return null
}

type Translate = (
  key: string,
  defaultValue: string,
  options?: Record<string, unknown>
) => string

const defaultTranslate: Translate = (key, defaultValue, options) =>
  i18nextT(key, defaultValue, options)

export function legendaryLaunchFailureDialog(
  kind: LegendaryLaunchFailure,
  gameTitle: string,
  t: Translate = defaultTranslate
) {
  let message: string
  switch (kind) {
    case 'credentials':
      message = t(
        'gamelib:box.error.launch.epic.credentials',
        "Your Epic Games sign-in has expired, so {{title}} didn't start. Log out of Epic Games, log in again, then press Play.",
        { title: gameTitle }
      )
      break
    case 'network':
      message = t(
        'gamelib:box.error.launch.epic.network',
        "GameLib couldn't reach Epic Games to sign in, so {{title}} didn't start. Check your internet connection and try again. If this game can run offline, turn on Run Game Offline in its settings.",
        { title: gameTitle }
      )
      break
    case 'login':
      message = t(
        'gamelib:box.error.launch.epic.loginFailed',
        "GameLib couldn't sign in to Epic Games, so {{title}} didn't start. Check your internet connection, or log out of Epic Games and log in again. If this game can run offline, turn on Run Game Offline in its settings.",
        { title: gameTitle }
      )
      break
  }
  return {
    title: t('box.error.launchAborted', 'Launch aborted'),
    message,
    type: 'ERROR' as const
  }
}
