---
status: complete
quick_id: 261029-m0u
code_commit: 995f3daaa
---
# Quick 261029-m0u: Library-aware DRM exe containment

`detectLaunchDrmWrapper` now realpaths `dirname(exePath)` once (`ueRootReal`) and requires both the bootstrap exe and every UE Shipping candidate to resolve inside it (shared `containedReal` helper) before `detect()` is called. Real paths are scanned and lexical paths returned. A refused bootstrap gives `drmWrapper: undefined` plus a warning, and the Shipping fallback still runs. An unresolvable game folder returns `{undefined, exePath}`.

## Commits
- 995f3daaa fix: drmScanExe.ts, its test, shimGenerate.ts doc comment
- Todo move to `.planning/todos/completed/` with a Resolution (separate commit)

## Verification
- jest drmScanExe.test.ts: 13/13 pass. The 4 new or rewritten tests failed before the fix (RED).
- `tsc --noEmit` clean. Scoped `prettier --check` on the 3 paths clean. `pnpm planning-gates` 12/12.

## Notes
- `bottleDir` stays a parameter because `findUnrealLayout` still uses it lexically.
- Remaining unchecked read, out of scope: shimGenerate.ts fallback `detectDrmWrapper(resolve(gameExePath))` (~line 496), used only when no bridge bottle resolves.
- Deviations: none.
