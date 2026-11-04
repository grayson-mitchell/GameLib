// GameLib-owned overlay input fix (Phase 60 plan 19, G1). Not NotProton code.
//
// Injected after the Steam dylibs in DYLD_INSERT_LIBRARIES by the launch routes
// (plan 60-20). Production port of the 60-17 release-on-open experiment, proven by
// 60-18 (verdict X-RELEASE+BLOCK, signal cb, close-restore ok):
//   open  (helper notification state 1): free winemac's cursor capture (clear the
//         confinement rect on every window, associate 1, unhide to the recorded
//         depth), and call np_overlay_shim_set_active(1) so the game stops
//         reading mouse-look;
//   while open: defer winemac's re-capture calls (not forwarded);
//   close (state 0): set_active(0) and replay the latest capture state once.
// Calls from any image other than winemac.so are forwarded untouched.
//
// Scope (60-18 must-carry): the module acts only in the game process. It needs
// WineApplication and a non-nil NSApp, and it stays inactive in Wine's own
// service processes (explorer.exe, services.exe, winedevice.exe ...), which also
// carry WineApplication and ran the experiment in the 60-18 live runs.
//
// No timeout: the overlay may legitimately stay open a long time. A missed close
// leaves the cursor free until the next close or game exit (T-60-19-03).

#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>
#import <dispatch/dispatch.h>
#import <dlfcn.h>
#import <notify.h>
#import <objc/message.h>
#import <objc/runtime.h>
#import <os/lock.h>
#import <stdarg.h>
#import <stdio.h>
#import <string.h>
#import <strings.h>
#import <unistd.h>

// 60-18 verdict: signal cb. The key source (Shift+Tab) was not needed and is not built.
#define OVERLAY_INPUT_SOURCE_CB 1
// 60-18 verdict: X-RELEASE+BLOCK. Run 1 (release alone) still turned the camera.
#define OVERLAY_INPUT_BLOCK 1

#define LOG_CAP 64
#define HIDE_DEPTH_CAP 8

static int log_lines;
static int inactive_logged;
static int process_active = -1; // -1 = not decided
static int is_open;
static os_unfair_lock st_lock = OS_UNFAIR_LOCK_INIT;
// What winemac last asked for (tracked from winemac.so callers only).
static int st_assoc = -1;
static int st_has_rect;
static NSRect st_rect;
static long st_rect_win;
static int st_hide_desired; // hides winemac believes are in force
static int st_hide_real;    // hides actually applied to the system

static void ovl_log(const char *fmt, ...)
{
	char line[256];
	va_list ap;
	int n;
	if (__sync_fetch_and_add(&log_lines, 1) >= LOG_CAP)
		return;
	n = snprintf(line, sizeof(line), "overlay_input ");
	va_start(ap, fmt);
	vsnprintf(line + n, sizeof(line) - (size_t)n - 2, fmt, ap);
	va_end(ap);
	size_t len = strlen(line);
	line[len] = '\n';
	(void)!write(STDERR_FILENO, line, len + 1);
}

static int is_winemac(const void *addr)
{
	Dl_info info;
	if (addr == NULL || !dladdr(addr, &info) || info.dli_fname == NULL)
		return 0;
	const char *slash = strrchr(info.dli_fname, '/');
	return strcmp(slash != NULL ? slash + 1 : info.dli_fname, "winemac.so") == 0;
}

// Wine's own helper executables. Matched case-insensitively on the basename of any
// process argument (the unix side is wine-preloader, the Windows exe is an argument).
static int is_wine_service_name(const char *arg)
{
	static const char *const names[] = {
	    "explorer.exe", "services.exe", "winedevice.exe", "plugplay.exe", "svchost.exe",
	    "rpcss.exe",    "wineboot.exe", "conhost.exe",    "start.exe",    "winemenubuilder.exe",
	    "tabtip.exe",   "taskmgr.exe",  "wmiprvse.exe",   "cmd.exe",      "steam.exe"};
	const char *base = arg;
	for (const char *p = arg; *p != '\0'; p++)
		if (*p == '/' || *p == '\\')
			base = p + 1;
	for (size_t i = 0; i < sizeof(names) / sizeof(names[0]); i++)
		if (strcasecmp(base, names[i]) == 0)
			return 1;
	return 0;
}

static int process_is_wine_service(void)
{
	if (is_wine_service_name(getprogname()))
		return 1;
	@autoreleasepool {
		for (NSString *a in [[NSProcessInfo processInfo] arguments]) {
			const char *s = [a UTF8String];
			if (s != NULL && is_wine_service_name(s))
				return 1;
		}
	}
	return 0;
}

