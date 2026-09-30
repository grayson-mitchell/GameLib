---
phase: quick-260930-vrb
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements:
  - QUICK-260930-VRB
files_modified:
  - src/backend/storeManagers/steam/bridge/shimGenerate.ts
  - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
  - meta/__tests__/gen_vtables.test.ts
  - .planning/todos/pending/2026-09-29-phase-24-criticals-correct-at-head-but-pinned-by-no-test.md
  - .planning/todos/completed/2026-09-29-phase-24-criticals-correct-at-head-but-pinned-by-no-test.md

estimate:
  tokens: 80000
  raw_tokens: 80000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - 'Deleting the SteamUser_v023 and SteamFriends_v018 accessor entries from SHIM_EXPORTED_SYMBOLS (re-creating 24-CR-02 exactly) turns the Backend shimGenerate suite RED. Both new tests fail, the parity test and the placement test. Restoring the file turns it GREEN at 14/14. This is measured, not asserted'
    - 'Adding a symbol to SHIM_EXPORTED_SYMBOLS that steam_api.def does not export turns the parity test RED, which proves the second direction of the set equality is not vacuous'
    - 'The parity test reads native/steam-bridge/generated/steam_api.def from disk and parses the export list itself. shimGenerate.test.ts has no import specifier resolving into the meta directory'
    - 'Reverse-applying the meta/gen_vtables.ts hunk of 1e744d204 turns the generator-side 24-CR-01 tests RED while the committed-shim test stays GREEN. Reverse-applying its steam_api_shim.c hunk turns the committed-shim test RED while the generator-side tests stay GREEN. Each pin catches its own half of the defect'
    - 'No mutation is committed. Across BASE..HEAD, meta/gen_vtables.ts and everything under native/steam-bridge/generated/ are byte-unchanged, and git status is clean for src, meta and native'
    - 'The todo lives in .planning/todos/completed/ with status: RESOLVED and resolved: <date> inserted after ready:, plus an appended Resolution section citing 260930-vrb, the commit hashes and the measured red lines. The diff against the pending original is insertion-only, and pnpm planning-gates passes'
  artifacts:
    - path: src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
      provides: '24-CR-02 pin: SHIM_EXPORTED_SYMBOLS set-equals the committed steam_api.def export list in both directions, plus a placement test that imports every .def symbol'
      contains: 'steam_api.def'
    - path: src/backend/storeManagers/steam/bridge/shimGenerate.ts
      provides: 'SHIM_EXPORTED_SYMBOLS exported, with a comment naming the parity test as the reason'
      contains: 'export const SHIM_EXPORTED_SYMBOLS'
    - path: meta/__tests__/gen_vtables.test.ts
      provides: '24-CR-01 pin: isStringReturn routing, the STRING_RETURN_BUF_BYTES floor and #define, and the GetPersonaName shim-owned-buffer stub in both the generator output and the committed steam_api_shim.c'
      contains: 'steam_api_shim.c'
    - path: .planning/todos/completed/2026-09-29-phase-24-criticals-correct-at-head-but-pinned-by-no-test.md
      provides: 'Resolved todo with the mutation evidence and honest limits'
      contains: 'Resolution'
  key_links:
    - from: src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
      to: native/steam-bridge/generated/steam_api.def
      via: 'readFileSync on a REPO_ROOT built as join(__dirname) plus six parent segments'
      pattern: "'native', 'steam-bridge', 'generated', 'steam_api.def'"
    - from: src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
      to: src/backend/storeManagers/steam/bridge/shimGenerate.ts
      via: 'named import of SHIM_EXPORTED_SYMBOLS from ../shimGenerate'
      pattern: 'SHIM_EXPORTED_SYMBOLS'
    - from: meta/__tests__/gen_vtables.test.ts
      to: native/steam-bridge/generated/steam_api_shim.c
      via: 'readFileSync on join(__dirname) plus two parent segments'
      pattern: "'steam_api_shim.c'"
---

<objective>
Pin Phase 24's two criticals so that re-introducing either one turns jest red. Both fixes are
correct at HEAD, and today neither is covered by any test.

- **24-CR-02, shim/def symbol parity (fixed in `934e51a0f`).** `SHIM_EXPORTED_SYMBOLS`
  (`src/backend/storeManagers/steam/bridge/shimGenerate.ts:63`, consumed at `:231`) is a
  hand-synced copy of the committed `.def` export list. The copy is hand-synced because
  `tsconfig.json` `include` is `["src"]` only (`shimGenerate.ts:54-58`). The audit in
  260929-lrh re-created the defect exactly and every gate stayed green: 124/124 jest, `tsc` exit 0.
- **24-CR-01, string-return marshaling (fixed in `1e744d204`).** `isStringReturn`
  (`meta/gen_vtables.ts:117`) and `STRING_RETURN_BUF_BYTES` (`:129`) route
  `SteamFriends018::GetPersonaName` to a stub that copies the wire bytes into a shim-owned static
  buffer and returns a pointer into it. Before the fix, the stub memcpy'd a 4-byte wire value into
  a `const char *` and returned it, which is a pointer into the other process's address space.
  Nothing tests either symbol.

The spec is the todo at
`.planning/todos/pending/2026-09-29-phase-24-criticals-correct-at-head-but-pinned-by-no-test.md`.

Purpose: each pin is proven by a mutation run that re-creates the defect, observes red, restores
the file and observes green. The red lines are recorded in the SUMMARY and in the todo's
resolution. A test that stays green under its own defect is the failure this task exists to end.

Output: two test files extended, one `export` keyword (plus a comment) in `shimGenerate.ts`, and
the todo moved to `completed/`. There are three atomic commits, and no mutation is ever committed.

