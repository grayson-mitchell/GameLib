#!/usr/bin/env python3
"""YAML-frontmatter parse gate over `.planning/STATE.md` and `.planning/ROADMAP.md`
(quick task 260911-ayu).

Purpose (read this before "fixing" a future failure the wrong way): `.planning/STATE.md`'s
frontmatter was not valid YAML for weeks. `last_activity` carried 2 raw, unescaped `"` characters
inside a double-quoted scalar, which terminated the scalar early and broke the mapping. Nine
green planning gates, every jest project, and `pnpm codecheck` were all blind to it, because
nothing in the repo had ever actually parsed that block -- it was only ever read as prose. This
gate is that parse. It exists so the *next* malformed frontmatter is caught in CI the day it
lands, not discovered by accident weeks later during an unrelated by-hand edit.

REQUIRED_STATE_KEYS below is the anti-vacuity core of this gate, not a nicety. Without a pinned
key list, the cheapest way to silence a future parse error is to delete the offending field
(`last_activity`) or empty it out (`last_activity: ""`) -- both make the document parse again,
and a gate that only checks "does it parse" would go green over either. Both are covered as
REJECT self-test cases below. NEVER shrink REQUIRED_STATE_KEYS to make a real failure go away;
fix the document instead.

PARSER CHOICE IS DELIBERATE. PyYAML is not installed and this repo has no Python dependency
management to add it to. `js-yaml` **4.1.1** is already resolved at `node_modules/js-yaml`
(declared in `package.json`'s `devDependencies` as `^4.1.1` by this same quick task, pinning
which of the two versions locked in `pnpm-lock.yaml` -- `3.14.2` and `4.1.1` -- hoists to the
root). js-yaml 3.x has different `load()` semantics, so this gate hard-fails, rather than
silently degrading, if the resolved major version is not 4. A hand-rolled YAML subset parser in
Python was considered and rejected: it would check something adjacent to "this file parses"
rather than the property itself, and the whole finding this gate closes is a check that was
adjacent to the truth.

FAILURES ARE LOUD, NEVER SKIPPED: if `node` is not on PATH, if `js-yaml` cannot be resolved, or
if the resolved major version is not 4, this gate FAILS the run -- it does not print a warning
and continue as if nothing needed checking. A gate that quietly skips on a missing dependency is
the exact fail-open shape this task exists to end (see `T-AYU-04` in the authoring plan).

TARGET POLICY: `.planning/STATE.md` is REQUIRED to have frontmatter that parses as a mapping
carrying every key in REQUIRED_STATE_KEYS, with `stopped_at` and `last_activity` additionally
required to be non-empty strings. `.planning/ROADMAP.md` is OPTIONAL -- it currently has no
frontmatter at all, and a gate that silently skips an optional target is itself a fail-open green
check, so its absence is reported by an explicit `NOTE:` line and counted separately in the
summary. "Skipped" must never be mistaken for "checked".

THE SELF-TEST FIXTURE CARRIES REAL HISTORICAL BYTES, HASH-GUARDED. `HISTORICAL_EXCERPT` below is
a 90-byte window sliced out of the actual pre-fix `last_activity` line (extracted
programmatically from git history during this task's planning and authoring, never retyped from
a terminal render). Before any self-test case uses it, its own sha256 is asserted against
`HISTORICAL_EXCERPT_SHA256`. This matters because a rendered dump of this exact region was
independently observed, twice, silently dropping a substring during this task's planning session
-- a fixture corrupted that way must fail this gate loudly (wrong hash) rather than silently test
different bytes than the ones that actually broke the file.

Run `python3 planning-frontmatter-gate.py` (no arguments) for CI mode: self-test first, then walk
the live targets, write nothing. This is the path `meta/runPlanningGates.py` invokes -- discovery
is by `*-gate.py` suffix with no arguments, so the no-argument path has to be the real check. Run
`python3 planning-frontmatter-gate.py --self-test` to run only the self-test.
"""

from __future__ import annotations

import contextlib
import hashlib
import io
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# Resolved from __file__, NEVER from cwd: `meta/runPlanningGates.py` runs each gate with the
# gate's own directory as cwd, but a human runs it from the repo root. __file__ is correct under
# both. Asserted explicitly (not just implied by the constant below) so that repointing this gate
# at a different directory is a deliberate, visible edit and not a one-word slip.
PLANNING_DIR = Path(__file__).resolve().parent
assert PLANNING_DIR.name == ".planning", (
    "PLANNING_DIR must resolve to exactly the repo's .planning/ directory -- repointing this "
    "gate elsewhere must be a deliberate, visible edit, not a typo"
)

