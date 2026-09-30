# 38-E01 independent geometry instrument (quick 260930-o75, sitting 13).
#
# The spike's own set_bounds readback is Tauri's position()/size(), i.e. the
# API reporting on itself -- spike 026 showed on Linux that such a readback can
# look right while the child never moved. This sampler measures the child HWNDs
# the OS actually holds, from outside the process: every descendant of the
# spike's top-level windows, its class, visibility, and rect in the top-level
# window's CLIENT coordinates (physical px), plus the window DPI. It writes one
# JSON line per observed change and a PNG of the top-level window on each change.
param(
  [Parameter(Mandatory)] [string] $ProcessName,
  [Parameter(Mandatory)] [string] $OutDir,
  [int] $IntervalMs = 50,
  [int] $TimeoutSec = 180,
  [switch] $NoShots
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class W {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr p, EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  public static string Cls(IntPtr h) { var s = new StringBuilder(256); GetClassName(h, s, 256); return s.ToString(); }
  public static string Txt(IntPtr h) { var s = new StringBuilder(256); GetWindowText(h, s, 256); return s.ToString(); }
  public static List<IntPtr> TopLevel(uint pid) {
    var r = new List<IntPtr>();
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); if (p == pid && IsWindowVisible(h)) r.Add(h); return true; }, IntPtr.Zero);
    return r;
  }
  public static List<IntPtr> Children(IntPtr top) {
    var r = new List<IntPtr>();
    EnumChildWindows(top, (h, l) => { r.Add(h); return true; }, IntPtr.Zero);
    return r;
  }
}
'@
# Per-monitor-v2 awareness so rects are true physical pixels, not virtualised.
[void][W]::SetProcessDpiAwarenessContext([IntPtr](-4))

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$log = Join-Path $OutDir 'hwnd-samples.jsonl'
if (Test-Path $log) { Remove-Item $log }
$deadline = (Get-Date).AddSeconds($TimeoutSec)
$proc = $null
while (-not $proc -and (Get-Date) -lt $deadline) {
  $proc = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $proc) { Start-Sleep -Milliseconds 100 }
}
if (-not $proc) { throw "process $ProcessName never appeared" }
$procId = [uint32]$proc.Id
$last = ''
$shot = 0
while (-not $proc.HasExited -and (Get-Date) -lt $deadline) {
  $snap = @()
  foreach ($top in [W]::TopLevel($procId)) {
    $origin = New-Object W+POINT
    [void][W]::ClientToScreen($top, [ref]$origin)
    $cr = New-Object W+RECT; [void][W]::GetClientRect($top, [ref]$cr)
    $kids = @()
    foreach ($c in [W]::Children($top)) {
      $r = New-Object W+RECT; [void][W]::GetWindowRect($c, [ref]$r)
      $cpid = [uint32]0; [void][W]::GetWindowThreadProcessId($c, [ref]$cpid)
      $kids += [ordered]@{
        hwnd = ('0x{0:X}' -f $c.ToInt64()); parent = ('0x{0:X}' -f ([W]::GetParent($c)).ToInt64())
        cls = [W]::Cls($c); vis = [W]::IsWindowVisible($c); sameProc = ($cpid -eq $procId)
        x = $r.L - $origin.X; y = $r.T - $origin.Y; w = $r.R - $r.L; h = $r.B - $r.T
      }
    }
    $snap += [ordered]@{
      top = ('0x{0:X}' -f $top.ToInt64()); title = [W]::Txt($top); dpi = [W]::GetDpiForWindow($top)
      clientW = $cr.R; clientH = $cr.B; screenX = $origin.X; screenY = $origin.Y; children = $kids
    }
  }
  $key = ($snap | ConvertTo-Json -Depth 6 -Compress)
  if ($key -ne $last) {
    $last = $key
    $shot++
    $png = ''
    $main = $snap | Where-Object { $_.clientW -gt 0 } | Select-Object -First 1
    if ($main -and -not $NoShots) {
      try {
        $bmp = New-Object System.Drawing.Bitmap $main.clientW, $main.clientH
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.CopyFromScreen($main.screenX, $main.screenY, 0, 0, $bmp.Size)
        $png = ('shot-{0:D3}.png' -f $shot)
        $bmp.Save((Join-Path $OutDir $png), [System.Drawing.Imaging.ImageFormat]::Png)
        $g.Dispose(); $bmp.Dispose()
      } catch { $png = "shot failed: $($_.Exception.Message)" }
    }
    $line = [ordered]@{ t = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ'); pid = $procId; shot = $png; windows = $snap }
    Add-Content -Path $log -Value ($line | ConvertTo-Json -Depth 8 -Compress) -Encoding utf8
  }
  Start-Sleep -Milliseconds $IntervalMs
}
"sampler done: exited=$($proc.HasExited) samples=$shot"
