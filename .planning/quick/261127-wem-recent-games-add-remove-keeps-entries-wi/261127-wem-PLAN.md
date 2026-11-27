---
phase: quick-261127-wem
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/crates/gamelib-info/src/recent.rs
  - src-tauri/crates/gamelib-info/tests/golden_recent.rs
  - src-tauri/src/info_dispatch.rs
  - src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/cases.json
  - src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/add-over-empty-appname-entry/after/store/config.json
  - src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/add-over-empty-appname-entry/events.json
  - src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/add-over-empty-appname-entry/result.json
  - src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/remove-drops-empty-appname-entry/after/store/config.json
  - src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/remove-drops-empty-appname-entry/events.json
  - src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/remove-drops-empty-appname-entry/result.json
  - src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/remove-keeps-empty-appname-entry/after/store/config.json
  - src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/remove-keeps-empty-appname-entry/events.json
  - src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/remove-keeps-empty-appname-entry/result.json
  - src-tauri/crates/gamelib-info/tests/fixtures/state/recent/remove-drops-empty-appname-entry/store/config.json
  - src-tauri/crates/gamelib-info/tests/fixtures/state/recent/remove-keeps-empty-appname-entry/store/config.json
autonomous: true
requirements:
  - "quick:261127-wem"
  - "todo:2026-11-22-recent-games-drops-entries-with-empty-appname"

estimate:
  tokens: 70000
  raw_tokens: 70000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "Per the orchestrator's locked rule (keep): an add or a remove drops a stored recent entry only when that entry is an object whose `appName` is a string equal to the game being added or removed. Every other entry survives, in its old relative order: a missing, empty, `null`, `false` or `0` `appName`, a truthy non-string `appName` (for example `7`, even when the game is \"7\"), and any value that is not an object (a bare string, an array). Nothing is removed once with a log line instead"
    - "The `add-over-empty-appname-entry` golden expects [app1, ghost, app2]: the empty-appName ghost entry stays behind the new head, byte-for-key as the before-state holds it. The disk file, the one `recentGamesChanged` payload and `info_recent_list` agree, with one write"
    - "The remove golden, renamed `remove-keeps-empty-appname-entry`, expects [ghost, app2] after removing app3. The ghost keeps its shape (no `runner` key). The disk file, the one payload and the list agree, with one write"
    - "Both re-derived cases are labelled hand-derived from the keep rule (quick 261127-wem) in cases.json and in the golden_recent.rs header doc, the same way `sixty-entry-list` is. The other 9 recent golden cases are unchanged and still pass byte-exact. MANIFEST stays count 11, floor 9"
    - "`recent::keeps`, its renamed unit test and every doc comment in recent.rs (module doc, `keeps`, `add`, `remove`) state the keep rule. None still says that a falsy-appName entry is dropped"
    - "Both concurrent add-plus-remove tests (golden_recent.rs and the shell's info_dispatch.rs) expect [app1, ghost], so they prove the ghost survives an add and a remove racing on two threads"
    - "An end-to-end test drives every non-matching entry shape through an add and two removes via the dispatcher and shows all of them survive on disk, in the sink payloads and in the list"
    - "Each commit holds only this task's paths. The untracked `.planning/debug/` and `.planning/quick/261114-2gg-*` files and every other unrelated path stay out of both commits"
  artifacts:
    - path: "src-tauri/crates/gamelib-info/src/recent.rs"
      provides: "`keeps` returns false only for an object whose appName is the game's string. The cache_view import is gone. The unit test is `keeps_drops_only_the_game_itself`, and the module doc records the change from the TS original"
      contains: "keeps_drops_only_the_game_itself"
    - path: "src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/cases.json"
      provides: "the add-over-empty-appname-entry and remove-keeps-empty-appname-entry notes, hand-derived from the keep rule"
      contains: "261127-wem"
    - path: "src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/add-over-empty-appname-entry/after/store/config.json"
      provides: "byte-exact after-state with games.recent = [app1, ghost, app2]"
    - path: "src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/remove-keeps-empty-appname-entry/after/store/config.json"
      provides: "byte-exact after-state with games.recent = [ghost, app2]"
    - path: "src-tauri/crates/gamelib-info/tests/golden_recent.rs"
      provides: "the provenance note for the two re-derived cases, the concurrent test expecting [app1, ghost], and the every-shape survival test"
      contains: "every_entry_that_is_not_the_game_survives_add_and_remove"
    - path: "src-tauri/src/info_dispatch.rs"
      provides: "a_launch_add_and_a_native_remove_on_two_threads_both_land expects [app1, ghost]"
  key_links:
    - from: "src-tauri/crates/gamelib-info/tests/golden_recent.rs"
      to: "src-tauri/crates/gamelib-info/src/recent.rs"
      via: "dispatch_sync(\"info_recent_add\" / \"info_recent_remove\") -> recent::add / remove -> list.retain(keeps) -> write -> RecentSink::changed. The golden compares the disk bytes, the sink payloads and recent::list"
      pattern: "list.retain"
    - from: "src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/cases.json"
      to: "src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/"
      via: "check_manifest: one expected/ folder per case id, so the renamed id needs the renamed folder (and the renamed state/recent/ folder for its before-state)"
      pattern: "remove-keeps-empty-appname-entry"
    - from: "src-tauri/src/info_dispatch.rs"
      to: "src-tauri/crates/gamelib-info/tests/fixtures/state/recent/add-over-empty-appname-entry"
      via: "test_ctx(&home, Some(\"add-over-empty-appname-entry\")) copies that before-state, so the shell test sees the same ghost entry"
      pattern: "add-over-empty-appname-entry"
