---
created: 2026-10-09T21:30:00.000Z
title: 'nile sign-in classifier flips healthy/unknown on identical output depending on stdout/stderr interleaving (F-49-R1-5)'
area: auth
severity: medium
platform: any
ready: code
found_by: "plan 49-12, Phase 49 macOS live gate Run 1 (49-LIVE-GATE.md)"
files:
  - src/backend/signInProbe/classify.ts
  - src/backend/signInProbe/__tests__
---

# Same nile output, two different outcomes

Run 1 (`49-LIVE-GATE.md` § Run 1, F-49-R1-5). Launches 1-4, 9, 10: `nile outcome=healthy`.
Launches 6-7: `nile outcome=unknown`. The runner logs are identical in content (`[]` on stdout,
`ERROR [CLI]: No games installed` on stderr); the only visible difference is the order the two
lines were written. The classifier appears to decide on the first chunk seen. Make the nile
classification order-independent and pin it with a test that feeds both orders.
