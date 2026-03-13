import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { MidiDevice } from '../../types';

interface Props {
  selectedId: number | null;
  onChange: (id: number | null) => void;
  disabled: boolean;
}

export function MidiDeviceSelector({ selectedId, onChange, disabled }: Props) {
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await invoke<MidiDevice[]>('get_midi_devices');
      setDevices(list);
      if (selectedId === null) {
        const savedName = localStorage.getItem('pireco_midi_device');
        if (savedName) {
          const saved = list.find((d) => d.name === savedName);
          if (saved) onChange(saved.id);
        }
      }
    } catch (err) {
      console.error('[Pireco] get_midi_devices failed:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedId, onChange]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="sidebar-section">
      <div className="section-label">MIDI Input <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional)</span></div>
      <div className="device-select-wrap">
        <select
          className="device-select"
          value={selectedId ?? ''}
          onChange={(e) => {
            if (e.target.value === '') {
              localStorage.removeItem('pireco_midi_device');
              onChange(null);
            } else {
              const id = Number(e.target.value);
              const name = devices.find((d) => d.id === id)?.name;
              if (name) localStorage.setItem('pireco_midi_device', name);
              onChange(id);
            }
          }}
          disabled={disabled || loading}
        >
          <option value="">— None —</option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
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
