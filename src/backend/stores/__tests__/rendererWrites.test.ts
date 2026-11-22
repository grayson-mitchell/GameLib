/**
 * Renderer store writes owned by Rust, seen from the sidecar (Phase 85 plan 17, FND-06).
 *
 * The renderer's `storeSet` is a native Rust channel now: Rust checks the policy, applies the write
 * through `StoreHost` and tells the sidecar's mirror with a `storeMirrorEvent {op: 'changed'}` in
 * the host's rev order, so TS readers see renderer writes. These cases drive the TS half through the
 * real registered `storeMirrorEvent` listener (after the channel's own schema): a `changed` event
 * moves a Rust-owned store's cell, so `GameLibStore.get` returns the renderer's value. The Rust half
 * is `cargo test --bin gamelib-shell store_native` (the tracer) and `store_frame` (the event stream).
 */
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  STORE_MIRROR_EVENT_CHANNEL,
  STORE_TS_SET_CHANNEL
} from 'common/types/sidecarTransport'
import { sidecarInternalSendArgs } from 'common/types/ipc/sidecarInternal'
import Store from '../../store_backend'
import { registerStoreWriteHandlers } from '../../sidecar/storeWriteHandlers'
import { createStoreRegistry } from '../storeRegistry'
import type { StoreFrame } from '../storeFrames'
import type { StoreMode } from '../storeOwnership'
import { createTestStoreRoot } from '../../testUtils/testStoreRoot'

const TRACER_KEY = 'store_cache/wikigameinfo'

let userData: string
beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'gamelib-renderer-writes-'))
})
afterEach(() => {
  rmSync(userData, { recursive: true, force: true })
  jest.restoreAllMocks()
})

/** A root, its registered store-layer listeners and every renderer push it made. */
function layer(storeMode: StoreMode, frames: StoreFrame[] = []) {
  const root = createTestStoreRoot(userData, {
    storeMode,
    recordFrames: frames
  })
  const listeners = new Map<string, (...args: unknown[]) => unknown>()
  const pushes: [string, unknown][] = []
  registerStoreWriteHandlers({
    ipc: {
      on: (channel: string, listener: (...args: unknown[]) => unknown) => {
        listeners.set(channel, listener)
      },
      handle: (channel: string, listener: (...args: unknown[]) => unknown) => {
        listeners.set(channel, listener)
      }
    } as never,
    registry: createStoreRegistry(),
    root,
    pushFrontendMessage: (channel: string, payload: unknown) => {
      pushes.push([channel, payload])
    }
  })
  return { root, listeners, pushes }
}

/** The tracer cache store, as the sidecar's own code opens it. */
function tracerStore(root: ReturnType<typeof layer>['root']) {
  return new Store({
    root,
    cwd: 'store_cache',
    name: 'wikigameinfo',
    clearInvalidConfig: true
  })
}

/** Delivers one shell event the way the sidecar receives it: the channel's schema, then the listener. */
function deliver(
  listeners: Map<string, (...args: unknown[]) => unknown>,
  event: Record<string, unknown>
): void {
  const parsed = sidecarInternalSendArgs.storeMirrorEvent.parse([event])
  listeners.get(STORE_MIRROR_EVENT_CHANNEL)?.(undefined, ...parsed)
}

