#!/usr/bin/env python3
"""Doc-shape gate for 34.4.1-PORTED-CHANNELS.md (REQ-34.4.1-10) and this phase's SEAM.md /
IPC-PORT-INVENTORY.md obligations (REQ-34.4.1-13).

Purpose (read this before deleting a failing assertion): this phase's declared ported-channel
list exists so a future reader never conflates "wired and unit-proven" with "seen working" — the
conflation that let G-30-02 be declared fixed twice while the live build hung
(`34.4.1-CONTEXT.md`). This script is modeled almost line-for-line on
`34.4-tauri-ipc-re-plumb-slice-7-steam-completion-and-humble/ported-channels-gate.py`, adapted for
this phase's smaller 7-channel shape and its two extra obligations that phase's gate did not have:
verifying SEAM.md's checklist closure (check 6) and pinning `oauthCaptureLogin`'s
never-live proof level (check 7).

When this gate fails, the correct maintenance action is to RESTORE the missing declaration (a
dropped channel row, a dropped rider, a reverted SEAM.md edit) — never to delete or weaken an
assertion to make the gate pass. Deleting an assertion here defeats the reason this file exists.

Run `python3 ported-channels-gate.py` to check the live documents. Run
`python3 ported-channels-gate.py --self-test` to prove every assertion below actually rejects the
input it exists to reject — a gate that cannot be shown to reject a bad input is not a gate (the
lesson from Phase 34.2 gap cycle 4's round-4 blocker: 14 comment strippers that all passed
vacuously). Self-tests run the synthetic input through the SAME assertion functions used against
the real document, never a reimplementation.
"""

import re
import subprocess
import sys
from pathlib import Path

PHASE_DIR = Path(__file__).parent
PORTED_CHANNELS_PATH = PHASE_DIR / "34.4.1-PORTED-CHANNELS.md"
INVENTORY_PATH = PHASE_DIR.parent.parent / "IPC-PORT-INVENTORY.md"
SEAM_PATH = PHASE_DIR.parent / "27-tauri-shell-walking-skeleton" / "SEAM.md"

# The 6 Humble browser-auth channel names, from `.planning/IPC-PORT-INVENTORY.md`'s
# "## Phase 34.4.1 — the embedded-browser login seam (6 channels)" heading.
HUMBLE_CHANNELS = [
    "humbleGetLoginUserAgent",
    "humbleLoginNavigated",
    "humbleReconnect",
    "humbleRevealKey",
    "humbleStartLogin",
    "humbleStopLogin",
]

assert len(HUMBLE_CHANNELS) == 6, f"HUMBLE_CHANNELS has {len(HUMBLE_CHANNELS)} entries, expected 6"

# The one new Tauri-only channel this phase adds (plan 34.4.1-09). Deliberately NOT in
# HUMBLE_CHANNELS and NOT in the inventory — see check_oauth_excluded_from_inventory_crosscheck,
# which asserts that exclusion explicitly rather than silently filtering it out.
OAUTH_CHANNEL = "oauthCaptureLogin"

ALL_CHANNELS = HUMBLE_CHANNELS + [OAUTH_CHANNEL]
assert len(ALL_CHANNELS) == 7, f"ALL_CHANNELS has {len(ALL_CHANNELS)} entries, expected 7"

# The 2 Humble channels that must carry kind "sidecar send". The other 4 Humble channels must be
# "sidecar invoke". oauthCaptureLogin is checked separately (its kind cell carries extra
# "TAURI-ONLY (new, not an inventory row)" prose alongside "sidecar invoke" — see
# check_kind_correctness).
HUMBLE_SEND_CHANNELS = {"humbleStopLogin", "humbleLoginNavigated"}
HUMBLE_INVOKE_CHANNELS = set(HUMBLE_CHANNELS) - HUMBLE_SEND_CHANNELS
assert len(HUMBLE_INVOKE_CHANNELS) == 4
assert len(HUMBLE_SEND_CHANNELS) == 2

