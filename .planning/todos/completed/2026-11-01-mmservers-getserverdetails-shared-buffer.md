---
created: 2026-11-01
title: 'SteamMatchMakingServers GetServerDetails returns one per-request buffer that the next call overwrites (WR-05)'
area: steam-bridge
files: meta/gen_vtables.ts:3719-3747
severity: medium
platform: any
ready: code
---

58-REVIEW WR-05: the shim returns `gl_mms_tab[f].details`, a single 380-byte slot per request. Real Steam returns a stable pointer per server, valid until ReleaseRequest. A game that collects `gameserveritem_t*` for every index and then sorts or filters sees every pointer alias the last server fetched, and another thread can rewrite the buffer mid-read.

Deferred in 58-27. The fix needs a per-(request, iServer) cache inside the generated shim (`meta/gen_vtables.ts` ~3719-3747), with allocation lifetime tied to ReleaseRequest. No test title exercises the server browser (Schedule I lists SteamMatchMakingServers as stubbed in 58-22 item 6), so the change could not be live-verified here. Until fixed, callers must copy each `gameserveritem_t` before the next GetServerDetails.

## Result

Fixed in quick-261101-i00 (commit 9793f4039). GetServerDetails now returns per-(request, iServer) heap buffers that are never rewritten after return; a changed re-fetch prepends a new buffer and the superseded one stays (shadowed) until release. All are freed on ReleaseRequest, dup-handle reissue, abort and terminal retire, and bounded by GL_MMS_DETAILS_CAP (1024 per request). The interim caveat "callers must copy each gameserveritem_t" no longer applies.

Verification is harness-only (callback_registry_harness.c: case_mms_details_stable, case_mms_details_dup_reissue, case_mms_details_bounds, case_mms_details_alloc_fail), because no live title exercises SteamMatchMakingServers (58-22 item 6).
