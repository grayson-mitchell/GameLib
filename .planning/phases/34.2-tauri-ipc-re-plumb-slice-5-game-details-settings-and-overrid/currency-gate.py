#!/usr/bin/env python3
"""Currency gate for 34.2-PORTED-CHANNELS.md.

Purpose (read this before deleting a failing assertion): every one of this phase's
verification rounds cited the SAME currency-gap class — `34.2-PORTED-CHANNELS.md` reflecting the
previous gap cycle's closures while predating the review that triggered the current one. This
script turns that "stale" observation into a non-zero exit instead of leaving it as something only
a verifier notices.

Per-cycle constant pattern (established by cycle 3, extended by cycle 4 — repeat this
mechanically for a fifth cycle, do not re-derive it):

  1. Add `CYCLE<N>_RECONCILIATION_HEADING = "### Gap cycle <N> reconciliation"`.
  2. Add `CYCLE<N>_CLOSED_FINDING_TOKENS` and `CYCLE<N>_DEFERRED_FINDING_TOKENS` for that cycle's
     own findings.
  3. Duplicate assertions 1-3 (heading exists exactly once, body non-empty, every closed/deferred
     token present) for the new cycle's section, leaving every prior cycle's assertions untouched.
  4. Update the ordering check (assertion 4) so the NEWEST cycle's heading must be last, and keep
     (or add another) companion assertion that every older cycle's heading is still present AND
     appears BEFORE the newest one (compare `str.find` indices) — "newest last, history preserved
     in reading order". Do not remove an older cycle's presence/ordering pin when adding a new one.
  5. Update the final success `print(...)` to report every cycle's token counts.

A FIFTH cycle has since been added (2026-08-23) following exactly these steps. When a SIXTH
runs against this phase, the correct maintenance action is to EXTEND the
token lists and heading constants above — never to delete or weaken an existing assertion.
Deleting an assertion to make the gate pass defeats the reason this file exists (T-34.2-92: denial
of service via un-maintainability). If a finding genuinely no longer needs tracking, remove its
token from the list in the SAME commit that also removes/closes the reconciliation prose
discussing it, so the two never drift apart.
"""

import re
import sys
from pathlib import Path

PORTED_CHANNELS_PATH = (
    Path(__file__).parent / "34.2-PORTED-CHANNELS.md"
)

# ---------------------------------------------------------------------------
# Gap cycle 3 (established first; renamed with a CYCLE3_ prefix for symmetry
# with cycle 4 below — the heading text and both token lists are UNCHANGED in
# content from the original single-cycle version of this gate).
# ---------------------------------------------------------------------------

CYCLE3_RECONCILIATION_HEADING = "### Gap cycle 3 reconciliation"

# Findings gap cycle 3 CLOSED. Every token below must appear within the gap-cycle-3
# reconciliation section. Extend a NEW cycle's own list when that cycle closes additional
# findings inside its OWN reconciliation section — do not add to this one.
CYCLE3_CLOSED_FINDING_TOKENS = [
    "CR-01",
    "WR-01",
    "WR-02",
    "WR-03",
    "WR-04",
    "WR-07",
    "WR-08",
    "IN-02",
    "IN-05",
    "timeout_for",
]

# Findings gap cycle 3 deliberately did NOT fix (deferred or accepted, with a reason recorded
# elsewhere in the section and in deferred-items.md). Every token below must also appear within
# the gap-cycle-3 reconciliation section, so a future edit cannot quietly drop the record that
# these were considered and not silently forgotten.
CYCLE3_DEFERRED_FINDING_TOKENS = [
    "WR-05",
    "WR-06",
    "IN-01",
    "IN-03",
    "IN-06",
]

# ---------------------------------------------------------------------------
# Gap cycle 4 (added by plan 34.2-30). Extends the pattern above; does not touch it.
# ---------------------------------------------------------------------------

CYCLE4_RECONCILIATION_HEADING = "### Gap cycle 4 reconciliation"

