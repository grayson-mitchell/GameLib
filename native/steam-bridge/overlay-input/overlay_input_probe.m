// GameLib-owned diagnostic interposer (Phase 60 gap closure, G1). Diagnostic only.
//
// Injected last in DYLD_INSERT_LIBRARIES when the sidecar runs with
// GAMELIB_OVERLAY_INPUT_PROBE=1. It records which image calls which cursor /
// input API, with wall-clock timestamps, so the 60-12 live run can tell the
// G1 hypotheses apart. It is behaviour-neutral (every hook forwards the same
// arguments and returns the real result) unless GAMELIB_OVERLAY_RELEASE_EXPERIMENT
// arms the 60-17 release-on-open experiment. It contains no NotProton code.
//
// 60-17 adds three candidate overlay open/close signals (the 60-15 helper's Darwin
// notification, Shift+Tab seen in -[WineApplication sendEvent:], and caller-
// attributed calls to the renderer's other cursor imports) and an image-load
// order log, plus the opt-in experiment: on open, release winemac's capture; while
// open, defer winemac's re-capture calls; on close, replay the latest capture once.

#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>
#import <dispatch/dispatch.h>
#import <dlfcn.h>
#import <fcntl.h>
#import <mach-o/dyld.h>
#import <notify.h>
#import <os/lock.h>
#import <objc/message.h>
#import <objc/runtime.h>
#import <stdarg.h>
#import <stdio.h>
#import <string.h>
#import <sys/time.h>
#import <unistd.h>

#define PROBE_LOG_CAP (4 * 1024 * 1024)

static int log_fd = -1;
static long long log_bytes;
static int log_suppressed;
static int c_hook_count = 10;
static int objc_hook_count;

static long long now_ms(void)
{
	struct timeval tv;
	gettimeofday(&tv, NULL);
	return (long long)tv.tv_sec * 1000 + tv.tv_usec / 1000;
}

static void probe_open(void)
{
	const char *path = getenv("GAMELIB_OVERLAY_PROBE_LOG");
	if (path != NULL && path[0] == '/') {
		log_fd = open(path, O_WRONLY | O_APPEND | O_CREAT | O_CLOEXEC | O_NOFOLLOW, 0600);
		if (log_fd >= 0)
			return;
	}
	log_fd = STDERR_FILENO;
}

static const char *image_basename(const void *addr)
{
	Dl_info info;
	if (addr != NULL && dladdr(addr, &info) && info.dli_fname != NULL) {
		const char *slash = strrchr(info.dli_fname, '/');
		return slash != NULL ? slash + 1 : info.dli_fname;
	}
	return "?";
}

static void emit_line(const char *caller, const char *event, const char *fmt, ...)
{
	char body[512];
	char line[1024];
	va_list ap;

	if (log_fd < 0 || log_suppressed)
		return;
	body[0] = '\0';
	if (fmt != NULL) {
		va_start(ap, fmt);
		vsnprintf(body, sizeof(body), fmt, ap);
		va_end(ap);
	}
	int n;
	if (caller != NULL)
		n = snprintf(line, sizeof(line), "overlay_probe t=%lld pid=%d %s caller=%s %s\n",
		             now_ms(), (int)getpid(), event, caller, body);
	else
		n = snprintf(line, sizeof(line), "overlay_probe t=%lld pid=%d %s %s\n", now_ms(),
		             (int)getpid(), event, body);
	if (n <= 0)
		return;
	if (n >= (int)sizeof(line))
		n = (int)sizeof(line) - 1;
	if (log_bytes + n > PROBE_LOG_CAP) {
		log_suppressed = 1;
		static const char msg[] = "overlay_probe: further lines suppressed\n";
		(void)!write(log_fd, msg, sizeof(msg) - 1);
		return;
	}
	log_bytes += n;
	(void)!write(log_fd, line, (size_t)n);
}

