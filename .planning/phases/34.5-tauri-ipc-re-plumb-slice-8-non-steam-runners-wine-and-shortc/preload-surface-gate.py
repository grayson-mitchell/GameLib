#!/usr/bin/env python3
"""Preload-surface coverage gate (U-34.5-14, D-CYCLE6-C, REQ-34.5-11).

Purpose (read this before deleting a failing assertion): `ported-channels-gate.py` (plan 34.5-43,
this cycle) verifies that the Phase 34.5 39+3+16=58 split reconciles *internally*. It is
structurally incapable of finding a channel that was never listed anywhere — that is exactly the
class of defect that produced `getInstallInfo` (F-34.5-G6-10) and this gate's own 11 siblings
(plan 34.5-49, `34.5-PRELOAD-SURFACE-AUDIT.md`). This file asserts a DIFFERENT invariant:
`IPC-PORT-INVENTORY.md`'s bucket lines cover the REAL preload surface, re-derived from
`src/preload/` at run time, never from any transcribed list. It is a new, standalone file — it does
not edit or import `ported-channels-gate.py`, which belongs to plan 34.5-43 this cycle.

When this gate fails, the correct maintenance action is to ADD the missing channel to a bucket
line in `IPC-PORT-INVENTORY.md` (creating a new "late-discovered" section if it belongs to none of
the existing ones) — never to delete or weaken an assertion to make the gate pass. Weakening an
assertion here defeats the entire reason this file exists: the omission class it exists to catch
is, by construction, invisible to every other gate in this phase.

Run `python3 preload-surface-gate.py` to check the live documents/source tree. Run
`python3 preload-surface-gate.py --self-test` to prove every assertion below actually rejects the
input it exists to reject — a gate that cannot be shown to reject a bad input is not a gate. Every
self-test case below is discharged through the SAME check_* function used against the real
documents, never a reimplementation, mirroring `ported-channels-gate.py`'s own idiom.
"""

import re
import sys
from pathlib import Path

PHASE_DIR = Path(__file__).parent
REPO_ROOT = PHASE_DIR.parent.parent.parent
PRELOAD_ROOT = REPO_ROOT / "src" / "preload"
INVENTORY_PATH = REPO_ROOT / ".planning" / "IPC-PORT-INVENTORY.md"

# The audited floor established by 34.5-PRELOAD-SURFACE-AUDIT.md (plan 34.5-49) on the tree this
# gate was authored against: 157 distinct invoke + 60 distinct send = 217 union. A regression to a
# single-line-only regex measures 206 on this same tree (11 fewer, all Prettier-wrapped). This
# gate's own check 2 fails if the LIVE extraction ever drops below this floor.
AUDITED_UNION_FLOOR = 217

# ---------------------------------------------------------------------------
# Extraction — multi-line-aware, comment-stripping. Reproduces
# 34.5-PRELOAD-SURFACE-AUDIT.md's extractor exactly (same regex, same comment stripper) so this
# gate's own numbers can be compared against the audit's without discrepancy.
# ---------------------------------------------------------------------------

BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
CALL_PATTERN = re.compile(
    r"\b(makeHandlerInvoker|makeListenerCaller|frontendListenerSlot)\s*\(\s*['\"]([^'\"]+)['\"]",
    re.S,
)


def strip_comments(text: str) -> str:
    """Strip /* */ block comments and // line comments, without treating :// inside a URL/string
    as a comment start. Applied BEFORE CALL_PATTERN matching, so a commented-out call site is
    never mistaken for a live one (check 3, comment blindness)."""
    text = BLOCK_COMMENT.sub("", text)
    out = []
    for line in text.split("\n"):
        i, cut = 0, None
        while True:
            j = line.find("//", i)
            if j == -1:
                break
            if j > 0 and line[j - 1] == ":":
                i = j + 2
                continue
            cut = j
            break
        out.append(line[:cut] if cut is not None else line)
    return "\n".join(out)


def extract_from_source(text: str):
    """Pure function: given ONE file's raw TS source text, return (invoke, send, push) sets.
    Used both by extract_from_tree (real run, per file) and self-test (synthetic snippets)."""
    invoke, send, push = set(), set(), set()
    stripped = strip_comments(text)
    for m in CALL_PATTERN.finditer(stripped):
        factory, name = m.group(1), m.group(2)
        {
            "makeHandlerInvoker": invoke,
            "makeListenerCaller": send,
            "frontendListenerSlot": push,
        }[factory].add(name)
    return invoke, send, push


