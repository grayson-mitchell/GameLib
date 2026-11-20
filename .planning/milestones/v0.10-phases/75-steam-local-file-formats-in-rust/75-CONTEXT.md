# Phase 75: Steam local file formats in Rust - Context

**Gathered:** 2026-11-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Every Steam local file GameLib reads or writes has **one implementation, in Rust**:

- text VDF/KV1, covering `appmanifest_*.acf`, `libraryfolders.vdf`, `registry.vdf`, the Valve
  client manifest and `installscript.vdf`;
- binary `shortcuts.vdf`;
- the local library scan;
- Steam root discovery.

TypeScript keeps policy and network work. At the end of the phase `@node-steam/vdf` and
`steam-shortcut-editor` are deleted, along with the TS readers and the residual TS ACF writer.

Out of scope:
- the owned-apps fetch and metadata/artwork enrichment, which stay in TS on `steam-user`/axios;
- the CM-client replacement for `steam-user`/`steam-session`, which is a separate spike;
- porting the install/uninstall/update polling state machines.

Third slice of the Node-to-Rust migration, after 63 (scanners) and 73 (depot pipeline).

</domain>

<decisions>
## Implementation Decisions

### Carried from Phases 63 and 73 (not re-asked)
- A Tauri-free library crate in the `src-tauri/` Cargo workspace. The app calls it in-process
  over `rustInvoke`, and headless tools such as `meta/bridgeCensus.ts` use a CLI binary
  (63 D-01..D-03). Any spawn from `src/`/`meta/` uses `createFakeHomeProfile()` (63 D-04).
- **Bytes never cross the JSON-lines pipe.** Paths go in and small typed results come out
  (63 D-08). The one exception is `shortcuts.vdf` edits, which go in as a described mutation,
  not a buffer.
- Today's sync callers (`parse(readFileSync(...))`) become async. They keep the same name and
  result type, now returning a Promise (63 D-09).
- Two-tier parity (63 D-12):
  - committed synthetic fixtures, run in CI through `cargo test` and a TS-vs-Rust Jest parity
    test;
  - a local-only sweep over every real file on this machine, covering every ACF in every
    library and bridge bottle, `libraryfolders.vdf`, `registry.vdf`, cached Valve manifests,
    `installscript.vdf` files and `shortcuts.vdf`. Real user files are never committed.
- **Delete gate** (63 D-13 / 73 D-15). All of these must hold:
  - zero unexplained sweep diffs;
  - a live macOS `pnpm tauri:dev` smoke on the Rust path covering library refresh, install
    polling, uninstall detection, the running-app poll and add-to-Steam (non-Steam shortcut);
  - the crate builds and passes `cargo test` on all three CI legs.

  Windows and Linux are verified by build and test, not live. After that the TS code, flags
  and both npm packages are deleted inside this phase. Restart dev after sidecar changes.

### Rust/TS boundary
- **D-01:** **Rust owns the typed readers and the scan.** That covers reading an ACF into typed
  fields, reading `libraryfolders.vdf` into library roots, the installed-map scan across Steam
  libraries and bridge bottles, StateFlags/manifest-flag reads, and the `registry.vdf`
  RunningAppID read.

  The polling and state machines in `steam/library/` stay TS policy code calling those
  readers: `installPolling`, `uninstallPolling`, `restartHold`, `resume`, `pollState`,
  `refresh` orchestration. Rust does not get a "parse anything → JSON tree" channel as the main
  boundary; ACF schema knowledge lives in Rust.