# (relative-to-PLANNING_DIR path, required: bool). STATE.md is required; ROADMAP.md is optional
# (see docstring, D-AYU-04 in the authoring plan). This table is the single source of truth for
# what the live walk checks -- widening it is how a future session adds a third target.
TARGETS: tuple[tuple[str, bool], ...] = (
    ("STATE.md", True),
    ("ROADMAP.md", False),
)

# The anti-vacuity core (see docstring). Deleting a key from this list to make a real failure go
# away defeats the entire purpose of this gate -- fix the document, not the check.
REQUIRED_STATE_KEYS: tuple[str, ...] = (
    "gsd_state_version",
    "status",
    "stopped_at",
    "last_activity",
    "last_updated",
    "progress",
)
# Of REQUIRED_STATE_KEYS, these two are additionally required to be non-empty strings -- they are
# the narrative fields a future by-hand append is most likely to corrupt or delete.
NON_EMPTY_STRING_KEYS: tuple[str, ...] = ("stopped_at", "last_activity")

FENCE = "---"

# 90-byte window sliced from the REAL pre-fix `last_activity` line (file line 8 of
# `.planning/STATE.md` before quick task 260911-ayu, commit 712a7b31d), centered on the second of
# its two raw unescaped double quotes. Extracted programmatically; see docstring for why it is
# hash-guarded before use.
HISTORICAL_EXCERPT = 'terion 3: the arm64 leg concluded failure at "Build the three onedir runners"; x64 never d'
HISTORICAL_EXCERPT_SHA256 = "013b12366fdb0eb74fe955da8e76b3d97d9a9b811aa8bccf2e18027fc11087fb"

# Invoked via `subprocess.run([node, "-e", NODE_YAML_PARSE_JS], input=<frontmatter text>,
# capture_output=True, text=True)` -- argv list, no shell, frontmatter text on stdin, one JSON
# object on stdout. Taking the document on stdin (rather than as an argv string or a temp file)
# is what lets the self-test's synthetic documents go through the exact same parse path as the
# real target files -- there is no separate "test mode" in the parser itself.
NODE_YAML_PARSE_JS = r"""
const y = require("js-yaml");
let s = "";
process.stdin.on("data", d => { s += d; });
process.stdin.on("end", () => {
  let version = "<unresolved>";
  try {
    version = require("js-yaml/package.json").version;
  } catch (e) {
    process.stdout.write(JSON.stringify({ resolved: false, error: String(e && e.message || e) }));
    return;
  }
  const out = { resolved: true, version };
  try {
    out.ok = true;
    out.value = y.load(s);
  } catch (e) {
    out.ok = false;
    out.error = e.message;
  }
  process.stdout.write(JSON.stringify(out));
});
"""


def fail(message: str) -> None:
    print(f"GATE FAILED: {message}", file=sys.stderr)
    sys.exit(1)


def find_node() -> str:
    """Loud failure, never a skip, if node is not on PATH (D-AYU-02, T-AYU-04)."""
    node = shutil.which("node")
    if node is None:
        fail(
            "`node` is not on PATH -- this gate requires node to invoke js-yaml. A gate that "
            "skips its check because a dependency is missing is exactly the fail-open shape "
            "this gate exists to end."
        )
    return node  # unreachable after fail(), but keeps type-checkers honest


def run_parser(node: str, frontmatter_text: str) -> dict:
    """Invoke the node/js-yaml helper on one block of frontmatter text. Loud failure, never a
    skip, if js-yaml is unresolvable or resolves to a major version other than 4 (D-AYU-02,
    T-AYU-01, T-AYU-04). Returns the parsed JSON dict on any other outcome (including a YAML
    parse error, which is a normal, expected result this function must be able to return)."""
    result = subprocess.run(
        [node, "-e", NODE_YAML_PARSE_JS],
        input=frontmatter_text,
        capture_output=True,
        text=True,
    )
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        fail(
            "the node/js-yaml helper did not emit parseable JSON -- this is an infrastructure "
            f"failure, not a YAML parse error. stdout={result.stdout!r} stderr={result.stderr!r}"
        )
        return {}  # unreachable

    if not data.get("resolved"):
        fail(
            "js-yaml is not resolvable from node -- this gate requires it. Check the `js-yaml` "
            "entry in package.json's devDependencies (should be `^4.1.1`) and re-run "
            f"`pnpm install`. Underlying error: {data.get('error')}"
        )

    version = data.get("version", "")
    major = version.split(".")[0] if version else ""
    if major != "4":
        fail(
            f"js-yaml resolved to version {version or '<unknown>'} (major {major or '?'}), not "
            "4.x. This gate requires js-yaml 4's `load()` semantics -- 3.x behaves differently "
            "and this gate must not silently run against it. Check the `js-yaml` entry in "
            "package.json's devDependencies (should be `^4.1.1`) and re-run `pnpm install`."
        )
    return data


