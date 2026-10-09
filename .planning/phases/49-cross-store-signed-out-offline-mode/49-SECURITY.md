---
phase: "49"
slug: "cross-store-signed-out-offline-mode"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
block_on: high
created: "2026-10-09"
register_authored_at_plan_time: true
threats_total: 46
---

# Phase 49 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register authored at plan time in all twelve PLAN files (46 rows, 12 of them the per-plan
> reserved `T-49-SC` supply-chain row). Verified 2026-10-09 by the gsd-security-auditor in
> "run from artifacts" mode (no prior SECURITY.md), ASVS L1 presence checks with several
> high-severity rows cross-checked against the live-gate execution record.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| renderer → sidecar | `?open=` store id, dismissed set, outcome pull | untrusted store ids (allow-listed), labels only |
| sidecar → runner binaries | legendary / gogdl / nile probe spawns | constant argv; stdout/stderr captured, bounded, sanitised |
| sidecar → Keychain (Rust) | Steam / Humble slot reads with `trigger=boot-probe` | presence/outcome labels, never the secret |
| sidecar → persisted stores | per-store `expired` flags, `dismissedSignInNotices` | booleans and store ids; `settings` writes fenced by session epoch |
| operator's real accounts → gate evidence → repo | live-gate record | redacted excerpts only; session dir deleted |

---

## Threat Register

