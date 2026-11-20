#!/usr/bin/env python3
"""
linux_sitting_capture.py -- Linux-sitting capture harness for Phase 38.

Exists for Phase 38's LIVE Linux UAT sittings (quick 260928-tvk, "sitting 6" --
the first Linux sitting). Reusable for the remaining Linux items 38-S10,
38-S12 and 38-S16's Linux half. Uses only `mss`, `PIL`, `Xlib` and shell-outs
to `xdotool`/`xprop` -- no network calls.

Subcommands:
  find                          Print window id, PID, /proc/<pid>/exe and
                                 geometry of the visible `^GameLib$` window.
  selftest                      Run `find`, assert build identity, assert a
                                 non-blank grab, and measure achievable burst
                                 fps (must be >= 10). One PASS/FAIL line per
                                 check; exits non-zero on any FAIL.
  grab --out FILE                Write one window-region PNG.
  clients                       Print every top-level client from the root
                                 _NET_CLIENT_LIST: window id, PID, exe,
                                 WM_CLASS and _NET_WM_NAME.
  burst --out DIR --pre S --seconds N [--click X,Y]
                                 Capture window-region frames as fast as
                                 possible into DIR, appending any new
                                 top-level client seen mid-burst to
                                 DIR/clients.jsonl. With --click, activates
                                 the GameLib window, waits --pre seconds,
                                 then issues a synthetic click and records
                                 its epoch ms to DIR/click.json.
  diff DIR [--flag F]           For every frame in DIR, compute the fraction
                                 of pixels whose summed abs RGB difference
                                 from the FIRST frame exceeds 48. Print the
                                 max fraction, its frame, and every frame
                                 above F.
"""

import argparse
import json
import os
import subprocess
import sys
import time

from PIL import Image
import mss

WINDOW_NAME = "^GameLib$"
EXPECTED_EXE_SUFFIX = "src-tauri/target/debug/gamelib-shell"
DIFF_THRESHOLD = 48


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, check=False)


def find_window():
    """Return dict: window_id, pid, exe, x, y, width, height -- or None."""
    r = run(["xdotool", "search", "--onlyvisible", "--name", WINDOW_NAME])
    if r.returncode != 0 or not r.stdout.strip():
        return None
    win_ids = [w for w in r.stdout.strip().splitlines() if w.strip()]
    if not win_ids:
        return None
    win_id = win_ids[0]

    geo = run(["xdotool", "getwindowgeometry", "--shell", win_id])
    geom = {}
    for line in geo.stdout.strip().splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            geom[k.strip()] = v.strip()

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
        "x": int(geom.get("X", 0)),
        "y": int(geom.get("Y", 0)),
        "width": int(geom.get("WIDTH", 0)),
        "height": int(geom.get("HEIGHT", 0)),
    }


def cmd_find(_args):
    w = find_window()
    if w is None:
        print("NO WINDOW FOUND matching " + WINDOW_NAME, file=sys.stderr)
        sys.exit(1)
    print(json.dumps(w, indent=2))
    return w


def grab_region(win):
    """Return a PIL Image of the window region using mss."""
    with mss.mss() as sct:
        monitor = {
            "left": win["x"],
            "top": win["y"],
            "width": win["width"],
            "height": win["height"],
        }
        shot = sct.grab(monitor)
        img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
        return img


def cmd_grab(args):
    win = find_window()
    if win is None:
        print("NO WINDOW FOUND", file=sys.stderr)
        sys.exit(1)
    img = grab_region(win)
    img.save(args.out)
    print(f"wrote {args.out} ({img.size[0]}x{img.size[1]})")


def get_client_list():
    """Return list of dicts: window_id, pid, exe, wm_class, title."""
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
        clients.append(
            {
                "window_id": wid,
                "pid": pid,
                "exe": exe,
                "wm_class": wm_class,
                "title": title,
            }
        )
    return clients


def cmd_clients(_args):
    for c in get_client_list():
        print(json.dumps(c))


