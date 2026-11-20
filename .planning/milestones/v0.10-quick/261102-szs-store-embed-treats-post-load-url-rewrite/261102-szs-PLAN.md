---
phase: quick-261102-szs
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/main.rs
  - src/frontend/screens/WebView/storeExitRefresh.ts
  - src/frontend/screens/WebView/__tests__/storeExitRefresh.test.ts
autonomous: true
requirements: [TODO-2026-11-02-amazon-store-no-back-navigation-after-claim]

must_haves:
  truths:
    - "In /store/amazon, pressing the embed's Back repeatedly from a claim view reaches the grid and Back then disables (no endless same-page reload loop)"
    - "Forward still returns to the claim view after Back"
    - "A URL rewrite by the page within STORE_EMBED_LANDING_SETTLE of a Back/Forward/Reload landing replaces the current entry in place; outside the window behaviour is exactly sk8's"
    - "Steam/GOG Back/Forward and store-switch isolation unchanged"
    - "Shell log names the outcome (recorded|replaced|moved) and host only"
    - "Leaving an Amazon session on luna.amazon.com arms the store-exit refresh; lookalike hosts do not"
  artifacts:
    - path: "src-tauri/src/main.rs"
      provides: "settle window on StoreEmbedState (push_at, observe_live_url_at, StoreEmbedHistoryChange, STORE_EMBED_LANDING_SETTLE) + new tests"
      contains: "STORE_EMBED_LANDING_SETTLE"
    - path: "src/frontend/screens/WebView/storeExitRefresh.ts"
      provides: "AMAZON_HOSTS includes luna.amazon.com"
      contains: "luna.amazon.com"
  key_links:
    - from: "on_page_load Finished handler in store_embed_open"
      to: "StoreEmbedState::push_at"
      via: "state.push_at(url, std::time::Instant::now())"
      pattern: "push_at\\("
    - from: "store_embed_take_nav_events"
      to: "StoreEmbedState::observe_live_url_at"
      via: "observe_live_url_at(live, generation, Instant::now())"
      pattern: "observe_live_url_at\\("
---

<objective>
Stop the Amazon store-embed Back loop introduced visibly by sk8.

Live evidence (operator, 2026-11-02, after sk8): the Amazon store runs on `luna.amazon.com`. Every
Back press logged exactly one `[shell] store_embed: same-document navigation recorded
host=luna.amazon.com` (18 in a row, then 11 more), each Back reloading the same page with Back
staying enabled. So the loop is the SAME-ORIGIN `observe_live_url` path: Back =
`webview.navigate(previous recorded URL)` = full SPA reload; its Finished push is consumed by
`suppress_next_push`; luna then `pushState`s to a different path on boot. First cycle: the
rewrite is neither prev nor next, so it is pushed (truncating the claim, `canGoBack` true). Every
later cycle: the rewrite equals `history[cursor+1]`, so the "page-initiated forward" branch moves
the cursor forward again -- the 18-in-a-row loop (sk8 logs "recorded" for both branches).

Fix: a post-landing settle window. When a chrome-initiated navigation (back/forward/reload/
navigate -- i.e. a SUPPRESSED Finished) lands, stamp `settle_until = now +
STORE_EMBED_LANDING_SETTLE`. Within it, any new URL from `observe_live_url_at` (same-origin) or
from a non-suppressed Finished `push_at` (any origin; covers a luna-style hop, kept because it is
the same check at no extra cost) REPLACES `history[cursor]` in place instead of
appending/moving. Outside the window, sk8 behaviour exactly.

Plus one measured-host item: add `luna.amazon.com` to `AMAZON_HOSTS` in `storeExitRefresh.ts`.

Output: `src-tauri/src/main.rs` (settle window, diagnostic, tests), `storeExitRefresh.ts` + test.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/261102-sk8-store-embed-records-spa-same-document-na/261102-sk8-SUMMARY.md
@.planning/todos/pending/2026-11-02-amazon-store-no-back-navigation-after-claim.md

