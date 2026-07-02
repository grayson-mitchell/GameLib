# Phase 5: Branding & About Polish - Research

**Researched:** 2026-07-02
**Domain:** Electron app branding — string replacement, bundled static assets, Electron tray API, IPC handler wiring
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Release notes come from a bundled static file shipped inside the app. `getCurrentChangelog()` reads it locally — no network call, no 404. Replaces the current behavior that fetches Heroic's GitHub `tags/v{version}` API (which 404s at GameLib `1.0.0` since there are no published GameLib GitHub releases).

**D-02:** The `1.0.0` notes content = GameLib-specific changes (Steam platform support, CrossOver/Proton integration, the Heroic→GameLib rebrand). Concise and honest about the fork. Not a full mirror of Heroic's changelog.

**D-03:** The required upstream Heroic link is a line in the notes body (e.g. "Built on Heroic 2.22.0 — see upstream release notes →" linking to Heroic's v2.22.0 GitHub release). Not a separate UI element. Upstream base version = `2.22.0` per `UPSTREAM.md`.

**D-04:** Suppress the sidebar "Update Available!" block (`getLatestReleases()`) AND its "A new Heroic version was released!" desktop notification. Stays suppressed until the future release-pipeline phase repoints it at GameLib's own releases.

**D-05:** Rebrand user-facing backend strings → "GameLib": logs, dialogs, and notifications.

**D-06:** Rebrand Discord Rich Presence identifiers (`application_type: 'Heroic Games Launcher'`, `state: 'via Heroic on ...'`) → GameLib.

**D-07:** Leave the Plausible analytics User-Agent (`HeroicGamesLauncher/1.0`) as-is — external analytics contract.

**D-08:** Rebrand all three filesystem paths via clean cutover, no migration: log dir label, `heroicInstallPath` default, `wineCrossoverBottle` default. No existing GameLib-path userbase to migrate.

**D-09:** Accuracy + fork-clarity pass on README (not a full rewrite): fix typos, tighten intro, verify build/install sections.

**D-10:** Rebrand instructional in-README "Heroic" mentions → "GameLib"; keep explicit "fork of Heroic" attribution and upstream links.

**D-11:** `appIcon.setToolTip('Heroic')` → `'GameLib'` in `src/backend/tray_icon/tray_icon.ts:34`.

### Claude's Discretion

- Exact bundled release-notes file format (markdown vs JSON) and on-disk location — planner/executor to choose what fits the existing `Release` type consumed by `ChangelogModal`.
- The precise enumeration of which log/dialog strings qualify as "user-facing" under D-05 — apply the boundary (user-facing = rebrand; internal identifiers/third-party contracts = leave) at implementation time.

### Deferred Ideas (OUT OF SCOPE)

- Release Pipeline and Auto-Update: CI/release pipeline publishing signed artifacts; code signing and notarization; `electron-updater` wiring; version-compare against GameLib's own releases.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BRAND-02 | macOS menu-bar (tray) tooltip reads "GameLib" instead of "Heroic" | D-11: single-line change at `tray_icon.ts:34` confirmed; add test assertion |
| BRAND-03 | Residual backend log and dialog strings that still say "Heroic" read "GameLib" | D-05/D-06/D-08: full enumeration of 14 string locations across 10 files documented below |
| BRAND-04 | README accurately documents GameLib — the fork, Steam support, and build/install steps | D-09/D-10: typo list and instructional rebrand scope documented; `.vscode/launch.json` also needs update |
| APP-01 | Clicking the version number opens GameLib release notes describing what changed and linking to upstream Heroic release | D-01/D-02/D-03/D-04: `getCurrentChangelog()` rewrite + `public/changelog.json` creation + `getLatestReleases()` suppression fully specified |
</phase_requirements>

---

## Summary

Phase 5 is a targeted string-replacement and bundled-asset phase. Every change has an exact location already known from direct code inspection — there is no architectural ambiguity, no new libraries, and no network dependencies to introduce. The single most complex item is D-01 (bundled changelog), which requires understanding how Electron-vite resolves the `publicDir` constant across dev and packaged modes. That mechanism is already established in the codebase and verified here.

The complete inventory of "Heroic" strings requiring change is 14 distinct string literals across 10 source files, plus 3 filesystem path constants, plus the README and VS Code launch config. A branding verification script (`scripts/verify-branding.cjs`) already exists from Phase 4 and needs a new section for Phase 5 surfaces.

The existing `ChangelogModal` component and the `HeroicVersion` sidebar component require no structural changes — only what the backend functions return changes. The `Release` type shape is known and the bundled JSON must satisfy all required fields (even though the modal only renders `name` and `body`). [VERIFIED: direct code inspection]

**Primary recommendation:** Implement in three waves: (1) backend string changes + suppression + paths, (2) bundled changelog file + README + verify-branding.cjs extension, (3) verification run.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Release notes content (D-01) | Backend (main process) | — | `getCurrentChangelog()` is an IPC handler in the main process; it reads the file and returns data to the renderer |
| Update-check suppression (D-04) | Backend (main process) | — | `getLatestReleases()` is called via IPC; the suppression belongs at the source, not in the renderer |
| Backend log/dialog strings (D-05) | Backend (main process) | — | All strings are in main-process files (`utils.ts`, `updater.ts`, etc.) |
| Discord Rich Presence (D-06) | Backend (main process) | — | `setPresence()` in `utils.ts` and `gog/presence.ts` run in main process |
| Filesystem paths (D-08) | Backend (main process) | — | `paths.ts` and `config.ts` constants are consumed only by backend code |
| Tray tooltip (D-11) | Backend (main process) | — | `appIcon.setToolTip()` is an Electron main-process API |
| README / VS Code config (D-09/D-10) | Project docs | — | Static files; no code tier |

---

## Standard Stack

### Core (No New Packages)

All capabilities in this phase are implemented using APIs and patterns already present in the codebase. Zero new npm packages are required. [VERIFIED: direct code inspection]

| Mechanism | Already Present | Use in Phase 5 |
|-----------|----------------|----------------|
| `graceful-fs` `readFileSync` | Yes (imported in `utils.ts:L16`) | Read bundled `changelog.json` at runtime |
| `path.join` from Node built-in | Yes | Construct bundled file path using `publicDir` |
| `publicDir` constant | Yes (`src/backend/constants/paths.ts:L63`) | Locate bundled assets in dev and packaged builds |
| `Release` type from `common/types` | Yes (`common/types.ts:L72`) | Shape of the bundled changelog JSON |
| ReactMarkdown (in ChangelogModal) | Yes | Renders `release.body` — no change needed |
| `scripts/verify-branding.cjs` | Yes (from Phase 4) | Extend with Phase 5 surface checks |

### Package Legitimacy Audit

No new packages. This section is not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
User clicks version number
         │
         ▼
HeroicVersion/index.tsx
  setShowChangelogModalOnClick(true)
         │
         ▼
ChangelogModal (renders)
  window.api.getCurrentChangelog()
         │  IPC call
         ▼
main.ts: addHandler('getCurrentChangelog', ...)
         │
         ▼
utils.ts: getCurrentChangelog()
   [BEFORE Phase 5]           [AFTER Phase 5]
   axiosClient.get(           readFileSync(
   GITHUB_API/tags/v1.0.0)    join(publicDir, 'changelog.json'))
   → 404 → returns null       → JSON.parse → Release object
         │
         ▼
ChangelogModal renders release.name + release.body (ReactMarkdown)
```

```
App start
   │
   ▼
HeroicVersion/index.tsx (useEffect)
  window.api.getLatestReleases()
   │  IPC call
   ▼
main.ts: addHandler('getLatestReleases', ...)
  checks checkForUpdatesOnStartup setting
   │
   ▼
utils.ts: getLatestReleases()
   [BEFORE]                   [AFTER Phase 5]
   fetches GitHub releases     returns [] immediately
   compares semver              (suppressed)
   fires notification
   returns Release[]
   │
   ▼
HeroicVersion: shouldShowUpdates = newBeta || newStable
   [BEFORE] = Release objects  [AFTER] = undefined (falsy)
   → update block renders      → update block hidden
```

### Bundled Asset Resolution Pattern

The project uses `publicDir` to locate bundled static assets at runtime. This pattern is already established for icons, locales, and binaries. [VERIFIED: direct code inspection of `paths.ts` and `electron.vite.config.ts`]

```
// src/backend/constants/paths.ts:L63-67
export const publicDir = resolve(
  __dirname,       // build/main/ (main process compiled output)
  '..',            // build/
  app.isPackaged || process.env.CI === 'e2e' ? '' : '../public'
)
// Dev mode:   resolve('build/main/', '..', '../public') → project_root/public/
// Packaged:   resolve('app.asar/main/', '..', '')       → app.asar root/
//             (electron-vite copies public/ contents into build/ which goes into asar root)
```

**Implication for D-01:** Place `changelog.json` in `public/changelog.json`. At runtime it is read via `join(publicDir, 'changelog.json')`. In dev mode this reads from `public/changelog.json` directly. In a packaged build, electron-vite (Vite renderer with `root: '.'` and `outDir: 'build'`) copies `public/` contents to `build/`, and `build/**/*` is included by `electron-builder.yml`. Result: `join(publicDir, 'changelog.json')` resolves correctly in both modes without any additional configuration.

### getCurrentChangelog() Rewrite Pattern

```typescript
// src/backend/utils.ts ~L832 — AFTER Phase 5
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

`readFileSync` is already imported in `utils.ts:L16`. `publicDir` is already imported in `utils.ts:L79`. No new imports needed. [VERIFIED: direct code inspection]

### getLatestReleases() Suppression Pattern

```typescript
// src/backend/utils.ts ~L786 — AFTER Phase 5
const getLatestReleases = async (): Promise<Release[]> => {
  // Suppressed: GameLib at 1.0.0 vs Heroic 2.22+ always shows update notice
  // pointing at Heroic downloads. Re-enable when release pipeline ships.
  return []
}
```

Suppress by returning early. The IPC handler in `main.ts:L694-700` already gates on `checkForUpdatesOnStartup` but that setting defaults to `!isFlatpak` — still fires on most installs. The suppression belongs in the function itself so it is complete regardless of settings. [VERIFIED: direct code inspection]

### Recommended Project Structure (no changes to structure)

No new directories or structural changes. All modifications are in-place string replacements or additions to existing files, plus one new file at `public/changelog.json`.

---

## Complete String Inventory

### D-01: getCurrentChangelog() rewrite (utils.ts)

| Location | Current Value | Change |
|----------|--------------|--------|
| `utils.ts:L840-843` | `axiosClient.get(\`${GITHUB_API}/tags/v${current}\`)` | Replace entire try body with `readFileSync` + `JSON.parse` |
| `utils.ts:L847` | `'Error when checking for current Heroic changelog:'` | `'Error reading local GameLib changelog:'` |

### D-04: Suppress getLatestReleases() (utils.ts)

| Location | Current Value | Change |
|----------|--------------|--------|
| `utils.ts:L786-830` | Full function with GitHub API call | Body replaced with `return []` + suppression comment |
| Side-effect: `utils.ts:L790` | `'Checking for new Heroic Updates'` | Suppressed (dead code) |
| Side-effect: `utils.ts:L817` | `'A new Heroic version was released!'` | Suppressed (dead code) |
| Side-effect: `utils.ts:L825` | `'Error when checking for Heroic updates'` | Suppressed (dead code) |

### D-05: User-facing log/dialog/notification strings

| File | Line | Current Value | New Value |
|------|------|--------------|-----------|
| `src/backend/utils.ts` | 197 | `'Heroic will maybe not work probably!'` | `'GameLib will maybe not work probably!'` |
| `src/backend/utils.ts` | 1349 | `'Heroic requires Rosetta ... restart Heroic.'` | `'GameLib requires Rosetta ... restart GameLib.'` |
| `src/backend/utils.ts` | 1638 | `` `'Heroic'` `` (in writeConfig template literal) | `'GameLib'` |
| `src/backend/updater.ts` | 65 | `'Do you want to restart Heroic now?'` | `'Do you want to restart GameLib now?'` |
| `src/backend/launcher.ts` | 594 | `'restart Heroic'` (Mangohud flatpak error) | `'restart GameLib'` |
| `src/backend/storeManagers/gog/setup.ts` | 237 | `'to try again restart Heroic and'` | `'to try again restart GameLib and'` |
| `src/backend/storeManagers/zoom/games.ts` | 510 | `'Heroic could not find the executable...'` | `'GameLib could not find the executable...'` |

### D-06: Discord Rich Presence identifiers

| File | Line | Current Value | New Value |
|------|------|--------------|-----------|
| `src/backend/storeManagers/gog/presence.ts` | 43 | `application_type: 'Heroic Games Launcher'` | `application_type: 'GameLib'` |
| `src/backend/utils.ts` | 614 | `` `Heroic ${app.getVersion()}` `` | `` `GameLib ${app.getVersion()}` `` |
| `src/backend/utils.ts` | 636 | `'via Heroic on ' + getFormattedOsName()` | `'via GameLib on ' + getFormattedOsName()` |

### D-07: DO NOT TOUCH (Plausible analytics)

| File | Line | Value | Reason to Keep |
|------|------|-------|---------------|
| `src/backend/utils/plausible.ts` | 18 | `heroic-games-client.com` | External analytics domain |
| `src/backend/utils/plausible.ts` | 34 | `'HeroicGamesLauncher/1.0'` | User-Agent contract |

### D-08: Filesystem path constants

| File | Line | Current Value | New Value |
|------|------|--------------|-----------|
| `src/backend/constants/paths.ts` | 52 | `join(userHome, 'Games', 'Heroic')` | `join(userHome, 'Games', 'GameLib')` |
| `src/backend/constants/paths.ts` | 55-57 | `join(userHome, 'Games', 'Heroic', 'Prefixes')` | `join(userHome, 'Games', 'GameLib', 'Prefixes')` |
| `src/backend/logger/paths.ts` | 16 | `join(localAppData, 'Heroic', 'logs')` | `join(localAppData, 'GameLib', 'logs')` |
| `src/backend/logger/paths.ts` | 19 | `join(homedir(), 'Library', 'Logs', 'Heroic Games Launcher')` | `join(homedir(), 'Library', 'Logs', 'GameLib')` |
| `src/backend/logger/paths.ts` | 23 | `join(stateHome, 'Heroic', 'logs')` | `join(stateHome, 'GameLib', 'logs')` |
| `src/backend/logger/paths.ts` | 49 | `relativeFilePath = 'heroic'` (main app log filename) | `relativeFilePath = 'gamelib'` |
| `src/backend/config.ts` | 355 | `wineCrossoverBottle: 'Heroic'` | `wineCrossoverBottle: 'GameLib'` |

**D-08 downstream reads — confirm no migration needed:**
- `heroicInstallPath` → read by `config.ts:L341` as the `defaultInstallPath` value in config defaults. This is the default for NEW installs only; no persisted value at existing GameLib-path paths. Clean cutover is correct. [VERIFIED: direct code inspection]
- `defaultWinePrefixDir` → read by `config.ts:L344-345` for default settings and `launcher.ts:L78` for fallback winePrefix. Same: default values only, no existing data. [VERIFIED: direct code inspection]
- Log path functions → consumed by `logger/ipc_handler.ts`, `logger/log_writer.ts`, `logger/uploader.ts` via `getLogFilePath()`. All callers pass arguments to the function; no callers hardcode the path. Changing `getBaseLogPath()` return values is sufficient. [VERIFIED: direct code inspection]

### D-11: Tray tooltip

| File | Line | Current | New |
|------|------|---------|-----|
| `src/backend/tray_icon/tray_icon.ts` | 34 | `appIcon.setToolTip('Heroic')` | `appIcon.setToolTip('GameLib')` |

**Existing test:** `src/backend/tray_icon/__tests__/tray_icon.test.ts` contains tests for context menu, recent games, icon appearance, and language switching. It does NOT assert on the tooltip value. A tooltip assertion should be added to the test file. [VERIFIED: direct code inspection]

---

## New File: public/changelog.json

### Release Type Shape (from common/types.ts)

```typescript
// src/common/types.ts:L72-81
export type Release = {
  type: 'stable' | 'beta'       // required
  html_url: string               // required
  name: string                   // RENDERED in ChangelogModal header
  tag_name: string               // required
  published_at: string           // required
  prerelease: boolean            // required
  id: number                     // required
  body?: string                  // RENDERED as ReactMarkdown in ChangelogModal
}
```

**ChangelogModal renders only `name` and `body`.** All other fields must satisfy TypeScript but are never displayed. [VERIFIED: direct code inspection of `ChangelogModal/index.tsx`]

### Proposed changelog.json structure

```json
{
  "id": 1,
  "tag_name": "gamelib-v1.0.0",
  "name": "GameLib 1.0.0",
  "html_url": "https://github.com/grayson-mitchell/GameLib/releases/tag/gamelib-v1.0",
  "published_at": "2026-06-30T00:00:00Z",
  "prerelease": false,
  "type": "stable",
  "body": "## GameLib 1.0.0\n\n[D-02 content goes here]\n\nBuilt on Heroic 2.22.0 — [see upstream release notes](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/releases/tag/v2.22.0) (D-03 upstream link)"
}
```

The `body` is markdown and will be rendered by ReactMarkdown with `linkTarget={'_blank'}` and `rehypeRaw` plugins already in place. External link in body opens in new window automatically. [VERIFIED: direct code inspection of `ChangelogModal/index.tsx:L46-50`]

---

## README Changes (D-09/D-10)

### Typo fixes (D-09)

| Line | Current | Fix |
|------|---------|-----|
| 3 | `"derivitive"` | `"derivative"` |
| 3 | `"Differntiators"` | `"Differentiators"` |
| 5 | `"(Playing Games on MacOS"` (unclosed paren) | `"(Playing Games on macOS)"` |
| 14 | `"gameLib is built with"` | `"GameLib is built with"` |

### Instructional rebrand (D-10)

| Line | Current | Fix |
|------|---------|-----|
| 56 | `"from Heroic"` (store access feature) | `"from GameLib"` |
| 76 | `"Heroic will still _work_ on most distros"` | `"GameLib will still _work_ on most distros"` |
| 87 | `"Heroic was translated to almost 40 different languages"` | `"GameLib has been translated to almost 40 different languages"` |
| 214 | `"build Heroic"` (VS Code section intro) | `"build GameLib"` |
| 217 (heading) | `"Quickly testing/debugging Heroic on your own system"` | `"Quickly testing/debugging GameLib on your own system"` |
| 220 | `"Launch Heroic (HMR & HR)"` (task reference) | `"Launch GameLib (HMR & HR)"` |
| 220 | `"Heroic will start up after a short while"` | `"GameLib will start up after a short while"` |

### Keep as attribution (D-10 exception)

| Line | Text | Reason |
|------|------|--------|
| 3 | `"derivative of Heroic Games Launcher"` | Fork attribution — keep |
| 77 | `"our Discord"` (Heroic Discord link) | Attribution link — keep |
| 131 | Weblate link for Heroic translations | Attribution — keep |
| 228-234 | Weblate/Signpath sponsor mentions | Attribution — keep |

### VS Code launch.json (instructional dev tooling — D-10)

```
.vscode/launch.json:L5:  "name": "Launch Heroic (HMR & HR)"
.vscode/launch.json (compounds reference): "Launch Heroic (HMR & HR)"
→ "Launch GameLib (HMR & HR)" in both places
```

README at L220 refers to this task by name. If the README is updated, the launch.json name must match. [VERIFIED: direct code inspection]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-platform path resolution | Custom path logic | `publicDir` constant already in codebase | Already handles dev vs packaged distinction |
| Markdown rendering in ChangelogModal | Custom renderer | ReactMarkdown (already wired) | `body` field is passed directly to existing component |
| Changelog file discovery | Custom file-finding code | `join(publicDir, 'changelog.json')` | Single known location, same as all other bundled assets |

**Key insight:** Every mechanism needed for this phase is already in the codebase. The phase is entirely about pointing existing wiring at new content, not building new infrastructure.

---

## verify-branding.cjs Extension

The existing `scripts/verify-branding.cjs` has four sections covering Phase 4 surfaces. Phase 5 requires adding a Section 5 block. [VERIFIED: direct code inspection of `scripts/verify-branding.cjs`]

**Existing check to note:** The check at L93-96 asserts `paths.ts` still contains `join(configFolder, 'heroic')` (the legacy migration path). This check continues to PASS after Phase 5 because the migration code (`legacyAppFolder = join(configFolder, 'heroic')`) is not changed — only `heroicInstallPath` and `defaultWinePrefixDir` change.

**New checks to add (Section 5):**

```javascript
// --- Section 5: Phase 5 surfaces ---
const trayTs = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'tray_icon', 'tray_icon.ts'), 'utf8')
check("tray_icon.ts setToolTip('GameLib')", trayTs.includes("setToolTip('GameLib')"))
check("tray_icon.ts no setToolTip('Heroic')", !trayTs.includes("setToolTip('Heroic')"))

const loggerPathsTs = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'logger', 'paths.ts'), 'utf8')
check("logger/paths.ts no 'Heroic' in path strings", !loggerPathsTs.includes("'Heroic'") && !loggerPathsTs.includes("'Heroic Games Launcher'"))

check("src/backend/constants/paths.ts heroicInstallPath uses 'GameLib'", pathsTs.includes("join(userHome, 'Games', 'GameLib')"))
check("src/backend/constants/paths.ts no Games/Heroic path", !pathsTs.includes("'Games', 'Heroic'"))

const configTs = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'config.ts'), 'utf8')
check("config.ts wineCrossoverBottle default is 'GameLib'", configTs.includes("wineCrossoverBottle: 'GameLib'"))

const presenceTs = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'storeManagers', 'gog', 'presence.ts'), 'utf8')
check("presence.ts application_type is GameLib", !presenceTs.includes("'Heroic Games Launcher'"))

check("utils.ts no 'via Heroic on'", !utilsTs.includes("'via Heroic on '"))
check("utils.ts Discord versionText uses GameLib", utilsTs.includes('`GameLib ${app.getVersion()}`') || utilsTs.includes("'GameLib'"))

const changelogPath = path.join(ROOT, 'public', 'changelog.json')
check("public/changelog.json exists", fs.existsSync(changelogPath))
check("getCurrentChangelog reads local file", utilsTs.includes("readFileSync") && !utilsTs.includes("GITHUB_API/tags/"))
```

---

## Common Pitfalls

### Pitfall 1: defaultWinePrefixDir is NOT derived from heroicInstallPath
**What goes wrong:** Developer changes `heroicInstallPath` but leaves `defaultWinePrefixDir` with hardcoded `'Heroic'`.
**Why it happens:** The two constants look related (same path prefix) but are independently hardcoded at `paths.ts:L52` and `paths.ts:L53-58`.
**How to avoid:** D-08 requires changing both independently. `heroicInstallPath = join(userHome, 'Games', 'Heroic')` AND `defaultWinePrefixDir = join(userHome, 'Games', 'Heroic', 'Prefixes')` must both be updated. [VERIFIED: direct code inspection]
**Warning signs:** Grepping for `'Games', 'Heroic'` in `paths.ts` finds two matches — both must change.

### Pitfall 2: Bundled changelog.json type must satisfy all Release fields
**What goes wrong:** The bundled JSON provides only `name` and `body` (the only displayed fields); TypeScript compilation fails.
**Why it happens:** `getCurrentChangelog()` return type is `Release | null`, and `Release` requires `id`, `html_url`, `tag_name`, `published_at`, `prerelease`, and `type` fields.
**How to avoid:** Include all required fields with sensible dummy values. The modal renders only `name` and `body` — other fields are consumed by the type system, not the UI.
**Warning signs:** `tsc --noEmit` fails with property missing on Release type.

### Pitfall 3: Existing verify-branding.cjs check for `join(configFolder, 'heroic')`
**What goes wrong:** Developer interprets the check at `scripts/verify-branding.cjs:L93-96` as requiring `paths.ts` to have NO `heroic` references, and removes the legacy migration code.
**Why it happens:** The check is labeled "UNCHANGED" and checks for `join(configFolder, 'heroic')`, which IS the migration path (`legacyAppFolder`) — not `heroicInstallPath`.
**How to avoid:** The migration code stays. Only `heroicInstallPath` and `defaultWinePrefixDir` change. The existing check at L93-96 continues to pass.
**Warning signs:** Removing the `legacyAppFolder` migration code breaks first-launch migration for Heroic users upgrading to GameLib.

### Pitfall 4: VS Code launch.json task name must match README reference
**What goes wrong:** README at L220 is updated to say `"Launch GameLib (HMR & HR)"` but `.vscode/launch.json` still says `"Launch Heroic (HMR & HR)"`. The VS Code Run & Debug tab shows the old name.
**Why it happens:** `.vscode/launch.json` is a non-obvious second location for the same string.
**How to avoid:** Update `.vscode/launch.json` `"name"` at line 5 AND the reference in the `"compounds"` array alongside the README change.
**Warning signs:** README says GameLib but VS Code shows Heroic in the Run & Debug panel.

### Pitfall 5: getLatestReleases() suppression must be at function level, not IPC handler level
**What goes wrong:** Suppression applied in `main.ts:L694-700` IPC handler (by always returning `[]` there) — but this leaves the function in `utils.ts` still potentially callable from other paths, and the log/notification strings in the function body remain as technical debt.
**How to avoid:** Suppress inside `getLatestReleases()` itself in `utils.ts`. Add a comment citing the deferred release pipeline. This makes un-suppression trivial (one function body change) and eliminates all dead code in one sweep.

---

## Code Examples

### Pattern: Reading a bundled file (from existing codebase)

The `readFileSync` and `publicDir` pattern is used throughout the backend: [VERIFIED: direct code inspection]

```typescript
// Existing usage — src/backend/utils.ts:L544
const json = parse(readFileSync(vdfFile, 'utf-8'))

// For changelog.json, the same pattern:
import { readFileSync } from 'graceful-fs'  // already imported at utils.ts:L16
import { publicDir } from 'backend/constants/paths'  // already imported at utils.ts:L79

const content = readFileSync(join(publicDir, 'changelog.json'), 'utf-8')
return JSON.parse(content) as Release
```

### Pattern: IPC handler shape (no change needed)

```typescript
// src/backend/main.ts:L703-705 — stays as-is
addHandler('getCurrentChangelog', async () => {
  return getCurrentChangelog()
})
```

The IPC handler simply delegates to `getCurrentChangelog()`. Changing the function body is the complete change — the handler stays identical. [VERIFIED: direct code inspection]

---

## Runtime State Inventory

> This phase includes path constant changes (D-08). Assessing runtime state.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `config.json` in `~/.config/GameLib/` stores user's current `defaultInstallPath`. Users who have installed games retain their configured path — D-08 only changes the **default** for new installs. | No migration — code edit only (change default value) |
| Stored data | `config.json` stores `wineCrossoverBottle`. Users may have existing bottle named `'Heroic'` on their macOS CrossOver installation. | No migration — only the default for new games changes; existing per-game config is user-persisted. User must manually rename existing CrossOver bottle if desired. |
| Stored data | `config.json` stores `defaultWinePrefixDir`. Changing the constant only affects the initial default; existing config persists. | No migration |
| Live service config | None — no external services reference these paths. | None |
| OS-registered state | macOS log directory `~/Library/Logs/Heroic Games Launcher/` — contains existing logs at old path. | No migration — D-08 explicitly specifies "clean cutover, no migration". Old log directory continues to exist but new logs write to new location. |
| OS-registered state | Windows/Linux log directories (`%LOCALAPPDATA%/Heroic/logs`, `~/.local/state/Heroic/logs`) — same situation. | No migration per D-08. |
| Secrets/env vars | None — paths are computed from constants, not from env vars. | None |
| Build artifacts | `public/changelog.json` is a new file — no stale artifacts. | Create new file |

**Key deferred-migration note:** D-08 rationale states "no existing GameLib-path userbase to migrate — clean cutover is low-risk in practice." The old paths (e.g. old log directories) are NOT removed; they simply become stale. Existing data is not moved. This is a deliberate choice documented in CONTEXT.md.

---

## Environment Availability

Step 2.6: No external dependencies beyond Node.js and the existing codebase. This phase is entirely code/config/static-file changes. SKIPPED.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 with ts-jest |
| Config file | `src/backend/jest.config.js` (root: `../..`, tests in `src/backend/**/__tests__/*.test.ts`) |
| Quick run command | `pnpm test --testPathPattern=tray_icon` |
| Full suite command | `pnpm test` |
| Type check command | `pnpm codecheck` (runs `tsc --noEmit`) |
| Branding check | `node scripts/verify-branding.cjs` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BRAND-02 | tray tooltip equals "GameLib" | unit | `pnpm test --testPathPattern=tray_icon` | ✅ exists, needs assertion |
| BRAND-03 | backend strings contain "GameLib" not "Heroic" | branding script | `node scripts/verify-branding.cjs` | ✅ exists, needs Section 5 |
| BRAND-04 | README typos fixed, instructional Heroic → GameLib | manual spot-check | Manual review of README.md | ✅ README exists |
| APP-01 | changelog modal shows bundled content (name + body) | branding script | `node scripts/verify-branding.cjs` | ✅ script, needs new check |
| APP-01 | `getLatestReleases` returns empty array | unit | `pnpm test --testPathPattern=utils` | ❌ Wave 0 gap |

### Sampling Rate

- **Per task commit:** `pnpm codecheck` (tsc zero errors is the primary gate)
- **Per wave merge:** `pnpm test` + `node scripts/verify-branding.cjs`
- **Phase gate:** Full suite green + branding script green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] Add tooltip assertion to `src/backend/tray_icon/__tests__/tray_icon.test.ts`
- [ ] Add `getLatestReleases` suppression test (if desired) — returns `[]` under normal conditions

