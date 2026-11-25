//! `utils/systeminfo/gpu/pci_ids.ts`: the names of a GPU's device and vendor, from the `pci.ids` DNS
//! mirror, through two 7-day caches (`store_cache/pci_ids_device`, `store_cache/pci_ids_vendor`) that keep
//! their on-disk names and shape, so a rolled-back build reads what Rust wrote (87 D-07).

use std::io;

use gamelib_store::json::Json;
use serde_json::{json, Value};

use super::dns::TxtResolver;
use super::gpu::PartialGpu;
use crate::cache_view::{CacheView, PCI_IDS_DEVICE, PCI_IDS_VENDOR};
use crate::ctx::InfoCtx;

/// `GPUInfo` with both names found.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GpuInfo {
    pub gpu: PartialGpu,
    pub device_string: String,
    pub vendor_string: String,
}

impl GpuInfo {
    /// The fields of the TS object: the ids and driver, then the two names.
    pub fn to_value(&self) -> Value {
        let mut value = self.gpu.to_value();
        if let Some(fields) = value.as_object_mut() {
            fields.insert("deviceString".into(), json!(self.device_string));
            fields.insert("vendorString".into(), json!(self.vendor_string));
        }
        value
    }
}

/// The two lookup caches (`createPciIdCaches`).
pub struct PciCaches {
    device: CacheView,
    vendor: CacheView,
}

impl PciCaches {
    /// Opens both over the context's StoreHost. A cache file that is not a JSON object is an error and
    /// is never overwritten.
    pub fn open(ctx: &InfoCtx) -> io::Result<PciCaches> {
        let open =
            |params| CacheView::open(&ctx.host, &ctx.paths.user_data, params, ctx.clock.clone());
        Ok(PciCaches {
            device: open(PCI_IDS_DEVICE)?,
            vendor: open(PCI_IDS_VENDOR)?,
        })
    }
}

/// A cached name, when there is a usable one (`if (cached) return cached`: a non-empty string).
fn cached_name(view: &CacheView, key: &str) -> Option<String> {
    match view.get_opt(key) {
        Some(Json::Str(name)) if !name.is_empty() => Some(name),
        _ => None,
    }
}

/// `pciIdDnsQuery(key.replaceAll('_', '.'))`: the cache key spells the ids with `_`, the DNS name with
/// `.`. An empty answer is no answer (the TS treated `''` and `false` alike).
async fn dns_query(resolver: &dyn TxtResolver, key: &str) -> Option<String> {
    let name = format!("{}.pci.id.ucw.cz", key.replace('_', "."));
    resolver
        .lookup(&name)
        .await
        .filter(|answer| !answer.is_empty())
}

/// `lookupKey` of `lookupDeviceString`: the cache, then DNS, remembering a found name.
async fn lookup_key(
    view: &CacheView,
    resolver: &dyn TxtResolver,
    key: &str,
) -> io::Result<Option<String>> {
    if let Some(cached) = cached_name(view, key) {
        return Ok(Some(cached));
    }
    let result = dns_query(resolver, key).await;
    if let Some(name) = &result {
        view.set(key, Json::Str(name.clone()))?;
    }
    Ok(result)
}

/// `lookupDeviceString`: with both subsystem ids, the sub-id name first, then the plain one, written
/// back under the sub-id key so the next run does not ask again.
pub async fn lookup_device_string(
    caches: &PciCaches,
    resolver: &dyn TxtResolver,
    vendor_id: &str,
    device_id: &str,
    subvendor_id: Option<&str>,
    subdevice_id: Option<&str>,
) -> io::Result<Option<String>> {
    let plain_key = format!("{device_id}_{vendor_id}");
    let (Some(subvendor_id), Some(subdevice_id)) = (
        subvendor_id.filter(|id| !id.is_empty()),
        subdevice_id.filter(|id| !id.is_empty()),
    ) else {
        return lookup_key(&caches.device, resolver, &plain_key).await;
    };
    let sub_key = format!("{subdevice_id}_{subvendor_id}_{device_id}_{vendor_id}");
    if let Some(name) = lookup_key(&caches.device, resolver, &sub_key).await? {
        return Ok(Some(name));
    }
    // No name for this specific subsystem: the plain device and vendor ids.
    let plain = lookup_key(&caches.device, resolver, &plain_key).await?;
    if let Some(name) = &plain {
        caches.device.set(&sub_key, Json::Str(name.clone()))?;
    }
    Ok(plain)
}

/// `lookupVendorString`.
pub async fn lookup_vendor_string(
    caches: &PciCaches,
    resolver: &dyn TxtResolver,
    vendor_id: &str,
) -> io::Result<Option<String>> {
    if let Some(cached) = cached_name(&caches.vendor, vendor_id) {
        return Ok(Some(cached));
    }
    let result = dns_query(resolver, vendor_id).await;
    if let Some(name) = &result {
        caches.vendor.set(vendor_id, Json::Str(name.clone()))?;
    }
    Ok(result)
}

/// `populateDeviceAndVendorName`: each GPU in turn gets its device name, then its vendor name (both are
/// looked up before either is checked), and one missing either is dropped from the list. The ids are
/// lowercased for the lookup, as the TS did.
pub async fn populate_device_and_vendor_name(
    caches: &PciCaches,
    resolver: &dyn TxtResolver,
    partial: Vec<PartialGpu>,
) -> io::Result<Vec<GpuInfo>> {
    let mut full = Vec::new();
    for gpu in partial {
        let vendor_id = gpu.vendor_id.to_lowercase();
        let device_id = gpu.device_id.to_lowercase();
        let subvendor_id = gpu.subvendor_id.as_deref().map(str::to_lowercase);
        let subdevice_id = gpu.subdevice_id.as_deref().map(str::to_lowercase);

        let device_string = lookup_device_string(
            caches,
            resolver,
            &vendor_id,
            &device_id,
            subvendor_id.as_deref(),
            subdevice_id.as_deref(),
        )
        .await?;
        let vendor_string = lookup_vendor_string(caches, resolver, &vendor_id).await?;
        let (Some(device_string), Some(vendor_string)) = (device_string, vendor_string) else {
            continue;
        };
        full.push(GpuInfo {
            gpu,
            device_string,
            vendor_string,
        });
    }
    Ok(full)
}
