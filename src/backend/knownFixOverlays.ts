/**
 * Tier-2 `overlays` known-fixes: the plugin-directory target (quick
 * 261027-n77).
 *
 * A profile entry `{ id, target: 'gstreamer-plugin-path' }` names an overlay in
 * GameLib's own catalogue (`common/knownFixOverlayCatalogue`); the verified
 * payload is installed on demand and its plugin directory is appended to
 * `GST_PLUGIN_PATH`. Only darwin + CrossOver. Shared by the Steam bridge and
 * `prepareWineLaunch`; read only from the local and bundled layers.
 *
 * This module must NOT import backend/launcher or backend/utils statically
 * (launcher imports it, and utils imports launcher).
 */

import { isAbsolute, join, resolve, sep } from 'path'
import type { EnviromentVariable, GameSettings, Runner } from 'common/types'
import {
  KNOWN_FIX_OVERLAY_TARGET_ENV,
  KnownFixOverlayCatalogueEntry,
  lookupKnownFixOverlay
} from 'common/knownFixOverlayCatalogue'
import { readKnownFixProfile } from 'backend/knownFixes'
import { logDebug, logInfo, logWarning, LogPrefix } from 'backend/logger'
import {
  ensureOverlayInstalled,
  OverlayInstallDeps
} from 'backend/knownFixOverlayInstall'

export const MAX_OVERLAY_ENTRIES = 8
const MAX_LOGGED_VALUE = 512
const ALLOWED_ENTRY_KEYS = ['id', 'target']

interface OverlayLogContext {
  label: string
  logPrefix: LogPrefix
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function show(entry: unknown): string {
  return String(JSON.stringify(entry)).slice(0, 200)
}

/** Validates raw `overlays` entries; never throws, warns once per reject. */
export function validateOverlayEntries(
  raw: unknown,
  ctx: OverlayLogContext
): KnownFixOverlayCatalogueEntry[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    logWarning(
      `${ctx.label}: overlays must be an array; ignoring`,
      ctx.logPrefix
    )
    return []
  }
  if (raw.length > MAX_OVERLAY_ENTRIES) {
    logWarning(
      `${ctx.label}: more than ${MAX_OVERLAY_ENTRIES} overlays; only the first ${MAX_OVERLAY_ENTRIES} are considered`,
      ctx.logPrefix
    )
  }
  const out: KnownFixOverlayCatalogueEntry[] = []
  for (const entry of raw.slice(0, MAX_OVERLAY_ENTRIES)) {
    const reject = (why: string) =>
      logWarning(
        `${ctx.label}: overlay entry rejected (${why}): ${show(entry)}`,
        ctx.logPrefix
      )
    if (!isRecord(entry)) {
      reject('not an object')
      continue
    }
    const extra = Object.keys(entry).filter(
      (k) => !ALLOWED_ENTRY_KEYS.includes(k)
    )
    if (extra.length > 0) {
      reject(`unexpected key ${extra.join(', ')}`)
      continue
    }
    const catalogued = lookupKnownFixOverlay(entry.id)
    if (!catalogued) {
      reject('unknown overlay id')
      continue
    }
    if (entry.target !== catalogued.target) {
      reject('target does not match the catalogue')
      continue
    }
    if (out.includes(catalogued)) continue
    out.push(catalogued)
  }
  return out
}

function normalised(p: string): string {
  const r = resolve(p)
  return r.length > 1 && r.endsWith(sep) ? r.slice(0, -1) : r
}

/** Appends `dir` to a ':' list unless already present; empty segments dropped. */
export function appendPathList(
  existing: string | undefined,
  dir: string
): string {
  const parts = (existing ?? '').split(':').filter((s) => s !== '')
  const want = normalised(dir)
  const has = parts.some((p) => isAbsolute(p) && normalised(p) === want)
  return (has ? parts : [...parts, dir]).join(':')
}

