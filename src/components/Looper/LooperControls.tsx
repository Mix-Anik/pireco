import { useRef, useCallback, useEffect } from 'react';
import type { LooperStatus } from '../../types';

interface Props {
  status: LooperStatus;
  overdubOffsetMs: number;
  onOverdubOffsetChange: (ms: number) => void;
  onStartRecord: () => void;
  onStopAndLoop: () => void;
  onStartOverdub: () => void;
  onStopOverdub: () => void;
  onStopAll: () => void;
  onPause: () => void;
  onResume: () => void;
}

export function LooperControls({
  status,
  overdubOffsetMs,
  onOverdubOffsetChange,
  onStartRecord,
  onStopAndLoop,
  onStartOverdub,
  onStopOverdub,
  onStopAll,
  onPause,
  onResume,
}: Props) {
  const isIdle = status === 'Idle';
  const isRecordingBase = status === 'RecordingBase';
  const isLooping = status === 'Looping';
  const isPaused = status === 'Paused';
  const isWaiting = status === 'WaitingForOverdub';
  const isOverdubbing = status === 'Overdubbing';
  const isActive = !isIdle;

  const holdInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const offsetRef = useRef(overdubOffsetMs);
  useEffect(() => { offsetRef.current = overdubOffsetMs; }, [overdubOffsetMs]);

  const startHold = useCallback((delta: number) => {
    // Fire once immediately, then repeat after 400ms delay at 100ms rate
    onOverdubOffsetChange(Math.max(-300, Math.min(300, offsetRef.current + delta)));
    const timeout = setTimeout(() => {
      holdInterval.current = setInterval(() => {
        onOverdubOffsetChange(Math.max(-300, Math.min(300, offsetRef.current + delta)));
      }, 80);
    }, 400);
    holdInterval.current = timeout as unknown as ReturnType<typeof setInterval>;
  }, [onOverdubOffsetChange]);

  const stopHold = useCallback(() => {
    if (holdInterval.current !== null) {
      clearTimeout(holdInterval.current);
      clearInterval(holdInterval.current);
      holdInterval.current = null;
    }
  }, []);

  return (
    <div className="sidebar-section" style={{ gap: 0 }}>
      <div className="section-label">Actions</div>
      <div className="transport">

        {/* Record base loop */}
        <button
          className="transport-btn record"
          onClick={onStartRecord}
          disabled={!isIdle}
          title="Record the base loop"
        >
          <span className="transport-btn-icon">⏺</span>
          Record Loop
        </button>

        {/* Stop base recording → start looping */}
        {isRecordingBase && (
          <button
            className="transport-btn stop"
            onClick={onStopAndLoop}
            title="Stop recording and start looping"
          >
            <span className="transport-btn-icon">⟳</span>
            Set Loop
          </button>
        )}

        {/* Pause / Resume */}
        {isLooping && (
          <button
            className="transport-btn"
            onClick={onPause}
            title="Pause loop playback"
          >
            <span className="transport-btn-icon">⏸</span>
            Pause
          </button>
        )}
        {isPaused && (
          <button
            className="transport-btn play"
            onClick={onResume}
            title="Resume loop playback"
          >
            <span className="transport-btn-icon">▶</span>
            Resume
          </button>
        )}

        {/* Overdub controls — shown while looping, waiting, or overdubbing */}
        {(isLooping || isWaiting || isOverdubbing) && (
          <>
            <div className="transport-divider" />
            {isLooping && (
              <button
                className="transport-btn play"
                onClick={onStartOverdub}
                title="Record a new layer on top of the loop"
              >
                <span className="transport-btn-icon">⊕</span>
                Overdub
              </button>
            )}
            {isWaiting && (
              <div className="overdub-waiting">
                <span className="overdub-waiting-dot" />
                Waiting for loop start…
              </div>
            )}
            {isOverdubbing && (
              <button
                className="transport-btn record active"
                onClick={onStopOverdub}
                title="Finish this overdub layer"
              >
                <span className="transport-btn-icon">⏹</span>
                Done
              </button>
            )}
          </>
        )}

        {/* Stop all — shown whenever the looper is active */}
        {isActive && (
          <>
            <div className="transport-divider" />
            <button
              className="transport-btn stop"
              onClick={onStopAll}
              title="Stop looper and clear all layers"
            >
              <span className="transport-btn-icon">■</span>
              Stop All
            </button>
          </>
        )}
      </div>

      {/* Overdub offset — always visible so user can set before overdubbing */}
      <div className="overdub-offset-wrap">
        <div className="overdub-offset-header">
          <span className="overdub-offset-label">Overdub offset</span>
          <span className="overdub-offset-value">
            {overdubOffsetMs > 0 ? '+' : ''}{overdubOffsetMs} ms
          </span>
        </div>
        <div className="overdub-offset-slider-row">
          <button
            className="overdub-offset-step"
            onMouseDown={() => startHold(-1)}
            onMouseUp={stopHold}
            onMouseLeave={stopHold}
          >−</button>
          <input
            type="range"
            className="overdub-offset-slider"
            min={-300}
            max={300}
            step={1}
            value={overdubOffsetMs}
            onChange={(e) => onOverdubOffsetChange(Number(e.target.value))}
            title="Shift overdub layers in time to compensate for audio latency"
          />
          <button
            className="overdub-offset-step"
            onMouseDown={() => startHold(1)}
            onMouseUp={stopHold}
            onMouseLeave={stopHold}
          >+</button>
        </div>
        <div className="overdub-offset-ticks">
          <span>-300</span>
          <span>0</span>
          <span>+300</span>
        </div>
        <button
          className="overdub-offset-reset"
          style={{ visibility: overdubOffsetMs !== 0 ? 'visible' : 'hidden' }}
          onClick={() => onOverdubOffsetChange(0)}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
