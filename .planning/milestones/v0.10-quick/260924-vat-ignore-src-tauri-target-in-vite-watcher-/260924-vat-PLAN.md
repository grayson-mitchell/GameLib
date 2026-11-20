---
phase: quick-260924-vat
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - vite.config.ts
  - meta/__tests__/viteRendererConfig.test.ts
  - .planning/todos/pending/2026-09-24-tauri-dev-on-windows-crashes-on-vite-ebusy-watching-src-tauri-target.md
  - .planning/todos/completed/2026-09-24-tauri-dev-on-windows-crashes-on-vite-ebusy-watching-src-tauri-target.md
autonomous: true
requirements: [TODO-2026-09-24-vite-ebusy-src-tauri-target]

must_haves:
  truths:
    - "Vite's dev-server watcher never descends into src-tauri/target, so a cargo link holding gamelib_shell.exe open cannot raise an unhandled EBUSY from the watcher"
    - "Vite's own default ignores (.git, node_modules, test-results, cacheDir) still apply -- the user entry is appended, not a replacement"
    - "Nothing under src-tauri other than target/ is ignored (no renderer-relevant file loses HMR)"
    - "A jest regression pin turns red if server.watch.ignored stops covering src-tauri/target"
    - "The todo is closed in .planning/todos/completed/ with status RESOLVED and an explicit operator live-verify follow-up"
  artifacts:
    - path: "vite.config.ts"
      provides: "server.watch.ignored containing '**/src-tauri/target/**' with a 260924-vat rationale comment"
      contains: "src-tauri/target"
    - path: "meta/__tests__/viteRendererConfig.test.ts"
      provides: "Regression pin on server.watch.ignored in both modes + source-text guard for the 260924-vat rationale"
      contains: "260924-vat"
    - path: ".planning/todos/completed/2026-09-24-tauri-dev-on-windows-crashes-on-vite-ebusy-watching-src-tauri-target.md"
      provides: "Closed todo"
      contains: "status: RESOLVED"
  key_links:
    - from: "vite.config.ts server.watch.ignored"
      to: "node_modules/vite/dist/node/chunks/dep-DBxKXgDP.js resolveChokidarOptions (line ~27441)"
      via: "Vite 6.3.5 spreads ...arraify(ignoredList) AFTER its defaults"
      pattern: "src-tauri/target"
---

<objective>
Stop `pnpm tauri:dev` on Windows dying on a cold build when Vite's chokidar watcher calls
`fs.watch` on `src-tauri/target/debug/deps/gamelib_shell.exe` while cargo's linker holds it open
(EBUSY, unhandled FSWatcher `error`, `beforeDevCommand` exits non-zero). Add
`server.watch.ignored: ['**/src-tauri/target/**']` to `vite.config.ts`, pin it in the existing
config-equivalence test, and close the todo.

Purpose: a cold dev build currently reads as a real build failure and wastes a full compile.
Output: one config key + comment, two test cases, todo moved to completed/.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/todos/pending/2026-09-24-tauri-dev-on-windows-crashes-on-vite-ebusy-watching-src-tauri-target.md
@vite.config.ts
@meta/__tests__/viteRendererConfig.test.ts

<facts_established_by_planner>
Do not re-derive these; they were measured while planning.

1. Installed Vite is 6.3.5 (`node_modules/vite/package.json`). `resolveChokidarOptions` in
   `node_modules/vite/dist/node/chunks/dep-DBxKXgDP.js` (~line 27441) builds
   `ignored = ["**/.git/**", "**/node_modules/**", "**/test-results/**", escapePath(cacheDir) + "/**", ...arraify(ignoredList || [])]`.
   User entries are APPENDED to the defaults, so the config must NOT restate the defaults.
   The same function sets `ignorePermissionErrors: true` -- which does not cover EBUSY, consistent
   with the observed crash. That chunk file is also the one named in the todo's stack trace.
