---
phase: quick-261123-txk
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/crates/gamelib-engine/src/fetch.rs
  - src-tauri/crates/gamelib-engine/tests/fetch_replay.rs
  - src-tauri/crates/gamelib-engine/tests/fixtures/recorded/fetch_selftest/download-ranged/
  - src-tauri/crates/gamelib-engine/tests/fixtures/recorded/fetch_selftest/download-ranged-ignored/
  - src-tauri/crates/gamelib-engine/tests/fixtures/recorded/fetch_selftest/download-ranged-no-length/
  - src-tauri/crates/gamelib-engine/tests/fixtures/recorded/fetch_selftest/download-ranged-bad-probe/
  - src-tauri/crates/gamelib-wine/tests/golden_wine_manager.rs
  - src-tauri/crates/gamelib-wine/tests/fixtures/golden/wine_manager/cases.json
  - src-tauri/crates/gamelib-wine/tests/fixtures/golden/wine_manager/MANIFEST.json
  - src-tauri/crates/gamelib-wine/tests/fixtures/golden/wine_manager/expected/install-ranged-checksum-match/
  - src-tauri/crates/gamelib-wine/tests/fixtures/golden/wine_manager/expected/install-ranged-checksum-mismatch/
  - src-tauri/crates/gamelib-wine/tests/fixtures/recorded/wine_manager/install-ranged-checksum-match/
  - src-tauri/crates/gamelib-wine/tests/fixtures/recorded/wine_manager/install-ranged-checksum-mismatch/
  - .planning/todos/pending/2026-11-23-fallback-and-wine-downloads-are-single-stream.md
  - .planning/todos/completed/2026-11-23-fallback-and-wine-downloads-are-single-stream.md
  - .planning/phases/87-engine-wine-and-tools/87-48-PLAN.md
autonomous: true
requirements:
  - "quick:261123-txk"
  - "todo:2026-11-23-fallback-and-wine-downloads-are-single-stream"

estimate:
  tokens: 90000
  raw_tokens: 90000
  tasks: 3
  confidence: low
  # estimate-calibration 2026-11-23: factor 1, 0 samples, confidence low. basis: chars/4 of what the executor
  # reads, writes and sees: fixed 35k (workflow, summary template, this plan, conventions skill, todo) + T1 30k
  # (fetch.rs read whole, golden_wine_manager.rs slices, ~350 lines written, fixture script, cargo output)
  # + T2 18k (fetch_replay.rs, ~350 lines of tests, fixtures) + T3 7k

must_haves:
  truths:
    - "A download whose HEAD succeeds with a non-zero `Content-Length` and `Accept-Ranges: bytes` arrives as EasyDl's did: chunks from `plan_ranges` (EasyDl `_calcRanges` with its default chunk size, min(size/10, 10 MiB), at least five), each fetched with `Range: bytes=<start>-<end>` from the request's own URL over at most `DOWNLOAD_CONNECTIONS` (5) concurrent GETs, each 206 checked against the requested range and the HEAD length, written at its offset into `<dest>.part`, and renamed over `dest` only when every range is complete"
    - "No `Accept-Ranges: bytes`, no `Content-Length` (or a file under 10 bytes) is today's single stream, one GET, byte for byte unchanged: every existing golden (fetch_selftest, wine_manager, dxvk, dxmt, runtimes) passes untouched because no recorded HEAD carries `accept-ranges`"
    - "A ranged GET answered 200 falls back to one stream: a 200 to the first range is streamed as the whole file with no further request; a 200 to a later range drops every range and the `.part`, then one GET without a `Range` header streams the file"
    - "The wine manager's sha512 check runs over the joined file: `install-ranged-checksum-match` installs exactly as `install-checksum-match` does, and `install-ranged-checksum-mismatch` refuses exactly as `install-checksum-mismatch` does (same tree, store, events, notifications, requests, spawns), and both replays finish with every ranged exchange consumed"
    - "The ranged work stays inside the Rust shutdown contract (D-17): nothing is spawned onto the runtime (the range futures are polled by the download's own future through `buffer_unordered`), so the caller's registrant covers them (`wine-install` today, `engine-fallback` once 87-47 lands); a cancel drops every range and removes `.part`; each range's send and every chunk read are bounded by `DOWNLOAD_IDLE_LIMIT`"
    - "Every `ctx.fetch.download` caller gets it through the one helper with no caller change: the wine manager, the DXVK-family tools, runtimes, and the fallback engine 87-47 ports"
    - "The todo is in `.planning/todos/completed/` with a Resolution section, and 87-48 no longer plans to edit it"
  artifacts:
    - path: "src-tauri/crates/gamelib-engine/src/fetch.rs"
      provides: "DOWNLOAD_CONNECTIONS, RANGE_CHUNK_MAX, plan_ranges, the ranged arm of ReqwestFetch::download and Replay::download (one shared engine), Replay's range-pinned matching"
      contains: "DOWNLOAD_CONNECTIONS"
    - path: "src-tauri/crates/gamelib-engine/tests/fetch_replay.rs"
      provides: "ranged Replay goldens (happy path, ignored range, no length, bad probe, cancel, progress) and real-socket ranged tests (redirect, concurrency bound, both 200 fallbacks, a failed range)"
    - path: "src-tauri/crates/gamelib-wine/tests/fixtures/recorded/wine_manager/install-ranged-checksum-match/exchanges.json"
      provides: "the wine-manager ranged golden: HEAD with accept-ranges and ten 206 range exchanges"
    - path: ".planning/todos/completed/2026-11-23-fallback-and-wine-downloads-are-single-stream.md"
      provides: "the closed todo with its Resolution"
  key_links:
    - from: "src-tauri/crates/gamelib-wine/src/manager/install.rs"
      to: "src-tauri/crates/gamelib-engine/src/fetch.rs"
      via: "installVersion's `ctx.fetch.download(request(ctx, download), &tar_file, ...)` reaches ReqwestFetch::download, whose ranged arm runs before `sha512_hex(&tar_file)` hashes the joined file"
      pattern: "download\\(request\\(ctx, download\\)"
    - from: "src-tauri/crates/gamelib-wine/tests/golden_wine_manager.rs"
      to: "src-tauri/crates/gamelib-wine/tests/fixtures/recorded/wine_manager/install-ranged-checksum-match/exchanges.json"
      via: "every_install_case_matches_the_ts_tree_store_events_and_requests replays the case and `replay.finish()` fails on any ranged exchange left unconsumed"
      pattern: "install-ranged"
    - from: "src-tauri/crates/gamelib-engine/src/fetch.rs"
      to: "src-tauri/crates/gamelib-engine/tests/fixtures/recorded/fetch_selftest/download-ranged/exchanges.json"
      via: "Replay's twin search matches each ranged GET to the exchange recording the same `range` header, whatever order they arrive in"
      pattern: "\"range\""