# All 14 findings from 34.2-REVIEW-GAP-CYCLE-3.md (2 critical + 12 warnings — the review's own
# frontmatter undercounts them as `warning: 11`; the body labels WR-01 through WR-12 and the body
# is authoritative). Every token below must appear within the gap-cycle-4 reconciliation section.
CYCLE4_CLOSED_FINDING_TOKENS = [
    "CR-01",
    "CR-02",
    "WR-01",
    "WR-02",
    "WR-03",
    "WR-04",
    "WR-05",
    "WR-06",
    "WR-07",
    "WR-08",
    "WR-09",
    "WR-10",
    "WR-11",
    "WR-12",
]

# Findings gap cycle 4 deliberately did NOT fix (deferred, with a reason recorded elsewhere in the
# section and in deferred-items.md's "From gap cycle 4" section).
CYCLE4_DEFERRED_FINDING_TOKENS = [
    "D4-DEF-01",
    "D4-DEF-02",
]

# ---------------------------------------------------------------------------
# Gap cycle 5 (added 2026-08-23). Extends the pattern above; touches nothing prior.
#
# Unlike cycles 1-4 these closures were made by five /gsd-quick tasks rather than
# by a numbered gap-cycle plan, so the reconciliation section is keyed by
# quick-task id and commit. The gate does not care which produced them -- it
# pins only that every finding is named in the section.
# ---------------------------------------------------------------------------

CYCLE5_RECONCILIATION_HEADING = "### Gap cycle 5 reconciliation"

# All 20 findings from 34.2-REVIEW-GAP-CYCLE-4.md (1 critical + 11 warning + 8 info). Unlike
# cycle 3's review, this one's frontmatter and body AGREE on the total, so there is no
# body-over-frontmatter judgement to record here. An earlier record put this cycle's scope at 17;
# that figure was a miscount and is corrected in the reconciliation section itself.
CYCLE5_CLOSED_FINDING_TOKENS = [
    "CR-01",
    "WR-01",
    "WR-02",
    "WR-03",
    "WR-04",
    "WR-05",
    "WR-06",
    "WR-07",
    "WR-08",
    "WR-09",
    "WR-10",
    "WR-11",
    "IN-01",
    "IN-02",
    "IN-03",
    "IN-04",
    "IN-05",
    "IN-06",
    "IN-07",
    "IN-08",
]

# Gap cycle 5 carried NOTHING of its own forward. The list is deliberately empty rather than
# absent: an empty list makes "this cycle deferred nothing" an explicit, checkable claim, and
# keeps the per-cycle shape uniform so a sixth cycle is copied rather than re-derived. The
# assertion below treats an empty list as vacuously satisfied, which is correct here and is why
# the NON-empty closed list carries this cycle's weight.
CYCLE5_DEFERRED_FINDING_TOKENS: list[str] = []

# ---------------------------------------------------------------------------
# Late closures (added 2026-08-23). NOT a gap cycle: findings closed after their own cycle's
# reconciliation section was already written. A cycle's section records what that cycle did and is
# not amended afterwards, so late work needs a home of its own or it goes unpinned.
#
# Tokens here are ROUND-QUALIFIED PHRASES, not bare IDs. Every other list in this file can use a
# bare `IN-04` because it is scoped to one round's section; this list is not, and this phase's own
# ledger warns that each round restarts numbering at CR-01/WR-01. A bare "IN-04" here would be
# satisfied by any round's IN-04 appearing anywhere in the section.
# ---------------------------------------------------------------------------

LATE_RECONCILIATION_HEADING = "### Late closures"

LATE_CLOSED_FINDING_TOKENS = [
    "gap cycle 2 IN-04",
    "gap cycle 2 IN-03",
    "gap cycle 2 IN-06",
]

LATE_DEFERRED_FINDING_TOKENS: list[str] = []

PLACEHOLDER_PATTERN = re.compile(r"\bTBD\b|\bTODO\b|\bFIXME\b|\bXXX\b")


def fail(message: str) -> None:
    print(f"CURRENCY GATE FAILED: {message}", file=sys.stderr)
    sys.exit(1)


