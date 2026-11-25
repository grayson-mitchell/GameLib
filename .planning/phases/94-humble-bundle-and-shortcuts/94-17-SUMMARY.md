---
phase: 94-humble-bundle-and-shortcuts
plan: 17
subsystem: backend
tags: [rust, humble, expiry-digest, i18n, dedupe, backfill, user-agent, golden, d-06, d-17, d-20, pitfall-8]
status: complete

requires:
  - phase: 94-humble-bundle-and-shortcuts
    provides: 94-09 the alerts (11) and user_agent (8) goldens and the escaping/unescaping gamelib_i18n::Catalog; 94-08 the state goldens (the legacy backfill case); 94-13 the HumbleUi seam and the catalog on HumbleCtx; 94-15 HostZone and local_zone_at
provides:
  - gamelib_humble::expiration_alerts with detect_and_notify_expiration_transitions, build_digest_copy, digest_calls, en_us_date, AlertKey, AlertOptions, AlertOutcome, Withheld, Digest, DigestCall, Transition
  - gamelib_humble::user_agent::standard_browser_user_agent
  - tests/golden_alerts.rs (11 alerts goldens plus the sync flow's legacy backfill case)
  - two triaged todos (the en-US-only date, the HTML-escaped digest text)
affects: [94-19, 94-25, 94-30]

requirements-completed: []

actuals:
  tokens: 14000
  tasks: 2
  commits: 2

plan_head_before: dd498034d567fa969a6f001017695cb7f8b2b33c
plan_head_after: a10429ef78298107b5a31e026cac88ec0d4c32af

tech-stack:
  added: []
  patterns:
    - "the digest's i18next calls are data (digest_calls), rendered by build_digest_copy and returned in the outcome, so a golden compares the calls (key, default, params) as well as the rendered text"
    - "a gate or a failed record write withholds the toast but never the other way round: the dedupe write precedes ui.notify, and a key whose record cannot be written is excluded from the digest"
    - "JavaScript's \\S as an explicit class built from one constant, checked against js_date::is_js_whitespace over the whole BMP"

key-files:
  created:
    - src-tauri/crates/gamelib-humble/src/expiration_alerts.rs
    - src-tauri/crates/gamelib-humble/src/user_agent.rs
    - src-tauri/crates/gamelib-humble/tests/golden_alerts.rs
    - .planning/todos/pending/2026-11-24-humble-digest-date-is-en-us-only.md
    - .planning/todos/pending/2026-11-24-humble-digest-text-is-html-escaped.md
  modified:
    - src-tauri/crates/gamelib-humble/src/lib.rs

key-decisions:
  - "The digest text keeps i18next's HTML escaping (the notification shows 1&#x2F;2&#x2F;2027 and Tom &amp; Jerry), through the escaping Catalog::t, because the plan demands every alerts golden replay and T-94-31 names the escaping Catalog::t; the visible defect is filed as 2026-11-24-humble-digest-text-is-html-escaped (fix = Catalog::t_unescaped plus a deliberate golden re-record)."
  - "The date is pinned to the en-US M/D/YYYY (the plan's decision and the goldens' shape), read as the calendar day in the host zone at the expiry instant (ctx.zone.offset_east_secs_at(instant)); a zone-less expiry string is read in the offset in force now (local_zone_at(now), the 94-15 rule). The locale policy for other process locales or UI languages is filed as 2026-11-24-humble-digest-date-is-en-us-only."
  - "detect_and_notify_expiration_transitions takes an AlertOptions {suppress_notifications, notify_humble_expirations, steam_deck_game_mode} beside (ctx, keys): the TS read these from the config slice, the environment and an option, and this crate reads neither settings nor environment. 94-25 supplies them."
  - "A key whose dedupe record cannot be written is excluded from the digest and counted in write_failures, and an unopenable store shows nothing (store_unavailable). The TS silently no-ops a write on a read-only store and notifies anyway, which would re-fire every sync."
  - "A context with no catalog renders each key's inline default through Catalog::default() (what i18next does with no resources); a context with no ui records and withholds (Withheld::NoUi)."

patterns-established:
  - "a state golden whose result is a self-contained {before, after} of one store file is replayed by seeding before, running the one call at the golden's clock, and comparing after"

requirements: [SVC-04]
duration: 60min
completed: 2026-11-24
---

# Phase 94 Plan 17: Expiry digest and the browser user agent Summary

**The Humble expiry digest runs in Rust: transition detection, the WR-01 legacy backfill, the dedupe record written before the notification, and the title and body rendered from the same `humble.notification.*` keys and params as i18next, byte-identical to all 11 alerts goldens and the sync flow's legacy backfill state; the browser user agent is a Rust twin pinned to the same 8 vectors as the relocated TypeScript.**

## What was built

- **Task 1 (tracer): `expiration_alerts.rs`, `tests/golden_alerts.rs`, the todos.** `detect_and_notify_expiration_transitions(ctx, keys, opts)` opens `humble_notified_expiration` through `HumbleStore`, and for each key: copies a bare machine-name record forward to `gamekey:machineName` when the composite is absent (every key, as the TS does, whatever its expiration), then compares `current` with the recorded `expiration`; a change writes `{expiration}` and the `__timestamp.<key>` stamp (the TS `CacheStore.set` order) and joins the digest. After the loop the three gates apply in the TS order (baseline, setting, Steam Deck Game Mode), then `ui.notify`. `build_digest_copy` renders one transition with the single title and body (`{{title}}`, `{{date}}`) and any other count with the plural pair (`{{count}}`), through `Catalog::t`. `digest_calls` exposes the two calls as data. The en-US date is `en_us_date` (a Hinnant civil-from-days over the zone-shifted instant, no `jiff` range limit).
- **`golden_alerts.rs`** replays every alerts golden on a FakeHome with a recording `HumbleUi`, the bundled `public/locales` catalog and a clock pinned to 2026-11-24T12:00:00Z: per run the notifications (title and body), the i18n calls (key, default, params), and after the case the exact bytes of the store file. The sync flow's `golden/state/legacy-notified-expiration-is-backfilled-to-a-composite-key` is replayed too, from its self-contained `{before, after}` at the second sync's clock (+1 s), so the replayed case count is the alerts manifest's 11 plus 1.
- **The expirationAlerts.test.ts describes** are named Rust unit tests: null to date, D-92 dedupe and moved date, the baseline, both WR-01 duplicate-machine-name cases, the legacy backfill, singular and plural copy, the D-93 setting gate, the Pitfall 4 Deck guard, Pitfall 5 (the body is exactly the template over title and date), and no writes for a null expiration. Added: the record exists at the instant `notify` runs, an unwritable record is never shown, a headless context, the date in the host zone, civil-from-days edges, the `digest_calls` shape, and a guard that the base plural key equals `_one` and `_other` in every shipped locale.
- **Task 2: `user_agent.rs`.** `standard_browser_user_agent(&str)` with the three patterns spelled out. JavaScript `\S` is an explicit class built from one constant and checked against `js_date::is_js_whitespace` over the whole BMP. The test replays all 8 vectors against the manifest (count equals directory, floor 5) plus the defensive branch (no platform group, or a platform group with no Chrome token), the first-token-only Electron strip (the JS pattern has no `g`), and a NBSP-terminated Chrome version. The TS twin and `humbleShortcutsShimSchedule` still pass.

## Evidence

- `cargo test -p gamelib-humble --test golden_alerts`: 1 test, 12 cases (11 + legacy state), floors for single and plural digests, a withheld gate and a silent repeat asserted.
- `cargo test -p gamelib-humble --lib expiration_alerts`: 21 passed. `--lib user_agent`: 5 passed.
- `cargo clippy -p gamelib-humble --all-targets -- -D warnings` and `cargo fmt -p gamelib-humble --check`: clean.
- `pnpm planning-gates` 12/12 (the two new todos carry `severity`, `platform`, `ready` in order; `grep -c "^ready: code"` on the date todo is 1), `pnpm find-deadcode` (310 baselined, unchanged), `pnpm check:ipc-contract` up to date, `pnpm codecheck` clean, `testContainment` 44/44, `humblePortComplete` / `shortcutsPortComplete` / `infoPortComplete` 212/212, `userAgent.test.ts` and `humbleShortcutsShimSchedule` 50/50.
- The tracer gate: `<verify>` was re-run end to end on the committed slice before Task 2 and passed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] A dedupe record that cannot be written suppresses the notification** (the plan's prohibition: never notify the same expiry twice). The TS `CacheStore.set` silently no-ops on a read-only store and the digest fires anyway, so it would re-fire every sync. Rust excludes such a key from the digest (`write_failures`), shows nothing for an unopenable store (`store_unavailable`), and logs a fixed line. Tests: `a_record_that_cannot_be_written_is_never_shown`, `the_dedupe_record_exists_before_the_notification_is_raised`.

### Choices where the plan was silent or wrong

- **Signature.** The plan's `detect_and_notify_expiration_transitions(ctx, keys) -> AlertOutcome` has no place for the three inputs the TS read from outside (the `suppressNotifications` option, `notifyHumbleExpirations`, `isSteamDeckGameMode`); an `AlertOptions` argument carries them. Keys are `AlertKey` (title, dates and ids only, so a key value cannot reach the copy), with `From<&HumbleKey>`.
- **Escaping and locale (the 94-09 carry-over).** The plan decides both: parity with the goldens (escaped text) and the en-US date. Followed, and both are filed as todos. The plan named one todo (the date); the escaping is a second, separate defect with its own fix and triage, so it has its own file. See key-decisions for the fix directions.
- **"count equal to the alerts MANIFEST plus the legacy backfill case".** The alerts manifest already holds a legacy case (`legacy-machine-name-entry-...`). The "plus one" is the sync flow's `golden/state/legacy-notified-expiration-...` (94-19 replays that golden's whole flow; here only its self-contained `{before, after}` digest step). Both are replayed: `coverage.cases == manifest.count + 1`.
- **Date zone.** `ctx.local_zone_at(now)` (the 94-15 rule) reads a zone-less expiry string; the displayed calendar day uses the offset at the expiry instant, which is what `toLocaleDateString` does.
- Nothing is wired to a caller (94-25 wires the library sync); no op was added to `OPS`.

## Not verified locally

- macOS and Linux CI legs were not run; nothing here is platform-specific.

## Windows-only failures

None.

## Known Stubs

None.

## Threat Flags

None. T-94-31: the notification text goes through the escaping `Catalog::t` and equals i18next's by the goldens; the notification API renders plain text (and the escaping itself is the filed defect). `AlertKey` has no key-value or key-index field, and the Pitfall 5 test pins the body to the template over title and date.

## Self-Check: PASSED

- expiration_alerts.rs, user_agent.rs, tests/golden_alerts.rs and both todos present; lib.rs declares both modules.
- Commits 57008bab0 and a10429ef7 on gsd/phase-94-humble-bundle-and-shortcuts.
