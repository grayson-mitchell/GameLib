---
phase: quick-260928-tjj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/main.rs
  - .planning/quick/260928-tjj-correct-the-stale-caller-routing-comment/BASE.sha
  - .planning/todos/pending/2026-09-28-stale-arm-comment-claims-gog-amazon-use-a-live-window.md
  - .planning/todos/completed/2026-09-28-stale-arm-comment-claims-gog-amazon-use-a-live-window.md
autonomous: true
requirements:
  - QUICK-260928-tjj
estimate:
  tokens: 35000
  raw_tokens: 35000
  tasks: 2
  confidence: low
must_haves:
  truths:
    - "`src-tauri/src/main.rs` carries exactly ONE statement of cookie-arm caller routing file-wide, and that statement is true on macOS AND on Windows/Linux."
    - "A reader of the `humble_login_clear_cookies` arm can name, without leaving the comment, which of the four production callers reaches the window-based branch and which reach the no-window fallback, on each platform."
    - "The sibling `humble_login_cookies_for_domain` arm points at that one statement instead of carrying a second, drift-prone copy."
    - "The file's executable source is byte-identical before and after: only `//` comment lines changed."
    - "The Rust suite is still green (`cargo test --bin gamelib-shell`, 0 failed), proving the two source-scanning pins that read inside these arms were not perturbed."
  artifacts:
    - "src-tauri/src/main.rs — rewritten caller-routing comment inside the `humble_login_clear_cookies` arm, plus the stale sentence removed and replaced by a pointer in the `humble_login_cookies_for_domain` arm"
    - ".planning/todos/completed/2026-09-28-stale-arm-comment-claims-gog-amazon-use-a-live-window.md — moved, `result:` opening with a bare status word"
  key_links:
    - "The comment's claims <-> the four live `seam.clearCookies` call sites (humble/user.ts, legendary/user.ts, gog/user.ts, nile/user.ts) — the comment is only worth keeping if it matches them"
    - "The comment region <-> `epic_cold_jar_login_timeout_window_branch_clear_evicts_disk_and_memory_cache` (main.rs `mod tests`), whose scan window IS this arm and whose exclusion assertion reads RAW lines, comments included"
---

<objective>
Leave exactly ONE accurate statement of caller routing in `src-tauri/src/main.rs`'s cookie arms,
replacing comments that contradict each other about which storefronts reach which branch. The
todo names one arm and one contradiction; planning measured **two** stale copies of the same
sentence — the `humble_login_clear_cookies` arm and the sibling `humble_login_cookies_for_domain`
arm each carry one, each ~15 lines above a Phase 40 note that says the opposite. Both are fixed.

Purpose: the stale sentence sits at the exact place a reader looks before editing this arm, and
two of the three sibling debug sessions on this path turned on which branch a given store reaches.
A reader who trusts it reasons about blast radius wrongly.

Output: a corrected, platform-explicit caller-routing note in the arm; the source todo moved to
`.planning/todos/completed/` with a status-word `result:`.

**Comment-only.** No behaviour change, no control-flow change, no type-set change, no new test.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@.planning/todos/pending/2026-09-28-stale-arm-comment-claims-gog-amazon-use-a-live-window.md
@src-tauri/src/main.rs
@src/backend/storeManagers/gog/user.ts
@src/backend/storeManagers/nile/user.ts
@src/backend/storeManagers/legendary/user.ts
@src/backend/humble/user.ts
</context>

<planning_measurements>
Measured 2026-09-28 during planning. Re-verify anything you rely on; line numbers drift, symbol
names do not. **The task brief's own platform claim was measured FALSE — see (4) below.**

1. **Production `seam.clearCookies` census is exactly four call sites.** `grep -rn "\.clearCookies("
   src | grep -v __tests__ | grep -v '\.test\.ts'` returns four and only four. There is no fifth
   caller. The todo's four cited line numbers all still land on the right call:
   `src/backend/humble/user.ts:1010`, `src/backend/storeManagers/gog/user.ts:69`,
   `src/backend/storeManagers/nile/user.ts:69`, `src/backend/storeManagers/legendary/user.ts:400`.

