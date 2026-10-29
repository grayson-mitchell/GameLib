/**
 * D-UAT-12: the library card showed a plain "Install" for an incomplete Steam
 * install while the detail page showed "Resume Install". This mirrors the
 * detail page's `statusContext === 'steam-incomplete'` signal
 * (GameStatus.tsx / MainButton.tsx, D-UAT-09) using the value `hasStatus`
 * already threads -- single source of truth, no second read of
 * `install.steamResumePending`.
 */
import type { Runner } from 'common/types'

export function isSteamIncompleteCard(args: {
  runner: Runner | string | undefined
  status: string | undefined
  statusContext: string | undefined
}): boolean {
  return (
    args.runner === 'steam' &&
    args.status === 'notInstalled' &&
    args.statusContext === 'steam-incomplete'
  )
}