---

<objective>
Fix the todo `.planning/todos/pending/2026-11-22-recent-games-drops-entries-with-empty-appname.md`. Today `recent::add`
and `recent::remove` rebuild the list with `keeps`, which copies the TS filter `a.appName && a.appName !== appName`.
That filter silently drops every stored entry whose `appName` is missing, empty, `null`, `false` or `0`, and every
stored value that is not an object. It logs nothing and tells no sink about it, and nothing else ever removes such
entries.

The locked rule is **keep** (orchestrator decision, not to be revisited). `keeps(entry, app_name)` is false only for
an object whose `appName` is a string equal to `app_name`. Every other entry survives both add and remove. There is no
"remove once, loudly" path. `list` already hands such entries to the tray and the renderer unchanged. The tray skips an
entry that fails its plain-appName check, with a WARN (`src-tauri/src/tray.rs:52-57`). So consumers already tolerate
them.

Purpose: a stored entry that is not the game being added or removed survives an add and a remove (todo acceptance 2),
and the two goldens and `recent::keeps` agree on that rule (todo acceptance 1).

Output: the rule in recent.rs with its docs and unit test, two hand-re-derived goldens (one renamed), the two concurrent
tests updated, and one new end-to-end test that runs every non-matching shape through add and remove.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/todos/pending/2026-11-22-recent-games-drops-entries-with-empty-appname.md
@src-tauri/crates/gamelib-info/src/recent.rs
@src-tauri/crates/gamelib-info/tests/golden_recent.rs
@src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/cases.json

Facts measured at plan time (2026-11-27, main 7b7194b75, Windows):

- `cd src-tauri && cargo test -p gamelib-info --features testing --test golden_recent`: 12 passed.
- `cd src-tauri && cargo test -p gamelib-info --features testing --lib recent::`: 3 passed.
- `cargo test --manifest-path src-tauri/Cargo.toml -p gamelib-shell info_dispatch::tests::`: 54 passed, including
  `a_launch_add_and_a_native_remove_on_two_threads_both_land`.
- `cd src-tauri && cargo clippy -p gamelib-info --all-targets -- -D warnings`: clean.
- `cd src-tauri && cargo fmt -p gamelib-info --check`: exit 0. `cargo fmt -p gamelib-shell --check` is NOT clean at
  HEAD. It has pre-existing diffs in `src-tauri/src/ipc_contract.rs` that are not this task's to fix. So the shell
  formatter gate is scoped to the one file: `rustfmt --edition 2021 --check src-tauri/src/info_dispatch.rs` exits 0 at
  HEAD.
- `pnpm exec jest --runTestsByPath src/backend/info/__tests__/fixtureRedaction.test.ts src/backend/__tests__/infoPortComplete.test.ts`:
  214 passed. These scan the gamelib-info fixtures and require `golden/recent` to survive.
- Formatter (gamelib-conventions, the `<verify>` rule): no path this plan writes is one prettier checks.
  `npx prettier --file-info` reports `"ignored": true` for every fixture path (`.prettierignore` line 50 covers
  `src-tauri/crates/gamelib-info/tests/fixtures`) and `"inferredParser": null` for `.rs` paths. So no task carries
  `npx prettier --check`. Each verify block asserts that prettier state instead, so a change to it surfaces. The
  formatter gates are `cargo fmt -p gamelib-info --check` and the scoped `rustfmt` above. These fixtures are
  byte-exact, and nothing formats them. Hand-match the surrounding bytes: tabs in `after/store/config.json` with no
  trailing newline, and 2-space indentation in `events.json` and `result.json` with a trailing newline.
