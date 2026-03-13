use image::imageops::crop_imm;
use image::{DynamicImage, GrayImage};
use imageproc::contrast::{threshold, ThresholdType};
use kreuzberg_tesseract::TesseractAPI;
use global_hotkey::hotkey::HotKey;
use global_hotkey::{GlobalHotKeyEvent, GlobalHotKeyManager, HotKeyState};
use serde::Serialize;
use std::fs;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{
    AppHandle, Emitter, Manager,
};
use xcap::Window;

const DETECTION_MARKERS: [&str; 3] = [
    "Pause countdown done",
    "Got rewards",
    "Created /Lotus/Interface/ProjectionRewardChoice.swf",
];

const PIXEL_REWARD_WIDTH: f32 = 968.0;
const PIXEL_REWARD_HEIGHT: f32 = 235.0;
const PIXEL_REWARD_YDISPLAY: f32 = 316.0;
const PIXEL_REWARD_LINE_HEIGHT: f32 = 48.0;

#[derive(Debug)]
struct ScannerRuntime {
    ee_log_path: String,
    hotkey_binding: Option<String>,
    stop_flag: Arc<AtomicBool>,
    log_handle: JoinHandle<()>,
    hotkey_handle: Option<JoinHandle<()>>,
}

#[derive(Debug)]
struct RewardExtraction {
    reward_area: DynamicImage,
    reward_boxes: Vec<DynamicImage>,
}

#[derive(Debug)]
struct ScanDebugArtifacts {
    scan_dir: PathBuf,
}

static SCANNER_RUNTIME: Mutex<Option<ScannerRuntime>> = Mutex::new(None);
static SCAN_IN_FLIGHT: AtomicBool = AtomicBool::new(false);

fn normalize_hotkey_binding(hotkey: Option<&str>) -> Option<String> {
    hotkey
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_ascii_uppercase())
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelicScanTriggeredEvent {
    source: String,
    triggered_at: u64,
    reward_candidates: Vec<String>,
    log_markers: Vec<String>,
    error: Option<String>,
}

fn now_ms() -> u64 {
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(duration) => duration.as_millis() as u64,
        Err(_) => 0,
    }
}

fn get_tessdata_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        let dev_tessdata = PathBuf::from(manifest_dir).join("tessdata");
        if dev_tessdata.exists() {
            return Ok(dev_tessdata);
        }
    }

    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        let bundled_tessdata = resource_dir.join("tessdata");
        if bundled_tessdata.exists() {
            return Ok(bundled_tessdata);
        }
    }

    Err("Tessdata directory not found. Expected src-tauri/tessdata with eng.traineddata".to_string())
}

fn preprocess_image(image: &DynamicImage) -> GrayImage {
    let grayscale = image.to_luma8();
    threshold(&grayscale, 128, ThresholdType::Binary)
}

fn resolve_cache_root(_app: &AppHandle) -> Result<PathBuf, String> {
    _app.path()
        .app_cache_dir()
        .map_err(|err| format!("Failed to resolve app cache dir: {err}"))
}

fn create_scan_debug_artifacts(app: &AppHandle, source: &str) -> Result<ScanDebugArtifacts, String> {
    let cache_dir = resolve_cache_root(app)?;
    let root = cache_dir.join("relic-scanner-debug");
    let scan_dir = root.join(format!("{}-{}", now_ms(), source));

    fs::create_dir_all(&scan_dir)
        .map_err(|err| format!("Failed to create debug artifact directory: {err}"))?;

    Ok(ScanDebugArtifacts { scan_dir })
}

fn save_debug_image(
    artifacts: &ScanDebugArtifacts,
    file_name: &str,
    image: &DynamicImage,
) -> Result<(), String> {
    let path = artifacts.scan_dir.join(file_name);
    image
        .save(&path)
        .map_err(|err| format!("Failed to save debug image '{}': {err}", path.display()))
}

