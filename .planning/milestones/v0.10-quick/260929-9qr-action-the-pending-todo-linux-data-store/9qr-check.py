#!/usr/bin/env python3
"""
9qr-check.py — quick-task harness for quick 260929-9qr.

IT IS A QUICK-TASK HARNESS, NOT A CI GATE. It is not wired into
`pnpm planning-gates` or anywhere else, and nothing runs it automatically. It
exists to prove, against the pinned pre-edit commit `PRE_EDIT_BASE`, that
quick 260929-9qr's edits — recording the operator's LOCKED decision to accept
one shared cookie jar on Linux in the isolation todo, re-scoping the Linux
isolation clauses of Phase 38 ledger items `38-E03`/`38-E04` in
`38-VERIFICATION.md`, amending `deferral_note`, appending an addendum to the
positioning todo, and recording the task in STATE.md — changed exactly what
they claim to change and nothing else.

Follows the `upj-check.py` / `ledger-check.cjs` output convention: one line
per check (`PASS <check>` or `PASS <check>: <detail>` / `FAIL <check>:
<detail>`), every check runs (failures do not stop the rest of the checks
from running, except where a later check is genuinely undecidable without an
earlier one), and the exit code is 1 if any check fails, 0 otherwise.

Every comparison is pinned against `PRE_EDIT_BASE`, never a relative `HEAD~N`
anchor — this branch is shared with in-flight quick `260928-tvk`, whose own
commits would make a relative anchor name whatever landed last.

Usage:
  python3 9qr-check.py [--base REV] [--items CSV] [--deferral-note]
                        [--positioning] [--state]
  python3 9qr-check.py --print-base
  python3 9qr-check.py --print-counts [--base REV]

  --base REV           Revision to diff against (default PRE_EDIT_BASE).
  --print-base         Print PRE_EDIT_BASE and exit 0. No other check runs.
  --items CSV          Comma-separated ledger item ids to check as edited
                        (default 38-E03,38-E04).
  --deferral-note       Assert the deferral_note amendment. Without this
                        flag, assert deferral_note is unchanged from base.
  --positioning         Assert the positioning-todo addendum. Without this
                        flag, assert the positioning todo is unchanged.
  --state               Also run the STATE.md checks (S1-S5).
  --print-counts        Print the three human_verification* array lengths of
                        the BASE ledger as "O D R", then exit 0. No other
                        check runs.
"""
import argparse
import os
import re
import subprocess
import sys

import yaml

ROOT = os.path.abspath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
)

# Pinned before any edit this quick task made. See planning_observations.
PRE_EDIT_BASE = "54a931199256acbed18d84759d2586168405e870"

ISO = (
    ".planning/todos/pending/"
    "2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md"
)
POS = (
    ".planning/todos/pending/"
    "2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md"
)
LEDGER_REL = (
    ".planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/"
    "38-VERIFICATION.md"
)
STATE_REL = ".planning/STATE.md"
COMPLETED_DIR = os.path.join(ROOT, ".planning/todos/completed")

NEW_FIELD = "linux_isolation_decided_2026_09_29"

# The exact pre-change clause/sentence each item's `blocked_by` is edited
# around, character for character. See planning_observations.
OLD_CLAUSE = {
    "38-E03": "which by its own title gates whether a Linux embed ships at all",
    "38-E04": (
        "It is also blocked on "
        ".planning/todos/pending/2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md, "
        "the isolation todo, before any Linux embed ships."
    ),
}

results = []


def ok(check, detail=None):
    results.append(("PASS", check, detail))


def bad(check, detail):
    results.append(("FAIL", check, detail))


def print_results():
    for level, check, detail in results:
        if detail:
            print(f"{level} {check}: {detail}")
        else:
            print(f"{level} {check}")


def any_fail():
    return any(level == "FAIL" for level, _, _ in results)