- `python3` on this machine is the Microsoft Store stub (exit 49). Use `node -e` for JSON checks.
- Husky post-checkout runs `pnpm install` on `git checkout -- <file>`. To undo a temporary guard mutation, use Edit,
  or `git show HEAD:<path> > <path>`. Never use `git checkout`.
- `cache_view::is_falsy` has other callers in `cache_view.rs`. Removing recent.rs's import of it leaves no dead code.
- The add-over-empty-appname-entry before-state's recent list is [ghost, app2], where ghost is
  `{"appName": "", "title": "ghost entry", "runner": "gog"}`. The remove case's before-state is [ghost, app2, app3],
  where its ghost is `{"appName": "", "title": "ghost entry"}` with no `runner`. The case removes app3.
- Precedent for a hand-derived golden after the TS oracle was deleted: quick 261123-bax (`6e44d4e64`, the
  `sixty-entry-list` note in cases.json and the golden_recent.rs header doc).
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Keep every entry that is not the game, end to end (rule, goldens, unit and concurrent tests)</name>
  <files>src-tauri/crates/gamelib-info/src/recent.rs, src-tauri/crates/gamelib-info/tests/golden_recent.rs, src-tauri/src/info_dispatch.rs, src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/cases.json, src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/add-over-empty-appname-entry/after/store/config.json, src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/add-over-empty-appname-entry/events.json, src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/add-over-empty-appname-entry/result.json, src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/remove-keeps-empty-appname-entry/ (renamed, 3 files), src-tauri/crates/gamelib-info/tests/fixtures/state/recent/remove-keeps-empty-appname-entry/ (renamed)</files>
  <behavior>
    - keeps({"appName":"b"}, "a") is true. keeps({"appName":"a"}, "a") is false. This is the only shape that is ever dropped
    - keeps is true for {"appName":""}, {"appName":null}, {"appName":false}, {"appName":0}, {"title":"no name"}, the bare string "just a string", and an array ["a"], each against "a"
    - keeps({"appName":7}, "7") is true (a non-string is never the game). keeps({"appName":["a"]}, "a") is true
    - golden add-over-empty-appname-entry: adding app1 to [ghost, app2] gives [app1, ghost, app2] on disk, in the one payload and in the list
    - golden remove-keeps-empty-appname-entry: removing app3 from [ghost(no runner), app2, app3] gives [ghost(no runner), app2]
    - both concurrent tests: add app1 racing remove app2 over [ghost, app2] gives [app1, ghost] every round, in either order
  </behavior>
  <action>
<!-- planner-discipline-allow: remove-drops-empty-appname-entry -->
Implements the orchestrator's locked decision (rule: keep). Do not add a log-and-remove-once path, and do not touch
`valid_app_name`, `stored`, the MAX_STORED cap, or the remove-on-empty-list early return. Work RED first: change the
pins in steps 1-4, run the three test commands, and record the failures in the SUMMARY. Then change the rule in
step 5 and run everything green.

1. Rename the remove case. From the repo root, `git mv` both
   `src-tauri/crates/gamelib-info/tests/fixtures/state/recent/remove-drops-empty-appname-entry` and
   `src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/expected/remove-drops-empty-appname-entry` to
   `remove-keeps-empty-appname-entry` in the same parent folders. In
   `src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/cases.json`, change that case's `id` to
   `remove-keeps-empty-appname-entry`. Leave its op unchanged (remove app3). Leave the state file's bytes untouched.
   Leave `MANIFEST.json` unchanged: the count stays 11.

