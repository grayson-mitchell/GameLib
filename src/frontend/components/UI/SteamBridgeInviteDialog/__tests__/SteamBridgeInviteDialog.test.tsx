/**
 * Element-graph tests for the Phase 58 Plan 32 friend picker. No jsdom: the
 * component is called as a function with the store hook and Dialog primitives
 * mocked, and its returned element graph is walked.
 */
import type { ReactElement, ReactNode } from 'react'
import { isValidElement } from 'react'

jest.mock('react-i18next', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {
    gamelibT
  } = require('../../../../screens/Game/GamePage/components/__tests__/gamelibT')
  return { useTranslation: () => ({ t: gamelibT }) }
})
jest.mock('frontend/components/UI/Dialog', () => ({
  Dialog: 'Dialog',
  DialogContent: 'DialogContent',
  DialogFooter: 'DialogFooter',
  DialogHeader: 'DialogHeader'
}))
jest.mock('../index.scss', () => ({}))
// The component is called as a function (no renderer), so useEffect is
// captured instead of run; tests execute the captured effect by hand.
const effects: Array<{ fn: () => (() => void) | undefined; deps: unknown[] }> =
  []
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useEffect: (fn: () => (() => void) | undefined, deps: unknown[]) => {
    effects.push({ fn, deps })
  }
}))
const mockStore = jest.fn()
jest.mock('frontend/state/SteamBridgeInvite', () => ({
  useSteamBridgeInvite: () => mockStore()
}))

import SteamBridgeInviteDialog from '../index'

type El = ReactElement<{ children?: ReactNode; [k: string]: unknown }>

const walk = (n: ReactNode, out: El[] = []): El[] => {
  if (Array.isArray(n)) n.forEach((c) => walk(c, out))
  else if (isValidElement(n)) {
    out.push(n as El)
    walk((n as El).props.children, out)
  }
  return out
}
const text = (n: ReactNode): string =>
  Array.isArray(n)
    ? n.map(text).join('')
    : isValidElement(n)
      ? text((n as El).props.children)
      : typeof n === 'string' || typeof n === 'number'
        ? String(n)
        : ''
const buttons = (root: ReactNode) =>
  walk(root).filter((e) => e.type === 'button')

const state = (over: Record<string, unknown>) => ({
  isOpen: true,
  appId: '3205720',
  title: 'Schedule I: Free Sample',
  load: 'ready',
  friends: [
    { ordinal: 1, name: 'Amy', online: true, playingThisApp: true },
    { ordinal: 2, name: 'Bob', online: false, playingThisApp: false }
  ],
  rows: {},
  close: jest.fn(),
  invite: jest.fn(),
  ...over
})

