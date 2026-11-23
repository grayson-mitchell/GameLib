/**
 * The Steam launch's writes to Rust's engine state (87-42, 87-56b): the ledger's answer is Rust's, the selection is
 * validated here and written to the view the synchronous reads share, and a Rust write that fails is logged and never
 * stops the launch's cleanup.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'graceful-fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  RUST_ENGINE_LEDGER_MARK_RUNNING,
  RUST_ENGINE_LEDGER_MARK_STOPPED,
  RUST_ENGINE_SELECTION_CLEAR
} from 'common/types/sidecarTransport'
import type {
  EngineSelection,
  NonCrossoverSelection
} from 'common/types/engine'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { engineSelectionView } from 'backend/enginewine/selectionView'
import * as logger from 'backend/logger'
import {
  dropEngineSelection,
  recordGameRunning,
  recordGameStopped,
  setSteamEngineSelection
} from '../engine/engineSync'

const CX: EngineSelection = {
  kind: 'crossover',
  reason: 'cx-healthy',
  crossoverBuild: null,
  binDir: '/cx/bin'
}

function transport(answer: unknown = true, reject = false) {
  const calls: Array<[string, unknown]> = []
  const rust: RustInvokeDeps = {
    requestRustInvoke: ((channel: string, args: unknown[]) => {
      calls.push([channel, args[0]])
      return reject
        ? Promise.reject(new Error('engine:down'))
        : Promise.resolve(answer)
    }) as never
  }
  return { rust, calls }
}

describe('engineSync', () => {
  let warned: jest.SpyInstance
  beforeEach(() => {
    engineSelectionView.reset()
    warned = jest
      .spyOn(logger, 'logWarning')
      .mockImplementation(() => undefined)
  })
  afterEach(() => jest.restoreAllMocks())

  it('answers what Rust answers for a running game', async () => {
    const yes = transport(true)
    expect(await recordGameRunning(yes.rust, 'GameLib-steam-620', '620')).toBe(
      true
    )
    expect(yes.calls).toEqual([
      [
        RUST_ENGINE_LEDGER_MARK_RUNNING,
        { bottleName: 'GameLib-steam-620', key: '620' }
      ]
    ])
    // Rust refuses what the ledger refuses; the answer stands even for a name the fallback rule would accept.
    const no = transport(false)
    expect(await recordGameRunning(no.rust, 'GameLib-steam-620', '620')).toBe(
      false
    )
    expect(warned).not.toHaveBeenCalled()
  })

  it('on a failed call answers the ledger rule: an unsafe bottle or a non-Steam key is still refused', async () => {
    const down = transport(true, true)
    expect(await recordGameRunning(down.rust, 'GameLib-steam-620', '620')).toBe(
      true
    )
    expect(await recordGameRunning(down.rust, 'a/b', '620')).toBe(false)
    expect(await recordGameRunning(down.rust, 'GameLib-gog-1', 'gog:1')).toBe(
      false
    )
    expect(await recordGameRunning(down.rust, '..', '620')).toBe(false)
    expect(warned).toHaveBeenCalledTimes(4)
  })

  it('an unreadable reply is logged and answered by the ledger rule', async () => {
    const odd = transport({ marked: true })
    expect(await recordGameRunning(odd.rust, 'GameLib-steam-620', '620')).toBe(
      true
    )
    expect(await recordGameRunning(odd.rust, 'a/b', '620')).toBe(false)
    expect(warned).toHaveBeenCalledTimes(2)
  })

  it('drops a stopped game in Rust and a selection from the view and Rust', async () => {
    const { rust, calls } = transport()
    await recordGameStopped(rust, 'GameLib-steam-620', '620')
    expect(setSteamEngineSelection('620', CX)).toBe(true)
    expect(engineSelectionView.get('620')).toEqual(CX)
    await dropEngineSelection(rust, '620')
    expect(engineSelectionView.get('620')).toBeUndefined()
    expect(calls.map(([channel]) => channel)).toEqual([
      RUST_ENGINE_LEDGER_MARK_STOPPED,
      RUST_ENGINE_SELECTION_CLEAR
    ])
  })

  it('logs a Rust write that failed and still finishes the local one', async () => {
    const { rust } = transport(true, true)
    setSteamEngineSelection('620', CX)
    await dropEngineSelection(rust, '620')
    await recordGameStopped(rust, 'GameLib-steam-620', '620')
    expect(engineSelectionView.get('620')).toBeUndefined()
    expect(warned).toHaveBeenCalledTimes(2)
  })
})

describe('setSteamEngineSelection', () => {
  let dir: string
  beforeEach(() => {
    engineSelectionView.reset()
    dir = mkdtempSync(join(tmpdir(), 'engine-sync-'))
    jest.spyOn(logger, 'logInfo').mockImplementation(() => undefined)
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    jest.restoreAllMocks()
  })

  const pinned = (
    wineBin: string,
    wineserverBin: string
  ): NonCrossoverSelection => ({
    kind: 'pinned',
    pinId: 'wine-pin',
    reason: 'cx-missing',
    wineBin,
    wineserverBin,
    label: 'Pin',
    version: '1',
    dxvk: { dir: '/dxvk', version: '2' }
  })

  it('refuses a key that is not a Steam app id and registers nothing', () => {
    expect(setSteamEngineSelection('gog:1', CX)).toBe(false)
    expect(setSteamEngineSelection('', CX)).toBe(false)
    expect(setSteamEngineSelection('12345678901', CX)).toBe(false)
    expect(engineSelectionView.get('gog:1')).toBeUndefined()
  })

  it('refuses a non-CrossOver selection whose wine or wineserver binary is missing', () => {
    const wine = join(dir, 'wine')
    const server = join(dir, 'wineserver')
    writeFileSync(wine, '')
    expect(setSteamEngineSelection('620', pinned(wine, server))).toBe(false)
    expect(setSteamEngineSelection('620', pinned(server, wine))).toBe(false)
    expect(engineSelectionView.get('620')).toBeUndefined()
  })

  it('stores a copy of a valid non-CrossOver selection and logs the engine line', () => {
    const wine = join(dir, 'wine')
    const server = join(dir, 'wineserver')
    writeFileSync(wine, '')
    writeFileSync(server, '')
    const sel = pinned(wine, server)
    expect(setSteamEngineSelection('620', sel)).toBe(true)
    const stored = engineSelectionView.get('620')
    expect(stored).toEqual(sel)
    expect(stored).not.toBe(sel)
    expect((stored as NonCrossoverSelection).dxvk).not.toBe(sel.dxvk)
    expect(logger.logInfo).toHaveBeenCalledWith(
      'Engine: 620 uses engine=pinned name="Pin" version=1 reason=cx-missing',
      logger.LogPrefix.Backend
    )
  })

  it('stores a CrossOver selection without touching the disk', () => {
    expect(setSteamEngineSelection('620', CX)).toBe(true)
    expect(engineSelectionView.get('620')).toEqual(CX)
    expect(engineSelectionView.get('620')).not.toBe(CX)
  })
})
