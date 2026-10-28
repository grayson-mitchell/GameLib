/**
 * Tier-2 `registry` and `dllOverrides` known-fixes, shared by every store
 * (quick 261026-j6x, 261029-gow). `dllOverrides` compiles to
 * `AppDefaults\<exe>\DllOverrides` REG_SZ values (spike 031: CrossOver's wine
 * drops WINEDLLOVERRIDES), views [64] because HKCU\Software is not
 * redirected, and shares the applier below.
 *
 * `reg add /f` values from `<appName>-<runner>.profile.json`, honoured only
 * from the bundled and local layers, never the remote one (decision 6 of
 * per-game-compat-fixes-architecture.md; the layering lives in
 * `readKnownFixProfile`). Decision 1: tier-2 applies to every store. The Steam
 * bridge and the non-Steam Wine path (`prepareWineLaunch`) both use this.
 *
 * `reg add /f` is idempotent, but each one costs a cold Wine session, so values
 * already present in the prefix's system.reg/user.reg (same type and data) are
 * no longer rewritten each launch (quick 261027-m1m); any doubt re-runs the
 * `reg add`. There is still no applied-fix ledger or reversal (decision 5,
 * as before): turning a profile off does not remove a value already written.
 *
 * This module must NOT import backend/launcher statically: launcher.ts
 * imports it, so a static import back would be a cycle.
 */

import type { ChildProcess } from 'child_process'
import { promises as fsPromises } from 'fs'
import { basename, join } from 'path'
import type {
  GameSettings,
  KnownFixProfile,
  KnownFixRegistryView,
  Runner
} from 'common/types'
import { readKnownFixProfile } from 'backend/knownFixes'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { userHome } from 'backend/constants/paths'

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

export const DLL_OVERRIDE_MODES = [
  'native',
  'builtin',
  'native,builtin',
  'builtin,native',
  'disabled'
] as const

const DLL_OVERRIDE_EXE = /^[A-Za-z0-9][A-Za-z0-9 ._()+-]{0,250}\.exe$/i
const DLL_OVERRIDE_DLL = /^[A-Za-z0-9_+-][A-Za-z0-9_.+-]{0,63}$/

function shown(v: unknown): string {
  try {
    return String(JSON.stringify(v)).slice(0, 200)
  } catch {
    return '[unserialisable]'
  }
}

/**
 * Compiles tier-2 `dllOverrides` to raw registry entries under
 * `HKCU\Software\Wine\AppDefaults\<exe>\DllOverrides`. They still go through
 * validateRegistryFixes. Never throws; invalid parts are skipped with a
 * warning. No reversal (decision 5), as for `registry`.
 */
export function dllOverridesToRegistryFixes(
  raw: unknown,
  ctx: RegistryFixLogContext
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  try {
    if (!Array.isArray(raw)) {
      logWarning(
        `${ctx.label}: ignoring dllOverrides, not an array`,
        ctx.logPrefix
      )
      return []
    }
    const warn = (why: string, v: unknown) =>
      logWarning(
        `${ctx.label}: skipping invalid dllOverrides (${why}): ${shown(v)}`,
        ctx.logPrefix
      )
    for (const entry of raw) {
      if (!isRecord(entry)) {
        warn('entry not an object', entry)
        continue
      }
      const { exe, dlls } = entry
      if (typeof exe !== 'string' || !DLL_OVERRIDE_EXE.test(exe)) {
        warn('bad exe', exe)
        continue
      }
      if (!isRecord(dlls) || Object.keys(dlls).length === 0) {
        warn('dlls not a non-empty object', dlls)
        continue
      }
      for (const [dll, mode] of Object.entries(dlls)) {
        if (!DLL_OVERRIDE_DLL.test(dll) || /\.dll$/i.test(dll)) {
          warn('bad dll name', dll)
          continue
        }
        if (
          typeof mode !== 'string' ||
          !(DLL_OVERRIDE_MODES as readonly string[]).includes(mode)
        ) {
          warn(`bad mode for ${dll}`, mode)
          continue
        }
        out.push({
          key: `HKCU\\Software\\Wine\\AppDefaults\\${exe}\\DllOverrides`,
          name: dll,
          type: 'REG_SZ',
          value: mode === 'disabled' ? '' : mode,
          views: [64]
        })
      }
    }
  } catch (error) {
    logWarning(
      `${ctx.label}: dllOverrides compilation failed: ${String(error)}`,
      ctx.logPrefix
    )
  }
  return out
}

/**
 * Raw registry fixes for a profile: `registry` first, then compiled
 * `dllOverrides`. undefined when the profile has neither; `profile.registry`
 * itself when `dllOverrides` is absent (registry-only stays byte-identical).
 */
