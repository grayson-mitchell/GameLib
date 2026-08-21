---
slug: steam-depot-decode-z-data
status: awaiting_human_verify
trigger: "the Z_DATA_ERROR decode failure"
created: 2026-08-22
updated: 2026-08-22
severity: major
phase: 37-steam-defect-cluster
source_todo: .planning/todos/pending/2026-08-21-steam-depot-chunks-fail-to-decode-z-data-error.md
planned_as: 37-01
---

# Debug: Steam depot chunks fail to decode (Z_DATA_ERROR) on every CDN host

## Symptoms

- **Expected:** A native depot install of Wasteland 1 - The Original Classic (appid 259130) on
  macOS downloads its mac depots, decodes each chunk, and streams to disk.
- **Actual:** Install fails after ~211 seconds with **142 `Z_DATA_ERROR` decode failures**.
  Affected depots: **259132** (97 failures) and **259134** (6) — the mac depot set for this title.
- **Error:**
  ```
  fetchChunk: decode-stage failure reason=Z_DATA_ERROR depot=259132
    attempt=7 httpStatus=200 contentType=application/x-steam-chunk
    contentEncoding=absent contentLength=128 rawBodyBytes=128
    rawSha1=060a1f2e1610ecbd8cf158beb92e7f0198ad8e22
  ```
  Logged 6 seconds before the terminal failure:
  ```
  CdnAuthTokenCache: GetCDNAuthToken failed for depot=259132
    host=steampipe.akamaized.net: ContentServerDirectory.GetCDNAuthToken: empty response
  ```
- **Timeline:** Observed 2026-08-21 at 20:32 and 20:41 under `pnpm tauri:dev`. **Deterministic,
  reproduced twice, not flaky.**
- **Repro (AS ORIGINALLY FILED):** macOS, Steam client quit, appid 259130 not installed,
  primary-half install click.

## PRECONDITION HAS CHANGED — READ BEFORE ATTEMPTING REPRO

Operator confirmed 2026-08-22 that **the real Steam client has since installed AND LAUNCHED
259130 successfully on this machine.** The original repro's "appid 259130 not installed"
precondition therefore **no longer holds**. Steam's install has very likely replaced both the
97 MB of partial `Wasteland.app` content and the `StateFlags "1026"` stub `appmanifest_259130.acf`
that the failed run left behind, and `steamResumePending: true` may still be set in the library
cache from the failed run.

Establish the actual on-disk and cache state BEFORE trying to reproduce — do not assume the
filed preconditions still describe this machine. If a clean repro is needed, note this repo's
ledgered lesson that moving the `.acf` aside and resuming over existing content has produced a
live gate in ~71.5s and zero bytes, rather than a 90 GB re-download.

## Controls already established (operator-confirmed 2026-08-22)

These two answers are the most valuable evidence in this file. **Do not re-derive them; build on them.**

| control | result | what it eliminates |
|---|---|---|
| Another Steam title installs successfully at current HEAD | **PASSES** | The decode path is NOT globally broken. This is not a blanket regression in decrypt/decompress — something is specific to this title or its depots. |
| Real Steam client installs AND launches 259130 | **PASSES** | Valve's own client fetches the key, pulls these exact depots from the same CDN, and decodes the same containers successfully. The depots are sound, the account entitlement is sound, the CDN content is sound. **The fault is ours.** |

Together these bound the search hard: the defect is in GameLib's handling of *these specific
depots*, not in the network, not in the depots themselves, not in the decode implementation
generally.

## Ruled out by the report itself

All **six** CDN hosts were tried (`cache1-akl-edgx`, `cache1-akl-tpwr`, `cache2-akl-tpwr`,
`fastly.cdn.steampipe`, `steampipe.akamaized.net`, `alibaba.cdn.steampipe`), over both `http://`
and `https://`. **Every one returned HTTP 200 with byte-identical content** — same `rawSha1`,
same `contentLength=128`, same `rawPreviewHex`. Not a CDN, network, or host-selection problem.

## Leading hypothesis — NOT ESTABLISHED

