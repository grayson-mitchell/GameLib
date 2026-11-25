---
created: 2026-11-25T14:00:00.000Z
title: "The GOG GalaxyCommunication dummy step copies to an empty path when winepath answers nothing"
area: launch
files:
  - src/backend/launcher.ts:1105-1135 (getWinePath, then existsSync/mkdirSync(dirname)/copyFile on its answer)
  - src-tauri/crates/gamelib-launch/tests/fixtures/golden/prepare_wine/expected/named-gog-dummy-winepath-empty/begin.json
severity: minor
platform: any
ready: code
---

## Problem

Recorded by the 88.1-03 prepare_wine golden (`named-gog-dummy-winepath-empty`, D-20: kept as recorded, not fixed
there). When `winepath -u` answers an empty string (the prefix could not be read), `getWinePath` logs "Couldn't get
wine path" and returns `''`. The step does not stop on it: `existsSync('')` is false, `mkdirSync(dirname(''))`
creates `.` (the sidecar's working directory, already there) and `copyFile(dummy, '')` throws, which the catch logs
as "Failed to install GalaxyCommunication dummy into the prefix". The launch goes on, so nothing is broken, but two
error lines and a filesystem call on `''` stand where an early skip would do.

## Solution

Not part of the port. Skip the step when the translated path is empty (one warning), in the Rust op and the golden
together, as one deliberate change recorded in `deltas.json`.
