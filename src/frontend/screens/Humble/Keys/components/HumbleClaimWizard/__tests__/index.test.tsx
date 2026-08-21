/**
 * Unit tests for HumbleClaimWizard (HCLAIM-01/03/05, D-65/D-66/D-69).
 *
 * No jsdom / react-test-renderer / jest-environment-jsdom is installed in
 * this project (see src/frontend/jest.config.js docstring and
 * HumbleOriginInfo.test.tsx) — @testing-library/react's `render()` requires a
 * real DOM and cannot run under the `node` test environment this project
 * uses. Adding jest-environment-jsdom is a new npm dependency, which is
 * outside executor auto-fix (Rule 3 package-manager-install carve-out) and
 * would require a human package-legitimacy checkpoint, so it is not added
 * here.
 *
 * Instead, following this project's established pattern, 'react' is mocked
 * at the module level so HumbleClaimWizard can be invoked directly as a
 * plain function and its returned React-element object graph inspected
 * without a DOM. Unlike HumbleOriginInfo (no internal state), this component
 * owns useState/useEffect, so the 'react' mock below is a minimal slot-based
 * hook harness: useState persists values across repeated direct invocations
 * of the same component instance (simulating re-renders), and useEffect runs
 * its callback synchronously. `mount()`/`rerender()` below drive this
 * harness; `flushPromises()` lets a click handler's internal `await` settle
 * before the next `rerender()` inspects the resulting state.
 */
import type { ReactElement, ReactNode } from 'react'

import { HumbleKey, RedeemOutcome, RevealOutcome } from 'common/types/humble'

// No CSS transform/moduleNameMapper is configured for the frontend jest
// project (this is the first colocated-CSS component to gain a test) — stub
// the side-effect-only import so Jest doesn't try to parse plain CSS as JS.
jest.mock('../index.css', () => ({}))

const mockNavigate = jest.fn()

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      defaultValue: string,
      params?: Record<string, unknown>
    ): string =>
      Object.entries(params ?? {}).reduce(
        (str: string, [k, v]) => str.replace(`{{${k}}}`, String(v)),
        defaultValue
      )
  })
}))

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let slots: unknown[] = []
  let cursor = 0

  return {
    ...actualReact,
    useState: (initial: unknown) => {
      const idx = cursor++
      if (idx >= slots.length) {
        slots[idx] =
          typeof initial === 'function' ? (initial as () => unknown)() : initial
      }
      const setState = (updater: unknown) => {
        slots[idx] =
          typeof updater === 'function'
            ? (updater as (prev: unknown) => unknown)(slots[idx])
            : updater
      }
      return [slots[idx], setState]
    },
    useEffect: (effect: () => void | (() => void)) => {
      effect()
    },
    __beginRender: () => {
      cursor = 0
    },
    __resetMount: () => {
      slots = []
      cursor = 0
    }
  }
})

const mockApi = {
  humbleRevealKey: jest.fn(),
  humbleMarkRedeemed: jest.fn(),
  humbleGetRevealedKeyValue: jest.fn(),
  humbleSync: jest.fn(),
  clipboardWriteText: jest.fn(),
  openExternalUrl: jest.fn()
}

;(globalThis as unknown as { window: { api: typeof mockApi } }).window = {
  api: mockApi
}

// Imported after the mocks above (textual order, not hoisting — this
// project's ts-jest setup does not hoist jest.mock like babel-jest; see
// HumbleOriginInfo.test.tsx for the same convention) so the component
// transitively requires the mocked 'react'/'react-i18next'/'react-router-dom'.
import HumbleClaimWizard from '../index'

type HookHarness = { __beginRender: () => void; __resetMount: () => void }

function harness(): HookHarness {
  return jest.requireMock('react') as unknown as HookHarness
}

type Props = {
  humbleKey: HumbleKey
  entryMode: 'claim' | 'finish'
  onDone: () => void
}

function mount(props: Props): ReactElement {
  harness().__resetMount()
  harness().__beginRender()
  return HumbleClaimWizard(props) as unknown as ReactElement
}

