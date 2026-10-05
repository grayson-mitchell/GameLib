/**
 * Behavioural tests for `DXVK.installRemove`'s DLL bookkeeping (todo
 * `2026-10-05-wine-and-keyring-minor-defects-from-phase-34-5-review.md`, item 2):
 *
 *   - on a 64-bit prefix, `restore` must remove the 32-bit DLLs from `syswow64` as well as the
 *     64-bit ones from `system32` (the `concat` result used to be discarded);
 *   - every `reg add` / `reg delete` must have finished before `installRemove` resolves, and on
 *     `restore` before `wineboot -u` starts (they used to run inside `forEach(async ...)`).
 *
 * NO REAL WINE IS RUN. `runWineCommand` is mocked and only records the order in which each
 * command starts and finishes. The prefix and tools tree are real directories under a
 * per-test `mkdtemp` root, so the file removal is observed on disk.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { GameSettings } from 'common/types'

const mockRunWineCommand = jest.fn()

jest.mock('../../storeManagers', () => ({ libraryManagerMap: {} }))

jest.mock('../../launcher', () => ({
  runWineCommand: (...args: unknown[]) => mockRunWineCommand(...args),
  setupEnvVars: () => ({}),
  setupWineEnvVars: () => ({}),
  validWine: () => Promise.resolve(true)
}))

// One contained root per file, fixed at mock time: `toolsPath`/`userHome` are plain constants in
// the real module, and the importer binds them when `tools/index.ts` loads. Each test reseeds
// the tree beneath it from scratch.
jest.mock('backend/constants/paths', () => {
  const { mkdtempSync } = jest.requireActual('fs')
  const { tmpdir } = jest.requireActual('os')
  const { join } = jest.requireActual('path')
  const root = mkdtempSync(join(tmpdir(), 'gamelib-dxvk-'))
  return {
    ...jest.requireActual('backend/constants/paths'),
    toolsPath: join(root, 'tools'),
    userHome: root
  }
})

// `isMac` would rewrite the tool to `dxvk-macOS` and change the tree under test.
jest.mock('backend/constants/environment', () => ({
  ...jest.requireActual('backend/constants/environment'),
  isMac: false
}))

jest.mock('backend/logger', () => {
  const { LogPrefix } = jest.requireActual('backend/logger/constants')
  return {
    LogPrefix,
    logError: jest.fn(),
    logInfo: jest.fn(),
    logWarning: jest.fn(),
    logDebug: jest.fn()
  }
})

import { DXVK } from '../index'
import { toolsPath, userHome } from 'backend/constants/paths'

const DLLS = ['d3d9.dll', 'd3d11.dll']
const VERSION = 'dxvk-2.3'

let root: string
let prefix: string
let events: string[]

function label(commandParts: string[]): string {
  return commandParts[0] === 'reg'
    ? `${commandParts[1]}:${commandParts[4]}`
    : commandParts.join(' ')
}

function seed(): void {
  root = userHome
  rmSync(toolsPath, { recursive: true, force: true })
  prefix = mkdtempSync(join(root, 'prefix-'))

  const toolDir = join(toolsPath, 'dxvk')
  for (const arch of ['x32', 'x64']) {
    mkdirSync(join(toolDir, VERSION, arch), { recursive: true })
    for (const dll of DLLS) writeFileSync(join(toolDir, VERSION, arch, dll), '')
  }
  writeFileSync(join(toolDir, 'latest_dxvk'), VERSION)

  for (const dir of ['system32', 'syswow64']) {
    mkdirSync(join(prefix, 'drive_c', 'windows', dir), { recursive: true })
    for (const dll of DLLS)
      writeFileSync(join(prefix, 'drive_c', 'windows', dir, dll), '')
  }
  writeFileSync(join(prefix, '.update-timestamp'), '')
}

const settings = () =>
  ({
    winePrefix: prefix,
    wineVersion: { bin: '/usr/bin/wine', name: 'Wine', type: 'wine' }
  }) as unknown as GameSettings

beforeEach(() => {
  seed()
  events = []
  mockRunWineCommand.mockImplementation(
    async ({ commandParts }: { commandParts: string[] }) => {
      const name = label(commandParts)
      events.push(`start ${name}`)
      // Settle on a later macrotask, so an un-awaited caller visibly races ahead.
      await new Promise((resolve) => setImmediate(resolve))
      events.push(`end ${name}`)
      return { stdout: '', stderr: '' }
    }
  )
})

afterEach(() => {
  rmSync(prefix, { recursive: true, force: true })
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('DXVK.installRemove restore on a 64-bit prefix', () => {
  it('removes the 32-bit DLLs from syswow64 as well as the 64-bit ones from system32', async () => {
    await DXVK.installRemove(settings(), 'dxvk', 'restore')

    for (const dll of DLLS) {
      expect(existsSync(join(prefix, 'drive_c/windows/system32', dll))).toBe(
        false
      )
      expect(existsSync(join(prefix, 'drive_c/windows/syswow64', dll))).toBe(
        false
      )
    }
  })

  it('finishes every reg delete before wineboot -u starts', async () => {
    await DXVK.installRemove(settings(), 'dxvk', 'restore')

    const deletes = events.filter((e) => e.startsWith('end delete:'))
    // 2 DLLs x (64-bit + 32-bit) overrides.
    expect(deletes).toHaveLength(4)
    const winebootStart = events.indexOf('start wineboot -u')
    expect(winebootStart).toBeGreaterThan(-1)
    for (const end of deletes) {
      expect(events.indexOf(end)).toBeLessThan(winebootStart)
    }
  })
})

describe('DXVK.installRemove backup', () => {
  it('does not resolve until every reg add has finished', async () => {
    await DXVK.installRemove(settings(), 'dxvk', 'backup')
    events.push('resolved')

    const adds = events.filter((e) => e.startsWith('end add:'))
    expect(adds).toHaveLength(4)
    for (const end of adds) {
      expect(events.indexOf(end)).toBeLessThan(events.indexOf('resolved'))
    }
  })
})
