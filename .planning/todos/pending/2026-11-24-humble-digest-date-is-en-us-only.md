---
created: 2026-11-24T00:00:00.000Z
title: 'Humble expiry digest: the date is always the en-US M/D/YYYY, whatever the process locale'
area: humble
severity: minor
platform: any
ready: code
found_by: 'Phase 94 plan 94-17, porting expirationAlerts.ts to Rust (94-09 finding 2; 94-RESEARCH Pitfall 8).'
files:
  - src-tauri/crates/gamelib-humble/src/expiration_alerts.rs
  - src/backend/humble/expirationAlerts.ts
---

## Problem

The TypeScript digest formats the expiration with `new Date(expiration).toLocaleDateString()` and no locale, so the
sidecar renders the HOST's default locale (en-NZ gives `2/01/2027`, en-US gives `1/2/2027`, de-DE `2.1.2027`). The Rust
port, `expiration_alerts::en_us_date`, pins the en-US `M/D/YYYY` the sidecar produces on a US host (the shape the
goldens record, and the one the 94-09 oracle pinned by supplying `en-US` where the call names none). So a user whose
process locale is not en-US sees a different date format after the cutover than before it, and a user on a non-English
UI language sees an English-order date inside a translated sentence. The calendar day is still right: it is read in the
host zone, only the layout is fixed.

## Direction

Pick one locale policy and apply it to both the date and the sentence around it:

- the app's UI language (`Catalog`'s language, already on `HumbleCtx`) through a small per-language date pattern, or
- the host's regional-format locale, read by the shell and passed in with `HostZone`'s siblings (the crate reads no
  environment of its own).

Whichever is chosen, re-record `golden/alerts` for it deliberately (the date is a recorded param) and keep `en` on the
M/D/YYYY layout so the existing cases keep replaying.

Related: `2026-11-24-humble-digest-text-is-html-escaped` (the same sentence also shows the date HTML-escaped).