/** The last matching option wins, as setupEnvVars applies them. */
export function lastEnvOption(
  options: EnviromentVariable[] | undefined,
  key: string
): string | undefined {
  let value: string | undefined
  for (const o of options ?? []) if (o.key === key) value = o.value
  return value
}

export async function resolveKnownFixOverlayEnv(
  raw: unknown,
  opts: {
    label: string
    logPrefix: LogPrefix
    wineType: string | undefined
    baseValue: (key: string) => string | undefined
    platform?: NodeJS.Platform
    deps?: OverlayInstallDeps
  }
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  try {
    if (raw === undefined) return result
    const ctx = { label: opts.label, logPrefix: opts.logPrefix }
    const platform = opts.platform ?? process.platform
    let warnedShadow = false
    for (const entry of validateOverlayEntries(raw, ctx)) {
      if (
        entry.platform.os !== platform ||
        entry.platform.wine !== opts.wineType
      ) {
        logDebug(
          `${opts.label}: overlay ${entry.id} skipped: ${platform}/${opts.wineType} is not ${entry.platform.os}/${entry.platform.wine}`,
          opts.logPrefix
        )
        continue
      }
      const dir = await ensureOverlayInstalled(entry, ctx, opts.deps)
      if (!dir) continue
      const envKey = KNOWN_FIX_OVERLAY_TARGET_ENV[entry.target]
      result[envKey] = appendPathList(
        result[envKey] ?? opts.baseValue(envKey),
        join(dir, entry.pluginSubdir)
      )
      if (!warnedShadow && opts.baseValue('GST_PLUGIN_PATH_1_0')) {
        warnedShadow = true
        logWarning(
          `${opts.label}: GST_PLUGIN_PATH_1_0 is set and shadows GST_PLUGIN_PATH, so overlay ${entry.id} may not be loaded`,
          opts.logPrefix
        )
      }
    }
  } catch (err) {
    logWarning(
      `${opts.label}: overlay env failed: ${String(err)}; launching without it`,
      opts.logPrefix
    )
    return {}
  }
  return result
}

/** Overlay env for a non-Steam launch; precedence mirrors the runner commandEnv. */
export async function knownFixProfileOverlayEnv(
  appName: string,
  runner: Runner,
  gameSettings: GameSettings,
  tier1Env: Record<string, string>,
  logPrefix: LogPrefix = LogPrefix.Backend
): Promise<Record<string, string>> {
  return resolveKnownFixOverlayEnv(
    readKnownFixProfile(appName, runner)?.overlays,
    {
      label: `${runner} ${appName}`,
      logPrefix,
      wineType: gameSettings.wineVersion?.type,
      baseValue: (k) =>
        tier1Env[k] ??
        lastEnvOption(gameSettings.enviromentOptions, k) ??
        process.env[k]
    }
  )
}

export function formatKnownFixEnvLine(
  entries: Array<{ key: string; value: string; source: string }>
): string | null {
  if (entries.length === 0) return null
  const items = entries.map((e) => {
    const v =
      e.value.length > MAX_LOGGED_VALUE
        ? `${e.value.slice(0, MAX_LOGGED_VALUE)}...`
        : e.value
    return `${e.key}=${v} (${e.source})`
  })
  return `known-fix env applied: ${items.join('; ')}`
}

export function logKnownFixEnv(
  label: string,
  entries: Array<{ key: string; value: string; source: string }>,
  logPrefix: LogPrefix
): string | null {
  const line = formatKnownFixEnvLine(entries)
  if (line) logInfo(`${label}: ${line}`, logPrefix)
  return line
}

export function withKnownFixEnv(
  gameSettings: GameSettings,
  env: Record<string, string>
): GameSettings {
  const entries = Object.entries(env)
  if (entries.length === 0) return gameSettings
  return {
    ...gameSettings,
    enviromentOptions: [
      ...(gameSettings.enviromentOptions ?? []),
      ...entries.map(([key, value]) => ({ key, value }))
    ]
  }
}
