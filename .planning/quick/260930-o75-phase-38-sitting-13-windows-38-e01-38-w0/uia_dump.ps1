# UI Automation text-tree dump for 38-S16 / 38-S14 (quick 260930-o75, sitting 13).
#
# The Windows analogue of sitting 9's AT-SPI instrument: WebView2 exposes Chromium's
# accessibility tree through UIA. This walks the RAW view under every visible top-level window
# owned by the named process and records each element's control type, name, class name (for DOM
# nodes WebView2 surfaces the element's CSS class list here) and bounding rect. The output is read
# by a script, never by eye, and the copy is checked against the catalogue string exactly.
param(
  [Parameter(Mandatory)] [string] $ProcessName,
  [Parameter(Mandatory)] [string] $OutFile,
  [int] $MaxNodes = 6000
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$procs = @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue)
if ($procs.Count -eq 0) { throw "no $ProcessName process" }
$pids = $procs | ForEach-Object { $_.Id }
$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = [System.Windows.Automation.Condition]::TrueCondition
$walker = [System.Windows.Automation.TreeWalker]::RawViewWalker
$rows = New-Object System.Collections.Generic.List[object]
$tops = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $cond) |
  Where-Object { $pids -contains $_.Current.ProcessId }
function Walk($el, $depth) {
  if ($rows.Count -ge $MaxNodes) { return }
  $c = $el.Current
  $r = $c.BoundingRectangle
  $ctype = ($c.ControlType.ProgrammaticName -replace '^ControlType\.', '')
  $rows.Add([ordered]@{
      d = $depth; type = $ctype
      name = $c.Name; cls = $c.ClassName; id = $c.AutomationId
      x = $(if ($r.IsEmpty) { $null } else { [int]$r.X }); y = $(if ($r.IsEmpty) { $null } else { [int]$r.Y })
      w = $(if ($r.IsEmpty) { $null } else { [int]$r.Width }); h = $(if ($r.IsEmpty) { $null } else { [int]$r.Height })
      off = $c.IsOffscreen
    })
  $ch = $walker.GetFirstChild($el)
  while ($ch -ne $null) { Walk $ch ($depth + 1); $ch = $walker.GetNextSibling($ch) }
}
foreach ($t in $tops) { Walk $t 0 }
[ordered]@{ t = (Get-Date).ToUniversalTime().ToString('o'); pids = $pids; nodes = $rows } |
  ConvertTo-Json -Depth 5 | Set-Content -Path $OutFile -Encoding utf8
"uia nodes=$($rows.Count) tops=$(@($tops).Count) -> $OutFile"