- **D-02:** **The owned-apps fetch and metadata/artwork enrichment stay in TypeScript**
  (`refresh.ts`'s `steam-user`/axios work, `licensedDemos`, metacritic capture). Only the
  local-file part of refresh moves.
- **D-03:** **Retire the residual TS ACF writer.** `finalizeToSteam` → `writeAppManifest`
  (`depot/finalizeAcf.ts`, `depot/appManifest.ts`) still runs for the no-depots finalize in
  `depotRust/install.ts:160`. Route it through the Rust ACF writer so that reading and writing
  share one ACF codec, then delete both TS files. The finalize rules carry over unchanged:
  - measured bytes on disk, never a manifest-derived sum (spike 001);
  - the `canWriteFullOwnership` StateFlags gate, fail-closed;
  - "a cancelled run never downgrades an installed manifest";
  - LastOwner stays a string;
  - the numeric appId/buildid assertions.

### VDF consumers
- **D-04:** **Every `@node-steam/vdf` import site moves** (13 non-test files):
  - `backend/utils.ts` (`getSteamLibraries`)
  - `cancelDelete.ts`
  - `acfInstalldir.ts`
  - `macSteamAdoption.ts`
  - `depot/betaBranch.ts`
  - `bridge/drm/valveClient.ts`
  - `library/manifestFlags.ts`
  - `library/resumeBreadcrumbs.ts`
  - `library/acfState.ts`
  - `library/runningPoll.ts` (Mac and Linux `registry.vdf`)
  - `library/installedMap.ts`
  - `meta/bridgeCensus.ts` (via the CLI)
  - plus any test-only users, which get rewritten or deleted
- **D-05:** **The Valve client manifest (`valveClient.ts`) moves onto the Rust parser, and its
  guards are kept on the Rust side.** It is network-sourced, so the Rust side keeps:
  - the `MAX_VALVE_MANIFEST_BYTES` size cap;
  - the shape checks (`win64` / `bins_win64` present);
  - rejection on the forbidden keys (`__proto__` etc.). Prototype pollution is impossible in
    Rust; the reject is kept for behavioural parity.
- **D-06:** **Fold `sharedRedists.ts`'s hand-written `parseKv1` into the Rust parser.** The Rust
  core tree keeps source order and duplicate sibling keys. Each typed reader chooses its own
  view: merged/last-wins as `@node-steam/vdf` behaves, for ACF and `libraryfolders.vdf`, or an
  ordered list for `installscript.vdf`. The result is one text-VDF parser in the repo.
- **D-07:** **Parity reference: investigate, and Steam-correct wins.** When Rust and
  `@node-steam/vdf` or `parseKv1` disagree on real input (escapes, duplicate keys,
  `[$WIN32]`-style conditionals, comments, unquoted tokens), the diff is a parity failure to
  explain, as in 63 D-07. The old parser is not assumed correct. Each accepted divergence is
  written down in the phase's parity record.
- **D-08:** **Two dev/advanced-only fallback flags:** one for text VDF/ACF reading (including
  the scan and discovery) and one for binary `shortcuts.vdf`. Each defaults to `rust` once its
  own parity passes, and either can be held on `ts` alone. Hidden from the normal UI. Both are
  deleted at the delete gate.

### shortcuts.vdf
- **D-09:** **Lossless binary-KV tree with a byte-identical round-trip.** Rust parses into a
  generic tree that keeps each node's original type tag (map, string, int32, and any other
  types it meets), key order and unknown fields. Reading and rewriting an unmodified file
  reproduces Steam's exact bytes. An add/update/remove changes only the entry GameLib touches.
  This replaces `steam-shortcut-editor`, whose `autoConvertBooleans`, `autoConvertArrays` and
  `LastPlayTime` date coercions are lossy.
- **D-10:** **Parity reference, in two parts:**
  - Byte-identical unmodified round-trip against Steam-written files: this machine's
    `~/Library/Application Support/Steam/userdata/35601368/config/shortcuts.vdf` in the local
    sweep, plus committed synthetic fixtures in CI.
  - Logical parity for edits: the parsed result after an add or remove matches what
    `steam-shortcut-editor` produced, compared by value, not bytes.
- **D-11:** **Atomic writes.** Write a sibling temp file and rename it over the original,
  replacing today's in-place `writeFileSync` (`nonesteamgame.ts` `writeShortcutFile`). A crash
  must not leave a truncated `shortcuts.vdf`. No `.bak`.

### Steam root discovery
- **D-12:** **Discovery moves to Rust, and the setting still overrides it.** A Rust
  discover-root call probes the platform candidates, and `config.ts`'s `getSteamCompatFolder`
  default asks it. A user-set `defaultSteamPath` always wins. Headless tools get the same answer
  through the CLI.
- **D-13:** **Windows:** read `HKCU\Software\Valve\Steam\SteamPath` first, then fall back to
  `%PROGRAMFILES(X86)%\Steam`. Verified by build and unit test, not live.
- **D-14:** **Linux candidates, in this order:**
  1. Flatpak (`~/.var/app/com.valvesoftware.Steam/.steam/steam`), with today's
     installed-check kept;
  2. `~/.steam/steam`;
  3. `~/.local/share/Steam`;
  4. Snap (`~/snap/steam/common/.local/share/Steam`).

  The first candidate that has `steamapps/libraryfolders.vdf` wins. If none qualifies, fall
  back to `~/.steam/steam`, as today. macOS is unchanged: `~/Library/Application Support/Steam`.

### Claude's Discretion
- **Crate placement.** Options are a new sibling crate (e.g. `gamelib-steamfiles`) or
  extending `gamelib-depot/src/acf.rs` into a shared module. Hard constraint: one ACF codec
  shared by the depot writer and the readers, with no second copy. A CLI could be a new binary
  or an extension of an existing one (`gamelib-scan-cli` / `gamelib-depot-cli`).
