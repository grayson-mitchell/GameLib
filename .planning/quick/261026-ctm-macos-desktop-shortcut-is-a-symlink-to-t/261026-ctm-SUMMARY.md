---
phase: quick-261026-ctm
plan: 01
status: complete-pending-live-gate
completed: 2026-10-26
commits: [5db284586, 17c29b80f, 19cd124ba, cbd905373]
---

# Quick 261026-ctm: macOS Desktop shortcut is a symlink to the Applications bundle

On macOS with `addDesktopShortcuts` on, `addShortcuts` now writes one generated `.app` in
`~/Applications` and makes `~/Desktop/<title>.app` a plain `fs.symlink` to it, so macOS Apps lists
the game once.

## Commits

- `5db284586` test: failing darwin symlink add/remove cases
- `17c29b80f` feat: Desktop item is a symlink (add path, `linkDesktopToApplications`, remove comment)
- `19cd124ba` test: failing dangling-link exists case
- `cbd905373` feat: `shortcutPathPresent` used by both exists checks

## Behavior

- Applications bundle is written when `addStartMenuShortcuts || fromMenu || addDesktopShortcuts`.
- If that write fails, the Desktop entry is reported in the same rejection ("not linked: ... was
  not written") and no link is created.
- A legacy real Desktop bundle (261026-clh), a stale link, or a dangling link is cleared with `rm`
  and replaced by the link.
- Remove is unchanged code: `rm({recursive, force})` is lstat-based, so it removes the link and not
  its target. Tests prove it, including a link whose target lies outside `menuFile`, and a dangling
  link. These remove cases passed before the implementation, as the plan predicted; not forced red.
- `shortcutPathPresent(file) = existsSync || lstat().isSymbolicLink()`, used by
  `ipc_handler.ts` and `sidecar/shortcutsFlowRegistration.ts`. Decision: a dangling Desktop link
  counts as present so the menu offers Remove and the user can clear it.

## Verification (real output)

- `npx jest src/backend/shortcuts src/backend/sidecar`: 78 of 79 suites pass, 1619 of 1620 tests.
  The one failure is the known pre-existing `sidecar/__tests__/testContainment.test.ts`.
- `npx tsc --noEmit -p .`: clean.
- Scoped `npx prettier --check` on all six paths: clean.
- `npx eslint` on the shortcuts dir and sidecar registration: 0 errors, 31 pre-existing warnings.
- `ls ~/Desktop ~/Applications | grep -i 261026`: empty. The real `Avernum 6.app` entries were not
  touched.
- `graphify update .` run.

## Deviations from Plan

None in behavior. `shortcutPathPresent` was exported in the Task 1 commit (not Task 2) so the
unused function would not trip typecheck between commits.

## Pending operator gate (live Mac)

Restart `pnpm tauri:dev` (check sidecar.js mtime), Add shortcut on Avernum 6 with the Desktop
toggle on. Expect: `~/Desktop/Avernum 6.app` becomes a Finder link (arrow badge) replacing the
existing real bundle; macOS Apps shows Avernum 6 once; Remove deletes both. Not run by the
executor (the user's dev session was left alone).

## Open follow-up

The macOS toast wording was not touched (no i18n changes); it may still describe "shortcuts" in the
plural/copy sense and should be reviewed against the single-bundle-plus-link behavior.
