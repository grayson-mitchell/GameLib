#
# R4 hijack/repair check (quick-260930-qmu). Windows PowerShell 5.1 target.
#
# Hijacks HKCU\Software\Classes\gamelib\shell\open\command, launches the INSTALLED gamelib-shell.exe,
# and scores whether the app repairs the key on its own (46-POSTFIX R4, closing the todo
# 2026-09-26-gamelib-self-heal-lets-dev-builds-take-over-gamelib-scheme.md).
#
# Modes:
#   Preflight - read-only preconditions plus one FORCED same-value write-and-verify round trip.
#               No hijack, no launch.
#   Live      - preconditions, hijack, launch, poll, score, then restore-first teardown.
#
# Exit codes: 0 PASS, 1 FAIL, 2 precondition unmet (nothing written), 3 INV or C8 violated after
# the finally block (the loudest outcome -- registry or processes were not restored).
#

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Preflight', 'Live')]
    [string]$Mode,

    [string]$EvidenceDir = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# NOTE: $PSScriptRoot is NOT reliably populated while a default parameter-value expression is
# being evaluated in this PowerShell 5.1 host when the param block also declares a Mandatory
# parameter (measured live, 2026-09-30: Join-Path throws "Cannot bind argument to parameter
# 'Path' because it is an empty string" for exactly this shape). It IS populated by the time the
# script body runs, so the real default is computed here instead of in the param block.
if ([string]::IsNullOrEmpty($EvidenceDir)) {
    $EvidenceDir = Join-Path (Split-Path -Parent $PSCommandPath) 'evidence'
}

# ---- Constants ----

$RootSubkeyPath = 'Software\Classes\gamelib'
$CommandSubkeyPath = 'Software\Classes\gamelib\shell\open\command'
$RootRegPathFull = 'HKCU\Software\Classes\gamelib'
$CommandRegPathFull = 'HKCU\Software\Classes\gamelib\shell\open\command'

$HijackValue = '"C:\gamelib-hijack-test\nope.exe" "%1"'
$InstalledExe = Join-Path $env:LOCALAPPDATA 'GameLib\gamelib-shell.exe'
$InstallDir = Split-Path -Path $InstalledExe -Parent
$ExpectedSha256 = '5ADCE1BEB48CCC8F82695F98164062E6E53F45581DD0F188269015EBA6C63A9F'
$ExpectedMessage = 'repaired the gamelib:// HKCU registration (prior value: points-elsewhere) -- 4/4 installer-shaped values written under HKCU\Software\Classes\gamelib'
$PollBoundSeconds = 60
$GracefulCloseBoundSeconds = 10

if (-not (Test-Path -LiteralPath $EvidenceDir)) {
    New-Item -ItemType Directory -Force -Path $EvidenceDir | Out-Null
}

# ---- Evidence writer: UTF-8 without BOM, LF-only line endings ----

function Write-EvidenceFile {
    param(
        [string]$Path,
        [string[]]$Lines
    )
    $body = ''
    if ($Lines.Count -gt 0) {
        $body = ($Lines -join "`n") + "`n"
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $body, $utf8NoBom)
}

# ---- Registry helpers: .NET only, never reg.exe add (5.1 native-arg quoting mangles embedded quotes) ----

