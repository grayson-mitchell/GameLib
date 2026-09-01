---
created: 2026-08-15T08:50:00.000Z
title: "Disable Plausible telemetry — GameLib is reporting into Heroic's analytics property"
area: telemetry/privacy
needs: decision-then-code-fix
status: RESOLVED
severity: major
deferred_until: "post-Phase 35 (electron-cutover-remove-the-electron-build)"
upstream:
  - a71a8b4b7 (Heroic v2.22.1 — Point Plausible analytics to the self-hosted instance, #5736) — SURFACED this, do NOT port
files:
  - src/backend/utils/plausible.ts
  - src/frontend/screens/Settings/components/AnalyticsDialog.tsx
---

## Problem

**GameLib users' telemetry is being sent to Heroic's analytics property.**

Verified 2026-08-15: `src/backend/utils/plausible.ts:19` still posts to
`https://plausible.io/api/event` with `domain: 'heroic-games-client.com'` — the Plausible site
Heroic owns. Every GameLib install with analytics consented is writing pageviews and an
"App Loaded" event into someone else's dashboard.

This was surfaced by reviewing upstream `a71a8b4b7`, where Heroic **repointed themselves** to a
self-hosted `analytics.heroicgameslauncher.com` instance. That commit is **not a port candidate** —
following it would just move GameLib's data to a different Heroic-owned endpoint. The fork needs
its own answer.

## Solution

**Operator decision 2026-08-15: disable telemetry entirely** rather than standing up or
repointing at a GameLib-owned Plausible instance.

**Operator decision 2026-08-18: scope for v0.8, and defer this whole task past Phase 35
(electron-cutover-remove-the-electron-build).** This is a post-cutover feature, not urgent
cleanup — don't pick it up until Phase 35 lands. Resolves the removed-vs-hard-wired-off
sub-decision below for v0.8: neither, yet — telemetry just stays disabled as it is today, and no
UI work happens on this dialog until the redesign below is scoped as its own piece of work.

**OPEN SUB-DECISION, revisit when this is picked up post-Phase 35:** does the consent dialog and
the Settings `AnalyticsDialog` get **removed outright**, or **kept and hard-wired off**? These give
different user-visible results and different amounts of dead code:

- *Removed*: cleanest, but deletes a settings surface and its i18n keys (locale-policy question —
  see the `260810-tr4` inert-keys precedent).
- *Kept, hard-wired off*: preserves the surface if telemetry is ever re-introduced under a
  GameLib-owned property, but leaves a control that does nothing, which is its own kind of lie
  (compare [[uploaded-log-delete-button-lies]]).

This sub-decision is likely moot once the future direction below lands, since that replaces the
whole opt-in dialog with an opt-out model rather than just toggling the existing one.

Check for other outbound endpoints while in here — the same fork-hygiene class as
[[log-upload-has-no-redaction]].

## Future direction (post-Phase 35, separate future work — not this todo's v0.8 scope)

Operator intent as of 2026-08-18, for when this is eventually built out (not just re-enabled):

- Stand up a **GameLib-owned** analytics destination — never re-point at Heroic's or any other
  third party's property again.
- Switch the consent model from **opt-in to opt-out**, mirroring Steam's own telemetry model
  (Steam collects by default, with an explicit opt-out in its own settings) — this is a deliberate
  reversal of the current `analyticsOptIn: false` default in `src/backend/config.ts:328`.
- Add **Steam** as a tracked provider in the "App Loaded" event props. Currently
  `src/backend/utils/plausible.ts`'s `providersObject` only checks `gog`/`epic`(Legendary)/
  `amazon`(Nile)/`sideloaded` — Steam login state and library presence are entirely absent from
  the payload, even though Steam is GameLib's flagship differentiator from upstream Heroic.

This is new feature work (own consent UX, own backend, own privacy-policy language for opt-out),
not a continuation of the current Plausible integration — treat it as a fresh design pass rather
than un-disabling the existing code path.

## Resolution (260901-w9e, 2026-09-01)

**Removed outright.** Commits `9a1147e7c` (consent surfaces) + `d79cea014` (integration).
Net −298 lines; `src/backend/utils/plausible.ts`,
`src/frontend/screens/Settings/components/AnalyticsDialog.tsx` and `.../AnalyticsOptIn.tsx` all
deleted, `AppSettings.analyticsOptIn` and its factory default removed.

**The OPEN SUB-DECISION resolved to *removed*, because the evidence moved after Phase 35.** When
this todo posed removed-vs-hard-wired-off on 2026-08-18 it read as balanced. It no longer is:
`startPlausible()` had lost its only caller in `5643c7583` (plan 35-14), so it had **zero
importers** and even its module-level `settingChanged` listener never registered, and
`build/main/sidecar.js` carried **0** occurrences of `heroic-games-client.com`. The leak this todo
was filed for was therefore already closed as a side effect of the cutover — and "kept, hard-wired
off" was not a hypothetical, it was the *live state*: a first-launch modal asking for consent to
collection naming Plausible, GDPR/CCPA/PECR and "the data we collect", none of which could happen.
That is precisely the [[uploaded-log-delete-button-lies]] failure mode this todo cited as the
argument against hard-wiring off.

**The i18n sub-question was already settled by precedent, twice.** All 12 keys live in
upstream-owned `translation.json`, not `gamelib.json` — measured. `meta/i18nCatalogChurnGuard.ts`
throws `UpstreamChurnError` on any non-`gamelib.json` change under `public/locales/`, asserted
against the live working tree in `pnpm test:ci`. Keys left inert across all 49 catalogs, matching
`260810-tr4` (D-01) and `260805-rwy`.

**"Check for other outbound endpoints while in here" — done.** Swept every `http(s)://` literal in
`src/` and `src-tauri/src/` outside tests. **No second Heroic-owned analytics property exists.**
Two sinks remain, both deliberately untouched and named in the summary so nobody re-derives them:
`dpaste.com` (log upload — already owned by [[log-upload-has-no-redaction]]) and
`heroic.legendary.gl` (Heroic's Legendary metadata API, **read-only**: a fetch, not a report).

**The "Future direction" section below is NOT implemented and remains future work** — no
GameLib-owned destination, no opt-in → opt-out reversal, no Steam in the provider props. It stays
here as the record of operator intent. Note that the reversal to opt-out is worth re-examining
before it is built: Steam's opt-out model rests on Valve's position as the platform the user
already trusts with their account, which a third-party launcher holding Epic/GOG/Amazon/Steam
credentials is not in.

Full record: `.planning/quick/260901-w9e-remove-plausible-telemetry-and-its-consent-surfaces/`.
