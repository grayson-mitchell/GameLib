// GameLib-owned diagnostic interposer (Phase 60 gap closure, G1). Diagnostic only.
//
// Injected last in DYLD_INSERT_LIBRARIES when the sidecar runs with
// GAMELIB_OVERLAY_INPUT_PROBE=1. It records which image calls which cursor /
// input API, with wall-clock timestamps, so the 60-12 live run can tell the
// G1 hypotheses apart. It changes no behaviour: every hook forwards the same
// arguments and returns the real result. It contains no NotProton code.

#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>
#import <dispatch/dispatch.h>
#import <dlfcn.h>
#import <fcntl.h>
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
static int c_hook_count = 6;
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
	int n = snprintf(line, sizeof(line), "overlay_probe t=%lld pid=%d %s caller=%s %s\n",
	                 now_ms(), (int)getpid(), event, caller, body);
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

// ---- C hooks ---------------------------------------------------------------

static CGError probe_associate(boolean_t connected)
{
	LOG_CALLER("CGAssociateMouseAndMouseCursorPosition", "arg=%d", connected ? 1 : 0);
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

// ---- ObjC swizzles ---------------------------------------------------------

static IMP real_cursor_hide;
static IMP real_cursor_unhide;
static IMP real_confine;

static void probe_cursor_hide(id self, SEL cmd)
{
	LOG_CALLER("NSCursor-hide", "");
	((void (*)(id, SEL))real_cursor_hide)(self, cmd);
}

static void probe_cursor_unhide(id self, SEL cmd)
{
	LOG_CALLER("NSCursor-unhide", "");
	((void (*)(id, SEL))real_cursor_unhide)(self, cmd);
}

static void probe_confine(id self, SEL cmd, NSRect rect)
{
	LOG_CALLER("setMouseConfinementRect", "x=%.1f y=%.1f w=%.1f h=%.1f", rect.origin.x,
	           rect.origin.y, rect.size.width, rect.size.height);
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
	install_objc_hooks();
	emit_line("probe", "load", "exe=%s c_hooks=%d objc_hooks=%d", getprogname(), c_hook_count,
	          objc_hook_count);
	start_sampler();
}
