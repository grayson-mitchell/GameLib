---
phase: 50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv
verified: 2026-10-14T21:30:00Z
status: gaps_found
score: 12/16 must-haves verified
score_at_write: 10/16 must-haves verified
score_note: "Written at 10/16. Two of the six open truths were closed by the orchestrator the same day, immediately after this report was written, and are marked `status: closed` with a `closed_after_verification` key below — the 2026-09-15 Sign-in todo disposition and the stale-planning-artifact sweep. Both were records problems this report existed to surface, and neither required code. The score is raised to 12/16 for that reason. `status` stays `gaps_found`: the remaining four are not closeable from a desk. G-50-16's banner needs a Mac, and Items 3, 13, 14 and 15 need either hardware, a third-party precondition, or a credential nobody should spend."
covered_files:
  - ".planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-01-PLAN.md"
  - ".planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-01-SUMMARY.md"
  - ".planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-02-PLAN.md"
  - ".planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-02-SUMMARY.md"
  - ".planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-04-PLAN.md"
  - ".planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-05-SUMMARY.md"
  - "src-tauri/Cargo.toml"
  - "src-tauri/src/macos_epic_embed.rs"
  - "src/backend/sidecar/storeEmbedFlowRegistration.ts"
  - "src/frontend/screens/WebView/components/StoreEmbedSlotContents.tsx"
  - "src/frontend/screens/WebView/components/StoreEmbedTimeoutBanner.tsx"
  - "src/frontend/screens/WebView/index.css"
  - "src/frontend/screens/WebView/storeEmbedOrigins.ts"
  - "src/frontend/screens/WebView/useStoreEmbedHost.ts"
covered_digest: "v2:sha256:9433954d090e247da1f7554e59b2fd28295c641ec08ad73be937831756d0fc39"
behavior_unverified: 5
overrides_applied: 0
gaps:
  - truth: "A load timeout surfaces a visible reload affordance — StoreEmbedTimeoutBanner renders with Reload and Open in browser on one row at the app's minimum window width (ROADMAP ships #4, D-07, UI-SPEC E3)"
    status: failed
    reason: "The only hardware observation of this truth is a FAILURE. UAT Item 16 (Launch 3, 2026-10-14, dev pid 12135) proved the backend half under a scoped /etc/hosts blackhole — the pinned literal `load timed out past 45s` fired 3 times — while the operator, actively watching the slot through the whole first 45s window, saw no banner at any point. A fix for the diagnosed root cause landed after the gate (`5ba1dd645`, `f32f4757b`) and I re-measured it green at HEAD, but a green test is not a painted banner. G-50-16 is deliberately still `status: failed` in 50-UAT.md and that is the correct state."
    artifacts:
      - path: "src/frontend/screens/WebView/useStoreEmbedHost.ts"
        issue: "The GAP-D drain now merges loadTimedOut stickily across a batch (:330-337, verified at HEAD). The fix is present and jest property 46 — observed red before the fix — passes when re-run. No hardware observation exists."
      - path: "src-tauri/src/macos_epic_embed.rs"
        issue: "All four `load_timed_out = false` sites now consult `epic_embed_clears_load_timeout` (:1382, :1408, :1715, :1807). Present and unit-tested; the live WKNavigationDelegate callback sequence is unexercised."
    missing:
      - "A macOS live-gate re-run of UAT Item 16 confirming StoreEmbedTimeoutBanner actually paints — filed as .planning/todos/pending/2026-10-14-epic-timeout-banner-fix-needs-a-live-gate-re-run.md"
      - "The three UI-SPEC E3 checks that have NEVER been observed, because the banner never rendered: Reload + Open in browser on one row at minimum window width; the longest-of-49-translations single-row shape; the revert-hosts-then-click-Reload recovery half"
  - truth: "The 2026-09-15 Epic in-embed Sign-in todo is disposed by the Sign-in arm's result (50-06-PLAN.md Task 3's second deliverable; ROADMAP locked sub-decision 1; 50-06-PLAN.md's own key_links)"
    status: closed
    closed_after_verification: "2026-10-14, by the orchestrator, immediately after this report was written. The todo was moved to .planning/todos/completed/ with status: CLOSED, resolves_phase: 50, and a closed_by key citing UAT Item 2. It closed with NO CODE, which is its own falsifiable rule's first branch verbatim — the rule said a completed sign-in closes it and only a challenge or 403 would make the hand-off a Phase 50 task. Item 2's evidence is recorded in the todo: jar 6 -> 22 epicgames.com entries with an mtime matching the sign-in minute, 0 'flagged as challenged' across all five launch transcripts, no 403 in gamelib.log. The finding below is kept as written because it was true when measured."
    original_status: failed
    reason: "The measurement that disposes it LANDED — UAT Item 2 passed on 2026-10-13 with a completed, unchallenged Epic sign-in on a cold packaged jar, which is the `pass` branch 50-06-PLAN.md's key_link names. The disposition itself did not happen. The todo is still in `.planning/todos/pending/`, still carries `status: OPEN`, and still carries `blocked_by: \"Phase 50's live gate (the Sign in arm)\"` — a blocker that no longer exists."
    artifacts:
      - path: ".planning/todos/pending/2026-09-15-epic-in-embed-sign-in-button-has-no-decided-behaviour.md"
        issue: "status: OPEN and blocked_by naming a gate that closed 2026-10-14; its three undecided options (intercept / fail visibly / hide) are moot now that the button completes a real sign-in in place"
    missing:
      - "Move the todo to .planning/todos/completed/ with a resolves_phase: 50 key and the Item 2 evidence (jar 6 -> 22 epicgames.com entries, 0 'flagged as challenged', no 403), or record why it stays open"
  - truth: "The phase's own planning artifacts describe the phase's actual state"
    status: closed
    closed_after_verification: "2026-10-14, by the orchestrator, immediately after this report was written. All five artifacts corrected. STATE.md -> status: verified, stopped_at rewritten, Current Position says VERIFIED, GAPS FOUND and Plan 6 of 6. ROADMAP.md -> 50-06 checked, 6/6 plans, plus a live-gate outcome block naming the one open gap and the four blocked arms. 50-06-SUMMARY.md -> status: complete with a '## Live gate outcome (2026-10-14)' section that supersedes the blocked framing WITHOUT deleting the original Task-3 rationale, which was correct when written. 50-VALIDATION.md -> status: validated with the approval rewritten to point at the owed Item 16 re-run instead of the cleared precondition. 50-REVIEW.md -> status DELIBERATELY unchanged, because this report measured that it was right; a 12-row discharge table was added instead. A sixth artifact, deferred-items.md, reads 'unresolved' to audit-uat but its body records both failures CLOSED 2026-10-13 — that is an audit parse heuristic, not a false claim in the document, and was left alone."
    original_status: partial
    reason: "FIVE artifacts assert a state that is false at HEAD. STATE.md, ROADMAP.md, 50-06-SUMMARY.md and 50-VALIDATION.md all still describe Plan 06 as halted at a blocking-human checkpoint that was cleared 2026-10-13; 50-REVIEW.md's status is still accurate but its Live-check column has no discharge record. Every one of these is independently contradicted by 12 gate commits that are ancestors of HEAD."
    artifacts:
      - path: ".planning/STATE.md"
        issue: "status: executing, stopped_at: 'Phase 50 Plan 06 blocked on the live-gate precondition'"
      - path: ".planning/ROADMAP.md"
        issue: "'- [ ] 50-06-PLAN.md' unchecked and '**Plans:** 5/6 plans executed'"
      - path: ".planning/phases/50-.../50-06-SUMMARY.md"
        issue: "status: blocked, 'Tasks 2/3 completed; Task 3 blocked at a blocking-human checkpoint'"
      - path: ".planning/phases/50-.../50-VALIDATION.md"
        issue: "status: draft and 'Approval: pending ... withheld until Task 3's live gate runs on real hardware' — the gate ran"
      - path: ".planning/phases/50-.../50-REVIEW.md"
        issue: "status: resolved_pending_live_gate is still CORRECT, but no record of which Live-check rows the closed gate discharged (measured below: 2 of 12 fully, 2 partially, 8 not at all)"
    missing:
      - "Apply the four corrections recommended in this report's Stale-Artifact Re-Derivation section (the operator is handling these; this verification does not edit them)"