2. **The sentinel-label constants all exist and are what each caller passes.**
   `GOG_COOKIE_CLEAR_NO_WINDOW_LABEL` (`gog/user.ts:35`),
   `AMAZON_COOKIE_CLEAR_NO_WINDOW_LABEL` (`nile/user.ts:40`),
   `EPIC_COOKIE_CLEAR_NO_WINDOW_LABEL` (`legendary/user.ts:57`).
   Rust side: `store_logout_cookie_domain_matches` over
   `STORE_LOGOUT_COOKIE_DOMAINS = ["gog.com", "amazon.com"]` (`main.rs:3639-3647`), and
   `epic_cookie_domain_matches` over `EPIC_COOKIE_DOMAINS` (`main.rs:3595-3613`).

3. **The todo's table is right about macOS but incomplete in TWO ways.**
   - Epic's label is NOT unconditionally the sentinel. `legendary/user.ts:290-295` reads
     `const label = isMac ? EPIC_COOKIE_CLEAR_NO_WINDOW_LABEL : await seam.open(COOKIE_HANDLE_ORIGIN, ...)`.
     Off macOS, Epic opens a REAL hidden window and passes its real label.
   - `clearGogCookiesForLogout` (`gog/user.ts:46-49`) and `clearAmazonCookiesForLogout`
     (`nile/user.ts:48-52`) both open with `if (!isMac) { return }`. Off macOS they never call
     this arm at all.

4. **The task brief's non-macOS assumption is FALSE and must not be written into the comment.**
   The brief states that off macOS "the sentinel-label callers still fall through to
   `humble_login:no-window:{label}`". They do not: GOG and Amazon never reach the arm (early
   return), and Epic uses a real window label there. Off macOS **every** caller that reaches this
   arm carries a real Tauri-registered window label, so nothing is expected to hit the no-window
   error by design.

5. **Humble is unconditional.** `humble/user.ts:933` opens the window
   (`const label = await seam.open(HUMBLE_BASE_URL, ...)`) and `:1010` passes that real label. No
   platform gate. Its domain, `humblebundle.com`, matches neither Rust matcher — but Humble never
   depends on the domain check, because `existing_window.is_none()` is already false for it.

6. **Two `mod tests` pins in `main.rs` scan inside this very arm; one of them reads RAW lines.**
   - `f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated` (~`:14277`) explicitly skips lines
     whose trimmed form starts with `//` or `*`. Comment-insensitive. Safe.
   - `epic_cold_jar_login_timeout_window_branch_clear_evicts_disk_and_memory_cache` (~`:14718`)
     bounds its scan window to this arm and is comment-insensitive for its three
     `WKWebsiteDataType*` assertions (it uses a comment-stripping `non_comment_contains` closure)
     — but its exclusion assertion and its `NSSet::from_slice` locator both use a RAW
     `l.contains(...)` over every line, comments included. Task 1 lists the two literals this
     forbids.
   - `src/backend/__tests__/tauriShellSource.test.ts` runs its assertions against a
     COMMENT-STRIPPED copy of `main.rs`. Comment-insensitive. Safe.

7. **Prettier measurement (CLAUDE.md formatter convention).** Measured under prettier 3.7.4:
   `npx prettier --file-info src-tauri/src/main.rs` -> `{ "ignored": false, "inferredParser": null }`,
   and `npx prettier --check src-tauri/src/main.rs` **exits 2** with "No parser could be inferred".
   This is a third case beyond CLAUDE.md's two: not ignored, but unparseable. Either way a
   `--check` over it is not assurance — it is a hard error. It is therefore OMITTED, deliberately.
   `npx prettier --file-info` on the todo file -> `{ "ignored": true, "inferredParser": null }`;
   `.planning/` is prettier-ignored, so a `--check` there is vacuous and is likewise omitted.

