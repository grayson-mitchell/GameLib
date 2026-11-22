/**
 * Typing-only declarations for the channels the Rust native router owns (Phase 83, D-01), the
 * ones listed in `nativeChannels.json`. There is no zod here: the Rust serde args type is the
 * schema authority for a native channel (D-07), and the manifest's valid/invalid vectors pin it.
 *
 * The keys below must equal the manifest's channels by kind (`ipcDomainCensus` test (e)): invoke
 * channels in `NativeAsync`, send channels in `NativeSync`.
 */
import type { UploadedLogData } from '../../types'
import type { GetLogFileArgs } from './logger'
import type { MetadataOverride } from './gameDetails'

/**
 * The renderer's log text: a string, an array of strings, or an Error-like object. A real `Error`
 * JSON-serialises to `{}` (its fields are non-enumerable), which the object arm accepts. The Rust
 * `RendererMessage` (gamelib-log) is the authority; it is strict: any other key or a non-string
 * value is rejected.
 */
type LogMessage =
  | string
  | string[]
  | { name?: string; message?: string; stack?: string }

export interface NativeAsync {
  getHeroicVersion: () => string
  getLogContent: (args: GetLogFileArgs) => string
  uploadLogFile: (
    name: string,
    args: GetLogFileArgs
  ) => Promise<false | [string, UploadedLogData]>
  getUploadedLogFiles: () => Promise<Record<string, UploadedLogData>>
  deleteUploadedLogFile: (url: string) => Promise<boolean>
  // Phase 85 (85-16): the renderer's lazy store fetch, answered from the Rust StoreHost. `rev` is
  // the store's change count when Rust read it, absent when the sidecar answered.
  'sidecar:store-fetch': (
    storeName: string
  ) => Promise<{ values: Record<string, unknown>; rev?: number }>
  // Phase 85 (85-17): the renderer's confirmed store write, applied by Rust; `true` only once on
  // disk, `false` for any refusal.
  'sidecar:store-set-checked': (
    storeName: string,
    keyPath: string,
    value: unknown
  ) => Promise<boolean>
  // Phase 86 (86-08, D-17): the renderer's Remove-from-recent, run by the Rust `info` slice
  // (`gamelib-info`'s `info_recent_remove`). The appName is 1 to 1024 UTF-16 units.
  removeRecent: (appName: string) => Promise<void>
  // Phase 86 (86-10, D-17): every stored per-game metadata override, read by the Rust `info` slice
  // from the StoreHost (`gamelib-info`'s `info_overrides_get_all`).
  getAllGameOverrides: () => Promise<Record<string, MetadataOverride>>
}

export interface NativeSync {
  logError: (message: LogMessage) => void
  logInfo: (message: LogMessage) => void
  showLogFileInFolder: (args: GetLogFileArgs) => void
  openExternalUrl: (url: string) => void
  // Phase 85 (85-17): the renderer's store write, checked and applied by Rust through the StoreHost.
  storeSet: (storeName: string, keyPath: string, value: unknown) => void
  storeDelete: (storeName: string, keyPath: string) => void
  // The options are never used (T-27-03): a recognised cache store opens from the store table's row.
  storeNew: (storeName: string, options?: Record<string, unknown>) => void
}
