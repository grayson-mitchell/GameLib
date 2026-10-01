#!/usr/bin/env python3
"""GL_RAW=/some/scratch python3 arm.py LABEL SEQ   (start vite first: setsid pnpm exec vite; record its pgid; stop it with kill -- -PGID)
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
if "E" in seq:
    drv("click", "50", "129"); time.sleep(4)       # Epic
    drv("cap", f"{ev}/{label}-2-epic.png")
    drv("click", "50", "59"); time.sleep(9); drv("park"); time.sleep(1)  # GOG again
    drv("cap", f"{ev}/{label}-3-gog-return.png")
navigated = "n/a"
if "L" in seq:
    from PIL import Image, ImageChops
    drv("cap", f"{ev}/{label}-3b-before-link.png")
    prev = Image.open(f"{ev}/{label}-3b-before-link.png").convert("RGB")
    navigated = "no"
    for attempt in range(1, 4):
        drv("click", "294", "166"); time.sleep(7); drv("park"); time.sleep(1)  # GALAXY link in the embed
        drv("cap", f"{ev}/{label}-4-after-link.png")
        cur = Image.open(f"{ev}/{label}-4-after-link.png").convert("RGB")
        # the GALAXY nav row (y 145..190) disappears once the GALAXY page is showing
        band = (204, 145, 1000, 190)
        d = ImageChops.difference(prev.crop(band), cur.crop(band)).convert("L")
        frac = sum(1 for v in d.getdata() if v > 30) / (d.size[0] * d.size[1])
        print(f"link attempt {attempt}: band changed fraction {frac:.3f}")
        if frac > 0.05:
            navigated = f"yes(attempt {attempt})"; break
before = len(log())
res = []
for (w, h) in ((1100, 650), (1000, 600), (1280, 800)):
    n0 = len(log())
    drv("size", str(w), str(h)); time.sleep(2.6)
    new = log()[n0:]
    settled = [l for l in new if "settled" in l and f"vbox={w}x{h}" in l]
    zero = [l for l in new if "zero-area" in l]
    ok = False
    if settled:
        m = re.search(r"requested=(\S+) embed=(\S+) main=\S+ vbox=(\d+)x(\d+)", settled[-1])
        req, emb = m.group(1), m.group(2)
        rx, ry, rest = req.split(",", 2); rw, rh = rest.split("x") if False else (None, None)
        mm = re.match(r"(-?\d+),(-?\d+),(\d+)x(\d+)", req)
        x, y, ww, hh = map(int, mm.groups())
        ok = (req == emb) and (x + ww == w) and (y + hh == h)
    res.append((f"{w}x{h}", len(settled), len(zero), ok))
    if (w, h) == (1100, 650): drv("cap", f"{ev}/{label}-5-resized-1100x650.png")
print(f"ARM={label} SEQ={seq} link_navigated={navigated} results(size,settled,zero,flush_ok)={res}")
open(f"{RAW}/stop-{label}", "w").close()
p.wait(timeout=60)
print(open(f"{ev}/{label}-teardown.txt").read().strip().replace("\n", " "))