`decompress.ts` sniffs the decrypted chunk for `VZ` (LZMA), `VS`/`VSZa` (zstd) or `PK` (zlib
deflate) magic. If depot decryption yields garbage, no magic matches, the code falls through to
the zlib path and raises `Z_DATA_ERROR`. **A wrong or missing depot decryption key would produce
exactly this**, and the `GetCDNAuthToken: empty response` line 6s earlier is a supporting signal.

**This is a hypothesis, not a diagnosis.** Two explicit traps:

1. A prior investigation concluded the CDN-auth arc was a **PHANTOM for a different symptom**.
   That verdict must NOT be assumed to transfer here without re-testing.
2. `contentLength=128` is suspiciously small for a content chunk. A 128-byte body that is
   byte-identical across all six hosts is at least as consistent with **an error/sentinel
   payload being served and then fed to the decoder** as it is with a decryption failure.
   `rawSha1=060a1f2e1610ecbd8cf158beb92e7f0198ad8e22` is a fixed, greppable identity — decoding
   those 128 bytes directly, or comparing them against a known-good chunk fetch, is a cheap and
   very high-information first experiment.

## Strongly related prior session — CHECK BEFORE INVESTIGATING

`.planning/debug/steam-depot-key-appid.md`, status **`awaiting_human_verify`** (created
2026-07-17, never closed). Its root cause: **the depot decryption key was requested with the BASE
appId for depots belonging to DLC/sub-apps**, producing `getDepotDecryptionKey -> EResult
FileNotFound`. That is the same family as this session's leading hypothesis, and here the failing
depots (**259132**, **259134**) are NOT the base appid (**259130**).

That session also records that its failure surfaced to the user as the misleading "Steam servers
dropped the connection" copy — the same misattribution filed separately as todo 37-02.

**Determine whether that fix is present, correct, and actually covers this appid/depot shape
before opening any new line of investigation.** An unclosed `awaiting_human_verify` session is
exactly where a partially-applied fix hides.

## Adjacent behaviour worth checking

There is already a `depotSkipped` path for "Steam wouldn't release its key for this account, so
that content was skipped". It did **not** engage here — instead the install retried for 3.5
minutes and then failed hard. If the key genuinely cannot be obtained, that path should catch
this case.

## Not a regression of the 1026-stub defect

The failed install left `appmanifest_259130.acf` with `StateFlags "1026"` and
`BytesToDownload`/`BytesDownloaded` both `0`. **This is NOT a regression of the closed
1026-stub-clobber todo** (`completed/2026-08-19-failed-plan-build-writes-1026-stub-manifest-clobbering-a-complete-install.md`).
That defect was a stub OVERWRITING a complete install; here there was no prior install to
clobber, so a resume stub is defensible. Verify that distinction still holds before touching the
manifest-write path.

## Constraints

- Live runs ARE available this session (operator confirmed). This repo's ledgered lesson is that
  a live gate has beaten a green test suite three times — do not accept a passing unit test as
  proof that this is fixed.
- `pnpm tauri:dev` is the correct launcher. Plain `tauri dev` serves a STALE bundle.
- The sidecar's `console.*` and file logger are invisible; `gamelib.log` is the observable channel.
- Do NOT `git stash`. There is concurrent uncommitted work in this tree (`package.json`,
  `.graphifyignore`, two untracked `meta/` files) belonging to another session.

## Current Focus

