/**
 * Behavioural tests for `attachHumbleLoginChromeCss` (quick task 260822-di1, Task 3) against a
 * hand-rolled fake webview object -- no jsdom, no react. Plus a source-text structural gate on
 * `HumbleLoginSurface.tsx`'s wiring, mirroring `HumbleLoginWatchErrorHandling.test.ts`'s own
 * precedent (nothing in that file can be rendered without jsdom, which is not installed here).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import {
  attachHumbleLoginChromeCss,
  HumbleLoginChromeCssWebview
} from '../components/humbleLoginChromeCss'
import { HUMBLE_LOGIN_CHROME_CSS } from 'common/humble/loginChromeCss'

/** Records (type, listener) pairs so tests can fire an event by invoking the recorded listener directly. */
function makeFakeWebview(overrides: {
  getURL?: () => string
  insertCSS?: (css: string) => Promise<string>
}): {
  webview: HumbleLoginChromeCssWebview
  fire: (type: string) => void
  listenerFor: (type: string) => (() => void) | undefined
  insertCSSCalls: string[]
} {
  const listeners = new Map<string, () => void>()
  const insertCSSCalls: string[] = []

  const webview: HumbleLoginChromeCssWebview = {
    getURL: overrides.getURL ?? (() => ''),
    insertCSS: (css: string) => {
      insertCSSCalls.push(css)
      return overrides.insertCSS
        ? overrides.insertCSS(css)
        : Promise.resolve('')
    },
    addEventListener: (type, listener) => {
      listeners.set(type, listener)
    },
    removeEventListener: (type, listener) => {
      if (listeners.get(type) === listener) {
        listeners.delete(type)
      }
    }
  }

  return {
    webview,
    fire: (type: string) => {
      const listener = listeners.get(type)
      listener?.()
    },
    listenerFor: (type: string) => listeners.get(type),
    insertCSSCalls
  }
}

describe('attachHumbleLoginChromeCss', () => {
  test('registers exactly one listener, of type dom-ready', () => {
    const registered: Array<{ type: string; listener: () => void }> = []
    const webview: HumbleLoginChromeCssWebview = {
      getURL: () => '',
      insertCSS: () => Promise.resolve(''),
      addEventListener: (type, listener) => {
        registered.push({ type, listener })
      },
      removeEventListener: () => undefined
    }
    attachHumbleLoginChromeCss(webview)
    expect(registered.length).toBe(1)
    expect(registered[0].type).toBe('dom-ready')
  })

  test('firing dom-ready on a qualifying humblebundle.com URL calls insertCSS exactly once with HUMBLE_LOGIN_CHROME_CSS', () => {
    const { webview, fire, insertCSSCalls } = makeFakeWebview({
      getURL: () => 'https://www.humblebundle.com/login'
    })
    attachHumbleLoginChromeCss(webview)
    fire('dom-ready')
    expect(insertCSSCalls).toEqual([HUMBLE_LOGIN_CHROME_CSS])
  })

  test('firing dom-ready TWICE calls insertCSS twice (navigation-reapply case, idempotence would be a bug)', () => {
    const { webview, fire, insertCSSCalls } = makeFakeWebview({
      getURL: () => 'https://www.humblebundle.com/login'
    })
    attachHumbleLoginChromeCss(webview)
    fire('dom-ready')
    fire('dom-ready')
    expect(insertCSSCalls.length).toBe(2)
  })

  test('firing dom-ready on accounts.google.com calls insertCSS zero times', () => {
    const { webview, fire, insertCSSCalls } = makeFakeWebview({
      getURL: () => 'https://accounts.google.com/signin'
    })
    attachHumbleLoginChromeCss(webview)
    fire('dom-ready')
    expect(insertCSSCalls.length).toBe(0)
  })

  test('firing dom-ready on the look-alike host humblebundle.com.evil.example calls insertCSS zero times', () => {
    const { webview, fire, insertCSSCalls } = makeFakeWebview({
      getURL: () => 'https://humblebundle.com.evil.example/login'
    })
    attachHumbleLoginChromeCss(webview)
    fire('dom-ready')
    expect(insertCSSCalls.length).toBe(0)
  })

  test('getURL() returning an empty string calls insertCSS zero times and does not throw', () => {
    const { webview, fire, insertCSSCalls } = makeFakeWebview({
      getURL: () => ''
    })
    attachHumbleLoginChromeCss(webview)
    expect(() => fire('dom-ready')).not.toThrow()
    expect(insertCSSCalls.length).toBe(0)
  })

  test('getURL() throwing does not propagate', () => {
    const { webview, fire, insertCSSCalls } = makeFakeWebview({
      getURL: () => {
        throw new Error('getURL exploded')
      }
    })
    attachHumbleLoginChromeCss(webview)
    expect(() => fire('dom-ready')).not.toThrow()
    expect(insertCSSCalls.length).toBe(0)
  })

  test('insertCSS returning a rejected promise does not produce an unhandled rejection and does not throw', async () => {
    const { webview, fire } = makeFakeWebview({
      getURL: () => 'https://www.humblebundle.com/login',
      insertCSS: () => Promise.reject(new Error('insertCSS rejected'))
    })
    attachHumbleLoginChromeCss(webview)
    expect(() => fire('dom-ready')).not.toThrow()
    // Await a microtask tick so the rejection has a chance to surface as unhandled if the
    // implementation did not `.catch()` it -- jest/Node would otherwise report it separately.
    await Promise.resolve()
    await Promise.resolve()
  })

  test('insertCSS throwing SYNCHRONOUSLY does not propagate', () => {
    const { webview, fire } = makeFakeWebview({
      getURL: () => 'https://www.humblebundle.com/login',
      insertCSS: () => {
        throw new Error('insertCSS threw synchronously')
      }
    })
    attachHumbleLoginChromeCss(webview)
    expect(() => fire('dom-ready')).not.toThrow()
  })

  test('the returned cleanup removes the same listener reference that was added', () => {
    let addedListener: (() => void) | undefined
    let removedType: string | undefined
    let removedListener: (() => void) | undefined
    const webview: HumbleLoginChromeCssWebview = {
      getURL: () => '',
      insertCSS: () => Promise.resolve(''),
      addEventListener: (_type, listener) => {
        addedListener = listener
      },
      removeEventListener: (type, listener) => {
        removedType = type
        removedListener = listener
      }
    }
    const cleanup = attachHumbleLoginChromeCss(webview)
    cleanup()
    expect(removedType).toBe('dom-ready')
    expect(removedListener).toBe(addedListener)
  })
})

