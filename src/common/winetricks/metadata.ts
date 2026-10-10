// Phase 45, plan 04. Pure, dependency-free w_metadata parser and
// w_download_manual-derived needs-GUI set (D-19, D-17). No React, no
// electron, no fs, no logger, no child_process -- the backend (45-06) is
// the only caller that reads the script file from disk; this module only
// ever receives the script text as a string.

export type WinetricksVerbMetadata = {
  verb: string
  category: string
  title?: string
  publisher?: string
  year?: string
  media?: string
  conflicts?: string[]
  homepage?: string
}

// RED stub (45-04 Task 1) -- deliberately inert so the target test fails on
// an assertion, not a missing-module load crash. Replaced in the GREEN
// commit.
export function parseWinetricksMetadata(
  _scriptText: string
): Map<string, WinetricksVerbMetadata> {
  return new Map()
}

export function deriveNeedsGuiVerbs(_scriptText: string): ReadonlySet<string> {
  return new Set()
}
