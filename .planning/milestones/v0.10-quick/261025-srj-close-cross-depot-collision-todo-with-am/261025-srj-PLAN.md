---
phase: quick-261025-srj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/todos/pending/2026-10-22-unresolved-cross-depot-file-collisions-leave-install-stuck-at-1026.md
  - .planning/todos/completed/2026-10-22-unresolved-cross-depot-file-collisions-leave-install-stuck-at-1026.md
  - .planning/todos/pending/2026-10-25-depot-selection-ignores-realm-steamdeck-and-optional-depot-config.md
  - .planning/todos/pending/2026-10-25-case-only-cross-depot-path-collisions-are-not-detected.md
  - .planning/quick/261025-srj-close-cross-depot-collision-todo-with-am/261025-srj-SUMMARY.md
autonomous: true
requirements: [QUICK-261025-SRJ]

must_haves:
  truths:
    - "The cross-depot collision todo records the Amnesia 57300 real-Steam evidence and is no longer in pending/"
    - "The todo lives in completed/ under its original filename, moved with git mv so history follows it"
    - "Two new pending todos exist (depot config keys; case-only collisions), each passing the todo frontmatter gate"
    - "No file under src/ is changed"
  artifacts:
    - path: ".planning/todos/completed/2026-10-22-unresolved-cross-depot-file-collisions-leave-install-stuck-at-1026.md"
      provides: "Closed todo with '## Rule confirmed 2026-10-25 (Amnesia 57300)' section and status: RESOLVED line"
      contains: "## Rule confirmed 2026-10-25 (Amnesia 57300)"
    - path: ".planning/todos/pending/2026-10-25-depot-selection-ignores-realm-steamdeck-and-optional-depot-config.md"
      provides: "Todo A: select.ts ignores config.realm / config.steamdeck / optional"
      contains: "severity: major"
    - path: ".planning/todos/pending/2026-10-25-case-only-cross-depot-path-collisions-are-not-detected.md"
      provides: "Todo B: pathCollisions.ts keys paths case-sensitively"
      contains: "severity: medium"
  key_links:
    - from: "todo A files:"
      to: "src/backend/storeManagers/steam/depot/select.ts"
      via: "frontmatter files list"
      pattern: "depot/select.ts"
    - from: "todo B files:"
      to: "src/backend/storeManagers/steam/depot/pathCollisions.ts"
      via: "frontmatter files list"
      pattern: "depot/pathCollisions.ts"
---

<objective>
Close the cross-depot collision todo with the Amnesia: The Dark Descent (57300) real-Steam
evidence, move it to `completed/`, and file two follow-up todos found by the library-wide
manifest scan. This is docs-only work: `.planning/todos/` plus this quick dir's SUMMARY. Nothing
under `src/` changes.

Purpose: the todo's remaining item 2 ("rule confirmation from a second collided title") is now
satisfied. The scan also surfaced two real defects that must not be lost when the scratchpad
expires.
Output: one todo moved and amended, two new pending todos, and a SUMMARY.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/todos/pending/2026-10-22-unresolved-cross-depot-file-collisions-leave-install-stuck-at-1026.md

Load `Skill("gamelib-conventions")` before writing (todo frontmatter rule, and the `<verify>`
formatter rule).

Facts established at plan time (recorded here so the executor does not re-derive them):

- **Completed-todo convention:** closed todos keep their original frontmatter keys and add one
  `status:` line after `ready:`, a double-quoted string beginning `RESOLVED <date> by ...`.
  Example from `completed/2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md`:
  `status: "RESOLVED 2026-10-25 by quick 261025-rkj (items 1 and 3) after 261025-mfz (item 2). ..."`.
  Close commits are titled `chore(quick-<id>): close todo`.
- **Gate scope:** `.planning/todos/todo-frontmatter-gate.py` (run by `pnpm planning-gates`)
  checks `pending/` ONLY. Its docstring says this is deliberate. It must still pass after the
  move (pending/ stays non-empty), and the two new todos must pass it.
