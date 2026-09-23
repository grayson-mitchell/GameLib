/**
 * Quick task `260923-vdq`.
 *
 * Shared free/total byte-formatter for both install dialogs' free-space line.
 * Extracted rather than inlined into either dialog for two reasons:
 *
 * 1. DRY -- `SteamDialog` and `DownloadDialog` both need the exact same two
 *    formatted labels from the exact same IPC result shape.
 * 2. `SteamDialog` specifically MAY NOT import from `frontend/helpers`
 *    (D-01/D-14, enforced by `SteamDialog/__tests__/steamDialogSource.test.ts`'s
 *    ban on the token `frontend/helpers`) NOR let the bare token `diskSize`
 *    appear anywhere in its executable source (D-06: the Install button is
 *    never gated on the GAME's install size -- a different quantity from
 *    `DiskSpaceData.diskSize`, the VOLUME's total capacity, which happens to
 *    share the name). Formatting here, and exposing only `freeLabel` /
 *    `totalLabel` to callers, keeps SteamDialog clear of both banned tokens
 *    by construction.
 *
 * Do NOT inline this back into SteamDialog later -- doing so reintroduces the
 * bare token `diskSize` and trips the D-06 gate.
 *
 * Imports `filesize` DIRECTLY (never via `frontend/helpers`'s `size` export)
 * so SteamDialog's import graph never touches that module. Uses the same
 * `partial({ base: 2 })` construction as `frontend/helpers`'s `size` and the
 * backend's `getFileSize` (`backend/utils.ts`), which keeps the rendered
 * figures byte-identical to what was verified live against
 * `Win32_LogicalDisk`.
 */
import * as fileSize from 'filesize'
import type { DiskSpaceData } from 'common/types'

const formatBytes = fileSize.partial({ base: 2 }) as (arg: unknown) => string

// Not exported: the shape is only ever named here, as `diskSpaceLabels`'s
// return type. Callers destructure `freeLabel`/`totalLabel` structurally and
// never need the name, so exporting it would be a dead export -- which is
// exactly what `pnpm find-deadcode`'s used-in-module scope reports. Export it
// again if and when a caller genuinely needs to name the type.
interface DiskSpaceLabels {
  freeLabel: string
  totalLabel: string
}

export function diskSpaceLabels(
  data: Pick<DiskSpaceData, 'free' | 'diskSize'>
): DiskSpaceLabels {
  return {
    freeLabel: formatBytes(data.free),
    totalLabel: formatBytes(data.diskSize)
  }
}