*(Existing test infrastructure covers the majority of this phase; the above are additions, not rewrites.)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Phase makes no auth changes |
| V3 Session Management | No | No session changes |
| V4 Access Control | No | No access control changes |
| V5 Input Validation | Marginal | `JSON.parse` of a local bundled file authored by this project — low risk; `readFileSync` throws on missing file, caught in try/catch |
| V6 Cryptography | No | No crypto changes |

### Notes

D-01 changes `getCurrentChangelog()` from a network call to a `readFileSync` of a local bundled file. This **reduces** attack surface: no network dependency, no SSRF vector, no TLS configuration. The `JSON.parse` call deserializes a file shipped inside the app bundle itself — equivalent trust level to compiled code.

D-04 removes a network call (`getLatestReleases`). Also reduces attack surface.

No new trust boundaries are created in this phase.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `defaultWinePrefixDir` is implied by D-08 scope (same `Games/Heroic` directory as `heroicInstallPath`) | D-08 string inventory | If D-08 scope excludes it, leave `defaultWinePrefixDir` unchanged — minor cosmetic inconsistency |
| A2 | `logger/paths.ts:L49` `relativeFilePath = 'heroic'` (main app log filename `heroic.log`) is a D-05/D-08 target | D-08 string inventory | If left as-is, main app log remains named `heroic.log` in the rebranded directory — cosmetically inconsistent but not functionally broken |
| A3 | `zoom/games.ts:L510` `'Heroic could not find...'` qualifies as "user-facing" under D-05 | D-05 string inventory | If considered internal/Zoom store specificity, skip — minimal impact |

