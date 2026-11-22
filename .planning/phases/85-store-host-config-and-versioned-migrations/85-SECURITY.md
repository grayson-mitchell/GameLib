---
phase: "85"
slug: "store-host-config-and-versioned-migrations"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-22"
---

# Phase 85 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register authored at plan time (`<threat_model>` in all 25 plans; 86 threats keyed `<plan>/<threat_id>`, because each plan numbers its own `T-85-SC`). Verified at ASVS L1, with boundary placement also checked on the high-severity items, by `/gsd-secure-phase 85` on 2026-11-22 at HEAD `8e3b96114`, after three post-phase code-review fix rounds (see `85-REVIEW-DISPOSITION.md`). block_on: high.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| golden fixtures -> every later parity test (85-01) | a wrong golden would let a byte regression pass as parity | see plan 85-01 |
| oracle temp dirs -> repository (85-01) | recorded paths could carry the executor's temp or home path | see plan 85-01 |
| operator profile -> repository (85-02) | real account data could be committed in a fixture | see plan 85-02 |
| old release build -> executor machine (85-02) | a tag's sidecar runs on the executor's machine | see plan 85-02 |
| vectors -> both implementations (85-03) | a weakened vector would let a policy hole pass on both sides | see plan 85-03 |
| gate -> operator's real profile (85-03) | items corrupt and edit real store files | see plan 85-03 |
| operator profile -> spike output (85-04) | timing a real profile could leak values into committed notes | see plan 85-04 |
| operator credentials -> CI release (85-05) | a tag push or dispatch signs artifacts with the operator's Apple identity | see plan 85-05 |
| baseline identity -> gate validity (85-05) | a mismatched identity makes the Keychain gate meaningless | see plan 85-05 |
| file on disk -> parser (85-06) | a store file may be hand-edited, corrupt or hostile | see plan 85-06 |
| writer -> file system (85-06) | temp files and symlinks in the store directory | see plan 85-06 |
| store file -> engine (85-07) | a file may be corrupt, newer or hostile | see plan 85-07 |
| backup and corrupt copies -> disk (85-07) | copies may hold token-bearing content | see plan 85-07 |
| older store file -> strip migration (85-08) | a strip deletes data by design | see plan 85-08 |
| CLI -> file system (85-08) | the CLI opens a whole profile directory | see plan 85-08 |
| profile on disk -> boot open (85-09) | thousands of files or hostile files at boot | see plan 85-09 |
| shell -> sidecar env (85-09) | GAMELIB_STORE_BOOT crosses into the sidecar process | see plan 85-09 |
| exit path -> in-flight writes (85-09) | quitting mid-write | see plan 85-09 |
| sidecar stdout -> shell reader (85-10) | a store frame is untrusted input to the shell | see plan 85-10 |
| shell -> sidecar stdin (85-10) | storeMirrorEvent payloads enter the sidecar | see plan 85-10 |
| Rust events -> TS view (85-11) | events reshape what every TS reader sees | see plan 85-11 |
| GAMELIB_STORE_BOOT -> TS (85-11) | env content parsed at boot | see plan 85-11 |
| runtime cache names -> file names (85-12) | a name crossing from the renderer or sidecar becomes a file in store_cache | see plan 85-12 |
| user data -> Rust writer (85-13) | play history, queues, libraries and overrides are now written by Rust | see plan 85-13 |
| account configs -> Rust writer (85-14) | sign-in flags and ids now written by Rust | see plan 85-14 |
| store code -> OS keyring (85-14) | must not exist | see plan 85-14 |
| app name -> file path (85-15) | a GamesConfig app name becomes a file name | see plan 85-15 |
| removal -> open stores (85-15) | deleted files with live in-memory owners | see plan 85-15 |
| renderer -> native store channels (85-16) | untrusted store names cross into Rust | see plan 85-16 |
| Rust -> renderer snapshot (85-16) | store content leaves the trusted side | see plan 85-16 |
| renderer -> native write channels (85-17) | untrusted writes to user and account state | see plan 85-17 |
| Rust -> renderer pushes (85-17) | store content leaves the trusted side | see plan 85-17 |
| sidecar -> rustInvoke gate ops (85-18) | a path argument crosses into Rust | see plan 85-18 |
| local checkout -> GitHub (85-19) | a push runs CI and a dispatch signs an artifact | see plan 85-19 |
| gate -> operator profile and Keychain (85-20) | real credentials and data are exercised | see plan 85-20 |
| session captures (85-20) | profile copies and logs hold account data | see plan 85-20 |
| deletion -> users on older profiles (85-21) | removing the TS engine removes TS's own refuse-newer and migration paths | see plan 85-21 |
| GamesConfig document on disk -> engine read (85-22) | the engine parses a per-game document Rust migrated at boot | see plan 85-22 |
| settings documents on disk -> config layer (85-23) | GlobalConfig and GameConfig read documents Rust migrated and guards | see plan 85-23 |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| 85-01/T-85-01 | Tampering | golden fixtures | medium | mitigate | compare mode is the default; write mode needs GAMELIB_WRITE_STORE_GOLDEN=1; fixtures are generated from the unmodified TS stack before any store change; one-byte mutation check recorded | closed |
| 85-01/T-85-02 | Information Disclosure | recorded paths in outcomes.json | low | mitigate | every temp root is replaced by `${USERDATA}`; the oracle never reads HOME or a real profile | closed |
| 85-01/T-85-SC | Tampering | package installs | low | accept | this plan installs nothing | closed (accepted) |
| 85-02/T-85-03 | Information Disclosure | corpus fixtures | high | mitigate | redactValue denylist plus ciphertext prefixes; storeCorpus.test.ts pattern scan with self-tests; diff review before commit — verified: harvestStoreCorpus.ts:129-176 denylist, :238 ciphertext rule, :293-305 JWT/SteamID64/email redaction; storeCorpus.test.ts:353-390 scans every committed fixture | closed |
| 85-02/T-85-04 | Tampering | operator profile | medium | mitigate | the operator arm is read-only and spawns nothing; its justification is written at the call site | closed |
| 85-02/T-85-05 | Information Disclosure | tag sidecar runs | medium | mitigate | fresh createFakeHomeProfile() per run, dispose() after, captures registered for shredding; bounded wait then kill | closed |
| 85-02/T-85-SC | Tampering | package installs | low | accept | `pnpm install --frozen-lockfile` inside a tag worktree installs only that tag's locked set; nothing new enters this repo's lockfile | closed (accepted) |
| 85-03/T-85-06 | Repudiation | gate contract | medium | mitigate | authored before code and never run by its author; each item names its launch ordinal and evidence file | closed |
| 85-03/T-85-07 | Tampering | operator profile during the gate | high | mitigate | P3 `ditto` copy before anything; every editing item copies first and restores after; edits only with the app closed — verified: 85-HUMAN-UAT P2/P3 ditto profile copy; per-item copy and cmp-checked restore (items 4-8) | closed |
| 85-03/T-85-08 | Elevation of Privilege | storePolicyVectors.json | medium | mitigate | expected values are computed from today's TS in write mode only; compare mode is the default; the refreshToken write-denied vector is asserted explicitly | closed |
| 85-03/T-85-SC | Tampering | package installs | low | accept | this plan installs nothing | closed (accepted) |
| 85-04/T-85-09 | Information Disclosure | sweep bench | medium | mitigate | the bench prints counts, sizes and timings only and opens files read-only; README and 85-SPIKES.md carry numbers, never values | closed |
| 85-04/T-85-SC | Tampering | package installs | low | accept | the scratch bench uses serde_json and indexmap, both already locked in src-tauri; nothing enters a tracked lockfile | closed (accepted) |
| 85-05/T-85-10 | Spoofing | signing identity continuity | high | mitigate | identity recorded from the downloaded artifact (codesign, designated requirement); 85-19 records the Phase 85 artifact the same way and 85-20 refuses to score items 1-2 unless they match — verified: 85-VALIDATION.md 337-366: TeamIdentifier S7U223QWXJ; designated requirements byte-identical | closed |
| 85-05/T-85-11 | Elevation of Privilege | release publication | medium | mitigate | only the operator triggers the release workflow; it opens a draft prerelease; Claude never publishes | closed |
| 85-05/T-85-SC | Tampering | package installs | low | accept | this plan installs nothing | closed (accepted) |
| 85-06/T-85-12 | Tampering | atomic.rs temp/symlink handling | medium | mitigate | `create_new` temp names with pid and seq, final-symlink resolution, temp removal on every path, 0600 files and 0700 new dirs (copied from the WR-03/WR-04-fixed steamfiles writer) | closed |
| 85-06/T-85-13 | Denial of Service | json::parse on a hostile file | medium | mitigate | serde_json's recursion limit is never disabled; a 200-deep test proves an error, not a stack overflow | closed |
| 85-06/T-85-14 | Elevation of Privilege | dotpath segments | medium | mitigate | `__proto__`, `prototype` and `constructor` segments are refused with no change, proven by oracle vectors | closed |
| 85-06/T-85-SC | Tampering | crate dependencies | low | accept | no new package: serde, serde_json, indexmap and tempfile are already locked and passed the research legitimacy check; Cargo.lock gains only the two in-repo crates | closed (accepted) |
| 85-07/T-85-15 | Repudiation | engine corrupt/newer paths | high | mitigate | bytes never overwritten on Failed or Newer; corrupt copy written first; engine_golden and corpus assert byte equality — verified: engine.rs:136-181 corrupt copy first / ReadOnly(Newer); host.rs:359-361 refuses apply; corpus.rs:295,:550 byte equality | closed |
| 85-07/T-85-16 | Information Disclosure | backup.rs copies | medium | mitigate | backups and corrupt copies written 0600 through write_atomic in the store's own directory; at most 3 of each kept | closed |
| 85-07/T-85-17 | Denial of Service | corrupt copies on every boot | low | mitigate | newest-equal skip and the cap of 3 stop a permanently corrupt file from filling the disk | closed |
| 85-07/T-85-SC | Tampering | crate dependencies | low | accept | chrono, if used, is already locked; no new package enters the lockfile | closed (accepted) |
| 85-08/T-85-18 | Tampering | migrate/strip.rs | high | mitigate | descriptor generated from zod with a drift test; byte parity with the TS oracle over golden and corpus; a backup is written before every non-identity migration — verified: genStoreSchemas.ts + schemaDescriptor.test.ts drift check; migrate_golden.rs, corpus.rs parity; engine.rs:200 backup before migration | closed |
| 85-08/T-85-19 | Tampering | gamelib-store-cli open | medium | mitigate | `--dry-run` works on a temp copy; CLI tests run only on FakeHome; the CLI has no keyring dependency (D-14) | closed |
| 85-08/T-85-SC | Tampering | package installs | low | accept | no new package; zod is already a dependency and is read only by the generator | closed (accepted) |
| 85-09/T-85-20 | Denial of Service | store_boot::open_all | medium | mitigate | BOOT_SWEEP_MAX_FILES and BOOT_SWEEP_MAX_MS from measurement plus the Shutdown token; deferred files open lazily | closed |
| 85-09/T-85-21 | Denial of Service | `store` exit drain | medium | mitigate | wait_idle bounded by the drain budget; hold_exit_drain_open on overrun so the deadline line names it; no permanent registrant | closed |
| 85-09/T-85-22 | Information Disclosure | GAMELIB_STORE_BOOT and the boot summary line | low | mitigate | carries store keys, reason words and counts only, never values | closed |
| 85-09/T-85-SC | Tampering | crate dependencies | low | accept | only the in-repo gamelib-store joins the shell's dependency list | closed (accepted) |
| 85-10/T-85-23 | Tampering | parse_store_frame | high | mitigate | deny_unknown_fields, closed op set, store-key shape and table/ownership check, dot-path and reserved-key refusal, ordered valueJson parse, 10 MiB cap; shared vectors on both sides — verified: store_dispatch.rs:221-310 parse_store_frame (10 MiB cap, closed fields/ops, key and segment refusals); shared storeFrameVectors.json; storeFrames.ts:210 byte size | closed |
| 85-10/T-85-24 | Denial of Service | shell reader thread | medium | mitigate | the arm validates and enqueues only; one worker applies; unbounded queue with a counted high-water warning; never blocks the reader | closed |
| 85-10/T-85-25 | Information Disclosure | rejection logging | medium | mitigate | rejections logged as `store frame rejected: <reason>` only, never key or value content | closed |
| 85-10/T-85-26 | Repudiation | async persistence | medium | mitigate | applied/refused acks per frame; flush barrier; store Registrant until the queue is empty so exit waits inside the budget | closed |
| 85-10/T-85-SC | Tampering | package installs | low | accept | this plan installs nothing | closed (accepted) |
| 85-11/T-85-27 | Tampering | MirrorCell.applyEvent | medium | mitigate | events applied in rev order only, stale revs ignored, values parsed with JSON.parse into plain objects through dotPath.ts which refuses prototype segments | closed |
| 85-11/T-85-28 | Denial of Service | quit flush | medium | mitigate | flushStores bounded by an unref'd 2 s timer; resolves with a warning when no peer answers | closed |
| 85-11/T-85-29 | Tampering | readStoreBootEnv | low | mitigate | defensive parse; malformed input yields no entries and one stderr line; only store keys and reason words are accepted | closed |
| 85-11/T-85-SC | Tampering | package installs | low | accept | this plan installs nothing | closed (accepted) |
| 85-12/T-85-30 | Tampering | runtime cache store names | medium | mitigate | CACHE_STORE_NAME_PATTERN plus the recognised-name list on both sides, drift-tested; unrecognised names refused `not-owned`; open_cache keeps its plain-file-name check | closed |
| 85-12/T-85-31 | Repudiation | corrupt cache recovery | low | mitigate | a corrupt cache continues empty only after its byte copy exists (D-18), proven end to end | closed |
| 85-12/T-85-SC | Tampering | package installs | low | accept | this plan installs nothing | closed (accepted) |
| 85-13/T-85-32 | Tampering | user-state writes | high | mitigate | byte parity proven by golden and corpus; sync_all per write (D-21); pre-migration backups; GAMELIB_STORE=ts fallback reads the same bytes — verified: engine/ops/migrate golden + corpus tests; host.rs:458-463 Synced for user-state/account/settings; engine.rs:200 backups (GAMELIB_STORE=ts leg removed by design in 85-21) | closed |
| 85-13/T-85-33 | Repudiation | boot migration | medium | mitigate | backup before every non-identity migration; BootReport counts in the `store boot:` line | closed |
| 85-13/T-85-SC | Tampering | package installs | low | accept | this plan installs nothing | closed (accepted) |
| 85-14/T-85-34 | Information Disclosure | token-bearing file modes | medium | mitigate | tightening ported to the Rust open path (0600 file, 0700 dir); writes are 0600 via write_atomic | closed |
| 85-14/T-85-35 | Spoofing | Keychain service/account names | high | mitigate | keyring_names_are_pinned on all three CI legs; store crates carry no keyring dependency (D-14) — verified: main.rs:3539 keyring_names_are_pinned; rust-test.yml:86 three-OS matrix; keyring only in src-tauri/Cargo.toml:81 | closed |
| 85-14/T-85-36 | Tampering | ciphertext keys in old profiles | medium | mitigate | unknown keys preserved byte-identical (corpus and accountFamily tests) | closed |
| 85-14/T-85-SC | Tampering | package installs | low | accept | this plan installs nothing | closed (accepted) |
| 85-15/T-85-37 | Tampering | GamesConfig/<app> resolution | high | mitigate | plain-segment check (no separators, not `.`/`..`, 1-255 chars) in Rust before any path join; TS never builds such a frame — verified: host.rs:535-580 plain_segment closed class (B-WR-07), applied before any path join in store_dispatch.rs:141-143, host.rs:748-760, store_boot.rs:83-87 | closed |
| 85-15/T-85-38 | Tampering | reset/uninstall resurrection | medium | mitigate | evict_path after every removed app-data target; evicted stores refuse frames and the drain writes nothing for them | closed |
| 85-15/T-85-39 | Repudiation | settings migrations at boot | medium | mitigate | backup before every non-identity migration; the boot sweep is bounded and counted | closed |
| 85-15/T-85-SC | Tampering | package installs | low | accept | this plan installs nothing | closed (accepted) |
| 85-16/T-85-40 | Information Disclosure | store_fetch and the snapshot command | high | mitigate | filter_store_snapshot with the shared allow-list on every result; humble_library denied; `__internal__` never in a view; vectors shared with TS — verified: store_native.rs:119-137 read_owned → filter_store_snapshot; store_policy.rs:139-144 denies humble_library; __internal__ dropped (:172) | closed |
| 85-16/T-85-41 | Tampering | renderer store names | medium | mitigate | resolution only through storeTable tsNames or the recognised cache list; one string arg validated; unknown names rejected with the existing marker | closed |
| 85-16/T-85-42 | Tampering | policy divergence TS vs Rust | medium | mitigate | one JSON source for both; the same vectors run in jest and cargo | closed |
| 85-16/T-85-SC | Tampering | package installs | low | accept | this plan installs nothing | closed (accepted) |
| 85-17/T-85-43 | Elevation of Privilege | store_set / store_set_checked | high | mitigate | is_writable_store_field (refreshToken denied), is_safe_key_path, `__internal__` refused, store resolution only through the table or recognised names; shared vectors — verified: store_native.rs:364-377 check_write_policy before open; refreshToken excluded (store_policy.rs:317-326 test) | closed |
| 85-17/T-85-44 | Information Disclosure | storeChanged push from Rust | high | mitigate | is_allowed_store_field before every push (the TS secret-leak guard moved here); invalidations carry no values — verified: store_native.rs:586-602 renderer_pushes filter; storeWriteHandlers.ts:50-55,:71 | closed |
| 85-17/T-85-45 | Tampering | stale push ordering | medium | mitigate | rev under the lock, one dispatcher, the preload rev guard on top of changesDuringFetch | closed |
| 85-17/T-85-SC | Tampering | package installs | low | accept | this plan installs nothing | closed (accepted) |
| 85-18/T-85-46 | Tampering | store_version_gate / store_backup_file path args | high | mitigate | absolute path, no `..`, file name restricted to the two marker names with matching chains; anything else `bad-args`; backups written beside the file only — verified: store_gate_dispatch.rs:30-43 valid_bottle_path; bad-args otherwise (:48-50, :59-61) | closed |
| 85-18/T-85-47 | Tampering | engine marker overwrite | medium | mitigate | an unprimed or `newer` gate refuses the write; tests prove byte equality | closed |
| 85-18/T-85-SC | Tampering | package installs | low | accept | this plan installs nothing | closed (accepted) |
| 85-19/T-85-48 | Elevation of Privilege | push and release dispatch | high | mitigate | blocking-human checkpoint; open-time diff check immediately before the push; never --no-verify; dry run publishes nothing — verified: 85-19-SUMMARY operator push decision, never --no-verify, open-time diff check before push | closed |
| 85-19/T-85-49 | Spoofing | Phase 85 artifact identity | high | mitigate | identity recorded from the downloaded artifact and compared with the baseline; mismatch makes SC3 unproven and blocks gate items 1-2 — verified: 85-VALIDATION.md 337-368 identity recorded from the downloaded artifact and compared | closed |
| 85-19/T-85-SC | Tampering | package installs | low | accept | `pnpm install --frozen-lockfile` in the proof worktree installs only the locked set | closed (accepted) |
| 85-20/T-85-50 | Tampering | operator profile during the gate | high | mitigate | P3 copy before anything; every edit with the app closed after a byte copy; restore after each item; inventory at close — verified: 85-HUMAN-UAT P2/P3, app-closed edits with byte copies, cmp-checked restores; closing inventory :381-387 | closed |
| 85-20/T-85-51 | Information Disclosure | session captures | medium | mitigate | captures stay in /tmp, are never committed, results carry `~` paths and counts only, and copies are deleted after scoring or their location recorded | closed |
| 85-20/T-85-SC | Tampering | package installs | low | accept | this plan installs nothing | closed (accepted) |
| 85-21/T-85-52 | Tampering | store/migrations.json | medium | mitigate | no deletion code; Rust never opens it (store_boot_never_opens_migrations_json); a downgraded v0.10 still sees the legendary id applied (D-07) | closed |
| 85-21/T-85-53 | Repudiation | silent loss of a still-needed module | medium | mitigate | red-first port-complete gate per task with KEPT paths (mirrorCell, dotPath, storeFrames, settingsDocs, bottleVersionGate, the fixture dirs) and the mirror schedule test failing when a later-phase store loses its class | closed |
| 85-21/T-85-54 | Denial of Service | downgrade after deletion | low | accept | D-04: no store version was bumped, so v0.10 reads every Rust-written file; v0.10 keeps its own refuse-newer rule (D-02) | closed (accepted) |
| 85-21/T-85-SC | Tampering | dependency changes | low | accept | `conf` is removed, nothing is added; `pnpm install` only prunes the lockfile | closed (accepted) |
| 85-22/T-85-56 | Tampering | readStoredGameConfig | medium | mitigate | the containment checks (plain segment, resolve-inside-root, T-68-19) stay unchanged; only the TS migrate step goes, because Rust's boot sweep (85-15) migrates every GamesConfig document before the sidecar spawns; an engineConfig case reads a current document unchanged | closed |
| 85-22/T-85-57 | Repudiation | a reader silently loses its versioning input | low | mitigate | codecheck fails on any remaining Pick or field indexed on the removed member; the comment-filtered reference count over the engine-side path set must reach 0 | closed |
| 85-22/T-85-SC | Tampering | package installs | low | accept | this plan installs nothing | closed (accepted) |
| 85-23/T-85-58 | Tampering | a newer settings document overwritten after the TS read-only guard goes | medium | mitigate | Rust's host refuses a replace frame on a newer document (85-15, D-02 semantics) and reports it through Rust's notice (85-16); settingsFamily.test.ts stays green in this plan's verify | closed |
| 85-23/T-85-59 | Repudiation | a still-needed test seam silently dropped | low | mitigate | the forbidden helper identifier goes red-first in storeHostPortComplete; the repo-wide versioning-reference count outside the two directories must reach 0 and codecheck catches any dangling reference | closed |
| 85-23/T-85-SC | Tampering | package installs | low | accept | this plan installs nothing | closed (accepted) |
| 85-24/T-85-60 | Repudiation | silent loss of a still-needed module | medium | mitigate | red-first port-complete gate per task with KEPT paths (utils/schemaStrip.ts and its test, stores/types.ts) and the module-specifier scan; rustRefresh.ts's import is a key link | closed |
| 85-24/T-85-61 | Information Disclosure | a newer store shown as writable after the TS notice goes | low | mitigate | Rust's read-only notice (85-16) is the only one and the frontendReady case asserts it is still sent; cargo store_policy keeps the area mapping proven | closed |
| 85-24/T-85-SC | Tampering | package installs | low | accept | this plan installs nothing | closed (accepted) |
| 85-25/T-85-55 | Elevation of Privilege | push | high | mitigate | blocking-human checkpoint; open-time diff check immediately before the push; never --no-verify — verified: 85-25-SUMMARY pre-authorised push, open-time check run twice (attempt 1 blocked), push from clean detached worktree | closed |
| 85-25/T-85-SC | Tampering | package installs | low | accept | `pnpm install --frozen-lockfile` in the proof worktree installs only the locked set | closed (accepted) |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