def find_reconciliation_section(text: str, heading: str) -> str:
    """Return the body of the named `###` section, up to the next `##`/`###` heading or EOF."""
    idx = text.find(heading)
    if idx == -1:
        return ""
    rest = text[idx + len(heading) :]
    # Stop at the next heading of level 2 or 3 (## or ###), whichever comes first.
    next_heading = re.search(r"\n#{2,3}\s", rest)
    if next_heading:
        return rest[: next_heading.start()]
    return rest


def check_cycle_section(
    text: str,
    heading: str,
    closed_tokens: list[str],
    deferred_tokens: list[str],
    cycle_label: str,
) -> str:
    """Assertions 1-3 for a single cycle's reconciliation section. Returns the section body."""
    heading_count = text.count(heading)
    if heading_count == 0:
        fail(
            f'missing required heading "{heading}" — the {cycle_label} reconciliation section '
            "is absent"
        )
    if heading_count > 1:
        fail(
            f'heading "{heading}" appears {heading_count} times, expected exactly 1 — '
            f"duplicate or malformed {cycle_label} reconciliation section"
        )

    section = find_reconciliation_section(text, heading)
    if not section.strip():
        fail(f'heading "{heading}" found but its body is empty')

    missing_closed = [tok for tok in closed_tokens if tok not in section]
    if missing_closed:
        fail(
            f"the {cycle_label} reconciliation section is missing required CLOSED-finding "
            f"token(s): {', '.join(missing_closed)} — a closure this cycle claims elsewhere "
            "is not documented in its own reconciliation section"
        )

    missing_deferred = [tok for tok in deferred_tokens if tok not in section]
    if missing_deferred:
        fail(
            f"the {cycle_label} reconciliation section is missing required DEFERRED-finding "
            f"token(s): {', '.join(missing_deferred)} — a finding this cycle left open has "
            "been silently dropped from the record instead of being named with a reason"
        )

    return section


def extract_closed_subsection(section: str, cycle_label: str) -> str:
    """The CLOSED region of a reconciliation section, not the whole thing.

    Found by RED proof while adding cycle 5, and worth stating plainly because it is the same
    defect class gap cycle 4 was largely about: `check_cycle_section` asserts only that a token
    appears SOMEWHERE in the section, so a finding REMOVED from the closure list still satisfies
    the gate if its ID is mentioned anywhere else -- in a "what the review got wrong" aside, in a
    cross-reference, in a sentence explaining why it was hard. Measured: deleting `IN-08` from
    cycle 5's closure list left the gate GREEN, because that ID also appears in the section's
    prose about the review's own mistakes.

    Scoping the search to the closed region makes the assertion measure the property it claims --
    the finding is dispositioned as closed, not merely named somewhere nearby. Applied to cycle 5
    ONLY: the existing cycle-3 and cycle-4 checks are untouched, per this file's own rule that
    assertions are extended and never weakened, and their sections do not carry the delimiters
    this relies on.
    """
    start_marker = "**Closed ("
    end_marker = "**Deferred"
    start = section.find(start_marker)
    if start == -1:
        fail(
            f"the {cycle_label} reconciliation section has no closed-finding heading "
            f"(expected a line beginning {start_marker!r}) -- the closed region cannot be "
            "located, so its tokens cannot be checked against anything narrower than the "
            "whole section"
        )
    end = section.find(end_marker, start)
    if end == -1:
        fail(
            f"the {cycle_label} reconciliation section has no {end_marker!r} marker after its "
            "closed region -- the region has no terminator and would swallow the rest of the "
            "section, defeating the point of scoping the search"
        )
    return section[start:end]


