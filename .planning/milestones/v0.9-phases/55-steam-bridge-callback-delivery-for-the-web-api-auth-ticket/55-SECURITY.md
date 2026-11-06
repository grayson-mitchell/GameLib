---
phase: 55
slug: steam-bridge-callback-delivery-for-the-web-api-auth-ticket
status: verified
threats_open: 0
asvs_level: 1
created: 2026-10-26
---

# Phase 55 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Evidence below was read from the post-review-fix code (WR-01..WR-05 applied). Test evidence is by
source inspection only; the suites were not re-run for this audit.

Path keys: H = `native/steam-bridge/helper/bridge_helper.c`, Q = `native/steam-bridge/helper/gamelib_cbqueue.h`,
D = `native/steam-bridge/generated/bridge_dispatch.h`, S = `native/steam-bridge/generated/steam_api_shim.c`.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| game process (bottle) -> shim -> loopback socket -> helper | Game-controlled `pchIdentity` string crosses into the Mac helper | Untrusted string, ≤4096 bytes |
| helper -> real libsteam_api.dylib | Helper requests a web-API ticket under the user's real Steam account | Ticket request (credential minting) |
| loopback client -> helper CONTROL slot 6 | Any local process that finds the port can send frames (pre-existing unauthenticated posture) | DRAIN requests / ticket bytes out |
| libsteam_api.dylib -> helper ring | Steam-provided callback bytes enter helper memory | Callback 168, web-API ticket (credential) |
| helper reply -> shim decode / game process | Loopback bytes parsed in the game process and handed to game code | Callback payload (credential) |
| game-owned CCallbackBase objects -> shim | The shim stores and later calls through game pointers | Code pointers |
| game thread calling RunCallbacks -> shim locks | Shim locks are taken on game threads | Lock ordering |
| test process -> pinned zig / clang / helper binaries | Child processes spawned from `meta/` and `src/` tests | Environment (HOME) |
| gate evidence / live logs -> repo / session dir | Captured logs may hold account identifiers and Steam/EOS session lines | Account identifiers |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-55-01 | Tampering / DoS | in-string `pchIdentity` decode (D) | mitigate | D:2190-2194: 0xFFFFFFFF -> NULL; `len > 4096 \|\| argLen < 4+len` refuses the call (WR-04: refuse, not truncate); generated code (D:41-43, D:65) | closed |
| T-55-02 | Information disclosure | helper CALL log for GetAuthTicketForWebApi | mitigate | H:526-527, H:736-748: once-per-method latch logs `bd_call_name(ci)` only | closed |
| T-55-03 | Elevation of privilege | bottled game mints web-API ticket for arbitrary identity | accept | See Accepted Risks AR-55-01 | closed |
| T-55-04 | Spoofing | unauthenticated loopback helper port | accept | See Accepted Risks AR-55-02 | closed |
| T-55-05 | Information disclosure | zig spawn inheriting real HOME | mitigate | `createFakeHomeProfile().childEnv()` at msvcCallbackBaseLayout.test.ts:134,153, callbackRegistryHost.test.ts:67,87,92; gate fakeHomeIsolation.test.ts:172 | closed |
| T-55-06 | Tampering | wrong CCallbackBase slot constant | mitigate | meta/msvcCallbackLayout.ts:52,63,71,120 throw rather than default; compiler-measurement arms in msvcCallbackBaseLayout.test.ts | closed |
| T-55-07 | Tampering | zig toolchain supply chain | accept | See Accepted Risks AR-55-03 | closed |
| T-55-08 | Information disclosure | ticket bytes in CBQ log | mitigate | H:453-459 `%d`-only; source pins helperIntegration.test.ts:914 (no `%s/%x/%02x/%p`), :917 (no `m_rgubTicket`); Q has no I/O | closed |
| T-55-09 | Information disclosure | ticket bytes lingering in memory | mitigate | Q `gl_cbq_secure_zero` (volatile) on pop and eviction; H:717 zeroes DRAIN `out`; ring is memory-only | closed |
| T-55-10 | Information disclosure | other local process drains ticket via helper port | accept | See Accepted Risks AR-55-04 | closed |
| T-55-11 | Tampering / DoS | malformed or oversize callback | mitigate | Q `gl_cbq_offer`: closed allowlist {168: 2572}; rejects NULL / `cub<=0` / `cub!=want` before memcpy; pump bounded to 64 (H:442) | closed |
| T-55-12 | DoS | DRAIN handler blocking under `g_bridge_lock` | mitigate | H:694-720 no sleep / no `RunCB`; pin helperIntegration.test.ts:906-907 | closed |
| T-55-13 | Tampering | malformed DRAIN request | mitigate | H:699 `argLen != 0` -> `STATUS_ERR`; H:770 `MAX_FRAME_BYTES`; test helperIntegration.test.ts:873 | closed |
| T-55-14 | Information disclosure | clang/helper test spawns under real HOME | mitigate | cbqueue.test.ts:39,45,56 `profile.childEnv()` | closed |
| T-55-15 | Tampering | drain reply decode | mitigate | S:591-600 ordered length/id/cub checks; S:421 buffer = `GL_CB_DRAIN_RESP_MAX_BYTES` (2584) | closed |
| T-55-16 | Tampering / crash | dangling CCallbackBase pointer | mitigate | S:505-507 registered bit; S:615-621 re-validate under lock; S:518,536 unregister wait + `clear_all`; WR-01 in-flight guard S:461,516. Residual race matches Steam's contract | closed |
| T-55-17 | DoS | registry flood | mitigate | S:416 capacity 512; S:493-495 overflow counted, no flag write | closed |
| T-55-18 | DoS | deadlock via re-entrant handler | mitigate | S:575-581 lock released before transport; S:622 dispatch unlocked; `gl_cb_running` / `run_tid` re-entrancy guard | closed |
| T-55-19 | Information disclosure | ticket bytes in game-process stack buffer | mitigate | S:645-646 volatile zero of `buf` | closed |
| T-55-20 | Information disclosure | harness compile under real HOME | mitigate | callbackRegistryHost.test.ts:67,87,92 `childEnv()` | closed |
| T-55-21 | DoS | deadlock `g_bridge_lock` vs `g_cb_registry_lock` | mitigate | S:23925-23934 `clear_all` after `ReleaseSRWLockExclusive(&g_bridge_lock)`; pinned gen_vtables.test.ts:3162 | closed |
| T-55-22 | Tampering | oversize drain reply desyncs socket | mitigate | S:331-340 `retLen > retBufCap` closes the socket, no resend (WR-02) | closed |
| T-55-23 | DoS | polling cost for other bridged titles | mitigate | S:559 gated on `gl_cb_relay_count`; S:564-567, S:417-420 30 ms throttle, 1000 ms backoff after 8 failures | closed |
| T-55-24 | Repudiation / data loss | lost 168 on resend | accept | See Accepted Risks AR-55-05 | closed |
| T-55-25 | Tampering | version skew (new shim, old helper) | mitigate | S:326-327 `STATUS_ERR` -> 0; S:582-587 break, no dispatch | closed |
| T-55-26 | Information disclosure | gate contract copying logs | mitigate | 55-LIVE-GATE.md:14,50 captures stay in /tmp, never committed; UAT quotes scored literals only | closed |
| T-55-27 | Repudiation | green suite / In-Game mistaken for pass | mitigate | 55-LIVE-GATE.md:7-8; item 6 operator judgement (:82, 55-UAT.md:180) | closed |
| T-55-28 | Tampering | contract authored and run by same plan | mitigate | Authored in 55-06, run in 55-07 (separate commits, e.g. d9f2dda39) | closed |
| T-55-29 | Information disclosure | raw gamelib.log / AbioticFactor.log copies | mitigate | `git ls-files .planning/phases/55*` has no `.log` files | closed |
| T-55-30 | Repudiation | scoring wrong sink or second instance | mitigate | 55-LIVE-GATE.md:35,108,119 single-instance pgrep assertion; UAT records PIDs; scored from archived gamelib-launch-N.log | closed |
| T-55-31 | Elevation of privilege | scope widening after FAIL | mitigate | 55-LIVE-GATE.md:7 no bottled-Steam reroute; F1-F4 record-only; both UAT runs passed without fallback | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-55-01 | T-55-03 | Same trust level as the already-forwarded GetAuthSessionTicket (53-14). Both go through the same generated forward path (D:2170-2200). The bottle runs the user's own game under the user's own account, and the identity string only scopes the ticket's audience. | plan 55-01 threat model; verified by gsd-security-auditor | 2026-10-26 |
| AR-55-02 | T-55-04 | Pre-existing posture (T-51-01): `INADDR_LOOPBACK` bind (H:875), OS-assigned port in a per-game cfg. Not redesigned here. The ticket-minting surface now sits behind it. | plan 55-01 threat model; verified by gsd-security-auditor | 2026-10-26 |
| AR-55-03 | T-55-07 | Zig is pinned to 0.16.0 (meta/downloadZig.ts:40) and its sha256 is checked before extraction (:99-105, :165). Caveat: the checksum comes from the same index response, so this is trust-on-first-use (file header :18-20) rather than a hash pinned in the repo. | plan 55-02 threat model; verified by gsd-security-auditor | 2026-10-26 |
| AR-55-04 | T-55-10 | The unauthenticated loopback port is pre-existing (T-51-01). The ring is kept to 8 slots with drop-oldest. Open residual WR-03: queued tickets survive disconnect and can be drained by any local process. The fix (a per-launch secret in HELLO) is tracked in `.planning/todos/pending/2026-10-26-bridge-helper-callback-ring-drainable-by-any-local-process.md`. | plan 55-03 threat model; verified by gsd-security-auditor | 2026-10-26 |
| AR-55-05 | T-55-24 | UE re-requests the ticket about every 10 s. `gl_cb_no_target` is counted (WR-05, S:~625-632). No ack protocol unless a live gate shows loss. Both UAT runs passed. | plan 55-05 threat model; verified by gsd-security-auditor | 2026-10-26 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-26 | 31 | 31 | 0 | gsd-security-auditor (sonnet) via /gsd-secure-phase |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-26
