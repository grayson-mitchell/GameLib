#!/usr/bin/env python3
"""drive.py -- xdotool + PIL helpers for the quick 261105-q1j live arms (X11 only, DISPLAY=:1).

  drive.py win                      print window id, absolute client origin, client size
  drive.py shot OUT [x,y,w,h]       grab the window client area (optionally cropped, window-relative)
  drive.py click X Y                click at WINDOW-relative X,Y (converted to absolute screen coords)
  drive.py key KEY [KEY...]         send keys to the focused window
  drive.py size W H                 resize the client area
  drive.py offset RAW               print the raw log's line count
  drive.py collect RAW OFFSET OUT   copy ONLY `store_embed(linux)` lines after OFFSET into OUT

`collect` is the redaction boundary: a real-profile dev log carries sidecar output that can hold
account identifiers, so nothing but the pinned geometry lines ever leaves the scratchpad.
"""
import os
import re
import subprocess
import sys

MARKER = "store_embed(linux)"
CLASS = "gamelib-shell"


def sh(*args):
    return subprocess.run(list(args), capture_output=True, text=True).stdout


def window():
    # Several windows can carry "GameLib" in the title (an editor with the repo open does), so
    # filter by WM_CLASS and then take the largest geometry.
    ids = sh("xdotool", "search", "--onlyvisible", "--name", "GameLib").split()
    best, best_area = None, -1
    for wid in ids:
        cls = sh("xprop", "-id", wid, "WM_CLASS")
        if CLASS not in cls.lower():
            continue
        w, h = client_geometry(wid)[2:]
        if w * h > best_area:
            best, best_area = wid, w * h
    if best is None:
        raise SystemExit("no visible gamelib-shell window")
    return best


def client_geometry(wid):
    info = sh("xwininfo", "-id", wid)

    def g(k):
        return int(re.search(k + r":\s+(-?\d+)", info).group(1))

    return g("Absolute upper-left X"), g("Absolute upper-left Y"), g("Width"), g("Height")


def shot(out, crop=None):
    from PIL import ImageGrab

    wid = window()
    x, y, w, h = client_geometry(wid)
    if crop:
        cx, cy, cw, ch = crop
        x, y, w, h = x + cx, y + cy, cw, ch
    img = ImageGrab.grab(bbox=(x, y, x + w, y + h), xdisplay=os.environ.get("DISPLAY", ":1"))
    img.convert("RGB").save(out)
    print(f"wrote {out} {img.size[0]}x{img.size[1]}")


def click(rx, ry):
    wid = window()
    x, y, _w, _h = client_geometry(wid)
    subprocess.run(["xdotool", "mousemove", str(x + rx), str(y + ry), "click", "1"], check=True)


def offset(raw):
    with open(raw, encoding="utf-8", errors="replace") as fh:
        return sum(1 for _ in fh)


def collect(raw, off, out):
    n = 0
    with open(raw, encoding="utf-8", errors="replace") as fh, open(out, "w", encoding="utf-8") as dst:
        for i, line in enumerate(fh):
            if i >= off and MARKER in line:
                dst.write(line)
                n += 1
    print(f"collected {n} line(s) -> {out}")


def main(argv):
    cmd = argv[0] if argv else ""
    if cmd == "win":
        wid = window()
        print(wid, *client_geometry(wid))
    elif cmd == "shot":
        crop = tuple(int(v) for v in argv[2].split(",")) if len(argv) > 2 else None
        shot(argv[1], crop)
    elif cmd == "click":
        click(int(argv[1]), int(argv[2]))
    elif cmd == "key":
        subprocess.run(["xdotool", "key", *argv[1:]], check=True)
    elif cmd == "size":
        subprocess.run(["xdotool", "windowsize", window(), argv[1], argv[2]], check=True)
    elif cmd == "offset":
        print(offset(argv[1]))
    elif cmd == "collect":
        collect(argv[1], int(argv[2]), argv[3])
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