Capability hooks: ai-integration, assumption-delta and schema-gate do not apply. This plan adds
tests and one `export` keyword. It has no external API, no singular-to-plural assumption change
and no ORM schema file.

Fake-HOME rule (CLAUDE.md): not engaged. Nothing here spawns the sidecar or SEA binary. The
Backend jest project already applies HOME containment through `src/backend/jest.setupContainment.ts`.

No CONTEXT.md exists for this quick task, so there are no D-NN decisions. The orchestrator's
description and the todo are the locked spec.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@.planning/todos/pending/2026-09-29-phase-24-criticals-correct-at-head-but-pinned-by-no-test.md
@src/backend/storeManagers/steam/bridge/shimGenerate.ts
@src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
@meta/__tests__/gen_vtables.test.ts
@native/steam-bridge/generated/steam_api.def

Read `meta/gen_vtables.ts` lines 97-129 (the predicates and the constant) and 251-310 (the
`emitVtableStub` string-return branch) only. Read `native/steam-bridge/generated/steam_api_shim.c`
lines 30-40 and 195-212 only. Run `git show 1e744d204` once to see the defect and the fix side by
side.

<interfaces>
These were extracted during planning at HEAD `cf96b930a`, so the executor does not need to explore.

`src/backend/storeManagers/steam/bridge/shimGenerate.ts`:
- `const SHIM_EXPORTED_SYMBOLS: ReadonlySet<string> = new Set([...12 string literals...])` is at
  `:63-76`. It is NOT exported today. Each entry sits on its own line, indented two spaces, as
  `'Symbol',`. The last entry, `SteamAPI_SteamFriends_v018`, has no trailing comma.
- `export async function placeShimForGame(appId: string, gameExePath: string, opts?: { bottleName?: string; shimSourcePath?: string }): Promise<PlaceShimResult>`
  rejects placement with `{ status: 'error', error: 'Shim does not export required symbol(s): ...' }`
  when any scanned import is missing from `SHIM_EXPORTED_SYMBOLS` (`:230-242`).

`src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts`:
- There are 12 tests in one `describe('shimGenerate')`.
- The harness in `beforeEach` provides `root`, `bottleDir`, `gameExePath`, `realShimSourcePath`
  and `shimDestPath()`.
- `scanSteamApiImports` is mocked as `mockedScanSteamApiImports`. The jest config has
  `resetMocks: true`, so every test must call `mockedScanSteamApiImports.mockResolvedValue(...)`
  itself.
- `node:fs` is real and not mocked. `readFileSync` and `join` are already imported.

`meta/gen_vtables.ts` exports:
- `isStringReturn(method: MethodSignature): boolean`
- `STRING_RETURN_BUF_BYTES` (currently 256)
- `generateShimC(manifests: InterfaceManifest[]): string`
- `generateDefFile(manifests)`
- the types `MethodSignature` and `InterfaceManifest`

`meta/__tests__/gen_vtables.test.ts`:
- There are 23 tests.
- It loads `isteamuser` and `isteamfriends` at module scope from `join(__dirname, '..', 'sdk', '*.manifest.json')`.
- It imports named members from `'../gen_vtables'`.

Manifest facts:
- `isteamfriends` is `SteamFriends018`, ordinal 2. Slot 0 is `GetPersonaName` and returns `const char*`. Slot 1 is
  `SetPersonaNameTest_TESTONLY(const char* pchPersonaName)` and returns `bool`. This is a `const char*`
  PARAMETER, not a return, so it must NOT be a string return.
- `isteamuser` has `GetSteamID`, which returns `CSteamID` (a 64-bit register return), and `GetUserStatsSummary_TESTONLY`,
  which has `structSize` 16 (an sret return).
- `GetPersonaName` is the only method across both manifests that returns `const char*`.

This is the committed, fixed stub at `native/steam-bridge/generated/steam_api_shim.c:198-211`. The
generator output is byte-identical to it.

```c
// slot 0: GetPersonaName() -> const char* | __thiscall ret 0 (STRING RETURN -- shim-owned buffer, CR-01)
static char vt_SteamFriends018_GetPersonaName_buf[STRING_RETURN_BUF_BYTES];
static const char * __attribute__((thiscall)) vt_SteamFriends018_GetPersonaName(void *self) {
  (void)self;
  const uint8_t *argbuf = NULL;
  uint8_t retbuf[STRING_RETURN_BUF_BYTES - 1]; uint32_t retlen = 0;
  if (!bridge_transact(2, 0, argbuf, 0, retbuf, sizeof(retbuf), &retlen)) {
    vt_SteamFriends018_GetPersonaName_buf[0] = '\0';
    return vt_SteamFriends018_GetPersonaName_buf;
  }
  memcpy(vt_SteamFriends018_GetPersonaName_buf, retbuf, retlen);
  vt_SteamFriends018_GetPersonaName_buf[retlen] = '\0';
  return vt_SteamFriends018_GetPersonaName_buf;
}
```

This is the DEFECT body that 1e744d204 removed, i.e. what the mutation must re-create:

```c
  uint8_t retbuf[4]; uint32_t retlen = 0;
  if (!bridge_transact(2, 0, argbuf, 0, retbuf, sizeof(retbuf), &retlen) || retlen < 4) return 0;
  const char * ret; memcpy(&ret, retbuf, 4);
  return ret;
```

The committed header also carries `#define STRING_RETURN_BUF_BYTES 256` at `steam_api_shim.c:37`.
The `\0` in the C text is two characters, a backslash then a zero, so a TS string literal for it
must escape the backslash.
</interfaces>

## Planning-time measurements (HEAD `cf96b930a`, this Windows machine, Git Bash)

These are the baselines the executor compares against. Re-measure rather than trust them if HEAD
has moved.

