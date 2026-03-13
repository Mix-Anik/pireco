import { useEffect, useRef } from 'react';
import { buildKeyboard, KEYBOARD_WIDTH } from '../../utils/midiNoteMap';

const WHITE_H = 68;
const BLACK_H = 42;
const KEYS = buildKeyboard();

interface Props {
  activeNotes: Set<number>;
}

export function MidiKeyboard({ activeNotes }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const activeRef    = useRef(activeNotes);
  activeRef.current  = activeNotes;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let raf = 0;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) { raf = requestAnimationFrame(draw); return; }

      const dpr   = window.devicePixelRatio || 1;
      const scale = rect.width / KEYBOARD_WIDTH; // responsive scale

      if (canvas.width !== Math.round(rect.width * dpr)) {
        canvas.width  = Math.round(rect.width  * dpr);
        canvas.height = Math.round(rect.height * dpr);
      }

      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr * scale, 0, 0, dpr, 0, 0);

      const H = rect.height / dpr; // logical height

      ctx.clearRect(0, 0, KEYBOARD_WIDTH, H);

      // Background
      ctx.fillStyle = '#191d28';
      ctx.fillRect(0, 0, KEYBOARD_WIDTH, H);

      const notes = activeRef.current;

      // Draw white keys first
      for (const key of KEYS) {
        if (key.isBlack) continue;
        const active = notes.has(key.midiNote);
        const kH = Math.min(WHITE_H, H - 2);

        if (active) {
          const grad = ctx.createLinearGradient(key.x, 2, key.x, kH + 2);
          grad.addColorStop(0, '#00ffe5');
          grad.addColorStop(1, '#008a82');
          ctx.fillStyle = grad;
          ctx.shadowColor = '#00d4c8';
          ctx.shadowBlur  = 8;
        } else {
          const grad = ctx.createLinearGradient(key.x, 2, key.x, kH + 2);
          grad.addColorStop(0, '#d8dce8');
          grad.addColorStop(1, '#b0b4c0');
          ctx.fillStyle = grad;
          ctx.shadowBlur = 0;
        }

        ctx.beginPath();
        ctx.roundRect(key.x + 0.5, 2, key.width - 1, kH, [0, 0, 3, 3]);
        ctx.fill();

        if (!active) {
          ctx.strokeStyle = 'rgba(0,0,0,0.25)';
          ctx.lineWidth   = 0.5;
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }

      // Draw black keys on top
      for (const key of KEYS) {
        if (!key.isBlack) continue;
        const active = notes.has(key.midiNote);
        const kH = Math.min(BLACK_H, H * 0.6);

        if (active) {
          const grad = ctx.createLinearGradient(key.x, 0, key.x, kH);
          grad.addColorStop(0, '#00a89e');
          grad.addColorStop(1, '#005552');
          ctx.fillStyle = grad;
          ctx.shadowColor = '#00d4c8';
          ctx.shadowBlur  = 6;
        } else {
          const grad = ctx.createLinearGradient(key.x, 0, key.x, kH);
          grad.addColorStop(0, '#252a38');
          grad.addColorStop(1, '#141720');
          ctx.fillStyle = grad;
          ctx.shadowBlur = 0;
        }

        ctx.beginPath();
        ctx.roundRect(key.x + 0.5, 0, key.width - 1, kH, [0, 0, 2, 2]);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="keyboard-wrap">
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}
