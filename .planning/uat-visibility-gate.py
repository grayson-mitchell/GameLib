#!/usr/bin/env python3
"""UAT item VISIBILITY census gate (quick task 260912-csq).

Purpose, in one sentence: 59 UAT items across 12 files are INVISIBLE to `gsd-sdk query
audit-uat` -- its item parser cannot see them at all -- and until this gate existed, nothing
anywhere reported that. `audit-uat` printed a confident, well-formed audit over the items it
could see and said nothing whatsoever about the ones it could not. Ten green planning gates were
blind to it. This gate makes that suppression LOUD.

WHAT THIS GATE IS NOT. It does not fix the suppression, and it must never be made to. The 59
items stay hidden; this file is the census that keeps them countable, and a ratchet that makes
the count only ever go down.

THE PREDICATE IS VISIBILITY, AND IT IS DELIBERATELY MECHANISM-INDEPENDENT. The question asked of
every item is only: *can `parseUatItems`' regex engage with this text at all.* It is NOT "does
this item have a body `expected:` block scalar". A block scalar is the one mechanism anybody has
actually identified, and it explains only part of the population -- WHAT SUPPRESSES THE REST IS
UNESTABLISHED. A gate that grepped for the known mechanism would report green over every item
hidden by a mechanism nobody has found yet, which is the failure mode this gate exists to close.

---------------------------------------------------------------------------------------------
WHEN THIS GATE FAILS, THERE ARE EXACTLY TWO CORRECT RESPONSES
---------------------------------------------------------------------------------------------

  1. An item became invisible (or a new invisible item was added) -> FIX THE ITEM so `audit-uat`
     can see it: `### N. Name`, then `expected: <single line>`, then `result: <word>` on the very
     next line.
  2. An item was made visible, so a file's count DROPPED -> TIGHTEN the ledger to the new,
     smaller number. That is the ratchet working.

IT IS NEVER CORRECT TO WIDEN THE LEDGER to make a real failure go away. A census that grows to
fit whatever it finds is not a census.

IT IS NEVER CORRECT TO "FIX" THIS GATE BY FLATTENING A BODY `expected:` BLOCK SCALAR. Quick task
260912-9v7 measured exactly that sweep and DECLINED it: `uat render-checkpoint` handles those
block scalars CORRECTLY today (`uat.js:81-82`), so flattening them regresses a working behaviour
in order to satisfy a different reader. Editing the documents this gate measures is the cheapest
way to make it green and the single worst thing to do.

---------------------------------------------------------------------------------------------
THE VERIFICATION EXCLUSION IS A MEASURED DECISION, NOT AN OVERSIGHT -- DO NOT WIDEN IT BACK
---------------------------------------------------------------------------------------------

This is the most important section for a future reader. The corpus is `*UAT*.md` under
`.planning/` EXCLUDING any path containing `VERIFICATION` (35 files). An earlier draft used the
full 98-file corpus including VERIFICATION files. That draft was WRONG, and re-widening it would
reintroduce 55 false ledger entries. Three pieces of evidence:

  (i)   `parseUatItems` NEVER RUNS ON VERIFICATION FILES. `auditUat` calls it only for files whose
        name contains `-UAT` (`uat.js:286-288`). VERIFICATION files are routed to a DIFFERENT
        reader, `parseVerificationItems` (`uat.js:302-307`), which runs only when frontmatter
        `status` is `human_needed` or `gaps_found`, reads the frontmatter `human_verification:`
        array first (`uat.js:183`), and otherwise scrapes a `## Human Verification` body section
        for table / numbered / bullet lines (`uat.js:231-261`). The
        `### N.` / `expected:` / `result:` shape is simply NOT THEIR INTERFACE, so counting those
        headings through `parseUatItems` measures nothing about them.

  (ii)  FOUR VERIFICATION FILES ARE EMITTED BY `audit-uat` WITH ITEMS TODAY, and the old corpus
        booked their headings as "invisible" -- a FALSE FACT about files the tool visibly
        surfaces (measured 2026-09-12):

            32-VERIFICATION.md   emits 2 items   old ledger claimed  2 invisible
            33-VERIFICATION.md   emits 3 items   old ledger claimed  3 invisible
            34-VERIFICATION.md   emits 2 items   old ledger claimed  2 invisible
            35-VERIFICATION.md   emits 7 items   old ledger claimed 10 invisible
                                                 --------------------------------
                                                 17 items booked as hidden in four
                                                 files the tool visibly surfaces

        A ledger that calls itself a census of what is hidden cannot carry 17 entries of a
        category error. A gate that convicts correct files gets deleted rather than fixed.

  (iii) THE NARROWING COSTS NO SIGNAL. VERIFICATION files contribute ZERO visible items under
        this pattern, so the 84 visible items in this 35-file corpus are the SAME 84 as in the
        full 98-file corpus. Measured both ways: 84 == 84. Removing them removed only noise.

And, unlike the VERIFICATION set, NONE of the 12 files in the ledger below is emitted by
`audit-uat` at all -- so no entry here contradicts observable tool output.

---------------------------------------------------------------------------------------------
KNOWN UNMEASURED GAP -- AN OPEN QUESTION FOR THE OPERATOR, NOT WORK TO SCHEDULE
---------------------------------------------------------------------------------------------

VERIFICATION-file item visibility is now EXPLICITLY UNMEASURED: 55 `### N. ` headings across 16
VERIFICATION files whose reachability nobody has established. They may be reachable via
`parseVerificationItems`' frontmatter array, or via its body scrape, or not reachable at all.
This gate does not find out and does not claim to.

NO TODO IS FILED FOR THIS AND NO WORK IS PLANNED. It is recorded here, and in that task's
SUMMARY, as an open question for the operator to decide. Stating it as a known gap is the honest
position; silently dropping 16 files would not be, and ledgering them with false numbers would be
worse than either.

---------------------------------------------------------------------------------------------
THE OTHER HONEST LIMITS
---------------------------------------------------------------------------------------------

SDK PIN. The `visible` pattern below is transcribed VERBATIM from `gsd-sdk` **v1.42.3**,
`sdk/dist/query/uat.js:150`, resolved at
`~/.npm/_npx/4db0de1f85c3165e/node_modules/get-shit-done-cc`, and cross-checked against the LIVE
tool on 2026-09-12: on the one file where comparison is possible (`27-UAT.md`) the
re-implementation and the real `audit-uat` agree exactly, on both the item count (2) and the set
of test numbers ({4, 5}). UPSTREAM DRIFT WILL SILENTLY INVALIDATE THIS GATE -- if `parseUatItems`
changes, this pattern keeps measuring the old shape and keeps reporting a cheerful green. The
pin is stated so that a future reader can re-run the comparison rather than trust it.

The SDK is deliberately NOT `require()`d and NOT vendored. Its npx content-hash path is absent in
CI, so depending on it would make this gate fail-open (silently skip) or fail-spuriously (break
on a cache eviction); a vendored copy would drift into asserting agreement with a fiction. This
is the same reasoning `planning-frontmatter-gate.py` records for its own parser choice.

CORPUS ASYMMETRY. `auditUat` reads `paths.phases` ONLY, under a current-milestone phase filter
(`state.js:34-52`). This corpus is wider: it includes `.planning/quick/`, so
`260905-d33-UAT.md` below is a file the tool would NEVER open even if it were perfectly
well-formed. It is ledgered anyway, because the question this gate asks is about the documents,
not about which of them today's milestone happens to admit.

ENGAGEMENT, NOT EMISSION. `parseUatItems` additionally DISCARDS every item whose `result` is not
`pending`, `skipped` or `blocked` (`uat.js:154`). That filter is deliberately NOT part of this
gate's predicate: an item the regex matches is VISIBLE here even when the tool later drops it for
its `result:` value. The `result:` vocabulary question is out of scope -- 50 of the 77
out-of-vocabulary results on visible items are `pass`, which `audit-uat` is CORRECT to omit
because it audits open items, not passes -- and closing the remaining 22 needs a vocabulary
decision the operator has not made.

NO FENCE PARSING. This is a text predicate, not a markdown parser. A well-formed item quoted
inside a fenced code block counts as both a candidate AND visible. That is harmless (the two move
together, so it creates no ledger entry) and is covered by an accept-side self-test case.

Run `python3 uat-visibility-gate.py` (no arguments) for CI mode: self-test first, then walk the
live tree, write nothing. This IS the path `meta/runPlanningGates.py` invokes -- discovery is by
`-gate.py` suffix with no arguments, so the no-argument path has to be the real check. Run
`python3 uat-visibility-gate.py --self-test` to run only the self-test. There is no `--write`
flag: this gate produces no committed artifact to regenerate.
"""