---

<objective>
Close the todo `2026-11-23-fallback-and-wine-downloads-are-single-stream.md` (read it in full: it is the spec). The shared
Rust download helper, `Fetch::download` in `src-tauri/crates/gamelib-engine/src/fetch.rs` (the `ctx.fetch.download`
seam; there is no separate `ctx.download`), streams every archive on one GET. The TS `downloadFile`
(`src/backend/utils.ts`) handed the transfer to EasyDl: a HEAD for the size, then ranged GETs over five parallel
connections. This plan adds that ranged, bounded-parallel download to the one helper, with the single stream kept as
the fallback, the sha512 check over the joined file, and new goldens for the ranged request pattern.

This is its own visible change, not part of a port (87-CONTEXT D-16: a golden diff never mixes a port with a fix). The
87-07 goldens keep pinning the HEAD plus one GET for servers that do not advertise ranges (D-10), and the ranged
goldens are new, Rust-only, synthetic recordings.

Purpose: a multi-hundred-megabyte Wine, Proton-GE or CrossOver archive (and the 228 MB fallback engine) no longer
arrives on one connection where a host throttles per connection.
Output: three commits. Task 1 is the tracer: the ranged engine in `fetch.rs` and two wine-manager goldens. Task 2 adds
the 200 fallbacks and proves the helper at the seam (fetch_selftest goldens, real sockets). Task 3 closes the todo and
takes the todo edit out of 87-48. Then the SUMMARY.

Not the executor's job: committing the SUMMARY, PLAN or STATE.md belongs to the orchestrator's docs commit. The todo
move IS this plan's job (the orchestrator asked for it) and is committed in Task 3.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.claude/skills/gamelib-conventions/SKILL.md
@.planning/todos/pending/2026-11-23-fallback-and-wine-downloads-are-single-stream.md
@src-tauri/crates/gamelib-engine/src/fetch.rs

Facts measured at plan time (HEAD `e4271faac`):

- The seam. `Fetch` (fetch.rs line 207) has `get` and `download(req, dest, progress, cancel)`. `ReqwestFetch::download`
  (line 462) sends a HEAD (any failure is `FailedToGetHeaders`), then one GET, then `write_body` (line 261), which
  streams into `<dest>.part` through `stream_into` (line 297, cancel first, `DOWNLOAD_IDLE_LIMIT` per chunk, progress
  at most once per `PROGRESS_INTERVAL_MS` by the injected clock, then a final 100% report), hashes sha256 while
  streaming, and renames over `dest`. `Replay::download` (line 848) serves a HEAD only when the case recorded one
  (`has_free`), ignores that HEAD's headers, and streams the recorded GET body through the same `write_body`.
  `PINNED_HEADERS` (line 537) is a 9-entry array with no `range`. The twin search in `Replay::serve` (line 802)
  matches on method, path and query only. `futures-util` 0.3 is already a dependency; `bytes` is not.
- Callers, all through `ctx.fetch.download`, none needing a change: `gamelib-wine/src/manager/install.rs` line 350
  (wine manager; holds `ctx.engine.shutdown.register("wine-install")` at line 562 and races the caller's cancel and
  the shutdown token in `Watch`), `gamelib-wine/src/tools/install_tool.rs` line 196 (DXVK-family tools),
  `gamelib-wine/src/runtimes.rs` line 298. The sha512 check is `sha512_hex(&tar_file)` (install.rs line 367), run
  after `download` returns, so it already covers whatever file the helper produced. Other `impl Fetch` types
  (`Tap` and friends in tests, `WaitsForCancel` in `src-tauri/src/wine_dispatch.rs` and `manager/testkit.rs`,
  `Asked`, `FixedList`, `FakeLutris`) only delegate or fake: the trait signature does not change, so none of them is
  touched.
- 87-47 (the fallback-engine port, not yet executed; the phase is at plan 30 of 59) downloads through
  `ctx.fetch.download`, so it inherits the ranged path. Its goldens (87-14) stub `downloadFile` and record no HTTP
  exchanges, so this change cannot disturb them. 87-48 (not yet executed) Task 2 plans to add the fallback engine's
  files to this todo in `pending/`; Task 3 takes that step out, because the todo will be in `completed/`.
- No recorded HEAD anywhere under `gamelib-engine` or `gamelib-wine` fixtures carries `accept-ranges` (scanned every
  `exchanges.json`): they carry `content-length` only, or nothing. Gating the ranged path on `Accept-Ranges: bytes`
  therefore keeps every existing golden on the single-GET path.
- EasyDl (`node_modules/easydl/dist/index.js`): ranged only when `connections !== 1`, the HEAD has `content-length`
  and `accept-ranges === "bytes"`. Default `chunkSize(size) = min(size / 10, 10 MiB)`, floored; `n = ceil(size /
  chunk)`; the last chunk is the remainder; when `n > 1` and the last chunk is under half a chunk, `floor(chunk/2 -
  last)` bytes move from the second-to-last chunk into it. A pool of five workers; each range sends `Range:
  bytes=a-b` and must answer 206. EasyDl sent ranges to the post-redirect `finalAddress`; this plan does not (see
  Task 1). For a size under 10 the chunk is 0 and EasyDl divides by zero.
- The wine-manager goldens. `golden_wine_manager.rs`: `FLOOR = 19` (line 40), MANIFEST `{count: 19, floor: 19}`,
  `assert!(wanted.len() >= 12, ...)` for install cases (line 1079). `Tap` records one `HEAD url` and one `GET url`
  per download whatever the case recorded, so a ranged case's `requests.json` equals its single-GET twin's;
  `replay.finish()` is what proves every ranged exchange was really requested. The TS wine-manager oracle was deleted
  in 87-22, so these goldens are Rust-owned now and nothing re-records them. `install-checksum-match` and
  `install-checksum-mismatch` share the same 200-byte `body-3.bin` (`GE-Proton9-27.tar.xz`) and differ only in
  `body-1.txt` (the sha512 asset); their `expected/` files contain no case id. Recorded HEAD for the archive:
  `{"content-length": "200"}`, flagged `"synthetic": true` like every archive exchange in those cases.
