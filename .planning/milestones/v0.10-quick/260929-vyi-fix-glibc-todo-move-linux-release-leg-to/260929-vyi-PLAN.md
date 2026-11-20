---
phase: quick-260929-vyi
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .github/workflows/release-tauri.yml
  - src/backend/__tests__/releaseWorkflow.test.ts
  - .planning/quick/260929-vyi-fix-glibc-todo-move-linux-release-leg-to/evidence/jammy-apt-census.txt
  - .planning/quick/260929-vyi-fix-glibc-todo-move-linux-release-leg-to/evidence/negative-control.txt
  - .planning/todos/pending/2026-09-29-ci-linux-appimage-glibc-2-39-not-launchable-on-glibc-2-35.md
autonomous: true
requirements:
  - QUICK-260929-VYI
estimate:
  tokens: 90000
  raw_tokens: 90000
  tasks: 3
  confidence: low
must_haves:
  truths:
    - "release-tauri.yml has exactly one Linux matrix leg (the x86_64-unknown-linux-gnu sidecar triple) and it runs on ubuntu-22.04 (glibc 2.35). That is the configuration that makes the AppImage's glibc floor 2.35 by construction; whether a built artifact actually meets it stays UNVERIFIED until a CI run produces one"
    - "The 'Install Ubuntu system dependencies' step's if: names exactly the Linux leg's platform string, and its apt package list is exactly the set recorded as present in the real Ubuntu jammy archive indexes (not merely installed on this host)"
    - "swatinem/rust-cache is keyed on matrix.platform, so a Cargo target/ compiled on another runner image (the old ubuntu-24.04 base, glibc 2.39) cannot be prefix-restored into the ubuntu-22.04 leg through the action's default Linux-x64 key"
    - "releaseWorkflow.test.ts pins all three facts from the PARSED workflow, so header comment prose can neither satisfy nor break them. Each of the four new tests has a recorded arm in which it FAILS (Arm A pre-edit workflow, Arm B guard-only half-edit, Arm C apt-list drift), and the scoped Backend+Meta run is green with a non-zero, file-scoped count"
    - "The todo is updated IN PLACE with a dated 'Change made 2026-09-29 (quick 260929-vyi)' section carrying a plain UNVERIFIED list; its severity/platform/ready values are unchanged and pnpm planning-gates exits 0; 38-VERIFICATION.md and STATE.md are untouched by this plan; nothing is pushed, tagged or dispatched"
  artifacts:
    - path: ".github/workflows/release-tauri.yml"
      provides: "Linux matrix leg on ubuntu-22.04; apt guard on the same string; rust-cache keyed on matrix.platform; a dated 260929-vyi header entry stating why and what is unproven live"
      contains: "key: ${{ matrix.platform }}"
    - path: "src/backend/__tests__/releaseWorkflow.test.ts"
      provides: "Parsed-YAML 'Linux build base' describe block (four tests) replacing the raw-text 'includes an ubuntu runner (24.04 or latest)' regex test"
      contains: "LINUX_BUILD_BASE"
    - path: ".planning/quick/260929-vyi-fix-glibc-todo-move-linux-release-leg-to/evidence/jammy-apt-census.txt"
      provides: "Per-package presence in the six jammy archive indexes (suite/component/version), the installed version on this host, FOUND/MISSING, and the apt-cache-policy premise correction"
    - path: ".planning/quick/260929-vyi-fix-glibc-todo-move-linux-release-leg-to/evidence/negative-control.txt"
      provides: "Arms A/B/C: variant, diff numstat, the exact failing test names, Tests: line, exit code, restore proof"
    - path: ".planning/todos/pending/2026-09-29-ci-linux-appimage-glibc-2-39-not-launchable-on-glibc-2-35.md"
      provides: "Appended dated change section with the UNVERIFIED list; frontmatter values unchanged"
  key_links:
    - from: "release-tauri.yml strategy.matrix.include (Linux leg platform)"
      to: "release-tauri.yml step 'Install Ubuntu system dependencies' if:"
      via: "string equality — tauri-action's own README: 'This must match the platform value defined above'; a half-edit silently skips the apt step"
      pattern: "matrix.platform == 'ubuntu-22.04'"
    - from: "release-tauri.yml matrix.platform"
      to: "swatinem/rust-cache@v2 with.key"
      via: "cache key component; the action's default key is os.type()-os.arch() (Linux-x64) plus a rustc/env/lockfile hash with a PREFIX restore key, which cannot tell ubuntu-22.04 from ubuntu-24.04"
      pattern: "key: \\$\\{\\{ matrix.platform \\}\\}"
    - from: "releaseWorkflow.test.ts JAMMY_CENSUSED_APT_PACKAGES"
      to: "evidence/jammy-apt-census.txt"
      via: "the test pins the exact apt list; changing the list turns it red and its doc comment says to re-run the jammy census"
      pattern: "JAMMY_CENSUSED_APT_PACKAGES"
    - from: "releaseWorkflow.test.ts"
      to: ".github/workflows/release-tauri.yml"
      via: "parseReleaseWorkflow() / parseReleaseSteps() (js-yaml load; comments dropped by the parse)"
      pattern: "parseReleaseWorkflow\\(\\)"
---

<objective>
Fix the pending todo `.planning/todos/pending/2026-09-29-ci-linux-appimage-glibc-2-39-not-launchable-on-glibc-2-35.md` by moving the Linux leg of `.github/workflows/release-tauri.yml` from `ubuntu-24.04` (glibc 2.39) to the oldest supported base, `ubuntu-22.04` (glibc 2.35). This is the todo's first candidate, chosen by the orchestrator. Update everything that keys on that platform string, and prove locally everything that can be proven locally.