describe('HumbleLoginSurface.tsx source-text gate (no jsdom installed)', () => {
  const surfacePath = join(
    __dirname,
    '..',
    'components',
    'HumbleLoginSurface.tsx'
  )
  const source = stripSourceComments(readFileSync(surfacePath, 'utf-8'))

  test('imports and calls attachHumbleLoginChromeCss', () => {
    expect(source).toContain(
      "import { attachHumbleLoginChromeCss } from './humbleLoginChromeCss'"
    )
    expect(source).toContain('attachHumbleLoginChromeCss(')
  })

  test('the call sits inside a useLayoutEffect whose dependency array is [webviewRef.current]', () => {
    const callIdx = source.indexOf('attachHumbleLoginChromeCss(')
    expect(callIdx).toBeGreaterThan(-1)
    const before = source.slice(0, callIdx)
    const lastEffectStart = before.lastIndexOf('useLayoutEffect(() => {')
    expect(lastEffectStart).toBeGreaterThan(-1)
    const effectEnd = source.indexOf(
      '}, [webviewRef.current])',
      lastEffectStart
    )
    expect(effectEnd).toBeGreaterThan(callIdx)
  })

  test('the file contains no literal insertCSS call of its own -- the wiring lives in the helper', () => {
    expect(source).not.toContain('insertCSS(')
  })

  test("no bare 'dom-ready' string appears outside the helper import -- the effect delegates", () => {
    const withoutImportLine = source
      .split('\n')
      .filter((line) => !line.includes('humbleLoginChromeCss'))
      .join('\n')
    expect(withoutImportLine).not.toContain("'dom-ready'")
  })

  test('the pre-existing D-17 did-navigate / did-navigate-in-page effect is unchanged', () => {
    expect(source).toContain("'did-navigate'")
    expect(source).toContain("'did-navigate-in-page'")
    expect(source).toContain('window.api.humbleLoginNavigated()')
  })
})
