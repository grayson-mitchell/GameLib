/**
 * GameLib-owned catalogue of the on-demand `lsteamclient` component (Phase 56
 * D-18).
 *
 * The release coordinates and EVERY sum are pinned here, in code that ships in
 * the signed app. They are never fetched. There is one entry per allowlisted
 * CrossOver build. When a rebuild changes any output, the operator re-pins here
 * and in the THIRD-PARTY-NOTICES.md table (56-15).
 *
 * Pure data and helpers: no node or electron imports.
 */

// ts-prune-ignore-next
export type SteamclientLayerFileLicence =
  | 'Steamworks-SDK-License'
  | 'GPL-3.0'
  | 'BSD-3-Clause'
  | 'licence-text'

// ts-prune-ignore-next
export interface SteamclientLayerCatalogueEntry {
  id: string
  crossoverBuild: string
  platform: { os: 'darwin'; arch: 'x86_64'; wine: 'crossover' }
  release: { repo: string; tag: string; asset: string }
  archiveSha256: string
  archiveSize: number
  files: ReadonlyArray<{
    path: string
    sha256: string
    size: number
    licence: SteamclientLayerFileLicence
  }>
}

// ts-prune-ignore-next
export const STEAMCLIENT_LAYER_RELEASE_REPO = 'grayson-mitchell/GameLib'

// ts-prune-ignore-next
export const STEAMWORKS_LICENSE_SHA256 =
  '80fda9147f8ee707cd18d1d6d71b307063fa3a02057a7c789de47f7c003510f1'

/** The six archive members for a build, sorted by byte order. */
// ts-prune-ignore-next
export function steamclientLayerFileNames(
  crossoverBuild: string
): readonly string[] {
  return [
    'LICENSE.lsteamclient',
    'NOTICE',
    `detour-cx${crossoverBuild}.bin`,
    'lsteamclient.dll',
    'lsteamclient.so',
    'steam.exe'
  ].sort()
}

// ts-prune-ignore-next
export function steamclientLayerLicenceFor(
  path: string,
  crossoverBuild: string
): SteamclientLayerFileLicence | undefined {
  switch (path) {
    case 'lsteamclient.dll':
    case 'lsteamclient.so':
      return 'Steamworks-SDK-License'
    case `detour-cx${crossoverBuild}.bin`:
      return 'GPL-3.0'
    case 'steam.exe':
      return 'BSD-3-Clause'
    case 'LICENSE.lsteamclient':
    case 'NOTICE':
      return 'licence-text'
    default:
      return undefined
  }
}

// ts-prune-ignore-next
export const STEAMCLIENT_LAYER_CATALOGUE: Readonly<
  Record<string, SteamclientLayerCatalogueEntry>
> = {
  '26.3.0.39832': {
    id: 'steamclient-layer-cx26.3.0.39832',
    crossoverBuild: '26.3.0.39832',
    platform: { os: 'darwin', arch: 'x86_64', wine: 'crossover' },
    release: {
      repo: STEAMCLIENT_LAYER_RELEASE_REPO,
      tag: 'steamclient-layer-cx26.3.0.39832',
      asset: 'steamclient-layer-cx26.3.0.39832-p58b.tar.gz'
    },
    archiveSha256:
      '769d8532890613ea365c679d7fc1961b1960292cbee6b548125dac72081295e7',
    archiveSize: 5368352,
    files: [
      {
        path: 'LICENSE.lsteamclient',
        sha256:
          '80fda9147f8ee707cd18d1d6d71b307063fa3a02057a7c789de47f7c003510f1',
        size: 7435,
        licence: 'licence-text'
      },
      {
        path: 'NOTICE',
        sha256:
          '289a650147ae83aff4f8412ac98323ab30720810b84349c37d10503a2c4995a9',
        size: 4129,
        licence: 'licence-text'
      },
      {
        path: 'detour-cx26.3.0.39832.bin',
        sha256:
          'e35b834408599c45f30b23a6d2bf38acfa5c3df4d15206617c471e23a4a01bfb',
        size: 832,
        licence: 'GPL-3.0'
      },
      {
        path: 'lsteamclient.dll',
        sha256:
          '8257505948f8f5edc2421607eb1b74f509480c9e2d44d46a067f78e0610fd5f1',
        size: 33936281,
        licence: 'Steamworks-SDK-License'
      },
      {
        path: 'lsteamclient.so',
        sha256:
          'dd48289787223d9e0f75a97da3cc15aa616faa382741e39a5a433fa5cfa5167d',
        size: 2388896,
        licence: 'Steamworks-SDK-License'
      },
      {
        path: 'steam.exe',
        sha256:
          '4a67c58a41792e8a784bea7338adaf3d7d3713dc6d20ccaf61895edfdb32e6ba',
        size: 193536,
        licence: 'BSD-3-Clause'
      }
    ]
  }
}

/** Own-property lookup only, so `__proto__` and `constructor` miss. */
// ts-prune-ignore-next
export function lookupSteamclientLayer(
  crossoverBuild: unknown
): SteamclientLayerCatalogueEntry | undefined {
  if (typeof crossoverBuild !== 'string') return undefined
  return Object.prototype.hasOwnProperty.call(
    STEAMCLIENT_LAYER_CATALOGUE,
    crossoverBuild
  )
    ? STEAMCLIENT_LAYER_CATALOGUE[crossoverBuild]
    : undefined
}

// ts-prune-ignore-next
export function steamclientLayerArchiveUrl(
  entry: SteamclientLayerCatalogueEntry
) {
  const { repo, tag, asset } = entry.release
  return `https://github.com/${repo}/releases/download/${tag}/${asset}`
}

// ts-prune-ignore-next
export function steamclientLayerReleasePageUrl(
  entry: SteamclientLayerCatalogueEntry
) {
  const { repo, tag } = entry.release
  return `https://github.com/${repo}/releases/tag/${tag}`
}
