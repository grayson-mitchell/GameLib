# Phase 29: Tauri store layer — generalize the sidecar store beyond the two skeleton stores - Context

**Gathered:** 2026-07-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Grow the sidecar's store layer from the two-store skeleton Phase 27 needed
(`configStore`, `steamConfigStore`) into a real layer covering all ~18 stores in
`StoreStructure`, so later IPC slices have config to read instead of each one
extending `sidecar:store-snapshot` ad hoc.

**In scope:**
- All ~18 `ValidStoreName` stores constructible and round-trippable through the
  sidecar's `fileStore.ts`, proven by test.
- Tiered renderer hydration: a declared boot set in the eager snapshot, the rest
  hydrated lazily.
- The **renderer write path**, which is currently a silent hole
  (`storeSet`/`storeDelete` reach no sidecar handler), plus a sidecar→renderer
  per-key change notification so the renderer snapshot cannot silently go stale.
- An **allow-list** secret policy for the Tauri/sidecar path replacing today's
  hardcoded 2-store deny-list.

**Explicitly OUT of scope:**
- Moving store ownership to Rust / `tauri-plugin-store` (D-01 rejects it).
- Any change to the Electron preload's existing secret deny-list (D-08).
- Cross-process write concurrency between a simultaneously-running Electron and
  Tauri build (D-07 accepts and documents it).
- Porting any IPC channel beyond the store channels themselves — install /
  uninstall / update-check are Phase 30.
- Windows/Linux Tauri packaging, code signing, notarization.

</domain>

<decisions>
## Implementation Decisions

### Store ownership

- **D-01 — Persistence stays in the Node sidecar; grow `fileStore.ts`.** Do NOT
  move store ownership to Rust or `tauri-plugin-store`.

  *Rationale (do not re-derive):* `fileStore.ts` already writes electron-store's
  exact on-disk JSON layout, which is what makes "Electron and the sidecar read
  each other's values byte-identically" true — and that property is what keeps
  the additive/reversible invariant (REQ-27-06 pattern: both `npm start` and
  `npm run tauri:dev` work) cheap. A Rust-owned store would make every sidecar
  store read async and cross-process, and ~18 backend files call `.get()`
  synchronously at module scope, forcing a refactor of every
  `TypeCheckedStoreBackend` caller. Rust's role stays "the platform seam"
  (keyring, opener), not "the database".

- **D-02 — Completion bar: every store round-trips, proven by a test that walks
  `ValidStoreName`.** All ~18 store names must construct and round-trip
  `get`/`set`/`delete`/`raw_store` through the sidecar, so a later IPC slice can
  never hit an unmodelled store. Note the method *surface* is already complete —
  `fileStore.ts` implements everything `TypeCheckedStoreBackend` calls
  (`has`/`get`/`set`/`delete`/`clear`/`.store`/`Symbol.iterator`). The real gaps
  are: (a) coverage, (b) `defaults` option handling, and (c)
  `src/backend/cache.ts`, which constructs `new Store({ clearInvalidConfig })`
  **directly**, bypassing `TypeCheckedStoreBackend` entirely.

  Explicitly NOT required this phase: full electron-store semantics parity
  (atomic writes, dot-notation edge cases) — see Claude's Discretion D-10.

### Renderer hydration

- **D-03 — Tiered hydration: declared boot set eager, everything else lazy.** The
  stores read synchronously at module scope / in `GlobalState`'s constructor ship
  in the boot snapshot; the rest hydrate on first access or on demand. Rejected:
  one eager all-stores snapshot — first paint would block on serializing every
  unbounded cache (`wikigameinfo`, `timestampStore`, `uploadedLogs`,
  `downloadManager.queue`, `sideloadedStore`) against `index.tsx`'s existing 8s
  hydration timeout.

- **D-04 — Synchronous read of a not-yet-hydrated store: return the caller's
  `defaultValue`, log a distinct warning, and kick off the async hydrate** so the
  next read is correct. Non-fatal, consistent with SEAM.md's Load-Bearing
  Invariant B ("unported channels must stay non-fatal") and with electron-store's
  own missing-key contract. Rejected: fail-loud-in-dev, and "make lazy sync reads
  impossible".

  **Known accepted risk:** this admits a silently-wrong first read that
  self-corrects — the same class of bug 27-05 was expensive to find. The warning
  must therefore be *distinct and greppable*, not folded into generic logging, so
  a wrong-first-read is diagnosable from a log rather than from a live repro.