def extract_frontmatter(text: str) -> str | None:
    """Return the raw text BETWEEN the opening `---` fence and the NEXT `---` fence, or None if
    the document has no well-formed frontmatter block. A `---` occurring later in the BODY (a
    markdown horizontal rule) must not re-open or extend the block -- only the first two fences
    delimit frontmatter. An unterminated block (opening fence, no closing fence before EOF) is
    NOT a frontmatter block. Pure: no I/O, usable against both real files and self-test strings.
    """
    lines = text.split("\n")
    if not lines or lines[0].strip() != FENCE:
        return None
    for i, line in enumerate(lines[1:], start=1):
        if line.strip() == FENCE:
            return "\n".join(lines[1:i])
    return None


def check_required_keys(value: dict) -> list[str]:
    """Pure function: given an already-parsed mapping, return every anti-vacuity problem found
    ([] if clean). Reports every problem in one pass rather than stopping at the first."""
    problems: list[str] = []
    for key in REQUIRED_STATE_KEYS:
        if key not in value:
            problems.append(f"missing required key `{key}`")
    for key in NON_EMPTY_STRING_KEYS:
        if key in value:
            v = value[key]
            if not isinstance(v, str) or v.strip() == "":
                problems.append(f"`{key}` must be a non-empty string, got {v!r}")
    return problems


def check_document(text: str, required: bool, node: str, label: str) -> tuple[bool, str]:
    """Pure except for the injected `run_parser` call. The SAME function is used against every
    real target file and every self-test document -- never a reimplementation. Returns (passed,
    one-line report message)."""
    fm = extract_frontmatter(text)
    if fm is None:
        if required:
            return False, f"{label} — REQUIRED target has NO frontmatter block"
        return (
            True,
            f"NOTE: {label} — NO frontmatter block (optional target, nothing parsed).",
        )

    data = run_parser(node, fm)
    if not data.get("ok"):
        return False, f"{label} — frontmatter does NOT parse: {data.get('error')}"

    value = data.get("value")
    if not isinstance(value, dict):
        return (
            False,
            f"{label} — frontmatter parsed but is NOT a mapping (got a "
            f"{type(value).__name__ if value is not None else 'null/empty document'})",
        )

    fm_line_count = len(fm.split("\n"))
    if not required:
        return (
            True,
            f"OK: {label} — frontmatter ({fm_line_count} lines) parses as a mapping with "
            f"{len(value)} key(s).",
        )

    problems = check_required_keys(value)
    if problems:
        return False, f"{label} — frontmatter parses, but: " + "; ".join(problems)

    stopped_at_len = len(value["stopped_at"])
    last_activity_len = len(value["last_activity"])
    return (
        True,
        f"OK: {label} — frontmatter ({fm_line_count} lines) parses as a mapping with "
        f"{len(value)} keys; all {len(REQUIRED_STATE_KEYS)} required keys present; "
        f"stopped_at {stopped_at_len} chars, last_activity {last_activity_len} chars.",
    )


# ---------------------------------------------------------------------------
# Self-test. Every case is discharged through check_document / extract_frontmatter, the SAME
# functions used against the real tree, never a reimplementation.
# ---------------------------------------------------------------------------

VALID_STATE_DOCUMENT = (
    "---\n"
    "gsd_state_version: 1\n"
    "status: ACTIVE\n"
    'stopped_at: |-\n'
    '  a plain narrative sentence with a raw "quote" inside it, no escaping needed\n'
    'last_activity: |-\n'
    f'  {HISTORICAL_EXCERPT}\n'
    "last_updated: 2026-09-11\n"
    "progress:\n"
    "  total_phases: 39\n"
    "  current_phase: 43\n"
    "---\n"
    "\n"
    "# Body\n"
)


