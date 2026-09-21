#!/usr/bin/env python3
"""Trailing orphan envelope-tag gate (quick task 260922-7pv).

WHAT THE ARTIFACT IS. An agent's own tool-call envelope -- the XML-style wrapper Claude Code
uses around file-write content and tool invocations -- occasionally leaks its raw closing tags
straight into the file body it was writing, as the file's LAST line(s). Split spelling used
throughout this file and its self-test, on purpose (see "SPLIT LITERALS" below): the tag is
written as two adjacent code spans in prose, `` `</content` `` then `` `>` ``, and built by
string concatenation everywhere in code. It is inert -- nothing under `.planning/` ever reads
it -- but it is a recurring authoring defect, not a one-off typo: measured at HEAD `aac7e933b`,
33 distinct commits spanning 78 days (2026-07-05 to 2026-09-21) introduced it into 43 git-tracked
`.planning/**/*.md` files.

THE DECISION TO GATE WAS TAKEN DELIBERATELY BY THE OPERATOR, not defaulted into. The todo that
first surfaced this (`.planning/todos/completed/2026-09-21-agents-emit-a-stray-trailing-closing-
tag-into-todo-bodies.md`) explicitly left "should a gate exist at all" open, citing this repo's
own precedent that a gate is a separate, deliberate decision and not an automatic response to a
defect. The operator has since decided: gate AND sweep. This file is that gate.

THE ~800-FILE FALSE POSITIVE THAT WOULD KILL THIS GATE IF MATCHED. Nearly every GSD-authored
planning document legitimately ENDS in a bare closing `output` tag -- the plan template's own
`<output>` block, opened earlier in the same file. Measured at the same HEAD: 800 git-tracked
`.planning/**/*.md` files end in a paired bare closing `output` tag (878 contain an opening one
somewhere). A gate that flagged that shape would convict 800 correct files on its first run, and
a gate that convicts hundreds of correct files gets deleted within the day, not fixed -- this
repo has recorded that exact failure mode more than once. The discriminating predicate below
is therefore never "ends in a bare closing tag"; it is "ends in a bare closing tag whose NAME is
in a narrow envelope set, AND has no matching opening tag anywhere earlier in the file." Ordinary
GSD template tags (`output`, `success_criteria`, `objective`, and everything else) are never in
that set, paired or not, and must never be added to it.

> The brief that reached the authoring session for this gate said 831 files ended in a bare
> closing `output` tag; the measuring session re-derived it and got 800, over the same
> git-tracked `.planning/**/*.md` scope. The two figures were never a genuine disagreement
> between two sources -- they were two different populations counted from the SAME scan (831
> counts every tag name with a matching opener as the last line; 800 counts `output` alone).
> Recorded here so a future reader does not treat 831 as an unresolved conflict and re-derive it
> a third time.

NO EXEMPTION LEDGER. NOT NOW, NOT LATER. Every other repo-native gate that faced this exact
problem (a legitimate, high-volume shape that must not be convicted) picked one of two fixes:
narrow the predicate so the false-positive shape structurally cannot match, or maintain a
ledger of exemptions. The envelope-set-plus-no-opening-tag predicate here is the first kind. A
ledger would reintroduce exactly the maintenance burden the predicate was designed to avoid, for
no benefit: the absence of an opening tag is what makes the artifact recognizable as an artifact
in the first place, and no legitimate use of `<content>` or `<invoke>` in a planning document
ends the file with an unpaired closing tag. If this gate ever needs an exemption to pass, the
right fix is almost certainly to delete the stray tag from the offending file, not to widen this
gate.

THE KNOWN BLIND SPOT, STATED HONESTLY. The "no opening tag anywhere earlier" clause is not
vacuous -- two git-tracked files (`260921-pvt`'s own PLAN and SUMMARY, which discuss this exact
artifact) legitimately OPEN a bare `content` tag and close it correctly at the end; the pairing
clause is what keeps them out of this gate's findings, and an accept-side self-test case pins it.
But that same clause has a blind spot: a file that legitimately opens a `content` tag in prose
AND separately carries a genuine trailing orphan run would be MISSED, because the opening tag
(anywhere in the file) is enough to mark the closing one as "paired," even if the actual orphan
tag is a different, later occurrence of the same name. Measured at HEAD `aac7e933b`: that masked
set is EMPTY -- neither `260921-pvt` file carries a trailing orphan run. This is recorded as an
honest limit, not papered over with an exemption ledger, per the instruction above.

WHEN THIS GATE FAILS, THE CORRECT ACTION IS TO DELETE THE STRAY TAG FROM THE FILE. It is never
correct to widen `ENVELOPE_TAGS` to admit a tag name that should not be there, and never correct
to add an exemption ledger entry. Both moves would recreate the maintenance burden this gate's
design was chosen specifically to avoid.

SPLIT LITERALS, BOTH HALVES OF THE TRAP. Every joined tag-punctuation literal for the two
envelope names -- the open and close shapes of `` `content` `` and `` `invoke` ``, written here
as `` `</content` `` + `` `>` `` and `` `</invoke` `` + `` `>` `` rather than joined up -- is
built by string concatenation from parts, in this module AND in its self-test fixtures -- never
typed as a contiguous string literal. Two reasons, stated once: (1) self-conviction -- this gate's own
source lives under `.planning/`, and the moment its corpus widens to `.py` a joined literal in
this very docstring would convict this file; (2) grep poisoning -- every future census of this
artifact is a grep, and prose that spells the literal is indistinguishable from the artifact
itself. The bare WORDS `content` and `invoke` are ordinary English and are written plainly
throughout this file; it is only the punctuated tag shapes that are never joined.

Run `python3 planning-envelope-tag-gate.py` (no arguments) for CI mode: self-test first, then
walk the live tree, write nothing. This IS the path `meta/runPlanningGates.py` invokes --
discovery is by `-gate.py` suffix with no arguments, so the no-argument path has to be the real
check. Run `python3 planning-envelope-tag-gate.py --self-test` to run only the self-test. There
is no `--write` flag: this gate produces no committed artifact to regenerate, the same shape as
`uat-visibility-gate.py` and `todo-frontmatter-gate.py`.
"""