- `npx jest --selectProjects Backend --testPathPattern 'steam/bridge/__tests__/shimGenerate'`
  gave `Tests: 12 passed, 12 total`. Forward slashes in the pattern work here: jest printed
  `Ran all test suites matching /steam\\bridge\\__tests__\\shimGenerate/i`.
- `npx jest --selectProjects Meta --testPathPattern 'meta/__tests__/gen_vtables'` gave
  `Tests: 23 passed, 23 total`.
- `pnpm -s find-deadcode` gave `unreachable: 46 OK | used-in-module: 0 OK`, exit 0, in about 9s.
  `tsconfig.json` includes `src` and excludes only `**/__mocks__/**`, so test files are part of the
  ts-prune project. A test importing `SHIM_EXPORTED_SYMBOLS` is therefore a real importer and the
  export should not appear as `(used in module)`. The gate is what proves this.
- `npx eslint` on the three code paths gave zero problems, exit 0. Both lint ceilings in
  `meta/lintScoped.cjs` sit at exact measured counts, so any new warning turns `pnpm lint` red.
- `npx prettier --file-info` reported `{ "ignored": false, "inferredParser": "typescript" }` for
  all three code paths, and `--check` was clean.
- `git show 1e744d204 -- meta/gen_vtables.ts | git apply -R --check` was CLEAN, and so was the same
  check for `-- native/steam-bridge/generated/steam_api_shim.c`.
- ts-jest 29.3.3 takes `isolatedModules` from `tsconfig.json`, which sets it to `true`
  (`node_modules/ts-jest/dist/legacy/config/config-set.js:218`). ts-jest therefore transpiles
  without type-checking. After a revert removes an export, the export is `undefined` at runtime
  and the failures show up per test, not as a suite-level TS2305.
- Generator output is byte-identical to BOTH committed artifacts. This was probed in the
  scratchpad by calling `generateDefFile` and `generateShimC` against the committed `.def` and
  `.c`, and both comparisons were `true`. No test pins this identity, which is recorded as an
  honest limit in Task 3.
- `pnpm -s planning-gates` gave `12/12 planning gates passed.`
- `.gitattributes` pins `* text=auto eol=lf`, so both generated files are LF on this checkout.

## Source coverage audit

| Source | Item | Covered by |
|---|---|---|
| GOAL | Pin 24-CR-01 and 24-CR-02 with mutation-proven tests | Tasks 1 and 2 |
| REQ | QUICK-260930-VRB | all tasks |
| TODO §4 | Parity test, set equality in both directions, `.def` read from disk and parsed independently, no import from meta | Task 1 |
| DESC | CR-01: tests for `isStringReturn` and `STRING_RETURN_BUF_BYTES`, plus the emitted shim carrying the GetPersonaName buffer | Task 2 |
| DESC | Mutation per pin: red recorded, restored via `git checkout --` with `git diff --exit-code`, never committed | Tasks 1 and 2 (arms), final verification |
| DESC | Move the todo to completed/ with a resolution note citing the quick id and commits | Task 3 |
| DESC | Verify: jest projects, `pnpm codecheck`, prettier on the exact written paths (prettier-visible confirmed); no vacuous prettier check for `.planning` | every verify block |

<tasks>

<task type="tracer">
  <name>Task 1: Pin 24-CR-02, SHIM_EXPORTED_SYMBOLS set-equals the committed steam_api.def (both directions), mutation-proven</name>
  <files>src/backend/storeManagers/steam/bridge/shimGenerate.ts, src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts</files>
  <behavior>
    - Parity test: the symbol list parsed from `native/steam-bridge/generated/steam_api.def` is non-empty, has no duplicates, and every entry is in `SHIM_EXPORTED_SYMBOLS`. This is the CR-02 direction, a `.def` export that placement would wrongly reject. Every `SHIM_EXPORTED_SYMBOLS` entry is also in the `.def`. That is the reverse direction, a symbol placement would accept that the shipped shim does not export, so the game would fail at load.
    - Placement test: when the mocked import scan returns every `.def` symbol, including both interface accessors, `placeShimForGame` returns `{ status: 'placed', shimPath: shimDestPath() }`. This asserts the production effect CR-02 broke.
    - Mutation CR02-a (the two accessor entries deleted): both tests RED, the other 12 GREEN.
    - Mutation CR02-b (one probe symbol not in the .def added): the parity test RED, the other 13 GREEN.
  </behavior>
  <action>
Step 0. Record `git rev-parse HEAD` as BASE and write it into the SUMMARY. The final
verification uses `BASE..HEAD`.

Step 1, the production edit. In `src/backend/storeManagers/steam/bridge/shimGenerate.ts`:
- Add `export` to the `SHIM_EXPORTED_SYMBOLS` declaration at `:63`. Do not change the Set, its
  type or its 12 entries.
- Append two or three lines to the comment block directly above it (`:48-62`). They say the
  constant is exported solely so `__tests__/shimGenerate.test.ts` can assert it set-equals the
  committed `native/steam-bridge/generated/steam_api.def` in both directions. That is the 24-CR-02
  pin from quick 260930-vrb. They also say a drift in this hand-synced copy is now a red test
  rather than a silent placement rejection.
- Do not put the symbol names in the new comment text as quoted string literals. The mutation
  arms below target the quoted entry lines.

Nothing else in the file changes. The `PlaceShimResult` "Not exported" comment at `:78-80` stays
exactly as it is.

Step 2, the tests. Extend
`src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts`:
- Add `SHIM_EXPORTED_SYMBOLS` to the existing named import from `'../shimGenerate'`.
- At module scope, define `REPO_ROOT` as `join(__dirname, ...)` with six `'..'` segments.
  `__tests__`, `bridge`, `steam`, `storeManagers`, `backend` and `src` make six. This follows the
  repo precedent, e.g. `src/backend/sidecar/__tests__/gamelibNamespaceLoad.test.ts:39` and
  `src/backend/storeManagers/steam/__tests__/removeCopies.test.ts:1097`.
