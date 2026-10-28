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
      asset: 'steamclient-layer-cx26.3.0.39832.tar.gz'
    },
    archiveSha256:
      'c58a40c67c5d9093970227327bcceb5c2e457bc81b0a58559d9cb65777aeb187',
    archiveSize: 5359548,
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
          'dd9c7c74ca5e2b62a82bb32926b45333d7b2fd7f1dd8a917b2feb0579f1c11bc',
        size: 4017,
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
          '22bb19413ce1f66c771c2d54260f6811480375db66c74e60c66a02d307b5cb76',
        size: 33904653,
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
