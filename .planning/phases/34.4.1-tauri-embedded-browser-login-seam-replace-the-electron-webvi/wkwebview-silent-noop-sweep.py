#!/usr/bin/env python3
"""WKWebView silent-no-op sweep (34.4.1 gap cycle 2, plan 28 — REQ-34.4.1-11/GAP-04/GAP-10).

WHAT THIS PROVES, AND WHAT IT CANNOT. Read both halves before trusting a row.

Proves (statically, from the real tree at run time — never a cached list):
  * which call sites in `src/frontend/**` and `src/preload/**` touch a browser API with a known
    Safari/WKWebView gap, and whether each site is GUARDED or UNGUARDED;
  * which `dispatch_rust_channel` arms in `src-tauri/src/main.rs` call a wry/Tauri method whose
    own vendored source carries a per-platform caveat, and what that caveat says;
  * whether a paired LIVE observation of that API already exists in this phase's
    `34.4.1-LIVE-GATE*.md` files or in the `spike-findings-gamelib` project skill.

CANNOT prove — this is the bound, and the bound is the point:
  whether any flagged API actually degrades silently, throws, or works correctly under WKWebView.
  WebKit is closed-source, and reading wry only tells you what Rust ASKED WebKit to do, not what
  WebKit did. `navigator.clipboard.writeText` RESOLVES and writes nothing; `queryLocalFonts`
  THROWS; `delete_cookie()` RESOLVES having deleted nothing. Three different runtime behaviours,
  statically indistinguishable. Every one of them was found by a human driving a UI, not by a
  scanner, and this scanner does not change that.

So the output document is a BACKLOG, not a verdict. `UNVERIFIED-LIVE` is the DEFAULT
classification and is never inferred away: it means "nobody has watched this one", which is a
statement about our evidence, not about the code. Each such row is a candidate for a future
targeted spike. Resolving them inline is explicitly out of scope (D-04/D-05 scope discipline);
plan 28's Task 1 acceptance criteria require `git diff --stat -- src/` to be EMPTY for this
task's commit, so the bound is enforced mechanically rather than by intent.

This follows the house pattern of its two siblings in this directory (`ported-channels-gate.py`,
`seam-parity-sweep.py`): a `fail()` helper, and a `--self-test` mode proving every discrimination
this script makes can actually reject the input it exists to reject (the Phase 34.2 gap cycle 4
lesson: 14 comment strippers that all passed vacuously). Self-test cases run through the SAME
functions used against the real tree, never a reimplementation.

Run `python3 wkwebview-silent-noop-sweep.py` to regenerate `34.4.1-WKWEBVIEW-NOOP-SWEEP.md`.
Run `python3 wkwebview-silent-noop-sweep.py --self-test` to prove the assertions are load-bearing.

Stdlib-only Python 3, matching both siblings. No third-party import may be added.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

PHASE_DIR = Path(__file__).parent
REPO_ROOT = PHASE_DIR.parent.parent.parent
SRC_DIR = REPO_ROOT / "src"
MAIN_RS = REPO_ROOT / "src-tauri" / "src" / "main.rs"
OUTPUT_PATH = PHASE_DIR / "34.4.1-WKWEBVIEW-NOOP-SWEEP.md"

SCAN_ROOTS = [SRC_DIR / "frontend", SRC_DIR / "preload"]

# Live-evidence sources. The plan named
# `references/tauri-chromium-only-web-apis.md` and `references/navigator-clipboard-noops-under-tauri`
# specifically; NEITHER FILE EXISTS -- the skill's references/ holds macos-steam-bridge.md,
# steam-native-install.md, tauri-login-webview-cookies.md and tauri-rearchitecture.md, and the
# clipboard/font records live inside those plus sources/**. Rather than hardcode two names that
# would silently match nothing, this walks the whole skill tree and this phase's gate documents.
LIVE_EVIDENCE_GLOBS = [
    (PHASE_DIR, "34.4.1-LIVE-GATE*.md"),
    (REPO_ROOT / ".claude" / "skills" / "spike-findings-gamelib", "**/*.md"),
]


def fail(message: str) -> None:
    print(f"SWEEP FAILED: {message}", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------------------------
# Axis 1 — the risky-API allowlist.
#
# ONE table, so the list is extensible in one place. Membership means "Safari/WKWebView is
# documented or observed to differ from Chromium here", NOT "this is broken". WKWebView tracks
# Safari's engine, so Chrome-only APIs are the risk surface.
# ---------------------------------------------------------------------------------------------

RISKY_JS_APIS: dict[str, str] = {
    "navigator.clipboard": (
        "Chromium's async clipboard. Under WKWebView `writeText` RESOLVES without writing "
        "(observed, this project)."
    ),
    "queryLocalFonts": (
        "Local Font Access API, Chromium-only. THROWS under WKWebView (observed, this project)."
    ),
    "navigator.usb": "WebUSB, Chromium-only. Absent in Safari/WKWebView.",
    "navigator.serial": "Web Serial, Chromium-only. Absent in Safari/WKWebView.",
    "navigator.bluetooth": "Web Bluetooth, Chromium-only. Absent in Safari/WKWebView.",
    "showOpenFilePicker": "File System Access API, Chromium-only. Absent in Safari/WKWebView.",
    "showSaveFilePicker": "File System Access API, Chromium-only. Absent in Safari/WKWebView.",
    "document.fonts": (
        "CSS Font Loading. Basic FontFace is supported; `check`/`ready` timing and the "
        "FontFaceSet iteration surface differ in WebKit."
    ),
    "Notification.requestPermission": (
        "Permission model differs; WKWebView may resolve without ever prompting the user."
    ),
    "navigator.mediaDevices": "getUserMedia/enumerateDevices gating differs materially in WebKit.",
    "webkitSpeechRecognition": "Prefixed Chromium API; not the WebKit-shipped surface.",
    "navigator.storage": "StorageManager estimate()/persist() differ in WebKit.",
    "ResizeObserver": (
        "Supported, but WebKit's delivery timing differs -- listed because layout-timing "
        "assumptions are how F-10 hid for a whole gate cycle."
    ),
}

# Guard shapes. A site is GUARDED when its ENCLOSING FUNCTION contains any of these. Deliberately
# generous about SHAPE and strict about SCOPE: a guard three functions away is not a guard.
GUARD_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("typeof-check", re.compile(r"typeof\s+[\w.]+\s*[!=]==\s*['\"](function|undefined)['\"]")),
    ("in-operator", re.compile(r"['\"][\w]+['\"]\s+in\s+(window|globalThis|navigator)")),
    ("try-catch", re.compile(r"\btry\s*\{[\s\S]*\bcatch\b")),
    ("named-predicate", re.compile(r"\b\w+(?:Safe|Available|Supported)\s*\(")),
    ("optional-chaining", re.compile(r"\bnavigator\s*\?\.|\bwindow\s*\?\.")),
    ("truthiness-guard", re.compile(r"\bif\s*\(\s*!?\s*(window\.|navigator\.)?[\w.]+\s*\)")),
]

FUNCTION_HEADER_RE = re.compile(
    r"(?:^|\n)[ \t]*(?:export\s+)?(?:default\s+)?(?:async\s+)?"
    r"(?:"
    # function foo(...): T {
    r"function\s+\w+\s*\([^()]*\)\s*(?::[^{;=]+)?"
    # const foo = (...) => {   /   const foo = async (...) => {
    r"|const\s+\w+\s*(?::[^=]+)?=\s*(?:async\s+)?\([^()]*\)\s*(?::[^={]+)?=>\s*"
    # method shorthand / object-literal member: foo(...) {
    r"|\w+\s*\([^()]*\)\s*(?::[^{;=]+)?"
    r")\s*\{"
)


def strip_ts_comments(source: str) -> str:
    """Blank out // and /* */ comments, PRESERVING line count and offsets.

    Replaces comment characters with spaces rather than deleting them so every later line/offset
    calculation stays truthful. String-literal-aware for `//` so a URL inside a quoted string is
    not mistaken for a comment (the WR-08 regression class recorded in
    src/backend/testUtils/stripSourceComments.ts).
    """
    out = list(source)
    i = 0
    n = len(source)
    state = None  # None | 'line' | 'block' | 'squote' | 'dquote' | 'tick'
    while i < n:
        c = source[i]
        nxt = source[i + 1] if i + 1 < n else ""
        if state is None:
            if c == "/" and nxt == "/":
                state = "line"
                out[i] = out[i + 1] = " "
                i += 2
                continue
            if c == "/" and nxt == "*":
                state = "block"
                out[i] = out[i + 1] = " "
                i += 2
                continue
            if c == "'":
                state = "squote"
            elif c == '"':
                state = "dquote"
            elif c == "`":
                state = "tick"
            i += 1
            continue
        if state == "line":
            if c == "\n":
                state = None
            else:
                out[i] = " "
            i += 1
            continue
        if state == "block":
            if c == "*" and nxt == "/":
                out[i] = out[i + 1] = " "
                state = None
                i += 2
                continue
            if c != "\n":
                out[i] = " "
            i += 1
            continue
        # inside a string literal
        if c == "\\":
            i += 2
            continue
        if (
            (state == "squote" and c == "'")
            or (state == "dquote" and c == '"')
            or (state == "tick" and c == "`")
        ):
            state = None
        i += 1
    return "".join(out)


def blank_string_contents(source: str) -> str:
    """Blank the INTERIOR of string/template literals, preserving length and line count.

    Hit detection runs on this. An API named inside a log message
    (`logError('queryLocalFonts threw')`) is a mention, not a call site, and counting it would
    inflate the backlog with rows nobody can act on -- the same vacuity failure in a new costume.
    Kept separate from strip_ts_comments so that function's WR-08 string-preserving behaviour,
    which its own self-test case pins, is unchanged.
    """
    out = list(source)
    i = 0
    n = len(source)
    quote = None
    while i < n:
        c = source[i]
        if quote is None:
            if c in "'\"`":
                quote = c
            i += 1
            continue
        if c == "\\":
            i += 2
            continue
        if c == quote:
            quote = None
            i += 1
            continue
        if c != "\n":
            out[i] = " "
        i += 1
    return "".join(out)


def enclosing_function_text(source: str, hit_index: int) -> tuple[str, bool]:
    """Return (text of the smallest function enclosing hit_index, found_a_real_function).

    Falls back to the whole file with found=False rather than guessing -- a fallback that silently
    widened the scope would make every site look guarded by some unrelated try/catch elsewhere.
    """
    best: tuple[int, int] | None = None
    for m in FUNCTION_HEADER_RE.finditer(source):
        brace = source.find("{", m.end() - 1)
        if brace == -1 or brace > hit_index:
            continue
        depth = 0
        end = None
        for i in range(brace, len(source)):
            if source[i] == "{":
                depth += 1
            elif source[i] == "}":
                depth -= 1
                if depth == 0:
                    end = i
                    break
        if end is None or end < hit_index:
            continue
        if best is None or (end - brace) < (best[1] - best[0]):
            best = (brace, end)
    if best is None:
        return source, False
    return source[best[0] : best[1] + 1], True


def classify_guard(scope_text: str) -> tuple[str, str]:
    """Return (GUARDED|UNGUARDED, reason)."""
    for name, pattern in GUARD_PATTERNS:
        if pattern.search(scope_text):
            return "GUARDED", name
    return "UNGUARDED", "no capability check, try/catch or named predicate in enclosing function"


def api_reference_regex(api: str) -> re.Pattern[str]:
    """`navigator.clipboard` -> matches the dotted reference; a bare name -> word-boundary match."""
    if "." in api:
        return re.compile(re.escape(api) + r"\b")
    return re.compile(r"(?<![\w.])" + re.escape(api) + r"\b")


def scan_js_axis() -> list[dict]:
    hits: list[dict] = []
    for root in SCAN_ROOTS:
        if not root.exists():
            fail(f"scan root {root} does not exist")
        for path in sorted(root.rglob("*")):
            if path.suffix not in {".ts", ".tsx"} or not path.is_file():
                continue
            if "__tests__" in path.parts or path.name.endswith(".test.ts"):
                continue
            raw = path.read_text(encoding="utf-8")
            code = blank_string_contents(strip_ts_comments(raw))
            for api, why in RISKY_JS_APIS.items():
                for m in api_reference_regex(api).finditer(code):
                    scope, found = enclosing_function_text(code, m.start())
                    verdict, reason = classify_guard(scope)
                    hits.append(
                        {
                            "api": api,
                            "why": why,
                            "file": str(path.relative_to(REPO_ROOT)),
                            "line": code[: m.start()].count("\n") + 1,
                            "guard": verdict,
                            "guard_reason": reason
                            + ("" if found else " (NO enclosing function found — whole-file scope)"),
                        }
                    )
    return hits


# ---------------------------------------------------------------------------------------------
# Axis 2 — Rust dispatch arms calling a wry/Tauri method with a per-platform caveat.
# ---------------------------------------------------------------------------------------------

CAVEAT_KEYWORDS = ("macos", "windows", "not supported", "always returns", "unsupported", "no-op")
ARM_RE = re.compile(r'^\s{4,}"([a-z0-9_]+)"\s*=>\s*\{', re.MULTILINE)
RUST_METHOD_CALL_RE = re.compile(r"\.(\w+)\s*\(")


def find_wry_source() -> Path | None:
    """Locate the vendored wry crate. Returns None if absent -- reported, never silently empty."""
    registry = Path.home() / ".cargo" / "registry" / "src"
    if not registry.exists():
        return None
    candidates = sorted(registry.glob("*/wry-*/src"))
    return candidates[-1] if candidates else None


def collect_wry_caveats(wry_src: Path) -> dict[str, str]:
    """Map wry method name -> the caveat sentence found in its own doc comment."""
    caveats: dict[str, str] = {}
    for path in sorted(wry_src.rglob("*.rs")):
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        doc: list[str] = []
        for line in lines:
            s = line.strip()
            if s.startswith("///"):
                doc.append(s[3:].strip())
                continue
            m = re.match(r"(?:pub\s+)?(?:unsafe\s+)?fn\s+(\w+)", s)
            if m and doc:
                blob = " ".join(doc)
                low = blob.lower()
                for kw in CAVEAT_KEYWORDS:
                    if kw in low:
                        name = m.group(1)
                        if name not in caveats:
                            caveats[name] = blob[:400]
                        break
            doc = []
    return caveats


def scan_rust_axis(main_rs_text: str, caveats: dict[str, str]) -> list[dict]:
    arms = list(ARM_RE.finditer(main_rs_text))
    rows: list[dict] = []
    for idx, m in enumerate(arms):
        start = m.end()
        end = arms[idx + 1].start() if idx + 1 < len(arms) else len(main_rs_text)
        body = main_rs_text[start:end]
        seen: set[str] = set()
        for cm in RUST_METHOD_CALL_RE.finditer(body):
            method = cm.group(1)
            if method in caveats and method not in seen:
                seen.add(method)
                rows.append(
                    {
                        "arm": m.group(1),
                        "line": main_rs_text[: m.start()].count("\n") + 1,
                        "method": method,
                        "caveat": caveats[method],
                    }
                )
    return rows


# ---------------------------------------------------------------------------------------------
# Live cross-reference. UNVERIFIED-LIVE is the default and is never inferred away.
# ---------------------------------------------------------------------------------------------


def load_live_evidence() -> list[tuple[str, str]]:
    docs: list[tuple[str, str]] = []
    for base, pattern in LIVE_EVIDENCE_GLOBS:
        if not base.exists():
            continue
        for path in sorted(base.glob(pattern)):
            if path.is_file():
                docs.append((str(path.relative_to(REPO_ROOT)), path.read_text(encoding="utf-8", errors="replace")))
    return docs


# A live observation is a RECORD OF SOMEONE WATCHING IT, not a mention. Requiring an observation
# word near the token is the difference between "cookie appears in this document" (true of nearly
# every file in this phase) and "someone observed this API's behaviour". Without this, the sweep
# classifies everything VERIFIED-LIVE and the whole instrument becomes vacuous -- which is exactly
# what the first run of this script did, before this bar was added.
OBSERVATION_WORDS = (
    "observed", "observation", "live gate", "measured", "reproduced", "confirmed live",
    "spike", "hardware", "verified live", "witnessed", "live-proven", "live proven",
)
OBSERVATION_WINDOW = 600


def classify_live(token: str, docs: list[tuple[str, str]]) -> tuple[str, str]:
    """Return (VERIFIED-LIVE|UNVERIFIED-LIVE, where).

    UNVERIFIED-LIVE is the default and the only classification reachable without positive
    evidence. Requires the FULL token (not its last dotted segment) AND an observation word
    within OBSERVATION_WINDOW characters.
    """
    return classify_live_any([token], docs)


def classify_live_any(tokens: list[str], docs: list[tuple[str, str]]) -> tuple[str, str]:
    """VERIFIED-LIVE if ANY token appears near an observation word."""
    for token in tokens:
        verdict, where = _classify_one(token, docs)
        if verdict == "VERIFIED-LIVE":
            return verdict, where
    return "UNVERIFIED-LIVE", "\u2014"


def _classify_one(token: str, docs: list[tuple[str, str]]) -> tuple[str, str]:
    needle = token.lower()
    for name, text in docs:
        low = text.lower()
        start = 0
        while True:
            idx = low.find(needle, start)
            if idx == -1:
                break
            window = low[max(0, idx - OBSERVATION_WINDOW) : idx + OBSERVATION_WINDOW]
            if any(w in window for w in OBSERVATION_WORDS):
                return "VERIFIED-LIVE", name
            start = idx + len(needle)
    return "UNVERIFIED-LIVE", "—"


# ---------------------------------------------------------------------------------------------
# The four known instances, for reader calibration: what a scanner caught vs what a human did.
# ---------------------------------------------------------------------------------------------

KNOWN_INSTANCES = [
    (
        "`navigator.clipboard.writeText`",
        "Resolves without writing",
        "Live gate (human)",
        "CLOSED — replaced by `window.api.clipboardWriteText`; no code reference remains in `src/`.",
    ),
    (
        "`queryLocalFonts`",
        "Throws",
        "Live gate (human)",
        "CLOSED — plan 27 extracted `queryLocalFontsSafe()`, which guards both failure shapes.",
    ),
    (
        "`delete_cookie()` (wry)",
        "Resolves having deleted nothing",
        "Live gate (human)",
        "F-6 — see `34.4.1-LIVE-GATE-RERUN.md`; the shared Rust arm's bug hits every caller.",
    ),
    (
        "Login window title (process-level)",
        "Assumed default Tauri behaviour, never spiked",
        "Code review",
        "Plan 24 wired `on_document_title_changed`; the live half is plan 29's to observe.",
    ),
]


def render_document(js_hits, rust_rows, wry_status, docs) -> str:
    out: list[str] = []
    a = out.append
    a("# WKWebView silent-no-op sweep — BACKLOG, not a verdict")
    a("")
    a("<!-- GENERATED by wkwebview-silent-noop-sweep.py. Do not hand-edit: fix the script and")
    a("     re-run, per the standing instruction in 34.4.1-SEAM-PARITY-SWEEP.md's addendum. -->")
    a("")
    a("## Read this before acting on any row")
    a("")
    a("**Static analysis cannot determine whether a flagged API degrades silently, throws, or")
    a("works.** WebKit is closed-source, and reading wry's source only shows what Rust *asked*")
    a("WebKit to do — not what WebKit did. This project has already seen all three behaviours from")
    a("APIs that look identical in source: `navigator.clipboard.writeText` resolves and writes")
    a("nothing, `queryLocalFonts` throws, and `delete_cookie()` resolves having deleted nothing.")
    a("")
    a("Every row below is therefore **a candidate for a future targeted spike, not a defect")
    a("claim.** `UNVERIFIED-LIVE` means *nobody has watched this one* — a statement about our")
    a("evidence, not about the code. Resolving these inline is out of scope by construction; plan")
    a("28 requires `git diff --stat -- src/` to be empty for the commit that generated this file.")
    a("")
    a("## Axis 1 — JS/TS call sites against the risky-API allowlist")
    a("")
    a(f"Scanned `src/frontend/**` and `src/preload/**` ({len(RISKY_JS_APIS)} APIs on the allowlist).")
    a("Comments and `__tests__` are excluded, so prose mentioning an API is not a hit.")
    a("")
    if js_hits:
        a("| API | File | Line | Guard | Live evidence | Where |")
        a("|-----|------|------|-------|---------------|-------|")
        for h in js_hits:
            a(
                f"| `{h['api']}` | `{h['file']}` | {h['line']} | **{h['guard']}** "
                f"({h['guard_reason']}) | **{h['live']}** | {h['live_where']} |"
            )
    else:
        a("_No code references to any allowlisted API remain in the scanned tree._")
    a("")
    a("### Allowlist entries with no code reference")
    a("")
    a("Recorded explicitly: absence is a result. An API that was remediated (clipboard) and one")
    a("that was never used look identical here, so the closing section distinguishes them.")
    a("")
    present = {h["api"] for h in js_hits}
    for api in RISKY_JS_APIS:
        if api not in present:
            a(f"- `{api}` — no reference in scanned source. {RISKY_JS_APIS[api]}")
    a("")
    a("## Axis 2 — Rust `dispatch_rust_channel` arms calling a caveated wry/Tauri method")
    a("")
    a(wry_status)
    a("")
    if rust_rows:
        a("| Arm | main.rs line | Method | Live evidence | Caveat found in vendored source |")
        a("|-----|--------------|--------|---------------|----------------------------------|")
        for r in rust_rows:
            caveat = r["caveat"].replace("|", "\\|")
            a(
                f"| `{r['arm']}` | {r['line']} | `{r['method']}()` | **{r['live']}** | {caveat} |"
            )
    else:
        a("_No arm calls a method whose vendored doc comment carries a per-platform caveat._")
    a("")
    a("## The four known instances — calibration")
    a("")
    a("What this tool would have caught versus what a human found by driving a UI. Three of the")
    a("four were found live; none was found by a scanner. That ratio is the honest measure of what")
    a("a static sweep is worth here.")
    a("")
    a("| Instance | Runtime behaviour | Found by | Status after this cycle |")
    a("|----------|-------------------|----------|--------------------------|")
    for name, behaviour, found_by, status in KNOWN_INSTANCES:
        a(f"| {name} | {behaviour} | {found_by} | {status} |")
    a("")
    a(f"_Cross-referenced {len(docs)} live-evidence document(s)._")
    a("")
    return "\n".join(out)


# ---------------------------------------------------------------------------------------------
# Self-test — every discrimination must be shown capable of rejecting its bad input.
# ---------------------------------------------------------------------------------------------


def self_test() -> None:
    cases = 0

    def check(label: str, condition: bool) -> None:
        nonlocal cases
        cases += 1
        if not condition:
            fail(f"self-test case FAILED: {label}")
        print(f"  ok: {label}")

    print("Self-test: proving each discrimination rejects the input it exists to reject.\n")

    guarded = """
    export async function queryLocalFontsSafe(defaults) {
      if (typeof queryLocalFonts !== 'function') { return defaults }
      try { return await queryLocalFonts() } catch (e) { return defaults }
    }
    """
    unguarded = """
    export async function getFonts() {
      const fonts = await queryLocalFonts()
      return fonts.map((f) => f.family)
    }
    """

    idx = guarded.index("queryLocalFonts(")
    scope, found = enclosing_function_text(guarded, idx)
    check("a guarded call site resolves to a real enclosing function", found)
    check(
        "a guarded call site is classified GUARDED",
        classify_guard(scope)[0] == "GUARDED",
    )

    idx = unguarded.index("queryLocalFonts(")
    scope_u, _ = enclosing_function_text(unguarded, idx)
    check(
        "an UNGUARDED call site is classified UNGUARDED (the discrimination is not vacuous)",
        classify_guard(scope_u)[0] == "UNGUARDED",
    )

    check(
        "the guarded and unguarded fixtures resolve to DIFFERENT scopes — a whole-file fallback "
        "would make both look guarded",
        scope != scope_u,
    )

    check(
        "a hit with no live cross-reference is classified UNVERIFIED-LIVE, not omitted",
        classify_live("navigator.serial", [("x.md", "nothing relevant here")])[0]
        == "UNVERIFIED-LIVE",
    )
    check(
        "a hit WITH a live cross-reference (token + observation word) is classified VERIFIED-LIVE",
        classify_live(
            "navigator.clipboard",
            [("gate.md", "we observed that navigator.clipboard resolves without writing")],
        )[0]
        == "VERIFIED-LIVE",
    )
    check(
        "a backticked code reference near an observation word also counts -- 34.4.1-LIVE-GATE.md "
        "records F-6's real observation as `delete_cookie` with no parens",
        classify_live_any(
            ["delete_cookie(", "`delete_cookie`"],
            [("gate.md", "observed: `delete_cookie` reports success and deletes nothing")],
        )[0]
        == "VERIFIED-LIVE",
    )

    commented = "// navigator.clipboard.writeText('x')\nconst a = 1\n"
    check(
        "an API named only inside a comment is NOT a hit",
        not api_reference_regex("navigator.clipboard").search(strip_ts_comments(commented)),
    )
    check(
        "comment stripping preserves line count, so reported line numbers stay truthful",
        strip_ts_comments(commented).count("\n") == commented.count("\n"),
    )
    check(
        "a `//` inside a string literal is NOT treated as a comment (WR-08 regression class)",
        "https" in strip_ts_comments('const u = "https://x/y"\nnavigator.serial\n'),
    )

    check(
        "an API named only inside a STRING LITERAL is NOT a hit (a log message is a mention, "
        "not a call site)",
        not api_reference_regex("queryLocalFonts").search(
            blank_string_contents(strip_ts_comments("logError('queryLocalFonts threw')\n"))
        ),
    )
    check(
        "a token present in a document with NO observation word stays UNVERIFIED-LIVE",
        classify_live(
            "navigator.clipboard", [("d.md", "we might one day use navigator.clipboard here")]
        )[0]
        == "UNVERIFIED-LIVE",
    )

    arms_fixture = '''
        "humble_login_clear_cookies" => {
            store.delete_cookie(&url)?;
        }
        "other_arm" => {
            something_else();
        }
'''
    rows = scan_rust_axis(arms_fixture, {"delete_cookie": "macOS: always returns Ok"})
    check(
        "a short generic method name does NOT reach VERIFIED-LIVE off bare prose -- the `method(` "
        "form is required",
        classify_live(
            "build(", [("d.md", "we observed the build process and it was fine")]
        )[0]
        == "UNVERIFIED-LIVE",
    )
    check(
        "a dispatch arm calling a caveated wry method is detected",
        len(rows) == 1 and rows[0]["arm"] == "humble_login_clear_cookies",
    )
    check(
        "an arm calling only uncaveated methods produces no row",
        not scan_rust_axis(arms_fixture, {"nonexistent_method": "x"}),
    )

    check(
        "UNVERIFIED-LIVE appears in a rendered document containing an unverified row",
        "UNVERIFIED-LIVE"
        in render_document(
            [
                {
                    "api": "navigator.serial",
                    "why": "x",
                    "file": "f.ts",
                    "line": 1,
                    "guard": "UNGUARDED",
                    "guard_reason": "none",
                    "live": "UNVERIFIED-LIVE",
                    "live_where": "—",
                }
            ],
            [],
            "wry status",
            [],
        ),
    )

    print(f"\nAll {cases} self-test case(s) passed — every discrimination is load-bearing.")


def main() -> None:
    if "--self-test" in sys.argv:
        self_test()
        print("\nSELF-TEST OK.")
        sys.exit(0)

    if not MAIN_RS.exists():
        fail(f"{MAIN_RS} does not exist")

    docs = load_live_evidence()
    if not docs:
        fail("no live-evidence documents found — cross-reference would be vacuously UNVERIFIED")

    js_hits = scan_js_axis()
    for h in js_hits:
        h["live"], h["live_where"] = classify_live(h["api"], docs)

    wry_src = find_wry_source()
    if wry_src is None:
        wry_status = (
            "> **AXIS NOT SCANNED.** The vendored wry crate was not found under "
            "`~/.cargo/registry/src`. This axis reports nothing — which is NOT the same as "
            "finding nothing. Re-run after `cargo fetch`."
        )
        rust_rows: list[dict] = []
    else:
        caveats = collect_wry_caveats(wry_src)
        rust_rows = scan_rust_axis(MAIN_RS.read_text(encoding="utf-8"), caveats)
        for r in rust_rows:
            # `method(` not a bare `method`: short plumbing names like `build` occur constantly
            # in prose, and matching them bare classified every Rust row VERIFIED-LIVE on the
            # first run -- the vacuity failure this instrument exists to avoid, reappearing on
            # the other axis.
            # Two accepted forms, both deliberate code references rather than prose: `method(`
            # and a backticked `method`. Bare-word matching classified every row VERIFIED-LIVE on
            # the first run (`build` occurs constantly in prose); `method(`-only then MISSED F-6's
            # own real observation, which 34.4.1-LIVE-GATE.md writes as `delete_cookie` with no
            # parens. Both failures were found by checking the output against known ground truth
            # rather than by trusting the rule.
            r["live"], r["live_where"] = classify_live_any(
                [f"{r['method']}(", f"`{r['method']}`"], docs
            )
        wry_status = (
            f"Scanned `{wry_src.relative_to(Path.home())}` — {len(caveats)} method(s) carry a "
            f"per-platform caveat in their own doc comment."
        )

    OUTPUT_PATH.write_text(render_document(js_hits, rust_rows, wry_status, docs), encoding="utf-8")

    unverified = sum(1 for h in js_hits if h["live"] == "UNVERIFIED-LIVE") + sum(
        1 for r in rust_rows if r.get("live") == "UNVERIFIED-LIVE"
    )
    print(
        f"OK: {len(js_hits)} JS hit(s), {len(rust_rows)} Rust arm row(s), {unverified} "
        f"UNVERIFIED-LIVE. Wrote {OUTPUT_PATH.name}."
    )
    sys.exit(0)


if __name__ == "__main__":
    main()