- Define the `.def` path as `join(REPO_ROOT, 'native', 'steam-bridge', 'generated', 'steam_api.def')`.
- Add a small module-scope parser `readDefExports()`. It reads that file with the real
  `readFileSync` (utf-8) and splits on `/\r?\n/`. This is harmless robustness: the file is LF under
  `.gitattributes` `eol=lf`. It then trims each line, locates the `EXPORTS` line, takes the
  following non-empty lines that do not start with `;` (the `.def` comment marker), and maps each
  to its first whitespace-delimited token. It returns the header line too, or asserts it inside
  the test.
- The test must import nothing from the meta directory and must not call `generateDefFile`. The
  anchor is the COMMITTED `.def`, because `buildShimCompileArgv` in
  `meta/buildSteamBridgeShims.ts` compiles exactly that file into the shipped shim. That fact is
  pinned at `meta/__tests__/buildSteamBridgeShims.test.ts:89-92`.
- Say this in a comment above the new tests. Also say that `tsconfig.json`'s `include` of
  `["src"]` is why the list is hand-synced, and therefore why only a test can hold the two
  together.

Append two tests at the end of the existing `describe('shimGenerate', ...)` block.

Test A is titled `24-CR-02: SHIM_EXPORTED_SYMBOLS set-equals the export list of the committed native/steam-bridge/generated/steam_api.def, in both directions`.
- Assert the first line is `LIBRARY steam_api` and the `EXPORTS` line was found.
- Assert the parsed list is non-empty and duplicate-free, comparing `new Set(list).size` to the
  list length.
- Build `missingFromShim` as the `.def` symbols absent from `SHIM_EXPORTED_SYMBOLS`, and
  `notInDef` as the `SHIM_EXPORTED_SYMBOLS` entries absent from the `.def` set. Assert each with
  `toEqual([])`. A red then names the offending symbols in its Received value rather than printing
  a bare boolean.

Test B is titled `24-CR-02: a game importing every symbol steam_api.def exports (including the SteamUser/SteamFriends interface accessors) is placed, not rejected`.
- Inside the test, call `mockedScanSteamApiImports.mockResolvedValue({ status: 'ok', symbols: readDefExports() })`.
- Call `placeShimForGame('1234', gameExePath, { shimSourcePath: realShimSourcePath })`.
- Assert `toEqual({ status: 'placed', shimPath: shimDestPath() })`.

Step 3. Run the Task 1 `<verify>` gates. All of them must be green at 14/14. Then commit ONLY
these two files with
`test(quick-260930-vrb): pin 24-CR-02 shim export set to steam_api.def in both directions`.

Commit BEFORE mutating. `git checkout -- <file>` restores from the index, so mutating first would
also wipe the Step 1 `export`.

Step 4, the mutation arms, run against the committed tree. Capture each jest run to a file OUTSIDE
the checkout: the executor's scratchpad, or a `mktemp -d` created in the same shell call. Never
write a capture under the repo. Every arm uses the same command,
`npx jest --selectProjects Backend --testPathPattern 'steam/bridge/__tests__/shimGenerate'`.

- Arm CR02-a re-creates CR-02 exactly. Delete the two quoted entry lines `'SteamAPI_SteamUser_v023',`
  and `'SteamAPI_SteamFriends_v018'` from `SHIM_EXPORTED_SYMBOLS`. The following command was
  dry-run during planning on a scratch copy in Git Bash, where it gave numstat `0 2`:
  `sed -i "/^  'SteamAPI_SteamUser_v023',\$/d; /^  'SteamAPI_SteamFriends_v018'\$/d" src/backend/storeManagers/steam/bridge/shimGenerate.ts`.
  The preceding `'SteamAPI_UnregisterCallResult',` then keeps its trailing comma, which is valid TS.
  - Prove the mutation applied: `git diff --numstat -- src/backend/storeManagers/steam/bridge/shimGenerate.ts`
    must print `0` added and `2` deleted. A mutation that matched nothing would produce a false
    "the test is vacuous" reading.
  - Run jest. Expected: `Tests: 2 failed, 12 passed, 14 total`, with both Test A and Test B under
    a `●` heading. Test A's Received should list the two accessor symbols. Test B's Received
    should show `status: 'error'`.
  - Restore with `git checkout -- src/backend/storeManagers/steam/bridge/shimGenerate.ts`.
  - `git diff --exit-code -- src/backend/storeManagers/steam/bridge/shimGenerate.ts` must exit 0.
  - Re-run jest: 14/14 green.
- Arm CR02-b tests the reverse direction. Insert one line, `'SteamAPI_MutationProbe_NotInDef',`,
  indented two spaces, after the `'SteamAPI_Init',` entry. The following command was dry-run
  during planning in the same way, where it gave numstat `1 0`:
  `sed -i "/^  'SteamAPI_Init',\$/a\\  'SteamAPI_MutationProbe_NotInDef'," src/backend/storeManagers/steam/bridge/shimGenerate.ts`.
  Use this probe name, NOT `SteamAPI_ISteamRemoteStorage_v016`. The existing coverage
  tests import that symbol, so adding it would redden them too and muddy the count.
  - `git diff --numstat` must print `1` added and `0` deleted.
  - Expected: `Tests: 1 failed, 13 passed, 14 total`, with only Test A red and its `notInDef`
    Received naming the probe.
  - Restore the same way. `git diff --exit-code` must exit 0 and a re-run must be 14/14.

