import type { WinetricksLogLine } from 'common/types'

// Pure bounded line buffer shared by the backend (the per-flush pending delta
// and a queue run's log) and the renderer (folding live `progressOfWinetricks`
// deltas into the log it shows), so both sides agree on what "a progress line
// replaces the previous one" means. Type-only import: loadable by every jest
// project and by both bundles.
const MAX_BUFFERED_LINES = 200

// Appends `line` to a bounded line buffer (the per-flush pending delta and a
// queue run's log both use it). A progress line REPLACES the previous progress
// line when nothing but wine noise has been appended since -- curl redraws one
// meter, it does not write a new log entry per redraw -- and keeps the last
// known percent when the replacing line (a header) carries none. The oldest
// entry is dropped once the buffer exceeds `cap`.
export function appendLogLine(
  buffer: WinetricksLogLine[],
  line: WinetricksLogLine,
  cap = MAX_BUFFERED_LINES
): void {
  if (line.kind === 'progress') {
    for (let i = buffer.length - 1; i >= 0; i--) {
      const candidate = buffer[i]
      if (candidate.kind === 'progress') {
        const percent = line.percent ?? candidate.percent
        buffer[i] =
          percent === undefined
            ? line
            : { kind: 'progress', text: line.text, percent }
        return
      }
      if (candidate.kind !== 'noise') {
        break
      }
    }
  }
  buffer.push(line)
  while (buffer.length > cap) {
    buffer.shift()
  }
}
