# Spike 087 watcher: one NDJSON line per second, plus one per new content_log line.
# Oracles: steam.exe PIDs, HKCU ActiveProcess (pid, ActiveUser = 0 when signed out),
# HKCU Apps\<id> (Installed/Updating/Running), the ACF (exists, mtime, StateFlags, sha256),
# and content_log.txt appended lines.
# Usage: powershell -File watch.ps1 -Run <name> [-AppId 264160] [-Seconds 600]
param(
  [Parameter(Mandatory)] [string]$Run,
  [string]$AppId = '264160',
  [int]$Seconds = 600
)
$ErrorActionPreference = 'Continue'
$steam = 'C:\Program Files (x86)\Steam'
$acf = Join-Path $steam "steamapps\appmanifest_$AppId.acf"
$clog = Join-Path $steam 'logs\content_log.txt'
$out = Join-Path $PSScriptRoot "runs\$Run.ndjson"
New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null

function Emit($o) {
  $o['ts'] = (Get-Date).ToUniversalTime().ToString('o')
  ($o | ConvertTo-Json -Compress -Depth 4) | Add-Content -Encoding utf8 $out
}

$offset = (Get-Item $clog).Length
$prev = ''
$deadline = (Get-Date).AddSeconds($Seconds)
Emit @{ kind = 'start'; run = $Run; appId = $AppId; clogOffset = $offset }
while ((Get-Date) -lt $deadline) {
  $pids = @(Get-Process steam -ErrorAction SilentlyContinue | ForEach-Object Id)
  $ap = Get-ItemProperty 'HKCU:\Software\Valve\Steam\ActiveProcess' -ErrorAction SilentlyContinue
  $apps = Get-ItemProperty "HKCU:\Software\Valve\Steam\Apps\$AppId" -ErrorAction SilentlyContinue
  $acfState = @{ exists = $false }
  if (Test-Path $acf) {
    try {
      $txt = [IO.File]::ReadAllText($acf)
      $acfState = @{
        exists = $true
        mtime = (Get-Item $acf).LastWriteTimeUtc.ToString('o')
        flags = [regex]::Match($txt, '"StateFlags"\s+"(\d+)"').Groups[1].Value
        launcherPath = $txt.Contains('LauncherPath')
        sha = (Get-FileHash $acf -Algorithm SHA256).Hash.Substring(0, 12)
      }
    } catch { $acfState = @{ exists = $true; err = $_.Exception.Message } }
  }
  $snap = @{
    kind = 'tick'
    steamPids = $pids
    apPid = $ap.pid
    activeUser = $ap.ActiveUser
    installed = $apps.Installed
    updating = $apps.Updating
    running = $apps.Running
    acf = $acfState
  }
  # Emit a tick only when something changed, plus a heartbeat every 30 s.
  $key = ($snap | ConvertTo-Json -Compress -Depth 4)
  if ($key -ne $prev -or ((Get-Date).Second % 30 -eq 0)) { Emit $snap; $prev = $key }

  try {
    $fs = [IO.File]::Open($clog, 'Open', 'Read', 'ReadWrite')
    if ($fs.Length -lt $offset) { $offset = 0 }
    if ($fs.Length -gt $offset) {
      $fs.Seek($offset, 'Begin') | Out-Null
      $sr = New-Object IO.StreamReader($fs)
      $text = $sr.ReadToEnd()
      $offset = $fs.Length
      foreach ($l in ($text -split "`r?`n")) { if ($l) { Emit @{ kind = 'clog'; line = $l } } }
    }
    $fs.Close()
  } catch { Emit @{ kind = 'clogErr'; err = $_.Exception.Message } }
  Start-Sleep -Milliseconds 1000
}
Emit @{ kind = 'end' }
