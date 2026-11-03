---
phase: quick-261103-wjs
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/__tests__/cargoFeatures.test.ts
  - meta/i18nCatalogPresenceBaseline.json
  - meta/i18nForkTouchedFiles.json
  - meta/i18nGateScope.json
  - meta/__tests__/genI18nGateScope.test.ts
  - src/backend/storeManagers/steam/clientSetup.ts
  - meta/buildSteamBridgeShims.ts
  - src/frontend/helpers/__tests__/steamInstallOptionsEntry.test.ts
  - src/frontend/components/UI/NavShell/__tests__/appShellLayout.test.ts
  - src/backend/sidecar/__tests__/steamFlows.test.ts
  - src/backend/sidecar/__tests__/skeletonFlows.test.ts
  - src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts
autonomous: true
requirements: [TODO-2026-11-03-jest-failures]

must_haves:
  truths:
    - "A full `npx jest` run on main is green (0 failed suites)"
    - "The Cargo.lock pin accepts exactly the 9 gilrs crates and nothing else"
    - "The i18n presence baseline records the untranslated gamelib keys as English fallback; no catalogue is translated"
    - "The 30 new fork-touched frontend files are either scanned by the hardcoded-string gate (25, zero violations) or declared debt (5, measured violations), never silently unscanned"
    - "The Windows/macOS Steam installer stderr log carries a per-site log-secret-gate exemption naming the command, so logSecretGate reports zero violations without the gate being changed"
    - "buildLsteamclient is still unreachable from the shim build and CI; the gate is unchanged"
    - "The sidecar Steam launch suites no longer spawn a real `/usr/bin/open -g steam://rungameid/...` on a Mac host"
  artifacts:
    - path: "src/backend/__tests__/cargoFeatures.test.ts"
      provides: "EXPECTED_LOCKFILE_CRATE_NAMES including the gilrs crates"
      contains: "\"gilrs-core\""
    - path: "meta/i18nGateScope.json"
      provides: "scope widened by 25 audited zero-violation files"
      contains: "src/frontend/components/UI/FieldLabel/index.tsx"
    - path: "src/backend/storeManagers/steam/clientSetup.ts"
      provides: "exempted installer-launch stderr log"
      contains: "log-secret-gate-exempt:"
  key_links:
    - from: "src/backend/sidecar/__tests__/steamFlows.test.ts"
      to: "src/backend/platform/openDetached.ts shouldOpenInBackground"
      via: "process.platform pinned to linux for the suite"
      pattern: "defineProperty\\(process, 'platform'"
    - from: "src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts"
      to: "backend/macArch/recovery"
      via: "jest.mock factory"
      pattern: "jest.mock\\('backend/macArch/recovery'"
---

<objective>
Make the ten jest suites that fail on main green, fixing each on its own merits: data pins that
legitimately drifted are regenerated, gates whose target code moved are re-pointed with their
intent intact, code that regressed against a gate is fixed, and test seams that a later commit
outflanked are re-closed. No gate is loosened.

Purpose: unblock phase 59 round 6 with a trustworthy full-suite green.
Source: .planning/todos/pending/2026-11-03-fix-ten-pre-existing-jest-failures.md
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/todos/pending/2026-11-03-fix-ten-pre-existing-jest-failures.md
@./CLAUDE.md

Diagnosis (measured by the planner on 2026-11-03, darwin host; every row reproduced):

