// hidprobe: open the PowerA Switch 2 pad (20d6:a720) via IOHID, register an
// input-report callback with a buffer of the declared MaxInputReportSize, and
// log every report's length. Guard bytes after the buffer detect overflow.
// Usage: hidprobe [seconds=20] [bufsize=0 (0 = use MaxInputReportSize)]
#include <IOKit/hid/IOHIDManager.h>
#include <CoreFoundation/CoreFoundation.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define GUARD 256
static uint8_t *buf;
static CFIndex bufsize;
static long reports, overflows, maxlen;
static long lenhist[129];
static uint8_t last[64]; static CFIndex lastlen = -1; static long changes;

static int guard_dirty(void) {
  for (int i = 0; i < GUARD; i++)
    if (buf[bufsize + i] != 0xAA) return 1;
  return 0;
}

static void on_report(void *ctx, IOReturn res, void *sender, IOHIDReportType type,
                      uint32_t id, uint8_t *report, CFIndex len) {
  reports++;
  if (len > maxlen) maxlen = len;
  lenhist[len > 128 ? 128 : len]++;
  if (guard_dirty()) {
    overflows++;
    if (overflows <= 3) fprintf(stderr, "OVERFLOW: guard bytes written (report %ld, len %ld)\n", reports, (long)len);
    memset(buf + bufsize, 0xAA, GUARD);
  }
  int changed = len != lastlen || memcmp(last, report, len > 64 ? 64 : len) != 0;
  if (changed) { changes++; memcpy(last, report, len > 64 ? 64 : len); lastlen = len; }
  if (changed) {
    printf("report %ld res=0x%x id=%u len=%ld:", reports, res, id, (long)len);
    for (CFIndex i = 0; i < len && i < 16; i++) printf(" %02x", report[i]);
    printf("\n");
    fflush(stdout);
  }
}

static void on_match(void *ctx, IOReturn res, void *sender, IOHIDDeviceRef dev) {
  CFNumberRef n = IOHIDDeviceGetProperty(dev, CFSTR(kIOHIDMaxInputReportSizeKey));
  long max = 0;
  if (n) CFNumberGetValue(n, kCFNumberLongType, &max);
  long want = (long)(intptr_t)ctx;
  bufsize = want > 0 ? want : max;
  printf("matched device %p, MaxInputReportSize=%ld, using buffer %ld (+%d guard)\n", dev, max, (long)bufsize, GUARD);
  if (buf) { printf("(second interface ignored)\n"); return; }
  buf = malloc(bufsize + GUARD);
  memset(buf, 0, bufsize);
  memset(buf + bufsize, 0xAA, GUARD);
  IOReturn r = IOHIDDeviceOpen(dev, kIOHIDOptionsTypeNone);
  printf("IOHIDDeviceOpen -> 0x%x\n", r);
  IOHIDDeviceRegisterInputReportCallback(dev, buf, bufsize, on_report, NULL);
  fflush(stdout);
}

int main(int argc, char **argv) {
  double secs = argc > 1 ? atof(argv[1]) : 20;
  long want = argc > 2 ? atol(argv[2]) : 0;
#if defined(__x86_64__)
  printf("arch: x86_64\n");
#else
  printf("arch: arm64\n");
#endif
  IOHIDManagerRef mgr = IOHIDManagerCreate(kCFAllocatorDefault, kIOHIDOptionsTypeNone);
  int vid = 0x20d6, pid = 0xa720;
  CFNumberRef v = CFNumberCreate(NULL, kCFNumberIntType, &vid);
  CFNumberRef p = CFNumberCreate(NULL, kCFNumberIntType, &pid);
  const void *keys[] = {CFSTR(kIOHIDVendorIDKey), CFSTR(kIOHIDProductIDKey)};
  const void *vals[] = {v, p};
  CFDictionaryRef match = CFDictionaryCreate(NULL, keys, vals, 2, &kCFTypeDictionaryKeyCallBacks,
                                             &kCFTypeDictionaryValueCallBacks);
  IOHIDManagerSetDeviceMatching(mgr, match);
  IOHIDManagerRegisterDeviceMatchingCallback(mgr, on_match, (void *)(intptr_t)want);
  IOHIDManagerScheduleWithRunLoop(mgr, CFRunLoopGetCurrent(), kCFRunLoopDefaultMode);
  printf("IOHIDManagerOpen -> 0x%x; listening %.0fs\n", IOHIDManagerOpen(mgr, kIOHIDOptionsTypeNone), secs);
  fflush(stdout);
  CFRunLoopRunInMode(kCFRunLoopDefaultMode, secs, false);
  printf("SUMMARY changes=%ld reports=%ld maxlen=%ld overflows=%ld buffer=%ld\n", changes, reports, maxlen, overflows, (long)bufsize);
  for (int i = 0; i <= 128; i++)
    if (lenhist[i]) printf("  len %d: %ld\n", i, lenhist[i]);
  return 0;
}