from __future__ import annotations

import contextlib
import io
import re
import sys
import tempfile
from pathlib import Path

# Resolved from __file__, NEVER from cwd: `meta/runPlanningGates.py` runs each gate with the
# gate's own directory as cwd, but a human runs it from the repo root. __file__ is correct under
# both. Asserted explicitly so that repointing this gate is a deliberate, visible edit.
PLANNING_DIR = Path(__file__).resolve().parent
assert PLANNING_DIR.name == ".planning", (
    "PLANNING_DIR must resolve to exactly the repo's .planning/ directory -- repointing this "
    "gate elsewhere must be a deliberate, visible edit, not a typo"
)

# VERBATIM from get-shit-done-cc v1.42.3, sdk/dist/query/uat.js:150 (JS `/.../g` -> finditer).
# The trailing optional group is part of the real pattern; it is optional, so match/no-match is
# identical with or without it -- confirmed by counting both ways over the whole corpus during
# authoring, not assumed.
VISIBLE_PATTERN = re.compile(
    r"###\s*(\d+)\.\s*([^\n]+)\nexpected:\s*([^\n]+)\nresult:\s*(\w+)"
    r"(?:\n(?:reported|reason|blocked_by):\s*[^\n]*)?"
)

# An ITEM HEADING. Anchored at column 0, with whitespace REQUIRED after the dot.
#
# Three detectors were measured over this corpus during authoring -- unanchored `###\s*\d+\.`
# (the closest mirror of the tool's own unanchored regex), anchored zero-width `^###\s*\d+\.`,
# and this one -- and ALL THREE AGREE EXACTLY: 143 candidates, 59 invisible, 12 files, with ZERO
# divergent headings. Every heading that separated them (four-hash sub-headings like
# `#### 1. QR Code Login`, and decimal section headings like `### 34.13 Decisions Explicitly
# Checked for Regression`) lived in a VERIFICATION file, which this corpus excludes. The choice
# is therefore DEFENSIVE, not load-bearing -- and the two accept-side self-test cases for those
# shapes exist to keep it that way, so that one arriving in a UAT file tomorrow cannot silently
# manufacture a false ledger entry.
CANDIDATE_PATTERN = re.compile(r"^###\s*\d+\.\s", re.MULTILINE)