def extract_from_tree(preload_root: Path):
    invoke, send, push = set(), set(), set()
    raw_concat = []
    files = sorted(p for p in preload_root.rglob("*.ts") if "__tests__" not in p.parts)
    for f in files:
        text = f.read_text(encoding="utf-8")
        raw_concat.append(text)
        i, s, p = extract_from_source(text)
        invoke |= i
        send |= s
        push |= p
    return invoke, send, push, "\n".join(raw_concat)


# ---------------------------------------------------------------------------
# Bucket-line parsing — lines with >=5 backticked names only (see check 4's justification).
# ---------------------------------------------------------------------------

BACKTICK_NAME = re.compile(r"`([A-Za-z0-9_.-]+)`")
TOTALS_UNIQUE_PATTERN = re.compile(r"\|\s*Unique channels\s*\|\s*(\d+)\s*\|")


def parse_bucket_names(inventory_text: str) -> set:
    names = set()
    for ln in inventory_text.splitlines():
        found = BACKTICK_NAME.findall(ln)
        if len(found) >= 5:
            names |= set(found)
    return names


def parse_any_backtick_names(inventory_text: str) -> set:
    return set(BACKTICK_NAME.findall(inventory_text))


def parse_totals_unique(inventory_text: str) -> int:
    m = TOTALS_UNIQUE_PATTERN.search(inventory_text)
    if not m:
        fail("could not find '| Unique channels | N |' in the ## Totals table")
    return int(m.group(1))


