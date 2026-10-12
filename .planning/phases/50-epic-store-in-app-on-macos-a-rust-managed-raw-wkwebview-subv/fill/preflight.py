#!/usr/bin/env python3
"""
Phase 50 plan 04 Task 1/2 -- pre-flight for the gamelib locale fill.

Must report 0 errors across all eight checks below BEFORE write_fill.py
touches a single catalogue. Checks 1-3 are tree-only: they run against the
live `public/locales` tree whether or not `fill/proposed.json` exists yet.
Checks 4-8 validate the proposed-translation table; until that file exists
(Task 1's own verify run, before a single translation is authored) they
report "0 items checked" rather than silently skipping -- the script always
runs all eight checks and always prints a real 0-errors-or-not result,
never a vacuous pass by omission.

Run directly: `python3 preflight.py` (relative imports resolve via sys.path
insertion below, same pattern used by every other standalone script under
this phase's `fill/` directory).
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fill_lib as lib  # noqa: E402


class Report:
    def __init__(self):
        self.total_errors = 0
        self.lines = []

    def say(self, line):
        self.lines.append(line)
        print(line)

    def check_done(self, n, name, errors):
        self.total_errors += len(errors)
        self.say(f"Check {n} ({name}): {len(errors)} errors")
        for e in errors:
            self.say(f"  ERROR: {e}")


def check1_locale_set(report: Report):
    errors = []
    all_dirs = sorted(
        p.name for p in lib.LOCALES_DIR.iterdir() if p.is_dir()
    )
    if "en" not in all_dirs:
        errors.append("public/locales/en is missing")
    if len(all_dirs) != 49:
        errors.append(
            f"expected 49 locale directories (en + 48), found {len(all_dirs)}: {all_dirs}"
        )
    non_english = lib.non_english_locales()
    report.say(
        f"  locale directories: {len(all_dirs)} total, "
        f"{len(non_english)} non-English (derived from the listing, not hard-coded)"
    )
    report.check_done(1, "locale set", errors)
    return non_english


def check2_key_set_per_locale(report: Report, non_english):
    errors = []
    en_path = lib.LOCALES_DIR / "en" / "gamelib.json"
    try:
        en_cat = json.loads(en_path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        report.check_done(2, "key set per locale", [f"cannot read/parse en/gamelib.json: {exc}"])
        return {}

    en_flat = lib.flatten(en_cat)
    missing_from_en = [k for k in lib.NEW_KEYS if k not in en_flat]
    if missing_from_en:
        errors.append(
            f"en/gamelib.json is missing keys this plan depends on: {missing_from_en}"
        )

    presence_table = {}  # locale -> {key: 'present'|'absent'|'empty'}
    for locale in non_english:
        cat_path = lib.LOCALES_DIR / locale / "gamelib.json"
        try:
            cat = json.loads(cat_path.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{locale}: cannot read/parse gamelib.json: {exc}")
            continue
        flat = lib.flatten(cat)
        row = {}
        for key in lib.NEW_KEYS:
            if key not in flat:
                row[key] = "absent"
            elif not str(flat[key]).strip():
                row[key] = "empty"
            else:
                row[key] = "present"
        presence_table[locale] = row

    all_absent_everywhere = all(
        presence_table.get(loc, {}).get(key) == "absent"
        for loc in non_english
        for key in lib.NEW_KEYS
    )
    all_present_everywhere = all(
        presence_table.get(loc, {}).get(key) == "present"
        for loc in non_english
        for key in lib.NEW_KEYS
    )
    if all_absent_everywhere:
        report.say("  all six new keys are absent in all non-English locales (expected pre-fill state)")
    elif all_present_everywhere:
        report.say("  all six new keys are present and non-empty in all non-English locales (expected post-fill state)")
    else:
        present_count = sum(
            1
            for loc in non_english
            for key in lib.NEW_KEYS
            if presence_table.get(loc, {}).get(key) == "present"
        )
        total = len(non_english) * len(lib.NEW_KEYS)
        report.say(f"  mixed state: {present_count}/{total} (locale, key) pairs present and non-empty")

    report.check_done(2, "key set per locale", errors)
    return presence_table


def check3_serialisation(report: Report, non_english):
    errors = []
    targets = [lib.LOCALES_DIR / "en" / "gamelib.json"]
    for locale in non_english:
        targets.append(lib.LOCALES_DIR / locale / "gamelib.json")
        manifest = lib.LOCALES_DIR / locale / "gamelib.mt.json"
        if manifest.exists():
            targets.append(manifest)
        else:
            errors.append(f"{locale}: gamelib.mt.json does not exist (48 manifests expected)")

    checked = 0
    combo_tally = {}
    for path in targets:
        checked += 1
        rel = lib.repo_relative(path)
        worktree_text = path.read_text(encoding="utf-8")
        worktree_combo = lib.detect_serialisation(worktree_text)
        if worktree_combo is None:
            errors.append(f"{rel}: no serialisation combination reproduces the WORKTREE bytes")
            continue

        head_text = lib.git_show_head(rel)
        if head_text is None:
            errors.append(f"{rel}: could not read HEAD revision via git show")
            continue
        head_combo = lib.detect_serialisation(head_text)
        if head_combo is None:
            errors.append(f"{rel}: no serialisation combination reproduces the HEAD bytes")
            continue
        if head_combo != worktree_combo:
            errors.append(
                f"{rel}: worktree combo {worktree_combo} disagrees with HEAD combo {head_combo}"
            )
        combo_tally[worktree_combo] = combo_tally.get(worktree_combo, 0) + 1

    report.say(f"  {checked} files checked (49 gamelib.json + 48 gamelib.mt.json expected = 97)")
    report.say(f"  combination tally: {combo_tally}")
    report.check_done(3, "serialisation combination per file", errors)


def check4_placeholder_parity(report: Report, proposed):
    errors = []
    en_path = lib.LOCALES_DIR / "en" / "gamelib.json"
    en_cat = json.loads(en_path.read_text(encoding="utf-8"))
    en_flat = lib.flatten(en_cat)

    import re

    def placeholders(s):
        return set(re.findall(r"\{\{([^}]+)\}\}", s))

    en_placeholder_sets = {k: placeholders(en_flat[k]) for k in lib.NEW_KEYS if k in en_flat}
    non_empty = {k: v for k, v in en_placeholder_sets.items() if v}
    if non_empty:
        errors.append(f"English source values unexpectedly carry placeholders: {non_empty}")

    checked = 0
    if proposed is not None:
        for locale, values in proposed.items():
            for key in lib.NEW_KEYS:
                if key not in values:
                    continue
                checked += 1
                target_ph = placeholders(values[key])
                source_ph = en_placeholder_sets.get(key, set())
                if target_ph != source_ph:
                    errors.append(
                        f"{locale}.{key}: placeholder set {target_ph} does not match source {source_ph}"
                    )

    report.say(f"  {checked} proposed values checked for placeholder parity" + (
        " (no proposed table yet)" if proposed is None else ""
    ))
    report.check_done(4, "placeholder parity", errors)


def check5_glossary_survival(report: Report, proposed):
    errors = []
    en_path = lib.LOCALES_DIR / "en" / "gamelib.json"
    en_cat = json.loads(en_path.read_text(encoding="utf-8"))
    en_flat = lib.flatten(en_cat)
    glossary = lib.load_glossary_terms()

    source_terms = {}
    for key in lib.NEW_KEYS:
        source = en_flat.get(key, "")
        matched = [t for t in glossary if lib.contains_term_source_presence(source, t)]
        source_terms[key] = matched
        report.say(f"  {key}: glossary terms present in source: {matched or '(none)'}")

    report.say(
        f"  pinned phrase check: \"{lib.PINNED_PHRASE}\" must survive verbatim in every "
        f"locale's {lib.PINNED_PHRASE_KEY} (this is independent of the generic glossary loop above, "
        f"which only pins \"Epic\"/\"Epic Games\" as individual glossary terms, not the full three-word phrase)"
    )

    checked = 0
    if proposed is not None:
        for locale, values in proposed.items():
            for key in lib.NEW_KEYS:
                if key not in values:
                    continue
                checked += 1
                target = values[key]
                for term in source_terms.get(key, []):
                    if not lib.contains_term_verbatim(target, term):
                        errors.append(
                            f"{locale}.{key}: glossary term \"{term}\" does not survive verbatim in target"
                        )
                if key == lib.PINNED_PHRASE_KEY and lib.PINNED_PHRASE not in target:
                    errors.append(
                        f"{locale}.{key}: pinned phrase \"{lib.PINNED_PHRASE}\" is absent from target"
                    )

    report.say(f"  {checked} proposed values checked for glossary/pinned-phrase survival" + (
        " (no proposed table yet)" if proposed is None else ""
    ))
    report.check_done(5, "glossary survival", errors)


def check6_no_empties(report: Report, proposed):
    errors = []
    checked = 0
    if proposed is not None:
        for locale, values in proposed.items():
            for key in lib.NEW_KEYS:
                if key not in values:
                    continue
                checked += 1
                if not str(values[key]).strip():
                    errors.append(f"{locale}.{key}: value is empty or whitespace-only")

    report.say(f"  {checked} proposed values checked for emptiness" + (
        " (no proposed table yet)" if proposed is None else ""
    ))
    report.check_done(6, "no empties", errors)


def check7_insertion_points(report: Report, non_english):
    errors = []
    landing_report = {}
    for locale in non_english:
        cat_path = lib.LOCALES_DIR / locale / "gamelib.json"
        cat = json.loads(cat_path.read_text(encoding="utf-8"))
        rows = {}
        for group in lib.NEW_GROUPS:
            parent = lib.get_nested(cat, group["parent_path"])
            if not isinstance(parent, dict):
                errors.append(
                    f"{locale}: parent object '{group['parent_path']}' is missing or not an object"
                )
                continue
            if group["group_key"] in parent:
                errors.append(
                    f"{locale}: '{group['parent_path']}.{group['group_key']}' already exists "
                    "-- this plan expects it to be entirely new"
                )
                continue
            landing = lib.insertion_landing_point(list(parent.keys()), group["group_key"])
            rows[f"{group['parent_path']}.{group['group_key']}"] = landing or "(end of object)"
        landing_report[locale] = rows

    sample = {k: landing_report[k] for k in list(landing_report)[:3]}
    report.say(f"  computed landing points for {len(non_english)} locales x {len(lib.NEW_GROUPS)} groups, e.g. {sample}")
    report.check_done(7, "insertion point per (locale, key)", errors)


def check8_real_validation(report: Report, proposed):
    errors = []
    en_path = lib.LOCALES_DIR / "en" / "gamelib.json"
    en_cat = json.loads(en_path.read_text(encoding="utf-8"))
    en_flat = lib.flatten(en_cat)
    glossary = lib.load_glossary_terms()

    items = []
    item_labels = []
    if proposed is not None:
        for locale, values in proposed.items():
            for key in lib.NEW_KEYS:
                if key not in values:
                    continue
                items.append({"source": en_flat[key], "target": values[key]})
                item_labels.append((locale, key))

    # Sabotage control: deliberately corrupt the launcherBlocked source/target
    # pair by stripping the pinned brand phrase from the target, and assert
    # the REAL validateTranslation rejects it. Runs even when `proposed` is
    # None (Task 1, before any translation exists) so the harness itself is
    # proven BEFORE there is any real data to validate -- a bridge that has
    # never been exercised is not proof of anything.
    sabotage_source = en_flat[lib.PINNED_PHRASE_KEY]
    sabotage_target = sabotage_source.replace(lib.PINNED_PHRASE, "the launcher")
    items.append({"source": sabotage_source, "target": sabotage_target})
    item_labels.append(("__sabotage__", lib.PINNED_PHRASE_KEY))

    try:
        results = lib.run_validate_bridge(items, glossary)
    except Exception as exc:  # noqa: BLE001
        report.check_done(8, "real validation with sabotage control", [str(exc)])
        return

    sabotage_result = results[-1]
    real_results = results[:-1]

    if sabotage_result:
        report.say(
            f"  sabotage control: REJECTED as expected -- validateTranslation reported: {sabotage_result}"
        )
    else:
        errors.append(
            "sabotage control: the deliberately corrupted value was ACCEPTED by the real "
            "validateTranslation -- the validator is not actually constraining anything"
        )

    for (locale, key), problems in zip(item_labels[:-1], real_results):
        for problem in problems:
            errors.append(f"{locale}.{key}: {problem}")

    report.say(
        f"  {len(real_results)} proposed values run through the genuine validateTranslation" + (
            " (no proposed table yet)" if proposed is None else ""
        )
    )
    report.check_done(8, "real validation with sabotage control", errors)


def main():
    report = Report()
    report.say("=== Phase 50 plan 04 pre-flight ===")

    proposed = lib.load_proposed()
    if proposed is None:
        report.say("fill/proposed.json does not exist yet -- checks 4-6 report 0 items checked.")

    non_english = check1_locale_set(report)
    check2_key_set_per_locale(report, non_english)
    check3_serialisation(report, non_english)
    check4_placeholder_parity(report, proposed)
    check5_glossary_survival(report, proposed)
    check6_no_empties(report, proposed)
    check7_insertion_points(report, non_english)
    check8_real_validation(report, proposed)

    report.say("")
    report.say(f"TOTAL: {report.total_errors} errors across 8 checks")

    sys.exit(0 if report.total_errors == 0 else 1)


if __name__ == "__main__":
    main()
