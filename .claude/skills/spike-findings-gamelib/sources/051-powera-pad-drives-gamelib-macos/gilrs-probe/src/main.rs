// Spike 051: does gilrs (IOKit backend on macOS) see the PowerA pad, and with what mapping?
// Usage: gilrs-probe [seconds=30]
use gilrs::{EventType, Gilrs, MappingSource};
use std::time::{Duration, Instant};

fn main() {
    let secs: u64 = std::env::args().nth(1).and_then(|s| s.parse().ok()).unwrap_or(30);
    let mut gilrs = Gilrs::new().expect("gilrs init");
    // Connected-at-start devices appear after the first event poll on some backends.
    let warm = Instant::now();
    while warm.elapsed() < Duration::from_millis(500) {
        while gilrs.next_event().is_some() {}
        std::thread::sleep(Duration::from_millis(10));
    }
    for (id, gp) in gilrs.gamepads() {
        let mapping = match gp.mapping_source() {
            MappingSource::SdlMappings => "sdl-db",
            MappingSource::Driver => "driver",
            MappingSource::None => "none",
        };
        println!(
            "pad {id}: name={:?} os_name={:?} vid={:04x?} pid={:04x?} uuid={} mapping={mapping} connected={}",
            gp.name(), gp.os_name(), gp.vendor_id(), gp.product_id(),
            gp.uuid().iter().map(|b| format!("{b:02x}")).collect::<String>(), gp.is_connected()
        );
    }
    println!("listening {secs}s");
    let start = Instant::now();
    let mut last_axis: std::collections::HashMap<String, Instant> = Default::default();
    while start.elapsed() < Duration::from_secs(secs) {
        while let Some(ev) = gilrs.next_event() {
            match ev.event {
                EventType::AxisChanged(_, _, code) => {
                    let k = format!("{code:?}");
                    if last_axis.get(&k).map_or(false, |t| t.elapsed() < Duration::from_millis(100)) { continue; }
                    last_axis.insert(k, Instant::now());
                    println!("{:>6}ms pad {} {:?}", start.elapsed().as_millis(), ev.id, ev.event);
                }
                _ => println!("{:>6}ms pad {} {:?}", start.elapsed().as_millis(), ev.id, ev.event),
            }
        }
        std::thread::sleep(Duration::from_millis(5));
    }
    println!("done");
}
