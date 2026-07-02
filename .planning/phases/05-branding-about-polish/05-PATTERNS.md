# Phase 5: Branding & About Polish - Pattern Map

**Mapped:** 2026-07-02
**Files analyzed:** 11 (1 new, 10 modified)
**Analogs found:** 11 / 11 (all in-codebase; most are the files themselves or close siblings)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `public/changelog.json` | static-data | file-I/O (bundled, read at runtime) | `public/manifest.json` | role-match |
| `src/backend/utils.ts` — `getCurrentChangelog` rewrite | utility | file-I/O | `src/backend/utils.ts:L544` (`readFileSync` + `JSON.parse` in same file) | exact |
| `src/backend/utils.ts` — `getLatestReleases` suppression + strings | utility | request-response → suppressed | `src/backend/utils.ts:L787` (existing CI early-return guard) | exact |
| `src/backend/tray_icon/tray_icon.ts` | UI-init/config | event-driven | self (single string change at L34) | exact |
| `src/backend/tray_icon/__tests__/tray_icon.test.ts` | test | — | self (add one `expect(appIcon.tooltip)` assertion) | exact |
| `src/backend/constants/paths.ts` | config | — | self (string replacements at L52-57) | exact |
| `src/backend/logger/paths.ts` | config/utility | — | self (string replacements at L16, L19, L23, L49) | exact |
| `src/backend/config.ts` | config | — | self (string replacement at L355) | exact |
| `src/backend/storeManagers/gog/presence.ts` | service | request-response | self (string replacement at L43) | exact |
| `README.md` | documentation | — | self (targeted text edits per RESEARCH.md inventory) | exact |
| `.vscode/launch.json` | config | — | self (string replacements at L5 and L30) | exact |
| `scripts/verify-branding.cjs` | utility/script | — | self (extend with new `check()` block following existing pattern) | exact |

---

## Pattern Assignments

### `public/changelog.json` (static-data, bundled)

**Analog:** `public/manifest.json`

**Existing bundled JSON pattern** (`public/manifest.json`, lines 1-15):
```json
{
  "short_name": "GameLib",
  "name": "GameLib",
  ...
}
```

**Release type shape** (`src/common/types.ts:L72-81` — VERIFIED by research):
```typescript
export type Release = {
  type: 'stable' | 'beta'   // required
  html_url: string           // required
  name: string               // RENDERED in ChangelogModal header
  tag_name: string           // required
  published_at: string       // required
  prerelease: boolean        // required
  id: number                 // required
  body?: string              // RENDERED as ReactMarkdown in ChangelogModal
}
```

**Concrete file to write** (`public/changelog.json` — all fields required by type; `name` and `body` are the only rendered ones):
```json
{
  "id": 1,
  "type": "stable",
  "tag_name": "gamelib-v1.0.0",
  "name": "GameLib 1.0.0",
  "html_url": "https://github.com/grayson-mitchell/GameLib/releases/tag/gamelib-v1.0.0",
  "published_at": "2026-06-30T00:00:00Z",
  "prerelease": false,
  "body": "## GameLib 1.0.0\n\n[D-02 content: Steam platform, CrossOver/Proton, Heroic→GameLib rebrand]\n\nBuilt on Heroic 2.22.0 — [see upstream release notes](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/releases/tag/v2.22.0)"
}
```

**Pitfall:** All seven required `Release` fields must be present or TypeScript compilation fails. `name` and `body` are the only fields rendered by `ChangelogModal` — the rest satisfy the type system.

---

### `src/backend/utils.ts` — `getCurrentChangelog` rewrite (D-01)

**Analog:** Same file, `readFileSync` usage at `utils.ts:L16` (import), `utils.ts:L79` (`publicDir` import), and the existing VDF read pattern at `utils.ts:L544`.

**Imports already present** (`utils.ts:L16`, `utils.ts:L74-82`):
```typescript
// L16 — readFileSync already imported
import { existsSync, mkdirSync, readFileSync, rmSync } from 'graceful-fs'

// L74-82 — publicDir already imported
import {
  configPath,
  fixAsarPath,
  gamesConfigPath,
  heroicIconFolder,
  publicDir,       // <-- already here
  toolsPath,
  windowIcon
} from './constants/paths'
```

**Existing file-read pattern in same file** (`utils.ts:L544` — VDF parsing):
```typescript
const json = parse(readFileSync(vdfFile, 'utf-8'))
```

**Core rewrite pattern** (replace `utils.ts:L832-852`):
```typescript
const getCurrentChangelog = async (): Promise<Release | null> => {
  if (process.env.CI === 'e2e') return null

  try {
    const changelogPath = join(publicDir, 'changelog.json')
    const content = readFileSync(changelogPath, 'utf-8')
    return JSON.parse(content) as Release
  } catch (error) {
    logError(
      ['Error reading local GameLib changelog:', error],
      LogPrefix.Backend
    )
    return null
  }
}
```

