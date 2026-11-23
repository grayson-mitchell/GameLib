/**
 * The TS `AbortSignal` of a fallback bottle creation becomes its cancel id (87-42): the creation registers one, the
 * signal's abort ends it, and a finished creation leaves no listener behind.
 */
import {
  RUST_ENGINE_BOTTLE_CANCEL_CREATE,
  RUST_ENGINE_BOTTLE_CREATE_FALLBACK
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { createFallbackBottleCancellable } from '../fallbackBottleCall'

const ENGINE = {
  wineBin: '/e/wine',
  wineserverBin: '/e/wineserver',
  label: 'Pinned',
  version: '1',
  dxvk: null
}

function transport(create: () => Promise<unknown>) {
  const calls: Array<[string, { cancelId?: string }]> = []
  const deps: RustInvokeDeps = {
    requestRustInvoke: ((channel: string, args: [{ cancelId?: string }]) => {
      calls.push([channel, args[0]])
      return channel === RUST_ENGINE_BOTTLE_CREATE_FALLBACK
        ? create()
        : Promise.resolve(true)
    }) as unknown as RustInvokeDeps['requestRustInvoke']
  }
  return { deps, calls }
}

describe('createFallbackBottleCancellable', () => {
  it('sends the creation with a cancel id and returns its answer', async () => {
    const t = transport(() =>
      Promise.resolve({ status: 'done', createdHere: true })
    )
    const out = await createFallbackBottleCancellable(t.deps, {
      bottleName: 'b',
      engine: ENGINE,
      fallbackSettings: {} as never
    })
    expect(out).toEqual({ status: 'done', createdHere: true })
    expect(t.calls).toHaveLength(1)
    expect(t.calls[0]?.[1].cancelId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('cancels the creation by its id when the signal aborts, once', async () => {
    let finish: (v: unknown) => void = () => undefined
    const t = transport(() => new Promise((resolve) => void (finish = resolve)))
    const ac = new AbortController()
    const pending = createFallbackBottleCancellable(t.deps, {
      bottleName: 'b',
      engine: ENGINE,
      fallbackSettings: {} as never,
      signal: ac.signal
    })
    ac.abort()
    ac.abort()
    finish({ status: 'error', errorCode: 'provision-aborted' })
    expect(await pending).toMatchObject({ errorCode: 'provision-aborted' })
    const cancels = t.calls.filter(
      ([channel]) => channel === RUST_ENGINE_BOTTLE_CANCEL_CREATE
    )
    expect(cancels).toHaveLength(1)
    expect(cancels[0]?.[1].cancelId).toBe(t.calls[0]?.[1].cancelId)
  })

  it('leaves no cancel behind once the creation has finished', async () => {
    const t = transport(() => Promise.resolve({ status: 'done' }))
    const ac = new AbortController()
    await createFallbackBottleCancellable(t.deps, {
      bottleName: 'b',
      engine: ENGINE,
      fallbackSettings: {} as never,
      signal: ac.signal
    })
    ac.abort()
    expect(t.calls).toHaveLength(1)
  })
})