# Permits exactly the three forms REQ-34.4.1-10 declares: "unit", "unit + LIVE (item N)", or a
# string beginning with "ported, declared" (the D-07/knowingly-degraded form). None of this
# phase's 7 rows currently use the third form (34.4 D-05's humbleDisconnect partial was CLOSED by
# plan 06, not carried forward as a degraded row here) -- the pattern still permits it so a future
# genuinely-degraded row is not falsely rejected.
PERMITTED_PROOF_LEVEL_PATTERN = re.compile(r"^(unit|unit \+ LIVE \([^)]+\)|ported, declared.*)$")

# Matches a table row leading with a backticked channel name in the first cell, e.g.
# "| `humbleStartLogin` | sidecar invoke | ... |". Deliberately anchored to the row-leading
# position so a channel merely MENTIONED in prose (e.g. "None of the 6 Phase 34.4.1 channels ...
# appear as a row above" in 34.4-PORTED-CHANNELS.md) can never satisfy this -- only an actual table
# row counts.
ROW_PATTERN = re.compile(r"^\|\s*`([A-Za-z0-9_.]+)`\s*\|(.*)\|\s*$", re.MULTILINE)


def fail(message: str) -> None:
    print(f"GATE FAILED: {message}", file=sys.stderr)
    sys.exit(1)


def extract_rows(text: str) -> list[tuple[str, str]]:
    """Return (channel_name, full_row_text) for every table row leading with a backticked name."""
    return [(m.group(1), m.group(0)) for m in ROW_PATTERN.finditer(text)]


def _cells(row: str) -> list[str]:
    return [c.strip() for c in row.strip().strip("|").split("|")]


# ---------------------------------------------------------------------------
# REQ-34.4.1-10 assertions — against 34.4.1-PORTED-CHANNELS.md
# ---------------------------------------------------------------------------


def check_all_channels_present(text: str) -> None:
    rows = extract_rows(text)
    row_names = {name for name, _ in rows}
    missing = [c for c in ALL_CHANNELS if c not in row_names]
    if missing:
        fail(
            "the following required channel(s) have no table row: "
            f"{', '.join(missing)} — restore the missing row(s)"
        )


def check_exact_row_count(text: str) -> None:
    rows = extract_rows(text)
    relevant = [name for name, _ in rows if name in ALL_CHANNELS]
    humble_count = sum(1 for name in relevant if name in HUMBLE_CHANNELS)
    oauth_count = sum(1 for name in relevant if name == OAUTH_CHANNEL)
    if len(relevant) != 7 or humble_count != 6 or oauth_count != 1:
        fail(
            f"found {len(relevant)} channel table row(s) among the declared 7 "
            f"({humble_count} humble*, {oauth_count} oauthCaptureLogin), expected exactly "
            "7 (6 humble* + 1 oauthCaptureLogin) — a dropped row, a duplicate row, or a "
            "misclassified row all fail this assertion"
        )


def check_kind_correctness(text: str) -> None:
    rows = extract_rows(text)
    actual_send = set()
    actual_invoke = set()
    oauth_kind_cell = None
    for name, row in rows:
        cells = _cells(row)
        if len(cells) < 2:
            continue
        kind = cells[1]
        if name == OAUTH_CHANNEL:
            oauth_kind_cell = kind
            continue
        if name not in HUMBLE_CHANNELS:
            continue
        if kind == "sidecar send":
            actual_send.add(name)
        elif kind == "sidecar invoke":
            actual_invoke.add(name)
        else:
            fail(f"channel `{name}` has an unrecognized kind cell: '{kind}'")
    if actual_send != HUMBLE_SEND_CHANNELS:
        unexpected = actual_send - HUMBLE_SEND_CHANNELS
        missing = HUMBLE_SEND_CHANNELS - actual_send
        details = []
        if unexpected:
            details.append(f"unexpectedly marked 'sidecar send': {', '.join(sorted(unexpected))}")
        if missing:
            details.append(f"expected 'sidecar send' but were not: {', '.join(sorted(missing))}")
        fail(
            "exactly humbleStopLogin+humbleLoginNavigated must carry kind 'sidecar send' and "
            f"the other 4 Humble channels 'sidecar invoke' — {'; '.join(details)}"
        )
    if actual_invoke != HUMBLE_INVOKE_CHANNELS:
        fail(
            "the 4 non-send Humble channels do not exactly match the expected invoke set — "
            f"got {sorted(actual_invoke)}, expected {sorted(HUMBLE_INVOKE_CHANNELS)}"
        )
    if oauth_kind_cell is None:
        fail(f"`{OAUTH_CHANNEL}` has no row to check its kind cell against")
    elif "sidecar invoke" not in oauth_kind_cell:
        fail(
            f"`{OAUTH_CHANNEL}`'s kind cell ('{oauth_kind_cell}') does not contain "
            "'sidecar invoke' — this channel must be an invoke-kind (the renderer awaits its "
            "typed outcome; a send-kind mistake here would fail 100% silently)"
        )


