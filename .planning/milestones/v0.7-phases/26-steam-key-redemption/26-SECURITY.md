---
phase: 26
slug: steam-key-redemption
status: verified
threats_open: 0
asvs_level: L1
created: 2026-07-20
---

# Phase 26 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register built from the `<threat_model>` block in 26-01..26-05-PLAN.md plus the consolidated
> register supplied at audit time (register_authored_at_plan_time: true). VERIFY-MITIGATIONS mode —
> every mitigation below was confirmed present in the cited implementation file/line (grep + direct
> read + green test run), not inferred from plan/summary prose. This audit does NOT scan for new
> vulnerabilities beyond the declared register; it verifies each declared mitigation exists.

---

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user input → renderer | Untyped paste enters the modal; client-side validation is a UX/quota guard, not a security boundary |
| renderer → main (IPC) | A compromised/malicious renderer could send an arbitrary `{store, key}` payload |
| steam-user client → Steam CM | The redeem request crosses to Steam's servers; Steam is the authoritative validator |
| backend → gamelib.log | The raw key (a secret) is present in memory in this path and must not cross into logs |
| Steam session state → sidebar visibility | The entry point must not be reachable without a live Steam session |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-26-01 | Information Disclosure | Raw Steam key logging across all components | mitigate | `redeemKey` (user.ts:625-654) never logs `key`; `classifyPurchaseResult` (user.ts:667-700) logs only `store`/`outcome`/`purchaseResultDetails` (user.ts:694-697); the catch block (user.ts:646-653) extracts only `purchaseResultDetails`/`packageList`, never logs the raw error object; `main.ts:929-931` handler is a bare delegation with zero logging; `addHandler`/`ipcMain.handle` wrapper (backend/ipc.ts:39-49) adds no generic payload logging; `RedeemSteamKeyDialog/index.tsx` contains no `console.*`/logger call anywhere in the file; `preload/api/steam.ts:8` is a generic `makeHandlerInvoker` with no logging. Asserted by `user.test.ts:1103-1124` ("never logs the raw key value" — scans all `logInfo`/`logWarning`/`logError` mock calls for the secret substring), which passes (`npx jest user.test.ts` green, verified live). | closed |
| T-26-02 | Tampering / Input Validation | client-side format gate + `redeemSteamKey` IPC payload trust | mitigate (defense-in-depth) | `isObviouslyMalformed` (steamKeyValidation.ts:18-24) runs in `onRedeem` (index.tsx:62-67) BEFORE any `window.api.redeemSteamKey` call — confirmed by direct read and a green `steamKeyValidation.test.ts` (9/9 passing, including over-rejection guards). Backend does not trust the client gate as authorization: `classifyPurchaseResult` only returns `outcome: 'success'` when Steam's real `client.redeemKey()` resolves with `EPurchaseResult.OK` (user.ts:675-677) — the client-side check has zero bearing on that path. The `try { await client.redeemKey(key) } catch` block (user.ts:639-653) fully wraps the call, so any malformed/adversarial payload (wrong type, empty, garbage `store`) is caught and safely classified into the `'invalid'`/`Unknown` bucket rather than throwing unhandled or crashing the main process — verified by code trace, no privilege escalation reachable (user can only redeem onto their own authenticated session). RESIDUAL FINDING (not a code-level mitigation gap, tracked below as AR-01): 26-REVIEW.md WR-03 flagged that `main.ts:929-931` (`addHandler('redeemSteamKey', async (event, { store, key }) => SteamUser.redeemKey(store, key))`) performs no defensive shape/type validation at the destructuring site — confirmed still present unchanged at time of this audit. The declared security property (no priv-esc, safe-degrade to a classified rejection) holds under verification; the absence of an explicit type guard is a hardening/robustness gap, not a break of the disposition as written ("Steam is authoritative... no privilege escalation"). Logged as an accepted residual risk (AR-01) rather than left silently unaddressed. | closed (AR-01 logged) |
| T-26-03 | Denial of Service | account-level activation cooldown / repeated invalid redeems | accept | No batch/auto-retry loop found anywhere in the redeem path — grepped `RedeemSteamKeyDialog/index.tsx` and `user.ts` for `retry`/`setInterval`/loop constructs; the only "retry" hit is a comment (index.tsx:125) describing that the user may manually retype and re-click. `onRedeem` fires exactly once per explicit button click; the submit button is `disabled={busy}` (index.tsx:155) preventing double-submit while a request is in flight. `OnCooldown` is surfaced as a distinct `'rate-limited'` outcome (user.ts:681-683) with its own copy, not a generic error inviting blind retry. | closed |
| T-26-04 | Elevation / Access Control | redeem entry-point visibility | mitigate (defense-in-depth) | Sidebar item is rendered only inside `{steam.username && (...)}` (SidebarLinks/index.tsx:269-276), wired to `onClick={() => handleRedeemKeyDialog(true)}`. Backend wrapper additionally requires a live session: `redeemKey` calls `ensureConnected()` and bails to `{store, outcome:'error', message:'not-connected'}` if not connected (user.ts:629-637) — so even a bypassed/forced UI render cannot redeem without a live authenticated CM session. Gating asserted by `SidebarLinks/__tests__/index.test.tsx` (2 tests: item absent with no Steam session, item present + `onClick` invokes `handleRedeemKeyDialog(true)` when logged in) — both pass (verified live, `npx jest SidebarLinks` green). | closed |
| T-26-SC | Tampering (supply chain) | npm/pip/cargo installs | accept | Zero new packages added — `git diff ec7882f1..HEAD -- package.json` across every Phase 26 commit (26-01 through 26-05, `bc33e9f6`..`42ea821c`) returns no output; `steam-user`/`@types/steam-user` were pre-existing dependencies from Phase 01, unchanged this phase. | closed |

