---
quick_id: 260823-9ds
slug: fix-jest-containment-tmp-leak-and-wire-planning-gates
created: 2026-08-23
mode: quick --validate (executed inline, no subagents)
---

# Fix 34.2 gap-cycle-4 WR-01 and WR-11

Two of the 19 open gap-cycle-4 findings, selected because they are the only
ones with operational rather than cosmetic consequences.

**WR-01** — `jest.setupContainment.ts` minted a containment temp directory per
test FILE and never removed any. Review measured 1,968; live count was 6,057
(~500 MB).

**WR-11** — six planning gates under `.planning/` were wired into no script and
no workflow, so they only ever ran in the session that wrote them.

## Constraints carried in

- A concurrent session owns 14 working-tree entries — leave untouched.
- `git stash` / `git reset` banned; path-scoped commits via `git commit --only`.
- Every gate RED-proved against the unfixed code.
- Do NOT apply WR-01's prescribed fix verbatim: its marker file at
  `gamelib-jest-home-pid{pid}` reintroduces the predictable-path symlink vector
  that cycle-3's WR-07 closed with `mkdtemp`.
