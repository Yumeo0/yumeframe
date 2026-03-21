use global_hotkey::hotkey::HotKey;
use global_hotkey::{GlobalHotKeyEvent, GlobalHotKeyManager, HotKeyState};
use image::imageops::crop_imm;
use image::{DynamicImage, GrayImage};
use imageproc::contrast::{threshold, ThresholdType};
use kreuzberg_tesseract::TesseractAPI;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Position, Size};
use xcap::Window;

const AUTO_DELAY_MODE_FIXED: &str = "fixed";
const AUTO_DELAY_MODE_ADAPTIVE: &str = "adaptive";

#[derive(Clone, Copy, Debug)]
struct TriggerMarkerDef {
    text: &'static str,
    source: &'static str,
    priority: u8,
}

const TRIGGER_MARKERS: [TriggerMarkerDef; 5] = [
    TriggerMarkerDef {
        text: "ProjectionsCountdown",
        source: "auto-early",
        priority: 10,
    },
    TriggerMarkerDef {
        text: "Pause countdown done",
        source: "auto-early",
        priority: 20,
    },
    TriggerMarkerDef {
        text: "Client has reward info for all players now",
        source: "auto-early",
        priority: 30,
    },
    TriggerMarkerDef {
        text: "Got rewards",
        source: "auto-late",
        priority: 40,
    },
    TriggerMarkerDef {
        text: "Relic timer closed",
        source: "auto-late",
        priority: 50,
    },
];

const PIXEL_REWARD_WIDTH: f32 = 968.0;
const PIXEL_REWARD_HEIGHT: f32 = 235.0;
const PIXEL_REWARD_YDISPLAY: f32 = 316.0;
const PIXEL_REWARD_LINE_HEIGHT: f32 = 48.0;

