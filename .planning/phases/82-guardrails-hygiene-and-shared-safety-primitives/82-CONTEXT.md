# Phase 82: Guardrails, hygiene and shared safety primitives - Context

**Gathered:** 2026-11-20
**Status:** Ready for planning

<domain>
## Phase Boundary

The first v0.11 phase (requirements FND-01, FND-02). Before any port slice starts:

1. The whole test and gate set is green, or each red suite is retired with an operator-approved reason in a ledger.
2. The census-style drift gates cannot pass vacuously.
3. One shared Rust safety primitive (tri-state `Yes | No | Unknown` plus `safe_path`) exists, and the **live** TypeScript destructive paths already use it. Uninstall, bottle/prefix removal and `resetHeroic` refuse on Unknown, and an uninstall never deletes a sibling game.
4. The `utils.ts`/`bootstrap.ts` responsibility inventory and the milestone-wide state-ownership table are committed.
5. The zero-risk dead code is deleted.

No new user-facing capability. The only user-visible change is a refusal notice where a guarded op would previously have proceeded or failed silently.

</domain>

<decisions>
## Implementation Decisions

### Red-suite policy (FND-01, criterion 1)
- **D-01:** The green bar is the **full gate set**, not just the backend jest project. That means `pnpm test` across every jest project (backend, frontend, meta) plus the ratchet gates: `backend-di-ceilings`, `steam-line-ceiling`, `find-deadcode`, `lint` (`meta/lintScoped.cjs`), `i18n --fail-on-update`, `gameinfo-narrowing-ceiling`, `planning-gates`. Exit condition: the pre-push hook passes **without `--no-verify`**.
- **D-02:** The red list must be **re-measured at the start of the phase** from a clean `git worktree add --detach` checkout, as 78-TEST-HEALTH did. The "Known red" list in `80-HANDOFF.md` is stale. Quick 261117-pfj fixed all 13 suites on 2026-11-17, but new reds have appeared since then (themeTokens, the jestMock ratchet). Don't trust any list. Measure.
- **D-03:** Retiring a suite requires **per-suite operator approval**. The executor proposes the retirement with a reason. The suite is deleted or skipped only after sign-off, so plans that retire suites need a `checkpoint:decision`. Fixing is the default. Never widen a baseline or ceiling to get a gate green (same rule as Phase 78 and quick 261117-pfj).
- **D-04:** The ledger is a **single phase doc**, `82-TEST-LEDGER.md`, in the style of `78-TEST-HEALTH.md`: proof head sha, per-suite verdict (fixed with cause and commit, or retired with reason and approval date), plus the full-run counts. Retired suites are deleted outright, so no machine-read retirement file or gate exists.

### Vacuous-pass guards (FND-01, criterion 2)
- **D-05:** Every census-style gate gets **both** guards: (a) an assertion that the scanned count is at or above a pinned floor (the 71-19 "vacuous EOF pin" pattern; `rendererZodGuard.test.ts` "scan is not vacuous" is an in-repo example), and (b) a deliberate empty or truncated-input test that must fail. They apply to `ipcDomainCensus` and `flowRegistrationCensus` (named by the criterion) **and** to every other census-style gate the researcher finds (e.g. `phase70PassthroughCensus`, `bridgeCensus`, moduleStateCensus, the ceiling scanners).