| Suite | Root cause | Verdict |
| --- | --- | --- |
| cargoFeatures | Cargo.lock "Appeared: cfg_aliases, gilrs, gilrs-core, inotify, inotify-sys, libudev-sys, nix, objc2-io-kit, vec_map / Disappeared: (none)" — from `70f7022af` | data drift; operator accepted |
| lintTranslations (REQ-41-02 + R13) | 3,984 locale/key pairs not localised and not in `meta/i18nCatalogPresenceBaseline.json` | data drift; operator chose baseline regen |
| genI18nGateScope A-17 | The LIVE derivation has 30 MORE fork-touched files than the committed `meta/i18nForkTouchedFiles.json` (the todo's "30 fewer" is inverted). Regenerating alone then fails the A-03 ratchet (30 new unscanned files) and A0/A2/A3/A4 (pinned 246/293 counts) | data drift; follow the in-file precedent (audit, promote or declare debt) |
| logSecretGate (2 tests) | `clientSetup.ts:280` logs PowerShell `Start-Process -Verb RunAs` / macOS `open` stderr unreduced (`3f0df053c`). The non-vacuity test fails only because the ratchet is not at zero | code regression; fix the call site |
| buildLsteamclient source gate | `meta/buildSteamBridgeShims.ts:613` gained a doc comment naming `meta/buildLsteamclient.ts` (`1b476b39d`, phase 60-01). No import, no call — but the gate is a substring gate by design | code drift; reword the comment, gate unchanged |
| steamInstallOptionsEntry C3 | `e704b397e` (quick 261029-ocq, D-UAT-12) legitimately moved the label into `const installLabel = isSteamIncomplete ? tGamelib(...) : t('button.install')`; the entry is now `label: installLabel` with the same `show:` predicate | code moved legitimately; re-point gate |
| appShellLayout (GamesList) | `40f8efd82` legitimately extracted the focus-scroll handler into `GamesList/scrollCardIntoView.ts`, which resolves `document.querySelector<HTMLElement>('main.content') ?? document.body` at call time; `index.tsx` now only wires the listener | code moved legitimately; re-point gate |
| steamFlows Test C, skeletonFlows Test 2 | Both suites pin `backend/constants/environment` to `isMac:false`, but `721c2fa01` (quick 261029-thl) made `shell.openExternal` in `src/backend/platform/index.ts` branch on the RAW `process.platform` via `shouldOpenInBackground(process.platform, url, options)`. On a darwin host a `steam:` URL with `{activate:false}` takes `spawnOpenDetached` (a REAL `/usr/bin/open -g steam://rungameid/999002`) instead of `transport.openExternal`, so no `openExternal` frame is written; the launch still responds `{status:'done'}`. Passes on Linux CI, fails (and launches Steam) on every Mac run | test seam outflanked; close it |
| getDefaultLegendarySavePathRefresh | `7f9920654` (quick 261029-t39) made `legendary/library.ts` import `backend/macArch/recovery` → `macArch/electronStores` → `constants/paths`, which evaluates `app.getAppPath()` and constructs a `TypeCheckedStoreBackend` at load. Adding `getAppPath` alone was tried: the suite then fails at `macArch/electronStores.ts:12` (store construction) | legitimate new transitive import; mock the irrelevant module |

<interfaces>
From src/backend/platform/openDetached.ts:
  export function shouldOpenInBackground(platform: NodeJS.Platform, url: string, options: unknown): boolean
  (returns false unless platform === 'darwin' AND options.activate === false AND scheme is steam)

From src/backend/platform/index.ts:736 — shell.openExternal(url, options):
  if (!transport) return; if (shouldOpenInBackground(process.platform, url, options)) { spawnOpenDetached(...); return }; transport.openExternal(url)

Precedent for pinning platform at runtime: src/backend/platform/__tests__/openExternalBackground.test.ts
  const realPlatform = process.platform; Object.defineProperty(process, 'platform', { value })

From meta/logSecretGate.ts:200 — FILE_EXEMPT_MARKER = 'log-secret-gate-exempt:' — must sit in a
comment on the line above the log call with a non-empty same-line reason naming the command.
Precedents: src/backend/utils.ts:901 ("stderr of the powershell Get-ItemProperty VCRuntime probe"),
src/backend/storeManagers/steam/bottle.ts:963 ("stderr of cxbottle create (bottle provisioning), not an auth command").

From src/backend/storeManagers/legendary/library.ts:52:
  import { recordedMacArch, scheduleMacArchSweep } from 'backend/macArch/recovery'
  (recordedMacArch('legendary', app_name) is read into `mac_arch` at :681; scheduleMacArchSweep called at :91)

Regeneration commands (from the scripts themselves):
  LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib   # writes meta/i18nCatalogPresenceBaseline.json, exits 0
  pnpm gen-i18n-gate-scope    # rewrites meta/i18nForkTouchedFiles.json only; leaves i18nGateScope.json alone without --rewrite-scope
</interfaces>

Repo hazard: `.husky/post-checkout` runs `pnpm i` + `pnpm download-helper-binaries`. To undo a
trial edit to a tracked file use `git restore <path>`, not `git checkout <path>`.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Regenerate the three drifted data pins (cargo crate set, i18n presence baseline, i18n fork-touched list and scope)</name>
  <files>src/backend/__tests__/cargoFeatures.test.ts, meta/i18nCatalogPresenceBaseline.json, meta/i18nForkTouchedFiles.json, meta/i18nGateScope.json, meta/__tests__/genI18nGateScope.test.ts</files>
  <action>
(a) cargoFeatures, per the operator decision "accept the 9 gilrs crates": insert cfg_aliases, gilrs, gilrs-core, inotify, inotify-sys, libudev-sys, nix, objc2-io-kit and vec_map into `EXPECTED_LOCKFILE_CRATE_NAMES` (cargoFeatures.test.ts:185). The test compares with `toEqual` against a sorted `Array.from(new Set(names)).sort()`, so the array must stay in that exact JS default sort order. The block is `// prettier-ignore` and laid out six quoted names per line: regenerate the whole array body machine-wise from `src-tauri/Cargo.lock` (the header comment at :161 says it was machine-generated; keep that true) using the same `^name = "..."$` extraction, sorted with JS default sort, six per line, double-quoted, two-space indent, matching the existing layout. Do NOT touch the AR-34.1-07 four-crate test. Add one sentence to the header comment at :161 noting quick 261103-wjs re-pinned after `70f7022af` (gilrs gamepad reader) added the 9 crates.

(b) lintTranslations, per the operator decision "regenerate the presence baseline; do not translate": run `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`. Do not edit any `public/locales/**` file. Confirm with `git diff --stat` that only `meta/i18nCatalogPresenceBaseline.json` changed from this step.

(c) genI18nGateScope, following the in-file precedent changelog at genI18nGateScope.test.ts:350-410 exactly:
  1. Run `pnpm gen-i18n-gate-scope` (fork-touched 293 -> 323), then restore the file's `generatedAt` value to `2026-10-29T04:10:56.267Z` as every precedent entry did.
  2. The 30 newly fork-touched files were audited by the planner with `scanScope({ extraFiles })` from meta/hardcodedStringGate.ts (audit mode, scope untouched). Re-run that audit to confirm before editing (a scratch script under the session scratchpad that imports `scanScope` by absolute path and is run with `node meta/runTs.cjs --bundle --platform=node --target=node22 <script>` works). Expected: 5 have violations — `components/UI/WindowControls/CaptionGlyphs.tsx` (3), `helpers/connectivitySync.ts` (5), `helpers/reportProblem.ts` (2), `screens/Settings/components/SteamEngineOverride.tsx` (3), `screens/Settings/components/WinePrefix.tsx` (1); the other 25 have ZERO. If the re-audit differs, use the measured split.
  3. Hand-insert the 25 zero-violation paths into `meta/i18nGateScope.json` `files` in sorted position (scope 246 -> 271), and append to its `generatedBy` prose a clause in the existing style: "then quick 261103-wjs promoted 25 files (added by phases 59/60 and quicks 261031–261103) after an audit-mode scanScope({ extraFiles }) showed 0 violations -- still NOT a pnpm gen-i18n-gate-scope run". Leave its `generatedAt` alone.
  4. Add the 5 violation files to `DECLARED_UNSCANNED_DEBT` (genI18nGateScope.test.ts:411) in sorted position — the in-file "Put in DEBT rather than SCOPE" precedent for files with measured violations. Fixing those strings is out of scope (the operator chose no translation work in this task).
  5. Update the pinned counts: A0 (:1175-1177) 246 -> 271 and 293 -> 323, A2 title (:1218) "246 -> 293" -> "271 -> 323", A3 (:1241, :1254) 293 -> 323, A4 (:1259, :1272) 293 -> 323 — test titles and expectations both. Then append a changelog paragraph after the 2026-10-31 entry (before `const DECLARED_UNSCANNED_DEBT`) in the same voice: "2026-11-03 (quick 261103-wjs): fork-touched 293 -> 323, scope 246 -> 271." naming the 25 promoted (zero violations, `scanScope({ extraFiles })`) and the 5 declared as debt with their counts, "`meta/i18nForkTouchedFiles.json` regenerated with `pnpm gen-i18n-gate-scope`, `generatedAt` restored. DECLARED_UNSCANNED_DEBT +5."
  Do not pass `--rewrite-scope`; do not edit the ratchet or anti-rot assertions.
  </action>
  <verify>
    <automated>npx jest src/backend/__tests__/cargoFeatures.test.ts meta/__tests__/lintTranslations.test.ts meta/__tests__/genI18nGateScope.test.ts meta/__tests__/hardcodedStringGate.test.ts && git diff --quiet -- public/locales && npx prettier --check src/backend/__tests__/cargoFeatures.test.ts meta/i18nCatalogPresenceBaseline.json meta/i18nForkTouchedFiles.json meta/i18nGateScope.json meta/__tests__/genI18nGateScope.test.ts</automated>
  </verify>
  <done>All four suites pass; `public/locales/` is untouched; the pin diff adds exactly the 9 crates; i18nGateScope.json has 271 files, i18nForkTouchedFiles.json 323 with the old generatedAt; the 5 debt files are named in DECLARED_UNSCANNED_DEBT; all five written paths pass prettier --check (all verified not prettier-ignored with --file-info).</done>
</task>

<task type="auto">
  <name>Task 2: Fix the two code regressions and re-point the two moved-code gates</name>
  <files>src/backend/storeManagers/steam/clientSetup.ts, meta/buildSteamBridgeShims.ts, src/frontend/helpers/__tests__/steamInstallOptionsEntry.test.ts, src/frontend/components/UI/NavShell/__tests__/appShellLayout.test.ts</files>
  <action>
(a) logSecretGate — fix the code, not the gate. At clientSetup.ts ~:277 (`if (code !== 0) { logError([ ... , stderr.trim() ], LogPrefix.Steam)`), add on the line directly above `logError(` the comment `// log-secret-gate-exempt: stderr of powershell Start-Process -Verb RunAs / open (Steam installer launch), not an auth command`. This is the gate's own sanctioned per-site path (its remediation hint names it; the identical PowerShell precedent is utils.ts:901): the only input to that command is the downloaded installer path, so the stderr is provably not a credential, and it is the one diagnostic for a cancelled UAC prompt — reducing it to a length would discard that. Do not modify meta/logSecretGate.ts or its test.

(b) buildLsteamclient — the gate (buildLsteamclient.test.ts:303) is a deliberate substring gate keeping the DRM-only build unreachable from the shim build; leave it unchanged. Reword the doc comment at buildSteamBridgeShims.ts:613-614 so it no longer contains the substring `buildLsteamclient` while keeping its meaning, e.g. "...11.0 is the first Apple-silicon macOS. The 15.0 floor in the DRM-only lsteamclient build script belongs to that build and is not a project floor." Grep afterwards: `grep -c buildLsteamclient meta/buildSteamBridgeShims.ts` must print 0.

(c) steamInstallOptionsEntry C3 — the code moved legitimately in `e704b397e` (D-UAT-12, Resume Install label). Keep C3's intent (the plain install context-menu entry still exists, still falls back to `t('button.install')`, and its `show:` predicate is untouched). Replace `expect(source).toContain("label: t('button.install')")` with two assertions on the stripped GameCard source: `toContain('label: installLabel')` and `toMatch(/const installLabel = [\s\S]*?: t\('button\.install'\)/)`. Keep the existing `show: !isInstalled && !isQueued && isInstallable && !isDelisted` assertion. Add a 2-3 line comment above citing `e704b397e` / D-UAT-12 as the reason the label is indirect.

(d) appShellLayout — the code moved legitimately in `40f8efd82` (focus-scroll handler extracted to `GamesList/scrollCardIntoView.ts`, which resolves `main.content` at call time). Keep the gate's guarded defect (a scroll listener / scrollTo on a non-overflowing `document.body`). Add a `SCROLL_CARD_INTO_VIEW_TS = join(FRONTEND_ROOT, 'screens/Library/components/GamesList/scrollCardIntoView.ts')` constant beside `GAMES_LIST_TSX` (:80) and change the per-file `it.each` (:377) to iterate `[LIBRARY_TSX, SCROLL_CARD_INTO_VIEW_TS]` for the full check set (the four `document.body` negatives plus `/main\.content/`). Then add one sibling `it` asserting GamesList/index.tsx still passes all four `document.body` negatives AND wires the helper (`toMatch(/addEventListener\(\s*'focus',\s*scrollCardIntoView/)`), so the listener site cannot regress to body scrolling unguarded. Comment both with the `40f8efd82` provenance. Leave the whole-tree gate untouched.
  </action>
  <verify>
    <automated>npx jest meta/__tests__/logSecretGate.test.ts meta/__tests__/buildLsteamclient.test.ts src/frontend/helpers/__tests__/steamInstallOptionsEntry.test.ts src/frontend/components/UI/NavShell/__tests__/appShellLayout.test.ts && test "$(grep -c buildLsteamclient meta/buildSteamBridgeShims.ts)" = 0 && git diff --quiet -- meta/logSecretGate.ts meta/__tests__/logSecretGate.test.ts meta/__tests__/buildLsteamclient.test.ts && npx prettier --check src/backend/storeManagers/steam/clientSetup.ts meta/buildSteamBridgeShims.ts src/frontend/helpers/__tests__/steamInstallOptionsEntry.test.ts src/frontend/components/UI/NavShell/__tests__/appShellLayout.test.ts</automated>
  </verify>
  <done>logSecretGate reports "found 0 violation(s)" and its non-vacuity test passes; buildLsteamclient gate passes with the gate file unchanged; C3 and the GamesList scroll gate pass while still asserting their original defects; all four written paths pass prettier --check.</done>
</task>

<task type="auto">
  <name>Task 3: Close the sidecar launch-suite platform seam and the legendary save-path mock, then run the full suite</name>
  <files>src/backend/sidecar/__tests__/steamFlows.test.ts, src/backend/sidecar/__tests__/skeletonFlows.test.ts, src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts</files>
  <action>
(a) steamFlows Test C and skeletonFlows Test 2 — real cause: since `721c2fa01`, `shell.openExternal` (src/backend/platform/index.ts:736) branches on raw `process.platform`, which these suites' `backend/constants/environment` `isMac:false` mock does not cover, so on a Mac they spawn a real detached `/usr/bin/open -g steam://rungameid/<id>` (launching Steam on the developer machine) and never write the `openExternal` frame. Do NOT change production code: the darwin background-open behaviour is correct and is separately proven by platform/__tests__/openExternalBackground.test.ts, which itself mutates `process.platform` at call time and would break if the branch moved to the import-time `isMac` constant. Instead, in each of the two suites, complete the existing "pin the native Linux branch regardless of host OS" intent: add a top-level `beforeAll` that saves `process.platform` and sets it to `'linux'` via `Object.defineProperty(process, 'platform', { value: 'linux' })`, and an `afterAll` that restores the saved value — the same idiom as openExternalBackground.test.ts:17-19. Extend the existing environment-mock comment (steamFlows.test.ts:66, skeletonFlows.test.ts:116) to say the runtime `process.platform` pin is needed because `shouldOpenInBackground` reads it at call time (`721c2fa01`), and that without it a Mac run spawns a real `open`. Leave `backend/storeManagers` and `steam/games` unmocked (the suites' stated design). No new child-process spawn is introduced, so the fake-HOME rule is not engaged; this change removes one.

