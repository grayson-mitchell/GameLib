/**
 * Known-fixes JSON reader, extracted out of `launcher.ts` (Phase 34.2 Plan
 * 03, D-05).
 *
 * `launcher.ts` is deliberately excluded from the Node sidecar's import
 * graph (`sidecar/steamFlowRegistration.ts:22` records the exclusion in
 * code, alongside the same rationale for `storeManagers/index.ts`'s eager
 * `libraryManagerMap`) -- it is a 2170-line module dominated by
 * `prepareWineLaunch`/`runWineCommand`/`callRunner` and the whole Wine
 * launch pipeline. Importing it just to reach this 20-line self-contained
 * fs read would drag that entire pipeline into the sidecar bundle. This
 * module holds only `readKnownFixes`, moved verbatim, so `main.ts`'s
 * `getKnownFixes` registration can be backed by a body the sidecar can
 * import directly.
 *
 * MUST NOT import `electron` (or anything that transitively reaches it) --
 * including `backend/ipc` -- the Node sidecar imports this module directly.
 */

import { join } from 'path'
import { existsSync } from 'graceful-fs'
import { readFileSync } from 'fs'

import { KnowFixesInfo, Runner } from 'common/types'
import { storeMap } from 'common/utils'
import { fixesPath } from './constants/paths'
import { logWarning } from './logger'

export function readKnownFixes(
  appName: string,
  runner: Runner
): KnowFixesInfo | null {
  const fixPath = join(fixesPath, `${appName}-${storeMap[runner]}.json`)

  if (!existsSync(fixPath)) return null

  try {
    const fixesContent = JSON.parse(
      readFileSync(fixPath).toString()
    ) as KnowFixesInfo

    return fixesContent
  } catch (error) {
    // if we fail to download the json file, it can be malformed causing
    // JSON.parse to throw an exception
    logWarning(`Known fixes could not be applied, ignoring.\n${error}`)
    return null
  }
}
