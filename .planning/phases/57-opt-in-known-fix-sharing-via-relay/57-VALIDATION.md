---
phase: 57
slug: opt-in-known-fix-sharing-via-relay
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-11-02
audited: 2026-11-04
---

# Phase 57 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `57-RESEARCH.md` §Validation Architecture, amended for D-17..D-20 in `57-CONTEXT.md`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7 + ts-jest (existing projects Backend / Common / Frontend / Preload / Meta, plus a new Relay project) |
| **Config file** | `jest.config.js` (add `'<rootDir>/relay'` to `projects`), new `relay/jest.config.js` |
| **Quick run command** | `pnpm jest src/backend/__tests__/knownFixReport.test.ts src/common/__tests__/knownFixReport.test.ts relay` |
| **Full suite command** | `pnpm test:ci && npx tsc -p relay --noEmit && pnpm smoke:sidecar` |
| **Estimated runtime** | ~20 s quick, several minutes full |

---

## Sampling Rate

- **After every task commit:** Run the quick run command for the touched area
- **After every plan wave:** Run `pnpm test:ci` + `npx tsc -p relay --noEmit` + `pnpm lint`
- **Before `/gsd-verify-work`:** Full suite green, `pnpm smoke:sidecar`, staging-relay dry run
- **Max feedback latency:** 30 seconds (quick command)

---

## Per-Task Verification Map

Decision-level map (plan-task owning each row):

| Row | Plan-Task |
|-----|-----------|
| D-03 drift | 57-01-T2 |
| D-03/D-19 schema | 57-01-T1 |
| D-04 url (env override, sentinel no-send) | 57-04-T1/T2; deployed-URL sentinel test 57-12-T2 |
| D-09/D-10 toggle | 57-02-T2 (default 57-02-T1) |
| D-10 gate, D-12 skip, D-16/D-17 sent, exit-contract abort | 57-04-T1/T2 |
| hooks / D-18 | 57-08-T1 (Mach-O), 57-08-T2 (CEG) |
| D-05..D-08 fileEdit | 57-05-T1 |
| D-06 pr, D-20 closed, D-11 bundled | 57-09-T2 (REST shapes 57-07) |
| D-13 repeat | 57-10-T1/T2 (body 57-09-T1) |
| D-14 title | 57-05-T2, 57-10-T2 |
| D-15 limits | 57-06-T2, 57-10-T2 |
| D-02 jwt | 57-06-T1 |
| D-01 wrangler dev rejects `{}` | 57-11-T2 (automated locally) |
| Live done-when | 57-12-T3 (57-UAT.md) |

Relay test commands use explicit paths (e.g. `pnpm jest relay/src/__tests__/fileEdit.test.ts`) or the whole Relay project (`pnpm jest relay`).

