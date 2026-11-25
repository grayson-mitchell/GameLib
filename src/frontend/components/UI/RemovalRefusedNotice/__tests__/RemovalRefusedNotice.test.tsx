/**
 * @jest-environment jsdom
 */
import 'frontend/testUtils/jsdomNoticeEnv'

import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRemovalRefusedNotice } from 'frontend/state/RemovalRefusedNotice'
import {
  REMOVAL_REFUSAL_KINDS,
  type RemovalRefusalKind,
  type RemovalRefusalPayload
} from 'common/types/removalRefusal'
import { REMOVAL_REASONS } from 'common/types/safety'
import RemovalRefusedNotice from '../index'

// Real i18next with no catalogs: t() returns the default text, so the copy is the shipped English.
void i18next.use(initReactI18next).init({
  lng: 'en',
  resources: {},
  initImmediate: false,
  interpolation: { escapeValue: false }
})

const push = (p: RemovalRefusalPayload) =>
  act(() => useRemovalRefusedNotice.getState().push(p))

const nested: RemovalRefusalPayload = {
  kind: 'uninstall',
  outcome: 'refused',
  reason: 'nested-known-install',
  title: 'Half-Life 2',
  otherTitle: 'Portal'
}

beforeEach(() => {
  useRemovalRefusedNotice.setState({ notices: [], nextId: 1 })
})
afterEach(() => {
  cleanup()
  jest.useRealTimers()
})