- **Formatter rule:** every path this plan writes is prettier-ignored. Measured at plan time:
  `npx prettier --file-info` on the `completed/` target path and on this quick dir's SUMMARY path
  each printed `{ "ignored": true, "inferredParser": null }`, and the previous quick plan
  (261025-rd0) measured the same for `pending/`. A `--check` over these paths is vacuous. The
  verify blocks therefore assert `ignored: true` per file and omit `--check`. `--file-info`
  accepts one file per call, so loop over the files. Hand-match the corpus instead: wrap near 100
  columns, same key order.
- **Working tree:** at plan time `git status` showed no `src/` modifications. Only
  `.planning/quick/261025-rkj-bridge-first-launch-steam-shared-redists/` is untracked. Do NOT
  stage or commit that directory. Stage only the paths named in each task.
- Pending todo frontmatter shape, in this key order:
  `created`, `title` (double-quoted), `source`, `area`, `files` (list), `severity`, `platform`,
  `ready`. The last three are bare and lowercase. Vocabulary: severity
  critical|major|medium|minor; platform macos|windows|linux|any; ready
  code|live-gate|human|blocked.
- Code facts, checked at plan time:
  `src/backend/storeManagers/steam/depot/select.ts` filters `cfg.oslist` (~L186),
  `cfg.osarch` (~L195) and `cfg.language` (~L204). It has no `realm` or `steamdeck` handling, and
  its ~L8 comment says it deliberately does not filter on `dlcappid` / `optional` /
  `systemdefined`. `src/backend/storeManagers/steam/depot/pathCollisions.ts` has
  `normalizePath` at ~L65, which only swaps `\` for `/`, and keys the collision map with it at
  ~L106. `verifyStructuralIntegrity` is in `src/backend/storeManagers/steam/depot/reconcile.ts`
  (~L290).

Session evidence (record as written, do not re-derive):

E1. Library-wide manifest scan, 2026-10-25 07:06–07:29. It was a scratchpad script reusing
GameLib's `selectAllDepots`, `withAppInfoOrderCapture` and `decryptFilename`. Manifests only,
English, windows for every game plus macos for Mac-native ones. 385 games, 0 fatal; 11 games had
some depot fetch errors (503 / AccessDenied / Blocked / one timeout). For exact-name, same-owner,
ranked real-file collisions it computed each candidate rule's winner. Fourteen titles have
collisions where appinfo order disagrees with both lowest-id and later-gid: Darkwood, Pillars of
Eternity (mac), Once Human, XCOM 2, Borderlands 2, Rogue Empire, ASKA, ARK, Mass Effect, The
Witcher EE, Oblivion GOTY, Amnesia (mac), Book of Unwritten Tales (mac). XCOM 200510's 11 files
were classified ao=lowest, ao=laterGid, ao≠highestId. The scan artefacts (`results.json`,
`rows.json` under the session scratchpad `collision-scan/full/`) are ephemeral and are NOT copied
into the repo. Say so in the todo.

E2. Amnesia: The Dark Descent (57300), macOS, `config/pre_menu.cfg`:
- Depot 57301 (base, rank 1, manifest 8176595565127463406) claims 1579 bytes, sha1
  `83f8309e1372…`.
- Depot 57303 (oslist macos, rank 2, manifest 7774437381089252368) claims 1657 bytes, sha1
  `26cd3979f9d5…`.
- Rule winners: appinfoOrder=57303, highestId=57303, lowestId=57301, laterGid=57301.
- The operator installed it with native Mac Steam (`/Applications/Steam.app`), not GameLib, at
  about 20:39 on 2026-10-25. The game was not launched before the check.
- `appmanifest_57300.acf`: StateFlags 4, buildid 12590639. InstalledDepots lists 57301 (manifest
  8176595565127463406) and 57303 (manifest 7774437381089252368). Both were installed together, so
  the collision is real.
- On disk, `config/pre_menu.cfg` is 1657 bytes with sha1 `26cd3979f9d5…`, which is depot 57303's
  claim.

E3. Conclusion. In XCOM, real Steam kept 200522, which is appinfo order = lowest id = later gid,
≠ highest id. In Amnesia, real Steam kept 57303, which is appinfo order = highest id, ≠ lowest id,
≠ later gid. Only "later in the app's appinfo depot order wins" fits both. Caveat (state it, do
not overclaim): in Amnesia the winner is also the more platform-specific depot, so Amnesia alone
does not exclude "the more specific depot config wins". XCOM's two claimants had equal
specificity (both dlcappid 225340, no language/os), and the later one won, which is consistent
with appinfo order.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Record the Amnesia rule confirmation and move the todo to completed/</name>
  <files>.planning/todos/pending/2026-10-22-unresolved-cross-depot-file-collisions-leave-install-stuck-at-1026.md -> .planning/todos/completed/2026-10-22-unresolved-cross-depot-file-collisions-leave-install-stuck-at-1026.md</files>
  <action>
First run `git mv` to move the file from `pending/` to `completed/` with the filename unchanged,
so history follows it. Then edit the moved file.

(a) Frontmatter: leave every existing key and value unchanged, including `ready: live-gate`.
Add one line directly after `ready:`, following the completed-todo convention:
`status: "RESOLVED 2026-10-25 by quick 261025-srj. Live gate passed on XCOM 200510 (item 1, quick 261025-rd0); winner rule confirmed against real Steam on Amnesia 57300 (item 2)."`

(b) Insert a new section `## Rule confirmed 2026-10-25 (Amnesia 57300)` between the existing
`## Live gate passed 2026-10-25` section and the `**Remaining before this can close:**` block.
Use bullets wrapped near 100 columns, matching the earlier sections, and include:
- **Scan:** E1 in full: window, method, coverage, error counts, the fourteen titles where appinfo
  order disagrees with both lowest-id and later-gid, and the XCOM classification. State that the
  scan artefacts were in the session scratchpad only and were not kept.
