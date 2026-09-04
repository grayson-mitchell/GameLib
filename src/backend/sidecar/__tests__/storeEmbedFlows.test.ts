/**
 * Transport-shape + registration-kind proof for the sidecar's 10 curated store-embed channels
 * and their `rustInvoke`-backed seam (Phase 40 Plan 05, D-01/D-17/D-18/D-21/D-22/D-25/D-29,
 * REQ-40-02/REQ-40-05).
 *
 * Five named, mutation-provable tests (one-line change and observed-red result recorded per
 * test in `40-05-SUMMARY.md`), mirroring `humbleLoginFlows.test.ts`'s harness — `sidecarRpc` is
 * DELIBERATELY NOT mocked; every "Rust response" here is a synthetic line written directly into
 * a `PassThrough` pair driving the REAL `startRpcServer`/`requestRustInvoke` transport:
 *
 *   1. kind correctness — the 9 invoke channels are `ipcMain.handle`-registered and NOT
 *      `ipcMain.on`-registered; the 1 send channel is the reverse (T-40-05-02).
 *   2. malformed-response-throws — each of the 5 live-Rust-arm methods (open/setBounds/hide/
 *      show/close) throws on 3 distinct malformed response shapes (T-40-05-01), plus (Phase 40
 *      Plan 07) each of the 4 navigation methods (back/forward/reload/navigate) throws on ≥4
 *      distinct malformed navigation-state shapes.
 *   3. no-handler-rejects — a rejecting `requestRustInvoke` result surfaces through the
 *      registered `ipcMain.handle` arm as a resolved `{ status: 'error' }`, never a rejection
 *      (T-40-05-03).
 *   4. unimplemented-navigation-throws-naming-40-07 (inverted by Phase 40 Plan 07, not deleted) —
 *      `takeNavEvents` still throws a declared-unimplemented Error, without emitting any
 *      rustInvoke frame (D-25). `back`/`forward`/`reload`/`navigate` are implemented as of this
 *      plan and are now asserted to REACH their Rust channel with the expected arguments instead
 *      (lineage: this describe block is the same one plan `40-05` wrote, migrated rather than
 *      dropped).
 *   5. bounds-courier-passthrough-and-throw — `setBounds` passes x/y/w/h through unchanged, and
 *      throws (never substitutes) on a missing or non-finite coordinate (T-40-05-04/D-18/D-29).
 */

import { PassThrough } from 'node:stream'

import {
  registerStoreEmbedFlows,
  createRustStoreEmbedSeam
} from '../storeEmbedFlowRegistration'
import { handlerRegistry, listenerRegistry } from '../../platform'
import { startRpcServer, requestRustInvoke } from '../sidecarRpc'
import {
  RUST_STORE_EMBED_OPEN,
  RUST_STORE_EMBED_SET_BOUNDS,
  RUST_STORE_EMBED_HIDE,
  RUST_STORE_EMBED_SHOW,
  RUST_STORE_EMBED_CLOSE,
  RUST_STORE_EMBED_BACK,
  RUST_STORE_EMBED_FORWARD,
  RUST_STORE_EMBED_RELOAD,
  RUST_STORE_EMBED_NAVIGATE
} from 'common/types/sidecarTransport'

type Frame = Record<string, unknown>

/** Buffers newline-delimited output from a PassThrough into parsed frames (copied from
 * `humbleLoginFlows.test.ts`'s `collectFrames`). */
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
          frames.push(JSON.parse(line) as Frame)
        } catch {
          // Non-JSON diagnostic line — ignore.
        }
      }
      newlineIndex = buffer.indexOf('\n')
    }
  })
  return frames
}

/** Waits a couple of microtask/macrotask turns for async work to progress. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

/** Starts a fresh, lightweight sidecar RPC transport (mirrors `humbleLoginFlows.test.ts`'s
 * `startTransport` — `requestRustInvoke` only needs `startRpcServer`'s stream binding, not the
 * full `bootstrap.ts` init()). */
function startTransport(): { input: PassThrough; frames: Frame[] } {
  const input = new PassThrough()
  const output = new PassThrough()
  const frames = collectFrames(output)
  startRpcServer(input, output)
  return { input, frames }
}

