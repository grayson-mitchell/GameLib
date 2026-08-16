---
title: Runtime getProductInfo appinfo dump to lock the osarch parser
date: 2026-07-12
priority: high
blocks: "Phase — macOS 32-bit detection, badge & CrossOver routing"
---

# One-off appinfo dump before writing the osarch parser

**Why:** Research confirmed `config.launch[N].config.osarch` across community/tooling
sources but NOT from a canonical Valve schema doc. Casing/nesting must be verified
against a live payload before the parser is locked, or we risk silently reading
`undefined` for every game.

**Do:**
1. With an authenticated `steam-user` session, call
   `getProductInfo([<knownMacAppId>], [])` for:
   - a known **32-bit-only** mac title (osarch should be `"32"`),
   - a known **64-bit** mac title (osarch `"64"`),
   - an **old** mac title suspected to have NO osarch (to see the blank case).
2. Dump `apps[appid].appinfo.config.launch` to JSON and record:
   - exact key path + casing of `osarch` and `oslist`,
   - whether older entries use `"osx"` vs `"macos"`,
   - what the absent-osarch case actually looks like (missing key vs empty string).
3. Save the sample payloads next to this note (or into the phase's RESEARCH) so the
   parser and its tests can assert against real shapes.

**Then:** feed the confirmed shape into the detection phase's plan; see
[[steam-mac-arch-detection-decisions]].

## Resolution 2026-08-16 — STALE, premise inverted (quick task 260816-i8a)

**The dump was done, and the answer inverted this todo's premise.** `osarch` is not a usable
mac-architecture signal, so the parser this note existed to de-risk was never written — there is
nothing left to lock.

Evidence in shipped source:

- `src/backend/storeManagers/steam/library.ts:1155-1162` records the finding directly:
  *"Steam's manual osarch metadata proved absent/unreliable on every macOS launch entry (18-01
  finding, retired)"*. The 18-01 finding is the retired one; this todo is its unclosed ledger
  entry.
- The shipped detector is a **post-install Mach-O binary read**, not a metadata parser:
  `machOArchsOf` (`library.ts:1173`) runs `lipo -archs` with a `file` fallback. The same comment
  block names it *"the ONLY detector in this phase that may ever assert `mac_arch === '32'`"* —
  the pre-install min-OS heuristic (`games.ts` `macArchFromMinOS`) structurally never returns
  `'32'`.
- Sample payloads asked for in step 3 exist as test fixtures:
  `src/backend/storeManagers/steam/__tests__/fixtures/appinfo-64bit.json`.
- The phase named in `blocks:` has shipped.

**Near-miss worth recording so this is not "re-discovered" as still-open:**
`src/backend/storeManagers/steam/depot/select.ts:195-198` *does* read `osarch` and skip
non-matching depots. That is **depot selection**, a different purpose from the mac-arch
detection this todo was scoped to. A grep for `osarch` therefore hits live code — but not the
parser this note was about.

Closed as no longer actionable. If a future need for a metadata-side arch signal appears, start
from the 18-01 finding (osarch is unreliable on macOS launch entries), not from this note's
assumption that it is merely unverified.