#define LOG_CALLER(event, ...) emit_line(image_basename(__builtin_return_address(0)), event, __VA_ARGS__)

// ---- experiment state (60-17) ----------------------------------------------

static int exp_armed;
static int exp_source; // 1 = cb, 2 = key
static int exp_block;  // release+block
static int exp_open;
static unsigned exp_gen;
static int exp_inactive_logged;
static os_unfair_lock st_lock = OS_UNFAIR_LOCK_INIT;
// What winemac last asked for (tracked from winemac.so callers only).
static int st_assoc = -1;
static int st_has_rect;
static NSRect st_rect;
static long st_rect_win;
static int st_hide_desired; // hides winemac believes are in force
static int st_hide_real;    // hides actually applied to the system

#define HIDE_DEPTH_CAP 8

static int is_winemac(const char *caller)
{
	return caller != NULL && strcmp(caller, "winemac.so") == 0;
}

static void log_deferred(const char *api, const char *detail)
{
	// At most 20 lines per second (T-60-17-04).
	static long long sec;
	static int count;
	long long now = now_ms() / 1000;
	char event[96];
	if (now != sec) {
		sec = now;
		count = 0;
	}
	if (++count > 20)
		return;
	snprintf(event, sizeof(event), "deferred %s", api);
	emit_line("winemac.so", event, "%s", detail);
}

// ---- C hooks ---------------------------------------------------------------

static CGError probe_associate(boolean_t connected)
{
	const char *caller = image_basename(__builtin_return_address(0));
	emit_line(caller, "CGAssociateMouseAndMouseCursorPosition", "arg=%d", connected ? 1 : 0);
	if (exp_armed && is_winemac(caller)) {
		os_unfair_lock_lock(&st_lock);
		st_assoc = connected ? 1 : 0;
		int defer = exp_open && !connected;
		os_unfair_lock_unlock(&st_lock);
		if (defer) {
			log_deferred("CGAssociateMouseAndMouseCursorPosition", "arg=0");
			return kCGErrorSuccess;
		}
	}
	return CGAssociateMouseAndMouseCursorPosition(connected);
}

static long long warp_second;
static int warp_count;

static CGError probe_warp(CGPoint point)
{
	const char *caller = image_basename(__builtin_return_address(0));
	long long sec = now_ms() / 1000;
	if (sec != warp_second) {
		if (warp_count > 5)
			emit_line(caller, "warp-summary", "count=%d", warp_count);
		warp_second = sec;
		warp_count = 0;
	}
	warp_count++;
	if (warp_count <= 5)
		emit_line(caller, "CGWarpMouseCursorPosition", "x=%.1f y=%.1f", point.x, point.y);
	if (exp_armed && is_winemac(caller) && exp_open) {
		log_deferred("CGWarpMouseCursorPosition", "");
		return kCGErrorSuccess;
	}
	return CGWarpMouseCursorPosition(point);
}

static CGError probe_hide(CGDirectDisplayID display)
{
	LOG_CALLER("CGDisplayHideCursor", "display=%u", (unsigned)display);
	return CGDisplayHideCursor(display);
}

static CGError probe_show(CGDirectDisplayID display)
{
	LOG_CALLER("CGDisplayShowCursor", "display=%u", (unsigned)display);
	return CGDisplayShowCursor(display);
}

static CFMachPortRef probe_tap_create(CGEventTapLocation tap, CGEventTapPlacement place,
                                      CGEventTapOptions options, CGEventMask events,
                                      CGEventTapCallBack callback, void *refcon)
{
	CFMachPortRef result = CGEventTapCreate(tap, place, options, events, callback, refcon);
	LOG_CALLER("CGEventTapCreate", "tap=%d place=%d options=%d mask=0x%llx result=%s",
	           (int)tap, (int)place, (int)options, (unsigned long long)events,
	           result == NULL ? "NULL" : "ok");
	return result;
}

