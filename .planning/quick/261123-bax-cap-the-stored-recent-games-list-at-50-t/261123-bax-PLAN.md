---
phase: quick-261123-bax
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/crates/gamelib-info/src/recent.rs
  - src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/cases.json
  - src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/sixty-entry-list/after/store/config.json
  - src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/sixty-entry-list/events.json
  - src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/sixty-entry-list/result.json
  - src-tauri/crates/gamelib-info/tests/golden_recent.rs
  - .planning/todos/pending/2026-11-22-recent-games-list-is-unbounded.md
  - .planning/todos/completed/2026-11-22-recent-games-list-is-unbounded.md
autonomous: true
requirements:
  - "quick:261123-bax"
  - "todo:2026-11-22-recent-games-list-is-unbounded"

estimate:
  tokens: 55000
  raw_tokens: 55000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "Adding a new game to a stored list of 50 leaves 50 entries: the new game first, the 49 newest old entries behind it in their old order, and the oldest entry gone. The file on disk, `info_recent_list` and the `recentGamesChanged` sink payload all carry the same 50"
    - "Re-adding a game that is already in a full list of 50 keeps 50 entries. The game moves to the head and no other entry is dropped"
    - "Below the cap nothing is dropped: 49 entries plus a new game give 50, and the oldest is still there"
    - "`list` and `remove` never trim. A stored list of 60 reads back as 60 with no write, and a remove leaves 59. The next add trims it to 50"
    - "The `sixty-entry-list` golden expects 50 entries (app1, then app100 to app148), derived by hand from the cap rule and the case's before-state. cases.json and the harness doc say it is hand-derived and not a TS recording. The other 10 recent golden cases are unchanged and still pass byte-exact"
    - "The todo is in `.planning/todos/completed/` and records the operator's 2026-11-23 ruling (cap at 50, trim on add, history beyond 50 dropped at the next add, Library 'Recently played' shows at most 50: accepted) and the resolution, with the code commit SHAs"
    - "Each commit holds only this task's paths. None of the unrelated dirty or untracked files (the GOG-offline work, `.planning/state.json`, spike logs, the concurrent 261123-bbi quick task's files) is staged or committed"
  artifacts:
    - path: "src-tauri/crates/gamelib-info/src/recent.rs"
      provides: "the MAX_STORED (50) cap, applied in `add` after the game is put first and before `write`. The module doc records the change from the TS original as an operator ruling"
      contains: "list.truncate(MAX_STORED)"
    - path: "src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/cases.json"
      provides: "the sixty-entry-list note: capped at 50, hand-derived from the rule"
      contains: "hand-derived"
    - path: "src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/sixty-entry-list/after/store/config.json"
      provides: "byte-exact after-state with a 50-entry games.recent; every other key, including the __internal__ stamp, unchanged"
    - path: "src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/sixty-entry-list/events.json"
      provides: "one recentGamesChanged payload of the same 50 entries"
    - path: "src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/sixty-entry-list/result.json"
      provides: "recent = the same 50 entries, writes = 1"
    - path: "src-tauri/crates/gamelib-info/tests/golden_recent.rs"
      provides: "four cap tests (full plus new, re-add in full, below the cap, oversized list untrimmed by list and remove until the next add) and the hand-derived provenance note"
      contains: "a_full_list_plus_a_new_game_keeps_fifty_and_drops_the_oldest"
    - path: ".planning/todos/completed/2026-11-22-recent-games-list-is-unbounded.md"
      provides: "the closed todo with Ruling and Resolution sections"
      contains: "## Resolution"
  key_links:
    - from: "src-tauri/crates/gamelib-info/tests/golden_recent.rs"
      to: "src-tauri/crates/gamelib-info/src/recent.rs"
      via: "dispatch_sync(\"info_recent_add\") -> recent::add -> retain, insert(0), truncate(MAX_STORED) -> write -> RecentSink::changed. The golden compares the disk bytes, the sink payloads and recent::list"
      pattern: "info_recent_add"
    - from: "src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/cases.json"
      to: "src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/sixty-entry-list/after/store/config.json"
      via: "every_golden_case_matches_the_ts_bytes_and_payloads runs the case's ops over state/recent/sixty-entry-list and compares the whole after/ tree byte for byte"
      pattern: "sixty-entry-list"
---

<objective>
Close the todo `.planning/todos/pending/2026-11-22-recent-games-list-is-unbounded.md` as the operator ruled on 2026-11-23: the stored recent-games list (`games.recent` in `store/config.json`) is capped at 50, and it is trimmed on add.

The operator ruled, and accepted these consequences:
- Cap 50, trimmed by `recent::add`. History beyond 50 is dropped the next time `add` writes. That cannot be undone, and the operator accepted it.
- Trim on add only. `list` does not trim: a list an older build stored longer than 50 reads back as stored until the next add. `remove` does not trim either, because a remove never grows the list.
- The Library's "Recently played" view (`src/frontend/screens/Library/filterEngine.ts`, `passesView` case `'recentlyPlayed'`, which calls `deps.recentAppNames.includes`) shows every stored entry. After the cap it shows at most 50. The operator accepted this.

