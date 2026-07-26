#!/usr/bin/env python3
"""Doc-shape gate for 34.4-PORTED-CHANNELS.md (REQ-34.4-14) and IPC-PORT-INVENTORY.md's
scope-surgery artifacts (REQ-34.4-16).

Purpose (read this before deleting a failing assertion): this phase's declared ported-channel
list exists because "wired and unit-proven" was once conflated with "seen working" — the
conflation that let G-30-02 be declared fixed twice while the live build hung (see
`34.4-CONTEXT.md`). This script turns every honesty requirement the artifact owes into a non-zero
exit instead of leaving it as something only a human reviewer might notice missing.

This phase has no gap cycle (mirroring 34.3's `ported-channels-gate.py`, which this file's
structure is modeled on almost line for line). Do NOT copy 34.2's gap-cycle-numbered
constants/sections — there is nothing here to number yet. If a future gap cycle runs against this
phase, the correct maintenance action at that point is to add a new, separate section (mirroring
34.2's own per-cycle pattern), never to retrofit gap-cycle scaffolding onto this file preemptively.

When this gate fails, the correct maintenance action is to RESTORE the missing declaration (a
dropped channel row, a dropped rider) or to EXTEND `CHANNELS`/`REQUIRED_RIDER_TOKENS` if the
underlying fact genuinely changed — never to delete or weaken an assertion to make the gate pass.
Deleting an assertion here defeats the reason this file exists: a denial-of-service against this
document's own honesty over time, the same failure class 34.2's `currency-gate.py` was built to
stop. If a rider genuinely no longer needs tracking, remove its token from
`REQUIRED_RIDER_TOKENS` in the SAME commit that also removes the prose discussing it, so the
token list and the prose can never quietly drift apart.

**This phase adds a second concern 34.3's gate did not have (REQ-34.4-16): verifying, not
editing, `.planning/IPC-PORT-INVENTORY.md`'s 31/6/57 scope-surgery split.** Those assertions read
the inventory directly and must FAIL if a future edit silently reverts the split back to 38/56 —
that is the entire point of REQ-34.4-16 being a gate rather than an editing task. This script
makes NO edit to `IPC-PORT-INVENTORY.md` or `ROADMAP.md`; it only reads them.

Run `python3 ported-channels-gate.py` to check the live documents. Run
`python3 ported-channels-gate.py --self-test` to prove every assertion below actually rejects the
input it exists to reject — a gate that cannot be shown to reject a bad input is not a gate (the
lesson from Phase 34.2 gap cycle 4's round-4 blocker: 14 comment strippers that all passed
vacuously). Self-tests run the synthetic input through the SAME assertion functions used against
the real document, never a reimplementation.
"""

import re
import sys
from pathlib import Path

PHASE_DIR = Path(__file__).parent
PORTED_CHANNELS_PATH = PHASE_DIR / "34.4-PORTED-CHANNELS.md"
INVENTORY_PATH = PHASE_DIR.parent.parent / "IPC-PORT-INVENTORY.md"

# The 31 channel names from `.planning/IPC-PORT-INVENTORY.md`'s
# "## Phase 34.4 — Slice 7 — Steam completion and Humble (31 channels)" heading.
CHANNELS = [
    "getPrivateBranchPassword",
    "getSteamInstallSize",
    "getSteamSyncedAt",
    "getSteamUserInfo",
    "humbleCheckHealth",
    "humbleClearOwnershipOverride",
    "humbleDisconnect",
    "humbleGetClaimAnnotations",
    "humbleGetGiftedAt",
    "humbleGetKeys",
    "humbleGetOwnershipOverrides",
    "humbleGetRevealedKeyValue",
    "humbleGetSyncState",
    "humbleGetUserInfo",
    "humbleMarkRedeemed",
    "humbleRecordGiftLinkOpened",
    "humbleRunValidation",
    "humbleSetOwnershipOverride",
    "humbleSync",
    "humbleUndoRedeemed",
    "isSteamBottleProvisioned",
    "logoutSteam",
    "redeemSteamKey",
    "setPrivateBranchPassword",
    "steamBottleProvision",
    "steamBottleStatus",
    "steamClientSetupRecheck",
    "steamClientSetupStart",
    "steamPollCredential",
    "steamStartCredentials",
    "steamSubmitGuard",
]

