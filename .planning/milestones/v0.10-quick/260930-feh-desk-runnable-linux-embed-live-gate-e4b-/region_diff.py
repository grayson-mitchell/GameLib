#!/usr/bin/env python3
"""region_diff.py -- changed-pixel fractions for chrome / leftnav / slot regions (quick 260930-feh).

  region_diff.py A.png B.png --slot-from LOG [--scale S] [--same REGION]... [--changed REGION]...
  region_diff.py --selftest

Takes the LAST `settled requested=...` line of LOG (regex search, so a `T=<ms>` prefix is fine) and
multiplies its geometry by S (default 1) to get three regions:
  chrome  = (0, 0, vbox_w, y)              the band above the slot
  leftnav = (0, y, x, vbox_h - y)          the band left of the slot
  slot    = (x, y, w, h)                   the requested rect
Exit 2 if either image differs from (vbox_w*S, vbox_h*S) by more than 2 px (the capture would not
match the geometry). A pixel is CHANGED when its max absolute channel difference is over 24.
Prints REGION=<name> CHANGED=<fraction 4dp> for all three regions, then VERDICT=PASS|FAIL|NONE.
  --same     requires CHANGED <= 0.005
  --changed  requires CHANGED >  0.05
With neither flag the verdict is NONE and the exit code is 0 (recording only).
"""
import os
import re
import sys
import tempfile

from PIL import Image, ImageChops

PAT = re.compile(
    r"settled requested=(-?\d+),(-?\d+),(\d+)x(\d+) "
    r"embed=(-?\d+),(-?\d+),(\d+)x(\d+) "
    r"main=(-?\d+),(-?\d+),(\d+)x(\d+) "
    r"vbox=(\d+)x(\d+)"
)
SAME_MAX = 0.005
CHANGED_MIN = 0.05
PX_THRESH = 24


def last_settled(path):
    last = None
    with open(path, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            m = PAT.search(line)
            if m:
                last = [int(g) for g in m.groups()]
    return last


def regions(v, scale):
    x, y, w, h = v[0], v[1], v[2], v[3]
    vw, vh = v[12], v[13]
    s = scale
    return (
        {
            "chrome": (0, 0, vw * s, y * s),
            "leftnav": (0, y * s, x * s, (vh - y) * s),
            "slot": (x * s, y * s, w * s, h * s),
        },
        (vw * s, vh * s),
    )


def frac(a, b, box):
    x, y, w, h = box
    if w <= 0 or h <= 0:
        return 0.0
    ca = a.crop((x, y, x + w, y + h)).convert("RGB")
    cb = b.crop((x, y, x + w, y + h)).convert("RGB")
    d = ImageChops.difference(ca, cb)
    # max channel difference per pixel
    r, g, bl = d.split()
    mx = ImageChops.lighter(ImageChops.lighter(r, g), bl)
    hist = mx.histogram()
    changed = sum(hist[PX_THRESH + 1 :])
    return changed / float(w * h)


def run(a_img, b_img, v, scale, same, changed):
    regs, want = regions(v, scale)
    for name, im in (("A", a_img), ("B", b_img)):
        if abs(im.size[0] - want[0]) > 2 or abs(im.size[1] - want[1]) > 2:
            print(f"SIZE_MISMATCH image {name} is {im.size[0]}x{im.size[1]} but geometry wants {want[0]}x{want[1]}")
            return 2, {}
    out = {}
    for name in ("chrome", "leftnav", "slot"):
        out[name] = frac(a_img, b_img, regs[name])
        print(f"REGION={name} CHANGED={out[name]:.4f}")
    if not same and not changed:
        print("VERDICT=NONE")
        return 0, out
    ok = True
    for n in same:
        if out[n] > SAME_MAX:
            ok = False
    for n in changed:
        if out[n] <= CHANGED_MIN:
            ok = False
    print("VERDICT=" + ("PASS" if ok else "FAIL"))
    return (0 if ok else 1), out


def selftest():
    fails = []
    line = ("[shell] store_embed(linux): settled requested=40,20,160x80 embed=40,20,160x80 "
            "main=0,0,200x100 vbox=200x100")
    tmp = tempfile.NamedTemporaryFile("w", suffix=".log", delete=False)
    tmp.write("T=1 " + line + "\n")
    tmp.close()
    try:
        v = last_settled(tmp.name)
        white = Image.new("RGB", (200, 100), (255, 255, 255))

        def painted(box, scale=1, size=(200, 100)):
            im = Image.new("RGB", (size[0], size[1]), (255, 255, 255))
            x, y, w, h = box
            im.paste((0, 0, 0), (x * scale, y * scale, (x + w) * scale, (y + h) * scale))
            return im

        # quiet the prints inside the selftest
        real = sys.stdout
        sys.stdout = open(os.devnull, "w")
        try:
            rc, _ = run(white, white.copy(), v, 1, ["chrome", "leftnav", "slot"], [])
            if rc != 0:
                fails.append("rejected identical images under --same all three")
            rc, _ = run(white, painted((40, 20, 160, 80)), v, 1, ["chrome"], ["slot"])
            if rc != 0:
                fails.append("rejected a painted slot under --changed slot --same chrome")
            rc, _ = run(white, painted((0, 0, 200, 20)), v, 1, ["chrome"], [])
            if rc == 0:
                fails.append("ACCEPTED a painted chrome band under --same chrome")
            rc, res = run(
                Image.new("RGB", (400, 200), (255, 255, 255)),
                painted((40, 20, 160, 80), scale=2, size=(400, 200)),
                v, 2, [], [],
            )
            if rc != 0 or res.get("chrome", 1) != 0 or res.get("slot", 0) <= 0.9:
                fails.append(f"scale-2 fractions wrong: rc={rc} {res}")
            rc, _ = run(Image.new("RGB", (300, 100)), white, v, 1, [], [])
            if rc != 2:
                fails.append("did not exit 2 on a size mismatch")
        finally:
            sys.stdout.close()
            sys.stdout = real
    finally:
        os.unlink(tmp.name)
    if fails:
        print("SELFTEST FAIL: " + "; ".join(fails))
        return 1
    print("SELFTEST PASS: accepts identical/painted-slot, rejects painted chrome, scale-2 ok, size mismatch exits 2")
    return 0


def main(argv):
    if "--selftest" in argv:
        return selftest()
    pos = []
    slot_from = None
    scale = 1
    same, changed = [], []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--slot-from":
            slot_from = argv[i + 1]
            i += 2
        elif a == "--scale":
            scale = int(argv[i + 1])
            i += 2
        elif a == "--same":
            same.append(argv[i + 1])
            i += 2
        elif a == "--changed":
            changed.append(argv[i + 1])
            i += 2
        else:
            pos.append(a)
            i += 1
    if len(pos) != 2 or not slot_from:
        print(__doc__)
        return 2
    for n in same + changed:
        if n not in ("chrome", "leftnav", "slot"):
            print(f"unknown region {n}")
            return 2
    v = last_settled(slot_from)
    if not v:
        print("no settled line in " + slot_from)
        return 2
    rc, _ = run(Image.open(pos[0]), Image.open(pos[1]), v, scale, same, changed)
    return rc


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
