/**
 * Behavioral proof of `callOrDeclare()` (Task 1, 34.5-48). Node-env, no DOM (see
 * `src/frontend/jest.config.js` header) -- `window` is stubbed directly on `globalThis`,
 * following the precedent in
 * `src/frontend/screens/Game/GameSubMenu/__tests__/repairFailure.test.ts`.
 *
 * `resetDeclaredOnce()` runs in `beforeEach` so the dedupe assertions are independent of test
 * ordering: `resetMocks: true` in the Frontend jest config resets mock call history but never
 * resets a module's own closed-over state (the `declaredOnce` Set).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  callOrDeclare,
  DECLARED_UNAVAILABLE_MARKER,
  EOS_OVERLAY_CHANNELS,
  resetDeclaredOnce
} from '../declaredUnavailable'

function stubWindowApi(logError: jest.Mock): void {
  ;(globalThis as unknown as { window: { api: { logError: jest.Mock } } }).window =
    { api: { logError } }
}

function deleteWindow(): void {
  delete (globalThis as unknown as { window?: unknown }).window
}

describe('callOrDeclare', () => {
  let logErrorMock: jest.Mock

  beforeEach(() => {
    resetDeclaredOnce()
    logErrorMock = jest.fn()
    stubWindowApi(logErrorMock)
  })

  afterEach(() => {
    deleteWindow()
  })

  it('a resolving call returns {ok:true,value}, calls logError zero times, and leaves no dedupe entry', async () => {
    const result = await callOrDeclare({
      channel: 'getEosOverlayStatus',
      feature: 'EOS Overlay',
      deferral: 'D-03',
      call: async () => 'resolved-value'
    })

    expect(result).toEqual({ ok: true, value: 'resolved-value' })
    expect(logErrorMock).not.toHaveBeenCalled()

    // Proves "leaves no dedupe entry": a SUBSEQUENT rejection on the SAME channel must
    // still log -- if the resolving call above had (wrongly) touched the dedupe Set, this
    // would fail with zero calls instead of one.
    const rejected = await callOrDeclare({
      channel: 'getEosOverlayStatus',
      feature: 'EOS Overlay',
      deferral: 'D-03',
      call: async () => {
        throw new Error('now it rejects')
      }
    })
    expect(rejected.ok).toBe(false)
    expect(logErrorMock).toHaveBeenCalledTimes(1)
  })

  it('a rejecting call returns {ok:false, channel, reason} and never throws or rejects', async () => {
    await expect(
      callOrDeclare({
        channel: 'installEosOverlay',
        feature: 'EOS Overlay',
        deferral: 'D-03',
        call: async () => {
          throw new Error('network down')
        }
      })
    ).resolves.toMatchObject({
      ok: false,
      channel: 'installEosOverlay',
      reason: 'network down'
    })
  })

  it('logs exactly one durable line containing the marker, feature, channel and deferral id', async () => {
    await callOrDeclare({
      channel: 'removeEosOverlay',
      feature: 'EOS Overlay',
      deferral: 'D-03',
      call: async () => {
        throw new Error('nope')
      }
    })

    expect(logErrorMock).toHaveBeenCalledTimes(1)
    const [message] = logErrorMock.mock.calls[0] as [string]
    expect(message).toContain(DECLARED_UNAVAILABLE_MARKER)
    expect(message).toContain('EOS Overlay')
    expect(message).toContain('removeEosOverlay')
    expect(message).toContain('D-03')
  })

  it('dedupes a second rejecting call on the SAME channel -- logs once total', async () => {
    const spec = {
      channel: 'updateEosOverlayInfo',
      feature: 'EOS Overlay',
      deferral: 'D-03',
      call: async () => {
        throw new Error('again')
      }
    }

    const first = await callOrDeclare(spec)
    const second = await callOrDeclare(spec)

    expect(first).toMatchObject({ ok: false })
    expect(second).toMatchObject({ ok: false })
    expect(logErrorMock).toHaveBeenCalledTimes(1)
  })

  it('logs its own line for a DIFFERENT channel -- dedupe is per channel, not global', async () => {
    await callOrDeclare({
      channel: 'enableEosOverlay',
      feature: 'EOS Overlay',
      deferral: 'D-03',
      call: async () => {
        throw new Error('a')
      }
    })
    await callOrDeclare({
      channel: 'disableEosOverlay',
      feature: 'EOS Overlay',
      deferral: 'D-03',
      call: async () => {
        throw new Error('b')
      }
    })

    expect(logErrorMock).toHaveBeenCalledTimes(2)
  })

  it('resolves {ok:false} instead of throwing when window.api.logError itself throws', async () => {
    logErrorMock.mockImplementation(() => {
      throw new Error('log bridge down')
    })

    await expect(
      callOrDeclare({
        channel: 'isEosOverlayEnabled',
        feature: 'EOS Overlay',
        deferral: 'D-03',
        call: async () => {
          throw new Error('reject')
        }
      })
    ).resolves.toMatchObject({ ok: false })
  })

  it('resolves {ok:false} instead of throwing when window.api is entirely undefined', async () => {
    deleteWindow()

    await expect(
      callOrDeclare({
        channel: 'getLatestEosOverlayVersion',
        feature: 'EOS Overlay',
        deferral: 'D-03',
        call: async () => {
          throw new Error('reject')
        }
      })
    ).resolves.toMatchObject({ ok: false })
  })

  it('EOS_OVERLAY_CHANNELS has exactly 8 entries, all present in the deferred inventory bucket', () => {
    expect(EOS_OVERLAY_CHANNELS.length).toBe(8)

    const inventoryPath = join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      '.planning',
      'IPC-PORT-INVENTORY.md'
    )
    const inventory = readFileSync(inventoryPath, 'utf-8')

    for (const channel of EOS_OVERLAY_CHANNELS) {
      expect(inventory).toContain(channel)
    }
  })
})