Purpose: 38-W05 (sitting 10) measured `GLIBC_2.39 not found (required by gamelib-shell)`, plus 45 `GLIBC_2.38` references and 1 `GLIBC_2.36` across 37 bundled libs. The process exited 1 after 65 ms on Pop!_OS 22.04. An AppImage does not bundle glibc, so the build runner's glibc is the floor for every user. Tauri's own AppImage guidance says to build "using the oldest base system you intend to support that also provides Tauri v2's required WebKitGTK 4.1 packages" and names Ubuntu 22.04 as a baseline. tauri-action's README example matrix uses `ubuntu-22.04` too. Both were fetched at planning time.

Output: the workflow edit, a parsed-YAML test block that pins it, two evidence files, and an in-place todo update. There will be two local commits and no push.

Planning-time observations (HEAD `ef5638a7c`, 2026-09-29). They set the authorized scope, and the executor re-checks them in Task 1 step 0:
- The literal grep `ubuntu-24.04|ubuntu-22.04` over `.github src src-tauri meta package.json docs` found 5 hits:
  - `release-tauri.yml:114`, the matrix Linux leg. IN SCOPE.
  - `release-tauri.yml:190`, the apt step guard. IN SCOPE.
  - `promote-updater-feed.yml:47`. LEFT: it builds nothing that ships, since it only promotes `latest.json`.
  - `src/backend/__tests__/tauriConf.test.ts:659`. LEFT: a comment about promote-updater-feed's runner, which stays true because that job does not move.
  - `meta/__tests__/fixtures/upstream-workflows/legendary-0.21.0/build-base.yml:64`. LEFT: a frozen upstream fixture.
- The literal grep is BLIND to one real pin. `src/backend/__tests__/releaseWorkflow.test.ts:99-102` asserts the regex `ubuntu-(24\.04|latest)`, and the escaped dot and the paren defeat any literal pattern. IN SCOPE.
- The apt package list lives in the workflow step at `release-tauri.yml:193`. The composite action `.github/actions/install-deps/action.yml` installs NO apt packages (pnpm, setup-node, node-gyp, `pnpm install`, helper binaries only), so it has no 22.04 branch to change.
- The swatinem/rust-cache key, confirmed from the action's `src/config.ts` at planning time, is `prefix[-key][-job]-${os.type()}-${os.arch()}` plus a hash of `rustc -vV`, CARGO/CC/CFLAGS/CXX/CMAKE/RUST env and the lockfiles. Its restore key is the key minus the lockfile hash, which makes it a prefix match. So a `release`-job cache built on ubuntu-24.04 can restore into the 22.04 leg. That is IN SCOPE as a 22.04 problem discoverable from the repo.
- The SEA sidecar downloads the official nodejs.org Node binary (`meta/buildSidecarSea.ts` ~l.716), so its glibc floor does not depend on the runner.
- Jammy archive census, dry-run at planning time: all 5 packages FOUND in the real Ubuntu indexes.
- PREMISE CORRECTION: on THIS host `apt-cache policy` is NOT a jammy-availability oracle. Every version table lists only `/var/lib/dpkg/status`. `/var/lib/apt/lists/` holds a stale `noble` cache while `/etc/apt/sources.list.d/` points at `jammy`, so "Candidate" is just the installed version. The census therefore reads the real archive indexes.
- Prettier `--file-info` at planning time:
  - `release-tauri.yml` reports `{ "ignored": false, "inferredParser": "yaml" }`.
  - `releaseWorkflow.test.ts` reports `{ "ignored": false, "inferredParser": "typescript" }`.
  - The todo and `.planning/quick/.../evidence/*.txt` report `{ "ignored": true, "inferredParser": null }`.
  - Both code files passed `--check` at HEAD.
- Scoped jest baseline: `npx jest --selectProjects Backend Meta --testPathPattern 'releaseWorkflow|tauriConf|artifactTargets|cleanDist'` reported 4 suites passed, 176 tests passed, and `Ran all test suites matching /releaseWorkflow|tauriConf|artifactTargets|cleanDist/i in 2 projects.` Meta's `artifactTargets.test.ts` also reads this workflow, which is why Meta is selected.
- `actionlint` is not on PATH.
- The dry-run fact, verified by reading the workflow (l.73-101, 154-163): a default `workflow_dispatch` (`dry_run: true`) builds all three legs without a tag or release. It delivers the BUILD LOG, not a binary ("a real tag push is what yields a binary"; uploading is banned by the test file). It is the safe way to prove the 22.04 leg builds. It is NOT a way to get an AppImage for the 38-W05 smoke.

HARD CONSTRAINTS for every task:
- Do NOT push, tag, or run `workflow_dispatch`. A `v*` tag push or a dispatch writes to the SHARED REAL draft release `v0.7.0`, because `tagName: v__VERSION__` resolves from tauri.conf.json.
- Do NOT use `git stash`. Vary the tree while holding the commit constant.
- Do NOT edit `.planning/STATE.md`, 38-VERIFICATION.md, 38-HUMAN-UAT.md or 35-LIVE-GATE.md.
- Do NOT move the todo.
- Never `git add -A`. Never stage `.planning/spikes/025-*` or `.planning/spikes/029-*`.
- Never `--no-verify`.
- Run jest in its OWN Bash call. It is never chained after a command that writes a file under test, because jest reads stale in that case.
- Never add `--passWithNoTests`.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/todos/pending/2026-09-29-ci-linux-appimage-glibc-2-39-not-launchable-on-glibc-2-35.md
@.github/workflows/release-tauri.yml
@.github/actions/install-deps/action.yml

