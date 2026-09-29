#!/usr/bin/env python3
"""
notice_copy_probe.py -- the `38-S16` exact-copy instrument for Phase 38 sitting
9, quick 260929-tmw.

It mirrors `atspi_dialog_probe.py`'s app selection (desktop children whose
process id equals `--pid`, falling back to a case-insensitive "gamelib" name
match) and its dialog-containment rule (a node is in a dialog when it or an
ancestor has role `dialog`). It reads text UNCAPPED (no MAX_TEXT_CHARS
truncation -- the copy verdicts need the whole string). It prints only
matching nodes and their ancestor chains, never a whole-tree dump.

Dependencies: Python 3 stdlib plus `gi.repository.Atspi` only. Read-only, no
network.

Subcommands:
  selftest --catalogue FILE
                          Proves the comparison logic (load_key,
                          extract_segment, compare) against the LIVE
                          catalogue values of S
                          (steam.install.contentLightSingleLibraryNotice) and
                          O (steam.install.contentLightNotice). Needs no app.
                          Exits 0 only when every case passes.
  copy --pid PID --catalogue FILE --key K --match M
       [--alt-key K2 --alt-match M2]
                          Walks the live AT-SPI app tree for nodes whose text
                          (or, failing that, name) contains M casefolded, and
                          separately for M2 when given. Prints one HIT block
                          per match, the deepest hit's ancestor chain, and
                          summary lines (EXPECTED_HITS, ALT_HITS,
                          DEEPEST_EXPECTED_COMPARE, DIALOG_NODES,
                          DIALOG_HEADING_NODES, THIRD_PARTY_HITS,
                          ATTR_CLASS_EXPOSED).
  locate --pid PID --match M [--role R]
                          For each node whose name or text contains M
                          casefolded (and whose role equals R when given),
                          prints path, role, name (capped 80 chars), and its
                          SCREEN extents x,y,w,h and centre cx,cy. Derives
                          click points; never clicks.
  inspector --pid PID    Prints every node in the SELECTED state with
                          non-empty text or name, and every node whose text
                          or name contains infoBox, thirdPartyNotice,
                          noticeIcon or noticeInfo (case-sensitive class
                          names), each with path, role and text capped 300
                          chars. Then SELECTED_COUNT, INFOBOX_HITS,
                          THIRDPARTY_CLASS_HITS. Read-only.
"""

import argparse
import json
import sys

U_FFFC = "￼"


def atspi():
    import gi

    gi.require_version("Atspi", "2.0")
    from gi.repository import Atspi

    if not Atspi.is_initialized():
        Atspi.init()
    return Atspi


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def load_key(catalogue_path, dotted_key):
    """Walk the JSON catalogue at catalogue_path by the dotted path
    dotted_key. Exits 2 with a message on a missing key or a non-string
    value."""
    with open(catalogue_path, encoding="utf-8") as f:
        data = json.load(f)
    node = data
    parts = dotted_key.split(".")
    for i, part in enumerate(parts):
        if not isinstance(node, dict) or part not in node:
            print(
                f"ERROR load_key: {'.'.join(parts[: i + 1])} not found in {catalogue_path}",
                file=sys.stderr,
            )
            sys.exit(2)
        node = node[part]
    if not isinstance(node, str):
        print(
            f"ERROR load_key: {dotted_key} in {catalogue_path} is not a string (got {type(node).__name__})",
            file=sys.stderr,
        )
        sys.exit(2)
    return node


def extract_segment(node_text, match):
    """Split node_text on U+FFFC, pick the FIRST segment whose casefold
    contains match casefolded, and strip leading/trailing whitespace.

    Also count the U+FFFC characters that immediately precede that segment
    in the raw text (FFFC_BEFORE_SEGMENT): a strict backward scan from the
    start of the matched split-part that stops at the first non-FFFC
    character. Whitespace INSIDE the matched part (between the delimiter and
    the segment's real text, which .strip() removes) is "ignored" only in
    the sense that it never affects this count -- the split-part boundary,
    not a hand-rolled skip-whitespace scan, is what "immediately precede"
    is measured from. A whitespace character (for example a newline
    separating an earlier, unrelated icon+text run) still terminates the
    scan like any other non-FFFC character, so unrelated FFFCs further back
    in the text are not folded into this count.

    Returns (segment, fffc_before_segment) or (None, None) if no segment
    matches."""
    if node_text is None:
        return None, None
    parts = node_text.split(U_FFFC)
    match_cf = match.casefold()
    match_idx = None
    for i, part in enumerate(parts):
        if match_cf in part.casefold():
            match_idx = i
            break
    if match_idx is None:
        return None, None
    segment = parts[match_idx].strip()

    # Reconstruct the raw offset of parts[match_idx] within node_text.
    offset = 0
    for i in range(match_idx):
        offset += len(parts[i]) + 1  # +1 for the FFFC separator consumed
    # offset now points to the start of parts[match_idx] in node_text.
    j = offset - 1
    fffc_count = 0
    while j >= 0:
        ch = node_text[j]
        if ch == U_FFFC:
            fffc_count += 1
            j -= 1
        else:
            break

    return segment, fffc_count


