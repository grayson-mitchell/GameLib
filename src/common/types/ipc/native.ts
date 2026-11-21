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
}

export interface NativeSync {
  logError: (message: LogMessage) => void
  logInfo: (message: LogMessage) => void
  showLogFileInFolder: (args: GetLogFileArgs) => void
  openExternalUrl: (url: string) => void
}
