# Phase 77: Runtime hardening from the v0.9 review debt - Pattern Map

**Mapped:** 2026-11-15
**Files analyzed:** 8 (2 code, 6 docs/records)
**Analogs found:** 2 / 2 code files (docs have in-file annotation precedent only)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `relay/src/handler.ts` (modify, lines 120-127) | handler/edge | request-response (streaming read) | itself (current `handle()` body-gate section) | exact (in-place) |
| `relay/src/__tests__/handler.test.ts` (modify: `request()` helper + `edge` describe) | test | request-response | its own `edge` describe + `harness()` (lines 36-116, 187-203) | exact |
| `relay/src/readCappedBody.ts` + test (optional, Claude's discretion) | utility | streaming | none; use RESEARCH.md capped-read snippet | no analog |
| `.planning/REQUIREMENTS.md` lines ~57-59, 95-97 | doc | n/a | existing ticked rows in same file | n/a |
| `.planning/milestones/v0.9-phases/56-*/56-VERIFICATION.md` (advisory WR-02, lines ~25-26, 75) | doc | n/a | its `advisory:` YAML list | n/a |
| `.planning/milestones/v0.9-phases/60-*/60-VERIFICATION.md` (WR-01, lines ~51, 64) | doc | n/a | same | n/a |
| `.planning/milestones/v0.9-MILESTONE-AUDIT.md` (~50, ~163-164) | doc | n/a | same | n/a |

## Pattern Assignments

### `relay/src/handler.ts` (handler, request-response)

**Analog:** itself. Edit the region at lines 116-127; keep gate order.

**Never-throws contract + label** (lines 54-67), which is what D-06 relies on. A stream read error thrown inside `handle()` becomes 503:
```typescript
export async function handleReport(request: Request, deps: RelayDeps): Promise<Response> {
  let label = 'relay: ?'
  try {
    return await handle(request, deps, (l) => (label = l))
  } catch (err) {
    const name = err instanceof Error ? err.constructor.name : 'unknown'
    const message = err instanceof Error ? err.message : ''
    console.log(`${label} -> 503 unavailable (${name}: ${message})`)
    return respond(503, { status: 'unavailable' })
  }
}
```

**Response pattern** (lines 43-52): all outcomes go through `respond(status, body, headers?)`.

**Section to replace** (lines 116-127). Keep 116-123 (content-type check, CL fast path); replace 124-127:
```typescript
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > KNOWN_FIX_REPORT_MAX_BYTES) {
    return respond(413, { status: 'rejected', detail: 'too large' })
  }
  const text = await request.text()                                   // <- replace
  if (new TextEncoder().encode(text).length > KNOWN_FIX_REPORT_MAX_BYTES) {  // <- drop
    return respond(413, { status: 'rejected', detail: 'too large' })        // <- drop
  }
```
Target shape (from RESEARCH.md "capped read"; `> max`, not `>=`; concatenate bytes then one `TextDecoder().decode`):
```typescript
const body = await readCappedBody(request, KNOWN_FIX_REPORT_MAX_BYTES)
if (!body.ok) {
  console.log('relay: body over cap -> 413')   // lets `wrangler tail` prove the fix deployed (pitfall 7)
  return respond(413, { status: 'rejected', detail: 'too large' })
}
const text = body.text
```
Log-line style precedent (handler.ts:96): `console.log('relay: IP_HASH_SALT missing or too short -> 503 unavailable')`.

**Must stay above the body read:** `checkIpLimit` at lines 100-114 (D-15). Downstream `JSON.parse` -> 400 and `parseKnownFixReport` -> 422 (lines 128-137) are unchanged.

---

### `relay/src/__tests__/handler.test.ts` (test, request-response)

**Analog:** same file.

**Harness `request()` helper to extend** (lines 92-108). Add an optional `stream?: ReadableStream<Uint8Array>` and, when set, pass `body: o.stream` plus `duplex: 'half'` (likely needs a cast on the `RequestInit`):
```typescript
const request = (o: {
  method?: string; path?: string; contentType?: string
  body?: string; ip?: string; headers?: Record<string, string>
}) =>
  new Request(`https://relay.test${o.path ?? '/v1/reports'}`, {
    method: o.method ?? 'POST',
    headers: {
      'Content-Type': o.contentType ?? 'application/json',
      'CF-Connecting-IP': o.ip ?? '198.51.100.1',
      ...o.headers
    },
    body: o.method === 'GET' ? undefined : (o.body ?? JSON.stringify(valid()))
  })
