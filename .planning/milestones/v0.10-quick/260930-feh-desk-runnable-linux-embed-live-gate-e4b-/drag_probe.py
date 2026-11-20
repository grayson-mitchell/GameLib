#!/usr/bin/env python3
"""drag_probe.py -- scripted window resizes with wall-clock stamps (quick 260930-feh).

  drag_probe.py --wid WID --out STEPS --arm perstep [--sizes WxH,WxH,... --gap-ms 1500]
  drag_probe.py --wid WID --out STEPS --arm burst [--from 1100x700 --to 1280x800 --steps 40 --interval-ms 25]
  drag_probe.py --wid WID --out STEPS --arm pointer [--delta -180,-100 --steps 20 --interval-ms 25]

Append-only writer. Every time is int(time.time()*1000): the same host wall clock as the harness's
Date.now(). Lines:
  STEP arm=A i=N t_send=MS t_x=MS|NA w=W h=H     w,h are the MEASURED X size for perstep
  ARM_END arm=A t_x_final=MS w=W h=H achieved=yes|no
Consumed by settled_lag.py. Captures for the burst arm are written next to STEPS.
"""
import argparse
import os
import re
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
CAP = os.path.join(HERE, "..", "260930-blh-build-the-gtk-box-native-linux-layout", "cap.py")


def now_ms():
    return int(time.time() * 1000)


def xsize(wid):
    info = subprocess.run(["xwininfo", "-id", wid], capture_output=True, text=True).stdout
    w = re.search(r"Width:\s+(\d+)", info)
    h = re.search(r"Height:\s+(\d+)", info)
    ox = re.search(r"Absolute upper-left X:\s+(-?\d+)", info)
    oy = re.search(r"Absolute upper-left Y:\s+(-?\d+)", info)
    if not (w and h and ox and oy):
        return None
    return int(w.group(1)), int(h.group(1)), int(ox.group(1)), int(oy.group(1))


def emit(path, text):
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(text + "\n")
    print(text, flush=True)


def wait_stable(wid, stable_ms=200, timeout_ms=4000):
    """Return (t_first_of_stable_ms, w, h) once the size has held for stable_ms."""
    t_end = now_ms() + timeout_ms
    cur, since = None, now_ms()
    while now_ms() < t_end:
        s = xsize(wid)
        if s is None:
            time.sleep(0.01)
            continue
        size = (s[0], s[1])
        if size != cur:
            cur, since = size, now_ms()
        elif now_ms() - since >= stable_ms:
            return since, size[0], size[1]
        time.sleep(0.01)
    return since, (cur or (0, 0))[0], (cur or (0, 0))[1]


def arm_perstep(a):
    sizes = [tuple(int(v) for v in s.split("x")) for s in a.sizes.split(",")]
    for i, (w, h) in enumerate(sizes):
        t_send = now_ms()
        subprocess.run(["xdotool", "windowsize", a.wid, str(w), str(h)], check=False)
        t_x, mw, mh = "NA", w, h
        while now_ms() - t_send < 1000:
            s = xsize(a.wid)
            if s and (s[0], s[1]) == (w, h):
                t_x, mw, mh = str(now_ms()), s[0], s[1]
                break
            time.sleep(0.01)
        else:
            s = xsize(a.wid)
            if s:
                mw, mh = s[0], s[1]
        emit(a.out, f"STEP arm=perstep i={i} t_send={t_send} t_x={t_x} w={mw} h={mh}")
        time.sleep(max(0, (t_send + a.gap_ms - now_ms()) / 1000.0))


def arm_burst(a):
    fw, fh = (int(v) for v in a.from_size.split("x"))
    tw, th = (int(v) for v in a.to_size.split("x"))
    for i in range(a.steps):
        w = round(fw + (tw - fw) * (i + 1) / a.steps)
        h = round(fh + (th - fh) * (i + 1) / a.steps)
        t_send = now_ms()
        subprocess.run(["xdotool", "windowsize", a.wid, str(w), str(h)], check=False)
        emit(a.out, f"STEP arm=burst i={i} t_send={t_send} t_x=NA w={w} h={h}")
        time.sleep(max(0, (t_send + a.interval_ms - now_ms()) / 1000.0))
    t_x_final, w, h = wait_stable(a.wid)
    emit(a.out, f"ARM_END arm=burst t_x_final={t_x_final} w={w} h={h} achieved={'yes' if (w, h) == (tw, th) else 'no'}")
    base = os.path.join(os.path.dirname(os.path.abspath(a.out)), "burst-end")
    for label, off in (("100ms", 100), ("1500ms", 1500)):
        time.sleep(max(0, (t_x_final + off - now_ms()) / 1000.0))
        subprocess.run([sys.executable, CAP, a.wid, f"{base}-{label}.png"], check=False)


def arm_pointer(a):
    s0 = xsize(a.wid)
    if s0 is None:
        emit(a.out, "ARM_END arm=pointer t_x_final=0 w=0 h=0 achieved=no")
        return
    w0, h0, ox, oy = s0
    ext = subprocess.run(["xprop", "-id", a.wid, "_NET_FRAME_EXTENTS"], capture_output=True, text=True).stdout
    m = re.search(r"=\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)", ext)
    left, right, top, bottom = (int(v) for v in m.groups()) if m else (0, 0, 0, 0)
    dx, dy = (int(v) for v in a.delta.split(","))
    cx, cy = ox + w0 + right + 4, oy + h0 + bottom + 4
    t_send = now_ms()
    emit(a.out, f"STEP arm=pointer i=0 t_send={t_send} t_x=NA w={w0} h={h0}")
    subprocess.run(["xdotool", "mousemove", str(cx), str(cy)], check=False)
    time.sleep(0.3)
    subprocess.run(["xdotool", "mousedown", "1"], check=False)
    time.sleep(0.15)
    for _ in range(a.steps):
        subprocess.run(["xdotool", "mousemove_relative", "--", str(round(dx / a.steps)), str(round(dy / a.steps))], check=False)
        time.sleep(a.interval_ms / 1000.0)
    subprocess.run(["xdotool", "mouseup", "1"], check=False)
    t_x_final, w, h = wait_stable(a.wid)
    subprocess.run(["xdotool", "mousemove", str(ox + w0 + 40), str(oy + 120)], check=False)
    achieved = "yes" if (w, h) != (w0, h0) else "no"
    emit(a.out, f"ARM_END arm=pointer t_x_final={t_x_final} w={w} h={h} achieved={achieved} start={w0}x{h0} extents={left},{right},{top},{bottom}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--wid", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--arm", required=True, choices=["perstep", "burst", "pointer"])
    p.add_argument("--sizes", default="1250x784,1220x768,1190x750,1160x734,1130x716,1100x700")
    p.add_argument("--gap-ms", type=int, default=1500, dest="gap_ms")
    p.add_argument("--from", default="1100x700", dest="from_size")
    p.add_argument("--to", default="1280x800", dest="to_size")
    p.add_argument("--steps", type=int, default=None)
    p.add_argument("--interval-ms", type=int, default=25, dest="interval_ms")
    p.add_argument("--delta", default="-180,-100")
    a = p.parse_args()
    if a.steps is None:
        a.steps = 40 if a.arm == "burst" else 20
    {"perstep": arm_perstep, "burst": arm_burst, "pointer": arm_pointer}[a.arm](a)
    return 0


if __name__ == "__main__":
    sys.exit(main())
