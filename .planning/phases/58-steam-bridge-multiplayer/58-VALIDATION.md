---
phase: 58
slug: steam-bridge-multiplayer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-30
---

# Phase 58 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Requirement IDs M-01..M-07 are defined in `58-RESEARCH.md` §Phase Requirements.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (projects `Meta`, `Backend`, frontend), host-compiled C harnesses inside Jest, zig cross-compile gate |
| **Config file** | repo `jest` config; `meta/jest.config.js` for Meta |
| **Quick run command** | `pnpm exec jest meta/__tests__/gen_vtables.test.ts meta/__tests__/callbackRegistryHost.test.ts meta/__tests__/msvcCallbackBaseLayout.test.ts meta/__tests__/bridgeCensus.test.ts` |
| **Full suite command** | `pnpm test:ci && pnpm codecheck && pnpm planning-gates && pnpm find-deadcode && pnpm lint` |
| **Build gate** | `pnpm gen-vtables && pnpm build-steam-bridge` |
| **Estimated runtime** | ~90 seconds quick; full suite several minutes |

---

## Sampling Rate

- **After every task commit:** the quick run command (scoped to the suites the task touches), plus `npx prettier --check <exact paths written>`. Run `--file-info` first and omit the check when every path is prettier-ignored (`.c`, `.h`, `.cpp`, `.layout.txt`).
- **After every plan wave:** the build gate, the full Jest bridge and Meta suites, and `pnpm codecheck`.
- **Before `/gsd:verify-work`:** the full suite green, then the operator-run live gates.
- **Max feedback latency:** 120 seconds for the quick run.

---

## Per-Task Verification Map

| Req | Behavior | Test Type | Automated Command | File Exists | Status |
|-----|----------|-----------|-------------------|-------------|--------|
| M-03 | New manifests validate; wire policy resolves; generated dispatch has new param kinds; `WIRE_LAYOUT_DOC` pins | unit | `pnpm exec jest meta/__tests__/gen_vtables.test.ts meta/__tests__/extractProtonInventory.test.ts` | ✅ extend | ⬜ pending |
| M-03 | Callback and message layout rows (mac vs msvc, both triples) | unit (zig arm) | `pnpm exec jest meta/__tests__/msvcCallbackBaseLayout.test.ts` | ✅ extend fixture | ⬜ pending |
| M-03 | Call-result register / hold / dispatch / late-register race | host C harness | `pnpm exec jest meta/__tests__/callbackRegistryHost.test.ts` | ✅ extend | ⬜ pending |
| M-03 | CBQ allowlist rows with mac and wire size, repack, zero-on-pop | host C harness | `pnpm exec jest src/backend/storeManagers/steam/bridge/__tests__/cbqueue.test.ts` | ✅ extend | ⬜ pending |
| M-03, M-04 | New CONTROL slot, frame shapes, old/new peer tolerance, cap-before-alloc refusal | unit + helper integration (fake HOME) | `pnpm exec jest src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts` | ✅ extend | ⬜ pending |
| M-03 | Shim ABI and compile gate for new stubs (x86 and x64 `ret N`) | gate | `pnpm exec jest meta/__tests__/shimAbiGate.test.ts` | ✅ | ⬜ pending |
| M-03 | Served-version tables, export-set version bump, `isScanVerdictNowCovered` | unit | `pnpm exec jest src/backend/storeManagers/steam/bridge/__tests__/shimCoverage` | ⚠ confirm name | ⬜ pending |
| M-05 | `NET` and `[drm-trace] event=callback` grammar; closed vocabulary; no SteamID/IP/handle/payload | unit + source pin | `pnpm exec jest meta/__tests__/bridgeCensus.test.ts src/backend/storeManagers/steam/bridge/drm/__tests__/drmTrace.test.ts` | ✅ extend | ⬜ pending |
| M-06 | DRM trace block present; strip rule reproduces upstream bytes (six blocks) | unit | `pnpm exec jest meta/__tests__/buildLsteamclient.test.ts` | ✅ update count | ⬜ pending |
| M-07 | D-12 recorded as a no-op (`knownBad: []`); D-13 notice unchanged | unit | `pnpm exec jest src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts src/frontend/state/__tests__/SteamBridgeRouteNotice.test.ts` | ✅ | ⬜ pending |
| M-01, M-02 | Host and join with the second account, both directions, both modes (D-05, D-08) | operator-run live gate | `58-NN-LIVE-GATE.md` UAT items; evidence via `pnpm bridge-census` | ❌ authored in-phase | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Extend `meta/__tests__/fixtures/steam_callback_structs.cpp` (+ `.layout.txt`) with every relayed callback struct and `SteamNetworkingMessage_t`; generalise `msvcCallbackLayout.ts` beyond `USER_STATS_RECEIVED_LAYOUT`.
- [ ] Add a call-result case set to `callbackRegistryHost.test.ts` (register, complete, late-register hold, unregister race).
- [ ] Fixture log text for `NET` and `[drm-trace] event=callback` lines for the census tests.
- [ ] No new framework install.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Measured `.bind`, arch, imports and join flow of Schedule I: Free Sample (3205720) | M-01 | Title must be installed by the operator; not measurable at research time | 58-01: install, PE scan, `pnpm bridge-census`, record in the titles file |
| Account preflight: friend request, invite and join between the main and limited accounts with plain Steam | M-01, M-02 | Needs the second account and the Windows/Linux peer PC | 58-01 preflight UAT item |
| TCP-mode session, GameLib hosts and peer joins, then peer hosts and GameLib joins (Schedule I) | M-01, M-04 | Real Steam lobbies and P2P against a second account | TCP live gate UAT; D-08 items 1–3; path recorded direct/relayed |
| DRM-mode session both directions (Raft 648800) and the `Serialized005` grep decision | M-02, M-06 | Real Steam session through `lsteamclient` | Raft live gate UAT; grep the Wine log for `Don't recognize interface name` / `Serialized005` |
| `GameLobbyJoinRequested_t` delivered by Mac Steam on a friends-list invite | M-01 | Only observable live | Recorded in 58-01 or the TCP gate |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