### Where the safety primitives land (FND-02)
- **D-06:** **One Rust implementation, adopted by live TS now.** The tri-state type and `safe_path` are built once in Rust, and the current TS destructive paths call it through `rustInvoke`. A rejected or failed `rustInvoke` reads as **Unknown, so the op refuses**. Later port slices call the crate directly. No parallel TS reimplementation. — **Reversibility:** costly — every guarded TS call site gains a rustInvoke dependency; undoing it means re-inlining guard logic at each site.
- **D-07:** **New small Tauri-free crate** (working name `gamelib-safety`, final name at Claude's discretion). It follows the existing crate recipe in `src-tauri/crates/README.md` (dispatch op, shell dispatch arm, `EXPECTED_LOCKFILE_CRATE_NAMES` updated in the same commit). Its API must let Phase 83 re-home it into `gamelib-core` without changing the API.
- **D-08:** Also in scope: a Rust **`FakeHome`** test helper (the Rust twin of `createFakeHomeProfile()`), and a **rules section in `src-tauri/crates/README.md`** stating "destructive guards refuse on Unknown; readers distinguish absent from could-not-read" and "one shared `safe_path`; never derive a trust root from the data being validated".

### Coverage of the sibling guarantee and guards (FND-02, criteria 3–4)
- **D-09:** The **known nested co-install bug in TS `uninstallBottleGameDirectly`** (`src/backend/storeManagers/steam/gameUninstall.ts:671`) is **fixed in this phase** through the shared primitive and covered by the nested-installdir table row. It is not deferred as a port divergence.
- **D-10:** "Never deletes a sibling" covers **every recursive delete GameLib itself performs on uninstall**: Steam native and bridge, sideload, and the GameLib-side folder/prefix deletes for Epic, GOG and Amazon. It does **not** cover deletes performed inside the legendary/gogdl/nile binaries.
- **D-11:** The guarded destructive ops are uninstall (all stores, per D-10); **bottle/prefix removal**, meaning both the Steam bridge bottle removal and the `shouldRemovePrefix` prefix delete on uninstall for every store; and **`resetHeroic`** (`src/backend/utils.ts:379`). `clearCache` is **not** guarded: it drops rebuildable caches only.
- **D-12:** Criterion 3 needs **one injected-rejection test per guard** (a rejected rustInvoke or an unreadable input, asserting refusal and that nothing was deleted).

### Refusal UX
- **D-13:** A refusal shows an **error in the existing bottom-right notice stack**. It names the game and the reason in plain words and says nothing was deleted, e.g. "Couldn't uninstall X: GameLib couldn't confirm the install location. Nothing was deleted." A log line names the guard that refused. The tile returns to its prior state (no stuck "Uninstalling"; cf. the explicit `done` emit already in `uninstallBottleGameDirectly`). Retry means clicking again. No new dialog and no retry button. Copy goes through i18n.
- **D-14:** **All guards run before any delete.** An op with several delete targets (e.g. uninstall plus remove prefix) deletes nothing unless every guard passes. The notice names the check that failed.

### Delete-path edge policy (criterion 4 table semantics)
- **D-15:** **Symlinks are unlinked, never followed.** A symlinked install root is removed as a link, and the target data survives. A symlink inside the tree is unlinked, never recursed through. The same applies to Windows junctions.
- **D-16:** **Another known install nested under the delete target means refuse**, with a notice naming the other game. "Known install" means any store's library entry. No delete-around-it.
- **D-17:** Containment and sibling comparisons use the **canonicalized on-disk real path**, case-folded and NFC-normalized on case-insensitive volumes. If canonicalization fails, the answer is **Unknown, so the op refuses**.
- **D-18:** The three-OS proof is **CI only**. The Rust adversarial table (nested installdir, `.\x`, `C:\x`, UNC, symlink, case, NFC/NFD) runs under `cargo test` on the existing windows/macos/ubuntu matrix and creates real symlinks and junctions on each runner. This phase needs no live session.

### Claude's Discretion
- Format and location of the `utils.ts`/`bootstrap.ts` responsibility inventory and of the milestone-wide state-ownership table (the research suggests a phase doc. Each store/cache has exactly one owner per slice boundary, and the table is sequenced so no owner moves twice).
- How far the dead-export sweep goes (start from the knip baseline; lower the baseline in the same commit as each deletion).
- The crate's final name and its exact API shape, within D-06/D-07.
- Exact notice wording, within D-13.

### Already decided (carried forward, not re-asked)
- `CI=e2e` mock backends (`*/e2eMock.ts` and the bootstrap branch) are **deleted** (operator decision 2026-11-17, REQUIREMENTS-v0.11 Out of Scope).
- `src/backend/sidecar/fileStore.ts` is deleted **only after a live-or-dead check** (FEATURES says dead per `store_backend.ts:63`; ARCHITECTURE reads it as the owner of the renderer store bridge). If it's live, it's Phase 85 scope.
- Other zero-risk deletions per criterion 5: type-only files, dead exports, `legendary/commands/*`.

### Folded Todos
- **`2026-11-18-themetokens-render-site-census-finds-37-sites-expects-34.md`**: `themeTokens.test.ts` finds 37 `.is-link` render sites against a pin of 34. It's a red suite under D-01, so fix it (or retire it with approval, per D-03).
- **`2026-11-17-backend-di-jestmock-ratchet-red-five-frontend-tests.md`**: `backend-di-ceilings` jestMock ratchet red on five frontend tests (NoticeStackTwoToast, steamLoginPollLifecycle, GameStatus.bottleWaiting/.redistSpinner/.steamUpdate). It's a ratchet gate under D-01, and the fix is rewriting the tests to drop `jest.mock`, never raising the baseline. One earlier attempt (dropping the SteamUpdateInfo stub) broke suite load, so read the todo first.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope and requirements
- `.planning/REQUIREMENTS-v0.11.md`: FND-01, FND-02; Out of Scope (e2e mocks deleted)
- `.planning/ROADMAP.md` §"Phase 82": goal and the five success criteria

### Research
- `.planning/research/v0.11/SUMMARY.md`: phase 82 scope, Gaps (the fileStore contradiction, known-red censuses)
- `.planning/research/v0.11/PITFALLS.md`: pitfall 1 (fail-open on rejected Rust calls), 2 (weaker delete path guards, adversarial table, nested co-install bug), 8/21 (census gates, known-red list), state-ownership table guidance
- `.planning/research/v0.11/FEATURES.md` §zero-risk deletions (lines ~176–250): fileStore, legendary/commands, dead exports
- `.planning/research/v0.11/ARCHITECTURE.md`: store-bridge reading of `fileStore.ts` (line ~30); state-ownership model

### Prior test-health precedent
- `.planning/phases/78-verification-records-and-test-health-after-v0-9/78-TEST-HEALTH.md`: ledger format, clean-worktree proof method, "never widen a ceiling" rule
- `.planning/todos/completed/2026-11-16-full-suite-red-outside-debt-06.md`: the 13 suites quick 261117-pfj fixed
- `.planning/phases/80-steam-install-uninstall-and-update-polling-state-machines-in/80-HANDOFF.md` §"Known red": historical list only (stale; see D-02)

### Crate recipe and conventions
- `src-tauri/crates/README.md`: the per-domain crate recipe; D-08 adds the rules section here
- `Skill("gamelib-conventions")`: fake-HOME isolation (two-profile rule), the `<verify>` prettier check, todo frontmatter

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `resolveBridgeGameInstallRoot` (`src/backend/storeManagers/steam/bridgeInstallState.ts:111`) and the resolve()+relative()+isAbsolute() containment idiom ("path.join is not containment", Phase 18): the current TS guard idiom that the Rust `safe_path` replaces
- `readAcfState` (`src/backend/storeManagers/steam/library/acfState.ts:53`) already returns an `unknown` state, and `uninstallBottleGameDirectly` already refuses on it (75 WR-01). That's the model for the tri-state pattern
- `createFakeHomeProfile()` (`src/backend/testUtils/fakeHomeProfile.ts:192`): the TS twin for the Rust `FakeHome`
- `NUMERIC_APP_ID` (`src/backend/storeManagers/steam/gameConstants.ts:8`): input validation precedent on the uninstall path
- In-repo vacuous-scan guard: `meta/__tests__/rendererZodGuard.test.ts:214` ("scan is not vacuous")

### Established Patterns
- Crate shape: Tauri-free crate + `-cli` + `*_dispatch.rs` shell arm reached by TS `rustInvoke` (Phases 63/73/75/79/80)
- Rust tests must pass on Windows: never build expected paths with `join("a/b")`; join segment by segment
- Uninstall returns `{ stdout, stderr, refused: true }` on refusal and emits a terminal `gameStatusUpdate` `done` so the tile doesn't stick

### Integration Points (recursive-delete call sites to audit; from grep)
- Uninstall: `src/backend/utils/uninstaller.ts`, `storeManagers/steam/gameUninstall.ts`, `storeManagers/sideload/games.ts`, `storeManagers/gog/games.ts`, `storeManagers/gog/library.ts`, `storeManagers/steam/cancelDelete.ts`
- Bottles/prefixes: `storeManagers/steam/bridgeBottleLifecycle.ts`, `provisionBottle.ts`, `engine/bottlePrimitives.ts`, `engine/adoptBottle.ts`, `engine/engineSwitch.ts`, `engine/fallbackEngine.ts`
- Reset: `src/backend/utils.ts` `resetHeroic` (line 379), registered in `src/backend/sidecar/shellFilesFlowRegistration.ts`
- Other `rmSync` sites (tools, wine manager, known fixes, shortcuts, migration) are outside the D-10/D-11 guard set, but the researcher should confirm none of them is reachable from uninstall
- Census gates: `src/backend/sidecar/__tests__/{ipcDomainCensus,flowRegistrationCensus,phase70PassthroughCensus}.test.ts`, `meta/__tests__/bridgeCensus.test.ts`

</code_context>

<specifics>
## Specific Ideas

- A user who symlinked a game onto an external drive must keep the data on that drive after uninstall (D-15).
- The refusal notice must say plainly that **nothing was deleted**, so the user isn't left wondering about partial state.

</specifics>

<deferred>
## Deferred Ideas

None. The discussion stayed within phase scope.

### Reviewed Todos (not folded)
These 10 todos matched on keywords only and are unrelated to Phase 82, so they stay pending: Windows releases unsigned; packaged app blank render (already fixed); depot `optionaldlc`; winebus IOHID PowerA wedge; Amazon store-exit refresh live-verify; Steam verify/move install; restart note flash; download queue "Finished Installation" at handoff; Steam native invite picker; protonfixes import tool; x86 shim flat API parity.

</deferred>

---

*Phase: 82-guardrails-hygiene-and-shared-safety-primitives*
*Context gathered: 2026-11-20*
