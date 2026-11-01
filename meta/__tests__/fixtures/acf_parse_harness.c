/*
 * Host harness for the DRM-mode ACF/VDF KeyValues parser (quick-261101-j03, WR-02).
 * meta/__tests__/acfParseHost.test.ts writes the text between the GAMELIB-ACF-PARSE fences of
 * steamclient_main.c to gl_acf_parse.c and this file #includes it, so the SAME bytes that ship are
 * what is proven. Fixtures are passed with explicit lengths and, for the bounds cases, copied into
 * an exactly-sized malloc buffer with no terminator.
 */
#define _GNU_SOURCE
#include <stddef.h>
#include <stdint.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "gl_acf_parse.c"

static int g_fail;

static void report(const char *name, int ok, const char *detail)
{
    if (ok) printf("PASS %s\n", name);
    else { printf("FAIL %s: %s\n", name, detail); g_fail = 1; }
}

/* Exactly-sized, unterminated copy so an overread cannot hide behind a NUL. */
static char *exact(const char *s, size_t len)
{
    char *p = malloc(len ? len : 1);
    if (len) memcpy(p, s, len);
    return p;
}

static int32_t build(const char *s, size_t len)
{
    char *p = exact(s, len);
    int32_t r = gamelib_acf_buildid(p, len);
    free(p);
    return r;
}
#define BUILD(lit) build(lit, sizeof(lit) - 1)

static void expect(const char *name, int32_t got, int32_t want)
{
    char d[64];
    snprintf(d, sizeof d, "got %d want %d", (int)got, (int)want);
    report(name, got == want, d);
}

static size_t vdf(const char *s, size_t len, unsigned idx, char *out, size_t cap)
{
    char *p = exact(s, len);
    size_t r = gamelib_vdf_library_path(p, len, idx, out, cap);
    free(p);
    return r;
}

int main(void)
{
    int32_t a, b, c, d, e;
    char out[64];
    size_t n;
    static const char vdftext[] =
        "\"libraryfolders\"\n{\n"
        "\t\"0\"\n\t{\n\t\t\"path\"\t\t\"C:\\\\Program Files (x86)\\\\Steam\"\n"
        "\t\t\"apps\"\n\t\t{\n\t\t\t\"path\" \"Z:\\\\Nested\"\n\t\t\t\"648800\" \"123\"\n\t\t}\n\t}\n"
        "\t\"1\"\n\t{\n\t\t\"path\"\t\t\"D:\\\\Games\\\\SteamLib\"\n\t}\n}\n";

    expect("basic", BUILD("\"AppState\"{ \"appid\" \"648800\" \"buildid\" \"22312909\" }"), 22312909);

    expect("nested_first", BUILD(
        "\"AppState\"{ \"InstalledDepots\"{ \"1\"{ \"buildid\" \"111\" } } "
        "\"UserConfig\"{\"buildid\" \"5\"} \"buildid\" \"22312909\" }"), 22312909);

    expect("nested_only", BUILD("\"AppState\"{ \"Sub\"{ \"buildid\" \"7\" } }"), 0);

    expect("case_insensitive", BUILD("\"appstate\"{ \"BuildID\" \"42\" }"), 42);

    expect("escaped_quotes", BUILD(
        "\"AppState\"{ \"name\" \"a \\\"buildid\\\" \\\\ b\" "
        "\"na\\\"buildid\\\"\" \"9\" \"buildid\" \"31\" }"), 31);

    expect("comments", BUILD(
        "\"AppState\"{ // \"buildid\" \"1\"\n \"buildid\" \"88\" // x\n }"), 88);

    a = BUILD("\"AppState\"{ \"appid\" \"1\" }");
    b = build("", 0);
    c = BUILD("\"Other\"{ \"buildid\" \"7\" }");
    report("missing", a == 0 && b == 0 && c == 0, "expected all zero");

    a = BUILD("\"AppState\"{ \"buildid\" \"2147483648\" }");
    b = BUILD("\"AppState\"{ \"buildid\" \"2147483647\" }");
    c = BUILD("\"AppState\"{ \"buildid\" \"12345678901\" }");
    report("overflow", a == 0 && b == 2147483647 && c == 0, "bounds wrong");

    a = BUILD("\"AppState\"{ \"buildid\" \"12a\" }");
    b = BUILD("\"AppState\"{ \"buildid\" \"\" }");
    c = BUILD("\"AppState\"{ \"buildid\" \"-5\" }");
    d = BUILD("\"AppState\"{ \"buildid\" \" 5\" }");
    e = BUILD("\"AppState\"{ \"buildid\" \"0\" }");
    report("non_digit", !a && !b && !c && !d && !e, "non-digit accepted");

    expect("value_is_block", BUILD("\"AppState\"{ \"buildid\" { } \"buildid\" \"5\" }"), 0);

    {
        static const char t1[] = "\"AppState\"{ \"buildid\" \"123";
        static const char t3[] = "\"AppState\"{ \"a\"{ \"b\" \"c\" ";
        static const char t4[] = "\"AppState\" }";
        static const char t5[] = "\"AppState\"{ \"buildid\" \"12\\";
        static const char t6[] = "\"AppState\"{ \"buildid\"";
        int ok = !build(t1, sizeof t1 - 1) && !build(t3, sizeof t3 - 1) &&
                 !build(t4, sizeof t4 - 1) && !build(t5, sizeof t5 - 1) && !build(t6, sizeof t6 - 1);
        /* every prefix of a valid file must be safe (checked by exact-size buffers) and never accept
         * a truncated number as complete only if the closing quote is present */
        static const char full[] = "\"AppState\"{ \"buildid\" \"22312909\" }";
        size_t i;
        for (i = 0; i < sizeof full - 1; i++) (void)build(full, i);
        report("malformed", ok, "malformed input accepted");
    }

    n = vdf(vdftext, sizeof vdftext - 1, 0, out, sizeof out);
    a = n == strlen("C:\\Program Files (x86)\\Steam") && !strcmp(out, "C:\\Program Files (x86)\\Steam");
    n = vdf(vdftext, sizeof vdftext - 1, 1, out, sizeof out);
    b = n == strlen("D:\\Games\\SteamLib") && !strcmp(out, "D:\\Games\\SteamLib");
    c = vdf(vdftext, sizeof vdftext - 1, 2, out, sizeof out) == 0;
    d = vdf(vdftext, sizeof vdftext - 1, 1, out, 10) == 0; /* path longer than cap */
    e = vdf("", 0, 0, out, sizeof out) == 0 && vdf("\"x\"{}", 5, 0, out, sizeof out) == 0;
    report("vdf_paths", a && b && c && d && e, "vdf path extraction wrong");

    return g_fail ? 1 : 0;
}
