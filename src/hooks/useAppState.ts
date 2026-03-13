import { useReducer, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { AppStatus, StopResult } from '../types';

interface State {
  status: AppStatus;
  selectedAudioDevice: number | null;
  selectedMidiDevice: number | null;
  stopResult: StopResult | null;
  error: string | null;
  isSaving: boolean;
}

type Action =
  | { type: 'SET_AUDIO_DEVICE'; id: number }
  | { type: 'SET_MIDI_DEVICE'; id: number | null }
  | { type: 'RECORDING_STARTED' }
  | { type: 'RECORDING_STOPPED'; result: StopResult }
  | { type: 'RESET' }
  | { type: 'SAVE_STARTED' }
  | { type: 'SAVE_DONE' }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'CLEAR_ERROR' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_AUDIO_DEVICE':
      return { ...state, selectedAudioDevice: action.id };
    case 'SET_MIDI_DEVICE':
      return { ...state, selectedMidiDevice: action.id };
    case 'RECORDING_STARTED':
      return { ...state, status: 'Recording', error: null, stopResult: null };
    case 'RECORDING_STOPPED':
      return { ...state, status: 'Stopped', stopResult: action.result };
    case 'RESET':
      return { ...state, status: 'Idle', stopResult: null, error: null };
    case 'SAVE_STARTED':
      return { ...state, isSaving: true };
    case 'SAVE_DONE':
      return { ...state, isSaving: false };
    case 'SET_ERROR':
      return { ...state, error: action.error };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    default:
      return state;
  }
}

const initialState: State = {
  status: 'Idle',
  selectedAudioDevice: null,
  selectedMidiDevice: null,
  stopResult: null,
  error: null,
  isSaving: false,
};

export function useAppState() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const setAudioDevice = useCallback((id: number) => {
    dispatch({ type: 'SET_AUDIO_DEVICE', id });
  }, []);

  const setMidiDevice = useCallback((id: number | null) => {
    dispatch({ type: 'SET_MIDI_DEVICE', id });
  }, []);

  const record = useCallback(async () => {
    if (state.selectedAudioDevice === null) {
      dispatch({ type: 'SET_ERROR', error: 'Select an audio input device first.' });
      return;
    }
    try {
      await invoke('start_recording', {
        audioDeviceId: state.selectedAudioDevice,
        midiDeviceId: state.selectedMidiDevice ?? undefined,
      });
      dispatch({ type: 'RECORDING_STARTED' });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: String(err) });
    }
  }, [state.selectedAudioDevice, state.selectedMidiDevice]);

  const stop = useCallback(async () => {
    try {
      const result = await invoke<StopResult>('stop_recording');
      dispatch({ type: 'RECORDING_STOPPED', result });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: String(err) });
    }
  }, []);

  const save = useCallback(async () => {
    dispatch({ type: 'SAVE_STARTED' });
    try {
      await invoke('save_recording');
    } catch (err) {
      const msg = String(err);
      if (!msg.includes('cancelled')) {
        dispatch({ type: 'SET_ERROR', error: msg });
      }
    } finally {
      dispatch({ type: 'SAVE_DONE' });
    }
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  return {
    state,
    setAudioDevice,
    setMidiDevice,
    record,
    stop,
    save,
    reset,
    clearError,
  };
}
