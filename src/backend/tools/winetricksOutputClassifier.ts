import type { WinetricksLogLine } from 'common/types'

// RED-phase stub: type-correct and deliberately inert, so the failing tests
// fail on assertions about the planned behaviour (not on a missing module).
// Replaced by the real classifier in the GREEN commit.
export function classifyWinetricksLine(line: string): WinetricksLogLine | null {
  void line
  return null
}

export function splitOutputChunk(
  remainder: string,
  chunk: string
): { lines: string[]; remainder: string } {
  return { lines: [], remainder: remainder + chunk }
}

export function parseUnsupportedWineVersion(line: string): string | null {
  void line
  return null
}
