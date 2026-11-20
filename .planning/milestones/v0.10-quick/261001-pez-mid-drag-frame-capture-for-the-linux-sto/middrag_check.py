#!/usr/bin/env python3
"""middrag_check.py -- score the embed-vs-window uncovered strip in frames taken DURING a resize (quick 261001-pez).

  middrag_check.py --frames PREFIX-frames.txt --dir PREFIX-frames [--settled-log LOG] [--label NAME]
  middrag_check.py --selftest

Why a STRIP: on this host the window's own chrome (the React shell) follows a resize live, while the embed (a
GTK-placed child webview) trails it. Where the window has grown past the embed's right/bottom edge, the main
webview's background shows through as near-black: a MIX of (0,0,0), (7,10,11) and (9,9,9) measured along one row of frame 229
of the first real run, so a pixel is strip when every channel is <= STRIP_MAX. The window also paints a 3 px border
(31..62 per channel) at its very edge. The strip width
is a pixel-measured lower bound on how far the embed is out of place; it is blind to the embed being LARGER than the
window (the window clips it), so a shrink run scores 0 here and says nothing about overhang.

Per frame: scan inward from the right edge along ROWS, and up from the bottom edge along COLS. The outermost EDGE px
are window border and are not tested; if the pixel just inside them is not strip-coloured the embed is flush (gap 0),
otherwise the gap is the run of strip-coloured pixels counted from the edge (border included). The per-frame gap is the MEDIAN over the probe lines, so one line that happens to
cross a dark page region cannot invent a strip. A line that is entirely strip colour is an error (the scan found no
embed at all), not a huge gap.

Output (one KEY=value per line):
  FRAMES n  DRAG_FRAMES n  MAX_GAP_RIGHT px  MAX_GAP_BOTTOM px  EXPOSED_MS (time with either gap > MIN_GAP)
  T_FIRST_SEND  T_DRAG_END  T_CONVERGED (first frame after which both gaps stay 0)  CONVERGE_AFTER_DRAG_END_MS
  SETTLED_LINE_T / SETTLED_AFTER_DRAG_END_MS when --settled-log names the final `settled` line
  VERDICT: control frames (pre-drag, final) must score 0 or the run is INVALID.
"""
import argparse, os, re, statistics, sys
from PIL import Image

STRIP_RGB = (0, 0, 0)            # what the selftest paints; the real strip is a MIX, see STRIP_MAX
STRIP_MAX = 12                   # strip = every channel <= this (measured mix: (0,0,0), (7,10,11), (9,9,9)); GOG page bg is (35,35,35)
EDGE = 3                         # the window's own border is 3 px (measured: x=1190..1192 of a 1193 px frame); never tested
MIN_GAP = 2                       # px; below this a gap is anti-aliasing / rounding, not a strip
ROWS = (200, 260, 320, 380, 440)  # probe rows (inside the slot for every size >= 1100x650)
COLS = (260, 340, 420, 500, 580)  # probe columns
SLOT_X, SLOT_Y = 204, 82          # the slot's top-left in the window (from the settled `requested=` lines)

def is_strip(px): return max(px[:3]) <= STRIP_MAX

def _run(get, n_max):
    """get(k) = pixel k px in from the edge. The outermost EDGE px are window border (measured on this host: 2-3 px of
    mixed, partly near-black colours, so 'first strip pixel' is NOT safe) and are never tested. If the pixel just inside
    them is not strip the embed is flush: 0. Otherwise the border belongs to the strip and the gap is the strip run
    counted from the edge. None if the whole line is strip."""
    if not is_strip(get(EDGE)): return 0
    n = EDGE
    while n < n_max and is_strip(get(n)): n += 1
    return None if n >= n_max else n

def run_right(im, y):
    w = im.size[0]
    return _run(lambda k: im.getpixel((w - 1 - k, y)), w - SLOT_X)

def run_bottom(im, x):
    h = im.size[1]
    return _run(lambda k: im.getpixel((x, h - 1 - k)), h - SLOT_Y)

def frame_gaps(im):
    """(gap_right, gap_bottom) in px, or raises ValueError if every probe line was pure strip."""
    im = im.convert("RGB")
    gr = [g for g in (run_right(im, y) for y in ROWS if y < im.size[1]) if g is not None]
    gb = [g for g in (run_bottom(im, x) for x in COLS if x < im.size[0]) if g is not None]
    if not gr or not gb: raise ValueError("no embed pixels found on any probe line")
    return int(statistics.median(gr)), int(statistics.median(gb))

