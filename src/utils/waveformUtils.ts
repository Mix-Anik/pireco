/** Format seconds as MM:SS.m */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`;
}

/** Format milliseconds as MM:SS */
export function formatMs(ms: number): string {
  return formatDuration(ms / 1000);
}

/**
 * Set canvas logical size to match its CSS size × device pixel ratio,
 * then scale the context so all drawing uses CSS pixels.
 */
export function setupHiDpiCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  return ctx;
}
