---
phase: quick-260628-kzf
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/Login/index.tsx
autonomous: true
requirements: [QUICK-260628-kzf]

must_haves:
  truths:
    - "The Steam Runner on the /login (Manage Accounts) page shows a visible Steam logo, not a blank tile"
    - "The Steam logo renders via the inline SteamLogo SVG, matching Epic/GOG/Amazon/Zoom"
    - "No unused FontAwesomeIcon/faSteam imports remain in the file"
  artifacts:
    - path: "src/frontend/screens/Login/index.tsx"
      provides: "Steam Runner using inline SteamLogo SVG"
      contains: "SteamLogo"
  key_links:
    - from: "src/frontend/screens/Login/index.tsx"
      to: "frontend/assets/steam-logo.svg"
      via: "import SteamLogo from 'frontend/assets/steam-logo.svg?react'"
      pattern: "import SteamLogo from 'frontend/assets/steam-logo.svg\\?react'"
---

<objective>
Fix the blank Steam icon on the Manage Accounts (/login) page. The Steam Runner
currently renders a FontAwesome `faSteam` icon, which appears blank against the
white runner icon tile because Runner styling (`.runnerWrapper svg { fill: var(--body-background) }`)
is tuned for the inline SVG logo assets used by every other store.

Purpose: Make the Steam store visually consistent with Epic/GOG/Amazon/Zoom on the login screen.
Output: Updated `src/frontend/screens/Login/index.tsx` using the existing `SteamLogo` SVG asset.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@src/frontend/screens/Login/index.tsx
@src/frontend/components/UI/StoreLogos/index.tsx

<interfaces>
<!-- Established pattern: every store Runner passes an inline SVG component as `icon`. -->
<!-- The Steam asset is already imported elsewhere (StoreLogos/index.tsx line 7). -->

From src/frontend/components/UI/StoreLogos/index.tsx:
```tsx
import SteamLogo from 'frontend/assets/steam-logo.svg?react'
// case 'steam': return <SteamLogo className={className} />
```

Other Runners in Login/index.tsx use:
```tsx
icon={() => <EpicLogo />}
icon={() => <GOGLogo />}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace Steam FontAwesome icon with inline SteamLogo SVG</name>
  <files>src/frontend/screens/Login/index.tsx</files>
  <action>
In src/frontend/screens/Login/index.tsx:
1. Add `import SteamLogo from 'frontend/assets/steam-logo.svg?react'` alongside the
   other logo imports (after the ZoomLogo import, ~line 13), matching the existing
   `frontend/assets/*.svg?react` import style.
2. Change the Steam Runner's icon prop (currently line 175,
   `icon={() => <FontAwesomeIcon icon={faSteam} />}`) to `icon={() => <SteamLogo />}`,
   matching the EpicLogo/GOGLogo pattern.
3. Remove the now-unused `import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'`
   (line 6) and `import { faSteam } from '@fortawesome/free-brands-svg-icons'` (line 7).
   These are used ONLY by the Steam Runner in this file — confirmed by grep before removal.
Do not change any other Runner, prop, or logic.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GamerLib && grep -q "import SteamLogo from 'frontend/assets/steam-logo.svg?react'" src/frontend/screens/Login/index.tsx && grep -q "icon={() => <SteamLogo />}" src/frontend/screens/Login/index.tsx && ! grep -Eq "faSteam|FontAwesomeIcon" src/frontend/screens/Login/index.tsx && pnpm run codecheck && pnpm run lint src/frontend/screens/Login/index.tsx</automated>
  </verify>
  <done>
Steam Runner uses `icon={() => <SteamLogo />}`; SteamLogo is imported; no references to
faSteam or FontAwesomeIcon remain in the file; `pnpm run codecheck` (tsc --noEmit) passes
and ESLint reports no errors for the file.
  </done>
</task>

</tasks>

<verification>
- The Steam tile on the /login page shows a visible Steam logo (white logo on the dark tile, consistent with other stores).
- `grep -E "faSteam|FontAwesomeIcon" src/frontend/screens/Login/index.tsx` returns nothing.
- `pnpm run codecheck` passes (no type errors).
- `pnpm run lint` reports no new errors.
</verification>

<success_criteria>
- Steam Runner renders the inline SteamLogo SVG, matching the Epic/GOG/Amazon/Zoom pattern.
- No unused FontAwesome imports remain.
- TypeScript typecheck and ESLint pass.
</success_criteria>

<output>
Create `.planning/quick/260628-kzf-fix-blank-steam-icon-on-manage-accounts-/260628-kzf-SUMMARY.md` when done
</output>
