// Phase 21 depot-download orchestrator: public entry (62-10).
//
// This barrel is what external `from './depot'` importers resolve. Sibling modules import each
// other directly and never import this file. Every download runs in Rust (73-19); the TS
// pipeline modules were deleted in 73-20, leaving the CM-side and policy modules below.

export { reduceContentServers } from './contentServers'
export {
  selectPrimaryDepotFailure,
  formatDownloadFailureSummary,
  normalizeDepotPath,
  downloadSelectedDepotFiles,
  downloadSteamDepots
} from './outcome'
export { PLAN_BUILD_MAX_ATTEMPTS, prescreenBridgeDepots } from './plan'
export { describeDepotFailure } from './planModel'
export type { DepotDownloadFailure, RawContentServer } from './planModel'
export { downloadSharedRedistDepots } from './sharedRedist'
export type {
  SharedRedistDepot,
  SharedRedistDownloadResult
} from './sharedRedist'
