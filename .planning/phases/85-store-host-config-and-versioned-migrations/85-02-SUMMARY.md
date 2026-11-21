---
phase: 85-store-host-config-and-versioned-migrations
plan: 02
subsystem: testing
tags: [store-corpus, redaction, fixtures, harvester, fake-home, conf, serde-json, migrations]

requires:
  - phase: 85-store-host-config-and-versioned-migrations
    provides: "85-01 golden: the two on-disk byte flavours (tab conf stores, 2-space settings documents) and the D-18 corrupt-file divergence wording this corpus reuses"
provides:
  - "meta/harvestStoreCorpus.ts: subcommands operator, backups, tag and edge, plus the redactValue redactor"
  - "A 161-file real-bytes corpus (162 manifest entries) under src-tauri/crates/gamelib-store/tests/fixtures/corpus: 106 redacted operator files, 36 real pre-migration backups, 3 files each from tagged releases v0.8, v0.9 and v0.10, and 10 hand-built edge files plus one manifest-only missing entry"
  - "MANIFEST.json (path, sha256, source, flavour, expect, tableKey, note, floor, counts) that the Rust roundtrip and migration tests in 85-07 and 85-08 read"
  - "meta/__tests__/storeCorpus.test.ts: manifest completeness, hashes, floor, per-source counts, byte flavour, chain-table parity with the TS registry, and an independent redaction scan with self-tests"
affects: [85-07, 85-08, 85-21, 85-24]

plan_head_before: 020684a27e42c3e7e777cf97e4520822298d690c
plan_head_after: 1918c94af43953192a5b1b1f3c44b488ffb546dc
commits: 5

actuals:
  tokens: 28000
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Real-profile arm named at its call site: the operator and backups arms only read; every spawn (git, pnpm, the tag sidecar) runs under a fresh createFakeHomeProfile() that is disposed afterwards"
    - "A redactor and a scan written separately: the harvester redacts, the test re-scans the committed bytes with its own patterns and self-tests that fail when a pattern is removed"
    - "A pinned corpus: manifest hash + floor + per-source counts + unlisted-file check, so a Rust test cannot pass over missing files"

key-files:
  created:
    - meta/harvestStoreCorpus.ts
    - meta/__tests__/storeCorpus.test.ts
    - src-tauri/crates/gamelib-store/tests/fixtures/corpus/MANIFEST.json
    - src-tauri/crates/gamelib-store/tests/fixtures/corpus/NOTES.md
    - src-tauri/crates/gamelib-store/tests/fixtures/corpus/operator/ (106 files)
    - src-tauri/crates/gamelib-store/tests/fixtures/corpus/backups/ (36 files)
    - src-tauri/crates/gamelib-store/tests/fixtures/corpus/v0.8/, v0.9/, v0.10/ (3 files each)
    - src-tauri/crates/gamelib-store/tests/fixtures/corpus/edge/ (10 files)
  modified:
    - .gitattributes

key-decisions:
  - "Tag files are copied as the raw bytes the old release wrote (no re-serialisation): how an older release laid a file out is the point of having it. The byte-flavour check in the test therefore covers only the redacted sources (operator, backup)"
  - "expect is derived from the stored version against the chain's current version (schemaVersion for stores, the version string for settings, the file-name version for backups); an unstamped baseline-1 file is roundtrip because the engine adopts it in place"
  - "A tag that cannot build is recorded under failures in the manifest and contributes no files; none failed (v0.8, v0.9 and v0.10 all built and booted), so failures is absent"
  - "steamid stays denylisted although some caches use it for a plain app id: over-redacting an app id costs a roundtrip test nothing, under-redacting a SteamID64 leaks an account"
  - "The corpus tree is -text in .gitattributes: the root text=auto eol=lf rule rewrote the CRLF edge fixture to LF in the committed blob"

patterns-established:
  - "Hand-built edge fixtures carry a note in the manifest and an entry in NOTES.md; a manifest-only entry (expect missing, sha256 null) stands for a file that must not exist"

requirements-completed: [FND-06]

