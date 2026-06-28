# Phase 4: Branding — Research

**Researched:** 2026-06-28
**Domain:** Electron app identity (window title, About page, package metadata, electron-builder)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Canonical product name is **GameLib** (one word, no "r").
- **D-02:** `electron-builder.yml` already has `productName: GameLib` — leave as-is.
- **D-03:** Any "GamerLib" in planning docs is stale; treat as "GameLib".
- **D-04:** **Targeted identity rename only.** Change user-visible identity and distribution metadata. Do NOT sweep all ~82 source files, internal code identifiers, repo URLs, or Heroic Web API/function-name references.
- **D-05:** Concrete touchpoints: `package.json` (name, author.name, description), `electron-builder.yml` (appId), window/title-bar display string, About page display string.
- **D-06:** Change appId from `com.heroicgameslauncher.hgl` to a GameLib reverse-DNS (proposed `com.gamelib.app`). Relocating userData is acceptable — no validated users.
- **D-07:** Centralize in-app display text (title bar, About page) in a single constant/i18n value.
- **Constraint:** Stay mergeable with Heroic upstream (v2.22.0).

### Claude's Discretion
- Exact reverse-DNS form of the new appId (within the GameLib identity).
- Whether the centralized display name lives in an existing constants/i18n module vs a new one.

### Deferred Ideas (OUT OF SCOPE)
- Full visual rebrand (new logo, icons, color scheme).
- Sweeping internal "Heroic" rename across all ~82 files.
- Reconciling planning-doc naming (PROJECT.md, REQUIREMENTS.md, ROADMAP.md, CLAUDE.md say "GamerLib").
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BRAND-01 | App name updated from "Heroic" to "GameLib" in title bar, about page, and app metadata (package.json, electron-builder config) | All three surfaces located and their exact change mechanism identified |
</phase_requirements>

---

## Summary

This phase is a targeted identity rename: six files need edits covering the three BRAND-01 surfaces. Almost everything else about the app's "Heroic" identity is either already correct (`productName`, `index.html`, `showAboutWindow.applicationName`), a legitimate Heroic infrastructure reference to leave alone, or intentionally out of scope per D-04.

**Primary recommendation:** Change six files (listed in the Architectural Responsibility Map). Two are config files (single-line edits), one is the i18n values file (two-line edit, D-07 centralization point for the frontend), and three are source-code files with fallback strings and one backend template string. No new packages. No build-system changes beyond the appId switch.

The `heroic://` URL protocol scheme is intentionally left unchanged. It is a functional deep-link protocol used by Epic/GOG game launching infrastructure — changing it would break existing shortcut integrations and is explicitly excluded by D-04.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| OS window title | Electron main / HTML | — | BrowserWindow reads document.title from index.html |
| macOS menu-bar app name | electron-builder (build-time) | — | CFBundleName comes from productName in electron-builder.yml |
| Linux desktop entry name | electron-builder (build-time) | — | Generates .desktop file from `linux.desktop.entry.Name` |
| Sidebar version label ("Heroic Version") | Frontend i18n | React component fallback | `translation.json` key `info.heroic.version`; component has a fallback string |
| About page display label ("Heroic: x.x.x") | Frontend i18n | React component fallback | `translation.json` key `settings.systemInformation.heroicVersion` |
| System-info clipboard text ("Heroic: x.x.x") | Backend TypeScript | — | Plain template literal in `formatSystemInfo()`; not i18n |
| Package/distribution metadata | package.json + electron-builder.yml | — | npm name, description, author; appId |
| macOS About panel | Backend utility | — | `showAboutWindow()` in `utils.ts` — `applicationName` already set to `'GameLib'` |

---

## What Is Already Correct (No Change Needed)

[VERIFIED: grep search of codebase]

| Location | Current Value | Status |
|----------|---------------|--------|
| `index.html` line 7 | `<title>GameLib</title>` | Already correct — not Heroic |
| `electron-builder.yml` line 2 | `productName: GameLib` | Already correct (D-02) |
| `src/backend/utils.ts` line 233 | `applicationName: 'GameLib'` in `showAboutWindow()` | Already correct |
| `BrowserWindow` in `main_window.ts` | No explicit `title:` property | Defaults to document.title → "GameLib" |

