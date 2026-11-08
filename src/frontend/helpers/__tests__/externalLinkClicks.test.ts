/**
 * Phase 72 D-10: the renderer click handler that replaces the opener plugin's
 * injected link script. Node jest project (no jsdom), so the document, anchors
 * and events are stubs; what is proved is the routing decision, not browser
 * event dispatch.
 */
import { installExternalLinkClickHandler } from '../externalLinkClicks'

interface FakeAnchor {
  href: string
  target: string
}
interface FakeEvent {
  target: { closest: (sel: string) => FakeAnchor | null }
  defaultPrevented: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  preventDefault: jest.Mock
}

function makeDoc() {
  const listeners: Array<(e: FakeEvent) => void> = []
  const doc = {
    addEventListener: jest.fn((type: string, fn: (e: FakeEvent) => void) => {
      if (type === 'click') listeners.push(fn)
    })
  }
  return {
    doc: doc as unknown as Document,
    listeners,
    spy: doc.addEventListener
  }
}

function click(
  anchor: FakeAnchor | null,
  mods: Partial<FakeEvent> = {}
): FakeEvent {
  return {
    target: { closest: () => anchor },
    defaultPrevented: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    preventDefault: jest.fn(),
    ...mods
  }
}

describe('installExternalLinkClickHandler', () => {
  let open: jest.Mock
  beforeEach(() => {
    open = jest.fn()
    ;(globalThis as unknown as { window: unknown }).window = {
      api: { openExternalUrl: open }
    }
  })

  function setup() {
    const { doc, listeners } = makeDoc()
    installExternalLinkClickHandler(doc)
    const listener = listeners[0]
    if (!listener) throw new Error('no listener registered')
    return listener
  }

  test('target=_blank https link is routed and default prevented', () => {
    const fire = setup()
    const e = click({ href: 'https://x.test/', target: '_blank' })
    fire(e)
    expect(open).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith('https://x.test/')
    expect(e.preventDefault).toHaveBeenCalled()
  })

  test.each(['ctrlKey', 'metaKey', 'shiftKey'] as const)(
    '%s click on a plain link is routed',
    (mod) => {
      const fire = setup()
      fire(click({ href: 'https://x.test/', target: '' }, { [mod]: true }))
      expect(open).toHaveBeenCalledWith('https://x.test/')
    }
  )

  test('plain click without target or modifier is not intercepted', () => {
    const fire = setup()
    const e = click({ href: 'https://x.test/', target: '' })
    fire(e)
    expect(open).not.toHaveBeenCalled()
    expect(e.preventDefault).not.toHaveBeenCalled()
  })

  test('a child element inside the anchor resolves through closest(a)', () => {
    const fire = setup()
    fire(click({ href: 'https://x.test/a', target: '_blank' }))
    expect(open).toHaveBeenCalledWith('https://x.test/a')
  })

  test.each([
    'javascript:alert(1)',
    'file:///etc/passwd',
    'steam://rungameid/1',
    '#/library',
    '/library'
  ])('non-routed href %s is not passed on', (href) => {
    const fire = setup()
    fire(click({ href, target: '_blank' }, { ctrlKey: true }))
    expect(open).not.toHaveBeenCalled()
  })

  test.each(['mailto:a@b.test', 'tel:+15550100'])(
    '%s with target=_blank is routed',
    (href) => {
      const fire = setup()
      fire(click({ href, target: '_blank' }))
      expect(open).toHaveBeenCalledWith(href)
    }
  )

  test('already defaultPrevented events are ignored', () => {
    const fire = setup()
    fire(
      click(
        { href: 'https://x.test/', target: '_blank' },
        { defaultPrevented: true }
      )
    )
    expect(open).not.toHaveBeenCalled()
  })

  test('click outside any anchor is ignored', () => {
    const fire = setup()
    fire(click(null))
    expect(open).not.toHaveBeenCalled()
  })

  test('installing twice registers one listener', () => {
    const { doc, spy } = makeDoc()
    installExternalLinkClickHandler(doc)
    installExternalLinkClickHandler(doc)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