def compare(segment, expected):
    """Returns (result, detail) where result is one of EXACT, NEWLINE_ONLY,
    MISMATCH."""
    if segment is None:
        return "MISMATCH", {"reason": "no segment extracted"}
    if segment == expected:
        return "EXACT", {}
    # NEWLINE_ONLY: replacing every newline in segment with a space gives
    # expected exactly, and every newline sits at an index where expected has
    # a space.
    normalized = segment.replace("\n", " ")
    if normalized == expected:
        ok = True
        for idx, ch in enumerate(segment):
            if ch == "\n":
                if idx >= len(expected) or expected[idx] != " ":
                    ok = False
                    break
        if ok:
            return "NEWLINE_ONLY", {}
    # MISMATCH: first differing index, both characters as U+XXXX (or END),
    # both lengths.
    min_len = min(len(segment), len(expected))
    diff_idx = None
    for i in range(min_len):
        if segment[i] != expected[i]:
            diff_idx = i
            break
    if diff_idx is None:
        diff_idx = min_len

    def char_repr(s, idx):
        if idx >= len(s):
            return "END"
        return f"U+{ord(s[idx]):04X}"

    return "MISMATCH", {
        "index": diff_idx,
        "segment_char": char_repr(segment, diff_idx),
        "expected_char": char_repr(expected, diff_idx),
        "segment_len": len(segment),
        "expected_len": len(expected),
    }


# ---------------------------------------------------------------------------
# selftest
# ---------------------------------------------------------------------------


def non_ascii_report(label, s):
    print(f"{label}_LEN={len(s)}")
    for i, ch in enumerate(s):
        if ord(ch) > 127 or ch == "'":
            print(f"  {label}[{i}] = U+{ord(ch):04X} {ch!r}")


def cmd_selftest(args):
    S = load_key(args.catalogue, "steam.install.contentLightSingleLibraryNotice")
    O = load_key(args.catalogue, "steam.install.contentLightNotice")

    non_ascii_report("S", S)
    non_ascii_report("O", O)

    all_pass = True

    def check(name, ok, detail=""):
        nonlocal all_pass
        status = "PASS" if ok else "FAIL"
        if not ok:
            all_pass = False
        print(f"{status} {name} {detail}")

    # Case 1: U+FFFC followed by S extracts to S, FFFC_BEFORE_SEGMENT=1, EXACT.
    node_text = U_FFFC + S
    seg, fffc = extract_segment(node_text, "only one steam library on this system")
    result, detail = compare(seg, S)
    check(
        "case1_fffc_prefix_extracts_exact",
        seg == S and fffc == 1 and result == "EXACT",
        f"seg_ok={seg == S} fffc={fffc} result={result} detail={detail}",
    )

    # Case 2: S with its first U+0027 replaced by U+2019 compares MISMATCH at
    # that index, naming U+0027 and U+2019.
    first_apos = S.index("'")
    s2 = S[:first_apos] + "’" + S[first_apos + 1 :]
    result2, detail2 = compare(s2, S)
    check(
        "case2_curly_apostrophe_mismatch",
        result2 == "MISMATCH"
        and detail2.get("index") == first_apos
        and detail2.get("segment_char") == "U+2019"
        and detail2.get("expected_char") == "U+0027",
        f"result={result2} detail={detail2}",
    )

    # Case 3: S with its U+2014 replaced by U+002D compares MISMATCH at the em
    # dash's index.
    em_idx = S.index("—")
    s3 = S[:em_idx] + "-" + S[em_idx + 1 :]
    result3, detail3 = compare(s3, S)
    check(
        "case3_em_dash_to_hyphen_mismatch",
        result3 == "MISMATCH" and detail3.get("index") == em_idx,
        f"result={result3} detail={detail3}",
    )

    # Case 4: O compared with S is MISMATCH; O compared with O is EXACT.
    result4a, _ = compare(O, S)
    result4b, _ = compare(O, O)
    check(
        "case4_o_vs_s_mismatch_o_vs_o_exact",
        result4a == "MISMATCH" and result4b == "EXACT",
        f"o_vs_s={result4a} o_vs_o={result4b}",
    )

    # Case 5: S with its first space replaced by a newline compares
    # NEWLINE_ONLY.
    first_space = S.index(" ")
    s5 = S[:first_space] + "\n" + S[first_space + 1 :]
    result5, detail5 = compare(s5, S)
    check(
        "case5_newline_for_space_newline_only",
        result5 == "NEWLINE_ONLY",
        f"result={result5} detail={detail5}",
    )

    # Case 6: "Title", two U+FFFC, a newline, one U+FFFC, then S, then one
    # U+FFFC, extracts to S with FFFC_BEFORE_SEGMENT=1.
    node_text6 = "Title" + U_FFFC + U_FFFC + "\n" + U_FFFC + S + U_FFFC
    seg6, fffc6 = extract_segment(node_text6, "only one steam library on this system")
    check(
        "case6_multi_fffc_prefix_counts_one_before_segment",
        seg6 == S and fffc6 == 1,
        f"seg_ok={seg6 == S} fffc={fffc6}",
    )

    # Case 7: S with one character deleted compares MISMATCH with differing
    # lengths.
    s7 = S[:-1]
    result7, detail7 = compare(s7, S)
    check(
        "case7_truncated_mismatch_differing_lengths",
        result7 == "MISMATCH"
        and detail7.get("segment_len") == len(s7)
        and detail7.get("expected_len") == len(S),
        f"result={result7} detail={detail7}",
    )

    return 0 if all_pass else 1


