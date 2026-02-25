use read_process_memory::{copy_address, Pid, ProcessHandle};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use sysinfo::System;

/// Pattern to search for: "?accountId="
const ACCOUNT_ID_PATTERN: &[u8] = b"?accountId=";

/// Get the cache directory for the app
fn get_cache_dir() -> Result<PathBuf, String> {
    let dirs = directories::ProjectDirs::from("", "", "YumeFrame")
        .ok_or("Failed to determine cache directory")?;
    let cache_dir = dirs.cache_dir().to_path_buf();

    // Create cache directory if it doesn't exist
    fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("Failed to create cache directory: {}", e))?;

    Ok(cache_dir)
}

/// Load cached asset entries
#[allow(dead_code)]
fn load_cached_assets() -> Result<Vec<AssetEntry>, String> {
    let cache_dir = get_cache_dir()?;
    let cache_file = cache_dir.join("assets.json");

    if !cache_file.exists() {
        return Ok(Vec::new());
    }

    let data =
        fs::read_to_string(&cache_file).map_err(|e| format!("Failed to read cache: {}", e))?;

    serde_json::from_str(&data).map_err(|e| format!("Failed to parse cache: {}", e))
}

/// Save asset entries to cache
fn save_cached_assets(assets: &[AssetEntry]) -> Result<(), String> {
    let cache_dir = get_cache_dir()?;
    let cache_file = cache_dir.join("assets.json");

    let data =
        serde_json::to_string(assets).map_err(|e| format!("Failed to serialize assets: {}", e))?;

    fs::write(&cache_file, data).map_err(|e| format!("Failed to write cache: {}", e))?;

    Ok(())
}

/// Load cached authz string
fn load_cached_authz() -> Option<String> {
    let cache_dir = get_cache_dir().ok()?;
    let cache_file = cache_dir.join("authz.txt");

    if cache_file.exists() {
        fs::read_to_string(&cache_file).ok()
    } else {
        None
    }
}

/// Save authz string to cache
fn save_cached_authz(authz: &str) -> Result<(), String> {
    let cache_dir = get_cache_dir()?;
    let cache_file = cache_dir.join("authz.txt");

    fs::write(&cache_file, authz).map_err(|e| format!("Failed to cache authz: {}", e))?;

    Ok(())
}

/// Clear cached authz (called when it becomes invalid)
fn clear_cached_authz() {
    if let Ok(cache_dir) = get_cache_dir() {
        let cache_file = cache_dir.join("authz.txt");
        let _ = fs::remove_file(cache_file);
    }
}

/// Represents a Warframe asset entry
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AssetEntry {
    pub filename: String,
    pub hash: String,
}

/// Represents a memory region in a process
#[derive(Debug, Clone)]
struct MemoryRegion {
    start: usize,
    end: usize,
}

/// Get memory regions for a process on Linux by reading /proc/[pid]/maps
#[cfg(target_os = "linux")]
fn get_memory_regions(pid: u32) -> Result<Vec<MemoryRegion>, String> {
    let maps_path = format!("/proc/{}/maps", pid);
    let file =
        fs::File::open(&maps_path).map_err(|e| format!("Failed to open {}: {}", maps_path, e))?;

    let reader = BufReader::new(file);
    let mut regions = Vec::new();

    for line in reader.lines() {
        let line = line.map_err(|e| format!("Failed to read line: {}", e))?;
        let parts: Vec<&str> = line.split_whitespace().collect();

        if parts.is_empty() {
            continue;
        }

        // Parse address range (format: start-end)
        let addr_range: Vec<&str> = parts[0].split('-').collect();
        if addr_range.len() != 2 {
            continue;
        }

        let start = usize::from_str_radix(addr_range[0], 16).unwrap_or(0);
        let end = usize::from_str_radix(addr_range[1], 16).unwrap_or(0);

        // Check permissions (need at least read permission)
        if parts.len() > 1 && parts[1].contains('r') {
            // Skip very large regions and kernel space
            let size = end.saturating_sub(start);
            if size > 0 && size < 1024 * 1024 * 512 {
                // Skip 512MB+ regions
                regions.push(MemoryRegion { start, end });
            }
        }
    }

    Ok(regions)
}

