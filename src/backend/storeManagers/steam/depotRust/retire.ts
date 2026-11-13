/**
 * WR-01: which installed depots an update may delete. A depot is retired only when the new
 * build's full branch depot list (base + DLC apps, no ownership/OS/language filter) no longer
 * names it. Anything skipped, unselected-but-still-listed, or undecidable is kept.
 */
import type { DepotRefsResult } from '../depot/plan'

/** @public part of RetireDecision's exported shape; callers narrow on it. */
export type KeptReason =
  | 'selected'
  | 'skipped'
  | 'still-on-branch'
  | 'list-incomplete'
  | 'dlc-not-fetched'

export interface RetireDecision {
  retire: Array<{ depotId: string; gid: string; ownerAppId: string }>
  kept: Array<{ depotId: string; reason: KeptReason }>
}

export function decideRetirement(args: {
  appId: string
  oldGidByDepot: ReadonlyMap<string, string>
  refs: Pick<
    DepotRefsResult,
    | 'depots'
    | 'skippedDepots'
    | 'branchDepotIds'
    | 'fetchedDlcAppIds'
    | 'branchDepotListComplete'
  >
  /** depotId -> ACF `dlcappid` of the installed depot. */
  acfDlcOwner: ReadonlyMap<string, string>
}): RetireDecision {
  const { appId, oldGidByDepot, refs, acfDlcOwner } = args
  const selected = new Set(refs.depots.map((d) => d.depotId))
  const skipped = new Set(refs.skippedDepots)
  const onBranch = new Set(refs.branchDepotIds)
  const fetched = new Set(refs.fetchedDlcAppIds)
  const out: RetireDecision = { retire: [], kept: [] }
  for (const [depotId, gid] of oldGidByDepot) {
    const keep = (reason: KeptReason) => out.kept.push({ depotId, reason })
    if (selected.has(depotId)) keep('selected')
    else if (skipped.has(depotId)) keep('skipped')
    else if (refs.branchDepotListComplete !== true) keep('list-incomplete')
    else if (onBranch.has(depotId)) keep('still-on-branch')
    else {
      const dlc = acfDlcOwner.get(depotId)
      if (dlc !== undefined && !fetched.has(dlc)) keep('dlc-not-fetched')
      else
        out.retire.push({
          depotId,
          gid,
          ownerAppId: dlc ?? appId
        })
    }
  }
  return out
}
