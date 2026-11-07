---
phase: quick-261108-cut
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - meta/indexedAccessBaseline.json
  - meta/indexedAccessRatchet.cjs
  - src/backend/storeManagers/gog/games.ts
  - src/backend/storeManagers/gog/library.ts
  - src/backend/storeManagers/gog/setup.ts
  - src/backend/storeManagers/gog/__tests__/library.test.ts
  - .planning/todos/pending/2026-11-07-nouncheckedindexedaccess-remaining-buckets.md
autonomous: true
requirements:
  - todo-2026-11-07-nouncheckedindexedaccess-remaining-buckets

must_haves:
  truths:
    - "`node meta/indexedAccessRatchet.cjs` exits 0 on the final commit"
    - "Every file under src/backend/storeManagers/gog/ (tests included) type-checks with noUncheckedIndexedAccess on: the bucket is 0 and is listed in ADOPTED_BUCKETS"
    - "No gog site was fixed with a non-null `!` or a widening cast; each was narrowed with an explicit check, early return/throw, or default"
    - "The gog jest suites pass unchanged, so behaviour for valid inputs did not change"
    - "The baseline drift on main (engine, scanners, sidecar, testUtils, screens, tools, wiki_game_info) is reconciled in its own commit, with no drift site edited"
  artifacts:
    - path: "meta/indexedAccessRatchet.cjs"
      provides: "ADOPTED_BUCKETS includes src/backend/storeManagers/gog"
      contains: "'src/backend/storeManagers/gog'"
    - path: "meta/indexedAccessBaseline.json"
      provides: "Baseline without the gog key, with drift reconciled"
  key_links:
    - from: "meta/indexedAccessRatchet.cjs ADOPTED_BUCKETS"
      to: "meta/indexedAccessBaseline.json"
      via: "adopted bucket must be 0 and absent from baseline"
      pattern: "storeManagers/gog"
---

<objective>
Adopt `noUncheckedIndexedAccess` for the `src/backend/storeManagers/gog` bucket (the first of the
four untrusted-data buckets named in the remaining-buckets todo), mirroring quick 261107-9lq.

The ratchet is already red on main from drift landed by phase 63/65 after the baseline was
committed. Orchestrator decision: reconcile that drift by hand in a separate first commit (numbers
only, no drift sites edited), so the gog commit's verify can run green.

Output: two commits. (1) baseline drift reconciliation; (2) gog bucket to 0 + ADOPTED_BUCKETS +
baseline key removed + todo list updated.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@meta/indexedAccessRatchet.cjs
@meta/indexedAccessBaseline.json
@.planning/todos/pending/2026-11-07-nouncheckedindexedaccess-remaining-buckets.md
@.planning/quick/261107-9lq-measure-then-adopt-nouncheckedindexedacc/261107-9lq-SUMMARY.md

Load `Skill("gamelib-conventions")` before writing commits: the `<verify>` prettier rule and the
todo-frontmatter rule both apply here.

Ratchet facts (from its header): ADOPTED_BUCKETS must be at 0 and absent from the baseline; every
other bucket is an EQUALITY ceiling (growth fails, new bucket fails, and a count below baseline
fails with "lower X to N"). There is no --update flag: numbers move by hand.
`node meta/indexedAccessRatchet.cjs --list <prefix>` prints the sites for a bucket. The gog bucket
is NOT split into tests/non-tests (only steam is), so gog tests are in scope.

Repo commands: typecheck is `pnpm codecheck` (`tsc --noEmit && tsc -p tsconfig.meta.json
--noEmit`); jest is `npx jest <path>`; ratchet is `pnpm typecheck:indexed-access`.

Measured gog sites at planning time (33; baseline says 34 — re-list at execution time):

- games.ts:316 TS2322 — `etaMatch[1]` in the ETA regex parse (string | undefined to string).
- games.ts:790 TS2345 — `const [bin, ...args] = redModCommand` then `spawnAsync(bin, ...)`.
- games.ts:1040/1042/1050/1052/1093/1094 TS18048 — `uninstall()`: `const [object] =
  array.splice(index, 1)` after an index === -1 throw.
