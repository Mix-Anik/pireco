import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { AppStatus } from '../types';

export function useWaveformData(status: AppStatus): number[] {
  const [samples, setSamples] = useState<number[]>([]);

  useEffect(() => {
    if (status !== 'Stopped') {
      setSamples([]);
      return;
    }

    invoke<number[]>('get_waveform_data', { targetPoints: 2000 })
      .then(setSamples)
      .catch((err) => console.error('[Pireco] get_waveform_data failed:', err));
  }, [status]);

  return samples;
}
