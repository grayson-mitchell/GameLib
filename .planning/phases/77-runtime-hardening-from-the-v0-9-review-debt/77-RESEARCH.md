# Phase 77: Runtime hardening from the v0.9 review debt - Research

**Researched:** 2026-11-15
**Domain:** Cloudflare Worker request-body bounding (relay) + evidence closure of two already-fixed sidecar/overlay warnings
**Confidence:** HIGH (code read directly; Web Streams API behavior is standard)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Close DEBT-03 and DEBT-04 on evidence, no new live runs: re-run covering tests, cite fix commits, tick REQUIREMENTS.md. DEBT-03 tests: `src/backend/process/__tests__/runner.test.ts` (drain describe block), `src/backend/storeManagers/steam/bridge/drm/__tests__/boundedListing.test.ts`. DEBT-04 tests: overlay_input publisher-watch tests (live-publisher no-self-close, dead-publisher close) and `meta/__tests__/overlayInputSmoke.test.ts`; cite the 2026-11-04 live spot-check (`1ba023f7f`).
- D-02: Correct out-of-date records (`56-VERIFICATION.md` WR-02, `60-VERIFICATION.md` WR-01, `.planning/milestones/v0.9-MILESTONE-AUDIT.md` ~lines 50 and 163-164) with a resolved-by note and commit hash. Do not rewrite history.
- D-03: Before closing DEBT-03, grep spawn paths that bypass the runner (`spawnAsync.ts`, `utils/macArch.ts`, `sidecar/*FlowRegistration.ts`, `steam/bridge/helperRegistry.ts`). A ref'd timer/pipe/child at EOF is in scope; if none, record that the check ran.
- D-04: Capped stream read of `request.body` with a running byte count; past `KNOWN_FIX_REPORT_MAX_BYTES` (2 KB) cancel the reader and answer `413 { status: 'rejected', detail: 'too large' }`. Chunked/length-less bodies under the cap stay accepted. Do NOT answer 411.
- D-05: Keep the `Content-Length > max -> 413` fast path. Capped read applies ALWAYS (declared length can lie). Decode collected bytes as UTF-8, pass to existing `JSON.parse` / `parseKnownFixReport` unchanged.
- D-06: Never-throws contract: stream read errors map to existing 4xx/503 shape. Per-IP limit check still runs before the body read (D-15).
- D-07: DEBT-02 done only when merged, deployed and probed live: (1) unit tests in `relay/src/__tests__/handler.test.ts` (chunked over cap no CL -> 413; chunked under cap -> reaches validation/accept; CL under cap but longer real body -> 413; existing green); (2) human checkpoint: user runs `pnpm --dir relay deploy`, Claude does not deploy; (3) live probe: one chunked over-cap POST to `https://gamelib-fix-relay.gamelib.workers.dev/v1/reports` returns 413; counts against that IP's hourly limit; must not create a report row or PR.

### Claude's Discretion
- Helper factoring (inline vs small `readCappedBody` helper with its own test).
- Wording of resolved-by annotations.
- DEBT-03/04 closure as one plan or folded into the DEBT-02 plan's tail.

### Deferred Ideas (OUT OF SCOPE)
None. 16 keyword-matched todos reviewed and not folded.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEBT-02 | Relay bounds request body when Content-Length missing | Capped reader pattern below; test harness extension; deploy+probe checkpoint |
| DEBT-03 | Sidecar exit not held by lingering execFile handle | Already fixed (`4f41cfab7`, `0d5742ed3`); D-03 grep result below; test commands |
| DEBT-04 | Overlay close paths release game input | Already fixed (`2d3f1f5e8`), live-verified `1ba023f7f`; test commands |
</phase_requirements>

## Summary

One real code change: `relay/src/handler.ts` lines ~120-127 call `request.text()` after a `Content-Length` check that treats a missing header as 0 (`Number(... ?? 0)`). A chunked request therefore buffers the whole body before the post-hoc size check. [VERIFIED: handler.ts read] The fix is a bounded reader loop that stops and cancels at 2048 bytes. The rest (DEBT-03/04) is closure: re-run tests, annotate stale docs, tick requirements.