#[cfg(target_os = "windows")]
fn get_memory_regions(pid: u32) -> Result<Vec<MemoryRegion>, String> {
    use std::mem;
    use winapi::um::handleapi::CloseHandle;
    use winapi::um::memoryapi::VirtualQueryEx;
    use winapi::um::processthreadsapi::OpenProcess;
    use winapi::um::winnt::{
        MEMORY_BASIC_INFORMATION, MEM_COMMIT, PAGE_GUARD, PAGE_NOACCESS, PROCESS_QUERY_INFORMATION,
        PROCESS_VM_READ,
    };

    // Open the process with required access rights
    let handle = unsafe {
        OpenProcess(
            PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
            0, // bInheritHandle = FALSE
            pid,
        )
    };

    if handle.is_null() {
        return Err(format!(
            "Failed to open process {}: error code {}",
            pid,
            unsafe { winapi::um::errhandlingapi::GetLastError() }
        ));
    }

    let mut regions = Vec::new();
    let mut address: usize = 0;

    loop {
        let mut mbi: MEMORY_BASIC_INFORMATION = unsafe { mem::zeroed() };
        let result = unsafe {
            VirtualQueryEx(
                handle,
                address as *const _,
                &mut mbi,
                mem::size_of::<MEMORY_BASIC_INFORMATION>(),
            )
        };

        // If VirtualQueryEx returns 0, we've reached the end of the address space
        if result == 0 {
            break;
        }

        // Check if the region is committed and readable (not guarded or no-access)
        if mbi.State == MEM_COMMIT
            && (mbi.Protect & PAGE_GUARD) == 0
            && (mbi.Protect & PAGE_NOACCESS) == 0
            && mbi.Protect != 0
        {
            let start = mbi.BaseAddress as usize;
            let size = mbi.RegionSize as usize;
            let end = start + size;

            // Skip very large regions (512MB+) to avoid excessive scanning
            if size > 0 && size < 1024 * 1024 * 512 {
                regions.push(MemoryRegion { start, end });
            }
        }

        // Move to the next region
        let next_address = (mbi.BaseAddress as usize).saturating_add(mbi.RegionSize as usize);
        if next_address <= address {
            // Prevent infinite loop if address doesn't advance
            break;
        }
        address = next_address;
    }

    // Close the process handle
    unsafe {
        CloseHandle(handle);
    }

    Ok(regions)
}

/// Search for a pattern in a byte slice, returning the offset if found
fn find_pattern(data: &[u8], pattern: &[u8]) -> Option<usize> {
    data.windows(pattern.len())
        .position(|window| window == pattern)
}

/// Check if a character is a number (0-9)
fn is_number_char(c: u8) -> bool {
    c >= b'0' && c <= b'9'
}

/// Gruzzle (extract) the authorization string from the Warframe process memory
fn gruzzle_authz(handle: &ProcessHandle, regions: &[MemoryRegion]) -> Result<String, String> {
    println!("Gruzzling");
    let mut candidates: HashMap<String, u32> = HashMap::new();

    for region in regions {
        let size = region.end - region.start;

        // Read the memory region in chunks to avoid huge allocations
        const CHUNK_SIZE: usize = 1024 * 1024; // 1MB chunks
        let mut offset = 0;

        while offset < size {
            let read_size = std::cmp::min(CHUNK_SIZE + ACCOUNT_ID_PATTERN.len(), size - offset);
            let addr = region.start + offset;

            // Try to read this chunk
            match copy_address(addr, read_size, handle) {
                Ok(data) => {
                    // Search for pattern in this chunk
                    let mut search_pos = 0;
                    while let Some(pos) = find_pattern(&data[search_pos..], ACCOUNT_ID_PATTERN) {
                        let absolute_pos = search_pos + pos;
                        let pattern_end = absolute_pos + ACCOUNT_ID_PATTERN.len();

                        // Check if we have enough data for accountId (24 chars) + &nonce= (7 chars) + some digits
                        if pattern_end + 24 + 7 + 1 <= data.len() {
                            // Extract accountId (24 characters)
                            let account_id = &data[pattern_end..pattern_end + 24];

                            // Check if accountId looks valid (alphanumeric)
                            if account_id.iter().all(|&c| c.is_ascii_alphanumeric()) {
                                let mut authz = format!(
                                    "?accountId={}&nonce=",
                                    String::from_utf8_lossy(account_id)
                                );

                                // Extract nonce (skip "&nonce=" which is 7 chars after accountId)
                                let nonce_start = pattern_end + 24 + 7;
                                let mut nonce_end = nonce_start;

                                while nonce_end < data.len() && is_number_char(data[nonce_end]) {
                                    authz.push(data[nonce_end] as char);
                                    nonce_end += 1;
                                }

                                // Only consider if we found some nonce digits
                                if nonce_end > nonce_start {
                                    print!(".");

                                    let count = candidates.entry(authz.clone()).or_insert(0);
                                    *count += 1;

                                    if *count == 3 {
                                        println!(" The crumbs have been gruzzled.");
                                        return Ok(authz);
                                    }
                                }
                            }
                        }

                        search_pos = absolute_pos + 1;
                    }
                }
                Err(_) => {
                    // Failed to read this region, skip it
                }
            }

            // Move to next chunk (overlap by pattern length to catch patterns at boundaries)
            offset += CHUNK_SIZE;
        }
    }

    println!(" Failed to gruzzle the crumbs.");
    Err("Failed to find authorization data in process memory".to_string())
}

