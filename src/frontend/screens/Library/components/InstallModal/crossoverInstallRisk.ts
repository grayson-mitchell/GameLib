import type { DialogModalOptions } from 'frontend/types'

/**
 * Quick 261024-ho4: shared CrossOver install-risk resolution for the Steam,
 * Download and ThirdParty install dialogs. Pure on purpose: no React, no
 * ContextProvider, no stylesheet, so it runs under the node jest env.
 *
 * Thresholds (operator-locked): ratings 1-3 ask for confirmation (<= 2 with
 * "known not to work" copy, 3 with "may have problems" copy), 4-5 install
 * silently, `null` (looked up, no CodeWeavers record) is a passive notice only,
 * an absent key is nothing.
 */

type CrossoverInstallRisk =
  | { kind: 'none' }
  | { kind: 'unrated' }
  | {
      kind: 'confirm'
      severity: 'known-not-to-work' | 'may-have-problems'
      rating: number
    }

export function resolveCrossoverInstallRisk({
  platform,
  installsViaCrossover,
  rating,
  runsForMe
}: {
  platform: string
  installsViaCrossover: boolean
  rating: number | null | undefined
  // Quick 261029-mkz: the game is marked "Runs for me" -- skip every warning.
  runsForMe?: boolean
}): CrossoverInstallRisk {
  if (platform !== 'darwin' || !installsViaCrossover) return { kind: 'none' }
  if (runsForMe) return { kind: 'none' }
  if (rating === null) return { kind: 'unrated' }
  if (typeof rating !== 'number' || !Number.isFinite(rating)) {
    return { kind: 'none' }
  }
  if (rating <= 2)
    return { kind: 'confirm', severity: 'known-not-to-work', rating }
  if (rating < 4)
    return { kind: 'confirm', severity: 'may-have-problems', rating }
  return { kind: 'none' }
}

type TGamelibLike = (
  key: string,
  defaultValue: string,
  options?: Record<string, unknown>
) => string

export function crossoverRiskDialogOptions(
  risk: Extract<CrossoverInstallRisk, { kind: 'confirm' }>,
  gameTitle: string,
  tGamelib: TGamelibLike,
  onConfirm: () => void
): Required<Pick<DialogModalOptions, 'title' | 'buttons'>> & {
  message: string
} {
  const interpolation = { title: gameTitle, rating: risk.rating }
  const known = risk.severity === 'known-not-to-work'
  const title = known
    ? tGamelib(
        'gamelib:installFlows.crossoverRating.knownBadTitle',
        'This game is known not to run well under CrossOver'
      )
    : tGamelib(
        'gamelib:installFlows.crossoverRating.mayHaveProblemsTitle',
        'This game may have problems under CrossOver'
      )
  const message = known
    ? tGamelib(
        'gamelib:installFlows.crossoverRating.knownBadMessage',
        'CodeWeavers rates {{title}} {{rating}} of 5 for CrossOver on macOS, which means it is known not to run well. It may install fine and then fail to start. Install it anyway?',
        interpolation
      )
    : tGamelib(
        'gamelib:installFlows.crossoverRating.mayHaveProblemsMessage',
        'CodeWeavers rates {{title}} {{rating}} of 5 for CrossOver on macOS, so it may have problems. Install it anyway?',
        interpolation
      )
  return {
    title,
    message,
    buttons: [
      {
        text: tGamelib(
          'gamelib:installFlows.crossoverRating.installAnyway',
          'Install anyway'
        ),
        onClick: onConfirm
      },
      {
        text: tGamelib('gamelib:installFlows.crossoverRating.cancel', 'Cancel'),
        onClick: () => null
      }
    ]
  }
}

// The parser picks up `gamelib:installFlows.crossoverRating.unratedNotice`
// ("No CrossOver rating found for this game. CodeWeavers has no compatibility
// report for it, so there is no early warning either way.") from
// WineSelector's call; it is listed here so all of the copy lives together.
