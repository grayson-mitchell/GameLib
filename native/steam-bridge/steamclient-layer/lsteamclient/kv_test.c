/* Host-side check for the KeyValues reader in steamclient_main.c (WR-02). Not part of the Wine build.
   Run: sed -n "/GAMELIB_KV_BEGIN/,/GAMELIB_KV_END/p" steamclient_main.c > kv.inc && cc -I. kv_test.c -o kv_test && ./kv_test */
#include <stdio.h>
#include <string.h>
#include <stdint.h>
#include <assert.h>
#include "kv.inc"
#define B(s) gamelib_acf_buildid(s, strlen(s))
int main(void){
  assert(B("\"AppState\"\n{\n\t\"appid\"\t\"1\"\n\t\"buildid\"\t\"12345\"\n}")==12345);
  /* nested buildid before the top-level one must not win */
  assert(B("\"AppState\"{\"InstalledDepots\"{\"2\"{\"buildid\"\"7\"}}\"buildid\"\"99\"}")==99);
  /* nested only -> 0 */
  assert(B("\"AppState\"{\"X\"{\"buildid\"\"7\"}}")==0);
  /* token inside a value is not a key */
  assert(B("\"AppState\"{\"name\"\"buildid\"\"buildid\"\"5\"}")==5);
  assert(B("\"AppState\"{\"buildid\"\"abc\"}")==0);
  assert(B("\"AppState\"{\"buildid\"\"2147483648\"}")==0);
  assert(B("\"AppState\"{\"buildid\"\"2147483647\"}")==2147483647);
  assert(B("\"AppState\"{\"buildid\"\"\"}")==0);
  assert(B("// c\n\"AppState\"{//x\n\"buildid\"\"8\"}")==8);
  assert(B("garbage")==0 && B("")==0 && B("\"AppState\"{\"buildid\"\"12")==0);
  const char *v="\"libraryfolders\"{\"0\"{\"path\"\"C:\\\\Program Files (x86)\\\\Steam\"\"apps\"{\"1\"\"2\"}}\"1\"{\"path\"\"D:\\\\Lib\"}}";
  char o[512];
  assert(gamelib_kv_find(v,strlen(v),"path",2,0,o,sizeof o)&&!strcmp(o,"C:\\Program Files (x86)\\Steam"));
  assert(gamelib_kv_find(v,strlen(v),"path",2,1,o,sizeof o)&&!strcmp(o,"D:\\Lib"));
  assert(!gamelib_kv_find(v,strlen(v),"path",2,2,o,sizeof o));
  puts("ok");
  return 0;}
