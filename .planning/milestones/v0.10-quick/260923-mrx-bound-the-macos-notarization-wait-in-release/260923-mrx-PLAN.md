---
quick_id: 260923-mrx
type: quick
date: 2026-09-23
files_modified:
  - .github/workflows/release-tauri.yml
  - src/backend/__tests__/releaseWorkflow.test.ts
autonomous: true
baseline_sha: 77f3b4388
must_haves:
  truths:
    - "The tauri-action step cannot burn more than 60 minutes on any matrix leg."
    - "When it does time out on macOS, the run itself reports the Apple-side submission status."
    - "The diagnostic step can never turn a green job red, and never prints APPLE_PASSWORD."
    - "The header comment states the bound AND states that it conflates build time with notarization time."
  artifacts:
    - path: ".github/workflows/release-tauri.yml"
      provides: "step-level timeout-minutes: 60 on tauri-action + a macOS-only if: failure() notarytool diagnostic"
    - path: "src/backend/__tests__/releaseWorkflow.test.ts"
      provides: "parsed-YAML regression block over both"
  key_links:
    - from: "src/backend/__tests__/releaseWorkflow.test.ts"
      to: ".github/workflows/release-tauri.yml"
      via: "loadYaml(readFileSync(RELEASE_WORKFLOW_PATH)).jobs.release.steps"
      pattern: "timeout-minutes"
---

<objective>
`.github/workflows/release-tauri.yml` has no `timeout-minutes` anywhere — verified by grep at
HEAD `77f3b4388` — so every leg inherits GitHub's 360-minute default. On run `35808881023`
(tag `v0.7.0-notarize-test2`) the macOS leg sat in `xcrun notarytool` for **2h05m37s** of total
silence between `Notarizing .../GameLib.app` at 02:13:17 and a hand cancellation at 04:18:54,
which then reaped an orphan `notarytool` pid.

Bound that step at 60 minutes, and make the resulting timeout self-explaining by asking Apple
what happened to the submission from inside the same run.

Purpose: today, when this fires, the log says only `The operation was canceled.` Establishing
whether the submission was `Accepted`, `In Progress` or `Invalid` required a human with local
Apple credentials. That diagnostic gap is the actual cost.

Output: a bounded `tauri-action` step, a macOS-only `if: failure()` `notarytool history` step,
an honest header-comment entry, and parsed-YAML regression assertions over all of it.
</objective>

<settled_do_not_relitigate>
These were decided before planning. Do not research alternatives, do not propose them in the
summary, do not ask.

- **The fix is a step-level `timeout-minutes: 60` on the `tauri-apps/tauri-action@v1` step.**
- **Do NOT try to pass a timeout to notarytool.** VERIFIED: `tauri-bundler` hardcodes `--wait`
  on its `xcrun notarytool submit` call and exposes no timeout flag and no environment variable.
  Upstream PR `tauri-apps/tauri#13521` added `--no-wait` — **not** a timeout — and its own author
  called it a hotfix. `xcrun notarytool submit --timeout <duration>` does exist, but we do not own
  that argv. Do NOT switch to `--no-wait`, do NOT bypass Tauri's notarization, do NOT hand-roll a
  notarytool wrapper: Tauri also runs `xcrun stapler staple`, so bypassing its flow means owning
  stapling too.
- **The build was not slow and signing was not broken.** 4m40s from step start to
  `Built application`, warm `swatinem/rust-cache`; Tauri found the cert and re-signed all four
  artifacts; the throwaway keychain from the preceding "Sign every Mach-O..." step did NOT collide
  with Tauri's own `security import`. Do not re-investigate any of these.
- **The header's claim that `draft-release-mac.yml` / `draft-release-linux.yml` co-fire on `v*` is
  stale** — both files no longer exist, and `release-tauri.yml` is the only `v*`-triggered
  workflow. That is OUT OF SCOPE. Do not fix it; do not repeat it in anything you write.
</settled_do_not_relitigate>

<measured_baselines>
Measured 2026-09-23 against a clean tree at `77f3b4388`. Re-measure rather than trusting these if
the tree has moved; this repo has measured verify blocks rotting against their own baseline sha.

