---
created: 2026-11-27T09:30:00.000Z
title: "callRunner appends its writer to the caller's options.logWriters, so a reused options object writes each chunk several times"
area: launch
files:
  - src/backend/runnerAdapter.ts:181-182 (options.logWriters ??= []; options.logWriters.push(...))
severity: minor
platform: any
ready: code
---

## Problem

88.2 code review IN-01, deferred in 88.2 UAT test 2 (matches the old TS). Every call pushes the runner's writer onto
the caller's own array. A caller that reuses one options object (a retry loop) ends up with the writer several times;
the new per-writer `handOff()` then sends one target per copy and every chunk is written once per copy.

## Solution

Copy the array (`const writers = [...(options.logWriters ?? []), runnerWriter]`) instead of mutating the caller's.
Check no caller relies on reading the appended writer back.
