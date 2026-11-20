---
phase: quick-260710-knr
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/Game/GamePage/components/InstalledInfo.tsx
  - src/frontend/screens/Game/GamePage/index.css
  - public/locales/en/gamepage.json
autonomous: false
requirements: [QUICK-KNR]

must_haves:
  truths:
    - "The Installed Platform row shows a platform icon (Windows/Apple/Linux) matching the Supported-platforms row style, instead of raw text"
    - "The Install Path row shows a discoverable folder-open icon on the right that opens the install location"
    - "codecheck (lint + typecheck) stays green"
    - "The Browser install-platform early return still renders as text (unchanged)"
  artifacts:
    - path: "src/frontend/screens/Game/GamePage/components/InstalledInfo.tsx"
      provides: "Platform icon in Installed Platform row + folder-open affordance in Install Path row"
      contains: "faFolderOpen"
    - path: "public/locales/en/gamepage.json"
      provides: "info.openLocation translation key"
      contains: "openLocation"
  key_links:
    - from: "InstalledInfo.tsx Install Path row"
      to: "window.api.openFolder"
      via: "existing row onClick (icon is visual affordance only)"
      pattern: "window\\.api\\.openFolder"
---

<objective>
In the Game > Install Info panel, make two small visual improvements to InstalledInfo.tsx:
1. Render the installed platform as an icon (faWindows/faApple/faLinux) consistent with the "Supported platforms" row, replacing the current raw text.
2. Add a discoverable folder-open icon to the right of the Install Path row that opens the install location.

Purpose: Visual consistency and discoverability of the "open folder" affordance that already exists on the row.
Output: Edited InstalledInfo.tsx (JSX + helper + imports), optional minimal CSS spacing, and one i18n key.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@src/frontend/screens/Game/GamePage/components/InstalledInfo.tsx
@src/frontend/screens/Game/GamePage/components/PlatformSupport.tsx

<interfaces>
<!-- Reference pattern for platform icons — reuse identical imports/usage. -->
From src/frontend/screens/Game/GamePage/components/PlatformSupport.tsx:
```tsx
import { faApple, faLinux, faWindows } from '@fortawesome/free-brands-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
// usage:
<FontAwesomeIcon icon={faWindows} title="Windows" />
<FontAwesomeIcon icon={faApple} title="macOS" />
<FontAwesomeIcon icon={faLinux} title="Linux" />
```

faFolderOpen source (already used in LogSettings and WineManager/WineItem):
```tsx
import { faFolderOpen } from '@fortawesome/free-solid-svg-icons'
```

InstallPlatform string values (common/types.ts) that can appear here:
'windows' | 'Windows' | 'Win32' | 'osx' | 'Mac' | 'linux'
('Browser' is handled by an early return at InstalledInfo.tsx ~lines 34-41 — DO NOT touch it.)

Install Path row (InstalledInfo.tsx ~lines 95-105): the whole `!isThirdParty` div is `className="clickable"` with `onClick={() => appLocation !== undefined ? window.api.openFolder(appLocation) : {}}`. It already opens the folder — the new icon is a visual affordance only, no new handler.

CSS context (src/frontend/screens/Game/GamePage/index.css ~lines 386-439): info rows are `& > div > *` flex with `gap: var(--space-md-fixed)`, `<b>` has `flex-grow: 1; flex-basis: 140px`, and `.truncatedPath` truncates. Rows already have `svg { outline: none; }`. Because `<b>` grows, the path + trailing icon already sit at the end of the row.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Platform icon + folder-open affordance in InstalledInfo.tsx</name>
  <files>src/frontend/screens/Game/GamePage/components/InstalledInfo.tsx</files>
  <action>
Add imports at top: `FontAwesomeIcon` from '@fortawesome/react-fontawesome'; `faApple, faLinux, faWindows` from '@fortawesome/free-brands-svg-icons'; `faFolderOpen` from '@fortawesome/free-solid-svg-icons'. Match the exact import identifiers used in PlatformSupport.tsx.

Add a module-scope helper that maps an InstallPlatform string to an icon + title, case-insensitively:
- lowercased value includes 'win' (covers 'windows' / 'Windows' / 'Win32') → { icon: faWindows, title: 'Windows' }
- lowercased value is 'osx' / 'mac' / 'darwin', or includes 'mac' → { icon: faApple, title: 'macOS' }
- lowercased value includes 'linux' → { icon: faLinux, title: 'Linux' }
- otherwise → null (caller falls back to raw text)

