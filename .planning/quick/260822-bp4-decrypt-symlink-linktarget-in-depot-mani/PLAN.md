---
task: 260822-bp4
title: "Decrypt symlink `linktarget` in depot manifests — raw AES ciphertext is written as the symlink target, so every macOS .app with a framework installs DANGLING"
type: quick
branch: fix/steam-native-install-stability
area: steam-depot
severity: blocker
resolves_todo: .planning/todos/pending/2026-08-22-symlink-linktarget-is-never-decrypted.md
resolves_phase: 37
planned_as: 37-09
files_modified:
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/__tests__/fixtures/steamEncryptedString.ts
  - src/backend/storeManagers/steam/__tests__/depotLinktarget.test.ts
---

<objective>
`depot.ts:623` decrypts `filename`; the adjacent `:627` passes `linktarget` through as raw base64
AES ciphertext, which `downloadSingleFile` then writes verbatim as the symlink target. All six
symlinks in Wasteland 1 (259130) dangle, `codesign --verify --deep` reports `bundle format
unrecognized, invalid, or unsuitable`, and macOS refuses to launch the app. Proven on hardware
against Steam's own install of the same title: 395 regular files byte-identical, only the six
symlink targets differ.

The fix is ONE production expression. The work is in the fixtures: a regression test built from a
plaintext linktarget would pass at HEAD and prove nothing, and this exact file has already been
burned twice today by fixtures that omitted real structure.

Output: `linktarget` decrypted at the plan-build site with the same primitive `filename` uses, a
real-crypto fixture builder cross-checked against the hardware-measured wire bytes, four tests
(two of which MUST be red at HEAD), and refreshed doc comments. The live on-hardware gate is
scoped OUT and handed forward.
</objective>

<context>
The defect is ALREADY FULLY ROOT-CAUSED AND PROVEN ON HARDWARE. Do not re-investigate. Everything
below was verified by direct source reading and by an executed prototype on 2026-08-22, and is
current at HEAD.

@.planning/todos/pending/2026-08-22-symlink-linktarget-is-never-decrypted.md

Verified facts — each with a line reference. Re-read only what you edit.

- `src/backend/storeManagers/steam/depot.ts:621-629` — `fetchDepotPlanEntry`'s parse+map. Line 623
  is `filename: decryptFilename(f.filename, key)`, line 627 is `linktarget: f.linktarget`. That
  asymmetry IS the whole defect.
- `src/backend/storeManagers/steam/depot/crypto.ts:20-53` — `steamDecrypt` (16-byte IV decrypted in
  AES-256-ECB, body in AES-256-CBC under that IV, PKCS#7 stripped) and `decryptFilename` (cut at
  the first NUL). Already correct. Do not modify this file.
- `src/backend/storeManagers/steam/depot.ts:133-142` — `DepotPlanFile`. Its `linktarget` doc
  comment currently says only "from the manifest's `linktarget` (protobuf field 7)"; after the fix
  it must say DECRYPTED, exactly as the interface's own header comment already does for `filename`.
