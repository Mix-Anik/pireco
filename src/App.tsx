import { useEffect, useRef, useState } from 'react';
import './styles/globals.css';

import { useAppState }      from './hooks/useAppState';
import { useTauriEvents }   from './hooks/useTauriEvents';
import { useAudioPlayback } from './hooks/useAudioPlayback';
import { useWaveformData }  from './hooks/useWaveformData';

import { StatusBar }           from './components/StatusBar';
import { AudioDeviceSelector } from './components/DevicePanel/AudioDeviceSelector';
import { MidiDeviceSelector }  from './components/DevicePanel/MidiDeviceSelector';
import { TransportControls }   from './components/Transport/TransportControls';
import { LiveWaveform }        from './components/Visualization/LiveWaveform';
import { LevelMeter }          from './components/Visualization/LevelMeter';
import { PlaybackWaveform }    from './components/Visualization/PlaybackWaveform';
import { MidiKeyboard }        from './components/Visualization/MidiKeyboard';
import { formatDuration }      from './utils/waveformUtils';

export default function App() {
  const { state, setAudioDevice, setMidiDevice, record, stop, save, reset, clearError } = useAppState();
  const { audioLevel, activeNotes } = useTauriEvents();
  const waveformData = useWaveformData(state.status);
  const playback     = useAudioPlayback(state.stopResult?.wav_path ?? null);

  // Recording elapsed timer
  const [recordingMs, setRecordingMs] = useState(0);
  const recordStartRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    if (state.status === 'Recording') {
      recordStartRef.current = Date.now();
      setRecordingMs(0);
      timerRef.current = setInterval(() => {
        setRecordingMs(Date.now() - recordStartRef.current);
      }, 100);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [state.status]);

  // Space bar: toggle record / stop
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      if (state.status === 'Recording') stop();
      else if (state.status === 'Idle') record();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state.status, record, stop]);

  // Auto-dismiss error after 6 seconds
  useEffect(() => {
    if (!state.error) return;
    const t = setTimeout(clearError, 6000);
    return () => clearTimeout(t);
  }, [state.error, clearError]);

  const devicesBusy  = state.status === 'Recording';
  const hasMidi      = state.stopResult?.has_midi ?? false;
  const stoppedMs    = state.stopResult?.duration_ms ?? 0;

  const handlePlayPause = () => {
    if (playback.isPlaying) playback.pause();
    else playback.play();
  };

  const handleReset = () => {
    playback.pause();
    reset();
  };

  return (
    <div className="app">
      <StatusBar
        status={state.status}
        recordingMs={recordingMs}
        stoppedDurationMs={stoppedMs}
        isSaving={state.isSaving}
      />

      <aside className="sidebar">
        <AudioDeviceSelector
          selectedId={state.selectedAudioDevice}
          onChange={setAudioDevice}
          disabled={devicesBusy}
        />
        <MidiDeviceSelector
          selectedId={state.selectedMidiDevice}
          onChange={setMidiDevice}
          disabled={devicesBusy}
        />
        <TransportControls
          status={state.status}
          isPlaying={playback.isPlaying}
          isSaving={state.isSaving}
          hasMidi={hasMidi}
          onRecord={record}
          onStop={stop}
          onPlayPause={handlePlayPause}
          onSave={save}
          onReset={handleReset}
        />
      </aside>

      <main className="main">
        <div className="viz-panel">
          {state.status === 'Idle' && (
            <div className="idle-placeholder">
              <div className="idle-icon">⏺</div>
              <div className="idle-text">Select devices and press Record to begin</div>
            </div>
          )}

          {state.status === 'Recording' && (
            <div className="live-viz">
              <div className="viz-row-label">Live Input</div>
              <LiveWaveform audioLevel={audioLevel} />
              <LevelMeter audioLevel={audioLevel} />
              <MidiKeyboard activeNotes={activeNotes} />
            </div>
          )}

          {state.status === 'Stopped' && (
            <div className="playback-viz">
              <div className="viz-row-label">
                Recording — {formatDuration(stoppedMs / 1000)}
                {hasMidi && (
                  <span style={{ marginLeft: 8, color: 'var(--accent-dim)' }}>+ MIDI</span>
                )}
              </div>
              <PlaybackWaveform waveformData={waveformData} playback={playback} />
              <div className="playback-controls">
                <span className="playback-time">
                  {formatDuration(playback.currentTime)} / {formatDuration(playback.duration)}
                </span>
                <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                  Click waveform to seek
                </span>
              </div>
              <MidiKeyboard activeNotes={activeNotes} />
            </div>
          )}
        </div>

        {state.error && (
          <div className="error-toast">
            <span style={{ flex: 1 }}>{state.error}</span>
            <button className="error-close" onClick={clearError}>✕</button>
          </div>
        )}
      </main>
    </div>
  );
}