describe('SteamBridgeInviteDialog', () => {
  const dialogDisplayed = jest.fn()
  const docListeners: Record<string, () => void> = {}
  const fakeDoc = {
    visibilityState: 'visible',
    addEventListener: (t: string, l: () => void) => {
      docListeners[t] = l
    },
    removeEventListener: (t: string) => {
      delete docListeners[t]
    }
  }
  beforeEach(() => {
    effects.length = 0
    dialogDisplayed.mockClear()
    fakeDoc.visibilityState = 'visible'
    ;(globalThis as unknown as { window: unknown }).window = {
      api: { dialogDisplayed }
    }
    ;(globalThis as unknown as { document: unknown }).document = fakeDoc
  })

  it('renders nothing while closed', () => {
    mockStore.mockReturnValue(state({ isOpen: false }))
    expect(SteamBridgeInviteDialog()).toBeNull()
  })

  it('names the game in the title and falls back to the appId', () => {
    mockStore.mockReturnValue(state({}))
    const header = walk(SteamBridgeInviteDialog()).find(
      (e) => e.type === 'DialogHeader'
    )
    expect(text(header?.props.children)).toBe(
      'Invite a friend to Schedule I: Free Sample'
    )
    mockStore.mockReturnValue(state({ title: undefined }))
    const h2 = walk(SteamBridgeInviteDialog()).find(
      (e) => e.type === 'DialogHeader'
    )
    expect(text(h2?.props.children)).toBe('Invite a friend to 3205720')
  })

  it('offline friends get a disabled Invite button; online is clickable', () => {
    const s = state({})
    mockStore.mockReturnValue(s)
    const b = buttons(SteamBridgeInviteDialog()).filter(
      (e) => text(e.props.children) === 'Invite'
    )
    expect(b.map((e) => e.props.disabled)).toEqual([false, true])
    ;(b[0].props.onClick as () => void)()
    expect(s.invite).toHaveBeenCalledWith(1)
  })

  it('shows sent text and disables the button; expired shows press-again', () => {
    mockStore.mockReturnValue(state({ rows: { 1: 'sent' } }))
    let out = text(SteamBridgeInviteDialog())
    expect(out).toContain('Invite sent')
    const b = buttons(SteamBridgeInviteDialog()).filter(
      (e) => text(e.props.children) === 'Invite'
    )
    expect(b[0].props.disabled).toBe(true)
    mockStore.mockReturnValue(state({ rows: { 1: 'expired' } }))
    out = text(SteamBridgeInviteDialog())
    expect(out).toContain("Press the game's invite button again, then retry")
  })

  it('shows one not-available message when the list is unavailable', () => {
    mockStore.mockReturnValue(state({ load: 'unavailable', friends: [] }))
    expect(text(SteamBridgeInviteDialog())).toContain(
      'Inviting is not available right now'
    )
  })

  it('Close dismisses, and no console call carries a friend name', () => {
    const spies = (['log', 'info', 'warn', 'error'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined)
    )
    const s = state({})
    mockStore.mockReturnValue(s)
    const close = buttons(SteamBridgeInviteDialog()).find(
      (e) => text(e.props.children) === 'Close'
    )
    ;(close?.props.onClick as () => void)()
    expect(s.close).toHaveBeenCalled()
    for (const sp of spies) {
      expect(sp).not.toHaveBeenCalled()
      sp.mockRestore()
    }
  })
  describe('display ack (58-36)', () => {
    const render = (over: Record<string, unknown>) => {
      effects.length = 0
      mockStore.mockReturnValue(state(over))
      SteamBridgeInviteDialog()
      return effects[0]
    }

    it('acks once when visible', () => {
      render({ ackId: 'a1' }).fn()
      expect(dialogDisplayed).toHaveBeenCalledTimes(1)
      expect(dialogDisplayed).toHaveBeenCalledWith('a1')
    })

    it('re-renders with new friends/rows keep the same deps (no second ack)', () => {
      const first = render({ ackId: 'a1' })
      const second = render({ ackId: 'a1', rows: { 1: 'sent' }, friends: [] })
      expect(second.deps).toEqual(first.deps)
    })

    it('hidden: waits for visibilitychange, then acks once', () => {
      fakeDoc.visibilityState = 'hidden'
      render({ ackId: 'a1' }).fn()
      expect(dialogDisplayed).not.toHaveBeenCalled()
      fakeDoc.visibilityState = 'visible'
      docListeners.visibilitychange()
      expect(dialogDisplayed).toHaveBeenCalledTimes(1)
      expect(dialogDisplayed).toHaveBeenCalledWith('a1')
    })

    it('cleanup before it becomes visible cancels the ack', () => {
      fakeDoc.visibilityState = 'hidden'
      const cleanup = render({ ackId: 'a1' }).fn()
      cleanup?.()
      expect(docListeners.visibilitychange).toBeUndefined()
      expect(dialogDisplayed).not.toHaveBeenCalled()
    })

    it('no ackId or closed: no ack', () => {
      expect(render({}).fn()).toBeUndefined()
      expect(render({ isOpen: false, ackId: 'a1' }).fn()).toBeUndefined()
      expect(dialogDisplayed).not.toHaveBeenCalled()
    })
  })
})
