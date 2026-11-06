---
created: 2026-11-06T12:00:00.000Z
title: "Measure, then adopt, noUncheckedIndexedAccess per directory (steam/ and bridge/ first)"
area: tooling
files:
  - tsconfig.json
  - src/backend/storeManagers/steam/
  - src/backend/storeManagers/steam/bridge/
severity: minor
platform: any
ready: code
---

## Problem

`tsconfig.json` sets `strict`, `noImplicitAny`, `strictNullChecks` and `noImplicitReturns`, but
not `noUncheckedIndexedAccess`. Array and record lookups are typed as always defined, which hides
`undefined` reads in exactly the code that parses untrusted bytes and text: VDF/ACF parsing,
depot manifests, PE and Mach-O scanning. From the second architecture review on 2026-11-06
(item 6).

## Solution

Run with `/gsd-quick`. The error count is unknown, so this task starts by measuring it.

1. Turn the flag on locally, run `pnpm codecheck`, and record the error count per top-level
   directory. Do not commit the flag at this step.
2. If the whole repo is small enough to fix in one quick task (a few dozen sites), fix them and
   enable it repo-wide.
3. Otherwise enable it for `src/backend/storeManagers/steam/` and `steam/bridge/` first, through
   a scoped tsconfig or a typecheck step over those paths, and record the remaining per-directory
   counts as a shrink-only ratchet. Raise a follow-up todo for the rest.

Fix sites by narrowing (an explicit check or a default), never with a non-null `!`. A `!` added
only to silence the flag defeats its purpose. Phases 62 and 65 move code in `steam/`, so
coordinate to avoid conflicts with an in-flight move.
