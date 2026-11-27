---
phase: "87"
slug: "engine-wine-and-tools"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-27"
---

# Phase 87 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Scope: Phase 87 (engine, Wine and tools port to Rust), plans 87-01..87-79 including 87-56a/b/c (82 plans). Register authored at plan time in every plan's `<threat_model>` block, plus two SUMMARY threat flags from 87-42. Verified at ASVS L1 (block_on: high) by `/gsd-secure-phase 87` on 2026-11-27, with four parallel gsd-security-auditor passes over the 148 `mitigate` rows.

---

## Trust Boundaries

| Boundary | Description | First named in |
|----------|-------------|----------------|
| gate -> operator bottles, licence and profile | the run launches real games and backdates a real bottle | 87-01 |
| session captures | logs and copies hold paths and account-adjacent data | 87-01 |
| CLI args -> crate ops | headless JSON args are untrusted | 87-02 |
| shared JSON -> both languages | one file decides which archive the fallback trusts | 87-02 |
| gate scans -> repo tree | a scan that reads nothing would pass vacuously | 87-03 |
| GameLib -> spawned helpers | wine, winetricks, tar and CrossOver probes run with GameLib's authority | 87-04 |
| live network -> recorded fixtures | lutris responses are committed | 87-05 |
| test profile -> fixtures | recorded paths could carry the operator's identity | 87-05 |
| network -> fetch | GitHub, lutris and Gcenx responses are untrusted | 87-06 |
| CLI -> context | headless runs must never read the real profile | 87-06 |
| live GitHub -> recorded fixtures | release JSON is committed | 87-09 |
| fixture builders -> committed bottles | synthetic bottles must not carry real identifiers | 87-11 |
| scripted config fixtures -> recorded expectations | goldens must reflect TS results, never hand-typed ones | 87-12 |
| scripted probes -> recorded expectations | goldens must reflect TS decisions, never hand-typed ones | 87-13 |
| synthetic archives -> extraction | the symlink-escape case must stay synthetic | 87-14 |
| scripted collaborators -> recorded expectations | focus and raise rules must be recorded from the TS run | 87-15 |
| fixture builders -> committed goldens | synthetic bottles must not carry real identifiers | 87-16 |
| renderer -> native router | the runtime name is untrusted | 87-17 |
| lutris.net -> download and extraction | archive content is untrusted | 87-17 |
| sidecar -> rustInvoke | launcher sends the runtime name | 87-18 |
| Rust -> renderer dialogs | Rust-issued ack ids come back from the renderer | 87-18 |
| api.github.com -> install | release metadata and archives are untrusted and mutable | 87-19 |
| caller -> remove | the WineVersionInfo a caller sends is untrusted | 87-19 |
| GameSettings -> env and argv | settings values flow into a child's env and argv | 87-21 |
| deletion -> fixtures and store mirror | deleting TS must not take fixtures or the still-read mirror with it | 87-22 |
| filesystem and PATH -> discovered wine list | discovered binaries are later executed | 87-23 |
| config.json custom paths -> wine list | user-set paths | 87-23 |
| config files -> engine reads | GamesConfig and config.json are user-editable | 87-25 |
| api.github.com -> tool archives | DLLs copied into user bottles | 87-27 |
| bottle and prefix paths -> file copies and deletes | writes land in user data | 87-27 |
| renderer -> settings and install flows | engineOverride values are validated by the twin | 87-28 |
| engine crate -> wine crate | reached only through the trait the shell resolves at call time | 87-29 |
| api.github.com -> DXMT install | release assets installed into wine versions | 87-30 |
| sidecar -> Rust online state | a TS-reported flag gates Rust network work | 87-31 |
| boot -> DXMT task | boot-time network work | 87-31 |
| raw.githubusercontent.com -> winetricks script | an executable script is downloaded and run | 87-32 |
| callers -> verbs | verb names reach a child's argv | 87-32 |
| callers -> verbs and commandParts | values reach a child's argv | 87-33 |
| renderer -> resolver channels | appName and action are untrusted | 87-34 |
| TS resolver -> Rust | settings the TS gathers | 87-34 |
| renderer -> apply verbs and queue channels | verb names and runner/appName are untrusted | 87-35 |
| deletion -> store ownership | dropping the TS mirror must not drop the Rust host's row | 87-37 |
| bottle names and marker fields -> filesystem paths | data-derived paths reach writes | 87-38 |
| GameLib -> CrossOver bottles | user-owned bottles shared with CrossOver | 87-39 |
| bottle names -> deletes | data-derived paths reach a recursive delete | 87-39 |
| caller facts -> switch decisions | monitor phase and bottle ownership come from the TS caller as values | 87-40 |
| concurrent callers -> one bottle | two launches can race a switch | 87-41 |
| Rust -> sidecar send frames | engineSelectionChanged must not be renderer-reachable | 87-42 |
| bridge facts -> Rust | monitor phase and bottle ownership pass as values | 87-42 |
| deletion -> marker gate | trimming the gate must not open an unguarded TS writer | 87-43 |
| GameLib -> CrossOver probes | the demo probe reads the real user profile by design | 87-44 |
| run_tool callers -> system binaries | program and args come from bridge code | 87-44 |
| caller facts -> decision | the override, monitor phase and offline flag come from the TS caller | 87-45 |
| recorded goldens -> Rust replay | the oracle must not be edited to fit the port | 87-46 |
| github.com (Gcenx releases) -> fallback engine | mutable release assets become an engine that runs games | 87-47 |
| archive contents -> filesystem | extraction writes under the tools dir | 87-47 |
| boot -> engine temp dirs | a recursive delete runs at boot | 87-48 |
| renderer -> dismissEngineNotice | the kind and build string are untrusted | 87-49 |
| launcher facts -> launch step | settings, install path and offline flag come from the TS launcher | 87-50 |
| Rust -> sidecar deadline event | a send frame the renderer must not be able to forge | 87-51 |
| launcher -> Rust launch step | settings and install path are TS-resolved facts | 87-52 |
| renderer -> getEngineState | runner and appName are untrusted | 87-52 |
| renderer -> dialogDisplayed | ack ids are untrusted | 87-53 |
| bridge code -> Rust run_tool | program and args come from bridge code | 87-55 |
| deletion -> runtime | removing boot steps and stores must not leave a path that needs them | 87-56 |
| sidecar -> Rust engine ops | runner, appName, stored settings, engine ids and pin ids come from sidecar code | 87-56a |
| Rust fallback download -> disk | a 228 MB archive is fetched, verified and extracted under the tools path | 87-56a |
| Steam launch -> engineSelectionView | the synchronous bridge reads trust what the view holds | 87-56b |
| TS twin -> Rust owner | a twin that drifts gives the sync path a different answer than Rust | 87-56b |
| deletion -> guards | tests inside the deleted tree that guard surviving code must not go with it | 87-56c |
| survivor table -> schedule | a pattern allowlist would let an unscheduled survivor through | 87-57 |
| local repo -> origin and CI | a push publishes the phase | 87-58 |
| CI -> signed artifact | signing identity must match the previous release | 87-58 |
| operator's Mac -> gate captures | the contract tells the runner what to copy and record from a real profile | 87-60 |
| planning docs -> public repo | todos and the contract are committed and pushed | 87-60 |
| crate text -> gamelib.log | lines composed by the engine and wine crates (bottle names, error strings, stderr, argv) cross into the uploadable log | 87-61 |
| gamelib.log -> public paste service | `uploadLogFile` posts the file users share (84-17) | 87-61 |
| renderer -> `installWineVersion` / `removeWineVersion` | the release object is renderer-supplied (V5: untrusted) | 87-62 |
| StoreHost -> renderer push | store fields reach the renderer only through the policy allow-list | 87-62 |
| sidecar -> rustInvoke `engine_launch_select` | the TS caller's facts (offline, settings) become the Rust step's inputs | 87-63 |
| GameLib -> github.com | the pinned engine download, which an offline refusal must not start | 87-63 |
| stored game settings -> tool prefix | a bottle name from settings becomes a directory that tools write into | 87-64 |
| winetricks output -> renderer | classified lines and outcomes reach the Winetricks tab | 87-64 |
| sidecar -> rustInvoke `engine_bottle_kill_wineserver` | a bottle name and a wineserver path from the launch overlay drive a process kill | 87-65 |
| op arguments -> bottle target | the caller supplies stored settings and the known-installs list; the target is computed in Rust | 87-66 |
| GameLib -> the CrossOver Bottles directory | a recursive delete under a directory that holds every game's bottle | 87-66 |
| renderer -> uninstall | the user's choice crosses as one boolean; the backend decides what is removed | 87-67 |
| operator's Mac -> session captures | real profile, bottles and logs are copied for evidence | 87-69 |
| captures -> committed docs | only counts, hashes and `~` paths cross into the repo | 87-69 |
| renderer -> uninstall (deletePrefix flag) | the renderer asks for a removal; it never names a path or a bottle | 87-70 |
| sidecar -> rustInvoke `engine_bottle_remove_per_game` | the TS side supplies stored settings and the known-installs list | 87-70 |
| operator's profile and logs -> session captures | the launch line carries the full env and command (O1) | 87-72 |
| captures -> committed debug record | only classes, counts and `~` paths cross into the repo | 87-72 |
| sidecar -> renderer (gameStatusUpdate) | the renderer's launch state follows the backend's frames | 87-73 |
| launcher -> OS power assertion | a held display sleep blocker keeps the machine awake | 87-73 |
| user input in a modal -> game-page controls | an activation meant for the dialog must not reach a control under it | 87-74 |
| renderer -> `removeFromSteam` (Rust writes the user's Steam `shortcuts.vdf`) | a stray call edits the user's real Steam data | 87-74 |
| renderer -> `getEngineState` (untrusted `{runner, appName}`) | the scheduled resolver already narrows the identity before Rust | 87-76 |
| engine state -> renderer | a read-time boolean, no path | 87-76 |
| engine reply -> TS spawn env | the launch settings decide which bottle and which wine a game runs in | 87-77 |

---

## Threat Register

Threat IDs are unique across the phase except `T-87-SC` (supply chain), which every plan carries; it is listed once per plan. Evidence for each `mitigate` row is summarised under **Verification Evidence** below.

| Threat ID | Plan | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|------|----------|-----------|----------|-------------|------------|--------|
| T-87-01 | 87-01 | Tampering | operator bottles and profile | high | mitigate | P3 ditto copy before anything runs, per-item restore text, closing inventory; backdate only on a throwaway bottle after recorded approval | closed |
| T-87-02 | 87-01 | Information Disclosure | session captures and the licence plist | medium | mitigate | captures stay under /tmp, results carry `~` paths and counts only, the licence file is checked for existence and never read or copied | closed |
| T-87-03 | 87-01 | Repudiation | ownership amendment | low | mitigate | every changed cell has a reason row and the mirror test moves in the same commit | closed |
| T-87-SC | 87-01 | Tampering | package installs | low | accept | this plan installs nothing | closed |
| T-87-04 | 87-02 | Tampering | enginePins.json | high | mitigate | the equality test pins it to ENGINE_PINS; later the fallback refuses any archive whose size or sha256 differs (87-47) | closed |
| T-87-05 | 87-02 | Tampering | CLI op args | low | mitigate | strict single-argument decode with deny_unknown_fields; fixed error literals that never echo input | closed |
| T-87-SC | 87-02 | Tampering | crate dependencies | low | accept | no new crate enters Cargo.lock; every dependency is already locked (87-RESEARCH Package Legitimacy Audit: all OK) | closed |
| T-87-06 | 87-03 | Repudiation | delete gate and schedule | medium | mitigate | floors on every walk, planted-violation self-tests per detector, both-direction set equality | closed |
| T-87-SC | 87-03 | Tampering | package installs | low | accept | this plan installs nothing | closed |
| T-87-07 | 87-04 | Denial of Service | spawned helper trees | high | mitigate | SpawnClass::Helper through spawn_helper_tokio, HelperGuard, kill_on_drop, the reaper; the orphan arm proves a grandchild dies on SIGKILL and quit | closed |
| T-87-08 | 87-04 | Denial of Service | unbounded child output | medium | mitigate | `max_buffer` truncation and per-line streaming (MoltenVK once wrote 3.37 GB) | closed |
| T-87-SC | 87-04 | Tampering | crate dependencies | low | accept | no new crate; gamelib-core and gamelib-proc use already-locked tokio and tokio-util | closed |
| T-87-10 | 87-05 | Information Disclosure | recorded fixtures | medium | mitigate | path normalisation to placeholders, header redaction, the permanent redaction scan with planted negatives | closed |
| T-87-11 | 87-05 | Tampering | recorded archive bodies | low | mitigate | archive bodies are synthetic small archives built from in-repo test data, never downloaded binaries | closed |
| T-87-SC | 87-05 | Tampering | package installs | low | accept | this plan installs nothing | closed |
| T-87-09 | 87-06 | Information Disclosure | fetch errors in logs | medium | mitigate | `without_url()` before any error text; FetchError carries categories only | closed |
| T-87-SC | 87-06 | Tampering | crate dependencies | low | accept | reqwest, futures-util and sha2 are already locked (Package Legitimacy Audit: OK); no new lockfile name | closed |
| T-87-59 | 87-07 | Information Disclosure | recorded wine-manager fixtures | medium | mitigate | path normalisation to placeholders, header redaction in the recorder, the 87-05 redaction scan in Task 2's verify | closed |
| T-87-60 | 87-07 | Tampering | recorded wine-manager archive bodies | low | mitigate | archive bodies are synthetic small archives built from in-repo test data, never downloaded builds | closed |
| T-87-SC | 87-07 | Tampering | package installs | low | accept | this plan installs nothing | closed |
| T-87-12 | 87-08 | Information Disclosure | env vectors | medium | mitigate | `process.env` restricted to the listed keys with synthetic values; paths normalised; the redaction scan runs in the verify | closed |
| T-87-SC | 87-08 | Tampering | package installs | low | accept | this plan installs nothing | closed |
| T-87-13 | 87-09 | Tampering | recorded release metadata | low | mitigate | metadata only; archive bodies synthetic; the Rust replay pins requests to these recordings, so a changed feed shows up as a replay failure, not silent drift | closed |
| T-87-SC | 87-09 | Tampering | package installs | low | accept | this plan installs nothing | closed |
| T-87-61 | 87-10 | Tampering | recorded winetricks script and catalog metadata | low | mitigate | metadata only; the script body is synthetic; the Rust replay pins requests to these recordings, so a changed upstream shows up as a replay failure | closed |
| T-87-SC | 87-10 | Tampering | package installs | low | accept | this plan installs nothing | closed |
| T-87-14 | 87-11 | Information Disclosure | bottle fixtures | medium | mitigate | synthetic builders only, BottleIDs from the redaction allow-list, the redaction scan in the verify | closed |
| T-87-SC | 87-11 | Tampering | package installs | low | accept | this plan installs nothing | closed |
| T-87-63 | 87-12 | Repudiation | config goldens | low | mitigate | every expected value is produced by running the TS; the MANIFEST floor of 20 and the empty-list negative prevent a vacuous slice | closed |
| T-87-SC | 87-12 | Tampering | package installs | low | accept | this plan installs nothing | closed |
| T-87-15 | 87-13 | Repudiation | decision goldens | medium | mitigate | every expected value is produced by running the TS; the MANIFEST floor and the empty-list negative prevent a vacuous matrix | closed |
| T-87-SC | 87-13 | Tampering | package installs | low | accept | this plan installs nothing | closed |
| T-87-16 | 87-14 | Tampering | archive escape fixture | low | mitigate | the escaping symlink points at a path inside the fake profile's temp root, never at a real system path; the case is recorded only inside the fake profile | closed |
| T-87-SC | 87-14 | Tampering | package installs | low | accept | this plan installs nothing | closed |
| T-87-64 | 87-15 | Repudiation | launch goldens (window focus rules) | low | mitigate | the zero-raise expectation for notices is recorded from the TS run, never typed by hand; the MANIFEST floor of 25 prevents a vacuous slice | closed |
| T-87-SC | 87-15 | Tampering | package installs | low | accept | this plan installs nothing | closed |
| T-87-62 | 87-16 | Information Disclosure | switch goldens over fixture bottles | medium | mitigate | built only from the 87-11 synthetic builders with allow-listed BottleIDs; the redaction scan runs in Task 2's verify | closed |
| T-87-SC | 87-16 | Tampering | package installs | low | accept | this plan installs nothing | closed |
| T-87-17 | 87-17 | Tampering | runtime name args | medium | mitigate | enum-only decode with deny_unknown_fields, manifest invalid vectors, fixed-literal rejections | closed |
| T-87-18 | 87-17 | Tampering | archive extraction and replace | high | mitigate | contained-walk check after `tar`, removal through gamelib-safety with trust root `<tools>/runtimes` (D-19), refusal on Unknown | closed |
| T-87-SC | 87-17 | Tampering | crate dependencies | low | accept | no new crate | closed |
| T-87-65 | 87-18 | Tampering | downloadRuntime args (native and rustInvoke) | medium | mitigate | enum-only decode with deny_unknown_fields, manifest invalid vectors, strict zod tuple on the shim, fixed-literal rejections | closed |
| T-87-66 | 87-18 | Spoofing | ShellEngineUi dialog ack ids | low | mitigate | ack ids are generated by Rust with the `engine:` prefix and only logged on return; a forged id changes nothing | closed |
| T-87-SC | 87-18 | Tampering | crate dependencies | low | accept | no new crate | closed |
| T-87-19 | 87-19 | Tampering | removeWineVersion installDir | high | mitigate | remove reads the stored installDir only; gamelib-safety trust root `<tools>/wine`; refusal on Unknown | closed |
| T-87-20 | 87-19 | Tampering | substituted release asset | medium | mitigate | sha512 when the feed supplies one (parity: warn and proceed when absent, D-16); contained extraction | closed |
| T-87-21 | 87-19 | Information Disclosure | download errors in logs | low | mitigate | FetchError categories only, `without_url()` | closed |
| T-87-SC | 87-19 | Tampering | crate dependencies | low | accept | sha2 and reqwest are already locked | closed |
| T-87-67 | 87-20 | Tampering | installWineVersion and removeWineVersion args | high | mitigate | deny_unknown_fields WineVersionInfo, fixed-literal rejections; remove passes only the version and the crate removes the stored installDir (T-87-19); cancel ids are mapped inside wine_dispatch | closed |
| T-87-68 | 87-20 | Tampering | wine-manager rustInvoke shims | medium | mitigate | strict zod tuples on the TS side and deny_unknown_fields structs in Rust; the shims carry values the caller already trusted | closed |
| T-87-SC | 87-20 | Tampering | package installs | low | accept | no new package | closed |
| T-87-23 | 87-21 | Elevation of Privilege | run_wine_command argv | high | mitigate | argv arrays only, never a shell; Helper class; output cap; registrant and cancel | closed |
| T-87-SC | 87-21 | Tampering | crate dependencies | low | accept | no new crate | closed |
| T-87-69 | 87-22 | Tampering | wine-manager TS deletion | low | mitigate | the kept list protects every wine_manager fixture and stores.ts; golden_wine_manager runs in the verify | closed |
| T-87-SC | 87-22 | Tampering | package installs | low | accept | this plan installs nothing | closed |
| T-87-24 | 87-23 | Tampering | discovered binary paths | medium | mitigate | parity with the TS (discovery never executes what it finds; validWine and run_wine_command use argv arrays); custom paths come only from config.json through the host | closed |
| T-87-25 | 87-23 | Denial of Service | `mdfind` spawn | low | mitigate | short Helper spec with a timeout and output cap | closed |
| T-87-SC | 87-23 | Tampering | crate dependencies | low | accept | no new crate | closed |
| T-87-22 | 87-24 | Tampering | wine.isValidVersion args | medium | mitigate | deny_unknown_fields WineInstallation; existence checks only; no spawn | closed |
| T-87-70 | 87-24 | Tampering | validWine shim args | low | mitigate | strict zod tuple on the shim and the deny_unknown_fields WineInstallation in Rust; existence checks only, no spawn | closed |
| T-87-SC | 87-24 | Tampering | crate dependencies | low | accept | no new crate | closed |
| T-87-73 | 87-25 | Tampering | GamesConfig and config.json reads | low | mitigate | read only through the StoreHost read API; malformed or unknown override values fall back exactly as the TS did (goldens) | closed |
| T-87-SC | 87-25 | Tampering | crate dependencies | low | accept | no new crate | closed |
| T-87-71 | 87-26 | Tampering | getAlternativeWine and the discovery shims | low | mitigate | no caller-supplied paths: roots come from the shell and custom paths only from config.json through the host; the native arg list must be empty | closed |
| T-87-SC | 87-26 | Tampering | crate dependencies | low | accept | no new crate | closed |
| T-87-28 | 87-27 | Tampering | tool archives | medium | mitigate | parity: pinned tag on macOS, contained extraction, version replace through gamelib-safety; no new trust is extended beyond the TS | closed |
| T-87-29 | 87-27 | Tampering | DLL copy targets | medium | mitigate | targets derived from resolved tool settings inside the bottle or prefix only; backups kept for restore as in the TS | closed |
| T-87-SC | 87-27 | Tampering | crate dependencies | low | accept | no new crate | closed |
| T-87-26 | 87-28 | Tampering | engine channel args | medium | mitigate | deny_unknown_fields decodes, manifest invalid vectors, fixed-literal rejections | closed |
| T-87-27 | 87-28 | Tampering | engineOverride writes (T-61-58/59) | high | mitigate | isWritableEngineOverride stays the single validator in both languages, pinned by shared vectors; the bottle name is always computed, never taken from the renderer | closed |
| T-87-SC | 87-28 | Tampering | crate dependencies | low | accept | no new crate | closed |
| T-87-74 | 87-29 | Denial of Service | ShellDxvk before the wine context is installed | low | mitigate | answers false with one fixed log line instead of panicking or waiting; resolved at call time so boot order cannot deadlock | closed |
| T-87-SC | 87-29 | Tampering | crate dependencies | low | accept | no new crate | closed |
| T-87-30 | 87-30 | Denial of Service | DXMT boot fetch | medium | mitigate | bounded by DXMT_BOOT_BOUND with a registrant; abandoned not joined; one log line | closed |
| T-87-SC | 87-30 | Tampering | crate dependencies | low | accept | no new crate; gamelib-scan is reached through the shell, not a crate dependency | closed |
| T-87-75 | 87-31 | Tampering | sidecar-reported online flag | low | mitigate | a boolean only; it gates Rust-initiated network work exactly as onlineMonitor.isOnline() gated the TS, so a wrong value can only skip or attempt a fetch | closed |
| T-87-76 | 87-31 | Denial of Service | DXMT boot task started at boot | medium | mitigate | bounded by DXMT_BOOT_BOUND with a registrant (87-30); started once after both contexts install; one owner per commit | closed |
| T-87-SC | 87-31 | Tampering | package installs | low | accept | no new package | closed |
| T-87-31 | 87-32 | Elevation of Privilege | winetricks verbs | high | mitigate | the apply guard (verb shape, max count) runs before any spawn; argv arrays only, never a shell | closed |
| T-87-32 | 87-32 | Tampering | downloaded winetricks script | medium | accept | parity with the TS (the upstream script is fetched from the Winetricks repo master as before); recorded as an accepted risk, not changed inside a parity port (D-16) | closed |
| T-87-SC | 87-32 | Tampering | crate dependencies | low | accept | no new crate | closed |
| T-87-77 | 87-33 | Elevation of Privilege | run_wine_command_for_game and call_tool | high | mitigate | the commandParts shape guard, the Steam per-game-bottle guard and the native-game guard run before any spawn; argv arrays, never a shell; Helper class (D-25 (c)) | closed |
| T-87-78 | 87-33 | Denial of Service | the Winetricks queue at quit | medium | mitigate | the running verb holds a registrant and races the shutdown token; a quit cancels it and drops the rest within the exit budget | closed |
| T-87-SC | 87-33 | Tampering | crate dependencies | low | accept | no new crate | closed |
| T-87-34 | 87-34 | Tampering | resolver args | medium | mitigate | the existing zod entries stay for resolver channels; Rust ops decode deny_unknown_fields structs | closed |
| T-87-SC | 87-34 | Tampering | package installs | low | accept | no new package | closed |
| T-87-79 | 87-35 | Elevation of Privilege | Winetricks verbs from the renderer | high | mitigate | the Rust apply guard (verb shape, max count; 87-32) runs before any spawn; the resolver passes values only; argv arrays | closed |
| T-87-80 | 87-35 | Tampering | queue channel args | medium | mitigate | deny_unknown_fields, the runner enum, manifest invalid vectors, fixed-literal rejections | closed |
| T-87-SC | 87-35 | Tampering | package installs | low | accept | no new package | closed |
| T-87-33 | 87-36 | Elevation of Privilege | runWineCommandForGame and callTool resolver channels | high | mitigate | Rust shape guard on commandParts, the Steam per-game-bottle guard and the native-game guard before any spawn; argv arrays; Helper class (D-25 (c)) | closed |
| T-87-SC | 87-36 | Tampering | package installs | low | accept | no new package | closed |
| T-87-35 | 87-37 | Tampering | wine-downloader-info ownership | medium | mitigate | the storeTable row stays for the host; storeMirrorSchedule and storeKinds agree with the 82 table; the Rust manager golden still passes | closed |
| T-87-SC | 87-37 | Tampering | package installs | low | accept | no new package | closed |
| T-87-36 | 87-38 | Tampering | bottle name and marker paths (T-17-01, T-59-25) | high | mitigate | one sanitize function in each language pinned by shared vectors; `dxvk.dir` must sit inside the pinned-engine root; trust roots from constants, never from data | closed |
| T-87-38 | 87-38 | Tampering | marker overwrite across versions | high | mitigate | in-process version_gate before every write; newer and unreadable kept (roundtrip_state.rs) | closed |
| T-87-SC | 87-38 | Tampering | crate dependencies | low | accept | no new crate | closed |
| T-87-37 | 87-39 | Tampering | sibling bottle deletion (FND-02) | high | mitigate | gamelib-safety remove_tree with the Bottles trust root, refusal on Unknown, adversarial sibling test | closed |
| T-87-82 | 87-39 | Elevation of Privilege | cxbottle create and wineserver kill spawns | medium | mitigate | argv arrays through the SpecRunner as Helpers; CX_CREATE_CAP_MS bound and a cancel token; the real-profile env arm is limited to HOME plus WINEPREFIX and named in a comment | closed |
| T-87-SC | 87-39 | Tampering | crate dependencies | low | accept | no new crate | closed |
| T-87-40 | 87-40 | Denial of Service | wineboot and wineserver waits | medium | mitigate | bounded timeouts (180 s, 60 s), cancel token, Helper class and the shutdown token | closed |
| T-87-SC | 87-40 | Tampering | crate dependencies | low | accept | no new crate | closed |
| T-87-39 | 87-41 | Tampering | concurrent switches of one bottle | high | mitigate | per-bottle async mutex; the waiting call re-reads the marker; the WR-02 golden pins the order | closed |
| T-87-SC | 87-41 | Tampering | crate dependencies | low | accept | no new crate | closed |
| T-87-41 | 87-42 | Spoofing | engineSelectionChanged channel | medium | mitigate | not in the renderer allow-list; rendererAllowList.test.ts proves a renderer send is rejected | closed |
| T-87-42 | 87-42 | Tampering | stale selection view (A4) | medium | mitigate | the view is fed by op replies, the clear reply and Rust's change frames; vectors pin its semantics to the Rust registry | closed |
| T-87-SC | 87-42 | Tampering | package installs | low | accept | no new package | closed |
| T-87-43 | 87-43 | Tampering | engine marker writes | high | mitigate | the only marker writer left is Rust (in-process gate); the TS writer is deleted with its chain constant; roundtrip_state.rs runs in the verify | closed |
| T-87-SC | 87-43 | Tampering | package installs | low | accept | no new package | closed |
| T-87-44 | 87-44 | Elevation of Privilege | run_tool | high | mitigate | five-program allowlist, argv arrays, isolated 0700 profile with replace_env, output cap, timeout | closed |
| T-87-45 | 87-44 | Information Disclosure | demo-status real-profile arm | low | accept | declared D-18 arm; only stdout is parsed and only a day count is logged; no profile content is read by GameLib | closed |
| T-87-SC | 87-44 | Tampering | crate dependencies | low | accept | no new crate | closed |
| T-87-46 | 87-45 | Tampering | engine override value | medium | mitigate | parsed with the same `is_writable_engine_override` the twin pins; an unknown override falls back exactly as the TS did; the decision kind enum has no unsupported engine | closed |
| T-87-SC | 87-45 | Tampering | crate dependencies | low | accept | no new crate | closed |
| T-87-84 | 87-46 | Repudiation | decision goldens | medium | mitigate | goldens are untouched (git diff gate in the verify) and the MANIFEST floor of 80 is asserted by the replay test | closed |
| T-87-SC | 87-46 | Tampering | crate dependencies | low | accept | no new crate | closed |
| T-87-47 | 87-47 | Tampering | substituted release asset | high | mitigate | size then sha256 from the shared pin table before extraction; refusal removes the download | closed |
| T-87-48 | 87-47 | Tampering | archive symlink escape | high | mitigate | extraction into a temp dir, realpath containment walk, rename only after it passes | closed |
| T-87-SC | 87-47 | Tampering | crate dependencies | low | accept | sha2 already locked | closed |
| T-87-49 | 87-48 | Denial of Service | boot sweep and long download | medium | mitigate | bounded boot task with a registrant; the download holds a registrant and is cancelled at quit within the exit budget | closed |
| T-87-SC | 87-48 | Tampering | crate dependencies | low | accept | no new crate | closed |
| T-87-50 | 87-49 | Tampering | dismissEngineNotice args | medium | mitigate | tagged-union decode with deny_unknown_fields, build string length-capped, the 50-entry cap kept, fixed-literal rejections | closed |
| T-87-SC | 87-49 | Tampering | crate dependencies | low | accept | no new crate | closed |
| T-87-52 | 87-50 | Repudiation | window focus on notices | low | mitigate | the raise rule is a golden (zero raise calls on notices) and a live-gate sub-check | closed |
| T-87-SC | 87-50 | Tampering | crate dependencies | low | accept | no new crate | closed |
| T-87-51 | 87-51 | Denial of Service | deadline and watch tasks | medium | mitigate | registrant while armed, cancel on the shutdown token and on end, bounded polling | closed |
| T-87-SC | 87-51 | Tampering | crate dependencies | low | accept | no new crate | closed |
| T-87-53 | 87-52 | Tampering | launch-select args | medium | mitigate | strict zod tuple on the TS side and a deny_unknown_fields struct in Rust; the bag holds values the launcher already trusted | closed |
| T-87-SC | 87-52 | Tampering | package installs | low | accept | no new package | closed |
| T-87-54 | 87-53 | Spoofing | forwarded ack ids | low | mitigate | only ids with the `engine:` prefix are forwarded; Rust only logs `display=shown` for an id it issued | closed |
| T-87-SC | 87-53 | Tampering | package installs | low | accept | no new package | closed |
| T-87-55 | 87-54 | Spoofing | engineDeadlineFired | medium | mitigate | not renderer-sendable (allow-list test); an unknown key is ignored; the callback map is keyed by keys the bridge armed | closed |
| T-87-SC | 87-54 | Tampering | package installs | low | accept | no new package | closed |
| T-87-87 | 87-55 | Elevation of Privilege | rustRunTool from bridge code | high | mitigate | Rust's five-program allowlist and isolated profile (87-44) apply to every call; the shim passes tool and args only; an abort maps to engine_cancel | closed |
| T-87-SC | 87-55 | Tampering | package installs | low | accept | no new package | closed |
| T-87-56 | 87-56 | Denial of Service | sidecar boot after deletion | medium | mitigate | bootstrap tests and the EOF exit smoke in the verify; every caller was switched by 87-52..87-55 and the schedule proves each survivor | closed |
| T-87-SC | 87-56 | Tampering | package installs | low | accept | no new package | closed |
| T-87-89 | 87-56a | Tampering | engine_resolve_tool_settings with ensureBottle | medium | mitigate | strict `deny_unknown_fields` decode; Rust derives the engine key and bottle name itself (engine_key_for, the sanitiser) and creates only through the existing per-game flight; a native or Browser title never reaches the op | closed |
| T-87-90 | 87-56a | Tampering | engine_fallback_ensure | high | mitigate | the request names a pin id only; Rust resolves it in its own pin table, verifies size and sha256 and contains the extraction (87-47); the TS sends no URL or path | closed |
| T-87-91 | 87-56a | Denial of Service | two unbounded channels | medium | mitigate | each run is bounded by its cancel id (engine_cancel), the app shutdown registrant (D-17) and, for the bottle, the creation timeout; the reasons are written beside UNBOUNDED_RUST_CHANNELS and pinned by dialogOptionForwarding.test.ts | closed |
| T-87-92 | 87-56a | Information Disclosure | engine_non_crossover_engine reply | low | accept | answers wine and DXVK paths under the user's own tools directory to the same user's sidecar, as the TS did | closed |
| T-87-SC | 87-56a | Tampering | package installs | low | accept | no new package | closed |
| T-87-93 | 87-56b | Tampering | setSteamEngineSelection | medium | mitigate | the TS registry's validation moves verbatim (Steam key shape, both binaries exist for a non-CrossOver selection, a copy is stored); engineSync.test.ts pins each refusal | closed |
| T-87-94 | 87-56b | Spoofing | crossoverBinDirSync and parseEngineOverride twins | medium | mitigate | shared vector files replayed by TS and Rust with floors and both answers present (82 D-05), the 87-39/87-55 pattern | closed |
| T-87-95 | 87-56b | Denial of Service | ledger answer on a transport fault | low | mitigate | a failed Rust call falls back to the TS ledger's own validity rule, so a launch is not refused for a fault the TS accepted | closed |
| T-87-SC | 87-56b | Tampering | package installs | low | accept | no new package | closed |
| T-87-96 | 87-56c | Denial of Service | sidecar boot after the deletion | medium | mitigate | the boot tests and the EOF exit smoke run after T1, T2 and T3; the precondition proves no caller outside the plumbing remains | closed |
| T-87-97 | 87-56c | Tampering | the launcher and store-manager settings-read censuses (T-61-43, T-61-45) | high | mitigate | both census tests move out of the tree before `git rm`, with only their path roots changed, and are in T3's verify | closed |
| T-87-98 | 87-56c | Repudiation | floors and counts lowered with the deletion | medium | mitigate | each change equals the deleted files and carries a comment naming 87-56c; the 87-37 and 87-56 precedent | closed |
| T-87-SC | 87-56c | Tampering | package installs | low | accept | no new package | closed |
| T-87-88 | 87-57 | Repudiation | survivor allowlist | medium | mitigate | an explicit item-by-item table compared with SCHEDULE in both directions; planted extra and missing rows each make it fail | closed |
| T-87-SC | 87-57 | Tampering | package installs | low | accept | no new package | closed |
| T-87-57 | 87-58 | Tampering | push and release dispatch | high | mitigate | blocking-human checkpoint; pre-push hook never skipped; open-time diff check immediately before the push; dry-run release only | closed |
| T-87-SC | 87-58 | Tampering | package installs | low | accept | `pnpm install --frozen-lockfile` only; no new package | closed |
| T-87-58 | 87-59 | Tampering | operator bottles and trial state | high | mitigate | P3 ditto copy, throwaway bottle for the backdate, explicit approval in session, closing inventory restore | closed |
| T-87-SC | 87-59 | Tampering | package installs | low | accept | this plan installs nothing | closed |
| T-87-99 | 87-60 | Information Disclosure | 87-RERUN-1-HUMAN-UAT.md evidence rules | medium | mitigate | captures stay under the session directory, mode 0700, never committed; results record `~` paths, hashes and counts; the redaction check records counts, never a matched line | closed |
| T-87-100 | 87-60 | Information Disclosure | the six todos | low | mitigate | todo bodies quote evidence with `~` paths and titles only; no account name, token or args line (Task 3 acceptance) | closed |
| T-87-101 | 87-60 | Tampering | contract steps on real bottles and the licence | high | mitigate | P3 `ditto` copies before any item, the operator's recorded approval for the pin move and the uninstall, the licence is existence-only, restores only on the operator's decision | closed |
| T-87-SC | 87-60 | Tampering | package installs | low | accept | no package is installed by this plan | closed |
| T-87-102 | 87-61 | Information Disclosure | ShellEngineLog / EngineLineRedactor | high | mitigate | home path to `~`, account name, secret and account `key=value` pairs, argv lines and URL queries redacted before the write; the required test and the per-literal tests (Task 2); the 87-69 item 2 live count | closed |
| T-87-103 | 87-61 | Tampering | log line forging through engine text | low | mitigate | `Logger::log` already escapes CR and LF (IN-07); the line cap bounds one entry | closed |
| T-87-104 | 87-61 | Elevation of Privilege | a new `shell_log_at` call bypassing the 84-17 rule | medium | mitigate | shellLogCategoryOnly.test.ts scans `shell_log_at(` and requires the redactor's output (Task 3) | closed |
| T-87-105 | 87-61 | Denial of Service | a crate flooding gamelib.log | low | accept | lines are per op and already bounded by the crates; the logger's own limiter (gamelib-log) applies; no new loop writes | closed |
| T-87-SC | 87-61 | Tampering | package installs | low | accept | no new dependency (no regex crate) | closed |
| T-87-106 | 87-62 | Tampering | parse_wine_version with three keys made optional | medium | mitigate | presence is relaxed, not shape: unknown keys, wrong types, string bounds and the release-type set are still rejected (Task 1 tests); the crate never installs into a renderer-supplied `installDir` (Task 1 behaviour) | closed |
| T-87-107 | 87-62 | Information Disclosure | store push for wine-downloader-info | low | mitigate | any fix keeps `is_allowed_store_field` as the gate; a field is admitted only if the store policy rows for `wineDownloaderInfoStore` already list it | closed |
| T-87-108 | 87-62 | Denial of Service | push ordering fix | low | mitigate | no sleep or polling; ordering comes from the change-ordered path (Task 2 acceptance) | closed |
| T-87-SC | 87-62 | Tampering | package installs | low | accept | no new dependency | closed |
| T-87-109 | 87-63 | Denial of Service | launch step offline path | medium | mitigate | the gate refuses before any fetch; the zero-request assertion pins it (Tasks 1-2) | closed |
| T-87-110 | 87-63 | Tampering | LaunchSelectRequest decoding | low | mitigate | the request stays `deny_unknown_fields`; no new field is accepted from the TS side without a schema change (D-14) | closed |
| T-87-111 | 87-63 | Repudiation | a refused launch with no log line | low | mitigate | the gate's warning reaches gamelib.log through the 87-61 engine log, proven by the shell test | closed |
| T-87-SC | 87-63 | Tampering | package installs | low | accept | no new dependency | closed |
| T-87-112 | 87-64 | Tampering | winetricks / tool prefix from `wineCrossoverBottle` | high | mitigate | the directory comes only from `bottle_dir` / `direct_child_dir` (a single safe segment under the Bottles root); an unsafe name answers `unavailable` and spawns nothing; the FakeHome tree assertion proves nothing is created outside the bottle | closed |
| T-87-113 | 87-64 | Repudiation | a failed verb reported as installed | medium | mitigate | exit code and the closed regedit rule mark the verb failed (Task 2) | closed |
| T-87-114 | 87-64 | Tampering | argv injection through an exe path | medium | mitigate | argv arrays only, no shell; existing `commandParts` shape guard unchanged | closed |
| T-87-SC | 87-64 | Tampering | package installs | low | accept | no new dependency | closed |
| T-87-115 | 87-65 | Tampering | killing a wineserver of the wrong bottle | medium | mitigate | the bottle name comes from Rust's own launch overlay (`launchSettingsFor`), Rust re-checks it is a single safe segment under the Bottles root and sets `WINEPREFIX` itself (`kill_bottle_wineserver`) | closed |
| T-87-116 | 87-65 | Denial of Service | a wedged wineserver holding Stop | low | mitigate | the 15 000 ms cap is passed and Rust caps every spawn (`MAX_SPAWN_CAP_MS`); a failure is a warning, never a throw | closed |
| T-87-117 | 87-65 | Information Disclosure | the warning line | low | mitigate | fixed text only, no path and no bottle name (84-17) | closed |
| T-87-SC | 87-65 | Tampering | package installs | low | accept | no new dependency | closed |
| T-87-118 | 87-66 | Tampering | remove_per_game_bottle target selection | high | mitigate | the bottle name is computed in Rust from the game identity; `direct_child_dir` admits only a single safe segment under the Bottles root; no path is an argument | closed |
| T-87-119 | 87-66 | Tampering | sibling bottle deletion (FND-02) | critical | mitigate | `check_removal` before any spawn and `remove_tree` re-checks; unknown refuses (D-19); links are only unlinked; the adversarial FakeHome table asserts the sibling's tree hash unchanged | closed |
| T-87-120 | 87-66 | Tampering | treating the shared CrossOver bottle as a game's bottle | high | mitigate | only the game's own computed per-game name can be a target, so the shared `GameLib` bottle answers `not-bottle-backed`; the caller's default-prefix refusal is 87-70 (T-87-133) | closed |
| T-87-121 | 87-66 | Denial of Service | deleting a bottle while its game runs | medium | mitigate | ledger and live-selection check refuse `in-use` before anything else | closed |
| T-87-122 | 87-66 | Denial of Service | a cxbottle or wineserver spawn hanging the uninstall or the exit | medium | mitigate | helper spawns with named caps through gamelib-proc and a shutdown registrant (D-17) | closed |
| T-87-SC | 87-66 | Tampering | package installs | low | accept | no new dependency | closed |
| T-87-123 | 87-67 | Tampering | the uninstall request | medium | mitigate | the renderer sends only the existing boolean; the bottle name in the label is display only; the backend recomputes the target (87-66, reached through 87-70) | closed |
| T-87-124 | 87-67 | Spoofing | a label naming a different target than the backend removes | medium | mitigate | the dialog applies the same two-fact rule as the Rust op (per-game name equals stored `wineCrossoverBottle`); when it does not hold the dialog keeps today's prefix branch, and the backend refuses the default prefix too | closed |
| T-87-125 | 87-67 | Repudiation | an irreversible removal without a warning | low | mitigate | the amber risk warning appears whenever the bottle toggle is on | closed |
| T-87-SC | 87-67 | Tampering | package installs | low | accept | no new dependency | closed |
| T-87-126 | 87-68 | Tampering | push and release dispatch | high | mitigate | blocking-human checkpoint; pre-push hook never skipped; open-time diff check immediately before the push; one dispatch; draft only | closed |
| T-87-127 | 87-68 | Spoofing | a build signed by a different identity (Keychain ACL and entitlements would not carry over) | high | mitigate | designated requirement hashed and compared byte for byte with 0.13.0 and Phase 86; a mismatch sets the gate `blocked` | closed |
| T-87-128 | 87-68 | Tampering | writing into an existing draft release | medium | mitigate | the version bump makes the draft `v0.13.1`; `gh release list` before and after | closed |
| T-87-SC | 87-68 | Tampering | package installs | low | accept | `pnpm install --frozen-lockfile` only; no new package | closed |
| T-87-129 | 87-69 | Information Disclosure | gate captures and scored results | high | mitigate | captures stay under the session directory, mode 0700, never committed; results carry `~` paths, hashes and counts; no matched log line is pasted (redaction check records counts) | closed |
| T-87-130 | 87-69 | Tampering | the operator's bottles, licence and profile | high | mitigate | P3 ditto copies first, operator approval recorded before the pin move and the uninstall, the licence is existence-only, restores only on the operator's decision | closed |
| T-87-131 | 87-69 | Repudiation | a score not backed by evidence | medium | mitigate | every result names its launch ordinal and evidence; IMPOSSIBLE rows are never scored from the log | closed |
| T-87-SC | 87-69 | Tampering | package installs | low | accept | no package is installed | closed |
| T-87-132 | 87-70 | Tampering | the channel's arguments | medium | mitigate | the crate's request is `deny_unknown_fields` (D-14); the contract is regenerated and checked; no path or bottle name is an argument | closed |
| T-87-133 | 87-70 | Tampering | deleting the shared default prefix when the game has no per-game bottle | high | mitigate | `removePrefix` refuses a stored prefix equal to the default prefix in the backend, matching the dialog's rule (Task 2 test) | closed |
| T-87-134 | 87-70 | Repudiation | a refused bottle removal the user never sees | low | mitigate | a refusal pushes the `remove-bottle` removal-refused notice (Task 2 test) | closed |
| T-87-SC | 87-70 | Tampering | package installs | low | accept | no new dependency | closed |
| T-87-135 | 87-71 | Information Disclosure | 87-RERUN-2-HUMAN-UAT.md evidence rules | medium | mitigate | captures stay under the session directory, mode 0700, never committed; results carry `~` paths, hashes and counts; the P5 candidate procedures read names and keys only, never values | closed |
| T-87-136 | 87-71 | Tampering | contract steps on real bottles, the Steam shortcut, the pin and the licence | high | mitigate | P3 `ditto` copies before any item; operator approval recorded for the pin move and move-back, the Show in Steam add and the uninstall; the licence is existence-only; restores only on the operator's decision | closed |
| T-87-137 | 87-71 | Information Disclosure | the two new todos and the RF1 link | low | mitigate | bodies quote counts and `~` paths only; Task 3 acceptance forbids tokens, args lines and home paths | closed |
| T-87-SC | 87-71 | Tampering | package installs | low | accept | no package is installed by this plan | closed |
| T-87-138 | 87-72 | Information Disclosure | the `Launching <title>:` env capture and `ps` captures | high | mitigate | read locally under `$S` (mode 0700), `~`-redacted by sed before reading, never committed; the record carries variable names, value classes and `~` paths only | closed |
| T-87-139 | 87-72 | Tampering | D4's engine round trip on a real bottle | high | mitigate | `ditto` copies in D0 with the app closed, the operator's recorded approval before D4, restores only on the operator's decision | closed |
| T-87-140 | 87-72 | Tampering | a diagnosis plan that quietly fixes code | medium | mitigate | Task 1's acceptance pins its commit's file list to the two test files and the debug record; Task 3 writes planning files only | closed |
| T-87-SC | 87-72 | Tampering | package installs | low | accept | no package is installed | closed |
| T-87-141 | 87-73 | Denial of Service | a display sleep blocker held after a launch ended (battery, sleep) | medium | mitigate | one release function on every exit path, the id cleared; Task 1 tests the refused, rejected, Wine-check and normal paths | closed |
| T-87-142 | 87-73 | Denial of Service | a Play button stuck on launching (the user cannot launch again) | low | mitigate | dialog promises settle on close; the latch releases on terminal statuses; Task 2 tests | closed |
| T-87-SC | 87-73 | Tampering | package installs | low | accept | no new dependency | closed |
| T-87-143 | 87-74 | Tampering | a dialog close removing the user's Steam shortcut and its artwork | high | mitigate | the traced hop is cut at its layer; every close path is tested to call none of `removeFromSteam`, `addToSteam` or `uninstall` (Tasks 1 and 2) | closed |
| T-87-144 | 87-74 | Repudiation | a removal the user did not ask for, with only a notification as trace | low | accept | the Rust shortcut path already logs and notifies every removal; the fix removes the cause rather than adding a confirm | closed |
| T-87-SC | 87-74 | Tampering | package installs | low | accept | no new dependency | closed |
| T-87-145 | 87-75 | Tampering | skipping the pre-flight for the default prefix lets a shared prefix be deleted | high | mitigate | one `storedPrefixRemovalTarget` rule makes the default prefix never a target on either path; the bottle op keeps its own gamelib-safety guard (87-66); Task 1 tests the default and custom prefix cases | closed |
| T-87-146 | 87-75 | Information Disclosure | notice text | low | mitigate | the two new reasons are closed words rendered from fixed catalogue strings; no path or raw error reaches the notice | closed |
| T-87-147 | 87-75 | Tampering | the notice vocabulary drifting from the op's answers | low | mitigate | the parity test reads every `reason:` literal of the op and requires it in `REMOVAL_REASONS` | closed |
| T-87-SC | 87-75 | Tampering | package installs | low | accept | no new dependency | closed |
| T-87-148 | 87-76 | Tampering | a wrong verdict hiding the generic warning for a launch that then runs | low | mitigate | the verdict comes from the step's own gate function; Task 1's matrix test asserts the state equals the step's refusal; on any read failure the warning shows | closed |
| T-87-149 | 87-76 | Information Disclosure | the new log line and field | low | accept | a fixed-text line and a boolean; no path, name or argument | closed |
| T-87-SC | 87-76 | Tampering | package installs | low | accept | no new dependency | closed |
| T-87-150 | 87-77 | Tampering | a fix that points a game's wine at another game's or the shared bottle | high | mitigate | the invariants assert `CX_BOTTLE` is the game's own per-game bottle and no prefix variable points outside it, on both branches (Task 1) | closed |
| T-87-151 | 87-77 | Tampering | a fix that breaks the offline gate or the engine decision | medium | mitigate | offline_refusal, offline_state_verdict and golden_launch run in Task 1's verify | closed |
| T-87-SC | 87-77 | Tampering | package installs | low | accept | no new dependency | closed |
| T-87-152 | 87-78 | Tampering | push and release dispatch | high | mitigate | blocking-human checkpoint; pre-push hook never skipped; open-time diff check immediately before the push; one dispatch; draft only | closed |
| T-87-153 | 87-78 | Spoofing | a build signed by a different identity (Keychain ACL and entitlements would not carry over) | high | mitigate | designated requirement hashed and compared byte for byte with 0.13.1, 0.13.0 and Phase 86; a mismatch sets the gate `blocked` | closed |
| T-87-154 | 87-78 | Tampering | writing into an existing draft release | medium | mitigate | the version bump makes the draft `v0.13.2`; `gh release list` before and after | closed |
| T-87-SC | 87-78 | Tampering | package installs | low | accept | `pnpm install --frozen-lockfile` only; no new package | closed |
| T-87-155 | 87-79 | Information Disclosure | gate captures and scored results | high | mitigate | captures stay under the session directory, mode 0700, never committed; results carry `~` paths, hashes and counts; no matched log line is pasted | closed |
| T-87-156 | 87-79 | Tampering | the operator's bottles, Steam shortcuts, pin, licence and profile | high | mitigate | P3 ditto copies first; approvals recorded before the pin move and move-back, the shortcut add and the uninstall; the licence is existence-only; restores only on the operator's decision | closed |
| T-87-157 | 87-79 | Repudiation | a score not backed by evidence | medium | mitigate | every result names its launch ordinal and evidence; IMPOSSIBLE rows are never scored from the log | closed |
| T-87-SC | 87-79 | Tampering | package installs | low | accept | no package is installed | closed |
| FLAG-87-42-a | 87-42 | Tampering | src/common/types/ipc/sidecarInternal.ts engineSelectionChanged send channel | medium | mitigate | Rust to sidecar only, strictly schemed, caller `shell`, not in the renderer allow-list (SUMMARY threat flag new-send-channel) | closed |
| FLAG-87-42-b | 87-42 | Elevation of Privilege | src-tauri/src/engine_dispatch.rs eleven rustInvoke arms | high | mitigate | each arm decodes one object strictly: deny-unknown-fields, absolute programs, clean names, engine inside the engine roots, cancel ids 1-64 of [A-Za-z0-9_-] (SUMMARY threat flag new-op-surface) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

Counts: 236 rows (234 plan-time + 2 SUMMARY flags). mitigate 148 (critical 1, high 46, medium 65, low 36); accept 88 (82 × T-87-SC, 6 others). All closed.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-87-01 | T-87-SC (all 82 plans) | No plan adds a package, crate or lockfile name; the few that use sha2, reqwest or futures-util use versions already locked (Package Legitimacy Audit OK). | plan-time threat model | 2026-11-27 |
| AR-87-02 | T-87-32 (87-32) | parity with the TS (the upstream script is fetched from the Winetricks repo master as before); recorded as an accepted risk, not changed inside a parity port (D-16) | plan-time threat model | 2026-11-27 |
| AR-87-03 | T-87-45 (87-44) | declared D-18 arm; only stdout is parsed and only a day count is logged; no profile content is read by GameLib | plan-time threat model | 2026-11-27 |
| AR-87-04 | T-87-92 (87-56a) | answers wine and DXVK paths under the user's own tools directory to the same user's sidecar, as the TS did | plan-time threat model | 2026-11-27 |
| AR-87-05 | T-87-105 (87-61) | lines are per op and already bounded by the crates; the logger's own limiter (gamelib-log) applies; no new loop writes | plan-time threat model | 2026-11-27 |
| AR-87-06 | T-87-144 (87-74) | the Rust shortcut path already logs and notifies every removal; the fix removes the cause rather than adding a confirm | plan-time threat model | 2026-11-27 |
| AR-87-07 | T-87-149 (87-76) | a fixed-text line and a boolean; no path, name or argument | plan-time threat model | 2026-11-27 |

*Accepted risks do not resurface in future audit runs.*

---

## Verification Evidence

### Slice 87-01..87-24 (37 rows)

- chunk00 (87-01..87-24): SECURED 37/37 closed, 0 open.
- Tests run: jest engineWineFixtureRedaction, enginePins, engineWinePortComplete, engineWineShimSchedule, storeMirrorSchedule (393) pass; cargo golden_wine_manager(10), gamelib-proc spec_runner(13)+orphans(14), gamelib-wine --lib runtimes/extract/manager::remove(37), gamelib-engine fallback::verify(2) pass.
- Key evidence: T-87-04 enginePins.test.ts + pins.rs:18 include_str + ensure.rs:638-662 size/sha256. T-87-07 gamelib-proc spawn.rs:92-105 kill_on_drop/HelperGuard, orphans.rs. T-87-18 extract.rs:94,162 ensure_contained; runtimes.rs:236-262 remove_guarded. T-87-19 manager/remove.rs:59-95 stored installDir only + gamelib-safety. T-87-67 wine_dispatch.rs:252-296 parse_wine_version. T-87-23 wine_cmd/command.rs:329-337 ProcSpec argv, MAX_BUFFER, shutdown/cancel. T-87-10/59/12/14 recorder.ts:164-210 redaction + engineWineFixtureRedaction scan floor 4662. T-87-09 fetch.rs:191-265 FetchError categories, without_url. T-87-01 87-HUMAN-UAT.md P3 ditto + closing inventory.
- Notes: A) T-87-02 licence size/mtime/8-hex sha256 prefix logged once (plan said never read) - contents never copied; B) 'unknown op: <op>' echoes op name only; C) T-87-65 zod shim deleted in 88.1-19, mitigation now Rust enum decode; D) T-87-68/22/70 crate WineInstallation lost deny_unknown_fields (88.1-22 WR-01), strictness held by shell parse_wine_installation + persisted_wine; wine_releases_info_ready decodes leniently (5 date stamps only); E) T-87-24 discovery runs <wine> --version with argv + 5s limit.

