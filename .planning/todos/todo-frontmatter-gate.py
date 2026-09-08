#!/usr/bin/env python3
"""Pending-todo triage vocabulary gate (quick task 260908-gye).

Purpose (read this before widening a vocabulary to make a failure go away): a folder of todos
whose `severity:` is free text carries no triage information. Before this gate, `severity:` across
`pending/` held four spellings of three concepts (`minor`/`low`, `medium`, `major`, `critical`),
two files said `unknown`, and one held a whole sentence with an upper and a lower bound in it.
Nothing anywhere could answer "what can I pick up at the desk right now?" because nothing recorded
readiness at all. This gate holds the closed vocabulary that fixed that, so it cannot rot back.

Three keys are required on EVERY file in `pending/`:

  severity: critical | major | medium | minor
  platform: macos | windows | linux | any          (default `any`)
  ready:    code | live-gate | human | blocked

`ready` meanings: `code` = desk-ready, edit and typecheck, no live gate and no other OS;
`live-gate` = needs a live run on this Mac; `human` = needs a decision, credentials or a person,
not code; `blocked` = parked, externally blocked, or gated on hardware/an OS not to hand.

SCOPE IS `pending/` ONLY, and that is deliberate rather than incidental — asserted below in
PENDING_DIR's own name and in this comment so that widening it to `completed/` is a DELIBERATE
act by whoever does it. `completed/` holds 100+ historical files written long before this
vocabulary existed; sweeping them in would produce a hundred findings that no longer describe any
live work, and the resulting noise would get the gate deleted rather than the files fixed. A
closed todo needs no triage — triage exists to order work that is still to be done.

FRONTMATTER-BLOCK-ONLY PARSING IS LOAD-BEARING, NOT A NICETY. Todo BODIES are prose about
severity and readiness and legitimately contain lines like `Severity: low, and NOT a security
regression`. A whole-file grep would convict correct files on their own explanatory text — a gate
that convicts correct code is worse than no gate, because the fix people reach for is deleting the
gate. Only the text between the first `---` line and the next `---` line is parsed. Covered by
accept-side self-test cases 11 and 12.

Values are matched BARE and case-sensitively: `severity: minor`, never `severity: "minor"` and
never `severity: Minor`. One canonical spelling per value is the entire point of a closed
vocabulary, and it keeps this gate in exact lockstep with the plain-shell verification sweep
(`grep -qE '^severity: (critical|major|medium|minor)$'`) that quick task 260908-gye used. A gate
that accepts a shape its companion sweep rejects is two vocabularies, not one.

Every offending file and key is reported in ONE run — the walk never stops at the first finding.
Fixing todos one gate-run at a time is how a 35-file corpus takes 35 CI runs to clean up.

There is no hard-coded file count here. The corpus moves constantly (it drifted 38 -> 37 -> 35
during this task's own planning session) and a count pin would be red within the day. The
anti-vacuity floor that protects THIS GATE lives one level up, in
`meta/runPlanningGates.py`'s `MINIMUM_EXPECTED_GATES` — deleting this file fails that floor. What
IS checked here is that the corpus is non-empty: a `pending/` directory that globs to zero files
means the tree moved and this gate is silently checking nothing, which must fail loudly rather
than report a cheerful green over an empty set.

Run `python3 todo-frontmatter-gate.py` (no arguments) for CI mode: self-test first, then walk the
live tree, write nothing. This IS the path `meta/runPlanningGates.py` invokes — discovery is by
`-gate.py` suffix with no arguments, so the no-argument path has to be the real check. Run
`python3 todo-frontmatter-gate.py --self-test` to run only the self-test. There is no `--write`
flag: this gate produces no committed artifact to regenerate, it is a pure predicate over the live
tree, the same shape as `model-a-retirement-gate.py`.

WHEN THIS GATE FAILS, FIX THE TODO'S FRONTMATTER. Never widen VOCABULARY below to admit the value
that failed, and never drop a key from REQUIRED_KEYS. A vocabulary that grows to fit whatever was
typed is free text with extra steps, which is the exact condition this file was written to end.
The `## Conventions` section of `./CLAUDE.md` states the same three keys for the sessions that
FILE todos, so a red gate here means a todo was written without reading it — not that the
vocabulary is too narrow.
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
# both.
TODOS_DIR = Path(__file__).resolve().parent
PENDING_DIR = TODOS_DIR / "pending"

# Scope asserted explicitly (see docstring) rather than left implicit in PENDING_DIR's definition
# alone -- repointing this at `completed/` or at `todos/` broadly must be a deliberate, visible
# edit and not a one-word slip.
assert PENDING_DIR.name == "pending" and PENDING_DIR.parent.name == "todos", (
    "PENDING_DIR must resolve to exactly .planning/todos/pending -- completed/ is deliberately "
    "OUT of scope (see docstring); widening this is a deliberate act, not a typo"
)

VOCABULARY: dict[str, tuple[str, ...]] = {
    "severity": ("critical", "major", "medium", "minor"),
    "platform": ("macos", "windows", "linux", "any"),
    "ready": ("code", "live-gate", "human", "blocked"),
}
REQUIRED_KEYS: tuple[str, ...] = tuple(VOCABULARY)

FENCE = "---"
# A top-level YAML key: name at column 0, no leading whitespace. Anchoring at column 0 is what
# keeps a list item (`  - src/backend/foo.ts`) and a nested mapping from being read as a key.
TOP_LEVEL_KEY = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*):(.*)$")

MISSING = "<MISSING>"
NO_FRONTMATTER = "<NO FRONTMATTER BLOCK>"
DUPLICATE = "<DUPLICATE KEY>"


def extract_frontmatter(text: str) -> list[str] | None:
    """Return the lines BETWEEN the opening `---` and the next `---`, or None if the file has no
    well-formed frontmatter block. Pure: no I/O. A `---` occurring later in the BODY (a markdown
    horizontal rule) is irrelevant -- only the first two fences delimit frontmatter."""
    lines = text.split("\n")
    if not lines or lines[0].strip() != FENCE:
        return None
    for i, line in enumerate(lines[1:], start=1):
        if line.strip() == FENCE:
            return lines[1:i]
    return None


def find_violations(text: str) -> list[tuple[str, str]]:
    """Pure function: given one todo's raw text, return (key, offending_value) for every triage
    violation. No I/O, no sys.exit -- used both against real files (scan_pending) and against
    self-test synthetic documents, never a reimplementation.

    Returns [] for a conforming file. Reports EVERY violation, not just the first."""
    fm = extract_frontmatter(text)
    if fm is None:
        return [(key, NO_FRONTMATTER) for key in REQUIRED_KEYS]

    seen: dict[str, list[str]] = {}
    for line in fm:
        match = TOP_LEVEL_KEY.match(line)
        if match is None:
            continue
        key, raw_value = match.group(1), match.group(2)
        if key in VOCABULARY:
            seen.setdefault(key, []).append(raw_value.strip())

    violations: list[tuple[str, str]] = []
    for key in REQUIRED_KEYS:
        values = seen.get(key, [])
        if not values:
            violations.append((key, MISSING))
            continue
        if len(values) > 1:
            # A duplicate is its own defect: YAML's last-wins means a stale first value sits in
            # the file looking authoritative while a different one is what any parser reads.
            violations.append((key, f"{DUPLICATE} ({', '.join(values)})"))
            continue
        if values[0] not in VOCABULARY[key]:
            violations.append((key, values[0] or "<EMPTY>"))
    return violations


def fail(message: str) -> None:
    print(f"GATE FAILED: {message}", file=sys.stderr)
    sys.exit(1)


def scan_pending(pending_dir: Path) -> None:
    """CI-mode walk: every *.md under pending_dir, real tree, real time. Collects findings across
    ALL files and fails once with the complete list."""
    paths = sorted(pending_dir.glob("*.md"))
    if not paths:
        fail(
            f"scanned ZERO todo files under {pending_dir} -- an empty pending/ almost certainly "
            "means the tree moved and this gate is silently checking nothing. A gate that finds "
            "nothing must fail, not pass."
        )

    findings: list[str] = []
    for path in paths:
        for key, value in find_violations(path.read_text(encoding="utf-8")):
            findings.append(f"{path.name} :: {key} :: {value}")

    if findings:
        detail = "\n  ".join(findings)
        vocab = "\n  ".join(
            f"{key}: {' | '.join(values)}" for key, values in VOCABULARY.items()
        )
        fail(
            f"{len(findings)} triage violation(s) across {len(paths)} pending todo(s):\n"
            f"  {detail}\n\n"
            "Every file in .planning/todos/pending/ must carry all three triage keys, bare and\n"
            "lowercase, from these closed vocabularies:\n"
            f"  {vocab}\n\n"
            "THE CORRECT ACTION IS TO FIX THE TODO'S FRONTMATTER -- add the missing key, or\n"
            "choose the vocabulary value that fits. Never widen VOCABULARY in this gate to admit\n"
            "the value that failed: a vocabulary that grows to fit whatever was typed is free\n"
            "text with extra steps, which is the condition this gate exists to end. See the\n"
            "`## Conventions` section of ./CLAUDE.md for the same list, written for the sessions\n"
            "that FILE todos."
        )

    print(
        f"OK: {len(paths)} pending todo(s) all carry in-vocabulary "
        f"{', '.join(REQUIRED_KEYS)} triage keys."
    )


# ---------------------------------------------------------------------------
# Self-test. Each case is discharged through find_violations / scan_pending, the SAME functions
# used against the real tree, never a reimplementation.
# ---------------------------------------------------------------------------

VALID_FRONTMATTER = (
    "---\n"
    "created: 2026-09-08\n"
    'title: "A perfectly ordinary todo"\n'
    "area: ui\n"
    "status: OPEN\n"
    "severity: medium\n"
    "platform: any\n"
    "ready: code\n"
    "files:\n"
    "  - src/frontend/index.tsx\n"
    "---\n"
    "\n"
    "# A perfectly ordinary todo\n"
)


def _expect_reject(label: str, text: str, expect_key: str) -> None:
    violations = find_violations(text)
    if not violations:
        fail(
            f"self-test FAILED: {label} did NOT reject bad input -- gate vacuous on this check"
        )
    if expect_key not in {key for key, _ in violations}:
        fail(
            f"self-test FAILED: {label} rejected, but not on `{expect_key}` -- "
            f"got {violations!r}; the check fired for the wrong reason"
        )
    print(f"  self-test OK: {label} correctly rejected")


def _expect_accept(label: str, text: str) -> None:
    violations = find_violations(text)
    if violations:
        fail(
            f"self-test FAILED: {label} was WRONGLY rejected ({violations!r}) -- "
            "gate convicts correct input"
        )
    print(f"  self-test OK: {label} correctly accepted")


def self_test() -> None:
    """14 cases: 9 reject-side (one per required key missing, one per out-of-vocabulary
    vocabulary, a duplicate key, a file with no frontmatter block, and an empty corpus), plus 5
    accept-side controls proving the gate does not convict correct files -- the two body-prose
    cases (T-GYE-03) being the ones that matter most, since a whole-file grep would fail both."""
    case_count = 0

    def reject(label: str, text: str, expect_key: str) -> None:
        nonlocal case_count
        case_count += 1
        _expect_reject(label, text, expect_key)

    def accept(label: str, text: str) -> None:
        nonlocal case_count
        case_count += 1
        _expect_accept(label, text)

    # Sanity: the base document must pass clean before we start mutating it into bad input.
    # Without this, every "correctly rejected" below could be rejecting for an unrelated reason.
    _expect_accept("sanity (base valid document)", VALID_FRONTMATTER)
    print("  self-test base document: passes clean (sanity check OK)")

    # Cases 1-3: each required key MISSING must be caught.
    for key in REQUIRED_KEYS:
        reject(
            f"missing `{key}:` key",
            "\n".join(
                line
                for line in VALID_FRONTMATTER.split("\n")
                if not line.startswith(f"{key}:")
            ),
            key,
        )

    # Cases 4-6: an out-of-vocabulary value for each key must be caught. `low` is the real value
    # this gate's own task folded to `minor`; `windows-11` and `maybe` are the shape of a
    # plausible near-miss.
    for key, bad in (("severity", "low"), ("platform", "windows-11"), ("ready", "maybe")):
        reject(
            f"out-of-vocabulary `{key}: {bad}`",
            VALID_FRONTMATTER.replace(
                f"{key}: {dict(severity='medium', platform='any', ready='code')[key]}",
                f"{key}: {bad}",
            ),
            key,
        )

    # Case 7: a DUPLICATE key inside the frontmatter. YAML is last-wins, so a stale first value
    # sits in the file looking authoritative while parsers read a different one.
    reject(
        "duplicate `ready:` key within the frontmatter block",
        VALID_FRONTMATTER.replace("ready: code\n", "ready: code\nready: human\n"),
        "ready",
    )

    # Case 8: no frontmatter block at all -- must report all three keys, not crash.
    reject(
        "file with no frontmatter block at all",
        "# A todo somebody wrote without any frontmatter\n\nseverity: medium\n",
        "severity",
    )

    # Case 9: an unterminated frontmatter block (opening fence, no closing fence) is NOT a
    # frontmatter block. Reading to EOF instead would let body prose be parsed as keys.
    reject(
        "unterminated frontmatter block (no closing fence)",
        "---\nseverity: medium\nplatform: any\nready: code\n\n# body, fence never closed\n",
        "severity",
    )

    # Case 10: the valid base document, restated as an explicit accept -- the positive control
    # for every reject above.
    accept("fully conforming todo", VALID_FRONTMATTER)

    # Case 11: T-GYE-03. Body prose naming a NON-VOCABULARY severity must be ACCEPTED. This is
    # the exact line shape real todos carry, and a whole-file grep convicts it.
    accept(
        "body prose `Severity: low, and NOT a security regression` accepted",
        VALID_FRONTMATTER
        + "\n## Severity rationale\n\n"
        "Severity: low, and NOT a security regression -- the upper bound was never observed.\n",
    )

    # Case 12: T-GYE-03, harder. Body prose that would parse as a VALID-LOOKING but WRONG
    # top-level key at column 0, after the frontmatter has closed. Must be ACCEPTED, and must not
    # be read as a duplicate of the real key above it.
    accept(
        "body line `ready: nonsense` after the closing fence accepted",
        VALID_FRONTMATTER + "\nready: nonsense\nplatform: solaris\nseverity: apocalyptic\n",
    )

    # Case 13: a markdown horizontal rule (`---`) in the BODY must not re-open or extend the
    # frontmatter block.
    accept(
        "markdown `---` horizontal rule in the body accepted",
        VALID_FRONTMATTER + "\nSome prose.\n\n---\n\nMore prose.\n",
    )

    # Case 14: the messy real-world frontmatter shapes the corpus actually contains -- a quoted
    # multi-sentence `status:` carrying a colon, list values, and keys this gate knows nothing
    # about -- must all be ACCEPTED. The gate reads three keys and ignores everything else.
    accept(
        "quoted multi-sentence status, list values and unknown keys accepted",
        "---\n"
        "created: 2026-08-17T00:00:00.000Z\n"
        'status: "PARKED 2026-09-04 — superseded by a design decision: see below."\n'
        "severity: minor\n"
        "platform: any\n"
        "ready: blocked\n"
        "needs: design-then-code-fix\n"
        "resolves_phase: null\n"
        "files:\n"
        "  - src/backend/humble/user.ts\n"
        "  - src/backend/humble/library.ts\n"
        "---\n"
        "\n# Body\n",
    )

    # Case 15 (scan-level, not document-level): an EMPTY pending/ must FAIL rather than report a
    # cheerful green over nothing. Discharged through the real scan_pending against a real empty
    # directory, so it proves the live code path and not a restatement of it.
    # scan_pending's failure goes to stderr; it is CAPTURED here rather than let through, because
    # a literal "GATE FAILED:" line printed during a PASSING self-test run is a misleading-output
    # defect in its own right -- the next reader greps the log, sees it, and believes the gate is
    # red when it is green. The captured text is asserted non-empty so suppressing it cannot
    # hollow out the check.
    case_count += 1
    with tempfile.TemporaryDirectory() as tmp:
        captured = io.StringIO()
        try:
            with contextlib.redirect_stderr(captured):
                scan_pending(Path(tmp))
        except SystemExit:
            if "ZERO todo files" not in captured.getvalue():
                fail(
                    "self-test FAILED: empty pending/ exited non-zero but not via the "
                    f"anti-vacuity message -- got {captured.getvalue()!r}"
                )
            print(
                "  self-test OK: empty pending/ directory correctly rejected "
                "(its GATE FAILED message captured, not printed)"
            )
        else:
            fail(
                "self-test FAILED: an EMPTY pending/ was reported green -- the anti-vacuity "
                "check is itself vacuous"
            )

    assert case_count == 15, f"expected 15 self-test cases, ran {case_count}"
    print(
        f"\nAll 3 required keys proved capable of rejecting a missing value, all 3 vocabularies "
        f"proved capable of rejecting an out-of-vocabulary value, duplicate keys and malformed "
        f"frontmatter proved capable of rejecting, an empty corpus proved capable of failing, and "
        f"all 5 accept-side controls -- including both body-prose cases -- proved capable of NOT "
        f"convicting correct files ({case_count} self-test case(s) total)."
    )


def main() -> None:
    self_test()
    if "--self-test" in sys.argv:
        print(
            "\nSELF-TEST OK: every check rejects its corresponding bad input, and every "
            "accept-side control is correctly left alone."
        )
        sys.exit(0)

    if not PENDING_DIR.is_dir():
        fail(f"{PENDING_DIR} does not exist")

    scan_pending(PENDING_DIR)
    sys.exit(0)


if __name__ == "__main__":
    main()
