---
phase: 14
slug: guided-claim-flow
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-07
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (`ts-jest` preset), two projects: `src/backend`, `src/frontend` |
| **Config file** | `jest.config.js` (root) |
| **Quick run command** | `pnpm jest <touched file>.test.ts` (e.g. `pnpm jest src/backend/humble/__tests__/library.test.ts`) |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~8 seconds (706 tests, 38 suites, both projects) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm jest <touched file>.test.ts`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~8 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 14-01..05 | 01-05 | 1-5 | HCLAIM-01 | Pitfall 1 | Reveal never fires without explicit confirmation; single call site for `revealKey` | unit | `pnpm jest src/backend/humble/__tests__/library.test.ts` | ✅ | ✅ green |
| 14-01..05 | 01-05 | 1-5 | HCLAIM-02 | T-14 C2 guard | Backend re-check blocks reveal for `ownedElsewhere === true` (exact + fuzzy) | unit | `pnpm jest src/backend/humble/__tests__/library.test.ts -t "C2"` | ✅ | ✅ green |
| 14-01..05 | 01-05 | 1-5 | HCLAIM-03 | — | Successful reveal builds correct clipboard/registerkey URL; adapter contract shape | unit | `pnpm jest src/backend/humble/__tests__/adapter.test.ts` | ✅ | ✅ green |
| 14-01..05 | 01-05 | 1-5 | HCLAIM-04 | Pitfall 8 (write-ahead) | Audit record written before adapter call; survives disconnect; reveal/redeem/undo/C2-block events recorded | unit | `pnpm jest src/backend/humble/__tests__/electronStores.test.ts` + `pnpm jest src/backend/humble/__tests__/library.test.ts` | ✅ | ✅ green |
| 14-01..05 | 01-05 | 1-5 | HCLAIM-05 | — | Non-Steam keys never show one-click activation, only link-out + copy | unit (component) | `pnpm jest src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx` | ✅ | ✅ green |
| 14-01..05 | 01-05 | 1-5 | D-78 (write-ahead rollback) | T-14-07 | Definitive failure rolls back REVEALED flag; ambiguous failure keeps it | unit | `pnpm jest src/backend/humble/__tests__/library.test.ts -t "rollback"` | ✅ | ✅ green |
| 14-01..05 | 01-05 | 1-5 | D-77 (undo redeem) | — | Undo works pre-sync-confirmation, disappears post-sync-confirmation | unit | `pnpm jest src/backend/humble/__tests__/classify.test.ts -t "isLocallyRedeemed"` | ✅ | ✅ green |
| 14-06-01 | 06 | 6 | HCLAIM-01/03/04 | T-14-01, T-14-07 | Full backend+frontend suite green; codecheck clean before verify-work | unit (full suite) | `pnpm test && pnpm codecheck` | ✅ | ✅ green (706/706, tsc clean) |
| 14-06-02 | 06 | 6 | HCLAIM-01..05 (live) | T-14-07 | Live reveal/redeem contract confirmed with one disposable key; C2 block, undo cycle, non-Steam link-out verified end-to-end | manual (checkpoint:human-verify) | N/A — real Humble account + disposable key required | N/A | ✅ approved (2026-07-08) |

Supporting frontend/component coverage referenced above also includes `src/frontend/screens/Humble/Keys/Waiting/__tests__/index.test.tsx` (row state — Claim/Finish-activation/Redeemed transitions, annotation refresh) and `src/backend/humble/__tests__/user.test.ts` (csrf_cookie capture/backfill), both part of the same 706/706 green run.

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. All Wave 0 gaps identified in 14-RESEARCH.md ("Wave 0 Gaps") were closed during Plans 01-05:
- [x] `src/backend/humble/__tests__/adapter.test.ts` — `revealKey()` schema validation, error-status mapping, redacted-logging assertions, CSRF header/cookie attachment
- [x] `src/backend/humble/__tests__/library.test.ts` — reveal/redeem/undo orchestration, C2 re-check, write-ahead ordering, rollback-vs-keep-on-failure-type
- [x] `src/backend/humble/__tests__/classify.test.ts` — `classifyTpk` extended for `isLocallyRedeemed` precedence tier
- [x] `src/backend/humble/__tests__/electronStores.test.ts` — disconnect-survival tests for the new audit/local-redeemed/revealed-key-value stores
- [x] `src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx` — new frontend component test for the claim wizard
- [x] `checkpoint:human-verify` task (Plan 14-06, Task 2) — live reveal-endpoint validation; NOT automatable, requires a real Humble account and consumes one disposable key

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Live reveal/redeem HTTP contract (URL, form fields, response shape, CSRF disposition, transport requirement); C2 hard-block on owned key; mark-redeemed/undo cycle with no second reveal; non-Steam link-out with no one-click activation | HCLAIM-01, HCLAIM-02, HCLAIM-03, HCLAIM-05 | Requires a real, connected Humble account and consumes one disposable UNREVEALED key (C1 irreversibility) — cannot be simulated in unit tests without a live Cloudflare-fronted endpoint | Plan 14-06 Task 2 checkpoint script: (1) reveal on a disposable UNREVEALED Steam key, confirm key shown + clipboard + "Revealed {date}"; (2) "Open Steam" opens `store.steampowered.com/account/registerkey` with key pre-filled; (3) mark-redeemed → undo → re-run Finish-activation with NO second reveal call (verify via log); (4) Claim on an owned/likely-owned key routes to Spares with no reveal; (5) Claim on a non-Steam key shows link-out + copy, no one-click activation |

### Task 2 — Human Checkpoint Outcome: APPROVED (2026-07-08)

The human executed the full checkpoint script from the row above and replied "approved". Outcome, by step:

- **Steps 1-2 (live reveal + Open Steam registerkey deep-link + successful Steam activation):** verified live by the human today, corroborating the prior live reveal + Steam redemption already confirmed during the resolved debug session `humble-reveal-key-fails` (CSRF token present, reveal POST routed via Electron `net.request` on `persist:humble`, succeeded).
- **Steps 3-6 (Finish-activation reopening WITHOUT a second `revealKey` call; Mark-as-redeemed → "Redeemed {date}" + Undo; Undo → back to "Finish activation"; C2 owned-key block routing to Giftable spares; non-Steam link-out):** the human walked the full undo-cycle click path and confirmed each behaved as expected.
- **CSRF disposition:** confirmed REQUIRED (resolved during the debug session, recorded above under "Reveal Endpoint — CONFIRMED contract"). This checkpoint reconfirms it must **not** be dropped as dead code.
- **No key value, cookie value, or other secret was recorded anywhere in this validation file or in chat**, per C4/D-15 discipline.

**Conclusion:** The reveal/redeem HTTP contract, C2 hard block, mark-redeemed/undo cycle, and non-Steam link-out are all empirically confirmed against the live Humble API. Plan 14-06 Task 2 is complete.

### Reveal Endpoint — CONFIRMED contract (empirical, 2026-07-08)

This section records the **empirically confirmed** reveal/redeem HTTP contract, resolved via a 7-round debug session (`.planning/debug/resolved/humble-reveal-key-fails.md`, `.planning/debug/knowledge-base.md`) that included one LIVE reveal + successful Steam redemption with a real disposable key. This supersedes 14-RESEARCH.md's MEDIUM/LOW-confidence cross-verified-but-never-called contract with a live-confirmed one.

- **URL:** `POST https://www.humblebundle.com/humbler/redeemkey` — confirmed correct, unchanged from research.
- **Form fields (`application/x-www-form-urlencoded`):** `keytype=<tpk.machine_name>`, `key=<order.gamekey>`, `keyindex=<tpk.keyindex>` — confirmed correct, unchanged from research.
- **Response shape:** `{ success: boolean, key?: string, error_msg?: string }` — confirmed correct, unchanged from research.
- **CSRF disposition — RESOLVED: required, present-and-needed.** The endpoint enforces a double-submit-cookie CSRF scheme: the `csrf-prevention-token` request header AND a matching `csrf_cookie` value in the request's Cookie header are both **necessary** (confirmed live-correct across rounds 3-6 of the debug session; the reveal still 403'd with only the header attached, per round 5 evidence, until the cookie was also attached in round 3's fix). **The CSRF-capture code must NOT be dropped as dead code** — it is a required, load-bearing part of the request, not incidental. (This corrects 14-RESEARCH.md's Pitfall A framing that CSRF might turn out to be unnecessary.)
- **Transport requirement — NEW finding, not anticipated by research:** the reveal POST **must** be sent via Electron's `net.request` on the `persist:humble` session partition (`credentials: 'include'`, `useSessionCookies: true`, a matching Chrome-shaped User-Agent) — **NOT** plain axios. Axios's Node.js HTTPS stack presents a non-browser TLS/HTTP fingerprint that Cloudflare Bot Management blocks with an HTML challenge page (403, `contentType=text/html`) **before** Humble's own application code inspects the request, independent of whether headers/cookies/CSRF are correct. This is a genuine Chromium TLS/HTTP2 fingerprint requirement, not a content-layer defect — read-only GET Humble endpoints are unaffected and remain on axios.
- **`X-Requested-By: hb_android_app`** is dropped specifically on the reveal POST (kept on all GET/read paths) — neither of the two community reference implementations send it on this endpoint, and round 5 of the debug session removed it as part of closing the gap.
- **Live verification performed:** one disposable UNREVEALED Steam key was revealed and successfully redeemed on Steam during the debug session (2026-07-08, round 7) — confirmed via `gamelib.log` (`csrfTokenPresent=true`, reveal succeeded, no failure/diagnostic line) and verbal user confirmation, including the Steam activation step.
- **Regression coverage:** the fix and its contract are locked in by `src/backend/humble/__tests__/adapter.test.ts`, `src/backend/humble/__tests__/library.test.ts`, and `src/backend/humble/__tests__/user.test.ts`, all part of the 706/706 green run recorded above.
- **Not yet covered by the debug session (remains Task 2 scope):** the C2 owned-key hard-block, the mark-redeemed/undo cycle with no-second-reveal-on-finish-activation, and the non-Steam link-out — the debug session's live verification covered only the happy-path reveal + Steam redeem, not this checkpoint's full script.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (Task 2 is the sole, documented exception — manual by nature, C1 irreversibility)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 8s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved (2026-07-08) — Task 2 live checkpoint confirmed by human; see "Task 2 — Human Checkpoint Outcome" above
