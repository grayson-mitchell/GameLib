---
phase: "50"
slug: "epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-12"
---

# Phase 50 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (`testEnvironment: 'node'`, no jsdom — hooks/components invoked against hand-rolled mocks) for `src/frontend`; `cargo test` from `src-tauri/` for Rust |
| **Config file** | `src/frontend/jest.config.js`; `src-tauri/Cargo.toml` |
| **Quick run command** | `pnpm test -- useStoreEmbedHost` / `pnpm test -- WebviewUnavailablePanel` (Jest project-scoped); `cargo test --package gamelib -- store_embed` (from `src-tauri/`) |
| **Full suite command** | `pnpm test:ci` (`jest --maxWorkers=2 --silent`) plus full `cargo test` from `src-tauri/` |
| **Estimated runtime** | ~60–120 seconds (Jest full suite); cargo incremental varies |

**Structural constraint (from 50-RESEARCH.md § Validation Architecture):** anything that takes `&AppHandle` or touches a real `NSWindow` / `WKWebView` cannot be driven from a `#[test]`; the project's own in-repo comment at `src-tauri/src/main.rs` ~L19030 records this for `store_embed_open`. All Rust unit coverage for this phase must sit over `AppHandle`-free helpers. The native subview itself is verified only by the live gate.

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- <touched test file>` and/or `cargo test` scoped to the touched module, plus `npx prettier --check` over exactly the paths the task wrote (per `Skill("gamelib-conventions")`)
- **After every plan wave:** Run `pnpm test:ci` and full `cargo test`
- **Before `/gsd-verify-work`:** Full suite must be green AND the live gate arms below must be run on macOS
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

One row per task across plans 01-05 (16 tasks total). `Automated Command` is copied verbatim
from the owning task's own SUMMARY.md, never re-derived. Manual-only rows cite the specific
`50-UAT.md` arm number rather than repeating instructions.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 50-01-01 | 01 | 1 | D-01 (tracer) | T-50-01, T-50-02, T-50-03 (accept), T-50-04 | Epic paints end-to-end via a Rust-owned raw `WKWebView` subview; existing nav policy and last-URL restore path reused; shared default jar accepted; `set_bounds` reuses existing finite/non-negative guards | unit + manual_procedural | `cargo test --manifest-path src-tauri/Cargo.toml --bin gamelib-shell epic_embed` | ✅ | 🟡 partial — visual paint is `human_judgment: true` per 50-01-SUMMARY, not yet live-confirmed; see `50-UAT.md` Item 1 |
| 50-01-02 | 01 | 1 | D-05 (store×platform embeddability invariant) | T-50-01..04 (shared) | `surface_for_store_key` routes Epic to the native surface and every other store to the Tauri embed; `storeEmbedOrigins.ts`'s `embeddableOn` is platform-aware (`['darwin']` for Epic); the Epic→GOG switch restore survives without stomping the GOG key | unit | `cargo test --manifest-path src-tauri/Cargo.toml --bin gamelib-shell epic_embed` (`surface_for_store_key_tests`) + `pnpm test -- storeEmbedOrigins storeEmbedReloadLoop` | ✅ | ✅ green |
| 50-01-03 | 01 | 1 | D-01 ROADMAP amendment + functionality-gap record | — | ROADMAP amended, 8 surviving functionality gaps recorded and tagged to plans 02/03 | docs/other | `grep -c 'D-01' .planning/ROADMAP.md` | ✅ | ✅ green |
| 50-02-01 | 02 | 2 | D1 native back/forward/URL reporting | T-50-02 | `canGoBack`/`canGoForward`/URL read live at nav-event-push time; no Rust-side URL stack | unit | `cargo test --bin gamelib-shell epic_embed -- macos_epic_embed::epic_embed_enqueue_nav_event_tests, macos_epic_embed::epic_embed_take_nav_events_tests` | ✅ | ✅ green |
| 50-02-02 | 02 | 2 | D2 45 s load timeout + bounded monitor thread | T-50-04, T-50-07 | `load_timed_out` set exactly once at the bound, cleared by next finish; exactly one monitor thread per open surface | unit | `cargo test --bin gamelib-shell epic_embed -- macos_epic_embed::epic_embed_load_timed_out_tests` | ✅ | ✅ green |
| 50-02-03 | 02 | 2 | D3/D4/D5/D6 challenge detection, popup handoff, native JS dialogs, blocked launcher scheme | T-50-05, T-50-06, T-50-08 (accept), T-50-09, T-50-10 | `cf-mitigated` header + host/path fallback sets `challenged`, hides subview; popup denied and handed to the system browser via one throttle instance; native JS dialogs present a modal `NSAlert` (no unit-testable surface); blocked-scheme counter bump | unit (D3 only) + manual (D4/D5/D6) | `cargo test --bin gamelib-shell epic_embed -- macos_epic_embed::epic_embed_response_is_challenged_tests` (D3 only) | ✅ (D3); ❌ no unit file possible for D4/D5/D6 — real `WKUIDelegate`/`WKNavigationDelegate` callbacks need a live `WKWebView` | 🟡 partial — D4/D5/D6 verified only by `50-UAT.md` Items 11, 12, 13, 14 |
| 50-03-01 | 03 | 2 | checkpoint:decision — D-10 heading / D-14 placement wording | — | Coordinator resolved both assumption checkpoints before any string was authored, avoiding a 48-translation re-author | checkpoint (no code) | — | — | ✅ resolved |
| 50-03-02 | 03 | 2 | D1 `StoreEmbedTimeoutBanner`, D2 `EpicLauncherBlockedNotice` | T-50-11, T-50-12, T-50-13 | Banner renders only when `timedOut`; notice is a bounded-width, auto-dismissing row; both route external-opens through the one existing `openExternalUrl` call site | unit | `pnpm test -- StoreEmbedTimeoutBanner EpicLauncherBlockedNotice` | ✅ | 🟡 partial — single-row-at-minimum-width / longest-translation layout is `human_judgment: true`; see `50-UAT.md` Items 14, 16 |
| 50-03-03 | 03 | 2 | D3 `'epic-challenged'` `WebviewUnavailablePanel` reason | T-50-11, T-50-13 | Try again button gated on `onTryAgain` presence; DOM order Try-again-before-Open-in-browser; existing reasons unaffected | unit | `pnpm test -- WebviewUnavailablePanel` | ✅ | ✅ green |
| 50-03-04 | 03 | 2 | D4 mint 6 English keys, register i18n gate manifests | — | Second `pnpm i18n` run confirmed a true no-op; 288-failure/48-locale control recorded for plan 04 | other | `pnpm i18n` (no-op confirmed) + `pnpm lint-translations:gamelib` (288/48 control recorded) | ✅ | ✅ green |
| 50-04-01 | 04 | 3 | build `fill/preflight.py` + `fill/write_fill.py` | T-50-14 | 8-check pre-flight (locale set, key set, serialisation, placeholder parity, glossary/pinned-phrase survival, no-empties, insertion-point dual-state, real-validator-with-sabotage-control); all-or-nothing snapshot/restore writer | other (Python, no jest/cargo project) | `python3 fill/preflight.py` | ✅ | ✅ green |
| 50-04-02 | 04 | 3 | author + fill 288 translations across 48 locales | T-50-14, T-50-15 | Every value passed the genuine `validateTranslation` (via the TS bridge); a sabotage control was confirmed rejected; 0 reformatting / 0 unexpected deletions across 96 files; provenance stamped into each `gamelib.mt.json`'s `keys[]` | other (real validator + sabotage control) | `python3 fill/write_fill.py` then `python3 fill/preflight.py` (0 errors, 8/8 checks) | ✅ | ✅ green |
| 50-04-03 | 04 | 3 | gate battery + `sk` leftover-English fix | — | This plan's own scoped 288/48 control measured at 0 failures; the raw `pnpm lint-translations:gamelib` exit is red only on 96 pre-existing, unrelated `library.tileSize` failures (logged `.planning/WINDOWS.md` entry 3, ancestors of this plan's commits) | other | `pnpm lint-translations:gamelib` (FAIL — 96 unrelated hard failures, 0 referencing this plan's 6 keys, confirmed via `grep -cE 'webview\.epicEmbed|epic-challenged'` → 0) + `pnpm planning-gates` (PASS 12/12) | ✅ | 🟡 partial — this plan's own scope is green; the raw gate exit code is red on a pre-existing, unrelated, already-ledgered defect, not silently claimed clean |
| 50-05-01 | 05 | 3 | D1 surface Epic nav-signal state into the hook | — | `loadTimedOut`/`challenged`/`blockedLauncherSchemeCount` surfaced into `StoreEmbedHostState`; `onTryAgain` wired to re-navigate and re-show | unit | `pnpm test -- useStoreEmbedHost` | ✅ | ✅ green |
| 50-05-02 | 05 | 3 | D2 wire plan 03's chrome into `index.tsx`'s JSX | T-50-17 | Three chrome components render at the correct position relative to the still-mounted slot div; `openExternalUrl` reused, no second call site added | unit | `pnpm test -- epicEmbedSurfaceContract` | ✅ | ✅ green |
| 50-05-03 | 05 | 3 | D3 one auth-triggered reload on return (D-04) | T-50-16, T-50-18 | Exactly one `storeEmbedReload()` when `resolveSignInState(...)` has changed since page load; none issued when unchanged; sourced exclusively from the local sign-in-state resolution, never a cookie read | unit | `pnpm test -- useStoreEmbedHost storeEmbedReloadLoop` (Properties 31-35) | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · 🟡 partial (automated coverage exists but a human-judgment/live-gate component remains, named) · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] New test cases in `src/frontend/.../WebviewUnavailablePanel.test.tsx` for the `'epic-challenged'` reason's render/copy — landed in **plan 03 Task 3** (`50-03-03`, commit `e4481c2bc5`)
- [x] A pure, `AppHandle`-free Rust helper plus `#[test]` for the `cf-mitigated` header match / host-path fallback match — landed in **plan 02 Task 3** (`50-02-03`, `epic_embed_response_is_challenged_tests`, 7 cases)
- [x] Extension of `storeEmbedReloadLoop.test.tsx` for the Epic-specific restore path once `embeddable` became platform-aware — landed in **plan 01 Task 2** (`50-01-02`), confirmed by grepping the test file directly: the comment at lines 482-483 ("Phase 50 Plan 01: `linux` keeps this suite's existing Epic-refused-target behaviour (D-05) unchanged") plus the `enterGogFromEpic()` helper and the Epic→GOG switch-restore test at line 617. (Plan 05 also touches this file, but only to widen an unrelated pinned call-shape regex for its own new `signInState` parameter — see `50-05-SUMMARY.md` deviation 1 — not to add the Epic-restore coverage itself.)
- [x] `50-UAT.md` live-gate arms authored per the UAT item shape in `Skill("gamelib-conventions")` — landed in **plan 06 Task 1** (commit `d71bff501`), 19 arms, all `result: pending`

