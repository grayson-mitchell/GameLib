# Deferred Items — quick task 260815-lta

Out-of-scope discoveries found during execution, not fixed per the scope boundary rule
(only auto-fix issues directly caused by the current task's changes).

## `pnpm codecheck` fails on `LoginBackground.tsx` — unrelated to this task

- **Found during:** Task 2 verification (`pnpm codecheck` step).
- **File:** `src/frontend/screens/Settings/components/LoginBackground.tsx` (untracked, part of a
  concurrent session's in-flight work — not in this plan's `files_modified`).
- **Errors:**
  - `TS2345`: Argument of type `"loginBackgroundPath"` is not assignable to parameter of type
    `keyof AppSettings`.
  - `TS2322` (x2): a settings-value union type is not assignable to `string` / `string | undefined`.
- **Why deferred:** File has zero references to `NavTabs`, `nav.tabs`, or anything this plan
  touched (confirmed by grep). It is untracked (`git status --porcelain` shows `??`), i.e. new
  work from a different, concurrently-active session. Fixing it is out of this task's scope.
- **Verification substitute:** `npx eslint` on the four touched source/test files ran clean
  (no output). `npx jest --selectProjects Frontend --silent NavShell muiTabsSelectorScoping` and
  `npx jest --selectProjects Meta --silent i18nCatalogChurnGuard hardcodedStringGate` both pass
  in full. The SCSS structural gate (uppercase present, none absent, no unscoped MUI selector)
  passes via direct `node -e` check. This task's own files are provably clean; the failing
  `tsc --noEmit` run is a whole-repo command that surfaces a pre-existing, unrelated error.