const SAMPLE_BOUNDS = { x: 10, y: 20, w: 800, h: 600 }

// ── Registered ONCE for this whole file — `handlerRegistry`/`listenerRegistry` are module-scope
// maps; calling registerStoreEmbedFlows() more than once would stack a duplicate listener onto
// the same channel array (humbleLoginFlows.test.ts's own docstring names this hazard). ─────────
registerStoreEmbedFlows()

// ── Test 1: kind correctness ───────────────────────────────────────────────────────────────────
describe('kind correctness — the 9 invoke channels and 1 send channel are registered with the correct kind, both directions', () => {
  const HANDLE_CHANNELS = [
    'storeEmbedOpen',
    'storeEmbedHide',
    'storeEmbedShow',
    'storeEmbedClose',
    'storeEmbedTakeNavEvents',
    'storeEmbedBack',
    'storeEmbedForward',
    'storeEmbedReload',
    'storeEmbedNavigate'
  ]
  const SEND_CHANNELS = ['storeEmbedSetBounds']

  it.each(HANDLE_CHANNELS)(
    'T-40-05-02 %s is registered as ipcMain.handle, and NOT as ipcMain.on',
    (channel) => {
      expect(handlerRegistry.has(channel)).toBe(true)
      expect((listenerRegistry.get(channel) ?? []).length).toBe(0)
    }
  )

  it.each(SEND_CHANNELS)(
    'T-40-05-02 %s is registered as ipcMain.on, and NOT as ipcMain.handle',
    (channel) => {
      expect((listenerRegistry.get(channel) ?? []).length).toBe(1)
      expect(handlerRegistry.has(channel)).toBe(false)
    }
  )
})

