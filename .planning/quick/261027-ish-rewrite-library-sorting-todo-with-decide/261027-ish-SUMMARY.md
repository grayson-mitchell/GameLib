# Quick 261027-ish: Rewrite library-sorting todo Summary

Rewrote `.planning/todos/pending/2026-10-03-library-sorting-is-title-only-add-a-sort-field-menu-playnite.md` in place with the operator's 2026-10-27 decisions, corrections, and the verified Playnite list (31 SortOrder members, GroupableField, triage table). `ready: human` became `ready: code`.

- Commit: `f2b93d9de` (exactly one file)
- Verify: `pnpm planning-gates` 12/12 PASS; all grep assertions OK; `git show --stat HEAD` lists one file. Prettier check omitted: `.planning/` is prettier-ignored (vacuous).
- All line numbers re-measured by grep at execution time.

## Deviations from Plan

**[Rule 1 - Factual correction] The plan's correction of old trap 2 is only partly true.** The plan said tsStore `lastPlayed` exists for every runner including Steam, and that Steam launches pass through `launchEventCallback`. Measured: they do not. `protocol.ts:206-217` routes Steam to `dispatchSteamLaunch` (`steam/launchDispatch.ts:43`), which never writes `tsStore`; `Game/TimeContainer/index.tsx:64-67` says so too. The todo records the true state (non-Steam runners only) and flags the consequence: with "tsStore only, no steamLastPlayed merge", every Steam game's Last played is unknown and sorts last. The todo lists the options (confirm with the operator, or have `dispatchSteamLaunch` write firstPlayed/lastPlayed). The operator's locked decision was not changed.

Also: `GameInfo` has no publisher field (the `publisher?` at `types.ts:882` is on an unrelated media type), recorded in the triage table.

## Self-Check: PASSED