behavior_unverified_items:
  - truth: "A main-frame Cloudflare challenge falls back to WebviewUnavailablePanel reason='epic-challenged' with Try again and Open in browser, and is not sticky (ROADMAP ships #5, D-09/D-10/D-11)"
    test: "Induce a real main-frame Cloudflare/Turnstile challenge on Epic's store inside the embed, then clear it and reload"
    expected: "The literal `main-frame response flagged as challenged (D-09)` fires; the subview hides; the panel renders with its locked copy and a working Try again and Open in browser; a second, subsequent successful load reverts to normal Epic rendering"
    why_human: "The condition never occurred. `grep -c 'flagged as challenged'` returned 0 across all five launch transcripts — five launches including a cold packaged jar, a full sign-in, a restored warm session and a starved network. There is no way to induce a Cloudflare challenge on demand, and 'not sticky' is a second-observation property no unit test covers well."
  - truth: "A com.epicgames.launcher:// navigation is blocked in-embed and EpicLauncherBlockedNotice renders its locked copy, bounded-width, unclipped at minimum window width and in the longest of 49 translations (ROADMAP D-14, UI-SPEC E5)"
    test: "Install the Epic Games Launcher (registering a com.epicgames.launcher LaunchServices handler), then click Play/Launch on an owned game inside the embed"
    expected: "The literal `blocked a navigation to the Epic Games Launcher scheme ('com.epicgames.launcher') -- D-14` fires once; the notice renders under StoreEmbedControls and auto-dismisses; the message and accent stay fully visible and wrapped at minimum window width"
    why_human: "A missing THIRD-PARTY precondition, not a GameLib defect. The Epic Games Launcher is not installed and no handler is registered, so Epic's store renders an inert greyed 'In Library' control and never emits the scheme. The code path was read in source during the gate (both hooks funnel to one emitter at macos_epic_embed.rs:1730). The popup entry point can't substitute — the raw Epic WKWebView sets no `inspectable` flag, so there is no devtools console to induce it from."
  - truth: "Epic's alert/confirm/prompt present as origin-titled, main-frame-only, rate-limited native sheets modal to the main window (D-13)"
    test: "Perform an on-page action on Epic's live store that calls alert(), confirm() or prompt()"
    expected: "A native NSAlert sheet titled with the page origin, one at a time, only while the surface is visible"
    why_human: "Structurally unreachable by a live gate against a third-party site, and the contract's own Test 7 conceded it. Modern commercial sites essentially never call these. There is also no log emitter for D-13's delegates and no `inspectable` flag to induce from a console. Recommend covering D-13 by unit/integration test and filing the `inspectable` gap separately."
  - truth: "The Epic subview is non-opaque, so the styled StoreEmbedPlaceholder shows THROUGH the slot before Epic's first paint and nothing flashes white in a dark theme (D-06, [ASSUMED], UI-SPEC E6)"
    test: "Force a fresh Epic load under a held-open unpainted state, having FIRST confirmed the slot does not read 'Paused while a window is open', and watch the slot during the load"
    expected: "The dark-theme placeholder shows through a present-and-visible but unpainted subview; no white flash"
    why_human: "Twice attempted, twice confounded by two different causes: a sub-millisecond transient on a warm page in Launch 1, and in Launch 3 an unexplained StoreEmbedSuppressionContext refcount holder that HID the subview entirely, so the operator saw the suppression placeholder rather than the transparent state under test. Unverified candidate from the gate: TourContext also acquires suppression, and this repo has a known defect where an introjs tooltip renders nothing while still mounted. NOTE the cheaper option the gate itself recommends over a fourth live attempt — `drawsBackground` is a one-line property set at macos_epic_embed.rs:694-698 and a Rust test reading it back would settle D-06 permanently."
  - truth: "Returning to the Stores tab issues exactly ONE storeEmbedReload() when GameLib's Epic sign-in state changed, and NONE when it did not (D-04)"
    test: "Sign out of Epic through GameLib's Manage Accounts, return to the Stores tab, then visit a second time with no further change"
    expected: "Exactly one reload on the first return, none on the second"
    why_human: "Not run, by a deliberate cost/benefit decision taken with the operator. The arm's named mechanism was proven incapable during the gate — signInState comes from epic.username in renderer context and nothing watches user.json, so a credential-fixture move is invisible to the running app. The only working induction is a real Epic sign-out and re-login, and neither half of the criterion has an instrument: the success path logs nothing in the renderer (logNavCallFailure only) and nothing in Rust (macos_epic_embed.rs:885). The gate's own recommendation — a unit test on recordSignInBaseline, which is a pure function over (storeKey, signInState) — is strictly better evidence and is unactioned."
---

# Phase 50: Epic store in-app on macOS — Verification Report

**Phase Goal:** Render the Epic Games Store inside the Stores tab on macOS, where Phase 40's
`/store/epic` route today lands on `WebviewUnavailablePanel reason="epic"`, via a Rust-managed raw
`WKWebView` attached as a subview of the main window at the embed slot's rect.
**Verified:** 2026-10-14, at `fd7d1be92` (branch `quick-261002-b63`)
**Status:** gaps_found
**Re-verification:** No — initial verification. This is a RETROSPECTIVE verification of a phase
whose live gate has already closed.

