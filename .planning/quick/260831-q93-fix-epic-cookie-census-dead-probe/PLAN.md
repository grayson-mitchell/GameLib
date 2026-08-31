---
type: quick
slug: fix-epic-cookie-census-dead-probe
quick_id: 260831-q93
created: 2026-08-31
autonomous: false
closes: [D-35-29-01]
found_by: Phase 35 re-verification (16/17, status gaps_found) — sole remaining blocker
files_modified:
  - src-tauri/src/main.rs
  - src/backend/__tests__/tauriShellSource.test.ts
  - src/backend/storeManagers/legendary/__tests__/epicCookieCensus.test.ts
  - .planning/phases/35-electron-cutover-remove-the-electron-build/35-VERIFICATION.md
  - .planning/STATE.md
---

# Quick: give the Epic cookie census the label-independent read the clear path already has

The Epic logout cookie census (`readHostCensus` in `src/backend/storeManagers/legendary/user.ts`)
has never once produced a reading. Every call rejects at the Rust boundary, every verdict pins at
`UNSUPPORTED_OR_ERROR`, and the broken-per-host detector those verdicts feed is therefore **dead
code on the only path it serves**.

## Diagnosis — re-confirmed in source before this plan was written

| # | Claim | Confirmed at |
| --- | --- | --- |
| 1 | Census resolves `app.get_webview_window(label)`, rejects `humble_login_cookies_for_domain:no-window:{label}` | `src-tauri/src/main.rs:6339-6341` |
| 2 | Epic's login window is ALWAYS the pristine webview-less `WindowBuilder` window, which `get_webview_window` "structurally can never find, for ANY label, fresh or stale" | `main.rs:3745-3760` (doc comment on `clear_default_data_store_cookies_for_domain`) |
| 3 | The CLEAR path already solved this with a label-independent default-data-store fallback | `main.rs:3775` (fn), wired at `main.rs:5852-5855` |
| 4 | Both consuming branches unreachable: `brokenHosts` needs `SUPPORTED_NONEMPTY` (`user.ts:363-366`), the non-fatal branch needs `SUPPORTED_BUT_EMPTY` (`user.ts:375-377`) | `src/backend/storeManagers/legendary/user.ts` |

Live evidence (packaged 0.7.0, 2026-08-31), all five hosts:
`Error: humble_login_cookies_for_domain:no-window:loginwin-0-18d0cf3d9b97abd0-7652f0f6` →
`before(total=unavailable, matched=unavailable, verdict=UNSUPPORTED_OR_ERROR)`.

## The fix

Mirror the clear arm exactly. The pristine webview uses no custom `websiteDataStore` override, so
its cookies live in the same process-wide `WKWebsiteDataStore::defaultDataStore()` — reading it
needs no window handle at all. Bind `existing_window` first; on macOS, when it is `None` **and**
`epic_cookie_domain_matches(domain)`, return a default-store read instead of the `no-window` error.
Every non-Epic caller (Humble/GOG/Amazon, all still Tauri-managed) fails the domain check and falls
through to the unchanged error path.

Host-list parity is already correct and was checked: `EPIC_COOKIE_HOSTS` (`user.ts:47-53`) is
byte-identical to Rust's `EPIC_COOKIE_DOMAINS` (`main.rs:3223-3229`), so the guard covers all five
hosts. No widening is needed and none is authorised.

## HARD CONSTRAINT — the wry cookie deadlock (F-34.4.2-12)

Read `main.rs:6341-6357` and `main.rs:5860-5890` in full before editing. Four **wry `.cookies()`**
round trips against one freshly-created, still-rendering WKWebView self-deadlocked the main thread
(4185/4185 samples in the identical state). Also see the recorded `wry-cookies-reentrant-deadlock`
finding.

Round-trip accounting this fix must preserve, and must state in its own code comment:

| | wry `.cookies()` per host (macOS) | native `getAllCookies` per host |
| --- | --- | --- |
| today | 0 | 2 (clear path's before/after, default store) |
| after this fix | **0 — unchanged** | 4 (adds census before/after, default store) |

The two added reads use `app.run_on_main_thread` + `RcBlock` completion handler + `mpsc` wait on the
**calling** thread — the exact shape `clear_default_data_store_cookies_for_domain` already runs
twice per host, live, without deadlock. They are not bound to any window, so `with_webview`
reentrancy is not in play either. Do NOT add a wry getter, do NOT nest a wait inside a main-thread
closure, and do NOT route the fallback through `with_webview`.

## Scope discipline

Out of scope, recorded, do not touch: **D-35-19-15** (multi-domain widening, unprovable live — no
embedded browser on the Tauri build can seed a non-primary Epic cookie) and **D-35-29-02** (residual
primary-domain cookies, cause unestablished).

## Consequence to expect — the detector goes live and may now THROW

With evidence flowing, `brokenHosts` becomes reachable for the first time. If `epicgames.com` reads
`matched > 0` and its measured delta is `0`, logout will now **fail loudly**. That is the correct,
intended behaviour of a live detector, not a regression introduced by this plan. Record it if it
fires; do not suppress it. (Per D-35-29-02, a nonzero-but-incomplete delta will NOT trip it.)

---

<tasks>

<task type="auto">
  <name>Task 1: label-independent census read in the Rust arm</name>
  <files>src-tauri/src/main.rs</files>
  <action>
Add `default_data_store_cookies_for_domain(app: &AppHandle, domain: &str, names: &[&str]) -> Result&lt;Value, String&gt;`, `#[cfg(target_os = "macos")]`, placed immediately after `clear_default_data_store_cookies_for_domain` (ends `main.rs:3927`) so the two label-independent paths sit together.

Body: `app.run_on_main_thread` a closure that takes `MainThreadMarker::new()`, gets `WKWebsiteDataStore::defaultDataStore(mtm)`, then `httpCookieStore()`, then registers ONE `block2::RcBlock` completion on `getAllCookies` and returns immediately. Inside the completion, compute `total` as the unfiltered `to_vec().len()`, and `matched` by filtering with `cookie_domain_matches(&c.domain().to_string(), Some(&filter_domain))` — the cookie's OWN domain FIRST, the fixed target second, identical to the existing macOS census branch — then the name filter (empty `names` matches everything). Send `Ok((total, matched))` over the channel; wait with `rx.recv_timeout(CLEAR_COOKIES_TIMEOUT)` on the CALLING thread. Resolve `serde_json::json!({ "total": total, "matched": matched })`. Error strings follow the arm's existing flat convention: `humble_login_cookies_for_domain:default-store:no-main-thread-marker`, `:default-store:dispatch:{e}`, `:default-store:timeout`.

Never log a cookie name, value or domain (T-34.4.1-02, T-34.4.1-94) — domains and names feed the pure filters only; values go only into the returned payload the caller already requested over the allowlisted channel.

In the `"humble_login_cookies_for_domain"` arm (`main.rs:6325`), replace the current single `let window = app.get_webview_window(label).ok_or_else(...)` with `let existing_window = app.get_webview_window(label);`, then a `#[cfg(target_os = "macos")] if existing_window.is_none() && epic_cookie_domain_matches(domain) { return default_data_store_cookies_for_domain(app, domain, &names); }`, then `let window = existing_window.ok_or_else(|| format!("humble_login_cookies_for_domain:no-window:{label}"))?;` — structurally identical to `humble_login_clear_cookies` at `main.rs:5829-5859`, deliberately so.

Doc-comment the new fn with: the defect it closes (D-35-29-01), why the label was never a real lookup key (cite `clear_default_data_store_cookies_for_domain`'s own comment rather than restating it), and the round-trip accounting table from this plan — specifically that wry `.cookies()` count on macOS stays at ZERO and the added reads reuse the clear path's already-live-proven `run_on_main_thread` shape.

Two source-gate hazards to respect while writing: (i) `stripSourceComments` in the JS suite EATS a line whose first non-space character is `*`, so never start a line with a bare Rust deref — keep `&*ptr` mid-line; (ii) `tauriShellSource.test.ts:653` slices this arm's body and requires it to still contain `cookie_domain_matches(d, Some(domain))` (the non-macOS branch) and to NOT contain `cookie_domain_matches(host, c.domain())`. Leave the non-macOS branch untouched.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib/src-tauri &amp;&amp; cargo test 2>&amp;1 | tail -25</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; grep -c 'window.cookies()' src-tauri/src/main.rs   # must be UNCHANGED from the pre-edit count</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; npx jest src/backend/__tests__/tauriShellSource.test.ts 2>&amp;1 | tail -15</automated>
  </verify>
  <done>`cargo test` green (including the four existing `epic_cookie_domain_matches_*` tests); the pre-existing `tauriShellSource` census-direction gates still pass; macOS wry `.cookies()` call count unchanged; the arm can no longer return `no-window` for any of the five Epic hosts.</done>
</task>

<task type="auto">
  <name>Task 2: regression gates that assert EVIDENCE, not absence-of-throw</name>
  <files>src/backend/__tests__/tauriShellSource.test.ts, src/backend/storeManagers/legendary/__tests__/epicCookieCensus.test.ts</files>
  <action>
Every existing test passes today against a probe that has never produced a reading, because the no-window branch is asserted to "not throw / not break logout". Do not add another test of that shape.

(a) In `tauriShellSource.test.ts`, add a describe block pinning the fallback structurally — the only layer that can observe this defect, since no TS mock and no Rust unit test can reach a live WKWebView. Using the file's existing `extractArmBody` helper over comment-stripped source, slice the census arm and assert it binds `existing_window` from `app.get_webview_window(label)`, contains the guard tokens `existing_window.is_none()` and `epic_cookie_domain_matches(domain)`, and reaches `default_data_store_cookies_for_domain`. Assert the arm no longer resolves the window directly into an unconditional `ok_or_else` `no-window` error ahead of that guard. Follow this file's established negative self-test convention (see the `matching.len()` self-test at `tauriShellSource.test.ts:900`): construct the regressed arm shape as a string literal and prove the new gate rejects it — a gate that cannot fail its own counterexample is not a gate.

(b) In `epicCookieCensus.test.ts`, add a test named for evidence production: with a seam resolving real reads (the post-fix live shape — `epicgames.com` populated, the other four zero with `everProvedLive` already true), assert BOTH that no emitted log line contains `verdict=UNSUPPORTED_OR_ERROR` AND that a consuming branch was actually reached (a `SUPPORTED_NONEMPTY` verdict on the primary host and a `SUPPORTED_BUT_EMPTY` classification driving the non-fatal branch on the others). The existing tests never assert the ABSENCE of `UNSUPPORTED_OR_ERROR`; that absence is the property this defect violated on every live run.

State plainly in a comment on (b) that it runs against a seam double and therefore proves branch REACHABILITY only — it is NOT evidence that the Rust probe reads anything. Task 3 is the only proof of that.

Do not weaken or delete existing tests; `EPIC_COOKIE_HOSTS` stays byte-identical (its paired-list invariant is pinned at `epicCookieCensus.test.ts:419` and `epicLogoutDomains.test.ts:433`).
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; npx jest src/backend/__tests__/tauriShellSource.test.ts src/backend/storeManagers/legendary/__tests__/epicCookieCensus.test.ts src/backend/storeManagers/legendary/__tests__/epicLogoutDomains.test.ts 2>&amp;1 | tail -25</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; pnpm codecheck</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; git stash list >/dev/null; git diff --stat src/backend/storeManagers/legendary/user.ts   # MUST be empty — no consumer edits in this task</automated>
  </verify>
  <done>New source gate passes AND rejects its own regressed counterexample; new evidence test asserts absence of `UNSUPPORTED_OR_ERROR` plus a reached consuming branch; all pre-existing tests in the three files still pass; no edit to `legendary/user.ts`.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: BLOCKING — live Epic logout must produce a populated census</name>
  <what-built>
The census arm now falls back to a label-independent default-data-store read for Epic domains, exactly as the clear path already did. Unit and source gates are green — and are explicitly NOT accepted as evidence for this fix, because the identical gates were green throughout the entire period the probe returned nothing.
  </what-built>
  <how-to-verify>
**Preconditions.** You are currently LOGGED OUT of Epic (the logout that exposed this defect was the gate gesture). You must log in first — there is nothing to census otherwise.

1. Quit any running GameLib completely. `pnpm tauri:dev` exits 0 WITHOUT replacing a running instance, and a bare `tauri dev` serves a stale static bundle — so quit first, then run `pnpm tauri:dev` from the repo root. Optionally export `GAMELIB_DEV_SECRET_VAULT=1` to stop Keychain prompting.

2. **Identify the live cookie jar before touching anything.** There are TWO candidates and they are not interchangeable:
   `com.gamelib.shell.binarycookies` (packaged; epic=8, mtime Aug 31 18:17) and
   `gamelib-shell.binarycookies` (epic=4, mtime Aug 31 00:37).
   Run `ls -lT ~/Library/HTTPStorages/*binarycookies` immediately after the app is up and again after logging in; the file whose mtime MOVES is the one the running build uses. Baseline it:
   `strings ~/Library/HTTPStorages/&lt;live-jar&gt; | grep -c epicgames.com`
   Record the filename and the number. Every later count must come from the SAME file.

3. Log in to Epic through the app. Confirm the login lands (library populates).

4. Re-measure the jar: `strings ~/Library/HTTPStorages/&lt;live-jar&gt; | grep -c epicgames.com`. Expect it to have risen. Record it as PRE-LOGOUT-N.

5. Log out of Epic.

6. Read `gamelib.log` for the five census lines. **PASS requires, per host, a verdict OTHER than `UNSUPPORTED_OR_ERROR`, with `total=` and `matched=` carrying NUMBERS rather than `unavailable`.** Any single `total=unavailable` on any host is a FAIL — the probe is still dead on that host.

7. Cross-check the census against the product-external jar read: `epicgames.com` should report `matched` in the same neighbourhood as PRE-LOGOUT-N (the jar read counts raw string occurrences, so exact equality is not required — an order-of-magnitude or sign disagreement is). Re-measure the jar post-logout too.

8. Watch for a hang. If logout never completes, do NOT kill the process — `sample` it first and attach the output; that is the only artefact that could distinguish a re-triggered F-34.4.2-12 deadlock from a slow read.

9. If logout THROWS naming a broken host, that is the detector working for the first time (see this plan's "Consequence to expect"). Record the message verbatim and the per-host deltas; do not suppress it.

Paste back: the live-jar filename, the three jar counts (baseline / pre-logout / post-logout), all five verbatim census log lines, and any thrown error.
  </how-to-verify>
  <resume-signal>Type "approved" with the pasted log lines and jar counts, or describe the failure.</resume-signal>
</task>

<task type="auto">
  <name>Task 4: records — hand-edited only</name>
  <files>.planning/phases/35-electron-cutover-remove-the-electron-build/35-VERIFICATION.md, .planning/STATE.md, .planning/quick/260831-q93-fix-epic-cookie-census-dead-probe/SUMMARY.md</files>
  <action>
**TOOLING HAZARD — do not call any `gsd-sdk state.*` verb** (`state.advance-plan`, `state.planned-phase`, `state.complete-phase`, `state.update`, `annotate-dependencies`). They have repeatedly corrupted this project's `.planning/STATE.md` (frontmatter collapsed 644 to 16 lines, invented counters, deleted plan rows). Hand-edit only, after `cp .planning/STATE.md /tmp/STATE.md.bak` and `cp .planning/ROADMAP.md /tmp/ROADMAP.md.bak`. STATE.md is currently intact at 8150 lines with delimiters at lines 1 and 784 — re-check both numbers after editing and restore from the backup if either moved unexpectedly.

Write SUMMARY.md recording: the four confirmed diagnosis points with their line numbers, the fix shape, the round-trip accounting table, the VERBATIM live census lines from Task 3, the live-jar filename and its three counts, and whether the `brokenHosts` detector fired.

Mark D-35-29-01 closed in `35-VERIFICATION.md` and update the 16/17 score. Only claim closure on the strength of Task 3's live evidence — never on the unit tests. If Task 3 failed or was inconclusive, record it as still open with the measurements taken, and do NOT touch the score.

Do not update `35-LIVE-GATE.md`, `35-VALIDATION.md`, `35-REVIEW.md` or `deferred-items.md` for D-35-19-15 or D-35-29-02 — both remain open and out of scope.

`.husky/pre-push` has red prettier and i18n gates repo-wide; that is pre-existing. Push with `--no-verify` if it blocks, and say so in the summary.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; wc -l .planning/STATE.md &amp;&amp; grep -n '^---$' .planning/STATE.md | head -3   # delimiters must still be at lines 1 and 784-ish, file must not have shrunk</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; grep -n 'D-35-29-01' .planning/phases/35-electron-cutover-remove-the-electron-build/35-VERIFICATION.md</automated>
  </verify>
  <done>SUMMARY.md carries verbatim live evidence; STATE.md structurally intact (line count and delimiter positions verified against the backup); D-35-29-01 status reflects the LIVE outcome only; the two out-of-scope defects untouched.</done>
</task>

</tasks>

## Verification hygiene — jest here can fail OPEN

`jest.config.js` defines FIVE path-based projects with no `displayName`, so `--selectProjects` is a
known fail-open in this repo (wrong/misspelled name exits 0 having run nothing). Every command in
this plan uses `npx jest <path>` instead, which fails closed on a bad path. Confirmed working
against `epicCookieCensus.test.ts` while writing this plan: 9 passed in 0.125s.

Read the `Tests:` line on every run. A suite that reports 0 tests, or a count LOWER than the run
before your edit, is a FAIL regardless of the exit code.

## Success criteria

1. A live Epic logout emits, for all five hosts, a census verdict other than `UNSUPPORTED_OR_ERROR`
   with numeric `total=` and `matched=`.
2. The census reports are corroborated by an independent `strings`-over-binarycookies read of the
   jar the running build actually uses.
3. macOS wry `.cookies()` round trips per host remain at ZERO; logout does not hang.
4. The new automated gates assert evidence production and branch reachability, and the source gate
   rejects its own regressed counterexample.
5. `legendary/user.ts` is unedited; `EPIC_COOKIE_HOSTS` is byte-identical; D-35-19-15 and
   D-35-29-02 remain open and untouched.
