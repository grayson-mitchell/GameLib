---
quick_id: 260907-brc
date: 2026-09-07
description: "Close the decompressPool native-LZMA todo — its open question is answered by b79765af2, and the staleness audit's 'nothing changed' rested on a non-existent pathspec"
type: docs
---

## Task

Close `.planning/todos/pending/2026-08-31-decompresspool-native-lzma-tests-fail-3-of-41.md`.

The user re-reported this todo verbatim. It is not new — and it is now answerable, so the
right outcome is a close with the mechanism recorded, **not** a duplicate todo.

## The answer

The todo's central open question — *"why does `lzma-native` load fine outside jest but resolve
to `pure-js` inside it?"* — is founded on a false premise. **It was never about jest.**

`resolveLzmaModule()` (`src/backend/storeManagers/steam/depot/lzmaLoader.ts:365-375`) does:

```ts
const mod = await import('lzma-native')
const adapter = createNativeAdapter(native)
await smokeTest(adapter)          // <- throws here
decoderKind = 'native'
```

Any throw — import **or** smoke test — lands in one catch that sets `decoderKind = 'pure-js'`.
`lzma-native@8.0.6` bundles liblzma 5.2.3, whose `lzma_alone_decoder` rejects a stream that
declares a known uncompressed size while also carrying an EOS marker. That is exactly the shape
of `SMOKE_TEST_COMPRESSED`. So the **smoke test** failed, not the import — which is precisely why
`require('lzma-native')` succeeded outside jest while the three tests read `'pure-js'`.

Fixed by `b79765af2` (quick `260902-pwy`, 2026-09-02), confined to `createNativeAdapter()`.

## Why the 2026-09-05 staleness audit missed it

It recorded "Nothing that could explain the flip has changed" on the strength of:

```
git log --oneline --since=2026-08-30 -- src/backend/storeManagers/steam/lzmaLoader.ts
(no output)
```

**That path does not exist.** The real file is `.../steam/depot/lzmaLoader.ts` — note `depot/`.
`git log` against a non-existent pathspec prints nothing and exits 0. Against the real path it
returns exactly one commit: `b79765af2`. The same wrong path sits in the todo's `files:`
frontmatter, which is where the audit almost certainly copied it from.

## Tasks

1. Correct the `files:` frontmatter path on the todo (`steam/` -> `steam/depot/`) and set
   `status: RESOLVED`.
2. Append a dated closing section: mechanism, fixing commit, and the wrong-pathspec reason the
   audit's "no code delta" claim was false.
3. `git mv` the todo to `.planning/todos/completed/` (keep the date prefix — 67 of 86 completed
   todos carry one).
4. Append a dated correction to `260905-upz-AUDIT.md` row 18, so its false "nothing changed"
   claim is not left standing for the next reader.
5. Update STATE.md's Quick Tasks Completed table.

## Verification

- `npx jest --config src/backend/jest.config.js --runTestsByPath \
   src/backend/storeManagers/steam/__tests__/decompressPool.test.ts` -> 41/41
- `ls .planning/todos/pending/2026-08-31-*` -> gone
- every path in the closed todo's `files:` resolves on disk

## Out of scope

No source changes. The code fix already shipped in `b79765af2`.
