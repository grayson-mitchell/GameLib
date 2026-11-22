/**
 * @jest-environment jsdom
 */
import 'frontend/testUtils/jsdomNoticeEnv'
import { act, renderHook } from '@testing-library/react'
import { MIN_SPIN_MS, useMinimumSpin } from '../useMinimumSpin'

/**
 * Behavioural proof for useMinimumSpin (quick 261123-bbi).
 *
 * The rule from the todo: a refresh button spins for
 * max(1 s from the click, end of the refresh). The window starts on a click
 * only; a busy period nobody clicked for gets no tail.
 */
describe('useMinimumSpin (261123-bbi)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  function setup(initial: boolean, minMs?: number) {
    return renderHook(
      ({ active }: { active: boolean }) => useMinimumSpin(active, minMs),
      { initialProps: { active: initial } }
    )
  }

  const advance = (ms: number) => act(() => void jest.advanceTimersByTime(ms))

  it('exports a 1000 ms minimum', () => {
    expect(MIN_SPIN_MS).toBe(1000)
  })

  it('is not spinning with no click and active false', () => {
    const { result } = setup(false)
    expect(result.current.spinning).toBe(false)
  })

  it('spins for exactly 1 s after a click when active stays false', () => {
    const { result } = setup(false)
    act(() => result.current.onClickStart())
    expect(result.current.spinning).toBe(true)
    advance(999)
    expect(result.current.spinning).toBe(true)
    advance(1)
    expect(result.current.spinning).toBe(false)
  })

  it('keeps spinning to 1 s when the refresh ends early (300 ms)', () => {
    const { result, rerender } = setup(false)
    act(() => result.current.onClickStart())
    rerender({ active: true })
    advance(300)
    rerender({ active: false })
    expect(result.current.spinning).toBe(true)
    advance(699)
    expect(result.current.spinning).toBe(true)
    advance(1)
    expect(result.current.spinning).toBe(false)
  })

  it('stops the moment a long refresh ends, with no tail', () => {
    const { result, rerender } = setup(false)
    act(() => result.current.onClickStart())
    rerender({ active: true })
    advance(1000)
    expect(result.current.spinning).toBe(true)
    advance(1499)
    expect(result.current.spinning).toBe(true)
    advance(1)
    rerender({ active: false })
    expect(result.current.spinning).toBe(false)
  })

  it('mirrors active exactly with no click (background refresh, no tail)', () => {
    const { result, rerender } = setup(false)
    rerender({ active: true })
    expect(result.current.spinning).toBe(true)
    advance(5000)
    expect(result.current.spinning).toBe(true)
    rerender({ active: false })
    expect(result.current.spinning).toBe(false)
  })

  it('restarts the window on a second click', () => {
    const { result } = setup(false)
    act(() => result.current.onClickStart())
    advance(600)
    act(() => result.current.onClickStart())
    advance(999)
    expect(result.current.spinning).toBe(true)
    advance(1)
    expect(result.current.spinning).toBe(false)
  })

  it('clears its timer on unmount', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const { result, unmount } = setup(false)
    act(() => result.current.onClickStart())
    const before = jest.getTimerCount()
    unmount()
    expect(jest.getTimerCount()).toBe(before - 1)
    advance(2000)
    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('honours a custom minMs', () => {
    const { result } = setup(false, 250)
    act(() => result.current.onClickStart())
    advance(249)
    expect(result.current.spinning).toBe(true)
    advance(1)
    expect(result.current.spinning).toBe(false)
  })
})