#[derive(Debug)]
struct ScannerRuntime {
    ee_log_path: String,
    hotkey_binding: Option<String>,
    scanner_config: RelicScannerConfig,
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

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RelicScannerConfig {
    auto_delay_mode: String,
    auto_fixed_delay_ms: u64,
    auto_adaptive_interval_ms: u64,
    auto_adaptive_timeout_ms: u64,
    auto_debounce_ms: u64,
}

impl Default for RelicScannerConfig {
    fn default() -> Self {
        Self {
            auto_delay_mode: AUTO_DELAY_MODE_FIXED.to_string(),
            auto_fixed_delay_ms: 1500,
            auto_adaptive_interval_ms: 250,
            auto_adaptive_timeout_ms: 2500,
            auto_debounce_ms: 1500,
        }
    }
}

impl RelicScannerConfig {
    fn normalized(self) -> Self {
        let mode = match self.auto_delay_mode.as_str() {
            AUTO_DELAY_MODE_ADAPTIVE => AUTO_DELAY_MODE_ADAPTIVE,
            _ => AUTO_DELAY_MODE_FIXED,
        }
        .to_string();

        let fixed_delay = self.auto_fixed_delay_ms.clamp(0, 10_000);
        let adaptive_interval = self.auto_adaptive_interval_ms.clamp(50, 2_000);
        let adaptive_timeout = self.auto_adaptive_timeout_ms.clamp(300, 15_000);
        let debounce = self.auto_debounce_ms.clamp(100, 5_000);

        Self {
            auto_delay_mode: mode,
            auto_fixed_delay_ms: fixed_delay,
            auto_adaptive_interval_ms: adaptive_interval,
            auto_adaptive_timeout_ms: adaptive_timeout,
            auto_debounce_ms: debounce,
        }
    }
}

fn normalize_hotkey_binding(hotkey: Option<&str>) -> Option<String> {
    hotkey
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_ascii_uppercase())
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelicScanSlotResult {
    slot_index: u8,
    display_index: Option<u8>,
    reward_candidate: Option<String>,
    raw_text: String,
    is_valid: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelicScanTriggeredEvent {
    source: String,
    triggered_at: u64,
    reward_candidates: Option<Vec<String>>,
    slot_results: Option<Vec<RelicScanSlotResult>>,
    detected_slot_count: Option<u8>,
    log_markers: Vec<String>,
    auto_delay_mode: Option<String>,
    auto_delay_ms: Option<u64>,
    trigger_detail: Option<String>,
    error: Option<String>,
}

#[derive(Clone, Debug)]
struct ScanOutput {
    reward_candidates: Vec<String>,
    slot_results: Vec<RelicScanSlotResult>,
    detected_slot_count: u8,
}

#[derive(Clone, Debug)]
struct DetectedTrigger {
    marker_text: &'static str,
    source: &'static str,
    priority: u8,
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

    Err(
        "Tessdata directory not found. Expected src-tauri/tessdata with eng.traineddata"
            .to_string(),
    )
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

fn create_scan_debug_artifacts(
    app: &AppHandle,
    source: &str,
) -> Result<ScanDebugArtifacts, String> {
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
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch.is_ascii_whitespace() {
                ch
            } else {
                ' '
            }
        })
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

fn is_valid_reward_candidate(candidate: &str) -> bool {
    let compact_len = candidate.chars().filter(|ch| !ch.is_whitespace()).count();
    let alpha_len = candidate.chars().filter(|ch| ch.is_ascii_alphabetic()).count();
    compact_len >= 6 && alpha_len >= 3
}

fn projection_ids_from_chunk(chunk: &str) -> Vec<String> {
    let mut ids = Vec::new();

    for line in chunk.lines() {
        if !line.contains("VoidProjections:") {
            continue;
        }

        for token in line.split(|ch: char| !ch.is_ascii_hexdigit()) {
            if token.len() == 24 && token.chars().all(|ch| ch.is_ascii_hexdigit()) {
                ids.push(token.to_ascii_lowercase());
            }
        }
    }

    ids
}

fn estimate_player_count(participant_seen_at: &HashMap<String, Instant>) -> Option<usize> {
    let count = participant_seen_at
        .values()
        .filter(|observed_at| observed_at.elapsed() <= Duration::from_secs(45))
        .count();

    if count == 0 {
        None
    } else {
        Some(count.min(4))
    }
}

fn estimate_player_count_from_log_snippet(snippet: &str) -> Option<usize> {
    let unique_ids = projection_ids_from_chunk(snippet)
        .into_iter()
        .collect::<HashSet<_>>();

    if unique_ids.is_empty() {
        None
    } else {
        Some(unique_ids.len().min(4))
    }
}

fn layout_units_for_slot_count(slot_count: usize) -> &'static [u32] {
    match slot_count {
        1 => &[4],
        2 => &[3, 5],
        3 => &[2, 4, 6],
        _ => &[1, 3, 5, 7],
    }
}

fn build_reward_boxes_for_layout(reward_area: &DynamicImage, slot_count: usize) -> Vec<DynamicImage> {
    let slot_height = reward_area.height();
    let slot_width = (reward_area.width() / 4).max(1);
    let max_left = reward_area.width().saturating_sub(slot_width);

    layout_units_for_slot_count(slot_count)
        .iter()
        .map(|unit| {
            let center_x = reward_area.width() as f32 * (*unit as f32 / 8.0);
            let left = (center_x - slot_width as f32 / 2.0)
                .round()
                .clamp(0.0, max_left as f32) as u32;
            let slot = crop_imm(reward_area, left, 0, slot_width, slot_height).to_image();
            DynamicImage::ImageRgba8(slot)
        })
        .collect()
}

fn extract_reward_boxes(
    frame: &DynamicImage,
    preferred_slot_count: Option<usize>,
) -> Result<RewardExtraction, String> {
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
    let slot_count = preferred_slot_count
        .filter(|count| (1..=4).contains(count))
        .unwrap_or(4);
    let reward_boxes = build_reward_boxes_for_layout(&reward_area, slot_count);

    Ok(RewardExtraction {
        reward_area,
        reward_boxes,
    })
}

fn detect_triggers(chunk: &str) -> Vec<DetectedTrigger> {
    let mut triggers = Vec::new();

    for line in chunk.lines() {
        for marker in TRIGGER_MARKERS {
            if line.contains(marker.text) {
                triggers.push(DetectedTrigger {
                    marker_text: marker.text,
                    source: marker.source,
                    priority: marker.priority,
                });
            }
        }
    }

    triggers
}

fn pick_trigger(triggers: &[DetectedTrigger]) -> Option<DetectedTrigger> {
    triggers
        .iter()
        .min_by_key(|trigger| trigger.priority)
        .cloned()
}

fn find_warframe_window() -> Result<Window, String> {
    let windows = Window::all().map_err(|err| format!("Failed to list windows: {err}"))?;
    windows
        .iter()
        .find(|window| match window.title() {
            Ok(title) => title == "Warframe" || title.contains("Warframe"),
            Err(_) => false,
        })
        .cloned()
        .ok_or_else(|| "Warframe window not found".to_string())
}

fn align_overlay_to_warframe_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    let warframe_window = find_warframe_window()?;
    let x = warframe_window
        .x()
        .map_err(|err| format!("Failed to read Warframe window x: {err}"))?;
    let y = warframe_window
        .y()
        .map_err(|err| format!("Failed to read Warframe window y: {err}"))?;
    let width = warframe_window
        .width()
        .map_err(|err| format!("Failed to read Warframe window width: {err}"))?;
    let height = warframe_window
        .height()
        .map_err(|err| format!("Failed to read Warframe window height: {err}"))?;

