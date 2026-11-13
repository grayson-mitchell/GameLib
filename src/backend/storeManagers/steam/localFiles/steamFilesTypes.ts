/**
 * Types, consts and pure helpers; no work at import.
 *
 * Mirrors the result structs of the `gamelib-steamfiles` crate (serde camelCase; `Option` fields
 * serialise as null) and the args each rustInvoke channel takes. Args are strings, string arrays
 * or a typed mutation, never bytes (63 D-08).
 */
import type {
  RUST_STEAMFILES_FIND_ACF,
  RUST_STEAMFILES_PARSE_VALVE_MANIFEST,
  RUST_STEAMFILES_READ_ACF,
  RUST_STEAMFILES_READ_INSTALLSCRIPT,
  RUST_STEAMFILES_READ_LIBRARY_FOLDERS,
  RUST_STEAMFILES_READ_LOCALCONFIG_BETA_KEY,
  RUST_STEAMFILES_READ_RUNNING_APP_ID,
  RUST_STEAMFILES_SCAN_ACFS,
  RUST_STEAMFILES_SHORTCUTS_APPLY,
  RUST_STEAMFILES_SHORTCUTS_READ
} from 'common/types/sidecarTransport'

/** @public Equal to the crate's `OPS`, sorted; kept as the TS mirror of the Rust op list. */
export const STEAMFILES_OPS = [
  'steamfiles_discover_root',
  'steamfiles_find_acf',
  'steamfiles_parse_valve_manifest',
  'steamfiles_read_acf',
  'steamfiles_read_installscript',
  'steamfiles_read_library_folders',
  'steamfiles_read_localconfig_beta_key',
  'steamfiles_read_running_app_id',
  'steamfiles_scan_acfs',
  'steamfiles_shortcuts_apply',
  'steamfiles_shortcuts_read',
  'steamfiles_shortcuts_roundtrip'
] as const

/** @public Ops the sidecar bridge does not expose (CLI only); mirror of the crate op list. */
export const CLI_ONLY_STEAMFILES_OPS = [
  'steamfiles_discover_root',
  'steamfiles_shortcuts_roundtrip'
] as const

interface AcfDepot {
  depotId: string
  manifest: string
  size: string
  dlcAppId: string | null
}

export interface AcfRecord {
  appid: string | null
  name: string | null
  installdir: string | null
  stateFlags: number | null
  stateFlagsRaw: string | null
  sizeOnDisk: string | null
  buildid: string | null
  lastOwner: string | null
  bytesDownloaded: string | null
  bytesToDownload: string | null
  bytesStaged: string | null
  bytesToStage: string | null
  targetBuildId: string | null
  scheduledAutoUpdate: string | null
  betaKey: string | null
  installedDepots: AcfDepot[]
}

export interface AcfReadResult {
  exists: boolean
  parsed: boolean
  readError: string | null
  record: AcfRecord | null
}

export interface ScannedAcf {
  steamappsDir: string
  fileName: string
  record: AcfRecord
}

interface SkippedAcf {
  steamappsDir: string
  fileName: string
  reason: string
}

export interface ScanResult {
  records: ScannedAcf[]
  skipped: SkippedAcf[]
  missingDirs: string[]
}

interface FindAcfResult {
  found: boolean
  steamappsDir: string | null
  record: AcfRecord | null
}

export interface LibraryFoldersResult {
  exists: boolean
  parsed: boolean
  readError: string | null
  paths: string[]
}

interface RunningAppIdResult {
  runningAppId: number
}

interface LocalConfigBetaKeyResult {
  betaKey: string | null
}

interface ValvePackage {
  manifestVersion: string
  file: string
  sha2: string
  size: number
}

export interface ValveManifestResult {
  ok: boolean
  reason: string | null
  pkg: ValvePackage | null
}

interface InstallScriptProcess {
  process: string
  command: string | null
}

interface InstallScriptEntry {
  name: string
  hasRunKey: string | null
  minimumHasRunValue: number
  processes: InstallScriptProcess[]
  requirementOs: { is64BitWindows: string | null; osType: string | null } | null
}

interface InstallScriptResult {
  exists: boolean
  entries: InstallScriptEntry[] | null
}

interface ShortcutEntrySummary {
  indexKey: string
  appName: string | null
  exe: string | null
  launchOptions: string | null
  hasAppName: boolean
  hasExe: boolean
  hasLaunchOptions: boolean
}

export interface ShortcutsReadResult {
  exists: boolean
  parsed: boolean
  readError: string | null
  hasShortcutsRoot: boolean
  rootIsList: boolean
  entries: ShortcutEntrySummary[]
}

export interface ShortcutsApplyResult {
  written: boolean
  readError: string | null
  alreadyPresent: boolean
  matched: boolean
  indexKey: string | null
  removedExe: string | null
  removedAppName: string | null
}

export type EntryField =
  | { kind: 'string'; key: string; value: string }
  | { kind: 'int32'; key: string; value: number }

type ShortcutsMutation =
  | { op: 'add'; entry: EntryField[]; createIfMissing: boolean }
  | { op: 'update'; appName: string; fields: EntryField[] }
  | { op: 'remove'; appName: string }

interface PathArgs {
  path: string
}

interface SteamFilesShapes {
  [RUST_STEAMFILES_FIND_ACF]: {
    args: { steamappsDirs: string[]; appId: string }
    result: FindAcfResult
  }
  [RUST_STEAMFILES_PARSE_VALVE_MANIFEST]: {
    args: PathArgs
    result: ValveManifestResult
  }
  [RUST_STEAMFILES_READ_ACF]: { args: PathArgs; result: AcfReadResult }
  [RUST_STEAMFILES_READ_INSTALLSCRIPT]: {
    args: PathArgs
    result: InstallScriptResult
  }
  [RUST_STEAMFILES_READ_LIBRARY_FOLDERS]: {
    args: PathArgs
    result: LibraryFoldersResult
  }
  [RUST_STEAMFILES_READ_LOCALCONFIG_BETA_KEY]: {
    args: { path: string; appId: string }
    result: LocalConfigBetaKeyResult
  }
  [RUST_STEAMFILES_READ_RUNNING_APP_ID]: {
    args: PathArgs
    result: RunningAppIdResult
  }
  [RUST_STEAMFILES_SCAN_ACFS]: {
    args: { steamappsDirs: string[] }
    result: ScanResult
  }
  [RUST_STEAMFILES_SHORTCUTS_APPLY]: {
    args: { path: string; mutation: ShortcutsMutation }
    result: ShortcutsApplyResult
  }
  [RUST_STEAMFILES_SHORTCUTS_READ]: {
    args: PathArgs
    result: ShortcutsReadResult
  }
}

export type SteamFilesArgsFor<C extends keyof SteamFilesShapes> =
  SteamFilesShapes[C]['args']
export type SteamFilesResultFor<C extends keyof SteamFilesShapes> =
  SteamFilesShapes[C]['result']