from __future__ import annotations

import contextlib
import io
import re
import subprocess
import sys
import tempfile
from pathlib import Path

# Resolved from __file__, NEVER from cwd: `meta/runPlanningGates.py` runs each gate with the
# gate's own directory as cwd, but a human runs it from the repo root. __file__ is correct under
# both. Asserted explicitly so that repointing this gate elsewhere is a deliberate, visible edit.
PLANNING_DIR = Path(__file__).resolve().parent
assert PLANNING_DIR.name == ".planning", (
    "PLANNING_DIR must resolve to exactly the repo's .planning/ directory -- repointing this "
    "gate elsewhere must be a deliberate, visible edit, not a typo"
)
REPO_ROOT = PLANNING_DIR.parent

# The envelope set is closed and narrow BY DESIGN (see docstring). Widening it is a separate,
# deliberate decision -- never a fix reached for because this gate is red.
ENVELOPE_TAGS: frozenset[str] = frozenset({"content", "invoke"})

# A line that is, in its entirety, a bare closing tag: optional surrounding horizontal
# whitespace, `<`, optional whitespace, `/`, optional whitespace, a tag name, optional
# whitespace, `>`, optional trailing horizontal whitespace, end of line.
_CLOSING_TAG_LINE = re.compile(r"^[ \t]*<[ \t]*/[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*>[ \t]*$")


def _open_tag(name: str) -> str:
    """Build `<name>` from parts. See "SPLIT LITERALS" in the module docstring."""
    return "<" + name + ">"


def _close_tag(name: str) -> str:
    """Build `</name>` from parts. See "SPLIT LITERALS" in the module docstring."""
    return "<" + "/" + name + ">"


def _has_opening_tag(lines: list[str], name: str, before_index: int) -> bool:
    """True if an opening tag for `name` appears anywhere strictly before line `before_index`
    (0-based index into `lines`). Matches `<name>`, `<name attr="x">`, and a multi-line opening
    tag's first line (`<name`) -- but NOT `<nameX>` or `<name_other>`, via a negative lookahead
    on the character immediately following the name, so `<content>` never falsely pairs a
    trailing `</contentX>` or vice versa."""
    pattern = re.compile(r"<[ \t]*" + re.escape(name) + r"(?![A-Za-z0-9_])")
    return bool(pattern.search("\n".join(lines[:before_index])))


