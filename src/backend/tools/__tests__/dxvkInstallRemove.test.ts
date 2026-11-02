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
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
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
    // One override per DLL NAME: the 64-bit and 32-bit lists share names and DllOverrides is
    // keyed by name, so the old 2 x (64-bit + 32-bit) = 4 calls repeated each edit.
    expect(deletes).toHaveLength(2)
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
    // One override per DLL name (see the restore test above).
    expect(adds).toHaveLength(2)
    for (const end of adds) {
      expect(events.indexOf(end)).toBeLessThan(events.indexOf('resolved'))
    }
  })
})

describe('DXVK.installRemove with a pinned source', () => {
  const SRC_VERSION = 'pinned-1.10.3'
  let srcDir: string

  beforeEach(() => {
    srcDir = mkdtempSync(join(root, 'src-'))
    for (const arch of ['x32', 'x64']) {
      mkdirSync(join(srcDir, arch), { recursive: true })
      for (const dll of DLLS) writeFileSync(join(srcDir, arch, dll), arch)
    }
    // A pinned source needs no `.update-timestamp` and no `latest_dxvk`.
    rmSync(join(prefix, '.update-timestamp'))
    writeFileSync(join(prefix, 'system.reg'), '')
    rmSync(join(toolsPath, 'dxvk'), { recursive: true, force: true })
    for (const dir of ['system32', 'syswow64'])
      for (const dll of DLLS)
        rmSync(join(prefix, 'drive_c/windows', dir, dll), { force: true })
  })

  it('copies from the pinned dir synchronously and records the version before resolving', async () => {
    const ok = await DXVK.installRemove(settings(), 'dxvk', 'backup', {
      dir: srcDir,
      version: SRC_VERSION
    })
    expect(ok).toBe(true)
    for (const dll of DLLS) {
      expect(
        readFileSync(join(prefix, 'drive_c/windows/system32', dll), 'utf-8')
      ).toBe('x64')
      expect(
        readFileSync(join(prefix, 'drive_c/windows/syswow64', dll), 'utf-8')
      ).toBe('x32')
    }
    expect(readFileSync(join(prefix, 'current_dxvk'), 'utf-8')).toBe(
      SRC_VERSION
    )
    // never consulted the tools-dir tree
    expect(existsSync(join(toolsPath, 'dxvk', 'latest_dxvk'))).toBe(false)
  })
})

describe('DXVK.installRemove strict restore with a pinned source', () => {
  let srcDir: string
  const ok = { stdout: '', stderr: '', code: 0 }

  beforeEach(() => {
    srcDir = mkdtempSync(join(root, 'src-'))
    for (const arch of ['x32', 'x64']) {
      mkdirSync(join(srcDir, arch), { recursive: true })
      for (const dll of DLLS) writeFileSync(join(srcDir, arch, dll), arch)
    }
    rmSync(join(prefix, '.update-timestamp'))
    writeFileSync(join(prefix, 'system.reg'), '')
    writeFileSync(join(prefix, 'current_dxvk'), 'v1')
  })

  const restore = (withSource = true) =>
    DXVK.installRemove(
      settings(),
      'dxvk',
      'restore',
      withSource ? { dir: srcDir, version: 'v1' } : undefined
    )
  const versionFile = () => existsSync(join(prefix, 'current_dxvk'))

  it('returns true and removes the version file last when every step succeeds', async () => {
    const order: string[] = []
    mockRunWineCommand.mockImplementation(
      async ({ commandParts }: { commandParts: string[] }) => {
        order.push(commandParts[0] === 'reg' ? 'reg' : commandParts[0])
        order.push(`ver:${versionFile()}`)
        return ok
      }
    )
    expect(await restore()).toBe(true)
    // the version file was still present during every wine step (incl. wineboot)
    expect(order.filter((e) => e.startsWith('ver:'))).not.toContain('ver:false')
    expect(order[order.length - 2]).toBe('wineboot')
    expect(versionFile()).toBe(false)
  })

  it('returns false and keeps the version file when a reg delete fails', async () => {
    mockRunWineCommand.mockImplementation(
      async ({ commandParts }: { commandParts: string[] }) =>
        commandParts[0] === 'reg'
          ? { stdout: '', stderr: 'reg: access denied', code: 1 }
          : ok
    )
    expect(await restore()).toBe(false)
    expect(versionFile()).toBe(true)
  })

  it('treats "unable to find" on a reg delete as already removed', async () => {
    mockRunWineCommand.mockImplementation(
      async ({ commandParts }: { commandParts: string[] }) =>
        commandParts[0] === 'reg'
          ? {
              stdout: '',
              stderr: 'reg: Unable to find the specified registry key or value',
              code: 1
            }
          : ok
    )
    expect(await restore()).toBe(true)
    expect(versionFile()).toBe(false)
  })

  it('returns false and keeps the version file when wineboot -u fails', async () => {
    mockRunWineCommand.mockImplementation(
      async ({ commandParts }: { commandParts: string[] }) =>
        commandParts[0] === 'wineboot' ? { ...ok, code: 3 } : ok
    )
    expect(await restore()).toBe(false)
    expect(versionFile()).toBe(true)
  })

  it('returns false and keeps the version file when a DLL cannot be removed', async () => {
    mockRunWineCommand.mockResolvedValue(ok)
    // a non-empty directory where the DLL should be makes rmSync throw (not ENOENT)
    const blocked = join(prefix, 'drive_c/windows/system32/d3d9.dll')
    rmSync(blocked, { force: true })
    mkdirSync(blocked, { recursive: true })
    writeFileSync(join(blocked, 'keep'), '')
    expect(await restore()).toBe(false)
    expect(versionFile()).toBe(true)
  })

  it('treats an already-absent DLL as success', async () => {
    mockRunWineCommand.mockResolvedValue(ok)
    for (const dir of ['system32', 'syswow64'])
      for (const dll of DLLS)
        rmSync(join(prefix, 'drive_c/windows', dir, dll), { force: true })
    expect(await restore()).toBe(true)
  })

  it('without a source keeps the lenient Heroic toggle behaviour', async () => {
    mockRunWineCommand.mockResolvedValue({
      stdout: '',
      stderr: 'boom',
      code: 1
    })
    rmSync(join(prefix, 'system.reg'))
    writeFileSync(join(prefix, '.update-timestamp'), '')
    writeFileSync(join(toolsPath, 'dxvk', 'latest_dxvk'), VERSION)
    expect(await restore(false)).toBe(true)
  })
})
