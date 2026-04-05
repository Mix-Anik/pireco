import { useReducer, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type {
  LooperStatus,
  LayerSnapshot,
  LooperStateSnapshot,
} from '../types';

interface State {
  status: LooperStatus;
  layers: LayerSnapshot[];
  loopDurationMs: number;
  playbackPosMs: number;
  sampleRate: number;
  isSessionRecording: boolean;
  selectedInputDevice: number | null;
  selectedOutputDevices: number[];
  overdubOffsetMs: number;
  error: string | null;
}

type Action =
  | { type: 'SET_INPUT_DEVICE'; id: number }
  | { type: 'SET_OUTPUT_DEVICES'; ids: number[] }
  | { type: 'SET_OVERDUB_OFFSET'; ms: number }
  | { type: 'SNAPSHOT'; snapshot: LooperStateSnapshot }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'CLEAR_ERROR' };

function applySnapshot(state: State, snapshot: LooperStateSnapshot): State {
  return {
    ...state,
    status: snapshot.status,
    layers: snapshot.layers,
    loopDurationMs: snapshot.loop_duration_ms,
    playbackPosMs: snapshot.playback_pos_ms,
    sampleRate: snapshot.sample_rate,
    isSessionRecording: snapshot.is_session_recording,
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_INPUT_DEVICE':
      return { ...state, selectedInputDevice: action.id };
    case 'SET_OUTPUT_DEVICES':
      return { ...state, selectedOutputDevices: action.ids };
    case 'SET_OVERDUB_OFFSET':
      return { ...state, overdubOffsetMs: action.ms };
    case 'SNAPSHOT':
      return applySnapshot(state, action.snapshot);
    case 'SET_ERROR':
      return { ...state, error: action.error };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    default:
      return state;
  }
}

function loadInitialState(): State {
  const savedOffset = localStorage.getItem('pireco_overdub_offset');
  return {
    status: 'Idle',
    layers: [],
    loopDurationMs: 0,
    playbackPosMs: 0,
    sampleRate: 0,
    isSessionRecording: false,
    selectedInputDevice: null,
    selectedOutputDevices: [],
    overdubOffsetMs: savedOffset !== null ? Number(savedOffset) : 0,
    error: null,
  };
}