| Thing | Measured | Consequence for this task |
|---|---|---|
| `node meta/lintScoped.cjs --tests` | `638 problems (0 errors, 638 warnings)`, `tests: PASS` | `TESTS_CEILING = 638` (meta/lintScoped.cjs:59) — **ZERO headroom**. One new warning in the test file breaks CI. |
| `node meta/lintScoped.cjs --src` | `1107 problems`, `production: PASS` | `SRC_CEILING = 1124` (:58) — 17 headroom, and this task writes no `src/` production code. |
| `npx prettier --check .github/workflows/release-tauri.yml src/backend/__tests__/releaseWorkflow.test.ts` | exit 0 | Non-vacuous: `.prettierignore` names `.github/workflows/build-base.yml` but NOT `release-tauri.yml`. Contrast `.planning`, which IS ignored wholesale — that is why the previous quick task's prettier check was vacuous. This one is real. |
| `npx jest --config src/backend/jest.config.js src/backend/__tests__/releaseWorkflow.test.ts` | `85 passed`, 0.19s | The suite is fast; run it per task, not once at the end. |

**Blast radius of `timeout-minutes` on a matrix step: it applies to ALL THREE legs.**

- Linux `tauri-action`: **4m53s** end-to-end on run `35808881023`. 60 min ≈ 12× headroom.
- Windows: **no measurement exists on that run** — the Windows leg died before `tauri-action`.
  The nearest real datum is this workflow's own header (GAP-B, live run `30084918812`): the
  Windows leg "burned ~13 minutes of Rust build first" before dying at updater signing. Call it
  ~13–20 min for bundle, so 60 min is roughly 3–4.6× headroom. Say that it is an inference from a
  different run; do not present it as a measurement of `tauri-action` on Windows.
- **Residual risk, state it rather than hide it:** on a cold `swatinem/rust-cache` the Rust build
  alone could plausibly consume a large fraction of 60 minutes on Windows, and a cold macOS build
  plus a slow-but-succeeding Apple queue could too. 60 minutes is a bound chosen against warm-cache
  evidence. If a cold leg ever trips it, the correct response is to raise the number with the new
  measurement recorded — not to remove the bound.
</measured_baselines>

<verify_block_control>
The assertion logic below was controlled in BOTH directions before this plan shipped, with a
standalone `js-yaml` harness run twice: once against the unedited workflow at HEAD, once against a
simulated edit.

- Against the **unedited** workflow: `3/11 passed`, exit 1. The 8 failures are exactly the 8
  shape assertions this task adds.
- Against the **simulated edit**: `11/11 passed`, exit 0.
- The two assertions that pass vacuously in the RED direction are the negative ones (`no set -x`,
  `no echo of $APPLE_PASSWORD`) — they pass because the step does not exist yet. **They must
  therefore be written downstream of a `expect(diagStep).toBeDefined()` non-vacuity guard**, the
  same shape the existing `ORDERING INVARIANT` test uses to stop `-1 < 0` passing.
- The simulated edit was also run through `npx prettier --parser yaml`: **zero diff**. The shape
  in Task 1 is known prettier-clean as written.
</verify_block_control>

<context>
@.github/workflows/release-tauri.yml
@src/backend/__tests__/releaseWorkflow.test.ts
@./CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Bound the tauri-action step and add the notarytool diagnostic</name>
  <files>.github/workflows/release-tauri.yml</files>
  <action>
Three edits to this one file.

**(a) `timeout-minutes: 60` on the `tauri-apps/tauri-action@v1` step.** It goes between the
`- uses:` line and the `with:` line, at the step's own indentation. That step is the last one in
the file today. Add nothing else to it.

**(b) A new final step, immediately after `tauri-action`, named for what it does** (e.g.
"Diagnose a notarization timeout (diagnostic only, never fails the job)"). Requirements, each of
which has a matching assertion in Task 2:

  - `if:` gates on `failure()` AND `startsWith(matrix.platform, 'macos')` AND all three of
    `env.APPLE_ID != ''`, `env.APPLE_PASSWORD != ''`, `env.APPLE_TEAM_ID != ''`. Use exactly that
    `env.X != ''` spelling — it is the same style as the existing "Warn if Windows signing will be
    skipped" gate, and it resolves correctly because the "Enable Apple signing only when a
    complete cert secret set is enrolled" step writes those three names into `$GITHUB_ENV` (an
    unset context value coerces to `''` in a GitHub expression comparison, so a secrets-less run
    simply skips this step).
  - `continue-on-error: true`, and **no trailing `|| true`**. Pick exactly one, per the locked
    decision, and this is the one. Write the reason into the step comment: `continue-on-error`
    keeps the job green while still surfacing a visible "this step failed" annotation if
    `notarytool` itself errors, whereas `|| true` would swallow that signal too and leave the
    diagnostic silently indistinguishable from a successful empty query.
  - `shell: bash`, `set -euo pipefail`, then `xcrun notarytool history` with
    `--apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID"` read from the
    ambient environment.
  - **CRITICAL — do NOT give this step an `env:` map containing any `APPLE_*` key.** The existing
    GAP-A regression test asserts that no `env:` map anywhere in the job defines a key beginning
    `APPLE_`, and it tests parsed keys with `startsWith('APPLE_')`. Adding
    `APPLE_ID: ${{ secrets.APPLE_ID }}` here turns that test red. The values are already in the
    process environment via `$GITHUB_ENV`; the "Sign every Mach-O..." step reads `$APPLE_CERTIFICATE`
    the same way, with no `env:` map.
  - **No credential echo.** No `set -x`, no `echo` of the command line, no `echo "$APPLE_PASSWORD"`.
    `APPLE_PASSWORD` is an app-specific password and this is a public repo's log. GitHub masks
    registered secrets, but say in the comment that masking is not being relied on as the only
    control.