def cmd_selftest(_args):
    failures = 0

    w = find_window()
    if w is None:
        print("FAIL find-window: no window matching " + WINDOW_NAME)
        sys.exit(1)
    print("PASS find-window: " + json.dumps(w))

    if w["exe"] and w["exe"].endswith(EXPECTED_EXE_SUFFIX):
        print(f"PASS identity: exe={w['exe']}")
    else:
        print(f"FAIL identity: exe={w['exe']!r} does not end with {EXPECTED_EXE_SUFFIX}")
        failures += 1

    img = grab_region(w)
    pixels = list(img.getdata())
    distinct = len(set(pixels))
    # population stddev of the flattened R,G,B channel values
    flat = []
    for p in pixels[:20000]:  # bound cost on large windows
        flat.extend(p)
    n = len(flat)
    mean = sum(flat) / n if n else 0
    var = sum((v - mean) ** 2 for v in flat) / n if n else 0
    stddev = var ** 0.5
    if stddev > 3.0 and distinct > 1:
        print(f"PASS non-blank: stddev={stddev:.2f} distinct_colors={distinct}")
    else:
        print(f"FAIL non-blank: stddev={stddev:.2f} distinct_colors={distinct}")
        failures += 1

    start = time.time()
    frames = 0
    deltas = []
    last = start
    while time.time() - start < 2.0:
        grab_region(w)
        now = time.time()
        deltas.append(now - last)
        last = now
        frames += 1
    elapsed = time.time() - start
    fps = frames / elapsed if elapsed > 0 else 0
    median_interval_ms = sorted(deltas)[len(deltas) // 2] * 1000 if deltas else 0
    if fps >= 10:
        print(f"PASS fps: {fps:.1f} fps, median_interval={median_interval_ms:.1f}ms")
    else:
        print(f"FAIL fps: {fps:.1f} fps (need >= 10), median_interval={median_interval_ms:.1f}ms")
        failures += 1

    if failures:
        print(f"SELFTEST FAILED: {failures} check(s) failed")
        sys.exit(1)
    print("SELFTEST PASSED")


def cmd_burst(args):
    win = find_window()
    if win is None:
        print("NO WINDOW FOUND", file=sys.stderr)
        sys.exit(1)

    os.makedirs(args.out, exist_ok=True)

    baseline_ids = {c["window_id"] for c in get_client_list()}
    seen = {}  # window_id -> {first_seen, last_seen, pid, exe, wm_class, title}
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


def cmd_diff(args):
    files = sorted(
        f for f in os.listdir(args.dir) if f.startswith("frame_") and f.endswith(".png")
    )
    if not files:
        print("NO FRAMES FOUND in " + args.dir, file=sys.stderr)
        sys.exit(1)

    first_img = Image.open(os.path.join(args.dir, files[0])).convert("RGB")
    first_pixels = list(first_img.getdata())
    total = len(first_pixels)

    max_frac = 0.0
    max_frame = files[0]
    flagged = []

    for fname in files:
        img = Image.open(os.path.join(args.dir, fname)).convert("RGB")
        pixels = list(img.getdata())
        if len(pixels) != total:
            # size mismatch -- treat as fully different
            frac = 1.0
        else:
            changed = 0
            for (r0, g0, b0), (r1, g1, b1) in zip(first_pixels, pixels):
                if abs(r0 - r1) + abs(g0 - g1) + abs(b0 - b1) > DIFF_THRESHOLD:
                    changed += 1
            frac = changed / total if total else 0
        if frac > max_frac:
            max_frac = frac
            max_frame = fname
        if args.flag is not None and frac > args.flag:
            flagged.append((fname, frac))

    print(f"max_fraction={max_frac:.4f} max_frame={max_frame}")
    if args.flag is not None:
        print(f"flagged (> {args.flag}):")
        for fname, frac in flagged:
            print(f"  {fname}: {frac:.4f}")


def parse_click(value):
    x, y = value.split(",")
    return int(x), int(y)


def main():
    parser = argparse.ArgumentParser(description="Linux sitting capture harness (Phase 38)")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("find")
    sub.add_parser("selftest")
    sub.add_parser("clients")

    p_grab = sub.add_parser("grab")
    p_grab.add_argument("--out", required=True)

    p_burst = sub.add_parser("burst")
    p_burst.add_argument("--out", required=True)
    p_burst.add_argument("--pre", type=float, default=0.5)
    p_burst.add_argument("--seconds", type=float, required=True)
    p_burst.add_argument("--click", type=parse_click, default=None)

    p_diff = sub.add_parser("diff")
    p_diff.add_argument("dir")
    p_diff.add_argument("--flag", type=float, default=None)

    args = parser.parse_args()

    if args.command == "find":
        cmd_find(args)
    elif args.command == "selftest":
        cmd_selftest(args)
    elif args.command == "grab":
        cmd_grab(args)
    elif args.command == "clients":
        cmd_clients(args)
    elif args.command == "burst":
        cmd_burst(args)
    elif args.command == "diff":
        cmd_diff(args)


if __name__ == "__main__":
    main()
