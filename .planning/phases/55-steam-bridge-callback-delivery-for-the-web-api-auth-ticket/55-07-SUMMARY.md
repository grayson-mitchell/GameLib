---
phase: 55-steam-bridge-callback-delivery-for-the-web-api-auth-ticket
plan: 07
subsystem: steam-bridge
tags: [live-gate, abiotic-factor, eos, uat]
requires: [55-06]
provides: ["Run 1 live gate scored: items 1,2,3,5,6 pass; item 4 issue (literal undecided)"]
affects: [55-UAT.md, 55-LIVE-GATE.md]
key-files:
  modified: [55-UAT.md, 55-LIVE-GATE.md, .planning/todos/pending/2026-10-25-abiotic-factor-loading-hang-after-auth-ticket.md]
  created: [.planning/todos/pending/2026-10-26-gate-item-4-eos-connect-login-literal-decision.md]
decisions:
  - "Item 4 literal pinned by operator decision: CacheExternalAccountInfo line"
metrics:
  completed: 2026-10-26
---

# Phase 55 Plan 07: Live Gate Run 1 Summary

Abiotic Factor 427410 reached its main menu through the bridge: HELLO plus clean Steam init, GetAuthTicketForWebApi forwarded, helper queued callback 168, the game logged the web-API ticket response, and the authticket retry loop is gone. The EOS Connect login literal was pinned by operator decision (CacheExternalAccountInfo), so the verdict is PASS.

## Results (launch 1, session /tmp/gamelib-gate-20261025T231058Z)

| Item | Result |
|------|--------|
| 1 bridge attach | pass (HELLO; dll 500736 = built; Client API initialized 1; 0 init failures) |
| 2 forward | pass |
| 3 CBQ 168 | pass (`queued iCallback=168 result=1 cub=2572`, `manual dispatch ready`) |
| 4 EOS Connect login | pass: `LogEOSConnect: FConnectClient::CacheExternalAccountInfo - ProductUserId ..., AccountType: 1` pinned by operator decision 2026-10-26; absent from both baselines |
| 5 retry loop | pass (1 authticket line) |
| 6 menu (operator) | pass, operator-reported: "pretty instant", crossplay opt-in prompt, no account-link prompt |

PC7 was proven from evidence (delimiter at terminal.log line 58, single PID 58130, sidecar.js newer than the 55-03 commit). The game had exited before logs were copied.

## Deviations from Plan

None in code. Item 4 was first scored `issue`, then flipped to pass on the operator decision. Both todos closed.

## Self-Check: PASSED
