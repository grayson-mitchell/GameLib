# Phase 65: Steam store manager decomposition, continued - Context

**Gathered:** 2026-11-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Split the oversized source files under `src/backend/storeManagers/steam/` along their natural
seams, with **no behaviour change**, until every non-generated file there is under 1,000 lines.
Add a CI gate so they stay that way. Fold in removal of the `SteamGame` lift stubs left behind
by Phase 62.

Measured 2026-11-07 (non-test, non-generated files over 1,000 lines):

| File | Lines |
|---|---|
| `steam/library.ts` | 4,400 |
| `steam/bottle.ts` | 2,275 (down from 2,567, after Phase 61 D-19 extracted the engine primitives) |
| `steam/gameInstall.ts` | 1,971 |
| `steam/user.ts` | 1,562 |
| `steam/bridge/shimGenerate.ts` | 1,479 |
| `steam/games.ts` | 1,351 |
| `steam/bridge/drm/runnerClone.ts` | 1,228 |
| `steam/gameBridgeLaunch.ts` | 1,183 |
| `steam/bridge/helperProcess.ts` | 1,143 |
| `steam/bridge/drm/stageDrmBottle.ts` | 1,005 |

`steam/bridge/shimExports.generated.ts` (1,140) is generated and out of scope.

Out of scope: any behaviour change, renames or dedupes inside a move commit (Phase 62 D-06),
files outside `storeManagers/steam/`, and the DI / process-runner work, which belongs to
Phase 66.

</domain>

<decisions>
## Implementation Decisions

### Scope and done-line
- **D-01: The scope is a line ceiling, not a fixed file list.** Every non-generated source file
  under `src/backend/storeManagers/steam/` must end the phase under **1,000 lines**. This pulls
  in `gameInstall.ts`, `user.ts`, `games.ts` and `gameBridgeLaunch.ts` alongside the roadmap's
  six. Generated files (`*.generated.ts`) are excluded.
- **D-02: Make the ceiling a lasting CI gate.** Add a meta script (or test) that fails when a
  non-generated `steam/` source file is over 1,000 lines. It starts with a per-file allowlist
  holding today's counts. The allowlist only shrinks (Phase 62 D-14 style, and like
  `meta/knipRatchet.cjs`), and the phase ends with it empty. Wire it into `lint.yml` next to
  `pnpm boundaries`.
- **D-03: Split tests together with their source.** When a module is extracted, its tests move to
  that module's own test file in the same pure-move commit, and the `jest.mock` paths are
  repointed to the owning module (Phase 62 D-05). Test files are exempt from the line gate.
- **D-04: Aim for about 800 lines per piece.** The gate stays at 1,000, but each split should
  leave roughly 20% headroom so normal feature work doesn't push a file straight back over.
  This is a target, not a hard rule.

### library.ts
- **D-05: `library.ts` becomes `steam/library/` with `steam/library/index.ts` as the public
  entry**, the same pattern as 62's `depot/` (62 D-08). Code outside the directory imports
  `steam/library`, and submodules import their siblings directly. Repoint any existing back-edge
  into the parent so it doesn't become an index cycle.
- **D-06: Extract all seven real clusters.** The roadmap guessed "owned-apps fetch / ACF-VDF scan
  / metadata-artwork enrichment". **Those guesses are wrong**: `library.ts` does no owned-apps
  fetch and no metadata work. The real clusters are:
  1. install-root resolution and resume breadcrumbs (~L116–780)
  2. the `SteamLibraryManager` class (~L780–1772)
  3. installed-map and ACF state, plus install-copy enumeration and removal (~L1772–2744, minus
     cluster 4)
  4. Mac architecture ground truth and i386 recovery (~L1908–2103)
  5. the restart-Steam hold and install polling (~L2744–3850). At about 1,100 lines this needs
     one more cut, between the restart-hold helpers and the poll and start/stop functions.
  6. uninstall polling (~L3853–4151)
  7. running-app polling (~L4170–4400)

  The planner confirms the cut lines with a cluster map before writing any plan.