```yaml
reasoning_checkpoint:
  hypothesis: "decompressChunk's `magic === 'PK'` branch (decompress.ts) unconditionally calls zlib.inflateRawSync() on the body without ever reading the ZIP local-file-header's compression-method field (offset 8, 2 bytes LE). Depots 259132/259134's 128-byte chunk is a genuine, correctly-decrypted PK/zip container that Valve stored with method 0 (Stored/uncompressed) rather than method 8 (Deflated) -- plausible for a small chunk where Deflate has no benefit. Feeding Stored bytes into inflateRawSync throws Z_DATA_ERROR deterministically, on every host, because the content and decrypt are both correct -- only our container handling is wrong."
  confirming_evidence:
    - "Z_DATA_ERROR is a zlib-only native error code; grepped every decode call site in decompress.ts and confirmed it can ONLY originate from the single inflateRawSync() call in the PK branch (VZ uses the lzma package, VS/zstd uses zstddec WASM -- neither can produce a zlib error code)."
    - "Empirically reproduced: `zlib.inflateRawSync(Buffer.from('not deflate data'))` throws exactly `{code: 'Z_DATA_ERROR', message: 'invalid block type'}` -- same code, same failure shape as the field report."
    - "SteamKit2's own reference implementation (ZipUtil.cs) uses .NET's ZipArchive, which transparently supports BOTH Stored and Deflated entries -- proving Valve's format legitimately allows Stored, and this codebase's PK branch has no code path that ever produces a non-inflate read."
    - "The existing buildPKChunk test fixture's own compression-method byte is 0 (Stored) via Buffer.alloc's zero-fill, yet its body is actually Deflate-compressed -- proving decompressChunk has zero coverage of the method field, exactly the gap implicated."
  falsification_test: "If a genuinely-Stored PK fixture (uncompressed body, method byte = 0, correct ZIP local-file-header) is fed through decompressChunk AFTER the fix and it does NOT return the original bytes unchanged, or if it still throws, the hypothesis is wrong. Conversely: reverting the fix and running the same fixture through the CURRENT code must reproduce Z_DATA_ERROR -- if it does not, the mechanism is not what I think it is."
  fix_rationale: "The fix reads the compression-method field that Valve's own container format defines and that SteamKit2's reference client already honours, and branches on it (0 -> return the stored payload directly, 8 -> existing inflateRawSync path, anything else -> a properly classified unknown_container error with a diagnostic preview). This addresses the root cause (container-format handling gap) rather than a symptom -- it does not touch decrypt, key-fetch, CDN selection, or retry logic, none of which are implicated by the evidence above."
  blind_spots: "I have not run this against the LIVE failing chunk (post-decrypt plaintext for rawSha1=060a1f2e1610ecbd8cf158beb92e7f0198ad8e22) -- I have not captured or logged that plaintext anywhere, only inferred its first two bytes must be 'PK' from the error code's provenance. It remains possible (though not evidenced) that Valve's Stored entries encode something other than a bare copy of the payload (e.g. a non-zero CRC or size field this fix does not yet validate), or that the local-file-header's nameLen/extraLen calculation is itself wrong for this specific chunk. The live gate (pnpm tauri:dev, resume-over-existing-content per this repo's ledgered lesson) is required before closing this session -- unit tests alone are not sufficient given this repo's 3x precedent of live gates beating green suites."
next_action: "Implement the fix in decompress.ts's PK branch: read buf.readUInt16LE(8) as compressionMethod; if 0, return the payload subarray unchanged; if 8, keep the existing inflateRawSync path; otherwise throw a properly classified unknown_container ChunkDecodeError with decryptedPreview. Then fix the buildPKChunk test fixture to explicitly set method=8, add a new buildStoredPKChunk fixture (method=0, uncompressed body) with a regression test, and run the depot test suite."
```

## Evidence

- timestamp: 2026-08-22
  checked: "grep for every zlib/lzma/zstd call site in src/backend/storeManagers/steam/depot/decompress.ts, and empirically reproduced Node's error shape (`node -e \"require('zlib').inflateRawSync(Buffer.from('not deflate data'))\"`)."
  found: "`Z_DATA_ERROR` is a zlib-specific native error code. In this codebase it can ONLY originate from the single `zlib.inflateRawSync()` call inside decompressChunk's `magic === 'PK'` branch — the VZ branch uses the `lzma` package (no zlib codes) and the VS/zstd branch uses `zstddec` WASM (no zlib codes). Reproduced Node throwing exactly `{ code: 'Z_DATA_ERROR', message: 'invalid block type' }` when `inflateRawSync` is fed non-deflate bytes."
  implication: "The reported `reason=Z_DATA_ERROR` PROVES `magic === 'PK'` matched (i.e. the post-decrypt plaintext's first two bytes ARE ASCII 'PK') and execution reached the inflateRawSync call before failing. This directly eliminates the 'wrong/missing depot decryption key' hypothesis: a bad key would produce high-entropy garbage that would almost certainly NOT match 'PK' (2 specific bytes), and if it somehow did, the failure would occur on the local-file-header field reads or produce a DIFFERENT zlib error shape than a clean, deterministic invalid-block-type on all 6 hosts. The fault is downstream of decrypt, inside the PK/zip container handling itself."
