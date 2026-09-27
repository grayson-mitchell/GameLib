#!/usr/bin/env python3
"""Apply the 48 verbatim `setting.eosOverlay.updatingStatus` translations from
260927-q9t-translations.json onto public/locales/<locale>/gamelib.json.

Idempotent-safe rather than idempotent: a second run without --force aborts
with a clear "already present" message. Values are copied byte-for-byte from
the artifact's `locales.<code>.value` field -- never typed by hand -- because
several of them carry characters (a ZWNJ in `fa`, its deliberate ABSENCE in
`ml`, a space before `…` in `de`/`sl`) that a hand-retype would destroy.
"""
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
TASK_DIR = Path(__file__).resolve().parent
TRANSLATIONS_PATH = TASK_DIR / "260927-q9t-translations.json"
LOCALES_DIR = REPO_ROOT / "public" / "locales"


def dumps(parsed: dict) -> str:
    return json.dumps(parsed, ensure_ascii=False, indent=4) + "\n"


def main() -> int:
    force = "--force" in sys.argv[1:]

    with open(TRANSLATIONS_PATH, "r", encoding="utf-8") as f:
        artifact = json.load(f)

    locales_data = artifact["locales"]
    artifact_locale_set = set(locales_data.keys())

    fs_locale_set = {
        p.name for p in LOCALES_DIR.iterdir() if p.is_dir() and p.name != "en"
    }

    if artifact_locale_set != fs_locale_set:
        missing_in_artifact = fs_locale_set - artifact_locale_set
        extra_in_artifact = artifact_locale_set - fs_locale_set
        print(
            "ABORT: artifact locale set does not equal "
            "{dirs under public/locales} - {en}.\n"
            f"  missing from artifact: {sorted(missing_in_artifact)}\n"
            f"  extra in artifact: {sorted(extra_in_artifact)}",
            file=sys.stderr,
        )
        return 1

    if len(artifact_locale_set) != 48:
        print(
            f"ABORT: expected exactly 48 locales in the artifact, found "
            f"{len(artifact_locale_set)}.",
            file=sys.stderr,
        )
        return 1

    # Pre-flight: read + round-trip-assert every file BEFORE writing anything.
    parsed_by_locale = {}
    for locale in sorted(artifact_locale_set):
        path = LOCALES_DIR / locale / "gamelib.json"
        original_text = path.read_text(encoding="utf-8")
        parsed = json.loads(original_text)

        round_tripped = dumps(parsed)
        if round_tripped != original_text:
            print(
                f"ABORT: {path} does not round-trip byte-for-byte through "
                "json.dumps(parsed, ensure_ascii=False, indent=4) + '\\n'. "
                "Aborting the WHOLE run before any file is written.",
                file=sys.stderr,
            )
            return 1

        eos_overlay = parsed.get("setting", {}).get("eosOverlay")
        if not isinstance(eos_overlay, dict):
            print(
                f"ABORT: {path} has no dict at ['setting']['eosOverlay'].",
                file=sys.stderr,
            )
            return 1

        already_present = "updatingStatus" in eos_overlay
        if already_present and not force:
            print(
                f"ABORT: {path} already has 'updatingStatus' set. "
                "Re-run with --force to overwrite. (This guards against a "
                "silent no-op after a partial failure.)",
                file=sys.stderr,
            )
            return 1

        parsed_by_locale[locale] = parsed

    # Write phase.
    written = 0
    for locale in sorted(artifact_locale_set):
        path = LOCALES_DIR / locale / "gamelib.json"
        parsed = parsed_by_locale[locale]
        value = locales_data[locale]["value"]

        eos_overlay = parsed["setting"]["eosOverlay"]
        new_eos_overlay = dict(
            sorted({**eos_overlay, "updatingStatus": value}.items())
        )
        parsed["setting"]["eosOverlay"] = new_eos_overlay

        new_text = dumps(parsed)
        path.write_text(new_text, encoding="utf-8")
        print(f"wrote {locale}")
        written += 1

    print(f"total written: {written}")

    # Post-write: re-read every file and re-assert the round-trip on the NEW
    # bytes.
    for locale in sorted(artifact_locale_set):
        path = LOCALES_DIR / locale / "gamelib.json"
        new_text = path.read_text(encoding="utf-8")
        reparsed = json.loads(new_text)
        round_tripped = dumps(reparsed)
        if round_tripped != new_text:
            print(
                f"ABORT (post-write): {path} does not round-trip on the "
                "bytes just written.",
                file=sys.stderr,
            )
            return 1

    print("post-write round-trip verified for all files.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
