---
quick_id: 260923-vdq
type: execute
mode: quick
wave: 1
depends_on: []
autonomous: true
files_modified:
  - src/frontend/screens/Library/components/InstallModal/diskSpaceLabels.ts
  - src/frontend/screens/Library/components/InstallModal/__tests__/diskSpaceLabels.test.ts
  - src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx
  - src/frontend/screens/Library/components/InstallModal/SteamDialog/__tests__/steamDialogSource.test.ts
  - src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx
  - public/locales/en/gamelib.json
  - public/locales/*/gamelib.json
  - public/locales/*/gamelib.mt.json
  - .planning/todos/pending/2026-09-23-free-space-line-shows-two-unlabelled-figures.md

must_haves:
  truths:
    - "The install dialog free-space line names BOTH figures: `Space Available: 301.44 GiB free of 537.15 GiB`"
    - "The label text comes from the translation catalogue, not from a backend-built string"
    - "Both render sites (SteamDialog and DownloadDialog) show the labelled form"
    - "The new key is present and non-empty in all 49 locales — the gamelib presence baseline stays at totalPairs: 0"
    - "Every existing source gate on SteamDialog stays green WITHOUT being weakened"
  artifacts:
    - path: "src/frontend/screens/Library/components/InstallModal/diskSpaceLabels.ts"
      provides: "Shared free/total byte formatter for both install dialogs"
    - path: "public/locales/en/gamelib.json"
      contains: "installFlows.diskSpaceFreeOfTotal"
  key_links:
    - from: "SteamDialog/index.tsx"
      to: "diskSpaceLabels.ts"
      via: "direct import, NOT frontend/helpers"
    - from: "DownloadDialog/index.tsx"
      to: "diskSpaceLabels.ts"
      via: "direct import"
---

<objective>
Label both figures in the install dialog's free-space line.

Today both dialogs render `Space Available: 301.44 GiB / 537.15 GiB`. The label names ONE
quantity; two are shown, and `X / Y` reads just as naturally as *used of total*, which inverts the
meaning. Target rendering:

    Space Available: 301.44 GiB free of 537.15 GiB

Purpose: remove a live-observed misreading in the one dialog whose entire job is answering "will
this game fit?".
Output: a new interpolated `gamelib` key filled across all 49 locales, a shared frontend formatter,
both render sites rewired, and the source todo closed.

**The figures are CORRECT** (verified byte-for-byte against `Win32_LogicalDisk` on the live
machine). This is a presentation defect only — do NOT touch the arithmetic.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@CLAUDE.md
@.planning/todos/pending/2026-09-23-free-space-line-shows-two-unlabelled-figures.md
</context>

<locked_decisions>
Settled by the operator before planning. Do not revisit, do not re-offer the alternatives the todo
lists.

- **LABEL BOTH figures.** Not "show only free space".
- **One new INTERPOLATED key.** Never concatenate translated fragments — word order varies by
  language.
- **Build the display string in the FRONTEND.** `shellFilesFlowRegistration.ts:333` builds
  `${getFileSize(freeSpace)} / ${getFileSize(totalSpace)}` in the sidecar, which has no access to
  the translation catalogue, so any label added there would be untranslatable English.
- **No new backend data is needed.** `DiskSpaceData` (`src/common/types.ts:808`) already carries
  `free` and `diskSize` as separate numeric fields alongside `message`.
- **Both render sites.** SteamDialog (`:494-501`) and DownloadDialog (`:694-703`).
- **Deprecating `message` is OPTIONAL.** This plan does NOT remove it — see the residue note in
  Task 3.
</locked_decisions>

<discovered_constraints>
Findings from planning that the executor must not rediscover the hard way. Every one was read out
of the tree, not assumed.

## 1. The new key MUST live in `gamelib.json`, never `gamepage.json`

`meta/i18nCatalogChurnGuard.ts` classifies every changed path under `public/locales/` as `gamelib`
(allowed — `gamelib.json` / `gamelib.mt.json` leaves) or `upstream` (forbidden — anything else) and
exits 1 on any upstream change. `gamepage.json` is upstream-owned Weblate data. So the todo's
suggested `install.disk-space-free-of-total` (a `gamepage` path) is NOT available.

