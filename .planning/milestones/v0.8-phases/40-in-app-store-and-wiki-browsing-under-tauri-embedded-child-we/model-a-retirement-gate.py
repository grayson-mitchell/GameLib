#!/usr/bin/env python3
"""Model A (renderer-owned `<webview>`) anti-regrowth sweep (D-13, REQ-40-10).

Purpose (read this before deleting a failing assertion): Phase 40 retires the Electron-era
renderer-owned `<webview>` element in favour of Model B (a real OS-native Tauri child window
owned by Rust). Plans 40-01 and 40-03 deleted every live site this phase's census found — but a
census is a snapshot, not a guard. Nothing stops a future edit from reintroducing a `<webview>`
tag, re-declaring the `WebviewTag` type shim, or resurrecting the `webviewPreloadPath` guard this
phase spent three tasks removing, and a fully-green test suite would not notice, because none of
the deleted tests exist anymore to notice for it. This gate is that guard: it walks the real
`src/frontend/` tree at run time (never a cached/pasted list) and fails if any of the three exact
D-13 tokens reappears on a non-comment line of a non-test TypeScript/TSX file.

The three tokens, taken directly from `40-CONTEXT.md` D-13:
  1. `<webview` — the JSX opening tag for the retired custom element.
  2. `WebviewTag` — the deleted `backend/platform/types.ts` method-surface shim interface name.
  3. `webviewPreloadPath` — the deleted renderer-side guard variable/state name.

Scope is deliberately `src/frontend/` only, asserted explicitly below (FRONTEND_ROOT) rather than
left to rglob's starting point alone — a later scope widening to `src/` broadly would otherwise
silently start convicting `src-tauri/`'s unrelated `WebviewBuilder`/`WebviewUrl` Rust identifiers
the moment someone changed FRONTEND_ROOT without re-reading this comment.

Test files (`__tests__/` directories, `*.test.ts`, `*.test.tsx`) are excluded from the walk. This
was NOT one of the three false-positive risks named in the plan — it was found by this gate's own
required "measure the vocabulary against the real tree before committing to it" step:
`WebviewUnavailablePanel.test.tsx` (Phase 40 Plan 01's own INVERT regression test) carries a jest
`it()` description string that spells out `webviewPreloadPath` verbatim to document the guard it
proves stays deleted ("... wrapping BOTH arms exactly as `!webviewPreloadPath` used to"). That
string is live source code, not a comment, so a test-unaware sweep would convict the very test
that proves the regression this gate exists to catch. Excluding test files is the correct scope
for an ANTI-REGROWTH gate: it exists to catch reintroduction in the code that RUNS, not in prose
that quotes history for a human reader. Covered by self-test case 8 below.

Two more false-positive risks were named directly in the plan and are each covered by a self-test:
  - `WebviewUnavailablePanel` (a real, surviving frontend component) contains the substring
    `Webview` but not `WebviewTag` — TOKEN_PATTERNS matches `WebviewTag` as a whole word, so a
    longer identifier that merely starts with the same six letters can never trip it. Self-test
    case 4.
  - Comment lines (both `//` and `/* */`, including JSX's `{/* ... */}` shape) are stripped before
    matching, and this gate's OWN docstring — which necessarily names all three literal tokens to
    describe what it forbids — is fed through the stripper as a self-test case proving the gate
    does not convict itself. Self-test cases 5 and 6.
  - `WebviewBuilder` / `WebviewUrl` (the new Rust-side identifiers `src-tauri/` uses) are excluded
    structurally by the `src/frontend/` scope, but TOKEN_PATTERNS itself is also proven never to
    match either string on its own merits, independent of scoping. Self-test case 7.

Run `python3 model-a-retirement-gate.py` (no arguments) for CI mode: self-test first, then walk
the live tree, write nothing. This IS the path `meta/runPlanningGates.py` invokes — discovery is
by `-gate.py` suffix, no arguments, so the no-argument path has to be the real check. Run
`python3 model-a-retirement-gate.py --self-test` to run only the self-test. There is no `--write`
flag: unlike `seam-parity-sweep-gate.py`, this gate produces no committed artifact to regenerate —
it is a pure predicate over the live tree, the same shape as `preload-surface-gate.py`.

When this gate fails, the correct maintenance action is to delete the reintroduced Model A
site — never to delete or narrow a TOKEN_PATTERNS entry to make the gate pass. Narrowing the
vocabulary here defeats the entire reason this file exists.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

PHASE_DIR = Path(__file__).parent
REPO_ROOT = PHASE_DIR.parent.parent.parent
FRONTEND_ROOT = REPO_ROOT / "src" / "frontend"
# Scope asserted explicitly (see docstring) rather than left implicit in FRONTEND_ROOT's
# definition alone.
assert FRONTEND_ROOT.parent.name == "src" and FRONTEND_ROOT.name == "frontend", (
    "FRONTEND_ROOT must resolve to exactly src/frontend -- widening this scope would silently "
    "start walking src-tauri/'s unrelated WebviewBuilder/WebviewUrl Rust identifiers"
)

# The three D-13 tokens, matched as whole words (or, for the JSX tag, followed by whitespace,
# `/` or `>` -- the shapes a real opening tag can take) so a longer identifier that merely shares
# a prefix (`WebviewUnavailablePanel`) can never trip a match.
TOKEN_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("<webview> element", re.compile(r"<webview(?=[\s/>])")),
    ("WebviewTag identifier", re.compile(r"\bWebviewTag\b")),
    ("webviewPreloadPath identifier", re.compile(r"\bwebviewPreloadPath\b")),
]

BLOCK_COMMENT = re.compile(r"/\*[\s\S]*?\*/")
LINE_COMMENT_PREFIX = re.compile(r"^\s*(//|\*|/\*)")


def strip_comments(text: str) -> str:
    """Strip `/* */` block comments (including a JSX `{/* ... */}` expression's interior) first,
    then drop any remaining WHOLE line that itself starts with a comment marker. Mirrors
    `backend/testUtils/stripSourceComments.ts`'s two-stage order and its documented, accepted
    limitation: a trailing `// ...` comment appended after real code on the same line is not
    stripped. No caller here needs that -- a token appearing only in a line's trailing comment
    while the same line ALSO carries the token in real code cannot happen for these three
    patterns without the code portion tripping the match on its own merits anyway."""
    text = BLOCK_COMMENT.sub("", text)
    return "\n".join(
        line for line in text.split("\n") if not LINE_COMMENT_PREFIX.match(line)
    )


def is_test_file(path: Path) -> bool:
    return (
        "__tests__" in path.parts
        or path.name.endswith(".test.ts")
        or path.name.endswith(".test.tsx")
    )


def find_violations_in_source(text: str) -> list[tuple[int, str, str]]:
    """Pure function: given one file's raw text, return (line_no, token_label, line_text) for
    every forbidden-token hit on a non-comment line. No I/O, no sys.exit -- used both against
    real files (scan_tree) and self-test synthetic snippets, never a reimplementation."""
    stripped = strip_comments(text)
    hits: list[tuple[int, str, str]] = []
    for line_no, line in enumerate(stripped.split("\n"), start=1):
        for label, pattern in TOKEN_PATTERNS:
            if pattern.search(line):
                hits.append((line_no, label, line.strip()))
    return hits


def fail(message: str) -> None:
    print(f"GATE FAILED: {message}", file=sys.stderr)
    sys.exit(1)


def assert_file_clean(path: Path, text: str) -> None:
    """Fails (sys.exit(1)) if `path` is not a test file and carries a forbidden-token hit on a
    non-comment line. Test files are excluded from the walk entirely (see docstring) -- this
    short-circuit lives HERE, in the one function both scan_tree and the self-test call, so the
    exclusion is provably the same in both paths rather than two independently-drifting copies."""
    if is_test_file(path):
        return
    hits = find_violations_in_source(text)
    if hits:
        line_no, label, line_text = hits[0]
        fail(
            f"{path}:{line_no}: forbidden Model A token found -- {label}\n  {line_text}\n"
            "Model A (the renderer-owned <webview> element) was retired by Phase 40. Delete the "
            "reintroduced site; do not narrow this gate's vocabulary to make it pass."
        )


def scan_tree(frontend_root: Path) -> None:
    """CI-mode walk: every non-test *.ts/*.tsx file under frontend_root, real tree, real time."""
    checked = 0
    for ext in ("*.ts", "*.tsx"):
        for path in sorted(frontend_root.rglob(ext)):
            if is_test_file(path):
                continue
            text = path.read_text(encoding="utf-8")
            assert_file_clean(path, text)
            checked += 1
    if checked == 0:
        fail(
            f"scanned ZERO non-test TypeScript/TSX files under {frontend_root} -- this almost "
            "certainly means the tree moved and the gate is silently checking nothing"
        )
    print(f"OK: {checked} non-test TypeScript/TSX file(s) under src/frontend/ carry none of the "
          "3 retired Model A tokens (<webview>, WebviewTag, webviewPreloadPath).")


# ---------------------------------------------------------------------------
# Self-test. Each case is discharged through find_violations_in_source/assert_file_clean, the
# SAME functions used against the real tree, never a reimplementation.
# ---------------------------------------------------------------------------


def _expect_reject(label: str, path: Path, text: str) -> None:
    try:
        assert_file_clean(path, text)
    except SystemExit:
        print(f"  self-test OK: {label} correctly rejected")
        return
    fail(f"self-test FAILED: {label} did NOT reject bad input -- gate vacuous")


def _expect_accept(label: str, path: Path, text: str) -> None:
    try:
        assert_file_clean(path, text)
    except SystemExit:
        fail(f"self-test FAILED: {label} was WRONGLY rejected -- gate convicts correct code")
        return
    print(f"  self-test OK: {label} correctly accepted")


def self_test() -> None:
    """8 cases: the 3 tokens rejected, plus 5 accept-side controls (WebviewUnavailablePanel,
    a plain comment-only occurrence, this gate's own docstring embedded as a block comment, the
    two Rust-side lookalikes, and a test-file occurrence). The plan's floor is 5; this covers it
    with margin because vocabulary measurement against the real tree surfaced a 4th risk (test
    files) the plan's own three named risks did not anticipate."""
    case_count = 0

    def reject(label: str, text: str) -> None:
        nonlocal case_count
        case_count += 1
        _expect_reject(label, FRONTEND_ROOT / "synthetic.tsx", text)

    def accept(label: str, text: str, path: Path | None = None) -> None:
        nonlocal case_count
        case_count += 1
        _expect_accept(label, path or (FRONTEND_ROOT / "synthetic.tsx"), text)

    # Sanity: a plain clean file must pass before we start feeding it bad input.
    _expect_accept(
        "sanity (clean file)",
        FRONTEND_ROOT / "synthetic.tsx",
        "export function Clean(): null {\n  return null\n}\n",
    )
    print("  self-test base file: passes clean (sanity check OK)")

    # Cases 1-3: each of the three D-13 tokens, live (non-comment, non-test) code.
    reject(
        "<webview> element reintroduced",
        "export function Bad() {\n  return <webview src={url} />\n}\n",
    )
    reject(
        "WebviewTag identifier reintroduced",
        "import type { WebviewTag } from 'backend/platform'\n"
        "const ref: WebviewTag | null = null\n",
    )
    reject(
        "webviewPreloadPath identifier reintroduced",
        "function Bad() {\n  if (!webviewPreloadPath) {\n    return null\n  }\n}\n",
    )

    # Case 4: WebviewUnavailablePanel -- prefix collision, must be ACCEPTED.
    accept(
        "WebviewUnavailablePanel (prefix collision) accepted",
        "import WebviewUnavailablePanel from './components/WebviewUnavailablePanel'\n"
        "export function Ok() {\n  return <WebviewUnavailablePanel url={url} />\n}\n",
    )

    # Case 5: a plain comment-only occurrence of all three tokens must be ACCEPTED.
    accept(
        "comment-only occurrence of all 3 tokens accepted",
        "// <webview> WebviewTag webviewPreloadPath -- all three retired, Phase 40\n"
        "export function Ok(): null {\n  return null\n}\n",
    )

    # Case 6: this gate's own docstring, embedded as a real TS block comment, must be ACCEPTED --
    # proving the gate does not convict itself for describing what it forbids.
    own_docstring_as_block_comment = "/**\n" + "\n".join(
        f" * {line}" for line in (__doc__ or "").split("\n")
    ) + "\n */\nexport function Ok(): null {\n  return null\n}\n"
    accept(
        "this gate's own docstring (embedded as a block comment) accepted",
        own_docstring_as_block_comment,
    )

    # Case 7: the Rust-side lookalikes (WebviewBuilder, WebviewUrl) must be ACCEPTED on their own
    # vocabulary merits, independent of the src/frontend/ scoping that would exclude src-tauri/
    # anyway.
    accept(
        "WebviewBuilder/WebviewUrl (Rust lookalikes) accepted",
        "// hypothetical: if Rust vocabulary ever leaked into a frontend file\n"
        "const notes = 'WebviewBuilder and WebviewUrl are src-tauri/ identifiers'\n",
    )

    # Case 8: a *.test.tsx file carrying a live (non-comment) occurrence must be ACCEPTED --
    # the WebviewUnavailablePanel.test.tsx discovery (see docstring).
    accept(
        "*.test.tsx file with a live occurrence accepted (excluded scope)",
        "it('proves the guard stays deleted, wrapping both arms as `!webviewPreloadPath` used to'"
        ", () => {\n  expect(true).toBe(true)\n})\n",
        path=FRONTEND_ROOT / "components" / "__tests__" / "synthetic.test.tsx",
    )

    assert case_count == 8, f"expected 8 self-test cases, ran {case_count}"
    print(f"\nAll 3 forbidden-token checks proved capable of rejecting the input they exist to "
          f"reject, and all 5 accept-side controls proved capable of NOT convicting correct code "
          f"({case_count} self-test case(s) total).")


def main() -> None:
    self_test()
    if "--self-test" in sys.argv:
        print("\nSELF-TEST OK: every check rejects its corresponding bad input, and every "
              "accept-side control is correctly left alone.")
        sys.exit(0)

    if not FRONTEND_ROOT.is_dir():
        fail(f"{FRONTEND_ROOT} does not exist")

    scan_tree(FRONTEND_ROOT)
    sys.exit(0)


if __name__ == "__main__":
    main()
