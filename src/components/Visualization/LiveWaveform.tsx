import { useEffect, useRef } from 'react';

const HISTORY = 400;
const AMP_BOOST = 2;

interface Props {
  audioLevel: number;
}

export function LiveWaveform({ audioLevel }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef(new Float32Array(HISTORY));
  const idxRef     = useRef(0);
  const levelRef   = useRef(audioLevel);

  // Keep levelRef in sync
  useEffect(() => {
    levelRef.current = audioLevel;
  }, [audioLevel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let raf = 0;
    let lastPush = 0;

    const draw = (ts: number) => {
      // Push new level at ~60Hz
      if (ts - lastPush > 16) {
        historyRef.current[idxRef.current % HISTORY] = levelRef.current;
        idxRef.current++;
        lastPush = ts;
      }

      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) { raf = requestAnimationFrame(draw); return; }

      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(rect.width * dpr)) {
        canvas.width  = Math.round(rect.width  * dpr);
        canvas.height = Math.round(rect.height * dpr);
      }

      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const W = rect.width;
      const H = rect.height;
      const cy = H / 2;

      // Background
      ctx.fillStyle = '#191d28';
      ctx.fillRect(0, 0, W, H);

      // Center line
      ctx.strokeStyle = 'rgba(0,212,200,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, cy); ctx.lineTo(W, cy);
      ctx.stroke();

      const segW = W / HISTORY;
      const cur  = idxRef.current;

      // Glow pass (upper mirror, dim)
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0,212,200,0.18)';
      ctx.lineWidth = 1;
      for (let i = 0; i < HISTORY; i++) {
        const h = Math.min(historyRef.current[(cur - HISTORY + i + HISTORY * 10) % HISTORY] * AMP_BOOST, 1);
        const x = i * segW;
        const y = cy + h * (cy - 6);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Main waveform (upper)
      ctx.beginPath();
      ctx.strokeStyle = '#00d4c8';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#00d4c8';
      ctx.shadowBlur = 6;
      for (let i = 0; i < HISTORY; i++) {
        const h = Math.min(historyRef.current[(cur - HISTORY + i + HISTORY * 10) % HISTORY] * AMP_BOOST, 1);
        const x = i * segW;
        const y = cy - h * (cy - 6);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Mirror (lower)
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0,212,200,0.35)';
      ctx.lineWidth = 1;
      for (let i = 0; i < HISTORY; i++) {
        const h = Math.min(historyRef.current[(cur - HISTORY + i + HISTORY * 10) % HISTORY] * AMP_BOOST, 1);
        const x = i * segW;
        const y = cy + h * (cy - 6);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="waveform-canvas-wrap">
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}