assert len(CHANNELS) == 31, f"CHANNELS constant has {len(CHANNELS)} entries, expected 31"

# The 6 channels moved to the newly-inserted Phase 34.4.1 (D-01/D-02). They must NEVER appear as
# a row-leading channel in 34.4-PORTED-CHANNELS.md — only in prose explaining the split.
PHASE_34_4_1_CHANNELS = [
    "humbleGetLoginUserAgent",
    "humbleLoginNavigated",
    "humbleReconnect",
    "humbleRevealKey",
    "humbleStartLogin",
    "humbleStopLogin",
]

# `isLoggedIn` moved to Phase 34.5 (D-03) — same negative-scope requirement.
NEGATIVE_SCOPE_CHANNELS = PHASE_34_4_1_CHANNELS + ["isLoggedIn"]

# The two channels that must carry kind "sidecar send". Every other of the 31 must be
# "sidecar invoke". This is the assertion that pins the corrected `humbleRecordGiftLinkOpened`
# classification (it must NOT appear in this set).
SEND_CHANNELS = {"logoutSteam", "humbleDisconnect"}

# Every rider token below must appear somewhere in 34.4-PORTED-CHANNELS.md. Extend this list
# (never shrink it without also removing the prose it pins) if a future edit adds a new accepted
# risk or framing correction this document owes.
REQUIRED_RIDER_TOKENS = [
    "never live-redeemed",  # D-08 redeemSteamKey unit-only declaration
    "never live-provisioned",  # D-08 steamBottleProvision unit-only declaration
    "Declared partial (D-05)",  # humbleDisconnect's D-05 partial
    "MUST be revisited",  # humbleDisconnect's Phase 34.4.1 revisit obligation
    "are GOG, not Steam",  # the GOG classification correction, precise phrasing pinned below
    "is a `handle`, not a `send`",  # humbleRecordGiftLinkOpened's corrected kind
    "isPackagedSidecar()",  # humbleRunValidation's resolved packaged-guard decision
    "reveal itself is deferred",  # Claim Wizard's reveal-deferred state
    "wired and unit-proven",  # the honesty rider, half 1
    "seen working",  # the honesty rider, half 2
    "humble/userAgent.ts",  # the unpredicted 4th reach-ledger baseline entry (Framing correction 3)
]

PERMITTED_PROOF_LEVEL_PATTERN = re.compile(r"^(unit|unit \+ LIVE \([^)]+\)|unit only, declared)$")

# Matches a table row leading with a backticked channel name in the first cell, e.g.
# "| `steamStartCredentials` | sidecar invoke | ... |". Deliberately anchored to the row-leading
# position so a channel merely MENTIONED in prose (e.g. "the corrected `humbleRecordGiftLinkOpened`
# kind") can never satisfy this — only an actual table row counts. This anchoring matters in BOTH
# directions for this phase: it must catch every one of the 31 required rows, and it must NOT be
# fooled by a Phase 34.4.1/34.5 channel name merely mentioned in the scope-surgery prose.
ROW_PATTERN = re.compile(r"^\|\s*`([A-Za-z0-9_.]+)`\s*\|(.*)\|\s*$", re.MULTILINE)


def fail(message: str) -> None:
    print(f"GATE FAILED: {message}", file=sys.stderr)
    sys.exit(1)


def extract_rows(text: str) -> list[tuple[str, str]]:
    """Return (channel_name, full_row_text) for every table row leading with a backticked name."""
    return [(m.group(1), m.group(0)) for m in ROW_PATTERN.finditer(text)]


# ---------------------------------------------------------------------------
# REQ-34.4-14 assertions — against 34.4-PORTED-CHANNELS.md
# ---------------------------------------------------------------------------


def check_all_channels_present(text: str) -> None:
    rows = extract_rows(text)
    row_names = {name for name, _ in rows}
    missing = [c for c in CHANNELS if c not in row_names]
    if missing:
        fail(
            "the following required channel(s) have no table row: "
            f"{', '.join(missing)} — restore the missing row(s)"
        )


