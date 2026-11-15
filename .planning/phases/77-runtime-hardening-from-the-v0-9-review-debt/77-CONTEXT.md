# Phase 77: Runtime hardening from the v0.9 review debt - Context

**Gathered:** 2026-11-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Close DEBT-02, DEBT-03 and DEBT-04, the three v0.9 review warnings the audit ranks highest.

**Scout finding that reshapes the phase:** the v0.9 audit's tech-debt list was compiled from
`56-VERIFICATION.md` and `60-VERIFICATION.md`, which were written *before* the review-fix runs.
Two of the three items are already fixed on `main`:

| Req | Finding | State on main | Evidence |
| --- | --- | --- | --- |
| DEBT-02 | 57 WR-09: relay reads the body unbounded when `Content-Length` is missing | **OPEN**: `relay/src/handler.ts:124` calls `request.text()` before the size check | `57-REVIEW-FIX.md:192` (skipped, out of scope) |
| DEBT-03 | 56 WR-02: an `execFile` handle holds the sidecar loop up to 3 s after stdin EOF | **FIXED**: `4f41cfab7` (`runBoundedListing`); then 66.2 (`0d5742ed3`) moved all spawning onto the process runner, which unrefs the child, its pipes and the kill timer. `src/backend` has no raw `execFile` calls left | `56-REVIEW-FIX.md` WR-02; `src/backend/storeManagers/steam/bridge/drm/boundedListing.ts`; `src/backend/process/runner.ts` |
| DEBT-04 | 60 WR-01: a missed overlay close leaves game input blocked | **FIXED + live-verified**: `2d3f1f5e8` (open state carries the helper pid; `overlay_input` polls it every 2 s while open and force-closes on ESRCH; the helper publishes 0 at startup and exit). Live spot-check passed 2026-11-04 (`1ba023f7f`) | `60-REVIEW-FIX.md` WR-01 Status line |

So the phase delivers **one code change** (DEBT-02) plus **evidence-based closure** of DEBT-03/04.

</domain>

<decisions>
## Implementation Decisions

### Closing DEBT-03 / DEBT-04 (already fixed)
- **D-01:** Close both **on evidence, without new live runs.** For each one: re-run the tests that cover it,
  cite the fix commits, and mark the requirement complete in `REQUIREMENTS.md`.
  - DEBT-03: `src/backend/process/__tests__/runner.test.ts` (the drain describe block) and
    `src/backend/storeManagers/steam/bridge/drm/__tests__/boundedListing.test.ts` (its loop-drain arm
    measures the real runner).
  - DEBT-04: the overlay_input publisher-watch tests (live-publisher no-self-close, dead-publisher close)
    and `meta/__tests__/overlayInputSmoke.test.ts`. Cite the 2026-11-04 live spot-check.
- **D-02:** Correct the out-of-date records so they stop listing these as open: the `follow_ups` /
  advisory entries in `56-VERIFICATION.md` (WR-02) and `60-VERIFICATION.md` (WR-01), and the
  tech-debt list in `.planning/milestones/v0.9-MILESTONE-AUDIT.md` (lines ~50 and ~163-164).
  Annotate them with a resolved-by note and commit hash. Do not rewrite their history.
- **D-03:** Before closing DEBT-03, run a quick grep for spawn paths that bypass the runner
  (`child_process` users: `spawnAsync.ts`, `utils/macArch.ts`, `sidecar/*FlowRegistration.ts`,
  `steam/bridge/helperRegistry.ts`). If one holds a ref'd timer, pipe or child at EOF, it is
  in scope as part of DEBT-03 ("sidecar exit is not held by a lingering handle"). If none does,
  record that the check ran.

### DEBT-02: relay body bound
- **D-04:** Use a **capped stream read**. Read `request.body` with a reader and keep a running byte
  count. Once it passes `KNOWN_FIX_REPORT_MAX_BYTES` (2 KB), cancel the reader and answer
  `413 { status: 'rejected', detail: 'too large' }`. Chunked or length-less bodies stay accepted
  when they are under the cap. Do **not** answer 411.
- **D-05:** Keep the existing `Content-Length > max → 413` fast-path. The capped read applies **always**,
  including when `Content-Length` is present, because a declared length can lie. Decode the collected
  bytes as UTF-8 and pass them to the existing `JSON.parse` / `parseKnownFixReport` path unchanged.
- **D-06:** Keep the handler's never-throws contract: an error while reading the stream maps to the
  existing 4xx/503 shape, not an unhandled rejection. The per-IP limit check still runs before the
  body read (D-15: every attempt counts).

