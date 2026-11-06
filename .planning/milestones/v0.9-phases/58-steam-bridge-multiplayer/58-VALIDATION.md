---
phase: 58
slug: steam-bridge-multiplayer
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-10-30
validated: 2026-11-02
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
| M-03 | New manifests validate; wire policy resolves; generated dispatch has new param kinds; `WIRE_LAYOUT_DOC` pins | unit | `pnpm exec jest meta/__tests__/gen_vtables.test.ts meta/__tests__/extractProtonInventory.test.ts` | ✅ extend | ✅ green |
| M-03 | Callback and message layout rows (mac vs msvc, both triples) | unit (zig arm) | `pnpm exec jest meta/__tests__/msvcCallbackBaseLayout.test.ts` | ✅ extend fixture | ✅ green |
| M-03 | Call-result register / hold / dispatch / late-register race | host C harness | `pnpm exec jest meta/__tests__/callbackRegistryHost.test.ts` | ✅ extend | ✅ green |
| M-03 | CBQ allowlist rows with mac and wire size, repack, zero-on-pop | host C harness | `pnpm exec jest src/backend/storeManagers/steam/bridge/__tests__/cbqueue.test.ts` | ✅ extend | ✅ green |
| M-03, M-04 | New CONTROL slot, frame shapes, old/new peer tolerance, cap-before-alloc refusal | unit + helper integration (fake HOME) | `pnpm exec jest src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts` | ✅ extend | ✅ green |
| M-03 | Shim ABI and compile gate for new stubs (x86 and x64 `ret N`) | gate | `pnpm exec jest meta/__tests__/shimAbiGate.test.ts` | ✅ | ✅ green |
| M-03 | Served-version tables, export-set version bump, `isScanVerdictNowCovered` | unit | `pnpm exec jest src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts` | ✅ `shimCoverage.test.ts` | ✅ green |
| M-05 | `NET` and `[drm-trace] event=callback` grammar; closed vocabulary; no SteamID/IP/handle/payload | unit + source pin | `pnpm exec jest meta/__tests__/bridgeCensus.test.ts src/backend/storeManagers/steam/bridge/drm/__tests__/drmTrace.test.ts` | ✅ extend | ✅ green |
| M-06 | DRM trace block present; strip rule reproduces upstream bytes (six blocks) | unit | `pnpm exec jest meta/__tests__/buildLsteamclient.test.ts` | ✅ update count | ✅ green |
| M-07 | D-12 recorded as a no-op (`knownBad: []`); D-13 notice unchanged | unit | `pnpm exec jest src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts src/frontend/state/__tests__/SteamBridgeRouteNotice.test.ts` | ✅ | ✅ green |
| M-01, M-02 | Host and join with the second account, both directions, both modes (D-05, D-08) | operator-run live gate | `58-NN-LIVE-GATE.md` UAT items; evidence via `pnpm bridge-census` | ✅ 58-08, 58-22, 58-33 | ✅ green (live: 58-08 Raft DRM `Verdict: PASS`; 58-33 Schedule I TCP re-gate `Verdict: PASS`, run by 58-34; 58-22 `Verdict: FAIL` superseded by 58-33) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Extend `meta/__tests__/fixtures/steam_callback_structs.cpp` (+ `.layout.txt`) with every relayed callback struct and `SteamNetworkingMessage_t`; generalise `msvcCallbackLayout.ts` beyond `USER_STATS_RECEIVED_LAYOUT`.
- [x] Add a call-result case set to `callbackRegistryHost.test.ts` (register, complete, late-register hold, unregister race).
- [x] Fixture log text for `NET` and `[drm-trace] event=callback` lines for the census tests.
- [x] No new framework install.

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

- [x] All tasks have `<automated>` verify or are explicit checkpoints (58-09 and the other live-gate plans are `checkpoint:human-*`)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags (0 `--watch` in any `<automated>` block)
- [x] Feedback latency < 120s (the quick run's four Meta suites; the slowest mapped suites are `shimAbiGate` ~27 s and `helperIntegration` ~23 s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-11-02 (validate-phase audit below)

---

## Validation Audit 2026-11-02

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Run on HEAD `b0b6e37da`: all 14 suites named in the Per-Task Map green (1,039 of 1,039 tests, 0 skipped). Wave 0 on disk: `steam_callback_structs.cpp` carries the relayed lobby, P2P, Sockets, Messages and join-request structs plus `SteamNetworkingMessage_t`, and `msvcCallbackLayout.ts` exports `CALLBACK_LAYOUTS` beyond `USER_STATS_RECEIVED_LAYOUT`; `callbackRegistryHost.test.ts` has the `cr_late_register_hold`, `cr_unregister_race` and `md_callresult*` cases; the census and drm-trace suites carry `NET` and `event=callback` fixture text. Row notes: `buildLsteamclient.test.ts` now pins seven trace blocks (the plan said six); D-12 is pinned by `allowlist.test.ts` asserting `knownBad` is `[]`. The Manual-Only rows were closed by the live gates (58-01 titles and preflight, 58-08 Raft DRM PASS, 58-33/58-34 Schedule I TCP PASS with the 333 relay proven in Direction B). Post-phase review fixes (58-REVIEW-FIX, all_fixed; WR-03/WR-04 live-verified 2026-11-01) and quick 261101-mv3 added harness cases that ran green in the same suites.
