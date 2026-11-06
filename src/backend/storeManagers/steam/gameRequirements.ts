import axios from 'axios'
import { GameInfo } from 'common/types'
import { logWarning, LogPrefix } from 'backend/logger'
import { getFileSize } from 'backend/utils'
import { isMac, isLinux } from 'backend/constants/environment'
import { STEAM_STORE_API } from './gameConstants'

/**
 * Maps the host OS to Steam's depot `oslist` vocabulary ('windows'|'macos'|
 * 'linux') — the SAME strings depot/select.ts's DepotSelectOpts.os matches
 * PICS depot config.oslist against. NOT the InstallPlatform vocabulary
 * library.ts's hostInstallPlatform() uses ('Windows'/'Mac'/'linux') — the two
 * must not be conflated.
 */
export function hostSteamDepotOs(): string {
  if (isMac) return 'macos'
  if (isLinux) return 'linux'
  return 'windows'
}
/**
 * Parse a storage size from the Steam store appdetails `pc_requirements.minimum`
 * HTML string (e.g. "<li><strong>Storage:</strong> 15 GB available space</li>").
 *
 * The raw HTML is never eval'd or rendered to the DOM — a bounded regex extracts
 * only the numeric size and unit (T-06-02 mitigation).
 *
 * Returns the byte count (Math.round) or undefined when no figure is found.
 */
export function parseSteamStorageRequirement(
  htmlText: string | undefined
): number | undefined {
  if (!htmlText || typeof htmlText !== 'string') return undefined
  // Matches: "15 GB available space", "512 MB available space", "1.5 TB available space"
  const match = htmlText.match(
    /(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB)\s+available\s+space/i
  )
  if (!match) return undefined
  const sizeText = match[1]
  const unitText = match[2]
  if (sizeText === undefined || unitText === undefined) return undefined
  const value = parseFloat(sizeText)
  const unit = unitText.toUpperCase()
  const multipliers: Record<string, number> = {
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4
  }
  return Math.round(value * (multipliers[unit] ?? 1))
}

interface MacOsVersion {
  major: number
  minor: number
}

/**
 * Named macOS release codenames → major.minor, used ONLY as a fallback when
 * the isolated OS segment has no digit-based version at all. Not observed as
 * necessary in the live-verified corpus (18-RESEARCH.md Pattern 1) — kept for
 * forward compatibility with future store copy that might drop numbers
 * entirely (e.g. "macOS Sequoia" with no digit).
 */
const MACOS_CODENAME_VERSION: Record<string, MacOsVersion> = {
  sequoia: { major: 15, minor: 0 },
  sonoma: { major: 14, minor: 0 },
  ventura: { major: 13, minor: 0 },
  monterey: { major: 12, minor: 0 },
  'big sur': { major: 11, minor: 0 },
  catalina: { major: 10, minor: 15 },
  mojave: { major: 10, minor: 14 },
  'high sierra': { major: 10, minor: 13 },
  sierra: { major: 10, minor: 12 },
  'el capitan': { major: 10, minor: 11 },
  yosemite: { major: 10, minor: 10 },
  mavericks: { major: 10, minor: 9 },
  'mountain lion': { major: 10, minor: 8 },
  lion: { major: 10, minor: 7 },
  'snow leopard': { major: 10, minor: 6 },
  leopard: { major: 10, minor: 5 }
}

function extractVersionTokens(text: string): MacOsVersion[] {
  // Matches "10.15", "10.9.3", "12.3" — deliberately requires a literal dot,
  // so bare numbers like "32" (from "32/64-bit") or "1" (from "1GB RAM")
  // never false-match (T-18-02-01/02: floor-only, never asserts '32').
  const matches = [...text.matchAll(/\b(\d{1,2})\.(\d{1,2})(?:\.\d{1,2})?\b/g)]
  return matches.map((m) => ({ major: Number(m[1]), minor: Number(m[2]) }))
}

/**
 * Parses the Steam appdetails `mac_requirements.minimum` HTML/text blob and
 * returns the LOWEST macOS version evidenced in it — i.e. the true minimum
 * requirement, even when the string lists multiple named releases as
 * alternatives ("Leopard 10.5.8, Snow Leopard 10.6.3, or higher" means
 * "10.5.8 or higher", not "10.6.3 or higher").
 *
 * Returns null when nothing extractable — callers MUST treat null as
 * 'unknown', mirroring parseSteamStorageRequirement's undefined-on-no-match
 * convention. The HTML is never eval'd or rendered (T-06-02/T-18-02-01).
 */
