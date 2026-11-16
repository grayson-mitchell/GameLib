/**
 * Side-effect module for jsdom component tests. Import it FIRST in the test
 * file, before anything that loads react-dom or the stores.
 *
 * `frontend/testUtils/tauriWindow` cannot be reused here: it REPLACES
 * `globalThis.window` with a plain object, which under jsdom would clobber
 * `document`. This one only extends the existing jsdom window.
 */
import { TextDecoder, TextEncoder } from 'util'

Object.assign(window, {
  __TAURI_INTERNALS__: {
    invoke: () => Promise.resolve(undefined),
    transformCallback: () => 0,
    unregisterCallback: () => undefined,
    metadata: {
      currentWindow: { label: 'main' },
      currentWebview: { label: 'main' }
    }
  }
})

// React DOM picks its animationend event name when it is first imported. jsdom
// has no AnimationEvent, so without this React listens for a vendor-prefixed
// name and fireEvent.animationEnd never reaches onAnimationEnd.
if (
  typeof (window as { AnimationEvent?: unknown }).AnimationEvent === 'undefined'
) {
  class AnimationEvent extends Event {
    animationName: string
    elapsedTime: number
    pseudoElement: string
    constructor(type: string, init: AnimationEventInit = {}) {
      super(type, init)
      this.animationName = init.animationName ?? ''
      this.elapsedTime = init.elapsedTime ?? 0
      this.pseudoElement = init.pseudoElement ?? ''
    }
  }
  Object.assign(window, { AnimationEvent })
  Object.assign(globalThis, { AnimationEvent })
}

// react-router needs these at import; jsdom lacks them.
Object.assign(globalThis, { TextEncoder, TextDecoder })

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

export {}
