---
created: 2026-10-25
title: "bridgeScan isContainedWithin rejects child names that merely start with two dots"
source: 53-REVIEW IN-03 (info, deferred by the checker)
area: steam-bridge
files:
  - src/backend/storeManagers/steam/bridge/bridgeScan.ts
severity: minor
platform: any
ready: code
---

**Problem.** `isContainedWithin` in bridgeScan.ts (L76-77) treats any relative path starting with `..` as outside the root, so a legitimate child directory or file whose name begins with `..` (for example `..foo`) is wrongly rejected.

**Fix.** Per 53-REVIEW IN-03: reject only when the relative path equals `..` or starts with `..` followed by a path separator (and is not absolute), instead of a bare `startsWith('..')`. Add a unit test with a `..name` child.
