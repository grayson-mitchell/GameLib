---
phase: 57
slug: opt-in-known-fix-sharing-via-relay
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-02
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

Task IDs are filled by the planner. Decision-level map:

| Decision | Behavior | Test Type | Automated Command | File Exists | Status |
|----------|----------|-----------|-------------------|-------------|--------|
| D-03 | Schema pairs equal `TIER1_ROUTING_KEYS` and pass `filterTier1KnownFixes` | unit | `pnpm jest src/backend/__tests__/knownFixReportDrift.test.ts` | ❌ W0 | ⬜ pending |
| D-03/D-19 | Strict schema accepts valid; rejects extra keys (including `title`), bad pair, `drm`+`remove`, non-numeric appId | unit | `pnpm jest src/common/__tests__/knownFixReport.test.ts` | ❌ W0 | ⬜ pending |
| D-04 | URL constant not a placeholder; env override wins | unit | `pnpm jest src/backend/__tests__/knownFixReport.test.ts -t url` | ❌ W0 | ⬜ pending |
| D-09/D-10 | Toggle renders on darwin only, writes the setting, has the (i) icon; backend default false | unit | `pnpm jest src/frontend/screens/Settings` | ❌ W0 | ⬜ pending |
| D-10 | Setting off → no post; non-mac → no post | unit | `... knownFixReport.test.ts -t gate` | ❌ W0 | ⬜ pending |
| D-12 | Skip when the winning layer agrees; CEG passes when the file has only macArch; removal only when the winning entry is still 32; local layer skipped | unit | `... knownFixReport.test.ts -t skip` | ❌ W0 | ⬜ pending |
| D-16/D-17 | Mark on 2xx and on 4xx other than 408/429; no mark on 5xx/408/429/network/abort | unit | `... knownFixReport.test.ts -t sent` | ❌ W0 | ⬜ pending |
| exit contract | Controller registered; `callAllAbortControllers()` aborts an in-flight send; no un-unref'd timer; send never rejects | unit | `... knownFixReport.test.ts -t abort` | ❌ W0 | ⬜ pending |
| hooks / D-18 | 32-bit verdict, 64-vs-curated-32, and CEG (including forced-bridge) each call `reportDetectedFix` without awaiting it | unit | extend `library.test.ts`, games test around `persistBridgeDrmSignal` | ❌ W0 | ⬜ pending |
| D-05..D-08 | Create/merge/remove/delete-file bytes, key order, UTF-8 round-trip | unit | `pnpm jest relay -t fileEdit` | ❌ W0 | ⬜ pending |
| D-06 | Open PR → commit on its branch, no second PR | unit (fake GitHub fetch) | `pnpm jest relay -t pr` | ❌ W0 | ⬜ pending |
| D-20 | PR closed unmerged → suppressed, counted, no reopen or new PR | unit | `pnpm jest relay -t closed` | ❌ W0 | ⬜ pending |
| D-11 | Removal + no file/key on main → labelled issue, opened once | unit | `pnpm jest relay -t bundled` | ❌ W0 | ⬜ pending |
| D-13 | Repeat report increments the count and opens no new PR | unit (node:sqlite D1Like) | `pnpm jest relay -t repeat` | ❌ W0 | ⬜ pending |
| D-14 | Unknown app → 422; Steam 5xx → 503; canonical title written | unit | `pnpm jest relay -t title` | ❌ W0 | ⬜ pending |
| D-15 | Over the per-IP hourly limit → 429; daily cap → 429; stored hash is not the raw IP and rotates daily | unit | `pnpm jest relay -t limits` | ❌ W0 | ⬜ pending |
| D-02 | JWT header/claims verify under RS256; a PKCS#1 key gives a clear error | unit | `pnpm jest relay -t jwt` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `relay/jest.config.js` + root `projects` entry; `relay/tsconfig.json`
- [ ] `relay/src/__tests__/` helpers: `node:sqlite` `D1Like` adapter, scripted fake `fetch` (GitHub + Steam), WebCrypto test keypair
- [ ] Every test file in the map above
- [ ] Export `TIER1_ROUTING_KEYS` from `src/backend/knownFixes.ts`
- [ ] `relay/` dependency install (`pnpm install --ignore-workspace`), behind a checkpoint

---

## Manual-Only Verifications

| Behavior | Decision | Why Manual | Test Instructions |
|----------|----------|------------|-------------------|
| Worker boots and rejects `{}` | D-01 | Needs the wrangler runtime | `cd relay && pnpm wrangler dev`, then curl POST `{}` → 4xx |
| Live done-when | all | Needs a real Cloudflare account, GitHub App and this Mac | Setting on + fresh install of a 32-bit Mac title → PR with the correct `steam/<appId>-steam.json`; setting off → no request in the log |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
