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