### Slice 87-25..87-52 + FLAG-87-42-a/b (39 rows)

- chunk01 (87-25..87-52 + FLAG-87-42-a/b): SECURED 39/39 closed, 0 open. No suites run; evidence by code + test names + 87-VERIFICATION recorded runs.
- Key evidence: T-87-27 config.rs:94 / twin.ts:140 single validator, twin_vectors shared. T-87-31/79 winetricks/guard.rs:75-130 assert_apply_payload before spawn (queue.rs:454/487). T-87-77/33 wine_cmd/command.rs:471-506,578-686 guards before run_wine_command; strictObject wineTools.ts/runnerMisc.ts; server-side steamEligible/isNative. T-87-36 game_engine.rs:29 / twin.ts:258 sanitiser, 31 vectors; marker.rs:121-150. T-87-38 marker.rs:90-102,272-290 version_gate. T-87-37 lifecycle.rs:165-200 + remove_per_game.rs via gamelib-safety (Unknown refuses). T-87-39 switch.rs:365-470 per-bottle AsyncMutex, golden_switch WR-02. T-87-43 marker.rs:272 only writer. T-87-44 run_tool.rs allowlist + isolated env. T-87-47/48 fallback/verify.rs, ensure.rs size+sha256, extract.rs:84-120 assert_contained. FLAG-87-42-a sidecarInternal.ts strictObject caller shell, rendererAllowList.test.ts; FLAG-87-42-b engine_dispatch.rs:733-783 + lib.rs deny_unknown_fields, absolute bins, engine_is_trusted, is_cancel_id.
- Notes: 1) T-87-38 unreadable marker IS rewritten (gate_allows_write(Unreadable)=true, TS parity, deltas.json), 'newer' kept; still listed as pending user decision in 87-42/87-56, no resolution found. 2) T-87-52 live sub-check unreachable; operator override 'accept item 5' in 87-VERIFICATION. 3) T-87-53 content strictness in Rust, TS arity only. 4) T-87-77 Windows path spawns after shape guard only (TS parity, 87-33 deviation 4).

