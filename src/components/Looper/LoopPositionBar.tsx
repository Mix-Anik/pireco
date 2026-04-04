import type { LooperStatus } from '../../types';

interface Props {
  posMs: number;
  durationMs: number;
  status: LooperStatus;
}

export function LoopPositionBar({ posMs, durationMs, status }: Props) {
  if (status !== 'Looping' && status !== 'WaitingForOverdub' && status !== 'Overdubbing') return null;
  if (durationMs === 0) return null;

  const pct = Math.min((posMs / durationMs) * 100, 100);

  return (
    <div className="loop-position-bar-wrap">
      <div className="loop-position-bar-track">
        <div
          className="loop-position-bar-fill"
          style={{ width: `${pct}%` }}
        />
        <div
          className="loop-position-bar-head"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="loop-position-label">
        <span>{formatMs(posMs)}</span>
        <span>{formatMs(durationMs)}</span>
      </div>
    </div>
  );
}

function formatMs(ms: number): string {
  const totalSec = ms / 1000;
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  const tenths = Math.floor((ms % 1000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${tenths}`;
}
