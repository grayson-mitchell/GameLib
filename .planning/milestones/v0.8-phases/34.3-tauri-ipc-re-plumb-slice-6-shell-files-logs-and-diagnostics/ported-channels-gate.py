#!/usr/bin/env python3
"""Doc-shape gate for 34.3-PORTED-CHANNELS.md.

Purpose (read this before deleting a failing assertion): this phase's declared
ported-channel list exists because "wired and unit-proven" was once conflated with "seen
working" — the conflation that let G-30-02 be declared fixed twice while the live build hung
(see `34.3-CONTEXT.md`). This script turns every honesty requirement the artifact owes into a
non-zero exit instead of leaving it as something only a human reviewer might notice missing.

This phase has no gap cycle (unlike 34.2's `currency-gate.py`, which this file's structure is
modeled on). Do NOT copy 34.2's gap-cycle-numbered constants/sections — there is nothing here to
number yet. If a future gap cycle runs against this phase, the correct maintenance action at that
point is to add a new, separate section (mirroring 34.2's own per-cycle pattern), never to retrofit
gap-cycle scaffolding onto this file preemptively.

When this gate fails, the correct maintenance action is to RESTORE the missing declaration (a
dropped channel row, a dropped rider) or to EXTEND `CHANNELS`/`REQUIRED_RIDER_TOKENS` if the
underlying fact genuinely changed — never to delete or weaken an assertion to make the gate pass.
Deleting an assertion here defeats the reason this file exists: a denial-of-service against this
document's own honesty over time, the same failure class 34.2's `currency-gate.py` was built to
stop. If a rider genuinely no longer needs tracking, remove its token from
`REQUIRED_RIDER_TOKENS` in the SAME commit that also removes the prose discussing it, so the
token list and the prose can never quietly drift apart.

Run `python3 ported-channels-gate.py` to check the live document. Run
`python3 ported-channels-gate.py --self-test` to prove every assertion below actually rejects the
input it exists to reject — a gate that cannot be shown to reject a bad input is not a gate (the
lesson from Phase 34.2 gap cycle 4's round-4 blocker: 14 comment strippers that all passed
vacuously). Self-tests run the synthetic input through the SAME assertion functions used against
the real document, never a reimplementation.
"""

import re
import sys
from pathlib import Path

PORTED_CHANNELS_PATH = Path(__file__).parent / "34.3-PORTED-CHANNELS.md"

# The 29 channel names from `.planning/IPC-PORT-INVENTORY.md`'s
# "## Phase 34.3 — Slice 6 — shell, files, logs and diagnostics (29 channels)" heading.
# `logError` is deliberately NOT in this list — it was ported early by Phase 34.2 gap cycle 2
# (plan 34.2-16) and must never be re-registered or re-declared as one of this slice's 29.
CHANNELS = [
    "checkDiskSpace",
    "clearAchievementCache",
    "clearCache",
    "clipboardReadText",
    "clipboardWriteText",
    "copySystemInfoToClipboard",
    "deleteUploadedLogFile",
    "getShellPath",
    "getUploadedLogFiles",
    "logInfo",
    "openDiscordLink",
    "openExternalUrl",
    "openFolder",
    "openGithubSponsorsPage",
    "openKofiPage",
    "openLoginPage",
    "openPatreonPage",
    "openSidInfoPage",
    "openSupportPage",
    "openWeblate",
    "openWikiLink",
    "openWinePrefixFAQ",
    "pathExists",
    "removeFolder",
    "resetHeroic",
    "showConfigFileInFolder",
    "showItemInFolder",
    "showLogFileInFolder",
    "uploadLogFile",
]

assert len(CHANNELS) == 29, f"CHANNELS constant has {len(CHANNELS)} entries, expected 29"

# Every rider token below must appear somewhere in the document. Extend this list (never shrink
# it without also removing the prose it pins) if a future edit adds a new accepted risk or
# framing correction this document owes.
REQUIRED_RIDER_TOKENS = [
    "NOT a latent shipped defect",  # clipboard no-op framing correction (D-01 rider)
    "KNOWN ACCEPTED RISK",  # Humble key-copy silent-failure accepted risk (D-03 rider)
    "in EITHER build",  # deleteUploadedLogFile's structural deadness (D-08 rider)
    "documented, deliberately-dead",  # clipboard.readText()'s dead stub (D-04 rider)
    "explicitly NOT audited",  # log redaction filed-not-audited (D-09 rider)
    "config.json` + `GamesConfig/` only",  # resetHeroic's narrow blast radius
    "D-05 resolved to NO FIX",  # D-05 verified-no-fix finding
    "2.11.5",  # the tauri version D-05's verification names
    "34.2's D-07",  # distinguishing deleteUploadedLogFile from 34.2's port-introduced D-07 gap
]

PERMITTED_PROOF_LEVEL_PATTERN = re.compile(
    r"^(unit|unit \+ LIVE \([^)]+\)|ported at parity — declared caveat)$"
)

# Matches a table row leading with a backticked channel name in the first cell, e.g.
# "| `openExternalUrl` | sidecar send | ... |". Deliberately anchored to the row-leading
# position so a channel merely MENTIONED in prose (e.g. "mirrors the already-ported `logError`")
# can never satisfy this — only an actual table row counts.
ROW_PATTERN = re.compile(r"^\|\s*`([A-Za-z0-9_]+)`\s*\|(.*)\|\s*$", re.MULTILINE)


def fail(message: str) -> None:
    print(f"GATE FAILED: {message}", file=sys.stderr)
    sys.exit(1)