**Requirements:** The ROADMAP records `**Requirements**: TBD` for this phase — no REQ ids were ever
minted. Verification is goal-backward against the stated **Goal**, the **Scope (ships)** list and
the four **Locked sub-decisions**, cross-referenced with the `must_haves` blocks the six plans
carry in frontmatter. No REQ ids are invented here.

---

## The Verdict, in Two Halves

Both halves are true. A verdict that reports only one of them is wrong.

### Half one — the phase goal was achieved, and proved on hardware

**The Epic Games Store renders inside GameLib's Stores tab on macOS.** This is not inferred from
code; it was observed on real hardware, twice, on two independently-established jars:

- **Cold jar, packaged build** (UAT Item 1, 2026-10-13T08:52Z, pid 70842): the Epic store's own
  page rendered inside the native subview, well inside the 45s window, with no challenge, no blank
  rect and no one-colour unpainted frame. The cold premise was measured, not assumed — the
  `com.gamelib.shell` jar held 0 `epicgames.com` entries with a two-day-stale mtime — and build
  provenance was tied by hash between `target/debug/gamelib-shell` and the bundle's binary.
- **Warm signed-in jar, dev build** (UAT Item 5, 2026-10-13T09:50Z, pid 79500): the store booted,
  painted, and showed the operator signed in with no prompt and no click. Stronger than the arm as
  written: the session was written by a *previous process*, survived a full application quit and
  was picked up on a cold start — a direct test of the shared persistent `WKWebsiteDataStore` (L-3).
- **A real Epic sign-in completed inside the raw WKWebView, unchallenged** (UAT Item 2): the
  packaged jar's `epicgames.com` count rose 6 → 22, `grep -c 'flagged as challenged'` returned 0,
  and no `403` appeared anywhere.

And the risk the entire phase was constructed against did not materialise once. **Across five
launch transcripts — a cold packaged jar, a full sign-in, a restored warm session, a starved
network and a restart — `grep -c 'flagged as challenged'` returned 0.** Spike 024's central
measurement (a raw Rust-owned `WKWebView` is not challenged where the Tauri-managed child webview
is challenged every time) held up in production code, on a shared persistent jar the spike never
tested, with a real account. That is the phase's load-bearing result and it is solid.

### Half two — the phase's full scope has unverified corners, and one measured failure

Of 16 derived must-have truths, **10 are verified, 1 FAILED on hardware, and 5 are present and
wired but behaviourally unobserved.** The failure is real and is the right reason not to seal this
phase green:

**G-50-16 — the load-timeout banner never appeared.** The backend half passed cleanly (3 timeout
literals under a scoped host blackhole). The UI half failed: the operator, watching the slot
through the entire 45s window, saw no banner. A fix for the diagnosed root cause (an un-latched
`load_timed_out` raise coalesced away by a 250ms drain that applied only the last event) landed
today in `5ba1dd645` and `f32f4757b`, with a jest property observed red first. **I independently
re-ran that property and the four Rust lifecycle tests at HEAD; all pass.** That is as far as
off-hardware evidence can go. A green test is not a painted banner, and a timeout affordance that
the user cannot see is the same defect whether the cause is a race or anything else. The owed
re-run is filed and named below.

The five behaviourally-unobserved truths are NOT all the same kind of thing, and the table below
judges each separately rather than lumping them.

---

## Goal Achievement

### Observable Truths