def check_exact_row_count(text: str) -> None:
    rows = extract_rows(text)
    # Only count rows whose channel name is one of the declared 31 — keeps the count meaningful
    # even if the document's prose happens to contain an unrelated backticked-name table elsewhere.
    relevant = [name for name, _ in rows if name in CHANNELS]
    if len(relevant) != 31:
        fail(
            f"found {len(relevant)} channel table row(s) among the declared 31, expected exactly "
            "31 — a 32nd row or a dropped row both fail this assertion"
        )


def check_negative_scope(text: str) -> None:
    rows = extract_rows(text)
    row_names = {name for name, _ in rows}
    leaked = [c for c in NEGATIVE_SCOPE_CHANNELS if c in row_names]
    if leaked:
        fail(
            "the following out-of-scope channel(s) appear as a row-leading channel: "
            f"{', '.join(leaked)} — these belong to Phase 34.4.1 (browser-auth cluster) or "
            "Phase 34.5 (isLoggedIn) and must only appear in prose, never as a declared row of "
            "this slice's 31"
        )


def check_send_kind_correctness(text: str) -> None:
    rows = extract_rows(text)
    actual_send = set()
    for name, row in rows:
        if name not in CHANNELS:
            continue
        cells = [c.strip() for c in row.strip().strip("|").split("|")]
        if len(cells) < 2:
            continue
        kind = cells[1]
        if kind == "sidecar send":
            actual_send.add(name)
        elif kind != "sidecar invoke":
            fail(f"channel `{name}` has an unrecognized kind cell: '{kind}'")
    if actual_send != SEND_CHANNELS:
        unexpected = actual_send - SEND_CHANNELS
        missing = SEND_CHANNELS - actual_send
        details = []
        if unexpected:
            details.append(f"unexpectedly marked 'sidecar send': {', '.join(sorted(unexpected))}")
        if missing:
            details.append(f"expected 'sidecar send' but were not: {', '.join(sorted(missing))}")
        fail(
            "exactly two channels (logoutSteam, humbleDisconnect) must carry kind 'sidecar send' "
            f"and all 29 others 'sidecar invoke' — {'; '.join(details)}. This is the assertion "
            "that pins the corrected humbleRecordGiftLinkOpened classification (it must be "
            "'sidecar invoke', not 'sidecar send')"
        )


def check_rider_tokens(text: str) -> None:
    missing = [tok for tok in REQUIRED_RIDER_TOKENS if tok not in text]
    if missing:
        fail(
            "the document is missing required rider token(s): "
            f"{', '.join(missing)} — restore the missing declaration, or if the underlying fact "
            "genuinely no longer applies, remove the token from REQUIRED_RIDER_TOKENS in the "
            "SAME commit that removes the prose discussing it"
        )


def check_proof_levels(text: str) -> None:
    rows = extract_rows(text)
    bad_rows = []
    for name, row in rows:
        if name not in CHANNELS:
            continue
        cells = [c.strip() for c in row.strip().strip("|").split("|")]
        # cells: [channel, kind, backed-by, proof-level, notes]
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
            f"values (unit / unit + LIVE (...) / unit only, declared): {details}"
        )


# ---------------------------------------------------------------------------
# REQ-34.4-16 assertions — against .planning/IPC-PORT-INVENTORY.md (verification, NOT editing)
# ---------------------------------------------------------------------------

INVENTORY_SLICE7_HEADING = re.compile(
    r"## Phase 34\.4 — Slice 7 — Steam completion and Humble \(31 channels\)"
)
INVENTORY_34_4_1_HEADING = re.compile(r"## Phase 34\.4\.1 — the embedded-browser login seam \(6 channels\)")
INVENTORY_SLICE8_HEADING = re.compile(
    r"## Phase 34\.5 — Slice 8 — non-Steam runners, Wine and shortcuts \(57 channels\)"
)


def _extract_section(text: str, heading_pattern: re.Pattern, next_heading_pattern: str = r"\n## ") -> str:
    """Return the text between a heading match and the next '## ' heading (or EOF)."""
    m = heading_pattern.search(text)
    if not m:
        return ""
    start = m.end()
    rest = text[start:]
    next_m = re.search(next_heading_pattern, rest)
    return rest[: next_m.start()] if next_m else rest


