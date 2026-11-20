#!/usr/bin/env python3
"""settled_lag.py -- per-step settle correctness and lag (quick 260930-feh, Linux branch of 38-E04).

  settled_lag.py STEPS SETTLED_LOG --arm perstep|burst|pointer
  settled_lag.py --selftest

STEPS is drag_probe.py output (wall-clock ms: `STEP arm=.. i=.. t_send=.. t_x=.. w=.. h=..` and
`ARM_END arm=.. t_x_final=.. w=.. h=.. achieved=..`). SETTLED_LOG holds `T=<epoch ms> [shell]
store_embed(linux): settled ...` lines (regex search, so the prefix is tolerated). The T= stamp is the
harness's 50 ms drain time, so every lag carries +50 ms of poll granularity; the shell also debounces
settled logging by SETTLE_MS = 500 after the LAST bounds message, so every lag carries a 500 ms floor
BY DESIGN. est_apply = lag - 500 is an estimate only.

perstep: step i's window runs from t_x_i to the next step's t_send (t_x_i + 3000 for the last).
  MATCHED  the LAST settled line in the window has vbox == (w_i, h_i), embed == requested, main ==
           (0,0,vbox) and the slot is flush (+-1) with the vbox's right and bottom edges
  STALE    lines exist, none of them fails the base check, but the last one does not match
  FAIL     some line in the window fails the base check (embed != requested, or main squeezed)
  MISSING  no settled line in the window (the renderer never re-sent bounds)
  ERRORS   a step whose X size change was never observed, plus every `store_embed(linux): error` line
burst / pointer: the same rule applied once, from t_x_final to t_x_final + 3000, against the final
  size; LINES_DURING counts settled lines between the first t_send and t_x_final.
pointer with achieved=no prints VERDICT=NOT_ACHIEVABLE and exits 3.
PASS requires MATCHED == STEPS and zero MISSING, STALE, FAIL and ERRORS. No latency threshold is
invented: the ledger's "no visible lag" is perceptual and is NOT MEASURED here.
"""
import os
import re
import sys
import tempfile

PAT = re.compile(
    r"settled requested=(-?\d+),(-?\d+),(\d+)x(\d+) "
    r"embed=(-?\d+),(-?\d+),(\d+)x(\d+) "
    r"main=(-?\d+),(-?\d+),(\d+)x(\d+) "
    r"vbox=(\d+)x(\d+)"
)
TPAT = re.compile(r"T=(\d+)")
DEBOUNCE_MS = 500
POLL_MS = 50
WINDOW_TAIL_MS = 3000


def parse_settled(lines):
    """-> (settled [(T, req, vbox, base_ok, flush_ok)], zero_area_Ts, error_count)"""
    settled, zero, errors = [], [], 0
    for line in lines:
        tm = TPAT.search(line)
        t = int(tm.group(1)) if tm else None
        if "store_embed(linux): error" in line:
            errors += 1
        if "ignored zero-area bounds" in line and t is not None:
            zero.append(t)
        m = PAT.search(line)
        if not m or t is None:
            continue
        v = [int(g) for g in m.groups()]
        req, emb, main, vbox = tuple(v[0:4]), tuple(v[4:8]), tuple(v[8:12]), (v[12], v[13])
        base_ok = emb == req and main == (0, 0, vbox[0], vbox[1])
        flush_ok = abs(req[0] + req[2] - vbox[0]) <= 1 and abs(req[1] + req[3] - vbox[1]) <= 1
        settled.append((t, req, vbox, base_ok, flush_ok))
    return settled, zero, errors


def parse_steps(lines, arm):
    steps, end = [], None
    for line in lines:
        kv = dict(re.findall(r"(\w+)=(\S+)", line))
        if kv.get("arm") != arm:
            continue
        if line.startswith("STEP"):
            steps.append(kv)
        elif line.startswith("ARM_END"):
            end = kv
    return steps, end


def judge_window(settled, t0, t1, want):
    """-> (status, lag_ms|None) for lines with t0 <= T < t1 against want=(w,h)."""
    win = [s for s in settled if t0 <= s[0] < t1]
    if not win:
        return "MISSING", None
    if any(not s[3] for s in win):
        return "FAIL", None
    last = win[-1]
    if last[2] == want and last[4]:
        first = next(s for s in win if s[2] == want and s[4])
        return "MATCHED", first[0] - t0
    return "STALE", None