For each arm, the SUMMARY records the numstat line, the jest `Tests:` line, and each red test's
`●` title with its first failure line (the `Expected`/`Received` pair or the thrown message). Copy
these from the capture. Do not paraphrase them, and record no absolute paths or env content. Delete
the capture directory afterwards.

If an arm does NOT produce its expected red, the pin is vacuous. Fix the test, re-run Step 3's
gates, commit the fix as a follow-up `test(quick-260930-vrb): ...` commit, and re-run the arm. Never
weaken an expectation to fit a green.
  </action>
  <verify>
    <automated>npx jest --selectProjects Backend --testPathPattern 'steam/bridge/__tests__/shimGenerate' 2>&1 | grep -E 'Tests:[[:space:]]+14 passed, 14 total' && git diff --exit-code -- src/backend/storeManagers/steam/bridge/shimGenerate.ts src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts && ! grep -nE "from ['\"][^'\"]*meta/" src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts && grep -nE '^export const SHIM_EXPORTED_SYMBOLS' src/backend/storeManagers/steam/bridge/shimGenerate.ts && pnpm -s find-deadcode && npx eslint --max-warnings 0 src/backend/storeManagers/steam/bridge/shimGenerate.ts src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts && for p in src/backend/storeManagers/steam/bridge/shimGenerate.ts src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts; do npx prettier --file-info "$p" | grep -Eq '"ignored":[[:space:]]*false' || { echo "prettier ignores $p"; exit 1; }; done && npx prettier --check src/backend/storeManagers/steam/bridge/shimGenerate.ts src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts && pnpm codecheck</automated>
  </verify>
  <done>
    - Backend shimGenerate goes from 12/12 to 14/14 green on the committed, restored tree.
    - `pnpm -s find-deadcode` still exits 0 with `used-in-module: 0 OK`, meaning the test is counted as a real importer. If it goes red, STOP and report. Do not edit either baseline ledger; the gate's own header forbids admitting a finding.
    - eslint reports 0 problems on both paths.
    - prettier sees both paths (`"ignored": false`) and they pass `--check`.
    - `pnpm codecheck` exits 0.
    - Arm CR02-a was measured at `2 failed, 12 passed, 14 total`, and arm CR02-b at `1 failed, 13 passed, 14 total`. Each was preceded by a numstat line proving the mutation applied, and each was restored to exit-0 `git diff --exit-code` and 14/14.
    - The red lines for both arms are recorded in the SUMMARY.
    - One commit (or more, if a vacuity fix was needed) touches exactly these two files.
  </done>
</task>

<task type="auto">
  <name>Task 2: Pin 24-CR-01, isStringReturn, STRING_RETURN_BUF_BYTES and the GetPersonaName shim-owned buffer in generator output and the committed steam_api_shim.c, mutation-proven</name>
  <files>meta/__tests__/gen_vtables.test.ts</files>
  <behavior>
    - T2-1 `isStringReturn`: across `[...isteamuser.methods, ...isteamfriends.methods]`, it selects exactly `['GetPersonaName']`. It is explicitly false for `SetPersonaNameTest_TESTONLY`, whose `const char*` is a parameter, not a return.
    - T2-2 `STRING_RETURN_BUF_BYTES` is at least 128. That is Steamworks' `k_cchPersonaNameMax` including the NUL, as cited at `meta/gen_vtables.ts:121-128`: the transact buffer is one byte smaller, so 128 is the floor that still fits a 127-byte name. `generateShimC([isteamuser, isteamfriends])` contains the line `#define STRING_RETURN_BUF_BYTES <that constant>`.
    - T2-3 and T2-4 are one `it.each` over two sources, the generator output and the committed `native/steam-bridge/generated/steam_api_shim.c`. The GetPersonaName stub body does NOT contain the defect signature, and DOES contain the shim-owned-buffer copy-and-return. The source declares the static buffer and carries a numeric `#define STRING_RETURN_BUF_BYTES` of at least 128.
    - Mutation CR01-a (the gen_vtables.ts hunk reverse-applied): T2-1, T2-2 and the generator row of the `it.each` are RED, and the committed row is GREEN.
    - Mutation CR01-b (the steam_api_shim.c hunk reverse-applied): only the committed row is RED.
  </behavior>
  <action>
Extend `meta/__tests__/gen_vtables.test.ts` only. There is no production change in this task.
- Add `isStringReturn` and `STRING_RETURN_BUF_BYTES` to the existing named import from
  `'../gen_vtables'`.
- Append one new `describe`, titled `string-return marshaling (24-CR-01 -- GetPersonaName shim-owned buffer)`,
  inside the top-level `describe('gen_vtables')`.
- Give it a short comment. It says the defect (fixed in 1e744d204) routed a `const char*` return
  through the generic register-return path. That path memcpy'd a 4-byte wire value into a pointer
  and returned it, a pointer into the bridge helper's address space. It also says these tests pin
  both the generator and the committed artifact, because the shim is compiled from the committed
  `.c` (`buildShimCompileArgv`).

T2-1 is titled `24-CR-01: isStringReturn routes exactly GetPersonaName across both pinned manifests (a const char* PARAMETER is not a string return)`.
- Filter the concatenated methods of both manifests with `isStringReturn`, map them to `name`, and
  assert the result `toEqual(['GetPersonaName'])`.
- Also assert `isStringReturn` is `false` for the `SetPersonaNameTest_TESTONLY` method looked up
  by name.

T2-2 is titled `24-CR-01: STRING_RETURN_BUF_BYTES leaves headroom over k_cchPersonaNameMax (128 incl. NUL) and is emitted verbatim as the shim #define`.
- Assert `STRING_RETURN_BUF_BYTES` is `toBeGreaterThanOrEqual(128)`.
- Assert the `generateShimC([isteamuser, isteamfriends])` output contains the exact line built as
  `#define STRING_RETURN_BUF_BYTES ` followed by the constant.