Read by range, not whole:
- `src/backend/__tests__/releaseWorkflow.test.ts`. Read these ranges:
  - 1-110: imports, `loadReleaseWorkflow`, the D-05 matrix describe.
  - 155-190: the raw-text negative assertions.
  - 265-276: the ban on the GitHub-owned upload/cache action slugs.
  - 360-372.
  - 1130-1175: `ParsedReleaseStep`, `ParsedReleaseWorkflow`, `parseReleaseSteps()`, `parseReleaseWorkflow()`.
- `src/backend/__tests__/helpers/workflowSteps.ts` exports, if needed: `stripHashComments`, `extractRunBlock`.
- Evidence of the failure, for citation only (do not modify): `.planning/quick/260929-v1v-run-phase-38-item-38-w05-live-on-linux-s/evidence/` (census.txt, smoke-run.txt, verdict.txt).
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Tracer — jammy census gate, pin the 22.04 build base in the parsed-YAML test (RED), move the leg (GREEN), local proof battery, commit</name>
  <files>.planning/quick/260929-vyi-fix-glibc-todo-move-linux-release-leg-to/evidence/jammy-apt-census.txt, src/backend/__tests__/releaseWorkflow.test.ts, .github/workflows/release-tauri.yml, .planning/quick/260929-vyi-fix-glibc-todo-move-linux-release-leg-to/evidence/negative-control.txt</files>
  <read_first>.github/workflows/release-tauri.yml (header l.1-66, dry_run l.73-101 and 128-164, matrix l.107-120, apt step l.189-193, rust toolchain and cache l.266-273); src/backend/__tests__/releaseWorkflow.test.ts (the ranges named in context); the todo; CLAUDE.md section "A formatter check belongs in every task's verify"</read_first>
  <behavior>
    - Test (a) "exactly one matrix leg targets Linux and it builds on ubuntu-22.04 (glibc 2.35 floor)". Among `jobs.release.strategy.matrix.include`, exactly one entry has the x86_64-unknown-linux-gnu sidecar triple, and its `platform` equals `LINUX_BUILD_BASE` (`'ubuntu-22.04'`). Exactly one entry has a platform starting with `ubuntu-`. FAILS on the pre-edit workflow and PASSES after.
    - Test (b) "the Ubuntu system-dependency step is guarded on exactly the Linux leg's platform". The step named `Install Ubuntu system dependencies` has an `if` equal to the string `matrix.platform == '<platform>'`, where `<platform>` is read from the PARSED Linux leg and not from the constant, so the coupling is tested independently of (a). PASSES before and after, because both states are coherent. Its red arm is Task 2 Arm B.
    - Test (c) "the Ubuntu system-dependency step installs exactly the jammy-censused package set". Take the tokens after `-y` on that step's `apt-get install` line, sort them, and compare them to the sorted `JAMMY_CENSUSED_APT_PACKAGES`. PASSES before and after. Its red arm is Task 2 Arm C.
    - Test (d) "swatinem/rust-cache is keyed on matrix.platform". The step whose `uses` starts with `swatinem/rust-cache@` has `with.key` equal to the literal expression string `${{ matrix.platform }}`, and `with.workspaces` is still `./src-tauri -> target`. FAILS on the pre-edit workflow (no key) and PASSES after.
  </behavior>
  <action>
Step 0, scope re-grep (mutable-scope authority). Re-run the three planning-time greps and compare them with the objective's list:
- (i) `grep -rn "ubuntu-24.04\|ubuntu-22.04" .github src src-tauri meta package.json docs`, excluding node_modules, src-tauri/target and graphify-out.
- (ii) `grep -rn "ubuntu-(" --include="*.test.*" src meta`, for regex-shaped pins the literal grep cannot see.
- (iii) `grep -rln "release-tauri" --include="*.test.*" src meta`, for every suite that reads the workflow.
A NEW hit that pins the release-tauri Linux leg is in scope. Add it, and record it in the SUMMARY. Any other new hit is recorded, not edited.

Step 1, census gate, BEFORE any edit.
- Extract the apt package list from the workflow itself, not from this plan. Run `node -e` from the repo root with js-yaml, which is already a devDependency. Parse `.github/workflows/release-tauri.yml`, take the `run` of the step named `Install Ubuntu system dependencies`, and take the tokens after `-y` on its `apt-get install` line. At planning time these were libwebkit2gtk-4.1-dev, libayatana-appindicator3-dev, librsvg2-dev, patchelf and xdg-utils.
- Download the six Ubuntu indexes into your session scratchpad, never /tmp and never the repo. The URLs are `http://archive.ubuntu.com/ubuntu/dists/<suite>/<component>/binary-amd64/Packages.xz`, for suite in {jammy, jammy-updates, jammy-security} and component in {main, universe}. They total about 25 MB. Decompress them with `xz -dc`.
- This census is read-only: no sudo, no `apt-get update`, nothing installed.
- For each package, list every suite/component that contains an exact `Package: <name>` stanza, with its `Version:`.
- Also record the version installed on this host with `dpkg-query -W -f='${Version}'`, as a secondary column only.
- Write `evidence/jammy-apt-census.txt` (in this quick dir) with:
  - the date;
  - the host, as `lsb_release -d` and the first line of `ldd --version` only (no HOME, no env);
  - each index URL with its decompressed byte size and sha256;
  - a table: package | jammy archive hits (suite-component=version) | installed here | FOUND/MISSING;
  - the premise correction, backed by one verbatim `apt-cache policy libwebkit2gtk-4.1-dev` output: the only version-table source is `/var/lib/dpkg/status`, `/var/lib/apt/lists` holds a noble cache, and the sources point at jammy, so Candidate here equals installed;
  - one line noting that the GitHub runner installs from Ubuntu's archive mirror, not from `apt.pop-os.org`.

  The planning-time dry run found all five FOUND:
  - libwebkit2gtk-4.1-dev: jammy-updates/universe and jammy-security/universe at 2.50.4-0ubuntu0.22.04.1
  - libayatana-appindicator3-dev: jammy/main
  - librsvg2-dev: jammy-updates/main
  - patchelf: jammy/universe
  - xdg-utils: jammy-updates/main
