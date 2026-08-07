# Sketch Wrap-Up Summary

**Date:** 2026-08-07
**Sketches processed:** 4 (4 included, 0 excluded)
**Design areas:** Navigation shell · Library filtering
**Skill output:** `./.claude/skills/sketch-findings-gamelib/`

## Included Sketches

| # | Name | Winner | Design Area |
|---|------|--------|-------------|
| 001 | app-level-tab-bar | **C** — card / folder | Navigation shell |
| 002 | sidebar-overflow-strategy | **B adapted** — two tiers, second vertical | Navigation shell |
| 003 | two-tier-card-nav | **Synthesis** — only Manage Accounts full-bleed | Navigation shell |
| 004 | games-filter-panel | **C** — hybrid | Library filtering |

## Excluded Sketches

None. Sketch 002's variants all lost, but its finding — `SidebarLinks` carries ~14 destinations
against a tab bar's 5–7 — is what forced the two-tier structure, so it was included for the
constraint rather than the visuals.

## Design Direction

Two-tier navigation replacing the left sidebar. Tier 1 is four horizontal card/folder tabs whose
active member merges into the content surface below it. Tier 2 is a ~204px vertical panel scoped
to the selected tab: filters on Games, nav lists on Stores and Settings, absent on Manage Accounts.
The sidebar is demoted rather than deleted — it stops being global navigation and becomes a
contextual panel that earns its width per tab.

Everything renders in GameLib's real tokens. Three shipped themes were carried into the sketches
as a deliberate stress test, and that test — not aesthetics — picked the winning tab style.

## Key Decisions

**Layout** — tier 1 horizontal card tabs (`Manage Accounts`, `Games`, `Stores`, `Settings`);
tier 2 vertical, 204px, collapsing only on Manage Accounts.

**Palette** — unchanged real tokens: `--brand-primary #1de8f5`, `--neutral-01 #070a0b` body,
`--neutral-02 #161c1e` navbar, `--neutral-03 #272f31` raised.

**Typography** — Rubik / Cabin, 1.2 scale on 16px root.

**Spacing & shape** — 4/8/12/16/24/32/48 scale; 6px control radius, 10px container, `9999px` pills.

**Interaction** — `.12s–.22s ease`; panel width uses `cubic-bezier(.4,0,.2,1)`.

**Filtering** — hybrid panel: search, single-select views and collections on top; multi-select
Store/Platform/Genre facets collapsed below; removable chips above the grid. Facet counts are
computed **excluding their own facet**.

## Constraints Recorded

| Constraint | Consequence |
|---|---|
| macOS traffic lights occupy ~78px top-left | No top-mounted bar starts at `x=0` |
| `dracula` renders the navbar **lighter** than the body | Active states must be relational, never "bar is the dark band" |
| `SidebarLinks` holds ~14 destinations | A 5–7 item tab bar cannot absorb them — two tiers are mandatory |
| Phase 34.8's hardcoded-string gate rides `pnpm test:ci` | Nav labels are an i18n key migration across 49 locales, not string edits |
| Manage Accounts drops the panel | ~204px content shift on that transition — accepted deliberately, do not "fix" |

## Open Questions Carried Forward

- **Genre metadata coverage is unmeasured** across four store APIs. A facet empty for every Amazon
  title reads as broken — verify before committing, and dropping it is an acceptable outcome.
- **Platform filtering should likely mean "will this run", not "is this native"** — bottled Windows
  games run on macOS. Phases 18 and 19 already hold the data for the better predicate.
- **Filter persistence** across navigation and restart is undecided.
- **Collections** — manual, rule-based, or both — was explicitly left out of scope.

## Consumed By

- **Phase 34.10** — Navigation shell → `references/navigation-shell.md`
- **Phase 34.11** — Library filtering → `references/library-filtering.md`
