import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { AudioDevice } from '../../types';

interface Props {
  selectedId: number | null;
  onChange: (id: number) => void;
  disabled: boolean;
}

export function AudioDeviceSelector({ selectedId, onChange, disabled }: Props) {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await invoke<AudioDevice[]>('get_audio_devices');
      setDevices(list);
      if (selectedId === null) {
        const savedName = localStorage.getItem('pireco_audio_device');
        const saved = savedName ? list.find((d) => d.name === savedName) : null;
        const def = saved ?? list.find((d) => d.is_default) ?? list[0];
        if (def) onChange(def.id);
      }
    } catch (err) {
      console.error('[Pireco] get_audio_devices failed:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedId, onChange]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="sidebar-section">
      <div className="section-label">Audio Input</div>
      <div className="device-select-wrap">
        <select
          className="device-select"
          value={selectedId ?? ''}
          onChange={(e) => {
            const id = Number(e.target.value);
            const name = devices.find((d) => d.id === id)?.name;
            if (name) localStorage.setItem('pireco_audio_device', name);
            onChange(id);
          }}
          disabled={disabled || loading}
        >
          {devices.length === 0 && (
            <option value="">— No devices found —</option>
          )}
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}{d.is_default ? ' ★' : ''}
            </option>
          ))}
        </select>
        <span className="device-select-arrow">▾</span>
      </div>
      <button className="device-refresh-btn" onClick={load} disabled={disabled}>
        ↻ Refresh
      </button>
    </div>
  );
}