def trailing_closing_tags(text: str) -> list[tuple[int, str, bool]]:
    """THE single pure function this gate is built on. No I/O. Given one document's raw text,
    return `(line_index, tag_name, is_paired)` for every line in the file's MAXIMAL TRAILING run
    of bare-closing-tag-only lines, top-to-bottom, after stripping trailing blank lines.
    `line_index` is 0-based into `text.split("\\n")`. `is_paired` is True iff an opening tag for
    that name exists anywhere earlier in the file.

    Algorithm, from the authoring plan:
      1. Strip trailing blank lines.
      2. Take the maximal trailing run of lines that are, in their entirety, a bare closing tag.
      3. For each tag in that run, determine whether it is paired (opening tag exists earlier).

    Shared verbatim by the live gate walk below, every self-test case, and the sweep script in
    the companion quick task's task 2 -- never reimplemented, because a reimplementation that
    ever disagrees with this one would silently edit the wrong lines.
    """
    lines = text.split("\n")
    trimmed = list(lines)
    while trimmed and trimmed[-1].strip() == "":
        trimmed.pop()

    run: list[tuple[int, str]] = []  # (index into trimmed, tag name), top-to-bottom
    i = len(trimmed) - 1
    while i >= 0:
        match = _CLOSING_TAG_LINE.match(trimmed[i])
        if not match:
            break
        run.append((i, match.group(1)))
        i -= 1
    run.reverse()

    return [(idx, name, _has_opening_tag(trimmed, name, idx)) for idx, name in run]


def orphan_tag_lines(text: str) -> list[int]:
    """0-based line indices (into `text.split("\\n")`) that must be deleted: every tag in the
    trailing closing-tag run whose name is in `ENVELOPE_TAGS` and is NOT paired. Empty list means
    the file is clean -- either it has no trailing closing-tag run at all, every tag in that run
    is genuinely paired (the ~800-file `</output>` case), or every tag in that run is outside the
    narrow envelope set (`success_criteria`, or any other GSD-template tag, paired or not)."""
    return [
        idx
        for idx, name, paired in trailing_closing_tags(text)
        if name in ENVELOPE_TAGS and not paired
    ]


def ends_in_paired_closing_tag(text: str) -> bool:
    """True iff the trailing closing-tag run contains at least one genuinely paired tag. Used
    only for the corpus-wide anti-vacuity tripwire in `scan()`: zero such files corpus-wide means
    the trailing-run detector has stopped engaging with these documents at all, which is upstream
    drift or a corpus change, never a pass."""
    return any(paired for _, _, paired in trailing_closing_tags(text))


def fail(message: str) -> None:
    print(f"GATE FAILED: {message}", file=sys.stderr)
    sys.exit(1)


def discover(repo_root: Path, planning_dir: Path) -> list[Path]:
    """Git-tracked `*.md` files under `.planning/`, resolved via `git -C <repo_root> ls-files` --
    NOT a filesystem walk, so untracked scratch files are out of scope. `repo_root` is passed to
    git EXPLICITLY rather than relying on cwd, because `meta/runPlanningGates.py` invokes each
    gate with the gate's own directory as cwd while a human runs it from the repo root."""
    rel = planning_dir.relative_to(repo_root).as_posix()
    result = subprocess.run(
        ["git", "-C", str(repo_root), "ls-files", "--", rel],
        capture_output=True,
        text=True,
        check=True,
    )
    return sorted(repo_root / p for p in result.stdout.splitlines() if p.endswith(".md"))