FENCE = "---"

# ---------------------------------------------------------------------------
# THE LEDGER IS SIMULTANEOUSLY THE CENSUS.
#
# Measured 2026-09-12 at HEAD 30e68e6fe (the authoring plan's baseline was 39e1e62bb; NO
# UAT-type file changed between the two, so the figures are identical at both).
#
# Corpus: every `*UAT*.md` under `.planning/` whose path does NOT contain `VERIFICATION`
# (35 files) -- see the VERIFICATION EXCLUSION section of the module docstring before touching
# that definition. Of 143 candidate item headings, 84 are VISIBLE to `parseUatItems` and 59 are
# not. Those 59 are below, sorted, repo-relative.
#
# Suppression is currently ALL-OR-NOTHING PER FILE: every one of these 12 files has ZERO visible
# items, and every other file in the corpus has zero invisible ones (partial-suppression count
# measured as 0). The gate nevertheless handles the partial case per-file, because a single edit
# to any one of these files creates it.
#
# GENERATED from the census, never retyped. Transcription error is the named failure mode here:
# a hand-copied ledger is a false census that still reports green.
# ---------------------------------------------------------------------------

LEDGER: dict[str, int] = {
    ".planning/phases/05-branding-about-polish/05-HUMAN-UAT.md": 3,
    ".planning/phases/06-library-game-status-ux/06-HUMAN-UAT.md": 4,
    ".planning/phases/13-keys-waiting-giftable-spares-views/13-HUMAN-UAT.md": 1,
    ".planning/phases/23.2-steam-depot-selection-required-vs-optional-depots-and-skip-a/23.2-HUMAN-UAT.md": 3,
    ".planning/phases/26-steam-key-redemption/26-HUMAN-UAT.md": 5,
    ".planning/phases/28-tauri-keyring-real-safestorage-via-the-keyring-crate/28-HUMAN-UAT.md": 1,
    ".planning/phases/32-tauri-ipc-re-plumb-slice-3-downloads-and-queue/32-HUMAN-UAT.md": 2,
    ".planning/phases/34.3-tauri-ipc-re-plumb-slice-6-shell-files-logs-and-diagnostics/34.3-HUMAN-UAT.md": 5,
    ".planning/phases/34.3-tauri-ipc-re-plumb-slice-6-shell-files-logs-and-diagnostics/34.3-UAT.md": 5,
    ".planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-UAT.md": 22,
    ".planning/phases/34.6-tauri-ipc-re-plumb-slice-9-eos-overlay-steamgriddb-artwork-w/34.6-UAT.md": 5,
    ".planning/quick/260905-d33-convert-about-to-an-in-app-animated-moda/260905-d33-UAT.md": 3,
}

