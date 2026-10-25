---
phase: quick-261026-ctm
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/shortcuts/shortcuts/shortcuts.ts
  - src/backend/shortcuts/ipc_handler.ts
  - src/backend/sidecar/shortcutsFlowRegistration.ts
  - src/backend/shortcuts/__tests__/addShortcutsOutcome.test.ts
  - src/backend/shortcuts/__tests__/removeShortcutsOutcome.test.ts
  - src/backend/shortcuts/__tests__/shortcutsExistsFallback.test.ts
autonomous: true
requirements: [QUICK-261026-ctm]

must_haves:
  truths:
    - "On macOS with addDesktopShortcuts on, adding a shortcut produces exactly ONE generated bundle (~/Applications/<title>.app) and a symlink ~/Desktop/<title>.app pointing at it, so macOS Apps lists the game once"
    - "With addDesktopShortcuts on, the Applications bundle is written even on an install-time add with addStartMenuShortcuts off"
    - "If the Applications bundle write fails, no Desktop link is created and the Desktop path is reported as failed in the same rejection"
    - "A legacy real Desktop bundle from 261026-clh, or a stale/dangling link, is replaced by the link on the next add"
    - "Remove deletes the Desktop link without following it and deletes the Applications bundle separately; a dangling link and a legacy real bundle are both removed"
    - "A dangling Desktop link with no Applications bundle counts as 'shortcut exists', so the menu offers Remove and the user can clean it up"
  artifacts:
    - path: "src/backend/shortcuts/shortcuts/shortcuts.ts"
      provides: "darwin Desktop symlink creation, shortcutPathPresent helper"
      contains: "symlink"
      exports: ["addShortcuts", "removeShortcuts", "shortcutFiles", "shortcutPathPresent"]
  key_links:
    - from: "src/backend/sidecar/shortcutsFlowRegistration.ts"
      to: "shortcutPathPresent"
      via: "shortcutsExistOnDisk"
      pattern: "shortcutPathPresent\\(desktopFile"
    - from: "src/backend/shortcuts/ipc_handler.ts"
      to: "shortcutPathPresent"
      via: "shortcutsExistOnDisk"
      pattern: "shortcutPathPresent\\(desktopFile"
---

<objective>
Follow-up to quick 261026-clh. On macOS the opt-in Desktop shortcut becomes a symlink
`~/Desktop/<title>.app -> ~/Applications/<title>.app` instead of a second generated bundle, so
macOS Apps no longer lists the game twice (observed live for Avernum 6).

Purpose: one bundle per game on darwin; Desktop item is a Finder link with the target's icon.
Output: updated `shortcuts.ts` darwin add/remove/docblocks, an lstat-aware existence helper used by
both exists checks, and darwin unit tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/261026-clh-macos-opt-in-desktop-shortcut-via-adddes/261026-clh-SUMMARY.md
@src/backend/shortcuts/shortcuts/shortcuts.ts
@src/backend/shortcuts/__tests__/addShortcutsOutcome.test.ts
@src/backend/shortcuts/__tests__/removeShortcutsOutcome.test.ts
@src/backend/shortcuts/__tests__/shortcutsExistsFallback.test.ts

<interfaces>
From src/backend/shortcuts/shortcuts/shortcuts.ts (current, after 261026-clh):
- `shortcutFiles(title)` darwin: `[join(userHome,'Desktop',`${t}.app`), join(userHome,'Applications',`${t}.app`)]` = `[desktopFile, menuFile]`.
- `addShortcuts(game, fromMenu?)` darwin branch (lines ~136-148): menu bundle when `addStartMenuShortcuts || fromMenu`; a second `generateMacOsApp(gameInfo, desktopFile)` when `addDesktopShortcuts`. Both via local `recordWrite(file, write)` which logs and pushes `${file}: ${message}` onto `failures`; non-empty `failures` rejects with `Could not write shortcuts: ...`.
- `removeShortcuts(game)` isMac branch (lines ~193-206): `rm(file, { recursive: true, force: true })` on desktopFile then menuFile via local `removeFile`.
- imports already present: `rm, unlink, writeFile` from 'fs/promises'; `existsSync, ...` from 'graceful-fs'.
- `src/backend/shortcuts/ipc_handler.ts:40` and `src/backend/sidecar/shortcutsFlowRegistration.ts:137` both: `return existsSync(desktopFile ?? '') || existsSync(menuFile ?? '')`. The sidecar file must keep importing only from `../shortcuts/shortcuts/shortcuts` (never ipc_handler) — it already does.

