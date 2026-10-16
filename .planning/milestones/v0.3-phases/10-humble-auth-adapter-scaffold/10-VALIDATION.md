---
phase: 10
slug: humble-auth-adapter-scaffold
status: approved
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-05
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x |
| **Config file** | `jest.config.js` |
| **Quick run command** | `npx jest src/backend/humble/__tests__/adapter.test.ts --no-coverage` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~1 second (touched suite); full suite longer |

---

## Sampling Rate

- **After every task commit:** Run `npx jest src/backend/humble/__tests__/*.test.ts --no-coverage`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~1 second (targeted backend suite)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-06-01 | 06 | 7 | HACCT-01/02/03 | T-10-17 | overall verdict computed from gamekeys + order-detail + steamAppIdPresent only; identity endpoint carries `advisory:true` and cannot flip the verdict | unit | `npx jest src/backend/humble/__tests__/adapter.test.ts --no-coverage` | ✅ | ✅ green |
| 10-06-02 | 06 | 7 | HACCT-01/02/03 | T-10-15 / T-10-16 / T-10-18 | live gate proves one working transport reaches Humble API from Electron main with real stored cookie; report redacted; dev trigger stays behind `!app.isPackaged` | manual | — (dev-only `window.api.humbleRunValidation()`) | — | 📋 manual — PASS (see Live Validation Gate below) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · 📋 manual*

---

## Wave 0 Requirements

Existing backend infrastructure (Plan 01 adapter tests) covers the automatable Phase 10
behaviors (session-state discrimination, schema parsing). The live-account gate is
inherently manual — it requires a real Humble Bundle account and a real authenticated
session, which cannot be simulated in a unit test. "Existing infrastructure covers all
automatable phase requirements; the live API gate is manual by necessity."

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Full HACCT UX through embedded WebView (login, silent cancel, persistence, expiry/reconnect, disconnect) + live validation gate | HACCT-01, HACCT-02, HACCT-03 | Requires a real Humble Bundle account, a real Humble Guard/reCAPTCHA challenge, and a real authenticated session reaching the live Humble API — none of which can be simulated in a unit test | See "Live Validation Gate (D-12 / D-15)" below for the full UAT steps and recorded result |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or a documented manual-only justification
- [x] Sampling continuity: the one automatable behavior (adapter session-state/schema discrimination) has automated verify
- [x] Wave 0 covers all MISSING references (none found — existing Plan 01 adapter suite is sufficient)
- [x] No watch-mode flags
- [x] Feedback latency < 5s (targeted suite)
- [ ] `nyquist_compliant: true` — PARTIAL: the adapter's session-state/schema logic is automated; the live-account gate and full HACCT UX are inherently manual (real Humble account + real reCAPTCHA/Guard challenge required) and are covered by the Live Validation Gate section below

**Approval:** approved 2026-07-05

---

## Live Validation Gate (D-12 / D-15)

**Date:** 2026-07-05
**Executed by:** User, on a real Humble Bundle account, via the dev-only in-app trigger
(`window.api.humbleRunValidation()`, wired only behind `!app.isPackaged`, T-10-16).

### Validated Transport

**axios** (primary transport, with `Cookie` + `X-Requested-By: hb_android_app` headers).
The D-14-revised `ses.fetch()` fallback on the `persist:humble` partition was **not needed** —
axios was confirmed reachable from Electron main with the real stored cookie on the first
successful run. `HumbleValidationReport.transport` remains `'axios'`.

### D-13-Revised Gate Criteria (Result)

| # | Criterion | Endpoint | Result |
|---|-----------|----------|--------|
| 1 | Gamekeys list retrieval | `GET /api/v1/user/order` | **PASS** — 200, zod-parse OK (order-summary array shape) |
| 2 | Order detail retrieval (≥1 gamekey) | `GET /api/v1/order/{gamekey}` | **PASS** — 200, zod-parse OK |
| 3 | Steam AppID presence in order detail | `tpkd_dict.all_tpks[n].steam_app_id` | **PASS** — present on at least one entry |

**Overall verdict: PASS** (all three D-13-revised criteria satisfied; identity below is advisory and does not affect this verdict).

### Advisory Identity Result (does not affect verdict)

| Endpoint | Result | Notes |
|----------|--------|-------|
| `GET /api/v1/user/info` | 404 (hard failure, every attempt) | Recorded as `advisory:true`. No username is available from this endpoint for this account. Frontend falls back to the generic "Connected" tile label (D-02). Does not fail the gate (D-13 revised). |

### Full HACCT UX UAT (six steps, user-confirmed)

| Step | Behavior | Result |
|------|----------|--------|
| 1 | Login via embedded `/loginweb/humble` WebView (email/password + reCAPTCHA + Humble Guard); auto-return to Manage Accounts; tile shows generic "Connected" (D-02 fallback, no username available) | PASS |
| 2 | Silent cancel — start a second login, navigate away before completing; tile stays disconnected, no error toast (D-06) | PASS |
| 3 | Persistence across relaunch — quit and relaunch; no re-login required (encrypted session persisted, `persist:humble` kept, HACCT-02) | PASS |
| 4 | Live validation gate (`window.api.humbleRunValidation()`) reports overall PASS per the three D-13-revised criteria above | PASS |
| 5 | Expiry → reconnect — tile flips to "Session expired — Reconnect" with a one-time toast; Reconnect reopens the WebView with the partition kept (D-11, HACCT-02) | PASS |
| 6 | Disconnect — confirmation dialog, then account removed and `persist:humble` session data wiped (HACCT-03) | PASS |

### Fix History (discovered and resolved during checkpoint re-runs)

| Fix | Issue | Commit |
|-----|-------|--------|
| 1 | Gamekeys schema mismatch — the zod schema did not match the real `/api/v1/user/order` response shape (order-summary array), causing `schema_error` on every gate run. Corrected the schema and added self-diagnosing `schema_error` logging (redacted) to speed future diagnosis. | `c782983b` |
| 2 | Manage Accounts tile never flipped to "Connected" after a valid login. Root cause: the frontend's connected-state check was gated on `username`, which is always `undefined` because the identity endpoint 404s — the D-02 generic-"Connected" fallback was never wired end-to-end. Threaded the backend's `isLoggedIn` flag through `GlobalState` (initial state, `humbleLogin`, `handleHumbleAuthState`, `humbleDisconnect`, the startup health-check gate) and the Login screen's `isHumbleLoggedIn` + "Connected" i18n fallback. | `e2236bc1` |

### Known Limitation (carried forward to Phase 11+)

The Humble account-identity endpoint (`GET /api/v1/user/info`) hard-404s for this account (and is
assumed unreliable in general — Humble does not document a stable identity endpoint for this auth
flow). No username is available from this source. Any future work that wants to display a Humble
username (beyond the generic "Connected" label) will need a different identity source — this is
explicitly out of scope for Phase 10 and not required by HACCT-01/02/03.

### Redaction Statement

This report contains no cookie values (`_simpleauth_sess` or otherwise), no gamekey values, and no
key values — only endpoint paths, HTTP-outcome status, schema-parse pass/fail, and presence booleans,
per D-15 / T-10-15.
