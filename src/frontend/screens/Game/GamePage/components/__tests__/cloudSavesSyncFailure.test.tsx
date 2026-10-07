/**
 * Todo `2026-10-05-long-running-wine-and-sync-channels-hit-the-60s-invoke-timeout`:
 * `CloudSavesSync`'s `executeSync` set `isSyncing` true, awaited the sync and
 * reset it afterwards with no try/finally. A rejected sync (the old 60s invoke
 * bound, Epic/GOG unreachable, a CLI failure) left the game page reading
 * "Syncing... please wait" with every sync menu item disabled until remount.
 *
 * No jsdom / react-test-renderer here (see `src/frontend/jest.config.js`),
 * so this uses the project's hand-rolled hook harness: persistent `useState`
 * slots, the component invoked as a plain function, and the returned element
 * tree walked for the menu items' `onClick` handlers.
 */
import type { ReactElement, ReactNode } from 'react'

const mockShowDialogModal = jest.fn()
const mockSyncSaves = jest.fn()

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
    // GameContext and ContextProvider are both read through useContext; one
    // merged value serves both.
    useContext: () => ({
      gameSettings: {},
      is: { linuxNative: false },
      showDialogModal: mockShowDialogModal
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
    t: (key: string, defaultValue?: string) => defaultValue ?? key
  })
}))

jest.mock('../../../GameContext', () => ({ __esModule: true, default: {} }))
jest.mock('frontend/state/ContextProvider', () => ({
  __esModule: true,
  default: {}
}))
jest.mock('@mui/icons-material', () => ({
  CloudOff: 'CloudOff',
  CloudQueue: 'CloudQueue'
}))
jest.mock('@mui/material', () => ({
  Menu: 'Menu',
  MenuItem: 'MenuItem',
  Divider: 'Divider'
}))
jest.mock('frontend/components/UI/InfoIcon', () => ({
  __esModule: true,
  default: 'InfoIcon'
}))
jest.mock('frontend/components/UI', () => ({ ToggleSwitch: 'ToggleSwitch' }))
jest.mock('frontend/helpers', () => ({
  syncSaves: (...args: unknown[]): unknown => mockSyncSaves(...args)
}))
jest.mock('frontend/hooks/useSetting', () => ({
  __esModule: true,
  default: (key: string) => {
    const values: Record<string, unknown> = {
      autoSyncSaves: false,
      savesPath: '/saves',
      gogSaves: [],
      enableQuickSavesMenu: true
    }
    return [values[key], jest.fn()]
  }
}))

import * as React from 'react'
import type { GameInfo } from 'common/types'
import CloudSavesSync from '../CloudSavesSync'

const harness = React as unknown as {
  __beginRender: () => void
  __resetMount: () => void
}

type El = ReactElement<{
  children?: ReactNode
  onClick?: () => unknown
  disabled?: boolean
}>

const gameInfo = {
  runner: 'legendary',
  app_name: 'Fortnite',
  is_installed: true,
  cloud_save_enabled: true
} as unknown as GameInfo

function render(): El {
  harness.__beginRender()
  return CloudSavesSync({ gameInfo }) as El
}

function collect(node: unknown, out: El[] = []): El[] {
  if (Array.isArray(node)) {
    node.forEach((child) => collect(child, out))
  } else if (node && typeof node === 'object' && 'props' in node) {
    const el = node as El
    out.push(el)
    collect(el.props.children, out)
  }
  return out
}

function downloadItem(tree: El): El {
  const item = collect(tree).find(
    (el) => el.type === 'MenuItem' && el.key === '--skip-upload'
  )
  if (!item) throw new Error('download sync menu item not rendered')
  return item
}

beforeEach(() => {
  harness.__resetMount()
  ;(globalThis as unknown as { window: unknown }).window = {
    api: { getDefaultSavePath: jest.fn(), logError: jest.fn() }
  }
})

describe('CloudSavesSync sync failure', () => {
  it('clears isSyncing and reports the error when the sync rejects', async () => {
    mockSyncSaves.mockRejectedValue(
      new Error('sidecar invoke timed out: syncSaves')
    )

    const onClick = downloadItem(render()).props.onClick!
    await Promise.resolve(onClick()).catch(() => undefined)

    expect(downloadItem(render()).props.disabled).toBe(false)
    expect(mockShowDialogModal).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ERROR' })
    )
  })

  it('clears isSyncing without an error dialog when the sync succeeds', async () => {
    mockSyncSaves.mockResolvedValue('')

    await downloadItem(render()).props.onClick!()

    expect(downloadItem(render()).props.disabled).toBe(false)
    expect(mockShowDialogModal).not.toHaveBeenCalled()
  })
})