    window
        .set_fullscreen(false)
        .map_err(|err| format!("Failed to disable overlay fullscreen mode: {err}"))?;
    window
        .set_position(Position::Physical(PhysicalPosition::new(x, y)))
        .map_err(|err| format!("Failed to position overlay window: {err}"))?;
    window
        .set_size(Size::Physical(PhysicalSize::new(width, height)))
        .map_err(|err| format!("Failed to resize overlay window: {err}"))?;

    Ok(())
}

fn capture_warframe_rewards(
    app: &AppHandle,
    source: &str,
    log_markers: &[String],
    preferred_slot_count: Option<usize>,
) -> Result<ScanOutput, String> {
    let warframe_window = find_warframe_window()?;

    let frame = warframe_window
        .capture_image()
        .map_err(|err| format!("Failed to capture Warframe window: {err}"))?;
    let image = DynamicImage::ImageRgba8(frame);

    process_reward_image(app, image, source, log_markers, preferred_slot_count)
}

fn process_reward_image(
    app: &AppHandle,
    image: DynamicImage,
    source: &str,
    log_markers: &[String],
    preferred_slot_count: Option<usize>,
) -> Result<ScanOutput, String> {
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
        &format!(
            "source={source}\nlog_markers={marker_text}\npreferred_slot_count={}\n",
            preferred_slot_count
                .map(|count| count.to_string())
                .unwrap_or_else(|| "none".to_string())
        ),
    )?;

    let extraction = extract_reward_boxes(&image, preferred_slot_count)?;
    save_debug_image(&artifacts, "01_reward_area.png", &extraction.reward_area)?;
    let selected_slot_count = extraction.reward_boxes.len();
    let mut slot_candidates: Vec<Option<String>> = Vec::new();
    let mut slot_raw_text: Vec<String> = Vec::new();

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
        save_debug_text(&artifacts, &format!("04_slot_{}_ocr.txt", index + 1), &text)?;

        slot_raw_text.push(text.clone());

        let normalized =
            normalize_ocr_reward_name(&text).filter(|candidate| is_valid_reward_candidate(candidate));
        slot_candidates.push(normalized);
    }

    save_debug_text(
        &artifacts,
        "layout_selection.txt",
        &format!(
            "selected_layout={}\npreferred_slot_count={}\n",
            selected_slot_count,
            preferred_slot_count
                .map(|count| count.to_string())
                .unwrap_or_else(|| "none".to_string())
        ),
    )?;

    let valid_slot_indices: Vec<usize> = slot_candidates
        .iter()
        .enumerate()
        .filter_map(|(slot_index, reward)| reward.as_ref().map(|_| slot_index))
        .collect();

    let mut rewards = Vec::new();
    for candidate in slot_candidates.iter().filter_map(|candidate| candidate.as_ref()) {
        if !rewards.iter().any(|existing| existing == candidate) {
            rewards.push(candidate.clone());
        }
    }

    let mut display_index_by_slot: HashMap<usize, u8> = HashMap::new();
    if valid_slot_indices.len() == 4 {
        for slot_index in &valid_slot_indices {
            display_index_by_slot.insert(*slot_index, (*slot_index + 1) as u8);
        }
    } else {
        for (order, slot_index) in valid_slot_indices.iter().enumerate() {
            display_index_by_slot.insert(*slot_index, (order + 1) as u8);
        }
    }

    let slot_results = slot_candidates
        .into_iter()
        .enumerate()
        .map(|(slot_index, reward_candidate)| RelicScanSlotResult {
            slot_index: (slot_index + 1) as u8,
            display_index: display_index_by_slot.get(&slot_index).copied(),
            is_valid: reward_candidate.is_some(),
            reward_candidate,
            raw_text: slot_raw_text
                .get(slot_index)
                .cloned()
                .unwrap_or_else(String::new),
        })
        .collect::<Vec<_>>();

    Ok(ScanOutput {
        reward_candidates: rewards,
        slot_results,
        detected_slot_count: valid_slot_indices.len() as u8,
    })
}

