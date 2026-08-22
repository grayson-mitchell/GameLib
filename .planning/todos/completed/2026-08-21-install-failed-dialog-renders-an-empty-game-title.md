---
created: 2026-08-21
title: "Install-failed dialog renders \"The installation of  failed\" — {{title}} interpolates empty"
area: ui
status: OPEN
severity: minor
files:
  - src/backend/downloadmanager/utils.ts
resolves_phase: 37
planned_as: 37-04
---

## Symptom

On a failed Steam install the modal read, verbatim, with the gap intact:

> The installation of  failed: Steam servers dropped the connection. Retry to continue.

The game's name is missing. The backend had the identifier at that exact moment — the adjacent
log line is `Installation of 259130 failed with: ...` — so the appid was available even though
the title was not.

## Cause

`src/backend/downloadmanager/utils.ts:316`:

```js
message: i18next.t(
  'box.error.install.failed',
  'The installation of {{title}} failed: {{error}}',
  { title, error: installErrorReason || 'Unknown error' }
)
```

`error` has a fallback (`|| 'Unknown error'`); **`title` has none**, and resolved empty here.

Note this is NOT the reserved-`{{count}}` i18next trap — `title` is an ordinary interpolation
name. The value itself was empty.

## How to apply

Give `title` the same defensive fallback `error` already has, falling back to `appName` (the
appid) rather than to an empty string — a dialog naming "259130" is worse copy but strictly more
useful than one naming nothing. Then find why `title` is empty on the Steam error path, since
the fallback treats the symptom.

Observed 2026-08-21 under `pnpm tauri:dev`, appid 259130.