def _case_reject(label: str, text: str, required: bool, node: str) -> None:
    passed, message = check_document(text, required, node, label="<self-test>")
    if passed:
        fail(f"self-test FAILED: {label} did NOT reject bad input -- gate vacuous on this check")
    print(f"  self-test OK: {label} correctly rejected ({message})")


def _case_accept(label: str, text: str, required: bool, node: str) -> None:
    passed, message = check_document(text, required, node, label="<self-test>")
    if not passed:
        fail(
            f"self-test FAILED: {label} was WRONGLY rejected ({message!r}) -- gate convicts "
            "correct input"
        )
    print(f"  self-test OK: {label} correctly accepted ({message})")


def self_test() -> None:
    node = find_node()

    assert hashlib.sha256(HISTORICAL_EXCERPT.encode("utf-8")).hexdigest() == (
        HISTORICAL_EXCERPT_SHA256
    ), (
        "HISTORICAL_EXCERPT does not match its pinned sha256 -- a rendered dump of this exact "
        "region was observed, twice, silently dropping a substring during this gate's own "
        "authoring session. Re-extract the fixture from git history; do not retype it by hand."
    )
    print("  self-test OK: HISTORICAL_EXCERPT matches its pinned sha256 (fixture not corrupted)")

    case_count = 1  # the hash assertion above counts as case 1

    def reject(label: str, text: str, required: bool = True) -> None:
        nonlocal case_count
        case_count += 1
        _case_reject(label, text, required, node)

    def accept(label: str, text: str, required: bool = True) -> None:
        nonlocal case_count
        case_count += 1
        _case_accept(label, text, required, node)

    # Sanity: the base document must pass clean before it is mutated into bad input below.
    accept("sanity (base valid STATE-shaped document)", VALID_STATE_DOCUMENT)

    # Case: the REAL historical defect, real bytes -- a raw-quoted scalar carrying the exact
    # excerpt that broke STATE.md for weeks.
    reject(
        "the real historical defect: raw quotes inside a double-quoted last_activity scalar",
        VALID_STATE_DOCUMENT.replace(
            f'last_activity: |-\n  {HISTORICAL_EXCERPT}\n',
            f'last_activity: "{HISTORICAL_EXCERPT}"\n',
        ),
    )

    # Case: a minimal synthetic raw-quote scalar, human-readable, exercising the same parser rule
    # without depending on the historical fixture.
    reject(
        "minimal synthetic raw-quote scalar",
        '---\ngsd_state_version: 1\nstatus: ACTIVE\n'
        'stopped_at: "clean"\n'
        'last_activity: "a "b" c"\n'
        'last_updated: 2026-09-11\nprogress:\n  total_phases: 39\n---\n',
    )

    # Case: the NEW trap D-AYU-01's `|-` form introduces -- a continuation line un-indented back
    # to column 0. Must be covered from day one, not discovered the way the original defect was.
    reject(
        "|- block scalar with an un-indented (column-0) continuation line",
        "---\ngsd_state_version: 1\nstatus: ACTIVE\n"
        "stopped_at: |-\nnot indented\n"
        'last_activity: "clean"\n'
        "last_updated: 2026-09-11\nprogress:\n  total_phases: 39\n---\n",
    )

    # Case: duplicate top-level key (js-yaml 4 throws on this natively, M-10).
    reject(
        "duplicate top-level key",
        "---\ngsd_state_version: 1\ngsd_state_version: 2\nstatus: ACTIVE\n"
        'stopped_at: "clean"\nlast_activity: "clean"\n'
        "last_updated: 2026-09-11\nprogress:\n  total_phases: 39\n---\n",
    )

    # Case: tab-indented mapping entry (YAML forbids tabs for indentation).
    reject(
        "tab-indented mapping entry",
        "---\ngsd_state_version: 1\nstatus:\n\tACTIVE: true\n"
        'stopped_at: "clean"\nlast_activity: "clean"\n'
        "last_updated: 2026-09-11\nprogress:\n  total_phases: 39\n---\n",
    )

    # Case: frontmatter that parses cleanly but is not a mapping at all (a bare list).
    reject(
        "frontmatter that parses but is not a mapping (bare list)",
        "---\n- one\n- two\n- three\n---\n",
    )

    # Case: the fix-by-deletion control -- a STATE-shaped document with `last_activity` removed
    # entirely. This is the cheapest way a future session could make a parse error "go away", and
    # it must still fail.
    reject(
        "STATE-shaped document with `last_activity` deleted entirely",
        "---\ngsd_state_version: 1\nstatus: ACTIVE\n"
        'stopped_at: "clean"\n'
        "last_updated: 2026-09-11\nprogress:\n  total_phases: 39\n---\n",
    )

    # Case: the fix-by-emptying control -- `last_activity: ""`. Parses fine as YAML; must still
    # fail because the anti-vacuity key check requires a non-empty string.
    reject(
        "STATE-shaped document with `last_activity: \"\"` (emptied, not deleted)",
        "---\ngsd_state_version: 1\nstatus: ACTIVE\n"
        'stopped_at: "clean"\nlast_activity: ""\n'
        "last_updated: 2026-09-11\nprogress:\n  total_phases: 39\n---\n",
    )

    # Case: the positive control for the whole fix -- a valid STATE-shaped document carrying
    # BOTH narrative fields as `|-` blocks with raw `"` inside them, no escaping.
    accept(
        "valid STATE-shaped document, both narrative fields as |- blocks with raw quotes inside",
        VALID_STATE_DOCUMENT,
    )

    # Case: a document with NO frontmatter at all, target OPTIONAL (ROADMAP.md's real shape).
    accept(
        "document with no frontmatter block at all, optional target",
        "# ROADMAP\n\nJust prose, no frontmatter.\n",
        required=False,
    )

    # Case (scan-level): a missing target FILE. Exercised against check_document's caller
    # (check_target_file below), not check_document directly -- the missing-file case is an I/O
    # concern, not a parsing one. Its `GATE FAILED:` message is captured, not printed, so a
    # literal "GATE FAILED:" line does not appear in an otherwise-passing self-test run and
    # mislead the next reader who greps the log.
    case_count += 1
    captured = io.StringIO()
    with tempfile.TemporaryDirectory() as tmp:
        missing = Path(tmp) / "DOES-NOT-EXIST.md"
        try:
            with contextlib.redirect_stderr(captured):
                check_target_file(missing, required=True, node=node)
        except SystemExit:
            if "does not exist" not in captured.getvalue():
                fail(
                    "self-test FAILED: a missing target file did not fail via the expected "
                    f"message -- got {captured.getvalue()!r}"
                )
            print(
                "  self-test OK: missing target file correctly rejected "
                "(its GATE FAILED message captured, not printed)"
            )
        else:
            fail("self-test FAILED: a missing target FILE was reported green")

    print(
        f"\nAll REQUIRED_STATE_KEYS proved capable of catching deletion, `last_activity` proved "
        "incapable of being silenced by emptying, the historical defect and a synthetic "
        "equivalent both proved rejectable, the new |- un-indentation trap is covered, and the "
        f"positive control (both fields as |- blocks with raw quotes) is correctly accepted "
        f"({case_count} self-test case(s) total)."
    )