2. Re-derive the two cases' expected files by hand. These are byte-exact and prettier-ignored. Edit only the lines
   inside each list, so the file ends and every other byte stay as they are.
   - `expected/add-over-empty-appname-entry/after/store/config.json`: in `games.recent`, insert the ghost object
     between the app1 object and the app2 object. Copy it as the before-state file holds it: braces at three tabs,
     keys at four, keys `appName` (empty string), `title` ("ghost entry"), `runner` ("gog") in that order, and a
     comma after its closing brace. Do not add a trailing newline. The file has none.
   - `expected/add-over-empty-appname-entry/events.json`: insert the same object between app1 and app2 in `args[0]`,
     in that file's style (braces at 8 spaces, keys at 10).
   - `expected/add-over-empty-appname-entry/result.json`: insert it between app1 and app2 in `recent` (braces at 4
     spaces, keys at 6). `writes` stays 1.
   - `expected/remove-keeps-empty-appname-entry/after/store/config.json`, `events.json`, `result.json`: in each list,
     insert the remove case's ghost before the app2 object, in the same per-file styles. That ghost is `appName`
     empty and `title` "ghost entry", with NO `runner` key, exactly as the case's before-state has it. Each list
     becomes [ghost, app2]. `writes` stays 1.
   - The cases.json notes: replace the two notes that describe the old drop as a TS behaviour with notes that follow
     the `sixty-entry-list` note's wording. For add-over-empty-appname-entry, say that an entry whose appName is empty
     is kept behind the new head: add drops only the game's own entry (quick 261127-wem, rule: keep). For
     remove-keeps-empty-appname-entry, say that remove drops only the game, and that an entry whose appName is empty
     and that has no runner stays where it was (quick 261127-wem). Both notes must also say the expected files are
     hand-derived from that rule and the before-state, not recorded from the TS, because the TS filter dropped the
     entry and its oracle was deleted in 86-24.

3. `src-tauri/crates/gamelib-info/tests/golden_recent.rs`:
   - In the header doc (lines 1-7), extend the paragraph that says `sixty-entry-list` is the one case that is not a TS
     recording. It now names the three hand-derived cases: `sixty-entry-list` (the cap, 261123-bax), and
     `add-over-empty-appname-entry` and `remove-keeps-empty-appname-entry` (the keep rule, quick 261127-wem: the TS
     filter dropped an entry with an empty appName, and its oracle was deleted in 86-24). Keep the sentence saying
     their notes in cases.json record this.
   - In `a_concurrent_add_and_remove_both_take_effect`, the comment becomes: over [ghost (empty appName), app2], a
     remove of app2 and an add of app1 must give [app1, ghost], whichever runs first. The assertion expects the names
     `["app1", ""]`. The `names` mapping already reads the empty string through `as_str()`.

4. `src-tauri/src/info_dispatch.rs`, test `a_launch_add_and_a_native_remove_on_two_threads_both_land` (around line
   1450): make the same comment and assertion change, so it expects `["app1", ""]`.

   In `src-tauri/crates/gamelib-info/src/recent.rs`, rename the existing unit test for `keeps` (the one whose name
   says it follows the TS filter) to `keeps_drops_only_the_game_itself`. Rewrite its body to the `<behavior>` list
   above, and replace its comment that quotes the TS expression with one line stating the keep rule.

   RED: run the three test commands in `<verify>` lines 1-3 now. Expected: golden_recent 10 passed and 2 failed
   (`every_golden_case_matches_the_ts_bytes_and_payloads` at add-over-empty-appname-entry, and
   `a_concurrent_add_and_remove_both_take_effect`). lib recent:: 2 passed and 1 failed. Shell info_dispatch::tests::
   53 passed and 1 failed. Record the counts and the failing test names in the SUMMARY. A different failure shape
   means a fixture edit is wrong. In that case, read the want/got dump the golden prints and fix the fixture, not the
   rule.

5. GREEN, in `src-tauri/crates/gamelib-info/src/recent.rs`:
   - `keeps`: return false only when `entry.get("appName")` is `Some(Json::Str(s))` with `s == app_name`, and true
     otherwise (a `matches!` with a guard, negated, is enough). Doc comment: it drops only the game, meaning an
     object whose `appName` is a string equal to `app_name`. Every other entry is kept: a missing, empty, `null`,
     `false` or `0` appName, a non-string one, and a value that is not an object. Cite quick 261127-wem, and say
     that the TS filter silently dropped all of those.
   - Delete the now-unused `use crate::cache_view::...;` line.
   - Module doc (lines 6-16): remove the bullet about dropping entries whose appName is falsy. The remaining parity
     quirk (a remove on an empty list writes nothing and tells nobody, while a remove on a non-empty list that holds
     no such game rewrites the unchanged list and still tells the sink) becomes one sentence: still copied, not fixed
     (D-03). Do not claim it has a pending todo, because none exists under `.planning/todos/pending/` at plan time.
     Turn "One deliberate change from the TS original" into two deliberate changes. The first is the existing cap
     paragraph, unchanged. The second: [`add`] and [`remove`] drop only the game's own entry (see [`keeps`]), by the
     keep rule of quick 261127-wem. The TS filter also dropped, silently, any entry with no usable `appName` and any
     value that is not an object.
   - `add` doc: it drops the game's own entry (only that: see [`keeps`]), then puts the game first. Keep the rest
     (key order, the MAX_STORED trim) as it is.
   - `remove` doc: after the empty-list sentence, it rewrites the list without the game. Remove the clause about
     entries that have no `appName`.