# Matches a WHOLE LINE that consists of nothing but a comma-separated list of backtick-quoted
# tokens (optionally trailing a period) — the exact shape IPC-PORT-INVENTORY.md uses for its
# declared channel lists (e.g. "`getPrivateBranchPassword`, `getSteamInstallSize`, ...").
# Deliberately anchored to a whole-line match so a channel merely mentioned inline in a PROSE
# sentence (e.g. "`isLoggedIn` moved to Phase 34.5...") is never picked up as a declared list
# member — only the dedicated list line counts. This is the inventory-side analogue of
# ROW_PATTERN's row-leading anchoring for 34.4-PORTED-CHANNELS.md.
CHANNEL_LIST_LINE_PATTERN = re.compile(r"^`[A-Za-z0-9_.]+`(?:,\s*`[A-Za-z0-9_.]+`)*\.?$")


def _channel_names_in_backtick_list(section_text: str) -> set:
    """Return the backtick-quoted channel names from the FIRST whole-line comma-separated
    backtick list found in `section_text` — never from prose mentions elsewhere in the section.
    Returns an empty set if no such dedicated list line exists."""
    for raw_line in section_text.splitlines():
        line = raw_line.strip()
        if CHANNEL_LIST_LINE_PATTERN.match(line):
            return set(re.findall(r"`([A-Za-z0-9_.]+)`", line))
    return set()


def check_inventory_slice7_intact(text: str) -> None:
    if not INVENTORY_SLICE7_HEADING.search(text):
        fail(
            "IPC-PORT-INVENTORY.md is missing the '## Phase 34.4 — Slice 7 — Steam completion "
            "and Humble (31 channels)' heading — the D-01/D-03 scope-surgery split appears to "
            "have been reverted"
        )
    section = _extract_section(text, INVENTORY_SLICE7_HEADING)
    names = _channel_names_in_backtick_list(section)
    missing = [c for c in CHANNELS if c not in names]
    extra_scope = [c for c in NEGATIVE_SCOPE_CHANNELS if c in names]
    if missing:
        fail(
            "IPC-PORT-INVENTORY.md's slice-7 section is missing channel(s): "
            f"{', '.join(missing)} — the 31-channel list appears to have been edited"
        )
    if extra_scope:
        fail(
            "IPC-PORT-INVENTORY.md's slice-7 section contains out-of-scope channel(s) that "
            f"should have moved to Phase 34.4.1/34.5: {', '.join(extra_scope)} — the D-01/D-02/"
            "D-03 split appears to have been reverted"
        )


def check_inventory_34_4_1_intact(text: str) -> None:
    if not INVENTORY_34_4_1_HEADING.search(text):
        fail(
            "IPC-PORT-INVENTORY.md is missing the '## Phase 34.4.1 — the embedded-browser login "
            "seam (6 channels)' heading — D-01's new phase insertion appears to have been reverted"
        )
    section = _extract_section(text, INVENTORY_34_4_1_HEADING)
    names = _channel_names_in_backtick_list(section)
    missing = [c for c in PHASE_34_4_1_CHANNELS if c not in names]
    if missing:
        fail(
            "IPC-PORT-INVENTORY.md's Phase 34.4.1 section is missing channel(s): "
            f"{', '.join(missing)} — the 6-channel browser-auth cluster appears incomplete"
        )
    unexpected = [n for n in names if n not in PHASE_34_4_1_CHANNELS]
    if unexpected:
        fail(
            "IPC-PORT-INVENTORY.md's Phase 34.4.1 section contains unexpected channel(s): "
            f"{', '.join(unexpected)} — expected exactly the 6 browser-auth channels"
        )


def check_inventory_slice8_intact(text: str) -> None:
    if not INVENTORY_SLICE8_HEADING.search(text):
        fail(
            "IPC-PORT-INVENTORY.md is missing the '## Phase 34.5 — Slice 8 — non-Steam runners, "
            "Wine and shortcuts (57 channels)' heading — D-03's isLoggedIn reassignment (56->57) "
            "appears to have been reverted"
        )
    section = _extract_section(text, INVENTORY_SLICE8_HEADING)
    names = _channel_names_in_backtick_list(section)
    if "isLoggedIn" not in names:
        fail(
            "IPC-PORT-INVENTORY.md's Phase 34.5 section does not contain `isLoggedIn` — D-03's "
            "reassignment (isLoggedIn moved here from slice 7) appears to have been reverted"
        )


