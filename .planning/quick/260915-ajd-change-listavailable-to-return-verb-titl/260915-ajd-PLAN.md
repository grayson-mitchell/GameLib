---
phase: quick-260915-ajd
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: [QUICK-260915-ajd]
files_modified:
  - src/common/types.ts
  - src/common/types/ipc.ts
  - src/backend/tools/winetricksListParse.ts
  - src/backend/tools/__tests__/winetricksListParse.test.ts
  - src/backend/tools/index.ts
  - src/frontend/components/UI/Winetricks/index.tsx
  - src/frontend/components/UI/Winetricks/WinetricksSearch/index.tsx
  - src/frontend/components/UI/Winetricks/WinetricksSearch/__tests__/winetricksInstallMouseRace.test.tsx

must_haves:
  truths:
    - "`Winetricks.listAvailable` resolves to an array of `{ verb, title, category, cached }`, never `string[]`."
    - "The parse is line-oriented over the joined chunks, so a chunk that coalesces several lines yields one component per line rather than dropping the trailing ones."
    - "A stdout line that is not a metadata line — notably macOS's `warning: taskset/cpuset not available on your platform!` — produces no component. Rejection is by positive shape match, not by skipping a fixed line index."
    - "A title containing its own parentheses (`allcodecs`) survives intact, including the text after the inner group."
    - "`cached` is derived from a flags token, not from an English substring search over the whole line, and the list invocation pins `LANG=C` so the flag words are English regardless of the user's locale."
    - "The `===== prefix =====` block is skipped by block, not by shape — its lines are bare category names that would otherwise pass the verb shape test."
    - "The Winetricks search panel behaves exactly as before: filter matches the verb only, the suggestion row renders the verb, and clicking Install passes the verb string to `winetricksInstall`."
    - "No new user-facing strings were added; `gamelib.json` is untouched."
  artifacts:
    - path: "src/backend/tools/winetricksListParse.ts"
      provides: "Pure, dependency-free `parseWinetricksListAll(chunks: string[]): WinetricksComponent[]`"
      exports: ["parseWinetricksListAll"]
    - path: "src/backend/tools/__tests__/winetricksListParse.test.ts"
      provides: "Unit coverage driven entirely by synthetic fixtures: both printf shapes, all four flag variants, the real >24-char verbs, chunk coalescing, the taskset noise line, the allcodecs nested-parens title, and the prefix-block skip"
    - path: "src/common/types.ts"
      provides: "`WinetricksComponent` type shared by backend, IPC and frontend"
      contains: "WinetricksComponent"
  key_links:
    - from: "src/backend/tools/index.ts"
      to: "src/backend/tools/winetricksListParse.ts"
      via: "listAvailable calls parseWinetricksListAll on the raw chunk array"
      pattern: "parseWinetricksListAll"
    - from: "src/common/types/ipc.ts"
      to: "common/types WinetricksComponent"
      via: "winetricksAvailable return type"
      pattern: "winetricksAvailable.*WinetricksComponent\\[\\]"
    - from: "src/frontend/components/UI/Winetricks/WinetricksSearch/index.tsx"
      to: "component.verb"
      via: "search filter and install callback"
      pattern: "\\.verb"
---

<objective>
Change `Winetricks.listAvailable` from returning `string[]` to returning
`{ verb, title, category, cached }[]`, and propagate that type through the IPC
surface to the frontend.

Purpose: the verb alone is not enough to build anything richer later — today the
title, publisher/year and cached flag printed by winetricks are read and then
thrown away one character into the line. This plan is the **data/type layer
only**. No UI redesign.

Output: a pure, unit-tested parser module; a shared `WinetricksComponent` type;
a rewired `listAvailable`; and a frontend that typechecks and behaves
identically to today.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md

Source files (read these; do not re-read a range twice):
@src/backend/tools/index.ts
@src/common/types/ipc.ts
@src/frontend/components/UI/Winetricks/index.tsx
@src/frontend/components/UI/Winetricks/WinetricksSearch/index.tsx
@src/frontend/components/UI/Winetricks/WinetricksSearch/__tests__/winetricksInstallMouseRace.test.tsx
</context>

<measured_facts>
Everything below was verified at `HEAD` (`fa2ad5030`). F-9 through F-12 come from
a live run of the real binary (disposable fake HOME, all eight containment vars,
`mkdtemp 0700`, `LANG=C LC_ALL=C`, chunks collected exactly as `runWithArgs`
collects them). Re-check line numbers before pinning them in an edit — they are
anchors, not gospel — but do not re-derive the findings.

