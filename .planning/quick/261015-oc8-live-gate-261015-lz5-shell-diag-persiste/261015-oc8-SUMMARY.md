---
phase: quick-261015-oc8
plan: 01
subsystem: tauri-shell/diagnostics
tags: [shell-diag, macos-epic-embed, packaged-build, launchservices, live-gate, macos, evidence, todos]

requires:
  - phase: quick-261015-lz5
    provides: "The 30-site shell_diag routing in macos_epic_embed.rs whose packaged-launch behaviour this gate observes"
provides:
  - "An observed-on-hardware verdict for the todo: a LaunchServices-launched packaged build with stderr on /dev/null wrote the embed's didFinishNavigation diagnostic to gamelib-shell.log under its own pid, and the line survived a Cmd+Q exit"
  - "A direct measurement of the failure mode the fix exists for: lsof shows the packaged shell's fd 1 and fd 2 are /dev/null, with the stderr offset advancing"
  - "A packaged-build live-gate recipe: nohup build, DMG recovery + sha256 tie, open -n, pid/frontmost/fd asserts, STORES tab click, pid-scoped grep, Cmd+Q, census"
affects: [tauri-shell, macos-epic-embed, diagnostics]

actuals:
  tokens: ~60000
  tasks: 1
  commits: 1
plan_head_before: beca31cbf
plan_head_after: the single docs(quick-261015-oc8) commit that carries this file (no code commits)

tech-stack:
  added: []
  patterns:
    - "For a packaged-launch gate, launch with `open -n` and assert `lsof -p <pid> -a -d 1,2` shows /dev/null BEFORE scoring any 'it persisted' claim — otherwise the discard being tested is not in force"
    - "Scope every log grep to `pid=<pid> ` from the launch you own; the same literal was already in the file from an earlier `tauri dev` pid and would have read as a false pass"

key-files:
  created:
    - .planning/quick/261015-oc8-live-gate-261015-lz5-shell-diag-persiste/261015-oc8-PLAN.md
    - .planning/quick/261015-oc8-live-gate-261015-lz5-shell-diag-persiste/evidence/README.md
    - .planning/quick/261015-oc8-live-gate-261015-lz5-shell-diag-persiste/evidence/gamelib-shell.log.pid-60602.txt
    - .planning/quick/261015-oc8-live-gate-261015-lz5-shell-diag-persiste/evidence/shell-binary.sha256
    - .planning/quick/261015-oc8-live-gate-261015-lz5-shell-diag-persiste/evidence/build-1.log
    - .planning/quick/261015-oc8-live-gate-261015-lz5-shell-diag-persiste/evidence/0{1..3}-*.png
    - .planning/quick/261015-oc8-live-gate-261015-lz5-shell-diag-persiste/evidence/{winlist,click}.swift
    - .planning/quick/261015-oc8-live-gate-261015-lz5-shell-diag-persiste/evidence/type.sh
    - .planning/todos/completed/2026-10-15-macos-epic-embed-shell-diag-persistence-unverified-on-a-packaged-launch.md
  modified:
    - .planning/STATE.md
  deleted:
    - .planning/todos/pending/2026-10-15-macos-epic-embed-shell-diag-persistence-unverified-on-a-packaged-launch.md

key-decisions:
  - "Ran the gate inline from the orchestrating session (no planner/executor spawn), per the 261015-n5k precedent; the plan was still written before the record was closed."
  - "Used `pnpm tauri:dev:packaged` (`tauri build --debug`), the configuration the original 2026-10-13 todo was found under; the dev-sidecar path a --debug bundle takes is irrelevant because the writer under test is the Rust shell binary, which was tied to the compiled one by sha256."
  - "Launched with `open -n`, never by running the binary from a shell, so the process had no terminal; confirmed with lsof rather than assumed."
  - "Scored the todo's cheaper literal (didFinishNavigation) as the pass; attempted the D-14 launcher-scheme literal via the chrome-side navigate channel, got nothing, and recorded it as un-exercised rather than failed."

requirements-completed: [TODO-oc8-1]

duration: ~6min wall clock app time (open 17:32:04, quit 17:37:03 local) plus a ~5 min build and the write-up
completed: 2026-10-15
status: complete
---

# Quick Task 261015-oc8: `macos_epic_embed.rs`'s `shell_diag` lines, observed in a packaged launch

## What was measured

A `tauri build --debug` bundle of HEAD `beca31cbf` (fix commit `9fa43de5e` included), recovered
from the DMG and tied to `src-tauri/target/debug/gamelib-shell` by sha256
(`4c6c5871…a58cdd`), launched via `open -n` on this Mac at 17:32:04 local on 2026-10-15.

| what | measured |
| --- | --- |
| shell pid / frontmost pid | 60602 / 60602 |
| shell fd 1, fd 2 | `/dev/null`, `/dev/null` (stderr offset 2538 → 2918 across the Epic page load) |
| the literal in the binary | 1 (old `[shell] `-prefixed form: 0) |
| the literal in `gamelib-shell.log` | file line 3937: `1792038877 pid=60602 macos_epic_embed: didFinishNavigation succeeded -- host: store.epicgames.com` |
| `[shell] ` prefix leaked into the file for this pid | 0 |
| D-14 launcher-scheme literal | 0 (not induced; see evidence README (e)) |
| after Cmd+Q | pid gone in 2 s; literal still at line 3937; the pid's own `quit (Cmd+Q)` and `exit requested (code=Some(0))` lines follow it |
| teardown census | `gamelib-shell`, `sidecar.js`, `bin/vite`, `:5173` all empty |

## Verdict

**PASS, observed.** The claim `261015-lz5` made at desk — that routing the embed's diagnostics
through `crate::shell_diag` makes them persist on a packaged launch where `eprintln!` alone is
discarded — holds in exactly the configuration it was made for. The discard was measured
(`/dev/null` on fd 2, offset advancing), the line landed in the shell's file under the packaged
pid in the expected `{epoch} pid={pid} ` shape, and it survived the app's quit path.

No code change.

## Not verified / recorded for later

- The D-14 launcher-scheme literal was not induced. The chrome-side
  `window.api.storeEmbedNavigate('com.epicgames.launcher://…')` produced no embed line at all;
  that hook fires on page-initiated navigations and needs a real link on the Epic surface.
- `location.hash='#/store/epic'` in the auto-opened inspector did not change the route in the
  packaged build (it did under `tauri dev` in `261015-n5k`). The STORES tab click was used
  instead. Not investigated.
- `gamelib-shell.log` is still unrotated: 334 960 bytes / 3939 lines after this run. The todo's
  open observation stands, untouched.

## Files

Evidence bundle, rig and the pid-scoped log extract are in `evidence/` (see its README for the
(a)–(e) breakdown). The source todo is moved to `completed/` with a Resolution.