ASSERTIONS = [
    ("all 31 channels present as table rows (PORTED-CHANNELS)", check_all_channels_present),
    ("exactly 31 channel rows, no 32nd, no dropped row (PORTED-CHANNELS)", check_exact_row_count),
    (
        "none of the 6 Phase 34.4.1 channels nor isLoggedIn appear as a row (PORTED-CHANNELS)",
        check_negative_scope,
    ),
    (
        "exactly logoutSteam+humbleDisconnect are 'sidecar send', all others 'sidecar invoke' "
        "(PORTED-CHANNELS)",
        check_send_kind_correctness,
    ),
    ("every required rider token present (PORTED-CHANNELS)", check_rider_tokens),
    ("every row's proof level is a permitted value (PORTED-CHANNELS)", check_proof_levels),
    ("IPC-PORT-INVENTORY.md's slice-7 31-channel list is intact", check_inventory_slice7_intact),
    ("IPC-PORT-INVENTORY.md's Phase 34.4.1 6-channel list is intact", check_inventory_34_4_1_intact),
    ("IPC-PORT-INVENTORY.md's slice-8 57-channel list still contains isLoggedIn", check_inventory_slice8_intact),
]

assert len({label for label, _ in ASSERTIONS}) == len(ASSERTIONS), "duplicate assertion label"


def run_all_ported_channels_assertions(text: str) -> None:
    for _, fn in ASSERTIONS:
        if fn in (check_inventory_slice7_intact, check_inventory_34_4_1_intact, check_inventory_slice8_intact):
            continue
        fn(text)


def run_all_inventory_assertions(text: str) -> None:
    for _, fn in ASSERTIONS:
        if fn in (check_inventory_slice7_intact, check_inventory_34_4_1_intact, check_inventory_slice8_intact):
            fn(text)


# ---------------------------------------------------------------------------
# Anti-vacuity self-tests. Each feeds a synthetic document that violates exactly one assertion
# and confirms that assertion fails for it, through the SAME check_* functions used against the
# real document — never a reimplementation.
# ---------------------------------------------------------------------------


def _valid_synthetic_ported_channels_doc() -> str:
    """A minimal synthetic 34.4-PORTED-CHANNELS.md that satisfies every PORTED-CHANNELS
    assertion, used as the self-test base case each violation is derived from by changing exactly
    one thing."""
    rows = []
    for c in CHANNELS:
        kind = "sidecar send" if c in SEND_CHANNELS else "sidecar invoke"
        rows.append(f"| `{c}` | {kind} | `placeholder.ts` | unit | placeholder |")
    riders = "\n".join(REQUIRED_RIDER_TOKENS)
    negative_scope_prose = (
        "None of the six Phase 34.4.1 channels ("
        + ", ".join(f"`{c}`" for c in PHASE_34_4_1_CHANNELS)
        + ") nor `isLoggedIn` appear as a row above — mentioned only in this prose sentence."
    )
    return f"""# Synthetic test document

{riders}

{negative_scope_prose}

| Channel | Kind | Backed by | Proof level | Notes |
|---|---|---|---|---|
{chr(10).join(rows)}
"""


def _valid_synthetic_inventory_doc() -> str:
    """A minimal synthetic IPC-PORT-INVENTORY.md satisfying the REQ-34.4-16 assertions."""
    slice7_list = ", ".join(f"`{c}`" for c in CHANNELS)
    p344_1_list = ", ".join(f"`{c}`" for c in PHASE_34_4_1_CHANNELS)
    return f"""# Synthetic inventory

## Phase 34.4 — Slice 7 — Steam completion and Humble (31 channels)

{slice7_list}

## Phase 34.4.1 — the embedded-browser login seam (6 channels)

{p344_1_list}

## Phase 34.5 — Slice 8 — non-Steam runners, Wine and shortcuts (57 channels)

`isLoggedIn`, `addShortcut`, `login`
"""


def _synthetic_38_channel_inventory_doc() -> str:
    """A synthetic inventory reverted to the pre-D-01/D-02/D-03 38/0/56 split — proves assertions
    7-9 fail if someone later 'helpfully' reverts the scope surgery."""
    reverted_slice7 = ", ".join(f"`{c}`" for c in CHANNELS + PHASE_34_4_1_CHANNELS + ["isLoggedIn"])
    return f"""# Synthetic reverted inventory

## Phase 34.4 — Slice 7 — Steam completion and Humble (31 channels)

{reverted_slice7}

## Phase 34.5 — Slice 8 — non-Steam runners, Wine and shortcuts (57 channels)

`addShortcut`, `login`
"""


