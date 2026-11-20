---
phase: quick-260907-rjc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/todos/pending/2026-08-24-eos-remove-dialog-renders-as-a-native-system-dialog-not-app-styled.md
autonomous: true
requirements: [QUICK-260907-rjc]

must_haves:
  truths:
    - "The todo's title no longer asserts the EOS remove dialog is native — that claim is false at HEAD."
    - "A reader can tell this is a verified rewrite dated 2026-09-07, not the original 2026-08-24 analysis, and can see WHY the original was wrong."
    - "The three live shim-collapse defects (VCRuntime 3-button, Snap checkbox, sideloaded-game fail-open unload) are each recorded with file, line, mechanism, and platform gating."
    - "The census reads 10 live sites, each at a line that resolves at HEAD."
    - "Trap 1 and Trap 2 are recorded as CLOSED/MITIGATED with their closing evidence; Trap 3 is recorded as still live."
    - "Both memory cross-links survive and are each labelled HISTORICAL."
    - "The suggested shape contains exactly two items: the native-vs-in-app policy decision, and the three shim-collapse fixes. No EOS migration, no Dialog-primitive styling step."
    - "The todo still has no resolves_phase field and status stays OPEN."
  artifacts:
    - path: ".planning/todos/pending/2026-08-24-eos-remove-dialog-renders-as-a-native-system-dialog-not-app-styled.md"
      provides: "Rewritten, HEAD-accurate todo"
      contains: "2026-09-07"
      min_lines: 70
  key_links:
    - from: "the todo's defect section"
      to: "src/backend/platform/index.ts showMessageBox shim"
      via: "named common cause of all three defects"
      pattern: "platform/index\\.ts"
    - from: "the todo's files: frontmatter"
      to: "the four still-live source files"
      via: "frontmatter files list"
      pattern: "storeManagerCommon/games\\.ts"
---

<objective>
Rewrite one stale todo in place so it describes HEAD instead of 2026-08-24.

The todo's headline claim ("the EOS overlay remove confirmation renders as a NATIVE system
dialog") is FALSE at HEAD — Phase 35 plan 26 moved that confirmation into the renderer. Two of
its three "traps" are closed. Its census over-counts. Meanwhile three genuinely live defects,
introduced after it was written by the Rust dialog shim's narrower contract, are unrecorded
anywhere.

Purpose: a future reader must not act on a false premise, and must not lose the three real
defects that are currently recorded nowhere.

Output: the same file path, rewritten. NO source-code change is in scope.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/todos/pending/2026-08-24-eos-remove-dialog-renders-as-a-native-system-dialog-not-app-styled.md
</context>

<verified_findings>
These were verified against HEAD by the orchestrator AND re-confirmed by the planner on
2026-09-07 at the exact anchors below. They are GIVEN. Spot-check that each anchor still
resolves (files drift), correct any drifted line number, and do NOT re-litigate the conclusions.

**A — the headline item is FIXED (Phase 35 plan 26, REQ-35-17, closes D-35-11-01).**
`src/backend/storeManagers/legendary/eos_overlay/eos_overlay.ts:173` `remove(confirmed)` no
longer calls `dialog.showMessageBox`; it only enforces a fail-closed `confirmed !== true` gate
at `:174` (T-35-122). The confirmation is raised app-styled in the renderer at
`src/frontend/screens/Settings/sections/AdvancedSettings/index.tsx:250`
(`confirmRemoveEosOverlay`, via `showDialogModal`); only the affirmative button's `onClick`
calls `removeEosOverlay()`, which passes the literal `true`. Regression test:
`src/frontend/screens/Settings/sections/AdvancedSettings/__tests__/removeEosOverlayConfirmation.test.tsx`.

The structural reason recorded in `eos_overlay.ts`'s docstring GENERALISES and belongs in the
rewrite: an ASKING dialog can never be moved to the renderer through the ONE-WAY
`showDialogBoxModalAuto` backend-dialog path. The answer has to be gathered renderer-side and
passed back in. Any future migration of the remaining sites inherits that shape.

**B — Trap 1 (the in-app `Dialog` primitive is not really styled) is FIXED.**
quick `260820-kq0` round 3 reimplemented the styling INSIDE the primitive:
`src/frontend/components/UI/Dialog/components/Dialog.tsx:50` is a `styled(Paper)` override
(`backgroundColor: 'var(--modal-background)'`, `borderRadius: '10px'`), plus MUI's own
`TransitionComponent={SlideUpTransition}` / `transitionDuration={500}` at `:128`, which replaces
the dead rule's never-firing opacity/translateY entrance.