**F-1 — the current implementation.** `src/backend/tools/index.ts:716-747`.
Runs `runWithArgs(runner, appName, ['dlls', 'list'], true)`, then again with
`['fonts', 'list']`, maps each element through `component.split(' ', 1)[0]`,
returns `[...dlls, ...fonts]`. `catch { return [] }`.

**F-2 — `runWithArgs` returns stdout CHUNKS, not lines.** Pinned at
`src/backend/tools/index.ts:669`: inside `child.stdout.on('data', ...)` the body
is `output.push(data)` — the raw chunk string, unsplit. Nothing downstream
splits it. So today's `split(' ', 1)[0]` takes the first word of each *pipe
read*, not of each line. **How much that actually costs is measured in F-9, and
it is far less than it sounds** — read F-9 before writing anything about it.

**F-3 — the two printf shapes.** From `winetricks_list_all` in the downloaded
script (`~/Library/Application Support/gamelib/tools/winetricks`, approx L4461-4483):

  `printf "%-24s %s %s\n"            "${code}" "${title}" "${flags}"`
  `printf "%-24s %s (%s, %s) %s\n"   "${code}" "${title}" "${publisher}" "${year}" "${flags}"`

`flags` is one of `` (empty), `[downloadable]`, `[cached]`, `[downloadable,cached]`.
The empty-flags case still emits a trailing space.

**F-4 — LOCALE GOTCHA, and a CORRECTION to the brief.** `winetricks_list_all`
localises the flag words. The script's own line is `case ${LANG} in` — it
switches on **`LANG`**, *not* `LC_ALL`. bg/da/de/fr/pl/pt/ru/uk/zh_CN/zh_TW each
get a translated word (de -> `gecached`, fr -> `mis en cache`, zh_CN -> `已缓存`).
**Setting only `LC_ALL=C` would be INERT for this defect.** Pin `LANG=C` (and
`LC_ALL=C` as belt-and-braces for any child tool), and pin it **only on the list
invocation** — the install path must keep the user's locale. Note the live probe
set *both* variables, so it did not discriminate between them; the basis for
this finding is the script source, which is dispositive.

**F-5 — `list-all` exists, is cheaper, and carries the category.** Dispatch at
approx L19854:

      for WINETRICKS_CURMENU in apps benchmarks dlls fonts prefix settings; do
          echo "===== ${WINETRICKS_CURMENU} ====="
          winetricks_list_all
      done

One wine invocation instead of two. Counts in the currently-downloaded script:
apps 57, benchmarks 8, dlls 328, fonts 42, settings 132 — total 567, which
matches `grep -oE '^w_metadata [^ ]+' | sort -u | wc -l` exactly. That static
grep is the cross-check to use when you want a ground-truth count; it does not
require running anything.

**F-6 — `prefix` is a trap.** `winetricks_list_all` early-returns for
`prefix|main|mkprefix` and echoes `${WINETRICKS_CATEGORIES}` one per line. The
`===== prefix =====` block therefore contains **category names, not verbs**.
It must be skipped **as a block**. Shape-filtering cannot save you here: the
names it emits (`apps`, `dlls`, `fonts`, `settings`) are lowercase words that
pass the verb shape test of F-11 perfectly.

**F-7 — the propagation surface is exactly this, and it is small.**

| site | what |
|---|---|
| `src/backend/tools/index.ts:716` | `listAvailable` itself |
| `src/common/types/ipc.ts:193` | `winetricksAvailable: (runner, appName) => Promise<string[]>` — the ONLY type declaration |
| `src/backend/tools/ipc_handler.ts:68` | passthrough `return await Winetricks.listAvailable(...)`, `catch { return [] }` — **needs no edit**, verify rather than assume |
| `src/backend/sidecar/wineToolsFlowRegistration.ts:301` | same passthrough shape — **needs no edit**, verify |
| `src/preload/api/wine.ts:16` | `makeHandlerInvoker('winetricksAvailable')` — generic, **needs no edit** |
| `src/frontend/.../Winetricks/index.tsx:57` | `useState<string[]>([])` |
| `src/frontend/.../WinetricksSearch/index.tsx:6,29-32,~74-94` | `Props.allComponents`, the filter, the render |
| `src/frontend/.../WinetricksSearch/__tests__/winetricksInstallMouseRace.test.tsx:131,184` | a local `Props` mirror and the `['vcrun','corefonts']` fixture |

**F-8 — nothing else pins the shape.** `src/backend/platform/types.ts` and
`src/backend/platform/__tests__/types.usage.test.ts` contain **zero** winetricks
references. `src/backend/sidecar/__tests__/wineToolsFlows.test.ts` mocks
`listAvailable: jest.fn()` with no return-shape assertion.
`DeferredChannelCallSiteGuard.test.ts` is about *channel names*, not shapes.
`src/backend/__tests__/knownFixes.test.ts`'s `winetricks:` keys are the
KnownFixes JSON schema — unrelated, do not touch.