- **D-07: Move `refresh()` out of the class into free functions, with no delegating stubs.**
  The ~470-line `refresh()` and its helpers become free functions in their own module. The
  class method calls them directly, and the class keeps no stub that exists only so tests can
  spy on it. This is a mechanical lift, not a pure move, so it gets its own commit separate from
  the pure moves (D-06 discipline). Tests that spy on the class prototype get restructured.

### Bridge and DRM files
- **D-08: Pieces go in sibling files in the same directory**, for example
  `bridge/shimFingerprint.ts` next to `bridge/shimGenerate.ts` and
  `bridge/drm/runnerEntitlements.ts` next to `runnerClone.ts`. No new subdirectories or
  `index.ts` files for these four. Importers are repointed per 62 D-05. The seams the scout
  saw:
  - **`shimGenerate.ts`:** fingerprint/backup/restore of originals; DRM wrapper detection;
    placement.
  - **`helperProcess.ts`:** spawn and readiness probing; connection registry and shutdown.
  - **`runnerClone.ts`:** CrossOver detection and version; entitlements and re-signing;
    verification; clone/build.
  - **`stageDrmBottle.ts`:** registry commands; restore and TCP-artifact cleanup; bottle process
    listing; staging.
- **D-09: Split `stageDrmBottle.ts` (1,005) on a real seam.** Move out its registry-command
  cluster or its process-listing cluster so it ends well under the ceiling. Don't trim it just
  enough to land at 995.
- **D-10: One module owns each piece of mutable module state.** Each state, its
  `__set…ForTests` / `__reset…ForTests` seams, and its `unref()` / exit-teardown hook stay
  together in one module. Other pieces call into that module and never keep their own copy.
  This covers `helperProcess.ts`'s helper registry and `installExitTeardownOnce`, and the
  library pollers' timers and in-flight state. It protects the sidecar exit contract
  (`Skill("gamelib-conventions")`).

### Sequencing and proof
- **D-11: Execution starts after Phase 61 closes**, including 61's live UAT. Planning can happen
  now. None of 61's 5 remaining plans (61-21..25) touch the files in scope, but both phases
  touch the area the smoke runs exercise. Waiting means a regression found in 65's smoke runs
  can only come from 65.
- **D-12: Order: gate → library → bottle → rest → bridge/DRM → stubs.**
  1. The ceiling gate (D-02) with today's allowlist, so each later plan shows its delta.
  2. `library.ts` (D-05..D-07).
  3. `bottle.ts`. The roadmap suggested doing it first to shrink 61's diff, but 61's extraction
     is already done (D-19), so it no longer needs to lead.
  4. `gameInstall.ts`, `user.ts`, `games.ts` and `gameBridgeLaunch.ts`.
  5. The bridge and DRM files (D-08..D-10).
  6. The lift-stub cluster conversions (folded todo, below).
- **D-13: A pure-move commit may lower or delete its own allowlist entry in the same commit**
  (62 D-14 style). The dependency-cruiser rules from Phase 62 stay at zero (`pnpm boundaries`).
  Never loosen the depcruise config or raise an allowlist entry to make a move pass.
- **D-14: Two live macOS smoke runs, as in 62 D-17.** One runs after steps 2–3 (library and
  bottle), one at the end. Both use `pnpm tauri:dev`, restarted so the sidecar is rebuilt.
  Each run:
  - launches one bridged Steam title and one DRM-mode title (Grim Dawn, 219990)
  - installs a small Steam game, to exercise install polling and the restart-Steam hold
  - uninstalls it, to exercise uninstall polling
  - confirms that Library refresh and the running indicator work.

  A green suite alone does not prove this phase.

### Added after research (2026-11-07)
- **D-15: `user.ts` splits into free functions, not delegating statics.** Extract `userTypes`,
  `userSignInState` (state leaf), `userSignIn` and `userRedeem` as free functions. Repoint the
  single non-test caller (`sidecar/steamAuthFlowRegistration.ts`) and keep no delegating statics
  on the class. Exporting the currently-private `acquireAuthenticatedWithToken` is accepted.
  Because the class statics become module state, this is a mechanical lift with its own commit,
  not a pure move.