def check_target_file(path: Path, required: bool, node: str) -> tuple[bool, str]:
    """I/O wrapper around check_document for one real target file. A missing file is a hard
    failure regardless of whether the target is 'required' in the frontmatter sense -- a target
    this gate cannot even find is not a target this gate can vouch for."""
    if not path.is_file():
        fail(f"target file {path} does not exist -- this gate cannot check what is not there")
    text = path.read_text(encoding="utf-8")
    return check_document(text, required, node, label=str(path))


def main() -> None:
    self_test()
    if "--self-test" in sys.argv:
        print(
            "\nSELF-TEST OK: every REJECT case rejects for its stated reason, every ACCEPT case "
            "is left alone."
        )
        sys.exit(0)

    node = find_node()

    results: list[tuple[bool, str]] = []
    for rel, required in TARGETS:
        path = PLANNING_DIR / rel
        results.append(check_target_file(path, required, node))

    for _, message in results:
        print(message)

    checked = sum(1 for _, m in results if m.startswith("OK:"))
    no_frontmatter = sum(1 for _, m in results if m.startswith("NOTE:"))
    failed = [m for ok, m in results if not ok]

    print(
        f"\n{checked} target(s) checked and parsed, {no_frontmatter} target(s) had no "
        f"frontmatter block (optional, reported by name above -- 'skipped' is not 'checked'), "
        f"{len(failed)} target(s) failed."
    )

    if failed:
        fail("frontmatter check failed for: " + " | ".join(failed))

    sys.exit(0)


if __name__ == "__main__":
    main()