**F-9 — MEASURED: chunk coalescing is a low-rate nondeterministic dropout, not a
structural failure.** Two consecutive live runs of `winetricks dlls list`:

| run | lines | chunks | chunks carrying >1 line | verbs lost by today's code |
|---|---|---|---|---|
| A | 329 | 326 | 1 (carried 5 lines) | 3 |
| B | 329 | 329 | 0 | 0 |

`winetricks_list_all` sources each metadata file in its own subshell with its own
`printf`, so the pipe almost always flushes one line per write and chunk ==
line. **Today's code therefore returns an essentially complete list** — 328 dll
verbs, matching the static `w_metadata` grep exactly. Run B lost nothing at all.
The line-splitting fix is still structurally forced (you cannot build
`{verb,title,category,cached}` records out of chunk-leading words), and the
coalescing is genuinely nondeterministic, so the fix buys **determinism**, not
rescue. Do not describe it as anything more. See C-1.

**F-10 — NEW, MEASURED: stdout carries non-component noise.** The first line of
output on macOS, verbatim:

      warning: taskset/cpuset not available on your platform!

Today that becomes a component literally named `warning:`. Source is
`winetricks` L5009-5016 — a bare `echo` (so **stdout**, not stderr) in the
`else` arm of a `taskset`/`cpuset` probe, with the in-script comment "not using
w_warn so we don't annoy everyone running via GUI, but still printed to
terminal". It is **platform-dependent**: Linux and FreeBSD have `taskset` or
`cpuset` and emit nothing. So **do not skip a fixed first line** — on Linux that
would eat a real verb. This is a class, not a single line: `w_warn` itself
correctly writes to stderr (`>&2`, L256-261), but L4426 is a second bare-`echo`
warning on stdout, proving the pattern recurs. The parser must **positively
match the metadata line shape and reject everything else.**

**F-11 — MEASURED: the verb charset, and a header-ordering trap.** Census over
all 567 verbs (`grep -oE '^w_metadata [^ ]+' | awk '{print $2}' | sort -u`, then
a per-character sort): the complete set of characters used is exactly
`[a-z0-9_=]`. No uppercase, no `.`, no `-`, no `+`, no `:`. `=` appears only in
settings verbs (`fontsmooth=rgb`, `dpi=120`, `alldlls=builtin`,
`autostart_winedbg=disabled`). So `warning:` is rejected on the `:`.

**The trap:** because `=` is a legal verb character, the `=====` header
delimiter also matches a naive `^[a-z0-9_=]+$` test. The header check must run
**first**, and the verb shape test must require the first character to be
alphanumeric or underscore so `=====` cannot slip through if header matching
ever regresses.

**F-12 — MEASURED: real verbs exceed the `%-24s` column, and real titles contain
parentheses.** Two verbs are longer than 24 characters —
`autostart_winedbg=disabled` (26) and `autostart_winedbg=enabled` (25) — and two
sit exactly at 24 (`windowmanagerdecorated=y`/`-n`). All four are `settings`
verbs, so they are reachable **only** under `list-all` (C-2); the old
`dlls list` + `fonts list` pair never saw them. Use the real ones as fixtures
rather than inventing a long verb.

On parentheses, this real line is `od -c`-verified:

      allcodecs               All codecs (dirac, ffdshow, icodecs, cinepak, l3codecx, xvid) except wmp (various, 1995-2009) [downloadable]

(`w_metadata allcodecs dlls`, L10774-10778: `title="All codecs (dirac, ffdshow,
icodecs, cinepak, l3codecx, xvid) except wmp"`, `publisher="various"`,
`year="1995-2009"`.) Any `(publisher, year)` regex anchored on the **first** `(`
captures `dirac, ffdshow, ...` and truncates the title.
</measured_facts>

<called_out_behaviour_changes>
Two changes here are **user-visible**. Neither is being slipped in; both are
named, and both must be restated in the SUMMARY — accurately, in the terms
below.

**C-1 — the returned list becomes deterministic and gains the noise filter. It
does not go from broken to working.** Per F-9, today's chunk-leading-word parse
already returns an essentially complete list, because winetricks flushes roughly
one line per write; one measured run lost 3 verbs of 329, the next lost 0. After
this plan the count is stable at the ground truth regardless of pipe timing, and
the macOS `warning:` pseudo-component (F-10) stops appearing. **Do not write
that the function "did not return a component list" or that it returned "a
handful of chunk-leading words"** — that is false against the measurement, and a
SUMMARY that overstates the baseline makes a false claim about the fix's value.
The honest framing is: *timing-dependent dropout, measured at 3/329 and 0/329 on
consecutive runs, plus one platform-dependent junk entry, both eliminated.*

