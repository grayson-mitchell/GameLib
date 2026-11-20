---
phase: quick-260711-htb
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx
autonomous: true
requirements:
  - GAP-4-phase17-uat
must_haves:
  truths:
    - "In every install modal (general InstallModal + SteamBottleSetup), the WinePrefix/CrossOver Bottle field renders first, the Wine version dropdown second, and the 'Use shared Wine prefix' toggle last inside the Wine-settings <details> block"
    - "The 'Use shared Wine prefix' warning infoBox still renders immediately after the toggle (now at the bottom), only when useSharedPrefix is true"
    - "disabled={useSharedPrefix} bindings on WinePrefix, CrossOver Bottle, and Wine version are preserved exactly"
  artifacts:
    - path: "src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx"
      provides: "Reordered Wine-settings block with the shared-prefix toggle moved to the bottom"
      contains: "use-shared-wine-config"
  key_links:
    - from: "WineSelector <details> block"
      to: "consumers (general InstallModal + SteamBottleSetup)"
      via: "shared component — reorder is global by construction"
      pattern: "use-shared-wine-config"
---

<objective>
Move the "Use shared Wine prefix" ToggleSwitch (htmlId `use-shared-wine-config`) and its
warning infoBox from the TOP of the Wine-settings `<details>` block to the BOTTOM, below the
Wine-version `SelectField`. This is a GLOBAL reorder inside the shared `WineSelector`
component, so it applies to BOTH consumers: the general InstallModal (Epic/GOG/Amazon/sideload)
AND the Steam guided setup (SteamBottleSetup). This is intended per the locked decision.

Purpose: Closes GAP 4 (cosmetic) from Phase 17 UAT — the shared-prefix toggle appearing above
the prefix/bottle/version fields is confusing because those fields are what the toggle disables.
Placing the toggle last matches user expectation.

Output: Reordered JSX in the single WineSelector index.tsx file. No logic, state, prop, or style
changes — pure presentational reorder.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Reorder Wine-settings JSX so the shared-prefix toggle renders last</name>
  <files>src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx</files>
  <action>
Inside the returned JSX (the `<>` fragment inside `<summary>`...`</summary>` at the current
lines ~103–171), reorder the child elements. The CURRENT order is:
  1. ToggleSwitch (htmlId `use-shared-wine-config`)
  2. `{useSharedPrefix && (<div className="infoBox">...</div>)}` warning
  3. `{showPrefix && (<PathSelectionBox ... />)}` (WinePrefix)
  4. `{showBottle && (<TextInputField ... />)}` (CrossOver Bottle)
  5. `<SelectField ...>` (Wine version)

Change to the DESIRED order:
  1. `{showPrefix && (<PathSelectionBox ... />)}` (WinePrefix)
  2. `{showBottle && (<TextInputField ... />)}` (CrossOver Bottle)
  3. `<SelectField ...>` (Wine version)
  4. ToggleSwitch (htmlId `use-shared-wine-config`)
  5. `{useSharedPrefix && (<div className="infoBox">...</div>)}` warning

Move the ToggleSwitch and the infoBox as a pair to the bottom, keeping the infoBox
immediately after the ToggleSwitch so the warning still appears directly under the toggle
when useSharedPrefix is true.

CONSTRAINTS (do not violate):
  - Do NOT change any element's props, attributes, handlers, i18n keys, htmlId values, or the
    `disabled={useSharedPrefix}` / `disabled={useSharedPrefix || wineVersionList.length === 0}`
    bindings. Copy each element verbatim; only its position changes.
  - Do NOT change state, effects, memoization, the `showPrefix`/`showBottle` derivations, or
    imports.
  - Do NOT add or remove props (no Steam-only prop — this is a global reorder per the locked
    decision).
  - Do NOT change styles/CSS.
This is a pure JSX reordering of five sibling elements. Nothing else changes.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm codecheck && npx eslint src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx</automated>
  </verify>
  <done>
`pnpm codecheck` (tsc) passes with 0 errors and `npx eslint` on the file is clean. Reading the
file confirms the new render order: WinePrefix/CrossOver Bottle → Wine version SelectField →
"Use shared Wine prefix" ToggleSwitch → warning infoBox. The `disabled={useSharedPrefix}`
bindings on the prefix/bottle/version fields are unchanged. There are no unit tests for this
presentational component (confirmed — no *.test.tsx alongside WineSelector), so verification is
tsc + eslint + code inspection only; runtime visual UAT of the reordered modal is pending
(needs GUI).
  </done>
</task>

</tasks>

<verification>
- `pnpm codecheck` exits 0 (no tsc regressions).
- `npx eslint src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx` is clean.
- Manual code read confirms the 5 sibling elements are in the desired order and no props/bindings changed.
- No unit tests exist for WineSelector; none are added. Runtime visual UAT is a follow-up.
</verification>

<success_criteria>
- The shared-prefix toggle and its warning infoBox render at the BOTTOM of the Wine-settings block, below the Wine-version dropdown, in both the general InstallModal and SteamBottleSetup.
- Zero behavior/state/prop/style changes — diff is a pure reorder.
- codecheck + eslint pass.
</success_criteria>

<output>
Create `.planning/quick/260711-htb-move-the-use-shared-wine-prefix-toggle-t/260711-htb-SUMMARY.md` when done.
</output>
