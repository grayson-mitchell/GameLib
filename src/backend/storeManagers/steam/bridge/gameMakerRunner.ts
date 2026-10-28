/**
 * quick 261028-k7l: generic GameMaker D3D11 runner detection for the Steam
 * bridge launch.
 *
 * Todo `.planning/todos/pending/2026-10-26-gamemaker-d3d11-titles-need-dxvk-on-the-bridge.md`
 * (follow-up to the completed `2026-10-25-mining-mechs-win32-error-dialogs-on-launch.md`):
 * the GameMaker D3D11 runner probes MSAA with
 * `GR_D3D_Device->CheckMultisampleQualityLevels`, which fails under
 * CrossOver's D3DMetal (four `Win32 function failed: HRESULT: 0x80070057`
 * dialogs). DXVK answers it. A per-app fix file finds affected titles one at
 * a time, so the rule is generic but narrow: ALL THREE signals must hold.
 *
 *   1. a `data.win` FILE beside the exe,
 *   2. `d3d11.dll` in the exe's PE import table (case-insensitive),
 *   3. the ASCII string `GR_D3D_Device->CheckMultisampleQualityLevels` in the exe.
 *
 * Measured 2026-10-28 on Mining Mechs (1603180) `Mining Mechs.exe` (PE32+,
 * 15.7 MB): imports d3d11.dll, contains the probe string, data.win beside it.
 * Signal 3 replaces the unmeasurable "runner >= 2024.x" check: the runner
 * version is not present statically (exe version resource 1.0.0.0, data.win
 * GEN8 IDE version 2.0.0.0). Fields of Mistria (2142790; Rust/SDL3, no
 * data.win, no d3d11 import) is the counter-example and must not match.
 *
 * Never throws: failures log a warning and report no match. The caller logs
 * the applied default.
 */
import { readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { logWarning, LogPrefix } from 'backend/logger'

import { readPeImportedDllNames } from './peSteamDrm'

// ts-prune-ignore-next
export const GAMEMAKER_MSAA_PROBE =
  'GR_D3D_Device->CheckMultisampleQualityLevels'

// Bounds memory: the exe is read once into a Buffer.
const MAX_EXE_SCAN_BYTES = 512 * 1024 * 1024

type GameMakerRunnerSignals = {
  match: boolean
  dataWin: boolean
  d3d11Import: boolean
  msaaProbe: boolean
}

const signals = (
  dataWin: boolean,
  d3d11Import = false,
  msaaProbe = false
): GameMakerRunnerSignals => ({
  match: dataWin && d3d11Import && msaaProbe,
  dataWin,
  d3d11Import,
  msaaProbe
})

export async function detectGameMakerD3d11Runner(
  exePath: string
): Promise<GameMakerRunnerSignals> {
  const dataWinPath = join(dirname(exePath), 'data.win')
  try {
    const st = await stat(dataWinPath)
    if (!st.isFile()) return signals(false)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code
    if (code !== 'ENOENT' && code !== 'ENOTDIR') {
      logWarning(
        `GameMaker runner detection could not stat "${dataWinPath}": ${String(error)}`,
        LogPrefix.Steam
      )
    }
    return signals(false)
  }

  try {
    const exeStat = await stat(exePath)
    if (!exeStat.isFile() || exeStat.size > MAX_EXE_SCAN_BYTES) {
      logWarning(
        `GameMaker runner detection skipped "${exePath}": not a regular file or larger than ${MAX_EXE_SCAN_BYTES} bytes`,
        LogPrefix.Steam
      )
      return signals(true)
    }
    const buf = await readFile(exePath)
    const names = readPeImportedDllNames((offset, length) =>
      offset + length > buf.length
        ? null
        : buf.subarray(offset, offset + length)
    )
    const d3d11Import =
      names?.some((n) => n.toLowerCase() === 'd3d11.dll') ?? false
    const msaaProbe = buf.includes(GAMEMAKER_MSAA_PROBE, 0, 'latin1')
    return signals(true, d3d11Import, msaaProbe)
  } catch (error) {
    logWarning(
      `GameMaker runner detection failed for "${exePath}": ${String(error)}`,
      LogPrefix.Steam
    )
    return signals(true)
  }
}