// ── Test 2: malformed-response-throws (≥3 bad shapes per method, 5 live-Rust-arm methods) ──────
describe('malformed-response-throws — every live-Rust-arm method throws on a malformed response, never coerces', () => {
  const BAD_SHAPES: { label: string; value: unknown }[] = [
    { label: 'an empty object instead of null', value: {} },
    { label: 'a string instead of null', value: 'ok' },
    { label: 'a number instead of null', value: 0 }
  ]

  it.each(BAD_SHAPES)(
    'store_embed_open: throws on $label',
    async ({ value }) => {
      const { input, frames } = startTransport()
      const seam = createRustStoreEmbedSeam()

      const promise = seam.open(
        'https://store.steampowered.com',
        SAMPLE_BOUNDS,
        'steam'
      )
      await flush()
      const frame = frames.find((f) => f.channel === RUST_STORE_EMBED_OPEN)
      expect(frame).toBeDefined()

      input.write(`${JSON.stringify({ id: frame?.id, ok: true, result: value })}\n`)
      await expect(promise).rejects.toThrow(/malformed response/)
    }
  )

  it.each(BAD_SHAPES)(
    'store_embed_set_bounds: throws on $label',
    async ({ value }) => {
      const { input, frames } = startTransport()
      const seam = createRustStoreEmbedSeam()

      const settled = (async () => {
        try {
          await (seam.setBounds(SAMPLE_BOUNDS) as unknown as Promise<void>)
          return { threw: false }
        } catch (error) {
          return { threw: true, error }
        }
      })()
      await flush()
      const frame = frames.find(
        (f) => f.channel === RUST_STORE_EMBED_SET_BOUNDS
      )
      expect(frame).toBeDefined()

      input.write(`${JSON.stringify({ id: frame?.id, ok: true, result: value })}\n`)
      const outcome = await settled
      expect(outcome.threw).toBe(true)
      expect((outcome as { error: Error }).error.message).toMatch(
        /malformed response/
      )
    }
  )

  it.each(BAD_SHAPES)('store_embed_hide: throws on $label', async ({ value }) => {
    const { input, frames } = startTransport()
    const seam = createRustStoreEmbedSeam()

    const promise = seam.hide()
    await flush()
    const frame = frames.find((f) => f.channel === RUST_STORE_EMBED_HIDE)
    expect(frame).toBeDefined()

    input.write(`${JSON.stringify({ id: frame?.id, ok: true, result: value })}\n`)
    await expect(promise).rejects.toThrow(/malformed response/)
  })

  it.each(BAD_SHAPES)('store_embed_show: throws on $label', async ({ value }) => {
    const { input, frames } = startTransport()
    const seam = createRustStoreEmbedSeam()

    const promise = seam.show()
    await flush()
    const frame = frames.find((f) => f.channel === RUST_STORE_EMBED_SHOW)
    expect(frame).toBeDefined()

    input.write(`${JSON.stringify({ id: frame?.id, ok: true, result: value })}\n`)
    await expect(promise).rejects.toThrow(/malformed response/)
  })

  it.each(BAD_SHAPES)('store_embed_close: throws on $label', async ({ value }) => {
    const { input, frames } = startTransport()
    const seam = createRustStoreEmbedSeam()

    const promise = seam.close()
    await flush()
    const frame = frames.find((f) => f.channel === RUST_STORE_EMBED_CLOSE)
    expect(frame).toBeDefined()

    input.write(`${JSON.stringify({ id: frame?.id, ok: true, result: value })}\n`)
    await expect(promise).rejects.toThrow(/malformed response/)
  })

  // ── Phase 40 Plan 07: navigation-state malformed-response coverage (≥4 bad shapes) ──────────
  const BAD_NAV_SHAPES: { label: string; value: unknown }[] = [
    { label: 'null instead of a navigation-state object', value: null },
    {
      label: 'an object missing the canGoBack field',
      value: { url: 'https://example.com/', host: 'example.com', canGoForward: false }
    },
    {
      label: 'a non-boolean canGoForward field',
      value: {
        url: 'https://example.com/',
        host: 'example.com',
        canGoBack: false,
        canGoForward: 'no'
      }
    },
    {
      label: 'a non-string url field',
      value: { url: 123, host: 'example.com', canGoBack: false, canGoForward: false }
    }
  ]

  it.each(BAD_NAV_SHAPES)('store_embed_back: throws on $label', async ({ value }) => {
    const { input, frames } = startTransport()
    const seam = createRustStoreEmbedSeam()

    const promise = seam.back()
    await flush()
    const frame = frames.find((f) => f.channel === RUST_STORE_EMBED_BACK)
    expect(frame).toBeDefined()

    input.write(`${JSON.stringify({ id: frame?.id, ok: true, result: value })}\n`)
    await expect(promise).rejects.toThrow(/malformed response/)
  })

  it.each(BAD_NAV_SHAPES)('store_embed_forward: throws on $label', async ({ value }) => {
    const { input, frames } = startTransport()
    const seam = createRustStoreEmbedSeam()

    const promise = seam.forward()
    await flush()
    const frame = frames.find((f) => f.channel === RUST_STORE_EMBED_FORWARD)
    expect(frame).toBeDefined()

    input.write(`${JSON.stringify({ id: frame?.id, ok: true, result: value })}\n`)
    await expect(promise).rejects.toThrow(/malformed response/)
  })

  it.each(BAD_NAV_SHAPES)('store_embed_reload: throws on $label', async ({ value }) => {
    const { input, frames } = startTransport()
    const seam = createRustStoreEmbedSeam()

    const promise = seam.reload()
    await flush()
    const frame = frames.find((f) => f.channel === RUST_STORE_EMBED_RELOAD)
    expect(frame).toBeDefined()

    input.write(`${JSON.stringify({ id: frame?.id, ok: true, result: value })}\n`)
    await expect(promise).rejects.toThrow(/malformed response/)
  })

  it.each(BAD_NAV_SHAPES)('store_embed_navigate: throws on $label', async ({ value }) => {
    const { input, frames } = startTransport()
    const seam = createRustStoreEmbedSeam()

    const promise = seam.navigate('https://store.steampowered.com/app/440')
    await flush()
    const frame = frames.find((f) => f.channel === RUST_STORE_EMBED_NAVIGATE)
    expect(frame).toBeDefined()

    input.write(`${JSON.stringify({ id: frame?.id, ok: true, result: value })}\n`)
    await expect(promise).rejects.toThrow(/malformed response/)
  })

  it('sanity: requestRustInvoke refuses a non-allowlisted channel without emitting a frame', async () => {
    const { frames } = startTransport()
    await expect(
      requestRustInvoke('not_a_real_channel' as never, [])
    ).rejects.toThrow(/channel not allowed/)
    expect(frames).toHaveLength(0)
  })
})

