---
phase: 58-steam-bridge-multiplayer
plan: 08
subsystem: steam-bridge-drm
tags: [live-gate, raft, d-08a, steamclient-layer, p2p-trace]
requires: [58-04]
provides:
  - "58-08-LIVE-GATE.md: approved Raft DRM-mode multiplayer gate contract (scored by 58-09)"
  - "Published and pinned steamclient-layer-cx26.3.0.39832-p58.tar.gz"
  - "D-08a legacy-P2P join criterion and peer-ordinal DRM trace"
affects: [58-09]
key-files:
  created:
    - .planning/phases/58-steam-bridge-multiplayer/58-08-LIVE-GATE.md
  modified:
    - src/common/steamclientLayerCatalogue.ts
    - THIRD-PARTY-NOTICES.md
    - .planning/phases/58-steam-bridge-multiplayer/58-CONTEXT.md
    - src/backend/storeManagers/steam/bridge/drm/drmTrace.ts
    - meta/bridgeCensus.ts
    - native/steam-bridge/steamclient-layer/lsteamclient/steamclient_main.c
decisions:
  - "D-08a: Raft (1202-only legacy P2P) joins are scored by P2PSessionRequest_t delivery + AcceptP2PSessionWithUser + game-originated Send/ReadP2PPacket, not 504/1221"
  - "DRM trace identifies peers by per-launch ordinal, never raw SteamID64"
metrics:
  tasks: 4
  completed: 2026-10-31
---

# Phase 58 Plan 08: Raft DRM-mode live-gate contract Summary

Authored and operator-approved the Raft (648800) DRM-mode multiplayer gate, extended the DRM trace so a legacy-P2P title can be scored (D-08a, peer ordinals), and published and pinned the rebuilt `-p58` component archive; the gate itself is not run (58-09).

## Tasks

| Task | Commits | Notes |
| ---- | ------- | ----- |
| 1 Measure join signal, confirm archive | e938b73fd | Raft is 1202-only; no 504/1221 references |
| 2 Author gate contract | 69bec80e1 | |
| 3 Operator checkpoint (contract + D-08 reading) | f406d1b31, f3df38704, 063041e8b, 1c0303244, fdf7c407f | D-08a adopted, trace extended, contract rewritten |
| 4 Publish, pin, preflight | 8cb57ca8b | Round-trip sha256 verified; catalogue and notices pinned; `pinned: match`; DRM jest 12 suites pass; codecheck clean |

## Published asset

`steamclient-layer-cx26.3.0.39832-p58.tar.gz`, sha256 `4390a08746f70f6d6a47235b86a968396290e239b87a3538f32222e233c2f3b1`, 5365254 bytes. Uploaded without `--clobber`, downloaded back, hash identical. The Phase 56 asset stays on the tag.

## Deviations from Plan

### Operator-approved scope extension (Task 3 checkpoint)

**1. [Rule 4 - Architectural, operator decision] D-08a and trace extension**
- **Found during:** Task 1/3. Raft's assemblies reference neither LobbyEnter_t (504) nor SteamNetConnectionStatusChangedCallback_t (1221), so D-08 item 1 as written could never be met.
- **Decision (operator, 2026-10-31):** D-08a appended verbatim to `58-CONTEXT.md`: for a legacy-P2P DRM title the join signal is met by a `role=game` P2PSessionRequest_t (1202) naming the joiner, then the game's own AcceptP2PSessionWithUser, plus game-originated SendP2PPacket / ReadP2PPacket with nonzero payload to/from the peer. 337 is recorded, not scored; In-Game presence never counts.
- **Trace extension (operator chose "Extend the trace"):** lsteamclient layer traces peer and payload size on P2P calls; `drmTrace.ts` and `meta/bridgeCensus.ts` gain the D-08a census path (Direction A can print `verified`; Direction B prints `unverified` by design). Commits f3df38704, 063041e8b.
- **Peer ordinal (operator chose over raw IDs):** peers are logged as per-launch ordinals so no real SteamID64 reaches the trace or `gamelib.log`. Commit fdf7c407f.
- **Contract:** `58-08-LIVE-GATE.md` rewritten to the amended contract (1c0303244, fdf7c407f) and approved.

**2. Archive history (three builds, one published)**
- `53780308f648eff14f6f162721a1446ee9af0a208cb52e9e31eff51cff06e8c5` (5360143 B): 58-04 build, pre-extension. Not published.
- `0dd202aa...`: extended trace with raw SteamID64s. Not published (superseded by the ordinal change).
- `4390a08746f70f6d6a47235b86a968396290e239b87a3538f32222e233c2f3b1` (5365254 B): ordinal build. Operator saw and approved this hash. **Published.**

### Auto-fixed Issues

None beyond the above.

## Preflight outcome and open item for 58-09

Run record in `58-08-LIVE-GATE.md` holds the publish record and PC1-PC5, PC7-PC11. COMPDIR was moved to the session dir (PC7), so the p58 asset is fetched at first launch. Two items are open:

- **PC2 NOT MET:** a stale Windows Steam (pid 47008, `steam.exe -silent -applaunch 264160`, up about 21h, with steamwebhelper/steamservice children) is running in a CrossOver bottle. 58-08 did not kill it. The operator must quit it and PC2 must be re-run before 58-09 launch 1.
- **PC11 pending operator:** Local Network permission state is not readable from a shell; operator must read System Settings and note it. PC10 cites the older 58-01-TITLES.md account preflight; 58-09 should reconfirm the peer is online.
- Session dir: see Run record (`/tmp/gamelib-gate-*`); delete captures after 58-09 (T-58-28).

## Known Stubs

None.

## Self-Check: PASSED

Catalogue, notices, LIVE-GATE and commit 8cb57ca8b exist; no scored `result:` line filled.
