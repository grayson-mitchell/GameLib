---
phase: quick-261128-3qh
plan: 01
subsystem: humble
tags: [humble, i18next, notifications, goldens, rust-port]
requires: []
provides:
  - "Humble expiry digest renders title and date verbatim (TS live path and Rust port)"
affects: [humble-expiry-digest, gamelib-i18n-golden]
key-files:
  modified:
    - src/backend/humble/expirationAlerts.ts
    - src/backend/humble/__tests__/oracle/secretsAlerts.oracle.test.ts
    - src-tauri/crates/gamelib-humble/src/expiration_alerts.rs
    - src-tauri/crates/gamelib-humble/tests/golden_alerts.rs
    - meta/genI18nGolden.ts
    - src-tauri/crates/gamelib-i18n/src/lib.rs
    - src-tauri/crates/gamelib-i18n/tests/fixtures/rendered.json
  created:
    - src-tauri/crates/gamelib-humble/tests/fixtures/golden/alerts/a-hostile-title-renders-verbatim-in-the-digest-copy.json
  moved:
    - .planning/todos/completed/2026-11-24-humble-digest-text-is-html-escaped.md
decisions:
  - "Per-call interpolation: { escapeValue: false } on the four digest i18next.t calls; sidecar global init untouched"
  - "Both sides fixed in one commit, goldens stay TS-written, no delta"
commits: 3
plan_head_before: 710760ada04ad1c29641423df9e5b1f49ca9c1cf
plan_head_after: 352a778ae3668a14c1b1bebb12683c97c13e8280
status: complete
metrics:
  tasks: 3
  completed: 2026-11-28
actuals:
  tasks: 3
  commits: 3
---

# Phase quick-261128-3qh Plan 01: Humble expiry digest renders verbatim Summary

The Humble expiry digest OS notification now shows the game title and date as written (`Tom & Jerry's ... 1/2/2027`)
on both the live TypeScript path and the Rust port, via a per-call `interpolation: { escapeValue: false }` and
`Catalog::t_unescaped`, with the TS-recorded goldens re-recorded in the same change.

## Commits

- `00aa8661a` fix: TS call sites, oracle rename, re-recorded alerts goldens, Rust `build_digest_copy` / `DigestCall::to_value`, replay doc, new unit test `a_hostile_title_and_the_date_reach_the_notification_verbatim`
- `4afead0fa` test: gamelib-i18n golden flags the 7 `humble.notification.*` cases `escapeValue: false` (336 rows flagged, 96 renders changed), `lib.rs` docs
- `352a778ae` docs: todo moved to `completed/` with a `## Resolution`

## Verification

- Baseline compare-mode jest (3 suites, 72 tests): green before and after.
- Alerts diff checker: `alerts-diff-ok calls=14 bodies=5`.
- i18n diff checker: `i18n-golden-diff-ok flagged=336 changed=96`.
- `cargo test -p gamelib-humble`: 283 lib tests plus every integration target green (golden_alerts, state_roundtrip included). `cargo test -p gamelib-i18n`: green.
- clippy `-D warnings` (humble, i18n), `cargo fmt --check`, workspace ratchet `PASS (win32, toolchain 1.99.1)`.
- prettier, eslint (0 errors; the 4 `import-x/no-named-as-default-member` warnings on `i18next.t` are the pre-existing ones, now at shifted lines), `pnpm codecheck`, `pnpm planning-gates` (12/12).
- Wiring gate printed `wired`: `bootstrap.ts` unchanged, no `deltas.json`, old hostile case file gone.

## Deviations from Plan

None - plan executed exactly as written. One mechanical note: a first Python edit of `expirationAlerts.ts` wrote CRLF on
this Windows host; it was normalised back to LF before the first commit (prettier-clean, no CRLF in the diff).

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- Created/modified files exist; commits `00aa8661a`, `4afead0fa`, `352a778ae` are in `git log`.
