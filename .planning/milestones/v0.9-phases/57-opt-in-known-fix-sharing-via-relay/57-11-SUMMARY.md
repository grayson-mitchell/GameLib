---
phase: 57-opt-in-known-fix-sharing-via-relay
plan: 11
subsystem: relay
tags: [relay, wrangler, cloudflare-workers, supply-chain]
requires: [57-10]
provides:
  - relay-only wrangler install and lockfile
  - verified local boot and dry-run bundle of the Worker
affects: [relay deployment]
tech-stack:
  added: [wrangler 4.156.0 (relay/ only, with transitive workerd and esbuild)]
  patterns: [install isolated with pnpm --ignore-workspace; builds allow-listed by name]
key-files:
  created: [relay/pnpm-lock.yaml]
  modified: [relay/wrangler.jsonc]
key-decisions:
  - "wrangler 4.156.0 approved by the user after the legitimacy checkpoint; no version change"
  - "compatibility_date lowered to 2026-10-30, the newest date the bundled workerd supports"
requirements-completed: [D-01, D-03]
duration: 10min
completed: 2026-11-02
---

# Phase 57 Plan 11: Relay wrangler install and local boot Summary

wrangler 4.156.0 installed only inside relay/ after human legitimacy approval; the Worker boots under `wrangler dev`, rejects `{}` with 422 and GET with 405, and the dry-run bundle resolves the shared schema.

## Package legitimacy approval (Task 1, T-57-SC)

The orchestrator ran `npm view wrangler@4.156.0 version dist.integrity repository.url`:
4.156.0, `sha512-kVLAShuLiNgE3jcrmXcymDf/iPKDPrSxACe5ueugW/33HeNB9E9CkKYchudCeBwgmsnl4k+1zt4NO7vqb/fRuQ==`,
`git+https://github.com/cloudflare/workers-sdk.git` (maintainer wrangler-publisher, Cloudflare; also the
current latest). `npm view workerd repository.url` gave `git+https://github.com/cloudflare/workerd.git`.
The user replied "Approve 4.156.0". No commit for Task 1 (no file written).

## Task 2 results

- `pnpm install --ignore-workspace` in relay/: +36 packages, only wrangler 4.156.0 declared.
- pnpm ignored build scripts under `--ignore-workspace` even though relay/pnpm-workspace.yaml already
  allow-lists esbuild and workerd, so `pnpm rebuild esbuild workerd` ran the two postinstalls (named only,
  no `--dangerously-allow-all-builds`). relay/pnpm-workspace.yaml needed no change.
- `wrangler d1 migrations apply gamelib-fix-relay --local`: 0001_init.sql applied.
- `wrangler deploy --dry-run --outdir <tmp>`: succeeded, bindings listed, "--dry-run: exiting now."
  (esbuild resolved the shared src/common/knownFixReport.ts); outdir deleted.
- `wrangler dev --local --port 8787`: POST `{}` -> 422, GET -> 405; server stopped, port 8787 free.
- Root package.json and pnpm-lock.yaml unchanged; `pnpm jest relay` 168/168 pass; `npx tsc -p relay --noEmit`
  and prettier on relay/package.json, relay/pnpm-workspace.yaml exit 0; `pnpm lint` exit 0 (relay/node_modules
  not linted, not picked up by root jest). WRANGLER_SEND_METRICS=false for every wrangler command (T-57-43).

## Deviations from Plan

**1. [Rule 3 - Blocking] compatibility_date newer than bundled workerd**
- **Found during:** Task 2 local boot
- **Issue:** relay/wrangler.jsonc required 2026-10-31 but workerd 1.20261023.1 supports up to 2026-10-30; the runtime failed to start.
- **Fix:** set compatibility_date to 2026-10-30. Dry-run, boot and Jest re-verified.
- **Files modified:** relay/wrangler.jsonc
- **Commit:** a4ae061df

## Known Stubs

None. (wrangler.jsonc keeps the plan-10 "OPERATOR_FILLS" GitHub App ids by design; operator fills them at deploy.)

## Commits

- a4ae061df: chore(57-11): install wrangler 4.156.0 in relay and verify local boot

## Self-Check: PASSED