**C-2 — `list-all` replaces `dlls list` + `fonts list`.** This is the
recommended choice and this plan takes it: one wine invocation instead of two,
it supplies `category` for free, and it stops silently dropping the 57 apps,
132 settings and 8 benchmarks that winetricks can already install. The `prefix`
block is skipped (F-6). This is the change that actually widens what the user
can find — roughly 370 verbs to 567. If you decide against it mid-execution, say
so explicitly in the SUMMARY and keep `category` populated as `'dlls' | 'fonts'`
— do not quietly leave it empty.

Both changes are confined to *which verbs the search can find*. No install
codepath, no dialog layout, no new string.
</called_out_behaviour_changes>

<out_of_scope>
Do not do any of these. Each is a separate follow-up, and each is individually
tempting enough to be worth naming:

- Any UI redesign: no grouped/browse list, no curated "commonly needed" group,
  no collapsed category sections, no install-state rendering change, no
  ProgressDialog changes.
- **Changing the search filter to also match `title`.** Nearly free once the
  data is there. Still out of scope. The filter matches `verb` and only `verb`.
- Rendering `title`, `category` or `cached` anywhere in the UI. The fields exist
  and go unused for now. That is the intended end state of this plan.
- **Splitting `publisher` and `year` out of `title` into their own fields.** The
  agreed shape has four keys. See Task 1 — declining this is also what makes
  F-12's parenthesis hazard structurally impossible rather than merely tested.
- Touching the mousedown-race fix, the `SearchBar` component, or the
  `declaredUnavailable` / `callOrDeclare` machinery.
- Any new user-facing string. **If you find yourself writing a `t()` key, stop —
  that is the signal that the plan has drifted out of scope.** No `gamelib.json`
  edit should be needed or made.
</out_of_scope>

<project_conventions_that_bite_here>
Read from `CLAUDE.md` and this project's measured history. These are not
boilerplate; each one has drawn blood in this repo.

- **`pnpm lint` has ZERO headroom.** `meta/lintScoped.cjs` sets
  `SRC_CEILING = 1124` and `TESTS_CEILING = 638`, and its own comment states
  "Neither ceiling carries padding: each sits at its exact measured warning
  [count]". Any *new* warning fails the gate. If a new warning is genuinely
  correct, bump the ceiling **with a dated one-line comment** following the
  existing `SRC_CEILING bumped 1123 -> 1124 by Phase 43 Plan 07` convention.
  Never widen a gate's vocabulary or ceiling silently to admit a failure.
- **Never pipe a build or test to `tail`** — it reports `tail`'s exit code, not
  the command's, and a stale artifact then "proves" the fix broke something.
  Every verify block redirects to a file and echoes `$?`.
- **Do not chain a write and a jest run in one shell command.** `... && npx jest`
  reads a stale transform. Edit, then run jest as a *separate* invocation.
- **`--selectProjects` is case-sensitive and exits 0 on a miss.** The display
  names are exactly `Backend`, `Common`, `Frontend`, `Preload`, `Meta`. Always
  pass `--passWithNoTests` alongside it so a silent zero-match is impossible to
  mistake for a pass — and read the printed suite/test counts, do not trust the
  exit code alone.
- **`pnpm test:ci` is RED at head** from an unrelated leaked store-embed timer.
  Do not run the full suite as a gate. Scope every run, and capture a baseline
  first (Task 1 step 0) so a pre-existing red is never misread as yours.
- **Backend jest sets `resetMocks: true`.** Not an issue for the new pure test
  (it has no mocks) — noted so you do not add a `jest.mock` factory and watch it
  get stripped.
- Backend imports common types as `from 'common/types'` (tsconfig `baseUrl` is
  `./src/`). Follow that, not a relative path.
- This is a **desk-ready** change. Do **not** plan or run a live app launch, and
  do **not** write a test that shells out to the real winetricks binary — see the
  fixture rule in Task 1.