Only Rust changes. The TS original `src/backend/recent_games/recent_games.ts` was deleted in 86-09, and the TS oracle harness and recorder in 86-24. Nothing can re-record a golden from TS. That is not a loss here: the TS was unbounded, so a recording would contradict the ruling. The `sixty-entry-list` golden is therefore re-derived by hand from the new rule and the case's before-state, and it is labelled as hand-derived. It is NOT generated by running the Rust code it is meant to check.

Purpose: a long-lived profile no longer carries every game it has ever launched.
Output: three commits. Task 1 holds the cap and the re-derived golden (5 paths). Task 2 holds the boundary tests (1 path). Task 3 moves the todo to completed/ with its ruling and resolution. Then the SUMMARY.

Not the executor's job: committing the SUMMARY, PLAN or STATE.md belongs to the orchestrator's Step 8 docs commit. The todo move IS this plan's job (the orchestrator asked for it, and Step 8's file list does not include it). It is committed in Task 3.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/todos/pending/2026-11-22-recent-games-list-is-unbounded.md
@src-tauri/crates/gamelib-info/src/recent.rs
@src-tauri/crates/gamelib-info/tests/golden_recent.rs

Facts measured at plan time (HEAD `73c354d89`):
- `recent::add` (src-tauri/crates/gamelib-info/src/recent.rs, line 120) validates the args, takes the module Mutex and opens the store. It reads the list, runs `retain(keeps)`, builds the `{appName, title, runner}` entry, calls `insert(0, ...)`, then `write`, which sets the key and then calls `RecentSink::changed` with the list it wrote. The module doc's first parity-quirk bullet (line 8) is the one about the list's length. It is the only line in the file that mentions length.
- Golden harness (`src-tauri/crates/gamelib-info/tests/golden_recent.rs`). Each case in `tests/fixtures/golden/recent/cases.json` runs its ops through `dispatch_sync` over a FakeHome copy of `tests/fixtures/state/recent/<id>/`. Then three comparisons follow. The whole `after/` tree is compared byte for byte. `events.json` is compared as parsed JSON against what the sink recorded. `result.json` (`recent`, `writes`) is compared as parsed JSON against `recent::list` and the sink count. MANIFEST.json is `{count: 11, floor: 9}` and does not change, because no case is added or removed.
- `sixty-entry-list`: the before-state `tests/fixtures/state/recent/sixty-entry-list/store/config.json` holds 60 entries, app100 to app159, newest first, with the keys theme, zoomPercent, hideTitles and games, and no `__internal__`. The one op adds `{app_name: app1, title: "Game 1", runner: sideload}`, which is not in the list. The current expected files hold 61 entries: app1, then app100 to app159. The after config also carries `"__internal__": {"gamelib": {"schemaVersion": 1}}`, which the StoreHost stamps on a real write.
- Byte format, measured. `after/store/config.json` round-trips byte for byte through Python `json.dumps(obj, indent='\t', ensure_ascii=False)`, with no trailing newline. `events.json` and `result.json` round-trip through `json.dumps(obj, indent=2, ensure_ascii=False) + '\n'`. Derived from the rule, `[app1 entry] + before[:49]` equals the first 50 entries of the current golden list (True at plan time). The dropped tail is app149 to app159, which is 11 entries.
- Provenance: commit `37f4a1c61` (86-04) wrote these goldens from the TS with hand-authored cases and a synthetic before-state. The oracle that wrote them (`src/backend/info/__tests__/oracle/`) was deleted in 86-24. `src/backend/__tests__/infoPortComplete.test.ts` asserts that the `golden/recent` dir and its MANIFEST survive. `src-tauri/src/info_dispatch.rs` tests read the goldens add-to-populated-list, remove-present-game and add-over-empty-appname-entry only, never sixty-entry-list, so the shell tests do not need a re-run.
- Baselines. `cargo test -p gamelib-info --features testing --test golden_recent`: 8 passed. `--lib recent::`: 3 passed. `cargo clippy -p gamelib-info --all-targets -- -D warnings`: clean. `cargo fmt -p gamelib-info --check`: exit 0. jest over `src/backend/info/__tests__/fixtureRedaction.test.ts` and `src/backend/__tests__/infoPortComplete.test.ts`: 209 passed. `pnpm planning-gates`: 12/12.
- Formatter (gamelib-conventions, the `<verify>` rule): no path in this plan is one prettier checks. `npx prettier --file-info` reports `"ignored": true` for cases.json, the three expected files and the completed todo path (`.prettierignore` line 50 covers `src-tauri/crates/gamelib-info/tests/fixtures`, and `.planning` is ignored). For the two `.rs` files it reports `"inferredParser": null`, and `npx prettier --check` on a `.rs` path exits 2 with "No parser could be inferred". So no task carries `npx prettier --check`. The Rust formatter gate is `cargo fmt -p gamelib-info --check`, and each verify block asserts the prettier state so that a change to it surfaces.
</context>

