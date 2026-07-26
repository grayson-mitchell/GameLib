---
created: 2026-07-26T00:00:00.000Z
title: "Log upload sends unredacted content to a public paste — no audit performed"
area: security
files:
  - src/backend/logger/uploader.ts
  - src/backend/logger/
  - src/frontend/components/UI/LogFileUploadDialog/index.tsx
---

## Problem

`uploadLogFile` sends up to 10 MiB of log content to dpaste.com as a public paste with a 2-day
expiry, and there is no redaction anywhere in `src/backend/logger/`. GameLib adds Steam refresh
tokens and revealed Humble key values that upstream Heroic never had, so the potential blast
radius of an unredacted upload is larger here than in upstream Heroic. The threat surface is
identical in both builds and predates the Tauri port; the upload sits behind a confirm dialog
(`LogFileUploadDialog`), so this is not a silent background upload.

**No audit has been performed.** The user explicitly declined a bounded audit of whether a live
credential (Steam refresh token, revealed Humble key value) can actually reach a log line, during
Phase 34.3's context-gathering (D-09). This todo carries no finding — it records only the open
question, not a confirmed vulnerability. Do not read this todo as evidence that a credential leak
has been demonstrated; it has not been checked either way.

## Solution

A future owner must START by determining whether a live credential can actually reach a log line
reachable from `uploadLogFile` — that bounded audit was explicitly declined for Phase 34.3 and not
performed. If the audit finds a real path, add redaction before upload (e.g. a scrub pass over
known token/key patterns) and re-run the audit to confirm it closes the path. If the audit finds
no reachable path, downgrade this todo to a documented non-issue rather than closing it silently.
