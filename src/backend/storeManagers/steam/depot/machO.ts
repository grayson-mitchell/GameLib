// Mach-O executable fallback: content-gated +x for landed files whose manifest carried no executable flag (extracted from ../depot.ts, 62-09).

import { logWarning, LogPrefix } from 'backend/logger'
import { open, chmod } from 'node:fs/promises'
import { EXECUTABLE_FLAG, CUSTOM_EXECUTABLE_FLAG } from './planModel'

// ── Phase 23 (23-08 Task 3, G-23-02 VERDICT: H2) — Mach-O executable
// fallback ──────────────────────────────────────────────────────────────
// SECONDARY compensator, never the primary fix. 23-TRACE.md's Live run 2
// VERDICT is H2 CONFIRMED: HUMANKIND's own manifest carries flagBearing=140
// but executableFlagged=0 (distinctFlagValues=[64], Directory only) — the
// manifest genuinely has no EDepotFileFlag executable bits for this
// fallback's primary sibling (applyEDepotFileModes) to apply, and this is
// the NORMAL case for native macOS titles per the trace's cross-title
// census (2 of 3 censused titles carry zero executable flags, the third
// exactly one), not an anomaly to special-case. Steam's own HUMANKIND
// install carries 18,002/18,809 files +x despite its manifest supplying
// zero — the real client derives execute bits by some OTHER means for these
// titles. This fallback narrows that gap for POSIX platforms only, by
// reading the already-landed file's own Mach-O magic bytes — content-gated,
// NEVER path-gated (this file contains zero non-comment "Contents/MacOS"
// occurrences — the 23-08 grep gate). The manifest's own EDepotFileFlag
// executable bits remain the PRIMARY contract; this only fires when the
// manifest supplied none for a file that IS a genuine Mach-O executable.

/** Mach-O / fat-binary magic constants (mach-o/loader.h, mach-o/fat.h). */
const MH_MAGIC = 0xfeedface
const MH_MAGIC_64 = 0xfeedfacf
const FAT_MAGIC = 0xcafebabe

/** mach_header/mach_header_64 `filetype` values this fallback treats as
 *  "should carry +x". MH_EXECUTE is a real executable; MH_DYLIB is a shared
 *  library — 23-TRACE.md's own Live run 1 evidence shows Steam marks BOTH
 *  +x (freetype6.dylib lands -rwxr-xr-x beside freetype6.bundle, which does
 *  not). MH_BUNDLE (0x8) is deliberately excluded: Steam leaves Mach-O
 *  bundles WITHOUT +x (WazHack's unitypurchasing.bundle, HUMANKIND's own
 *  freetype6.bundle) since they are dlopen'd, never exec'd — a naive "any
 *  Mach-O gets +x" rule would over-apply relative to Steam's own behavior,
 *  which is exactly the subtype-discrimination constraint 23-TRACE.md
 *  raises for this fallback. */
const MH_EXECUTE = 0x2
const MH_DYLIB = 0x6

/** Bytes read from the landed file's head to decide Mach-O-ness. Bounded and
 *  small (T-21-02's "never RAM-buffer a whole file" discipline) — reads via
 *  a single positional FileHandle.read, never the whole file.
 *
 *  quick-260819-b1q: this is deliberately NOT enlarged to "fix" fat binaries
 *  whose first slice sits beyond it. A fat_arch's slice offset is arbitrary,
 *  file-dependent content — any fixed buffer is a guess that silently fails
 *  again for the first binary whose slice sits beyond it (reproducing this
 *  exact bug with a bigger number), and enlarging it multiplies the per-file
 *  read cost across ~18.5k files on both the download and resume path. See
 *  `classifyMachOProbe`/`MachOProbeVerdict` below for the real fix: a
 *  second, small, bounded positional read at the slice's own offset. */
const MACHO_PROBE_BYTES = 4096

