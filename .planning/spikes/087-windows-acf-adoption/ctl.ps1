# Spike 087 control: stage ACFs and drive Steam.
#   ctl.ps1 status
#   ctl.ps1 remove            move Steam's ACF to out\ (game reads as not installed)
#   ctl.ps1 write 4|1026      atomic tmp+rename of gamelib-<v>.acf into steamapps (as production does)
#   ctl.ps1 restore           put backup\appmanifest_264160.steam-original.acf back
#   ctl.ps1 quit              steam.exe -shutdown, wait for exit
#   ctl.ps1 start             start steam.exe (no URL)
param([Parameter(Mandatory)] [string]$Action, [string]$Arg = '4')
$steam = 'C:\Program Files (x86)\Steam'
$apps = Join-Path $steam 'steamapps'
$acf = Join-Path $apps 'appmanifest_264160.acf'
$here = $PSScriptRoot
function Stamp($m) { Write-Output ("{0}  {1}" -f (Get-Date).ToUniversalTime().ToString('o'), $m) }
switch ($Action) {
  'status' {
    Stamp ("steam pids: " + ((Get-Process steam -EA SilentlyContinue | % Id) -join ','))
    Get-ItemProperty 'HKCU:\Software\Valve\Steam\ActiveProcess' | Select pid, ActiveUser | Format-List
    Get-ItemProperty 'HKCU:\Software\Valve\Steam\Apps\264160' -EA SilentlyContinue | Select Installed, Updating, Running | Format-List
    if (Test-Path $acf) { Get-Item $acf | Select LastWriteTimeUtc, Length | Format-List; Select-String '"StateFlags"' $acf } else { Stamp 'ACF absent' }
  }
  'remove' {
    New-Item -ItemType Directory -Force "$here\out" | Out-Null
    if (Test-Path $acf) { Move-Item -Force $acf "$here\out\appmanifest_264160.$((Get-Date).ToString('HHmmss')).acf"; Stamp 'ACF moved to out\' } else { Stamp 'no ACF to move' }
  }
  'write' {
    $tmp = Join-Path $apps 'appmanifest_264160.acf.tmp'
    Copy-Item -Force "$here\gamelib-$Arg.acf" $tmp
    Move-Item -Force $tmp $acf
    Stamp "wrote gamelib-$Arg.acf"
  }
  'restore' {
    Copy-Item -Force "$here\backup\appmanifest_264160.steam-original.acf" $acf
    Stamp 'restored Steam original ACF'
  }
  'quit' {
    Stamp 'steam -shutdown'
    & "$steam\steam.exe" -shutdown
    for ($i = 0; $i -lt 60; $i++) { if (-not (Get-Process steam -EA SilentlyContinue)) { Stamp "steam exited after ${i}s"; break }; Start-Sleep 1 }
    if (Get-Process steam -EA SilentlyContinue) { Stamp 'steam still running after 60s' }
  }
  'start' {
    Start-Process "$steam\steam.exe"
    Stamp 'steam started'
  }
}
