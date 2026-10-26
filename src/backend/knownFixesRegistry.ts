/**
 * Tier-2 `registry` known-fixes, shared by every store (quick 261026-j6x).
 *
 * `reg add /f` values from `<appName>-<runner>.profile.json`, honoured only
 * from the bundled and local layers, never the remote one (decision 6 of
 * per-game-compat-fixes-architecture.md; the layering lives in
 * `readKnownFixProfile`). Decision 1: tier-2 applies to every store. The Steam
 * bridge and the non-Steam Wine path (`prepareWineLaunch`) both use this.
 *
 * Re-applied on each launch because `reg add /f` is idempotent. There is no
 * applied-fix ledger or reversal yet (decision 5, as before): turning a
 * profile off does not remove a value already written.
 *
 * This module must NOT import backend/launcher statically: launcher.ts
 * imports it, so a static import back would be a cycle.
 */

import type { GameSettings, KnownFixRegistryView, Runner } from 'common/types'
import { readKnownFixProfile } from 'backend/knownFixes'
import { logWarning, LogPrefix } from 'backend/logger'

export const REGISTRY_FIX_TIMEOUT_MS = 15_000
const REGISTRY_ROOTS = [
  'HKLM\\',
  'HKEY_LOCAL_MACHINE\\',
  'HKCU\\',
  'HKEY_CURRENT_USER\\'
]
const FORBIDDEN_CHARS = /["\r\n\0]/

export interface ValidRegistryFix {
  key: string
  name: string
  type: 'REG_DWORD' | 'REG_SZ'
  data: string
  views: KnownFixRegistryView[]
}

export interface RegistryFixLogContext {
  label: string
  logPrefix: LogPrefix
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function validKey(key: unknown): key is string {
  if (typeof key !== 'string' || key.length > 512) return false
  if (FORBIDDEN_CHARS.test(key)) return false
  const root = REGISTRY_ROOTS.find((r) => key.startsWith(r))
  if (!root) return false
  const rest = key.slice(root.length)
  if (rest === '' || rest.endsWith('\\')) return false
  return rest.split('\\').every((seg) => seg !== '')
}

function parseViews(raw: unknown): KnownFixRegistryView[] | null {
  if (raw === undefined) return [32, 64]
  if (!Array.isArray(raw) || raw.length === 0) return null
  if (!raw.every((v) => v === 32 || v === 64)) return null
  const out: KnownFixRegistryView[] = []
  if (raw.includes(32)) out.push(32)
  if (raw.includes(64)) out.push(64)
  return out
}

/** Validates raw `registry` entries; never throws, warns once per reject. */
export function validateRegistryFixes(
  raw: unknown,
  ctx: RegistryFixLogContext
): ValidRegistryFix[] {
  if (!Array.isArray(raw)) {
    logWarning(
      `${ctx.label}: ignoring registry fixes, not an array`,
      ctx.logPrefix
    )
    return []
  }
  const out: ValidRegistryFix[] = []
  for (const entry of raw) {
    const reject = (why: string) => {
      let shown: string
      try {
        shown = String(JSON.stringify(entry)).slice(0, 200)
      } catch {
        shown = '[unserialisable]'
      }
      logWarning(
        `${ctx.label}: skipping invalid registry fix (${why}): ${shown}`,
        ctx.logPrefix
      )
    }
    if (!isRecord(entry)) {
      reject('not an object')
      continue
    }
    const { key, name, type, value } = entry
    if (!validKey(key)) {
      reject('bad key')
      continue
    }
    if (
      typeof name !== 'string' ||
      name === '' ||
      name.length > 256 ||
      name.startsWith('/') ||
      FORBIDDEN_CHARS.test(name)
    ) {
      reject('bad name')
      continue
    }
    let data: string
    if (type === 'REG_DWORD') {
      if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < 0 ||
        value > 0xffffffff
      ) {
        reject('bad REG_DWORD value')
        continue
      }
      data = String(value)
    } else if (type === 'REG_SZ') {
      if (
        typeof value !== 'string' ||
        value.length > 1024 ||
        FORBIDDEN_CHARS.test(value)
      ) {
        reject('bad REG_SZ value')
        continue
      }
      data = value
    } else {
      reject('unknown type')
      continue
    }
    const views = parseViews(entry.views)
    if (!views) {
      reject('bad views')
      continue
    }
    out.push({ key, name, type, data, views })
  }
  return out
}

/** Argv for `reg add`; an array, never a shell string. */
export function buildRegistryFixCommandParts(
  fix: ValidRegistryFix,
  view: KnownFixRegistryView
): string[] {
  return [
    'reg',
    'add',
    fix.key,
    '/v',
    fix.name,
    '/t',
    fix.type,
    '/d',
    fix.data,
    `/reg:${view}`,
    '/f'
  ]
}

/**
 * Validates and writes every registry fix, one `run` per (fix, view), each
 * bounded by REGISTRY_FIX_TIMEOUT_MS. Never rejects: failures warn and the
 * caller carries on.
 */
export async function applyRegistryFixes(
  raw: unknown,
  ctx: RegistryFixLogContext,
  run: (commandParts: string[]) => Promise<{ code?: number | null } | undefined>
): Promise<void> {
  try {
    for (const fix of validateRegistryFixes(raw, ctx)) {
      for (const view of fix.views) {
        const where = `${fix.key} ${fix.name} (/reg:${view})`
        let timer: NodeJS.Timeout | undefined
        try {
          const timeout = new Promise<'timeout'>((res) => {
            timer = setTimeout(() => res('timeout'), REGISTRY_FIX_TIMEOUT_MS)
            timer.unref()
          })
          const outcome = await Promise.race([
            run(buildRegistryFixCommandParts(fix, view)),
            timeout
          ])
          if (outcome === 'timeout') {
            logWarning(
              `${ctx.label}: registry fix ${where} timed out`,
              ctx.logPrefix
            )
          } else if (outcome?.code !== 0) {
            logWarning(
              `${ctx.label}: registry fix ${where} did not succeed (code ${String(outcome?.code)})`,
              ctx.logPrefix
            )
          }
        } catch (error) {
          logWarning(
            `${ctx.label}: registry fix ${where} threw: ${String(error)}`,
            ctx.logPrefix
          )
        } finally {
          clearTimeout(timer)
        }
      }
    }
  } catch (error) {
    logWarning(
      `${ctx.label}: registry fix application failed: ${String(error)}`,
      ctx.logPrefix
    )
  }
}

/**
 * Non-Steam launch hook: applies the game's tier-2 profile `registry` to its
 * own Wine prefix. Called from prepareWineLaunch on every launch.
 *
 * 'runinprefix' matches the GalaxyCommunication `sc create` call in the same
 * function (a prefix-internal tool, not a game). The prefix check is NOT
 * skipped: unlike the Steam bridge this is the game's real prefix and
 * verifyWinePrefix has just run. wait: false and the 15 s timeout match the
 * Steam path because `wineserver --wait` can block.
 */
export async function applyKnownFixProfileRegistry(
  appName: string,
  runner: Runner,
  gameSettings: GameSettings
): Promise<void> {
  const label = `${runner} ${appName}`
  try {
    const profile = readKnownFixProfile(appName, runner)
    if (!profile || profile.registry === undefined) return
    // Lazy, to avoid the launcher import cycle.
    const { runWineCommand } = await import('backend/launcher')
    await applyRegistryFixes(
      profile.registry,
      { label, logPrefix: LogPrefix.Backend },
      (commandParts) =>
        runWineCommand({
          commandParts,
          gameSettings,
          wait: false,
          protonVerb: 'runinprefix'
        })
    )
  } catch (error) {
    logWarning(
      `${label}: registry profile application failed: ${String(error)}`,
      LogPrefix.Backend
    )
  }
}