fn save_debug_text(
    artifacts: &ScanDebugArtifacts,
    file_name: &str,
    content: &str,
) -> Result<(), String> {
    let path = artifacts.scan_dir.join(file_name);
    fs::write(&path, content)
        .map_err(|err| format!("Failed to save debug text '{}': {err}", path.display()))
}

fn perform_ocr_on_image(
    img: &DynamicImage,
    app_handle: &AppHandle,
) -> Result<(String, DynamicImage), String> {
    let processed = preprocess_image(img);
    let processed_image = DynamicImage::ImageLuma8(processed);
    let tessdata_dir = get_tessdata_dir(app_handle)?;

    let api = TesseractAPI::new();
    api.init(
        tessdata_dir
            .to_str()
            .ok_or_else(|| "Invalid tessdata path".to_string())?,
        "eng",
    )
    .map_err(|err| format!("Failed to initialize Tesseract: {err}"))?;
    api.set_variable("tessedit_pageseg_mode", "6")
        .map_err(|err| format!("Failed to set PSM: {err}"))?;

    let rgb_image = processed_image.to_rgb8();
    let (width, height) = rgb_image.dimensions();
    let image_data = rgb_image.into_raw();

    api.set_image(
        &image_data,
        width as i32,
        height as i32,
        3,
        (3 * width) as i32,
    )
    .map_err(|err| format!("Failed to set OCR image: {err}"))?;

    let text = api
        .get_utf8_text()
        .map_err(|err| format!("Failed to read OCR text: {err}"))?;

    Ok((text, processed_image))
}

fn normalize_ocr_reward_name(text: &str) -> Option<String> {
    let cleaned = text
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || ch.is_ascii_whitespace() { ch } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string();

    if cleaned.is_empty() {
        return None;
    }

    Some(cleaned)
}

fn extract_reward_boxes(frame: &DynamicImage) -> Result<RewardExtraction, String> {
    let width = frame.width() as f32;
    let height = frame.height() as f32;
    if width < 400.0 || height < 300.0 {
        return Err("Captured image is too small for relic reward detection".to_string());
    }

    let screen_scaling = if frame.width() * 9 > frame.height() * 16 {
        frame.height() as f32 / 1080.0
    } else {
        frame.width() as f32 / 1920.0
    };

    let reward_width = PIXEL_REWARD_WIDTH * screen_scaling;
    let reward_left = (width / 2.0 - reward_width / 2.0).max(0.0);
    let reward_top = (height / 2.0
        - ((PIXEL_REWARD_YDISPLAY - PIXEL_REWARD_HEIGHT + PIXEL_REWARD_LINE_HEIGHT)
            * screen_scaling))
        .max(0.0);
    let reward_bottom = (height / 2.0
        - ((PIXEL_REWARD_YDISPLAY - PIXEL_REWARD_HEIGHT) * screen_scaling * 0.5))
        .min(height);

    if reward_bottom <= reward_top {
        return Err("Invalid reward area bounds while extracting relic rewards".to_string());
    }

    let reward_height = reward_bottom - reward_top;
    let reward_area = crop_imm(
        frame,
        reward_left as u32,
        reward_top as u32,
        reward_width as u32,
        reward_height as u32,
    )
    .to_image();

    let reward_area = DynamicImage::ImageRgba8(reward_area);
    let mut boxes = Vec::with_capacity(4);
    let slot_width = reward_area.width() / 4;
    let slot_height = reward_area.height();

    for index in 0..4 {
        let left = index * slot_width;
        // wfinfo-ng crops each slot from the top of the reward box, not from a lower text band.
        let slot = crop_imm(&reward_area, left, 0, slot_width, slot_height).to_image();
        boxes.push(DynamicImage::ImageRgba8(slot));
    }

    Ok(RewardExtraction {
        reward_area,
        reward_boxes: boxes,
    })
}

