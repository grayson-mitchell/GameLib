# Operator run-sheet: 38-E03(a) / 38-E04(a), macOS

This sitting is a deliberate REAL-PROFILE arm per `<two_profile_declaration>`: it measures the
operator's real signed-in store session under real System Settings scale factors, and an isolated
fake profile would make every reading here blind — there is no store content, no real window
geometry under a real login, and no real HiDPI setting to measure on a throwaway profile.

No agent performs any step below. The operator reads this file top to bottom and runs every
command by hand, in a terminal, and every gesture by hand, in the GameLib app or a browser window.
`evidence/instrument-selfproof.md` already proved the instrument against generated ground truth;
this run-sheet is what points that proven instrument at the real embed.

## Step 0a — Confirm the tree under test, BEFORE launching anything

Added 2026-10-01, before any measurement. The venue decides what this gate can see, and on this
repo it has already done so twice: a Phase 38 sitting nearly ran against a 2026-09-23
`/Applications` bundle that could not emit the line it was looking for, and this task's own commits
briefly landed on `quick-260930-feh`, a branch whose `d71269c2a` rewrites the exact effect being
measured.

1. `git rev-parse --abbrev-ref HEAD` — this MUST print `main`. If it prints anything else, STOP and
   switch; do not score a run taken on another branch.
2. `git rev-parse --short HEAD` — write the sha into the verdict's header. The claim is about THAT
   commit, not about "the app".
3. `git log --oneline -1 --format=%h b4517366e` must resolve, and
   `git merge-base --is-ancestor b4517366e HEAD` must exit 0 — this confirms the drag-resize fix
   `38-E04(a)` re-measures is actually present in the tree you are about to build.
4. `git merge-base --is-ancestor d71269c2a HEAD` must exit **non-zero** — this confirms the
   feh-only re-arm commit is ABSENT, which is what makes this the `main` arm rather than a
   mixed one.
5. Build from this tree. A stale `build/main/sidecar.js` or an installed `/Applications/GameLib.app`
   is NOT this tree — `pnpm tauri:dev` rebuilds the sidecar on launch, which is why step 1 below
   launches the dev app and not the installed one.

## Step 0 — Live positive control, BEFORE anything is scored

1. Launch the GameLib app by hand.
2. Activate it so its Space is frontmost. An inactive Space makes every `winrect` reading garbage
   (`kCGWindowIsOnscreen` goes absent) — this is the inactive-Space hazard Task 2's Limits section
   names, and it is why this step comes first.
3. Open a store route in the app.
4. Open the Web Inspector on the GameLib window (not the embedded store page's own inspector) and
   paste `slotprobe.js` into its console. Confirm it resolves `.WebView__embedSlot` — it throws
   loudly if it does not, with a message naming the wrong-window hazard directly.
5. Measure the background colour with `edgeprobe bgsample` so later `edges`/`sample` calls use the
   panel's real background, not an assumed one.
6. Change the window size by a KNOWN delta: prefer AX set-size on the app's window 1
   (programmatic), falling back to a hand drag with the achieved size read back from
   `slotprobe.js`'s recorded rect if AX set-size is unavailable.
7. Confirm that BOTH the renderer slot rect (from `slotprobe.js`) AND the pixel edge locator
   (`edgeprobe edges` against a still taken at the new size) moved by that known delta.
8. **If the locator does not move, STOP. The instrument is blind and nothing below may be
   scored.** Do not proceed to step 1.
9. Record the delta the locator actually saw.
10. If Task 2's Arm 4 (capture cadence) came back MISSING in `evidence/instrument-selfproof.md`,
    also measure and record the achieved sampler cadence here, by hand, from a short
    `edgeprobe sample` run against this window — step 2 below depends on knowing that ceiling.

## Step 1 — `38-E03` pass

For the default "looks like" setting, plus at least two others, plus any non-HiDPI mode the panel
offers (this is the only way to obtain a scale-factor-1.0 comparator on this hardware):

1. Set the "looks like" resolution in System Settings.
2. `mark()` the probe with a label naming the setting.
3. Take the H1 readings: `slotprobe.js`'s `devicePixelRatio`, and the capture scale derived from
   `edgeprobe shot`'s width/height against the requested logical rect.
4. Walk a list of window widths chosen to make the slot's logical coordinates fractional,
   capturing a still (`edgeprobe shot` + `edges`) at each width. The slot rect's fractionality is
   OBSERVED from `slotprobe.js` at each width — never assumed from the width alone.
5. Finish the six-change loop back at the starting geometry, for H3.

## Step 2 — `38-E04` pass

Run the gesture in the shape the item specifies, with `edgeprobe sample` running throughout:
wider then narrower, once slowly and once quickly. All four combinations (wide/slow, wide/fast,
narrow/slow, narrow/fast) are mandatory, not a menu — the operator's first report on the original
defect was "resize is smooth," and it became a FAIL only under this full gesture shape.

## Step 3 — the browser A/B

Perform the identical gesture (wider/narrower, slow/fast) in a stock browser window on the same
hardware, sampled with the same locator (`edgeprobe sample` against the browser window's bounds).
This is the instrument that detected the original defect, and it is a required arm, not optional
corroboration.

## Step 4 — record the operator's verbatim words

Write down what you saw, in your own words, verbatim — not paraphrased into a pass or fail. Note
any visible lag, tearing, or stale-geometry frames, and at which of the four gesture combinations
they appeared, if any.

## Step 5 — reduce and fill the verdict

Run `analyze.mjs` against the `sample` JSONL from steps 2 and 3, and the captured stills from step
1 (assembled by hand into a `stills.json` per `analyze.mjs`'s own usage comment). Then fill
`evidence/e03a-e04a-verdict.md` by hand, item by item, against `e03a-prediction.md` and
`e04a-prediction.md`. No agent fills this file.

## Step 6 — Capture hygiene before committing anything

The stills captured in steps 1-3 are full-window captures of a logged-in store page and carry the
operator's account identity, personalization and possibly a session-bearing URL in the pixels — no
text redaction touches that. Before any commit:

1. Crop every still to the slot band only, OR
2. Redact the account-identifying regions, OR
3. Keep the raw capture out of the commit entirely and record its SHA-256 hash instead.

The `260913-901` precedent is 103 MB of unredacted captures left on disk despite a written
instruction to delete them — this step is a numbered step for that reason, not a footnote.