(b) getDefaultLegendarySavePathRefresh — `7f9920654` made legendary/library.ts import `backend/macArch/recovery`, whose module-load chain evaluates `app.getAppPath()` and constructs a real `TypeCheckedStoreBackend`. Adding `getAppPath` to the `backend/platform` mock is NOT sufficient (measured: the suite then fails at macArch/electronStores.ts:12). The macOS-arch sweep is irrelevant to the save-path refresh this suite tests, so add a `jest.mock('backend/macArch/recovery', () => ({ recordedMacArch: jest.fn(() => undefined), scheduleMacArchSweep: jest.fn() }))` block beside the existing `../storeManagers/legendary/electronStores` mock (~:183), with a section-header comment in the file's existing `// ── ... ──` style citing `7f9920654` / quick 261029-t39. Also update the file's header mock inventory (~:93) with one line for the new mock. If the suite then fails on another missing export, add only what library.ts actually imports from that module.

(c) Run the full suite: `npx jest`. If any suite outside the ten fails, determine whether it is pre-existing on main (`git stash` is unsafe with the dirty tree — instead check it against `git show HEAD:<file>` reasoning or rerun after `git restore` of only this task's files) and report it in the SUMMARY rather than widening scope silently. After the green run, run `graphify update .` and move the source todo to `.planning/todos/completed/` (keep its frontmatter intact).
  </action>
  <verify>
    <automated>npx jest src/backend/sidecar/__tests__/steamFlows.test.ts src/backend/sidecar/__tests__/skeletonFlows.test.ts src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts src/backend/platform/__tests__/openExternalBackground.test.ts && npx jest && npx prettier --check src/backend/sidecar/__tests__/steamFlows.test.ts src/backend/sidecar/__tests__/skeletonFlows.test.ts src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts</automated>
  </verify>
  <done>Both sidecar suites see the `steam://rungameid/<id>` openExternal frame on a darwin host without spawning `open`; openExternalBackground still passes; getDefaultLegendarySavePathRefresh loads and passes; full `npx jest` reports 0 failed suites; the three written paths pass prettier --check.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| child-process output -> log file | installer-launch stderr enters the uploadable log |
| test run -> host OS | jest suites on a Mac reached the real `/usr/bin/open` |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-wjs-01 | Information disclosure | clientSetup.ts installer stderr log | mitigate | per-site `log-secret-gate-exempt:` with a reason naming the command; command input is only the installer path; gate itself unchanged and still at zero violations |
| T-wjs-02 | Tampering | Cargo.lock supply chain | accept | operator accepted the 9 gilrs crates (2026-11-03); the pin still fails on any further crate change |
| T-wjs-03 | Elevation of privilege | buildLsteamclient reachability | mitigate | gate left byte-identical; only a comment reworded |
| T-wjs-04 | Denial of service | sidecar suites spawning real `open` on dev Macs | mitigate | `process.platform` pinned to linux for the two suites, restored afterAll |
</threat_model>

<verification>
Full `npx jest` green; `git diff --stat` touches only the 12 files in files_modified plus the moved todo and graphify-out; `public/locales/`, meta/logSecretGate.ts and meta/__tests__/buildLsteamclient.test.ts unchanged.
</verification>

<success_criteria>
- The ten named suites pass on a darwin host
- Full `npx jest` reports 0 failed suites
- No gate's assertion was weakened: logSecretGate and buildLsteamclient gates are unchanged; C3 and the GamesList scroll gate still assert their original defects at the code's new location; the i18n ratchet still fails by name on any future unscanned file
</success_criteria>

<output>
Create `.planning/quick/261103-wjs-fix-the-ten-jest-suites-failing-on-main-/261103-wjs-SUMMARY.md` when done
</output>
