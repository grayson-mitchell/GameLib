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
 * The `jest.mock('os', ...)` block (28 suites) is NOT here because it CANNOT be (the
 * `jest.mock('../pathShim')` block it used to sit beside is gone with the shim, 66.4-20). `jest.mock` is hoisted to
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
import type { IpcRegistry } from '../../ipcRegistry'
import { createRegistryViews } from './registryViews'
import { fsBackedSteamFiles } from '../../../storeManagers/steam/localFiles/__tests__/fixtures/stubRustSteamFiles'

// The registry of the most recent bootFresh() (the harness module is imported once per file and
// survives jest.resetModules(), so this binding is stable across a case's registry resets).
let bootedIpc: IpcRegistry | null = null
const bootedViews = createRegistryViews(() => bootedIpc)
/** Views over the most recently booted sidecar's handler registry. */
export const handlerRegistry = bootedViews.handlerRegistry
/** Views over the most recently booted sidecar's listener registry. */
export const listenerRegistry = bootedViews.listenerRegistry

/** A single newline-delimited JSON frame read off the sidecar's output. */
export type Frame = Record<string, unknown>

// Not exported: used only within this module (`pnpm find-deadcode` / ts-prune
// flagged the previously-exported form as an over-broad `export` -- there is no
// external consumer, so the export served no purpose).
/** Buffers newline-delimited output from a PassThrough into parsed frames. */
function collectFrames(
  stream: PassThrough,
  onFrame?: (frame: Frame) => void
): Frame[] {
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
          const frame = JSON.parse(line) as Frame
          frames.push(frame)
          onFrame?.(frame)
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

/** What the shell's `info` ops answer by default: nothing stored, every write accepted. */
const DEFAULT_RUST_ANSWERS: Record<string, (args: unknown[]) => unknown> = {
  info_recent_add: () => null,
  info_recent_remove: () => null,
  info_overrides_get: () => null,
  info_overrides_get_all: () => ({}),
  info_overrides_set: () => true,
  // The game object comes back unchanged when no override is stored for it.
  info_overrides_attach: (args) => (args[0] as { gameInfo: unknown }).gameInfo,
  // 86-13: the anti-cheat data is up to date, nothing is downloaded and no game has an entry.
  info_anticheat_status: () => ({ needed: false }),
  info_anticheat_download: () => ({ written: false }),
  info_anticheat_info: () => null,
  // 86-23: no umu id for any game, no wiki entry for any game, and the wiki cache clear answers null.
  info_umu_get: () => null,
  info_wiki_get: () => null,
  info_wiki_cache_clear: () => null
}

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
  /**
   * Answer the boot's `steamcm_configure` frame with success, as the shell does (default true).
   * Session-dependent steamcm ops wait for configure (C2/WR-04), so a case that does not answer it
   * would stall them. A case that drives configure itself passes false.
   */
  answerSteamCmConfigure?: boolean
  /**
   * Answers for `rustInvoke` frames by channel, layered over the defaults above (the `info_*` ops).
   * A case that checks what a shim sent and what it did with the answer supplies its own. An answer
   * that throws becomes a rejected frame.
   */
  rustAnswers?: Record<string, (args: unknown[]) => unknown>
  /** Prebuilt services handed to the boot; every other service is built by its step. */
  services?: Partial<BootServices>
  /** Overrides for this case's createTestContext(); `userData` stays under the fake HOME. */
  context?: {
    script?: readonly ScriptStep[]
    platform?: NodeJS.Platform
    paths?: Partial<AppPaths>
  }
}): FreshSidecar {
  bootedIpc = null
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
      // A prebuilt root owns the settings documents under its own userData (85-23): the paths
      // name the same folder, as a booted sidecar's do.
      ...(opts?.services?.storeRoot
        ? { userData: opts.services.storeRoot.userData }
        : {}),
      ...opts?.context?.paths
    }
  })
  liveContexts.push(testContext)
  const input = new PassThrough()
  const output = opts?.output ?? new PassThrough()
  // 75-30: the Steam local-file readers are Rust-only, so a booted sidecar's steamfiles_* rustInvoke
  // frames need an answer; a file-backed double over the case's fake HOME stands in for the shell.
  const steamFiles = fsBackedSteamFiles()
  const answerConfigure = opts?.answerSteamCmConfigure ?? true
  const rustAnswers = { ...DEFAULT_RUST_ANSWERS, ...opts?.rustAnswers }
  const frames = collectFrames(output, (frame) => {
    if (
      answerConfigure &&
      frame.kind === 'rustInvoke' &&
      frame.channel === 'steamcm_configure'
    ) {
      input.write(`${JSON.stringify({ id: frame.id, ok: true, result: {} })}\n`)
      return
    }
    // 86-09 and 86-11: the recent-games writes and the per-game overrides are Rust's now, and a
    // Steam launch or a game-info read awaits the shim, so the double answers them (the frames stay
    // in `frames` for a case to assert on). A case that needs the ops to behave passes `rustAnswers`.
    if (frame.kind === 'rustInvoke' && typeof frame.channel === 'string') {
      const answer = rustAnswers[frame.channel]
      if (answer) {
        // An answer that throws is the shell rejecting the frame (86-13: a case proves the listener
        // survives a rejected `info_anticheat_status`).
        let reply: Record<string, unknown>
        try {
          reply = {
            id: frame.id,
            ok: true,
            result: answer((frame.args as unknown[]) ?? [])
          }
        } catch (error) {
          reply = { id: frame.id, ok: false, error: String(error) }
        }
        input.write(`${JSON.stringify(reply)}\n`)
        return
      }
    }
    if (
      frame.kind !== 'rustInvoke' ||
      typeof frame.channel !== 'string' ||
      !frame.channel.startsWith('steamfiles_')
    ) {
      return
    }
    void steamFiles
      .requestRustInvoke(frame.channel, frame.args as unknown[])
      .then(
        (result) =>
          input.write(
            `${JSON.stringify({ id: frame.id, ok: true, result })}\n`
          ),
        (error: unknown) =>
          input.write(
            `${JSON.stringify({ id: frame.id, ok: false, error: String(error) })}\n`
          )
      )
  })
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
  bootedIpc = services.host.ipc
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

