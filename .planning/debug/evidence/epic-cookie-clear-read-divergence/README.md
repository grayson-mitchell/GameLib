# Evidence — `epic-cookie-clear-read-divergence`

Redacted artefacts only. **The raw `.binarycookies` jars are deliberately NOT in this
repository.**

An Apple binarycookies file stores each cookie's name and its **value** adjacently. The jars
measured here held live `_simpleauth_sess` (Humble), `gog-al` / `galaxy-login-*` (GOG) and
`session-token` (Amazon) credentials. This repo is public (T-35-04), so committing them
would be exactly the credential exposure REQ-35-07 exists to prevent — while investigating
that same class of defect.

What IS here is safe because the parser prints `vlen=<length>`, never the value:

| file | contents |
|---|---|
| `parse-BEFORE-fix-run.txt` | index-walking parse, 20:48, 56 live records / 6 Epic-owned |
| `parse-AFTER-fix-run.txt`  | index-walking parse, 21:03, 51 live records / **0** Epic-owned |
| `log-AFTER-fix-run.txt`    | the product's own census lines — counts, verdicts, domains only |

Both `.txt` parses were checked for value leakage before committing: zero strings of 40+
characters in either.

The raw jars for this run live outside the repo, in the session scratchpad. To reproduce a
parse, point the index-walking parser at
`~/Library/HTTPStorages/gamelib-shell.binarycookies` (dev build — keyed by process name;
the packaged `.app` keys by bundle id as `com.gamelib.shell.binarycookies`). **Identify the
live jar by which mtime moves**, and note the parser emits **UTC** while `gamelib.log` is
local — that conversion is what settled this defect.
