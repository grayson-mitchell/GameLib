# Phase 29: Tauri store layer — generalize the sidecar store beyond the two skeleton stores - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-22
**Phase:** 29-tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw
**Areas discussed:** fileStore.ts vs Rust store, Store coverage & hydration, Write path, Shared-store safety & secrets

---

## Gray Area Selection

All four presented areas were selected for discussion: Store coverage & hydration,
Write path (currently dropped), fileStore.ts vs Rust store, Shared-store safety &
secrets.

---

## fileStore.ts vs Rust store

### Q1: Who owns store persistence after this phase?

| Option | Description | Selected |
|--------|-------------|----------|
| Grow fileStore.ts (Node) | Sidecar keeps persistence; electron-store on-disk JSON layout preserved so both builds read each other's values; no new cross-process hop per read | ✓ |
| Move to a Rust/Tauri store | Rust owns files via `rustInvoke`; single writer, but every sidecar read becomes async+cross-process against ~18 module-scope synchronous `.get()` callers | |
| Split: Rust owns secrets, Node owns config | Formalizes Phase 28's keyring split | |

**User's choice:** Grow fileStore.ts (Node)
**Notes:** → D-01. Rust stays "the platform seam", not "the database".

### Q2: What's the bar for a "real store layer"?

| Option | Description | Selected |
|--------|-------------|----------|
| Every store round-trips, proven by test | All ~18 `ValidStoreName` entries construct + round-trip, asserted by a test that walks the union; plus `defaults` handling and `backend/cache.ts`'s direct `new Store()` path | ✓ |
| Plus real electron-store semantics parity | The above + atomic writes, `defaults` merging, dot-notation edge cases | |
| Only what the next IPC slices need | Cover just Phase 30's stores | |

**User's choice:** Every store round-trips, proven by test
**Notes:** → D-02. Method surface is already complete; the gap is coverage +
fidelity. Atomic writes dropped to Claude's discretion (D-10).

---

## Store coverage & hydration

### Q3: How should hydration work with ~18 stores?

| Option | Description | Selected |
|--------|-------------|----------|
| Tiered: boot set + lazy rest | Declared boot set eager; rest hydrate on first access. Bounds first paint as caches grow | ✓ |
| All stores, one eager snapshot | Simplest, fully synchronous bridge; risks blocking first paint against the 8s timeout | |
| Per-store registration drives it | Boot set derives from `registerStore`/`storeNew` calls | |

