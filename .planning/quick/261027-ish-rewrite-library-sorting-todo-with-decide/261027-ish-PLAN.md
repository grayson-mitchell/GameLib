---
phase: quick-261027-ish
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/todos/pending/2026-10-03-library-sorting-is-title-only-add-a-sort-field-menu-playnite.md
autonomous: true
requirements: [QUICK-261027-ish]

must_haves:
  truths:
    - "The library-sorting todo records the operator's 2026-10-27 decisions: slice 1 = sort field (Name / Last played / Install size) + direction, plus a separate group-by (None / Install status / Store); unknowns sort last in both directions"
    - "The todo states Won't do: Playtime and Won't do: Date purchased/Date added, with reasons, so later sessions do not re-propose them"
    - "The todo states Deferred: Release date (lazy getExtraInfo population) and Developer (fill rate unmeasured)"
    - "The 2026-10-03 trap 2 (no cross-store last played) is explicitly corrected: tsStore/timestampStore lastPlayed exists for every runner"
    - "The Playnite list is marked VERIFIED 2026-10-27 against FilterPreset.cs with all 31 SortOrder members, SortOrderDirection, the GroupableField enum, and a triage table"
    - "Frontmatter passes the todo gate with ready: code"
    - "The commit touches exactly one file"
  artifacts:
    - path: ".planning/todos/pending/2026-10-03-library-sorting-is-title-only-add-a-sort-field-menu-playnite.md"
      provides: "Rewritten todo with decided scope"
      contains: "ready: code"
  key_links:
    - from: "todo frontmatter"
      to: ".planning/todos/todo-frontmatter-gate.py"
      via: "pnpm planning-gates"
      pattern: "^ready: code$"
---

<objective>
Rewrite one existing todo in place so it records the decisions the operator made on 2026-10-27
about library sorting, corrects two errors in the 2026-10-03 version, and replaces the unverified
Playnite list with the verified one.

Purpose: the todo goes from `ready: human` (open design question) to `ready: code` (desk-ready
slice 1), and the rejected ideas are written down with their evidence so nobody re-proposes them.
Output: the rewritten todo file, committed alone. Documentation only. No source changes.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.claude/skills/gamelib-conventions/SKILL.md
@.planning/todos/pending/2026-10-03-library-sorting-is-title-only-add-a-sort-field-menu-playnite.md

Planner measurements (2026-10-27):
- `npx prettier --file-info` on the todo path returns `{ "ignored": true }`. `.planning/` is
  prettier-ignored, so a `prettier --check` on it would be a vacuous green. Per the `<verify>`
  convention it is omitted, and this note is the reason.
- `pnpm planning-gates` maps to `python3 meta/runPlanningGates.py`. That runs
  `.planning/todos/todo-frontmatter-gate.py`, which covers `pending/` only.
- The working tree has unrelated modified, untracked and possibly staged files, including a staged
  rename of another todo. Commit with a pathspec only.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite the library-sorting todo with decided scope, corrections and the verified Playnite set</name>
  <files>.planning/todos/pending/2026-10-03-library-sorting-is-title-only-add-a-sort-field-menu-playnite.md</files>
  <action>
Rewrite the todo in place with the Write tool. Keep the house style: terse and measured, with backticked `file:line` citations. The executor writes the prose. The content below is required.

RE-MEASURE RULE: every line number in the finished file must come from a grep run at execution time. Do not copy any number from this plan; the numbers here only say where to look. Cite whatever grep finds. If a symbol is gone or has moved, say what you found instead.
- Library sort state and comparator: `grep -n "sortDescending\|sortInstalled" src/frontend/screens/Library/index.tsx` (state is expected around 489-501, comparator around 860-890, and the old `The ` strip / `localeCompare` near the comparator).
- Header toggles: `grep -n "sortDescending\|sortInstalled" src/frontend/components/UI/Header/index.tsx`.
- tsStore writes: `grep -n "tsStore" src/backend/launcher.ts` (expected around 155 and 302-308, with the Steam branch around 248; confirm Steam launches reach the same `launchEventCallback`).
- tsStore definition: `grep -n "tsStore\|'timestamp'" src/backend/constants/key_value_stores.ts`.
- Frontend read: `grep -n "timestampStore" src/frontend/helpers/electronStores.ts`.
- install_size: `grep -n "install_size" src/common/types.ts`.
- Release-date lazy population: `grep -n "releaseDate" src/backend/storeManagers/gog/games.ts src/backend/storeManagers/legendary/games.ts src/backend/storeManagers/nile/*.ts src/backend/storeManagers/steam/*.ts`. Confirm that GOG and Epic set it inside `getExtraInfo()`, that nile sets it at library refresh, and that Steam never sets it.
- Publisher: `grep -n "publisher" src/common/types.ts`. Check for a publisher field on `GameInfo` before stating there is none, and record whatever the grep shows.