**Key to add:** `installFlows.diskSpaceFreeOfTotal`, English value `{{free}} free of {{total}}`,
called as `tGamelib('gamelib:installFlows.diskSpaceFreeOfTotal', ...)`. The `gamelib:` prefix is
mandatory (D-06 split-brain): a call missing it makes the extractor write into an upstream catalog,
which is the exact failure the churn guard exists to catch.

## 2. All 49 locales must be filled in ONE commit — the presence baseline is currently ZERO

`meta/i18nCatalogPresenceBaseline.json` records `totalPairs: 0` across `0` keys: every one of the
317 English `gamelib` keys is currently present and non-empty in all 48 other locales.
`comparePresenceBaseline` in `meta/lintTranslations.ts` fails on drift in EITHER direction, so
`en` gaining a key while the other 48 stay unfilled adds 48 unrecorded missing pairs and turns
`pnpm lint-translations:gamelib` red.

**Do NOT regenerate the baseline to absorb the gap.** The file's own `reason` field states it is "a
RECORD of a known gap, not a permission to grow it", and it currently sits at zero. Regenerating
would ratchet backwards. Precedent to follow instead: commit `98a1586e6` (2026-09-19), which filled
all 48 locales for a new key in one 98-file commit.

An empty-string value does not work either: `checkEnglishKeysPresent` requires present AND
non-empty.

## 3. `machine-fill-gamelib` cannot run here — author the 48 values in-session

It hard-codes `api.anthropic.com` and ignores `ANTHROPIC_BASE_URL`; this environment's key is
gateway-scoped (measured HTTP 401, ledgered in STATE.md 2026-09-19). Patching it to honour the base
URL is a policy decision about where catalogue content is sent — do not do it. Re-invoking it with
a `!` prefix does not help: `!` inherits this session's environment and the same credential.

## 4. SteamDialog is under a comment-stripped source gate that bans the bare token `diskSize`

`SteamDialog/__tests__/steamDialogSource.test.ts` asserts the token `diskSize` is ABSENT from
SteamDialog's executable source in THREE separate `it` blocks (`:359`, `:388`, `:470`), each proven
non-vacuous against a known-bad specimen. That ban is D-06: *the Install button is never gated on
SIZE*, where "size" means the GAME's install size.

`DiskSpaceData.diskSize` is a different quantity — the VOLUME's total capacity — that happens to
share the name. The gate is a token-absence check and cannot tell them apart.

The same file also bans the token `frontend/helpers` (D-01/D-14), so SteamDialog **cannot import
`size` from `frontend/helpers`** — and that ban has real substance: `frontend/helpers/index.ts`
imports `../../preload/tauriAttach` and reads `window.api.kill` at module scope.

**Resolution (Task 1): a shared helper module.** Both dialogs need the same two formatted labels,
so factoring the formatting out is the DRY answer regardless; it also keeps SteamDialog clear of
both banned tokens by construction. The helper imports `filesize` directly, NOT `frontend/helpers`.

This is a genuine refactor, not gate evasion: D-06's substance (never gated on SIZE) stays literally
true and still enforced, and Task 1 EXTENDS the gate's required-wiring list rather than weakening
anything. Do not "simplify" the indirection away later — inlining it trips D-06's token ban.

## 5. `DownloadDialog`'s local `diskSize` is the GAME's size, not the disk's

`const [diskSize, setDiskSize] = useState(0)` is fed from
`gameInstallInfo.manifest?.disk_size` (`:385`) and drives `notEnoughDiskSpace` / `spaceLeftAfter`.
That is why the effect at `:468` destructures `{ message, free, validPath, validFlatpakPath }` and
pointedly does NOT take `diskSize` from the IPC result. Do not introduce a second `diskSize` binding
in that scope.

## 6. `message` has exactly two consumers, and both are being changed

`checkDiskSpace` callers: `DownloadDialog/index.tsx:469`, `SteamDialog/index.tsx:232`,
`consoleSteamTarget.ts:66`, `InstallGameModal.ts:258`. The last two read only `free` / `validPath`
(typed `{ free: number; validPath: boolean } | undefined`). So `message` is consumed only at the two
render sites this plan rewires.

## 7. `public/locales/` is in `.prettierignore`

Do NOT include locale JSON in any `prettier --check`. The formatter check applies to the `.ts` /
`.tsx` files only.

## 8. Formatting parity is exact

