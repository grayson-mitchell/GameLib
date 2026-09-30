#
# Login-window title instrument (quick-260930-rph). Windows PowerShell 5.1 target.
#
# Verifies that a store login window's title bar shows the origin immediately, then
# <origin> EM <document title>, and does NOT revert to the bare origin after
# PageLoadEvent::Finished (the runtime half of quick 260927-o3h's fix, ae5968b07).
#
# Modes:
#   SyntheticTarget - a WinForms process the SelfTest launches as a child. -Shape selects
#                     fix (composed title survives), bug (reverts to bare origin, the
#                     38-W03 signature) or notitle (no document title ever arrives).
#   SelfTest        - launches SyntheticTarget for each shape, scores each, and requires an
#                     independent node re-score to agree on C2-C5. Never sweeps by image name.
#   Smoke           - launches the REAL installed app, watches only for the main window (no
#                     login window is opened), then tears down and sweeps.
#   Live            - the real run against an operator-chosen store's login window.
#
# Exit codes:
#   SelfTest: 0 SELFTEST: PASS, 1 SELFTEST: FAIL.
#   Smoke:    0 SMOKE: PASS, 1 SMOKE: FAIL, 2 precondition unmet (nothing launched).
#   Live:     0 PASS, 1 FAIL, 2 precondition unmet (nothing launched),
#             3 C8 violated after teardown (the loudest outcome), 4 INCONCLUSIVE.
#

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('SelfTest', 'Smoke', 'Live', 'SyntheticTarget')]
    [string]$Mode,

    [string]$EvidenceDir = '',

    [ValidateSet('humble', 'gog', 'epic', 'amazon')]
    [string]$Store = 'humble',

    [ValidateSet('fix', 'bug', 'notitle')]
    [string]$Shape = 'fix'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# NOTE (qmu lesson, re-applied): $PSScriptRoot is not reliably populated while a default
# parameter-value expression is evaluated in this host when the param block also declares a
# Mandatory parameter. Compute the real default in the script body instead.
if ([string]::IsNullOrEmpty($EvidenceDir)) {
    $EvidenceDir = Join-Path (Split-Path -Parent $PSCommandPath) 'evidence'
}

$script:EM = [string]([char]0x2014)
$script:SelfTestOrigin = 'https://selftest.invalid'

# ---- Evidence writer: UTF-8 without BOM, LF-only line endings ----

function Write-EvidenceFile {
    param([string]$Path, [string[]]$Lines)
    $body = ''
    if ($Lines.Count -gt 0) {
        $body = ($Lines -join "`n") + "`n"
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $body, $utf8NoBom)
}

# Escapes every character outside 0x20-0x7E as \uXXXX. Used for any title or free-text value
# written into an evidence file, per this task's pure-ASCII evidence rule. Does NOT escape
# quote/backslash -- callers embedding a value inside a hand-built JSON string additionally
# run it through ConvertTo-JsonAsciiString below.
function ConvertTo-AsciiSafe {
    param([string]$Text)
    if ($null -eq $Text) { return '' }
    $sb = New-Object System.Text.StringBuilder
    foreach ($ch in $Text.ToCharArray()) {
        $code = [int]$ch
        if ($code -ge 0x20 -and $code -le 0x7E) {
            [void]$sb.Append($ch)
        } else {
            [void]$sb.Append('\u' + $code.ToString('x4'))
        }
    }
    return $sb.ToString()
}