- `src/backend/storeManagers/steam/depot.ts:1374-1408` — the symlink write branch. Reads
  `file.linktarget` at WRITE time: throws on falsy (`:1378`), normalises `\` to `/`, resolves
  against `dirname(dest)`, rejects `..`/absolute via `relative(installRoot, ...)` with
  `PathTraversalError` (`depot.ts:969`), then `rm(force)` + `symlink`.
- `src/backend/storeManagers/steam/depot/reconcile.ts:150-157` — `symlinkVerified` compares
  `readlink(dest)` against `file.linktarget` from the SAME plan object, so it inherits the
  decrypted value automatically and stays self-consistent.

### THE CONTAINMENT GUARD NEEDS NO RELOCATION — this is a resolved question, state it in the summary

The guard reads `file.linktarget` at write time (`depot.ts:1391-1401`), not a value captured at
parse time. Decrypting upstream at `:627` therefore feeds the existing guard the REAL target with
zero code motion. The single-line decrypt fixes BOTH the dangling symlinks AND the fact that the
guard was previously validating ciphertext. Do not move, duplicate, or re-order it.

WHY it was previously vacuous, and why that must be PINNED by a test rather than asserted in prose:
base64's alphabet includes `/`, so a ciphertext blob like `CClwxcolHHeFmDW9g2rgLmkBrT9o+Lpk7/nVlR7OhuE=`
reads as a nested relative path and passes containment BY LUCK. A security property that is only
narrated is not a security property.

### The three open questions — ALL RESOLVED. Do not re-derive them.

**Q1 — Is `linktarget` encrypted unconditionally, or only when filenames are?
Answer: decrypt it UNCONDITIONALLY, mirroring `filename` exactly.**
`filenames_encrypted` is a real field (`ContentManifestMetadata` field 4,
`node_modules/steam-user/protobufs/content_manifest.proto:35`), and steam-user's own
`decryptFilenames()` (`components/content_manifest.js:83-107`) does gate on it — but GameLib
**never calls that function**. We call only `parse()` and decrypt ourselves, because steam-user's
own path truncates filenames at block boundaries (spike 002; recorded in `crypto.ts:1-6` and in
`fetchDepotPlanEntry`'s doc comment at `depot.ts:560-563`). There is NO conditional anywhere in
GameLib's parse path, and `ContentManifestModule` (`depot.ts:196-198`) declares only
`parse(raw): { files: RawManifestFile[] }` — the flag is not even in our typed surface.
So: no gate. Adding a `filenames_encrypted` gate for `linktarget` ALONE would diverge the two
fields; adding it for BOTH would change the working `filename` path. Neither is in scope here.

**Q2 — What does `decryptFilename` do with an absent/empty `linktarget`? It CRASHES. Measured.**
`decryptFilename('', key)` throws `ERR_CRYPTO_INVALID_IV` (empty ciphertext yields a zero-byte IV),
and `decryptFilename(undefined, key)` throws a `TypeError` from `Buffer.from`. A naive
`decryptFilename(f.linktarget ?? '', key)` would therefore blow up the ENTIRE plan build on the
first ordinary non-symlink file. The fix must be presence-conditional so `undefined` stays
`undefined` and today's behaviour at the write site (`:1378`) is preserved byte for byte. Pin this
with a test — it is the one way this one-line change can regress something that works today.

**Q3 — Is the NUL cut correct for linktarget padding? Yes. Confirmed two ways.**
`linktarget` is `optional string = 7` on the same message as `filename` (`content_manifest.proto:25`),
so identical wire type and identical handling in `parse()`. And the hardware-measured byte counts
match `plaintext + NUL + PKCS#7` exactly: `A` (1 ch) -> 2 -> padded to 16 -> 32 raw bytes with IV;
`Versions/Current/Resources` (26 ch) -> 27 -> padded to 32 -> 48 raw bytes with IV. Nothing to change.

### Test-environment facts

- `src/backend/jest.config.js` is `displayName: 'Backend'`, `roots: ['<rootDir>/src/backend']`.
  Invoke as `pnpm jest --selectProjects Backend <path>`.
- **`depot.test.ts:120-123` mocks `../depot/crypto` wholesale** (`decryptFilename: jest.fn()`), and
  `depot.finalize.test.ts:115-117` does the same. Neither file can host these tests — the real
  primitive must run. Create a NEW test file.
- ts-jest here is TRANSPILE-ONLY: type errors do NOT fail tests. Run `tsc` separately.
- `prettier --check` is RED repo-wide by default. Never sweep formatting into a behavioural commit,
  and never run `--check` on a temp copy (it resolves a different config).
</context>

<reference_shapes>

Target shape for the production change at `depot.ts:627` (adapt freely; the constraints are that
the SAME `decryptFilename` primitive is used, and that an absent linktarget is never passed to it):

