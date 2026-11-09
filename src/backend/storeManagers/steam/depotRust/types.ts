// TS mirror of the Rust depot job wire contract (src-tauri/crates/gamelib-depot: job.rs,
// outcome.rs). camelCase, 64-bit ids as strings. Types only plus one const tuple; no side
// effects. depotRustErrorMap.test.ts pins RUST_DEPOT_ERROR_KINDS to outcome.rs ERROR_KINDS.

export type RustJobMode = 'install' | 'verify_only' | 'select_files'

export interface RustDepotRef {
  depotId: string
  manifestId: string
  requestCode: string | null
  /** 64 hex chars (AES-256 depot key). Never logged. */
  key: string
  ownerAppId: string
  /** D-05: must be null/absent in phase 73. */
  fromManifest?: string | null
}

export interface RustHostRef {
  host: string
  vhost: string | null
  kind: string | null
  httpsSupport: string | null
  useTokenAuth: boolean
  weightedLoad: number | null
}

export interface RustFinalizeSpec {
  steamappsDir: string
  installdir: string
  name: string
  buildid: string | null
  lastOwner: string | null
  allowFullOwnership: boolean
}

export interface RustJobLimits {
  fileConcurrency: number
  inflightChunks: number
  decodeThreads: number
}

export interface RustDepotJob {
  jobId: string
  mode: RustJobMode
  appId: string
  installRoot: string
  depots: RustDepotRef[]
  hosts: RustHostRef[]
  selectPaths: string[] | null
  finalize: RustFinalizeSpec | null
  limits: RustJobLimits | null
}

export interface RustPlannedDepot {
  depotId: string
  gid: string
  size: number
}

export interface RustHostStat {
  host: string
  bytes: number
  chunks: number
  failures: number
}

/** `JobEvent` = `{ jobId, seq }` + the flattened `kind`-tagged body. */
export type RustJobEvent = { jobId: string; seq: number } & (
  | {
      kind: 'planned'
      totalBytes: number
      totalFiles: number
      depots: RustPlannedDepot[]
    }
  | {
      kind: 'progress'
      doneBytes: number
      netBytes: number
      totalBytes: number
      filesDone: number
      filesTotal: number
      host: string | null
      elapsedMs: number
    }
  | { kind: 'warning'; message: string; count: number }
  | { kind: 'hostSummary'; hosts: RustHostStat[] }
)

/** Sorted; identical to outcome.rs `ERROR_KINDS`. */
export const RUST_DEPOT_ERROR_KINDS = [
  'cdn_http',
  'decode_failed',
  'delta_unsupported',
  'disk_full',
  'io',
  'manifest_decode',
  'manifest_unavailable',
  'network',
  'no_content_servers',
  'not_signed_in',
  'path_collision',
  'path_traversal',
  'sha1_mismatch',
  'size_mismatch',
  'stall',
  'symlink_failed'
] as const

export type RustErrorKind = (typeof RUST_DEPOT_ERROR_KINDS)[number]

export interface RustFailure {
  file: string | null
  kind: RustErrorKind
  /** Never a token, key or full URL query. */
  message: string
  code: string | null
  eresult: number | null
  httpStatus: number | null
  scope: 'run' | null
  msSinceProgress: number | null
}

export interface RustOutcome {
  jobId: string
  status: 'completed' | 'cancelled' | 'error'
  failures: RustFailure[]
  allFilesVerified: boolean
  allModesApplied: boolean
  attemptedDepots: RustPlannedDepot[]
  acf: { stateFlags: string; sizeOnDisk: string } | null
  missing: string[] | null
  files: { filename: string; size: number; sha1: string }[] | null
  stats: {
    bytesFetched: number
    chunksFetched: number
    containers: { vz: number; vsza: number; pk: number }
    machoExecApplied: number
    pathCollisions: number
    elapsedMs: number
  }
}
