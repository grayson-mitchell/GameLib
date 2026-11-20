---
phase: quick-261101-cvs
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - public/locales/en/translation.json
  - src/frontend/screens/Settings/components/DefaultSteamPath.tsx
autonomous: true
requirements: [QUICK-261101-cvs]

must_haves:
  truths:
    - "The Default Steam path help text (info icon and settings help panel) describes what the path is actually used for, not the inherited Heroic Proton wording"
    - "The English locale value and the in-code fallback default carry the identical new string"
    - "No other locale file is changed"
  artifacts:
    - path: "public/locales/en/translation.json"
      provides: "help.steam_path.info with the new text"
      contains: "The folder where Steam is installed."
    - path: "src/frontend/screens/Settings/components/DefaultSteamPath.tsx"
      provides: "t('help.steam_path.info', <fallback>) fallback matching the locale value"
      contains: "The folder where Steam is installed."
  key_links:
    - from: "src/frontend/screens/Settings/components/DefaultSteamPath.tsx"
      to: "public/locales/en/translation.json"
      via: "t('help.steam_path.info', ...)"
      pattern: "help\\.steam_path\\.info"
---

<objective>
Replace the inaccurate inherited Heroic help text for the "Default Steam path" setting with text that
describes what GameLib actually uses that path for.

Purpose: the current text ("This path lets GameLib determine what version of Proton Steam uses, for
adding non-Steam games to Steam.") is wrong on macOS/Windows and incomplete everywhere. Every consumer
of `defaultSteamPath` has already been traced: it is the Steam client install root, from which GameLib
reads `steamapps/libraryfolders.vdf` (all Steam library folders: installed-game detection, install
location, uninstall containment, and the "Steam launched once" gate for native installs),
`logs/content_log.txt` (download progress), `logs/connection_log.txt` (offline detection), `userdata/`
(adding non-Steam games to Steam), and on Linux only, Proton discovery and the Proton download target.

Output: one updated English locale string plus the matching fallback default in the component.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/frontend/screens/Settings/components/DefaultSteamPath.tsx

Current state (already read by the planner, no exploration needed):
- `public/locales/en/translation.json` lines 531-533: key `help.steam_path.info` holds the old string.
- `DefaultSteamPath.tsx` lines 20-23: `const helpContent = t('help.steam_path.info', '<old string>')`.
  `helpContent` feeds both `hasHelp(...)` and the icon-only `InfoBox`, so one edit covers both surfaces.
- `npx prettier --file-info` results: `public/locales/en/translation.json` is prettier-IGNORED
  (`"ignored": true`); `DefaultSteamPath.tsx` is NOT ignored (parser typescript).
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite help.steam_path.info in the English locale and the component fallback</name>
  <files>public/locales/en/translation.json, src/frontend/screens/Settings/components/DefaultSteamPath.tsx</files>
  <action>
  Replace the old string with exactly this new text in BOTH files (byte-identical in each):

  The folder where Steam is installed. GameLib reads your Steam libraries, download progress and connection status from here, and uses it to add non-Steam games to Steam. On Linux, it is also where GameLib finds Proton versions.

  1. In `public/locales/en/translation.json`, change only the value of `help.steam_path.info` (line ~532). Keep the file's existing 4-space indentation and do not reformat or reorder anything else in the file (it is prettier-ignored, so no formatter will fix stray changes).
  2. In `src/frontend/screens/Settings/components/DefaultSteamPath.tsx`, change only the second argument of the `t('help.steam_path.info', ...)` call to the new string, as a single-quoted string literal. Leave the key, `hasHelp`, `InfoBox` and everything else unchanged. Let prettier decide line wrapping (run `npx prettier --write` on this one file only if `--check` fails).
  3. English only: do NOT touch any other `public/locales/*/translation.json` (translators handle the other 46 locales; i18next falls back to English for them anyway).
  4. When committing, stage the two files BY EXPLICIT PATH only. `public/locales/en/gamepage.json` and several other paths carry unrelated uncommitted user changes; never use `git add -A`, `git add .`, or `git commit -a`, and confirm with `git diff --cached --name-only` that exactly these two files (plus this quick task's planning artifacts) are staged.

  Wording rationale (planner's discretion): two to three short user-facing sentences, no file names; it covers the platform-neutral uses (libraries, download progress, connection status, non-Steam shortcuts) and scopes the Proton claim to Linux, where it is actually true.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx prettier --file-info public/locales/en/translation.json src/frontend/screens/Settings/components/DefaultSteamPath.tsx && npx prettier --check src/frontend/screens/Settings/components/DefaultSteamPath.tsx && ! grep -F "determine what version of Proton Steam uses" public/locales/en/translation.json src/frontend/screens/Settings/components/DefaultSteamPath.tsx && test "$(grep -lF 'The folder where Steam is installed. GameLib reads your Steam libraries, download progress and connection status from here, and uses it to add non-Steam games to Steam. On Linux, it is also where GameLib finds Proton versions.' public/locales/en/translation.json src/frontend/screens/Settings/components/DefaultSteamPath.tsx | wc -l | tr -d ' ')" = 2 && node -e "JSON.parse(require('fs').readFileSync('public/locales/en/translation.json','utf8'))" && test -z "$(git diff --name-only -- public/locales | grep -v '^public/locales/en/' )"</automated>
    Note on the prettier check (per the `<verify>` formatter convention): `public/locales/en/translation.json` is prettier-ignored (`--file-info` reports `"ignored": true`), so `--check` is scoped to the `.tsx` only; the JSON is instead validated with `JSON.parse`. If the new string wraps across lines in the `.tsx` after prettier formatting, the grep still matches because prettier does not split string literals.
  </verify>
  <done>Both files contain the identical new string; the old string appears in neither; the `.tsx` passes `prettier --check`; translation.json parses as valid JSON; no non-English locale file is modified; the commit contains only these two source files (plus the quick task's planning artifacts) and not `public/locales/en/gamepage.json`.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none | Static UI copy change; no input, IPC, or data path is touched |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261101-cvs-01 | Tampering | git staging of unrelated user changes (public/locales/en/gamepage.json etc.) | mitigate | Stage by explicit path only; verify `git diff --cached --name-only` before committing |
</threat_model>

<verification>
- Old string gone from both files, new string present in both (grep in `<verify>`).
- `npx prettier --check` passes for the `.tsx`; translation.json still valid JSON.
- `git diff --name-only -- public/locales` shows only `public/locales/en/` paths (and the commit itself includes only `en/translation.json`).
</verification>

<success_criteria>
The Default Steam path help text in Settings reads "The folder where Steam is installed. GameLib reads your Steam libraries, download progress and connection status from here, and uses it to add non-Steam games to Steam. On Linux, it is also where GameLib finds Proton versions." from both the locale and the fallback, with no unrelated files committed.
</success_criteria>

<output>
Create `.planning/quick/261101-cvs-rewrite-default-steam-path-help-text/261101-cvs-SUMMARY.md` when done
</output>
