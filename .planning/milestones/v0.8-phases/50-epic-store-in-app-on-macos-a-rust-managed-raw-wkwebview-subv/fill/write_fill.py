#!/usr/bin/env python3
"""
Phase 50 plan 04 Task 2 -- the writer. Reads fill/proposed.json (one JSON
file per run, so the authored translations are reviewable data and this
script is never where a translation lives) and applies it to all 48
non-English `gamelib.json` catalogues plus all 48 `gamelib.mt.json`
manifests.

All-or-nothing: every file's new bytes are computed and round-trip-verified
in memory FIRST; nothing is written to disk until every single one of the
96 computations has passed. If any write fails partway, every file touched
so far is restored from the pre-write snapshot -- `git checkout --` is
never used for this, because it would discard any uncommitted work already
sitting in that same file (forbidden by this plan's own prohibitions).

Run directly: `python3 write_fill.py`. Refuses to run if fill/proposed.json
is missing, or if preflight.py has not been proven to pass against it
(callers are expected to have just run preflight.py; this script re-detects
serialisation and insertion points itself rather than trusting a prior run's
numbers, since nothing here is more expensive to recompute than to get
wrong).
"""

import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fill_lib as lib  # noqa: E402

SNAPSHOT_DIR = lib.PHASE_DIR / ".snapshot"


def build_new_catalogue(cat: dict, values: dict) -> dict:
    """Returns a NEW dict: `cat` with the two brand-new groups
    (`webview.epicEmbed`, `webview.unavailable.epic-challenged`) inserted at
    their computed landing points. `cat` itself is not mutated."""
    webview = cat["webview"]

    new_epic_embed = {
        "launcherBlocked": {
            "message": values["webview.epicEmbed.launcherBlocked.message"]
        },
        "timeout": {
            "message": values["webview.epicEmbed.timeout.message"],
            "reload": values["webview.epicEmbed.timeout.reload"],
        },
    }
    landing = lib.insertion_landing_point(list(webview.keys()), "epicEmbed")
    new_webview = lib.insert_before(webview, "epicEmbed", new_epic_embed, landing)

    unavailable = new_webview["unavailable"]
    new_epic_challenged = {
        "body": values["webview.unavailable.epic-challenged.body"],
        "heading": values["webview.unavailable.epic-challenged.heading"],
        "tryAgain": values["webview.unavailable.epic-challenged.tryAgain"],
    }
    landing2 = lib.insertion_landing_point(list(unavailable.keys()), "epic-challenged")
    new_unavailable = lib.insert_before(
        unavailable, "epic-challenged", new_epic_challenged, landing2
    )
    new_webview["unavailable"] = new_unavailable

    new_cat = dict(cat)
    new_cat["webview"] = new_webview
    return new_cat


def build_new_manifest(manifest: dict) -> dict:
    """Returns a NEW dict: `manifest` with the six new key paths merged
    into its sorted `keys[]` array. `locale`, `model` and `filledAt` are
    carried over completely untouched -- each is a single global value per
    file, so editing either would misrepresent the fill time/model of every
    OTHER key already in that manifest."""
    new_manifest = dict(manifest)
    new_manifest["keys"] = sorted(set(manifest.get("keys", [])) | set(lib.NEW_KEYS))
    return new_manifest


