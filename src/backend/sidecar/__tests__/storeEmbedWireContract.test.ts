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

describe('store-embed wire contract — the sidecar emits exactly what the Rust parsers accept', () => {
  it('store_embed_open emits the fixture payload verbatim (object, not positional)', async () => {
    const { frames } = startTransport()
    const [expected] = wireFixture.store_embed_open
    void createRustStoreEmbedSeam().open(
      expected.url,
      { x: expected.x, y: expected.y, w: expected.w, h: expected.h },
      'steam'
    )
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
    void (createRustStoreEmbedSeam().setBounds({
      x: expected.x,
      y: expected.y,
      w: expected.w,
      h: expected.h
    }) as unknown as Promise<void>)
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
    void createRustStoreEmbedSeam().navigate(expected.url)
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
