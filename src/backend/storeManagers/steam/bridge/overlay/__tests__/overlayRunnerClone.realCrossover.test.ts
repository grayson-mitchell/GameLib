/**
 * Phase 60 plan 05: opt-in arm that builds the overlay clone from the real
 * CrossOver. Runs only with GAMELIB_REAL_CROSSOVER=1 on a Mac that has
 * CrossOver installed; never part of CI. The installed CrossOver is only read.
 */
import { existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

jest.mock('backend/logger', () => ({
  logWarning: jest.fn(),
  logInfo: jest.fn(),
  logDebug: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Backend: 'Backend', Steam: 'Steam' }
}))

import { createRunTool } from 'backend/engine/runTool'
import { createRealRunner } from 'backend/testUtils/realRunner'
import {
  DYLD_ENTITLEMENT,
  STOCK_LOADER_ENTITLEMENTS
} from '../../drm/runnerEntitlements'
import {
  LOADER_REL,
  WINELOADER_REL,
  sha256File
} from '../../drm/runnerCrossover'
import {
  detectCrossoverForOverlay,
  ensureOverlayRunnerClone
} from '../overlayRunnerClone'

const CX_BIN =
  '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin'
const CX_ROOT = '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver'

const maybe =
  process.platform === 'darwin' &&
  process.env.GAMELIB_REAL_CROSSOVER === '1' &&
  existsSync(join(CX_ROOT, 'bin', 'wineloader'))
    ? describe
    : describe.skip

const real = createRealRunner()
const runTool = createRunTool({ runner: real.runner })
afterAll(() => real.dispose())

function entitlements(loader: string): string {
  return real.runner.runSync(
    '/usr/bin/codesign',
    ['-d', '--entitlements', '-', '--xml', loader],
    { timeoutMs: 60_000, reason: 'inspect the real overlay clone (opt-in arm)' }
  ).stdout
}

maybe('overlay runner clone against the real CrossOver', () => {
  let appFolder = ''
  beforeAll(() => {
    appFolder = mkdtempSync(join(tmpdir(), 'gl real app-'))
  })
  afterAll(() => {
    if (appFolder) rmSync(appFolder, { recursive: true, force: true })
  })

  it('clones, re-signs both loaders, leaves the install untouched, then caches', async () => {
    const before = [
      await sha256File(join(CX_ROOT, LOADER_REL)),
      await sha256File(join(CX_ROOT, WINELOADER_REL))
    ]
    const detected = await detectCrossoverForOverlay(
      {
        appFolder,
        crossoverBinDir: CX_BIN
      },
      { runTool, runner: real.runner }
    )
    expect(detected.status).toBe('ok')
    if (detected.status !== 'ok') return

    const t0 = Date.now()
    const first = await ensureOverlayRunnerClone(
      {
        appFolder,
        crossover: detected.crossover
      },
      { runTool }
    )
    console.log(`overlay clone took ${Date.now() - t0} ms`)
    expect(first).toMatchObject({ status: 'ok' })
    if (first.status !== 'ok') return
    expect(first.runner.source).toBe('clone')

    for (const rel of [LOADER_REL, WINELOADER_REL]) {
      const xml = entitlements(join(first.runner.cxRoot, rel))
      expect(xml).toContain(DYLD_ENTITLEMENT)
      for (const k of STOCK_LOADER_ENTITLEMENTS) expect(xml).toContain(k)
    }

    expect([
      await sha256File(join(CX_ROOT, LOADER_REL)),
      await sha256File(join(CX_ROOT, WINELOADER_REL))
    ]).toEqual(before)

    const second = await ensureOverlayRunnerClone(
      {
        appFolder,
        crossover: detected.crossover
      },
      { runTool }
    )
    expect(second).toMatchObject({ status: 'ok', runner: { source: 'cache' } })
  }, 120_000)
})