```
`send` (line 114) takes `Parameters<typeof request>[0]`, so it picks up the new option automatically.

**Test style to copy** (existing `edge` describe, lines 187-203):
```typescript
it('rejects content type, size and bad JSON', async () => {
  const h = await harness()
  const big = JSON.stringify({ ...valid(), pad: 'x'.repeat(3000) })
  expect((await h.send({ body: big })).status).toBe(413)
  const bad = await h.send({ body: '{' })
  expect(bad.status).toBe(400)
  expect((await bad.json()).status).toBe('rejected')
})
```
Zero-outbound-call assertion style (line ~215): `expect(h.calls).toHaveLength(0)`.

**New cases to add in `edge`** (shapes in RESEARCH.md "Code Examples"):
- chunked over cap, no Content-Length -> 413, `h.calls` empty
- chunked under cap (valid JSON in 3 chunks) -> not 413/400/415 (same 2xx path as the existing valid-report test)
- `headers: { 'content-length': '10' }` + 3000-byte stream -> 413 (declared length lies)
- exactly 2048 bytes -> not 413 (boundary)
- stream `cancel()` callback flips a flag, asserted after the 413 (use a stream that never closes)
- multibyte char straddling a chunk boundary decodes correctly

---

### `relay/src/readCappedBody.ts` (optional; utility, streaming)

No in-repo analog. Copy the RESEARCH.md `readCappedBody(request, max): Promise<{ ok: true; text: string } | { ok: false }>` snippet. If extracted, mirror the relay convention of one module per concern (`limits.ts`, `steamTitle.ts`) with a sibling test in `relay/src/__tests__/`.

---

### DEBT-03 / DEBT-04 closure (evidence tasks, no code)

**DEBT-03 test targets (re-run):**
- `src/backend/process/__tests__/runner.test.ts`: `describe('C-02 WR-01 drain grace and caller capabilities')` at line 328
- `src/backend/storeManagers/steam/bridge/drm/__tests__/boundedListing.test.ts`: `describe('contract on the real runner')` at line 109 (the loop-drain arm)
- Command: `pnpm exec jest src/backend/process/__tests__/runner.test.ts src/backend/storeManagers/steam/bridge/drm/__tests__/boundedListing.test.ts`

**D-03 grep to record** (run, paste result into the plan SUMMARY):
`grep -rn "from 'child_process'\|node:child_process\|execFile(\|spawn(" src/backend --include=*.ts` excluding `__tests__`. Expect `src/backend/process/runner.ts` as sole owner.

**DEBT-04 test targets:** `meta/__tests__/overlayInputSmoke.test.ts` lines 403 and 421 (`WR-01: a live publisher pid never closes the overlay by itself`; `WR-01: a dead publisher pid closes once ...`). Both use `itWindowServer` (line 229: `windowServer ? it : it.skip`) and run only under `describeDarwin` with a window server. If they skip on the host, record the skip honestly; do not claim a pass. Fix commits: `4f41cfab7`, `0d5742ed3` (DEBT-03); `2d3f1f5e8` fix, `1ba023f7f` live spot-check (DEBT-04).

**Doc annotation pattern:** `56-VERIFICATION.md` keeps follow-ups in a YAML `advisory:` list of `- id: WR-NN` / `note: "..."` entries (lines ~21-28). Annotate by appending to the note, for example `RESOLVED by 4f41cfab7 + 0d5742ed3 (phase 77)`, rather than deleting the entry (D-02: do not rewrite history). Re-confirm line numbers at edit time.

## Shared Patterns

### Commit hygiene
**Apply to:** every task. Use `git add <file>` + `git commit`; never `gsd-sdk commit` (sweeps dirty `.planning`). Relay commits: `fix(77): DEBT-02 ...`.

### `<verify>` prettier rule (gamelib-conventions)
**Apply to:** code tasks. `npx prettier --file-info` first, then scoped `npx prettier --check relay/src/handler.ts relay/src/__tests__/handler.test.ts` (plus the helper paths, if created). Docs-only tasks under `.planning/` are prettier-ignored: say so and omit the check.

### Human checkpoints (D-07)
`checkpoint:human-action` for `pnpm --dir relay deploy`; `checkpoint:human-verify` for the chunked probe. The probe must use `Transfer-Encoding: chunked` to bypass the CL fast path (`curl -X POST -H 'Content-Type: application/json' -H 'Transfer-Encoding: chunked' --data-binary @over2kb.json <url> -i`), and the tail log line confirms the new branch fired.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `relay/src/readCappedBody.ts` (optional) | utility | streaming | No other stream-reading code in `relay/`; use the RESEARCH.md snippet |

## Metadata

**Analog search scope:** `relay/src`, `relay/src/__tests__`, `src/backend/process/__tests__`, `meta/__tests__`
**Files scanned:** 6 read or grepped in full or in part
**Pattern extraction date:** 2026-11-15
