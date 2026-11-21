---
created: 2026-11-21T00:00:00.000Z
title: 'Supply-chain audit red: RUSTSEC-2026-0543 chrono is unmaintained'
area: build
severity: medium
platform: any
ready: code
---

## Problem

Supply-chain audit runs 44853952571 (8af71cd3f) and 44872994926 (5bd0c0b72) fail the cargo
advisories check: `error[unmaintained]: chrono is unmaintained`, RUSTSEC-2026-0543. External
advisory, not caused by a GameLib change.

## Solution

Find which crates pull chrono (`cargo tree -i chrono`), then either move to a maintained
alternative or record a reasoned, dated ignore in the advisory config. Do not blanket-ignore the
unmaintained class.
