/**
 * The Steam side of the pinned engine (Phase 87, 87-56a, D-24): the reader answers what the twin answers for the
 * `<toolsPath>/steam-engines` root, over a real directory.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  ENGINE_PINS,
  isPinnedEngineInstalled,
  pinnedEnginePaths
} from 'backend/enginewine/twin'
import {
  RUST_ENGINE_CANCEL,
  RUST_ENGINE_FALLBACK_ENSURE
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import {
  ensurePinnedEngineThroughRust,
  pinnedEngineReader
} from '../engine/pinnedEngine'

describe('pinnedEngineReader', () => {
  let toolsPath: string
  beforeEach(() => {
    toolsPath = mkdtempSync(join(tmpdir(), 'pinned-engine-reader-'))
  })
  afterEach(() => {
    rmSync(toolsPath, { recursive: true, force: true })
  })

  it('names the shared root under the tools path', () => {
    expect(pinnedEngineReader({ toolsPath }).pinnedEngineRoot()).toBe(
      join(toolsPath, 'steam-engines')
    )
  })

  it('answers false for an engine that is not installed, as the twin does', () => {
    const pin = ENGINE_PINS.current
    const reader = pinnedEngineReader({ toolsPath })
    expect(reader.isPinnedEngineInstalled(pin)).toBe(false)
    expect(isPinnedEngineInstalled(join(toolsPath, 'steam-engines'), pin)).toBe(
      false
    )
  })

  it('answers true for a fully stamped install, equal to the twin', () => {
    const pin = ENGINE_PINS.current
    const root = join(toolsPath, 'steam-engines')
    const p = pinnedEnginePaths(root, pin)
    mkdirSync(join(p.wineDir, 'Contents', 'Resources', 'wine', 'bin'), {
      recursive: true
    })
    writeFileSync(p.wineBin, '')
    writeFileSync(p.wineserverBin, '')
    mkdirSync(join(p.dxvkDir, 'x32'), { recursive: true })
    mkdirSync(join(p.dxvkDir, 'x64'), { recursive: true })
    for (const [dir, artifact] of [
      [p.wineDir, pin.wine],
      [p.dxvkDir, pin.dxvk]
    ] as const) {
      writeFileSync(
        join(dir, '.gamelib-pin.json'),
        JSON.stringify({ sha256: artifact.sha256 })
      )
    }
    const reader = pinnedEngineReader({ toolsPath })
    expect(reader.isPinnedEngineInstalled(pin)).toBe(
      isPinnedEngineInstalled(root, pin)
    )
    expect(reader.isPinnedEngineInstalled(pin)).toBe(true)
  })
})

const ENGINE = {
  wineBin: '/e/wine',
  wineserverBin: '/e/wineserver',
  label: 'Wine-Staging',
  version: '11',
  dxvk: { dir: '/e/dxvk', version: '1.10' }
}

type Call = [string, unknown[]]

function transport(
  answer: (channel: string, args: unknown[]) => Promise<unknown>
): RustInvokeDeps & { calls: Call[] } {
  const calls: Call[] = []
  return {
    calls,
    requestRustInvoke: ((channel: string, args: unknown[]) => {
      calls.push([channel, args])
      return answer(channel, args)
    }) as unknown as RustInvokeDeps['requestRustInvoke']
  }
}

const PIN = ENGINE_PINS.current

describe('ensurePinnedEngineThroughRust', () => {
  it('sends the pin id, the game and a cancel id, and resolves the engine Rust answered', async () => {
    const deps = transport(() => Promise.resolve({ ok: true, engine: ENGINE }))
    await expect(
      ensurePinnedEngineThroughRust(deps, {
        pin: PIN,
        appName: '620',
        runner: 'steam'
      })
    ).resolves.toEqual({ ok: true, engine: ENGINE })
    expect(deps.calls).toEqual([
      [
        RUST_ENGINE_FALLBACK_ENSURE,
        [
          {
            pinId: PIN.id,
            appName: '620',
            runner: 'steam',
            cancelId: expect.stringMatching(/^ee-[0-9a-f-]{36}$/)
          }
        ]
      ]
    ])
  })

  it('keeps a failure and a cancel as answers, never rejecting', async () => {
    const failed = {
      ok: false,
      aborted: false,
      reason: 'offline',
      error: 'offline no network'
    }
    await expect(
      ensurePinnedEngineThroughRust(
        transport(() => Promise.resolve(failed)),
        { pin: PIN, appName: '620', runner: 'steam' }
      )
    ).resolves.toEqual(failed)
    const aborted = { ...failed, aborted: true, reason: 'aborted' }
    await expect(
      ensurePinnedEngineThroughRust(
        transport(() => Promise.resolve(aborted)),
        { pin: PIN, appName: '620', runner: 'steam' }
      )
    ).resolves.toEqual(aborted)
  })

  it('answers download-failed, clears the status and never rejects when the call fails or the reply is unreadable', async () => {
    for (const answer of [
      () => Promise.reject(new Error('engine_fallback_ensure:not-ready')),
      () => Promise.resolve({ ok: true }),
      () => Promise.resolve('nope')
    ]) {
      const clearStatus = jest.fn()
      const result = await ensurePinnedEngineThroughRust(transport(answer), {
        pin: PIN,
        appName: '620',
        runner: 'steam',
        clearStatus
      })
      expect(result).toMatchObject({
        ok: false,
        aborted: false,
        reason: 'download-failed'
      })
      expect(clearStatus).toHaveBeenCalledTimes(1)
    }
  })

  it('answers aborted with no request when the signal is already aborted', async () => {
    const deps = transport(() => Promise.reject(new Error('must not be sent')))
    const clearStatus = jest.fn()
    const controller = new AbortController()
    controller.abort()
    await expect(
      ensurePinnedEngineThroughRust(deps, {
        pin: PIN,
        appName: '620',
        runner: 'steam',
        signal: controller.signal,
        clearStatus
      })
    ).resolves.toMatchObject({ ok: false, aborted: true })
    expect(deps.calls).toEqual([])
    expect(clearStatus).toHaveBeenCalledTimes(1)
  })

  it('sends engine_cancel for the run when the signal aborts, re-sending while Rust has not registered it, bounded and with no timer', async () => {
    const controller = new AbortController()
    let cancelId = ''
    let cancels = 0
    let finish!: (reply: unknown) => void
    const deps = transport((channel, args) => {
      if (channel === RUST_ENGINE_FALLBACK_ENSURE) {
        cancelId = (args[0] as { cancelId: string }).cancelId
        return new Promise((resolve) => {
          finish = resolve
        })
      }
      expect(channel).toBe(RUST_ENGINE_CANCEL)
      expect(args).toEqual([{ cancelId }])
      cancels += 1
      // Rust has no run for the id yet on the first two asks, then it has.
      return Promise.resolve(cancels > 2)
    })
    const pending = ensurePinnedEngineThroughRust(deps, {
      pin: PIN,
      appName: '620',
      runner: 'steam',
      signal: controller.signal
    })
    controller.abort()
    // The cancel loop is round trips only: let it settle, then answer the download as Rust does.
    for (let i = 0; i < 10; i++) await Promise.resolve()
    expect(cancels).toBe(3)
    finish({ ok: false, aborted: true, reason: 'aborted', error: 'aborted' })
    await expect(pending).resolves.toMatchObject({ ok: false, aborted: true })
  })

  it('stops re-sending a cancel that is never registered after five attempts', async () => {
    const controller = new AbortController()
    let cancels = 0
    let finish!: (reply: unknown) => void
    const deps = transport((channel) => {
      if (channel === RUST_ENGINE_FALLBACK_ENSURE) {
        return new Promise((resolve) => {
          finish = resolve
        })
      }
      cancels += 1
      return Promise.resolve(false)
    })
    const pending = ensurePinnedEngineThroughRust(deps, {
      pin: PIN,
      appName: '620',
      runner: 'steam',
      signal: controller.signal
    })
    controller.abort()
    for (let i = 0; i < 30; i++) await Promise.resolve()
    expect(cancels).toBe(5)
    finish({ ok: true, engine: ENGINE })
    await pending
  })
})