**No new imports needed.** `readFileSync` (`L16`), `publicDir` (`L79`), `join` (`L27`), `logError` (`L22`), `LogPrefix` (`L25`) are all already imported.

---

### `src/backend/utils.ts` — `getLatestReleases` suppression (D-04)

**Analog:** Same file, existing CI early-return guard at `utils.ts:L787`:
```typescript
// Existing guard pattern (L787):
if (process.env.CI === 'e2e') return []
```

**Core suppression pattern** (replace body of `utils.ts:L786-830`):
```typescript
const getLatestReleases = async (): Promise<Release[]> => {
  // Suppressed: GameLib at 1.0.0 vs Heroic 2.22+ always triggers the update
  // notice and points users at Heroic downloads, not GameLib. Re-enable when
  // the GameLib release pipeline ships and this function is repointed at
  // GameLib's own GitHub releases.
  return []
}
```

**Side-effect:** The three strings inside the old function body (`'Checking for new Heroic Updates'` L790, `'A new Heroic version was released!'` L817, `'Error when checking for Heroic updates'` L825) become dead code and are eliminated by the suppression — no separate string changes needed for those three.

---

### `src/backend/utils.ts` — D-05 string replacements

**Locations (exact lines from RESEARCH.md):**

| Line | Current | New |
|------|---------|-----|
| L197 | `'Heroic will maybe not work probably!'` | `'GameLib will maybe not work probably!'` |
| L1349 | `'Heroic requires Rosetta ... restart Heroic.'` | `'GameLib requires Rosetta ... restart GameLib.'` |
| L1638 | `'Heroic'` (in writeConfig template literal) | `'GameLib'` |

**D-06 string replacements in same file:**

| Line | Current | New |
|------|---------|-----|
| L614 | `` `Heroic ${app.getVersion()}` `` | `` `GameLib ${app.getVersion()}` `` |
| L636 | `'via Heroic on ' + getFormattedOsName()` | `'via GameLib on ' + getFormattedOsName()` |

---

### `src/backend/tray_icon/tray_icon.ts` (D-11)

**Change:** Single string replacement.

**Current** (`tray_icon.ts:L34`):
```typescript
appIcon.setToolTip('Heroic')
```

**New:**
```typescript
appIcon.setToolTip('GameLib')
```

---

### `src/backend/tray_icon/__tests__/tray_icon.test.ts` — add tooltip assertion

**Analog:** Existing test structure in same file. The mock `Tray` class (`src/backend/__mocks__/electron.ts:L82-100`) stores the tooltip value:

```typescript
// src/backend/__mocks__/electron.ts:L82-100
class Tray {
  icon = ''
  menu: MenuItemConstructorOptions[] = []
  tooltip = ''               // <-- set by setToolTip()

  setToolTip(tooltip: string) {
    this.tooltip = tooltip   // <-- readable in tests
  }
}
```

**Existing test call pattern** (`tray_icon.test.ts:L29-35`):
```typescript
const appIcon = await initTrayIcon(mainWindow)
expect(appIcon).not.toBeNull()
```

**New assertion to add** (inside `it('shows no icon if noTrayIcon setting', ...)` or as a new `it` block):
```typescript
it('sets tooltip to GameLib', async () => {
  const appIcon = (await initTrayIcon(
    mainWindow
  )) as Electron.CrossProcessExports.Tray

  expect(appIcon.tooltip).toEqual('GameLib')
})
```

**Pattern source:** `appIcon.menu` access at `tray_icon.test.ts:L81` confirms the mock property pattern; `appIcon.tooltip` follows the same access style.

---

### `src/backend/constants/paths.ts` (D-08)

**Context** (`paths.ts:L52-58` — current values):
```typescript
export const heroicInstallPath = join(userHome, 'Games', 'Heroic')
export const defaultWinePrefixDir = join(
  userHome,
  'Games',
  'Heroic',
  'Prefixes'
)
```

**New values:**
```typescript
export const heroicInstallPath = join(userHome, 'Games', 'GameLib')
export const defaultWinePrefixDir = join(
  userHome,
  'Games',
  'GameLib',
  'Prefixes'
)
```

**Do NOT change** `paths.ts:L33` (`join(configFolder, 'heroic')` — that is `legacyAppFolder` for first-launch migration from Heroic config dir, and `scripts/verify-branding.cjs:L93-96` actively asserts it is UNCHANGED).

**`publicDir` pattern** (lines 63-67 — reference for bundled file reads, no change needed):
```typescript
export const publicDir = resolve(
  __dirname,
  '..',
  app.isPackaged || process.env.CI === 'e2e' ? '' : '../public'
)
```

---

### `src/backend/logger/paths.ts` (D-08)

