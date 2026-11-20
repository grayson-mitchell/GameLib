---
quick_id: 260914-vbw
slug: fix-macos-hardened-runtime-jit-entitleme
status: complete
completed: 2026-09-15
---

# Summary — 260914-vbw

## What shipped

1. **`src-tauri/entitlements.plist`** (new) — `com.apple.security.cs.allow-jit` only.
2. **`src-tauri/tauri.macos.conf.json`** — `bundle.macOS.entitlements` added beside the existing
   `files` map. **The overlay, not the base config**: base `tauri.conf.json` has no `macOS` key
   at all.
3. **Signing todo corrected** — frontmatter `ready: human` → `live-gate`,
   `needs: credentials-then-verify` → `release-run-then-browser-download-verify`; new STATUS
   section recording all six Apple secrets enrolled and Apple-verified; the Direction's
   **"No code changes"** marked superseded in place rather than only contradicted elsewhere.
4. **Windows signing split out** to
   `.planning/todos/pending/2026-09-14-windows-releases-ship-unsigned-no-windows-cert-enrolled.md`.

## Proof, not assertion

Before (real Developer-ID-signed sidecar from the DMG, hardened runtime, no entitlements):

```
EXITED rc=133 after ~3s  -> SIGNAL 5
# Fatal process out of memory: Failed to reserve virtual memory for CodeRange
```

After (same build path, entitlement in place):

```
EXITED rc=0 after ~76s  -> CLEAN EXIT
fatal messages: 0
```

Entitlement confirmed present on **both** `Contents/MacOS/gamelib-sidecar` and the outer `.app`,
with a control binary correctly showing nothing through the same command.
`flags=0x10000(runtime)` and the Developer ID authority chain intact.
`spctl -a -vvv -t install` → `rejected / source=Unnotarized Developer ID`, correct for a local
build with notarization skipped.

The ~76s clean exit exceeds both the 27–39s cold boot recorded elsewhere and `smoke:sidecar`'s
30s `STARTUP_TIMEOUT_MS`, but a full jest run was competing for the machine — treat it as
load-inflated, **not** a measurement against that budget.

## Test status — all four reds accounted for

| suite | verdict |
| --- | --- |
| `tauriConf`, `packagingConfig` (read the changed file) | pass, 85 tests |
| `installedJsonWatcher` | **flake** — 6/6 green, 3× this tree + 3× baseline |
| `expirationAlerts` | **pre-existing**, fails identically at baseline sha `7346ac7e6` |
| `appShellFlows`, `bootstrapWirings`, `depot`, `depotPrimitives`, `lzmaNativeSeaRealBuild`, `sidecarRejectionGuard` | **load artifacts** — all green run serially on an idle machine |

`pnpm planning-gates` 11/11. Prettier clean on every changed file.

## Unfiled defect found in passing

`expirationAlerts` "Pitfall 5" asserts the digest copy must not contain `"7"` as a
`revealedKeyValue`/`keyindex` leak sentinel, and receives
`"Safe Title's Humble key now expires on 7/31/2026"` — **the date supplies the `7`.** The
assertion is calendar-dependent and **will self-heal to green in August without being fixed**,
which is worse than staying red: the next reader sees green and concludes the sentinel works.
Pre-existing, not caused here. Filing deferred to the operator.

> **CORRECTION 2026-09-16 — the causal claim above is WRONG.** Quick `260915-g9p` measured it
> at execution time: the fixture is **`2026-08-01` (August)**, and the `7` came from a
> **UTC-to-local timezone shift in `.toLocaleDateString()`**, which renders that date as
> `7/31/2026` in western-hemisphere zones. It is a zone-dependent rendering defect, not a
> calendar coincidence.
>
> Everything downstream of "the date supplies the `7`" is therefore false, including the
> prediction that it "will self-heal to green in August" — the opposite is nearer the truth,
> and the claim itself only held west of UTC. The error was reading the *rendered* string and
> inferring the *input*, when the rendering was the defect under investigation; the fixture was
> never opened. `260915-g9p` hardened the test and closed the todo with its premise corrected.
>
> Left in place rather than rewritten, because this SUMMARY is a merged artifact and the wrong
> reasoning is more useful visible than silently deleted.

## Three self-inflicted traps, each of which looked like a result

1. **`plutil -lint` returns `OK` on an entitlements plist containing XML comments; codesign's
   AMFI parser rejects them.** The first version carried a rationale comment block and failed
   the bundle step with `AMFIUnserializeXML: syntax error near line 22`. Entitlements plists
   must be comment-free; rationale belongs in PLAN.md.
2. **`tauri build | tail -20` reports exit 0 when the build FAILS** — the pipeline's status is
   `tail`'s. `failed to bundle project` and `[exited with code 0]` appeared together. `tail` also
   discarded the `FAIL` lines before they reached the log, so grepping it later found nothing.
3. **A failed build leaves the PREVIOUS DMG in place and it inspects like a real result.** Via
   trap 2 the failure was invisible, so the old DMG's missing entitlement was reported as "the
   fix does not work" — a false negative against correct code. Delete the artifact before
   rebuilding.

Also: `plutil -extract com.apple.security.cs.allow-jit` cannot read that key (`-extract` splits
on `.`); `--selectProjects backend` matched nothing (it is `Backend`) and `--passWithNoTests`
made that a green no-op; `--testPathPatterns` is Jest 30's spelling, this repo is jest 29.7.0
(`--testPathPattern`).

## Not done — operator-gated

The todo's Verification section is untouched and still owed: publish a release, then
`codesign -dv`, `spctl -a -vvv -t install` (must read `source=Notarized Developer ID`),
`xcrun stapler validate`, and a **browser** download on a machine that never built the app.
`curl` does not set `com.apple.quarantine`, so it cannot test what users hit. Everything proven
here is a local build; nothing has been notarized.