---

## Manual-Only Verifications

Each row's live-gate instructions now live in `50-UAT.md` (authored by plan 06 Task 1) rather
than being restated here — the arm number below is the single source of truth for the exact
launch, ordering constraint, and capture requirement.

| Behavior | Requirement | Why Manual | UAT Arm |
|----------|-------------|------------|---------|
| Cold jar: store boots and paints | D-01 | Native `WKWebView` subview; no jsdom, no `NSWindow` in CI | `50-UAT.md` Item 1 (Launch 1) |
| Warm signed-in jar | L-3 | Spike measured cold `nonPersistentDataStore` only; shared default store is untested | `50-UAT.md` Item 5 (Launch 2) |
| Sign in button in place | L-1 | Live Talon/Cloudflare behaviour | `50-UAT.md` Item 2 (Launch 1, cold profile — never a sign-out of the real account) |
| Occlusion recovery | established #8 | Compositor behaviour | `50-UAT.md` Item 7 (Launch 2) |
| Timeout → reload path | D-05/D-07/D-08 | Timer + native load state | `50-UAT.md` Item 16 (Launch 3, host-level block) |
| Back/forward/URL parity with GOG embed | scope | Delegate-driven native state | `50-UAT.md` Item 9 (Launch 2) |
| Steam embed positive control | scope | Same-session baseline | `50-UAT.md` Item 6 (Launch 2) |
| Minimize/restore and fullscreen survive | D-02 | Window-event interaction with a native subview | `50-UAT.md` Item 8 (Launch 2) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — all 16 tasks across plans 01-05 map to either a real `<automated>` command (12 tasks) or a named `human_judgment: true` component with a `50-UAT.md` arm reference (50-01-01, 50-02-03, 50-03-02; plus 50-03-01, a checkpoint:decision with no code, already resolved). None are uncovered.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — counted across the real 16-task sequence: the only task with no automated command at all is `50-03-01` (checkpoint:decision, no code change), and it is flanked by automated tasks on both sides (`50-02-03` before, `50-03-02` after). Longest gap = **1**.
- [x] Wave 0 covers all MISSING references — `grep -c 'MISSING — Wave 0' 50-0[1-5]-PLAN.md` summed across plans 01-05 = **0**.
- [x] No watch-mode flags — `grep -c -- '--watch' 50-0[1-5]-PLAN.md` summed across plans 01-05 = **0**.
- [ ] Feedback latency < 120s — **measured, not met for the full Jest suite.** `cargo test --manifest-path src-tauri/Cargo.toml --bin gamelib-shell` wall time = **7.168s** (`352 passed; 0 failed; 2 ignored`, `time` output: `1.75s user 2.19s system 54% cpu 7.168 total`), well under the bound. `pnpm test:ci` wall time = **194.43s** (`time` output: `384.40s user 42.85s system 219% cpu 3:14.43 total`), **exceeding** the 120s bound — `543 of 544 suites, 11846 of 11851 tests` passed, the 5 failing tests being the same pre-existing, unrelated `meta/__tests__/lintTranslations.test.ts` `library.tileSize` baseline failures already recorded in `.planning/WINDOWS.md` entry 3 and in `50-04-SUMMARY.md`/`50-05-SUMMARY.md` — not a regression from this plan. Per-task/per-wave scoped runs (the Sampling Rate section above) stay well under the bound; only the full-suite `pnpm test:ci` invocation itself exceeds it. Recorded honestly rather than ticked.
- [x] `nyquist_compliant: true` set in frontmatter — every row in the Per-Task Verification Map has either a real automated command or a named live-gate arm (no row is left with a placeholder or an uncovered requirement), which is the criterion this box tracks; the separate feedback-latency finding above does not change row coverage and is recorded on its own line.