The booby trap the todo warned about is therefore MOOT: nothing was applied to the Paper, the
intent was re-expressed in MUI's own mechanism, so no dialog was ever rendered invisible.
RESIDUE ONLY: `src/frontend/components/UI/Dialog/index.css` still carries dead
`.Dialog__element` (`:10`, `:39`, `:43`), `.Dialog__header` (`:50`) and `.Dialog__Close*`
(`:64`, `:76`, `:103`) blocks as cruft. The live rules are `.Dialog__footer` (`:115`,
DialogFooter.tsx) and the caller-supplied `className` on DialogContent.tsx. Dead-CSS cleanup is
COSMETIC, not blocking.

**C — Trap 2 (a rejecting dialog crashes the sidecar) is MITIGATED.**
`src/backend/platform/index.ts:459` `showMessageBox` forwards to `RUST_DIALOG_MESSAGE` and on
ANY transport error or timeout resolves `{ response: safeIndex, checkboxChecked: false }` — it
never rejects, never throws. `safeIndex` is `options?.cancelId ?? (options?.buttons?.length ?? 1) - 1`,
i.e. the CALLER's own declared `cancelId`, never a positional heuristic.
`src/backend/sidecar/processGuards.ts` installs a process-level `unhandledRejection` guard as
defence in depth. The never-reject contract the todo asked for already exists and is documented
in place.

**D — Trap 3 (inverted response semantics) is STILL LIVE.**
`src/backend/utils.ts:281` (`handleExit`): index 0 is the SAFE "No", index 1 is the DESTRUCTIVE
"Yes". It now carries an explicit `cancelId: 0` (CR-04) precisely because the shim's positional
fallback would otherwise have resolved to the destructive branch on any transport error. The
trap survives as a live constraint on any future migration: preserve each caller's response
polarity.

**E — the census is 10 live sites, not ~14.** Excluding tests, `__mocks__`, `electronStub`,
comment-only mentions, and the legitimate native fallback arm at
`src/backend/dialog/dialog.ts:45`. All ten anchors confirmed present on 2026-09-07:

| Site | Role | Note |
|------|------|------|
| `src/backend/utils.ts:281` | handleExit / quit confirmation | INVERTED polarity, `cancelId: 0` |
| `src/backend/utils.ts:343` | folder-not-found → force-uninstall | cancelId declared |
| `src/backend/utils.ts:843` | VCRuntime not installed | THREE buttons — DEFECT 1 |
| `src/backend/utils.ts:863` | VCRuntime download-links info box | |
| `src/backend/utils.ts:978` | ContinueWithFoundWine | |
| `src/backend/utils.ts:1417` | Rosetta not found | OK-only |
| `src/backend/protocol.ts:180` | protocol-handler "not installed, install it?" | `cancelId: 1` |
| `src/backend/sidecar/appShellFlowRegistration.ts:389` | Snap warning | uses `checkboxLabel`/`checkboxChecked` — DEFECT 2 |
| `src/backend/storeManagers/steam/library.ts:1772` | promptI386Recovery | fire-and-forget `void` |
| `src/backend/storeManagers/storeManagerCommon/games.ts:121` | sideloaded browser game will-prevent-unload | `showMessageBoxSync` — DEFECT 3 |

The sites the ORIGINAL todo listed at `main.ts:585` and `updater.ts:35`/`:59` are gone from the
census at HEAD. That, plus its stale line numbers, is part of WHY the original was wrong.

**F — THREE NEW LIVE DEFECTS the todo predates.** All caused by one thing: the Rust dialog
shim's contract is NARROWER than Electron's. This is the rewrite's headline, replacing the
now-closed EOS item.

1. **`src/backend/utils.ts:843` — the 3-button VCRuntime dialog collapses to 2 under the
   sidecar.** The shim maps the Rust result `true → response 0` and `false → response 1`
   (`platform/index.ts`, `return { response: result === false ? 1 : 0, checkboxChecked: false }`);
   there is NO path that yields `2`. The caller branches `response === 2` to persist
   `configStore.set('skipVcRuntime', true)`. Under Tauri, "Don't show again" is UNREACHABLE —
   the warning cannot be permanently dismissed. **Windows-only.**