6. Run every `<verify>` command. Stage exactly the 15 paths the commit check lists. Use `git add` on the named
   paths, never `git add -A` or `.`. Run the pre-commit check, then commit:
   `fix(quick-261127-wem): keep recent-games entries that are not the game on add and remove`. The body names the
   rule, the two re-derived goldens (one renamed) and the todo path. End it with the attribution trailer from the
   session's system reminder.
  </action>
  <verify>
    <automated>cd src-tauri && cargo test -p gamelib-info --features testing --test golden_recent   # passed count [HEAD=12 EXPECT==12; RED step 4: 10 passed 2 failed]</automated>
    <automated>cd src-tauri && cargo test -p gamelib-info --features testing --lib recent::   # passed count [HEAD=3 EXPECT==3; RED step 4: 2 passed 1 failed]</automated>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml -p gamelib-shell info_dispatch::tests::   # passed count [HEAD=54 EXPECT==54; RED step 4: 53 passed 1 failed]</automated>
    <automated>cd src-tauri && cargo clippy -p gamelib-info --all-targets -- -D warnings && cargo fmt -p gamelib-info --check && rustfmt --edition 2021 --check src/info_dispatch.rs   # invariant guard: clean and exit 0 at HEAD, must stay so (catches an unused import left behind)</automated>
    <automated>test "$(grep -c 'is_falsy' src-tauri/crates/gamelib-info/src/recent.rs)" -eq 0   # [HEAD=2 EXPECT==0]</automated>
    <automated>test "$(grep -c 'keeps_follows_the_ts_filter' src-tauri/crates/gamelib-info/src/recent.rs)" -eq 0 && test "$(grep -c 'fn keeps_drops_only_the_game_itself()' src-tauri/crates/gamelib-info/src/recent.rs)" -ge 1   # [HEAD=1,0 EXPECT==0,>=1]</automated>
    <automated>test "$(grep -c 'is dropped by every add and every remove' src-tauri/crates/gamelib-info/src/recent.rs)" -eq 0 && test "$(grep -c '261127-wem' src-tauri/crates/gamelib-info/src/recent.rs)" -ge 2   # old bullet gone; the rule is cited in the module doc and on keeps [HEAD=1,0 EXPECT==0,>=2]</automated>
    <automated>test "$(grep -c 'TS quirk' src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/cases.json)" -eq 0 && test "$(grep -c '261127-wem' src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/cases.json)" -ge 2 && test "$(grep -c 'remove-drops-empty-appname-entry' src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/cases.json)" -eq 0 && node -e 'const c=JSON.parse(require("fs").readFileSync("src-tauri/crates/gamelib-info/tests/fixtures/golden/recent/cases.json","utf8"));const ids=c.map(x=>x.id);if(c.length!==11||!ids.includes("add-over-empty-appname-entry")||!ids.includes("remove-keeps-empty-appname-entry"))process.exit(1)'   # [HEAD=2,0,1 EXPECT==0,>=2,0; 11 cases, both ids present, parses]</automated>
    <automated>F=src-tauri/crates/gamelib-info/tests/fixtures; test ! -e $F/state/recent/remove-drops-empty-appname-entry && test ! -e $F/golden/recent/expected/remove-drops-empty-appname-entry && test -f $F/state/recent/remove-keeps-empty-appname-entry/store/config.json && test -f $F/golden/recent/expected/remove-keeps-empty-appname-entry/after/store/config.json   # the rename landed in both trees [HEAD=absent EXPECT==present]</automated>
    <automated>node -e 'const fs=require("fs"),s=JSON.stringify,F="src-tauri/crates/gamelib-info/tests/fixtures/",j=p=>JSON.parse(fs.readFileSync(F+p,"utf8"));const want={"add-over-empty-appname-entry":["app1","","app2"],"remove-keeps-empty-appname-entry":["","app2"]};for(const[id,names]of Object.entries(want)){const E="golden/recent/expected/"+id+"/";const c=j(E+"after/store/config.json").games.recent,e=j(E+"events.json"),r=j(E+"result.json"),g=j("state/recent/"+id+"/store/config.json").games.recent[0];if(e.length!==1||s(c)!==s(e[0].args[0])||s(c)!==s(r.recent)||r.writes!==1||s(c.map(x=>x.appName))!==s(names)||s(c[names.indexOf("")])!==s(g)){console.error("bad "+id);process.exit(1)}}'   # all three expected files agree, run in the right order, and the ghost is the before-state ghost key for key [HEAD=fail EXPECT==exit 0]</automated>
    <automated>test "$(grep -c '\["app1", ""\]' src-tauri/crates/gamelib-info/tests/golden_recent.rs)" -ge 1 && test "$(grep -c '\["app1", ""\]' src-tauri/src/info_dispatch.rs)" -ge 1 && test "$(grep -c '261127-wem' src-tauri/crates/gamelib-info/tests/golden_recent.rs)" -ge 1   # both concurrent tests expect the ghost; provenance note in the harness doc [HEAD=0,0,0 EXPECT>=1,>=1,>=1]</automated>
    <automated>pnpm exec jest --runTestsByPath src/backend/info/__tests__/fixtureRedaction.test.ts src/backend/__tests__/infoPortComplete.test.ts   # the renamed fixtures pass the redaction scan and golden/recent survives; passed count, invariant guard [HEAD=214 EXPECT==214]</automated>
    <automated>F=src-tauri/crates/gamelib-info/tests/fixtures; for f in $F/golden/recent/cases.json $F/golden/recent/expected/add-over-empty-appname-entry/after/store/config.json $F/golden/recent/expected/add-over-empty-appname-entry/events.json $F/golden/recent/expected/add-over-empty-appname-entry/result.json $F/golden/recent/expected/remove-keeps-empty-appname-entry/after/store/config.json $F/golden/recent/expected/remove-keeps-empty-appname-entry/events.json $F/golden/recent/expected/remove-keeps-empty-appname-entry/result.json $F/state/recent/remove-keeps-empty-appname-entry/store/config.json; do I=$(npx prettier --file-info "$f") || exit 1; printf '%s\n' "$I" | grep -Eq '"ignored":[[:space:]]*true' || { echo "not ignored: $f"; exit 1; }; done && for f in src-tauri/crates/gamelib-info/src/recent.rs src-tauri/crates/gamelib-info/tests/golden_recent.rs src-tauri/src/info_dispatch.rs; do I=$(npx prettier --file-info "$f") || exit 1; printf '%s\n' "$I" | grep -Eq '"inferredParser":[[:space:]]*null' || { echo "prettier parses: $f"; exit 1; }; done   # invariant guard [HEAD=present EXPECT==present]: prettier ignores every fixture path and has no parser for .rs, so no prettier --check is carried; cargo fmt / rustfmt above are the formatter gates</automated>
    <automated>N=$(git diff --cached --no-renames --name-only) && test "$(printf '%s\n' "$N" | awk 'NF{n++} END{print n+0}')" -eq 15 && test "$(printf '%s\n' "$N" | grep -vc '^src-tauri/')" -eq 0   # run BEFORE git commit: the index holds exactly the 15 paths (4 edited, 3 edited expected files, 4 deleted and 4 added by the two renames), none outside src-tauri/ [HEAD=absent EXPECT==present]</automated>
    <automated>N=$(git show --no-renames --name-only --format= HEAD) && test "$(printf '%s\n' "$N" | awk 'NF{n++} END{print n+0}')" -eq 15 && test "$(printf '%s\n' "$N" | grep -vc '^src-tauri/')" -eq 0   # AFTER the commit; use the SHA git commit printed in place of HEAD if another session committed since [HEAD=absent EXPECT==present]</automated>
  </verify>
  <done>
    keeps drops only an object whose appName is the game's string. recent.rs no longer imports the cache_view helper,
    and its docs and renamed unit test state the keep rule. The two goldens expect the ghost to survive: [app1, ghost,
    app2] after an add, and [ghost, app2] after a remove. The remove case is renamed in cases.json, expected/ and
    state/. Both are labelled hand-derived. golden_recent passes 12, lib recent:: passes 3, shell info_dispatch::tests::
    passes 54, and clippy and fmt are clean. The RED counts from step 4 are recorded in the SUMMARY. One fix commit
    holds exactly the 15 paths.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Pin that every non-matching entry shape survives an add and two removes, through the dispatcher</name>
  <files>src-tauri/crates/gamelib-info/tests/golden_recent.rs</files>
  <behavior>
    - Stored list before: [{"appName":""}, {"appName":null}, {"appName":false}, {"appName":0}, {"title":"no name"}, "just a string", {"appName":7}, ["a"], {"appName":"keep"}, {"appName":"gone"}]
    - add {appName "new", title "New", runner "gog"}: "new" goes first and all ten stored entries follow, unchanged and in order
    - remove "gone": only {"appName":"gone"} leaves
    - remove "7": nothing leaves, because {"appName":7} is not the string "7". `write` still runs and the sink is still told (the non-empty-list parity quirk). The StoreHost skips the unchanged set on disk
    - End state, the same on disk (`games.recent` of store/config.json), in recent::list and in the last sink payload: [new, "", null, false, 0, no-name, "just a string", 7, ["a"], "keep"]. The sink saw 3 payloads
  </behavior>
  <action>
