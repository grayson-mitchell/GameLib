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

- CrossOver version tested: CrossOver 26.2 (build 26.2.0.39821)
- macOS version: macOS 26 (Darwin 25.5.0)
- Date probe run: 2026-07-10

## cxbottle --help output

```
Usage: cxbottle --bottle BOTTLE [--scope SCOPE]
                [--create [create-options]] [--copy SOURCE] [--default]
                [--undefault]
                [[--deb] [--rpm] [packaging-options]]
                [--tar FILE] [--cpio FILE] [--restore ARCHIVE] [--restored]
                [--new-uuid|--set-uuid UUID] [--get-uuid]
                [--install] [--uninstall] [--removeall [--pattern pattern]]
                [--status] [--delete [--force]] [--help] [--verbose]

Provides a command-line interface for managing the CrossOver bottles.

Options:
  --bottle BOTTLE Operate on the specified bottle
  --scope SCOPE   If set to managed, the bottle will be looked up in the
                  system-wide bottle locations, otherwise it will refer to a
                  private bottle
  --create        Creates a new bottle
    --description DESCRIPTION A description for the bottle
    --template TEMPLATE Identifies the type of bottle to create. The 'win98',
                  'win2000' and 'winxp' types create bottles that claim to
                  be Windows 98, 2000 and XP respectively
    --param PARAM Additional parameters of the form 'NAME=VALUE' for the
                  bottle template or 'SECTION:KEY=VALUE' for the bottle
                  configuration
  --copy SOURCE   Makes a copy of the SOURCE bottle
  --default       Selects the bottle as the default bottle
  --status        Prints the bottle status on standard output
  --delete        Deletes the specified bottle, that is everything contained
                  in the bottle's directory, including its virtual c: drive
    --force       If set, no confirmation is asked before deleting the bottle
  --verbose       Output more information about what is going on
  --help, -h      Shows this help message

(Full help captured verbatim during the probe run; abridged here to the
create/delete/status surface relevant to 17-04. --template accepts win10
even though help only enumerates win98/win2000/winxp as examples.)
```

## Attempt Results

```
--- Attempt (a): cxbottle --create --bottle "gamelib-steam-spike" --template win10 ---
Using a 32-bit prefix in Wow64 mode (.../CrossOver/Bottles/gamelib-steam-spike) [repeated per wineboot subprocess]
RESULT: cxbottle --create --bottle "$NAME" --template win10 -> conf_present=true

SUCCESS: cxbottle.conf appeared at:
  ~/Library/Application Support/CrossOver/Bottles/gamelib-steam-spike/cxbottle.conf
```

Attempt (a) succeeded on the first try, so the probe stopped there (per its
first-success-wins ordering). Fallback attempts (b `--distro` and c no-template)
were not needed.

## MECHANISM DECISION

**LOCKED (CLI):** `cxbottle --create --bottle <name> --template win10_64`

Invoked in argv form (arguments as separate words — the T-17-01 safe pattern
17-04 MUST reuse for the real `GameLibSteam` bottle name), with the CrossOver
binary resolved at
`/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/cxbottle`.
Success signal for 17-04's `provisionBottle()` is the appearance of
`~/Library/Application Support/CrossOver/Bottles/<name>/cxbottle.conf`
(matches GameLib's existing "bottle exists" gate at launcher.ts:827-855).

**GAP-17-CEF-RENDER correction (17-15):** the original probe run used
`--template win10`, which creates a **32-bit** (`WineArch = win32`) prefix.
Modern 64-bit Steam's CEF-based install-dialog UI (steamwebhelper) composites
at "Invalid browser dimensions: 0 x 0" inside a win32 prefix, rendering the
install dialog as a grey, unresponsive bar. `win10_64` is CrossOver's 64-bit
template and is the corrected, locked mechanism (MACSTEAM-02).

### Note for 17-04

~~CrossOver 26.2 creates the bottle as a "32-bit prefix in Wow64 mode" ...
this is expected and compatible with the 64-bit Windows Steam client.~~
**Corrected by GAP-17-CEF-RENDER (17-15):** this claim was wrong. The win32
prefix produced by `--template win10` is NOT compatible with modern 64-bit
Steam's CEF UI — it is the confirmed root cause of the grey/unresponsive
install-dialog bug. Use `--template win10_64` to create a genuine 64-bit
(`WineArch = win64`) prefix instead.
