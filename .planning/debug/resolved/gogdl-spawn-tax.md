---
status: diagnosed
trigger: "confirm and fix the ~5s spawn tax on every gogdl invocation — likely macOS security assessment of the ad-hoc-signed runner binary"
created: 2026-08-03T09:05:00Z
updated: 2026-08-03T15:00:00Z
phase: 34.5
tracks: follow-on from resolved/manage-accounts-slow-update.md — the dominant remaining cost in GOG login latency
follows: .planning/debug/resolved/manage-accounts-slow-update.md
---

## Current Focus

hypothesis: CONFIRMED — see Resolution.root_cause. gogdl/legendary/nile are PyInstaller
  `--onefile` builds; on every launch the bootloader re-extracts ~30-40 individually
  ad-hoc-signed Mach-O files (Python.framework + every compiled C-extension .so + bundled
  dylibs) into a FRESH randomly-named $TMPDIR/_MEIxxxxxx directory, and macOS's
  syspolicyd/amfid provenance-Gatekeeper subsystem performs a full (network-backed)
  per-file assessment on each one, serially, because the random path defeats its
  assessment cache every single time.
test: bracketed a timed `gogdl --version` run with `log show` filtered to
  syspolicyd/amfid/trustd; counted `amfid: Entering OSX path for ...` lines and diffed
  their timestamps against measured wall time.
expecting: if H1+H2 correct, the log's per-file scan timestamps should span almost
  exactly the measured wall-clock delta, with each file 100-350ms apart, no CPU-bound gap.
next_action: DECISION CHECKPOINT — no safe unilateral code fix exists in this repo (see
  Resolution). Awaiting user direction on remediation scope before closing this session.

## Symptoms

expected: |
  Spawning the bundled gogdl binary should cost well under 1 second before it begins
  real work (arg parsing, network, etc.).
actual: |
  Every gogdl invocation pays a ~5s fixed startup tax BEFORE doing anything.
  Measured 2026-08-03 on the developer's machine (Darwin 25.5.0, arm64):
  `time public/bin/arm64/darwin/gogdl --version` → 5.06s wall / 0.28s CPU (cold),
  4.71s wall / 0.34s CPU (warm, immediately repeated). ~5% CPU means the process is
  BLOCKED WAITING on something system-side, not computing.
  This tax multiplies: it is paid on boot-time version probes, on `gogdl auth --code`
  during login (it was ~5 of that call's 8s), and on the two post-login refresh
  invocations — the resolved manage-accounts-slow-update session measured the redundant
  second auth call at ~5s, which is almost exactly this spawn tax.
errors: none — the binary works correctly, it is purely slow to start.
timeline: |
  Unknown onset; first measured today. May have always been present under dev builds.
reproduction: |
  `time /Users/graysonmitchell/Projects/GameLib/public/bin/arm64/darwin/gogdl --version`
  — reproducible on back-to-back runs, so whatever assessment/scan happens is NOT being
  cached across executions.

## Evidence already gathered (2026-08-03, orchestrator)

- `codesign -dv` on the binary: `Format=Mach-O thin (arm64)`, `flags=0x2(adhoc)`,
  `Signature=adhoc`, `Identifier=gogdl-5555494466370de151991a5fc87c05a1f2262149`.
- `xattr -l`: only `com.apple.provenance` (no quarantine attribute).
- `file`: Mach-O 64-bit executable arm64 (thin, not universal).
- Project precedent for the ad-hoc-signature failure class: the keyring-timeout gotcha —
  ad-hoc dev signature ⇒ Keychain ACL never persists ⇒ repeated prompts/timeouts. This
  bug may be the exec-assessment sibling of that: ad-hoc binaries may get a fresh
  syspolicyd/XProtect evaluation on every exec instead of a cached verdict.

## Hypotheses to discriminate (NOT diagnoses — each needs a falsification test)

1. **macOS security assessment per-exec** (syspolicyd / XProtect behavioral scanning of
   ad-hoc-signed code, possibly tied to the `com.apple.provenance` tracking). Test:
   `log show --last 2m --predicate 'process == "syspolicyd" OR process CONTAINS "XProtect"'`
   bracketing a timed exec; or compare a byte-identical copy of the binary with a
   different/stripped/re-applied signature.
2. **PyInstaller onefile self-extraction** — gogdl is a bundled Python app; onefile mode
   unpacks to $TMPDIR on every run. Test: check for extraction dirs appearing in TMPDIR
   during a run; low CPU at 5s wall argues against pure I/O extraction but does not
   exclude it.
3. **Something inside gogdl's own startup** (Python imports, config reads, a network
   touch or DNS wait before arg parsing). Test: run with network disabled, or trace with
   `dtruss`-equivalent if permitted; compare against the other bundled runners.