- games.ts:1309–1340, 1356 TS18048/TS2322 — `update()`: `const gameObject =
  installedArray[gameIndex]` from a findIndex with no -1 check; then many field writes and
  `gameData.install = gameObject`.
- library.ts:84 TS2322 — `applyGogMacArch`: `stored[idx] = { ...stored[idx], mac_arch }` inside
  `idx > -1`.
- library.ts:187 TS18048 — `const url = currentBuild.urls[0]` then `url.url` (remote GOG builds
  JSON — untrusted).
- library.ts:842/843 TS2532 — `libraryArray[gameObjectIndex].folder_name = ...` after both
  findIndex -1 checks return.
- library.ts:866/871/877/882 TS2538 — `gogInfo.size[language]` / `dlc.size[language]` where
  `language = gogInfo.languages[0]` (undefined index key; untrusted gogdl info JSON).
- library.ts:971 TS2532 — `changeGameInstallPath`: `installedArray[gameIndex].install_path =`
  from a findIndex with no -1 check.
- library.ts:1306 TS2345 — `acc.push(matcher[1])` on `/goggame-(\d+)\.info/`.
- setup.ts:53 TS2322 — `const [exe, ...args] = wineArgs.commandParts` passed as `-FilePath` arg.
- __tests__/library.test.ts:392/403 TS2532 — `installedArray[0].install_path` in expects.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Reconcile baseline drift on main (own commit)</name>
  <files>meta/indexedAccessBaseline.json</files>
  <action>
Run `node meta/indexedAccessRatchet.cjs` and read the FAIL lines. Re-measure; do not trust the
planning numbers. At planning time they were: new bucket `src/backend/engine` 45, new bucket
`src/backend/scanners` 3, `src/backend/sidecar` 149 to 155, `src/backend/testUtils` 3 to 11,
`src/frontend/screens` 335 to 351, `src/backend/tools` 121 to 120, `src/backend/wiki_game_info` 7
to 6.

Edit `meta/indexedAccessBaseline.json` by hand so every non-adopted bucket equals its measured
count: add the new keys, keeping the file's alphabetical key order and two-space JSON formatting.
Raise grown buckets and lower shrunk ones. Leave the gog key (34 or whatever it measures) as it is
unless the ratchet reports it below baseline; in that case lower it to the measured count so this
commit is green on its own.

Do NOT edit any drift site in source (out of scope, orchestrator decision). Do not touch
ADOPTED_BUCKETS. Do not edit the todo in this commit; the drift is recorded in Task 2's todo update.

Commit alone: `chore(quick-261108-cut): reconcile indexed-access baseline drift from phases 63/65`,
with a body listing each bucket's old and new number.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && node meta/indexedAccessRatchet.cjs && node -e "JSON.parse(require('fs').readFileSync('meta/indexedAccessBaseline.json','utf8'))" && npx prettier --file-info meta/indexedAccessBaseline.json && npx prettier --check meta/indexedAccessBaseline.json</automated>
  </verify>
  <done>Ratchet exits 0 on a commit that changes only meta/indexedAccessBaseline.json. No source file changed.</done>
</task>

<task type="auto">
  <name>Task 2: Fix the gog bucket to 0, adopt it, update the todo (one commit)</name>
  <files>src/backend/storeManagers/gog/games.ts, src/backend/storeManagers/gog/library.ts, src/backend/storeManagers/gog/setup.ts, src/backend/storeManagers/gog/__tests__/library.test.ts, meta/indexedAccessRatchet.cjs, meta/indexedAccessBaseline.json, .planning/todos/pending/2026-11-07-nouncheckedindexedaccess-remaining-buckets.md</files>
  <action>
Re-list with `node meta/indexedAccessRatchet.cjs --list src/backend/storeManagers/gog` and fix
every site. Rules: never a non-null `!`, never a widening `as` cast, never change behaviour for
valid inputs. For untrusted JSON (GOG API / gogdl output) prefer a logged skip/early return or a
throw over inventing data. Pre-existing `!` elsewhere in these files (e.g. library.ts around 838)
is not a ratchet site; leave it.

Per-site guidance (adapt if lines moved):