### Write path

- **D-05 — Wire the writes AND a sidecar→renderer invalidation push.** Today
  `snapshotSet`/`snapshotDelete` (`src/preload/tauriTransport.ts:189-199`) send
  `storeSet`/`storeDelete`, but `src/backend/sidecar/handlers.ts` registers no
  such handler — the write is swallowed as an unported channel while the local
  snapshot updates optimistically, so the UI shows a change that never persists.
  This phase registers real `storeSet`/`storeDelete`/`storeNew` handlers *and*
  closes the reverse direction.

- **D-06 — Invalidation shape: per-key change event.** The sidecar emits
  `{ store, key, value }` on write; the renderer patches its snapshot in place.
  Reuse the existing push path (`sendFrontendMessage` → `electronStub`'s
  `BrowserWindow.webContents.send` → `frontend_message` Tauri event → the
  renderer's `on()` listener) — do not invent a new notification mechanism.

  **Implied constraint:** every sidecar-side write must funnel through a single
  choke point, or a write escapes unannounced and the renderer's copy silently
  diverges. Rejected: coarse dirty-store re-fetch, and per-store opt-in.

### Concurrency & secrets

- **D-07 — Cross-process write clobber is ACCEPTED and DOCUMENTED, not
  engineered around.** `fileStore` caches the whole JSON in memory at
  construction and rewrites it wholesale on every `set`, so a concurrently-running
  Electron build's writes get erased (and vice versa) across all ~18 stores.
  Running both builds against the same userData folder is a dev-only situation;
  the shipped product is one app. Rejected: re-read-before-write, an advisory lock
  file, and separating the Tauri build's userData folder (which would break the
  shared-folder property D-01 depends on and Phase 28 deliberately relied on).

  **Deliverable:** this must be written down as a known constraint (SEAM.md and/or
  a code comment in `fileStore.ts`) — the failure mode is *silent config loss*, so
  an undocumented acceptance reads as a bug to the next person.

