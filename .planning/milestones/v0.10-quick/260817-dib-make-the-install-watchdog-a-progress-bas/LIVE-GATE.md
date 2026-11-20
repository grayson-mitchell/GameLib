# LIVE-GATE: no-progress install watchdog (quick task 260817-dib)

Jest proves the stall LOGIC under fake timers (`installStallWatchdog.test.ts`,
`downloadmanager/__tests__/utils.test.ts`); it cannot prove the REAL property,
which is elapsed WALL-CLOCK time against a real multi-GB download. This
document is the operator recipe that closes that gap. The operator runs this
as part of phase 23 wave 10 -- this plan is NOT `blocking-human`.

Both gates use the harness scripts copied into this quick task's own
`abort-gate/` directory (copied here rather than mutating the sibling todo's
evidence harness in place):

- `abort-gate/monitor-abort-gate.sh` -- the ORIGINAL script, used UNMODIFIED
  for Gate B (it already proves "a genuine stall still aborts").
- `abort-gate/monitor-abort-gate-gateA.sh` -- an INVERTED variant for Gate A
  (see the "Gate A harness inversion" section below for exactly what
  changed and why).

## Preconditions

1. Build a version of the app containing this change: `pnpm tauri:dev` --
   **never** bare `tauri dev`, which serves a stale static bundle (see the
   Tauri gotcha in the project memory).
2. `enableSteamNativeInstall` opt-in is ON.
3. HUMANKIND (appId `1124300`) is fully uninstalled first, including:
   - `~/Library/Application Support/Steam/steamapps/appmanifest_1124300.acf`
   - the `~/Library/Application Support/Steam/steamapps/common/Humankind`
     directory
   Reusing residue from a prior run produces a false result (an install that
   "completes" in seconds because most files already exist proves nothing
   about the watchdog).
4. This run ALSO satisfies phase `23-10` Task 1's fresh-install precondition
   -- run the two as ONE install rather than duplicating the multi-hour
   download.

## Gate A -- the positive property (the defect closes)

Install HUMANKIND and let it run past the old 8-minute ceiling.

Start the harness before (or immediately after) starting the install:

```bash
cd .planning/quick/260817-dib-make-the-install-watchdog-a-progress-bas/abort-gate
GATE_DEADLINE_SEC=4500 ./monitor-abort-gate-gateA.sh 1124300 Humankind
```

Assert, once the run completes (or the harness prints its verdict):

1. A `[Timing] runNativeDepotDownload: downloadSteamDepots … took <ms>` line
   reports a duration well beyond `480000`ms with `status` NOT `cancelled`.
2. Percent continues advancing past the 8-minute mark in the
   `[Timing] chunk-stream stats` lines -- the install did not stall, it just
   kept taking longer than the OLD ceiling would have allowed.
3. **Proof by absence** -- the load-bearing assertion for Gate A. Neither of
   these two lines appears ANYWHERE in the log for the whole run:

   ```bash
   grep -n "Installation of 1124300 failed with:" "$HOME/Library/Logs/GameLib/gamelib.log"
   grep -n "Aborting in-flight download for 1124300 after terminal install failure" "$HOME/Library/Logs/GameLib/gamelib.log"
   ```

   Record BOTH greps and their EMPTY result verbatim in `23-UAT.md` -- an
   absence claimed without the command run against the real log is not
   evidence.
4. The install reaches 100% and `appmanifest_1124300.acf` is written to
   `~/Library/Application Support/Steam/steamapps/`.

### Gate A harness inversion

`monitor-abort-gate.sh` (Gate B, below) was built to prove the OPPOSITE
property: it WAITS for `Installation of <appId> failed with:` to appear
(with a 1800s/30min phase-0 `DEADLINE`) and then checks that the chunk-stream
loop stops -- the appearance of the failure line is the TRIGGER for its
checks, not the failure condition itself.

For Gate A this is backwards. `monitor-abort-gate-gateA.sh` inverts it:

- The appearance of `Installation of <appId> failed with:` at ANY point
  during the observation window is now the FAILURE verdict (the old ceiling,
  or a genuine regression, killed a healthy install).
- The ABSENCE of that line across the WHOLE download, combined with
  `appmanifest_1124300.acf` being written, is now the PASS verdict --
  **proof by absence**, exactly as described above.
