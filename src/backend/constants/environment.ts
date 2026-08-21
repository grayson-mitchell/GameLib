import { env } from 'process'
import { cpus } from 'os'
import { readFileSync } from 'graceful-fs'

interface Manifest {
  'runtime-version': string
}

function readFlatpakRuntimeVersion() {
  try {
    const manifestContent = readFileSync('/app/manifest.json', 'utf8')
    const manifest = JSON.parse(manifestContent) as Manifest
    return manifest['runtime-version']
  } catch (error) {
    console.log(
      `Unable to read runtime version from flatpak manifest file. ${error}`
    )
  }

  return 'unknown'
}

export const isMac = process.platform === 'darwin'
// quick-260821-le0 (Rule 1 auto-fix): guard against `cpus()` returning `[]`
// (observed directly by this task's own host-gate test suite, which
// exercises `cpus()`'s edge cases immediately below) — `cpus()[0]` was
// previously dereferenced unconditionally and crashed module load on any
// host reporting zero CPUs. `?? ''` preserves identical behavior for every
// normal host: `.includes('Intel')` on an empty string is just `false`.
export const isIntelMac = isMac && (cpus()[0]?.model ?? '').includes('Intel') // so we can have different behavior for Intel Mac
// quick-260821-le0: POSITIVE Apple Silicon host probe — deliberately NOT
// `!isIntelMac`. A demoted 32-bit Steam title's native install is only ever
// auto-removed (games.ts's removeDemotedNativeOrphan) when this host is
// POSITIVELY confirmed Apple Silicon, never merely "not detected as Intel".
// `process.arch === 'arm64'` covers a native arm64 process; Rosetta reports
// `process.arch === 'x64'` with a `VirtualApple @ ...` CPU model, so a
// case-insensitive `apple|virtualapple` match on `cpus()[0]?.model` also
// counts. An unknown/empty model string or `cpus()` returning `[]` (the
// optional chaining + `?? ''` fallback) yields `false`, not `true` — fails
// closed by construction, matching `isIntelMac`'s own "so we can have
// different behavior" intent but for the opposite, destructive-action gate.
export const isAppleSiliconMac =
  isMac &&
  (process.arch === 'arm64' ||
    /apple|virtualapple/i.test(cpus()[0]?.model ?? ''))
export const isWindows = process.platform === 'win32'
export const isLinux = process.platform === 'linux'
export const isSteamDeckGameMode =
  process.env.XDG_CURRENT_DESKTOP === 'gamescope'
const isSteamDeckDesktopMode =
  env.SESSION_MANAGER?.includes('unix/steamdeck') &&
  env.HOME === '/home/deck' &&
  env.DESKTOP_SESSION?.includes('steamos')
export const isSteamDeck = isSteamDeckGameMode || isSteamDeckDesktopMode
export const isCLIFullscreen = process.argv.includes('--fullscreen')
export const isCLINoGui = process.argv.includes('--no-gui')
export const isCLIConsoleMode = process.argv.includes('--console')
export const isFlatpak = Boolean(env.FLATPAK_ID)
export const isSnap = Boolean(env.SNAP)
export const isAppImage = Boolean(env.APPIMAGE)
export const flatpakRuntimeVersion = isFlatpak
  ? readFlatpakRuntimeVersion()
  : ''
export const autoUpdateSupported = isWindows || isMac || isAppImage
