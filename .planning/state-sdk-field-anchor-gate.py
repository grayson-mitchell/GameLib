#!/usr/bin/env python3
r"""SDK field-anchor gate over `.planning/STATE.md` (quick task 260924-vku).

WHY THIS GATE EXISTS -- read this before "fixing" a future failure the wrong way.

In the installed `get-shit-done-cc` 1.42.3 SDK, `sdk/src/query/state-document.ts:12`
(`stateExtractField`) and `:22` (`stateReplaceField`) look for a bold `**Field:**`
ANYWHERE in the document body, case-insensitive, and take the FIRST hit. If there is
none, they fall back to the first LINE-START `Field:`, again case-insensitive (JS `im`
flags). Neither is scoped to any section or to the frontmatter -- they scan the whole
body top to bottom and stop at the first match, wherever it is.
`state-mutation.ts:64` (`updateCurrentPositionFields`) and `:481` (`stateAdvancePlan`)
additionally do CASE-SENSITIVE, section-scoped first-hit replaces on `^Phase:`, `^Plan:`
and `^Status:`, but the section itself is computed with
`/(##\s*Current Position\s*\n)([\s\S]*?)(?=\n##|$)/i` -- which stops at the next line
starting with TWO literal hash characters, so a `### ` subheading (its first two
characters ARE `##`) silently ends the section early, even though a human reader would
still call that subheading "inside" Current Position.

STATE.md accumulated MANY archived, historical `Phase:`/`Plan:`/`Status:`/`Progress:`/
`Last activity:`/`Last session:`/`Stopped at:`/`Resume file:`-shaped lines over its
life -- quoted banners, superseded position summaries, stray bold emphasis in Quick
Task descriptions -- ahead of, or beside, the one line that was actually meant to be
live. Three independently-discovered, confirmed occurrences of the resulting
corruption are on record:
  1. Quick task 260816-qcn: `gsd-sdk query state.add-decision` reproduced the standing
     whole-file STATE.md corruption defect on its one invocation that session (see the
     Quick Tasks Completed row for 260816-qcn, and STATE.md's own Decisions section).
  2. Phase 34.6 plan 01: the executor skipped `gsd-sdk state.*`/`roadmap.*` entirely for
     that plan's updates and hand-applied both files instead, citing this same "known
     corruption defect" (see the original todo,
     `.planning/todos/completed/2026-09-23-gsd-sdk-state-mutation-verbs-corrupt-unrelated-historical-lines-in-state-md.md`).
  3. Phase 46 plan 02: `state.advance-plan`/`state.record-session` overwrote two
     archived historical `Phase:`/`Plan:` lines far below the real banner, and
     truncated a ~700-word "Last activity" narrative down to its own bare date.

The fix landed by quick task 260924-vku is a RESTRUCTURE, not a patch to the SDK: every
archived line that could collide with an SDK field literal was moved verbatim into
`.planning/STATE-HISTORY.md`, and STATE.md's `## Current Position` and
`## Session Continuity` sections were rewritten to carry exactly one single-line,
anchored occurrence of each canonical field. This gate is the invariant that keeps it
that way. It is a re-derivable CENSUS, not a parser reimplementation: every check below
transliterates one of the SDK's own regexes into Python and counts.

HONESTY, STATED PLAINLY: this gate DETECTS after the fact, the next time
`pnpm planning-gates` runs. It does not intercept or block an `gsd-sdk query state.*`
write as it happens -- there is no hook for that. Any SDK or hand write that inserts a
new multi-line narrative value, or re-adds a bold `**Field:**` anywhere in the body
(e.g. a pasted Decisions entry, a quoted code excerpt), re-arms the SDK's first-hit
mis-targeting until this gate is next run and catches it.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

# Resolved from __file__, NEVER cwd -- matches planning-frontmatter-gate.py's convention,
# since `meta/runPlanningGates.py` runs each gate with the gate's own directory as cwd,
# but a human may run it from the repo root.
PLANNING_DIR = Path(__file__).resolve().parent
assert PLANNING_DIR.name == ".planning", (
    "PLANNING_DIR must resolve to exactly the repo's .planning/ directory -- repointing "
    "this gate elsewhere must be a deliberate, visible edit, not a typo"
)
DEFAULT_TARGET = PLANNING_DIR / "STATE.md"

FENCE = "---"

# ---------------------------------------------------------------------------
# SDK_FIELDS -- the single source of truth for every literal this gate checks.
#
# Copied from get-shit-done-cc 1.42.3 (`sdk/src/query/state.ts`,
# `sdk/src/query/state-mutation.ts`) by grepping every call site of
# `stateExtractField(`, `stateReplaceField(` and `stateReplaceFieldWithFallback(`
# (both primary and fallback arguments). MUST BE RE-DERIVED ON UPGRADE -- see
# `discover_installed_sdk_literals()` below, which does this automatically whenever an
# SDK source tree is available and fails loudly on drift.
#
# `canonical`: True for the 8 fields the restructured STATE.md carries exactly one
# anchored line for. `required`: the count this gate demands (1 for canonical, 0 for
# every other literal -- a 0-required field appearing even once means an old/foreign
# shape has crept back in). `section`: which of the two canonical sections a canonical
# field's line must fall inside (None for non-canonical fields, which must not appear
# at all). Case-variant pairs (Last Activity/Last activity, Stopped At/at, Resume
# File/file) collapse under case-insensitive counting -- listed ONCE each below under
# their primary spelling, with the alternate noted in a comment; do not double-count
# them as two separate requirements.
# ---------------------------------------------------------------------------
CURRENT_POSITION = "Current Position"
SESSION_CONTINUITY = "Session Continuity"

SDK_FIELDS: tuple[dict, ...] = (
    # -- Canonical (required count 1) --
    # "Phase" is not read via stateExtractField/stateReplaceField's generic
    # bold-anywhere/plain-line-start search (no call site uses the bare literal
    # "Phase") -- it is read/written only via updateCurrentPositionFields'/
    # stateAdvancePlan's own inline CASE-SENSITIVE `^Phase:` regex, scoped to the
    # Current Position section. Anchored here anyway, under the SAME full rule as
    # every other field, as a deliberate over-anchor: a future SDK version or an
    # undiscovered code path could add a generic bold/plain read of "Phase" at any
    # time, and there is no cost to having zero stray matches today.
    {"literal": "Phase", "canonical": True, "required": 1, "section": CURRENT_POSITION},
    {"literal": "Plan", "canonical": True, "required": 1, "section": CURRENT_POSITION},
    {"literal": "Status", "canonical": True, "required": 1, "section": CURRENT_POSITION},
    {"literal": "Last Activity", "canonical": True, "required": 1, "section": CURRENT_POSITION},  # also covers "Last activity"
    {"literal": "Progress", "canonical": True, "required": 1, "section": CURRENT_POSITION},
    {"literal": "Last session", "canonical": True, "required": 1, "section": SESSION_CONTINUITY},
    {"literal": "Stopped At", "canonical": True, "required": 1, "section": SESSION_CONTINUITY},  # also covers "Stopped at"
    {"literal": "Resume File", "canonical": True, "required": 1, "section": SESSION_CONTINUITY},  # also covers "Resume file"
    # -- Non-canonical (required count 0) -- every other literal any state.ts /
    # state-mutation.ts call site reads or writes via stateExtractField/
    # stateReplaceField/stateReplaceFieldWithFallback.
    {"literal": "Last Activity Description", "canonical": False, "required": 0, "section": None},
    {"literal": "Current Phase", "canonical": False, "required": 0, "section": None},
    {"literal": "Current Phase Name", "canonical": False, "required": 0, "section": None},
    {"literal": "Current Plan", "canonical": False, "required": 0, "section": None},
    {"literal": "Total Plans in Phase", "canonical": False, "required": 0, "section": None},
    {"literal": "Last Date", "canonical": False, "required": 0, "section": None},
    {"literal": "Paused At", "canonical": False, "required": 0, "section": None},
    {"literal": "Total Phases", "canonical": False, "required": 0, "section": None},
)

# Anti-vacuity floor for the self-test -- see anti_vacuity() below. 11 cases: 8 REJECT
# (bold-Status duplicate, plain-plan duplicate, Last-activity continuation, ###-subheading
# early-termination, missing Resume file, stray Current Plan, zero-canonical-fields body,
# missing target file) + 3 ACCEPT (minimal document, Current-focus/table-row decoys,
# mid-line field literal).
MINIMUM_SELF_TEST_CASES = 11


def fail(message: str) -> None:
    print(f"GATE FAILED: {message}", file=sys.stderr)
    sys.exit(1)


def escape_regex(s: str) -> str:
    return re.escape(s)


def strip_frontmatter(text: str) -> str | None:
    """Strip the leading `---\\n...\\n---\\n` block. Returns None if the document has
    no well-formed frontmatter block (same shape as planning-frontmatter-gate.py's
    `extract_frontmatter`, but returning the BODY rather than the frontmatter text)."""
    lines = text.split("\n")
    if not lines or lines[0].strip() != FENCE:
        return None
    for i, line in enumerate(lines[1:], start=1):
        if line.strip() == FENCE:
            return "\n".join(lines[i + 1 :])
    return None


def compute_section_span(body: str, heading_literal: str) -> tuple[int, int] | None:
    """Transliteration of the SDK's own section regex:
    `/(##\\s*<heading>\\s*\\n)([\\s\\S]*?)(?=\\n##|$)/i`. Returns (start_line, end_line),
    1-based INCLUSIVE body-line numbers of the captured span, or None if no match.
    NOTE: the lookahead matches ANY line starting with two literal hashes, including a
    `### ` subheading -- this is deliberate fidelity to the SDK, not a bug (see the
    module docstring's "### counts" paragraph)."""
    pattern = re.compile(
        r"(##\s*" + re.escape(heading_literal) + r"\s*\n)([\s\S]*?)(?=\n##|$)",
        re.IGNORECASE,
    )
    m = pattern.search(body)
    if not m:
        return None
    start_offset = m.start(2)
    end_offset = m.end(2)
    start_line = body.count("\n", 0, start_offset) + 1
    if end_offset > start_offset and body[start_offset:end_offset].endswith("\n"):
        end_line = body.count("\n", 0, end_offset - 1) + 1
    else:
        end_line = body.count("\n", 0, end_offset) + 1
    return start_line, end_line


def field_hits(body: str, literal: str) -> list[tuple[str, int]]:
    """Return every (kind, line_no) hit for one field literal: bold-anywhere then
    plain-line-start, both case-insensitive -- the SDK's own two-pattern rule.
    line_no is 1-based, body-relative."""
    escaped = escape_regex(literal)
    bold_pattern = re.compile(r"\*\*" + escaped + r":\*\*[ \t]*(.*)", re.IGNORECASE)
    plain_pattern = re.compile(r"^" + escaped + r":[ \t]*(.*)", re.IGNORECASE | re.MULTILINE)
    hits: list[tuple[str, int]] = []
    for m in bold_pattern.finditer(body):
        hits.append(("bold", body.count("\n", 0, m.start()) + 1))
    for m in plain_pattern.finditer(body):
        hits.append(("plain", body.count("\n", 0, m.start()) + 1))
    return hits


def check_document(text: str) -> tuple[bool, list[str]]:
    """Pure function: given full document TEXT, return (passed, problem-messages).
    Reports every problem found in one pass rather than stopping at the first (matches
    the established convention in this repo's other gates)."""
    problems: list[str] = []

    body = strip_frontmatter(text)
    if body is None:
        return False, ["document has no well-formed `---`-delimited frontmatter block"]

    body_lines = body.split("\n")

    # ---- Check 1: per-field hit counts ----
    canonical_line_no: dict[str, int] = {}
    total_canonical_hits = 0
    for entry in SDK_FIELDS:
        literal = entry["literal"]
        hits = field_hits(body, literal)
        if len(hits) != entry["required"]:
            problems.append(
                f"field {literal!r}: expected {entry['required']} match(es), found "
                f"{len(hits)}: {[(k, n) for k, n in hits]}"
            )
        elif entry["canonical"] and hits:
            canonical_line_no[literal] = hits[0][1]
            total_canonical_hits += 1

    if total_canonical_hits == 0:
        problems.append("anti-vacuity: zero canonical fields found in the body at all")

    # ---- Check 2: each canonical plain line followed by blank / another canonical / EOF ----
    # Case-insensitive prefix match: the SDK reads field names case-insensitively
    # (`i`/`im` regex flags throughout), so a canonical line spelled "Last activity:"
    # must be recognised as satisfying the "Last Activity" entry's prefix, etc.
    canonical_prefixes = [
        (entry["literal"] + ":").lower() for entry in SDK_FIELDS if entry["canonical"]
    ]
    for literal, line_no in canonical_line_no.items():
        idx0 = line_no - 1
        if idx0 + 1 >= len(body_lines):
            continue  # EOF -- fine
        next_line = body_lines[idx0 + 1]
        if next_line.strip() == "":
            continue  # blank -- fine
        next_line_lower = next_line.lower()
        if any(next_line_lower.startswith(p) for p in canonical_prefixes):
            continue  # another canonical field line -- fine
        problems.append(
            f"canonical field {literal!r} (body line {line_no}) is followed by a "
            f"non-blank, non-canonical continuation line: {next_line[:100]!r}"
        )

    # ---- Check 3: each canonical line lies inside its required section span ----
    section_spans: dict[str, tuple[int, int] | None] = {}
    for entry in SDK_FIELDS:
        if entry["section"] and entry["section"] not in section_spans:
            section_spans[entry["section"]] = compute_section_span(body, entry["section"])

    for entry in SDK_FIELDS:
        literal = entry["literal"]
        if not entry["canonical"] or literal not in canonical_line_no:
            continue
        section = entry["section"]
        span = section_spans.get(section)
        line_no = canonical_line_no[literal]
        if span is None:
            problems.append(
                f"canonical field {literal!r} requires section {section!r}, but that "
                f"section's SDK-regex span could not be computed (heading missing?)"
            )
        elif not (span[0] <= line_no <= span[1]):
            problems.append(
                f"canonical field {literal!r} at body line {line_no} is OUTSIDE its "
                f"required section {section!r}'s SDK-computed span {span} -- a `### ` "
                f"subheading (or the section heading itself) may be ending the span early"
            )

    # ---- Check 4: Phase/Plan/Status also match the CASE-SENSITIVE ^Phase:/^Plan:/^Status: ----
    for literal in ("Phase", "Plan", "Status"):
        if literal not in canonical_line_no:
            continue
        cs_pattern = re.compile(r"^" + re.escape(literal) + r":.*$", re.MULTILINE)
        cs_hits = [body.count("\n", 0, m.start()) + 1 for m in cs_pattern.finditer(body)]
        if canonical_line_no[literal] not in cs_hits:
            problems.append(
                f"canonical field {literal!r} at body line {canonical_line_no[literal]} "
                f"does not match the SDK's case-sensitive ^{literal}: form used by "
                f"updateCurrentPositionFields/stateAdvancePlan"
            )

    # ---- Check 5: Plan: value matches ^\d+\s+of\s+\d+ (advance-plan's compound parse) ----
    if "Plan" in canonical_line_no:
        line_no = canonical_line_no["Plan"]
        line_text = body_lines[line_no - 1]
        value = line_text.split(":", 1)[1].strip() if ":" in line_text else ""
        if not re.match(r"^\d+\s+of\s+\d+", value):
            problems.append(
                f"Plan: value {value!r} does not start with `<N> of <M>` -- "
                f"state.advance-plan's compound-format parser (state-mutation.ts:555-559) "
                f"requires this shape"
            )

    return (len(problems) == 0), problems


# ---------------------------------------------------------------------------
# Drift detection: re-derive field literals from the INSTALLED SDK source, when one is
# available, and fail if it uses a literal missing from SDK_FIELDS. CI has no SDK
# installed, so the pinned list above is authoritative and must work alone -- this is a
# belt-and-braces check for local/dev runs, not a CI dependency.
# ---------------------------------------------------------------------------
#
# Group 1: "WithFallback" if the called function is the fallback variant, else None.
# Group 2: the PRIMARY field-name literal (always a field name, for every variant).
# Group 3: the SECOND quoted string immediately following, if any -- ONLY meaningful
# as a FALLBACK FIELD NAME when group 1 is "WithFallback". For plain stateReplaceField/
# stateExtractField calls, a second quoted literal (e.g.
# `stateReplaceField(content, 'Current Plan', '1')`) is the REPLACEMENT VALUE being
# written, not a field name, and must be discarded by the caller -- this regex cannot
# express that condition itself (no cross-group conditional in Python's `re`), so
# discover_installed_sdk_literals() below filters group 3 on group 1's presence.
CALL_SITE_RE = re.compile(
    r"state(?:Extract|Replace)Field(WithFallback)?\(\s*[A-Za-z0-9_]+\s*,\s*"
    r"'([^']*)'(?:\s*,\s*'([^']*)')?",
)


def discover_installed_sdk_literals() -> tuple[list[str] | None, str]:
    """Returns (literals or None, note). `literals` is None if no SDK source tree was
    found (belt-and-braces check skipped, not failed); otherwise the full list of
    string-literal field-name arguments found at every stateExtractField/
    stateReplaceField/stateReplaceFieldWithFallback call site (primary AND fallback)."""
    import os

    candidates = []
    env_path = os.environ.get("GSD_SDK_QUERY_SRC")
    if env_path:
        candidates.append(Path(env_path))
    home = Path.home()
    candidates.append(home / "AppData" / "Roaming" / "npm" / "node_modules" / "get-shit-done-cc" / "sdk" / "src" / "query")
    candidates.append(Path("/usr/local/lib/node_modules/get-shit-done-cc/sdk/src/query"))
    candidates.append(Path("/opt/homebrew/lib/node_modules/get-shit-done-cc/sdk/src/query"))

    src_dir = next((c for c in candidates if c.is_dir()), None)
    if src_dir is None:
        return None, "SDK source not found; using pinned 1.42.3 list"

    literals: set[str] = set()
    for filename in ("state.ts", "state-mutation.ts", "state-document.ts"):
        f = src_dir / filename
        if not f.is_file():
            continue
        text = f.read_text(encoding="utf-8", errors="replace")
        for m in CALL_SITE_RE.finditer(text):
            with_fallback, primary, maybe_fallback_name = m.group(1), m.group(2), m.group(3)
            if primary:
                literals.add(primary)
            # Group 3 is only a genuine FALLBACK FIELD NAME when this call site is the
            # WithFallback variant. For a plain stateReplaceField/stateExtractField
            # call, a second quoted literal is the REPLACEMENT VALUE being written
            # (e.g. `stateReplaceField(content, 'Current Plan', '1')`), not a field
            # name, and must not be enrolled as one.
            if with_fallback and maybe_fallback_name:
                literals.add(maybe_fallback_name)

    version = "<unknown>"
    pkg_json = src_dir.parent.parent.parent / "package.json"
    if pkg_json.is_file():
        import json as _json

        try:
            version = _json.loads(pkg_json.read_text(encoding="utf-8")).get("version", "<unknown>")
        except Exception:
            pass

    return sorted(literals), f"SDK source found at {src_dir} (version {version})"


def check_drift() -> list[str]:
    installed, note = discover_installed_sdk_literals()
    print(f"Drift check: {note}")
    if installed is None:
        return []
    pinned_lower = {entry["literal"].lower() for entry in SDK_FIELDS}
    missing = [lit for lit in installed if lit.lower() not in pinned_lower]
    if missing:
        return [
            f"installed SDK uses field literal(s) not in SDK_FIELDS (case-insensitively): "
            f"{missing} -- re-derive SDK_FIELDS from the installed source (see module docstring)"
        ]
    return []


# ---------------------------------------------------------------------------
# Self-test
# ---------------------------------------------------------------------------

MINIMAL_VALID_DOCUMENT = (
    "---\n"
    "gsd_state_version: 1.0\n"
    "status: executing\n"
    "stopped_at: 'x'\n"
    "last_activity: 'x'\n"
    "last_updated: '2026-09-24T00:00:00.000Z'\n"
    "progress:\n"
    "  percent: 50\n"
    "---\n"
    "\n"
    "# Project State\n"
    "\n"
    "## Current Position\n"
    "\n"
    "Phase: 46 (windows-single-instance-guard) — EXECUTING\n"
    "Plan: 7 of 7 — description\n"
    "Status: Executing Phase 46\n"
    "Last activity: 2026-09-24 -- did a thing\n"
    "Progress: [████████░░] 83%\n"
    "\n"
    "History: pointer text, no field literal at line start.\n"
    "\n"
    "## Other Heading\n"
    "\n"
    "Filler content.\n"
    "\n"
    "## Session Continuity\n"
    "\n"
    "Last session: 2026-09-24T00:00:00.000Z\n"
    "Stopped at: some stop reason\n"
    "Resume file: None\n"
)


def _case_reject(label: str, text: str) -> None:
    passed, problems = check_document(text)
    if passed:
        fail(f"self-test FAILED: {label!r} did NOT reject bad input -- gate vacuous on this check")
    print(f"  self-test OK (REJECT): {label} -- {problems[0]}")


def _case_accept(label: str, text: str) -> None:
    passed, problems = check_document(text)
    if not passed:
        fail(f"self-test FAILED: {label!r} was WRONGLY rejected -- {problems}")
    print(f"  self-test OK (ACCEPT): {label}")


def self_test() -> int:
    case_count = 0

    def reject(label: str, text: str) -> None:
        nonlocal case_count
        case_count += 1
        _case_reject(label, text)

    def accept(label: str, text: str) -> None:
        nonlocal case_count
        case_count += 1
        _case_accept(label, text)

    # Sanity: the minimal valid document passes clean before mutating it into REJECTs.
    accept("minimal compact document shaped like the new STATE.md", MINIMAL_VALID_DOCUMENT)

    # REJECT: a second bold **Status:** in an archived paragraph elsewhere in the body.
    reject(
        "second bold **Status:** in an archived paragraph",
        MINIMAL_VALID_DOCUMENT.replace(
            "Filler content.\n",
            "Filler content quoting `**Status:** SUPERSEDED` from an old banner.\n",
        ),
    )

    # REJECT: a second plain "plan:" (lowercase, proving case-insensitivity) outside
    # Current Position.
    reject(
        "second plain lowercase 'plan:' outside Current Position",
        MINIMAL_VALID_DOCUMENT.replace(
            "Filler content.\n",
            "Filler content.\nplan: some archived value\n",
        ),
    )

    # REJECT: a canonical Last activity: followed by a non-blank continuation line.
    reject(
        "canonical Last activity: followed by a non-blank continuation line",
        MINIMAL_VALID_DOCUMENT.replace(
            "Last activity: 2026-09-24 -- did a thing\n",
            "Last activity: 2026-09-24 -- did a thing\ncontinuation text, not blank\n",
        ),
    )

    # REJECT: a canonical Phase: placed after a ### subheading inside Current Position
    # (the section regex ends there -- "### counts"). NOTE on construction: the section
    # regex's own heading match (`##\s*Current Position\s*\n`) always swallows the FIRST
    # blank-separator newline into group 1 via its greedy `\s*`, so a `###` subheading
    # placed IMMEDIATELY after the heading can never trigger early termination (there is
    # no leftover `\n` for the `(?=\n##)` lookahead to see at that exact position). The
    # trap only bites once there is real intervening content with its OWN trailing `\n`
    # still live inside the lazily-matched group 2 -- hence the intro line below.
    reject(
        "canonical Phase: placed after a ### subheading (section regex ends early)",
        MINIMAL_VALID_DOCUMENT.replace(
            "## Current Position\n\nPhase: 46 (windows-single-instance-guard) — EXECUTING\n",
            "## Current Position\n\nAn intro line before the stray subheading.\n\n"
            "### A stray subheading\n\nPhase: 46 (windows-single-instance-guard) — EXECUTING\n",
        ),
    )

    # REJECT: a missing Resume file:.
    reject(
        "missing Resume file:",
        MINIMAL_VALID_DOCUMENT.replace("Resume file: None\n", ""),
    )

    # REJECT: any Current Plan: line (non-canonical field, required count 0).
    reject(
        "a Current Plan: line present (non-canonical field, required 0)",
        MINIMAL_VALID_DOCUMENT.replace(
            "Filler content.\n",
            "Filler content.\nCurrent Plan: 3\n",
        ),
    )

    # REJECT: a body with zero canonical fields.
    reject(
        "body with zero canonical fields at all",
        "---\ngsd_state_version: 1.0\nstatus: executing\nstopped_at: 'x'\n"
        "last_activity: 'x'\nlast_updated: 'x'\nprogress:\n  percent: 0\n---\n\n"
        "# Project State\n\nJust prose, no canonical fields anywhere.\n",
    )

    # REJECT (scan-level): a missing target FILE. Exercised against check_target_file
    # (the same wrapper the real run uses), not check_document directly -- a missing
    # file is an I/O concern, not a parsing one. Its `GATE FAILED:` message is
    # captured, not printed, so it does not mislead a reader grepping this log for a
    # real failure.
    case_count += 1
    import contextlib
    import io as _io
    import tempfile as _tempfile

    captured = _io.StringIO()
    with _tempfile.TemporaryDirectory() as tmp:
        missing = Path(tmp) / "DOES-NOT-EXIST.md"
        try:
            with contextlib.redirect_stderr(captured):
                check_target_file(missing)
        except SystemExit:
            if "does not exist" not in captured.getvalue():
                fail(
                    "self-test FAILED: a missing target file did not fail via the "
                    f"expected message -- got {captured.getvalue()!r}"
                )
            print(
                "  self-test OK (REJECT): missing target file correctly rejected "
                "(GATE FAILED message captured, not printed)"
            )
        else:
            fail("self-test FAILED: a missing target FILE was reported green")

    # ACCEPT: the minimal document plus a **Current focus:** bold line and a
    # `| Plan: x |` table row -- neither is a match (Current focus is not a tracked
    # literal at all; a table row starting with `|` can never satisfy ^Plan: line-start).
    accept(
        "document with a **Current focus:** bold line and a `| Plan: x |` table row (neither matches)",
        MINIMAL_VALID_DOCUMENT.replace(
            "Filler content.\n",
            "**Current focus:** Phase 46\n\n| id | Plan: x | date |\n|---|---|---|\nFiller content.\n",
        ),
    )

    # ACCEPT: a field literal mid-line (not at line start) -- not a plain match.
    accept(
        "field literal mid-line ('see Status: x'), not a line-start match",
        MINIMAL_VALID_DOCUMENT.replace(
            "Filler content.\n",
            "Filler content -- see Status: x for more.\n",
        ),
    )

    return case_count


# ---------------------------------------------------------------------------
# Anti-vacuity
# ---------------------------------------------------------------------------


def check_target_file(path: Path) -> tuple[bool, list[str]]:
    """I/O wrapper around check_document for one real target file. A missing file is a
    hard failure -- a target this gate cannot even find is not a target it can vouch
    for. Shared by both the self-test's missing-path case and the real run, so the
    missing-file behaviour under test is the SAME code path production uses."""
    if not path.is_file():
        fail(f"target file {path} does not exist -- this gate cannot check what is not there")
    text = path.read_text(encoding="utf-8")
    return check_document(text)


def anti_vacuity(path: Path, case_count: int) -> None:
    if not path.is_file():
        fail(f"target file {path} does not exist -- this gate cannot check what is not there")
    text = path.read_text(encoding="utf-8")
    if strip_frontmatter(text) is None:
        fail(f"target file {path} has no parseable frontmatter block")
    if case_count < MINIMUM_SELF_TEST_CASES:
        fail(
            f"self-test ran only {case_count} case(s), fewer than the pinned minimum "
            f"{MINIMUM_SELF_TEST_CASES} -- a shrinking self-test is itself a vacuity risk"
        )


def main() -> None:
    print("Running self-test...")
    case_count = self_test()
    print(f"\nSelf-test: {case_count} case(s), all correct.\n")

    if "--self-test" in sys.argv:
        print("SELF-TEST OK: every REJECT case rejects for its stated reason, every ACCEPT case is left alone.")
        sys.exit(0)

    positional = [a for a in sys.argv[1:] if not a.startswith("--")]
    target = Path(positional[0]).resolve() if positional else DEFAULT_TARGET

    anti_vacuity(target, case_count)

    drift_problems = check_drift()

    passed, problems = check_target_file(target)

    print(f"\nChecking {target}...")
    if passed and not drift_problems:
        print(f"OK: {target} -- every canonical field matches exactly once, inside its required section.")
        sys.exit(0)

    for p in problems:
        print(f"  PROBLEM: {p}", file=sys.stderr)
    for p in drift_problems:
        print(f"  DRIFT: {p}", file=sys.stderr)

    fail(f"{target} failed the SDK field-anchor check ({len(problems) + len(drift_problems)} problem(s) above)")


if __name__ == "__main__":
    main()
