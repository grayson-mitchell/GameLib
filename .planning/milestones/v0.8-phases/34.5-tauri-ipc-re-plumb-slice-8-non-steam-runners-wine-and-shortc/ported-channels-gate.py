#!/usr/bin/env python3
"""Doc-shape gate for 34.5-PORTED-CHANNELS.md (REQ-34.5-11) and its cross-check against
`.planning/IPC-PORT-INVENTORY.md`'s Phase 34.5/34.6 sections.

Purpose (read this before deleting a failing assertion): this phase's declared ported-channel list
exists so a future reader never conflates "wired and unit-proven" with "seen working" — the same
conflation `34.4.1-PORTED-CHANNELS.md`'s own gate was built to prevent (that document's own
docstring cites the G-30-02 double-fixed-while-hung incident). This script is modeled closely on
`.planning/phases/34.4.1-.../ported-channels-gate.py`, adapted for this phase's 39-channel shape
(vs. that phase's 7) and its own extra obligations: the two-channel scope of live-gate item 4
(`addToSteam` AND `addShortcut`, T-34.5-67) that a natural mistake would credit to `addToSteam`
alone, and (as of plan 34.5-43, F-34.5-G6-10) a late-discovered 39th channel (`getInstallInfo`)
that a future editor could quietly absorb into the original 38 and erase the record that
`IPC-PORT-INVENTORY.md` was not exhaustive — check 10 exists specifically to prevent that.

When this gate fails, the correct maintenance action is to RESTORE the missing declaration (a
dropped channel row, a dropped rider, a reverted arithmetic total) — never to delete or weaken an
assertion to make the gate pass. Deleting an assertion here defeats the reason this file exists.

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
PORTED_CHANNELS_PATH = PHASE_DIR / "34.5-PORTED-CHANNELS.md"
INVENTORY_PATH = PHASE_DIR.parent.parent / "IPC-PORT-INVENTORY.md"

# ---------------------------------------------------------------------------
# The declared 39, by registration module (11 + 9 + 7 + 11 + 1 = 39), the first 38 measured by
# plan 34.5-13's completeness proof (runnerSliceRegistration.test.ts Describe 6), not merely
# predicted by CONTEXT.md. The 39th, `getInstallInfo`, arrived LATE (F-34.5-G6-10, plan 34.5-43) --
# it is a game-details channel by concern, not one of this slice's four runner modules, so it is
# ported into `gameDetailsFlowRegistration.ts` rather than any of the other four.
# ---------------------------------------------------------------------------

AUTH_CHANNELS = [
    "getEpicGamesStatus",
    "getUserInfo",
    "isLoggedIn",
    "login",
    "logoutLegendary",
    "authGOG",
    "logoutGOG",
    "getAmazonLoginData",
    "authAmazon",
    "getAmazonUserInfo",
    "logoutAmazon",
]
WINE_CHANNELS = [
    "getAlternativeWine",
    "installWineVersion",
    "refreshWineVersionInfo",
    "removeWineVersion",
    "runWineCommand",
    "toggleDXVK",
    "toggleDXVKNVAPI",
    "toggleVKD3D",
    "wine.isValidVersion",
]
SHORTCUTS_CHANNELS = [
    "shortcutsExists",
    "addToSteam",
    "removeFromSteam",
    "isAddedToSteam",
    "addShortcut",
    "removeShortcut",
    "processShortcut",
]
MISC_CHANNELS = [
    "getCometVersion",
    "getGogdlVersion",
    "getLegendaryVersion",
    "getNileVersion",
    "callTool",
    "egsSync",
    "getGOGLinuxInstallersLangs",
    "syncSaves",
    "syncGOGSaves",
    "downloadRuntime",
    "isRuntimeInstalled",
]

assert len(AUTH_CHANNELS) == 11
assert len(WINE_CHANNELS) == 9
assert len(SHORTCUTS_CHANNELS) == 7
assert len(MISC_CHANNELS) == 11

# The 39th channel, late-discovered (F-34.5-G6-10, plan 34.5-43): getInstallInfo is a real preload
# channel that was registered ONLY on the Electron side (main.ts:842) until this port. It is a
# game-details channel by concern -- ported into gameDetailsFlowRegistration.ts, not any of the
# four runner modules above.
GAME_DETAILS_CHANNELS = [
    "getInstallInfo",
]
assert len(GAME_DETAILS_CHANNELS) == 1

MODULE_CHANNELS = {
    "runnerAuthFlowRegistration.ts": AUTH_CHANNELS,
    "wineToolsFlowRegistration.ts": WINE_CHANNELS,
    "shortcutsFlowRegistration.ts": SHORTCUTS_CHANNELS,
    "runnerMiscFlowRegistration.ts": MISC_CHANNELS,
    "gameDetailsFlowRegistration.ts": GAME_DETAILS_CHANNELS,
}
MODULE_EXPECTED_COUNTS = {
    "runnerAuthFlowRegistration.ts": 11,
    "wineToolsFlowRegistration.ts": 9,
    "shortcutsFlowRegistration.ts": 7,
    "runnerMiscFlowRegistration.ts": 11,
    "gameDetailsFlowRegistration.ts": 1,
}

ALL_CHANNELS = AUTH_CHANNELS + WINE_CHANNELS + SHORTCUTS_CHANNELS + MISC_CHANNELS + GAME_DETAILS_CHANNELS
assert len(ALL_CHANNELS) == 39, f"ALL_CHANNELS has {len(ALL_CHANNELS)} entries, expected 39"
assert len(set(ALL_CHANNELS)) == 39, "ALL_CHANNELS contains a duplicate name"

# The 4 channels that must carry kind "sidecar send". Every other one of the 39 must be
# "sidecar invoke" -- including getInstallInfo (main.ts:842 is addHandler).
SEND_CHANNELS = {"logoutGOG", "addShortcut", "removeShortcut", "processShortcut"}
INVOKE_CHANNELS = set(ALL_CHANNELS) - SEND_CHANNELS
assert len(SEND_CHANNELS) == 4
assert len(INVOKE_CHANNELS) == 35

# The 3 permanently-dropped channels (D-02) and the 16 deferred-to-Phase-34.6 channels (D-03/D-05).
# 39 + 3 + 16 = 58, matching IPC-PORT-INVENTORY.md's Phase 34.5 section count.
DROPPED_CHANNELS = {"authZoom", "getZoomUserInfo", "logoutZoom"}
DEFERRED_CHANNELS = {
    # EOS overlay (8)
    "disableEosOverlay",
    "enableEosOverlay",
    "getEosOverlayStatus",
    "getLatestEosOverlayVersion",
    "installEosOverlay",
    "isEosOverlayEnabled",
    "removeEosOverlay",
    "updateEosOverlayInfo",
    # SteamGridDB artwork (5)
    "steamgriddb.getGrids",
    "steamgriddb.getHeroes",
    "steamgriddb.hasApiKey",
    "steamgriddb.searchGame",
    "steamgriddb.setApiKey",
    # winetricks (3)
    "winetricksAvailable",
    "winetricksInstall",
    "winetricksInstalled",
}
assert len(DROPPED_CHANNELS) == 3
assert len(DEFERRED_CHANNELS) == 16
assert len(DROPPED_CHANNELS & DEFERRED_CHANNELS) == 0
assert len(DROPPED_CHANNELS & set(ALL_CHANNELS)) == 0
assert len(DEFERRED_CHANNELS & set(ALL_CHANNELS)) == 0

# Permits exactly "unit" or "unit + LIVE (item N) — <state>" where <state> is PENDING (the only
# legal value while the live gate has not run) or a recorded PASS/FAIL (legal once plan 34.5-15
# records a result, per this gate's own check 4 — the document must be flippable from PENDING to a
# result without this script rejecting it).
PERMITTED_PROOF_LEVEL_PATTERN = re.compile(
    r"^(unit|unit \+ LIVE \(item \d+\) — (PENDING|PASS|FAIL))$"
)

# Matches a table row leading with a backticked channel name in the first cell, e.g.
# "| `login` | sidecar invoke | ... |". Anchored to the row-leading position so a channel merely
# MENTIONED in prose (e.g. a Riders cell cross-referencing a sibling channel) can never satisfy
# this — only an actual table row counts.
ROW_PATTERN = re.compile(r"^\|\s*`([A-Za-z0-9_.]+)`\s*\|(.*)\|\s*$", re.MULTILINE)


def fail(message: str) -> None:
    print(f"GATE FAILED: {message}", file=sys.stderr)
    sys.exit(1)


def extract_rows(text: str) -> list[tuple[str, str]]:
    """Return (channel_name, full_row_text) for every table row leading with a backticked name."""
    return [(m.group(1), m.group(0)) for m in ROW_PATTERN.finditer(text)]


def _cells(row: str) -> list[str]:
    return [c.strip() for c in row.strip().strip("|").split("|")]


def _relevant_rows(text: str) -> list[tuple[str, str]]:
    """Rows whose channel name is one of the declared 38 — filters out any incidental
    backtick-leading table row elsewhere in the document (there should be none, but this keeps
    every check anchored to the real declared set rather than "whatever rows exist")."""
    return [(name, row) for name, row in extract_rows(text) if name in ALL_CHANNELS]


# ---------------------------------------------------------------------------
# Check 1 — row count is exactly 38
# ---------------------------------------------------------------------------


def check_row_count(text: str) -> None:
    rows = _relevant_rows(text)
    names = [name for name, _ in rows]
    if len(rows) != 39:
        fail(
            f"found {len(rows)} declared-channel table row(s), expected exactly 39 — a dropped "
            "row or a duplicate row both fail this assertion"
        )
    missing = [c for c in ALL_CHANNELS if c not in names]
    if missing:
        fail(f"the following declared channel(s) have no table row: {', '.join(missing)}")


# ---------------------------------------------------------------------------
# Check 2 — kind cells: only "sidecar invoke" / "sidecar send"; send set equals exactly the 4
# ---------------------------------------------------------------------------


def check_kind_correctness(text: str) -> None:
    rows = _relevant_rows(text)
    actual_send = set()
    actual_invoke = set()
    for name, row in rows:
        cells = _cells(row)
        if len(cells) < 2:
            fail(f"channel `{name}`'s row has fewer than 2 cells")
            continue
        kind = cells[1]
        if kind == "sidecar send":
            actual_send.add(name)
        elif kind == "sidecar invoke":
            actual_invoke.add(name)
        else:
            fail(f"channel `{name}` has an unrecognized kind cell: '{kind}'")
    if actual_send != SEND_CHANNELS:
        unexpected = actual_send - SEND_CHANNELS
        missing = SEND_CHANNELS - actual_send
        details = []
        if unexpected:
            details.append(f"unexpectedly marked 'sidecar send': {', '.join(sorted(unexpected))}")
        if missing:
            details.append(f"expected 'sidecar send' but were not: {', '.join(sorted(missing))}")
        joined_details = "; ".join(details)
        fail(
            "the send-kind channel set must be EXACTLY {logoutGOG, addShortcut, processShortcut, "
            "removeShortcut} — " + joined_details
        )
    if actual_invoke != INVOKE_CHANNELS:
        fail(
            "the invoke-kind channel set does not exactly match the expected 35 — got "
            f"{len(actual_invoke)} channel(s), expected 35"
        )


# ---------------------------------------------------------------------------
# Check 3 — every proof-level cell matches the permitted vocabulary; no bare "done"
# ---------------------------------------------------------------------------


def check_proof_levels(text: str) -> None:
    rows = _relevant_rows(text)
    bad_rows = []
    for name, row in rows:
        cells = _cells(row)
        if len(cells) < 4:
            bad_rows.append((name, "row has fewer than 4 cells"))
            continue
        proof_level = cells[3]
        if not PERMITTED_PROOF_LEVEL_PATTERN.match(proof_level):
            bad_rows.append((name, proof_level))
    if bad_rows:
        details = "; ".join(f"{name}: '{val}'" for name, val in bad_rows)
        fail(
            "the following row(s) have a proof-level cell that is not one of the permitted forms "
            f"(unit / unit + LIVE (item N) — PENDING|PASS|FAIL): {details}"
        )


# ---------------------------------------------------------------------------
# Check 4 — every cell containing "LIVE (item" also contains PENDING or a recorded PASS/FAIL.
# This is the SAME regex as check 3's pattern (a proof level that matches the permitted pattern
# and contains "LIVE (item" necessarily contains one of PENDING/PASS/FAIL, by construction of the
# pattern) — implemented as its own explicit check so a future editor who loosens check 3's regex
# does not silently defeat this specific guarantee (T-34.5-55) without a dedicated failure.
# ---------------------------------------------------------------------------

LIVE_STATE_PATTERN = re.compile(r"LIVE \(item \d+\) — (PENDING|PASS|FAIL)")


def check_live_cells_have_state(text: str) -> None:
    rows = _relevant_rows(text)
    bad_rows = []
    for name, row in rows:
        cells = _cells(row)
        if len(cells) < 4:
            continue
        proof_level = cells[3]
        if "LIVE (item" in proof_level and not LIVE_STATE_PATTERN.search(proof_level):
            bad_rows.append((name, proof_level))
    if bad_rows:
        details = "; ".join(f"{name}: '{val}'" for name, val in bad_rows)
        fail(
            "the following row(s) claim a LIVE result without a PENDING/PASS/FAIL state marker — "
            f"a gate-dependent cell must never be ambiguous about whether the gate has run: {details}"
        )


# ---------------------------------------------------------------------------
# Check 5 — 38 + 3 + 16 = 57 arithmetic cross-check against IPC-PORT-INVENTORY.md, set-equality,
# no name in two buckets.
# ---------------------------------------------------------------------------

PHASE_34_5_HEADING = re.compile(
    r"^## Phase 34\.5 — Slice 8 — non-Steam runners, Wine and shortcuts \(58 channels\)",
    re.MULTILINE,
)
PHASE_34_6_HEADING = re.compile(
    r"^## Phase 34\.6 — Slice 9 — EOS overlay, SteamGridDB and winetricks \(16 channels\)",
    re.MULTILINE,
)
# Matches a WHOLE LINE consisting of nothing but a comma-separated list of backtick-quoted
# channel names, optionally followed by exactly one trailing parenthetical clause (e.g.
# " (EOS overlay, 8)") and/or a trailing period — the exact shape IPC-PORT-INVENTORY.md uses for
# its declared channel-list lines. Deliberately whole-line anchored (not just line-start): a prose
# sentence that happens to OPEN with a backtick-quoted name followed by more prose (e.g.
# "`winetricksInstall` is `addListener`/send-kind (`tools/ipc_handler.ts`) — inherits ...") must be
# rejected, or a name mentioned only in that prose (here, `addListener`, `tools/ipc_handler.ts`)
# would be falsely counted as a declared list member.
CHANNEL_LIST_LINE_PATTERN = re.compile(
    r"^`[A-Za-z0-9_.]+`(?:,\s*`[A-Za-z0-9_.]+`)*(?:\s*\([^)]*\))?\.?$"
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


def _channel_names_in_backtick_lists(section_text: str) -> set:
    """Return the UNION of backtick-quoted channel names from every line that OPENS with a
    backtick-quoted name in `section_text` (Phase 34.6's section spreads its 16 across THREE such
    lines — EOS/SteamGridDB/winetricks, each with its own trailing '(cluster, N)' parenthetical —
    so this collects all of them, not just the first)."""
    names: set = set()
    for raw_line in section_text.splitlines():
        line = raw_line.strip()
        if CHANNEL_LIST_LINE_PATTERN.match(line):
            names |= set(re.findall(r"`([A-Za-z0-9_.]+)`", line))
    return names


def check_inventory_arithmetic(ported_text: str, inventory_text: str) -> None:
    declared = {name for name, _ in _relevant_rows(ported_text)}

    section_34_5 = _extract_section(inventory_text, PHASE_34_5_HEADING)
    if not section_34_5:
        fail(
            "IPC-PORT-INVENTORY.md is missing the '## Phase 34.5 — Slice 8 — non-Steam runners, "
            "Wine and shortcuts (57 channels)' heading — cannot cross-check the 57-channel set"
        )
    inventory_57 = _channel_names_in_backtick_lists(section_34_5)

    section_34_6 = _extract_section(inventory_text, PHASE_34_6_HEADING)
    if not section_34_6:
        fail(
            "IPC-PORT-INVENTORY.md is missing the '## Phase 34.6 — Slice 9 — EOS overlay, "
            "SteamGridDB and winetricks (16 channels)' heading — cannot cross-check the 16 "
            "deferred channels"
        )
    deferred = _channel_names_in_backtick_lists(section_34_6)

    if len(declared) != 39:
        fail(f"declared set has {len(declared)} names, expected 39")
    if len(deferred) != 16:
        fail(
            f"IPC-PORT-INVENTORY.md's Phase 34.6 section lists {len(deferred)} channel name(s), "
            "expected 16"
        )

    dropped = inventory_57 - declared - deferred
    overlaps = []
    if declared & deferred:
        overlaps.append(f"declared ∩ deferred: {sorted(declared & deferred)}")
    if declared & dropped:
        overlaps.append(f"declared ∩ dropped: {sorted(declared & dropped)}")
    if deferred & dropped:
        overlaps.append(f"deferred ∩ dropped: {sorted(deferred & dropped)}")
    if overlaps:
        fail(f"a channel name appears in more than one bucket — {'; '.join(overlaps)}")

    total = declared | deferred | dropped
    if total != inventory_57:
        missing = inventory_57 - total
        extra = total - inventory_57
        details = []
        if missing:
            details.append(f"in the inventory's 57 but in none of the 3 buckets: {sorted(missing)}")
        if extra:
            details.append(f"in a bucket but not in the inventory's 57: {sorted(extra)}")
        fail(
            "declared (39) + dropped + deferred (16) does not reconcile against "
            f"IPC-PORT-INVENTORY.md's Phase 34.5 58-name set — {'; '.join(details)}"
        )
    if len(dropped) != 3:
        fail(
            f"the reconciled 'dropped' remainder has {len(dropped)} name(s), expected exactly 3 "
            f"— got {sorted(dropped)}"
        )
    if dropped != DROPPED_CHANNELS:
        fail(
            f"the reconciled 'dropped' remainder {sorted(dropped)} does not match the expected "
            f"{sorted(DROPPED_CHANNELS)}"
        )


# ---------------------------------------------------------------------------
# Check 6 — per-module row counts are 11 / 9 / 7 / 11
# ---------------------------------------------------------------------------


def check_per_module_counts(text: str) -> None:
    rows = _relevant_rows(text)
    counts: dict[str, int] = {m: 0 for m in MODULE_EXPECTED_COUNTS}
    for name, row in rows:
        cells = _cells(row)
        if len(cells) < 3:
            continue
        module = cells[2].strip("`")
        if module in counts:
            counts[module] += 1
        else:
            fail(f"channel `{name}` is attributed to an unrecognized module: '{module}'")
    if counts != MODULE_EXPECTED_COUNTS:
        details = "; ".join(f"{m}: got {counts[m]}, expected {MODULE_EXPECTED_COUNTS[m]}" for m in counts)
        fail(f"per-module row counts do not match 11/9/7/11/1 — {details}")


# ---------------------------------------------------------------------------
# Check 7 — the residuals section names each of the four required residual items
# ---------------------------------------------------------------------------

RESIDUALS_HEADING = re.compile(r"^## Accepted residuals", re.MULTILINE)
REQUIRED_RESIDUAL_MARKERS = ["ctrl+r", "T-34.4.1-47", "Assumption A1", "Assumption A2"]


def check_residuals_present(text: str) -> None:
    section = _extract_section(text, RESIDUALS_HEADING)
    if not section:
        fail("no '## Accepted residuals' section found")
        return
    missing = [marker for marker in REQUIRED_RESIDUAL_MARKERS if marker not in section]
    if missing:
        fail(
            "the '## Accepted residuals' section is missing required marker(s): "
            f"{', '.join(missing)}"
        )


# ---------------------------------------------------------------------------
# Check 8 — the obligations-closed section cites T-34.4.1-44b
# ---------------------------------------------------------------------------

OBLIGATIONS_HEADING = re.compile(r"^## Obligations closed and opened", re.MULTILINE)


def check_obligations_cite_44b(text: str) -> None:
    section = _extract_section(text, OBLIGATIONS_HEADING)
    if not section:
        fail("no '## Obligations closed and opened' section found")
        return
    if "T-34.4.1-44b" not in section:
        fail(
            "the '## Obligations closed and opened' section does not cite T-34.4.1-44b — the "
            "nile host-anchor closure must be recorded there"
        )


# ---------------------------------------------------------------------------
# Check 9 — the set of channels whose proof level contains "LIVE (item 4)" is EXACTLY
# {addToSteam, addShortcut}, and each names its own distinct exe call site in Riders.
# ---------------------------------------------------------------------------

EXPECTED_ITEM_4_CHANNELS = {"addToSteam", "addShortcut"}
ITEM_4_CALL_SITES = {
    "addToSteam": "nonesteamgame.ts:258",
    "addShortcut": "shortcuts.ts:227",
}


def check_item_4_scope(text: str) -> None:
    rows = _relevant_rows(text)
    item_4_channels = set()
    riders_by_channel: dict[str, str] = {}
    for name, row in rows:
        cells = _cells(row)
        if len(cells) < 4:
            continue
        proof_level = cells[3]
        riders = cells[4] if len(cells) > 4 else ""
        riders_by_channel[name] = riders
        if "LIVE (item 4)" in proof_level:
            item_4_channels.add(name)
    if item_4_channels != EXPECTED_ITEM_4_CHANNELS:
        unexpected = item_4_channels - EXPECTED_ITEM_4_CHANNELS
        missing = EXPECTED_ITEM_4_CHANNELS - item_4_channels
        details = []
        if unexpected:
            details.append(f"unexpectedly credited with item 4: {sorted(unexpected)}")
        if missing:
            details.append(f"missing item 4 credit: {sorted(missing)}")
        joined_details = "; ".join(details)
        fail(
            "the set of channels carrying 'LIVE (item 4)' must be EXACTLY {addToSteam, "
            "addShortcut} — " + joined_details + ". Crediting item 4 to addToSteam alone "
            "understates what the gate proves (T-34.5-67)."
        )
    for channel, call_site in ITEM_4_CALL_SITES.items():
        riders = riders_by_channel.get(channel, "")
        if call_site not in riders:
            fail(
                f"`{channel}`'s Riders cell does not name its own exe call site ('{call_site}') — "
                "each of the two item-4 rows must name a DISTINCT call site so the split is "
                "legible without reading the plans"
            )


# ---------------------------------------------------------------------------
# Check 10 — the late-discovered getInstallInfo row (F-34.5-G6-10, plan 34.5-43) is attributed to
# gameDetailsFlowRegistration.ts and carries the literal F-34.5-G6-10 in its Riders cell.
#
# Purpose (anti-rot): without this check a future editor can quietly absorb this row into the
# original 38 and erase the record that IPC-PORT-INVENTORY.md was not exhaustive — which is
# U-34.5-14's entire subject. This check exists independently of the ⚠ warning paragraph in
# IPC-PORT-INVENTORY.md itself, so the provenance survives even if that paragraph is edited.
# ---------------------------------------------------------------------------


def check_late_discovery_provenance(text: str) -> None:
    rows = _relevant_rows(text)
    row_by_name = {name: row for name, row in rows}
    if "getInstallInfo" not in row_by_name:
        fail(
            "no `getInstallInfo` row found — F-34.5-G6-10's late-discovered channel must be "
            "declared with its own row, not silently absorbed into the original 38"
        )
        return
    cells = _cells(row_by_name["getInstallInfo"])
    if len(cells) < 3 or cells[2].strip("`") != "gameDetailsFlowRegistration.ts":
        fail(
            "`getInstallInfo`'s row is not attributed to `gameDetailsFlowRegistration.ts` — the "
            "late-discovery provenance would be lost"
        )
    riders = cells[4] if len(cells) > 4 else ""
    if "F-34.5-G6-10" not in riders:
        fail(
            "`getInstallInfo`'s Riders cell does not carry the literal 'F-34.5-G6-10' — without "
            "it a future editor can quietly absorb this row into the original 38 and erase the "
            "record that IPC-PORT-INVENTORY.md was not exhaustive (U-34.5-14's entire subject)"
        )


# ---------------------------------------------------------------------------
# Assertion registry
# ---------------------------------------------------------------------------

SINGLE_TEXT_ASSERTIONS = [
    ("row count is exactly 38 (check 1)", check_row_count),
    (
        "kind cells are only sidecar invoke/send; send set is exactly "
        "{logoutGOG, addShortcut, processShortcut, removeShortcut} (check 2)",
        check_kind_correctness,
    ),
    ("every proof-level cell matches the permitted vocabulary, no bare 'done' (check 3)", check_proof_levels),
    ("every 'LIVE (item N)' cell also carries PENDING/PASS/FAIL (check 4)", check_live_cells_have_state),
    ("per-module row counts are 11/9/7/11 (check 6)", check_per_module_counts),
    ("the residuals section names all four required residual items (check 7)", check_residuals_present),
    ("the obligations section cites T-34.4.1-44b (check 8)", check_obligations_cite_44b),
    (
        "item 4 is credited to EXACTLY {addToSteam, addShortcut}, each naming its own call site "
        "(check 9)",
        check_item_4_scope,
    ),
    (
        "the late-discovered getInstallInfo row is attributed to gameDetailsFlowRegistration.ts "
        "and carries F-34.5-G6-10 in its Riders cell (check 10)",
        check_late_discovery_provenance,
    ),
]
# Check 5 is a two-argument check (ported text + inventory text), run separately.
ASSERTION_COUNT = len(SINGLE_TEXT_ASSERTIONS) + 1  # +1 for check 5
assert ASSERTION_COUNT == 10, f"expected 10 checks total, got {ASSERTION_COUNT}"


def run_all_single_text_assertions(text: str) -> None:
    for _, fn in SINGLE_TEXT_ASSERTIONS:
        fn(text)


# ---------------------------------------------------------------------------
# Anti-vacuity self-tests. Each feeds a synthetic document that violates exactly one assertion
# and confirms that assertion fails for it, through the SAME check_* functions used against the
# real document — never a reimplementation. Exactly one self-test case per check.
# ---------------------------------------------------------------------------


def _valid_synthetic_row(name: str) -> str:
    if name == "logoutGOG":
        module = "runnerAuthFlowRegistration.ts"
    elif name in AUTH_CHANNELS:
        module = "runnerAuthFlowRegistration.ts"
    elif name in WINE_CHANNELS:
        module = "wineToolsFlowRegistration.ts"
    elif name in SHORTCUTS_CHANNELS:
        module = "shortcutsFlowRegistration.ts"
    elif name in GAME_DETAILS_CHANNELS:
        module = "gameDetailsFlowRegistration.ts"
    else:
        module = "runnerMiscFlowRegistration.ts"
    kind = "sidecar send" if name in SEND_CHANNELS else "sidecar invoke"
    if name == "addToSteam":
        proof = "unit + LIVE (item 4) — PENDING"
        riders = "nonesteamgame.ts:258"
    elif name == "addShortcut":
        proof = "unit + LIVE (item 4) — PENDING"
        riders = "shortcuts.ts:227"
    elif name == "runWineCommand":
        proof = "unit + LIVE (item 5) — PENDING"
        riders = "placeholder"
    elif name == "getInstallInfo":
        # F-34.5-G6-10: check 10 requires the literal marker in this cell.
        proof = "unit"
        riders = "F-34.5-G6-10"
    else:
        proof = "unit"
        riders = "placeholder"
    return f"| `{name}` | {kind} | `{module}` | {proof} | {riders} |"


def _valid_synthetic_ported_channels_doc() -> str:
    """A minimal synthetic 34.5-PORTED-CHANNELS.md satisfying every check, used as the self-test
    base case each violation is derived from by changing exactly one thing."""
    rows = [_valid_synthetic_row(c) for c in ALL_CHANNELS]
    return f"""# Synthetic test document