fn emit_scan_result(
    app: &AppHandle,
    source: &str,
    output: Option<ScanOutput>,
    log_markers: Vec<String>,
    auto_delay_mode: Option<String>,
    auto_delay_ms: Option<u64>,
    trigger_detail: Option<String>,
    error: Option<String>,
) {
    let reward_candidates = output.as_ref().map(|value| value.reward_candidates.clone());
    let slot_results = output.as_ref().map(|value| value.slot_results.clone());
    let detected_slot_count = output.as_ref().map(|value| value.detected_slot_count);
    let normalized_error = if error.is_none()
        && reward_candidates
            .as_ref()
            .is_some_and(|candidates| candidates.is_empty())
    {
        Some("No rewards detected in scan result".to_string())
    } else {
        error
    };

    let _ = app.emit(
        "relic-scan-triggered",
        RelicScanTriggeredEvent {
            source: source.to_string(),
            triggered_at: now_ms(),
            reward_candidates,
            slot_results,
            detected_slot_count,
            log_markers,
            auto_delay_mode,
            auto_delay_ms,
            trigger_detail,
            error: normalized_error,
        },
    );
}

fn perform_scan(app: &AppHandle, source: &str, log_markers: Vec<String>) {
    if SCAN_IN_FLIGHT.swap(true, Ordering::SeqCst) {
        return;
    }

    match capture_warframe_rewards(app, source, &log_markers, None) {
        Ok(output) => emit_scan_result(app, source, Some(output), log_markers, None, None, None, None),
        Err(err) => emit_scan_result(app, source, None, log_markers, None, None, None, Some(err)),
    }

    SCAN_IN_FLIGHT.store(false, Ordering::SeqCst);
}

