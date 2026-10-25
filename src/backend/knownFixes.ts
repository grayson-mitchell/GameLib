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
 * quick 261025-mfz: `readKnownFixesLayered` adds three trust layers for the
 * Steam bridge: local (`fixes/local/`), then bundled (`public/fixes/`, shipped
 * in the app), then remote (`fixes/`). The first layer with a parsed object
 * wins whole-file. Keys in TRUSTED_ONLY_KNOWN_FIX_KEYS are stripped from the
 * remote layer (decision 6). `readKnownFixes` is unchanged for other stores.
 *
 * MUST NOT import `electron` (or anything that transitively reaches it) --
 * including `backend/ipc` -- the Node sidecar imports this module directly.
 */

import { isAbsolute, relative, resolve } from 'path'
import { existsSync } from 'graceful-fs'
import { readFileSync } from 'fs'

import { KnowFixesInfo, Runner } from 'common/types'
import { storeMap } from 'common/utils'
import { bundledFixesPath, fixesPath, localFixesPath } from './constants/paths'
import { logWarning } from './logger'

function readFixesFileWithin(
  dir: string,
  appName: string,
  runner: Runner,
  layerLabel?: string
): KnowFixesInfo | null {
  const fixPath = resolve(dir, `${appName}-${storeMap[runner]}.json`)

  // WR-06 (34.2-REVIEW.md round 1): `appName` arrives as a free string from the
  // renderer via the `getKnownFixes` channel. `join`/`resolve` NORMALISE `..`
  // segments rather than rejecting them, so a traversing appName escaped
  // the directory and made this an arbitrary-file read primitive -- whatever it
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
  const relativeToFixes = relative(resolve(dir), fixPath)
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
    logWarning(
      `Known fixes could not be applied${layerLabel ? ` (${layerLabel} layer)` : ''}, ignoring.\n${String(error)}`
    )
    return null
  }
}

export function readKnownFixes(
  appName: string,
  runner: Runner
): KnowFixesInfo | null {
  return readFixesFileWithin(fixesPath, appName, runner)
}

// Keys honoured only from bundled or local sources. dllOverrides, overlays and
// shimFeatures join this list when they land (decision 6).
export const TRUSTED_ONLY_KNOWN_FIX_KEYS = ['registry'] as const

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readKnownFixesLayered(
  appName: string,
  runner: Runner
): KnowFixesInfo | null {
  const layers: [string, string][] = [
    [localFixesPath, 'local'],
    [bundledFixesPath, 'bundled'],
    [fixesPath, 'remote']
  ]
  for (const [dir, label] of layers) {
    const parsed: unknown = readFixesFileWithin(dir, appName, runner, label)
    if (parsed === null) continue
    if (!isPlainObject(parsed)) {
      logWarning(
        `Known fixes for '${appName}' (${label} layer) is not an object, ignoring.`
      )
      continue
    }
    if (label !== 'remote') return parsed as unknown as KnowFixesInfo

    const copy: Record<string, unknown> = { ...parsed }
    for (const key of TRUSTED_ONLY_KNOWN_FIX_KEYS) {
      if (key in copy) {
        delete copy[key]
        logWarning(
          `Known fixes for '${appName}': ignoring '${key}' from the remote layer, it is honoured only from bundled or local sources.`
        )
      }
    }
    return copy as unknown as KnowFixesInfo
  }
  return null
}
