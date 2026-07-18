// 005b bottle-side client (PE32 i386, runs inside the GameLibSteam CrossOver bottle).
//
// Proves a Windows process inside a GameLib bottle can reach a TCP server on the
// macOS host's loopback — and, via WHOAMI, pull the REAL signed-in identity that
// the host bridge read from native Mac Steam. Writes the reply both to stdout and
// to C:\bridge_out.txt (host: <bottle>/drive_c/bridge_out.txt) so the result is
// recoverable even if the bottle detaches stdout.

#include <winsock2.h>
#include <ws2tcpip.h>
#include <stdio.h>
#include <string.h>

int main(void) {
  FILE *f = fopen("C:\\bridge_out.txt", "w");
  WSADATA w;
  if (WSAStartup(MAKEWORD(2, 2), &w) != 0) { printf("WSAStartup fail\n"); if (f) { fprintf(f, "WSAStartup fail\n"); fclose(f); } return 1; }

  SOCKET s = socket(AF_INET, SOCK_STREAM, 0);
  struct sockaddr_in a; memset(&a, 0, sizeof a);
  a.sin_family = AF_INET;
  a.sin_port = htons(54550);
  a.sin_addr.s_addr = inet_addr("127.0.0.1"); // host loopback == bottle loopback (Wine shares host net)

  if (connect(s, (struct sockaddr *)&a, sizeof a) != 0) {
    int e = WSAGetLastError();
    printf("CONNECT_FAIL %d\n", e);
    if (f) { fprintf(f, "CONNECT_FAIL %d\n", e); fclose(f); }
    return 2;
  }

  const char *req = "WHOAMI\n";
  send(s, req, (int)strlen(req), 0);

  char buf[512]; memset(buf, 0, sizeof buf);
  int k = recv(s, buf, sizeof buf - 1, 0);
  if (k > 0) {
    printf("BRIDGE_REPLY %s", buf);
    if (f) fprintf(f, "BRIDGE_REPLY %s", buf);
  } else {
    printf("NO_REPLY\n");
    if (f) fprintf(f, "NO_REPLY\n");
  }

  if (f) fclose(f);
  closesocket(s);
  WSACleanup();
  return 0;
}
