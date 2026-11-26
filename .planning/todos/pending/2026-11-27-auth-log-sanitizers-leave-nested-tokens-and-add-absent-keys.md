---
created: 2026-11-27T11:00:00.000Z
title: "gog and nile authLogSanitizer redact top-level keys only, and add a redacted key for every key a line lacks"
area: launch
files:
  - src/backend/storeManagers/gog/user.ts:102 (authLogSanitizer assigns four keys on the parsed object)
  - src/backend/storeManagers/nile/user.ts:120 (authLogSanitizer assigns four keys on the parsed object)
  - src-tauri/crates/gamelib-launch/tests/fixtures/golden/redaction/vectors.json (sanitize-gog-nested-objects, sanitize-nile-nested-objects, sanitize-gog-some-keys-absent, sanitize-gog-no-token-keys)
severity: minor
platform: any
ready: code
---

## Problem

Recorded by the 88.2-03 `redaction` golden (D-20: kept as recorded, not fixed there).
Both sanitizers parse the line and assign the redacted marker to four top-level keys. A token under a nested object
(`{"outer":{"access_token":"x"}}`) is written through unchanged. A JSON line that never carried a token key (a plain
status object, `{}`) gains all four keys set to `<redacted>`, so the logged line no longer matches what the CLI
printed. gogdl and nile print flat token objects today, so neither case is live.

## Solution

Not part of the port. The Rust sanitizers replay the golden as it is. After that, decide whether to redact at any
depth and to leave absent keys absent, in one deliberate change recorded in a delta.
