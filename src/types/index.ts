export interface AudioDevice {
  id: number;
  name: string;
  is_default: boolean;
}

export interface MidiDevice {
  id: number;
  name: string;
}

export type AppStatus = 'Idle' | 'Recording' | 'Stopped';

export interface AudioLevelPayload {
  rms: number;
}

export interface MidiEventPayload {
  note: number;
  velocity: number;
  is_note_on: boolean;
  timestamp_ms: number;
}

export interface StopResult {
  wav_path: string;
  has_midi: boolean;
  duration_ms: number;
}

export interface SaveResult {
  saved_wav: boolean;
  saved_midi: boolean;
}

// ---------------------------------------------------------------------------
// Looper types
// ---------------------------------------------------------------------------

export type LooperStatus = 'Idle' | 'Arming' | 'RecordingBase' | 'WaitingForOverdub' | 'Looping' | 'Paused' | 'Overdubbing';

export interface LayerSnapshot {
  id: number;
  muted: boolean;
  duration_ms: number;
}

export interface LooperStateSnapshot {
  status: LooperStatus;
  layers: LayerSnapshot[];
  loop_duration_ms: number;
  playback_pos_ms: number;
  sample_rate: number;
  is_session_recording: boolean;
}

export interface AudioOutputDevice {
  id: number;
  name: string;
}

export type AppTab = 'recorder' | 'looper';