// ── Test 3: no-handler-rejects ──────────────────────────────────────────────────────────────────
describe('no-handler-rejects — a rejecting requestRustInvoke surfaces as a resolved safe default, never a rejection (T-40-05-03)', () => {
  it('storeEmbedOpen: the registered ipcMain.handle arm resolves { status: "error" } rather than rejecting', async () => {
    const { input, frames } = startTransport()

    const handler = handlerRegistry.get('storeEmbedOpen')
    expect(handler).toBeDefined()

    const resultPromise = handler?.(
      {},
      'https://store.steampowered.com',
      SAMPLE_BOUNDS,
      'steam'
    ) as Promise<unknown>
    await flush()
    const frame = frames.find((f) => f.channel === RUST_STORE_EMBED_OPEN)
    expect(frame).toBeDefined()

    input.write(
      `${JSON.stringify({
        id: frame?.id,
        ok: false,
        error: 'store_embed_open:timeout'
      })}\n`
    )

    const result = (await resultPromise) as { status: string; error?: string }
    expect(result.status).toBe('error')
    expect(result.error).toMatch(/timeout/)
  })

  it('storeEmbedTakeNavEvents: the registered ipcMain.handle arm resolves [] rather than rejecting, on the declared-unimplemented throw', async () => {
    startTransport()
    const handler = handlerRegistry.get('storeEmbedTakeNavEvents')
    expect(handler).toBeDefined()
    await expect(handler?.({})).resolves.toEqual([])
  })

  it('storeEmbedBack: the registered ipcMain.handle arm resolves { status: "error" } rather than rejecting (Phase 40 Plan 07 safeNavState)', async () => {
    const { input, frames } = startTransport()

    const handler = handlerRegistry.get('storeEmbedBack')
    expect(handler).toBeDefined()

    const resultPromise = handler?.({}) as Promise<unknown>
    await flush()
    const frame = frames.find((f) => f.channel === RUST_STORE_EMBED_BACK)
    expect(frame).toBeDefined()

    input.write(
      `${JSON.stringify({
        id: frame?.id,
        ok: false,
        error: 'store_embed_back:no-back-entry'
      })}\n`
    )

    const result = (await resultPromise) as { status: string; error?: string }
    expect(result.status).toBe('error')
    expect(result.error).toMatch(/no-back-entry/)
  })
})

