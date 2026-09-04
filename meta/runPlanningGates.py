#!/usr/bin/env python3
"""Discover and run every planning gate under `.planning/`.

Phase 34.2 gap cycle 4, WR-11.

These gates assert that planning documents stay consistent with the code they
describe -- ported-channel tallies, preload-surface coverage, declaration
currency. Six of them existed before this runner and NOT ONE was wired into a
script or a workflow, so they only ever ran in the session that wrote them.
Two had been silently red for weeks by the time this runner first executed
them: a stale `(57 channels)` pin that a later plan moved to 58, and a preload
channel (`steamRemoveAllCopies`) added by a quick task that never reached a
bucket line.

A gate nobody runs is not a gate. That is the whole point of this file.

Discovery is by SUFFIX (`*-gate.py`) rather than a hand-maintained list,
because a hand-maintained list is the same failure mode one level up -- the
seventh gate would be added and forgotten exactly like the first six. Each
gate runs with its own directory as the working directory, since they resolve
their targets relative to themselves.
"""

import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PLANNING_ROOT = REPO_ROOT / ".planning"
GATE_SUFFIX = "-gate.py"

# Anti-vacuity floor. If discovery returns fewer than this, something has gone
# wrong with the glob (a directory rename, a moved .planning tree) and the
# runner would otherwise report a cheerful green while checking nothing. This
# is deliberately a floor, not an exact count: adding an eighth gate must not
# require editing this file, but silently dropping to zero must fail loudly.
#
# 6 -> 7 (quick task 260823-ofm): the seventh gate is the 34.4.1 seam-parity
# sweep, renamed from `seam-parity-sweep.py` so this runner's suffix discovery
# finds it. Raising the floor is the only edit that rename required -- and it
# IS required, because a floor left at 6 would keep reporting green if the new
# gate were later deleted or renamed back out of discovery.
#
# 7 -> 8 (Phase 40 plan 03, D-13/REQ-40-10): the eighth gate is
# `model-a-retirement-gate.py`, sweeping `src/frontend/` for the three
# reintroduced Model A tokens (`<webview>`, `WebviewTag`,
# `webviewPreloadPath`). Leaving the floor at 7 would let this gate be
# deleted later with every remaining gate still reporting green -- exactly
# the property this constant exists to hold.
MINIMUM_EXPECTED_GATES = 8


def discover_gates():
    if not PLANNING_ROOT.is_dir():
        print(
            f"FAIL: {PLANNING_ROOT} does not exist — planning gates cannot be discovered",
            file=sys.stderr,
        )
        sys.exit(1)
    return sorted(PLANNING_ROOT.rglob(f"*{GATE_SUFFIX}"))


def main():
    gates = discover_gates()

    if len(gates) < MINIMUM_EXPECTED_GATES:
        print(
            f"FAIL: discovered only {len(gates)} planning gate(s), expected at least "
            f"{MINIMUM_EXPECTED_GATES}. Either gates were deleted, or the discovery "
            f"glob ('*{GATE_SUFFIX}' under {PLANNING_ROOT}) no longer matches them. "
            f"A runner that finds nothing must fail, not pass.",
            file=sys.stderr,
        )
        sys.exit(1)

    failures = []
    for gate in gates:
        rel = gate.relative_to(REPO_ROOT)
        result = subprocess.run(
            [sys.executable, gate.name],
            cwd=gate.parent,
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            print(f"[PASS] {rel}")
        else:
            print(f"[FAIL] {rel}")
            for stream in (result.stdout, result.stderr):
                for line in stream.splitlines():
                    print(f"       {line}")
            failures.append(rel)

    print(f"\n{len(gates) - len(failures)}/{len(gates)} planning gates passed.")

    if failures:
        print(
            "\nA failing planning gate means a planning document and the code have "
            "drifted apart. Fix whichever one is actually wrong — sometimes it is the "
            "gate's pin, not the document.",
            file=sys.stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