def main() -> None:
    if not PORTED_CHANNELS_PATH.exists():
        fail(f"{PORTED_CHANNELS_PATH} does not exist")

    text = PORTED_CHANNELS_PATH.read_text(encoding="utf-8")

    # 1-3. Cycle 3's own section: heading present exactly once, body non-empty, every
    #      closed/deferred token present. UNCHANGED from the original single-cycle gate.
    check_cycle_section(
        text,
        CYCLE3_RECONCILIATION_HEADING,
        CYCLE3_CLOSED_FINDING_TOKENS,
        CYCLE3_DEFERRED_FINDING_TOKENS,
        "gap-cycle-3",
    )

    # 1-3 (extended). Cycle 4's own section: same three checks, cycle 4's own tokens.
    check_cycle_section(
        text,
        CYCLE4_RECONCILIATION_HEADING,
        CYCLE4_CLOSED_FINDING_TOKENS,
        CYCLE4_DEFERRED_FINDING_TOKENS,
        "gap-cycle-4",
    )

    # 1-3 (extended again). Cycle 5's own section: same three checks, cycle 5's own tokens.
    cycle5_section = check_cycle_section(
        text,
        CYCLE5_RECONCILIATION_HEADING,
        CYCLE5_CLOSED_FINDING_TOKENS,
        CYCLE5_DEFERRED_FINDING_TOKENS,
        "gap-cycle-5",
    )

    # 3b (cycle 5 only, STRICTER than the shared check above rather than a replacement for it).
    # Every closed token must appear inside the section's CLOSED region specifically. See
    # extract_closed_subsection's docstring for the measurement that motivated this.
    cycle5_closed_region = extract_closed_subsection(cycle5_section, "gap-cycle-5")
    misplaced = [
        tok for tok in CYCLE5_CLOSED_FINDING_TOKENS if tok not in cycle5_closed_region
    ]
    if misplaced:
        fail(
            "the gap-cycle-5 reconciliation section names these finding(s) somewhere, but NOT "
            f"in its closed-finding region: {', '.join(misplaced)} — a finding mentioned only in "
            "passing prose is not dispositioned. Add it to the closed list, or move it to a "
            "deferred/open bucket with a reason."
        )

    # 1-3 (extended once more). The late-closures section: same three checks, its own tokens.
    late_section = check_cycle_section(
        text,
        LATE_RECONCILIATION_HEADING,
        LATE_CLOSED_FINDING_TOKENS,
        LATE_DEFERRED_FINDING_TOKENS,
        "late-closures",
    )

    # 3b (late closures too, same stricter rule as cycle 5): a finding named only in passing
    # prose is not dispositioned. This section discusses findings it does NOT close (cycle 2's
    # IN-01/IN-03/IN-06), so the distinction is load-bearing here rather than theoretical.
    late_closed_region = extract_closed_subsection(late_section, "late-closures")
    misplaced_late = [
        tok for tok in LATE_CLOSED_FINDING_TOKENS if tok not in late_closed_region
    ]
    if misplaced_late:
        fail(
            "the late-closures section names these finding(s) somewhere, but NOT in its "
            f"closed-finding region: {', '.join(misplaced_late)} — a finding mentioned only in "
            "passing prose is not dispositioned."
        )

    # 4. Ordering: "newest last, history preserved in reading order". The gap-cycle-4 heading
    #    must be the LAST `###` subsection under `## 7. Reconciliation`, AND the gap-cycle-3
    #    heading must still be present and appear BEFORE the gap-cycle-4 heading. This is an
    #    EXTENSION of the original single-heading ordering check, not a weakening: cycle 3's
    #    section is now pinned in two ways (presence, checked above, and relative position,
    #    checked here) instead of one.
    section7_match = re.search(r"\n## 7\. Reconciliation\n", text)
    if not section7_match:
        fail('missing "## 7. Reconciliation" heading — cannot verify subsection ordering')
    section7_body = text[section7_match.end() :]
    next_h2 = re.search(r"\n## \d", section7_body)
    if next_h2:
        section7_body = section7_body[: next_h2.start()]
    subsection_headings = re.findall(r"\n(### [^\n]+)", "\n" + section7_body)
    if not subsection_headings:
        fail('"## 7. Reconciliation" has no "###" subsections at all')
    last_subsection = subsection_headings[-1]
    if not last_subsection.startswith(LATE_RECONCILIATION_HEADING):
        fail(
            f'the late-closures section is not the LAST "###" subsection under '
            f'"## 7. Reconciliation" — found "{last_subsection}" after it. A later '
            "reconciliation subsection must be appended AFTER this one, not before it "
            "(subsection order is the reading order of the phase's gap-cycle history)."
        )

    # Cycle 5 keeps its own relative-position pin: it must still be present, and must sit BEFORE
    # the late-closures section. Retargeting the "last subsection" check above without this would
    # have WEAKENED cycle 5 from two pins to one.
    cycle5_index = next(
        (i for i, h in enumerate(subsection_headings)
         if h.startswith(CYCLE5_RECONCILIATION_HEADING)),
        None,
    )
    if cycle5_index is None:
        fail('the gap-cycle-5 reconciliation heading disappeared from "## 7. Reconciliation"')
    late_index = next(
        (i for i, h in enumerate(subsection_headings)
         if h.startswith(LATE_RECONCILIATION_HEADING)),
        None,
    )
    if late_index is None or cycle5_index > late_index:
        fail(
            "the gap-cycle-5 reconciliation section must appear BEFORE the late-closures "
            "section (subsection order is reading order)."
        )

    # Every older cycle stays pinned for both PRESENCE and RELATIVE POSITION. Adding cycle 5 does
    # not retire cycle 4's ordering pin -- it inherits it, so the chain 3 < 4 < 5 is checked in
    # full rather than only at its newest link.
    cycle3_idx = text.find(CYCLE3_RECONCILIATION_HEADING)
    cycle4_idx = text.find(CYCLE4_RECONCILIATION_HEADING)
    cycle5_idx = text.find(CYCLE5_RECONCILIATION_HEADING)
    for label, idx, newer_label in (
        (CYCLE3_RECONCILIATION_HEADING, cycle3_idx, "gap-cycle-4"),
        (CYCLE4_RECONCILIATION_HEADING, cycle4_idx, "gap-cycle-5"),
    ):
        if idx == -1:
            fail(
                f'"{label}" is missing entirely — the {newer_label} section must be appended '
                "AFTER it, not replace it"
            )
    if cycle3_idx >= cycle4_idx:
        fail(
            f'"{CYCLE3_RECONCILIATION_HEADING}" appears AFTER (or at the same position as) '
            f'"{CYCLE4_RECONCILIATION_HEADING}" — history must read oldest-to-newest; the '
            "gap-cycle-3 section must come first"
        )
    if cycle4_idx >= cycle5_idx:
        fail(
            f'"{CYCLE4_RECONCILIATION_HEADING}" appears AFTER (or at the same position as) '
            f'"{CYCLE5_RECONCILIATION_HEADING}" — history must read oldest-to-newest; the '
            "gap-cycle-4 section must come first"
        )

    # 5. No placeholder token anywhere in the document.
    placeholder_hits = sorted(set(PLACEHOLDER_PATTERN.findall(text)))
    if placeholder_hits:
        fail(
            "placeholder token(s) found in the document: "
            f"{', '.join(placeholder_hits)} — a currency-gate-passing document must not "
            "carry unresolved TBD/TODO/FIXME/XXX markers"
        )

    print(
        "OK: gap-cycle-3 reconciliation present, exactly once, before gap-cycle-4, "
        f"{len(CYCLE3_CLOSED_FINDING_TOKENS)} closed-finding token(s) and "
        f"{len(CYCLE3_DEFERRED_FINDING_TOKENS)} deferred-finding token(s) all present; "
        "gap-cycle-4 reconciliation present, exactly once, last under §7, "
        f"{len(CYCLE4_CLOSED_FINDING_TOKENS)} closed-finding token(s) and "
        f"{len(CYCLE4_DEFERRED_FINDING_TOKENS)} deferred-finding token(s) all present; "
        "gap-cycle-5 reconciliation present, exactly once, last under §7, after gap-cycle-4, "
        f"{len(CYCLE5_CLOSED_FINDING_TOKENS)} closed-finding token(s) and "
        f"{len(CYCLE5_DEFERRED_FINDING_TOKENS)} deferred-finding token(s) all present, "
        "no placeholders."
    )
    sys.exit(0)


if __name__ == "__main__":
    main()
