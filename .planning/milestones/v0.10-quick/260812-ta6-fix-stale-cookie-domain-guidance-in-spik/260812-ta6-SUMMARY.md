---
quick_id: 260812-ta6
status: complete
date: 2026-08-12
finding_id: F-34.4.2-23
commit: 3e2e92bab
files_modified:
  - .claude/skills/spike-findings-gamelib/references/tauri-login-webview-cookies.md
  - .claude/skills/spike-findings-gamelib/SKILL.md
  - .claude/skills/spike-findings-gamelib/sources/014a-cookie-read-rust-webview-api/README.md
one_liner: "Corrected the falsified dot-less cookie-domain premise in the spike-findings skill and replaced its recommended comparator -- which was the exact shape that shipped as production defect F-34.4.2-19 -- with the shipped `cookie_domain_matches`, pinned against re-simplification; traced the error to a localhost-only measurement generalised to registrable domains, and recorded one exposed measurement discrepancy as open rather than inventing a reconciliation."
---

# Quick Task 260812-ta6 — Summary

Closed **F-34.4.2-23**: the `spike-findings-gamelib` skill carried a falsified live measurement
and, worse, prescribed the exact comparator shape that became production defect F-34.4.2-19. The
skill auto-loads on all Tauri / login / auth work, so it was actively handing the bug forward.

## What was wrong

**The premise.** The reference asserted `_simpleauth_sess` is stored with
`domain='humblebundle.com'` because "WebKit normalises away the leading dot". The real,
live-measured domain is **`.humblebundle.com`** — leading dot present.

**The prescription.** Under "Do this instead:", the file recommended:

```rust
Some(d) => host == d || host.ends_with(&format!(".{d}")),   // proper suffix match
```

`format!(".{d}")` on an already-dotted `d` demands a `"..humblebundle.com"` suffix no hostname can
contain, so the comparator matches *nothing* with a leading-dot domain — for any host. That shipped
as `cookie_domain_matches` and broke Humble login silently: the poll ticked forever, `total` stayed
healthy every tick, `classifyCookieRead` always returned `SUPPORTED_NONEMPTY`, and zero log lines
were emitted on a genuinely authenticated session.

## Changes

| File | Change |
|---|---|
| `references/tauri-login-webview-cookies.md` | Domain claim corrected with a dated CORRECTION block citing F-34.4.2-19 / the debug file / commit `0dfd08044`. Comparator replaced with the shipped `cookie_domain_matches` (`main.rs:975-994`) plus an inline MANDATORY comment. Added a ⛔ block quoting the defective shape, explaining why it fails and what it cost, so a future reader does not "simplify" the strip away. Requirement 1 now carries the constraint. |
| `SKILL.md` | The phrase "Use `cookies()` + your own suffix match" is what produced the naive shape. It now names the leading-dot strip and the finding ID. |
| `sources/014a/README.md` | Forward-pointer only; measurements untouched. |

## Findings

**The error's origin was traced, and it is more instructive than the fix.** Finding 4 of the 014a
spike measured `Domain=localhost` coming back as `domain='localhost'`, not `.localhost`, and
concluded "WebKit normalises the dot away." That is **true for `localhost`** — a single-label host
genuinely receives a host-only, dot-less cookie. The defect was **generalising a single-label-host
observation to registrable domains**, where it is false. One correct measurement, one unmarked
inferential leap, and the leap is what shipped. This is a close cousin of
`[[grep-assertion-must-fail-against-known-bad-input]]`: the generalisation was never tested against
a case that could refute it.

**An unreconciled discrepancy was surfaced, not papered over.** The corrected domain makes the July
table's third row hard to explain: `cookies_for_url("https://humblebundle.com")` returned
`_simpleauth_sess` under wry's documented plain `==`, which a `.humblebundle.com` domain should
have excluded just as it excluded the `www.` read. Something in that chain — wry's `url.domain()`,
WebKit's per-call domain rendering, or the July reading itself — is not what we think. **No
explanation was invented.** It is recorded as an open item with instructions to re-measure both
URLs while dumping the raw `cookie.domain()` string in the same breath.

**Two leak points beyond the planned scope were found by sweeping.** `SKILL.md` (always loaded,
higher exposure than the reference) and the 014a source README both carried the premise. Both were
handled; the source README was annotated rather than rewritten, matching the treatment the user
already directed for `34.4.1-SPIKE-016-FINDINGS.md`.

## Deviations

- **Plan Task 1's verify was written as `grep -n "WebKit normalises away" → no match`.** The phrase
  does still appear — once, inside the CORRECTION block, quoted and explicitly labelled FALSIFIED.
  Quoting the wrong claim in order to refute it is better documentation than deleting it, so the
  intent is met and the literal check is not. Recorded rather than silently reinterpreted.
- **Scope widened by two files** (`SKILL.md`, `sources/014a/README.md`), both discovered by a
  post-edit sweep for the same premise. The plan named only the reference file.

## Not done / carried forward

- `.planning/phases/34.4.1-*/34.4.1-SPIKE-016-FINDINGS.md` is **untouched by design** — the user's
  standing "recorded only, NOT edited" instruction. It still encodes the same July premise and is
  still listed under F-34.4.2-23 in the phase's `deferred-items.md`.
- `cookie_domain_matches`'s doc comment in `main.rs` cites this skill reference as justification for
  the pre-fix design. The comment was already rewritten by commit `0dfd08044`; no action needed, but
  the citation direction is worth knowing — source cited docs, docs were wrong.
- The open `cookies_for_url` discrepancy needs a live re-measurement. Not scheduled.