static void probe_tap_enable(CFMachPortRef tap, bool enable)
{
	LOG_CALLER("CGEventTapEnable", "enable=%d", enable ? 1 : 0);
	CGEventTapEnable(tap, enable);
}

// Observe-only hooks for the renderer's other cursor imports (60-12 did not hook
// them). The CGS / QuickDraw ones are not in the public SDK headers; they are
// declared here. CGSForceShowCursor's forwarder passes both integer registers
// through unchanged; the second is ignored if the real function takes one.
extern CGError CGSForceShowCursor(int, int);
extern void HideCursor(void);
extern void ShowCursor(void);

static void probe_event_post(CGEventTapLocation tap, CGEventRef event)
{
	LOG_CALLER("CGEventPost", "tap=%d", (int)tap);
	CGEventPost(tap, event);
}

static CGError probe_force_show(int a, int b)
{
	LOG_CALLER("CGSForceShowCursor", "a=%d b=%d", a, b);
	return CGSForceShowCursor(a, b);
}

static void probe_qd_hide(void)
{
	LOG_CALLER("HideCursor", "");
	HideCursor();
}

static void probe_qd_show(void)
{
	LOG_CALLER("ShowCursor", "");
	ShowCursor();
}

#define INTERPOSE(replacement, replacee) \
	__attribute__((used)) static struct { const void *r; const void *o; } \
	    interpose_##replacee __attribute__((section("__DATA,__interpose"))) = { \
	        (const void *)(unsigned long)&replacement, (const void *)(unsigned long)&replacee }

INTERPOSE(probe_associate, CGAssociateMouseAndMouseCursorPosition);
INTERPOSE(probe_warp, CGWarpMouseCursorPosition);
INTERPOSE(probe_hide, CGDisplayHideCursor);
INTERPOSE(probe_show, CGDisplayShowCursor);
INTERPOSE(probe_tap_create, CGEventTapCreate);
INTERPOSE(probe_tap_enable, CGEventTapEnable);
INTERPOSE(probe_event_post, CGEventPost);
INTERPOSE(probe_force_show, CGSForceShowCursor);
INTERPOSE(probe_qd_hide, HideCursor);
INTERPOSE(probe_qd_show, ShowCursor);

// ---- ObjC swizzles ---------------------------------------------------------

static IMP real_cursor_hide;
static IMP real_cursor_unhide;
static IMP real_confine;

static void probe_cursor_hide(id self, SEL cmd)
{
	const char *caller = image_basename(__builtin_return_address(0));
	emit_line(caller, "NSCursor-hide", "");
	if (exp_armed && is_winemac(caller)) {
		os_unfair_lock_lock(&st_lock);
		if (st_hide_desired < HIDE_DEPTH_CAP)
			st_hide_desired++;
		int defer = exp_open;
		if (!defer && st_hide_real < HIDE_DEPTH_CAP)
			st_hide_real++;
		os_unfair_lock_unlock(&st_lock);
		if (defer) {
			log_deferred("NSCursor-hide", "");
			return;
		}
	}
	((void (*)(id, SEL))real_cursor_hide)(self, cmd);
}

static void probe_cursor_unhide(id self, SEL cmd)
{
	const char *caller = image_basename(__builtin_return_address(0));
	emit_line(caller, "NSCursor-unhide", "");
	if (exp_armed && is_winemac(caller)) {
		os_unfair_lock_lock(&st_lock);
		if (st_hide_desired > 0)
			st_hide_desired--;
		// While open the real depth is already 0: nothing to undo, do not unbalance.
		int forward = !exp_open || st_hide_real > 0;
		if (st_hide_real > 0)
			st_hide_real--;
		os_unfair_lock_unlock(&st_lock);
		if (!forward)
			return;
	}
	((void (*)(id, SEL))real_cursor_unhide)(self, cmd);
}

