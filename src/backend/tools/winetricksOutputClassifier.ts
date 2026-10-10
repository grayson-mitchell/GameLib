import type { WinetricksLogLine } from 'common/types'

// Pure, dependency-free classifier for raw winetricks stdout/stderr
// (Phase 45 D-15). Imports nothing but a type -- no filesystem, no desktop
// shell, no logging -- so the Backend jest project can load it in isolation,
// and so the frontend never needs to re-parse a raw line: every line is given
// exactly one kind HERE, before it reaches the log file or the renderer.
//
// Measured facts of the pinned script (`20260125-next`) this relies on:
//  - it downloads with plain `curl -L -o ... -C - --fail --retry ...` (no `-s`,
//    no `-#`), so stderr carries curl's default meter: a `  % Total ...` header,
//    a `Dload  Upload ...` sub-header and `\r`-redrawn rows whose FIRST column
//    is the percentage;
//  - `w_warn` prints a dashed line, `warning: <message>`, a dashed line to
//    stderr, and `w_die` is `w_warn` then `exit 1` -- so a fatal message also
//    arrives as `warning:` and the EXIT CODE (not the text) decides failure;
//  - `w_try` failures say `Note: command ... returned status N. Aborting.`;
//  - the wine-version notice is `warning: Your version of wine <X> is no longer
//    supported upstream. You should upgrade to 8.x`.

const CURL_HEADER_RE = /^\s*%\s+Total\b/
const CURL_SUBHEADER_RE = /^\s*Dload\s+Upload\b/
// First column is the percent; the rest of the row is the meter's fixed
// columns (size, percent, size, rate, rate, rate...). Anchored and made of
// bounded classes so matching stays linear.
const CURL_ROW_RE = /^\s*(\d{1,3})\s+\S+\s+\d{1,3}\s+\S+\s+\d+\s+\d+\s+/
const WINE_CHANNEL_RE = /^([0-9a-f]{4,}:)?(fixme|err|warn|trace):/
const DASHED_RE = /^-{10,}$/
const ABORTING_RE = /Aborting\.?\s*$/
const RETURNED_STATUS_RE = /returned status \d+/
const WARNING_RE = /^warning:/
const DEPENDENCY_MISSING_RE = /^\S+ not installed! Winetricks might fail/
const UNSUPPORTED_WINE_RE =
  /Your version of wine (\S+) is no longer supported upstream/

// A process that never emits a newline must not grow our buffer without
// bound (T-45-17).
const MAX_REMAINDER_CHARS = 65536
// A single forwarded line is never allowed to be larger than this.
const MAX_LINE_CHARS = 2000

export function parseUnsupportedWineVersion(line: string): string | null {
  const match = UNSUPPORTED_WINE_RE.exec(line)
  return match ? match[1] : null
}

export function classifyWinetricksLine(line: string): WinetricksLogLine | null {
  const trimmed = line.trim()
  if (trimmed === '') {
    return null
  }
  const text =
    line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)}...` : line

  if (CURL_HEADER_RE.test(line) || CURL_SUBHEADER_RE.test(line)) {
    return { kind: 'progress', text }
  }
  const row = CURL_ROW_RE.exec(line)
  if (row) {
    const percent = Number(row[1])
    if (percent <= 100) {
      return { kind: 'progress', text, percent }
    }
  }

  if (WINE_CHANNEL_RE.test(trimmed) || DASHED_RE.test(trimmed)) {
    return { kind: 'noise', text }
  }

  // Before `environment`: a failed `w_try` arrives behind a `warning:` prefix
  // and must not be downgraded to a generic warning.
  if (ABORTING_RE.test(trimmed) || RETURNED_STATUS_RE.test(trimmed)) {
    return { kind: 'error', text }
  }

  if (
    UNSUPPORTED_WINE_RE.test(trimmed) ||
    DEPENDENCY_MISSING_RE.test(trimmed) ||
    WARNING_RE.test(trimmed)
  ) {
    return { kind: 'environment', text }
  }

  return { kind: 'info', text }
}

// Splits on \n AND \r: curl redraws its meter with a bare \r, so splitting on
// \n alone would hold the whole download as one unterminated "line".
export function splitOutputChunk(
  remainder: string,
  chunk: string
): { lines: string[]; remainder: string } {
  const pieces = (remainder + chunk).split(/\r\n|\n|\r/)
  let tail = pieces.pop() ?? ''
  const lines = pieces.filter((piece) => piece.trim() !== '')
  while (tail.length > MAX_REMAINDER_CHARS) {
    lines.push(tail.slice(0, MAX_REMAINDER_CHARS))
    tail = tail.slice(MAX_REMAINDER_CHARS)
  }
  return { lines, remainder: tail }
}