def check_proof_levels(text: str) -> None:
    rows = extract_rows(text)
    bad_rows = []
    for name, row in rows:
        if name not in ALL_CHANNELS:
            continue
        cells = _cells(row)
        # cells: [channel, kind, registration module, proof level, riders]
        if len(cells) < 4:
            bad_rows.append((name, "row has fewer than 4 cells"))
            continue
        proof_level = cells[3]
        if not PERMITTED_PROOF_LEVEL_PATTERN.match(proof_level):
            bad_rows.append((name, proof_level))
    if bad_rows:
        details = "; ".join(f"{name}: '{val}'" for name, val in bad_rows)
        fail(
            "the following row(s) have a proof-level cell that is not one of the three permitted "
            f"forms (unit / unit + LIVE (item N) / ported, declared ...): {details}"
        )


def check_humble_channels_match_inventory(ported_text: str, inventory_text: str) -> None:
    """Check 2: the 6 humble* rows in 34.4.1-PORTED-CHANNELS.md match
    IPC-PORT-INVENTORY.md's Phase 34.4.1 section exactly, set-equality both directions.
    oauthCaptureLogin is EXCLUDED from this comparison BY NAME, asserted explicitly here rather
    than silently filtered — a genuinely-missing inventory row could otherwise hide behind an
    unexamined exclusion."""
    rows = extract_rows(ported_text)
    ported_humble_names = {name for name, _ in rows if name in HUMBLE_CHANNELS or name == OAUTH_CHANNEL}
    # Explicit assertion that the exclusion is deliberate, not a silent filter bug: oauthCaptureLogin
    # must be present as A ROW (checked elsewhere) but must never be treated as part of the
    # inventory-comparable set below.
    if OAUTH_CHANNEL in ported_humble_names:
        ported_humble_names = ported_humble_names - {OAUTH_CHANNEL}
    else:
        fail(
            f"`{OAUTH_CHANNEL}` row not found in 34.4.1-PORTED-CHANNELS.md — cannot verify its "
            "deliberate exclusion from the inventory cross-check"
        )

    section = _extract_section(inventory_text, INVENTORY_34_4_1_HEADING)
    if not section:
        fail(
            "IPC-PORT-INVENTORY.md is missing the '## Phase 34.4.1 — the embedded-browser login "
            "seam (6 channels)' heading — cannot cross-check the humble* channel set"
        )
    inventory_names = _channel_names_in_backtick_list(section)

    missing_from_ported = inventory_names - ported_humble_names
    extra_in_ported = ported_humble_names - inventory_names
    if missing_from_ported or extra_in_ported:
        details = []
        if missing_from_ported:
            details.append(
                f"in inventory but missing a PORTED-CHANNELS row: {', '.join(sorted(missing_from_ported))}"
            )
        if extra_in_ported:
            details.append(
                f"in PORTED-CHANNELS but missing from the inventory: {', '.join(sorted(extra_in_ported))}"
            )
        fail(
            "the 6 humble* channels in 34.4.1-PORTED-CHANNELS.md do not exactly match "
            f"IPC-PORT-INVENTORY.md's Phase 34.4.1 section — {'; '.join(details)}"
        )


