use midir::{MidiInput, MidiInputConnection};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

use crate::state::{MidiEvent, MidiRecordingHandle};

#[derive(serde::Serialize, Clone)]
pub struct MidiDevice {
    pub id: usize,
    pub name: String,
}

#[derive(serde::Serialize, Clone)]
pub struct MidiEventPayload {
    pub note: u8,
    pub velocity: u8,
    pub is_note_on: bool,
    pub timestamp_ms: u64,
}

pub fn list_midi_input_devices() -> Result<Vec<MidiDevice>, String> {
    let midi_in = MidiInput::new("pireco-list").map_err(|e| e.to_string())?;
    let ports = midi_in.ports();
    ports
        .iter()
        .enumerate()
        .map(|(i, port)| {
            let name = midi_in.port_name(port).map_err(|e| e.to_string())?;
            Ok(MidiDevice { id: i, name })
        })
        .collect()
}

pub fn start_midi_capture(
    device_index: usize,
    start_time: std::time::Instant,
    app_handle: AppHandle,
) -> Result<MidiRecordingHandle, String> {
    let midi_in = MidiInput::new("pireco-capture").map_err(|e| e.to_string())?;
    let ports = midi_in.ports();
    let port = ports
        .into_iter()
        .nth(device_index)
        .ok_or_else(|| format!("MIDI port index {} not found", device_index))?;

    let events = Arc::new(Mutex::new(Vec::<MidiEvent>::new()));
    let events_clone = Arc::clone(&events);

    let conn: MidiInputConnection<()> = midi_in
        .connect(
            &port,
            "pireco-input",
            move |_stamp, message, _| {
                if message.is_empty() {
                    return;
                }

                let timestamp_ms = start_time.elapsed().as_millis() as u64;
                let event = MidiEvent {
                    timestamp_ms,
                    message: message.to_vec(),
                };
                events_clone.lock().unwrap().push(event);

                // Emit note on/off events for keyboard visualization
                if message.len() >= 3 {
                    let status = message[0];
                    let note = message[1];
                    let velocity = message[2];
                    let is_note_on_msg = (status & 0xF0) == 0x90;
                    let is_note_off_msg = (status & 0xF0) == 0x80;
                    if is_note_on_msg || is_note_off_msg {
                        let is_note_on = is_note_on_msg && velocity > 0;
                        let _ = app_handle.emit(
                            "midi-event",
                            MidiEventPayload { note, velocity, is_note_on, timestamp_ms },
                        );
                    }
                }
            },
            (),
        )
        .map_err(|e| e.to_string())?;

    Ok(MidiRecordingHandle { connection: conn, events })
}
