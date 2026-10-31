/**
 * The pinned fallback engine table (phase 59, D-08 release lever).
 *
 * Each GameLib release ships exactly one `current` pin. Gcenx's GitHub releases
 * are not immutable, so the exact build is fixed here by size + sha256 and the
 * downloader refuses anything else. No floating tag is ever used.
 *
 * `previous` is null: no earlier GameLib release shipped a pin, so there is no
 * rollback target yet. The next release that bumps the pin moves this `current`
 * into `previous` (and writes the new build into `current`); retention keeps
 * both on disk (see fallbackEngine.pruneUnpinnedEngines).
 */

export type PinnedArtifact = {
  version: string
  url: string
  size: number
  sha256: string
  archiveName: string
}

export type EnginePin = {
  id: string
  label: string
  wine: PinnedArtifact
  dxvk: PinnedArtifact
}

export const ENGINE_PINS: Readonly<{
  current: EnginePin
  previous: EnginePin | null
}> = {
  current: {
    id: 'wine-staging-11.20',
    label: 'Wine-Staging 11.20 + DXVK-macOS 1.10.3 (built-in)',
    wine: {
      version: '11.20',
      url: 'https://github.com/Gcenx/macOS_Wine_builds/releases/download/11.20/wine-staging-11.20-osx64.tar.xz',
      size: 227975304,
      sha256:
        '4df858c5e72920deaf123cbc29fa2b9e64c23bcf2dea59e0a7047b879b9cd952',
      archiveName: 'wine-staging-11.20-osx64.tar.xz'
    },
    dxvk: {
      version: 'v1.10.3-20230507-repack',
      url: 'https://github.com/Gcenx/DXVK-macOS/releases/download/v1.10.3-20230507-repack/dxvk-macOS-async-v1.10.3-20230507-repack.tar.gz',
      size: 2793443,
      sha256:
        'acd1520ad105d8ef124a09c8e11a259a5dc8bdc565ad18e0e52693f9807b2477',
      archiveName: 'dxvk-macOS-async-v1.10.3-20230507-repack.tar.gz'
    }
  },
  previous: null
}

export function pinnedEngineIdsFrom(pins: {
  current: EnginePin
  previous: EnginePin | null
}): string[] {
  return pins.previous ? [pins.current.id, pins.previous.id] : [pins.current.id]
}

export function pinnedEngineIds(): string[] {
  return pinnedEngineIdsFrom(ENGINE_PINS)
}

export function pinById(id: string): EnginePin | null {
  if (typeof id !== 'string') return null
  if (id === ENGINE_PINS.current.id) return ENGINE_PINS.current
  if (ENGINE_PINS.previous && id === ENGINE_PINS.previous.id)
    return ENGINE_PINS.previous
  return null
}