/** Size of a mach_header/mach_header_64 prefix this fallback actually reads
 *  for the second (slice) probe — magic(4) + cputype(4) + cpusubtype(4) +
 *  filetype(4) is all `isThinMachOExecutable` needs, but 32 bytes matches
 *  the full mach_header_64 and leaves headroom without another constant. */
const MACHO_HEADER_BYTES = 32

/** Structural cap on `fat_header.nfat_arch` (mach-o/fat.h has no real-world
 *  binary anywhere near this many slices — Apple's own universal binaries
 *  top out at a handful). Bounds the untrusted uint32 read from file
 *  content before it is used for anything (T-b1q-01). */
const MACHO_MAX_FAT_ARCH = 32

/** Absolute cap on a fat_arch's slice `offset` before we will even consider
 *  issuing the second positional read for it — 64 MiB, far beyond any real
 *  first-slice offset (HUMANKIND's own is 16384). Bounds the untrusted
 *  uint32 read from file content against a runaway/adversarial value before
 *  it drives a file read (T-b1q-01). */
const MACHO_MAX_SLICE_OFFSET = 64 * 1024 * 1024

/** Reads a mach_header/mach_header_64's `filetype` field (the 4th uint32,
 *  right after magic/cputype/cpusubtype) at `headerOffset`, in whichever
 *  byte order `detectMachOEndianness` already determined for this header —
 *  the two functions must never disagree on endianness. */
function readMachOFiletype(
  buf: Buffer,
  headerOffset: number,
  bigEndian: boolean
): number | undefined {
  const filetypeOffset = headerOffset + 12
  if (buf.length < filetypeOffset + 4) return undefined
  return bigEndian
    ? buf.readUInt32BE(filetypeOffset)
    : buf.readUInt32LE(filetypeOffset)
}

/** Detects a thin (single-architecture) Mach-O header at `offset` and
 *  returns its byte order — little-endian first (the normal case on
 *  today's Intel/Apple-Silicon Macs, where MH_MAGIC_64 (0xfeedfacf) is
 *  stored in the host's own little-endian order), then big-endian (legacy
 *  PowerPC-era files; included since the plan explicitly calls for both
 *  orderings). Returns undefined for anything that isn't a recognized
 *  Mach-O magic at this offset. */
function detectMachOEndianness(
  buf: Buffer,
  offset: number
): boolean | undefined {
  if (buf.length < offset + 4) return undefined
  const magicLE = buf.readUInt32LE(offset)
  if (magicLE === MH_MAGIC || magicLE === MH_MAGIC_64) return false
  const magicBE = buf.readUInt32BE(offset)
  if (magicBE === MH_MAGIC || magicBE === MH_MAGIC_64) return true
  return undefined
}

/**
 * Pure, non-recursive: does a thin (single-architecture) Mach-O header at
 * `offset` within `buf` classify as EXECUTE or DYLIB? Shared by both the
 * thin-at-0 case and the fetched fat slice — a fat magic found INSIDE a
 * slice is declined rather than chased (T-b1q-03), since this function
 * never re-enters the fat branch.
 */
function isThinMachOExecutable(buf: Buffer, offset: number): boolean {
  const bigEndian = detectMachOEndianness(buf, offset)
  if (bigEndian === undefined) return false
  const filetype = readMachOFiletype(buf, offset, bigEndian)
  return filetype === MH_EXECUTE || filetype === MH_DYLIB
}

/**
 * Result of classifying a Mach-O probe buffer:
 * - `executable`/`declined` — a final verdict, no further I/O needed.
 * - `slice` — the buffer is a FAT (universal) binary whose first slice
 *   header lives at `offset`, beyond what was read into `buf`. The caller
 *   (which owns the open FileHandle) must issue a second, small, bounded
 *   positional read at `offset` and reclassify with `isThinMachOExecutable`.
 */
type MachOProbeVerdict =
  | { kind: 'executable' }
  | { kind: 'declined' }
  | { kind: 'slice'; offset: number }

