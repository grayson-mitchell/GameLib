---
spike: 002
name: steam-user-depot-download
type: standard
validates: "Given an authenticated steam-user connection, when we fetch a depot manifest and download every chunk, then all files land on disk SHA1-verified and byte-identical to Steam's own install"
verdict: VALIDATED
related: [001]
tags: [steam, depot, download, cdn, lzma, crypto]
---

# Spike 002: In-Process Depot Download via `steam-user`

## What This Validates

**Given** an authenticated `steam-user` CM connection,
**when** we fetch a depot manifest and download every chunk in-process,
**then** all files land on disk SHA1-verified and **byte-identical to what the real Steam
client downloaded**.

This decides the architecture fork from `.planning/notes/steam-depot-install-architecture.md`:

- **Option A** — in-process TypeScript on `steam-user`'s existing authenticated connection.
- **Option B** — a C# wrapper around SteamRE/DepotDownloader (a second language, toolchain,
  and 5-platform .NET release pipeline, permanently inside an Electron repo).

## Result

**VALIDATED. Option A works. Option B is unnecessary.**

```
171/171 files in 6.3s   17.8 MB/s   (lzma-native)
171/171 files in 13.8s   8.1 MB/s   (pure-JS lzma)

171/171 files BYTE-IDENTICAL to Steam's own install.
```

Ground truth was WazHack (264160), already installed by the real Steam client — so every
downloaded file could be diffed against the bytes Steam itself fetched. Output went to a
scratch dir; `steamapps/` was never touched.

## The Central Finding

**`steam-user` gives us everything hard and gets both easy things wrong.**

It correctly handles CM authentication, PICS, depot decryption keys, raw manifest fetch, and
the content-server list. But its two *convenience helpers* are broken against current Steam:

### 1. `getManifest()` truncates every filename

`content_manifest.js:92`:

```js
file.filename = SteamCrypto.symmetricDecrypt(Buffer.from(file.filename, 'base64'), key);
file.filename = file.filename.slice(0, file.filename.indexOf(0)).toString('utf8');
```

The decrypted plaintext is `filename + NUL + PKCS#7 padding`. The buffer handed back has no
NUL where this code expects one, so `indexOf(0)` returns `-1` and `slice(0, -1)` silently
chops a byte — leaving every filename truncated to an AES block boundary:

```
UnityEngine.SubstanceModule.dll  →  UnityEngine.Substan
resources.resource               →  resources.r
sharedassets0.resource           →  sharedasset
```

Every returned filename length was exactly `16n − 1` (47, 63, 31, 95…) — the tell that gave
it away.

### 2. `downloadChunk()` / `downloadFile()` fail outright

Both throw `Illegal starting byte: 152` (a ByteBuffer error) before producing any data. 156
of 171 files failed.

### Neither is a protocol problem

Decrypting by hand recovers **perfect plaintext**:

```
"WazHack.app\Contents\Resources\Data\resources.resource\0\t\t\t\t\t\t\t\t\t"
                                     └─ real filename ─┘ └NUL┘ └ PKCS#7 ─┘
```

…and fetching a chunk by hand yields a valid `VZ` LZMA container with a `zv` footer that
decompresses to a SHA1-exact 105664 bytes. **The data was always there.** Only `steam-user`'s
handling of it is wrong, and the fix is ~100 lines (`steam-depot.mjs`).

This is a much better outcome than it first looked: the *hard* parts (auth, protocol, keys,
manifests) are exactly the parts `steam-user` does correctly, and they are also the parts we'd
least want to reimplement.

## What We Had To Implement (`steam-depot.mjs`)

1. **`steamDecrypt()`** — first 16 bytes of ciphertext are the IV, itself AES-256-ECB
   encrypted under the depot key; the remainder is AES-256-CBC, PKCS#7 padded.
2. **`decryptFilename()`** — strip PKCS#7 padding, *then* cut at the NUL.
3. **`decompressChunk()`** — Steam's `VZ` container:
   `'VZ'(2) | version 'a'(1) | timestamp(4) | lzma props(5)` header, raw LZMA body,
   `outputCrc(4) | outputSize(4) | 'zv'(2)` footer. **`outputSize` is at `len−6`, not `len−4`**
   — the trailing `zv` magic is two bytes. Getting this wrong yields
   `LZMA_BUF_ERROR: No progress is possible`.
4. **Chunk retry across content servers** — see below.
5. **File reassembly** — place each chunk at its declared `offset`, then verify the whole
   file's `sha_content`.

## Investigation Trail

1. **Naive run using `steam-user`'s helpers.** 15/171 files. Garbage filenames, decode errors.
2. **Hypothesis: the pure-JS LZMA fallback is corrupting things.** `steam-user` declares
   `lzma-native` as an optional dep, and the project's stack doc deliberately avoids native
   modules — so this seemed likely. **Installed `lzma-native`. It changed nothing.** Identical
   failures. Hypothesis dead.