Comparative datum worth collecting first: time `legendary --version` and `nile --version`
from the same public/bin/arm64/darwin/ directory. The boot log (08:42:48→08:42:52 probe
cluster) suggests they may pay a similar tax. Same-tax-everywhere points at the system
(hypothesis 1); gogdl-only points at the binary (hypothesis 2/3).

## Constraints

- The binaries in public/bin/ are shipped artifacts — find out how they are produced or
  fetched (download pipeline? committed? build step?) before proposing to re-sign or
  repackage them; a fix must survive that pipeline, not just patch the local copy.
- The developer may have no Developer ID certificate; a fix that requires one must say so
  explicitly and offer the dev-build alternative.
- Establish whether this is a dev-build-only artifact (like the keyring gotcha) before
  engineering around it for production.
- Read-only diagnosis first; any mutation of the binaries (re-sign, xattr changes) should
  be done on COPIES until the mechanism is confirmed.

## Evidence

- timestamp: 2026-08-03T09:00 local
  checked: comparative timing of all four bundled runners in public/bin/arm64/darwin
  found: |
    gogdl --version: 4.93s (0.28s user / 0.09s sys, 7% cpu)
    legendary --version: 11.33s (0.35s user / 0.14s sys, 4% cpu)
    nile --version: 12.84s (0.23s user / 0.10s sys, 2% cpu)
    comet --version: 0.01s (56% cpu, essentially instant)
  implication: |
    Tax is NOT gogdl-specific — legendary and nile pay the SAME class of tax, worse.
    comet (a different upstream project, Rust static binary) is unaffected. This rules
    in "something about how gogdl/legendary/nile are built" and rules out "something in
    GameLib's own gogdl invocation code."

- timestamp: 2026-08-03T09:00
  checked: codesign -dv on comet vs gogdl
  found: |
    gogdl: flags=0x2(adhoc), Signature=adhoc, no "linker-signed"
    comet: flags=0x20002(adhoc,linker-signed), Signature=adhoc
  implication: |
    Both are ad-hoc signed, but comet is a single statically-linked Mach-O (no bundled
    interpreter/extension modules to extract). Signature flag alone doesn't explain the
    gap — pointed investigation at what happens AFTER exec, not the top-level binary's
    own signature.