**If table items A1-A3 are wrong:** Default to the more conservative interpretation (skip the change). None affect core functionality.

---

## Open Questions

1. **Changelog body content (D-02)**
   - What we know: Must describe Steam platform support, CrossOver/Proton integration, Heroic→GameLib rebrand; must include upstream link.
   - What's unclear: Exact wording and level of detail — concise vs comprehensive.
   - Recommendation: Executor authors it during implementation; 3-5 bullet points is sufficient.

2. **`relativeFilePath = 'heroic'` (logger/paths.ts:L49)**
   - What we know: This sets the filename of the main app log to `heroic.log` inside the rebranded log directory.
   - What's unclear: D-08 says "log dir label" — does this include the log filename itself?
   - Recommendation: Change to `'gamelib'` for completeness and internal consistency. If overturned, it's a one-character-string revert.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `src/backend/utils.ts`, `src/backend/tray_icon/tray_icon.ts`, `src/backend/constants/paths.ts`, `src/backend/logger/paths.ts`, `src/backend/config.ts`, `src/backend/storeManagers/gog/presence.ts`, `src/backend/updater.ts`, `src/backend/launcher.ts`, `src/backend/storeManagers/gog/setup.ts`, `src/backend/storeManagers/zoom/games.ts`, `src/backend/main.ts`