---

## Unregistered Flags (from SUMMARY.md `## Threat Flags`)

None. Grepped all five `26-0N-SUMMARY.md` files for a `## Threat Flags` heading — no matches found. No new/changed attack surface was flagged by any executor during implementation of this phase.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|--------------|------|
| AR-01 | T-26-02 (main.ts:929-931 shape validation) | 26-REVIEW.md WR-03 flagged that the `redeemSteamKey` IPC handler forwards renderer `{store, key}` with no defensive type/shape guard at the main-process trust boundary. Verified via code trace that no privilege escalation or crash is reachable — `client.redeemKey()` is wrapped in try/catch and any malformed input degrades safely to a classified rejection (`'invalid'`/`Unknown`). The disposition's core security claim ("Steam is authoritative, worst case is a rejected round-trip, no priv-esc") holds. The missing type guard is a defensive-hardening improvement, not a mitigation-as-declared gap; recommend implementing WR-03's suggested guard in a future hardening pass for support/diagnostics quality (a non-`'steam'` store value would currently be echoed back into the result unchanged), but it is not a blocker for this audit. | gsd-security-auditor (per 26-REVIEW.md WR-03 + independent code trace) | 2026-07-20 |
| AR-02 | T-26-03 | No batch/auto-retry loop added this phase — exactly one redeem per explicit user click, same risk profile as typing a key into the Steam client directly. SPEC explicitly excludes batch/automation. Confirmed by grep: no retry/loop construct in the redeem path. | Plan 26-01/26-04 authors | 2026-07-20 |
| AR-03 | T-26-SC | Zero new packages added across the whole phase (26-01 through 26-05) — confirmed via `git diff` showing no `package.json` changes in any phase commit; `steam-user`/`@types/steam-user` pre-existing from Phase 01. | Plan 26-01/26-02/26-03/26-04/26-05 authors | 2026-07-20 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Accepted/Deferred | Run By |
|------------|----------------|--------|------|--------------------|--------|
| 2026-07-20 | 5 | 5 | 0 | 1 residual (AR-01, T-26-02 hardening note — non-blocking) | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept)
- [x] Accepted risks documented in Accepted Risks Log (AR-01, AR-02, AR-03)
- [x] `threats_open: 0` confirmed (no code-level mitigation gaps found)
- [x] `status: verified` — all 5 declared threats CLOSED with file:line evidence and passing tests; residual WR-03 hardening item tracked as AR-01, non-blocking

**Approval:** SECURED — all declared mitigations verified present in implementation; zero open threats.