coverage:
  - id: D1
    description: "A redacted, hash-pinned corpus from the operator profile, its real *.bak.json captures, tagged releases v0.8/v0.9/v0.10 and hand-built edge cases, listed in MANIFEST.json with source, flavour, expected outcome and floor"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "meta/__tests__/storeCorpus.test.ts#store corpus manifest"
        status: pass
    human_judgment: false
  - id: D2
    description: "The manifest cannot pass vacuously: a missing, unlisted or altered file, a count below the floor, a source with no files, or a missing expect value or flavour fails the test"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "meta/__tests__/storeCorpus.test.ts#store corpus manifest"
        status: pass
    human_judgment: false
  - id: D3
    description: "Redaction: denylisted keys hold placeholders and no token, JWT, ciphertext, SteamID64, email, Humble gamekey, long hex/base64 run or OS account name is committed; the scan has self-tests that fail when a pattern is removed"
    requirement: FND-06
    verification:
      - kind: unit
        ref: "meta/__tests__/storeCorpus.test.ts#store corpus redaction"
        status: pass
      - kind: unit
        ref: "meta/__tests__/storeCorpus.test.ts#harvester redactValue"
        status: pass
    human_judgment: true
    rationale: "A scan can only look for the shapes it knows; the operator should glance at the committed operator/ and backups/ diff for free-text identifiers no pattern describes (the plan itself names diff review as part of T-85-03)"
  - id: D4
    description: "The harvester's tag arm boots each tagged release in a fresh fake HOME, copies the store files it wrote, and leaves no worktree or profile behind"
    requirement: FND-06
    verification:
      - kind: other
        ref: "node meta/runTs.cjs ... harvestStoreCorpus.ts tag v0.10|v0.9|v0.8; git worktree list shows no gamelib-v0 afterwards"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-11-22
status: complete
---

# Phase 85 Plan 02: Store corpus Summary

**A redacted, sha256-pinned corpus of real store files (106 operator, 36 real pre-migration backups, three tagged-release boots, 11 hand-built edge entries) with a harvester and a manifest/redaction test, ready for the Rust roundtrip and migration tests**

## Performance

- **Duration:** about 25 min (start approximated from the first scratch file; the shell start time was not captured)
- **Started:** 2026-11-21T17:00:57Z
- **Completed:** 2026-11-21T17:25:00Z
- **Tasks:** 3 (Task 1 a tracer)
- **Files modified:** 166 (the harvester, the test, `.gitattributes`, 162 corpus entries counting NOTES.md and MANIFEST.json)

## Accomplishments

- `meta/harvestStoreCorpus.ts` with `operator`, `backups`, `tag` and `edge` subcommands; the operator and backups arms are the one named real-profile arm (read only, justified at the call site), every spawn goes through a fresh `createFakeHomeProfile()`.
- Operator profile harvested whole: 106 files (74 `roundtrip`, 32 `migrate`, the latter being per-game settings documents no boot has stamped since Phase 68), plus the 36 real `*.bak.json` captures (all `migrate`).
- Tags v0.8, v0.9 and v0.10 built in detached worktrees with `pnpm install --frozen-lockfile` and `pnpm build:sidecar`, booted in fake HOMEs, and their `config.json`, `store/config.json` and `store/migrations.json` copied raw; v0.8 and v0.9 root `config.json` carry the older settings shape (`migrate`).
- Edge cases: unknown keys at the current version, corrupt user state and cache, array root, empty, BOM, CRLF, newer store, lone surrogate, newer global settings, and a manifest-only missing entry; every `expect` value and both flavours are present.
- `storeCorpus.test.ts` (21 tests): hashes, floor, counts, byte flavour, chain-table parity with `STORE_MIGRATIONS`, an independent redaction scan with self-tests, and unit tests of `redactValue`, `expectFor`, `flavourOf`, `tableKeyOf`.

## Task Commits

1. **Task 1 (tracer): three redacted operator files, manifest, test** - `b6834ba46` (feat)
2. **Task 2: full operator harvest, backups, tagged-release profiles, NOTES.md** - `fa6c791de` (feat)
3. **Task 3: edge cases, floor, redactor unit tests** - `44e0c7a24` (feat)
4. **Fix: corpus tree marked `-text` so the CRLF fixture keeps its bytes** - `1918c94af` (fix)

`3fc6e0d01` (`test(steam-bridge): replace three jest.mock calls...`) sits inside the measured range `plan_head_before..plan_head_after`: another session committed to `main` during this plan, so the measured `commits: 5` is four of this plan's commits plus that one.

**Plan metadata:** the docs commit that carries this file.