8. **Repo's own Rust command.** `.github/workflows/rust-test.yml:79` runs
   `cargo test --bin gamelib-shell` from `src-tauri`. Reuse it rather than inventing `cargo check`
   — the two comment-sensitive pins above live in that suite and a bare `cargo check` would not
   run them. Recorded baseline after quick task `260928-sn8`: **289 passed / 0 failed / 2 ignored**.

9. **Considered and rejected as a defect to file.** GOG's and Amazon's off-macOS early return is
   deliberate and already documented in place (`gog/user.ts:37-45`: the Rust fallback is
   `#[cfg(target_os = "macos")]` and no Tauri leg ships on Windows/Linux yet, Phase 38). Nothing
   found during this audit warrants a new todo.

10. **THE TODO UNDERCOUNTS: the same stale sentence appears TWICE in `main.rs`, not once.**
    `grep -c 'routed through a live Tauri-managed window' src-tauri/src/main.rs` returns **2**.
    The second copy is at `:7899`, inside the SIBLING census arm `"humble_login_cookies_for_domain"`
    (`:7874`) — near-identical wording ("here" rather than "at this point"), the same contradiction,
    and the same Phase 40 plan 04 (D-15, T-40-04-07/-08) note sitting directly below it recording
    the GOG/Amazon sentinel change. The todo names only the clear arm.

    **This is in scope and both copies get fixed.** The census arm is structurally the same
    mechanism (`#[cfg(target_os = "macos")]`, `existing_window.is_none()`, OR'd over the same two
    domain matchers, falling into `default_data_store_cookies_for_domain`) and has the SAME four
    callers with the SAME label kinds: `humble/user.ts:976`, `gog/user.ts:54`, `nile/user.ts:56`,
    `legendary/user.ts:338` (the census read reuses the very same `label` binding from the
    `isMac` ternary at `:290`). Every routing fact in (1)-(5) transfers unchanged.

    Fixing only the arm the todo names would leave the identical wrong sentence 700 lines below,
    recreate the exact drift this task exists to end, and make a file-wide negative grep
    impossible. The census arm already cross-references the clear arm's fallback, so it gets a
    one-line pointer rather than a duplicated statement — which is what keeps the count at ONE.

11. **The verify gate is RED before the edit, as it must be.** Dry-run against pre-edit source:
    the stale literal counts 2 (target 0), and 4 of the 6 required anchors
    (`clearGogCookiesForLogout`, `clearAmazonCookiesForLogout`, `EPIC_COOKIE_CLEAR_NO_WINDOW_LABEL`,
    `Windows/Linux`) are absent from the clear arm's region. Only the two Rust matcher names are
    already present. The gate cannot pass for the wrong reason.
</planning_measurements>

<tasks>

<task type="tracer">
  <name>Task 1: Collapse three contradictory caller-routing comments across two arms into one accurate, platform-explicit statement</name>
  <files>src-tauri/src/main.rs</files>
  <precondition>Two things must be established BEFORE the first edit, in this order. (1) Pin the comparison base so the comment-only gate cannot pass vacuously after a commit: run `git rev-parse HEAD > .planning/quick/260928-tjj-correct-the-stale-caller-routing-comment/BASE.sha` while the working tree is clean. (2) The Rust suite is green: run `(cd src-tauri && cargo test --bin gamelib-shell)` and record the pass/fail/ignored counts. If anything is already failing, STOP and report — a pre-existing red must not be attributed to this comment change. Expected baseline: 289 passed / 0 failed / 2 ignored.</precondition>
  <read_first>
