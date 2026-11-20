# Deferred items — quick-260925-uok

Out-of-scope discoveries found while executing this task. **Not fixed** (scope boundary: only
issues directly caused by this task's changes are auto-fixed).

## 1. `appRootResolution.test.ts` positive arm fails on Windows — bundled runner binaries carry `.exe`

- **File:** `src/backend/sidecar/__tests__/appRootResolution.test.ts:252-262`
- **Severity:** medium (a real test defect; the suite is red on any Windows dev machine)
- **Platform:** windows
- **Found during:** the post-task regression sweep over every jest suite that parses `main.rs`.

The positive arm asserts every bundled runner binary exists:

```ts
for (const binaryName of ['legendary', 'gogdl', 'nile', 'comet']) {
  const binaryPath = join(paths.publicDir, 'bin', process.arch, process.platform, binaryName)
  expect(existsSync(binaryPath)).toBe(true)
}
```

On Windows `process.platform` is `win32` and the shipped files are `legendary.exe`, `gogdl.exe`,
`nile.exe`, `comet.exe` — the extensionless names the loop builds do not exist, so the first
iteration fails with `Expected: true / Received: false` at line 262. `public/bin/x64/win32/`
contains exactly: `comet.exe`, `EpicGamesLauncher.exe`, `GalaxyCommunication.exe`, `gogdl.exe`,
`legendary.exe`, `nile.exe`.

**Proven pre-existing and unrelated to this task:**
`git diff 9df92784a HEAD -- src/backend/sidecar/ public/bin/` is **empty** — neither the test nor
the binaries were touched by any of this task's three commits, and the assertion text at
`9df92784a` is byte-identical to the current one. The failure depends only on the filesystem and
`process.platform`.

This is the same class as the already-filed
`.planning/todos/completed/...fakeHomeIsolation gate compares POSIX paths and fails on Windows`
(`f25986a8a`): a gate written against POSIX assumptions that is silently red — or, worse on CI,
never run — on Windows. Note `rust-test.yml` has a Windows leg but the jest workflow's platform
coverage should be checked when this is picked up; if jest only runs on Linux/macOS in CI, this
test has been passing there and failing for every Windows contributor without anyone noticing.

Suggested fix when picked up: append `process.platform === 'win32' ? '.exe' : ''` to the binary
name, rather than dropping the assertion.
