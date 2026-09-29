#!/usr/bin/env python3
"""
Task 1 deviation instrument for quick 260929-hgm (Phase 38 `38-S12`, sitting 8).

Measured live: `linux_sitting_capture.py`'s `find_window()` sources its x/y from
`xdotool getwindowgeometry --shell`, which on THIS host, after this sitting's
screen-unlock, reported a stable but WRONG client origin -- x=60,y=164 -- a
constant (+10,+45) offset from the window's true rendered top-left. Proven wrong
two independent ways: `xwininfo -id <id>`'s "Absolute upper-left" (50,119),
matching `_NET_FRAME_EXTENTS` math; and pyatspi's DESKTOP_COORDS extents for the
NavTabs "SETTINGS" page-tab (x=415,y=123), which is ABOVE y=164 and therefore
provably outside the region `grab`/`burst`/`selftest` were capturing. A click at
the AT-SPI-reported absolute screen position (478,142) landed on the real
SETTINGS tab and navigated there -- empirical proof the true origin is (50,119),
not (60,164). Every grab/burst taken before this file was written in this
sitting used the wrong region (cropped 45px too low, missing the top NavTabs
strip, and running 45px past the window's true bottom edge into whatever sits
behind it on the desktop) and is NOT trusted as evidence.

Reuses `linux_sitting_capture.py`'s `diff` subcommand unchanged for post-hoc
frame comparison (it reads saved PNGs by path and never calls find_window()).
Does not modify or replace that shared instrument -- this is a narrow,
documented correction for this sitting only, not a general fix.
"""

import argparse
import json
import os
import subprocess
import sys
import time

import mss
from PIL import Image

WINDOW_NAME = "^GameLib$"


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def find_window_corrected():
    r = run(["xdotool", "search", "--onlyvisible", "--name", WINDOW_NAME])
    if r.returncode != 0 or not r.stdout.strip():
        return None
    win_id = [w for w in r.stdout.strip().splitlines() if w.strip()][0]

    info = run(["xwininfo", "-id", win_id])
    x = y = width = height = None
    for line in info.stdout.splitlines():
        line = line.strip()
        if line.startswith("Absolute upper-left X:"):
            x = int(line.split(":", 1)[1].strip())
        elif line.startswith("Absolute upper-left Y:"):
            y = int(line.split(":", 1)[1].strip())
        elif line.startswith("Width:"):
            width = int(line.split(":", 1)[1].strip())
        elif line.startswith("Height:"):
            height = int(line.split(":", 1)[1].strip())

    pid_r = run(["xdotool", "getwindowpid", win_id])
    pid = pid_r.stdout.strip()
    exe = None
    if pid:
        try:
            exe = os.readlink(f"/proc/{pid}/exe")
        except OSError:
            exe = None

    return {
        "window_id": win_id,
        "pid": pid,
        "exe": exe,
        "x": x,
        "y": y,
        "width": width,
        "height": height,
    }


def grab_region(win):
    with mss.mss() as sct:
        monitor = {
            "left": win["x"],
            "top": win["y"],
            "width": win["width"],
            "height": win["height"],
        }
        shot = sct.grab(monitor)
        return Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")


def get_client_list():
    r = run(["xprop", "-root", "_NET_CLIENT_LIST"])
    out = r.stdout.strip()
    clients = []
    if "window id # " not in out:
        return clients
    ids_part = out.split("window id # ", 1)[1]
    ids = [x.strip() for x in ids_part.split(",") if x.strip()]
    for wid in ids:
        wid = wid.split()[0]
        pid_r = run(["xprop", "-id", wid, "_NET_WM_PID"])
        pid = None
        if "=" in pid_r.stdout:
            try:
                pid = pid_r.stdout.strip().split("=", 1)[1].strip()
            except (IndexError, ValueError):
                pid = None
        exe = None
        if pid:
            try:
                exe = os.readlink(f"/proc/{pid}/exe")
            except OSError:
                exe = None
        class_r = run(["xprop", "-id", wid, "WM_CLASS"])
        wm_class = class_r.stdout.strip().split("=", 1)[-1].strip() if "=" in class_r.stdout else ""
        name_r = run(["xprop", "-id", wid, "_NET_WM_NAME"])
        title = name_r.stdout.strip().split("=", 1)[-1].strip() if "=" in name_r.stdout else ""
        clients.append({"window_id": wid, "pid": pid, "exe": exe, "wm_class": wm_class, "title": title})
    return clients