Expansion of Task 1's slice, per the locked keep rule. The goldens cover one shape each way. This test covers every
shape the todo names, end to end. In `src-tauri/crates/gamelib-info/tests/golden_recent.rs`, add
`#[test] fn every_entry_that_is_not_the_game_survives_add_and_remove()` after `a_concurrent_add_and_remove_both_take_effect`.
Give it a doc comment citing quick 261127-wem (rule: keep) and the todo's acceptance ("a stored entry that is not the
game being added or removed survives an add and a remove").

Setup: `profile(None)`. Before any op, create `p.user_data.join("store")` and write `config.json` there, holding
`{"games":{"recent":[...]}}` with the ten-entry list from `<behavior>`. Build it with `serde_json::json!` and
`serde_json::to_vec`. Before the first op opens the row, the host has not read the file, so the before-state is
whatever this writes. Then run the three ops through `dispatch_sync` (`info_recent_add` with the game object, and
`info_recent_remove` with `{"appName": "gone"}` and then `{"appName": "7"}`). `.unwrap()` each.

Assert with `assert_eq!` against one `json!` literal of the expected end list:
`recent::list(&p.ctx).unwrap().to_value()`, `read_json(&p.user_data.join("store/config.json"))["games"]["recent"]`,
and the last sink payload. Also assert that the sink saw exactly 3 payloads, and that the first payload is the
11-entry list ("new" plus all ten originals). Do not use the `names` helper. It unwraps `as_str()` and would panic on
the non-string entries.