# ---------------------------------------------------------------------------
# AT-SPI app selection (mirrors atspi_dialog_probe.py)
# ---------------------------------------------------------------------------


def select_apps(Atspi, pid):
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
            cpid = child.get_process_id()
        except Exception:
            cpid = None
        if cpid == pid:
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

    return matched


def get_text_uncapped(node):
    try:
        length = None
        try:
            length = node.get_character_count()
        except Exception:
            length = None
        if length == 0:
            return ""
        import gi

        gi.require_version("Atspi", "2.0")
        from gi.repository import Atspi

        txt = Atspi.Text.get_text(node, 0, -1)
        return txt
    except Exception:
        return None


def get_attrs(node):
    try:
        attrs = node.get_attributes()
        if attrs is None:
            return {}
        return dict(attrs)
    except Exception:
        return {}


def is_dialog_role(role):
    return bool(role) and role.strip().lower() == "dialog"


def is_heading_role(role):
    return bool(role) and role.strip().lower() == "heading"


# ---------------------------------------------------------------------------
# copy subcommand
# ---------------------------------------------------------------------------


def cmd_copy(args):
    Atspi = atspi()
    matched = select_apps(Atspi, args.pid)
    if not matched:
        print("ERROR: no app matched by pid or gamelib name fallback", file=sys.stderr)
        return 3

    try:
        expected_val = load_key(args.catalogue, args.key)
    except SystemExit:
        raise
    alt_val = None
    if args.alt_key:
        alt_val = load_key(args.catalogue, args.alt_key)

    third_party_header = None
    tp_hits = 0
    import os

    gamepage_path = os.path.join(os.path.dirname(args.catalogue), "gamepage.json")
    if os.path.exists(gamepage_path):
        try:
            third_party_header = load_key(gamepage_path, "third-party-managed.header")
        except SystemExit:
            third_party_header = None

    hits = {"expected": [], "alt": []}
    dialog_nodes = 0
    dialog_heading_nodes = 0
    attr_class_exposed = False
    tp_hit_nodes = []

    def walk(node, path, depth, in_dialog):
        nonlocal dialog_nodes, dialog_heading_nodes, attr_class_exposed
        try:
            role = node.get_role_name()
        except Exception:
            role = None
        try:
            name = node.get_name()
        except Exception:
            name = None

        this_in_dialog = in_dialog
        if is_dialog_role(role):
            dialog_nodes += 1
            this_in_dialog = True
        if this_in_dialog and is_heading_role(role):
            dialog_heading_nodes += 1

        text = get_text_uncapped(node)
        attrs = get_attrs(node)
        if attrs.get("class") is not None:
            attr_class_exposed = True

        haystack_text = text or ""
        haystack_name = name or ""

        for kind, m in (("expected", args.match), ("alt", args.alt_match)):
            if not m:
                continue
            source = None
            if m.casefold() in haystack_text.casefold():
                source = "text"
                raw = text
            elif m.casefold() in haystack_name.casefold():
                source = "name"
                raw = name
            if source:
                hits[kind].append(
                    {
                        "path": path,
                        "depth": depth,
                        "role": role,
                        "in_dialog": this_in_dialog,
                        "source": source,
                        "raw": raw,
                        "attrs": attrs,
                    }
                )

        nonlocal third_party_header, tp_hits
        if third_party_header:
            if third_party_header.casefold() in haystack_text.casefold() or (
                third_party_header.casefold() in haystack_name.casefold()
            ):
                tp_hits += 1
                tp_hit_nodes.append({"path": path, "role": role})

        try:
            cc = node.get_child_count()
        except Exception:
            cc = 0
        for i in range(cc):
            try:
                c = node.get_child_at_index(i)
            except Exception:
                continue
            walk(c, path + "." + str(i), depth + 1, this_in_dialog)

    for idx, m in enumerate(matched):
        walk(m, str(idx), 0, False)

    def print_hit_block(kind, hit, expected_key, expected_val, alt_key, alt_val):
        seg, fffc_before = extract_segment(
            hit["raw"], args.match if kind == "expected" else args.alt_match
        )
        cmp_expected = compare(seg, expected_val) if expected_val is not None else ("n/a", {})
        cmp_alt = compare(seg, alt_val) if alt_val is not None else ("n/a", {})
        print(f"HIT kind={kind}")
        print(f"  path={hit['path']}")
        print(f"  depth={hit['depth']}")
        print(f"  role={hit['role']}")
        print(f"  in_dialog={hit['in_dialog']}")
        print(f"  source={hit['source']}")
        print(f"  attrs={json.dumps(hit['attrs'], ensure_ascii=True)}")
        print(f"  SEGMENT_REPR={seg!r}")
        print(f"  SEGMENT_LEN={len(seg) if seg is not None else 'None'}")
        print(f"  FFFC_BEFORE_SEGMENT={fffc_before}")
        print(f"  COMPARE_EXPECTED={cmp_expected[0]} {json.dumps(cmp_expected[1])}")
        if alt_val is not None:
            print(f"  COMPARE_ALT={cmp_alt[0]} {json.dumps(cmp_alt[1])}")
        return cmp_expected, cmp_alt, seg

    deepest_expected = None
    if hits["expected"]:
        deepest_expected = max(hits["expected"], key=lambda h: h["depth"])
    deepest_alt = None
    if hits["alt"]:
        deepest_alt = max(hits["alt"], key=lambda h: h["depth"])

    for h in hits["expected"]:
        print_hit_block("expected", h, args.key, expected_val, args.alt_key, alt_val)
    for h in hits["alt"]:
        print_hit_block("alt", h, args.key, expected_val, args.alt_key, alt_val)

    def print_ancestor_chain(node_matched_idx, path):
        # Walk from root down the path to reconstruct ancestors.
        idx_parts = path.split(".")
        root_idx = int(idx_parts[0])
        node = matched[root_idx]
        chain = [(0, node)]
        for depth_i, part in enumerate(idx_parts[1:], start=1):
            try:
                node = node.get_child_at_index(int(part))
            except Exception:
                break
            chain.append((depth_i, node))
        for depth_i, n in chain:
            try:
                role = n.get_role_name()
            except Exception:
                role = None
            try:
                name = (n.get_name() or "")[:60]
            except Exception:
                name = None
            attrs = get_attrs(n)
            print(
                f"ANCESTOR depth={depth_i} role={role} name={name!r} attrs={json.dumps(attrs, ensure_ascii=True)}"
            )

    if deepest_expected:
        print("DEEPEST_EXPECTED_ANCESTORS")
        print_ancestor_chain(0, deepest_expected["path"])
    if deepest_alt:
        print("DEEPEST_ALT_ANCESTORS")
        print_ancestor_chain(0, deepest_alt["path"])

    deepest_expected_compare = "n/a"
    if deepest_expected:
        seg, _ = extract_segment(deepest_expected["raw"], args.match)
        cmp_r, _ = compare(seg, expected_val)
        deepest_expected_compare = cmp_r

    print(f"EXPECTED_HITS={len(hits['expected'])}")
    print(f"ALT_HITS={len(hits['alt'])}")
    print(f"DEEPEST_EXPECTED_COMPARE={deepest_expected_compare}")
    print(f"DIALOG_NODES={dialog_nodes}")
    print(f"DIALOG_HEADING_NODES={dialog_heading_nodes}")
    print(f"THIRD_PARTY_HITS={tp_hits}")
    print(f"ATTR_CLASS_EXPOSED={'yes' if attr_class_exposed else 'no'}")

    return 0