export function parseSteamMacMinOSVersion(
  htmlOrText: string | undefined
): MacOsVersion | null {
  if (!htmlOrText || typeof htmlOrText !== 'string') return null

  // Strip HTML tags FIRST so the "OS" label and its value are never split
  // across a tag boundary (the canonical shape wraps ONLY the label in
  // <strong>...</strong>, with the actual value sitting outside the tag —
  // isolating on '<' before stripping would truncate the label match to an
  // empty string). Handles all 5 observed shapes uniformly once tag-free:
  //  a) '<li><strong>OS:</strong> 10.9.3 (Mavericks)<br></li>'
  //  b) '<strong>OS: OSX 10.9.5 - 10.11.6</strong>' (label+value co-located)
  //  c) 'OS: Snow Leopard 10.6.8, ...<br />' (no <li>/<ul> wrapper)
  //  d) 'OS X version Leopard 10.5.8, Snow Leopard 10.6.3, 1GB RAM,...'
  //     (fully tagless — no delimiter after the OS clause at all)
  //  e) 'mac_requirements: []' — caller never invokes this fn (guarded by
  //     optional chaining at the call site: data?.mac_requirements?.minimum)
  const tagFree = htmlOrText.replace(/<[^>]*>/g, ' ')

  // \b requires a word boundary before "OS" so mid-word substrings (e.g.
  // "Chaos") never false-match; "X?" covers the "OS X" label variant.
  const labelMatch = tagFree.match(/\bOS(?:\s*X)?\s*:?\s*(.*)/i)
  if (!labelMatch) return null

  let segment = labelMatch[1] ?? ''
  // Bound the tagless/run-on case (d): stop at the next competing spec
  // keyword so a Processor/Memory figure never bleeds into the version
  // extraction.
  const stopIdx = segment.search(
    /\b(processor|cpu|memory|ram|graphics|gpu|storage|network|additional)\b/i
  )
  if (stopIdx > -1) segment = segment.slice(0, stopIdx)

  const versions = extractVersionTokens(segment)
  if (versions.length > 0) {
    return versions.reduce((min, v) =>
      v.major < min.major || (v.major === min.major && v.minor < min.minor)
        ? v
        : min
    )
  }

  const lowerSegment = segment.toLowerCase()
  for (const [name, version] of Object.entries(MACOS_CODENAME_VERSION)) {
    if (lowerSegment.includes(name)) return version
  }

  return null
}

/**
 * MAC32-01 (direction B): the pre-install arch signal, derived from the
 * SAME appdetails response `is_mac_native` already reads (no new network
 * call, no PICS/steam-user involvement — see games.ts fetchMetadataIfNeeded).
 *
 * NEVER returns '32' — a low min-OS proves nothing about bitness (A Hat in
 * Time: min-OS 10.11.6, genuinely 64-bit — 18-RESEARCH.md Pattern 1 corpus).
 * Catalina's 32-bit removal only proves a FLOOR: min-OS >= 10.15 implies the
 * binary MUST be 64-bit (Apple physically cannot run i386 on 10.15+), but
 * min-OS < 10.15 implies nothing either way. The return type has no '32'
 * member — Pitfall 3 / T-18-02-02 is enforced at the type level, not by
 * convention. Only the post-install Mach-O check (Plan 18-03) may assert '32'.
 */
export function macArchFromMinOS(
  minHtml: string | undefined
): '64' | 'unknown' {
  const v = parseSteamMacMinOSVersion(minHtml)
  if (!v) return 'unknown'
  const isCatalinaOrNewer = v.major > 10 || (v.major === 10 && v.minor >= 15)
  return isCatalinaOrNewer ? '64' : 'unknown'
}

/**
 * Returns a human-readable install size string for a Steam game.
 *
 * Fast path (no network): if the game is already installed, `install_size`
 * is already a `getFileSize`-formatted string (persisted that way by
 * library.ts) — return it directly, no parse.
 *
 * Pre-install estimate: call the public Steam store appdetails API, parse
 * the `pc_requirements.minimum` HTML for a storage figure, and return it via
 * getFileSize. Falls back to '?? MB' when no figure is obtainable (D-03).
 *
 * appId is guarded with /^\d+$/ before any network request (T-06-01).
 */
export async function getSteamInstallSize(
  appId: unknown,
  gameInfo?: GameInfo
): Promise<string> {
  // Fast path: already installed — install_size is already formatted, return
  // it directly (no parse, no network needed)
  if (gameInfo?.is_installed && gameInfo?.install?.install_size) {
    return gameInfo.install.install_size
  }

  // Guard: non-numeric appId rejected before constructing any URL (T-06-01).
  //
  // 34.13 review A-18 / WR-10: takes `unknown` and carries the `typeof` check
  // itself, so BOTH runtime registrations (`main.ts` and
  // `sidecar/steamAuthFlowRegistration.ts`) can drop their `args[0] as string`
  // cast at once — the pushdown shape WR-10 established for
  // `isSteamBottleEligible`. The regex ALONE was not a guard on an untrusted
  // payload: `RegExp.prototype.test` coerces its argument, so `123` and
  // `['570']` both passed `/^\d+$/.test(...)` and reached the URL builder as
  // a non-string. Hardening only one runtime would have created a real
  // Electron/Tauri behaviour divergence, which is why this belongs here.
  //
  // The rejected value is NO LONGER interpolated into the log line: it is
  // untrusted renderer input, and naming the field is enough to diagnose.
  if (typeof appId !== 'string' || !/^\d+$/.test(appId)) {
    logWarning(
      `getSteamInstallSize: rejected an appId that is not a numeric string (T-06-01)`,
      LogPrefix.Steam
    )
    return '?? MB'
  }

  // Pre-install estimate: parse storage requirement from store API
  try {
    const resp = await axios.get(`${STEAM_STORE_API}?appids=${appId}`)
    const data = resp.data?.[appId]?.data
    // Guard: pc_requirements may be [] for F2P/DLC/tool apps (Pitfall 5)
    const minHtml = data?.pc_requirements?.minimum
    const bytes = parseSteamStorageRequirement(minHtml)
    if (bytes && bytes > 0) return getFileSize(bytes)
  } catch (err) {
    logWarning(
      [`getSteamInstallSize: store API fetch failed for appId ${appId}:`, err],
      LogPrefix.Steam
    )
  }

  return '?? MB'
}
