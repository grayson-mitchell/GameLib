# Deferred items — quick-260816-9o0

Out-of-scope discoveries. Per the SCOPE BOUNDARY rule these were logged, NOT fixed:
this task changed only `meta/genI18nGateScope.ts`,
`meta/__tests__/genI18nGateScope.test.ts` and `package.json`.

## D-9o0-01 — `pnpm test:ci` has 2 pre-existing failing suites (NOT caused by this task)

**Suites:**

- `src/backend/__tests__/longRunningChannels.test.ts`
- `src/backend/__tests__/tauriShellSource.test.ts`

**Observed:** `Test Suites: 2 failed, 276 passed, 278 total` /
`Tests: 2 failed, 1 skipped, 5702 passed, 5705 total`.

**Root cause (measured, not assumed):** `longRunningChannels.test.ts:442` runs a
quote-balance check over `src-tauri/src/main.rs` and reports line 3383:

```
                     Electron's own macOS-only app.hide()"
```

The apostrophe in `Electron's` inside a Rust string makes the checker's
`quoteCount` odd, so the line is reported as unbalanced.

**Provenance — proves it predates this task:**

```
git log -1 --format="%h %s" -L 3383,3383:src-tauri/src/main.rs
206a31db7 feat(quick-vvz): wire electronStub app.hide to Tauri AppHandle::hide
```

`206a31db7` is from the PREVIOUS quick task (quick-260815-vvz) and sits four
commits before this task's first commit. Branch HEAD at task start was
`b59e111cd`.

**Why it cannot be this task's doing:** neither failing suite references
`package.json` or `genI18nGateScope` (`grep -l` returns no match), and neither
file is reachable from the three files this task modified.
`meta/__tests__/genI18nGateScope.test.ts` PASSES.

**Suggested owner:** whoever closes out quick-260815-vvz. The fix is likely in
the checker's `stripRustCharLiterals` / quote-balance logic (an apostrophe
inside a Rust string literal is legal and must not be counted), not in
`main.rs`.
