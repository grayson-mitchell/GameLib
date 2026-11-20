#!/usr/bin/env python3
"""middrag_capture.py -- frames of the app window DURING a continuous resize (quick 261001-pez).

  middrag_capture.py --wid WID --out PREFIX --from WxH --to WxH [--steps 60 --interval-ms 16 --hold-ms 2500]

A grabber thread takes full-rate mss frames of the window's client area (absolute origin from xwininfo) for the
whole run: pre-roll (window still at --from), the drag (xdotool windowsize in --steps equal steps, one every
--interval-ms), then --hold-ms after the last step so the post-drag settle is in the record. Each frame is stamped
with int(time.time()*1000) taken BEFORE the grab and the X size read from xwininfo straight after it.
Writes PREFIX-frames.txt (one `FRAME i t=MS w=W h=H` line each, plus `SEND`/`DRAG_END` lines) and PREFIX-NNNN.raw.png
for every frame in PREFIX-frames/. Consumed by middrag_check.py. Wall clock is the same host clock the harness's
`T=` stamps use.
"""
import argparse, os, re, subprocess, sys, threading, time
import mss
from PIL import Image

def now_ms(): return int(time.time() * 1000)

def xgeom(wid):
    info = subprocess.run(["xwininfo", "-id", wid], capture_output=True, text=True).stdout
    g = lambda k: int(re.search(k + r":\s+(-?\d+)", info).group(1))
    return g("Absolute upper-left X"), g("Absolute upper-left Y"), g("Width"), g("Height")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wid", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--from", dest="frm", required=True); ap.add_argument("--to", required=True)
    ap.add_argument("--steps", type=int, default=60); ap.add_argument("--interval-ms", type=int, default=16, dest="ivl")
    ap.add_argument("--hold-ms", type=int, default=2500, dest="hold")
    ap.add_argument("--pointer", action="store_true", help="drive the resize with a REAL pointer drag on the window corner (xdotool mouse), not windowsize; --from/--to then only give the direction and size of the drag")
    a = ap.parse_args()
    fw, fh = map(int, a.frm.split("x")); tw, th = map(int, a.to.split("x"))
    fdir = a.out + "-frames"; os.makedirs(fdir, exist_ok=True)
    log = open(a.out + "-frames.txt", "w")
    frames, stop = [], threading.Event()
    ox, oy, _, _ = xgeom(a.wid)
    def grabber():
        with mss.MSS() as sct:
            i = 0
            while not stop.is_set():
                t = now_ms()
                _, _, w, h = xgeom(a.wid)
                im = sct.grab({"left": ox, "top": oy, "width": w, "height": h})
                frames.append((i, t, w, h, im.size, bytes(im.bgra))); i += 1
                time.sleep(0.012)                          # ~60 fps is plenty; full rate wrote 1000 PNGs (~1 GB) per run
    th_ = threading.Thread(target=grabber); th_.start()
    time.sleep(0.4)                                      # pre-roll at the start size
    if a.pointer:
        _, _, w0, h0 = xgeom(a.wid)
        ext = subprocess.run(["xprop", "-id", a.wid, "_NET_FRAME_EXTENTS"], capture_output=True, text=True).stdout
        m = re.search(r"=\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)", ext)
        right, bottom = (int(m.group(2)), int(m.group(4))) if m else (0, 0)
        dx, dy = tw - fw, th - fh                         # total pointer travel
        cx, cy = ox + w0 + right + 4, oy + h0 + bottom + 4  # just outside the bottom-right corner, on the WM resize handle
        subprocess.run(["xdotool", "mousemove", str(cx), str(cy)], check=False); time.sleep(0.3)
        subprocess.run(["xdotool", "mousedown", "1"], check=False); time.sleep(0.15)
        for k in range(a.steps):
            t = now_ms()
            subprocess.run(["xdotool", "mousemove_relative", "--", str(round(dx / a.steps)), str(round(dy / a.steps))], check=False)
            log.write(f"SEND k={k} t={t} w=NA h=NA\n")
            time.sleep(max(0, (t + a.ivl - now_ms()) / 1000.0))
        subprocess.run(["xdotool", "mouseup", "1"], check=False)
        subprocess.run(["xdotool", "mousemove", str(ox + w0 + 40), str(oy + 120)], check=False)
    else:
        for k in range(a.steps):
            w = round(fw + (tw - fw) * (k + 1) / a.steps); h = round(fh + (th - fh) * (k + 1) / a.steps)
            t = now_ms()
            subprocess.run(["xdotool", "windowsize", a.wid, str(w), str(h)], check=False)
            log.write(f"SEND k={k} t={t} w={w} h={h}\n")
            time.sleep(max(0, (t + a.ivl - now_ms()) / 1000.0))
    _, _, ew, eh = xgeom(a.wid)
    log.write(f"DRAG_END t={now_ms()} w={ew} h={eh}\n")
    time.sleep(a.hold / 1000.0)
    stop.set(); th_.join()
    for i, t, w, h, size, raw in frames:
        Image.frombytes("RGB", size, raw, "raw", "BGRX").save(f"{fdir}/{i:04d}.png")
        log.write(f"FRAME i={i} t={t} w={w} h={h} img={size[0]}x{size[1]}\n")
    log.close()
    print(f"frames={len(frames)} dir={fdir}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
