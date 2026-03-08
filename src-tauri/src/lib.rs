mod warframe_api;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            warframe_api::detect_ee_log_path,
            warframe_api::fetch_warframe_inventory,
            warframe_api::fetch_warframe_index,
            warframe_api::fetch_warframe_manifest,
            warframe_api::fetch_warframe_data,
            warframe_api::fetch_weapon_data,
            warframe_api::fetch_recipe_data,
            warframe_api::fetch_resource_data,
            warframe_api::fetch_companion_data,
            warframe_api::fetch_relic_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
