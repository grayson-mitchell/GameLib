---
phase: quick-261026-kyv
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - meta/__tests__/gen_vtables.test.ts
  - .planning/todos/pending/2026-10-25-bridge-shim-socket-shared-across-threads-without-lock.md
autonomous: true
requirements: [WR-04]

must_haves:
  truths:
    - "Removing AcquireSRWLockExclusive(&g_bridge_lock) from bridge_transact in meta/gen_vtables.ts makes gen_vtables.test.ts fail"
    - "Adding a new caller of bridge_transact_locked / bridge_transact_once / bridge_ensure_connected outside the locked path makes gen_vtables.test.ts fail"
    - "Touching g_bridge_sock or g_next_request_id outside the transport functions without holding g_bridge_lock makes gen_vtables.test.ts fail"
    - "The WR-04 todo records that the code fix landed in 082ff80db and is pinned by a test, and its only remaining work is a live multi-threaded Wine gate"
  artifacts:
    - path: "meta/__tests__/gen_vtables.test.ts"
      provides: "WR-04 bridge serialization regression describe block"
      contains: "static SRWLOCK g_bridge_lock = SRWLOCK_INIT;"
    - path: ".planning/todos/pending/2026-10-25-bridge-shim-socket-shared-across-threads-without-lock.md"
      provides: "Narrowed live-gate todo"
      contains: "082ff80db"
  key_links:
    - from: "meta/__tests__/gen_vtables.test.ts"
      to: "generateShimC(loadAllManifests())"
      via: "assertions on the generated shim C text"
      pattern: "generateShimC\\(loadAllManifests\\(\\)\\)"
---

<objective>
Pin the already-landed WR-04 fix (082ff80db: one static `SRWLOCK g_bridge_lock` serializing every bridge round trip) with a regression test so that removing the lock, or adding an unlocked path to the shared socket, fails the suite. Then narrow the WR-04 todo to the one thing a test cannot prove: a live multi-threaded Wine run.

Purpose: today the whole suite passes with the Acquire/Release deleted from `bridge_transact`. The fix is guarded only by a code comment.
Output: a new describe block in meta/__tests__/gen_vtables.test.ts; a rewritten (still pending) todo.

Do NOT regenerate or hand-edit anything under native/steam-bridge/generated/. No generator change is expected or allowed (meta/gen_vtables.ts must end the plan byte-identical to HEAD).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
Load Skill("gamelib-conventions") — the todo-frontmatter rule and the `<verify>` prettier rule both apply.
@.planning/todos/pending/2026-10-25-bridge-shim-socket-shared-across-threads-without-lock.md

<interfaces>
Generated C shape (from meta/gen_vtables.ts, emitted verbatim into native/steam-bridge/generated/steam_api_shim.c; line numbers are of the committed .c):

