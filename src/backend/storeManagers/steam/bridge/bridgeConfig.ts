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
import { chmodSync, renameSync, rmSync, writeFileSync } from 'node:fs'
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

// WR-03: the per-helper-spawn launch secret (64 lowercase hex chars).
const BRIDGE_SECRET_PATTERN = /^[0-9a-f]{64}$/

const MIN_EPHEMERAL_PORT = 1024
const MAX_PORT = 65535

interface WriteBridgeConfigArgs {
  /** The game's own resolved `.exe` path -- the cfg is written BESIDE it. */
  exePath: string
  bottleName: string
  appId: string
  port: number
  /** WR-03: the launch secret of the SAME helper entry whose `port` is
   * given (from `ensureBridgeHelperReady`'s result). Written as a
   * `secret=` line so the shim can authenticate its HELLO. */
  secret: string
  /** Optional `Family=Version` pins (e.g. `{ SteamUser: '023' }`) -- future
   * interfaces may want the shim to know which version it is speaking to,
   * without hardcoding it into the generated source. Omitted entirely when
   * not supplied -- no empty `iface.` lines are ever written. */
  interfaceVersions?: Record<string, string>
  /** Absolute paths of GameLib-placed shim DLLs for this appId. The shim
   * resolves the cfg beside its own module (`load_bridge_port_once`), so a
   * copy must sit in each of their directories (quick 261023-ue0). */
  shimPaths?: string[]
  /** `fix.<feature>=<value>` lines from the game's tier-2 known-fix profile
   * (`steamShimFeatureCfgLines`), read by the shim at DLL load (spike 034). */
  fixLines?: string[]
}

type WriteBridgeConfigResult =
  | { status: 'written'; path: string; extraPaths?: string[] }
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
 * WR-03: a `secret=<64 hex>` line follows `appid=`, and every copy is written
 * mode 0600 (tmp written 0600, chmod'd in case a stale tmp pre-existed, then
 * renamed over the target, so the final inode is 0600). Threat model: other OS
 * users / processes that cannot read this user's files; a same-user attacker
 * can read this file and the stored refresh token and is out of scope. The
 * secret comes from the same `ensureBridgeHelperReady` result as the port
 * (the exact helper entry that was probed) and is never logged.
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
 *  5. every `shimPaths` entry must resolve inside the bottle too
 *     (quick 261023-ue0), validated before any write.
 *
 * The cfg goes beside the exe AND beside every placed shim (quick
 * 261023-ue0: the shim reads it beside its OWN module, which for
 * runtime-loaded Unity titles is `<X>_Data/Plugins/x86_64`). Stale-port
 * reasoning: N copies carry no extra staleness, because every copy is
 * rewritten on each launch with the fresh helper port.
 *
 * Never throws -- every failure mode (including an fs error during the
 * write itself) returns a typed `{ status: 'error', error }`, and the
 * `.tmp` staging file is removed on any write/rename failure so a
 * rejected call never leaves a partial file behind.
 */
export function writeBridgeConfig(
  args: WriteBridgeConfigArgs
): WriteBridgeConfigResult {
  const {
    exePath,
    bottleName,
    appId,
    port,
    secret,
    interfaceVersions,
    shimPaths,
    fixLines
  } = args

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

  if (typeof secret !== 'string' || !BRIDGE_SECRET_PATTERN.test(secret)) {
    // Never echo the value -- length only.
    const launchSecretLen = typeof secret === 'string' ? secret.length : -1
    logWarning(
      `writeBridgeConfig: rejected invalid launch secret (len=${launchSecretLen}) for appId ${appId} -- not writing a config (WR-03)`,
      LogPrefix.Steam
    )
    return { status: 'error', error: 'Invalid bridge launch secret' }
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

  // Guard 5: every shimPath must resolve inside the bottle. Validated for ALL
  // paths before ANY write so one escape rejects the whole call.
  const targetDirs: string[] = [dirname(resolvedExePath)]
  for (const shimPath of shimPaths ?? []) {
    const resolvedShim = resolve(shimPath)
    if (!isContainedWithin(bottleDir, resolvedShim)) {
      logWarning(
        `writeBridgeConfig: rejected shimPath "${shimPath}" -- resolves outside bridge bottle "${sanitizedBottleName}" (T-51-02, quick 261023-ue0)`,
        LogPrefix.Steam
      )
      return {
        status: 'error',
        error: `Shim path is outside the bridge bottle: "${shimPath}"`
      }
    }
    const shimDir = dirname(resolvedShim)
    if (!targetDirs.includes(shimDir)) targetDirs.push(shimDir)
  }

  const lines = [`port=${port}`, `appid=${appId}`, `secret=${secret}`]
  if (interfaceVersions) {
    for (const [family, version] of Object.entries(interfaceVersions)) {
      lines.push(`iface.${family}=${version}`)
    }
  }
  for (const line of fixLines ?? []) {
    if (!line.startsWith('fix.') || /[\r\n]/.test(line)) {
      logWarning(
        `writeBridgeConfig: dropped malformed fix line ${JSON.stringify(line)} for appId ${appId}`,
        LogPrefix.Steam
      )
      continue
    }
    lines.push(line)
  }
  const content = lines.join('\n') + '\n'

  const configPaths: string[] = []
  for (const dir of targetDirs) {
    const configPath = join(dir, BRIDGE_CONFIG_FILENAME)
    const tmpPath = `${configPath}.tmp`
    try {
      writeFileSync(tmpPath, content, { encoding: 'utf-8', mode: 0o600 })
      // A stale pre-existing .tmp keeps its old mode through writeFileSync.
      chmodSync(tmpPath, 0o600)
      renameSync(tmpPath, configPath)
    } catch (error) {
      try {
        rmSync(tmpPath, { force: true })
      } catch {
        // best-effort cleanup only -- the real error below is what matters.
      }
      logError(
        [
          `writeBridgeConfig: failed to write config "${configPath}" for appId ${appId}`,
          error
        ],
        LogPrefix.Steam
      )
      return {
        status: 'error',
        error: `Failed to write bridge config: ${String(error)}`
      }
    }
    configPaths.push(configPath)
  }

  const [path, ...extraPaths] = configPaths
  return extraPaths.length > 0
    ? { status: 'written', path, extraPaths }
    : { status: 'written', path }
}
