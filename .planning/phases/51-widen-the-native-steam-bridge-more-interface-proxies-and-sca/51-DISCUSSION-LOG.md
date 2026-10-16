# Phase 51: Widen the native Steam bridge — more interface proxies, scan-derived eligibility - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-17
**Phase:** 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
**Areas discussed:** AppID identity for the new interfaces, What happens to the bits on a scan miss, Route visibility and user override, Acceptance set and the 64-bit stance

---

## Todo cross-reference

| Todo | Folded |
|------|--------|
| Empty per-game bottle after Remove all copies (LD-5) | ✓ |
| Play gives no feedback while bottled Steam is blocked | ✓ |

Nine other keyword matches (UI, Windows UAT backlog, build/platform) were dismissed as unrelated.

---

## AppID identity for the new interfaces

| Option | Description | Selected |
|--------|-------------|----------|
| Real AppID, one helper per running game | Per-launch helper inited with the game's AppID; truthful Apps/UserStats/RemoteStorage; reopens D-03 wording | ✓ |
| Keep 480, answer AppID-scoped calls locally | Shared helper unchanged; stubs answer from GameLib's own knowledge | |
| Single helper, re-init per launch | Shutdown + InitFlat per launch; one game at a time | |

| Option | Description | Selected |
|--------|-------------|----------|
| Log only | No UI | |
| One-time per-game notice at first launch | `notify()` once per game | ✓ |
| Persistent badge on game page | Always-visible line | |

| Option | Description | Selected |
|--------|-------------|----------|
| Allow, no lock | Zero code under per-game helpers | ✓ |
| One at a time, refuse the second | Lock + refusal + stale-lock recovery | |

| Option | Description | Selected |
|--------|-------------|----------|
| Fall back to 480 identity-only, launch anyway | SteamID/persona still served; stubs for AppID-scoped | ✓ |
| Treat as bridge failure: D-05 dialog | Offer bottled Steam | |
| Ask the user at that moment | Launch-without-achievements / bottled Steam dialog | |

**Notes:** The user rejected the first batch to ask why anyone would want two bridge games running, given Steam's one-session-per-account rule. Clarified: that rule is cross-machine; the local client accepts multiple inits; the recommendation was the no-code path, not a feature. User accepted "allow, no lock" on cost grounds.

---

## What happens to the bits on a scan miss

| Option | Description | Selected |
|--------|-------------|----------|
| Re-download via the bottled-Steam fallback | D-05 dialog → Phase 17 path; per-game bottle deleted | ✓ |
| Move them into the shared GameLibSteam bottle | Rename install dir + ACF; no second download; new bookkeeping | |
| Delete and leave it to the user | No automatic fallback | |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, screen on the manifest | steam_api64-only → bottled; none → bridge no shim; steam_api.dll → install then scan | ✓ |
| No, always install then scan | One mechanism | |

| Option | Description | Selected |
|--------|-------------|----------|
| Automatically when the shim's export set changes | Verdict keyed to shim export-set version | ✓ |
| Sticky until the user retries | Manual only | |
| Both | Auto + manual | |

| Option | Description | Selected |
|--------|-------------|----------|
| Straight to bottled Steam, no dialog | Silent known-bad routing | |
| Attempt the bridge anyway, dialog on failure | Advisory list | |
| Dialog up front explaining why, then bottled Steam | One interruption naming the reason | ✓ |

**Notes:** The user rejected the first batch (which recommended the move) to ask why move rather than re-download, and whether `GameLibSteam` is now redundant. Answer: re-download is the live-gated path with no new bookkeeping, misses are meant to be rare, the move is a later optimisation; the bottle is demoted not redundant (DRM/CEG, P2P, 64-bit, D-17 residue). Recommendation was revised to re-download before re-asking. Retiring the bottle recorded as deferred.

---

## Route visibility and user override

| Option | Description | Selected |
|--------|-------------|----------|
| Install dialog and game page | Verdict + reason in both places | ✓ |
| Game page only | After install only | |
| Install dialog only | Decision time only | |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, toggle in the install dialog | Persisted per game; flip = reinstall | ✓ |
| Yes, but only from the game page settings | Post-install flip | |
| No override this phase | Computed route is the route | |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, the known-bad dialog offers "Try the bridge anyway" | Third button; normal install-then-scan | ✓ |
| Yes, from the game page only | Post-install action | |
| No, known-bad and scan-missed are hard | Release-only changes | |

| Option | Description | Selected |
|--------|-------------|----------|
| Delete the empty per-game bottle | `removePerGameBridgeBottle` on Remove all copies | ✓ |
| Keep it, reuse on next install | Today's behaviour | |

---

## Acceptance set and the 64-bit stance

| Option | Description | Selected |
|--------|-------------|----------|
| Research decides, planner includes it if feasible | Census + zig prototype; include or defer with evidence | ✓ |
| This phase, regardless | Win64 is a requirement | |
| Follow-on phase, regardless | 32-bit only, fail closed | |

| Option | Description | Selected |
|--------|-------------|----------|
| Research picks from your owned library | One title per added interface + Avernum 5/6 regression | ✓ |
| Hoard plus Avernum 5/6 regression only | Locked gate + seed titles | |
| I will name titles now | Free text | |

| Option | Description | Selected |
|--------|-------------|----------|
| Census of your owned Windows-only library | N of M routed, misses classified | ✓ |
| Acceptance set only | No library-wide number | |
| A fixed threshold | Named bar | |

| Option | Description | Selected |
|--------|-------------|----------|
| Defer, keep the todo separate | Bottled-Steam symptom | |
| In scope: surface a "Waiting for Steam" state | Frontend state + bottle log parsing | ✓ |

---

## Claude's Discretion

Helper-side dispatch generation; manifest slot-table authoring under D-09; widening the `importScan.ts` regex to bare accessors and the `SteamInternal_*` family; per-game helper port allocation and lifetime; depot-manifest availability for the pre-screen; known-bad schema and file layout; wording of all new strings; what existing legacy-bottle Avernum installs do.

## Deferred Ideas

Retire the shared `GameLibSteam` bottle (Phase 22 territory); move scan-missed bits instead of re-downloading (revisit on census data); remote/CI allowlist index; P2P join.