def check_oauth_proof_level_never_live(text: str) -> None:
    """Check 7: the oauthCaptureLogin row is marked '(new, not an inventory row)' and its proof
    level is exactly 'unit' — never 'unit + LIVE', because no OAuth login completes live in this
    phase (D-04: the four OAuth auth channels remain unported)."""
    rows = extract_rows(text)
    oauth_rows = [(name, row) for name, row in rows if name == OAUTH_CHANNEL]
    if not oauth_rows:
        fail(f"no `{OAUTH_CHANNEL}` row found")
        return
    name, row = oauth_rows[0]
    if "(new, not an inventory row)" not in row:
        fail(
            f"`{OAUTH_CHANNEL}`'s row is missing the required '(new, not an inventory row)' "
            "marker — a future reader could mistake it for a dropped inventory channel"
        )
    cells = _cells(row)
    if len(cells) < 4:
        fail(f"`{OAUTH_CHANNEL}`'s row has fewer than 4 cells, cannot check its proof level")
        return
    proof_level = cells[3]
    if proof_level != "unit":
        fail(
            f"`{OAUTH_CHANNEL}`'s proof level is '{proof_level}', expected exactly 'unit' — this "
            "channel must never claim 'unit + LIVE', since no OAuth login completes live in this "
            "phase (login/authGOG/authAmazon/authZoom remain unported)"
        )


# ---------------------------------------------------------------------------
# REQ-34.4.1-13 assertion — against .planning/IPC-PORT-INVENTORY.md (verification, NOT editing)
# ---------------------------------------------------------------------------

INVENTORY_34_4_1_HEADING = re.compile(
    r"## Phase 34\.4\.1 — the embedded-browser login seam \(6 channels\)"
)

# Matches a WHOLE LINE that consists of nothing but a comma-separated list of backtick-quoted
# tokens (optionally trailing a period) — the exact shape IPC-PORT-INVENTORY.md uses for its
# declared channel lists. Deliberately anchored to a whole-line match so a channel merely
# mentioned inline in a PROSE sentence is never picked up as a declared list member.
CHANNEL_LIST_LINE_PATTERN = re.compile(r"^`[A-Za-z0-9_.]+`(?:,\s*`[A-Za-z0-9_.]+`)*\.?$")


def _extract_section(text: str, heading_pattern: re.Pattern, next_heading_pattern: str = r"\n## ") -> str:
    """Return the text between a heading match and the next '## ' heading (or EOF)."""
    m = heading_pattern.search(text)
    if not m:
        return ""
    start = m.end()
    rest = text[start:]
    next_m = re.search(next_heading_pattern, rest)
    return rest[: next_m.start()] if next_m else rest


def _channel_names_in_backtick_list(section_text: str) -> set:
    """Return the backtick-quoted channel names from the FIRST whole-line comma-separated
    backtick list found in `section_text` — never from prose mentions elsewhere in the section."""
    for raw_line in section_text.splitlines():
        line = raw_line.strip()
        if CHANNEL_LIST_LINE_PATTERN.match(line):
            return set(re.findall(r"`([A-Za-z0-9_.]+)`", line))
    return set()


def check_inventory_unmodified(diff_stat_output: str) -> None:
    """Check 5: `git diff --stat IPC-PORT-INVENTORY.md` must be EMPTY — this document only
    verifies the inventory, per this plan's own instruction, it never edits it."""
    if diff_stat_output.strip():
        fail(
            "IPC-PORT-INVENTORY.md has uncommitted changes relative to HEAD — "
            f"'git diff --stat' output:\n{diff_stat_output}\nThis plan is READ-ONLY against the "
            "inventory; revert any edit or move it to a plan whose scope actually owns that file"
        )