/**
 * Pure classifier over whatever bytes were actually read from the head of
 * an already-landed file (`buf` — never the whole file, T-21-02 discipline).
 * Content-gated ONLY — magic bytes, never a path pattern.
 *
 * Replaces the former `isExecutableMachO`, which read a fat binary's first
 * `fat_arch.offset` and tried to classify the slice header AT THAT FILE
 * OFFSET out of a buffer holding only the first `MACHO_PROBE_BYTES` bytes —
 * silently declining every fat binary whose slice sits beyond the probe
 * (which is essentially all of them; HUMANKIND's own `CFBundleExecutable`
 * has its first slice at 16384, four times beyond the old 4096-byte probe).
 * See `MACHO_PROBE_BYTES`'s own comment for why the fix is a second bounded
 * read rather than a bigger buffer.
 *
 * The fat_arch `offset` field is untrusted, attacker-influenced file
 * content used to drive a read offset (T-b1q-01), so it is bounded here
 * structurally before any I/O is even considered: `nfatArch` must be in
 * [1, MACHO_MAX_FAT_ARCH], and `sliceOffset` must be at or past the end of
 * the fat_header/fat_arch table itself (`8 + nfatArch * 20`) — a slice
 * can't overlap its own directory. The caller applies the remaining,
 * I/O-side bounds (absolute cap, real file size) before issuing the read.
 *
 * Free bonus, worth documenting: `0xcafebabe` is ALSO the Java `.class` file
 * magic. There, the next big-endian uint32 is `minor<<16 | major`, which for
 * every real class file is comfortably > `MACHO_MAX_FAT_ARCH`, so the
 * `nfatArch` bound declines Java class files structurally instead of
 * chasing a garbage offset into the file.
 *
 * Non-goal, deliberately not implemented: `FAT_MAGIC_64` (0xcafebabf,
 * 64-bit slice offsets). It only appears when a slice exceeds 4 GiB, which
 * no shipped game binary does.
 */
function classifyMachOProbe(buf: Buffer): MachOProbeVerdict {
  const thinBigEndian = detectMachOEndianness(buf, 0)
  if (thinBigEndian !== undefined) {
    return isThinMachOExecutable(buf, 0)
      ? { kind: 'executable' }
      : { kind: 'declined' }
  }

  // fat_header/fat_arch are always written big-endian on disk, per Apple's
  // own spec, regardless of the contained architectures' byte order
  // (mach-o/fat.h). Only the FIRST slice is inspected — a universal
  // binary's slices share one filetype in practice (all EXECUTE or all
  // DYLIB).
  if (buf.length >= 8 && buf.readUInt32BE(0) === FAT_MAGIC) {
    const nfatArch = buf.readUInt32BE(4)
    const fatArchOffset = 8 // sizeof(fat_header)
    if (
      nfatArch >= 1 &&
      nfatArch <= MACHO_MAX_FAT_ARCH &&
      buf.length >= fatArchOffset + 20
    ) {
      // fat_arch: cputype(4) cpusubtype(4) offset(4) size(4) align(4)
      const sliceOffset = buf.readUInt32BE(fatArchOffset + 8)
      const tableEnd = fatArchOffset + nfatArch * 20
      if (sliceOffset >= tableEnd) {
        // In-probe fast path: the slice header is ALREADY fully inside
        // `buf` (true for the pre-existing offset-64 fixtures and any real
        // fat binary whose first slice happens to sit within the probe) —
        // classify inline, no second read, byte-for-byte identical to the
        // pre-260819-b1q behavior for this case.
        if (buf.length >= sliceOffset + 16) {
          return isThinMachOExecutable(buf, sliceOffset)
            ? { kind: 'executable' }
            : { kind: 'declined' }
        }
        return { kind: 'slice', offset: sliceOffset }
      }
    }
  }

  return { kind: 'declined' }
}