| # | Truth (from ROADMAP Goal / Scope ships / locked sub-decisions) | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Epic renders in the Stores tab on macOS via a Rust-owned raw WKWebView subview, where `/store/epic` previously landed on the unavailable panel | ✓ VERIFIED | `macos_epic_embed.rs` (1929 lines, `#![cfg(target_os = "macos")]`), `mod macos_epic_embed` at `main.rs:57`, routed by `surface_for_store_key` in `store_embed_open` (`main.rs:6525-6535`); `index.tsx:599` guard is now `store === 'epic' && platform !== 'darwin'`. **Live:** Items 1, 5 pass on two jars; Item 6 (Steam embed, same session) is a contemporaneous positive control ruling out "the whole embed subsystem works". |
| 2 | The construction is raw — hand-built config, no `WebviewBuilder`, no init scripts, no message or scheme handlers; shared default `WKWebsiteDataStore` (L-3); default WKWebView UA (L-4) | ✓ VERIFIED | `grep` for `addUserScript`/`WKUserScript`/`setURLSchemeHandler`/`addScriptMessageHandler`/`WebviewBuilder`/`initialization_script` in `macos_epic_embed.rs` returns **zero code hits** (only doc-comment references). `WKWebsiteDataStore::defaultDataStore(mtm)` at `:678`. **Live:** Item 5's cross-process session restore is direct evidence the shared persistent store is in use. |
| 3 | Bounds sync with the React slot; show/hide on route change; no subview outlives the app; a hidden subview is never visible or hit-testable (D-01/D-02/D-18) | ✓ VERIFIED | `set_bounds` (`:769`) ← `main.rs:6924`; `hide` ← `:7193`; `close` ← `store_embed_close` at `:7235`, whose comment reads "Neither subview may outlive the app" and closes BOTH surfaces at teardown. Visibility derived in Rust (`!selected \|\| user_hidden \|\| challenged`) in `epic_embed_state.rs`, 20 unit tests green (re-run by me). **Live:** Item 4 (zoom 120%/80%, first macOS/Epic observation of the W8 property), Item 7 (occlusion recovery), Item 8 (minimize/restore AND fullscreen, exercised as two separate gestures), Item 10 (Epic→Steam→Epic, no bleed-through, prior state intact, not torn down early) — all pass. |
| 4 | Back / forward / current-URL report into `StoreEmbedControls` via a `WKNavigationDelegate`, under the same scheme allow-list and origin gate as the Tauri embed | ✓ VERIFIED | `navigation_policy` at `:1300` calls **the exact shared** `crate::store_embed_navigation_policy` at `:1323`, mapping `StoreEmbedNavigationDecision` → `WKNavigationActionPolicy`. KVO on `URL`/`canGoBack`/`canGoForward` registered at `:362`, removed in `close()` at `:379`, handled at `:1259`. **Live:** Item 9 pass — three pages deep in Epic, then the identical three-step navigation in **GOG as a same-session reference**, state-transition pattern matched. |
| 5 | A load timeout surfaces a visible reload affordance (banner with Reload + Open in browser, one row at minimum window width) | ✗ **FAILED** | **Backend half passed live** (Item 16: `load timed out past 45s` × 3 under a scoped `/etc/hosts` blackhole, verified scoped because `store.steampowered.com` still resolved). **UI half failed live**: no banner, operator watching throughout. Fix landed post-gate; I re-ran jest property 46 (`1 passed`) and the four `epic_embed_state` lifecycle tests (`20 passed`) at HEAD. **No hardware confirmation.** G-50-16, `status: failed`. |
| 6 | A Cloudflare challenge is detected in the delegate and falls back to the panel with open-in-browser — never a blank rectangle (ROADMAP ships #5) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Code present and fully wired: `decidePolicyForNavigationResponse` at `:1452`, `main-frame response flagged as challenged (D-09)` emitter at `:1500`, Rust hides the subview on `challenged`, `StoreEmbedSlotContents` renders `reason="epic-challenged"` **with `url` and `onTryAgain`** (Review finding 6's fix). **Never exercised:** Item 18 skipped — its condition never occurred in five launches. See Half One: that skip is also a strong positive. |
| 7 | The `/store/epic` guard became darwin-only and the epic embeddability flag was revisited, so deep-link and last-URL restore route Epic URLs into this surface on macOS | ✓ VERIFIED | `storeEmbedOrigins.ts` promotes `embeddable` to `embeddableOn: readonly StoreEmbedPlatform[]`; epic is `['darwin']`, every other store `ALL_EMBED_PLATFORMS`; `isEmbeddableOrigin(url, platform)` at `:148`. **Live:** Item 19 pass — restored to `https://store.epicgames.com/p/risk-of-rain-2` across a full quit, read objectively from localstorage.sqlite3, with **4** matching `startUrl` lines and **0** store-root lines, and 0 `load timed out` / 0 `didFail*` (no reload loop). The `store.` vs `www.` host difference was chosen deliberately as an unconfusable discriminator. |
| 8 | `reason="epic"` still ships on Windows and Linux (the panel was made darwin-conditional, not removed) | ✓ VERIFIED | `index.tsx:599-603` returns `<WebviewUnavailablePanel url={startUrl} reason="epic" />` for `platform !== 'darwin'`; `WebviewUnavailablePanel` retains its `'epic'` branch alongside the new `'epic-challenged'`. The whole Rust module is `#![cfg(target_os = "macos")]` at `:37`. Static platform gate — presence + wiring is adequate evidence; no runtime state transition is asserted. |
| 9 | The six new `gamelib` keys exist non-empty across all 49 locale catalogues | ✓ VERIFIED | **Independently counted, not taken from the SUMMARY:** all 49 `public/locales/*/gamelib.json` carry all six of `webview.epicEmbed.timeout.message`, `.timeout.reload`, `.launcherBlocked.message`, `webview.unavailable.epic-challenged.heading`, `.body`, `.tryAgain`. Zero partial catalogues. |
| 10 | A blocked `com.epicgames.launcher://` navigation raises `EpicLauncherBlockedNotice`, one notice per attempt, unclipped at minimum width | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Code present: single emitter at `:1730` fed by both the navigation hook (`:1341`) and the popup hook (`:1586`), monotonic `blockedLauncherSchemeCount`, one-timer-per-attempt effect in `EpicLauncherBlockedNotice.tsx:57-63` (Review finding 15's fix), component test exists. **Item 14 blocked on a missing third-party precondition** — see disposition table. |
| 11 | A page popup is denied a second in-app surface and handed to the system browser through the shared 2s throttle (D-12) | ✓ VERIFIED | **The strongest live evidence in this gate.** Item 11 pass: the literal fired EXACTLY ONCE, byte-identical, with the browser opening. Item 12 pass, settled from the transcript rather than by eye because the failure mode is invisible: lines 61-70 record **5 admitted / 5 refused** in strict `STORE_EMBED_HANDOFF_MIN_GAP`=2s alternation. The absence is measured, not inferred from silence. `store_embed_handoff_policy.rs` is scheme-only and domain-agnostic, as the gate re-derived from source. |
| 12 | Epic's `alert`/`confirm`/`prompt` present as origin-titled, main-frame-only, rate-limited native sheets (D-13) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `epic_embed_js_dialog.rs` (205 lines) present; Review finding 4's fix (main-frame only, visible only, one at a time, rate-limited, origin-titled, text capped) landed. **Item 13 blocked — structurally unreachable.** See disposition table. |
| 13 | Epic's own Sign-in button works in place, with no interception and no DOM hiding (L-1) | ✓ VERIFIED | **Item 2 pass** — the behaviour half is the phase's headline result (see Half One). The *disposition* half of the same deliverable is NOT done and is raised as a separate gap below: the 2026-09-15 todo is still `status: OPEN` in `pending/`. |
| 14 | The subview is non-opaque so the placeholder shows through before first paint; nothing flashes white in a dark theme (D-06, `[ASSUMED]`) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `drawsBackground` set via `setValue:forKey:` at `:694-698` — present. **Item 3 blocked, confounded twice by two different causes.** Still `[ASSUMED]`. See disposition table. |
| 15 | Exactly one reload on return when GameLib's Epic sign-in state changed, and none when unchanged (D-04) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Wired: `resolveSignInState(collectSignInInputs(...).legendary)` → hook's sixth param → `signInStateAtLoadRef` compared inside both existing show branches (50-05). **Item 15 not run**, by a deliberate decision after the arm's named mechanism was proven incapable. See disposition table. |
| 16 | The live gate itself ran: `50-UAT.md` authored with every ROADMAP-named arm, `50-VALIDATION.md` filled, the gate executed on real hardware | ✓ VERIFIED | **Independently counted:** 19 `### N.` headings, 19 `expected:` lines, 13 `result: pass` / 4 `result: blocked` / 1 `result: issue` / 1 `result: skipped` = 19, matching the `## Summary` block exactly. 12 gate commits `3797fb6b0..b0f847214` plus two annotation commits, all confirmed ancestors of HEAD via `git merge-base --is-ancestor`. |

**Score: 10/16 truths verified** (5 present, behaviour-unverified; 1 failed).

---

## Per-Item Disposition — all 19 UAT arms

| # | Arm | Launch | Result | Verifier's disposition |
| --- | --- | --- | --- | --- |
| 1 | Cold jar: Epic store boots and paints | 1 (packaged) | pass | **Accepted, and the rejection history strengthens it.** A prior operator `pass` on this item was deliberately rejected and the rejection kept: that report named an arm that never ran (zero packaged instances; the only process was the dev binary on the warm jar, a child of a leftover Phase 49 `tauri dev`), and the then-current bundle predated every Phase 50 commit. "The operator said pass" and "the arm ran" are different facts, and this file holds one of each for the same item. That self-correction is why I trust the second pass. |
| 2 | Sign in button reachable and in place | 1 | pass | **Accepted — the phase's headline result.** A real Epic sign-in completed inside the raw WKWebView on a jar that never held an Epic session, unchallenged, no 403. Note the one-way ordering it created: Item 1 needed the jar cold, Item 2 made it signed-in. |
| 3 | Subview transparency `[ASSUMED]` (D-06) | 1, re-armed 3 | blocked | **Confounded, not measured — and correctly left unscored.** The operator saw "Paused while a window is open", which is the D-19 *suppression* placeholder (subview HIDDEN), not the D-06 attached-and-transparent state under test. Both look like "the placeholder is there"; only one was the arm. The suppression holder is **unexplained** — no dialog was open, the changelog guess was refuted, and it released on its own. Unverified candidate from the gate: `TourContext` also acquires suppression, and this repo has a known defect where an introjs tooltip renders nothing while still mounted — an invisible-but-mounted tour step would hold the refcount with no window to close, which matches exactly. **The gate's own stronger recommendation stands and I endorse it: assert `drawsBackground` from Rust rather than attempt a fourth live arm.** |
| 4 | Zoom-aware bounds at 120% / 80% | 1 | pass | Accepted. New coverage, not a regression check — first macOS/Epic observation of the W8 property, previously Windows-only. Both stops are exact slider positions. |
| 5 | Warm signed-in jar boots and paints | 2b | pass | **Accepted, and stronger than written.** Also note the instrument correction this arm forced: the original domain-count check (`grep -c epicgames.com`, pinned at 8) returned 13 against a jar holding only anonymous `EPIC_SESSION_AP`/`EPIC_DEVICE` cookies and declared a signed-out jar warm. Counting session cookies BY NAME is the correct instrument. A false `pass` was caught and recorded rather than quietly re-scored. |
| 6 | Steam embed positive control, same session | 2b | pass | Accepted. Its value is contemporaneity: it rules out "the whole embed subsystem is broken" as an explanation for any later Epic-specific failure in the same gate. Run against the real keyring, not the dev vault, which is exactly why the contract bars `pnpm tauri:dev`. |
| 7 | Occlusion recovery | 2b | pass | Accepted. Correctly scores the RECOVERY, not the absence of blanking during occlusion — non-render while occluded is established behaviour (spike 024). |
| 8 | Minimize/restore and fullscreen survive | 2b | pass | Accepted. Both halves exercised as separate gestures, deliberately, because a previous live gate on this repo nearly signed off a window-state criterion having omitted the minimize/restore half — the half that had already failed. |
| 9 | Back/forward/URL parity with the GOG embed | 2b | pass | Accepted. The GOG half is what gives it value: a same-session reference for the expected pattern, rather than resting on the tester's expectation. |
| 10 | Epic → Steam → Epic switch | 2b | pass | Accepted. Measures lifecycle ACROSS surfaces (bleed-through is the real failure mode for sibling native subviews), distinct from Item 9's navigation WITHIN a surface. |
| 11 | Popup → system browser handoff | 2c | pass | Accepted, on the third induction attempt. Two reachability facts earned the way: Epic's footer social row is responsive-hidden at narrow widths and is unlabelled bare icons; and Cmd+click on Epic's ordinary in-page links does NOT reach the delegate, because the SPA preventDefaults and routes via the history API. A real `target="_blank"` anchor is required. Also the first empirical confirmation of the file's own log-sink correction (`terminal.log`, not `gamelib.log`). |
| 12 | Popup rate-limited, not handed off | 2c | pass | **Accepted with particular confidence.** The operator's hedged "yes seems to work" was explicitly NOT taken as the result — the failure mode is indistinguishable from success by eye — and the arm was settled from the transcript's 5-admitted/5-refused alternation instead. This is the right handling of a weak human signal. |
| 13 | Native JS dialog (D-13) | 2c | **blocked** | **Not a defect; structurally unreachable, and the contract conceded it in advance.** Modern commercial sites essentially never call `alert`/`confirm`/`prompt`. Two independent facts make it unverifiable here rather than merely unlucky: D-13's helpers have no log emitter, and the raw Epic WKWebView sets no `inspectable` flag, so it cannot be attached to Safari's Develop menu and the dialog cannot be induced from a console. Arming it needs a page under our control or a debug-build `inspectable` flag — both code changes, not gate gestures. **Disposition: accept as permanently out of live-gate reach; cover D-13 by unit/integration test and file the `inspectable` gap separately.** |
| 14 | Blocked launcher-scheme notice (D-14) | 2c | **blocked** | **A missing third-party precondition, NOT a GameLib defect — and root-caused, not guessed.** `/Applications/Epic Games Launcher.app` is absent and `lsregister -dump` has no `com.epicgames.launcher` entry, so Epic's store probes for the handler, finds none, and renders an inert greyed "In Library" control with nothing to click. The code path was read in source during the gate (both hooks → one emitter at `:1730`). Baseline confirmed clean both before and after. **Disposition: accept the block; D-14 is unit/integration-test territory unless the launcher is installed. Carry forward the UI-SPEC E5 checks (minimum-width wrapping, longest-of-49) that never armed because the notice never rendered.** |
| 15 | One reload on sign-in change (D-04) | 2c | **blocked** | **Not run, by a deliberate and defensible cost/benefit decision taken with the operator — and the analysis that produced it is itself a finding.** The arm's named mechanism cannot work: `signInState` comes from `epic.username` in renderer context, nothing watches `user.json`, so a mid-session credential-fixture move is invisible and a post-restart one simply re-records the baseline. The whole of Launch 2 had been ordered around protecting a one-shot resource that turned out not to be one. The only working induction costs a real Epic logout and re-login, and buys a purely VISUAL observation, because neither half has an instrument. **Disposition: accept. The gate's recommendation — a unit test over `recordSignInBaseline`, a pure function where both halves are deterministically assertable — is strictly better evidence than this arm could have produced, and is unactioned.** |
| 16 | Timeout → reload path | 3 | **issue** | **The one real failure. Split result: backend passed, UI failed.** Root-caused to an un-latched `load_timed_out` raise coalesced away by a drain applying only the last event of each batch. Fixed post-gate; re-measured green by me at HEAD; **unconfirmed on hardware.** See the Residual section for the second, independent way this banner can be correct-but-invisible. |
| 17 | Navigation failure delegate literal | 3 | pass | **Accepted as written — and the correction attached to it is model behaviour.** The literal appeared 11× with a real caller and a real `localizedDescription` (`NSURLErrorDomain error -999`), which is all the criterion required. Its originally stated CAUSE was wrong ("the timeout monitor cancelled the hung navigation") and was corrected during G-50-16's diagnosis: `stopLoading` and `.cancel(` appear **zero** times in `macos_epic_embed.rs`, and the monitor only reads nav state and enqueues. The `-999`s are WebKit's response to a reload landing on an outstanding load. The pass stands; the explanation was re-scored, not the result. |
| 18 | Challenge fallback (CONDITIONAL) | 3 | **skipped** | **Correctly skipped, by the item's own text and the ROADMAP's locked challenge-reputation decision — and it is a genuine positive worth stating as such.** `grep -c 'flagged as challenged'` returned **0** across all five launch transcripts. Across a cold packaged jar, a full sign-in, a restored warm session and a starved network, Epic never once challenged this WKWebView. That is the risk the entire phase was built against. **It is simultaneously the reason the `epic-challenged` panel copy, its Try again button and the not-sticky half remain unobserved by any gate** — of the three, "not sticky" is the one a unit test covers least well. |
| 19 | Last-URL restore across app restart | 4 | pass | Accepted, and verified objectively from disk rather than by eye, with a host-level discriminator chosen so pass and fail cannot be confused in the log. |

**Census (counted by me, not read from the Summary block): 13 pass · 1 issue · 4 blocked · 1 skipped = 19.** Matches `## Summary`.

---

## Stale-Artifact Re-Derivation — what is true as of `fd7d1be92`

Each claim re-derived from git history and the UAT file, not from the artifact's own frontmatter.

### 1. `.planning/STATE.md` — `status: executing`, `stopped_at: "Phase 50 Plan 06 blocked on the live-gate precondition"`

**FALSE at HEAD.** The precondition was established and the gate ran. `3797fb6b0`
("activate the live-gate UAT session (19 items, status testing)", 2026-10-13 21:13) through
`b0f847214` ("complete UAT — 13 passed, 1 issue, 4 blocked, 1 skipped", 2026-10-14 19:00) are 12
commits, all confirmed ancestors of HEAD, spanning four launches (plus re-arms 2b and 2c) and five
transcripts. Two further annotation commits (`bd4a2c555`, `6299e7be0`) added G-50-16's root cause
and the fix record.

**What is true:** Phase 50 executed all six plans; the live gate closed 2026-10-14 with 13 pass,
1 issue, 4 blocked, 1 skipped; one gap (G-50-16) is failed-with-a-fix-landed, pending a macOS
re-run of UAT Item 16.

### 2. `.planning/ROADMAP.md` — `- [ ] 50-06-PLAN.md` unchecked, `**Plans:** 5/6 plans executed`

**Both FALSE at HEAD.** Plan 06's Tasks 1-2 landed at `22ec650124d` (confirmed ancestor), and
Task 3 — the live run that the unchecked box represents — executed across the 12 commits above.

**What is true:** 6/6 plans executed. With one caveat that should travel with the checkbox: Task 3
had **two** deliverables ("run the gate and dispose the folded Sign-in todo") and only the first
landed — see gap 2.

### 3. `50-REVIEW.md` — `status: resolved_pending_live_gate`

**Still ACCURATE, and less discharged by the gate than it may appear.** I measured the
"Live check needed" column against the closed gate rather than assuming:

| Review finding | Live check needed | Discharged? |
| --- | --- | --- |
| 1 | gog↔epic shows one surface at a time | **Partial** — Item 10 proves epic↔steam; GOG was exercised in the same launch by Item 9 but the gog↔epic switch was never scored |
| 3 | `window.open('steam://…')` does nothing; launcher popup shows the notice | **Partial** — Items 11/12 discharge the http(s) handoff + throttle halves; the `steam://` and launcher-popup halves are unobserved |
| 4 | dialogs appear as origin-titled sheets (UAT 13) | **No** — Item 13 blocked |
| 5 | challenge stays hidden across dialogs and route re-entry | **No** — Item 18 skipped |
| 6 | panel visible with working Open in browser | **No** — Item 18 skipped |
| 7 | auto-passed challenge shows the page | **No** — Item 18 skipped |
| 8 | banner/notice under the controls | **No** — Item 16 failed (no banner) and Item 14 blocked (no notice) |
| 9 | one reload after sign-in (UAT 15) | **No** — Item 15 not run |
| 11 | Download opens in the browser; crash reloads | **No** — never induced |
| 12 | three pages deep updates Back (UAT 9) | **YES** — Item 9 pass |
| 14 | no drift on resize/zoom/fullscreen | **YES** — Items 4 and 8 pass |
| 15 | one toast per blocked attempt | **No** — Item 14 blocked |

**2 of 12 fully discharged, 2 partially, 8 not at all.** All 15 fixes are structurally present in
code at HEAD — I spot-checked findings 4, 6, 8, 11, 12, 14 and 15 directly (grid rows `grid-row: 4`
in `index.css:84`, `NSAutoresizingMaskOptions` edge-pinning at `:388-390`, KVO add/remove at
`:362`/`:379`, `webViewWebContentProcessDidTerminate:` at `:1530`, `decidePolicyForNavigationResponse`
at `:1452`, the single-timer effect in `EpicLauncherBlockedNotice.tsx`) — but *structurally present*
is what the code review already established. The live column is what is still owed.

**What is true:** keep `status: resolved_pending_live_gate`. The honest improvement is to add a
discharge record so the next reader does not have to re-derive this table.

### 4. `50-06-SUMMARY.md` — `status: blocked`, "Tasks 2/3 completed; Task 3 blocked at a `blocking-human` checkpoint"

**FALSE at HEAD.** Task 3 ran. The SUMMARY's claim that the live run "is returned as a checkpoint,
not executed" was true when written (2026-10-13 01:23) and was superseded nineteen hours later.

**What is true:** Tasks 1-3 all executed; the gate produced 19 scored arms. **But Task 3's second
deliverable did not land** — "dispose the folded Sign-in todo". UAT Item 2 passed with a completed
unchallenged sign-in, which is the `pass` branch the plan's own `key_links` names, and
`.planning/todos/pending/2026-09-15-epic-in-embed-sign-in-button-has-no-decided-behaviour.md` is
still `status: OPEN` with `blocked_by: "Phase 50's live gate (the Sign in arm)"`.

### 5. `50-VALIDATION.md` — a FIFTH stale artifact, not in the original list

`status: draft` and **"Approval: pending — final sign-off withheld until Task 3's live gate runs on
real hardware (see `50-06-PLAN.md` Task 3 blocking-human checkpoint returned plan)."** The gate ran.
That approval line cites a checkpoint that no longer exists.

---

## Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src-tauri/src/macos_epic_embed.rs` | The raw WKWebView subview, delegate, timeout, challenge detection, popups, dialogs, scheme block | ✓ VERIFIED | 1929 lines, module-wide `#![cfg(target_os = "macos")]`, registered at `main.rs:57`, invoked from 6 `main.rs` call sites (open/bounds/hide/close/deselect/is_selected) |
| `src-tauri/src/epic_embed_state.rs` | cfg-free state + lifecycle decision tables testable on Linux | ✓ VERIFIED | 355 lines; **20 unit tests re-run by me, all pass**, including the four G-50-16 lifecycle arms |
| `src-tauri/src/store_embed_handoff_policy.rs` | Shared scheme-only http(s) handoff policy (Review finding 3) | ✓ VERIFIED | 270 lines; scheme-only and domain-agnostic, as the gate independently re-derived from source during Item 11 |
| `src-tauri/src/epic_embed_js_dialog.rs` | D-13 dialog policy, cfg-free | ✓ VERIFIED (code) | 205 lines; behaviour unobservable by live gate — see Item 13 |
| `StoreEmbedTimeoutBanner.tsx` | D-07 banner, renders only when `timedOut` | ⚠️ HOLLOW (live) | 96 lines, imported at `index.tsx:20`, rendered at `:628` driven by `embedHost.loadTimedOut`, placed as a SIBLING of the slot (so suppression cannot hide it). Present and wired; **has never been seen on screen.** |
| `EpicLauncherBlockedNotice.tsx` | D-14 notice, one timer per attempt | ⚠️ HOLLOW (live) | 84 lines, imported at `:21`, rendered at `:633`; single-timer effect at `:57-63`. Present and wired; **has never rendered** (Item 14's precondition absent). |
| `WebviewUnavailablePanel.tsx` | New `'epic-challenged'` reason + Try again; `'epic'` retained for win32/linux | ⚠️ HOLLOW (live) for the new reason; ✓ VERIFIED for `'epic'` | Three-reason union at `:6`; per-branch literal ternaries (not a lookup table, so i18next-parser can see them); Try again gated at `:169`. The challenged branch **has never rendered**. |
| `StoreEmbedSlotContents.tsx` | Exactly one thing in the slot (Review finding 6) | ✓ VERIFIED | Panel gated on `isEpicSurface && challenged`, **with `url` and `onTryAgain`** — the finding-6 fix is present |
| `useStoreEmbedHost.ts` | Nav signals surfaced; sticky `loadTimedOut` merge | ✓ VERIFIED (code) | 873 lines; sticky merge at `:330-337` with strict `=== true` so a non-Epic batch latches nothing; jest property 46 re-run green |
| `storeEmbedOrigins.ts` | `isEmbeddableOrigin(url, platform)`, epic darwin-only | ✓ VERIFIED | 174 lines; epic `embeddableOn: ['darwin']`, all others `ALL_EMBED_PLATFORMS`; no caller reads a static boolean |
| 49 × `public/locales/*/gamelib.json` | Six new keys, non-empty, everywhere | ✓ VERIFIED | **49/49 independently counted**, zero partial catalogues |
| `50-UAT.md` | 19-arm live-gate contract, run and scored | ✓ VERIFIED | 19 headings / 19 `expected:` / 19 `result:`; census matches `## Summary` exactly |
| `.planning/todos/pending/2026-10-14-...live-gate-re-run.md` | The owed G-50-16 re-run | ✓ VERIFIED | 49 lines; carries `severity: major`, `platform: macos`, `ready: live-gate`, bare/lowercase/in order per `Skill("gamelib-conventions")` |

---

## Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `WebView/index.tsx` | `macos_epic_embed::open` | `storeEmbedOpen` → `store_embed_open` → `surface_for_store_key` | ✓ WIRED | `main.rs:6525-6538`: the Epic arm routes to `macos_epic_embed::open`, the Tauri arm calls `macos_epic_embed::deselect` first — one surface at a time |
| Rust nav event | `StoreEmbedHostState` | `enqueue_nav_event` → `store_embed_take_nav_events` → `coerceNavState` → 250ms drain | ✓ WIRED | Three fields REQUIRED-on-`'epic'` / FORBIDDEN-otherwise with strict non-coercing validation in `storeEmbedSeam.ts:80-81`; drain merges `loadTimedOut` stickily |
| `useStoreEmbedHost` | three chrome components | `embedHost.loadTimedOut` / `.challenged` / `.blockedLauncherSchemeCount` | ✓ WIRED | `index.tsx:628-642`; banner is a slot SIBLING, panel is INSIDE the slot via `StoreEmbedSlotContents` |
| Epic subview nav | shared allow-list | `navigation_policy` → `crate::store_embed_navigation_policy` | ✓ WIRED | `:1323` calls the **exact existing** function; an arbitrary https origin is still not loadable through this surface |
| `collectSignInInputs(...).legendary` | one reload on change | `resolveSignInState` → hook's 6th param → `signInStateAtLoadRef` | ✓ WIRED (code) | Behaviour unobserved — Item 15 |
| app teardown | both subviews closed | `store_embed_close` → `macos_epic_embed::close` then the Tauri embed | ✓ WIRED | `main.rs:7235`, explicitly closing BOTH rather than whichever is selected |
| UAT Item 2 `pass` | Sign-in todo disposition | `resolves_phase:` / move to `completed/` | ✗ **NOT WIRED** | The todo is still in `pending/`, `status: OPEN`, `blocked_by` naming a closed gate |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| The G-50-16 renderer latch holds (observed-red property) | `npx jest .../useStoreEmbedHost.test.tsx -t "loadTimedOut raise survives later false events"` | `Tests: 57 skipped, 1 passed, 58 total` | ✓ PASS |
| The Rust lifecycle table (all four variants) | `cargo test --bin gamelib-shell epic_embed_state` | `20 passed; 0 failed` | ✓ PASS |
| A navigation failure specifically does NOT clear a raise | `cargo test --bin gamelib-shell a_navigation_failure_does_not_clear` | `1 passed; 0 failed` | ✓ PASS |
| Six new keys present in every locale catalogue | per-locale key census over `public/locales/*/gamelib.json` | `49` locales with all 6; `0` partial | ✓ PASS |
| UAT arm census matches its own Summary | `grep -c "^result: …"` per status | `13 / 4 / 1 / 1` = 19; headings 19; `expected:` 19 | ✓ PASS |
| All claimed gate + fix commits reachable from HEAD | `git merge-base --is-ancestor` × 5 | all 5 are ancestors | ✓ PASS |
| The banner paints on a real hung Epic store | — | — | **? SKIP — requires macOS hardware; this is the open gap** |

Note: the full workspace suite was not re-run. Named tests only, per the gate's own standing rule
that a green suite closes no live arm.

## Probe Execution

No `scripts/*/tests/probe-*.sh` exists in this repo and no PLAN or SUMMARY for Phase 50 declares a
probe. **Step 7c: SKIPPED (no probes declared or discoverable).**

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| — | — | — | — | None. `grep -E "TBD\|FIXME\|XXX"` and `grep -E "\bTODO\b\|\bHACK\b\|PLACEHOLDER"` over all non-test implementation files touched by this phase returned **zero** hits. No stub returns, no console-log-only implementations, no hardcoded empty props. |

One in-scope defect was found BY the gate and correctly filed rather than left silent:

| Finding | Severity | State |
| --- | --- | --- |
| `macos_epic_embed.rs` emits all 25 diagnostics via `eprintln!` (`grep -c 'shell_diag'` → 0), so LaunchServices discards every embed diagnostic line in a packaged build — while `main.rs` already says in its own words that this is the wrong choice | major | ℹ️ Filed as `.planning/todos/pending/2026-10-13-macos-epic-embed-logs-via-eprintln-so-a-packaged-app-discards-every-line.md` (`severity: major`, `platform: macos`, `ready: code`). Not a goal blocker — every literal this gate scored was read from `terminal.log` under a dev or `--debug` build — but it means the shipped packaged build is diagnostically dark on this surface. |

## Deferred Items

**None.** Phase 50 is the last live phase in the roadmap (Phase 22, "Steam Game Families", appears
after it in the file but is parked and shares no files). No later phase covers any of the gaps or
behaviour-unverified items below, so none of them can be deferred — they must be closed or
explicitly accepted.

---

## Known Residual — stated honestly, not as a defect

**There is a second, independent way the timeout banner can be correct-but-invisible, and it is
arguably not a defect at all.** Per D-07, a main-frame load *finishing* legitimately clears the
banner. In the Launch-3 run, Epic's own cached SPA then rendered its 404 page ("Page not found"
with an unresponsive "Back to store" — both strings absent from this codebase, so Epic's, not
ours). A main-frame finish on that cached 404 would clear `loadTimedOut` exactly as designed.

The post-gate latch addresses the *coalescing* cause (a raise erased within one 250ms drain batch).
It deliberately does **not** address this one, and should not: property 47 — the boundary guard —
exists precisely to keep a later all-false batch clearing the flag, because that is D-07 working.
A banner that survived a genuine load completion would be a worse bug than the one being fixed.

The consequence to carry forward: **the owed Item 16 re-run must confirm the banner paints under a
host-level block where Epic's cache cannot serve a main-frame finish**, or it will reproduce an
ambiguous result. This is a property of the induction, not of the code.

---

## What a future session must still do

1. **Re-run UAT Item 16 on macOS.** Filed:
   `.planning/todos/pending/2026-10-14-epic-timeout-banner-fix-needs-a-live-gate-re-run.md`
   (`severity: major`, `platform: macos`, `ready: live-gate`). It carries three UI-SPEC E3 checks
   that have **never** been observed, not just the banner itself:
   - Reload and Open in browser on one row at minimum window width
   - the longest-of-49-translations single-row shape for the banner message
   - the recovery half: revert the hosts entry, click Reload, confirm the store repaints
   Heed the residual above when choosing the induction, and the project's own hazard: a running
   `pnpm tauri:dev` relaunches on every commit and will consume an as-found fixture.
2. **Dispose the 2026-09-15 Epic Sign-in todo.** Item 2's pass is the disposition trigger named by
   50-06-PLAN's own `key_links`. Move it to `completed/` with `resolves_phase: 50` and the Item 2
   evidence, or record explicitly why it stays open.
3. **Settle D-06 from Rust, not by a fourth live attempt.** A test reading back
   `webview.value(forKey: "drawsBackground")` would close Item 3 permanently and far more cheaply.
   Separately worth an investigation in its own right: *what held the
   `StoreEmbedSuppressionContext` refcount* during Launch 3 with no dialog open. If it is
   `TourContext` holding it via an invisible-but-mounted introjs step, that is a live defect
   affecting every embed surface, not a gate artifact.
4. **Cover D-13 and D-14 by unit/integration test** and accept them as out of live-gate reach.
   File the missing `inspectable` debug flag separately — it is the single change that would make
   both arms inducible in future gates.
5. **Cover D-04 with a unit test over `recordSignInBaseline`** (both halves: exactly-one-on-change
   and none-when-unchanged). It is a pure function; this is strictly better evidence than Item 15
   could have produced by eye. If a live arm is still wanted later, give the D-04 reload a log line
   first — without one the arm is unmeasurable however it is induced.
6. **Fix the `eprintln!` logging** so a packaged build is not diagnostically dark on this surface
   (already filed, `ready: code`).
7. **Correct the five stale artifacts** per the re-derivation section above.
8. **Note what no gate has ever seen:** the `epic-challenged` panel's copy, its Try again button,
   and its not-sticky behaviour. Epic never challenged this surface in five launches — which is
   excellent news for the phase's premise and simultaneously means the fallback it ships has never
   been exercised against a real challenge.

---

## Gaps Summary

**The goal is met; the scope is not fully verified.** Epic renders in the Stores tab on macOS —
proved on a cold packaged jar and a warm dev jar, with a real sign-in that Epic never challenged,
plus a contemporaneous Steam positive control and a 5-admitted/5-refused popup-throttle measurement
that is as rigorous as live-gate evidence gets on this project. Thirteen of nineteen arms passed on
hardware, and the arms that did not pass were, with one exception, blocked by missing third-party
preconditions or by instruments that the gate itself proved could not exist — each diagnosed in
source rather than guessed at, and each recorded rather than quietly re-scored.

The exception matters. **One user-facing affordance in the ROADMAP's own ships list — the load
timeout's visible reload — was measured ABSENT on hardware.** Its fix landed today with a
red-first regression test which I re-ran green, and the fix is well-reasoned. But the only thing
that can confirm a banner paints is a Mac, and no Mac has seen it. Sealing this phase green on a
passing jest property would be the precise defect this repo has already measured in a prior phase,
where four of four executor green claims were false and a self-asserted `Self-Check: PASSED` stood
in for evidence. The gap stays open, deliberately, and `G-50-16` stays `status: failed` in
`50-UAT.md`, deliberately.

Alongside it, two smaller gaps: a named Plan 06 deliverable (disposing the Sign-in todo) that the
passing arm should have triggered and did not, and five artifacts — one more than was expected —
still asserting a blocked state that twelve commits in git refute.

---

_Verified: 2026-10-14T21:30:00Z_
_Verifier: Claude (gsd-verifier)_
