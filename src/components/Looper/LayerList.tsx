import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { LayerSnapshot } from '../../types';
import { setupHiDpiCanvas } from '../../utils/waveformUtils';

interface LayerRowProps {
  layer: LayerSnapshot;
  index: number;
  loopDurationMs: number;
  onToggleMute: (id: number) => void;
  onDelete: (id: number) => void;
}

function LayerRow({ layer, index, loopDurationMs, onToggleMute, onDelete }: LayerRowProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [waveform, setWaveform] = useState<number[]>([]);

  useEffect(() => {
    invoke<number[]>('looper_get_layer_waveform', {
      layerId: layer.id,
      targetPoints: 120,
    })
      .then(setWaveform)
      .catch(() => {});
  }, [layer.id]);

  // Draw waveform thumbnail
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || waveform.length === 0) return;
    const ctx = setupHiDpiCanvas(canvas);
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const barW = w / waveform.length;
    const mid = h / 2;
    const color = layer.muted
      ? 'rgba(0,212,200,0.2)'
      : 'rgba(0,212,200,0.8)';

    // Normalize to the local peak so quiet recordings still look full.
    const peak = Math.max(...waveform, 0.001);

    ctx.fillStyle = color;
    waveform.forEach((amp, i) => {
      const barH = Math.max(1, (amp / peak) * h * 0.9);
      ctx.fillRect(i * barW, mid - barH / 2, Math.max(1, barW - 0.5), barH);
    });
  }, [waveform, layer.muted]);

  const durationSec = loopDurationMs / 1000;
  const m = Math.floor(durationSec / 60);
  const s = (durationSec % 60).toFixed(1);
  const durationLabel = `${m}:${String(Math.floor(Number(s))).padStart(2, '0')}.${s.split('.')[1]}`;

  return (
    <div className={`layer-row${layer.muted ? ' muted' : ''}`}>
      <span className="layer-index">{index + 1}</span>
      <div className="layer-waveform-wrap">
        <canvas ref={canvasRef} className="layer-waveform-canvas" />
      </div>
      <span className="layer-duration">{durationLabel}</span>
      <button
        className={`layer-mute-btn${layer.muted ? ' active' : ''}`}
        onClick={() => onToggleMute(layer.id)}
        title={layer.muted ? 'Unmute layer' : 'Mute layer'}
      >
        {layer.muted ? 'M' : 'M'}
      </button>
      <button
        className="layer-delete-btn"
        onClick={() => onDelete(layer.id)}
        title="Delete layer"
      >
        ✕
      </button>
    </div>
  );
}

interface Props {
  layers: LayerSnapshot[];
  loopDurationMs: number;
  onToggleMute: (id: number) => void;
  onDelete: (id: number) => void;
}

export function LayerList({ layers, loopDurationMs, onToggleMute, onDelete }: Props) {
  if (layers.length === 0) return null;

  return (
    <div className="layer-list">
      <div className="section-label" style={{ marginBottom: 8 }}>Layers</div>
      {layers.map((layer, i) => (
        <LayerRow
          key={layer.id}
          layer={layer}
          index={i}
          loopDurationMs={loopDurationMs}
          onToggleMute={onToggleMute}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
