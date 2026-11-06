# Deferred items (62-04)

- tauriShellSource.test.ts "no WebviewWindowBuilder chain passes a STRING LITERAL to .title(" fails on store_embed.rs `.title(format!(...))` (STORE_EMBED_LINK_POPUP). Pre-existing: store_embed.rs unmodified by 62-04 (last change df547170b).

# Deferred items (62-05)

Pre-existing failures, each confirmed present before any 62-05 change; none caused or fixed here.

- `games.test.ts` "channel constants equal the 56-01 SUMMARY values" reads `.planning/phases/56-*/56-01-SUMMARY.md`, which `2dc59727e chore: archive v0.9 milestone` moved out of `.planning/phases/`. ENOENT.
- `macArchKnownFixRouting.test.ts` "Intel: never seeds and does not take the bottle-branch result" fails at the commit before 62-05 started (checked in a detached worktree).
- `pnpm find-deadcode` (and the Meta test `meta/findDeadcode.cjs CLI exits 0`) fails from 62-04: stale baseline entry `sidecarTransport.ts - RUST_INVOKE_KIND`, new used-in-module findings `extractDispatchArms` / `extractMarkedConsts` in `transportParity.test.ts`. The output was byte-identical before and after every 62-05 commit, so no baseline edit was needed here.
- Meta `genI18nGateScope` A-17 anti-rot (`i18nForkTouchedFiles.json` vs live git derivation) fails before and after 62-05.
