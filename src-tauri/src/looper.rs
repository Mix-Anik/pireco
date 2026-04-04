use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Arc, Mutex,
};
use tauri::{AppHandle, Emitter};

// ---------------------------------------------------------------------------
// Public data types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub enum LooperStatus {
    Idle,
    RecordingBase,
    /// Overdub requested; spinning until the next loop boundary.
    WaitingForOverdub,
    Looping,
    Paused,
    Overdubbing,
}

pub struct LoopLayer {
    pub id: u32,
    /// Interleaved f32 samples; length == loop_length_frames * channels.
    pub samples: Vec<f32>,
    pub muted: bool,
}

/// Single source of truth for all looper state.
/// Shared between the looper thread (cmd loop + audio callbacks) and Tauri command handlers.
/// Audio callbacks use `try_lock` — a failed lock produces one silent frame at worst.
pub struct LooperShared {
    pub layers: Vec<LoopLayer>,
    /// Set once when the base loop is finalised; immutable afterwards.
    pub loop_length_frames: usize,
    pub sample_rate: u32,
    pub channels: u16,
    pub next_layer_id: u32,
    /// Accumulates raw f32 samples during RecordingBase / Overdubbing.
    pub recording_buf: Vec<f32>,
    pub status: LooperStatus,
    // Hooks for future session recording — zero cost until enabled.
    #[allow(dead_code)]
    pub session_recording_buf: Vec<f32>,
    #[allow(dead_code)]
    pub is_session_recording: bool,
}

impl LooperShared {
    fn new() -> Self {
        LooperShared {
            layers: Vec::new(),
            loop_length_frames: 0,
            sample_rate: 0,
            channels: 0,
            next_layer_id: 0,
            recording_buf: Vec::new(),
            status: LooperStatus::RecordingBase,
            session_recording_buf: Vec::new(),
            is_session_recording: false,
        }
    }
}

/// Commands that require timing or stream manipulation; sent to the looper thread.
/// Simple mutations (mute/delete) are handled directly by locking `shared`.
pub enum LooperCmd {
    /// Finalise base recording → become the first layer → start playback.
    StartLoop,
    /// Wait for loop boundary, then begin overdub recording.
    StartOverdub,
    /// Finalise overdub recording → push new layer.
    /// `offset_ms`: shift layer samples in time (+ = later, - = earlier).
    StopOverdub { offset_ms: i32 },
    /// Stop all streams and exit the thread.
    StopAll,
}

/// Stored in AppState; gives Tauri commands access to shared state and the cmd channel.
pub struct LooperEngine {
    pub shared: Arc<Mutex<LooperShared>>,
    /// Frame position in the current loop; atomically updated by the output callback.
    pub playback_pos: Arc<AtomicUsize>,
    /// True while the input callback should accumulate into recording_buf.
    #[allow(dead_code)]
    pub is_recording: Arc<AtomicBool>,
    /// When true, output callback emits silence and freezes playback_pos.
    pub is_paused: Arc<AtomicBool>,
    pub cmd_tx: std::sync::mpsc::SyncSender<LooperCmd>,
    pub thread_join: Option<std::thread::JoinHandle<()>>,
}

