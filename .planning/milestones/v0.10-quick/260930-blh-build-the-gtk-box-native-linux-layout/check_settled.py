#!/usr/bin/env python3
"""check_settled.py -- judge `[shell] store_embed(linux): settled ...` lines (quick 260930-blh).

  check_settled.py <log> [--min-lines N] [--expect-vbox-change]
  check_settled.py --selftest

A line PASSES when the embed's measured GTK allocation equals the requested rect (all four
numbers) AND the main webview fills the whole vbox: main == (0, 0, vbox_w, vbox_h). A squeezed
main (spike 029's failure shape) fails. The log FAILS if it has fewer than --min-lines settled
lines, if any line fails, or if any line contains `store_embed(linux): error`.
--expect-vbox-change additionally requires at least 2 distinct vbox sizes (proof of a resize).
"""
import re
import sys

PAT = re.compile(
    r"settled requested=(-?\d+),(-?\d+),(\d+)x(\d+) "
    r"embed=(-?\d+),(-?\d+),(\d+)x(\d+) "
    r"main=(-?\d+),(-?\d+),(\d+)x(\d+) "
    r"vbox=(\d+)x(\d+)"
)


def judge_line(line):
    """Return (parsed_ok, passed, vbox) for one settled line."""
    m = PAT.search(line)
    if not m:
        return (False, False, None)
    v = [int(g) for g in m.groups()]
    requested, embed, main, vbox = tuple(v[0:4]), tuple(v[4:8]), tuple(v[8:12]), (v[12], v[13])
    ok = embed == requested and main == (0, 0, vbox[0], vbox[1])
    return (True, ok, vbox)


def check(lines, min_lines=1, expect_vbox_change=False):
    settled = 0
    passed = 0
    failed = 0
    errors = 0
    vboxes = set()
    for line in lines:
        if "store_embed(linux): error" in line:
            errors += 1
        if "settled requested=" not in line:
            continue
        parsed, ok, vbox = judge_line(line)
        settled += 1
        if parsed and ok:
            passed += 1
            vboxes.add(vbox)
        else:
            failed += 1
            if vbox:
                vboxes.add(vbox)
    good = settled >= min_lines and failed == 0 and errors == 0
    if expect_vbox_change and len(vboxes) < 2:
        good = False
    print(f"SETTLED_LINES={settled} PASS={passed} FAIL={failed} ERRORS={errors} DISTINCT_VBOX={len(vboxes)}")
    return good


GOOD = ("[shell] store_embed(linux): settled requested=291,97,760x561 "
        "embed=291,97,760x561 main=0,0,1280x800 vbox=1280x800")
SQUEEZED = GOOD.replace("main=0,0,1280x800", "main=0,0,1280x400")
OFF_BY_ONE = GOOD.replace("embed=291,97,760x561", "embed=291,97,760x560")
ERRLINE = "[shell] store_embed(linux): error mount: boom"


def selftest():
    fails = []
    if not check([GOOD], 1):
        fails.append("rejected a good line")
    if check([SQUEEZED], 1):
        fails.append("ACCEPTED a squeezed main")
    if check([OFF_BY_ONE], 1):
        fails.append("ACCEPTED an off-by-one embed")
    if check([GOOD, ERRLINE], 1):
        fails.append("ACCEPTED a log containing an error line")
    if check([], 1):
        fails.append("ACCEPTED an empty log with --min-lines 1")
    if check([GOOD], 1, expect_vbox_change=True):
        fails.append("ACCEPTED a single vbox size under --expect-vbox-change")
    resized = GOOD.replace("main=0,0,1280x800 vbox=1280x800", "main=0,0,1100x700 vbox=1100x700")
    if not check([GOOD, resized], 2, expect_vbox_change=True):
        fails.append("rejected a genuine resize pair")
    if fails:
        print("SELFTEST FAIL: " + "; ".join(fails))
        return 1
    print("SELFTEST PASS: accepts good, rejects squeezed main, off-by-one embed, error line, empty log, no-resize")
    return 0


def main(argv):
    if "--selftest" in argv:
        return selftest()
    if not argv or argv[0].startswith("--"):
        print(__doc__)
        return 2
    path = argv[0]
    min_lines = 1
    if "--min-lines" in argv:
        min_lines = int(argv[argv.index("--min-lines") + 1])
    with open(path, encoding="utf-8", errors="replace") as fh:
        lines = fh.read().splitlines()
    return 0 if check(lines, min_lines, "--expect-vbox-change" in argv) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