```ts
    // 37-09: linktarget is encrypted with the depot key in EXACTLY the same
    // format as filename (proto field 7, same message) and must be decrypted
    // here, not passed through — the write site symlinks this value verbatim.
    // Presence-conditional because decryptFilename('' | undefined) throws
    // (ERR_CRYPTO_INVALID_IV / TypeError) and most files have no linktarget.
    linktarget: f.linktarget ? decryptFilename(f.linktarget, key) : f.linktarget,
```

Target shape for the fixture builder — the exact inverse of `crypto.ts`'s `steamDecrypt`, so the
fixture reproduces the real wire layout rather than a convenient approximation. This has been
PROTOTYPED AND EXECUTED; it round-trips through the real `decryptFilename` and its output byte
counts match the hardware-measured samples exactly.

```ts
// src/backend/storeManagers/steam/__tests__/fixtures/steamEncryptedString.ts
import { createCipheriv, randomBytes } from 'node:crypto'

/** Encrypts `plaintext` into Steam's manifest string layout:
 *  base64( AES-256-ECB(IV) || AES-256-CBC(plaintext + NUL + PKCS#7 pad) ).
 *  The exact inverse of depot/crypto.ts's steamDecrypt + decryptFilename. */
export function steamEncryptString(plaintext: string, key: Buffer): string {
  const body = Buffer.concat([Buffer.from(plaintext, 'utf8'), Buffer.from([0])])
  const padLen = 16 - (body.length % 16) || 16
  const padded = Buffer.concat([body, Buffer.alloc(padLen, padLen)])
  const iv = randomBytes(16)
  const ivEnc = createCipheriv('aes-256-ecb', key, null)
  ivEnc.setAutoPadding(false)
  const ivCt = Buffer.concat([ivEnc.update(iv), ivEnc.final()])
  const enc = createCipheriv('aes-256-cbc', key, iv)
  enc.setAutoPadding(false)
  const bodyCt = Buffer.concat([enc.update(padded), enc.final()])
  return Buffer.concat([ivCt, bodyCt]).toString('base64')
}
```

Hardware-measured wire samples this builder must reproduce (from Steam's own Wasteland 1 install,
recorded in the todo). These are the numbers the fixture self-check asserts:

| plaintext | base64 chars | raw bytes |
|---|---|---|
| `A` | 44 | 32 |
| `Versions/Current/Resources` | 64 | 48 |
| `Versions/Current/SDL2` | 64 | 48 |
</reference_shapes>

<tasks>

### Task 1 — Build the fixture, write the tests, and PROVE two of them RED at HEAD

**Files:**
- `src/backend/storeManagers/steam/__tests__/fixtures/steamEncryptedString.ts` (new)
- `src/backend/storeManagers/steam/__tests__/depotLinktarget.test.ts` (new)

**Action:**

1. Create the fixture module (see `<reference_shapes>`). It lives in `__tests__/fixtures/`
   alongside `cdnAuthSendFixture.ts`, which sets the precedent for a fixture that builds a REAL
   wire payload rather than a plain-object fake.

2. Create the test file. Mirror `depot.test.ts`'s mock header (`depot.test.ts:77-183`) —
   `backend/logger` factory form, `jest.mock('../user')`, `backend/utils`, `../depot/select`,
   `../depot/fileAttributes`, `steam-user/components/content_manifest.js`, `../depot/decompress`,
   `../../../ipc`, `i18next` — with ONE deliberate omission: **do NOT mock `../depot/crypto`.**
   The real `decryptFilename` is the thing under test. Copy `makeFakeClient` from
   `depot.test.ts:192-241`; `resetMocks: true` means every implementation is re-established per
   test.

   Keeping the `content_manifest.parse` mock is CORRECT and is not the fixture shortcut the
   ledger warns about. The decoder under test here is `decryptFilename` applied to `linktarget`;
   the structure that must be real is the AES/IV/NUL/PKCS#7 string layout, which the fixture
   reproduces genuinely and cross-checks against measured bytes. The protobuf framing belongs to
   steam-user, is exercised nowhere in this code path's logic, and is mocked by every existing
   depot test. Say this in a comment at the top of the file so the next reader does not have to
   re-litigate it.

