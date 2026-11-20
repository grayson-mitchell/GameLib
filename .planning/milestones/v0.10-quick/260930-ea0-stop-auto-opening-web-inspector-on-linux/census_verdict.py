#!/usr/bin/env python3
"""census_verdict.py -- per-launch verdict for quick 260930-ea0.

  census_verdict.py <raw-dir> <label>        one verdict line for <label>
  census_verdict.py --selftest <controls-dir>  rejects 3 pre-change controls, accepts a synthetic good launch

Reads the file contract written by probe_live.ts (never written by this script):
  <label>-state.txt  -stderr.txt  -identity.txt  -teardown.txt  -gamelib.log

PASS iff: mounted=yes, webprocs==1, viewport==1280x800, stderr_opened==0 and stderr_skipped>=1,
shim_lines==0, dmabuf_shell/ld_preload/dmabuf_webproc all == absent, teardown==0.
"""
import os
import re
import shutil
import sys
import tempfile

# Exact text of the pre-existing main-window open-confirmation eprintln in main.rs.
OPENED_TEXT = "devtools opened for 'main' webview"
SKIPPED_TEXT = "devtools NOT auto-opened for 'main'"


def read(d, label, suffix):
    try:
        with open(os.path.join(d, f"{label}-{suffix}"), encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return ""


def kv(text):
    out = {}
    for line in text.splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            out.setdefault(k.strip(), v.strip())
    return out


def verdict(d, label):
    log = read(d, label, "gamelib.log")
    mounted = bool(
        any("app-chunk-import-done" in l and "rootKids=1" in l for l in log.splitlines())
        and re.search(r'BLANKPROBE\] \{"at":"t\+6000ms"', log)
    )
    vm = re.search(r'"at":"t\+6000ms","viewport":"(\d+x\d+)', log)
    viewport = vm.group(1) if vm else "none"

    snaps = read(d, label, "state.txt").split("--- SNAP")[1:]
    last = snaps[-1] if snaps else ""
    webprocs = len([l for l in last.splitlines() if l.startswith("  pid=") and "WebKitWebProces" in l])
    pm = re.findall(r"blankprobe_lines=(\d+)", last)
    probe_lines = pm[-1] if pm else "nolog"

    stderr_lines = read(d, label, "stderr.txt").splitlines()
    stderr_opened = sum(1 for l in stderr_lines if OPENED_TEXT in l)
    stderr_skipped = sum(1 for l in stderr_lines if SKIPPED_TEXT in l)
    shim_lines = sum(1 for l in stderr_lines if l.startswith("[shim]"))

    ident = kv(read(d, label, "identity.txt"))
    dmabuf_shell = ident.get("DMABUF_VAR", "unseen")
    ld_preload = ident.get("LD_PRELOAD_VAR", "unseen")
    dmabuf_webproc = ident.get("WEBPROC_DMABUF_VAR", "unseen")
    teardown = kv(read(d, label, "teardown.txt")).get("POST_TEARDOWN_PROCS", "unseen")

    passed = (
        mounted
        and webprocs == 1
        and viewport == "1280x800"
        and stderr_opened == 0
        and stderr_skipped >= 1
        and shim_lines == 0
        and dmabuf_shell == "absent"
        and ld_preload == "absent"
        and dmabuf_webproc == "absent"
        and teardown == "0"
    )
    return {
        "label": label,
        "mounted": "yes" if mounted else "no",
        "probe_lines": probe_lines,
        "webprocs": webprocs,
        "viewport": viewport,
        "stderr_opened": stderr_opened,
        "stderr_skipped": stderr_skipped,
        "shim_lines": shim_lines,
        "dmabuf_shell": dmabuf_shell,
        "ld_preload": ld_preload,
        "dmabuf_webproc": dmabuf_webproc,
        "teardown": teardown,
        "verdict": "PASS" if passed else "FAIL",
    }


def fmt(v):
    return " ".join(f"{k}={val}" for k, val in v.items())


def selftest(controls):
    problems = []

    def expect(name, cond, v):
        if not cond:
            problems.append(f"{name}: diverged -> {fmt(v)}")

    v = verdict(controls, "cUI1")
    print(fmt(v))
    expect("cUI1 (unset, inspector shown, crashed)", v["mounted"] == "no" and v["verdict"] == "FAIL", v)

    v = verdict(controls, "c1I1")
    print(fmt(v))
    expect(
        "c1I1 (=1, inspector shown)",
        v["mounted"] == "yes"
        and v["webprocs"] == 2
        and v["viewport"] == "1280x500"
        and v["dmabuf_shell"] != "absent"
        and v["verdict"] == "FAIL",
        v,
    )

    v = verdict(controls, "cUN1")
    print(fmt(v))
    expect(
        "cUN1 (unset, shim-suppressed)",
        v["mounted"] == "yes"
        and v["webprocs"] == 1
        and v["viewport"] == "1280x800"
        and v["stderr_opened"] == 1
        and v["stderr_skipped"] == 0
        and v["shim_lines"] >= 1
        and v["verdict"] == "FAIL",
        v,
    )

    tmp = tempfile.mkdtemp(prefix="census-selftest-")
    try:
        for suffix in ("state.txt", "stderr.txt", "identity.txt", "teardown.txt", "gamelib.log"):
            shutil.copy(os.path.join(controls, f"cUN1-{suffix}"), os.path.join(tmp, f"synth-{suffix}"))
        se = os.path.join(tmp, "synth-stderr.txt")
        out = []
        for l in open(se, encoding="utf-8", errors="replace").read().splitlines():
            if l.startswith("[shim]"):
                continue
            if OPENED_TEXT in l:
                l = "[shell] devtools NOT auto-opened for 'main' webview on linux (debug build)"
            out.append(l)
        open(se, "w", encoding="utf-8").write("\n".join(out) + "\n")
        with open(os.path.join(tmp, "synth-identity.txt"), "a", encoding="utf-8") as f:
            f.write("LD_PRELOAD_VAR=absent\nWEBPROC_DMABUF_VAR=absent\n")
        v = verdict(tmp, "synth")
        print(fmt(v))
        expect("synthetic good launch", v["verdict"] == "PASS", v)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if problems:
        for p in problems:
            print("SELFTEST DIVERGED: " + p)
        return 1
    print("SELFTEST PASS")
    return 0


def main(argv):
    if len(argv) == 3 and argv[1] == "--selftest":
        return selftest(argv[2])
    if len(argv) == 3:
        print(fmt(verdict(argv[1], argv[2])))
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