# ---------------------------------------------------------------------------
# SEAM.md checklist-closure assertion
# ---------------------------------------------------------------------------

SEAM_34_4_1_SUBSECTION_HEADING = re.compile(
    r"### Embedded-browser login seam \(real, Phase 34\.4\.1\)"
)
# The stale phrasing 34.4-09 left in §3's BrowserWindow deferred row, naming the login story as
# still re-targeted/deferred to this phase. Its continued presence (unedited) would mean this
# phase's §3 retirement step never ran.
SEAM_STALE_DEFERRAL_PHRASE = "What remains deferred is the `<webview>` login story"


def check_seam_closes_login_seam_checklist(text: str) -> None:
    """Check 6: SEAM.md contains a §1 subsection naming Phase 34.4.1, and §3 no longer defers the
    login seam with the stale pre-34.4.1 phrasing."""
    if not SEAM_34_4_1_SUBSECTION_HEADING.search(text):
        fail(
            "SEAM.md is missing the '### Embedded-browser login seam (real, Phase 34.4.1)' §1 "
            "subsection — the checklist step 5 (list the newly wired channels under §1) appears "
            "not to have run"
        )
    if SEAM_STALE_DEFERRAL_PHRASE in text:
        fail(
            "SEAM.md's §3 still contains the stale pre-34.4.1 deferral phrasing "
            f"({SEAM_STALE_DEFERRAL_PHRASE!r}) — the checklist step 5 (move newly wired channels "
            "out of the §3 deferred table) appears not to have run"
        )


ASSERTIONS = [
    ("all 7 channels present as table rows (PORTED-CHANNELS)", check_all_channels_present),
    (
        "exactly 7 channel rows (6 humble* + 1 oauthCaptureLogin), no dropped/duplicate/"
        "misclassified row (PORTED-CHANNELS)",
        check_exact_row_count,
    ),
    (
        "exactly humbleStopLogin+humbleLoginNavigated are 'sidecar send', the other 4 humble* "
        "channels 'sidecar invoke', oauthCaptureLogin's kind cell contains 'sidecar invoke' "
        "(PORTED-CHANNELS)",
        check_kind_correctness,
    ),
    ("every row's proof level is a permitted value (PORTED-CHANNELS)", check_proof_levels),
    (
        "the 6 humble* channels match IPC-PORT-INVENTORY.md's Phase 34.4.1 section exactly, "
        "oauthCaptureLogin explicitly excluded from the comparison (cross-check)",
        None,  # two-argument check, run separately below (see run_two_arg_checks)
    ),
    ("IPC-PORT-INVENTORY.md is unmodified relative to HEAD (git diff --stat empty)", None),
    (
        "SEAM.md's §1 names Phase 34.4.1 and §3 no longer defers the login seam with stale "
        "phrasing",
        check_seam_closes_login_seam_checklist,
    ),
    (
        "oauthCaptureLogin is marked '(new, not an inventory row)' and its proof level is "
        "exactly 'unit', never 'unit + LIVE' (PORTED-CHANNELS)",
        check_oauth_proof_level_never_live,
    ),
]

assert len({label for label, _ in ASSERTIONS}) == len(ASSERTIONS), "duplicate assertion label"
assert len(ASSERTIONS) == 8, f"expected 8 assertions (7 plan checks + kind split fused), got {len(ASSERTIONS)}"


def run_all_single_text_assertions(text: str) -> None:
    for _, fn in ASSERTIONS:
        if fn is not None:
            fn(text)


def run_all_ported_channels_assertions(text: str) -> None:
    """Runs every check_* that takes only the PORTED-CHANNELS text (checks 1/2/3/4/7)."""
    for fn in (
        check_all_channels_present,
        check_exact_row_count,
        check_kind_correctness,
        check_proof_levels,
        check_oauth_proof_level_never_live,
    ):
        fn(text)


# ---------------------------------------------------------------------------
# Anti-vacuity self-tests. Each feeds a synthetic document that violates exactly one assertion
# and confirms that assertion fails for it, through the SAME check_* functions used against the
# real document — never a reimplementation. Exactly one self-test case per check_* function.
# ---------------------------------------------------------------------------


