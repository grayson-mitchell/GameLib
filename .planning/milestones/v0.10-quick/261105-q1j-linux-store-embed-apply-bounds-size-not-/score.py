#!/usr/bin/env python3
"""score.py -- mechanical scorer and verdict for quick 261105-q1j (Linux store embed stale size).

  score.py tabulate <evidence_dir>
  score.py verdict <evidence_dir>
  score.py check-source <evidence_dir> <main.rs>
  score.py --selftest

Attempt files are <evidence_dir>/<arm>/<SCENARIO>-<n>.log with arm in {baseline, expA, expB} and
SCENARIO in {R1..R7, REC}. Each file is scored through 260930-blh's check_settled.judge_line:

  FAIL     any settled line fails judge_line (embed != requested, or main != (0,0,vbox)),
           or any line contains the `store_embed(linux): error` marker
  NO-LINE  zero settled lines (and no error marker): a missing measurement, never a pass
  PASS     at least one settled line, every one passing

Verdict rule (computed here, not judged by hand):
  repro      = at least one FAIL among baseline R2/R6/R7 files
  complete   = at least 5 SCORED (non-NO-LINE) files each for R2, R6 and R7
  clean      = no FAIL file anywhere in the arm (NO-LINE files are missing data, not failures;
               the plan re-runs a NO-LINE attempt and keeps both files)
  no repro and baseline not complete        -> INCOMPLETE (exit 3)
  no repro and baseline complete            -> INCONCLUSIVE-NO-REPRO
  repro, expA complete and clean            -> KEEP-A
  repro, else expB complete and clean       -> KEEP-B
  repro, else expB complete                 -> REVERT
  otherwise                                 -> INCOMPLETE (exit 3)
"""
import importlib.util
import os
import re
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
CHECK_SETTLED = os.path.normpath(
    os.path.join(HERE, "..", "260930-blh-build-the-gtk-box-native-linux-layout", "check_settled.py")
)


def _load_judge():
    spec = importlib.util.spec_from_file_location("check_settled", CHECK_SETTLED)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.judge_line


judge_line = _load_judge()

ARMS = ("baseline", "expA", "expB")
FILE_RE = re.compile(r"^(R[1-7]|REC)-(\d+)\.log$")
KEY_SCENARIOS = ("R2", "R6", "R7")
MIN_SCORED = 5
ERROR_MARKER = "store_embed(linux): error"
REQ_RE = re.compile(r"requested=(\S+)")
EMB_RE = re.compile(r"embed=(\S+)")


def classify(lines):
    """Return (verdict, settled_count, last_requested, last_embed) for one attempt's lines."""
    settled = 0
    failed = False
    last_req = last_emb = ""
    for line in lines:
        if ERROR_MARKER in line:
            failed = True
        if "settled requested=" not in line:
            continue
        settled += 1
        parsed, ok, _vbox = judge_line(line)
        if not (parsed and ok):
            failed = True
        m = REQ_RE.search(line)
        if m:
            last_req = m.group(1)
        m = EMB_RE.search(line)
        if m:
            last_emb = m.group(1)
    if failed:
        return ("FAIL", settled, last_req, last_emb)
    if settled == 0:
        return ("NO-LINE", settled, last_req, last_emb)
    return ("PASS", settled, last_req, last_emb)


def scan(evidence_dir):
    """Return a list of (arm, scenario, attempt, settled, req, emb, verdict), sorted."""
    rows = []
    for arm in ARMS:
        d = os.path.join(evidence_dir, arm)
        if not os.path.isdir(d):
            continue
        for name in os.listdir(d):
            m = FILE_RE.match(name)
            if not m:
                continue
            with open(os.path.join(d, name), encoding="utf-8", errors="replace") as fh:
                lines = fh.read().splitlines()
            v, n, req, emb = classify(lines)
            rows.append((arm, m.group(1), int(m.group(2)), n, req, emb, v))
    rows.sort(key=lambda r: (ARMS.index(r[0]), r[1], r[2]))
    return rows


def counts(rows):
    out = {}
    for arm, scen, _n, _s, _r, _e, v in rows:
        c = out.setdefault((arm, scen), {"PASS": 0, "FAIL": 0, "NO-LINE": 0})
        c[v] += 1
    return out


