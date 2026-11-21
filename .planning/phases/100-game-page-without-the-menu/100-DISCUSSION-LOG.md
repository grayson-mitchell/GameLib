# Phase 100: Game page without the ⋮ menu - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-21
**Phase:** 100-game-page-without-the-menu
**Areas discussed:** Unmapped Install-tab content, Library card menu & Categories modal, Long-running row actions, Rollout & live check

Pre-answered (not asked): everything sketch 012 (with 008/010/011) decided — see
`.claude/skills/sketch-findings-gamelib/references/game-page.md`.

---

## Unmapped Install-tab content

**Cloud saves row**

| Option | Description | Selected |
|--------|-------------|----------|
| Fact row + buttons + switch | "Synced …" + [Sync now ▾] + [Open saves folder]; Auto-sync a switch row under Library & integration; no hover menu | ✓ |
| Fact row, sync in a split button | All sync commands + Open folder behind one split button; Auto-sync stays in the row | |
| You decide | Planner picks within the no-hidden-actions rule | |

**Apple compatibility verdict**

| Option | Description | Selected |
|--------|-------------|----------|
| Ratings tab, beside ProtonDB | Compatibility is a rating of the game; ProtonDB already goes to Ratings | ✓ |
| Install tab, as a Compatibility row | Visible where Mac users decide to install | |

**Platforms / Online required / Third-party manager**

| Option | Description | Selected |
|--------|-------------|----------|
| Fact rows without actions | One consistent row shape; conditional rows only when they apply | ✓ |
| Fold into existing rows | Platforms in Version value; muted line under Version | |
| You decide | | |

**Native-port hint and Humble origin**

| Option | Description | Selected |
|--------|-------------|----------|
| Neutral notes in the Install tab | 009 accent-tinted note style, after fact rows, before Library & integration | ✓ |
| Humble origin to left card, port hint in Install | Key origin as identity in the left card meta | |
| You decide | | |

---

## Library card menu & Categories modal

**Library card right-click menu**

| Option | Description | Selected |
|--------|-------------|----------|
| Leave it, re-point Logs only | Right-click is the expected quick path in a grid; only Logs changes (opens ⚙ Logs tab) | ✓ |
| Align it with the new page | Checkmarked nouns instead of flipping labels | |

**Per-game Categories modal**

| Option | Description | Selected |
|--------|-------------|----------|
| Keep it for the library card only | Card's right-click needs something to open; popover has no anchor there | ✓ |
| Delete it, card uses the popover too | One implementation; anchoring work in the grid | |

**"New category…" in the popover**

| Option | Description | Selected |
|--------|-------------|----------|
| Create and assign at once | Enter creates + assigns; popover stays open; rename/delete stays in CategoriesManager | ✓ |
| Create only, then tick it | Extra click; creating separate from assigning | |

---

## Long-running row actions

**Progress display**

| Option | Description | Selected |
|--------|-------------|----------|
| Footer status + busy row button | Footer stays the single readout; row button pulses "Verifying…" | ✓ |
| Progress bar inside the row too | Second readout mirrored in the row | |

**Other actions while one runs**

| Option | Description | Selected |
|--------|-------------|----------|
| Disable conflicting ones, with a reason | Tooltip "Wait for the move to finish"; unrelated stay live; mirrors MainButton gating | ✓ |
| Only the running button changes | Backend rejects conflicts | |

**Failures**

| Option | Description | Selected |
|--------|-------------|----------|
| Inline in the row + Retry | Same shape as switch-row failures; replaces error dialogs | ✓ |
| Keep today's error dialogs | repairFailure.ts etc. unchanged | |

**Confirmations**

| Option | Description | Selected |
|--------|-------------|----------|
| Keep Move/Set folder, drop Verify | Moving/re-pointing is consequential; Verify is non-destructive | ✓ |
| Keep all existing confirmations | | |
| You decide | | |

---

## Rollout & live check

**Rollout across plans**

| Option | Description | Selected |
|--------|-------------|----------|
| Build new homes, delete ⋮ last | ⋮ stays as fallback; final plan deletes DotsMenu/GameSubMenu | ✓ |
| Shrink ⋮ as items move | No duplicates; odd partial menu mid-phase | |

**UAT themes**

| Option | Description | Selected |
|--------|-------------|----------|
| midnight + dracula + gruvbox | The three themes with a defined --fav; dracula is the switch-track risk | ✓ |
| Default theme only, spot-check dracula | | |

**UAT stores**

| Option | Description | Selected |
|--------|-------------|----------|
| Steam + one Epic/GOG + sideload | Every row variant, plus one not-installed game | ✓ |
| Steam + Epic/GOG only | | |

---

## Claude's Discretion

- Component split, file layout, hook decomposition of the ⋮ logic
- Exact conflict set per long action (within D-11)
- Plan count and wave order (within D-14)
- Copy for busy labels, tooltips and inline failures

## Deferred Ideas

- Library card right-click menu with checkmarked nouns instead of flipping labels
