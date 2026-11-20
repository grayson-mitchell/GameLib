---
phase: quick-261107-brs
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - pnpm-lock.yaml
  - knip.jsonc
  - meta/knipRatchet.cjs
  - meta/knip-baseline.txt
  - meta/__tests__/knipRatchet.test.ts
  - meta/__tests__/tauriDevPreflight.test.ts
  - .github/workflows/lint.yml
  - meta/findDeadcode.cjs (deleted)
  - meta/__tests__/findDeadcode.test.ts (deleted)
  - meta/deadcode-baseline-unreachable.txt (deleted)
  - meta/deadcode-baseline-used-in-module.txt (deleted)
  - .ts-prunerc (deleted)
  - .planning/todos/pending/2026-11-06-replace-ts-prune-with-knip.md (moved to completed/)
  - "the 94 files carrying a `// ts-prune-ignore-next` directive (list: Task 3 <files>)"
autonomous: true
requirements:
  - TODO-2026-11-06-replace-ts-prune-with-knip

must_haves:
  truths:
    - "`pnpm exec knip` runs against a committed config that names the real entry points (frontend, sidecar, preload, meta tools, jest setup, package.json scripts) and prints no configuration hints"
    - "`pnpm find-deadcode` (the name lint.yml and .husky/pre-push already call) is green at HEAD and goes red when a knip finding is added or when a baselined finding disappears without its baseline line being removed"
    - "ts-prune is gone: no devDependency, no .ts-prunerc, no findDeadcode.cjs or its ledgers, and zero `// ts-prune-ignore-next` directives remain in src/ or meta/"
    - "Every former directive that knip still flags and that carried a written reason now has a JSDoc `@public` tag with that reason; every other directive is deleted"
    - "The SUMMARY records knip's measured counts (unused files, exports, types, dependencies, devDependencies, plus the other non-zero categories) before and after the directive conversion"
  artifacts:
    - path: "knip.jsonc"
      provides: "knip config: entry/project/ignore with a reason comment on every ignore"
      contains: "\"entry\""
    - path: "meta/knipRatchet.cjs"
      provides: "shrink-only identity ratchet over knip's JSON report"
      exports: ["identitiesFromReport", "parseBaseline", "evaluate"]
    - path: "meta/knip-baseline.txt"
      provides: "committed ledger of every known knip finding, one identity per line"
    - path: "meta/__tests__/knipRatchet.test.ts"
      provides: "pure-function cases plus a CLI end-to-end run"
  key_links:
    - from: "package.json scripts.find-deadcode"
      to: "meta/knipRatchet.cjs"
      via: "knip --reporter json piped into the ratchet"
      pattern: "knip --reporter json.*knipRatchet\\.cjs"
    - from: ".github/workflows/lint.yml 'Find dead code' step and .husky/pre-push"
      to: "pnpm find-deadcode"
      via: "unchanged script name"
      pattern: "pnpm find-deadcode"
---

<objective>
Replace ts-prune with knip (exact pin 6.42.1). knip reports unused files, exports and
dependencies; ts-prune only reported unused exports. Covers the todo's Solution steps 1-4:
config with real entry points, measured counts, a script and CI step held by a shrink-only
baseline, and removing ts-prune plus converting its ignore directives.

Purpose: ts-prune is unmaintained and only sees exports, and it never scanned `meta/`. knip also
finds dead files and unused dependencies across `src/` and `meta/`.

Output: knip.jsonc, meta/knipRatchet.cjs + meta/knip-baseline.txt + test, `find-deadcode` pointed
at the new ratchet, ts-prune artifacts deleted, 416 directives converted or deleted, todo moved to
completed/.

**Out of scope (the todo says so):** removing anything knip finds. Real findings go into the
baseline. Removing them is follow-up work in separate commits.

**The todo's premise is stale. Do not act on it as written:**
- The todo says "no script or CI step runs it". In fact `pnpm find-deadcode` runs
  `node meta/findDeadcode.cjs`, a two-ledger ts-prune ratchet (quick 260922-9um). It is called by
  `.github/workflows/lint.yml:29-30` ("Find dead code") and `.husky/pre-push:2`. So this task
  REPLACES a hard gate. It does not add a new one. Keep the script name `find-deadcode` so both
  callers bind with no edit.
