import { scrollCardIntoView } from '../scrollCardIntoView'

/*
 * Quick 261031-nwz: controller focus reveals a library card minimally. The
 * container is `main.content` (top 42, bottom 722 in the live measurement);
 * a card scrolls only when it is cut by an edge, and only far enough to show
 * it whole with REVEAL_CLEARANCE (12px) to spare.
 */

type Rect = { top: number; bottom: number }

function setup(cardRect: Rect, scrollTop = 133) {
  const container = {
    scrollTop,
    getBoundingClientRect: () => ({ top: 42, bottom: 722 }),
    scrollTo: jest.fn()
  }
  const card = { getBoundingClientRect: () => cardRect }
  const link = { closest: (sel: string) => (sel === '.gameCard' ? card : null) }
  ;(globalThis as unknown as { document: unknown }).document = {
    querySelector: () => container,
    body: container
  }
  scrollCardIntoView({ target: link } as unknown as FocusEvent)
  return container
}

describe('scrollCardIntoView (quick 261031-nwz minimal reveal)', () => {
  it('does not scroll a fully visible card on the top row (the old 100px band drifted it down)', () => {
    expect(setup({ top: 60, bottom: 256 }).scrollTo).not.toHaveBeenCalled()
  })

  it('does not scroll a fully visible card on the bottom row (the old band drifted it up)', () => {
    expect(setup({ top: 500, bottom: 700 }).scrollTo).not.toHaveBeenCalled()
  })

  it('scrolls a card cut at the bottom just far enough to show it with clearance', () => {
    const c = setup({ top: 600, bottom: 800 })
    expect(c.scrollTo).toHaveBeenCalledWith({
      top: 133 + (800 - (722 - 12))
    })
  })

  it('scrolls a card cut at the top just far enough to show it with clearance', () => {
    const c = setup({ top: -15, bottom: 181 })
    expect(c.scrollTo).toHaveBeenCalledWith({
      top: 133 + (-15 - (42 + 12))
    })
  })

  it('ignores a subpixel remainder once the card is revealed', () => {
    expect(setup({ top: 500, bottom: 710.87 }).scrollTo).not.toHaveBeenCalled()
  })

  it('measures the .gameCard, not the focused link, so the focus scale counts', () => {
    // the card (scaled) pokes past the bottom clearance even though the link would not
    const c = setup({ top: 520, bottom: 716 })
    expect(c.scrollTo).toHaveBeenCalledWith({
      top: 133 + (716 - 710)
    })
  })
})