---

## Standard Stack

No new packages. All changes are string/value edits in existing files. Relevant existing infrastructure:

| Technology | File | Role |
|------------|------|------|
| i18next / react-i18next | `public/locales/en/translation.json` | Centralizes all frontend display strings; changing values here satisfies D-07 for both React surfaces |
| electron-builder | `electron-builder.yml` | Controls appId (macOS bundle, Windows AppUserModelID, Linux .desktop), productName, artifact naming |
| `package.json` | root | npm package identity consumed by electron-builder and standard tooling |
| Template literal in TypeScript | `src/backend/utils/systeminfo/index.ts` | Clipboard text from the "Copy to clipboard" button in Settings → System Info |

## Package Legitimacy Audit

No new packages are installed in this phase.

---

## Architecture Patterns

### System Architecture Diagram

```
package.json ──────────────┐
  name / description        │
  author.name               ▼
                    electron-builder
electron-builder.yml ─────►   builds artifacts with productName
  appId (bundle id)          generates .desktop (Linux)
  productName: GameLib       sets macOS CFBundleName

At runtime:

index.html <title>GameLib</title>
     │
     └──► BrowserWindow (no title property) → OS title bar = "GameLib"

translation.json ["info"]["heroic"]["version"]
     │
     └──► HeroicVersion/index.tsx → sidebar displays "GameLib Version: x.x.x"

translation.json ["settings"]["systemInformation"]["heroicVersion"]
     │
     └──► software.tsx (About page) → "GameLib: x.x.x"

formatSystemInfo() in systeminfo/index.ts (plain template literal)
     │
     └──► clipboard text → "GameLib: x.x.x"
```

### Recommended Project Structure

No structural changes. All edits are in-place value changes to existing files.

---

## Surface-by-Surface Findings

### Surface 1: OS Window Title Bar (Success Criterion 1)

**Finding:** Already correct. [VERIFIED: codebase grep]

- `index.html` (repo root) has `<title>GameLib</title>` at line 7.
- `src/backend/main_window.ts` `createMainWindow()` creates a `BrowserWindow` with no explicit `title:` property. Electron defaults the OS window title to `document.title`, which is "GameLib" once the renderer loads.
- On macOS, the menu bar shows `productName` from the built app — already "GameLib" via electron-builder.yml.
- Frameless mode renders `<WindowControls />` (min/max/close buttons) but no custom title text. There is no custom TitleBar React component that would display "Heroic".

**Action required:** None for the OS title bar itself.

### Surface 1b: Sidebar Version Label (user-visible "Heroic Version: x.x.x")

**Finding:** Shows "Heroic Version" — must change. [VERIFIED: codebase grep]

File: `src/frontend/components/UI/Sidebar/components/HeroicVersion/index.tsx` line 88-89
```tsx
<span className="heroicVersion__title">
  <span>{t('info.heroic.version', 'Heroic Version')}: </span>
```

The i18n key `info.heroic.version` resolves from `public/locales/en/translation.json` line 544:
```json
"version": "Heroic Version"
```

**Change:** `translation.json` line 544 value → `"GameLib Version"`.
Also update the component fallback string at line 89 → `'GameLib Version'`.

### Surface 2: About Page (Success Criterion 2)

**Finding:** Two code locations show "Heroic:" — must change. [VERIFIED: codebase grep]

#### 2a. Visual display in Settings → System Info

File: `src/frontend/screens/Settings/sections/SystemInfo/software.tsx` lines 37-43
```tsx
{t(
  'settings.systemInformation.heroicVersion',
  'Heroic: {{heroicVersion}}',
  { heroicVersion }
)}
```

The i18n key `settings.systemInformation.heroicVersion` resolves from `public/locales/en/translation.json` line 1052:
```json
"heroicVersion": "Heroic: {{heroicVersion}}"
```

**Change:** `translation.json` line 1052 value → `"GameLib: {{heroicVersion}}"`.
Also update the component fallback string in `software.tsx` line 39 → `'GameLib: {{heroicVersion}}'`.

