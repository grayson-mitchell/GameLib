---
created: 2026-08-21
title: "Steam depot chunks fail to decode (Z_DATA_ERROR) on every CDN host — install dies after 211s"
area: steam-depot
status: CLOSED
severity: major
files:
  - src/backend/storeManagers/steam/depot/decompress.ts
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/depot/decompressPool.ts
resolves_phase: 37
planned_as: 37-01
---

## Symptom

Installing **Wasteland 1 - The Original Classic** (259130) on macOS fails after ~211 seconds
with **142** `Z_DATA_ERROR` decode failures. Reproduced twice on 2026-08-21 (20:32 and 20:41)
— **deterministic, not flaky.**

```
fetchChunk: decode-stage failure reason=Z_DATA_ERROR depot=259132
  attempt=7 httpStatus=200 contentType=application/x-steam-chunk
  contentEncoding=absent contentLength=128 rawBodyBytes=128
  rawSha1=060a1f2e1610ecbd8cf158beb92e7f0198ad8e22
```

Affected depots: **259132** (97 failures) and **259134** (6). The mac depot set for this title.

## The download is fine — the decode is not

All **six** CDN hosts were tried (`cache1-akl-edgx`, `cache1-akl-tpwr`, `cache2-akl-tpwr`,
`fastly.cdn.steampipe`, `steampipe.akamaized.net`, `alibaba.cdn.steampipe`), over both `http://`
and `https://`. **Every one returned HTTP 200 with byte-identical content** — same
`rawSha1`, same `contentLength=128`, same `rawPreviewHex`. This is not a CDN, network or
host-selection problem.

## Leading hypothesis

`decompress.ts:171` sniffs the decrypted chunk for `VZ` (LZMA) or `PK` (zlib deflate) magic. If
depot decryption yields garbage, neither magic matches, the code falls through to the zlib path
and raises `Z_DATA_ERROR`. **A wrong or missing depot decryption key would produce exactly
this.** Supporting signal, logged 6 seconds before the terminal failure:

```
CdnAuthTokenCache: GetCDNAuthToken failed for depot=259132
  host=steampipe.akamaized.net: ContentServerDirectory.GetCDNAuthToken: empty response
```

Note a prior investigation concluded the CDN-auth arc was a PHANTOM for a different symptom —
do not assume that verdict transfers here without re-testing.

## Adjacent behaviour worth checking

There is already a `depotSkipped` path for "Steam wouldn't release its key for this account, so
that content was skipped". It did **not** engage here — instead the install retried for 3.5
minutes and then failed hard. If the key genuinely cannot be obtained, that path should catch
this case.

## Leftover state

The failed install left `appmanifest_259130.acf` with `StateFlags "1026"` and
`BytesToDownload`/`BytesDownloaded` both `0` in the primary library, plus 97 MB of partial
`Wasteland.app` content, and set `steamResumePending: true` in the library cache.

**This is NOT a regression of the closed 1026-stub-clobber todo**
(`completed/2026-08-19-failed-plan-build-writes-1026-stub-manifest-clobbering-a-complete-install.md`).
That defect was a stub OVERWRITING a complete install; here there was no prior install to
clobber, so a resume stub is defensible. Verify that distinction still holds before touching
the manifest-write path.

## Repro

macOS, Steam client quit, appid 259130 not installed, primary-half install click.

## CLOSED 2026-08-22 — live gate PASSED

Root-caused and fixed over two cycles of debug session `steam-depot-decode-z-data` (archived in
`.planning/debug/resolved/`). The leading hypothesis in this todo — a wrong/missing depot
decryption key — was **WRONG and is explicitly disproven**: `Z_DATA_ERROR` is a zlib-only code
that in this codebase can only come from the single `inflateRawSync()` call in the `PK` branch,
which PROVES the post-decrypt plaintext started with ASCII `PK` and therefore that decryption
SUCCEEDED. The CDN-auth `GetCDNAuthToken` signal noted here was likewise a red herring — it still
appears on fully successful installs.

Actual causes, both in `decompress.ts`'s PK branch: (1) the ZIP compression-method field at
offset 8 was never read, so Stored (method 0) chunks were force-fed to `inflateRawSync`
(commit `f3f63fd72`'s predecessor); (2) the Stored body ran to the buffer END, absorbing the
central directory + EOCD as payload (`f3f63fd72`).

Live gate 2026-08-22 09:11: install completed, 428 files, `Z_DATA_ERROR` 0, `sha1_mismatch` 0,
content byte-identical to Steam's own install of the same title, game launches.
