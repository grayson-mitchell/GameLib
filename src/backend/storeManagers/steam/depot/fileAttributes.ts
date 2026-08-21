// Phase 23 (23-01, D-06): applies the EDepotFileFlag ReadOnly(8)/Hidden(16)
// bits that Steam's own verify pass would normally set under a StateFlags=1026
// handoff. Under StateFlags=4 full ownership GameLib skips that verify pass,
// so a file whose manifest carries these flags would otherwise land with the
// wrong mode. Executable(32)/CustomExecutable(128) are handled separately in
// depot.ts's downloadSingleFile (spike-003) — this module only owns
// ReadOnly/Hidden.
//
// LOAD-BEARING INVARIANTS:
// - Windows attrib.exe is invoked via argv-form spawnSync ONLY — never a
//   shell-interpolated command string, never the exec/execSync shell-form
//   subprocess APIs. The file path is a single trailing argv element; flags
//   are hardcoded '+R'/'+H' literals, never built from untrusted input
//   (T-23-01 injection guard, grep-gated by the plan's acceptance criteria).
// - Hidden(16) on POSIX is an EXPLICIT, DOCUMENTED no-op. POSIX "hidden" is a
//   dot-prefix filename convention; retrofitting that onto an already-named,
//   sha1-verified filename would break the manifest's content-hash contract
//   (the caller resolved `dest` from the manifest's own filename — renaming
//   it here would desync every future reconciliation pass against that name).
//   We do not rename. We do not throw. We log and return ok.
// - A spawnSync failure/throw NEVER propagates as an exception — matches
//   library.ts's windowsRunningAppId() catch-to-safe-default discipline. The
//   caller (depot.ts's downloadSingleFile) turns a reported `{ ok: false }`
//   into a thrown Error so it surfaces as a DepotDownloadFailure (T-23-03)
//   rather than a silent success.

import { spawnSync } from 'child_process'
import { chmod } from 'node:fs/promises'
import { logWarning, LogPrefix } from 'backend/logger'

const READONLY_FLAG = 8
const HIDDEN_FLAG = 16
const EXECUTABLE_FLAG = 32
const CUSTOM_EXECUTABLE_FLAG = 128

/** `process.platform`'s value, accepted as a plain string so callers/tests
 *  never need to fight NodeJS.Platform's literal union for a mocked value. */
export type FileAttributePlatform = string

export interface ApplyDepotFileFlagsResult {
  ok: boolean
  error?: string
}

/**
 * Applies EDepotFileFlag ReadOnly(8)/Hidden(16) to a single already-downloaded
 * file. Never throws — a failure is reported via the returned
 * `{ ok: false, error }` shape; the caller decides how to surface it.
 *
 * Only invoked by downloadSingleFile when `flags & (ReadOnly | Hidden)` is
 * set — Executable/CustomExecutable stay in depot.ts's existing chmod block.
 */
export async function applyDepotFileFlags(
  filePath: string,
  flags: number,
  platform: FileAttributePlatform
): Promise<ApplyDepotFileFlagsResult> {
  if (!flags || !(flags & (READONLY_FLAG | HIDDEN_FLAG))) {
    return { ok: true }
  }

  if (platform === 'win32') {
    return applyWindowsAttributes(filePath, flags)
  }

  return applyPosixAttributes(filePath, flags)
}

async function applyPosixAttributes(
  filePath: string,
  flags: number
): Promise<ApplyDepotFileFlagsResult> {
  if (flags & HIDDEN_FLAG) {
    // Documented no-op — see module header. Never rename the file.
    logWarning(
      `fileAttributes: Hidden(16) flag set for "${filePath}" — POSIX has no ` +
        'filesystem-attribute equivalent (dot-prefix naming only); no-op.',
      LogPrefix.Steam
    )
  }

  if (!(flags & READONLY_FLAG)) {
    return { ok: true }
  }

  // Never drop the executable bit when ReadOnly is also requested — a
  // manifest entry can legitimately carry both ReadOnly and Executable.
  const executable = Boolean(flags & (EXECUTABLE_FLAG | CUSTOM_EXECUTABLE_FLAG))
  const mode = executable ? 0o555 : 0o444
  try {
    await chmod(filePath, mode)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

function applyWindowsAttributes(
  filePath: string,
  flags: number
): ApplyDepotFileFlagsResult {
  const args: string[] = []
  if (flags & READONLY_FLAG) args.push('+R')
  if (flags & HIDDEN_FLAG) args.push('+H')
  // Path is always the single trailing argv element (T-23-01) — never
  // interpolated into the flags array or a shell string.
  args.push(filePath)

  try {
    const result = spawnSync('attrib', args, {
      windowsHide: true,
      timeout: 2000
    })
    if (result.error) {
      return { ok: false, error: result.error.message }
    }
    if (result.status !== 0) {
      return {
        ok: false,
        error: `command "attrib" exited with status ${result.status}: ${result.stderr?.toString() ?? ''}`
      }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
