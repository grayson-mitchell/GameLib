/* Spike 032: query CrossOver's own libMoltenVK.dylib (x86_64, same one winevulkan uses) for the
 * features Zink hard-requires. No Vulkan SDK: the handful of structs needed are declared by hand.
 * Build: clang -arch x86_64 -O1 -o mvk_probe mvk_probe.c   (runs under Rosetta, like wine does) */
#include <dlfcn.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
typedef uint32_t VkBool32; typedef int VkResult; typedef void *VkInstance, *VkPhysicalDevice;
typedef struct { int sType; const void *pNext; const char *app; uint32_t appV; const char *eng; uint32_t engV; uint32_t api; } AppInfo;
typedef struct { int sType; const void *pNext; uint32_t flags; const AppInfo *app; uint32_t nl; const char *const *l; uint32_t ne; const char *const *e; } InstInfo;
typedef struct { int sType; void *pNext; VkBool32 f[55]; } Features2;                       /* VkPhysicalDeviceFeatures = 55 VkBool32 */
typedef struct { int sType; void *pNext; VkBool32 robustBufferAccess2, robustImageAccess2, nullDescriptor; } Robust2;
typedef struct { int sType; void *pNext; VkBool32 timelineSemaphore; } Timeline;
typedef struct { int sType; void *pNext; VkBool32 customBorderColors, customBorderColorWithoutFormat; } BorderColor;
typedef struct { uint32_t apiVersion, driverVersion, vendorID, deviceID, deviceType; char name[256]; uint8_t rest[1024]; } Props;
typedef void *(*GIPA)(VkInstance, const char *);
int main(int argc, char **argv) {
  const char *lib = argc > 1 ? argv[1] : "libMoltenVK.dylib";
  void *h = dlopen(lib, RTLD_NOW); if (!h) { printf("dlopen failed: %s\n", dlerror()); return 2; }
  GIPA gipa = (GIPA)dlsym(h, "vkGetInstanceProcAddr");
  VkResult (*create)(const InstInfo *, const void *, VkInstance *) = gipa(NULL, "vkCreateInstance");
  AppInfo ai = {0, NULL, "mvk_probe", 1, "none", 1, (1u << 22) | (2u << 12)};      /* VK_API_VERSION_1_2 */
  const char *ext[] = {"VK_KHR_get_physical_device_properties2"};   /* direct ICD call: no loader-only portability_enumeration */
  InstInfo ii = {1, NULL, 0, &ai, 0, NULL, 1, ext};
  VkInstance inst; VkResult r = create(&ii, NULL, &inst); if (r) { printf("vkCreateInstance=%d\n", r); return 3; }
  VkResult (*enumpd)(VkInstance, uint32_t *, VkPhysicalDevice *) = gipa(inst, "vkEnumeratePhysicalDevices");
  void (*props)(VkPhysicalDevice, Props *) = gipa(inst, "vkGetPhysicalDeviceProperties");
  void (*feats2)(VkPhysicalDevice, Features2 *) = gipa(inst, "vkGetPhysicalDeviceFeatures2");
  if (!feats2) feats2 = gipa(inst, "vkGetPhysicalDeviceFeatures2KHR");
  uint32_t n = 1; VkPhysicalDevice pd; enumpd(inst, &n, &pd); if (!n) { printf("no devices\n"); return 4; }
  Props p; props(pd, &p);
  BorderColor bc = {1000287002, NULL}; Timeline tl = {1000207000, &bc}; Robust2 rb = {1000286000, &tl};
  Features2 f2 = {1000059000, &rb}; feats2(pd, &f2);
  printf("{\"device\":\"%s\",\"api\":\"%u.%u.%u\",\"logicOp\":%u,\"robustBufferAccess2\":%u,\"robustImageAccess2\":%u,"
         "\"nullDescriptor\":%u,\"timelineSemaphore\":%u,\"customBorderColors\":%u}\n", p.name, p.apiVersion >> 22,
         (p.apiVersion >> 12) & 0x3ff, p.apiVersion & 0xfff, f2.f[8] /* logicOp is index 8 of VkPhysicalDeviceFeatures */, rb.robustBufferAccess2, rb.robustImageAccess2,
         rb.nullDescriptor, tl.timelineSemaphore, bc.customBorderColors);
  return 0;
}