def cmd_find(_args):
    w = find_window_corrected()
    if w is None:
        print("NO WINDOW FOUND", file=sys.stderr)
        sys.exit(1)
    print(json.dumps(w, indent=2))


def cmd_grab(args):
    win = find_window_corrected()
    if win is None:
        print("NO WINDOW FOUND", file=sys.stderr)
        sys.exit(1)
    img = grab_region(win)
    img.save(args.out)
    print(f"wrote {args.out} ({img.size[0]}x{img.size[1]})")


def parse_click(value):
    x, y = value.split(",")
    return int(x), int(y)


def cmd_burst(args):
    win = find_window_corrected()
    if win is None:
        print("NO WINDOW FOUND", file=sys.stderr)
        sys.exit(1)

    os.makedirs(args.out, exist_ok=True)

    baseline_ids = {c["window_id"] for c in get_client_list()}
    seen = {}
    click_info = None

    start = time.time()
    click_at = start + args.pre if args.click else None
    end = start + args.seconds
    clicked = False

    frame_count = 0
    deltas = []
    last_t = start

    while True:
        now = time.time()
        if now >= end:
            break

        img = grab_region(win)
        epoch_ms = int(now * 1000)
        img.save(os.path.join(args.out, f"frame_{epoch_ms}.png"))
        frame_count += 1
        deltas.append(now - last_t)
        last_t = now

        for c in get_client_list():
            wid = c["window_id"]
            if wid in baseline_ids:
                continue
            ts_ms = int(time.time() * 1000)
            if wid not in seen:
                seen[wid] = dict(c)
                seen[wid]["first_seen"] = ts_ms
                seen[wid]["last_seen"] = ts_ms
            else:
                seen[wid]["last_seen"] = ts_ms

        if args.click and not clicked and time.time() >= click_at:
            run(["xdotool", "windowactivate", "--sync", win["window_id"]])
            x, y = args.click
            run(["xdotool", "mousemove", "--sync", str(x), str(y), "click", "1"])
            click_info = {"x": x, "y": y, "epoch_ms": int(time.time() * 1000)}
            clicked = True

    elapsed = time.time() - start
    fps = frame_count / elapsed if elapsed > 0 else 0
    median_interval_ms = sorted(deltas)[len(deltas) // 2] * 1000 if deltas else 0

    with open(os.path.join(args.out, "clients.jsonl"), "w") as f:
        for wid, info in seen.items():
            f.write(json.dumps(info) + "\n")

    if click_info is not None:
        with open(os.path.join(args.out, "click.json"), "w") as f:
            json.dump(click_info, f, indent=2)

    print(f"frames={frame_count} fps={fps:.1f} median_interval={median_interval_ms:.1f}ms")
    if click_info is not None:
        print(f"click={json.dumps(click_info)}")
    print(f"new_windows={len(seen)}")


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("find")
    p_grab = sub.add_parser("grab")
    p_grab.add_argument("--out", required=True)
    p_burst = sub.add_parser("burst")
    p_burst.add_argument("--out", required=True)
    p_burst.add_argument("--pre", type=float, default=0.5)
    p_burst.add_argument("--seconds", type=float, required=True)
    p_burst.add_argument("--click", type=parse_click, default=None)
    args = parser.parse_args()

    if args.command == "find":
        cmd_find(args)
    elif args.command == "grab":
        cmd_grab(args)
    elif args.command == "burst":
        cmd_burst(args)


if __name__ == "__main__":
    main()
