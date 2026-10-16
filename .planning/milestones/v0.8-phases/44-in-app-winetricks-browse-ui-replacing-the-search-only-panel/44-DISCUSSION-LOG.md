# Phase 44: In-app Winetricks browse UI replacing the search-only panel - Discussion Log

> **Audit trail only.** Do not use as input for planning, research, or execution agents — read
> `44-CONTEXT.md` only. Decisions are captured there; this log preserves the alternatives
> considered and which were rejected.

**Date:** 2026-09-15
**Phase:** 44-in-app-winetricks-browse-ui-replacing-the-search-only-panel
**Areas discussed:** Curated verb list, Category group + nested scroll, Localisation of 16 keys,
Installed-components census, Which todos this closes, Verification strategy

**Areas offered and all selected.** Six gray areas were presented — three the approved
`44-UI-SPEC.md` explicitly left open, three found during the codebase scout that it does not cover.

---

## Curated verb list

| Option | Description | Selected |
|--------|-------------|----------|
| Trim to ~8 | 12 rows makes the open-by-default group its own scroll region; drop older vcruns and dotnet6 to their category | ✓ |
| Ship the provisional 12 | Broadest coverage of "I need a VC++ runtime but not which year", taller group | |
| Derive it from the data | `cached === true` or installed — self-maintaining, but empty on a fresh bottle | |

| Option | Description | Selected |
|--------|-------------|----------|
| Curated verb appears in both curated group and its category | Curated is a shortcut view, not a partition; category counts stay honest against the parse | ✓ |
| Removed from its category | Each verb appears exactly once; makes every category count a derived number | |

| Option | Description | Selected |
|--------|-------------|----------|
| Skip silently + unit test over the committed fixture | UI degrades gracefully; CI reports constant drift | ✓ |
| Skip silently, no test | Zero maintenance, but the group can shrink to nothing unnoticed | |
| Render it anyway, disabled | Most informative, but puts a dead-looking row in the highest-traffic group | |

| Option | Description | Selected |
|--------|-------------|----------|
| Expand state resets each dialog open | Predictable; no new persistence surface | ✓ |
| Persist across opens | Helps repeat font installs; adds a persisted UI-state store | |

**Notes:** The provisional 12 came from `44-UI-SPEC.md` Open Item 1, explicitly marked not final
and not validated against telemetry (none exists). Working set recorded in D-01.

---

## Category group + nested scroll

| Option | Description | Selected |
|--------|-------------|----------|
| New panel-scoped group on `Dropdown` | Copy `FilterFacetGroup`'s header + token-survival chains; no edit to an app-wide-scoped stylesheet | ✓ |
| De-scope and share `FilterFacetGroup` | Single source of truth, but every rule goes live app-wide and Games filter panel becomes a regression surface | |
| Share header only, new rows | Real deduplication of the part that matters, but refactors shipped Games-panel code inside a Winetricks phase | |

| Option | Description | Selected |
|--------|-------------|----------|
| Drop the per-category 240px scroll | Two containers instead of three; resolves the spec's own unresolved P-7 | ✓ |
| Keep 240px as specced | All five headers stay reachable, at the cost of the nested-scroll trap | |
| One category open at a time | Accordion removes the need for a bound, but changes the interaction model the spec drew | |

| Option | Description | Selected |
|--------|-------------|----------|
| Render all 328 rows, measure later | No new dependency for an unmeasured problem | ✓ |
| Virtualise long categories | Guaranteed smooth, but new runtime dep; interacts badly with mousedown capture and find-in-page | |
| Cap and "show all" | Bounded DOM, but a second disclosure inside a disclosure | |

**Notes:** Scout finding that shaped the options — `FilterFacetGroup/index.scss` is scoped under
`.NavShell__tier2Portal` and so cannot style anything in the Winetricks dialog without being
de-scoped first; its `FilterFacetRow` is a `role="checkbox"` toggle, not an install-action row.
No windowing library exists in `package.json`. **This area produced an override of the approved
UI-SPEC** — recorded as D-06.

---

## Localisation of 16 keys

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated task inside Phase 44, gated green | The phase cannot be done with CI red; deferring moves the red somewhere easier to forget | ✓ |
| Separate quick task before merge | Keeps the phase about rendering, but leaves HEAD red in a window this repo has already lost a whole phase to | |
| English first, fill when translated | Explicitly the pattern todo `816` exists to complain about | |

| Option | Description | Selected |
|--------|-------------|----------|
| Trim the 5 `category.*` keys → 11 keys / 528 strings | Category names are winetricks' own vocabulary; zenity shows them untranslated too | ✓ |
| Keep all 16 as specced | Most polished, 768 strings | |
| Trim harder (cut Errored/Retry copy) | Cheapest, but removes the failure affordance the old panel entirely lacked | |

| Option | Description | Selected |
|--------|-------------|----------|
| Re-measure machine-fill once, then hand-fill | One command is cheaper than assuming a credential has not been rotated | ✓ |
| Hand-fill directly | Precedented twice; avoids depending on a credential that failed two measurements | |

**Notes:** The fact that reframed this area, measured rather than assumed: the `gamelib` namespace
IS gated — `quick-260915-t13` recorded 17 unfilled keys producing 816 findings across 2 failing
tests — so English-only is not the silent option it was for the 84 ungated `translation.json`
`humbleKeys.*` keys. Accepted consequence of the trim: category headers read `DLLS`, not the
spec's drawn `DLLS & LIBRARIES`.

