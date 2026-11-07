# Phase 72: Renderer trust boundary and process hardening - Context

**Gathered:** 2026-11-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Close the concerns from the 2026-11-07 concerns map (`.planning/codebase/CONCERNS.md`) that no other
phase owns, in three independent groups:

1. **Renderer trust boundary.** Open-path/URL allow-list (Rust and sidecar), `removeFolder`
   containment, capability trim plus `withGlobalTauri`, deleting the dead `*/ipc_handler.ts` modules,
   and a fail-closed default for the Steam token store.
2. **Process lifecycle.** Surface a dead sidecar to the user, make `uncaughtException` fatal,
   replace the `pkill -f` pattern kills with tracked-PID kills, and add a Windows Job Object.
3. **Supply chain and CI.** Advisory bumps, an audit gate, Dependabot security updates,
   `cargo deny`, and a Linux compile leg in `rust-test.yml`.

**Already moved out of this phase:** the zod bump belongs to Phase 67 (67 D-01/D-03, now landed:
`zod ^4.6.7`). Do not re-plan it.

**Not in scope (other CONCERNS items with no owner that this phase does not take):** loose CSP
(`img-src http:`), a per-boot nonce on sidecar→shell frames, chmod on third-party CLI auth files,
the `logSecretGate` CLI wiring, the Tauri `unstable` bump, and RPC frame size limits.

</domain>

<decisions>
## Implementation Decisions

### Dead sidecar handling (Group 2)
- **D-01: Surface the death, then offer Restart or Quit; never respawn in place.** When the shell
  sees the sidecar's stdout reach EOF (`sidecar.rs` reader, ~line 565) outside an intentional
  shutdown, it tells the user. Restart means a full app relaunch (the existing `app_relaunch` path),
  not a new sidecar under the live window, because store-manager module singletons and in-flight
  installs make an in-place respawn unsafe (CONCERNS, "Sidecar death is permanent and silent").
- **D-02: The notice is a Rust-side native dialog**, shown from the shell with the dialog plugin's
  Rust API (no new capability grant). It must work even when the renderer is wedged, so it has no
  frontend dependency.
- **D-03: Suppress the dialog on intentional exit.** App quit, `app_relaunch` and updater restarts
  also close the sidecar's stdout. The shell must record "shutdown in progress" before it closes the
  sidecar, and the EOF handler must check that flag, so no dialog appears during a normal quit. Plans
  must include a test that a normal quit raises no dialog.
- **D-04: `uncaughtException` becomes fatal.** `processGuards.ts` (~line 259) logs, flushes the log
  sinks, then exits non-zero. The shell then sees EOF and runs D-01. This follows Node's guidance
  against resuming after `uncaughtException`. Whether `unhandledRejection` gets the same treatment is
  Claude's discretion: research what it does today and say what was chosen and why.
- **D-05: One generic message.** No special wording for interrupted downloads or launches; installs
  already resume or verify on the next start.

### Open-path allow-list and removeFolder (Group 1)
- **D-06: Enforce in both layers; Rust is authoritative.** The Rust `shell_open_path` handler
  enforces the real rule, because it is the last hop. The sidecar rejects early, with a clear error
  and a log line. A parity test asserts that both layers reject the same inputs: `file://`, `smb://`,
  other URL schemes, relative paths, executables, `.app` bundles, and non-existent paths.
- **D-07: Strict split of the two channels.**
  - `openExternalUrl` accepts URLs only. It goes through the existing scheme check
    (`open_external_scheme_check`, `relay_commands.rs` ~line 173, or its sidecar mirror). Anything
    that fails is rejected; it never falls through to `shell.openPath`.
  - `openFolder` accepts only an absolute path that exists. `openUrlOrFile`'s fallthrough design is
    removed.
  - Every current renderer caller already fits this split: `openExternalUrl` is only given http(s)
    URLs, and `openFolder` only install, Wine-prefix and save paths. Verify that, and also check for
    non-renderer callers of `openUrlOrFile` (e.g. `steam://` launches) before changing it.
- **D-08: Directories open; files are revealed, never opened.** If `openFolder` gets a file path
  (e.g. a save file), it routes to `show_item_in_folder` (select in Finder/Explorer). No path
  through this channel may execute or open an executable or a `.app` bundle.
- **D-09: Contain `removeFolder` and make it awaitable.** The parent `folderPath` must pass
  `assertContainedPath` against the configured install roots and the default install path. Replace
  the 5 s `setTimeout` with an awaited delete; if research shows a delay is genuinely needed, the
  timer must be `unref()`-ed (sidecar exit contract).

### Remaining trust-boundary items (Group 1, following the CONCERNS recommendations)
- **D-10: Trim `src-tauri/capabilities/default.json`.** Drop `opener:default` and the scoped
  `shell:allow-execute`. Drop `updater:default` only if research confirms the renderer never calls
  the updater JS API: the capability description says it is "required for the JS auto-update API
  surface", but the concerns grep found no importer, so resolve the conflict with evidence. Set
  `withGlobalTauri: false`; the renderer reads only `__TAURI_INTERNALS__`. Remove the npm packages
  left with no importers. Update the capability's `description` prose to match. **A live
  `pnpm tauri:dev` boot is required after the trim**, because plugins can inject init scripts that
  need grants (see the `notification:allow-is-permission-granted` precedent).