def parse(path):
    sends, frames, drag_end = [], [], None
    for ln in open(path):
        f = dict(re.findall(r"(\w+)=(\S+)", ln))
        if ln.startswith("SEND"): sends.append(int(f["t"]))
        elif ln.startswith("DRAG_END"): drag_end = int(f["t"])
        elif ln.startswith("FRAME"): frames.append((int(f["i"]), int(f["t"])))
    if not sends or drag_end is None or not frames: raise ValueError("frames log lacks SEND / DRAG_END / FRAME lines")
    return sends[0], drag_end, sorted(frames, key=lambda x: x[1])

def score(frames_txt, fdir, settled_log=None):
    t_first, t_end, frames = parse(frames_txt)
    rows = []
    for i, t in frames:
        gr, gb = frame_gaps(Image.open(os.path.join(fdir, f"{i:04d}.png")))
        rows.append((t, gr, gb))
    pre = [r for r in rows if r[0] < t_first]
    out = {"FRAMES": len(rows), "PRE_FRAMES": len(pre)}
    drag = [r for r in rows if r[0] >= t_first]
    out["DRAG_FRAMES"] = len(drag)
    out["MAX_GAP_RIGHT"] = max(r[1] for r in drag); out["MAX_GAP_BOTTOM"] = max(r[2] for r in drag)
    exposed = 0
    for a, b in zip(drag, drag[1:]):
        if max(a[1], a[2]) > MIN_GAP: exposed += b[0] - a[0]
    out["EXPOSED_MS"] = exposed
    conv = None
    for k in range(len(drag) - 1, -1, -1):
        if drag[k][1] > MIN_GAP or drag[k][2] > MIN_GAP: break
        conv = drag[k][0]
    out["T_FIRST_SEND"], out["T_DRAG_END"], out["T_CONVERGED"] = t_first, t_end, conv if conv is not None else "NEVER"
    out["CONVERGE_AFTER_DRAG_END_MS"] = (conv - t_end) if conv is not None else "NEVER"
    out["PRE_DRAG_MAX_GAP"] = max([max(r[1], r[2]) for r in pre] or [0])
    out["FINAL_FRAME_GAP"] = max(rows[-1][1], rows[-1][2])
    if settled_log and os.path.exists(settled_log):
        ts = [int(m.group(1)) for m in (re.match(r"T=(\d+) .*settled", l) for l in open(settled_log)) if m and int(m.group(1)) >= t_first]
        if ts: out["SETTLED_LINE_T"] = ts[-1]; out["SETTLED_AFTER_DRAG_END_MS"] = ts[-1] - t_end
    valid = out["PRE_DRAG_MAX_GAP"] <= MIN_GAP and out["FINAL_FRAME_GAP"] <= MIN_GAP
    out["VERDICT"] = "VALID" if valid else "INVALID (a control frame shows a strip: the scan or the run is wrong)"
    return out

# ---- selftest: every failure shape the scan can have must be rejected -------------------------------------------
def _img(w, h, right=0, bottom=0, embed=(35, 35, 35), border=0):
    """border = px of non-strip window-edge colour painted OVER the outermost columns/rows, as on the real window."""
    im = Image.new("RGB", (w, h), embed)
    for x in range(w - right, w):
        for y in range(h): im.putpixel((x, y), STRIP_RGB)
    for y in range(h - bottom, h):
        for x in range(w): im.putpixel((x, y), STRIP_RGB)
    for b in range(border):
        for y in range(h): im.putpixel((w - 1 - b, y), (62, 55, 54))
        for x in range(w): im.putpixel((x, h - 1 - b), (62, 55, 54))
    return im

