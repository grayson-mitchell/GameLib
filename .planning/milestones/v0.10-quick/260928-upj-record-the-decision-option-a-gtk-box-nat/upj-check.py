#!/usr/bin/env python3
"""
upj-check.py — quick-task harness for quick 260928-upj.

IT IS A QUICK-TASK HARNESS, NOT A CI GATE. It is not wired into
`pnpm planning-gates` or anywhere else, and nothing runs it automatically. It
exists to prove, against the pre-edit commit, that quick 260928-upj's two
edits — recording the operator's locked option-(a) decision on the Linux
`add_child` positioning todo, and re-scoping the Linux branches of Phase 38
ledger items `38-E03`/`38-E04` in `38-VERIFICATION.md` — changed exactly what
they claim to change and nothing else.

Follows the `ledger-check.cjs` output convention: one line per check
(`PASS <check>` or `PASS <check>: <detail>` / `FAIL <check>: <detail>`), every
check runs (failures do not stop the rest of the checks from running, except
where a later check is genuinely undecidable without an earlier one — for
example, a per-item check when the item itself cannot be found), and the exit
code is 1 if any check fails, 0 otherwise.

Usage:
  python3 upj-check.py [--base REV] [--items CSV] [--deferral-note]
  python3 upj-check.py --print-counts [--base REV]

  --base REV          Revision to diff against (default HEAD).
  --items CSV         Comma-separated ledger item ids to check as edited
                       (default 38-E03,38-E04).
  --deferral-note      Assert the deferral_note amendment. Without this flag,
                       assert deferral_note is unchanged from base.
  --print-counts       Print the three human_verification* array lengths of
                       the BASE ledger as "O D R" on one line, then exit 0
                       without running any other check.
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
TODO_REL = (
    ".planning/todos/pending/"
    "2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md"
)
SIBLING_TODO_REL = (
    ".planning/todos/pending/"
    "2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md"
)
LEDGER_REL = (
    ".planning/phases/38-deferred-hardware-and-environment-uat-gates-windows-linux-ma/"
    "38-VERIFICATION.md"
)
COMPLETED_DIR = os.path.join(ROOT, ".planning/todos/completed")

# Marker each edited field is split on, to isolate the Linux segment from the
# macOS/Windows text that must stay untouched. Copied verbatim from the plan's
# planning_observations "Split markers, counted per field" note.
FIELD_MARKERS = {
    "blocked_by": "(c) Linux",
    "why_human": "Linux: ",
    "platform_gate": "Linux: ",
}

# Fields quick 260928-upj is allowed to rewrite the Linux segment of, per item.
EDITED_FIELDS = {
    "38-E03": ["blocked_by", "platform_gate"],
    "38-E04": ["why_human", "blocked_by", "platform_gate"],
}

# Case-insensitive phrases that describe the decision as still open. A live
# Linux segment must not contain any of these — the decision is now locked.
PENDING_DECISION_PHRASES = [
    "decision in ",
    "decision lands",
    "positioning decision",
    "is resolved",
    "until it lands",
]

# Markers the appended todo decision section must contain, verbatim.
TODO_SUFFIX_MARKERS = [
    "option (a)",
    "260928-upj",
    "(b)",
    "(c)",
    "(d)",
    "38-E03",
    "38-E04",
    "38-VERIFICATION.md",
    "ready: code",
    "live-gate",
    "UNVERIFIED",
    "No code was written",
    "2026-09-28-linux-embed-data-store-identifier-is-a-silent-no-op.md",
]

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


def split_lines(content):
    return re.split(r"\r\n|\n", content)


def git_show(rev, relpath):
    proc = subprocess.run(
        ["git", "show", f"{rev}:{relpath}"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"git show {rev}:{relpath} failed: {proc.stderr.strip()}"
        )
    return proc.stdout


def read_disk(relpath):
    with open(os.path.join(ROOT, relpath), "r", encoding="utf-8") as f:
        return f.read()


def extract_frontmatter_region(content):
    """The text between the first '---' line and the next '---' line."""
    lines = split_lines(content)
    if not lines or lines[0] != "---":
        return None
    for i in range(1, len(lines)):
        if lines[i] == "---":
            return "\n".join(lines[1:i])
    return None


# --- todo checks ---


def check_todo(base_content, live_content):
    base_lines = split_lines(base_content)
    live_lines = split_lines(live_content)

    # Check 1: frontmatter triple, in order, exactly one each.
    fm_region = extract_frontmatter_region(live_content)
    fm_lines = split_lines(fm_region) if fm_region is not None else []
    sev_idx = [i for i, l in enumerate(fm_lines) if l == "severity: minor"]
    plat_idx = [i for i, l in enumerate(fm_lines) if l == "platform: linux"]
    ready_idx = [i for i, l in enumerate(fm_lines) if l == "ready: code"]
    if (
        len(sev_idx) == 1
        and len(plat_idx) == 1
        and len(ready_idx) == 1
        and plat_idx[0] == sev_idx[0] + 1
        and ready_idx[0] == plat_idx[0] + 1
    ):
        ok("todo-frontmatter-order")
    else:
        bad(
            "todo-frontmatter-order",
            f"severity@{sev_idx} platform@{plat_idx} ready@{ready_idx} "
            "(expected exactly one each, consecutive, in that order)",
        )

    # Check 2: base has exactly one 'ready: human' line; live starts with base
    # text after that one line is swapped to 'ready: code'.
    ready_human_idx = [i for i, l in enumerate(base_lines) if l == "ready: human"]
    expected_prefix = None
    if len(ready_human_idx) == 1:
        ok("todo-base-ready-human-unique")
        idx = ready_human_idx[0]
        prefix_lines = list(base_lines)
        prefix_lines[idx] = "ready: code"
        expected_prefix = "\n".join(prefix_lines)
        if live_content.startswith(expected_prefix):
            ok("todo-prefix-byte-identical")
        else:
            bad(
                "todo-prefix-byte-identical",
                "live file does not start with base text (with only "
                "'ready: human' -> 'ready: code' swapped)",
            )
    else:
        bad(
            "todo-base-ready-human-unique",
            f"found {len(ready_human_idx)} lines equal to 'ready: human' in base, expected 1",
        )

    # Check 3: appended suffix begins (after leading blank lines) with the
    # decision heading; both headings appear exactly once in the whole file.
    decision_heading_count = sum(
        1 for l in live_lines if l.startswith("## Decision (2026-09-28)")
    )
    original_heading_count = sum(
        1 for l in live_lines if l == "## The decision (options, not a recommendation)"
    )
    if decision_heading_count == 1:
        ok("todo-decision-heading-unique")
    else:
        bad(
            "todo-decision-heading-unique",
            f"found {decision_heading_count} lines starting '## Decision (2026-09-28)', expected 1",
        )
    if original_heading_count == 1:
        ok("todo-original-heading-preserved")
    else:
        bad(
            "todo-original-heading-preserved",
            f"found {original_heading_count} lines equal to the original options heading, expected 1",
        )

    suffix = None
    if expected_prefix is not None and live_content.startswith(expected_prefix):
        suffix = live_content[len(expected_prefix):]
        stripped_suffix = suffix.lstrip("\n")
        if stripped_suffix.startswith("## Decision (2026-09-28)"):
            ok("todo-suffix-starts-with-decision-heading")
        else:
            bad(
                "todo-suffix-starts-with-decision-heading",
                "appended suffix does not begin with the decision heading after leading blank lines",
            )
    else:
        stripped_suffix = ""
        bad(
            "todo-suffix-starts-with-decision-heading",
            "cannot compute appended suffix because the byte-identical-prefix check failed",
        )

    # Check 4: suffix contains every required literal marker.
    missing = [m for m in TODO_SUFFIX_MARKERS if m not in stripped_suffix]
    if not missing:
        ok("todo-suffix-markers")
    else:
        bad("todo-suffix-markers", f"missing from appended suffix: {missing}")

    # Check 5: todo has not moved to completed/.
    basename = os.path.basename(TODO_REL)
    completed_path = os.path.join(COMPLETED_DIR, basename)
    if not os.path.exists(completed_path):
        ok("todo-not-in-completed")
    else:
        bad("todo-not-in-completed", f"found {completed_path}")


# --- ledger checks ---


def check_ledger(base_content, live_content, items, deferral_flag):
    base_region = extract_frontmatter_region(base_content)
    live_region = extract_frontmatter_region(live_content)
    base_doc = None
    live_doc = None
    parse_ok = True

    if base_region is None:
        bad("ledger-base-parse", "no frontmatter fence (---) found in base")
        parse_ok = False
    else:
        try:
            base_doc = yaml.safe_load(base_region)
        except Exception as e:  # noqa: BLE001 - report any YAML error verbatim
            bad("ledger-base-parse", str(e))
            parse_ok = False

    if live_region is None:
        bad("ledger-live-parse", "no frontmatter fence (---) found in live")
        parse_ok = False
    else:
        try:
            live_doc = yaml.safe_load(live_region)
        except Exception as e:  # noqa: BLE001
            bad("ledger-live-parse", str(e))
            parse_ok = False

    if not parse_ok or not isinstance(base_doc, dict) or not isinstance(live_doc, dict):
        bad(
            "ledger-parse-mapping",
            "one or both frontmatters did not parse to a mapping; "
            "remaining ledger checks skipped",
        )
        return
    ok("ledger-parse-mapping")

    # Check 2: every top-level key except deferral_note and human_verification
    # is parsed-equal to base.
    excluded_top = {"deferral_note", "human_verification"}
    top_ok = True
    for key in sorted(set(base_doc.keys()) | set(live_doc.keys())):
        if key in excluded_top:
            continue
        if base_doc.get(key) != live_doc.get(key):
            bad("ledger-top-level-unchanged", f"top-level key '{key}' differs from base")
            top_ok = False
    if top_ok:
        ok("ledger-top-level-unchanged")

    base_hv = base_doc.get("human_verification") or []
    live_hv = live_doc.get("human_verification") or []
    base_ids = [e.get("id") if isinstance(e, dict) else None for e in base_hv]
    live_ids = [e.get("id") if isinstance(e, dict) else None for e in live_hv]

    # Check 3: same ids, same order.
    if base_ids == live_ids:
        ok("ledger-hv-ids-same-order")
    else:
        bad(
            "ledger-hv-ids-same-order",
            f"base ids {base_ids} != live ids {live_ids}",
        )

    base_by_id = {e.get("id"): e for e in base_hv if isinstance(e, dict)}
    live_by_id = {e.get("id"): e for e in live_hv if isinstance(e, dict)}

    # Check 4: every item whose id is NOT in --items is parsed-equal to base.
    unedited_ok = True
    for id_ in base_ids:
        if id_ in items:
            continue
        if base_by_id.get(id_) != live_by_id.get(id_):
            bad("ledger-unedited-items-unchanged", f"item '{id_}' differs from base")
            unedited_ok = False
    if unedited_ok:
        ok("ledger-unedited-items-unchanged")

    for id_ in items:
        base_entry = base_by_id.get(id_)
        live_entry = live_by_id.get(id_)
        if base_entry is None or live_entry is None:
            bad(
                f"ledger-item-exists:{id_}",
                f"missing in base ({base_entry is None}) or live ({live_entry is None})",
            )
            continue

        edited_fields = set(EDITED_FIELDS.get(id_, []))

        # Check 5: live key set == base key set + linux_rescoped_2026_09_28;
        # every key outside the edited set is parsed-equal to base.
        expected_keys = set(base_entry.keys()) | {"linux_rescoped_2026_09_28"}
        actual_keys = set(live_entry.keys())
        if actual_keys == expected_keys:
            ok(f"ledger-keyset:{id_}")
        else:
            bad(
                f"ledger-keyset:{id_}",
                f"expected keys {sorted(expected_keys)}, found {sorted(actual_keys)}",
            )

        other_fields_ok = True
        for key in base_entry.keys():
            if key in edited_fields:
                continue
            if base_entry.get(key) != live_entry.get(key):
                bad(
                    f"ledger-item-field-unchanged:{id_}:{key}",
                    "differs from base but is outside the edited field set",
                )
                other_fields_ok = False
        if other_fields_ok:
            ok(f"ledger-item-fields-unchanged:{id_}")

        # Check 6: linux_rescoped_2026_09_28 content.
        new_field = live_entry.get("linux_rescoped_2026_09_28")
        if isinstance(new_field, str):
            required_markers = ["260928-upj", "option (a)", "NOT a discharge"]
            missing_markers = [m for m in required_markers if m not in new_field]
            missing_base_values = []
            for f in sorted(edited_fields):
                bv = base_entry.get(f)
                if isinstance(bv, str) and bv not in new_field:
                    missing_base_values.append(f)
            if not missing_markers and not missing_base_values:
                ok(f"ledger-new-field-content:{id_}")
            else:
                bad(
                    f"ledger-new-field-content:{id_}",
                    f"missing markers: {missing_markers}; "
                    f"base values not quoted verbatim for fields: {missing_base_values}",
                )
        else:
            bad(
                f"ledger-new-field-content:{id_}",
                "linux_rescoped_2026_09_28 is absent or not a string on the live entry",
            )

        # Check 7: the new field's physical line immediately follows the
        # item's regated_2026_09_28 line, in the raw live text.
        live_lines = split_lines(live_content)
        start = -1
        for i, l in enumerate(live_lines):
            if f'id: "{id_}"' in l:
                start = i
                break
        if start == -1:
            bad(f"ledger-new-field-position:{id_}", "could not locate the id line in live text")
        else:
            regated_idx = None
            for i in range(start + 1, min(start + 6, len(live_lines))):
                if live_lines[i].strip().startswith("regated_2026_09_28:"):
                    regated_idx = i
                    break
            if regated_idx is None:
                bad(
                    f"ledger-new-field-position:{id_}",
                    "no regated_2026_09_28 line found within a few lines of the id line",
                )
            else:
                next_line = (
                    live_lines[regated_idx + 1] if regated_idx + 1 < len(live_lines) else ""
                )
                if next_line.strip().startswith("linux_rescoped_2026_09_28:"):
                    ok(f"ledger-new-field-position:{id_}")
                else:
                    bad(
                        f"ledger-new-field-position:{id_}",
                        f"line after regated_2026_09_28 does not start with "
                        f"linux_rescoped_2026_09_28: got {next_line!r}",
                    )

        # Check 8: split at the field marker; macOS/Windows prefix untouched,
        # Linux segment changed, mentions option (a), no stale decision phrasing.
        for field in sorted(edited_fields):
            marker = FIELD_MARKERS[field]
            base_val = base_entry.get(field)
            live_val = live_entry.get(field)
            if not isinstance(base_val, str) or not isinstance(live_val, str):
                bad(
                    f"ledger-field-split:{id_}:{field}",
                    "field is not a string in base or live",
                )
                continue
            marker_count = base_val.count(marker)
            if marker_count != 1:
                bad(
                    f"ledger-field-split:{id_}:{field}",
                    f"marker '{marker}' occurs {marker_count} times in base, expected exactly 1",
                )
                continue
            if marker not in live_val:
                bad(
                    f"ledger-field-split:{id_}:{field}",
                    f"marker '{marker}' not found in live value",
                )
                continue
            base_idx = base_val.index(marker)
            live_idx = live_val.index(marker)
            base_before, base_seg = base_val[:base_idx], base_val[base_idx:]
            live_before, live_seg = live_val[:live_idx], live_val[live_idx:]

            if live_before == base_before:
                ok(f"ledger-field-prefix-preserved:{id_}:{field}")
            else:
                bad(
                    f"ledger-field-prefix-preserved:{id_}:{field}",
                    "text before the Linux marker differs from base "
                    "(macOS/Windows branches must stay untouched)",
                )

            if live_seg != base_seg:
                ok(f"ledger-field-linux-segment-changed:{id_}:{field}")
            else:
                bad(
                    f"ledger-field-linux-segment-changed:{id_}:{field}",
                    "Linux segment is byte-identical to base (not re-scoped)",
                )

            if "option (a)" in live_seg:
                ok(f"ledger-field-mentions-option-a:{id_}:{field}")
            else:
                bad(
                    f"ledger-field-mentions-option-a:{id_}:{field}",
                    "Linux segment does not mention 'option (a)'",
                )

            lower_seg = live_seg.lower()
            found_phrases = [p for p in PENDING_DECISION_PHRASES if p in lower_seg]
            if not found_phrases:
                ok(f"ledger-field-no-pending-phrases:{id_}:{field}")
            else:
                bad(
                    f"ledger-field-no-pending-phrases:{id_}:{field}",
                    f"Linux segment still contains pending-decision phrasing: {found_phrases}",
                )

        # Check 9: blocked_by names both todo paths in full; 38-E03's
        # blocked_by and every platform_gate keep their base final sentence.
        if "blocked_by" in edited_fields:
            live_bb = live_entry.get("blocked_by", "")
            missing_paths = [
                p for p in (TODO_REL, SIBLING_TODO_REL) if p not in live_bb
            ]
            if not missing_paths:
                ok(f"ledger-blocked-by-both-paths:{id_}")
            else:
                bad(f"ledger-blocked-by-both-paths:{id_}", f"missing path(s): {missing_paths}")

        if id_ == "38-E03" and "blocked_by" in edited_fields:
            base_bb = base_entry.get("blocked_by", "")
            final_marker = "Branch (c) is the deliberate exception recorded in"
            fidx = base_bb.find(final_marker)
            if fidx == -1:
                bad(
                    "ledger-38-E03-blocked-by-final-sentence-in-base",
                    "base blocked_by lacks the expected final sentence",
                )
            else:
                final_sentence = base_bb[fidx:]
                if live_entry.get("blocked_by", "").endswith(final_sentence):
                    ok("ledger-38-E03-blocked-by-final-sentence-preserved")
                else:
                    bad(
                        "ledger-38-E03-blocked-by-final-sentence-preserved",
                        "live blocked_by does not end with base's final sentence verbatim",
                    )

        if "platform_gate" in edited_fields:
            base_pg = base_entry.get("platform_gate", "")
            last_idx = base_pg.rfind("macOS ")
            if last_idx == -1:
                bad(
                    f"ledger-platform-gate-final-sentence-in-base:{id_}",
                    "base platform_gate has no 'macOS ' occurrence",
                )
            else:
                final_sentence = base_pg[last_idx:]
                live_pg = live_entry.get("platform_gate", "")
                if live_pg.endswith(final_sentence):
                    ok(f"ledger-platform-gate-final-sentence-preserved:{id_}")
                else:
                    bad(
                        f"ledger-platform-gate-final-sentence-preserved:{id_}",
                        "live platform_gate does not end with base's final sentence verbatim",
                    )

    # Check 10: deferral_note.
    base_dn = base_doc.get("deferral_note")
    live_dn = live_doc.get("deferral_note")
    if deferral_flag:
        if (
            isinstance(base_dn, str)
            and isinstance(live_dn, str)
            and live_dn.startswith(base_dn)
        ):
            remainder = live_dn[len(base_dn):]
            if "260928-upj" in remainder and "option (a)" in remainder:
                ok("ledger-deferral-note-amended")
            else:
                bad(
                    "ledger-deferral-note-amended",
                    f"appended remainder missing required markers: {remainder!r}",
                )
        else:
            bad(
                "ledger-deferral-note-amended",
                "live deferral_note does not start with base's value",
            )
    else:
        if base_dn == live_dn:
            ok("ledger-deferral-note-unchanged")
        else:
            bad(
                "ledger-deferral-note-unchanged",
                "deferral_note changed but --deferral-note was not passed",
            )

    # Check 11: physical line count delta.
    base_line_count = len(split_lines(base_content))
    live_line_count = len(split_lines(live_content))
    expected_count = base_line_count + len(items)
    if live_line_count == expected_count:
        ok("ledger-line-count-delta")
    else:
        bad(
            "ledger-line-count-delta",
            f"expected {expected_count} (base {base_line_count} + {len(items)} new lines), "
            f"found {live_line_count}",
        )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="HEAD")
    parser.add_argument("--items", default="38-E03,38-E04")
    parser.add_argument("--deferral-note", action="store_true")
    parser.add_argument("--print-counts", action="store_true")
    args = parser.parse_args()

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

    base_todo_content = git_show(args.base, TODO_REL)
    live_todo_content = read_disk(TODO_REL)
    base_ledger_content = git_show(args.base, LEDGER_REL)
    live_ledger_content = read_disk(LEDGER_REL)

    check_todo(base_todo_content, live_todo_content)
    check_ledger(base_ledger_content, live_ledger_content, items, args.deferral_note)

    print_results()
    return 1 if any_fail() else 0


if __name__ == "__main__":
    sys.exit(main())