- **D-11: Delete the dead `*/ipc_handler.ts` modules** (14 found on 2026-11-08; the roadmap said
  13), including the `execAsync(commandParts.join(' '))` path in `tools/ipc_handler.ts`. Before
  deleting, prove each is unreferenced.
- **D-12: The Steam token store fails closed.** The module default in `tokenStore.ts` (~line 198)
  becomes a store that throws on `setToken` (and does not return plaintext on read) until
  `bootstrap.ts` installs the real store. Remove the `ElectronTokenStore` plaintext write path.
  `clearOrphanedElectronToken()` cleanup may stay for existing on-disk leftovers.

### Ordering with Phases 66 and 71
- **D-13: 72 fixes the `pkill -f` kills now, with a minimal tracked-children registry.** Record the
  PID / process group at spawn in the existing spawn helpers. `handleExit`, sideload `stop()`,
  `nile/games.ts` and `legendary/games.ts` then kill by tracked PID/group instead of name pattern,
  and `killPattern` is deleted. Keep the registry small: Phase 66's single process runner will
  absorb it later. Test spawns follow the fake-HOME convention (`createFakeHomeProfile()`).
- **D-14: 72 lands the Linux compile leg in `rust-test.yml` as its first plan.** It runs
  `cargo check` (and `cargo test --bin gamelib-shell` if it works on ubuntu) with
  `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, and the same vite/SEA
  build prep as the existing legs. Phase 71 D-02 then skips its copy: update 71's CONTEXT note and
  the ROADMAP text when this lands. The operator is running the clippy-Windows-leg todo in parallel
  on another branch that edits the same file, so expect a small merge in `rust-test.yml`.
- **D-15: No gate on Phase 71 for the Rust allow-list.** If 71 has already moved `shell_open_path`
  into `shell_open.rs` (71 D-07), 72 writes the check there. If not, 72 creates `shell_open.rs`
  itself, holding `shell_open_path` (plus `shell_show_item_in_folder`) and the check, which does
  that piece of 71 D-07 early; 71 then moves only the remaining arms.
- **D-16: The three groups are independent, separately mergeable plans/waves.** Supply chain and the
  Linux leg go first (quick and unblocking for 71).

### Supply chain, CI and Windows (Group 3)
- **D-17: CI audit job plus Dependabot security-only updates.** Add a `pnpm audit --prod` job and
  `cargo deny check advisories`. Configure Dependabot for **security updates only** (npm and cargo),
  so it does not open routine version-bump PRs.
- **D-18: The audit job blocks on high/critical and warns on the rest** (`--audit-level high`, or
  the equivalent). `cargo deny` uses the same bar. The baseline must be clean of highs before the
  gate turns on.
- **D-19: Bump scope: clear every high plus the renderer moderates.** That is the `undici@^6`
  override to `>=6.29.1`, `follow-redirects` (via axios), `source-map-js` (via
  sanitize-html→postcss), `react-router >=7.18.0` and `i18next-http-backend >=3.0.5`. No unrelated
  major upgrades. Re-run `pnpm audit --prod` at plan time, because the advisory list is from
  2026-11-07.
- **D-20: Windows Job Object.** Assign the sidecar to a Job Object with
  `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` at spawn (`shell_state.rs` `shutdown_child` today kills only
  the sidecar PID). CI only compile-checks it. Verification is a **manual UAT item on the operator's
  Windows PC**: launch, start a legendary/gogdl operation, quit, and confirm in Task Manager that no
  child process survives. Follow the UAT item-shape convention.

### Post-research amendments (2026-11-08, operator-confirmed after 72-RESEARCH.md)
- **D-09 (amended): delete the renderer `removeFolder` channel instead of containing it.** Research
  found no renderer caller of `window.api.removeFolder`; the only live caller is trusted backend code
  (`downloadqueue.ts:410`), and containing against `defaultInstallPath` is circular (the renderer can
  write it via `setSetting`) and breaks custom install locations. Remove the preload export, schema,
  registration, regenerate the IPC contract, update the knip baseline. Keep an internal async helper
  using `fs.promises.rm` with `maxRetries`/`retryDelay`, with no timer at all.
- **D-18 (amended): cargo-deny has no severity threshold.** Clear the 6 rustls/rustls-webpki/
  webpki-root-certs advisories with `cargo update`. The 4 `zip` advisories (need zip >= 9; sole
  dependent is `tauri-plugin-updater`, which nothing invokes) get `ignore` entries in `deny.toml`,
  each with that reason.
- **D-19 (amended): `i18next-http-backend` goes to `^4.0.10`** (the operator prefers current
  versions; 2→3 was already a major). This also clears the 3 lows. A live locale-load check is required.
- **D-20 (confirmed): parity with Unix.** Games launched by the sidecar die with the Job Object on
  quit, as the Unix process-group kill already does. No breakaway flags.

### Claude's Discretion
- The final module and file names (`shell_open.rs` is the working name from 71 D-07).
- The wording and buttons of the dead-sidecar dialog, within D-01/D-05.
- Whether `unhandledRejection` also becomes fatal (D-04).
- The exact shape of the fail-closed token store (D-12) and the PID registry (D-13).
- The order of plans within a group.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source of the phase scope
- `.planning/codebase/CONCERNS.md`, §"Security Considerations": open-path, removeFolder, pkill,
  capability grants, token store, dependency advisories (with file and line references).
- `.planning/codebase/CONCERNS.md`, §"Fragile Areas": sidecar death, the Windows exit, the Linux leg.
- `.planning/ROADMAP.md`, `### Phase 72`: the goal text and its open questions (answered here).

