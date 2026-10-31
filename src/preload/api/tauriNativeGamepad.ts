/**
 * Quick task 261031-mj9 (from spike 051, `.planning/spikes/051-powera-pad-drives-gamelib-macos/`):
 * merge natively-read pads into `navigator.getGamepads()` on macOS.
 *
 * WKWebView does not expose HID pads that Apple's GameController framework does not claim
 * (measured on the PowerA Advantage Wired Controller for Nintendo Switch 2: invisible in both
 * GameLib and Safari, while IOHID reads its full input). The Rust shell reads pads with gilrs
 * (`src-tauri/src/macos_native_gamepad.rs`) and emits a `native_gamepad` event whose pads are
 * already shaped like Chromium's raw-HID (`mapping: ""`) report. This module turns them into
 * Gamepad-like objects, appends them to `navigator.getGamepads()` at slot `NATIVE_SLOT_BASE +
 * index`, and dispatches `gamepadconnected` / `gamepaddisconnected`, so
 * `frontend/helpers/gamepad.ts` and its per-pad layouts run unchanged.
 *
 * Dedupe: a pad WebKit ALSO reports must never be driven twice. On every `getGamepads()` call a
 * native pad is suppressed (its slot left null) while any browser pad is the same device, see
 * `matchRule`. WebKit exposes a pad only after a press, so the native copy may be announced
 * first; a real `gamepadconnected` re-evaluates and retracts the native copy with a
 * `gamepaddisconnected`. Every branch is wrapped: a failure here must not break the browser's own
 * gamepads.
 */
import { listen } from '@tauri-apps/api/event'

const NATIVE_GAMEPAD_EVENT = 'native_gamepad'
const NATIVE_SLOT_BASE = 8
const PRESSED_THRESHOLD = 0.5

export type NativePad = {
  index: number
  id: string
  name: string
  vendorId: number | null
  productId: number | null
  connected: boolean
  buttons: number[]
  axes: number[]
}

type NativeGamepad = {
  id: string
  index: number
  connected: boolean
  mapping: GamepadMappingType
  timestamp: number
  buttons: GamepadButton[]
  axes: number[]
  vibrationActuator: null
}

type NativeEntry = { pad: NativePad; gamepad: NativeGamepad; announced: boolean; suppressed: boolean }

const nativePads = new Map<number, NativeEntry>()
// Events this module dispatched itself, so its own listener ignores them (no re-evaluation loops).
const ownEvents = new WeakSet<object>()

// WebKit HID path (`Source/WebCore/platform/gamepad/mac/HIDGamepad.cpp`):
// `hex(vendorID) + '-' + hex(productID) + '-' + productName`, lowercase, possibly unpadded.
const WEBKIT_HID_ID = /^([0-9a-f]+)-([0-9a-f]+)-/i
// WebKit GameController path (`.../cocoa/GameControllerGamepad.mm`):
// `vendorName + (extendedGamepad ? " Extended Gamepad" : " Gamepad")`, no vendor/product numbers.
const WEBKIT_GC_ID = /^(.*?) (Extended )?Gamepad$/

const normalise = (s: string): string => s.toLowerCase().trim().replace(/\s+/g, ' ')

/** Which dedupe rule (1-3, see the task plan) says `browserId` is the same device; 0 for none. */
function matchRule(browserId: string, pad: Pick<NativePad, 'id' | 'name' | 'vendorId' | 'productId'>): 0 | 1 | 2 | 3 {
  if (browserId === pad.id) return 1
  const hid = WEBKIT_HID_ID.exec(browserId)
  if (hid && pad.vendorId != null && pad.productId != null) {
    if (parseInt(hid[1], 16) === pad.vendorId && parseInt(hid[2], 16) === pad.productId) return 2
  }
  const gc = WEBKIT_GC_ID.exec(browserId)
  if (gc && pad.name && normalise(gc[1]) === normalise(pad.name)) return 3
  return 0
}

function findBrowserMatch(browserPads: (Gamepad | null)[], pad: NativePad): { id: string; rule: number } | null {
  for (const bp of browserPads) {
    if (!bp || typeof bp.id !== 'string') continue
    const rule = matchRule(bp.id, pad)
    if (rule) return { id: bp.id, rule }
  }
  return null
}

function toGamepad(pad: NativePad): NativeGamepad {
  const buttons = Array.isArray(pad.buttons) ? pad.buttons : []
  return {
    id: pad.id,
    index: NATIVE_SLOT_BASE + pad.index,
    connected: pad.connected,
    mapping: '',
    timestamp: performance.now(),
    buttons: buttons.map((value) => ({
      value,
      pressed: value > PRESSED_THRESHOLD,
      touched: value > PRESSED_THRESHOLD
    })),
    axes: Array.isArray(pad.axes) ? pad.axes : [],
    vibrationActuator: null
  }
}