- Channel names and JSON result shapes, which mirror the existing TS result types.
- The cost of hot-path reads: install polling and the running-app poll read files about once
  a second. Choose between one `rustInvoke` per read and batched reads, and keep the 60 s
  timeout from being a concern.
- How the shortcuts mutation is expressed over the wire. Options are an add/remove/update
  description, or read-tree → TS edit → write-tree as long as bytes stay off the pipe and the
  tree is lossless.
- The Windows registry crate (e.g. `winreg`) and how `cargo test` covers registry discovery
  without a live Windows box.
- Whether Jest tests for TS callers mock the async boundary or spawn the real CLI (63
  precedent: either is fine).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Migration pattern (carried decisions)
- `.planning/phases/63-rust-migration-pattern-and-executable-scanners/63-CONTEXT.md` — crate/CLI/rustInvoke pattern, async signature relaxation, per-unit flags, two-tier parity, delete gate
- `.planning/phases/73-steam-depot-download-pipeline-in-rust/73-CONTEXT.md` — D-11 (ACF writing in Rust; TS decides policy inputs), D-14..D-16 parity/cutover/flag precedent
- `.planning/phases/73-steam-depot-download-pipeline-in-rust/73-PARITY.md` — shape of a parity record
- `.planning/research/STEAM-STACK.md` — why `@node-steam/vdf` was chosen originally (now being replaced)
- `src-tauri/crates/README.md` — workspace crate conventions

### Repo conventions
- `Skill("gamelib-conventions")` — fake-HOME isolation for CLI spawns, the sidecar exit contract, `<verify>` prettier check
- `Skill("spike-findings-gamelib")` — Steam native install + ACF adoption gotchas (spike 001 measured SizeOnDisk), Mac Steam client integration, Rust migration stack builds on Windows/Linux

### Code being replaced
- `src-tauri/crates/gamelib-depot/src/acf.rs` — existing Rust ACF writer (the one codec to share)
- `src/backend/storeManagers/steam/depot/finalizeAcf.ts`, `depot/appManifest.ts` — residual TS ACF writer (D-03)
- `src/backend/storeManagers/steam/depotRust/install.ts:160` — the no-depots finalize call site
- `src/backend/shortcuts/nonesteamgame/nonesteamgame.ts` — sole `steam-shortcut-editor` user
- `src/common/typedefs/steam-shortcut-editor.d.ts` — typedef to delete
- `src/backend/storeManagers/steam/bridge/sharedRedists.ts` — `parseKv1` (D-06)
- `src/backend/storeManagers/steam/bridge/drm/valveClient.ts` — network manifest guards (D-05)
- `src/backend/config.ts:47` — `getSteamCompatFolder` (D-12..D-14)
- `src/backend/utils.ts:601` — `getSteamLibraries`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `gamelib-depot/src/acf.rs`: Rust ACF writing already exists. Extend it or extract it into a
  shared codec.
- `gamelib-scan` and `gamelib-scan-cli`: the 63 template for a Tauri-free crate plus CLI.
- `depotRust/install.ts`: the existing TS → Rust job/finalize seam for D-03.

### Established Patterns
- Pure readers with injected `deps.paths` (e.g. `runningPoll.ts`'s `RunningPollProbeDeps`).
  Rust readers take explicit paths, so the TS deps seam stays the place where paths are
  resolved.
- Fail-soft reads: `runningPoll` returns 0 on a missing or unparseable file, and
  `installedMap` skips bad ACFs. Keep each caller's fail-soft behaviour on the async path.
- `valveClient.ts` validates before parsing (size, forbidden keys). That ordering carries into
  Rust.

### Integration Points
- `steam/library/*` pollers: reads become `await`ed, so check that each tick's ordering is
  unchanged.
- `meta/bridgeCensus.ts`: CLI spawn under `createFakeHomeProfile()`.
- `config.ts` settings default → Rust discovery call. Settings construction may currently be
  synchronous, so the planner must check whether the default can be async or must be resolved
  at boot and cached.

</code_context>

<specifics>
## Specific Ideas

- `shortcuts.vdf` exists on this machine (`userdata/35601368/config/`). Use it for the local
  byte-identical round-trip check.
- `@node-steam/vdf` merges duplicate sibling keys, which is why `parseKv1` exists. The Rust core
  tree must not merge, and views decide.

</specifics>

<deferred>
## Deferred Ideas

- Porting the install/uninstall/update polling state machines to Rust is a possible later
  slice, once the CM client moves.
- The owned-apps fetch and artwork enrichment move with the CM-client replacement spike
  (2026-11-09), not here.

</deferred>

---

*Phase: 75-steam-local-file-formats-in-rust*
*Context gathered: 2026-11-13*