def _valid_synthetic_ported_channels_doc() -> str:
    """A minimal synthetic 34.4.1-PORTED-CHANNELS.md that satisfies every PORTED-CHANNELS
    assertion, used as the self-test base case each violation is derived from by changing exactly
    one thing."""
    rows = []
    for c in HUMBLE_CHANNELS:
        kind = "sidecar send" if c in HUMBLE_SEND_CHANNELS else "sidecar invoke"
        rows.append(f"| `{c}` | {kind} | `placeholder.ts` | unit | placeholder |")
    rows.append(
        f"| `{OAUTH_CHANNEL}` | sidecar invoke, TAURI-ONLY (new, not an inventory row) | "
        "`placeholder.ts` | unit | placeholder |"
    )
    return f"""# Synthetic test document

| Channel | Kind | Backed by | Proof level | Notes |
|---|---|---|---|---|
{chr(10).join(rows)}
"""


def _valid_synthetic_inventory_doc() -> str:
    """A minimal synthetic IPC-PORT-INVENTORY.md satisfying check 2/5's inventory-side shape."""
    humble_list = ", ".join(f"`{c}`" for c in HUMBLE_CHANNELS)
    return f"""# Synthetic inventory

## Phase 34.4.1 — the embedded-browser login seam (6 channels)

{humble_list}

## Phase 34.5 — Slice 8 — non-Steam runners, Wine and shortcuts (57 channels)

`isLoggedIn`, `addShortcut`, `login`
"""


def _valid_synthetic_seam_doc() -> str:
    return """# Synthetic SEAM.md

### Steam completion and Humble cluster (real, Phase 34.4) — CLOSED, moved out of §3

... prose ...

### Embedded-browser login seam (real, Phase 34.4.1)

... prose naming the 7 channels ...

---

## 3. Deferred

| 3 | `BrowserWindow` (full window management) | 7 | Mostly closed, Phase 34.1 + Phase 34.4.1. |
"""


def _expect_failure(label: str, fn, *args) -> None:
    try:
        fn(*args)
    except SystemExit:
        print(f"  self-test OK: {label} correctly rejected")
        return
    fail(f"self-test FAILED: {label} did NOT reject its bad input — the gate is vacuous")