/**
 * SECONDARY, POSIX-only compensator (23-08 Task 3, G-23-02 H2 verdict):
 * applies chmod 0o755 to an already-landed, already-manifest-mode-applied
 * file if (a) the manifest did NOT already flag it Executable/
 * CustomExecutable, and (b) its own bytes are a Mach-O EXECUTE or DYLIB
 * image. No-op on Windows (no POSIX exec bit there). Never invoked for
 * Directory(64)/Symlink(512) manifest entries — those return from
 * `downloadSingleFile` before this function is ever called (WR-01's own
 * discipline, reused here rather than reimplemented). Resolves via the
 * caller's already-`resolveContainedPath`-resolved `dest`; never
 * `path.join` (T-23-08). No subprocess is ever spawned — this is a
 * built-in `chmod`, not a shelled-out command. Every failure (read or
 * chmod) is swallowed and logged, never thrown: this is a best-effort
 * secondary measure and must never fail a file whose PRIMARY manifest-
 * driven contract already succeeded above. Logs loudly whenever it DOES
 * fire, so a manifest missing its own executable flags stays VISIBLE
 * rather than silently patched over.
 *
 * quick-260819-b1q: classification may need a SECOND positional read — a
 * fat binary's first slice header can sit well beyond `MACHO_PROBE_BYTES`
 * (HUMANKIND's own `CFBundleExecutable` at 16384). That second read reuses
 * this function's already-open `FileHandle` (`classifyMachOProbe` stays a
 * pure `Buffer` classifier, unit-testable and never touching I/O itself),
 * is itself bounded against both `MACHO_MAX_SLICE_OFFSET` and the file's
 * real size (`handle.stat()`), and classifies non-recursively via
 * `isThinMachOExecutable` — a fat magic nested inside a slice declines
 * rather than looping.
 */
export async function applyMachOExecutableFallback(
  dest: string,
  filename: string,
  flags: number | undefined
): Promise<void> {
  if (process.platform === 'win32') return
  if (flags && flags & (EXECUTABLE_FLAG | CUSTOM_EXECUTABLE_FLAG)) return

  try {
    const handle = await open(dest, 'r')
    try {
      const buf = Buffer.alloc(MACHO_PROBE_BYTES)
      const { bytesRead } = await handle.read(buf, 0, MACHO_PROBE_BYTES, 0)
      if (bytesRead < 8) return

      let verdict = classifyMachOProbe(buf.subarray(0, bytesRead))

      if (verdict.kind === 'slice') {
        const { offset } = verdict
        verdict = { kind: 'declined' }
        if (offset <= MACHO_MAX_SLICE_OFFSET) {
          const { size } = await handle.stat()
          if (offset + MACHO_HEADER_BYTES <= size) {
            const sliceBuf = Buffer.alloc(MACHO_HEADER_BYTES)
            const { bytesRead: sliceBytesRead } = await handle.read(
              sliceBuf,
              0,
              MACHO_HEADER_BYTES,
              offset
            )
            if (
              sliceBytesRead >= 16 &&
              isThinMachOExecutable(sliceBuf.subarray(0, sliceBytesRead), 0)
            ) {
              verdict = { kind: 'executable' }
            }
          }
        }
      }

      if (verdict.kind !== 'executable') return

      await chmod(dest, 0o755)
      logWarning(
        `downloadDepotFiles: applied secondary Mach-O executable fallback ` +
          `(chmod 0o755) to "${filename}" — its manifest carried no ` +
          `Executable/CustomExecutable flag, but its own bytes are a ` +
          `Mach-O EXECUTE/DYLIB image (G-23-02 H2 verdict, 23-TRACE.md)`,
        LogPrefix.Steam
      )
    } finally {
      await handle.close()
    }
  } catch (err) {
    logWarning(
      [
        `downloadDepotFiles: Mach-O executable fallback failed for ${filename}, continuing without it:`,
        err
      ],
      LogPrefix.Steam
    )
  }
}
