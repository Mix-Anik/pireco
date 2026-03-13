import type { AppStatus } from '../types';
import { formatMs } from '../utils/waveformUtils';

interface Props {
  status: AppStatus;
  recordingMs: number;
  stoppedDurationMs: number;
  isSaving: boolean;
}

const STATUS_LABELS: Record<AppStatus, string> = {
  Idle:      'Standby',
  Recording: 'Recording',
  Stopped:   'Ready',
};

export function StatusBar({ status, recordingMs, stoppedDurationMs, isSaving }: Props) {
  const dotClass = status === 'Recording' ? 'recording' : status === 'Stopped' ? 'stopped' : '';

  return (
    <header className="header">
      <div className="header-logo">
        <span className="header-logo-dot" />
        PIRECO
      </div>

      <div className="header-right">
        {isSaving && (
          <div className="saving-badge">
            <span>●</span> Saving…
          </div>
        )}

        <div className="header-status">
          <span className={`header-status-dot ${dotClass}`} />
          {STATUS_LABELS[status]}
        </div>

        <div className={`header-timer${status === 'Recording' ? ' recording' : ''}`}>
          {status === 'Recording'
            ? formatMs(recordingMs)
            : status === 'Stopped'
            ? formatMs(stoppedDurationMs)
            : '00:00.0'}
        </div>
      </div>
    </header>
  );
}