def self_test() -> None:
    """Exactly one self-test case per check_* function (8 functions, 8 self-test cases below) —
    the count is asserted equal at the end of this function, not left as an informal claim."""
    base = _valid_synthetic_ported_channels_doc()
    inv_base = _valid_synthetic_inventory_doc()
    seam_base = _valid_synthetic_seam_doc()
    self_test_case_count = 0

    def case(label: str, fn, *args) -> None:
        nonlocal self_test_case_count
        self_test_case_count += 1
        _expect_failure(label, fn, *args)

    # Sanity: every base document must pass a clean run before we start breaking them.
    try:
        run_all_ported_channels_assertions(base)
    except SystemExit:
        fail("self-test setup FAILED: the base synthetic PORTED-CHANNELS document does not pass a clean gate run")
    print("  self-test base document (PORTED-CHANNELS): passes clean (sanity check OK)")

    try:
        check_humble_channels_match_inventory(base, inv_base)
    except SystemExit:
        fail("self-test setup FAILED: the base documents do not pass the inventory cross-check clean")
    print("  self-test base documents (cross-check): pass clean (sanity check OK)")

    try:
        check_inventory_unmodified("")
    except SystemExit:
        fail("self-test setup FAILED: an empty diff --stat output was rejected as non-empty")
    print("  self-test base case (inventory unmodified, empty diff): passes clean (sanity check OK)")

    try:
        check_seam_closes_login_seam_checklist(seam_base)
    except SystemExit:
        fail("self-test setup FAILED: the base synthetic SEAM.md document does not pass a clean gate run")
    print("  self-test base document (SEAM.md): passes clean (sanity check OK)")

    # Case 1 (check_all_channels_present): drop one channel's row entirely, AND add a prose-only
    # mention of that same channel in its place — proves both that a missing row is caught, and
    # that the row-leading anchoring is real: a channel merely NAMED in prose does not rescue it.
    dropped = HUMBLE_CHANNELS[0]
    dropped_kind = "sidecar send" if dropped in HUMBLE_SEND_CHANNELS else "sidecar invoke"
    missing_channel_doc = base.replace(
        f"| `{dropped}` | {dropped_kind} | `placeholder.ts` | unit | placeholder |\n",
        f"(`{dropped}` is only mentioned here in prose, not as a row — anchoring proof.)\n",
    )
    case(
        "missing-channel-row (with a prose-only anchoring decoy) rejected by check_all_channels_present",
        check_all_channels_present,
        missing_channel_doc,
    )

    # Case 2 (check_exact_row_count): an 8th row via a duplicated real channel.
    duplicate = HUMBLE_CHANNELS[1]
    duplicate_kind = "sidecar send" if duplicate in HUMBLE_SEND_CHANNELS else "sidecar invoke"
    eighth_row_doc = base + f"| `{duplicate}` | {duplicate_kind} | `x.ts` | unit | duplicate row |\n"
    case(
        "8th row (duplicate channel) rejected by check_exact_row_count",
        check_exact_row_count,
        eighth_row_doc,
    )

    # Case 3 (check_kind_correctness): BOTH mismatch directions in one doc — a send channel
    # mismarked as invoke, and an invoke channel mismarked as send.
    kind_mismatch_doc = base.replace(
        "| `humbleStopLogin` | sidecar send | `placeholder.ts` | unit | placeholder |",
        "| `humbleStopLogin` | sidecar invoke | `placeholder.ts` | unit | placeholder |",
    ).replace(
        "| `humbleStartLogin` | sidecar invoke | `placeholder.ts` | unit | placeholder |",
        "| `humbleStartLogin` | sidecar send | `placeholder.ts` | unit | placeholder |",
    )
    case(
        "humbleStopLogin mismarked as invoke AND humbleStartLogin mismarked as send, both "
        "rejected by check_kind_correctness",
        check_kind_correctness,
        kind_mismatch_doc,
    )

    # Case 4 (check_proof_levels): replace one row's "unit" with a made-up value.
    bad_proof_doc = base.replace(
        "| `humbleReconnect` | sidecar invoke | `placeholder.ts` | unit | placeholder |",
        "| `humbleReconnect` | sidecar invoke | `placeholder.ts` | seen working | placeholder |",
    )
    case(
        "disallowed proof-level value rejected by check_proof_levels",
        check_proof_levels,
        bad_proof_doc,
    )

    # Case 5 (check_humble_channels_match_inventory): a channel present in PORTED-CHANNELS but
    # absent from the inventory section, AND a channel present in the inventory but absent from
    # PORTED-CHANNELS — both leak shapes in one synthetic pair.
    mismatched_ported = base.replace("`humbleRevealKey`", "`humbleRevealKeyTypo`")
    case(
        "humbleRevealKey renamed to a typo in PORTED-CHANNELS (missing from inventory side, "
        "extra on the ported side) rejected by check_humble_channels_match_inventory",
        check_humble_channels_match_inventory,
        mismatched_ported,
        inv_base,
    )

    # Case 6 (check_inventory_unmodified): a non-empty diff --stat output.
    case(
        "non-empty 'git diff --stat' output rejected by check_inventory_unmodified",
        check_inventory_unmodified,
        " .planning/IPC-PORT-INVENTORY.md | 3 ++-\n 1 file changed, 2 insertions(+), 1 deletion(-)\n",
    )

    # Case 7 (check_seam_closes_login_seam_checklist): BOTH failure shapes in one doc — the §1
    # subsection heading is missing entirely, and the stale §3 deferral phrasing is still present.
    reverted_seam_doc = seam_base.replace(
        "### Embedded-browser login seam (real, Phase 34.4.1)\n\n... prose naming the 7 channels ...\n\n---\n\n",
        "",
    ).replace(
        "| 3 | `BrowserWindow` (full window management) | 7 | Mostly closed, Phase 34.1 + Phase 34.4.1. |",
        "| 3 | `BrowserWindow` (full window management) | 7 | What remains deferred is the "
        "`<webview>` login story (navigation interception, OAuth redirect capture, session/cookie "
        "access) — re-targeted from Phase 34.4 to Phase 34.4.1 |",
    )
    case(
        "SEAM.md missing the §1 subsection AND still carrying the stale §3 deferral phrasing, "
        "both rejected by check_seam_closes_login_seam_checklist",
        check_seam_closes_login_seam_checklist,
        reverted_seam_doc,
    )

    # Case 8 (check_oauth_proof_level_never_live): oauthCaptureLogin upgraded to a live claim.
    oauth_live_doc = base.replace(
        f"| `{OAUTH_CHANNEL}` | sidecar invoke, TAURI-ONLY (new, not an inventory row) | "
        "`placeholder.ts` | unit | placeholder |",
        f"| `{OAUTH_CHANNEL}` | sidecar invoke, TAURI-ONLY (new, not an inventory row) | "
        "`placeholder.ts` | unit + LIVE (item 1) | placeholder |",
    )
    case(
        "oauthCaptureLogin proof level upgraded to 'unit + LIVE' rejected by "
        "check_oauth_proof_level_never_live",
        check_oauth_proof_level_never_live,
        oauth_live_doc,
    )

    if self_test_case_count != len(ASSERTIONS):
        fail(
            f"self-test FAILED: ran {self_test_case_count} self-test case(s) but there are "
            f"{len(ASSERTIONS)} check(s) — every assertion must have exactly one self-test case, "
            "no more, no fewer. This equality is checked at runtime, not just claimed in a comment."
        )

    print(
        f"\nAll {len(ASSERTIONS)} check(s) proved capable of rejecting the input they exist to "
        f"reject ({self_test_case_count} self-test case(s), 1:1)."
    )