Read, in this order, and confirm each measurement in `<planning_measurements>` against what you
actually see. Where a measurement and the live source disagree, the LIVE SOURCE wins and the
corrected fact is what goes in the comment.

  - `src-tauri/src/main.rs`, the `humble_login_clear_cookies` arm and its three stacked comment
    paragraphs. Locate it by the arm literal, not by line number.
  - `src-tauri/src/main.rs`, the SIBLING census arm `humble_login_cookies_for_domain`, and its own
    copy of the same stale sentence plus its own Phase 40 note. Same locate-by-literal rule.
  - `src-tauri/src/main.rs` `mod tests`: `epic_cold_jar_login_timeout_window_branch_clear_evicts_disk_and_memory_cache`.
    Read its scan-window bounds and its raw-line assertions — these are what constrain your wording.
  - `src/backend/humble/user.ts` around the `seam.open(HUMBLE_BASE_URL, ...)` binding and the
    `seam.clearCookies(label, 'humblebundle.com')` call.
  - `src/backend/storeManagers/legendary/user.ts`: the `const label = isMac ? ... : await seam.open(...)`
    ternary inside the `clearEpicCookies` wipe step, and the `seam.clearCookies(label, host)` loop.
  - `src/backend/storeManagers/gog/user.ts`: `clearGogCookiesForLogout` in full, including its
    opening guard.
  - `src/backend/storeManagers/nile/user.ts`: `clearAmazonCookiesForLogout` in full, including its
    opening guard.
  </read_first>
  <action>
Comment-only. Do not touch a single line of executable Rust. Do not touch the arm-boundary line
itself (the line whose trimmed form is the arm literal followed by the arrow and open brace) — a
`mod tests` pin locates this arm by exact trimmed-line equality against it.

