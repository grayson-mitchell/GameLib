# Phase 78: Verification records and test health after v0.9 - Context

**Gathered:** 2026-11-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the v0.9 records for Phases 52, 53 and 58 say what is true against current code (DEBT-05),
and prove the four suites the v0.9 audit flagged pass (DEBT-06): `macArchKnownFixRouting`,
`installFlows`, `runnerSliceRegistration`, `testContainment`. Folded in: bring the Lint workflow
back to green (ESLint under its 661-warning ceiling) and stop one red ratchet step from masking
the others.

Not in scope: fixing the open product substance those records describe (bridge shim coverage,
DRM titles), or sweeping the other v0.9 phases' records (51, 54–57, 59, 60).

**Scout finding (2026-11-15):** all four flagged suites already pass — `npx jest` on the four
paths gave 4/4 suites, 209/209 tests. That run was on a **dirty working tree** (uncommitted Steam
edits under `src/backend/storeManagers/steam/`, Phase 79 work in progress), so it does not count
as proof (D-01). The DEBT-06 work is mostly proving and attributing the green, not changing code,
unless the clean-HEAD or full-suite run turns something red.

</domain>

<decisions>
## Implementation Decisions

### Test health: what counts as done (DEBT-06)
- **D-01:** Proof = a run from a **clean worktree at HEAD**. Run the four files as targeted runs
  **and** inside the full `pnpm test:ci` run, so order dependence and pollution from shared state
  between tests show up. Today's dirty-tree green does not count. (Fresh worktrees need build
  prep. See the memory note on `build:sidecar-sea` / vite build if anything needs built artifacts.)
- **D-02:** Attribute each suite: name the commit that made it pass, or record "never failed /
  env-dependent" with evidence (git log / bisect). This settles whether quick 261105-vfq's
  "pre-existing" claim for macArch was true.
- **D-03:** The macArch "Intel: never seeds…" case must be shown to pass under a **mocked x64/Intel
  host** and on **CI's Linux runner** (`.github/workflows/test.yml`), not only on this Apple
  Silicon Mac. If the test does not control arch itself, that is a test defect to fix (D-04).
- **D-04:** If any suite is red on clean HEAD, in the full run, or under the arch checks, **fix it
  in this phase**, whether the fault is in the test or the code.

### Correcting the records (DEBT-05)
- **D-05:** **Edit the archived files in place** under `.planning/milestones/v0.9-phases/`. That
  is where the audit and future readers look.
- **D-06:** `52-VERIFICATION.md`: write a **new current body at the top** that matches the
  `passed` frontmatter (gap_closure_4, amended done-when). Move the 2026-10-24 `gaps_found`
  report under a clearly dated **"Superseded report (2026-10-24)"** heading. Keep it, don't
  delete it.
- **D-07:** Superseded UAT Gaps entries in `52-UAT.md` and `53-UAT.md` (lines ~191–199) change
  from `status: failed` to **`status: superseded`** plus a **`superseded_by:`** pointer naming the
  census run, phase, plan or commit that overtook them.
  Researcher: check `Skill("gamelib-conventions")` (UAT item shape) and whatever parses UAT gap
  status (`/gsd-audit-uat`, audit tooling) to confirm `superseded` is accepted or what has to
  change. Never widen a gate's vocabulary just to admit a value that failed it.
- **D-08:** `58-VERIFICATION.md` `follow_ups`: **drop** each item the code shows fixed, adding a
  one-line "closed by 58-REVIEW-FIX `<commit>`" note. **Keep** the ones that are really still open
  (callback-1298 todo, 58-33 item 2(e) operator amendment / path=unknown, and any WR that fails
  D-09).

### Evidence for closures
- **D-09:** A "fixed" claim (58 WR-01..WR-05, IN-01/02; 52 WR-03 first half) is closed only with
  **the fix located in current code (file:line) and a test that covers it**. If either is missing,
  the item stays open and gets a todo. Phases 61–79 may have rewritten or moved that code since.
- **D-10:** 52-UAT's ELEX 411300 Friends sign-out row closes as **superseded by Phase 54**, on
  attribution plus the current code path that shows no authenticated CM logon at launch. No live
  run. Cite code at clean HEAD. Phase 79 is replacing the steam-user path, so make the citation
  name the mechanism ("no authenticated CM at launch") as well as the file.
- **D-11:** If any closure turns out to need a live check, it becomes a **human UAT item in
  phase 78's own UAT**, and the phase is not verified until the operator runs it.
- **D-12:** 52 WR-03's optional second half (real display acknowledgement for the SteamStub
  notice) is recorded in 52's records as **not built, deferred**, with a pending todo (create one
  if none exists, with `severity:`/`platform:`/`ready:` per conventions). Not built here.