describe('RemovalRefusedNotice', () => {
  it('renders nothing when no refusal is queued', () => {
    const { container } = render(<RemovalRefusedNotice />)
    expect(container.firstChild).toBeNull()
  })

  it('names the game, the other game and that nothing was deleted', () => {
    render(<RemovalRefusedNotice />)
    push(nested)
    expect(screen.getByText("Couldn't uninstall Half-Life 2")).toBeTruthy()
    expect(
      screen.getByText('Portal is installed inside this folder.')
    ).toBeTruthy()
    expect(screen.getByText('Nothing was deleted.')).toBeTruthy()
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('dismiss leaves through the slot phases and then drops the notice from the store', () => {
    render(<RemovalRefusedNotice />)
    push(nested)
    fireEvent.click(screen.getByLabelText('Dismiss'))
    const toast = screen
      .getByText("Couldn't uninstall Half-Life 2")
      .closest('.noticeStackToast')
    expect(toast?.className).toContain('noticeStackToast--leaving')
    // The store keeps the notice until the exit finishes.
    expect(useRemovalRefusedNotice.getState().notices).toHaveLength(1)
    fireEvent.animationEnd(toast as Element, {
      animationName: 'noticeStackToastOut'
    })
    const slot = document.querySelector('.noticeStackSlot--collapsing')
    expect(slot).not.toBeNull()
    fireEvent.animationEnd(slot as Element, {
      animationName: 'noticeStackSlotClose'
    })
    expect(useRemovalRefusedNotice.getState().notices).toEqual([])
    expect(screen.queryByText("Couldn't uninstall Half-Life 2")).toBeNull()
  })

  it('falls back to removing the notice when no animationend arrives', () => {
    jest.useFakeTimers()
    render(<RemovalRefusedNotice />)
    push(nested)
    fireEvent.click(screen.getByLabelText('Dismiss'))
    act(() => void jest.advanceTimersByTime(600))
    act(() => void jest.advanceTimersByTime(600))
    expect(useRemovalRefusedNotice.getState().notices).toEqual([])
  })

  it('stays on screen with no auto-hide', () => {
    jest.useFakeTimers()
    render(<RemovalRefusedNotice />)
    push(nested)
    act(() => void jest.advanceTimersByTime(60_000))
    expect(screen.getByText("Couldn't uninstall Half-Life 2")).toBeTruthy()
  })

  it('shows one toast, in its own slot, per queued refusal', () => {
    render(<RemovalRefusedNotice />)
    push(nested)
    push({ ...nested, title: 'Portal 2', otherTitle: 'Half-Life 2' })
    expect(screen.getAllByRole('alert')).toHaveLength(2)
    expect(document.querySelectorAll('.noticeStackSlot')).toHaveLength(2)
  })

  describe('copy', () => {
    const TITLES: Record<RemovalRefusalKind, string> = {
      uninstall: "Couldn't uninstall Half-Life 2",
      'remove-prefix': "Couldn't remove the Wine prefix for Half-Life 2",
      'remove-bottle': "Couldn't remove the bottle for Half-Life 2",
      reset: "Couldn't reset GameLib",
      'cancel-install': "Couldn't clean up the cancelled install of Half-Life 2"
    }

    it('covers every kind with its own title', () => {
      expect(Object.keys(TITLES).sort()).toEqual(
        [...REMOVAL_REFUSAL_KINDS].sort()
      )
      for (const kind of REMOVAL_REFUSAL_KINDS) {
        cleanup()
        useRemovalRefusedNotice.setState({ notices: [], nextId: 1 })
        render(<RemovalRefusedNotice />)
        push({
          kind,
          outcome: 'refused',
          reason: 'is-protected-root',
          ...(kind === 'reset' ? {} : { title: 'Half-Life 2' })
        })
        expect(screen.getByText(TITLES[kind])).toBeTruthy()
      }
    })

    it('renders real copy for every non-ok reason and never a raw key', () => {
      const bodies = new Set<string>()
      for (const reason of REMOVAL_REASONS.filter((r) => r !== 'ok')) {
        cleanup()
        useRemovalRefusedNotice.setState({ notices: [], nextId: 1 })
        const { container } = render(<RemovalRefusedNotice />)
        push({
          kind: 'uninstall',
          outcome: 'refused',
          reason,
          title: 'Half-Life 2',
          otherTitle: 'Portal'
        })
        const text = container.textContent ?? ''
        expect(text).not.toContain('removalRefused.')
        expect(text).not.toContain('{{')
        const body = container.querySelectorAll('.noticeStackBody')[0]
        expect((body?.textContent ?? '').length).toBeGreaterThan(10)
        bodies.add(body?.textContent ?? '')
      }
      // Ten distinct bodies: the 'unconfirmed' group collapses the check-could-not-run reasons, and the bottle op's
      // `in-use` and `unsafe-name` each have their own (87-75).
      expect(bodies.size).toBe(10)
    })

    it('words the bottle op refusals in-use and unsafe-name each on their own (87-75, RF6)', () => {
      const cases = [
        [
          'in-use',
          'The bottle is in use. Quit the game and anything else running in it, then try again.'
        ],
        [
          'unsafe-name',
          "The bottle's name isn't one GameLib made for this game, so it was left alone."
        ]
      ] as const
      for (const [reason, body] of cases) {
        cleanup()
        useRemovalRefusedNotice.setState({ notices: [], nextId: 1 })
        render(<RemovalRefusedNotice />)
        push({
          kind: 'remove-bottle',
          outcome: 'refused',
          reason,
          title: 'Half-Life 2'
        })
        expect(
          screen.getByText("Couldn't remove the bottle for Half-Life 2")
        ).toBeTruthy()
        expect(screen.getByText(body)).toBeTruthy()
        expect(screen.getByText('Nothing was deleted.')).toBeTruthy()
        expect(document.body.textContent).not.toContain(
          "GameLib couldn't confirm"
        )
      }
    })

    it('interpolates the other title for both known-install reasons', () => {
      render(<RemovalRefusedNotice />)
      push({ ...nested, reason: 'inside-known-install' })
      expect(
        screen.getByText('This folder is inside the install of Portal.')
      ).toBeTruthy()
    })

    it('says nothing was deleted only for a refused outcome', () => {
      render(<RemovalRefusedNotice />)
      push({ ...nested, outcome: 'failed' })
      expect(
        screen.getByText(
          'Some files may already have been removed. Try again to finish.'
        )
      ).toBeTruthy()
      expect(document.body.textContent).not.toContain('Nothing was deleted')
    })

    it('never says nothing was deleted for delete-failed, even if marked refused', () => {
      render(<RemovalRefusedNotice />)
      push({ ...nested, outcome: 'refused', reason: 'delete-failed' })
      expect(screen.getByText('Some files could not be removed.')).toBeTruthy()
      expect(document.body.textContent).not.toContain('Nothing was deleted')
    })

    it('uses neutral wording when the game title is unknown', () => {
      render(<RemovalRefusedNotice />)
      push({ kind: 'uninstall', outcome: 'refused', reason: 'not-a-prefix' })
      expect(screen.getByText("Couldn't uninstall this game")).toBeTruthy()
      push({ ...nested, title: undefined, otherTitle: undefined })
      expect(
        screen.getByText('Another game is installed inside this folder.')
      ).toBeTruthy()
      push({
        ...nested,
        reason: 'inside-known-install',
        otherTitle: undefined
      })
      expect(
        screen.getByText('This folder is inside the install of another game.')
      ).toBeTruthy()
    })
  })
})
