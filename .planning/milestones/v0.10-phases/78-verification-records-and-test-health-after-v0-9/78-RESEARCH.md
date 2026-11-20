# Phase 78: Verification records and test health after v0.9 - Research

**Researched:** 2026-11-15
**Domain:** Planning-record hygiene (archived v0.9 verification/UAT files), Jest suite health attribution, CI/pre-push ratchet wiring
**Confidence:** HIGH (every claim below was measured or read in this session at a clean-HEAD worktree or in named files; the few `[ASSUMED]` items are called out)
**Measured at:** clean worktree of `19b3cac2c` (docs(79-44)); main HEAD moved to `3d0204745` during research (Phase 76/79 docs commits). The temporary worktrees were removed; the dirty tree was not touched. Re-measure counts at execution time.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Proof = a run from a **clean worktree at HEAD**. Run the four files as targeted runs **and** inside the full `pnpm test:ci` run, so order dependence and pollution from shared state between tests show up. Today's dirty-tree green does not count. (Fresh worktrees need build prep. See the memory note on `build:sidecar-sea` / vite build if anything needs built artifacts.)
- **D-02:** Attribute each suite: name the commit that made it pass, or record "never failed / env-dependent" with evidence (git log / bisect). This settles whether quick 261105-vfq's "pre-existing" claim for macArch was true.
- **D-03:** The macArch "Intel: never seeds…" case must be shown to pass under a **mocked x64/Intel host** and on **CI's Linux runner** (`.github/workflows/test.yml`), not only on this Apple Silicon Mac. If the test does not control arch itself, that is a test defect to fix (D-04).
- **D-04:** If any suite is red on clean HEAD, in the full run, or under the arch checks, **fix it in this phase**, whether the fault is in the test or the code.
- **D-05:** **Edit the archived files in place** under `.planning/milestones/v0.9-phases/`. That is where the audit and future readers look.
- **D-06:** `52-VERIFICATION.md`: write a **new current body at the top** that matches the `passed` frontmatter (gap_closure_4, amended done-when). Move the 2026-10-24 `gaps_found` report under a clearly dated **"Superseded report (2026-10-24)"** heading. Keep it, don't delete it.
- **D-07:** Superseded UAT Gaps entries in `52-UAT.md` and `53-UAT.md` (lines ~191-199) change from `status: failed` to **`status: superseded`** plus a **`superseded_by:`** pointer naming the census run, phase, plan or commit that overtook them. Researcher: check `Skill("gamelib-conventions")` (UAT item shape) and whatever parses UAT gap status (`/gsd-audit-uat`, audit tooling) to confirm `superseded` is accepted or what has to change. Never widen a gate's vocabulary just to admit a value that failed it.
- **D-08:** `58-VERIFICATION.md` `follow_ups`: **drop** each item the code shows fixed, adding a one-line "closed by 58-REVIEW-FIX `<commit>`" note. **Keep** the ones that are really still open (callback-1298 todo, 58-33 item 2(e) operator amendment / path=unknown, and any WR that fails D-09).
- **D-09:** A "fixed" claim (58 WR-01..WR-05, IN-01/02; 52 WR-03 first half) is closed only with **the fix located in current code (file:line) and a test that covers it**. If either is missing, the item stays open and gets a todo. Phases 61-79 may have rewritten or moved that code since.
- **D-10:** 52-UAT's ELEX 411300 Friends sign-out row closes as **superseded by Phase 54**, on attribution plus the current code path that shows no authenticated CM logon at launch. No live run. Cite code at clean HEAD. Phase 79 is replacing the steam-user path, so make the citation name the mechanism ("no authenticated CM at launch") as well as the file.
- **D-11:** If any closure turns out to need a live check, it becomes a **human UAT item in phase 78's own UAT**, and the phase is not verified until the operator runs it.
- **D-12:** 52 WR-03's optional second half (real display acknowledgement for the SteamStub notice) is recorded in 52's records as **not built, deferred**, with a pending todo (create one if none exists, with `severity:`/`platform:`/`ready:` per conventions). Not built here.
- **D-13:** Include the two stale code comments the audit groups with the stale records: `src/backend/storeManagers/steam/bridge/shimCoverage.ts:192-197` (still says Matchmaking/Networking are stubbed) and the `knownFixReport.ts:33-34` comment ("Plan 57-12 replaces the host"). Two files exist, `src/backend/knownFixReport.ts` and `src/common/knownFixReport.ts`, so find the one the audit means. Make them true against current code.
- **D-14:** 53-UAT's open substance (Unclaimed World 284100 old-SDK no HELLO; ELEX known-bad; Raft/Grim Dawn DRM-limited) is **recorded truthfully as current state** (open / known-bad, with the tracking todo linked), **not fixed**. No shim work in this phase.
- **D-15:** The records sweep is limited to **52, 53, 58**. Other phases' stale items stay in the v0.9 audit's tech-debt list.
- **D-16:** Do **both halves**: (a) bring ESLint under the 661 ceiling by **lowering warnings**, never raising the ceiling, and re-run cold first because a stale `.eslintcache-src` can disagree with CI; (b) give the later `lint.yml` steps the same `if: ${{ !cancelled() && steps.deps.outcome == 'success' }}` treatment that `Backend DI ceilings` got in quick 261114-2gg, and stop `.husky/pre-push` from masking in the same way. Un-masking may show ratchets that are already red. Those are in scope to get green under D-04. Move the todo to `completed/` when done.

### Claude's Discretion
- How the attribution in D-02 is done (log reading versus a real bisect), as long as each suite ends up with a named cause.
- Mechanism for the mocked-arch check in D-03 (process.arch / os.arch mock), chosen from what the test does.

### Deferred Ideas (OUT OF SCOPE)
- Stale items in other v0.9 phases (51 deferred-items, 56 WR-01/WR-02, 57 WR-09 and skipped WRs, 59 dead exports and WR-01-round6/WR-06): stay in the v0.9 audit's tech-debt list (D-15).
- 52 WR-03 SteamStub display acknowledgement: deferred via todo (D-12).
- 53-UAT open substance (Unclaimed World, ELEX, DRM titles): tracked by existing todos, not fixed here (D-14).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEBT-05 | Phases 52, 53 and 58 have current verification and UAT records | Sections "DEBT-05 findings" (D-06..D-15): exact file shapes, a per-item closure table for 58 WR-01..05/IN-01/02 and 52 WR-03, the D-10 code citation, and **four CONTEXT premises that current code/todos contradict** (D-08 callback-1298, D-12, D-14 x2) |
| DEBT-06 | `macArchKnownFixRouting` and the three sidecar suites pass | Section "DEBT-06 findings": 4/4 green at clean HEAD, targeted and inside the full run; arch-independence proof; commit attribution for all four; **12 other suites are red in the full run at clean HEAD** (decision needed) |
</phase_requirements>

## Summary

Both requirements are mostly proof-and-record work, but research found that several CONTEXT premises have gone stale since 2026-11-15's scout, and the planner must plan against current truth: (1) the four flagged suites are green at clean HEAD and inside a full `jest --maxWorkers=2 --silent` run, with a named cause for each (all four were fixed incidentally by other work, none by a dedicated fix); (2) the macArch test controls host arch by mocking `backend/constants/environment`, so it is host-independent by construction, and passes under simulated linux/x64, darwin/x64, linux/arm64 and win32/x64; (3) the lint workflow's ESLint step is **already green** at clean HEAD cold (src 952 of 1130, tests 573 of 661), and the four "masked" steps (Prettier, knip, boundaries, Steam line ceiling) all pass at clean HEAD, so D-16's un-masking will not surface red ratchets today; (4) `status: superseded` in a UAT `## Gaps` entry is read by no tool (audit-uat reads only `### N.` items and verification frontmatter, and only scans `.planning/phases/`, not the archived milestone dir), so it is safe with no vocabulary change.