Guard mutation (record it in the SUMMARY, then undo it): temporarily give `keeps` back the arm that returns false for
a falsy appName, and run this one test. It must fail. Undo the mutation with Edit, not `git checkout` (Husky
post-checkout runs pnpm install). Confirm `git diff --quiet -- src-tauri/crates/gamelib-info/src/recent.rs` exits 0.

Run every `<verify>` command. Stage only `src-tauri/crates/gamelib-info/tests/golden_recent.rs`, and commit
`test(quick-261127-wem): every recent entry that is not the game survives add and remove`, ending with the
attribution trailer from the session's system reminder. Then run `graphify update .`. It is best-effort and not a
gate. Its output stays in the gitignored graphify-out/.
  </action>
  <verify>
    <automated>cd src-tauri && cargo test -p gamelib-info --features testing --test golden_recent   # passed count [HEAD=12 after Task 1, EXPECT==13]</automated>
    <automated>cd src-tauri && cargo test -p gamelib-info --features testing --test golden_recent every_entry_that_is_not_the_game_survives_add_and_remove   # 1 passed [HEAD=0 EXPECT==1; GUARD MUTATION: restoring the falsy-appName drop in keeps turns it red, recorded in the SUMMARY]</automated>
    <automated>test "$(grep -c 'fn every_entry_that_is_not_the_game_survives_add_and_remove()' src-tauri/crates/gamelib-info/tests/golden_recent.rs)" -ge 1 && git diff --quiet -- src-tauri/crates/gamelib-info/src/recent.rs   # the test exists and the guard mutation was undone [HEAD=0 EXPECT>=1, exit 0]</automated>
    <automated>cd src-tauri && cargo clippy -p gamelib-info --all-targets -- -D warnings && cargo fmt -p gamelib-info --check   # invariant guard: clean after Task 1, must stay so</automated>
    <automated>I=$(npx prettier --file-info src-tauri/crates/gamelib-info/tests/golden_recent.rs) && printf '%s\n' "$I" | grep -Eq '"inferredParser":[[:space:]]*null'   # invariant guard [HEAD=present EXPECT==present]: prettier has no parser for .rs, so no prettier --check is carried; cargo fmt above is the formatter gate</automated>
    <automated>N=$(git show --no-renames --name-only --format= HEAD) && test "$N" = "src-tauri/crates/gamelib-info/tests/golden_recent.rs"   # AFTER the commit: exactly the one path; use the printed SHA in place of HEAD if another session committed since [HEAD=absent EXPECT==present]</automated>
  </verify>
  <done>
    golden_recent passes 13. The new test shows every non-matching shape (empty, null, false, 0, missing appName, a
    truthy non-string, a bare string, an array) surviving an add and two removes, the same on disk, in the list and in
    the sink payloads. The guard mutation turned it red and was undone. One test commit holds just golden_recent.rs.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| store/config.json -> recent::add/remove | A hand-edited or damaged config can hold entries of any JSON shape in games.recent |
