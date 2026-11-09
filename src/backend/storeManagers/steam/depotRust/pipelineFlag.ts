// D-16: one env flag picks the whole depot pipeline per job. Dev/advanced only: env-only like
// the GAMELIB_SCANNER_* precedent, no AppSettings and no UI. Read once at the entry of each
// public depot function, so a job never mixes TS and Rust stages.
//
// Default flipped to 'rust' on 2026-11-09 (plan 73-17) after the corpus parity run in
// .planning/phases/73-steam-depot-download-pipeline-in-rust/73-PARITY.md was approved by the
// operator. GAMELIB_DEPOT_PIPELINE=ts still selects the TS fallback.

import { logWarning, LogPrefix } from 'backend/logger'

export type DepotPipeline = 'rust' | 'ts'

export const DEPOT_PIPELINE_DEFAULT: 'rust' | 'ts' = 'rust'

let warnedBadValue = false

export function depotPipeline(): DepotPipeline {
  const raw = process.env.GAMELIB_DEPOT_PIPELINE
  if (raw === undefined || raw === '') return DEPOT_PIPELINE_DEFAULT
  if (raw === 'rust' || raw === 'ts') return raw
  if (!warnedBadValue) {
    warnedBadValue = true
    logWarning(
      `GAMELIB_DEPOT_PIPELINE has an unknown value, using "${DEPOT_PIPELINE_DEFAULT}"`,
      LogPrefix.Steam
    )
  }
  return DEPOT_PIPELINE_DEFAULT
}