/// Find the Warframe process
fn find_warframe_process() -> Option<u32> {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    for (pid, process) in sys.processes() {
        let name = process.name().to_string_lossy();
        if name == "Warframe.x64.exe" || name == "Warframe.x64.ex" {
            return Some(pid.as_u32());
        }
    }

    None
}

/// Try to fetch inventory with a given authz string
/// Returns Ok(json) on success, Err on failure
fn try_fetch_inventory(authz: &str) -> Result<String, String> {
    let url = format!(
        "https://api.warframe.com/api/inventory.php{}",
        authz
    );

    println!("{} Downloading inventory... ", url);

    let client = reqwest::blocking::Client::new();
    let response = client
        .get(&url)
        .send()
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Request failed with status: {}", response.status()));
    }

    let inventory = response
        .text()
        .map_err(|e| format!("Failed to read response: {}", e))?;

    // Parse and validate JSON
    let json: Value =
        serde_json::from_str(&inventory).map_err(|_| "Received an invalid response")?;

    // Return pretty-printed JSON
    serde_json::to_string_pretty(&json).map_err(|e| format!("Failed to format JSON: {}", e))
}

/// Tauri command to fetch Warframe inventory
#[tauri::command]
pub fn fetch_warframe_inventory() -> Result<String, String> {
    // First, try to use cached authz if available
    if let Some(cached_authz) = load_cached_authz() {
        println!("Trying cached authz...");
        match try_fetch_inventory(&cached_authz) {
            Ok(inventory) => {
                println!("Inventory fetched successfully using cached authz.");
                return Ok(inventory);
            }
            Err(e) => {
                println!("Cached authz failed ({}), will gruzzle fresh authz...", e);
                clear_cached_authz();
            }
        }
    }

    // Find Warframe process
    let pid = find_warframe_process().ok_or("Warframe process not found")?;
    println!("Found Warframe process with PID: {}", pid);

    // Open process handle
    let handle: ProcessHandle = (pid as Pid)
        .try_into()
        .map_err(|e: std::io::Error| format!("Failed to open process: {}", e))?;

    // Get memory regions
    let regions = get_memory_regions(pid)?;
    println!("Found {} memory regions", regions.len());

    // Gruzzle authorization data
    let authz = gruzzle_authz(&handle, &regions)?;
    println!("{}", authz);

    // Cache the new authz for future use
    if let Err(e) = save_cached_authz(&authz) {
        println!("Warning: Failed to cache authz: {}", e);
    }

    // Download inventory
    println!("Downloading inventory... ");
    let inventory = try_fetch_inventory(&authz)?;

    println!("Inventory fetched successfully.");

    Ok(inventory)
}