**Current values** (lines 16, 19, 23, 49):
```typescript
// L16 (Windows)
return join(localAppData, 'Heroic', 'logs')
// L19 (macOS)
return join(homedir(), 'Library', 'Logs', 'Heroic Games Launcher')
// L23 (Linux/XDG)
return join(stateHome, 'Heroic', 'logs')
// L49 (main app log filename)
relativeFilePath = 'heroic'
```

**New values:**
```typescript
// L16 (Windows)
return join(localAppData, 'GameLib', 'logs')
// L19 (macOS)
return join(homedir(), 'Library', 'Logs', 'GameLib')
// L23 (Linux/XDG)
return join(stateHome, 'GameLib', 'logs')
// L49 (main app log filename)
relativeFilePath = 'gamelib'
```

---

### `src/backend/config.ts` (D-08)

**Current** (`config.ts:L355`):
```typescript
wineCrossoverBottle: 'Heroic',
```

**New:**
```typescript
wineCrossoverBottle: 'GameLib',
```

**Context** (lines 340-356 surrounding the change):
```typescript
defaultInstallPath: heroicInstallPath,   // L341 — already uses the constant
libraryTopSection: 'disabled',
defaultSteamPath: getSteamCompatFolder(),
defaultWinePrefix: defaultWinePrefixDir, // L344 — already uses the constant
defaultWinePrefixDir: defaultWinePrefixDir,
hideChangelogsOnStartup: false,
language: 'en',
maxWorkers: 0,
minimizeOnLaunch: false,
nvidiaPrime: false,
enviromentOptions: [],
wrapperOptions: [],
showFps: false,
useGameMode: isFlatpak,
wineCrossoverBottle: 'Heroic',  // <-- L355: only hardcoded 'Heroic' string here
```

---

### `src/backend/storeManagers/gog/presence.ts` (D-06)

**Current** (`presence.ts:L43`):
```typescript
const payload: PresencePayload = {
  application_type: 'Heroic Games Launcher',
  force_update: false,
  presence: 'online',
  version: app.getVersion(),
  game_id: undefined
}
```

**New:**
```typescript
const payload: PresencePayload = {
  application_type: 'GameLib',
  force_update: false,
  presence: 'online',
  version: app.getVersion(),
  game_id: undefined
}
```

---

### `README.md` (D-09/D-10)

**Role:** Documentation. No code pattern — targeted text replacements per RESEARCH.md inventory.

**Typo fixes (D-09):**

| Line | Current | Fix |
|------|---------|-----|
| 3 | `"derivitive"` | `"derivative"` |
| 3 | `"Differntiators"` | `"Differentiators"` |
| 5 | `"(Playing Games on MacOS"` | `"(Playing Games on macOS)"` |
| 14 | `"gameLib is built with"` | `"GameLib is built with"` |

**Instructional rebrand (D-10):**

| Line | Current | Fix |
|------|---------|-----|
| 56 | `"from Heroic"` | `"from GameLib"` |
| 76 | `"Heroic will still _work_..."` | `"GameLib will still _work_..."` |
| 87 | `"Heroic was translated to..."` | `"GameLib has been translated to..."` |
| 214 | `"build Heroic"` | `"build GameLib"` |
| 217 | `"testing/debugging Heroic on..."` | `"testing/debugging GameLib on..."` |
| 220 | `"Launch Heroic (HMR & HR)"` | `"Launch GameLib (HMR & HR)"` |
| 220 | `"Heroic will start up after..."` | `"GameLib will start up after..."` |

**Keep as attribution (D-10 exception):** Lines 3 (`"derivative of Heroic Games Launcher"`), 77 (Heroic Discord link), 131 (Weblate link), 228-234 (Weblate/Signpath sponsors).

---

### `.vscode/launch.json` (D-10)

**Current** (lines 5 and 30):
```json
// L5 — configuration name
"name": "Launch Heroic (HMR & HR)",

// L30 — compounds array reference
"configurations": ["Launch Heroic (HMR & HR)", "Debug Frontend Process"],
```

**New** (both occurrences):
```json
"name": "Launch GameLib (HMR & HR)",

"configurations": ["Launch GameLib (HMR & HR)", "Debug Frontend Process"],
```

**Pitfall:** Both the `configurations[0].name` (L5) AND the `compounds[0].configurations[0]` reference (L30) must be updated. README L220 refers to this name.

---

### `scripts/verify-branding.cjs` — Section 5 (extend)

**Analog:** Existing check pattern in same file (`verify-branding.cjs:L21-29` for the `check()` helper, `L86-96` for the `readFileSync` + string test pattern).

**Existing `check()` helper** (`verify-branding.cjs:L21-29`):
```javascript
function check(name, result) {
  if (result) {
    console.log(`  PASS  ${name}`)
    passed++
  } else {
    console.log(`  FAIL  ${name}`)
    failed++
  }
}
```

