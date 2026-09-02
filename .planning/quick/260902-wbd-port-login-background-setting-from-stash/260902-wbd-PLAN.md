---
phase: quick-260902-wbd
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/Settings/components/LoginBackground.tsx
  - src/frontend/screens/Settings/components/index.ts
  - src/frontend/screens/Settings/sections/GeneralSettings/index.tsx
  - src/frontend/screens/Login/index.tsx
  - src/backend/appshell/themes.ts
  - src/backend/sidecar/appShellFlowRegistration.ts
  - src/common/types/ipc.ts
  - src/common/types.ts
  - src/preload/api/helpers.ts
  - src/backend/config.ts
  - public/locales/en/gamelib.json
  - meta/i18nGateScope.json
  - meta/i18nForkTouchedFiles.json
  - meta/__tests__/genI18nGateScope.test.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "Settings -> General shows a 'Manage Accounts background' file picker between the theme selector and the default install path"
    - "Picking an image persists loginBackgroundPath into the global config"
    - "The Login (Manage Accounts) screen requests window.api.getLoginBackground and applies the returned data: URL as the .loginBackground div's backgroundImage"
    - "Clearing the field returns the Login screen to the bundled default artwork"
    - "The blocking hardcoded-string gate scans 164 files, one more than before, and LoginBackground.tsx is one of them"
    - "Whole-project test/typecheck/lint/prettier state is no worse than baseline"
  artifacts:
    - path: "src/frontend/screens/Settings/components/LoginBackground.tsx"
      provides: "Settings picker for the login background image"
      min_lines: 55
    - path: "src/backend/appshell/themes.ts"
      provides: "getLoginBackground() returning a base64 data: URL or ''"
      contains: "LOGIN_BACKGROUND_MIME_BY_EXTENSION"
    - path: "meta/i18nGateScope.json"
      provides: "Blocking i18n scope widened to 164 files"
  key_links:
    - from: "src/frontend/screens/Login/index.tsx"
      to: "window.api.getLoginBackground"
      via: "useAwaited"
      pattern: "useAwaited\\(window\\.api\\.getLoginBackground\\)"
    - from: "src/backend/sidecar/appShellFlowRegistration.ts"
      to: "getLoginBackground"
      via: "ipcMain.handle"
      pattern: "ipcMain\\.handle\\('getLoginBackground'"
    - from: "src/preload/api/helpers.ts"
      to: "getLoginBackground channel"
      via: "makeHandlerInvoker"
      pattern: "makeHandlerInvoker\\('getLoginBackground'\\)"
---

<objective>
Port the login-background setting from the `wip/login-background-260815` stash onto current main.
The rendering layer (`.loginBackground` div + its SCSS) already exists; everything that lets the
user CHOOSE the image is missing — `loginBackgroundPath` has zero references in the repo today.

Purpose: the user tested this feature weeks ago and it vanished because it was never committed.
Output: a Settings picker, a config key, an IPC channel, a backend reader, and a wired Login screen —
plus the four i18n artifacts that must move together for the blocking gate to stay honest.

The slice is fully mapped below. Do NOT re-derive it from the stash beyond the `git show` /
`git diff` reads named in each task.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md

Stash commits (parent `445606286`, all read-only):
- `b8a2cdee8` — WIP commit (tracked modifications)
- `04cfcba96` — untracked-files commit (holds the new component)

Read a modified file's stash hunk with `git diff 445606286 b8a2cdee8 -- <path>`.
Read the new component with `git show 04cfcba96:src/frontend/screens/Settings/components/LoginBackground.tsx`.

NEVER `git checkout`, `git stash apply`, `git stash pop`, or `git reset --hard` — `.husky/post-checkout`
fires a binary download that can throw. To restore a file: `git show HEAD:<path> > <path>`.
</context>

<interfaces>
Verified against the live tree at plan time — trust these over the 3-week-old stash.

`PathSelectionBox` (`src/frontend/components/UI/PathSelectionBox/index.tsx`) props, CURRENT shape —
every prop the stash's component passes is still valid, in the same types:
  htmlId: string; type: 'file' | 'directory'; onPathChange: (path: string) => void; path: string;
  placeholder?: string; pathDialogTitle: string; pathDialogDefaultPath?: string;
  pathDialogFilters?: FileFilter[]; canEditPath?: boolean; noDeleteButton?: boolean;
  label?: string; afterInput?: ReactNode; disabled?: boolean