- games.ts ETA parse (~316): use `etaMatch?.[1] ?? ''` (the existing fallback is already '').
- games.ts redMod spawn (~790): after destructuring, if `bin` is undefined throw an Error naming
  the empty redMod command (the array is built literally just above, so it never fires for valid
  input). Same pattern for setup.ts (~53) `exe` from `wineArgs.commandParts`: throw / return a
  rejected error naming the empty command rather than spawning powershell with no file.
- games.ts `uninstall()` (~1039): `object` from `array.splice(index, 1)` after the -1 throw; add
  `if (!object) throw Error("Game isn't installed")` (same message as the existing guard) right
  after the splice, so all six downstream uses narrow.
- games.ts `update()` (~1288): `gameObject = installedArray[gameIndex]` has no -1 check today
  (a missing entry currently crashes with a TypeError). Add a guard right after it: if
  `!gameObject`, `logError` naming `this.id` not found in installed store, send the same
  `sendGameStatusUpdate({ appName: this.id, runner: 'gog', status: 'done' })` the error branch
  above uses, and `return { status: 'error' }`. This covers 1309–1340 and the 1356 assignment.
- library.ts `applyGogMacArch` (~84): read `const entry = stored[idx]` and guard on `entry`
  instead of `idx > -1` for the write (keep the `idx` used by the later `base` expression valid,
  or switch it to `entry` too — same semantics).
- library.ts current-build URL (~185): `const url = currentBuild.urls[0]`; if `!url`, log the same
  "Unable to get current build of ${appName}" error path used by the `!currentBuild.urls` guard
  just above and return the same way it does (read that block and mirror its return value).
- library.ts `getInstallInfo` (~842): after both -1 checks, bind `const libraryEntry =
  libraryArray[gameObjectIndex]`; if undefined, `logWarning` with the existing "not found in
  libraryStore" message and `return`; then write `libraryEntry.folder_name` /
  `libraryEntry.gog_save_location`. The `libraryArray[gameObjectIndex]?.gog_save_location` read at
  ~832 may use `libraryEntry` too if bound earlier.
- library.ts size sums (~849–883): `language = gogInfo.languages[0]` may be undefined for
  malformed gogdl info. Keep `language` typed `string | undefined` and index with
  `language !== undefined ? gogInfo.size[language]?.download_size : undefined` (and the same for
  `dlc.size`, `disk_size`). Do not default `language` to an invented code like 'en-US' — that
  would change which depot is summed. Check later uses of `language` in the function still type
  (if one requires a string, narrow there with an explicit check, not a fabricated default).
- library.ts `changeGameInstallPath` (~971): bind `const installedEntry =
  installedArray[gameIndex]` BEFORE any mutation; if undefined, `logError` naming appName not in
  installed store and `return` (today this crashes). Then assign `installedEntry.install_path`.
- library.ts goggame info scan (~1306): `if (matcher?.[1]) acc.push(matcher[1])` (bind the group
  to a const so it narrows).
- __tests__/library.test.ts (~392, ~403): replace `installedArray[0].install_path` with
  `installedArray[0]?.install_path` inside the `expect(...)` — the `toBe` assertion still fails
  loudly if the entry is missing.

Then in `meta/indexedAccessRatchet.cjs` set `ADOPTED_BUCKETS = ['src/backend/storeManagers/steam',
'src/backend/storeManagers/gog']`, and delete the `"src/backend/storeManagers/gog"` key from
`meta/indexedAccessBaseline.json`. If `meta/__tests__/indexedAccessRatchet.test.ts` asserts the
exact ADOPTED_BUCKETS contents, update that assertion too (add it to the commit); otherwise leave
the test alone.

Update `.planning/todos/pending/2026-11-07-nouncheckedindexedaccess-remaining-buckets.md` (stays
in pending/; keep the `severity: minor` / `platform: any` / `ready: code` frontmatter lines
byte-identical, in that order): in the Problem paragraph state that `storeManagers/gog` (tests
included) was adopted in quick 261108-cut; remove the gog line from the list; replace the list
numbers with the post-Task-1 baseline values (add `src/backend/engine` and `src/backend/scanners`,
correct sidecar/testUtils/screens/tools/wiki_game_info and steam (tests) to match the JSON), keep
largest-first ordering, and fix the "(N in all)" total to the sum of the baseline. Add a short
note under Problem that phases 63/65 grew engine, scanners, sidecar, testUtils and screens after
the baseline landed and that the baseline was raised to match in quick 261108-cut (drift sites
not fixed — candidates for their own buckets).

