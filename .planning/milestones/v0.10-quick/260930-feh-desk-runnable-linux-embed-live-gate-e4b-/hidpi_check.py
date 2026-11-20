#!/usr/bin/env python3
"""hidpi_check.py -- measured GDK scale plus the logical-px flush check (quick 260930-feh).

  hidpi_check.py LOG --scale S --xwin-file F
  hidpi_check.py --selftest

LOG is a settled log (lines may carry a `T=<ms>` prefix; matched with a regex search). F is
`xwininfo -id WID` text; its Width/Height are the X client size in PHYSICAL px. A settled line's
vbox and rects are GTK LOGICAL px. The effective scale is therefore MEASURED as X client size /
GTK logical vbox, never assumed from the environment variable.

Exit codes:
  0  VERDICT=PASS               a candidate line exists at scale S and the slot is flush (+-1) with the
                                vbox's right and bottom edges, i.e. renderer and GTK agree in logical px
  1  VERDICT=UNIT_MIXUP         scale took effect but the slot is not flush: renderer and GTK disagree
  3  VERDICT=SCALE_NOT_IN_EFFECT no line matches at scale S but one matches at scale 1
  4  VERDICT=NO_MATCH / BASE_FAIL  nothing matches, or a settled line fails the base check
                                (embed == requested and main == (0,0,vbox)), or an error line exists
"""
import re
import sys

PAT = re.compile(
    r"settled requested=(-?\d+),(-?\d+),(\d+)x(\d+) "
    r"embed=(-?\d+),(-?\d+),(\d+)x(\d+) "
    r"main=(-?\d+),(-?\d+),(\d+)x(\d+) "
    r"vbox=(\d+)x(\d+)"
)


def xwin_size(text):
    w = re.search(r"Width:\s+(\d+)", text)
    h = re.search(r"Height:\s+(\d+)", text)
    if not (w and h):
        return None
    return int(w.group(1)), int(h.group(1))


def evaluate(lines, scale, xw, xh):
    """Return (exit_code, printed_lines)."""
    out = []
    parsed = []
    for line in lines:
        if "store_embed(linux): error" in line:
            out.append("BASE_FAIL error line: " + line.strip())
            out.append("VERDICT=BASE_FAIL")
            return 4, out
        m = PAT.search(line)
        if not m:
            continue
        v = [int(g) for g in m.groups()]
        req, emb, main, vbox = tuple(v[0:4]), tuple(v[4:8]), tuple(v[8:12]), (v[12], v[13])
        if not (emb == req and main == (0, 0, vbox[0], vbox[1])):
            out.append("BASE_FAIL settled line fails the base check: " + line.strip())
            out.append("VERDICT=BASE_FAIL")
            return 4, out
        parsed.append((req, vbox))
    if not parsed:
        out.append("VERDICT=NO_MATCH no settled lines")
        return 4, out

    def near(a, b):
        return abs(a - b) <= 1

    cands = [p for p in parsed if near(xw, scale * p[1][0]) and near(xh, scale * p[1][1])]
    if not cands:
        at1 = [p for p in parsed if near(xw, p[1][0]) and near(xh, p[1][1])]
        if scale != 1 and at1:
            req, vbox = at1[-1]
            out.append(f"SCALE_W={xw / vbox[0]:.3f} SCALE_H={xh / vbox[1]:.3f} XWIN={xw}x{xh} VBOX={vbox[0]}x{vbox[1]}")
            out.append("VERDICT=SCALE_NOT_IN_EFFECT")
            return 3, out
        nearest = ", ".join(f"{xw / p[1][0]:.3f}x{xh / p[1][1]:.3f}" for p in parsed[-3:])
        out.append(f"VERDICT=NO_MATCH nearest_ratios={nearest} XWIN={xw}x{xh}")
        return 4, out
    req, vbox = cands[-1]
    dx = req[0] + req[2] - vbox[0]
    dy = req[1] + req[3] - vbox[1]
    out.append(f"SCALE_W={xw / vbox[0]:.3f} SCALE_H={xh / vbox[1]:.3f}")
    out.append(f"FLUSH_DX={dx} FLUSH_DY={dy}")
    out.append(f"REQUESTED={req[0]},{req[1]},{req[2]}x{req[3]} VBOX={vbox[0]}x{vbox[1]}")
    if abs(dx) <= 1 and abs(dy) <= 1:
        out.append("VERDICT=PASS")
        return 0, out
    out.append("VERDICT=UNIT_MIXUP")
    return 1, out


def line_for(req, main_vbox, embed=None, main=None):
    embed = embed or req
    vb = main_vbox
    main = main or (0, 0, vb[0], vb[1])
    return (
        "T=1 [shell] store_embed(linux): settled requested=%d,%d,%dx%d embed=%d,%d,%dx%d main=%d,%d,%dx%d vbox=%dx%d"
        % (*req, *embed, *main, *vb)
    )


def selftest():
    fails = []

    def rc(lines, scale, xw, xh):
        return evaluate(lines, scale, xw, xh)[0]

    good2 = line_for((204, 82, 896, 568), (1100, 650))
    if rc([good2], 2, 2200, 1300) != 0:
        fails.append("rejected a scale-2 good case")
    if rc([good2], 2, 1100, 650) != 3:
        fails.append("did not return 3 for a scale-1 window checked with --scale 2")
    overflow = line_for((408, 164, 1792, 1136), (1100, 650))
    if rc([overflow], 2, 2200, 1300) != 1:
        fails.append("did not return 1 for an overflow (doubled) mixup")
    halved = line_for((102, 41, 448, 284), (1100, 650))
    if rc([halved], 2, 2200, 1300) != 1:
        fails.append("did not return 1 for a halved mixup")
    squeezed = line_for((204, 82, 896, 568), (1100, 650), main=(0, 0, 1100, 300))
    if rc([squeezed], 2, 2200, 1300) != 4:
        fails.append("did not return 4 for a squeezed-main line")
    if rc([good2], 1, 1100, 650) != 0:
        fails.append("rejected a scale-1 good case under --scale 1")
    if rc([], 2, 2200, 1300) != 4:
        fails.append("did not return 4 for an empty log")
    if rc([good2, "[shell] store_embed(linux): error mount: boom"], 2, 2200, 1300) != 4:
        fails.append("did not return 4 for a log containing an error line")
    if fails:
        print("SELFTEST FAIL: " + "; ".join(fails))
        return 1
    print("SELFTEST PASS: accepts scale-2 and scale-1 good; rejects scale-1 window (3), overflow and halved mixups (1), squeezed main, error line, empty log (4)")
    return 0


def main(argv):
    if "--selftest" in argv:
        return selftest()
    if not argv or argv[0].startswith("--") or "--scale" not in argv or "--xwin-file" not in argv:
        print(__doc__)
        return 2
    log = argv[0]
    scale = int(argv[argv.index("--scale") + 1])
    xf = argv[argv.index("--xwin-file") + 1]
    with open(xf, encoding="utf-8", errors="replace") as fh:
        size = xwin_size(fh.read())
    if not size:
        print("no Width/Height in " + xf)
        return 2
    with open(log, encoding="utf-8", errors="replace") as fh:
        lines = fh.read().splitlines()
    code, out = evaluate(lines, scale, size[0], size[1])
    print("\n".join(out))
    return code


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
