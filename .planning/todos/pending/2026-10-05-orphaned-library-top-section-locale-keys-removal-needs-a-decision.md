---
created: 2026-10-05T00:00:00.000Z
title: Orphaned library-top-section locale keys (and soon setting.maxRecentGames) — decide whether to remove them, and how
area: i18n
severity: minor
platform: any
ready: human
found_by: "Phase 48 plan 05 (retired the Library Top Section dropdown; SPEC Boundaries put key removal out of scope)"
source: ".planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/48-05-PLAN.md"
files:
  - public/locales/en/translation.json
---

## Problem

Phase 48 plan 05 deleted `Settings/components/LibraryTopSection.tsx`, so these catalogue entries
are now referenced by nothing:

- `setting.library_top_section`
- `setting.library_top_option.*` (four option labels)

They are present in 47 locale catalogues under `public/locales/*/translation.json`. Plan 48-06
deletes `MaxRecentGames` and orphans `setting.maxRecentGames` (also 47 catalogues) the same way,
so one decision covers all of them.

They are **inert** — an unread catalogue entry costs bytes, not correctness — which is why this is
`minor` and was left alone. Removing them is a decision, not an edit, because key removal in this
repo has three measured traps:

1. **The affected-locale count is 47, not 49.** 49 locale directories exist but only 47 carry
   these keys; a sweep that assumes 49 reports a false miss on the other two.
2. **`da`, `id` and `nl` behave differently** from the rest when a key is removed — do not assume
   a uniform removal pass.
3. **`_one` plural suffixes are load-bearing.** Removing a base key without checking its plural
   siblings can silently break plural resolution for the locales that use them.

## Solution

Decide whether the bytes are worth a removal pass. If yes, remove all four orphaned groups in a
single pass, derive the per-locale fill from in-repo parallels rather than assuming uniformity,
and run `pnpm i18n` plus the lint-translations gate over the result — `pnpm i18n` emitting zero
warnings is the pass condition. If no, close this todo as won't-fix; the keys cost nothing.