/// Fetch and decompress the Warframe asset index
#[tauri::command]
pub async fn fetch_warframe_index() -> Result<Vec<AssetEntry>, String> {
    println!("Fetching Warframe asset index...");

    let url = "https://origin.warframe.com/PublicExport/index_en.txt.lzma";

    let client = reqwest::Client::new();
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch index: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Request failed with status: {}", response.status()));
    }

    let compressed_data = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    println!(
        "Downloaded {} bytes, decompressing...",
        compressed_data.len()
    );

    // Decompress LZMA
    let mut decompressed: Vec<u8> = Vec::new();
    lzma_rs::lzma_decompress(
        &mut std::io::Cursor::new(compressed_data.as_ref()),
        &mut decompressed,
    )
    .map_err(|e| format!("Failed to decompress LZMA: {:?}", e))?;

    let text =
        String::from_utf8(decompressed).map_err(|e| format!("Failed to decode text: {}", e))?;

    println!("Decompressed {} bytes", text.len());

    // Parse the content
    let mut assets = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        // Format: filename!hash
        if let Some(separator_pos) = line.find('!') {
            let filename = line[..separator_pos].to_string();
            let hash = line[separator_pos + 1..].to_string();
            assets.push(AssetEntry { filename, hash });
        }
    }

    println!("Parsed {} asset entries", assets.len());

    // Cache the assets
    save_cached_assets(&assets)?;

    Ok(assets)
}

/// Check if manifest has changed and download if needed
#[tauri::command]
pub async fn fetch_warframe_manifest(assets: Vec<AssetEntry>) -> Result<String, String> {
    println!("Checking manifest...");

    // Find the ExportManifest entry
    let manifest_entry = assets
        .iter()
        .find(|e| e.filename == "ExportManifest.json")
        .ok_or("ExportManifest.json not found in asset list")?;

    let hash = &manifest_entry.hash;
    let cache_dir = get_cache_dir()?;
    let manifest_hash_file = cache_dir.join("manifest_hash.txt");
    let manifest_file = cache_dir.join("ExportManifest.json");

    // Check if we have a cached manifest with the same hash
    let cached_hash = if manifest_hash_file.exists() {
        fs::read_to_string(&manifest_hash_file).ok()
    } else {
        None
    };

    // If hash matches cached hash and file exists, return cached version
    if cached_hash.as_deref() == Some(hash) && manifest_file.exists() {
        println!("Manifest unchanged, using cached version");
        let content = fs::read_to_string(&manifest_file)
            .map_err(|e| format!("Failed to read cached manifest: {}", e))?;
        return Ok(content);
    }

    println!("Hash changed or manifest not cached, downloading...");

    // Download the manifest with the hash
    let url = format!(
        "http://content.warframe.com/PublicExport/Manifest/ExportManifest.json!{}",
        hash
    );
    println!("Downloading from: {}", url);

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to download manifest: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to download manifest: status {}",
            response.status()
        ));
    }

    let manifest_content = response
        .text()
        .await
        .map_err(|e| format!("Failed to read manifest: {}", e))?;

    // Validate JSON
    let _: Value =
        serde_json::from_str(&manifest_content).map_err(|_| "Invalid JSON in manifest")?;

    // Cache the manifest
    fs::write(&manifest_file, &manifest_content)
        .map_err(|e| format!("Failed to cache manifest: {}", e))?;

    // Cache the hash
    fs::write(&manifest_hash_file, hash)
        .map_err(|e| format!("Failed to cache manifest hash: {}", e))?;

    println!("Manifest downloaded and cached successfully");

    Ok(manifest_content)
}

/// Generic function to download and cache an asset file if hash changed
async fn download_and_cache_asset(filename: &str, hash: &str) -> Result<String, String> {
    let cache_dir = get_cache_dir()?;
    let asset_hash_file = cache_dir.join(format!("{}.hash", filename));
    let asset_file = cache_dir.join(filename);

    // Check if we have a cached asset with the same hash
    let cached_hash = if asset_hash_file.exists() {
        fs::read_to_string(&asset_hash_file).ok()
    } else {
        None
    };

    // If hash matches and file exists, return cached version
    if cached_hash.as_deref() == Some(hash) && asset_file.exists() {
        println!("Using cached {}", filename);
        let content = fs::read_to_string(&asset_file)
            .map_err(|e| format!("Failed to read cached {}: {}", filename, e))?;
        return Ok(content);
    }

    // Download the asset with the hash
    let url = format!(
        "http://content.warframe.com/PublicExport/Manifest/{}!{}",
        filename, hash
    );
    println!("Downloading {}", filename);

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to download {}: {}", filename, e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to download {} with status {}",
            filename,
            response.status()
        ));
    }

    let content = response
        .text()
        .await
        .map_err(|e| format!("Failed to read {}: {}", filename, e))?;

    // Validate JSON
    let _: Value =
        serde_json::from_str(&content).map_err(|_| format!("Invalid JSON in {}", filename))?;

    // Cache the asset
    fs::write(&asset_file, &content).map_err(|e| format!("Failed to cache {}: {}", filename, e))?;

    // Cache the hash
    fs::write(&asset_hash_file, hash)
        .map_err(|e| format!("Failed to cache {} hash: {}", filename, e))?;

    println!("Downloaded and cached {}", filename);

    Ok(content)
}

