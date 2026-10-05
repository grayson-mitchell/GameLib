/**
 * Todo `2026-10-05-long-running-wine-and-sync-channels-hit-the-60s-invoke-timeout`:
 * `EacRuntime`'s toggle handler set `installing` true, awaited
 * `window.api.downloadRuntime('eac_runtime')` and reset it on the next line
 * -- with no try/finally. Any rejection (the old 60s invoke bound, a failed
 * Lutris lookup, a broken extract) left the "Installing EAC Runtime..."
 * spinner up until the settings screen was remounted, and told the user
 * nothing.
 *
 * No jsdom / react-test-renderer here (see `src/frontend/jest.config.js`),
 * so this uses the project's hand-rolled hook harness (`remountSafety.test.tsx`
 * precedent): `useState` is backed by persistent slots, the component is
 * invoked as a plain function, and the returned element tree is inspected.
 */
import type { ReactElement } from 'react'

const mockShowDialogModal = jest.fn()
const mockSetEacRuntime = jest.fn()

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let stateSlots: unknown[] = []
  let stateCursor = 0
  return {
    ...actualReact,
    useState: (initial: unknown) => {
      const idx = stateCursor++
      if (idx >= stateSlots.length) stateSlots[idx] = initial
      const setState = (value: unknown) => {
        stateSlots[idx] = value
      }
      return [stateSlots[idx], setState]
    },
    useContext: () => ({
      showDialogModal: mockShowDialogModal,
      platform: 'linux'
    }),
    __beginRender: () => {
      stateCursor = 0
    },
    __resetMount: () => {
      stateSlots = []
      stateCursor = 0
    }
  }
})

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) => defaultValue ?? _key
  })
}))

jest.mock('frontend/components/UI', () => ({
  ToggleSwitch: 'ToggleSwitch'
}))

jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: 'FontAwesomeIcon'
}))

// useGameMode is reported ON so the Flatpak GameMode prompt never fires;
// eacRuntime is OFF so the toggle takes the install branch.
jest.mock('frontend/hooks/useSetting', () => ({
  __esModule: true,
  default: (key: string) =>
    key === 'eacRuntime' ? [false, mockSetEacRuntime] : [true, jest.fn()]
}))

import * as React from 'react'
import EacRuntime from '../EacRuntime'

const harness = React as unknown as {
  __beginRender: () => void
  __resetMount: () => void
}

type Tree = ReactElement<{
  children: [ReactElement<{ handleChange: () => Promise<void> }>, unknown]
}>

function render(): Tree {
  harness.__beginRender()
  return EacRuntime() as Tree
}

const mockApi = {
  isRuntimeInstalled: jest.fn(),
  downloadRuntime: jest.fn()
}

beforeEach(() => {
  harness.__resetMount()
  ;(globalThis as unknown as { window: unknown }).window = {
    api: mockApi,
    isFlatpak: false
  }
  mockApi.isRuntimeInstalled.mockResolvedValue(false)
})

describe('EacRuntime install failure', () => {
  it('clears the installing spinner and reports the error when downloadRuntime rejects', async () => {
    mockApi.downloadRuntime.mockRejectedValue(
      new Error('sidecar invoke timed out: downloadRuntime')
    )

    const handleChange = render().props.children[0].props.handleChange
    await handleChange().catch(() => undefined)

    const [, spinner] = render().props.children
    expect(spinner).toBe(false)
    expect(mockSetEacRuntime).not.toHaveBeenCalled()
    expect(mockShowDialogModal).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ERROR' })
    )
  })

  it('still enables the runtime after a successful download', async () => {
    mockApi.downloadRuntime.mockResolvedValue(true)

    await render().props.children[0].props.handleChange()

    expect(render().props.children[1]).toBe(false)
    expect(mockSetEacRuntime).toHaveBeenCalledWith(true)
    expect(mockShowDialogModal).not.toHaveBeenCalled()
  })
})