**(c) Extend the header comment block** at the top of the file — that block is this file's
documented-invariants record. Add a dated entry (2026-09-23, run `35808881023`) that states:
  - the measured 2h05m37s silent notarization wait and the 360-minute default it was inheriting;
  - the new 60-minute bound;
  - **honestly, that a step-level timeout CONFLATES build time with notarization time.** It is a
    blunt bound over the whole bundle+sign+notarize step, not a notarization-specific one. Say
    that this is a deliberate accepted tradeoff forced by `tauri-bundler` hardcoding `--wait` and
    exposing no timeout knob. Do not let the wording imply the bound is notarization-specific.
  - that the bound applies to all three matrix legs, with the Linux 4m53s measurement and the
    honest "no Windows measurement of this step exists" caveat from `<measured_baselines>`.

Do not touch the stale `draft-release-mac.yml` / `draft-release-linux.yml` paragraph.
  </action>
  <verify>
    <automated>node -e "const{load}=require('js-yaml');const s=load(require('fs').readFileSync('.github/workflows/release-tauri.yml','utf8')).jobs.release.steps;const t=s.findIndex(x=>(x.uses||'').includes('tauri-action'));const d=s.findIndex(x=>(x.run||'').includes('notarytool history'));const f=[];if(t<0)f.push('no tauri-action step');if(s[t]&&s[t]['timeout-minutes']!==60)f.push('timeout-minutes!==60');if(d<0)f.push('no diagnostic step');if(d>=0){if(d!==t+1)f.push('diagnostic not immediately after tauri-action');const g=s[d].if||'';for(const n of ['failure()',\"startsWith(matrix.platform, 'macos')\",\"env.APPLE_ID != ''\",\"env.APPLE_PASSWORD != ''\",\"env.APPLE_TEAM_ID != ''\"])if(!g.includes(n))f.push('if missing: '+n);if(s[d]['continue-on-error']!==true)f.push('continue-on-error!==true');const r=s[d].run||'';if(/set -x/.test(r))f.push('set -x present');if(/echo[^\n]*\$\{?APPLE_PASSWORD/.test(r))f.push('echoes APPLE_PASSWORD');if(/\|\| *true/.test(r))f.push('|| true present (continue-on-error is the chosen control)');if(Object.keys(s[d].env||{}).some(k=>k.startsWith('APPLE_')))f.push('GAP-A: diagnostic step defines an APPLE_ env key');}
const to=s.filter(x=>x['timeout-minutes']!==undefined);if(to.length!==1)f.push('expected exactly 1 step with timeout-minutes, found '+to.length);if(f.length){console.error(f.join('\n'));process.exit(1)}console.log('shape OK')"</automated>
    <automated>npx prettier --check .github/workflows/release-tauri.yml</automated>
    <automated>npx jest --config src/backend/jest.config.js src/backend/__tests__/releaseWorkflow.test.ts</automated>
  </verify>
  <done>
`timeout-minutes: 60` sits on the `tauri-action` step and on no other step; the macOS-only
`if: failure()` diagnostic step is the file's last step, is `continue-on-error: true`, carries no
`APPLE_*` `env:` key, and echoes no credential; the header comment records the bound and names the
build/notarization conflation as an accepted tradeoff. The shape probe prints `shape OK`, prettier
is clean over that path, and the 85 pre-existing `releaseWorkflow.test.ts` tests still pass.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add the parsed-YAML regression block</name>
  <files>src/backend/__tests__/releaseWorkflow.test.ts</files>
  <action>
Append a new `describe` block, `release-tauri.yml bounds the tauri-action step (260923-mrx)`,
modelled on the existing `260917-uik` block at the bottom of this file — which is the file's
declared, deliberate parsed-YAML deviation from its raw-text header convention. Reuse the existing
`parseReleaseSteps()` helper; do NOT add a second parser.