/// Fetch warframe data - returns raw JSON for frontend parsing
#[tauri::command]
pub async fn fetch_warframe_data(assets: Vec<AssetEntry>) -> Result<String, String> {
    let warframe_asset = assets
        .iter()
        .find(|e| e.filename == "ExportWarframes_en.json")
        .ok_or("ExportWarframes_en.json not found in asset list")?;

    let content = download_and_cache_asset("ExportWarframes_en.json", &warframe_asset.hash).await?;
    println!("Fetched ExportWarframes_en.json");
    Ok(content)
}

/// Fetch weapon data - returns raw JSON for frontend parsing
#[tauri::command]
pub async fn fetch_weapon_data(assets: Vec<AssetEntry>) -> Result<String, String> {
    let weapon_asset = assets
        .iter()
        .find(|e| e.filename == "ExportWeapons_en.json")
        .ok_or("ExportWeapons_en.json not found in asset list")?;

    let content = download_and_cache_asset("ExportWeapons_en.json", &weapon_asset.hash).await?;
    println!("Fetched ExportWeapons_en.json");
    Ok(content)
}

/// Fetch recipe data - returns raw JSON for frontend parsing
#[tauri::command]
pub async fn fetch_recipe_data(assets: Vec<AssetEntry>) -> Result<String, String> {
    let recipe_asset = assets
        .iter()
        .find(|e| e.filename == "ExportRecipes_en.json")
        .ok_or("ExportRecipes_en.json not found in asset list")?;

    let content = download_and_cache_asset("ExportRecipes_en.json", &recipe_asset.hash).await?;
    println!("Fetched ExportRecipes_en.json");
    Ok(content)
}

/// Fetch resource data - returns raw JSON for frontend parsing
#[tauri::command]
pub async fn fetch_resource_data(assets: Vec<AssetEntry>) -> Result<String, String> {
    let resource_asset = assets
        .iter()
        .find(|e| e.filename == "ExportResources_en.json")
        .ok_or("ExportResources_en.json not found in asset list")?;

    let content = download_and_cache_asset("ExportResources_en.json", &resource_asset.hash).await?;
    println!("Fetched ExportResources_en.json");
    Ok(content)
}

/// Fetch companion data - returns raw JSON for frontend parsing
#[tauri::command]
pub async fn fetch_companion_data(assets: Vec<AssetEntry>) -> Result<String, String> {
    let companion_asset = assets
        .iter()
        .find(|e| e.filename == "ExportSentinels_en.json")
        .ok_or("ExportSentinels_en.json not found in asset list")?;

    let content =
        download_and_cache_asset("ExportSentinels_en.json", &companion_asset.hash).await?;
    println!("Fetched ExportSentinels_en.json");
    Ok(content)
}

/// Fetch relic data - returns raw JSON for frontend parsing
#[tauri::command]
pub async fn fetch_relic_data(assets: Vec<AssetEntry>) -> Result<String, String> {
    let relic_asset = assets
        .iter()
        .find(|e| e.filename == "ExportRelicArcane_en.json")
        .ok_or("ExportRelicArcane_en.json not found in asset list")?;

    let content = download_and_cache_asset("ExportRelicArcane_en.json", &relic_asset.hash).await?;
    println!("Fetched ExportRelicArcane_en.json");
    Ok(content)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_pattern() {
        let data = b"hello?accountId=test";
        let pattern = b"?accountId=";
        assert_eq!(find_pattern(data, pattern), Some(5));
    }

    #[test]
    fn test_is_number_char() {
        assert!(is_number_char(b'0'));
        assert!(is_number_char(b'9'));
        assert!(!is_number_char(b'a'));
        assert!(!is_number_char(b'&'));
    }
}