def extract_rows(text: str) -> list[tuple[str, str]]:
    """Return (channel_name, full_row_text) for every table row leading with a backticked name."""
    return [(m.group(1), m.group(0)) for m in ROW_PATTERN.finditer(text)]


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
    # Only count rows whose channel name is one of the 29 (or logError, which must be absent) —
    # this keeps the count meaningful even if the document's prose happens to contain an
    # unrelated backticked-name table elsewhere.
    relevant = [name for name, _ in rows if name in CHANNELS or name == "logError"]
    if len(relevant) != 29:
        fail(
            f"found {len(relevant)} channel table row(s) among the declared 29 + logError-guard "
            "set, expected exactly 29 — a 30th row (e.g. a re-added logError) or a dropped row "
            "both fail this assertion"
        )


def check_logerror_absent(text: str) -> None:
    rows = extract_rows(text)
    if any(name == "logError" for name, _ in rows):
        fail(
            "`logError` appears as a table row — it was ported early by Phase 34.2 gap cycle 2 "
            "and must NEVER be re-declared as one of this slice's 29 channels"
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
            f"values (unit / unit + LIVE (...) / ported at parity — declared caveat): {details}"
        )


ASSERTIONS = [
    ("all 29 channels present as table rows", check_all_channels_present),
    ("exactly 29 channel rows (no 30th row, no dropped row)", check_exact_row_count),
    ("logError absent as a table row", check_logerror_absent),
    ("every required rider token present", check_rider_tokens),
    ("every row's proof level is a permitted value", check_proof_levels),
]


def run_all_assertions(text: str) -> None:
    for _, fn in ASSERTIONS:
        fn(text)


# ---------------------------------------------------------------------------
# Anti-vacuity self-tests. Each feeds a synthetic document that violates exactly one assertion
# and confirms that assertion (and only the run of all assertions in sequence) fails for it,
# through the SAME check_* functions used against the real document — never a reimplementation.
# ---------------------------------------------------------------------------


def _valid_synthetic_doc() -> str:
    """A minimal synthetic document that satisfies every assertion, used as the self-test base
    case each violation is derived from by removing/altering exactly one thing."""
    rows = "\n".join(
        f"| `{c}` | sidecar send | `utils.ts` | unit | placeholder |" for c in CHANNELS
    )
    riders = "\n".join(REQUIRED_RIDER_TOKENS)
    return f"""# Synthetic test document

{riders}

| Channel | Kind | Backed by | Proof level | Notes |
|---|---|---|---|---|
{rows}
"""


def _expect_failure(label: str, fn, text: str) -> None:
    try:
        fn(text)
    except SystemExit:
        print(f"  self-test OK: {label} correctly rejected")
        return
    fail(f"self-test FAILED: {label} did NOT reject its bad input — the gate is vacuous")


def self_test() -> None:
    base = _valid_synthetic_doc()

    # Sanity: the base document must pass every assertion before we start breaking it.
    try:
        run_all_assertions(base)
    except SystemExit:
        fail("self-test setup FAILED: the base synthetic document does not pass a clean gate run")
    print("  self-test base document: passes clean (sanity check OK)")

    # 1. Missing channel row (drop one channel's row entirely).
    dropped = CHANNELS[0]
    missing_channel_doc = base.replace(f"| `{dropped}` | sidecar send | `utils.ts` | unit | placeholder |\n", "")
    _expect_failure(
        "missing-channel-row rejected by check_all_channels_present",
        check_all_channels_present,
        missing_channel_doc,
    )

    # 2. A 30th row (re-add logError as a table row).
    thirtieth_row_doc = base + "| `logError` | sidecar send | `logger/index.ts` | unit | should not exist |\n"
    _expect_failure(
        "30th row (logError) rejected by check_exact_row_count",
        check_exact_row_count,
        thirtieth_row_doc,
    )

    # 3. logError present as a table row (same doc reused — proves the dedicated absence check
    #    independently of the count check above).
    _expect_failure(
        "logError table row rejected by check_logerror_absent",
        check_logerror_absent,
        thirtieth_row_doc,
    )

    # 4. Missing rider token (strip one required token out of the document).
    victim_token = REQUIRED_RIDER_TOKENS[0]
    missing_rider_doc = base.replace(victim_token, "")
    _expect_failure(
        f"missing rider token ({victim_token!r}) rejected by check_rider_tokens",
        check_rider_tokens,
        missing_rider_doc,
    )

    # 5. Disallowed proof-level value (replace one row's "unit" with a made-up value).
    bad_proof_doc = base.replace(
        f"| `{CHANNELS[1]}` | sidecar send | `utils.ts` | unit | placeholder |",
        f"| `{CHANNELS[1]}` | sidecar send | `utils.ts` | seen working | placeholder |",
    )
    _expect_failure(
        "disallowed proof-level value rejected by check_proof_levels",
        check_proof_levels,
        bad_proof_doc,
    )

    print(f"\nAll {len(ASSERTIONS)} assertions proved capable of rejecting the input they exist to reject.")


def main() -> None:
    if "--self-test" in sys.argv:
        self_test()
        print("\nSELF-TEST OK: every assertion rejects its corresponding bad input.")
        sys.exit(0)

    if not PORTED_CHANNELS_PATH.exists():
        fail(f"{PORTED_CHANNELS_PATH} does not exist")

    text = PORTED_CHANNELS_PATH.read_text(encoding="utf-8")
    run_all_assertions(text)

    print(
        f"OK: all {len(CHANNELS)} channels declared exactly once, logError absent, "
        f"{len(REQUIRED_RIDER_TOKENS)} rider token(s) present, every proof level permitted."
    )
    sys.exit(0)


if __name__ == "__main__":
    main()
