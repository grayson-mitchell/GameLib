# Phase 62: Module boundaries and decomposition - Context

**Gathered:** 2026-11-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Module boundaries in the TypeScript backend and frontend become explicit, tool-enforced at `error`,
and no longer bypassed by branching on store identity. Three parts, as scoped in ROADMAP.md
Phase 62:

1. **Boundary rules**: import-graph rules (no store manager imports another; `launcher.ts`
   reaches stores only through `storeManagers/index`) plus a ban on runner-literal comparisons,
   each with a recorded baseline.
2. **Store capabilities**: a per-runner capability table replaces runner-literal branching.
3. **Decomposition**: split `steam/games.ts`, fold `steam/depot.ts` into `steam/depot/`, split
   `common/types/ipc.ts` per domain, and add a `sidecarTransport.ts` ↔ `main.rs` parity test.

**Out of scope:** the `src-tauri/src/main.rs` split (a separate quick task). No behaviour changes:
this is a refactor phase, and any defect or cleanup it uncovers becomes a todo or a separate
follow-up commit (see D-06).

**Measured at discussion time (2026-11-06; the roadmap figures have drifted):** `games.ts` 7,228
lines, 32 exports, 19 importers, 9 `jest.mock` sites. `depot.ts` 4,598 lines, 18 importers, and it
sits beside an existing `steam/depot/` directory with 21 modules. Frontend: 67
`runner ===/!== 'steam'` sites and 136 runner literals across all stores. Backend outside
`storeManagers/`: about 31 Steam sites (`downloadmanager/utils.ts` 6, `downloadqueue.ts` 5,
`sidecar/steamFlowRegistration.ts` 4, others 1–2 each). `launcher.ts` imports `gog/setup`,
`nile/setup`, `legendary/{setup,commands,electronStores,epicOfflineMode}`, `gog/presence` and
`legendary/eos_overlay/eos_overlay` directly, which is more than the roadmap lists. `ipc.ts` is
945 lines and only 6 files import it directly. There are 21 `*FlowRegistration.ts` files in
`src/backend/sidecar/`.

</domain>

<decisions>
## Implementation Decisions

### Capability flags vs store identity
- **D-01: Flags live in one static per-runner table in `common/`**, shaped like
  `storeCapabilities: Record<Runner, StoreCapabilities>` and read by both frontend and backend.
  The compiler must force every runner to declare every flag (`satisfies Record<Runner, …>`, as
  `storeManagers/index.ts` already does for `LibraryManager`). Per-game facts (`is_delisted`,
  `thirdPartyManagedApp`, `canRunOffline`, …) stay on `GameInfo`, and a flag is never stamped
  onto each serialised game.
