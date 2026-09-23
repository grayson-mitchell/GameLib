import { genericSpawnWrapper } from '../os/processes'
import { access } from 'fs/promises'
import { join } from 'path'

import type { Path } from 'backend/schemas'
import type { DiskInfo } from './index'

async function getDiskInfo_unix(path: Path): Promise<DiskInfo> {
  const rootPath = await findFirstExistingPath(path)

  const { stdout } = await genericSpawnWrapper('df', ['-P', '-k', rootPath])
  const lineSplit = stdout.split('\n')[1].split(/\s+/)
  const [, totalSpaceKiBStr, , freeSpaceKiBStr] = lineSplit
  return {
    totalSpace: Number(totalSpaceKiBStr ?? 0) * 1024,
    freeSpace: Number(freeSpaceKiBStr ?? 0) * 1024
  }
}

/**
 * Finds the first existing path in the path's hierarchy
 * @example
 * findFirstExistingPath('/foo/bar/baz')
 * // => '/foo/bar/baz' if it exists, otherwise '/foo/bar', otherwise '/foo', otherwise '/'
 */
async function findFirstExistingPath(path: Path): Promise<Path> {
  let maybeExistingPath = path
  while (!(await isWritable_unix(maybeExistingPath))) {
    maybeExistingPath = join(maybeExistingPath, '..') as Path
  }
  return maybeExistingPath
}

// This is `access(path)` with NO mode argument -- that is `F_OK`, an
// EXISTENCE check, not a writability check. `findFirstExistingPath` above
// DEPENDS on exactly that: its `while` loop climbs toward the root until
// the path EXISTS. A real writability check here would make it climb PAST
// existing-but-unwritable directories, falsifying its own name and
// silently breaking getDiskInfo_unix's `df` target selection.
//
// `isWritable_windows` (windows.ts) deliberately answers the STRONGER
// question -- "can this process actually write here" -- via a real write
// probe. The two platforms knowingly answer different questions today.
// Anyone harmonising them must fix `findFirstExistingPath` in the same
// change; that is a separate, wider task with its own Unix/macOS live gate.
async function isWritable_unix(path: Path): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false
  )
}

export { getDiskInfo_unix, isWritable_unix }