</project_conventions_that_bite_here>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Shared type + pure parser module + unit tests</name>
  <files>src/common/types.ts, src/backend/tools/winetricksListParse.ts, src/backend/tools/__tests__/winetricksListParse.test.ts</files>

  <behavior>
  The parser is a pure function over the raw chunk array. Tests come first and
  must fail before the module exists.

  **FIXTURE RULE — load-bearing.** Every test drives synthetic string fixtures.
  **No test may shell out to the real winetricks binary.** F-9's run B passed
  against the *unfixed* code, so a test asserting against live output proves
  nothing on a good day and flakes on a bad one. Fixtures are also how the
  chunk-coalescing case gets exercised deterministically at all.

  - Both printf shapes of F-3 parse: `vcrun2019   Visual C++ 2019 Libraries [downloadable,cached]`
    and `adobeair   Adobe AIR (Adobe, 2019) [downloadable]`.
  - All four flag variants: absent, `[downloadable]`, `[cached]`,
    `[downloadable,cached]` -> `cached` is `false,false,true,true` respectively.
  - Empty-flags line (F-3 emits a trailing space) yields `cached: false` and a
    `title` with no trailing whitespace.
  - **Chunk coalescing (F-9):** one chunk carrying 5 complete lines yields 5
    components. A second case splits a single line across two chunks mid-verb and
    yields one correct component. Both must fail against a per-chunk
    `split(' ', 1)[0]`.
  - **The >24-char verb trap, with the real verbs (F-12):**
    `autostart_winedbg=disabled` (26 chars, followed by exactly ONE space) and
    `windowmanagerdecorated=y` (exactly 24, so padded to 24 then one space).
    These must fail against any implementation that slices at a fixed column.
  - **Noise rejection (F-10):** a fixture whose first line is
    `warning: taskset/cpuset not available on your platform!` yields **no**
    component for it, and the real lines around it still parse. Assert
    positively that no returned `verb` is `'warning:'` — and assert the total
    count, so a parser that drops everything also fails.
  - **Nested-parens title (F-12):** the verbatim `allcodecs` line. Assert
    `verb === 'allcodecs'`, `cached === false`, and — explicitly —
    `title.includes('except wmp')`, so a future edit that anchors on the first
    `(` turns this red.
  - **The `prefix` block is skipped as a block (F-6):** a fixture containing
    `===== prefix =====` followed by `apps`, `dlls`, `fonts` yields zero
    components from that block, and components from the blocks around it are
    still returned. Note these names pass the verb shape test, so this can only
    be satisfied by the block skip.
  - `category` is taken from the enclosing `===== <name> =====` header and is one
    of `apps | benchmarks | dlls | fonts | settings`.
  - Lines appearing before the first `=====` header are dropped.
  - Duplicate verbs are deduped, first occurrence wins.
  </behavior>

  <action>
  **Step 0 — capture the baseline before touching anything.** Record
  `git rev-parse HEAD`, then run the two scoped suites this plan will disturb and
  save their output. A pre-existing failure recorded now is a "pre-existing"
  claim anchored to a named sha; one asserted later is not.

  Add `WinetricksComponent` to `src/common/types.ts` alongside the other exported
  interfaces: `verb: string`, `title: string`, `category: string`,
  `cached: boolean`. Exactly four fields. Publisher and year stay **embedded in
  `title`** as winetricks printed them (`Adobe AIR (Adobe, 2019)`). This is not
  laziness: per F-12 it is what makes the nested-parens hazard structurally
  impossible. With no publisher/year extraction there is no `(` to anchor on, so
  `allcodecs` cannot truncate. Do not invent `publisher`/`year` fields. If a
  later plan adds them, **it** must anchor on the LAST parenthesised group
  preceding the optional trailing `[flags]` — say so in a comment above the type.

  Create `src/backend/tools/winetricksListParse.ts` exporting
  `parseWinetricksListAll(chunks: string[]): WinetricksComponent[]`. It must
  import nothing but the type — no electron, no logger, no fs — so the Backend
  jest project can load it in isolation without dragging in the storeManagers
  graph. Implementation shape, in this order:

  1. Join the chunks with the empty string, split on `/\r?\n/`.
  2. **Header first** (F-11's ordering trap): match `/^===== (\S+) =====$/`
     exactly and set `currentCategory`. This must precede the verb test, because
     `=====` is built from `=`, a legal verb character.
  3. Skip the line while `currentCategory` is unset or is `prefix` (F-6).
  4. Split off the first token with one linear-time end-anchored match that
     *requires* whitespace and a remainder — a metadata line always has a title,
     so a bare single-token line is rejected here.
  5. **Positively match the verb shape** (F-10, F-11):
     `/^[a-z0-9_][a-z0-9_=]*$/`. First character alphanumeric-or-underscore so
     `=====` cannot slip through; remaining characters from the measured
     567-verb charset. Reject anything else — this is what kills `warning:`.
     Put the F-11 census in a comment so the next reader does not "helpfully"
     widen the class to `\S+`.
  6. Strip a trailing bracket group from the remainder with an end-anchored match
     over a negated character class — **not** `.*` inside brackets. Keep it
     linear, no nested quantifiers (see the threat model). Split the contents on
     `,`, trim each, and set `cached` by **exact token equality against
     `'cached'`**, not by `line.includes('cached')`.
  7. Whatever remains, trimmed, is `title`.

  Write the test file first, watch it fail, then write the module.
  </action>

  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; pnpm exec jest --selectProjects Backend --passWithNoTests src/backend/tools/__tests__/winetricksListParse.test.ts > /tmp/wt-parse.txt 2>&amp;1; echo "EXIT=$?"; cat /tmp/wt-parse.txt</automated>
  </verify>

  <done>
  `WinetricksComponent` is exported from `src/common/types.ts`.
  `parseWinetricksListAll` exists, imports only the type, and the new suite runs
  under `--selectProjects Backend` with a non-zero test count printed and
  `EXIT=0`. Every bullet in `<behavior>` has at least one assertion.
  `grep -rn "spawn\|execSync\|child_process" src/backend/tools/__tests__/winetricksListParse.test.ts`
  returns nothing. The coalescing, >24-char-verb, noise-rejection and
  nested-parens tests were each confirmed RED before the module was written.
  </done>
</task>

<task type="auto">
  <name>Task 2: Rewire listAvailable to `list-all` with LANG pinned, and update the IPC type</name>
  <files>src/backend/tools/index.ts, src/common/types/ipc.ts</files>

  <action>
  **2a — a narrowly-scoped env override on `runWithArgs`.** Add an optional fifth
  parameter `envOverrides?: Record&lt;string, string&gt;` to the signature at
  `src/backend/tools/index.ts:553-558`, and merge it **last** at the
  `const envs = isMac ? macEnvs : linuxEnvs` line (approx `:635`) so it wins over
  both branches. Defaulting to `undefined` keeps the spread a no-op, which means
  the `run`/`install`/GUI call sites are byte-identical in behaviour — that is
  the point of the narrow option, and it is why we are not changing the env for
  every winetricks call. **The install path must keep the user's locale.**

  **2b — rewrite `listAvailable`** (`:716-747`) to a single call:
  `runWithArgs(runner, appName, ['list-all'], true, { LANG: 'C', LC_ALL: 'C' })`,
  then `return parseWinetricksListAll(output ?? [])`. Keep the existing
  `catch { return [] }` exactly as it is — an empty list is documented at
  `wineToolsFlowRegistration.ts:299` as an ACCEPTABLE DATA RESULT, not a platform
  decline, and that framing must survive.

  `LANG` is the load-bearing variable, per F-4 — the script's own line is
  `case ${LANG} in`. Leave a short comment at the call site saying so, because
  the next reader's instinct will be that `LC_ALL` is the one that matters and
  they will be wrong. In the same comment note that `list-all` was chosen over
  `dlls list` + `fonts list`, and that the `prefix` block is intentionally
  discarded by the parser (F-6), so nobody "restores" it later as a bug fix.

  **2c — the type.** `src/common/types/ipc.ts:193` becomes
  `winetricksAvailable: (runner: Runner, appName: string) => Promise&lt;WinetricksComponent[]&gt;`.
  Add `WinetricksComponent` to the existing `import type { ... } from 'common/types'`
  block at the top of that file (alphabetical, matching the surrounding style).

  **2d — verify the three passthroughs need no edit** rather than assuming it:
  `src/backend/tools/ipc_handler.ts:68`,
  `src/backend/sidecar/wineToolsFlowRegistration.ts:301`, and
  `src/preload/api/wine.ts:16`. All three are shape-generic. If `tsc` disagrees
  with that reading, `tsc` is right — fix the site and record the correction in
  the SUMMARY, because it means F-7 undercounted the surface.
  </action>

  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; pnpm codecheck > /tmp/wt-tsc-2.txt 2>&amp;1; echo "EXIT=$?"; tail -40 /tmp/wt-tsc-2.txt</automated>
  </verify>

  <done>
  `listAvailable` makes exactly one `runWithArgs` call, with `['list-all']` and
  `{ LANG: 'C', LC_ALL: 'C' }`, and returns `parseWinetricksListAll(...)`.
  `grep -n "dlls', 'list'\|fonts', 'list'" src/backend/tools/index.ts` returns
  nothing. `src/common/types/ipc.ts` declares
  `Promise&lt;WinetricksComponent[]&gt;`. `pnpm codecheck` exits non-zero **only**
  with errors in the three frontend files Task 3 will fix — no backend, common or
  preload errors remain.
  </done>
</task>

<task type="auto">
  <name>Task 3: Propagate the type to the frontend with behaviour held constant</name>
  <files>src/frontend/components/UI/Winetricks/index.tsx, src/frontend/components/UI/Winetricks/WinetricksSearch/index.tsx, src/frontend/components/UI/Winetricks/WinetricksSearch/__tests__/winetricksInstallMouseRace.test.tsx</files>

  <action>
  **3a — `Winetricks/index.tsx:57`:** `useState&lt;WinetricksComponent[]&gt;([])`.
  Nothing else in that file changes. `setAllComponents(result.value)` still
  typechecks, the `allComponents.length !== 0` gate at `:156` and the
  `=== 0` gate at `:180` are untouched, and `install(component: string)` keeps
  its `string` parameter — it is called with a verb.

  **3b — `WinetricksSearch/index.tsx`:** `Props.allComponents` (`:6`) becomes
  `WinetricksComponent[]`. `searchResults` state becomes `WinetricksComponent[]`.
  The filter at `:29-32` becomes
  `allComponents.filter((c) =&gt; c.verb.includes(search))` then
  `.filter((c) =&gt; !installed?.includes(c.verb))`. **The filter matches
  `verb` and only `verb`** — matching `title` is explicitly out of scope, and
  `installed` is a list of verbs from `winetricks.log`, so comparing it to
  anything but `verb` would be wrong as well as out of scope.

  In the suggestions map (approx `:74-94`), the element is now a
  `WinetricksComponent`: `&lt;li key={c.verb}&gt;`, `&lt;span&gt;{c.verb}&lt;/span&gt;`,
  and both the `onMouseDown` and `onClick` handlers call `install(c.verb)`.
  `install` keeps its `(component: string)` signature. **Do not render `title`,
  `category` or `cached`** — they are carried and deliberately unused.

  The load-bearing MOUSE-CLICK RACE comment block and its `suppressNextClick`
  ref are untouched. `e.preventDefault()` on mousedown stays. Do not
  "tidy" any of it while you are in the file.

  **3c — `winetricksInstallMouseRace.test.tsx`:** the local `Props` mirror at
  `:131` and the fixture at `:184`. The fixture becomes two full
  `WinetricksComponent` objects whose `verb`s are still `'vcrun'` and
  `'corefonts'` — give them plausible `title`/`category`/`cached` values so the
  fixture cannot pass by accident with a stub. **Every assertion stays exactly as
  written**, including the one that `onInstallClicked` receives `'vcrun'`: this
  test proves the mousedown race fix, and a test rewritten to make the compiler
  happy is a green check proving nothing. If an assertion will not compile,
  change the *fixture*, never the expectation.

  Prefer changing the local `Props` mirror to `import type { WinetricksComponent }`
  over re-declaring the four fields inline, so the mirror cannot drift from the
  real type later.
  </action>

  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib &amp;&amp; pnpm exec jest --selectProjects Frontend --passWithNoTests src/frontend/components/UI/Winetricks > /tmp/wt-fe.txt 2>&amp;1; echo "JEST_EXIT=$?"; cat /tmp/wt-fe.txt; pnpm codecheck > /tmp/wt-tsc-3.txt 2>&amp;1; echo "TSC_EXIT=$?"; tail -40 /tmp/wt-tsc-3.txt; pnpm lint > /tmp/wt-lint.txt 2>&amp;1; echo "LINT_EXIT=$?"; tail -30 /tmp/wt-lint.txt</automated>
  </verify>

  <done>
  `JEST_EXIT=0` with a non-zero suite AND test count printed (a zero-match under
  `--passWithNoTests` also exits 0 — read the counts, not just the code).
  `TSC_EXIT=0` across the whole project. `LINT_EXIT=0` with both ceilings
  unbumped, or bumped with a dated justifying comment. `git diff` shows zero
  changes under `public/locales/` and zero new `t(` call sites.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| winetricks stdout -> `parseWinetricksListAll` | Output of a shell script downloaded over the network at runtime, parsed in the backend process. Semi-trusted: the script is already *executed* today, so parsing its output adds no new execution privilege, but it does add a new parser attack surface — and F-10 shows the stream is already known to carry lines that are not components. |
| backend -> renderer (`winetricksAvailable` IPC) | The parsed records now cross the IPC boundary with more fields than before. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ajd-01 | Denial of Service | `parseWinetricksListAll` regexes | mitigate | Use only end-anchored matches over negated character classes; no nested quantifiers and no `(.*)+`-shaped patterns, so matching stays linear in line length. Catastrophic backtracking on a crafted long line is the realistic failure mode here, and it is designed out rather than tested away. |
| T-ajd-02 | Denial of Service | joining all stdout chunks into one string | accept | `runWithArgs` already buffers the complete output in `output[]` before `listAvailable` sees it (`src/backend/tools/index.ts:669`), so the join adds a second copy of an already-bounded ~40 KB payload. No new unbounded growth. |
| T-ajd-03 | Spoofing | a non-metadata stdout line masquerading as a component | mitigate | F-10 is the benign instance of this and is already live today (`warning:`). The fix is the positive shape match of F-11 (`/^[a-z0-9_][a-z0-9_=]*$/`, measured across all 567 verbs), not a denylist and not a fixed-line skip. A denylist would have to be extended every time the script gains a new bare `echo`. |
| T-ajd-04 | Tampering | field values reaching the renderer | accept | `title` and `category` are carried but **never rendered** by this plan (see `<out_of_scope>`); only `verb` is displayed, exactly as today, and `verb` is now constrained to `[a-z0-9_=]`. If a later plan renders `title`, that plan owns the injection question — React escapes by default, but the decision belongs to whoever makes the field visible. |
| T-ajd-05 | Elevation of Privilege | verb passed to `winetricksInstall` | accept | Unchanged from today, and now *narrower*: the verb still originates from winetricks' own metadata and is still passed as a discrete `spawn` argv element, never through a shell, but the F-11 shape match additionally guarantees it contains no shell metacharacters. `list-all` widens *which* of winetricks' own verbs can be selected (C-2); it does not admit an attacker-chosen string. |
| T-ajd-SC | Tampering | npm/pip/cargo installs | n/a | **This plan installs no packages.** No `package.json` edit, no lockfile change. If execution finds it needs a dependency, stop and re-plan — the Package Legitimacy Gate applies and this register does not cover it. |
</threat_model>

<verification>
Run from the repo root, in order, each as its own invocation (never chained
behind a write — jest reads stale otherwise):

1. `pnpm exec jest --selectProjects Backend --passWithNoTests src/backend/tools/__tests__/winetricksListParse.test.ts` — new parser suite green, counts non-zero.
2. `pnpm exec jest --selectProjects Frontend --passWithNoTests src/frontend/components/UI/Winetricks` — mouse-race suite still green, counts non-zero.
3. `pnpm codecheck` — exit 0 project-wide.
4. `pnpm lint` — exit 0, both ceilings honoured.
5. `git diff --stat` — touches only the eight files in `files_modified`; nothing under `public/locales/`.

Negative controls. Every one of these must be run and its RED confirmed — the
whole point of F-9 is that a test in this area can pass against unfixed code:

- Revert `parseWinetricksListAll` to operate per-chunk and confirm the
  **coalescing** test turns RED. If it stays green, that test does not test what
  F-9 describes.
- Delete the verb shape check (step 5) and confirm the **noise-rejection** test
  turns RED with a component named `warning:`.
- Change the title extraction to anchor on the first `(` and confirm the
  **`allcodecs`** test turns RED on `title.includes('except wmp')`.
- Move the header check after the verb shape test and confirm the **category**
  assertions turn RED (F-11's `=====` ordering trap).
- Flip one flags fixture from `[downloadable,cached]` to `[downloadable]` and
  confirm the `cached` assertion turns RED.

No live app run. No test that shells out to the real winetricks binary. No
`pnpm test:ci` (red at head for unrelated reasons).
</verification>

<success_criteria>
- `Winetricks.listAvailable` returns `WinetricksComponent[]`; `grep -n "string\[\]" src/backend/tools/index.ts` shows no match on its signature or return path.
- `src/common/types/ipc.ts` declares `winetricksAvailable` as `Promise<WinetricksComponent[]>`.
- The Winetricks panel's search behaviour is unchanged: filter on verb, render verb, install the verb.
- Zero new user-facing strings; `public/locales/` untouched.
- `pnpm codecheck` and `pnpm lint` both exit 0; both scoped jest suites green with non-zero counts.
- All five negative controls in `<verification>` were run and confirmed RED.
- C-1 and C-2 are restated in the SUMMARY **in the calibrated terms given in `<called_out_behaviour_changes>`** — not overstated.
</success_criteria>

<output>
Create `.planning/quick/260915-ajd-change-listavailable-to-return-verb-titl/260915-ajd-SUMMARY.md` when done.

The SUMMARY must record:
- **C-1 in its calibrated form:** timing-dependent dropout measured at 3/329 and
  0/329 on consecutive live runs, plus one platform-dependent `warning:` junk
  entry on macOS — both eliminated. The fix buys determinism and noise
  rejection. **Do not claim the baseline was broken or returned "a handful of
  words".** Overstating it would put a false claim in the record.
- **C-2** with the measured counts (roughly 370 -> 567 verbs).
- The F-4 correction: winetricks switches on `LANG`, not `LC_ALL` — pinning only
  `LC_ALL` would have been inert. Note the live probe set both and so did not
  discriminate; the script source is the basis.
- That publisher/year were deliberately left embedded in `title`, and that this
  is what makes F-12's nested-parens truncation structurally impossible.
- The result of each of the five negative controls.
- Whether F-7's propagation surface was complete, or whether `tsc` found a site
  it missed.
- Whether either lint ceiling was bumped, and why.
</output>