fn perform_auto_scan(
    app: &AppHandle,
    source: &str,
    log_markers: Vec<String>,
    preferred_slot_count: Option<usize>,
    config: RelicScannerConfig,
    trigger_detail: String,
) {
    if SCAN_IN_FLIGHT.swap(true, Ordering::SeqCst) {
        return;
    }

    let delay_mode = config.auto_delay_mode.clone();

    let (output, error, waited_ms) = if delay_mode == AUTO_DELAY_MODE_ADAPTIVE {
        let started_at = Instant::now();
        let mut latest_output: Option<ScanOutput> = None;
        let mut latest_error: Option<String>;

        loop {
            match capture_warframe_rewards(app, source, &log_markers, preferred_slot_count) {
                Ok(result) => {
                    let has_data = !result.reward_candidates.is_empty();
                    latest_output = Some(result);
                    latest_error = None;
                    if has_data {
                        break;
                    }
                }
                Err(err) => {
                    latest_error = Some(err);
                }
            }

            if started_at.elapsed() >= Duration::from_millis(config.auto_adaptive_timeout_ms) {
                break;
            }

            thread::sleep(Duration::from_millis(config.auto_adaptive_interval_ms));
        }

        (
            latest_output,
            latest_error,
            started_at.elapsed().as_millis() as u64,
        )
    } else {
        thread::sleep(Duration::from_millis(config.auto_fixed_delay_ms));
        match capture_warframe_rewards(app, source, &log_markers, preferred_slot_count) {
            Ok(result) => (Some(result), None, config.auto_fixed_delay_ms),
            Err(err) => (None, Some(err), config.auto_fixed_delay_ms),
        }
    };

    emit_scan_result(
        app,
        source,
        output,
        log_markers,
        Some(delay_mode),
        Some(waited_ms),
        Some(trigger_detail),
        error,
    );

    SCAN_IN_FLIGHT.store(false, Ordering::SeqCst);
}