- **Amnesia evidence:** all of E2: both depot claims with rank, manifest, size and sha1 prefix;
  the four rule winners; the install route (native Mac Steam, not GameLib, game not launched); the
  ACF StateFlags, buildid and InstalledDepots with both manifests; and the on-disk size and sha1
  matching 57303.
- **Verdict:** E3. The rule GameLib implements ("later in the app's appinfo depot order wins")
  is the only candidate consistent with both XCOM and Amnesia. Include the specificity caveat
  verbatim in substance: Amnesia alone does not exclude "the more specific depot config wins",
  and XCOM's equal-specificity pair is consistent with appinfo order.
- **Follow-ups filed:** name the two new todo filenames from Task 2.

(c) In the Remaining list, strike item 2 the same way item 1 is struck (wrap the item text in
`~~ ~~`, then add `— **done 2026-10-25**, see Rule confirmed 2026-10-25 (Amnesia 57300)`).
Remove the trailing `**Still open.**` from inside the struck text.

Do not edit any other part of the body. Commit only this rename and edit, as
`chore(quick-261025-srj): close todo`, with the attribution trailer.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && N=2026-10-22-unresolved-cross-depot-file-collisions-leave-install-stuck-at-1026.md && F=.planning/todos/completed/$N && test ! -e .planning/todos/pending/$N && test -f "$F" && sed -n '2,/^---$/p' "$F" | grep -Eq '^status: "RESOLVED 2026-10-25 by quick 261025-srj' && grep -q '^## Rule confirmed 2026-10-25 (Amnesia 57300)$' "$F" && grep -q '26cd3979f9d5' "$F" && grep -q '83f8309e1372' "$F" && grep -q '12590639' "$F" && grep -q '7774437381089252368' "$F" && grep -q '8176595565127463406' "$F" && grep -qi 'more specific' "$F" && grep -Eq '^2\. ~~.*~~ — \*\*done 2026-10-25\*\*' "$F" && ! grep -q 'Still open' "$F" && git log -1 --follow --diff-filter=R --name-status --format= -- "$F" | grep -q "^R" && npx prettier --file-info "$F" | grep -Eq '"ignored":[[:space:]]*true' && pnpm planning-gates && test -z "$(git diff --name-only HEAD -- src)" && test -z "$(git show --name-only --format= HEAD -- src)"</automated>
    Formatter note: the only path written is under `.planning/`, which prettier ignores
    (`--file-info` asserted above), so `npx prettier --check` is omitted as vacuous per
    gamelib-conventions rather than carried as a green that proves nothing. The rename check
    runs after the commit. The last two clauses assert that nothing under `src/` is changed in the
    tree or in the commit.
  </verify>
  <done>The todo is in completed/ (git-recorded rename, same filename). It carries the status: RESOLVED line and a "## Rule confirmed 2026-10-25 (Amnesia 57300)" section with all E1–E3 facts and the caveat. Items 1 and 2 are both struck as done. pnpm planning-gates passes and src/ is untouched.</done>