function rerender(props: Props): ReactElement {
  harness().__beginRender()
  return HumbleClaimWizard(props) as unknown as ReactElement
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

type PropsWithChildren = { children?: ReactNode; className?: string }

function collectElements(
  node: ReactNode,
  out: ReactElement<PropsWithChildren>[] = []
): ReactElement<PropsWithChildren>[] {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return out
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectElements(child as ReactNode, out))
    return out
  }
  if (typeof node === 'object' && 'type' in node) {
    const element = node as ReactElement<PropsWithChildren>
    out.push(element)
    if (element.props?.children !== undefined) {
      collectElements(element.props.children, out)
    }
    return out
  }
  return out
}

function findByClassNamePart(
  tree: ReactNode,
  part: string
): ReactElement<PropsWithChildren & { onClick?: () => void }> | undefined {
  return collectElements(tree).find((el) => {
    const className = el.props?.className
    return typeof className === 'string' && className.split(' ').includes(part)
  }) as ReactElement<PropsWithChildren & { onClick?: () => void }> | undefined
}

function textContent(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return ''
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map((child) => textContent(child as ReactNode)).join('')
  }
  if (typeof node === 'object' && 'props' in node) {
    return textContent(
      (node as ReactElement<PropsWithChildren>).props?.children
    )
  }
  return ''
}

function makeHumbleKey(overrides: Partial<HumbleKey> = {}): HumbleKey {
  return {
    gamekey: 'gk-1',
    machineName: 'mn-1',
    state: 'UNREVEALED',
    title: 'Some Game',
    platform: 'steam',
    expiration: null,
    origin: 'Humble RPG Bundle',
    ownedElsewhere: false,
    matchConfidence: 'none',
    ...overrides
  }
}

