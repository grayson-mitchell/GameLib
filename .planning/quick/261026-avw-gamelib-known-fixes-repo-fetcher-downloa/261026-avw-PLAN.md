---
phase: quick-261026-avw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/knownFixesFetcher.ts
  - src/backend/__tests__/knownFixesFetcher.test.ts
  - src/backend/downloadmanager/utils.ts
  - src/backend/downloadmanager/__tests__/utils.test.ts
  - src/backend/utils/uninstaller.ts
  - src/backend/utils/__tests__/uninstaller.test.ts
  - .planning/quick/261026-avw-gamelib-known-fixes-repo-fetcher-downloa/known-fixes-README.md
  - .planning/todos/pending/2026-10-24-gamelib-own-known-fixes-repo-for-steam-and-complex-fixes.md
  - .planning/todos/completed/2026-10-24-gamelib-own-known-fixes-repo-for-steam-and-complex-fixes.md
autonomous: true
requirements:
  - TODO-2026-10-24-gamelib-own-known-fixes-repo
must_haves:
  truths:
    - "Installing a game from any store with a store dir (epic/gog/amazon/steam/zoom) fetches grayson-mitchell/known-fixes first"
    - "A 404 from GameLib's repo falls back to Heroic's feed for epic/gog/amazon only; for steam (and zoom) a 404 means no fix"
    - "A network error, timeout, 5xx or malformed body never fails the install, never falls back to Heroic, and leaves the existing downloaded file untouched"
    - "A file written from GameLib's repo is never replaced by Heroic's in the same fetch; a stale downloaded file is deleted only when every applicable source answers 404"
    - "Downloaded files are filtered through filterTier1KnownFixes before being written, so the remote dir holds only allow-listed keys"
    - "Uninstalling a Steam game deletes fixes/<appId>-steam.json; fixes/local/ and public/fixes/ files and *.profile.json files are never touched"
    - "A README for the known-fixes repo exists in GameLib with the layout, store dirs, the verbatim TIER1_KNOWN_FIX_KEYS list, a tier-2 rejection note and an example"
  artifacts:
    - path: "src/backend/knownFixesFetcher.ts"
      provides: "fetchRemoteKnownFixes(appName, runner, get?) with GameLib-first, Heroic-fallback, filter-at-write, atomic write"
      exports: ["fetchRemoteKnownFixes", "GAMELIB_KNOWN_FIXES_BASE", "HEROIC_KNOWN_FIXES_BASE"]
    - path: "src/backend/__tests__/knownFixesFetcher.test.ts"
      provides: "Outcome matrix tests against a real tmp fixes dir with an injected get"
    - path: ".planning/quick/261026-avw-gamelib-known-fixes-repo-fetcher-downloa/known-fixes-README.md"
      provides: "Source-of-record README for https://github.com/grayson-mitchell/known-fixes"
  key_links:
    - from: "src/backend/downloadmanager/utils.ts"
      to: "src/backend/knownFixesFetcher.ts"
      via: "downloadFixesFor -> fetchRemoteKnownFixes (fire-and-forget with .catch)"
      pattern: "fetchRemoteKnownFixes\\("
    - from: "src/backend/knownFixesFetcher.ts"
      to: "src/backend/knownFixes.ts"
      via: "filterTier1KnownFixes applied to each downloaded body"
      pattern: "filterTier1KnownFixes\\("
---

<objective>
Execute the todo `.planning/todos/pending/2026-10-24-gamelib-own-known-fixes-repo-for-steam-and-complex-fixes.md`
(decisions 1 and 6 of `.planning/notes/per-game-compat-fixes-architecture.md`): the install-time
known-fixes fetcher tries GameLib's own repo `grayson-mitchell/known-fixes` first for every store,
falls back to Heroic's feed for epic/gog/amazon, stops skipping Steam; `removeFixFile` covers Steam;
the repo README is authored in GameLib as the source of record.

Purpose: Steam games (and macOS fixes for other stores) get tier-1 fixes from a repo GameLib controls.
Output: new `src/backend/knownFixesFetcher.ts` + tests, rewired `downloadFixesFor` and `removeFixFile`,
README, closed todo.