# ---------------------------------------------------------------------------
# locate subcommand
# ---------------------------------------------------------------------------


def cmd_locate(args):
    Atspi = atspi()
    matched = select_apps(Atspi, args.pid)
    if not matched:
        print("ERROR: no app matched by pid or gamelib name fallback", file=sys.stderr)
        return 3

    match_cf = args.match.casefold()

    def walk(node, path, depth):
        try:
            role = node.get_role_name()
        except Exception:
            role = None
        try:
            name = node.get_name()
        except Exception:
            name = None
        text = get_text_uncapped(node)

        hay = ((name or "") + " " + (text or "")).casefold()
        role_ok = True
        if args.role:
            role_ok = bool(role) and role.strip().lower() == args.role.strip().lower()

        if match_cf in hay and role_ok:
            try:
                ext = node.get_extents(Atspi.CoordType.SCREEN)
                x, y, w, h = ext.x, ext.y, ext.width, ext.height
                cx, cy = x + w // 2, y + h // 2
                print(
                    f"LOCATE path={path} role={role} name={(name or '')[:80]!r} x={x} y={y} w={w} h={h} cx={cx} cy={cy}"
                )
            except Exception as e:
                print(f"LOCATE path={path} role={role} name={(name or '')[:80]!r} EXTENTS_ERROR={e}")

        try:
            cc = node.get_child_count()
        except Exception:
            cc = 0
        for i in range(cc):
            try:
                c = node.get_child_at_index(i)
            except Exception:
                continue
            walk(c, path + "." + str(i), depth + 1)

    for idx, m in enumerate(matched):
        walk(m, str(idx), 0)

    return 0


