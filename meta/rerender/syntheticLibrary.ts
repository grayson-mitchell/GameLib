import type { GameInfo, Runner } from '../../src/common/types'

const SPLIT: Array<[Runner, number]> = [
  ['legendary', 600],
  ['gog', 500],
  ['nile', 300],
  ['steam', 500],
  ['sideload', 100]
]

// Deterministic: every field is derived from the index, never Math.random.
function makeGame(runner: Runner, i: number): GameInfo {
  const installed = i % 3 === 0
  const appName = `${runner}-perf-${i}`
  return {
    runner,
    app_name: appName,
    title: `Perf Game ${runner} ${String(i).padStart(4, '0')}`,
    art_cover: `https://example.invalid/${appName}/cover.jpg`,
    art_square: `https://example.invalid/${appName}/square.jpg`,
    art_background: `https://example.invalid/${appName}/bg.jpg`,
    art_logo: `https://example.invalid/${appName}/logo.png`,
    is_installed: installed,
    canRunOffline: true,
    folder_name: appName,
    developer: `Dev ${i % 50}`,
    description: '',
    cloud_save_enabled: false,
    namespace: appName,
    save_folder: '',
    save_path: '',
    install: installed
      ? {
          install_path: `/perf/${appName}`,
          executable: 'game.exe',
          install_size: '1 GB',
          is_dlc: false,
          version: '1.0',
          platform: 'Windows',
          appName
        }
      : {}
  } as unknown as GameInfo
}

export function generateSyntheticLibrary(): Record<Runner, GameInfo[]> {
  const out = {} as Record<Runner, GameInfo[]>
  for (const [runner, n] of SPLIT) {
    out[runner] = Array.from({ length: n }, (_, i) => makeGame(runner, i))
  }
  return out
}