2. **`src/backend/sidecar/appShellFlowRegistration.ts:389` — the Snap warning's checkbox can
   never be checked.** The shim hard-codes `checkboxChecked: false` on EVERY return (both the
   success and the catch arm), and the caller's `.then((result) => { if (result.checkboxChecked) … })`
   is what persists the "do not show again" preference. Under Tauri the Snap warning recurs on
   every `frontendReady`. **Linux/Snap-only.**

3. **`src/backend/storeManagers/storeManagerCommon/games.ts:121` — the unsaved-progress guard is
   fail-OPEN under the sidecar.** `showMessageBoxSync` is a logged no-op returning `0`
   (`platform/index.ts:506`). The caller computes `leave = choice === 0` and calls
   `event.preventDefault()` on `will-prevent-unload`, i.e. ALLOWS the unload. So the sideloaded
   browser game "Any unsaved progress might be lost" confirmation always silently answers
   *Yes, quit* — a data-loss guard that no longer guards. **Reachable on macOS** via sideloaded
   browser games.

Record the platform gating HONESTLY. Defects 1 and 2 are gated away from the operator's macOS
machine; defect 3 is not. Do not imply all three are equally urgent.
</verified_findings>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite the todo against HEAD</name>
  <files>.planning/todos/pending/2026-08-24-eos-remove-dialog-renders-as-a-native-system-dialog-not-app-styled.md</files>
  <action>
First, spot-check the anchors. For each `path:line` in the `<verified_findings>` census table
and in findings A–D, confirm the line still contains the claimed construct (use
`sed -n 'N,Mp'` or `grep -n`). If a line has drifted, use the ACTUAL line at HEAD in the
rewrite. Do NOT re-derive the conclusions and do NOT expand the census — the exclusion rules in
finding E are settled.

Then rewrite the file IN PLACE at the same path. Do NOT rename it. The filename still encodes
the false headline; add one line in the body noting the filename is stale and the path is held
stable deliberately.

Frontmatter — keep the existing SHAPE (created / title / area / status / severity / files) and
apply exactly these value changes:
- `created`: UNCHANGED at `2026-08-24T00:00:00.000Z` — this is the original discovery date. The
  rewrite date goes in the body, not here.
- `title`: MUST change. The current title asserts the EOS dialog is native, which is false. The
  new title's subject is the three shim-collapse defects plus the unresolved native-vs-in-app
  policy, over 10 live sites.
- `area`: keep `ui-dialogs`.
- `status`: keep `OPEN`.
- `severity`: raise `minor` → `major`, and justify it in the body in one sentence: defect 3 is a
  fail-open data-loss guard reachable on the operator's own platform. Note in the same place
  that defects 1 and 2, taken alone, would each be minor (platform-gated).
- `files`: re-point at the four files that are actually still live —
  `src/backend/platform/index.ts` (the shim, common cause of all three defects),
  `src/backend/utils.ts`, `src/backend/sidecar/appShellFlowRegistration.ts`,
  `src/backend/storeManagers/storeManagerCommon/games.ts`.
  REMOVE `eos_overlay.ts`, `dialog/dialog.ts` and `Dialog/index.css` — the first two are closed
  and the third is cosmetic residue mentioned in the body only.
- MUST NOT add a `resolves_phase:` field. The original deliberately omitted one; keep that, and
  keep the sentence in the body explaining why (so a future phase completion does not auto-close
  this).

Body — required sections, in this order:

1. **Rewrite notice.** Dated 2026-09-07, stating this is a VERIFIED rewrite against HEAD and not
   the 2026-08-24 analysis, and briefly WHY the original was wrong: its headline item was fixed
   by Phase 35 plan 26; trap 1 was fixed by quick 260820-kq0 round 3; trap 2 was mitigated by the
   shim's never-reject contract; its census counted sites (`main.ts`, `updater.ts`) that no
   longer exist and its line numbers had all drifted. Keep it to a short paragraph — this is
   provenance, not a narrative.

2. **The three live defects** (finding F) — the headline. One subsection each, carrying file,
   line, the exact mechanism (name the shim's `true → 0` / `false → 1` mapping, the hard-coded
   `checkboxChecked: false`, and the `showMessageBoxSync` → `0` no-op respectively), what the
   caller does with the value it can never receive, the user-visible consequence, and the
   platform gate.

3. **Common cause.** One short section naming `src/backend/platform/index.ts`'s `showMessageBox`
   shim: its contract is narrower than Electron's along three axes — at most two buttons, no
   checkbox, no synchronous form. Every defect above is one axis.