Frontend `size` is `fileSize.partial({ base: 2 })` (`frontend/helpers/index.ts:45`); backend
`getFileSize` is `fileSize.partial({ base: 2 })` (`backend/utils.ts:156`). Using the same
construction in the new helper keeps the rendered figures byte-identical to what the operator
verified live.
</discovered_constraints>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Shared label formatter, both render sites rewired, source gate extended</name>
  <files>
src/frontend/screens/Library/components/InstallModal/diskSpaceLabels.ts
src/frontend/screens/Library/components/InstallModal/__tests__/diskSpaceLabels.test.ts
src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx
src/frontend/screens/Library/components/InstallModal/SteamDialog/__tests__/steamDialogSource.test.ts
src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx
  </files>

  <behavior>
  For `diskSpaceLabels.test.ts`, write these before the helper:
  - formats a `free`/`diskSize` byte pair into two base-2 strings matching what `filesize` with
    `{ base: 2 }` produces (assert against `fileSize.partial({ base: 2 })` output computed in the
    test, not a hand-typed literal, so the assertion cannot drift from the library)
  - zero bytes formats without throwing
  - the returned object exposes the two labels under names that do NOT spell `diskSize`
  </behavior>

  <action>
**1a. New helper `diskSpaceLabels.ts`.** Export a function taking the `DiskSpaceData`-shaped result
of `window.api.checkDiskSpace` and returning two pre-formatted strings — name them `freeLabel` and
`totalLabel`. Format with `filesize`'s `partial({ base: 2 })`, imported DIRECTLY from the `filesize`
package (constraint 8). Do NOT import anything from `frontend/helpers` — see constraint 4 for why
that import is banned in SteamDialog and why pulling it in transitively defeats the ban. Parameter
type may reference `DiskSpaceData` from `common/types` (type-only, erased at runtime).