Out of scope: pushing the README to the remote repo (the orchestrator does that with user
confirmation — the executor MUST NOT `git push` to or clone `grayson-mitchell/known-fixes`); any
remote tier-2 feed (deferred by decision 6).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/todos/pending/2026-10-24-gamelib-own-known-fixes-repo-for-steam-and-complex-fixes.md
@.planning/quick/261025-vnf-split-known-fixes-into-tier-1-remote-all/261025-vnf-SUMMARY.md
@src/backend/knownFixes.ts
@src/backend/__tests__/knownFixesLayered.test.ts

Load `Skill("gamelib-conventions")` before writing `<verify>` checks or the todo move. No task
spawns a child process, so the fake-HOME rule does not apply.

<interfaces>
From src/backend/knownFixes.ts (quick 261025-vnf):
- `export const TIER1_KNOWN_FIX_KEYS = ['title','notes','winetricks','runInPrefix','envVariables','wikiLink','launchNotice'] as const`
- `export function filterTier1KnownFixes(appName: string, layerLabel: string, parsed: unknown): KnowFixesInfo | null`
  — returns null (with a warning) for a non-plain-object; otherwise copies allow-listed keys and
  logs a warning per dropped key (tier-2 keys get a "belongs in .profile.json" warning).
- The reader `readKnownFixes` resolves local (`fixesPath/local`) > bundled (`bundledFixesPath`) >
  remote (`fixesPath`) and ALSO filters every layer at read time. Path-containment idiom
  (resolve + relative, reject `..`/absolute/empty) lives in `readFixesFileWithin`.

From src/backend/constants/paths.ts:
- `fixesPath = join(appFolder, 'fixes')`, `localFixesPath = join(fixesPath, 'local')`, `bundledFixesPath` (public/fixes).

From src/common/utils.ts:
- `storeMap: { [key in Runner]: string | undefined } = { legendary: 'epic', gog: 'gog', nile: 'amazon', sideload: undefined, zoom: 'zoom', steam: 'steam' }`
  — `steam` yields `'steam'` today (the old `undefined` comment is historical). `sideload` yields
  undefined, and the current `downloadFixesFor` would fetch `.../undefined/<app>-undefined.json`
  for it — the new code skips it.

Current call sites:
- `src/backend/downloadmanager/utils.ts:238` — `downloadFixesFor(appName, runner)` called without
  await at the top of the install try-block; `downloadFixesFor` at ~line 506 skips steam and calls
  `downloadFile({ url, dest, ignoreFailure: true })` (from `../utils`). `downloadFile` HEADs first
  and silently returns on any failure, so it cannot distinguish 404 from a network error — that is
  why the new fetcher does not use it.
- `src/backend/utils/uninstaller.ts:74` — non-exported `removeFixFile(appName, runner)` skips steam,
  then `rmSync(join(fixesPath, `${appName}-${storeMap[runner]}.json`))` if it exists.