4. **The census** — the 10-site table from finding E verbatim, with its exclusion rule stated
   (tests, `__mocks__`, `electronStub`, comment-only mentions, and the legitimate native fallback
   arm at `dialog/dialog.ts:45`), and an explicit note that this replaces the original's "~14".

5. **What has already closed** — findings A, B, C, each labelled CLOSED or MITIGATED with its
   closing evidence (the Phase 35 plan 26 / REQ-35-17 / D-35-11-01 attribution and the named
   regression test for A; the `styled(Paper)` override and MUI `TransitionComponent` for B; the
   `safeIndex`-from-`cancelId` never-reject contract and `processGuards.ts` for C). For B, list
   the dead-CSS residue as COSMETIC and explicitly not blocking. Carry finding A's structural
   insight forward: an ASKING dialog cannot be moved through the ONE-WAY
   `showDialogBoxModalAuto` path — the answer must be gathered renderer-side and passed in.

6. **What is still live from the original** — trap 3 only (finding D): inverted response
   semantics at `utils.ts:281`, now carrying `cancelId: 0` from CR-04, standing as a constraint
   on any future migration.

7. **Suggested shape** — EXACTLY two items, in this order:
   (a) fix the three shim-collapse defects; they are independent of the policy question and can
       land first;
   (b) decide the native-vs-in-app policy — which confirmations are legitimately OS-native
       (quit, updater, pre-window-ready, Rosetta) versus in-app (anything reached from a settings
       surface) — and record the rule.
   DROP the EOS migration and the "fix the Dialog primitive first" step entirely; both are closed.

8. **Notes** — the no-`resolves_phase` rationale, the stale-filename note, and the two memory
   cross-links `[[stylesheet-can-be-wholly-dead-against-its-component]]` and
   `[[sidecar-dialog-reject-crashes]]`, each explicitly labelled HISTORICAL: the first because
   the primitive is now genuinely styled at `Dialog.tsx:50`, the second because
   `platform/index.ts:459` now provably never rejects. State that they are retained as the
   provenance of the closed traps, not as active hazards.

SCOPE HARD STOP: do NOT edit any file under `src/`. Do not fix the three defects. Recording them
is the whole deliverable; fixing is downstream work gated on the policy decision. If you find
yourself opening an editor on a source file, stop and report.
  </action>
  <verify>
    <automated>test -f .planning/todos/pending/2026-08-24-eos-remove-dialog-renders-as-a-native-system-dialog-not-app-styled.md &amp;&amp; git diff --name-only -- src/ | wc -l | grep -qx '0' &amp;&amp; echo OK</automated>
  </verify>
  <done>The file is rewritten in place, `git diff --name-only -- src/` is empty, and the frontmatter carries the changed title, `severity: major`, the four re-pointed `files` entries, and no `resolves_phase` key.</done>
</task>

<task type="auto">
  <name>Task 2: Gate the rewrite, then commit</name>
  <files>.planning/todos/pending/2026-08-24-eos-remove-dialog-renders-as-a-native-system-dialog-not-app-styled.md</files>
  <action>
Run the checks below against the rewritten file and fix any failure in the FILE — never by
weakening a check.

Frontmatter gates:
- `resolves_phase` MUST be absent (`grep -c '^resolves_phase:'` returns 0).
- `created:` MUST still read `2026-08-24`.
- `status: OPEN` and `severity: major` present.
- `title:` MUST NOT contain the string `EOS overlay remove confirmation renders` — the false
  headline must be gone.
- The four `files:` entries MUST each exist on disk (`test -f` each one). `eos_overlay.ts`,
  `dialog/dialog.ts` and `Dialog/index.css` MUST NOT appear in the `files:` block.

Anchor-resolution gate — this is the load-bearing one, and it greps the SOURCE, not the todo.
Prose in a todo trivially satisfies a grep for a token it names, so checking the todo against
itself proves nothing. Extract every `path:line` citation from the rewritten todo and, for each,
assert the SOURCE file's line N actually contains the construct claimed. At minimum assert:
- `src/backend/utils.ts` line 843 region contains `dontShowAgain` and the caller's `response === 2`
- `src/backend/sidecar/appShellFlowRegistration.ts` line 389 region contains `checkboxChecked`
- `src/backend/storeManagers/storeManagerCommon/games.ts` line 121 contains `showMessageBoxSync`
- `src/backend/platform/index.ts` contains both `result === false ? 1 : 0` and the
  `showMessageBoxSync` no-op returning `0`
If a citation does not resolve, correct the CITATION in the todo.

