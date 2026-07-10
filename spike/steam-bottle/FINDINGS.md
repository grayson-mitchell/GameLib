# CrossOver Bottle Create-Probe — Findings

THROWAWAY SPIKE (not app code; lives in `spike/`). Resolves Assumption A1
(17-RESEARCH.md Pitfall 1 / Open Question 1): the exact mechanism to
programmatically create a dedicated CrossOver bottle for the Windows Steam
client, before 17-04 (provisioning) implements it.

Run via: `bash spike/steam-bottle/probe-cxbottle.sh` on a macOS machine with
CrossOver installed. Paste the full output below, then fill in the
`## MECHANISM DECISION` section. Delete `spike/steam-bottle/` once 17-04
has consumed the locked mechanism.

## Environment

- CrossOver version tested: _(fill in — e.g. `CrossOver 24.0.x`, found via
  CrossOver's own "About CrossOver" menu item or `cxbottle --help` banner)_
- macOS version: _(fill in)_
- Date probe run: _(fill in)_

## cxbottle --help output

```
(paste the full --help / --usage output captured by the probe here, verbatim)
```

## Attempt Results

```
(paste every "RESULT: <invocation> -> conf_present=<true|false>" line here, verbatim)
```

## MECHANISM DECISION

<!--
Fill with EXACTLY ONE of:
  1. The exact working cxbottle argv that produced conf_present=true, e.g.:
       cxbottle --create --bottle <name> --template win10
  2. The literal token FALLBACK, plus the fallback description, e.g.:
       FALLBACK: GUI-create + GameLib verify/configure per D-02
       (17-04 will implement this as: prompt user to create the bottle once
       via CrossOver's New Bottle dialog, then GameLib verifies + configures it)
-->

_(not yet filled — awaiting human probe run, see Task 2 checkpoint)_
