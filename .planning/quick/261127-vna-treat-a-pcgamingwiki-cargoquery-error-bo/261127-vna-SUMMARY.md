---
phase: quick-261127-vna
plan: 01
subsystem: gamelib-info / wiki / pcgamingwiki
tags: [rust, pcgamingwiki, gog, goldens, todo-close]
requires: []
provides:
  - "pcgw::page_id reads a 2xx GOG-id cargoquery answer without `cargoquery` as no GOG id and falls through to the title search"
  - "live-gog-linux / live-gog-mac goldens show the fixed flow (pcgamingwiki ok)"
  - "synthetic golden gog-pcgw-cargo-permissiondenied-falls-back-to-title-search-synthetic (MANIFEST count 41)"
affects:
  - src-tauri/crates/gamelib-info/src/wiki/pcgw.rs
key-files:
  modified:
    - src-tauri/crates/gamelib-info/src/wiki/pcgw.rs
    - src-tauri/crates/gamelib-info/tests/wiki_source_edges.rs
    - src-tauri/crates/gamelib-info/tests/golden_wiki_sources.rs
    - src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/cases.json
    - src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/MANIFEST.json
  created:
    - src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/live-gog-linux/body-11.json
    - src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/live-gog-linux/body-12.json
    - src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/live-gog-mac/body-10.json
    - src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/live-gog-mac/body-11.json
    - src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki/gog-pcgw-cargo-permissiondenied-falls-back-to-title-search-synthetic/
    - src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki/expected/gog-pcgw-cargo-permissiondenied-falls-back-to-title-search-synthetic/
decisions:
  - "A 2xx cargoquery answer with no (or null) `cargoquery` is no GOG id; non-2xx and transport failures stay outcome error with no title search"
  - "The cargo query is kept (not skipped) so GOG-id lookups resume if PCGamingWiki restores the permission"
  - "GOG HowLongToBeat stays notfound: hltb::get's GOG branch reads only the gog.com page (out of scope)"
metrics:
  duration: ~35m
  completed: 2026-11-27
  tasks: 3
status: complete
actuals:
  tasks: 3
  commits: 3
plan_head_before: 8727e978921bef3674c88c4edf9f7975c02d6fa2
plan_head_after: 41f9205664d4a6cd1d1d7dcbb2e3de0ca7d3c7ce
---

# Quick 261127-vna: PCGamingWiki cargoquery permissiondenied fallthrough Summary

A PCGamingWiki GOG-id cargoquery that answers 2xx without `cargoquery` (the live `permissiondenied` error object) now falls through to the title search instead of erroring, so GOG titles get PCGamingWiki data and stop re-fetching on every visit.

## Commits

| Task | Commit | Subject |
| ---- | ------ | ------- |
| 1+2 (fix) | `bae1378bb` | fix(info): read a PCGamingWiki cargoquery answer without cargoquery as no GOG id (14 paths) |
| 3 (test) | `74516d3de` | test(info): pin the PCGamingWiki cargoquery permissiondenied fallthrough with a synthetic GOG golden (15 paths) |
| 3 (docs) | `41f920566` | docs(todo): close the PCGW cargoquery permissiondenied todo |

Note on `commits:` in the frontmatter: `plan_head_before..HEAD` spans 7 commits because a concurrent session (phase 88.2 / a todo park) committed in the same window; this plan made exactly 3 (table above), and the frontmatter `commits` records those 3.

## What changed

- `pcgw.rs` `page_id`: reads `data?.cargoquery?.[0]?.title?.pageID`. Absent or null `cargoquery` writes one fixed note (`pcgamingwiki gog id answer has no cargoquery, searching by title`; no title, no URL) and continues to the title search. The module doc records this as the second departure from the TS and drops the D-03 throw bullet.
- `wiki_source_edges.rs`: removed the old arm that expected `Error` for permissiondenied; added `pcgamingwiki_reads_a_cargoquery_answer_without_cargoquery_as_no_gog_id` (permissiondenied, `{}`, null cargoquery -> Ok with 3 URLs in order; zero-hit search -> NotFound with 2 URLs; 403 cargoquery -> Error with 1 URL; note holds no title and no `://`).
- Live GOG goldens: both recordings gained the PCGW search and parse exchanges as byte copies of the same-day Epic ex-1 / ex-3; expected `pcgamingwiki` is the TS-oracle Epic object, `fetchStatus.pcgamingwiki` is `ok`, HLTB unchanged (null / notfound); requestsMade 11 (linux) / 10 (mac); after-state caches match the Rust writer byte for byte.
- New synthetic case pins the fallthrough with the real 373-byte permissiondenied body; its recorded dir differs from the cargo-empty case only in `body-1.json`, its expected dir is identical.
- Todo moved to `completed/` with a Resolution section (TS half has no target, HLTB caveat, both commits).

## Verification

- `cargo test -p gamelib-info`: all green (lib 185; golden_wiki 11; golden_wiki_sources 8; wiki_source_edges 16).
- `gamelib-info-cli` drift test `a_recorded_service_that_matches_the_golden_passes_every_wiki_case`: ok.
- `cargo fmt -p gamelib-info -- --check`: clean. Prettier omitted (rustfmt covers `.rs`; fixtures and `.planning` are prettier-ignored).
- Task 1 expected-red probe: `golden_wiki` failed on `live-gog-mac: requests` before Task 2, as planned; green after.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `opt_prop` returns `Some(Null)` for a present-but-null key**
- **Found during:** Task 1 (new edge test, `{"cargoquery": null}` arm)
- **Issue:** `opt_prop(Some(&data), "cargoquery")` yields `Some(Value::Null)` when the key exists with a JSON null (only a null/undefined *receiver* is `None`), so the null arm still threw in `index`.
- **Fix:** `.filter(|v| !v.is_null())` on the read.
- **Files modified:** `src-tauri/crates/gamelib-info/src/wiki/pcgw.rs`
- **Commit:** `bae1378bb`

**2. [Plan gate mismatch, not a code change] Docs commit shows as add+delete at git's default rename threshold**
- The Resolution section made the moved file only 37% similar to the original, so `git show -M` (default 50%) reports `A` + `D` rather than one `R` row; `-M20%` reports `R037`. The commit still holds exactly those two paths (the move plus the appended Resolution), nothing else. The plan's literal one-row gate (`wc -l == 1`) would count 2 at default settings.

No other deviations. No live network was used. No Rule 4 items. No build failures outside gamelib-info.

## Known Stubs

None.

## Threat Flags

None. The new diagnostic line is fixed text (T-vna-02), copied exchanges carry only `accept` and `user-agent` headers (T-vna-03), and every commit was staged by explicit path (T-vna-05).

## Working-tree hygiene

Staged and committed only this plan's paths. The concurrent session's dirty files (`gamelib-proc`, `.planning/state.json`, spike logs, etc.) were not touched. `graphify update .` was run (graphify-out is untracked; nothing from it committed). This SUMMARY, STATE.md and PLAN.md are not committed (the orchestrator handles the docs commit).

## Self-Check: PASSED

- FOUND commits `bae1378bb`, `74516d3de`, `41f920566` (all ancestors of HEAD).
- FOUND the four live-GOG body files and the synthetic case dirs; `cmp` against Epic bodies passed.
- FOUND the todo in `.planning/todos/completed/`, absent from `pending/`.
