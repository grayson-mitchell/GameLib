/**
 * WR-01: which installed depots an update may delete. A depot is retired only when the new
 * build's full branch depot list (base + DLC apps, no ownership/OS/language filter) no longer
 * names it. Anything skipped, unselected-but-still-listed, or undecidable is kept, except a depot
 * of an opt-in DLC the user switched off (quick 261122-rgi, D-02), which goes even though it is
 * still on the branch.
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
  /**
   * Depots of opt-in DLC the user switched off, with the app each is keyed under (quick 261122-rgi,
   * D-02). They are retired even though still on the branch, because the user asked for their
   * files to go. Absent leaves every other rule unchanged.
   */
  disabledOptInDepots?: ReadonlyArray<{ depotId: string; ownerAppId: string }>
}): RetireDecision {
  const { appId, oldGidByDepot, refs, acfDlcOwner, disabledOptInDepots } = args
  // The owner is the listed one, not the ACF `dlcappid`: Steam keys such a depot under the base
  // app (261120-tbr).
  const disabled = new Map(
    (disabledOptInDepots ?? []).map((d) => [d.depotId, d.ownerAppId])
  )
  const selected = new Set(refs.depots.map((d) => d.depotId))
  const skipped = new Set(refs.skippedDepots)
  const onBranch = new Set(refs.branchDepotIds)
  const fetched = new Set(refs.fetchedDlcAppIds)
  const out: RetireDecision = { retire: [], kept: [] }
  for (const [depotId, gid] of oldGidByDepot) {
    const keep = (reason: KeptReason) => out.kept.push({ depotId, reason })
    if (selected.has(depotId)) keep('selected')
    else if (disabled.has(depotId))
      out.retire.push({
        depotId,
        gid,
        ownerAppId: disabled.get(depotId) ?? appId
      })
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
