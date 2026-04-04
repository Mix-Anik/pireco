import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { AudioOutputDevice } from '../../types';

interface Props {
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  disabled: boolean;
}

export function OutputDeviceSelector({ selectedIds, onChange, disabled }: Props) {
  const [devices, setDevices] = useState<AudioOutputDevice[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await invoke<AudioOutputDevice[]>('get_audio_output_devices');
      setDevices(list);

      // Restore saved selection by device name (IDs can change between launches).
      if (selectedIds.length === 0 && list.length > 0) {
        const saved = localStorage.getItem('pireco_looper_outputs');
        const savedNames: string[] = saved ? JSON.parse(saved) : [];
        const restoredIds = savedNames
          .map((name) => list.find((d) => d.name === name)?.id)
          .filter((id): id is number => id !== undefined);

        if (restoredIds.length > 0) {
          onChange(restoredIds);
        } else {
          // First launch: auto-select first device.
          onChange([list[0].id]);
        }
      }
    } catch (err) {
      console.error('[Pireco] get_audio_output_devices failed:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedIds.length, onChange]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: number) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    // Persist by name so IDs survive device reconnects.
    const names = next.map((i) => devices.find((d) => d.id === i)?.name).filter(Boolean);
    localStorage.setItem('pireco_looper_outputs', JSON.stringify(names));
    onChange(next);
  };

  return (
    <div className="sidebar-section">
      <div className="section-label">Output Devices</div>

      {loading ? (
        <div className="device-loading">Loading…</div>
      ) : devices.length === 0 ? (
        <div className="device-loading">No output devices found</div>
      ) : (
        <div className="output-device-list">
          {devices.map((d) => {
            const checked = selectedIds.includes(d.id);
            return (
              <label
                key={d.id}
                className={`output-device-item${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => !disabled && toggle(d.id)}
                  disabled={disabled}
                />
                <span className="output-device-name">{d.name}</span>
              </label>
            );
          })}
        </div>
      )}

      <button
        className="device-refresh-btn"
        onClick={load}
        disabled={disabled || loading}
      >
        ↻ Refresh
      </button>
    </div>
  );
}
