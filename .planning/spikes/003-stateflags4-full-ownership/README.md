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
  re-verify.
- 2026-07-17 — Built env-gated change (commit 816a76c9): StateFlags=4 + bytes=SizeOnDisk + real buildid
  under `GAMELIB_SPIKE_STATEFLAGS4=1`. Default off = byte-identical to 1026 (72/72 tests, tsc clean).
- 2026-07-17 — **RUN 1 (real HW, WazHack):** GameLib wrote StateFlags=4; user reinstalled + started Steam.
  **RESULT: Steam TRUSTED the manifest — StateFlags stayed 4, no verify pass, no re-download.** The core
  question is answered YES: a byte-perfect GameLib install with a complete field set (bytes + current
  buildid) is accepted by Steam as FullyInstalled. BUT launch failed with macOS **`os error 256`**.
- 2026-07-17 — **Root-caused the launch failure (not a wrong build):** `EDepotFileFlag.Executable = 32`
  (and `CustomExecutable = 128`). The depot writer (`downloadDepotFiles`/`downloadSingleFile`) handled
  Directory (64) + Symlink (512) but had **NO chmod/mode handling** — it never applied the executable
  bit. Under the 1026 handoff, **Steam's verify pass sets +x** (which is why WazHack launched in UAT test
  1b — that success secretly depended on Steam's verify). StateFlags=4 skips verify, so the game binary
  lands non-executable → `os error 256`. **sha1 guarantees CONTENT, not filesystem mode** — the exact
  class of gap spike 001's "1026 is a safety net" requirement was protecting against.
- 2026-07-17 — Fix (still spike scope, commit pending): apply `chmod 0o755` after the whole-file sha1
  check when `flags & (Executable|CustomExecutable)`. Required for full ownership regardless of the spike
  flag; harmless under 1026 (Steam would set the same bit). 58/58 depot tests + tsc clean. Awaiting RUN 2.

## Results

**PARTIAL → re-testing.** The make-or-break question is **VALIDATED: Steam trusts a GameLib-authored
`StateFlags 4`** (stayed 4, no verify, no re-download) given a complete field set (StateFlags 4 + bytes ==
SizeOnDisk + current public buildid). Full ownership is *feasible*.

**Caveat that makes it PARTIAL until RUN 2:** "byte-perfect content" ≠ "launch-ready install". Because
StateFlags=4 skips Steam's verify pass, GameLib must itself apply everything that pass does beyond bytes —
starting with the **executable bit** (fixed here). Likely also relevant for Phase 22: ReadOnly (8) /
Hidden (16) flags, and confirming no other verify-pass side effects (e.g. Steam-created config) are load-
bearing for launch. RUN 2 (WazHack, exec-bit fix) will confirm the game launches under StateFlags=4.

**Requirement emerging for Phase 22:** the depot downloader must replicate Steam's verify-pass filesystem
metadata — at minimum apply EDepotFileFlag file modes (executable), since nothing downstream will.