- timestamp: 2026-08-03T09:00
  checked: |
    `log show` bracketing a timed `gogdl --version` run (7.51s wall this run), filtered
    to `process == "syspolicyd" OR process == "amfid" OR process == "trustd"`
  found: |
    36 distinct `amfid: Entering OSX path for /private/var/folders/.../T/_MEIpxAdtK/...`
    lines, one per extracted file: Python.framework/Versions/3.13/Python, then every
    bundled CPython C-extension .so (_struct, zlib, _ctypes, _opcode, binascii, _bz2,
    _lzma, grp, math, _bisect, _random, _heapq, _queue, fcntl, _posixsubprocess, select,
    _hashlib, libcrypto.3.dylib, _blake2, _datetime, _socket, array, _ssl, libssl.3.dylib,
    _scproxy, _json, _pickle, charset_normalizer/md*.so x2, unicodedata,
    _multibytecodec, mmap, _posixshmem, _multiprocessing, gogdl/xdelta3.cpython...so).
    Each is logged by amfid as: "not valid: ... Error Domain=AppleMobileFileIntegrityError
    Code=-423 The file is adhoc signed or signed by an unknown certificate chain", then
    syspolicyd does a full GK scan per file: queueing -> performScan -> CloudKit ticket
    lookup (network round trip to Apple, ~40-300ms) -> XProtect XPC scan -> GK Xprotect
    results -> scan finished. Timestamps for the 36 files span 09:00:15.974 ->
    09:00:23.283 = 7.31s, matching the measured 7.51s wall time almost exactly (residual
    ~0.2s = actual Python interpreter + gogdl code execution, consistent with the
    measured 0.28-0.34s CPU time).
  implication: |
    DEFINITIVE mechanism. The ~5-7s tax is 100% attributable to macOS's syspolicyd/amfid
    performing a serial, network-backed Gatekeeper assessment on EVERY individual file
    that PyInstaller's onefile bootloader extracts from the archive on this run — not to
    gogdl's own code, not to extraction I/O (11MB extracts fast), not to a single
    top-level-binary signature check. Number of extracted C-extension modules that get
    imported directly determines the tax size — explains why legendary/nile (larger
    Python codebases, more imports) pay MORE, and comet (no bundled extraction) pays
    ~zero.

- timestamp: 2026-08-03T09:00
  checked: |
    same log for the OUTER gogdl binary process itself (stable path
    public/bin/arm64/darwin/gogdl, not the extracted temp files)
  found: |
    "syspolicyd: Found provenance data on process... Process was already in provenance
    sandbox, skipping" — the top-level binary is NOT re-scanned on repeat runs.
  implication: |
    macOS DOES cache Gatekeeper/provenance verdicts per-path across runs. The reason the
    36 extracted files never benefit from this cache is that PyInstaller onefile
    generates a NEW random `_MEIxxxxxx` temp directory name on every single invocation
    (by design, to allow concurrent instances) — so from Gatekeeper's perspective, every
    launch presents 36 "brand new, never-before-seen" files. This is why "warm,
    immediately repeated" run (4.71s) was barely faster than "cold" (5.06s) — no
    meaningful caching is possible under onefile mode's extraction scheme.

