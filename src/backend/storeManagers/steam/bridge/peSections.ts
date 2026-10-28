/**
 * Phase 52 Plan 04 (ROADMAP Scope 4): pure PE section-name parser.
 *
 * Zero imports by design, like importParse.ts, so a census tool can reuse it
 * with no backend module graph attached. Every read is bounds-checked because
 * the exe is untrusted input (any installed game); a malformed or hostile
 * header yields an empty list, never a throw.
 */

/** Callers need only read this many leading bytes of the exe. */
export const PE_SECTION_SCAN_BYTES = 8192
/** Hard cap on sections parsed, whatever the header claims. */
export const MAX_PE_SECTIONS = 96

const SECTION_ENTRY_SIZE = 40
const SECTION_NAME_SIZE = 8

export function parsePeSectionNames(buf: Buffer): string[] {
  if (buf.length < 0x40) return []
  if (buf.readUInt16LE(0) !== 0x5a4d) return []

  const pe = buf.readUInt32LE(0x3c)
  // Compare against length minus width so the check cannot overflow.
  if (pe > buf.length - 24) return []
  if (buf.readUInt32LE(pe) !== 0x00004550) return []

  const count = buf.readUInt16LE(pe + 6)
  const optSize = buf.readUInt16LE(pe + 20)
  const table = pe + 24 + optSize
  if (table > buf.length) return []

  const names: string[] = []
  const n = Math.min(count, MAX_PE_SECTIONS)
  for (let i = 0; i < n; i++) {
    const off = table + i * SECTION_ENTRY_SIZE
    if (off > buf.length - SECTION_ENTRY_SIZE) break
    names.push(
      buf.toString('latin1', off, off + SECTION_NAME_SIZE).replace(/\0+$/, '')
    )
  }
  return names
}

/** Assumption A3: a `.bind` section marks SteamStub. Exact, case-sensitive
 * match. Since Phase 56 (D-12) a launch exe with `.bind` and no CEG markers
 * runs in steamclient-layer DRM mode (drm/steamclientLayerMode.ts
 * resolveBridgeMode). */
export function hasSteamStubSection(names: readonly string[]): boolean {
  return names.includes('.bind')
}
