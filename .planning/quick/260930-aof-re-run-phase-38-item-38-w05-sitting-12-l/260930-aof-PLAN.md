---
phase: quick-260930-aof
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/260930-aof-re-run-phase-38-item-38-w05-sitting-12-l/appimage_smoke.ts
  - .planning/quick/260930-aof-re-run-phase-38-item-38-w05-sitting-12-l/evidence/
  - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md
  - .planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md
  - .planning/phases/35-electron-cutover-remove-the-electron-build/35-LIVE-GATE.md (every branch in which a launch was made; not on NOT_SCORED)
  - .planning/ROADMAP.md (PASS branch only)
  - .planning/todos/pending/2026-09-29-ci-linux-appimage-glibc-2-39-not-launchable-on-glibc-2-35.md (annotated in place on non-PASS; git mv to .planning/todos/completed/ on PASS)
  - .planning/todos/pending/2026-09-30-host-nvidia-driver-library-mismatch-blocks-38-w05-scoring.md (annotated in place on non-PASS; git mv to .planning/todos/completed/ on PASS)
  - .planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md (append-only addendum, only when a launch was made with NVIDIA_MISMATCH_AT_LAUNCH=no; never closed)
  - src/backend/__tests__/releaseWorkflow.test.ts (PASS branch only, one comment line - the moved glibc todo's path)
  - .planning/todos/pending/ (conditional new todos, only as the Task 3 trigger table requires)
autonomous: true
requirements:
  - QUICK-260930-AOF
  - REQ-35-20
estimate:
  tokens: 150000
  raw_tokens: 150000
  tasks: 3
  confidence: low
must_haves:
  truths:
    - "The launched artifact is the operator's download ~/Downloads/'GameLib_0.7.0_amd64(1).AppImage', re-hashed this sitting at 195123704 bytes and sha256 d7648c37e7721bcb10fc56018b41e531b8cb6a649856d8daeffb24eddcf35943 (the same bytes sitting 11 scored), launched as a hash-identical scratchpad copy, with the Downloads file byte-, mode- and mtime-unchanged. Provenance is recorded as operator-downloaded, hash-pinned, run 36556473399 / tag v0.7.0-glibc-test1 / commit b48e8948f cited, minisign NOT verified, under explicit PROVEN_n and NOT_PROVEN_n lines."
    - "The host GPU state is the changed variable and is re-measured, not trusted: NVIDIA_MISMATCH, the kernel-module and userspace versions, their equality, the module flavour, and the EGL platform / GBM backend inventory are recorded in baseline.env, and NVIDIA_MISMATCH_AT_LAUNCH is re-measured immediately before the scored launch."
    - "A static census, re-run on the fresh stage with the same negative control (the sitting-10 artifact reproduces GLIBC_INCOMPATIBLE), and a PREDICTION plus a GPU_PREDICTION were written BEFORE the scored launch. The census is checked for reproducing sitting 11's census of the same bytes. The stream matchers are self-tested on sitting 10's glibc excerpt, sitting 11's scored EGL-abort excerpt, sitting 11's diag excerpt, and a synthetic file."
    - "The scored launch was direct and unmodified (no install step, no extraction, EXTRA_ENV=(none), SCORED=yes), under a fresh createFakeHomeProfile() in its own session, with identity proven by window _NET_WM_PID -> /proc exe inside a fuse.* mount -> pgrp == launch pgid. Survival is 11 one-second samples t=0..10 plus a t=30 observation; sidecar identity and liveness are recorded; stream line counts come from the FULL app streams before dispose; all scored screenshots were viewed and described."
    - "The verdict follows the pre-registered precedence: loader FAIL, then CONFOUNDED only if NVIDIA_MISMATCH_AT_LAUNCH=yes AND EGL_CONFOUND_LINES>0, then FAIL(gpu-stack-non-mismatch) if the mismatch is absent and the EGL/GBM signature STILL appears, then FAIL(other). A diagnostic arm (WEBKIT_DISABLE_DMABUF_RENDERER=1, SCORED=no) exists if and only if CAUSE_CLASS is gpu-mismatch or gpu-stack-non-mismatch, and it never changes the verdict."
    - "Teardown signals the SHELL pid alone first, so the sidecar exit is observed as a stdin-EOF drain (cold profile only). Afterwards no process remains in any recorded group, the FUSE mount is gone, the idle inhibitor is gone, the fake profile is disposed, the staged copy is deleted, and the same window query that found the window returns 0."
    - "On PASS, 38-W05 moves to human_verification_discharged with a result key directly after id and both older sitting keys kept verbatim; the live counts go open -1 / discharged +1 and ledger-check plus audit-uat agree; ROADMAP, LIVEGATE and HUAT carry sitting 12; the glibc todo and the NVIDIA-mismatch todo are both moved to completed/ with resolution notes; the one test comment naming the glibc todo follows it. On any other verdict exactly one sitting_12_<SESSION_DATE> key is added directly after id (ledger_inplace_check PASS), ROADMAP and the test file are untouched, both todos are annotated in place, and only the todos the trigger table names are filed, each with bare lowercase severity/platform/ready."
  artifacts:
    - path: ".planning/quick/260930-aof-re-run-phase-38-item-38-w05-sitting-12-l/appimage_smoke.ts"
      provides: "A copy of 260930-9l9's harness (C1-C13 inherited unchanged) with S1-S4: sitting-12 header, gl-w05s12- prefix and w05s12 capture names, an informational EGL_WARNING_LINES stream class, and an informational BUNDLED_GPU_LIBS census line"
    - path: ".planning/quick/260930-aof-re-run-phase-38-item-38-w05-sitting-12-l/evidence/census.txt"
      provides: "The fresh-stage census, CENSUS_REPRODUCES_S11, and the PREDICTION written before the launch"
    - path: ".planning/quick/260930-aof-re-run-phase-38-item-38-w05-sitting-12-l/evidence/census-control.txt"
      provides: "The census negative control on the old ac849f1b artifact, with CONTROL_VERDICT"
    - path: ".planning/quick/260930-aof-re-run-phase-38-item-38-w05-sitting-12-l/evidence/verdict.txt"
      provides: "A single VERDICT line, CAUSE_CLASS, and the evidence each clause rests on"
  key_links:
    - from: "appimage_smoke.ts"
      to: "src/backend/testUtils/fakeHomeProfile.ts"
      via: "import { createFakeHomeProfile }; every spawn uses profile.childEnv()"
      pattern: "createFakeHomeProfile"
    - from: "GameLib window _NET_WM_PID"
      to: "the AppImage FUSE mount"
      via: "/proc/<pid>/exe prefix matched against a fuse.* entry in /proc/self/mountinfo, plus /proc/<pid>/stat pgrp == launch pgid"
      pattern: "\\.mount_"
    - from: "38-VERIFICATION.md frontmatter"
      to: "gsd-core audit-uat by_phase['38']"
      via: "strict YAML; ledger-check.cjs asserts counts and the audit number; ledger_inplace_check.cjs asserts a one-key in-place edit"
      pattern: "sitting_12_2026_09_30|human_verification_discharged"
    - from: ".planning/todos/completed/2026-09-29-ci-linux-appimage-glibc-2-39-not-launchable-on-glibc-2-35.md (PASS only)"
      to: "src/backend/__tests__/releaseWorkflow.test.ts comment (line 1691 at planning time)"
      via: "the comment's todo path follows the git mv, from pending/ to completed/"
      pattern: "todos/completed/2026-09-29-ci-linux-appimage-glibc"
---

<objective>
Re-run Phase 38 item `38-W05` live on this Linux host: sitting 12, the SEVENTH Linux sitting. The artifact is the SAME ubuntu-22.04-built AppImage sitting 11 scored (sha256 `d7648c37...f35943`). The one changed variable is the host GPU stack: the NVIDIA kernel-module/userspace mismatch that CONFOUNDED sitting 11 has been fixed by a reboot.

The item: smoke-launch the CI-produced Linux AppImage. It passes if the AppImage launches directly (no install step, per D-11/D-12's AppImage-only decision), a window appears, and the process survives at least 10 seconds without crashing — the `35-LIVE-GATE.md` criterion-1 bar. It is a recorded scope reduction against D-16 ("artifacts plus a smoke launch"), routed to Phase 38 by REQ-35-20.

History this sitting builds on:
- Sitting 10 (quick `260929-v1v`): the ubuntu-24.04 artifact (`ac849f1b...`) FAILED at the loader (`GLIBC_2.39 not found`). Quick `260929-vyi` moved the Linux leg to ubuntu-22.04.
- Sitting 11 (quick `260930-9l9`): the ubuntu-22.04 artifact cleared the loader, showed a window at 270 ms, then SIGABRTed at 364 ms on `Could not create GBM EGL display: EGL_NOT_INITIALIZED. Aborting...` while `nvidia-smi` reported `Driver/library version mismatch`. Verdict CONFOUNDED. Its diag arm (`WEBKIT_DISABLE_DMABUF_RENDERER=1`, not scored) met every PASS clause but still printed `libEGL warning: egl: failed to create dri2 screen` twice.

This sitting asks: with the mismatch fixed and NO workaround, does the artifact launch, show a window, start its sidecar, survive 10 s and reach a usable UI? If the EGL/GBM abort recurs on a MATCHED driver, that is a FAIL with a new cause (a second, non-mismatch GPU-stack problem), not CONFOUNDED, and gets its own todo.

Purpose: discharge the Linux half of D-16's smoke-launch obligation on real evidence, or record precisely why not.

Output: a harness copy, an `evidence/` directory, the ledger/UAT/LIVE-GATE records, the conditional todo moves, annotations and filings, and one commit.

**Measured at planning time (2026-09-30 ~07:42 NZDT). ALL of these are MUTABLE; the executor re-measures and never trusts them.**

1. **Repo.** HEAD `b438cc901` on `main`. The gate commit `b48e8948f` is an ancestor, 41 commits behind HEAD. Only the untracked spike-025 files are dirty; they are never staged.
2. **GPU (the changed variable).** `/proc/driver/nvidia/version`: `NVIDIA UNIX Open Kernel Module for x86_64  580.173.02`. Userspace: `libnvidia-glcore.so.580.173.02`, `libnvidia-ml.so.580.173.02`. `nvidia-smi` runs (Driver Version 580.173.02). Boot `2026-09-30 07:38:36`. Kernel `7.1.1-76070101-generic` (sitting 11 ran on `7.0.11-76070011-generic` with the proprietary module 580.159.03, so the reboot changed the kernel AND the module flavour, not only the version). EGL external platforms: `10_nvidia_wayland.json`, `15_nvidia_gbm.json`, `20_nvidia_xcb.json`, `20_nvidia_xlib.json`. GBM backends: `dri_gbm.so`, `nvidia-drm_gbm.so`. `/sys/module/nvidia_drm/parameters/modeset` is not readable by this user (do not sudo).
3. **Artifact.** NEWDL: 195123704 bytes, mode 664, mtime 2026-09-30 06:53. OLDDL: 192399864 bytes, mode 775. Sitting 11's census of these exact bytes is in `PREVQ/evidence/census.txt`: max `GLIBC_2.35` (`usr/lib/libcairo.so.2`), 0 of 182 ELF above host, 865 NEEDED, 1 unresolved (`ld-linux-aarch64.so.1` in the arm64 `comet` binary), `PREDICTION=MISSING_LIBS` by rule order. That one unresolved soname is already filed as NEEDTODO. `gh` is not installed; no `.sig`/`latest.json` exists.
4. **Ledger.** 7 open / 19 discharged / 10 retired; open ids `38-W04,38-W05,38-S14,38-S16,38-E01,38-E03,38-E04`; audit-uat total 426. `38-W05` keys in order: `id`, `sitting_11_2026_09_30`, `sitting_10_2026_09_29`, `test`, `expected`, ...
5. **Record anchors (hints only; re-grep).** HUAT: `updated:` line 6; last `sessions:` entry `  - "Sitting 11 -- ...` line 18; `## Current Test` line 21, its bracket paragraph ends `see the "## Sitting 11" section below.]` at line 55; `## Sitting 11` at 1190; EOF 1262. LIVEGATE: sitting-11 `**UPDATE 2026-09-30 (quick `260930-9l9` ...` paragraph lines 90-100, `## Three log sinks` line 102. ROADMAP: top Phase 38 paragraph `**Items: 7 OPEN as of 2026-09-29 (sitting 8), ...` at line 4648 (sittings 9-11 were non-PASS and did not touch it).
6. **Source reference.** `src/backend/__tests__/releaseWorkflow.test.ts:1691` names the glibc todo's `pending/` path; it is the only reference outside `.planning/quick/`. prettier `--file-info` reports it `"ignored": false` (typescript). The NVIDIA todo is referenced only by basename from the glibc todo.
7. **Shell/sidecar signal facts (unchanged, inherited by the harness's C12).** The shell installs no SIGTERM handler; the sidecar runs in its own process group; the type-2 runtime's FUSE server is in the LAUNCH group and serves the sidecar's executable pages. Hence the shell-first teardown.

**Commit under gate:** `b48e8948f` (release-tauri run `36556473399`, tag `v0.7.0-glibc-test1`). A PASS certifies that artifact on this host, not HEAD.

**Claim limit:** ONE host (Pop!_OS 22.04, glibc 2.35, X11 on DISPLAY :1, in whatever GPU state is measured), ONE artifact. Not Wayland, not other distros, not glibc 2.39+ hosts, not the updater flow. `38-W04` (Windows) is NOT in scope.

**Two-profile rule, applied deliberately:** every execution of either artifact runs under a fresh `createFakeHomeProfile()` and there is NO real-profile arm, for the same reasons as sittings 10-11: (a) the item's bar does not depend on sign-in state, libraries or config; (b) running a release artifact against `~/.config/gamelib`, which dev builds keep writing, risks a cross-version write into the operator's real stores; (c) the Linux single-instance socket lives under `$HOME/.config/gamelib`, so a fake HOME also stops a stray real-profile instance from absorbing the launch. Stated cost: the exit observation sees only the cold path and cannot see the `260913-901` class of real-profile-armed handles.

Hard limits for every task:
- No push, no tag, no deleting a remote tag, no workflow dispatch, no network-auth commands, no credentials, no touching the draft release.
- Kill by PID or process GROUP only. No `pkill`, no `killall`, no `pgrep -f` (it self-matches the tool's shell; a `pkill -f` in a tool command kills that shell, exit 144). Count GameLib processes by scanning `/proc/*/exe` basenames.
- Do not edit `.planning/STATE.md`; the orchestrator records the quick-task row.
- Never stage the untracked spike-025 files. Never commit either AppImage, an extracted squashfs, or raw app streams.
- `~/Downloads` is read-only: no chmod, rename or delete. Do not edit the 260929-v1v or 260930-9l9 scripts in place.
- No sudo, no driver or module changes: the GPU state is observed, never altered.
- Tracer-first is not applied: this is a live measurement sitting whose shape (stage and census, scored launch, records) the orchestrator set; the scored launch is itself the single end-to-end path.

The orchestrator should tell the operator: a GameLib window will appear on the desktop for about 35-45 seconds (and possibly a second time if the diagnostic arm runs), then close by itself. Do not click in it.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
All paths are relative to the repo root `/home/graysonmitchell/GameLib`.

| Name | Path or meaning |
|------|-----------------|
| Q | `.planning/quick/260930-aof-re-run-phase-38-item-38-w05-sitting-12-l` (this quick dir); E = `Q/evidence` |
| PREVQ | `.planning/quick/260930-9l9-re-run-38-w05-smoke-launch-against-the-n`, the TEMPLATE sitting (sitting 11). Read its PLAN Task 2 and Task 3 actions (lines 296-513), its SUMMARY and `evidence/verdict.txt`, `session.txt`, `baseline.env`, `census.txt` before starting. Its `appimage_smoke.ts` is the harness to COPY (never edit in place). |
| OLDQ | `.planning/quick/260929-v1v-run-phase-38-item-38-w05-live-on-linux-s` (sitting 10). Its `appimage_provenance.cjs` is reused UNEDITED; its `evidence/app-output-excerpt.txt` (47 glibc lines) and `evidence/census.txt` feed the self-test and the control expectation. |
| SCR | `w05-s12` under the session scratchpad your environment gives you (ext4 `/`, not noexec). Record the absolute SCR in baseline.env. |
| NEWDL | `~/Downloads/GameLib_0.7.0_amd64(1).AppImage`. The name has parentheses: always double-quote it. |
| OLDDL | `~/Downloads/GameLib_0.7.0_amd64.AppImage` (census control only, never launched) |
| STAGED | `SCR/GameLib_0.7.0_amd64-run36556473399.AppImage` |
| LEDGER | `.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-VERIFICATION.md` (~171KB: `grep -n` plus Read with offset/limit, never whole) |
| HUAT | `.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md` (`## Sitting 11` is the voice to match) |
| LIVEGATE | `.planning/phases/35-electron-cutover-remove-the-electron-build/35-LIVE-GATE.md` |
| GLIBCTODO | `.planning/todos/pending/2026-09-29-ci-linux-appimage-glibc-2-39-not-launchable-on-glibc-2-35.md` (UNVERIFIED items 1-7 around lines 103-123; sitting-11 section at the end) |
| NVTODO | `.planning/todos/pending/2026-09-30-host-nvidia-driver-library-mismatch-blocks-38-w05-scoring.md` |
| GTKTODO | `.planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md` (its last section, `## Addendum (2026-09-29, spike 029)`, names "fix the NVIDIA mismatch" as the operator prerequisite for `run-variants.sh 10 plain reparent`) |
| NEEDTODO | `.planning/todos/pending/2026-09-30-ci-linux-appimage-unresolved-needed-libs.md` (already carries the arm64 `comet` finding; never re-filed) |
| LCHK | `.planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs` — flags in its header: `--open/--discharged/--retired` (required), `--open-ids`, `--discharged-includes`, `--includes scope=substr` (scope `open:<id>:<field>` or `discharged:<id>:<field>`), `--human-uat`, `--no-stale-premise` |
| INPL | `.planning/quick/260929-tmw-run-phase-38-item-38-s16-linux-half-live-on/ledger_inplace_check.cjs --rev SHA --key NAME --id 38-W05` — proves exactly one new key directly after `id` and nothing else changed |
| CAP | `.planning/quick/260929-hgm-run-phase-38-item-38-s12-live-on-linux-h/capture_region_fix.py` (`find` -> JSON; `grab --out PNG`) |
| FAKE | `src/backend/testUtils/fakeHomeProfile.ts` — `createFakeHomeProfile({prefix?})` -> {root, env, childEnv(base?), registerCapture(path), dispose()} |
| RUNTS | `node meta/runTs.cjs --bundle --platform=node --target=node22 <entry.ts> [args]` (compiles into a private temp dir: use absolute args and `process.cwd()`, never `__dirname`) |

Read before starting: CLAUDE.md sections "Fake-HOME isolation (two-profile rule)", "The sidecar's exit contract", "A formatter check belongs in every task's <verify>", "Todo triage frontmatter"; and the spike-029 README investigation-trail item 1 (`.planning/spikes/029-linux-embed-allocation-reliability/README.md`, around line 59).

Tooling note: a long `&&`-chained verify can surface a bare "Exit code 1" through the Bash tool. If that happens, copy the block into a scratchpad `.sh` file and run it with `bash`.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Re-measure the baseline (GPU state first-class), stage and hash the artifact, record provenance, copy the sitting-11 harness with the S1-S4 deltas, self-test the matchers, re-census with the negative control, and write the PREDICTION</name>
  <files>Q/appimage_smoke.ts, Q/evidence/baseline.env, Q/evidence/provenance.txt, Q/evidence/census.txt, Q/evidence/census-run.txt, Q/evidence/census-control.txt, Q/evidence/census-run-control.txt, Q/evidence/matchers-s10.txt, Q/evidence/matchers-s11.txt, Q/evidence/matchers-s11diag.txt, Q/evidence/matchers-synthetic.txt, Q/evidence/session.txt</files>
  <action>
**Step 1: baseline.** Write `E/baseline.env` as KEY=VALUE lines; single-quote any value containing a space or shell metacharacter. Prove it sources: `bash -c '. E/baseline.env'` exits 0 with no output.

1. **Host** (as sitting 11): `HOST_OS`, `HOST_GLIBC` (`getconf GNU_LIBC_VERSION`), `KERNEL`, `BOOT_TIME` (`uptime -s`), `XDG_SESSION_TYPE`, `DISPLAY`, `XAUTHORITY` (set and outside `$HOME`), `LOCKED_HINT` (seat0 session, `loginctl show-session <id> -p LockedHint --value`), `NO_NEW_PRIVS` (/proc/self/status; if 1, STOP: score NOT_SCORED and go to Task 3), `LIBFUSE2` (`ldconfig -p` count of libfuse.so.2), `FUSERMOUNT`, `DEV_FUSE`, `PRE_WINDOWS` (`xdotool search --onlyvisible --name '^GameLib$'` count; must be 0), `GAMELIB_PROCS` (/proc/*/exe basename scan for `gamelib-shell`/`gamelib-sidecar`; report only, never kill).
2. **GPU — the changed variable. Record all of it.**
   - `NVIDIA_SMI_FIRST_LINE` (first line of `nvidia-smi` stdout+stderr) and `NVIDIA_SMI_DRIVER` (the `Driver Version:` value, or `none`).
   - `NVRM_VERSION` (the version token from `/proc/driver/nvidia/version`) and `NVRM_FLAVOUR` (`open` if that line contains `Open Kernel Module`, else `proprietary`).
   - `NVML_LIB` (the version suffix of `libnvidia-glcore.so.*` under /usr/lib/x86_64-linux-gnu) and `NVIDIA_VERSIONS_MATCH` (yes if NVRM_VERSION equals NVML_LIB).
   - `NVIDIA_MISMATCH`: `yes` if the nvidia-smi output contains `Driver/library version mismatch` OR `NVIDIA_VERSIONS_MATCH=no`; else `no`. This is the pre-registered definition used at launch too.
   - `NVIDIA_EGL_PLATFORMS` (comma list of `/usr/share/egl/egl_external_platform.d/`), `GBM_BACKENDS` (comma list of `/usr/lib/x86_64-linux-gnu/gbm/`). Informational.
   - `WEBKIT_ENV_IN_SHELL_SRC_AT_GATE`: the count of `WEBKIT_DISABLE_` in `git grep b48e8948f -- src-tauri/src` (the artifact's source; empty output = 0). Planning-time value 0.
   - `GPU_DELTA_VS_S11`: one line comparing against `PREVQ/evidence/baseline.env` (its NVRM_VERSION, NVML_LIB, KERNEL, BOOT_TIME, NVIDIA_MISMATCH) — read those values from that file, do not hard-code them.
3. **Repo.** `HEAD_SHA` and `PRE_EDIT_SHA` (full `git rev-parse HEAD`; Task 3 uses PRE_EDIT_SHA as INPL's `--rev`), `BRANCH`, `GATE_SHA=b48e8948f`, `COMMITS_BEHIND` (`git rev-list --count b48e8948f..HEAD`), `GATE_IS_ANCESTOR` (`git merge-base --is-ancestor b48e8948f HEAD` -> yes/no), `WORKFLOW_LINUX_BASE_AT_GATE` (the Linux `platform:` value in `git show b48e8948f:.github/workflows/release-tauri.yml`), `SCR` (absolute).
4. **Ledger (mutable; measure, never assume).**
   - Parse LEDGER's frontmatter with js-yaml from the repo's node_modules. Record `OPEN0`, `DIS0`, `RET0`, `OPEN_IDS0` (comma-joined), and `W05_KEYS0` (38-W05's keys in order, comma-joined).
   - Confirm with LCHK `--open $OPEN0 --discharged $DIS0 --retired $RET0 --human-uat`: no FAIL line. Record `AUDIT_TOTAL0` from its `audit-uat-total-items` line.
   - Premise checks — if any fails, STOP and report (the item or the sitting numbering changed under this plan): `38-W05` is in `human_verification`; its SECOND key is `sitting_11_2026_09_30` (the last recorded sitting; anything newer means sitting 12 already happened); its `test:`/`expected:` contain "Smoke-launch the CI-produced LINUX installer artifact" and "survives at least 10 seconds"; HUAT's last `sessions:` entry begins `  - "Sitting 11 -- `. Record `SITTING_NO=12` and `LINUX_SITTING_ORDINAL=seventh`.

**Step 2: stage the artifact** (as sitting 11; Downloads is read-only).
- Record `DOWNLOADS_NAME`, `DOWNLOADS_SIZE`, `DOWNLOADS_SHA256`, `DOWNLOADS_MODE_BEFORE` (`stat -c %a`), `DOWNLOADS_MTIME_BEFORE` for NEWDL. SHA256 must equal `d7648c37e7721bcb10fc56018b41e531b8cb6a649856d8daeffb24eddcf35943` and size 195123704; on a mismatch STOP, do not launch, record NOT_SCORED and go to Task 3.
- `mkdir -p SCR`; `cp --no-preserve=mode` NEWDL to STAGED; re-hash STAGED (must equal); `chmod +x STAGED`. Record `STAGED_PATH`, `STAGED_SHA256`, `STAGED_MODE`.
- Re-stat NEWDL: `DOWNLOADS_MODE_AFTER`/`DOWNLOADS_MTIME_AFTER` must equal BEFORE.
- Hash OLDDL: `CONTROL_ARTIFACT_SHA256` (expect `ac849f1b41204358f2d4689e10eda654edab5e25b47344ddc5640a6355b072c9`), `CONTROL_ARTIFACT_MODE`. Do not chmod it.

**Step 3: provenance.** Run the ORIGINAL, unedited `OLDQ/appimage_provenance.cjs --appimage STAGED --rev b48e8948f` from the repo root, no `--sig`, no `--latest` (its signature/latest keys print SKIP; SKIP is never read as PASS). It must exit 0 (both magic checks PASS); if it exits 1, do not launch, record NOT_SCORED. Write `E/provenance.txt`:
- `OPERATOR_ACCOUNT=` one line: "Per the orchestrator's relay (2026-09-30): the operator's earlier download from the DRAFT release v0.7.0, saved as GameLib_0.7.0_amd64(1).AppImage, the same file sitting 11 (quick 260930-9l9) launched; from release-tauri run 36556473399, tag v0.7.0-glibc-test1, commit b48e8948f; no .sig or latest.json was downloaded."
- The full checker output, plus all Step 2 values.
- `PROVENANCE_OK=operator-accepted` and `PROVENANCE_BASIS=minisign NOT verified by orchestrator decision (no .sig/latest.json downloaded); hash-pinned; run/tag/commit cited`.
- PROVEN_n (one fact each): size and sha256; ELF and AppImage type-2 magic; distinct from the sitting-10 artifact (different sha256 and size); the updater key at `b48e8948f` is the checker's `PUBKEY_KEYID`, with `PUBKEY_SAME_AT_HEAD`; the workflow at the gate commit builds the Linux leg on `WORKFLOW_LINUX_BASE_AT_GATE`; the Downloads file was not modified; the sha256 equals `APPIMAGE_SHA256` in `PREVQ/evidence/provenance.txt` (the same bytes sitting 11 scored — read it from that file).
- NOT_PROVEN_1..5, as sitting 11: (1) no signature verified; (2) no byte carries the run id or tag, `gh` is not installed; (3) commit `b48e8948f` is not provable from the bytes unless `COMMIT_BYTES_HITS` is non-zero; (4) the ubuntu-22.04 build is inferred (workflow at gate plus glibc max <= 2.35), not proven; (5) the draft release is shared and overwritten by every throwaway-tag run; the file's mtime (2026-09-30 06:53 NZDT) is after the run's Linux leg, consistent, not proof.

**Step 4: copy the harness and apply S1-S4.** `cp PREVQ/appimage_smoke.ts Q/appimage_smoke.ts` (same directory depth, so the relative FAKE import stays valid). Then make ONLY these scoped Edits; C1-C13 (kill-by-group-only, `statOf` after the last `)`, `spawnSync`-wrapped xdotool, the `--env`-requires-`--tag diag` refusal, the shell-first teardown, `DISPOSED`/`HARNESS_OK`) stay byte-identical.
- S1. Header comment: name quick 260930-aof (sitting 12); state it was copied from 260930-9l9's `appimage_smoke.ts` at `PRE_EDIT_SHA` with C1-C13 inherited unchanged; list S1-S4 in one line each.
- S2. Retire the sitting-11 token from executable code: the `createFakeHomeProfile` prefix (line ~347) becomes `gl-w05s12-`, and the two raw-capture filename templates (lines ~368-369, the `.stdout`/`.stderr` names under `scratch`) take `w05s12-app-` as their stem. After the edits, no non-comment line may still carry the sitting-11 form of that token (the verify block greps for it); the S1 header refers to sitting 11 only by its quick id `260930-9l9`.
- S3. Append to `STREAM_CLASSES` (line ~297), after `EGL_CONFOUND_LINES`, an informational class `EGL_WARNING_LINES` with the regex `/libEGL warning/`. It is recorded and STREAM_MATCH-listed like the others, and it is NOT a verdict input (it never makes a PASS a FAIL); it exists so a second GPU-stack signal is measured rather than eyeballed.
- S4. In the census, directly after the `LIBC_BUNDLED` line (~490), add `BUNDLED_GPU_LIBS=<n>` plus one `BUNDLED_GPU_LIB <relpath from squashfs-root>` line per path in the same `files` list whose basename matches the case-sensitive regex `/^lib(EGL|GL|OpenGL|gbm|drm|glapi|vulkan).*\.so/`. Informational: PREDICTION logic is unchanged. It answers, statically, whether the artifact ships its own GL/EGL/GBM stack (relevant only if an EGL/GBM abort recurs on a matched driver).
- Confirm it bundles: RUNTS on `Q/appimage_smoke.ts` with no args prints the usage line and exits 2. `npx prettier --file-info Q/appimage_smoke.ts` reports `"ignored": true` (`.planning/` is ignored; ESLint ignores it too), so a prettier check there would be vacuous and is omitted.

**Step 5: matcher self-tests** (`--mode matchers --tag <t> --input <ABS>`, plus the usual `--evidence <abs E> --scratch <abs SCR> --capture-tool <abs CAP>` the harness requires). Expected values:
- (a) `--tag s10`, input `OLDQ/evidence/app-output-excerpt.txt`: `GLIBC_NOT_FOUND_LINES=47`, `EGL_CONFOUND_LINES=0`, `EGL_WARNING_LINES=0`.
- (b) `--tag s11`, input `PREVQ/evidence/app-output-excerpt.txt` (sitting 11's scored stderr, complete at 4 lines): `EGL_CONFOUND_LINES=1`, `EGL_WARNING_LINES=0`, `GLIBC_NOT_FOUND_LINES=0`. This is a REAL-data positive control for the confound matcher.
- (c) `--tag s11diag`, input `PREVQ/evidence/app-output-excerpt-diag.txt` (complete at 31 lines): `EGL_WARNING_LINES=2`, `EGL_CONFOUND_LINES=0`, `PANIC_LINES=0`.
- (d) Write a three-line `SCR/synthetic-streams.txt`: line 1 the exact abort message `Could not create GBM EGL display: EGL_NOT_INITIALIZED. Aborting...`; line 2 `gamelib-shell: error while loading shared libraries: libnotreal.so.9: cannot open shared object file: No such file or directory`; line 3 `libEGL warning: egl: failed to create dri2 screen`. `--tag synthetic`: `EGL_CONFOUND_LINES=1`, `MISSING_SO_LINES=1`, `EGL_WARNING_LINES=1`, `GLIBC_NOT_FOUND_LINES=0`, `PANIC_LINES=0` (each class fires once; none cross-fires).
- Any other result is a harness defect: fix S3 (or the inherited C8 if it regressed) and re-run all four.

**Step 6: census, then the negative control** (from the repo root, Bash timeout 600000; evidence to E, scratch to SCR).
- New: `--mode census --appimage STAGED --commit-needle b48e8948` -> census.txt, census-run.txt.
- Control: `--mode census --tag control --appimage OLDDL --commit-needle 19b5e3a9` -> census-control.txt, census-run-control.txt (`--appimage-extract` only; nothing from AppRun runs).
- Append to census-control.txt: `CONTROL_EXPECTED=` built by READING `OLDQ/evidence/census.txt`'s `PREDICTION`, `ELF_FILES_SCANNED`, `FILES_ABOVE_HOST_GLIBC` and `REQUIRED_GLIBC_MAX` lines (sitting 10's census of that immutable artifact); `CONTROL_VERDICT=PASS` only if all four reproduce, `SKIP` if CONTROL_ARTIFACT_SHA256 did not match (never counts as PASS), else `FAIL`.
- Append to census.txt: `CENSUS_REPRODUCES_S11=yes|no`, comparing these keys and every `UNRESOLVED` line against `PREVQ/evidence/census.txt`: `ELF_FILES_SCANNED`, `REQUIRED_GLIBC_MAX`, `FILES_ABOVE_HOST_GLIBC`, `REQUIRED_GLIBCXX_MAX`, `LIBC_BUNDLED`, `STATIC_NEEDED_TOTAL`, `STATIC_NEEDED_UNRESOLVED`, `PREDICTION`. On `no`, add `CENSUS_DIFF=` naming each differing key with both values. A difference on identical bytes is an instrument or host-library finding (for example the driver update changing `ldconfig -p`), recorded and explained in session.txt; it does not block the launch.
- A control FAIL/SKIP does not block the launch (the observation is the score), but then `PREDICTION_RELIABILITY=unproven` in session.txt; otherwise `proven-by-negative-control`.

**Step 7: the prediction, written BEFORE Task 2.** Start `E/session.txt` with `SESSION_DATE` (`date +%F`, expected 2026-09-30), `SESSION_START` (ISO UTC), `CONTROL_VERDICT`, `PREDICTION_RELIABILITY`, then:
- `PREDICTION_WRITTEN_AT=<ISO> PREDICTION=<census value> (<basis: glibc max and file, above-host count, unresolved count and names, control verdict, CENSUS_REPRODUCES_S11>)`.
- `PREDICTION_READING=`: pre-registered — `expected-to-launch` if `FILES_ABOVE_HOST_GLIBC=0` AND every `UNRESOLVED` line's requiring path lies under an `arm64/` or `aarch64` directory (a non-host-arch binary the x86_64 launch path cannot load), else `expected-to-fail-at-loader`.
- `CENSUS_FINDING_ALREADY_FILED=yes` if the UNRESOLVED set is exactly `ld-linux-aarch64.so.1 usr/lib/GameLib/build/bin/arm64/linux/comet` (NEEDTODO's finding), `none` if there is no UNRESOLVED line, else `no` (Task 3's trigger table uses it). If `FILES_ABOVE_HOST_GLIBC` > 0, list the files as `CENSUS_FINDING_ABOVE_HOST=...`.
- `GPU_PREDICTION=`: `no-EGL-abort-expected (mismatch cleared: <NVRM_VERSION> = <NVML_LIB>)` if `NVIDIA_MISMATCH=no`, else `EGL-abort-expected (mismatch present)`. This is a written hypothesis, not a verdict input.
  </action>
  <verify>
    <automated>cd /home/graysonmitchell/GameLib && Q=.planning/quick/260930-aof-re-run-phase-38-item-38-w05-sitting-12-l && E=$Q/evidence && bash -c ". $E/baseline.env" && grep -Eq '^OPEN0=[0-9]+$' $E/baseline.env && grep -Eq '^PRE_EDIT_SHA=[0-9a-f]{40}$' $E/baseline.env && grep -Eq '^NVIDIA_MISMATCH=(yes|no)$' $E/baseline.env && grep -Eq '^NVIDIA_VERSIONS_MATCH=(yes|no)$' $E/baseline.env && grep -Eq '^NVRM_FLAVOUR=(open|proprietary)$' $E/baseline.env && grep -q '^W05_KEYS0=id,sitting_11_2026_09_30,' $E/baseline.env && grep -qx 'APPIMAGE_SHA256=d7648c37e7721bcb10fc56018b41e531b8cb6a649856d8daeffb24eddcf35943' $E/provenance.txt && grep -qx 'PROVENANCE_OK=operator-accepted' $E/provenance.txt && grep -q '^PROVEN_7=' $E/provenance.txt && grep -q '^NOT_PROVEN_5=' $E/provenance.txt && [ "$(sed -n 's/^DOWNLOADS_MODE_BEFORE=//p' $E/provenance.txt)" = "$(sed -n 's/^DOWNLOADS_MODE_AFTER=//p' $E/provenance.txt)" ] && [ "$(stat -c %a "$HOME/Downloads/GameLib_0.7.0_amd64(1).AppImage")" = "$(sed -n 's/^DOWNLOADS_MODE_BEFORE=//p' $E/provenance.txt)" ] && test -x "$(sed -n 's/^STAGED_PATH=//p' $E/provenance.txt)" && grep -qx 'GLIBC_NOT_FOUND_LINES=47' $E/matchers-s10.txt && grep -qx 'EGL_CONFOUND_LINES=1' $E/matchers-s11.txt && grep -qx 'EGL_WARNING_LINES=2' $E/matchers-s11diag.txt && grep -qx 'EGL_CONFOUND_LINES=0' $E/matchers-s11diag.txt && grep -qx 'EGL_CONFOUND_LINES=1' $E/matchers-synthetic.txt && grep -qx 'MISSING_SO_LINES=1' $E/matchers-synthetic.txt && grep -qx 'EGL_WARNING_LINES=1' $E/matchers-synthetic.txt && grep -qx 'GLIBC_NOT_FOUND_LINES=0' $E/matchers-synthetic.txt && grep -q '^PREDICTION=' $E/census.txt && grep -Eq '^BUNDLED_GPU_LIBS=[0-9]+$' $E/census.txt && grep -Eq '^CENSUS_REPRODUCES_S11=(yes|no)$' $E/census.txt && grep -q '^COMMIT_NEEDLE=b48e8948' $E/census.txt && grep -Eq '^CONTROL_VERDICT=(PASS|FAIL|SKIP)$' $E/census-control.txt && grep -q '^PREDICTION_WRITTEN_AT=' $E/session.txt && grep -Eq '^PREDICTION_READING=expected-to-(launch|fail-at-loader)$' $E/session.txt && grep -Eq '^GPU_PREDICTION=' $E/session.txt && grep -qx 'DISPOSED=yes' $E/census-run.txt && [ "$(grep -v -E '^[[:space:]]*(\*|//)' $Q/appimage_smoke.ts | grep -c 'w05s11')" -eq 0 ] && grep -q "gl-w05s12-" $Q/appimage_smoke.ts && git diff --quiet -- .planning/quick/260930-9l9-re-run-38-w05-smoke-launch-against-the-n/appimage_smoke.ts && npx prettier --file-info $Q/appimage_smoke.ts | grep -Eq '"ignored":[[:space:]]*true'</automated>
    Also check: RUNTS on `Q/appimage_smoke.ts` with no args exits 2 and prints the usage line; no `gl-w05s12-*` directory is left in the temp root after the census and matcher runs.
    Formatter: every file this task writes is under `.planning/`, which prettier ignores (`--file-info` reports `"ignored": true`, asserted above for the harness). A `prettier --check` would be vacuous, so it is deliberately omitted.
  </verify>
  <done>The baseline is re-measured, sourceable, and carries the full GPU state (mismatch, both versions, their equality, flavour, EGL/GBM inventory, delta vs sitting 11) plus live ledger values and a passed premise check (second key sitting_11_2026_09_30). NEWDL is hash-verified and unmodified; STAGED is a hash-identical executable copy. provenance.txt records the operator-accepted, minisign-unverified provenance with PROVEN_1..7 and NOT_PROVEN_1..5. The harness copy carries S1-S4 on top of unchanged C1-C13 and the sitting-11 source is untouched. All four matcher self-tests pass. census.txt holds PREDICTION, BUNDLED_GPU_LIBS and CENSUS_REPRODUCES_S11; census-control.txt holds CONTROL_VERDICT. session.txt timestamps PREDICTION, PREDICTION_READING, CENSUS_FINDING_ALREADY_FILED and GPU_PREDICTION before any launch.</done>
</task>

<task type="auto">
  <name>Task 2: The scored direct launch with NO workaround under a fake HOME, then the pre-registered verdict (with one labelled diagnostic arm only if the scored streams carry the EGL/GBM signature)</name>
  <files>Q/evidence/session.txt, Q/evidence/smoke-run.txt, Q/evidence/window.png, Q/evidence/window-t10.png, Q/evidence/window-t30.png, Q/evidence/app-output-excerpt.txt, Q/evidence/verdict.txt, and only if the diagnostic arm runs: Q/evidence/smoke-run-diag.txt, Q/evidence/window-diag.png, Q/evidence/window-t10-diag.png, Q/evidence/window-t30-diag.png, Q/evidence/app-output-excerpt-diag.txt</files>
  <precondition>E/provenance.txt reads PROVENANCE_OK=operator-accepted, the checker exited 0, STAGED is executable with the pinned sha256, and E/session.txt carries PREDICTION_WRITTEN_AT. If any of these is false, write VERDICT=NOT_SCORED with the reason and go to Task 3.</precondition>
  <action>
**Step 0: session guard.** Append everything to `E/session.txt`.
- `LOCKED_HINT` must be `no`; if `yes`, STOP and return a checkpoint asking the operator to unlock. Never score a locked session.
- Start the idle inhibitor under setsid in the background: `gnome-session-inhibit --inhibit idle --reason gamelib-38-W05-s12 sleep 1800`. Record `INHIBIT_PID`/`INHIBIT_PGID` (the real gnome-session-inhibit group, not a wrapper shell's) and confirm `gnome-session-inhibit -l` lists the reason.
- Re-check `PRE_WINDOWS=0` and `GAMELIB_PROCS=0`; non-zero means STOP and report. Never kill a process you did not launch.
- Re-measure the GPU immediately before launch with the Task-1 definition: `NVIDIA_MISMATCH_AT_LAUNCH` (yes|no), `NVRM_VERSION_AT_LAUNCH`, `NVML_LIB_AT_LAUNCH`. Do not stop on `yes`: the pre-registered rules below handle it.
- Touch `SCR/stamp` for the leak check.

**Step 1: the scored launch.** Run it ONCE, from the repo root, Bash timeout 600000:

`node meta/runTs.cjs --bundle --platform=node --target=node22 Q/appimage_smoke.ts --mode smoke --appimage STAGED --evidence <abs E> --scratch <abs SCR> --capture-tool <abs CAP>`

No `--tag`, no `--env`: this is the scored arm (`SCORED=yes`, `EXTRA_ENV=(none)`), with no WebKit or GPU environment variable set anywhere — as a user would run it.
- A HARNESS defect (`HARNESS_OK` not 1, a non-empty `GROUP_WINDOWS_AT_TIMEOUT`, or a script bug) may be fixed and re-run with a fresh profile; record each repeat and its reason. `SCORED_LAUNCH_COUNT` counts only valid runs and must end at 1.
- An APP-level failure is NEVER re-run to fish for a pass.
- If FUSE is genuinely unavailable (LIBFUSE2 0 or fusermount missing, with NO_NEW_PRIVS 0): record it, verdict DIRECT_LAUNCH_UNMET, no extract-and-run arm.

**Step 2: view the screenshots.** VIEW `window.png`, `window-t10.png`, `window-t30.png` with the Read tool (whichever exist). Write `SCREENSHOT_VIEWED=yes|no` and a one-line `SCREENSHOT_DESCRIPTION` (s=3 and s=10; any GameLib-drawn UI counts — loading, first-run, login or library; a uniform/blank frame or a WebKit/network error page does not). Write `USABLE_UI=yes|no` from window-t30.png with `USABLE_UI_DESCRIPTION` (`yes` = an interactive GameLib screen: library, login, a first-run page with controls, or settings). `OPERATOR_EYEBALL=yes` only if the operator volunteered a confirmation.

**Step 3: the verdict. Pre-registered; apply mechanically.** Write `E/verdict.txt`, first line `VERDICT=`, second line `CAUSE_CLASS=` (`none` on PASS).

**PASS** requires ALL of:
- `DIRECT_LAUNCH=yes`, `PGID_MATCH=yes`, `WINDOW_APPEARED=yes` within 60 s;
- `SURVIVED_10S=yes` (all 11 SAMPLE lines alive, visible, same-pid, no Z state, no exit event);
- `SIDECAR_BUNDLED=yes` and `SIDECAR_ALIVE_S10=yes`;
- `SHELL_ALIVE_T30=yes` and `EXIT_EVENT_BEFORE_TEARDOWN=no` (a crash at ANY point before the harness's own SIGTERM is a crash, even after 10 s);
- `GLIBC_NOT_FOUND_LINES=0` and `MISSING_SO_LINES=0`;
- `window.png` and `window-t10.png` each with at least 16 distinct colours (`WINDOW_PNG_COLOURS`, `WINDOW_T10_PNG_COLOURS`), viewed, with a SCREENSHOT_DESCRIPTION naming GameLib-drawn UI;
- `SCORED=yes` and `EXTRA_ENV=(none)`.

If the scored run did not PASS, apply in precedence order:
1. **FAIL, CAUSE_CLASS=loader**: GLIBC_NOT_FOUND_LINES > 0 or MISSING_SO_LINES > 0.
2. **CONFOUNDED, CAUSE_CLASS=gpu-mismatch**: NVIDIA_MISMATCH_AT_LAUNCH=yes AND EGL_CONFOUND_LINES > 0 in the scored streams (the sitting-11 rule, unchanged).
3. **FAIL, CAUSE_CLASS=gpu-stack-non-mismatch**: NVIDIA_MISMATCH_AT_LAUNCH=no AND EGL_CONFOUND_LINES > 0 in the scored streams. The mismatch is measured absent, so the EGL/GBM abort is a second GPU-stack problem (host- or artifact-side, unknown), NOT a confound.
4. **FAIL, CAUSE_CLASS=other**: anything else with the preconditions held and a launch made (no window, an exit before teardown, a crash, a vanished window, the sidecar missing or dead, a blank or error frame).

Also: **DIRECT_LAUNCH_UNMET** is the FUSE-absent host branch; **NOT_SCORED** means a precondition or provenance failed, or no valid harness run could be produced.

Write for every verdict: `CAUSE=` (non-PASS: the first verbatim STREAM_MATCH line or the observed symptom, plus the census PREDICTION and PREDICTION_READING); `PREDICTION_MATCHED_OBSERVATION`; `GPU_PREDICTION_MATCHED_OBSERVATION`; `SIDECAR_EXIT_S`, `SIDECAR_ORPHAN`; `SHELL_GONE_MS`, `LAUNCH_GROUP_REMAINDER`; `EXIT_OBSERVATION=` (one line: a stdin-EOF drain after shell SIGTERM, cold profile); `EXIT_OBSERVATION_LIMIT=cold-profile only; cannot see real-profile-armed handles (260913-901 class)`; `PANIC_LINES`, `EGL_CONFOUND_LINES`, `EGL_WARNING_LINES`, `USABLE_UI`; `GPU_STATE_AT_LAUNCH` (mismatch, both versions, flavour, kernel, boot time); `CLAIM_LIMIT=`. If PASS with `EGL_WARNING_LINES` > 0, CLAIM_LIMIT says the GPU stack still emitted N libEGL warnings but the app launched and rendered with no workaround. If PASS with NVIDIA_MISMATCH_AT_LAUNCH=yes, CLAIM_LIMIT says it launched despite the mismatch and claims nothing about any other GPU state.

**Step 4: the diagnostic arm, ONLY if CAUSE_CLASS is gpu-mismatch or gpu-stack-non-mismatch.** Run the harness exactly once more with `--tag diag --env WEBKIT_DISABLE_DMABUF_RENDERER=1`, same args otherwise, fresh profile. Outputs carry `-diag`, `SCORED=no`, and it NEVER changes VERDICT. View its screenshots and record in verdict.txt: `DIAG_OUTCOME=launches-when-confound-bypassed` if it met every PASS clause except SCORED/EXTRA_ENV, else `DIAG_OUTCOME=fails-for-other-reason: <cause>`; `DIAG_EGL_WARNING_LINES`; `DIAG_IS_NOT_A_DISCHARGE=yes`. No other arm, no retry of the scored arm, no second workaround. On PASS, loader FAIL, or CAUSE_CLASS=other, no diag arm runs and no `-diag` file exists.

**Step 5: cleanup and leak check.**
- SIGTERM `-INHIBIT_PGID`; confirm `pgrep -g INHIBIT_PGID` prints nothing and `gnome-session-inhibit -l` no longer lists `gamelib-38-W05-s12`.
- `find ~/.config ~/.local/share ~/.cache -maxdepth 2 -newer SCR/stamp`, filtered to names matching `*gamelib*` case-insensitively or equal to `mimeapps.list` or `applications`. Record `REAL_PROFILE_LEAKS=<count>` and paths (never read contents); attribute any hit by timestamp against `LAUNCH_DATE` and the identifier `com.gamelib.shell`. A leak is an isolation finding; it does not change the verdict.
- Record `FINAL_LEAK_CHECK`: `pgrep -g` is empty for every recorded positive LAUNCH_PGID, SIDECAR_PGID and INHIBIT_PGID (diag arm included; a recorded `-1` means no sidecar was seen and is skipped); no `/.mount_` entry from this run in mountinfo; the /proc exe scan is 0; `POST_TEARDOWN_WINDOWS=0`; no `gl-w05s12-*` directory is left.
- Delete STAGED and `SCR/synthetic-streams.txt` (scratch copies; the Downloads original stays). Record `STAGED_DELETED=yes`. Raw app streams were already shredded by the profile's `registerCapture()`/`dispose()`.
  </action>
  <verify>
    <automated>cd /home/graysonmitchell/GameLib && Q=.planning/quick/260930-aof-re-run-phase-38-item-38-w05-sitting-12-l && E=$Q/evidence && V=$(sed -n 's/^VERDICT=//p' $E/verdict.txt) && C=$(sed -n 's/^CAUSE_CLASS=//p' $E/verdict.txt) && echo "$V" | grep -Eqx 'PASS|FAIL|CONFOUNDED|DIRECT_LAUNCH_UNMET|NOT_SCORED' && { [ "$V" = NOT_SCORED ] || { grep -qx 'DISPOSED=yes' $E/smoke-run.txt && grep -qx 'FAKE_HOME=createFakeHomeProfile' $E/smoke-run.txt && grep -qx 'SCORED=yes' $E/smoke-run.txt && grep -qx 'EXTRA_ENV=(none)' $E/smoke-run.txt && grep -qx 'NO_ORPHANS=yes' $E/smoke-run.txt && grep -qx 'POST_TEARDOWN_WINDOWS=0' $E/smoke-run.txt && grep -q '^EGL_WARNING_LINES=' $E/smoke-run.txt && grep -Eq '^NVIDIA_MISMATCH_AT_LAUNCH=(yes|no)$' $E/session.txt; }; } && { [ "$V" != PASS ] || { [ "$C" = none ] && grep -qx 'DIRECT_LAUNCH=yes' $E/smoke-run.txt && grep -qx 'PGID_MATCH=yes' $E/smoke-run.txt && grep -qx 'SURVIVED_10S=yes' $E/smoke-run.txt && grep -qx 'SIDECAR_BUNDLED=yes' $E/smoke-run.txt && grep -qx 'SIDECAR_ALIVE_S10=yes' $E/smoke-run.txt && grep -qx 'SHELL_ALIVE_T30=yes' $E/smoke-run.txt && grep -qx 'EXIT_EVENT_BEFORE_TEARDOWN=no' $E/smoke-run.txt && grep -qx 'GLIBC_NOT_FOUND_LINES=0' $E/smoke-run.txt && grep -qx 'MISSING_SO_LINES=0' $E/smoke-run.txt && [ "$(awk '/^SAMPLE s=/{n++} END{print n+0}' $E/smoke-run.txt)" -eq 11 ] && test -s $E/window.png && test -s $E/window-t10.png && grep -qx 'SCREENSHOT_VIEWED=yes' $E/verdict.txt; }; } && { [ "$V" != CONFOUNDED ] || { [ "$C" = gpu-mismatch ] && grep -qx 'NVIDIA_MISMATCH_AT_LAUNCH=yes' $E/session.txt && grep -Eq '^EGL_CONFOUND_LINES=[1-9]' $E/smoke-run.txt; }; } && { [ "$C" != gpu-stack-non-mismatch ] || { [ "$V" = FAIL ] && grep -qx 'NVIDIA_MISMATCH_AT_LAUNCH=no' $E/session.txt && grep -Eq '^EGL_CONFOUND_LINES=[1-9]' $E/smoke-run.txt; }; } && if echo "$C" | grep -Eqx 'gpu-mismatch|gpu-stack-non-mismatch'; then grep -qx 'SCORED=no' $E/smoke-run-diag.txt && grep -q '^DIAG_OUTCOME=' $E/verdict.txt && grep -qx 'DIAG_IS_NOT_A_DISCHARGE=yes' $E/verdict.txt; else test ! -e $E/smoke-run-diag.txt; fi</automated>
    Also:
    - For each recorded positive LAUNCH_PGID, SIDECAR_PGID and INHIBIT_PGID value g (diag arm included), `pgrep -g "$g"` prints nothing.
    - With `M` set to each recorded MOUNT_DIR, `[ -z "$M" ] || ! grep -qF " $M " /proc/self/mountinfo` succeeds.
    - `test ! -e` on the recorded STAGED_PATH succeeds, and NEWDL's mode still equals DOWNLOADS_MODE_BEFORE.
    If the chained line surfaces a bare "Exit code 1", run it from a scratchpad `.sh` with `bash`.
    Formatter: every file this task writes is under `.planning/` (prettier-ignored), so a prettier check is vacuous and is omitted.
  </verify>
  <done>Exactly one valid scored run exists (SCORED=yes, EXTRA_ENV=(none)) with the setsid proof, window-to-pid-to-FUSE-mount identity, pgid match, 11 SAMPLE lines, the t=30 observation, sidecar identity and liveness, and the stream census including EGL_WARNING_LINES. Every existing scored screenshot was viewed and described. verdict.txt holds one VERDICT and one CAUSE_CLASS derived by the pre-registered precedence, with CAUSE on non-PASS. The diagnostic arm exists if and only if CAUSE_CLASS is gpu-mismatch or gpu-stack-non-mismatch, and it did not change the verdict. No process, mount, inhibitor, profile or staged copy is left; the leak check is recorded.</done>
</task>

<task type="auto">
  <name>Task 3: Record sitting 12 (discharge on PASS, one in-place key otherwise), move or annotate the glibc and NVIDIA todos, annotate the GTK-box todo if the mismatch was cleared, file only the todos the trigger table names, run the gates, and commit</name>
  <files>LEDGER, HUAT, LIVEGATE (every branch except NOT_SCORED), GLIBCTODO and NVTODO (annotated on non-PASS; git mv to .planning/todos/completed/ on PASS), GTKTODO (append-only, conditional), .planning/ROADMAP.md (PASS only), src/backend/__tests__/releaseWorkflow.test.ts (PASS only), .planning/todos/pending/2026-09-30-*.md (conditional, per the trigger table)</files>
  <precondition>E/verdict.txt has VERDICT and CAUSE_CLASS lines; E/baseline.env holds OPEN0/DIS0/RET0/OPEN_IDS0/AUDIT_TOTAL0/PRE_EDIT_SHA.</precondition>
  <action>
D is 2026-09-30; it must equal SESSION_DATE. If it does not, use SESSION_DATE everywhere below, including the ledger key name (`sitting_12_<SESSION_DATE with _>`), and report the deviation. **MUTABLE-SCOPE AUTHORITY:** every edit location comes from a `grep -n` at execute time, never from the planning-time line numbers above. Edit existing files only with scoped replacements (the Edit tool, or a scratchpad Python script that asserts each old string occurs exactly once); never Write a whole existing file.

**LEDGER, PASS branch.**
- Cut the whole `38-W05` entry out of `human_verification` (from `  - id: "38-W05"` through its `prior_state:` line, plus one blank separator) and append it as the LAST entry of `human_verification_discharged`, directly before the closing `---`.
- Insert `result:` directly after `id:`; keep every other key verbatim, including `sitting_11_2026_09_30` and `sitting_10_2026_09_29` (the house discharge shape: `result:` second, older sitting keys kept further down). `result:` IS the sitting-12 record; no separate sitting-12 key is added.
- `result:` is ONE single-quoted YAML scalar with every internal `'` doubled. It opens `PASS -- sitting 12, D, LINUX (the seventh Linux sitting).` and states, in order: the host and its GPU state at launch (versions matched, flavour, kernel, the reboot that cleared sitting 11's mismatch); the artifact (download name, size, sha256, draft release `v0.7.0` asset, run `36556473399`, tag `v0.7.0-glibc-test1`, commit under gate `b48e8948f` at COMMITS_BEHIND commits behind HEAD, ubuntu-22.04 leg per quick `260929-vyi`); the provenance bound (minisign NOT verified, hash-pinned, NOT_PROVEN items in brief); the direct launch with NO workaround (hash-identical executable scratch copy, FUSE self-mount, no install/extraction/env); fake-HOME isolation and why no real-profile arm; the identity proof; time to window; 11/11 samples and t=30; the bundled sidecar; what the screenshots show and USABLE_UI; the census (glibc max, 0 above host, control reproduced, CENSUS_REPRODUCES_S11) and the zero not-found lines; EGL_CONFOUND_LINES=0 and the EGL_WARNING_LINES count; the exit observation and its cold-profile limit; that it supersedes sitting 11's CONFOUNDED (host NVIDIA mismatch, now cleared) and sitting 10's FAIL (glibc, fixed by `260929-vyi`); the claim limit with `38-W04` still open; the evidence path `Q/evidence/`.
- `score:` changes in three places (the old strings built from LIVE OPEN0/DIS0/RET0; each asserted unique):
  - "<OPEN0> relocated items OPEN, <DIS0> discharged" becomes "<OPEN0-1> relocated items OPEN, <DIS0+1> discharged".
  - Before `), <RET0> retired.` insert `; sitting 12, D (LINUX): `38-W05` PASS, closed via quick `260930-aof``.
  - Directly after `<RET0> retired. ` insert: "(Was <OPEN0> until D, when quick `260930-aof` DISCHARGED `38-W05` PASS from sitting 12 -- <one sentence: with the host's NVIDIA kernel-module/userspace mismatch cleared by a reboot, the ubuntu-22.04-built AppImage launched directly on Pop!_OS 22.04 with no workaround, window and bundled sidecar up, 11/11 samples, resolving sitting 11's CONFOUNDED and sitting 10's GLIBC_2.39 FAIL>. Confirmed at the tool: gsd-core audit-uat `by_phase["38"]` moved <OPEN0> -> <OPEN0-1> and total_items <AUDIT_TOTAL0> -> <AUDIT_TOTAL0-1>, which is the check that the array still parses -- a FLAT count after a removal would mean the edit did not register or the array failed to parse.) ". Fill the audit numbers only after LCHK has printed them. Double every `'` (the scalar is single-quoted).

**LEDGER, every other branch.** Add exactly ONE key `sitting_12_2026_09_30:` directly after `id: "38-W05"` (so above `sitting_11_2026_09_30`). Double-quoted scalar with no inner `"`. It opens `<VERDICT> -- sitting 12, D, LINUX (the seventh Linux sitting). ITEM STAYS OPEN:`, then the reason, CAUSE_CLASS, the verbatim CAUSE, the census prediction and control, and the GPU state at launch (and that the mismatch was / was not cleared). On a gpu-* CAUSE_CLASS it also gives DIAG_OUTCOME and says the diagnostic arm is not a discharge. It ends with the evidence path and the claim limit. Nothing else in the frontmatter changes, `score:` included.

**ROADMAP (PASS only).** Directly above the current top Phase 38 `**Items: <n> OPEN as of ...` paragraph (live grep), insert: "**Items: <OPEN0-1> OPEN as of D (sitting 12), plus <DIS0+1> DISCHARGED and <RET0> RETIRED** (quick `260930-aof`). Phase 38 held its SEVENTH LINUX SITTING: `38-W05` ..." — one or two sentences plus the claim limit, pointing to HUAT's `## Sitting 12`. Mark the previous top paragraph "(historical, superseded by the sitting-12 count above)" right after its bold count, as earlier sittings did. On every other branch ROADMAP is not touched.

**HUAT (every branch).**
- After the last `sessions:` entry append `  - "Sitting 12 -- D, Linux (Pop!_OS 22.04, X11), CI-produced AppImage from release-tauri.yml run 36556473399 (`b48e8948f`, ubuntu-22.04 build), signature not verified, NVIDIA driver/library <matched|mismatched> at launch -- 38-W05 <VERDICT> (<short parenthetical>)<, item stays OPEN unless PASS>"` (double-quoted; no inner `"`).
- Ensure `updated: D` (leave it if it already reads D).
- In the `## Current Test` bracket paragraph, just before its closing `]` (the line ending `see the "## Sitting 11" section below.]` at planning time), add: " Sitting 12, the seventh Linux sitting, re-ran it with the host's NVIDIA mismatch <cleared|still present> and scored it <VERDICT> (<short parenthetical>), so the ledger <now|still> holds <n> open, <n> discharged and <n> retired items; see the "## Sitting 12" section below."
- Append at EOF `## Sitting 12 — D, Linux (Pop!_OS 22.04, X11), CI AppImage from run `36556473399` at `b48e8948f``: about 30-60 lines on PASS (shorter otherwise), in the Sitting 11 voice, bold lead-in paragraphs: the opening statement; **Artifact and provenance** (PROVEN and NOT PROVEN; same bytes as sitting 11); **What changed since sitting 11** (the GPU delta: reboot, kernel, module version and flavour, mismatch measured absent or present); **Conditions** (fake HOME and no real-profile arm; lock and inhibitor; FUSE and NoNewPrivs; the pre-registered GPU rules; the census prediction, GPU_PREDICTION and the negative control); **Identity**; **Survival** (a compact 11-sample table is fine) plus t=30; **Sidecar and usable UI**; **Exit observation, secondary and not scored**; **Result and honest limits**; an **Artifacts** line.
- The new section must contain no level-3 heading and no line starting with the UAT item keys (expected or result followed by a colon), or audit-uat counts phantom items.

**LIVEGATE (every branch except NOT_SCORED).** Directly after the sitting-11 `**UPDATE 2026-09-30 (quick `260930-9l9`, Phase 38 sitting 11).**` paragraph, and so before `## Three log sinks`, add a paragraph beginning "**UPDATE D (quick `260930-aof`, Phase 38 sitting 12).**": the artifact (same as sitting 11: run `36556473399`, `b48e8948f`, ubuntu-22.04 build, signature not verified), the GPU change, and the outcome (DISCHARGED PASS on one host, or the verdict and cause). Say it supersedes the paragraph above as to current state and that `38-W04` remains open. Wrap at about 100 columns like the surrounding text.

**GLIBCTODO.**
- PASS: `git mv` it to `.planning/todos/completed/` (same basename). At the new path add `status: RESOLVED` and `resolved: D` directly after `ready:`. Append `## Closed D (quick 260930-aof, Phase 38 sitting 12)` answering UNVERIFIED items 1-3 with measured facts (the run executed on 22.04 per the operator's account; census glibc max and 0 above host, reproduced; the launch PASSed with 0 not-found lines and no workaround); items 4-7 stated as still open where they are (a glibc 2.39+ host; the cold-cache 60-minute bound; the ubuntu-22.04 image deprecation; helper-binary glibc floors). Then in `src/backend/__tests__/releaseWorkflow.test.ts` change ONLY the one comment line that names the todo (live grep; line 1691 at planning time) from `.planning/todos/pending/` to `.planning/todos/completed/`. No other character in that file changes.
- Every other branch: leave it in pending/, frontmatter unchanged; append `## Sitting 12 re-run D (quick 260930-aof)`: census facts (reproduced or not), GLIBC_NOT_FOUND_LINES from the scored run, whether its own cause is still measured as cleared, the verdict and CAUSE_CLASS, which todo now carries the blocking cause, and that closure waits on a 38-W05 PASS.

**NVTODO.**
- PASS: `git mv` it to `.planning/todos/completed/` (same basename). Add `status: RESOLVED` and `resolved: D` directly after `ready:`. Append `## Closed D (quick 260930-aof, Phase 38 sitting 12)`: the mismatch was fixed by the operator's reboot (measured: module <NVRM_VERSION> <NVRM_FLAVOUR> = userspace <NVML_LIB>, `nvidia-smi` runs, kernel <KERNEL>, boot <BOOT_TIME>); the sitting-12 scored re-run, with NO workaround, PASSed; its "What is not known" first item (launch without a workaround on a healthy stack) is now answered for this host; the EGL_WARNING_LINES count; and that GTKTODO's spike-029 re-run is a separate, still-pending action.
- Every other branch: leave it in pending/, frontmatter unchanged; append `## Sitting 12 re-run D (quick 260930-aof)` with the GPU measurements at launch, whether the mismatch is cleared, the verdict and CAUSE_CLASS, the DIAG_OUTCOME if any, and which todo now carries the blocking cause (itself on CONFOUNDED; the new gpu-stack todo on CAUSE_CLASS=gpu-stack-non-mismatch).

**GTKTODO (append-only; never closed, frontmatter never changed).** Only if a launch was made AND `NVIDIA_MISMATCH_AT_LAUNCH=no`: append `## Addendum (D, quick 260930-aof): the NVIDIA mismatch prerequisite is measured cleared`: the versions now match (values), so the operator prerequisite named in the spike-029 addendum is met; the spike-029 `run-variants.sh 10 plain reparent` re-run with `WEBKIT_DISABLE_DMABUF_RENDERER` unset was NOT performed here and is still the next action; `ready:` is left for triage; plus one line on what sitting 12 observed of the packaged app's GPU path (PASS without the workaround, or the gpu-stack FAIL with a pointer to its new todo). If the mismatch was present, do not touch GTKTODO.

**Todo trigger table.** File each only when its trigger fires, under `.planning/todos/pending/`, named `D-<slug>.md`. Frontmatter in this order: `created: D`; `title:` (single-quoted); `area: release`; `severity`; `platform`; `ready`; `source: quick-260930-aof`; `files:` (list). Values bare lowercase. The body: what was observed (verbatim stream lines, timings, census numbers, GPU state), what is not known, evidence paths. No stray XML-like closing tags.

| Trigger | Action | severity | platform | ready |
|---------|--------|----------|----------|-------|
| VERDICT=FAIL and CAUSE_CLASS=gpu-stack-non-mismatch | new `ci-linux-appimage-gbm-egl-abort-with-matched-nvidia-driver` | major | linux | live-gate |
| VERDICT=FAIL and CAUSE_CLASS=other, or DIAG_OUTCOME=fails-for-other-reason | new `ci-linux-appimage-<cause-slug>` | major | linux | live-gate |
| VERDICT=CONFOUNDED | NO new todo: NVTODO already exists and is annotated above | - | - | - |
| VERDICT=FAIL and CAUSE_CLASS=loader | NO new todo: GLIBCTODO's annotation carries it | - | - | - |
| SIDECAR_ORPHAN=yes in any arm | new `packaged-linux-sidecar-misses-stdin-eof-drain` | major | linux | live-gate |
| New census `FILES_ABOVE_HOST_GLIBC > 0` | new `ci-linux-appimage-bundles-elf-above-glibc-2-35` | major | linux | live-gate |
| `CENSUS_FINDING_ALREADY_FILED=no` | new `ci-linux-appimage-unresolved-needed-libs-beyond-comet` | major | linux | live-gate |
| PASS with `USABLE_UI=no` or `PANIC_LINES > 0` | new `ci-linux-appimage-<symptom-slug>` | major | linux | live-gate |

Row notes:
- The gpu-stack todo's body gives the verbatim EGL lines, EGL_WARNING_LINES, the full GPU baseline (versions, flavour, EGL platforms, GBM backends), the census `BUNDLED_GPU_LIB` lines (does the artifact ship its own EGL/GBM stack?), DIAG_OUTCOME, and states what is not known: host-side versus artifact-side, and whether a `tauri dev` build aborts on the same boot (not measured here). It cross-references NVTODO, GTKTODO and the spike-029 README.
- `CENSUS_FINDING_ALREADY_FILED=yes` (the arm64 `comet` loader only) files nothing and leaves NEEDTODO untouched.
- The orphan todo cross-references CLAUDE.md's exit contract and the cold-profile limit; a slow but finite exit is only recorded, with a cross-reference to `260913-m9c`.
- A PASS with USABLE_UI=no or panic lines still discharges; the todo carries the finding.
- No todo is filed on NOT_SCORED or DIRECT_LAUNCH_UNMET; their reason lives in the ledger key.

**Gates.** `pnpm -s planning-gates` (todo frontmatter gate included); the branch's ledger checks from the verify block; PASS only: `npx prettier --check src/backend/__tests__/releaseWorkflow.test.ts` and `npx jest --selectProjects Backend --testPathPattern 'releaseWorkflow'`.

**Commit.** `git add` explicit paths only: `Q/appimage_smoke.ts`, `Q/evidence/`, LEDGER, HUAT, LIVEGATE and ROADMAP when edited, the test file when edited, GLIBCTODO and NVTODO (old and new paths on PASS; `git mv` stages both), GTKTODO when edited, each new todo. Add `Q/260930-aof-PLAN.md` or the SUMMARY only if your spawn prompt says to. Never add STATE.md, the spike-025 files, or anything under SCR. Compare `git diff --cached --name-only` against that list, then commit in the same invocation. Subject: `docs(quick-260930-aof): Phase 38 sitting 12, seventh Linux sitting -- 38-W05 <VERDICT>`. Body 2-4 lines, ending with the attribution lines your environment's system reminder prescribes (at planning time: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01KaivDepSuewWoVAxibRJBm`). If a path was missed, amend; nothing has been pushed. Do not push. On PASS, afterwards run `graphify update .` (`graphify-out/` is gitignored; nothing to commit).
  </action>
  <verify>
    <automated>cd /home/graysonmitchell/GameLib && Q=.planning/quick/260930-aof-re-run-phase-38-item-38-w05-sitting-12-l && . $Q/evidence/baseline.env && V=$(sed -n 's/^VERDICT=//p' $Q/evidence/verdict.txt) && HU=.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-HUMAN-UAT.md && [ "$(awk '/^## Sitting 12 /{n++} END{print n+0}' $HU)" -eq 1 ] && grep -q '^  - "Sitting 12 -- ' $HU && [ "$(sed -n '/^## Sitting 12 /,$p' $HU | grep -Ec '^(###[[:space:]]|expected[:]|result[:])')" -eq 0 ] && SUBJ=$(git log -1 --format=%s) && echo "$SUBJ" | grep -q "^docs(quick-260930-aof): .*38-W05 $V\$" && NAMES=$(git show --name-only --format= HEAD) && [ "$(printf '%s\n' "$NAMES" | grep -v -E '^$|^(\.planning/quick/260930-aof-re-run-phase-38-item-38-w05-sitting-12-l/|\.planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/38-(VERIFICATION|HUMAN-UAT)\.md$|\.planning/phases/35-electron-cutover-remove-the-electron-build/35-LIVE-GATE\.md$|\.planning/ROADMAP\.md$|\.planning/todos/(pending|completed)/2026-09-(28|29|30)-[a-z0-9-]+\.md$|src/backend/__tests__/releaseWorkflow\.test\.ts$)' | wc -l)" -eq 0 ] && pnpm -s planning-gates</automated>
    PASS branch, in addition:
    - `node .planning/quick/260928-raq-update-phase-38-ledger-38-verification-m/ledger-check.cjs --open $((OPEN0-1)) --discharged $((DIS0+1)) --retired $RET0 --open-ids "$(printf %s "$OPEN_IDS0" | tr , '\n' | grep -vx 38-W05 | paste -sd,)" --discharged-includes 38-W05 --includes 'discharged:38-W05:result=PASS -- sitting 12' --includes 'discharged:38-W05:result=36556473399' --includes 'discharged:38-W05:result=b48e8948f' --includes 'discharged:38-W05:sitting_11_2026_09_30=CONFOUNDED -- sitting 11' --includes 'discharged:38-W05:sitting_10_2026_09_29=FAIL -- sitting 10' --human-uat --no-stale-premise` prints no FAIL line, `audit-uat-by-phase-38` equals OPEN0-1, and `audit-uat-total-items` equals AUDIT_TOTAL0-1.
    - `grep -q 'as of 2026-09-30 (sitting 12), plus' .planning/ROADMAP.md` succeeds, and `grep -n` shows it only in the Phase 38 "Items:" paragraph.
    - `grep -q '260930-aof' .planning/phases/35-electron-cutover-remove-the-electron-build/35-LIVE-GATE.md` succeeds.
    - Both `test -f .planning/todos/completed/2026-09-29-ci-linux-appimage-glibc-2-39-not-launchable-on-glibc-2-35.md` and `test -f .planning/todos/completed/2026-09-30-host-nvidia-driver-library-mismatch-blocks-38-w05-scoring.md` succeed; neither path exists under `pending/`; both completed files carry `status: RESOLVED` and `260930-aof`.
    - `grep -q 'todos/completed/2026-09-29-ci-linux-appimage-glibc' src/backend/__tests__/releaseWorkflow.test.ts` succeeds; `git diff --numstat $PRE_EDIT_SHA -- src/backend/__tests__/releaseWorkflow.test.ts` shows `1	1`; `npx prettier --check src/backend/__tests__/releaseWorkflow.test.ts` passes (`--file-info` reports `"ignored": false`, so this check is real); `npx jest --selectProjects Backend --testPathPattern 'releaseWorkflow'` passes.
    - GTKTODO is still in pending/, contains `260930-aof`, and `git diff $PRE_EDIT_SHA -- <GTKTODO>` shows added lines only (no removed line, frontmatter unchanged).
    Every other branch, in addition:
    - `node .planning/quick/260929-tmw-run-phase-38-item-38-s16-linux-half-live-on/ledger_inplace_check.cjs --rev $PRE_EDIT_SHA --key sitting_12_2026_09_30 --id 38-W05` exits 0.
    - LCHK with `--open $OPEN0 --discharged $DIS0 --retired $RET0 --open-ids "$OPEN_IDS0" --includes "open:38-W05:sitting_12_2026_09_30=$V" --human-uat` prints no FAIL line, audit-uat by_phase 38 still equal to OPEN0.
    - `git diff --quiet $PRE_EDIT_SHA -- .planning/ROADMAP.md src/backend/__tests__/releaseWorkflow.test.ts` exits 0.
    - GLIBCTODO and NVTODO are both still in pending/, both contain `260930-aof`, and `git diff $PRE_EDIT_SHA` on each shows added lines only.
    - GTKTODO contains `260930-aof` if and only if a launch was made with `NVIDIA_MISMATCH_AT_LAUNCH=no`.
    - Each new todo matches exactly one fired trigger row and carries that row's bare severity/platform/ready; on CONFOUNDED or a loader FAIL no new todo exists; on CAUSE_CLASS=gpu-stack-non-mismatch exactly one `*gbm-egl-abort-with-matched-nvidia-driver*` todo exists.
    Formatter: LEDGER, HUAT, LIVEGATE, ROADMAP and every todo sit under `.planning/`, which prettier ignores (`--file-info` reports `"ignored": true`), so `prettier --check` there is vacuous and is omitted; wrap, key order and quoting are matched by hand to the surrounding corpus. The only prettier-visible path is `src/backend/__tests__/releaseWorkflow.test.ts` (PASS only), and it is checked above.
  </verify>
  <done>The ledger reflects the verdict. On PASS, 38-W05 was moved with a `result:` key, both older sitting keys kept, counts at -1/+1, and ledger-check plus audit-uat agree; ROADMAP, LIVEGATE and HUAT carry sitting 12; the glibc and NVIDIA todos are in completed/ with closing sections; the one test comment points at the new path with prettier and the releaseWorkflow jest suite green; GTKTODO carries an append-only addendum. On any other branch there is exactly one `sitting_12_2026_09_30` key directly after `id`, nothing else moved, and both todos are annotated in place. Todos match the trigger table exactly (no duplicate NVIDIA or comet todo). `pnpm planning-gates` is green. There is one commit with the prescribed subject, the file allowlist and the attribution lines, and it is not pushed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| GitHub draft release to this host | A binary saved by the operator's browser; signature not verified, only its hash pinned |
| AppImage process to the operator's home | The artifact runs as the operator and would write real config and session stores unless isolated |
| Host GPU driver to the verdict | A broken or changed NVIDIA stack can make any WebKitGTK app abort, which could be mis-scored as an artifact defect (or a host defect mis-scored as a confound) |
| Harness captures to the git repo | Raw app streams and paths could be committed to a public fork |
| Planning YAML to gsd-core audit-uat | One malformed scalar silently drops Phase 38 from the audit |
| The operator's Downloads directory | The pinned evidence; mutating it would destroy the record |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-aof-01 | Tampering | the downloaded AppImage | high | mitigate | sha256 and size re-hashed and pinned before staging and re-checked on the copy; PROVEN_7 ties it to sitting 11's recorded hash; magic checks from the unedited `appimage_provenance.cjs`; any mismatch means no launch and NOT_SCORED. Minisign NOT verified: an explicit NOT_PROVEN line, accepted by the orchestrator. |
| T-aof-02 | Information disclosure | a real-HOME run or a cross-version write into `~/.config/gamelib` | high | mitigate | Every execution (matchers, census, control, scored, diag) runs under a fresh `createFakeHomeProfile()` via `childEnv()` with prefix `gl-w05s12-`, disposed in `finally`, DISPOSED asserted; post-run `-newer` leak check over `~/.config`, `~/.local/share`, `~/.cache`. |
| T-aof-03 | Information disclosure | raw stdout/stderr | medium | mitigate | Raw streams go to SCR via `registerCapture()` and are shredded at dispose; only redacted excerpts and at most 5 redacted STREAM_MATCH lines per class are committed; the staged copy and synthetic file are deleted; no binary is committed. |
| T-aof-04 | Denial of service | orphaned shell, sidecar, FUSE server or mount | medium | mitigate | Signals by pid or pgid only, never by name, never `pgrep -f`/`pkill -f`; the inherited shell-first bounded teardown; NO_ORPHANS, MOUNT_GONE and POST_TEARDOWN_WINDOWS=0 recorded, and the verify re-runs `pgrep -g` per positive recorded group. |
| T-aof-05 | Repudiation | a verdict mis-attributed to the host GPU or to an env workaround | high | mitigate | The four-step precedence (loader, gpu-mismatch CONFOUNDED, gpu-stack-non-mismatch FAIL, other) and its evidence (NVIDIA_MISMATCH_AT_LAUNCH re-measured just before launch, EGL lines from the SCORED streams) are pre-registered in Task 2; the harness refuses `--env` without `--tag diag`; the scored run must show `EXTRA_ENV=(none)`; the diag arm is `SCORED=no` and cannot change VERDICT; PREDICTION and GPU_PREDICTION are timestamped before launch; the confound matcher is proven on sitting 11's real abort line. |
| T-aof-06 | Repudiation | ledger and UAT records | medium | mitigate | `ledger-check.cjs` asserts counts, ids and audit-uat by_phase from LIVE baselines; `ledger_inplace_check.cjs` proves a one-key in-place edit; a region-scoped check keeps HUAT free of phantom items; todo edits are append-only on non-PASS; the commit file list is allowlisted. |
| T-aof-07 | Tampering | `~/Downloads` evidence files | medium | mitigate | NEWDL is copied, never chmod'd or renamed; mode and mtime recorded before and after and must match; OLDDL is only read for census extraction. |
| T-aof-08 | Tampering | host GPU driver state | low | accept | The plan observes the driver and never alters it (no sudo, no module or package changes); the only residual risk is that the state changes between Step 0's re-measure and the launch, which is seconds. |
| T-aof-09 | Elevation of privilege | executing a non-code-signed binary | low | accept | It is the project's own CI output, hash-pinned, running unprivileged as the operator inside a fake profile; the residual risk is the one the item exists to exercise. |
</threat_model>

<verification>
- Task 1: baseline.env sources and carries the full GPU state plus live ledger values and the sitting-11 premise; NEWDL unmodified and STAGED hash-identical; provenance.txt has PROVENANCE_OK=operator-accepted with PROVEN_1..7 and NOT_PROVEN_1..5; the harness copy has S1-S4 on unchanged C1-C13 and the sitting-11 source is untouched; the four matcher self-tests hit their values (47; 1; 2/0; 1/1/1/0); census PREDICTION, BUNDLED_GPU_LIBS, CENSUS_REPRODUCES_S11 and CONTROL_VERDICT are written; PREDICTION, PREDICTION_READING, CENSUS_FINDING_ALREADY_FILED and GPU_PREDICTION are timestamped before any launch.
- Task 2: exactly one valid scored run (SCORED=yes, EXTRA_ENV=(none)); identity by pid, FUSE mount and pgid; 11 samples plus t=30; screenshots viewed; VERDICT and CAUSE_CLASS derived by the pre-registered precedence; a diag arm iff CAUSE_CLASS is gpu-*, never scored; NO_ORPHANS=yes, POST_TEARDOWN_WINDOWS=0; inhibitor, profile and staged copy gone.
- Task 3: records match VERDICT. PASS: ledger-check and audit-uat show open -1 / discharged +1; glibc and NVIDIA todos completed; the test comment follows the glibc todo; GTKTODO annotated append-only. Otherwise: INPL proves a single-key annotation, ROADMAP and the test file unchanged, both todos annotated in place. Todos match the trigger table (no duplicates). `pnpm planning-gates` green. A single allowlisted commit, not pushed.
</verification>

<success_criteria>
- `38-W05` has a recorded verdict (PASS, FAIL with CAUSE_CLASS, CONFOUNDED, DIRECT_LAUNCH_UNMET or NOT_SCORED) resting on measured evidence, with artifact identity, provenance bound, the re-measured GPU state and the host-only claim all stated.
- On PASS: Phase 38 holds one fewer open item than the live baseline, audit-uat agrees, the glibc and NVIDIA-mismatch todos are closed in completed/ with no dangling source path, and GTKTODO records that its prerequisite is met.
- On FAIL(gpu-stack-non-mismatch): exactly one new `major`/`linux`/`live-gate` todo names the recurring EGL/GBM abort on a matched driver, with the census's bundled-GPU-library facts and the diag outcome. On CONFOUNDED: no new todo; NVTODO carries the annotation.
- No process, mount, inhibitor, fake profile or staged copy survives the sitting. `~/Downloads`, the GPU driver state and the real profile were not written.
</success_criteria>

<output>
Create `.planning/quick/260930-aof-re-run-phase-38-item-38-w05-sitting-12-l/260930-aof-SUMMARY.md` when done, short, in the style of `PREVQ/260930-9l9-SUMMARY.md`: the VERDICT and CAUSE_CLASS; artifact identity and provenance bound; the GPU state, its delta from sitting 11, and how the rules applied; the census prediction, GPU_PREDICTION and control against the observation; identity, survival, sidecar and usable-UI evidence; the exit observation and its limit; ledger counts before and after; the glibc, NVIDIA and GTK-box todo dispositions; todos filed; deviations; the commit SHA.

Follow-up line: on PASS, the `release-tauri.yml` header's "UNPROVEN LIVE: no run has executed on ubuntu-22.04" paragraph is now stale; it is deliberately not edited here because the workflow is out of this sitting's scope.

The orchestrator commits the PLAN and SUMMARY alongside STATE.md unless it told you otherwise.
</output>
