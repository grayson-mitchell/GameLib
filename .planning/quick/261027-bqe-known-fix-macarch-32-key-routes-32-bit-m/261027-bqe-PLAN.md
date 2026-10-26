---
phase: quick-261027-bqe
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/knownFixes.ts
  - src/common/types.ts
  - src/backend/storeManagers/steam/electronStores.ts
  - src/backend/storeManagers/steam/macArchKnownFix.ts
  - src/backend/__tests__/knownFixesMacArch.test.ts
  - src/backend/storeManagers/steam/__tests__/macArchKnownFix.test.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/__tests__/library.test.ts
  - src/backend/storeManagers/steam/__tests__/macArchKnownFixRouting.test.ts
  - public/fixes/57300-steam.json
  - public/fixes/63000-steam.json
  - public/fixes/402060-steam.json
  - .planning/todos/pending/2026-10-26-known-fix-key-marks-a-mac-build-32-bit-before-install.md
  - .planning/todos/completed/2026-10-26-known-fix-key-marks-a-mac-build-32-bit-before-install.md
  - .planning/todos/pending/2026-10-26-route-steam-installs-by-platform-and-protect-authenticated-logons.md
autonomous: true
requirements: [QUICK-BQE-01, QUICK-BQE-02, QUICK-BQE-03]

must_haves:
  truths:
    - "A tier-1 known-fix file `<appId>-steam.json` may carry `macArch`, from the local, bundled or remote layer; only the literal string \"32\" survives the filter, any other value is dropped with a warning"
    - "On an Apple-silicon Mac (isAppleSiliconMac, never !isIntelMac), a Steam title whose known fix says macArch \"32\" has mac_arch '32' with mac_arch_source 'known-fix' in steamMetadataStore before install routing runs, and mac_arch_verified is never set true by that path"
    - "Installing such a title on Apple silicon takes the routeThroughBottle (Windows / bridge) branch and never starts a native Mac depot download or steam://install"
    - "On an Intel Mac, or any host where Apple silicon is not positively confirmed, the hint is ignored and routing is unchanged"
    - "A Mach-O-verified verdict (mac_arch_verified true) always beats the hint; a known-fix '32' does not stop verifyMacArchGroundTruth from running if a Mac build is installed"
    - "When verifyMacArchGroundTruth finds '32', it logs a paste-ready known-fixes entry for `<appId>-steam.json`"
    - "The three titles already Mach-O-verified 32-bit on the operator's Mac (57300, 63000, 402060) ship as bundled seed entries"
  artifacts:
    - path: "src/backend/storeManagers/steam/macArchKnownFix.ts"
      provides: "knownFixSaysMac32, seedMacArchFromKnownFix, formatMacArch32KnownFixEntry"
      exports: ["knownFixSaysMac32", "seedMacArchFromKnownFix", "formatMacArch32KnownFixEntry"]
    - path: "src/backend/knownFixes.ts"
      provides: "macArch in TIER1_KNOWN_FIX_KEYS plus a value check accepting only \"32\""
      contains: "'macArch'"
    - path: "src/backend/storeManagers/steam/__tests__/macArchKnownFixRouting.test.ts"
      provides: "install() routing proof on Apple silicon vs Intel"
  key_links:
    - from: "src/backend/storeManagers/steam/games.ts ensurePlatformsCaptured()"
      to: "seedMacArchFromKnownFix"
      via: "call right after the isMac guard"
      pattern: "seedMacArchFromKnownFix\\(this\\.appId\\)"
    - from: "src/backend/storeManagers/steam/games.ts fetchMetadataIfNeeded()"
      to: "knownFixSaysMac32"
      via: "mac_arch derivation, so an appdetails rewrite cannot drop the seed"
      pattern: "knownFixSaysMac32\\("
    - from: "src/backend/storeManagers/steam/library.ts verifyMacArchGroundTruth()"
      to: "formatMacArch32KnownFixEntry"
      via: "logInfo when the Mach-O verdict is '32'"
      pattern: "formatMacArch32KnownFixEntry\\("
---

<objective>
Action the todo `2026-10-26-known-fix-key-marks-a-mac-build-32-bit-before-install.md` (THE SPEC).
Add a tier-1 known-fix key `macArch: "32"`. On Apple silicon it seeds
`mac_arch: '32'` / `mac_arch_source: 'known-fix'` (never `mac_arch_verified: true`) before
install routing reads the metadata store. The install then goes straight to the Windows
(bridge/bottle) branch, the same branch `promptI386Recovery`'s reinstall takes today, with no
Mac download. The post-install Mach-O check stays as the fallback and now logs its '32' findings
as a paste-ready known-fixes entry.