describe('a renderer write Rust applied reaches TS readers as a changed event', () => {
  it('a changed set moves a Rust-owned store so GameLibStore.get returns the renderer value', () => {
    const { root, listeners } = layer('rust')
    const store = tracerStore(root)
    store.set('480', { title: 'Half-Life' })
    expect(store.get('480')).toEqual({ title: 'Half-Life' })

    // The renderer set 480.title through the native storeSet; Rust applied it at rev 2.
    deliver(listeners, {
      store: TRACER_KEY,
      rev: 2,
      op: 'changed',
      key: '480.title',
      valueJson: '"Half-Life 2"'
    })
    expect(store.get('480')).toEqual({ title: 'Half-Life 2' })
    expect(store.get('480.title')).toBe('Half-Life 2')
    // A second TS name over the same file reads the same cell.
    expect(tracerStore(root).get('480.title')).toBe('Half-Life 2')
  })

  it('a changed delete, replace and clear each assign state; a stale rev is dropped', () => {
    const { root, listeners } = layer('rust')
    const store = tracerStore(root)
    store.set('a', 1)
    store.set('b', 2)
    deliver(listeners, { store: TRACER_KEY, rev: 3, op: 'changed', key: 'a' })
    expect(store.has('a')).toBe(false)
    expect(store.get('b')).toBe(2)

    deliver(listeners, {
      store: TRACER_KEY,
      rev: 4,
      op: 'changed',
      valueJson: '{"z":26}'
    })
    expect(store.store).toEqual({ z: 26 })

    // Already reflected (rev at or below what the cell has seen): dropped.
    deliver(listeners, {
      store: TRACER_KEY,
      rev: 4,
      op: 'changed',
      key: 'z',
      valueJson: '0'
    })
    expect(store.get('z')).toBe(26)

    deliver(listeners, { store: TRACER_KEY, rev: 5, op: 'changed' })
    expect(store.store).toEqual({})
  })

  it('a no-op ack after a newer renderer change does not fold the older value back', () => {
    // The sidecar sends k=2 while the renderer's own k=2 reaches Rust first (rev 1); the sidecar
    // frame is then a no-op, acked with the rev it saw (1), after the change it raced. Then the
    // renderer writes k=3 (rev 2) before the sidecar reads the ack... and the ack must not fold k=2
    // over it.
    const frames: StoreFrame[] = []
    const root = createTestStoreRoot(userData, {
      storeMode: 'rust',
      // The suite answers the frames itself, in the shell's order.
      frameSink: { send: (frame) => frames.push(frame) }
    })
    const listeners = new Map<string, (...args: unknown[]) => unknown>()
    registerStoreWriteHandlers({
      ipc: {
        on: (channel: string, listener: (...args: unknown[]) => unknown) => {
          listeners.set(channel, listener)
        },
        handle: () => undefined
      } as never,
      registry: createStoreRegistry(),
      root,
      pushFrontendMessage: () => undefined
    })
    const store = tracerStore(root)
    store.set('k', 2)
    const seq = frames[0]?.seq
    expect(seq).toBeDefined()
    deliver(listeners, {
      store: TRACER_KEY,
      rev: 1,
      op: 'changed',
      key: 'k',
      valueJson: '2'
    })
    deliver(listeners, {
      store: TRACER_KEY,
      rev: 2,
      op: 'changed',
      key: 'k',
      valueJson: '3'
    })
    deliver(listeners, {
      store: TRACER_KEY,
      rev: 1,
      op: 'applied',
      originSeq: seq
    })
    expect(store.get('k')).toBe(3)
    expect(
      root.mirrors.cellFor({
        path: join(userData, 'store_cache', 'wikigameinfo.json'),
        storeKey: TRACER_KEY,
        dotPaths: true
      }).pendingCount
    ).toBe(0)
  })

  it('the channel schema takes a changed event and still refuses a malformed one', () => {
    const schema = sidecarInternalSendArgs.storeMirrorEvent
    expect(
      schema.safeParse([
        { store: TRACER_KEY, rev: 1, op: 'changed', key: 'k', valueJson: '1' }
      ]).success
    ).toBe(true)
    expect(
      schema.safeParse([{ store: TRACER_KEY, rev: 1, op: 'changed' }]).success
    ).toBe(true)
    for (const bad of [
      { store: TRACER_KEY, rev: 0, op: 'changed' },
      { store: TRACER_KEY, rev: 1, op: 'changed', originSeq: 1 },
      { store: TRACER_KEY, rev: 1, op: 'changed', key: '' },
      { store: TRACER_KEY, rev: 1, op: 'changed', valueJson: 1 },
      { store: TRACER_KEY, rev: 1, op: 'changed', extra: true }
    ]) {
      expect(schema.safeParse([bad]).success).toBe(false)
    }
  })

  it('the old storeSet handler answers only under its shell-only name', () => {
    const { listeners } = layer('rust')
    expect(listeners.has('storeSet')).toBe(false)
    expect(listeners.has(STORE_TS_SET_CHANNEL)).toBe(true)
  })
})