## Tracer feedback gate

Interactive run, `human_verify_mode` end-of-phase, tracer `<verify>` automated only: the tracer's jest check was re-run end-to-end after its commit (14 passed) and expansion continued. Recorded once, as the acceptance criterion asks: with the JWT and ciphertext patterns replaced by never-matching ones in `storeCorpus.test.ts`, the two self-tests failed (2 failed, 12 passed); the patterns were restored.

## Files Created/Modified

- `meta/harvestStoreCorpus.ts` - the harvester and `redactValue`
- `meta/__tests__/storeCorpus.test.ts` - manifest, floor, flavour, chain parity, redaction scan and self-tests, redactor unit tests
- `src-tauri/crates/gamelib-store/tests/fixtures/corpus/MANIFEST.json` - the pinned list (162 entries, floor 161)
- `src-tauri/crates/gamelib-store/tests/fixtures/corpus/NOTES.md` - regeneration, flavours, `expect` meanings, redaction table, exclusions, edge table
- `src-tauri/crates/gamelib-store/tests/fixtures/corpus/{operator,backups,v0.8,v0.9,v0.10,edge}/...` - the fixtures
- `.gitattributes` - corpus tree `-text`

## Decisions Made

See `key-decisions` above. The plan's wording for the CRLF case, `roundtrip-semantic`, is not one of the six `expect` values it lists, so the file is `roundtrip` with the semantic reading in its manifest note.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Humble gamekey prefixes redacted in key names**
- **Found during:** Task 1 (survey of the profile before harvesting)
- **Issue:** the plan keeps every key name, but `store_cache/humble_*.json` are keyed `<16-char gamekey>:<product>`, and a gamekey grants access to the order.
- **Fix:** `redactKey` renames the prefix to a stable `GKREDACTED<6 digits>` placeholder (same order, same placeholder across files in a run); the test fails on any key that still starts with a gamekey.
- **Files modified:** `meta/harvestStoreCorpus.ts`, `meta/__tests__/storeCorpus.test.ts`
- **Committed in:** `b6834ba46`

**2. [Rule 2 - Missing critical] Wider redaction than the plan's denylist**
- **Found during:** Task 1
- **Issue:** the OS account name appears in paths (`/Users/<name>/...`) across the stores, caches and backups; `user_id`, `session_id`, `cmLogonId` and `steamGridDbApiKey` are account-bearing keys the listed denylist does not name; SteamID64s and emails can sit under any key.
- **Fix:** the account name is replaced by `operator` in values and key names; the denylist gained those keys and `api key / secret / password / credential` patterns; SteamID64, email, JWT and ciphertext strings are redacted by value wherever they sit.
- **Committed in:** `b6834ba46`, `fa6c791de`

**3. [Rule 1 - Bug] Output path resolved from `__dirname`**
- **Found during:** Task 1
- **Issue:** the script is bundled into a private temp dir by `meta/runTs.cjs`, so the first run wrote its tree under the OS temp directory instead of the repo.
- **Fix:** `CORPUS_DIR` resolves from the working directory; the stray tree (redacted files only) was deleted.
- **Committed in:** `b6834ba46`

**4. [Rule 1 - Bug] The 30 s boot wait used an unref'd timer, as the plan says**
- **Found during:** Task 2
- **Issue:** with the sidecar having exited and nothing else referenced, an unref'd timer lets the process exit 0 mid-await, skipping the `finally`: the first v0.10 run left its worktree and a fake profile behind.
- **Fix:** a plain referenced timer (a one-shot CLI, not the sidecar). The leftover worktree and the `gamelib-corpus-v0.10-*` profile were removed; later runs leave nothing (`git worktree list` shows no `gamelib-v0`).
- **Committed in:** `fa6c791de`

**5. [Rule 3 - Blocking] `pnpm install` under a fake HOME**
- **Found during:** Task 2
- **Issue:** a fake HOME has no corepack cache (corepack prompted to download pnpm) and pnpm aborted removing a `node_modules` it did not create without a TTY.
- **Fix:** the install runs with `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` and `CI=true`, and `npm_config_store_dir` pointed at the operator's pnpm store (read once from `pnpm store path`) so nothing downloads twice. Nothing enters this repo's lockfile.
- **Committed in:** `fa6c791de`

