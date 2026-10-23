# Quick Task 261024-ho4: Confirm before installing a title whose CrossOver rating is below 4 of 5 - Context

**Gathered:** 2026-10-24
**Status:** Ready for planning

<domain>
## Task Boundary

Action todo `.planning/todos/pending/2026-10-23-confirm-install-when-crossover-rating-below-4.md`:
on macOS, when the user installs a Windows title whose CodeWeavers CrossOver rating is below 4 of 5,
show the rating and ask them to confirm before the install starts. Close the todo when done.

</domain>

<decisions>
## Implementation Decisions (operator, 2026-10-24 — locked)

### Threshold
- Confirm for ratings 1, 2 and 3. Ratings 4 and 5 install with no prompt.
- Ratings <= 2 keep the stronger "known not to work" wording; a 3 gets a milder "may have problems"
  wording. Both show the rating itself (e.g. "rated 2 of 5").

### Unknown rating
- `null` (looked up, no CodeWeavers record): a soft, passive notice in the install modal
  ("no CrossOver rating found"). No confirm step.
- Absent key (not eligible): nothing at all.

### Scope
- Every store: Steam, Epic, GOG and Amazon, for Windows titles installed through CrossOver on
  macOS, wherever `crossoverRatings` has an entry for the title.

### Extras
- No "don't ask again" persistence. Ask on every install of a low-rated title.
- Known-bad list reasons are NOT fed into the dialog in this task.

### Mechanism
- A confirm step (dialog), never a disabled Install button. Cancelling the confirm returns to the
  install modal without starting anything; confirming proceeds exactly as Install does today.
- `WineSelector/index.tsx` has a comment above the `isKnownNotToWork` hint saying it "must NEVER
  be wired into the Install button's `disabled` prop or otherwise gate/delay the install". This
  task deliberately reverses that for ratings below 4 (confirm, not disable). Rewrite that comment
  in place to record the reversal, the date and this quick task id.

### Claude's Discretion
- Exact dialog component (reuse the app's existing confirm/dialog primitive), copy wording within
  the constraints above, where the shared rating-check helper lives, test layout.

</decisions>

<specifics>
## Specific Ideas

- Motivation: Hoard (63000) and ELEX (411300) install fine and then fail to run under CrossOver;
  the rating is the earliest signal that a multi-GB download is likely wasted.
- Same principle as the D-51-08 amendment (quick 261023-og0): tell the user up front.
- New strings go in `public/locales/en/gamelib.json` (follow how other gamelib strings are added
  across locales in this repo).

</specifics>

<canonical_refs>
## Canonical References

- The todo file above (lists the relevant files: WineSelector/index.tsx, InstallModal/SteamDialog,
  `src/backend/crossover_index/crossoverRatingMap.ts`, `public/locales/en/gamelib.json`).
- `Skill("gamelib-conventions")` — the `<verify>` prettier rule applies to every task.

</canonical_refs>