static int game_gate(void)
{
	if (process_active < 0) {
		if (objc_getClass("WineApplication") != Nil && NSApp != nil &&
		    !process_is_wine_service())
			process_active = 1;
		else if (objc_getClass("WineApplication") != Nil && NSApp != nil)
			process_active = 0; // a service process: decided for good
	}
	if (process_active == 1)
		return 1;
	if (!inactive_logged) {
		inactive_logged = 1;
		ovl_log("inactive");
	}
	return 0;
}

// ---- C hooks ---------------------------------------------------------------

static CGError ovl_associate(boolean_t connected)
{
	if (is_winemac(__builtin_return_address(0))) {
		os_unfair_lock_lock(&st_lock);
		st_assoc = connected ? 1 : 0;
		int defer = is_open && !connected;
		os_unfair_lock_unlock(&st_lock);
		if (defer) {
			ovl_log("deferred CGAssociateMouseAndMouseCursorPosition");
			return kCGErrorSuccess;
		}
	}
	return CGAssociateMouseAndMouseCursorPosition(connected);
}

static CGError ovl_warp(CGPoint point)
{
	if (is_winemac(__builtin_return_address(0)) && is_open) {
		ovl_log("deferred CGWarpMouseCursorPosition");
		return kCGErrorSuccess;
	}
	return CGWarpMouseCursorPosition(point);
}

#define INTERPOSE(replacement, replacee) \
	__attribute__((used)) static struct { const void *r; const void *o; } \
	    interpose_##replacee __attribute__((section("__DATA,__interpose"))) = { \
	        (const void *)(unsigned long)&replacement, (const void *)(unsigned long)&replacee }

INTERPOSE(ovl_associate, CGAssociateMouseAndMouseCursorPosition);
INTERPOSE(ovl_warp, CGWarpMouseCursorPosition);

// ---- ObjC swizzles ---------------------------------------------------------

static IMP real_cursor_hide;
static IMP real_cursor_unhide;
static IMP real_confine;

static void ovl_cursor_hide(id self, SEL cmd)
{
	if (is_winemac(__builtin_return_address(0))) {
		os_unfair_lock_lock(&st_lock);
		if (st_hide_desired < HIDE_DEPTH_CAP)
			st_hide_desired++;
		int defer = is_open;
		if (!defer && st_hide_real < HIDE_DEPTH_CAP)
			st_hide_real++;
		os_unfair_lock_unlock(&st_lock);
		if (defer) {
			ovl_log("deferred NSCursor-hide");
			return;
		}
	}
	((void (*)(id, SEL))real_cursor_hide)(self, cmd);
}

static void ovl_cursor_unhide(id self, SEL cmd)
{
	if (is_winemac(__builtin_return_address(0))) {
		os_unfair_lock_lock(&st_lock);
		if (st_hide_desired > 0)
			st_hide_desired--;
		// While open the real depth is already 0: nothing to undo, do not unbalance.
		int forward = !is_open || st_hide_real > 0;
		if (st_hide_real > 0)
			st_hide_real--;
		os_unfair_lock_unlock(&st_lock);
		if (!forward)
			return;
	}
	((void (*)(id, SEL))real_cursor_unhide)(self, cmd);
}

static void ovl_confine(id self, SEL cmd, NSRect rect)
{
	if (is_winemac(__builtin_return_address(0))) {
		int zero = rect.size.width == 0 && rect.size.height == 0;
		long win = (long)[(NSWindow *)self windowNumber];
		os_unfair_lock_lock(&st_lock);
		st_has_rect = 1;
		st_rect = rect;
		st_rect_win = win;
		int defer = is_open && !zero;
		os_unfair_lock_unlock(&st_lock);
		if (defer) {
			ovl_log("deferred setMouseConfinementRect");
			return;
		}
	}
	((void (*)(id, SEL, NSRect))real_confine)(self, cmd, rect);
}

static void swizzle(Method method, IMP replacement, IMP *previous)
{
	if (method == NULL)
		return;
	*previous = method_getImplementation(method);
	method_setImplementation(method, replacement);
}

static void install_objc_hooks(void)
{
	Class cursor = objc_getClass("NSCursor");
	if (cursor != Nil) {
		swizzle(class_getClassMethod(cursor, sel_registerName("hide")), (IMP)ovl_cursor_hide,
		        &real_cursor_hide);
		swizzle(class_getClassMethod(cursor, sel_registerName("unhide")), (IMP)ovl_cursor_unhide,
		        &real_cursor_unhide);
	}
	Class window = objc_getClass("NSWindow");
	if (window != Nil) {
		swizzle(class_getInstanceMethod(window, sel_registerName("setMouseConfinementRect:")),
		        (IMP)ovl_confine, &real_confine);
	}
}