---

## Installed-components census

| Option | Description | Selected |
|--------|-------------|----------|
| Retire the flat summary | Per-row badges carry the same fact with category and cached context | ✓ |
| Retire the list, keep a count | Preserves at-a-glance census, one more string and more dialog height | |
| Keep it as-is | Only flat always-visible view, but the redundancy the spec argued against | |

| Option | Description | Selected |
|--------|-------------|----------|
| Installed components appear in search results, badged | Removes a false negative that reads as "not available" | ✓ |
| Keep filtering them out | Preserves shipped behaviour; browse and search then disagree about what exists | |

| Option | Description | Selected |
|--------|-------------|----------|
| No action on an installed row — badge only | Per the spec; action slot's meaning stays unambiguous | ✓ |
| Offer "Install again" | Technically available, but a destructive-ish action behind a row that reads as done | |

| Option | Description | Selected |
|--------|-------------|----------|
| Parser order | winetricks' own emission order; nothing to get wrong, matches zenity | ✓ |
| Alphabetical by title | Most scannable, but reorders vs zenity and exposes collation | |
| Alphabetical by verb | Stable and locale-independent, but verbs are not guessable vocabulary | |

**Notes:** Scout finding — `WinetricksSearch/index.tsx:42` currently filters installed components
out of results entirely, so the search choice is a reversal of shipped behaviour, not a new rule.

---

## Which todos this closes

| Option | Description | Selected |
|--------|-------------|----------|
| Narrow `2026-08-26` to SearchBar, keep open | *(recommended)* Closing a major todo on a false title while its untested sibling is live for Library users | |
| Close it | Winetricks no longer reaches either half; cleanest ledger | ✓ |
| Leave it untouched | Zero risk, but leaves a `files:` list pointing at components that will not exist | |

| Option | Description | Selected |
|--------|-------------|----------|
| Test asserting the list survives both triggers, then revert-to-red | Both triggers, not just `installing` — `35-25` closed half because half was tested | ✓ |
| Code review + grep for the gates | Cheap, but a source-shape check a future refactor would pass | |

| Option | Description | Selected |
|--------|-------------|----------|
| Port the mouse-race test to the new Row | It encodes the `35-25` finding, and the spec keeps the technique | ✓ |
| Delete with the component | Honest about the premise, but deletes the only executable record of the defect | |

| Option | Description | Selected |
|--------|-------------|----------|
| Leave orphaned `translation.json` keys in place | *(recommended)* Removal has known traps; only 47 of 49 locales have the file | |
| Remove the orphans | Keeps the catalog honest; requires touching 47 locale files carefully | ✓ |

**Notes:** Two operator decisions went against the stated recommendation and were taken as final.
Both were recorded with obligations attached rather than re-litigated: closing `2026-08-26`
requires Half A to be folded into the `2026-08-30` todo first (D-16, agreed in the next area), and
the orphan removal must be grep-verified against `src/` and applied to 47 dirs, not 49 — `br` and
`sl` have no `translation.json` (D-20).

---

## Verification strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Fold Half A into the `2026-08-30` todo before closing | The untested sibling moves rather than evaporates | ✓ |
| Let it close with the todo | Treat as resolved by construction | |
| File Half A as its own todo | Most visible, adds a third open todo over the same primitive | |

| Option | Description | Selected |
|--------|-------------|----------|
| Component tests + one live gate | Live gates have beaten a green suite on this surface three times | ✓ |
| Component tests only | Fast, but every prior defect here was invisible to the suite | |
| Live gate only | Highest fidelity, but Installing/Errored/Needs-GUI are unrepeatable | |

Live-gate scope (multi-select):

| Option | Description | Selected |
|--------|-------------|----------|
| Real install, list stays mounted | The phase's central claim | ✓ |
| Installed badge appears in place | Proves the refetch renders as state change, not remount | ✓ |
| Needs-GUI row routes to zenity | | |
| Browse + search by pointer | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Token gate + spot-check one dark and one light theme | Gate is the mechanism; spot-check catches contrast it cannot see | ✓ |
| Gate only | Cheapest, but the gate sees undefined tokens, not unreadable contrast | |
| All 10 themes by eye | Exhaustive, mostly re-measures what the fallback chains guarantee | |

**Notes:** Two of the four live-gate items were deliberately not selected. Recorded as D-23 so no
later document claims live coverage this phase does not have.

---

## Claude's Discretion

No area was answered "you decide". Discretion left to the planner is enumerated in
`44-CONTEXT.md` `<decisions>` → "Claude's Discretion": file/module layout under
`WinetricksBrowse/`, how the curated constant is exported, the per-row action-slot component's
shape, and re-use vs re-derivation of `t13`'s pre-flight locale validator.

## Deferred Ideas

- Fixing `.autoComplete`'s focus-conditional overlay for `LibrarySearchBar` — same primitive,
  different surface; tracked by the `2026-08-30` todo.
- Row virtualisation — only on a measured jank number.
- Persisted category expand state across dialog opens.
- A standing "N components installed" count.
- Batch install (select several, install once) — no such IPC surface exists; own phase.

No scope creep was raised during discussion; every deferred item above originated as a rejected
option rather than as an out-of-scope request.