Content gates (grep the todo, comments stripped is not a concern here — it is markdown):
- Both memory links present, and the token `HISTORICAL` appears in the same section as each.
- The string `2026-09-07` appears (rewrite date).
- All ten census paths appear.
- `main.ts` and `updater.ts` appear ONLY in the "why the original was wrong" context, never in
  the live census table.

Census-count consistency: assert the todo does not still claim `~14` anywhere except when
explicitly describing the original's error.

Then commit. The working tree already has unrelated modifications (`.planning/ROADMAP.md`,
`.planning/STATE.md`) — do NOT absorb them. Confirm `git diff --cached --name-only` is empty
first, then commit with an explicit pathspec so only this one file lands:
`git commit -m "docs(quick-260907-rjc): rewrite stale EOS native-dialog todo against HEAD" -- <the todo path>`
Verify afterwards with `git show --stat HEAD` that exactly one file changed and that the
committed blob is the rewritten content (compare its line count against the file on disk — a
bare rename or an empty-add commits stale content while still exiting 0).

Do NOT use `gsd-sdk query commit` here: it stages the whole tree. Do NOT run `graphify update` —
it deletes `graph.html`, and no source changed.
  </action>
  <verify>
    <automated>F=.planning/todos/pending/2026-08-24-eos-remove-dialog-renders-as-a-native-system-dialog-not-app-styled.md; test "$(grep -c '^resolves_phase:' "$F")" = 0 &amp;&amp; grep -q 'severity: major' "$F" &amp;&amp; grep -q 'status: OPEN' "$F" &amp;&amp; grep -q '2026-09-07' "$F" &amp;&amp; grep -q 'stylesheet-can-be-wholly-dead-against-its-component' "$F" &amp;&amp; grep -q 'sidecar-dialog-reject-crashes' "$F" &amp;&amp; grep -q 'HISTORICAL' "$F" &amp;&amp; grep -q 'storeManagerCommon/games.ts' "$F" &amp;&amp; grep -q 'appShellFlowRegistration.ts' "$F" &amp;&amp; grep -q 'platform/index.ts' "$F" &amp;&amp; sed -n '121p' src/backend/storeManagers/storeManagerCommon/games.ts | grep -q showMessageBoxSync &amp;&amp; sed -n '389p' src/backend/sidecar/appShellFlowRegistration.ts | grep -q showMessageBox &amp;&amp; test "$(git show --stat HEAD --name-only --format= | grep -c .)" = 1 &amp;&amp; echo GATES_OK</automated>
  </verify>
  <done>All gates pass, exactly one file is in the HEAD commit, and the committed blob's line count matches the file on disk.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none crossed | Documentation-only change to one file under `.planning/`. No runtime code, no input parsing, no network, no package installs. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-rjc-01 | Tampering | scope creep into `src/` | mitigate | Task 1 carries a scope hard stop; Task 1's `<automated>` asserts `git diff --name-only -- src/` is empty |
| T-rjc-02 | Repudiation | commit absorbs unrelated staged/dirty work | mitigate | Task 2 confirms an empty index, commits with an explicit pathspec, and asserts the HEAD commit touches exactly one file |
| T-rjc-03 | Information disclosure | recording three live defects in a public-fork repo | accept | The defects are behavioural gaps in a local dialog shim, not credentials or exploitable secrets; they are already inferable from the shipped source |

No package-manager install tasks in this plan, so no `T-rjc-SC` supply-chain row applies.
</threat_model>

<verification>
- `git diff --name-only -- src/` is empty across both tasks.
- Every `path:line` citation in the rewritten todo resolves against HEAD source.
- The HEAD commit contains exactly one file, and its blob line count equals the on-disk file.
</verification>

<success_criteria>
1. The todo's title no longer asserts the EOS remove dialog is native.
2. All three shim-collapse defects are recorded with file, line, mechanism, consequence, and
   platform gate — and none of them is fixed.
3. The census reads 10 sites, all resolving at HEAD.
4. Traps 1 and 2 are marked closed with evidence; trap 3 is marked live.
5. Both memory links survive, each labelled HISTORICAL.
6. Suggested shape has exactly two items; no EOS migration, no Dialog-primitive styling step.
7. No `resolves_phase:` field; `status: OPEN`; `created:` still 2026-08-24.
8. Zero files under `src/` changed.
</success_criteria>

<output>
Create `.planning/quick/260907-rjc-rewrite-stale-eos-native-dialog-todo-aga/260907-rjc-SUMMARY.md` when done.
</output>