- `src/backend/downloadmanager/__tests__/utils.test.ts:994` — describe block
  "quick 261024-tny D1: Steam never pulls Heroic known-fixes" asserts steam does NOT call
  `downloadFile` with a known-fixes URL and GOG DOES call it with the Heroic URL. It mocks
  `../../utils` (downloadFile) and `backend/constants/paths` (`fixesPath: '/mock/fixes'`).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: knownFixesFetcher module — GameLib first, Heroic fallback, filter at write</name>
  <files>src/backend/knownFixesFetcher.ts, src/backend/__tests__/knownFixesFetcher.test.ts</files>
  <behavior>
    Tests use a real tmp `fixesPath` (mock `../constants/paths` the way knownFixesLayered.test.ts
    does, overriding `fixesPath` and `localFixesPath` to a per-pid tmp dir; mock `../logger`) and an
    injected fake `get(url)` that records URLs and returns `{ status, data }` per URL or throws.
    - GameLib 200 (steam, appName 284100): requested URL is exactly
      `https://raw.githubusercontent.com/grayson-mitchell/known-fixes/main/steam/284100-steam.json`;
      Heroic never requested; `fixes/284100-steam.json` written with allow-listed keys only — a
      body carrying `envVariables` + `registry` + `foo` is written with `envVariables` only and
      logWarning was called for the dropped keys.
    - GameLib 200 for gog overwrites a pre-existing (stale Heroic) file at dest; Heroic not requested.
    - GameLib 404, runner gog: Heroic URL
      `https://raw.githubusercontent.com/Heroic-Games-Launcher/known-fixes/main/gog/1207658930-gog.json`
      requested second; its filtered body written. Same fallback for legendary (`epic`) and nile (`amazon`).
    - GameLib 404, runner steam (and zoom): Heroic never requested; a pre-existing dest file is deleted.
    - GameLib 404 + Heroic 404 (epic): pre-existing dest file deleted.
    - GameLib throws (network error/timeout) with a pre-existing dest file: function resolves (no
      throw), Heroic NOT requested, dest file byte-identical.
    - GameLib 500 / 403: same as network error (indeterminate — no fallback, no write, no delete).
    - GameLib 200 with malformed JSON, or a JSON array: warning logged, dest untouched, Heroic NOT requested.
    - GameLib 404 then Heroic throws: dest untouched.
    - runner sideload: zero requests, nothing written.
    - appName `../escape`: zero requests, nothing written outside fixesPath, warning logged.
    - A file at `localFixesPath/<app>-<store>.json` and a `fixesPath/<app>-<store>.profile.json`
      are never modified or deleted by any of the above outcomes.
    - No `.tmp` files remain in fixesPath after a successful write.
  </behavior>
  <action>
    RED first: write the test file from the behavior list, run it, confirm it fails (module missing), commit.

    Then create `src/backend/knownFixesFetcher.ts`. It MUST NOT import `electron`, `backend/ipc` or
    `backend/utils` (keep the dependency surface as small as knownFixes.ts — same header rule). Imports:
    `axios`, `path`, `graceful-fs` (existsSync, mkdirSync, writeFileSync, renameSync, rmSync),
    `storeMap` from common/utils, `fixesPath` from ./constants/paths, `filterTier1KnownFixes` from
    ./knownFixes, `logInfo`/`logWarning`/`LogPrefix` from ./logger.

    Export constants `GAMELIB_KNOWN_FIXES_BASE = 'https://raw.githubusercontent.com/grayson-mitchell/known-fixes/main'`
    and `HEROIC_KNOWN_FIXES_BASE = 'https://raw.githubusercontent.com/Heroic-Games-Launcher/known-fixes/main'`;
    URL is `${base}/${store}/${appName}-${store}.json`. Heroic fallback applies only to runners
    `legendary`, `gog`, `nile` (decision 6: Heroic's feed covers Epic/GOG/Amazon); define that as a
    const set in the module.

    Export a type `KnownFixesGet = (url: string) => Promise<{ status: number; data: unknown }>` and
    `async function fetchRemoteKnownFixes(appName: string, runner: Runner, get: KnownFixesGet = defaultGet): Promise<void>`.
    `defaultGet` uses `axios.get(url, { timeout: 10000, responseType: 'text', transformResponse: (r) => r, validateStatus: () => true })`
    so status is always returned (never thrown) and the body arrives as a raw string; parse it
    yourself with JSON.parse in a try/catch (accept an already-parsed object too, for the injected get).

    Algorithm:
    1. `store = storeMap[runner]`; if undefined return silently.
    2. Containment guard: dest = resolve(fixesPath, `${appName}-${store}.json`); reject (logWarning,
       return) when relative(resolve(fixesPath), dest) starts with `..`, is absolute, is empty, or
       contains a path separator (dest must be a direct child of fixesPath, never `local/`).
    3. Try sources in order [GameLib, Heroic-if-covered]. For each: call get inside try/catch.
       - throw, or status other than 200/404 → logWarning naming the source and URL, then RETURN
         (indeterminate: no fallback, no write, no delete). Not falling back here is what stops a
         transient GameLib outage from replacing a GameLib-sourced file with Heroic's.
       - 404 → continue to next source.
       - 200 → parse; filter with `filterTier1KnownFixes(appName, label, parsed)` where label is
         `'remote: GameLib'` or `'remote: Heroic'`; if parse fails or filter returns null →
         logWarning, RETURN (no fallback, dest untouched). Otherwise mkdirSync(fixesPath, recursive),
         writeFileSync to `${dest}.tmp-${process.pid}` with `JSON.stringify(filtered, null, 2)`, then
         renameSync over dest (atomic replace; the reader never sees a half-written file); logInfo; RETURN.
    4. All sources answered 404 → if dest exists, rmSync it and logInfo that the stale downloaded
       fix was removed (every source authoritatively has no file, so the old copy — e.g. a Heroic
       file from before this change, or a file since deleted from GameLib's repo — is stale).
    Wrap the whole body so it never rejects (catch-all → logWarning); write failures are warnings too.

    Write-time filtering decision (record in the module docstring and SUMMARY): filter at write AND
    at read. Write-time filtering means the remote dir only ever holds allow-listed keys, the
    dropped-key warnings name the actual source (GameLib vs Heroic) once at install rather than on
    every launch, and a non-object/malformed body is rejected before it can displace a good file.
    Read-time filtering stays as the defence for hand-placed files and files downloaded by older
    builds (Heroic files written unfiltered by the old `downloadFile` path).

    GREEN: make the tests pass; commit. Refactor only if needed.
  </action>
  <verify>
    <automated>npx jest src/backend/__tests__/knownFixesFetcher.test.ts src/backend/__tests__/knownFixes.test.ts src/backend/__tests__/knownFixesLayered.test.ts && npx tsc --noEmit && npx prettier --check src/backend/knownFixesFetcher.ts src/backend/__tests__/knownFixesFetcher.test.ts</automated>
  </verify>
  <done>All behavior cases pass against a real tmp dir; module has no electron/ipc/backend-utils import (`grep -nE "from '(electron|backend/ipc|backend/utils|\\.\\./utils|\\./utils)'" src/backend/knownFixesFetcher.ts` prints nothing); tsc clean; prettier clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire downloadFixesFor to the fetcher; removeFixFile covers Steam</name>
  <files>src/backend/downloadmanager/utils.ts, src/backend/downloadmanager/__tests__/utils.test.ts, src/backend/utils/uninstaller.ts, src/backend/utils/__tests__/uninstaller.test.ts</files>
  <behavior>
    - downloadmanager utils.test.ts: replace the "quick 261024-tny D1: Steam never pulls Heroic
      known-fixes" describe with "quick 261026-avw: every store fetches known fixes via the
      GameLib-first fetcher": with `backend/knownFixesFetcher` mocked (`fetchRemoteKnownFixes:
      jest.fn().mockResolvedValue(undefined)`), a Steam install calls it with (appName, 'steam');
      a GOG install calls it with ('1207658930', 'gog'); neither calls `downloadFile` with a
      known-fixes URL; and when `fetchRemoteKnownFixes` rejects, the install still resolves with
      status 'done' (fire-and-forget must not fail installs or leave an unhandled rejection).
    - uninstaller.test.ts (new): with a real tmp fixesPath/localFixesPath (mock `backend/constants/paths`;
      mock heavy imports `backend/config`, `backend/dialog/dialog`, `backend/storeManagers`,
      `backend/utils`, `backend/utils/gameTitle`, `backend/logger`, `i18next` as needed),
      `removeFixFile('284100','steam')` deletes `fixes/284100-steam.json` but leaves
      `fixes/local/284100-steam.json` and `fixes/284100-steam.profile.json`; same for gog;
      `removeFixFile('x','sideload')` deletes nothing and does not throw; a missing file does not throw.
  </behavior>
  <action>
    downloadmanager/utils.ts: replace the body of `downloadFixesFor` with a call to
    `fetchRemoteKnownFixes(appName, runner)` from `backend/knownFixesFetcher`, invoked
    fire-and-forget with a `.catch` that logWarnings (installs must not wait on or fail from the
    fetch — same non-blocking contract as today; the fetcher already never rejects, the catch is a
    belt for the unhandled-rejection case). Delete the D1 steam skip and its comment; replace with a
    one-line comment citing quick 261026-avw and decision 6. Remove now-unused imports (`storeMap`,
    `fixesPath`, `mkdirSync`, `downloadFile` only if no other use remains in the file — grep before
    removing). Keep `downloadFixesFor` as a plain (non-async) function so the call site at ~line 238
    is unchanged.

    uninstaller.ts: export `removeFixFile` (named export, for the test). Remove the steam early
    return and its 261024-tny comment; add a comment: the downloaded tier-1 copy is re-fetched at
    install from GameLib's repo for every store (quick 261026-avw), so deleting it is safe; local
    (`fixes/local/`) and bundled files live elsewhere and are never touched; `.profile.json` is
    never downloaded and is not deleted. Return early when `storeMap[runner]` is undefined (sideload
    previously targeted `<app>-undefined.json`). Only the exact `${appName}-${store}.json` direct
    child of fixesPath is removed.

    Update the downloadmanager test mocks: add `jest.mock('backend/knownFixesFetcher', ...)`. Run
    the full downloadmanager utils suite, not just the new describe.
  </action>
  <verify>
    <automated>npx jest src/backend/downloadmanager/__tests__/utils.test.ts src/backend/utils/__tests__/uninstaller.test.ts src/backend/__tests__/knownFixesFetcher.test.ts && npx tsc --noEmit && npx prettier --check src/backend/downloadmanager/utils.ts src/backend/downloadmanager/__tests__/utils.test.ts src/backend/utils/uninstaller.ts src/backend/utils/__tests__/uninstaller.test.ts</automated>
  </verify>
  <done>`git grep -n "runner === 'steam') return" -- src/backend/downloadmanager/utils.ts src/backend/utils/uninstaller.ts` prints nothing; `git grep -n "Heroic-Games-Launcher/known-fixes" -- src/backend/downloadmanager/utils.ts` prints nothing; both suites green; tsc and prettier clean.</done>
</task>

<task type="auto">
  <name>Task 3: Author the known-fixes repo README and close the todo</name>
  <files>.planning/quick/261026-avw-gamelib-known-fixes-repo-fetcher-downloa/known-fixes-README.md, .planning/todos/pending/2026-10-24-gamelib-own-known-fixes-repo-for-steam-and-complex-fixes.md, .planning/todos/completed/2026-10-24-gamelib-own-known-fixes-repo-for-steam-and-complex-fixes.md</files>
  <action>
    Write `known-fixes-README.md` (it becomes README.md at the root of
    https://github.com/grayson-mitchell/known-fixes; the executor does NOT push it). Sections:
    - Purpose: tier-1 per-game fixes for GameLib, every store; GameLib fetches this repo first at
      install and falls back to Heroic-Games-Launcher/known-fixes for epic/gog/amazon when no file
      exists here; for steam/zoom only this repo is consulted. A file here fully replaces Heroic's
      for that game (whole-file, no merge). Local (`fixes/local/`) and bundled files in the app
      take precedence over anything fetched.
    - Layout: `<store>/<appName>-<store>.json`, raw URL
      `https://raw.githubusercontent.com/grayson-mitchell/known-fixes/main/<store>/<appName>-<store>.json`.
      Store dir table: `epic` (Legendary app name), `gog` (GOG product id), `amazon` (Nile id),
      `steam` (Steam appId, e.g. `284100`), `zoom` (Zoom id).
    - Allowed keys: the exact seven from `TIER1_KNOWN_FIX_KEYS` in `src/backend/knownFixes.ts`, in
      that order, as a bulleted list with backticked names and a short meaning each (`title`,
      `notes` per-platform text, `winetricks` verbs, `runInPrefix` install-relative executables,
      `envVariables`, `wikiLink`, `launchNotice` UI text). State that any other key is dropped with
      a warning, and that tier-2 keys (`registry`, `steamSharedRedists`, `evidence`, and future
      `dllOverrides`/`overlays`/`shimFeatures`/`platforms`) belong in `<appName>-<store>.profile.json`,
      which is local/bundled only and is never fetched — placing them here does nothing.
    - Trust note (decision 6): tier 1 is "trust the repo's mergers" — `runInPrefix` and winetricks
      run code; review PRs accordingly.
    - Example: a complete `steam/<appId>-steam.json` with `title`, `notes`, `envVariables`,
      `launchNotice` as valid JSON.

    Then `git mv` the todo to `.planning/todos/completed/` and append a `## Closed 2026-10-26 (quick 261026-avw)`
    section in the style of the 261025-vnf closure (see `.planning/todos/completed/2026-10-25-two-tier-known-fixes-split.md`):
    what landed (fetcher module, GameLib-first/Heroic-fallback, filter at write and read, stale-file
    rule, Steam no longer skipped in fetch or uninstall), and that the repo exists but the README
    push to `grayson-mitchell/known-fixes` is **pending — handled by the orchestrator with user
    confirmation** (the orchestrator will amend this line once pushed). Keep the frontmatter
    (`severity:`, `platform:`, `ready:`) intact. `.planning/` is prettier-ignored (`.prettierignore`
    line 29; `--file-info` reports `ignored: true`), so no prettier check is carried for these paths.

    README key-list test: skipped deliberately. The README's source of record sits in an archival
    `.planning/quick/` dir, and pinning a product jest test to that path couples src tests to
    planning artifacts; the allow-list is enforced in code regardless, so drift only misleads a
    human. The one-off node check below proves the list is verbatim at authoring time.
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const src=fs.readFileSync('src/backend/knownFixes.ts','utf8');const m=src.match(/TIER1_KNOWN_FIX_KEYS = \[([^\]]*)\]/);const keys=[...m[1].matchAll(/'([^']+)'/g)].map(x=>x[1]);const r=fs.readFileSync('.planning/quick/261026-avw-gamelib-known-fixes-repo-fetcher-downloa/known-fixes-README.md','utf8');const missing=keys.filter(k=>!r.includes('\`'+k+'\`'));if(missing.length){console.error('missing',missing);process.exit(1)}console.log('ok',keys)" && test -f .planning/todos/completed/2026-10-24-gamelib-own-known-fixes-repo-for-steam-and-complex-fixes.md && test ! -f .planning/todos/pending/2026-10-24-gamelib-own-known-fixes-repo-for-steam-and-complex-fixes.md && pnpm planning-gates</automated>
  </verify>
  <done>README contains all seven tier-1 keys in order, the layout, store dirs, tier-2 note and a valid JSON example; todo moved to completed with closure note marking the README push pending; planning-gates green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| raw.githubusercontent.com -> fixes dir | Remote JSON (GameLib repo, Heroic feed) written to disk and later applied at launch |
| appName -> filesystem path | appName is interpolated into URL and dest path |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-avw-01 | Elevation | fetchRemoteKnownFixes write | mitigate | filterTier1KnownFixes at write (and read) — tier-2 keys (registry, DLLs, shim) can never arrive remotely |
| T-avw-02 | Tampering | dest path | mitigate | resolve+relative containment; dest must be a direct child of fixesPath (never local/, never outside) |
| T-avw-03 | Tampering | partial write | mitigate | write to `.tmp-<pid>` then renameSync |
| T-avw-04 | Denial of service | install flow | mitigate | fire-and-forget, never-rejecting fetcher, 10s axios timeout |
| T-avw-05 | Tampering | Heroic overriding GameLib | mitigate | fallback only on GameLib 404; any indeterminate GameLib response stops without fallback |
| T-avw-06 | Elevation | tier-1 runInPrefix/winetricks from remote | accept | decision 6: trust the repo's mergers, same trust as Heroic's feed |
</threat_model>

<verification>
- `npx jest src/backend/__tests__/knownFixesFetcher.test.ts src/backend/__tests__/knownFixes.test.ts src/backend/__tests__/knownFixesLayered.test.ts src/backend/__tests__/steamBridgeKnownFixes.test.ts src/backend/downloadmanager/__tests__/utils.test.ts src/backend/utils/__tests__/uninstaller.test.ts`
- `npx tsc --noEmit`
- `npx prettier --check` over the six `src/` paths in files_modified
- `pnpm planning-gates`
- Then `graphify update .`
</verification>

<success_criteria>
- Every store with a store dir fetches GameLib's repo first; Heroic is the fallback only for epic/gog/amazon on a GameLib 404.
- Network errors never fail installs and never let Heroic replace a GameLib file; stale files are deleted only on all-404.
- Steam is no longer skipped by `downloadFixesFor` or `removeFixFile`; local/bundled/profile files untouched.
- README authored with the verbatim tier-1 key list; todo closed with the push marked pending.
</success_criteria>

<output>
Create `.planning/quick/261026-avw-gamelib-known-fixes-repo-fetcher-downloa/261026-avw-SUMMARY.md` when done
</output>
