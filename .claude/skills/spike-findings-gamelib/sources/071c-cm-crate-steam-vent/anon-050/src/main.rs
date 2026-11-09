//! 071c sub-check: anonymous logon + PICS on released steam-vent 0.5.0, because git main
//! (a9e8164) fails every anonymous logon with LoginError::NoToken. Prints name/buildid/manifest
//! count per app and writes ../out/anon.json in 071a's shape.
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::time::Instant;
use steam_vent::{Connection, ConnectionTrait, ServerList};
use steam_vent_proto::steammessages_clientserver_appinfo::{
    CMsgClientPICSAccessTokenRequest, CMsgClientPICSAccessTokenResponse, CMsgClientPICSProductInfoRequest,
    CMsgClientPICSProductInfoResponse, cmsg_client_picsproduct_info_request,
};

fn to_json(v: &keyvalues_parser::Value) -> Value {
    match v {
        keyvalues_parser::Value::Str(s) => Value::String(s.to_string()),
        keyvalues_parser::Value::Obj(o) => Value::Object(o.iter().filter_map(|(k, vs)| vs.first().map(|f| (k.to_string(), to_json(f)))).collect()),
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let t0 = Instant::now();
    let apps: Vec<u32> = std::env::args().skip(1).map(|a| a.parse().unwrap()).collect();
    let servers = ServerList::discover().await?;
    let c = Connection::anonymous(&servers).await?;
    eprintln!("[{:.3}s] anonymous logon ok (steam-vent 0.5.0)", t0.elapsed().as_secs_f64());
    let mut out = serde_json::Map::new();
    for &a in &apps {
        let t = Instant::now();
        let tok: CMsgClientPICSAccessTokenResponse = c.job(CMsgClientPICSAccessTokenRequest { appids: vec![a], ..Default::default() }).await?;
        let token = tok.app_access_tokens.first().map(|t| t.access_token()).unwrap_or(0);
        let r: CMsgClientPICSProductInfoResponse = c.job(CMsgClientPICSProductInfoRequest {
            apps: vec![cmsg_client_picsproduct_info_request::AppInfo { appid: Some(a), access_token: Some(token), ..Default::default() }],
            meta_data_only: Some(false), single_response: Some(true), ..Default::default() }).await?;
        let text = String::from_utf8_lossy(r.apps[0].buffer());
        let root = to_json(&keyvalues_parser::Vdf::parse(text.trim().trim_end_matches('\0'))?.value);
        let mut m = BTreeMap::new();
        if let Some(d) = root["depots"].as_object() {
            for (id, dep) in d {
                if !id.chars().all(|c| c.is_ascii_digit()) { continue }
                let p = &dep["manifests"]["public"];
                if let Some(g) = p.as_str().map(str::to_string).or_else(|| p["gid"].as_str().map(str::to_string)) { m.insert(id.clone(), g); }
            }
        }
        eprintln!("[{:.3}s] {a} {} {} manifests in {:?}", t0.elapsed().as_secs_f64(), root["common"]["name"], m.len(), t.elapsed());
        out.insert(a.to_string(), json!({ "name": root["common"]["name"], "buildid": root["depots"]["branches"]["public"]["buildid"], "manifests": m }));
    }
    std::fs::write("../out/anon.json", serde_json::to_string_pretty(&json!({ "client": "steam-vent@0.5.0", "apps": out }))?)?;
    Ok(())
}
