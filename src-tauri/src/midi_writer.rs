use std::path::Path;
use crate::state::MidiEvent;

const TICKS_PER_BEAT: u16 = 480;
const MICROSECONDS_PER_BEAT: u32 = 500_000; // 120 BPM

pub fn write_midi(events: &[MidiEvent], path: &Path) -> Result<(), String> {
    let mut data: Vec<u8> = Vec::new();

    // SMF Header Chunk
    data.extend_from_slice(b"MThd");
    data.extend_from_slice(&6u32.to_be_bytes()); // header length = 6
    data.extend_from_slice(&0u16.to_be_bytes()); // format 0 (single track)
    data.extend_from_slice(&1u16.to_be_bytes()); // 1 track
    data.extend_from_slice(&TICKS_PER_BEAT.to_be_bytes());

    // Track Chunk
    let mut track: Vec<u8> = Vec::new();

    // Tempo meta event at tick 0
    write_vlq(&mut track, 0);
    track.push(0xFF); // meta event
    track.push(0x51); // set tempo
    track.push(0x03); // 3 bytes follow
    let tempo_bytes = MICROSECONDS_PER_BEAT.to_be_bytes();
    track.extend_from_slice(&tempo_bytes[1..]); // 3 bytes (skip leading zero)

    let ms_to_ticks = |ms: u64| -> u64 {
        ms * TICKS_PER_BEAT as u64 * 1_000_000
            / (MICROSECONDS_PER_BEAT as u64 * 1000)
    };

    let mut last_tick: u64 = 0;
    for event in events {
        let tick = ms_to_ticks(event.timestamp_ms);
        let delta = tick.saturating_sub(last_tick);
        last_tick = tick;

        write_vlq(&mut track, delta);
        track.extend_from_slice(&event.message);
    }

    // End of track meta event
    write_vlq(&mut track, 0);
    track.extend_from_slice(&[0xFF, 0x2F, 0x00]);

    // Track header
    data.extend_from_slice(b"MTrk");
    data.extend_from_slice(&(track.len() as u32).to_be_bytes());
    data.extend(track);

    std::fs::write(path, &data).map_err(|e| e.to_string())?;
    Ok(())
}

/// Encode a value as MIDI variable-length quantity
fn write_vlq(buf: &mut Vec<u8>, mut value: u64) {
    let mut bytes = [0u8; 9];
    let mut count = 0;
    loop {
        bytes[count] = (value & 0x7F) as u8;
        value >>= 7;
        count += 1;
        if value == 0 {
            break;
        }
    }
    for i in (0..count).rev() {
        if i > 0 {
            buf.push(bytes[i] | 0x80);
        } else {
            buf.push(bytes[i]);
        }
    }
}