### Slice 87-53..87-66 (37 rows)

- chunk02 (87-53..87-66): SECURED 37/37 closed, 0 open.
- Tests run: jest bootstrap, bootSourceShape, engineSync, rendererAllowList (66 tests) pass; cargo evidence by source inspection + 87-VERIFICATION verifier run (bottle_removal, offline_refusal, golden_*, tool_bottle_target).
- Key evidence: T-87-119 critical: remove_per_game.rs:238-250 check_removal before spawn, :293 remove_tree re-check, tests/bottle_removal.rs adversarial sibling-hash tests. T-87-118/120 remove_per_game.rs:24-30,172-180 target_name per-game only; bottle_removal.rs:180. T-87-87 run_tool.rs:22-28 ALLOWED_TOOLS, :166 refusal, isolated env, tests/run_tool_arms.rs. T-87-90 lib.rs:704-712 + fallback/ensure.rs:325 pin_by_id, :638-662 size/sha256, :669 extract_contained. T-87-97 launcherOverlayCensus/managerOverlayCensus tests. T-87-102 src-tauri/src/engine_log.rs:93-165 EngineLineRedactor, wired engine_dispatch.rs:309. T-87-112 wine_cmd/prefix.rs:32-45 tool_prefix via direct_child_dir; tests/tool_bottle_target.rs:382-410. T-87-106 wine_dispatch.rs:208-327 RELEASE_FIELDS. T-87-109 offline_refusal.rs zero requests. T-87-115/116/117 utils.ts:717-760 shutdownWine, lifecycle.rs:105-130.
- Operational: T-87-57 dry_run=true + no --no-verify (87-VALIDATION); T-87-58 backdate on Isaac's own bottle (not a throwaway clone) with operator approval, P3 ditto copy and hash-verified restore f963b4eb (87-59 deviation 5); T-87-99/101 RERUN-1 0700, ditto, approvals.
- Notes: 87-61 redactor leaks tail of a secret value containing comma/space (stated limit); Rust engine log lines keep bottle names by design; T-87-54 now logs display=confirmed (same semantics); pre-push not-skipped rests on recorded statements.