Skill("gamelib-conventions") -- the `<verify>` prettier rule applies to Task 2 only (Task 1
touches no prettier-handled file).

<interfaces>
From src-tauri/src/main.rs (as of f8782dbbf; line numbers approximate, grep the names):
- `use std::time::Duration;` already at line 35. `Instant` is used fully qualified elsewhere.
- `const STORE_EMBED_NAV_EVENTS_CAP: usize = 50;` (~6261) -- put the new const beside it, same cfg.
- `struct StoreEmbedState` (~6282), `#[derive(Default)]`, fields: `history: Vec<String>`,
  `cursor: usize`, `pending_nav_events: Vec<Value>`, `suppress_next_push: bool`,
  `store_key: Option<String>`, `parked: HashMap<String,(Vec<String>,usize)>`,
  `page_loading: bool`, `nav_generation: u64`.
- `fn push(&mut self, url: String)` (~6335): clears page_loading, bumps generation, consumes
  suppression and returns; equal-to-current enqueues and returns; else truncates forward, appends,
  enqueues.
- `fn begin_page_load(&mut self)`, `fn nav_generation(&self) -> u64`.
- `fn observe_live_url(&mut self, live_url: &str, observed_generation: u64) -> bool` (~6392):
  no-op guards (stale gen, suppressed, loading, empty, equal, parse fail, cross-origin), then
  prev-match -> cursor-1; next-match -> cursor+1; same path -> replace in place; else push.
- `fn enqueue_nav_event`, `fn clear`, `fn select_store`, `fn prepare_open`, `fn go_back`,
  `fn go_forward`, `fn arm_reload_suppression`, `fn current_url`, `can_go_back`, `can_go_forward`.
- on_page_load in `store_embed_open` (~6899): Finished -> `state.push(payload.url().to_string())`.
- `store_embed_take_nav_events` (~7611): snapshots generation, reads `webview.url()` lock-free,
  then `if state.observe_live_url(live.as_str(), generation) { shell_eprintln!("[shell]
  store_embed: same-document navigation recorded host={}", live.host_str().unwrap_or("")) }`.
- `store_embed_navigate` (~7775) calls `state.push(url)` then `arm_reload_suppression()` -- leave
  it on plain `push()`; its own Finished is the suppressed landing that opens the window.
- sk8 tests live at ~19250-19390 (`store_embed_observe_*`, `store_embed_back_after_observed_push_returns_previous`,
  `store_embed_finished_after_observed_commit_does_not_double_push`). Each test is
  `#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))] #[test]`.

From src/frontend/screens/WebView/storeExitRefresh.ts (~111-123):
- `const AMAZON_HOSTS = new Set(['gaming.amazon.com'])`, followed by a CANDIDATE comment ending
  "Any redirect host (e.g. luna.amazon.com) is added after measurement, not guessed."
