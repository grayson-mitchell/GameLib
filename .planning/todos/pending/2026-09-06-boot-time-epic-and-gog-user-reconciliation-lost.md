---
created: 2026-09-06
title: "Boot-time Epic/GOG user reconciliation is lost — stale Epic userInfo and stale GOG user details both survive indefinitely"
area: tauri-sidecar
status: OPEN
severity: medium
source: "quick-260906-gej, sweep FINDINGS.md section A row A4"
files:
  - src/backend/storeManagers/legendary/user.ts (LegendaryUser.isLoggedIn, configStore userInfo)
  - src/backend/storeManagers/gog/user.ts (GOGUser.isLoggedIn, GOGUser.getUserDetails)
resolves_phase: null
---

# Boot-time Epic/GOG user reconciliation is lost — stale Epic userInfo and stale GOG user details both survive indefinitely

## The unported side effect

Old `main.ts` ran, at startup:

```
runOnceWhenOnline(async () => {
  if (!LegendaryUser.isLoggedIn()) configStore.delete('userInfo')
  if (GOGUser.isLoggedIn()) GOGUser.getUserDetails()
})
```

(`main.ts:442-457`)

## Bundle-level evidence

Evidence taken against `build/main/sidecar.js` (1351269 bytes, 2026-09-06 10:27):

Log string `User Not Found, removing it from Store` → **0 occurrences** in the bundle.

## Consequence

Two effects lost:

- A stale Epic `userInfo` is never reconciled away, so the UI can show a phantom logged-in Epic
  user after legendary's own credentials go bad.
- GOG user details are never refreshed at boot, so username/avatar go stale until the next login.
