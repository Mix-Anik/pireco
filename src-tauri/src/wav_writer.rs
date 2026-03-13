use std::path::Path;

pub fn write_wav(samples: &[i16], path: &Path, sample_rate: u32, channels: u16) -> Result<(), String> {
    let spec = hound::WavSpec {
        channels,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let mut writer = hound::WavWriter::create(path, spec).map_err(|e| e.to_string())?;
    for &sample in samples {
        writer.write_sample(sample).map_err(|e| e.to_string())?;
    }
    writer.finalize().map_err(|e| e.to_string())?;
    Ok(())
}

/// Read WAV file and downsample to `target_points` RMS values for waveform visualization.
/// Returns Vec<f32> with values in range 0.0–1.0.
pub fn read_wav_downsampled(path: &Path, target_points: usize) -> Result<Vec<f32>, String> {
    let mut reader = hound::WavReader::open(path).map_err(|e| e.to_string())?;
    let spec = reader.spec();
    let channels = spec.channels as usize;

    // Read only the left (first) channel
    let samples: Vec<i16> = reader
        .samples::<i16>()
        .enumerate()
        .filter_map(|(i, s)| {
            if i % channels == 0 {
                s.ok()
            } else {
                None
            }
        })
        .collect();

    if samples.is_empty() {
        return Ok(vec![]);
    }

    let chunk_size = (samples.len() / target_points).max(1);

    let result = samples
        .chunks(chunk_size)
        .map(|chunk| {
            let sum_sq: f64 = chunk
                .iter()
                .map(|&s| {
                    let f = s as f64 / 32767.0;
                    f * f
                })
                .sum();
            (sum_sq / chunk.len() as f64).sqrt() as f32
        })
        .collect();

    Ok(result)
}