static void probe_confine(id self, SEL cmd, NSRect rect)
{
	const char *caller = image_basename(__builtin_return_address(0));
	emit_line(caller, "setMouseConfinementRect", "x=%.1f y=%.1f w=%.1f h=%.1f", rect.origin.x,
	          rect.origin.y, rect.size.width, rect.size.height);
	if (exp_armed && is_winemac(caller)) {
		int zero = rect.size.width == 0 && rect.size.height == 0;
		long win = (long)[(NSWindow *)self windowNumber];
		os_unfair_lock_lock(&st_lock);
		st_has_rect = 1;
		st_rect = rect;
		st_rect_win = win;
		int defer = exp_open && !zero;
		os_unfair_lock_unlock(&st_lock);
		if (defer) {
			log_deferred("setMouseConfinementRect", "");
			return;
		}
	}
	((void (*)(id, SEL, NSRect))real_confine)(self, cmd, rect);
}

static int swizzle(Method method, IMP replacement, IMP *previous)
{
	if (method == NULL)
		return 0;
	*previous = method_getImplementation(method);
	method_setImplementation(method, replacement);
	return 1;
}

static void install_objc_hooks(void)
{
	Class cursor = objc_getClass("NSCursor");
	if (cursor != Nil) {
		objc_hook_count += swizzle(class_getClassMethod(cursor, sel_registerName("hide")),
		                           (IMP)probe_cursor_hide, &real_cursor_hide);
		objc_hook_count += swizzle(class_getClassMethod(cursor, sel_registerName("unhide")),
		                           (IMP)probe_cursor_unhide, &real_cursor_unhide);
	}
	Class window = objc_getClass("NSWindow");
	if (window != Nil) {
		objc_hook_count += swizzle(
		    class_getInstanceMethod(window, sel_registerName("setMouseConfinementRect:")),
		    (IMP)probe_confine, &real_confine);
	}
}

// ---- release-on-open experiment (60-17, opt-in) -----------------------------

static void (*set_active_fn)(int);

static int wine_gate(void)
{
	if (objc_getClass("WineApplication") != Nil && NSApp != nil)
		return 1;
	if (!exp_inactive_logged) {
		exp_inactive_logged = 1;
		emit_line(NULL, "experiment", "inactive reason=no-wineapp");
	}
	return 0;
}

static void experiment_close(const char *reason, unsigned gen_check);

static void experiment_open(const char *source)
{
	if (!exp_armed || !wine_gate())
		return;
	unsigned gen;
	int hide_real;
	os_unfair_lock_lock(&st_lock);
	if (exp_open) {
		os_unfair_lock_unlock(&st_lock);
		return;
	}
	exp_open = 1;
	gen = ++exp_gen;
	hide_real = st_hide_real;
	st_hide_real = 0;
	os_unfair_lock_unlock(&st_lock);

	emit_line(NULL, "experiment", "open source=%s action=%s", source,
	          exp_block ? "release+block" : "release");
	int windows = 0;
	@autoreleasepool {
		if (real_confine != NULL) {
			for (NSWindow *w in [NSApp windows]) {
				((void (*)(id, SEL, NSRect))real_confine)(
				    w, sel_registerName("setMouseConfinementRect:"), NSZeroRect);
				windows++;
			}
		}
	}
	emit_line("experiment", "setMouseConfinementRect", "x=0.0 y=0.0 w=0.0 h=0.0 windows=%d",
	          windows);
	// This image's own __interpose does not apply to itself: this is the real call.
	(void)CGAssociateMouseAndMouseCursorPosition(1);
	emit_line("experiment", "CGAssociateMouseAndMouseCursorPosition", "arg=1");
	int unhide = 0;
	if (real_cursor_unhide != NULL) {
		Class cursor = objc_getClass("NSCursor");
		for (int i = 0; i < hide_real; i++) {
			((void (*)(id, SEL))real_cursor_unhide)((id)cursor, sel_registerName("unhide"));
			emit_line("experiment", "NSCursor-unhide", "");
			unhide++;
		}
	}
	emit_line(NULL, "experiment", "release assoc=1 windows=%d unhide=%d", windows, unhide);
	if (exp_block) {
		if (set_active_fn == NULL)
			*(void **)&set_active_fn = dlsym(RTLD_DEFAULT, "np_overlay_shim_set_active");
		if (set_active_fn != NULL) {
			set_active_fn(1);
			emit_line(NULL, "experiment", "set_active 1");
		} else {
			emit_line(NULL, "experiment", "set_active absent");
		}
	}
	// Safety: a lost close must never strand the cursor.
	dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 300 * NSEC_PER_SEC), dispatch_get_main_queue(),
	               ^{
		               experiment_close("timeout", gen);
	               });
}