- timestamp: 2026-08-22
  checked: "Read decompressChunk's `magic === 'PK'` branch (decompress.ts) in full, and cross-referenced against the ZIP local-file-header spec (compression method is a 2-byte LE field at offset 8: 0 = Stored, 8 = Deflated) and SteamKit2's own reference implementation (`SteamKit2/SteamKit2/Util/ZipUtil.cs`), which uses .NET's `System.IO.Compression.ZipArchive` and therefore transparently supports BOTH Stored and Deflated entries."
  found: "The `PK` branch reads `nameLen`/`extraLen` to locate the body, then UNCONDITIONALLY calls `zlib.inflateRawSync()` on it. It never reads the compression-method field at offset 8. There is no code path here that would ever produce a Stored (uncompressed) read — every PK-magic chunk is force-fed through the Deflate-only inflate path regardless of its actual method."
  implication: "If Valve stored this specific depot chunk with method 0 (Stored) — plausible for a 128-byte chunk, since Stored has no compression benefit and can even be smaller than a Deflate-compressed equivalent for near-random/small payloads — `inflateRawSync` will throw `Z_DATA_ERROR` deterministically on genuine, byte-correct content, on every host, every attempt. This exactly matches the observed signature (128 bytes, byte-identical across all 6 CDN hosts, 100% deterministic failure) without requiring any decrypt, network, or entitlement fault."
- timestamp: 2026-08-22
  checked: "Existing test fixture `buildPKChunk` in depotPrimitives.test.ts."
  found: "`buildPKChunk` builds its 30-byte local-file-header via `Buffer.alloc()`, which zero-fills — so the fixture's own compression-method field (offset 8) is already `0` (Stored) even though the fixture's body is ACTUALLY Deflate-compressed (`deflateRawSync(data)`). The existing 'PK fixture uses the zlib inflateRaw path' test therefore passes today for the wrong reason: it never exercises the method field at all, because decompressChunk never reads it. This is a masked test gap, not a contradiction of the hypothesis above."
  implication: "Confirms decompressChunk has zero test coverage for a Stored (method 0) PK chunk — the exact case implicated as root cause. A regression test must be added that builds a genuinely-Stored PK chunk (uncompressed body, method byte = 0) and asserts decompressChunk returns it byte-for-byte instead of throwing Z_DATA_ERROR."

## Eliminated

- hypothesis: "CDN, network, or host-selection fault"
  evidence: "All six CDN hosts, over both http and https, returned HTTP 200 with byte-identical content — same rawSha1, same contentLength=128, same rawPreviewHex."
- hypothesis: "The decode path is globally broken at HEAD"
  evidence: "Operator confirmed 2026-08-22 that another Steam title installs successfully at current HEAD."
- hypothesis: "The depots, the CDN content, or the account entitlement are themselves faulty"
  evidence: "Operator confirmed 2026-08-22 that the real Steam client installed AND launched 259130 on this same machine, decoding these same depots from the same CDN."
- hypothesis: "Wrong or missing depot decryption key for depots 259132/259134 (D-UAT-08 owner-appId shape) — decrypted output is garbage, falls through to zlib path, raises Z_DATA_ERROR."
  evidence: "Z_DATA_ERROR is a zlib-only error code that can ONLY be thrown from decompressChunk's `magic === 'PK'` inflateRawSync call in this codebase. Its occurrence PROVES the post-decrypt plaintext's first two bytes are literally ASCII 'PK' — i.e. decrypt succeeded and produced a recognisable, correctly-magic'd container. A wrong/missing key producing high-entropy garbage would not reliably land on 'PK' as its first two bytes, and would in any case fail EARLIER (unknown_container) rather than inside the inflate call itself. Also checked: `select.ts`'s `ownerAppId` stamping (D-UAT-08 fix) is present and structurally correct — it stamps `baseAppId` for base-app depots and the DLC/sub-app's own id from the `dlcInfos` record key otherwise — but this is now moot given the Z_DATA_ERROR-implies-PK-matched proof above."