- Direct code inspection of `src/frontend/components/UI/ChangelogModal/index.tsx`, `src/frontend/components/UI/Sidebar/components/HeroicVersion/index.tsx`
- Direct code inspection of `src/common/types.ts` (Release type)
- Direct code inspection of `electron.vite.config.ts` (build output paths)
- Direct code inspection of `electron-builder.yml` (asset bundling)
- Direct code inspection of `scripts/verify-branding.cjs`
- Direct code inspection of `.vscode/launch.json`, `.vscode/tasks.json`
- Direct code inspection of `README.md`
- `UPSTREAM.md` and `package.json` for upstream base version `2.22.0`

---

## Metadata

**Confidence breakdown:**
- String inventory: HIGH — all locations verified by direct code search
- Bundled asset path resolution: HIGH — verified by tracing `publicDir` computation through `electron.vite.config.ts` and `paths.ts`
- Release type shape: HIGH — read directly from `src/common/types.ts` and `ChangelogModal/index.tsx`
- README change scope: HIGH — read directly from `README.md`
- D-08 downstream impact: HIGH — all callers of `heroicInstallPath`, `defaultWinePrefixDir`, and log path functions verified

**Research date:** 2026-07-02
**Valid until:** Stable — these are static code facts, not ecosystem-dependent. Valid until upstream merges change any of the inspected files.