### Scope edges
- **D-13:** Include the two stale code comments the audit groups with the stale records:
  `src/backend/storeManagers/steam/bridge/shimCoverage.ts:192-197` (still says
  Matchmaking/Networking are stubbed) and the `knownFixReport.ts:33-34` comment ("Plan 57-12
  replaces the host"). Two files exist, `src/backend/knownFixReport.ts` and
  `src/common/knownFixReport.ts`, so find the one the audit means. Make them true against
  current code.
- **D-14:** 53-UAT's open substance (Unclaimed World 284100 old-SDK no HELLO; ELEX known-bad;
  Raft/Grim Dawn DRM-limited) is **recorded truthfully as current state** (open / known-bad, with
  the tracking todo linked), **not fixed**. No shim work in this phase.
- **D-15:** The records sweep is limited to **52, 53, 58**. Other phases' stale items stay in the
  v0.9 audit's tech-debt list.

### Post-research amendments (operator, 2026-11-16)
Research (`78-RESEARCH.md`) found premises that current code contradicts. The operator decided:
- **D-17:** The 12 suites red at clean HEAD outside the four (shimGenerate, shimCoverage, ipcDomainCensus,
  flowRegistrationCensus, tauriShellSource, epicOfflineMode, themeTokens, gamelibCatalogParity,
  lintTranslations, genI18nGateScope, callbackRegistryHost, x86CallbackWineHarness) are **not fixed in
  this phase**. File **one grouped pending todo** (with `severity:`/`platform:`/`ready:`) listing them
  with first failure messages. Verification states "the four pass in the full run; N other suites red,
  see todo" — never "full suite green". D-04 applies to the four suites and to un-masked lint steps only.
- **D-18 (amends D-08, D-12, D-14): records state current truth.** (a) callback-1298 follow-up is
  dropped, citing its closure in `todos/completed/`. (b) 52 WR-03 SteamStub display-ack is recorded as
  **moot** — the notice code was deleted in 56-13 (`f8a00423a`) and a real display acknowledgement
  shipped in `509bcb01b` (`displayAck.ts`) for the successor notices; **no new todo** (replaces D-12's
  todo). (c) ELEX and Unclaimed World are recorded as **lifted** (`bridge-allowlist.json` `knownBad: []`,
  closing quicks/todos cited); only Raft/Grim Dawn DRM stay open, owned by Phase 56 (replaces D-14's
  "open / known-bad" for those two). Stale `pending/` todo paths in 52's records are corrected to
  `completed/`. 53-VERIFICATION gets the same current-body-on-top treatment as D-06.
- **D-19 (amends D-09 default):** Fix the three small open review items **in this phase** and then close
  them: 58 WR-03 gets a real source pin (`GL_SEND_TIMEOUT_USEC 250000` and `SO_SNDBUF`); IN-01
  (`inviteBridge.ts:63` `once('error')` → persistent handler) gets the fix plus a covering test; IN-02
  (`bridge_helper.c` stale "accept loop, see main" comment) is corrected.
- **D-20 (bounds D-16):** Do **not** lower the ESLint ceilings. D-16a is satisfied by proving the cold
  run green at execution HEAD. D-16b (un-mask `lint.yml` steps and `.husky/pre-push`) is done, and the
  meta wiring tests that pin the old masking (`steamLineCeilingWiring`, `backendDiCeilingsWiring`,
  `boundaryWiring`, `gameInfoNarrowingWiring`) are updated with it; pre-push line 2 keeps `codecheck`.

### Claude's Discretion
- How the attribution in D-02 is done (log reading versus a real bisect), as long as each suite
  ends up with a named cause.
- Mechanism for the mocked-arch check in D-03 (process.arch / os.arch mock), chosen from what
  the test does.