export function useLooperState() {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitialState);

  // Poll playback position when the loop is running.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRef = useRef<LooperStatus>('Idle');
  statusRef.current = state.status;

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      if (
        statusRef.current !== 'Looping' &&
        statusRef.current !== 'WaitingForOverdub' &&
        statusRef.current !== 'Overdubbing'
      ) {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        return;
      }
      try {
        const snapshot = await invoke<LooperStateSnapshot>('looper_get_state');
        dispatch({ type: 'SNAPSHOT', snapshot });
      } catch {
        // Non-fatal — just skip this poll tick
      }
    }, 100);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Start/stop polling based on status
  useEffect(() => {
    if (
      state.status === 'Looping' ||
      state.status === 'WaitingForOverdub' ||
      state.status === 'Overdubbing'
    ) {
      startPolling();
    } else {
      stopPolling();
    }
  }, [state.status, startPolling, stopPolling]);

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const setInputDevice = useCallback((id: number) => {
    dispatch({ type: 'SET_INPUT_DEVICE', id });
  }, []);

  const setOutputDevices = useCallback((ids: number[]) => {
    dispatch({ type: 'SET_OUTPUT_DEVICES', ids });
  }, []);

  const setOverdubOffset = useCallback((ms: number) => {
    localStorage.setItem('pireco_overdub_offset', String(ms));
    dispatch({ type: 'SET_OVERDUB_OFFSET', ms });
  }, []);

  const startRecord = useCallback(async () => {
    if (state.selectedInputDevice === null) {
      dispatch({ type: 'SET_ERROR', error: 'Select an audio input device first.' });
      return;
    }
    if (state.selectedOutputDevices.length === 0) {
      dispatch({ type: 'SET_ERROR', error: 'Select at least one output device.' });
      return;
    }
    try {
      await invoke('looper_start_record', {
        inputDeviceId: state.selectedInputDevice,
        outputDeviceIds: state.selectedOutputDevices,
      });
      dispatch({
        type: 'SNAPSHOT',
        snapshot: {
          status: 'RecordingBase',
          layers: [],
          loop_duration_ms: 0,
          playback_pos_ms: 0,
          sample_rate: state.sampleRate,
          is_session_recording: false,
        },
      });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: String(err) });
    }
  }, [state.selectedInputDevice, state.selectedOutputDevices, state.sampleRate]);

  const stopAndLoop = useCallback(async () => {
    try {
      const snapshot = await invoke<LooperStateSnapshot>('looper_stop_and_loop');
      dispatch({ type: 'SNAPSHOT', snapshot });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: String(err) });
    }
  }, []);

  const startOverdub = useCallback(async () => {
    try {
      await invoke('looper_start_overdub');
      // Don't pre-dispatch a status — let polling pick up WaitingForOverdub
      // then Overdubbing from the backend accurately.
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: String(err) });
    }
  }, []);

  const stopOverdub = useCallback(async () => {
    try {
      const snapshot = await invoke<LooperStateSnapshot>('looper_stop_overdub', {
        offsetMs: state.overdubOffsetMs,
      });
      dispatch({ type: 'SNAPSHOT', snapshot });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: String(err) });
    }
  }, [state.overdubOffsetMs]);

  const stopAll = useCallback(async () => {
    try {
      await invoke('looper_stop_all');
      dispatch({
        type: 'SNAPSHOT',
        snapshot: {
          status: 'Idle',
          layers: [],
          loop_duration_ms: 0,
          playback_pos_ms: 0,
          sample_rate: 0,
          is_session_recording: false,
        },
      });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: String(err) });
    }
  }, []);

  const toggleMute = useCallback(async (layerId: number) => {
    try {
      const snapshot = await invoke<LooperStateSnapshot>('looper_toggle_mute_layer', {
        layerId,
      });
      dispatch({ type: 'SNAPSHOT', snapshot });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: String(err) });
    }
  }, []);

  const deleteLayer = useCallback(async (layerId: number) => {
    try {
      const snapshot = await invoke<LooperStateSnapshot>('looper_delete_layer', {
        layerId,
      });
      dispatch({ type: 'SNAPSHOT', snapshot });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: String(err) });
    }
  }, []);

  const pause = useCallback(async () => {
    try {
      const snapshot = await invoke<LooperStateSnapshot>('looper_pause');
      dispatch({ type: 'SNAPSHOT', snapshot });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: String(err) });
    }
  }, []);

  const resume = useCallback(async () => {
    try {
      const snapshot = await invoke<LooperStateSnapshot>('looper_resume');
      dispatch({ type: 'SNAPSHOT', snapshot });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: String(err) });
    }
  }, []);

  const startSessionRecord = useCallback(async () => {
    try {
      const snapshot = await invoke<LooperStateSnapshot>('looper_start_session_record');
      dispatch({ type: 'SNAPSHOT', snapshot });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: String(err) });
    }
  }, []);

  const stopAndSaveSession = useCallback(async () => {
    try {
      const snapshot = await invoke<LooperStateSnapshot>('looper_stop_session_record');
      dispatch({ type: 'SNAPSHOT', snapshot });
      // Opens a blocking save dialog on the Rust side — resolves when user picks a file or cancels.
      await invoke('looper_save_session');
    } catch (err) {
      // "Save cancelled" is not an error worth showing.
      if (!String(err).includes('cancelled')) {
        dispatch({ type: 'SET_ERROR', error: String(err) });
      }
    }
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  return {
    state,
    setInputDevice,
    setOutputDevices,
    setOverdubOffset,
    startRecord,
    stopAndLoop,
    startOverdub,
    stopOverdub,
    stopAll,
    pause,
    resume,
    startSessionRecord,
    stopAndSaveSession,
    toggleMute,
    deleteLayer,
    clearError,
  };
}
