---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
verified: 2026-11-16
status: human_needed
score: 7/7 goal-level truths verified (2 confirmed review defects need an operator decision)
overrides_applied: 0
human_verification:
  - test: "Decide whether review defects A/CR-01 (session.rs close_conn -> Replaced) and C1/CR-01 (rustSession.getClient returns latest lease) are fixed before or after phase close"
    expected: "Operator picks: gap-closure plan now, or follow-up phase/todo"
    why_human: "Both are real, code-confirmed defects that do not falsify the phase goal but weaken D-02 (retry once) and concurrent install+Refresh"
---

# Phase 79 Verification

**Goal:** Steam's CM network is reached from Rust, and steam-user and steam-session are deleted.
**Status:** human_needed (goal achieved; operator decision needed on the 2 critical review findings)

## Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Tauri-free Rust crate pair on steam-vent exists in src-tauri workspace | VERIFIED | `src-tauri/crates/gamelib-steamcm` and `gamelib-steamcm-cli` present; session.rs read, substantive |
| 2 | CM auth, anon client, owned apps, PICS, depot keys, request codes, redeem, Refresh run in Rust via rustInvoke, TS signatures unchanged | VERIFIED | `storeManagers/steam/rustSession.ts`, `cm/`, anonymousClient.ts exist; UAT items 1-9, 12, 21-25 pass with `[steamcm] rust ...` log lines |
| 3 | Parity harness, delete gate | VERIFIED | 79-PARITY.md "Delete gate" = MET; Tier 1/2 and D-16 Refresh parity recorded |
| 4 | steam-user and steam-session npm packages deleted | VERIFIED | Not in package.json or pnpm-workspace.yaml; no `patches/steam-user*`; no TS `import` of either under src/ or meta/ (only the negative assertions in `steamCmPortComplete.test.ts`) |
| 5 | Dev fallback flag retired (79-41) | VERIFIED | Flags removed per 79-41; no cm=ts path remains in src |
| 6 | Existing users stay signed in; sign-in (QR, credentials, Guard) works on Rust Web API | VERIFIED (live) | UAT 5-7, 18, 20, 24 pass (after fixes e70995a2c etc.) |
| 7 | Reconnect across network drop and sleep/wake; clean exit with no orphan | VERIFIED (live) | UAT 3, 4, 9, 19, 25 pass (`CM session rebuilt`, `CM sleep gap`, no sidecar left) |

Deliberate, accepted deviations (not gaps): Mac Steam owned-apps path OFF by default (UAT 14 "issue", todo 2026-11-15-mac-steam-path-shows-playing-spacewar.md); no go-offline wrap (79-WRAP-RETEST.md PASS, UAT 13), restore-only wrap; UAT 8 (real redeem) and 16 (account-mismatch) skipped, covered by unit tests. Item 16 must be run when the Mac path is re-enabled.

## Post-deletion CI
rust-test run 43748179863 green on 3 legs. test.yml 43748179910 fails only the 8 pre-phase baseline suites plus 4 from other sessions (themeTokens, flowRegistrationCensus, ipcDomainCensus, steamLineCeiling); I did not re-run CI, this is taken from 79-PARITY.md.

## Requirement ID accounting
REQUIREMENTS.md has no row for any ID in this phase (ROADMAP says "Requirements: TBD"; no orphaned REQUIREMENTS.md rows map to Phase 79). All are phase-local:
- D-01..D-18: decisions in 79-CONTEXT.md (all 18 appear in plan frontmatter or CONTEXT; D-01 is Claude's-discretion lease model, D-17 is a scope-exclusion that the polling state machines stay in TS, which holds, and moved to phase 80).
- CF-01..CF-08: plan-local constraints, defined inline in plan text (e.g. 79-01-PLAN: CF-01 = the 63/73/75 pattern; CF-06 = Rust host returns `''`, 79-RESEARCH); VALIDATION maps CF-01/02 to 79-01. Not in REQUIREMENTS.md.
- AM-01 (amend STEAM-STACK.md), AM-02 (amend CLAUDE.md): plan-local, defined in 79-01-PLAN; both amendments are present (CLAUDE.md Technology Stack text records the Phase 79 change).
- TODO-084: closing the folded todo; no longer in todos/pending (closed in 79-43).
All accounted for; none blocked.

## Code review findings (79-REVIEW.md): decision
Both criticals confirmed by me in the code:
- **A/CR-01:** `close_conn` sets `self.kill = None` (session.rs:758) and `run_op`'s kill arm maps a dropped sender to `Replaced` (session.rs:405-407). In-flight ops during a rebuild, logout or shutdown get `replaced` and skip retry-once. Contradicts D-02's "retry once" for ops actually in flight; UAT 3/4 passed because installs survived (the CDN downloader, not CM ops, was in flight).
- **C1/CR-01:** `getClient()` returns the last-acquired lease (rustSession.ts:73-77); a concurrent Refresh can hand an install the wrong lease and cause `leaseUnknown` after release.

Recommendation: they do NOT block the phase goal. The goal (CM reached from Rust, both packages deleted) is demonstrably met and live-proven. They are correctness defects in edge/concurrency paths, with a one-line-class fix for A/CR-01 plus a test. Classification: WARNING, follow-up gap-closure (`/gsd-code-review 79 --fix`) preferred soon, especially A/CR-01 since D-02 is a stated decision. The 21 warnings and 23 infos were not individually re-verified; treat as follow-up quality work. Operator decides.

## Anti-patterns
No debt-marker scan was run across all 112 files; the review reports no secret leaks and unref'd timers. Not independently re-verified.

## Gaps
None blocking. Open items: the two criticals above, the Spacewar todo (Mac path), UAT 8 and 16 unrun live.
