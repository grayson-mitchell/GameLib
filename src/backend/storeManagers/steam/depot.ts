// Phase 21 (21-04): Depot-download orchestrator — front half.
//
// Given an appId, an authenticated steam-user CM connection, and a target
// directory + os filter, resolves every OWNED depot (Plan 01 select.ts),
// fetches + parses each depot's raw manifest, decrypts filenames (steam-user
// truncates them — Plan 01 crypto.ts does this correctly), and computes the
// REAL total byte count summed across every depot (D-03) — replacing the
// pc_requirements-derived estimate `getSteamInstallSize` used previously.
//
// This is the enqueue-time contract the DownloadManager needs before a single
// chunk is fetched. The streaming download loop is Plan 05; recovery/finalize
// (writeAppManifest) is Plan 06 — this module only builds the plan.

export {
  CHUNK_CONCURRENCY,
  CHUNK_FETCH_ATTEMPTS,
  formatEta,
  rollingRateMiBs,
  PathTraversalError,
  resolveContainedPath,
  sha1File,
  canWriteFullOwnership,
  shouldFinalizeAfterThrow,
  downloadFileChunks
} from './depot/download'
export type { DepotDownloadFailure } from './depot/download'
export { reduceContentServers } from './depot/contentServers'
export {
  selectPrimaryDepotFailure,
  formatDownloadFailureSummary,
  normalizeDepotPath,
  downloadSelectedDepotFiles,
  downloadSteamDepots
} from './depot/outcome'
export type {
  DownloadSelectedDepotFilesOpts,
  DownloadSelectedDepotFilesResult
} from './depot/outcome'
export { finalizeToSteam } from './depot/finalize'
export type { FinalizeToSteamOpts } from './depot/finalize'
export {
  healReconciledFileModes,
  downloadDepotFiles
} from './depot/downloadFiles'
export {
  PLAN_BUILD_MAX_ATTEMPTS,
  buildDepotPlan,
  screenDepotPlanForSteamApi,
  prescreenBridgeDepots
} from './depot/plan'
export {
  DIRECTORY_FLAG,
  SYMLINK_FLAG,
  FAILURE_LOG_CAP,
  describeDepotFailure,
  EXECUTABLE_FLAG,
  CUSTOM_EXECUTABLE_FLAG,
  READONLY_FLAG,
  HIDDEN_FLAG
} from './depot/planModel'
export type {
  DownloadSteamDepotsOpts,
  DepotPlanFile,
  DepotPlan,
  RawContentServer
} from './depot/planModel'
export { downloadSharedRedistDepots } from './depot/sharedRedist'
export type {
  SharedRedistDepot,
  DownloadSharedRedistOpts,
  SharedRedistDownloadResult
} from './depot/sharedRedist'