## Obligations closed and opened

CLOSED: T-34.4.1-44b, the nile host-anchor obligation, closed by plan 34.5-02.

## Accepted residuals

- processShortcut's ctrl+r hotkey is degraded.
- T-34.4.1-47, the shared cookie jar, is an accepted residual.
- The www.amazon.com anchor is MEDIUM confidence pending Assumption A1's live confirmation.
- GAMELIB_SHELL_EXE's macOS bundle behaviour is Assumption A2, unproven until item 4.

## The 39 channels

| Channel | Kind | Registration module | Proof level | Riders |
|---|---|---|---|---|
{chr(10).join(rows)}
"""


def _valid_synthetic_inventory_doc() -> str:
    """A minimal synthetic IPC-PORT-INVENTORY.md satisfying check 5's arithmetic shape."""
    all_58 = sorted(set(ALL_CHANNELS) | DROPPED_CHANNELS | DEFERRED_CHANNELS)
    phase_34_5_line = ", ".join(f"`{c}`" for c in all_58)

    eos = sorted(c for c in DEFERRED_CHANNELS if "Eos" in c or "eos" in c.lower())
    sgdb = sorted(c for c in DEFERRED_CHANNELS if c.startswith("steamgriddb."))
    winetricks = sorted(c for c in DEFERRED_CHANNELS if c.startswith("winetricks"))
    assert len(eos) == 8 and len(sgdb) == 5 and len(winetricks) == 3

    return f"""# Synthetic inventory

## Phase 34.5 — Slice 8 — non-Steam runners, Wine and shortcuts (58 channels)

{phase_34_5_line}

## Phase 34.6 — Slice 9 — EOS overlay, SteamGridDB and winetricks (16 channels)

{", ".join(f"`{c}`" for c in eos)}

{", ".join(f"`{c}`" for c in sgdb)}

{", ".join(f"`{c}`" for c in winetricks)}

## Not an IPC channel, but blocks Phase 35
"""