- **D-02: Store-identity checks stay legitimate, but only through one named helper.** Checks that
  really are about the store (ProtonDB/compat level, Mac Steam bottle setup, the
  `crossoverOnly`-defaults-on-for-Steam engine rule, Steam playtime source, steam:// links) go
  through a single helper such as `isStore(game, 'steam')` or the table's `store` field. The raw
  `runner === '<literal>'` form is banned. Behavioural sites (install managed externally, DLC
  selection, resumable install, no store page when delisted, …) become capability flags.
  Classifying each site as behaviour or identity is part of the work and should be recorded per
  site.
- **D-03: Frontend reach is every runner literal, not just `'steam'`.** gog/legendary/nile/
  sideload/humble literals in the frontend are converted too, otherwise the rule can never reach
  zero.
- **D-04: The literal ban applies everywhere in `src/frontend/**` and `src/backend/**` except
  `src/backend/storeManagers/**`**, where a manager may know its own identity. This is wider
  than the roadmap's `screens/**` + `downloadmanager/`. It also covers frontend `state/`,
  `helpers/` and the backend `sidecar/*FlowRegistration.ts` sites. Test files are the planner's
  call (see Claude's Discretion).

### games.ts / depot.ts decomposition
- **D-05: Repoint importers; no façade.** After extraction, every importer and every `jest.mock`
  path targets the module that actually owns the symbol. `games.ts` does not re-export moved
  symbols. The reason: a mock of `games` must stop silently stubbing launch/DRM code that has
  moved.
- **D-06: Pure moves in separate commits.** Each extraction is a move plus import-path edits only,
  so the diff can be checked by eye and a regression can be bisected. Renames, dedupes and
  dead-code removal found along the way are recorded as todos or done in a separate follow-up
  commit. They are never mixed into a move commit.
- **D-07: Launch, DRM and requirements modules are the minimum.** The planner builds a cluster
  map of the 7,228 lines first and may extract more modules where it finds clean seams (for
  example install/uninstall/state). Anything cohesive that is left over stays in `games.ts`.
- **D-08: Split `depot.ts` into `steam/depot/` submodules, with `steam/depot/index.ts` as the
  public entry.** External importers use `steam/depot` (one path), and modules inside `depot/`
  import siblings directly. Replacing `depot.ts` with `depot/index.ts` must not break the
  3 existing `depot/*` modules that import `../depot` (a back-edge into the parent file that
  becomes an index cycle unless they are repointed at the owning submodule).

### IPC channel types
- **D-09: Per-domain types live at `src/common/types/ipc/<domain>.ts`, name-paired with the
  flow registrations.** For example `ipc/steam.ts` pairs with
  `backend/sidecar/steamFlowRegistration.ts`. The roadmap's "co-located with the sidecar
  `*FlowRegistration.ts` files" is read as *name-paired*, not *same directory*: putting the types
  under `backend/` would make the frontend and preload import from the backend, which breaks the
  boundary this phase enforces.
- **D-10: `src/common/types/ipc/index.ts` assembles the umbrella types as intersections**
  (`AsyncIPCFunctions = SteamAsync & GogAsync & …`, and likewise for `SyncIPCFunctions`,
  `TestSyncIPCFunctions` and `FrontendMessages`), so existing consumers keep their imports. An
  intersection does not reject a duplicate channel name on its own, so add an explicit check
  that each channel name is declared in exactly one domain file.
- **D-11: A census test pairs channels with domains.** It fails if a `*FlowRegistration.ts` file
  handles a channel that is not declared in its paired `ipc/<domain>.ts`, in the same style as
  `src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts`. This stops channels drifting back into one file.
- **D-12: The transport parity test is a jest test that parses `src-tauri/src/main.rs` source
  text.** It imports the constants from `common/types/sidecarTransport.ts`, regex-extracts the
  mirrored `const` values from `main.rs`, and fails on any drift. It needs no cargo in the jest
  lane. Give each mirrored Rust const a stable marker comment so the extraction survives the
  future `main.rs` split, and so the parity test can find the constants by marker rather than by
  file position.

### Enforcement, ordering and proof
- **D-13: Use two tools.** dependency-cruiser enforces the import-graph rules (no cross-manager
  imports; `launcher.ts` only through `storeManagers/index`). It is an import-graph tool and
  cannot see `runner === 'steam'`, so the literal ban is an ESLint rule (for example
  `no-restricted-syntax` on a `BinaryExpression` comparing `.runner` to a string literal).
- **D-14: Each rule's baseline is a ceiling that can only go down**, following the pattern of the
  per-scope lint ceilings in `meta/lintScoped.cjs`. CI fails if a change adds a violation. Each
  plan that removes sites lowers its ceiling in the same commit. When a count reaches zero, that
  rule flips to `error` and its ceiling is deleted. A rule never sits warn-only with no ceiling.
- **D-15: The phase is done when every rule is at `error` with a zero count.** That covers the
  dependency-cruiser rules and the literal ban. Partial reduction does not close the phase.
- **D-16: Order is rules → split → capabilities.** (1) Tooling and baselines first, so every later
  plan shows its delta. (2) The `games.ts`, `depot.ts` and `ipc.ts` pure moves, plus the parity
  test, while behaviour is still unchanged. (3) Capability flags and literal conversion last,
  landing in the already-split files rather than converting sites inside the 7k-line file and
  then moving them. The `launcher.ts` boundary fix can go in (2) or (3).
- **D-17: Two short live macOS smoke runs.** One runs after the split (step 2) and one after
  capabilities (step 3). Use `pnpm tauri:dev` and restart it so the sidecar is rebuilt. Launch
  one bridged Steam title, one DRM-mode title (Grim Dawn, 219990) and one non-Steam game. Then
  check that the Library, game page, install modal, Console mode and download queue still show
  the right store-specific controls, i.e. the Steam-only ones on Steam games and none on the
  others. A green suite on its own is not sufficient proof for this phase.

### Claude's Discretion
- The exact flag names and the day-one flag set. The roadmap's examples are install managed
  externally, DLC selection and resumable install. Derive the rest from the per-site audit and
  prefer behaviour names over store names.
- The name and signature of the identity helper (D-02).
- Whether test files (`__tests__/`) are exempt from the literal ban. Fixtures will legitimately
  set `runner: 'steam'`; comparisons in test code are lower-value to ban.
- Exact module names and cut lines for the `games.ts` and `depot.ts` splits, within D-05..D-08.
- How the dependency-cruiser baseline is stored and checked (config file plus a meta script, or
  folded into an existing gate), provided it meets D-14.
- Whether `launcher.ts`'s store-specific setup calls go through new `LibraryManager` methods or a
  dispatch in `storeManagers/index`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope
- `.planning/ROADMAP.md` § "Phase 62: Module boundaries and decomposition" — the goal and the
  three parts. It came from an architecture review on 2026-11-06.

### Patterns to follow
- `src/frontend/helpers/steamInstallOptionsEntry.ts` — the existing single-decision-site pattern
  for a runner check. Its header comment records how the pattern was violated within the same
  phase (34.13 review C-04), which is the failure mode the lint rule exists to prevent.
- `src/backend/storeManagers/index.ts` — `libraryManagerMap … satisfies Record<Runner,
  LibraryManager>`. Follow the same exhaustiveness pattern for the capability table (D-01).
- `src/common/types/game_manager.ts` — the `LibraryManager` / `GameManager` interfaces.
- `src/common/types.ts` — `GameInfo` (`thirdPartyManagedApp`, `canRunOffline`, `is_delisted`,
  …), the per-game facts that stay on `GameInfo`.
- `meta/lintScoped.cjs` — the existing per-scope ceiling mechanism. Use it as the model for the
  ratchet (D-14).

### Files being decomposed
- `src/backend/storeManagers/steam/games.ts` — the split target (D-05..D-07).
- `src/backend/storeManagers/steam/depot.ts` and `src/backend/storeManagers/steam/depot/` —
  the fold target (D-08).
- `src/common/types/ipc.ts` — the split target (D-09..D-11). Its four exported interfaces are at
  the end of the file.
- `src/backend/sidecar/*FlowRegistration.ts` (21 files) — the domains that `ipc/<domain>.ts`
  pairs with. `src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts` is the model for D-11.
- `src/common/types/sidecarTransport.ts` and `src-tauri/src/main.rs` — the parity pair (D-12).
  `main.rs` line 8 already cites the TS contract.
- `src/backend/launcher.ts` — the direct store-manager imports to remove (lines ~57–111).

### Repo conventions that apply
- `Skill("gamelib-conventions")`: put `npx prettier --check` over exact paths in every
  `<verify>` block; use `createFakeHomeProfile()` if any test spawns `depcruise`/`eslint` as a
  child process; give any todo created for D-06 cleanups `severity:`/`platform:`/`ready:`
  frontmatter.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `satisfies Record<Runner, …>` exhaustiveness (`storeManagers/index.ts`): a capability table
  written this way fails to compile when a runner is added without flags.
- `steamInstallOptionsEntry.ts`: a worked example of collapsing scattered runner conjuncts into
  one tested module.
- `meta/lintScoped.cjs` ceilings: the ratchet pattern already used in CI (`.github/workflows/
  lint.yml`).
- `eslint-plugin-import-x` is already installed. It is a possible host for import rules, but the
  roadmap names dependency-cruiser for the graph rules (D-13).

### Established Patterns
- Frontend sites often carry long comments that cite the decision behind a runner check (D-27,
  D-28, REQ-37-02, …). When a site is converted, keep that rationale beside the flag or helper,
  and do not drop it.
- Some "steam" sites are really compound behaviour (`runner === 'steam' && action === 'install'`
  in `InstallModal`, `GameCard`, `steamEligibilityProbe.ts`, `state/InstallGameModal.ts`). These
  are candidates for one shared predicate rather than a flag per site.
- Many existing tests use `jest.mock` on the `steam/games` path. Under D-05 these move to the
  owning module, so expect test edits to go with each move commit.

### Integration Points
- Preload's typed invoke (`src/preload`) consumes the umbrella IPC types. D-10 keeps its imports
  stable.
- `downloadmanager/utils.ts` and `downloadqueue.ts` hold most of the backend Steam branching. The
  capability table must be importable from the backend without pulling in frontend code, which
  is why it lives in `common/`.

</code_context>

<specifics>
## Specific Ideas

- Live smoke titles for D-17: a bridged Steam title, Grim Dawn (219990) in DRM mode, and one
  non-Steam (Epic/GOG) game.
- Each plan that removes violations lowers its ceiling in the same commit, so the count in the
  repo always matches what the plan claims.

</specifics>

<deferred>
## Deferred Ideas

- The `src-tauri/src/main.rs` split: a separate quick task, already out of scope in the roadmap.
  D-12's marker comments are meant to survive it.
- Cleanups found during the pure moves (D-06): raised as todos, not done in move commits.

### Reviewed Todos (not folded)
The `todo.match-phase` matcher returned 9 matches (score 0.6–0.9). All were keyword noise on
terms like `src`, `steam` and `frontend`, and none concern module boundaries. Examples: launch
notice toast theming, the blank-render fix, x86 shim parity, depot `optionaldlc`, the protonfixes
import tool, the winebus PowerA wedge, the Amazon store-exit refresh, native engine source ports,
and the downloads history loss. None were folded.

</deferred>

---

*Phase: 62-module-boundaries-and-decomposition*
*Context gathered: 2026-11-06*
