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

## Resolution

Fixed 2026-11-27 (tracer commit `7b6fe7cbc`, layout and test commit `b784475dc`). The policy is the UI language, as the
user decided, with no host regional-locale plumb. `gamelib_i18n::Catalog::language()` now reports the shipped directory
name the catalog resolved to (`en` for an unshipped language and for the default catalog), and
`expiration_alerts::digest_date` (formerly `en_us_date`) reads it from `ctx.catalog`, the catalog the shell already loads
from the profile language. A private per-language `DateLayout` (field order, separator, day and month padding, suffix)
does the formatting. The calendar day is still read in the host zone, so only the layout changes.

`en`, an unshipped language and a catalog-less context keep the en-US `M/D/YYYY`, because `en` has no layout arm of its
own and the fallback is that layout. So the 11 `golden/alerts` cases and the `state/` legacy case replay unchanged, and
no golden was re-recorded: `en` is unchanged, and the TS oracle cannot record a non-en layout, because the TS stays on
the host locale and the oracle pins en-US.

Every shipped language is pinned by `every_shipped_language_renders_the_measured_layout`: two dates per language
(2027-01-02 and 2027-12-31) against a Node 22.23.4 / ICU 78.3 / CLDR 48.0 `toLocaleDateString(<tag>, { timeZone: 'UTC' })`
measurement, and the test fails if `SHIPPED_LANGUAGES` gains a language without a measured row. Two details are
named: `fa` takes CLDR's Gregorian Latin-digit layout (`fa-u-ca-gregory-nu-latn`, `2027/1/2`), because plain `fa`
renders the Persian calendar in Persian digits and the crate converts no calendars; and `ar` keeps CLDR's U+200F
RIGHT-TO-LEFT MARK after the day and after the month.

The TypeScript (`src/backend/humble/expirationAlerts.ts`) is deliberately unchanged. It is live today, because the
sidecar's `humbleSync` runs `library.ts`, which calls it, and the Rust digest has no caller until 94-25; but it is not
live after the cutover, because 94-30 deletes `src/backend/humble/`. Until 94-25 wires the Rust digest, users still see
the TS's host-locale date; the UI-language layout arrives with the cutover.

Observation: only `public/locales/en/translation.json` translates `humble.notification.*`, so a non-en user sees the
English sentence with their language's date (`2.1.2027` in German) until those keys are translated.

Tests: `cargo test -p gamelib-humble --lib` 262 passed (expiration_alerts 25), `golden_alerts` 1 and `state_roundtrip` 11,
`gamelib-i18n` lib 6 and `tests/render.rs` 5. rustfmt and clippy `-D warnings` are clean.