- The todo says "70 files". Measured 2026-11-07, there are 416 directive lines in 94 files: 394
  bare and 22 with a `-- reason`. There are also about 150 prose comments that mention
  ts-prune / `pnpm find-deadcode`.
- "Warn-only ... like Phase 62's": Phase 62's ratchets (meta/clippyRatchet.cjs,
  meta/indexedAccessRatchet.cjs) hard-fail on a rise AND on a fall. The ts-prune gate being
  replaced also hard-fails. Making the step `continue-on-error` would weaken an existing gate,
  which CLAUDE.md forbids ("never widen the gate"). So "warn-only" is implemented as follows.
  knip runs with `--no-exit-code`, so its raw findings are reported and never fatal on their own.
  The ratchet hard-fails only when a finding is added or when one disappears (an equality
  ceiling). Record this reading in the SUMMARY.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/todos/pending/2026-11-06-replace-ts-prune-with-knip.md
@meta/clippyRatchet.cjs
@meta/indexedAccessRatchet.cjs
@meta/__tests__/clippyRatchet.test.ts

Load `Skill("gamelib-conventions")` before writing any verify output or spawning a child process
(its "formatter check in <verify>" and "fake-HOME" sections apply here).

Facts already measured. Do not re-derive them:
- knip 6.42.1 was published 2026-10-19 (19 days old, which meets the two-weeks rule; 6.43.0,
  published 2026-10-24, is exactly 14 days old and is excluded). Repo: github.com/webpro-nl/knip.
  Sole maintainer: webpro. About 29M downloads a week. Engines: node `^20.19.0 || >=22.12.0`
  (local node is v22.23.4). dist.integrity:
  `sha512-gKJVsiT4LJQ0lfc8uSHOCzkOY8adAXNFGarIeODZbJOkBnQRVsG3e0UZFnO4LMwjA82A5tBWX/VgoeTYcjdKiQ==`.
  Package legitimacy: VERIFIED. No human checkpoint is needed.
- `pnpm-workspace.yaml` has no `packages:` entry, so the repo is a single workspace. `relay/` is a
  separate package with its own package.json and lockfile, and it imports two `src/` exports.
- Entry points known so far:
  - `index.html` -> `/src/frontend/index.tsx` (vite input is index.html)
  - sidecar: `src/sidecar/index.ts` (the `build:sidecar` esbuild entry)
  - `src/preload/` (has its own `jest.config.js`)
  - `meta/*` tools invoked from package.json scripts. Many are `node meta/runTs.cjs ... meta/X.ts`,
    and knip's script parser will NOT see the `.ts` argument after `runTs.cjs`.
  - meta files named in `.github/workflows/*` and `src-tauri/*.json`
  - `scripts/*.cjs`
  - jest: root `jest.config.js` with projects (one is `Meta`)
  - `.ts-prunerc` ignored `src/common/typedefs`
- `/build` is gitignored. `eslint.config.mjs` ignores every `.cjs`, so `.cjs` files must be kept
  prettier-clean by hand.
- The precedent for a `.cjs` runner plus its jest test (pure cases plus a CLI end-to-end run using
  `createFakeHomeProfile()`) is `meta/clippyRatchet.cjs` + `meta/__tests__/clippyRatchet.test.ts`.
  Mirror that pair.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add knip 6.42.1 with a real-entry-point config and measure the raw counts</name>
  <files>package.json, pnpm-lock.yaml, knip.jsonc</files>
  <action>
1. Run `pnpm add -D -E knip@6.42.1`. package.json must read exactly `"knip": "6.42.1"`, with no
   caret. Confirm the lockfile's integrity for knip equals the sha512 in the context block.
