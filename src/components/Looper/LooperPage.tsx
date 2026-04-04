import { useTauriEvents } from '../../hooks/useTauriEvents';
import { useLooperState } from '../../hooks/useLooperState';
import { AudioDeviceSelector } from '../DevicePanel/AudioDeviceSelector';
import { LooperControls } from './LooperControls';
import { LayerList } from './LayerList';
import { LoopPositionBar } from './LoopPositionBar';
import { OutputDeviceSelector } from './OutputDeviceSelector';
import { LiveWaveform } from '../Visualization/LiveWaveform';
import { LevelMeter } from '../Visualization/LevelMeter';

interface Props {
  looper: ReturnType<typeof useLooperState>;
}

export function LooperPage({ looper }: Props) {
  const { audioLevel } = useTauriEvents();

  const { state } = looper;
  const isActive = state.status !== 'Idle';
  const isLiveAudio =
    state.status === 'RecordingBase' || state.status === 'Overdubbing';

  return (
    <>
      <aside className="sidebar">
        <OutputDeviceSelector
          selectedIds={state.selectedOutputDevices}
          onChange={looper.setOutputDevices}
          disabled={isActive}
        />
        <AudioDeviceSelector
          selectedId={state.selectedInputDevice}
          onChange={looper.setInputDevice}
          disabled={isActive}
          storageKey="pireco_looper_input"
        />
        <LooperControls
          status={state.status}
          overdubOffsetMs={state.overdubOffsetMs}
          onOverdubOffsetChange={looper.setOverdubOffset}
          onStartRecord={looper.startRecord}
          onStopAndLoop={looper.stopAndLoop}
          onStartOverdub={looper.startOverdub}
          onStopOverdub={looper.stopOverdub}
          onStopAll={looper.stopAll}
          onPause={looper.pause}
          onResume={looper.resume}
        />
      </aside>

      <main className="main">
        <div className="viz-panel">
          {/* Loop position progress bar */}
          <LoopPositionBar
            posMs={state.playbackPosMs}
            durationMs={state.loopDurationMs}
            status={state.status}
          />

          {/* Live waveform + level meter during recording */}
          {isLiveAudio && (
            <div className="live-viz">
              <div className="viz-label">
                {state.status === 'RecordingBase' ? 'Recording loop…' : 'Overdubbing…'}
              </div>
              <LiveWaveform audioLevel={audioLevel} />
              <LevelMeter audioLevel={audioLevel} />
            </div>
          )}

          {/* Layer list */}
          <LayerList
            layers={state.layers}
            loopDurationMs={state.loopDurationMs}
            onToggleMute={looper.toggleMute}
            onDelete={looper.deleteLayer}
          />

          {/* Idle placeholder */}
          {state.status === 'Idle' && state.layers.length === 0 && (
            <div className="idle-placeholder">
              <div className="idle-icon">⟳</div>
              <div className="idle-text">
                Select devices and press <strong>Record Loop</strong> to get started
              </div>
            </div>
          )}

          {/* Error toast */}
          {state.error && (
            <div className="error-toast">
              <span>{state.error}</span>
              <button className="error-toast-close" onClick={looper.clearError}>✕</button>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
