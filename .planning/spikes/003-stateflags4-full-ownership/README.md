---
spike: 003
name: stateflags4-full-ownership
type: standard
validates: "Given a WazHack macOS depot GameLib downloaded 100% (per-chunk sha1-verified), when GameLib writes an appmanifest with StateFlags=4 + consistent bytes + current buildid, then the Steam client shows it Installed with NO verify pass / NO re-download and it launches via steam://rungameid with DRM intact."
verdict: PENDING
related: [001, 002]
tags: [steam, appmanifest, stateflags, full-ownership, d-2-reversal]
---

# Spike 003: StateFlags=4 full-ownership install

## What This Validates

**Given** WazHack's macOS depot fully downloaded by GameLib (every chunk sha1-verified against the
manifest), **when** GameLib writes an `appmanifest_264160.acf` with `StateFlags=4` (FullyInstalled) plus
internally-consistent completion fields, **then** the real Steam client treats the game as Installed
**without a verify pass or any re-download**, and the game **launches** via `steam://rungameid/264160`
with DRM intact.

If true → the new full-ownership scope is feasible (GameLib installs, Steam does nothing).
If false → we learn exactly what Steam distrusts, and fall back (e.g. keep the 1026→adopt handoff).

## Why this challenges a LOCKED requirement (deliberately)

Spike 001 established, and MANIFEST.md records as non-negotiable:

> **Write `StateFlags = 1026`, never `4`.** Claiming `FullyInstalled` asserts our download was
> byte-perfect; if it wasn't, Steam trusts the lie and the user gets a broken game. `1026` asks Steam
> to verify and repair, making it a safety net rather than an adversary.

That reasoning was correct *at the time* — the depot downloader had no integrity guarantee. **Phase 21
shipped a per-chunk `sha1(decompressed) === chunk.sha` integrity gate** (depot/decompress.ts, enforced
in the worker pool too). So "our download was byte-perfect" is now a *checkable guarantee*, not a hope —
which is the precondition that makes StateFlags=4 defensible. This spike tests whether that guarantee is
sufficient for Steam to trust a GameLib-authored 4. It does NOT remove the 1026 requirement unless it
passes.

## The real unknown: which fields are load-bearing?

Today `finalizeToSteam` → `writeAppManifest` writes (manifest.ts):
- `StateFlags "1026"`, `BytesToDownload "0"`, `BytesDownloaded "0"`, `buildid "0"`, real `SizeOnDisk`.

For StateFlags=1026 those zeros are fine — Steam's verify pass recomputes everything. For a StateFlags=4
that Steam should trust *without verifying*, the hypothesis is Steam will re-verify / flag UpdateRequired
unless:
- `StateFlags = 4`
- `BytesToDownload = BytesDownloaded = SizeOnDisk` (not 0 — else "nothing downloaded")
- `buildid = current public-branch buildid` (from PICS `appinfo.depots.branches.public.buildid`; today
  finalizeToSteam does NOT thread this — it writes 0, which Steam reads as a stale/unknown build →
  UpdateRequired → re-download)
- InstalledDepots present with correct manifest GIDs (already written)

So a secondary deliverable of this spike is discovering the MINIMUM trustworthy field set — we'll test
field-completeness variants.

## Experiment design (real hardware — macOS + real Steam, WazHack appId 264160)

Throwaway, env-gated code change (`GAMELIB_SPIKE_STATEFLAGS4=1`) so it's trivial to toggle/revert:
- manifest.ts: when the flag is set, write `StateFlags "4"` and `BytesToDownload/BytesDownloaded =
  SizeOnDisk`.
- finalizeToSteam / buildDepotPlan: thread the current `public` branch `buildid` from appinfo into the
  manifest (replaces the hard-coded "0").

Run variants to find the load-bearing fields:
- **V0 (control):** current behavior — StateFlags=1026 → Steam adopts via verify (already known to work,
  spike 001 / UAT 1a).
- **V1:** StateFlags=4, bytes=0, buildid=0 (naive flip) — expect Steam to re-verify or flag UpdateRequired.
- **V2:** StateFlags=4, bytes=SizeOnDisk, buildid=current — expect Steam to trust it (the real test).

## How to run (checkpoint — user executes on their Mac)

Precondition: WazHack owned; a fresh macOS depot download available. To isolate the question we must make
Steam *not already know* the install, then let GameLib author the manifest.

1. In the real Steam client, **uninstall WazHack** (so Steam forgets it). Quit Steam.
2. Start GameLib built with `GAMELIB_SPIKE_STATEFLAGS4=1` and install WazHack natively (downloads 100%,
   writes StateFlags=4 with consistent bytes + real buildid). Confirm the download completes.
3. Inspect the written `appmanifest_264160.acf` (we'll capture it here) — StateFlags 4, bytes==SizeOnDisk,
   buildid != 0.
4. Start Steam. **Observe WITHOUT clicking install/verify:**
   - Does WazHack show **Installed** immediately (no "Verifying…", no download bar)?
   - Does Steam kick off ANY re-download or a verify pass? (watch the download/activity)
   - Does **Play** launch the game, and does it actually run (DRM intact)?
5. Capture: a screenshot of Steam's library state, and the final `.acf` StateFlags after Steam has seen it
   (did Steam leave it 4, or rewrite it?).

Safety: the spike script backs up any existing `.acf` first; WazHack is small and re-downloadable, so
uninstall/reinstall is low-cost.

## Investigation Trail

- 2026-07-17 — Design. Confirmed manifest.ts writes StateFlags 1026 + bytes/buildid 0; finalizeToSteam
  measures real SizeOnDisk + has lastOwner but does NOT thread buildid (appinfo.depots.branches.public
  .buildid is available in buildDepotPlan). Hypothesis: buildid=0 + bytes=0 are why a naive 4 would
  re-verify. Awaiting user go-ahead to implement the env-gated throwaway change + run on WazHack.

## Results

PENDING — awaiting real-hardware run.