2. Write `knip.jsonc` at the repo root, with `$schema` pointing at
   `https://unpkg.com/knip@6/schema-jsonc.json`.
   - `entry` must name the real entry points: `src/frontend/index.tsx`, `src/sidecar/index.ts`,
     and the preload entry or entries (read `src/preload/` and `src-tauri/` to find which file
     Tauri injects). Add every `meta/*.{ts,cjs,mjs}` file that is actually invoked: grep the
     package.json scripts (including the argument after `meta/runTs.cjs`), `.github/workflows/*`,
     `.github/actions/**`, `.husky/*` and `src-tauri/*.json` for `meta/` paths, and list each
     invoked file explicitly. Do NOT use a blanket `meta/*` entry glob: it would hide every
     uninvoked meta tool, and those are exactly the dead files knip should report. Also add
     `scripts/*.cjs` and any worker entry built by `meta/esbuildWorkerBundleShared.ts` /
     `build:decompress-worker-dev`.
   - `project`: `src/**/*.{ts,tsx}`, `meta/**/*.{ts,cjs,mjs}`, `scripts/**/*.cjs`.
   - `ignore`: `src/common/typedefs/**`, carried over from `.ts-prunerc`.
   - `ignore` also covers out-of-workspace trees: `relay/**` (a separate package, not a pnpm
     workspace member), `spike/**`, `native/**`, `src-tauri/**`, `build/**`, `graphify-out/**`,
     `.planning/**`, `.claude/**`.
   - Rely on knip's built-in jest and vite plugins for the jest setup files and vite config. Read
     `jest.config.js` and `src/preload/jest.config.js` and confirm with `pnpm exec knip --debug`
     that their setup files resolve as entries. If a plugin misses one, add it to `entry`
     explicitly.
   - Leave `ignoreExportsUsedInFile` at its default (false). That keeps the population ts-prune
     called "used in module".
   - Write a `//` comment above every `ignore`, `ignoreDependencies`, `ignoreBinaries` or extra
     `entry` line saying where the thing is really used.
3. Run `pnpm exec knip --no-exit-code`. Fix configuration problems only: unresolved entries,
   configuration hints, and plugin false positives where you can name the consumer, such as a
   dependency loaded by a native or Rust path or a binary used in a workflow. A config change is
   allowed only for a demonstrated false positive, and it must carry its reason comment. Never add
   an ignore to make a real finding go away. Iterate until knip prints zero configuration hints
   and zero unresolved imports that are config errors.
4. Before touching any directive, run
   `pnpm exec knip --no-exit-code --reporter json > <scratchpad>/knip-raw.json`. Record counts
   per issue type (files, exports, types, dependencies, devDependencies, unlisted, unresolved,
   binaries, enumMembers, classMembers, duplicates) in `<scratchpad>/knip-counts.md` for the
   SUMMARY. Also read knip's JSON reporter source under `node_modules/knip/dist/reporters/` and
   write down the exact report shape (top-level keys, per-issue keys, whether paths are relative
   or absolute) in the same file. Task 2 builds against that shape.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && node -e "const p=require('./package.json');if(p.devDependencies.knip!=='6.42.1')process.exit(1)" && pnpm exec knip --version | grep -qx '6.42.1' && pnpm exec knip --no-exit-code --reporter compact > /dev/null && npx prettier --file-info knip.jsonc package.json pnpm-lock.yaml && npx prettier --check knip.jsonc package.json</automated>
    Prettier note: run `--file-info` on pnpm-lock.yaml. If it reports `"ignored": true`, leave it
    out of `--check` (a check over an ignored path proves nothing). If it reports
    `"ignored": false`, add it to the `--check` list.
  </verify>
  <done>knip 6.42.1 is exactly pinned. knip.jsonc names real entry points with a reason on every