#### 2b. "Copy to clipboard" text (plain template literal, not i18n)

File: `src/backend/utils/systeminfo/index.ts` line 150
```typescript
  Heroic: ${info.softwareInUse.heroicVersion}
```

This is the text produced by `formatSystemInfo()`, which is called when the user clicks "Copy to clipboard" in Settings → System Info. It is a plain TypeScript template literal — not routed through i18n — so `translation.json` changes do not affect it.

**Change:** Line 150 literal → `GameLib: ${info.softwareInUse.heroicVersion}`.

For D-07 centralization, add a constant: `export const APP_DISPLAY_NAME = 'GameLib'` in `src/backend/constants/others.ts` and reference it here.

### Surface 3: Package / Distribution Metadata (Success Criterion 3)

#### 3a. `package.json`

[VERIFIED: file read]

| Field | Current Value | Required Change |
|-------|---------------|-----------------|
| `name` (line 2) | `"heroic"` | `"gamelib"` |
| `description` (line 12) | `"An Open Source Launcher for GOG, Epic Games and Amazon Games"` | Update to include Steam |
| `author.name` (line 18) | `"Heroic Games Launcher"` | `"GameLib"` |
| `author.email` (line 19) | `"heroicgameslauncher@protonmail.com"` | Leave as-is (D-04 — legitimate upstream contact) |
| `repository.url` (line 14) | Heroic GitHub URL | Leave as-is (D-04 — legitimate upstream reference) |
| `scripts.flatpak:build` (line 44) | `com.heroicgameslauncher.hgl.yml` | Leave as-is (D-04 — flatpak infrastructure ref) |

**Recommended description:** `"An Open Source Launcher for GOG, Epic Games, Amazon Games, and Steam"`

#### 3b. `electron-builder.yml`

[VERIFIED: file read]

| Field | Current Value | Required Change |
|-------|---------------|-----------------|
| `appId` (line 1) | `com.heroicgameslauncher.hgl` | `com.gamelib.app` |
| `productName` (line 2) | `GameLib` | Leave as-is (D-02, already correct) |
| `linux.desktop.entry.Name` (line 70) | `Heroic Games Launcher` | `GameLib` |
| `linux.desktop.entry.Comment` (line 80) | mentions GOG, Epic, Amazon only | Optional: update to include Steam |
| `protocols` (lines 20-22) | `name: heroic, schemes: - heroic` | Leave as-is (D-04 — functional deep-link protocol) |

---

## Centralization Pattern (D-07)

### Recommendation

