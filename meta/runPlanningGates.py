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
#
# 8 -> 9 (quick task 260908-gye): the ninth gate is
# `.planning/todos/todo-frontmatter-gate.py`, holding the closed triage
# vocabulary (`severity`/`platform`/`ready`) that every file in
# `.planning/todos/pending/` must carry. Leaving the floor at 8 would let this
# gate be deleted later with every remaining gate still reporting green --
# exactly the property this constant exists to hold. It matters more than usual
# here: the todo corpus is edited by nearly every session, so this gate is a
# more attractive thing to delete than most, and `severity:` was free text for
# months precisely because nothing enforced it.
#
# 9 -> 10 (quick task 260911-ayu): the tenth gate is
# `.planning/planning-frontmatter-gate.py`, which actually parses
# `.planning/STATE.md`'s frontmatter as YAML (required) and
# `.planning/ROADMAP.md`'s (optional). This gate exists because
# `.planning/STATE.md`'s frontmatter sat invalid for weeks -- a double-quoted
# `last_activity` scalar with two unescaped interior quotes that terminated it
# early -- while all nine gates existing at the time reported green, because
# not one of them had ever actually parsed that block. Leaving the floor at 9
# would let this exact gate be deleted later with everything else still
# reporting green, which is precisely the failure mode it was written to
# close: a defect invisible to nine passing gates is exactly the kind of gate
# whose own deletion would be equally invisible.
#
# 10 -> 11 (quick task 260912-csq): the eleventh gate is
# `.planning/uat-visibility-gate.py`, a ratcheting VISIBILITY census over the
# UAT-type documents under `.planning/`. 59 UAT items across 12 files are
# INVISIBLE to `gsd-sdk query audit-uat` -- its item parser cannot engage with
# them at all -- while the tool prints a confident, well-formed audit over the
# items it CAN see and says nothing whatsoever about the ones it cannot. All
# ten gates existing at the time reported green over that, because not one of
# them had ever asked whether an item was reachable by the tool that reads it.
# Leaving the floor at 10 would let this exact gate be deleted later with every
# remaining gate still reporting green, and the argument is sharper here than
# usual: this gate's entire subject is a suppression that TEN GREEN GATES COULD
# NOT SEE, so its own deletion would be equally invisible -- precisely the
# property this constant exists to hold.
#
# 11 -> 12 (quick task 260922-7pv): the twelfth gate is
# `.planning/planning-envelope-tag-gate.py`, holding a recurring authoring
# artifact -- an agent's own tool-call envelope leaking a raw closing tag
# (`content` or `invoke`) as the trailing line of a file it was writing. 33
# distinct commits across 78 days introduced it into 43 git-tracked
# `.planning/**/*.md` files, and all eleven gates existing at the time reported
# green the whole time, because none of them ever looked at a file's trailing
# lines for this shape. The gate's hardest job is NOT convicting the ~800
# files that legitimately end in a paired `</output>` tag -- a gate that
# convicted those would be deleted within the day. Leaving the floor at 11
# would let this exact gate be deleted later with every remaining gate still
# reporting green, exactly the property this constant exists to hold.
#
# 12 -> 13 (quick task 260924-vku): the thirteenth gate is
# `.planning/state-sdk-field-anchor-gate.py`, holding the invariant that every
# `gsd-sdk`-matchable field literal (Phase/Plan/Status/Last activity/Progress/
# Last session/Stopped at/Resume file, plus every non-canonical literal the SDK
# reads or writes) matches AT MOST ONCE in STATE.md's body, anchored inside the
# section the SDK's own regex computes. `gsd-sdk query state.*` mutation verbs
# (`sdk/src/query/state-document.ts:12,22`) match a bold `**Field:**` ANYWHERE
# in the body, case-insensitive, first hit -- falling back to the first
# line-start `Field:` anywhere -- and corrupted archived STATE.md history on at
# least three separately-discovered occasions (quick-260816-qcn's
# `state.add-decision`, Phase 34.6-01's hand-apply workaround, Phase 46-02's
# `state.advance-plan`/`state.record-session`) while every planning gate
# existing at the time stayed green, because not one of them had ever counted
# how many times a field literal appeared in the body. Leaving the floor at 12
# would let this exact gate be deleted later with every remaining gate still
# reporting green -- exactly the property this constant exists to hold.
#
# 13 -> 12 (quick task 260926-kkt): the FIRST LOWERING in this history, and it is a deliberate
# retirement, not convenience. The retired gate was `.planning/uat-visibility-gate.py`, the
# eleventh gate (see the `10 -> 11` entry above). It copied `get-shit-done-cc` 1.42.3's
# `parseUatItems` regex verbatim and ledgered UAT items that were invisible to THAT parser. The
# machine has since moved to `@opengsd/gsd-core` 1.14.0, whose rewritten parser
# (`parseUatItemsWithStats`) reads `expected: |` block scalars and reports what it still cannot
# read itself, via `parse_gap_files`. Measured the day of retirement: 418 items across 56 files
# under gsd-core, against 42 across 13 under 1.42.3. The gate's census was measuring a parser
# nobody runs. Leaving the floor at 13 over a deliberately deleted gate would keep this runner red
# forever -- exactly the kind of red that teaches people to ignore it. Lowering by exactly one, to
# the discovered count, keeps the floor as tight as every entry above it: an accidental deletion
# of any of the twelve remaining gates still turns the runner red.
MINIMUM_EXPECTED_GATES = 12


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