3. Drive the tests through `buildDepotPlan` — `fetchDepotPlanEntry` is private and reachable only
   that way, so a test that bypasses it cannot be red at HEAD. Have the mocked
   `getDepotDecryptionKey` hand back a fixed 32-byte key (e.g.
   `createHash('sha256').update('fixture-depot-key').digest()`) and the mocked `parse` return
   files whose `filename` AND `linktarget` are both produced by `steamEncryptString` under that
   same key.

Write exactly five tests:

1. **Fixture self-check (green before and after).** For each row of the measured-samples table,
   assert `steamEncryptString(plaintext, key)` has the stated base64 length and raw byte count,
   and that the real `decryptFilename` round-trips it back to `plaintext`. This is what stops the
   fixture itself from drifting into a convenient approximation.

2. **Regression, plan level (MUST BE RED AT HEAD).** A manifest with one `SYMLINK_FLAG` (512) entry
   whose `linktarget` is `steamEncryptString('Versions/A/Resources', key)`. Assert
   `plan.depots[0].files[0].linktarget === 'Versions/A/Resources'`. At HEAD this is the base64
   blob.

3. **Regression, disk level — the link must RESOLVE (MUST BE RED AT HEAD).** Same manifest plus a
   `DIRECTORY_FLAG` (64) entry for the real target directory, so the framework shape is genuinely
   reproduced: `SDL2.framework/Versions/A/Resources` (directory) and `SDL2.framework/Resources`
   (symlink -> encrypted `Versions/A/Resources`). Feed the built plan to `downloadDepotFiles`
   against a real tmpdir (`mkdtempSync`), mirroring the harness at `depot.test.ts:3470-3500`.
   Assert `result.failures` is `[]`, `lstatSync(link).isSymbolicLink()`, `readlinkSync(link)`
   equals the plaintext target, AND that the link resolves —
   `existsSync(resolve(dirname(link), readlinkSync(link)))` is `true`. Resolution is the property
   the operator's `codesign` gate actually depends on; a decrypted-but-dangling link would still
   be a shipped defect.

4. **Security — a DECRYPTED escape is rejected (MUST BE RED AT HEAD).** A `SYMLINK_FLAG` entry
   whose `linktarget` is `steamEncryptString('../../evil', key)`. Assert `result.failures` has
   length 1 and `result.failures[0].error` matches `/traversal|escapes/i`. At HEAD the ciphertext
   resolves as an inner relative path, so there is no failure at all and this test fails.

   **TRAP — do not use `existsSync` to assert the link was not created.** `existsSync` follows
   symlinks and returns `false` for a DANGLING one, so at HEAD (where a dangling ciphertext link
   IS created) that assertion would pass and the test would be green against the defect. Assert
   non-creation with `lstatSync` in a `try`/`catch` (or `lstatSync(..., { throwIfNoEntry: false })`)
   and require `undefined`/ENOENT.

5. **Absent-linktarget passthrough (green before and after — this is the Q2 crash pin).** A plain
   regular-file manifest entry with NO `linktarget` field at all, plus one with `linktarget: ''`.
   Assert `buildDepotPlan` resolves (does not throw) and that both files' `linktarget` come back
   exactly as they went in (`undefined` and `''`). This is what stops a `?? ''` implementation from
   throwing `ERR_CRYPTO_INVALID_IV` on every ordinary file in every depot.

Do NOT touch `depot.ts` in this task.