D-03 scout: of the four named paths, `spawnAsync.ts` is a thin caller of `ProcessRunner.run`; `utils/macArch.ts` calls `deps.runner.run` with `timeoutMs` and `stdin: ''`; `sidecar/wineToolsFlowRegistration.ts` and `steamAuthFlowRegistration.ts` only mention `child_process` in comments / call the injected `spawnAsync`; `helperRegistry.ts` comments say helper handles are unref'd (51-REVIEW WR-06). No raw `child_process` import appears in those five files' grep (matches are comments and runner calls). [VERIFIED: grep this session] The planner should still have the task re-run the grep as a recorded step (`grep -rn "from 'child_process'\|node:child_process\|execFile(\|spawn(" src/backend --include=*.ts` excluding `__tests__`) and note results; `src/backend/process/runner.ts` is the sole owner of unref'd spawns.

**Primary recommendation:** Add `readCappedBody(request, max)` (exported from a small relay module or inline in handler.ts) returning `{ ok: true, text } | { ok: false }`; keep the CL fast path; add a log line on the capped-reject branch so the live probe can be proven via `wrangler tail`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary | Rationale |
|------------|-------------|-----------|-----------|
| Request body size bound | API / Backend (Cloudflare Worker) | — | Worker edge owns request intake |
| Sidecar exit drain | Local sidecar (Node) | process runner | Runner unrefs child/pipes/timer |
| Overlay input release | Native helper + `overlay_input` (macOS) | — | Publisher pid watch lives in overlay_input |

## Standard Stack

No new packages. Use Web Streams (`ReadableStream` reader), `TextDecoder`, existing jest project in `relay/` (root `jest.config.js` projects list includes `<rootDir>/relay`). `wrangler` 4.156.0 already pinned. [VERIFIED: relay/package.json]

## Package Legitimacy Audit

No external packages installed in this phase. slopcheck not applicable.

## Architecture Patterns

### Data flow (handler order, unchanged)
```
POST -> method/path -> salt -> per-IP limit (counts) -> content-type
     -> CL > max ? 413 : continue
     -> readCappedBody(request, 2048): stream chunks, running total
            total > 2048 -> reader.cancel() -> 413 'too large'
            stream error -> 503 unavailable (outer catch) or 400
     -> UTF-8 decode -> JSON.parse (400) -> parseKnownFixReport (422) -> D1/GitHub
```

### Pattern: capped read
```typescript
// Source: WHATWG Streams standard (ReadableStreamDefaultReader); Workers support request.body.getReader()
async function readCappedBody(
  request: Request,
  max: number
): Promise<{ ok: true; text: string } | { ok: false }> {
  if (request.body === null) return { ok: true, text: '' }
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel().catch(() => {})
      return { ok: false }
    }
    chunks.push(value)
  }
  const buf = new Uint8Array(total)
  let off = 0
  for (const c of chunks) { buf.set(c, off); off += c.byteLength }
  return { ok: true, text: new TextDecoder().decode(buf) }
}
```
Handler usage: `const body = await readCappedBody(request, KNOWN_FIX_REPORT_MAX_BYTES); if (!body.ok) return respond(413, { status: 'rejected', detail: 'too large' })`. Replaces `request.text()` and the post-hoc encode-length check. A read error throws into `handleReport`'s catch -> 503 (D-06 satisfied; no extra try needed, though a local try that maps to 400 is also acceptable).

### Anti-Patterns
- `request.text()` / `arrayBuffer()` / `json()` before bounding: buffers everything.
- Trusting `Content-Length` alone: it can lie (D-05).
- Answering 411: explicitly rejected by D-04.
- Moving the body read above the IP-limit check: breaks D-15.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Chunk decode | manual UTF-8 splitting | concatenate bytes then one `TextDecoder().decode` (multibyte chars can straddle chunks) |
| Stream to string with limit | `TransformStream` size-limiter pipeline | plain reader loop (simpler, testable) |

## Common Pitfalls

