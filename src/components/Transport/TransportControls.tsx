import type { AppStatus } from '../../types';

interface Props {
  status: AppStatus;
  isPlaying: boolean;
  isSaving: boolean;
  hasMidi: boolean;
  onRecord: () => void;
  onStop: () => void;
  onPlayPause: () => void;
  onSave: () => void;
  onReset: () => void;
}

export function TransportControls({
  status, isPlaying, isSaving, hasMidi,
  onRecord, onStop, onPlayPause, onSave, onReset,
}: Props) {
  const isRecording = status === 'Recording';
  const isStopped   = status === 'Stopped';

  return (
    <div className="sidebar-section" style={{ gap: 0 }}>
      <div className="section-label">Actions</div>
      <div className="transport">

        <button
          className={`transport-btn record${isRecording ? ' active' : ''}`}
          onClick={isRecording ? undefined : onRecord}
          disabled={isRecording}
          title={isRecording ? 'Currently recording…' : 'Start recording'}
        >
          <span className="transport-btn-icon">{isRecording ? '●' : '⏺'}</span>
          {isRecording ? 'Recording…' : 'Record'}
        </button>

        <button
          className="transport-btn stop"
          onClick={onStop}
          disabled={!isRecording}
          title="Stop recording"
        >
          <span className="transport-btn-icon">⏹</span>
          Stop
        </button>

        <div className="transport-divider" />

        <button
          className="transport-btn play"
          onClick={onPlayPause}
          disabled={!isStopped}
          title={isPlaying ? 'Pause playback' : 'Play recording'}
        >
          <span className="transport-btn-icon">{isPlaying ? '⏸' : '▶'}</span>
          {isPlaying ? 'Pause' : 'Play'}
        </button>

        <button
          className="transport-btn save"
          onClick={onSave}
          disabled={!isStopped || isSaving}
          title={hasMidi ? 'Save WAV + MIDI files' : 'Save WAV file'}
        >
          <span className="transport-btn-icon">↓</span>
          {isSaving ? 'Saving…' : `Save${hasMidi ? ' (WAV+MIDI)' : ' WAV'}`}
        </button>

        {isStopped && (
          <>
            <div className="transport-divider" />
            <button
              className="transport-btn"
              onClick={onReset}
              title="Clear recording and start over"
            >
              <span className="transport-btn-icon">↺</span>
              New Recording
            </button>
          </>
        )}
      </div>
    </div>
  );
}