FRONTMATTER. Keep the existing keys in their existing order: created, title, area, severity, platform, ready, found_by, files, audit_acknowledged. Values stay bare and lowercase.
- `ready: human` becomes `ready: code`. Decisions are made, and slice 1 is desk-ready UI work (edit + typecheck + jest). The dev-app check is ordinary, not a live gate.
- `severity: minor`, `platform: any`, `created`, `title`, `area`, `found_by` and `audit_acknowledged` stay unchanged.
- Replace `files:` with these entries, using re-measured lines:
  - src/frontend/screens/Library/index.tsx (state range and comparator range)
  - src/frontend/components/UI/Header/index.tsx (toggle lines)
  - src/backend/launcher.ts (tsStore write lines)
  - src/frontend/helpers/electronStores.ts (timestampStore line)
  - src/common/types.ts (install_size line)
- Drop the gog.ts and depot.ts entries.

BODY SECTIONS, in order:

1. `## Problem`. Keep the existing description of the two localStorage booleans (`sortDescending` and `sortInstalled`) and the line saying that is the whole sort surface, with re-measured lines.

2. `## Decisions (operator, 2026-10-27)`, all locked:
   - Slice 1 has two controls. A sort-field + direction control replaces `sortDescending`, with fields **Name**, **Last played** and **Install size**. A SEPARATE group-by control replaces `sortInstalled`, with **None / Install status / Store**. Unknown values (never launched, not installed, unparseable size) sort LAST in both directions.
   - Last played comes from GameLib's own `tsStore` / `timestampStore` `lastPlayed` ONLY. The operator's reasoning: it is a GameLib fact, "last launched from GameLib". Do NOT merge Steam's `extra.steamLastPlayed`. The label should reflect GameLib launches if the UI has room; that is an implementation detail, not locked.
   - **Won't do: Playtime.** tsStore `totalPlayed` only counts GameLib launches, so it would show a false total for games played elsewhere. The operator rejected it.
   - **Won't do: Date purchased / Date added.** Only GOG has a real ownership date (`GalaxyLibraryEntry.owned_since`). Epic and Amazon have none. Steam's only source is license `time_created`, which is a grant date, not a purchase date, and sits on the slow bulk PICS path; the operator declined that approximation. A "first seen by GameLib" stamp would be either a single sync date for the whole existing library or blank for 4 of 5 runners. State plainly that the question that started this todo (sort by date purchased) is answered: it cannot be done faithfully across stores. Keep the old per-store purchase-date inventory table (GOG / Steam / Epic / Amazon / Sideloaded) here or in a sub-section as the evidence. Its cited lines may stay as they were measured on 2026-10-03, but label it "measured 2026-10-03", because those files are no longer in `files:`.
   - **Deferred: Release date.** GOG and Epic only populate `extra.releaseDate` lazily in `getExtraInfo()`, i.e. when a game page is opened (cite re-measured lines). Amazon (nile) populates it at library refresh. Steam never sets it. A sort on it would be mostly blank. It needs refresh-time metadata first, which is a separate piece of work.
   - **Developer is not in slice 1.** The per-store fill rate of `GameInfo.developer` is unmeasured.

3. `## Corrections to the 2026-10-03 version`:
   - Old trap 2 said cross-store last played does not exist. That was wrong. Heroic's `tsStore` (`backend/constants/key_value_stores.ts`, store name `timestamp`) records `firstPlayed`/`lastPlayed`/`totalPlayed` per appName in `launchEventCallback` (`launcher.ts` re-measured lines) for every runner, including Steam: Steam launches pass through the same callback (re-measured Steam branch line). The frontend reads it via `timestampStore` (`frontend/helpers/electronStores.ts`). Record the caveats: it only covers launches through GameLib, and session-duration accuracy for the steam:// handoff is unverified (irrelevant now that playtime is dropped).
   - The old "release date (partial coverage)" understated the gap. Point to Deferred above.
   - Trap 1 stands: `InstalledInfo.install_size` is a string (re-measured line). An unparseable value must not sort as zero; it sorts last.

