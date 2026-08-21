---
created: 2026-08-22T08:30:00.000Z
title: "Symlink `linktarget` is never decrypted — the raw AES ciphertext is written as the symlink target, so every macOS .app with a framework installs DANGLING and macOS reports 'is damaged and can't be opened'"
area: steam-depot
status: CLOSED
severity: blocker
resolves_phase: 37
planned_as: 37-09
surfaced_by: "First end-to-end-successful native depot install, 2026-08-22 — install completed with zero decode errors, then the game would not launch"
files:
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/depot/crypto.ts
---

## Symptom

A native depot install of Wasteland 1 (259130) **completes successfully** — `StateFlags 4`, 395
files, zero decode errors, content byte-identical to Steam's own install — and then macOS refuses
to launch it:

> **"Wasteland" is damaged and can't be opened. You should move it to the Bin.**

## Root cause — one line, adjacent to the line that gets it right

`depot.ts:622-628`:

```js
const files: DepotPlanFile[] = (parsed.files ?? []).map((f) => ({
  filename: decryptFilename(f.filename, key),   // <-- DECRYPTED
  size: Number(f.size),
  sha_content: f.sha_content,
  flags: f.flags,
  linktarget: f.linktarget,                     // <-- NOT DECRYPTED
  chunks: f.chunks ?? []
}))
```

In a Steam depot manifest, `linktarget` (protobuf field 7) is encrypted with the depot key in
**exactly the same format as `filename`**. `decryptFilename` already exists and is already applied
to `filename` on the adjacent line. `linktarget` is passed through as raw base64 ciphertext and
written verbatim as the symlink target.

## Proof — measured against Steam's own install of the same title

Steam's known-good copy was still on disk for comparison. Both installs have **395 regular files**
and **6 symlinks**, and `diff -r` reports the regular-file content **byte-identical**. Only the
symlink targets differ:

| link | ours | Steam's |
|---|---|---|
| `SDL2.framework/Versions/Current` | `CClwxcolHHeFmDW9g2rgLmkBrT9o+Lpk7/nVlR7OhuE=` | `A` |
| `SDL2.framework/Resources` | `SaBgCw52SpKpa0y0MSoLvDQ/1d23B7+xwb99zz9TvvlYr2Bn7boz71sR/PiJJLB0` | `Versions/Current/Resources` |
| `SDL2.framework/SDL2` | `Y+lUNa0Y7nsLboBcCvYLPQ/TbEGC0Eg91ajAfDjE2GuUwOj1AEiEetCnqdppGNAm` | `Versions/Current/SDL2` |

All six of ours are **BROKEN** (dangling); all six of Steam's resolve.

Base64-decoding ours confirms the format beyond doubt — every one is **16-byte IV + PKCS#7-padded
body**, sized exactly to Steam's real plaintext:

| link | b64 len | raw bytes | structure | real plaintext | padded to |
|---|---|---|---|---|---|
| `Versions/Current` | 44 | 32 | 16 IV + 16 | `A` | 16 |
| `Resources` | 64 | 48 | 16 IV + 32 | `Versions/Current/Resources` (26 ch) | 32 |
| `SDL2` | 64 | 48 | 16 IV + 32 | `Versions/Current/SDL2` (21 ch) | 32 |

That is Steam's standard encrypted-string layout (AES-256, IV in ECB, body in CBC) — the same one
`decryptFilename` already handles.

`codesign --verify --deep` states it plainly:

```
ours:    bundle format unrecognized, invalid, or unsuitable
         In subcomponent: .../Contents/Frameworks/SDL2.framework
Steam's: valid on disk / satisfies its Designated Requirement
```

A macOS `.framework` is *defined* by its `Versions/Current` -> `A` symlink structure. With those
dangling, the bundle is structurally invalid, the signature cannot validate, and Gatekeeper
reports the generic "damaged" message.

## Severity — this is not specific to Wasteland 1

Every macOS `.app` that ships a `.framework` (i.e. most native Mac games) has this symlink
structure. **The native macOS depot install path has almost certainly never produced a launchable
app bundle for any such title.** It was invisible until now because no install had ever
*completed* end to end before 2026-08-22 — the decode defects (37-01) failed first, so nothing
ever got as far as launching.

## SECURITY — the traversal guard is currently VACUOUS

