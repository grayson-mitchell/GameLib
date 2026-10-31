/**
 * Quick task 261031-mj9: the native-gamepad shim merges Rust-read pads into
 * `navigator.getGamepads()`, dedupes against pads WebKit also reports, and never lets a failure
 * escape. Node env, hand-built window/navigator stubs (same style as gamepadAction.test.ts).
 */
import type { NativePad } from '../api/tauriNativeGamepad'

jest.mock('@tauri-apps/api/event', () => ({ listen: jest.fn() }))

type Mod = typeof import('../api/tauriNativeGamepad')
type G = Record<string, unknown>

const g = globalThis as unknown as G
let browserPads: (Gamepad | null)[]
let handler: ((e: { payload: unknown }) => void) | undefined
let listenMock: jest.Mock
let logInfo: jest.Mock
let win: EventTarget & { api?: { logInfo: jest.Mock } }
let events: { type: string; slot: number }[]

const POWERA: NativePad = {
  index: 0,
  id: 'PowerA Pad (Vendor: 20d6 Product: a720)',
  name: 'PowerA Pad',
  vendorId: 0x20d6,
  productId: 0xa720,
  connected: true,
  buttons: [0, 1, 0.2],
  axes: [0.5, 0, 0, 0, 0, 0, 0, 0, 0, 3.28571]
}

const browserPad = (id: string): Gamepad => ({ id, index: 0, connected: true }) as unknown as Gamepad

function load(): Mod {
  let mod!: Mod
  jest.isolateModules(() => {
    mod = jest.requireActual<Mod>('../api/tauriNativeGamepad')
  })
  return mod
}

function setup(): Mod {
  const mod = load()
  mod.installNativeGamepads()
  return mod
}

const send = (pads: unknown): void => handler!({ payload: pads === undefined ? {} : { pads } })

beforeEach(() => {
  browserPads = []
  handler = undefined
  logInfo = jest.fn()
  events = []
  win = new EventTarget() as typeof win
  win.api = { logInfo }
  g.window = win
  g.navigator = { getGamepads: jest.fn(() => browserPads) }
  listenMock = jest.requireMock('@tauri-apps/api/event').listen as jest.Mock
  listenMock.mockImplementation((_name: string, cb: typeof handler) => {
    handler = cb
    return Promise.resolve(() => undefined)
  })
  for (const type of ['gamepadconnected', 'gamepaddisconnected']) {
    win.addEventListener(type, (e) => {
      events.push({ type, slot: (e as unknown as { gamepad?: { index: number } }).gamepad?.index ?? -1 })
    })
  }
})

const getPads = (): (Gamepad | null)[] => (g.navigator as { getGamepads: () => (Gamepad | null)[] }).getGamepads()

describe('merge', () => {
  it('passes browser pads through when there are no native pads', () => {
    browserPads = [browserPad('a'), null]
    setup()
    const out = getPads()
    expect(out).toHaveLength(2)
    expect(out[0]).toBe(browserPads[0])
    expect(out[1]).toBeNull()
  })

  it('places a native pad at slot 8, null-padded, with thresholded buttons', () => {
    browserPads = [browserPad('a')]
    setup()
    send([POWERA])
    const out = getPads()
    expect(out).toHaveLength(9)
    expect(out.slice(1, 8).every((p) => p === null)).toBe(true)
    const pad = out[8]!
    expect(pad.mapping).toBe('')
    expect(pad.id).toBe(POWERA.id)
    expect(pad.axes).toEqual(POWERA.axes)
    expect(pad.buttons.map((b) => b.pressed)).toEqual([false, true, false])
  })
})

describe('connect / disconnect', () => {
  it('announces once, ignores repeats, and retracts on connected:false or absence', () => {
    setup()
    send([POWERA])
    send([POWERA])
    expect(events).toEqual([{ type: 'gamepadconnected', slot: 8 }])
    send([{ ...POWERA, connected: false }])
    expect(events).toHaveLength(2)
    expect(events[1]).toEqual({ type: 'gamepaddisconnected', slot: 8 })
    expect(getPads()).toHaveLength(0)

    send([POWERA])
    send([])
    expect(events.map((e) => e.type)).toEqual([
      'gamepadconnected',
      'gamepaddisconnected',
      'gamepadconnected',
      'gamepaddisconnected'
    ])
    expect(getPads()).toHaveLength(0)
  })
})