- The phase-0 wait loop's `DEADLINE` is EXTENDED from `monitor-abort-gate.sh`'s
  1800s (30min) to `GATE_DEADLINE_SEC` (default 4500s / 75min) via an
  environment override, because a 37 GB title at ~7.4 MiB/s needs roughly an
  hour end to end -- the original 30-minute deadline was sized for Gate B's
  much shorter "wait for the stall to trip" wait, not for observing an
  entire healthy multi-GB download.

## Gate B -- the negative property (the watchdog still guards)

Prove a genuine stall still trips, or the fix has removed the bound rather
than rescoped it.

1. Start a HUMANKIND install.
2. Once some bytes have landed (a few `[Timing] chunk-stream stats` lines
   with advancing `percent`), blackhole the CDN so requests HANG rather than
   being refused: route `*.steamcontent.com` to the UNROUTABLE
   `203.0.113.1`, **NOT** to `127.0.0.1`. A loopback entry REFUSES the
   connection in ~1ms, so the timeout/stall path never actually runs.
   `curl` against the blackholed host should exit `28` (operation timed
   out / hang) -- if it exits `7` (connection refused), the setup is wrong
   and must be fixed before continuing.
3. Run the UNMODIFIED harness:

   ```bash
   cd .planning/quick/260817-dib-make-the-install-watchdog-a-progress-bas/abort-gate
   ./monitor-abort-gate.sh 1124300 Humankind
   ```

4. Assert that within ~8 minutes of the last byte landing:
   - The new stall log line appears, naming the observed no-progress window
     in seconds (the stable, greppable diagnostic
     `installQueueElement`'s catch block logs via `errorMessage(...)`, e.g.
     `install stalled — no progress observed for ...s`).
   - `Aborting in-flight download for 1124300 after terminal install
     failure` appears (the `260816-vgc` abort still fires).
   - The dialog copy describes NO PROGRESS (`box.error.install.stalled` --
     "No download progress for 8 minutes — the install was stopped"),
     never a stale connection.
   - **By absence**: no `[Timing] chunk-stream stats` line lands more than
     20s (`GRACE_SEC` in the harness) after the failure line -- the
     `260816-vgc` abort still stops the chunk loop promptly. The harness's
     own `RESULT: PASS` / `RESULT: FAIL` verdict encodes this check.

## Anti-false-pass note

A grep assertion must fail against a known-bad input, or it is not
calibrated. Before trusting Gate A's absence check, run the SAME grep used
in Gate A above against the preserved
`RUN-20260817-humankind-watchdog.log` (the log from the ORIGINAL
2026-08-16 incident, which DOES contain both the failure line and the abort
line -- that is the run that motivated this whole quick task):

```bash
grep -n "Installation of 1124300 failed with:" RUN-20260817-humankind-watchdog.log
grep -n "Aborting in-flight download for 1124300 after terminal install failure" RUN-20260817-humankind-watchdog.log
```

Confirm BOTH report a hit (non-empty output, non-zero exit-code-free match).
An absence check that has never produced a hit on a known-bad input is not
evidence of anything. `RUN-20260817-humankind-watchdog.log` is preserved in
the session scratchpad per the closed todo
`.planning/todos/completed/2026-08-16-orphaned-depot-download-outlives-failure.md`
(`<scratchpad>/abort-gate/RUN-20260817-humankind-watchdog.log`) -- if the
scratchpad that produced it has since been evicted, regenerate the
calibration by pointing `GATE_LOG` at any archived log known to contain a
pre-fix watchdog trip, or by running Gate B once first (which will produce a
fresh log containing both lines) and calibrating against that instead.

## Recording

Results land in `23-UAT.md` alongside `23-10` Task 1. The todo
`.planning/todos/pending/2026-08-16-eight-minute-install-watchdog-makes-long-native-steam-instal.md`
closes only on a Gate A PASS.

Do NOT touch the sibling todo
`.planning/todos/pending/2026-08-16-aborted-depot-residue-has-no-acf.md` --
the on-disk orphaned-residue gap is out of scope for this quick task; only
the watchdog's total-duration-vs-no-progress semantics are in scope here.