fn detect_markers(chunk: &str) -> Vec<String> {
    DETECTION_MARKERS
        .iter()
        .filter(|marker| chunk.contains(**marker))
        .map(|marker| (*marker).to_string())
        .collect()
}

fn capture_warframe_rewards(
    app: &AppHandle,
    source: &str,
    log_markers: &[String],
) -> Result<Vec<String>, String> {
    let windows = Window::all().map_err(|err| format!("Failed to list windows: {err}"))?;
    let warframe_window = windows
        .iter()
        .find(|window| {
            match window.title() {
                Ok(title) => title == "Warframe" || title.contains("Warframe"),
                Err(_) => false,
            }
        })
        .ok_or_else(|| "Warframe window not found".to_string())?;

    let frame = warframe_window
        .capture_image()
        .map_err(|err| format!("Failed to capture Warframe window: {err}"))?;
    let image = DynamicImage::ImageRgba8(frame);

    process_reward_image(app, image, source, log_markers)
}

fn process_reward_image(
    app: &AppHandle,
    image: DynamicImage,
    source: &str,
    log_markers: &[String],
) -> Result<Vec<String>, String> {

    let artifacts = create_scan_debug_artifacts(app, source)?;
    save_debug_image(&artifacts, "00_full_window.png", &image)?;

    let marker_text = if log_markers.is_empty() {
        "none".to_string()
    } else {
        log_markers.join(", ")
    };
    save_debug_text(
        &artifacts,
        "scan_context.txt",
        &format!("source={source}\nlog_markers={marker_text}\n"),
    )?;

    let extraction = extract_reward_boxes(&image)?;
    save_debug_image(&artifacts, "01_reward_area.png", &extraction.reward_area)?;

    let mut rewards = Vec::new();

    for (index, reward_box) in extraction.reward_boxes.iter().enumerate() {
        save_debug_image(
            &artifacts,
            &format!("02_slot_{}_raw.png", index + 1),
            reward_box,
        )?;

        let (text, thresholded) = perform_ocr_on_image(reward_box, app)?;
        save_debug_image(
            &artifacts,
            &format!("03_slot_{}_threshold.png", index + 1),
            &thresholded,
        )?;
        save_debug_text(
            &artifacts,
            &format!("04_slot_{}_ocr.txt", index + 1),
            &text,
        )?;

        if let Some(name) = normalize_ocr_reward_name(&text) {
            if !rewards.iter().any(|existing| existing == &name) {
                rewards.push(name);
            }
        }
    }

    Ok(rewards)
}

fn emit_scan_result(
    app: &AppHandle,
    source: &str,
    reward_candidates: Vec<String>,
    log_markers: Vec<String>,
    error: Option<String>,
) {
    let _ = app.emit(
        "relic-scan-triggered",
        RelicScanTriggeredEvent {
            source: source.to_string(),
            triggered_at: now_ms(),
            reward_candidates,
            log_markers,
            error,
        },
    );
}

fn perform_scan(app: &AppHandle, source: &str, log_markers: Vec<String>) {
    if SCAN_IN_FLIGHT.swap(true, Ordering::SeqCst) {
        return;
    }

    match capture_warframe_rewards(app, source, &log_markers) {
        Ok(reward_candidates) => emit_scan_result(app, source, reward_candidates, log_markers, None),
        Err(err) => emit_scan_result(app, source, Vec::new(), log_markers, Some(err)),
    }

    SCAN_IN_FLIGHT.store(false, Ordering::SeqCst);
}