# As above, plus JSON string escaping (quote, backslash, and the three common control
# escapes). The result is safe to place between double quotes in a hand-built JSON line.
function ConvertTo-JsonAsciiString {
    param([string]$Text)
    if ($null -eq $Text) { return '' }
    $sb = New-Object System.Text.StringBuilder
    foreach ($ch in $Text.ToCharArray()) {
        $code = [int]$ch
        if ($ch -eq '"') { [void]$sb.Append('\"') }
        elseif ($ch -eq '\') { [void]$sb.Append('\\') }
        elseif ($code -eq 10) { [void]$sb.Append('\n') }
        elseif ($code -eq 13) { [void]$sb.Append('\r') }
        elseif ($code -eq 9) { [void]$sb.Append('\t') }
        elseif ($code -ge 0x20 -and $code -le 0x7E) { [void]$sb.Append($ch) }
        else { [void]$sb.Append('\u' + $code.ToString('x4')) }
    }
    return $sb.ToString()
}

# ---- SyntheticTarget mode: a WinForms process, run as a child under the SAME launcher ----
# Handled first and exits early: this mode shares nothing else with the rest of the script.

if ($Mode -eq 'SyntheticTarget') {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $originStr = $script:SelfTestOrigin
    $composedFirst = $originStr + ' ' + $script:EM + ' ' + 'Synthetic Log In'
    $composedTransient = $originStr + ' ' + $script:EM + ' ' + 'Transient'

    $mainForm = New-Object System.Windows.Forms.Form
    $mainForm.Text = 'GameLib'
    $mainForm.Width = 220
    $mainForm.Height = 120
    $mainForm.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
    $mainForm.Location = New-Object System.Drawing.Point(0, 0)

    $loginForm = New-Object System.Windows.Forms.Form
    $loginForm.Text = ''
    $loginForm.Visible = $false
    $loginForm.Width = 220
    $loginForm.Height = 120
    $loginForm.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
    $loginForm.Location = New-Object System.Drawing.Point(400, 0)

    $mainForm.Show()

    $script:swLocal = [System.Diagnostics.Stopwatch]::StartNew()
    $script:phase = 0
    $script:transientAt = -1

    $timer = New-Object System.Windows.Forms.Timer
    $timer.Interval = 30
    $timer.Add_Tick({
        $elapsed = $script:swLocal.Elapsed.TotalMilliseconds
        if ($script:phase -eq 0 -and $elapsed -ge 1000) {
            $loginForm.Text = $originStr
            [Console]::Error.WriteLine('[shell] humble_login_open: presentation requested visible=true width=900 height=700 center=true focus_once=true persistent_pin=false light_theme_requested=true sheet_presented=false')
            $loginForm.Visible = $true
            $script:phase = 1
        } elseif ($script:phase -eq 1 -and $Shape -ne 'notitle' -and $elapsed -ge 1400) {
            [Console]::Error.WriteLine('[shell] humble_login_open: title change applied len=16')
            $loginForm.Text = $composedFirst
            $script:phase = 2
        } elseif ($script:phase -eq 2 -and $elapsed -ge 1700) {
            $loginForm.Text = $composedTransient
            $script:transientAt = $elapsed
            $script:phase = 3
        } elseif ($script:phase -eq 3 -and $script:transientAt -ge 0 -and ($elapsed - $script:transientAt) -ge 60) {
            $loginForm.Text = $composedFirst
            $script:phase = 4
        } elseif ($script:phase -eq 4 -and $Shape -eq 'bug' -and $elapsed -ge 2000) {
            $loginForm.Text = $originStr
            $script:phase = 5
        }
    })
    $timer.Start()

    [Console]::Out.WriteLine('synthetic stdout line')
    [Console]::Error.WriteLine('SELFTEST-DROPPED-MARKER')

    [System.Windows.Forms.Application]::Run($mainForm)
    exit 0
}

# ---- Shared setup for SelfTest / Smoke / Live ----

if (-not (Test-Path -LiteralPath $EvidenceDir)) {
    New-Item -ItemType Directory -Force -Path $EvidenceDir | Out-Null
}

$RphRescorePath = Join-Path (Split-Path -Parent $PSCommandPath) 'rph-rescore.cjs'

$csharpCode = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

public static class Native
{
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumChildWindows(IntPtr hWndParent, EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowTextLengthW(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetClassNameW(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern IntPtr PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    [DllImport("winmm.dll")]
    public static extern uint timeBeginPeriod(uint uPeriod);

    [DllImport("winmm.dll")]
    public static extern uint timeEndPeriod(uint uPeriod);

    [DllImport("oleacc.dll")]
    public static extern int AccessibleObjectFromWindow(IntPtr hwnd, uint dwId, ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppvObject);

    public const uint WM_CLOSE = 0x0010;
    public const uint OBJID_CLIENT = unchecked((uint)0xFFFFFFFC);
    public static readonly Guid IID_IAccessible = new Guid("618736e0-3c3d-11cf-810c-00aa00389b71");
}

public class TitleEvent
{
    public double TMs;
    public string Utc;
    public string Hwnd;
    public string EvType;
    public bool Vis;
    public string Title;
}

public class GapSample
{
    public double TMs;
    public double GapMs;
}

public class KeptLine
{
    public double TMs;
    public string Line;
}

public class ProbeTransition
{
    public double TMs;
    public bool Busy;
    public int NameLen;
}

public class WinState
{
    public bool Vis;
    public string Title;
    public string Cls;
}

// Non-content OS/framework helper windows a launched GUI process creates alongside its real
// application window(s): tao/wry's internal message-only event-dispatch window, IME/TSF
// helper windows Windows attaches to every GUI thread, and (only in the SelfTest synthetic
// target) WinForms/GDI+ diagnostic windows. None of these is ever the MAIN or LOGIN window,
// and excluding them from identification (while still recording their timeline events like
// any other window) avoids a measured race: "Tao Thread Event Target" was observed reporting
// IsWindowVisible() true within single-digit milliseconds of the real Tauri main window on
// this machine, so the FIRST-observed-visible rule alone is not sufficient to name MAIN.
public static class HelperWindowClasses
{
    private static readonly HashSet<string> Exact = new HashSet<string>(new string[] {
        "Tao Thread Event Target",
        "MSCTFIME UI",
        "IME",
        "tray_icon_app"
    });

    public static bool IsHelper(string cls)
    {
        if (string.IsNullOrEmpty(cls)) return false;
        if (Exact.Contains(cls)) return true;
        if (cls.StartsWith(".NET-BroadcastEventWindow")) return true;
        if (cls.StartsWith("GDI+ Window")) return true;
        return false;
    }
}

public class TitleShape
{
    public bool Matches;
    public string Origin;
    public string DocTitle;

    public bool IsComposed()
    {
        return DocTitle != null && DocTitle.Length > 0;
    }
}

public class ProbeResult
{
    public bool Found;
    public bool Busy;
    public int NameLen;
    public bool Errored;
    public string ErrorMsg;
}

public static class TitleParse
{
    // ^(https://host(:port)?)( EM (doctitle))?$ -- EM is U+2014 flanked by single spaces.
    public static readonly Regex OriginRegex = new Regex(
        "^(https://[A-Za-z0-9.-]+(:[0-9]+)?)( \u2014 (.+))?$",
        RegexOptions.Compiled);

    public static TitleShape Parse(string title)
    {
        var r = new TitleShape();
        var m = OriginRegex.Match(title == null ? "" : title);
        if (!m.Success)
        {
            r.Matches = false;
            return r;
        }
        r.Matches = true;
        r.Origin = m.Groups[1].Value;
        r.DocTitle = m.Groups[3].Success ? m.Groups[4].Value : null;
        return r;
    }
}

public static class ProbeHelper
{
    private static List<IntPtr> _scratch;

    private static bool ChildEnumCallback(IntPtr hWnd, IntPtr lParam)
    {
        _scratch.Add(hWnd);
        return true;
    }

    public static ProbeResult TryOnce(IntPtr topHwnd)
    {
        var r = new ProbeResult();
        try
        {
            _scratch = new List<IntPtr>();
            Native.EnumWindowsProc cb = new Native.EnumWindowsProc(ChildEnumCallback);
            Native.EnumChildWindows(topHwnd, cb, IntPtr.Zero);
            IntPtr target = IntPtr.Zero;
            foreach (var h in _scratch)
            {
                var sb = new StringBuilder(256);
                Native.GetClassNameW(h, sb, sb.Capacity);
                if (sb.ToString() == "Chrome_RenderWidgetHostHWND")
                {
                    target = h;
                    break;
                }
            }
            if (target == IntPtr.Zero)
            {
                r.Found = false;
                return r;
            }
            r.Found = true;
            object accObj;
            var iid = Native.IID_IAccessible;
            int hr = Native.AccessibleObjectFromWindow(target, Native.OBJID_CLIENT, ref iid, out accObj);
            if (hr != 0 || accObj == null)
            {
                r.Errored = true;
                r.ErrorMsg = "AccessibleObjectFromWindow hr=" + hr;
                return r;
            }
            var acc = accObj as Accessibility.IAccessible;
            if (acc == null)
            {
                r.Errored = true;
                r.ErrorMsg = "cast-to-IAccessible-failed";
                return r;
            }
            object stateObj = acc.get_accState(0);
            int state = Convert.ToInt32(stateObj);
            r.Busy = (state & 0x800) != 0;
            string name = null;
            try { name = acc.get_accName(0); } catch { name = null; }
            r.NameLen = name == null ? 0 : name.Length;
            return r;
        }
        catch (Exception ex)
        {
            r.Errored = true;
            r.ErrorMsg = ex.Message;
            return r;
        }
    }
}

public class Instrument
{
    public Stopwatch Sw = new Stopwatch();
    public string LaunchUtc;
    public uint LaunchedPid;
    public uint TargetPid;
    public Process Proc;

    public Regex[] WhitelistPatterns = new Regex[] {
        new Regex(@"^\[shell\] humble_login_open: title change applied len=\d+$", RegexOptions.Compiled),
        new Regex(@"^\[shell\] humble_login_open: title change SKIPPED len=0 \(empty document title; previous title retained\)$", RegexOptions.Compiled),
        new Regex(@"^\[shell\] humble_login_open: presentation requested visible=true width=900 height=700 center=true focus_once=true persistent_pin=false light_theme_requested=true sheet_presented=(true|false)$", RegexOptions.Compiled)
    };

    private readonly object _lock = new object();
    public List<TitleEvent> Events = new List<TitleEvent>();
    public List<GapSample> Gaps = new List<GapSample>();
    public List<KeptLine> KeptStderr = new List<KeptLine>();
    public List<ProbeTransition> ProbeTransitions = new List<ProbeTransition>();

    private long _stderrTotal = 0;
    private long _stdoutTotal = 0;
    public long StderrLinesTotal { get { return Interlocked.Read(ref _stderrTotal); } }
    public long StdoutLinesTotal { get { return Interlocked.Read(ref _stdoutTotal); } }

    private Dictionary<string, WinState> _known = new Dictionary<string, WinState>();
    private List<IntPtr> _scratchTop = new List<IntPtr>();
    private Native.EnumWindowsProc _topEnumCb;

    public volatile bool StopSampler = false;
    public volatile bool StopProbe = false;

    public volatile bool MainSeen = false;
    public string MainHwndHex = null;
    public IntPtr MainHwnd = IntPtr.Zero;
    public string MainTitle = null;
    public double MainSeenTMs = -1;

    public bool MainProbeDone = false;
    public bool MainProbeFound = false;
    public bool MainProbeBusy = false;
    public int MainProbeNameLen = 0;
    public bool MainProbeErrored = false;
    public string MainProbeErrorMsg = null;

    public volatile bool LoginKnown = false;
    public string LoginHwndHex = null;
    public IntPtr LoginHwnd = IntPtr.Zero;
    public double LoginOpenTMs = -1;
    public string LoginLastTitle = null;
    public double LoginLastChangeTMs = -1;
    public volatile bool LoginVanished = false;
    public double LoginVanishTMs = -1;
    public List<string> LoginCandidateHexes = new List<string>();

    public volatile bool ProbeEnabled = false;
    public volatile bool ProbeBusyCurrent = false;
    public volatile bool ProbeFoundEver = false;
    private bool _probeLastBusy = false;
    private bool _probeHaveLast = false;
    public long ProbeFoundCount = 0;
    public long ProbeNotFoundCount = 0;
    public long ProbeErrorCount = 0;

    public double ClosePostedTMs = -1;

    private Thread _samplerThread;
    private Thread _probeThread;

    public void HookProcess(Process p)
    {
        Proc = p;
        p.OutputDataReceived += new DataReceivedEventHandler(OnStdout);
        p.ErrorDataReceived += new DataReceivedEventHandler(OnStderr);
    }

    private void OnStdout(object sender, DataReceivedEventArgs e)
    {
        if (e.Data == null) return;
        Interlocked.Increment(ref _stdoutTotal);
    }

    private void OnStderr(object sender, DataReceivedEventArgs e)
    {
        if (e.Data == null) return;
        Interlocked.Increment(ref _stderrTotal);
        for (int i = 0; i < WhitelistPatterns.Length; i++)
        {
            if (WhitelistPatterns[i].IsMatch(e.Data))
            {
                double t = Sw.Elapsed.TotalMilliseconds;
                lock (_lock) { KeptStderr.Add(new KeptLine { TMs = t, Line = e.Data }); }
                break;
            }
        }
    }

    private string GetTitle(IntPtr h)
    {
        int len = Native.GetWindowTextLengthW(h);
        if (len <= 0) return "";
        var sb = new StringBuilder(len + 2);
        Native.GetWindowTextW(h, sb, sb.Capacity);
        return sb.ToString();
    }

    private string GetClass(IntPtr h)
    {
        var sb = new StringBuilder(256);
        Native.GetClassNameW(h, sb, sb.Capacity);
        return sb.ToString();
    }

    private void AddEvent(double tMs, string hex, string evType, bool vis, string title)
    {
        var ev = new TitleEvent
        {
            TMs = tMs,
            Utc = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
            Hwnd = hex,
            EvType = evType,
            Vis = vis,
            Title = title
        };
        lock (_lock) { Events.Add(ev); }
    }

    private void HandleNewlyVisible(string hex, IntPtr hwnd, string title, double nowT)
    {
        if (!MainSeen)
        {
            MainSeen = true;
            MainHwndHex = hex;
            MainHwnd = hwnd;
            MainTitle = title;
            MainSeenTMs = nowT;
            return;
        }
        if (hex == MainHwndHex) return;
        var shape = TitleParse.Parse(title);
        if (shape.Matches)
        {
            LoginCandidateHexes.Add(hex);
            if (LoginHwndHex == null)
            {
                LoginHwndHex = hex;
                LoginHwnd = hwnd;
                LoginOpenTMs = nowT;
                LoginLastTitle = title;
                LoginLastChangeTMs = nowT;
                LoginKnown = true;
            }
        }
    }

    private bool TopEnumCallback(IntPtr hWnd, IntPtr lParam)
    {
        uint pid;
        Native.GetWindowThreadProcessId(hWnd, out pid);
        if (pid == TargetPid) _scratchTop.Add(hWnd);
        return true;
    }

    public void StartSampler()
    {
        _topEnumCb = new Native.EnumWindowsProc(TopEnumCallback);
        _samplerThread = new Thread(new ThreadStart(SamplerLoop));
        _samplerThread.IsBackground = true;
        _samplerThread.Start();
    }

    private void SamplerLoop()
    {
        Native.timeBeginPeriod(1);
        try
        {
            double lastLoopT = 0;
            bool first = true;
            while (!StopSampler)
            {
                double nowT = Sw.Elapsed.TotalMilliseconds;
                if (!first)
                {
                    Gaps.Add(new GapSample { TMs = nowT, GapMs = nowT - lastLoopT });
                }
                first = false;
                lastLoopT = nowT;

                _scratchTop.Clear();
                Native.EnumWindows(_topEnumCb, IntPtr.Zero);

                var seenNow = new HashSet<string>();
                foreach (var h in _scratchTop)
                {
                    string hex = "0x" + h.ToInt64().ToString("X");
                    seenNow.Add(hex);
                    bool vis = Native.IsWindowVisible(h);
                    string title = GetTitle(h);

                    WinState prev;
                    bool known = _known.TryGetValue(hex, out prev);
                    if (!known)
                    {
                        string cls = GetClass(h);
                        _known[hex] = new WinState { Vis = vis, Title = title, Cls = cls };
                        AddEvent(nowT, hex, "appear", vis, title);
                        if (vis && !HelperWindowClasses.IsHelper(cls)) HandleNewlyVisible(hex, h, title, nowT);
                    }
                    else
                    {
                        bool titleChanged = title != prev.Title;
                        bool visChanged = vis != prev.Vis;
                        bool becameVisible = visChanged && vis;
                        if (titleChanged)
                        {
                            AddEvent(nowT, hex, "change", vis, title);
                            if (hex == LoginHwndHex)
                            {
                                LoginLastTitle = title;
                                LoginLastChangeTMs = nowT;
                            }
                            if (hex == MainHwndHex)
                            {
                                MainTitle = title;
                            }
                        }
                        else if (visChanged)
                        {
                            AddEvent(nowT, hex, "vis", vis, title);
                        }
                        if (becameVisible && !HelperWindowClasses.IsHelper(prev.Cls)) HandleNewlyVisible(hex, h, title, nowT);
                        prev.Vis = vis;
                        prev.Title = title;
                        _known[hex] = prev;
                    }
                }

                var goneKeys = new List<string>();
                foreach (var kv in _known)
                {
                    if (!seenNow.Contains(kv.Key)) goneKeys.Add(kv.Key);
                }
                foreach (var hex in goneKeys)
                {
                    var prevState = _known[hex];
                    AddEvent(nowT, hex, "vanish", false, prevState.Title);
                    _known.Remove(hex);
                    if (hex == LoginHwndHex)
                    {
                        LoginVanished = true;
                        LoginVanishTMs = nowT;
                    }
                }

                Thread.Sleep(5);
            }
        }
        finally
        {
            Native.timeEndPeriod(1);
        }
    }

    public void StartProbeThread()
    {
        ProbeEnabled = true;
        _probeThread = new Thread(new ThreadStart(ProbeLoop));
        _probeThread.IsBackground = true;
        _probeThread.SetApartmentState(ApartmentState.STA);
        _probeThread.Start();
    }

    private void ProbeLoop()
    {
        while (!StopProbe)
        {
            if (LoginHwnd != IntPtr.Zero)
            {
                var r = ProbeHelper.TryOnce(LoginHwnd);
                double nowT = Sw.Elapsed.TotalMilliseconds;
                if (r.Errored)
                {
                    Interlocked.Increment(ref ProbeErrorCount);
                }
                else if (!r.Found)
                {
                    Interlocked.Increment(ref ProbeNotFoundCount);
                }
                else
                {
                    Interlocked.Increment(ref ProbeFoundCount);
                    ProbeFoundEver = true;
                    ProbeBusyCurrent = r.Busy;
                    if (!_probeHaveLast || _probeLastBusy != r.Busy)
                    {
                        lock (_lock) { ProbeTransitions.Add(new ProbeTransition { TMs = nowT, Busy = r.Busy, NameLen = r.NameLen }); }
                        _probeLastBusy = r.Busy;
                        _probeHaveLast = true;
                    }
                }
            }
            Thread.Sleep(100);
        }
    }

    private void RunTaskkill(uint pid, bool force)
    {
        try
        {
            var args = "/PID " + pid.ToString() + " /T" + (force ? " /F" : "");
            var psi = new ProcessStartInfo("taskkill.exe", args);
            psi.UseShellExecute = false;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            psi.CreateNoWindow = true;
            using (var p = Process.Start(psi))
            {
                p.WaitForExit(5000);
            }
        }
        catch { }
    }

    private bool ProcHasExitedSafe()
    {
        try { return Proc.HasExited; } catch { return true; }
    }

    private void WaitExitBounded(int ms)
    {
        int start = Environment.TickCount;
        while (unchecked(Environment.TickCount - start) < ms)
        {
            if (ProcHasExitedSafe()) return;
            Thread.Sleep(200);
        }
    }

    public void Teardown()
    {
        try
        {
            if (!ProcHasExitedSafe())
            {
                RunTaskkill(LaunchedPid, false);
                WaitExitBounded(10000);
            }
        }
        catch { }
        try
        {
            if (!ProcHasExitedSafe())
            {
                RunTaskkill(LaunchedPid, true);
            }
        }
        catch { }
        try { Proc.WaitForExit(15000); } catch { }
        try { Proc.CancelErrorRead(); } catch { }
        try { Proc.CancelOutputRead(); } catch { }
        try { Proc.Dispose(); } catch { }
    }

    public int LaunchAndWatch(ProcessStartInfo psi, double quiescenceMs, double tailMs, double hardBoundMs, double loginBoundMs, bool doProbe)
    {
        LaunchUtc = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
        Sw.Start();
        var p = new Process();
        p.StartInfo = psi;
        p.EnableRaisingEvents = true;
        HookProcess(p);
        p.Start();
        LaunchedPid = (uint)p.Id;
        TargetPid = LaunchedPid;
        p.BeginErrorReadLine();
        p.BeginOutputReadLine();

        StartSampler();

        bool probeStarted = false;
        bool closePosted = false;
        double loopStartT = Sw.Elapsed.TotalMilliseconds;

        while (true)
        {
            double nowT = Sw.Elapsed.TotalMilliseconds;

            if (doProbe && LoginKnown && !probeStarted)
            {
                StartProbeThread();
                probeStarted = true;
            }

            if (LoginKnown && LoginVanished) break;

            if (!closePosted && LoginKnown)
            {
                double sinceChange = nowT - LoginLastChangeTMs;
                bool busy = doProbe && ProbeBusyCurrent;
                if (sinceChange >= quiescenceMs && !busy)
                {
                    uint pid;
                    Native.GetWindowThreadProcessId(LoginHwnd, out pid);
                    if (pid == TargetPid)
                    {
                        Native.PostMessage(LoginHwnd, Native.WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
                        ClosePostedTMs = nowT;
                        closePosted = true;
                    }
                }
            }

            if (!LoginKnown && (nowT - loopStartT) > loginBoundMs) break;
            if (nowT > hardBoundMs) break;
            if (ProcHasExitedSafe()) break;

            Thread.Sleep(50);
        }

        if (LoginKnown && !LoginVanished)
        {
            double waitStart = Sw.Elapsed.TotalMilliseconds;
            while (!LoginVanished && (Sw.Elapsed.TotalMilliseconds - waitStart) < 10000)
            {
                Thread.Sleep(50);
            }
        }

        Thread.Sleep((int)tailMs);

        StopSampler = true;
        StopProbe = true;

        Teardown();

        return 0;
    }

    // Smoke-only orchestration: no LOGIN is ever expected, so this does NOT reuse
    // LaunchAndWatch's quiescence/LOGIN-close loop (which would otherwise run for the full
    // loginBoundMs every time, since LOGIN never appears). Waits up to mainBoundMs for MAIN,
    // then observes for observeMs more, running the ONE-SHOT probe check partway through that
    // observation window (giving WebView2 a moment to create its render-widget child) -- all
    // BEFORE teardown, since a probe against an already-killed window can only ever fail.
    public int RunSmoke(ProcessStartInfo psi, double mainBoundMs, double observeMs)
    {
        LaunchUtc = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
        Sw.Start();
        var p = new Process();
        p.StartInfo = psi;
        p.EnableRaisingEvents = true;
        HookProcess(p);
        p.Start();
        LaunchedPid = (uint)p.Id;
        TargetPid = LaunchedPid;
        p.BeginErrorReadLine();
        p.BeginOutputReadLine();

        StartSampler();

        double loopStartT = Sw.Elapsed.TotalMilliseconds;
        while (!MainSeen && (Sw.Elapsed.TotalMilliseconds - loopStartT) < mainBoundMs)
        {
            if (ProcHasExitedSafe()) break;
            Thread.Sleep(50);
        }

        if (MainSeen)
        {
            double observeStart = Sw.Elapsed.TotalMilliseconds;
            double probeAtMs = Math.Min(observeMs * 0.5, 3000.0);
            bool probed = false;
            while ((Sw.Elapsed.TotalMilliseconds - observeStart) < observeMs)
            {
                if (!probed && (Sw.Elapsed.TotalMilliseconds - observeStart) >= probeAtMs)
                {
                    probed = true;
                    var r = ProbeHelper.TryOnce(MainHwnd);
                    MainProbeFound = r.Found;
                    MainProbeBusy = r.Busy;
                    MainProbeNameLen = r.NameLen;
                    MainProbeErrored = r.Errored;
                    MainProbeErrorMsg = r.ErrorMsg;
                    MainProbeDone = true;
                }
                if (ProcHasExitedSafe()) break;
                Thread.Sleep(50);
            }
        }

        StopSampler = true;
        StopProbe = true;

        Teardown();

        return 0;
    }
}
'@

$accDllPath = Join-Path ([System.Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()) 'Accessibility.dll'
Add-Type -TypeDefinition $csharpCode -ReferencedAssemblies @('System.dll', 'System.Core.dll', $accDllPath) -Language CSharp

# ---- Preconditions (Smoke and Live only): read-only, before any launch ----

function Invoke-Preconditions {
    $lines = New-Object System.Collections.Generic.List[string]
    $allPass = $true

    $procs = Get-CimInstance Win32_Process -Filter "Name='gamelib-shell.exe' OR Name='gamelib-sidecar.exe'"
    $procCount = @($procs).Count
    $p1Pass = ($procCount -eq 0)
    $lines.Add("P1: $(if ($p1Pass) { 'PASS' } else { 'FAIL' }) process_count=$procCount")
    if (-not $p1Pass) { $allPass = $false }

    $installedExe = Join-Path $env:LOCALAPPDATA 'GameLib\gamelib-shell.exe'
    $identityPath = Join-Path $EvidenceDir 'rph-build-identity.txt'
    $expectedSha = ''
    if (Test-Path -LiteralPath $identityPath) {
        $idLines = Get-Content -LiteralPath $identityPath
        foreach ($l in $idLines) {
            if ($l -match '^sha256:\s*(\S+)$') { $expectedSha = $Matches[1] }
        }
    }
    $p2ExeExists = Test-Path -LiteralPath $installedExe
    $p2HashMatch = $false
    $p2Hash = ''
    if ($p2ExeExists -and $expectedSha -ne '') {
        $p2Hash = (Get-FileHash -LiteralPath $installedExe -Algorithm SHA256).Hash
        $p2HashMatch = ($p2Hash.ToLowerInvariant() -eq $expectedSha.ToLowerInvariant())
    }
    $p2Pass = $p2ExeExists -and $p2HashMatch
    $lines.Add("P2: $(if ($p2Pass) { 'PASS' } else { 'FAIL' }) exists=$p2ExeExists hash_match=$p2HashMatch")
    if (-not $p2Pass) { $allPass = $false }

    $p3Pass = ($env:CI -ne 'e2e')
    $lines.Add("P3: $(if ($p3Pass) { 'PASS' } else { 'FAIL' }) CI=[$env:CI]")
    if (-not $p3Pass) { $allPass = $false }

    $homeVal = $env:HOME
    $userProfileVal = $env:USERPROFILE
    $homeSet = -not [string]::IsNullOrEmpty($homeVal)
    $homeEqualsUserProfile = $false
    if ($homeSet -and -not [string]::IsNullOrEmpty($userProfileVal)) {
        $homeEqualsUserProfile = ($homeVal.ToLowerInvariant() -eq $userProfileVal.ToLowerInvariant())
    }
    $lines.Add("P4: INFO home_set=$homeSet home_equals_userprofile=$homeEqualsUserProfile")

    $logPath = $null
    $logOffsetBytes = 0
    $logLineCount = 0
    $logExists = $false
    if ($homeSet) {
        $logPath = Join-Path $homeVal '.config\gamelib\gamelib-shell.log'
        $logExists = Test-Path -LiteralPath $logPath
        if ($logExists) {
            $item = Get-Item -LiteralPath $logPath
            $logOffsetBytes = $item.Length
            $rawBytes = [System.IO.File]::ReadAllBytes($logPath)
            $text = [System.Text.Encoding]::UTF8.GetString($rawBytes)
            $logLineCount = @($text -split "`n" | Where-Object { $_ -ne '' }).Count
        }
    }
    $lines.Add("P5: INFO exists=$logExists offset_bytes=$logOffsetBytes line_count=$logLineCount")

    return New-Object PSObject -Property @{
        AllPass        = $allPass
        Lines          = $lines
        InstalledExe   = $installedExe
        LogPath        = $logPath
        LogOffsetBytes = $logOffsetBytes
    }
}

# ---- Image-name sweep (PowerShell layer, Smoke and Live only; SelfTest never sweeps) ----

function Invoke-ImageNameSweep {
    $installDirLower = (Join-Path $env:LOCALAPPDATA 'GameLib').ToLowerInvariant()
    $sweepStart = Get-Date
    while (((Get-Date) - $sweepStart).TotalSeconds -lt 10) {
        $remaining = Get-CimInstance Win32_Process -Filter "Name='gamelib-shell.exe' OR Name='gamelib-sidecar.exe'"
        $ours = @($remaining | Where-Object { ($null -ne $_.ExecutablePath) -and ($_.ExecutablePath.ToLowerInvariant().StartsWith($installDirLower)) })
        if ($ours.Count -eq 0) { break }
        foreach ($p in $ours) {
            try { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue } catch { }
        }
        Start-Sleep -Milliseconds 500
    }
    $finalCheck = Get-CimInstance Win32_Process -Filter "Name='gamelib-shell.exe' OR Name='gamelib-sidecar.exe'"
    $finalCount = @($finalCheck).Count
    $webviewProcs = Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'"
    $webviewMatching = @($webviewProcs | Where-Object { ($null -ne $_.CommandLine) -and ($_.CommandLine.Contains('gamelib-shell.exe.WebView2')) })
    return New-Object PSObject -Property @{
        C8Pass                 = ($finalCount -eq 0)
        RemainingCount         = $finalCount
        WebviewInformational   = $webviewMatching.Count
    }
}

# ---- Timeline JSONL writer ----

function Write-TimelineJsonl {
    param($Instrument, [string]$Path, [double]$QuiescenceMs, [double]$TailMs, [double]$HardBoundMs, [double]$LoginBoundMs)
    $lines = New-Object System.Collections.Generic.List[string]
    $metaLine = '{"ev":"meta","pid":' + $Instrument.LaunchedPid + ',"launch_utc":"' + (ConvertTo-JsonAsciiString $Instrument.LaunchUtc) + '","quiescence_ms":' + $QuiescenceMs + ',"tail_ms":' + $TailMs + ',"hard_bound_ms":' + $HardBoundMs + ',"login_bound_ms":' + $LoginBoundMs + '}'
    $lines.Add($metaLine)
    foreach ($ev in $Instrument.Events) {
        $t = [string]::Format([System.Globalization.CultureInfo]::InvariantCulture, '{0:0.0}', $ev.TMs)
        $visStr = if ($ev.Vis) { 'true' } else { 'false' }
        $titleEsc = ConvertTo-JsonAsciiString $ev.Title
        $line = '{"ev":"' + $ev.EvType + '","t_ms":' + $t + ',"utc":"' + (ConvertTo-JsonAsciiString $ev.Utc) + '","hwnd":"' + $ev.Hwnd + '","vis":' + $visStr + ',"title":"' + $titleEsc + '"}'
        $lines.Add($line)
    }
    $endT = [string]::Format([System.Globalization.CultureInfo]::InvariantCulture, '{0:0.0}', $Instrument.Sw.Elapsed.TotalMilliseconds)
    $lines.Add('{"ev":"end","t_ms":' + $endT + '}')
    Write-EvidenceFile -Path $Path -Lines $lines
}

# ---- C0 cadence stats ----

function Get-CadenceStats {
    param($Gaps, [double]$LoginOpenTMs)
    if ($Gaps.Count -eq 0) {
        return New-Object PSObject -Property @{ P50 = 0.0; P99 = 0.0; Max = 0.0; MaxNearOpen = 0.0; Pass = $true }
    }
    $sorted = $Gaps | Sort-Object -Property GapMs
    $n = $sorted.Count
    $p50idx = [int][Math]::Floor(0.50 * ($n - 1))
    $p99idx = [int][Math]::Floor(0.99 * ($n - 1))
    $p50 = $sorted[$p50idx].GapMs
    $p99 = $sorted[$p99idx].GapMs
    $max = ($sorted[$n - 1]).GapMs
    $maxNearOpen = 0.0
    if ($LoginOpenTMs -ge 0) {
        $lo = $LoginOpenTMs - 1000
        $hi = $LoginOpenTMs + 15000
        foreach ($g in $Gaps) {
            if ($g.TMs -ge $lo -and $g.TMs -le $hi -and $g.GapMs -gt $maxNearOpen) { $maxNearOpen = $g.GapMs }
        }
    }
    $pass = ($p99 -le 50) -and ($maxNearOpen -le 250)
    return New-Object PSObject -Property @{ P50 = $p50; P99 = $p99; Max = $max; MaxNearOpen = $maxNearOpen; Pass = $pass }
}

# ---- The scorer (C0-C9, FIN-A/FIN-B, verdict) ----

function Get-TitleShape {
    param([string]$Title)
    if ($null -eq $Title) { $Title = '' }
    $pattern = '^(https://[A-Za-z0-9.\-]+(:[0-9]+)?)( ' + [regex]::Escape($script:EM) + ' (.+))?$'
    $rx = New-Object System.Text.RegularExpressions.Regex($pattern)
    $m = $rx.Match($Title)
    if (-not $m.Success) {
        return New-Object PSObject -Property @{ Matches = $false; Origin = $null; DocTitle = $null }
    }
    $doc = $null
    if ($m.Groups[3].Success) { $doc = $m.Groups[4].Value }
    return New-Object PSObject -Property @{ Matches = $true; Origin = $m.Groups[1].Value; DocTitle = $doc }
}

function Score-Timeline {
    param(
        $Instrument,
        [double]$HoldMs,
        [string]$ControlledOrigin,
        [string]$ExpectOrigin,
        [bool]$ProbeChannelEnabled,
        [double]$LoginBoundMs
    )

    $lines = New-Object System.Collections.Generic.List[string]
    $c = @{}

    $cadence = Get-CadenceStats -Gaps $Instrument.Gaps -LoginOpenTMs $Instrument.LoginOpenTMs
    $c0 = if ($cadence.Pass) { 'PASS' } else { 'INCONCLUSIVE' }
    $lines.Add("C0: $c0 p99=$([math]::Round($cadence.P99,2)) max_near_open=$([math]::Round($cadence.MaxNearOpen,2))")
    $c['C0'] = $c0

    $c1Count = $Instrument.LoginCandidateHexes.Count
    $c1 = if ($c1Count -eq 1) { 'PASS' } elseif ($c1Count -eq 0) { 'INCONCLUSIVE_NOWINDOW' } else { 'INCONCLUSIVE_MULTIPLE' }
    $lines.Add("C1: $c1 candidate_count=$c1Count")
    $c['C1'] = $c1

    $scored = @($Instrument.Events | Where-Object { $_.Hwnd -eq $Instrument.LoginHwndHex -and ($_.Vis -eq $true -or $_.EvType -eq 'vanish') })

    $c2 = 'PASS'
    $firstTitle = $null
    $originMismatch = $false
    foreach ($ev in $scored) {
        if ($ev.EvType -eq 'vanish') { continue }
        $shape = Get-TitleShape -Title $ev.Title
        if ($null -eq $firstTitle) { $firstTitle = $ev.Title }
        if (-not $shape.Matches) { $c2 = 'FAIL'; break }
    }
    if ($Store -eq 'humble' -and $null -ne $firstTitle) {
        $firstShape = Get-TitleShape -Title $firstTitle
        if ($firstShape.Matches -and $firstShape.Origin -ne 'https://www.humblebundle.com') { $originMismatch = $true }
    }
    $firstBare = ($null -ne $firstTitle) -and ((Get-TitleShape -Title $firstTitle).DocTitle -eq $null)
    $lines.Add("C2: $c2 first_title_bare=$(if ($firstBare) { 'yes' } else { 'no' }) origin_mismatch=$originMismatch")
    $c['C2'] = $c2

    $tComp = -1
    foreach ($ev in $scored) {
        if ($ev.EvType -eq 'vanish') { continue }
        $shape = Get-TitleShape -Title $ev.Title
        if ($shape.Matches -and $shape.DocTitle -ne $null -and $shape.DocTitle.Length -gt 0) { $tComp = $ev.TMs; break }
    }
    $c3 = if ($tComp -ge 0) { 'PASS' } else { 'INCONCLUSIVE' }
    $lines.Add("C3: $c3 t_comp=$tComp")
    $c['C3'] = $c3

    # t_close is the closing boundary for BOTH the C4 open-bare-run check and HOLD: the vanish
    # time if LOGIN vanished, else the instrument's own elapsed time at scoring. Computed here
    # (not from the last recorded EVENT) because a title that never changes again after a
    # revert produces no further sampler events until vanish -- using the last event's own
    # timestamp as the run's end would silently truncate an in-progress bare run to zero
    # duration (measured live: this is exactly what under-scored the `bug` shape's C4 before
    # this fix).
    $tClose = if ($Instrument.LoginVanished) { $Instrument.LoginVanishTMs } else { $Instrument.Sw.Elapsed.TotalMilliseconds }

    $c4 = 'PASS'
    $navResetEpisodes = 0
    if ($tComp -ge 0) {
        $bareStart = -1
        foreach ($ev in $scored) {
            if ($ev.EvType -eq 'vanish') { continue }
            if ($ev.TMs -lt $tComp) { continue }
            $shape = Get-TitleShape -Title $ev.Title
            $isComposed = $shape.Matches -and $shape.DocTitle -ne $null -and $shape.DocTitle.Length -gt 0
            if (-not $isComposed) {
                if ($bareStart -lt 0) { $bareStart = $ev.TMs }
            } else {
                if ($bareStart -ge 0) {
                    $dur = $ev.TMs - $bareStart
                    if ($dur -ge 2000) { $c4 = 'FAIL' } else { $navResetEpisodes++ }
                    $bareStart = -1
                }
            }
        }
        if ($bareStart -ge 0) {
            if (($tClose - $bareStart) -ge 2000) { $c4 = 'FAIL' }
        }
    } else {
        $c4 = 'INCONCLUSIVE'
    }
    $lines.Add("C4: $c4 nav_reset_episodes=$navResetEpisodes")
    $c['C4'] = $c4

    $lastTitleEv = $null
    for ($i = $scored.Count - 1; $i -ge 0; $i--) {
        if ($scored[$i].EvType -ne 'vanish') { $lastTitleEv = $scored[$i]; break }
    }
    $finalTitle = if ($lastTitleEv) { $lastTitleEv.Title } else { '' }
    $finalShape = Get-TitleShape -Title $finalTitle
    $finalComposed = $finalShape.Matches -and $finalShape.DocTitle -ne $null -and $finalShape.DocTitle.Length -gt 0
    # C5 is only a meaningful pass/fail check once a composed title has actually been achieved
    # (t_comp >= 0, i.e. C3 held): without ever having a composed baseline there is nothing to
    # have reverted FROM, so a page whose document title never arrives (C3 unmet) reports C5
    # INCONCLUSIVE rather than FAIL -- it is untested, not failing.
    $c5 = if ($tComp -lt 0) { 'INCONCLUSIVE' } elseif ($finalComposed) { 'PASS' } else { 'FAIL' }
    $lines.Add("C5: $c5 final_composed=$finalComposed")
    $c['C5'] = $c5

    $tLast = if ($lastTitleEv) { $lastTitleEv.TMs } else { 0 }
    $holdMsActual = [math]::Max(0, $tClose - $tLast)

    $c6 = 'UNAVAILABLE'
    if ($Instrument.StderrLinesTotal -gt 0) {
        $applied = @($Instrument.KeptStderr | Where-Object { $_.Line -match 'title change applied len=(\d+)' })
        $presented = @($Instrument.KeptStderr | Where-Object { $_.Line -match 'presentation requested visible=true .* sheet_presented=(true|false)$' })
        if ($applied.Count -ge 1 -and $presented.Count -eq 1) {
            $lastApplied = $applied[$applied.Count - 1]
            $null = $lastApplied.Line -match 'len=(\d+)'
            $appliedLen = [int]$Matches[1]
            $expectedLen = if ($finalShape.Matches -and $finalShape.DocTitle) { [System.Text.Encoding]::UTF8.GetByteCount($finalShape.DocTitle) } else { -1 }
            if ($appliedLen -eq $expectedLen) { $c6 = 'PASS' } else { $c6 = 'INCONCLUSIVE' }
        } else {
            $c6 = 'INCONCLUSIVE'
        }
    }
    $lines.Add("C6: $c6")
    $c['C6'] = $c6

    $finPath = 'none'
    $c7 = 'INCONCLUSIVE'
    $tLoaded = -1
    if ($ProbeChannelEnabled -and $Instrument.ProbeFoundEver) {
        $sawBusySet = $false
        for ($i = 0; $i -lt $Instrument.ProbeTransitions.Count; $i++) {
            $tr = $Instrument.ProbeTransitions[$i]
            if ($tr.Busy) { $sawBusySet = $true }
            if ($sawBusySet -and -not $tr.Busy) { $tLoaded = $tr.TMs }
        }
        if ($sawBusySet) {
            if ($tLoaded -ge 0 -and $tLoaded -ge ($tComp - 250)) {
                $holdA = $tClose - [math]::Max($tLoaded, $tLast)
                if (($tClose - $tLoaded) -ge 15000 -and $holdA -ge 0) {
                    $finPath = 'A'
                    $c7 = 'PASS'
                } else {
                    $c7 = 'INCONCLUSIVE_LOADNOTCOMPLETE'
                }
            } else {
                $c7 = 'INCONCLUSIVE_NONDISCRIMINATING'
            }
        } else {
            $c7 = 'INCONCLUSIVE_NOBUSYOBSERVED'
        }
    }
    if ($finPath -ne 'A') {
        if ($ControlledOrigin -ne '' -and $finalShape.Matches -and $finalShape.Origin -eq $ControlledOrigin -and $holdMsActual -ge $HoldMs) {
            $finPath = 'B'
            $c7 = 'PASS'
        }
    }
    $lines.Add("C7: $c7")
    $c['C7'] = $c7
    $lines.Add("fin_path: $finPath")

    $sweep = Invoke-ImageNameSweep
    $c8 = if ($sweep.C8Pass) { 'PASS' } else { 'FAIL' }
    $lines.Add("C8: $c8 remaining=$($sweep.RemainingCount)")
    $c['C8'] = $c8

    $verdict = 'PASS'
    if ($c2 -eq 'FAIL' -or $c4 -eq 'FAIL' -or $c5 -eq 'FAIL') {
        $verdict = 'FAIL'
    } elseif ($c1 -ne 'PASS' -or $c3 -ne 'PASS' -or $c0 -ne 'PASS' -or $c6 -eq 'INCONCLUSIVE' -or $c7 -ne 'PASS') {
        $verdict = 'INCONCLUSIVE'
    }

    $lines.Add("nav_reset_episodes: $navResetEpisodes")
    $lines.Add("first_title: $(ConvertTo-AsciiSafe $firstTitle)")
    $lines.Add("final_title: $(ConvertTo-AsciiSafe $finalTitle)")
    $lines.Add("hold_ms: $([math]::Round($holdMsActual,0))")
    $lines.Add("VERDICT: $verdict")

    return New-Object PSObject -Property @{
        Lines           = $lines
        Verdict         = $verdict
        C               = $c
        FirstTitle      = $firstTitle
        FinalTitle      = $finalTitle
        FinalComposed   = $finalComposed
        HoldMs          = $holdMsActual
        FinPath         = $finPath
        Sweep           = $sweep
        Cadence         = $cadence
    }
}

# ---- SelfTest mode ----

function Invoke-SyntheticRun {
    param([string]$ShapeArg)
    $inst = New-Object Instrument
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'powershell.exe'
    $psi.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -Mode SyntheticTarget -Shape ' + $ShapeArg
    $psi.WorkingDirectory = Split-Path -Parent $PSCommandPath
    $psi.UseShellExecute = $false
    $psi.RedirectStandardError = $true
    $psi.RedirectStandardOutput = $true
    $psi.CreateNoWindow = $true
    $inst.LaunchAndWatch($psi, 4000.0, 1000.0, 30000.0, 30000.0, $false) | Out-Null
    return $inst
}

if ($Mode -eq 'SelfTest') {
    $selfLines = New-Object System.Collections.Generic.List[string]
    $overallPass = $true
    $shapes = @('fix', 'bug', 'notitle')

    foreach ($s in $shapes) {
        $inst = Invoke-SyntheticRun -ShapeArg $s
        $timelinePath = Join-Path $EvidenceDir "rph-selftest-$s-timeline.jsonl"
        Write-TimelineJsonl -Instrument $inst -Path $timelinePath -QuiescenceMs 4000.0 -TailMs 1000.0 -HardBoundMs 30000.0 -LoginBoundMs 30000.0

        $score = Score-Timeline -Instrument $inst -HoldMs 3000.0 -ControlledOrigin $script:SelfTestOrigin -ExpectOrigin $script:SelfTestOrigin -ProbeChannelEnabled $false -LoginBoundMs 30000.0

        $expectedVerdict = switch ($s) {
            'fix' { 'PASS' }
            'bug' { 'FAIL' }
            'notitle' { 'INCONCLUSIVE' }
        }
        $verdictOk = ($score.Verdict -eq $expectedVerdict)
        if (-not $verdictOk) { $overallPass = $false }
        $selfLines.Add("shape_$s`_verdict: $($score.Verdict) expected=$expectedVerdict match=$verdictOk")
        if ($s -eq 'bug') {
            $c5ok = ($score.C['C5'] -eq 'FAIL')
            $c4ok = ($score.C['C4'] -eq 'FAIL')
            $selfLines.Add("shape_bug_c5: $($score.C['C5']) expected=FAIL match=$c5ok")
            $selfLines.Add("shape_bug_c4: $($score.C['C4']) expected=FAIL match=$c4ok")
            if (-not $c5ok -or -not $c4ok) { $overallPass = $false }
        }
        if ($s -eq 'notitle') {
            $c3ok = ($score.C['C3'] -ne 'PASS')
            $selfLines.Add("shape_notitle_c3_unmet: $c3ok")
            if (-not $c3ok) { $overallPass = $false }
        }

        $transientSeen = $false
        foreach ($ev in $inst.Events) {
            if ($ev.Title -like "*$($script:EM)*Transient*") { $transientSeen = $true; break }
        }
        $selfLines.Add("shape_$s`_transient_captured: $transientSeen")
        if ($s -ne 'notitle' -and -not $transientSeen) { $overallPass = $false }

        $keptLineTexts = @($inst.KeptStderr | ForEach-Object { $_.Line })
        $expectedKept = if ($s -eq 'notitle') { 1 } else { 2 }
        $keptOk = ($keptLineTexts.Count -eq $expectedKept)
        $selfLines.Add("shape_$s`_kept_stderr_count: $($keptLineTexts.Count) expected=$expectedKept match=$keptOk")
        if (-not $keptOk) { $overallPass = $false }

        $markerAbsent = -not ($keptLineTexts -join "`n").Contains('SELFTEST-DROPPED-MARKER')
        $selfLines.Add("shape_$s`_marker_dropped: $markerAbsent")
        if (-not $markerAbsent) { $overallPass = $false }

        $c0ok = ($score.C['C0'] -eq 'PASS')
        $selfLines.Add("shape_$s`_c0: $($score.C['C0'])")
        if (-not $c0ok) { $overallPass = $false }

        $rescoreOut = & node $RphRescorePath $timelinePath 2>&1
        $rescoreLines = @($rescoreOut)
        $rescoreC = @{}
        foreach ($rl in $rescoreLines) {
            if ($rl -match '^(C[2-5]): (\S+)') { $rescoreC[$Matches[1]] = $Matches[2] }
        }
        $agrees = $true
        foreach ($k in @('C2', 'C3', 'C4', 'C5')) {
            $psStatus = if ($score.C[$k] -eq 'PASS') { 'PASS' } elseif ($score.C[$k] -eq 'FAIL') { 'FAIL' } else { 'PASS' }
            # C3/C0/etc PASS vs INCONCLUSIVE distinction: the node rescorer only knows PASS/FAIL
            # for shape checks C2-C5, so an instrument-side INCONCLUSIVE on C3 (no composed
            # sample) is compared as a FAIL against the rescorer's FAIL for the same condition.
            $psForCompare = if ($score.C[$k] -eq 'PASS') { 'PASS' } else { 'FAIL' }
            if ($rescoreC.ContainsKey($k) -and $rescoreC[$k] -ne $psForCompare) { $agrees = $false }
        }
        $selfLines.Add("rescore_agrees_$s`: $(if ($agrees) { 'yes' } else { 'no' })")
        if (-not $agrees) { $overallPass = $false }
    }

    $selfLines.Add("SELFTEST: $(if ($overallPass) { 'PASS' } else { 'FAIL' })")
    Write-EvidenceFile -Path (Join-Path $EvidenceDir 'rph-selftest.txt') -Lines $selfLines

    if ($overallPass) { exit 0 } else { exit 1 }
}

# ---- Smoke mode ----

if ($Mode -eq 'Smoke') {
    $pre = Invoke-Preconditions
    if (-not $pre.AllPass) {
        $failLines = New-Object System.Collections.Generic.List[string]
        $failLines.AddRange([string[]]$pre.Lines)
        $failLines.Add('PRECONDITION_FAILURE: true')
        $failLines.Add('SMOKE: FAIL')
        Write-EvidenceFile -Path (Join-Path $EvidenceDir 'rph-smoke.txt') -Lines $failLines
        exit 2
    }

    $inst = New-Object Instrument
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $pre.InstalledExe
    $psi.WorkingDirectory = Split-Path -Parent $pre.InstalledExe
    $psi.UseShellExecute = $false
    $psi.RedirectStandardError = $true
    $psi.RedirectStandardOutput = $true
    $psi.CreateNoWindow = $false

    $inst.RunSmoke($psi, 60000.0, 15000.0) | Out-Null

    $mainSeen = $inst.MainSeen -and ($inst.MainTitle -eq 'GameLib')
    $cadence = Get-CadenceStats -Gaps $inst.Gaps -LoginOpenTMs -1

    $probeOnceResult = New-Object PSObject -Property @{
        Ok = ($inst.MainProbeFound -and -not $inst.MainProbeErrored)
        Busy = $inst.MainProbeBusy
        NameLen = $inst.MainProbeNameLen
        Found = $inst.MainProbeFound
        Errored = $inst.MainProbeErrored
        ErrorMsg = $inst.MainProbeErrorMsg
    }

    $sweep = Invoke-ImageNameSweep

    $smokeLines = New-Object System.Collections.Generic.List[string]
    $smokeLines.AddRange([string[]]$pre.Lines)
    $smokeLines.Add("main_window_seen: $($inst.MainSeen)")
    $smokeLines.Add("main_window_title: $($inst.MainTitle)")
    $smokeLines.Add("t_main_ms: $([math]::Round($inst.MainSeenTMs,1))")
    $smokeLines.Add("stderr_lines_total: $($inst.StderrLinesTotal)")
    $smokeLines.Add("stderr_kept: $($inst.KeptStderr.Count)")
    $smokeLines.Add("stdout_lines_total: $($inst.StdoutLinesTotal)")
    $stderrChannel = if ($inst.StderrLinesTotal -ge 1) { 'available' } else { 'unavailable' }
    $smokeLines.Add("stderr_channel: $stderrChannel")
    $smokeLines.Add("c0_p99: $([math]::Round($cadence.P99,2))")
    $smokeLines.Add("c0_max: $([math]::Round($cadence.Max,2))")
    $smokeLines.Add("c8_remaining: $($sweep.RemainingCount)")
    $smokeLines.Add("webview2_informational: $($sweep.WebviewInformational)")
    $probePlumbing = if ($probeOnceResult.Ok) { 'ok' } else { 'failed' }
    $smokeLines.Add("probe_plumbing: $probePlumbing")
    $smokeLines.Add("probe_found: $($probeOnceResult.Found)")
    $smokeLines.Add("probe_errored: $($probeOnceResult.Errored)")
    $smokeLines.Add("probe_error_msg: $(ConvertTo-AsciiSafe $probeOnceResult.ErrorMsg)")
    $smokeLines.Add("probe_busy: $($probeOnceResult.Busy)")
    $smokeLines.Add("probe_name_len: $($probeOnceResult.NameLen)")

    $smokePass = $mainSeen -and $sweep.C8Pass
    $smokeLines.Add("SMOKE: $(if ($smokePass) { 'PASS' } else { 'FAIL' })")
    Write-EvidenceFile -Path (Join-Path $EvidenceDir 'rph-smoke.txt') -Lines $smokeLines

    if ($smokePass) { exit 0 } else { exit 1 }
}

# ---- Live mode ----

if ($Mode -eq 'Live') {
    $pre = Invoke-Preconditions
    if (-not $pre.AllPass) {
        $failLines = New-Object System.Collections.Generic.List[string]
        $failLines.AddRange([string[]]$pre.Lines)
        $failLines.Add('PRECONDITION_FAILURE: true')
        $failLines.Add('run: not-performed')
        $failLines.Add('VERDICT: INCONCLUSIVE')
        Write-EvidenceFile -Path (Join-Path $EvidenceDir 'rph-live.txt') -Lines $failLines
        exit 2
    }

    $inst = New-Object Instrument
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $pre.InstalledExe
    $psi.WorkingDirectory = Split-Path -Parent $pre.InstalledExe
    $psi.UseShellExecute = $false
    $psi.RedirectStandardError = $true
    $psi.RedirectStandardOutput = $true
    $psi.CreateNoWindow = $false

    $inst.LaunchAndWatch($psi, 90000.0, 5000.0, 510000.0, 300000.0, $true) | Out-Null

    $timelinePath = Join-Path $EvidenceDir 'rph-timeline.jsonl'
    Write-TimelineJsonl -Instrument $inst -Path $timelinePath -QuiescenceMs 90000.0 -TailMs 5000.0 -HardBoundMs 510000.0 -LoginBoundMs 300000.0

    $shellLines = New-Object System.Collections.Generic.List[string]
    foreach ($kl in $inst.KeptStderr) {
        $shellLines.Add("$([math]::Round($kl.TMs,1)) $($kl.Line)")
    }
    Write-EvidenceFile -Path (Join-Path $EvidenceDir 'rph-shell-lines.txt') -Lines $shellLines

    $loadProbeLines = New-Object System.Collections.Generic.List[string]
    foreach ($tr in $inst.ProbeTransitions) {
        $loadProbeLines.Add('{"t_ms":' + [string]::Format([System.Globalization.CultureInfo]::InvariantCulture, '{0:0.0}', $tr.TMs) + ',"busy":' + $(if ($tr.Busy) { 'true' } else { 'false' }) + ',"name_len":' + $tr.NameLen + '}')
    }
    Write-EvidenceFile -Path (Join-Path $EvidenceDir 'rph-loadprobe.jsonl') -Lines $loadProbeLines

    $controlledOrigin = if ($Store -eq 'humble') { 'https://www.humblebundle.com' } else { '' }
    $expectOrigin = $controlledOrigin

    $score = Score-Timeline -Instrument $inst -HoldMs 60000.0 -ControlledOrigin $controlledOrigin -ExpectOrigin $expectOrigin -ProbeChannelEnabled $true -LoginBoundMs 300000.0

    $c9Count = 0
    $c9PidLines = 0
    if ($pre.LogPath -and (Test-Path -LiteralPath $pre.LogPath)) {
        $item = Get-Item -LiteralPath $pre.LogPath
        if ($item.Length -gt $pre.LogOffsetBytes) {
            $fs = New-Object System.IO.FileStream($pre.LogPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
            try {
                $fs.Seek($pre.LogOffsetBytes, [System.IO.SeekOrigin]::Begin) | Out-Null
                $len = [int]($fs.Length - $pre.LogOffsetBytes)
                $buf = New-Object byte[] $len
                $fs.Read($buf, 0, $len) | Out-Null
                $text = [System.Text.Encoding]::UTF8.GetString($buf)
                $newLines = @($text -split "`n" | Where-Object { $_ -ne '' })
                $c9Count = $newLines.Count
                $c9PidLines = @($newLines | Where-Object { $_ -match "pid=$($inst.LaunchedPid) " }).Count
            } finally {
                $fs.Close()
            }
        }
    }
    $c9HumbleLines = 0
    if ($pre.LogPath -and (Test-Path -LiteralPath $pre.LogPath)) {
        $item2 = Get-Item -LiteralPath $pre.LogPath
        if ($item2.Length -gt $pre.LogOffsetBytes) {
            $fs2 = New-Object System.IO.FileStream($pre.LogPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
            try {
                $fs2.Seek($pre.LogOffsetBytes, [System.IO.SeekOrigin]::Begin) | Out-Null
                $len2 = [int]($fs2.Length - $pre.LogOffsetBytes)
                $buf2 = New-Object byte[] $len2
                $fs2.Read($buf2, 0, $len2) | Out-Null
                $text2 = [System.Text.Encoding]::UTF8.GetString($buf2)
                $c9HumbleLines = @(($text2 -split "`n") | Where-Object { $_.Contains('humble_login_open') }).Count
            } finally {
                $fs2.Close()
            }
        }
    }

    $liveLines = New-Object System.Collections.Generic.List[string]
    $liveLines.Add('run: performed')
    $liveLines.Add("store: $Store")
    $liveLines.Add("launched_pid: $($inst.LaunchedPid)")
    $liveLines.AddRange([string[]]$pre.Lines)
    $liveLines.Add("login_hwnd: $($inst.LoginHwndHex)")
    $liveLines.Add("t_open: $([math]::Round($inst.LoginOpenTMs,1))")
    $liveLines.Add("t_last_change: $([math]::Round($inst.LoginLastChangeTMs,1))")
    $liveLines.Add("t_close: $(if ($inst.LoginVanished) { [math]::Round($inst.LoginVanishTMs,1) } else { 'not-vanished' })")
    $liveLines.Add("close_posted_t_ms: $([math]::Round($inst.ClosePostedTMs,1))")
    $liveLines.Add("stderr_lines_total: $($inst.StderrLinesTotal)")
    $liveLines.Add("stdout_lines_total: $($inst.StdoutLinesTotal)")
    $liveLines.Add("c9_new_line_count: $c9Count")
    $liveLines.Add("c9_pid_matched_count: $c9PidLines")
    $liveLines.Add("c9_humble_login_open_count: $c9HumbleLines")
    $liveLines.AddRange([string[]]$score.Lines)

    Write-EvidenceFile -Path (Join-Path $EvidenceDir 'rph-live.txt') -Lines $liveLines

    if (-not $score.Sweep.C8Pass) { exit 3 }
    if ($score.Verdict -eq 'PASS') { exit 0 }
    if ($score.Verdict -eq 'FAIL') { exit 1 }
    exit 4
}