def git_show(rev, relpath):
    proc = subprocess.run(
        ["git", "show", f"{rev}:{relpath}"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"git show {rev}:{relpath} failed: {proc.stderr.strip()}")
    return proc.stdout


def read_disk(relpath):
    with open(os.path.join(ROOT, relpath), "r", encoding="utf-8") as f:
        return f.read()


def extract_frontmatter_region(content):
    """The text between the first '---' line and the next '---' line."""
    lines = content.split("\n")
    if not lines or lines[0] != "---":
        return None
    for i in range(1, len(lines)):
        if lines[i] == "---":
            return "\n".join(lines[1:i])
    return None


def swap_unique_line(content, old_line, new_line):
    """Replace the single line equal to old_line with new_line. Returns
    (new_content_or_None, count_of_matches)."""
    pattern = r"(?m)^" + re.escape(old_line) + r"$"
    count = len(re.findall(pattern, content))
    if count != 1:
        return None, count
    return re.sub(pattern, new_line.replace("\\", "\\\\"), content, count=1), count


def first_diff_offset(a, b):
    n = min(len(a), len(b))
    return next((i for i in range(n) if a[i] != b[i]), n)


def first_nonblank(text_lines):
    i = 0
    while i < len(text_lines) and text_lines[i] == "":
        i += 1
    return text_lines[i] if i < len(text_lines) else None


def find_item_block(lines, item_id):
    """Return (start, end) exclusive line-index span of a `- id: "<id>"`
    block within a raw human_verification array's line list, or None."""
    id_pat = re.compile(r'^\s*-\s*id:\s*"' + re.escape(item_id) + r'"\s*$')
    start = None
    for i, l in enumerate(lines):
        if id_pat.match(l):
            start = i
            break
    if start is None:
        return None
    item_line_pat = re.compile(r'^\s*-\s*id:\s*"')
    toplevel_pat = re.compile(r"^\S")
    end = len(lines)
    for j in range(start + 1, len(lines)):
        if item_line_pat.match(lines[j]) or toplevel_pat.match(lines[j]):
            end = j
            break
    return start, end


# --- isolation todo checks (T1-T6) ---


def check_isolation_todo(base_content, live_content):
    # T1
    fm = extract_frontmatter_region(live_content)
    fm_lines = fm.split("\n") if fm is not None else []
    target = ["severity: minor", "platform: windows", "ready: live-gate"]
    counts = {t: fm_lines.count(t) for t in target}
    consecutive_ok = any(
        fm_lines[i : i + 3] == target for i in range(max(0, len(fm_lines) - 2))
    )
    if consecutive_ok and all(v == 1 for v in counts.values()):
        ok("T1-frontmatter-fields")
    else:
        bad("T1-frontmatter-fields", f"consecutive={consecutive_ok} counts={counts}")

    # T2
    expected_prefix = None
    swapped, c1 = swap_unique_line(base_content, "platform: linux", "platform: windows")
    if c1 != 1:
        bad("T2-prefix-byte-identical", f"base 'platform: linux' line count = {c1}")
    else:
        swapped2, c2 = swap_unique_line(swapped, "ready: human", "ready: live-gate")
        if c2 != 1:
            bad("T2-prefix-byte-identical", f"base 'ready: human' line count = {c2}")
        else:
            if live_content.startswith(swapped2):
                ok("T2-prefix-byte-identical")
                expected_prefix = swapped2
            else:
                off = first_diff_offset(live_content, swapped2)
                bad("T2-prefix-byte-identical", f"diverges at offset {off}")

    # T3 / T4
    if expected_prefix is None:
        bad("T3-suffix-heading", "undecidable: T2 failed")
        bad("T4-suffix-literals", "undecidable: T2 failed")
    else:
        suffix = live_content[len(expected_prefix) :]
        suffix_lines = suffix.split("\n")
        first_line = first_nonblank(suffix_lines)
        heading_ok = first_line is not None and first_line.startswith(
            "## Decision (2026-09-29)"
        )
        live_lines = live_content.split("\n")
        decision_count = sum(
            1 for l in live_lines if l.startswith("## Decision (2026-09-29)")
        )
        the_decision_count = sum(1 for l in live_lines if l == "## The decision")
        windows_unverified_count = sum(
            1 for l in live_lines if l == "## Windows: UNVERIFIED"
        )
        if (
            heading_ok
            and decision_count == 1
            and the_decision_count == 1
            and windows_unverified_count == 1
        ):
            ok("T3-suffix-heading")
        else:
            bad(
                "T3-suffix-heading",
                f"heading_ok={heading_ok} decision_count={decision_count} "
                f"the_decision_count={the_decision_count} "
                f"windows_unverified_count={windows_unverified_count}",
            )

        literals = [
            "260929-9qr",
            "one shared cookie jar",
            "accepted limitation",
            "not a blocker",
            "data_store_identifier",
            "WebKitWebContext",
            "store_embed_open",
            "platform: windows",
            "ready: live-gate",
            "38-E01",
            "38-E03",
            "38-E04",
            "38-VERIFICATION.md",
            "2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md",
            "No code was written",
        ]
        missing = [l for l in literals if l not in suffix]
        if not missing:
            ok("T4-suffix-literals")
        else:
            bad("T4-suffix-literals", f"missing: {missing}")

    # T5
    iso_abs = os.path.join(ROOT, ISO)
    if not os.path.isfile(iso_abs):
        bad("T5-stays-in-pending", "file missing at pending/ path")
    else:
        completed_path = os.path.join(COMPLETED_DIR, os.path.basename(ISO))
        if os.path.isfile(completed_path):
            bad("T5-stays-in-pending", f"also exists at {completed_path}")
        else:
            ok("T5-stays-in-pending")

    # T6
    src_dir = os.path.join(ROOT, "src-tauri/src")
    hits = []
    for dirpath, _dirnames, filenames in os.walk(src_dir):
        for fn in filenames:
            p = os.path.join(dirpath, fn)
            try:
                with open(p, "r", encoding="utf-8", errors="ignore") as f:
                    if "data_store_identifier" in f.read():
                        hits.append(os.path.relpath(p, ROOT))
            except OSError:
                continue
    if not hits:
        ok("T6-macos-parity-no-identifier-in-src")
    else:
        bad("T6-macos-parity-no-identifier-in-src", f"found in: {hits}")


# --- positioning todo check (P1) ---


def check_positioning(base_content, live_content, positioning_flag):
    if not positioning_flag:
        if live_content == base_content:
            ok("P1-positioning-unchanged")
        else:
            bad("P1-positioning-unchanged", "live differs from base without --positioning")
        return

    if not live_content.startswith(base_content):
        off = first_diff_offset(live_content, base_content)
        bad("P1-positioning-prefix", f"diverges at offset {off}")
        return
    ok("P1-positioning-prefix")

    suffix = live_content[len(base_content) :]
    suffix_lines = suffix.split("\n")
    first_line = first_nonblank(suffix_lines)
    heading_ok = first_line is not None and first_line.startswith(
        "## Addendum (2026-09-29)"
    )
    live_lines = live_content.split("\n")
    addendum_count = sum(1 for l in live_lines if l.startswith("## Addendum (2026-09-29)"))
    decision_0928_count = sum(
        1 for l in live_lines if l.startswith("## Decision (2026-09-28)")
    )
    if heading_ok and addendum_count == 1 and decision_0928_count == 1:
        ok("P1-positioning-heading")
    else:
        bad(
            "P1-positioning-heading",
            f"heading_ok={heading_ok} addendum_count={addendum_count} "
            f"decision_0928_count={decision_0928_count}",
        )

    literals = [
        "260929-9qr",
        "one shared cookie jar",
        "2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md",
        "data_store_identifier",
        "ready: code",
    ]
    missing = [l for l in literals if l not in suffix]
    if not missing:
        ok("P1-positioning-literals")
    else:
        bad("P1-positioning-literals", f"missing: {missing}")


# --- ledger checks (L1-L11) ---


def check_ledger(base_content, live_content, items, deferral_flag):
    base_region = extract_frontmatter_region(base_content)
    live_region = extract_frontmatter_region(live_content)

    base_doc = None
    live_doc = None
    parse_errs = []
    try:
        base_doc = yaml.safe_load(base_region) if base_region is not None else None
    except yaml.YAMLError as e:
        parse_errs.append(f"base: {e}")
    try:
        live_doc = yaml.safe_load(live_region) if live_region is not None else None
    except yaml.YAMLError as e:
        parse_errs.append(f"live: {e}")

    if isinstance(base_doc, dict) and isinstance(live_doc, dict):
        ok("L1-both-parse")
    else:
        bad(
            "L1-both-parse",
            f"base_type={type(base_doc).__name__} live_type={type(live_doc).__name__} "
            f"errors={parse_errs}",
        )
        for check in [
            "L2-top-level-unchanged",
            "L3-same-ids-same-order",
            "L4-untouched-items-unchanged",
            "L10-deferral-note",
            "L11-line-count-delta",
        ]:
            bad(check, "undecidable: L1 failed")
        for iid in items:
            for prefix in ["L5-keyset", "L5-other-fields", "L6-newfield-content", "L7-newfield-position", "L8-clause-substitution", "L9-blocked-by-content"]:
                bad(f"{prefix}-{iid}", "undecidable: L1 failed")
        return

    # L2
    ignore_top = {"deferral_note", "human_verification"}
    all_keys = set(base_doc.keys()) | set(live_doc.keys())
    top_mismatches = [
        k for k in all_keys - ignore_top if base_doc.get(k) != live_doc.get(k)
    ]
    if not top_mismatches:
        ok("L2-top-level-unchanged")
    else:
        bad("L2-top-level-unchanged", f"changed keys: {top_mismatches}")

    # L3
    base_items = base_doc.get("human_verification") or []
    live_items = live_doc.get("human_verification") or []
    base_ids = [it.get("id") for it in base_items]
    live_ids = [it.get("id") for it in live_items]
    if base_ids == live_ids:
        ok("L3-same-ids-same-order")
    else:
        bad("L3-same-ids-same-order", f"base_ids={base_ids} live_ids={live_ids}")

    base_by_id = {it.get("id"): it for it in base_items}
    live_by_id = {it.get("id"): it for it in live_items}

    # L4
    untouched_mismatches = [
        iid
        for iid in base_ids
        if iid not in items and base_by_id.get(iid) != live_by_id.get(iid)
    ]
    if not untouched_mismatches:
        ok("L4-untouched-items-unchanged")
    else:
        bad("L4-untouched-items-unchanged", f"changed: {untouched_mismatches}")

    live_raw_lines = live_content.split("\n")

    for iid in items:
        base_item = base_by_id.get(iid)
        live_item = live_by_id.get(iid)
        if base_item is None or live_item is None:
            for prefix in ["L5-keyset", "L5-other-fields", "L6-newfield-content", "L7-newfield-position", "L8-clause-substitution", "L9-blocked-by-content"]:
                bad(f"{prefix}-{iid}", "item missing in base or live")
            continue

        base_keys = set(base_item.keys())
        live_keys = set(live_item.keys())
        expected_keys = base_keys | {NEW_FIELD}
        if live_keys == expected_keys:
            ok(f"L5-keyset-{iid}")
        else:
            bad(
                f"L5-keyset-{iid}",
                f"live_keys={sorted(live_keys)} expected={sorted(expected_keys)}",
            )

        other_mismatches = [
            k
            for k in base_keys - {"blocked_by", NEW_FIELD}
            if base_item.get(k) != live_item.get(k)
        ]
        if not other_mismatches:
            ok(f"L5-other-fields-{iid}")
        else:
            bad(f"L5-other-fields-{iid}", f"changed: {other_mismatches}")

        # L6
        new_field_val = live_item.get(NEW_FIELD)
        base_blocked_by = base_item.get("blocked_by")
        if (
            isinstance(new_field_val, str)
            and "260929-9qr" in new_field_val
            and "NOT a discharge" in new_field_val
            and isinstance(base_blocked_by, str)
            and base_blocked_by in new_field_val
        ):
            ok(f"L6-newfield-content-{iid}")
        else:
            bad(
                f"L6-newfield-content-{iid}",
                "missing required literal(s), or base blocked_by not quoted verbatim",
            )

        # L7
        block = find_item_block(live_raw_lines, iid)
        target_prefix = f"    {NEW_FIELD}:"
        prev_prefix = "    linux_rescoped_2026_09_28:"
        if block is None:
            bad(f"L7-newfield-position-{iid}", "item block not found in raw live text")
        else:
            s, e = block
            block_lines = live_raw_lines[s:e]
            nf_idxs = [k for k, l in enumerate(block_lines) if l.startswith(target_prefix)]
            if len(nf_idxs) == 1:
                k = nf_idxs[0]
                prev_ok = k > 0 and block_lines[k - 1].startswith(prev_prefix)
                if prev_ok:
                    ok(f"L7-newfield-position-{iid}")
                else:
                    prev_line = block_lines[k - 1] if k > 0 else None
                    bad(
                        f"L7-newfield-position-{iid}",
                        f"previous line was not linux_rescoped_2026_09_28: {prev_line!r}",
                    )
            else:
                bad(f"L7-newfield-position-{iid}", f"found {len(nf_idxs)} matches at 4-space indent")

        # L8
        old_clause = OLD_CLAUSE.get(iid)
        live_bb = live_item.get("blocked_by")
        if (
            not isinstance(base_blocked_by, str)
            or not isinstance(live_bb, str)
            or old_clause is None
        ):
            bad(f"L8-clause-substitution-{iid}", "missing blocked_by or OLD_CLAUSE mapping")
        else:
            occ = base_blocked_by.count(old_clause)
            if occ != 1:
                bad(f"L8-clause-substitution-{iid}", f"OLD_CLAUSE occurs {occ} times in base")
            else:
                idx = base_blocked_by.index(old_clause)
                before = base_blocked_by[:idx]
                after = base_blocked_by[idx + len(old_clause) :]
                starts_ok = live_bb.startswith(before)
                ends_ok = live_bb.endswith(after)
                longer_ok = len(live_bb) > len(before) + len(after)
                middle = live_bb[len(before) : len(live_bb) - len(after)] if after else live_bb[len(before) :]
                middle_ok = ("260929-9qr" in middle) and ("no longer" in middle)
                extra_ok = True
                if iid == "38-E04":
                    extra_ok = ISO in middle
                if starts_ok and ends_ok and longer_ok and middle_ok and extra_ok:
                    ok(f"L8-clause-substitution-{iid}")
                else:
                    bad(
                        f"L8-clause-substitution-{iid}",
                        f"starts_ok={starts_ok} ends_ok={ends_ok} longer_ok={longer_ok} "
                        f"middle_ok={middle_ok} extra_ok={extra_ok} middle={middle!r}",
                    )

        # L9
        if isinstance(live_bb, str):
            paths_ok = (POS in live_bb) and (ISO in live_bb) and ("option (a)" in live_bb)
            neg_phrases = [
                "gates whether a linux embed ships",
                "before any linux embed ships",
                "also blocked on",
            ]
            live_bb_lower = live_bb.lower()
            neg_hits = [p for p in neg_phrases if p in live_bb_lower]
            if paths_ok and not neg_hits:
                ok(f"L9-blocked-by-content-{iid}")
            else:
                bad(
                    f"L9-blocked-by-content-{iid}",
                    f"paths_ok={paths_ok} neg_hits={neg_hits}",
                )
        else:
            bad(f"L9-blocked-by-content-{iid}", "live blocked_by is not a string")

    # L10
    base_dn = base_doc.get("deferral_note")
    live_dn = live_doc.get("deferral_note")
    if deferral_flag:
        if isinstance(base_dn, str) and isinstance(live_dn, str) and live_dn.startswith(base_dn):
            remainder = live_dn[len(base_dn) :]
            if (
                "AMENDED AGAIN 2026-09-29" in remainder
                and "260929-9qr" in remainder
                and "one shared cookie jar" in remainder
            ):
                ok("L10-deferral-note")
            else:
                bad("L10-deferral-note", f"remainder missing required literal(s): {remainder!r}")
        else:
            bad("L10-deferral-note", "live does not start with base, or not strings")
    else:
        if base_dn == live_dn:
            ok("L10-deferral-note")
        else:
            bad("L10-deferral-note", "deferral_note changed without --deferral-note")

    # L11
    base_lc = base_content.count("\n")
    live_lc = live_content.count("\n")
    expected_delta = len(items)
    if live_lc - base_lc == expected_delta:
        ok("L11-line-count-delta")
    else:
        bad(
            "L11-line-count-delta",
            f"base={base_lc} live={live_lc} delta={live_lc - base_lc} expected={expected_delta}",
        )


# --- STATE.md checks (S1-S5) ---


def check_state(base_content, live_content):
    base_lines = base_content.split("\n")
    live_lines = live_content.split("\n")
    row_prefix = "| 260929-9qr |"

    base_row_count = sum(1 for l in base_lines if l.startswith(row_prefix))
    live_row_idxs = [i for i, l in enumerate(live_lines) if l.startswith(row_prefix)]
    if base_row_count == 0 and len(live_row_idxs) == 1:
        ok("S1-row-appears-once")
    else:
        bad(
            "S1-row-appears-once",
            f"base_row_count={base_row_count} live_row_count={len(live_row_idxs)}",
        )

    if live_row_idxs:
        ridx = live_row_idxs[0]
        row = live_lines[ridx]
        hash_proc = subprocess.run(
            ["git", "log", "-1", "--format=%h", "--grep=^docs(quick-260929-9qr)"],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        short_hash = hash_proc.stdout.strip()
        expected_suffix = (
            " | [260929-9qr-action-the-pending-todo-linux-data-store]"
            "(.planning/quick/260929-9qr-action-the-pending-todo-linux-data-store/) |"
        )
        checks = {
            "date": " | 2026-09-29 | " in row,
            "hash_nonempty": bool(short_hash),
            "hash_present": bool(short_hash) and short_hash in row,
            "suffix": row.endswith(expected_suffix),
        }
        if all(checks.values()):
            ok("S2-row-content")
        else:
            bad("S2-row-content", f"{checks} short_hash={short_hash!r}")

        if ridx + 2 < len(live_lines):
            blank_ok = live_lines[ridx + 1] == ""
            next_ok = live_lines[ridx + 2] == "## Deferred Items"
            if blank_ok and next_ok:
                ok("S3-row-followed-by-blank-and-header")
            else:
                bad(
                    "S3-row-followed-by-blank-and-header",
                    f"blank_ok={blank_ok} next_line={live_lines[ridx + 2]!r}",
                )
        else:
            bad("S3-row-followed-by-blank-and-header", "not enough lines after row")
    else:
        bad("S2-row-content", "undecidable: S1 row not found")
        bad("S3-row-followed-by-blank-and-header", "undecidable: S1 row not found")

    la_prefix = "Last activity: "
    la_idxs = [i for i, l in enumerate(live_lines) if l.startswith(la_prefix)]
    expected_la_prefix = "Last activity: 2026-09-29 -- Completed quick task 260929-9qr: "
    if len(la_idxs) == 1 and live_lines[la_idxs[0]].startswith(expected_la_prefix):
        ok("S4-last-activity-rotated")
    else:
        bad("S4-last-activity-rotated", f"count={len(la_idxs)} idxs={la_idxs}")

    if live_row_idxs and len(la_idxs) == 1:
        ridx = live_row_idxs[0]
        laidx = la_idxs[0]
        recon = list(live_lines)
        del recon[ridx]
        la_idx2 = laidx if ridx > laidx else laidx - 1
        if 0 <= la_idx2 < len(recon) and recon[la_idx2] == live_lines[laidx]:
            if la_idx2 + 1 < len(recon) and recon[la_idx2 + 1] == "":
                del recon[la_idx2 : la_idx2 + 2]
                if la_idx2 < len(recon) and recon[la_idx2].startswith("Previous activity: "):
                    recon[la_idx2] = "Last activity: " + recon[la_idx2][len("Previous activity: ") :]
                    reconstructed = "\n".join(recon)
                    if reconstructed == base_content:
                        ok("S5-reconstruction-matches-base")
                    else:
                        off = first_diff_offset(reconstructed, base_content)
                        bad(
                            "S5-reconstruction-matches-base",
                            f"diverges at offset {off} (recon_len={len(reconstructed)} "
                            f"base_len={len(base_content)})",
                        )
                else:
                    bad(
                        "S5-reconstruction-matches-base",
                        "line after deleted block does not start with 'Previous activity: '",
                    )
            else:
                bad("S5-reconstruction-matches-base", "line after Last activity is not blank")
        else:
            bad("S5-reconstruction-matches-base", "index mismatch while deleting Last activity line")
    else:
        bad("S5-reconstruction-matches-base", "undecidable: S1 or S4 prerequisite failed")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default=PRE_EDIT_BASE)
    parser.add_argument("--print-base", action="store_true")
    parser.add_argument("--items", default="38-E03,38-E04")
    parser.add_argument("--deferral-note", action="store_true")
    parser.add_argument("--positioning", action="store_true")
    parser.add_argument("--state", action="store_true")
    parser.add_argument("--print-counts", action="store_true")
    args = parser.parse_args()

    if args.print_base:
        print(PRE_EDIT_BASE)
        return 0

    if args.print_counts:
        base_ledger_content = git_show(args.base, LEDGER_REL)
        region = extract_frontmatter_region(base_ledger_content)
        doc = yaml.safe_load(region) if region is not None else None
        doc = doc if isinstance(doc, dict) else {}
        o = len(doc.get("human_verification") or [])
        d = len(doc.get("human_verification_discharged") or [])
        r = len(doc.get("human_verification_retired") or [])
        print(f"{o} {d} {r}")
        return 0

    items = [x for x in args.items.split(",") if x]

    base_iso = git_show(args.base, ISO)
    live_iso = read_disk(ISO)
    check_isolation_todo(base_iso, live_iso)

    base_pos = git_show(args.base, POS)
    live_pos = read_disk(POS)
    check_positioning(base_pos, live_pos, args.positioning)

    base_ledger = git_show(args.base, LEDGER_REL)
    live_ledger = read_disk(LEDGER_REL)
    check_ledger(base_ledger, live_ledger, items, args.deferral_note)

    if args.state:
        base_state = git_show(args.base, STATE_REL)
        live_state = read_disk(STATE_REL)
        check_state(base_state, live_state)

    print_results()
    return 1 if any_fail() else 0


if __name__ == "__main__":
    sys.exit(main())