**Frontend (two React surfaces):** `public/locales/en/translation.json` is the single-point-of-change. Both `HeroicVersion/index.tsx` and `software.tsx` call `t(key, fallback)` — changing the JSON values once satisfies D-07 for all frontend rendering. The component fallback strings are secondary (used only if i18n hasn't initialized, which does not occur in production Electron) but should be updated for consistency.

**Backend (clipboard text):** Add `export const APP_DISPLAY_NAME = 'GameLib'` to `src/backend/constants/others.ts`. This file currently holds `currentGameConfigVersion` and `currentGlobalConfigVersion`. Use the constant in `formatSystemInfo()` line 150. This satisfies D-07 for the backend surface without sweeping other files.

**No new constants module is needed.** The existing `others.ts` is the right home.

### Existing Pattern to Follow

`src/backend/constants/others.ts` already exports simple typed constants inline:
```typescript
export const currentGameConfigVersion: GameConfigVersion = 'v0'
export const currentGlobalConfigVersion: GlobalConfigVersion = 'v0'
```

Follow the same pattern:
```typescript
export const APP_DISPLAY_NAME = 'GameLib'
```

---

## appId Change — Full Blast Radius

Changing `appId: com.heroicgameslauncher.hgl` → `com.gamelib.app` affects:

| Location | Effect | In Scope? |
|----------|--------|-----------|
| `electron-builder.yml` line 1 | Defines the new id — PRIMARY CHANGE | Yes |
| macOS: `CFBundleIdentifier` in built `Info.plist` | Changes macOS bundle identity (Keychain grouping, Gatekeeper) | Yes, consequence of D-06 |
| Windows: AppUserModelID | Changes taskbar pinning group identity | Yes, consequence of D-06 |
| Linux: `.desktop` file `WMClass` and MIME handler | Changes window class, deeplink registration | Yes, consequence of D-06 |
| `app.getPath('userData')` | On macOS: `~/Library/Application Support/GameLib/` (already uses productName "GameLib"); change of appId alone does not move this path on most platforms | No migration needed (D-06 accepts relocation) |
| `src/backend/constants/paths.ts` line 24: `appFolder = join(configFolder, 'heroic')` | **NOT affected** — this is hardcoded as `heroic` and unrelated to appId | Leave as-is (D-04 — internal path identifier) |
| `src/backend/storeManagers/steam/constants.ts` line 5: `join(app.getPath('userData'), 'steam_store')` | Path changes with userData, but acceptable (D-06) | No change needed |
| `src/backend/shortcuts/nonesteamgame/nonesteamgame.ts` line 302: `run com.heroicgameslauncher.hgl` | Flatpak run command for adding non-Steam shortcuts — would break if GameLib ships as Flatpak with the new appId | Leave as-is now (D-04); address when a GameLib Flatpak is actually built |
| `flatpak/com.heroicgameslauncher.hgl.desktop` | Local flatpak test file — file would need renaming for a GameLib flatpak | Out of scope (D-04) |
| `flathub/update-flathub.ts` | Heroic's official Flathub submission scripts | Leave as-is (D-04 — legitimate Heroic infrastructure) |
| `snap/snapcraft.yaml` | Snap distribution config — builds from Heroic's repo, not GameLib's fork | Out of scope (D-04) |

**Key insight:** The `appFolder = join(configFolder, 'heroic')` hardcoded path (where game configs, settings, and user data live) is completely independent of `appId`. Changing appId does NOT relocate game configs or user settings. Only Electron's internal `userData` path (cookies, localStorage, etc.) is influenced.

**Confirmed safe appId value:** `com.gamelib.app` — follows reverse-DNS convention, is a valid bundle identifier, and avoids any conflict with Heroic's identifier. [ASSUMED — no registry or authority to verify against; this is a new identifier being chosen]

---

## heroic:// URL Protocol — Leave Unchanged (D-04)

The `heroic://` URL scheme appears in three places and must NOT be changed:

1. `electron-builder.yml` lines 20-22: `protocols: - name: heroic, schemes: - heroic` — registers the OS protocol handler
2. `src/backend/main.ts` lines 411-416: `protocol.handle('heroic', ...)` and `app.setAsDefaultProtocolClient('heroic')` — Electron-side registration
3. `src/backend/protocol.ts` throughout — parses `heroic://launch/...` URLs from Epic/GOG shortcuts, tray icons, and external callers

Changing this scheme would break:
- "Add to Steam" shortcut integrations created by existing users
- Any existing `heroic://launch/...` deep links users have set up for Epic/GOG games
- The `nonesteamgame.ts` shortcut export which generates `heroic://launch?appName=...` URLs

This is a functional identifier, not a user-visible identity string. D-04 explicitly excludes it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| macOS bundle name | Custom Info.plist injection | electron-builder `productName` | Already handled at build time |
| Linux .desktop entry | Manual .desktop file | electron-builder `linux.desktop.entry.Name` | Already handled at build time |
| i18n string lookup | Manual string map | i18next `t(key, fallback)` pattern already in use | Existing infra handles it |

---

## Common Pitfalls

### Pitfall 1: Changing i18n key names instead of values
**What goes wrong:** Renaming `info.heroic.version` to `info.gamelib.version` would break all other 50+ language translation files in `public/locales/*/` and require a sweep of all locale files globally.
**Why it happens:** Conflating the internal key name with the displayed string value.
**How to avoid:** Change only the VALUE of the existing key (e.g., `"Heroic Version"` → `"GameLib Version"`), not the key path. The key path `info.heroic` is an internal identifier per D-04.
**Warning signs:** Any edit touching `"heroic":` as a JSON key path rather than as a string value.

### Pitfall 2: Changing `appFolder` path in `paths.ts`
**What goes wrong:** Renaming `join(configFolder, 'heroic')` to `join(configFolder, 'gamelib')` moves all user game configs, settings, and `config.json` to a new location — effectively wiping user data for anyone who ran the old build.
**Why it happens:** Conflating the user-visible appId identity with the internal filesystem path for game data.
**How to avoid:** `appFolder` is explicitly an internal identifier (D-04). The appId change only affects Electron's own `userData` path (browser cookies, localStorage). Game configs are NOT moved.
**Warning signs:** Any edit to `src/backend/constants/paths.ts`.

### Pitfall 3: Touching `heroic://` protocol in electron-builder.yml protocols section
**What goes wrong:** Renaming the scheme breaks deep-link launches for all existing Epic/GOG shortcuts.
**Why it happens:** Mistaking a functional deep-link protocol for a branding string.
**How to avoid:** Do not touch `electron-builder.yml` `protocols:` block. Do not touch `main.ts` lines 411-416. Do not touch `protocol.ts`.

### Pitfall 4: Forgetting the `formatSystemInfo` clipboard text
**What goes wrong:** About page visually says "GameLib" but the text copied by the "Copy to clipboard" button still says "Heroic: 2.22.0 Hajrudin".
**Why it happens:** `formatSystemInfo` in `systeminfo/index.ts` uses a plain template literal — not i18n — so changing `translation.json` does not affect it.
**How to avoid:** `systeminfo/index.ts` line 150 must be changed separately from the i18n strings.

### Pitfall 5: `package.json` `name` field case
**What goes wrong:** Setting `name: "GameLib"` with a capital G. npm package names must be lowercase.
**Why it happens:** Matching the display name exactly.
**How to avoid:** `name` must be `"gamelib"` (all lowercase). The capitalized display name "GameLib" lives in `productName` (electron-builder.yml) and the i18n strings, not in `package.json` `name`.

---

## Complete Change List for BRAND-01

Six files require edits. Listed in recommended implementation order:

| Priority | File | What Changes | Success Criterion |
|----------|------|-------------|-------------------|
| 1 | `package.json` | `name`: "heroic"→"gamelib"; `author.name`; `description` | SC-3 |
| 2 | `electron-builder.yml` | `appId`: com.heroicgameslauncher.hgl→com.gamelib.app; `linux.desktop.entry.Name`: Heroic Games Launcher→GameLib | SC-3, SC-1 (Linux) |
| 3 | `public/locales/en/translation.json` | Line 544 value: "Heroic Version"→"GameLib Version"; line 1052 value: "Heroic: {{heroicVersion}}"→"GameLib: {{heroicVersion}}" | SC-1 (sidebar), SC-2 |
| 4 | `src/frontend/components/UI/Sidebar/components/HeroicVersion/index.tsx` | Line 89 fallback: 'Heroic Version'→'GameLib Version' | SC-1 (fallback sync) |
| 5 | `src/frontend/screens/Settings/sections/SystemInfo/software.tsx` | Line 39 fallback: 'Heroic: {{heroicVersion}}'→'GameLib: {{heroicVersion}}' | SC-2 (fallback sync) |
| 6 | `src/backend/utils/systeminfo/index.ts` | Line 150 template literal: "Heroic:" → APP_DISPLAY_NAME constant | SC-2 (clipboard) |
| 6b | `src/backend/constants/others.ts` | Add `export const APP_DISPLAY_NAME = 'GameLib'` | D-07 |

**Total change surface:** 7 locations across 6 source files + 1 constants file. No npm installs. No schema changes. No test file changes required (existing tests do not assert on display name strings).

---

## Code Examples

Verified patterns from codebase inspection:

### Current i18n value pattern (translation.json) [VERIFIED: file read]
```json
// public/locales/en/translation.json — in object: settings.systemInformation
"heroicVersion": "Heroic: {{heroicVersion}}",

// in object: info.heroic
"version": "Heroic Version"
```

### Current component usage (software.tsx) [VERIFIED: file read]
```tsx
// src/frontend/screens/Settings/sections/SystemInfo/software.tsx line 37-43
{t(
  'settings.systemInformation.heroicVersion',
  'Heroic: {{heroicVersion}}',   // ← fallback only; i18n value takes precedence
  { heroicVersion }
)}
```

### Current formatSystemInfo text (systeminfo/index.ts) [VERIFIED: file read]
```typescript
// src/backend/utils/systeminfo/index.ts line 148-155
Software Versions:
  Heroic: ${info.softwareInUse.heroicVersion}    // ← plain template literal
  Legendary: ${info.softwareInUse.legendaryVersion}
```

### Pattern to add (D-07 centralization) [ASSUMED — based on existing constants pattern]
```typescript
// src/backend/constants/others.ts — add alongside existing exports
export const APP_DISPLAY_NAME = 'GameLib'

// src/backend/utils/systeminfo/index.ts line 150 — import and use
import { APP_DISPLAY_NAME } from 'backend/constants/others'
...
  ${APP_DISPLAY_NAME}: ${info.softwareInUse.heroicVersion}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Setting window title via BrowserWindow `title:` | Let Electron use document.title from index.html | index.html is already "GameLib"; no code change needed |
| All i18n strings in one file | Per-namespace JSON files (translation.json, gamepage.json, login.json) | Only translation.json needs editing for this phase |

---

## Runtime State Inventory

This is not a rename/migration phase for existing user data. The `appFolder` path remains `~/.config/heroic` (internal path, D-04). No stored data migrates.

**Nothing to inventory** — D-06 explicitly accepts the consequence that `app.getPath('userData')` relocates, and confirms no existing production user base to preserve.

---

## Environment Availability

Step 2.6: SKIPPED — this phase makes no runtime tool calls. All changes are string/value edits to source files.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 |
| Config file | `jest.config.js` (implicit via package.json) |
| Quick run command | `npm run codecheck` (TypeScript no-emit check) |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BRAND-01a | `package.json` name field = "gamelib" | smoke / shell | `node -e "const p=require('./package.json');if(p.name!=='gamelib')throw new Error('name mismatch')"` | No — Wave 0 |
| BRAND-01b | `electron-builder.yml` appId = "com.gamelib.app" | smoke / shell | `grep -q 'appId: com.gamelib.app' electron-builder.yml` | No — Wave 0 |
| BRAND-01c | Translation string "GameLib Version" in translation.json | smoke / shell | `node -e "const t=require('./public/locales/en/translation.json');if(t.info.heroic.version!=='GameLib Version')throw new Error('version string mismatch')"` | No — Wave 0 |
| BRAND-01d | About page clipboard text starts with "GameLib:" | unit | Existing jest suite — `formatSystemInfo` already tested in `utils/systeminfo` | Partial |
| BRAND-01e | TypeScript compiles with no errors after changes | type check | `npm run codecheck` | Yes |

### Sampling Rate
- **Per task commit:** `npm run codecheck`
- **Per wave merge:** `npm test`
- **Phase gate:** `npm run codecheck` green + manual verification of running app (see Verification Approach below)

### Wave 0 Gaps
- [ ] Shell-level smoke assertions (BRAND-01a, 01b, 01c) — can be added as a verification step rather than test files
- None of the existing jest tests assert on display name strings or appId values, so no existing tests will break

---

## Verification Approach (per Success Criterion)

### SC-1: Title bar displays "GameLib"
- **Automatable:** `grep -c 'GameLib' index.html` should return ≥ 1 for `<title>GameLib</title>` ← already passes
- **Manual:** Launch `pnpm start` → OS window chrome shows "GameLib" (already true with current index.html)
- **Linux desktop entry:** `grep 'Name=' electron-builder.yml` → must show `Name: GameLib`
- **Sidebar:** Launch app → bottom-left of sidebar shows "GameLib Version: 2.22.0 Hajrudin"

### SC-2: About page reflects GameLib name
- **Automatable:** `node -e "const t=require('./public/locales/en/translation.json'); console.log(t.settings.systemInformation.heroicVersion)"` → must output `"GameLib: {{heroicVersion}}"`
- **Manual:** In running app → Settings → System Info → label reads "GameLib: 2.22.0 Hajrudin"
- **Clipboard:** Click "Copy to clipboard" → paste → text starts with "GameLib: 2.22.0"

### SC-3: Package metadata identifies as GameLib
- **Automatable:** `node -e "const p=require('./package.json');console.log(p.name)"` → `gamelib`
- **Automatable:** `grep 'appId' electron-builder.yml` → `appId: com.gamelib.app`
- **Build artifact:** `pnpm dist:mac` → output file named `GameLib-2.22.0-macOS-*.dmg` (already uses `${productName}`)

---

## Security Domain

No new authentication, authorization, session management, cryptography, or user-input surfaces are introduced by this phase. BRAND-01 is purely a display/metadata change. ASVS categories V2, V3, V4, V5, V6 do not apply.

The one minor note: changing `package.json` `name` from "heroic" to "gamelib" changes the npm package identity. If the project were ever published to npm, the registry name would change. Currently `"private": false` in package.json but the package is not published. No security impact.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `com.gamelib.app` does not conflict with any existing macOS/Snap/Linux app | appId Change | Cosmetic — a new app with that bundle id is created; no functional breakage |
| A2 | No other locale files (non-English) will be updated in this phase | i18n section | Non-English users see "Heroic" in their own language until translations catch up — acceptable MVP gap |
| A3 | Existing jest tests do not assert on "Heroic" display strings in a way that would fail | Validation | If wrong, tests would fail with easy fix (update expected strings) |

---

## Open Questions

1. **Planning-doc naming reconciliation (D-03 deferred)**
   - What we know: PROJECT.md, REQUIREMENTS.md, ROADMAP.md, CLAUDE.md say "GamerLib" not "GameLib"
   - What's unclear: Whether to fold the doc fixup into this phase's plan tasks
   - Recommendation: Planner decides; if included, it is a separate task (≤5 file edits in `.planning/` and `CLAUDE.md`)

2. **`author.email` in package.json**
   - What we know: Currently `heroicgameslauncher@protonmail.com`
   - What's unclear: Whether D-04 ("legitimate Heroic repo references") protects the email field
   - Recommendation: Update `author.name` to "GameLib" but leave the email blank or as-is; the email is the upstream maintainer contact, not a user-visible identity field

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: file read] `package.json` — exact values for name, description, author, scripts
- [VERIFIED: file read] `electron-builder.yml` — appId, productName, protocols, linux.desktop.entry.Name
- [VERIFIED: file read] `index.html` — `<title>GameLib</title>` already present
- [VERIFIED: file read] `src/backend/main_window.ts` — no explicit `title:` on BrowserWindow
- [VERIFIED: file read] `src/backend/utils.ts` lines 231-239 — `showAboutWindow()` already uses `applicationName: 'GameLib'`
- [VERIFIED: file read] `src/frontend/screens/Settings/sections/SystemInfo/software.tsx` — fallback string "Heroic: {{heroicVersion}}"
- [VERIFIED: file read] `src/frontend/components/UI/Sidebar/components/HeroicVersion/index.tsx` — fallback string "Heroic Version"
- [VERIFIED: file read] `src/backend/utils/systeminfo/index.ts` line 150 — template literal "Heroic: ..."
- [VERIFIED: file read] `public/locales/en/translation.json` lines 544, 1052 — "Heroic Version", "Heroic: {{heroicVersion}}"
- [VERIFIED: file read] `src/backend/constants/others.ts` — existing exports; suitable home for APP_DISPLAY_NAME
- [VERIFIED: grep] `src/backend/main.ts` lines 411-416 — heroic:// protocol registration (must NOT change)
- [VERIFIED: grep] all occurrences of `com.heroicgameslauncher.hgl` in codebase — 8 locations documented in blast radius table

### Secondary (MEDIUM confidence)
- [CITED: Electron docs knowledge] `app.getPath('userData')` location — based on productName, not appId, on most platforms
- [CITED: electron-builder docs knowledge] `appId` controls CFBundleIdentifier (macOS), AppUserModelID (Windows), .desktop file identity (Linux)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; existing tooling verified in repo
- Architecture: HIGH — all change locations found via direct file inspection
- Pitfalls: HIGH — derived from actual code structure, not theory

**Research date:** 2026-06-28
**Valid until:** 90 days (config files, i18n structure — very stable)