<dirty_tree_protocol>
The working tree holds unrelated uncommitted work that must not be touched: the GOG-offline hunks in `src/backend/cache.ts`, `src/backend/storeManagers/gog/library.ts`, `src/backend/sidecar/handlers.ts` and others, plus `.planning/state.json`, spike logs, debug files and an untracked `.dxvk-cache`. A concurrent quick task, `261123-bbi`, may also be editing and committing in this tree. None of this plan's paths is dirty at plan time, and the index is empty.

Rules for every commit in this plan:
1. Stage by exact path only: `git add -- <path> ...` (and `git mv` in Task 3). Never `git add -A`, `git add .`, `git commit -a`, `git commit -- <pathspec>`, `git stash`, `git checkout`/`git restore` on any path you did not write, and never the gsd-tools `commit` helper, which sweeps every dirty `.planning` file unless `--files` scopes it.
2. Before `git commit`, check that `git diff --cached --name-only` is exactly this task's path list. If anything else is staged (for example by the concurrent session), do not commit. Stop and report it.
3. After the commit, check the commit's file list. If another session committed in between, use the SHA your own `git commit` printed instead of `HEAD`.
4. End each commit message with the attribution lines from your session's system-reminder.
</dirty_tree_protocol>

<tasks>

<!-- planner-discipline-allow: truncate( -->

<task type="tracer">
  <name>Task 1 (tracer): cap `recent::add` at 50 and re-derive the sixty-entry-list golden from the rule</name>
  <files>src-tauri/crates/gamelib-info/src/recent.rs, src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/cases.json, src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/sixty-entry-list/after/store/config.json, src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/sixty-entry-list/events.json, src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/sixty-entry-list/result.json</files>
  <precondition>`git status --porcelain -- src-tauri/crates/gamelib-info .planning/todos/pending/2026-11-22-recent-games-list-is-unbounded.md` prints nothing, and `git diff --cached --name-only` prints nothing.</precondition>
  <reversibility rating="one-way">On a user's profile, the first add after this ships deletes stored play history beyond 50. The operator settled this in the 2026-11-23 ruling, with the loss stated, so no new checkpoint is inserted.</reversibility>
  <read_first>
    - src-tauri/crates/gamelib-info/src/recent.rs (whole file, 199 lines: module doc lines 1-17, consts lines 29-34, `add` with its doc comment lines 118-135)
    - src-tauri/crates/gamelib-info/tests/golden_recent.rs lines 1-5 and 218-280 (what the golden compares, and how)
    - src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/cases.json lines 133-148 (the sixty-entry-list case)
    - .claude/skills/gamelib-conventions/SKILL.md, section "A formatter check belongs in every task's `<verify>`"
  </read_first>
  <action>
This task is the end-to-end slice. One add goes through the real dispatcher into the store file and the sink, and the byte-exact golden proves it. Work RED first: the golden changes before the code does.

Step 1, re-derive the golden by hand (the RED). Write a short Python script in your session's scratchpad directory, NOT in the repo, and run it with `python3 -I`, passing the repo paths as arguments. Do not generate the expected files by running the Rust code: a golden written by the code under test proves nothing. The script does four things:
(a) Round-trip guard. Load each of the three expected files under `tests/fixtures/golden/recent/expected/sixty-entry-list/`. Assert that re-serialising the unmodified object reproduces the file's bytes exactly: tab indent with no trailing newline for `after/store/config.json`, and 2-space indent plus one trailing newline for `events.json` and `result.json`, both with `ensure_ascii=False`. If any file fails the round-trip, stop and report it, because the script could not then vouch for its bytes.
(b) Derive the new list from the before-state and the rule alone. Take the entry `{appName: app1, title: "Game 1", runner: sideload}` (keys in that order). Assert it is absent from the before list `tests/fixtures/state/recent/sixty-entry-list/store/config.json` `games.recent` (60 entries). The result is that entry followed by the first 49 before entries: 50 entries, app1, then app100 to app148.
(c) Cross-check. The derived list must equal the first 50 entries of the current golden list, and the dropped tail must be exactly app149 to app159.
(d) Write. In `after/store/config.json`, replace only `games.recent`, keeping every other key, the key order and the `__internal__` stamp. In `events.json`, replace only `[0].args[0]`; the channel stays `recentGamesChanged`. In `result.json`, replace only `recent`; `writes` stays 1. Use the same serialisation the round-trip guard proved.

Then edit the `sixty-entry-list` `note` in cases.json (one line, Edit tool, 4-space indent as now, plain ASCII). Say that the stored list is capped at 50 on add (operator ruling 2026-11-23, quick 261123-bax), so 60 entries plus a new game become 50 and the 11 oldest are dropped. Say that the expected files are hand-derived from that rule and the before-state, not recorded from the TS, because the TS original never trimmed and its oracle was deleted in 86-24. Keep the case id, its op, MANIFEST.json and the state folder unchanged.

Run the golden test and record the RED for the SUMMARY: `every_golden_case_matches_the_ts_bytes_and_payloads` must fail on `sixty-entry-list` with `store/config.json` differing (61 entries written against 50 expected).

Step 2, the cap, in src-tauri/crates/gamelib-info/src/recent.rs:
- Next to `STORE_ROW` and `LIST_KEY`, add a private `const MAX_STORED: usize = 50;`. Its doc comment says it is the most entries `add` keeps, by operator ruling 2026-11-23 (quick 261123-bax), and that older history is dropped at the next add.
- In `add`, after `list.insert(0, Json::Obj(entry))` and before `write`, call `list.truncate(MAX_STORED)`. The order is load-bearing. `retain` runs first, then `insert`, then the trim. So re-adding a game that is in a full list removes its old entry before the trim, and nothing else goes. The list handed to `write`, and so to the sink, is the trimmed one.
- Do NOT change `list`, `stored`, `remove`, `keeps` or `write`. The ruling is trim on add only (see the objective).
- Doc comments. Extend `add`'s doc to say it then keeps the first `MAX_STORED` entries, dropping the oldest. In the module doc, delete the first parity-quirk bullet, the one about the list's length on line 8. Add a short paragraph after the bullet list recording the change from the TS original: by operator ruling 2026-11-23 (quick 261123-bax), `add` caps the stored list at [`MAX_STORED`] after putting the game first, dropping the oldest entries; `list` and `remove` never trim, so a list stored longer by an older build stays as it is until the next add. Leave the two remaining bullets and the Mutex paragraph as they are.

Step 3: run the verify block. Then stage the five paths by name, check the index (dirty_tree_protocol rule 2), and commit as `fix(quick-261123-bax): cap the stored recent-games list at 50 on add`. The body says: add trims after putting the game first; list and remove do not trim; the sixty-entry-list golden was re-derived by hand from the rule (61 to 50, app149 to app159 dropped). End it with the attribution lines.
  </action>
  <verify>
    <automated>cd src-tauri && cargo test -p gamelib-info --features testing --test golden_recent   # passed count [HEAD=8 EXPECT==8 GUARD MUTATION: the Step 1 golden without the Step 2 cap turns it red, which is this task's RED, recorded in the SUMMARY]</automated>
    <automated>cd src-tauri && cargo test -p gamelib-info --features testing --lib recent::   # passed count, invariant guard [HEAD=3 EXPECT==3 GUARD MUTATION: dropping the falsy-appName arm of keeps() turns keeps_follows_the_ts_filter red]</automated>
    <automated>cd src-tauri && cargo clippy -p gamelib-info --all-targets -- -D warnings && cargo fmt -p gamelib-info --check   # invariant guard: clean and exit 0 at HEAD, must stay so</automated>
    <automated>test "$(python3 -I -c 'import json; d="src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/sixty-entry-list/"; c=json.load(open(d+"after/store/config.json"))["games"]["recent"]; e=json.load(open(d+"events.json"))[0]["args"][0]; r=json.load(open(d+"result.json"))["recent"]; n=[x["appName"] for x in c]; assert c==e==r and n==["app1"]+["app%d" % i for i in range(100,100+len(n)-1)], "bad list"; print(len(n))')" -eq 50   # entries in all three expected files, which agree and run app1, app100.. [HEAD=61 EXPECT==50]</automated>
    <automated>test "$(grep -vE '^[[:space:]]*//' src-tauri/crates/gamelib-info/src/recent.rs | grep -cE 'const MAX_STORED: usize =[[:space:]]+50;')" -ge 1   # [HEAD=0 EXPECT>=1]</automated>
    <automated>test "$(awk '/^pub fn add\(/,/^}/' src-tauri/crates/gamelib-info/src/recent.rs | grep -vE '^[[:space:]]*//' | grep -c 'list.truncate(MAX_STORED)')" -ge 1   # the trim is inside add [HEAD=0 EXPECT>=1]</automated>
    <automated>test "$(awk '/^pub fn add\(/,/^}/{next} {print}' src-tauri/crates/gamelib-info/src/recent.rs | grep -vE '^[[:space:]]*//' | grep -c 'truncate(')" -eq 0   # region-scoped: no trim anywhere outside add, so list and remove stay untrimmed (doc and line comments filtered) [HEAD=0 EXPECT==0 GUARD MUTATION: a trim added to remove or list turns it red]</automated>
    <automated>test "$(grep -c 'nothing trims it' src-tauri/crates/gamelib-info/src/recent.rs)" -eq 0   # the length bullet is gone [HEAD=1 EXPECT==0]</automated>
    <automated>test "$(grep -c '261123-bax' src-tauri/crates/gamelib-info/src/recent.rs)" -ge 1   # the ruling is recorded [HEAD=0 EXPECT>=1]</automated>
    <automated>test "$(grep -c '60 entries become 61' src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/cases.json)" -eq 0   # [HEAD=1 EXPECT==0]</automated>
    <automated>test "$(grep -c 'hand-derived' src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/cases.json)" -ge 1 && python3 -I -c 'import json; json.load(open("src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/cases.json"))'   # and cases.json still parses [HEAD=0 EXPECT>=1]</automated>
    <automated>pnpm exec jest --runTestsByPath src/backend/info/__tests__/fixtureRedaction.test.ts src/backend/__tests__/infoPortComplete.test.ts   # the golden dir survives and the fixtures pass the redaction scan; passed count, invariant guard [HEAD=209 EXPECT==209 GUARD MUTATION: deleting golden/recent/MANIFEST.json turns infoPortComplete red]</automated>
    <automated>for f in src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/cases.json src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/sixty-entry-list/after/store/config.json src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/sixty-entry-list/events.json src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/sixty-entry-list/result.json; do I=$(npx prettier --file-info "$f") || exit 1; printf '%s\n' "$I" | grep -Eq '"ignored":[[:space:]]*true' || { echo "not ignored: $f"; exit 1; }; done && I=$(npx prettier --file-info src-tauri/crates/gamelib-info/src/recent.rs) && printf '%s\n' "$I" | grep -Eq '"inferredParser":[[:space:]]*null'   # invariant guard [HEAD=present EXPECT==present GUARD MUTATION: removing the gamelib-info fixtures line from .prettierignore turns it red]: prettier ignores the four fixture paths and has no parser for .rs, so no prettier --check is carried; cargo fmt above is the formatter gate</automated>
    <automated>N=$(git diff --cached --name-only) && test "$(printf '%s\n' "$N" | LC_ALL=C sort | tr '\n' ' ')" = "src-tauri/crates/gamelib-info/src/recent.rs src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/cases.json src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/sixty-entry-list/after/store/config.json src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/sixty-entry-list/events.json src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/sixty-entry-list/result.json "   # run BEFORE git commit: the index holds exactly the five paths [HEAD=absent EXPECT==present] (the index is empty at plan time)</automated>
    <automated>N=$(git show --name-only --format= HEAD) && test "$(printf '%s\n' "$N" | LC_ALL=C sort | tr '\n' ' ')" = "src-tauri/crates/gamelib-info/src/recent.rs src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/cases.json src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/sixty-entry-list/after/store/config.json src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/sixty-entry-list/events.json src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/sixty-entry-list/result.json "   # AFTER the commit; use the SHA git commit printed in place of HEAD if another session committed since [HEAD=absent EXPECT==present]</automated>
  </verify>
  <done>The golden test went RED on sixty-entry-list before the code change and is green after: 8 passed, with all 11 cases byte-exact. `add` trims to 50 after putting the game first, and `list` and `remove` are unchanged. The three expected files hold the same 50 entries (app1, then app100 to app148), derived by hand and labelled so in cases.json. Clippy, fmt and the two jest suites are green. One commit holds exactly the five paths.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: pin the cap at its boundaries (full plus new, re-add in full, below the cap, oversized list untouched until an add)</name>
  <files>src-tauri/crates/gamelib-info/tests/golden_recent.rs</files>
  <read_first>
    - src-tauri/crates/gamelib-info/tests/golden_recent.rs (whole file: `profile`, `tree`, `fixtures`, the Recording sink, and `adding_the_same_game_twice_leaves_one_entry_and_identical_bytes` as the model for a non-golden test)
  </read_first>
  <behavior>
    - a_full_list_plus_a_new_game_keeps_fifty_and_drops_the_oldest: seed 50 games g0..g49 through info_recent_add, so the list is g49..g0. Add `new`. The list is 50 long: `new`, then g49..g1, with g0 gone. The last sink payload equals recent::list. `games.recent` parsed from `userData/store/config.json` on disk is 50 long.
    - re_adding_a_game_in_a_full_list_drops_no_other_entry: seed 50. Re-add g10: still 50, g10 first, the others in their old order (g49..g11, g9..g0), and the set of names unchanged. Re-add the oldest, g0: still 50, g0 first, set unchanged.
    - an_add_below_the_cap_drops_nothing: seed 49 (g0..g48), add `new`: 50 entries, and g0 is still last.
    - list_and_remove_leave_an_oversized_list_untrimmed_until_the_next_add: profile seeded from `state/recent/sixty-entry-list`. recent::list gives 60, the userData tree is byte-identical to the before-state, and the sink is empty. Remove app130: 59, and the sink saw one 59-entry payload. Add app1 (title "Game 1", runner sideload): 50 entries, app1 first, and the last sink payload is 50 long.
  </behavior>
  <action>
Add the four tests named in `<behavior>` to golden_recent.rs, below `adding_the_same_game_twice_leaves_one_entry_and_identical_bytes`, using the file's existing helpers (`profile`, `fixtures`, `tree`, the Recording sink).

Add two small helpers. `seed(ctx, n)` calls `dispatch_sync("info_recent_add", ...)` for i in 0..n with `appName` `g{i}`, title `Game {i}` and runner `gog`, so the list ends newest first, g(n-1)..g0. `names(ctx)` returns the `appName`s from `recent::list`.

Assert counts with the literal 50, 49, 59 and 60, not with `MAX_STORED`. That constant is private, and the literals pin the operator's number: changing the cap must fail these tests and be a new ruling. Each test carries a one-line doc comment naming the ruling (quick 261123-bax, trim on add only).

Then extend the file's module doc (lines 1-4) with one sentence. `sixty-entry-list` is the one case that is not a TS recording: it is hand-derived from the 50-entry cap (quick 261123-bax, operator ruling 2026-11-23), because the TS original never trimmed and its oracle was deleted in 86-24; its note in cases.json says so. Do not rename `every_golden_case_matches_the_ts_bytes_and_payloads` or change its assertions.

Mutation check (proves the tests bite, since their RED was spent in Task 1). Run the mutation command in `<verify>`. It changes the cap to 49, runs the suite, expects all four new tests to FAIL, then puts 50 back and asserts recent.rs has no diff. recent.rs is committed and clean after Task 1, so the restore can be checked with `git diff --quiet`. Never use `git checkout` here.

Then run `graphify update .` (AST-only; graphify-out is gitignored, so it adds nothing to commit).

Stage golden_recent.rs by name, check the index, and commit as `test(quick-261123-bax): pin the recent-games cap at its boundaries`. End the message with the attribution lines.
  </action>
  <verify>
    <automated>cd src-tauri && cargo test -p gamelib-info --features testing --test golden_recent   # passed count [HEAD=8 EXPECT==12] (8 after Task 1, plus the four new tests)</automated>
    <automated>test "$(grep -cE 'fn (a_full_list_plus_a_new_game_keeps_fifty_and_drops_the_oldest|re_adding_a_game_in_a_full_list_drops_no_other_entry|an_add_below_the_cap_drops_nothing|list_and_remove_leave_an_oversized_list_untrimmed_until_the_next_add)\(' src-tauri/crates/gamelib-info/tests/golden_recent.rs)" -ge 4   # the four names are distinct, so >=4 means all four [HEAD=0 EXPECT>=4]</automated>
    <automated>test "$(grep -c 'hand-derived' src-tauri/crates/gamelib-info/tests/golden_recent.rs)" -ge 1   # provenance note in the harness doc [HEAD=0 EXPECT>=1]</automated>
    <automated>cd src-tauri && sed -i '' -E 's/(const MAX_STORED: usize =[[:space:]]+)50;/\149;/' crates/gamelib-info/src/recent.rs && grep -qE 'MAX_STORED: usize =[[:space:]]+49;' crates/gamelib-info/src/recent.rs && O=$(cargo test -p gamelib-info --features testing --test golden_recent 2>&1); sed -i '' -E 's/(const MAX_STORED: usize =[[:space:]]+)49;/\150;/' crates/gamelib-info/src/recent.rs && git diff --quiet -- crates/gamelib-info/src/recent.rs && test "$(printf '%s\n' "$O" | grep -cE '^test (a_full_list_plus_a_new_game_keeps_fifty_and_drops_the_oldest|re_adding_a_game_in_a_full_list_drops_no_other_entry|an_add_below_the_cap_drops_nothing|list_and_remove_leave_an_oversized_list_untrimmed_until_the_next_add) \.\.\. FAILED')" -ge 4   # GUARD MUTATION: with the cap at 49 all four new tests FAIL [HEAD=0 EXPECT>=4], and recent.rs is then restored byte for byte (git diff --quiet). Run it before the Task 2 commit, then re-run the first command (12 passed)</automated>
    <automated>cd src-tauri && cargo clippy -p gamelib-info --all-targets -- -D warnings && cargo fmt -p gamelib-info --check   # invariant guard: clean, exit 0</automated>
    <automated>I=$(npx prettier --file-info src-tauri/crates/gamelib-info/tests/golden_recent.rs) && printf '%s\n' "$I" | grep -Eq '"inferredParser":[[:space:]]*null'   # invariant guard [HEAD=present EXPECT==present GUARD MUTATION: a prettier plugin that parses .rs turns it red, and then a prettier --check would be owed]: prettier has no parser for .rs, so no prettier --check is carried; cargo fmt is the formatter gate</automated>
    <automated>N=$(git diff --cached --name-only) && test "$(printf '%s\n' "$N" | tr '\n' ' ')" = "src-tauri/crates/gamelib-info/tests/golden_recent.rs "   # run BEFORE git commit: the index holds exactly this path [HEAD=absent EXPECT==present]</automated>
    <automated>N=$(git show --name-only --format= HEAD) && test "$(printf '%s\n' "$N" | tr '\n' ' ')" = "src-tauri/crates/gamelib-info/tests/golden_recent.rs "   # AFTER the commit; use the SHA git commit printed in place of HEAD if another session committed since [HEAD=absent EXPECT==present]</automated>
  </verify>
  <done>golden_recent has 12 passing tests. The four new ones pin these points: 50 plus a new game gives 50 with the oldest dropped; a re-add in a full list drops nothing else; 49 plus a new game keeps everything; list and remove leave a 60-entry list alone and the next add trims it to 50. Capping at 49 turns all four red, and recent.rs is restored with no diff. The harness doc names sixty-entry-list as hand-derived. One commit holds exactly golden_recent.rs.</done>
</task>

<task type="auto">
  <name>Task 3: move the todo to completed/ with the operator's ruling and the resolution</name>
  <files>.planning/todos/pending/2026-11-22-recent-games-list-is-unbounded.md, .planning/todos/completed/2026-11-22-recent-games-list-is-unbounded.md</files>
  <read_first>
    - .planning/todos/pending/2026-11-22-recent-games-list-is-unbounded.md (whole file)
    - .planning/todos/completed/2026-11-23-pcgw-search-term-not-url-encoded.md, its `## Resolution` section, as the house model (prose wrapped near 120 columns, commit SHAs in backticks)
  </read_first>
  <action>
Run `git mv .planning/todos/pending/2026-11-22-recent-games-list-is-unbounded.md .planning/todos/completed/2026-11-22-recent-games-list-is-unbounded.md`. Leave the frontmatter and the existing Problem, Why it is parked, Fix and Acceptance sections exactly as written; they are the record. Append two sections, wrapping prose near 120 columns to match the file.

`## Ruling`, dated 2026-11-23, from the operator:
- Cap the stored list at 50 and trim on add. History beyond 50 is dropped the next time `recent::add` writes. That deletes play history and cannot be undone, and the operator accepted it.
- Trim on add only. `list` does not trim: a longer list stored by an older build reads back as stored until the next add. `remove` does not trim, because a remove never grows the list.
- The Library's "Recently played" view (`src/frontend/screens/Library/filterEngine.ts`, `passesView` case 'recentlyPlayed', `deps.recentAppNames.includes`) shows every stored entry, so after the cap it shows at most 50. The operator was told this and accepted it.

`## Resolution`: fixed 2026-11-23 in quick task 261123-bax. Cite the Task 1 and Task 2 commit SHAs from `git log` and say:
- `MAX_STORED` (50) is in `recent.rs`.
- `add` runs `retain`, then `insert(0)`, then `truncate`, then `write`, so the sink and the tray get the trimmed list.
- The module doc's length bullet was replaced by the ruling.
- The `sixty-entry-list` golden now expects 50 entries (app1, then app100 to app148; app149 to app159 dropped). It was re-derived by hand from the rule and the before-state, with a serialiser round-trip guard, because the TS original (deleted in 86-09) never trimmed and the oracle that recorded the goldens was deleted in 86-24. cases.json and the harness doc say it is hand-derived.
- The four boundary tests by name.
- The final golden_recent count (12 passed) and the mutation result (a cap of 49 fails all four).
- The tray's display cap (`maxRecentGames`, at most 20) is untouched.

Stage both paths by name (`git mv` already staged the rename; `git add --` the completed path after editing it). Check the index, and commit as `docs(todo): close the recent-games list cap todo (cap 50, trim on add)`. End the message with the attribution lines. Do not stage or commit the SUMMARY, PLAN or STATE.md; that is the orchestrator's Step 8.
  </action>
  <verify>
    <automated>test -f .planning/todos/completed/2026-11-22-recent-games-list-is-unbounded.md && test ! -e .planning/todos/pending/2026-11-22-recent-games-list-is-unbounded.md   # the move [HEAD=absent EXPECT==present] (completed path absent at plan time)</automated>
    <automated>test "$(grep -c '^## Ruling' .planning/todos/completed/2026-11-22-recent-games-list-is-unbounded.md)" -ge 1   # [HEAD=absent EXPECT>=1]</automated>
    <automated>test "$(grep -c '^## Resolution' .planning/todos/completed/2026-11-22-recent-games-list-is-unbounded.md)" -ge 1   # [HEAD=absent EXPECT>=1]</automated>
    <automated>test "$(grep -c '261123-bax' .planning/todos/completed/2026-11-22-recent-games-list-is-unbounded.md)" -ge 1   # [HEAD=absent EXPECT>=1]</automated>
    <automated>test "$(grep -oE '`[0-9a-f]{9}`' .planning/todos/completed/2026-11-22-recent-games-list-is-unbounded.md | sort -u | wc -l)" -ge 2   # distinct 9-char SHAs cited, Task 1 and Task 2 [HEAD=absent EXPECT>=2]</automated>
    <automated>pnpm planning-gates   # gates passed, invariant guard [HEAD=12 EXPECT==12 GUARD MUTATION: a pending todo without ready: turns the todo-frontmatter gate red]</automated>
    <automated>N=$(git diff --cached --name-status --no-renames) && test "$(printf '%s\n' "$N" | LC_ALL=C sort | tr '\t\n' '  ')" = "A .planning/todos/completed/2026-11-22-recent-games-list-is-unbounded.md D .planning/todos/pending/2026-11-22-recent-games-list-is-unbounded.md "   # run BEFORE git commit: the index holds only the rename [HEAD=absent EXPECT==present]</automated>
    <automated>N=$(git show --name-status --no-renames --format= HEAD) && test "$(printf '%s\n' "$N" | LC_ALL=C sort | tr '\t\n' '  ')" = "A .planning/todos/completed/2026-11-22-recent-games-list-is-unbounded.md D .planning/todos/pending/2026-11-22-recent-games-list-is-unbounded.md "   # AFTER the commit; use the SHA git commit printed in place of HEAD if another session committed since [HEAD=absent EXPECT==present]</automated>
    <!-- Formatter: both paths are under .planning, which prettier ignores ("ignored": true measured for the completed path), so npx prettier --check would be vacuous and is omitted. The file is kept consistent by hand-matching its wrap. -->
  </verify>
  <done>The todo is in completed/ (git history keeps the rename), with a Ruling section (cap 50, trim on add, no trim on list or remove, Recently played shows at most 50, history loss accepted) and a Resolution section citing both code commits, the hand-derived golden and the boundary tests. planning-gates is 12/12. One commit holds only the rename.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer/tray -> gamelib-info recent ops | `info_recent_add`/`info_recent_remove` args come from the renderer and from launch shims. They are validated already (zod-mirroring bounds, deny_unknown_fields), and this plan does not change that |
| stored `games.recent` -> every reader | the persisted list is user state, and the cap deletes part of it |
| test evidence -> future readers | one golden is no longer a TS recording; a reader must not mistake it for one |
| executor -> shared working tree | unrelated uncommitted work, plus a possibly concurrent quick task (261123-bbi), in the same tree |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261123-bax-01 | Tampering | recent::add trim (persisted play history) | low | accept | Deleting history beyond 50 is the operator's explicit 2026-11-23 ruling, made with the irreversibility and the Recently-played consequence stated. The trim runs only in `add`, after `retain` and `insert`; list and remove never trim. Task 2's tests pin that no other entry is dropped on a re-add and that nothing is dropped below the cap |
| T-261123-bax-02 | Repudiation | sixty-entry-list golden provenance | medium | mitigate | The golden is derived from the before-state and the rule in a scratchpad script, independent of the Rust code. A byte round-trip guard runs before any write, and the result is cross-checked against the old golden's first 50 entries. It is labelled hand-derived in cases.json and in the harness doc, and the RED was observed before the code change |
| T-261123-bax-03 | Tampering | the user's unrelated dirty files and the concurrent quick task | high | mitigate | Every path is staged by name, with no `-a`, pathspec commit, stash, checkout or gsd commit helper. The index is checked against the exact path list before each commit and the commit's file list after it. The mutation check restores recent.rs with sed and proves it with `git diff --quiet` |
| T-261123-bax-04 | Denial of Service | readers of an oversized stored list | low | accept | Read paths are unchanged. An already-oversized list is read as before (the tray caps its display at 20, and Recently played shows what is stored) until one add trims it |
| T-261123-bax-SC | Tampering | npm/pip/cargo installs | low | accept | No package installs or new dependencies in this plan; nothing to gate |
</threat_model>

<verification>
- `cargo test -p gamelib-info --features testing --test golden_recent` passes 12, and `--lib recent::` passes 3, run from src-tauri.
- `cargo clippy -p gamelib-info --all-targets -- -D warnings` and `cargo fmt -p gamelib-info --check` are clean.
- jest over fixtureRedaction.test.ts and infoPortComplete.test.ts passes 209. `pnpm planning-gates` is 12/12.
- The guard mutation (cap 49) fails all four boundary tests, and recent.rs is restored with no diff.
- Three commits: the five Task 1 paths, golden_recent.rs, then the todo rename. No unrelated path is staged or committed.
</verification>

<success_criteria>
- The stored recent-games list never exceeds 50 after an add. The oldest entries go first, a re-add drops nothing else, and the sink and tray get the trimmed list.
- `list` and `remove` do not trim, as the operator ruled.
- The sixty-entry-list golden expects 50, was re-derived by hand from the rule, and is labelled as such. The other 10 cases still pass byte-exact.
- The todo is closed in completed/ with the ruling and the resolution.
- The user's unrelated working-tree changes are untouched.
</success_criteria>

<output>
Create `.planning/quick/261123-bax-cap-the-stored-recent-games-list-at-50-t/261123-bax-SUMMARY.md` with `status: complete` in its frontmatter. Record the Task 1 RED (the failing sixty-entry-list assertion), the round-trip guard's result, the three commit SHAs, the test counts and the mutation result. Do not commit it: the orchestrator's Step 8 docs commit takes the SUMMARY, PLAN and STATE.md.
</output>
