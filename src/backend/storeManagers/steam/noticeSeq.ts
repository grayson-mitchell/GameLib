/**
 * Phase 81 plan 07: the notice sequence counter, split out of gameUninstall.ts so playAdoption.ts
 * can push a request notice without importing gameUninstall (which imports playAdoption).
 */
import { logWarning, LogPrefix } from 'backend/logger'
import { RUST_STEAMPOLL_NEXT_NOTICE_SEQ } from 'common/types/sidecarTransport'
import type SteamGame from './games'

/**
 * The next notice seq, from the Rust counter (steampoll_next_notice_seq).
 * Never rejects (80-REVIEW C-WR-03): a failure notice must still reach the
 * user when steampoll is unreachable. The fallback is the midpoint between
 * the highest seq seen and the next integer, so it is newer than every seq
 * already handed out here (the frontend drops an older or equal seq) and
 * never equal to, or ahead of, the next one Rust issues.
 */
export async function noticeSeq(steamGame: SteamGame): Promise<number> {
  // The highest seq handed out this boot lives on the boot-owned install runtime, not module state.
  const holder = steamGame.deps.steamInstallRuntime.noticeSeq
  try {
    const seq = (await steamGame.deps.requestRustInvoke(
      RUST_STEAMPOLL_NEXT_NOTICE_SEQ,
      []
    )) as number
    if (typeof seq === 'number' && Number.isFinite(seq)) {
      holder.last = Math.max(holder.last, seq)
      return seq
    }
    throw new Error(`non-numeric notice seq ${String(seq)}`)
  } catch (error) {
    const fallback = (holder.last + Math.floor(holder.last) + 1) / 2
    logWarning(
      `SteamGame: notice seq read failed for appId ${steamGame.appId}, using local seq ${fallback}: ${String(error)}`,
      LogPrefix.Steam
    )
    holder.last = fallback
    return fallback
  }
}
