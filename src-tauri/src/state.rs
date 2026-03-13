use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub enum RecordingStatus {
    Idle,
    Recording,
    Stopped,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MidiEvent {
    pub timestamp_ms: u64,
    pub message: Vec<u8>,
}

/// The cpal::Stream is not Send in cpal 0.15.x.
/// We keep it on a dedicated thread and communicate via channels.
pub struct AudioRecordingHandle {
    /// Send () to tell the recording thread to stop and drop the stream.
    pub stop_signal: std::sync::mpsc::SyncSender<()>,
    /// Join the thread after signalling stop.
    pub join_handle: std::thread::JoinHandle<()>,
    pub samples: Arc<Mutex<Vec<i16>>>,
    pub sample_rate: u32,
    pub channels: u16,
}

/// MidiInputConnection<()> is Send, so we can store it directly.
pub struct MidiRecordingHandle {
    pub connection: midir::MidiInputConnection<()>,
    pub events: Arc<Mutex<Vec<MidiEvent>>>,
}

pub struct RecordingSession {
    pub status: RecordingStatus,
    pub audio_handle: Option<AudioRecordingHandle>,
    pub midi_handle: Option<MidiRecordingHandle>,
    pub start_time: Option<std::time::Instant>,
    pub temp_wav_path: Option<std::path::PathBuf>,
    pub temp_mid_path: Option<std::path::PathBuf>,
}

impl RecordingSession {
    pub fn new() -> Self {
        RecordingSession {
            status: RecordingStatus::Idle,
            audio_handle: None,
            midi_handle: None,
            start_time: None,
            temp_wav_path: None,
            temp_mid_path: None,
        }
    }
}

pub struct AppState {
    pub session: Mutex<RecordingSession>,
}

impl AppState {
    pub fn new() -> Self {
        AppState {
            session: Mutex::new(RecordingSession::new()),
        }
    }
}
