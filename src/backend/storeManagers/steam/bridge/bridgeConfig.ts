/**
 * Phase 51 Plan 01 (D-51-01): the backend->shim port handoff.
 *
 * `ensureBridgeHelperReady(appId)` (helperProcess.ts, this plan) learns an
 * OS-assigned ephemeral port for THIS appId's own helper -- there is no
 * fixed port a regenerated shim could hardcode anymore (the old shared
 * `BRIDGE_PORT = 54550` is gone). `writeBridgeConfig()` is the ONLY place
 * that port is handed to the game: it writes a small text file,
 * `gamelib_bridge.cfg`, beside the game's own `.exe` inside its bridge
 * bottle, and `meta/gen_vtables.ts`'s regenerated shim template reads that
 * exact filename at `SteamAPI_Init()` time to learn which loopback port to
 * connect to.
 *
 * Sanitize-then-write shape mirrors shimGenerate.ts's `placeShimForGame()`
 * (itself mirroring bottle.ts's `provisionBottle()`): reject every unsafe
 * input BEFORE touching the filesystem, using the SAME
 * `resolve()`+`relative()` containment idiom ("path.join is not
 * containment" -- steam-two-install-paths-acf-location / MAC32 lesson) as
 * `shimGenerate.ts`'s `isContainedWithin()`, reimplemented here rather than
 * imported so this module never needs an import cycle with shimGenerate.ts.
 *
 * T-51-02 (mitigate): numeric appId + bounded port range + bottle-dir
 * containment are all checked before any write; the write itself is
 * tmp-then-rename (atomic replace, never a partially-written file visible
 * to a concurrently-reading shim).
 */
import { renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

import { logError, logWarning, LogPrefix } from 'backend/logger'
import { getBottleDir, sanitizeBottleName } from '../bottle'

// Pattern repeated verbatim across bottle.ts:836, clientSetup.ts:40,
// importScan.ts, shimGenerate.ts -- reuse the SAME regex value/name, do not
// redefine a divergent one.
const NUMERIC_APP_ID = /^\d+$/

/**
 * Matches `meta/gen_vtables.ts`'s `BRIDGE_CONFIG_FILENAME` define in the
 * regenerated shim template byte-for-byte -- the single shared filename
 * both sides agree on. Never a second/divergent name.
 */
export const BRIDGE_CONFIG_FILENAME = 'gamelib_bridge.cfg'

const MIN_EPHEMERAL_PORT = 1024
const MAX_PORT = 65535

export interface WriteBridgeConfigArgs {
  /** The game's own resolved `.exe` path -- the cfg is written BESIDE it. */
  exePath: string
  bottleName: string
  appId: string
  port: number
  /** Optional `Family=Version` pins (e.g. `{ SteamUser: '023' }`) -- future
   * interfaces may want the shim to know which version it is speaking to,
   * without hardcoding it into the generated source. Omitted entirely when
   * not supplied -- no empty `iface.` lines are ever written. */
  interfaceVersions?: Record<string, string>
}

export type WriteBridgeConfigResult =
  | { status: 'written'; path: string }
  | { status: 'error'; error: string }

/**
 * True iff `candidateAbsPath` resolves to a location strictly inside
 * `rootAbsPath`. Verbatim copy of shimGenerate.ts's `isContainedWithin()`
 * idiom (not imported -- see module doc).
 */
function isContainedWithin(
  rootAbsPath: string,
  candidateAbsPath: string
): boolean {
  const rel = relative(rootAbsPath, candidateAbsPath)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * Writes `gamelib_bridge.cfg` beside `exePath`, containing the port the
 * game's own regenerated shim must connect to, plus its real AppID (both
 * are also carried by the helper's own argv/`steam_appid.txt`, but the
 * shim has no other way to learn the port). Content is three plain
 * `key=value` lines (newline-terminated), never JSON/INI section syntax --
 * the shim-side parser (`meta/gen_vtables.ts`'s generated loader) is a
 * tiny fixed-format C reader, not a general parser.
 *
 * Every input is guarded before any path/write operation:
 *  1. `appId` must be numeric (T-51-03 lineage).
 *  2. `port` must be an integer in the ephemeral/registered range
 *     (1024-65535) -- never the old fixed shared port, never a
 *     privileged (<1024) port.
 *  3. `bottleName` must sanitize clean (same `sanitizeBottleName`
 *     chokepoint every other bridge-bottle entry point uses).
 *  4. `exePath` must resolve INSIDE that bottle's directory -- rejects a
 *     path escaping the bottle before touching the filesystem (T-51-02).
 *
 * Never throws -- every failure mode (including an fs error during the
 * write itself) returns a typed `{ status: 'error', error }`, and the
 * `.tmp` staging file is removed on any write/rename failure so a
 * rejected call never leaves a partial file behind.
 */
export function writeBridgeConfig(
  args: WriteBridgeConfigArgs
): WriteBridgeConfigResult {
  const { exePath, bottleName, appId, port, interfaceVersions } = args

  if (!NUMERIC_APP_ID.test(appId)) {
    logWarning(
      `writeBridgeConfig: rejected non-numeric appId "${appId}" -- not writing a config (T-51-03)`,
      LogPrefix.Steam
    )
    return { status: 'error', error: `Invalid appId: "${appId}"` }
  }

  if (!Number.isInteger(port) || port < MIN_EPHEMERAL_PORT || port > MAX_PORT) {
    logWarning(
      `writeBridgeConfig: rejected out-of-range port ${port} for appId ${appId} (must be ${MIN_EPHEMERAL_PORT}-${MAX_PORT})`,
      LogPrefix.Steam
    )
    return { status: 'error', error: `Invalid port: ${port}` }
  }

  const sanitizedBottleName = sanitizeBottleName(bottleName)
  if (!sanitizedBottleName) {
    logError(
      `writeBridgeConfig: rejected unsafe bottle name "${bottleName}" for appId ${appId} (T-51-02)`,
      LogPrefix.Steam
    )
    return { status: 'error', error: `Invalid bottle name: "${bottleName}"` }
  }

  const bottleDir = resolve(getBottleDir(sanitizedBottleName))
  const resolvedExePath = resolve(exePath)
  if (!isContainedWithin(bottleDir, resolvedExePath)) {
    logWarning(
      `writeBridgeConfig: rejected exePath "${exePath}" -- resolves outside bridge bottle "${sanitizedBottleName}" (T-51-02)`,
      LogPrefix.Steam
    )
    return {
      status: 'error',
      error: `Exe path is outside the bridge bottle: "${exePath}"`
    }
  }

  const configPath = join(dirname(resolvedExePath), BRIDGE_CONFIG_FILENAME)
  const lines = [`port=${port}`, `appid=${appId}`]
  if (interfaceVersions) {
    for (const [family, version] of Object.entries(interfaceVersions)) {
      lines.push(`iface.${family}=${version}`)
    }
  }
  const content = lines.join('\n') + '\n'
  const tmpPath = `${configPath}.tmp`

  try {
    writeFileSync(tmpPath, content, 'utf-8')
    renameSync(tmpPath, configPath)
  } catch (error) {
    try {
      rmSync(tmpPath, { force: true })
    } catch {
      // best-effort cleanup only -- the real error below is what matters.
    }
    logError(
      [`writeBridgeConfig: failed to write config for appId ${appId}`, error],
      LogPrefix.Steam
    )
    return {
      status: 'error',
      error: `Failed to write bridge config: ${String(error)}`
    }
  }

  return { status: 'written', path: configPath }
}