1. **Per-chunk decoding.** Decoding each chunk separately corrupts multibyte characters split across chunks. Concatenate first.
2. **Cap comparison.** Existing test uses a ~3000-byte body for 413; exactly-2048-byte bodies must still pass (`> max`, not `>=`). Add a boundary test.
3. **Declared `Content-Length` under cap but longer real body.** In Node/undici `Request` the CL header you set is just a header; the body stream is what it is, so the capped read catches it. In real Workers the platform may itself enforce CL; the unit test is still valid for the handler. [ASSUMED: platform behavior on CL mismatch]
4. **Null body.** `request.body` is null for empty POST: treat as `''` -> JSON 400 (same as today).
5. **Test harness builds string bodies only** (`body: o.body ?? JSON.stringify(valid())`, `handler.test.ts:96-107`). Chunked tests need a `ReadableStream` body: `new Request(url, { method:'POST', body: stream, duplex: 'half' })` (Node 22 requires `duplex: 'half'`). Extend `request()` with an optional `stream?: ReadableStream<Uint8Array>` option, and use a stream that yields several chunks. With a stream body, Node sets no Content-Length, which is the exact DEBT-02 case. Check TS typing: `duplex` may need a cast for the relay tsconfig. [ASSUMED: tsconfig lib typings]
6. **Hanging stream test.** A test stream that never closes after the cap proves `cancel()` is called: give the `ReadableStream` a `cancel` callback that flips a flag and assert it.
7. **Live probe cannot distinguish old from new code by status.** The old code also returns 413 for an over-cap body (after buffering). A bare "probe returns 413" proves the route is healthy, not that the fix deployed. Make it prove the fix: log `relay: body over cap -> 413` in the capped branch and confirm in `pnpm --dir relay exec wrangler tail` during the probe, or have the human checkpoint compare `wrangler deployments list` before and after plus the tail line. Recommend the planner include this (it does not change the locked response shape).
8. **Probe must be chunked.** `curl` with `--data-binary @file` sends Content-Length and hits the fast path. Force chunked: `curl -X POST -H 'Content-Type: application/json' -H 'Transfer-Encoding: chunked' --data-binary @/path/over2kb.json https://gamelib-fix-relay.gamelib.workers.dev/v1/reports -i` (or `-T -` from stdin). Use a body over 2048 bytes that is not valid JSON-needed (it never reaches parse). Counts 1 against the IP hourly limit. [ASSUMED: Cloudflare edge forwards chunked as a streamed body]
9. **Deploy is a human checkpoint** (needs Cloudflare creds): `checkpoint:human-action` task, then a `checkpoint:human-verify` for the probe. Claude must not run `wrangler deploy`.
10. **Doc annotation tasks touch `.planning/` which is prettier-ignored.** Per `gamelib-conventions`, run `npx prettier --check --file-info` first; for handler.ts/test paths run scoped `npx prettier --check relay/src/handler.ts relay/src/__tests__/handler.test.ts` (confirm they are not ignored); omit the check for docs-only tasks and say so.
11. **Never use `gsd-sdk commit`** (it sweeps dirty `.planning`; worktree has many dirty files): `git add <file>` + `git commit`. Relay commit style: `fix(77): DEBT-02 ...`. [CITED: MEMORY gsd-sdk-commit-sweeps-dirty-planning]

## Code Examples

Test additions (shape):
```typescript
const enc = new TextEncoder()
const streamOf = (parts: string[], onCancel?: () => void) =>
  new ReadableStream<Uint8Array>({
    start(c) { parts.forEach((p) => c.enqueue(enc.encode(p))); c.close() },
    cancel() { onCancel?.() }
  })
// chunked over cap, no Content-Length -> 413
// chunked under cap (valid JSON split into 3 chunks) -> not 413/400/415 (reaches 200 'accepted' path as the existing valid test does)
// Content-Length: '10' header + 3000-byte stream -> 413
// exactly 2048 bytes -> not 413
// 413 over-cap leaves zero fetch calls and no D1 report row (assert h.calls empty / readReport null)
```

## Runtime State Inventory

Not a rename/refactor phase. Deployed Worker (`gamelib-fix-relay`) is runtime state: code merged to main is not live until the human runs `wrangler deploy`. No stored data, OS registrations, secrets or build artifacts change.

## Environment Availability

| Dependency | Required By | Available | Notes |
|------------|------------|-----------|-------|
| Node | jest | yes (v22.23.4) | relay engines `>=22` |
| wrangler 4.156.0 | deploy/tail | via relay devDependency (run `pnpm --dir relay install` if absent) | human-run |
| Cloudflare credentials | deploy | user only | checkpoint |
| curl | probe | assumed present on macOS | — |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | jest (root `jest.config.js`, project `<rootDir>/relay`) |
| Config | `relay/jest.config.js` |
| Quick run | `pnpm exec jest --selectProjects <relay project name> relay/src/__tests__/handler.test.ts` (or `cd relay`-scoped jest; confirm project name in `relay/jest.config.js`) |
| Full suite | `pnpm test:ci` |

