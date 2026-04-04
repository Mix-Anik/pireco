import type { AppTab, LooperStatus } from '../types';

interface Props {
  activeTab: AppTab;
  onChange: (tab: AppTab) => void;
  looperStatus: LooperStatus;
}

export function TabBar({ activeTab, onChange, looperStatus }: Props) {
  const looperActive = looperStatus !== 'Idle';

  return (
    <nav className="tab-bar">
      <button
        className={`tab-btn${activeTab === 'recorder' ? ' active' : ''}`}
        onClick={() => onChange('recorder')}
      >
        Recorder
      </button>
      <button
        className={`tab-btn${activeTab === 'looper' ? ' active' : ''}`}
        onClick={() => onChange('looper')}
      >
        Looper
        {looperActive && <span className="tab-active-dot" />}
      </button>
    </nav>
  );
}
