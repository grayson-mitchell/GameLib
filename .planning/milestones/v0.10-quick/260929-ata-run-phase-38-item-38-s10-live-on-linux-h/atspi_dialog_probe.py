#!/usr/bin/env python3
"""
atspi_dialog_probe.py -- AT-SPI text-tree instrument for Phase 38 Linux sittings.

Exists for Phase 38's LIVE Linux UAT sittings as the SECOND, pixel-independent
instrument alongside `linux_sitting_capture.py` (visual). Where the visual
instrument answers "what does the screen show", this probe answers "what does
the accessibility tree expose" -- reading the AT-SPI text-tree the running
GameLib webview exposes through WebKitGTK's accessibility bridge. Written for
quick 260929-ata (Phase 38 sitting 7, `38-S10`); reusable for any later Linux
sitting that needs a text-tree region check inside a specific dialog.

Dependencies: Python 3 and `gi.repository.Atspi` only. No network calls.

Subcommands:
  dump --pid PID --out FILE [--max-nodes 40000]
                                 Depth-first walk of the AT-SPI desktop
                                 children matching PID (falling back to a
                                 case-insensitive "gamelib" name match if none
                                 match by pid). Writes one JSON line per node:
                                 index path, depth, role, name, capped Text-
                                 interface content, in_dialog, dialog_ordinal.
                                 Prints a one-line summary to stdout.
  regions --dump FILE --title T
                                 Reads a `dump` JSONL file and counts labelled
                                 signature-group hits, separately inside and
                                 outside dialog-role subtrees. Also prints a
                                 role-name histogram of the dialog subtree and
                                 its combo-box-role node count.
  smoke --pid PID               Runs `dump` into a temp file, then prints one
                                 PASS/FAIL line per basic health check.
"""

import argparse
import json
import re
import sys
import tempfile

MAX_TEXT_CHARS = 500

# Labelled signature groups: label -> list of case-insensitive substrings.
# Confirmed against public/locales/en/*.json at execute time (quick 260929-ata,
# 2026-09-29). A drifted catalogue value replaces the fragment here.
SIGNATURES = {
    "platform_row": [
        "select platform version to install",
    ],
    "library_dropdown": [
        "choose steam library",
    ],
    "wine_section": [
        "show wine settings",
        "wineprefix",
        "crossover bottle",
        "wine version",
        "used for every steam game that needs a bottle",
        "checking install options",
    ],
    "free_space_line": [
        "space available",
    ],
    "content_light_off": [
        "turn on native steam installs in settings",
    ],
    "content_light_single": [
        "only one steam library on this system",
    ],
}


def atspi():
    import gi

    gi.require_version("Atspi", "2.0")
    from gi.repository import Atspi

    if not Atspi.is_initialized():
        Atspi.init()
    return Atspi


def get_text(Atspi, node):
    try:
        length = None
        try:
            length = node.get_character_count()
        except Exception:
            length = None
        if length == 0:
            return ""
        txt = Atspi.Text.get_text(node, 0, -1)
        if txt is None:
            return None
        if len(txt) > MAX_TEXT_CHARS:
            return txt[:MAX_TEXT_CHARS]
        return txt
    except Exception:
        return None


def cmd_dump(args):
    Atspi = atspi()
    desktop = Atspi.get_desktop(0)

    matched = []
    try:
        n = desktop.get_child_count()
    except Exception:
        n = 0
    for i in range(n):
        try:
            child = desktop.get_child_at_index(i)
        except Exception:
            continue
        try:
            pid = child.get_process_id()
        except Exception:
            pid = None
        if pid == args.pid:
            matched.append(child)

    if not matched:
        for i in range(n):
            try:
                child = desktop.get_child_at_index(i)
                name = child.get_name() or ""
            except Exception:
                continue
            if "gamelib" in name.lower():
                matched.append(child)

    matched_info = []
    for m in matched:
        try:
            matched_info.append({"name": m.get_name(), "pid": m.get_process_id()})
        except Exception:
            matched_info.append({"name": None, "pid": None})

    nodes_visited = 0
    dialog_nodes_found = 0
    truncated = False
    dialog_counter = [0]

    out_f = open(args.out, "w", encoding="utf-8")

    def walk(node, path, depth, dialog_ordinal):
        nonlocal nodes_visited, dialog_nodes_found, truncated
        if nodes_visited >= args.max_nodes:
            truncated = True
            return
        nodes_visited += 1

        try:
            role = node.get_role_name()
        except Exception:
            role = None
        try:
            name = node.get_name()
        except Exception:
            name = None

        is_dialog = bool(role) and role.strip().lower() == "dialog"
        this_ordinal = dialog_ordinal
        if is_dialog:
            dialog_counter[0] += 1
            this_ordinal = dialog_counter[0]
            dialog_nodes_found += 1

        in_dialog = this_ordinal > 0

        text = get_text(Atspi, node)

        record = {
            "path": path,
            "depth": depth,
            "role": role,
            "name": name,
            "text": text,
            "in_dialog": in_dialog,
            "dialog_ordinal": this_ordinal,
        }
        out_f.write(json.dumps(record, ensure_ascii=True) + "\n")

        try:
            cc = node.get_child_count()
        except Exception:
            cc = 0
        for i in range(cc):
            if nodes_visited >= args.max_nodes:
                truncated = True
                break
            try:
                c = node.get_child_at_index(i)
            except Exception:
                continue
            walk(c, path + "." + str(i), depth + 1, this_ordinal)

    for idx, m in enumerate(matched):
        walk(m, str(idx), 0, 0)

    out_f.close()

    summary = {
        "matched_apps": matched_info,
        "nodes_visited": nodes_visited,
        "dialog_nodes_found": dialog_nodes_found,
        "truncated": truncated,
        "out": args.out,
    }
    print(json.dumps(summary))
    return summary


