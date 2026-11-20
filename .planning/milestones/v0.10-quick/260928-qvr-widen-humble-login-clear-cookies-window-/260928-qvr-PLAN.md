---
phase: 260928-qvr
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/main.rs
  - .planning/quick/260928-qvr-widen-humble-login-clear-cookies-window-/COVERAGE.md
autonomous: true
requirements:
  - REQ-34.4.1-06
  - REQ-34.4.1-GAP-03

estimate:
  tokens: 55000
  raw_tokens: 55000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "The `existing_window.is_some()` window-based branch of the `humble_login_clear_cookies` dispatch arm evicts WebKit's native HTTP disk cache and memory cache for a domain's matching data records, alongside cookies, in the same `removeDataOfTypes_forDataRecords_completionHandler` call."
    - "The eviction stays scoped to `matching_records` only — no blanket wipe, no `allWebsiteDataTypes` (REQ-34.4.1-06)."
    - "The branch's doc comment states the JS-observable Cache Storage API vs. WebKit native HTTP disk/memory cache terminology collision plainly, rather than claiming the storage-clear step already owns the cache."
    - "A structural regression pin, scoped to THIS arm only, fails RED if the type-set regresses to cookie-only."
    - "Every caller that actually reaches this branch has been enumerated from source and none relies on the cache surviving a cookie clear."
  artifacts:
    - "src-tauri/src/main.rs — widened `cookies_type_set` construction inside the `humble_login_clear_cookies` arm's macOS window-based branch"
    - "src-tauri/src/main.rs — corrected doc comment above that construction"
    - "src-tauri/src/main.rs — new `#[test] fn epic_cold_jar_login_timeout_window_branch_clear_evicts_disk_and_memory_cache` in `mod tests`"
    - ".planning/quick/260928-qvr-widen-humble-login-clear-cookies-window-/COVERAGE.md — reasoned no-external-API declaration"
  key_links:
    - "The three type bindings must be inside the SAME `NSSet::from_slice(...)` literal that is passed as the first argument to `removeDataOfTypes_forDataRecords_completionHandler` — built-but-not-passed is the failure mode the pin exists to catch."
    - "The regression pin's scan window must be bounded to the `humble_login_clear_cookies` match arm, so it can neither pass nor fail on the already-fixed `clear_default_data_store_cookies_for_domain` site."
---

<objective>
Widen the `existing_window.is_some()` window-based branch of `src-tauri/src/main.rs`'s
`humble_login_clear_cookies` dispatch arm so its native WebKit removal call evicts
`WKWebsiteDataTypeDiskCache` and `WKWebsiteDataTypeMemoryCache` alongside
`WKWebsiteDataTypeCookies`, still scoped to domain-matched records only — closing the twin of
the gap already fixed for the default-store branch in commit `9359883c7`.

Purpose: `.planning/debug/resolved/epic-cold-jar-login-timeout.md` proved that a WebKit HTTP
disk-cache entry written by an earlier authenticated session survives a cookie-only clear inside
the shared, process-wide `WKWebsiteDataStore::defaultDataStore()` and is replayed verbatim to a
later cookie-less webview — serving authenticated-shaped markup that then polls session-dependent
subresources forever. The window-based branch carries the identical construction and the identical
now-known-wrong doc comment. Closing it removes a live stale-authenticated-content replay surface
for Humble disconnect.

Output: a widened type-set, a corrected doc comment, a count-only eviction log, and a structural
regression pin scoped to this arm.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/todos/pending/2026-09-28-epic-cookie-clear-window-branch-shares-the-disk-cache-gap.md
@.planning/debug/resolved/epic-cold-jar-login-timeout.md
</context>

<codebase_exploration_mandate>
`graphify-out/graph.json` exists. Run `graphify query "<question>"` / `graphify explain` /
`graphify path` to orient BEFORE reading or grepping raw source. Only read raw files after
graphify has oriented you, or to inspect specific lines named below that you already know you
need. Pass this mandate on verbatim in any subagent prompt you write.

