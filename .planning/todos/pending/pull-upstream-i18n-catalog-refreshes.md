---
created: 2026-08-15T08:50:00.000Z
title: "Pull upstream i18n catalog refreshes — BLOCKED on triaging existing pnpm i18n drift"
area: i18n
needs: unblock-then-port
status: BLOCKED
severity: minor
blocked_by: unresolved `pnpm i18n` catalog drift (must be triaged before the gate scope is regenerated)
upstream:
  - c39d40174 (Heroic v2.22.1 — Updated Translations, #5806) — 72 files, +1008/-463
  - 270353382 (Heroic v2.22.1 — Updated Translations, #5694) — 13 files, +164/-124
files:
  - public/locales/
---

## Problem

Two upstream Weblate translation refreshes landed in Heroic v2.22.1. GameLib has not pulled
either.

**This is BLOCKED, deliberately.** GameLib has known unresolved `pnpm i18n` catalog drift that
must be triaged **before** the i18n gate scope is regenerated. Pulling 1000+ lines of catalog
churn on top of unresolved drift risks masking it — you would no longer be able to tell which
differences are the pre-existing drift and which arrived with the refresh.

## Solution

Triage the existing drift first. Then, when pulling:

**What applies clean:** GameLib's **48 non-English catalogs are still byte-identical to fork
base** (verified 2026-08-15 — `git diff base..HEAD -- public/locales/` touches only `en/`), so
upstream's changes to those apply without conflict.

**What conflicts:** `public/locales/en/translation.json` has diverged **+290 lines** (plus
`en/gamepage.json` +93, and the fork-owned `en/gamelib.json` +102, which upstream doesn't know
about). The `en/` half needs hand-resolution — GameLib's rebranding edits must survive.

**Third complication:** the `i18nCatalogChurnGuard` test asserts that fork edits don't touch
upstream-owned catalogs. It may not distinguish "an upstream refresh being replayed" from "a fork
edit", so expect to either teach it the difference or run the pull in a way the guard can
recognise.

Reference: `git show c39d40174`, `git show 270353382` (Heroic upstream is git remote `origin`).

Related: [[2026-08-06-phase-34-8-i18n-context-fork-namespace-llm-machine-fill-defe]] — the
fork-namespace decision that defines which catalogs are fork-owned vs upstream-owned.
