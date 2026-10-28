/**
 * Phase 56 plan 06 (D-03, D-09): pinned ntdll patch rows. The table is also
 * the CrossOver allowlist: a build yields a row only when both the build and
 * the clean ntdll sha256 match, and an unlisted build never does.
 *
 * Values equal 56-03's DETOUR_BUILD_ROWS for the same build.
 */

// ts-prune-ignore-next
export type NtdllPatchRow = {
  crossoverBuild: string
  cleanSize: number
  cleanSha256: string
  hookRva: number
  /** hex of the bytes stolen from the hook site */
  stolenBytes: string
  sectionName: string
  sectionRva: number
  sectionVirtualSize: number
  sectionRawSize: number
  sectionCharacteristics: number
  payloadSha256: string
  patchedSha256: string
}

// ts-prune-ignore-next
export const NTDLL_PATCH_ROWS: Readonly<Record<string, NtdllPatchRow>> = {
  '26.3.0.39832': {
    crossoverBuild: '26.3.0.39832',
    cleanSize: 685648,
    cleanSha256:
      '6dff64c00793ce92124f1316985c63783f539f26b392975c70f57637458d2387',
    hookRva: 0x44972,
    stolenBytes: '4883bc24f000000000',
    sectionName: '.npdet',
    sectionRva: 0xae000,
    sectionVirtualSize: 0x1000,
    sectionRawSize: 0x1000,
    sectionCharacteristics: 0x60000020,
    payloadSha256:
      'e35b834408599c45f30b23a6d2bf38acfa5c3df4d15206617c471e23a4a01bfb',
    patchedSha256:
      'c0e21a9a5250f0a97c08d3c3e1798566255387213e2553b1e555264fb9ded97e'
  }
}

// ts-prune-ignore-next
export function findNtdllPatchRow(
  build: string,
  cleanSha256: string
): NtdllPatchRow | null {
  if (!Object.prototype.hasOwnProperty.call(NTDLL_PATCH_ROWS, build)) {
    return null
  }
  const row = NTDLL_PATCH_ROWS[build]
  return row.cleanSha256 === cleanSha256 ? row : null
}

// ts-prune-ignore-next
export function supportedCrossoverBuilds(): string[] {
  return Object.keys(NTDLL_PATCH_ROWS).sort()
}
