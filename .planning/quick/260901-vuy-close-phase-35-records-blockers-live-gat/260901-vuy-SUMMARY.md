---
quick_id: 260901-vuy
slug: close-phase-35-records-blockers-live-gat
status: complete
date: 2026-09-01
commit: 2cef58038
type: records-only
ships_code: false
---

# Quick Task 260901-vuy — Summary

**Phase 35's three records blockers are closed. The phase goal is achieved at 17/17, live-proven
on a genuine release artifact. No code changed and no gesture was performed.**

## G-6-01 — `35-LIVE-GATE.md` written back

The phase's own `blocking: true` gate document recorded criterion 21 against an artifact predating
**two behaviour-changing product commits** (`b5b3464bd`, `bea07cd17`). That is precisely the
`R-34.5-G1-PKG` failure class this gate exists to catch, occurring inside the gate itself. Verified
at HEAD before editing: **0** occurrences of `bea07cd17`, `b5b3464bd`, `total=31`, `22:54`,
`post-clear verification` across 1793 lines.

Added a **POST-FIX ADDENDUM** recording the 2026-08-31 22:52:34–22:54:10 release run:

- **Build identity closed at the RUNNING PROCESS**, not a file on disk — `ps` shows PID 9781
  `/Applications/GameLib.app/…/gamelib-shell` spawning PID 9787 **bundled** `gamelib-sidecar`, not
  `node …/build/main/sidecar.js`. This matters because `F-5-01` established that
  `pnpm tauri:dev:packaged` is `tauri build --debug`, which structurally *never* executes the SEA
  sidecar — so the earlier identity check had interrogated a binary the build guarantees is unused.
- `epicgames.com before(total=31, matched=8, SUPPORTED_NONEMPTY) → after(total=23, matched=0)`
- `post-clear verification — 0 Epic-owned cookie(s) remain across 5 domain(s)` — five **numeric**
  zeroes, five `SUPPORTED_NONEMPTY` verdicts
- Independent index-walking parse (not `strings`, not the orchestrator's `bc.js`): BEFORE 23 /0
  Epic, AFTER 23; **set difference empty in both directions**; 23 + 8 = 31, 31 − 8 = 23
- **`D-35-29-02` RESOLVED** — the two explanations the original record left undistinguished are now
  distinguished. (ii) was right: the logout's own hidden webview loaded Epic's live login page and
  re-seeded the cookies the sweep had just removed.

**Appended, never rewritten.** The 18:15 record stands as measured — the phase's history is
evidence, and overwriting it would destroy the record of what was true that day.

## G-6-02 — the Phase 38 inheritance, ledgered as `38-W06`

`38-VERIFICATION.md` mentioned Epic exactly once, in `38-W03`'s login-window *title* item. Nothing
made a Windows or Linux operator perform an Epic **logout**.

Added `38-W06` as a **new item** (not a note on `38-W04`/`38-W05` — both are smoke-launch items:
download the artifact, see a window, survive 10 seconds; an operator passes both verbatim without
ever signing in). Written in the corrected `blocked_by`-as-cost convention from quick `260901-vm1`,
with a falsifiable `platform_gate` naming the `#[cfg(target_os = "macos")]` attribute.

**I deliberately did not repeat the gap's own claim.** G-6-02 asserted a *guaranteed* user-visible
failure off macOS. That overstates the evidence: `bea07cd17` does make an unreadable jar throw
(`user.ts:571-575`), and `35-22` routes a failed logout to a user-visible dialog — but **whether
the reads reject off macOS is unverified.** macOS opens no window and uses the Rust
default-data-store fallback; that fallback is macOS-only, so Windows and Linux still open a *real*
window, now pointed at `https://gamelib.invalid/`. Whether `cookies_for_domain` succeeds against a
window whose page never resolves has never been observed. `38-W06` asks for the observation and
records either outcome as discharging.

## G-6-03 — REQ-35-07 deconditioned and Complete

`REQUIREMENTS.md:429` and `:1143` both still conditioned REQ-35-07 on `D-35-19-15`'s sibling-apex
seeding. Two independent adjudication passes ruled that is **not a REQ-35-07 clause** — the
requirement's own text asks that the app not report success unless a post-clear read confirms it,
which the release run satisfies. And `b5b3464bd` made the seeding **structurally unreproducible**
by removing the window that was the only thing ever populating those four apexes during a logout,
so leaving it in would make the requirement permanently unclosable for a reason it does not own.

Marked Complete at both sites; `D-35-19-15` preserved as **a residual of its own, still OPEN**.

## Status propagation

`STATE.md` `stopped_at` and `ROADMAP.md:73` both still said `gaps_found` / **NOT YET CLOSED**,
predating six commits. Both now record the closure, and both carry the do-not-read-as-closed list.

`35-VERIFICATION.md`'s three `SIXTH PASS` gap entries marked `resolved` with resolution notes.

## Verification

| Check | Before | After | |
|---|---|---|---|
| `audit-uat` total | 54 | **55** | ✅ |
| phase 38 items | 29 | **30** | ✅ increment proves the array parses |
| phase 35 items | 7 | **7** | ✅ unchanged |
| `35-VERIFICATION.md` `status:` | `human_needed` | **`human_needed`** | ✅ |
| `35-LIVE-GATE.md` `criteria_total` / `blocking` | 21 / true | **21 / true** | ✅ |
| Original 18:15 record | present | **present** | ✅ |
| `src/` or `src-tauri/` files touched | — | **0** | ✅ |
| `stopped_at` quote count | 10 | **10** | ✅ no new quote added |

The phase-38 **increment** is the load-bearing check, not the absolute number: a flat count after
an insert would mean the array stopped parsing and the item was silently dropped — this file's own
recorded silent failure mode.

## Deliberately NOT done

- **`D-35-19-15` NOT reopened and NOT closed.** Still open, still unreproducible by construction.
  The domain-*suffix* half IS exercised (one `epicgames.com` step sweeps `.epicgames.com`,
  `.www.epicgames.com`, `.ecosec.on.epicgames.com`); only the four sibling *apexes* are not.
- **`status:` NOT flipped to `passed`.** Seven human items remain — criterion 14's unobserved UI
  repaint, criterion 10's AppleEvent path, and five others. `passed` would falsely claim them.
- **`status:` NOT flipped to `gaps_found`.** That makes Phase 35 vanish from `audit-uat` entirely,
  taking its genuinely-open items with it.
- **No `Expected` softened anywhere.**

## Two standing records this run falsified (recorded in the addendum)

1. A local release rebuild is **not** blocked by `createUpdaterArtifacts: true` or a missing
   signing key. Two STATE.md records claimed it was; `src-tauri/` is git-clean, the flag is still
   `true`, and a full release build completed on 2026-08-31.
2. `STATE.md`'s YAML error is **`All collection items must start at the same column`**, not the
   recorded "unescaped quote" hypothesis, which was never proven.