2. Because `build.emptyOutDir` is `false`, Vite does NOT auto-ignore its outDir `build/`. That is
   a separate, unobserved question (build/ holds sidecar output written by other steps); it is
   OUT OF SCOPE for this task -- do not add `build/` to the ignore list. Mention it in the SUMMARY
   as a noted-not-actioned observation only.
3. `src-tauri/` contains `binaries capabilities Cargo.* build.rs entitlements.plist gen icons src
   target tauri*.conf.json`. Only `target/` is cargo output. Ignore `target/` ONLY -- the todo's
   "probably src-tauri/**" suggestion is declined because it is unnecessary for the fix and a
   broader ignore is a wider blast radius than the defect justifies.
4. `vite.config.ts` has `root: '.'` and a `server` block with only `port`/`strictPort`; there is
   no `server.watch` anywhere today.
5. The todo's pointer to `vite.config.ts:148` is a red herring: that comment (inside the
   260922-hjb `pruneUnofferedLocalesPlugin` rationale) is about `tauri.conf.json`'s
   `../build/locales/` bundle-resource mapping, not the watcher. No existing ignore list covers
   `src-tauri/target`. State this in the SUMMARY.
6. jest runs `meta/` as a project (`jest.config.js` `projects`); the test file resolves the
   exported config callback under both `mode: 'production'` and `mode: 'development'`.