- Do not pin the exact value 256. The floor is the invariant; the value is a tuning choice.

T2-3 and T2-4 are one `it.each` of `[label, getSource]` rows:
- The first row is labelled `generateShimC output`, with a thunk returning
  `generateShimC([isteamuser, isteamfriends])`.
- The second row is labelled `committed native/steam-bridge/generated/steam_api_shim.c`, with a
  thunk that `readFileSync`s `join(__dirname, '..', '..', 'native', 'steam-bridge', 'generated', 'steam_api_shim.c')`
  as utf-8.
- The title template is
  `24-CR-01 (%s): GetPersonaName copies the wire bytes into a shim-owned static buffer and returns a pointer into it, never a wire-received pointer value`.

In the body, IN THIS ORDER, so a red's first failure line shows the defect and not a missing
`#define`:
1. Extract the stub with a regex anchored on `vt_SteamFriends018_GetPersonaName(void *self) {`
   through the first column-0 closing brace, i.e. a lazy match up to `\n}`. The pre-fix stub has
   the same signature, so the match survives the mutation and the body assertions below are the
   ones that fail. The vtable array's `(vfn)vt_SteamFriends018_GetPersonaName,` does not match
   that anchor. Assert the match is not null.
2. Assert the body does not contain `retbuf[4]`, and does not contain `memcpy(&ret, retbuf`. Those
   are the defect signature.
3. Assert the body contains each of the following:
   - `uint8_t retbuf[STRING_RETURN_BUF_BYTES - 1]`
   - `vt_SteamFriends018_GetPersonaName_buf[0] = '\0';`. This is the transact-failure path, which
     returns an empty string, never NULL. It is a C backslash-zero, so escape the backslash in TS.
   - `memcpy(vt_SteamFriends018_GetPersonaName_buf, retbuf, retlen);`
   - `vt_SteamFriends018_GetPersonaName_buf[retlen] = '\0';`
   - `return vt_SteamFriends018_GetPersonaName_buf;`
4. Assert the whole source contains
   `static char vt_SteamFriends018_GetPersonaName_buf[STRING_RETURN_BUF_BYTES];`.
5. Match `/^#define STRING_RETURN_BUF_BYTES (\d+)$/m` and assert it is not null, with
   `Number(capture)` at least 128. This row must NOT interpolate the imported constant. The
   committed row has to stay independent of the generator module so the two mutation arms can
   discriminate.

Run the Task 2 `<verify>` gates. All must be green at 27/27. Then commit ONLY
`meta/__tests__/gen_vtables.test.ts` with
`test(quick-260930-vrb): pin 24-CR-01 GetPersonaName shim-owned string-return buffer`.

The mutation arms run after the commit. Capture each run outside the checkout, as in Task 1. Every
arm uses `npx jest --selectProjects Meta --testPathPattern 'meta/__tests__/gen_vtables'`.

- Arm CR01-a reverts the generator half literally, which is the faithful revert of the CR-01 fix.
  Run `git show 1e744d204 -- meta/gen_vtables.ts | git apply -R`.
  - `git diff --numstat -- meta/gen_vtables.ts` must show non-zero deletions.
  - Expected: `Tests: 3 failed, 24 passed, 27 total`. T2-1 is red with a TypeError, because
    `isStringReturn` is `undefined` under ts-jest transpile-only. T2-2 is red. The
    `generateShimC output` row is red on the step 2 negative assertion, which shows the pre-fix
    body. The `committed ...steam_api_shim.c` row is GREEN, and the SUMMARY must state that this
    green is expected: it is what proves the two rows are independent pins.
  - Restore with `git checkout -- meta/gen_vtables.ts`. `git diff --exit-code -- meta/gen_vtables.ts`
    must exit 0, and a re-run must be 27/27.
  - Contingency: if the run instead reports `Test suite failed to run` (ts-jest type-checked after
    all), record that verbatim and restore. Then run arm CR01-a-prime: replace ONLY the body of
    `isStringReturn` with a `return false` statement, keeping every export. This emits the
    identical pre-fix GetPersonaName stub. Expect T2-1 and the generator row red with
    assertion-level failures. Record them and restore the same way.
- Arm CR01-b reverts the committed-artifact half literally. Run
  `git show 1e744d204 -- native/steam-bridge/generated/steam_api_shim.c | git apply -R`.
  - `git diff --numstat` on that file must be non-zero.
  - Expected: `Tests: 1 failed, 26 passed, 27 total`, with only the committed row red on its
    step 2 negative assertion.
  - Restore with `git checkout -- native/steam-bridge/generated/steam_api_shim.c` and check
    `git diff --exit-code` on it. A re-run must be 27/27.

Record the numstat line, the `Tests:` line and each red `●` title with its first failure line for
every arm in the SUMMARY. The same vacuity rule as Task 1 applies: an arm that fails to redden its
target test means fix the test and commit a follow-up, and never relax an expectation.
  </action>
  <verify>
    <automated>npx jest --selectProjects Meta --testPathPattern 'meta/__tests__/gen_vtables' 2>&1 | grep -E 'Tests:[[:space:]]+27 passed, 27 total' && git diff --exit-code -- meta/__tests__/gen_vtables.test.ts meta/gen_vtables.ts native/steam-bridge/generated/steam_api_shim.c && grep -nE "'steam_api_shim\.c'" meta/__tests__/gen_vtables.test.ts && npx eslint --max-warnings 0 meta/__tests__/gen_vtables.test.ts && npx prettier --file-info meta/__tests__/gen_vtables.test.ts | grep -Eq '"ignored":[[:space:]]*false' && npx prettier --check meta/__tests__/gen_vtables.test.ts && pnpm codecheck</automated>
  </verify>
  <done>
    - Meta gen_vtables goes from 23/23 to 27/27 green on the committed, restored tree.
    - `meta/gen_vtables.ts` and `native/steam-bridge/generated/steam_api_shim.c` show no diff against HEAD.
    - eslint reports 0 problems.
    - prettier sees the file and `--check` passes.
    - `pnpm codecheck` exits 0; `tsconfig.meta.json` type-checks the new test.
    - Arm CR01-a was measured at 3 failed with the committed row green, or via the recorded contingency. Arm CR01-b was measured at 1 failed with only the committed row red. Each was restored to an exit-0 `git diff --exit-code` and 27/27.
    - The red lines are recorded in the SUMMARY.
  </done>