def selftest():
    ok = True
    def chk(name, cond):
        nonlocal ok; ok &= bool(cond); print(("PASS " if cond else "FAIL ") + name)
    chk("flush frame scores 0,0", frame_gaps(_img(1280, 800)) == (0, 0))
    chk("27px right + 25px bottom strip is measured exactly", frame_gaps(_img(1193, 728, 27, 25)) == (27, 25))
    chk("right-only strip leaves bottom 0", frame_gaps(_img(1200, 700, 40, 0)) == (40, 0))
    # a dark page region on ONE probe row must not invent a strip (median over rows)
    im = _img(1280, 800); [im.putpixel((x, 260), STRIP_RGB) for x in range(1280 - 60, 1280)]
    chk("one strip-coloured page row is outvoted by the median", frame_gaps(im)[0] == 0)
    # a strip-coloured page that is uniformly the strip colour everywhere must ERROR, not report a giant gap
    try: frame_gaps(Image.new("RGB", (1280, 800), STRIP_RGB)); chk("all-strip frame is rejected", False)
    except ValueError: chk("all-strip frame is rejected", True)
    # near-strip but outside TOL is embed content, not strip
    chk("a page colour just above STRIP_MAX is not strip", frame_gaps(_img(1280, 800, 0, 0, embed=(STRIP_MAX + 3, 0, 0))) == (0, 0))
    mix = _img(1193, 728, 27, 25); [mix.putpixel((1193 - 8 - j, y), (7, 10, 11)) for j in range(3) for y in range(728)]
    chk("the (7,10,11)/(9,9,9) mix inside a strip does not cut it short", frame_gaps(mix)[0] == 27)
    chk("a 2px window border over the strip does not hide it", frame_gaps(_img(1193, 728, 27, 25, border=2)) == (27, 25))
    im = _img(1193, 728, 27, 25, border=3)   # real border is partly near-black: make the outermost px strip-like too
    [im.putpixel((1193 - 1 - 1, y), STRIP_RGB) for y in range(728)]
    chk("an isolated near-black border pixel does not shorten the strip", frame_gaps(im)[0] == 27)
    chk("a 2px window border over a flush embed scores 0", frame_gaps(_img(1280, 800, 0, 0, border=2)) == (0, 0))
    im = _img(1280, 800); [im.putpixel((x, y), STRIP_RGB) for x in range(900, 1000) for y in ROWS]
    chk("a strip-coloured page region away from the edge is not a strip", frame_gaps(im) == (0, 0))
    # end-to-end on a synthetic run: strip shrinks 40 -> 0 over time; convergence must be the first frame after the last >2px frame
    import tempfile
    d = tempfile.mkdtemp(); lines = ["SEND k=0 t=1000 w=1 h=1\n", "DRAG_END t=1100 w=1 h=1\n"]
    gaps = [(0, 0), (0, 0), (40, 30), (20, 15), (6, 3), (1, 0), (0, 0), (0, 0)]
    for k, (gr, gb) in enumerate(gaps):
        _img(1280, 800, gr, gb).save(os.path.join(d, f"{k:04d}.png")); lines.append(f"FRAME i={k} t={900 + k * 100} w=1280 h=800\n")
    open(os.path.join(d, "f.txt"), "w").writelines(lines)
    s = score(os.path.join(d, "f.txt"), d)
    chk("synthetic run: max gaps 40/30", (s["MAX_GAP_RIGHT"], s["MAX_GAP_BOTTOM"]) == (40, 30))
    chk("synthetic run: converged at the frame after the last >2px frame (t=1400... gap 1 counts as 0)", s["T_CONVERGED"] == 1400)
    chk("synthetic run: valid when both controls are clean", s["VERDICT"] == "VALID")
    # a run whose FINAL frame still shows a strip must be INVALID, never a quiet pass
    _img(1280, 800, 12, 0).save(os.path.join(d, f"{len(gaps) - 1:04d}.png"))
    chk("a strip on the final control frame invalidates the run", score(os.path.join(d, "f.txt"), d)["VERDICT"].startswith("INVALID"))
    open(os.path.join(d, "g.txt"), "w").write("FRAME i=0 t=1\n")
    chk("a log without SEND lines is rejected", _raises(lambda: parse(os.path.join(d, "g.txt"))))
    print("SELFTEST", "PASS" if ok else "FAIL"); return 0 if ok else 1

def _raises(fn):
    try: fn(); return False
    except ValueError: return True

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true"); ap.add_argument("--frames"); ap.add_argument("--dir")
    ap.add_argument("--settled-log"); ap.add_argument("--label", default="")
    a = ap.parse_args()
    if a.selftest: return selftest()
    if not (a.frames and a.dir): ap.error("--frames and --dir are required")
    for k, v in score(a.frames, a.dir, a.settled_log).items(): print(f"{k}={v}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