function dispatchGamepadEvent(type: 'gamepadconnected' | 'gamepaddisconnected', gamepad: NativeGamepad): void {
  // `new GamepadEvent(...)` rejects a non-native Gamepad, so carry it on a plain Event.
  const event = new Event(type)
  Object.defineProperty(event, 'gamepad', { value: gamepad })
  ownEvents.add(event)
  window.dispatchEvent(event)
}

function announce(entry: NativeEntry): void {
  entry.announced = true
  window.api?.logInfo?.(`[NATIVE-GAMEPAD] connected slot=${entry.gamepad.index} id=${JSON.stringify(entry.gamepad.id)}`)
  dispatchGamepadEvent('gamepadconnected', entry.gamepad)
}

function retract(entry: NativeEntry): void {
  entry.announced = false
  dispatchGamepadEvent('gamepaddisconnected', entry.gamepad)
}

/** Recompute each native pad's suppression against the browser pads and keep announcements paired. */
function reconcile(browserGetGamepads: () => ArrayLike<Gamepad | null>): void {
  const browserPads = Array.from(browserGetGamepads())
  for (const entry of nativePads.values()) {
    const match = findBrowserMatch(browserPads, entry.pad)
    const wasSuppressed = entry.suppressed
    entry.suppressed = match !== null
    if (match && !wasSuppressed) {
      window.api?.logInfo?.(
        `[NATIVE-GAMEPAD] suppressed slot=${entry.gamepad.index} id=${JSON.stringify(entry.gamepad.id)} matched=rule${match.rule}:${JSON.stringify(match.id)}`
      )
    }
    if (match && entry.announced) retract(entry)
    else if (!match && !entry.announced) announce(entry)
  }
}

function onNativeState(payload: unknown, browserGetGamepads: () => ArrayLike<Gamepad | null>): void {
  const pads = (payload as { pads?: unknown } | null | undefined)?.pads
  if (!Array.isArray(pads)) return
  const seen = new Set<number>()
  for (const raw of pads as NativePad[]) {
    if (!raw || typeof raw.index !== 'number') continue
    seen.add(raw.index)
    const previous = nativePads.get(raw.index)
    if (!raw.connected) {
      if (previous) {
        nativePads.delete(raw.index)
        if (previous.announced) retract(previous)
      }
      continue
    }
    const gamepad = toGamepad(raw)
    if (previous) {
      previous.pad = raw
      previous.gamepad = gamepad
    } else {
      nativePads.set(raw.index, { pad: raw, gamepad, announced: false, suppressed: false })
    }
  }
  for (const [index, previous] of Array.from(nativePads)) {
    if (!seen.has(index)) {
      nativePads.delete(index)
      if (previous.announced) retract(previous)
    }
  }
  reconcile(browserGetGamepads)
}

export function installNativeGamepads(): void {
  try {
    if (typeof navigator?.getGamepads !== 'function') return
    const browserGetGamepads = navigator.getGamepads.bind(navigator)
    navigator.getGamepads = (): (Gamepad | null)[] => {
      const browserPads = Array.from(browserGetGamepads())
      try {
        if (nativePads.size === 0) return browserPads
        const merged: (Gamepad | null)[] = browserPads.slice()
        for (const entry of nativePads.values()) {
          if (findBrowserMatch(browserPads, entry.pad)) continue
          while (merged.length <= entry.gamepad.index) merged.push(null)
          merged[entry.gamepad.index] = entry.gamepad as unknown as Gamepad
        }
        return merged
      } catch (error) {
        console.warn('[tauriNativeGamepad] merge failed:', error)
        return browserPads
      }
    }
    const onBrowserChange = (event: Event): void => {
      if (ownEvents.has(event)) return
      try {
        reconcile(browserGetGamepads)
      } catch (error) {
        console.warn('[tauriNativeGamepad] reconcile failed:', error)
      }
    }
    window.addEventListener('gamepadconnected', onBrowserChange)
    window.addEventListener('gamepaddisconnected', onBrowserChange)
    listen<{ pads: NativePad[] }>(NATIVE_GAMEPAD_EVENT, (event) => {
      try {
        onNativeState(event?.payload, browserGetGamepads)
      } catch (error) {
        console.warn('[tauriNativeGamepad] state update failed:', error)
      }
    }).catch((error) => {
      console.warn('[tauriNativeGamepad] listen failed:', error)
    })
  } catch (error) {
    console.warn('[tauriNativeGamepad] install failed:', error)
  }
}
