---
quick_id: 260907-brc
date: 2026-09-07
status: complete
---

# 260907-brc — Close the decompressPool native-LZMA todo

## Outcome

`.planning/todos/pending/2026-08-31-decompresspool-native-lzma-tests-fail-3-of-41.md` is
**closed**, moved to `completed/`, with the mechanism recorded. No new todo was created — the
user's report was that todo verbatim.

**No source changes.** The code fix shipped five days earlier.

## What the answer was

The todo's central question — *"why does `lzma-native` load fine outside jest but resolve to
`pure-js` inside it?"* — is founded on a false premise. It was never about jest, and none of the
three hypotheses it listed (env sandboxing per test file, a `moduleNameMapper` intercepting the
native require, a stale override) was involved.

`resolveLzmaModule()` (`src/backend/storeManagers/steam/depot/lzmaLoader.ts:369-395`) puts the
import and a decode smoke test inside **one** `try` behind **one** `catch`:

| line | statement | what actually happened |
|------|-----------|------------------------|
| 370 | `await import('lzma-native')` | succeeded — in jest and out |
| 375 | `await smokeTest(adapter)` | **threw** |
| 377 | `decoderKind = 'native'` | never reached |
| 395 | `decoderKind = 'pure-js'` | what the three tests read |

So `'pure-js'` never distinguished "import failed" from "smoke test failed", and the todo read a
successful `require('lzma-native')` as proof the native path should have engaged.

The real defect: `lzma-native@8.0.6` bundles **liblzma 5.2.3**, whose `lzma_alone_decoder` rejects
a stream declaring a known uncompressed size while also carrying an EOS marker. That is exactly
the shape of `SMOKE_TEST_COMPRESSED` (`lzmaLoader.ts:173`). The smoke test could not pass on this
machine and never could have. Fixed by **`b79765af2`** (quick `260902-pwy`, 2026-09-02), confined
to `createNativeAdapter()`.

## The process finding — a pathspec that exits 0

The 2026-09-05 staleness audit (`260905-upz`) refused to discharge this todo on a green suite —
correctly, citing `flake-baselines-can-be-undiagnosed-bugs`. But it recorded *"Nothing that could
explain the flip has changed"* on the strength of:

```
$ git log --oneline --since=2026-08-30 -- src/backend/storeManagers/steam/lzmaLoader.ts
(no output)
```

**That path does not exist.** The file is `src/backend/storeManagers/steam/depot/lzmaLoader.ts`.
`git log` against a pathspec matching nothing prints nothing and **exits 0**, so *"no commits
touched this file"* and *"this file is not where you think it is"* are indistinguishable outputs.
Against the real path: exactly one commit, `b79765af2` — landed three days *before* the audit ran.

The wrong path came from the todo's own `files:` frontmatter, where it had sat since 2026-08-31.
**One bad path in a record propagated into the audit that read the record** and turned a findable
one-line answer into "environment-dependent and nobody knows on what" for two days.

The audit's *judgement* was sound; only its *evidence* was false — and false in a way that exits 0.

## Files changed

| file | change |
|------|--------|
| `.planning/todos/{pending → completed}/2026-08-31-decompresspool-native-lzma-tests-fail-3-of-41.md` | `git mv`; `status: RESOLVED`; `files:` path corrected `steam/` → `steam/depot/`; dated closing section |
| `.planning/quick/260905-upz-.../260905-upz-AUDIT.md` | dated correction block before `### BY CONSTRUCTION`; row-18 verdict cell flagged |
| `.planning/STATE.md` | Quick Tasks Completed row |

## Verified

```
$ npx jest --config src/backend/jest.config.js \
    --runTestsByPath src/backend/storeManagers/steam/__tests__/decompressPool.test.ts
Tests:       41 passed, 41 total     # all three named tests among them

$ ls src/backend/storeManagers/steam/lzmaLoader.ts
ls: ...: No such file or directory                      # the audit's pathspec
$ git log --oneline --since=2026-08-30 -- src/backend/storeManagers/steam/depot/lzmaLoader.ts
b79765af2 fix(steam): decode known-size lzma_alone streams on liblzma 5.2.3
```

Every `files:` entry in the closed todo now resolves on disk (checked with `test -e`, the check
whose absence caused this). `prettier --check` clean on all touched markdown.

## Carried forward, not re-opened

Per `b79765af2`'s own commit message, this suite's byte-equivalence test was **vacuous** before
that fix — the native side had silently fallen back, so it compared pure-JS against pure-JS and
passed. Already recorded there and in the `lzma-native-bundles-liblzma-523-rejects-known-size`
note; same shape as `a-pass-can-cover-an-unreachable-surface`.

The `NATIVE_LZMA_DECODE_ENABLED` kill switch is untouched and still default-off, for the separate
SEA real-chunk-hang reason in `.planning/debug/sea-native-lzma-real-chunk-decode-hang.md`.
