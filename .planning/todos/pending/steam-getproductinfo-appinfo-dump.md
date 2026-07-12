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