def scan(repo_root: Path, planning_dir: Path) -> None:
    """CI-mode walk. Collects findings across ALL files and fails once with the complete list --
    the walk never stops at the first finding, because fixing a 43-file population one CI run at
    a time is how it never gets fixed."""
    paths = discover(repo_root, planning_dir)

    # Anti-vacuity, half one: a corpus that globs to nothing means the tree moved and this gate
    # is silently checking nothing.
    if not paths:
        fail(
            f"discovered ZERO git-tracked .md file(s) under {planning_dir} -- the tree moved, "
            "or discovery stopped matching. A gate that finds nothing must fail, not pass."
        )

    offenders: list[tuple[str, int]] = []
    paired_count = 0
    for path in paths:
        text = path.read_text(encoding="utf-8")
        orphans = orphan_tag_lines(text)
        if orphans:
            offenders.append((path.relative_to(repo_root).as_posix(), len(orphans)))
        if ends_in_paired_closing_tag(text):
            paired_count += 1

    # Anti-vacuity, half two: zero files corpus-wide ending in a genuinely paired closing tag
    # means the trailing-run detector has stopped engaging with these documents entirely. Pinned
    # as `> 0` and printed, never as the measured figure, which would be red within the week as
    # the corpus grows.
    if paired_count == 0:
        fail(
            f"ZERO of {len(paths)} git-tracked .md file(s) under {planning_dir} end in a "
            "genuinely paired bare closing tag (the ~800-file `</output>` shape) -- the "
            "trailing-run detector has stopped engaging with these documents at all. That is "
            "upstream drift or a corpus change, not a pass."
        )

    if offenders:
        detail = "\n  ".join(f"{rel} ({n} line(s))" for rel, n in offenders)
        fail(
            f"{len(offenders)} file(s) carry a trailing orphan envelope-tag run:\n"
            f"  {detail}\n\n"
            "THE CORRECT ACTION IS TO DELETE THE STRAY TAG(S) FROM THE FILE -- and nothing "
            "else. Never widen ENVELOPE_TAGS to admit a name that should not be there, and never "
            "add an exemption ledger: the discriminating shape (a bare closing tag alone on its "
            "line, in the file's trailing run, whose name is in the envelope set, with no "
            "opening tag anywhere earlier) is chosen precisely because prose describing the "
            "artifact never ends a file that way. See this gate's docstring."
        )

    print(
        f"OK: {len(paths)} git-tracked .md file(s) under {planning_dir}, {paired_count} ending "
        "in a genuinely paired bare closing tag, 0 carrying a trailing orphan envelope-tag run."
    )


# ---------------------------------------------------------------------------
# Self-test. Every case is discharged through trailing_closing_tags / orphan_tag_lines / scan --
# the SAME functions used against the real tree, never a reimplementation.
# ---------------------------------------------------------------------------

# The dominant real-world shape: a genuinely paired `<output>...</output>` block, exactly like
# the GSD plan template's own trailing block. This is simultaneously the sanity fixture and the
# ~800-file accept-side control.
BASE_DOC = (
    "---\n"
    "phase: 99\n"
    "plan: 01\n"
    "---\n"
    "\n"
    "<objective>\n"
    "Do the thing described in this plan.\n"
    "</objective>\n"
    "\n"
    "<output>\n"
    "Create SUMMARY.md when done.\n"
    "</output>\n"
)


def _mutate(base: str, old: str, new: str, why: str) -> str:
    """Route every mutation of BASE_DOC through here. If the document's shape changes and an
    anchor is left stale, `str.replace()` silently no-ops and hands a REJECT case an UNMUTATED,
    still-valid document -- a real check quietly turned vacuous. Fails loudly in both failure
    modes (anchor missed; replacement produced no change). Modelled on
    `uat-visibility-gate.py`'s `mutate()`."""
    if old not in base:
        fail(f"_mutate() anchor missed ({why}): {old!r} was not found in the base document")
    result = base.replace(old, new, 1)
    if result == base:
        fail(f"_mutate() produced no change ({why}) -- `old` and `new` were identical")
    return result


def _expect_reject(label: str, text: str) -> None:
    orphans = orphan_tag_lines(text)
    if not orphans:
        fail(f"self-test FAILED: {label} did NOT reject bad input -- gate vacuous on this check")
    print(f"  self-test OK: {label} correctly flagged ({len(orphans)} orphan line(s))")


def _expect_accept(label: str, text: str) -> None:
    orphans = orphan_tag_lines(text)
    if orphans:
        fail(
            f"self-test FAILED: {label} was WRONGLY flagged ({len(orphans)} orphan line(s)) -- "
            "the gate convicts correct input"
        )
    print(f"  self-test OK: {label} correctly left alone")