### Folded Todos
- **`2026-11-14-lint-workflow-red-masks-ratchet-steps`** (`.planning/todos/pending/`). `Lint
  code.` has been red on main since `a58e3e3e8` ("ESLint found too many warnings (maximum:
  661)"). Because GitHub skips the later steps, `Prettier code.`, `Find dead code`, `Module
  boundaries` and `Steam file line ceiling` have not run since. `.husky/pre-push` has the same
  `&&` masking. It fits "test health".
  - **D-16:** Do **both halves**: (a) bring ESLint under the 661 ceiling by **lowering warnings**,
    never raising the ceiling, and re-run cold first because a stale `.eslintcache-src` can
    disagree with CI; (b) give the later `lint.yml` steps the same
    `if: ${{ !cancelled() && steps.deps.outcome == 'success' }}` treatment that `Backend DI
    ceilings` got in quick 261114-2gg, and stop `.husky/pre-push` from masking in the same way.
    Un-masking may show ratchets that are already red. Those are in scope to get green under D-04.
  - Move the todo to `completed/` when done.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase source and requirements
- `.planning/ROADMAP.md` § "Phase 78" (line ~1573): goal, the "re-run first" instruction
- `.planning/REQUIREMENTS.md`: DEBT-05, DEBT-06
- `.planning/milestones/v0.9-MILESTONE-AUDIT.md`: tech-debt frontmatter per phase (52, 53, 58,
  repo-wide) and "Tech debt" items 4–5

### Records to correct (archived, edit in place)
- `.planning/milestones/v0.9-phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/52-VERIFICATION.md`:
  body (~line 64 on) stale under `passed` frontmatter
- `.planning/milestones/v0.9-phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/52-UAT.md`:
  Gaps incl. ELEX Friends sign-out (~line 407)
- `.planning/milestones/v0.9-phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/52-REVIEW-FIX.md`:
  WR-03 optional half (~line 61)
- `.planning/milestones/v0.9-phases/53-steam-bridge-coverage-modern-sdk-exports-flat-api/53-UAT.md`:
  Gaps lines ~191–199
- `.planning/milestones/v0.9-phases/53-steam-bridge-coverage-modern-sdk-exports-flat-api/53-VERIFICATION.md`
- `.planning/milestones/v0.9-phases/58-steam-bridge-multiplayer/58-VERIFICATION.md`: `follow_ups` (lines 18–22)
- `.planning/milestones/v0.9-phases/58-steam-bridge-multiplayer/58-REVIEW.md` and `58-REVIEW-FIX.md`: the WR-01..05 claims to check under D-09

### Test suites (DEBT-06)
- `src/backend/storeManagers/steam/__tests__/macArchKnownFixRouting.test.ts`
- `src/backend/sidecar/__tests__/installFlows.test.ts`
- `src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts`
- `src/backend/sidecar/__tests__/testContainment.test.ts`
- Phase 54 `deferred-items.md` (in `.planning/milestones/v0.9-phases/54-*/`): original failure notes
- Quick 261105-vfq SUMMARY: the unverified "pre-existing" claim for macArch
- `.github/workflows/test.yml`: CI Linux runner for D-03

### Folded lint todo
- `.planning/todos/pending/2026-11-14-lint-workflow-red-masks-ratchet-steps.md`
- `.github/workflows/lint.yml`, `.husky/pre-push`

### Conventions
- `Skill("gamelib-conventions")`: UAT item shape (D-07), todo frontmatter (D-08/D-09/D-12 todos),
  `<verify>` prettier check scoped to exact paths (most edits here are `.planning/` markdown, so
  check `--file-info` for prettier-ignore first)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `pnpm test:ci` (`jest --maxWorkers=2 --silent`): the full-suite run for D-01
- Jest projects (`Backend`, `Meta`): the four suites run under `Backend`

### Established Patterns
- Archived verification records carry `re_verification` / `gap_closure_N` frontmatter blocks.
  The D-06 body rewrite should agree with them, not duplicate them.
- `53-VERIFICATION.md` already uses `retired_overrides` with reason and date. That is a
  precedent for recording a superseded state with its cause.
- Quick 261114-2gg's `Backend DI ceilings` step in `lint.yml` is the template for un-masking (D-16b).

### Integration Points
- The dirty working tree belongs to Phase 79 work in progress. Do the D-01 runs in a separate
  clean worktree and don't disturb or commit those files.
- Code fixes under D-04 or edits under D-13 → run `graphify update .` afterwards.

</code_context>

<specifics>
## Specific Ideas

- The operator wants the records to be readable as **current truth first, history second**.
  Never delete superseded history; move it under a dated heading or a `superseded_by` pointer.
- "Fixed" means seen in current code and covered by a test, not "a REVIEW-FIX file says so".

</specifics>

<deferred>
## Deferred Ideas

- Stale items in other v0.9 phases (51 deferred-items, 56 WR-01/WR-02, 57 WR-09 and skipped WRs,
  59 dead exports and WR-01-round6/WR-06): stay in the v0.9 audit's tech-debt list (D-15).
- 52 WR-03 SteamStub display acknowledgement: deferred via todo (D-12).
- 53-UAT open substance (Unclaimed World, ELEX, DRM titles): tracked by existing todos, not fixed here (D-14).

### Reviewed Todos (not folded)
`todo.match-phase 78` returned keyword-only matches, and none were in scope: Windows unsigned
releases, packaged-app blank render, depot optionaldlc, protonfixes import tool, Humble login RPC
splits (×2), pinned libsteam_api dylib spike, Mac Steam Friends after go-offline install, Mac
Steam "playing Spacewar", Mac Steam playtime refresh, winebus PowerA pad, x86 shim parity,
Steam verify/move, launch without Steam.

</deferred>

---

*Phase: 78-verification-records-and-test-health-after-v0-9*
*Context gathered: 2026-11-15*
