/**
 * MSVC C++ ABI layout of the Steamworks `CCallbackBase` hierarchy.
 *
 * These values are MEASURED, never assumed: they come from the pinned zig
 * 0.16.0 clang MS-ABI dumper run against the SDK-faithful fixture
 * meta/__tests__/fixtures/msvc_ccallbackbase.cpp, committed raw as
 * meta/__tests__/fixtures/msvc_ccallbackbase.layout.txt. They are consumed by
 * meta/gen_vtables.ts in 55-04 as GL_CB_* defines and must change only
 * together with a re-measured dump (meta/__tests__/msvcCallbackBaseLayout.test.ts
 * checks them against the dump and, on darwin, against a live re-measurement).
 *
 * MSVC reverses overloaded virtuals, so the three-arg Run (declared second in
 * the SDK) takes slot 0 and the one-arg Run(void*) takes slot 1.
 */

/** vtable slot of CCallbackBase::Run(void*). */
export const MSVC_CCALLBACKBASE_VSLOT_RUN_1ARG = 1
/** vtable slot of CCallbackBase::Run(void*, bool, SteamAPICall_t). */
export const MSVC_CCALLBACKBASE_VSLOT_RUN_3ARG = 0
/** vtable slot of CCallbackBase::GetCallbackSizeBytes(). */
export const MSVC_CCALLBACKBASE_VSLOT_GET_SIZE = 2

/** Byte offsets of m_nCallbackFlags / m_iCallback per target arch. */
export const MSVC_CCALLBACKBASE_OFFSETS = {
  x64: { flags: 8, iCallback: 12 },
  x86: { flags: 4, iCallback: 8 }
} as const

export const STEAM_CALLBACK_FLAG_REGISTERED = 0x01
export const STEAM_CALLBACK_FLAG_GAMESERVER = 0x02

export interface MsvcCallbackLayout {
  vslotRun1Arg: number
  vslotRun3Arg: number
  vslotGetSize: number
  flagsOffset: number
  iCallbackOffset: number
}

export type MsvcTriple = 'x86_64-pc-windows-msvc' | 'i686-pc-windows-msvc'

const TRIPLES: readonly MsvcTriple[] = [
  'x86_64-pc-windows-msvc',
  'i686-pc-windows-msvc'
]

function vtableIndex(block: string, signature: string, triple: string) {
  for (const line of block.split('\n')) {
    const m = /^\s*(\d+) \| (.*?)\s*$/.exec(line)
    if (m && m[2] === signature) return Number(m[1])
  }
  throw new Error(
    `${triple}: CCallbackBase VFTable has no entry "${signature}"`
  )
}

function parseSection(section: string, triple: string): MsvcCallbackLayout {
  const vt =
    /VFTable indices for 'CCallbackBase'[^\n]*\n((?:\s*\d+ \|[^\n]*\n?)+)/.exec(
      section
    )
  if (!vt) {
    throw new Error(`${triple}: missing VFTable block for 'CCallbackBase'`)
  }
  const block = vt[1]
  const rec =
    /Type: class CCallbackBase\n[\s\S]*?FieldOffsets: \[(\d+), (\d+)\]/.exec(
      section
    )
  if (!rec) {
    throw new Error(
      `${triple}: missing record layout FieldOffsets for CCallbackBase`
    )
  }
  return {
    vslotRun1Arg: vtableIndex(block, 'void CCallbackBase::Run(void *)', triple),
    vslotRun3Arg: vtableIndex(
      block,
      'void CCallbackBase::Run(void *, bool, SteamAPICall_t)',
      triple
    ),
    vslotGetSize: vtableIndex(
      block,
      'int CCallbackBase::GetCallbackSizeBytes()',
      triple
    ),
    flagsOffset: Number(rec[1]) / 8,
    iCallbackOffset: Number(rec[2]) / 8
  }
}

/**
 * Parses dumper output sections introduced by `=== triple: <triple> ...`
 * header lines. Throws (never defaults) when a triple or block is missing.
 */
export function parseMsvcCallbackLayoutDump(
  text: string
): Record<MsvcTriple, MsvcCallbackLayout> {
  const sections = new Map<string, string>()
  const re = /^=== triple: (\S+)[^\n]*\n/gm
  const heads: { triple: string; start: number; bodyStart: number }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    heads.push({
      triple: m[1],
      start: m.index,
      bodyStart: m.index + m[0].length
    })
  }
  heads.forEach((h, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].start : text.length
    if (!sections.has(h.triple)) {
      sections.set(h.triple, text.slice(h.bodyStart, end))
    }
  })
  const out = {} as Record<MsvcTriple, MsvcCallbackLayout>
  for (const triple of TRIPLES) {
    const section = sections.get(triple)
    if (section === undefined) {
      throw new Error(`${triple}: no section in dump (missing VFTable data)`)
    }
    out[triple] = parseSection(section, triple)
  }
  return out
}