- **D-16: A documented D-10 exception for the library install poller.** `activePolls` and the
  install-poll tick constants go in a handle-free state leaf, `library/pollState.ts`, which
  breaks the `pollInstallOnce` ↔ hold-helpers ↔ `startInstallPolling` cycle. The timer creation
  and its `unref()` stay in `installPolling.ts`. Name the exception in a code comment and in the
  plan. Every other piece of state follows D-10 strictly.
- **Lift-stub todo, corrected scope:** of the 25 delegating members on `SteamGame`, 9 implement
  the `Game` interface and stay as thin methods. Only the 16 non-interface stubs and their 15
  internal call sites are removed.

### Carried forward from Phase 62 (still binding)
- No façade and no re-exports from the old path. Every importer and `jest.mock` targets the
  owning module (62 D-05).
- Pure moves go in their own commits: a move plus import-path edits only. Renames, dedupes and
  dead code go to todos or to a separate commit (62 D-06).

### Claude's Discretion
- The exact module names and cut lines inside each file, within D-04..D-10.
- How `bottle.ts`, `gameInstall.ts`, `user.ts`, `games.ts` and `gameBridgeLaunch.ts` are cut.
  These weren't discussed in detail: build a cluster map, and use sibling files or a directory
  following the D-05 vs D-08 reasoning (a directory only where there are about 4 or more
  pieces).
- Whether the line gate is a standalone `meta/*.cjs` script or a jest test, and how it counts
  lines (physical lines are fine), provided it meets D-02.
- Plan granularity and waves.

### Folded Todos
- **`2026-11-07-remove-steamgame-lift-stubs.md`: remove the SteamGame lift stubs and spy on the
  free functions.** `games.ts` has about 40 class stubs and about 30 non-test `game.x()` call
  sites to convert to `x(game)`. `games.test.ts` has 6 `SteamGame.prototype` spies to
  restructure; `fetchMetadataIfNeeded` is a real method, not a stub. Module-export spies do not
  intercept intra-module calls under ts-jest. Convert one cluster at a time (install, launch,
  eligibility, …) and keep the suite green after each. This is step 6 of D-12, and D-07
  applies the same no-stub stance to the library class.
- **`2026-11-07-games-ts-further-split-below-1400-lines.md`: close as met.** `games.ts` measures
  1,351 lines, under the 1,400 target. Move it to `completed/` with that measurement. Note that
  `games.ts` is still over D-01's 1,000 ceiling, so it gets split anyway in step 4.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope
- `.planning/ROADMAP.md` § "Phase 65: Steam store manager decomposition, continued". The goal
  and the 2026-11-06 measurements. D-06 corrects its guessed `library.ts` seams.

### Method to reuse (Phase 62)
- `.planning/phases/62-module-boundaries-and-decomposition/62-CONTEXT.md`: D-05 (no façade),
  D-06 (pure moves), D-08 (directory + index, back-edge cycle), D-14 (shrink-only ceilings) and
  D-17 (live smoke).
- `.planning/phases/62-module-boundaries-and-decomposition/62-PATTERNS.md`: the
  pattern map 62 used for its splits.
- The `62-*-SUMMARY.md` files in the same directory, for how the `games.ts` / `depot.ts` moves
  were sequenced and what went wrong.
- `.dependency-cruiser.cjs` and `pnpm boundaries`: these rules must stay at zero (D-13).
- `meta/knipRatchet.cjs`, `meta/indexedAccessRatchet.cjs` and `meta/lintScoped.cjs`: existing
  shrink-only ratchets to model the line gate on (D-02). `.github/workflows/lint.yml` is where
  gates are wired.

### Phase 61 interaction
- `.planning/phases/61-unified-macos-engine-for-all-stores/61-CONTEXT.md` D-19: the bottle
  primitives already moved to `src/backend/engine/`. Don't move them back or duplicate them.
- `.planning/phases/61-unified-macos-engine-for-all-stores/61-2{1..5}-PLAN.md`: the open 61
  plans. D-11 waits for them.