Put a short header comment on the file recording WHY it exists: both install dialogs need the same
two labels, and SteamDialog additionally may not import `frontend/helpers` (D-01/D-14) nor name the
token `diskSize` (D-06, which is about the GAME's size — a different quantity that shares the name).
State plainly that inlining this back into SteamDialog would trip that gate.

**1b. `SteamDialog/index.tsx`.**
- Widen the local `interface DiskSpaceInfo` (`:146-150`) to `freeLabel: string`,
  `totalLabel: string`, `validPath: boolean`, `validFlatpakPath: boolean`. Drop `message`.
- In Effect B, bind the IPC result to a single local (e.g. `const disk = await
  window.api.checkDiskSpace(...)`) and call `setDiskSpace({ ...diskSpaceLabels(disk), validPath:
  disk.validPath, validFlatpakPath: disk.validFlatpakPath })`. The token `diskSize` must not appear
  anywhere in this file's executable source.
- Update the now-false Effect B comment at `:207-208` — it currently reads "Never reads
  free/diskSize -- only message/validPath/validFlatpakPath". Comments are stripped by the gate, so
  naming `diskSize` there is safe; leaving the stale claim is not.
- Replace `<strong>{diskSpace.message}</strong>` (`:499`) with the interpolated call:
  `tGamelib('gamelib:installFlows.diskSpaceFreeOfTotal', '{{free}} free of {{total}}', { free:
  diskSpace.freeLabel, total: diskSpace.totalLabel })`. Leave the surrounding
  `t('install.disk-space-left', 'Space Available')` label and the `smallInputInfo` span untouched.

**1c. `steamDialogSource.test.ts` — extend the required-wiring list.** Add
`'gamelib:installFlows.diskSpaceFreeOfTotal'` to the `it.each([...])` presence list in Block 3
(`:522-540`, the list containing `'smallInputInfo'`). That file's own B-WR-05 comment records the
failure mode this closes: two prior fixes landed new branches without extending the list, so
reverting them left every gate green. Do NOT weaken, delete or narrow any existing assertion —
especially not the three `diskSize` absence gates.

**1d. `DownloadDialog/index.tsx`.** Same substitution, five sites:
- `type DiskSpaceInfo` (`:69-75`): replace `message: string` with `freeLabel: string; totalLabel:
  string`.
- initial `useState<DiskSpaceInfo>` (`:146-152`): replace `message: ''` with `freeLabel: '',
  totalLabel: ''`.
- the `getSpace` effect (`:467-490`): bind the IPC result to one local and spread
  `diskSpaceLabels(...)` into `setSpaceLeft`. **Do not introduce a second `diskSize` binding in this
  scope** (constraint 5) and **do not touch the `notEnoughDiskSpace` / `spaceLeftAfter` arithmetic**
  — the numbers are correct.
- the destructure at `:569-575`: `message` → `freeLabel, totalLabel`.
- the render at `:694-703`: `<strong>{`${message}`}</strong>` → the same interpolated `tGamelib`
  call as 1b. `tGamelib` is already in scope (`:158`). Leave the adjacent
  `- After Install: <spaceLeftAfter>` stat exactly as it is — it is the model this change follows.
  </action>

  <verify>
    <automated>npx tsc --noEmit</automated>
    <automated>npx jest --selectProjects Frontend src/frontend/screens/Library/components/InstallModal</automated>
    <automated>npx prettier --check src/frontend/screens/Library/components/InstallModal/diskSpaceLabels.ts src/frontend/screens/Library/components/InstallModal/__tests__/diskSpaceLabels.test.ts src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx src/frontend/screens/Library/components/InstallModal/SteamDialog/__tests__/steamDialogSource.test.ts src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx</automated>
  </verify>

  <done>
`tsc` clean. The full `InstallModal` Frontend suite passes, including all three `diskSize` absence
gates on SteamDialog UNCHANGED and the extended required-wiring list. `message` no longer appears in
either dialog's disk-space path. Prettier clean over the five exact paths above.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add the key to `en`, fill all 48 locales, stamp MT provenance</name>
  <files>
public/locales/en/gamelib.json
public/locales/{48 locales}/gamelib.json
public/locales/{48 locales}/gamelib.mt.json
  </files>

  <action>
**2a. Let the extractor write the English key.** Run `pnpm i18n`, then inspect the diff. Expect
exactly one added key, `installFlows.diskSpaceFreeOfTotal`, in `public/locales/en/gamelib.json`,
with the value `{{free}} free of {{total}}`. Immediately run `pnpm i18n-churn-guard` — if it names
any upstream path, the `gamelib:` prefix is missing at a call site: `git checkout -- public/locales/`
and fix the call site, never hand-edit the catalogue to paper over it.

**2b. Fill the 48 non-English locales.** Author the values in-session (constraint 3). The string is
one short phrase; both `{{free}}` and `{{total}}` placeholders must survive verbatim in every
target, and word order is the whole reason this is an interpolated key rather than concatenated
fragments — put the placeholders where the target language wants them.

**Validate before writing, with the REAL checker.** Import `validateTranslation` from
`meta/machineFillGamelib.ts` and the glossary terms from `meta/i18nGlossary.json`, and run every
candidate value through it. Include a sabotage control (e.g. a value with `{{free}}` deleted) and
prove the checker returns a problem for it — a validation pass that cannot be shown to fail is a
decoration.

**2c. Stamp MT provenance.** Append `installFlows.diskSpaceFreeOfTotal` to the `keys` array of each
locale's `gamelib.mt.json` (keep the array sorted) and update `filledAt`. `meta/__tests__/
gamelibCatalogParity.test.ts` only checks manifest-keys ⊆ catalogue-keys, so omitting this would not
turn CI red — but it would leave a machine-authored string looking human-authored to a Weblate
import, which is the exact harm D-10 provenance exists to prevent.

**Record the `model` discrepancy, do not hide it.** Each manifest carries ONE global `model` field,
today reading `claude-sonnet-5`. Leave it unchanged and state in the commit message that this key's
values were authored by the current model while the manifest's global field still reads
`claude-sonnet-5` — the same discrepancy the 2026-09-19 precedent recorded rather than concealed.

**Mechanics:** write the fill script into the scratchpad directory, NOT into the repo, so no
unformatted repo file is created. Keep each catalogue's key ordering consistent with what `pnpm
i18n` produces for `en`. Assert per-file that exactly one key was added and zero existing values
changed.

**No prettier check in this task** — `public/locales/` is in `.prettierignore` (constraint 7).
  </action>

  <verify>
    <automated>pnpm i18n-churn-guard</automated>
    <automated>pnpm lint-translations:gamelib</automated>
    <automated>npx jest --selectProjects Meta meta/__tests__/gamelibCatalogParity.test.ts</automated>
    <automated>node -e "const b=require('./meta/i18nCatalogPresenceBaseline.json'); if(b.totalPairs!==0) throw new Error('presence baseline drifted off zero: '+b.totalPairs)"</automated>
  </verify>

  <done>
`i18n-churn-guard` reports clean (no upstream catalogue changed). `lint-translations:gamelib` exits
0 with 0 findings. Catalogue parity passes for all 49 locales. The committed presence baseline is
untouched and still reads `totalPairs: 0` — i.e. the key is present and non-empty everywhere, and
the baseline was NOT regenerated to absorb a gap.
  </done>
</task>

<task type="auto">
  <name>Task 3: Full gate battery, todo closure, commit</name>
  <files>
.planning/todos/pending/2026-09-23-free-space-line-shows-two-unlabelled-figures.md
.planning/todos/completed/2026-09-23-free-space-line-shows-two-unlabelled-figures.md
  </files>

  <action>
**3a. Run the battery:** `pnpm codecheck`, `pnpm lint`, `pnpm planning-gates`, and the full
`pnpm test:ci`. Compare any failure against the known baseline recorded in STATE.md
(`rustInvokeChannel.test.ts` and the `gameDetailsFlows.test.ts` cross-test frame-leak flake class)
before treating it as a regression from this diff.

**3b. Close the todo with `git mv`:**
`git mv .planning/todos/pending/2026-09-23-free-space-line-shows-two-unlabelled-figures.md
.planning/todos/completed/`. The `pending/` frontmatter gates do not apply to `completed/`, so no
frontmatter edit is needed.

Append a short closure note to the moved file recording three things:
1. What shipped — the key name, the rendering, the 49-locale fill.
2. **The `message` residue.** `DiskSpaceData.message` is still built by
   `shellFilesFlowRegistration.ts:333` and still on the type, but now has ZERO consumers: the only
   two were the render sites this change rewired (constraint 6). Deliberately left in place —
   removing it touches the sidecar, `common/types.ts` and the backend suites, which is out of scope
   for a minor presentation fix. Recorded so it is not mistaken for an oversight.
3. **The D-06 naming collision.** `steamDialogSource.test.ts` bans the bare token `diskSize` to
   enforce "never gated on the GAME's size", which also catches `DiskSpaceData.diskSize` (the
   VOLUME's capacity) — a different quantity sharing a name. This plan routed around it via the
   shared helper rather than weakening the gate. Deliberately NOT filed as a separate todo: the
   helper is the right structure on DRY grounds anyway, so there is no live defect to track.

**3c. Commit** everything as ONE commit (source + all 97 catalogue files + the todo move) —
`en` gaining a key while the other 48 lag is exactly the presence-baseline drift that fails CI hard,
so the fill must not be split across commits. Include the `model`-field discrepancy note from 2c in
the message.
  </action>

  <verify>
    <automated>pnpm codecheck</automated>
    <automated>pnpm lint</automated>
    <automated>pnpm planning-gates</automated>
    <automated>test -f .planning/todos/completed/2026-09-23-free-space-line-shows-two-unlabelled-figures.md && test ! -f .planning/todos/pending/2026-09-23-free-space-line-shows-two-unlabelled-figures.md</automated>
    <automated>git status --porcelain | grep -q . && echo "UNCOMMITTED WORK REMAINS" && exit 1 || echo clean</automated>
  </verify>

  <done>
`codecheck` clean, `lint` both ceilings PASS, `planning-gates` 12/12, `test:ci` shows no regression
traceable to this diff. The todo is in `completed/` with its closure note. One commit, working tree
clean.
  </done>
</task>

</tasks>

<verification>
- `Space Available: <free> free of <total>` renders in both dialogs, with the "free of" fragment
  coming from `gamelib:installFlows.diskSpaceFreeOfTotal`, not from the sidecar.
- The arithmetic is untouched: no change to `getDiskInfo`, `notEnoughDiskSpace` or `spaceLeftAfter`.
- All three `diskSize` absence gates on SteamDialog pass unmodified.
- `totalPairs: 0` in the committed presence baseline, un-regenerated.
</verification>

<success_criteria>
A live operator reading the install dialog can state, without guessing, what each of the two figures
is — in any of the 49 shipped languages.
</success_criteria>

<output>
Create `.planning/quick/260923-vdq-label-both-figures-in-the-install-dialog/260923-vdq-SUMMARY.md`
when done.
</output>
