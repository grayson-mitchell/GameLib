/**
 * Shared Node-sidecar test harness (WR-10, 34.2-REVIEW.md round 1).
 *
 * These five helpers were copy-pasted into 20 of the sidecar suites -- 49
 * copies, ~549 lines. Every copy was verified byte-identical modulo comments
 * (normalized-body sha1, self-checked against a known comment-only-different
 * pair) before being replaced by an import, so this consolidation is
 * mechanical rather than a judgement call.
 *
 * ── What is deliberately NOT here ────────────────────────────────────────
 *
 * `flush()` is NOT shared, and should not be. There are SEVEN syntactically
 * distinct implementations across 20 suites and about three semantically
 * distinct ones: N x `setImmediate` (N of 2, 3 or 6), 3 x `setTimeout(0)`,
 * and a real `setTimeout(25)`. `setImmediate` and `setTimeout(0)` run in
 * DIFFERENT event-loop phases (check vs timers) and are not interchangeable,
 * and normalizing the counts would change how far each suite lets the loop
 * settle. That surfaces as flake, not as a clean failure. Four further
 * suites define their own differently-named variants (`flushMicrotasks`,
 * `flushUntil`, `flushAsync`, `flushImmediate`) -- eleven flush-family
 * implementations in total. Keep yours local and tuned to your suite.
 *
 * The `jest.mock('os', ...)` block (28 suites) and `jest.mock('../pathShim')`
 * (8 suites) are NOT here because they CANNOT be. `jest.mock` is hoisted to
 * the top of the file it is written in, and its factory may not close over
 * outer bindings that are not `mock`-prefixed. Calling it from an imported
 * module registers too late to help. WR-10's original suggestion to hoist
 * "the `jest.mock('os', ...)` block" into a shared helper is not achievable
 * as written -- this is a language/runner constraint, not a preference.
 *
 * ── Import placement matters ─────────────────────────────────────────────
 *
 * `startSidecar` calls `init` from `../../bootstrap`, so importing THIS
 * module is what first requires bootstrap. Suites deliberately place
 * `import { init } from '../bootstrap'` AFTER their mock-double declarations
 * so module-scope setup runs first. Import this module at that same point,
 * not at the top of the file.
 */
import { PassThrough } from 'node:stream'

import { init } from '../../bootstrap'

/** A single newline-delimited JSON frame read off the sidecar's output. */
export type Frame = Record<string, unknown>

/** Buffers newline-delimited output from a PassThrough into parsed frames. */
export function collectFrames(stream: PassThrough): Frame[] {
  const frames: Frame[] = []
  let buffer = ''
  stream.on('data', (chunk: Buffer | string) => {
    buffer += chunk.toString()
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex)
      buffer = buffer.slice(newlineIndex + 1)
      if (line.trim().length > 0) {
        try {
          frames.push(JSON.parse(line))
        } catch {
          // Non-JSON diagnostic line (e.g. READY_SENTINEL) — ignore.
        }
      }
      newlineIndex = buffer.indexOf('\n')
    }
  })
  return frames
}

/** Boots a real sidecar over in-memory streams and collects its output. */
export function startSidecar(): { input: PassThrough; frames: Frame[] } {
  const input = new PassThrough()
  const output = new PassThrough()
  const frames = collectFrames(output)
  init(input, output)
  return { input, frames }
}

/** Writes an `invoke` request frame to the sidecar's input stream. */
export function writeInvoke(
  input: PassThrough,
  id: string,
  channel: string,
  args: unknown[]
): void {
  input.write(`${JSON.stringify({ id, kind: 'invoke', channel, args })}\n`)
}

/** Writes a fire-and-forget `send` frame to the sidecar's input stream. */
export function writeSend(
  input: PassThrough,
  id: string,
  channel: string,
  args: unknown[]
): void {
  input.write(`${JSON.stringify({ id, kind: 'send', channel, args })}\n`)
}

/** Finds the response frame matching a request id. */
export function findResponse(
  frames: Frame[],
  id: string
): { ok: boolean; result?: unknown; error?: string } | undefined {
  return frames.find((f) => f.id === id) as
    | { ok: boolean; result?: unknown; error?: string }
    | undefined
}
