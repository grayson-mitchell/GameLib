# Phase 78: Verification records and test health after v0.9 - Pattern Map

**Mapped:** 2026-11-16
**Files analyzed:** 17
**Analogs found:** 15 / 17

Governing decisions: D-17..D-20 override D-08/D-09/D-12/D-14/D-16 where they conflict. Locate code by text, not line number (lines drift).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `.github/workflows/lint.yml` | config (CI) | batch | same file, `Backend DI ceilings` step (L43-47) | exact |
| `.husky/pre-push` | config (hook) | batch | same file, narrowing line (own status) | role-match |
| `meta/__tests__/backendDiCeilingsWiring.test.ts` | test | transform | itself (`gateUnmasked`, L48-57, L84-95) | exact |
| `meta/__tests__/gameInfoNarrowingWiring.test.ts` | test | request-response (stub pnpm) | itself (`runHook`, L125-180) | exact |
| `meta/__tests__/steamLineCeilingWiring.test.ts`, `boundaryWiring.test.ts` | test | transform | `backendDiCeilingsWiring.test.ts` | exact |
| `.../v0.9-phases/52-*/52-VERIFICATION.md` and `53-*/53-VERIFICATION.md` | doc | n/a | `53-VERIFICATION.md` frontmatter `retired_overrides` | role-match |
| `52-UAT.md`, `53-UAT.md` (Gaps) | doc | n/a | `51-UAT.md` Gaps entries with `status: accepted` | role-match |
| `58-VERIFICATION.md` (`follow_ups`), `52-REVIEW-FIX.md` | doc | n/a | RESEARCH D-08 table | n/a |
| `.planning/todos/pending/<grouped red-suites todo>.md` | todo | n/a | `2026-10-25-x86-shim-...-deferred.md` | exact |
| `.planning/todos/pending/2026-11-14-lint-workflow-red-masks-ratchet-steps.md` | todo (move) | n/a | `git mv` to `completed/` | exact |
| `src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts` (WR-03 pin) | test | transform (source pin) | same test `58-35 source pins` | exact |
| `src/backend/storeManagers/steam/bridge/inviteBridge.ts` (IN-01) | service | event-driven | same file L50-80 | exact |
| `.../bridge/__tests__/inviteBridge.test.ts` (IN-01 test) | test | event-driven | same file L60-80, L156-179 | role-match |
| `native/steam-bridge/helper/bridge_helper.c` (IN-02 comment) | comment | n/a | n/a (comment only) | n/a |
| `shimCoverage.ts`, `src/backend/knownFixReport.ts` (comments) | comment | n/a | n/a | n/a |

## Pattern Assignments

### `.github/workflows/lint.yml` (un-mask four steps)

**Analog:** `Backend DI ceilings` step, lines 40-47. Copy comment style and `if:` verbatim onto `Prettier code.`, `Find dead code`, `Module boundaries`, `Steam file line ceiling`. `Lint code.` (first step) gets NO `if`.

```yaml
      # It runs even when an earlier step failed, because from a58e3e3e8 a red `Lint code.`
      # hid ceiling drift (quick 261114-2gg); a failed install still skips it.
      - name: Backend DI ceilings
        if: ${{ !cancelled() && steps.deps.outcome == 'success' }}
        run: pnpm backend-di-ceilings
```
Existing steps to edit use bare `- name: X` / `run: pnpm x` (e.g. `- name: Prettier code.` / `run: pnpm prettier`), with `id: deps` on install-deps at L24.

### `meta/__tests__/*Wiring.test.ts` (assert un-masking)

**Analog:** `backendDiCeilingsWiring.test.ts`. Lift/reuse `gateUnmasked` generalised over a run string:
```typescript
function gateUnmasked(steps: Step[]): boolean {
  const install = steps.find((s) => s.uses === './.github/actions/install-deps')
  const gate = steps.find((s) => s.run === GATE_RUN)
  const cond = gate?.if ?? ''
  return (
    install?.id === 'deps' &&
    cond.includes('!cancelled()') &&
    cond.includes("steps.deps.outcome == 'success'")
  )
}
```
Paired near-miss (copy for each newly guarded step):
```typescript
it('near-miss: with the gate step if removed it is masked again', () => {
  const steps = lintSteps().map((s) => {
    if (s.run !== GATE_RUN) return s
    const { if: _dropped, ...rest } = s
    return rest
  })
  expect(gateUnmasked(steps)).toBe(false)
})
```
Pins to replace because they require `&&` chaining (L100-106 in backendDi: `'pnpm steam-line-ceiling && pnpm backend-di-ceilings'`; steamLineCeilingWiring L65-70 `pnpm boundaries && pnpm steam-line-ceiling`; boundaryWiring L59-63 needs `pnpm boundaries` on line 2, line 1 shebang). Replace with order assertions through the stub-pnpm log.