</task>

<task type="auto">
  <name>Task 3: Resolve the todo, git mv to completed/ with frontmatter status and an appended Resolution citing 260930-vrb and the commits</name>
  <files>.planning/todos/pending/2026-09-29-phase-24-criticals-correct-at-head-but-pinned-by-no-test.md, .planning/todos/completed/2026-09-29-phase-24-criticals-correct-at-head-but-pinned-by-no-test.md</files>
  <action>
Step 1. Run
`git mv .planning/todos/pending/2026-09-29-phase-24-criticals-correct-at-head-but-pinned-by-no-test.md .planning/todos/completed/`.

Step 2. Insert two frontmatter lines directly after `ready: code` (line 7) and before `source:`:
`status: RESOLVED`, then `resolved: <date>`. Take `<date>` from the machine's own `date +%F`, not
from the agent context date. STATE.md records a verifier that stamped the wrong day because the
context date lags this machine's +13 timezone.

These lines match the key order of the four most recent completed todos: `status:` on line 8 and
`resolved:` on line 9, e.g.
`.planning/todos/completed/2026-09-30-planning-frontmatter-gate-crashes-on-windows-cp1252.md`.
Change no other frontmatter line. Leave body sections 1 to 5 byte-identical. They are the history of
the finding. Its "neither fix is pinned" claims were true when written, and they stay true as
history.

Step 3. Append a final section headed `## 6. Resolution (quick 260930-vrb, <date>)`. The heading
continues this file's own numbered-section style, and the word Resolution matches the
completed-todo corpus. Wrap prose near 100 columns like the rest of the file. It states:

- **Lead: both criticals are now pinned.**
  - 24-CR-02 is pinned by the two new tests in
    `src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts` (Task 1 commit
    short-hash). They anchor on the COMMITTED `steam_api.def`, because `buildShimCompileArgv`
    compiles that file into the shipped shim.
  - `SHIM_EXPORTED_SYMBOLS` is now exported, and its only importer is that test. `pnpm find-deadcode`
    is unchanged at `used-in-module: 0`.
  - 24-CR-01 is pinned by the four new tests in `meta/__tests__/gen_vtables.test.ts` (Task 2 commit
    short-hash). They cover the generator output and the committed `steam_api_shim.c`
    independently.
- **The mutation evidence**, as a small table with columns arm, what was mutated, numstat, jest
  `Tests:` line, and red test titles. It covers arms CR02-a, CR02-b, CR01-a (and CR01-a-prime if
  the contingency ran) and CR01-b. Copy the table from the SUMMARY's recorded captures. State
  plainly that no mutation was committed, and that
  `git diff --quiet <BASE> HEAD -- meta/gen_vtables.ts native/steam-bridge/generated/` exits 0.
- **Honest limits, at equal weight:**
  - (a) The CR-01 pins are structural assertions over C source text. Nothing compiles or runs the
    shim on this machine; the shim is built with zig on the packaging path.
  - (b) `STRING_RETURN_BUF_BYTES` is pinned as a floor of at least 128, not as the exact 256.
  - (c) The byte identity between generator output and the committed `.def`/`.c` is still pinned by
    NO test. It was measured identical at HEAD `cf96b930a` during planning, via a scratchpad probe
    calling `generateDefFile` and `generateShimC`. Regenerating without committing, or committing
    without regenerating, remains invisible to jest. That seam was outside this todo's scope and is
    named here, not fixed.

Get the short hashes from `git log --oneline -E --grep='^test\(quick-260930-vrb\)'` after Tasks 1 and 2
are committed, and cite EVERY commit it lists, including any vacuity-fix follow-up. The verify gate
checks each one. Do not guess the hashes.

Step 4. Run `pnpm -s planning-gates`. `completed/` is exempt from the todo-frontmatter gate, but the
whole battery must still pass. Commit the rename and the edit together with
`docs(quick-260930-vrb): resolve the phase 24 criticals pin todo and move it to completed`.

Leave the historical references to the pending path in the 260929-lrh PLAN and SUMMARY untouched.
They record where the file was when those were written.