fn spawn_scanner_worker(app: AppHandle, ee_log_path: String, stop_flag: Arc<AtomicBool>) -> JoinHandle<()> {
    thread::spawn(move || {
        let mut file = match File::open(&ee_log_path) {
            Ok(file) => file,
            Err(err) => {
                emit_scan_result(
                    &app,
                    "log",
                    Vec::new(),
                    Vec::new(),
                    Some(format!("Failed to open EE.log: {err}")),
                );
                return;
            }
        };

        let mut offset = file.seek(SeekFrom::End(0)).unwrap_or(0);
        let mut last_trigger = Instant::now() - Duration::from_secs(3);

        while !stop_flag.load(Ordering::Relaxed) {
            thread::sleep(Duration::from_millis(350));

            let metadata = match file.metadata() {
                Ok(metadata) => metadata,
                Err(_) => continue,
            };

            let file_len = metadata.len();
            if file_len < offset {
                offset = 0;
            }

            if file_len == offset {
                continue;
            }

            if file.seek(SeekFrom::Start(offset)).is_err() {
                continue;
            }

            let mut chunk = String::new();
            if file.read_to_string(&mut chunk).is_err() {
                continue;
            }

            offset = file_len;

            if chunk.is_empty() {
                continue;
            }

            let markers = detect_markers(&chunk);
            if markers.is_empty() {
                continue;
            }

            if last_trigger.elapsed() < Duration::from_millis(1500) {
                continue;
            }
            last_trigger = Instant::now();

            // Wait for reward cards animation to settle before OCR capture.
            thread::sleep(Duration::from_millis(1500));
            perform_scan(&app, "log", markers);
        }
    })
}

fn spawn_hotkey_worker(
    app: AppHandle,
    hotkey: HotKey,
    stop_flag: Arc<AtomicBool>,
) -> JoinHandle<()> {
    thread::spawn(move || {
        let manager = match GlobalHotKeyManager::new() {
            Ok(manager) => manager,
            Err(err) => {
                let message = format!("Failed to initialize global hotkey manager: {err}");
                let _ = app.emit("relic-scanner-error", message.clone());
                eprintln!("{message}");
                return;
            }
        };

        if let Err(err) = manager.register(hotkey) {
            let message = format!("Failed to register global hotkey: {err}");
            let _ = app.emit("relic-scanner-error", message.clone());
            eprintln!("{message}");
            return;
        }

        // Drop stale key events that may have been queued before registration.
        while GlobalHotKeyEvent::receiver().try_recv().is_ok() {}
        let hotkey_ready_at = Instant::now() + Duration::from_millis(500);

        while !stop_flag.load(Ordering::Relaxed) {
            match GlobalHotKeyEvent::receiver().try_recv() {
                Ok(event) => {
                    if event.state == HotKeyState::Pressed && Instant::now() >= hotkey_ready_at {
                        perform_scan(&app, "hotkey", Vec::new());
                    }
                }
                Err(_) => {
                    thread::sleep(Duration::from_millis(35));
                }
            }
        }

        let _ = manager.unregister(hotkey);
    })
}

#[tauri::command]
pub fn start_relic_scanner(
    app: AppHandle,
    ee_log_path: String,
    hotkey: Option<String>,
) -> Result<(), String> {
    let normalized_ee_log_path = ee_log_path.trim().to_string();
    if normalized_ee_log_path.is_empty() {
        return Err("EE.log path is empty".to_string());
    }

    let normalized_hotkey = normalize_hotkey_binding(hotkey.as_deref());

    {
        let runtime = SCANNER_RUNTIME
            .lock()
            .map_err(|_| "Failed to acquire scanner state lock".to_string())?;

        if let Some(current) = runtime.as_ref() {
            if current.ee_log_path == normalized_ee_log_path
                && current.hotkey_binding == normalized_hotkey
            {
                return Ok(());
            }
        }
    }

    stop_relic_scanner_internal()?;

    let stop_flag = Arc::new(AtomicBool::new(false));
    let log_handle = spawn_scanner_worker(
        app.clone(),
        normalized_ee_log_path.clone(),
        Arc::clone(&stop_flag),
    );
    let hotkey_handle = if let Some(raw_hotkey) = hotkey.as_deref() {
        let trimmed = raw_hotkey.trim();
        if trimmed.is_empty() {
            None
        } else {
            let parsed_hotkey = HotKey::from_str(trimmed)
                .map_err(|err| format!("Invalid global hotkey '{trimmed}': {err}"))?;
            Some(spawn_hotkey_worker(
                app,
                parsed_hotkey,
                Arc::clone(&stop_flag),
            ))
        }
    } else {
        None
    };

    let mut runtime = SCANNER_RUNTIME
        .lock()
        .map_err(|_| "Failed to acquire scanner state lock".to_string())?;
    *runtime = Some(ScannerRuntime {
        ee_log_path: normalized_ee_log_path,
        hotkey_binding: normalized_hotkey,
        stop_flag,
        log_handle,
        hotkey_handle,
    });

    Ok(())
}