| Threat ID | Plan | Category | Component | Severity | Disposition | Mitigation / evidence | Status |
|-----------|------|----------|-----------|----------|-------------|-----------------------|--------|
| T-49-01 | 01 | Tampering | `?open=` → `resolveLoginOpenRequest` → `openLoginOverlay` | medium | mitigate | `signInState.ts parseSignInStore()` linear exact-membership scan; `loginOpenParam.ts` consumed once via `openParamConsumedRef`, cleared `{replace:true}` (`Login/index.tsx:235-264`) | closed |
| T-49-02 | 01 | Information Disclosure | `collectSignInInputs` / notice | low | accept | `signInInputs.ts collectSignInInputs()` reads only allow-listed booleans/usernames | closed |
| T-49-SC | 01 | Tampering | npm/pip/cargo installs | high | mitigate | `git diff` on `package.json`/`pnpm-lock.yaml` across the phase range is empty — no package installed in any plan | closed |
| T-49-03 | 02 | Tampering | `public/locales/*/gamelib.json` → notice/tile text | medium | mitigate | `pnpm lint-translations:gamelib` 0 hard failures; 49×3 `{{store}}`-exactly-once check re-run, 0 failures | closed |
| T-49-04 | 02 | Repudiation | `gamelib.mt.json` provenance | low | mitigate | 8 keys stamped across 48 `.mt.json` manifests | closed |
| T-49-SC | 02 | Tampering | npm/pip/cargo installs | high | mitigate | `git diff` on `package.json`/`pnpm-lock.yaml` across the phase range is empty — no package installed in any plan | closed |
| T-49-05 | 03 | Information Disclosure | `STORE_ALLOWLIST` additions | medium | mitigate | `storePolicy.ts STORE_ALLOWLIST` adds only `expired`; `storePolicy.test.ts:76-187` keeps credential fields denied | closed |
| T-49-06 | 03 | Tampering | renderer writes `expired=false` to hide a verdict | low | accept | matches shipped `humbleConfigStore.expired` precedent; UI-only, re-latches on next probe | closed |
| T-49-07 | 03 | Spoofing | `skipErrorHandler` used on a real launch would hide the credentials modal | medium | mitigate | `runnerProbes.test.ts:216-243` `skipErrorHandler:true` confined to probe sites (source gate, non-vacuous) | closed |
| T-49-08 | 03 | Tampering | renderer sets `legendaryConfigStore.expired=true` to force offline launches | low | accept | `epicOfflineMode.ts resolveEpicOfflineMode()` OR-only, never blocks a launch | closed |
| T-49-SC | 03 | Tampering | npm/pip/cargo installs | high | mitigate | `git diff` on `package.json`/`pnpm-lock.yaml` across the phase range is empty — no package installed in any plan | closed |
| T-49-09 | 04 | Information Disclosure | captured runner output; `signInProbeOutcomes` payload | high | mitigate | `classify.ts:56 SIGN_IN_PROBE_OUTPUT_CAP = 64_000`; no logger import; `outcomes.ts` push is labels-only | closed |
| T-49-10 | 04 | Tampering | stale verdict overwriting a fresh sign-in | medium | mitigate | `verdict.ts decide()` checks `isSignInEpochCurrent` first → `'stale'`, no write | closed |
| T-49-11 | 04 | Elevation of Privilege | renderer-reachable `getSignInProbeOutcomes` | low | mitigate | `outcomes.ts registerSignInProbeOutcomesHandler()` registers only the pure getter; no renderer channel starts a probe | closed |
| T-49-12 | 04 | Denial of Service | false `expired` from network/5xx forcing needless re-login | medium | mitigate | `classify.test.ts` explicit negative rows per runner; `unknown` never writes | closed |
| T-49-SC | 04 | Tampering | npm/pip/cargo installs | high | mitigate | `git diff` on `package.json`/`pnpm-lock.yaml` across the phase range is empty — no package installed in any plan | closed |
| T-49-13 | 05 | Denial of Service | probe children outliving the sidecar (orphaned authenticated process) | high | mitigate | `pass.ts:84 SIGN_IN_PROBE_BOUND_MS = 45_000` + `SIGN_IN_PROBE_ABORT_IDS`; live: `49-LIVE-GATE.md` launch 7 `steam outcome=unknown elapsed=45009ms` | closed |
| T-49-14 | 05 | Tampering | command injection via probe argv | low | mitigate | `runnerProbes.ts` argv are constant literals; `runnerProbes.test.ts` asserts exact argv (16 pass) | closed |
| T-49-15 | 05 | Information Disclosure | `gogdl auth` stdout (token object) in logs | high | mitigate | `gog/user.ts:379-389 spawnCredentialsWithVerdict()` keeps `authLogSanitizer` and bounded capture; `runnerProbes.test.ts` 'never passes captured text to a logger' ×2 | closed |
| T-49-SC | 05 | Tampering | npm/pip/cargo installs | high | mitigate | `git diff` on `package.json`/`pnpm-lock.yaml` across the phase range is empty — no package installed in any plan | closed |
| T-49-16 | 06 | Elevation of Privilege | `'boot-probe'` reachable from a renderer origin would unlock Steam's keyring gate | high | mitigate | `authTrigger.ts` `'boot-probe'` only in `DELIBERATE_TRIGGERS`, excluded from `ORIGIN_TO_TRIGGER`; `authTrigger.test.ts:185-186` | closed |
| T-49-17 | 06 | Information Disclosure | keyring token / Humble cookie in logs or probe results | high | mitigate | probes return outcome labels only; `probeSession.test.ts` + `runnerProbes.test.ts` assert no cookie/token in logged args | closed |
| T-49-18 | 06 | Spoofing | hidden csrf-backfill webview opened at boot | medium | mitigate | `humble/user.ts:779-813 probeSession()` never calls `getLoginWindowSeamOrThrow`, never reads `csrfToken`; `probeSession.test.ts:257` | closed |
| T-49-19 | 06 | Denial of Service | an `unreadable` read reported as signed-out (false expiry) | high | mitigate | `steam/user.ts:95-124 probeCredentialPresence()` maps `'unreadable'` to `'unknown'`, never `'expired'` | closed |
| T-49-SC | 06 | Tampering | npm/pip/cargo installs | high | mitigate | `git diff` on `package.json`/`pnpm-lock.yaml` across the phase range is empty — no package installed in any plan | closed |
| T-49-20 | 07 | Tampering | malformed `signInProbeOutcomes` payload or persisted `dismissedSignInNotices` value | low | mitigate | `sanitizeSignInProbeOutcomeMap()` and `normalizeSignInDismissals()` drop unknown keys/values | closed |
| T-49-21 | 07 | Denial of Service | Humble expiry no longer latched after removing the renderer health call | medium | mitigate | `verdict.ts applySignInVerdict`/`pushHumbleAuthState` is the single latch path; D-16 source gate | closed |
| T-49-SC | 07 | Tampering | npm/pip/cargo installs | high | mitigate | `git diff` on `package.json`/`pnpm-lock.yaml` across the phase range is empty — no package installed in any plan | closed |
| T-49-22 | 08 | Denial of Service | pass holding the sidecar past stdin EOF (orphaned authenticated process) | high | mitigate | `pass.test.ts:467,479,498` `jest.getTimerCount() === 0`; `smoke:sidecar` covers the cold profile; live launch 8 drained in 2.4 s | closed |
| T-49-23 | 08 | Denial of Service | probe storm / Keychain prompt spam from repeated `online` events or renderer-driven connectivity flapping | medium | mitigate | `pass.ts` online edge rule + `requestSignInProbePass()` single-flight with one coalesced re-run | closed |
| T-49-24 | 08 | Information Disclosure | `[signInProbe]` log lines | medium | mitigate | `pass.ts:199,212,218,239` log lines carry store/outcome/elapsed only; `pass.test.ts:753` T-49-24 block | closed |
| T-49-25 | 08 | Tampering | pass clobbering a dismiss written concurrently | medium | mitigate | `signInProbe/**` never imports `GlobalConfig`/`setSetting` (source gate); `dismissBackstop.test.ts` mid-pass dismiss survives | closed |
| T-49-SC | 08 | Tampering | npm/pip/cargo installs | high | mitigate | `git diff` on `package.json`/`pnpm-lock.yaml` across the phase range is empty — no package installed in any plan | closed |
| T-49-26 | 09 | Spoofing | notice styled or behaving like a system/credential prompt | medium | mitigate | `LibrarySignInNotice/index.tsx` single in-flow `<div>`, no Dialog/notify/window.api; click-only navigation | closed |
| T-49-27 | 09 | Tampering | a dismiss hiding a proven expiry | medium | mitigate | `librarySignInRows.ts:66-68` expired rows `dismissible:false`; dismiss button renders only `{row.dismissible && …}` | closed |
| T-49-SC | 09 | Tampering | npm/pip/cargo installs | high | mitigate | `git diff` on `package.json`/`pnpm-lock.yaml` across the phase range is empty — no package installed in any plan | closed |
| T-49-28 | 10 | Elevation of Privilege | overlay auto-opening from a URL without a click | medium | mitigate | `loginOpenParam.test.ts:214-277` openLoginOverlay from exactly seven sites + 5 red-proof tests (42/42) | closed |
| T-49-29 | 10 | Spoofing | tile and notice disagreeing about a store's state | medium | mitigate | `signInStateParity.test.ts:195-274` tiles and notice pinned to identical selector inputs, 5 red-proof convictions | closed |
| T-49-SC | 10 | Tampering | npm/pip/cargo installs | high | mitigate | `git diff` on `package.json`/`pnpm-lock.yaml` across the phase range is empty — no package installed in any plan | closed |
| T-49-30 | 11 | Information Disclosure | credential backups, runner logs and `gamelib.log` copies in the session dir | high | mitigate | `gate_redact()` applied; Run 1 inventory: 43 redacted excerpts, 0 names/emails/token-shaped strings; session dir deleted | closed |
| T-49-31 | 11 | Tampering | a contract defect (structural impossibility or destructive requirement interaction) invalidating evidence | medium | mitigate | `git log`: `d864cfc51` (49-11 authors the review) precedes `65a28e083` (49-12 runs it) | closed |
| T-49-32 | 11 | Denial of Service | credential/hosts edits left in place after the gate, breaking the operator's real accounts | medium | mitigate | `49-LIVE-GATE.md` § Restores and final state: credentials and `/etc/hosts` restored with positive observables | closed |
| T-49-SC | 11 | Tampering | npm/pip/cargo installs | high | mitigate | `git diff` on `package.json`/`pnpm-lock.yaml` across the phase range is empty — no package installed in any plan | closed |
| T-49-33 | 12 | Information Disclosure | committed run record carrying tokens, cookies or account names | high | mitigate | Plan 12's verify script re-run against the current record: `RUN RECORD OK` | closed |
| T-49-34 | 12 | Repudiation | a verdict reworded or a partially-captured launch scored as measured | medium | mitigate | Run 1: exactly one `gamelib-shell` at window-up and teardown per launch; closing `ls -la`/`wc -l` inventory present | closed |
| T-49-SC | 12 | Tampering | npm/pip/cargo installs | high | mitigate | `git diff` on `package.json`/`pnpm-lock.yaml` across the phase range is empty — no package installed in any plan | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-49-01 | T-49-02 | Renderer reads only allow-listed booleans/usernames; no token or cookie is reachable through the sign-in inputs | plan 49-01 (disposition: accept) | 2026-10-08 |
| AR-49-02 | T-49-06 | A tampered `expired` flag is UI-only and re-latches on the next probe; matches the shipped Humble precedent | plan 49-03 (disposition: accept) | 2026-10-08 |
| AR-49-03 | T-49-08 | `resolveEpicOfflineMode` can only enable offline mode, equivalent to the user-settable `gameSettings.offlineMode` | plan 49-03 (disposition: accept) | 2026-10-08 |

*Accepted risks do not resurface in future audit runs.*

---

## Informational (not threats)

- `49-12-SUMMARY.md` has no `## Threat Flags` heading: plan 12 made no source change; non-fatal per the Phase 48 precedent.
- The six live-gate findings (F-49-R1-1 … -6) are renderer persistence/timing defects and a runner side-effect (legendary deleting `user.json`), not new attack surface. The two `major` ones are fixed and live-verified (`7419d4dc7`, `aea939456`); the rest are `ready: code` / `ready: live-gate` todos.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-09 | 46 | 46 | 0 | gsd-security-auditor (sonnet), orchestrated by the Phase 49 closure chain |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-09
