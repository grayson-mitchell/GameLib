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
status: completed
resolved: 2026-09-22
resolved_by: quick-260922-ok3
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

## Resolution (2026-09-22, quick 260922-ok3)

Both defects fixed on this Windows checkout (HEAD `d17a9d226` at start).

**Commits:**
- `68e1edcc2` — `fix(quick-260922-ok3): pin LF line endings in .gitattributes, exempt CRLF spike evidence`
- `d21b05831` — `test(quick-260922-ok3): add failing Windows-path cases for findDeadcode identity` (RED)
- `6725a1574` — `fix(quick-260922-ok3): normalise ts-prune backslash paths in find-deadcode identities` (GREEN)
- `1c3f0f059` — `style(quick-260922-ok3): prettier-format findDeadcode Windows-path test cases` (Rule 1 deviation, caught during Task 3 verification)

**Defect 1 (CRLF vs Prettier LF):**
- `pnpm exec prettier --check . --end-of-line auto` baseline (measured before any change): **0 files** — the
  1426-file figure from the original report was entirely line-ending noise; the one genuine misformat
  (`windowsDeepLinkSuppression.test.ts`) was already fixed in `96f15ef4a` before this task started. No
  additional `style(...)` reformat commit was needed for this step.
- `.gitattributes` now carries `* text=auto eol=lf` plus `*.evidence.txt -text` (order: `-text` after the LF
  rule, later lines win). `git add --renormalize .` staged **only** `.gitattributes` — zero repo-content blobs
  changed.
- The working tree was re-materialised (`git rm --cached -r -q .` + `git reset --hard HEAD` on a
  verified-clean tree). `git ls-files --eol` afterward: every text file `w/lf`, and **exactly the 6** committed
  `*.evidence.txt` spike captures remain `i/crlf w/crlf attr/-text`, byte-exact, per `git ls-files
  '*.evidence.txt'`:
  - `.claude/skills/spike-findings-gamelib/sources/005b-bottle-to-host-tcp/bridge_out.evidence.txt`
  - `.claude/skills/spike-findings-gamelib/sources/005c-min-steam_api-shim/shim_out.evidence.txt`
  - `.claude/skills/spike-findings-gamelib/sources/006-cpp-vtable-abi/vtable_out.evidence.txt`
  - `.planning/spikes/005b-bottle-to-host-tcp/bridge_out.evidence.txt`
  - `.planning/spikes/005c-min-steam_api-shim/shim_out.evidence.txt`
  - `.planning/spikes/006-cpp-vtable-abi/vtable_out.evidence.txt`
- No `.prettierrc.json` `endOfLine` change was made (the rejected weaker option stays rejected).

**Defect 2 (backslash paths vs find-deadcode baselines):**
- Added `normaliseFindingPath()` to `meta/findDeadcode.cjs`, called inside `parseFinding` so `identityOf`,
  `KNOWN_PARSE_ARTIFACTS` exclusion, partitioning, and baseline diffing all see the normalised path.
- TDD: RED commit added 5 host-OS-independent test cases (literal escaped-backslash strings, no `path.sep` /
  `path.win32` / `process.platform`) covering a leading-backslash line, its `(used in module)` variant,
  cross-notation `identityOf` equality (both variants), and a nested nested path with no leading separator —
  all failed pre-fix. GREEN commit made all 22 tests in the suite pass, including the CLI end-to-end
  `exits 0 against the real repo` test.
- **Mutation proof:** `normaliseFindingPath` temporarily replaced with an identity no-op → all 5 new tests
  failed (confirmed red under mutation) → implementation restored, `git diff` empty, all 5 tests green again.

**Per-step exit codes (before → after, this Windows machine):**

| Step | Before (`96f15ef4a`, recorded in this todo) | After (quick 260922-ok3) |
|---|---|---|
| `codecheck` | exit 0 | exit 0 |
| `lint` | exit 0 (638 warnings) | exit 0 (638 warnings) |
| `prettier` | **FAIL** (1426 files) | exit 0 |
| `i18n --fail-on-update` | exit 0 | exit 0 (rewrites 4 locale JSON files to CRLF as a side effect of its own writer — pre-existing i18n-tool quirk, out of this task's scope; reverted with `git checkout --` after each measurement so the working tree stays clean; not a hook failure) |
| `find-deadcode` | **FAIL** (`unreachable: 47 FAIL \| used-in-module: 67 FAIL`) | exit 0 (`unreachable: 47 OK \| used-in-module: 67 OK`) |
| `bash .husky/pre-push` (full hook) | never verified green | **exit 0** |

**tauriShellSource.test.ts:** 144/146 before → **146/146 after**. The 2 `NARROWNESS:` failures (CENSUS_GUARD
fixture joined with bare `\n` matched against a then-CRLF working-tree `main.rs`) are gone now that the
working tree is LF everywhere; no edit to the test file was needed or made.

**macOS:** unaffected by construction — the tree is already LF there, so `* text=auto eol=lf` and
`*.evidence.txt -text` are no-ops on checkout, and `normaliseFindingPath`'s backslash replace is a no-op on
forward-slash paths. Not re-run on a Mac in this task; asserted from the diff, not measured.

## Orchestrator follow-up: i18n rewrote catalogs as CRLF (fixed in `057fa02f9`)

The executor's report noted `pnpm i18n` rewriting four `public/locales/en/*.json` catalogs to CRLF
and reverting them after each measurement. The orchestrator checked it: this was NOT harmless.
`.husky/pre-push` runs `prettier` BEFORE `i18n`, so the first push left four CRLF catalogs dirty
and the NEXT push would fail `prettier --check`. The hook was green once, not repeatably.

Cause: `i18next-parser.config.js` had `lineEnding: 'auto'` (OS EOL, so CRLF on Windows). Fixed to
`'lf'`, pinned in `meta/__tests__/i18nParserConfig.test.ts` (6/6; mutating back to `'auto'` fails
1/6). After re-running `pnpm i18n` the four catalogs came back byte-identical, and nothing was
discarded. **`bash .husky/pre-push` then exited 0 on two consecutive runs with a clean tree after
each run** (`unreachable: 47 OK | used-in-module: 67 OK`).