### Files being decomposed
- `src/backend/storeManagers/steam/library.ts` (D-05..D-07)
- `src/backend/storeManagers/steam/bottle.ts`, `gameInstall.ts`, `user.ts`, `games.ts`,
  `gameBridgeLaunch.ts`
- `src/backend/storeManagers/steam/bridge/shimGenerate.ts`, `bridge/helperProcess.ts`,
  `bridge/drm/runnerClone.ts` and `bridge/drm/stageDrmBottle.ts` (D-08..D-10)
- `src/backend/storeManagers/steam/depot/index.ts`: the D-08-style directory pattern to copy
  for `library/`.

### Folded todos
- `.planning/todos/pending/2026-11-07-remove-steamgame-lift-stubs.md`
- `.planning/todos/pending/2026-11-07-games-ts-further-split-below-1400-lines.md` (close as met)

### Repo conventions that apply
- `Skill("gamelib-conventions")`:
  - the sidecar exit contract (D-10: keep each `unref()` with the state it owns)
  - `npx prettier --check` over the exact paths in every `<verify>` block
  - `severity:`/`platform:`/`ready:` frontmatter on any todo created for deferred renames or
    dedupes
  - `createFakeHomeProfile()` if the line gate is a test that spawns a child process.
- Memory: `pnpm tauri:dev` (not `tauri:dev:run`) for the smoke runs, and `tauri dev` does not
  rebuild the sidecar, so restart it before live testing (D-14).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `steam/depot/index.ts`: the directory-plus-index layout from 62 D-08.
- `meta/knipRatchet.cjs`: an identity-set, shrink-only ratchet with no `--update` flag. Lines
  move by hand in the same commit. It's the closest model for the per-file line allowlist.

### Established Patterns
- **Class with lifted free functions:** 62 moved `games.ts` methods out to free functions but
  left delegating stubs on `SteamGame`. Phase 65 removes those stubs (folded todo) and doesn't
  repeat the pattern for `SteamLibraryManager` (D-07).
- **Test seams as module exports:** `helperProcess.ts` has `__setSteamWaitScheduleForTests`,
  `__setBridgeHelperPathForTests`, `__resetBridgeHelperStateForTests` and similar exports.
  These must stay with the state they reset (D-10).
- Under ts-jest, module-export spies don't intercept intra-module calls. A split can therefore
  change which spies take effect: a call that was intra-module becomes cross-module, so a spy
  that used to miss can start to hit. Check each test's spies after a move.

### Integration Points
- About 10 non-test backend files and 6 Steam test files import `library.ts` today. All of them
  get repointed to `steam/library` or to the owning submodule.
- `storeManagers/index.ts` registers `SteamLibraryManager`. Its import path changes.

</code_context>

<specifics>
## Specific Ideas

- Smoke titles: one bridged Steam title, plus Grim Dawn (219990) for DRM mode, plus a small
  Steam install/uninstall to exercise the pollers and the restart-Steam hold.

</specifics>

<deferred>
## Deferred Ideas

- Rule out applying the line gate to all of `src/backend`. The ceiling covers
  `storeManagers/steam/` only. A backend-wide allowlist was offered and not chosen; it could be
  a later phase.
- Renames, dedupes and dead code found during the moves go to todos (62 D-06), not into this
  phase's move commits.

### Reviewed Todos (not folded)
These 16 matched by keyword only and don't overlap a decomposition phase: Cat Quest
shim-withheld init, the packaged-app blank render (already fixed), x86 shim modern-SDK parity,
optionaldlc depot selection, protonfixes import, the winebus PowerA wedge, the source-port
runtime route, native Steam delete, the restart-hold robustness discussion, Epic offline
launch, launch-notice theming, the unsigned Windows releases, the Amazon store-exit refresh,
the downloads history, the Humble toast overlap, and the noUncheckedIndexedAccess buckets.
The restart-hold discussion todo touches code that D-06 cluster 5 moves; it's a behaviour
change, so it stays out of this phase.

</deferred>

---

*Phase: 65-steam-store-manager-decomposition-continued*
*Context gathered: 2026-11-07*