### `meta/__tests__/gameInfoNarrowingWiring.test.ts` (invert masking)

**Analog:** `runHook` stub-pnpm harness (L125-157) plus `EXPECTED_ORDER` (L111-121). Uses `createFakeHomeProfile({ prefix })`, stub `pnpm` logging `$1`, `PNPM_STUB_FAIL` to force one red. Invert this test (L174-178):
```typescript
it('a red lint still runs the ratchet and fails the push', () => {
  const r = runHook(prePush, 'lint')
  expect(r.status).not.toBe(0)
  expect(r.log).toContain('gameinfo-narrowing-ceiling')
  expect(r.log).not.toContain('prettier')   // <- becomes toContain, plus find-deadcode, boundaries, steam-line-ceiling
})
```
Add one case per check (`it.each`) proving a red X still runs all later checks and exits nonzero. Keep `pnpm codecheck` on line 2 (`tsconfigMeta.test.ts:94` cites it).

### `.husky/pre-push`

**Analog:** current lines 2-8: status captured immediately after each command, combined into `checks_status`, hook errexit-free.
```bash
pnpm gameinfo-narrowing-ceiling
narrowing_status=$?
if [ "$chain_status" -ne 0 ]; then checks_status=$chain_status; else checks_status=$narrowing_status; fi
```
Extend: line 2 = `pnpm codecheck` only (hard prerequisite); then `rc=0; pnpm lint || rc=1` style per check (lint, prettier, `i18n --fail-on-update`, find-deadcode, boundaries, steam-line-ceiling, backend-di-ceilings, gameinfo-narrowing-ceiling). Keep graphify refresh gated on a zero combined status.

### Superseded UAT gap entry (`52-UAT.md`, `53-UAT.md`)

**Analog for non-failed status:** `51-UAT.md` ~L261 (`status: accepted` + `resolution:`):
```yaml
- truth: "Hoard (63000) reaches playable single-player through the bridge (D-51-14 anchor)"
  status: accepted
  resolution: "Hoard crashes under Wine regardless of the bridge; ..."
  reason: "User reported: ..."
```
Apply (52-UAT, indented YAML): `status: superseded` then `superseded_by: "<phase/plan/commit + todos/completed path>"` directly after, original `reason:` kept. 53-UAT one-line: `- truth: ... status: superseded. superseded_by: 53-16 census items 18-21. evidence: ... fix: ...`. No tool parses Gaps status (RESEARCH D-07), so no vocabulary change. ELEX 52 row cite: Phase 54, `steamAuthSessionPolicy.test.ts` Rule G, mechanism "no authenticated CM at launch".

### `53-VERIFICATION.md` / `52-VERIFICATION.md` (superseded state precedent)

**Analog:** `53-VERIFICATION.md` frontmatter L6-12:
```yaml
overrides_applied: 1
retired_overrides:
  - must_have: "Modern-SDK named title Overlooting 3410180 reads verified"
    retired_at: "2026-10-26"
    reason: "No longer needed: quick 261026-rqb fixed ... Todo closed: .planning/todos/completed/..."
    originally_accepted_by: "user (Grayson Mitchell)"
    originally_accepted_at: "2026-10-25T15:20:00+13:00"
```
Pattern: cause + date + closing artifact + path under `completed/`. Body rewrite: current report on top (52: RV4 block, L237-293), old `gaps_found` text under `## Superseded report (2026-10-24)` with headings demoted to one H1. Do not touch frontmatter shape (frontmatter gate parses it). `.planning/**` is prettier-ignored, so omit the prettier check and say so.

### Pending todo frontmatter (grouped red-suites todo, D-17)