STEP 1 — re-run the census as a real gate, not a formality. Confirm there are exactly four
production `seam.clearCookies` call sites and no fifth, and likewise exactly four production
`seam.cookiesForDomain` sites (the sibling census arm's callers). Confirm each sentinel/real label
binding, and confirm both `if (!isMac)` early returns. If the census disagrees with
`<planning_measurements>`, say so in the SUMMARY and write the corrected fact.

STEP 2 — delete the stale sentence in BOTH arms. It appears twice in this file: once in the clear
arm and once in the sibling census arm. In each, it is the final sentence of the Epic
pristine-window fallback paragraph — the one beginning `Every other caller` and running to the end
of that paragraph. Keep each paragraph's preceding sentences intact: the structural reasoning
about the pristine window never registering a Tauri-managed window, and the both-conditions
gating, are still correct and still earn their place. Do NOT restate the deleted wording anywhere,
not even as "this used to say" — an acceptance criterion negative-greps the whole file for it and
the target count is zero, file-wide.

STEP 3 — in the CLEAR arm only, extend its Phase 40 plan 04 / D-15 / T-40-04-07 note so that it
carries the WHOLE caller-routing statement, per the todo's own Solution: one statement, not two
that can drift apart again. The extended note must establish all of the following, in the file's
existing comment idiom (ASCII, double-hyphen for a dash, backticked symbol names):

  (a) All four production callers of this arm, named by the symbol that calls it, with the kind of
      label each passes: Humble's `disconnect()` passes a real label from its own `seam.open()`;
      Epic's `clearEpicCookies`, GOG's `clearGogCookiesForLogout` and Amazon's
      `clearAmazonCookiesForLogout` pass sentinel labels that can never name a live window.

  (b) On macOS: Humble alone reaches the window-based branch below, because it alone has a real
      Tauri-registered window. The other three all take THIS fallback — Epic via
      `epic_cookie_domain_matches`, GOG and Amazon via `store_logout_cookie_domain_matches`. Note
      that Humble never depends on the domain check at all: `existing_window.is_none()` is already
      false for it.

  (c) On Windows/Linux: this fallback is compiled out entirely (the branch is cfg-gated to macOS).
      GOG's and Amazon's helpers return early off macOS and never reach this arm at all; Epic's
      step opens a real hidden window there instead of using its sentinel. So off macOS every
      caller that reaches this arm carries a real window label, and no caller is expected to hit
      the `humble_login:no-window:{label}` error by design. State this platform split explicitly —
      a macOS-only claim written as though it were universal is the exact failure being fixed.

  (d) A short lockstep note: this is the single caller-routing statement for BOTH cookie arms;
      a second copy elsewhere is what produced the contradiction being repaired, twice over. Cite
      callers by SYMBOL name, never by line number — line numbers drift and that is how this
      comment went stale.

STEP 4 — in the SIBLING census arm, do NOT duplicate the statement. Having deleted its stale
sentence in STEP 2, add one short line to its own Phase 40 note pointing at the clear arm's
statement as the single source for caller routing (that arm already cross-references the clear
arm's fallback for the mechanism, so this follows an idiom the file already uses). Note in that
line the one fact specific to this arm: its callers are the same four, reaching it through
`seam.cookiesForDomain` rather than `seam.clearCookies`, and Epic's census reuses the very same
`label` binding, so the routing is identical. Duplicating the full statement here would recreate
exactly the two-copies-that-drift condition this task exists to end.

STEP 5 — two literals your new comment must NOT contain, because the window-branch pin reads raw
lines over this arm's scan window and would fail for the wrong reason:
  - the fallback function's name PREFIXED BY the Rust `fn ` keyword. A bare mention of the
    function name is fine and already appears twice in this arm; only the `fn `-prefixed spelling
    is forbidden.
  - the ObjC set-from-slice constructor call spelled `NSSet` followed by the path separator and
    `from_slice`. The pin locates the first raw occurrence of that literal inside the window.
Do not introduce either. If you need to gesture at them, describe them, do not spell them.

Also: this repo is public (T-35-04). The comment carries symbol names, domains and platform
facts only — never a cookie name, cookie value, token, session identifier or account identifier.

Commit `BASE.sha` alongside the source edit. It is the evidence the comment-only claim was
measured against, not scratch — a reviewer can re-run the gate from it months later. Both gates
under `.planning/` scan `.md` files only (confirmed during planning), so a `.sha` file adds no
gate surface.
  </action>
  <verify>
    <automated>
set -u
QD=.planning/quick/260928-tjj-correct-the-stale-caller-routing-comment
# 1. Rust suite green (the repo's own CI command, run in a subshell so cwd is untouched).
OUT=$( (cd src-tauri && cargo test --bin gamelib-shell) 2>&1 ) || { printf '%s\n' "$OUT" | tail -30; echo "GATE FAIL: cargo test exited non-zero"; exit 1; }
printf '%s\n' "$OUT" | tail -5
printf '%s\n' "$OUT" | grep -q 'test result: ok\.' || { echo "GATE FAIL: no 'test result: ok.' line"; exit 1; }
printf '%s\n' "$OUT" | grep -q 'FAILED' && { echo "GATE FAIL: a test FAILED"; exit 1; }
# 2. Stale sentence gone FILE-WIDE (it is 2 before the work, not 1).
test "$(grep -c 'routed through a live Tauri-managed window' src-tauri/src/main.rs)" = "0" || { echo "GATE FAIL: stale sentence still present"; exit 1; }
# 3. Clear arm carries the whole statement.
R=$(sed -n '/"humble_login_clear_cookies" => {/,/let window =/p' src-tauri/src/main.rs)
for T in clearGogCookiesForLogout clearAmazonCookiesForLogout EPIC_COOKIE_CLEAR_NO_WINDOW_LABEL store_logout_cookie_domain_matches epic_cookie_domain_matches 'Windows/Linux'; do
  printf '%s\n' "$R" | grep -q -- "$T" || { echo "GATE FAIL: missing clear-arm anchor: $T"; exit 1; }
done
# 4. Census arm points at it instead of duplicating it.
C=$(sed -n '/"humble_login_cookies_for_domain" => {/,/let window =/p' src-tauri/src/main.rs)
printf '%s\n' "$C" | grep -q 'seam.cookiesForDomain' || { echo "GATE FAIL: census arm missing its own note"; exit 1; }
printf '%s\n' "$C" | grep -q 'humble_login_clear_cookies' || { echo "GATE FAIL: census arm missing pointer to the clear arm"; exit 1; }
# 5. Comment-only, measured against the base pinned by the precondition so this holds
#    whether or not the edit has already been committed.
BASE=$(cat "$QD/BASE.sha") || { echo "GATE FAIL: BASE.sha missing -- precondition was not run"; exit 1; }
D=$(git diff -U0 "$BASE" -- src-tauri/src/main.rs) || { echo "GATE FAIL: git diff failed"; exit 1; }
test -n "$D" || { echo "GATE FAIL: empty diff vs BASE -- this gate would have passed vacuously"; exit 1; }
NONCOMMENT=$(printf '%s\n' "$D" | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' | sed -E 's/^[+-][[:space:]]*//' | grep -cv '^//')
test "$NONCOMMENT" = "0" || { echo "GATE FAIL: $NONCOMMENT non-comment line(s) changed"; exit 1; }
echo ALL_GATES_PASS
    </automated>
    <gate-provenance>
Dry-run against pre-edit source confirms this gate is RED before the work: the stale literal
counts 2 (target 0), four of the six clear-arm anchors are absent, and `seam.cookiesForDomain` is
absent from the census-arm region. It cannot pass for the wrong reason.

Two vacuity traps were found by the plan checker and closed rather than accepted:
  - A bare `git diff` produces NO output once the change is committed, so the comment-only
    assertion would have passed against a committed edit while measuring nothing. It is now taken
    against `BASE.sha`, the SHA pinned by the precondition while the tree was clean, which spans
    committed and uncommitted work alike — and the diff is asserted NON-EMPTY, so the vacuous
    state fails loudly instead of reading green.
  - `git diff` piped straight into `grep` hides its own failure, because a pipeline reports only
    the last stage's status. Its output is now captured and status-checked before anything reads it.

The plan checker still emits its R6 warning against `git diff -U0 "$BASE" -- <path>` because it
looks for a two-dot range literal. That is answered here rather than obeyed, deliberately: the
two-dot form `"$BASE"..HEAD` compares two COMMITS and would be blind to an uncommitted working
tree, which is precisely the state this gate runs in when verify executes before Task 1's commit.
The single-revision form spans committed and uncommitted work alike, which is what the
comment-only property needs, and the non-empty assertion above closes the vacuity hole R6 exists
to catch. Advisory warning, `errors: []`, accepted with reason.
    </gate-provenance>
    <human-check>Not required. Every claim in this task is a source-text property and is asserted mechanically above.</human-check>
    <formatter-check>OMITTED, deliberately, and this omission is the honest answer rather than a gap. Measured under prettier 3.7.4: `npx prettier --file-info src-tauri/src/main.rs` reports `{ "ignored": false, "inferredParser": null }` and `npx prettier --check src-tauri/src/main.rs` exits 2 with "No parser could be inferred" — prettier does not ignore this path but cannot parse it, so a `--check` here is an error, not assurance. Rust formatting is not in scope for this repo's gates and no `cargo fmt` gate exists to piggyback on. The only file this task writes is that one.</formatter-check>
  </verify>
  <done>
`cargo test --bin gamelib-shell` reports 0 failures against the recorded pre-edit baseline.
`src-tauri/src/main.rs` contains zero occurrences of the stale sentence FILE-WIDE (both copies
gone, not just the one the todo named). The clear arm's region names both store helper symbols,
Epic's sentinel constant, both Rust domain matchers, and an explicit Windows/Linux statement. The
census arm's region carries a pointer to the clear arm plus its own `seam.cookiesForDomain` note,
and does not duplicate the statement. `git diff` over `src-tauri/src/main.rs` shows only `//`
comment lines added or removed — zero executable lines changed.
  </done>
  <reversibility rating="reversible">A comment edit in one file, revertible by a single `git revert`; no persisted state, no schema, no API.</reversibility>
</task>

<task type="auto">
  <name>Task 2: Close the source todo — move to completed with a status-word result</name>
  <files>.planning/todos/pending/2026-09-28-stale-arm-comment-claims-gog-amazon-use-a-live-window.md, .planning/todos/completed/2026-09-28-stale-arm-comment-claims-gog-amazon-use-a-live-window.md</files>
  <precondition>Task 1 is committed and its gates passed. Closing the todo before the fix lands would record a pass for work that is not on disk.</precondition>
  <action>
Move the todo and record the outcome, staging and committing the move in ONE invocation.

Use `git mv` for the move (it stages as it moves). CLAUDE.md records that a plain `mv` leaves a
gate crashing until the move is staged; do not use plain `mv`, and do not leave the move
unstaged between commands.

Then edit the moved file's `## Expected / Result` block: its `result:` value must OPEN with a bare
lowercase status word per CLAUDE.md's UAT item shape convention — `pass` — with prose following on
the same key. Do not bold it, do not bracket it, do not put anything before it. The prose must
record, at minimum, the two corrections this task's audit made to the todo's own table:

  - Epic's sentinel label is macOS-conditional, not unconditional — off macOS its step opens a
    real hidden window.
  - GOG's and Amazon's helpers return early off macOS and never reach the Rust arm at all, so the
    corrected comment is platform-split rather than a single universal claim.
  - The same stale sentence appeared TWICE in `main.rs`, not once: the sibling
    `humble_login_cookies_for_domain` arm carried its own copy, and it was fixed in the same pass.

Leave the `severity:`/`platform:`/`ready:` frontmatter keys exactly as they are — CLAUDE.md scopes
the todo frontmatter gate to `pending/` only, and `completed/` is deliberately exempt, so there is
nothing to add or change there. Do not leave a stray closing envelope tag anywhere in the body;
`.planning/planning-envelope-tag-gate.py` scans every planning file.

Then `git add` the edited file and commit the move and the edit together.
  </action>
  <verify>
    <automated>test ! -e .planning/todos/pending/2026-09-28-stale-arm-comment-claims-gog-amazon-use-a-live-window.md &amp;&amp; test -e .planning/todos/completed/2026-09-28-stale-arm-comment-claims-gog-amazon-use-a-live-window.md &amp;&amp; grep -qE '^result: pass( |$)' .planning/todos/completed/2026-09-28-stale-arm-comment-claims-gog-amazon-use-a-live-window.md &amp;&amp; pnpm planning-gates &amp;&amp; echo TODO_CLOSED</automated>
    <formatter-check>OMITTED, deliberately. Measured: `npx prettier --file-info` on the todo path reports `{ "ignored": true, "inferredParser": null }` — `.planning/` is prettier-ignored, so `--check` there matches zero files and exits 0 regardless of content. Per CLAUDE.md that is a green proving nothing and must not be carried. Match the surrounding file's existing wrap and key order by hand instead.</formatter-check>
  </verify>
  <done>
The todo is gone from `pending/`, present in `completed/`, its `result:` line opens with the bare
word `pass` and records both audit corrections, and `pnpm planning-gates` passes.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| (none newly crossed) | This task edits comment text in one Rust file and moves one planning markdown file. No input parsing, no network, no IPC surface, no privilege transition is added, removed or altered. The `humble_login_clear_cookies` arm's own boundary (renderer-originated channel args -> Rust cookie-store access) is untouched and is documented by the arm's existing code. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-tjj-01 | Tampering | `src-tauri/src/main.rs` `humble_login_clear_cookies` arm | medium | mitigate | A comment edit that slipped an executable-line change alongside it would alter a cookie-clearing security control unreviewed. Task 1's `<verify>` asserts the byte-level property directly: every added/removed line in `git diff` must be a `//` comment line, count of non-comment changed lines == 0. |
| T-tjj-02 | Tampering | `mod tests` pins `f_34_4_2_12_...` and `epic_cold_jar_login_timeout_window_branch_...` | medium | mitigate | Both scan this arm's source; the second reads RAW lines for its exclusion and `NSSet` locator assertions, so comment prose can silently break or falsely satisfy them. Task 1 names the two forbidden literals explicitly and gates on the full `cargo test --bin gamelib-shell` run, not a bare `cargo check`, so the pins actually execute. |
| T-tjj-03 | Information disclosure | `src-tauri/src/main.rs` comment text (public repo, T-35-04) | low | mitigate | The rewritten comment is restricted by Task 1's action to symbol names, apex domains and platform facts — never a cookie name, cookie value, token, session identifier or account identifier. |
| T-tjj-04 | Repudiation | `.planning/todos/` | low | mitigate | A todo moved but never committed leaves the fix unattributable and crashes a planning gate. Task 2 requires `git mv` plus a single staged commit, and gates on `pnpm planning-gates`. |
| T-tjj-05 | Information disclosure | correctness of the comment itself | low | accept | A comment cannot enforce anything; its only leverage is on the next reader. Accepted: the mitigation is that the statement is now singular, platform-split, symbol-cited, and was re-derived from live source rather than copied from the todo's table. |

**Package legitimacy:** not applicable — this task runs no `npm`/`pnpm`/`pip`/`cargo` install. `pnpm planning-gates` and `cargo test` execute existing, already-vendored code. No `T-tjj-SC` supply-chain row is warranted, and inserting one would be theatre.

**ASVS L1, block_on=high:** no threat in this register is rated high or critical. Nothing blocks.
</threat_model>

<verification>
1. `(cd src-tauri && cargo test --bin gamelib-shell)` — a `test result: ok.` line and no `FAILED`,
   measured against the pre-edit baseline captured by Task 1's precondition (expected 289 passed /
   0 failed / 2 ignored).
2. `grep -c 'routed through a live Tauri-managed window' src-tauri/src/main.rs` == 0, FILE-WIDE
   (it is 2 before the work, not 1 — the todo undercounts).
3. The clear arm's region (arm literal through `let window =`) contains `clearGogCookiesForLogout`,
   `clearAmazonCookiesForLogout`, `EPIC_COOKIE_CLEAR_NO_WINDOW_LABEL`,
   `store_logout_cookie_domain_matches`, `epic_cookie_domain_matches`, and `Windows/Linux`.
4. The census arm's region contains `seam.cookiesForDomain` and a reference to
   `humble_login_clear_cookies` — a pointer, not a second copy of the statement.
5. The diff of `src-tauri/src/main.rs` taken against the precondition-pinned `BASE.sha` revision
   is non-empty, and every changed line is a `//` comment line. Pinned to an explicit revision
   rather than left rangeless, so it still measures something after the edit is committed.
6. `pnpm planning-gates` passes after the todo move.
7. Formatter checks omitted on BOTH touched paths, each with its measured reason recorded in the
   task's `<formatter-check>` block rather than silently dropped.
</verification>

<success_criteria>
- `src-tauri/src/main.rs` carries ONE cookie-arm caller-routing statement file-wide, not three.
- That statement is true on macOS and on Windows/Linux, and says which is which.
- It names all four callers by symbol and the label kind each passes.
- It was derived from live source: the census was re-run, and the three places the todo was
  incomplete (Epic's macOS-conditional sentinel; GOG/Amazon's off-macOS early return; the second
  stale copy in the sibling census arm) are corrected rather than propagated.
- Zero executable Rust changed. Rust suite still green.
- The todo is in `completed/` with a `result:` opening on a bare status word, and planning gates pass.
</success_criteria>

<output>
Create `.planning/quick/260928-tjj-correct-the-stale-caller-routing-comment/260928-tjj-SUMMARY.md`
when done. Record: the re-run census result (four sites, confirmed or corrected), whether each
planning measurement held against live source, the pre- and post-edit `cargo test` counts, and the
fact that the task brief's own non-macOS assumption was measured false.
</output>