// ── Test 4: unimplemented-navigation-throws-naming-40-07 ────────────────────────────────────────
//
// Plan 40-05 wrote this describe block asserting all five methods (takeNavEvents/back/forward/
// reload/navigate) threw a declared-unimplemented Error naming plan `40-07` as owner. Phase 40
// Plan 07 (this plan) implemented four of the five, so this block is INVERTED for those four
// rather than deleted (a deleted test is a lost property; an inverted one is a migrated one):
// they now assert the method REACHES its Rust channel with the expected arguments. `takeNavEvents`
// still has no Rust arm and keeps its original declared-unimplemented assertion, updated only to
// stop asserting a `40-07` owner (D-25 — no future plan has been assigned ownership; see
// `storeEmbedFlowRegistration.ts`'s `takeNavEventsUnimplementedError()` doc comment for why
// naming a specific plan there would go stale).
describe('unimplemented-navigation-throws-naming-40-07 — takeNavEvents has no Rust arm (D-25); back/forward/reload/navigate now reach their Rust channel (Phase 40 Plan 07)', () => {
  it('takeNavEvents throws a declared-unimplemented Error, without emitting any rustInvoke frame', async () => {
    const { frames } = startTransport()
    await expect(createRustStoreEmbedSeam().takeNavEvents()).rejects.toThrow(
      /not yet implemented/
    )
    expect(frames).toHaveLength(0)
  })

  const SAMPLE_NAV_STATE = {
    url: 'https://store.steampowered.com/app/440',
    host: 'store.steampowered.com',
    canGoBack: true,
    canGoForward: false
  }

  const NAV_REACHABILITY_CASES: [string, string, () => Promise<unknown>][] = [
    ['back', RUST_STORE_EMBED_BACK, () => createRustStoreEmbedSeam().back()],
    ['forward', RUST_STORE_EMBED_FORWARD, () => createRustStoreEmbedSeam().forward()],
    ['reload', RUST_STORE_EMBED_RELOAD, () => createRustStoreEmbedSeam().reload()],
    [
      'navigate',
      RUST_STORE_EMBED_NAVIGATE,
      () => createRustStoreEmbedSeam().navigate(SAMPLE_NAV_STATE.url)
    ]
  ]

  it.each(NAV_REACHABILITY_CASES)(
    '%s (migrated from plan 40-05\'s declared-unimplemented assertion) reaches its Rust channel %s and resolves the navigation state it returns',
    async (_name, channel, invoke) => {
      const { input, frames } = startTransport()
      const promise = invoke()
      await flush()
      const frame = frames.find((f) => f.channel === channel)
      expect(frame).toBeDefined()

      input.write(`${JSON.stringify({ id: frame?.id, ok: true, result: SAMPLE_NAV_STATE })}\n`)
      await expect(promise).resolves.toEqual(SAMPLE_NAV_STATE)
    }
  )

  it('store_embed_navigate: forwards the url argument on the wire, unchanged', async () => {
    const { input, frames } = startTransport()
    const promise = createRustStoreEmbedSeam().navigate('https://example.com/next')
    await flush()
    const frame = frames.find((f) => f.channel === RUST_STORE_EMBED_NAVIGATE)
    expect(frame).toBeDefined()
    expect(frame?.args).toEqual(['https://example.com/next'])

    input.write(
      `${JSON.stringify({
        id: frame?.id,
        ok: true,
        result: {
          url: 'https://example.com/next',
          host: 'example.com',
          canGoBack: true,
          canGoForward: false
        }
      })}\n`
    )
    await promise
  })
})

// ── Test 5: bounds-courier-passthrough-and-throw ─────────────────────────────────────────────────
describe('bounds-courier-passthrough-and-throw — setBounds is a pure courier (T-40-05-04/D-18/D-29)', () => {
  it('store_embed_set_bounds: emits [x, y, w, h] field-for-field unchanged, no rounding/clamping/defaulting', async () => {
    const { input, frames } = startTransport()
    const seam = createRustStoreEmbedSeam()

    const oddBounds = { x: 10.5, y: -3, w: 799.999, h: 0 }
    void (seam.setBounds(oddBounds) as unknown as Promise<void>)
    await flush()

    const frame = frames.find(
      (f) => f.channel === RUST_STORE_EMBED_SET_BOUNDS
    )
    expect(frame).toBeDefined()
    expect(frame?.args).toEqual([10.5, -3, 799.999, 0])

    input.write(`${JSON.stringify({ id: frame?.id, ok: true, result: null })}\n`)
  })

  const BAD_COORDINATES: { label: string; bounds: unknown }[] = [
    {
      label: 'a missing field (h undefined)',
      bounds: { x: 0, y: 0, w: 100, h: undefined }
    },
    { label: 'a NaN field (w)', bounds: { x: 0, y: 0, w: NaN, h: 100 } },
    {
      label: 'an Infinity field (x)',
      bounds: { x: Infinity, y: 0, w: 100, h: 100 }
    }
  ]

  it.each(BAD_COORDINATES)(
    'store_embed_set_bounds: throws synchronously on $label, WITHOUT emitting a rustInvoke frame',
    ({ bounds }) => {
      const { frames } = startTransport()
      const seam = createRustStoreEmbedSeam()
      expect(() =>
        seam.setBounds(bounds as { x: number; y: number; w: number; h: number })
      ).toThrow(/must be a finite number/)
      expect(frames).toHaveLength(0)
    }
  )
})