def fail(message: str) -> None:
    print(f"GATE FAILED: {message}", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------
# Check 1 — Coverage: every distinct invoke/send channel appears in at least one bucket line.
# ---------------------------------------------------------------------------


def check_coverage(invoke: set, send: set, bucket_names: set) -> None:
    union = invoke | send
    survivors = sorted(union - bucket_names)
    if survivors:
        fail(
            f"{len(survivors)} preload channel(s) are exposed via makeHandlerInvoker/"
            f"makeListenerCaller but appear in NO bucket line of IPC-PORT-INVENTORY.md: "
            f"{', '.join(survivors)}"
        )


# ---------------------------------------------------------------------------
# Check 2 — Multi-line awareness: the extracted union must not regress below the audited floor.
# A regression to a single-line-only regex measures 206 on the audited tree (11 fewer).
# ---------------------------------------------------------------------------


def check_multiline_awareness(invoke: set, send: set) -> None:
    union_size = len(invoke | send)
    if union_size < AUDITED_UNION_FLOOR:
        fail(
            f"extracted union has only {union_size} distinct channel(s), below the audited floor "
            f"of {AUDITED_UNION_FLOOR} — this is the exact signature of a regression to a "
            "single-line-only regex (measured at 206 on the audited tree, 11 short)"
        )


# ---------------------------------------------------------------------------
# Check 3 — Comment blindness: a channel name that appears ONLY inside a comment (never in live
# code) must never leak into the extracted invoke/send sets.
# ---------------------------------------------------------------------------


def check_comment_blindness(raw_text: str, invoke: set, send: set) -> None:
    # Names found by matching CALL_PATTERN against the RAW (unstripped) text, minus names found
    # against the STRIPPED text -- i.e. names that exist ONLY inside a comment.
    raw_names = {m.group(2) for m in CALL_PATTERN.finditer(raw_text)}
    stripped_names = {m.group(2) for m in CALL_PATTERN.finditer(strip_comments(raw_text))}
    comment_only_names = raw_names - stripped_names
    leaked = comment_only_names & (invoke | send)
    if leaked:
        fail(
            f"the following name(s) exist ONLY inside a comment but leaked into the extracted "
            f"invoke/send sets — comment-stripping is broken: {', '.join(sorted(leaked))}"
        )


# ---------------------------------------------------------------------------
# Check 4 — Bucket-line scoping: membership is parsed from lines with >=5 backticked names only,
# never from any backtick anywhere in the document. Real proof this matters on THIS document: the
# >=5 rule (222) must find strictly fewer names than an any-backtick parse (277) -- if they were
# ever equal, the scoping rule would be doing nothing, and the F-34.5-G6-10 warning paragraph's own
# backticked channel mentions would silently count as "listed".
# ---------------------------------------------------------------------------


def check_bucket_line_scoping(inventory_text: str) -> None:
    bucket_names = parse_bucket_names(inventory_text)
    any_names = parse_any_backtick_names(inventory_text)
    if not (bucket_names < any_names):
        fail(
            f"bucket-line-scoped names ({len(bucket_names)}) are not a STRICT subset of "
            f"any-backtick names ({len(any_names)}) — the >=5-backtick-line scoping rule is not "
            "discriminating on this document, which means a channel named only in prose (e.g. the "
            "F-34.5-G6-10 warning paragraph) could be silently counted as listed"
        )


# ---------------------------------------------------------------------------
# Check 5 — Totals reconciliation: '## Totals' -> 'Unique channels' equals the distinct bucket-line
# name count.
# ---------------------------------------------------------------------------


def check_totals_reconciliation(inventory_text: str) -> None:
    bucket_names = parse_bucket_names(inventory_text)
    stated = parse_totals_unique(inventory_text)
    if stated != len(bucket_names):
        fail(
            f"'## Totals' states {stated} unique channels, but the bucket lines contain "
            f"{len(bucket_names)} distinct names — these must reconcile exactly"
        )


# ---------------------------------------------------------------------------
# Check 6 — Provenance: the inventory still names the audit file and still carries the
# F-34.5-G6-10 marker, so the record of how this gap was found cannot be quietly deleted once it
# stops being embarrassing.
# ---------------------------------------------------------------------------

PROVENANCE_MARKERS = ["34.5-PRELOAD-SURFACE-AUDIT.md", "F-34.5-G6-10"]


def check_provenance(inventory_text: str) -> None:
    missing = [m for m in PROVENANCE_MARKERS if m not in inventory_text]
    if missing:
        fail(
            f"IPC-PORT-INVENTORY.md is missing required provenance marker(s): {', '.join(missing)}"
            " -- the record of how the preload-surface gap was found must survive edits"
        )


# ---------------------------------------------------------------------------
# Assertion registry
# ---------------------------------------------------------------------------

ASSERTION_COUNT = 6


def run_all_checks(invoke: set, send: set, push: set, raw_text: str, inventory_text: str) -> None:
    bucket_names = parse_bucket_names(inventory_text)
    check_coverage(invoke, send, bucket_names)
    check_multiline_awareness(invoke, send)
    check_comment_blindness(raw_text, invoke, send)
    check_bucket_line_scoping(inventory_text)
    check_totals_reconciliation(inventory_text)
    check_provenance(inventory_text)


# ---------------------------------------------------------------------------
# Anti-vacuity self-tests. Exactly one case per check, each proven to reject a known-bad input
# through the SAME check_* function used against the real documents.
# ---------------------------------------------------------------------------


def _valid_synthetic_source() -> str:
    return (
        "export const readConfig = makeHandlerInvoker('readConfig')\n"
        "export const notify = makeListenerCaller('notify')\n"
        "export const handleMaximized = frontendListenerSlot('maximized')\n"
        "// a commented-out call, must never be extracted:\n"
        "// export const decoy = makeHandlerInvoker('shouldNotAppear')\n"
        "/* export const decoy2 = makeListenerCaller('alsoShouldNotAppear') */\n"
        "export const wrapped = makeHandlerInvoker(\n"
        "  'wrappedAcrossLines'\n"
        ")\n"
    )


def _valid_synthetic_inventory(bucket_names: list) -> str:
    line = ", ".join(f"`{n}`" for n in bucket_names)
    return f"""# Synthetic inventory

## Method (reproducible)

placeholder

## Preload-surface coverage

Provenance: `34.5-PRELOAD-SURFACE-AUDIT.md`. F-34.5-G6-10 marker retained.

## Totals

| | Count |
|---|---:|
| Unique channels | {len(set(bucket_names))} |

## Already ported ({len(set(bucket_names))})

{line}

Also mentioned once more in prose here for scoping purposes: `{bucket_names[0]}` and a decoy
name never on a real bucket line: `proseOnlyDecoy`.
"""


def _expect_failure(label: str, fn, *args) -> None:
    try:
        fn(*args)
    except SystemExit:
        print(f"  self-test OK: {label} correctly rejected")
        return
    fail(f"self-test FAILED: {label} did NOT reject its bad input — the gate is vacuous")


def self_test() -> None:
    case_count = 0

    def case(label: str, fn, *args) -> None:
        nonlocal case_count
        case_count += 1
        _expect_failure(label, fn, *args)

    base_source = _valid_synthetic_source()
    base_invoke, base_send, base_push = extract_from_source(base_source)
    base_bucket_names = ["readConfig", "notify", "wrappedAcrossLines", "extraA", "extraB"]
    base_inventory = _valid_synthetic_inventory(base_bucket_names)

    # Sanity: base fixtures must pass clean before we start breaking them.
    try:
        check_coverage(base_invoke, base_send, parse_bucket_names(base_inventory))
        check_multiline_awareness(
            base_invoke | {f"pad{i}" for i in range(AUDITED_UNION_FLOOR)}, base_send
        )
        check_comment_blindness(base_source, base_invoke, base_send)
        check_bucket_line_scoping(base_inventory)
        check_totals_reconciliation(base_inventory)
        check_provenance(base_inventory)
    except SystemExit:
        fail("self-test setup FAILED: the base synthetic fixtures do not pass a clean gate run")
    print("  self-test base fixtures: pass clean (sanity check OK)")

    # Case 1 (check_coverage): drop 'wrappedAcrossLines' from the bucket set.
    bucket_missing_one = parse_bucket_names(base_inventory) - {"wrappedAcrossLines"}
    case(
        "a channel present in preload but absent from every bucket rejected by check_coverage",
        check_coverage,
        base_invoke,
        base_send,
        bucket_missing_one,
    )

    # Case 2 (check_multiline_awareness): an undercounted union (206-equivalent regression).
    undercounted_invoke = {"only", "a", "few", "names"}
    case(
        "a union below the audited floor (single-line-regex regression) rejected by "
        "check_multiline_awareness",
        check_multiline_awareness,
        undercounted_invoke,
        set(),
    )

    # Case 3 (check_comment_blindness): a commented-out name that WRONGLY leaked into the
    # extracted sets (simulating a broken comment stripper).
    leaked_invoke = base_invoke | {"shouldNotAppear"}
    case(
        "a comment-only name leaking into the extracted invoke set rejected by "
        "check_comment_blindness",
        check_comment_blindness,
        base_source,
        leaked_invoke,
        base_send,
    )

    # Case 4 (check_bucket_line_scoping): a degenerate document where the >=5 rule makes NO
    # difference (bucket_names == any_backtick_names) -- proves the discriminating-scope
    # assertion itself can fail, not just pass by construction.
    degenerate_doc = "`a`, `b`, `c`, `d`, `e`\n"  # exactly 5 names, nothing else in the doc
    case(
        "a document where bucket-line scoping makes no difference rejected by "
        "check_bucket_line_scoping",
        check_bucket_line_scoping,
        degenerate_doc,
    )

    # Case 5 (check_totals_reconciliation): mutate the stated Totals number.
    wrong_totals_doc = base_inventory.replace(
        f"| Unique channels | {len(set(base_bucket_names))} |",
        f"| Unique channels | {len(set(base_bucket_names)) + 1} |",
    )
    case(
        "a mismatched '## Totals' -> 'Unique channels' figure rejected by "
        "check_totals_reconciliation",
        check_totals_reconciliation,
        wrong_totals_doc,
    )

    # Case 6 (check_provenance): strip the audit filename marker.
    stripped_provenance_doc = base_inventory.replace("34.5-PRELOAD-SURFACE-AUDIT.md", "")
    case(
        "a document with the audit-filename provenance marker stripped rejected by "
        "check_provenance",
        check_provenance,
        stripped_provenance_doc,
    )

    if case_count != ASSERTION_COUNT:
        fail(
            f"self-test FAILED: ran {case_count} self-test case(s) but there are "
            f"{ASSERTION_COUNT} check(s) — every assertion must have exactly one self-test case, "
            "no more, no fewer. This equality is checked at runtime, not just claimed in a comment."
        )

    print(
        f"\nAll {ASSERTION_COUNT} check(s) proved capable of rejecting the input they exist to "
        f"reject ({case_count} self-test case(s), 1:1)."
    )


def main() -> None:
    if "--self-test" in sys.argv:
        self_test()
        print("\nSELF-TEST OK: every assertion rejects its corresponding bad input.")
        sys.exit(0)

    if not PRELOAD_ROOT.exists():
        fail(f"{PRELOAD_ROOT} does not exist")
    if not INVENTORY_PATH.exists():
        fail(f"{INVENTORY_PATH} does not exist")

    invoke, send, push, raw_text = extract_from_tree(PRELOAD_ROOT)
    inventory_text = INVENTORY_PATH.read_text(encoding="utf-8")

    run_all_checks(invoke, send, push, raw_text, inventory_text)

    union = invoke | send
    unlisted = sorted(union - parse_bucket_names(inventory_text))
    print(
        f"OK: distinct invoke={len(invoke)}, send={len(send)}, union={len(union)}, "
        f"push (out of tally)={len(push)}, unlisted={len(unlisted)}. "
        "IPC-PORT-INVENTORY.md's bucket lines cover the full re-derived preload surface "
        f"(U-34.5-14, D-CYCLE6-C)."
    )
    sys.exit(0)


if __name__ == "__main__":
    main()
