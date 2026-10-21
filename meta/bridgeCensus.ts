// Phase 51 Plan 18 Task 1 -- RED stub. Deliberately wrong return values so
// the test file fails on real assertions (not a module-resolution crash).
// Replaced by the real implementation in the GREEN commit.

export interface CensusRow {
  appid: string
  name: string
  installdir: string
  arch: 'x86' | 'x64' | 'none'
  class:
    | 'bridge'
    | 'win64-no-shim'
    | 'missing-symbols'
    | 'unknown-version'
    | 'known-bad'
    | 'no-binary'
  detail: string
}

export function classifyCensusTitle(): CensusRow {
  return {
    appid: 'TODO',
    name: 'TODO',
    installdir: 'TODO',
    arch: 'none',
    class: 'no-binary',
    detail: 'not implemented yet'
  }
}

export function summarizeCensus(): {
  routed: number
  total: number
  byClass: Record<string, number>
} {
  return { routed: -1, total: -1, byClass: {} }
}