The material surprises: the full test run at clean HEAD has **12 failing suites / 132 tests** (none of the four), identical in the main tree, so `pnpm test:ci` is red repo-wide today; D-08's "keep callback-1298" and D-12's "not built" and D-14's "Unclaimed World / ELEX open" are each contradicted by completed todos and code (callback-1298 closed 2026-11-06; the SteamStub notice code was deleted in 56-13 and a display ack was built for other bridge notices in 509bcb01b; both Unclaimed World and ELEX are lifted from `knownBad`, which is now `[]`); and 58 IN-01 and IN-02 are genuinely **not** fixed while WR-03 has only a weak test.

**Primary recommendation:** Plan DEBT-06 as "prove, attribute, record" (no code change expected for the four suites), plan D-16 as a CI/pre-push wiring change plus coordinated updates to four wiring tests, and plan DEBT-05 against the corrected closure table below; raise the four stale-premise items and the 12-red-suites question to the operator before locking plans.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Verification/UAT record edits | Repo docs (`.planning/milestones/v0.9-phases/`) | `planning-frontmatter-gate.py` (read-only parse) | Pure markdown; only frontmatter is machine-parsed |
| Suite attribution + clean-HEAD proof | Jest `Backend`/`Meta` projects | git worktree + bisect | Evidence is test output at specific commits |
| Stale code comments (D-13) | Node sidecar TS (`src/backend/...`) | — | Comment-only edits in two files |
| Lint un-masking (D-16b) | CI (`.github/workflows/lint.yml`) + local hook (`.husky/pre-push`) | `meta/__tests__/*Wiring.test.ts` | Four wiring tests pin the current hook/workflow text |
| Native helper fixes cited for 58 | C helper `native/steam-bridge/helper/bridge_helper.c` | TS `helperSpawn.ts`, `inviteBridge.ts` | Where the fixes live (read-only evidence here) |

## Standard Stack

No new packages. Everything is existing repo tooling. Versions below are what was observed in this session.

| Tool | Version | Purpose | Verified |
|------|---------|---------|----------|
| Jest | repo-pinned (`npx jest`) | four suites, full run; `Backend` / `Meta` / `Frontend` / `Relay` projects | [VERIFIED: ran it] |
| `pnpm test:ci` = `jest --maxWorkers=2 --silent` | package.json:47 | CI-equivalent full run | [VERIFIED: package.json] |
| `pnpm planning-gates` (12 gates) | `python3 meta/runPlanningGates.py` | proves record edits did not break ledger frontmatter | [VERIFIED: 12/12 pass at HEAD] |
| `node meta/lintScoped.cjs` | SRC_CEILING 1130, TESTS_CEILING 661 | ESLint ratchet (two scopes) | [VERIFIED: ran cold] |
| depcruise, knip, steamLineCeiling, backendDiCeilings, gameInfoNarrowingCeiling | repo scripts | the ratchet steps | [VERIFIED: ran] |
| gsd-sdk `query audit-uat` / `~/.claude/get-shit-done/bin/lib/uat.cjs` (1.42.3) | `~/.claude/get-shit-done/VERSION` = 1.42.3 | the only UAT parser on this machine | [VERIFIED: read source] |

**Package Legitimacy Audit:** not applicable. This phase installs no external packages (slopcheck not run, nothing to audit).

## Architecture Patterns

### Evidence flow for the phase

```
clean worktree @ HEAD ──► targeted jest (4 files) ─┐
        │                                            ├─► DEBT-06 proof + attribution table
        ├──► full jest --maxWorkers=2 --silent ─────┤
        └──► simulated-host jest (setupFiles) ──────┘
current code (file:line) ─► closure table ─► edit archived 52/53/58 records ─► pnpm planning-gates
lint.yml + .husky/pre-push + 4 wiring tests ─► un-mask edit ─► jest wiring tests + pnpm lint etc.
```

### Pattern 1: Clean-worktree proof (D-01)
`git worktree add --detach <scratch>/wt HEAD` triggers a repo post-checkout hook that clones `node_modules` and runs `download-helper-binaries`, so jest runs immediately with no manual build prep [VERIFIED: `ls wt/node_modules` populated at creation; `helperIntegration.test.ts` passed there]. Use `npx jest --runTestsByPath <files>`. **Do not** pass `--selectProjects Backend <paths>`: `--selectProjects` is variadic and swallowed the paths, running all 584 suites [VERIFIED: it happened]. Remove with `git worktree remove --force` + `git worktree prune`.

### Pattern 2: Host-simulation for the arch check (D-03)
Overriding `process.platform`/`process.arch` from an outer node wrapper does **not** reach jest's sandboxed `process` (it printed `darwin arm64`). A jest `--setupFiles` file does:

```js
// scratch/simsetup.js
Object.defineProperty(process, 'platform', { value: process.env.SIM_PLATFORM || 'linux', configurable: true })
Object.defineProperty(process, 'arch',     { value: process.env.SIM_ARCH     || 'x64',   configurable: true })
```
```bash
SIM_PLATFORM=linux SIM_ARCH=x64 npx jest --setupFiles /abs/simsetup.js --runTestsByPath src/backend/storeManagers/steam/__tests__/macArchKnownFixRouting.test.ts
```
Verified the override takes effect (`SIM linux x64` printed from a probe test) [VERIFIED]. Note `--setupFiles` on the CLI replaces any config-level setupFiles for that run; `jest.config.js` declares none, so no loss [VERIFIED: grep returned nothing].

### Pattern 3: Superseded gap entry shape (D-07)
Follow each file's own entry layout (see "D-07" finding). 52-UAT entries are YAML-ish with indented `  status:` lines; 53-UAT entries are one-line `- truth: ... status: failed. evidence: ... fix: ...`.

### Anti-Patterns to Avoid
- **Citing a SUMMARY/REVIEW-FIX as proof of a fix** (specifics section of CONTEXT): every closure below cites current code lines and a test.
- **Raising a ceiling to make a ratchet green** (D-16a, `lintScoped.cjs` header rule: "N-1 RED, N GREEN"). Lowering a ceiling to a freshly measured count is allowed by the file's own history (`63add37d1`).
- **Running whole-repo `prettier --check .` as a per-task verify**: CONVENTIONS say scope to exact paths.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Attribute a suite's red-to-green | A bespoke harness | `git bisect run` with an exit-code script | Done in this session; note term semantics below |
| Mock host arch | Edit the test's env mocks | `--setupFiles` simulation for the proof; the test's own `isAppleSiliconMac` mock for the behaviour | The test already controls arch itself |
| Check UAT parse safety | A new gate | `gsd-sdk query audit-uat --raw` + `pnpm planning-gates` | Both already exist |
| Hook behaviour test | Re-implement | Extend the existing stub-pnpm harness in `gameInfoNarrowingWiring.test.ts:125-200` | It already runs the real hook text against a fake `pnpm` |

**Bisect gotcha (measured):** with `--term-old=red --term-new=green`, a script `exit 0` means **old (red)** and non-zero (1) means **new (green)**; inverting this made bisect report a false "first green". Default good/bad semantics (exit 0 = good) are less error-prone. Checkout also re-runs the post-checkout hook (pnpm install), so add a short `sleep` and expect ~15 s per step.

## DEBT-06 findings

### Current state (clean HEAD `19b3cac2c`) [VERIFIED]
| Check | Result |
|-------|--------|
| 4 suites, targeted (`--runTestsByPath`) | 4/4 suites, 209/209 tests pass |
| 4 suites inside full `jest --maxWorkers=2 --silent` | none of the four appears in the FAIL list |
| macArch under simulated linux/x64, darwin/x64, linux/arm64, win32/x64 | 3/3 tests pass in every case |
| Full run totals | **12 suites failed, 5 skipped, 1025 passed; 132 tests failed, 21711 passed** (325 s) |