- timestamp: 2026-08-03T09:05
  checked: meta/downloadHelperBinaries.ts (how public/bin/*/gogdl et al. get into the repo)
  found: |
    gogdl/legendary/nile/comet are NOT built by GameLib. They are downloaded prebuilt
    from upstream GitHub releases: Heroic-Games-Launcher/heroic-gogdl (gogdl),
    Heroic-Games-Launcher/legendary, imLinguin/nile, imLinguin/comet. GameLib has no
    control over how those binaries are packaged/signed.
  implication: |
    Any fix touching the PACKAGING of gogdl/legendary/nile (onefile vs onedir, real
    codesign/notarization of the binary or its embedded payload) is out of GameLib's
    direct control without either (a) an upstream PR/issue against those three separate
    projects, or (b) GameLib building these tools from source itself (a new pipeline
    dependency on a Python + PyInstaller toolchain, not a small patch).

- timestamp: 2026-08-03T09:10
  checked: |
    web research — is there an official/safe PyInstaller mechanism to reuse a onefile
    extraction across runs on macOS, or a documented fix for this exact symptom class?
  found: |
    Confirmed as a known, currently-unresolved PyInstaller limitation: "onefile mode is
    slow because every time it runs it extracts the exact same data into almost the same
    location" (PyInstaller GitHub issue #7907, open feature request, no built-in
    persistent-extraction feature as of current stable). Official guidance found: "if
    decompression time of a large program is a problem, you should not be using onefile
    mode" — i.e., the sanctioned fix is switching the BUILD to `--onedir`, which extracts
    once at build time to a stable, shipped directory (so the same Gatekeeper
    provenance-cache we already observed working for the outer gogdl binary would apply
    on 2nd+ launches). Confirmed heroic-gogdl's own README documents building with
    `pyinstaller --onefile --name gogdl gogdl/cli.py` — onefile is upstream's deliberate,
    documented choice, not an accident.
  implication: |
    No safe, officially-supported code-level workaround exists inside GameLib's own
    codebase. The `_MEIPASS2` env var some PyInstaller internals use to skip
    re-extraction on self-restart is undocumented bootloader-internal behavior with no
    stated content-verification guarantee — reusing it here would risk silently running
    stale/mismatched code across a gogdl version upgrade, which is a correctness
    regression risk disproportionate to a startup-latency fix.

- timestamp: 2026-08-03T09:12
  checked: |
    src/backend/utils/systeminfo/index.ts (getSystemInfo, called from
    launcher.ts:587 on every game launch to log system info) and
    src/backend/utils/helperBinaries/index.ts (getGogdlVersion etc.)
  found: |
    getSystemInfo() already has a process-lifetime in-memory cache
    (`cachedSystemInfo`) and defaults to `cache=true` — so the 4-runner version probe
    (which runs all 4 `--version` calls in parallel via Promise.all, capped at ~nile's
    12.8s worst case, not summed) only pays the full tax ONCE per app session, on the
    first game launch. This channel is already optimally mitigated; no further gain
    available here.
  implication: |
    The only other in-repo lever is call-COUNT reduction elsewhere (e.g. the sibling
    resolved session's redundant-refetch fix, commit c3117b1cf, already cut one
    redundant gogdl call during login). No further concretely-identified redundant
    gogdl/legendary/nile spawn was found in this session's evidence; finding more would
    require a fresh, separate investigation of the login/install call graph.

## Eliminated

- hypothesis: "gogdl's own startup code (Python imports, config reads, a network touch,
    or DNS wait) is what's slow" (original hypothesis 3)
  evidence: |
    The `log show` capture proves the entire measured delay occurs INSIDE macOS's own
    syspolicyd/amfid Gatekeeper assessment machinery, file-by-file, before gogdl's own
    Python bytecode meaningfully executes. gogdl's actual CPU time (0.28-0.34s) is
    consistent with normal, fast interpreter startup + arg parsing — its own code is not
    slow. The "Python imports" framing was directionally right (imports are what trigger
    each file's dlopen, which is what amfid intercepts) but the root cause is the OS
    Gatekeeper scan, not gogdl's logic.
  timestamp: 2026-08-03T09:10

## Resolution

root_cause: |
  gogdl (and legendary, nile — all vendored, prebuilt PyInstaller `--onefile` releases
  downloaded from upstream Heroic-Games-Launcher/heroic-gogdl, Heroic-Games-Launcher/
  legendary, and imLinguin/nile via meta/downloadHelperBinaries.ts) re-extract their
  entire embedded Python runtime + every compiled C-extension module (~30-40 files for
  gogdl, more for legendary/nile) into a FRESH, randomly-named $TMPDIR/_MEIxxxxxx
  directory on EVERY single invocation — this is inherent, by-design onefile-mode
  bootloader behavior (upstream's own documented build command uses `--onefile`).
  Because all of these extracted files are ad-hoc-signed with no identifiable
  certificate chain, macOS's syspolicyd/amfid Gatekeeper subsystem performs a full,
  serial, network-backed assessment (CloudKit notarization-ticket lookup + XProtect XPC
  scan) on EACH one individually before the dynamic loader will `dlopen` it. Because the
  extraction directory's name is randomized on every launch, the OS's own Gatekeeper
  provenance cache (confirmed working for the stably-pathed OUTER gogdl binary itself,
  which is NOT re-scanned on repeat runs) never gets a hit for the inner extracted
  files — every launch re-pays the full per-file assessment cost from scratch. Directly
  measured: 36 individually-scanned files spanning 7.31s of log timestamps against a
  7.51s measured wall-clock run — accounting for effectively the entire tax. This is not
  a GameLib code bug, not dev-build-only (it originates from upstream's own binary
  build/signing, independent of GameLib's own app signing/notarization status), and has
  no Developer-ID-certificate-dependent fix, because re-signing/notarizing GameLib's own
  Electron app does not touch the separately-built, separately-signed gogdl/legendary/
  nile payloads or the files their bootloaders materialize at runtime.
fix: |
  NONE APPLIED — no safe, unilateral code fix exists inside this repository. Confirmed
  via research: this is a known, currently-unresolved PyInstaller onefile-mode
  limitation on macOS (open upstream feature request, no built-in persistent-extraction
  mechanism as of current stable). The only two effective fixes both change WHERE/HOW
  gogdl/legendary/nile are packaged, and are both out of scope for a single debug
  session:
    (a) Upstream (Heroic-Games-Launcher/heroic-gogdl + legendary, imLinguin/nile)
        switches their macOS PyInstaller build from `--onefile` to `--onedir` — this is
        the officially-recommended fix for exactly this problem class (extraction
        happens once, at build time, into a stable shipped directory, letting the
        already-confirmed-working Gatekeeper provenance cache apply on every run after
        the first). Requires an upstream PR/issue GameLib does not control the timeline
        of.
    (b) GameLib builds gogdl/legendary/nile from source itself (onedir) instead of
        downloading upstream's onefile release artifact — a real pipeline change (adds
        a Python + PyInstaller toolchain dependency to CI), not a patch.
  An undocumented internal PyInstaller mechanism (`_MEIPASS2` self-restart reuse) could
  theoretically skip re-extraction, but was explicitly rejected as a fix: it has no
  documented content-verification guarantee, so it risks silently running stale/
  mismatched extracted code across a gogdl version bump — a correctness regression risk
  judged disproportionate to a startup-latency fix.
  Already-applied, in-scope mitigation confirmed still in effect: getSystemInfo()'s
  process-lifetime cache means the 4-runner boot/first-launch version probe only pays
  this tax once per app session (parallelized via Promise.all, not summed), and the
  sibling session (resolved/manage-accounts-slow-update.md, commit c3117b1cf) already
  eliminated one redundant gogdl call from the login path.
verification: |
  Root cause confirmed (not merely hypothesized) via three independent, corroborating
  checks: (1) `log show` bracketing a timed `gogdl --version` run captured 36 distinct
  `amfid` per-file Gatekeeper scan entries spanning 7.31s of the run's measured 7.51s
  wall-clock time — the mechanism accounts for essentially the entire tax, directly
  observed, not inferred; (2) comparative timing across all four bundled runners
  (gogdl 4.93s, legendary 11.33s, nile 12.84s, comet 0.01s) isolates the cause to
  "PyInstaller onefile self-extraction" specifically, ruling out gogdl-specific code,
  ad-hoc signing alone (comet is also ad-hoc signed but pays ~zero tax), and GameLib's
  own invocation code; (3) the same log capture showed the OUTER gogdl binary itself is
  NOT re-scanned on repeat runs ("Process was already in provenance sandbox, skipping"),
  proving macOS's provenance cache works fine for a stable path — confirming the
  randomized `_MEIxxxxxx` extraction directory, not signature type, is what defeats the
  cache for the inner files. No fix was applied or attempted; this session's scope ended
  at root-cause confirmation by developer decision (see Developer decision note below).
files_changed: []

Developer decision: "Option 4 only — audit the spawn call-graph. Not filing upstream
  issues now, not building from source, and the session closes with the root cause
  documented (the platform/upstream tax is accepted as out-of-repo-scope for this
  session)."
