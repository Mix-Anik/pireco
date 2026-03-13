import { useEffect, useRef } from 'react';

interface Props {
  audioLevel: number; // 0.0 – 1.0 smoothed RMS
}

const SEGMENTS = 32;
const PEAK_HOLD_FRAMES = 90; // ~1.5s at 60fps

export function LevelMeter({ audioLevel }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const peakRef     = useRef(0);
  const peakTTL     = useRef(0); // frames until peak decays
  const levelRef    = useRef(audioLevel);
  levelRef.current  = audioLevel;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let raf = 0;

    const draw = () => {
      const level = levelRef.current;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) { raf = requestAnimationFrame(draw); return; }

      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== rect.width * dpr) {
        canvas.width  = rect.width  * dpr;
        canvas.height = rect.height * dpr;
      }

      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const W = rect.width;
      const H = rect.height;

      ctx.clearRect(0, 0, W, H);

      const segW = W / SEGMENTS;
      const gap  = 1.5;
      const bW   = segW - gap;

      // Update peak hold
      if (level > peakRef.current) {
        peakRef.current = level;
        peakTTL.current = PEAK_HOLD_FRAMES;
      } else if (peakTTL.current > 0) {
        peakTTL.current--;
      } else {
        peakRef.current = Math.max(0, peakRef.current - 0.008);
      }

      // Convert linear RMS to dB, map -60dB..0dB → 0..1
      const toDb = (v: number) => v < 0.00001 ? 0 : Math.max(0, (20 * Math.log10(v) + 60) / 60);
      const activeSeg  = Math.round(toDb(level) * SEGMENTS);
      const peakSeg    = Math.min(Math.round(toDb(peakRef.current) * SEGMENTS), SEGMENTS - 1);

      for (let i = 0; i < SEGMENTS; i++) {
        const x  = i * segW + gap / 2;
        const yT = H * 0.15;
        const bH = H * 0.7;

        const isActive = i < activeSeg;
        const isPeak   = i === peakSeg && peakRef.current > 0.001;

        let color: string;
        if (i < SEGMENTS * 0.70) {
          color = isActive ? '#00d4c8' : 'rgba(0,212,200,0.08)';
        } else if (i < SEGMENTS * 0.86) {
          color = isActive ? '#ffb700' : 'rgba(255,183,0,0.08)';
        } else {
          color = isActive ? '#ff3b5c' : 'rgba(255,59,92,0.08)';
        }

        ctx.fillStyle = color;
        if (isActive) {
          ctx.shadowColor = color;
          ctx.shadowBlur  = isActive ? 4 : 0;
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.fillRect(x, yT, bW, bH);

        // Peak hold line
        if (isPeak) {
          ctx.fillStyle = peakRef.current > 0.86 ? '#ff3b5c' : '#fff';
          ctx.shadowColor = '#fff';
          ctx.shadowBlur  = 6;
          ctx.fillRect(x, yT - 2, bW, 2);
          ctx.shadowBlur = 0;
        }
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="level-meter-wrap">
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}