ignore. knip runs with zero configuration hints. Raw counts and the JSON report shape are
recorded in the scratchpad.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Build the knip shrink-only ratchet, point find-deadcode at it, delete the ts-prune gate</name>
  <files>meta/knipRatchet.cjs, meta/__tests__/knipRatchet.test.ts, meta/knip-baseline.txt, package.json, .github/workflows/lint.yml, meta/__tests__/tauriDevPreflight.test.ts, meta/findDeadcode.cjs, meta/__tests__/findDeadcode.test.ts, meta/deadcode-baseline-unreachable.txt, meta/deadcode-baseline-used-in-module.txt, .ts-prunerc</files>
  <behavior>
    - identitiesFromReport(json) maps each finding to a stable, line-number-free identity
      `type<TAB>repo-relative-posix-path<TAB>symbol`:
      - an unused file uses symbol `-`
      - a dependency uses path `package.json` and the package name
      - class and enum members use `Parent.member`
      - a duplicates group uses its sorted names joined with `,`
      - backslash paths are normalised to `/`
      - absolute paths under the repo root are made relative
    - parseBaseline(text) ignores blank lines and lines starting with `#`, and rejects duplicate
      identities.
    - evaluate(baseline, current) returns a failure:
      - for each identity in current but not in baseline ("new knip finding")
      - for each identity in baseline but not in current ("remove this line from
        meta/knip-baseline.txt in this commit")
      - otherwise it passes
    - CLI: reads the report from stdin. Empty input, unparseable JSON, or a report with no `issues`
      array exits 1 with a message: an empty or broken report must never read as zero findings.
      A clean match exits 0 and prints counts per type.
  </behavior>
  <action>
RED first: write `meta/__tests__/knipRatchet.test.ts`, mirroring
`meta/__tests__/clippyRatchet.test.ts`.
- Use a `require('../knipRatchet.cjs')` with the same eslint-disable bracket.
- Add pure cases for every bullet in <behavior>, using a synthetic report in the exact shape
  recorded in Task 1.
- Add CLI end-to-end cases that spawn `process.execPath meta/knipRatchet.cjs --baseline <tmp>` with
  the report on stdin:
  - matching report: exit 0
  - an extra finding: exit 1
  - a missing finding: exit 1
  - empty stdin: exit 1
- Spawn under `createFakeHomeProfile()` exactly as clippyRatchet.test.ts does. This follows the
  fake-HOME rule; never write a hand-rolled env literal.
- Run the test and confirm it fails.

GREEN: write `meta/knipRatchet.cjs`.
- Plain CommonJS, `node:` builtins only. No child process: the report arrives on stdin, so the
  fake-HOME rule has nothing to govern.
- Export `identitiesFromReport`, `parseBaseline` and `evaluate`.
- Default baseline path is `meta/knip-baseline.txt`. `--baseline <path>` overrides it.
- No `--update` flag, so that baseline numbers move by hand, same as both Phase 62 ratchets. The
  header comment says so and explains the warn-only reading from <objective>.
- The header also records the knip report shape from Task 1, and states that knip's own exit code
  is suppressed by `--no-exit-code` and that the ratchet is the gate.

Generate the initial `meta/knip-baseline.txt` with a one-off scratchpad script, not a runner
flag. Feed it the Task 1 report through `identitiesFromReport`, sort the output, and put a short
`#` header first that explains the format and the hand-edit-only rule.

Wire it up in package.json:
- Set `"find-deadcode"` to `knip --reporter json --no-exit-code | node meta/knipRatchet.cjs`. Keep
  the name: lint.yml:30 and .husky/pre-push:2 call it.
- Add `"knip": "knip"` for a human-readable run.
- Remove the `ts-prune` devDependency with `pnpm remove ts-prune`.

In `.github/workflows/lint.yml`, add a comment above the existing "Find dead code" step. It must
say the step is now the knip identity ratchet (quick 261107-brs), that it fails on a new finding
and on a vanished one, and that you lower meta/knip-baseline.txt in the same commit that removes
dead code. The step's `run:` line stays the same.

Delete:
- `meta/findDeadcode.cjs`
- `meta/__tests__/findDeadcode.test.ts`
- both `meta/deadcode-baseline-*.txt` files
- `.ts-prunerc`

Update `meta/__tests__/tauriDevPreflight.test.ts:17-18` so its "same precedent as
findDeadcode.test.ts" pointer names `meta/__tests__/knipRatchet.test.ts` instead.

Leave every other historical prose mention of ts-prune / `pnpm find-deadcode` in src/ and meta/
alone. They describe why past un-exports happened, and `pnpm find-deadcode` still exists.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm jest --selectProjects Meta --runTestsByPath meta/__tests__/knipRatchet.test.ts meta/__tests__/tauriDevPreflight.test.ts && pnpm find-deadcode && test ! -e meta/findDeadcode.cjs && test ! -e .ts-prunerc && ! grep -q '"ts-prune"' package.json && pnpm codecheck && npx prettier --file-info .github/workflows/lint.yml meta/knip-baseline.txt && npx prettier --check meta/knipRatchet.cjs meta/__tests__/knipRatchet.test.ts meta/__tests__/tauriDevPreflight.test.ts package.json</automated>
    Prettier note: add `.github/workflows/lint.yml` to `--check` if `--file-info` reports
    `"ignored": false`. `meta/knip-baseline.txt` has no inferred parser (`"inferredParser": null`),
    so prettier cannot check it. Leave it out and keep it sorted by hand.
    Negative check (proves the ratchet bites): append a fake identity line to the baseline,
    confirm `pnpm find-deadcode` exits 1, then restore the file.
  </verify>
  <done>`pnpm find-deadcode` runs knip through the ratchet and is green at HEAD. The test suite
proves the ratchet fails on a new finding, on a vanished finding and on an empty report. ts-prune,
its runner, test, ledgers and rc file are gone. lint.yml and pre-push still bind with no change to
their run lines.</done>
</task>

<task type="auto">
  <name>Task 3: Convert or delete all 416 ts-prune-ignore-next directives, re-baseline, close the todo</name>
  <files>meta/buildDrmNativeParts.ts, meta/buildLsteamclient.ts, meta/buildRunnersOnedir.ts, meta/buildSidecarSea.ts, meta/buildSteamBridgeShims.ts, meta/buildSteamClientLayerArchive.ts, meta/downloadHelperBinaries.ts, meta/esbuildWorkerBundleShared.ts, meta/msvcCallbackLayout.ts, meta/releaseTags.ts, src/backend/jest.setupContainment.ts, src/backend/knownFixes.ts, src/backend/recent_games/recent_games.ts, src/backend/sidecar/bootstrap.ts, src/backend/signInProbe/__tests__/fakeFlagStore.ts, src/backend/signInProbe/classify.ts, src/backend/storeManagers/steam/anonymousClient.ts, src/backend/storeManagers/steam/bottle.ts, src/backend/storeManagers/steam/bottleLaunchSignals.ts, src/backend/storeManagers/steam/bridge/bridgeScan.ts, src/backend/storeManagers/steam/bridge/drm/drmLaunchSetup.ts, src/backend/storeManagers/steam/bridge/drm/drmPaths.ts, src/backend/storeManagers/steam/bridge/drm/drmTrace.ts, src/backend/storeManagers/steam/bridge/drm/ntdllPatch.ts, src/backend/storeManagers/steam/bridge/drm/ntdllPatchTable.ts, src/backend/storeManagers/steam/bridge/drm/runnerClone.ts, src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts, src/backend/storeManagers/steam/bridge/drm/steamclientLayerInstall.ts, src/backend/storeManagers/steam/bridge/drm/steamclientLayerMode.ts, src/backend/storeManagers/steam/bridge/drm/valveClient.ts, src/backend/storeManagers/steam/bridge/gameMakerRunner.ts, src/backend/storeManagers/steam/bridge/importParse.ts, src/backend/storeManagers/steam/bridge/launchTarget.ts, src/backend/storeManagers/steam/bridge/overlay/overlayAttachWatch.ts, src/backend/storeManagers/steam/bridge/overlay/overlayLaunch.ts, src/backend/storeManagers/steam/bridge/overlay/overlayNotice.ts, src/backend/storeManagers/steam/bridge/overlay/overlayPaths.ts, src/backend/storeManagers/steam/bridge/overlay/overlayPolicy.ts, src/backend/storeManagers/steam/bridge/overlay/overlayRunnerClone.ts, src/backend/storeManagers/steam/bridge/overlay/overlayWineLog.ts, src/backend/storeManagers/steam/bridge/peSteamDrm.ts, src/backend/storeManagers/steam/engine/engineDecision.ts, src/backend/storeManagers/steam/engine/engineRegistry.ts, src/backend/storeManagers/steam/engine/engineState.ts, src/backend/storeManagers/steam/engine/launchDeadline.ts, src/backend/storeManagers/steam/engine/testedCrossoverVersions.ts, src/backend/storeManagers/steam/gameDrmLaunch.ts, src/backend/storeManagers/steam/macSteamOffline.ts, src/backend/storeManagers/steam/steamClientProcess.ts, src/backend/storeManagers/steam/steamDownloadProgress.ts, src/backend/storeManagers/steam/stores.ts, src/backend/storeManagers/steam/titleSettings.ts, src/backend/store_backend.ts, src/backend/testUtils/fakeHomeProfile.ts, src/backend/utils.ts, src/common/knownFixReport.ts, src/common/steamclientLayerCatalogue.ts, src/common/storeCapabilities.ts, src/common/types/ipc/appShell.ts, src/common/types/ipc/clipboard.ts, src/common/types/ipc/dialog.ts, src/common/types/ipc/downloadQueue.ts, src/common/types/ipc/enrichment.ts, src/common/types/ipc/eosOverlay.ts, src/common/types/ipc/gameDetails.ts, src/common/types/ipc/gog.ts, src/common/types/ipc/humble.ts, src/common/types/ipc/humbleLogin.ts, src/common/types/ipc/index.ts, src/common/types/ipc/install.ts, src/common/types/ipc/legendary.ts, src/common/types/ipc/logger.ts, src/common/types/ipc/mainProcess.ts, src/common/types/ipc/oauthLogin.ts, src/common/types/ipc/runnerAuth.ts, src/common/types/ipc/runnerMisc.ts, src/common/types/ipc/settings.ts, src/common/types/ipc/shellFiles.ts, src/common/types/ipc/shortcuts.ts, src/common/types/ipc/steam.ts, src/common/types/ipc/steamAuth.ts, src/common/types/ipc/storeEmbed.ts, src/common/types/ipc/testStubs.ts, src/common/types/ipc/window.ts, src/common/types/ipc/wineTools.ts, src/common/types/sidecarTransport.ts, src/frontend/components/UI/NoticeStack/noticeSlot.tsx, src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx, src/frontend/helpers/signInInputs.ts, src/frontend/screens/Library/librarySignInRows.ts, src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/treeHarness.ts, src/frontend/screens/WebView/storeEmbedOrigins.ts, src/frontend/state/GlobalState.tsx, src/frontend/state/SteamBridgeRouteNotice.ts, meta/knip-baseline.txt, .planning/todos/pending/2026-11-06-replace-ts-prune-with-knip.md</files>
  <action>
knip does not read `ts-prune-ignore-next`. The comments have no effect on its findings, so
deleting a comment never changes a knip result. Only adding `@public` does.

1. Inventory the directives with a scratchpad script into `<scratchpad>/directives.tsv`. A
   directive is a line matching `^\s*// ts-prune-ignore-next`; prose mentions inside other
   comments do not count. For each directive record: file, line, the exported name or names on the
   next declaration, and the `-- reason` text if present. Expect 416 rows: 394 bare and 22 with a
   reason. If the count differs, stop and report the real number instead of proceeding on 416.
2. Classify each row against the Task 2 knip findings (exports, types, enumMembers):
   - (a) knip does not flag the symbol: delete the directive line. Most "exported for tests" cases
     land here, because knip's jest plugin counts test imports as use.
   - (b) knip flags it and the directive had a `-- reason`: replace the directive with a JSDoc
     `@public` tag that carries the reason verbatim, with "ts-prune" rewritten as "knip" where the
     reason names the tool. If a JSDoc block already sits directly above the declaration, add the
     `@public` line to that block rather than creating a second one. The two relay-consumed
     exports (`imported by relay/src/...`) and the meta/bridgeCensus.ts one belong here.
     First confirm on one site that `pnpm exec knip` stops reporting a `@public`-tagged export in
     6.42.1. If it does not, use a per-symbol `ignore`-style entry in knip.jsonc with the reason
     instead, and note the switch in the SUMMARY.
   - (c) knip flags it and the directive is bare: look for a stated reason in the comment block
     directly above (for example "consumed by X"). If you find one, treat the row as (b) and quote
     that reason. If there is none, delete the directive and leave the finding in
     meta/knip-baseline.txt. An exemption with no written reason is unexplained debt. The
     shrink-only baseline is where knip findings are tracked, and removing them is follow-up work
     per the todo. Do NOT tag it `@public` with a made-up reason.
3. Apply the edits with the scratchpad script for (a) and (c)-delete, and by hand for (b). Then
   regenerate the identity set and remove from meta/knip-baseline.txt exactly the lines for the
   symbols now tagged `@public`. The equality ratchet fails until you do. Never add a line in this
   task.
4. Confirm that `grep -rnE '^\s*// ts-prune-ignore-next' src meta` returns nothing. Record the
   counts in the scratchpad for the SUMMARY: (a) deleted / (b) converted / (c) deleted-to-baseline
   / (c) promoted. Also record the final knip counts per type next to the Task 1 raw counts.
5. Move `.planning/todos/pending/2026-11-06-replace-ts-prune-with-knip.md` to
   `.planning/todos/completed/` with `git mv`. Run `graphify update .`.

The SUMMARY must include:
- the raw and final knip counts per issue type (at minimum unused files, exports, types,
  dependencies and devDependencies)
- the directive disposition counts
- the "warn-only" reading
- the corrected premise: find-deadcode was wired in lint.yml and pre-push, and there were 416
  directives in 94 files, not 70
- a pointer that clearing the baselined findings is follow-up work
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test -z "$(grep -rnE '^\s*// ts-prune-ignore-next' src meta)" && pnpm find-deadcode && pnpm codecheck && pnpm lint && test -e .planning/todos/completed/2026-11-06-replace-ts-prune-with-knip.md && test ! -e .planning/todos/pending/2026-11-06-replace-ts-prune-with-knip.md && pnpm planning-gates && git diff --name-only HEAD -- src meta | grep -E '\.(ts|tsx|cjs)$' | xargs npx prettier --check</automated>
    Run this verify BEFORE committing Task 3. `git diff --name-only HEAD` lists the uncommitted edits, so after a commit it is empty and the check would match nothing. If you have already committed, use `git diff --name-only HEAD~1 -- src meta` instead.
    Prettier note: every src/ and meta/ path this task edits is prettier-visible (`"ignored": false`
    per the conventions skill), so the `--check` covers all of them. The moved todo is under
    `.planning`, which is prettier-ignored, so it is not checked. `meta/knip-baseline.txt` has no
    parser and is not checked.
    Also run the jest projects that own the touched test-adjacent files:
    `pnpm jest --runTestsByPath src/frontend/screens/Settings/sections/WinetricksSettings src/backend/signInProbe`.
  </verify>
  <done>Zero ts-prune directives remain. Every flagged exemption that had a reason is now
`@public` with that reason. Unexplained ones are tracked in the baseline. `pnpm find-deadcode`,
codecheck, lint and planning-gates all pass. The todo is in completed/. Measured counts are ready
for the SUMMARY.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| npm registry -> devDependencies | a new third-party package executes in CI and on pre-push |
| committed baseline/config -> CI gate | an edit to knip.jsonc or the baseline can silently admit dead code |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-brs-SC | Tampering | `pnpm add knip` | mitigate | Exact pin 6.42.1 (19 days old, which meets the two-week rule); registry identity verified at plan time (webpro-nl/knip, about 29M weekly downloads); Task 1 checks the lockfile integrity against the sha512 recorded in the plan |
| T-brs-01 | Tampering | meta/knipRatchet.cjs | mitigate | No `--update` flag; an empty or unparseable report exits 1; equality comparison fails on a vanished finding, so the baseline holds no slack |
| T-brs-02 | Repudiation | knip.jsonc ignores | mitigate | Every ignore, ignoreDependencies or extra entry carries a `//` reason naming the real consumer; the Task 1 rule bans config changes that hide real findings |
| T-brs-03 | Elevation | weakening the replaced hard gate | mitigate | The step stays hard-failing on ratchet drift; `continue-on-error` is not used; script name unchanged so lint.yml and pre-push keep binding |
</threat_model>

<verification>
- `pnpm find-deadcode` exits 0 at HEAD, and exits 1 when a fake identity is appended to the
  baseline (Task 2 negative check).
- `pnpm jest --selectProjects Meta --runTestsByPath meta/__tests__/knipRatchet.test.ts` passes.
- `pnpm codecheck`, `pnpm lint` and `pnpm planning-gates` pass.
- No `ts-prune` remains in package.json, no `.ts-prunerc`, and zero directives in src/ or meta/.
</verification>

<success_criteria>
- knip 6.42.1 is exactly pinned, with a config that names real entry points and prints no
  configuration hints.
- The find-deadcode gate now runs knip through a shrink-only identity ratchet. It is green at HEAD
  and red on drift in either direction.
- ts-prune and its whole gate apparatus are removed. All 416 directives are deleted or converted
  to `@public` with their reasons.
- The SUMMARY has the raw and final counts for unused files, exports, types, dependencies and
  devDependencies, plus the directive disposition counts.
- The todo is moved to `.planning/todos/completed/`.
</success_criteria>

<output>
Create `.planning/quick/261107-brs-replace-ts-prune-with-knip-for-unused-ex/261107-brs-SUMMARY.md` when done.
</output>