describe('hot-plug', () => {
  it('replug at the same index after absence reconnects', () => {
    setup()
    send([POWERA])
    send([])
    send([POWERA])
    expect(events).toEqual([
      { type: 'gamepadconnected', slot: 8 },
      { type: 'gamepaddisconnected', slot: 8 },
      { type: 'gamepadconnected', slot: 8 }
    ])
    expect(getPads()[8]!.id).toBe(POWERA.id)
  })

  it('replug under a new gilrs index lands in the new slot', () => {
    setup()
    send([POWERA])
    send([])
    send([{ ...POWERA, index: 1 }])
    expect(events).toEqual([
      { type: 'gamepadconnected', slot: 8 },
      { type: 'gamepaddisconnected', slot: 8 },
      { type: 'gamepadconnected', slot: 9 }
    ])
    const pads = getPads()
    expect(pads).toHaveLength(10)
    expect(pads[8]).toBeNull()
    expect(pads[9]!.id).toBe(POWERA.id)
  })

  it('stick motion does not re-announce', () => {
    setup()
    send([POWERA])
    const axes = [...POWERA.axes]
    axes[0] = 0.75
    send([{ ...POWERA, axes }])
    expect(events.filter((e) => e.type === 'gamepadconnected')).toHaveLength(1)
    expect(getPads()[8]!.axes[0]).toBe(0.75)
  })
})

describe('dedupe', () => {
  const cases: [string, string, Partial<NativePad>][] = [
    ['rule 1 exact id', POWERA.id, {}],
    ['rule 2 padded hid id', '20d6-a720-PowerA Pad', {}],
    [
      'rule 2 unpadded hid id',
      '45e-2ea-Xbox Wireless Controller',
      { id: 'Xbox (Vendor: 045e Product: 02ea)', name: 'zzz', vendorId: 0x045e, productId: 0x02ea }
    ],
    [
      'rule 3 GameController id',
      'Xbox Wireless Controller Extended Gamepad',
      { id: 'other', name: '  xbox   WIRELESS controller ', vendorId: null, productId: null }
    ]
  ]
  it.each(cases)('%s suppresses the native copy while the browser copy exists', (_n, browserId, override) => {
    setup()
    browserPads = [browserPad(browserId)]
    send([{ ...POWERA, ...override }])
    const out = getPads()
    expect(out[8] ?? null).toBeNull()
    expect(out[0]).toBe(browserPads[0])
    browserPads = []
    expect(getPads()[8]).toBeTruthy()
  })

  it('does not suppress a different vid/pid or a different name', () => {
    setup()
    browserPads = [browserPad('1234-5678-Other'), browserPad('Another Pad Extended Gamepad')]
    send([POWERA])
    expect(getPads()[8]).toBeTruthy()
    expect(events.map((e) => e.type)).toEqual(['gamepadconnected'])
  })

  it('retracts an announced native pad when the matching browser pad connects', () => {
    setup()
    send([POWERA])
    expect(events).toEqual([{ type: 'gamepadconnected', slot: 8 }])
    browserPads = [browserPad('20d6-a720-PowerA Pad')]
    win.dispatchEvent(new Event('gamepadconnected'))
    expect(events.filter((e) => e.type === 'gamepaddisconnected')).toEqual([{ type: 'gamepaddisconnected', slot: 8 }])
    // connected, the real browser event (slot -1), one retract: the shim's own dispatches did not loop
    expect(events).toHaveLength(3)
    expect(logInfo.mock.calls.some(([m]) => String(m).startsWith('[NATIVE-GAMEPAD] suppressed'))).toBe(true)
  })

  it('never announces a native pad that is suppressed at first connect', () => {
    setup()
    browserPads = [browserPad(POWERA.id)]
    send([POWERA])
    expect(events).toHaveLength(0)
  })
})

describe('failure isolation', () => {
  it('survives listen rejecting and leaves browser pads alone', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    listenMock.mockImplementation(() => Promise.reject(new Error('nope')))
    browserPads = [browserPad('a')]
    expect(() => setup()).not.toThrow()
    await new Promise((r) => setImmediate(r))
    expect(getPads()).toEqual(browserPads)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('returns without throwing when getGamepads is missing', () => {
    g.navigator = {}
    expect(() => setup()).not.toThrow()
    expect(listenMock).not.toHaveBeenCalled()
  })

  it('ignores malformed payloads and keeps merged pads', () => {
    setup()
    send([POWERA])
    expect(() => handler!({ payload: {} })).not.toThrow()
    expect(() => handler!({ payload: { pads: null } })).not.toThrow()
    expect(() => handler!({ payload: undefined })).not.toThrow()
    expect(getPads()[8]).toBeTruthy()
  })

  it('falls back to the raw browser result if the merge throws', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    browserPads = [browserPad('a')]
    setup()
    send([POWERA])
    Object.defineProperty(browserPads[0]!, 'id', {
      get() {
        throw new Error('boom')
      }
    })
    expect(getPads()).toEqual(browserPads)
    warn.mockRestore()
  })
})
