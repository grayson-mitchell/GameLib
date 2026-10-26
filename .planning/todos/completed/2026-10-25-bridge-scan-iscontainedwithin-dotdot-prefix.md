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

## Resolution

Resolved 2026-10-26 by quick 261026-ku9 (`8a155aabd`). `isContainedWithin` in `bridgeScan.ts` now rejects only an empty relative path, exactly `'..'`, a path starting with `'..'` plus the platform `sep`, or an absolute result. A child named like `..foo` is therefore contained. New unit cases cover `..foo`, `..foo/bar`, the parent, `../x`, and a shared-prefix sibling. The other copies of the `startsWith('..')` idiom were left as a follow-up (listed in the quick task SUMMARY).