### Cross-phase decisions this phase must honour
- `.planning/phases/71-rust-shell-module-decomposition/71-CONTEXT.md`: D-02 (the Linux leg, now
  owned by 72) and D-07 (the `shell_open.rs` home for `shell_open_path`).
- `.planning/phases/67-schema-validation-at-the-sidecar-ipc-boundary/67-CONTEXT.md`: D-01/D-03
  (67 owns zod). Its argument schemas cover shape only; 72's allow-lists are the semantic layer
  on top.
- `.planning/ROADMAP.md`, `### Phase 66`: the process runner that later absorbs D-13's registry.

### Repo conventions
- `Skill("gamelib-conventions")`: fake-HOME isolation for every spawn, the sidecar exit contract
  (`unref()`, no unbounded boot work), UAT item shape for the Windows UAT item, and the scoped
  `npx prettier --check` in every `<verify>` block.
- `Skill("spike-findings-gamelib")`: the Tauri capability/ACL model and why the store-embed origin
  is denied today (relevant to D-10).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/backend/sidecar/rendererPathGuard.ts`: `assertPlausibleAbsolutePath` and
  `assertContainedPath`, today used only by the wineTools and install flow registrations. Use them for
  D-07/D-09.
- `src-tauri/src/relay_commands.rs` `open_external_scheme_check` (~line 173): the existing URL
  scheme allow-list for D-07.
- The `shell_show_item_in_folder` arm, which already exists, is the reveal path for D-08.
- The `app_relaunch` arm and the dialog plugin, both called Rust-side (no capability needed per the
  `default.json` description), cover D-01/D-02.
- `src/backend/sidecar/keyringTokenStore.ts` / `bootstrap.ts` (~lines 1128-1145): how the real token
  store is installed (D-12).

### Established Patterns
- Rust-side plugin API calls bypass capabilities; only webview→Rust IPC is gated. That is why the
  grants in D-10 can go.
- `shutdown_child` on Unix sends SIGTERM to the process group, waits 2 s, then sends SIGKILL; the
  Windows path in D-20 should end up equivalent.
- The sidecar exits by event-loop drain at stdin EOF; every timer or handle must be `unref()`-ed.

### Integration Points
- `src-tauri/src/main.rs` ~line 829: the only `spawn_sidecar` call (Job Object assignment, D-20).
- `src-tauri/src/sidecar.rs` ~line 565: the EOF branch that fails pending invokes (D-01/D-03 hook).
- `src-tauri/src/store_embed.rs` ~line 2255: the current home of `shell_open_path` (D-15).
- `src/backend/sidecar/shellFilesFlowRegistration.ts` lines 148-158 and 245-252: the
  `openExternalUrl`, `openFolder` and `removeFolder` registrations.
- `src/backend/utils.ts`: `openUrlOrFile` (~441), `handleExit` (~321), `killPattern` (~972),
  `removeFolder` (~1490).
- `src/backend/sidecar/processGuards.ts` ~line 259: the `uncaughtException` handler.
- `.github/workflows/rust-test.yml`: the Linux leg (D-14), shared with the parallel clippy todo.

</code_context>

<specifics>
## Specific Ideas

- The operator will push after this discussion, run the clippy-Windows-leg todo on their Windows PC,
  and start planning 72 meanwhile, merging back at the first pause in planning. Keep 72's
  `rust-test.yml` edits easy to rebase.
- Verify the Windows Job Object by hand on the operator's PC (Task Manager), not in CI.

</specifics>

<deferred>
## Deferred Ideas

- Other unowned CONCERNS items not taken here: loose CSP `img-src http:`, a per-boot nonce plus
  Rust frame schema on sidecar→shell frames, `chmod 0600` on legendary/gogdl/nile auth files, the
  `logSecretGate` CLI and CI wiring, and an RPC frame size cap. Candidates for a later hardening phase.

### Reviewed Todos (not folded)
- `2026-11-07-clippy-ratchet-windows-leg.md` ("Extend the clippy ratchet to the Windows leg"): not
  folded. The operator is running it separately, in parallel, on their Windows PC (it needs a native
  Windows measurement). It touches `rust-test.yml` alongside D-14.
- The other keyword matches from `todo.match-phase` (Windows signing, blank-render, toast theming,
  Cat Quest bridge, etc.) are unrelated to this phase's scope.

</deferred>

---

*Phase: 72-renderer-trust-boundary-and-process-hardening*
*Context gathered: 2026-11-08*