def _write_corpus(root: Path, files: dict[str, str]) -> None:
    """Write FILES under `root` (a `.planning` dir inside a fresh git repo) and stage them, so
    `git ls-files` -- the real discovery mechanism -- sees them without needing a commit."""
    repo_root = root.parent
    repo_root.mkdir(parents=True, exist_ok=True)
    subprocess.run(["git", "init", "-q"], cwd=repo_root, check=True)
    for rel, text in files.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")
    subprocess.run(["git", "add", "-A"], cwd=repo_root, check=True)


def _expect_scan_fails(label: str, repo_root: Path, planning_dir: Path, needle: str) -> None:
    """Exercise the REAL scan() against a real temp git repo and require it to exit non-zero with
    the expected reason. Its `GATE FAILED:` output is CAPTURED, not printed: a literal
    `GATE FAILED:` line emitted during a PASSING run is a misleading-output defect in its own
    right. Both reference gates do exactly this. The captured text is asserted non-empty, so
    suppressing it cannot hollow out the check."""
    captured = io.StringIO()
    try:
        with contextlib.redirect_stderr(captured), contextlib.redirect_stdout(io.StringIO()):
            scan(repo_root, planning_dir)
    except SystemExit:
        text = captured.getvalue()
        if not text:
            fail(f"self-test FAILED: {label} exited non-zero but printed nothing to stderr")
        if needle not in text:
            fail(
                f"self-test FAILED: {label} exited non-zero but not for the expected reason "
                f"(looking for {needle!r}) -- got {text!r}"
            )
        print(f"  self-test OK: {label} correctly failed the scan")
    else:
        fail(f"self-test FAILED: {label} was reported GREEN -- the check is vacuous")


def _expect_scan_passes(label: str, repo_root: Path, planning_dir: Path) -> None:
    captured_err = io.StringIO()
    try:
        with contextlib.redirect_stderr(captured_err), contextlib.redirect_stdout(io.StringIO()):
            scan(repo_root, planning_dir)
    except SystemExit:
        fail(
            f"self-test FAILED: {label} was WRONGLY failed by the scan "
            f"({captured_err.getvalue()!r})"
        )
    print(f"  self-test OK: {label} correctly passed the scan")