- **D-08 — Secret policy flips to an ALLOW-LIST, on the Tauri path only.**
  Nothing reaches the renderer unless explicitly declared safe, per store. A
  newly-added secret field is then excluded by default rather than leaking until
  someone remembers to deny-list it — which is exactly how
  `humbleConfigStore.csrfToken` (main-process-only by design, per its
  `StoreStructure` comment) slipped past today's deny-list.

  **Scope is strictly the Tauri path:** the sidecar snapshot handler + the Tauri
  bridge. `src/preload/api/misc.ts`'s Electron-path deny-list stays
  **byte-identical** — flipping the shipped build to fail-closed risks blocking a
  legitimate read among the 379 `window.api.*` call-sites, which the
  additive/reversible invariant forbids. Rejected: one shared policy across both
  builds, and Electron-warn-only telemetry. **Accepted consequence:** the two
  builds have divergent secret policies until Electron is retired — this needs a
  comment at both sites or it reads as a bug (same hazard Phase 28's D-11 flagged).

  Today's duplication to be resolved on the Tauri side: `SECRET_STORE_KEYS` is
  declared in `src/preload/tauriTransport.ts:116` *and*
  `src/preload/api/misc.ts`, while `handlers.ts:43` separately hand-strips
  `refreshToken` at the source (T-27-09 defense-in-depth — keep the
  defense-in-depth property, just make the policy single-sourced).

### Post-research decisions (added 2026-07-22 after 29-RESEARCH.md)

Research contradicted two assumptions this CONTEXT was written under. These three
decisions were taken by the user after reading the findings and are **locked**.

- **D-13 — `CacheStore` dynamic-named stores: cover the 4 in the boot set only.**
  Research found the real boot set is ~15 stores (not 2), and includes four
  `CacheStore`-backed stores whose names are **not** `ValidStoreName`s:
  `legendary_library`, `gog_library`, `nile_library`, `zoom_library`. All four are
  read synchronously before mount and silently return defaults under Tauri today.
  They are IN scope for D-02's bar. The other ~15 dynamic `CacheStore` instances
  are lazily accessed and ride D-03's lazy tier without an explicit coverage
  guarantee. Rejected: all ~19 (the dynamic names aren't enumerable from
  `StoreStructure`, so the test's enumeration would be weaker), and
  `ValidStoreName`-only (would leave the 4 boot-set cache stores broken).

- **D-14 — Fix the shared-file clobber with a path-keyed `FileStore` singleton.**
  Research found `steamConfigStore` and `steamBottleConfigStore` resolve to the
  **same on-disk file** (`steam_store/config.json` — both fall through to
  electron-store's hardcoded `name: 'config'`). Real Electron survives this
  because `conf` re-reads from disk on every access; `fileStore.ts` caches once at
  construction and never re-reads, so the two instances clobber each other. This
  phase ACTIVATES the bug by making `steamBottleConfigStore` live in the sidecar —
  it is not pre-existing-and-dormant-forever, it is pre-existing-and-about-to-fire.

  Fix: two `FileStore`s resolving to the same path share one instance. Contained
  inside `fileStore.ts`, keeps reads synchronous. **In-process only** — the
  cross-process case remains accepted by D-07. Rejected: re-read-on-access (adds a
  disk read per access to a synchronous mount-time path), and giving the two
  stores distinct `name` options (changes on-disk layout → needs an Electron-side
  migration and moves existing users' bottle config; touches the shipped build).

- **D-15 — Extract the three heavy store declarations into thin modules.**
  `wineDownloaderInfoStore` (`wine/manager/utils.ts`), `downloadManager`
  (`downloadmanager/downloadqueue.ts`), and `migrationsStore` (`migration/index.ts`)
  are declared inside heavy host modules, so constructing them in the sidecar would
  drag those modules' import-time side effects in — exactly the import-time-wall
  class spike 009 documented. Move each `new TypeCheckedStoreBackend(...)`
  declaration into its own thin module and have the host module import from there,
  matching the shape the other 18 stores already have, so the coverage test can
  import all 21 uniformly. Rejected: importing the host modules (import-time
  side-effect risk), and excluding the three (`downloadManager` is exactly what
  Phase 30's install/uninstall slice needs).

### Claude's Discretion

- **D-09 — How the boot set is defined.** Hand-declared list vs derived from
  `registerStore()` / the frontend's module-scope `storeNew` calls
  (`src/frontend/helpers/electronStores.ts`). A derived boot set can't drift from
  what the renderer actually constructs; a declared one is explicit and greppable.
  Planner's call, subject to D-03/D-04.
- **D-10 — Whether `fileStore.persist()` becomes an atomic temp-file+`rename`
  write.** Today it is a plain whole-file `writeFileSync` — a crash mid-write
  truncates the config. Not required by D-02's bar, but it is a small, contained
  change and independent of the concurrency question D-07 declined. Planner's
  call.
- **D-11 — Whether `backend/cache.ts`'s direct `new Store()` path gets the same
  treatment as the `TypeCheckedStoreBackend` path**, or is left to the
  `Module._load` hook's existing substitution. It is the one store consumer that
  bypasses the typed wrapper (and uses `clearInvalidConfig` + `Symbol.iterator`),
  so D-02's walk-every-store test may not naturally cover it.
- **D-12 — Frame/naming for the new store channels** (`storeSet`/`storeDelete`/
  `storeNew` handlers and the change-event notification) — must stay consistent
  with `src/common/types/sidecarTransport.ts`'s existing shapes.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The seam this phase extends
- `.planning/phases/27-tauri-shell-walking-skeleton/SEAM.md` — §1 "the four wired
  channels" (item 4 is the snapshot handler this phase generalizes); §2
  "`fileStore.ts`" (the explicit known-stub this phase closes); §3 "The
  `electron-store` project-wide swap" (this phase's charter, and its warning that
  it is a phase-sized unit, not a shim); §"Incremental-Port Checklist" step 4;
  §"Load-Bearing Invariants" A (module-scope `window.api` attach order) and B
  (unported channels stay non-fatal) — both still binding.
- `.planning/phases/27-tauri-shell-walking-skeleton/27-CONTEXT.md` — LOCKED
  architecture: sidecar boundary, the 3-factory renderer bridge, the
  additive/reversible invariant. Note its "electron-store throws at construction
  under bare Node" finding — the reason `fileStore.ts` exists at all.
- `.planning/phases/28-tauri-keyring-real-safestorage-via-the-keyring-crate/28-CONTEXT.md`
  — D-04 (the sidecar must never write `TOKEN_STORE_KEY` into the shared
  `configStore`) is **still binding and must not be regressed** by a
  generalized write path. D-11's "divergent policies in one file need a comment"
  hazard is the direct precedent for D-08.
- `.planning/phases/28-tauri-keyring-real-safestorage-via-the-keyring-crate/28-PROOF.md`
  — the "Electron session untouched" proof shape, worth mirroring for D-07's
  documented constraint.

### Spike blueprint
- `.planning/spikes/009-node-backend-headless-sidecar/README.md` — the source of
  the "~18 files route through `electron_store.ts`" count and the 16-API /
  44-file / 220-endpoint coupling map.

### Existing code this phase touches
- `src/backend/sidecar/fileStore.ts` — the store implementation being grown;
  `resolveStorePath()` L43 (T-27-03 path-tampering guard — preserve it),
  `persist()` L113 (D-10's whole-file `writeFileSync`), `load()` L101
  (`clearInvalidConfig`-equivalent behavior).
- `src/backend/sidecar/handlers.ts` — L42 `sidecar:store-snapshot` (the 2-store
  handler being generalized; L43 hand-strips `refreshToken`, T-27-09). The
  missing `storeSet`/`storeDelete`/`storeNew` handlers land here.
- `src/preload/tauriTransport.ts` — L105-199: `StoreSnapshot`,
  `SECRET_STORE_KEYS` L116, `registerStore` L128, `hydrateStoreSnapshot` L142,
  `snapshotGet`/`snapshotHas`/`snapshotSet`/`snapshotDelete`.
- `src/preload/api/misc.ts` — `storeSet` L110 and the Electron-path
  `SECRET_STORE_KEYS` copy. **Electron branch must stay byte-identical (D-08).**
- `src/common/types/electron_store.ts` — `StoreStructure` (the ~18-store
  enumeration), `ValidStoreName`, `TypeCheckedStore`. Note
  `humbleConfigStore.csrfToken`'s "main-process-only, never in any
  sendFrontendMessage payload" comment — the D-08 motivating case.
- `src/backend/electron_store.ts` — `TypeCheckedStoreBackend`, the wrapper the
  ~18 stores go through.
- `src/backend/cache.ts` — L22 `new Store({ clearInvalidConfig: true })`, the
  direct-construction path that bypasses the wrapper (D-11).
- `src/frontend/helpers/electronStores.ts` — `TypeCheckedStoreFrontend`
  constructs at module scope and calls `window.api.storeNew` (D-09's derivation
  source; also the Invariant-A `tauriAttach` import).
- `src/frontend/index.tsx` — L63-76: `hydrateStoreSnapshot()` await + the 8000ms
  timeout D-03 is protecting.
- `src-tauri/src/main.rs` — L47 `STORE_SNAPSHOT_CHANNEL`, the four existing
  commands, `dispatch_rust_channel()`.
- `src/common/types/sidecarTransport.ts` — frame shapes + command-name constants
  any new channel must extend consistently (D-12).
- `src/backend/sidecar/__tests__/skeletonFlows.test.ts` — L260 "Test 4
  (snapshot)" asserts `steamConfigStore.userData` present / `refreshToken`
  absent; the regression test D-08 must keep passing.

### Store-name inventory (the ~18)
From `src/common/types/electron_store.ts`'s `StoreStructure`: `configStore`,
`wineDownloaderInfoStore`, `gogInstalledGamesStore`, `zoomInstalledGamesStore`,
`timestampStore`, `fontsStore`, `gogConfigStore`, `zoomConfigStore`,
`steamConfigStore`, `steamBottleConfigStore`, `nileConfigStore`,
`humbleConfigStore`, `sideloadedStore`, `downloadManager`, `gogSyncStore`,
`zoomSyncStore`, `gogPrivateBranches`, `wikigameinfo`, `uploadedLogs`,
`migrationsStore`, `gameOverridesStore`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`fileStore.ts`** already implements the full `TypeCheckedStoreBackend`
  method surface and the electron-store on-disk JSON layout — this phase extends
  it rather than replacing it (D-01).
- **`registerStore()`** (`tauriTransport.ts:128`) already exists and mirrors
  `storeNew` — the natural hook for D-03's tiering and D-09's derivation.
- **The `frontendMessage` → `frontend_message` push path** already carries
  `pushGameToLibrary`; D-06's change events ride the same rails, no new mechanism.
- **`skeletonFlows.test.ts`'s snapshot test** is the existing shape for D-02's
  walk-every-store test and D-08's secret-exclusion assertion.

### Established Patterns
- SEAM.md checklist step 4 pointed at this phase by name: extend the snapshot
  "rather than swapping `electron-store` project-wide in one shot — that full swap
  is its own phase-sized unit." This IS that unit.
- `handlers.ts` uses `electronStub`'s `ipcMain` directly, NOT `backend/ipc`'s
  typed `addHandler`, because no file under `src/backend/sidecar/` may import the
  real electron module. New store handlers must follow that rule.
- Defense-in-depth on secrets: the sidecar strips at the source AND the renderer
  filters. D-08 changes the policy shape, not the two-layer property.

### Integration Points
- `sidecar:store-snapshot` handler ↔ `hydrateStoreSnapshot()` — the boot-set
  contract (D-03).
- New `storeSet`/`storeDelete` handlers ↔ `snapshotSet`/`snapshotDelete` — the
  write path (D-05).
- Sidecar write choke point ↔ `sendFrontendMessage` — the invalidation push
  (D-06).
- `pathShim.getPath('userData')` — the shared-folder property D-01 relies on and
  D-07 accepts the consequences of.

</code_context>

<specifics>
## Specific Ideas

- The D-04 cache-miss warning must be **distinct and greppable** (its own marker,
  like `UNPORTED_CHANNEL_MARKER`), not folded into generic logging — a
  silently-wrong-then-self-correcting read is only diagnosable if the log says so.
- D-07's acceptance is only complete when it is **written down** (SEAM.md and/or a
  `fileStore.ts` comment). Silent config loss with no recorded rationale reads as
  a bug to the next reader.
- D-08's divergence between the Electron and Tauri secret policies needs an
  explicit comment at BOTH sites — Phase 28's D-11 flagged exactly this hazard for
  the plaintext-fallback divergence.
- `humbleConfigStore.csrfToken` is the concrete leak the allow-list closes; it
  should appear by name in the phase's verification, not just as a category.
- Phase 28's D-04 (sidecar never writes `TOKEN_STORE_KEY` to `configStore`) is a
  live constraint on the NEW write path — a generalized `storeSet` handler must
  not become the loophole that reopens it.

</specifics>

<deferred>
## Deferred Ideas

- **Cross-process write safety** (re-read-before-write, advisory lock, or a
  separate Tauri userData folder) — rejected this phase by D-07; revisit only if
  running both builds concurrently stops being a dev-only situation.
- **Flipping the Electron preload path to the allow-list** — deferred by D-08.
  Natural moment is the Electron-cutover phase (35), or earlier via a warn-only
  telemetry pass that proves the allow-list complete.
- **A real `onDidChange` / reactive store API** — D-06's per-key change events are
  the substrate for it, but GameLib doesn't use electron-store's `onDidChange`
  today; building the public API is not this phase.
- **Full electron-store semantics parity** (schema validation, migrations) —
  explicitly out of D-02's bar.
- **Porting install/uninstall/update-check IPC** — Phase 30, and the direct
  consumer of what this phase builds.

### Reviewed Todos (not folded)
- *Runtime `getProductInfo` appinfo dump to lock the osarch parser* — keyword
  false-positive ("config"); unrelated Steam PICS concern.
- *Startup download-resume silently auto-opens Steam-in-CrossOver for bottle
  games* — keyword false-positive ("phase"); unrelated Electron-side bug.
- *Productionize the macOS native Steam bridge* — keyword false-positive
  ("shim"); unrelated Idea B arc (Phase 24).
- *Steam bottle setup offers GPTK/Wine engines that produce a broken bottle* —
  area match only; unrelated to the store layer.

</deferred>

---

*Phase: 29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw*
*Context gathered: 2026-07-22*
