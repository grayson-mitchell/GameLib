import { z } from 'zod'
import { open, stat, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'node:crypto'

import type { Path } from 'backend/schemas'
import { genericSpawnWrapper } from '../os/processes'
import type { DiskInfo } from './index'

const Win32_LogicalDisk = z.object({
  Caption: z.string(),
  FreeSpace: z.number().nullable(),
  Size: z.number().nullable()
})
type Win32_LogicalDisk = z.infer<typeof Win32_LogicalDisk>

async function getDiskInfo_windows(path: Path): Promise<DiskInfo> {
  const { stdout } = await genericSpawnWrapper('powershell', [
    'Get-CimInstance',
    '-Class',
    'Win32_LogicalDisk',
    '-Property',
    'Caption,FreeSpace,Size',
    '|',
    'Select-Object',
    'Caption,FreeSpace,Size',
    '|',
    'ConvertTo-Json',
    '-Compress'
  ])

  let parsedDisks: Win32_LogicalDisk[]
  try {
    const parsed = Win32_LogicalDisk.or(Win32_LogicalDisk.array()).parse(
      JSON.parse(stdout)
    )
    if (Array.isArray(parsed)) parsedDisks = parsed
    else parsedDisks = [parsed]
  } catch {
    parsedDisks = []
  }

  for (const disk of parsedDisks) {
    // Disk drives without media inserted will have "null" as their FreeSpace &
    // Size. We can just skip those
    if (!disk.FreeSpace || !disk.Size) continue

    if (path.startsWith(disk.Caption))
      return { freeSpace: disk.FreeSpace, totalSpace: disk.Size }
  }

  return { freeSpace: 0, totalSpace: 0 }
}

// This used to match the ACL's IdentityReference against the current
// username. That was wrong in two independent ways:
//  (a) Windows grants write access through GROUPS (`BUILTIN\Users`,
//      `NT AUTHORITY\Authenticated Users`), and only a user's own profile
//      tree normally carries an explicit per-user ACE. Resolving group
//      membership correctly in JS means walking nested groups and weighing
//      deny ACEs -- i.e. reimplementing Windows authorization. A direct
//      write probe sidesteps the question entirely by letting the kernel
//      answer it.
//  (b) `fs.access(path, W_OK)` is NOT a substitute: on Windows it reflects
//      only the read-only file ATTRIBUTE, not the ACL at all, so it would
//      report `C:\Program Files` and other ACL-restricted trees as
//      writable -- trading a visible false-negative for a silent
//      false-positive that only surfaces after the user has committed to
//      the path and the install fails.
//  (c) The removed array-shaped ACL parse had a SECOND, independent failure
//      path: a single-entry ACL makes `ConvertTo-Json -Compress` emit an
//      object, not an array, so parsing it as an array threw and the old
//      `catch { return false }` returned false for a reason that had
//      nothing to do with actual access.
// See unix.ts for why `isWritable_unix` is deliberately NOT the same kind
// of check.
async function isWritable_windows(path: Path): Promise<boolean> {
  let stats
  try {
    stats = await stat(path)
  } catch {
    // Preserves getDiskInfo's "path does not have to exist" contract
    // (index.ts:9-12): a nonexistent path stays false, exactly as before.
    return false
  }

  if (!stats.isDirectory()) {
    // The sole consumer always passes a directory, but a file path
    // shouldn't become a new false-negative of the same family this
    // rewrite removes. `'r+'` requires write permission but neither
    // truncates nor writes a byte.
    let handle
    try {
      handle = await open(path, 'r+')
      return true
    } catch {
      return false
    } finally {
      await handle?.close().catch(() => undefined)
    }
  }

  const probePath = join(
    path,
    `.gamelib-write-probe-${randomUUID()}.tmp`
  ) as Path
  try {
    await writeFile(probePath, '', { flag: 'wx' })
    return true
  } catch {
    return false
  } finally {
    // A cleanup failure must not change the verdict nor throw out of this
    // function.
    await unlink(probePath).catch(() => undefined)
  }
}

export { getDiskInfo_windows, isWritable_windows }
