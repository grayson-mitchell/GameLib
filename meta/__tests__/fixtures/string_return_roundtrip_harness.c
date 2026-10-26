/*
 * Host harness for the string-return wire contract (quick 261026-rqb).
 * gl_string_return.h is written by the test from the generator's own
 * emitStringReturnEncodeLines / emitStringReturnDecode, so the SAME text that
 * ships on both sides of the wire is round-tripped here.
 */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "gl_string_return.h"

static const char *g_case = "?";

static void fail_at(const char *what, int line) {
  printf("FAIL %s %s:%d\n", g_case, what, line);
  fflush(stdout);
  exit(1);
}
#define CHECK(c)                                                              \
  do {                                                                        \
    if (!(c)) fail_at(#c, __LINE__);                                          \
  } while (0)

/* Encode with the helper, copy into a transact-sized retbuf, decode. */
static const char *roundtrip(const char *result, char *buf) {
  uint8_t resp[4096];
  uint32_t respLen = 0;
  uint8_t status = gl_encode(result, resp, sizeof(resp), &respLen);
  CHECK(status == 0);
  CHECK(respLen <= STRING_RETURN_WIRE_BYTES);
  uint8_t retbuf[STRING_RETURN_WIRE_BYTES];
  memcpy(retbuf, resp, respLen);
  return gl_decode(retbuf, respLen, buf);
}

static void pass(void) {
  printf("PASS %s\n", g_case);
  fflush(stdout);
}

static void check_len(uint32_t n) {
  char src[512];
  char buf[STRING_RETURN_BUF_BYTES];
  uint32_t i;
  for (i = 0; i < n; i++) src[i] = (char)('a' + (i % 26));
  src[n] = 0;
  const char *got = roundtrip(src, buf);
  CHECK(strlen(got) == n);
  CHECK(memcmp(got, src, n) == 0);
}

int main(void) {
  char buf[STRING_RETURN_BUF_BYTES];
  uint8_t retbuf[STRING_RETURN_WIRE_BYTES];
  const char *got;

  g_case = "empty";
  got = roundtrip("", buf);
  CHECK(strlen(got) == 0);
  pass();

  g_case = "seven_byte_name";
  got = roundtrip("Tester7", buf);
  CHECK(strlen(got) == 7);
  CHECK(memcmp(got, "Tester7", 7) == 0);
  CHECK((unsigned char)got[0] != 0x07);
  pass();

  g_case = "len_128";
  check_len(128);
  pass();

  g_case = "len_255";
  check_len(255);
  pass();

  g_case = "capped_300";
  {
    char src[301];
    memset(src, 'x', 300);
    src[300] = 0;
    got = roundtrip(src, buf);
    CHECK(strlen(got) == 255);
    CHECK(memcmp(got, src, 255) == 0);
  }
  pass();

  g_case = "null_result";
  {
    uint8_t resp[4096];
    uint32_t respLen = 99;
    CHECK(gl_encode(NULL, resp, sizeof(resp), &respLen) == 1);
    CHECK(respLen == 0);
    /* shim failure path: buffer set to "" */
    buf[0] = 'z';
    buf[0] = '\0';
    CHECK(strlen(buf) == 0);
  }
  pass();

  g_case = "malformed_short";
  memset(retbuf, 0x41, sizeof(retbuf));
  buf[0] = 'z';
  got = gl_decode(retbuf, 0, buf);
  CHECK(strlen(got) == 0);
  buf[0] = 'z';
  got = gl_decode(retbuf, 1, buf);
  CHECK(strlen(got) == 0);
  buf[0] = 'z';
  got = gl_decode(retbuf, 3, buf);
  CHECK(strlen(got) == 0);
  pass();

  g_case = "malformed_overlong";
  memset(retbuf, 0x41, sizeof(retbuf));
  {
    uint32_t d = 10;
    memcpy(retbuf, &d, 4);
    buf[0] = 'z';
    got = gl_decode(retbuf, 8, buf);
    CHECK(strlen(got) == 0);

    d = STRING_RETURN_BUF_BYTES;
    memcpy(retbuf, &d, 4);
    buf[0] = 'z';
    got = gl_decode(retbuf, STRING_RETURN_WIRE_BYTES, buf);
    CHECK(strlen(got) == 0);

    d = 0xFFFFFFFFu;
    memcpy(retbuf, &d, 4);
    buf[0] = 'z';
    got = gl_decode(retbuf, STRING_RETURN_WIRE_BYTES, buf);
    CHECK(strlen(got) == 0);
  }
  pass();

  return 0;
}