**Existing file-read + test pattern** (`verify-branding.cjs:L86-96`):
```javascript
const utilsTs = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'utils.ts'), 'utf8')
check(
  "src/backend/utils.ts showAboutWindow applicationName: 'GameLib'",
  utilsTs.includes("applicationName: 'GameLib'")
)

const pathsTs = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'constants', 'paths.ts'), 'utf8')
check(
  "src/backend/constants/paths.ts appFolder join(configFolder, 'heroic') UNCHANGED",
  pathsTs.includes("join(configFolder, 'heroic')")
)
```

**New Section 5 block to append** (before the summary block at L105):
```javascript
// ---------------------------------------------------------------------------
// Section 5: Phase 5 surfaces (BRAND-02, BRAND-03, BRAND-04, APP-01)
// ---------------------------------------------------------------------------
console.log('\n--- Phase 5: tray, log paths, config paths, presence, changelog ---')

const trayTs = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'tray_icon', 'tray_icon.ts'), 'utf8')
check("tray_icon.ts setToolTip('GameLib')", trayTs.includes("setToolTip('GameLib')"))
check("tray_icon.ts no setToolTip('Heroic')", !trayTs.includes("setToolTip('Heroic')"))

const loggerPathsTs = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'logger', 'paths.ts'), 'utf8')
check("logger/paths.ts no 'Heroic' in path strings", !loggerPathsTs.includes("'Heroic'") && !loggerPathsTs.includes("'Heroic Games Launcher'"))

check("constants/paths.ts heroicInstallPath uses 'GameLib'", pathsTs.includes("join(userHome, 'Games', 'GameLib')"))
check("constants/paths.ts no 'Games', 'Heroic' path", !pathsTs.includes("'Games', 'Heroic'"))

const configTs = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'config.ts'), 'utf8')
check("config.ts wineCrossoverBottle default is 'GameLib'", configTs.includes("wineCrossoverBottle: 'GameLib'"))

const presenceTs = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'storeManagers', 'gog', 'presence.ts'), 'utf8')
check("presence.ts application_type is 'GameLib' not 'Heroic Games Launcher'", !presenceTs.includes("'Heroic Games Launcher'"))

check("utils.ts no 'via Heroic on'", !utilsTs.includes("'via Heroic on '"))
check("utils.ts Discord versionText uses GameLib", utilsTs.includes('`GameLib ${app.getVersion()}`'))

const changelogPath = path.join(ROOT, 'public', 'changelog.json')
check("public/changelog.json exists", fs.existsSync(changelogPath))
check("getCurrentChangelog reads local file not GitHub API", utilsTs.includes("readFileSync") && !utilsTs.includes("GITHUB_API/tags/"))
```

**Note:** `utilsTs` and `pathsTs` are already loaded in Section 4 (`L86`, `L92`). Do not re-read them. The new section reuses these variables.

---

## Shared Patterns

### Bundled file read (applies to `getCurrentChangelog` rewrite)
**Source:** `src/backend/tray_icon/tray_icon.ts:L13-16` + `src/backend/utils.ts:L544`

```typescript
// tray_icon.ts:L13-16 — publicDir + join pattern for bundled assets
import { fixAsarPath, publicDir } from 'backend/constants/paths'
const iconDark = fixAsarPath(join(publicDir, 'icon-dark.png'))

// utils.ts:L544 — readFileSync + JSON.parse pattern (VDF)
const json = parse(readFileSync(vdfFile, 'utf-8'))
```

Combine: `JSON.parse(readFileSync(join(publicDir, 'changelog.json'), 'utf-8'))` — no `fixAsarPath` needed for JSON (not an asar-unpacked binary).

### Error handling in async backend utilities (applies to `getCurrentChangelog`)
**Source:** `src/backend/utils.ts:L832-852` (current `getCurrentChangelog`) and `src/backend/storeManagers/gog/presence.ts:L24-65`

```typescript
try {
  // ... operation
} catch (error) {
  logError(['Error message', error], LogPrefix.Backend)
  return null  // or return []
}
```

### CI guard pattern (applies to `getCurrentChangelog` and `getLatestReleases`)
**Source:** `src/backend/utils.ts:L787`

```typescript
if (process.env.CI === 'e2e') return []
// or
if (process.env.CI === 'e2e') return null
```

Existing `getCurrentChangelog` already has this guard at L833 — preserve it in the rewrite.

---

## No Analog Found

None. All files in this phase are modifications to existing files or additions that closely follow existing in-codebase patterns.

---

## Metadata

**Analog search scope:** `src/backend/`, `src/backend/tray_icon/`, `src/backend/constants/`, `src/backend/logger/`, `src/backend/storeManagers/gog/`, `public/`, `scripts/`, `.vscode/`
**Files read:** 12
**Pattern extraction date:** 2026-07-02
