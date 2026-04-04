use tauri::{AppHandle, State};

use crate::{
    looper::{downsample_layer, start_looper_thread, LooperCmd, LooperStatus},
    state::AppState,
};

// ---------------------------------------------------------------------------
// Serialisable DTOs sent to the frontend
// ---------------------------------------------------------------------------

#[derive(serde::Serialize, Clone)]
pub struct LayerSnapshot {
    pub id: u32,
    pub muted: bool,
    pub duration_ms: u32,
}

#[derive(serde::Serialize, Clone)]
pub struct LooperStateSnapshot {
    pub status: LooperStatus,
    pub layers: Vec<LayerSnapshot>,
    pub loop_duration_ms: u32,
    pub playback_pos_ms: u32,
    pub sample_rate: u32,
}

#[derive(serde::Serialize, Clone)]
pub struct AudioOutputDevice {
    pub id: usize,
    pub name: String,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn build_snapshot(state: &State<'_, AppState>) -> LooperStateSnapshot {
    let engine_guard = state.looper.lock().unwrap();
    match engine_guard.as_ref() {
        None => LooperStateSnapshot {
            status: LooperStatus::Idle,
            layers: vec![],
            loop_duration_ms: 0,
            playback_pos_ms: 0,
            sample_rate: 0,
        },
        Some(engine) => {
            let shared = engine.shared.lock().unwrap();
            let pos_frames = engine.playback_pos.load(std::sync::atomic::Ordering::Relaxed);
            let sr = shared.sample_rate.max(1) as u64;
            let loop_ms = (shared.loop_length_frames as u64 * 1000 / sr) as u32;
            let pos_ms = (pos_frames as u64 * 1000 / sr) as u32;
            let layers = shared
                .layers
                .iter()
                .map(|l| LayerSnapshot {
                    id: l.id,
                    muted: l.muted,
                    duration_ms: loop_ms,
                })
                .collect();
            LooperStateSnapshot {
                status: shared.status.clone(),
                layers,
                loop_duration_ms: loop_ms,
                playback_pos_ms: pos_ms,
                sample_rate: shared.sample_rate,
            }
        }
    }
}

fn send_cmd(state: &State<'_, AppState>, cmd: LooperCmd) -> Result<(), String> {
    let guard = state.looper.lock().unwrap();
    let engine = guard.as_ref().ok_or("Looper is not running")?;
    engine.cmd_tx.send(cmd).map_err(|_| "Looper thread is not responding".to_string())
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Start a new looper session — begins recording the base loop immediately.
#[tauri::command]
pub fn looper_start_record(
    input_device_id: usize,
    output_device_ids: Vec<usize>,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<(), String> {
    // Stop any existing engine. If it has active layers/recording, refuse.
    // If it's idle (all layers deleted), silently replace it.
    {
        let mut guard = state.looper.lock().unwrap();
        if let Some(engine) = guard.as_ref() {
            let is_idle = engine.shared.lock().unwrap().status == LooperStatus::Idle;
            if !is_idle {
                return Err("A looper session is already running. Stop it first.".into());
            }
        }
        // Cleanly stop the idle engine (if any) before starting a fresh one.
        if let Some(mut engine) = guard.take() {
            engine.cmd_tx.send(LooperCmd::StopAll).ok();
            if let Some(handle) = engine.thread_join.take() {
                handle.join().ok();
            }
        }
    }

    let engine = start_looper_thread(input_device_id, output_device_ids, app_handle)?;
    state.looper.lock().unwrap().replace(engine);
    Ok(())
}

/// Stop the base recording and begin looping it.
#[tauri::command]
pub fn looper_stop_and_loop(
    state: State<'_, AppState>,
) -> Result<LooperStateSnapshot, String> {
    send_cmd(&state, LooperCmd::StartLoop)?;
    // Give the thread a moment to process the command before we read the snapshot.
    std::thread::sleep(std::time::Duration::from_millis(20));
    Ok(build_snapshot(&state))
}

/// Start recording an overdub layer on top of the loop.
#[tauri::command]
pub fn looper_start_overdub(state: State<'_, AppState>) -> Result<(), String> {
    send_cmd(&state, LooperCmd::StartOverdub)
}

/// Finish recording the overdub and add it as a new layer.
/// `offset_ms`: shift the layer in time before saving.
///   positive → layer plays later (compensates for early capture / input latency)
///   negative → layer plays earlier (compensates for late capture)
#[tauri::command]
pub fn looper_stop_overdub(
    offset_ms: i32,
    state: State<'_, AppState>,
) -> Result<LooperStateSnapshot, String> {
    send_cmd(&state, LooperCmd::StopOverdub { offset_ms })?;
    std::thread::sleep(std::time::Duration::from_millis(20));
    Ok(build_snapshot(&state))
}

/// Stop everything and tear down the looper.
#[tauri::command]
pub fn looper_stop_all(state: State<'_, AppState>) -> Result<(), String> {
    let engine = {
        let mut guard = state.looper.lock().unwrap();
        guard.take()
    };
    if let Some(mut engine) = engine {
        // Signal the thread; ignore send error (thread may have already exited).
        engine.cmd_tx.send(LooperCmd::StopAll).ok();
        if let Some(handle) = engine.thread_join.take() {
            handle.join().ok();
        }
    }
    Ok(())
}

/// Toggle the mute state of a layer. Handled directly without going through the cmd thread.
#[tauri::command]
pub fn looper_toggle_mute_layer(
    layer_id: u32,
    state: State<'_, AppState>,
) -> Result<LooperStateSnapshot, String> {
    let guard = state.looper.lock().unwrap();
    let engine = guard.as_ref().ok_or("Looper is not running")?;
    let mut shared = engine.shared.lock().unwrap();
    if let Some(layer) = shared.layers.iter_mut().find(|l| l.id == layer_id) {
        layer.muted = !layer.muted;
    }
    drop(shared);
    drop(guard);
    Ok(build_snapshot(&state))
}

/// Delete a layer. If it was the last layer, the looper returns to Idle.
#[tauri::command]
pub fn looper_delete_layer(
    layer_id: u32,
    state: State<'_, AppState>,
) -> Result<LooperStateSnapshot, String> {
    let guard = state.looper.lock().unwrap();
    let engine = guard.as_ref().ok_or("Looper is not running")?;
    let mut shared = engine.shared.lock().unwrap();
    shared.layers.retain(|l| l.id != layer_id);
    if shared.layers.is_empty() {
        shared.loop_length_frames = 0;
        shared.status = LooperStatus::Idle;
        engine.playback_pos.store(0, std::sync::atomic::Ordering::SeqCst);
    }
    drop(shared);
    drop(guard);
    Ok(build_snapshot(&state))
}

/// Read-only state snapshot — called by the frontend polling interval.
#[tauri::command]
pub fn looper_get_state(state: State<'_, AppState>) -> LooperStateSnapshot {
    build_snapshot(&state)
}

/// Return downsampled waveform data for a specific layer (for thumbnail rendering).
#[tauri::command]
pub fn looper_get_layer_waveform(
    layer_id: u32,
    target_points: usize,
    state: State<'_, AppState>,
) -> Result<Vec<f32>, String> {
    let guard = state.looper.lock().unwrap();
    let engine = guard.as_ref().ok_or("Looper is not running")?;
    let shared = engine.shared.lock().unwrap();
    let layer = shared
        .layers
        .iter()
        .find(|l| l.id == layer_id)
        .ok_or_else(|| format!("Layer {} not found", layer_id))?;
    let ch = shared.channels as usize;
    Ok(downsample_layer(&layer.samples, ch, target_points))
}

/// List all audio output devices on the system.
#[tauri::command]
pub fn get_audio_output_devices() -> Result<Vec<AudioOutputDevice>, String> {
    use cpal::traits::{DeviceTrait, HostTrait};
    let host = cpal::default_host();
    let default_name = host.default_output_device().and_then(|d| d.name().ok());

    let _ = default_name;
    host.output_devices()
        .map_err(|e| e.to_string())?
        .enumerate()
        .map(|(i, dev)| {
            let name = dev.name().map_err(|e| e.to_string())?;
            Ok(AudioOutputDevice { id: i, name })
        })
        .collect()
}