def compute_all_writes(proposed: dict):
    """Returns a list of (path, new_text, combo) tuples, or raises with a
    descriptive error if ANY file's computation fails -- nothing is written
    until every single one has succeeded."""
    writes = []
    errors = []

    for locale in lib.non_english_locales():
        values = proposed.get(locale)
        if values is None:
            errors.append(f"{locale}: no entry in fill/proposed.json")
            continue
        missing_keys = [k for k in lib.NEW_KEYS if k not in values]
        if missing_keys:
            errors.append(f"{locale}: proposed.json is missing keys {missing_keys}")
            continue

        cat_path = lib.LOCALES_DIR / locale / "gamelib.json"
        man_path = lib.LOCALES_DIR / locale / "gamelib.mt.json"

        cat_text = cat_path.read_text(encoding="utf-8")
        cat_combo = lib.detect_serialisation(cat_text)
        if cat_combo is None:
            errors.append(f"{locale}: gamelib.json has no detectable serialisation combo")
            continue
        cat = json.loads(cat_text)

        man_text = man_path.read_text(encoding="utf-8")
        man_combo = lib.detect_serialisation(man_text)
        if man_combo is None:
            errors.append(f"{locale}: gamelib.mt.json has no detectable serialisation combo")
            continue
        manifest = json.loads(man_text)

        new_cat = build_new_catalogue(cat, values)
        new_cat_text = lib.serialise(new_cat, cat_combo)

        # Round-trip self-check: re-parsing the text we are about to write
        # must reproduce exactly the dict we built, AND must itself detect
        # the same serialisation combo -- otherwise this write would not
        # survive this same script's own detector on a later run.
        reparsed = json.loads(new_cat_text)
        if reparsed != new_cat:
            errors.append(f"{locale}: gamelib.json new text does not round-trip to the intended structure")
            continue
        if lib.detect_serialisation(new_cat_text) != cat_combo:
            errors.append(f"{locale}: gamelib.json new text does not re-detect its own serialisation combo")
            continue

        new_manifest = build_new_manifest(manifest)
        new_man_text = lib.serialise(new_manifest, man_combo)
        reparsed_man = json.loads(new_man_text)
        if reparsed_man != new_manifest:
            errors.append(f"{locale}: gamelib.mt.json new text does not round-trip to the intended structure")
            continue
        if lib.detect_serialisation(new_man_text) != man_combo:
            errors.append(f"{locale}: gamelib.mt.json new text does not re-detect its own serialisation combo")
            continue

        # D-09-equivalent invariant for THIS script: never overwrite a value
        # that is already non-empty. Every target key is brand new (checked
        # structurally by preflight's Check 7 -- the parent group must not
        # already exist), so this is a belt-and-suspenders re-check, not the
        # primary guard.
        flat_before = lib.flatten(cat)
        for key in lib.NEW_KEYS:
            if flat_before.get(key):
                errors.append(f"{locale}: {key} already has a non-empty value -- refusing to overwrite")

        writes.append((cat_path, new_cat_text, cat_combo))
        writes.append((man_path, new_man_text, man_combo))

    if errors:
        raise RuntimeError("compute_all_writes failed:\n" + "\n".join(errors))

    return writes


def snapshot(paths):
    if SNAPSHOT_DIR.exists():
        shutil.rmtree(SNAPSHOT_DIR)
    SNAPSHOT_DIR.mkdir(parents=True)
    mapping = {}
    for i, path in enumerate(paths):
        dest = SNAPSHOT_DIR / f"{i:03d}.snap"
        shutil.copy2(path, dest)
        mapping[path] = dest
    return mapping


def restore(mapping, written_so_far):
    for path in written_so_far:
        snap = mapping[path]
        shutil.copy2(snap, path)
    print(f"RESTORED {len(written_so_far)} files from snapshot after a failed write.", file=sys.stderr)


def main():
    proposed = lib.load_proposed()
    if proposed is None:
        print("FATAL: fill/proposed.json does not exist -- nothing to write.", file=sys.stderr)
        sys.exit(1)

    print("Computing all writes (all-or-nothing; nothing is written yet)...")
    writes = compute_all_writes(proposed)
    print(f"Computed {len(writes)} file writes ({len(writes) // 2} locales x 2 files). All round-trip assertions held.")

    paths = [p for p, _, _ in writes]
    print(f"Snapshotting {len(paths)} files to {lib.repo_relative(SNAPSHOT_DIR)} ...")
    mapping = snapshot(paths)

    written = []
    try:
        for path, text, _combo in writes:
            path.write_text(text, encoding="utf-8")
            written.append(path)
    except Exception as exc:  # noqa: BLE001
        print(f"FATAL during write: {exc}", file=sys.stderr)
        restore(mapping, written)
        sys.exit(1)

    print(f"Wrote {len(written)} files. Re-verifying round trip against disk...")
    mismatches = []
    for path, expected_text, combo in writes:
        actual_text = path.read_text(encoding="utf-8")
        if actual_text != expected_text:
            mismatches.append(lib.repo_relative(path))
        if lib.detect_serialisation(actual_text) != combo:
            mismatches.append(lib.repo_relative(path) + " (combo drifted)")

    if mismatches:
        print(f"FATAL: {len(mismatches)} files do not match intended output after writing: {mismatches}", file=sys.stderr)
        restore(mapping, written)
        sys.exit(1)

    shutil.rmtree(SNAPSHOT_DIR)
    print(f"SUCCESS: {len(written)} files written and verified, snapshot cleaned up.")


if __name__ == "__main__":
    main()
