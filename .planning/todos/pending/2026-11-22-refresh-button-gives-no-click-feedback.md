---
created: 2026-11-22T05:00:00.000Z
title: "Library Refresh button gives no visual feedback when clicked"
area: library-ui
files:
  - src/frontend/components/UI/Header/index.tsx (action-icons-refresh-button)
severity: minor
platform: any
ready: code
---

## Problem

Clicking Refresh in the Library header shows nothing, so it looks as if the click did nothing. The
operator has noticed this before, and it came up again in the Phase 85 live gate (85-20, launches 1 and 6,
2026-11-22). The click does register: the log shows `origin=action-icons-refresh-button` with the refresh
completing about 7 s later.

Operator's words: "refresh button does not respond. I have noticed this issue before, should rotate for
1 sec just to show is responding to the click."

## Fix

Spin the refresh icon for at least ~1 s on every click, and keep it spinning while the refresh is still
running.