Formatter: this task writes only `.planning/` paths. CLAUDE.md measures `.planning` as
prettier-ignored (`{ "ignored": true, "inferredParser": null }`), so a `prettier --check` there
would print a green that proves nothing. It is deliberately omitted. Consistency with the
surrounding file comes from hand-matching its wrap and key order.
  </action>
  <verify>
    <automated>T=.planning/todos/completed/2026-09-29-phase-24-criticals-correct-at-head-but-pinned-by-no-test.md; test ! -e .planning/todos/pending/2026-09-29-phase-24-criticals-correct-at-head-but-pinned-by-no-test.md && test -f "$T" && sed -n 8p "$T" | grep -qx 'status: RESOLVED' && sed -n 9p "$T" | grep -Eqx 'resolved: 20[0-9]{2}-[0-9]{2}-[0-9]{2}' && test "$(grep -c '^## 6\. Resolution (quick 260930-vrb' "$T")" = 1 && NS=$(git show -M --name-status --format= HEAD) && printf '%s\n' "$NS" | grep -E '^R[0-9]+[[:space:]]+\.planning/todos/pending/2026-09-29-phase-24-criticals' && NUM=$(git show -M --numstat --format= HEAD) && printf '%s\n' "$NUM" | awk '$2 != 0 { bad=1 } END { exit bad }' && HS=$(git log -E --format=%h --grep='^test\(quick-260930-vrb\)' -10) && test -n "$HS" && for h in $HS; do grep -q "$h" "$T" || { echo "missing commit $h"; exit 1; }; done && pnpm -s planning-gates</automated>
  </verify>
  <done>
    - The todo exists only under `completed/`. Git records a rename (`R`) whose numstat deleted count is 0, so the change is insertion-only.
    - Line 8 is `status: RESOLVED` and line 9 is `resolved: <machine date>`.
    - There is exactly one `## 6. Resolution (quick 260930-vrb ...` section, and it cites both test-commit short hashes, the mutation table and the three honest limits.
    - `pnpm planning-gates` reports 12/12.
    - No prettier check was run, by design, because every path written is prettier-ignored.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| working tree to commit | Mutation arms deliberately write defective production code into tracked files. Only restored trees may reach a commit |
| jest capture to planning artifacts | Raw jest output contains machine-local absolute paths. Only curated lines cross into the SUMMARY and the todo |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-260930-vrb-01 | Tampering | Mutation arms against `shimGenerate.ts`, `meta/gen_vtables.ts` and `steam_api_shim.c`. A committed mutation re-ships a Phase 24 critical | high | mitigate | Commit before mutating. A numstat line proves each mutation applied. Each arm restores via `git checkout --` and then requires an exit-0 `git diff --exit-code` plus a green re-run. The final verification requires an exit-0 `git diff --quiet BASE HEAD -- meta/gen_vtables.ts native/steam-bridge/generated/` and an empty `git status --porcelain -- src meta native` |
| T-260930-vrb-02 | Repudiation | The mutation-proof claims in the SUMMARY and the todo resolution | medium | mitigate | Red lines are copied from real captures: the `Tests:` line, the `●` title and the first failure line. Exact expected counts (14 and 27 totals) make a partial red visible. The numstat check rules out a no-op mutation posing as a vacuous test. The "committed row stays green" observation under CR01-a is recorded as the discrimination proof |
| T-260930-vrb-03 | Information Disclosure | Jest capture files (absolute `C:\Users\...` paths) | low | mitigate | Captures go outside the checkout and are deleted after use. The SUMMARY and the todo carry only test titles, failure lines and counts |
| T-260930-vrb-04 | Tampering | `export` on `SHIM_EXPORTED_SYMBOLS` widens the module surface. A future importer could cast away `ReadonlySet` and add symbols, widening what placement accepts | low | accept | The only importer is the test. The type stays `ReadonlySet<string>`. The comment names the test as the reason for the export. `find-deadcode` holds at `used-in-module: 0` |
| T-260930-vrb-SC | Tampering | npm/pip/cargo installs | low | accept | No package is installed. `npx jest`, `npx eslint` and `npx prettier` resolve the repo's existing `node_modules` |
</threat_model>

<verification>
Run once after all three tasks, from the checkout root, with BASE recorded in Task 1 Step 0:

- `git log --oneline BASE..HEAD` shows the Task 1, Task 2 and Task 3 commits (plus any recorded
  vacuity-fix follow-ups), each carrying `quick-260930-vrb`.
- `git diff --name-status -M BASE HEAD` lists exactly:
  - `src/backend/storeManagers/steam/bridge/shimGenerate.ts`
  - `src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts`
  - `meta/__tests__/gen_vtables.test.ts`
  - the todo rename
- `git diff --quiet BASE HEAD -- meta/gen_vtables.ts native/steam-bridge/generated/` exits 0.
  None of the mutation targets changed.
- `git status --porcelain -- src meta native` prints nothing.
- `npx jest --selectProjects Backend Meta --testPathPattern 'steam/bridge/__tests__|meta/__tests__/(gen_vtables|buildSteamBridgeShims)'`
  shows every suite passing. This is the bridge suite family the 260929-lrh audit measured, plus
  the generator tests.
- `pnpm codecheck` exits 0, and `pnpm -s find-deadcode` exits 0 with `used-in-module: 0 OK`.
</verification>

<success_criteria>
- 24-CR-02 is pinned. Re-creating it exactly (the two accessor entries deleted) was measured red
  (2 failed of 14), and the reverse direction was measured red (1 failed of 14), each restored to
  green.
- 24-CR-01 is pinned in both halves. Reverting the generator hunk of 1e744d204 was measured red
  with the committed row green, and reverting the committed-shim hunk was measured red with only
  the committed row red, each restored to green.
- No mutation reached a commit. The mutation targets are byte-unchanged across `BASE..HEAD`.
- Every code path written passed a real (non-ignored) `prettier --check`, eslint at
  `--max-warnings 0`, and `pnpm codecheck`.
- The todo is resolved in `completed/` with evidence and honest limits, and planning-gates is 12/12.
</success_criteria>

<output>
Write `.planning/quick/260930-vrb-pin-phase-24-criticals-24-cr-01-string-r/260930-vrb-SUMMARY.md`.
It includes:
- BASE
- the three (or more) commit hashes
- the per-arm mutation table: arm, numstat, the `Tests:` line, and each red `●` title with its
  first failure line
- the green counts (Backend shimGenerate 14/14, Meta gen_vtables 27/27)
- the find-deadcode line
- the three honest limits from Task 3

Do not edit STATE.md; the orchestrator owns it.
</output>