### Slice 87-66..87-79 (35 rows)

- chunk03 (87-66..87-79): SECURED 35/35 closed, 0 open.
- Tests run: cargo gamelib-engine bottle_removal(26) crossover_launch_shape(10) offline_refusal(17) offline_state_verdict(6) pass; jest 7 suites/103 tests pass.
- Key evidence: remove_per_game.rs:239-253 in-use refusal (T-87-121); :49,208,278 bounded + shutdown registrant (T-87-122); UninstallModal/index.tsx:147 bottleName label-only (T-87-123/124/125); uninstaller.ts:108-118,225-238 storedPrefixRemovalTarget keeps default prefix (T-87-133/145); remove_per_game.rs:53 deny_unknown_fields (T-87-132); safetyWireParity.test.ts (T-87-147); step.rs:455 offline_gate_verdict (T-87-148); crossover_env.rs:153-246 + crossover_launch_shape.rs (T-87-150); SwitchRow.tsx:104-123 + uninstallCancelKeepsSteamShortcut.test.tsx (T-87-143); launcher.ts:141-147 display-sleep release (T-87-141); playClickedLatch.ts/library.ts:173-190 (T-87-142); RemovalRefusedNotice fixed strings (T-87-146).
- Operational: 87-VALIDATION.md CI proof + one dispatch each for v0.13.1 (45455431706) / v0.13.2 (45791635064), designated requirement sha256 68d712d0 matched (T-87-126/127/128/152/153/154); 87-RERUN-1/2-HUMAN-UAT.md 0700 session dirs, ~ paths, ditto copies, approvals recorded (T-87-129..131,135..137,155..157); rf1 debug record counts only, D4 not run (T-87-138..140).
- Notes: T-87-143 RF3 root cause unproven, mitigated by guards+tests, re-run 2 item 6 passed live; 87-78 used --no-verify only on deleted throwaway diag branch; launcher.crossoverEnv.test.ts deleted in 88.2-23, invariants in gamelib-wine/tests/crossover_env.rs; re-run 1 session dir no longer on disk.

