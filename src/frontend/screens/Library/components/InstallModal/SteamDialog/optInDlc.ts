/**
 * Quick 261122-rgi (D-01): pure helpers for the Steam install dialog's "Optional content"
 * ticks. No React, and no `frontend/helpers` import (the dialog's source gate bans it), so the
 * size label formats with `filesize` directly, the same base-2 construction as
 * `diskSpaceLabels.ts`.
 */
import * as fileSize from 'filesize'
import type { SteamOptInDlcEntry, SteamOptInDlcInfo } from 'common/types/steam'

const formatBytes = fileSize.partial({ base: 2 }) as (arg: unknown) => string

/** The entries to offer: owned, or ownership unknown (D-05). Only `owned === false` is hidden. */
export function shownOptInDlc(
  info: SteamOptInDlcInfo | null | undefined
): SteamOptInDlcEntry[] {
  return (info?.entries ?? []).filter((e) => e.owned !== false)
}

/** Adds a missing id, removes a present one; never duplicates and never mutates. */
export function toggleOptInChoice(choice: string[], appId: string): string[] {
  return choice.includes(appId)
    ? choice.filter((id) => id !== appId)
    : [...choice, appId]
}

/** Drops ids the list no longer offers. Returns the same array when nothing changes. */
export function pruneOptInChoice(
  choice: string[],
  entries: SteamOptInDlcEntry[]
): string[] {
  const offered = new Set(entries.map((e) => e.appId))
  return choice.every((id) => offered.has(id))
    ? choice
    : choice.filter((id) => offered.has(id))
}

/** "5.51 GiB"-style size, or undefined for 0 or a non-finite count. */
export function optInDlcSizeLabel(bytes: number): string | undefined {
  return Number.isFinite(bytes) && bytes > 0 ? formatBytes(bytes) : undefined
}
