---
created: 2026-11-01
title: 'Shim per-id report budget of 4 caps legacy-P2P fallback accepts to the first four 1202s per process'
area: steam-bridge
files: meta/gen_vtables.ts:7186-7197,native/steam-bridge/helper/bridge_helper.c
severity: minor
platform: any
ready: code
---

The shim's per-id report budget of 4 (`gl_cb_report_dispatch`) also gates the helper's legacy-P2P fallback, so a non-listening legacy title gets helper accepts for at most its first four 1202 reports per process. Any fix must keep the slot-10 report one-per-1202 so the helper's served FIFO stays paired (e.g. exempt 1202 from the budget while keeping the helper's CBDISP log budget).

Found while fixing WR-07 in quick-261101-iah; no live title currently hits it.

## Result

Fixed in quick-261101-ip5 (commit 4c0ce026b). The shim's `gl_cb_report_dispatch` (generator `meta/gen_vtables.ts`, regenerated `steam_api_shim.c`) exempts 1202 (P2PSessionRequest_t) from the per-id budget of 4, so every 1202 yields exactly one slot-10 report and the helper's served FIFO stays paired. Other ids keep the budget. The helper's CBDISP per-id log budget (4 lines plus one cap line) is unchanged and still bounds log noise; helper C is untouched.

Verification: gen_vtables pins on both generator output and committed shim, helper harness `p2pfb-many` (8 accepts in order, CBDISP capped), build-steam-bridge. Harness-only: no legacy-TCP-mode title is under live test (M-03 stays verified with caveats).
