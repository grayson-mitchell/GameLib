---
phase: quick-261102-ht4
plan: 01
status: complete
completed: 2026-11-02
commits:
  - 47224dc4f fix(quick-261102-ht4): set SteamClient family back to stub mode
  - e918ec4ab refactor(quick-261102-ht4): drop unreachable SteamClient wire generator paths
  - ab11ff055 docs(quick-261102-ht4): close steamclient wire-policy todo
BRIDGE_SHIM_TABLE_HASH: b83c888ed949 -> e0eae15e3690
BRIDGE_DISPATCH_TABLE_HASH: b83c888ed949 -> e0eae15e3690
---

# Quick 261102-ht4: SteamClient wire policy back to stub

SteamClient family set back to stub mode (policy restored to the 7ed535984 shape). Manifests 014/017/020/021 were regenerated, the dead x86 wire branches and SteamClient dispatch cases are gone from the generated C, the generator wire-only paths are removed behind a guard, and the todo is closed.

## Results
- x64 answers are identical for all 148 `vt_SteamClient014/017/020/021_*` functions (`$SCR/answers.cjs`: 97 lookups, 8 const-1, 16 const-0, 27 void). Note-kind deltas only: OFFPATH to FALLBACK (8 functions: CreateSteamPipe/ConnectToGlobalUser x4 versions), OFFPATH to STUB (24 functions).
- No `bridge_transact(` in any vt_SteamClient body. `.def` files and `shimExports.generated.ts` are byte-identical. Regeneration is deterministic. The post-cleanup regen is byte-identical to the Task 1 output.
- The shim diff touches only vt_SteamClient bodies, their slot comments and the table hash.

## Commands run
- `pnpm gen-vtables` (baseline clean, regen twice, regen after cleanup)
- `pnpm extract-proton-inventory --versions SteamClient017,SteamClient014,SteamClient020,SteamClient021` (network fetch worked; manifest diff matched the allowed edits, and 017 matches the 7ed535984 reference except `helperInterface`)
- `npx jest` over gen_vtables, bridgeCensus, shimCoverage, helperIntegration, interfaceVersions, shimGenerate and drmTrace: 7 suites, 831 tests, all pass, 0 fail
- `pnpm build-steam-bridge` (host arm64): pass. `GAMELIB_BRIDGE_TARGET_ARCH=x64 pnpm build-steam-bridge`: pass. Host arm64 build re-run last: pass. All artifacts are gitignored.
- `pnpm planning-gates`: 12/12 pass
- `npx prettier --check` on the wire-policy, manifests and TS files: pass. The todo is prettier-ignored, so that check was omitted.
- `graphify update .`: ran; graphify-out is not tracked, nothing to commit.

## Deviations
1. **BD_ORDINAL define gate, literal reading.** The plan's gate `diff <(grep BD_ORDINAL_ before) <(... after)` cannot pass. The four `#define BD_ORDINAL_SteamClient0{14,17,20,21}` lines are no longer emitted, because the generator only emits ordinal defines for interfaces that have dispatch cases. No ordinal VALUE changed: every remaining define is identical, and `ordinals.json` (SteamClient014 22, SteamClient017 16) is untouched. I treated this as satisfying the stop condition (no renumber), not as a change. The `bd_call_name` / case-index numbering in bridge_dispatch.h shifted for the interfaces after the removed block (internal call ids, shim+helper rebuilt as a pair).
2. **Dispatch preamble helpers kept.** `BD_FWD_VERSION_CAP` and `bd_fwd_sanitize` stay in the dispatch preamble, and so does `FWD_VERSION_LOG_MAX_BYTES` (also used by the flat lookup). They are now unused in the dispatch header, but removing them would change generated output, which the plan forbids in Task 2. Candidate for a later cleanup together with a regen.
3. **Guard placement.** The new "SteamClient has no wire path since Phase 56 (quick 261102-ht4)" guard is in `validateManifest` (which `main()` runs, so `pnpm gen-vtables` fails on a violation). `generateShimC` itself does not call it, so the test uses `validateManifest`.
4. **Tests.** Removed the forwarded-path tests (T-52-02, the Phase 52 forwarding manifests and FWD describes, WR-09 offpath), plus the `bd_fwd_sanitize` pin that tested only the dead presence-log helper. Added the `quick 261102-ht4: SteamClient family is stub mode` describe and kept the ordinals, 29-slot shape and hash-agreement tests. The OFFPATH-note assertion in the STUBCALL test now expects FALLBACK/STUB.
5. Scope wider than the todo: 020/021 also changed (family-keyed policy).

## Uncommitted (left for orchestrator)
This SUMMARY, STATE.md and PLAN.md. Unrelated pre-existing working-tree changes (spike logs, translation.json, invite-picker todo, untracked files) were not touched.