**Approval:** granted 2026-10-14 — automated coverage and Wave 0 closure were confirmed above, and the
live gate this approval was waiting on has now run.

**The precondition cited by the previous wording no longer exists and that wording was stale.** It
withheld sign-off "until Task 3's live gate runs on real hardware (see `50-06-PLAN.md` Task 3 and
the blocking-human checkpoint returned for this plan)". That checkpoint was cleared on 2026-10-13:
the gate ran across four launches, 2026-10-13T08:52Z to 2026-10-14T06:00Z, and closed at **13 pass,
1 issue, 4 blocked, 1 skipped** across its 19 arms (`50-UAT.md` `## Summary`, commit range
`3797fb6b0..b0f847214`).

**What this approval does and does not cover.** It covers what this document measures — per-task
verification-map coverage, Wave 0 closure, sampling rate, and the honestly-recorded feedback-latency
miss on the full-suite run. It does **not** assert that every shipped behaviour was observed on
hardware. One arm failed and four blocked; the authoritative record of what the gate did and did not
establish is `50-VERIFICATION.md` (`status: gaps_found`, 10 of 16 truths verified), not this file.

**One gap stays open against this phase:** G-50-16, the `StoreEmbedTimeoutBanner` never becoming
visible on a load timeout. It was fixed in code by quick task `261014-rso` on 2026-10-14 with a
regression test observed red first, but no Mac has seen the banner paint. UAT Item 16 owes a re-run,
tracked by `.planning/todos/pending/2026-10-14-epic-timeout-banner-fix-needs-a-live-gate-re-run.md`.
Approving this document does not discharge that.
