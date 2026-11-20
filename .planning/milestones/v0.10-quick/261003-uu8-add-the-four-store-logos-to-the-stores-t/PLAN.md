---
quick_id: 261003-uu8
created: 2026-10-03
title: Add the four store logos to the Stores tier-2 nav rows
area: frontend/nav
files:
  - src/frontend/components/UI/NavShell/components/NavItem/index.tsx
  - src/frontend/components/UI/NavShell/components/NavItem/index.scss
  - src/frontend/components/UI/NavShell/components/StoresPanel/index.tsx
  - src/frontend/components/UI/NavShell/__tests__/NavItem.test.tsx
  - src/frontend/components/UI/NavShell/__tests__/StoresPanel.test.tsx
---

# Add the four store logos to the Stores tier-2 nav rows

Follows quick `261003-b63`'s reorder (commit `3e5e6daaa`), which left the four
storefront rows (Amazon Luna, Epic, GOG, Steam) as the only icon-less members of
the Stores panel — every other row there already carries a FontAwesome glyph.

## Research already settled (do not re-derive)

- **`StoreLogos` already covers all four.**
  `src/frontend/components/UI/StoreLogos/index.tsx` maps runners
  `legendary` -> Epic, `gog` -> GOG, `nile` -> Amazon, `steam` -> Steam, via
  `?react` SVG imports of `frontend/assets/{epic,gog,amazon,steam}-logo.svg`.
  It takes a `className` (default `store-icon`).
- **FontAwesome brands is NOT an option.** `@fortawesome/free-brands-svg-icons`
  is absent from `package.json` — only the `react-fontawesome` wrapper is
  installed. This is the documented cause of the blank-`faSteam` bug fixed by
  quick `260628-kzf`, which replaced `faSteam` with an inline SVG for exactly
  this reason. The four local SVGs are the brand glyphs kept as assets.

## Two blockers this plan exists to clear

1. **`NavItem` cannot accept a non-FontAwesome icon.** `icon` is typed
   `FontAwesomeIconProps['icon']` (`NavItem/index.tsx:36`) and is rendered
   through `<FontAwesomeIcon>` (`:61`). A store logo is a React element, not an
   icon definition, so it needs a separate prop.
2. **`color` does not drive `fill`.** None of the four SVGs declares a `fill`
   attribute (verified: zero `fill="..."` matches in all four files), so an SVG
   dropped into `.NavItem__icon` paints SVG-default black. The rules there set
   only `color` (`index.scss:49-53`, and `color: currentColor` on `.active` at
   `:78-80`), which SVG `fill` does not inherit from. Unaddressed, the logos go
   invisible on every dark theme — the same class of defect as the
   `--border-color` 1.08:1 finding and the gruvbox_dark/dracula focus-ring drop
   already recorded in this stylesheet's own comments.

## Tasks

### Task 1 — widen `NavItem` with an `iconElement` prop

Add `iconElement?: ReactNode` alongside the existing `icon`. Resolve to a single
rendered node so the `.NavItem__icon` wrapper and the "no icon -> no wrapper"
behaviour are both preserved; `iconElement` wins when both are passed. `ReactNode`
is already imported. Existing `icon` callers are untouched.

### Task 2 — style the logo, scoped so FontAwesome rows cannot regress

Do **not** add a bare `> svg` rule under `.NavItem__icon`: `FontAwesomeIcon`
also renders an `svg` there, so a generic width/height would resize every
existing FA row. Instead pass a dedicated class from the call site and style
only that:

```scss
.NavItem__storeLogo {
  width: 1em;
  height: 1em;
  fill: currentColor;
}
```

`fill: currentColor` is what makes the logo track the row's existing
inactive/active/hover colour, so it survives all 13 themes by construction
rather than by per-theme override.

### Task 3 — pass the logos from `StoresPanel`

Give the four storefront rows
`iconElement={<StoreLogos runner="<runner>" className="NavItem__storeLogo" />}`.
Row order, labels, routes, and the two guard expressions on Humble Keys and
Redeem-a-Steam-key stay exactly as `3e5e6daaa` left them.

### Task 4 — tests

`NavItem.test.tsx` gains coverage that `iconElement` renders inside the icon
wrapper and suppresses the FontAwesome branch. `StoresPanel.test.tsx`'s existing
order assertion must stay green — it reads `props.label`, which this change does
not touch.

<verify>
- `npx jest src/frontend/components/UI/NavShell/__tests__/` — NavItem,
  StoresPanel and destinationCoverage suites all green.
- `npx tsc --noEmit -p tsconfig.json` (or `pnpm codecheck`) — the new prop is
  typed, and `StoresPanel` passes a valid `Runner` for each row.
- `npx prettier --check` over the three source paths plus the two test paths.
  All five report `{ "ignored": false, "inferredParser": "typescript" }`, so this
  check is real assurance, not vacuous. **This PLAN.md is itself under
  `.planning/`, which `.prettierignore` covers — a `--check` over it would exit
  0 having matched nothing, so it is deliberately not run.**
- Theme survival is argued structurally (`fill: currentColor` inherits the row
  colour each theme already sets) rather than measured per-theme. A live
  screenshot pass across all 13 themes is NOT performed here and is not claimed.
</verify>
