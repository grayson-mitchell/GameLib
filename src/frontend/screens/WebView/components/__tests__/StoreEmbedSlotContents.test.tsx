/**
 * Tests for `StoreEmbedSlotContents` (Phase 50 review finding 6, D-06/D-10/D-11/D-19).
 *
 * No jsdom / react-test-renderer in this project (see `src/frontend/jest.config.js`'s
 * docstring) -- invoked directly as a plain function, and the returned element's `type` and
 * `props` are inspected without rendering the children.
 */

import type { ReactElement } from 'react'

import StoreEmbedSlotContents from '../StoreEmbedSlotContents'
import StoreEmbedPlaceholder from '../StoreEmbedPlaceholder'
import WebviewUnavailablePanel from '../WebviewUnavailablePanel'

type SlotProps = Parameters<typeof StoreEmbedSlotContents>[0]

const EPIC_URL = 'https://store.epicgames.com/en-US/'

function renderSlot(overrides: Partial<SlotProps>): ReactElement | null {
  return StoreEmbedSlotContents({
    suppressed: false,
    isEpicSurface: false,
    challenged: false,
    url: EPIC_URL,
    onTryAgain: jest.fn(),
    ...overrides
  }) as ReactElement | null
}

describe('StoreEmbedSlotContents (finding 6)', () => {
  it('a challenged Epic surface renders ONLY the epic-challenged panel -- no placeholder above it', () => {
    const onTryAgain = jest.fn()
    const element = renderSlot({
      isEpicSurface: true,
      challenged: true,
      onTryAgain
    })

    // A single element, not a fragment/array: nothing shares the slot with the panel.
    expect(element).not.toBeNull()
    expect(Array.isArray(element)).toBe(false)
    expect(element?.type).toBe(WebviewUnavailablePanel)
    expect(element?.props).toEqual({
      reason: 'epic-challenged',
      url: EPIC_URL,
      onTryAgain
    })
  })

  it('also wins over suppression -- the panel is what the user needs once the overlay closes', () => {
    const element = renderSlot({
      suppressed: true,
      isEpicSurface: true,
      challenged: true
    })
    expect(element?.type).toBe(WebviewUnavailablePanel)
  })

  it('an unchallenged Epic surface renders the placeholder (D-06)', () => {
    expect(renderSlot({ isEpicSurface: true })?.type).toBe(
      StoreEmbedPlaceholder
    )
  })

  it('a suppressed Tauri-embed store renders the placeholder (D-19)', () => {
    expect(renderSlot({ suppressed: true })?.type).toBe(StoreEmbedPlaceholder)
  })

  it('an unsuppressed Tauri-embed store renders nothing', () => {
    expect(renderSlot({})).toBeNull()
  })

  it('is gated on the Epic surface: a stray challenged flag off it never shows the Epic panel', () => {
    expect(renderSlot({ challenged: true })).toBeNull()
    expect(renderSlot({ challenged: true, suppressed: true })?.type).toBe(
      StoreEmbedPlaceholder
    )
  })
})
