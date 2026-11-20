---
phase: quick-261108-avs
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - meta/__tests__/overlayInputSmoke.test.ts
  - meta/__tests__/overlayInputProbeSmoke.test.ts
autonomous: true
requirements: [QUICK-261108-avs]

must_haves:
  truths:
    - "Running `jest --selectProjects Meta` without GAMELIB_DESKTOP_SMOKE=1 executes zero cases in either overlay smoke file: no clang build, no driver spawn, no cursor warp, no window, no beep"
    - "Without the var each file emits one console.warn naming GAMELIB_DESKTOP_SMOKE=1 and reports its cases as skipped (WR-05 style: logged skip, never a silent pass)"
    - "Without the var the hasWindowServer() launchctl probe is not spawned"
    - "With GAMELIB_DESKTOP_SMOKE=1 behaviour is byte-for-byte the current behaviour, including: Aqua host whose driver reports no-window-server FAILS (requireExercised / existing assertions untouched)"
    - "Each file's header doc comment tells a contributor to set GAMELIB_DESKTOP_SMOKE=1 to run it"
  artifacts:
    - path: "meta/__tests__/overlayInputSmoke.test.ts"
      provides: "desktop-smoke gate on the overlay_input smoke"
      contains: "GAMELIB_DESKTOP_SMOKE"
    - path: "meta/__tests__/overlayInputProbeSmoke.test.ts"
      provides: "desktop-smoke gate on the overlay input probe smoke"
      contains: "GAMELIB_DESKTOP_SMOKE"
  key_links:
    - from: "desktopSmoke constant"
      to: "describeDarwin selector"
      via: "describe vs describe.skip"
      pattern: "desktopSmoke \\? describe : describe.skip|&& desktopSmoke"
    - from: "desktopSmoke constant"
      to: "hasWindowServer() call"
      via: "short-circuit &&, so launchctl is never spawned when gated off"
      pattern: "desktopSmoke && hasWindowServer\\(\\)"
---

<objective>
Gate the two desktop-interactive overlay smoke tests behind an opt-in env var
`GAMELIB_DESKTOP_SMOKE=1`. Today any session that runs `jest --selectProjects Meta`
on the user's logged-in Mac builds and runs drivers that call
`CGWarpMouseCursorPosition(10,10)` on the real cursor, open real windows and beep.

Purpose: routine Meta runs (several Claude sessions do this) must stop touching the
user's desktop, while the smoke stays one env var away and keeps its WR-05 rigor.
Output: two edited test files, committed together.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@meta/__tests__/overlayInputSmoke.test.ts
@meta/__tests__/overlayInputProbeSmoke.test.ts

Load `Skill("gamelib-conventions")` before editing: the `<verify>` prettier rule and the
fake-HOME spawn rule apply. The existing `hasWindowServer()` already uses
`createFakeHomeProfile()` — leave that spawn exactly as it is; this plan only stops it
running when gated off. No new spawn sites are added.

<interfaces>
Current gate block, identical shape in both files (overlayInputSmoke.test.ts ~L193-216,
overlayInputProbeSmoke.test.ts ~L178-208):

- `const describeDarwin = process.platform === 'darwin' ? describe : describe.skip`
- `function hasWindowServer(): boolean` — spawnSync('launchctl', ['managername']) under a
  fake-HOME profile; true iff stdout is `Aqua`.
- `const windowServer = hasWindowServer()` — evaluated at module (collect) time.
- `if (process.platform === 'darwin' && !windowServer) console.warn('<label>: SKIPPED, no window server (launchctl managername is not Aqua)')`
  - smoke label: `overlay_input smoke: SKIPPED, ...`
  - probe label: `overlay input probe smoke: GUI cases SKIPPED, ...`
- `const itWindowServer = windowServer ? it : it.skip`
- Probe file only: `requireExercised(stdout)` throws when the driver prints
  `no-window-server` — this is the "Aqua but no window server FAILS" rule. Must stay.
- Top-level suites: `describeDarwin('overlay_input.dylib smoke (60-19, G1)', ...)` and
  `describeDarwin('overlay input probe smoke (60-11, 60-17, G1)', ...)`. Each has a
  `beforeAll` that compiles dylibs/drivers with clang.
- Probe file has plain `it(...)` cases (L369 'loads, hooks, and logs...', L421, L432, L438)
  that run the driver even without a window server — so gating only `itWindowServer` is
  NOT enough; the whole describe must be skipped.

Precedent for env-var naming/check style: `meta/__tests__/x86CallbackWineHarness.test.ts`
uses `process.env.GAMELIB_REQUIRE_WINE_HARNESS === '1'` with a `console.warn` skip.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add the GAMELIB_DESKTOP_SMOKE gate to both overlay smoke files</name>
  <files>meta/__tests__/overlayInputSmoke.test.ts, meta/__tests__/overlayInputProbeSmoke.test.ts</files>
  <action>
Apply the same edit to both files, inline (two call sites do not warrant a shared helper; keep the two blocks textually parallel so they read as one pattern):

1. Just above the existing `describeDarwin` line, add a module-level constant `desktopSmoke` set to `process.env.GAMELIB_DESKTOP_SMOKE === '1'` (strict `'1'`, matching the GAMELIB_REQUIRE_WINE_HARNESS precedent), with a one-line comment saying these cases warp the real cursor, open windows and beep, so they are opt-in.

2. Change `describeDarwin` so the top-level suite runs only on darwin AND with the gate on: `process.platform === 'darwin' && desktopSmoke ? describe : describe.skip`. Using describe.skip on the whole suite is what guarantees zero cases execute and the `beforeAll` clang builds never run (Jest does not run hooks of a fully skipped describe). Do not instead gate individual `it`s — the probe file's plain `it` cases spawn the driver without a window server.