- hypothesis: "The 128-byte, all-host-identical body is a CDN error/sentinel page being fed to the decoder."
  evidence: "Same Z_DATA_ERROR-implies-PK-matched proof: a generic HTML/JSON error page would not begin with ASCII 'PK' as its first two bytes, and CDNs serving an actual sentinel page would typically also differ in Content-Type or return a non-200 status — neither observed. The byte-identical-across-hosts signature instead corroborates the prior session's precedent (steam-install-slow-start cycle 16/17): identical bytes on every mirror is the signature of genuinely correct, uniformly-mirrored CDN content, not an error page."

## Resolution

root_cause: "decompressChunk's `magic === 'PK'` branch (src/backend/storeManagers/steam/depot/decompress.ts) never reads the ZIP local-file-header's compression-method field (offset 8, 2 bytes LE) and unconditionally calls zlib.inflateRawSync() on the body, assuming Deflate (method 8). Depots 259132/259134's 128-byte chunk is a genuine, correctly-decrypted PK container that Valve stored with method 0 (Stored/uncompressed) -- plausible for a chunk this small, where Deflate has no benefit. Feeding Stored bytes into inflateRawSync throws Z_DATA_ERROR deterministically on every host, because the content and decryption are both correct; only this codebase's container handling is wrong. SteamKit2's own reference implementation supports both methods via .NET's ZipArchive, confirming Valve's format legitimately uses both."
fix: "decompressChunk's `magic === 'PK'` branch (decompress.ts) now reads the ZIP local-file-header's compression-method field (buf.readUInt16LE(8)) before deciding how to handle the body: method 0 (Stored) returns the payload unchanged; method 8 (Deflated) keeps the existing zlib.inflateRawSync() path; any other value throws a properly classified `unknown_container` ChunkDecodeError with a decryptedPreview for future diagnosis. Also fixed both test suites' `buildPKChunk` fixtures (depotPrimitives.test.ts, decompressPool.test.ts) to explicitly stamp method=8 -- they previously left the field at its Buffer.alloc zero-fill default (0/Stored) while building an actually-Deflated body, meaning neither ever exercised the field this fix now reads. Added a new `buildStoredPKChunk` fixture and regression test proving a genuinely-Stored PK chunk round-trips byte-for-byte post-fix, plus an anchor test proving the pre-fix mechanism (feeding a Stored body into inflateRawSync throws Z_DATA_ERROR) to confirm the fixture reproduces the field defect's exact failure shape."
verification: "Self-verified: full Steam test suite (39 suites, 1368 passed / 2 skipped, 0 failed) including the two previously-mismatched PK fixtures in decompressPool.test.ts that surfaced when the fix changed behavior for method=0 (their own buildPKChunk had the same zero-fill gap; fixed alongside). `npx tsc --noEmit` clean on all changed files. NOT YET verified against a live install of appid 259130 -- pnpm tauri:dev live gate still required per this repo's ledgered precedent that a live gate has beaten a green suite three times, and per this session's own documented blind spot (the actual post-decrypt plaintext for the failing chunk was never captured/logged, so the 'PK'-magic + Stored-method inference, while strongly evidenced by the Z_DATA_ERROR provenance proof, has not been confirmed against the real bytes)."
files_changed:
  - "src/backend/storeManagers/steam/depot/decompress.ts"
  - "src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts"
  - "src/backend/storeManagers/steam/__tests__/decompressPool.test.ts"

---

## LIVE GATE RESULT — 2026-08-22 08:04-08:05 (operator-run, `pnpm tauri:dev`, real hardware)

**The PK/Stored fix WORKS. `Z_DATA_ERROR` is ELIMINATED — zero occurrences in the run.**
The install got materially further, then failed on a NEW, much narrower defect.

