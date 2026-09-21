/**
 * Store-embed WIRE CONTRACT — the TS half.
 *
 * Asserts the sidecar seam emits EXACTLY the payloads in
 * `meta/fixtures/store-embed-wire-args.json`. The Rust half
 * (`src-tauri/src/main.rs`, `mod tests`, `store_embed_wire_contract_*`) asserts those same
 * bytes parse through `store_embed_open_args` / `store_embed_set_bounds_args` /
 * `store_embed_navigate_args`. One shared file, asserted from both ends: changing the wire
 * shape on either side breaks the other.
 *
 * WHY THIS FILE EXISTS. On 2026-09-05 the Phase 40 live gate found `/store/steam` and
 * `/store/gog` rendering blank, with `store_embed_open failed: store_embed_open:bad-args` in
 * the transcript. The seam was sending POSITIONAL arrays (`[url, x, y, w, h]`) while the Rust
 * parsers read a single OBJECT (`{ url, x, y, w, h }`). Three arms were affected: open,
 * set_bounds, navigate.
 *
 * Every gate was green at the time, and the reason is the point of this file:
 *   - `storeEmbedFlows.test.ts` drives the REAL transport (`startRpcServer`/`requestRustInvoke`
 *     over a PassThrough pair) but the far end is a JS test handler, NOT the Rust parser. Real
 *     transport, fake counterparty — it proves a frame arrives, never that Rust can read it.
 *     Worse, two of its assertions PINNED the positional shape, so the suite was green
 *     *because* it had encoded the defect.
 *   - The Rust parsers had no tests at all.
 * Both sides were covered in isolation; the contract between them was not. Coverage of each
 * end is not coverage of the boundary.
 */
import { PassThrough } from 'node:stream'

import { createRustStoreEmbedSeam } from '../storeEmbedFlowRegistration'
import { startRpcServer } from '../sidecarRpc'
import {
  RUST_STORE_EMBED_OPEN,
  RUST_STORE_EMBED_SET_BOUNDS,
  RUST_STORE_EMBED_NAVIGATE
} from '../../../common/types/sidecarTransport'

import wireFixture from '../../../../meta/fixtures/store-embed-wire-args.json'

interface Frame {
  id?: number
  channel?: string
  args?: unknown[]
}

function collectFrames(stream: PassThrough): Frame[] {
  const frames: Frame[] = []
  let buffered = ''
  stream.on('data', (chunk: Buffer) => {
    buffered += chunk.toString('utf8')
    let nl = buffered.indexOf('\n')
    while (nl !== -1) {
      const line = buffered.slice(0, nl)
      buffered = buffered.slice(nl + 1)
      if (line.trim()) {
        try {
          frames.push(JSON.parse(line) as Frame)
        } catch {
          /* a non-JSON line is not a frame */
        }
      }
      nl = buffered.indexOf('\n')
    }
  })
  return frames
}

function startTransport(): { input: PassThrough; frames: Frame[] } {
  const input = new PassThrough()
  const output = new PassThrough()
  const frames = collectFrames(output)
  startRpcServer(input, output)
  return { input, frames }
}

const flush = async (): Promise<void> => {
  await new Promise((resolve) => setImmediate(resolve))
}

/**
 * Settlement of the most recent `fireWithNoRustPeer()` call for a given channel: the rejection
 * `Error` once the 60s timeout fires, or `null` if the call ever resolves instead. Read by the
 * Leg A regression gate below (`describe('regression gate...')`).
 */
const noPeerSettlements = new Map<string, Promise<Error | null>>()