describe('HumbleClaimWizard', () => {
  it('does not call humbleRevealKey on the initial claim-mode render (HCLAIM-01, T-14-08)', () => {
    const onDone = jest.fn()
    const tree = mount({
      humbleKey: makeHumbleKey(),
      entryMode: 'claim',
      onDone
    })

    expect(mockApi.humbleRevealKey).not.toHaveBeenCalled()
    // Only the danger-styled confirm can trigger a reveal.
    const revealButton = findByClassNamePart(
      tree,
      'humbleClaimWizardRevealButton'
    )
    expect(revealButton).toBeDefined()
    expect(revealButton?.props.className).toContain('is-danger')
  })

  it('reveals a Steam key, shows it, and opens the registerkey page with the encoded key (HCLAIM-03)', async () => {
    const onDone = jest.fn()
    const humbleKey = makeHumbleKey({ platform: 'steam' })
    mockApi.humbleRevealKey.mockResolvedValue({
      status: 'revealed',
      key: 'ABCD-1234'
    } satisfies RevealOutcome)

    const initial = mount({ humbleKey, entryMode: 'claim', onDone })
    const revealButton = findByClassNamePart(
      initial,
      'humbleClaimWizardRevealButton'
    )!
    revealButton.props.onClick?.()
    await flushPromises()

    expect(mockApi.humbleRevealKey).toHaveBeenCalledWith({
      gamekey: humbleKey.gamekey,
      machineName: humbleKey.machineName
    })
    expect(mockApi.clipboardWriteText).toHaveBeenCalledWith('ABCD-1234')

    const revealed = rerender({ humbleKey, entryMode: 'claim', onDone })
    expect(textContent(revealed)).toContain('ABCD-1234')

    const openSteam = findByClassNamePart(
      revealed,
      'humbleClaimWizardActivationLink'
    )!
    expect(textContent(openSteam)).toContain('Open Steam')

    openSteam.props.onClick?.()
    expect(mockApi.openExternalUrl).toHaveBeenCalledWith(
      'https://store.steampowered.com/account/registerkey?key=ABCD-1234'
    )
  })

  it('shows "Redeem on {{platform}}" and no "Open Steam" control for a non-Steam key (HCLAIM-05)', async () => {
    const onDone = jest.fn()
    const humbleKey = makeHumbleKey({ platform: 'gog' })
    mockApi.humbleRevealKey.mockResolvedValue({
      status: 'revealed',
      key: 'GOG-KEY-1'
    } satisfies RevealOutcome)

    const initial = mount({ humbleKey, entryMode: 'claim', onDone })
    const revealButton = findByClassNamePart(
      initial,
      'humbleClaimWizardRevealButton'
    )!
    revealButton.props.onClick?.()
    await flushPromises()

    const revealed = rerender({ humbleKey, entryMode: 'claim', onDone })
    const content = textContent(revealed)
    expect(content).not.toContain('Open Steam')
    expect(content).toContain('Redeem on gog')
  })

  it('renders the C2 block and navigates to /humble-keys/spares on an owned_blocked outcome (D-69)', async () => {
    const onDone = jest.fn()
    const humbleKey = makeHumbleKey()
    mockApi.humbleRevealKey.mockResolvedValue({
      status: 'owned_blocked'
    } satisfies RevealOutcome)

    const initial = mount({ humbleKey, entryMode: 'claim', onDone })
    const revealButton = findByClassNamePart(
      initial,
      'humbleClaimWizardRevealButton'
    )!
    revealButton.props.onClick?.()
    await flushPromises()

    const blocked = rerender({ humbleKey, entryMode: 'claim', onDone })
    expect(textContent(blocked)).toContain('You already own this on Steam')

    const c2Button = findByClassNamePart(blocked, 'humbleClaimWizardC2Button')!
    c2Button.props.onClick?.()

    expect(mockNavigate).toHaveBeenCalledWith('/humble-keys/spares')
    expect(onDone).toHaveBeenCalled()
  })

  it('entryMode "finish" fetches the revealed key value and never calls humbleRevealKey (D-66)', () => {
    const onDone = jest.fn()
    const humbleKey = makeHumbleKey({ state: 'REVEALED' })
    mockApi.humbleGetRevealedKeyValue.mockResolvedValue('ALREADY-REVEALED')

    mount({ humbleKey, entryMode: 'finish', onDone })

    expect(mockApi.humbleGetRevealedKeyValue).toHaveBeenCalledWith({
      gamekey: humbleKey.gamekey,
      machineName: humbleKey.machineName
    })
    expect(mockApi.humbleRevealKey).not.toHaveBeenCalled()
  })

  // WR-06 (14-REVIEW): a definitive server denial (already redeemed /
  // expired) must render honest terminal copy — never the retryable
  // "nothing was used up" failed step.
  it('WR-06: a rejected_by_server outcome lands on the rejected step — sync-to-check recovery, no retry button', async () => {
    const onDone = jest.fn()
    const humbleKey = makeHumbleKey()
    mockApi.humbleRevealKey.mockResolvedValue({
      status: 'rejected_by_server'
    } satisfies RevealOutcome)

    const initial = mount({ humbleKey, entryMode: 'claim', onDone })
    findByClassNamePart(
      initial,
      'humbleClaimWizardRevealButton'
    )!.props.onClick?.()
    await flushPromises()

    const tree = rerender({ humbleKey, entryMode: 'claim', onDone })
    const content = textContent(tree)
    expect(content).toContain('Humble declined to reveal this key')
    // Never the false "nothing was used up" claim, never a retry button.
    expect(content).not.toContain('nothing was used up')
    expect(
      findByClassNamePart(tree, 'humbleClaimWizardRetryButton')
    ).toBeUndefined()
    // Sync-to-check is the only recovery action.
    const syncButton = findByClassNamePart(tree, 'humbleClaimWizardSyncButton')
    expect(syncButton).toBeDefined()
    syncButton!.props.onClick?.()
    expect(mockApi.humbleSync).toHaveBeenCalled()
    expect(onDone).toHaveBeenCalled()
  })

  // WR-05 (14-REVIEW): IPC promise rejections were previously unhandled —
  // a rejected finish-mode read left the wizard on "Loading…" forever, and a
  // rejected reveal/mark-redeemed call escaped as an unhandled rejection.
  it('WR-05: a rejected humbleGetRevealedKeyValue in finish mode lands on the ambiguous step, never a stuck "Loading…"', async () => {
    const onDone = jest.fn()
    const humbleKey = makeHumbleKey({ state: 'REVEALED' })
    mockApi.humbleGetRevealedKeyValue.mockRejectedValue(
      new Error('ipc channel gone')
    )

    mount({ humbleKey, entryMode: 'finish', onDone })
    await flushPromises()

    const tree = rerender({ humbleKey, entryMode: 'finish', onDone })
    expect(textContent(tree)).toContain("couldn't confirm")
    expect(textContent(tree)).not.toContain('Loading')
    // 'finish' mode invariant: still no reveal call on the recovery path.
    expect(mockApi.humbleRevealKey).not.toHaveBeenCalled()
  })

  it('WR-05: a rejected humbleRevealKey lands on the ambiguous step (outcome unknown — never the retryable failed copy)', async () => {
    const onDone = jest.fn()
    const humbleKey = makeHumbleKey()
    mockApi.humbleRevealKey.mockRejectedValue(new Error('ipc channel gone'))

    const initial = mount({ humbleKey, entryMode: 'claim', onDone })
    const revealButton = findByClassNamePart(
      initial,
      'humbleClaimWizardRevealButton'
    )!
    revealButton.props.onClick?.()
    await flushPromises()

    const tree = rerender({ humbleKey, entryMode: 'claim', onDone })
    // The honest copy for an unknown outcome — the backend may have fired
    // the irreversible POST, so "nothing was used up… try again" would be
    // false and its retry button would invite re-firing.
    expect(textContent(tree)).toContain("couldn't confirm")
    expect(textContent(tree)).not.toContain('try again')
    // The Sync-now recovery action is offered instead of a retry.
    const syncButton = findByClassNamePart(tree, 'humbleClaimWizardSyncButton')
    expect(syncButton).toBeDefined()
  })

  it('WR-05: a rejected humbleMarkRedeemed stays on the key step (retryable) and never calls onDone', async () => {
    const onDone = jest.fn()
    const humbleKey = makeHumbleKey({ platform: 'steam' })
    mockApi.humbleRevealKey.mockResolvedValue({
      status: 'revealed',
      key: 'MARK-ME'
    } satisfies RevealOutcome)
    mockApi.humbleMarkRedeemed.mockRejectedValue(new Error('ipc channel gone'))

    const initial = mount({ humbleKey, entryMode: 'claim', onDone })
    findByClassNamePart(
      initial,
      'humbleClaimWizardRevealButton'
    )!.props.onClick?.()
    await flushPromises()

    const revealed = rerender({ humbleKey, entryMode: 'claim', onDone })
    findByClassNamePart(
      revealed,
      'humbleClaimWizardMarkRedeemedButton'
    )!.props.onClick?.()
    await flushPromises()

    expect(onDone).not.toHaveBeenCalled()
    // Still on the key step, button re-enabled — the user can retry.
    const after = rerender({ humbleKey, entryMode: 'claim', onDone })
    const retryable = findByClassNamePart(
      after,
      'humbleClaimWizardMarkRedeemedButton'
    )
    expect(retryable).toBeDefined()
    expect(
      (retryable?.props as { disabled?: boolean } | undefined)?.disabled
    ).toBe(false)
  })

  it('marks a revealed key as redeemed and calls onDone (HCLAIM-04)', async () => {
    const onDone = jest.fn()
    const humbleKey = makeHumbleKey({ platform: 'steam' })
    mockApi.humbleRevealKey.mockResolvedValue({
      status: 'revealed',
      key: 'MARK-ME'
    } satisfies RevealOutcome)
    mockApi.humbleMarkRedeemed.mockResolvedValue({
      status: 'ok'
    } satisfies RedeemOutcome)

    const initial = mount({ humbleKey, entryMode: 'claim', onDone })
    const revealButton = findByClassNamePart(
      initial,
      'humbleClaimWizardRevealButton'
    )!
    revealButton.props.onClick?.()
    await flushPromises()

    const revealed = rerender({ humbleKey, entryMode: 'claim', onDone })
    const markRedeemed = findByClassNamePart(
      revealed,
      'humbleClaimWizardMarkRedeemedButton'
    )!
    markRedeemed.props.onClick?.()
    await flushPromises()

    expect(mockApi.humbleMarkRedeemed).toHaveBeenCalledWith({
      gamekey: humbleKey.gamekey,
      machineName: humbleKey.machineName
    })
    expect(onDone).toHaveBeenCalled()
  })
})
