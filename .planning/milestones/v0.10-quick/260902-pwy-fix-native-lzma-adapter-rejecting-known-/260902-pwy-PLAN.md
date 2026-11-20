---
phase: quick-260902-pwy
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/depot/lzmaLoader.ts
  - .planning/quick/260902-pwy-fix-native-lzma-adapter-rejecting-known-/260902-pwy-PLAN.md
  - .planning/quick/260902-pwy-fix-native-lzma-adapter-rejecting-known-/260902-pwy-SUMMARY.md
autonomous: true
requirements: []
must_haves:
  truths:
    - "createNativeAdapter() decodes an lzma_alone stream that declares a KNOWN uncompressed size and carries an end-of-stream marker -- the exact shape the pure-JS `lzma` package and decompress.ts's VZ branch both produce"
    - "The caller's input Buffer is never mutated -- the size-field rewrite happens on a copy"
    - "A stream whose payload cannot produce declaredSize bytes still surfaces the decoder error -- the recovery path never fabricates or short-pads output"
    - "NATIVE_LZMA_DECODE_ENABLED stays false; the shipped default decoder is still pure-JS"
    - "SMOKE_TEST_COMPRESSED and SMOKE_TEST_PLAINTEXT are byte-for-byte unchanged"
    - "No test is weakened, retuned, skipped or deleted -- the 3 failing assertions pass because the adapter became correct"
  artifacts:
    - path: "src/backend/storeManagers/steam/depot/lzmaLoader.ts"
      provides: "native alone-decoder adapter that tolerates a known-size header on liblzma 5.2.3"
  key_links:
    - "src/backend/storeManagers/steam/depot/lzmaLoader.ts :: createNativeAdapter"
    - "src/backend/storeManagers/steam/depot/decompress.ts :: decompressChunk VZ branch (known-size alone header rebuild)"
    - "src/backend/storeManagers/steam/__tests__/decompressPool.test.ts :: lzmaLoader describe blocks"
---

<objective>
`lzma-native@8.0.6` bundles **liblzma 5.2.3** (confirmed at runtime via
`lzman.versionString()`). That version's `lzma_alone_decoder` **rejects an lzma_alone stream
that declares a KNOWN uncompressed size while also carrying an end-of-stream marker**, erroring
`Data is corrupt`. The system `xz 5.8.3` decodes the identical bytes correctly, so the stream is
valid — this is a liblzma-version behaviour difference, not a corrupt fixture.

Consequence today: `smokeTest()` fails, `resolveLzmaModule()` falls back to pure-JS, and
`lzmaDecoderKind()` returns `'pure-js'` where three tests in `decompressPool.test.ts` expect
`'native'`.

Consequence tomorrow: `decompress.ts:182-187`'s real VZ branch rebuilds an alone header with a
**known** size, so every real Steam VZ chunk would hit the same rejection the moment
`NATIVE_LZMA_DECODE_ENABLED` is ever flipped on. This is a latent production defect on the
gated-off native path, not merely a test-fixture problem.

Output: one behavioural fix to `createNativeAdapter()`, committed atomically, with the
liblzma version finding documented inline.
</objective>

<evidence>
Measured on this machine (darwin-arm64), 2026-09-02 — every claim below was run, not inferred:

| Probe | Result |
|---|---|
| `lzman.versionString()` | `5.2.3` |
| `xz --version` | `liblzma 5.8.3` |
| `xz --format=lzma -dc` on `SMOKE_TEST_COMPRESSED` | decodes correctly → fixture is VALID |
| pure-JS `lzma@2.3.2` re-compress of `SMOKE_TEST_PLAINTEXT` | byte-identical to `SMOKE_TEST_COMPRESSED` → fixture is NOT stale |
| lzma-native `aloneDecoder` on the fixture | `ERR Data is corrupt` |
| same fixture, dict size 64K→8M | `ERR Data is corrupt` (dict size is NOT the variable) |
| same fixture, size field → `0xFF × 8` | **OK**, 30 bytes, correct plaintext |
| lzma-native's OWN `aloneEncoder` header | `5d 00 00 10 00 ff ff ff ff ff ff ff ff` — it writes UNKNOWN size, which is why its self-round-trip passes and hid this |
| unknown-size rewrite, input trimmed 2/4/5 B (EOS destroyed) | `ERR No progress is possible` but **30 bytes already emitted** → prefix recoverable |
| unknown-size rewrite, input trimmed 6 B | error, only **29** bytes emitted (< declared 30) → correctly still an error |

That last pair is the whole basis for the error-path recovery: liblzma emits every decodable
byte before erroring, so `collected >= declaredSize` cleanly separates "the stream simply had
no EOS marker" from "the stream is genuinely short", and the recovery can never pad or invent.
</evidence>

<execution_context>
@CLAUDE.md
</execution_context>

<task_1>
**Fix `createNativeAdapter()` in `src/backend/storeManagers/steam/depot/lzmaLoader.ts`.**

files: `src/backend/storeManagers/steam/depot/lzmaLoader.ts`

action:
1. Before creating the decoder stream, inspect the input. When
   `input.length >= 13` and the 8 bytes at offset 5 are not already all `0xFF`,
   read the declared uncompressed size and take a **copy** of the input with those
   8 bytes overwritten with `0xFF`. Never write through to the caller's buffer.
   Read the size as a 32-bit LE quantity from offset 5 — `decompress.ts` only ever
   writes the low 4 bytes (`size.writeUInt32LE(outSize, 0)`), and a chunk larger
   than 4 GiB is not a shape this codebase produces.
2. `'end'` → `callback(Buffer.concat(chunks))`, truncated to `declaredSize` when known.
3. `'error'` → if `declaredSize` is known AND the collected byte count is
   `>= declaredSize`, call back with the `declaredSize`-length prefix as SUCCESS
   (covers a known-size stream with no EOS marker). Otherwise surface the error
   exactly as today, via the existing `callback(Buffer.alloc(0), err)` shape.
4. Keep the existing `settled` double-callback guard covering all paths.
5. Document the liblzma 5.2.3-vs-5.8.3 finding in a comment on the adapter, in the
   heavy-comment style the rest of the file already uses, including the fact that
   lzma-native's own encoder writes an unknown size and therefore never exercised this.

verify:
- `npx jest --selectProjects Backend src/backend/storeManagers/steam/__tests__/decompressPool.test.ts` → 41/41
- `npx tsc --noEmit` clean
- whole `src/backend/storeManagers/steam/__tests__/` directory green

done: the three `expect(lzmaDecoderKind()).toBe('native')` assertions pass, the garbage-payload
error-path test still rejects, and `NATIVE_LZMA_DECODE_ENABLED` is still `false`.
</task_1>

<constraints>
- Do NOT flip `NATIVE_LZMA_DECODE_ENABLED`. It stays `false`. Its documented 3-step re-enable
  protocol (cold SEA build self-test, un-skipping `lzmaNativeSeaRealBuild.test.ts`, a live depot
  install) is explicitly out of scope — this plan makes the adapter correct, it does not
  adjudicate the SEA real-chunk decode hang.
- Do NOT weaken, retune, skip or delete any test.
- Do NOT change `SMOKE_TEST_COMPRESSED` or `SMOKE_TEST_PLAINTEXT`.
- Do NOT touch `decompress.ts` — the known-size header it builds is correct and is what the
  adapter must now accept.
- Touch no file other than `lzmaLoader.ts` plus this task's own planning artifacts.
</constraints>
