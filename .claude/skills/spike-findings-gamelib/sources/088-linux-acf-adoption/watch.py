#!/usr/bin/env python3
"""Spike 088 watcher: polls once a second, logs NDJSON on change plus a 30 s heartbeat.
usage: watch.py <run-name> [appid=1628350] [seconds=600]"""
import hashlib, json, os, re, subprocess, sys, time
run = sys.argv[1]; app = sys.argv[2] if len(sys.argv) > 2 else "1628350"
secs = int(sys.argv[3]) if len(sys.argv) > 3 else 600
S = os.path.expanduser("~/.steam/debian-installation")
acf = f"{S}/steamapps/appmanifest_{app}.acf"
clog = f"{S}/logs/content_log.txt"
reg = os.path.expanduser("~/.steam/registry.vdf")
out = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "runs", run + ".ndjson"), "a")

def emit(kind, **kw):
    out.write(json.dumps({"t": time.strftime("%H:%M:%S"), "k": kind, **kw}) + "\n"); out.flush()

def pids():
    r = subprocess.run(["pgrep", "-x", "steam"], capture_output=True, text=True)
    return sorted(int(x) for x in r.stdout.split())

def regfacts():
    try: txt = open(reg).read()
    except OSError: return {}
    d = {}
    for key in ("SteamPID", "ActiveUser", "pid"):
        m = re.search(r'"%s"\s+"(\d+)"' % key, txt)
        if m: d[key] = m.group(1)
    m = re.search(r'"%s"\s*\{[^}]*?"Installed"\s+"(\d)"' % app, txt, re.S)
    d["AppInstalled"] = m.group(1) if m else None
    return d

def acffacts():
    try: b = open(acf, "rb").read()
    except OSError: return {"exists": False}
    t = b.decode("utf8", "replace")
    sf = re.search(r'"StateFlags"\s+"(\d+)"', t)
    return {"exists": True, "mtime": int(os.stat(acf).st_mtime), "StateFlags": sf and sf.group(1),
            "LauncherPath": '"LauncherPath"' in t, "sha": hashlib.sha256(b).hexdigest()[:10]}

pos = os.path.getsize(clog) if os.path.exists(clog) else 0
last = None; hb = 0
end = time.time() + secs
emit("start", app=app)
while time.time() < end:
    st = {"pids": pids(), "reg": regfacts(), "acf": acffacts()}
    if st != last or time.time() - hb > 30:
        emit("state" if st != last else "hb", **st); last = st; hb = time.time()
    if os.path.exists(clog):
        sz = os.path.getsize(clog)
        if sz < pos: pos = 0
        if sz > pos:
            with open(clog, "rb") as f:
                f.seek(pos); chunk = f.read().decode("utf8", "replace"); pos = sz
            for line in chunk.splitlines():
                emit("log", line=line)
    time.sleep(1)
emit("end")
