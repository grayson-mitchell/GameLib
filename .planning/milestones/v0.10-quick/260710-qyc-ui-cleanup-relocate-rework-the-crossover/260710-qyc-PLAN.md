---
phase: quick-260710-qyc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/Game/GamePage/index.tsx
  - src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx
  - public/locales/en/gamepage.json
autonomous: true
requirements: [QYC-UI-01]

must_haves:
  truths:
    - "The CrossOver/Wine emulation rows render in the Install info ('info') tab under Supported platforms, not in the Extra info tab"
    - "The Extra info tab does not appear for games whose only extra data is applegamingwiki or codeweavers"
    - "The emulation rows are hidden entirely when the game runs natively on the current OS (is.native)"
    - "The Crossover row shows the CodeWeavers logo; the Wine row keeps the WineBar icon"
    - "Row labels read 'Crossover emulation' and 'Wine emulation'"
    - "The Wine row opens AppleGamingWiki on macOS and WineHQ AppDB on Linux (no more codeweavers.com from the Wine row)"
  artifacts:
    - path: src/frontend/screens/Game/GamePage/index.tsx
      provides: "AppleWikiInfo relocated to info tab + corrected hasWikiInfo gate"
    - path: src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx
      provides: "Reworked emulation rows (gate, icon, wording, Wine link)"
    - path: public/locales/en/gamepage.json
      provides: "Updated crossover-rating / wine-rating default strings"
  key_links:
    - from: src/frontend/screens/Game/GamePage/index.tsx
      to: src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx
      via: "<AppleWikiInfo> rendered inside the 'info' TabPanel after <PlatformSupport>"
      pattern: "AppleWikiInfo"
    - from: src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx
      to: frontend/assets/codeweavers_icon.svg
      via: "svg?react import for CodeweaversLogo"
      pattern: "codeweavers_icon.svg\\?react"
---

<objective>
Relocate and rework the CrossOver/Wine emulation compatibility rows on the GamePage.

Purpose: These rows currently live in the Extra-info tab and use generic wine-glass icons and codeweavers.com links regardless of platform. They belong next to Supported platforms in the Install-info tab, should only appear when a compat layer is actually needed (non-native games), and should link to the correct wiki per OS.

Output: Updated GamePage index, reworked AppleWikiInfo component, and updated en gamepage.json defaults. All locked decisions from the discussion are implemented exactly.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<interfaces>
<!-- GameContext `is` shape (from src/frontend/screens/Game/GameContext.tsx). -->
<!-- is.native = isWin || isMacNative || isLinuxNative. is.mac = platform === 'darwin' (native-independent). -->
is: {
  native: boolean   // true when the game runs natively on the current OS
  mac: boolean       // true on macOS regardless of native flag
  linux: boolean
  win: boolean
  ...
}

<!-- CodeweaversLogo import style (from src/frontend/screens/Settings/components/WineVersionSelector.tsx line 13): -->
import CodeweaversLogo from 'frontend/assets/codeweavers_icon.svg?react'
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Relocate AppleWikiInfo and correct the hasWikiInfo gate in index.tsx</name>
  <files>src/frontend/screens/Game/GamePage/index.tsx</files>
  <action>
Two edits in src/frontend/screens/Game/GamePage/index.tsx (per locked decisions 1 and 2):

1. Move the `<AppleWikiInfo gameInfo={gameInfo} />` element (currently the last child of the `index="extra"` TabPanel, immediately after `<CompatibilityInfo gameInfo={gameInfo} />` around line 565) OUT of the extra TabPanel. Place it inside the `index="info"` TabPanel, immediately AFTER `<PlatformSupport gameInfo={gameInfo} />` and BEFORE `<DownloadSizeInfo gameInfo={gameInfo} />`. The extra TabPanel keeps `<Scores>`, `<HLTB />`, and `<CompatibilityInfo />`; only AppleWikiInfo relocates. Do not change the `AppleWikiInfo` import.

2. In the `hasWikiInfo` boolean (around lines 375-381), REMOVE both the `wikiInfo?.applegamingwiki ||` term and the `wikiInfo?.codeweavers?.rating != null` term. The resulting expression must be exactly the OR of: `wikiInfo?.howlongtobeat`, `wikiInfo?.pcgamingwiki?.metacritic.score`, `wikiInfo?.pcgamingwiki?.opencritic.score`, and `wikiInfo?.steamInfo`. Do not touch any other gate or the `useEffect` that sets wikiInfo.
  </action>
  <verify>
    <automated>grep -c "AppleWikiInfo" src/frontend/screens/Game/GamePage/index.tsx</automated>
  </verify>
  <done>AppleWikiInfo renders in the info TabPanel between PlatformSupport and DownloadSizeInfo; hasWikiInfo no longer references applegamingwiki or codeweavers; the extra TabPanel no longer contains AppleWikiInfo.</done>