`depot.ts:1386-1398` containment-checks the symlink target (normalises `\` to `/`, rejects escapes)
— but it runs on the **ciphertext**, not the real target. It is therefore not protecting anything.
Worse, base64's alphabet includes `/`, so a blob like
`CClwxcolHHeFmDW9g2rgLmkBrT9o+Lpk7/nVlR7OhuE=` reads as a nested path and passes the check by pure
luck.

**The fix must re-run that containment check on the DECRYPTED target**, or a hostile/corrupt
manifest gets a genuinely unvalidated symlink write. Do not simply decrypt and keep the existing
check where it sits — verify the ordering.

## How to apply

1. Apply `decryptFilename(f.linktarget, key)` when `flags & Symlink` (512) and `linktarget` is
   present. Confirm whether it is encrypted unconditionally or only when filenames are encrypted,
   and mirror `filename`'s handling exactly.
2. Move/repeat the `depot.ts:1386-1398` containment check so it validates the decrypted value.
3. **Test that fails first:** a manifest fixture with an encrypted `linktarget` must produce a
   RESOLVING symlink. A fixture with a plaintext target would pass today and prove nothing — see
   this repo's ledgered lesson on fixtures that omit real structure, which has already bitten this
   exact file twice today.
4. **Live gate:** install a native macOS title with a framework, then run
   `codesign --verify --deep` and actually LAUNCH it. `find -type l` + `test -e` on each link is
   the cheap pre-check.

## Secondary finding — executable bits, NOT yet proven to matter

Steam sets the exec bit on **all 395** files; we set it on **3**. Our main binary
(`Contents/MacOS/Wasteland`) *does* have `+x`, so this did not cause the launch failure, and the
repo already ledgers that flagless manifests are normal on macOS. Recording it as an observed
divergence only — do NOT fold it into this fix without separate evidence that it breaks something.

## Code fix landed — AWAITING_LIVE_GATE (2026-08-22, quick 260822-bp4)

The code fix landed in commit `e47650a26` (`fix(steam): decrypt symlink linktarget in depot
manifests`), planned as 37-09:

- `depot.ts:627` now decrypts `linktarget` with the same `decryptFilename` primitive `filename`
  already uses, presence-conditional so an absent/empty linktarget still passes through untouched
  (Q2 crash pin — `decryptFilename('' | undefined)` throws).
- The containment guard at the symlink write branch needed **no relocation** — it reads
  `file.linktarget` at write time, so decrypting upstream feeds it the real target automatically.
  It was previously validating ciphertext only vacuously (base64's `/` reads as a nested path).
- Four new tests in `depotLinktarget.test.ts` were proven RED at HEAD against a real-crypto
  fixture (`fixtures/steamEncryptedString.ts`, cross-checked against this todo's hardware-measured
  wire byte counts) before the fix, and green after: plan-level decrypt, disk-level symlink
  resolution, and the security case (a decrypted escape target is rejected with
  `PathTraversalError`, not silently dangling). A fifth pins the absent/empty-linktarget
  passthrough.

**The ONLY thing outstanding is on-hardware confirmation.** A green unit suite does not close this
defect by itself — this repo has seen a live gate beat a green suite three times, and this exact
failure mode (dangling symlink -> invalid bundle -> Gatekeeper refusal) is invisible to any unit
test by construction, since no unit test actually codesigns or launches a `.app`.

### Live gate — run these, do not skip

Install a native macOS title that ships a `.framework` (Wasteland 1, appid 259130, is the proven
fixture for this defect), then from the install root:

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

**Cost note:** this does not require a fresh 90 GB download. Move the `.acf` aside and resume over
content already on disk — the question is which LINE must execute, not which bytes must move.
Steam adopts a GameLib-written ACF only at its next startup scan, so compare the `.acf` mtime
against Steam's process start before concluding anything about adoption.

Do not mark this todo resolved until all three commands above have been run and PASS.

## CLOSED 2026-08-22 — LIVE GATE PASSED

Fix `e47650a26` confirmed on real hardware 09:11. All six symlinks resolve with targets identical
to Steam's own install; `codesign --verify --deep` reports `valid on disk` / `satisfies its
Designated Requirement` (same verdict as Steam's copy); `diff -r` against Steam's install shows
395 files / 6 links and NO content differences; **the game launches**.

Useful oracle discovered while verifying: `diff -r`'s `Directory loop detected` errors now appear
SYMMETRICALLY on both trees, which is the signature of CORRECT framework symlinks
(`Versions/Current -> A` is a real cycle). Pre-fix the errors were ASYMMETRIC (`No such file or
directory`, ours only). Cheap and reusable for this defect class.

The secondary exec-bit divergence remains UNEXPLAINED and OPEN (see below): this run again logged
`executableFlagged=0 chmodAttempts=0` while Steam sets +x on all 395 files. It did not block the
launch. Not folded into this fix; needs its own evidence before anyone acts on it.