export function knownFixProfileRegistryFixes(
  profile: KnownFixProfile,
  ctx: RegistryFixLogContext
): unknown {
  if (profile.dllOverrides === undefined) return profile.registry
  let base: unknown[] = []
  if (profile.registry !== undefined) {
    if (Array.isArray(profile.registry)) base = profile.registry
    else {
      logWarning(
        `${ctx.label}: ignoring registry fixes, not an array`,
        ctx.logPrefix
      )
    }
  }
  return [...base, ...dllOverridesToRegistryFixes(profile.dllOverrides, ctx)]
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

const PRINTABLE_ASCII = /^[\x20-\x7e]*$/

function hiveSegments(fix: ValidRegistryFix): string[] | null {
  const root = REGISTRY_ROOTS.find((r) => fix.key.startsWith(r))
  return root ? fix.key.slice(root.length).split('\\') : null
}

/**
 * Conservative reader for a Wine `.reg` file: true ONLY when the value is
 * certainly present with the same type and data. Any doubt returns false (a
 * false "present" is the only real failure mode; false just re-runs reg add).
 */
export function wineRegistryValueIsSet(
  regText: string,
  fix: ValidRegistryFix,
  view: KnownFixRegistryView
): boolean {
  const lines = regText.split('\n').map((l) => l.replace(/\r$/, ''))
  if (lines[0] !== 'WINE REGISTRY Version 2') return false
  let arch: 'win32' | 'win64' | undefined
  for (const line of lines) {
    if (line.startsWith('[')) break
    if (line === '#arch=win32') arch = 'win32'
    else if (line === '#arch=win64') arch = 'win64'
  }
  if (!arch) return false

  const root = REGISTRY_ROOTS.find((r) => fix.key.startsWith(r))
  const segments = hiveSegments(fix)
  if (!root || !segments) return false
  const isHklm = root === 'HKLM\\' || root === 'HKEY_LOCAL_MACHINE\\'

  let mapped: string[]
  if (arch === 'win64' && view === 64) {
    mapped = segments
  } else if (arch === 'win64' && view === 32) {
    if (
      !isHklm ||
      segments[0].toLowerCase() !== 'software' ||
      segments.length < 2 ||
      segments[1].toLowerCase() === 'classes' ||
      segments.some((s) => s.toLowerCase() === 'wow6432node')
    ) {
      return false
    }
    mapped = ['Software', 'Wow6432Node', ...segments.slice(1)]
  } else if (arch === 'win32' && view === 32) {
    mapped = segments
  } else {
    return false
  }

  if (
    [...mapped, fix.name].some(
      (s) => !PRINTABLE_ASCII.test(s) || /[[\]]/.test(s)
    )
  ) {
    return false
  }

  const header = `[${mapped.join('\\\\')}]`.toLowerCase()
  const sectionStart = lines.findIndex((l) => {
    if (!l.startsWith('[')) return false
    const close = l.indexOf(']')
    return close > 0 && l.slice(0, close + 1).toLowerCase() === header
  })
  if (sectionStart === -1) return false

  const body: string[] = []
  for (let i = sectionStart + 1; i < lines.length; i++) {
    const l = lines[i]
    if (l.startsWith('[')) break
    if (l.startsWith('#')) continue
    if (l.endsWith('\\')) return false
    body.push(l)
  }

  const namePrefix = `"${fix.name.replace(/\\/g, '\\\\')}"=`.toLowerCase()
  const valueLine = body.find((l) => l.toLowerCase().startsWith(namePrefix))
  if (valueLine === undefined) return false
  const stored = valueLine.slice(namePrefix.length)

  if (fix.type === 'REG_DWORD') {
    const m = /^dword:([0-9a-fA-F]{8})$/.exec(stored)
    return m !== null && parseInt(m[1], 16) === Number(fix.data)
  }
  if (fix.type === 'REG_SZ') {
    if (!PRINTABLE_ASCII.test(fix.data)) return false
    if (stored.length < 2 || !stored.startsWith('"') || !stored.endsWith('"')) {
      return false
    }
    const inner = stored.slice(1, -1)
    let out = ''
    for (let i = 0; i < inner.length; i++) {
      const c = inner[i]
      if (c === '\\') {
        const n = inner[i + 1]
        if (n !== '\\' && n !== '"') return false
        out += n
        i++
      } else if (c === '"') {
        return false
      } else {
        out += c
      }
    }
    return out === fix.data
  }
  return false
}

/** Which Wine registry file in the prefix holds this fix's hive. */
function registryFileFor(
  prefixDir: string,
  fix: ValidRegistryFix
): string | null {
  if (
    fix.key.startsWith('HKLM\\') ||
    fix.key.startsWith('HKEY_LOCAL_MACHINE\\')
  ) {
    return join(prefixDir, 'system.reg')
  }
  if (
    fix.key.startsWith('HKCU\\') ||
    fix.key.startsWith('HKEY_CURRENT_USER\\')
  ) {
    return join(prefixDir, 'user.reg')
  }
  return null
}

type RegistryFixRun = (
  commandParts: string[],
  onSpawn: (child: ChildProcess) => void
) => Promise<{ code?: number | null } | undefined>

/**
 * Validates and writes every registry fix, one `run` per (fix, view), each
 * bounded by REGISTRY_FIX_TIMEOUT_MS. Values already present in `prefixDir`'s
 * registry files are skipped. A timed-out `reg add` child is killed. Never
 * rejects: failures warn and the caller carries on.
 */
export async function applyRegistryFixes(
  raw: unknown,
  ctx: RegistryFixLogContext,
  run: RegistryFixRun,
  prefixDir?: string
): Promise<void> {
  const regCache = new Map<string, string | null>()
  const readReg = async (file: string): Promise<string | null> => {
    if (!regCache.has(file)) {
      try {
        regCache.set(file, await fsPromises.readFile(file, 'utf-8'))
      } catch {
        regCache.set(file, null)
      }
    }
    return regCache.get(file) ?? null
  }
  try {
    for (const fix of validateRegistryFixes(raw, ctx)) {
      for (const view of fix.views) {
        const where = `${fix.key} ${fix.name} (/reg:${view})`
        if (typeof prefixDir === 'string' && prefixDir !== '') {
          try {
            const file = registryFileFor(prefixDir, fix)
            const text = file ? await readReg(file) : null
            if (
              file &&
              text !== null &&
              wineRegistryValueIsSet(text, fix, view)
            ) {
              logInfo(
                `${ctx.label}: registry fix ${where} already set in ${basename(file)}, skipping reg add`,
                ctx.logPrefix
              )
              continue
            }
          } catch {
            // Doubt: fall through and run reg add.
          }
        }
        let timer: NodeJS.Timeout | undefined
        let child: ChildProcess | undefined
        try {
          const timeout = new Promise<'timeout'>((res) => {
            timer = setTimeout(() => res('timeout'), REGISTRY_FIX_TIMEOUT_MS)
            timer.unref()
          })
          const outcome = await Promise.race([
            run(buildRegistryFixCommandParts(fix, view), (c) => {
              child = c
            }),
            timeout
          ])
          if (outcome === 'timeout') {
            let killed = false
            if (child && child.exitCode === null && child.signalCode === null) {
              // SIGKILL: the child is stalled behind wineboot with nothing to
              // clean up, and `reg add /f` reruns next launch.
              try {
                child.kill('SIGKILL')
                killed = true
              } catch {
                // already gone
              }
            }
            logWarning(
              killed
                ? `${ctx.label}: registry fix ${where} timed out after ${REGISTRY_FIX_TIMEOUT_MS} ms; killed reg add (pid ${String(child?.pid)})`
                : `${ctx.label}: registry fix ${where} timed out (no running child to kill)`,
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
 * The Wine prefix directory holding system.reg/user.reg for a game's
 * settings, or undefined when unknown (= no skip, old behaviour).
 */
export function knownFixPrefixDir(
  gameSettings: GameSettings
): string | undefined {
  const type = gameSettings.wineVersion?.type
  const prefix = gameSettings.winePrefix
  if (type === 'crossover') {
    const bottle = gameSettings.wineCrossoverBottle
    if (!bottle) return undefined
    // Mirrors steam/bottle.ts getBottleDir without importing that module.
    return join(
      userHome,
      'Library/Application Support/CrossOver/Bottles',
      bottle
    )
  }
  if (!prefix) return undefined
  if (type === 'proton') return join(prefix, 'pfx')
  if (type === 'wine' || type === 'toolkit') return prefix
  return undefined
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
    const ctx = { label, logPrefix: LogPrefix.Backend }
    const raw = profile ? knownFixProfileRegistryFixes(profile, ctx) : undefined
    if (raw === undefined) return
    // Lazy, to avoid the launcher import cycle.
    const { runWineCommand } = await import('backend/launcher')
    await applyRegistryFixes(
      raw,
      ctx,
      (commandParts, onSpawn) =>
        runWineCommand({
          commandParts,
          gameSettings,
          wait: false,
          protonVerb: 'runinprefix',
          onSpawn
        }),
      knownFixPrefixDir(gameSettings)
    )
  } catch (error) {
    logWarning(
      `${label}: registry profile application failed: ${String(error)}`,
      LogPrefix.Backend
    )
  }
}