**Extend the existing `ParsedReleaseStep` interface** with `'timeout-minutes'?: number` and
`'continue-on-error'?: boolean`. Without this, `step['timeout-minutes']` is a TS error on an
interface with no index signature. Keep everything typed — the TESTS ceiling has ZERO headroom, so
an `any` cast here would add `no-unsafe-*` warnings and break `pnpm lint`.

Assert on the PARSED YAML, never on a source grep — this repo has repeatedly measured grep
assertions as satisfiable by comment prose, and the header comment this task wrote in Task 1
legitimately contains the strings `timeout-minutes`, `notarytool` and `60`.

Tests to write (each was controlled RED-then-GREEN; see `<verify_block_control>`):

  1. the `tauri-action` step's `timeout-minutes` is exactly `60`;
  2. **blast-radius census** — exactly ONE step in the whole job carries `timeout-minutes`, and it
     is the `tauri-action` one. This is the assertion that makes the "applies to all three legs"
     reasoning legible: a second, quietly-added timeout elsewhere should turn this red and force a
     re-read of the tradeoff;
  3. the diagnostic step exists, found by `(s.run ?? '').includes('notarytool history')`;
  4. **non-vacuity guard first** — `expect(diagStep).toBeDefined()` — then its `if:` contains
     `failure()`, `startsWith(matrix.platform, 'macos')`, and all three `env.APPLE_* != ''` gates;
  5. `continue-on-error === true`;
  6. ORDERING: its steps-array index is exactly `tauriIdx + 1`, with both indices asserted
     `>= 0` first so `-1` cannot satisfy it;
  7. the step body contains no `set -x`, no `echo` of `$APPLE_PASSWORD`, and no `|| true` — with a
     comment naming why the last one is asserted (the locked decision is
     `continue-on-error` *xor* `|| true`, and both-at-once would be the undeclared belt-and-braces
     the decision forbids);
  8. it defines no `env:` key beginning `APPLE_` — reusing the `startsWith('APPLE_')` predicate
     style, whose substring trap (`IN_APPLE_CERTIFICATE`) the existing positive-control test
     already documents.

Add a short block comment above the `describe` recording the run id `35808881023` and the measured
2h05m37s, so a future reader can date the assertion to its evidence.
  </action>
  <verify>
    <automated>npx jest --config src/backend/jest.config.js src/backend/__tests__/releaseWorkflow.test.ts</automated>
    <automated>npx prettier --check src/backend/__tests__/releaseWorkflow.test.ts</automated>
    <automated>npx tsc --noEmit</automated>
    <automated>node meta/lintScoped.cjs --tests</automated>
    <automated>node meta/lintScoped.cjs --src</automated>
  </verify>
  <done>
`releaseWorkflow.test.ts` reports more than its baseline 85 passing tests with 0 failures; `tsc`
is clean; both lint ceilings report PASS with the tests scope still at or under 638 warnings
(record the actual number in the summary — it was exactly 638 at baseline, so any increase is a
hard failure, not a near miss); prettier is clean over the test file.
  </done>
</task>

</tasks>

<verification>
Run from a clean tree after both tasks:

```
npx prettier --check .github/workflows/release-tauri.yml src/backend/__tests__/releaseWorkflow.test.ts
npx tsc --noEmit
npx jest --config src/backend/jest.config.js src/backend/__tests__/releaseWorkflow.test.ts
node meta/lintScoped.cjs --tests
node meta/lintScoped.cjs --src
pnpm planning-gates
```

Falsification check before declaring done: `git stash` the workflow edit alone and re-run the jest
line. The new block MUST go red. If it stays green, the assertions are reading the header comment
rather than the parsed steps, and Task 2 is not finished.
</verification>

<success_criteria>
- `timeout-minutes: 60` on the `tauri-action` step, and on exactly one step in the job.
- A macOS-only `if: failure()` `notarytool history` step, `continue-on-error: true`, no `APPLE_*`
  `env:` map, no credential echo, immediately after `tauri-action`.
- Header comment records the bound and states plainly that it conflates build with notarization
  time as an accepted tradeoff.
- Parsed-YAML regression block covers all of the above and goes red when the workflow edit is
  reverted.
- Prettier clean over both written paths; `tsc` clean; both lint ceilings PASS with tests still
  at or under 638.
</success_criteria>

<output>
Write `.planning/quick/260923-mrx-bound-the-macos-notarization-wait-in-release/260923-mrx-SUMMARY.md`
when done. Record: the final tests-scope warning count, the falsification-check result, and the
exact header-comment wording used for the build/notarization conflation.
</output>
