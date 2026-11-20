#!/usr/bin/env python3
"""(front half copied verbatim from the 260930-feh debug driver arm.py) GL_RAW=/some/scratch python3 arm.py LABEL SEQ   (start vite first: setsid pnpm exec vite; record its pgid; stop it with kill -- -PGID)
 arm.py LABEL SEQ   SEQ contains E (Epic round trip) and/or L (link click) or N (neither); order E then L.
Runs one fresh launch, drives it, prints a verdict. Writes captures to $RAW/ev."""
import os, re, subprocess, sys, time
RAW = os.environ["GL_RAW"]  # scratch dir holding launch.sh, drv.py and ev/ (created by the caller)
label, seq = sys.argv[1], sys.argv[2]
ev = f"{RAW}/ev"
for f in (f"{ev}/{label}-identity.txt", f"{ev}/{label}-settled.log"):
    if os.path.exists(f): os.remove(f)
out = open(f"{RAW}/{label}.out", "w")
p = subprocess.Popen([f"{RAW}/launch.sh", label], stdout=out, stderr=subprocess.STDOUT, start_new_session=True)
def drv(*a):
    return subprocess.run(["python3", f"{RAW}/drv.py", wid, *a], capture_output=True, text=True)
wid = None
t0 = time.time()
while time.time() - t0 < 90:
    try:
        m = re.search(r"WINDOW_ID=(\d+)", open(f"{ev}/{label}-identity.txt").read())
        if m: wid = m.group(1); break
    except FileNotFoundError: pass
    time.sleep(1)
assert wid, "no window id"
ident = open(f"{ev}/{label}-identity.txt").read()
print("identity:", "EXE_MATCH=yes" in ident, "DMABUF_VAR_PRESENT=no" in ident)
def boot_ready(max_s):
    """Poll until the splash ('Loading', ~all background pixels) is gone; GL_BOOT_WAIT is the ceiling in seconds.
    Returns the seconds it took, or None on timeout. A release build's cold SEA sidecar takes 27-39 s; dev ~14 s."""
    from PIL import Image
    t = time.time()
    while time.time() - t < max_s:
        drv("cap", f"{ev}/{label}-boot-probe.png")
        im = Image.open(f"{ev}/{label}-boot-probe.png").convert("RGB")
        w, h = im.size
        pts = [(x, y) for x in range(20, w, 32) for y in range(20, h, 32) if not (w // 2 - 120 < x < w // 2 + 120 and h // 2 - 90 < y < h // 2 + 90)]
        diff = sum(1 for xy in pts if im.getpixel(xy) != (7, 10, 11)) / len(pts)
        if diff > 0.05:
            return round(time.time() - t, 1)
        time.sleep(2)
    return None
ready_after = boot_ready(float(os.environ.get("GL_BOOT_WAIT", "14")))
print("boot_ready_after_s:", ready_after)
if ready_after is None:
    print(f"ARM={label} INVALID app still on the Loading splash after GL_BOOT_WAIT"); open(f"{RAW}/stop-{label}", "w").close(); p.wait(timeout=60); sys.exit(3)
time.sleep(3)
def log(): return open(f"{ev}/{label}-settled.log").read().strip().splitlines() if os.path.exists(f"{ev}/{label}-settled.log") else []
def banner():
    """True while the connectivity banner ('Retrying (Ignore)', OfflineMessage) is showing: it pushes the whole
    layout down 40 px, so every fixed-coordinate click below misses. Pixel (300,10) is the banner purple only then."""
    drv("cap", f"{ev}/{label}-banner-probe.png")
    from PIL import Image
    return Image.open(f"{ev}/{label}-banner-probe.png").convert("RGB").getpixel((300, 10)) == (176, 152, 226)
drv("click", "1062", "133"); time.sleep(1.5)     # close release-notes dialog (at banner-free coordinates)
if banner():
    drv("click", "667", "20"); time.sleep(1.5)   # '(Ignore)' -> window.api.setConnectivityOnline()
    print("banner present: clicked Ignore")
    if banner():
        print(f"ARM={label} INVALID banner survived Ignore"); open(f"{RAW}/stop-{label}", "w").close(); p.wait(timeout=60); sys.exit(2)
    drv("click", "1062", "133"); time.sleep(1.5)  # the dialog click above may have missed under the banner
drv("click", "310", "21"); time.sleep(2.5)       # Stores tab (lands on Epic panel on a fresh profile)
drv("click", "50", "59"); time.sleep(9); drv("park"); time.sleep(1)  # GOG
drv("cap", f"{ev}/{label}-1-gog.png")
n_tracer = len(log()); print("tracer lines:", n_tracer)
# ---- mid-drag arm (quick 261001-pez) ----
MODE = os.environ.get("GL_DRAG_MODE", "grow")          # grow | shrink | pointer-grow | pointer-shrink
FRM, TO = ((1100, 650), (1280, 800)) if MODE.endswith("grow") else ((1280, 800), (1100, 650))
STEPS, IVL = int(os.environ.get("GL_DRAG_STEPS", "60")), int(os.environ.get("GL_DRAG_IVL_MS", "16"))
here = os.path.dirname(os.path.abspath(__file__))
drv("size", str(FRM[0]), str(FRM[1])); time.sleep(3.0)    # settle at the start size first
cap_out = f"{ev}/{label}-middrag"
r = subprocess.run(["python3", f"{here}/middrag_capture.py", "--wid", wid, "--out", cap_out, "--from", f"{FRM[0]}x{FRM[1]}",
                    "--to", f"{TO[0]}x{TO[1]}", "--steps", str(STEPS), "--interval-ms", str(IVL), "--hold-ms", "2500"] + (["--pointer"] if MODE.startswith("pointer") else []),
                   capture_output=True, text=True)
print(r.stdout.strip()[-400:], r.stderr.strip()[-400:])
open(f"{RAW}/stop-{label}", "w").close()
p.wait(timeout=60)
print(open(f"{ev}/{label}-teardown.txt").read().strip().replace("\n", " "))
