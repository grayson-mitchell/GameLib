# Phase 39: Post-cutover CI honesty — Pattern Map

**Mapped:** 2026-09-02
**Files analyzed:** 1 new test file + 2 gate scripts (edited) + 2 planning docs (edited) + ~9 production files carrying the 12 seam-predicate sites
**Analogs found:** 4 / 4 (one genuinely new artifact, three edit-in-place workstreams whose "analog" is their own pre-edit state, verified fresh against disk)

**Read-only note:** all line numbers below were verified by opening the file in this session
(2026-09-02), not copied forward from `39-RESEARCH.md`. Every citation matches the research
document's numbers exactly **except one new finding**, called out explicitly in
`## Finding: a 13th seam-predicate site RESEARCH.md's own census missed` below.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| new sibling/extension of `meta/__tests__/isTauriRemoved.test.ts` (name TBD by planner, e.g. `meta/__tests__/loginWindowSeamPredicateRemoved.test.ts`) | test (static completeness gate) | batch (grep sweep + assertion) | `meta/__tests__/isTauriRemoved.test.ts` | exact — same shape, same repo, same author intent (WR-01 prescribes it as a sibling) |
| `meta/planningGates/34.4.1/seam-parity-sweep-gate.py` (edit: re-point `ELECTRON_STUB_PATH`) | config/utility (planning-doc-vs-code gate) | transform (static parse) | itself, pre-edit; D-35-14-02's `packagingConfig.test.ts` re-point | exact (same disposition shape as an already-executed precedent) |
| `meta/planningGates/34.5/preload-surface-gate.py` (edit: re-derive floor) + `IPC-PORT-INVENTORY.md` (edit: reconcile Totals) | config/utility (planning-doc-vs-code gate) | transform (static parse + doc reconciliation) | itself, pre-edit; D-35-14-02's `removeCopies.test.ts` re-derivation | exact (same disposition shape as an already-executed precedent) |
| `src/backend/humble/user.ts` (5 branch collapses: #1,2,3,6,7,8) | service (dual-build business logic) | request-response / event-driven (login watch) | itself, pre-edit (no external analog needed — this is a collapse-in-place, not a new-file build) | exact |
| `src/backend/storeManagers/legendary/user.ts` (1 branch collapse: #11) | service | request-response | `src/backend/humble/user.ts`'s disconnect() collapse (#8) — same shape, same `session.fromPartition` 5-step wipe pattern | exact (sibling dual-build file, same author, same predicate) |
| `src/backend/humble/adapter.ts` (1 branch collapse + 1 function deletion: #9) | service (network transport dispatcher) | request-response | itself, pre-edit | exact |
| `src/backend/humble/library.ts` (1 cosmetic collapse: #10) | service | request-response | itself, pre-edit | exact |
| `src/backend/sidecar/oauthLoginCapture.ts` (1 branch collapse: #12) | service (event-driven OAuth capture) | event-driven | itself, pre-edit; note `activeSeam` rebind idiom at line 205 becomes unnecessary post-collapse | exact |
| `src/backend/humble/loginWindowSeam.ts` (doc comment only, lines 17-20) | utility (module doc) | n/a | itself, pre-edit | exact |
| `src/backend/sidecar/oauthLoginFlowRegistration.ts` (doc comment only, line 27) | utility (module doc) | n/a | itself, pre-edit | exact |
| `src/backend/humble/__tests__/user.test.ts` (rewrite/delete 3 blocks: lines 1260, 1615, 1829) | test | event-driven (mocked login watch) | itself, pre-edit | exact |
| lint ratchet (`package.json`'s `"lint"` script or a CI-only invocation) | config | n/a | `package.json:44`'s existing bare `"lint": "eslint --cache ."` | role-match (extending an existing script line, no comparable ratchet precedent exists yet in this repo) |

**No analog-search was needed for the lint workstream's warning-count triage** (top files/rules
are all pre-existing test-mock and production files named exhaustively in `39-RESEARCH.md`'s M1
section with exact counts) — there is no new file to pattern-map there, only a fix-in-place across
~360 already-existing files, which is explicitly out of this document's value proposition per the
phase's own "what makes this phase unusual" framing.

---

## Pattern Assignments

### 1. The one genuinely new artifact: the zero-match seam-predicate test

**Analog:** `meta/__tests__/isTauriRemoved.test.ts` (84 lines total, read in full)

This file is small enough that the entire thing is the extraction — every part of its shape
should be replicated by the new seam-predicate gate.

**Imports pattern** (lines 31-34):
```typescript
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const SRC_ROOT = join(__dirname, '..', '..', 'src')
```
For the seam-predicate gate, `SRC_ROOT` should instead be scoped to the two directories WR-01
names: `src/backend/humble` and `src/backend/storeManagers` (not the whole `src/` tree this
existing gate uses) — two `join()` constants, or one root plus a `--include`-style directory
argument passed twice to `grep -rn`.

**How it enumerates files and applies its predicate** (lines 38-42, the zero-match assertion):
```typescript
const result = spawnSync(
  'grep',
  ['-rn', 'isTauri', SRC_ROOT, '--include=*.ts', '--include=*.tsx'],
  { encoding: 'utf8' }
)
```
For the seam-predicate family, this single-token grep must become a pattern (or several
`spawnSync` calls, one per predicate form) covering: `seam === null`, `seam !== null`, `!seam`,
plus the local-assignment form (`const seam = getLoginWindowSeam()` followed by a predicate use —
this existing gate's un-anchored-token lesson, documented in its own header comment lines 17-23,
applies directly: an anchored regex like `seam === null` would miss a predicate spread across two
lines the way `humble/user.ts`'s own `const seam = getLoginWindowSeam()` / `if (seam === null)`
pairs are written today). Recommend either a regex alternation (`grep -E`) or one `spawnSync` call
per form, unioned before the zero-match assertion — matching this project's standing "un-anchored,
not narrowly anchored" lesson from this same file's own header (lines 17-23).

**How it asserts zero matches** (lines 44-58):
```typescript
// grep's own "no matches found" contract is exit status 1 with empty stdout.
// Assert BOTH independently: status alone would also be satisfied by grep failing
// to run at all (e.g. binary not found, status 127 truncated on some shells), and
// empty stdout alone is satisfied by a mis-typed path that grep silently walks and
// finds nothing in for the WRONG reason. Only the conjunction proves the intended
// thing: grep ran, walked the real src/ tree, and found none. On failure, the
// message names every offending file:line so a future editor sees exactly what to
// fix, not just a count.
if (result.status !== 1 || result.stdout.trim() !== '') {
  throw new Error(
    `isTauri survives in src/ -- expected zero matches, got:\n${result.stdout}`
  )
}
expect(result.status).toBe(1)
expect(result.stdout.trim()).toBe('')
```
Replicate the `status !== 1 || stdout.trim() !== ''` conjunction exactly — this is the load-bearing
shape, not decorative. Copy the exact failure-message idiom (echo the offending grep stdout back
into the thrown error) so a red run tells the editor precisely which file:line still has a live
predicate.

**How it implements its vacuity control — the single most important excerpt** (lines 61-83):
```typescript
it('vacuity control: "isWritableStoreField" (a token that MUST survive) is still found under the same src/ root', () => {
  // Without this control, a broken SRC_ROOT path (typo, wrong join depth, CI
  // working-directory drift) would make grep walk an empty or nonexistent directory
  // and report "no matches" for EVERY token, including isTauri -- a permanently
  // green gate that has stopped measuring anything. This proves the grep invocation
  // reaches a populated tree, so the isTauri zero-match result above means "absent",
  // not "looked nowhere". `isWritableStoreField` is chosen because it lives in the
  // same file (`src/preload/tauriTransport.ts`) the deleted predicate used to.
  const result = spawnSync(
    'grep',
    [
      '-rn',
      'isWritableStoreField',
      SRC_ROOT,
      '--include=*.ts',
      '--include=*.tsx'
    ],
    { encoding: 'utf8' }
  )

  expect(result.status).toBe(0)
  expect(result.status).toBe(0)
  expect(result.stdout.trim().length).toBeGreaterThan(0)
})
```
For the new gate, the vacuity-control token must be something that **provably still exists** in
`src/backend/humble` or `src/backend/storeManagers` after the collapse — e.g. `getLoginWindowSeam`
itself (the accessor call survives even after every `=== null`/`!== null` predicate around it is
removed, per WR-01's own prescribed collapse to `getLoginWindowSeam()!` or a throwing wrapper — the
*call* stays, only the *predicate* goes), or `HUMBLE_LOGIN_PARTITION` (survives in the same two
directories). Do not reuse `isWritableStoreField` — it lives under `src/preload/`, outside this
gate's two scoped directories, and would prove nothing about whether grep reached the right root.

**This project's own standing rule, restated for the planner:** "A grep gate that matches nothing
because its pattern is wrong looks identical to one that matches nothing because the code is
clean. This project has recorded that failure four times" (per `39-VALIDATION.md`'s own framing).
The vacuity control above is the mechanism that closes that gap — it is not optional scaffolding.

---

### 2. The non-null-asserting accessor shape (WR-01's prescription)

**Definition read in full:** `src/backend/humble/loginWindowSeam.ts` (262 lines)

**Current accessor** (lines 202-214, verified):
```typescript
// Module-scoped holder. `null` in the Electron build (nothing ever calls setLoginWindowSeam there)
// and in the Tauri sidecar BEFORE registerHumbleLoginFlows() runs at startup.
let installed: LoginWindowSeam | null = null

/** Installs (or clears, via `null`) the active login-window seam implementation. */
export function setLoginWindowSeam(seam: LoginWindowSeam | null): void {
  installed = seam
}

/** Returns the active login-window seam implementation, or `null` if none is installed. */
export function getLoginWindowSeam(): LoginWindowSeam | null {
  return installed
}
```

**Stale doc comment that must move with the collapse** (lines 17-18, verified directly against
the live file — matches RESEARCH.md's citation):
```
 * it here via `setLoginWindowSeam()` at sidecar startup. The Electron build never calls
 * `setLoginWindowSeam()` at all, so `getLoginWindowSeam()` always returns `null` there and
```
This describes a build (Electron) that no longer exists in this repo — must be rewritten to
describe the single-shell (Tauri sidecar) reality per REQ-39-03's Task 5.

**No existing throwing-accessor idiom found anywhere in `src/backend`.** Searched exhaustively for
a `getX(): X { ...; throw new Error(...) }` non-null-guaranteed-singleton shape (module-scoped
`let x: T | null = null` + getter that throws instead of returning null) across all of
`src/backend` — none exists. Also searched for any existing `someAccessor()!` non-null-assertion
call-site idiom anywhere in `src/backend` (excluding tests) — zero hits. **Conclusion for the
planner: there is no established codebase idiom to follow here; WR-01's own two offered shapes
(`getLoginWindowSeam()!` at each call site, or a new throwing wrapper function) are both green-field
choices in this repo, not a deviation from an existing pattern.** Given the closest structural
sibling in this same file — `safeStorage`'s throw-on-use shape in `src/backend/platform/index.ts`
(see Section 3 below, quoted there for Gate 1) — a throwing wrapper (e.g.
`getLoginWindowSeamOrThrow()`) would be more consistent with that sibling idiom (a hard failure with
a descriptive message) than a bare `!` assertion, which produces a generic `Cannot read properties
of null` at the call site instead of a descriptive error. This is offered as an observation, not a
directive — the planner/executor makes the final call per RESEARCH.md's own "either shape" framing.

**A related idiom worth noting, made obsolete by the collapse:** `oauthLoginCapture.ts` currently
rebinds the narrowed local after its null check (line 205, quoted in Section 4 below) specifically
because nested closures don't retain TS's control-flow narrowing of an outer `const`. Once the
accessor itself returns a non-null type (either shape), this rebind becomes unnecessary everywhere
it appears (`user.ts`'s `watchForLogin()` has several nested functions — `settle`, `checkCookie` —
that reference the outer `seam` local; collapsing removes the need for any such rebind since the
type is non-null at the point of declaration).

---

### 3. The two planning-gate scripts

#### Gate 1 — `meta/planningGates/34.4.1/seam-parity-sweep-gate.py`

**Constant to re-point** (line 73, verified):
```python
ELECTRON_STUB_PATH = SRC_DIR / "backend" / "sidecar" / "electronStub.ts"
```
→ becomes `SRC_DIR / "backend" / "platform" / "index.ts"` per RESEARCH.md's disposition.

**Where it's consumed — the crash site** (lines 959-963, verified):
```python
def parse_electron_stub_safestorage() -> dict[str, str]:
    """Mechanically confirms electronStub.ts's safeStorage shape (hardcoded-false / throws),
    rather than assuming it — a future stub change that upgrades safeStorage to a real forward
    must flip this classification automatically, not require a hand-edit here."""
    text = ELECTRON_STUB_PATH.read_text(encoding="utf-8")
```
`ELECTRON_STUB_PATH.read_text(...)` is exactly where the `FileNotFoundError` fires today.

**Second consumption site — the file-tree walker deliberately excludes the stub from
enumeration** (lines 162-175, verified):
```python
def iter_source_files() -> list[Path]:
    """Every non-test .ts/.tsx file under src/, excluding electronStub.ts itself (per the plan's
    Axis B scoping — the stub is what Axis A/B compare AGAINST, never a site to enumerate)."""
    files: list[Path] = []
    for pattern in ("*.ts", "*.tsx"):
        for path in sorted(SRC_DIR.rglob(pattern)):
            if "__tests__" in path.parts:
                continue
            if path.name.endswith((".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx")):
                continue
            if path.resolve() == ELECTRON_STUB_PATH.resolve():
                continue
            files.append(path)
    return files
```
Both consumption sites key off the same module-level `ELECTRON_STUB_PATH` constant — a single
re-point at line 73 fixes both.

**How it reports pass/fail** (lines 152-154, verified):
```python
def fail(message: str) -> None:
    print(f"GATE FAILED: {message}", file=sys.stderr)
    sys.exit(1)
```

**Confirmed target shape at the new path** — `src/backend/platform/index.ts:609-621`, verified:
```typescript
export const safeStorage = {
  isEncryptionAvailable: (): boolean => false,
  encryptString: (_plainText: string): Buffer => {
    throw new Error(
      'safeStorage is not available in the sidecar — use getTokenStore() (see steam/tokenStore.ts)'
    )
  },
  decryptString: (_encrypted: Buffer): string => {
    throw new Error(
      'safeStorage is not available in the sidecar — use getTokenStore() (see steam/tokenStore.ts)'
    )
  }
}
```
This matches the "hardcoded throw" shape `parse_electron_stub_safestorage()`'s regex classifier
(lines 973-984) is built to detect — `isEncryptionAvailable` classifies as `"hardcoded false"`,
`encryptString`/`decryptString` classify as `"throws"`, exactly as RESEARCH.md predicted.

#### Gate 2 — `meta/planningGates/34.5/preload-surface-gate.py`

**Constant to re-derive** (line 39, verified):
```python
AUDITED_UNION_FLOOR = 217
```

**Check-ordering defect, independently confirmed by reading `run_all_checks` directly** (lines
251-258, verified):
```python
def run_all_checks(invoke: set, send: set, push: set, raw_text: str, inventory_text: str) -> None:
    bucket_names = parse_bucket_names(inventory_text)
    check_coverage(invoke, send, bucket_names)
    check_multiline_awareness(invoke, send)
    check_comment_blindness(raw_text, invoke, send)
    check_bucket_line_scoping(inventory_text)
    check_totals_reconciliation(inventory_text)
    check_provenance(inventory_text)
```
`check_multiline_awareness` (check 2, the 206-vs-217 failure) calls `fail()` → `sys.exit(1)` (line
132-133's `fail()` definition, same shape as Gate 1's) before `check_totals_reconciliation` (check
5) ever runs — this is the exact mechanism RESEARCH.md's masked-defect finding describes, confirmed
here by reading the function body directly rather than trusting the research's paraphrase.

**The floor check itself** (lines 159-166, verified):
```python
def check_multiline_awareness(invoke: set, send: set) -> None:
    union_size = len(invoke | send)
    if union_size < AUDITED_UNION_FLOOR:
        fail(
            f"extracted union has only {union_size} distinct channel(s), below the audited floor "
            f"of {AUDITED_UNION_FLOOR} — this is the exact signature of a regression to a "
            "single-line-only regex (measured at 206 on the audited tree, 11 short)"
        )
```

**The masked check** (lines 216-223, verified):
```python
def check_totals_reconciliation(inventory_text: str) -> None:
    bucket_names = parse_bucket_names(inventory_text)
    stated = parse_totals_unique(inventory_text)
    if stated != len(bucket_names):
        fail(
            f"'## Totals' states {stated} unique channels, but the bucket lines contain "
            f"{len(bucket_names)} distinct names — these must reconcile exactly"
        )
```
This is check 5 of 6 in the assertion registry (`ASSERTION_COUNT = 6`, line 248) — it never runs
today because check 2 exits first. The planner must fix both the floor (check 2) and the
`IPC-PORT-INVENTORY.md` Totals-vs-bucket-line mismatch (check 5) in the same edit, exactly as
RESEARCH.md's M2 section warns, or the very next gate run fails on check 5 with a fresh-looking red
that is actually this pre-existing, newly-unmasked defect.

**Two other checks, quoted for completeness since the planner will likely touch adjacent lines**
(lines 142-150 and 232-241, verified):
```python
def check_coverage(invoke: set, send: set, bucket_names: set) -> None:
    union = invoke | send
    survivors = sorted(union - bucket_names)
    if survivors:
        fail(
            f"{len(survivors)} preload channel(s) are exposed via makeHandlerInvoker/"
            f"makeListenerCaller but appear in NO bucket line of IPC-PORT-INVENTORY.md: "
            f"{', '.join(survivors)}"
        )
```
```python
PROVENANCE_MARKERS = ["34.5-PRELOAD-SURFACE-AUDIT.md", "F-34.5-G6-10"]


def check_provenance(inventory_text: str) -> None:
    missing = [m for m in PROVENANCE_MARKERS if m not in inventory_text]
    if missing:
        fail(
            f"IPC-PORT-INVENTORY.md is missing required provenance marker(s): {', '.join(missing)}"
            " -- the record of how the preload-surface gap was found must survive edits"
        )
```
`check_provenance` requires `IPC-PORT-INVENTORY.md` to keep naming the original audit file and its
`F-34.5-G6-10` marker — whatever edit deletes the 18 stale bucket-line names must NOT touch these
two provenance strings, or this check (currently passing) goes red as a self-inflicted regression.

#### The `D-35-14-02` precedent — the disposition-table shape to follow

Found at
`.planning/phases/35-electron-cutover-remove-the-electron-build/deferred-items.md:1164` onward.
The precedent's own table shape (gate name | pinned invariant | disposition), reproduced here as
the idiom to match:

| Gate | Pinned | Disposition |
|---|---|---|
| `packagingConfig.test.ts` — symlink plugin (F-34.9-01) | `electron.vite.config.ts` registers `preserveRunnerSymlinksPlugin` | **RE-POINTED** to `vite.config.ts` — plugin still live under Tauri (`pnpm exec vite build` printed `[preserve-runner-symlinks] restored 12 symlink(s)`) |
| `artifactTargets.test.ts` — D-11 anti-collateral | `release:{linux,mac,win}` scripts still exist | **INVERTED** — assertion direction flipped rather than deleted, per the test's own comment: "Plan 35-14 owns these. If they vanish, must be a plan doing it deliberately." |
| `removeCopies.test.ts` | "all FOUR seam files" census | **RE-DERIVED** to "THREE" — both the list AND the stated count changed together |
| `x64NonGoalSurvivor.test.ts` | `electron-builder.yml` x64/win32 exclusion | **RETIRED** — artifact (`electron-builder.yml`) no longer exists |

This gives the planner four labeled dispositions (RE-POINT, RE-DERIVE, INVERT, RETIRE) with an
explicit rule for when each applies, stated in RESEARCH.md's own summary: RE-POINT when the pinned
artifact moved but the invariant still holds elsewhere (Gate 1's shape); RE-DERIVE when a census's
stated number and its list must change together, never the number alone (Gate 2's shape); RETIRE
only when the artifact itself is gone entirely (neither of this phase's two gates qualifies).

---

### 4. The seam-collapse edit sites — all 12, current on-disk shape verified 2026-09-02

**Verification method:** every site below was located via `grep -n "getLoginWindowSeam\|seam ===\|seam !==\|!seam"` against the live file, then read with full surrounding context. Line numbers
match `39-RESEARCH.md`'s table **exactly** for all 12 named sites — no drift found since the
research session (both were run the same day). **One additional site was found that is not in
RESEARCH.md's table** — see the callout below the per-file sections.

#### `src/backend/humble/user.ts` — 5 collapses (sites #1, #2, #3, #6, #7, #8 — 6 sites, one file)

**Site #1 — `getLiveCsrfToken()`, lines 177-179 (verified):**
```typescript
static async getLiveCsrfToken(): Promise<string | undefined> {
  const seam = getLoginWindowSeam()
  if (seam !== null) {
```
Collapses to using the non-null accessor directly; the `try { session.fromPartition(...) }` fallback body below (lines 193-211) becomes the dead branch to delete.

**Site #2 — `watchForLogin()` declaration, lines 274-278 (verified):**
```typescript
const seam = getLoginWindowSeam()

let ses: ReturnType<typeof session.fromPartition> | null = null
if (seam === null) {
  ses = session.fromPartition(HUMBLE_LOGIN_PARTITION)
```
The doc comment immediately above this (lines 266-273) is dual-build framing that must also be
rewritten or deleted — it explicitly describes "under Electron... always returns null."

**Site #3 — `checkCookie()`, lines 440-456 (verified, matches research's "445" citation for the
predicate itself):**
```typescript
async function checkCookie(forceValidation: boolean) {
  if (settled || validationInFlight) return
  try {
    let cookieValue: string | undefined

    if (seam === null) {
      // ── Electron path (unchanged) ─────────────────────────────────
      const cookies = await ses!.cookies.get({
```
The `else` arm at line 454 (`// ── Tauri seam path ──`) is the surviving branch.

**Site #6 — `finishLogin()`'s csrf capture, lines 740-762 (verified):**
```typescript
const seam = getLoginWindowSeam()
if (seam !== null && seamLabel !== null) {
  // Tauri path: read csrf_cookie from the SAME live login window whose
  // _simpleauth_sess candidate was just accepted, via the seam rather
  // than session.fromPartition (which has no shape under Tauri).
```
The `else` arm at line 752 (`session.fromPartition(HUMBLE_LOGIN_PARTITION)` csrf read) is dead.

**Site #7 — health-check backfill, lines 873-891+ (verified):**
```typescript
const seam = getLoginWindowSeam()
if (seam === null) {
  // ── Electron path (unchanged) ─────────────────────────────────────
  try {
    const csrfSes = session.fromPartition(HUMBLE_LOGIN_PARTITION)
```
The `else` arm at line 891 (`// ── Tauri seam path ──`) is the surviving branch.

**Site #8 — `disconnect()`, lines 1034-1046 (verified):**
```typescript
const seam = getLoginWindowSeam()
let wipeSteps: Array<[string, () => Promise<unknown>]>
if (seam === null) {
  const ses = session.fromPartition(HUMBLE_LOGIN_PARTITION)
  wipeSteps = [
    ['clearStorageData', async () => ses.clearStorageData()],
    ['clearCache', async () => ses.clearCache()],
    ['clearAuthCache', async () => ses.clearAuthCache()],
    ['clearHostResolverCache', async () => ses.clearHostResolverCache()],
    ['clearData', async () => ses.clearData()]
  ]
} else {
```
The `if` arm (5-step Electron wipe) is dead; the `else` arm survives.

**Site #4 — ternary, line 590 (verified):**
```typescript
seam !== null ? seamLabel : null,
```
Collapses to just `seamLabel` (the `: null` alternate is dead — `seam` is never null post-collapse).

**Site #5 — always-true window-open guard, lines 640-674 (verified; research cited 640-673, the
actual closing brace including the `.catch()` handler is at line 674):**
```typescript
if (seam !== null) {
  // Tauri path: open the Rust-owned login window with the standard
  // Chrome UA (tauri-login-webview-cookies.md § "Why the UA is
  // mandatory"). The window must stay open for the whole poll —
  // ...
  seam
    .open(HUMBLE_LOGIN_URL, {
```
No Electron sibling exists for this block at all — collapses by removing the `if (seam !== null) {`
wrapper and its closing brace, keeping the body unconditional.

#### `src/backend/storeManagers/legendary/user.ts` — 1 collapse (site #11)

**Lines 221-224 (verified — research's own citation "167-177" is the drifted number it flagged;
the CURRENT true location is 221 onward, confirmed):**
```typescript
const seam = getLoginWindowSeam()

if (seam === null) {
  const ses = session.fromPartition('persist:epicstore')
```
Same shape as `user.ts`'s site #8 (`disconnect()`, 5-step Electron wipe in the `if` arm, Tauri seam
wipe in the `else` arm) — use it as the direct sibling template for this collapse.

#### `src/backend/humble/adapter.ts` — 1 collapse + 1 function deletion (site #9)

**`humblePostRequest()`, lines 270-279 (verified):**
```typescript
function humblePostRequest(
  path: string,
  body: string,
  csrfToken?: string
): Promise<HumbleRawResponse> {
  const seam = getLoginWindowSeam()
  return seam
    ? humblePostRequestViaSeam(seam, path, body, csrfToken)
    : humblePostRequestViaElectronNet(path, body, csrfToken)
}
```
Collapses to always calling `humblePostRequestViaSeam(seam, ...)` (with `seam` now guaranteed
non-null). The orphaned callee, **verified to span lines 358-431 (74 lines, matching RESEARCH.md's
estimate exactly)**, starts:
```typescript
function humblePostRequestViaElectronNet(
  path: string,
  body: string,
  csrfToken?: string
): Promise<HumbleRawResponse> {
  return new Promise((resolve, reject) => {
    const request = net.request({
```
and ends at the closing `}` on line 431 — delete the whole function once its only caller is gone.

#### `src/backend/humble/library.ts` — 1 cosmetic collapse (site #10)

**Lines 1210-1213 (verified):**
```typescript
const revealTransportLabel =
  getLoginWindowSeam() !== null
    ? 'login-window seam transport'
    : 'electron-net transport'
```
Collapses to the fixed string `'login-window seam transport'` — this label is logged only, never
branched on; the `'electron-net transport'` string becomes dead but the line itself carries zero
behavioral risk.

#### `src/backend/sidecar/oauthLoginCapture.ts` — 1 collapse (site #12)

**Lines 190-205 (verified):**
```typescript
export function captureOAuthLogin(
  runner: OAuthRunner,
  loginUrl: string,
  options?: { deadlineMs?: number; pollMs?: number }
): Promise<OAuthCaptureOutcome> {
  const seam = getLoginWindowSeam()
  if (seam === null) {
    // The Electron build's answer — cheap and total, nothing opened.
    return Promise.resolve({ status: 'unsupported' })
  }

  // Re-bound to a non-null local: TS's control-flow narrowing of `seam` above does not persist
  // into the nested `settle`/`poll` function declarations below, since it cannot prove the outer
  // closure variable is never reassigned to null by the time they run (it is `const`, so it
  // actually can't be, but this rebinding makes that explicit rather than fighting the checker).
  const activeSeam = seam
```
Collapses by removing the early-return `if` block entirely; the `const activeSeam = seam` rebind
(and its explanatory comment) also becomes unnecessary once `getLoginWindowSeam()` returns a
non-null type directly — delete both together, not just the `if`. Per RESEARCH.md's open question
#4, phrase this collapse differently from the `user.ts` sites in whatever record documents it: this
file's own doc comment already framed the Electron case as hypothetical/defensive, not a genuine
preserved-behavior branch.

#### Excluded — found, considered, deliberately kept

**`src/backend/sidecar/humbleLoginFlowRegistration.ts:457-460` (verified):**
```typescript
const seam = getLoginWindowSeam()
if (!seam) {
  smokeLog(
    'no seam installed — aborting (this is a FAIL, not a skip)',
```
This matches the same grep predicate family (`!seam`) but is **excluded from every collapse task**
per this phase's binding constraint — it is a defensive smoke-test guard inside a block gated by
`process.env.GAMELIB_LOGIN_SEAM_SMOKE === '1'`, not a dual-build discriminator. Its own surrounding
comment (line ~417, part of the same function) frames it as a permanent diagnostic reproduction
harness. State this explicitly in whatever disposition record this phase produces, so a future
re-audit does not mistake its survival for an incomplete sweep.

---

## Finding: a 13th seam-predicate site RESEARCH.md's own census missed

**`src/backend/humble/user.ts:429` (verified, inside `watchForLogin()`'s nested `settle()`
function, closure-scoped over the same `seam`/`seamLabel` locals declared at lines 274/296):**
```typescript
function settle(result: LoginResult) {
  if (settled) return
  settled = true
  clearInterval(pollInterval)
  clearTimeout(watchDeadline)
  HumbleUser.activeWatch = null
  resolve(result)
  // T-34.4.1-18: close the Rust-owned login window exactly once, on
  // every exit path (done, waiting, error, stop, deadline). Floated —
  // a close() rejection must never throw out of settle() and strand
  // this promise (WR-06 float discipline).
  if (seam !== null && seamLabel !== null) {
    const labelToClose = seamLabel
    seam.close(labelToClose).catch((err) => {
```
This is a ninth predicate use of the SAME `seam` local declared once at `user.ts:274` (site #2's
declaration) — it is not counted separately in RESEARCH.md's 12-site table, whose site #5
(`640-673`, the window-open guard) is the only "always-true guard, no Electron sibling" shape it
names. Line 429 is structurally identical to site #5: an always-true guard once `seam` is
guaranteed non-null, with no Electron-path sibling (Electron closes no window here at all). **This
does not change the collapse task count** — because it references the SAME `seam`/`seamLabel`
locals as site #2's declaration (`user.ts:274`), collapsing site #2's declaration to the
non-null-asserting accessor automatically resolves this guard too, exactly the same way it
automatically resolves sites #3, #4, and #5's uses of the same closure-scoped local. **It does
change the verification surface for the new zero-match test (Section 1 above) and for whoever
writes the disposition record**: a predicate sweep of `src/backend/humble` that stops at
RESEARCH.md's 12 named sites would still find this 13th occurrence and must not be surprised by
it — the new gate's own zero-match assertion will naturally catch it (or fail loudly if the
collapse task misses it), which is exactly the kind of gap this project's standing "a census taken
over the wrong namespace misses real instances" lesson describes (RESEARCH.md's own words, applied
recursively to its own count).

---

## Shared Patterns

### The `fail()` / `sys.exit(1)` idiom (both gate scripts)
**Source:** `meta/planningGates/34.4.1/seam-parity-sweep-gate.py:152-154` and
`meta/planningGates/34.5/preload-surface-gate.py:132-133` (identical shape in both):
```python
def fail(message: str) -> None:
    print(f"GATE FAILED: {message}", file=sys.stderr)
    sys.exit(1)
```
**Apply to:** any new check added to either gate script (there is no need to add one, but if the
planner's re-derivation touches adjacent logic, this is the established error-reporting idiom to
match — plain stderr message prefixed `GATE FAILED:`, hard exit 1, never a Python exception).

### The disposition-table shape (D-35-14-02)
**Source:** `.planning/phases/35-electron-cutover-remove-the-electron-build/deferred-items.md:1164`
onward.
**Apply to:** whatever record this phase produces for Gate 1 and Gate 2's dispositions — reuse the
`| Gate | Pinned | Disposition |` column shape and the four-label vocabulary (RE-POINT, RE-DERIVE,
INVERT, RETIRE) rather than inventing new disposition language.

### The zero-match static-completeness-gate shape (`isTauriRemoved.test.ts`)
**Source:** `meta/__tests__/isTauriRemoved.test.ts` (full file, 84 lines).
**Apply to:** the one new test file this phase requires (Section 1 above). This is the only
cross-cutting pattern that produces a wholly new artifact in this phase; every other shared pattern
above is a repair-in-place idiom the planner reuses via edit, not via copy into a new file.

---

## No Analog Found

None. Every file in this phase's scope is either (a) a new test file with an exact, explicitly-named
analog (`isTauriRemoved.test.ts`), or (b) an existing file being edited in place, where the
"analog" is necessarily the file's own pre-edit state plus the D-35-14-02 precedent for how the
edit should be framed. There is no file in this phase's three-workstream scope that requires
inventing a pattern from scratch.

---

## Metadata

**Analog search scope:** `meta/__tests__/`, `meta/planningGates/34.4.1/`, `meta/planningGates/34.5/`,
`.planning/phases/35-electron-cutover-remove-the-electron-build/deferred-items.md`,
`src/backend/humble/`, `src/backend/storeManagers/legendary/`, `src/backend/sidecar/`,
`src/backend/platform/index.ts`.
**Files scanned:** `isTauriRemoved.test.ts` (full), `loginWindowSeam.ts` (full, 262 lines),
`seam-parity-sweep-gate.py` (targeted sections: 60-90, 148-176, 955-985), `preload-surface-gate.py`
(targeted sections: 30-80, 142-260), `deferred-items.md` (D-35-14-02 section), `platform/index.ts`
(lines 605-621), `humble/user.ts` (lines 170-300, 395-470, 575-685, 684-785, 858-902, 1025-1075),
`storeManagers/legendary/user.ts` (lines 210-245), `humble/library.ts` (lines 1195-1220),
`humble/adapter.ts` (lines 265-295, 350-432), `sidecar/oauthLoginCapture.ts` (lines 185-210),
`sidecar/humbleLoginFlowRegistration.ts` (grep + targeted context), `sidecar/oauthLoginFlowRegistration.ts`
(grep only, doc-comment line located), `humble/__tests__/user.test.ts` (grep only, three line
numbers confirmed present).
**Pattern extraction date:** 2026-09-02.