Every `mitigate` row was closed with file:line evidence by the auditor; the high-severity evidence is quoted inline. Dynamic evidence run during the audit: `cargo test -p gamelib-store -p gamelib-store-cli` (green), `cargo test --bin gamelib-shell -- store_ safety_ keyring_` (225 passed, 2 ignored), and 7 jest suites (245 tests) over the store gates, policy vectors, bottle gate, schema descriptor, mirrorCell, dotPath and the corpus.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-85-01 | 85-01/T-85-SC | this plan installs nothing | plan author (threat model), confirmed by audit | 2026-11-22 |
| AR-85-02 | 85-02/T-85-SC | `pnpm install --frozen-lockfile` inside a tag worktree installs only that tag's locked set; nothing new enters this repo's lockfile | plan author (threat model), confirmed by audit | 2026-11-22 |
| AR-85-03 | 85-03/T-85-SC | this plan installs nothing | plan author (threat model), confirmed by audit | 2026-11-22 |
| AR-85-04 | 85-04/T-85-SC | the scratch bench uses serde_json and indexmap, both already locked in src-tauri; nothing enters a tracked lockfile | plan author (threat model), confirmed by audit | 2026-11-22 |
| AR-85-05 | 85-05/T-85-SC | this plan installs nothing | plan author (threat model), confirmed by audit | 2026-11-22 |
| AR-85-06 | 85-06/T-85-SC | no new package: serde, serde_json, indexmap and tempfile are already locked and passed the research legitimacy check; Cargo.lock gains only the two in-repo crates | plan author (threat model), confirmed by audit | 2026-11-22 |
| AR-85-07 | 85-07/T-85-SC | chrono, if used, is already locked; no new package enters the lockfile | plan author (threat model), confirmed by audit | 2026-11-22 |
| AR-85-08 | 85-08/T-85-SC | no new package; zod is already a dependency and is read only by the generator | plan author (threat model), confirmed by audit | 2026-11-22 |
| AR-85-09 | 85-09/T-85-SC | only the in-repo gamelib-store joins the shell's dependency list | plan author (threat model), confirmed by audit | 2026-11-22 |
| AR-85-10 | 85-10/T-85-SC | this plan installs nothing | plan author (threat model), confirmed by audit | 2026-11-22 |
| AR-85-11 | 85-11/T-85-SC | this plan installs nothing | plan author (threat model), confirmed by audit | 2026-11-22 |
| AR-85-12 | 85-12/T-85-SC | this plan installs nothing | plan author (threat model), confirmed by audit | 2026-11-22 |
| AR-85-13 | 85-13/T-85-SC | this plan installs nothing | plan author (threat model), confirmed by audit | 2026-11-22 |
| AR-85-14 | 85-14/T-85-SC | this plan installs nothing | plan author (threat model), confirmed by audit | 2026-11-22 |
| AR-85-15 | 85-15/T-85-SC | this plan installs nothing | plan author (threat model), confirmed by audit | 2026-11-22 |
| AR-85-16 | 85-16/T-85-SC | this plan installs nothing | plan author (threat model), confirmed by audit | 2026-11-22 |
| AR-85-17 | 85-17/T-85-SC | this plan installs nothing | plan author (threat model), confirmed by audit | 2026-11-22 |
| AR-85-18 | 85-18/T-85-SC | this plan installs nothing | plan author (threat model), confirmed by audit | 2026-11-22 |
| AR-85-19 | 85-19/T-85-SC | `pnpm install --frozen-lockfile` in the proof worktree installs only the locked set | plan author (threat model), confirmed by audit | 2026-11-22 |
| AR-85-20 | 85-20/T-85-SC | this plan installs nothing | plan author (threat model), confirmed by audit | 2026-11-22 |
| AR-85-21 | 85-21/T-85-54 | D-04: no store version was bumped, so v0.10 reads every Rust-written file; v0.10 keeps its own refuse-newer rule (D-02) | plan author (threat model), confirmed by audit | 2026-11-22 |
| AR-85-22 | 85-21/T-85-SC | `conf` is removed, nothing is added; `pnpm install` only prunes the lockfile | plan author (threat model), confirmed by audit | 2026-11-22 |
| AR-85-23 | 85-22/T-85-SC | this plan installs nothing | plan author (threat model), confirmed by audit | 2026-11-22 |
| AR-85-24 | 85-23/T-85-SC | this plan installs nothing | plan author (threat model), confirmed by audit | 2026-11-22 |
| AR-85-25 | 85-24/T-85-SC | this plan installs nothing | plan author (threat model), confirmed by audit | 2026-11-22 |
| AR-85-26 | 85-25/T-85-SC | `pnpm install --frozen-lockfile` in the proof worktree installs only the locked set | plan author (threat model), confirmed by audit | 2026-11-22 |