def cmd_regions(args):
    rows = []
    with open(args.dump, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))

    def haystack(row):
        parts = []
        if row.get("name"):
            parts.append(row["name"])
        if row.get("text"):
            parts.append(row["text"])
        return " ".join(parts).lower()

    counts = {}
    for label, subs in SIGNATURES.items():
        counts[label] = {"in_dialog": 0, "outside_dialog": 0}
        for row in rows:
            hs = haystack(row)
            hits = sum(hs.count(s) for s in subs)
            if hits <= 0:
                continue
            if row.get("in_dialog"):
                counts[label]["in_dialog"] += hits
            else:
                counts[label]["outside_dialog"] += hits

    title_sub = args.title.lower()
    counts["title"] = {"in_dialog": 0, "outside_dialog": 0}
    for row in rows:
        hs = haystack(row)
        hits = hs.count(title_sub)
        if hits <= 0:
            continue
        if row.get("in_dialog"):
            counts["title"]["in_dialog"] += hits
        else:
            counts["title"]["outside_dialog"] += hits

    role_hist = {}
    combo_box_count = 0
    for row in rows:
        if not row.get("in_dialog"):
            continue
        role = (row.get("role") or "").strip().lower()
        role_hist[role] = role_hist.get(role, 0) + 1
        if role == "combo box":
            combo_box_count += 1

    print("REGIONS")
    for label in list(SIGNATURES.keys()) + ["title"]:
        c = counts[label]
        print(f"  {label}: in_dialog={c['in_dialog']} outside_dialog={c['outside_dialog']}")

    print("ROLE_HISTOGRAM (dialog subtree)")
    for role, n in sorted(role_hist.items(), key=lambda kv: -kv[1]):
        print(f"  {role}: {n}")
    print(f"COMBO_BOX_COUNT (dialog subtree): {combo_box_count}")

    return {"counts": counts, "role_histogram": role_hist, "combo_box_count": combo_box_count}


def cmd_smoke(args):
    fd, tmp_path = tempfile.mkstemp(prefix="atspi-smoke-", suffix=".jsonl")
    import os

    os.close(fd)

    summary = cmd_dump(argparse.Namespace(pid=args.pid, out=tmp_path, max_nodes=40000))

    checks = []

    matched_ok = len(summary["matched_apps"]) >= 1
    checks.append(("at-least-one-app-matched", matched_ok, summary["matched_apps"]))

    nodes_ok = summary["nodes_visited"] > 20
    checks.append(("more-than-20-nodes", nodes_ok, summary["nodes_visited"]))

    reached_web_content = False
    example = None
    with open(tmp_path, encoding="utf-8") as f:
        for line in f:
            row = json.loads(line)
            role = (row.get("role") or "").strip().lower()
            text = row.get("text")
            name = row.get("name")
            content = text or name
            if not content:
                continue
            if role in ("frame", "application", "filler"):
                continue
            if row.get("depth", 0) <= 1:
                continue
            reached_web_content = True
            example = {"path": row["path"], "role": role, "name": name, "text": text}
            break
    checks.append(("reached-web-content-beyond-chrome", reached_web_content, example))

    all_pass = True
    for label, ok, detail in checks:
        status = "PASS" if ok else "FAIL"
        if not ok:
            all_pass = False
        print(f"{status} {label}: {json.dumps(detail)}")

    print(f"SMOKE_DUMP_FILE={tmp_path}")
    return 0 if all_pass else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_dump = sub.add_parser("dump")
    p_dump.add_argument("--pid", type=int, required=True)
    p_dump.add_argument("--out", required=True)
    p_dump.add_argument("--max-nodes", type=int, default=40000, dest="max_nodes")

    p_regions = sub.add_parser("regions")
    p_regions.add_argument("--dump", required=True)
    p_regions.add_argument("--title", required=True)

    p_smoke = sub.add_parser("smoke")
    p_smoke.add_argument("--pid", type=int, required=True)

    args = parser.parse_args()

    if args.cmd == "dump":
        cmd_dump(args)
        return 0
    elif args.cmd == "regions":
        cmd_regions(args)
        return 0
    elif args.cmd == "smoke":
        return cmd_smoke(args)

    return 1


if __name__ == "__main__":
    sys.exit(main())
