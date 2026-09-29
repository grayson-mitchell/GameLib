#!/usr/bin/env python3
"""cap.py <window-id> <out.png> [crop x,y,w,h] -- grab the window's client area via its ABSOLUTE
origin (xwininfo), because xdotool's getwindowgeometry origin is frame-relative and off by the
decoration offset on this host (measured: xdotool 60,164 vs xwininfo 50,119)."""
import re, subprocess, sys
import mss
from PIL import Image
wid, out = sys.argv[1], sys.argv[2]
info = subprocess.run(["xwininfo", "-id", wid], capture_output=True, text=True).stdout
g = lambda k: int(re.search(k + r":\s+(-?\d+)", info).group(1))
x, y, w, h = g("Absolute upper-left X"), g("Absolute upper-left Y"), g("Width"), g("Height")
with mss.MSS() as sct:
    im = sct.grab({"left": x, "top": y, "width": w, "height": h})
    Image.frombytes("RGB", im.size, im.bgra, "raw", "BGRX").save(out)
print(f"wrote {out} origin={x},{y} size={w}x{h}")