def _expect_failure(label: str, fn, text: str) -> None:
    try:
        fn(text)
    except SystemExit:
        print(f"  self-test OK: {label} correctly rejected")
        return
    fail(f"self-test FAILED: {label} did NOT reject its bad input — the gate is vacuous")


def self_test() -> None:
    """Exactly one self-test case per check_* function (9 check_* functions, 9 self-test cases
    below) — the count is asserted equal at the end of this function, not left as an informal
    claim. Where a single check_* function guards more than one violation shape (e.g. a kind
    mismatch can run in either direction, a negative-scope leak can be either deferred cluster),
    both shapes are folded into ONE synthetic document so the case count stays 1:1 with the
    function count while still proving every shape rejects."""
    base = _valid_synthetic_ported_channels_doc()
    inv_base = _valid_synthetic_inventory_doc()
    self_test_case_count = 0

    def case(label: str, fn, text: str) -> None:
        nonlocal self_test_case_count
        self_test_case_count += 1
        _expect_failure(label, fn, text)

    # Sanity: both base documents must pass every relevant assertion before we start breaking them.
    try:
        run_all_ported_channels_assertions(base)
    except SystemExit:
        fail("self-test setup FAILED: the base synthetic PORTED-CHANNELS document does not pass a clean gate run")
    print("  self-test base document (PORTED-CHANNELS): passes clean (sanity check OK)")

    try:
        run_all_inventory_assertions(inv_base)
    except SystemExit:
        fail("self-test setup FAILED: the base synthetic inventory document does not pass a clean gate run")
    print("  self-test base document (inventory): passes clean (sanity check OK)")

    # Case 1 (check_all_channels_present): drop one channel's row entirely, AND add a prose-only
    # mention of that same channel in its place — proves both that a missing row is caught, and
    # that the row-leading anchoring is real: a channel merely NAMED in prose does not rescue it.
    dropped = CHANNELS[0]
    dropped_kind = "sidecar send" if dropped in SEND_CHANNELS else "sidecar invoke"
    missing_channel_doc = base.replace(
        f"| `{dropped}` | {dropped_kind} | `placeholder.ts` | unit | placeholder |\n",
        f"(`{dropped}` is only mentioned here in prose, not as a row — anchoring proof.)\n",
    )
    case(
        "missing-channel-row (with a prose-only anchoring decoy) rejected by check_all_channels_present",
        check_all_channels_present,
        missing_channel_doc,
    )

    # Case 2 (check_exact_row_count): a 32nd row via a duplicated real channel.
    duplicate = CHANNELS[1]
    duplicate_kind = "sidecar send" if duplicate in SEND_CHANNELS else "sidecar invoke"
    thirty_second_row_doc = base + f"| `{duplicate}` | {duplicate_kind} | `x.ts` | unit | duplicate row |\n"
    case(
        "32nd row (duplicate channel) rejected by check_exact_row_count",
        check_exact_row_count,
        thirty_second_row_doc,
    )

    # Case 3 (check_negative_scope): BOTH leak shapes in one doc — a Phase 34.4.1 channel
    # (humbleRevealKey) AND isLoggedIn (Phase 34.5) each appear as a row-leading channel.
    leaked_doc = (
        base
        + "| `humbleRevealKey` | sidecar invoke | `x.ts` | unit | should not be a row |\n"
        + "| `isLoggedIn` | sidecar invoke | `x.ts` | unit | should not be a row |\n"
    )
    case(
        "Phase 34.4.1 channel AND isLoggedIn row-leading leaks both rejected by check_negative_scope",
        check_negative_scope,
        leaked_doc,
    )

    # Case 4 (check_send_kind_correctness): BOTH mismatch directions in one doc —
    # humbleRecordGiftLinkOpened (the historical misclassification this phase corrected)
    # mismarked as 'sidecar send', and logoutSteam mismarked as 'sidecar invoke'.
    kind_mismatch_doc = base.replace(
        "| `humbleRecordGiftLinkOpened` | sidecar invoke | `placeholder.ts` | unit | placeholder |",
        "| `humbleRecordGiftLinkOpened` | sidecar send | `placeholder.ts` | unit | placeholder |",
    ).replace(
        "| `logoutSteam` | sidecar send | `placeholder.ts` | unit | placeholder |",
        "| `logoutSteam` | sidecar invoke | `placeholder.ts` | unit | placeholder |",
    )
    case(
        "humbleRecordGiftLinkOpened mismarked as send AND logoutSteam mismarked as invoke, "
        "both rejected by check_send_kind_correctness",
        check_send_kind_correctness,
        kind_mismatch_doc,
    )

    # Case 5 (check_rider_tokens): strip one required token out of the document.
    victim_token = REQUIRED_RIDER_TOKENS[0]
    missing_rider_doc = base.replace(victim_token, "")
    case(
        f"missing rider token ({victim_token!r}) rejected by check_rider_tokens",
        check_rider_tokens,
        missing_rider_doc,
    )

    # Case 6 (check_proof_levels): replace one row's "unit" with a made-up value.
    victim_channel = CHANNELS[2]
    victim_kind = "sidecar send" if victim_channel in SEND_CHANNELS else "sidecar invoke"
    bad_proof_doc = base.replace(
        f"| `{victim_channel}` | {victim_kind} | `placeholder.ts` | unit | placeholder |",
        f"| `{victim_channel}` | {victim_kind} | `placeholder.ts` | seen working | placeholder |",
    )
    case(
        "disallowed proof-level value rejected by check_proof_levels",
        check_proof_levels,
        bad_proof_doc,
    )

    # Case 7 (check_inventory_slice7_intact): the full reverted 38-channel inventory — the 6
    # Phase 34.4.1 channels and isLoggedIn are bundled back into the slice-7 list (the
    # pre-D-01/D-02/D-03 shape) — proves the extra-out-of-scope-channel branch rejects.
    reverted_doc = _synthetic_38_channel_inventory_doc()
    case(
        "reverted inventory (Phase 34.4.1 + isLoggedIn channels folded back into slice-7) "
        "rejected by check_inventory_slice7_intact",
        check_inventory_slice7_intact,
        reverted_doc,
    )

    # Case 8 (check_inventory_34_4_1_intact): the Phase 34.4.1 heading is missing entirely
    # (reverted new-phase insertion) — the same reverted_doc naturally lacks it.
    case(
        "reverted inventory missing the Phase 34.4.1 heading rejected by check_inventory_34_4_1_intact",
        check_inventory_34_4_1_intact,
        reverted_doc,
    )

    # Case 9 (check_inventory_slice8_intact): slice-8 does not contain isLoggedIn in the same
    # reverted document (isLoggedIn never left slice-7 in this synthetic revert).
    case(
        "reverted inventory slice-8 missing isLoggedIn rejected by check_inventory_slice8_intact",
        check_inventory_slice8_intact,
        reverted_doc,
    )

    if self_test_case_count != len(ASSERTIONS):
        fail(
            f"self-test FAILED: ran {self_test_case_count} self-test case(s) but there are "
            f"{len(ASSERTIONS)} check_* function(s) — every assertion must have exactly one "
            "self-test case, no more, no fewer. This equality is checked at runtime, not just "
            "claimed in a comment."
        )

    print(
        f"\nAll {len(ASSERTIONS)} check_* function(s) proved capable of rejecting the input they "
        f"exist to reject ({self_test_case_count} self-test case(s), 1:1)."
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

    ported_text = PORTED_CHANNELS_PATH.read_text(encoding="utf-8")
    inventory_text = INVENTORY_PATH.read_text(encoding="utf-8")

    run_all_ported_channels_assertions(ported_text)
    run_all_inventory_assertions(inventory_text)

    print(
        f"OK: all {len(CHANNELS)} channels declared exactly once with correct send/invoke kind, "
        f"{len(REQUIRED_RIDER_TOKENS)} rider token(s) present, every proof level permitted, and "
        "IPC-PORT-INVENTORY.md's 31/6/57 scope-surgery split is intact (REQ-34.4-16, verified not "
        "edited)."
    )
    sys.exit(0)


if __name__ == "__main__":
    main()