| Decision | Behavior | Test Type | Automated Command | File Exists | Status |
|----------|----------|-----------|-------------------|-------------|--------|
| D-03 | Schema pairs equal `TIER1_ROUTING_KEYS` and pass `filterTier1KnownFixes` | unit | `pnpm jest src/backend/__tests__/knownFixReportDrift.test.ts` | ✅ | ✅ green |
| D-03/D-19 | Strict schema accepts valid; rejects extra keys (including `title`), bad pair, `drm`+`remove`, non-numeric appId | unit | `pnpm jest src/common/__tests__/knownFixReport.test.ts` | ✅ | ✅ green |
| D-04 | URL constant not a placeholder; env override wins | unit | `pnpm jest src/backend/__tests__/knownFixReport.test.ts -t url` + `src/backend/__tests__/knownFixReportUrl.test.ts` | ✅ | ✅ green |
| D-09/D-10 | Toggle renders on darwin only, writes the setting, has the (i) icon | unit | `pnpm jest src/frontend/screens/Settings/components/__tests__/ShareDetectedFixes.test.tsx` | ✅ | ✅ green |
| D-09 | Backend default false; absent or false setting posts nothing through the real deps | unit | `pnpm jest src/backend/__tests__/configShareDetectedFixesDefault.test.ts src/backend/__tests__/knownFixReport.test.ts -t "D-09"` | ✅ (audit 2026-11-04) | ✅ green |
| D-10 | Setting off → no post; non-mac → no post | unit | `pnpm jest src/backend/__tests__/knownFixReport.test.ts -t gate` | ✅ | ✅ green |
| D-12 | Skip when the winning layer agrees; CEG passes when the file has only macArch; removal only when the winning entry is still 32; local layer skipped | unit | `pnpm jest src/backend/__tests__/knownFixReport.test.ts -t skip` | ✅ | ✅ green |
| D-16/D-17 | Mark on 2xx and on 4xx other than 408/429; no mark on 5xx/408/429/network/abort | unit | `pnpm jest src/backend/__tests__/knownFixReport.test.ts -t sent` | ✅ | ✅ green |
| exit contract | Controller registered; `callAllAbortControllers()` aborts an in-flight send; no un-unref'd timer; send never rejects | unit | `pnpm jest src/backend/__tests__/knownFixReport.test.ts -t abort` | ✅ | ✅ green |
| hooks / D-18 | 32-bit verdict, 64-vs-curated-32, and CEG (including forced-bridge) each call `reportDetectedFix` without awaiting it | unit | `pnpm jest src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts -t "report\|CEG\|ceg"` | ✅ | ✅ green |
| D-05..D-08 | Create/merge/remove/delete-file bytes, key order, UTF-8 round-trip | unit | `pnpm jest relay/src/__tests__/fileEdit.test.ts` | ✅ | ✅ green |
| D-06 | Open PR → commit on its branch, no second PR | unit (fake GitHub fetch) | `pnpm jest relay/src/__tests__/publish.test.ts -t pr` | ✅ | ✅ green |
| D-20 | PR closed unmerged → suppressed, counted, no reopen or new PR | unit | `pnpm jest relay -t closed` | ✅ | ✅ green |
| D-11 | Removal + no file/key on main → labelled issue, opened once | unit | `pnpm jest relay/src/__tests__/publish.test.ts -t bundled` | ✅ | ✅ green |
| D-13 | Repeat report increments the count and opens no new PR | unit (node:sqlite D1Like) | `pnpm jest relay/src/__tests__/handler.test.ts -t repeat` | ✅ | ✅ green |
| D-14 | Unknown app → 422; Steam 5xx → 503; canonical title written | unit | `pnpm jest relay -t title` | ✅ | ✅ green |
| D-15 | Over the per-IP hourly limit → 429; daily cap → 429; stored hash is not the raw IP and rotates daily | unit | `pnpm jest relay -t limits` | ✅ | ✅ green |
| D-02 | JWT header/claims verify under RS256; a PKCS#1 key gives a clear error | unit | `pnpm jest relay/src/__tests__/githubApp.test.ts -t jwt` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `relay/jest.config.js` + root `projects` entry; `relay/tsconfig.json`
- [x] `relay/src/__tests__/` helpers: `node:sqlite` `D1Like` adapter, scripted fake `fetch` (GitHub + Steam), WebCrypto test keypair
- [x] Every test file in the map above
- [x] Export `TIER1_ROUTING_KEYS` from `src/backend/knownFixes.ts`
- [x] `relay/` dependency install (`pnpm install --ignore-workspace`), behind a checkpoint

---

## Manual-Only Verifications

| Behavior | Decision | Why Manual | Test Instructions |
|----------|----------|------------|-------------------|
| Worker boots and rejects `{}` | D-01 | Needs the wrangler runtime | `cd relay && pnpm wrangler dev`, then curl POST `{}` → 4xx. Run 2026-11-02 (57-11-SUMMARY): POST `{}` → 422, GET → 405 |
| Live done-when | all | Needs a real Cloudflare account, GitHub App and this Mac | Setting on + fresh install of a 32-bit Mac title → PR with the correct `steam/<appId>-steam.json`; setting off → no request in the log. Recorded in `57-UAT.md` (`status: complete`) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-04 (`/gsd-validate-phase 57`)

---

## Validation Audit 2026-11-04

| Metric | Count |
|--------|-------|
| Gaps found | 1 |
| Resolved | 1 |
| Escalated | 0 |

- Phase suites re-run: 16 suites, 265 tests green (backend/common/frontend phase-57 files + `relay`), plus 37 detector-hook tests in `library.test.ts` / `games.test.ts`.
- Gap: D-09 backend default `shareDetectedFixes: false` was grep-verified only (57-02-T1). Filled in `75792b6e6`. `configShareDetectedFixesDefault.test.ts` covers the factory default and a fresh config. The new `gate with the real default deps (D-09)` describe in `knownFixReport.test.ts` covers an absent or false setting, which posts nothing. Sabotage-checked: flipping the default to `true`, or loosening the gate to `!== false`, turns them red. 26/26 green after restore.