Measured fact (Node 22.23.4, this Mac): `fs/promises.rm(link, { recursive: true, force: true })` on a
symlink to a directory removes the LINK and leaves the target directory intact; on a dangling link it
removes the link without error. So the existing remove code already satisfies "does not follow / handles
dangling"; this plan proves it with tests and does not need to rewrite it.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: darwin Desktop item is a symlink to the Applications bundle (add + remove)</name>
  <files>src/backend/shortcuts/shortcuts/shortcuts.ts, src/backend/shortcuts/__tests__/addShortcutsOutcome.test.ts, src/backend/shortcuts/__tests__/removeShortcutsOutcome.test.ts</files>
  <behavior>
    addShortcutsOutcome.test.ts, `describe('addShortcuts on darwin (261026-clh)')` — rename to `(261026-clh, 261026-ctm)` and keep the existing afterEach cleanup (rmSync with force on both paths removes a link without following, so it is safe):
    - Keep: 'shortcutFiles returns distinct Desktop and Applications .app paths'; 'menu add with the Desktop toggle off writes Applications only'; 'install add with both toggles off writes nothing and resolves'.
    - Replace 'menu add with the Desktop toggle on writes both, with the same URL' with: menu add, Desktop on -> `lstatSync(desktopApp).isSymbolicLink()` is true, `readlinkSync(desktopApp) === menuApp`, `readFileSync(runSh(menuApp))` contains the URL, and `readFileSync(runSh(desktopApp))` (through the link) contains the same URL.
    - Replace 'install add with only the Desktop toggle on writes the Desktop copy only' with: install add (no fromMenu), addDesktopShortcuts true, addStartMenuShortcuts false -> Applications bundle run.sh exists AND Desktop is a symlink to it.
    - New: legacy real bundle — pre-create `desktopApp/Contents/MacOS/run.sh` as a real directory tree, then menu add with Desktop on -> Desktop is now a symlink to menuApp.
    - New: dangling link — `symlinkSync(join(homedir(),'Applications','gone-261026-ctm.app'), desktopApp)` (mkdir the Desktop dir first), then add -> Desktop is a symlink whose readlink is menuApp.
    - Replace 'a failed Desktop write rejects naming the path, and the Applications copy is still written': keep the same setup (~/Desktop replaced by a regular file) and expectations (rejects naming desktopApp, `runSh(menuApp)` exists).
    - New: failed Applications write — make `dirname(menuApp)` (~/Applications) a regular file (rm it first, restore in finally like the Desktop case), Desktop on, menu add -> rejects with a message containing BOTH menuApp and desktopApp, and `lstatSync(desktopApp)` throws ENOENT (no link created).
    removeShortcutsOutcome.test.ts, darwin describe:
    - Keep the 261012-ca6 case and both 261026-clh cases (a legacy real Desktop bundle must still be removed).
    - New '261026-ctm removing the Desktop link does not follow it': create the menu bundle tree, `symlinkSync(menuFile, desktopFile)`; spy is not needed — instead assert the ordering-independent invariant: after `removeShortcuts`, `lstatSync(desktopFile)` throws ENOENT and `existsSync(menuFile)` is false, and with a SECOND variant that only removes the link: call the module's removal on a fixture where the link target lives OUTSIDE the computed menuFile (e.g. `join(homedir(),'Applications','261026-ctm Other.app')` with a run.sh) — after `removeShortcuts`, the link is gone and the other target's run.sh still exists. Clean the other target up in the test.
    - New '261026-ctm a dangling Desktop link is removed and nothing is logged': symlink to a nonexistent path; after remove, lstat throws ENOENT and `mockLogError` not called.
    All fixtures go through the existing `containedPaths(title)` / `shortcutFiles` paths under the jest containment `homedir()`; never write outside it.
  </behavior>
  <action>
    Write the tests above first and run them RED (new symlink assertions must fail against the two-bundle code; the remove cases may already pass — that is expected per the measured `rm` fact and should be noted in the SUMMARY, not forced red).

    Then in `shortcuts.ts`:
    1. Imports: add `symlink`, `mkdir` (and `lstat` only if used) from 'fs/promises'; add `dirname` from 'path'.
    2. darwin branch of `addShortcuts` (per locked decisions): write the Applications bundle via `recordWrite(menuFile, () => generateMacOsApp(gameInfo, menuFile))` when `addStartMenuShortcuts || fromMenu || addDesktopShortcuts`. Track whether that write succeeded (e.g. compare `failures.length` before/after, or have recordWrite return a boolean — returning boolean is fine and does not change linux/win32 callers that ignore it). Then if `addDesktopShortcuts`: if the Applications write failed, call `recordWrite(desktopFile, ...)` with a write that throws `new Error(`not linked: ${menuFile} was not written`)` so the Desktop is reported in the same rejection; otherwise `recordWrite(desktopFile, () => linkDesktopToApplications(desktopFile, menuFile))`.
    3. New private async `linkDesktopToApplications(link, target)`: `await mkdir(dirname(link), { recursive: true })` (generateMacOsApp used to create ~/Desktop implicitly; keep that), then `await rm(link, { recursive: true, force: true })` to clear whatever sits there — a legacy real bundle from 261026-clh, a stale link, or a dangling link (`rm` is lstat-based: it removes a link itself, never its target, and handles a dangling one) — then `await symlink(target, link)` with the absolute target. Plain `fs.symlink`, no osascript/Finder alias (locked decision).
    4. `generateMacOsApp`: update its leading comment — it is now generated once, into ~/Applications only; drop "once per destination". Keep the `appShortcut` parameter.
    5. Docblock of `addShortcuts`: macOS writes one .app in ~/Applications (start menu / menu add, or whenever addDesktopShortcuts is on) and, when addDesktopShortcuts is on, a symlink on ~/Desktop to that bundle so macOS Apps lists it once. Update the darwin case comment likewise.
    6. `removeShortcuts` isMac branch: keep the `rm(file, { recursive: true, force: true })` loop (desktopFile first, then menuFile). Rewrite its comment: the Desktop item is a symlink (or a legacy real bundle from 261026-clh); `rm` removes the link itself without following it, so the Applications bundle is only deleted by its own entry; a dangling link is removed too.
    No new i18n strings; do not touch toast text.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/shortcuts/__tests__/addShortcutsOutcome.test.ts src/backend/shortcuts/__tests__/removeShortcutsOutcome.test.ts && npx tsc --noEmit -p . && npx prettier --check src/backend/shortcuts/shortcuts/shortcuts.ts src/backend/shortcuts/__tests__/addShortcutsOutcome.test.ts src/backend/shortcuts/__tests__/removeShortcutsOutcome.test.ts</automated>
  </verify>
  <done>All darwin add/remove cases pass, including symlink target, install-time Applications write, legacy-bundle and dangling-link replacement, Applications-failure-means-no-link, non-following link removal; tsc and scoped prettier clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: lstat-aware existence check so a dangling Desktop link still offers Remove</name>
  <files>src/backend/shortcuts/shortcuts/shortcuts.ts, src/backend/shortcuts/ipc_handler.ts, src/backend/sidecar/shortcutsFlowRegistration.ts, src/backend/shortcuts/__tests__/shortcutsExistsFallback.test.ts</files>
  <behavior>
    shortcutsExistsFallback.test.ts, `describe('261026-clh: shortcutsExists on darwin')`:
    - Existing 'resolves true when only the ~/Desktop .app exists' and the 260905-mv5 no-regression case stay green unchanged (existsSync is still consulted first, through the graceful-fs mock).
    - New '261026-ctm resolves true for a dangling Desktop link with no Applications bundle': mocked existsSync returns false for everything; create a real dangling symlink at `shortcutFiles('261026-ctm Dangling')[0]` under the containment home (mkdir its dirname, symlink to a nonexistent `.app`), handler resolves true; remove the link in a finally.
    - New 'resolves false when neither path exists nor is a link' (existsSync false, nothing on disk).
  </behavior>
  <action>
    Decision (Claude's discretion, record it in the SUMMARY): a dangling Desktop link counts as present, so the game menu shows "Remove shortcut" and the user can clear it; `removeShortcuts` already deletes dangling links (Task 1). Treating it as absent would leave an unremovable broken item on the Desktop until the next Add.

    1. In `shortcuts.ts` export `shortcutPathPresent(file: string): boolean` = `existsSync(file) || isSymbolicLink(file)`, where the link check is `lstatSync(file).isSymbolicLink()` inside try/catch returning false on any error. Import `lstatSync` from 'graceful-fs' alongside the existing names (keep `existsSync` from graceful-fs so the existing tests' graceful-fs mock still governs the first arm). Short docblock stating the dangling-link reason.
    2. `ipc_handler.ts` `shortcutsExistOnDisk` and `sidecar/shortcutsFlowRegistration.ts` `shortcutsExistOnDisk`: replace `existsSync(desktopFile ?? '') || existsSync(menuFile ?? '')` with `shortcutPathPresent(desktopFile ?? '') || shortcutPathPresent(menuFile ?? '')`, importing it from the module path each file already uses for `shortcutFiles`. Remove the now-unused `existsSync` import only if nothing else in that file uses it (grep first). The sidecar must keep its import graph: import from `../shortcuts/shortcuts/shortcuts` only, never from `shortcuts/ipc_handler`.
    3. Extend the existing comment on `shortcutPathPresent` callers minimally (one line) referencing 261026-ctm.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/shortcuts src/backend/sidecar/__tests__/shortcutsFlows.test.ts && npx tsc --noEmit -p . && npx prettier --check src/backend/shortcuts/shortcuts/shortcuts.ts src/backend/shortcuts/ipc_handler.ts src/backend/sidecar/shortcutsFlowRegistration.ts src/backend/shortcuts/__tests__/shortcutsExistsFallback.test.ts</automated>
  </verify>
  <done>Both exists checks use shortcutPathPresent; dangling-link case resolves true, empty case false; all shortcuts and sidecar shortcutsFlows tests pass; tsc and scoped prettier clean; no artifacts left in the real ~/Desktop or ~/Applications (check `ls ~/Desktop ~/Applications | grep -i 261026` is empty).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| game title -> filesystem path | title is sanitized by `sanitize-filename` in `shortcutFiles` before becoming a Desktop/Applications path |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ctm-01 | Tampering | removeShortcuts / linkDesktopToApplications `rm` on the Desktop path | mitigate | `fs/promises.rm` is lstat-based and never follows a link (measured); Task 1 test proves a link whose target lies outside menuFile leaves the target intact |
| T-ctm-02 | Tampering | path traversal via title | accept | unchanged: `sanitize-filename` already strips separators; link target is the computed menuFile, never user input |
| T-ctm-03 | Information disclosure | tests writing to the real home | mitigate | all fixtures under jest containment `homedir()` (existing `containedPaths` guard); Task 2 done-check greps real ~/Desktop and ~/Applications |
</threat_model>

<verification>
- `npx jest src/backend/shortcuts src/backend/sidecar` green except the known pre-existing `testContainment.test.ts` failure noted in 261026-clh.
- `npx tsc --noEmit -p .` clean.
- Scoped prettier on all six paths clean (all are prettier-visible `.ts` files).
</verification>

<success_criteria>
- darwin add with Desktop on yields one bundle plus a Desktop symlink to it; macOS Apps would list the game once.
- Legacy Desktop bundle and dangling link replaced; Applications failure blocks the link and reports both paths.
- Remove never deletes through the link; dangling Desktop link is detected and removable.
- Pending operator gate (record in SUMMARY): restart `pnpm tauri:dev` (check sidecar.js mtime), Add shortcut on Avernum 6 with the Desktop toggle on: `~/Desktop/Avernum 6.app` becomes a Finder link (arrow badge) replacing the existing real bundle; macOS Apps shows Avernum 6 once; Remove deletes both.
</success_criteria>

<output>
Create `.planning/quick/261026-ctm-macos-desktop-shortcut-is-a-symlink-to-t/261026-ctm-SUMMARY.md` when done
</output>
