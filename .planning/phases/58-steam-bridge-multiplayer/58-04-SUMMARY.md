---
phase: 58-steam-bridge-multiplayer
plan: 04
subsystem: steam-bridge-drm
tags: [lsteamclient, drm-trace, callbacks, multiplayer]
requires: []
provides:
  - "event=callback drm-trace grammar (parse/format/evidence)"
  - "lsteamclient trace blocks 6 (BGetCallback) and 7 (GetAPICallResult)"
  - "locally built p58 component archive for 58-08 to pin"
affects: [58-08]
key-files:
  modified:
    - src/backend/storeManagers/steam/bridge/drm/drmTrace.ts
    - src/backend/storeManagers/steam/bridge/drm/__tests__/drmTrace.test.ts
    - meta/bridgeCensus.ts
    - native/steam-bridge/steamclient-layer/lsteamclient/steamclient_main.c
    - native/steam-bridge/steamclient-layer/lsteamclient/PINS.md
    - native/steam-bridge/steamclient-layer/NOTICE
    - meta/__tests__/buildLsteamclient.test.ts
decisions:
  - "Connection state offset read via offsetof on w64_SteamNetConnectionStatusChangedCallback_t_153a (newest generated layout); LobbyEnter_t uses the unversioned struct"
  - "Dedup key for 504/1221 includes the enum value so each distinct resp/state logs once"
metrics:
  tasks: 2
  completed: 2026-10-31
---

# Phase 58 Plan 04: DRM-mode join callback tracing Summary

A DRM-mode join callback drained by the game now produces a parseable `role=game event=callback id=<n>` line (with `resp=` on 504 and `state=` on 1221), and a local component archive carrying the new blocks is built for 58-08.

## Tasks

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1 Parser grammar | a88490de7 | TRACE_CALLBACK_RE, union member, formatter, DrmEvidence gameCallbacks / gameLobbyEnterOk / gameConnStates; 18 drmTrace tests pass |
| 2 Trace blocks 6 and 7 | a2556cc55 | gamelib_trace_callback + two hooks, PINS.md/NOTICE say seven blocks, block-count test; strip-to-upstream test still passes |

## Local component build (not published)

`pnpm build:lsteamclient` succeeded (compile gate passed; `event=callback id=` present in the dll). `pnpm build:steamclient-layer-archive --out build/steamclient-layer-cx26.3.0.39832-p58.tar.gz` printed `pinned: MISMATCH (file NOTICE)` and exit 3, as expected (catalogue still pins the Phase 56 archive; NOTICE changed). `src/common/steamclientLayerCatalogue.ts` untouched.

Archive: sha256 `53780308f648eff14f6f162721a1446ee9af0a208cb52e9e31eff51cff06e8c5`, size 5360143.

| Member | sha256 | size |
| ------ | ------ | ---- |
| LICENSE.lsteamclient | 80fda9147f8ee707cd18d1d6d71b307063fa3a02057a7c789de47f7c003510f1 | 7435 |
| NOTICE | bc80694c743a744cd0722275bf2cc22e6402f653045d4a0948cc3195ad537550 | 4111 |
| detour-cx26.3.0.39832.bin | e35b834408599c45f30b23a6d2bf38acfa5c3df4d15206617c471e23a4a01bfb | 832 |
| lsteamclient.dll | 17aca010b40256a3183b57525f30689a0e94178584d10e2ae2eb38acc5509ce1 | 33921385 |
| lsteamclient.so | dd48289787223d9e0f75a97da3cc15aa616faa382741e39a5a433fa5cfa5167d | 2388896 |
| steam.exe | 4a67c58a41792e8a784bea7338adaf3d7d3713dc6d20ccaf61895edfdb32e6ba | 193536 |

PINS.md records the new committed `steamclient_main.c` sha256 `a748be08e1927a1e2fc33b551f2f8f282ce0dd2ad0fc27b33a67125c44821a78`.

## Deviations from Plan

**1. [Rule 3 - Blocking] meta/bridgeCensus.ts DrmEvidence literal**
- Widening `DrmEvidence` broke `tsc -p tsconfig.meta.json`; added the three new empty fields to the initial literal in `classifyDrmEvidence`. Census behaviour unchanged. Committed with Task 1 (a88490de7).

**2. Block 6 blank-line fix** - first insertion added a blank line outside the fence and broke the strip-to-upstream test; corrected before commit.

## Known Stubs

None.

## Self-Check: PASSED

Commits a88490de7 and a2556cc55 exist; archive file present under build/ (git-ignored).