</facts_established_by_planner>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add server.watch.ignored for src-tauri/target and pin it</name>
  <files>vite.config.ts, meta/__tests__/viteRendererConfig.test.ts</files>
  <behavior>
    - In BOTH modes (inside the existing `describe.each(['production','development'])` block, next
      to the "serves the dev server on the port..." case): `config.server?.watch?.ignored` is an
      array that contains exactly the string `'**/src-tauri/target/**'`.
    - Same case: no entry in that array is a whole-`src-tauri` ignore (assert no entry matches
      `/src-tauri\/\*\*$/` or equals `'**/src-tauri/**'`), so a future widening is a deliberate
      test edit, not a drive-by.
    - Same case: the array does NOT restate Vite's defaults (no `'**/node_modules/**'`, no
      `'**/.git/**'`) -- documents fact 1 that Vite 6.3.5 appends user entries.
    - In the existing `source-text guards` describe: the config source contains `'260924-vat'`
      and contains `'EBUSY'`, so the rationale comment cannot be silently deleted.
    - Update the test file's header "WHAT THIS CATCHES" list with a 6th item describing the
      Windows EBUSY watcher crash, in the file's existing prose style.
  </behavior>
  <action>
    RED first: add the test cases above to `meta/__tests__/viteRendererConfig.test.ts` and run the
    file; the new cases must fail (no `server.watch` exists yet). Then GREEN: in `vite.config.ts`,
    add a `watch: { ignored: ['**/src-tauri/target/**'] }` key inside the existing `server` block,
    after `strictPort: true`. Above it add a `//` comment in the config's existing style, tagged
    "Quick task 260924-vat", covering: root is '.', so without this chokidar walks cargo's
    `src-tauri/target` (tens of thousands of files); on Windows `fs.watch` on an exe the linker
    holds open throws EBUSY, Vite does not handle that FSWatcher error (`ignorePermissionErrors`
    does not cover EBUSY), and `beforeDevCommand` dies mid cold build; Vite 6 APPENDS this list to
    its own defaults (.git/node_modules/test-results/cacheDir), so do not restate them; only
    `target/` is ignored because it is the only cargo output under src-tauri -- do not widen to
    `src-tauri/**`. Also append one line to the header block's list only if it fits naturally;
    otherwise the inline comment is sufficient. Do not touch any other key, plugin, or comment.
    `tsc` does not check vite.config.ts (tsconfig excludes it), so the jest run is the type gate.
  </action>
  <verify>
    <automated>cd C:/Users/grays/Projects/GameLib && npx jest meta/__tests__/viteRendererConfig.test.ts && npx prettier --check vite.config.ts meta/__tests__/viteRendererConfig.test.ts && pnpm lint</automated>
  </verify>
  <done>New cases failed before the config edit and pass after; whole test file green in both modes; prettier clean on both exact paths; lint ceilings PASS.</done>
</task>

<task type="auto">
  <name>Task 2: Close the todo with an operator live-verify follow-up</name>
  <files>.planning/todos/pending/2026-09-24-tauri-dev-on-windows-crashes-on-vite-ebusy-watching-src-tauri-target.md, .planning/todos/completed/2026-09-24-tauri-dev-on-windows-crashes-on-vite-ebusy-watching-src-tauri-target.md</files>
  <action>
    `git mv` the todo from `.planning/todos/pending/` to `.planning/todos/completed/` (same
    filename). In its frontmatter add `status: RESOLVED` directly after `ready:` (matching prior
    closed todos such as the Steam facet-row one in completed/), and add `vite.config.ts`'s
    companion `meta/__tests__/viteRendererConfig.test.ts` to `files:`. Append a `## Resolution
    (quick-260924-vat)` section stating: the fix (`server.watch.ignored: ['**/src-tauri/target/**']`),
    the Vite 6.3.5 append-not-replace fact with its file/line, that `vite.config.ts:148` was a red
    herring (it concerns tauri.conf.json's `../build/locales/` resource mapping, not the watcher),
    that `src-tauri/**` was deliberately NOT ignored and why, the regression pin's location, and
    an explicit "What is NOT proven" note: the live gate -- `cargo clean -p gamelib_shell` then a
    cold `pnpm tauri:dev` on the operator's Windows machine reaching the app window without an
    EBUSY -- was not run by the executor and is an operator follow-up. Keep existing body text
    intact. Do not create a new pending todo for the follow-up.
  </action>
  <verify>
    <automated>cd C:/Users/grays/Projects/GameLib && test ! -e .planning/todos/pending/2026-09-24-tauri-dev-on-windows-crashes-on-vite-ebusy-watching-src-tauri-target.md && grep -q '^status: RESOLVED' .planning/todos/completed/2026-09-24-tauri-dev-on-windows-crashes-on-vite-ebusy-watching-src-tauri-target.md && npx prettier --check .planning/todos/completed/2026-09-24-tauri-dev-on-windows-crashes-on-vite-ebusy-watching-src-tauri-target.md && pnpm planning-gates</automated>
  </verify>
  <done>Todo exists only under completed/ with status RESOLVED and a Resolution section naming the unrun live gate; prettier clean; planning-gates pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none new | Dev-server watcher config only; no runtime, network, or shipped-bundle surface changes |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-vat-01 | Denial of Service | vite dev server watcher | mitigate | Ignoring `**/src-tauri/target/**` removes the EBUSY path that kills the dev server; pinned by jest |
| T-vat-02 | Tampering (config drift) | server.watch.ignored | mitigate | Test asserts defaults are not restated and src-tauri is not wholesale-ignored, so a widening/replacement is a deliberate test edit |
</threat_model>

<verification>
- `npx jest meta/__tests__/viteRendererConfig.test.ts` green.
- `npx prettier --check` clean over every written path.
- `pnpm lint` and `pnpm planning-gates` pass.
- Operator follow-up (NOT a gate): on Windows, `cargo clean -p gamelib_shell` (in src-tauri) then
  cold `pnpm tauri:dev` completes without `EBUSY ... watch ... gamelib_shell.exe`.
</verification>

<success_criteria>
- `vite.config.ts` `server.watch.ignored` is `['**/src-tauri/target/**']` with a 260924-vat comment.
- Regression pin + source-text guard exist and pass.
- Todo closed in completed/ with the live gate recorded as not run.
- SUMMARY records the :148 red herring and the noted-not-actioned `build/` observation.
</success_criteria>

<output>
Create `.planning/quick/260924-vat-ignore-src-tauri-target-in-vite-watcher-/260924-vat-SUMMARY.md` when done
</output>
