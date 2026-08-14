---
created: 2026-08-15T08:50:00.000Z
title: "Disable Plausible telemetry — GameLib is reporting into Heroic's analytics property"
area: telemetry/privacy
needs: decision-then-code-fix
status: OPEN
severity: major
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

**OPEN SUB-DECISION this task must resolve before coding:** does the consent dialog and the
Settings `AnalyticsDialog` get **removed outright**, or **kept and hard-wired off**? These give
different user-visible results and different amounts of dead code:

- *Removed*: cleanest, but deletes a settings surface and its i18n keys (locale-policy question —
  see the `260810-tr4` inert-keys precedent).
- *Kept, hard-wired off*: preserves the surface if telemetry is ever re-introduced under a
  GameLib-owned property, but leaves a control that does nothing, which is its own kind of lie
  (compare [[uploaded-log-delete-button-lies]]).

Check for other outbound endpoints while in here — the same fork-hygiene class as
[[log-upload-has-no-redaction]].