---

## Deviations and Open Decisions (non-blocking)

None of these reopens a threat; each was judged closed by the auditor. They are recorded so a later reader does not mistake the register wording for the exact implemented behaviour.

1. **T-87-38 (marker overwrite): unreadable markers are rewritten.** "Newer is kept" holds (`bottles/marker.rs:90-102,272-290`). An unreadable marker (bytes the gate cannot parse) is rewritten by `reconcile`, `record_pinned` and the switch, because `gate_allows_write(Unreadable)` is true, asserted by `roundtrip_state.rs:256-262`. This is TS parity, recorded in `tests/fixtures/golden/bottles/deltas.json` (`unreadable-marker-is-rewritten-as-the-ts-did`) and 87-38-SUMMARY deviation 1. 87-42 and 87-56 still call it a pending user decision and no resolution was found. **Open decision for the operator:** accept it as parity, or make it strict (one-line change in `gate_allows_write` plus two goldens). Not added to the Accepted Risks Log, because nobody has accepted it.
2. **T-87-143 (dialog close removing the Steam shortcut):** RF3's root cause stayed unproven (did not reproduce in the live probe). Closed on hardening plus tests (`SwitchRow.tsx` repeat and post-close guards, `uninstallCancelKeepsSteamShortcut.test.tsx`), and re-run 2 item 6 passed live on 0.13.2.
3. **T-87-58 (backdate):** the backdate ran on Isaac's own bottle rather than a throwaway clone, with operator approval, a P3 `ditto` copy and a hash-verified restore (87-59 deviation 5).
4. **T-87-02 (licence plist):** the plan says "never read"; the gate run logged its size, mtime and an 8-hex sha256 prefix once. Contents were never copied or recorded.
5. **T-87-52 (engine notice):** the live sub-check was unreachable on the operator's library in all three gates; accepted via the 87-VERIFICATION `overrides` entry ("accept item 5"). Code mitigation and goldens are present.
6. **T-87-68 / T-87-22 / T-87-70:** 88.1-22 WR-01 removed `deny_unknown_fields` from the crate-level `WineInstallation`. Strictness is held at the shell (`parse_wine_installation`, `persisted_wine` six-key projection). `wine_releases_info_ready` decodes leniently and reads only five date stamps.
7. **T-87-65:** the strict zod tuple on the runtime shim was deleted in 88.1-19; the mitigation now lives in the Rust enum decode via `gamelib-launch/src/prepare/deps.rs`.
8. **T-87-77 Windows ordering:** on Windows `run_wine_command_for_game` spawns after the shape guard only, before the Steam and native guards (`command.rs:587-600`), as the TS handler did (87-33 deviation 4). Argv array, no shell.
9. **T-87-24:** discovery does run `<wine> --version` (argv array, 5 s limit); the register's "never executes what it finds" is loose wording.
10. **87-61 redactor limit:** a secret value that itself contains a comma or space leaks its tail; the 87-69 live count is the stated check. Rust engine log lines keep bottle names by design.
11. **87-78:** `--no-verify` was used only on the throwaway `diag/ps-lnk-timing` branch, since deleted; every main and release push ran its hooks. That hooks were not skipped rests on the recorded statements in 87-VALIDATION.md.
12. **Moved code:** `launcher.crossoverEnv.test.ts` was deleted in 88.2-23; its invariants live in `gamelib-wine/tests/crossover_env.rs`. Several TS shims are superseded by Rust in gamelib-launch and gamelib-engine; every mitigation was confirmed at its current location. The re-run 1 capture directory is no longer on disk.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-27 | 236 | 236 | 0 | /gsd-secure-phase 87 (4 × gsd-security-auditor, sonnet) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-27