### Phase Requirements -> Test Map
| Req | Behavior | Type | Command | Exists |
|-----|----------|------|---------|--------|
| DEBT-02 | chunked over-cap no CL -> 413; under cap accepted; CL lie -> 413; boundary 2048 ok; cancel called | unit | `pnpm exec jest relay/src/__tests__/handler.test.ts` | file yes, new cases Wave 0 |
| DEBT-02 | deployed Worker returns 413 for chunked over-cap | manual live probe | curl above + `wrangler tail` | human checkpoint |
| DEBT-03 | runner drain: no handle held after EOF | unit | `pnpm exec jest src/backend/process/__tests__/runner.test.ts src/backend/storeManagers/steam/bridge/drm/__tests__/boundedListing.test.ts` | yes |
| DEBT-03 | spawn-bypass grep recorded | grep | see D-03 command above | n/a |
| DEBT-04 | publisher watch: live no self-close, dead closes; smoke | unit/smoke | `pnpm exec jest meta/__tests__/overlayInputSmoke.test.ts meta/__tests__/overlaySignal.test.ts meta/__tests__/overlayInputProbeSmoke.test.ts src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayLaunch.test.ts` | yes (the publisher-watch cases may live in the smoke/Rust tests; planner should grep `publisher`/`ESRCH` in `meta/__tests__/overlayInput*` and any `overlay_input` crate tests to name them precisely) |

Sampling: per commit the relay handler test; phase gate `pnpm test:ci`. DEBT-04 smoke tests may need macOS and the built shim; if a test skips on this host, record the skip honestly rather than claim a pass.

### Wave 0 Gaps
- [ ] New chunked-body cases + `stream` option in the `request()` helper in `relay/src/__tests__/handler.test.ts`
- [ ] If a separate `readCappedBody` helper is chosen, its own test file

## Security Domain

| ASVS | Applies | Control |
|------|---------|---------|
| V5 Input validation | yes | bounded read before parse; existing `parseKnownFixReport` |
| V11 Business logic / resource limits | yes | per-IP limit before body read; 2 KB cap |
| V2/V3/V4/V6 | no | unchanged |

Threats: unbounded-body memory/CPU DoS (Tampering/DoS) -> capped reader + cancel; spoofed Content-Length -> always cap the stream; probe leaking data -> over-cap body fails before validation so no D1 row/PR.

## State of the Art / Assumptions

| # | Claim | Risk if wrong |
|---|-------|---------------|
| A1 | Workers/undici don't reject CL-mismatched requests before the handler (test only exercises handler) | Test still valid; live behavior may differ harmlessly |
| A2 | `duplex: 'half'` typing works in relay tsconfig | Needs a cast |
| A3 | Cloudflare forwards `Transfer-Encoding: chunked` as a no-CL stream | Probe might hit CL fast path; use `wrangler tail` log to tell which branch fired |

## Open Questions (RESOLVED)

1. How to prove the fix (not just a 413) live: recommend the tail log line (pitfall 7). Planner decides; it adds one `console.log` and does not alter the response.
   RESOLVED: 77-01 adds the fixed log line `relay: body over cap -> 413`; 77-03 Task 2 checks it in `wrangler tail`.
2. Exact name of DEBT-04 publisher-watch tests: grep during planning (not found by filename search; likely in Rust crate tests or `meta/__tests__/overlayInput*`).
   RESOLVED: 77-02 Task 1 names the `WR-01:` cases in `meta/__tests__/overlayInputSmoke.test.ts` (lines 403, 421; `itWindowServer`, skips recorded as skips).
3. 56-VERIFICATION lines 25-26, 75 and 60-VERIFICATION lines 51, 64 and audit lines ~50, ~163-164 are the annotation targets (from CONTEXT); re-confirm line numbers at edit time.
   RESOLVED: 77-02 Task 2 annotates the WR-02/WR-01 targets; 77-03 Task 3 annotates the audit's WR-09 lines after the live probe.

## Sources
- Direct reads: `relay/src/handler.ts`, `relay/src/__tests__/handler.test.ts`, `relay/package.json`, `jest.config.js`, `src/backend/utils/macArch.ts`, spawn-path greps, CLAUDE.md, 77-CONTEXT.md (HIGH)
- WHATWG Streams standard / Cloudflare Workers Request.body (training knowledge, MEDIUM)

**Valid until:** 2026-12-15