function Get-CommandValueRaw {
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($CommandSubkeyPath, $false)
    if ($null -eq $key) {
        return New-Object PSObject -Property @{ Value = $null; Kind = $null; Exists = $false }
    }
    try {
        $val = $key.GetValue('', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
        $kind = $key.GetValueKind('')
        return New-Object PSObject -Property @{ Value = $val; Kind = $kind; Exists = $true }
    } finally {
        $key.Close()
    }
}

function Set-CommandValueRaw {
    param([string]$Value)
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($CommandSubkeyPath, $true)
    if ($null -eq $key) {
        $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($CommandSubkeyPath)
    }
    try {
        $key.SetValue('', $Value, [Microsoft.Win32.RegistryValueKind]::String)
    } finally {
        $key.Close()
    }
}

function Get-RegSnapshotText {
    # NOTE (fixed live, 2026-09-30): do NOT merge stderr with 2>&1 here. Windows PowerShell 5.1
    # wraps merged stderr lines from a native command as ErrorRecord objects, and
    # $ErrorActionPreference = 'Stop' then turns them into a terminating NativeCommandError the
    # instant one flows through the pipeline -- even though the command itself succeeded and the
    # "error" text was informational. This key always exists at every call site that calls this
    # function, so stderr is discarded rather than merged.
    $lines = & reg.exe query $RootRegPathFull /s 2>$null
    $clean = $lines | ForEach-Object { [string]$_ -replace "`r", '' }
    return ($clean -join "`n")
}

function Get-CommandQueryVeLines {
    # See Get-RegSnapshotText's note: stderr is discarded, not merged, for the same reason.
    $lines = & reg.exe query $CommandRegPathFull /ve 2>$null
    return ($lines | ForEach-Object { [string]$_ -replace "`r", '' })
}

# One restore function, used by Live mode's finally block. Preflight exercises the same
# underlying Get/Set-CommandValueRaw primitives directly (a forced same-value write), since its
# own step 3 is unconditional rather than difference-gated.
function Restore-CommandValue {
    param([string]$PreStateValue)
    $current = Get-CommandValueRaw
    $writeNeeded = $false
    if (($current.Value -ne $PreStateValue) -or ($current.Kind -ne [Microsoft.Win32.RegistryValueKind]::String)) {
        Set-CommandValueRaw -Value $PreStateValue
        $writeNeeded = $true
    }
    $after = Get-CommandValueRaw
    $matchesPreState = ($after.Value -eq $PreStateValue) -and ($after.Kind -eq [Microsoft.Win32.RegistryValueKind]::String)
    return New-Object PSObject -Property @{ WriteNeeded = $writeNeeded; MatchesPreState = $matchesPreState }
}

# ---- Preconditions: all read-only, run before ANY registry write, in both modes ----

function Invoke-Preconditions {
    $results = New-Object System.Collections.Specialized.OrderedDictionary
    $allPass = $true

    # P1: zero gamelib-shell.exe / gamelib-sidecar.exe processes.
    $procs = Get-CimInstance Win32_Process -Filter "Name='gamelib-shell.exe' OR Name='gamelib-sidecar.exe'"
    $procCount = @($procs).Count
    $p1Pass = ($procCount -eq 0)
    $results['P1'] = @{ Pass = $p1Pass; Detail = "process_count=$procCount" }
    if (-not $p1Pass) { $allPass = $false }

    # P2: installed exe exists and its SHA256 matches the expected value.
    $p2ExeExists = Test-Path -LiteralPath $InstalledExe
    $p2HashMatch = $false
    $p2Hash = ''
    if ($p2ExeExists) {
        $p2Hash = (Get-FileHash -LiteralPath $InstalledExe -Algorithm SHA256).Hash
        $p2HashMatch = ($p2Hash.ToUpperInvariant() -eq $ExpectedSha256.ToUpperInvariant())
    }
    $p2Pass = $p2ExeExists -and $p2HashMatch
    $results['P2'] = @{ Pass = $p2Pass; Detail = "exists=$p2ExeExists hash=$p2Hash hash_match=$p2HashMatch" }
    if (-not $p2Pass) { $allPass = $false }

    # P3: the .NET-read command value is exactly the installed-exe shape, kind String.
    $cmdVal = Get-CommandValueRaw
    $expectedShape = '"' + $InstalledExe + '" "%1"'
    $p3Pass = $cmdVal.Exists -and ($cmdVal.Value -eq $expectedShape) -and ($cmdVal.Kind -eq [Microsoft.Win32.RegistryValueKind]::String)
    $results['P3'] = @{ Pass = $p3Pass; Detail = "value=[$($cmdVal.Value)] kind=$($cmdVal.Kind)" }
    if (-not $p3Pass) { $allPass = $false }

    # P4: real-profile arm -- HOME non-empty and equal to USERPROFILE, case-insensitive.
    $homeVal = $env:HOME
    $userProfileVal = $env:USERPROFILE
    $p4Pass = $false
    if (-not [string]::IsNullOrEmpty($homeVal) -and -not [string]::IsNullOrEmpty($userProfileVal)) {
        $p4Pass = ($homeVal.ToLowerInvariant() -eq $userProfileVal.ToLowerInvariant())
    }
    $results['P4'] = @{ Pass = $p4Pass; Detail = "HOME=[$homeVal] USERPROFILE=[$userProfileVal]" }
    if (-not $p4Pass) { $allPass = $false }

    # P5: CI must not be e2e (that short-circuit would skip the repair before any registry call).
    $ciVal = $env:CI
    $p5Pass = ($ciVal -ne 'e2e')
    $results['P5'] = @{ Pass = $p5Pass; Detail = "CI=[$ciVal]" }
    if (-not $p5Pass) { $allPass = $false }

    # P6: the hijack target must not exist, so a leaked hijack window points at nothing.
    $hijackDirExists = Test-Path -LiteralPath 'C:\gamelib-hijack-test'
    $p6Pass = -not $hijackDirExists
    $results['P6'] = @{ Pass = $p6Pass; Detail = "exists=$hijackDirExists" }
    if (-not $p6Pass) { $allPass = $false }

    # P7: log path/offset/line-count, and ONLY the epoch+pid prefix of the last line (never text).
    $logPath = $null
    $logOffsetBytes = 0
    $logLineCount = 0
    $lastLinePrefix = ''
    $logExists = $false
    if (-not [string]::IsNullOrEmpty($homeVal)) {
        $logPath = Join-Path $homeVal '.config\gamelib\gamelib-shell.log'
        $logExists = Test-Path -LiteralPath $logPath
        if ($logExists) {
            $item = Get-Item -LiteralPath $logPath
            $logOffsetBytes = $item.Length
            $rawBytes = [System.IO.File]::ReadAllBytes($logPath)
            $text = [System.Text.Encoding]::UTF8.GetString($rawBytes)
            $lines = @($text -split "`n" | Where-Object { $_ -ne '' })
            $logLineCount = $lines.Count
            if ($logLineCount -gt 0) {
                $last = $lines[$logLineCount - 1].TrimEnd("`r")
                if ($last -match '^(\d+) pid=(\d+) ') {
                    $lastLinePrefix = "epoch=$($Matches[1]) pid=$($Matches[2])"
                }
            }
        }
    }
    $p7Pass = $true
    $results['P7'] = @{ Pass = $p7Pass; Detail = "exists=$logExists offset_bytes=$logOffsetBytes line_count=$logLineCount last_line_prefix=[$lastLinePrefix]" }

    # P8: in-run pre-state snapshot, captured before any write this run makes.
    $p8Snapshot = Get-RegSnapshotText
    $results['P8'] = @{ Pass = $true; Detail = 'captured' }

    return New-Object PSObject -Property @{
        AllPass              = $allPass
        Results              = $results
        LogPath              = $logPath
        LogOffsetBytes       = $logOffsetBytes
        PreStateCommandValue = $cmdVal.Value
        PreStateSnapshot     = $p8Snapshot
    }
}

function Format-PreconditionLines {
    param($PreconditionsResult)
    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($key in $PreconditionsResult.Results.Keys) {
        $r = $PreconditionsResult.Results[$key]
        $status = if ($r.Pass) { 'PASS' } else { 'FAIL' }
        $lines.Add("$key`: $status $($r.Detail)")
    }
    return $lines
}

# ---- Run preconditions (both modes), before ANY registry write ----

$pre = Invoke-Preconditions
$preLines = Format-PreconditionLines $pre

if (-not $pre.AllPass) {
    $outFile = if ($Mode -eq 'Preflight') { Join-Path $EvidenceDir 'r4-preflight.txt' } else { Join-Path $EvidenceDir 'r4-live.txt' }
    $failLines = New-Object System.Collections.Generic.List[string]
    $failLines.AddRange([string[]]$preLines)
    $failLines.Add('PRECONDITION_FAILURE: true')
    $failLines.Add('no registry write performed')
    if ($Mode -eq 'Preflight') {
        $failLines.Add('PREFLIGHT: FAIL')
    } else {
        $failLines.Add('VERDICT: FAIL')
    }
    Write-EvidenceFile -Path $outFile -Lines $failLines
    exit 2
}

# ---- Preflight mode: back up, force one same-value round trip, verify, exit ----

if ($Mode -eq 'Preflight') {
    $backupPath = Join-Path $EvidenceDir 'r4-backup.reg'
    & reg.exe export $RootRegPathFull $backupPath /y | Out-Null

    $preStateValue = $pre.PreStateCommandValue

    # Step 3: FORCE one SetValue of the pre-state value onto itself. The ONLY registry write
    # Preflight makes.
    Set-CommandValueRaw -Value $preStateValue

    # Step 4: re-read via .NET and via a fresh reg.exe query /s snapshot. Both must equal pre-state.
    $postNet = Get-CommandValueRaw
    $postSnapshot = Get-RegSnapshotText
    $netMatch = ($postNet.Value -eq $preStateValue) -and ($postNet.Kind -eq [Microsoft.Win32.RegistryValueKind]::String)
    $snapshotMatch = ($postSnapshot -eq $pre.PreStateSnapshot)
    $roundTripPass = $netMatch -and $snapshotMatch

    $verdict = if ($roundTripPass) { 'PASS' } else { 'FAIL' }

    $lines = New-Object System.Collections.Generic.List[string]
    $lines.AddRange([string[]]$preLines)
    $lines.Add("round_trip_net_match: $netMatch")
    $lines.Add("round_trip_snapshot_match: $snapshotMatch")
    $lines.Add("PREFLIGHT: $verdict")

    Write-EvidenceFile -Path (Join-Path $EvidenceDir 'r4-preflight.txt') -Lines $lines

    if ($verdict -eq 'PASS') { exit 0 } else { exit 1 }
}

# ---- Live mode: hijack, launch, poll, score inside try; restore-first teardown in finally ----

if ($Mode -eq 'Live') {
    $backupPath = Join-Path $EvidenceDir 'r4-backup.reg'
    & reg.exe export $RootRegPathFull $backupPath /y | Out-Null

    $preStateValue = $pre.PreStateCommandValue
    $preStateSnapshot = $pre.PreStateSnapshot
    $logPath = $pre.LogPath
    $logOffsetBytes = $pre.LogOffsetBytes

    $liveLines = New-Object System.Collections.Generic.List[string]
    $liveLines.AddRange([string[]]$preLines)
    $liveLines.Add("log_offset_bytes: $logOffsetBytes")

    $launchedPid = $null
    $launchedProcess = $null
    $restoreWriteNeeded = $true
    $invPass = $false
    $c8Pass = $false

    $c1Pass = $false; $c1Detail = 'not run'
    $c2Pass = $false; $c2Detail = 'not run'
    $c3Pass = $false; $c3Detail = 'not run'
    $c4Pass = $false; $c4Detail = 'not run'
    $c5Pass = $false; $c5Detail = 'not run'
    $c6Pass = $false; $c6Detail = 'not run'
    $c7Pass = $false; $c7Detail = 'not run'

    $allNewLinesSoFar = New-Object System.Collections.Generic.List[string]
    $matchedGamelibHkcuLines = New-Object System.Collections.Generic.List[string]
    $c6Violation = $false

    try {
        # (a) Hijack.
        Set-CommandValueRaw -Value $HijackValue

        # (b) C1.
        $c1Net = Get-CommandValueRaw
        $c1NetMatch = ($c1Net.Value -eq $HijackValue) -and ($c1Net.Kind -eq [Microsoft.Win32.RegistryValueKind]::String)
        $veLines = Get-CommandQueryVeLines
        $expectedSuffix = 'REG_SZ    ' + $HijackValue
        $c1RegMatch = $false
        foreach ($l in $veLines) {
            if ($l.EndsWith($expectedSuffix)) { $c1RegMatch = $true; break }
        }
        $liveLines.Add("hijack_readback_net: value=[$($c1Net.Value)] kind=$($c1Net.Kind) match=$c1NetMatch")
        $liveLines.Add("hijack_readback_reg: match=$c1RegMatch")

        $c1Pass = $c1NetMatch -and $c1RegMatch
        $c1Detail = "net_match=$c1NetMatch reg_match=$c1RegMatch"
        if (-not $c1Pass) {
            throw "C1 FAILED: hijack readback did not confirm the hijack landed (net_match=$c1NetMatch reg_match=$c1RegMatch); not launching"
        }

        # (c) Launch and C2.
        $launchedProcess = Start-Process -FilePath $InstalledExe -WorkingDirectory $InstallDir -PassThru
        $launchedPid = $launchedProcess.Id
        $liveLines.Add("launched_pid: $launchedPid")

        $execPath = $null
        $shellCount = 0
        for ($i = 0; $i -lt 10; $i++) {
            $launchedInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$launchedPid"
            if ($null -ne $launchedInfo) { $execPath = $launchedInfo.ExecutablePath }
            $allShellProcs = Get-CimInstance Win32_Process -Filter "Name='gamelib-shell.exe'"
            $shellCount = @($allShellProcs).Count
            if ($null -ne $execPath) { break }
            Start-Sleep -Milliseconds 300
        }
        $execMatch = ($null -ne $execPath) -and ($execPath.ToLowerInvariant() -eq $InstalledExe.ToLowerInvariant())
        $c2Pass = $execMatch -and ($shellCount -eq 1)
        $c2Detail = "exec_path=[$execPath] shell_count=$shellCount"
        $liveLines.Add("executable_path: $execPath")

        # (d) Poll: every 1s, up to $PollBoundSeconds.
        $pollStart = Get-Date
        $repairSeen = $false
        $repairSecondsElapsed = $null
        $appUpSeen = $false
        $appUpSecondsElapsed = $null
        $expectedLinePattern = '^\d+ pid=' + $launchedPid + ' ' + [regex]::Escape($ExpectedMessage) + '$'

        while ($true) {
            $elapsed = (Get-Date) - $pollStart
            if ($elapsed.TotalSeconds -gt $PollBoundSeconds) { break }

            if ($null -ne $logPath -and (Test-Path -LiteralPath $logPath)) {
                $fs = New-Object System.IO.FileStream($logPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
                try {
                    if ($fs.Length -gt $logOffsetBytes) {
                        $fs.Seek($logOffsetBytes, [System.IO.SeekOrigin]::Begin) | Out-Null
                        $len = [int]($fs.Length - $logOffsetBytes)
                        $buf = New-Object byte[] $len
                        $fs.Read($buf, 0, $len) | Out-Null
                        $text = [System.Text.Encoding]::UTF8.GetString($buf)
                        $rawLines = $text -split "`n"
                        $allNewLinesSoFar.Clear()
                        $matchedGamelibHkcuLines.Clear()
                        foreach ($rl in $rawLines) {
                            $trimmed = $rl.TrimEnd("`r")
                            if ($trimmed -eq '') { continue }
                            $allNewLinesSoFar.Add($trimmed)
                            if ($trimmed.Contains('gamelib-hijack-test')) { $c6Violation = $true }
                            if ($trimmed.Contains('gamelib:// HKCU')) { $matchedGamelibHkcuLines.Add($trimmed) }
                            if ((-not $repairSeen) -and ($trimmed -cmatch $expectedLinePattern)) {
                                $repairSeen = $true
                                $repairSecondsElapsed = [math]::Round($elapsed.TotalSeconds, 1)
                            }
                        }
                    }
                } finally {
                    $fs.Close()
                }
            }

            if (-not $appUpSeen) {
                $sidecarProcs = Get-CimInstance Win32_Process -Filter "Name='gamelib-sidecar.exe' AND ParentProcessId=$launchedPid"
                if ($null -ne $sidecarProcs -and @($sidecarProcs).Count -gt 0) {
                    $appUpSeen = $true
                    $appUpSecondsElapsed = [math]::Round($elapsed.TotalSeconds, 1)
                } else {
                    $launchedProcess.Refresh()
                    if ((-not $launchedProcess.HasExited) -and ($launchedProcess.MainWindowHandle -ne [IntPtr]::Zero)) {
                        $appUpSeen = $true
                        $appUpSecondsElapsed = [math]::Round($elapsed.TotalSeconds, 1)
                    }
                }
            }

            $launchedProcess.Refresh()
            if ($launchedProcess.HasExited) { break }
            if ($repairSeen -and $appUpSeen) { break }

            Start-Sleep -Seconds 1
        }

        $liveLines.Add("poll_repair_seen: $repairSeen seconds=$repairSecondsElapsed")
        $liveLines.Add("poll_appup_seen: $appUpSeen seconds=$appUpSecondsElapsed")

        # (e) Score, while the app is still running and before the finally block.
        $matchedCount = @($allNewLinesSoFar | Where-Object { $_ -cmatch $expectedLinePattern }).Count
        $c3Pass = ($matchedCount -eq 1)
        $c3Detail = "pid_matched_line_count=$matchedCount"

        $c4Net = Get-CommandValueRaw
        $c4ValueMatch = ($c4Net.Value -eq $preStateValue)
        $c4Pass = $c4ValueMatch -and ($c4Net.Kind -eq [Microsoft.Win32.RegistryValueKind]::String)
        $c4Detail = "value_matches_prestate=$c4ValueMatch kind=$($c4Net.Kind)"

        $c5Snapshot = Get-RegSnapshotText
        $c5Pass = ($c5Snapshot -eq $preStateSnapshot)
        $c5Detail = "snapshot_matches_prestate=$c5Pass"

        $c6Pass = -not $c6Violation
        $c6Detail = "violation=$c6Violation"

        $c7Pass = $appUpSeen
        $c7Detail = "appup_seen=$appUpSeen seconds=$appUpSecondsElapsed"

        $liveLines.Add("new_log_line_count: $($allNewLinesSoFar.Count)")
    } catch {
        $liveLines.Add("EXCEPTION: $($_.Exception.Message)")
    } finally {
        # 1. Restore the registry FIRST, through the restore function. Wrapped so that even an
        # unexpected exception here cannot skip teardown below -- the safe default on exception is
        # restoreWriteNeeded=true (forces FAIL, never a false PASS) and restoreMatchesPreState=false.
        try {
            $restoreResult = Restore-CommandValue -PreStateValue $preStateValue
            $restoreWriteNeeded = $restoreResult.WriteNeeded
            $restoreMatchesPreState = $restoreResult.MatchesPreState
        } catch {
            $restoreWriteNeeded = $true
            $restoreMatchesPreState = $false
            $liveLines.Add("restore_exception: $($_.Exception.Message)")
        }
        $liveLines.Add("restore_write_needed: $(if ($restoreWriteNeeded) { 'yes' } else { 'no' })")
        $liveLines.Add("restore_matches_prestate: $restoreMatchesPreState")

        # 2. Then tear down.
        #
        # NOTE (fixed live, 2026-09-30): every native-command call below discards stderr with
        # 2>$null rather than merging it with 2>&1. A first live run crashed HERE: taskkill wrote
        # an informational "ERROR: ... could not be terminated" line to its own stderr for a
        # child process that had already exited on its own (a benign race, not a defect), 2>&1
        # merged that line into the success stream as a PowerShell ErrorRecord, and
        # $ErrorActionPreference = 'Stop' turned it into a terminating NativeCommandError --
        # aborting the finally block before the process sweep below ever ran. Each teardown step
        # is ALSO wrapped in its own try/catch, so a genuinely unexpected exception here can never
        # again skip the rest of teardown, the registry re-read, or evidence being written: this
        # finally block is the operator's hard safety invariant (registry and processes restored
        # in EVERY outcome), and only a caught, logged, non-fatal path honours that inside it.
        if ($null -ne $launchedPid) {
            try {
                $launchedProcess.Refresh()
                if (-not $launchedProcess.HasExited) {
                    & taskkill.exe /PID $launchedPid /T 2>$null | Out-Null
                    $closeStart = Get-Date
                    while (((Get-Date) - $closeStart).TotalSeconds -lt $GracefulCloseBoundSeconds) {
                        $launchedProcess.Refresh()
                        if ($launchedProcess.HasExited) { break }
                        Start-Sleep -Milliseconds 500
                    }
                    $launchedProcess.Refresh()
                    if (-not $launchedProcess.HasExited) {
                        & taskkill.exe /PID $launchedPid /T /F 2>$null | Out-Null
                    }
                }
            } catch {
                $liveLines.Add("teardown_graceful_exception: $($_.Exception.Message)")
            }
        }

        # Sweep any remaining gamelib-shell.exe / gamelib-sidecar.exe whose ExecutablePath is
        # under %LOCALAPPDATA%\GameLib\. P1 proved none existed before, so every one of these is
        # ours.
        try {
            $installDirLower = $InstallDir.ToLowerInvariant()
            $sweepStart = Get-Date
            while (((Get-Date) - $sweepStart).TotalSeconds -lt $GracefulCloseBoundSeconds) {
                $remaining = Get-CimInstance Win32_Process -Filter "Name='gamelib-shell.exe' OR Name='gamelib-sidecar.exe'"
                $ours = @($remaining | Where-Object { ($null -ne $_.ExecutablePath) -and ($_.ExecutablePath.ToLowerInvariant().StartsWith($installDirLower)) })
                if ($ours.Count -eq 0) { break }
                foreach ($p in $ours) {
                    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
                }
                Start-Sleep -Milliseconds 500
            }
        } catch {
            $liveLines.Add("teardown_sweep_exception: $($_.Exception.Message)")
        }

        try {
            $finalCheck = Get-CimInstance Win32_Process -Filter "Name='gamelib-shell.exe' OR Name='gamelib-sidecar.exe'"
            $finalCount = @($finalCheck).Count
            $c8Pass = ($finalCount -eq 0)
            $liveLines.Add("c8_remaining_process_count: $finalCount")
        } catch {
            $c8Pass = $false
            $liveLines.Add("c8_check_exception: $($_.Exception.Message)")
        }

        # Informational only.
        try {
            $webviewProcs = Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'"
            $webviewMatching = @($webviewProcs | Where-Object { ($null -ne $_.CommandLine) -and ($_.CommandLine.Contains('gamelib-shell.exe.WebView2')) })
            $liveLines.Add("informational_webview2_count: $($webviewMatching.Count)")
        } catch {
            $liveLines.Add("informational_webview2_exception: $($_.Exception.Message)")
        }

        # 3. Then re-read the registry. Wrapped for the same reason as the restore step: an
        # exception here must not skip the C1-C8/VERDICT lines or the exit-code logic below --
        # the safe default on exception is invPass=false, which routes to exit 3, the loudest
        # outcome, exactly what an unreadable post-state deserves.
        try {
            $invNet = Get-CommandValueRaw
            $invSnapshot = Get-RegSnapshotText
            $invNetMatch = ($invNet.Value -eq $preStateValue) -and ($invNet.Kind -eq [Microsoft.Win32.RegistryValueKind]::String)
            $invSnapshotMatch = ($invSnapshot -eq $preStateSnapshot)
            $invPass = $invNetMatch -and $invSnapshotMatch
            $liveLines.Add("inv_net_match: $invNetMatch")
            $liveLines.Add("inv_snapshot_match: $invSnapshotMatch")
        } catch {
            $invPass = $false
            $liveLines.Add("inv_check_exception: $($_.Exception.Message)")
        }
    }

    $liveLines.Add("C1: $(if ($c1Pass) { 'PASS' } else { 'FAIL' }) $c1Detail")
    $liveLines.Add("C2: $(if ($c2Pass) { 'PASS' } else { 'FAIL' }) $c2Detail")
    $liveLines.Add("C3: $(if ($c3Pass) { 'PASS' } else { 'FAIL' }) $c3Detail")
    $liveLines.Add("C4: $(if ($c4Pass) { 'PASS' } else { 'FAIL' }) $c4Detail")
    $liveLines.Add("C5: $(if ($c5Pass) { 'PASS' } else { 'FAIL' }) $c5Detail")
    $liveLines.Add("C6: $(if ($c6Pass) { 'PASS' } else { 'FAIL' }) $c6Detail")
    $liveLines.Add("C7: $(if ($c7Pass) { 'PASS' } else { 'FAIL' }) $c7Detail")
    $liveLines.Add("C8: $(if ($c8Pass) { 'PASS' } else { 'FAIL' })")
    $liveLines.Add("INV: $(if ($invPass) { 'PASS' } else { 'FAIL' })")

    $overallPass = $c1Pass -and $c2Pass -and $c3Pass -and $c4Pass -and $c5Pass -and $c6Pass -and $c7Pass -and $c8Pass -and $invPass -and (-not $restoreWriteNeeded)
    $verdict = if ($overallPass) { 'PASS' } else { 'FAIL' }
    $liveLines.Add("VERDICT: $verdict")

    Write-EvidenceFile -Path (Join-Path $EvidenceDir 'r4-live.txt') -Lines $liveLines
    Write-EvidenceFile -Path (Join-Path $EvidenceDir 'r4-new-log-lines.txt') -Lines $matchedGamelibHkcuLines

    if ((-not $invPass) -or (-not $c8Pass)) {
        exit 3
    } elseif ($verdict -eq 'PASS') {
        exit 0
    } else {
        exit 1
    }
}