Purpose: today every Apple-silicon user downloads an unrunnable 32-bit Mac build before GameLib
finds out, and the verdict lives only in that user's `steamMetadataStore`. A curated fact,
served from the remote known-fixes repo, removes the wasted download for everyone.

Output: the key and its validator, a small new module holding the seed logic (kept out of the
dirty `games.ts` as far as possible), three narrow `games.ts` hunks, one `library.ts` change,
unit tests, three bundled seed files, and the closed todo.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/todos/pending/2026-10-26-known-fix-key-marks-a-mac-build-32-bit-before-install.md
@.planning/quick/260821-le0-fix-32-bit-mac-steam-titles-permanently-/260821-le0-PLAN.md
@src/backend/knownFixes.ts

Load `Skill("gamelib-conventions")` before writing any `<verify>` evidence (formatter rule) and
before touching any todo file (frontmatter rule).

## WORKING-TREE HAZARD (read before the first edit, applies to every task)

Execution runs on the main tree with NO worktree. These files carry uncommitted, UNRELATED
edits from a separate bridge-waits-for-Steam / WMV task and must not be committed by this task:
`src/backend/storeManagers/steam/games.ts` (two foreign hunks, at about lines 3094 and 3104 of
HEAD), `src/backend/storeManagers/steam/__tests__/games.test.ts`, `public/locales/en/gamelib.json`,
`src/backend/storeManagers/steam/bridge/*`, `src/frontend/screens/Game/GamePage/components/SteamBridgeSetup.tsx`,
`.planning/notes/per-game-compat-fixes-architecture.md`, `.planning/spikes/MANIFEST.md`,
`.planning/todos/pending/2026-10-25-unclaimed-world-mainmenu-wmv-fails-in-wine-media-foundation.md`,
and the untracked `.planning/debug/unclaimed-world-wmv-mf.md`,
`.planning/quick/261027-aue-*/` and `.planning/spikes/044-notproton-drm-live/`.

Rules:
1. NEVER `git add <file>`, `git add -A`, `git add .` or `git commit -a` on a file that was dirty
   before you started. Of the files this plan writes, only `games.ts` is in that set. This plan
   never edits `games.test.ts` or `gamelib.json`, and no task needs a new l10n string.
2. Before the first edit to `games.ts`, snapshot its foreign diff:
   `git diff src/backend/storeManagers/steam/games.ts > "$SCRATCH/games.foreign.patch"`, where
   `$SCRATCH` is the session scratchpad directory. Record its hunk headers
   (`grep '^@@' "$SCRATCH/games.foreign.patch"`).
