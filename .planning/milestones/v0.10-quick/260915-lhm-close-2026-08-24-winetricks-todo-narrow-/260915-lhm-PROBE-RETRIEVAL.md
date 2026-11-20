# searchProbe.ts: drive and retrieval

Instrument: `src/frontend/components/UI/SearchBar/searchProbe.ts`. Default-OFF,
self-contained, produces **no diagnosis**. This document is the one-pass operator drive
and the sqlite retrieval that turns its durable localStorage record into an answer for:

- `.planning/todos/pending/2026-08-26-winetricks-package-selection-is-temperamental-hover-and-search.md`
  (Half A — search filtering; Half B — hover highlight; the F-4 contrast hypothesis)
- `.planning/todos/pending/2026-08-30-library-search-bar-suggestions-are-mouse-dead-until-a-tab-press.md`
  (the Library consumer's mouse-dead symptom)

Building or editing `SearchBar`/its consumers, then reasoning about the result, is exactly
the failure mode this project has already hit three times on this same surface (IPC
transport, then `:focus-within`, then a parent remount). This instrument exists so the next
step is a live measurement, not a fourth theory read off the code.

## 1. One-pass operator drive

Run everything below in a **single** `pnpm tauri:dev` session. Restarting the app between
steps clears the arm (localStorage survives a reload of the same origin, but not
necessarily a full process relaunch depending on which origin loads first — simplest to do
it all in one sitting).

1. Launch the dev build: `pnpm tauri:dev`. Wait for the window to appear ([[tauri-dev-serves-stale-static-bundle]] — if you already have a stale window open from a previous session, quit it first; [[tauri-dev-noops-against-a-running-instance]]).
2. Open the **Library** search bar (top of the Library screen) and type the literal text
   `::probe-on` into it. Do not worry about it also being treated as a search query — arming
   is checked on every keystroke regardless of what else the value does.
3. **Confirm the badge**: a small dark badge reading `SEARCHPROBE armed · g0 · 0 rec` should
   appear pinned to the bottom-right corner of the window, drawn directly onto
   `document.body` (outside the React tree, so it survives any Library re-render).
   - If it does NOT appear: STOP. Do not proceed to "prove nothing happened" — this is
     itself a finding (the arm command didn't reach the input, or JS on this surface is
     not running at all) and should be written up as its own result, not silently retried
     until it appears.
4. Clear the search box (the "x" clear button, or select-all + delete).
5. Type a real query that will produce Library suggestions — enough of a game title to get
   at least 2-3 rows in the dropdown.
6. **Drive the pointer sequence** exactly as the operator originally described it (both
   todos carry a version of this): move the mouse down into the suggestion list from
   outside it, hover slowly across two or three rows pausing about a second on each, then
   attempt to click one.
7. If the click did not appear to do anything (the mouse-dead symptom), **press Tab** once
   without touching the mouse, then attempt the click again on the same row.
8. Repeat steps 4-7 once for the **Winetricks** search box (open Settings → Wine/Winetricks,
   or wherever the Winetricks panel is reached in the current build) so both consumers are
   captured in the same sitting. The badge's gesture counter (`g<N>`) should visibly
   increment after each completed mousedown.
9. Watch the badge for a `TRUNC` suffix. If it appears, the 1500-record cap was hit and the
   oldest records were evicted — note the record count at that point; it is a hard cap, not
   a silent loss (`meta.dropped` is retrievable too, see step 4 below).
10. Quit the app fully (Cmd+Q, not just closing the window) so the sqlite WAL flushes.
    `kill -9` also works and is what the localStorage memory note verifies against, but a
    clean quit is simpler here.

Typing `::probe-on` again while already armed is a no-op (arming is idempotent). To
disarm and wipe the log without touching the app's own data, type `::probe-off` before
quitting — this clears `gamelib.searchProbe`, `gamelib.searchProbe.log`,
`gamelib.searchProbe.meta`, and `gamelib.searchProbe.armed`, and removes the badge.
Skip this if you intend to retrieve the log in the next section.

## 2. Retrieval (sqlite, app closed)

Per [[read-webkit-localstorage-sqlite-directly]], three traps apply here unchanged:

```bash
# Trap 1: WebsiteData/LocalStorage/ is an empty decoy. Find every real localstorage.sqlite3
# under WebsiteData/Default/, across every origin GameLib's dev/packaged builds have used.
find ~/Library/WebKit/gamelib-shell ~/Library/WebKit/com.gamelib.shell \
     -path '*/WebsiteData/Default/*' -name localstorage.sqlite3 -print0 \
  | xargs -0 ls -la

# Trap 3: several origins can hold the key. Pick the DB whose sibling -wal file has the
# most recent mtime -- that is the one the just-closed session actually wrote to.
find ~/Library/WebKit/gamelib-shell ~/Library/WebKit/com.gamelib.shell \
     -path '*/WebsiteData/Default/*' -name 'localstorage.sqlite3-wal' -print0 \
  | xargs -0 ls -la | sort -k6,7
# Take the DB matching the newest -wal. Confirm it moved: re-run the drive once more and
# check the mtime advances on the SAME file before trusting it.
DB="<path/to/the-newest/localstorage.sqlite3>"
```

Pull all four keys this instrument writes:

```bash
sqlite3 "$DB" "select key, hex(value) from ItemTable where key like 'gamelib.searchProbe%';"
```

Expect four rows: `gamelib.searchProbe` (the `1` arm flag), `gamelib.searchProbe.armed`
(the nonce/href/timestamp arm-time proof), `gamelib.searchProbe.log` (the JSON array of
records), `gamelib.searchProbe.meta` (`{"dropped": N}`).

Decode each value (Trap 2 — these are UTF-16LE, `cast(value as text)` truncates at the
first NUL):

```bash
python3 - "$DB" <<'PY'
import sqlite3, sys, binascii, json
db = sys.argv[1]
con = sqlite3.connect(db)
for key, hexval in con.execute(
    "select key, hex(value) from ItemTable where key like 'gamelib.searchProbe%'"
):
    raw = binascii.unhexlify(hexval).decode('utf-16-le')
    print(f"--- {key} ---")
    if key == 'gamelib.searchProbe.log':
        records = json.loads(raw)
        print(f"{len(records)} records")
        for r in records:
            print(r)
    else:
        print(raw)
PY
```

**A `0 rec` result (or the key absent entirely) is a hard finding, not a failed run.**
It means either the arm command never reached this module (check the badge screenshot
from the live drive first) or `SearchBar` never mounted a `<ul>` for the consumer being
tested (e.g. the value was empty the whole time). Do not re-run the drive hoping for a
different number without first checking which of those two it was — see
[[a-repro-transcribed-into-prose-can-drop-its-env-var]] and
[[picker-driven-gate-run-can-measure-nothing]] for why a silent empty result is worth
explaining, not discarding.

## 3. How to read the result

| Capture | What to look at | Kills / supports |
|---|---|---|
| C-1 hover (`kind: 'hover'`) | `matchesHover` per row, `contrastHighlightVsSurround` | If `matchesHover: true` but `contrastHighlightVsSurround` is close to `1.0`: **supports F-4** — the row is highlighting, just invisibly. If `matchesHover` never goes `true` while the mouse is visibly over a row: **kills F-4**, the CSS `:hover` pseudo-class itself is not matching — a pointer-events or overlay problem, not a colour one. |
| C-2 pointer sequence (`pointerdown`/`mousedown`/`mouseup`/`click`, `origin: 'ul'` vs `'document'`) | Whether all four fire, and whether `document`-origin `mouseup`/`click` share a `targetDescriptor` with the `ul`-origin `mousedown`'s row | A `mousedown` on a row followed by a `document` `mouseup`/`click` on a **different, non-row** element reproduces the exact `366e719bb` shape (remount mid-gesture) on a new consumer. Matching targets throughout with no `click` recorded at all is a different failure (something suppressing the synthesized `click`). |
| C-3 focus/DOM sampling (`kind: 'focus-sample'`, sampled every `requestAnimationFrame` from mousedown through 100ms past mouseup or a 600ms hard cap) | `activeElementDescriptor`, `focusWithin`, `ulConnected`, `ulDisplay` | `focusWithin` flipping to `false` mid-sequence reproduces the ORIGINAL (already-disproven-once, per `SearchBar/index.tsx`'s own retraction comment) focus-race theory — on Library, not winetricks, this has never been checked. `ulConnected` flipping to `false` mid-sequence reproduces the `366e719bb` remount shape without needing the MutationObserver records at all. |
| C-4 hit-testing (`kind: 'hit-test'`, captured at the same instant as the `mousedown`) | `elementFromPointIsRow`, `elementsFromPointTop5` | If `elementFromPointIsRow` is `false` **at mousedown itself** (not just at mouseup), the pointer was never over the row the visual layout suggests — a stacking/overlay problem, independent of any later remount. `elementsFromPointTop5` shows what IS there instead. |
| C-5 mount/unmount (`kind: 'mutation'`, both on the `<ul>` itself and its parent, `sinceMousedown` in ms) | `ulWasRemoved`, `added`/`removed` counts, `sinceMousedown` | A `ul-parent` mutation with `added`/`removed` > 0 and `sinceMousedown` in the single-digit-to-low-double-digit milliseconds range reproduces the `366e719bb` timing signature (~4ms) on whichever consumer is being driven. No mutation at all during the gesture window rules out a remount entirely for that drive. |
| C-6 Tab-key before/after (`kind: 'tab-before'` / `'tab-after-raf'` / `'tab-after-50ms'`) | `activeElementDescriptor`, `ulConnected`, `ulDisplay` across the three samples | This is what the 2026-08-30 todo's title describes directly ("mouse-dead until a Tab press") — compare the `tab-before` sample (should match whatever C-3 last recorded) against `tab-after-50ms`. A `ulConnected`/`ulDisplay`/`activeElementDescriptor` change here that a mousedown alone never produced is direct evidence for whatever Tab does differently. |

**Negative controls are informative.** A drive where nothing anomalous shows up in any of
C-1 through C-6 — hover matches, contrast is high, targets agree throughout, no remount,
nothing changes at Tab — is itself worth recording: it says the symptom either did not
reproduce on that attempt, or the two consumers (Library vs Winetricks) diverge, which is
exactly the open question in `## What remains — Half B` of the 2026-08-26 todo.

## 4. What this instrument does NOT do

- It does not diagnose. Nothing above is a conclusion; it is a reading guide for records
  this instrument produces.
- It does not fix `SearchBar`, `LibrarySearchBar`, or either search consumer.
- It does not touch or amend the `ROOT CAUSE FOUND` retraction comment in
  `SearchBar/index.tsx`.
- It is out of scope for the winetricks browse-UI redesign entirely.

## 5. Removal

Grep `SEARCHPROBE-REMOVE-ME` across the tree for every site (`searchProbe.ts`'s own header,
`SearchBar/index.tsx`'s import/ref/effect, this document, and
`searchProbeContrast.test.ts`'s header comment). `searchProbe.ts`'s own file header carries
the exact two-step recipe.
