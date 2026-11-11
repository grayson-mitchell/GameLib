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
 * ── One boot per case, on a fresh test context (D-08) ────────────────────
 *
 * `bootFresh()` is the only way a sidecar test boots. It resets the module
 * registry, requires bootstrap fresh and calls `bootSidecar()` exactly once
 * with a `createTestContext()` built for that case (a second boot in one
 * registry throws). The context's `appRoot` and `publicDir` come from the real
 * resolution because they are read-only repo directories that locales and
 * asset checks need; `userData` is NEVER taken from the real resolution, so
 * it stays under the fake HOME in `testContext.profile.root` and the context
 * is disposed after the test. Import this module after the suite's mock
 * doubles are declared, as before.
 */
import { PassThrough } from 'node:stream'

import {
  createTestContext,
  type TestContext
} from '../../../testUtils/testContext'
import type { ScriptStep } from '../../../testUtils/scriptedRunner'
import type { AppPaths } from '../../../process/context'
import type { BootServices } from '../../../services/types'
import type { ProcessGuards } from '../../processGuards'
import { createTestOnlineMonitor } from '../../../testUtils/testOnlineMonitor'

/** A single newline-delimited JSON frame read off the sidecar's output. */
export type Frame = Record<string, unknown>

// Not exported: used only within this module (`pnpm find-deadcode` / ts-prune
// flagged the previously-exported form as an over-broad `export` -- there is no
// external consumer, so the export served no purpose).
/** Buffers newline-delimited output from a PassThrough into parsed frames. */
function collectFrames(stream: PassThrough): Frame[] {
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

// Each case's context, disposed after the test (T-66-29).
const liveContexts: TestContext[] = []
afterEach(() => {
  for (const t of liveContexts.splice(0)) t.dispose()
})

export interface FreshSidecar {
  input: PassThrough
  output: PassThrough
  frames: Frame[]
  /** The fresh context this boot ran on (fake HOME, scripted runner, capture log). */
  testContext: TestContext
  /** The services this boot ran with (prebuilt ones by reference). */
  services: BootServices
}

/**
 * D-08: one boot per test case in a fresh module registry. Read mocks and
 * registries with require() after this call. Boots via
 * bootSidecar(createTestContext().ctx, ...).
 *
 * Order: jest.resetModules(), then `before` (configure mocks against the
 * fresh registry), then require bootstrap fresh and boot exactly once.
 */
export function bootFresh(opts?: {
  before?: () => void
  /** A guards instance the case already holds (to observe the sinks the boot binds). */
  guards?: ProcessGuards
  /** Inject the output stream (e.g. one that records the READY write). */
  output?: PassThrough
  /**
   * The caller already ran jest.resetModules() for this case and rebound its
   * own module handles against that registry (so it could configure mocks
   * BEFORE the boot). Skip the reset; the boot still happens exactly once.
   */
  reuseRegistry?: boolean
  /** Prebuilt services handed to the boot; every other service is built by its step. */
  services?: Partial<BootServices>
  /** Overrides for this case's createTestContext(); `userData` stays under the fake HOME. */
  context?: {
    script?: readonly ScriptStep[]
    platform?: NodeJS.Platform
    paths?: Partial<AppPaths>
  }
}): FreshSidecar {
  if (!opts?.reuseRegistry) jest.resetModules()
  opts?.before?.()
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { bootSidecar, resolveAppPaths } = require('../../bootstrap') as {
    bootSidecar: (
      ctx: TestContext['ctx'],
      input: PassThrough,
      output: PassThrough,
      guards: ProcessGuards,
      prebuilt?: Partial<BootServices>
    ) => BootServices
    resolveAppPaths: () => { appRoot: string; publicDir: string }
  }
  const real = resolveAppPaths()
  const testContext = createTestContext({
    ...opts?.context,
    paths: {
      appRoot: real.appRoot,
      publicDir: real.publicDir,
      ...opts?.context?.paths
    }
  })
  liveContexts.push(testContext)
  const input = new PassThrough()
  const output = opts?.output ?? new PassThrough()
  const frames = collectFrames(output)
  // A fresh, UNINSTALLED guards instance from this case's registry: boot only binds its sinks.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const guards =
    opts?.guards ??
    (
      require('../../processGuards') as typeof import('../../processGuards')
    ).createProcessGuards()
  /* eslint-enable @typescript-eslint/no-require-imports */
  const services = bootSidecar(
    testContext.ctx,
    input,
    output,
    guards,
    // A controllable monitor by default (online, start() a no-op): the boot never probes the
    // network. A case that needs the real monitor passes `onlineMonitor: undefined`.
    { onlineMonitor: createTestOnlineMonitor(), ...opts?.services }
  )
  return { input, output, frames, testContext, services }
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