/**
 * Polls run in Rust (80-26), so any sidecar path that reads the poll registry (a kill, an install
 * state reconcile) sends a `steampoll_status` rustInvoke the host must answer. Answers each one not
 * yet answered with an empty registry; call after a flush and flush again.
 */
export function answerPollStatus(input: PassThrough, frames: Frame[]): void {
  for (const f of frames) {
    if (f.kind !== 'rustInvoke' || f.channel !== 'steampoll_status') continue
    if (answeredPollStatus.has(f.id as string)) continue
    answeredPollStatus.add(f.id as string)
    input.write(
      `${JSON.stringify({ id: f.id, ok: true, result: { installs: [], uninstalls: [] } })}\n`
    )
  }
}
const answeredPollStatus = new Set<string>()

/**
 * The Steam launch dispatch leads its single flight in Rust (88.3-18): `launch_flight_begin` before the launch and
 * `launch_flight_end` after it, both rustInvokes the host must answer. Answers each one not yet answered, `begin` as the
 * leader (`{ lead }`) and `end` as held (`true`); a `wait` is never sent, because no test here starts a second launch of
 * a key. Call after a flush and flush again, twice: the `end` is sent once the `begin` answer has let the launch run.
 */
export function answerLaunchFlights(input: PassThrough, frames: Frame[]): void {
  for (const f of frames) {
    if (f.kind !== 'rustInvoke') continue
    if (
      f.channel !== 'launch_flight_begin' &&
      f.channel !== 'launch_flight_end'
    ) {
      continue
    }
    if (answeredLaunchFlights.has(f.id as string)) continue
    answeredLaunchFlights.add(f.id as string)
    const result =
      f.channel === 'launch_flight_begin'
        ? { lead: `${answeredLaunchFlights.size}`.padStart(32, '0') }
        : true
    input.write(`${JSON.stringify({ id: f.id, ok: true, result })}\n`)
  }
}
const answeredLaunchFlights = new Set<string>()

/** Finds the response frame matching a request id. */
export function findResponse(
  frames: Frame[],
  id: string
): { ok: boolean; result?: unknown; error?: string } | undefined {
  return frames.find((f) => f.id === id) as
    | { ok: boolean; result?: unknown; error?: string }
    | undefined
}