**User's choice:** Tiered: boot set + lazy rest
**Notes:** → D-03. The "derive from registration" idea survived as D-09
(Claude's discretion) for *how* the boot set is defined.

### Q4: What should a synchronous read of a not-yet-hydrated store return?

| Option | Description | Selected |
|--------|-------------|----------|
| Default + warn + kick off hydrate | Returns caller's `defaultValue`, logs a distinct warning, triggers async fetch. Non-fatal per Invariant B | ✓ |
| Fail loud in dev, default in prod | Catches wrong-first-read early without breaking shipped builds | |
| Make it impossible — no lazy sync reads | Enforced by test; strongest guarantee, requires full enumeration of module-scope reads | |

**User's choice:** Default + warn + kick off hydrate
**Notes:** → D-04. Accepted risk of a silently-wrong self-correcting first read;
mitigated by requiring a distinct greppable warning marker.

---

## Write path

### Q5: How far do we take writes this phase?

| Option | Description | Selected |
|--------|-------------|----------|
| Wire writes + sidecar→renderer invalidation | Real `storeSet`/`storeDelete`/`storeNew` handlers AND a change push back to the renderer | ✓ |
| Wire writes only | Fixes persistence; leaves renderer staleness open | |
| Writes + confirmation, not fire-and-forget | Request/response writes; would change the `send` factory shape and touch the Electron path | |

**User's choice:** Wire writes + sidecar→renderer invalidation
**Notes:** → D-05. Writes stay fire-and-forget in shape; the Electron path is
untouched.

### Q6: What shape should the invalidation take?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-key change event | `{store, key, value}` on write; renderer patches in place. Basis for a future `onDidChange` | ✓ |
| Dirty-store signal, renderer re-fetches | Coarser, chattier, immune to missed deltas | |
| Only for a declared subset | Push only where stale reads are user-visible | |

**User's choice:** Per-key change event
**Notes:** → D-06. Implies a single sidecar-side write choke point, else writes
escape unannounced. Rides the existing `frontendMessage` push path.

---

## Shared-store safety & secrets

### Q7: How do we handle cross-process write clobber?

| Option | Description | Selected |
|--------|-------------|----------|
| Re-read before write + atomic replace | Kills wholesale clobber and truncation; a read per write | |
| Accept it — document "don't run both at once" | Dev-only situation; shipped product is one app. Cheapest; failure is silent config loss | ✓ |
| Separate the Tauri build's userData folder | Structural, but breaks the shared-folder property D-01 depends on | |
| Single-writer lock file | Strongest correctness, most machinery, stale-lock failure mode | |

**User's choice:** Accept it — document "don't run both at once"
**Notes:** → D-07. Acceptance is only complete once written down (SEAM.md and/or
`fileStore.ts` comment). Atomic-write (the truncation half) survived separately
as D-10.

### Q8: How should secrets be governed across ~18 stores?

| Option | Description | Selected |
|--------|-------------|----------|
| Flip to an allow-list | Nothing reaches the renderer unless declared safe; new secret fields excluded by default | ✓ |
| Keep deny-list, single shared source | Smaller change; keeps the fail-open default | |
| Mark secrets in StoreStructure itself | Schema-driven; needs a runtime representation | |

**User's choice:** Flip to an allow-list
**Notes:** → D-08. Motivating leak: `humbleConfigStore.csrfToken`, which today's
deny-list misses.

### Q9: Does the allow-list apply to the Electron path too?

| Option | Description | Selected |
|--------|-------------|----------|
| Both paths, one shared policy | No drift; requires a genuinely complete enumeration or Electron features break | |
| Tauri fail-closed, Electron warn-only | Gathers the real read set from a live run, then flip | |
| Tauri path only | Electron preload stays byte-identical per the additive/reversible invariant; accepts divergent policies until Electron is retired | ✓ |

**User's choice:** Tauri path only
**Notes:** → D-08 scope clause. Divergence needs an explicit comment at both
sites — same hazard Phase 28's D-11 flagged.

---

## Claude's Discretion

- **D-09** — How the boot set is defined (hand-declared vs derived from
  `registerStore`/`storeNew`).
- **D-10** — Whether `fileStore.persist()` becomes an atomic temp-file+`rename`
  write (independent of the concurrency question D-07 declined).
- **D-11** — Whether `backend/cache.ts`'s direct `new Store()` path gets the same
  treatment as the `TypeCheckedStoreBackend` path.
- **D-12** — Frame/naming for the new store channels and the change-event
  notification.

## Deferred Ideas

- Cross-process write safety (re-read-before-write, advisory lock, separate
  userData folder) — rejected by D-07.
- Flipping the Electron preload path to the allow-list — deferred by D-08;
  natural moment is the Electron-cutover phase (35).
- A real `onDidChange` / reactive store API — D-06 builds the substrate only.
- Full electron-store semantics parity (schema validation, migrations) — outside
  D-02's bar.
- Porting install/uninstall/update-check IPC — Phase 30, the direct consumer of
  this phase.

### Reviewed Todos (not folded)

- *Runtime `getProductInfo` appinfo dump to lock the osarch parser* — keyword
  false-positive ("config").
- *Startup download-resume silently auto-opens Steam-in-CrossOver for bottle
  games* — keyword false-positive ("phase").
- *Productionize the macOS native Steam bridge* — keyword false-positive
  ("shim"); Phase 24 arc.
- *Steam bottle setup offers GPTK/Wine engines that produce a broken bottle* —
  area match only.