def decide(rows):
    c = counts(rows)

    def get(arm, scen, key):
        return c.get((arm, scen), {}).get(key, 0)

    def scored(arm, scen):
        return get(arm, scen, "PASS") + get(arm, scen, "FAIL")

    def complete(arm):
        return all(scored(arm, s) >= MIN_SCORED for s in KEY_SCENARIOS)

    def clean(arm):
        return not any(v == "FAIL" for a, _s, _n, _l, _r, _e, v in rows if a == arm)

    repro = any(get("baseline", s, "FAIL") > 0 for s in KEY_SCENARIOS)
    if not repro:
        return "INCONCLUSIVE-NO-REPRO" if complete("baseline") else "INCOMPLETE"
    if complete("expA") and clean("expA"):
        return "KEEP-A"
    if complete("expB") and clean("expB"):
        return "KEEP-B"
    if complete("expB"):
        return "REVERT"
    return "INCOMPLETE"


def cmd_tabulate(evidence_dir):
    rows = scan(evidence_dir)
    with open(os.path.join(evidence_dir, "attempts.tsv"), "w", encoding="utf-8") as fh:
        fh.write("arm\tscenario\tattempt\tsettled_lines\tlast_requested\tlast_embed\tverdict\n")
        for r in rows:
            fh.write("\t".join(str(x) for x in r) + "\n")
    c = counts(rows)
    for arm in ARMS:
        scens = sorted(s for (a, s) in c if a == arm)
        for s in scens:
            k = c[(arm, s)]
            print(f"{arm:9s} {s:4s} PASS={k['PASS']} FAIL={k['FAIL']} NO-LINE={k['NO-LINE']}")
    print(f"FILES={len(rows)}")
    return 0 if any(r[6] != "NO-LINE" for r in rows) else 1


def cmd_verdict(evidence_dir):
    v = decide(scan(evidence_dir))
    with open(os.path.join(evidence_dir, "verdict.txt"), "w", encoding="utf-8") as fh:
        fh.write(v + "\n")
    print(v)
    return 3 if v == "INCOMPLETE" else 0


def slice_apply_bounds(src):
    """From the first `pub fn apply_bounds(embed` line to the first line that is exactly four
    spaces and a closing brace. The test module quotes the signature again later, so stop at the
    first match."""
    lines = src.splitlines()
    out = []
    started = False
    for line in lines:
        if not started:
            if "pub fn apply_bounds(embed" in line:
                started = True
                out.append(line)
            continue
        out.append(line)
        if line == "    }":
            break
    return "\n".join(out)


def check_source_text(verdict, src):
    body = slice_apply_bounds(src)
    if not body:
        return ["apply_bounds not found in source"]
    problems = []
    keep = verdict.startswith("KEEP")
    has_embed = "embed_w.queue_resize();" in body
    has_fixed = "fixed.queue_resize();" in body
    if verdict not in ("KEEP-A", "KEEP-B", "REVERT", "INCONCLUSIVE-NO-REPRO"):
        problems.append(f"verdict {verdict!r} is not terminal")
    if has_embed != keep:
        problems.append(f"embed_w.queue_resize() present={has_embed} but verdict={verdict}")
    if has_fixed != (verdict == "KEEP-B"):
        problems.append(f"fixed.queue_resize() present={has_fixed} but verdict={verdict}")
    return problems


def cmd_check_source(evidence_dir, main_rs):
    with open(os.path.join(evidence_dir, "verdict.txt"), encoding="utf-8") as fh:
        verdict = fh.read().strip()
    with open(main_rs, encoding="utf-8") as fh:
        src = fh.read()
    problems = check_source_text(verdict, src)
    if problems:
        print("CHECK-SOURCE FAIL: " + "; ".join(problems))
        return 1
    print(f"CHECK-SOURCE OK: source matches verdict {verdict}")
    return 0


# ---------------------------------------------------------------- selftest

GOOD = (
    "[shell] store_embed(linux): settled requested=307,98,973x702 "
    "embed=307,98,973x702 main=0,0,1280x800 vbox=1280x800"
)
STALE = GOOD.replace("embed=307,98,973x702", "embed=307,98,1024x718")
ERRLINE = "[shell] store_embed(linux): error mount: boom"


_TMP = []


def _mk(root, arm, scen, n, lines):
    d = os.path.join(root, arm)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, f"{scen}-{n}.log"), "w") as fh:
        fh.write("\n".join(lines) + ("\n" if lines else ""))


def _fill(root, arm, scen, kinds):
    """kinds: list of 'P' (pass), 'F' (stale), 'N' (no line), 'E' (good line + error line)."""
    table = {"P": [GOOD], "F": [STALE], "N": [], "E": [GOOD, ERRLINE]}
    for i, k in enumerate(kinds, 1):
        _mk(root, arm, scen, i, table[k])


def _fixture(base, a=None, b=None):
    """base/a/b: dict scenario -> kinds string. Returns the evidence dir."""
    root = tempfile.mkdtemp(prefix="q1j-selftest-")
    _TMP.append(root)
    for arm, spec in (("baseline", base), ("expA", a), ("expB", b)):
        for scen, kinds in (spec or {}).items():
            _fill(root, arm, scen, kinds)
    return root