### D-03: how the test controls arch
`macArchKnownFixRouting.test.ts` mocks the whole `backend/constants/environment` module with a mutable double (`isWindows:false, isMac:true, isLinux:false, isAppleSiliconMac:true`, lines 65-72), resets `env().isMac = true; env().isAppleSiliconMac = true` in `beforeEach` (lines 250-251) and flips `env().isAppleSiliconMac = false` inside the Intel case (line 287). The real module derives `isAppleSiliconMac` from `process.arch`/`os.cpus()` (`src/backend/constants/environment.ts:36-38`) but the test never loads it, so **host arch is irrelevant**. CI is `ubuntu-latest` (`test.yml:20`) running `pnpm i18n` then `pnpm test:ci`. The simulated-host runs prove the same on this Mac. No test defect, so no D-04 fix is needed for D-03; recommend a one-line test comment is optional, not required. The real Linux proof arrives when CI runs; locally, only the simulation can be shown.

### D-02: attribution (git bisect, each step actually ran jest) [VERIFIED]
| Suite | Went red | Red at | Went green at | Cause |
|-------|----------|--------|---------------|-------|
| `macArchKnownFixRouting` "Intel: never seeds…" | `10dfe024d` quick 261105-ord (2026-11-05): InstallApp-first branch means `shell.openExternal('steam://install/63000')` is not reached; green at `1e6e50894` (11-02), red at parent of vfq `2cd7e1a34` | all of 11-05..11-11 sampled (`1c423224d`, `daa89b60b`, `831822d14`...) | `c3cdea41e` Phase 66.3-08 (2026-11-11) "Steam settings, bridge-bottle, depot and download-monitor modules on config slices"; test file unchanged, so the code/DI change made the setup deterministic | **quick 261105-vfq's "pre-existing" claim was TRUE**: the test fails at vfq's parent `2cd7e1a34` and at vfq's own tip `1c423224d`; vfq did not cause it. It was fixed incidentally, not by a fix aimed at it. The `[ASSUMED]` part: the precise mechanism by which 66.3-08 flipped the Intel case (reads of the experimental-InstallApp setting moved onto an injected slice) was not traced line by line |
| `installFlows` (Test 1b `listSteamLibraryTargets`... `.map` of undefined) | red at 54-03 (`3e8823f00`, 2026-10-27) | | `022de9cd2` 56-30 "pin installFlows backend/utils stubs across re-entrant mock factory runs" (2026-10-29) | a dedicated test fix: mock stubs were lost on re-entrant factory runs |
| `runnerSliceRegistration` (channel-count completeness, 67 vs 68) | red at `3e8823f00`, 2 failing tests | | `f118e0c81` quick 261029-nmt "declare mkz enrichment channels in the slice pin" (2026-10-29) | census pin updated for the added channels |
| `testContainment` (`addTestOnlyListener is not a function`, 1 failing) | red at `3e8823f00` | | `ca4cd8f2d` 56-30 "classify two new sidecar suites, update channel pin for getGamelibFixStatus" (2026-10-29) | channel-set containment pin updated |

So three of the four were fixed deliberately in Phase 56/quick 261029-nmt on 2026-10-29, i.e. **before** Phases 61-73; only macArch was fixed by a later refactor. Bisect reports the *first green*; for a possibly non-monotonic history that means "first sampled green", which is sufficient for naming a cause.

### Decision needed: 12 other suites are red in the full run [VERIFIED, identical in the main tree]
None are the four, so strictly DEBT-06 is met, but D-01 says the proof is "inside the full `pnpm test:ci` run" and CONTEXT's validation gate wants a green full suite. Failing suites, with first message:

| Suite | Failing | Apparent cause |
|-------|---------|----------------|
| `shimGenerate.test.ts` (24-CR-02) / `shimCoverage.test.ts` (SHIM_EXPORTED_SYMBOLS set-equals `steam_api.def`) | 1 + 1 | `SHIM_EXPORTED_SYMBOLS` lists `SteamAPI_SteamMatchmakingServers_v002` that the committed `.def` lacks (shim/coverage drift) |
| `ipcDomainCensus.test.ts` | 1 | total 291, test pins 297 (channels removed, likely Phase 79) |
| `flowRegistrationCensus.test.ts` | 3 | appShell/shellFiles register `send` counts differ from the table |
| `tauriShellSource.test.ts` | 4 | `rust_dispatch.rs` has 87 one-line arms, test pins 58 (e.g. new `steamcm_anon_close`); STATE.md already records this suite as "pre-existing" on 2026-11-08 |
| `epicOfflineMode.test.ts` (Test 6c) | 1 | `legendary/games.ts` now matches `/signInProbe/` |
| `themeTokens.test.ts` | 1 | `.is-link` render-site census 34 vs 29 |
| `gamelibCatalogParity.test.ts` | 48 | orphan key `steam.bridge.route.missingSymbols` in locale catalogs not in `en/gamelib.json`; `lintTranslations.test.ts` (2) has 624 unrecorded-key drift. Still red after running `pnpm i18n` in the worktree (it changed nothing), so not a parser-not-run artifact |
| `genI18nGateScope.test.ts` | 1 | committed `i18nForkTouchedFiles.json` stale vs live git derivation (listed pre-existing in Phase 54's deferred-items) |
| `callbackRegistryHost.test.ts` | 68 | C harness compile error (`unknown type name 'LONG'`) on this host; likely env-dependent (Windows types), `[ASSUMED]` |
| `x86CallbackWineHarness.test.ts` | 1 | needs Wine; expects slot 15 but sees `[2,6,10]`; env-dependent, `[ASSUMED]` |

**Recommendation:** do not silently absorb these into Phase 78. Ask the operator at plan time: (a) scope Phase 78 to "the four suites green in the full run, other reds recorded in a new todo", or (b) fold in a triage task. Several look owned by in-flight Phase 79 (census/arm counts) and will move again; Phase 78 should run after Phase 79's census pins settle, or re-measure at the end. If (a), the verification must say "full run: the four pass; N other suites red, see todo", not "full suite green".

### Validation commands (DEBT-06)
```bash
# in a clean worktree (see Pattern 1)
npx jest --runTestsByPath src/backend/storeManagers/steam/__tests__/macArchKnownFixRouting.test.ts src/backend/sidecar/__tests__/installFlows.test.ts src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts src/backend/sidecar/__tests__/testContainment.test.ts
npx jest --maxWorkers=2 --silent > full.log 2>&1; grep -E "^FAIL|^Tests:" full.log   # confirm none of the four in FAIL
SIM_PLATFORM=linux SIM_ARCH=x64 npx jest --setupFiles /abs/simsetup.js --runTestsByPath src/backend/storeManagers/steam/__tests__/macArchKnownFixRouting.test.ts
```

## DEBT-05 findings

### D-07: does `status: superseded` parse? [VERIFIED by reading both parsers and running the SDK]
- `~/.claude/get-shit-done/bin/lib/uat.cjs` (1.42.3, `cmdAuditUat` line 17 on) reads UAT files only through `parseUatItems` (regex on `### N. / expected: / result:` blocks, lines 189-211) and VERIFICATION files only when frontmatter `status` is `human_needed`/`gaps_found`. It never reads `## Gaps` entries. The SDK copy (`get-shit-done-cc/sdk/dist/query/uat.js`) is the same shape.
- Both scan **`.planning/phases/` only** (uat.cjs:17; uat.js:271-284); the archived `v0.9-phases/` files are not visited. `gsd-sdk query audit-uat --raw` returned zero results for phases 52/53/58 [VERIFIED].
- The only consumer of a gap `status:` is `~/.claude/get-shit-done/workflows/execute-phase.md:1271-1275` (gap-closure bookkeeping flips `failed` to `resolved`); it ignores other values. Existing gap statuses in the repo already include `accepted, closed, deferred, out-of-scope, not-a-defect, remediated, routed, partial, partially_fixed...` [VERIFIED: grep count], and `34.3-UAT.md` carries file-level `status: superseded` precedent.
- `planning-frontmatter-gate.py` parses archived ledgers' **frontmatter only** (156 ledgers walked, 0 failed). Do not change 52/53/58 frontmatter shape badly; the `## Gaps` body edits cannot affect it.
- gamelib-conventions' UAT-item rule governs `### N.` items (heading at column 0, inline `expected:`, `result:` opening with a status word). Gap entries are not items. No item in 52/53 needs reshaping for D-07. If a UAT item's `result:` line is edited, keep the leading status word.

**Conclusion:** `status: superseded` plus `superseded_by:` is valid; no gate vocabulary changes; no tool to update. Shapes:
- 52-UAT (indented YAML-ish): replace `  status: failed` with `  status: superseded` and add `  superseded_by: "<phase/plan/commit>"` on the next line (before `reason:`).
- 53-UAT (one-line entries, `status: failed.` inline): replace with `status: superseded. superseded_by: <pointer>.` inline.

### Superseded pointers found (use as `superseded_by:` content) [VERIFIED from files/todos/code]
**52-UAT gaps (lines 378-447):**
| Gap | Overtaken by |
|-----|--------------|
| withhold guard preempts forwarding / silent withheld failure / false launch-log claim / stale shim (gaps 1-4) | 52-13..52-16 (52-VERIFICATION "gaps_closed_round1") |
| Grim Dawn main menu via forwarder, items 9/10/23/24/27-29 | done-when amended 2026-10-24 at 52-32 (item 29, class O1); deferred; todo `2026-10-24-steamstub-launch-check-static-re-decision` is now in `todos/completed/` ("won't-do stands", spike 041). The forwarder itself was **deleted in Phase 56-13 (`f8a00423a`, 2026-10-28)** |
| ELEX Friends sign-out | Phase 54 (todo `todos/completed/2026-10-24-friends-sign-out-steam-user-logon.md` closed 2026-10-28/29, `54-UAT.md` items 1-4); see D-10 below |
| skipped re-gate items 17-19 | same amendment |
| item 30 notice | already `resolved` by 52-36/52-37 |

**53-UAT gaps (lines 191-199; 8 entries) and what overtook them:**
| Gap entry | Overtaken by |
|-----------|--------------|
| Unity titles `SteamAPI_Init` (items 1,2,4) | 53-16 (2026-10-25), items 18-21 census `verified`; todo `2026-10-23-bridge-shim-lacks-steamworks-flat-api...` in `completed/` |
| Overlooting 3410180 | quick 261026-rqb; item 36 verified (53-VERIFICATION `retired_overrides`) |
| Ranch Simulator 1119730 | routed to DRM mode by 56-26 (todo `2026-10-28-ranch-simulator-not-routed-to-drm-mode` closed by 56-26); 53-VERIFICATION still carries it as a `status: failed` gap under an override |
| Abiotic Factor 427410 | Phase 55 live gate run 1 PASS (todo in `completed/`) |
| census log discovery (item 13) | `meta/bridgeCensus.ts` (53-VERIFICATION lists 427410 verified); `[ASSUMED]` that the backup/prev-log skip fix is the cause, planner should confirm with `grep -n "backup\|-prev" meta/bridgeCensus.ts` |
| SteamStub DRM titles (Raft/Grim Dawn) | Phase 56 DRM mode (`drm-bottle-stage`), 53 intentionally "DRM-limited" |
| ELEX 411300 | quick 261027-jgs/k51 (UserStatsReceived 1101 forwarded); **lifted from knownBad into `seed`**, main menu 529 s (`bridge-allowlist.json`, `allowlist.ts:25`) |
| Unclaimed World 284100 | quick 261025-t7i (InitSafe exports) + n77 (gst-libav overlay); main menu confirmed 2026-10-27 (todo `completed/...wmv...` "Resolution (2026-10-27)") |
| Avernum 6 `unverified` | D-53-15 init-only rule implemented (53-VERIFICATION gaps_closed) |

### D-14 premise is stale (planner: raise to operator) [VERIFIED]
`src/backend/storeManagers/steam/bridge/bridge-allowlist.json` has `knownBad: []`. `allowlist.ts:25` states Unclaimed World 284100 and ELEX 411300 were lifted. CONTEXT D-14 asks to record them as "open / known-bad, with the tracking todo linked". The truthful current state is **resolved/lifted**; there is no open todo for either (their todos are in `completed/`). Only Raft/Grim Dawn "DRM-limited" remain, and those are now owned by Phase 56's DRM mode, not a 53 gap. Recommend recording current truth ("lifted by quick X, see todo in completed/") and noting D-14's intent (do not fix, do not do shim work) is unaffected.

### D-06: `52-VERIFICATION.md` structure [VERIFIED: grep of headings]
293 lines. Frontmatter (lines 1-61) is `status: passed`, `score: 7/7 ... (against the amended done-when)`, with `re_verification.gap_closure_4`. The body is **four stacked reports, oldest first**:
- lines 62-123: `# ...Verification Report (re-verification)` dated 2026-10-24, `**Status:** gaps_found` (the stale one)
- 125-178: `# Re-verification 2` (gaps_found), 180-235: `# Re-verification 3` (gaps_found)
- 237-293: `# Re-verification 4 ... (amended done-when)`, **`passed` 7/7 (current)**.
So D-06 is a re-ordering: put the RV4 content (lines 237-293, retitled as the current report) first, then a dated `## Superseded report (2026-10-24)` heading containing lines 62-235 (demote their `#` headings to `###`/`####` so there is one H1). Add current-truth facts RV4 predates: the forwarder was deleted in 56-13 (so artifact/path citations in the old text are historical), the "Known open items" paths point at `todos/pending/` but those todos are now in `todos/completed/` (notification-authorization closed 2026-10-26 live gate; static-RE decision won't-do; friends sign-out closed by Phase 54). The frontmatter field `gaps: [] # superseded by gap_closure_4` and `prior_gaps_history` should stay as is (they agree with the new body).

`53-VERIFICATION.md` has the same shape problem: frontmatter `status: passed` while the body header says `**Status:** gaps_found (...)`, and frontmatter `gaps:` still lists Ranch as `status: failed` under an accepted override. CONTEXT lists 53-VERIFICATION as a record to correct; scope it the same way (current-first body, history kept).

### D-09 closure table: 58 WR/IN items and 52 WR-03 [VERIFIED at HEAD; all four bridge test files pass: 131/131]
| Item | Fix in current code | Test covering it | Verdict |
|------|---------------------|------------------|---------|
| 58 WR-01 (invite-dialog log cap) | `bridge_helper.c:2376-2379` (fires when `!g_invite_dialog_logged \|\| now - g_invite_last_log_ms >= GL_INVITE_DIALOG_LOG_GAP_MS`; `GL_INVITE_DIALOG_LOG_MAX` gone; `g_invite_dialog_logged` is now a 0/1 flag at :2314) | `helperNetHarness.test.ts:232-244` asserts 41 `INVITE dialog` lines | CLOSED. Commits `3c76c1cf5`, `e2ac4e8a5` |
| 58 WR-02 (pre-auth slot exhaustion) | `bridge_helper.c:305` (`GL_AUTH_DEADLINE_SECONDS`), `:3036` `acceptedSec`, `:3124` deadline close, `:3173-3186` evict-oldest-unauthenticated, `:3198` | `helperIntegration.test.ts:2135` (eviction) and `:2156` (all-authenticated cap) | CLOSED. `98aa57699` |
| 58 WR-03 (blocking send) | `bridge_helper.c:313` `GL_SEND_TIMEOUT_USEC 250000`, `:3156-3157` `SO_SNDTIMEO`, `:3165-3166` `SO_SNDBUF` | **weak**: `helperIntegration.test.ts:2201-2214` only asserts the source contains `SO_SNDTIMEO` (it does not pin 250 ms or SNDBUF, nor test a stalled reader). 58-REVIEW-FIX itself says "No automated test reproduces a stalled reader" and rests on a live session-continuity check | **Fails D-09 strictly (no covering test).** Options: (i) keep open + todo (the strict reading), or (ii) add a two-line source pin for `GL_SEND_TIMEOUT_USEC 250000` and `SO_SNDBUF` to that test (cheap, `ready: code`). Planner/operator choice; I recommend (ii) because it is the smallest honest closure, plus keep the live-verified note |
| 58 WR-04 (stale ordinal) | `bridge_helper.c:2320-2327` generation token with `_Static_assert`, `:2481` `GL_INVITE_BAD_ORDINAL`, `:2503` | `helperNetHarness.test.ts:313-323` ("stale snapshot token", `stale=-3 bare=-3 current=1`) | CLOSED. `56f46ff7a` |
| 58 WR-05 (unanchored regex) | **moved**: `src/backend/storeManagers/steam/bridge/helperSpawn.ts:49` `INVITE_DIALOG_LINE = /^\[[^\]]*\] INVITE +dialog appid=(\d+)\r?$/`, used at `:216` (was `helperProcess.ts`) | `helperSpawn.test.ts:286-302` ("the text embedded inside another line does nothing") | CLOSED. `0453435c9` (file renamed later, `d872dea92`-era refactors) |
| 58 IN-01 (`socket.once('error')`) | **NOT fixed**: `inviteBridge.ts:63` is still `socket.once('error', () => finish(null))` (`helperSpawn.ts:186` is a different probe socket) | none | **OPEN** (58-REVIEW-FIX declared IN-01/02 out of scope; the 58 follow_ups wrongly bundle them as if fixed). Needs a todo (D-09) |
| 58 IN-02 (stale comment) | **NOT fixed**: `bridge_helper.c:2299` still says "one accept loop, see main"; the loop is `gl_serve_forever` (`:3107`, called `:3395`) | n/a (comment) | **OPEN**, comment-only |
| 52 WR-03 first half (log not proof of display) | **the function no longer exists**: `maybeNotifySteamStubForwarded` and the whole Phase 52 forwarder were removed in `f8a00423a` (56-13, 2026-10-28). The successor pattern is `gameLaunch.ts:373-405` (`maybeNotifyDrmModeFailed`) and `:425-446` (`showEngineDialog`), which log `dialog-frame-sent=${...} display=pending` | `games.test.ts:13207` asserts the `[bridge-notice] ... dialog-frame-sent=` line; `displayAck.test.ts` | Record as **moot / superseded by removal**, not "fixed" |

### D-12 premise is stale [VERIFIED]
CONTEXT says the SteamStub display acknowledgement is "not built, deferred, with a pending todo". At HEAD: (1) the SteamStub forwarder notice code is gone (56-13); (2) a real display ack **was built** in `509bcb01b` (2026-10-29): `src/backend/dialog/displayAck.ts`, `ackId` on `showDialogBoxModalAuto` (dialog.ts:53-64, returns boolean), renderer `ackWhenVisible.ts`, logging `display=confirmed elapsedMs=N` / `display=unconfirmed timeout=15000`, live-verified 69/81 ms on Grim Dawn; (3) its todo `2026-10-28-bridge-notice-dialog-display-unconfirmed.md` is closed (completed/, G10 confirmed in 56-26). It covers DRM-mode and engine notices, not a SteamStub forwarder notice, because that notice no longer exists. Recommendation: record in 52's records "second half built later for the successor notices (509bcb01b), original SteamStub notice removed in 56-13", and **create no todo** (a todo for a feature on deleted code would itself be false). If the operator still wants D-12 literally, it contradicts the code; flag it.

### D-08: 58-VERIFICATION `follow_ups` (frontmatter lines 18-22) disposition
1. WR-01 picker cap: **drop**, "closed by 58-REVIEW-FIX 3c76c1cf5 / e2ac4e8a5".
2. WR-02..WR-05: WR-02/04/05 **drop** with commits `98aa57699`/`56f46ff7a`/`0453435c9`; WR-03 per the table above (keep or drop depending on the test decision); IN-01 and IN-02 **keep** (open).
3. callback-1298 todo: **CONTEXT says keep; it is wrong**: `todos/completed/2026-11-01-callback-1298-on-bridge-join-path.md` has `## Closed 2026-11-06 (safe to drop for Schedule I)` (decision: keep dropping 1298; DLL blob count 0). Drop it with that pointer; the reopen trigger lives in the todo.
4. 58-33 item 2(e) operator amendment / path=unknown: **keep** (genuinely open).
Also update the body/path references; `58-REVIEW-FIX.md` has `status: all_fixed` and needs no edit except possibly noting IN-01/02 were out of its scope (already stated line 24).

### D-10: citation for "no authenticated CM logon at launch" [VERIFIED at HEAD]
Mechanism sentence: *Play resolves the launch target and platform flags from an anonymous CM session (the Rust anon actor), and only ever reuses an authenticated session that is already open; it never opens one, so Mac Steam's Friends session cannot be signed out by Play.* Evidence at HEAD:
- `src/backend/storeManagers/steam/gameLaunch.ts:84-` `launch()` calls `ensurePlatformsCaptured()` (`gameEligibility.ts:212`) and the bridge launch path, no lease acquire.
- `src/backend/storeManagers/steam/anonymousClient.ts:1-10`: header "anonymous CM client ... Phase 79 ... Rust anon actor (`steamcm_anon_*`) ... can never sign Mac Steam's Friends session out, needs no go-offline wrap ... imports neither the authenticated user module nor the token store".
- `src/backend/storeManagers/steam/bridge/launchTarget.ts:10-16`: lookup is anonymous first and "never logs on, so Play cannot sign Mac Steam's Friends session out"; fallback is `acquireOpenAuthenticated` (`:231`).
- `src/backend/storeManagers/steam/user.ts:261-270` `acquireOpenAuthenticated`: "A lease on a session that is ALREADY open, or null. Never reads the keyring and never logs on: launch-path consumers use it so they can reuse an install's session but can never open one." `AuthSessionReason` (`userTypes.ts:8-16`) has no launch reason.
- **Test**: `src/backend/__tests__/steamAuthSessionPolicy.test.ts` Rule G (`:231-237`) over `LAUNCH_PATH` (`:101-107`: `installLocation.ts`, `bridge/launchTarget.ts`, `platformCapture.ts`, `anonymousClient.ts`, `authTrigger.ts`) forbids `acquireAuthenticated(`/`ensureConnected(`; Rule E/F (`:207-222`) allow-lists every `acquireAuthenticated`/`acquireOpenAuthenticated` caller; Rules A/B/H assert no steam-user logOn or client exists (79-39). This test is the "covers it" half of D-09 and survives the Phase 79 swap because it already encodes the Rust-session names.
- Attribution: Phase 54 ROADMAP SC3 (the file's header), `54-UAT.md` items 1-4 (0 authenticated logons, operator Friends signed in), the completed todo (`2026-10-24-friends-sign-out-steam-user-logon.md`, closed 2026-10-28).
52's own wording said the candidates were "GameLib's steam-user logon on Play" and "the helper's SteamAPI_Init against the Mac client"; Phase 54 removed the first; 52-19 arms (c)/(d) already cleared the second. No live run needed.

### D-13: the two stale comments [VERIFIED]
- **`src/backend/knownFixReport.ts` carries the "Plan 57-12" comment** (now lines 32-33, not 33-34): `// Plan 57-12 replaces the host with the deployed URL after the operator checkpoint, and adds a test that the sentinel is gone.` `src/common/knownFixReport.ts` does not. It is stale: `GAMELIB_FIX_RELAY_URL` is the deployed `https://gamelib-fix-relay.gamelib.workers.dev/v1/reports` (line 35-36), and the sentinel-gone test exists (`__tests__/knownFixReportUrl.test.ts:8`, from `2ed7d15ef` feat(57-12)). **Keep** `RELAY_URL_PENDING_SENTINEL` (still a live guard at `knownFixReport.ts:167-173`, and imported by two tests). New comment should say the sentinel is retained only as a fail-closed guard (a relay URL containing it sends nothing), the deployed URL is set, and `knownFixReportUrl.test.ts` pins that it is gone.
- **`shimCoverage.ts`**: the block the audit cites as 192-197 is now **lines 204-209** (an x86-first manifest entry group) and a second copy at **~270-276** ("The three shared stub manifests (51-14)... P2P join stays out of scope, 24-SPEC"). Both say Matchmaking/Networking are stubbed/unavailable. Truth at HEAD: `SteamMatchMaking009` is `wire` (D-07 / 58-12, lines 217/281); `SteamMatchMakingServers002` is `stub` (220/284); `SteamNetworking005` is `stub` (222/286); `SteamNetworking006` is `wire` (D-07/58-13, :297); `SteamMatchMakingServers003` is `wire` (58-21, :305); `SteamNetworkingSockets012/013` are `wire` (58-15/58-18, :317-325). So the comment should say: lobbies (Matchmaking009) are wired; only the older server-browser (`MatchMakingServers002`) and legacy `Networking005` manifests, and RemoteStorage, remain stubs; P2P join is no longer out of scope (Phase 58). Locate by text, not by line number: lines drift (they already did once). `shimCoverage.test.ts` currently fails for an unrelated reason (def mismatch above); a comment-only edit will not change it.
Both files are prettier-checked (see Validation).

### Todos
- **Do not create a D-12 todo** (premise stale). If IN-01, IN-02 (and WR-03 if option (i)) stay open, create **one** todo per D-09 (or a single grouped one) with frontmatter in this exact order and bare lowercase values: `severity: minor`, `platform: macos`, `ready: code` (vocabulary: severity critical|major|medium|minor; ready code|live-gate|human|blocked) [VERIFIED: todo-frontmatter-gate.py:28-33]. The `/gsd-add-todo` template omits these; add by hand; verify with `pnpm planning-gates`.
- Folded lint todo `2026-11-14-lint-workflow-red-masks-ratchet-steps.md` moves to `completed/` (`git mv`; keep frontmatter).

### Validation commands (DEBT-05)
```bash
pnpm planning-gates            # 12/12 incl. frontmatter + todo gates (baseline: 12/12 at HEAD)
python3 .planning/planning-frontmatter-gate.py   # ledgers: 156 walked, 0 failed at HEAD
gsd-sdk query audit-uat --raw | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['summary'])"   # baseline 10 files / 24 items, parse unaffected (archive not scanned)
grep -n "status: failed" .planning/milestones/v0.9-phases/52-*/52-UAT.md .planning/milestones/v0.9-phases/53-*/53-UAT.md   # confirm only intended entries remain failed
grep -c "gaps_found" .planning/milestones/v0.9-phases/52-*/52-VERIFICATION.md   # 'gaps_found' only under the Superseded heading
npx jest --runTestsByPath src/backend/storeManagers/steam/bridge/__tests__/helperNetHarness.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperSpawn.test.ts src/backend/storeManagers/steam/bridge/__tests__/inviteBridge.test.ts src/backend/__tests__/steamAuthSessionPolicy.test.ts   # the closure tests (131 + policy)
```

## D-16 findings: lint workflow and hook

### Current lint state at clean HEAD, cold (no `.eslintcache-*`) [VERIFIED: `node meta/lintScoped.cjs`, 67 s]
| Scope | Ceiling | Measured | Result |
|-------|---------|----------|--------|
| production (`--src`) | `SRC_CEILING = 1130` | **952** warnings, 0 errors | PASS |
| tests (`--tests`) | `TESTS_CEILING = 661` | **573** warnings, 0 errors | PASS |
The "661" in CONTEXT is the **tests** ceiling. The red is confirmed at `a58e3e3e8` (tests 673 > 661, ran cold in a worktree) and was cleared since by `0a09ba886`/`45bf78590` (quick 261114-2tv) and `e6172b935`/`0ba954760` (79-38 "clear the test-scope lint warnings that pushed the ceiling over"). So D-16a is **already satisfied at HEAD**; the work is to re-measure cold at execution time, and optionally lower the ceilings to the measured counts to lock in the headroom (src 1130→952, tests 661→573). Lowering is permitted by `lintScoped.cjs` history (`63add37d1`) and consistent with "never raise"; it is Claude's/planner's discretion and should be done last, re-measured, with an N-1-red check. Top contributors if more reduction is wanted: production `import-x/no-named-as-default-member` 218, `require-await` 150, `no-floating-promises` 125 (`gog/library.ts` 58, `gog/games.ts` 29, `steam/gameLaunch.ts` 24); tests `require-await` 275, `unbound-method` 182 (`steam/__tests__/games.test.ts` 40, `bridgeBottleLifecycle.test.ts` 22).

### Masked steps at clean HEAD [VERIFIED: ran each]
| Step | Command | Result |
|------|---------|--------|
| Prettier | `pnpm prettier` | exit 0, clean |
| Find dead code | `pnpm find-deadcode` | PASS (339 baselined findings) |
| Module boundaries | `pnpm boundaries` | no violations (1344 modules) |
| Steam file line ceiling | `pnpm steam-line-ceiling` | PASS (191 files, 0 over 1000) |
| Backend DI ceilings | `pnpm backend-di-ceilings` | PASS |
So un-masking exposes nothing red today (Phase 79/80 may change this; re-run at execution).

### `lint.yml` structure [VERIFIED: read]
Steps in order: `deps` (install-deps, `id: deps`), `Lint code.` (`pnpm lint`), `Prettier code.`, `Find dead code`, `Module boundaries`, `Steam file line ceiling`, then `Backend DI ceilings` and `GameInfo narrowing ceiling`, each with `if: ${{ !cancelled() && steps.deps.outcome == 'success' }}` (the 261114-2gg / 70-17 template, with its explanatory comment block). D-16b = add that exact `if:` to `Prettier code.`, `Find dead code`, `Module boundaries`, `Steam file line ceiling` (keep a short comment per step or one shared comment). **`Lint code.` keeps no `if`** (it is first; the job should still fail when it fails). Pin tests: `backendDiCeilingsWiring.test.ts:72-98` (`gateUnmasked`, near-miss) and `gameInfoNarrowingWiring.test.ts:72-96` already model this; add the same `gateUnmasked`-style assertions for the four newly guarded steps (a helper `gateUnmasked(steps)` exists in `backendDiCeilingsWiring.test.ts`; reuse or lift it).

### `.husky/pre-push` [VERIFIED: read + tests]
Line 2 is `pnpm codecheck && pnpm lint && pnpm prettier && pnpm i18n --fail-on-update && pnpm find-deadcode && pnpm boundaries && pnpm steam-line-ceiling && pnpm backend-di-ceilings`; `chain_status=$?`; `pnpm gameinfo-narrowing-ceiling` runs on its own line with its own status; the two combine into `checks_status`. The graphify refresh runs only when `checks_status` is 0.
**Hard constraints from existing tests that D-16b must update in the same commit:**
- `steamLineCeilingWiring.test.ts:65-70` requires line 2 to contain `pnpm boundaries && pnpm steam-line-ceiling`.
- `backendDiCeilingsWiring.test.ts:100-106` requires `pnpm steam-line-ceiling && pnpm backend-di-ceilings`.
- `boundaryWiring.test.ts:59-63` requires line 2 to contain `pnpm boundaries`; line 1 shebang.
- `gameInfoNarrowingWiring.test.ts:102-123` requires line 2 not to contain the narrowing step and `pnpm gameinfo-narrowing-ceiling` on its own line, and its stub-pnpm behaviour tests (`:125-200`, `EXPECTED_ORDER` at `:111-121`) assert that **a red `lint` does NOT run `prettier`** (`expect(r.log).not.toContain('prettier')`, `:174-178`): the current masking is pinned as intended behaviour. That test must be inverted to "a red lint still runs prettier, find-deadcode, boundaries, steam-line-ceiling and fails the push".
- `meta/__tests__/tsconfigMeta.test.ts:94` cites `.husky/pre-push:2` for `pnpm codecheck` only in a comment; keep `codecheck` on line 2.
Least-invasive shape: keep line 2 for the hard prerequisites that gate everything (`pnpm codecheck && pnpm lint`? no: lint must not gate the others, so **only `pnpm codecheck`** is a sensible hard prerequisite, `[ASSUMED]` since a failing typecheck is a different class of error), then run each of `lint, prettier, i18n --fail-on-update, find-deadcode, boundaries, steam-line-ceiling, backend-di-ceilings, gameinfo-narrowing-ceiling` capturing each status into an accumulator (`rc=0; pnpm x || rc=1`), keeping the hook errexit-free and exiting nonzero if any failed. Update the four wiring tests to assert order (via the existing `EXPECTED_ORDER` log) and non-masking behaviour instead of `&&` substrings. This is a plan-level design decision; the constraint list above is the research fact.

### Validation commands (D-16)
```bash
node meta/lintScoped.cjs           # run cold: rm -f .eslintcache-src .eslintcache-tests first; expect production: PASS | tests: PASS
npx jest --runTestsByPath meta/__tests__/backendDiCeilingsWiring.test.ts meta/__tests__/gameInfoNarrowingWiring.test.ts meta/__tests__/steamLineCeilingWiring.test.ts meta/__tests__/boundaryWiring.test.ts meta/__tests__/tsconfigMeta.test.ts
pnpm prettier && pnpm find-deadcode && pnpm boundaries && pnpm steam-line-ceiling && pnpm backend-di-ceilings && pnpm gameinfo-narrowing-ceiling
npx prettier --check .github/workflows/lint.yml meta/__tests__/backendDiCeilingsWiring.test.ts meta/__tests__/gameInfoNarrowingWiring.test.ts meta/__tests__/steamLineCeilingWiring.test.ts meta/__tests__/boundaryWiring.test.ts
```

## Common Pitfalls

### Pitfall 1: Trusting CONTEXT's premises over current code
**What goes wrong:** Recording Unclaimed World/ELEX as "known-bad", the SteamStub ack as "not built", callback-1298 as "open" writes false records into the very files meant to be truthful.
**How to avoid:** Use the stale-premise table in this document; confirm each with the cited file before editing.
**Warning signs:** A todo path in a record that 404s because the todo moved to `completed/`.

### Pitfall 2: Line numbers drift
`shimCoverage.ts:192-197` is now 204-209; `knownFixReport.ts:33-34` is 32-33; `helperProcess.ts` WR-05 moved to `helperSpawn.ts`. **Locate by text**, record file:line at edit time.

### Pitfall 3: Running tests with the wrong flags / in the wrong tree
`--selectProjects Backend <paths>` runs everything; use `--runTestsByPath`. Do all D-01 runs in a clean worktree: the main tree carries Phase 79/76 WIP and its HEAD moves.

### Pitfall 4: Changing the hook without its four wiring tests
Edits to `.husky/pre-push` line 2 or the `lint.yml` steps fail four meta tests (substring pins, plus an explicit "lint red does not run prettier" assertion). Edit them together.

### Pitfall 5: `.planning/` markdown and prettier
All `.planning/**` is in `.prettierignore` ("Tooling/agent state and planning artifacts"): `npx prettier --file-info` returns `{"ignored":true}` for every record file to be edited (52-VERIFICATION, 52-UAT, 52-REVIEW-FIX, 53-UAT, 53-VERIFICATION, 58-VERIFICATION, 58-REVIEW-FIX, the lint todo, and 78-UAT/78-RESEARCH). Per the convention, **omit the prettier check for those paths and say so**, never carry a green that proves nothing. `.husky/pre-push` and `native/steam-bridge/helper/bridge_helper.c` have no inferred parser (`ignored:false, inferredParser:null`), so also omit. Do check: `.github/workflows/lint.yml` (yaml), `shimCoverage.ts`, `knownFixReport.ts`, `inviteBridge.ts` (if IN-01 is fixed), and the wiring tests (typescript) with `npx prettier --check <exact paths>` [VERIFIED: `--file-info`; `lint.yml` currently passes].

### Pitfall 6: Concurrent Phase 76/79/80 work
Commits land during planning (HEAD moved twice). Re-measure counts (lint, census suites) at execution and compare against this document's numbers.

## Code Examples

### Superseded gap entry, 52-UAT shape
```yaml
- truth: "Launching ELEX (411300) through the bridge leaves the user's Mac Steam session (Friends) signed in"
  status: superseded
  superseded_by: "Phase 54 (no authenticated CM logon at launch): steamAuthSessionPolicy.test.ts Rule G; 54-UAT items 1-4; todos/completed/2026-10-24-friends-sign-out-steam-user-logon.md"
  reason: "..."   # original text kept unchanged
```
### 53-UAT one-line shape
`- truth: ... status: superseded. superseded_by: 53-16 census items 18-21 (2026-10-25). evidence: ... fix: ...`

### lint.yml un-masking (template is the existing step)
```yaml
      - name: Prettier code.
        if: ${{ !cancelled() && steps.deps.outcome == 'success' }}
        run: pnpm prettier
```
(repeat for `Find dead code`, `Module boundaries`, `Steam file line ceiling`)

## State of the Art

| Old record | Current truth | Source |
|-----------|---------------|--------|
| 52 forwarder + `maybeNotifySteamStubForwarded` | deleted | `f8a00423a` (56-13, D-14 there) |
| Friends sign-out on Play (steam-user logon) | no authenticated CM at launch; Rust anon actor | Phase 54, Phase 79 (`anonymousClient.ts`) |
| ELEX / Unclaimed World `knownBad` | lifted, `knownBad: []` | quicks 261027-k51 / n77 |
| steam-user in `launch()` path | none; `steam-user` retired in Phase 79 | CLAUDE.md, `steamAuthSessionPolicy.test.ts` Rules A/B/H |
| `parseUatItems` / audit-uat reading `## Gaps` | never read; only `### N.` items and verification `status` | `uat.cjs:17-211` |

## Runtime State Inventory

Not a rename/migration phase. Nothing stored/registered carries a renamed string. One-line category check: **Stored data** none; **Live service config** none; **OS-registered state** none; **Secrets/env** none; **Build artifacts** the temporary worktrees were removed (`git worktree list` shows only the two pre-existing `.claude/worktrees/*`).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node / npx / pnpm | all runs | yes | repo toolchain | — |
| git worktree (+ post-checkout hook cloning node_modules) | D-01 | yes | — | manual `pnpm install` |
| Linux runner | D-03 "CI's Linux runner" | no (macOS host) | — | simulated host (`--setupFiles`) now; real proof from the next CI run |
| Wine / mingw (Windows C types) | `x86CallbackWineHarness`, `callbackRegistryHost` | no / not on this host `[ASSUMED]` | — | out of Phase 78's four; record |
| `~/.claude/gsd-core` | the conventions skill mentions it | **absent** (only `~/.claude/get-shit-done` 1.42.3 exists) | — | use the 1.42.3 sources read above |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (projects `Backend`, `Meta`, `Frontend`, `Relay`) |
| Config file | `jest.config.js` |
| Quick run command | `npx jest --runTestsByPath <files>` |
| Full suite command | `pnpm test:ci` (= `jest --maxWorkers=2 --silent`) |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEBT-06 | four suites pass, clean HEAD, targeted | suite run | `npx jest --runTestsByPath src/backend/storeManagers/steam/__tests__/macArchKnownFixRouting.test.ts src/backend/sidecar/__tests__/installFlows.test.ts src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts src/backend/sidecar/__tests__/testContainment.test.ts` | yes |
| DEBT-06 | four pass inside full run (no order dependence) | full run | `pnpm test:ci` then `grep -E "^FAIL"` excludes the four | yes |
| DEBT-06 | macArch Intel case host-independent | simulated host | `SIM_PLATFORM=linux SIM_ARCH=x64 npx jest --setupFiles <abs>/simsetup.js --runTestsByPath .../macArchKnownFixRouting.test.ts` | simsetup.js is a scratch file created per run (not committed) |
| DEBT-06 (D-16) | lint under ceilings, cold | ratchet | `rm -f .eslintcache-src .eslintcache-tests; node meta/lintScoped.cjs` | yes |
| DEBT-06 (D-16b) | CI steps unmasked | wiring | extend `meta/__tests__/*Wiring.test.ts` (see D-16 findings) | ❌ Wave 0: new `gateUnmasked` cases for four steps |
| DEBT-06 (D-16b) | pre-push does not mask | behaviour | `gameInfoNarrowingWiring.test.ts` stub-pnpm harness, inverted assertion | partially (needs edit) |
| DEBT-05 | ledger frontmatter intact | gate | `pnpm planning-gates` | yes |
| DEBT-05 | 52-VERIFICATION body matches `passed` | grep | `grep -n "^\*\*Status:\*\*" 52-VERIFICATION.md` shows current `passed` first | n/a |
| DEBT-05 | 58 closures covered | suites | the closure-test command in "Validation commands (DEBT-05)" | yes |
| DEBT-05 (D-10) | no auth logon at launch | source gate | `npx jest --runTestsByPath src/backend/__tests__/steamAuthSessionPolicy.test.ts` | yes |

### Sampling Rate
- **Per task commit:** the targeted command for that task plus `pnpm planning-gates` for record edits; scoped `prettier --check` only for non-ignored code/YAML paths.
- **Per wave merge:** the four suites targeted + wiring tests.
- **Phase gate:** clean-worktree full `pnpm test:ci` (the four pass; record the count of other reds), `node meta/lintScoped.cjs` cold, all ratchet scripts, `pnpm planning-gates`.

### Wave 0 Gaps
- [ ] `meta/__tests__/{backendDiCeilings,gameInfoNarrowing,steamLineCeiling,boundary}Wiring.test.ts`: update the line-2 substring pins and the "red lint does not run prettier" assertion; add unmasked-step assertions for Prettier, Find dead code, Module boundaries, Steam file line ceiling.
- [ ] Optional: strengthen `helperIntegration.test.ts:2201-2214` with `GL_SEND_TIMEOUT_USEC 250000` / `SO_SNDBUF` pins (58 WR-03).
- [ ] A 78-UAT only if D-11 triggers a live check (none identified: every closure here is code- or log-provable).

## Security Domain

`security_enforcement` is not set to false in `.planning/config.json` (absent, treated enabled). This phase edits docs, comments, CI YAML and a git hook; no auth, crypto, input or network surface changes.

| ASVS Category | Applies | Control |
|---------------|---------|---------|
| V2/V3/V4 Auth/Session/Access | no | none changed (D-10 only *cites* the existing no-auth-at-launch invariant) |
| V5 Input Validation | no | — |
| V6 Cryptography | no | — |
| V14 Config/CI integrity | yes | workflow edits must keep `permissions: contents: read`; `if:` expressions are the existing, reviewed template; do not widen triggers |

| Pattern | STRIDE | Mitigation |
|---------|--------|-----------|
| CI step silently skipped hides drift (the very defect) | Tampering/Repudiation | `if: ${{ !cancelled() && steps.deps.outcome == 'success' }}` on every ratchet; keep a failed install skipping them |
| Spawning children in tests (hook behaviour harness) | Elevation | use `createFakeHomeProfile()` as the existing harness does (convention row 2) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 66.3-08 turned macArch green via the injected config-slice change to the experimental-InstallApp setting read (mechanism not traced line by line; the commit/first-green is verified) | DEBT-06 attribution | Low: attribution names the commit; only the "why" is inferred |
| A2 | `callbackRegistryHost` and `x86CallbackWineHarness` reds are host/env-dependent (missing Windows C types / Wine), not code defects | 12 red suites | Medium: if real, they belong to the triage decision |
| A3 | The `bridgeCensus.ts` backup/prev-log skip fix is what overtook 53-UAT gap "census log discovery" | 53 pointers | Low: planner should confirm with one grep |
| A4 | `pnpm codecheck` should be the only hard prerequisite in a non-masking pre-push | D-16 | Low: a design choice for the planner, not a fact |
| A5 | Lowering lint ceilings to measured counts is acceptable (consistent with `63add37d1`) | D-16a | Low: operator may prefer to leave the ceilings |

## Open Questions

1. **Twelve suites are red in the full run at clean HEAD (132 tests).** Fold a triage into Phase 78, or scope Phase 78 to the four suites and file a todo? Several track in-flight Phase 79 counts. Recommendation: scope to the four + one grouped todo, and re-run after Phase 79 settles.
2. **D-12 / D-14 / D-08(callback-1298) contradict current code and todos.** Confirm the planner should record current truth (recommended) rather than the CONTEXT wording.
3. **58 WR-03 has no real test.** Add a two-line source pin (recommended) or leave open with a todo?
4. **Lower the lint ceilings to measured counts?** Optional; do it last and re-measure (Phase 79 is still landing commits).
5. **IN-01 (`inviteBridge.ts:63` `once`→`on`) is a one-token fix.** D-09 says "stays open with a todo" if unfixed; fixing it is code in scope only if the operator wants it. Default: todo.

## Sources

### Primary (HIGH confidence: read/run in this session)
- `.planning/phases/78-.../78-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`
- Archived records: `.planning/milestones/v0.9-phases/{52,53,58}-*/` VERIFICATION/UAT/REVIEW/REVIEW-FIX
- Code: `native/steam-bridge/helper/bridge_helper.c`, `src/backend/storeManagers/steam/bridge/{helperSpawn,inviteBridge,shimCoverage,allowlist,launchTarget}.ts`, `bridge-allowlist.json`, `src/backend/storeManagers/steam/{gameLaunch,gameEligibility,anonymousClient,user,userTypes}.ts`, `src/backend/{knownFixReport,dialog/dialog,dialog/displayAck}.ts`, `src/backend/__tests__/steamAuthSessionPolicy.test.ts`, `knownFixReportUrl.test.ts`
- CI/tooling: `.github/workflows/{lint,test}.yml`, `.husky/pre-push`, `meta/lintScoped.cjs`, `meta/__tests__/*Wiring.test.ts`, `package.json`, `.prettierignore`
- Parsers: `~/.claude/get-shit-done/bin/lib/uat.cjs`, `workflows/execute-phase.md:1265-1285`, `get-shit-done-cc/sdk/dist/query/uat.js`
- Git: `git bisect run` over `1c423224d..19b3cac2c`, `1e6e50894..2cd7e1a34`, `3e8823f00..19b3cac2c` (3 suites); jest at named commits
- Todos: `.planning/todos/completed/{2026-10-24-friends-sign-out-steam-user-logon,2026-11-01-callback-1298-on-bridge-join-path,2026-10-28-bridge-notice-dialog-display-unconfirmed,2026-10-24-steamstub-launch-check-static-re-decision,2026-10-25-unclaimed-world-...}.md`
- `Skill("gamelib-conventions")` UAT-item and todo-frontmatter sections

### Secondary / Tertiary
None used. No web or Context7 lookups were needed (no external library questions).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, no new tooling, all measured
- DEBT-06 results and attribution: HIGH for green/red states and first-green commits; MEDIUM for the 66.3-08 mechanism (A1)
- DEBT-05 closure table: HIGH (file:line and tests verified passing at HEAD)
- D-16 wiring constraints: HIGH (tests read)
- The 12 red suites' root causes: MEDIUM (first failure messages only; A2)

**Research date:** 2026-11-15
**Valid until:** 2026-11-18 for the red-suite and lint counts (Phase 79/80/76 commits are landing daily); the record/attribution findings are stable.
