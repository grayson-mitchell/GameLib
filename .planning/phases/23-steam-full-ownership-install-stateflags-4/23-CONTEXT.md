# Phase 23: Steam full-ownership install (StateFlags=4) - Context

**Gathered:** 2026-07-17
**Status:** Ready for planning

<domain>
## Phase Boundary

GameLib authors a `StateFlags=4` (FullyInstalled) `appmanifest_{appId}.acf` that the real Steam client **trusts with no verify pass and no re-download** — GameLib owns the complete first install, Steam does nothing until the game's next update. This productionizes the spike-003 env-gated proof (`GAMELIB_SPIKE_STATEFLAGS4`) into the real Phase 21 native-install path.

**Reverses D-2 for first install** ("Steam owns completion; GameLib owns only first install") and **supersedes the locked "StateFlags=1026, never 4" requirement** — both were correct only while the depot download had no integrity guarantee. Phase 21's per-chunk sha1 gate + spike-003's file-mode handling make a trustworthy `4` achievable.

**In scope:** full-ownership first install (StateFlags=4), resume/interrupted-download ownership (also targeting a trustworthy 4), 1026 fallback path, `EDepotFileFlag` file-mode replication.
**Out of scope:** GameLib owning *updates* (delta-patching stays 100% Steam's job — moving this reopens the build-vs-bundle decision the spikes closed). Launch stays with `steam://` (DRM unchanged, D-1).

</domain>

<decisions>
## Implementation Decisions

### StateFlags policy
- **D-01:** **Write `StateFlags=4` when GameLib can prove a clean, complete install; fall back to Phase 21's `1026` verify-handoff when completeness can't be proven.** "Provable" = fresh full download (or a fully-reconciled resume) with every chunk sha1-verified and all file modes applied. 1026 is the last-resort safety net (e.g. missing manifest, unknown flag, unrecoverable partial), not the default.
- **D-02:** A trustworthy `StateFlags=4` requires ALL of the spike-proven load-bearing fields (do not ship a partial set): `StateFlags "4"`; `BytesToDownload == BytesDownloaded == SizeOnDisk` (non-zero); current **public-branch `buildid`** threaded from PICS `appinfo.depots.branches.public.buildid` (today `finalizeToSteam`/`writeAppManifest` hard-code `"0"` — must be threaded through `buildDepotPlan`); correct `InstalledDepots` GID set (already guaranteed by Phase 21 selection); executable file-mode bits (see D-05/D-06).
- **D-03:** **No new user-facing toggle.** StateFlags=4 becomes the behavior of the existing Phase 21 native-install path, which is already gated behind the D-13 opt-in setting. The 1026 writer is NOT removed — it remains reachable as the D-01 fallback.

### Ownership scope boundary (D-2 reversal)
- **D-04:** **GameLib owns resume/interrupted-download recovery**, not just the happy-path first install. A resumed download re-verifies every chunk (sha1) and re-applies file modes, and if it can prove the install is complete it writes a trustworthy `StateFlags=4` — the same guarantee as a fresh install. This is a genuine scope expansion beyond spike-003's minimum (partial-state tracking + re-selection/reconciliation logic) — flag for research/planning as the largest new lift.
- **D-05:** **Updates remain Steam's job.** No delta-patching, no integrity-repair ownership. Full ownership covers install + resume completion only.

### File-mode fidelity
- **D-06:** **Replicate the full `EDepotFileFlag` mode set, on all OSes.** POSIX (macOS/Linux): apply `Executable(32)` + `CustomExecutable(128)` (PROVEN load-bearing — without the exec bit, `os error 256` on launch) plus `ReadOnly(8)` + `Hidden(16)` defensively via chmod. Windows: replicate read-only/hidden via Windows file attributes. Rationale: match everything Steam's verify pass does, since StateFlags=4 skips that pass and nothing downstream applies these. The depot writer (`downloadDepotFiles`/`downloadSingleFile`) currently handles only Directory(64) + Symlink(512) — file modes are the known gap.

### Pre-ship validation gate
- **D-07:** Phase 23 ships only after real-hardware verification of: **(1)** a multi-depot larger title (e.g. Cyberpunk, once Phase 21's D-UAT-08 is verified) installing under StateFlags=4 across depots with no verify/re-download; **(2)** a confirmed **hard-DRM title** launching under StateFlags=4 (closes spike 001's still-open DRM caveat); **(3)** an **interrupt-then-resume** run (kill Steam/GameLib mid-download, resume, confirm Steam-trusted `4` + launch, no re-download). Prove on **macOS first** (where spikes ran); expand Windows/Linux OS coverage in a follow-up rather than gating this phase on all three platforms.

### Claude's Discretion
- Exact mechanism for detecting the current public buildid vs. a mid-download buildid change (if Steam publishes an update between download start and manifest write) — planner/researcher to decide; correct behavior is likely "write the buildid we actually downloaded," which Steam then reads as UpdateRequired (correct, not a bug).
- Where the "provable completeness" gate lives (in `finalizeToSteam`, a dedicated verifier, or the resume reconciler) — planner's call.

### Folded Todos
- **`steam-startup-download-resume-autoopens-crossover.md`** (area: general, score 0.6) — *Startup download-resume silently auto-opens Steam-in-CrossOver for bottle games.* Folded into **D-04**: resume ownership means GameLib, not Steam, drives interrupted-download recovery, so the resume path's side effects (including any Steam/CrossOver auto-open) must be owned and made explicit here rather than delegated.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spike proof (READ FIRST — this phase productionizes it)
- `.planning/spikes/003-stateflags4-full-ownership/README.md` — the validated experiment; the exact 5 load-bearing fields for a trustworthy StateFlags=4, the exec-bit root-cause, RUN 1/RUN 2 results, and the open items now belonging to THIS phase (the README says "Phase 22" — that predates Phase 22 being claimed by the macOS-bottles work; read those as Phase 23).
- `.planning/spikes/003-stateflags4-full-ownership/snapshot-after-gamelib.acf` — the actual StateFlags=4 manifest Steam accepted (reference field set/casing).
- `.planning/spikes/003-stateflags4-full-ownership/inspect-acf.mjs` — ACF inspection helper.

### Depot/manifest architecture (Phase 21 foundation this builds on)
- `.planning/spikes/MANIFEST.md` — locked depot-install decisions; note the "StateFlags=1026, never 4" entry is explicitly marked SUPERSEDED by spike 003, and the load-bearing-field list for a trustworthy 4.
- `.planning/notes/steam-depot-install-architecture.md` — full depot-download + adoption architecture background.
- `.planning/phases/21-steam-native-install/` — the native-install implementation (D-13 opt-in setting, 1026 ACF writer, depot orchestrator) this phase extends. Read 21's CONTEXT/PLANs for the depot pipeline shape.

### Code (grounded via graphify; confirm before editing)
- `src/backend/storeManagers/steam/depot.ts` — orchestrator: `buildDepotPlan()`, `finalizeToSteam()`. Where buildid must be threaded and the 4-vs-1026 decision is made.
- `src/backend/storeManagers/steam/depot/manifest.ts` — `writeAppManifest()` / `AppManifestParams`; currently writes `StateFlags "1026"`, `BytesToDownload/Downloaded "0"`, `buildid "0"`. Spike change is env-gated here.
- `src/backend/storeManagers/steam/depot/` download files (`downloadDepotFiles`/`downloadSingleFile`) — handle Directory(64)+Symlink(512); the file-mode (D-06) gap lives here.
- `src/backend/storeManagers/steam/depot/decompress.ts` — the per-chunk sha1 integrity gate that makes a trustworthy 4 defensible.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Env-gated spike code already exists** (commits 816a76c9, 6fa5a157) behind `GAMELIB_SPIKE_STATEFLAGS4` — StateFlags=4 + bytes==SizeOnDisk + real buildid + `chmod 0o755` on Executable/CustomExecutable. Phase 23 productionizes/generalizes this, it does not start from zero. Default-off path is byte-identical to the 1026 behavior (72/72 + 58/58 tests green at spike time).
- **Phase 21 per-chunk sha1 gate** (`depot/decompress.ts`, enforced in the worker pool) — the integrity guarantee that makes StateFlags=4 defensible; reuse as the "provable completeness" signal for D-01.
- **Phase 21 1026 ACF writer** — kept as the D-01 fallback; do not delete.

### Established Patterns
- **64-bit IDs are strings end-to-end** (manifest GIDs, SteamID64) — never `@node-steam/vdf.parse()` them (rounds past MAX_SAFE_INTEGER → forced re-download). Applies to every field written here.
- **D-13 opt-in gating** — native install already sits behind one backend accessor/setting; StateFlags=4 inherits it (D-03), no new toggle.

### Integration Points
- `finalizeToSteam` measures real `SizeOnDisk` and has `lastOwner` but does NOT thread `buildid` — the primary new wiring (D-02).
- File-mode application is a new step in the download-file path (D-06), running after the whole-file sha1 check.

</code_context>

<specifics>
## Specific Ideas

- WazHack (appId 264160) is the proven single-depot macOS validation title; Cyberpunk is the intended multi-depot validation title (pending Phase 21 D-UAT-08).
- The exec-bit surprise is the template for the risk this phase manages: **sha1 guarantees content, not filesystem mode** — anything Steam's verify pass does beyond bytes (file modes, and to-be-confirmed side effects) is now GameLib's responsibility because StateFlags=4 skips that pass.

</specifics>

<deferred>
## Deferred Ideas

- **Always-4 (remove 1026 entirely)** — rejected for now in favor of the 1026 fallback (D-01); revisit if the fallback proves never to fire in practice.
- **Windows/Linux validation gate** — deliberately deferred to a follow-up (D-07 ships macOS-first); not dropped.
- **Confirming non-file-mode verify-pass side effects are not load-bearing** (e.g. Steam-created config files) — spike flagged as possible; verify during Phase 23 validation, expand D-06 if found.

### Reviewed Todos (not folded)
- **`steam-bottle-gptk-engine-produces-broken-bottle.md`** (score 0.7) — a Phase 22 macOS-bottle / CrossOver-engine concern, unrelated to the depot manifest/install path. Belongs to Phase 22.
- **`steam-getproductinfo-appinfo-dump.md`** (score 0.2) — Phase 18 osarch-parser tooling; not relevant to StateFlags=4 install.

</deferred>

---

*Phase: 23-steam-full-ownership-install-stateflags-4*
*Context gathered: 2026-07-17*
