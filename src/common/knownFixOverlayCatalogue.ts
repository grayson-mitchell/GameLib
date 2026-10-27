/**
 * GameLib-owned catalogue of tier-2 known-fix overlays (quick 261027-n77).
 *
 * Per the locked delivery decision, the download URL and EVERY sum are pinned
 * here, in code that ships in the signed app. They are never fetched, and a
 * profile entry can only name an overlay `id` (see validateOverlayEntries);
 * it can never carry a URL or a hash. Tier 2 never comes from the remote
 * layer.
 *
 * Pure data and helpers: no node or electron imports, because the frontend
 * imports the notice URL from here.
 */

type KnownFixOverlayTarget = 'gstreamer-plugin-path'

export interface KnownFixOverlayCatalogueEntry {
  id: string
  target: KnownFixOverlayTarget
  /** Directory, relative to the install dir, that is put on the env var. */
  pluginSubdir: string
  platform: { os: 'darwin'; wine: 'crossover' }
  release: { repo: string; tag: string; asset: string }
  archiveSha256: string
  archiveSize: number
  files: ReadonlyArray<{ path: string; sha256: string; size: number }>
}

export const KNOWN_FIX_OVERLAY_TARGET_ENV: Record<
  KnownFixOverlayTarget,
  string
> = {
  'gstreamer-plugin-path': 'GST_PLUGIN_PATH'
}

export const KNOWN_FIX_OVERLAY_CATALOGUE: Readonly<
  Record<string, KnownFixOverlayCatalogueEntry>
> = {
  'gst-libav-1.24.13': {
    id: 'gst-libav-1.24.13',
    target: 'gstreamer-plugin-path',
    pluginSubdir: 'lib/gstreamer-1.0',
    platform: { os: 'darwin', wine: 'crossover' },
    release: {
      repo: 'grayson-mitchell/GameLib',
      tag: 'overlay-gst-libav-1.24.13-x86_64',
      asset: 'gst-libav-1.24.13-macos-x86_64.tar.gz'
    },
    archiveSha256:
      '57e5f74b66116d5074771cfc18c112a5a8b7e8b76a71b0897496e2dedbc7cced',
    archiveSize: 8279592,
    files: [
      {
        path: 'lib/gstreamer-1.0/libgstlibav.dylib',
        sha256:
          'cd114a81e5b9f0813d745b289e7e341157df3bdedea6af338c1b977b39edc31b',
        size: 282624
      },
      {
        path: 'lib/libavcodec.60.dylib',
        sha256:
          '536ef5a82799a2a75a5e2d4f671db4041c0535b5c8d790613f79b3b92a697209',
        size: 14918328
      },
      {
        path: 'lib/libavfilter.9.dylib',
        sha256:
          '62f7e9438018da59fdb398784f12b4f494313adddfdfa1bb43d5efb115e0dbe4',
        size: 183824
      },
      {
        path: 'lib/libavformat.60.dylib',
        sha256:
          '81f7a146399996b31a32e2cbabe96253dd094ec4cc342dbb0f46bb8615a2d43d',
        size: 2296304
      },
      {
        path: 'lib/libavutil.58.dylib',
        sha256:
          'c5c4a15989f7fe23cca36e04ce567ff2a3664d1da967de5573b6008d434b4db4',
        size: 861792
      },
      {
        path: 'lib/libbz2.1.dylib',
        sha256:
          '3b31bb556b30ba793e14d78c5653adf48adbc4db1372af00acc6dcde498128a6',
        size: 85992
      },
      {
        path: 'lib/libpostproc.57.dylib',
        sha256:
          'bc6d727d27caedf1de1c12f943c6aaf2a8175fcfe355fa5505631a0cc85f5068',
        size: 70256
      },
      {
        path: 'lib/libswresample.4.dylib',
        sha256:
          'a85f79423da1fafc749414b9de9a9234825e2827ecfaf5bbecacfe1670f229d1',
        size: 225704
      },
      {
        path: 'lib/libswscale.7.dylib',
        sha256:
          '8e8b54f2d38a18f76ce079e140b60730a9cc274621e921f3a98a40ee18422fc8',
        size: 1151888
      },
      {
        path: 'lib/libz.1.dylib',
        sha256:
          '5d5ff2be35d261fb91b951d8c341574381c8d28fcf4f8f8b68b8dccdf3fc8a3e',
        size: 114040
      }
    ]
  }
}

/** Own-property lookup only, so `__proto__` and `constructor` miss. */
export function lookupKnownFixOverlay(
  id: unknown
): KnownFixOverlayCatalogueEntry | undefined {
  if (typeof id !== 'string') return undefined
  return Object.prototype.hasOwnProperty.call(KNOWN_FIX_OVERLAY_CATALOGUE, id)
    ? KNOWN_FIX_OVERLAY_CATALOGUE[id]
    : undefined
}

export function overlayArchiveUrl(entry: KnownFixOverlayCatalogueEntry) {
  const { repo, tag, asset } = entry.release
  return `https://github.com/${repo}/releases/download/${tag}/${asset}`
}

function overlayReleasePageUrl(entry: KnownFixOverlayCatalogueEntry) {
  const { repo, tag } = entry.release
  return `https://github.com/${repo}/releases/tag/${tag}`
}

export const KNOWN_FIX_OVERLAY_NOTICES_URL = overlayReleasePageUrl(
  KNOWN_FIX_OVERLAY_CATALOGUE['gst-libav-1.24.13']
)
