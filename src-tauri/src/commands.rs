use tauri::{AppHandle, Manager, State};

use crate::{
    audio::{self, AudioDevice},
    midi::{self, MidiDevice},
    midi_writer,
    state::{AppState, RecordingStatus},
    wav_writer,
};

#[derive(serde::Serialize)]
pub struct StopResult {
    pub wav_path: String,
    pub has_midi: bool,
    pub duration_ms: u64,
}

#[derive(serde::Serialize)]
pub struct SaveResult {
    pub saved_wav: bool,
    pub saved_midi: bool,
}

#[tauri::command]
pub fn get_audio_devices() -> Result<Vec<AudioDevice>, String> {
    audio::list_audio_input_devices()
}

#[tauri::command]
pub fn get_midi_devices() -> Result<Vec<MidiDevice>, String> {
    midi::list_midi_input_devices()
}

#[tauri::command]
pub fn start_recording(
    audio_device_id: usize,
    midi_device_id: Option<usize>,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let mut session = state.session.lock().unwrap();

    if session.status == RecordingStatus::Recording {
        return Err("Already recording".into());
    }

    let start_time = std::time::Instant::now();

    // Start audio capture
    let audio_handle = audio::start_audio_capture(audio_device_id, app_handle.clone())?;

    // Start MIDI capture (optional)
    let midi_handle = if let Some(midi_id) = midi_device_id {
        Some(midi::start_midi_capture(midi_id, start_time, app_handle)?)
    } else {
        None
    };

    session.audio_handle = Some(audio_handle);
    session.midi_handle = midi_handle;
    session.start_time = Some(start_time);
    session.temp_wav_path = None;
    session.temp_mid_path = None;
    session.status = RecordingStatus::Recording;

    Ok(())
}

#[tauri::command]
pub fn stop_recording(
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<StopResult, String> {
    // Take handles and collect data while holding the lock
    let (samples_arc, sample_rate, channels, midi_events, duration_ms,
         stop_signal, join_handle) = {
        let mut session = state.session.lock().unwrap();

        if session.status != RecordingStatus::Recording {
            return Err("Not currently recording".into());
        }

        let audio_handle = session.audio_handle.take().ok_or("No audio handle")?;
        let sample_rate = audio_handle.sample_rate;
        let channels = audio_handle.channels;
        let stop_signal = audio_handle.stop_signal;
        let join_handle = audio_handle.join_handle;
        let samples_arc = audio_handle.samples;

        let midi_events = if let Some(midi_handle) = session.midi_handle.take() {
            // Drop the connection — this closes the MIDI port
            drop(midi_handle.connection);
            midi_handle.events.lock().unwrap().clone()
        } else {
            vec![]
        };

        let duration_ms = session
            .start_time
            .map(|t| t.elapsed().as_millis() as u64)
            .unwrap_or(0);

        session.status = RecordingStatus::Stopped;

        (samples_arc, sample_rate, channels, midi_events, duration_ms,
         stop_signal, join_handle)
    }; // mutex released here

    // Stop the audio recording thread outside the lock
    stop_signal.send(()).ok();
    join_handle.join().ok();
    let samples = samples_arc.lock().unwrap().clone();

    // File I/O outside the lock
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;

    let wav_path = app_dir.join("temp_recording.wav");
    let mid_path = app_dir.join("temp_recording.mid");

    wav_writer::write_wav(&samples, &wav_path, sample_rate, channels)?;

    let has_midi = !midi_events.is_empty();
    if has_midi {
        midi_writer::write_midi(&midi_events, &mid_path)?;
    }

    // Store paths back in session
    {
        let mut session = state.session.lock().unwrap();
        session.temp_wav_path = Some(wav_path.clone());
        session.temp_mid_path = if has_midi { Some(mid_path) } else { None };
    }

    Ok(StopResult {
        wav_path: wav_path.to_string_lossy().to_string(),
        has_midi,
        duration_ms,
    })
}

#[tauri::command]
pub fn save_recording(
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<SaveResult, String> {
    use tauri_plugin_dialog::DialogExt;

    let (wav_src, mid_src) = {
        let session = state.session.lock().unwrap();
        (session.temp_wav_path.clone(), session.temp_mid_path.clone())
    };

    let wav_src = wav_src.ok_or("No recording available to save")?;

    // Save WAV
    let wav_dest = app_handle
        .dialog()
        .file()
        .add_filter("WAV Audio", &["wav"])
        .set_file_name("recording.wav")
        .blocking_save_file()
        .ok_or("WAV save cancelled")?;

    let wav_dest_path = wav_dest.as_path().ok_or("Invalid WAV destination path")?;
    std::fs::copy(&wav_src, wav_dest_path).map_err(|e| e.to_string())?;

    // Save MIDI if available
    let saved_midi = if let Some(mid_src) = mid_src {
        let mid_dest = app_handle
            .dialog()
            .file()
            .add_filter("MIDI File", &["mid", "midi"])
            .set_file_name("recording.mid")
            .blocking_save_file()
            .ok_or("MIDI save cancelled")?;

        let mid_dest_path = mid_dest.as_path().ok_or("Invalid MIDI destination path")?;
        std::fs::copy(&mid_src, mid_dest_path).map_err(|e| e.to_string())?;
        true
    } else {
        false
    };

    Ok(SaveResult { saved_wav: true, saved_midi })
}

#[tauri::command]
pub fn get_waveform_data(
    target_points: usize,
    state: State<'_, AppState>,
) -> Result<Vec<f32>, String> {
    let wav_path = {
        let session = state.session.lock().unwrap();
        session.temp_wav_path.clone().ok_or("No WAV recording available")?
    };
    wav_writer::read_wav_downsampled(&wav_path, target_points)
}

#[tauri::command]
pub fn get_recording_status(state: State<'_, AppState>) -> RecordingStatus {
    state.session.lock().unwrap().status.clone()
}
