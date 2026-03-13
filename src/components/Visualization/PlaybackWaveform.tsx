import { useEffect, useRef } from 'react';
import type { AudioPlayback } from '../../hooks/useAudioPlayback';

interface Props {
  waveformData: number[];
  playback: AudioPlayback;
}

export function PlaybackWaveform({ waveformData, playback }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { currentTimeRef, duration, seek } = playback;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || waveformData.length === 0) return;

    let raf = 0;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) { raf = requestAnimationFrame(draw); return; }

      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(rect.width * dpr)) {
        canvas.width  = Math.round(rect.width  * dpr);
        canvas.height = Math.round(rect.height * dpr);
      }

      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const W  = rect.width;
      const H  = rect.height;
      const cy = H / 2;

      ctx.fillStyle = '#191d28';
      ctx.fillRect(0, 0, W, H);

      const n     = waveformData.length;
      const barW  = W / n;
      const prog  = duration > 0 ? currentTimeRef.current / duration : 0;
      const playedBars = Math.floor(prog * n);

      for (let i = 0; i < n; i++) {
        const amp  = waveformData[i];
        const h    = Math.max(2, amp * (cy - 4));
        const x    = i * barW;
        const past = i <= playedBars;

        ctx.fillStyle = past
          ? 'rgba(0,212,200,0.9)'
          : 'rgba(0,212,200,0.2)';
        // Upper bar
        ctx.fillRect(x, cy - h, Math.max(barW - 0.8, 0.5), h);
        // Lower mirror
        ctx.fillStyle = past
          ? 'rgba(0,212,200,0.45)'
          : 'rgba(0,212,200,0.08)';
        ctx.fillRect(x, cy, Math.max(barW - 0.8, 0.5), h);
      }

      // Playback cursor
      if (duration > 0) {
        const cx = prog * W;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#00d4c8';
        ctx.shadowBlur  = 10;
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, H);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Cursor head
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(cx, 8, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Center axis line
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, cy); ctx.lineTo(W, cy);
      ctx.stroke();

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [waveformData, duration, currentTimeRef]);

  return (
    <div className="playback-waveform-wrap" onClick={(e: React.MouseEvent<HTMLDivElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || duration === 0) return;
      const rect = canvas.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      seek(ratio * duration);
    }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%', cursor: 'pointer' }}
      />
    </div>
  );
}