Commit once: `refactor(quick-261108-cut): adopt noUncheckedIndexedAccess for storeManagers/gog`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && node meta/indexedAccessRatchet.cjs && ! node meta/indexedAccessRatchet.cjs --list src/backend/storeManagers/gog | grep -q '^src/backend/storeManagers/gog/' && pnpm codecheck && npx jest src/backend/storeManagers/gog meta/__tests__/indexedAccessRatchet.test.ts && npx eslint src/backend/storeManagers/gog/games.ts src/backend/storeManagers/gog/library.ts src/backend/storeManagers/gog/setup.ts src/backend/storeManagers/gog/__tests__/library.test.ts meta/indexedAccessRatchet.cjs && ! git diff "$(git log -1 --format=%H --grep='reconcile indexed-access baseline')" -- src/backend/storeManagers/gog | grep '^+' | grep -v '^+++' | grep -q '[A-Za-z0-9_)\]]!\($\|[.;,)\[ ]\)' && pnpm planning-gates && npx prettier --file-info src/backend/storeManagers/gog/games.ts src/backend/storeManagers/gog/library.ts src/backend/storeManagers/gog/setup.ts src/backend/storeManagers/gog/__tests__/library.test.ts meta/indexedAccessRatchet.cjs meta/indexedAccessBaseline.json .planning/todos/pending/2026-11-07-nouncheckedindexedaccess-remaining-buckets.md && npx prettier --check src/backend/storeManagers/gog/games.ts src/backend/storeManagers/gog/library.ts src/backend/storeManagers/gog/setup.ts src/backend/storeManagers/gog/__tests__/library.test.ts meta/indexedAccessRatchet.cjs meta/indexedAccessBaseline.json .planning/todos/pending/2026-11-07-nouncheckedindexedaccess-remaining-buckets.md</automated>
  </verify>
  <done>
Ratchet exits 0 with gog in ADOPTED_BUCKETS and absent from the baseline; `--list` shows no gog
sites; `pnpm codecheck` passes; gog jest suites and the ratchet test pass; eslint clean on touched
files; no added non-null `!` in the gog diff; todo still in pending/ with intact triage
frontmatter and `pnpm planning-gates` green; prettier check passes on the exact paths (if
`--file-info` shows a path is ignored, note it in the SUMMARY and drop it from the check).
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| GOG API / gogdl stdout -> library.ts | Builds list, gogdl info JSON (languages, size maps, urls) are untrusted remote data |
| installed/library electron-store -> games.ts, library.ts | Persisted JSON may be stale or missing an entry |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261108-01 | Denial of Service | library.ts currentBuild.urls[0], languages[0] | mitigate | Explicit undefined checks: log + early return on missing URL; skip language-depot size when no language, no invented default |
| T-261108-02 | Tampering | games.ts update()/uninstall(), library.ts changeGameInstallPath | mitigate | Guard missing store entries before mutation; return error status / throw instead of crashing mid-write |
| T-261108-03 | Elevation of Privilege | setup.ts / games.ts spawn with empty command | mitigate | Throw on undefined executable before invoking powershell RunAs / spawnAsync |
</threat_model>

<verification>
- `node meta/indexedAccessRatchet.cjs` exits 0 after each commit.
- `pnpm codecheck` passes.
- `npx jest src/backend/storeManagers/gog` passes.
- Two commits: baseline-only reconciliation, then the gog adoption.
</verification>

<success_criteria>
- gog bucket at 0 and listed in ADOPTED_BUCKETS; its key gone from the baseline.
- Baseline drift reconciled with zero drift-site edits.
- No `!` or widening casts introduced; valid-input behaviour unchanged (tests green).
- Todo updated in place with accurate remaining list and total.
</success_criteria>

<output>
Create `.planning/quick/261108-cut-adopt-nouncheckedindexedaccess-for-store/261108-cut-SUMMARY.md` when done.
</output>