The stash's `LoginBackground.tsx` compiles against this unchanged. No prop drift to repair.

`src/frontend/hooks/hasHelp.ts` and `src/frontend/hooks/useAwaited.ts` both exist (confirmed).

Live insertion anchors (line numbers verified at plan time):
  src/frontend/screens/Login/index.tsx        :25 `useAwaited` import (already present)
                                              :123 `const systemInfo = useAwaited(...)`
                                              :232 `<div className="loginBackground"></div>`
  src/backend/sidecar/appShellFlowRegistration.ts
                                              :11-12 header inventory `invoke (8, ...)`
                                              :149 `import { getCustomThemes, getThemeCSS, getCustomCSS } from '../appshell/themes'`
                                              :235 `// ── invoke (8) ──` banner
                                              :243 `ipcMain.handle('getCustomCSS', ...)`
  src/common/types/ipc.ts                     :567 `getCustomCSS: () => Promise<string>`
  src/preload/api/helpers.ts                  :48 `export const getCustomCSS = ...`
  src/backend/config.ts                       :343 `defaultSteamPath: getSteamCompatFolder(),`
  src/common/types.ts                         :124 `defaultSteamPath: string`
  src/backend/appshell/themes.ts              already imports `existsSync, readdirSync, readFileSync`
                                              from 'graceful-fs' and `* as path` from 'path' — no
                                              new imports needed for `getLoginBackground`.

TWO CORRECTIONS to the task brief, both measured:

1. `public/locales/en/gamelib.json` — the `settings` object is alphabetically sorted and contains
   `steamgriddb` between `gamescopeWindowType` and `wineDefaultLabel`. Correct sorted position for
   the four new keys is therefore AFTER `gamescopeWindowType` and BEFORE `steamgriddb`, not before
   `wineDefaultLabel`.

2. `meta/i18nForkTouchedFiles.json` — its `Settings/components/` neighbours differ from the scope
   file's. Correct sorted position there is between `LauncherArgs.tsx` and `MinimizeOnGameLaunch.tsx`
   (that file has `LauncherArgs.tsx`; `meta/i18nGateScope.json` does not). The scope file's position
   IS between `HideWindowOnProtocolLaunch.tsx` and `MinimizeOnGameLaunch.tsx` as briefed. Both
   `files` arrays are confirmed strictly sorted today — keep them sorted.
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Port the ten-file code slice from the stash</name>
  <files>src/frontend/screens/Settings/components/LoginBackground.tsx, src/frontend/screens/Settings/components/index.ts, src/frontend/screens/Settings/sections/GeneralSettings/index.tsx, src/frontend/screens/Login/index.tsx, src/backend/appshell/themes.ts, src/backend/sidecar/appShellFlowRegistration.ts, src/common/types/ipc.ts, src/common/types.ts, src/preload/api/helpers.ts, src/backend/config.ts</files>
  <action>
Record the pre-change baseline FIRST, before touching anything: run `pnpm lint` and note the exact
warning count (expected 4148 against a `--max-warnings 4157` ceiling), and note that `git status --porcelain`
shows only the untracked `.planning/phases/40-.../` directory.

Create `src/frontend/screens/Settings/components/LoginBackground.tsx` verbatim from
`git show 04cfcba96:src/frontend/screens/Settings/components/LoginBackground.tsx`. Its
`PathSelectionBox` props are confirmed valid against the live component (see interfaces) — take it
as-is including the doc comment explaining why `noDeleteButton` is deliberately NOT passed. All four
strings already sit on the `gamelib:settings.*` namespace, which is D-05 compliant.

Apply the remaining nine hunks. Six are byte-clean and can be taken directly from
`git diff 445606286 b8a2cdee8 -- <path>`:
  - `Settings/components/index.ts` — the single `export { default as LoginBackground }` line, between
    `LibraryTopSection` and `MaxRecentGames`.
  - `Settings/sections/GeneralSettings/index.tsx` — `LoginBackground,` in the import list and
    `<LoginBackground />` after `<ThemeSelector />`, before `<DefaultInstallPath />`.
  - `common/types.ts` — `loginBackgroundPath: string` plus its two-line comment after `defaultSteamPath`.
  - `backend/config.ts` — `loginBackgroundPath: '',` in `GlobalConfigV0`'s defaults after `defaultSteamPath`.
  - `common/types/ipc.ts` — ONLY the `getLoginBackground` hunk with its two-line doc comment after
    `getCustomCSS` at :567. EXCLUDE the `isSteamBottleEligible` and `persistBottleWineVersion`
    rewraps in the same diff: they are stale prettier drift from an older prettier and will redden
    the gate.
  - `preload/api/helpers.ts` — ONLY the `getLoginBackground = makeHandlerInvoker('getLoginBackground')`
    line after :48. EXCLUDE the `showAboutWindow` and `createNewWindow` one-line rewraps.