- `httpsSegments(url, hosts)` matches the hostname EXACTLY and requires `https:`.
Test file `__tests__/storeExitRefresh.test.ts` ~158-170: `cases.amazon.yes` / `cases.amazon.no`
arrays driven by `it.each` in `describe('isPurchaseIntentUrlFor (quick 261030-ts4)')`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Post-landing settle window in StoreEmbedState + outcome diagnostic</name>
  <files>src-tauri/src/main.rs</files>
  <behavior>
    New tests, placed right after `store_embed_finished_after_observed_commit_does_not_double_push`.
    Use a fixed `let t0 = std::time::Instant::now();` and offsets via `t0 + Duration::from_millis(..)`.
    Build histories with `push_at(.., t0)` (non-suppressed pushes never open the window).
    - store_embed_settle_same_origin_rewrite_after_back_replaces_in_place: push_at home, claim,
      detail (luna.amazon.com paths); go_back (cursor 1 = claim); push_at(claim, t0) [suppressed,
      opens window]; take events; observe_live_url_at("https://luna.amazon.com/claims/x-canon",
      gen, t0+500ms) == Some(Replaced); history.len()==3; history[1] is the rewrite; history[2]
      still detail (forward preserved); can_go_back() still true; can_go_forward() true; exactly
      one nav event queued.
    - store_embed_settle_rewrite_equal_to_next_entry_replaces_not_moves (the measured loop
      shape): history [L1, L1c] cursor 1; go_back; push_at(L1, t0); observe_live_url_at(L1c, gen,
      t0+500ms) -> cursor stays 0, can_go_back() false (the adjacent duplicate collapses, see
      action), outcome Replaced.
    - store_embed_settle_cross_origin_finished_push_replaces: history [gaming.amazon.com/,
      luna.amazon.com/claim]; go_back; push_at("https://gaming.amazon.com/", t0);
      begin_page_load(); push_at("https://luna.amazon.com/claims/home", t0+1s) == Some(Replaced);
      len 2; history[0] is the luna URL; cursor 0; can_go_forward() true.
    - store_embed_settle_expired_rewrite_appends_as_before: same as the first test but observe at
      t0 + STORE_EMBED_LANDING_SETTLE + 1ms -> Some(Recorded); forward entry truncated, rewrite
      appended, cursor at last (sk8 semantics).
    - store_embed_settle_not_opened_by_a_plain_finished_push: push_at a, then push_at b at t0
      (no suppression) then observe_live_url_at(c, gen, t0+100ms) -> Some(Recorded), appended.
    - store_embed_settle_repeated_back_terminates_under_rewrite_on_every_load: history of 4
      luna paths (/h, /p1, /p2, /p3) at cursor 3; simulate the page with `rewrite(u) = if
      u.ends_with("/canon") { u } else { u + "/canon" }`; loop at most 10 times: `let Some(url) =
      state.go_back() else break;` then push_at(url.clone(), t) and, if rewrite(url) != url,
      observe_live_url_at(rewrite(url), gen, t+400ms), advancing t by 2s per iteration. Assert
      the loop broke on go_back()==None within 3 successful Backs, can_go_back() false,
      cursor 0.
    - All existing tests compile and pass unchanged (legacy `push`/`observe_live_url` keep sk8
      semantics and never consult the window).
  </behavior>
  <action>
    RED first: add the tests above, run, confirm they fail to compile (missing `push_at`,
    `observe_live_url_at`, `StoreEmbedHistoryChange`, `STORE_EMBED_LANDING_SETTLE`), commit
    `test(261102-szs): add failing tests for post-landing settle window`.

    GREEN:
    (1) Add `const STORE_EMBED_LANDING_SETTLE: Duration = Duration::from_secs(3);` beside
    `STORE_EMBED_NAV_EVENTS_CAP`, same cfg, with a doc comment giving the rationale: luna's SPA
    rewrites its URL on boot after a full reload (live 2026-11-02, 18 recorded steps for 18 Back
    presses); the nav drain polls every 250 ms; 3 s covers a slow boot while keeping the window in
    which a genuine user click is mis-read short. State the trade-off: a real click within the
    window after a Back/Forward/Reload landing replaces the current entry instead of adding a
    Back step. And the limit: a boot rewrite slower than 3 s still adds a step (the diagnostic
    below will show `recorded` right after a Back if so -- tune the const then).

    (2) Add `#[derive(Debug, Clone, Copy, PartialEq, Eq)] enum StoreEmbedHistoryChange { Recorded,
    Replaced, Moved }` (same cfg) with a `fn as_str(self) -> &'static str` returning
    "recorded"/"replaced"/"moved".

    (3) Add field `settle_until: Option<std::time::Instant>` to `StoreEmbedState` (Default gives
    None) with a doc comment. Reset it to None in `clear()`, `select_store()` (swap path),
    `go_back()`, `go_forward()`, `arm_reload_suppression()` -- a new chrome navigation's own
    landing re-stamps it. Do NOT reset in `begin_page_load()` (the cross-origin hop is itself a
    page load inside the window).

    (4) Refactor `push` into a private `push_inner(&mut self, url: String, now: Option<Instant>)
    -> Option<StoreEmbedHistoryChange>`; `push(url)` calls `push_inner(url, None)` and discards
    the result (exact sk8 behaviour, so existing callers/tests are untouched); new
    `push_at(&mut self, url: String, now: Instant) -> Option<StoreEmbedHistoryChange>` calls
    `push_inner(url, Some(now))`. In `push_inner`: suppressed path -> if `now` is Some, set
    `settle_until = Some(now + STORE_EMBED_LANDING_SETTLE)`; return None. Equal-to-current ->
    enqueue, return None. If `now` is Some and within the window (`now < settle_until`) and
    history is non-empty -> `replace_current(url)` and return Some(Replaced). Otherwise the
    existing truncate/append/enqueue, return Some(Recorded).

    (5) Private helper `replace_current(&mut self, url: String)`: set `history[cursor] = url`;
    collapse an adjacent duplicate it created -- if `history[cursor+1]` equals it, remove that
    entry; else if cursor > 0 and `history[cursor-1]` equals it, remove `history[cursor]` and
    decrement cursor; then `enqueue_nav_event()`. Rationale (doc comment): on luna the rewrite
    target is usually the very entry Back just left, so without the collapse Back would walk
    through identical-looking duplicates.

    (6) Refactor `observe_live_url` the same way: private `observe_inner(live_url, gen, now:
    Option<Instant>) -> Option<StoreEmbedHistoryChange>`; `observe_live_url(..) -> bool` =
    `observe_inner(.., None).is_some()` (sk8 semantics); new `observe_live_url_at(&mut self,
    live_url: &str, observed_generation: u64, now: Instant) -> Option<StoreEmbedHistoryChange>`.
    In `observe_inner`, keep every existing no-op guard in its current order (including the
    cross-origin no-op -- the cross-origin case is covered by `push_at`). Immediately after the
    guards, if `now` is within the window -> `replace_current(live_url.to_string())`, return
    Some(Replaced). Otherwise the existing branches, mapping prev/next cursor moves to Moved, the
    same-path in-place replace to Replaced, and the push to Recorded (call `push_inner(..,
    None)` for that push so it cannot re-enter the window logic). Extend the observe doc comment
    with the settle behaviour and the 2026-11-02 luna evidence.

    (7) Wire production: on_page_load Finished calls `state.push_at(payload.url().to_string(),
    std::time::Instant::now())`; if it returns Some(Replaced), `shell_eprintln!("[shell]
    store_embed: page load replaced host={}", payload.url().host_str().unwrap_or(""))` (do the
    log after the lock guard's last use is fine; host only, never the full URL -- D-23).
    `store_embed_take_nav_events` calls `observe_live_url_at(live.as_str(), generation,
    std::time::Instant::now())` and on Some(change) logs `"[shell] store_embed: same-document
    navigation {} host={}", change.as_str(), host` (host only). Leave `store_embed_navigate` on
    plain `push()`.

    Initial-load decision (document in the `settle_until` doc comment): the window does NOT
    follow a store's first load. A first load's Finished is a non-suppressed push, so covering it
    needs a separate open-path arming flag rather than this same mechanism; with this fix the
    worst case of an initial canonicalization rewrite is one extra Back step whose landing is
    then itself settled, so it terminates. Revisit only if the new diagnostic shows it.

    Run `cargo fmt`, then the verify commands. Commit `fix(261102-szs): settle post-landing URL
    rewrites in store embed history`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib/src-tauri && cargo test --bin gamelib-shell store_embed && cargo fmt -- --check</automated>
  </verify>
  <done>All new settle tests pass; every pre-existing store_embed test passes unmodified (git diff
  shows no edits inside existing test bodies); fmt clean; on_page_load uses push_at and the drain
  uses observe_live_url_at with outcome+host logging.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add measured luna.amazon.com to AMAZON_HOSTS</name>
  <files>src/frontend/screens/WebView/storeExitRefresh.ts, src/frontend/screens/WebView/__tests__/storeExitRefresh.test.ts</files>
  <behavior>
    - cases.amazon.yes gains 'https://luna.amazon.com/claims/home' and 'https://luna.amazon.com'.
    - cases.amazon.no gains 'http://luna.amazon.com/', 'https://luna.amazon.com.attacker.net/',
      'https://attacker.net/?u=luna.amazon.com', 'https://evilluna.amazon.com/'.
  </behavior>
  <action>
    RED: add the cases to the existing `amazon` yes/no arrays (same shape as the gaming.amazon.com
    anti-spoofing rows; no new describe block), run, see the luna yes rows fail. GREEN: change
    `AMAZON_HOSTS` to `new Set(['gaming.amazon.com', 'luna.amazon.com'])`. Rewrite the last
    sentence of the CANDIDATE comment: luna.amazon.com is now measured -- the live 2026-11-02 shell
    log (quick 261102-szs) showed the Amazon store's pages running on host=luna.amazon.com -- so it
    is listed; any further redirect host is still added only after measurement, not guessed.
    Exact-hostname matching via `httpsSegments` is unchanged. Commit
    `fix(261102-szs): arm Amazon store-exit refresh on luna.amazon.com` (may be combined with the
    test commit if RED is trivial; keep the RED run in the summary).
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --selectProjects Frontend src/frontend/screens/WebView/__tests__/storeExitRefresh.test.ts && npx prettier --check src/frontend/screens/WebView/storeExitRefresh.ts src/frontend/screens/WebView/__tests__/storeExitRefresh.test.ts</automated>
  </verify>
  <done>Frontend storeExitRefresh suite green incl. new luna rows; lookalikes rejected; prettier
  clean on both paths (both checked with --file-info: not ignored).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| embed page -> shell history | Untrusted store page controls its URL (pushState / redirects) |
| URL -> store-exit arming | Host allowlist decides whether a nile sync is armed |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-szs-01 | Denial of Service | StoreEmbedState settle window | mitigate | Window is fixed from the landing (never extended by a replace) and replace never grows history, so a page rewriting in a loop cannot grow the stack; event queue stays capped by STORE_EMBED_NAV_EVENTS_CAP |
| T-szs-02 | Information Disclosure | new shell log lines | mitigate | Log host only (`host_str()`), never full URL with session/affiliate params (D-23) |
| T-szs-03 | Spoofing | AMAZON_HOSTS | mitigate | Exact hostname + https via existing `httpsSegments`; tests reject suffix, subdomain-lookalike and query-smuggled hosts |
| T-szs-04 | Tampering | navigation scheme policy | accept | Unchanged; history bookkeeping only, no new navigation is issued |
</threat_model>

<verification>
Automated: both task verify blocks.

Live retest (operator; `tauri dev` rebuilds the Rust shell automatically on save -- no sidecar
change, so no sidecar rebuild needed):
1. /store/amazon: wait for the grid, open a claim. Back enables.
2. Press Back repeatedly: returns to the grid, then Back disables. Shell log shows
   `store_embed: same-document navigation replaced host=luna.amazon.com` (or `page load replaced`)
   after the Back, not a stream of `recorded`.
3. Press Forward: the claim view returns.
4. If a Back still yields `recorded` right after landing, note the delay -- the rewrite is slower
   than STORE_EMBED_LANDING_SETTLE.
5. Regression: /store/steam and /store/gog -- click a product, Back, Forward, one step each; switch
   Amazon -> GOG -> Amazon, GOG's Back never reaches Amazon pages.
</verification>

<success_criteria>
- Amazon Back terminates at the first entry; Forward works.
- Settle tests + all existing store_embed tests green; fmt clean.
- luna.amazon.com armed for store-exit refresh, lookalikes rejected, prettier clean.
</success_criteria>

<output>
Create `.planning/quick/261102-szs-store-embed-treats-post-load-url-rewrite/261102-szs-SUMMARY.md` when done
</output>