- STOP RULE. If ANY package is MISSING from all six indexes, write the evidence file, make NO workflow or test edit, and return a blocker naming the package. Do not guess a substitute name. If the archive is unreachable, also stop. An installed-only census is not proof, and this gate must not be downgraded to one.

Step 2, RED. Edit only `src/backend/__tests__/releaseWorkflow.test.ts`:
- Delete the test `includes an ubuntu runner (24.04 or latest)` (~l.99-102). Its regex runs against RAW source, including comments, so the new header entry that names the old runner as history would satisfy it vacuously. This is the WR-04 reason the file already has `loadStrippedWorkflow()`.
- Retitle the D-05 matrix describe (~l.93) so it no longer claims to cover the Ubuntu leg, and point it at the new block.
- Extend the job record type inside `ParsedReleaseWorkflow` (~l.1154) with an optional `strategy` field carrying `matrix.include` as an array of a new exported-nowhere interface `ReleaseMatrixLeg`, with optional string fields `platform`, `args` and `sidecar_triple`.
- Add three constants:
  - `LINUX_BUILD_BASE`, set to `ubuntu-22.04`;
  - `LINUX_SIDECAR_TRIPLE`, set to `x86_64-unknown-linux-gnu`;
  - `JAMMY_CENSUSED_APT_PACKAGES`, the Step 1 list exactly.

  Give them a doc comment citing:
  - the todo, 38-W05 sitting 10, and the GLIBC_2.39 line;
  - Tauri's oldest-base guidance;
  - the census evidence path;
  - the instruction that changing the apt list means re-running the jammy census and updating the evidence.
- Add a describe block titled `release-tauri.yml Linux build base (glibc floor -- quick 260929-vyi / 38-W05)`. Place it anywhere after the `parseReleaseWorkflow()` definition (~l.1171); the end of the file is fine. It holds tests (a) to (d) exactly as specified in behavior.
- Every assertion reads `parseReleaseWorkflow()` or `parseReleaseSteps()`, never raw text.
- Test (b) builds its expected `if:` string with a template literal from the parsed leg.