Note measured at planning time: graphify's index does not resolve `src-tauri/src/main.rs`
internals usefully for this change (a `graphify query` on the cookie-clear construction returned
TS-side nodes only). Orient with it first anyway, then go to the grounded line references below —
those are the product of a live read of `main.rs` at planning time, not of the todo's historical
numbers.
</codebase_exploration_mandate>

<grounded_observations>
Measured against `main.rs` at planning time (15,930 lines). MUTABLE-SCOPE AUTHORITY (#3786): these
are live observations, not the todo's historical numbers — but re-anchor by symbol, not by number,
if the tree has moved under you.

- The `humble_login_clear_cookies` dispatch arm opens at `main.rs:7167`. The line's trimmed form
  is the unique string `"humble_login_clear_cookies" => {`; the next sibling arm
  (`"humble_reveal_post"`) opens at `:7699`, so the arm spans `7167..7699`.
- The macOS `existing_window.is_none()` fallback is `:7206-7212` and returns into
  `clear_default_data_store_cookies_for_domain` (`:4184`) — the ALREADY-FIXED branch. The window
  is unwrapped at `:7214-7215`; everything after that is the window-based branch.
- The target doc comment is `:7432-7439`. The target construction is `:7443-7446`. The removal
  call is `:7458-7465`.
- `NSSet::from_slice` appears exactly twice in real code in this file: `:4328` (already fixed) and
  `:7446` (the target). All other hits are inside the existing test's own string literals.
- The whole target region is inside a `#[cfg(target_os = "macos")]` block (`:7247`); the Windows
  path starts at `:7497`.
- The shipped precedent is `git show 9359883c7` — read it before editing. Its regression test,
  `epic_cold_jar_login_timeout_default_store_clear_evicts_disk_and_memory_cache`, spans
  `:14390-14532`. Insert the new pin immediately after `:14532`, before the deep-link-argv comment
  block at `:14534`.
- Caller census (source-derived at planning time, to be CONFIRMED by Task 1, not assumed):
  `seam.clearCookies` has four call sites — `src/backend/humble/user.ts:1010` (real window label,
  `humblebundle.com`), `src/backend/storeManagers/gog/user.ts:69` and
  `src/backend/storeManagers/nile/user.ts:69` (both pass sentinel no-window labels), and
  `src/backend/storeManagers/legendary/user.ts:400` (label bound at `:290-291`, the macOS arm being
  `EPIC_COOKIE_CLEAR_NO_WINDOW_LABEL`).
- The arm's own comment at `:7185-7188` asserts "Humble/GOG/Amazon, all still routed through a live
  Tauri-managed window" — that sentence PREDATES the Phase 40 plan 04 note at `:7200-7205` which
  moved GOG/Amazon onto sentinel labels. Do not take `:7185-7188` as the audit's answer; derive the
  answer from the label bindings at the four call sites. Do not fix `:7185-7188` either — out of
  scope for this task.
</grounded_observations>

<tasks>

<task type="auto">
  <name>Task 1: Audit which callers actually reach the window-based branch, and whether any relies on the cache surviving</name>
  <files>(read-only — no files modified)</files>
  <action>MANDATORY PRECONDITION TASK. Do not start Task 2 until this one has a written verdict.

Orient with graphify first, then establish from source — not from the arm's own stale comment at
`main.rs:7185-7188` — which callers can reach the widened code at `main.rs:7443-7446`.

For each of the four `seam.clearCookies` call sites listed in the grounded-observations section above, read the
label argument's binding and record whether it is a live Tauri-managed window label (reaches the
window-based branch) or a sentinel no-window label (falls into the already-fixed default-store
branch on macOS via the `:7206-7212` guard). Also record the platform gating: the target code is
inside the `#[cfg(target_os = "macos")]` block at `:7247`, so a non-macOS caller never reaches it
at all.