</task>

<task type="auto">
  <name>Task 2: Rework AppleWikiInfo rows (gate, CodeWeavers icon, wording, Wine link) + update i18n defaults</name>
  <files>src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx, public/locales/en/gamepage.json</files>
  <action>
Edit src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx per locked decisions 3a-3e:

a. Visibility gate: destructure `is` alongside `wikiInfo` from `useContext(GameContext)`. After the existing `if (!wikiInfo) return null` guard, add `if (is.native) return null`. (is.native = isWin || isMacNative || isLinuxNative — emulation rows only show for non-native games.)

b. Crossover row icon: add `import CodeweaversLogo from 'frontend/assets/codeweavers_icon.svg?react'` (same style as WineVersionSelector.tsx). In the `codeweavers &&` block, replace `<WineBar />` with `<CodeweaversLogo style={{ width: '24px', height: '24px' }} />`. The `applegamingwiki &&` (Wine) block KEEPS its `<WineBar />`. Keep the `WineBar` import (still used by the Wine row).

c. Wording: change the Crossover default fallback string from 'Crossover rating' to 'Crossover emulation', and the Wine default fallback from 'Wine rating' to 'Wine emulation'. Keep the existing i18n keys `info.crossover-rating` and `info.wine-rating` — only the fallback strings change.

d. Rework `onClickWine` so it no longer references codeweavers.com or `applegamingwiki?.crossoverLink`. New behavior using `createNewWindow`:
   - if `is.mac`: open `https://www.applegamingwiki.com/w/index.php?search=${encodeURIComponent(gameInfo.title)}`
   - else (Linux): open `https://appdb.winehq.org/objectManager.php?sClass=application&sTitle=Browse+Applications&bIsQueue=false&bIsRejected=false&sOrderBy=appName&bAscending=true&sHavingText=${encodeURIComponent(gameInfo.title)}`

e. Leave `onClickCrossover` UNCHANGED (still opens codeweavers.com).

Keep everything else intact: the star `Rating` rendering, `crossoverRatingCountLabel`, `ratingTier(applegamingwiki.wineRating).label`, and the `title` / `role="button"` / `className="iconWithText"` attributes on both anchors.

Then update public/locales/en/gamepage.json: change `"crossover-rating": "Crossover rating"` (line ~184) to `"Crossover emulation"` and `"wine-rating": "Wine rating"` (line ~199) to `"Wine emulation"`. Do not add or rename any keys.
  </action>
  <verify>
    <automated>grep -c "is.native\|CodeweaversLogo\|applegamingwiki.com\|appdb.winehq.org" src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx</automated>
  </verify>
  <done>Component returns null for native games; Crossover row uses CodeweaversLogo (24x24), Wine row keeps WineBar; labels default to 'Crossover emulation'/'Wine emulation'; onClickWine branches mac->AppleGamingWiki, else->WineHQ AppDB with no codeweavers reference; onClickCrossover unchanged; gamepage.json defaults updated.</done>
</task>

<task type="auto">
  <name>Task 3: Typecheck and lint</name>
  <files>(none — verification only)</files>
  <action>Run the project typecheck and lint to confirm the edits compile and satisfy lint rules. Package manager is pnpm (per package.json packageManager field). Scripts: `codecheck` = `tsc --noEmit`, `lint` = `eslint --cache .`. Fix any type or lint errors introduced by Tasks 1-2 (e.g. unused imports, missing destructure).</action>
  <verify>
    <automated>pnpm codecheck && pnpm lint</automated>
  </verify>
  <done>Both `pnpm codecheck` and `pnpm lint` pass with no errors.</done>
</task>

</tasks>

<verification>
- AppleWikiInfo appears in the Install-info tab under Supported platforms (not the Extra-info tab).
- Extra-info tab does not render for games whose only extra data is applegamingwiki/codeweavers.
- Emulation rows hidden for native games; Crossover row shows CodeWeavers logo; Wine row shows WineBar.
- Labels read 'Crossover emulation' / 'Wine emulation'.
- Wine row opens AppleGamingWiki (mac) or WineHQ AppDB (Linux); Crossover row still opens codeweavers.com.
- `pnpm codecheck` and `pnpm lint` both pass.
</verification>

<success_criteria>
All three locked-decision task groups implemented exactly as specified, with typecheck and lint green. No new i18n keys, no tab restructuring beyond the specified relocation.
</success_criteria>

<output>
Create `.planning/quick/260710-qyc-ui-cleanup-relocate-rework-the-crossover/260710-qyc-SUMMARY.md` when done
</output>