- L152 `static SOCKET g_bridge_sock = INVALID_SOCKET;`
- L153 `static uint32_t g_next_request_id = 1;`
- L155-159 a `//` comment that mentions g_bridge_sock (comments must not count as references)
- L160 `static SRWLOCK g_bridge_lock = SRWLOCK_INIT;`
- L163, L237 comments mentioning `bridge_ensure_connected()` (comments again)
- L276 `static int bridge_ensure_connected(void) {` — reads/writes g_bridge_sock
- L301 `static int bridge_transact_once(` — calls bridge_ensure_connected() once, does `g_next_request_id++`, send/recv/closesocket on g_bridge_sock
- L359 `static int bridge_transact_locked(` — calls bridge_transact_once( twice, closes/resets g_bridge_sock between
- L374 `static int bridge_transact(` body is exactly:
  AcquireSRWLockExclusive(&g_bridge_lock); / int ok = bridge_transact_locked(...); / ReleaseSRWLockExclusive(&g_bridge_lock); / return ok;
- L404 comment mentioning g_bridge_lock
- ~L23925 `void SteamAPI_Shutdown(void) {` — AcquireSRWLockExclusive(&g_bridge_lock); then g_bridge_sock check/closesocket/reset + WSACleanup; ReleaseSRWLockExclusive(&g_bridge_lock); then gl_cb_clear_all();

Existing test conventions in meta/__tests__/gen_vtables.test.ts (~L3115, describe 'callback delivery wiring (P55-6)'):
- `const c = generateShimC(loadAllManifests())` at describe scope
- `bodyOf(sig)` = slice from c.indexOf(sig) to c.indexOf('\n}', start) + 2 (function bodies end with `\n}` at column 0)
- order checks via indexOf comparisons with expect(...).toBeGreaterThan(...)
- 'Shutdown clears the registry only after releasing g_bridge_lock' already exists — do not duplicate it; the new block covers the lock acquisition side.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add the WR-04 bridge-serialization regression describe block and prove it bites</name>
  <files>meta/__tests__/gen_vtables.test.ts</files>
  <behavior>
    - Declaration: `static SRWLOCK g_bridge_lock = SRWLOCK_INIT;` occurs exactly once in the generated C.
    - bridge_transact body: Acquire(&g_bridge_lock) index > -1, the `bridge_transact_locked(` call index is after it, the Release(&g_bridge_lock) index is after the call, and the body's only `return` appears after the Release (an early return would leak the lock).
    - Call-site confinement (on comment-stripped code): every `bridge_transact_locked(` other than its definition lies inside bridge_transact's span, and there is exactly one such call; every `bridge_transact_once(` other than its definition lies inside bridge_transact_locked's span; every `bridge_ensure_connected(` other than its definition lies inside bridge_transact_once's span.
    - Shared-state confinement (on comment-stripped code): every `g_bridge_sock` and `g_next_request_id` occurrence other than its declaration that is NOT inside the spans of bridge_ensure_connected / bridge_transact_once / bridge_transact_locked must be lock-held — the nearest preceding `AcquireSRWLockExclusive(&g_bridge_lock);` is later than the nearest preceding `ReleaseSRWLockExclusive(&g_bridge_lock);` (or no Release precedes it at all while an Acquire does). Assert at least one such outside-transport g_bridge_sock occurrence exists (SteamAPI_Shutdown), so the check is not vacuous. g_next_request_id must have no outside-transport occurrence at all.
  </behavior>
  <action>
Add a new top-level describe, e.g. 'bridge transport serialization (WR-04)', placed directly after the 'callback delivery wiring (P55-6)' describe block. Build it on `generateShimC(loadAllManifests())` like the neighbouring block (loadAllManifests and generateShimC are already imported/defined in the file — reuse them, add no imports beyond what tsc needs).

Inside it, define small local helpers, in the file's existing string/indexOf style (not a C parser):
- a comment-stripped copy of the C: remove block comments (non-greedy slash-star ... star-slash) then line comments (`//` to end of line). Comments in this file mention g_bridge_sock, g_bridge_lock and bridge_ensure_connected() in prose, so all confinement checks MUST run on the stripped text, and all span offsets MUST be computed on that same stripped text (offsets differ from the raw text). If line-comment stripping is found to eat a string literal containing `//` that matters to a check, narrow the regex (e.g. require the `//` not be preceded by `:`) rather than dropping the stripping.
- a span helper: given a definition signature such as 'static int bridge_transact(' return [start, end) where end = indexOf('\n}', start) + 2 on the stripped text; expect start > -1.
- an all-indices helper: every index of a token in the stripped text.
- for the call-site checks, exclude the definition occurrence (the one at the span's own start offset plus the length of 'static int ') and assert every remaining index falls inside the allowed span. Note 'bridge_transact(' is not a substring of 'bridge_transact_once(' or 'bridge_transact_locked(', so plain indexOf on the full token with its '(' is safe.

Write one `it` per behavior bullet (4 tests, matching the behavior block). Keep the raw-text `bodyOf` style for the bridge_transact ordering test so its failure message reads naturally.

TDD proof (do not commit the broken state): after the new tests pass against the current generator, temporarily delete the line that emits `AcquireSRWLockExclusive(&g_bridge_lock);` inside bridge_transact in meta/gen_vtables.ts (around L2925; the Shutdown occurrence near L1148 stays), run the jest command, and confirm the ordering test AND the shared-state test both fail (the existing committed-file sync test will also fail — expected). Then restore with `git checkout -- meta/gen_vtables.ts` and confirm `git diff --quiet meta/gen_vtables.ts`. Do a second throwaway mutation the same way: add a call to bridge_transact_once from a new or existing non-locked function in the generator (e.g. inside gamelib_bridge_hello's body) and confirm the call-site test fails; restore again. Record both RED observations (test names that failed) in the SUMMARY.

Run prettier on the test file (`npx prettier --write meta/__tests__/gen_vtables.test.ts`) before the final check. `npx prettier --file-info meta/__tests__/gen_vtables.test.ts` was confirmed at planning time: not ignored, parser typescript.

Commit: `test(quick-261026-kyv): pin the shim bridge SRWLOCK serialization (WR-04)` — test file only.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest meta/__tests__/gen_vtables.test.ts && git diff --quiet HEAD -- meta/gen_vtables.ts native/steam-bridge/generated && npx prettier --check meta/__tests__/gen_vtables.test.ts</automated>
  </verify>
  <done>gen_vtables.test.ts is fully green with 4 new WR-04 tests; both throwaway mutations were observed to turn named new tests red and were reverted; meta/gen_vtables.ts and native/steam-bridge/generated/ are unchanged from HEAD; the test file passes the scoped prettier check; committed.</done>
</task>

<task type="auto">
  <name>Task 2: Narrow the WR-04 todo to its live multi-threaded gate</name>
  <files>.planning/todos/pending/2026-10-25-bridge-shim-socket-shared-across-threads-without-lock.md</files>
  <action>
Rewrite the todo in place (it stays in pending/ — the live gate is user-only and not done).

Frontmatter:
- Keep `created`, `source`, `area` as they are.
- Change `title` to describe what remains, e.g. "Live multi-threaded Wine gate for the shim bridge SRWLOCK (51-REVIEW WR-04)".
- `files:` list meta/gen_vtables.ts, native/steam-bridge/generated/steam_api_shim.c, and add meta/__tests__/gen_vtables.test.ts.
- The triage keys stay last, in this exact order, bare and lowercase: `severity: minor`, `platform: macos`, `ready: live-gate`. Severity drops from medium to minor because the defect itself is fixed and now regression-pinned; what is left is confirming the fix has no live deadlock or hang, which per the conventions vocabulary is "a latent trap with no live consequence" known today. Do not widen any gate vocabulary.

Body (replace the old body; plain prose, short paragraphs):
1. Status: the code fix landed in 082ff80db (2026-10-26, "fix(debug-abiotic): serialize shim bridge round trips with an SRWLOCK"). The generator emits `static SRWLOCK g_bridge_lock = SRWLOCK_INIT;`; `bridge_transact` holds it exclusively across `bridge_transact_locked` (connect + one transact + the retry-once on a fresh socket), and `SteamAPI_Shutdown` takes it around the socket close.
2. Why SRWLOCK rather than the originally proposed CRITICAL_SECTION + InitOnceExecuteOnce: SRWLOCK_INIT is a static initializer, so there is no lazy init, no InitOnce, and no DllMain / loader-lock exposure. The lock is not recursive; nothing that holds it may call bridge_transact again.
3. Regression pin: name the new 'bridge transport serialization (WR-04)' describe in meta/__tests__/gen_vtables.test.ts and say what it catches (lock removed from bridge_transact, early return before release, a new unlocked caller of the transport functions, a lock-free touch of g_bridge_sock / g_next_request_id).
4. What remains (the live gate): run, under Wine on this Mac, a title that calls Steam from two or more threads concurrently (UE titles are the likely candidates). Abiotic Factor runs do not count: it is single-threaded on the bridge, so they cannot exercise contention. Pass criteria: no deadlock and no hang (game reaches gameplay and quits cleanly, SteamAPI_Shutdown returns), and the helper log shows no request-id-mismatch connection closes. Close the todo once a qualifying run is recorded.

The file is prettier-ignored (`npx prettier --file-info` returned ignored: true at planning time), so per the gamelib-conventions `<verify>` rule no prettier check is carried for it.

Commit: `docs(quick-261026-kyv): narrow WR-04 todo to its live multi-threaded gate` — todo file only.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm planning-gates && grep -c '082ff80db' .planning/todos/pending/2026-10-25-bridge-shim-socket-shared-across-threads-without-lock.md && grep -c 'meta/__tests__/gen_vtables.test.ts' .planning/todos/pending/2026-10-25-bridge-shim-socket-shared-across-threads-without-lock.md && grep -A2 '^severity:' .planning/todos/pending/2026-10-25-bridge-shim-socket-shared-across-threads-without-lock.md</automated>
  </verify>
  <done>pnpm planning-gates passes; the todo is still in pending/ with severity: minor / platform: macos / ready: live-gate in that order; the body records 082ff80db, the SRWLOCK-over-CRITICAL_SECTION rationale, the regression test, and the concrete multi-threaded live-gate criteria (Abiotic excluded); committed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none new | Test-only and planning-doc change; no runtime code, IPC surface, or generated output is altered |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-kyv-01 | Denial of Service | generated shim bridge (shared socket across game threads) | mitigate | Task 1 pins the SRWLOCK serialization so a regression that reintroduces cross-thread frame interleaving / stuck recv fails CI |
| T-kyv-02 | Tampering | TDD mutation of meta/gen_vtables.ts | mitigate | Mutations are reverted with git checkout and Task 1 verify asserts `git diff --quiet HEAD -- meta/gen_vtables.ts native/steam-bridge/generated` |
</threat_model>

<verification>
- `npx jest meta/__tests__/gen_vtables.test.ts` green, including the 4 new WR-04 tests.
- Both throwaway mutations observed red and reverted (recorded in SUMMARY).
- meta/gen_vtables.ts and native/steam-bridge/generated/ unchanged vs HEAD.
- `pnpm planning-gates` green.
</verification>

<success_criteria>
- Deleting the bridge_transact Acquire, or adding an unlocked transport caller, now fails the suite.
- The WR-04 todo is narrowed to a live multi-threaded Wine gate with explicit pass criteria and correct triage frontmatter.
</success_criteria>

<output>
Create `.planning/quick/261026-kyv-pin-the-shim-bridge-srwlock-with-a-regre/261026-kyv-SUMMARY.md` when done.
</output>
