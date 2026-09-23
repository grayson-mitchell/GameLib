# Quick task 260923-uvt — close the notarization todo, carry its residuals out first

**Status: COMPLETE.** Documentation only. Baseline HEAD `6dabb9e37`, `pnpm planning-gates` 12/12
before and after.

## What was done

`.planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md`
is CLOSED and now lives under `completed/` with `status: completed`, `resolved: 2026-09-23`,
`resolved_by: quick-260923-uvt`. It was discharged because every clause of its title is measured
false as a live condition — Apple returned `Accepted` for submission
`0f65332c-56c8-484d-822a-13163bc14ddb` in 1m09s and stapled the app, and the survivor count over the
same 253 Mach-O files in the published artifact is `files=501 mach-o=253 survivors=0`, with both
controls run first.

**CARRY BEFORE CLOSE was honoured.** Task 1 (carry) ran and committed before Task 2 (close), so
there was never a window in which a residual had no home.

| carried item | destination |
| --- | --- |
| (a) quarantined first launch | parent `2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md`; its existing `needs: release-run-then-browser-download-verify` already named it |
| (b) sidecar-spawned helper | new `2026-09-23-steam-bridge-helper-never-spawned-by-the-sidecar-only-direct-exec-proven.md` (`minor` / `macos` / `live-gate`) |
| (c) recipe step 6's in-app invocations | the same parent todo, item 5 of its new uvt STATUS section |
| the 60-minute `timeout-minutes` bound | the same parent todo, item 6 of its new uvt STATUS section |

Also: three of the parent todo's OWN five Verification bullets are recorded as SATISFIED on a real
published artifact; its fifth bullet was corrected from the bare `::warning::` grep to `##[warning]`
plus a `Notarizing` count; and the updater todo's `source:` was repointed `pending/` -> `completed/`
so it resolves to a file that exists.

## Commits

| commit | task |
| --- | --- |
| `1f2e5e467` | Task 1 — carry every residual to a live home before the close |
| `b6ff98295` | Task 2 — close the notarization todo and repoint its one live pointer |
| `7ede7f9b9` | Task 3 — record the closure and carried residuals in STATE.md |

## Verification actually run

- `pnpm planning-gates` — **12/12 planning gates passed**, at the end of Task 1, Task 2 and Task 3.
- **Staged-blob check, before any commit.** `git add` at the pending path, THEN `git mv`, THEN
  `git show :<new-path>` — which read `status: completed` / `resolved: 2026-09-23` /
  `resolved_by: quick-260923-uvt`. The opposite-direction control held: `git show HEAD:<old-path>`
  still read `status: OPEN` with zero `resolved_by:` lines. `git status` records `R093`, a rename.
- **Absence assertion, control-tested.** `grep -rl 'todos/pending/2026-09-17-notarization-rejects'
  .planning/todos/pending/` returns **0**; the same grep against HEAD's copy of the updater todo
  returns **1**, so the zero is not a broken grep.
- **Scope gate, control-tested.** Nothing under `src/`, `meta/`, `src-tauri/` or `.github/` in the
  changed set (0); the same regex matches 3 synthetic such paths.
- **Changed set vs baseline `6dabb9e37`** is exactly five `.planning/` paths (four todos + STATE.md).
  Zero `.planning/quick/` files touched.
- Prettier is **VACUOUS** on these paths — `.prettierignore:29` is a bare `.planning`, asserted
  present. Its exit code is cited nowhere as evidence. The jest suite was NOT run.

## Deviations

**1. [Rule 3 — blocking] The plan's item-10 verify grep is unreachable by construction.** The plan
asserts item 10 was not edited with:

```
git show ":$NEW" | grep -q 'still on origin and locally \*\*as of this writing\*\*'
```

That string wraps across a newline in the source (`...and locally **as of this\nwriting**.`), so the
single-line grep returns **0 on the UNEDITED file** — a false red, not a real one. Desk-run before
being relied on, per this repo's `a-todos-verification-recipe-can-be-unreachable-by-construction`
lesson. Replaced with a line-split-tolerant equivalent testing the SAME property, control-tested
both directions: `tr '\n' ' '` then grep returns **1** on the unedited file and **0** when item 10 is
synthetically edited. Item 10 itself was NOT touched.

**2. [Placement judgement] FILE A's new STATUS section was inserted immediately before `## Related`,
not at end-of-file.** The plan says "append ... at the same level as the existing STATUS sections".
Both this file and the notarization todo keep `## Related` last, so appending after it would have
broken that convention. Heading level is `##`, matching its siblings.

## Not verified — still owed, and still needing a human

Closing the notarization todo does **not** mean macOS signing is finished. The parent
`2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md` remains **OPEN**, carrying three
live-gate arms that all need a real run and a person: the browser-download quarantine flow, a
sidecar-spawned `steam-bridge-helper`, and recipe step 6's in-app invocations.

## Proposals recorded, deliberately NOT applied

Written into the parent todo's new STATUS section as open proposals awaiting the operator:

1. `severity: major` is arguably now `minor` (the feature is measured working on a published
   artifact; what remains is two unverified arms with no known defect behind either).
2. The title is now partly false — a signed and notarized artifact HAS been published and verified.

The brief fenced that file's `severity:`, `needs:` and `status:`; none were changed, and the whole
frontmatter is byte-unchanged.
