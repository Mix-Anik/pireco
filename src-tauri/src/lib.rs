mod audio;
mod commands;
mod midi;
mod midi_writer;
mod state;
mod wav_writer;

use commands::{
    get_audio_devices, get_midi_devices, get_recording_status, get_waveform_data,
    save_recording, start_recording, stop_recording,
};
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            get_audio_devices,
            get_midi_devices,
            start_recording,
            stop_recording,
            save_recording,
            get_waveform_data,
            get_recording_status,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| eprintln!("[Pireco] fatal: {e}"));
}
