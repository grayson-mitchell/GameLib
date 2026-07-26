#!/usr/bin/env python3
"""Currency gate for 34.2-PORTED-CHANNELS.md.

Purpose (read this before deleting a failing assertion): every one of this phase's three
verification rounds cited the SAME currency-gap class — `34.2-PORTED-CHANNELS.md` reflecting the
previous gap cycle's closures while predating the review that triggered the current one. This
script turns that "stale" observation into a non-zero exit instead of leaving it as something only
a verifier notices.

When a FOURTH gap cycle runs against this phase, the correct maintenance action is to EXTEND the
two token lists below (CLOSED_FINDING_TOKENS / DEFERRED_FINDING_TOKENS) and add its own
`### Gap cycle N reconciliation` subsection — not to delete or weaken any assertion here. Deleting
an assertion to make the gate pass defeats the reason this file exists (T-34.2-92: denial of
service via un-maintainability). If a finding genuinely no longer needs tracking, remove its token
from the list in the SAME commit that also removes/closes the reconciliation prose discussing it,
so the two never drift apart.
"""

import re
import sys
from pathlib import Path

PORTED_CHANNELS_PATH = (
    Path(__file__).parent / "34.2-PORTED-CHANNELS.md"
)

# The literal heading gap cycle 3 added. A future cycle adds its own, numbered heading; this
# constant stays pinned to cycle 3's own heading text so this gate keeps verifying cycle 3's
# section specifically, even after a cycle 4 section is appended after it.
RECONCILIATION_HEADING = "### Gap cycle 3 reconciliation"

# Findings this cycle CLOSED. Every token below must appear within the gap-cycle-3
# reconciliation section. Extend this list, do not replace it, when a future cycle closes
# additional findings inside its OWN reconciliation section (add a new constant for that
# cycle's heading + token list instead of overloading this one).
CLOSED_FINDING_TOKENS = [
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

# Findings this cycle deliberately did NOT fix (deferred or accepted, with a reason recorded
# elsewhere in the section and in deferred-items.md). Every token below must also appear within
# the gap-cycle-3 reconciliation section, so a future edit cannot quietly drop the record that
# these were considered and not silently forgotten.
DEFERRED_FINDING_TOKENS = [
    "WR-05",
    "WR-06",
    "IN-01",
    "IN-03",
    "IN-06",
]

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


def main() -> None:
    if not PORTED_CHANNELS_PATH.exists():
        fail(f"{PORTED_CHANNELS_PATH} does not exist")

    text = PORTED_CHANNELS_PATH.read_text(encoding="utf-8")

    # 1. The gap-cycle-3 reconciliation heading must exist, exactly once.
    heading_count = text.count(RECONCILIATION_HEADING)
    if heading_count == 0:
        fail(
            f'missing required heading "{RECONCILIATION_HEADING}" — the newest cycle\'s '
            "reconciliation section is absent"
        )
    if heading_count > 1:
        fail(
            f'heading "{RECONCILIATION_HEADING}" appears {heading_count} times, expected '
            "exactly 1 — duplicate or malformed reconciliation section"
        )

    section = find_reconciliation_section(text, RECONCILIATION_HEADING)
    if not section.strip():
        fail(f'heading "{RECONCILIATION_HEADING}" found but its body is empty')

    # 2. Every closed-finding token must appear within that section.
    missing_closed = [tok for tok in CLOSED_FINDING_TOKENS if tok not in section]
    if missing_closed:
        fail(
            "the gap-cycle-3 reconciliation section is missing required CLOSED-finding "
            f"token(s): {', '.join(missing_closed)} — a closure this cycle claims elsewhere "
            "is not documented in its own reconciliation section"
        )

    # 3. Every deferred-finding token must appear within that section.
    missing_deferred = [tok for tok in DEFERRED_FINDING_TOKENS if tok not in section]
    if missing_deferred:
        fail(
            "the gap-cycle-3 reconciliation section is missing required DEFERRED-finding "
            f"token(s): {', '.join(missing_deferred)} — a finding this cycle left open has "
            "been silently dropped from the record instead of being named with a reason"
        )

    # 4. The gap-cycle-3 section must be the LAST `###` subsection under `## 7. Reconciliation`,
    #    so a fourth cycle appending its own section after it keeps the ordering meaningful.
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
    if not last_subsection.startswith(RECONCILIATION_HEADING):
        fail(
            f'the gap-cycle-3 reconciliation section is not the LAST "###" subsection under '
            f'"## 7. Reconciliation" — found "{last_subsection}" after it. A later '
            "reconciliation subsection must be appended AFTER this one, not before it "
            "(subsection order is the reading order of the phase's gap-cycle history)."
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
        "OK: gap-cycle-3 reconciliation present, exactly once, last under §7, "
        f"{len(CLOSED_FINDING_TOKENS)} closed-finding token(s) and "
        f"{len(DEFERRED_FINDING_TOKENS)} deferred-finding token(s) all present, "
        "no placeholders."
    )
    sys.exit(0)


if __name__ == "__main__":
    main()