#[derive(serde::Serialize, Clone)]
struct AudioLevelPayload {
    rms: f32,
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

pub fn start_looper_thread(
    input_device_index: usize,
    output_device_indices: Vec<usize>,
    app_handle: AppHandle,
) -> Result<LooperEngine, String> {
    let shared = Arc::new(Mutex::new(LooperShared::new()));
    let playback_pos = Arc::new(AtomicUsize::new(0));
    let is_recording = Arc::new(AtomicBool::new(true)); // RecordingBase starts immediately
    let is_paused = Arc::new(AtomicBool::new(false));

    let (ready_tx, ready_rx) = std::sync::mpsc::sync_channel::<Result<(), String>>(0);
    let (cmd_tx, cmd_rx) = std::sync::mpsc::sync_channel::<LooperCmd>(8);

    let shared_t = Arc::clone(&shared);
    let pos_t = Arc::clone(&playback_pos);
    let rec_t = Arc::clone(&is_recording);
    let pause_t = Arc::clone(&is_paused);

    let join = std::thread::spawn(move || {
        looper_thread_main(
            input_device_index,
            output_device_indices,
            app_handle,
            shared_t,
            pos_t,
            rec_t,
            pause_t,
            ready_tx,
            cmd_rx,
        );
    });

    match ready_rx.recv() {
        Ok(Ok(())) => Ok(LooperEngine {
            shared,
            playback_pos,
            is_recording,
            is_paused,
            cmd_tx,
            thread_join: Some(join),
        }),
        Ok(Err(e)) => { join.join().ok(); Err(e) }
        Err(_) => { join.join().ok(); Err("Looper thread terminated unexpectedly".into()) }
    }
}

// ---------------------------------------------------------------------------
// Thread implementation
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
fn looper_thread_main(
    input_device_index: usize,
    output_device_indices: Vec<usize>,
    app_handle: AppHandle,
    shared: Arc<Mutex<LooperShared>>,
    playback_pos: Arc<AtomicUsize>,
    is_recording: Arc<AtomicBool>,
    is_paused: Arc<AtomicBool>,
    ready_tx: std::sync::mpsc::SyncSender<Result<(), String>>,
    cmd_rx: std::sync::mpsc::Receiver<LooperCmd>,
) {
    let host = cpal::default_host();

    // --- Input device ---
    let input_devices: Vec<_> = match host.input_devices() {
        Ok(i) => i.collect(),
        Err(e) => { ready_tx.send(Err(e.to_string())).ok(); return; }
    };
    let input_device = match input_devices.into_iter().nth(input_device_index) {
        Some(d) => d,
        None => {
            ready_tx.send(Err(format!("Input device {} not found", input_device_index))).ok();
            return;
        }
    };
    let input_cfg = match input_device.default_input_config() {
        Ok(c) => c,
        Err(e) => { ready_tx.send(Err(e.to_string())).ok(); return; }
    };
    let sample_rate = input_cfg.sample_rate().0;
    let channels = input_cfg.channels();

    // Write sample_rate/channels into shared now that we know them.
    {
        let mut g = shared.lock().unwrap();
        g.sample_rate = sample_rate;
        g.channels = channels;
    }

    // --- Output devices ---
    let output_devices_all: Vec<_> = match host.output_devices() {
        Ok(o) => o.collect(),
        Err(e) => { ready_tx.send(Err(e.to_string())).ok(); return; }
    };

    // --- Build input stream ---
    let shared_in = Arc::clone(&shared);
    let rec_flag = Arc::clone(&is_recording);
    let app_in = app_handle.clone();
    let in_cfg = input_cfg.config();
    let in_fmt = input_cfg.sample_format();

    let input_stream = match in_fmt {
        cpal::SampleFormat::F32 => input_device.build_input_stream(
            &in_cfg,
            move |data: &[f32], _| {
                let rms = rms_f32(data);
                let _ = app_in.emit("audio-level", AudioLevelPayload { rms });
                if rec_flag.load(Ordering::Relaxed) {
                    if let Ok(mut g) = shared_in.try_lock() {
                        g.recording_buf.extend_from_slice(data);
                    }
                }
            },
            |e| eprintln!("[Looper] input error: {e}"),
            None,
        ),
        cpal::SampleFormat::I16 => {
            let shared_in2 = Arc::clone(&shared);
            let rec_flag2 = Arc::clone(&is_recording);
            let app_in2 = app_handle.clone();
            input_device.build_input_stream(
                &in_cfg,
                move |data: &[i16], _| {
                    let f32s: Vec<f32> = data.iter().map(|&s| s as f32 / 32767.0).collect();
                    let rms = rms_f32(&f32s);
                    let _ = app_in2.emit("audio-level", AudioLevelPayload { rms });
                    if rec_flag2.load(Ordering::Relaxed) {
                        if let Ok(mut g) = shared_in2.try_lock() {
                            g.recording_buf.extend_from_slice(&f32s);
                        }
                    }
                },
                |e| eprintln!("[Looper] input error: {e}"),
                None,
            )
        }
        cpal::SampleFormat::U16 => {
            let shared_in3 = Arc::clone(&shared);
            let rec_flag3 = Arc::clone(&is_recording);
            let app_in3 = app_handle.clone();
            input_device.build_input_stream(
                &in_cfg,
                move |data: &[u16], _| {
                    let f32s: Vec<f32> = data
                        .iter()
                        .map(|&s| (s.wrapping_sub(32768) as i16) as f32 / 32767.0)
                        .collect();
                    let rms = rms_f32(&f32s);
                    let _ = app_in3.emit("audio-level", AudioLevelPayload { rms });
                    if rec_flag3.load(Ordering::Relaxed) {
                        if let Ok(mut g) = shared_in3.try_lock() {
                            g.recording_buf.extend_from_slice(&f32s);
                        }
                    }
                },
                |e| eprintln!("[Looper] input error: {e}"),
                None,
            )
        }
        fmt => {
            ready_tx.send(Err(format!("Unsupported input format: {:?}", fmt))).ok();
            return;
        }
    };

    let input_stream = match input_stream {
        Ok(s) => s,
        Err(e) => { ready_tx.send(Err(e.to_string())).ok(); return; }
    };
    if let Err(e) = input_stream.play() {
        ready_tx.send(Err(e.to_string())).ok();
        return;
    }

    // --- Build output streams ---
    let mut output_streams: Vec<cpal::Stream> = Vec::new();

    for &out_idx in &output_device_indices {
        let out_device = match output_devices_all.iter().nth(out_idx) {
            Some(d) => d,
            None => { eprintln!("[Looper] output device {} not found", out_idx); continue; }
        };
        let out_cfg = match out_device.default_output_config() {
            Ok(c) => c,
            Err(e) => { eprintln!("[Looper] output config: {e}"); continue; }
        };

        let out_channels = out_cfg.channels() as usize;
        let shared_out = Arc::clone(&shared);
        let pos_out = Arc::clone(&playback_pos);
        let paused_out = Arc::clone(&is_paused);

        // Always use the input device's sample rate for output so that
        // playback_pos advances at the same rate the audio was recorded.
        // Most devices support both 44100 and 48000 Hz; if not, we fall back
        // to the device default and log a warning.
        let desired_rate = cpal::SampleRate(sample_rate);
        let rate_ok = out_device
            .supported_output_configs()
            .ok()
            .map(|cfgs| {
                cfgs.into_iter().any(|c| {
                    c.min_sample_rate() <= desired_rate
                        && desired_rate <= c.max_sample_rate()
                        && c.channels() == out_cfg.channels()
                })
            })
            .unwrap_or(false);

        let stream_cfg = if rate_ok {
            cpal::StreamConfig {
                channels: out_cfg.channels(),
                sample_rate: desired_rate,
                buffer_size: cpal::BufferSize::Default,
            }
        } else {
            eprintln!(
                "[Looper] output device does not support {}Hz; \
                 falling back to {}Hz — playback speed may differ",
                sample_rate,
                out_cfg.sample_rate().0
            );
            out_cfg.config()
        };

        let stream = match out_cfg.sample_format() {
            cpal::SampleFormat::F32 => out_device.build_output_stream(
                &stream_cfg,
                move |data: &mut [f32], _| {
                    mix_into_output(data, &shared_out, &pos_out, &paused_out, out_channels);
                },
                |e| eprintln!("[Looper] output error: {e}"),
                None,
            ),
            cpal::SampleFormat::I16 => {
                let shared_out2 = Arc::clone(&shared);
                let pos_out2 = Arc::clone(&playback_pos);
                let paused_out2 = Arc::clone(&is_paused);
                out_device.build_output_stream(
                    &stream_cfg,
                    move |data: &mut [i16], _| {
                        let mut tmp = vec![0.0f32; data.len()];
                        mix_into_output(&mut tmp, &shared_out2, &pos_out2, &paused_out2, out_channels);
                        for (o, s) in data.iter_mut().zip(tmp.iter()) {
                            *o = (s * 32767.0) as i16;
                        }
                    },
                    |e| eprintln!("[Looper] output error: {e}"),
                    None,
                )
            }
            fmt => { eprintln!("[Looper] unsupported output format {:?}", fmt); continue; }
        };

        match stream {
            Ok(s) => {
                if let Err(e) = s.play() {
                    eprintln!("[Looper] play error: {e}");
                } else {
                    output_streams.push(s);
                }
            }
            Err(e) => eprintln!("[Looper] build stream error: {e}"),
        }
    }

    ready_tx.send(Ok(())).ok();

    // --- Command loop ---
    loop {
        let cmd = match cmd_rx.recv() {
            Ok(c) => c,
            Err(_) => break,
        };

        match cmd {
            LooperCmd::StartLoop => {
                is_recording.store(false, Ordering::SeqCst);
                let mut g = shared.lock().unwrap();
                let ch = g.channels as usize;
                let frames = if ch > 0 { g.recording_buf.len() / ch } else { 0 };
                if frames == 0 {
                    g.recording_buf.clear();
                    g.status = LooperStatus::Idle;
                    continue;
                }
                g.loop_length_frames = frames;
                let id = g.next_layer_id;
                g.next_layer_id += 1;
                let samples = std::mem::take(&mut g.recording_buf);
                g.layers.push(LoopLayer { id, samples, muted: false });
                g.status = LooperStatus::Looping;
                drop(g);
                playback_pos.store(0, Ordering::SeqCst);
            }

            LooperCmd::StartOverdub => {
                // Mark as waiting immediately so the frontend can show feedback.
                let (loop_frames, sr) = {
                    let mut g = shared.lock().unwrap();
                    g.status = LooperStatus::WaitingForOverdub;
                    (g.loop_length_frames, g.sample_rate as usize)
                };

                // Spin until the next loop boundary (within ~5 ms tolerance).
                if loop_frames > 0 {
                    let tolerance = (sr * 5) / 1000;
                    loop {
                        let pos = playback_pos.load(Ordering::Relaxed) % loop_frames;
                        if pos < tolerance { break; }
                        std::thread::sleep(std::time::Duration::from_millis(1));
                    }
                }

                {
                    let mut g = shared.lock().unwrap();
                    g.recording_buf.clear();
                    g.status = LooperStatus::Overdubbing;
                }
                is_recording.store(true, Ordering::SeqCst);
            }

            LooperCmd::StopOverdub { offset_ms } => {
                is_recording.store(false, Ordering::SeqCst);
                let mut g = shared.lock().unwrap();
                let ch = g.channels as usize;
                let target_len = g.loop_length_frames * ch;

                // Trim or pad recording to exact loop length
                g.recording_buf.truncate(target_len);
                g.recording_buf.resize(target_len, 0.0);

                // Apply time offset (shift samples, fill vacated region with silence)
                if offset_ms != 0 && target_len > 0 {
                    let sr = g.sample_rate as i64;
                    let offset_frames =
                        ((offset_ms.abs() as i64 * sr) / 1000) as usize;
                    let offset_samples = (offset_frames * ch).min(target_len);

                    if offset_ms > 0 {
                        // Shift forward: layer plays later → silence at start
                        g.recording_buf.rotate_right(offset_samples);
                        for s in &mut g.recording_buf[..offset_samples] {
                            *s = 0.0;
                        }
                    } else {
                        // Shift backward: layer plays earlier → silence at end
                        g.recording_buf.rotate_left(offset_samples);
                        let end = target_len - offset_samples;
                        for s in &mut g.recording_buf[end..] {
                            *s = 0.0;
                        }
                    }
                }

                let id = g.next_layer_id;
                g.next_layer_id += 1;
                let samples = std::mem::take(&mut g.recording_buf);
                g.layers.push(LoopLayer { id, samples, muted: false });
                g.status = LooperStatus::Looping;
            }

            LooperCmd::StopAll => {
                is_recording.store(false, Ordering::SeqCst);
                {
                    let mut g = shared.lock().unwrap();
                    g.status = LooperStatus::Idle;
                    g.layers.clear();
                    g.recording_buf.clear();
                    g.loop_length_frames = 0;
                }
                playback_pos.store(0, Ordering::SeqCst);
                drop(output_streams);
                drop(input_stream);
                return;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Output mix callback — called from the cpal output stream thread
// ---------------------------------------------------------------------------

fn mix_into_output(
    data: &mut [f32],
    shared: &Arc<Mutex<LooperShared>>,
    playback_pos: &Arc<AtomicUsize>,
    is_paused: &Arc<AtomicBool>,
    out_channels: usize,
) {
    if is_paused.load(Ordering::Relaxed) {
        data.fill(0.0);
        return;
    }

    let g = match shared.try_lock() {
        Ok(g) => g,
        Err(_) => { data.fill(0.0); return; }
    };

    let loop_frames = g.loop_length_frames;
    if loop_frames == 0 || g.layers.is_empty() {
        data.fill(0.0);
        return;
    }

    let layer_ch = g.channels as usize;
    let pos = playback_pos.load(Ordering::Relaxed);
    let frame_count = data.len() / out_channels;

    for f in 0..frame_count {
        let loop_frame = (pos + f) % loop_frames;

        // Mix all unmuted layers at this position, compute per-input-channel mix
        let mut mix = vec![0.0f32; layer_ch.max(1)];
        for layer in &g.layers {
            if layer.muted { continue; }
            for c in 0..layer_ch {
                let idx = loop_frame * layer_ch + c;
                if idx < layer.samples.len() {
                    mix[c] += layer.samples[idx];
                }
            }
        }

        // Future session recording hook: named mix values are available here.
        // if g.is_session_recording { push mix to g.session_recording_buf ... }

        // Write to output buffer, handling channel count mismatch
        for c in 0..out_channels {
            let src = if layer_ch > 0 { mix[c.min(layer_ch - 1)].clamp(-1.0, 1.0) } else { 0.0 };
            data[f * out_channels + c] = src;
        }
    }

    let new_pos = (pos + frame_count) % loop_frames;
    playback_pos.store(new_pos, Ordering::Relaxed);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

fn rms_f32(data: &[f32]) -> f32 {
    if data.is_empty() { return 0.0; }
    (data.iter().map(|&s| s * s).sum::<f32>() / data.len() as f32).sqrt()
}

/// Downsample f32 layer samples to `target_points` RMS values (0.0–1.0).
/// Used by `looper_get_layer_waveform`.
pub fn downsample_layer(samples: &[f32], channels: usize, target_points: usize) -> Vec<f32> {
    if samples.is_empty() || target_points == 0 { return vec![]; }
    let ch = channels.max(1);
    // Left channel only
    let mono: Vec<f32> = samples.chunks(ch).map(|frame| frame[0]).collect();
    let chunk_size = (mono.len() / target_points).max(1);
    mono.chunks(chunk_size)
        .map(|chunk| {
            (chunk.iter().map(|&s| s * s).sum::<f32>() / chunk.len() as f32)
                .sqrt()
                .clamp(0.0, 1.0)
        })
        .collect()
}