3. Add an explicit, logged skip in WR-05 style: when `process.platform === 'darwin' && !desktopSmoke`, `console.warn` a single line. Smoke file: `overlay_input smoke: SKIPPED, desktop-interactive (warps the cursor, opens windows); set GAMELIB_DESKTOP_SMOKE=1 to run`. Probe file: `overlay input probe smoke: SKIPPED, desktop-interactive (warps the cursor, opens windows); set GAMELIB_DESKTOP_SMOKE=1 to run`. Keep the leading label identical to each file's existing no-window-server warn label so the two skip reasons are greppable together.

4. Skip the launchctl probe when gated off: change `const windowServer = hasWindowServer()` to `const windowServer = desktopSmoke && hasWindowServer()` (short-circuit, so no child process is spawned at collect time). Change the existing no-window-server warn condition to `process.platform === 'darwin' && desktopSmoke && !windowServer` so a gated-off run prints only the gate message, not a misleading "no window server" one. Leave `hasWindowServer()` itself, `itWindowServer`, `requireExercised`, and every test body untouched — with the var set the behaviour must be identical to today, including the Aqua-but-driver-finds-no-window-server failure.

5. Header doc comments: in each file's top `/** ... */` block, add a sentence that the suite is desktop-interactive (warps the real cursor, opens windows, may beep) and is skipped with a logged warning unless `GAMELIB_DESKTOP_SMOKE=1` is set, with the run command, e.g. `GAMELIB_DESKTOP_SMOKE=1 npx jest --selectProjects Meta --runTestsByPath meta/__tests__/<this file>` (use each file's own path). Keep the existing WR-05 wording; the new sentence comes first in the gating discussion so contributors see it before the window-server explanation.

Do NOT run either file with GAMELIB_DESKTOP_SMOKE=1 — that warps the user's cursor. That path is a manual check (see verification).

Commit: the main tree has unrelated uncommitted changes from other sessions. Stage ONLY these two files by explicit path — `git add meta/__tests__/overlayInputSmoke.test.ts meta/__tests__/overlayInputProbeSmoke.test.ts` — never `git add -A`, `git add .`, or `git commit -a`. Confirm `git diff --cached --name-only` lists exactly those two paths before committing. Commit message: `test(quick-261108-avs): gate overlay desktop smoke tests behind GAMELIB_DESKTOP_SMOKE`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && env -u GAMELIB_DESKTOP_SMOKE npx jest --selectProjects Meta --runTestsByPath meta/__tests__/overlayInputSmoke.test.ts meta/__tests__/overlayInputProbeSmoke.test.ts 2>&1 | tee /dev/stderr | grep -E "Tests:" | grep -vE "passed|failed" && env -u GAMELIB_DESKTOP_SMOKE npx jest --selectProjects Meta --runTestsByPath meta/__tests__/overlayInputSmoke.test.ts meta/__tests__/overlayInputProbeSmoke.test.ts 2>&1 | grep -c "set GAMELIB_DESKTOP_SMOKE=1 to run" | grep -qx 2 && npx tsc -p tsconfig.meta.json --noEmit && npx eslint meta/__tests__/overlayInputSmoke.test.ts meta/__tests__/overlayInputProbeSmoke.test.ts && npx prettier --check meta/__tests__/overlayInputSmoke.test.ts meta/__tests__/overlayInputProbeSmoke.test.ts</automated>
  </verify>
  <done>
- Gated-off Jest run of both files: `Tests:` line shows only skipped (0 passed, 0 failed), both gate warnings printed (count 2), no "no window server" warning printed, and no cursor movement/window/beep occurred (no driver spawned — the describe is skipped so beforeAll never runs).
- `grep -n "desktopSmoke && hasWindowServer()"` matches once in each file (launchctl not spawned when gated off).
- `tsc -p tsconfig.meta.json --noEmit`, eslint on the two paths, and the scoped `prettier --check` all pass (both paths confirmed not prettier-ignored via `--file-info`).
- One commit containing exactly the two test files.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| test runner -> user desktop session | Meta tests spawn GUI drivers that act on the real cursor and windows |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261108-avs-01 | Denial of Service | overlay smoke suites on a logged-in Mac | mitigate | describe.skip unless GAMELIB_DESKTOP_SMOKE === '1'; launchctl probe short-circuited |
| T-261108-avs-02 | Repudiation | silent test skip hiding lost coverage | mitigate | console.warn naming the env var on every gated-off run (WR-05 logged skip) |
| T-261108-avs-03 | Tampering | unrelated uncommitted changes in main tree | mitigate | stage the two paths explicitly; check `git diff --cached --name-only` before commit |
</threat_model>

<verification>
Automated (in the task's verify): gated-off run is all-skipped with both warnings; meta typecheck, eslint and scoped prettier pass.

Manual, operator only (NOT run by the executor — it warps the cursor): on the logged-in Mac, `GAMELIB_DESKTOP_SMOKE=1 npx jest --selectProjects Meta --runTestsByPath meta/__tests__/overlayInputSmoke.test.ts meta/__tests__/overlayInputProbeSmoke.test.ts` behaves exactly as before this change (cases run; on an Aqua host where the driver reports no window server, the cases fail rather than pass).
</verification>

<success_criteria>
- Routine `jest --selectProjects Meta` no longer moves the cursor, opens windows or beeps.
- The skip is visible (logged), never a silent pass.
- Opt-in path is unchanged and documented in each file's header.
</success_criteria>

<output>
Create `.planning/quick/261108-avs-gate-overlay-desktop-smoke-tests/261108-avs-SUMMARY.md` when done
</output>