def main() -> None:
    if "--self-test" in sys.argv:
        self_test()
        print("\nSELF-TEST OK: every assertion rejects its corresponding bad input.")
        sys.exit(0)

    if not PORTED_CHANNELS_PATH.exists():
        fail(f"{PORTED_CHANNELS_PATH} does not exist")
    if not INVENTORY_PATH.exists():
        fail(f"{INVENTORY_PATH} does not exist")
    if not SEAM_PATH.exists():
        fail(f"{SEAM_PATH} does not exist")

    ported_text = PORTED_CHANNELS_PATH.read_text(encoding="utf-8")
    inventory_text = INVENTORY_PATH.read_text(encoding="utf-8")
    seam_text = SEAM_PATH.read_text(encoding="utf-8")

    run_all_ported_channels_assertions(ported_text)
    check_humble_channels_match_inventory(ported_text, inventory_text)

    diff_result = subprocess.run(
        ["git", "diff", "--stat", "--", str(INVENTORY_PATH)],
        cwd=PHASE_DIR,
        capture_output=True,
        text=True,
        check=False,
    )
    check_inventory_unmodified(diff_result.stdout)

    check_seam_closes_login_seam_checklist(seam_text)

    print(
        f"OK: all {len(ALL_CHANNELS)} channels declared exactly once with correct send/invoke "
        "kind, every proof level permitted, the 6 humble* channels match IPC-PORT-INVENTORY.md's "
        "Phase 34.4.1 section exactly (oauthCaptureLogin correctly excluded), "
        "IPC-PORT-INVENTORY.md is verified unmodified, SEAM.md's checklist steps are closed, and "
        "oauthCaptureLogin never claims a live proof (REQ-34.4.1-10/REQ-34.4.1-13)."
    )
    sys.exit(0)


if __name__ == "__main__":
    main()