| recent list -> tray / renderer | The list (now including malformed entries after an add or remove) is pushed through RecentSink to the tray rebuild and the `recentGamesChanged` emit |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261127-wem-01 | Tampering | recent::keeps / add / remove | low | mitigate | Silent data loss was the defect: an add or remove dropped user entries with no log line. Task 1 makes `keeps` drop only the named game, and Task 2's end-to-end test pins every other shape surviving on disk and in the sink |
| T-261127-wem-02 | Denial of service | tray rebuild and renderer list from a malformed entry | low | accept | `list` already returned such entries before this change, so consumers already face them at boot. The tray skips an entry that fails its plain-appName check, with a WARN (`src-tauri/src/tray.rs:52-57`). The MAX_STORED cap still bounds the list on every add |
| T-261127-wem-03 | Information disclosure | golden fixtures | low | mitigate | The fixtures hold only synthetic names (app1, app2, ghost entry). The fixtureRedaction jest suite in Task 1's verify rescans them after the rename |
| T-261127-wem-SC | Tampering | npm/pip/cargo installs | high | accept | No package is installed or added by this plan, so there is no package-legitimacy surface |
</threat_model>

<verification>
- `cd src-tauri && cargo test -p gamelib-info --features testing --test golden_recent` passes 13, and `--lib recent::` passes 3.
- `cargo test --manifest-path src-tauri/Cargo.toml -p gamelib-shell info_dispatch::tests::` passes 54.
- `cd src-tauri && cargo clippy -p gamelib-info --all-targets -- -D warnings` and `cargo fmt -p gamelib-info --check` are clean, and `rustfmt --edition 2021 --check src-tauri/src/info_dispatch.rs` exits 0.
- The jest fixture suites pass 214.
- Two commits on top of 7b7194b75 (or the session's base): the fix (15 paths) and the test (1 path), both under src-tauri/ only.
</verification>

<success_criteria>
- Todo acceptance 1: the two goldens (add-over-empty-appname-entry, remove-keeps-empty-appname-entry) and `recent::keeps` with its unit test all encode the keep rule.
- Todo acceptance 2: a stored entry that is not the game being added or removed survives an add and a remove, shown per shape in the unit test and end to end in the golden and the new dispatcher test.
- No log-and-remove-once path exists (locked rule: keep).
</success_criteria>

<output>
Create `.planning/quick/261127-wem-recent-games-add-remove-keeps-entries-wi/261127-wem-SUMMARY.md` when done. Include
the RED counts from Task 1 step 4, the guard-mutation result from Task 2, both commit SHAs, and the before/after test
counts.

Orchestrator note (docs commit, not the executor's): close the todo in the Step 8 docs commit. Move
`.planning/todos/pending/2026-11-22-recent-games-drops-entries-with-empty-appname.md` to
`.planning/todos/completed/` with `git mv`. Add a `## Resolution` section in the style of the sibling
`.planning/todos/completed/2026-11-22-recent-games-list-is-unbounded.md`: fixed 2026-11-27 in quick task 261127-wem
(fix commit SHA, test commit SHA). Rule: keep. An entry is dropped only when it is an object whose `appName` is a
string equal to the game. Every other entry survives add and remove, and there is no remove-once path. Optionally add
the `status: CLOSED` / `resolution:` frontmatter keys used by `7b7194b75`. Add both todo paths to the commit's
`--files` list explicitly, because Step 8's default list does not include them. Then run `pnpm planning-gates`.
</output>