Then, for every caller you find that DOES reach the branch, answer one question in writing: does it
have any reason to rely on the HTTP disk/memory cache for that domain surviving a cookie clear?
A logout/disconnect path wants the opposite — a genuinely fresh next login. A caller that clears
cookies as part of a session REFRESH while intending to keep cached page assets warm would be the
counter-example.

HALT CONDITION — this is not optional. If the audit finds a caller that legitimately relies on the
cache surviving a cookie clear, STOP. Do not proceed to Task 2, do not widen anything. Write the
finding into the quick task's SUMMARY and report it as the terminal outcome, so the widening can be
re-scoped (e.g. behind a caller-supplied flag) rather than shipped blind. A halt here is a correct
completion of this plan, not a failure.

Record the verdict — the enumerated caller list, the label binding for each, and the reliance
answer — in the quick task SUMMARY under a heading naming it as the Task 1 audit. It is the
evidence that Task 2's precondition was met.</action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && N=$(grep -rn "seam\.clearCookies(" src/ | grep -v __tests__ | grep -v ':[[:space:]]*\(//\|\*\)' | tee /dev/stderr | grep -c .); test "$N" -ge 4</automated>
    <human-check>This gate is a FLOOR, not the audit: it only proves the four known call sites are still findable and prints them. The audit itself is the SUMMARY entry. Confirm the SUMMARY classifies EVERY site the command printed — not just four — as window-label or sentinel-label, and carries an explicit written "no caller relies on cache survival" (or a HALT). If the command printed more than four, the extra sites are new since planning and must be classified too.</human-check>
  </verify>
  <done>Every `seam.clearCookies` call site the floor gate printed is enumerated in the SUMMARY with its label binding cited, and each site that reaches the window-based branch carries a written reliance answer. Either the verdict is "none relies on cache survival" (proceed to Task 2) or the plan has halted with the dependent caller named.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add the arm-scoped structural regression pin and prove it RED against the current cookie-only code</name>
  <precondition>Task 1's audit concluded in writing that no caller reaching the window-based branch relies on the HTTP disk/memory cache surviving a cookie clear.</precondition>
  <files>src-tauri/src/main.rs</files>
  <behavior>
    - Against the CURRENT, un-widened code the new test must FAIL, with the assertion message naming the missing disk-cache type. A structural pin that has never been observed red proves nothing.
    - After Task 3's widening the same test must PASS, unmodified.
    - The pin must be blind to the already-fixed `clear_default_data_store_cookies_for_domain` site: deleting Task 3's widening while leaving `main.rs:4328` intact must still turn it red.
    - The pin must fail if the three type bindings are constructed but never passed to the native removal call.
  </behavior>
  <action>Read `git show 9359883c7` first and mirror the shape of
`epic_cold_jar_login_timeout_default_store_clear_evicts_disk_and_memory_cache`
(`main.rs:14390-14532`) — same `include_str!("main.rs")` source-scan discipline, same
`non_comment_contains` helper that skips lines whose trimmed form starts with a line-comment marker
or a block-comment continuation star, same `concat!`-built assertion messages that each name the
defect and cite `.planning/debug/resolved/epic-cold-jar-login-timeout.md`.

Name the new test `epic_cold_jar_login_timeout_window_branch_clear_evicts_disk_and_memory_cache`
and insert it immediately after the existing pin's closing brace at `main.rs:14532`, before the
deep-link-argv comment block at `:14534`.

The scan boundary is the one material difference from the precedent, and it must be derived
correctly: this site is a MATCH ARM, not a top-level `fn`, so the precedent's column-0 `fn`
boundary does not apply. Use the arm-boundary matcher that
`f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated` (`main.rs:14240`, specifically its
`:14265-14269` block) already proves works on this file: a line whose trimmed form starts with a
double-quote and ends with the arrow-and-open-brace arm terminator. Start at the unique line whose
trimmed form equals the `humble_login_clear_cookies` arm opener; end at the next line matching that
same arm-boundary shape. Give both boundary lookups an `expect(concat!(...))` message instructing a
future reader to re-derive the boundary from a fresh measurement if the shape has changed, rather
than to loosen the match string — mirroring the precedent's own wording.

Assert, within that window: `WKWebsiteDataTypeCookies`, `WKWebsiteDataTypeDiskCache` and
`WKWebsiteDataTypeMemoryCache` each appear on a non-comment line; the first `NSSet::from_slice`
construction in the window has all three local bindings (`cookies_type`, `disk_cache_type`,
`memory_cache_type`) within 8 lines of its opening; and
`removeDataOfTypes_forDataRecords_completionHandler` and `&cookies_type_set` each appear on a
non-comment line. Add one assertion the precedent does not need: the window must NOT be the
default-store function — assert the window does not contain the
`clear_default_data_store_cookies_for_domain` declaration, so a future boundary drift cannot make
this pin silently re-measure the already-fixed site and pass for the wrong reason.

Above the test, write the same style of block comment the precedent carries: why a live end-to-end
reproduction is not automatable here (it needs a real contended AppKit/WebKit run loop plus a
previously-authenticated long-lived process state that ten standalone harness attempts could never
reproduce — see the debug session's own Evidence), why the pin is therefore structural, and that
this pin is scoped to the window-based branch specifically, the twin the parent session deliberately
left unfixed.

Do NOT widen the type-set in this task. Commit the test on its own so the red observation is a real,
separately-recorded state.</action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib/src-tauri && cargo check --bin gamelib-shell</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib/src-tauri && cargo test --bin gamelib-shell epic_cold_jar_login_timeout_window_branch_clear_evicts_disk_and_memory_cache 2>&1 | tee /dev/stderr | grep -qE 'test result: FAILED\.' </automated>
    <human-check>The failure output is the new pin's own assertion message naming the missing disk-cache type — not a compile error and not a panic from some other test.</human-check>
  </verify>
  <done>The new test exists, compiles, and is observed RED against the un-widened code with its own disk-cache assertion message. `cargo check` is clean. The red state is committed on its own.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Widen the window-based branch's type-set, correct the doc comment, and verify GREEN</name>
  <precondition>Task 2's pin has been observed RED against the un-widened code and committed.</precondition>
  <files>src-tauri/src/main.rs, .planning/quick/260928-qvr-widen-humble-login-clear-cookies-window-/COVERAGE.md</files>
  <reversibility rating="reversible">A three-binding type-set widening plus comment text; revertible by restoring the single-element set literal. No schema, no persisted format, no dependency.</reversibility>
  <behavior>
    - Task 2's pin flips RED to GREEN with no edit to the test.
    - `clear_default_data_store_cookies_for_domain`'s own existing pin stays GREEN — this change must not disturb the already-fixed site.
    - The full Rust suite's only failure is the pre-existing, unrelated `f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated`, confirmed by A/B rather than assumed.
  </behavior>
  <action>Mirror `git show 9359883c7`'s default-store change exactly, applied to the window-based
branch at `main.rs:7432-7446`.

Code change at `:7443-7446`: keep the existing `cookies_type` binding and add two siblings,
`disk_cache_type` bound to `objc2_web_kit::WKWebsiteDataTypeDiskCache` and `memory_cache_type`
bound to `objc2_web_kit::WKWebsiteDataTypeMemoryCache`, each read inside the same `unsafe` extern-
static read the cookies binding already uses. Build `cookies_type_set` from a three-element slice
of those bindings. Extend the existing SAFETY comment to name all three statics, as the precedent's
does. Add a `matched_record_count` binding from `matching_records.len()` and an `eprintln!` before
the removal call reporting that the window branch is evicting cookies plus HTTP disk/memory cache
for that many matching data records — COUNT ONLY, domain-scoped, and say so in the message, exactly
as the precedent's log line does. Never log a record display name or a cookie value
(T-34.4.1-39/-75/-91). Leave the `removeDataOfTypes_forDataRecords_completionHandler` call itself,
the `matching_records` filter, and the `records_array` construction untouched — the eviction stays
scoped to domain-matched records. Do not reach for `allWebsiteDataTypes`; REQ-34.4.1-06 forbids a
blanket wipe and the same jar holds Epic/GOG/Amazon cookies.

Doc comment at `:7432-7439`: this is the part that must be rewritten rather than patched. The
existing text is actively misleading — it attributes the cache categories to the separate
origin-scoped storage clear. Replace it with the correction the precedent already wrote for the
default-store branch, in this branch's own voice: the JS-observable Cache Storage API is
`WKWebsiteDataTypeFetchCache` and IS covered by `humble_login_clear_storage`'s injected script;
WebKit's native HTTP resource cache is `WKWebsiteDataTypeDiskCache` / `WKWebsiteDataTypeMemoryCache`
and is NOT, because no JS API for it exists — only this native removal call. State plainly that this
terminology collision is the root cause of the parent defect. Cite the debug session path, note this
is the twin site the parent session deliberately left unfixed (the todo at
`.planning/todos/pending/2026-09-28-epic-cookie-clear-window-branch-shares-the-disk-cache-gap.md`),
and record that the scope stays `matching_records` per REQ-34.4.1-06. Keep the surviving true part
of the original text: `removeDataOfTypes` removes only the types named here, never the whole record,
so localStorage/IndexedDB remain the storage-clear step's business.

Do not touch `USER_AGENTS`, `EPIC_LOGIN_URL`, or `matchOAuthRedirect`. Do not add hosts. Do not
change cookie names. Do not edit the stale caller sentence at `:7185-7188`.

API-coverage hook: the detector was run at planning time over this task's scope and returned
`detected: true` on a single signal — the noun "api" inside the phrase "Cache Storage API", which is
the WebKit terminology this change exists to disambiguate, not an integration. Per the hook's own
instruction for a false positive, write `COVERAGE.md` in the quick task directory containing exactly
one declaration line beginning `No external API integration:` and giving the reason — that this
change widens an existing native WebKit removal call's data-type set in already-shipped code and
adds no external service, SDK, or dependency. Do not fabricate a capability matrix.

Formatter, per CLAUDE.md: run `npx prettier --file-info` on each path this task writes and act on the
answer. Measured at planning time, `src-tauri/src/main.rs` returns `ignored: false` with a null
inferred parser — prettier does not ignore the path but has no Rust parser, so `--check` would match
zero files and is genuinely not applicable. Record that verdict in the SUMMARY in those terms; do
NOT run a `--check` over it and present the resulting green as assurance, and never scope a check to
a bare dot. `COVERAGE.md` sits under `.planning/`, which is prettier-ignored, so a check there is
vacuous for a different reason — state that too rather than running it. Match the surrounding
corpus by hand instead. Run `cargo fmt --check` on the crate if it is already part of the project's
routine; if it is not configured, say so rather than inventing a gate.

Finally, per CLAUDE.md, run `graphify update .` after the source change (its output tree is
gitignored, so nothing to stage).</action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib/src-tauri && cargo check --bin gamelib-shell</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib/src-tauri && cargo test --bin gamelib-shell epic_cold_jar_login_timeout 2>&1 | tee /dev/stderr | grep -qE 'test result: ok\. 2 passed'</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib/src-tauri && cargo test --bin gamelib-shell 2>&1 | tee /dev/stderr | grep -qE 'test result: FAILED\..* 1 failed;'</automated>
    <human-check>The full-suite line shows exactly one failure and it is `f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated`. That failure is confirmed PRE-EXISTING by A/B — `git stash`, re-run that one test, observe the same cfg-string-mismatch failure on unmodified source, `git stash pop` — and the A/B is recorded in the SUMMARY. Assuming it is pre-existing is not acceptable; the parent session measured 287/290 with this same single failure, but this change adds lines to the very arm that test scans, so the A/B is what establishes it.</human-check>
    <human-check>`npx prettier --file-info src-tauri/src/main.rs` was run and its verdict recorded as N/A-with-reason. No vacuous `--check` green is presented as assurance.</human-check>
  </verify>
  <done>Task 2's pin passes unmodified; the default-store pin still passes; `cargo check` is clean; the full Rust suite's only failure is the named pre-existing one, confirmed by a recorded stash A/B. `COVERAGE.md` carries the reasoned no-external-API declaration. The doc comment names the Cache-Storage-API-vs-native-HTTP-cache collision explicitly. The removal call is still scoped to `matching_records`.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| remote storefront origin → WKWebView | Untrusted, cacheable HTTP responses from `humblebundle.com` (and any other domain reaching this branch) cross into the process-wide `WKWebsiteDataStore::defaultDataStore()`. |
| authenticated session → post-logout session | A logout/disconnect is asserted as a security boundary; anything that survives it and is later replayed crosses that boundary. |
| sidecar RPC → Rust shell dispatch arm | Caller-supplied `label` and `domain` arrive as JSON args at `main.rs:7167-7175`; the domain drives which records are matched for removal. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-260928-qvr-01 | Information Disclosure | `humble_login_clear_cookies` window-based branch removal call, `main.rs:7443-7465` | high | mitigate | Task 3 widens the removal type-set to `WKWebsiteDataTypeDiskCache` + `WKWebsiteDataTypeMemoryCache`, so an earlier authenticated session's cached response for the domain cannot be replayed into a post-logout, cookie-less webview. This is the whole point of the change. |
| T-260928-qvr-02 | Denial of Service | over-widened eviction scope | medium | mitigate | Scope stays `matching_records` (domain-suffix-matched via `website_data_record_matches_domain`, `main.rs:7410-7427`). `allWebsiteDataTypes` and any blanket wipe are prohibited by REQ-34.4.1-06 — the jar is app-wide and holds Epic/GOG/Amazon cookies. Task 2's pin asserts the set is built from exactly the three named bindings and is passed to the removal call. |
| T-260928-qvr-03 | Information Disclosure | the new eviction log line | medium | mitigate | The `eprintln!` reports a COUNT only, mirroring the precedent at `main.rs:4339-4341`. Record `displayName()` values and cookie values are never logged (T-34.4.1-39/-75/-91); the existing filter's own SAFETY comment at `:7414-7418` already binds this. |
| T-260928-qvr-04 | Tampering | silent regression of the widened set back to cookie-only | medium | mitigate | Task 2's arm-scoped structural pin, observed RED before the fix and GREEN after, with an explicit assertion that its scan window is not the already-fixed default-store function. |
| T-260928-qvr-05 | Elevation of Privilege | a caller that depends on cache survival being broken by this change | medium | mitigate | Task 1 enumerates every caller reaching the branch from source and answers the reliance question in writing, with a hard halt if any caller depends on the cache surviving. Ordered before the edit. |
| T-260928-qvr-SC | Tampering | npm/pip/cargo installs | low | accept | No package-manager install is in scope. `objc2_web_kit::WKWebsiteDataTypeDiskCache` and `WKWebsiteDataTypeMemoryCache` are already-linked extern statics from the existing `objc2-web-kit` dependency, in use at `main.rs:4325-4333` since commit `9359883c7`. No dependency is added, upgraded, or introduced, so the package-legitimacy gate has nothing to audit. |

ASVS: no level is configured in `.planning/config.json`; treated as L1. Every threat above carries a
disposition and a severity.
</threat_model>

<hook_dispositions>
Four `plan:pre` contribution hooks with `into: planner` were resolved verbatim via
`gsd-tools.cjs loop render-hooks plan:pre --raw` and applied on their own terms.

- **security** (`workflow.security_enforcement`) — APPLIES. `security_enforcement` is absent from
  `.planning/config.json`, which means enabled. `<threat_model>` above is the product.
- **ai-integration** (`workflow.api_coverage_gate`) — detector RAN, returned
  `detected: true` on exactly one signal: `{"verb":"(surface)","noun":"api"}` matched inside the
  phrase "Cache Storage API" in the todo prose. Per the hook's own false-positive instruction, the
  reasoned declaration goes to `COVERAGE.md` (Task 3) rather than a fabricated matrix. This change
  integrates no external API, SDK, or service — it widens a data-type set on an existing native
  WebKit call.
- **assumption-delta** (`workflow.assumption_delta`) — DOES NOT FIRE. Advisory and non-blocking; it
  fires on a singular→plural / required→optional / derived→chosen transition in the phase's
  identity model. Adding two constants to an existing removal type-set introduces no second case of
  any modeled entity and raises no identity-model question. No checkpoint raised.
- **schema-gate** (`workflow.schema_push_detection`) — DOES NOT FIRE. No ORM schema files are in
  scope (the only source file touched is `src-tauri/src/main.rs`). Skipped silently per the hook.
</hook_dispositions>

<verification>
1. `cd src-tauri && cargo check --bin gamelib-shell` — clean.
2. `cd src-tauri && cargo test --bin gamelib-shell epic_cold_jar_login_timeout` — 2 passed (the
   existing default-store pin plus the new window-branch pin).
3. `cd src-tauri && cargo test --bin gamelib-shell` — full suite. Expect one failure,
   `f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated`. Confirm it is pre-existing by
   `git stash` / re-run / `git stash pop` A/B and record the A/B in the SUMMARY. Do not assume it.
4. RED→GREEN evidence: Task 2's committed red observation, then Task 3's green with the test
   unmodified.
5. Formatter: `npx prettier --file-info src-tauri/src/main.rs` returns a null inferred parser —
   `--check` is not applicable to Rust and is deliberately NOT run. `COVERAGE.md` is under
   prettier-ignored `.planning/`, so a check there is vacuous and is deliberately NOT run. Both
   verdicts stated in the SUMMARY rather than replaced by a green that proves nothing.
6. `graphify update .` after the source change.
</verification>

<success_criteria>
- The window-based branch's `NSSet::from_slice` literal carries `cookies_type`, `disk_cache_type`
  and `memory_cache_type`, and that set is the one passed to
  `removeDataOfTypes_forDataRecords_completionHandler`.
- The removal is still scoped to `matching_records` — no blanket wipe, no `allWebsiteDataTypes`
  (REQ-34.4.1-06).
- The doc comment states the Cache Storage API vs. native HTTP disk/memory cache collision plainly
  and cites the parent debug session.
- `epic_cold_jar_login_timeout_window_branch_clear_evicts_disk_and_memory_cache` exists, was
  observed RED before the fix, passes after it, and is scoped so it cannot be satisfied by the
  already-fixed default-store site.
- The Task 1 caller audit verdict is written down, with each of the four `seam.clearCookies` sites
  classified by label binding.
- The pending todo
  `.planning/todos/pending/2026-09-28-epic-cookie-clear-window-branch-shares-the-disk-cache-gap.md`
  is closed (moved to `completed/`) with its `result:` updated from `pending` to a bare leading
  status word, per CLAUDE.md's UAT item shape.

A HALT from Task 1 — a named caller that legitimately relies on the cache surviving a cookie clear,
reported rather than worked around — is also a successful completion of this plan.
</success_criteria>

<output>
Create `.planning/quick/260928-qvr-widen-humble-login-clear-cookies-window-/260928-qvr-SUMMARY.md`
when done.
</output>
