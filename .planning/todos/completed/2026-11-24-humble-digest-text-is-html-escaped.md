---
created: 2026-11-24T00:00:00.000Z
title: 'Humble expiry digest: the OS notification shows the date and a title with HTML entities (1&#x2F;2&#x2F;2027, Tom &amp; Jerry)'
area: humble
severity: minor
platform: any
ready: code
found_by: 'Phase 94 plan 94-17, porting expirationAlerts.ts to Rust (94-09 finding 1; golden/alerts one-key-gains-an-expiration-single-copy and a-hostile-title-is-escaped-by-the-digest-copy).'
files:
  - src-tauri/crates/gamelib-humble/src/expiration_alerts.rs
  - src/backend/humble/expirationAlerts.ts
  - src-tauri/crates/gamelib-humble/tests/fixtures/golden/alerts
---

## Problem

`i18next.t` HTML-escapes every interpolated value by default (the sidecar's init sets no `interpolation` option), and the
OS notification renders plain text. So the single-key body reads `Tom &amp; Jerry&#39;s ... now expires on
1&#x2F;2&#x2F;2027` where the user should see `Tom & Jerry's ... 1/2/2027`. The slash in the date is escaped in every
single-key digest, so every user sees it. The TypeScript has always done this; the Rust port (`build_digest_copy`)
reproduces it on purpose, through the escaping `Catalog::t`, because 94-17 pins the Rust text to the goldens (T-94-31) and
a cutover should not change visible text.

## Direction

Render the two digest calls with `Catalog::t_unescaped` (the title and the date are values for a plain-text API, not
markup), and re-record `golden/alerts` through the oracle in the same change: the notification text and the three
`1&#x2F;...` strings in the goldens move together. The TypeScript copy goes away with Phase 92, so fix the Rust one and
accept the delta against the TypeScript in `golden/alerts`.

Related: `2026-11-24-humble-digest-date-is-en-us-only`.

## Resolution

Fixed on both sides in one change (2026-11-28, quick 261128-3qh): `00aa8661a` is the digest fix with the re-recorded
alerts goldens, and `4afead0fa` flags the gamelib-i18n golden to match.

**Direction change.** The Direction above said to fix Rust only and accept a delta against the TypeScript. That was
replaced by fixing both sides in one commit, so the goldens stay TS-written and no delta was filed. No `deltas.json`
existed under `golden/`, and `golden_alerts.rs` never read one, so the delta path had no consumer. The TypeScript is the
live path (`library.ts` calls it after every sync; the Rust digest has no production caller yet), so the TS fix is what
users see.

**Mechanism.** The four `i18next.t` digest calls in `src/backend/humble/expirationAlerts.ts` each pass
`interpolation: { escapeValue: false }`; the global sidecar init is unchanged, so every other i18next call still
escapes. The Rust `build_digest_copy` renders through `Catalog::t_unescaped`, and `DigestCall::to_value` records the
option so `golden_alerts.rs` replays the calls exactly.

**Golden diff.** 14 recorded calls gained the option, 5 single-copy bodies lost their entities, and the hostile case was
renamed to `a-hostile-title-renders-verbatim-in-the-digest-copy` (the old id described the defect). MANIFEST is unchanged
at count 11 and floor 6.

**i18n golden.** The gamelib-i18n golden's 336 `humble.notification.*` rows are now flagged `escapeValue: false`, and 96
renders changed (the `expiringBodySingle` rows, each to the unescaped text of its old render).

**Delivery.** There is no renderer path: the digest goes to an OS notification only. Windows toasts XML-escape their own
text, which is why the entities showed literally there.

**Accepted residual.** On Linux, notify-rust passes the body through unchanged, and a notification server that advertises
`body-markup` may style a title that contains `<b>` or similar. That holds for every OS notification on Linux, not just
this one. It is display-only and was not live-tested.
