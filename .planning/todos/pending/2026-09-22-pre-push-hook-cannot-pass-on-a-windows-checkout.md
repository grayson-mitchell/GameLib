---
created: 2026-09-22T05:37:57.735Z
title: "Pre-push hook cannot pass on a Windows checkout — CRLF breaks `prettier`, backslash paths break `find-deadcode`, so every push from Windows needs `--no-verify`"
area: tooling
severity: medium
platform: windows
ready: code
found_by: "Pushing quick-260922-nx4 from Windows 11 on 2026-09-22 (`96f15ef4a`); the hook failed and the push went out with `--no-verify` on operator instruction"
files:
  - .husky/pre-push
  - .gitattributes
  - .prettierrc
  - meta/findDeadcode.cjs:111-114
  - meta/findDeadcode.cjs:322
  - meta/deadcode-baseline-unreachable.txt
  - meta/deadcode-baseline-used-in-module.txt
  - src/backend/__tests__/tauriShellSource.test.ts
---

# Pre-push hook cannot pass on a Windows checkout

`.husky/pre-push` runs `pnpm codecheck && pnpm lint && pnpm prettier && pnpm i18n --fail-on-update && pnpm find-deadcode`.
Measured on Windows 11 at `96f15ef4a`, each step run individually:

| Step | Windows result |
|---|---|
| `codecheck` | exit 0 |
| `lint` | exit 0 (638 warnings, under ceiling; `production: PASS \| tests: PASS`) |
| `prettier` | **FAIL**: "Code style issues found in 1426 files" |
| `i18n --fail-on-update` | exit 0 |
| `find-deadcode` | **FAIL**: `unreachable: 47 FAIL \| used-in-module: 67 FAIL` |

Neither failure is about the code being pushed. Both are about the machine. Until this is fixed, every push
from Windows either skips the hook or doesn't happen, and the upcoming Windows single-instance guard work
(`2026-08-29-windows-single-instance-guard-and-deep-link-registration.md`) will be pushed from Windows.

## Defect 1: CRLF working tree vs Prettier's LF default

- The repo has `core.autocrlf=true` on this machine, so the Windows working tree is CRLF.
- `.prettierrc` sets no `endOfLine`, and Prettier 3 defaults to `"lf"`, so every file fails `prettier --check .`.
- `.gitattributes` contains only `pnpm-lock.yaml linguist-generated=true`. Nothing pins line endings.
- Control: re-running the check on the changed files with `--end-of-line auto` found exactly ONE genuinely
  misformatted file (`windowsDeepLinkSuppression.test.ts`, fixed in `96f15ef4a`). So the 1426 figure is
  almost entirely line endings. Measure the full-repo `--end-of-line auto` count before fixing, so any
  real misformatting is not hidden behind the EOL fix.
- Same root cause: `src/backend/__tests__/tauriShellSource.test.ts` fails 2 `NARROWNESS:` tests on Windows
  (144/146). Their fixture is joined with `\n` and matched against CRLF `main.rs` text. The committed LF
  blob contains the fixture verbatim (recorded in
  `.planning/quick/260922-nx4-suppress-gamelib-nsis-install-time-regis/deferred-items.md`).

**Fix options:**
1. **Preferred:** add `* text=auto eol=lf` to `.gitattributes`, then `git add --renormalize .` and re-checkout.
   The working tree is then LF on every OS, which also fixes the `tauriShellSource` failures and any other
   source-text test. Keep binary patterns (`*.png`, `*.ico`, `*.icns`, etc.) marked `binary`, and check that
   Windows-only scripts that genuinely need CRLF (`.bat`/`.cmd`, NSIS includes, if any) get
   `eol=crlf`. Do not break them blindly.
2. Weaker: `"endOfLine": "auto"` in `.prettierrc`. This makes `prettier` pass but hides CRLF drift and
   leaves the source-text tests failing.

## Defect 2: `find-deadcode` compares Windows backslash paths against forward-slash baselines

- ts-prune reports `${file}:${line} - ${name}`. It builds `file` by stripping `process.cwd()` and then a
  leading `/` (comment at `meta/findDeadcode.cjs:111-113`, regex `FINDING_RE` at `:114`).
- On Windows the path left after stripping starts with `\` and uses `\` separators, so identities come
  out as `\meta\buildRunnersOnedir.ts - toOnedirCommand` while the baselines hold
  `meta/buildRunnersOnedir.ts - toOnedirCommand`.
- The result is that every finding reads as NEW (`+`) and every baseline line reads as stale (`-`), with
  counts exactly equal to the baseline (47 / 67).
- `260922-e01` made the baseline environment-independent in other respects, but not separator-independent.

**Fix:** in `identityOf` (`meta/findDeadcode.cjs:322`), or wherever `file` is taken from `FINDING_RE`,
normalise with `file.split(path.sep).join('/')` (or replace `\\` with `/`), then strip one leading `/`.
Add a unit case feeding a Windows-shaped line (`\meta\x.ts:12 - foo`) that must produce the same identity
as `meta/x.ts:12 - foo`. The test must not depend on the host OS.

## Not re-checked

On 2026-09-22 the push of the old `fix/steam-native-install-stability` branch (based on 2026-09-06 code)
died in this same hook on ESLint `max-warnings` (4157). On current `main`, lint passes. That was a stale
branch, not this defect. Recorded only so nobody conflates the two.

## Done when

`.husky/pre-push` exits 0 on a clean Windows checkout of `main` with no `--no-verify`, and still exits 0 on
macOS.
