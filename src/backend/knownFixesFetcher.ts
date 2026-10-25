/**
 * quick 261026-avw: install-time fetch of tier-1 known fixes (decisions 1 and 6
 * of .planning/notes/per-game-compat-fixes-architecture.md).
 *
 * Sources, in order: GameLib's own repo (grayson-mitchell/known-fixes, every
 * store), then Heroic's feed (Heroic-Games-Launcher/known-fixes) for
 * epic/gog/amazon only. Heroic is consulted ONLY when GameLib answers 404. Any
 * indeterminate answer (network error, timeout, 5xx, 403, malformed body)
 * stops the fetch with nothing written and nothing deleted, so a transient
 * GameLib outage can never replace a GameLib-sourced file with Heroic's.
 * A stale downloaded file is deleted only when every applicable source
 * answers 404.
 *
 * Write-time filtering decision: bodies are filtered through
 * filterTier1KnownFixes at write AND at read. Write-time filtering means the
 * remote dir only ever holds allow-listed keys, the dropped-key warnings name
 * the actual source (GameLib vs Heroic) once at install rather than on every
 * launch, and a non-object/malformed body is rejected before it can displace a
 * good file. Read-time filtering stays as the defence for hand-placed files and
 * files downloaded by older builds (Heroic files written unfiltered by the old
 * `downloadFile` path).
 *
 * MUST NOT import `electron`, `backend/ipc` or `backend/utils` -- same
 * dependency-surface rule as knownFixes.ts.
 */

import axios from 'axios'
import { isAbsolute, join, relative, resolve, sep } from 'path'
import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'graceful-fs'

import { Runner } from 'common/types'
import { storeMap } from 'common/utils'
import { fixesPath } from './constants/paths'
import { filterTier1KnownFixes } from './knownFixes'
import { logInfo, logWarning, LogPrefix } from './logger'

export const GAMELIB_KNOWN_FIXES_BASE =
  'https://raw.githubusercontent.com/grayson-mitchell/known-fixes/main'
export const HEROIC_KNOWN_FIXES_BASE =
  'https://raw.githubusercontent.com/Heroic-Games-Launcher/known-fixes/main'

/** Heroic's feed covers Epic, GOG and Amazon only (decision 6). */
const HEROIC_FALLBACK_RUNNERS: ReadonlySet<Runner> = new Set<Runner>([
  'legendary',
  'gog',
  'nile'
])

export type KnownFixesGet = (
  url: string
) => Promise<{ status: number; data: unknown }>

const defaultGet: KnownFixesGet = async (url) => {
  const res = await axios.get(url, {
    timeout: 10000,
    responseType: 'text',
    transformResponse: (r) => r,
    validateStatus: () => true
  })
  return { status: res.status, data: res.data }
}

function parseBody(data: unknown): unknown {
  if (typeof data === 'string') return JSON.parse(data)
  return data
}

async function run(appName: string, runner: Runner, get: KnownFixesGet) {
  const store = storeMap[runner]
  if (!store) return

  const root = resolve(fixesPath)
  const dest = resolve(root, `${appName}-${store}.json`)
  const rel = relative(root, dest)
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || rel.includes(sep)) {
    logWarning(
      `Refusing known-fixes fetch for unsafe app name "${appName}"`,
      LogPrefix.Backend
    )
    return
  }

  const sources: { label: string; base: string }[] = [
    { label: 'GameLib', base: GAMELIB_KNOWN_FIXES_BASE }
  ]
  if (HEROIC_FALLBACK_RUNNERS.has(runner)) {
    sources.push({ label: 'Heroic', base: HEROIC_KNOWN_FIXES_BASE })
  }

  for (const { label, base } of sources) {
    const url = `${base}/${store}/${appName}-${store}.json`
    let res: { status: number; data: unknown }
    try {
      res = await get(url)
    } catch (error) {
      logWarning(
        `Known fixes: ${label} request failed for ${url}: ${error}`,
        LogPrefix.Backend
      )
      return
    }
    if (res.status === 404) continue
    if (res.status !== 200) {
      logWarning(
        `Known fixes: ${label} returned ${res.status} for ${url}`,
        LogPrefix.Backend
      )
      return
    }

    let filtered
    try {
      filtered = filterTier1KnownFixes(
        appName,
        `remote: ${label}`,
        parseBody(res.data)
      )
    } catch (error) {
      logWarning(
        `Known fixes: ${label} body for ${url} is not valid JSON: ${error}`,
        LogPrefix.Backend
      )
      return
    }
    if (!filtered) {
      logWarning(
        `Known fixes: ${label} body for ${url} is not a JSON object`,
        LogPrefix.Backend
      )
      return
    }

    mkdirSync(root, { recursive: true })
    const tmp = join(root, `${appName}-${store}.json.tmp-${process.pid}`)
    writeFileSync(tmp, JSON.stringify(filtered, null, 2))
    renameSync(tmp, dest)
    logInfo(`Known fixes written from ${label}: ${dest}`, LogPrefix.Backend)
    return
  }

  if (existsSync(dest)) {
    rmSync(dest)
    logInfo(
      `Known fixes: no source has ${appName}-${store}.json, removed stale ${dest}`,
      LogPrefix.Backend
    )
  }
}

/** Never rejects. */
export async function fetchRemoteKnownFixes(
  appName: string,
  runner: Runner,
  get: KnownFixesGet = defaultGet
): Promise<void> {
  try {
    await run(appName, runner, get)
  } catch (error) {
    logWarning(
      `Known fixes fetch failed for ${appName}: ${error}`,
      LogPrefix.Backend
    )
  }
}
