// Phase 21 depot-download orchestrator: public entry (62-10).
//
// This barrel is what external `from './depot'` importers resolve. Sibling modules import each
// other directly and never import this file. Since 73-19 every download runs in Rust; the TS
// pipeline modules still re-exported below (download, downloadFiles, finalize) go in 73-20.

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
} from './download'
export { reduceContentServers } from './contentServers'
export {
  selectPrimaryDepotFailure,
  formatDownloadFailureSummary,
  normalizeDepotPath,
  downloadSelectedDepotFiles,
  downloadSteamDepots
} from './outcome'
export type {
  DownloadSelectedDepotFilesOpts,
  DownloadSelectedDepotFilesResult
} from './outcome'
export { finalizeToSteam } from './finalize'
export type { FinalizeToSteamOpts } from './finalize'
export { healReconciledFileModes, downloadDepotFiles } from './downloadFiles'
export { PLAN_BUILD_MAX_ATTEMPTS, prescreenBridgeDepots } from './plan'
export {
  DIRECTORY_FLAG,
  SYMLINK_FLAG,
  FAILURE_LOG_CAP,
  describeDepotFailure,
  EXECUTABLE_FLAG,
  CUSTOM_EXECUTABLE_FLAG,
  READONLY_FLAG,
  HIDDEN_FLAG
} from './planModel'
export type {
  DepotDownloadFailure,
  DownloadSteamDepotsOpts,
  DepotPlanFile,
  DepotPlan,
  RawContentServer
} from './planModel'
export { downloadSharedRedistDepots } from './sharedRedist'
export type {
  SharedRedistDepot,
  DownloadSharedRedistOpts,
  SharedRedistDownloadResult
} from './sharedRedist'
