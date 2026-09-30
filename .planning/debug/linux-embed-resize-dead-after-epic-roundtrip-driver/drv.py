#!/usr/bin/env python3
"""drv.py WID cmd args...   cmds: click X Y | park | cap OUT | size W H | origin"""
import re, subprocess, sys, time
wid, cmd = sys.argv[1], sys.argv[2]
def origin():
    info = subprocess.run(["xwininfo", "-id", wid], capture_output=True, text=True).stdout
    g = lambda k: int(re.search(k + r":\s+(-?\d+)", info).group(1))
    return g("Absolute upper-left X"), g("Absolute upper-left Y"), g("Width"), g("Height")
def xdo(*a):
    subprocess.run(["xdotool", *a], check=True)
ox, oy, w, h = origin()
if cmd == "click":
    x, y = int(sys.argv[3]), int(sys.argv[4])
    xdo("mousemove", str(ox + x), str(oy + y)); time.sleep(0.15)
    xdo("click", "1")
elif cmd == "park":
    xdo("mousemove", str(ox + w + 40), str(oy + 200))
elif cmd == "cap":
    subprocess.run(["python3", "/home/graysonmitchell/GameLib/.planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/cap.py", wid, sys.argv[3]], check=True)
elif cmd == "size":
    xdo("windowsize", wid, sys.argv[3], sys.argv[4])
elif cmd == "origin":
    print(ox, oy, w, h)