Installed Platform row (~lines 76-79): keep the `<b>{t('info.installedPlatform', 'Installed Platform')}:</b>` label. Replace the text value expression `installPlatform === 'osx' ? 'MacOS' : installPlatform` with: when the helper returns a mapping, render `<FontAwesomeIcon icon={mapping.icon} title={mapping.title} />`; when it returns null, render the raw `installPlatform` text as before. The `style={{ textTransform: 'capitalize' }}` on the wrapping div can stay (it only affects the text fallback). Do NOT change the `installPlatform === 'Browser'` early return block (~lines 34-41).

Install Path row (~lines 95-105): inside the existing `!isThirdParty` clickable div, immediately after the `<div className="truncatedPath">{appLocation}</div>`, add `<FontAwesomeIcon icon={faFolderOpen} title={t('info.openLocation', 'Open location')} />`. Do NOT add or change any onClick — the row's existing handler opens the folder. Do NOT alter the winePrefix row.
  </action>
  <verify>
    <automated>yarn tsc --noEmit -p src/frontend/tsconfig.json 2>&1 | grep -i 'InstalledInfo' || echo "NO_TS_ERRORS_IN_FILE"</automated>
  </verify>
  <done>InstalledInfo.tsx compiles; Installed Platform row renders a FontAwesome platform icon for win/osx/mac/linux values (raw text fallback otherwise); Install Path row shows a faFolderOpen icon after the truncated path; Browser early return and winePrefix row unchanged.</done>
</task>

<task type="auto">
  <name>Task 2: i18n key + optional CSS spacing</name>
  <files>public/locales/en/gamepage.json, src/frontend/screens/Game/GamePage/index.css</files>
  <action>
i18n: In public/locales/en/gamepage.json, add `"openLocation": "Open location"` to the `info` block at line ~179-195 (the block containing `installedPlatform`, `path`, `size`, `supportedPlatforms`). Keys in that block are alphabetically ordered — place `openLocation` between `installedPlatform` and `path`. Keep valid JSON (add the trailing comma correctly). The code already passes a default fallback via `t('info.openLocation', 'Open location')`, so this only affects the extracted-key check.

CSS (only if the folder icon needs spacing): the info rows are already flex with a gap, so the icon should sit at the row end without changes. If a tighter gap between the truncated path and the folder icon is desired, add a minimal margin using an existing token (e.g. `margin-inline-start: var(--space-xs)`) scoped to that icon in src/frontend/screens/Game/GamePage/index.css. Do NOT restructure the existing `& > div > *` rules. If no spacing tweak is needed after visual check, leave index.css unchanged and drop it from the commit.
  </action>
  <verify>
    <automated>node -e "JSON.parse(require('fs').readFileSync('public/locales/en/gamepage.json','utf8')); console.log('JSON_VALID')" && grep -q '"openLocation"' public/locales/en/gamepage.json && echo "KEY_PRESENT"</automated>
  </verify>
  <done>gamepage.json is valid JSON and contains info.openLocation; any CSS change (if made) uses existing tokens and does not restructure existing rules.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Platform icon in the Installed Platform row and a folder-open icon in the Install Path row of the Game > Install Info panel.</what-built>
  <how-to-verify>
1. Run the app (`yarn start` or existing dev command).
2. Open a game that is installed (ideally check one Windows, one Mac, and one Linux/native title if available).
3. In the Install Info panel, confirm the "Installed Platform" row now shows a platform icon (Windows/Apple/Linux) matching the "Supported platforms" row style — not raw text.
4. Confirm the "Install Path" row shows a folder-open icon to the right of the path; hovering shows the "Open location" tooltip.
5. Click the Install Path row (or the icon) and confirm the install folder opens.
6. Confirm a Browser-platform game (if available) still shows the platform as text.
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues (e.g., icon spacing, wrong platform mapping).</resume-signal>
</task>

</tasks>

<verification>
- `yarn codecheck` (or the project's lint + typecheck) stays green.
- InstalledInfo.tsx: platform icons render for win/osx/mac/linux; folder-open icon present on Install Path row; Browser and winePrefix paths untouched.
- gamepage.json remains valid JSON with `info.openLocation`.
</verification>

<success_criteria>
- Installed Platform row shows a FontAwesome platform icon consistent with PlatformSupport.tsx, with raw-text fallback for unrecognized values.
- Install Path row shows a discoverable faFolderOpen icon that (via the existing row handler) opens the location.
- No behavior change to Browser platform display, size/version rows, third-party row, or wine rows.
- codecheck green; human verification approved.
</success_criteria>

<output>
Create `.planning/quick/260710-knr-install-info-platform-icon-folder-open-i/260710-knr-SUMMARY.md` when done.
</output>