LEDGER_TOTAL = 59
LEDGER_FILES = 12

assert sum(LEDGER.values()) == LEDGER_TOTAL, (
    f"LEDGER sums to {sum(LEDGER.values())} but LEDGER_TOTAL says {LEDGER_TOTAL} -- the census "
    "and its total have drifted apart; regenerate, do not hand-edit either"
)
assert len(LEDGER) == LEDGER_FILES, (
    f"LEDGER holds {len(LEDGER)} files but LEDGER_FILES says {LEDGER_FILES} -- regenerate, do "
    "not hand-edit either"
)
assert all(v > 0 for v in LEDGER.values()), (
    "a LEDGER entry with a count of 0 is not a census entry -- delete the entry instead"
)
# The mechanical form of the VERIFICATION exclusion: if a VERIFICATION path ever appears here,
# the corpus was widened back and 55 false entries came with it. See the docstring.
assert not [k for k in LEDGER if "VERIFICATION" in k.upper()], (
    "a VERIFICATION file is in the LEDGER -- the corpus was widened back. `parseUatItems` never "
    "runs on those files, and four of them are emitted by audit-uat WITH ITEMS today, so their "
    "`### N.` headings are NOT invisible items. See the docstring."
)


# ---------------------------------------------------------------------------
# Pure predicate. Used by BOTH the live walk and every self-test case -- never reimplemented in
# the test, because a test that reimplements the predicate tests the reimplementation.
# ---------------------------------------------------------------------------


def strip_frontmatter(text: str) -> str:
    """Return the BODY: everything after the frontmatter block, or the whole text if there is no
    well-formed block. Pure: no I/O. A `---` later in the body is a markdown horizontal rule and
    must NOT re-open the block."""
    lines = text.split("\n")
    if not lines or lines[0].strip() != FENCE:
        return text
    for i, line in enumerate(lines[1:], start=1):
        if line.strip() == FENCE:
            return "\n".join(lines[i + 1 :])
    return text  # opening fence, never closed -> not a frontmatter block


def count_items(text: str) -> tuple[int, int]:
    """Given one document's RAW text, return (candidates, visible).

    BODY-ONLY PARSING IS LOAD-BEARING, NOT A NICETY. These documents are prose ABOUT UAT items
    and their frontmatter routinely carries item-shaped lines; counting the whole file would
    convict correct documents on their own explanatory text. A gate that convicts correct files
    gets deleted rather than fixed."""
    body = strip_frontmatter(text)
    return len(CANDIDATE_PATTERN.findall(body)), len(VISIBLE_PATTERN.findall(body))


def is_uat_type(path: Path) -> bool:
    """Corpus membership. Basename contains `UAT`; path contains no `VERIFICATION`
    (case-insensitive).

    The VERIFICATION exclusion is belt-and-braces -- `VERIFICATION` does not contain the
    substring `UAT`, so it excluded 0 paths when measured -- and it is kept anyway, against a
    directory name or a compound filename like `36-UAT-VERIFICATION.md`. It is asserted here
    EXPLICITLY rather than left implicit in the glob, so that widening it is a deliberate,
    visible act. See the docstring for why it must not be widened."""
    return "UAT" in path.name and "VERIFICATION" not in str(path).upper()


def discover(planning_dir: Path) -> list[Path]:
    return sorted(p for p in planning_dir.rglob("*.md") if is_uat_type(p))


def fail(message: str) -> None:
    print(f"GATE FAILED: {message}", file=sys.stderr)
    sys.exit(1)