Then, as its OWN Bash call, run the suite with its output redirected to a scratchpad file and the exit code echoed, not piped (a pipe reports tail's exit code): `npx jest --selectProjects Backend --testPathPattern 'releaseWorkflow'`.
- Required: exit 1, `Ran all test suites matching /releaseWorkflow/i`, and EXACTLY two failures, (a) and (d).
- Any other failure means the test is wrong. Stop and fix it before going on.
- Record the result in `evidence/negative-control.txt` under a heading `Arm A — pre-edit workflow (HEAD <short sha>, test file edited, workflow untouched)`, with the bullet (`●`) failure headers verbatim, the `Tests:` line, and the exit code.

Step 3, GREEN. Edit `.github/workflows/release-tauri.yml`:
- (i) Set the Linux matrix leg's platform to `ubuntu-22.04` (~l.114), with a one-line comment above the entry pointing at the new header entry.
- (ii) Set the apt step's guard to `if: matrix.platform == 'ubuntu-22.04'` (~l.190), with a one-line comment that it must equal the Linux leg's platform exactly and is pinned by releaseWorkflow.test.ts. Leave the package list unchanged.
- (iii) Add `key: ${{ matrix.platform }}` under the `swatinem/rust-cache@v2` step's `with:`, next to `workspaces` (~l.271-273).
- (iv) Append a dated header entry at the END of the leading comment block, immediately before `name: Release Tauri`. Match the header's existing voice, `#` prefix and wrap. It starts `2026-09-29 (quick task 260929-vyi):` and states:
  - WHY: 38-W05 sitting 10 on Pop!_OS 22.04 (glibc 2.35), the GLIBC_2.39 failure of the 0.7.0 AppImage from run 35942560790, the fact that an AppImage does not bundle glibc, and so the runner's glibc is every user's floor.
  - Tauri's oldest-base guidance naming Ubuntu 22.04.
  - The census evidence path, and that the apt list is unchanged and was verified present in the jammy archive.
  - The rust-cache key rationale: the default key cannot tell 22.04 from 24.04 and restores by prefix. The consequence is that the first run after this change is a cold Rust cache on all three legs, which ties into the existing cold-cache sentence.
  - That the 4m53s Linux figure above was measured on the old ubuntu-24.04 base and has not been re-measured on 22.04.
  - An UNPROVEN LIVE statement in the header's own style: no run has executed on ubuntu-22.04. A default workflow_dispatch dry run proves the leg installs, compiles and bundles (log only, no binary; see the dry_run comment). Only a real tag push yields an AppImage.
  - That GitHub's ubuntu-22.04 hosted image is on a deprecation path, with no date asserted. When it retires the floor must be re-decided, because a newer runner raises it again.

LITERAL DISCIPLINE for all new comment prose. releaseWorkflow.test.ts makes negative and count assertions against the RAW workflow text (~l.159, ~l.181, ~l.269, ~l.274-275, ~l.368-369). They cover: a banned upstream product name, the exact count of the sidecar-triple matrix key spelled with its colon, a banned "in-memory" phrase, the two GitHub-owned artifact-upload and cache action slugs, and the retired Intel target. In prose:
- Refer to the cache only as `swatinem/rust-cache` and never write GitHub's own cache-action slug.
- Never quote a matrix entry line verbatim.
- Refer to "the Linux leg's sidecar triple" rather than writing the key with its colon.
Step 4's full-suite run is the check.

Then, as its OWN call, run the scoped releaseWorkflow suite: exit 0, all pass.

Step 4, local proof battery. Each check is its own call, and each exit code is read unpiped:
- (1) `npx jest --selectProjects Backend Meta --testPathPattern 'releaseWorkflow|tauriConf|artifactTargets|cleanDist'`.
  - Require 4 suites passed and a trailing line reading `Ran all test suites matching /releaseWorkflow|tauriConf|artifactTargets|cleanDist/i in 2 projects.`.
  - Require Tests = 176 - 1 + (new tests), which is 179 if written as four tests. Record the measured number.
- (2) A structural YAML check with `node -e` from the repo root, using js-yaml. Parse the workflow and assert:
  - `include.length === 3`;
  - exactly one `ubuntu-` platform, and it is `ubuntu-22.04`;
  - the apt step `if` equals `matrix.platform == 'ubuntu-22.04'`;
  - the rust-cache `with.key` equals `${{ matrix.platform }}`;
  - no `ubuntu-24\.04` match in `JSON.stringify(parsed)`. Comments are dropped by the parse, so header history cannot trip it.

  Print OK or exit 1.
- (3) `command -v actionlint`. It is absent at planning time. If absent, record "actionlint not run (not on PATH)". Do not install it.
- (4) Run `npx prettier --file-info` on each of the two code paths. Both must report `"ignored": false`; match that with a space-tolerant pattern such as `grep -Eq '"ignored":[[:space:]]*false'`. Then run `npx prettier --check .github/workflows/release-tauri.yml src/backend/__tests__/releaseWorkflow.test.ts`.
  - If the check fails, run `npx prettier --write` on exactly those two paths and re-check. Both were clean at HEAD, so `--write` touches only this task's lines.
  - The two evidence files report `"ignored": true`, so they get NO `--check`, which would be vacuous. Say so in the SUMMARY.
- (5) `pnpm codecheck`, exit 0.
- (6) `pnpm lint:tests`, exit 0, with both ceilings PASS reported.

Step 5, commit, in ONE Bash invocation.
- First write the message with the Write tool to your scratchpad.
- Subject: `fix(quick-260929-vyi): build the Linux release leg on ubuntu-22.04 so the AppImage glibc floor is 2.35`. Quick tasks here use `<type>(quick-<id>)`, e.g. `feat(quick-260924-rbx)` on this same file, and `fix(ci)` has zero prior uses.
- Add a short body naming the three workflow edits and the four tests.
- End with exactly these two lines:
  - `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
  - `Claude-Session: https://claude.ai/code/session_011j1ehkk1k7rgMQtopnFez4`
- The invocation: `git add .github/workflows/release-tauri.yml src/backend/__tests__/releaseWorkflow.test.ts`, then a test that the space-joined sorted `git diff --cached --name-only` equals exactly those two paths, then `git commit -F <msgfile>`, all joined by `&&`.
- The evidence files are NOT in this commit; Task 3 commits them.
- `.husky/pre-commit` checks prettier on staged content. If it rejects, fix the formatting and re-run the same single invocation.
- Afterwards run `graphify update .`. `graphify-out/` is gitignored, so there is nothing to commit.
  </action>
  <verify>
    <automated>cd /home/graysonmitchell/GameLib && npx jest --selectProjects Backend Meta --testPathPattern 'releaseWorkflow|tauriConf|artifactTargets|cleanDist' && npx prettier --check .github/workflows/release-tauri.yml src/backend/__tests__/releaseWorkflow.test.ts && pnpm codecheck && git show --name-only --format=%s HEAD</automated>
  </verify>
  <done>
    - The census file shows 5/5 FOUND in the jammy archive indexes, with the premise correction recorded.
    - Arm A is recorded with exactly (a) and (d) failing against the pre-edit workflow.
    - The workflow has the Linux leg, apt guard and rust-cache key edits, plus the dated header entry, and no banned literal is introduced.
    - The scoped Backend+Meta run is 4 suites green, the file-scoped trailing line is present, and the test count is measured (179 expected).
    - The structural node check prints OK. Prettier `--file-info` shows ignored:false on both code paths and `--check` passes. codecheck and lint:tests exit 0.
    - HEAD is the `fix(quick-260929-vyi)` commit touching exactly the two code paths. Nothing is pushed.
  </done>
</task>

<task type="auto">
  <name>Task 2: Negative controls for the two tests that pass on both sides — guard-only half-edit (Arm B) and apt-list drift (Arm C) — against the committed tree, restore proven clean</name>
  <files>.planning/quick/260929-vyi-fix-glibc-todo-move-linux-release-leg-to/evidence/negative-control.txt (appended). .github/workflows/release-tauri.yml is modified TRANSIENTLY and must end byte-identical to HEAD.</files>
  <read_first>.planning/quick/260929-vyi-fix-glibc-todo-move-linux-release-leg-to/evidence/negative-control.txt (Arm A from Task 1)</read_first>
  <action>
Precondition: `git diff --quiet -- .github/workflows/release-tauri.yml` exits 0, and HEAD is Task 1's commit.

Do NOT use `git stash`, because it strands concurrent sessions. Hold the commit constant and vary only the working tree.

Every swap, jest run and restore below is its OWN Bash call.

Arm B, a guard-only half-edit. This is exactly the mistake tauri-action's README warns about ("This must match the platform value defined above"), and it would make CI silently skip the apt step on the Linux leg.
- From `git show HEAD:.github/workflows/release-tauri.yml`, produce a variant where ONLY the apt step's guard value is changed back to the old runner. Use sed anchored on the `if: matrix.platform == 'ubuntu-22.04'` line, substituting `ubuntu-24.04` in that line only, and write it over the workflow path.
- Confirm `git diff --numstat -- .github/workflows/release-tauri.yml` reports exactly 1 added and 1 deleted.
- Run `npx jest --selectProjects Backend --testPathPattern 'releaseWorkflow'` with output redirected to a scratchpad file and the exit code echoed. Require exit 1 and the failing set to be EXACTLY test (b).
- Restore with `git show HEAD:.github/workflows/release-tauri.yml > .github/workflows/release-tauri.yml`.
- Confirm `git diff --quiet -- .github/workflows/release-tauri.yml` exits 0.

Arm C, apt-list drift without a re-census.
- From the HEAD text, produce a variant that appends one extra package token (`libfuse2`) to the end of the `apt-get install -y` line only.
- Require numstat 1/1.
- Run the same suite. Require exit 1 and the failing set to be EXACTLY test (c).
- Restore the same way and confirm `git diff --quiet`.

If either arm fails a DIFFERENT set of tests, or none, the new test is miswritten or vacuous. Fix the test, re-run the Task 1 battery and commit the fix with a new `fix(quick-260929-vyi): ...` commit, using the same single-invocation add-check-commit shape. Then redo the arm.

Append to `evidence/negative-control.txt`:
- one section per arm, covering the variant description, the numstat, the failing bullet (`●`) headers verbatim, the `Tests:` line, the exit code, and the restore proof (`git diff --quiet` exit 0);
- a closing table mapping each new test to the arm that turns it red: (a) Arm A, (b) Arm B, (c) Arm C, (d) Arm A.

The table is the evidence that no new test is a green check that proves nothing.

Finally, as its own call, re-run `npx jest --selectProjects Backend Meta --testPathPattern 'releaseWorkflow|tauriConf|artifactTargets|cleanDist'`. It must be green with the same count as Task 1. `git status --porcelain -- .github src` must print nothing.
  </action>
  <verify>
    <automated>cd /home/graysonmitchell/GameLib && git diff --quiet -- .github/workflows/release-tauri.yml && test -z "$(git status --porcelain -- .github src)" && grep -Eq '^.*Arm B' .planning/quick/260929-vyi-fix-glibc-todo-move-linux-release-leg-to/evidence/negative-control.txt && grep -Eq '^.*Arm C' .planning/quick/260929-vyi-fix-glibc-todo-move-linux-release-leg-to/evidence/negative-control.txt && npx jest --selectProjects Backend --testPathPattern 'releaseWorkflow'</automated>
  </verify>
  <done>
    - Arm B fails exactly test (b), and Arm C fails exactly test (c). Each is recorded with numstat 1/1, the verbatim failure headers and the exit code.
    - Every new test maps to a recorded red arm.
    - The workflow is byte-identical to HEAD (`git diff --quiet` exit 0), and `git status --porcelain -- .github src` is empty.
    - The scoped Backend+Meta run is green at the Task 1 count.
    - `git stash` was never used.
  </done>
</task>

<task type="auto">
  <name>Task 3: Update the todo in place with the dated change section and a plain UNVERIFIED list, run the planning gates, docs commit</name>
  <files>.planning/todos/pending/2026-09-29-ci-linux-appimage-glibc-2-39-not-launchable-on-glibc-2-35.md (append-only). The evidence files jammy-apt-census.txt and negative-control.txt are committed, not edited.</files>
  <read_first>.planning/todos/pending/2026-09-29-ci-linux-appimage-glibc-2-39-not-launchable-on-glibc-2-35.md; CLAUDE.md "Todo triage frontmatter (enforced by CI)"</read_first>
  <action>
Append a section at the END of the todo body. Never rewrite existing text. Hand-match the file's existing wrap of about 100 columns and its voice. The file is under `.planning`, so prettier ignores it and nothing mechanical formats it.

Heading: `## Change made 2026-09-29 (quick 260929-vyi)`.

Contents:
- What changed:
  - the short sha(s) of the Task 1 (and any Task 2 fix) commit;
  - the Linux matrix leg moved from ubuntu-24.04 to ubuntu-22.04;
  - the apt guard now matches it;
  - swatinem/rust-cache is now keyed on matrix.platform, and why;
  - the dated header entry;
  - the four parsed-YAML tests replacing the raw-text regex test.
- Why this candidate, and why NOT the alternative. Documenting a minimum supported glibc of 2.39 and no longer advertising the AppImage below it would leave every 22.04-era user with a download that does not start. That includes this project's own target host, the operator's Pop!_OS 22.04. Tauri's guidance is to build on the oldest supported base, and names Ubuntu 22.04.
- The census result: 5/5 FOUND in the jammy archive indexes, with the evidence path. Also the premise correction, stated plainly: on this host `apt-cache policy` shows installed packages only, so it cannot answer "is it in jammy".
- The negative-control result, with its evidence path and the arm table.
- A subsection `### UNVERIFIED — until a CI run on the new base produces an AppImage and it is smoke-launched on this host`, as a plain numbered list:
  1. No release-tauri.yml run has executed on ubuntu-22.04. The apt install, the Rust compile, the SEA sidecar build, and AppImage bundling (linuxdeploy/appimagetool on the 22.04 image) are all unobserved.
  2. The rebuilt AppImage's maximum GLIBC_ reference being at most 2.35 is expected by construction, not measured. Re-run the 260929-v1v static census method (its evidence/census.txt) on the new artifact.
  3. Launch on this Pop!_OS 22.04 host is the 38-W05 re-run, which is out of scope here. A default workflow_dispatch dry run is the SAFE way to prove item 1 without touching any release, but it yields a build log and no binary. Only a real v* tag push yields an AppImage, and that writes into the shared draft release v0.7.0, so it is the operator's call.
  4. Launch on a glibc 2.39 or newer host, the open item above, is unchanged.
  5. The first run after this change is a cold Rust cache on all three legs. The 60-minute tauri-action bound has never been measured against a cold build.
  6. GitHub's ubuntu-22.04 hosted image is on a deprecation path, and no date is asserted here. When it retires, the floor must be re-decided.
  7. Helper binaries fetched by `pnpm download-helper-binaries`, and the SEA sidecar's official nodejs.org Node, carry their own glibc floors that do not depend on the build base. The earlier "What is not known" items (minisign provenance, sidecar exit in the packaged layout) are untouched.

Frontmatter:
- Leave `severity: major`, `platform: linux`, `ready: live-gate` and every other existing key unchanged. `ready: live-gate` still fits, because the remaining proof is a live CI run plus a live launch.
- You may append `src/backend/__tests__/releaseWorkflow.test.ts` and this quick dir's `evidence/` path to `files:`, as insertions only.
- Do NOT move the todo to completed/.
- Do NOT touch 38-VERIFICATION.md, 38-HUMAN-UAT.md, 35-LIVE-GATE.md or STATE.md.

Hygiene:
- `git diff --numstat` on the todo must show 0 deleted lines, which is the append-only proof.
- Check `tail -3 <file> | cat -A` for the todo and both evidence files. No trailing orphan tool-envelope closing tag may appear; the planning envelope-tag gate convicts that shape.
- Run `pnpm planning-gates` UNPIPED. It must exit 0, and that includes the todo-frontmatter gate.

Prettier:
- All three paths are under `.planning` and `--file-info` reports ignored:true (measured at planning time). NO `--check` is run, because it would be vacuous; record that in the SUMMARY.

Commit in ONE Bash invocation. Write the message with the Write tool first.
- Subject: `docs(quick-260929-vyi): record the ubuntu-22.04 build-base change, jammy census and negative controls on the glibc todo`.
- End with the same two trailer lines as Task 1.
- The invocation: `git add` the todo plus the two evidence files, then a test that the sorted staged names equal exactly those three paths, then `git commit -F <msgfile>`, all joined by `&&`.
  </action>
  <verify>
    <automated>cd /home/graysonmitchell/GameLib && pnpm planning-gates && grep -q '^## Change made 2026-09-29 (quick 260929-vyi)' .planning/todos/pending/2026-09-29-ci-linux-appimage-glibc-2-39-not-launchable-on-glibc-2-35.md && grep -q '^ready: live-gate$' .planning/todos/pending/2026-09-29-ci-linux-appimage-glibc-2-39-not-launchable-on-glibc-2-35.md && test "$(for c in $(git log --format=%H --grep='^fix(quick-260929-vyi)' --grep='^docs(quick-260929-vyi): record the ubuntu-22.04' ef5638a7c..HEAD); do git show --name-only --format= "$c"; done | LC_ALL=C sort -u | paste -sd' ')" = ".github/workflows/release-tauri.yml .planning/quick/260929-vyi-fix-glibc-todo-move-linux-release-leg-to/evidence/jammy-apt-census.txt .planning/quick/260929-vyi-fix-glibc-todo-move-linux-release-leg-to/evidence/negative-control.txt .planning/todos/pending/2026-09-29-ci-linux-appimage-glibc-2-39-not-launchable-on-glibc-2-35.md src/backend/__tests__/releaseWorkflow.test.ts" && git show --name-only --format=%s HEAD</automated>
  </verify>
  <done>
    - The todo carries the dated section with the why-not-the-alternative paragraph and the numbered UNVERIFIED list.
    - The todo diff is append-only (0 deleted lines), severity/platform/ready are unchanged, and the todo is still in pending/.
    - `pnpm planning-gates` exits 0.
    - HEAD is the `docs(quick-260929-vyi)` commit touching exactly the todo and the two evidence files.
    - The union of files touched by this plan's code and docs commits (selected by subject within the explicit range `ef5638a7c..HEAD`) is EXACTLY the five `files_modified` paths. STATE.md and 38-VERIFICATION.md are therefore untouched by this plan.
    - Nothing is pushed, tagged or dispatched.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| local repo → GitHub (push/tag/dispatch) | Any push of a v* tag or a workflow_dispatch writes to the SHARED real draft release v0.7.0. This plan never crosses this boundary. |
| CI runner cache store → Linux build leg | A restored Cargo target/ is trusted by cargo as fresh. Its provenance (which runner image compiled it) is only as good as the cache key. |
| public Ubuntu archive → census evidence | The index files are fetched over plain HTTP and only read. Nothing is installed. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-vyi-01 | Tampering | release-tauri.yml / shared draft release v0.7.0 | high | mitigate | No task pushes, tags or dispatches. Commits are local only. The SUMMARY states it, and the dry-run-vs-tag-push distinction is recorded in the todo so the operator decides. |
| T-vyi-02 | Tampering | swatinem/rust-cache restore into the ubuntu-22.04 leg | medium | mitigate | `key: ${{ matrix.platform }}` (Task 1 step 3). Test (d) pins it, and Arm A shows (d) red without it. The default Linux-x64 prefix key could otherwise restore glibc-2.38/2.39-compiled objects. |
| T-vyi-03 | Repudiation | releaseWorkflow.test.ts (green check proving nothing) | medium | mitigate | Parsed-YAML assertions replace the raw-text regex that comment prose could satisfy. Every new test has a recorded red arm (A/B/C), and the scoped run asserts a file-scoped trailing line and a non-zero count. |
| T-vyi-04 | Tampering | transient workflow swap in Task 2 absorbed by a later commit | medium | mitigate | Restore from `git show HEAD:`, `git diff --quiet` after every arm, and `git status --porcelain -- .github src` empty. Every commit uses explicit paths plus a staged-name equality test in the same invocation. No git stash. |
| T-vyi-05 | Spoofing | archive.ubuntu.com Packages.xz over HTTP (no InRelease signature check) | low | accept | Evidence only; nothing is installed. The runner's own apt verifies signatures. A tampered index could only mislead the census, and CI's apt-get install would still fail loudly on a truly missing package. The sha256 of each index is recorded. |
| T-vyi-06 | Information disclosure | evidence/jammy-apt-census.txt host lines | low | mitigate | Record only `lsb_release -d` and the first line of `ldd --version`. No HOME, env, user paths or tokens. |
| T-vyi-SC | Tampering | package installs | low | accept | No npm/pip/cargo install happens in this plan, and the CI apt package NAMES are unchanged. The package-legitimacy gate is not triggered. |
</threat_model>

<verification>
- Scoped jest across the projects that read the workflow: `npx jest --selectProjects Backend Meta --testPathPattern 'releaseWorkflow|tauriConf|artifactTargets|cleanDist'`. Expect 4 suites green with a file-scoped trailing line, and a count of 176 - 1 + new tests (179 expected), measured in its own call.
- Negative controls: Arm A red on exactly (a) and (d), Arm B red on exactly (b), Arm C red on exactly (c). All recorded in evidence/negative-control.txt.
- The structural js-yaml check prints OK. It confirms 3 legs, one Ubuntu leg at ubuntu-22.04, the apt guard equal to it, the rust-cache key on matrix.platform, and that no non-comment content names the old runner.
- Prettier: `--file-info` shows ignored:false and `--check` passes on the yml and ts. The three `.planning` paths are ignored:true, so no check is run and that is stated.
- `pnpm codecheck`, `pnpm lint:tests` and `pnpm planning-gates` all exit 0.
- The jammy census shows 5/5 FOUND from the real archive indexes.
- `git log origin/HEAD..HEAD`, if a remote ref exists, shows only local commits. No push, tag or dispatch.
</verification>

<success_criteria>
- The Linux release leg builds on ubuntu-22.04. Its apt guard and the Rust cache key follow the platform string, and a parsed-YAML test block pins all of it with every test proven able to fail.
- The apt list is proven available on jammy from the real archive, not from this host's installed-package view.
- The todo records exactly what changed and a plain UNVERIFIED list, with its frontmatter valid and unchanged in value.
- Two local commits exist: `fix(quick-260929-vyi)` for the code and `docs(quick-260929-vyi)` for the evidence and the todo. Each touches only its listed paths.
</success_criteria>

<output>
Create `.planning/quick/260929-vyi-fix-glibc-todo-move-linux-release-leg-to/260929-vyi-SUMMARY.md` when done. It must contain:
- The commits (short sha and subject).
- The three workflow edits and the four tests.
- The measured test counts.
- The census table and the apt-cache-policy premise correction.
- The negative-control arm table.
- Scope decisions with reasons: promote-updater-feed.yml stays on ubuntu-24.04 because it builds nothing that ships; tauriConf.test.ts:659 is unchanged because it describes that job; the upstream legendary fixture is unchanged; install-deps has no apt list.
- Why the alternative (a documented minimum glibc) was NOT chosen.
- The same UNVERIFIED list as the todo.
- The dry-run fact: a build log only, no binary. Only a tag push yields an AppImage, and that writes the shared draft v0.7.0.
- Follow-up risks, not decided here:
  - the ubuntu-22.04 image deprecation path, with no date;
  - the `*-latest` labels (macos-latest, windows-latest) have the same cache-key blind spot when GitHub re-points them.
- Pre-existing header staleness, observed and NOT changed:
  - l.5-9 still says the pipeline has never completed a tag-push run, while l.527-529 records one;
  - the Pitfall-7 NOTE names draft-release-mac.yml and draft-release-linux.yml, which no longer exist in .github/workflows/.
- Which paths got a real prettier `--check` and which were vacuous-by-ignore.
- An explicit statement that nothing was pushed, tagged or dispatched, and that STATE.md and 38-VERIFICATION.md were not touched.
</output>
