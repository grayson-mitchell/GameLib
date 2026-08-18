---
created: 2026-08-15T08:50:00.000Z
title: "Disable Plausible telemetry — GameLib is reporting into Heroic's analytics property"
area: telemetry/privacy
needs: decision-then-code-fix
status: OPEN
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
