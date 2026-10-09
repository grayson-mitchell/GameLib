---
created: 2026-10-09T21:30:00.000Z
title: 'Amazon sign-in probe is a no-op with nothing installed: nile list-updates exits before auth (A4, F-49-R1-4)'
area: auth
severity: medium
platform: any
ready: code
found_by: "plan 49-12, Phase 49 macOS live gate Run 1 (49-LIVE-GATE.md)"
files:
  - src/backend/signInProbe/runnerProbes.ts
  - src/backend/signInProbe/classify.ts
---

# nile list-updates never reaches auth when installed.json is empty

Run 1, item 6 (`49-LIVE-GATE.md` § Run 1, F-49-R1-4). Observed 7× across launches: with
`installed.json = []`, `nile list-updates --json` prints `[]` and
`ERROR [CLI]: No games installed` and exits; no token refresh is attempted, so the probe reports
`healthy` whatever the credential state. A user with no installed Amazon game is never told their
sign-in expired. nile's `library sync` (which the app runs anyway at boot) does exercise the
token: `INFO [LIBRARY]: Synchronizing library … Successfully synced`. Consider probing with the
sync command, or classify the no-games case as `unknown` rather than `healthy`.
