---
phase: 53
slug: steam-bridge-coverage-modern-sdk-exports-flat-api
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-25
---

# Phase 53 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from
> `53-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29 + ts-jest (projects under `src/` and `meta/__tests__`) |
| **Config file** | `jest.config.js`, `meta/jest.config.js` |
| **Quick run command** | `npx jest meta/__tests__/gen_vtables.test.ts meta/__tests__/shimAbiGate.test.ts meta/__tests__/bridgeCensus.test.ts src/backend/storeManagers/steam/bridge --silent` |
| **Full suite command** | `pnpm test:ci` |
| **Estimated runtime** | ~60 seconds (quick), several minutes (full) |

---

## Sampling Rate

- **After every task commit:** Run the quick run command, plus `npx prettier --check` over the exact paths written (scoped, never `.`; `--file-info` first; omit and say so when every path is prettier-ignored).
- **After every plan wave:** `pnpm gen-vtables && git diff --exit-code native/`, `pnpm test:ci`, `pnpm build-steam-bridge`
- **Before `/gsd:verify-work`:** Full suite must be green, then the live re-run sample
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Filled in by the planner per task. Behaviour → command map:

| Behavior | Test Type | Automated Command | File Exists | Status |
|----------|-----------|-------------------|-------------|--------|
| Flat exports generated from manifests, idempotent | unit + diff | `npx jest meta/__tests__/gen_vtables.test.ts`; `pnpm gen-vtables && git diff --exit-code native/` | ✅ (add cases) | ⬜ pending |
| Flat switch picks right slot per version; NULL + logged version on unknown flat `GetISteamX`/accessor (D-53-07) | generator text pins | same | ✅ (add) | ⬜ pending |
| x64 shim compiles; `.def` names in PE export table | compile gate | `npx jest meta/__tests__/shimAbiGate.test.ts`; `pnpm build-steam-bridge` + `objdump -p` | ✅ | ⬜ pending |
| Export list pinned both directions vs `.def` | unit | `npx jest src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts` | ✅ (update) | ⬜ pending |
| New manifests valid (slot counts, ordinals, served map) | unit | gen_vtables + shimCoverage jest | ✅ (add) | ⬜ pending |
| Managed ImplMap reader incl. hostile inputs, UTF-16 versions, CLR flags | unit, synthetic assembly | `npx jest src/backend/storeManagers/steam/bridge/__tests__/managedImports.test.ts` | ❌ W0 | ⬜ pending |
| Unserved-family imports counted, not required (D-53-04 amended) | unit | managedImports + shimCoverage jest | ❌ W0 | ⬜ pending |
| AnyCPU→x64 unless `32BITREQUIRED` or `32BITPREFERRED` (D-53-10 amended) | unit | `npx jest src/backend/storeManagers/steam/bridge/__tests__/peSteamDrm.test.ts` | ✅ (add) | ⬜ pending |
| Shared scan module used by shimGenerate and census (D-53-12) | unit + import boundary | bridgeCensus + shimGenerate jest | ✅ (add) | ⬜ pending |
| j4l guard / version-skew regression table for sample titles | unit | shimCoverage jest | ✅ (add) | ⬜ pending |
| Per-engine evidence + bridge trace classification (D-53-13) | unit, fixture logs | bridgeCensus jest | ✅ (add) | ⬜ pending |
| Helper once-per-method `CALL` trace, no SteamID | compile + integration (darwin) | `pnpm build-steam-bridge`; `npx jest src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts` | ✅ | ⬜ pending |
| Census Steamworks-using denominator + majority line | unit | bridgeCensus jest | ✅ (add) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/backend/storeManagers/steam/bridge/__tests__/managedImports.test.ts` — synthetic CLI-assembly builder (PE + CLI header + `#~` ModuleRef/ImplMap rows, `#Strings`, `#US`) and hostile-input cases (truncated, row counts past EOF, bad stream offsets)
- [ ] Committed flat-name fixture (names only, from the census) for the "every served-family name is exported" test
- [ ] Defined Steamworks-using denominator in `summarizeCensus`
- [ ] Census log source covers rotated `gamelib.log*` siblings (Research Pitfall 6)

---

## Manual-Only Verifications

| Behavior | Why Manual | Test Instructions |
|----------|------------|-------------------|
| Each of the seven titles initialises Steam in-game (HELLO + clean game-side init) | Requires launching real games under the bridge | Fresh play session per title, then `pnpm bridge-census` |
| Rogue Waters 1691190 gets past loading | Live game hang | Launch, confirm main menu, check Player.log |
| Post-init faults (D-53-06 loop) | Only visible in live logs | Inspect gamelib.log / engine log after each run |
| Helper `CALL` trace appears in a real gamelib.log | Needs live helper | Grep `CALL` lines after a GameMaker/Godot run |
| Census majority `verified` for Steamworks-using rows | Computed from live sample | `pnpm bridge-census` summary line |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