def scan(planning_dir: Path, ledger: dict[str, int]) -> None:
    """CI-mode walk. Collects findings across ALL files and fails once with the complete list --
    the walk never stops at the first finding, because fixing a 12-file corpus one CI run at a
    time is how it never gets fixed.

    `ledger` is a parameter rather than a direct read of the module constant so that every one of
    the four ratchet directions can be exercised by the self-test through THIS function."""
    paths = discover(planning_dir)

    # Anti-vacuity, half one: a corpus that globs to nothing means the tree moved and this gate
    # is silently checking nothing.
    if not paths:
        fail(
            f"discovered ZERO UAT-type files under {planning_dir} -- the tree moved, or the "
            "corpus predicate stopped matching. A gate that finds nothing must fail, not pass."
        )

    measured: dict[str, int] = {}
    total_visible = 0
    total_candidates = 0
    for path in paths:
        key = path.relative_to(planning_dir.parent).as_posix()
        candidates, visible = count_items(path.read_text(encoding="utf-8"))
        if visible > candidates:
            # Never a silent clamp: this means the two patterns have diverged and the arithmetic
            # below is meaningless.
            fail(
                f"{key}: {visible} visible items but only {candidates} candidate headings -- the "
                "candidate and visible patterns have diverged; the census arithmetic is invalid"
            )
        total_visible += visible
        total_candidates += candidates
        measured[key] = candidates - visible

    # Anti-vacuity, half two: zero visible items corpus-wide means the regex stopped engaging
    # entirely -- an upstream-drift tripwire. It is NOT a green.
    if total_visible == 0:
        fail(
            f"ZERO visible items across {len(paths)} UAT-type file(s) -- `parseUatItems`' "
            "pattern has stopped engaging with these documents entirely. That is upstream drift "
            "or a corpus change, not a pass. See the SDK PIN note in this gate's docstring."
        )

    findings: list[str] = []

    # Direction 1: a ledgered file REGRESSED (more invisible items than the census recorded).
    # Direction 3: a ledgered file IMPROVED -- the ratchet must be tightened. A ratchet that only
    # catches regressions rots upward-stale and silently stops measuring.
    for key, expected in sorted(ledger.items()):
        if key not in measured:
            # Direction 4: a ledger entry whose file is GONE. A ledger that names files that no
            # longer exist is not a census.
            findings.append(
                f"STALE LEDGER ENTRY: {key} is in the ledger ({expected} invisible item(s)) but "
                "is no longer in the corpus -- remove the entry (or restore the file)"
            )
            continue
        actual = measured[key]
        if actual > expected:
            findings.append(
                f"REGRESSION: {key} now has {actual} invisible item(s), ledger says {expected} "
                f"(+{actual - expected}) -- FIX THE NEW ITEM(S) so audit-uat can see them; do "
                "NOT widen the ledger"
            )
        elif actual < expected:
            findings.append(
                f"LEDGER IS STALE (improvement): {key} now has {actual} invisible item(s), "
                f"ledger still says {expected} -- TIGHTEN the ledger to {actual}"
                + (" and remove the entry entirely" if actual == 0 else "")
            )

    # Direction 2: a file ABSENT from the ledger with ANY invisible item -- a new offender.
    for key in sorted(measured):
        if measured[key] and key not in ledger:
            findings.append(
                f"NEW OFFENDER: {key} has {measured[key]} invisible item(s) and is not in the "
                "ledger -- FIX THE ITEM(S) so audit-uat can see them; do NOT add the file to the "
                "ledger"
            )

    if findings:
        detail = "\n  ".join(findings)
        fail(
            f"{len(findings)} UAT visibility finding(s) across {len(paths)} UAT-type file(s):\n"
            f"  {detail}\n\n"
            "An item is VISIBLE when it reads:\n"
            "    ### N. Name\n"
            "    expected: <a SINGLE line>\n"
            "    result: <word>\n"
            "with `result:` on the line IMMEDIATELY after `expected:`.\n\n"
            "THE TWO CORRECT RESPONSES ARE: fix the item so audit-uat can see it, or TIGHTEN the\n"
            "ledger when an item has been made visible. NEVER widen the ledger to make a failure\n"
            "go away, and NEVER flatten a body `expected:` block scalar to do it -- quick task\n"
            "260912-9v7 measured and DECLINED that sweep, because `uat render-checkpoint`\n"
            "handles those blocks correctly today (uat.js:81-82). See this gate's docstring."
        )

    print(
        f"OK: {len(paths)} UAT-type file(s), {total_candidates} candidate item heading(s), "
        f"{total_visible} visible to audit-uat, {sum(measured.values())} invisible across "
        f"{len([k for k, v in measured.items() if v])} file(s) -- exactly matching the ledger."
    )


# ---------------------------------------------------------------------------
# Self-test. Every case is discharged through count_items / discover / scan -- the SAME functions
# used against the real tree, never a reimplementation.
# ---------------------------------------------------------------------------

