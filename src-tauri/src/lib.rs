mod audio;
mod commands;
mod looper;
mod looper_commands;
mod midi;
mod midi_writer;
mod state;
mod wav_writer;

use commands::{
    get_audio_devices, get_midi_devices, get_recording_status, get_waveform_data,
    save_recording, start_recording, stop_recording,
};
use looper_commands::{
    get_audio_output_devices, looper_delete_layer, looper_get_layer_waveform, looper_get_state,
    looper_pause, looper_resume, looper_start_overdub, looper_start_record, looper_stop_all,
    looper_stop_and_loop, looper_stop_overdub, looper_toggle_mute_layer,
};
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            // Recorder
            get_audio_devices,
            get_midi_devices,
            start_recording,
            stop_recording,
            save_recording,
            get_waveform_data,
            get_recording_status,
            // Looper
            looper_start_record,
            looper_stop_and_loop,
            looper_start_overdub,
            looper_stop_overdub,
            looper_stop_all,
            looper_toggle_mute_layer,
            looper_delete_layer,
            looper_get_state,
            looper_get_layer_waveform,
            looper_pause,
            looper_resume,
            get_audio_output_devices,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| eprintln!("[Pireco] fatal: {e}"));
}
