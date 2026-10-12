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
 *   4. nav-methods-reach-their-rust-channel (twice-inverted, never deleted) — plan `40-05`
 *      wrote this block asserting all FIVE nav methods threw a declared-unimplemented Error;
 *      plan `40-07` inverted four of them; quick task `260905-e61` (GAP-D, REQ-40-06) inverted
 *      the fifth, `takeNavEvents`. All five now assert the method REACHES its Rust channel with
 *      the expected arguments and coerces the response. `takeNavEvents` additionally asserts
 *      per-ELEMENT coercion, since it returns an array.
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
  RUST_STORE_EMBED_NAVIGATE,
  RUST_STORE_EMBED_TAKE_NAV_EVENTS
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

      input.write(
        `${JSON.stringify({ id: frame?.id, ok: true, result: value })}\n`
      )
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

      input.write(
        `${JSON.stringify({ id: frame?.id, ok: true, result: value })}\n`
      )
      const outcome = await settled
      expect(outcome.threw).toBe(true)
      expect((outcome as { error: Error }).error.message).toMatch(
        /malformed response/
      )
    }
  )

  it.each(BAD_SHAPES)(
    'store_embed_hide: throws on $label',
    async ({ value }) => {
      const { input, frames } = startTransport()
      const seam = createRustStoreEmbedSeam()

      const promise = seam.hide()
      await flush()
      const frame = frames.find((f) => f.channel === RUST_STORE_EMBED_HIDE)
      expect(frame).toBeDefined()

      input.write(
        `${JSON.stringify({ id: frame?.id, ok: true, result: value })}\n`
      )
      await expect(promise).rejects.toThrow(/malformed response/)
    }
  )

  it.each(BAD_SHAPES)(
    'store_embed_show: throws on $label',
    async ({ value }) => {
      const { input, frames } = startTransport()
      const seam = createRustStoreEmbedSeam()

      const promise = seam.show()
      await flush()
      const frame = frames.find((f) => f.channel === RUST_STORE_EMBED_SHOW)
      expect(frame).toBeDefined()

      input.write(
        `${JSON.stringify({ id: frame?.id, ok: true, result: value })}\n`
      )
      await expect(promise).rejects.toThrow(/malformed response/)
    }
  )

  it.each(BAD_SHAPES)(
    'store_embed_close: throws on $label',
    async ({ value }) => {
      const { input, frames } = startTransport()
      const seam = createRustStoreEmbedSeam()

      const promise = seam.close()
      await flush()
      const frame = frames.find((f) => f.channel === RUST_STORE_EMBED_CLOSE)
      expect(frame).toBeDefined()

      input.write(
        `${JSON.stringify({ id: frame?.id, ok: true, result: value })}\n`
      )
      await expect(promise).rejects.toThrow(/malformed response/)
    }
  )

  // ── Phase 40 Plan 07: navigation-state malformed-response coverage (≥4 bad shapes) ──────────
  const BAD_NAV_SHAPES: { label: string; value: unknown }[] = [
    { label: 'null instead of a navigation-state object', value: null },
    {
      label: 'an object missing the canGoBack field',
      value: {
        url: 'https://example.com/',
        host: 'example.com',
        canGoForward: false
      }
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
      value: {
        url: 123,
        host: 'example.com',
        canGoBack: false,
        canGoForward: false
      }
    }
  ]

  it.each(BAD_NAV_SHAPES)(
    'store_embed_back: throws on $label',
    async ({ value }) => {
      const { input, frames } = startTransport()
      const seam = createRustStoreEmbedSeam()

      const promise = seam.back()
      await flush()
      const frame = frames.find((f) => f.channel === RUST_STORE_EMBED_BACK)
      expect(frame).toBeDefined()

      input.write(
        `${JSON.stringify({ id: frame?.id, ok: true, result: value })}\n`
      )
      await expect(promise).rejects.toThrow(/malformed response/)
    }
  )

  it.each(BAD_NAV_SHAPES)(
    'store_embed_forward: throws on $label',
    async ({ value }) => {
      const { input, frames } = startTransport()
      const seam = createRustStoreEmbedSeam()

      const promise = seam.forward()
      await flush()
      const frame = frames.find((f) => f.channel === RUST_STORE_EMBED_FORWARD)
      expect(frame).toBeDefined()

      input.write(
        `${JSON.stringify({ id: frame?.id, ok: true, result: value })}\n`
      )
      await expect(promise).rejects.toThrow(/malformed response/)
    }
  )

  it.each(BAD_NAV_SHAPES)(
    'store_embed_reload: throws on $label',
    async ({ value }) => {
      const { input, frames } = startTransport()
      const seam = createRustStoreEmbedSeam()

      const promise = seam.reload()
      await flush()
      const frame = frames.find((f) => f.channel === RUST_STORE_EMBED_RELOAD)
      expect(frame).toBeDefined()

      input.write(
        `${JSON.stringify({ id: frame?.id, ok: true, result: value })}\n`
      )
      await expect(promise).rejects.toThrow(/malformed response/)
    }
  )

  it.each(BAD_NAV_SHAPES)(
    'store_embed_navigate: throws on $label',
    async ({ value }) => {
      const { input, frames } = startTransport()
      const seam = createRustStoreEmbedSeam()

      const promise = seam.navigate('https://store.steampowered.com/app/440')
      await flush()
      const frame = frames.find((f) => f.channel === RUST_STORE_EMBED_NAVIGATE)
      expect(frame).toBeDefined()

      input.write(
        `${JSON.stringify({ id: frame?.id, ok: true, result: value })}\n`
      )
      await expect(promise).rejects.toThrow(/malformed response/)
    }
  )

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

  // GAP-D lineage: until quick task `260905-e61` this test read
  // `resolves.toEqual([])` on the declared-unimplemented throw -- green, and green BECAUSE the
  // defect was present. The PROPERTY it was protecting (the arm never rejects) is real and is
  // kept; only its driver changes, from an unconditional throw to a rejecting transport.
  it('storeEmbedTakeNavEvents: the registered ipcMain.handle arm resolves [] rather than rejecting, when the Rust arm errors', async () => {
    const { input, frames } = startTransport()

    const handler = handlerRegistry.get('storeEmbedTakeNavEvents')
    expect(handler).toBeDefined()

    const resultPromise = handler?.({}) as Promise<unknown>
    await flush()
    const frame = frames.find(
      (f) => f.channel === RUST_STORE_EMBED_TAKE_NAV_EVENTS
    )
    expect(frame).toBeDefined()

    input.write(
      `${JSON.stringify({
        id: frame?.id,
        ok: false,
        error: 'store_embed_take_nav_events:history-registry-poisoned'
      })}\n`
    )

    await expect(resultPromise).resolves.toEqual([])
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

// ── Test 4: nav-methods-reach-their-rust-channel ────────────────────────────────────────────────
//
// Plan 40-05 wrote this describe block asserting all five methods (takeNavEvents/back/forward/
// reload/navigate) threw a declared-unimplemented Error naming plan `40-07` as owner. Plan 40-07
// inverted four of them; quick task `260905-e61` (GAP-D, REQ-40-06) inverts the fifth. Inverted
// twice, deleted never -- a deleted test is a lost property; an inverted one is a migrated one.
//
// `takeNavEvents` is the one that mattered: while it threw, an in-embed link click moved Rust's
// history cursor and NOTHING carried that to the renderer, so Back stayed greyed forever. Its
// assertion below is the TS half of that fix; the Rust half is
// `store_embed_push_enqueues_a_nav_event_carrying_the_post_push_cursor_state` in main.rs.
describe('nav-methods-reach-their-rust-channel — all five navigation methods reach Rust and coerce the response (40-05 -> 40-07 -> GAP-D)', () => {
  it('takeNavEvents reaches store_embed_take_nav_events with no arguments and resolves the coerced event array', async () => {
    const { input, frames } = startTransport()
    const promise = createRustStoreEmbedSeam().takeNavEvents()
    await flush()

    const frame = frames.find(
      (f) => f.channel === RUST_STORE_EMBED_TAKE_NAV_EVENTS
    )
    expect(frame).toBeDefined()
    expect(frame?.args).toEqual([])

    const queued = [
      {
        url: 'https://af.gog.com/',
        host: 'af.gog.com',
        canGoBack: false,
        canGoForward: false
      },
      {
        url: 'https://www.gog.com/game/foo',
        host: 'www.gog.com',
        canGoBack: true,
        canGoForward: false
      }
    ]
    input.write(
      `${JSON.stringify({ id: frame?.id, ok: true, result: queued })}\n`
    )
    await expect(promise).resolves.toEqual(queued)
  })

  it('takeNavEvents resolves an empty array for an idle queue — the healthy, most frequent case', async () => {
    const { input, frames } = startTransport()
    const promise = createRustStoreEmbedSeam().takeNavEvents()
    await flush()
    const frame = frames.find(
      (f) => f.channel === RUST_STORE_EMBED_TAKE_NAV_EVENTS
    )
    input.write(`${JSON.stringify({ id: frame?.id, ok: true, result: [] })}\n`)
    await expect(promise).resolves.toEqual([])
  })

  it('takeNavEvents throws on a non-array response — a dead arm must not look like an idle one', async () => {
    const { input, frames } = startTransport()
    const promise = createRustStoreEmbedSeam().takeNavEvents()
    await flush()
    const frame = frames.find(
      (f) => f.channel === RUST_STORE_EMBED_TAKE_NAV_EVENTS
    )
    input.write(
      `${JSON.stringify({ id: frame?.id, ok: true, result: null })}\n`
    )
    await expect(promise).rejects.toThrow(/expected an array/)
  })

  it('takeNavEvents coerces PER ELEMENT — one malformed entry in an otherwise valid array throws', async () => {
    const { input, frames } = startTransport()
    const promise = createRustStoreEmbedSeam().takeNavEvents()
    await flush()
    const frame = frames.find(
      (f) => f.channel === RUST_STORE_EMBED_TAKE_NAV_EVENTS
    )
    input.write(
      `${JSON.stringify({
        id: frame?.id,
        ok: true,
        result: [
          {
            url: 'https://www.gog.com/',
            host: 'www.gog.com',
            canGoBack: true,
            canGoForward: false
          },
          {
            url: 'https://www.gog.com/next',
            host: 'www.gog.com',
            canGoForward: false
          }
        ]
      })}\n`
    )
    // The channel name in the message carries the failing INDEX, so a malformed element is
    // locatable rather than merely reported.
    await expect(promise).rejects.toThrow(
      /store_embed_take_nav_events\[1\]: malformed response \(canGoBack must be a boolean\)/
    )
  })

  // ── Phase 50 Plan 02, Task 1: the Epic surface's `surface: 'epic'` nav events go through the
  // SAME coercion as every Tauri-managed event above -- these two cases prove that end to end. ──
  it("takeNavEvents round-trips an Epic-shaped event with `surface: 'epic'` preserved", async () => {
    const { input, frames } = startTransport()
    const promise = createRustStoreEmbedSeam().takeNavEvents()
    await flush()
    const frame = frames.find(
      (f) => f.channel === RUST_STORE_EMBED_TAKE_NAV_EVENTS
    )
    // `loadTimedOut`/`challenged`/`blockedLauncherSchemeCount` (Phase 50 Plan 02) are each
    // REQUIRED on every `surface: 'epic'` event as of this plan -- Task 1's original fixture
    // (pre-Plan-02) omitted all three and would now throw; updated here rather than left stale,
    // since it is this same plan's own change that made them required.
    const epicEvent = {
      url: 'https://store.epicgames.com/en-US/',
      host: 'store.epicgames.com',
      canGoBack: false,
      canGoForward: true,
      surface: 'epic',
      loadTimedOut: false,
      challenged: false,
      blockedLauncherSchemeCount: 0
    }
    input.write(
      `${JSON.stringify({ id: frame?.id, ok: true, result: [epicEvent] })}\n`
    )
    await expect(promise).resolves.toEqual([epicEvent])
  })

  it('takeNavEvents still throws on a non-boolean canGoBack when the event carries `surface: "epic"` -- the surface field does not bypass validation', async () => {
    const { input, frames } = startTransport()
    const promise = createRustStoreEmbedSeam().takeNavEvents()
    await flush()
    const frame = frames.find(
      (f) => f.channel === RUST_STORE_EMBED_TAKE_NAV_EVENTS
    )
    input.write(
      `${JSON.stringify({
        id: frame?.id,
        ok: true,
        result: [
          {
            url: 'https://store.epicgames.com/en-US/',
            host: 'store.epicgames.com',
            canGoBack: 'nope',
            canGoForward: true,
            surface: 'epic'
          }
        ]
      })}\n`
    )
    await expect(promise).rejects.toThrow(
      /store_embed_take_nav_events\[0\]: malformed response \(canGoBack must be a boolean\)/
    )
  })

  // ── Phase 50 Plan 02, Task 2: `loadTimedOut` is REQUIRED on `surface: 'epic'` and FORBIDDEN
  // everywhere else -- both directions throw rather than coerce (same discipline as `surface`
  // itself, Task 1). ──
  it("takeNavEvents throws when a surface: 'epic' event is missing loadTimedOut", async () => {
    const { input, frames } = startTransport()
    const promise = createRustStoreEmbedSeam().takeNavEvents()
    await flush()
    const frame = frames.find(
      (f) => f.channel === RUST_STORE_EMBED_TAKE_NAV_EVENTS
    )
    input.write(
      `${JSON.stringify({
        id: frame?.id,
        ok: true,
        result: [
          {
            url: 'https://store.epicgames.com/en-US/',
            host: 'store.epicgames.com',
            canGoBack: false,
            canGoForward: true,
            surface: 'epic'
          }
        ]
      })}\n`
    )
    await expect(promise).rejects.toThrow(
      /store_embed_take_nav_events\[0\]: malformed response \(loadTimedOut must be a boolean when surface is 'epic'\)/
    )
  })

  it("takeNavEvents throws when a surface: 'tauri' event carries loadTimedOut", async () => {
    const { input, frames } = startTransport()
    const promise = createRustStoreEmbedSeam().takeNavEvents()
    await flush()
    const frame = frames.find(
      (f) => f.channel === RUST_STORE_EMBED_TAKE_NAV_EVENTS
    )
    input.write(
      `${JSON.stringify({
        id: frame?.id,
        ok: true,
        result: [
          {
            url: 'https://www.gog.com/',
            host: 'www.gog.com',
            canGoBack: false,
            canGoForward: false,
            surface: 'tauri',
            loadTimedOut: false
          }
        ]
      })}\n`
    )
    await expect(promise).rejects.toThrow(
      /store_embed_take_nav_events\[0\]: malformed response \(loadTimedOut is only valid when surface is 'epic'\)/
    )
  })

  it('takeNavEvents throws when a surface-less event carries loadTimedOut', async () => {
    const { input, frames } = startTransport()
    const promise = createRustStoreEmbedSeam().takeNavEvents()
    await flush()
    const frame = frames.find(
      (f) => f.channel === RUST_STORE_EMBED_TAKE_NAV_EVENTS
    )
    input.write(
      `${JSON.stringify({
        id: frame?.id,
        ok: true,
        result: [
          {
            url: 'https://www.gog.com/',
            host: 'www.gog.com',
            canGoBack: false,
            canGoForward: false,
            loadTimedOut: false
          }
        ]
      })}\n`
    )
    await expect(promise).rejects.toThrow(
      /store_embed_take_nav_events\[0\]: malformed response \(loadTimedOut is only valid when surface is 'epic'\)/
    )
  })

  // ── Phase 50 Plan 02, Task 3: `challenged` and `blockedLauncherSchemeCount` carry the SAME
  // required-on-epic/forbidden-otherwise discipline as `loadTimedOut` above, plus
  // `blockedLauncherSchemeCount` is additionally checked for being a non-negative integer. ──
  it("takeNavEvents throws when a surface: 'epic' event is missing challenged", async () => {
    const { input, frames } = startTransport()
    const promise = createRustStoreEmbedSeam().takeNavEvents()
    await flush()
    const frame = frames.find(
      (f) => f.channel === RUST_STORE_EMBED_TAKE_NAV_EVENTS
    )
    input.write(
      `${JSON.stringify({
        id: frame?.id,
        ok: true,
        result: [
          {
            url: 'https://store.epicgames.com/en-US/',
            host: 'store.epicgames.com',
            canGoBack: false,
            canGoForward: true,
            surface: 'epic',
            loadTimedOut: false,
            blockedLauncherSchemeCount: 0
          }
        ]
      })}\n`
    )
    await expect(promise).rejects.toThrow(
      /store_embed_take_nav_events\[0\]: malformed response \(challenged must be a boolean when surface is 'epic'\)/
    )
  })

  it("takeNavEvents throws when a surface: 'epic' event is missing blockedLauncherSchemeCount", async () => {
    const { input, frames } = startTransport()
    const promise = createRustStoreEmbedSeam().takeNavEvents()
    await flush()
    const frame = frames.find(
      (f) => f.channel === RUST_STORE_EMBED_TAKE_NAV_EVENTS
    )
    input.write(
      `${JSON.stringify({
        id: frame?.id,
        ok: true,
        result: [
          {
            url: 'https://store.epicgames.com/en-US/',
            host: 'store.epicgames.com',
            canGoBack: false,
            canGoForward: true,
            surface: 'epic',
            loadTimedOut: false,
            challenged: false
          }
        ]
      })}\n`
    )
    await expect(promise).rejects.toThrow(
      /store_embed_take_nav_events\[0\]: malformed response \(blockedLauncherSchemeCount must be a non-negative integer when surface is 'epic'\)/
    )
  })

  it("takeNavEvents throws when a surface: 'epic' event carries a negative blockedLauncherSchemeCount", async () => {
    const { input, frames } = startTransport()
    const promise = createRustStoreEmbedSeam().takeNavEvents()
    await flush()
    const frame = frames.find(
      (f) => f.channel === RUST_STORE_EMBED_TAKE_NAV_EVENTS
    )
    input.write(
      `${JSON.stringify({
        id: frame?.id,
        ok: true,
        result: [
          {
            url: 'https://store.epicgames.com/en-US/',
            host: 'store.epicgames.com',
            canGoBack: false,
            canGoForward: true,
            surface: 'epic',
            loadTimedOut: false,
            challenged: false,
            blockedLauncherSchemeCount: -1
          }
        ]
      })}\n`
    )
    await expect(promise).rejects.toThrow(
      /store_embed_take_nav_events\[0\]: malformed response \(blockedLauncherSchemeCount must be a non-negative integer when surface is 'epic'\)/
    )
  })

  it("takeNavEvents throws when a surface: 'epic' event carries a non-integral blockedLauncherSchemeCount", async () => {
    const { input, frames } = startTransport()
    const promise = createRustStoreEmbedSeam().takeNavEvents()
    await flush()
    const frame = frames.find(
      (f) => f.channel === RUST_STORE_EMBED_TAKE_NAV_EVENTS
    )
    input.write(
      `${JSON.stringify({
        id: frame?.id,
        ok: true,
        result: [
          {
            url: 'https://store.epicgames.com/en-US/',
            host: 'store.epicgames.com',
            canGoBack: false,
            canGoForward: true,
            surface: 'epic',
            loadTimedOut: false,
            challenged: false,
            blockedLauncherSchemeCount: 1.5
          }
        ]
      })}\n`
    )
    await expect(promise).rejects.toThrow(
      /store_embed_take_nav_events\[0\]: malformed response \(blockedLauncherSchemeCount must be a non-negative integer when surface is 'epic'\)/
    )
  })

  it("takeNavEvents throws when a surface: 'tauri' event carries challenged", async () => {
    const { input, frames } = startTransport()
    const promise = createRustStoreEmbedSeam().takeNavEvents()
    await flush()
    const frame = frames.find(
      (f) => f.channel === RUST_STORE_EMBED_TAKE_NAV_EVENTS
    )
    input.write(
      `${JSON.stringify({
        id: frame?.id,
        ok: true,
        result: [
          {
            url: 'https://www.gog.com/',
            host: 'www.gog.com',
            canGoBack: false,
            canGoForward: false,
            surface: 'tauri',
            challenged: false
          }
        ]
      })}\n`
    )
    await expect(promise).rejects.toThrow(
      /store_embed_take_nav_events\[0\]: malformed response \(challenged is only valid when surface is 'epic'\)/
    )
  })

  it('takeNavEvents throws when a surface-less event carries blockedLauncherSchemeCount', async () => {
    const { input, frames } = startTransport()
    const promise = createRustStoreEmbedSeam().takeNavEvents()
    await flush()
    const frame = frames.find(
      (f) => f.channel === RUST_STORE_EMBED_TAKE_NAV_EVENTS
    )
    input.write(
      `${JSON.stringify({
        id: frame?.id,
        ok: true,
        result: [
          {
            url: 'https://www.gog.com/',
            host: 'www.gog.com',
            canGoBack: false,
            canGoForward: false,
            blockedLauncherSchemeCount: 2
          }
        ]
      })}\n`
    )
    await expect(promise).rejects.toThrow(
      /store_embed_take_nav_events\[0\]: malformed response \(blockedLauncherSchemeCount is only valid when surface is 'epic'\)/
    )
  })

  it('takeNavEvents round-trips an Epic event carrying challenged and blockedLauncherSchemeCount', async () => {
    const { input, frames } = startTransport()
    const promise = createRustStoreEmbedSeam().takeNavEvents()
    await flush()
    const frame = frames.find(
      (f) => f.channel === RUST_STORE_EMBED_TAKE_NAV_EVENTS
    )
    const epicEvent = {
      url: 'https://store.epicgames.com/en-US/',
      host: 'store.epicgames.com',
      canGoBack: false,
      canGoForward: true,
      surface: 'epic',
      loadTimedOut: false,
      challenged: true,
      blockedLauncherSchemeCount: 3
    }
    input.write(
      `${JSON.stringify({ id: frame?.id, ok: true, result: [epicEvent] })}\n`
    )
    await expect(promise).resolves.toEqual([epicEvent])
  })

  const SAMPLE_NAV_STATE = {
    url: 'https://store.steampowered.com/app/440',
    host: 'store.steampowered.com',
    canGoBack: true,
    canGoForward: false
  }

  const NAV_REACHABILITY_CASES: [string, string, () => Promise<unknown>][] = [
    ['back', RUST_STORE_EMBED_BACK, () => createRustStoreEmbedSeam().back()],
    [
      'forward',
      RUST_STORE_EMBED_FORWARD,
      () => createRustStoreEmbedSeam().forward()
    ],
    [
      'reload',
      RUST_STORE_EMBED_RELOAD,
      () => createRustStoreEmbedSeam().reload()
    ],
    [
      'navigate',
      RUST_STORE_EMBED_NAVIGATE,
      () => createRustStoreEmbedSeam().navigate(SAMPLE_NAV_STATE.url)
    ]
  ]

  it.each(NAV_REACHABILITY_CASES)(
    "%s (migrated from plan 40-05's declared-unimplemented assertion) reaches its Rust channel %s and resolves the navigation state it returns",
    async (_name, channel, invoke) => {
      const { input, frames } = startTransport()
      const promise = invoke()
      await flush()
      const frame = frames.find((f) => f.channel === channel)
      expect(frame).toBeDefined()

      input.write(
        `${JSON.stringify({ id: frame?.id, ok: true, result: SAMPLE_NAV_STATE })}\n`
      )
      await expect(promise).resolves.toEqual(SAMPLE_NAV_STATE)
    }
  )

  // Phase 50 review finding 2. On macOS, back/forward/reload/navigate route to the raw Epic
  // WKWebView whenever it is selected, and that arm's DIRECT return used to be a bare
  // `nav_state_json()`: it had `surface: 'epic'` but none of the three flags `coerceNavState`
  // requires on an Epic state, so every Epic chrome-nav result turned into
  // `{ status: 'error' }`. Every fixture above is surface-less, so nothing here could see it.
  // `EPIC_FLAGGED_NAV_STATE` is the exact object the Rust unit test
  // `the_flag_merge_adds_all_three_epic_fields` (`src-tauri/src/epic_embed_state.rs`) asserts
  // `epic_nav_state_with_flags` produces. That function is now the one merge both Epic return
  // paths go through. Keep the two fixtures in step.
  const EPIC_FLAGGED_NAV_STATE = {
    url: 'https://store.epicgames.com/en-US/',
    host: 'store.epicgames.com',
    canGoBack: true,
    canGoForward: false,
    surface: 'epic',
    loadTimedOut: true,
    challenged: false,
    blockedLauncherSchemeCount: 2
  }
  const {
    loadTimedOut: _lt,
    challenged: _ch,
    blockedLauncherSchemeCount: _bl,
    ...EPIC_BARE_NAV_STATE
  } = EPIC_FLAGGED_NAV_STATE

  it.each(NAV_REACHABILITY_CASES)(
    "%s resolves a real surface: 'epic' reply carrying the merged flags (finding 2)",
    async (_name, channel, invoke) => {
      const { input, frames } = startTransport()
      const promise = invoke()
      await flush()
      const frame = frames.find((f) => f.channel === channel)
      input.write(
        `${JSON.stringify({ id: frame?.id, ok: true, result: EPIC_FLAGGED_NAV_STATE })}\n`
      )
      await expect(promise).resolves.toEqual(EPIC_FLAGGED_NAV_STATE)
    }
  )

  it.each(NAV_REACHABILITY_CASES)(
    "%s rejects the pre-fix bare surface: 'epic' reply rather than defaulting its flags (finding 2)",
    async (_name, channel, invoke) => {
      const { input, frames } = startTransport()
      const promise = invoke()
      await flush()
      const frame = frames.find((f) => f.channel === channel)
      input.write(
        `${JSON.stringify({ id: frame?.id, ok: true, result: EPIC_BARE_NAV_STATE })}\n`
      )
      await expect(promise).rejects.toThrow(/loadTimedOut must be a boolean/)
    }
  )

  it("storeEmbedBack: the registered arm resolves { status: 'ok', navState } for a flagged Epic reply (finding 2)", async () => {
    const { input, frames } = startTransport()
    const resultPromise = handlerRegistry.get('storeEmbedBack')?.(
      {}
    ) as Promise<unknown>
    await flush()
    const frame = frames.find((f) => f.channel === RUST_STORE_EMBED_BACK)
    input.write(
      `${JSON.stringify({ id: frame?.id, ok: true, result: EPIC_FLAGGED_NAV_STATE })}\n`
    )
    await expect(resultPromise).resolves.toEqual({
      status: 'ok',
      navState: EPIC_FLAGGED_NAV_STATE
    })
  })

  it('store_embed_navigate: forwards the url argument on the wire, unchanged', async () => {
    const { input, frames } = startTransport()
    const promise = createRustStoreEmbedSeam().navigate(
      'https://example.com/next'
    )
    await flush()
    const frame = frames.find((f) => f.channel === RUST_STORE_EMBED_NAVIGATE)
    expect(frame).toBeDefined()
    expect(frame?.args).toEqual([{ url: 'https://example.com/next' }])

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
  it('store_embed_set_bounds: emits { x, y, w, h } field-for-field unchanged, no rounding/clamping/defaulting', async () => {
    const { input, frames } = startTransport()
    const seam = createRustStoreEmbedSeam()

    const oddBounds = { x: 10.5, y: -3, w: 799.999, h: 0 }
    void (seam.setBounds(oddBounds) as unknown as Promise<void>)
    await flush()

    const frame = frames.find((f) => f.channel === RUST_STORE_EMBED_SET_BOUNDS)
    expect(frame).toBeDefined()
    expect(frame?.args).toEqual([{ x: 10.5, y: -3, w: 799.999, h: 0 }])

    input.write(
      `${JSON.stringify({ id: frame?.id, ok: true, result: null })}\n`
    )
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