# ---------------------------------------------------------------------------
# inspector subcommand
# ---------------------------------------------------------------------------

CLASS_MARKERS = ["infoBox", "thirdPartyNotice", "noticeIcon", "noticeInfo"]


def cmd_inspector(args):
    Atspi = atspi()
    matched = select_apps(Atspi, args.pid)
    if not matched:
        print("ERROR: no app matched by pid or gamelib name fallback", file=sys.stderr)
        return 3

    selected_count = 0
    infobox_hits = 0
    thirdparty_hits = 0

    def walk(node, path, depth):
        nonlocal selected_count, infobox_hits, thirdparty_hits
        try:
            role = node.get_role_name()
        except Exception:
            role = None
        try:
            name = node.get_name()
        except Exception:
            name = None
        text = get_text_uncapped(node)

        try:
            state_set = node.get_state_set()
            is_selected = state_set.contains(Atspi.StateType.SELECTED)
        except Exception:
            is_selected = False

        if is_selected and (text or name):
            selected_count += 1
            print(
                f"SELECTED path={path} role={role} name={(name or '')[:300]!r} text={(text or '')[:300]!r}"
            )

        hay = (text or "") + " " + (name or "")
        for marker in CLASS_MARKERS:
            if marker in hay:
                if marker == "infoBox":
                    infobox_hits += 1
                else:
                    thirdparty_hits += 1
                print(
                    f"CLASS_HIT marker={marker} path={path} role={role} text={(text or '')[:300]!r}"
                )

        try:
            cc = node.get_child_count()
        except Exception:
            cc = 0
        for i in range(cc):
            try:
                c = node.get_child_at_index(i)
            except Exception:
                continue
            walk(c, path + "." + str(i), depth + 1)

    for idx, m in enumerate(matched):
        walk(m, str(idx), 0)

    print(f"SELECTED_COUNT={selected_count}")
    print(f"INFOBOX_HITS={infobox_hits}")
    print(f"THIRDPARTY_CLASS_HITS={thirdparty_hits}")

    return 0


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_selftest = sub.add_parser("selftest")
    p_selftest.add_argument("--catalogue", required=True)

    p_copy = sub.add_parser("copy")
    p_copy.add_argument("--pid", type=int, required=True)
    p_copy.add_argument("--catalogue", required=True)
    p_copy.add_argument("--key", required=True)
    p_copy.add_argument("--match", required=True)
    p_copy.add_argument("--alt-key", dest="alt_key", default=None)
    p_copy.add_argument("--alt-match", dest="alt_match", default=None)

    p_locate = sub.add_parser("locate")
    p_locate.add_argument("--pid", type=int, required=True)
    p_locate.add_argument("--match", required=True)
    p_locate.add_argument("--role", default=None)

    p_inspector = sub.add_parser("inspector")
    p_inspector.add_argument("--pid", type=int, required=True)

    args = parser.parse_args()

    if args.cmd == "selftest":
        return cmd_selftest(args)
    elif args.cmd == "copy":
        return cmd_copy(args)
    elif args.cmd == "locate":
        return cmd_locate(args)
    elif args.cmd == "inspector":
        return cmd_inspector(args)

    return 1


if __name__ == "__main__":
    sys.exit(main())