- Fixture byte format. `exchanges.json` and `MANIFEST.json` round-trip byte for byte through Python
  `json.dumps(obj, indent=2, ensure_ascii=False) + "\n"`. `cases.json` does NOT (it inlines short arrays and objects,
  prettier-style), so its new entries are inserted as text, not rewritten through `json.dumps`.
- Baselines. `cargo test -p gamelib-engine --features testing --test fetch_replay`: 14 passed. `--lib fetch::`: 0
  passed (49 filtered out). `cargo test -p gamelib-wine --features testing --test golden_wine_manager`: 7 passed. Full
  `cargo test -p gamelib-wine --features testing`: lib 113, dxvk_incidents 39, golden_discovery 11, golden_dxvk 6,
  golden_runtimes 5, golden_wine_core 18, golden_wine_manager 7. Full `cargo test -p gamelib-engine --features
  testing`: lib 49, fetch_replay 14, golden_config 7, twin_vectors 3. Both crates: `cargo clippy ... --all-targets
  --features testing -- -D warnings` clean, `cargo fmt -p gamelib-engine -p gamelib-wine --check` exit 0. `pnpm exec
  jest --runTestsByPath src/backend/__tests__/engineWineFixtureRedaction.test.ts`: 10 passed (it scans every
  `tests/fixtures` file of both crates for home paths and secrets; floor 4662 files, only raised). `pnpm
  planning-gates`: 12/12. `verify.plan-structure` on 87-48-PLAN.md: valid, 2 tasks.
- Formatter (gamelib-conventions, the `<verify>` rule). No path this plan writes is one prettier checks:
  `npx prettier --file-info` reports `"inferredParser": null` for `fetch.rs` and `fetch_replay.rs` (a `--check` on a
  `.rs` path exits 2, "No parser could be inferred"), and `"ignored": true` for `cases.json`, `MANIFEST.json`, every
  `exchanges.json` and `expected/` file, and `.planning/` (87-48-PLAN.md included). So no task carries
  `npx prettier --check`; `cargo fmt --check` is the formatter gate for the `.rs` files, and the JSON fixtures are kept
  consistent by matching the corpus format above.
- Rust shutdown contract (gamelib-conventions; 87-CONTEXT D-17). The ranged work adds no spawn, no child, no exit
  work and no boot work. Its in-flight work is covered by the caller's registrant only because it never leaves the
  caller's future: that is why the plan forbids spawning the range transfers onto the runtime.
- `graphify-out/` is gitignored, so `graphify update .` after the code change dirties nothing tracked.
</context>

<dirty_tree_protocol>
The working tree holds unrelated uncommitted work that must not be touched: `.planning/state.json`,
`.planning/debug/resolved/cold-start-link-not-installed.md`, spike logs under `.planning/spikes/`, two files in
`.planning/todos/completed/`, an untracked `.planning/phases/100-game-page-without-the-menu/.gitkeep`, other untracked
spike files and `Schedule I Free Sample.dxvk-cache` at the repo root. A Phase 87 executor and other quick tasks may be
editing and committing in this tree (87-31 also edits `golden_wine_manager.rs`). None of this plan's paths is dirty at
plan time.

Rules for every commit in this plan:
1. Stage by exact path only: `git add -- <path> ...` (and `git mv` in Task 3). Never `git add -A`, `git add .`,
   `git commit -a`, `git stash`, `git checkout`/`git restore` on a path you did not write, and never the gsd-tools
   `commit` helper without `--files` (it sweeps every dirty `.planning` file).
2. Before `git commit`, check that `git diff --cached --name-only` is exactly this task's paths. If anything else is
   staged, do not commit: stop and report it.
3. After the commit, check its file list. If another session committed in between, use the SHA your own
   `git commit` printed, not `HEAD`.
4. End each commit message with the attribution lines from your session's system-reminder.
</dirty_tree_protocol>

<tasks>

<task type="tracer">
  <name>Task 1 (tracer): the ranged download in the shared helper, end to end through the wine manager over two new ranged goldens</name>
  <files>src-tauri/crates/gamelib-engine/src/fetch.rs, src-tauri/crates/gamelib-wine/tests/golden_wine_manager.rs, src-tauri/crates/gamelib-wine/tests/fixtures/golden/wine_manager/cases.json, src-tauri/crates/gamelib-wine/tests/fixtures/golden/wine_manager/MANIFEST.json, src-tauri/crates/gamelib-wine/tests/fixtures/golden/wine_manager/expected/install-ranged-checksum-match/, src-tauri/crates/gamelib-wine/tests/fixtures/golden/wine_manager/expected/install-ranged-checksum-mismatch/, src-tauri/crates/gamelib-wine/tests/fixtures/recorded/wine_manager/install-ranged-checksum-match/, src-tauri/crates/gamelib-wine/tests/fixtures/recorded/wine_manager/install-ranged-checksum-mismatch/</files>
  <precondition>`git status --porcelain -- src-tauri/crates/gamelib-engine/src/fetch.rs src-tauri/crates/gamelib-wine/tests/golden_wine_manager.rs src-tauri/crates/gamelib-wine/tests/fixtures/golden/wine_manager src-tauri/crates/gamelib-wine/tests/fixtures/recorded/wine_manager` prints nothing (no other session is mid-edit on these; 87-31 also edits golden_wine_manager.rs). If it prints anything, stop and report.</precondition>
  <read_first>
    - src-tauri/crates/gamelib-engine/src/fetch.rs (whole file, once)
    - src-tauri/crates/gamelib-wine/src/manager/install.rs lines 320-375 (the download call and the sha512 check)
    - src-tauri/crates/gamelib-wine/tests/golden_wine_manager.rs lines 36-100 (FLOOR, check_manifest), 395-475 (Tap), 655-700 (start), 1070-1095 (the install loop)
    - src-tauri/crates/gamelib-wine/tests/fixtures/recorded/wine_manager/install-checksum-match/exchanges.json
    - node_modules/easydl/dist/index.js lines 401-430 (`_calcRanges`), only if the prose below leaves a doubt
  </read_first>
  <action>