3. **Noticed every filename length was `16n − 1`.** An AES block boundary — this is a padding
   bug, not corruption.
4. **Decrypted by hand with padding disabled.** Found perfect plaintext + NUL + valid PKCS#7.
   The decryption was never broken; `steam-user`'s unwrapping is.
5. **Fetched one chunk by hand.** CDN 200, decrypt → `VZ` magic, decompress → SHA1 exact.
   Protocol fully accessible.
6. **Built the real downloader.** 143/171 — the 28 failures were all `fetch failed`, i.e.
   transient CDN drops under concurrency, not protocol errors.
7. **Added retry with content-server rotation.** 171/171, byte-identical.
8. **Re-ran on pure-JS LZMA.** Also 171/171 — 2.2× slower, but correct.

## Findings

### Finding 1 — `lzma-native` is a performance optimisation, NOT a requirement

| Backend | Time | Throughput | Correctness |
|---|---|---|---|
| `lzma-native` (native module) | 6.3s | 17.8 MB/s | 171/171 byte-identical |
| `lzma` (pure JS) | 13.8s | 8.1 MB/s | 171/171 byte-identical |

**The project's deliberate pure-JS constraint holds.** No native module, no `node-gyp`, no
Electron rebuild. `lzma-native` remains available later as a pure speed win if download
throughput ever matters more than build simplicity.

(This retires the concern raised in `steam-depot-install-architecture.md`, which flagged
`lzma-native` as a possible forced native dependency.)

### Finding 2 — CDN drops under concurrency are normal; retry is mandatory

At concurrency 8, ~16% of chunks failed with `fetch failed` (ECONNRESET). This is **not** a
protocol error — Steam's CDN edges simply drop connections under load. Retrying across a
*different* content server (4 attempts, 200/400/800ms backoff) took it to 171/171.

Any real implementation needs this. A downloader without retry will look broken.

### Finding 3 — the chunk SHA1 is a free integrity check

A chunk's `sha` **is** the SHA1 of its decompressed bytes. Verification costs nothing extra —
hash what you decompressed and compare. Combined with the per-file `sha_content`, integrity is
checkable at two levels without any additional requests.

### Finding 4 — the orchestrator DoctorMcKay declined to write is small

[Issue #183](https://github.com/DoctorMcKay/node-steam-user/issues/183) (`downloadGame()`,
closed `wontfix`) was the main argument for Option B. But that orchestrator is small **because
decision D-2 scoped updates to Steam**: no delta-patching, no resume, no integrity repair —
just *get the manifest, fetch every chunk, place it at its offset, verify*. That is the whole
job, and it is ~100 lines plus retry.

The hard parts of DepotDownloader are exactly the parts we deliberately don't need.

## Signal for the Build

| Decision | Status |
|---|---|
| **Option A — in-process via `steam-user`** | **✓ CHOSEN.** Proven byte-identical to Steam. |
| **Option B — C# DepotDownloader wrapper** | **✗ REJECTED.** No longer has a justification. |
| Pure-JS LZMA (no native module) | **✓ Works.** 2.2× slower; a later opt-in speedup. |
| Do NOT use `steam-user`'s `getManifest()` filenames | **⚠ Hard requirement.** Truncates every name. |
| Do NOT use `steam-user`'s `downloadChunk`/`downloadFile` | **⚠ Hard requirement.** Broken. |
| Retry chunks across content servers | **⚠ Mandatory.** ~16% fail without it. |
| Use `getRawManifest()` + our own decrypt | **✓ The working path.** |

## What This Does NOT Cover

- **One depot, one game, macOS.** Multi-depot games and other platforms are untested here,
  though spike 001 solved depot *selection* across all 11 installed games.
- **Large games.** 112 MB proved correctness, not behaviour at 50 GB (memory: files are
  assembled fully in RAM before writing — fine at this size, needs streaming for large files).
- **Progress reporting UX.** The data is there (bytes/chunks/files); the UI is not built.
- **Resume after interruption.** Deliberately out of scope per D-2, but a user *will* close the
  app mid-download. Worth deciding whether "start over" is acceptable.

## How to Run

```bash
cd .planning/spikes/002-steam-user-depot-download
node download.mjs            # lzma-native if installed, else pure JS
node download.mjs --pure-js  # force the pure-JS backend

node probe.mjs           # isolate the steam-user helper failures
node decrypt-manual.mjs  # show the real filename plaintext + padding
node chunk-manual.mjs    # fetch + decrypt + decompress one chunk by hand
```

Requires a Steam QR login (`../001-acf-adoption/login.mjs`). The token caches to
`.token.json` (gitignored) — **delete it when done.**
