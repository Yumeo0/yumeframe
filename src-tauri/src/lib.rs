mod relic_scanner;
mod warframe_api;
use tauri::AppHandle;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn restart_app(app: AppHandle) {
    app.request_restart();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            restart_app,
            warframe_api::detect_ee_log_paths,
            warframe_api::fetch_warframe_inventory,
            warframe_api::fetch_warframe_index,
            warframe_api::fetch_warframe_manifest,
            warframe_api::fetch_warframe_data,
            warframe_api::fetch_weapon_data,
            warframe_api::fetch_recipe_data,
            warframe_api::fetch_resource_data,
            warframe_api::fetch_companion_data,
            warframe_api::fetch_relic_data,
            warframe_api::fetch_upgrade_data,
            warframe_api::fetch_regions_data,
            warframe_api::fetch_latest_arbitration_stats,
            relic_scanner::start_relic_scanner,
            relic_scanner::stop_relic_scanner,
            relic_scanner::trigger_relic_scan,
            relic_scanner::trigger_relic_scan_from_image,
            relic_scanner::set_relic_overlay_enabled
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