*Accepted risks do not resurface in future audit runs.*

---

## Residual Observations (informational, not threats)

1. 85-15/T-85-38: `resetHeroic` does not drop the TS settings mirror cells, so stale cells serve deleted docs until the 1 s relaunch (review C-WR-01, deferred to `.planning/todos/pending/2026-11-22-reset-heroic-leaves-settings-mirror-cells.md`). Rust eviction holds; nothing is resurrected on disk. B-WR-05's partial fix leaves renderer writes unpaused during a removal.
2. 85-15/T-85-37: TS `isPlainAppName` (`storeFrames.ts:57`) is still a deny list and would pass `C:foo` (review D-IN-02). Defence in depth only; Rust refuses it as `store-key` before any path join.
3. 85-09/T-85-20: the boot candidate scan (`store_boot.rs:74-91`) sits outside the file and time bounds (review B-IN-09); the 10 MiB frame cap is checked after the line is parsed (B-IN-07, trusted producer).
4. 85-13/T-85-32: the plan's `GAMELIB_STORE=ts` fallback leg no longer exists (deleted in 85-21, D-03/D-04); the other mitigations hold.
5. 85-01/T-85-02, 85-02/T-85-03: committed corpus fixtures embed a fake-HOME macOS temp path (`/var/folders/.../T/gamelib-corpus-v0.N-XXXX/`). Not operator data; judged negligible.
6. 85-04/T-85-SC: `.planning/spikes/093-store-boot-durability-costs/bench/Cargo.lock` is tracked; its 14 external packages match `src-tauri/Cargo.lock` exactly, so no new supply-chain exposure.
7. 85-19: the push also published another session's Phase 84 commits, accepted by the operator (85-19-SUMMARY).

---

## Security Audit

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-22 | 86 | 86 | 0 | gsd-security-auditor (sonnet), /gsd-secure-phase 85 |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-22