Three need hand-application because main has moved:
  - `backend/appshell/themes.ts` — append `LOGIN_BACKGROUND_MIME_BY_EXTENSION` and the
    `getLoginBackground()` export exactly as the stash has them. Then REWORD the file's header doc
    comment: the stash's version still says it backs `main.ts`'s registrations and cites
    `main.ts:1513-1539`, but `main.ts` was deleted by the Electron cutover (`5643c7583`). Say it
    backs the sidecar's `appShellFlowRegistration.ts` registrations and drop the `main.ts:` line
    citation. Verify `existsSync`, `readFileSync` and `path` are already imported before assuming so.
  - `backend/sidecar/appShellFlowRegistration.ts` — take FOUR things only: `getLoginBackground` added
    to the `../appshell/themes` import at :149 (multi-line form); `ipcMain.handle('getLoginBackground',
    async () => getLoginBackground())` immediately after the `getCustomCSS` handler at :243; the
    header inventory at :11-12 updated from `invoke (8` to `invoke (9` with `getLoginBackground`
    added to the channel list; and the `// ── invoke (8) ──` banner at :235 updated to `(9)` keeping
    the stash's two-line note that this is a later addition. Do NOT copy the stash's `main.ts:1512-1516`
    citation — cite the module, not the deleted file. EXCLUDE the `syncTrayIcon`/`requestRustInvoke`
    rewrap, the `getThemeCSS` handler rewrap, and the two `'...'` to `"..."` quote flips in the
    `getWebviewPreloadPath` and `setTitleBarOverlay` `console.warn` strings — all stale prettier drift.
  - `frontend/screens/Login/index.tsx` — add `const customBackground = useAwaited(window.api.getLoginBackground)`
    with the stash's six-line comment right after the `systemInfo` line at :123 (`useAwaited` is
    already imported at :25). Then give the `<div className="loginBackground"></div>` at :232 the
    stash's conditional inline `style` prop. The div was at :136 in the stash era and is at :232 now;
    the surrounding shape is identical, so hand-apply rather than patching by offset. Keep the
    doc comment explaining WHY the backend returns a `data:` URL and not `file://` (Tauri serves from
    `tauri://localhost` with no asset protocol configured, so `file://` sources are blocked).

`src/backend/main.ts` has NOTHING to port — the file is deleted in main and its stash hunk was only
the `addHandler` registration lines, which now live in `appShellFlowRegistration.ts`.

DO NOT touch, at any point in this task: `public/locales/en/translation.json`, `consoleSteamTarget.ts`,
`consoleSteamTarget.test.ts`, `InstallOverlay/index.tsx`, `InstallOverlay/index.scss`,
`NavTabs/index.tsx`, `NavTabsComponent.test.tsx`, `destinationCoverage.test.tsx`. The stash bundles
three unrelated workstreams; only the login-background one is in scope.

After the edits run `npx prettier --check` on the ten changed files, then `pnpm codecheck`, then
`pnpm lint` again. Re-running lint AFTER any prettier write is mandatory — a reformat can move a
statement out from under an `eslint-disable-next-line` and silently break a suppression.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx prettier --check src/frontend/screens/Settings/components/LoginBackground.tsx src/frontend/screens/Settings/components/index.ts src/frontend/screens/Settings/sections/GeneralSettings/index.tsx src/frontend/screens/Login/index.tsx src/backend/appshell/themes.ts src/backend/sidecar/appShellFlowRegistration.ts src/common/types/ipc.ts src/common/types.ts src/preload/api/helpers.ts src/backend/config.ts && git diff --quiet -- public/locales/en/translation.json && grep -q "ipcMain.handle('getLoginBackground'" src/backend/sidecar/appShellFlowRegistration.ts && grep -q "useAwaited(window.api.getLoginBackground)" src/frontend/screens/Login/index.tsx && ! grep -n "main\.ts:151" src/backend/appshell/themes.ts src/backend/sidecar/appShellFlowRegistration.ts</automated>
  </verify>
  <done>All ten files carry only login-background changes; `tsc --noEmit` is clean; prettier is clean on all ten; `pnpm lint` warning count is unchanged from the pre-change baseline; `public/locales/en/translation.json` shows no diff; neither backend file cites the deleted `main.ts`.</done>
