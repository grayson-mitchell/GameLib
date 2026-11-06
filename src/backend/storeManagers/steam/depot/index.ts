// Phase 21 depot-download orchestrator: public entry (62-10).
//
// depot.ts was folded into the sibling modules in this directory (planModel,
// plan, machO, download, downloadFiles, finalize, contentServers, outcome,
// sharedRedist). This barrel re-exports the exact name set the old depot.ts
// exposed, so external `from './depot'` importers resolve here unchanged.
// Sibling modules import each other directly and never import this file.

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
export type { DepotDownloadFailure } from './download'
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
export {
  PLAN_BUILD_MAX_ATTEMPTS,
  buildDepotPlan,
  screenDepotPlanForSteamApi,
  prescreenBridgeDepots
} from './plan'
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
