---
created: 2026-11-28T06:45:00.000Z
title: "valveClient 'rejects a symlink entry' sees 'unzip extraction failed', not the 'regular file' cause it expects"
area: steam
files:
  - src/backend/storeManagers/steam/bridge/drm/__tests__/valveClient.test.ts
severity: minor
platform: macos
ready: code
found_by: "Phase 88.1 regression gate (full `pnpm test`, 2026-11-28, macOS Darwin 27.2, /usr/bin/unzip 6.00 Apple build); reproduced with the suite run alone. 88.1 touched no file under drm/."
---

## Problem

`ensureValveClient › rejects a symlink entry` (`valveClient.test.ts:334`) fails on this Mac:

```
Expected substring: "regular file"
Received string:    "unzip extraction failed"
```

The result is still `{ status: 'error', step: 'valve-verify' }` and the symlink is still refused, so the guard holds. What
changed is which layer refuses it. The fixture `bins_win64.symlink.fixture.zip` now makes `unzip` itself exit non-zero,
before the post-extraction regular-file check can name the entry. The likely cause is the macOS 27 `unzip` build refusing
or failing on a symlink entry.

## Solution

Confirm what `unzip -o` does with the fixture on this host (exit code and stderr). Then either accept both causes in the
assertion (the security property is "error at valve-verify, no partials"), or keep the regular-file check reachable by
listing entries (`unzip -Z`) and refusing a symlink before extracting. The second is better if other hosts' `unzip`
still extracts symlinks.
