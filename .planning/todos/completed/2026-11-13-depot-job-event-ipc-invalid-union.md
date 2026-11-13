---
created: 2026-11-13T00:00:00.000Z
title: 'depotJobEvent IPC_INVALID_ARGS invalid_union during bridge delta jobs'
area: steam
severity: minor
platform: macos
ready: code
source: '74-UAT item 18 (2026-11-13): sidecarRpc IPC_INVALID_ARGS kind=send channel=depotJobEvent paths=0.kind codes=invalid_union x4'
files:
  - src/backend/ipc/contract
---

A depot job event kind emitted during bridge delta updates is not admitted by the IPC contract union, so the send is rejected (four times per update). The update still completes. Add the kind to the contract or stop emitting it; run check:ipc-contract.

Resolved by 74-27: the zod union lacked the Phase 74 `stage` kind