static void experiment_close(const char *reason, unsigned gen_check)
{
	int assoc, has_rect, hide;
	NSRect rect;
	long win;
	os_unfair_lock_lock(&st_lock);
	if (!exp_open || (gen_check != 0 && gen_check != exp_gen)) {
		os_unfair_lock_unlock(&st_lock);
		return;
	}
	exp_open = 0;
	assoc = st_assoc;
	has_rect = st_has_rect;
	rect = st_rect;
	win = st_rect_win;
	hide = st_hide_desired;
	st_hide_real = hide;
	os_unfair_lock_unlock(&st_lock);

	if (exp_block && set_active_fn != NULL)
		set_active_fn(0);
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
	char rect_text[96];
	if (has_rect)
		snprintf(rect_text, sizeof(rect_text), "%.1f,%.1f,%.1f,%.1f", rect.origin.x, rect.origin.y,
		         rect.size.width, rect.size.height);
	else
		snprintf(rect_text, sizeof(rect_text), "none");
	emit_line(NULL, "experiment", "close reason=%s replay assoc=%d rect=%s hide=%d", reason,
	          assoc, rect_text, hide);
}

static void experiment_parse(void)
{
	const char *v = getenv("GAMELIB_OVERLAY_RELEASE_EXPERIMENT");
	if (v == NULL || v[0] == '\0')
		return;
	if (strcmp(v, "cb:release") == 0) {
		exp_source = 1;
	} else if (strcmp(v, "cb:release+block") == 0) {
		exp_source = 1;
		exp_block = 1;
	} else if (strcmp(v, "key:release") == 0) {
		exp_source = 2;
	} else {
		emit_line(NULL, "experiment", "off reason=invalid");
		return;
	}
	exp_armed = 1;
}

// ---- signal observers (60-17) ------------------------------------------------

static IMP real_wine_send;
static int key_installed;

// Observe-only: ALWAYS forwards the unchanged event to the previous IMP.
static void probe_wine_send_event(id self, SEL cmd, NSEvent *event)
{
	if ([event type] == NSEventTypeKeyDown && [event keyCode] == 48 &&
	    ([event modifierFlags] & NSEventModifierFlagShift) != 0) {
		int repeat = [event isARepeat] ? 1 : 0;
		emit_line(NULL, "signal", "key shift+tab repeat=%d", repeat);
		if (!repeat && exp_armed && exp_source == 2) {
			dispatch_async(dispatch_get_main_queue(), ^{
				if (exp_open)
					experiment_close("signal", 0);
				else
					experiment_open("key");
			});
		}
	}
	((void (*)(id, SEL, id))real_wine_send)(self, cmd, event);
}

static void try_install_key_observer(void)
{
	Class cls = objc_getClass("WineApplication");
	if (cls == Nil || key_installed)
		return;
	SEL sel = sel_registerName("sendEvent:");
	Method m = class_getInstanceMethod(cls, sel);
	if (m == NULL || !__sync_bool_compare_and_swap(&key_installed, 0, 1))
		return;
	real_wine_send = method_getImplementation(m);
	// An inherited sendEvent: gets a subclass override rather than patching NSApplication.
	if (!class_addMethod(cls, sel, (IMP)probe_wine_send_event, method_getTypeEncoding(m)))
		method_setImplementation(m, (IMP)probe_wine_send_event);
	emit_line("probe", "signal-observer", "installed=sendEvent:");
}