def evaluate(step_lines, settled_lines, arm):
    settled, zero, errors = parse_settled(settled_lines)
    steps, end = parse_steps(step_lines, arm)
    out = {"ARM": arm}
    if arm == "pointer" and end is not None and end.get("achieved") == "no":
        return 3, "ARM=pointer VERDICT=NOT_ACHIEVABLE achieved=no"
    counts = {"MATCHED": 0, "MISSING": 0, "STALE": 0, "FAIL": 0}
    lags, during, nzero = [], 0, 0
    n_err = errors
    if arm == "perstep":
        for i, st in enumerate(steps):
            if st.get("t_x", "NA") == "NA":
                n_err += 1
                continue
            t_x = int(st["t_x"])
            t1 = int(steps[i + 1]["t_send"]) if i + 1 < len(steps) else t_x + WINDOW_TAIL_MS
            want = (int(st["w"]), int(st["h"]))
            status, lag = judge_window(settled, t_x, t1, want)
            counts[status] += 1
            nzero += sum(1 for z in zero if t_x <= z < t1)
            if lag is not None:
                lags.append(lag)
        n_steps = len(steps)
    else:
        if end is None or not steps:
            return 4, f"ARM={arm} VERDICT=FAIL reason=no_steps_or_arm_end"
        t_x_final = int(end["t_x_final"])
        want = (int(end["w"]), int(end["h"]))
        t_first = min(int(s["t_send"]) for s in steps)
        during = sum(1 for s in settled if t_first <= s[0] < t_x_final)
        status, lag = judge_window(settled, t_x_final, t_x_final + WINDOW_TAIL_MS, want)
        counts[status] += 1
        nzero += sum(1 for z in zero if t_first <= z < t_x_final + WINDOW_TAIL_MS)
        if lag is not None:
            lags.append(lag)
        n_steps = 1
    ok = counts["MATCHED"] == n_steps and n_steps > 0 and not (
        counts["MISSING"] or counts["STALE"] or counts["FAIL"] or n_err
    )
    max_lag = max(lags) if lags else -1
    min_lag = min(lags) if lags else -1
    line = (
        f"ARM={arm} STEPS={n_steps} MATCHED={counts['MATCHED']} MISSING={counts['MISSING']} "
        f"STALE={counts['STALE']} FAIL={counts['FAIL']} ERRORS={n_err} "
        f"MAX_LAG_MS={max_lag} MIN_LAG_MS={min_lag} MAX_EST_APPLY_MS={max_lag - DEBOUNCE_MS if lags else -1} "
        f"DEBOUNCE_MS={DEBOUNCE_MS} POLL_MS={POLL_MS} ZERO_AREA={nzero}"
    )
    if arm != "perstep":
        line += f" LINES_DURING={during}"
    line += " VERDICT=" + ("PASS" if ok else "FAIL")
    return (0 if ok else 1), line


def sline(t, req, vbox, embed=None, main=None):
    embed = embed or req
    main = main or (0, 0, vbox[0], vbox[1])
    return "T=%d [shell] store_embed(linux): settled requested=%d,%d,%dx%d embed=%d,%d,%dx%d main=%d,%d,%dx%d vbox=%dx%d" % (
        t, *req, *embed, *main, *vbox)


def good_for(t, vbox):
    return sline(t, (204, 82, vbox[0] - 204, vbox[1] - 82), vbox)


def selftest():
    fails = []
    sizes = [(1250, 784), (1220, 768), (1190, 750)]

    def steps_for(arm="perstep"):
        return [
            f"STEP arm={arm} i={i} t_send={1000 + i * 2000} t_x={1030 + i * 2000} w={w} h={h}"
            for i, (w, h) in enumerate(sizes)
        ]

    good = [good_for(1030 + i * 2000 + 540, s) for i, s in enumerate(sizes)]
    rc, txt = evaluate(steps_for(), good, "perstep")
    if rc != 0 or "MATCHED=3" not in txt:
        fails.append(f"rejected a good 3-step run: {txt}")
    rc, txt = evaluate(steps_for(), [good[0], good[2]], "perstep")
    if rc == 0 or "MISSING=1" not in txt:
        fails.append(f"ACCEPTED a MISSING step: {txt}")
    stale_line = sline(1030 + 2000 + 540, (204, 82, 1250 - 204, 784 - 82), (1220, 768))
    rc, txt = evaluate(steps_for(), [good[0], stale_line, good[2]], "perstep")
    if rc == 0 or "STALE=1" not in txt:
        fails.append(f"ACCEPTED a STALE step: {txt}")
    bad_embed = sline(1030 + 2000 + 540, (204, 82, 1220 - 204, 768 - 82), (1220, 768), embed=(204, 82, 900, 600))
    rc, txt = evaluate(steps_for(), [good[0], bad_embed, good[2]], "perstep")
    if rc == 0 or "FAIL=1" not in txt:
        fails.append(f"ACCEPTED a FAIL line: {txt}")
    burst_steps = ["STEP arm=burst i=0 t_send=1000 t_x=NA w=1100 h=700", "ARM_END arm=burst t_x_final=2000 w=1280 h=800 achieved=yes"]
    rc, txt = evaluate(burst_steps, [good_for(2540, (1280, 800))], "burst")
    if rc != 0 or "LINES_DURING=0" not in txt:
        fails.append(f"rejected a good burst: {txt}")
    rc, txt = evaluate(burst_steps, [], "burst")
    if rc == 0 or "MISSING=1" not in txt:
        fails.append(f"ACCEPTED a burst with no settled line: {txt}")
    ptr = ["STEP arm=pointer i=0 t_send=1000 t_x=NA w=1280 h=800", "ARM_END arm=pointer t_x_final=1500 w=1280 h=800 achieved=no"]
    rc, txt = evaluate(ptr, [], "pointer")
    if rc != 3:
        fails.append(f"did not return 3 for pointer achieved=no: rc={rc}")
    if fails:
        print("SELFTEST FAIL: " + "; ".join(fails))
        return 1
    print("SELFTEST PASS: accepts good perstep/burst; rejects MISSING, STALE, FAIL, empty burst; pointer achieved=no exits 3")
    return 0


def main(argv):
    if "--selftest" in argv:
        return selftest()
    if len(argv) < 4 or "--arm" not in argv:
        print(__doc__)
        return 2
    arm = argv[argv.index("--arm") + 1]
    with open(argv[0], encoding="utf-8", errors="replace") as fh:
        step_lines = fh.read().splitlines()
    with open(argv[1], encoding="utf-8", errors="replace") as fh:
        settled_lines = fh.read().splitlines()
    rc, txt = evaluate(step_lines, settled_lines, arm)
    print(txt)
    return rc


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