### What the run proved

| observation | evidence |
|---|---|
| `Z_DATA_ERROR` gone | zero occurrences across the whole run (was 142) |
| Download completed | `chunk-stream stats @100s: percent=100%`, `747` total attempts |
| Content written | `steam-flags-census stage=download-complete appId=259130 totalFiles=428` |
| Only ONE chunk fails | same 128-byte chunk, `rawSha1=060a1f2e1610ecbd8cf158beb92e7f0198ad8e22`, ~8 failures / 747 attempts |
| Failure reclassified | `reason=sha1_mismatch` (was `Z_DATA_ERROR`) |
| User-facing copy now honest | "A downloaded file failed verification." (was the bogus "Steam servers dropped the connection") |
| CDN-auth is NOT fatal | `GetCDNAuthToken failed for depot=259134 ... eresult=1 empty response` appeared, yet the download still reached 100% — **corroborates the prior PHANTOM verdict** |

New post-decrypt-adjacent datum now in the log: `rawPreviewHex=04a49a88de6cb7f150c9f37dd2d56483`
(high-entropy, consistent with the still-encrypted body).

### NEW ROOT CAUSE HYPOTHESIS — trailing ZIP metadata is being returned as payload

Strongly evidenced, not yet proven byte-for-byte. The Stored branch does:

```js
const body = buf.subarray(30 + nameLen + extraLen)   // runs to END of buffer
if (compressionMethod === 0) return Buffer.from(body)
```

A real ZIP container does not end at the payload. After it come the **central directory file
header** (46 bytes + name + extra + comment) and the **end-of-central-directory record**
(22 bytes + comment). So the Stored branch returns *payload + ~68 bytes of trailing ZIP
metadata*, and the SHA-1 cannot match.

**Why this was invisible for Deflate:** `inflateRawSync` stops at the end of the deflate stream
and silently ignores trailing bytes. Method 0 has no decoder to stop at the right place, so
Stored is the ONLY method that exposes the over-read. This explains precisely why every other
chunk in these depots decodes fine and this one does not.

**Arithmetic fits:** 128 total − 30 local header − 46 central dir − 22 EOCD ≈ 30 bytes of real
payload.

**Diagnostic ordering note:** a wrong LENGTH surfaces as `sha1_mismatch` because the SHA-1 gate
(`decompress.ts:394`) runs BEFORE the size gate (`:400`). The size check would have named this
directly. Consider whether checking size first would classify length faults more honestly.

### THE NEW TEST CANNOT CATCH THIS — second unrealistic fixture in the same file

`buildStoredPKChunk` (`depotPrimitives.test.ts`) allocates exactly
`30 + nameLen + extraLen + data.length` — **no central directory, no EOCD.** It is a
payload-only container that does not exist in the wild, so `subarray(30+nameLen+extraLen)` is
exactly the payload and the test passes.

This is the SECOND fixture in this file encoding an unrealistic container: the first
(`buildPKChunk`) zero-filled the compression-method byte and thereby masked the Stored case
entirely; this one omits the ZIP trailer and masks the over-read. Both look correct. Both
encode the same wrong assumption about what a real container contains. **Any fix must be gated
by a fixture that includes the central directory and EOCD**, or the next layer stays hidden too.

### Direction for the fix

Truncate the Stored body to its declared length instead of running to the buffer end:
`compressedSize` at offset 18 (equal to `uncompressedSize` at offset 22 for Stored), cross-checked
against `cbOriginal` — the trusted, manifest-derived size the zstd branch at `decompress.ts:236`
ALREADY uses as a pre-allocation gate, so there is in-file precedent for exactly this validation.

**Edge case to handle:** if general-purpose bit 3 (`0x08`) is set in the flags at offset 6, the
local header's size fields are zero and the true sizes live in a data descriptor AFTER the
payload. Detect that and fall back to `cbOriginal` rather than truncating to zero.

### Still owed

A second live run after the truncation fix. `Z_DATA_ERROR` being gone is confirmed; the install
completing is NOT — it has never yet succeeded end to end.
