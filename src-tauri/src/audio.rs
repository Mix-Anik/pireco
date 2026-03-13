use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

use crate::state::AudioRecordingHandle;

#[derive(serde::Serialize, Clone)]
pub struct AudioDevice {
    pub id: usize,
    pub name: String,
    pub is_default: bool,
}

#[derive(serde::Serialize, Clone)]
struct AudioLevelPayload {
    rms: f32,
}

pub fn list_audio_input_devices() -> Result<Vec<AudioDevice>, String> {
    let host = cpal::default_host();
    let default_name = host.default_input_device().and_then(|d| d.name().ok());

    host.input_devices()
        .map_err(|e| e.to_string())?
        .enumerate()
        .map(|(i, dev)| {
            let name = dev.name().map_err(|e| e.to_string())?;
            let is_default = default_name.as_deref() == Some(&name);
            Ok(AudioDevice { id: i, name, is_default })
        })
        .collect()
}

/// Start audio capture on a dedicated thread so cpal::Stream never crosses thread boundaries.
/// The thread sends back (sample_rate, channels) once the stream is running, then blocks until
/// stop_signal receives ().
pub fn start_audio_capture(
    device_index: usize,
    app_handle: AppHandle,
) -> Result<AudioRecordingHandle, String> {
    let samples = Arc::new(Mutex::new(Vec::<i16>::new()));
    let samples_for_thread = Arc::clone(&samples);

    let (ready_tx, ready_rx) = std::sync::mpsc::sync_channel::<Result<(u32, u16), String>>(0);
    let (stop_tx, stop_rx) = std::sync::mpsc::sync_channel::<()>(1);

    let join_handle = std::thread::spawn(move || {
        // Everything cpal stays on this thread
        let host = cpal::default_host();

        let devices: Vec<_> = match host.input_devices() {
            Ok(iter) => iter.collect(),
            Err(e) => { ready_tx.send(Err(e.to_string())).ok(); return; }
        };

        let device = match devices.into_iter().nth(device_index) {
            Some(d) => d,
            None => {
                ready_tx.send(Err(format!("Audio device index {} not found", device_index))).ok();
                return;
            }
        };

        let supported = match device.default_input_config() {
            Ok(c) => c,
            Err(e) => { ready_tx.send(Err(e.to_string())).ok(); return; }
        };

        let sample_rate  = supported.sample_rate().0;
        let channels     = supported.channels();
        let stream_cfg   = supported.config();
        let sample_fmt   = supported.sample_format();

        let stream = match sample_fmt {
            cpal::SampleFormat::F32 => build_f32(&device, &stream_cfg, Arc::clone(&samples_for_thread), app_handle),
            cpal::SampleFormat::I16 => build_i16(&device, &stream_cfg, Arc::clone(&samples_for_thread), app_handle),
            cpal::SampleFormat::U16 => build_u16(&device, &stream_cfg, Arc::clone(&samples_for_thread), app_handle),
            fmt => Err(format!("Unsupported sample format: {:?}", fmt)),
        };

        let stream = match stream {
            Ok(s) => s,
            Err(e) => { ready_tx.send(Err(e)).ok(); return; }
        };

        if let Err(e) = stream.play() {
            ready_tx.send(Err(e.to_string())).ok();
            return;
        }

        ready_tx.send(Ok((sample_rate, channels))).ok();

        // Block until stop is requested; stream lives here until then
        let _ = stop_rx.recv();
        // stream drops here, on this thread — safe
    });

    match ready_rx.recv() {
        Ok(Ok((sample_rate, channels))) => Ok(AudioRecordingHandle {
            stop_signal: stop_tx,
            join_handle,
            samples,
            sample_rate,
            channels,
        }),
        Ok(Err(e)) => { join_handle.join().ok(); Err(e) }
        Err(_)     => { join_handle.join().ok(); Err("Audio thread terminated unexpectedly".into()) }
    }
}

fn build_f32(
    device: &cpal::Device, config: &cpal::StreamConfig,
    sink: Arc<Mutex<Vec<i16>>>, handle: AppHandle,
) -> Result<cpal::Stream, String> {
    device.build_input_stream(config,
        move |data: &[f32], _| {
            let i16s: Vec<i16> = data.iter().map(|&s| (s.clamp(-1.0, 1.0) * 32767.0) as i16).collect();
            let rms = (data.iter().map(|&s| s * s).sum::<f32>() / data.len().max(1) as f32).sqrt();
            if let Ok(mut s) = sink.lock() { s.extend_from_slice(&i16s); }
            let _ = handle.emit("audio-level", AudioLevelPayload { rms });
        },
        |err| eprintln!("Audio error: {err}"), None,
    ).map_err(|e| e.to_string())
}

fn build_i16(
    device: &cpal::Device, config: &cpal::StreamConfig,
    sink: Arc<Mutex<Vec<i16>>>, handle: AppHandle,
) -> Result<cpal::Stream, String> {
    device.build_input_stream(config,
        move |data: &[i16], _| {
            let rms = (data.iter().map(|&s| { let f = s as f32 / 32767.0; f * f }).sum::<f32>()
                       / data.len().max(1) as f32).sqrt();
            if let Ok(mut s) = sink.lock() { s.extend_from_slice(data); }
            let _ = handle.emit("audio-level", AudioLevelPayload { rms });
        },
        |err| eprintln!("Audio error: {err}"), None,
    ).map_err(|e| e.to_string())
}

fn build_u16(
    device: &cpal::Device, config: &cpal::StreamConfig,
    sink: Arc<Mutex<Vec<i16>>>, handle: AppHandle,
) -> Result<cpal::Stream, String> {
    device.build_input_stream(config,
        move |data: &[u16], _| {
            let i16s: Vec<i16> = data.iter().map(|&s| s.wrapping_sub(32768) as i16).collect();
            let rms = (i16s.iter().map(|&s| { let f = s as f32 / 32767.0; f * f }).sum::<f32>()
                       / i16s.len().max(1) as f32).sqrt();
            if let Ok(mut s) = sink.lock() { s.extend_from_slice(&i16s); }
            let _ = handle.emit("audio-level", AudioLevelPayload { rms });
        },
        |err| eprintln!("Audio error: {err}"), None,
    ).map_err(|e| e.to_string())
}
