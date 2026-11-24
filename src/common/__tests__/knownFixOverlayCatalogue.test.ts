/**
 * Drift test for `src/common/knownFixOverlayCatalogue.json` (Phase 88, 88-03, D-03).
 *
 * The Rust `gamelib-knownfix` crate reads this one file (`catalogue.rs`, `include_str!`) for the
 * overlay pins: which archive and which files the installer trusts, fixed by size and sha256. The TS
 * `KNOWN_FIX_OVERLAY_CATALOGUE` is built from the same file, so this test proves the exported view
 * equals the JSON field for field. The URL shapes are pinned here as literals and the Rust crate pins
 * the same two strings, so neither side can change what a download is checked against alone.
 */
import {
  KNOWN_FIX_OVERLAY_CATALOGUE,
  KNOWN_FIX_OVERLAY_NOTICES_URL,
  KNOWN_FIX_OVERLAY_TARGET_ENV,
  lookupKnownFixOverlay,
  overlayArchiveUrl
} from '../knownFixOverlayCatalogue'
import catalogueJson from '../knownFixOverlayCatalogue.json'

const ARCHIVE_URL =
  'https://github.com/grayson-mitchell/GameLib/releases/download/overlay-gst-libav-1.24.13-x86_64/gst-libav-1.24.13-macos-x86_64.tar.gz'
const NOTICES_URL =
  'https://github.com/grayson-mitchell/GameLib/releases/tag/overlay-gst-libav-1.24.13-x86_64'

describe('knownFixOverlayCatalogue.json', () => {
  it('equals the TS catalogue and target env field for field', () => {
    expect(KNOWN_FIX_OVERLAY_TARGET_ENV).toEqual(catalogueJson.targetEnv)
    expect(Object.values(KNOWN_FIX_OVERLAY_CATALOGUE)).toEqual(
      catalogueJson.entries
    )
    expect(Object.keys(KNOWN_FIX_OVERLAY_CATALOGUE)).toEqual(
      catalogueJson.entries.map((entry) => entry.id)
    )
  })

  it('anti-vacuity: a copy with one changed file sha256 is not equal', () => {
    const tampered = structuredClone(catalogueJson)
    const file = tampered.entries[0]?.files[0]
    expect(file).toBeDefined()
    if (!file) return
    file.sha256 = file.sha256.replace(/^./, (c) => (c === '0' ? '1' : '0'))
    expect(tampered.entries).not.toEqual(
      Object.values(KNOWN_FIX_OVERLAY_CATALOGUE)
    )
    expect(file.sha256).not.toBe(
      KNOWN_FIX_OVERLAY_CATALOGUE['gst-libav-1.24.13']?.files[0]?.sha256
    )
  })

  it('anti-vacuity: the file carries the pinned overlay', () => {
    const entry = catalogueJson.entries[0]
    expect(entry?.id).toBe('gst-libav-1.24.13')
    expect(entry?.archiveSha256).toBe(
      '57e5f74b66116d5074771cfc18c112a5a8b7e8b76a71b0897496e2dedbc7cced'
    )
    expect(entry?.archiveSize).toBe(8279592)
    expect(entry?.files).toHaveLength(10)
    expect(catalogueJson.targetEnv['gstreamer-plugin-path']).toBe(
      'GST_PLUGIN_PATH'
    )
    for (const file of entry?.files ?? []) {
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  it('builds the archive and notices URLs the Rust crate pins as the same literals', () => {
    const entry = lookupKnownFixOverlay('gst-libav-1.24.13')
    expect(entry).toBeDefined()
    if (!entry) return
    expect(overlayArchiveUrl(entry)).toBe(ARCHIVE_URL)
    expect(KNOWN_FIX_OVERLAY_NOTICES_URL).toBe(NOTICES_URL)
  })

  it('looks up own ids only', () => {
    expect(lookupKnownFixOverlay('__proto__')).toBeUndefined()
    expect(lookupKnownFixOverlay('constructor')).toBeUndefined()
    expect(lookupKnownFixOverlay('gst-libav-1.24.13 ')).toBeUndefined()
    expect(lookupKnownFixOverlay(42)).toBeUndefined()
  })
})