fn stop_relic_scanner_internal() -> Result<(), String> {
    let mut state = SCANNER_RUNTIME
        .lock()
        .map_err(|_| "Failed to acquire scanner state lock".to_string())?;

    if let Some(runtime) = state.take() {
        runtime.stop_flag.store(true, Ordering::Relaxed);
        let _ = runtime.log_handle.join();
        if let Some(hotkey_handle) = runtime.hotkey_handle {
            let _ = hotkey_handle.join();
        }
    }

    Ok(())
}

#[tauri::command]
pub fn stop_relic_scanner() -> Result<(), String> {
    stop_relic_scanner_internal()
}

#[tauri::command]
pub fn trigger_relic_scan(app: AppHandle, source: Option<String>) -> Result<(), String> {
    let trigger_source = source.unwrap_or_else(|| "manual".to_string());

    perform_scan(&app, &trigger_source, Vec::new());

    Ok(())
}

#[tauri::command]
pub fn trigger_relic_scan_from_image(
    app: AppHandle,
    image_path: String,
    source: Option<String>,
) -> Result<(), String> {
    if SCAN_IN_FLIGHT.swap(true, Ordering::SeqCst) {
        return Ok(());
    }

    let result = (|| {
        if image_path.trim().is_empty() {
            return Err("Image path is empty".to_string());
        }

        let trigger_source = source.unwrap_or_else(|| "image-test".to_string());
        let image = image::open(&image_path)
            .map_err(|err| format!("Failed to read image '{}': {err}", image_path))?;

        match process_reward_image(&app, image, &trigger_source, &[]) {
            Ok(reward_candidates) => {
                emit_scan_result(&app, &trigger_source, reward_candidates, Vec::new(), None);
                Ok(())
            }
            Err(err) => {
                emit_scan_result(&app, &trigger_source, Vec::new(), Vec::new(), Some(err.clone()));
                Err(err)
            }
        }
    })();

    SCAN_IN_FLIGHT.store(false, Ordering::SeqCst);
    result
}

#[tauri::command]
pub fn set_relic_overlay_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    let label = "relic-overlay";
    let window = app
        .get_webview_window(label)
        .ok_or_else(|| format!("Overlay window '{label}' is not configured"))?;

    if enabled {
        window
            .set_ignore_cursor_events(true)
            .map_err(|err| format!("Failed to set overlay click-through: {err}"))?;

        window
            .show()
            .map_err(|err| format!("Failed to show overlay: {err}"))?;

        return Ok(());
    }

    window
        .hide()
        .map_err(|err| format!("Failed to hide overlay: {err}"))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{detect_markers, normalize_ocr_reward_name};

    #[test]
    fn detects_reward_markers() {
        let chunk = "foo Got rewards bar";
        let markers = detect_markers(chunk);
        assert!(markers.iter().any(|marker| marker == "Got rewards"));
    }

    #[test]
    fn normalizes_ocr_reward_text() {
        let normalized = normalize_ocr_reward_name("  Mesa@@ Prime    Chassis!!! ");
        assert_eq!(normalized.as_deref(), Some("Mesa Prime Chassis"));
    }
}