**6. [Rule 1 - Bug] Redaction scan false positives and empty placeholders**
- **Found during:** Tasks 1-2
- **Issue:** the literal "40+ chars of hex/base64 alphabet" rule fired on absolute paths, kebab-case slugs, PascalCase DLC names and SHOUTING_CASE Steam interface names; a fresh tag profile's `config.json` was "changed" by the redactor only because `steamGridDbApiKey: ""` became `"REDACTED"`.
- **Fix:** the base64 rule now needs mixed case plus digits, entropy of 4.4 bits per char or more, few vowels and not a path; GOG `external_id` (a public 40-hex catalogue id) joins the hash-key allow-list; an empty denylisted string stays `""`.
- **Committed in:** `fa6c791de`

**7. [Rule 1 - Bug] CRLF fixture normalised by `.gitattributes`**
- **Found during:** Task 3 (git's CRLF warning on commit)
- **Issue:** the root `* text=auto eol=lf` rule rewrote `edge_crlf.json` to LF in the committed blob, so a fresh checkout would fail its manifest hash.
- **Fix:** the corpus tree is `-text`; the file was re-added with `--renormalize`. All 162 committed blobs were then hashed against the manifest: 0 mismatches.
- **Files modified:** `.gitattributes`
- **Committed in:** `1918c94af`

**8. [Rule 3 - Blocking] `find-deadcode` on the harvester's exports**
- **Found during:** Task 3
- **Fix:** exports trimmed to what the test uses, and unit tests for `redactValue`, `expectFor`, `flavourOf` and `tableKeyOf` added so those stay exported for a reason. `find-deadcode` PASS at its 312-finding baseline.
- **Committed in:** `44e0c7a24`

---

**Total deviations:** 8 auto-fixed (2 missing critical, 4 bugs, 2 blocking)
**Impact on plan:** Rules 1 and 2 changes are correctness or security requirements for a corpus that must carry no account data; none changes what the corpus provides.

## Issues Encountered

- A known pre-existing failure the orchestrator named (`pnpm backend-di-ceilings` on three steam bridge test files) no longer fails: another session's `3fc6e0d01` landed during this plan and the command now prints PASS. Nothing here touched it.
- The operator profile holds 32 per-game settings documents with no `version` key; they are `migrate` entries, which is the real state of the profile.

## Authentication Gates

None. The operator and backups arms read local files only.

## User Setup Required

None - no external service configuration required.

## Threat Flags

None. The `tag` arm runs old releases' sidecars on this machine as the plan's threat model (T-85-05) already records: fresh fake HOME, environment reduced to the eight home variables plus PATH, bounded wait, process-group kill, profile disposed.

## Next Phase Readiness

- 85-07 and 85-08 can read `corpus/MANIFEST.json` for the files, their `expect` and `tableKey`, and trust the test that nothing is missing or altered.
- The corpus is regenerable (`NOTES.md`); a re-harvest changes bytes only where the operator profile changed.
- No blockers.

## Self-Check: PASSED

- Created files exist: `meta/harvestStoreCorpus.ts`, `meta/__tests__/storeCorpus.test.ts`, corpus `MANIFEST.json`, `NOTES.md`, `operator/`, `backups/`, `v0.8/`, `v0.9/`, `v0.10/`, `edge/`.
- Commits exist and are ancestors of HEAD: `b6834ba46`, `fa6c791de`, `44e0c7a24`, `1918c94af`.
- `storeCorpus.test.ts` 21 passed; `fakeHomeIsolation` 7 passed; `pnpm codecheck`, `pnpm lint` (production PASS, tests PASS), `pnpm find-deadcode` (PASS at baseline), `pnpm planning-gates` (12/12) all exit 0; `npx prettier --check` over the two TS files clean (the corpus tree is prettier-ignored by `.prettierignore`).
- Acceptance criteria: manifest 162 entries (floor 161) with sources operator, backup, v0.8, v0.9, v0.10, edge; `git worktree list --porcelain | grep -c gamelib-v0` prints 0; NOTES.md names `gog_store/auth.json`, `nile_config` and `legendaryConfig`; every `expect` value present; floor equals the committed file count; the identifiers read from the live profile (OS account name, Steam and GOG account values, Humble gamekeys, GOG auth values; 22 in all) occur in no corpus file.

---
*Phase: 85-store-host-config-and-versioned-migrations*
*Completed: 2026-11-22*