static int image_order;

static void on_add_image(const struct mach_header *mh, intptr_t slide)
{
	(void)slide;
	int order = __sync_add_and_fetch(&image_order, 1);
	Dl_info info;
	if (!dladdr(mh, &info) || info.dli_fname == NULL)
		return;
	const char *slash = strrchr(info.dli_fname, '/');
	const char *base = slash != NULL ? slash + 1 : info.dli_fname;
	static const char *const names[] = {"overlay_shim.dylib", "steamloader.dylib",
	                                    "gameoverlayrenderer.dylib", "overlay_input_probe.dylib",
	                                    "winemac.so"};
	for (size_t i = 0; i < sizeof(names) / sizeof(names[0]); i++) {
		if (strcmp(base, names[i]) != 0)
			continue;
		emit_line(NULL, "image", "%s order=%d", base, order);
		if (i == 4) {
			dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
				try_install_key_observer();
			});
		}
		return;
	}
}

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
		                                           int active = state != 0 ? 1 : 0;
		                                           emit_line(NULL, "signal", "cb active=%d", active);
		                                           if (exp_armed && exp_source == 1) {
			                                           if (active)
				                                           experiment_open("cb");
			                                           else
				                                           experiment_close("signal", 0);
		                                           }
	                                           });
	if (status != NOTIFY_STATUS_OK)
		emit_line(NULL, "signal", "cb register=failed status=%u", status);
}

// ---- sendEvent: owner sampler (bounded: 2 s ticks, 120 s) -------------------

static IMP last_wine_imp;
static IMP last_app_imp;
static int ticks;
static dispatch_source_t sampler;

static IMP send_event_imp(const char *class_name)
{
	Class cls = objc_getClass(class_name);
	if (cls == Nil)
		return NULL;
	Method m = class_getInstanceMethod(cls, sel_registerName("sendEvent:"));
	return m != NULL ? method_getImplementation(m) : NULL;
}

static void sample_owner(const char *class_name, IMP *last)
{
	IMP imp = send_event_imp(class_name);
	if (imp == NULL || imp == *last)
		return;
	*last = imp;
	emit_line("probe", "sendEvent-owner", "class=%s image=%s", class_name,
	          image_basename((const void *)imp));
}

static void sampler_tick(void)
{
	if (ticks == 0) {
		emit_line("probe", "set_active-symbol", "%s",
		          dlsym(RTLD_DEFAULT, "np_overlay_shim_set_active") != NULL ? "present"
		                                                                     : "absent");
	}
	sample_owner("WineApplication", &last_wine_imp);
	sample_owner("NSApplication", &last_app_imp);
	try_install_key_observer();
	if (++ticks >= 60 && sampler != NULL) {
		dispatch_source_cancel(sampler);
	}
}

static void start_sampler(void)
{
	sampler = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0,
	                                 dispatch_get_global_queue(QOS_CLASS_UTILITY, 0));
	if (sampler == NULL)
		return;
	dispatch_source_set_timer(sampler, dispatch_time(DISPATCH_TIME_NOW, 0),
	                          2 * NSEC_PER_SEC, NSEC_PER_SEC / 2);
	dispatch_source_set_event_handler(sampler, ^{
		sampler_tick();
	});
	dispatch_resume(sampler);
}

__attribute__((constructor)) static void probe_init(void)
{
	probe_open();
	experiment_parse();
	install_objc_hooks();
	_dyld_register_func_for_add_image(on_add_image);
	register_cb_listener();
	emit_line("probe", "load", "exe=%s c_hooks=%d objc_hooks=%d", getprogname(), c_hook_count,
	          objc_hook_count);
	start_sampler();
}