</task>

<task type="auto">
  <name>Task 2: Land the four coordinated i18n artifacts</name>
  <files>public/locales/en/gamelib.json, meta/i18nGateScope.json, meta/i18nForkTouchedFiles.json, meta/__tests__/genI18nGateScope.test.ts</files>
  <action>
Treat this as ONE coordinated change, not four independent edits — there is a recorded cascade here
where a regen turns 1 failure into 5.

DO NOT run `pnpm gen-i18n-gate-scope` or `pnpm gen-i18n-scope:rewrite`. Hand-edit every artifact.

STEP A — measure before widening. Write a throwaway script under the scratchpad that imports
`scanScope` from `meta/hardcodedStringGate.ts` (safe to import; no self-exec guard) and calls it in
audit mode: `scanScope({ extraFiles: ['src/frontend/screens/Settings/components/LoginBackground.tsx'] })`.
Audit mode never mutates the committed artifacts. Confirm the baseline `scanScope()` reports 163
files and the audit run reports 164 files with ZERO violations attributable to LoginBackground.tsx.
If it reports violations, FIX THE COMPONENT — route the offending literal through `t()` on the
`gamelib` namespace. Do NOT add an entry to `meta/i18nGateAllowlist.json`: that file is a deferral
register pinned at exactly 2 entries by T-34.8-30 and must show no diff.

STEP B — `public/locales/en/gamelib.json`. Add the four keys `loginBackground`,
`loginBackgroundDialogTitle`, `loginBackgroundFilterName`, `loginBackgroundHelp` under `settings`,
with the English values the component passes as `t()` defaults. Insert in sorted position: AFTER
`gamescopeWindowType`, BEFORE `steamgriddb` (see the correction in interfaces — the brief's
"before wineDefaultLabel" is a wider range than the true slot). NEVER `translation.json`.
Do not touch `public/locales/de/gamelib.json` or `public/locales/fr/gamelib.json`.

STEP C — `meta/i18nGateScope.json`. Add `src/frontend/screens/Settings/components/LoginBackground.tsx`
to `files` in sorted position, between `.../HideWindowOnProtocolLaunch.tsx` and
`.../MinimizeOnGameLaunch.tsx`. Count goes 163 to 164. Leave `generatedBy`, `baseCommit`,
`baseVersion`, `generatedAt` and `excluded` BYTE-IDENTICAL — the A5 provenance ratchet asserts
`isHandCuratedProvenance(generatedBy)` stays true, and A1/A2 compare the file byte-for-byte.

STEP D — `meta/i18nForkTouchedFiles.json`. LoginBackground.tsx is a new fork-authored file, so it
belongs here too. Add it to `files` in sorted position, between `.../LauncherArgs.tsx` and
`.../MinimizeOnGameLaunch.tsx`. Count goes 208 to 209.

STEP E — `meta/__tests__/genI18nGateScope.test.ts`. Because the file lands in BOTH artifacts,
`unscanned = forkTouched - committedScope` is 209 - 164 = 45, unchanged, so `DECLARED_UNSCANNED_DEBT`
needs NO edit. Only the literal count pins move. Edit exactly these eleven lines, BY EXPLICIT LINE
NUMBER, and nothing else:
  :687  "the 208 files of the committed fork-touched artifact" -> 209
  :695  "the REAL 163 -> 208 delta" -> 164 -> 209
  :721  test name "the REAL 163-file ... the REAL 208" -> 164-file ... REAL 209
  :722  expect(scopeSnapshot.files.length).toBe(163) -> 164
  :723  expect(forkTouchedSnapshot.files.length).toBe(208) -> 209
  :724  expect(freshSnapshot().files.length).toBe(208) -> 209
  :750  test name "the real 163 -> 208 diff" -> 164 -> 209
  :773  test name "DOES rewrite it to 208" -> 209
  :786  expect(rewritten.files.length).toBe(208) -> 209
  :791  test name "creates it with 208 files" -> 209
  :804  ...files.length).toBe(208) -> 209