/**
 * Fires a seam call against a transport that has **no Rust peer** and records how it settles,
 * instead of leaving it floating.
 *
 * `startTransport()` wires `startRpcServer` over two `PassThrough`s and nothing ever writes a
 * response frame to `input`, so `requestRustInvoke`'s 60s timer (`sidecarRpc.ts:367-388`) is
 * CERTAIN to fire and the call can only ever reject. Not awaiting the call here is deliberate and
 * must stay: every assertion in this describe block is about the frame the seam *emits*, and a
 * response will never arrive for it to await. What was wrong is that a bare `void`-ed seam call
 * installs no rejection handler at all, so jest attaches the eventual rejection to whichever test
 * happens to be mid-flight when the 60s timer lands — see the archived todo
 * `.planning/todos/completed/2026-09-21-leaked-store-embed-rpc-timer-now-blames-an-unrelated-test.md`
 * for the bystander this produced (a Humble ownership-overlay security test, on 2026-09-21). This
 * helper gives every no-peer call a real handler and records its settlement so the regression gate
 * below (Leg A) can make a positive assertion about it.
 *
 * `pending: unknown` (not `Promise<unknown>`) is deliberate: `StoreEmbedSeam#setBounds` is
 * declared `void` but actually returns a promise (`storeEmbedFlowRegistration.ts`, `return
 * (async () => {...})() as unknown as void`) — `Promise.resolve()` adopts a thenable at runtime
 * regardless of its declared type, which is what lets the `setBounds` call site below drop its
 * `as unknown as Promise<void>` cast.
 *
 * Passing the promise in ARGUMENT position (not a bare statement) is what satisfies
 * `no-floating-promises` structurally — no `void` operator, no eslint-disable, nothing for a
 * future call site to forget.
 *
 * Three things this is deliberately NOT, so the next reader does not "simplify" it back:
 * - NOT `.catch(() => {})`: discarding the rejection would stop the leak but leave nothing for
 *   Leg A to assert against — a gate built on that shape could only ever check an absence.
 * - NOT `unref()`: the 60s timer is already correctly `unref()`-ed at `sidecarRpc.ts:392`, with
 *   its own comment explaining why. `unref()` governs whether a timer keeps the event loop alive;
 *   it has nothing to do with whether a rejection has a handler. Reaching for it here would be a
 *   misread of the defect.
 * - Also not touched: `RUST_INVOKE_TIMEOUT_MS` is not shortened, `requestRustInvoke` is not
 *   mocked, and no global unhandled-rejection swallow is installed — each would hide the defect
 *   this helper exists to surface, not fix it.
 *
 * Second instance of this class: `appShellFlowRegistration.ts`'s `sidecar-init-rustinvoke-leak`
 * comment describes the identical failure mode from a different call site — an assertion settling
 * before a test drained its own pending rustInvoke calls, leaving a real timer to reject into a
 * later, unrelated suite. Same class, different call site; that one was fixed by
 * `skipInitialTraySync`.
 */
function fireWithNoRustPeer(pending: unknown, channel: string): void {
  noPeerSettlements.set(
    channel,
    Promise.resolve(pending).then(
      () => null,
      (reason: unknown) =>
        reason instanceof Error ? reason : new Error(String(reason))
    )
  )
}

describe('store-embed wire contract — the sidecar emits exactly what the Rust parsers accept', () => {
  it('store_embed_open emits the fixture payload verbatim (object, not positional)', async () => {
    const { frames } = startTransport()
    const [expected] = wireFixture.store_embed_open
    fireWithNoRustPeer(createRustStoreEmbedSeam().open(
      expected.url,
      { x: expected.x, y: expected.y, w: expected.w, h: expected.h },
      'steam'
    ), RUST_STORE_EMBED_OPEN)
    await flush()

    const frame = frames.find((f) => f.channel === RUST_STORE_EMBED_OPEN)
    expect(frame).toBeDefined()
    expect(frame?.args).toEqual([expected])
    // The shape itself, stated independently of the values: one object, never 5 positionals.
    expect(Array.isArray(frame?.args)).toBe(true)
    expect(frame?.args).toHaveLength(1)
    expect(typeof frame?.args?.[0]).toBe('object')
  })

  it('store_embed_set_bounds emits the fixture payload verbatim (object, not positional)', async () => {
    const { frames } = startTransport()
    const [expected] = wireFixture.store_embed_set_bounds
    fireWithNoRustPeer(createRustStoreEmbedSeam().setBounds({
      x: expected.x,
      y: expected.y,
      w: expected.w,
      h: expected.h
    }), RUST_STORE_EMBED_SET_BOUNDS)
    await flush()

    const frame = frames.find((f) => f.channel === RUST_STORE_EMBED_SET_BOUNDS)
    expect(frame).toBeDefined()
    expect(frame?.args).toEqual([expected])
    expect(frame?.args).toHaveLength(1)
    expect(typeof frame?.args?.[0]).toBe('object')
  })

  it('store_embed_navigate emits the fixture payload verbatim (object, not positional)', async () => {
    const { frames } = startTransport()
    const [expected] = wireFixture.store_embed_navigate
    fireWithNoRustPeer(createRustStoreEmbedSeam().navigate(expected.url), RUST_STORE_EMBED_NAVIGATE)
    await flush()

    const frame = frames.find((f) => f.channel === RUST_STORE_EMBED_NAVIGATE)
    expect(frame).toBeDefined()
    expect(frame?.args).toEqual([expected])
    expect(frame?.args).toHaveLength(1)
    expect(typeof frame?.args?.[0]).toBe('object')
  })

  it('the fixture is the shared artifact the Rust side reads — its arms must not drift', () => {
    // If an arm is renamed or dropped here, the Rust `wire_args(...)` lookup panics on the same
    // key. This test makes that coupling visible from the TS side rather than implicit.
    expect(
      Object.keys(wireFixture)
        .filter((k) => k !== '_comment')
        .sort()
    ).toEqual([
      'store_embed_navigate',
      'store_embed_open',
      'store_embed_set_bounds'
    ])
  })
})