**Verify:**
```
pnpm jest --selectProjects Backend src/backend/storeManagers/steam/__tests__/depotLinktarget.test.ts
```
Tests 2, 3 and 4 MUST FAIL. Tests 1 and 5 MUST PASS. Copy the failing assertion output verbatim
into a scratch note — it goes into Task 2's commit message. A regression test that cannot fail
against known-bad input proves nothing (ledgered here six times, once inverted into an executor
bending the code to appease an unpassable gate). If test 2, 3 or 4 passes at HEAD, the TEST is
wrong, not the diagnosis — fix the test before continuing.

**Done:** Tests 2/3/4 observed RED with their actual assertion text captured; tests 1 and 5 green.

**Commit:** NONE. Deliberate — committing a red test would leave a broken HEAD for CI and for the
concurrent sessions sharing this tree. The RED evidence is carried into Task 2's commit message.

---

### Task 2 — Apply the one-line fix and commit it atomically with the tests

**Files:** `src/backend/storeManagers/steam/depot.ts`

**Action:**

1. Change `depot.ts:627` to the presence-conditional decrypt (see `<reference_shapes>`). That is
   the entire behavioural change. Do not touch `crypto.ts`, do not touch the write branch at
   `:1374-1408`, do not move the containment guard.

2. Update the doc comments that are now stale, IN THE SAME COMMIT — a comment that lies about
   behaviour is the same defect class as a gate that is stale by behaviour:
   - `DepotPlanFile.linktarget` (`:139-141`) — say the value is DECRYPTED here, matching what the
     interface header already states for `filename`.
   - `fetchDepotPlanEntry`'s header (`:560-563`) — it currently says "filename-decrypt"; it now
     decrypts both encrypted string fields.
   - `DepotPlan`'s header (`:157-160`) — same "filename-decrypted" phrasing.
   - Add a one-line note at the write branch recording that the guard at `:1391-1401` now validates
     PLAINTEXT, and WHY it was previously vacuous (base64's `/` made ciphertext read as a nested
     path). Point it at the test that pins it. This is the only durable record that the security
     property changed.

**Verify:**
```
pnpm jest --selectProjects Backend src/backend/storeManagers/steam/__tests__/depotLinktarget.test.ts
pnpm jest --selectProjects Backend src/backend/storeManagers/steam/__tests__/
npx tsc --noEmit -p .
pnpm exec eslint -f json src/backend/storeManagers/steam/depot.ts src/backend/storeManagers/steam/__tests__/depotLinktarget.test.ts src/backend/storeManagers/steam/__tests__/fixtures/steamEncryptedString.ts
```
All five new tests green. The whole `steam/__tests__/` directory green with no new failures
relative to the pre-edit baseline — capture that baseline count from HEAD BEFORE editing, because
a suite count is stamped to its own base and HEAD moves under concurrent sessions here. Pay
particular attention to `reconcile.test.ts` (its `linktarget: 'game.exe'` fixtures build plans
directly, so they are unaffected — confirm, do not assume) and to `depot.test.ts`'s
`buildDepotPlan` block, whose mocked `decryptFilename` now also receives linktargets. `tsc` must
be clean; ts-jest is transpile-only and a green suite says nothing about types. For eslint, count
ONLY entries with `severity === 2` — warnings print adjacent to errors and have been mis-attributed
to the wrong file here before.

**Done:** Five new tests green, steam suite green against the captured baseline, tsc clean, zero
eslint errors on the three touched files.

**Commit:** ONE commit, three files, by EXPLICIT path. Run `git status --short` FIRST — there is
concurrent uncommitted work in this tree (`.planning/ROADMAP.md` is already modified and is
co-owned). Do NOT use `gsd-sdk query commit` (it stages the entire tree). Do NOT `git add -A`.
NEVER `git stash` — it has stranded a concurrent session's work in this repo twice, both times
triggered by wanting a clean tree to compare against.
```
git status --short
git add src/backend/storeManagers/steam/depot.ts \
        src/backend/storeManagers/steam/__tests__/depotLinktarget.test.ts \
        src/backend/storeManagers/steam/__tests__/fixtures/steamEncryptedString.ts
git commit
```
Message: `fix(steam): decrypt symlink linktarget in depot manifests`. Body must quote the Task 1
RED assertion output as proof the regression tests discriminate, and must state that the
containment guard at `depot.ts:1391-1401` was previously validating ciphertext and now validates
the real target.