def self_test() -> None:
    case_count = 0

    # Sanity: the base fixture must pass clean before it is mutated into bad input. Without this,
    # every "correctly flagged" below could be firing for an unrelated reason.
    _expect_accept("sanity (base fixture: a genuinely paired <output> block)", BASE_DOC)
    print("  self-test base fixture: 0 orphan lines (sanity check OK)")

    # --- REJECT side: the shapes an orphan envelope tag actually takes -----------------------

    case_count += 1
    _expect_reject(
        "a trailing orphan closing content tag, no envelope tags anywhere else",
        "# An ordinary quick-task plan\n\nSome body text with no envelope tags at all.\n\n"
        + _close_tag("content")
        + "\n",
    )

    case_count += 1
    _expect_reject(
        "a trailing orphan closing content tag, then a trailing orphan closing invoke tag",
        "# An ordinary quick-task plan\n\nSome body text with no envelope tags at all.\n\n"
        + _close_tag("content")
        + "\n"
        + _close_tag("invoke")
        + "\n",
    )

    case_count += 1
    _expect_reject(
        "THE ACTUALLY-OBSERVED SHAPE: a genuinely paired output block, then a trailing orphan "
        "closing content tag (36 of the 43 real instances)",
        _mutate(
            BASE_DOC,
            "</output>\n",
            "</output>\n" + _close_tag("content") + "\n",
            "append a trailing orphan content tag after a genuinely paired output tag",
        ),
    )

    # --- ACCEPT side: the cases that must NOT be convicted. These matter most. ---------------

    case_count += 1
    _expect_accept(
        "a file ending with a genuinely paired output block -- the ~800-file case",
        BASE_DOC,
    )

    case_count += 1
    _expect_accept(
        "a file whose body discusses the artifact in prose, mid-file, without ending in it",
        _mutate(
            BASE_DOC,
            "</output>\n",
            "</output>\n\n## Notes\n\nAn agent's tool-call envelope can leak a stray closing "
            "tag into a file body as its final line. This paragraph discusses that shape "
            "without ending the file in one.\n",
            "prose discussing the artifact mid-file",
        ),
    )

    case_count += 1
    _expect_accept(
        "an ordinary file ending in prose, no tags at all",
        "# An ordinary document\n\nJust prose, no tags, nothing special.\n",
    )

    case_count += 1
    _expect_accept(
        "a file that OPENS a content tag earlier and closes it at the end -- the pairing "
        "clause doing its work (the live tree carries this shape twice, see docstring)",
        "# A document about content review\n\n"
        + _open_tag("content")
        + "\n"
        "Some content block used for a legitimate purpose in this document.\n"
        + _close_tag("content")
        + "\n",
    )

    # --- SCAN-LEVEL cases: discovery, both anti-vacuity halves, and end-to-end detection ------

    with tempfile.TemporaryDirectory() as tmp:
        case_count += 1
        empty_repo = Path(tmp) / "empty"
        empty_planning = empty_repo / ".planning"
        empty_planning.mkdir(parents=True)
        subprocess.run(["git", "init", "-q"], cwd=empty_repo, check=True)
        _expect_scan_fails(
            "an EMPTY corpus (zero git-tracked .md files discovered)",
            empty_repo,
            empty_planning,
            "discovered ZERO git-tracked .md file(s)",
        )

        case_count += 1
        vacuous_repo = Path(tmp) / "vacuous"
        vacuous_planning = vacuous_repo / ".planning"
        _write_corpus(
            vacuous_planning,
            {"90-PLAN.md": "# A plan with no closing tags of any kind\n\nJust prose.\n"},
        )
        _expect_scan_fails(
            "a real corpus with ZERO files ending in a paired closing tag (upstream-drift "
            "tripwire)",
            vacuous_repo,
            vacuous_planning,
            "ZERO of",
        )

        case_count += 1
        offending_repo = Path(tmp) / "offending"
        offending_planning = offending_repo / ".planning"
        _write_corpus(
            offending_planning,
            {
                "91-PLAN.md": BASE_DOC,
                "92-PLAN.md": _mutate(
                    BASE_DOC,
                    "</output>\n",
                    "</output>\n" + _close_tag("content") + "\n",
                    "scan-level offender fixture",
                ),
            },
        )
        _expect_scan_fails(
            "a real corpus containing one offending file among clean ones -- proves detection "
            "through the REAL scan(), not just the pure predicate",
            offending_repo,
            offending_planning,
            "92-PLAN.md",
        )

        case_count += 1
        clean_repo = Path(tmp) / "clean"
        clean_planning = clean_repo / ".planning"
        _write_corpus(
            clean_planning,
            {
                "93-PLAN.md": BASE_DOC,
                "94-PLAN.md": "# An ordinary document\n\nJust prose, no tags, nothing special.\n",
            },
        )
        _expect_scan_passes(
            "a real corpus with a mix of paired-tag and tag-free files, none offending",
            clean_repo,
            clean_planning,
        )

    assert case_count == 11, f"expected 11 self-test cases, ran {case_count}"
    print(
        f"\nAll 3 orphan shapes -- including the actually-observed paired-output-then-orphan-"
        f"content shape -- proved capable of being flagged, all 4 accept-side controls -- "
        f"including the ~800-file paired-output case and the opens-and-closes-content pairing "
        f"case -- proved capable of NOT convicting correct documents, and both anti-vacuity "
        f"halves plus end-to-end detection through the real scan() proved capable of firing "
        f"correctly ({case_count} self-test case(s) total)."
    )


def main() -> None:
    self_test()
    if "--self-test" in sys.argv:
        print(
            "\nSELF-TEST OK: every orphan shape is flagged, every accept-side control is left "
            "alone, and both anti-vacuity halves fire."
        )
        sys.exit(0)

    scan(REPO_ROOT, PLANNING_DIR)
    sys.exit(0)


if __name__ == "__main__":
    main()