3. To stage ONLY this task's `games.ts` hunks: copy the edited file to
   `"$SCRATCH/games.own.ts"`, then remove the foreign hunks from the copy with
   `patch -R "$SCRATCH/games.own.ts" < "$SCRATCH/games.foreign.patch"`. This task's hunks are far
   from lines 3094-3150, so the reverse applies cleanly. If it does not apply cleanly, STOP and
   report; do not hand-merge. Then stage that blob into the index without touching the working
   tree:
   `git update-index --cacheinfo 100644,$(git hash-object -w "$SCRATCH/games.own.ts"),src/backend/storeManagers/steam/games.ts`.
   (`git diff <file> > own.patch` plus `git apply --cached own.patch` is acceptable too, if the
   patch is first cut down to only this task's hunks.)
4. Before EVERY commit, run `git diff --cached --stat` and `git diff --cached src/backend/storeManagers/steam/games.ts`.
   The staged `games.ts` diff must contain none of the foreign hunks, and
   `git diff src/backend/storeManagers/steam/games.ts` (worktree vs index) must still show exactly
   the foreign hunks recorded in step 2. Stage every other file by explicit path only.
5. The pre-commit hook checks prettier on staged content, so the staged blob must be formatted.
   Never pass `--no-verify`.

<interfaces>
From src/backend/knownFixes.ts (clean file):
- `export const TIER1_KNOWN_FIX_KEYS = ['title','notes','winetricks','runInPrefix','envVariables','wikiLink','launchNotice'] as const` (line 56). The doc comment above it says `platforms` belongs to tier 2. Do NOT reuse the name `platforms` (spec Notes).
- `export function filterTier1KnownFixes(appName: string, layerLabel: string, parsed: unknown): KnowFixesInfo | null`. It copies allow-listed keys and logWarnings the rest. The remote fetcher runs it as well, so a value check placed here covers every layer.
- `export function readKnownFixes(appName: string, runner: Runner): KnowFixesInfo | null`. Layers are local > bundled > remote, and the first parsed file wins the whole file. It uses graceful-fs `existsSync`.

From src/common/types.ts (clean file), line 1143:
- `export interface KnowFixesInfo { title: string; notes?: Record<string,string>; winetricks?; runInPrefix?; envVariables?; wikiLink?; launchNotice?: string }`
- `GameInfo.mac_arch?: '32' | '64' | 'unknown'` (line 275)

From src/backend/storeManagers/steam/electronStores.ts (clean file), SteamMetadataCacheEntry:
- `mac_arch?: '32' | '64' | 'unknown'`, `mac_arch_verified?: boolean`, `mac_arch_source?: 'minos' | 'macho'` (line 144)
- `steamMetadataStore.get(appId)` / `.set(appId, entry)`. `set` REPLACES the whole entry, so always spread `existing`.
- `steamLibraryStore.set('games', GameInfo[])`

From src/backend/constants/environment.ts: `export const isMac`, `export const isAppleSiliconMac` (a positive probe that fails closed; never substitute `!isIntelMac`).
From ./state: `library` (Map<string, GameInfo>). From '../../ipc': `sendFrontendMessage('pushGameToLibrary', gameInfo)`.

From src/backend/storeManagers/steam/games.ts (DIRTY file):
- `fetchMetadataIfNeeded`, around lines 901-970: `const macArchVerified = existingMeta?.mac_arch_verified === true` then
  `mac_arch = macArchVerified ? existingMeta.mac_arch : effectiveIsMacNative ? macArchFromMinOS(...) : existingMeta?.mac_arch`.
  The `steamMetadataStore.set` is ENUMERATED, not spread. Its source spread is
  `...(macArchVerified ? { mac_arch_verified: true, mac_arch_source: existing } : effectiveIsMacNative ? { mac_arch_source: 'minos' } : {})`.
- `install()` (line 1094) calls `await this.ensurePlatformsCaptured()` (line 1140) and then
  `const routeThroughBottle = forceWindowsViaBottle || this.isBottleEligible()` (line 1176).
- `private async ensurePlatformsCaptured()` (line 2538) begins `if (!isMac) return` and then
  early-returns when `platformsCaptured === true`. It is also awaited by `checkBottleEligibility()`
  (2512), `checkBridgeRoute()` (2450), and the sites at 2624 and 3532.
- `private isBottleEligibleFromPlatforms()` (line 2349) contains `if (meta?.mac_arch === '32') return true`.
  That line is the existing route into the Windows branch, so a seeded '32' needs no new routing
  code. Its comment claims '32' only ever comes from the Mach-O check; update that comment.

From src/backend/storeManagers/steam/library.ts (clean file):
- `export async function verifyMacArchGroundTruth(appId, installPath, source: AcfSource)` (line 1729).
  Skip gate at line 1738: `if (existing?.mac_arch === '32' || existing?.mac_arch_verified === true) return`.
  It writes `{...existing, mac_arch: verdict, mac_arch_source: 'macho', mac_arch_verified: true}`
  and, on '32', calls `void promptI386Recovery(appId)`.
- `export async function promptI386Recovery(appId)` (line 1827): force-uninstalls, then `install()`.
  That install reroutes because `isBottleEligible()` sees mac_arch '32'.

Seed data, measured 2026-10-27 from the operator's
`~/Library/Application Support/gamelib/store_cache/steam_metadata.json`. All three are
`mac_arch '32'`, `mac_arch_source 'macho'`, `mac_arch_verified true`:
57300 "Amnesia: The Dark Descent", 63000 "HOARD", 402060 "Californium". Today no
`<id>-steam.json` exists for any of the three in `public/fixes/`, and the remote cache dir
(`.../gamelib/fixes/`) holds only `local/`. 63000 already has a tier-2
`63000-steam.profile.json`, a different file that must not be touched.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: macArch tier-1 key, store type, and the seed module (no games.ts edits)</name>
  <files>src/backend/knownFixes.ts, src/common/types.ts, src/backend/storeManagers/steam/electronStores.ts, src/backend/storeManagers/steam/macArchKnownFix.ts, src/backend/__tests__/knownFixesMacArch.test.ts, src/backend/storeManagers/steam/__tests__/macArchKnownFix.test.ts</files>
  <behavior>
    knownFixesMacArch.test.ts (calls filterTier1KnownFixes directly; mock backend/logger with the factory form used by the other knownFixes tests):
    - {title, macArch: "32"} keeps macArch "32" and logs no warning about macArch.
    - macArch of "64", 32 (a number), "i386", null or "" is dropped from the output, a logWarning names 'macArch' and the rejected value, and the other keys survive.
    - TIER1_KNOWN_FIX_KEYS contains 'macArch' and does not contain 'platforms'.
    macArchKnownFix.test.ts (mock backend/knownFixes readKnownFixes, a mutable environment double {isMac, isAppleSiliconMac}, ../electronStores with a stateful in-memory steamMetadataStore get/set, ../../../ipc, backend/logger; real ./state library Map):
    - knownFixSaysMac32: true only when isAppleSiliconMac AND readKnownFixes(appId,'steam')?.macArch === '32' AND existing?.mac_arch_verified !== true. false on Intel (isMac true, isAppleSiliconMac false). When isAppleSiliconMac is false, readKnownFixes is not called at all. A throwing readKnownFixes yields false and does not throw.
    - seedMacArchFromKnownFix on Apple silicon with the hint and existing {platformsCaptured:true, is_mac_native:true, mac_arch:'unknown', mac_arch_source:'minos', art_cover:'x', bridge:{...}} writes {...existing, mac_arch:'32', mac_arch_source:'known-fix'}. art_cover and bridge are preserved, mac_arch_verified is absent (not true), the library Map entry gets mac_arch '32', and pushGameToLibrary is sent once.
    - Calling it a second time with an already-seeded entry does not write again and does not push again.
    - Intel host with the hint: no write.
    - mac_arch_verified true with mac_arch '64' and the hint present: no write. The Mach-O verdict wins, and a logWarning says the curated entry disagrees with the verified Mach-O verdict.
    - Retraction: existing {mac_arch:'32', mac_arch_source:'known-fix'} with the hint now absent (or a non-Apple-silicon host) writes mac_arch 'unknown' with mac_arch_source removed, and logs it. An existing 'macho' '32' entry is never retracted.
    - formatMacArch32KnownFixEntry('63000','HOARD') returns a string naming '63000-steam.json' and containing JSON.stringify({ title: 'HOARD', macArch: '32' }). It falls back to the appId as the title when the title is undefined.
  </behavior>
  <action>
    1. knownFixes.ts (spec item 1): append 'macArch' to TIER1_KNOWN_FIX_KEYS. Extend the doc comment: macArch is plain routing data that never touches a running game, so it is tier 1 and reaches users from the remote repo without a release (quick 261027-bqe). Keep the existing warning that `platforms` is a reserved tier-2 name; this key is deliberately not called platforms. In filterTier1KnownFixes, add a value check inside the allowed branch: when key === 'macArch' and value !== '32' (strict string equality), do not copy it, and logWarning `Known fixes for '<appName>' (<layer> layer): 'macArch' accepts only "32", ignoring <JSON.stringify(value)>.` Explain in a one-line comment why a curated "64" adds nothing over min-OS and the Mach-O check (spec).
    2. types.ts: add `macArch?: '32'` to KnowFixesInfo, with a doc comment: tier 1, only "32" accepted, honoured only on Apple silicon (quick 261027-bqe).
    3. electronStores.ts: widen `mac_arch_source` to `'minos' | 'macho' | 'known-fix'`. Update its doc comment and the mac_arch comment above it, which currently says '32' comes only from Mach-O: a curated known-fix '32' is a pre-install SEED that never sets mac_arch_verified, so the Mach-O check keeps the last word.
    4. Create src/backend/storeManagers/steam/macArchKnownFix.ts. The header comment cites the spec todo and 260821-le0. It must not import games.ts or library.ts (to avoid an import cycle). Imports: readKnownFixes from 'backend/knownFixes'; isAppleSiliconMac from 'backend/constants/environment'; steamMetadataStore, steamLibraryStore and the SteamMetadataCacheEntry type from './electronStores'; library from './state'; sendFrontendMessage from '../../ipc'; logInfo, logWarning and LogPrefix from 'backend/logger'. Export:
       - `knownFixSaysMac32(appId: string, existing: SteamMetadataCacheEntry | undefined): boolean`. Gate order: isAppleSiliconMac first, so non-Apple-silicon hosts never read the file. Then `existing?.mac_arch_verified !== true`. Then readKnownFixes(appId, 'steam')?.macArch === '32', wrapped in try/catch, returning false and logging a warning on a throw. The host gate is isAppleSiliconMac because i386 still runs on an Intel Mac; never write !isIntelMac or a bare isMac (260821-le0).
       - `seedMacArchFromKnownFix(appId: string): void`. Synchronous and never throws (wrap the whole body). Read existing. If knownFixSaysMac32 and existing is not already {mac_arch:'32', mac_arch_source:'known-fix'}, set `{...(existing ?? { art_cover: '', art_square: '', extra: { reqs: [] } }), mac_arch: '32', mac_arch_source: 'known-fix'}`. Never write mac_arch_verified; that is spec item 2. Then mirror verifyMacArchGroundTruth's CR-01 propagation: when library.get(appId) exists, set mac_arch '32' on a copy, library.set it, call steamLibraryStore.set('games', Array.from(library.values())), and push it with pushGameToLibrary. Log it with logInfo, naming the source as known-fix. If the hint is present but existing.mac_arch_verified is true and existing.mac_arch !== '32', logWarning that the curated entry disagrees with the verified Mach-O verdict and the entry should be corrected; do not write. Retraction: if existing?.mac_arch_source === 'known-fix' && existing.mac_arch_verified !== true && !knownFixSaysMac32(...), write the entry with mac_arch 'unknown' and without the mac_arch_source key (destructure it out), propagate it the same way, and logInfo it. A retracted or wrong curated entry must stop routing.
       - `formatMacArch32KnownFixEntry(appId: string, title: string | undefined): string`. Returns text naming `${appId}-steam.json` (for the grayson-mitchell/known-fixes repo) followed by JSON.stringify({ title: title ?? appId, macArch: '32' }).
    5. Write both test files per the behavior block. Follow this directory's mock conventions: `resetMocks: true`, so re-establish implementations in beforeEach; use the logger factory mock; use a mutable environment double as in removeCopies.test.ts lines 125-130.
    No games.ts or library.ts edits in this task.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/__tests__/knownFixesMacArch.test.ts src/backend/storeManagers/steam/__tests__/macArchKnownFix.test.ts src/backend/__tests__/knownFixes.test.ts src/backend/__tests__/knownFixesLayered.test.ts src/backend/__tests__/knownFixesFetcher.test.ts && npx tsc --noEmit && for f in src/backend/knownFixes.ts src/common/types.ts src/backend/storeManagers/steam/electronStores.ts src/backend/storeManagers/steam/macArchKnownFix.ts src/backend/__tests__/knownFixesMacArch.test.ts src/backend/storeManagers/steam/__tests__/macArchKnownFix.test.ts; do npx prettier --file-info "$f" | grep -Eq '"ignored":[[:space:]]*false' || echo "IGNORED: $f"; done && npx prettier --check src/backend/knownFixes.ts src/common/types.ts src/backend/storeManagers/steam/electronStores.ts src/backend/storeManagers/steam/macArchKnownFix.ts src/backend/__tests__/knownFixesMacArch.test.ts src/backend/storeManagers/steam/__tests__/macArchKnownFix.test.ts && git diff --cached --stat</automated>
  </verify>
  <done>Both new suites and the three existing knownFixes suites pass. tsc is clean. No path prints IGNORED, and prettier --check passes on the six paths. The commit stages exactly these six files by explicit path, and `git diff --cached --stat` lists nothing else.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire the seed into games.ts routing and the Mach-O fallback log in library.ts</name>
  <files>src/backend/storeManagers/steam/games.ts, src/backend/storeManagers/steam/library.ts, src/backend/storeManagers/steam/__tests__/library.test.ts, src/backend/storeManagers/steam/__tests__/macArchKnownFixRouting.test.ts</files>
  <behavior>
    macArchKnownFixRouting.test.ts, a NEW file. Copy the jest.mock block from removeCopies.test.ts lines 33-320 or so (logger, shortcuts, backend/utils, graceful-fs, @node-steam/vdf, node:fs, ipc, dialog, i18next, user, online_monitor, child_process, backend/platform, environment double, electronStores, bottle, depot, bridge/allowlist and any others that file needs), and add `jest.mock('backend/knownFixes', ...)` with readKnownFixes as a jest.fn. Make steamMetadataStore get/set stateful over an in-memory Map so the seed write is visible to isBottleEligible():
    - Apple silicon, readKnownFixes returns {title:'HOARD', macArch:'32'}, store entry {platformsCaptured:true, is_mac_native:true, is_windows_native:true, mac_arch:'unknown', mac_arch_source:'minos', bridge:{userRoute:'bottle'}}, bottle not ready: `new SteamGame('63000').install({} as any)` resolves to the bottle-branch result ({status:'done', deferredToSetup:true}, as in removeCopies.test.ts). The stored entry now has mac_arch '32' and mac_arch_source 'known-fix', and mac_arch_verified is not true. No native install path ran: depot downloadSteamDepots was not called and shell.openExternal was not called with a steam://install URL.
    - The same entry on Intel (isAppleSiliconMac false, isMac true): the store never receives mac_arch_source 'known-fix', and install does NOT return the bottle-branch result (it takes the native path; assert whichever native seam the harness exposes, e.g. shell.openExternal or downloadSteamDepots was called).
    - `checkBottleEligibility()` is true after seeding on Apple silicon and false on Intel for the same mac-native entry.
    library.test.ts, added inside the existing `describe('verifyMacArchGroundTruth() — MAC32-03')` block at about line 6584, reusing its fixtures:
    - existing {mac_arch:'32', mac_arch_source:'known-fix'} with Mach-O verdict '32' still runs the check and persists mac_arch_source 'macho', mac_arch_verified true. This is the "last word" requirement.
    - existing {mac_arch:'32', mac_arch_source:'known-fix'} with Mach-O verdict '64' persists '64'/'macho'/verified, and a logWarning says the curated macArch "32" entry is contradicted.
    - Any '32' verdict produces a logInfo whose text contains '-steam.json' and '"macArch":"32"'.
    - Unchanged: existing {mac_arch:'32', mac_arch_source:'macho'} still short-circuits.
  </behavior>
  <action>
    Follow the WORKING-TREE HAZARD rules for games.ts. Take the snapshot before the first edit and stage this task's hunks only.
    1. games.ts (three hunks, all far from the foreign hunks near line 3094):
       a. Import knownFixSaysMac32 and seedMacArchFromKnownFix from './macArchKnownFix', next to the other './' imports.
       b. In fetchMetadataIfNeeded, after `const macArchVerified = ...`, add `const knownFix32 = knownFixSaysMac32(this.appId, existingMeta)`. Then derive mac_arch as: verified gives existingMeta.mac_arch; knownFix32 gives '32'; otherwise the existing min-OS/existing logic. In that otherwise branch, treat an existing entry with mac_arch_source 'known-fix' as absent (use undefined instead of existingMeta.mac_arch), so a retracted hint cannot leave an orphan '32'. In the enumerated set's source spread, add the middle case `knownFix32 ? { mac_arch_source: 'known-fix' as const } :` between the verified and minos cases, and never set mac_arch_verified there. Add a short comment: this is the fifth carry-forward on this enumerated write. It is re-derived from the curated file rather than copied from existingMeta, so an in-flight fetch that read existingMeta before the seed landed cannot drop it (quick 261027-bqe).
       c. In ensurePlatformsCaptured, insert `seedMacArchFromKnownFix(this.appId)` immediately after `if (!isMac) return`, ABOVE the alreadyCaptured early return. This placement means install(), checkBottleEligibility(), checkBridgeRoute() and launch all see the seed before they consult isBottleEligible(). Routing then needs no new branch: isBottleEligibleFromPlatforms already returns true for mac_arch '32', so install() takes routeThroughBottle, the path promptI386Recovery's reinstall uses (spec item 2). Also update the stale comment in isBottleEligibleFromPlatforms that says '32' only ever comes from the Mach-O check: it can now also be a known-fix seed on Apple silicon (quick 261027-bqe).
       Do NOT touch removeDemotedNativeOrphan or install()'s body beyond these hunks.
    2. library.ts verifyMacArchGroundTruth (spec item 3):
       a. Change the skip gate to `existing?.mac_arch_verified === true || (existing?.mac_arch === '32' && existing?.mac_arch_source !== 'known-fix')`, and update the doc comment's skip-gate list.
       b. Before the set, capture `const wasKnownFix32 = existing?.mac_arch_source === 'known-fix' && existing?.mac_arch === '32'`. After persisting, if wasKnownFix32 && verdict === '64', logWarning that the curated known-fixes entry `${appId}-steam.json` macArch "32" is contradicted by the Mach-O ground truth and should be removed.
       c. When verdict === '32', add a logInfo with `formatMacArch32KnownFixEntry(appId, library.get(appId)?.title ?? existing?.title-equivalent if any)`, before the promptI386Recovery call. The title comes from the library Map; fall back to undefined. Import formatMacArch32KnownFixEntry from './macArchKnownFix'.
    3. Write both test additions per the behavior block.
    4. Run the existing Steam suites the touched code reaches. The new static import of backend/knownFixes may change their module graph. If any of them breaks at import time, switch the games.ts import to the dynamic-import precedent already in that file (`await import('./bridgeKnownFixes')`, at about lines 3174 and 3288), inside the two async call sites, rather than editing the dirty games.test.ts.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/storeManagers/steam/__tests__/macArchKnownFixRouting.test.ts src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/storeManagers/steam/__tests__/removeCopies.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/storeManagers/steam/__tests__/metadataCapture.test.ts src/backend/storeManagers/steam/__tests__/platformCapture.test.ts src/backend/storeManagers/steam/__tests__/macArchKnownFix.test.ts && npx tsc --noEmit && for f in src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/library.ts src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/storeManagers/steam/__tests__/macArchKnownFixRouting.test.ts; do npx prettier --file-info "$f" | grep -Eq '"ignored":[[:space:]]*false' || echo "IGNORED: $f"; done && npx prettier --check src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/library.ts src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/storeManagers/steam/__tests__/macArchKnownFixRouting.test.ts && git diff --cached --stat && git diff --cached src/backend/storeManagers/steam/games.ts | grep '^@@' && git diff src/backend/storeManagers/steam/games.ts | grep '^@@'</automated>
  </verify>
  <done>All listed suites pass. games.test.ts runs unmodified with its pre-existing foreign edits and its result is no worse than before this task; if it already failed before Task 2, record that baseline first. tsc is clean and prettier passes on the four paths. The staged games.ts hunk headers are only this task's three hunks. The unstaged games.ts diff still shows exactly the foreign hunk headers recorded in the snapshot. games.test.ts and gamelib.json are not staged.</done>
</task>

<task type="auto">
  <name>Task 3: Bundled seed entries, cross-reference the blocked routing todo, close the spec todo</name>
  <files>public/fixes/57300-steam.json, public/fixes/63000-steam.json, public/fixes/402060-steam.json, .planning/todos/pending/2026-10-26-known-fix-key-marks-a-mac-build-32-bit-before-install.md, .planning/todos/completed/2026-10-26-known-fix-key-marks-a-mac-build-32-bit-before-install.md, .planning/todos/pending/2026-10-26-route-steam-installs-by-platform-and-protect-authenticated-logons.md</files>
  <action>
    1. Seed data (spec Notes). Before writing, confirm that none of the three files exists in public/fixes/ or in the remote cache `~/Library/Application Support/gamelib/fixes/`. A bundled tier-1 file shadows a remote one of the same name as a whole file, so if a remote file exists, merge its keys instead of shadowing them. Create three tier-1 files in the style of 1603180-steam.json. Each has "title" (57300 "Amnesia: The Dark Descent", 63000 "HOARD", 402060 "Californium"), "macArch": "32", and a "notes" object with a "macArch" note: "The macOS build is 32-bit only (i386); Apple silicon cannot run it, so GameLib installs the Windows build. Mach-O ground truth from verifyMacArchGroundTruth on the operator's Apple-silicon Mac (mac_arch_source macho, verified), recorded 2026-10-27 (quick 261027-bqe)." Do NOT touch 63000-steam.profile.json. These are the bundled layer. Mirroring them into the remote grayson-mitchell/known-fixes repo is an operator step outside this repo; state that in the SUMMARY, do not attempt it. Validate each file through the real filter with a one-off node/jest check, or by adding them to the Task 1 test as fixtures read with readFileSync: filterTier1KnownFixes must keep macArch "32" and must not warn.
    2. Cross-reference (spec Notes, overlap). The blocked todo `2026-10-26-route-steam-installs-by-platform-and-protect-authenticated-logons.md` is clean in git. Append a short section saying that its "title with a macOS build goes to steam://install" rule must treat a title for which `knownFixSaysMac32(appId, meta)` is true, or whose stored mac_arch is '32', as Windows-only. Otherwise that routing sends it to the unusable Mac build. Name `src/backend/storeManagers/steam/macArchKnownFix.ts` and this quick task. Do not change its frontmatter (severity, platform and ready stay exactly as they are).
    3. Close the spec todo with `git mv .planning/todos/pending/2026-10-26-known-fix-key-marks-a-mac-build-32-bit-before-install.md .planning/todos/completed/`, following the c765f51e7 precedent. Append a `## Resolution` section: closed by quick 261027-bqe (2026-10-27). Name the key, the isAppleSiliconMac gate, mac_arch_source 'known-fix' with mac_arch_verified left false, the ensurePlatformsCaptured seed point and fetchMetadataIfNeeded re-derivation, the Mach-O fallback's paste-ready log and its contradiction warning, the three seed titles, and the commit hashes from Tasks 1-2. State plainly that no live install on Apple silicon was run, so the end-to-end "no Mac download" claim rests on the unit-level routing test.
    4. Run `pnpm planning-gates`. It must stay green; the completed/ directory is exempt and the edited pending todo keeps its three keys.
    Stage by explicit path only; the git mv stages the rename. Re-check `git diff --cached --stat` before committing.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test -f .planning/todos/completed/2026-10-26-known-fix-key-marks-a-mac-build-32-bit-before-install.md && test ! -f .planning/todos/pending/2026-10-26-known-fix-key-marks-a-mac-build-32-bit-before-install.md && grep -q '^## Resolution' .planning/todos/completed/2026-10-26-known-fix-key-marks-a-mac-build-32-bit-before-install.md && grep -q 'knownFixSaysMac32' .planning/todos/pending/2026-10-26-route-steam-installs-by-platform-and-protect-authenticated-logons.md && for id in 57300 63000 402060; do node -e "const j=require('./public/fixes/$id-steam.json'); if(j.macArch!=='32'||!j.title) process.exit(1)" || echo "BAD: $id"; done && pnpm planning-gates && for f in public/fixes/57300-steam.json public/fixes/63000-steam.json public/fixes/402060-steam.json; do npx prettier --file-info "$f" | grep -Eq '"ignored":[[:space:]]*false' || echo "IGNORED: $f"; done && npx prettier --check public/fixes/57300-steam.json public/fixes/63000-steam.json public/fixes/402060-steam.json && git diff --cached --stat</automated>
    The three `.planning/todos/` paths are prettier-ignored (`.planning` is in .prettierignore; gamelib-conventions), so the formatter check deliberately omits them; a check there would be vacuous. public/fixes/*.json measured `{ "ignored": false, "inferredParser": "json" }` on 2026-10-27, so they are checked.
  </verify>
  <done>Three bundled seed files carry macArch "32" and pass the filter without warnings. The spec todo is in completed/ with a Resolution section, and the blocked routing todo carries the cross-reference. planning-gates is green, prettier passes on the three JSON files, and the staged set holds only this task's paths.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| remote known-fixes repo -> tier-1 reader | Downloaded JSON is untrusted. It is filtered by TIER1_KNOWN_FIX_KEYS at every layer. |
| known-fix hint -> install routing | A curated value now changes which platform's depots are downloaded. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-bqe-01 | Tampering | filterTier1KnownFixes macArch | mitigate | Strict `=== '32'` value check; any other value is dropped with a warning (Task 1). The key can only choose the Windows build, which is already a user-reachable route. It never touches a running game. |
| T-bqe-02 | Tampering | remote entry forces a native-capable title to Windows | accept | Worst case is a Windows install of a title that has a Windows depot. A Mach-O verified verdict overrides the hint, and retracting the entry un-seeds it (Task 1 retraction). Low value as an attack. |
| T-bqe-03 | Denial of Service | Intel Mac losing a runnable native build | mitigate | isAppleSiliconMac positive-probe gate, checked first. It fails closed and never uses !isIntelMac (260821-le0). Covered by the Intel tests in Tasks 1 and 2. |
| T-bqe-04 | Tampering | appId path traversal via readKnownFixes | accept | Already contained by readFixesFileWithin's resolve+relative guard. appId here comes from SteamGame. |
| T-bqe-05 | Repudiation/Integrity | committing the unrelated in-flight hunks | mitigate | The WORKING-TREE HAZARD protocol: snapshot, reverse-patch, `update-index --cacheinfo`, and a `git diff --cached` check before every commit. |
</threat_model>

<verification>
- `npx jest` over the five new or extended suites plus removeCopies, games, metadataCapture, platformCapture and the knownFixes suites: green.
- `npx tsc --noEmit`: clean.
- `git log -3 --stat` shows no foreign file (`games.test.ts`, `gamelib.json`, `bridge/*`, `SteamBridgeSetup.tsx`, other `.planning` notes), and `git diff src/backend/storeManagers/steam/games.ts` still shows exactly the foreign hunks.
- `pnpm planning-gates`: green.
</verification>

<success_criteria>
- macArch "32" is a tier-1 key that works from any layer; every other value is rejected.
- On Apple silicon a catalogued title seeds mac_arch '32' / 'known-fix' with mac_arch_verified not set, and install() routes to the Windows branch with no Mac download (unit-proven).
- An Intel Mac is unaffected. A Mach-O-verified verdict wins over the hint. The Mach-O fallback logs paste-ready entries.
- Three seed titles are bundled, the spec todo is closed, the blocked todo is cross-referenced, and no foreign hunk is committed.
</success_criteria>

<output>
Create `.planning/quick/261027-bqe-known-fix-macarch-32-key-routes-32-bit-m/261027-bqe-SUMMARY.md` when done
</output>
