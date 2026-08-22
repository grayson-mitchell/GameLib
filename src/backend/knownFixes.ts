/**
 * Known-fixes JSON reader, extracted out of `launcher.ts` (Phase 34.2 Plan
 * 03, D-05).
 *
 * `launcher.ts` is a 2170-line module dominated by
 * `prepareWineLaunch`/`runWineCommand`/`callRunner` and the whole Wine
 * launch pipeline. Importing it just to reach this 20-line self-contained
 * fs read would pull that entire pipeline in behind it. This module holds
 * only `readKnownFixes`, moved verbatim, so `main.ts`'s `getKnownFixes`
 * registration can be backed by a body the sidecar can import directly.
 *
 * WR-03 correction (34.2-REVIEW.md round 1, fixed by quick 260822-tpn): this
 * docstring used to claim `launcher.ts` "is deliberately excluded from the
 * Node sidecar's import graph". That is FALSE, and phase 34.2 is what made it
 * false -- `sidecar/gameDetailsFlowRegistration.ts` -> `gamedetails/dispatch.ts`
 * -> `storeManagers/index.ts` -> `storeManagers/gog/library.ts:51`
 * (`import { callRunner } from '../../launcher'`) reaches it transitively
 * today. The true invariant is narrower and is the one worth keeping: this
 * module avoids a DIRECT import of `launcher.ts`, which keeps this file's own
 * dependency surface small and its unit tests cheap. Do not restore the
 * stronger claim without re-checking that chain.
 *
 * MUST NOT import `electron` (or anything that transitively reaches it) --
 * including `backend/ipc` -- the Node sidecar imports this module directly.
 */

import { isAbsolute, relative, resolve } from 'path'
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
  const fixPath = resolve(fixesPath, `${appName}-${storeMap[runner]}.json`)

  // WR-06 (34.2-REVIEW.md round 1): `appName` arrives as a free string from the
  // renderer via the `getKnownFixes` channel. `join`/`resolve` NORMALISE `..`
  // segments rather than rejecting them, so a traversing appName escaped
  // `fixesPath` and made this an arbitrary-file read primitive -- whatever it
  // landed on was `readFileSync`'d and `JSON.parse`'d.
  //
  // Same containment idiom as `sidecar/fileStore.ts:121-133`, and the same
  // lesson it records: `path.join` is not containment -- use resolve+relative.
  // `runner` needs no guard; it is a closed `Runner` union indexed through
  // `storeMap`.
  //
  // Returns null rather than throwing, unlike fileStore: every failure mode of
  // this function (absent file, malformed JSON) already yields null and callers
  // depend on that. The `logWarning` keeps it loud rather than silent.
  const relativeToFixes = relative(resolve(fixesPath), fixPath)
  if (
    relativeToFixes.startsWith('..') ||
    isAbsolute(relativeToFixes) ||
    relativeToFixes === ''
  ) {
    logWarning(
      `Known fixes lookup for '${appName}' resolved outside the known-fixes directory, ignoring.`
    )
    return null
  }

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
