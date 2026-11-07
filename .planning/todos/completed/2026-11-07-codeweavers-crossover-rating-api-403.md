---
created: 2026-11-07T00:00:00.000Z
title: 'CodeWeavers CrossOver rating API returns 403, so no compatibility score'
area: metadata
severity: minor
platform: any
ready: code
found_by: 'Phase 62 smoke 2 (62-UAT.md), pre-existing, not caused by phase 62'
---

The CodeWeavers API returned 403 for the whole smoke session (also in smoke 1), so the CrossOver compatibility score is absent on Steam game pages. Check the request headers or endpoint change and degrade gracefully.

## Resolution

The page scrape was removed rather than its Cloudflare bot check defeated. macOS CrossOver ratings now come from the daily index only; an index miss shows "Unrated" and is cached; an unavailable index stays retryable. Linux no longer requests anything from CodeWeavers. See quick task 261107-j08.