def _expect_failure(label: str, fn, *args) -> None:
    try:
        fn(*args)
    except SystemExit:
        print(f"  self-test OK: {label} correctly rejected")
        return
    fail(f"self-test FAILED: {label} did NOT reject its bad input — the gate is vacuous")


def self_test() -> None:
    """Exactly one self-test case per check (9 checks, 9 self-test cases below) — the count is
    asserted equal at the end of this function, not left as an informal claim."""
    base = _valid_synthetic_ported_channels_doc()
    inv_base = _valid_synthetic_inventory_doc()
    self_test_case_count = 0

    def case(label: str, fn, *args) -> None:
        nonlocal self_test_case_count
        self_test_case_count += 1
        _expect_failure(label, fn, *args)

    # Sanity: the base documents must pass a clean run before we start breaking them.
    try:
        run_all_single_text_assertions(base)
    except SystemExit:
        fail("self-test setup FAILED: the base synthetic PORTED-CHANNELS document does not pass a clean gate run")
    print("  self-test base document: passes clean (sanity check OK)")

    try:
        check_inventory_arithmetic(base, inv_base)
    except SystemExit:
        fail("self-test setup FAILED: the base documents do not pass the inventory arithmetic cross-check clean")
    print("  self-test base documents (arithmetic cross-check): pass clean (sanity check OK)")

    # Case 1 (check_row_count): drop one channel's row entirely, AND add a prose-only mention of
    # that same channel in its place — proves both that a missing row is caught, and that the
    # row-leading anchoring is real: a channel merely NAMED in prose does not rescue it.
    dropped_row_channel = ALL_CHANNELS[0]
    dropped_row_text = _valid_synthetic_row(dropped_row_channel)
    missing_row_doc = base.replace(
        dropped_row_text + "\n",
        f"(`{dropped_row_channel}` is only mentioned here in prose, not as a row — anchoring proof.)\n",
    )
    case(
        "missing-channel-row (with a prose-only anchoring decoy) rejected by check_row_count",
        check_row_count,
        missing_row_doc,
    )

    # Case 2 (check_kind_correctness): a send channel mismarked as invoke.
    kind_mismatch_doc = base.replace(
        _valid_synthetic_row("logoutGOG"),
        "| `logoutGOG` | sidecar invoke | `runnerAuthFlowRegistration.ts` | unit | placeholder |",
    )
    case(
        "logoutGOG mismarked as invoke rejected by check_kind_correctness",
        check_kind_correctness,
        kind_mismatch_doc,
    )

    # Case 3 (check_proof_levels): replace one row's "unit" with a made-up bare value.
    bad_proof_doc = base.replace(
        _valid_synthetic_row("getGogdlVersion"),
        "| `getGogdlVersion` | sidecar invoke | `runnerMiscFlowRegistration.ts` | done | placeholder |",
    )
    case(
        "bare 'done' proof-level value rejected by check_proof_levels",
        check_proof_levels,
        bad_proof_doc,
    )

    # Case 4 (check_live_cells_have_state): a LIVE cell missing its PENDING/PASS/FAIL state.
    no_state_doc = base.replace(
        _valid_synthetic_row("runWineCommand"),
        "| `runWineCommand` | sidecar invoke | `wineToolsFlowRegistration.ts` | "
        "unit + LIVE (item 5) | placeholder |",
    )
    case(
        "LIVE (item 5) cell missing a PENDING/PASS/FAIL state rejected by check_live_cells_have_state",
        check_live_cells_have_state,
        no_state_doc,
    )

    # Case 5 (check_inventory_arithmetic): a channel present in PORTED-CHANNELS but ALSO present
    # in the inventory's Phase 34.6 deferred list — leaks across buckets (should be impossible,
    # but this proves the overlap detector fires if it ever happens).
    overlap_inv_doc = inv_base.replace(
        f"`{sorted(c for c in DEFERRED_CHANNELS if c.startswith('winetricks'))[0]}`",
        f"`{ALL_CHANNELS[0]}`",
    )
    case(
        "a declared channel leaking into the Phase 34.6 deferred bucket rejected by "
        "check_inventory_arithmetic",
        check_inventory_arithmetic,
        base,
        overlap_inv_doc,
    )

    # Case 6 (check_per_module_counts): move one channel's registration module cell to the wrong
    # module, skewing two modules' counts away from 11/9/7/11.
    skewed_module_doc = base.replace(
        _valid_synthetic_row("getAlternativeWine"),
        "| `getAlternativeWine` | sidecar invoke | `runnerMiscFlowRegistration.ts` | unit | placeholder |",
    )
    case(
        "getAlternativeWine attributed to the wrong module rejected by check_per_module_counts",
        check_per_module_counts,
        skewed_module_doc,
    )

    # Case 7 (check_residuals_present): drop one of the four required residual markers.
    missing_residual_doc = base.replace(
        "- GAMELIB_SHELL_EXE's macOS bundle behaviour is Assumption A2, unproven until item 4.\n",
        "",
    )
    case(
        "missing Assumption A2 residual marker rejected by check_residuals_present",
        check_residuals_present,
        missing_residual_doc,
    )

    # Case 8 (check_obligations_cite_44b): remove the T-34.4.1-44b citation.
    missing_obligation_doc = base.replace(
        "CLOSED: T-34.4.1-44b, the nile host-anchor obligation, closed by plan 34.5-02.",
        "CLOSED: the nile host-anchor obligation, closed by plan 34.5-02.",
    )
    case(
        "missing T-34.4.1-44b citation rejected by check_obligations_cite_44b",
        check_obligations_cite_44b,
        missing_obligation_doc,
    )

    # Case 9 (check_item_4_scope): the natural mistake — item 4 credited to addToSteam alone,
    # addShortcut's LIVE (item 4) downgraded to plain unit.
    item_4_understated_doc = base.replace(
        _valid_synthetic_row("addShortcut"),
        "| `addShortcut` | sidecar send | `shortcutsFlowRegistration.ts` | unit | shortcuts.ts:227 |",
    )
    case(
        "item 4 credited to addToSteam alone (addShortcut downgraded) rejected by check_item_4_scope",
        check_item_4_scope,
        item_4_understated_doc,
    )

    # Case 10 (check_late_discovery_provenance): strip F-34.5-G6-10 from getInstallInfo's Riders
    # cell -- the natural mistake this check exists to catch: a future editor quietly absorbing
    # the late-discovered channel into the original 38 with no trace of why it arrived separately.
    stripped_provenance_doc = base.replace(
        _valid_synthetic_row("getInstallInfo"),
        "| `getInstallInfo` | sidecar invoke | `gameDetailsFlowRegistration.ts` | unit | placeholder |",
    )
    case(
        "getInstallInfo Riders cell stripped of F-34.5-G6-10 rejected by "
        "check_late_discovery_provenance",
        check_late_discovery_provenance,
        stripped_provenance_doc,
    )

    if self_test_case_count != ASSERTION_COUNT:
        fail(
            f"self-test FAILED: ran {self_test_case_count} self-test case(s) but there are "
            f"{ASSERTION_COUNT} check(s) — every assertion must have exactly one self-test case, "
            "no more, no fewer. This equality is checked at runtime, not just claimed in a comment."
        )

    print(
        f"\nAll {ASSERTION_COUNT} check(s) proved capable of rejecting the input they exist to "
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

    ported_text = PORTED_CHANNELS_PATH.read_text(encoding="utf-8")
    inventory_text = INVENTORY_PATH.read_text(encoding="utf-8")

    run_all_single_text_assertions(ported_text)
    check_inventory_arithmetic(ported_text, inventory_text)

    print(
        "OK: all 39 channels declared exactly once with correct send/invoke kind, every proof "
        "level permitted with an explicit PENDING/PASS/FAIL state on every LIVE cell, per-module "
        "counts are 11/9/7/11/1, the 39+3+16=58 arithmetic reconciles against "
        "IPC-PORT-INVENTORY.md with no name in two buckets, the residuals and obligations "
        "sections carry their required citations, live-gate item 4 is scoped to exactly "
        "{addToSteam, addShortcut}, and the late-discovered getInstallInfo row (F-34.5-G6-10) "
        "carries its provenance marker (REQ-34.5-11)."
    )
    sys.exit(0)


if __name__ == "__main__":
    main()