</task>

<task type="auto">
  <name>Task 2: File the depot-config-keys and case-only-collision todos</name>
  <files>.planning/todos/pending/2026-10-25-depot-selection-ignores-realm-steamdeck-and-optional-depot-config.md, .planning/todos/pending/2026-10-25-case-only-cross-depot-path-collisions-are-not-detected.md</files>
  <action>
Create two todos in `pending/` with the frontmatter shape and key order given in context:
created, title (double-quoted), source, area, files, severity, platform, ready. Wrap bodies near
100 columns. Put a fix direction last in each body.

**Todo A** `2026-10-25-depot-selection-ignores-realm-steamdeck-and-optional-depot-config.md`:
- Frontmatter: created 2026-10-25; title along the lines of "Depot selection ignores config.realm,
  config.steamdeck and optional, so GameLib downloads depots real Steam skips (Once Human: ~129 GB
  extra)"; source "quick 261025-srj library-wide manifest scan (2026-10-25)"; area
  steam-depot-download; files `src/backend/storeManagers/steam/depot/select.ts`;
  `severity: major`, `platform: any`, `ready: code`.
- Body: `select.ts` filters oslist/osarch/language but has no `config.realm` or
  `config.steamdeck` handling. Its ~L8 comment says it deliberately does not filter on
  `optional`. Then the evidence:
  - Once Human (2139460) selects both 2139461 (`realm: steamglobal`, 128.72 GB) and 2139463
    (`realm: steamchina`, 128.71 GB). That is about 129 GB of extra download plus 77 cross-depot
    collisions.
  - ASKA (1898300) selects 1898302 (`oslist windows,linux`, `steamdeck: 1`) alongside 1898301.
  - The Witcher EE (20900) depot 20902 and Oblivion GOTY (22330) depot 22333 are `optional: 1`
    DLC depots that GameLib selects.
- Open question: should `optional` be excluded by default? Steam likely installs optional DLC
  depots only when they are enabled in the game's properties. Mark this as likely behaviour,
  unverified.
- Note that the scan data was ephemeral (session scratchpad) and was not kept.

**Todo B** `2026-10-25-case-only-cross-depot-path-collisions-are-not-detected.md`:
- Frontmatter: created 2026-10-25; title along the lines of "Case-only cross-depot path
  collisions are not detected, so two claims to one file on a case-insensitive volume are both
  verified strictly"; source as in A; area steam-depot-download; files
  `src/backend/storeManagers/steam/depot/pathCollisions.ts` and
  `src/backend/storeManagers/steam/depot/reconcile.ts`; `severity: medium`, `platform: any`,
  `ready: code`.
