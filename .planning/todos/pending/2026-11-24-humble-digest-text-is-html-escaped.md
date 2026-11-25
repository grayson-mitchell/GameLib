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