fn spawn_scanner_worker(
    app: AppHandle,
    ee_log_path: String,
    scanner_config: RelicScannerConfig,
    stop_flag: Arc<AtomicBool>,
) -> JoinHandle<()> {
    thread::spawn(move || {
        let mut file = match File::open(&ee_log_path) {
            Ok(file) => file,
            Err(err) => {
                emit_scan_result(
                    &app,
                    "auto-late",
                    None,
                    Vec::new(),
                    None,
                    None,
                    None,
                    Some(format!("Failed to open EE.log: {err}")),
                );
                return;
            }
        };

        let mut offset = file.seek(SeekFrom::End(0)).unwrap_or(0);
        let mut marker_last_triggered: HashMap<&'static str, Instant> = HashMap::new();
        let mut last_auto_trigger = Instant::now() - Duration::from_secs(3);
        let mut participant_seen_at: HashMap<String, Instant> = HashMap::new();

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

            let observed_at = Instant::now();
            for participant_id in projection_ids_from_chunk(&chunk) {
                participant_seen_at.insert(participant_id, observed_at);
            }
            participant_seen_at.retain(|_, seen_at| seen_at.elapsed() <= Duration::from_secs(45));

            let triggers = detect_triggers(&chunk);
            let Some(trigger) = pick_trigger(&triggers) else {
                continue;
            };

            if last_auto_trigger.elapsed()
                < Duration::from_millis(scanner_config.auto_debounce_ms)
            {
                continue;
            }

            let should_skip_marker = marker_last_triggered
                .get(trigger.marker_text)
                .map(|instant| {
                    instant.elapsed() < Duration::from_millis(scanner_config.auto_debounce_ms)
                })
                .unwrap_or(false);
            if should_skip_marker {
                continue;
            }

            let triggered_at = Instant::now();
            marker_last_triggered.insert(trigger.marker_text, triggered_at);
            last_auto_trigger = triggered_at;

            let markers = vec![trigger.marker_text.to_string()];
            let expected_slot_count = estimate_player_count(&participant_seen_at);
            let trigger_detail = match expected_slot_count {
                Some(count) => format!("{} (expected_slots={count})", trigger.marker_text),
                None => trigger.marker_text.to_string(),
            };
            perform_auto_scan(
                &app,
                trigger.source,
                markers,
                expected_slot_count,
                scanner_config.clone(),
                trigger_detail,
            );
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
    scanner_config: Option<RelicScannerConfig>,
) -> Result<(), String> {
    let normalized_ee_log_path = ee_log_path.trim().to_string();
    if normalized_ee_log_path.is_empty() {
        return Err("EE.log path is empty".to_string());
    }

    let normalized_hotkey = normalize_hotkey_binding(hotkey.as_deref());
    let normalized_scanner_config = scanner_config.unwrap_or_default().normalized();

    {
        let runtime = SCANNER_RUNTIME
            .lock()
            .map_err(|_| "Failed to acquire scanner state lock".to_string())?;

        if let Some(current) = runtime.as_ref() {
            if current.ee_log_path == normalized_ee_log_path
                && current.hotkey_binding == normalized_hotkey
                && current.scanner_config == normalized_scanner_config
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
        normalized_scanner_config.clone(),
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
        scanner_config: normalized_scanner_config,
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
    simulated_log_snippet: Option<String>,
    forced_player_count_hint: Option<u8>,
) -> Result<(), String> {
    if SCAN_IN_FLIGHT.swap(true, Ordering::SeqCst) {
        return Ok(());
    }

    let result = (|| {
        if image_path.trim().is_empty() {
            return Err("Image path is empty".to_string());
        }

        let trigger_source = source.unwrap_or_else(|| "image-test".to_string());
        let snippet_hint = simulated_log_snippet
            .as_deref()
            .and_then(|snippet| estimate_player_count_from_log_snippet(snippet));
        let forced_hint = forced_player_count_hint
            .map(|value| value as usize)
            .filter(|value| (1..=4).contains(value));
        let preferred_slot_count = forced_hint.or(snippet_hint);
        let image = image::open(&image_path)
            .map_err(|err| format!("Failed to read image '{}': {err}", image_path))?;

        match process_reward_image(&app, image, &trigger_source, &[], preferred_slot_count) {
            Ok(reward_candidates) => {
                emit_scan_result(
                    &app,
                    &trigger_source,
                    Some(reward_candidates),
                    Vec::new(),
                    None,
                    None,
                    None,
                    None,
                );
                Ok(())
            }
            Err(err) => {
                emit_scan_result(
                    &app,
                    &trigger_source,
                    None,
                    Vec::new(),
                    None,
                    None,
                    None,
                    Some(err.clone()),
                );
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
        if let Err(err) = align_overlay_to_warframe_window(&window) {
            eprintln!("Failed to align overlay to Warframe window: {err}");
        }

        window
            .show()
            .map_err(|err| format!("Failed to show overlay: {err}"))?;

        window
            .set_ignore_cursor_events(true)
            .map_err(|err| format!("Failed to set overlay click-through: {err}"))?;

        return Ok(());
    }

    window
        .hide()
        .map_err(|err| format!("Failed to hide overlay: {err}"))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{detect_triggers, normalize_ocr_reward_name, pick_trigger};

    #[test]
    fn detects_reward_triggers() {
        let chunk = "foo Got rewards bar";
        let triggers = detect_triggers(chunk);
        let trigger = pick_trigger(&triggers).expect("expected trigger");
        assert_eq!(trigger.marker_text, "Got rewards");
        assert_eq!(trigger.source, "auto-late");
    }

    #[test]
    fn prefers_early_trigger_priority() {
        let chunk = "line A: Got rewards\nline B: Pause countdown done";
        let triggers = detect_triggers(chunk);
        let trigger = pick_trigger(&triggers).expect("expected trigger");
        assert_eq!(trigger.marker_text, "Pause countdown done");
        assert_eq!(trigger.source, "auto-early");
    }

    #[test]
    fn normalizes_ocr_reward_text() {
        let normalized = normalize_ocr_reward_name("  Mesa@@ Prime    Chassis!!! ");
        assert_eq!(normalized.as_deref(), Some("Mesa Prime Chassis"));
    }
}