Do NOT bulk-replace. Lines :124, :166, :179 and :192 also contain `163` and/or `208` but are
HISTORICAL RECORDS inside dated doc-comment entries describing what earlier tasks did — rewriting
them falsifies the log. Distinguish a live pin from a history line by reading the surrounding
sentence, and re-grep after editing to confirm exactly four `163` occurrences remain (all at
:124/:166/:179/:192) and exactly one `208` occurrence remains (at :192).

Then APPEND a new dated `2026-09-02` entry to that doc comment, after the `260902-ur1` block,
recording: scope 163 -> 164, fork-touched 208 -> 209, unscanned UNCHANGED at 45 because the file
enters BOTH lists so it never appears in the difference; that this is a widening of the BLOCKING
gate by a new fork-authored settings component; that it was measured with audit mode
(`scanScope({ extraFiles: [...] })`) at zero violations BEFORE the promotion, not after; and that
it was hand-edited surgically, not regenerated.

Finally, if you run `pnpm i18n --fail-on-update`, always follow it with `git status -- public/locales/`
— it writes locale files even when it passes. Keep ONLY the `en/gamelib.json` addition; restore any
other locale churn with `git show HEAD:<path> > <path>`, never `git checkout`.
  </action>
  <verify>
    <automated>node -e "const s=require('./meta/i18nGateScope.json'),f=require('./meta/i18nForkTouchedFiles.json');const T='src/frontend/screens/Settings/components/LoginBackground.tsx';if(s.files.length!==164)throw new Error('scope '+s.files.length);if(f.files.length!==209)throw new Error('fork '+f.files.length);if(!s.files.includes(T)||!f.files.includes(T))throw new Error('missing');if(JSON.stringify(s.files)!==JSON.stringify([...s.files].sort()))throw new Error('scope unsorted');if(JSON.stringify(f.files)!==JSON.stringify([...f.files].sort()))throw new Error('fork unsorted');const g=require('./public/locales/en/gamelib.json');for(const k of ['loginBackground','loginBackgroundDialogTitle','loginBackgroundFilterName','loginBackgroundHelp'])if(!g.settings[k])throw new Error('key '+k);console.log('OK')" && git diff --quiet -- meta/i18nGateAllowlist.json public/locales/en/translation.json public/locales/de/gamelib.json public/locales/fr/gamelib.json && test "$(grep -c '163' meta/__tests__/genI18nGateScope.test.ts)" = "4" && test "$(grep -c '208' meta/__tests__/genI18nGateScope.test.ts)" = "1" && npx jest --selectProjects Meta</automated>
  </verify>
  <done>Scope is 164 and fork-touched is 209, both still sorted and both containing LoginBackground.tsx; the four gamelib keys exist in sorted position; `meta/i18nGateAllowlist.json`, `translation.json` and the de/fr gamelib files show no diff; the provenance fields in `i18nGateScope.json` are byte-identical; the eleven live count pins moved and the four history lines did not; the Meta jest project is fully green.</done>
</task>

<task type="auto">
  <name>Task 3: Prove the whole-project delta and commit</name>
  <files>(verification only — no source changes expected)</files>
  <action>
Judge by WHOLE-PROJECT delta, not by the target assertions. The recorded failure mode in this area
is trading 1 failure for 5.

Run the full `pnpm test` and compare against the baseline of 377/377 suites and 7541 passing tests.
Zero failing suites is the bar. Then run `pnpm codecheck`, `pnpm lint`, and `npx prettier --check`
across every changed file. Confirm the lint warning count is <= the pre-change baseline recorded in
Task 1 and still under the 4157 ceiling. If prettier wrote anything, re-run `pnpm lint` afterwards
before proceeding.

Prove the widening is NOT VACUOUS. The consuming test reads the scope dynamically and stays green
whether the scope is 163 or 164, so a green Meta suite does NOT prove the widening happened. Run
`scanScope()` (no `extraFiles`) from a scratchpad script and assert it reports 164 scanned files
including `LoginBackground.tsx`, with zero violations. Record the observed number in the SUMMARY.

Confirm the two existing Login guards are green — `src/frontend/screens/Login/__tests__/index.test.tsx`
(the `.loginBackground` out-of-flow assertion) and `src/frontend/screens/Login/__tests__/loginCrossfade.test.ts`
(the F-10 regression guard). Both read the SCSS source rather than the rendered DOM, so the inline
style should not reach them, but confirm rather than assume.

Confirm `git status --porcelain` shows only the fourteen intended files plus the still-untracked
`.planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/`. NEVER `git add`
that directory.