---

### Task 3 — Hand the live gate forward

**Files:** `.planning/todos/pending/2026-08-22-symlink-linktarget-is-never-decrypted.md`

**Action:**
A green suite does NOT close this defect — a live gate has beaten a green suite three times in this
repo, and this specific failure mode (dangling symlink -> invalid bundle -> Gatekeeper refusal) is
invisible to every unit test by construction. Do not mark the todo resolved.

Update the todo's frontmatter `status` to `AWAITING_LIVE_GATE` and append a short section giving
the operator the exact commands from `<handoff>` below. Note in it that the code fix landed in this
commit and that the ONLY thing outstanding is the on-hardware confirmation.

Do not run repo-wide `prettier --write`. If prettier wants a change in one of the three files you
touched in Task 2, apply it IN PLACE (never on a temp copy — a copy resolves a different config)
and amend Task 2's commit rather than adding a formatting commit.

**Verify:**
```
git status --short
pnpm exec prettier --check src/backend/storeManagers/steam/depot.ts src/backend/storeManagers/steam/__tests__/depotLinktarget.test.ts src/backend/storeManagers/steam/__tests__/fixtures/steamEncryptedString.ts
```

**Done:** Todo file marked `AWAITING_LIVE_GATE` with operator commands; the three touched source
files pass prettier in place.

**Commit:** ONE doc commit, explicit path, separate from the behavioural commit:
`docs(todo): hand the 37-09 linktarget live gate forward`.

</tasks>

<out_of_scope>
- **The executable-bit divergence.** Steam sets `+x` on all 395 files; we set it on 3. Our main
  binary DOES have `+x`, so this did NOT cause the launch failure, and this repo already ledgers
  that flagless manifests are normal on macOS. Recorded as an observation only. Do not fold it in.
- Adding a `filenames_encrypted` gate to either field. See Q1 in `<context>` — resolved as a
  deliberate no.
- Any change to `depot/crypto.ts`. The primitive is correct and already unit-tested at
  `depotPrimitives.test.ts:304-321`.
- Moving, duplicating or re-ordering the containment guard at `depot.ts:1391-1401`. Verified
  unnecessary; the guard reads the value at write time.
- The wider depot write path, the chunk/decode work in flight in this tree (37-01), and the
  false-delisted cluster (37-03).
- **The live on-hardware gate.** Explicitly handed forward — the operator runs it, not the
  executor. See `<handoff>`.
</out_of_scope>

<handoff>
Live gate for the operator. A green suite does not close 37-09; this does.

Install a native macOS title that ships a `.framework` (Wasteland 1, appid 259130, is the proven
fixture), then from the install root:

```
# 1. Every symlink must resolve — the cheap pre-check.
find . -type l -exec sh -c 'test -e "$1" || echo "DANGLING: $1 -> $(readlink "$1")"' _ {} \;

# 2. The bundle must be structurally valid and signed.
codesign --verify --deep --verbose=2 "Wasteland.app"

# 3. It must actually launch.
open "Wasteland.app"
```

PASS requires: command 1 prints nothing, command 2 reports `valid on disk` (not `bundle format
unrecognized, invalid, or unsuitable`), and command 3 opens the game rather than the "is damaged
and can't be opened" dialog.

Cost note: this does not require a fresh 90 GB download. Per the ledgered technique, move the
`.acf` aside and resume over content already on disk — the question is which LINE must execute,
not which bytes must move. Steam adopts a GameLib-written ACF only at its next startup scan, so
compare `.acf` mtime against Steam's process start before concluding anything about adoption.
</handoff>