4. `## Playnite reference set (VERIFIED 2026-10-27)`. Replace the old UNVERIFIED list. The source is `source/PlayniteSDK/Models/FilterPreset.cs` on JosefNemec/Playnite master, fetched via `gh api`.
   - `SortOrder` has 31 members, in this order: Name, Platforms, Library, Categories, LastActivity, Genres, ReleaseDate, Developers, Publishers, Tags, Series, AgeRatings, Version, Regions, Source, PlayCount, Playtime, CompletionStatus, UserScore, CriticScore, CommunityScore, Added, Modified, IsInstalled, Hidden, Favorite, InstallDirectory, Features, InstallSize, RecentActivity, RomList.
   - `SortOrderDirection` is Ascending/Descending.
   - There is a SEPARATE `GroupableField` enum: None, Platform, Library, Category, LastActivity, Genre, ReleaseYear, Developer, Publisher, Tag, Series, AgeRating, Region, Source, PlayTime, CompletionStatus, UserScore, CriticScore, CommunityScore, Added, Modified, Feature, InstallationStatus, Name, InstallDrive, InstallSize, RecentActivity. This sort/group split is the model adopted for `sortInstalled`.
   - Note that Playnite's `Added` is the date a game was added to Playnite, not a purchase date.
   - Then add a compact triage table covering all 31 SortOrder members (each must appear exactly once):
     - slice 1: Name; LastActivity and RecentActivity → "Last played"; InstallSize; IsInstalled and Library → group-by
     - won't do: Playtime, Added, PlayCount (for now)
     - deferred: ReleaseDate, Developers
     - skip, no data source: Publishers (state per the grep result), Series, AgeRatings, Version, Regions, CompletionStatus, UserScore, CriticScore, CommunityScore, Modified, Features
     - skip, not meaningful for GameLib: Platforms (all PC), Source (= Library for us), RomList, InstallDirectory, Hidden (a filter)
     - skip, multi-value, better as filter facets: Categories, Genres, Tags
     - optional: Favorite (cheap but not chosen)

5. `## Solution`. Slice 1 as decided above: a sort-field + direction control, a separate group-by control, and unknowns last. Remove the old "options to weigh" list, which is superseded, but keep the note that `sortInstalled` is a grouping, not a sort key. Keep localStorage persistence as the default approach, marked as not locked.

Do not add language that shrinks a decision ("v1", "placeholder", "for now" outside the PlayCount entry the brief specifies).

Then commit ONLY this file. The tree holds unrelated staged and unstaged changes, including a staged rename of another todo:
- `git add -- <todo path>`
- `git commit -m "docs(quick-261027-ish): record decided library-sort scope and verified Playnite list" -- <todo path>`, with the commit message ending in the Co-Authored-By attribution line from the session.
- Do NOT use `git commit -a` or a bare `git commit` without the pathspec.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm planning-gates && F=.planning/todos/pending/2026-10-03-library-sorting-is-title-only-add-a-sort-field-menu-playnite.md && grep -qx 'ready: code' "$F" && grep -qx 'severity: minor' "$F" && grep -qx 'platform: any' "$F" && ! grep -q 'depot.ts\|types/gog.ts' <(sed -n '/^files:/,/^audit_acknowledged:/p' "$F") && grep -q 'VERIFIED 2026-10-27' "$F" && grep -q 'GroupableField' "$F" && grep -q 'RomList' "$F" && grep -q 'timestampStore' "$F" && test "$(git show --stat --format= HEAD | grep -c '|')" -eq 1 && git show --stat --format= HEAD | grep -q 'library-sorting-is-title-only'</automated>
    Prettier: `npx prettier --file-info` on the todo path returns `"ignored": true`, because `.planning/` is prettier-ignored. Every path this task writes is ignored, so `prettier --check` is omitted as vacuous, per the gamelib-conventions `<verify>` rule.
  </verify>
  <done>
- The todo has `ready: code`, its frontmatter key order is unchanged, and `files:` lists the five re-measured entries with no gog.ts or depot.ts.
- The body has Problem, Decisions, Corrections, Playnite (VERIFIED, 31 SortOrder members plus GroupableField plus the triage table) and Solution.
- Every cited line number was grep-measured at execution time.
- `pnpm planning-gates` passes.
- HEAD changes exactly one file, this todo.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none | Documentation-only edit to a planning file. No runtime surface. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261027-ish-01 | Tampering | git commit sweeping unrelated staged changes | mitigate | Pathspec `git add -- <path>` + `git commit -- <path>`. The verify step asserts that `git show --stat HEAD` lists exactly one file. |
</threat_model>

<verification>
`pnpm planning-gates` passes, and HEAD contains exactly the one todo file. The prettier check is omitted because the path is prettier-ignored (measured).
</verification>

<success_criteria>
The todo is desk-ready (`ready: code`) with the locked slice-1 scope, explicit won't-do and deferred records with evidence, corrected trap 2, and a verified, fully triaged Playnite reference set.
</success_criteria>

<output>
Create `.planning/quick/261027-ish-rewrite-library-sorting-todo-with-decide/261027-ish-SUMMARY.md` when done.
</output>