**Analog:** `.planning/todos/pending/2026-10-25-x86-shim-modern-sdk-and-flat-api-parity-deferred.md` L1-12:
```yaml
---
created: 2026-10-25
title: "..."
area: steam-bridge
files:
  - meta/bridgeCensus.ts
severity: minor
platform: any
ready: blocked
```
Order `severity:`, `platform:`, `ready:` bare lowercase. Vocabulary: severity critical|major|medium|minor; ready code|live-gate|human|blocked. Verify with `pnpm planning-gates`. List the 12 suites with first failure messages (RESEARCH L155-166).

### `helperIntegration.test.ts` (WR-03 source pin)

**Analog:** `58-35 source pins` test (~L2201-2214), extend it:
```typescript
const raw = readFileSync(HELPER_SOURCE_PATH, 'utf8')
const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
expect(raw).toContain('#define GL_MAX_CONNS 16')
expect(src).toContain('SO_SNDTIMEO')
```
Add `expect(raw).toContain('#define GL_SEND_TIMEOUT_USEC 250000')` and `expect(src).toContain('SO_SNDBUF')` (comment-stripped `src` for code tokens, `raw` for `#define`, matching existing usage).

### `inviteBridge.ts` IN-01 and its test

**Current code** (L63): `socket.once('error', () => finish(null))`. Change to `socket.on('error', () => finish(null))` (`finish` is already idempotent via `settled`), so a second `'error'` after the first cannot become an uncaught exception.

**Test analog:** `inviteBridge.test.ts` L156-179 (timeout case, `expect(await p).toEqual({ ok: false, reason: 'error' })`) and L60-80 server setup, where the fixture already uses `sock.on('error', () => undefined)` as the persistent-handler idiom. Cover IN-01 by capturing the client socket (via the existing `mockedConn`/deps seam) and emitting `'error'` twice, asserting no throw and a single resolved `error`; or, as a source pin, assert the file has no `once('error'`. I found no existing persistent-error-handler test for EventEmitter here; this is new.

### `inviteBridge`-adjacent comment fixes
- `bridge_helper.c` ~L2299: "one accept loop, see main" should name `gl_serve_forever` (def ~L3107, called ~L3395).
- `src/backend/knownFixReport.ts` ~L32-33 ("Plan 57-12 replaces the host..."): say sentinel kept only as fail-closed guard (L167-173), relay URL is deployed, `__tests__/knownFixReportUrl.test.ts` pins sentinel gone. `src/common/knownFixReport.ts` is NOT the file.
- `shimCoverage.ts` ~L204-209 and ~L270-276: lobbies (`SteamMatchMaking009`) are wire; `MatchMakingServers002`, `Networking005`, RemoteStorage remain stubs; P2P no longer out of scope (Phase 58).

## Shared Patterns

- **Prettier verify scope:** `.planning/**`, `.husky/pre-push`, `bridge_helper.c` are ignored or have no parser, so omit the check and say so. Run `npx prettier --check <exact paths>` for `lint.yml`, wiring tests, `helperIntegration.test.ts`, `inviteBridge.ts` and its test, `shimCoverage.ts`, `knownFixReport.ts`. Do not run `.`.
- **Process spawn in tests:** `createFakeHomeProfile()` (see `runHook`), never a hand-rolled env literal.
- **Jest runs:** `npx jest --runTestsByPath <files>`, never `--selectProjects X <paths>` (it swallows paths). Run D-01 proof in a clean worktree.
- **Records:** history moves under a dated heading or a `superseded_by` pointer, never deleted. Corrected todo paths use `completed/`.
- **After code edits:** `graphify update .`.

## No Analog Found

| File | Role | Reason |
|---|---|---|
| IN-01 persistent-`'error'` test | test | No existing test asserts an EventEmitter handler survives a second `'error'`; closest is the L156-179 timeout case and the fixture's `sock.on('error', ...)`. Use RESEARCH approach. |
| Comment-only edits (`bridge_helper.c`, `shimCoverage.ts`, `knownFixReport.ts`) | comment | Nothing to copy; text given above. |

## Metadata

**Analog search scope:** `.github/workflows`, `.husky`, `meta/__tests__`, `src/backend/storeManagers/steam/bridge`, `.planning/todos/pending`, `.planning/milestones/v0.9-phases`
**Pattern extraction date:** 2026-11-16
