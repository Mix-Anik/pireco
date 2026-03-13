import { useCallback, useEffect, useRef, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';

export interface AudioPlayback {
  play: (fromTime?: number) => void;
  pause: () => void;
  seek: (time: number) => void;
  isPlaying: boolean;
  currentTime: number;
  currentTimeRef: React.MutableRefObject<number>;
  duration: number;
  analyserNode: AnalyserNode | null;
}

export function useAudioPlayback(wavPath: string | null): AudioPlayback {
  const ctxRef      = useRef<AudioContext | null>(null);
  const bufferRef   = useRef<AudioBuffer | null>(null);
  const sourceRef   = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const startCtxRef = useRef(0);  // AudioContext.currentTime when play() was called
  const offsetRef   = useRef(0);  // playback position offset within the buffer
  const rafRef      = useRef(0);

  const [isPlaying, setIsPlaying]   = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const currentTimeRef = useRef(0);
  const [duration, setDuration]     = useState(0);

  // Load WAV when wavPath changes
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    currentTimeRef.current = 0;
    setDuration(0);
    offsetRef.current = 0;
    cancelAnimationFrame(rafRef.current);

    if (!wavPath) return;

    let cancelled = false;

    const load = async () => {
      try {
        const url = convertFileSrc(wavPath);
        const res = await fetch(url);
        if (cancelled) return;
        const arrayBuf = await res.arrayBuffer();
        if (cancelled) return;

        // Close old context
        await ctxRef.current?.close();
        const ctx = new AudioContext();
        ctxRef.current = ctx;

        const decoded = await ctx.decodeAudioData(arrayBuf);
        if (cancelled) return;

        bufferRef.current = decoded;
        setDuration(decoded.duration);
      } catch (err) {
        console.error('[Pireco] Failed to load audio for playback:', err);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [wavPath]);

  const stopSource = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch { /* already stopped */ }
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
  }, []);

  const play = useCallback((fromTime?: number) => {
    const ctx    = ctxRef.current;
    const buffer = bufferRef.current;
    if (!ctx || !buffer) return;

    stopSource();

    const offset = fromTime !== undefined ? fromTime : offsetRef.current;
    offsetRef.current = offset;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyserRef.current = analyser;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(analyser);
    analyser.connect(ctx.destination);

    startCtxRef.current = ctx.currentTime;
    source.start(0, offset);
    sourceRef.current = source;
    setIsPlaying(true);

    source.onended = () => {
      if (sourceRef.current !== source) return; // superseded
      cancelAnimationFrame(rafRef.current);
      sourceRef.current = null;
      setIsPlaying(false);
      offsetRef.current = 0;
      setCurrentTime(0);
      currentTimeRef.current = 0;
    };

    const tick = () => {
      if (!ctxRef.current) return;
      const elapsed = ctxRef.current.currentTime - startCtxRef.current;
      const t = Math.min(offset + elapsed, buffer.duration);
      setCurrentTime(t);
      currentTimeRef.current = t;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stopSource]);

  const pause = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || !sourceRef.current) return;
    const elapsed = ctx.currentTime - startCtxRef.current;
    offsetRef.current = Math.min(offsetRef.current + elapsed, bufferRef.current?.duration ?? 0);
    stopSource();
    setIsPlaying(false);
  }, [stopSource]);

  const seek = useCallback((time: number) => {
    offsetRef.current = time;
    setCurrentTime(time);
    currentTimeRef.current = time;
    if (isPlaying) {
      play(time);
    }
  }, [isPlaying, play]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      stopSource();
      ctxRef.current?.close();
    };
  }, [stopSource]);

  return {
    play,
    pause,
    seek,
    isPlaying,
    currentTime,
    currentTimeRef,
    duration,
    analyserNode: analyserRef.current,
  };
}