All Rust in `fetch.rs`. The trait signature, `FetchError`, `DownloadOutcome`, `Progress` and the single-stream code
(`write_body`, `stream_into`, today's GET path in both `download` impls) do not change.

1. Constants and the range plan. Add `pub const DOWNLOAD_CONNECTIONS: usize = 5` (EasyDl's `connections`) and
`pub const RANGE_CHUNK_MAX: u64 = 10 * 1024 * 1024` (the cap in EasyDl's default chunk size). Add
`pub fn plan_ranges(size: u64) -> Option<Vec<(u64, u64)>>` returning inclusive `(start, end)` pairs: EasyDl's
`_calcRanges` with its default chunk size. chunk = min(size / 10, RANGE_CHUNK_MAX) in integers; `None` when chunk is
0 (a file under 10 bytes, where EasyDl divides by zero). n = ceil(size / chunk); the first n-1 chunks are `chunk`
bytes and the last is the remainder; when n > 1 and 2 x last < chunk, move (chunk - 2 x last) / 2 bytes (integer
division: EasyDl's floor of its float arithmetic) from the second-to-last chunk to the last. EasyDl's other branch
(size / chunk below `connections`) cannot run with this chunk size, because size / chunk is at least 10, so it is not
ported; a property test pins the consequence. Unit tests in a new `#[cfg(test)] mod tests` at the bottom of fetch.rs:
200 gives ten 20-byte ranges (0-19 to 180-199); 5000 gives ten 500-byte ranges; 104_857_601 gives eleven ranges whose
tenth starts at 94_371_840 and is 5_242_881 bytes and whose eleventh is 5_242_880 bytes ending at 104_857_600; 9 and 0
give `None`; and a property loop over sizes 10..=3000 plus 239_861_234 checks the ranges are contiguous from 0 to
size-1, every length is at least 1, and the count is at least `DOWNLOAD_CONNECTIONS`. Add a unit test for the
`Accept-Ranges` check in step 2 (`bytes`, ` Bytes `, `none`, absent).

2. When the ranged path runs. Only when the HEAD succeeded, its `Content-Length` is above 0, its `Accept-Ranges`
value, trimmed, equals `bytes` ignoring case, and `plan_ranges(length)` is `Some`. Otherwise the download takes
today's single-stream path, unchanged. `ReqwestFetch::download` reads both headers from the HEAD response it already
sends. `Replay::download` keeps the served HEAD's headers (today it only checks the status) and reads the same two
from them; a case with no recorded HEAD has no ranged path, as today.

3. One engine for both implementations, so the Replay goldens exercise the code the app runs. Add a crate-private
opener trait (for example `OpenGet: Send + Sync`) with one method that opens a GET for a `FetchRequest` and returns
its status, its `Content-Length` (0 when absent), its `Content-Range` text, and a boxed `Send` stream of
`Result<Vec<u8>, FetchError>` chunks. Use `Vec<u8>` because `bytes` is not a direct dependency and this plan adds no
crate. `ReqwestFetch` implements it with its `builder`, `send` and `bytes_stream`, every error through `classify`.
`Replay` implements it with `serve` and its chunked body (`self.chunk`). Add one crate-private
`async fn download_ranged(...)` taking the opener, the request, the HEAD length, the plan, `dest`, `progress`, the
cancel token and the clock. Both `download` impls call it when step 2 says ranged.

4. `download_ranged`, in order:
(a) Probe: open the first range alone. Every ranged GET is the original request (its URL and headers, so the GameLib
`User-Agent` the goldens pin is kept) plus `Range: bytes=<start>-<end>`, sent to the request's own URL. Do not send
it to the post-redirect URL as EasyDl did: GitHub release assets redirect to signed URLs that expire, and letting each
range follow the redirect itself avoids that. Race every open against the cancel token (biased, cancel first,
`Aborted`) and bound it with `DOWNLOAD_IDLE_LIMIT` (`Network` on expiry). A non-2xx answer is `Status(n)`. A 206 must
carry `Content-Range: bytes <start>-<end>/<HEAD length>` matching what was asked, or it is `Network` (also when the
total differs: the file changed since the HEAD). In this task any other 2xx is `Network`. Task 2 turns a 200 into the
single-stream fallback.
(b) Create the parent directory and `<dest>.part` (`part_path`), and `set_len` it to the HEAD length (`Io` on
failure). The probe comes first so a rejected probe leaves no file.
(c) Fetch every range through one futures-util stream: the first item writes the probe's already-open body, each
other item opens its range (validated as in (a)) and then writes it. Drive the stream with
`buffer_unordered(DOWNLOAD_CONNECTIONS)`, so at most five GETs are in flight, the probe included. The range futures are
polled by the download's own future: never spawn them onto the runtime. That way they cannot outlive the call, the
caller's shutdown registrant covers them, and dropping the download drops them (the Rust shutdown contract, D-17).
(d) Each range opens its own handle on `.part` (write, no truncate, no create) and seeks to its start. It then
writes chunk by chunk as `stream_into` does: cancel first, `DOWNLOAD_IDLE_LIMIT` per chunk, `Network` on idle. A body
longer or shorter than the range is `Network`. Flush at the end.
(e) Progress: one shared `Mutex` holding the bytes so far and the last report time. After each chunk, add under the
lock. When `clock.now_ms()` is at least `PROGRESS_INTERVAL_MS` past the last report and the token is not cancelled,
call `progress` while still holding the lock (`total` = HEAD length, `percentage` as `percentage()`), so reports never
go backwards and none fires after a cancel.
(f) On the first error or a cancel: drop the range stream first, which closes every handle and connection, then
remove `.part` and return the error. A cancel is `Aborted`.
(g) When every range is done: compute the sha256 by reading `.part` back in blocks with `tokio::fs`, checking the
token between blocks. `DownloadOutcome.sha256` is documented as the hash of the bytes written, and 87-47's pin check
relies on it. Then make one 100% report (skipped if cancelled), then rename `.part` over `dest` (`Io` on failure,
removing `.part`). `bytes` = HEAD length.

5. Replay matching. Add `"range"` to `PINNED_HEADERS` (10 entries). Make the twin search in `serve` also require the
recorded `range` header to equal the request's (both absent counts as equal), keeping the `rust_only` preference
first. Parallel ranged GETs to one URL then each find their own exchange whatever order they arrive in, and a
`Range` drift is reported by `differences` like any pinned header. Recordings without `range` behave exactly as
today.

6. Docs in fetch.rs. Rewrite the module doc's closing sentence (the one citing research A8) and the last clause of
the `ReqwestFetch` doc comment (one connection per download). Both should say that a download whose HEAD advertises
byte ranges and a length arrives in EasyDl's ranges over at most five connections, and that anything else is the
single stream (quick 261123-txk). Add one sentence to the `Fetch::download` doc saying the sha256 is over the joined
file either way. Update the `Replay` struct doc's download paragraph to describe the ranged arm and range-pinned
matching.

7. Two wine-manager goldens, generated by a one-off script kept outside the repo (your session scratchpad, not
committed). It reads the base cases' files as data and writes new files only under the new case directories.
- `recorded/wine_manager/install-ranged-checksum-match/`: `body-1.txt` is a byte copy of
`install-checksum-match/body-1.txt`. `exchanges.json` has the base's `ex-1` (the `.sha512sum` GET) unchanged. `ex-2`
is the archive HEAD answering `{"content-length": "200", "accept-ranges": "bytes"}`. `ex-3` to `ex-12` are GETs of
`https://downloads.oracle.invalid/GE-Proton9-27.tar.xz` with the base GET's request headers plus `"range":
"bytes=<a>-<b>"` for `plan_ranges(200)` (0-19 to 180-199, in order). Each answers status 206 with `{"content-type":
"application/x-xz", "content-length": "20", "content-range": "bytes <a>-<b>/200"}` and its `bodyFile`
`body-<n>.bin`, which is that 20-byte slice of `install-checksum-match/body-3.bin`. Every exchange keeps
`"synthetic": true`. Write it in the corpus format (`json.dumps(indent=2, ensure_ascii=False) + "\n"`). The script
asserts the ten slices concatenate to the base `body-3.bin` byte for byte.
- `recorded/wine_manager/install-ranged-checksum-mismatch/`: the same, but `body-1.txt` is a byte copy of
`install-checksum-mismatch/body-1.txt`.
- `expected/install-ranged-checksum-match/` and `expected/install-ranged-checksum-mismatch/`: byte copies of the five
files in `expected/install-checksum-match/` and `expected/install-checksum-mismatch/`.
- `cases.json`: insert two entries before the closing `]` as text. Each is a copy of its base case's raw text block,
in the file's own inline style, with only `"id"` changed and `"note"` rewritten to say it is Rust-only (quick
261123-txk), that the HEAD advertises byte ranges so the archive arrives as ten 20-byte ranged GETs joined before
the sha512 check, and that everything else is the base case's golden. Check that `json.load` still parses and that
`git diff` on the file shows only added lines plus the one comma.
- `MANIFEST.json`: `{"count": 21, "floor": 21}` in the corpus format.

8. `golden_wine_manager.rs`, keeping the edits small because 87-31 also edits this file. Raise `FLOOR` from 19 to 21
and the install-case guard from `>= 12` to `>= 14`. Append one `#[test]`,
`the_ranged_install_cases_record_a_ranged_download`. For both `install-ranged-*` ids it asserts the case is in
`cases.json`, and that the recorded exchanges hold exactly one archive HEAD answering `accept-ranges: bytes` and
`content-length: 200`, and exactly ten archive GETs, each carrying a `range` header and answered 206. It also asserts
that their bodies, ordered by range start, concatenate to `recorded/wine_manager/install-checksum-match/body-3.bin`.
This keeps "ranged" from passing vacuously if a later edit flattens the fixture to one GET.

Commit (dirty_tree_protocol): `feat(quick-261123-txk): ranged five-connection download in the shared fetch helper`,
staging fetch.rs, golden_wine_manager.rs, cases.json, MANIFEST.json and every file under the four new case
directories, by path.
  </action>
  <verify>
    <automated>cd src-tauri && cargo test -p gamelib-wine --features testing --test golden_wine_manager   # passed [HEAD=7 EXPECT==8]; the install loop now replays both install-ranged-* cases and finish() consumes all ten ranged exchanges in each</automated>
    <automated>cd src-tauri && cargo test -p gamelib-engine --features testing --lib fetch::   # passed [HEAD=0 EXPECT>=6] (plan_ranges vectors, the None case, the property loop, the Accept-Ranges check)</automated>
    <automated>cd src-tauri && cargo test -p gamelib-engine --features testing && cargo test -p gamelib-wine --features testing   # every binary passes; fetch_replay stays [HEAD=14 EXPECT==14 GUARD MUTATION: dropping the Accept-Ranges condition from step 2 sends ranged GETs for the recorded `download` case and turns replay_streams_a_recorded_download_byte_for_byte red] and golden_dxvk stays [HEAD=6 EXPECT==6 GUARD MUTATION: the same mutation makes the DXVK archive downloads (HEAD with content-length, no accept-ranges) request unrecorded ranges]</automated>
    <automated>cd src-tauri && cargo clippy -p gamelib-engine --all-targets --features testing -- -D warnings && cargo clippy -p gamelib-wine --all-targets --features testing -- -D warnings && cargo fmt -p gamelib-engine -p gamelib-wine --check   # Rust-only formatter gate: the .rs paths have no prettier parser and every fixture path is prettier-ignored (measured at plan time), so no prettier --check is carried</automated>
    <automated>pnpm exec jest --runTestsByPath src/backend/__tests__/engineWineFixtureRedaction.test.ts 2>&1 | grep -E '^Tests:'   # tests passed [HEAD=10 EXPECT==10 GUARD MUTATION: a new fixture carrying a `/Users/<name>` path or a non-REDACTED auth header turns it red]; the new fixtures carry no home path or secret</automated>
    <automated>test "$(grep -v '^\s*//' src-tauri/crates/gamelib-engine/src/fetch.rs | grep -c 'tokio::spawn')" -eq 0   # invariant guard [HEAD=0 EXPECT==0 GUARD MUTATION: running the range transfers as runtime tasks instead of buffer_unordered futures turns it red]: no detached work in the helper</automated>
  </verify>
  <acceptance_criteria>
    - `grep -v '^\s*//' src-tauri/crates/gamelib-engine/src/fetch.rs | grep -c 'DOWNLOAD_CONNECTIONS'` [HEAD=0 EXPECT>=2]
    - `grep -v '^\s*//' src-tauri/crates/gamelib-engine/src/fetch.rs | grep -c '"range"'` [HEAD=0 EXPECT>=1]
    - `grep -c 'this uses one (research A8)' src-tauri/crates/gamelib-engine/src/fetch.rs` [HEAD=1 EXPECT==0]
    - `grep -c 'a single connection per download' src-tauri/crates/gamelib-engine/src/fetch.rs` [HEAD=1 EXPECT==0]
    - `grep -c '"id": "install-ranged-' src-tauri/crates/gamelib-wine/tests/fixtures/golden/wine_manager/cases.json` [HEAD=0 EXPECT==2]
    - `grep -c '"count": 21' src-tauri/crates/gamelib-wine/tests/fixtures/golden/wine_manager/MANIFEST.json` [HEAD=0 EXPECT==1]
    - `grep -c '"range": "bytes=' src-tauri/crates/gamelib-wine/tests/fixtures/recorded/wine_manager/install-ranged-checksum-match/exchanges.json` [HEAD=absent EXPECT==10]
  </acceptance_criteria>
  <done>A wine-manager install whose server advertises byte ranges downloads in ten ranges over at most five connections, is joined, passes or fails the sha512 check exactly as the single-GET goldens do, and every existing golden still passes on the single stream.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: the 200 fallbacks, and the helper proven at the seam (ranged fetch_selftest goldens and real sockets)</name>
  <files>src-tauri/crates/gamelib-engine/src/fetch.rs, src-tauri/crates/gamelib-engine/tests/fetch_replay.rs, src-tauri/crates/gamelib-engine/tests/fixtures/recorded/fetch_selftest/download-ranged/, src-tauri/crates/gamelib-engine/tests/fixtures/recorded/fetch_selftest/download-ranged-ignored/, src-tauri/crates/gamelib-engine/tests/fixtures/recorded/fetch_selftest/download-ranged-no-length/, src-tauri/crates/gamelib-engine/tests/fixtures/recorded/fetch_selftest/download-ranged-bad-probe/</files>
  <read_first>
    - src-tauri/crates/gamelib-engine/tests/fetch_replay.rs (whole file, once: the helpers, the Replay tests, `local_server`)
    - src-tauri/crates/gamelib-engine/tests/fixtures/recorded/fetch_selftest/download/exchanges.json
  </read_first>
  <behavior>
    Replay, over new `fetch_selftest` cases (all built from the 5000-byte `download/body-2.bin`; `finish()` clean unless noted):
    - download-ranged: HEAD `{content-length: 5000, accept-ranges: bytes}` plus ten 206 range exchanges recorded in REVERSE order -> the file equals body-2.bin, `bytes` 5000, sha256 of body-2.bin, only the destination left in its directory (no `.part`), `finish()` clean (proves matching is by `range`, not position)
    - download-ranged-ignored: the same HEAD, then the probe GET (`range: bytes=0-499`) answered 200 with the whole 5000-byte body -> the file equals body-2.bin, and `finish()` clean proves no other request was made
    - download-ranged-no-length: HEAD `{accept-ranges: bytes}` with no length, then a GET with no `range` header -> one stream, the file equals body-2.bin, `finish()` clean
    - download-ranged-bad-probe: the probe answered 206 with `content-range: bytes 0-499/4000` -> `FetchError::Network`, no file at all, `finish()` clean
    - cancel: download-ranged with chunk size 100 and `FixedClock::stepping(0, 1000)`, cancelling inside the first report -> `Aborted`, exactly one report, the directory empty (no `finish()`: the cancel leaves recorded ranges unrequested by design)
    - progress: download-ranged with chunk size 100 and `FixedClock::stepping(0, 400)` -> every report has total 5000, bytes never decrease, the last is (5000, 5000, 100.0)
    ReqwestFetch against a local range server (real sockets; the existing no-Accept-Ranges test stays as it is: GET, HEAD, GET):
    - honours ranges, reached through a 302 from `/moved/<name>`: the file equals the body and its sha256 matches; at the target the log holds one HEAD and ten ranged GETs whose `Range` values are exactly `plan_ranges(5000)`, so each kept its `Range` across the redirect; the most concurrent ranged GETs seen is at least 2 and at most 5
    - answers every ranged GET with 200 and the whole body (still advertising ranges): the file is identical and the log is the HEAD plus exactly one GET
    - answers the probe with 206 and every later range with 200: the file is identical, the log holds exactly one GET with no `Range` header, and no `.part` is left
    - answers the range starting at 2500 with 500: `Status(500)` and the directory empty
  </behavior>
  <action>
RED first: write the four fixture cases and the ten tests above, and run them. The two 200-fallback cases (the
download-ranged-ignored Replay test and the two socket tests that answer 200) must fail against Task 1's engine,
which turns a 200 into `Network`. Record the failing names in the SUMMARY. Any other test failing at RED is a Task 1
defect: fix it in fetch.rs and say so in the SUMMARY.

GREEN, in `download_ranged` (fetch.rs):
- The probe answered 200: the server ignored `Range`. Stream that same response as the whole file through
`write_body`, with total = its `Content-Length` (or the HEAD length when it has none). Make no further request.
- A later range answered 200: drop the range stream, remove `.part`, then open one GET of the original request with no
`Range` header through the same opener, and stream it through `write_body` (total as above, non-2xx is `Status(n)`).
Carry this signal with a crate-private type (for example an inner enum returned by the range future). Do not add a
variant to the public `FetchError`: its categories are matched by every caller.
- Everything else Task 1 built stays as it is.

Fixtures (a one-off script outside the repo again, corpus JSON format, `"synthetic": true` on each exchange, request
headers copied from `download/exchanges.json`'s GET plus `range` where ranged; bodies are slices of
`download/body-2.bin`, or the whole file where a 200 answers): the four directories named in `<files>`, shaped as
`<behavior>` says. download-ranged-bad-probe needs only the HEAD and the probe exchange; give the probe a 500-byte
body.

Socket tests: replace nothing. Add a configurable range server beside `local_server`, with a mode per test (honours
ranges; ignores every range with a 200; honours only the probe and answers later ranges with a 200; fails the range
starting at 2500 with a 500). It answers HEAD with `Content-Length` and `Accept-Ranges: bytes`. It answers a ranged
GET with 206, `Content-Range` and the slice. It serves `/moved/<name>` as a 302 to `/<name>`. At the target it logs
`<METHOD> <path> <range or ->`. It tracks concurrent ranged GETs: increment after reading the request head, wait 50
ms, write, decrement, and keep the maximum. Assert on the target-path entries only.

Then run `graphify update .` from the repo root (AST only, gitignored output).

Commit (dirty_tree_protocol): `feat(quick-261123-txk): fall back to one stream when a range is answered 200; ranged fetch goldens and socket tests`,
staging fetch.rs, fetch_replay.rs and every file under the four new fixture directories, by path.
  </action>
  <verify>
    <automated>cd src-tauri && cargo test -p gamelib-engine --features testing --test fetch_replay   # passed [HEAD=14 EXPECT>=24]; RED (before the fallbacks): exactly the three 200-fallback tests fail</automated>
    <automated>cd src-tauri && cargo test -p gamelib-engine --features testing && cargo test -p gamelib-wine --features testing   # every binary passes; golden_wine_manager [HEAD=7 EXPECT==8], lib fetch:: [HEAD=0 EXPECT>=6]</automated>
    <automated>cd src-tauri && cargo clippy -p gamelib-engine --all-targets --features testing -- -D warnings && cargo clippy -p gamelib-wine --all-targets --features testing -- -D warnings && cargo fmt -p gamelib-engine -p gamelib-wine --check   # Rust-only formatter gate: .rs has no prettier parser and the fixtures are prettier-ignored, so no prettier --check is carried</automated>
    <automated>pnpm exec jest --runTestsByPath src/backend/__tests__/engineWineFixtureRedaction.test.ts 2>&1 | grep -E '^Tests:'   # tests passed [HEAD=10 EXPECT==10 GUARD MUTATION: a new fixture carrying a `/Users/<name>` path turns it red]</automated>
    <automated>test "$(grep -v '^\s*//' src-tauri/crates/gamelib-engine/src/fetch.rs | grep -c 'tokio::spawn')" -eq 0   # invariant guard [HEAD=0 EXPECT==0 GUARD MUTATION: running the fallback GET as a runtime task turns it red]</automated>
  </verify>
  <acceptance_criteria>
    - `ls src-tauri/crates/gamelib-engine/tests/fixtures/recorded/fetch_selftest | grep -c '^download-ranged'` [HEAD=0 EXPECT==4]
    - `grep -c 'Status(500)' src-tauri/crates/gamelib-engine/tests/fetch_replay.rs` [HEAD=0 EXPECT>=1]
    - the RED run's failing test names (the three 200-fallback tests) are recorded in the SUMMARY
  </acceptance_criteria>
  <done>A server that ignores Range, at the probe or later, still gets the file on one stream. The ranged request pattern is pinned by Replay goldens that pass whatever order the ranges arrive in. Real sockets prove the redirect, the five-connection bound and failure cleanup.</done>
</task>

<task type="auto">
  <name>Task 3: close the todo with its Resolution, and take the todo edit out of 87-48</name>
  <files>.planning/todos/pending/2026-11-23-fallback-and-wine-downloads-are-single-stream.md, .planning/todos/completed/2026-11-23-fallback-and-wine-downloads-are-single-stream.md, .planning/phases/87-engine-wine-and-tools/87-48-PLAN.md</files>
  <precondition>Tasks 1 and 2 are committed, and `git status --porcelain -- .planning/phases/87-engine-wine-and-tools/87-48-PLAN.md .planning/todos` shows neither this plan's todo nor 87-48-PLAN.md as dirty. If 87-48 has already been executed (an `87-48-SUMMARY.md` exists), stop and report instead of editing it.</precondition>
  <action>
1. Move the todo file named in `<files>` from `.planning/todos/pending/` to `.planning/todos/completed/` with
`git mv`, keeping the file name. Keep its frontmatter keys and values (the `completed/` directory is exempt from the
triage gate, but do not drop the keys). Add `src-tauri/crates/gamelib-engine/src/fetch.rs (Fetch::download: the
ranged path)` to its `files:` list. Append a `## Resolution` section in the file's own prose style, recording:
- the date and quick task 261123-txk, with the Task 1 and Task 2 commit SHAs your own commits printed;
- the request pattern: a HEAD; a probe of the first range; then EasyDl's chunks (min(size/10, 10 MiB), at least five)
over at most five concurrent ranged GETs to the request's own URL, each 206 checked against its range and the HEAD
length, joined in `<dest>.part`;
- the fallbacks: no `Accept-Ranges: bytes` or no length is the single stream, a 200 at the probe is streamed whole,
and a 200 later restarts as one plain GET;
- the sha512 still runs over the joined file, proven both ways by `install-ranged-checksum-match` and
`install-ranged-checksum-mismatch`;
- the 87-07 single-GET goldens are unchanged, and the new goldens are Rust-only synthetic recordings (D-16);
- every `ctx.fetch.download` caller inherits it with no change: the wine manager, the tools, runtimes, and the
fallback engine 87-47 ports;
- 87-48's step that would have extended this todo was removed;
- the ranged path against a real GitHub-hosted archive is first exercised live by the Phase 87 gate's wine-manager
download (87-CONTEXT D-11 item 4), and the Linux-facing downloads by Phase 99 (D-13).

2. Amend `.planning/phases/87-engine-wine-and-tools/87-48-PLAN.md` with scoped `Edit` calls only (never `Write`).
Change nothing else:
- In the frontmatter `files_modified`, delete the line naming this todo's pending path.
- Replace the `D-16` must_haves truth with: "D-16: the single-stream download todo filed by 87-22 was closed by quick
261123-txk, which made the shared Fetch::download ranged; the fallback engine downloads through ctx.fetch.download and
inherits it, so this plan edits no todo".
- In `<objective>`, end the first sentence after "in one commit", dropping the clause about extending the
single-stream download todo.
- In Task 2's `<name>`, drop "; extend the single-stream todo".
- In Task 2's `<files>`, drop the todo's path.
- In Task 2's `<action>`, replace the last sentence (adding the fallback engine's files to the todo) with "The
single-stream todo is already closed (quick 261123-txk): make no todo edit."
- In Task 2's `<automated>` comment, drop the clause saying the todo is under .planning.
Then run `node ~/.claude/gsd-core/bin/gsd-tools.cjs query verify.plan-structure .planning/phases/87-engine-wine-and-tools/87-48-PLAN.md`.
It must still report `valid: true` with 2 tasks.

3. Commit (dirty_tree_protocol): `docs(quick-261123-txk): close the single-stream download todo; 87-48 no longer
edits it`, staging the rename (both todo paths) and 87-48-PLAN.md, by path.
  </action>
  <verify>
    <automated>test ! -e .planning/todos/pending/2026-11-23-fallback-and-wine-downloads-are-single-stream.md && test -f .planning/todos/completed/2026-11-23-fallback-and-wine-downloads-are-single-stream.md && grep -q '^## Resolution' .planning/todos/completed/2026-11-23-fallback-and-wine-downloads-are-single-stream.md   # completed todo [HEAD=absent EXPECT==present], with a Resolution heading</automated>
    <automated>test "$(grep -c 'todos/pending/2026-11-23-fallback-and-wine-downloads-are-single-stream' .planning/phases/87-engine-wine-and-tools/87-48-PLAN.md)" -eq 0   # [HEAD=2 EXPECT==0]</automated>
    <automated>node ~/.claude/gsd-core/bin/gsd-tools.cjs query verify.plan-structure .planning/phases/87-engine-wine-and-tools/87-48-PLAN.md | grep -E '"valid": true|"task_count": 2' | wc -l   # [HEAD=2 EXPECT==2 GUARD MUTATION: an Edit that drops Task 2's closing task tag or its name element turns valid false]</automated>
    <automated>pnpm planning-gates 2>&1 | grep -c '^\[PASS\]'   # gates passed [HEAD=12 EXPECT==12 GUARD MUTATION: a pending todo missing its `ready:` key turns todo-frontmatter-gate.py red]; every written path is under .planning (prettier-ignored), so no prettier --check is carried</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'quick 261123-txk' .planning/phases/87-engine-wine-and-tools/87-48-PLAN.md` [HEAD=0 EXPECT>=2]
    - `ls .planning/todos/completed | grep -c '^2026-11-23-fallback-and-wine-downloads'` [HEAD=0 EXPECT==1]
  </acceptance_criteria>
  <done>The todo is closed with a Resolution naming the commits, and 87-48 no longer plans an edit to a file that has moved.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| remote download host -> GameLib | HEAD headers, 206/200 answers, `Content-Range` and bodies are untrusted, and they decide where bytes land in `<dest>.part` |
| download future -> app exit | ranged transfers are in-flight work that must not outlive a quit |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261123-txk-01 | Tampering | `download_ranged` range validation | high | mitigate | Every 206 must carry `Content-Range` equal to the requested range and the HEAD length. A body longer or shorter than its range is `network`. Writes go only at the range's own offset in a pre-sized `.part`, renamed only when every range is complete. The wine manager's sha512 over the joined file is proven both ways by the two `install-ranged-*` goldens (Task 1) |
| T-261123-txk-02 | Tampering | an asset that changes between ranges (a mirror swap) | medium | mitigate | A `Content-Range` total differing from the HEAD length is `network`. Where the caller has a checksum (the wine manager's sha512, the fallback engine's pinned size and sha256) a mixed file is refused. Tools archives have no checksum, as with the single stream today; GitHub release assets are immutable |
| T-261123-txk-03 | Denial of Service | ranged transfers at quit and on a stalled host | medium | mitigate | No spawn onto the runtime: `buffer_unordered(DOWNLOAD_CONNECTIONS)` futures inside the download's own future, under the caller's registrant (`wine-install`; `engine-fallback` for 87-47). The cancel token drops every range and removes `.part`. Each range's send and every chunk read are bounded by `DOWNLOAD_IDLE_LIMIT`. The `tokio::spawn` invariant guard is in Tasks 1 and 2 |
| T-261123-txk-04 | Denial of Service | `set_len` to a hostile HEAD length | low | accept | A `set_len` failure is `io` and removes `.part`. A single stream of the same length would fill the disk the same way, so the ranged path adds no new exposure |
| T-261123-txk-05 | Information disclosure | URLs and headers in errors, logs and Replay messages | medium | mitigate | `FetchError` stays a category (no new public variant; the fallback signal is crate-private). Nothing prints a URL. `Range` values are not secret, and the hidden-header list is unchanged |
| T-261123-txk-06 | Tampering | unrelated dirty work and concurrent sessions in the tree | medium | mitigate | dirty_tree_protocol: exact-path staging, the staged list checked against `<files>`, the dirty-path preconditions in Tasks 1 and 3 |
| T-261123-txk-SC | Tampering | npm/pip/cargo installs | high | accept | No package is installed or upgraded: `futures-util` and `tokio` are already dependencies of gamelib-engine, and `bytes` is deliberately not added |
</threat_model>

<verification>
- `cargo test -p gamelib-engine --features testing` and `cargo test -p gamelib-wine --features testing` pass in full:
  fetch_replay >= 24, lib `fetch::` >= 6, golden_wine_manager 8, golden_dxvk 6, golden_runtimes 5. The existing
  single-GET goldens pass unchanged.
- clippy `-D warnings` and `cargo fmt --check` are clean on both crates. The fixture redaction scan shows 10 passed.
  `pnpm planning-gates` is 12/12.
- No `tokio::spawn` in fetch.rs outside comments.
- The todo is in `completed/` with a Resolution, and 87-48-PLAN.md is structurally valid with no pending-path reference.
</verification>

<success_criteria>
A wine, Proton-GE, CrossOver or fallback-engine archive from a host that advertises byte ranges downloads over up to
five ranged connections, as the TS EasyDl did. Any other host gets today's single stream. The sha512 check still
judges the joined file, the request pattern of both paths is pinned by goldens, and the todo is closed.
</success_criteria>

<output>
Create `.planning/quick/261123-txk-ranged-five-connection-download-for-wine/261123-txk-SUMMARY.md` when done. Do not commit it: the orchestrator's docs commit takes it.
</output>