- Body: `pathCollisions.ts` keys paths case-sensitively (`normalizePath` only swaps `\` for `/`).
  macOS volumes, and the Wine bottles that sit on them, are normally case-insensitive APFS. So two
  depots that ship the same path in different case write one file, and both claims are verified
  strictly. Give the count, 255 differing collisions of this shape in the scan, with the examples:
  - Wasteland 3 (719040), macos, 198 collisions, e.g. `WL3.app/.../24044905.wem` in depot 719042
    (owner 719040, 10355 bytes) vs `wl3.app/...` in depot 1522651 (owner 1522650, 19564 bytes).
    This pair is also cross-owner.
  - Californium (402060), macos, 53 collisions, e.g.
    `californium.app/Contents/Resources/Data/level2` in 402062 (61884 bytes) vs
    `Californium.app/...` in 402064 (61924 bytes).
  - Civilization V (8930), windows, 4 collisions, e.g.
    `Assets/Gameplay/XML/NewText/EN_US/CIV5GameTextInfos_MapMeso.xml` in 8933 (365 bytes) vs
    `.../en_US/...` in 16863 (371 bytes).
- Likely consequence, unverified live: post-download structural re-verification
  (`verifyStructuralIntegrity`) fails closed to StateFlags=1026, the same symptom as the
  just-closed todo (link it by its completed/ path).
- Fix direction: detect collisions on a case-folded key. The appinfo-order winner rule then needs
  that same key, and cross-owner pairs fall back to the existing UNRESOLVED path. After the fix,
  run a live gate on Californium or Civ V.
- Note that the scan data was ephemeral.

Commit both files only, as `docs(quick-261025-srj): file depot-config-keys and case-only collision todos`,
with the attribution trailer. Then write
`.planning/quick/261025-srj-close-cross-depot-collision-todo-with-am/261025-srj-SUMMARY.md` and
commit it separately. Do not stage the untracked 261025-rkj quick dir.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && A=.planning/todos/pending/2026-10-25-depot-selection-ignores-realm-steamdeck-and-optional-depot-config.md && B=.planning/todos/pending/2026-10-25-case-only-cross-depot-path-collisions-are-not-detected.md && grep -A2 '^severity: major$' "$A" | tr '\n' ' ' | grep -q 'severity: major platform: any ready: code' && grep -A2 '^severity: medium$' "$B" | tr '\n' ' ' | grep -q 'severity: medium platform: any ready: code' && grep -q 'depot/select.ts' "$A" && grep -q 'steamchina' "$A" && grep -q '1898302' "$A" && grep -q '22333' "$A" && grep -qi 'unverified' "$A" && grep -q 'depot/pathCollisions.ts' "$B" && grep -q '255' "$B" && grep -q '1522651' "$B" && grep -q '402064' "$B" && grep -q '16863' "$B" && grep -q 'completed/2026-10-22-unresolved-cross-depot-file-collisions' "$B" && for f in "$A" "$B" .planning/quick/261025-srj-close-cross-depot-collision-todo-with-am/261025-srj-SUMMARY.md; do test -f "$f" && npx prettier --file-info "$f" | grep -Eq '"ignored":[[:space:]]*true' || exit 1; done && pnpm planning-gates && test -z "$(git diff --name-only HEAD -- src)" && test -z "$(git log --name-only --format= HEAD~3..HEAD -- src)" && ! git ls-files --error-unmatch .planning/quick/261025-rkj-bridge-first-launch-steam-shared-redists >/dev/null 2>&1</automated>
    Formatter note: all three paths are under `.planning/`, which prettier ignores (`--file-info`
    asserted per file above), so `npx prettier --check` is omitted as vacuous per
    gamelib-conventions. The final clauses assert that nothing under `src/` changed in the tree or
    in this task's three commits, and that the unrelated rkj quick dir was not committed.
  </verify>
  <done>Both new todos are in pending/ with severity/platform/ready in order, using the gate vocabulary. files: point at select.ts and at pathCollisions.ts / reconcile.ts. Bodies carry the scan evidence and flag the unverified parts as unverified. The SUMMARY is written. pnpm planning-gates passes and src/ is untouched.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none | Docs-only change to planning markdown; no runtime code, input or secrets involved |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261025-srj-01 | Repudiation | closed todo record | mitigate | git mv keeps rename history; status line names the quick task and evidence sections |
| T-261025-srj-02 | Tampering | unrelated untracked rkj quick dir | mitigate | stage explicit paths only; verify asserts rkj dir is not tracked |
</threat_model>

<verification>
- `pnpm planning-gates` passes, and the todo frontmatter gate still finds a non-empty pending/.
- The closed todo is in completed/ only, with a recorded rename.
- `git diff --name-only HEAD -- src` is empty, and no commit from this task touches src/.
</verification>

<success_criteria>
- The cross-depot collision todo is closed with the Amnesia evidence and the caveat recorded, not overclaimed.
- Two new triaged todos capture the realm/steamdeck/optional and case-only collision defects, with all scan evidence.
- Docs-only: no source changes.
</success_criteria>

<output>
Create `.planning/quick/261025-srj-close-cross-depot-collision-todo-with-am/261025-srj-SUMMARY.md` when done
</output>