Commit with EXPLICIT pathspecs naming all fourteen files — a bare `git commit` absorbs whatever is
already staged, and `git commit --only` takes the WORKING TREE rather than the index. Do NOT commit
PLAN.md, SUMMARY.md, STATE.md or ROADMAP.md; the orchestrator does that in its final step. Do not
run any `gsd-sdk query state.*` verb, `roadmap.update-plan-progress`, or `phase.complete`.

In the SUMMARY, state PLAINLY whether a human re-test is needed. The feature was user-tested weeks
ago, but this is a re-port onto a rearchitected Tauri shell with a `data:`-URL delivery path that
has never been exercised there — a green suite does not prove the image actually renders. Name the
gesture: open Settings -> General, pick a PNG, then open Manage Accounts and confirm the artwork
changes; then clear the field and confirm it reverts to the bundled default.
  </action>
  <verify>
    <automated>pnpm test 2>&1 | tail -20 && npx tsc --noEmit && pnpm lint && git status --porcelain | grep -v '^?? .planning/phases/40-' | grep -v '^?? .planning/quick/260902-wbd' | wc -l</automated>
  </verify>
  <done>`pnpm test` reports zero failing suites; `tsc --noEmit`, eslint and prettier are all clean; `scanScope()` is measured at 164 files with LoginBackground.tsx present and zero violations; both Login guards pass; the commit contains exactly the fourteen intended files and no planning docs; the SUMMARY states whether human re-test is required and names the gesture.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user filesystem -> backend `getLoginBackground()` | An arbitrary user-chosen path is read from disk and its bytes inlined |
| backend -> renderer (`data:` URL over IPC) | Arbitrary file bytes cross into the WebView as a CSS `background-image` source |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-wbd-01 | Information Disclosure | `getLoginBackground()` in `appshell/themes.ts` | mitigate | Extension allowlist (`LOGIN_BACKGROUND_MIME_BY_EXTENSION`) returns `''` for any non-image extension, so an arbitrary file (e.g. a key or config) cannot be inlined and rendered by mis-picking it. Path is user-chosen locally via a native dialog, never attacker-supplied. |
| T-wbd-02 | Denial of Service | `getLoginBackground()` | accept | A very large image inflates ~4/3 as base64 over IPC. Read once per Login mount, not on any hot path, and the file is chosen by the local user for their own UI. No size cap added; documented in the function's doc comment. |
| T-wbd-03 | Tampering | `.loginBackground` inline style in `Login/index.tsx` | mitigate | The value is interpolated into `url("...")` only when non-empty and originates from a backend-built `data:<allowlisted-mime>;base64,` prefix — the renderer never interpolates a raw user path. Unreadable/missing/unknown-extension all collapse to `''`, which falls back to the bundled artwork. |
| T-wbd-SC | Tampering | package-manager installs | n/a | No new dependencies are added by this task. No legitimacy gate required. |
</threat_model>

<verification>
- Full `pnpm test`: 0 failing suites (baseline 377/377 suites, 7541 passed)
- `npx jest --selectProjects Meta`: fully green (note `--selectProjects` is case-sensitive and can exit 0 on a typo — confirm the suite count is non-zero)
- `npx tsc --noEmit` clean; eslint at or below the 4148 baseline against the 4157 ceiling; prettier clean on every changed file
- `meta/i18nGateAllowlist.json` NO diff; `public/locales/en/translation.json` NO diff; de/fr `gamelib.json` NO diff
- Non-vacuity: `scanScope()` measured at 164 files, not 163
- `src/frontend/screens/Login/__tests__/index.test.tsx` and `loginCrossfade.test.ts` both green
- `meta/i18nGateScope.json` provenance fields byte-identical
- Commit contains exactly fourteen files; `.planning/phases/40-.../` still untracked
</verification>

<success_criteria>
A user can open Settings -> General, pick an image file for "Manage Accounts background", and see it
render behind the Login screen; clearing the field reverts to the bundled artwork. The blocking
hardcoded-string gate now scans 164 files including the new component, with the ratchet test's
eleven live count pins moved and its four history lines untouched. Whole-project test, typecheck,
lint and prettier state is no worse than the pre-change baseline.
</success_criteria>

<output>
Create `.planning/quick/260902-wbd-port-login-background-setting-from-stash/260902-wbd-SUMMARY.md` when done.
</output>