def selftest():
    fails = []
    all5 = {"R2": "PPPPP", "R6": "PPPPP", "R7": "PPPPP"}
    repro = {"R2": "FP", "R6": "PP", "R7": "PP"}
    rejected = []

    def expect(name, got, want):
        ok = got == want
        print(f"{'PASS' if ok else 'FAIL'}: {name} -> {got} (want {want})")
        if not ok:
            fails.append(name)

    # REJECT cases: the verdict must not be KEEP-*.
    root = _fixture(repro, {**all5, "R6": "PPFPP", "R1": "P"})
    expect("reject KEEP with one failing expA line", decide(scan(root)), "INCOMPLETE")
    root = _fixture(all5, all5)
    expect("reject KEEP with zero baseline failures", decide(scan(root)), "INCONCLUSIVE-NO-REPRO")
    root = _fixture(repro, {**all5, "R6": "PPPP"})
    expect("reject KEEP with only 4 scored expA R6 files", decide(scan(root)), "INCOMPLETE")
    root = _fixture(repro, {**all5, "R6": "PPPPN"})
    expect("reject a NO-LINE file counted toward the 5", decide(scan(root)), "INCOMPLETE")
    root = _fixture(repro, {**all5, "R6": "PPPPE"})
    rows = scan(root)
    expect("an error-marker file is scored FAIL", [r[6] for r in rows if r[1] == "R6"][-1], "FAIL")
    expect("reject KEEP when an error-marker line is present", decide(rows), "INCOMPLETE")
    # ACCEPT cases.
    root = _fixture(repro, {**all5, "R1": "P", "R3": "P", "R4": "P", "R5": "PP", "REC": "P"})
    expect("accept a clean KEEP-A", decide(scan(root)), "KEEP-A")
    root = _fixture(repro, {**all5, "R6": "PPFPP"}, {**all5, "R7": "PPPFP"})
    expect("accept a clean REVERT", decide(scan(root)), "REVERT")
    root = _fixture(repro, {**all5, "R6": "PPFPP"}, all5)
    expect("accept KEEP-B when expA fails and expB is clean", decide(scan(root)), "KEEP-B")
    # NO-LINE is kept alongside its re-run and does not block a clean arm.
    root = _fixture(repro, {**all5, "R6": "PPPPPN"})
    expect("a NO-LINE file beside 5 scored passes does not block KEEP-A", decide(scan(root)), "KEEP-A")

    # check-source on synthetic source.
    body = (
        "    pub fn apply_bounds(embed: &tauri::Webview, rect: Rect) -> Result<(), String> {\n"
        "        embed_w.set_size_request(rect.2, rect.3);\n{extra}"
        "        schedule_settled_log(&embed_w, rect);\n    }\n"
        "    // later: pub fn apply_bounds(embed: quoted\n        embed_w.queue_resize();\n"
        "        fixed.queue_resize();\n"
    )
    src_plain = body.replace("{extra}", "")
    src_a = body.replace("{extra}", "        embed_w.queue_resize();\n")
    src_b = body.replace("{extra}", "        embed_w.queue_resize();\n        fixed.queue_resize();\n")
    expect("check-source: REVERT with no call", bool(check_source_text("REVERT", src_plain)), False)
    expect("check-source: REVERT with a call is rejected", bool(check_source_text("REVERT", src_a)), True)
    expect("check-source: KEEP-A with call", bool(check_source_text("KEEP-A", src_a)), False)
    expect("check-source: KEEP-A with no call is rejected", bool(check_source_text("KEEP-A", src_plain)), True)
    expect("check-source: KEEP-A with fixed call is rejected", bool(check_source_text("KEEP-A", src_b)), True)
    expect("check-source: KEEP-B with both", bool(check_source_text("KEEP-B", src_b)), False)
    expect("check-source: INCOMPLETE is not terminal", bool(check_source_text("INCOMPLETE", src_plain)), True)

    for d in _TMP:
        shutil.rmtree(d, ignore_errors=True)
    if fails:
        print("SELFTEST FAIL: " + "; ".join(fails))
        return 1
    print("SELFTEST PASS")
    return 0


def main(argv):
    if "--selftest" in argv:
        return selftest()
    if len(argv) == 2 and argv[0] == "tabulate":
        return cmd_tabulate(argv[1])
    if len(argv) == 2 and argv[0] == "verdict":
        return cmd_verdict(argv[1])
    if len(argv) == 3 and argv[0] == "check-source":
        return cmd_check_source(argv[1], argv[2])
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
