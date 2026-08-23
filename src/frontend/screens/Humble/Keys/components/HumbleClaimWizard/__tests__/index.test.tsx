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

const mockRefreshLibrary = jest.fn().mockResolvedValue(undefined)
const mockContext = { refreshLibrary: mockRefreshLibrary }

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
    // 260823-ptz: the wizard's runActivate re-entrancy guard is a useRef, so
    // the harness has to give it a slot that PERSISTS across rerenders — a
    // plain `{ current }` per call would reset the guard on every re-render
    // and let the irreversible reveal fire twice, which is the exact defect
    // the guard exists to prevent.
    useRef: (initial: unknown) => {
      const idx = cursor++
      if (idx >= slots.length) {
        slots[idx] = { current: initial }
      }
      return slots[idx]
    },
    // 260823-op3: the wizard reads `refreshLibrary` off ContextProvider. The
    // real `useContext` needs a renderer dispatcher, which this DOM-less
    // harness does not have.
    useContext: () => mockContext,
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
  openExternalUrl: jest.fn(),
  // 260823-op3: the Steam one-click path.
  redeemSteamKey: jest.fn()
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

/** 260823-ptz: Steam's activate now sits behind a confirm click. */
function clickActivate(tree: ReactElement): void {
  const button = findByClassNamePart(tree, 'humbleClaimWizardActivateButton')
  if (!button) {
    throw new Error('no Activate confirm button on this tree')
  }
  button.props.onClick?.()
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
  // T-14-08, RESTORED by 260823-ptz: 260823-op3 briefly gave Steam keys a
  // mount-effect reveal; the confirm gate put the click back in front of it,
  // so NO platform reveals on mount again. Asserted for both here.
  it.each([['gog'], ['steam']])(
    'does not call humbleRevealKey on the initial %s claim-mode render (HCLAIM-01, T-14-08)',
    (platform) => {
      const onDone = jest.fn()
      const tree = mount({
        humbleKey: makeHumbleKey({ platform }),
        entryMode: 'claim',
        onDone
      })

      expect(mockApi.humbleRevealKey).not.toHaveBeenCalled()
      expect(mockApi.humbleGetRevealedKeyValue).not.toHaveBeenCalled()
      // Only a danger-styled confirm can trigger the irreversible half.
      const confirm = findByClassNamePart(
        tree,
        platform === 'steam'
          ? 'humbleClaimWizardActivateButton'
          : 'humbleClaimWizardRevealButton'
      )
      expect(confirm).toBeDefined()
      expect(confirm?.props.className).toContain('is-danger')
    }
  )

  // 260823-op3 + ptz: one CONFIRM click, then the whole sequence — reveal,
  // redeem on Steam, mark redeemed — with nothing else to click.
  it('activates a Steam key end-to-end from a single confirm click (260823-ptz)', async () => {
    const onDone = jest.fn()
    const humbleKey = makeHumbleKey({ platform: 'steam' })
    mockApi.humbleRevealKey.mockResolvedValue({
      status: 'revealed',
      key: 'ABCD-1234'
    } satisfies RevealOutcome)
    mockApi.redeemSteamKey.mockResolvedValue({
      store: 'steam',
      outcome: 'success',
      packageList: { '12345': 'Some Game' }
    })
    mockApi.humbleMarkRedeemed.mockResolvedValue({
      status: 'ok'
    } satisfies RedeemOutcome)

    const initial = mount({ humbleKey, entryMode: 'claim', onDone })
    // The confirm gate names both irreversible halves before anything runs.
    const confirmBody = textContent(initial)
    expect(confirmBody).toContain('Activate this key on Steam?')
    expect(confirmBody).toContain('reveals the key')
    expect(confirmBody).toContain("There's no undo")
    expect(mockApi.humbleRevealKey).not.toHaveBeenCalled()

    findByClassNamePart(
      initial,
      'humbleClaimWizardActivateButton'
    )!.props.onClick?.()
    await flushPromises()

    expect(mockApi.humbleRevealKey).toHaveBeenCalledWith({
      gamekey: humbleKey.gamekey,
      machineName: humbleKey.machineName
    })
    expect(mockApi.redeemSteamKey).toHaveBeenCalledWith({
      store: 'steam',
      key: 'ABCD-1234'
    })
    expect(mockApi.humbleMarkRedeemed).toHaveBeenCalledWith({
      gamekey: humbleKey.gamekey,
      machineName: humbleKey.machineName
    })
    // D-73 survives: the irreversible reveal still lands on the clipboard.
    expect(mockApi.clipboardWriteText).toHaveBeenCalledWith('ABCD-1234')
    // The manual hand-off is gone from the happy path entirely.
    expect(mockApi.openExternalUrl).not.toHaveBeenCalled()

    const done = rerender({ humbleKey, entryMode: 'claim', onDone })
    const content = textContent(done)
    expect(content).toContain('Activated')
    expect(content).toContain('Some Game')
  })

  // 260823-ptz: `busy` alone cannot close the double-click window — it is
  // state, so both clicks in a same-frame double-click read the pre-render
  // `false` and `disabled={busy}` has not applied yet. The ref guard must.
  it('fires humbleRevealKey once for a same-frame double-click on Activate (260823-ptz)', async () => {
    const onDone = jest.fn()
    const humbleKey = makeHumbleKey({ platform: 'steam' })
    mockApi.humbleRevealKey.mockResolvedValue({
      status: 'revealed',
      key: 'ONCE-ONLY'
    } satisfies RevealOutcome)
    mockApi.redeemSteamKey.mockResolvedValue({
      store: 'steam',
      outcome: 'success'
    })

    const initial = mount({ humbleKey, entryMode: 'claim', onDone })
    const activate = findByClassNamePart(
      initial,
      'humbleClaimWizardActivateButton'
    )!
    // Both clicks land before any re-render — the state guard is blind here.
    activate.props.onClick?.()
    activate.props.onClick?.()
    await flushPromises()
    rerender({ humbleKey, entryMode: 'claim', onDone })
    await flushPromises()

    expect(mockApi.humbleRevealKey).toHaveBeenCalledTimes(1)
    expect(mockApi.redeemSteamKey).toHaveBeenCalledTimes(1)
  })

  // 260823-op3: the reveal is spent by the time Steam answers, so a refusal
  // must NEVER hide the key — it falls back to the full manual affordances
  // (key value + Copy + Open Steam + Mark as redeemed) with an explanation.
  it('falls back to the manual key hand-off when Steam declines the redeem (260823-op3)', async () => {
    const onDone = jest.fn()
    const humbleKey = makeHumbleKey({ platform: 'steam' })
    mockApi.humbleRevealKey.mockResolvedValue({
      status: 'revealed',
      key: 'ABCD-1234'
    } satisfies RevealOutcome)
    mockApi.redeemSteamKey.mockResolvedValue({
      store: 'steam',
      outcome: 'rate-limited'
    })

    clickActivate(mount({ humbleKey, entryMode: 'claim', onDone }))
    await flushPromises()

    // Never marked redeemed — Steam did not take it.
    expect(mockApi.humbleMarkRedeemed).not.toHaveBeenCalled()

    const fallback = rerender({ humbleKey, entryMode: 'claim', onDone })
    const content = textContent(fallback)
    expect(content).toContain('Too many attempts')
    // The key itself is still on screen — a spent reveal cannot strand.
    expect(content).toContain('ABCD-1234')

    const openSteam = findByClassNamePart(
      fallback,
      'humbleClaimWizardActivationLink'
    )!
    expect(textContent(openSteam)).toContain('Open Steam')
    openSteam.props.onClick?.()
    expect(mockApi.openExternalUrl).toHaveBeenCalledWith(
      'https://store.steampowered.com/account/registerkey?key=ABCD-1234'
    )
    expect(
      findByClassNamePart(fallback, 'humbleClaimWizardMarkRedeemedButton')
    ).toBeDefined()
  })

  // 260823-op3: a redeem-side IPC rejection is NOT the reveal-side unknown —
  // the key is confirmed revealed, so it must land on the key hand-off, never
  // on the key-hiding 'ambiguous' step.
  it('lands on the key hand-off (not ambiguous) when redeemSteamKey itself rejects (260823-op3)', async () => {
    const onDone = jest.fn()
    const humbleKey = makeHumbleKey({ platform: 'steam' })
    mockApi.humbleRevealKey.mockResolvedValue({
      status: 'revealed',
      key: 'ABCD-1234'
    } satisfies RevealOutcome)
    mockApi.redeemSteamKey.mockRejectedValue(new Error('ipc channel gone'))

    clickActivate(mount({ humbleKey, entryMode: 'claim', onDone }))
    await flushPromises()

    const tree = rerender({ humbleKey, entryMode: 'claim', onDone })
    const content = textContent(tree)
    expect(content).toContain('ABCD-1234')
    expect(content).not.toContain("couldn't confirm")
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

  // 260823-op3: the C2 hard-block survives the one-click redesign unchanged —
  // it now fires from the auto-activate reveal instead of a confirm click,
  // and still never reaches redeemSteamKey.
  it('renders the C2 block and navigates to /humble-keys/spares on an owned_blocked outcome (D-69)', async () => {
    const onDone = jest.fn()
    const humbleKey = makeHumbleKey()
    mockApi.humbleRevealKey.mockResolvedValue({
      status: 'owned_blocked'
    } satisfies RevealOutcome)

    clickActivate(mount({ humbleKey, entryMode: 'claim', onDone }))
    await flushPromises()

    expect(mockApi.redeemSteamKey).not.toHaveBeenCalled()

    const blocked = rerender({ humbleKey, entryMode: 'claim', onDone })
    expect(textContent(blocked)).toContain('You already own this on Steam')

    const c2Button = findByClassNamePart(blocked, 'humbleClaimWizardC2Button')!
    c2Button.props.onClick?.()

    expect(mockNavigate).toHaveBeenCalledWith('/humble-keys/spares')
    expect(onDone).toHaveBeenCalled()
  })

  // D-66 + 260823-ptz: for a Steam key the read is now DEFERRED behind the
  // confirm click (it was a mount effect before the confirm gate). The
  // invariant under test is unchanged: finish mode reads the stored value and
  // never re-reveals.
  it('entryMode "finish" fetches the revealed key value and never calls humbleRevealKey (D-66)', async () => {
    const onDone = jest.fn()
    const humbleKey = makeHumbleKey({ state: 'REVEALED' })
    mockApi.humbleGetRevealedKeyValue.mockResolvedValue('ALREADY-REVEALED')
    mockApi.redeemSteamKey.mockResolvedValue({
      store: 'steam',
      outcome: 'success'
    })

    clickActivate(mount({ humbleKey, entryMode: 'finish', onDone }))
    await flushPromises()

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

    clickActivate(mount({ humbleKey, entryMode: 'claim', onDone }))
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

    clickActivate(mount({ humbleKey, entryMode: 'finish', onDone }))
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

    clickActivate(mount({ humbleKey, entryMode: 'claim', onDone }))
    await flushPromises()

    // 260823-op3: the reveal never landed, so the redeem half must not run.
    expect(mockApi.redeemSteamKey).not.toHaveBeenCalled()

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

  // 260823-op3: the manual "Mark as redeemed" button is now a NON-Steam
  // affordance on the happy path (Steam marks itself), so this exercises a
  // gog key. Its Steam counterpart — a mark-redeemed failure after Steam has
  // already accepted the key — is deliberately swallowed, since reporting a
  // failure would misstate what happened; the next sync reconciles the row.
  it('WR-05: a rejected humbleMarkRedeemed stays on the key step (retryable) and never calls onDone', async () => {
    const onDone = jest.fn()
    const humbleKey = makeHumbleKey({ platform: 'gog' })
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
    // 260823-op3: non-Steam — the manual mark-redeemed path this covers.
    const humbleKey = makeHumbleKey({ platform: 'gog' })
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