### DEBT-02: done bar
- **D-07:** DEBT-02 is done only when the change is **merged, deployed and probed live**:
  1. Unit tests in `relay/src/__tests__/handler.test.ts`: a chunked body over the cap with no `Content-Length` → 413;
     a chunked body under the cap → reaches validation/accept; `Content-Length` under the cap but a longer
     real body → 413; the existing tests stay green.
  2. A **human checkpoint**: the user runs `pnpm --dir relay deploy` (`wrangler deploy`). Claude does not
     deploy: it is outward-facing and needs the user's Cloudflare credentials.
  3. A live probe: one chunked, over-cap POST to `https://gamelib-fix-relay.gamelib.workers.dev/v1/reports`
     returns 413. Note that the probe counts against that IP's hourly limit (D-15), and it must not create
     a report row or a PR. Probe with a body that fails before validation.

### Claude's Discretion
- How the stream-reading helper is factored (inline in `handler.ts` or a small `readCappedBody` helper
  with its own test).
- Exact wording of the resolved-by annotations in the VERIFICATION and audit docs.
- Whether DEBT-03/04 closure is a single plan or folded into the DEBT-02 plan's tail.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source findings
- `.planning/milestones/v0.9-MILESTONE-AUDIT.md` — tech-debt list (lines ~49-53, ~163-164); out of date for DEBT-03/04
- `.planning/milestones/v0.9-phases/57-opt-in-known-fix-sharing-via-relay/57-REVIEW.md` §WR-09 — the relay finding and both suggested fixes
- `.planning/milestones/v0.9-phases/57-opt-in-known-fix-sharing-via-relay/57-REVIEW-FIX.md` §WR-09 — recorded as skipped
- `.planning/milestones/v0.9-phases/56-bridge-steamclient-layer-drm-mode-for-steamstub-titles/56-REVIEW.md` §WR-02 — the drain measurements
- `.planning/milestones/v0.9-phases/56-bridge-steamclient-layer-drm-mode-for-steamstub-titles/56-REVIEW-FIX.md` §WR-02 — fix + measurement (44 ms vs 2049 ms control)
- `.planning/milestones/v0.9-phases/56-bridge-steamclient-layer-drm-mode-for-steamstub-titles/56-VERIFICATION.md` — out-of-date follow-up (lines 25-26, 75)
- `.planning/milestones/v0.9-phases/60-steam-overlay-in-bridged-games-on-macos/60-REVIEW.md` §WR-01 — overlay finding
- `.planning/milestones/v0.9-phases/60-steam-overlay-in-bridged-games-on-macos/60-REVIEW-FIX.md` §WR-01 — fix design, trade-offs, live spot-check pass
- `.planning/milestones/v0.9-phases/60-steam-overlay-in-bridged-games-on-macos/60-VERIFICATION.md` — out-of-date follow-up (lines 51, 64)

### Conventions
- `Skill("gamelib-conventions")` — sidecar exit contract (DEBT-03 evidence); the `<verify>` prettier rule
  (scoped `npx prettier --check` over the exact paths written; `--file-info` first, since `.planning/` paths
  are prettier-ignored)

### Requirements
- `.planning/REQUIREMENTS.md` lines 57-59, 95-97 — DEBT-02/03/04 rows to tick

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `KNOWN_FIX_REPORT_MAX_BYTES` and `parseKnownFixReport` (`src/common/knownFixReport.ts`, imported by
  `relay/src/handler.ts:4-8`): the cap constant and validator stay as they are.
- `relay/src/__tests__/handler.test.ts` + `relay/src/__tests__/helpers`: existing request/deps fixtures
  for the handler; extend them for chunked (`ReadableStream`) bodies.

### Established Patterns
- The relay handler never throws; every outcome goes through `respond(status, body, headers?)`.
- Order in `handleReport`: method/path → salt check → per-IP limit → content-type → size → JSON → schema.
  The body bound replaces the `request.text()` step (`handler.ts:120-127`) and keeps that order.
- Relay fixes from the 57 review landed as `fix(57): WR-NN ...` commits in `relay/`.

### Integration Points
- `relay/` is its own pnpm package (`wrangler` 4.156.0, own jest config). Run its tests from `relay/`.
- Deploy: `relay/package.json` `deploy` script → `wrangler deploy` (user-run checkpoint).
- Client: `src/backend/knownFixReport.ts:36` posts to the worker URL. No client change is needed.

</code_context>

<specifics>
## Specific Ideas

- The live probe must not create a D1 report row or a GitHub PR. Send an over-cap body so it is rejected
  before parse/validation.

</specifics>

<deferred>
## Deferred Ideas

None. Discussion stayed within phase scope.

### Reviewed Todos (not folded)
`todo.match-phase 77` returned 16 keyword matches (packaged blank render, PowerA winebus wedge, Mac Steam
Spacewar presence, native-port hint, playtime refresh, Windows signing, optionaldlc, protonfixes import,
humble login splits, pinned libsteam_api, Friends re-login, Amazon store-exit, Steam verify/move,
launch-without-Steam, refresh-via-Steam-client). They are all keyword noise: none touches the relay body bound, the sidecar
exit contract or overlay input release. None was folded.

</deferred>

---

*Phase: 77-runtime-hardening-from-the-v0-9-review-debt*
*Context gathered: 2026-11-15*
