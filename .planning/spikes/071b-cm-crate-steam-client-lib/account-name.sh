#!/bin/zsh
# Print the Steam account name for the SteamID inside GameLib's dev-vault refresh token, from Mac
# Steam's loginusers.vdf. Used only as SPIKE_ACCOUNT=$(./account-name.sh); never logged.
python3 -c '
import os,re,json,base64
v=json.load(open(os.environ["TMPDIR"]+"/gamelib-dev-secret-vault.json"))["steam-refresh-token"]
p=v.split(".")[1]; p+="="*(-len(p)%4); sub=json.loads(base64.urlsafe_b64decode(p))["sub"]
t=open(os.path.expanduser("~/Library/Application Support/Steam/config/loginusers.vdf")).read()
m=re.search(r"\"%s\"\s*\{(.*?)\}"%sub,t,re.S)
print(re.search(r"\"AccountName\"\s*\"([^\"]*)\"",m.group(1)).group(1))'
