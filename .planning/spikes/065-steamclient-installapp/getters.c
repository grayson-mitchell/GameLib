#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
typedef void *(*CI)(const char *, int *);
static void **vt(void *o){return *(void***)o;}
static const char *rn(void *o){ if(!o) return "(null)"; void *ti=vt(o)[-1]; return ti? *(const char**)((char*)ti+8):"?";}
int main(int argc,char**argv){
  char p[1024]; snprintf(p,sizeof p,"%s/Library/Application Support/Steam/Steam.AppBundle/Steam/Contents/MacOS/steamclient.dylib",getenv("HOME"));
  void *lib=dlopen(p,RTLD_NOW|RTLD_LOCAL); CI ci=(CI)dlsym(lib,"CreateInterface");
  void *e=ci("CLIENTENGINE_INTERFACE_VERSION005",0);
  int pipe=((int(*)(void*))vt(e)[0])(e); int user=((int(*)(void*,int))vt(e)[3])(e,pipe);
  for(int i=1;i<argc;i++){ int s=atoi(argv[i]); int pipeOnly= argv[i][0]=='p';
    if(pipeOnly) s=atoi(argv[i]+1);
    void *r= pipeOnly? ((void*(*)(void*,int))vt(e)[s])(e,pipe) : ((void*(*)(void*,int,int))vt(e)[s])(e,user,pipe);
    printf("{\"slot\":%d,\"args\":\"%s\",\"rtti\":\"%s\"}\n",s,pipeOnly?"pipe":"user,pipe",rn(r)); fflush(stdout);}
}