VALID_UAT_DOC = (
    "---\n"
    "status: partial\n"
    "phase: 99\n"
    "---\n"
    "\n"
    "# Phase 99 UAT\n"
    "\n"
    "### 1. A perfectly ordinary visible item\n"
    "expected: the window opens and the list renders real rows\n"
    "result: pending\n"
    "reason: not yet run\n"
    "\n"
    "### 2. A second visible item, whose result the tool would DROP\n"
    "expected: the second thing happens\n"
    "result: pass\n"
)


def mutate(base: str, old: str, new: str, why: str) -> str:
    """Route EVERY mutation of VALID_UAT_DOC through here. If the document's shape changes and an
    anchor is left stale, `str.replace()` silently no-ops and hands a REJECT case an UNMUTATED,
    still-valid document -- a real check quietly turned vacuous. Fails loudly in both failure
    modes (anchor missed; replacement produced no change). Modelled on
    `planning-frontmatter-gate.py:404`."""
    if old not in base:
        fail(
            f"mutate() anchor missed ({why}): {old!r} was not found in the base document -- this "
            "would silently hand a REJECT case an UNMUTATED, still-valid document instead of the "
            "intended mutation"
        )
    result = base.replace(old, new, 1)
    if result == base:
        fail(f"mutate() produced no change ({why}) -- `old` and `new` were identical")
    return result


def _expect_counts(label: str, text: str, candidates: int, visible: int) -> None:
    got = count_items(text)
    if got != (candidates, visible):
        fail(
            f"self-test FAILED: {label} -- expected (candidates, visible) == "
            f"{(candidates, visible)}, got {got}"
        )


def _reject_doc(label: str, text: str, candidates: int, visible: int) -> None:
    """A REJECT case: the document must yield at least one INVISIBLE item."""
    _expect_counts(label, text, candidates, visible)
    if candidates - visible <= 0:
        fail(f"self-test FAILED: {label} produced no invisible item -- the case is vacuous")
    print(f"  self-test OK: {label} correctly counted as invisible ({candidates - visible})")


def _accept_doc(label: str, text: str, candidates: int, visible: int) -> None:
    """An ACCEPT case: the document must yield NO invisible items. These matter most -- a gate
    that convicts a correct document gets deleted rather than fixed."""
    _expect_counts(label, text, candidates, visible)
    if candidates - visible != 0:
        fail(
            f"self-test FAILED: {label} was WRONGLY counted as carrying "
            f"{candidates - visible} invisible item(s) -- the gate convicts correct input"
        )
    print(f"  self-test OK: {label} correctly left alone")


def _write_corpus(root: Path, files: dict[str, str]) -> None:
    for rel, text in files.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")


def _expect_scan_fails(label: str, root: Path, ledger: dict[str, int], needle: str) -> None:
    """Exercise the REAL scan() against a real temp corpus and require it to exit non-zero with
    the expected reason. Its `GATE FAILED:` output is CAPTURED, not printed: a literal
    `GATE FAILED:` line emitted during a PASSING run is a misleading-output defect in its own
    right -- the next reader greps the log, sees it, and believes the gate is red when it is
    green. Both reference gates do exactly this. The captured text is asserted non-empty, so
    suppressing it cannot hollow out the check."""
    captured = io.StringIO()
    try:
        with contextlib.redirect_stderr(captured), contextlib.redirect_stdout(io.StringIO()):
            scan(root, ledger)
    except SystemExit:
        text = captured.getvalue()
        if needle not in text:
            fail(
                f"self-test FAILED: {label} exited non-zero but not for the expected reason "
                f"(looking for {needle!r}) -- got {text!r}"
            )
        print(f"  self-test OK: {label} correctly failed the scan")
    else:
        fail(f"self-test FAILED: {label} was reported GREEN -- the check is vacuous")


def _expect_scan_passes(label: str, root: Path, ledger: dict[str, int]) -> None:
    captured_err = io.StringIO()
    try:
        with contextlib.redirect_stderr(captured_err), contextlib.redirect_stdout(io.StringIO()):
            scan(root, ledger)
    except SystemExit:
        fail(
            f"self-test FAILED: {label} was WRONGLY failed by the scan ({captured_err.getvalue()!r})"
        )
    print(f"  self-test OK: {label} correctly passed the scan")