// ---- open / close ----------------------------------------------------------

#if OVERLAY_INPUT_BLOCK
static void (*set_active_fn)(int);
static int set_active_absent_logged;

static void call_set_active(int active)
{
	if (set_active_fn == NULL)
		*(void **)&set_active_fn = dlsym(RTLD_DEFAULT, "np_overlay_shim_set_active");
	if (set_active_fn != NULL) {
		set_active_fn(active);
		ovl_log("set_active %d", active);
	} else if (!set_active_absent_logged) {
		set_active_absent_logged = 1;
		ovl_log("set_active absent");
	}
}
#endif

static void overlay_open(void)
{
	int hide_real;
	if (!game_gate())
		return;
	os_unfair_lock_lock(&st_lock);
	if (is_open) {
		os_unfair_lock_unlock(&st_lock);
		return;
	}
	is_open = 1;
	hide_real = st_hide_real;
	st_hide_real = 0;
	os_unfair_lock_unlock(&st_lock);

	ovl_log("open");
	@autoreleasepool {
		if (real_confine != NULL) {
			for (NSWindow *w in [NSApp windows])
				((void (*)(id, SEL, NSRect))real_confine)(
				    w, sel_registerName("setMouseConfinementRect:"), NSZeroRect);
		}
	}
	// This image's own __interpose does not apply to itself: this is the real call.
	(void)CGAssociateMouseAndMouseCursorPosition(1);
	if (real_cursor_unhide != NULL) {
		Class cursor = objc_getClass("NSCursor");
		for (int i = 0; i < hide_real; i++)
			((void (*)(id, SEL))real_cursor_unhide)((id)cursor, sel_registerName("unhide"));
	}
#if OVERLAY_INPUT_BLOCK
	call_set_active(1);
#endif
}

static void overlay_close(void)
{
	int assoc, has_rect, hide;
	NSRect rect;
	long win;
	os_unfair_lock_lock(&st_lock);
	if (!is_open) {
		os_unfair_lock_unlock(&st_lock);
		return;
	}
	is_open = 0;
	assoc = st_assoc;
	has_rect = st_has_rect;
	rect = st_rect;
	win = st_rect_win;
	hide = st_hide_desired;
	st_hide_real = hide;
	os_unfair_lock_unlock(&st_lock);

#if OVERLAY_INPUT_BLOCK
	call_set_active(0);
#endif
	for (int i = 0; i < hide; i++) {
		if (real_cursor_hide != NULL)
			((void (*)(id, SEL))real_cursor_hide)((id)objc_getClass("NSCursor"),
			                                      sel_registerName("hide"));
	}
	if (assoc >= 0)
		(void)CGAssociateMouseAndMouseCursorPosition(assoc ? 1 : 0);
	if (has_rect && real_confine != NULL) {
		@autoreleasepool {
			NSWindow *w = [NSApp windowWithWindowNumber:(NSInteger)win];
			if (w != nil)
				((void (*)(id, SEL, NSRect))real_confine)(
				    w, sel_registerName("setMouseConfinementRect:"), rect);
		}
	}
	ovl_log("close");
}

// ---- signal (cb): the helper's Darwin notification ---------------------------

#if OVERLAY_INPUT_SOURCE_CB
static int notify_token;

static void register_cb_listener(void)
{
	const char *app = getenv("SteamAppId");
	if (app == NULL)
		return;
	size_t len = strlen(app);
	if (len < 1 || len > 10)
		return;
	for (size_t i = 0; i < len; i++)
		if (app[i] < '0' || app[i] > '9')
			return;
	char name[96];
	snprintf(name, sizeof(name), "com.gamelib.steambridge.overlay.%s", app);
	uint32_t status = notify_register_dispatch(name, &notify_token, dispatch_get_main_queue(),
	                                           ^(int token) {
		                                           uint64_t state = 0;
		                                           notify_get_state(token, &state);
		                                           if (state != 0)
			                                           overlay_open();
		                                           else
			                                           overlay_close();
	                                           });
	if (status != NOTIFY_STATUS_OK)
		ovl_log("register failed status=%u", status);
}
#endif

__attribute__((constructor)) static void overlay_input_init(void)
{
	install_objc_hooks();
#if OVERLAY_INPUT_SOURCE_CB
	register_cb_listener();
#endif
}