def self_test() -> None:
    case_count = 0

    # Sanity: the base document must be clean before we mutate it into bad input. Without this,
    # every "correctly counted as invisible" below could be firing for an unrelated reason.
    _expect_counts("sanity (base valid document)", VALID_UAT_DOC, 2, 2)
    print("  self-test base document: 2 candidates, 2 visible (sanity check OK)")

    # --- REJECT side: the shapes that hide an item from audit-uat ---------------------------

    case_count += 1
    _reject_doc(
        "item whose `expected:` is a BLOCK SCALAR (the one known mechanism)",
        mutate(
            VALID_UAT_DOC,
            "expected: the window opens and the list renders real rows\n",
            "expected: |\n  the window opens and the list\n  renders real rows\n",
            "block-scalar expected",
        ),
        2,
        1,
    )

    case_count += 1
    _reject_doc(
        "item whose `result:` is not on the line immediately after `expected:`",
        mutate(
            VALID_UAT_DOC,
            "expected: the second thing happens\nresult: pass\n",
            "expected: the second thing happens\nnotes: an interposed line\nresult: pass\n",
            "interposed line before result",
        ),
        2,
        1,
    )

    case_count += 1
    _reject_doc(
        "a `### N.` heading with no `expected:` line at all",
        VALID_UAT_DOC + "\n### 3. A heading with no expected line\n\nJust prose about it.\n",
        3,
        2,
    )

    # --- ACCEPT side: the cases that must NOT be convicted. These matter most. ----------------

    case_count += 1
    _accept_doc(
        "a legitimately visible item (the positive control for every reject above)",
        VALID_UAT_DOC,
        2,
        2,
    )

    case_count += 1
    _accept_doc(
        "body PROSE containing the words `expected:` and `result:`",
        VALID_UAT_DOC
        + "\n## Notes\n\nThe expected: and result: keys must sit on adjacent lines; when the\n"
        "expected: value runs to several lines the result: key is no longer adjacent.\n",
        2,
        2,
    )

    case_count += 1
    _accept_doc(
        "a FENCED CODE BLOCK quoting the item shape as documentation",
        VALID_UAT_DOC
        + "\n## The shape audit-uat can read\n\n```markdown\n"
        "### 7. An example item, quoted as documentation\n"
        "expected: a single line\nresult: pending\n```\n",
        3,
        3,
    )

    case_count += 1
    _accept_doc(
        "a `#### 1. Some sub-heading` four-hash heading (NOT an item)",
        VALID_UAT_DOC + "\n#### 1. QR Code Login\n\nA sub-heading, not an item.\n",
        2,
        2,
    )

    case_count += 1
    _accept_doc(
        "a `### 34.13 Decisions Explicitly Checked for Regression` section heading (NOT an item)",
        VALID_UAT_DOC
        + "\n### 34.13 Decisions Explicitly Checked for Regression\n\nA section, not an item.\n",
        2,
        2,
    )

    case_count += 1
    _accept_doc(
        "an item-shaped block inside the FRONTMATTER (body-only parsing is load-bearing)",
        mutate(
            VALID_UAT_DOC,
            "status: partial\n",
            "status: partial\nsummary: |\n  ### 9. An item shape quoted in frontmatter\n"
            "  expected: this must not be counted\n  result: pending\n",
            "item shape inside frontmatter",
        ),
        2,
        2,
    )

    case_count += 1
    _accept_doc(
        "a file whose `### N.` items are ALL visible (zero invisible, absent from the ledger)",
        VALID_UAT_DOC,
        2,
        2,
    )

    # --- SCAN-LEVEL cases: discovery, anti-vacuity, and all four ratchet directions ----------

    invisible_doc = mutate(
        VALID_UAT_DOC,
        "expected: the window opens and the list renders real rows\nresult: pending\n",
        "expected: |\n  a block scalar, so this item is invisible\nresult: pending\n",
        "corpus fixture: one invisible item",
    )
    # A document whose ONLY item is invisible -- zero visible items in it at all.
    all_invisible_doc = (
        "---\nstatus: partial\n---\n\n"
        "### 1. The only item, and it is invisible\n"
        "expected: |\n  a block scalar\nresult: pending\n"
    )
    # TWO invisible items, so direction 1 can be exercised with a ledger entry that is genuinely
    # too SMALL (1 < 2). Ledgering a 1-invisible file at 0 would not do: a 0-valued entry is
    # forbidden at import, and the case must fire for the reason it claims.
    two_invisible_doc = mutate(
        invisible_doc,
        "expected: the second thing happens\n",
        "expected: |\n  a second block scalar\n",
        "corpus fixture: two invisible items",
    )

    with tempfile.TemporaryDirectory() as tmp:
        # Corpus roots are named `.planning` so ledger keys come out the same shape as the live
        # ones (`.planning/...`), through the same relative_to(root.parent) code path.
        case_count += 1
        empty = Path(tmp) / "empty" / ".planning"
        empty.mkdir(parents=True)
        _expect_scan_fails(
            "an EMPTY corpus (zero UAT-type files discovered)",
            empty,
            {},
            "discovered ZERO UAT-type files",
        )

        case_count += 1
        vacuous = Path(tmp) / "vacuous" / ".planning"
        _write_corpus(vacuous, {"90-UAT.md": all_invisible_doc})
        _expect_scan_fails(
            "a real corpus with ZERO visible items corpus-wide (upstream-drift tripwire)",
            vacuous,
            {".planning/90-UAT.md": 1},
            "ZERO visible items",
        )

        case_count += 1
        excl = Path(tmp) / "excl" / ".planning"
        _write_corpus(
            excl,
            {
                "91-UAT.md": VALID_UAT_DOC,
                # Basename contains UAT, so it passes the first half of the predicate; the
                # VERIFICATION exclusion is the ONLY thing keeping it out of the corpus.
                "91-UAT-VERIFICATION.md": invisible_doc,
                # And the same, hidden behind a directory name rather than a filename.
                "VERIFICATION/92-UAT.md": invisible_doc,
            },
        )
        if len(discover(excl)) != 1:
            fail(
                "self-test FAILED: the VERIFICATION exclusion is not in force -- discovery "
                f"returned {[p.name for p in discover(excl)]}, expected only 91-UAT.md"
            )
        _expect_scan_passes(
            "a corpus whose VERIFICATION-path files carry invisible items (must be EXCLUDED)",
            excl,
            {},
        )

        # The four ratchet directions, each against a real corpus through the real scan().
        # The corpus is fixed; only the LEDGER varies between cases, so each case isolates one
        # direction. 93 is all-visible (0 invisible), 94 has 1 invisible, 95 has 2.
        ratchet = Path(tmp) / "ratchet" / ".planning"
        _write_corpus(
            ratchet,
            {
                "93-UAT.md": VALID_UAT_DOC,
                "94-UAT.md": invisible_doc,
                "95-UAT.md": two_invisible_doc,
            },
        )
        AT_REST = {".planning/94-UAT.md": 1, ".planning/95-UAT.md": 2}

        case_count += 1
        _expect_scan_fails(
            "direction 1: a ledgered file's invisible count EXCEEDS its entry",
            ratchet,
            AT_REST | {".planning/95-UAT.md": 1},
            "REGRESSION",
        )

        case_count += 1
        _expect_scan_fails(
            "direction 2: a file ABSENT from the ledger carries an invisible item",
            ratchet,
            {".planning/94-UAT.md": 1},
            "NEW OFFENDER",
        )

        case_count += 1
        _expect_scan_fails(
            "direction 3: a ledgered file's count DROPPED (tighten the ledger)",
            ratchet,
            AT_REST | {".planning/94-UAT.md": 5},
            "TIGHTEN the ledger",
        )

        case_count += 1
        _expect_scan_fails(
            "direction 4: a ledger entry whose FILE NO LONGER EXISTS",
            ratchet,
            AT_REST | {".planning/99-DELETED-UAT.md": 3},
            "STALE LEDGER ENTRY",
        )

        case_count += 1
        _expect_scan_passes(
            "the positive control: a corpus that exactly matches its ledger",
            ratchet,
            AT_REST,
        )

    # 10 document-level (3 reject + 7 accept) + 8 scan-level (2 anti-vacuity, 1 discovery
    # exclusion, 4 ratchet directions, 1 positive control).
    assert case_count == 18, f"expected 18 self-test cases, ran {case_count}"
    print(
        f"\nAll 3 suppression shapes proved capable of being COUNTED as invisible, all 7 "
        f"accept-side controls -- body prose, fenced code, four-hash sub-heading, decimal section "
        f"heading, frontmatter item shape, all-visible file, visible item -- proved capable of NOT "
        f"convicting correct documents, the VERIFICATION exclusion proved to be IN FORCE at "
        f"discovery, both anti-vacuity halves proved capable of failing, and all FOUR ratchet "
        f"directions proved capable of firing ({case_count} self-test case(s) total)."
    )


def main() -> None:
    self_test()
    if "--self-test" in sys.argv:
        print(
            "\nSELF-TEST OK: every suppression shape is counted, every accept-side control is "
            "left alone, and all four ratchet directions fire."
        )
        sys.exit(0)

    scan(PLANNING_DIR, LEDGER)
    sys.exit(0)


if __name__ == "__main__":
    main()
